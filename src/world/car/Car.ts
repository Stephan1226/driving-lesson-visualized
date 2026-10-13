import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { MAT, paint, lampMat } from '../materials';
import { Wheel, TIRE_R } from './Wheel';
import { blinkOn, textTexture, canvasTexture, lerp } from '../../core/util';
import {
  buildBody, sidePatch, capPatch, wrapLamp, sideLine, sidePt, yTop, yAt, halfW, fU, beltW, archY, cabinRing,
  XF, XR, COWL_X, DECK_X, AXLE_F, AXLE_R, ARCH_R, DOOR, GH, loft, roofY, cPillarPatch,
} from './Body';

/** 차량 로컬 좌표: +X 전방, +Y 위, +Z 오른쪽(조수석). 운전석은 왼쪽(-Z). */
export const CAR = {
  frontAxle: AXLE_F,
  rearAxle: AXLE_R,
  wheelbase: AXLE_F - AXLE_R,
  track: 0.8,
  halfLen: 2.37,
  halfWid: 0.92,
};

/** 사이드미러(펼친 상태) 충돌 박스 — 차량 로컬 중심 x, |z|, 반길이 */
export const MIRROR_BOX = { x: 0.93, z: 1.0, hx: 0.06, hz: 0.1 };

export interface LightState {
  low: boolean;
  high: boolean;
  flash: boolean;
  tail: boolean;
  brake: boolean;
  reverse: boolean;
  turnL: boolean;
  turnR: boolean;
  hazard: boolean;
  drl: boolean;
}
export const lightsOff = (): LightState => ({
  low: false, high: false, flash: false, tail: false, brake: false, reverse: false,
  turnL: false, turnR: false, hazard: false, drl: false,
});

export type WiperMode = 'off' | 'mist' | 'int' | 'lo' | 'hi';

export interface CarOptions {
  color: number;
  detailed?: boolean;
  doorRight?: boolean;
  plate?: string;
}

const WS_BASE = new THREE.Vector2(COWL_X, 0.975); // 앞유리 아래 끝
const WS_U = new THREE.Vector3(-0.863, 0.505, 0); // 앞유리 위쪽 방향
const WS_N = new THREE.Vector3(0.505, 0.863, 0); // 앞유리 바깥 법선

let grilleTex: THREE.CanvasTexture | null = null;
function grilleTexture() {
  if (grilleTex) return grilleTex;
  grilleTex = canvasTexture(512, 160, (c, w, h) => {
    c.fillStyle = '#0a0b0d';
    c.fillRect(0, 0, w, h);
    c.strokeStyle = '#3a3f47';
    c.lineWidth = 3;
    for (let y = -h; y < h * 2; y += 16) {
      c.beginPath();
      c.moveTo(0, y);
      c.lineTo(w, y + w * 0.25);
      c.stroke();
      c.beginPath();
      c.moveTo(0, y + w * 0.25);
      c.lineTo(w, y);
      c.stroke();
    }
    c.strokeStyle = '#8b939e';
    c.lineWidth = 6;
    c.strokeRect(3, 3, w - 6, h - 6);
  });
  return grilleTex;
}

export class Car {
  root = new THREE.Group();
  body = new THREE.Group();
  wheels: Wheel[] = [];
  hood = new THREE.Group();
  door?: THREE.Group;
  mirrors: { root: THREE.Group; fold: THREE.Group; pivot: THREE.Group; glass: THREE.Mesh; side: number }[] = [];
  wipers: THREE.Group[] = [];
  anchors: Record<string, THREE.Object3D> = {};
  lights: LightState = lightsOff();
  wiperMode: WiperMode = 'off';
  washer = 0;
  dipstick?: THREE.Group;
  onTick?: (on: boolean) => void;
  /** 깜빡이 위상 기준 시각 — 켜는 순간에 맞추면 첫 점멸이 바로 시작된다 */
  blinkT0 = 0;
  /** 사이드미러 접힘 (0 = 펼침, 1 = 접힘) */
  mirrorFold = 0;
  paintMat: THREE.MeshPhysicalMaterial;

