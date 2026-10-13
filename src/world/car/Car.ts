import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { MAT, paint, lampMat } from '../materials';
import { Wheel, TIRE_R } from './Wheel';
import { blinkOn, textTexture, lerp } from '../../core/util';

/** 차량 로컬 좌표: +X 전방, +Y 위, +Z 오른쪽(조수석). 운전석은 왼쪽(-Z). */
export const CAR = {
  frontAxle: 1.38,
  rearAxle: -1.37,
  wheelbase: 2.75,
  track: 0.8,
  halfLen: 2.37,
  halfWid: 0.93,
};

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

const WS_BASE = new THREE.Vector2(1.12, 0.97); // 앞유리 아래 끝
const WS_U = new THREE.Vector3(-0.863, 0.505, 0); // 앞유리 위쪽 방향
const WS_N = new THREE.Vector3(0.505, 0.863, 0); // 앞유리 바깥 법선

export class Car {
  root = new THREE.Group();
  body = new THREE.Group();
  wheels: Wheel[] = [];
  hood = new THREE.Group();
  door?: THREE.Group;
  mirrors: { root: THREE.Group; pivot: THREE.Group; glass: THREE.Mesh }[] = [];
  wipers: THREE.Group[] = [];
  anchors: Record<string, THREE.Object3D> = {};
  lights: LightState = lightsOff();
  wiperMode: WiperMode = 'off';
  washer = 0;
  dipstick?: THREE.Group;
  onTick?: (on: boolean) => void;
  /** 깜빡이 위상 기준 시각 — 켜는 순간에 맞추면 첫 점멸이 바로 시작된다 */
  blinkT0 = 0;
  paintMat: THREE.MeshPhysicalMaterial;