  private shell: { mesh: THREE.Mesh; mat: THREE.Material | THREE.Material[] }[] = [];
  /** 차체 표면 장식(몰딩·램프·번호판 등) — 투시 모드에서 숨김 */
  private decor: THREE.Object3D[] = [];
  private mats = {
    low: lampMat(0xe7edf3, 0xfff3d8),
    high: lampMat(0xe7edf3, 0xeaf2ff),
    drl: lampMat(0xe7edf3, 0xffffff),
    tail: lampMat(0x5a0a0a, 0xff1a0a),
    brake: lampMat(0x5a0a0a, 0xff1a0a),
    turnL: lampMat(0x8a4a0c, 0xff4a00),
    turnR: lampMat(0x8a4a0c, 0xff4a00),
    reverse: lampMat(0xd8dde2, 0xffffff),
  };
  private spots: THREE.SpotLight[] = [];
  private beams: THREE.Mesh[] = [];
  private beamMat?: THREE.ShaderMaterial;
  private spray?: THREE.Points;
  private lastBlink = false;
  private wiperPhase = 0;
  private wiperAngle = 0;
  private wiperPause = 0;
  private mistLeft = 0;
  private hoodOpenK = 0;

  constructor(public opts: CarOptions) {
    const detailed = !!opts.detailed;
    this.paintMat = paint(opts.color);
    const paintInside = this.paintMat.clone();
    paintInside.side = THREE.DoubleSide;
    this.root.add(this.body);

    // ── 차체 ─────────────────────────────────────────────
    const B = buildBody(detailed, !!opts.doorRight);
    this.addShell(new THREE.Mesh(B.front, paintInside));
    this.addShell(new THREE.Mesh(B.middle, this.paintMat));
    this.addShell(new THREE.Mesh(B.rear, this.paintMat));
    const nose = new THREE.Mesh(B.nose, this.paintMat);
    const tail = new THREE.Mesh(B.tail, this.paintMat);
    this.addShell(nose);
    this.addShell(tail);
    this.addShell(new THREE.Mesh(B.trunk, this.paintMat));
    const glassMat = detailed ? MAT.glass : MAT.glass.clone();
    if (!detailed) glassMat.opacity = 0.9;
    this.addShell(new THREE.Mesh(B.cabin, [glassMat, this.paintMat, MAT.gloss]));
    for (const side of [-1, 1]) this.addShell(new THREE.Mesh(cPillarPatch(side), this.paintMat));

    // 보닛 (뒤쪽 끝을 축으로 열림)
    const hy = yTop(COWL_X);
    B.hood.translate(-COWL_X, -hy, 0);
    const hoodMesh = new THREE.Mesh(B.hood, paintInside);
    this.hood.position.set(COWL_X, hy, 0);
    this.hood.add(hoodMesh);
    this.body.add(this.hood);
    this.shell.push({ mesh: hoodMesh, mat: paintInside });
    hoodMesh.castShadow = true;

    // 유리와 차체 사이 벨트 몰딩, 사이드 스커트, 문틈, 손잡이
    for (const side of [-1, 1]) {
      const xs: number[] = [];
      for (let x = DECK_X; x <= COWL_X; x += 0.04) xs.push(x);
      xs.push(COWL_X);
      const ledge = loft(xs.map((x) => [
        new THREE.Vector3(x, yTop(x) + 0.001, halfW(x) * fU(1) * side),
        new THREE.Vector3(x, yTop(x) + 0.004, (beltW(x) - 0.004) * side),
      ]));
      this.body.add(new THREE.Mesh(ledge, MAT.gloss));
      this.body.add(new THREE.Mesh(sidePatch(-1.24, 0.98, 0.975, 1, side, 0.0025, 24, 1), MAT.chrome));
      this.body.add(new THREE.Mesh(sidePatch(-0.93, 0.95, 0, 0.1, side, 0.002, 16, 2), MAT.gloss));
      for (const x of [0.985, -0.38, -1.3]) {
        const yb = yAt(x, 0);
        const u0 = Math.max(0.05, (archY(x) + 0.012 - yb) / (yTop(x) - yb));
        this.body.add(new THREE.Mesh(sideLine(x, u0, 0.975, side), MAT.black));
      }
      for (const x of [0.22, -0.98]) {
        const p = sidePt(x, 0.855, side, false);
        const hnd = new THREE.Mesh(new RoundedBoxGeometry(0.15, 0.022, 0.02, 2, 0.008), MAT.chrome);
        hnd.position.copy(p).add(new THREE.Vector3(0, 0, side * 0.006));
        this.body.add(hnd);
      }
    }

    // 바퀴 하우스(검은 안쪽 커버)
    for (const ax of [AXLE_F, AXLE_R]) {
      for (const side of [-1, 1]) {
        const g = new THREE.CylinderGeometry(ARCH_R - 0.01, ARCH_R - 0.01, 0.34, 28, 1, true, Math.PI / 2, Math.PI);
        g.rotateX(Math.PI / 2);
        const m = new THREE.Mesh(g, MAT.wellLiner);
        m.position.set(ax, TIRE_R, side * 0.75);
        this.body.add(m);
      }
    }

    // ── 등화장치 ─────────────────────────────────────────
    const m = this.mats;
    for (const side of [-1, 1]) {
      const turn = side < 0 ? m.turnL : m.turnR;
      // 전조등: 하우징 → 렌즈 → 주간주행등 → 방향지시등
      this.body.add(new THREE.Mesh(wrapLamp(nose, 1, 2.05, 0.765, 0.955, 0.34, side, 0.002), MAT.lampHousing));
      const lens = new THREE.Mesh(wrapLamp(nose, 1, 2.13, 0.835, 0.905, 0.4, side, 0.0045), m.low);
      this.body.add(lens);
      this.body.add(new THREE.Mesh(wrapLamp(nose, 1, 2.09, 0.918, 0.942, 0.38, side, 0.005), m.drl));
      const fturn = new THREE.Mesh(wrapLamp(nose, 1, 2.16, 0.782, 0.82, 0.44, side, 0.005), turn);
      this.body.add(fturn);
      const proj = this.onCap(nose, 1, yAt(XF, 0.87), side * 0.6, 0.006);
      const pj = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.034, 0.012, 24), m.high);
      pj.position.copy(proj.p);
      pj.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), proj.n);
      this.body.add(pj);

      // 후미등: 하우징 → 브레이크·미등 렌즈 → 방향지시등(호박색) → 후진등
      this.body.add(new THREE.Mesh(wrapLamp(tail, -1, -2.07, 0.74, 0.945, 0.25, side, 0.002), MAT.tailHousing));
      this.body.add(new THREE.Mesh(wrapLamp(tail, -1, -2.1, 0.85, 0.93, 0.3, side, 0.0045), m.brake));
      const rturn = new THREE.Mesh(wrapLamp(tail, -1, -2.13, 0.755, 0.835, 0.3, side, 0.005), turn);
      this.body.add(rturn);
      const ry0 = yAt(XR, 0.66);
      const ry1 = yAt(XR, 0.7);
      this.body.add(new THREE.Mesh(capPatch(tail, -1, ry0, ry1, side > 0 ? 0.3 : -0.44, side > 0 ? 0.44 : -0.3, 0.004, 2, 4), m.reverse));

      const name = side < 0 ? 'L' : 'R';
      this.anchors['head' + name] = this.point(this.onCap(nose, 1, yAt(XF, 0.87), side * 0.55, 0.01).p);
      this.anchors['tail' + name] = this.point(this.onCap(tail, -1, yAt(XR, 0.89), side * 0.55, 0.01).p);
      this.anchors['turnF' + name] = this.point(sidePt(2.24, 0.8, side, false).add(new THREE.Vector3(0.02, 0, side * 0.01)));
      this.anchors['turnR' + name] = this.point(this.onCap(tail, -1, yAt(XR, 0.795), side * 0.6, 0.01).p);
    }
    // 가운데 라이트 바
    this.body.add(new THREE.Mesh(capPatch(tail, -1, yAt(XR, 0.88), yAt(XR, 0.905), -0.3, 0.3, 0.0045, 2, 10), m.tail));
    // 보조 제동등 (뒷유리 위)
    const hx = -1.07;
    const hmsl = new THREE.Mesh(new RoundedBoxGeometry(0.03, 0.018, 0.32, 2, 0.006), m.brake);
    hmsl.position.set(hx, roofY(hx) + 0.012, 0);
    hmsl.rotation.z = 0.5;
    this.body.add(hmsl);
    this.anchors.hmsl = this.point(new THREE.Vector3(hx, roofY(hx) + 0.03, 0));

    // 그릴, 공기흡입구, 번호판, 디퓨저, 머플러
    const gm = new THREE.MeshStandardMaterial({ map: grilleTexture(), roughness: 0.5, metalness: 0.4 });
    this.body.add(new THREE.Mesh(capPatch(nose, 1, yAt(XF, 0.43), yAt(XF, 0.66), -0.36, 0.36, 0.003, 4, 12), gm));
    this.body.add(new THREE.Mesh(capPatch(nose, 1, yAt(XF, 0.06), yAt(XF, 0.22), -0.58, 0.58, 0.003, 3, 14), MAT.gloss));
    const plateTex = textTexture(opts.plate ?? '12가 3456', { w: 512, h: 112, bg: '#f4f4ef', fg: '#1a1a1a', size: 74, radius: 10 });
    const plateMat = new THREE.MeshStandardMaterial({ map: plateTex, roughness: 0.5 });
    this.body.add(new THREE.Mesh(capPatch(nose, 1, yAt(XF, 0.08), yAt(XF, 0.08) + 0.11, -0.26, 0.26, 0.009, 2, 6), plateMat));
    this.body.add(new THREE.Mesh(capPatch(tail, -1, yAt(XR, 0.36), yAt(XR, 0.36) + 0.11, -0.26, 0.26, 0.006, 2, 6), plateMat));
    this.body.add(new THREE.Mesh(capPatch(tail, -1, yAt(XR, 0.0) + 0.01, yAt(XR, 0.13), -0.68, 0.68, 0.003, 2, 14), MAT.gloss));
    for (const side of [-1, 1]) {
      const ex = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.08, 20, 1, true), MAT.chrome);
      (ex.material as THREE.Material).side = THREE.DoubleSide;
      ex.rotation.z = Math.PI / 2;
      ex.position.set(XR + 0.03, 0.4, side * 0.48);
      this.body.add(ex);
    }

    // ── 사이드미러 (접힘 축 포함) ─────────────────────────
    for (const side of [-1, 1]) {
      const root = new THREE.Group();
      const base = sidePt(0.93, 0.99, side, false);
      root.position.copy(base);
      const foot = new THREE.Mesh(new RoundedBoxGeometry(0.13, 0.05, 0.05, 2, 0.015), MAT.gloss);
      foot.position.set(0, -0.005, side * 0.01);
      const fold = new THREE.Group();
      const stalk = new THREE.Mesh(new RoundedBoxGeometry(0.06, 0.035, 0.09, 2, 0.012), MAT.gloss);
      stalk.position.set(0, 0.0, side * 0.045);
      const housingGeo = new RoundedBoxGeometry(0.1, 0.105, 0.18, 4, 0.045);
      // 앞쪽이 둥글게 줄어드는 하우징
      const hp = housingGeo.getAttribute('position');
      for (let i = 0; i < hp.count; i++) {
        const x = hp.getX(i);
        if (x > 0) hp.setY(i, hp.getY(i) * (1 - x * 1.6));
      }
      housingGeo.computeVertexNormals();
      const housing = new THREE.Mesh(housingGeo, this.paintMat);
      housing.position.set(0.0, 0.04, side * 0.12);
      const rep = new THREE.Mesh(new RoundedBoxGeometry(0.014, 0.012, 0.11, 2, 0.005), side < 0 ? m.turnL : m.turnR);
      rep.position.set(0.045, 0.0, side * 0.13);
      const pivot = new THREE.Group();
      pivot.position.set(-0.051, 0.04, side * 0.12);
      const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.165, 0.088), new THREE.MeshStandardMaterial({ color: 0x9fb4c8, metalness: 1, roughness: 0.05 }));
      glass.rotation.y = -Math.PI / 2;
      pivot.add(glass);
      fold.add(stalk, housing, rep, pivot);
      root.add(foot, fold);
      this.body.add(root);
      this.shell.push({ mesh: housing, mat: this.paintMat });
      housing.castShadow = true;
      this.mirrors.push({ root, fold, pivot, glass, side });
      this.anchor(side < 0 ? 'mirrorL' : 'mirrorR', pivot, [-0.01, 0.07, 0]);
    }

    // ── 와이퍼 (앞유리 평면 위에서 회전) ─────────────────
    const basis = new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, -1), WS_U, WS_N);
    const wbase = new THREE.Vector3(WS_BASE.x, WS_BASE.y, 0).addScaledVector(WS_N, 0.035).addScaledVector(WS_U, 0.05);
    for (const [z, len] of [[0.02, 0.62], [0.64, 0.52]] as const) {
      const pivot = new THREE.Group();
      pivot.position.copy(wbase).setZ(z);
      pivot.quaternion.setFromRotationMatrix(basis);
      const arm = new THREE.Group();
      const a = new THREE.Mesh(new THREE.BoxGeometry(len, 0.014, 0.012), MAT.gloss);
      a.position.set(len / 2, 0, 0.014);
      const blade = new THREE.Mesh(new THREE.BoxGeometry(len * 0.9, 0.016, 0.012), MAT.trim);
      blade.position.set(len * 0.52, 0.012, 0.006);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.02, 0.03, 12), MAT.gloss);
      cap.rotation.x = Math.PI / 2;
      arm.add(a, blade, cap);
      pivot.add(arm);
      this.body.add(pivot);
      this.wipers.push(arm);
    }
    this.anchor('wiper', this.wipers[0], [0.45, 0.03, 0.02]);

    // ── 바퀴 ─────────────────────────────────────────────
    const wheelPos: [number, number, -1 | 1, boolean][] = [
      [CAR.frontAxle, -CAR.track, -1, true],
      [CAR.frontAxle, CAR.track, 1, true],
      [CAR.rearAxle, -CAR.track, -1, false],
      [CAR.rearAxle, CAR.track, 1, false],
    ];
    for (const [x, z, side, front] of wheelPos) {
      const w = new Wheel(side, front, detailed && x > 0 && side === -1);
      w.root.position.set(x, TIRE_R, z);
      this.root.add(w.root);
      this.wheels.push(w);
    }

    // 열리는 오른쪽 앞문 (옆 차 연출용)
    if (opts.doorRight) {
      const door = new THREE.Group();
      const hinge = sidePt(DOOR.x1, 0.5, 1, false);
      door.position.set(DOOR.x1, 0, hinge.z);
      const opening = new THREE.Mesh(sidePatch(DOOR.x0, DOOR.x1, 0.06, 0.985, 1, 0.0012, 16, 8), MAT.dash);
      this.body.add(opening);
      const skin = sidePatch(DOOR.x0, DOOR.x1, 0.06, 0.985, 1, 0.004, 16, 8);
      const xs: number[] = [];
      for (let x = DOOR.x0; x <= DOOR.x1; x += 0.04) xs.push(x);
      const win = loft(xs.map((x) => cabinRing(x).slice(0, GH.side + 1).map((p) => p.add(new THREE.Vector3(0, 0, 0.002)))));
      for (const g of [skin, win]) g.translate(-DOOR.x1, 0, -hinge.z);
      door.add(new THREE.Mesh(skin, this.paintMat), new THREE.Mesh(win, glassMat));
      this.root.add(door);
      this.door = door;
      this.anchor('doorEdge', door, [DOOR.x0 - DOOR.x1, 0.7, 0.03]);
    }

    // 바퀴·미러 이외의 차체 장식 수집 (body의 직속 메시 중 shell이 아닌 것)
    const shellSet = new Set(this.shell.map((x) => x.mesh));
    for (const o of [...this.body.children]) if ((o as THREE.Mesh).isMesh && !shellSet.has(o as THREE.Mesh)) this.decor.push(o);
    for (const mr of this.mirrors) this.decor.push(mr.root);

    if (detailed) this.buildDetails();

    this.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = o.castShadow || (o as THREE.Mesh).material !== glassMat;
        o.receiveShadow = true;
      }
    });
  }

  /** 끝 곡면 위 점과 법선 */
  private onCap(cap: THREE.Mesh, dir: 1 | -1, y: number, z: number, off: number) {
    const ray = new THREE.Raycaster(new THREE.Vector3(dir * 4, y, z), new THREE.Vector3(-dir, 0, 0));
    const hit = ray.intersectObject(cap, false)[0];
    const n = hit ? hit.face!.normal.clone() : new THREE.Vector3(dir, 0, 0);
    const p = hit ? hit.point.clone().addScaledVector(n, off) : new THREE.Vector3(dir > 0 ? XF : XR, y, z);
    return { p, n };
  }

  private point(p: THREE.Vector3) {
    const o = new THREE.Object3D();
    o.position.copy(p);
    this.body.add(o);
    return o;
  }

  private addShell(mesh: THREE.Mesh, cast = true) {
    mesh.castShadow = cast;
    mesh.receiveShadow = true;
    this.body.add(mesh);
    this.shell.push({ mesh, mat: mesh.material });
  }

  anchor(name: string, parent: THREE.Object3D, off: [number, number, number]) {
    const o = new THREE.Object3D();
    o.position.set(...off);
    parent.add(o);
    this.anchors[name] = o;
    return o;
  }

  /** 엔진룸·전조등 빔·워셔액 등 우리 차에만 필요한 디테일 */
  private buildDetails() {
    const bay = new THREE.Group();
    bay.position.y = -0.045;
    this.body.add(bay);
    const floor = new THREE.Mesh(new THREE.BoxGeometry(1.08, 0.02, 1.1), MAT.bayFloor);
    floor.position.set(1.7, 0.76, 0);
    const block = new THREE.Mesh(new RoundedBoxGeometry(0.5, 0.1, 0.62, 2, 0.03), MAT.engine);
    block.position.set(1.66, 0.82, 0.02);
    const cover = new THREE.Mesh(new RoundedBoxGeometry(0.38, 0.05, 0.46, 2, 0.02), MAT.engineCover);
    cover.position.set(1.63, 0.875, 0.02);
    const oilCap = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.025, 20), MAT.yellow);
    oilCap.position.set(1.7, 0.905, 0.16);
    bay.add(floor, block, cover, oilCap);
    this.anchor('oilCap', oilCap, [0, 0.02, 0]);

    // 엔진오일 게이지(딥스틱)
    const dip = new THREE.Group();
    dip.position.set(1.5, 0.86, -0.22);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.007, 8, 20), MAT.yellow);
    ring.position.y = 0.035;
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.32, 6), MAT.chrome);
    rod.position.y = -0.14;
    const oilFilm = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0045, 0.045, 6), new THREE.MeshStandardMaterial({ color: 0x8a5a12, roughness: 0.2, metalness: 0.3 }));
    oilFilm.position.y = -0.275;
    const markL = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.002, 0.014), MAT.black);
    markL.position.y = -0.29;
    const markF = markL.clone();
    markF.position.y = -0.245;
    dip.add(ring, rod, oilFilm, markL, markF);
    bay.add(dip);
    this.dipstick = dip;
    this.anchor('dipstick', dip, [0, 0.06, 0]);
    this.anchor('dipTip', dip, [0, -0.27, 0.01]);

    const res = (x: number, z: number, w: number, h: number, d: number, fluid: THREE.Material, capMat: THREE.Material, level = 0.7) => {
      const g = new THREE.Group();
      g.position.set(x, 0.785, z);
      const tank = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, 0.015), MAT.reservoir);
      tank.position.y = h / 2;
      const liquid = new THREE.Mesh(new THREE.BoxGeometry(w * 0.86, h * level, d * 0.86), fluid);
      liquid.position.y = (h * level) / 2 + 0.004;
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.025, 18), capMat);
      cap.position.set(0, h + 0.01, 0);
      g.add(liquid, tank, cap);
      bay.add(g);
      return g;
    };
    const cool = res(1.38, 0.55, 0.14, 0.11, 0.12, MAT.coolantFluid, MAT.black, 0.62);
    const wash = res(2.0, -0.58, 0.12, 0.07, 0.12, MAT.washerFluid, MAT.blueCap, 0.55);
    const bf = res(1.26, -0.56, 0.08, 0.08, 0.08, MAT.brakeFluid, MAT.yellow, 0.75);
    this.anchor('coolant', cool, [0, 0.14, 0]);
    this.anchor('washer', wash, [0, 0.1, 0]);
    this.anchor('brakeFluid', bf, [0, 0.11, 0]);
    const batt = new THREE.Mesh(new RoundedBoxGeometry(0.22, 0.1, 0.16, 2, 0.01), MAT.black);
    batt.position.set(1.92, 0.84, 0.48);
    bay.add(batt);
    this.anchor('battery', batt, [0, 0.07, 0]);

    // 바닥 기준점 (누유 확인)
    const under = new THREE.Object3D();
    under.position.set(1.55, 0.02, 0.1);
    this.root.add(under);
    this.anchors.under = under;

    // 전조등 스포트라이트 + 보이는 빔
    this.beamMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uOpacity: { value: 0 }, uColor: { value: new THREE.Color(0xfff1d6) } },
      vertexShader: `varying float vY; void main(){ vY = position.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform float uOpacity; uniform vec3 uColor; varying float vY;
        void main(){ float k = smoothstep(-4.5, 4.5, vY); gl_FragColor = vec4(uColor, uOpacity * k * k); }`,
      side: THREE.DoubleSide,
    });
    for (const side of [-1, 1]) {
      const sp = new THREE.SpotLight(0xfff4e0, 0, 40, 0.42, 0.55, 1.2);
      sp.position.set(2.32, 0.71, side * 0.6);
      sp.target.position.set(14, -0.6, side * 0.9);
      this.body.add(sp, sp.target);
      this.spots.push(sp);
      const cone = new THREE.Mesh(new THREE.ConeGeometry(1.5, 9, 24, 1, true), this.beamMat);
      cone.rotation.z = Math.PI / 2 - 0.06;
      cone.position.set(2.36 + 4.5, 0.71 - 0.25, side * 0.6);
      cone.visible = false;
      this.body.add(cone);
      this.beams.push(cone);
    }

    // 워셔액 분사 입자
    const N = 80;
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    this.spray = new THREE.Points(pg, new THREE.PointsMaterial({ color: 0x9fd4ff, size: 0.025, transparent: true, opacity: 0.85 }));
    this.spray.frustumCulled = false;
    this.spray.visible = false;
    this.body.add(this.spray);
  }

  // ── 상태 제어 ─────────────────────────────────────────
  setPose(x: number, z: number, heading: number) {
    this.root.position.set(x, 0, z);
    this.root.rotation.y = heading;
  }

  /** 앞바퀴 조향각(rad, + = 왼쪽) */
  setSteer(a: number) {
    this.wheels[0].root.rotation.y = a;
    this.wheels[1].root.rotation.y = a;
  }

  /** 주행 거리(m)에 맞춰 바퀴 굴림 */
  setRoll(dist: number) {
    for (const w of this.wheels) w.spin.rotation.z = (-dist / TIRE_R) * (w.side === -1 ? 1 : -1);
  }

  setHood(k: number) {
    this.hoodOpenK = k;
    this.hood.rotation.z = k * 0.95;
  }

  setDipstick(k: number) {
    if (!this.dipstick) return;
    this.dipstick.position.y = 0.86 + k * 0.36;
    this.dipstick.position.x = 1.5 - k * 0.06;
    this.dipstick.rotation.z = k * 0.5;
  }

  setDoor(k: number) {
    if (this.door) this.door.rotation.y = k * 1.05;
  }

  /** 사이드미러 접기 (0 = 펼침, 1 = 접힘) — 뒤쪽으로 돌아 유리창에 붙는다 */
  setMirrorFold(k: number) {
    this.mirrorFold = k;
    for (const mr of this.mirrors) mr.fold.rotation.y = mr.side * -k * 1.2;
  }

  /** 투명(유령) 차체 — 실내를 밖에서 보여줄 때 */
  setGhost(on: boolean) {
    for (const s of this.shell) s.mesh.material = on ? MAT.ghost : s.mat;
    for (const s of this.shell) s.mesh.castShadow = !on;
    for (const d of this.decor) d.visible = !on;
  }

  setShellVisible(v: boolean) {
    for (const s of this.shell) s.mesh.visible = v;
  }

  /** 바디 흔들림 (급정거·울컥) */
  setPitch(p: number) {
    this.body.rotation.z = p;
  }

  get hoodOpen() {
    return this.hoodOpenK;
  }

  update(dt: number, time: number, dusk: number) {
    const l = this.lights;
    const b = blinkOn(time - this.blinkT0);
    const left = l.hazard || l.turnL;
    const right = l.hazard || l.turnR;
    if ((left || right) && b !== this.lastBlink) this.onTick?.(b);
    this.lastBlink = b;
    const m = this.mats;
    const head = l.low || l.high || l.flash;
    m.low.emissiveIntensity = head ? 6 : 0.04;
    m.high.emissiveIntensity = l.high || l.flash ? 9 : head ? 2 : 0.04;
    m.drl.emissiveIntensity = l.drl || head ? 4 : 0.04;
    m.tail.emissiveIntensity = l.tail || head ? 2.5 : 0.06;
    m.brake.emissiveIntensity = l.brake ? 7 : l.tail || head ? 1.6 : 0.06;
    m.turnL.emissiveIntensity = left && b ? 3.2 : 0.05;
    m.turnR.emissiveIntensity = right && b ? 3.2 : 0.05;
    m.reverse.emissiveIntensity = l.reverse ? 5 : 0.04;

    const hi = l.high || l.flash;
    for (const [i, sp] of this.spots.entries()) {
      const side = i === 0 ? -1 : 1;
      sp.intensity = head ? (hi ? 120 : 60) * (0.15 + 0.85 * dusk) : 0;
      sp.angle = hi ? 0.32 : 0.42;
      sp.target.position.set(14, hi ? 0.6 : -1.2, side * (hi ? 0.6 : 1.2));
      sp.distance = hi ? 60 : 30;
    }
    if (this.beamMat) {
      const target = head ? (hi ? 0.2 : 0.11) * (0.25 + 0.75 * dusk) : 0;
      const u = this.beamMat.uniforms.uOpacity;
      u.value = lerp(u.value, target, 1 - Math.exp(-dt * 10));
      for (const c of this.beams) {
        c.visible = u.value > 0.003;
        c.scale.set(hi ? 0.75 : 1, hi ? 1.5 : 1, hi ? 0.75 : 1);
        c.position.x = 2.36 + 4.5 * (hi ? 1.5 : 1);
        c.rotation.z = Math.PI / 2 - (hi ? 0.0 : 0.07);
      }
    }
    this.updateWipers(dt);
  }

  /** 와이퍼 한 번 닦기(MIST) */
  mist() {
    this.mistLeft = 1;
  }

  private updateWipers(dt: number) {
    const mode = this.wiperMode;
    const continuous = mode === 'lo' || mode === 'hi' || this.washer > 0;
    const period = mode === 'hi' ? 0.7 : 1.2;
    if (this.wiperPhase === 0) {
      if (this.wiperPause > 0) this.wiperPause -= dt;
      if (continuous || this.mistLeft > 0 || (mode === 'int' && this.wiperPause <= 0)) this.wiperPhase = 1e-4;
    }
    if (this.wiperPhase > 0) {
      this.wiperPhase += dt / period;
      if (this.wiperPhase >= 1) {
        this.wiperPhase = 0;
        this.mistLeft = 0;
        if (mode === 'int') this.wiperPause = 1.6;
      }
    }
    this.wiperAngle = (1 - Math.cos(this.wiperPhase * Math.PI * 2)) / 2;
    for (const [i, w] of this.wipers.entries()) w.rotation.z = this.wiperAngle * (i === 0 ? 1.62 : 1.5);

    if (this.spray) {
      this.spray.visible = this.washer > 0;
      if (this.washer > 0) {
        const pos = this.spray.geometry.getAttribute('position') as THREE.BufferAttribute;
        const now = performance.now() / 1000;
        for (let i = 0; i < pos.count; i++) {
          const nozzle = i % 2 === 0 ? -0.32 : 0.3;
          const t = (now * 1.8 + i * 0.137) % 1;
          const x = 1.15 - t * 0.55;
          const y = 1.0 + t * 0.55 - t * t * 0.22;
          const z = nozzle + Math.sin(i * 12.9) * 0.07 * t;
          pos.setXYZ(i, x, y, z);
        }
        pos.needsUpdate = true;
      }
    }
  }

  /** 지정한 바퀴의 월드 접지점 */
  wheelContact(i: number, out = new THREE.Vector3()) {
    const w = this.wheels[i].root;
    out.set(0, -TIRE_R + 0.01, 0);
    return w.localToWorld(out);
  }
}