  private shell: { mesh: THREE.Mesh; mat: THREE.Material | THREE.Material[] }[] = [];
  private mats = {
    low: lampMat(0xdfe6ee, 0xfff3d8),
    high: lampMat(0xdfe6ee, 0xeaf2ff),
    drl: lampMat(0xdfe6ee, 0xffffff),
    tail: lampMat(0x4a0808, 0xff1a0a),
    brake: lampMat(0x4a0808, 0xff1a0a),
    turnL: lampMat(0x6a3b08, 0xff9000),
    turnR: lampMat(0x6a3b08, 0xff9000),
    reverse: lampMat(0xd8d8d8, 0xffffff),
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
    this.root.add(this.body);

    // ── 차체 하부: 앞·뒤 덩어리 + 좌우 도어 패널 (실내는 비어 있음) ──
    const ext = (shape: THREE.Shape, depth: number, bevel: number, z0: number) => {
      const g = new THREE.ExtrudeGeometry(shape, {
        depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 4, curveSegments: 20,
      });
      g.translate(0, 0, z0 + bevel);
      this.addShell(new THREE.Mesh(g, this.paintMat));
    };
    // 앞부분(엔진룸·앞 펜더 아래)
    const fr = new THREE.Shape();
    fr.moveTo(0.9, 0.27);
    fr.lineTo(0.98, 0.27);
    fr.lineTo(0.98, TIRE_R);
    fr.absarc(CAR.frontAxle, TIRE_R, 0.4, Math.PI, 0, true);
    fr.lineTo(1.78, 0.3);
    fr.lineTo(2.22, 0.3);
    fr.quadraticCurveTo(2.37, 0.33, 2.37, 0.52);
    fr.quadraticCurveTo(2.36, 0.7, 2.24, 0.75);
    fr.lineTo(1.16, 0.75);
    fr.lineTo(1.12, 0.97);
    fr.lineTo(0.9, 0.97);
    fr.lineTo(0.9, 0.27);
    ext(fr, 1.77, 0.035, -0.92);
    // 뒷부분(뒷좌석 아래·트렁크)
    const rr = new THREE.Shape();
    rr.moveTo(-2.3, 0.32);
    rr.lineTo(-1.77, 0.3);
    rr.lineTo(-1.77, TIRE_R);
    rr.absarc(CAR.rearAxle, TIRE_R, 0.4, Math.PI, 0, true);
    rr.lineTo(-0.97, 0.27);
    rr.lineTo(-0.8, 0.27);
    rr.lineTo(-0.8, 0.42);
    rr.lineTo(-1.66, 0.42);
    rr.lineTo(-1.72, 0.99);
    rr.quadraticCurveTo(-2.15, 1.0, -2.27, 0.92);
    rr.quadraticCurveTo(-2.37, 0.85, -2.35, 0.6);
    rr.quadraticCurveTo(-2.34, 0.36, -2.3, 0.32);
    ext(rr, 1.77, 0.035, -0.92);
    // 좌우 도어 패널 (뒷바퀴 아치를 따라 잘림)
    const archA = Math.acos((-1.72 - CAR.rearAxle) / 0.4);
    const sd = new THREE.Shape();
    sd.moveTo(-0.97, 0.27);
    sd.lineTo(0.95, 0.27);
    sd.lineTo(0.95, 0.97);
    sd.lineTo(-1.72, 0.99);
    sd.lineTo(-1.72, TIRE_R + Math.sin(archA) * 0.4);
    sd.absarc(CAR.rearAxle, TIRE_R, 0.4, archA, 0, true);
    sd.lineTo(-0.97, 0.27);
    ext(sd, 0.06, 0.02, -0.92);
    ext(sd, 0.06, 0.02, 0.82);

    // ── 캐빈(유리 위쪽) ───────────────────────────────────
    const c = new THREE.Shape();
    c.moveTo(-1.7, 0.97);
    c.quadraticCurveTo(-1.3, 1.25, -1.02, 1.4);
    c.quadraticCurveTo(-0.4, 1.47, 0.3, 1.45);
    c.quadraticCurveTo(0.75, 1.22, 1.12, 0.97);
    c.lineTo(-1.7, 0.97);
    const cabGeo = new THREE.ExtrudeGeometry(c, {
      depth: 1.4, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 4, curveSegments: 16,
    });
    cabGeo.translate(0, 0, -0.7);
    this.addShell(new THREE.Mesh(cabGeo, this.paintMat));

    // 유리
    const glassMat = detailed ? MAT.glass : MAT.glass.clone();
    if (!detailed) glassMat.opacity = 0.92;
    const ws = curveStrip(
      new THREE.QuadraticBezierCurve(new THREE.Vector2(0.3, 1.45), new THREE.Vector2(0.75, 1.22), new THREE.Vector2(1.12, 0.97)),
      0.05, 0.97, 0.064, 0.64, 0.68,
    );
    const rw = curveStrip(
      new THREE.QuadraticBezierCurve(new THREE.Vector2(-1.7, 0.97), new THREE.Vector2(-1.3, 1.25), new THREE.Vector2(-1.02, 1.4)),
      0.06, 0.95, 0.064, 0.62, 0.66,
    );
    this.addShell(new THREE.Mesh(ws, glassMat), false);
    this.addShell(new THREE.Mesh(rw, glassMat), false);
    const frontWin = polyShape([[-0.32, 1.045], [0.95, 1.045], [0.62, 1.22], [0.28, 1.38], [-0.32, 1.4]]);
    const rearWin = polyShape([[-1.5, 1.045], [-0.44, 1.045], [-0.44, 1.4], [-0.95, 1.37], [-1.22, 1.22]]);
    for (const shp of [frontWin, rearWin]) {
      const g = new THREE.ShapeGeometry(shp);
      for (const side of [-1, 1]) {
        const m = new THREE.Mesh(g, glassMat);
        m.position.z = side * 0.764;
        m.scale.z = side;
        this.addShell(m, false);
      }
    }

    // 문틈, 손잡이
    for (const side of [-1, 1]) {
      for (const x of [0.97, -0.38, -1.32]) {
        const line = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.66, 0.004), MAT.black);
        line.position.set(x, 0.62, side * 0.921);
        this.body.add(line);
      }
      for (const x of [0.25, -0.95]) {
        const h = new THREE.Mesh(new RoundedBoxGeometry(0.16, 0.03, 0.025, 2, 0.01), MAT.chrome);
        h.position.set(x, 0.88, side * 0.925);
        this.body.add(h);
      }
    }

    // ── 펜더, 보닛 ───────────────────────────────────────
    const f = new THREE.Shape();
    f.moveTo(1.14, 0.74);
    f.lineTo(2.24, 0.74);
    f.lineTo(2.27, 0.8);
    f.quadraticCurveTo(1.8, 0.905, 1.14, 0.945);
    f.lineTo(1.14, 0.74);
    const fGeo = new THREE.ExtrudeGeometry(f, { depth: 0.07, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 2 });
    for (const side of [-1, 1]) {
      const m = new THREE.Mesh(fGeo, this.paintMat);
      m.position.z = side === -1 ? -0.91 : 0.84;
      this.addShell(m);
    }
    const h = new THREE.Shape();
    h.moveTo(1.15, 0.925);
    h.lineTo(2.27, 0.8);
    h.lineTo(2.3, 0.825);
    h.quadraticCurveTo(1.85, 0.93, 1.15, 0.958);
    h.lineTo(1.15, 0.925);
    const hGeo = new THREE.ExtrudeGeometry(h, { depth: 1.7, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.012, bevelSegments: 2 });
    hGeo.translate(-1.15, -0.958, -0.85);
    const hoodMesh = new THREE.Mesh(hGeo, this.paintMat);
    this.hood.position.set(1.15, 0.958, 0);
    this.hood.add(hoodMesh);
    this.body.add(this.hood);
    this.shell.push({ mesh: hoodMesh, mat: this.paintMat });
    hoodMesh.castShadow = true;

    // ── 등화장치 ─────────────────────────────────────────
    const m = this.mats;
    for (const side of [-1, 1]) {
      const head = new THREE.Mesh(new RoundedBoxGeometry(0.12, 0.08, 0.34, 2, 0.025), m.low);
      head.position.set(2.27, 0.7, side * 0.6);
      head.rotation.y = side * 0.28;
      const proj = new THREE.Mesh(new THREE.SphereGeometry(0.03, 16, 12), m.high);
      proj.position.set(2.31, 0.705, side * 0.5);
      const drl = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.014, 0.3), m.drl);
      drl.position.set(2.31, 0.652, side * 0.6);
      drl.rotation.y = side * 0.28;
      const fturn = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.035, 0.1), side < 0 ? m.turnL : m.turnR);
      fturn.position.set(2.24, 0.71, side * 0.8);
      fturn.rotation.y = side * 0.5;
      const tail = new THREE.Mesh(new RoundedBoxGeometry(0.08, 0.09, 0.38, 2, 0.02), m.tail);
      tail.position.set(-2.29, 0.9, side * 0.62);
      tail.rotation.y = -side * 0.22;
      const brake = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.045, 0.16), m.brake);
      brake.position.set(-2.32, 0.9, side * 0.58);
      const rturn = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.04, 0.13), side < 0 ? m.turnL : m.turnR);
      rturn.position.set(-2.335, 0.72, side * 0.7);
      const rev = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.035, 0.09), m.reverse);
      rev.position.set(-2.345, 0.72, side * 0.52);
      this.body.add(head, proj, drl, fturn, tail, brake, rturn, rev);
      if (side === -1) {
        this.anchor('headL', head, [0.04, 0.03, 0]);
        this.anchor('tailL', tail, [-0.04, 0.03, 0]);
        this.anchor('turnFL', fturn, [0.03, 0, 0]);
        this.anchor('turnRL', rturn, [-0.03, 0, 0]);
      } else {
        this.anchor('headR', head, [0.04, 0.03, 0]);
        this.anchor('turnRR', rturn, [-0.03, 0, 0]);
      }
    }
    const hmsl = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.025, 0.3), m.brake);
    hmsl.position.set(-1.66, 1.02, 0);
    this.body.add(hmsl);
    this.anchor('hmsl', hmsl, [0, 0.02, 0]);

    // 그릴, 번호판
    const grille = new THREE.Mesh(new RoundedBoxGeometry(0.06, 0.17, 0.9, 2, 0.02), MAT.black);
    grille.position.set(2.345, 0.53, 0);
    const intake = new THREE.Mesh(new RoundedBoxGeometry(0.05, 0.08, 1.2, 2, 0.02), MAT.black);
    intake.position.set(2.34, 0.37, 0);
    this.body.add(grille, intake);
    const plateTex = textTexture(opts.plate ?? '12가 3456', { w: 512, h: 112, bg: '#f4f4ef', fg: '#1a1a1a', size: 74, radius: 10 });
    const plateMat = new THREE.MeshStandardMaterial({ map: plateTex, roughness: 0.5 });
    const pf = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.114), plateMat);
    pf.position.set(2.395, 0.44, 0);
    pf.rotation.y = Math.PI / 2;
    const pr = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.114), plateMat);
    pr.position.set(-2.375, 0.64, 0);
    pr.rotation.y = -Math.PI / 2;
    this.body.add(pf, pr);

    // ── 사이드미러 ───────────────────────────────────────
    for (const side of [-1, 1]) {
      const root = new THREE.Group();
      root.position.set(0.96, 1.02, side * 0.9);
      const stalk = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.04, 0.1), MAT.black);
      stalk.position.set(0, -0.02, side * 0.04);
      const housing = new THREE.Mesh(new RoundedBoxGeometry(0.12, 0.12, 0.23, 3, 0.04), this.paintMat);
      housing.position.set(0.01, 0.04, side * 0.17);
      const rep = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.012, 0.12), side < 0 ? m.turnL : m.turnR);
      rep.position.set(0.06, 0.0, side * 0.2);
      const pivot = new THREE.Group();
      pivot.position.set(-0.052, 0.04, side * 0.17);
      const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.1), new THREE.MeshStandardMaterial({ color: 0x9fb4c8, metalness: 1, roughness: 0.05 }));
      glass.rotation.y = -Math.PI / 2;
      pivot.add(glass);
      root.add(stalk, housing, rep, pivot);
      this.body.add(root);
      this.shell.push({ mesh: housing, mat: this.paintMat });
      housing.castShadow = true;
      this.mirrors.push({ root, pivot, glass });
      this.anchor(side < 0 ? 'mirrorL' : 'mirrorR', pivot, [-0.01, 0.06, 0]);
    }

    // ── 와이퍼 (앞유리 평면 위에서 회전) ─────────────────
    const basis = new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, -1), WS_U, WS_N);
    const base = new THREE.Vector3(WS_BASE.x, WS_BASE.y, 0).addScaledVector(WS_N, 0.075).addScaledVector(WS_U, 0.05);
    for (const [z, len] of [[0.02, 0.62], [0.66, 0.54]] as const) {
      const pivot = new THREE.Group();
      pivot.position.copy(base).setZ(z);
      pivot.quaternion.setFromRotationMatrix(basis);
      const arm = new THREE.Group();
      const a = new THREE.Mesh(new THREE.BoxGeometry(len, 0.014, 0.014), MAT.black);
      a.position.set(len / 2, 0, 0.012);
      const blade = new THREE.Mesh(new THREE.BoxGeometry(len * 0.9, 0.018, 0.012), MAT.trim);
      blade.position.set(len * 0.52, 0.012, 0.004);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.022, 0.03, 12), MAT.black);
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

    // 문 (옆 차 문 열기 연출용)
    if (opts.doorRight) {
      const door = new THREE.Group();
      door.position.set(0.97, 0, 0.925);
      const ds = polyShape([[-1.34, 0.3], [0, 0.3], [0, 1.0], [-1.34, 1.0]]);
      const dg = new THREE.ExtrudeGeometry(ds, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 2 });
      const dm = new THREE.Mesh(dg, this.paintMat);
      dm.position.z = -0.045;
      const wg = new THREE.ShapeGeometry(polyShape([[-1.29, 1.0], [-0.02, 1.0], [-0.35, 1.2], [-0.69, 1.37], [-1.29, 1.39]]));
      const win = new THREE.Mesh(wg, glassMat);
      win.position.z = -0.02;
      const frame = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.02, 0.03), MAT.black);
      frame.position.set(-0.66, 1.0, -0.02);
      door.add(dm, win, frame);
      this.root.add(door);
      this.door = door;
      this.anchor('doorEdge', door, [-1.34, 0.7, 0.02]);
    }

    if (detailed) this.buildDetails();

    this.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && o.castShadow === false) o.castShadow = true;
    });
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
    this.body.add(bay);
    const block = new THREE.Mesh(new RoundedBoxGeometry(0.5, 0.1, 0.62, 2, 0.03), MAT.engine);
    block.position.set(1.66, 0.82, 0.02);
    const cover = new THREE.Mesh(new RoundedBoxGeometry(0.38, 0.05, 0.46, 2, 0.02), MAT.engineCover);
    cover.position.set(1.63, 0.875, 0.02);
    const oilCap = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.025, 20), MAT.yellow);
    oilCap.position.set(1.7, 0.905, 0.16);
    bay.add(block, cover, oilCap);
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
    const wash = res(2.05, -0.6, 0.12, 0.07, 0.12, MAT.washerFluid, MAT.blueCap, 0.55);
    const bf = res(1.26, -0.56, 0.08, 0.08, 0.08, MAT.brakeFluid, MAT.yellow, 0.75);
    this.anchor('coolant', cool, [0, 0.14, 0]);
    this.anchor('washer', wash, [0, 0.1, 0]);
    this.anchor('brakeFluid', bf, [0, 0.11, 0]);
    const batt = new THREE.Mesh(new RoundedBoxGeometry(0.22, 0.1, 0.16, 2, 0.01), MAT.black);
    batt.position.set(1.95, 0.84, 0.48);
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
      sp.position.set(2.3, 0.7, side * 0.6);
      sp.target.position.set(14, -0.6, side * 0.9);
      this.body.add(sp, sp.target);
      this.spots.push(sp);
      const cone = new THREE.Mesh(new THREE.ConeGeometry(1.5, 9, 24, 1, true), this.beamMat);
      cone.rotation.z = Math.PI / 2 - 0.06;
      cone.position.set(2.32 + 4.5, 0.7 - 0.25, side * 0.6);
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

  /** 투명(유령) 차체 — 실내를 밖에서 보여줄 때 */
  setGhost(on: boolean) {
    for (const s of this.shell) s.mesh.material = on ? MAT.ghost : s.mat;
    for (const s of this.shell) s.mesh.castShadow = !on;
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
    m.tail.emissiveIntensity = l.tail || head ? 2 : 0.06;
    m.brake.emissiveIntensity = l.brake ? 7 : l.tail || head ? 1.5 : 0.06;
    m.turnL.emissiveIntensity = left && b ? 7 : 0.05;
    m.turnR.emissiveIntensity = right && b ? 7 : 0.05;
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
        c.position.x = 2.32 + 4.5 * (hi ? 1.5 : 1);
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
          const x = 1.13 - t * 0.55;
          const y = 0.99 + t * 0.55 - t * t * 0.22;
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

function polyShape(pts: number[][]) {
  const s = new THREE.Shape();
  pts.forEach(([x, y], i) => (i === 0 ? s.moveTo(x, y) : s.lineTo(x, y)));
  s.closePath();
  return s;
}

/** 프로파일 곡선을 따라 차폭 방향으로 늘린 유리 스트립 */
function curveStrip(curve: THREE.Curve<THREE.Vector2>, t0: number, t1: number, offset: number, zHalfA: number, zHalfB: number) {
  const N = 10;
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= N; i++) {
    const t = t0 + ((t1 - t0) * i) / N;
    const p = curve.getPoint(t);
    const d = curve.getTangent(t);
    const n = new THREE.Vector2(-d.y, d.x).normalize();
    const zh = zHalfA + (zHalfB - zHalfA) * (i / N);
    const x = p.x + n.x * offset;
    const y = p.y + n.y * offset;
    pos.push(x, y, -zh, x, y, zh);
  }
  for (let i = 0; i < N; i++) {
    const a = i * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  // 법선이 바깥(위쪽)을 향하도록 보정
  const nrm = g.getAttribute('normal');
  if (nrm.getY(0) < 0) {
    for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
    g.setIndex(idx);
    g.computeVertexNormals();
  }
  return g;
}
