import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { MAT, glowMat } from '../materials';
import { Cluster, type Gear } from './Cluster';
import { DEG, canvasTexture, textTexture, orient, FONT, blinkOn, lerp, ease } from '../../core/util';
import type { Mannequin } from './Driver';

/** 운전석 중심선 */
export const DZ = -0.38;
export const EYE = new THREE.Vector3(-0.36, 1.2, DZ);

const rbox = (w: number, h: number, d: number, r = 0.02, mat: THREE.Material = MAT.dash) =>
  new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3)), mat);

export class Seat {
  root = new THREE.Group();
  back = new THREE.Group();
  headrest = new THREE.Group();
  slide = 0;
  recline = 18 * DEG;
  height = 0;
  headUp = 0;
  lever: THREE.Mesh;

  constructor(public z: number) {
    const cushion = rbox(0.52, 0.12, 0.5, 0.045, MAT.seat);
    cushion.position.set(0, 0.1, 0);
    const base = rbox(0.4, 0.12, 0.38, 0.02, MAT.black);
    base.position.set(0, -0.0, 0);
    this.root.add(cushion, base);
    for (const s of [-1, 1]) {
      const b = rbox(0.48, 0.07, 0.07, 0.03, MAT.leather);
      b.position.set(0.0, 0.17, s * 0.23);
      this.root.add(b);
    }
    this.back.position.set(-0.26, 0.17, 0);
    const panel = rbox(0.13, 0.64, 0.52, 0.05, MAT.seat);
    panel.position.set(0, 0.34, 0);
    this.back.add(panel);
    for (const s of [-1, 1]) {
      const b = rbox(0.14, 0.5, 0.07, 0.03, MAT.leather);
      b.position.set(0.04, 0.3, s * 0.24);
      this.back.add(b);
    }
    this.headrest.position.set(0, 0.69, 0);
    const hr = rbox(0.11, 0.17, 0.27, 0.05, MAT.seat);
    hr.position.set(0.01, 0.09, 0);
    this.headrest.add(hr);
    for (const pz of [-0.06, 0.06]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.12), MAT.chrome);
      post.position.set(0, 0.0, pz);
      this.headrest.add(post);
    }
    this.back.add(this.headrest);
    this.root.add(this.back);
    this.lever = rbox(0.12, 0.025, 0.02, 0.008, MAT.black);
    this.lever.position.set(0.12, 0.04, 0.27 * Math.sign(z || -1));
    this.root.add(this.lever);
    this.root.traverse((o) => {
      o.castShadow = true;
      o.receiveShadow = true;
    });
    this.apply();
  }

  apply() {
    this.root.position.set(-0.07 + this.slide, 0.3 + this.height, this.z);
    this.back.rotation.z = this.recline;
    this.headrest.position.y = 0.69 + this.headUp;
  }
  hip() {
    return new THREE.Vector3(-0.15 + this.slide, 0.5 + this.height, this.z);
  }
  backDir() {
    return new THREE.Vector3(-Math.sin(this.recline), Math.cos(this.recline), 0);
  }
}

/** 안전벨트 — 몸을 따라가는 리본 */
class BeltRibbon {
  mesh: THREE.Mesh;
  private N = 64;
  constructor() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array((this.N + 1) * 2 * 3), 3));
    const idx: number[] = [];
    for (let i = 0; i < this.N; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    g.setIndex(idx);
    const mat = MAT.belt.clone();
    mat.side = THREE.DoubleSide;
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
  }
  update(pts: THREE.Vector3[], axisA: THREE.Vector3, axisB: THREE.Vector3) {
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    const pos = this.mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    const ab = new THREE.Vector3().subVectors(axisB, axisA);
    const abLen2 = ab.lengthSq();
    const tmp = new THREE.Vector3();
    for (let i = 0; i <= this.N; i++) {
      const t = i / this.N;
      const p = curve.getPoint(t);
      const tan = curve.getTangent(t);
      const s = THREE.MathUtils.clamp(tmp.subVectors(p, axisA).dot(ab) / abLen2, 0, 1);
      const closest = axisA.clone().addScaledVector(ab, s);
      const n = p.clone().sub(closest);
      if (n.lengthSq() < 1e-6) n.set(1, 0, 0);
      n.normalize();
      const side = new THREE.Vector3().crossVectors(tan, n).normalize().multiplyScalar(0.024);
      pos.setXYZ(i * 2, p.x + side.x, p.y + side.y, p.z + side.z);
      pos.setXYZ(i * 2 + 1, p.x - side.x, p.y - side.y, p.z - side.z);
    }
    pos.needsUpdate = true;
    this.mesh.geometry.computeVertexNormals();
    this.mesh.geometry.computeBoundingSphere();
  }
}

export type GearType = 'lever' | 'column' | 'dial';
export const GEAR_INDEX: Record<Gear, number> = { P: 0, R: 1, N: 2, D: 3 };

export class Cockpit {
  root = new THREE.Group();
  cluster = new Cluster();
  seat = new Seat(DZ);
  passenger = new Seat(-DZ);
  anchors: Record<string, THREE.Object3D> = {};

  // 조작 상태 (단계 스크립트에서 직접 값을 넣는다)
  steer = 0;
  tilt = 0;
  tele = 0;
  tiltLever = 0;
  lStalkV = 0;
  lStalkPush = 0;
  lightDial = 0;
  rStalkV = 0;
  rStalkPull = 0;
  colGearV = 0;
  colGearBtn = 0;
  gearType: GearType = 'lever';
  leverPos = 0;
  leverBtn = 0;
  dialPos = 0;
  dialPBtn = 0;
  epbSwitch = 0;
  autoHoldBtn = 0;
  mechanical = false;
  handbrake = 1;
  handbrakeBtn = 0;
  startBtn = 0;
  startGlow: 'off' | 'acc' | 'on' | 'run' = 'off';
  hazardBtn = 0;
  hazardLit = false;
  brake = 0;
  accel = 0;
  mirrorSel: 'L' | 'R' | null = null;
  mirrorPad = new THREE.Vector2();
  roomMirror = new THREE.Vector2();
  belt = 0;
  beltVisible = false;

  // 내부 노드
  colPivot = new THREE.Group();
  private colSlide = new THREE.Group();
  colFrame = new THREE.Group();
  wheelSpin = new THREE.Group();
  private leftStalk = new THREE.Group();
  private lightRing = new THREE.Group();
  private rightStalk = new THREE.Group();
  private colGear = new THREE.Group();
  private colGearBtnMesh: THREE.Mesh;
  private tiltLeverG = new THREE.Group();
  private lever = new THREE.Group();
  private leverKnobBtn: THREE.Mesh;
  private leverSet = new THREE.Group();
  private prndPlate: THREE.Mesh;
  private prndTex: THREE.CanvasTexture;
  private dialSet = new THREE.Group();
  private dialKnob = new THREE.Group();
  private dialPBtnMesh: THREE.Mesh;
  private epbG = new THREE.Group();
  private autoHoldG = new THREE.Group();
  private autoHoldLed: THREE.MeshBasicMaterial;
  private handbrakeG = new THREE.Group();
  private handbrakeBtnMesh: THREE.Mesh;
  private startG = new THREE.Group();
  private startRing: THREE.MeshBasicMaterial;
  private hazardG = new THREE.Group();
  private hazardMat: THREE.MeshStandardMaterial;
  private brakePedal = new THREE.Group();
  private accelPedal = new THREE.Group();
  private mirrorKnob = new THREE.Group();
  private mirrorPadG = new THREE.Group();
  roomMirrorPivot = new THREE.Group();
  roomMirrorGlass: THREE.Mesh;
  private doorL = new THREE.Group();
  private beltRibbon = new BeltRibbon();
  private tongue: THREE.Mesh;
  private buckle = new THREE.Group();
  private interiorLight: THREE.PointLight;
  private prndKey = '';
  /** 투시 모드에서 숨기는 운전석 쪽 내장재 */
  private leftTrim: THREE.Object3D[] = [];

  constructor() {
    const R = this.root;
    R.add(this.seat.root, this.passenger.root);

    // ── 바닥·대시보드 ─────────────────────────────────────
    const floor = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.02, 1.64), MAT.carpet);
    floor.position.set(-0.35, 0.2, 0);
    const toe = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.02, 1.64), MAT.carpet);
    toe.position.set(0.92, 0.33, 0);
    toe.rotation.z = 0.85;
    const dash = rbox(0.6, 0.24, 1.68, 0.06, MAT.dash);
    dash.position.set(0.84, 0.85, 0);
    const dashTop = rbox(0.42, 0.05, 1.66, 0.02, MAT.dashSoft);
    dashTop.position.set(0.95, 0.965, 0);
    const knee = rbox(0.22, 0.28, 1.66, 0.05, MAT.dash);
    knee.position.set(0.7, 0.6, 0);
    const trim = rbox(0.02, 0.03, 1.5, 0.01, MAT.chrome);
    trim.position.set(0.545, 0.8, 0);
    R.add(floor, toe, dash, dashTop, knee, trim);
    for (const s of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.03, 0.03), MAT.trim);
      rail.position.set(-0.15, 0.22, s * 0.38 + 0.15);
      R.add(rail);
    }

    // 계기판
    const binnacle = rbox(0.2, 0.1, 0.44, 0.04, MAT.dash);
    binnacle.position.set(0.64, 0.995, DZ);
    const hoodTop = rbox(0.22, 0.03, 0.46, 0.015, MAT.dashSoft);
    hoodTop.position.set(0.62, 1.05, DZ);
    hoodTop.rotation.z = 0.08;
    const clusterMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.36, 0.135),
      new THREE.MeshBasicMaterial({ map: this.cluster.texture, toneMapped: false }),
    );
    clusterMesh.position.set(0.548, 0.982, DZ);
    orient(clusterMesh, new THREE.Vector3(-1, 0.22, 0), new THREE.Vector3(0, 1, 0));
    // PlaneGeometry의 법선은 +Z → orient로 운전자 방향을 바라보게
    R.add(binnacle, hoodTop, clusterMesh);
    this.mk('cluster', clusterMesh, 0, 0, 0.005);
    this.mk('clusterWarn', clusterMesh, 0.0, -0.045, 0.005);
    this.mk('clusterP', clusterMesh, -0.064, 0.049, 0.005);
    this.mk('clusterAH', clusterMesh, 0.064, 0.049, 0.005);
    this.mk('clusterGear', clusterMesh, 0, 0.029, 0.005);
    this.mk('clusterL', clusterMesh, -0.11, 0.0, 0.005);

    // 센터페시아, 디스플레이
    const fascia = rbox(0.16, 0.42, 0.32, 0.03, MAT.dash);
    fascia.position.set(0.7, 0.66, 0);
    const screenTex = canvasTexture(640, 360, (c, w, h) => {
      const g = c.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, '#0f1b2d');
      g.addColorStop(1, '#1c3350');
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
      c.strokeStyle = '#3c6aa5';
      c.lineWidth = 10;
      c.beginPath();
      c.moveTo(60, 300);
      c.bezierCurveTo(200, 240, 260, 120, 420, 90);
      c.lineTo(600, 60);
      c.stroke();
      c.fillStyle = '#ffffff';
      c.font = `700 54px ${FONT}`;
      c.fillText('12:30', 30, 70);
      c.font = `500 26px ${FONT}`;
      c.fillStyle = '#a9c4e6';
      c.fillText('공원 주차장', 30, 110);
    });
    const screen = rbox(0.025, 0.18, 0.32, 0.01, MAT.black);
    screen.position.set(0.6, 1.065, 0.06);
    const screenFace = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.16), new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false }));
    screenFace.position.set(0.586, 1.065, 0.06);
    screenFace.rotation.y = -Math.PI / 2;
    R.add(fascia, screen, screenFace);
    for (const z of [-0.09, 0.09]) {
      const vent = rbox(0.02, 0.05, 0.1, 0.01, MAT.black);
      vent.position.set(0.618, 0.8, z);
      R.add(vent);
    }

    // 비상등 버튼
    this.hazardMat = new THREE.MeshStandardMaterial({ color: 0xc8231d, emissive: 0xff2a1a, emissiveIntensity: 0.1, roughness: 0.35 });
    const hzBtn = rbox(0.02, 0.036, 0.07, 0.008, this.hazardMat);
    const triTex = canvasTexture(128, 64, (c) => {
      c.strokeStyle = '#ffffff';
      c.lineWidth = 7;
      c.beginPath();
      c.moveTo(64, 10);
      c.lineTo(94, 56);
      c.lineTo(34, 56);
      c.closePath();
      c.stroke();
    });
    const tri = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.03), new THREE.MeshBasicMaterial({ map: triTex, transparent: true }));
    tri.rotation.y = -Math.PI / 2;
    tri.position.x = -0.0105;
    this.hazardG.add(hzBtn, tri);
    this.hazardG.position.set(0.616, 0.885, 0);
    R.add(this.hazardG);
    this.mk('hazard', this.hazardG, -0.02, 0.0, 0);

    // 시동 버튼
    const sb = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.028, 0.022, 28), MAT.chrome);
    sb.rotation.z = Math.PI / 2;
    const sbFace = new THREE.Mesh(
      new THREE.CircleGeometry(0.022, 28),
      new THREE.MeshBasicMaterial({ map: textTexture('ENGINE\nSTART\nSTOP', { w: 128, h: 128, bg: '#15181d', fg: '#e6ecf3', size: 22, radius: 64 }) }),
    );
    sbFace.rotation.y = -Math.PI / 2;
    sbFace.position.x = -0.0115;
    this.startRing = glowMat(0x303540);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.027, 0.003, 8, 32), this.startRing);
    ring.rotation.y = Math.PI / 2;
    ring.position.x = -0.009;
    this.startG.add(sb, sbFace, ring);
    this.startG.position.set(0.556, 0.84, -0.13);
    R.add(this.startG);
    this.mk('start', this.startG, -0.02, 0, 0);

    // ── 스티어링 휠·칼럼 ─────────────────────────────────
    this.colPivot.position.set(0.62, 0.75, DZ);
    this.colPivot.add(this.colSlide);
    this.colSlide.add(this.colFrame);
    this.colFrame.position.set(-0.4, 0.17, 0);
    orient(this.colFrame, new THREE.Vector3(-0.92, 0.391, 0), new THREE.Vector3(0.391, 0.92, 0));
    this.colFrame.add(this.wheelSpin);
    R.add(this.colPivot);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.185, 0.017, 14, 64), MAT.leather);
    const hub = rbox(0.13, 0.1, 0.06, 0.03, MAT.dash);
    hub.position.z = 0.005;
    const logo = new THREE.Mesh(new THREE.CircleGeometry(0.018, 24), MAT.chrome);
    logo.position.z = 0.036;
    const mark = rbox(0.022, 0.02, 0.04, 0.006, new THREE.MeshStandardMaterial({ color: 0xff8a2a, roughness: 0.5 }));
    mark.position.set(0, 0.185, 0);
    this.wheelSpin.add(rim, hub, logo, mark);
    for (const [x, y] of [[0.12, -0.01], [-0.12, -0.01], [0, -0.115]]) {
      const sp = rbox(Math.abs(x) > 0 ? 0.11 : 0.04, Math.abs(x) > 0 ? 0.035 : 0.09, 0.025, 0.01, MAT.dash);
      sp.position.set(x * 0.85, y, -0.005);
      this.wheelSpin.add(sp);
    }
    this.mk('wheelTop', this.wheelSpin, 0, 0.21, 0.02);
    this.mk('wheel9', this.colFrame, -0.21, 0, 0.02);
    const shroud = rbox(0.1, 0.09, 0.24, 0.03, MAT.dash);
    shroud.position.set(0, -0.03, -0.17);
    this.colFrame.add(shroud);

    // 왼쪽 레버(방향지시등·전조등)
    this.leftStalk.position.set(-0.05, -0.012, -0.1);
    const lrod = new THREE.Mesh(new THREE.CylinderGeometry(0.0075, 0.01, 0.13, 10), MAT.black);
    lrod.rotation.z = Math.PI / 2;
    lrod.position.x = -0.065;
    this.lightRing.position.x = -0.15;
    const ringTex = canvasTexture(256, 64, (c) => {
      c.fillStyle = '#20242b';
      c.fillRect(0, 0, 256, 64);
      c.fillStyle = '#e8edf3';
      c.font = `700 22px ${FONT}`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      ['OFF', '미등', '전조', 'AUTO'].forEach((t, i) => c.fillText(t, 32 + i * 64, 32));
    });
    const lring = new THREE.Mesh(new THREE.CylinderGeometry(0.0135, 0.0135, 0.04, 24), new THREE.MeshStandardMaterial({ map: ringTex, roughness: 0.6 }));
    lring.rotation.z = Math.PI / 2;
    const lcap = new THREE.Mesh(new THREE.SphereGeometry(0.0135, 16, 12), MAT.black);
    lcap.position.x = -0.022;
    this.lightRing.add(lring, lcap);
    this.leftStalk.add(lrod, this.lightRing);
    this.colFrame.add(this.leftStalk);
    this.mk('lStalk', this.leftStalk, -0.15, 0.02, 0);

    // 오른쪽 레버(와이퍼)
    this.rightStalk.position.set(0.05, -0.012, -0.1);
    const rrod = lrod.clone();
    rrod.position.x = 0.065;
    const rtip = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.045, 18), MAT.black);
    rtip.rotation.z = Math.PI / 2;
    rtip.position.x = 0.15;
    const rcap = new THREE.Mesh(new THREE.SphereGeometry(0.012, 16, 12), MAT.black);
    rcap.position.x = 0.173;
    this.rightStalk.add(rrod, rtip, rcap);
    this.colFrame.add(this.rightStalk);
    this.mk('rStalk', this.rightStalk, 0.16, 0.02, 0);

    // 칼럼식 기어 레버
    this.colGear.position.set(0.055, 0.035, -0.11);
    const cg = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.011, 0.1, 12), MAT.chrome);
    cg.rotation.z = Math.PI / 2;
    cg.position.x = 0.05;
    const cgTip = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.03, 18), MAT.black);
    cgTip.rotation.z = Math.PI / 2;
    cgTip.position.x = 0.11;
    this.colGearBtnMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.011, 0.011, 0.006, 18),
      new THREE.MeshBasicMaterial({ map: textTexture('P', { w: 64, h: 64, bg: '#2a2f37', fg: '#ffffff', size: 40, radius: 32 }) }),
    );
    this.colGearBtnMesh.rotation.z = -Math.PI / 2;
    this.colGearBtnMesh.position.x = 0.127;
    this.colGear.add(cg, cgTip, this.colGearBtnMesh);
    this.colFrame.add(this.colGear);
    this.mk('colGear', this.colGear, 0.12, 0.02, 0);

    // 틸트 레버
    this.tiltLeverG.position.set(-0.045, -0.07, -0.16);
    const tl = rbox(0.02, 0.015, 0.1, 0.006, MAT.black);
    tl.position.set(0, 0, 0.04);
    this.tiltLeverG.add(tl);
    this.colFrame.add(this.tiltLeverG);
    this.mk('tiltLever', this.tiltLeverG, 0, -0.01, 0.08);

    // ── 페달 ────────────────────────────────────────────
    const pedal = (g: THREE.Group, pivot: [number, number, number], pad: [number, number], size: [number, number, number]) => {
      g.position.set(...pivot);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.015, 1, 0.025), MAT.trim);
      const len = Math.hypot(pad[0], pad[1]);
      arm.scale.y = len;
      arm.position.set(pad[0] / 2, pad[1] / 2, 0);
      arm.rotation.z = Math.atan2(-pad[0], pad[1]);
      const p = rbox(size[0], size[1], size[2], 0.01, MAT.rubber);
      p.position.set(pad[0], pad[1], 0);
      p.rotation.z = 0.35;
      g.add(arm, p);
      R.add(g);
      return p;
    };
    const bp = pedal(this.brakePedal, [0.86, 0.62, -0.44], [-0.16, -0.28], [0.03, 0.08, 0.12]);
    const ap = pedal(this.accelPedal, [0.88, 0.6, -0.25], [-0.13, -0.29], [0.025, 0.15, 0.065]);
    this.anchors.brake = bp;
    this.anchors.accel = ap;
    const rest = rbox(0.03, 0.2, 0.1, 0.01, MAT.rubber);
    rest.position.set(0.7, 0.3, -0.66);
    rest.rotation.z = 0.75;
    R.add(rest);
    this.anchors.footrest = rest;

    // ── 센터 콘솔 ────────────────────────────────────────
    const consoleBox = rbox(1.12, 0.36, 0.27, 0.04, MAT.dash);
    consoleBox.position.set(0.06, 0.42, 0);
    const consoleTop = rbox(0.62, 0.02, 0.25, 0.008, MAT.trim);
    consoleTop.position.set(0.22, 0.6, 0);
    const arm = rbox(0.34, 0.07, 0.25, 0.03, MAT.leather);
    arm.position.set(-0.36, 0.64, 0);
    R.add(consoleBox, consoleTop, arm);

    // 일반 기어봉
    this.leverSet.position.set(0.3, 0.61, 0);
    this.lever.position.set(0, -0.04, 0);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.013, 0.16), MAT.chrome);
    shaft.position.y = 0.08;
    const knob = rbox(0.06, 0.09, 0.05, 0.022, MAT.leather);
    knob.position.y = 0.18;
    this.leverKnobBtn = rbox(0.016, 0.026, 0.012, 0.004, MAT.chrome);
    this.leverKnobBtn.position.set(0.0, 0.19, -0.03);
    this.lever.add(shaft, knob, this.leverKnobBtn);
    const boot = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.045, 0.05, 16), MAT.black);
    boot.position.y = 0.01;
    const bezel = rbox(0.2, 0.012, 0.11, 0.01, MAT.black);
    bezel.position.y = -0.002;
    this.prndTex = canvasTexture(64, 256, () => {});
    this.prndPlate = new THREE.Mesh(new THREE.PlaneGeometry(0.0375, 0.15), new THREE.MeshBasicMaterial({ map: this.prndTex, transparent: true, toneMapped: false }));
    this.prndPlate.rotation.set(-Math.PI / 2, 0, -Math.PI / 2);
    this.prndPlate.position.set(0, 0.006, 0.042);
    this.leverSet.add(this.lever, boot, bezel, this.prndPlate);
    R.add(this.leverSet);
    this.mk('lever', this.lever, 0, 0.2, 0);

    // 다이얼식
    this.dialSet.position.set(0.3, 0.61, 0);
    const dialPlate = new THREE.Mesh(
      new THREE.CircleGeometry(0.07, 40),
      new THREE.MeshBasicMaterial({
        map: canvasTexture(256, 256, (c) => {
          c.fillStyle = '#15181d';
          c.beginPath();
          c.arc(128, 128, 127, 0, Math.PI * 2);
          c.fill();
          c.fillStyle = '#e9eef5';
          c.font = `800 40px ${FONT}`;
          c.textAlign = 'center';
          c.textBaseline = 'middle';
          // 위쪽이 차량 전방(+X)
          const put = (t: string, deg: number) => {
            const a = ((deg - 90) * Math.PI) / 180;
            c.fillText(t, 128 + Math.cos(a) * 96, 128 + Math.sin(a) * 96);
          };
          put('R', -40);
          put('N', 0);
          put('D', 40);
        }),
      }),
    );
    dialPlate.rotation.set(-Math.PI / 2, 0, -Math.PI / 2);
    dialPlate.position.y = 0.002;
    const dk = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.045, 0.04, 40), MAT.chrome);
    dk.position.y = 0.022;
    const dkTop = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.038, 0.004, 40), MAT.black);
    dkTop.position.y = 0.043;
    const notch = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.005, 0.005), glowMat(0xffffff));
    notch.position.set(0.026, 0.046, 0);
    this.dialKnob.add(dk, dkTop, notch);
    this.dialPBtnMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.018, 0.018, 0.012, 24),
      [MAT.chrome, new THREE.MeshBasicMaterial({ map: textTexture('P', { w: 64, h: 64, bg: '#2a2f37', fg: '#fff', size: 40, radius: 32 }) }), MAT.chrome],
    );
    this.dialPBtnMesh.position.set(0.11, 0.008, 0);
    this.dialSet.add(dialPlate, this.dialKnob, this.dialPBtnMesh);
    R.add(this.dialSet);
    this.mk('dial', this.dialKnob, 0, 0.06, 0);
    this.mk('dialP', this.dialPBtnMesh, 0, 0.02, 0);

    // 전자식 파킹 브레이크 스위치, 오토홀드 버튼
    this.epbG.position.set(0.13, 0.612, -0.075);
    const epb = rbox(0.05, 0.018, 0.04, 0.008, MAT.black);
    const epbIcon = new THREE.Mesh(
      new THREE.PlaneGeometry(0.03, 0.03),
      new THREE.MeshBasicMaterial({ map: textTexture('(P)', { w: 128, h: 128, bg: 'transparent', fg: '#ffffff', size: 54 }), transparent: true }),
    );
    epbIcon.rotation.set(-Math.PI / 2, 0, -Math.PI / 2);
    epbIcon.position.y = 0.0095;
    this.epbG.add(epb, epbIcon);
    this.autoHoldG.position.set(0.13, 0.612, 0.075);
    const ah = rbox(0.045, 0.016, 0.045, 0.008, MAT.black);
    const ahIcon = new THREE.Mesh(
      new THREE.PlaneGeometry(0.036, 0.036),
      new THREE.MeshBasicMaterial({ map: textTexture('AUTO\nHOLD', { w: 128, h: 128, bg: 'transparent', fg: '#ffffff', size: 30 }), transparent: true }),
    );
    ahIcon.rotation.set(-Math.PI / 2, 0, -Math.PI / 2);
    ahIcon.position.y = 0.0085;
    this.autoHoldLed = glowMat(0x1d2228);
    const led = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.003, 0.012), this.autoHoldLed);
    led.position.set(0.016, 0.009, 0);
    this.autoHoldG.add(ah, ahIcon, led);
    R.add(this.epbG, this.autoHoldG);
    this.mk('epb', this.epbG, 0, 0.02, 0);
    this.mk('autohold', this.autoHoldG, 0, 0.02, 0);

    // 기계식 사이드 브레이크
    this.handbrakeG.position.set(0.12, 0.6, 0);
    const hb = rbox(0.3, 0.035, 0.045, 0.015, MAT.leather);
    hb.position.set(-0.15, 0.0, 0);
    this.handbrakeBtnMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.02, 12), MAT.chrome);
    this.handbrakeBtnMesh.rotation.z = Math.PI / 2;
    this.handbrakeBtnMesh.position.set(-0.305, 0, 0);
    this.handbrakeG.add(hb, this.handbrakeBtnMesh);
    R.add(this.handbrakeG);
    this.mk('handbrake', this.handbrakeG, -0.24, 0.03, 0);

    // ── 문 패널·필러·천장 ─────────────────────────────────
    const door = rbox(1.32, 0.68, 0.07, 0.03, MAT.dash);
    door.position.set(0.28, 0.66, 0);
    const doorArm = rbox(0.42, 0.05, 0.08, 0.02, MAT.leather);
    doorArm.position.set(0.12, 0.71, 0.05);
    const doorTop = rbox(1.3, 0.04, 0.09, 0.02, MAT.dashSoft);
    doorTop.position.set(0.28, 1.0, 0.01);
    this.doorL.add(door, doorArm, doorTop);
    this.doorL.position.z = -0.83;
    // 사이드미러 스위치
    const msBase = rbox(0.08, 0.014, 0.055, 0.006, MAT.black);
    msBase.position.set(0.3, 0.737, 0.05);
    this.mirrorKnob.position.set(0.32, 0.748, 0.05);
    const knobM = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.012, 16), MAT.chrome);
    const knobT = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.004, 0.02), glowMat(0xffffff));
    knobT.position.y = 0.007;
    this.mirrorKnob.add(knobM, knobT);
    this.mirrorPadG.position.set(0.283, 0.748, 0.05);
    const pad = rbox(0.03, 0.01, 0.03, 0.006, MAT.trim);
    this.mirrorPadG.add(pad);
    const lr = new THREE.Mesh(
      new THREE.PlaneGeometry(0.03, 0.012),
      new THREE.MeshBasicMaterial({ map: textTexture('L   R', { w: 128, h: 48, bg: 'transparent', fg: '#ffffff', size: 30 }), transparent: true }),
    );
    lr.rotation.set(-Math.PI / 2, 0, 0);
    lr.position.set(0.335, 0.7445, 0.05);
    this.doorL.add(msBase, this.mirrorKnob, this.mirrorPadG, lr);
    for (let i = 0; i < 2; i++) {
      const ws = rbox(0.022, 0.012, 0.03, 0.005, MAT.black);
      ws.position.set(0.2 - i * 0.04, 0.742, 0.05);
      this.doorL.add(ws);
    }
    R.add(this.doorL);
    this.mk('mirrorSwitch', this.mirrorPadG, 0, 0.012, 0);
    const doorR = this.doorL.clone();
    doorR.position.z = 0.83;
    doorR.scale.z = -1;
    R.add(doorR);
    for (const s of [-1, 1]) {
      const rd = rbox(0.92, 0.6, 0.07, 0.03, MAT.dash);
      rd.position.set(-0.86, 0.63, s * 0.83);
      R.add(rd);
      if (s < 0) this.leftTrim.push(rd);
      const a = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 1, 12), MAT.liner);
      placeBetween(a, new THREE.Vector3(1.08, 0.99, s * 0.7), new THREE.Vector3(0.3, 1.41, s * 0.66));
      const b = rbox(0.11, 0.5, 0.05, 0.02, MAT.liner);
      b.position.set(-0.4, 1.17, s * 0.77);
      const c = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1, 0.06), MAT.liner);
      placeBetween(c, new THREE.Vector3(-1.62, 1.0, s * 0.71), new THREE.Vector3(-1.05, 1.4, s * 0.69));
      R.add(a, b, c);
      if (s < 0) this.leftTrim.push(a, b, c);
    }
    const liner = new THREE.Mesh(new THREE.BoxGeometry(1.44, 0.02, 1.46), MAT.liner);
    liner.position.set(-0.36, 1.415, 0);
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.02, 1.4), MAT.trim);
    shelf.position.set(-1.55, 0.985, 0);
    const rseat = rbox(0.5, 0.14, 1.36, 0.05, MAT.seat);
    rseat.position.set(-0.95, 0.42, 0);
    const rback = rbox(0.14, 0.58, 1.36, 0.05, MAT.seat);
    rback.position.set(-1.27, 0.74, 0);
    rback.rotation.z = 0.22;
    R.add(liner, shelf, rseat, rback);
    for (const z of [-0.45, 0, 0.45]) {
      const h = rbox(0.1, 0.15, 0.24, 0.04, MAT.seat);
      h.position.set(-1.39, 1.1, z);
      R.add(h);
    }

    // 룸미러
    this.roomMirrorPivot.position.set(0.44, 1.33, 0);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.09), MAT.black);
    stem.position.set(0.02, 0.05, 0);
    const mbody = rbox(0.035, 0.075, 0.26, 0.02, MAT.black);
    this.roomMirrorGlass = new THREE.Mesh(new THREE.PlaneGeometry(0.235, 0.058), new THREE.MeshStandardMaterial({ color: 0x9fb4c8, metalness: 1, roughness: 0.05 }));
    this.roomMirrorGlass.rotation.y = -Math.PI / 2;
    this.roomMirrorGlass.position.x = -0.0185;
    this.roomMirrorPivot.add(stem, mbody, this.roomMirrorGlass);
    R.add(this.roomMirrorPivot);
    this.mk('roomMirror', this.roomMirrorPivot, -0.02, 0.05, 0);

    // 안전벨트
    this.tongue = new THREE.Mesh(new RoundedBoxGeometry(0.02, 0.06, 0.035, 2, 0.006), MAT.buckle);
    const buckleBody = rbox(0.04, 0.08, 0.035, 0.01, MAT.black);
    const buckleBtn = rbox(0.012, 0.02, 0.026, 0.004, MAT.redBtn);
    buckleBtn.position.set(0.02, 0.02, 0);
    this.buckle.add(buckleBody, buckleBtn);
    this.buckle.position.set(-0.07, 0.24, 0.27);
    this.buckle.rotation.z = -0.4;
    this.seat.root.add(this.buckle);
    R.add(this.beltRibbon.mesh, this.tongue);
    this.mk('buckle', this.buckle, 0, 0.05, 0);
    const dRing = rbox(0.03, 0.06, 0.02, 0.008, MAT.trim);
    dRing.position.set(-0.4, 1.22, DZ - 0.37);
    R.add(dRing);

    // 시트 레버 앵커
    this.anchors.seatLever = this.seat.lever;
    this.mk('headrest', this.seat.headrest, 0, 0.2, 0);

    this.interiorLight = new THREE.PointLight(0xfff4e8, 0, 2.8, 1.5);
    this.interiorLight.position.set(-0.2, 1.3, 0);
    R.add(this.interiorLight);

    R.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.receiveShadow = true;
    });
    this.apply(0, 0);
  }

  private mk(name: string, parent: THREE.Object3D, x: number, y: number, z: number) {
    const o = new THREE.Object3D();
    o.position.set(x, y, z);
    parent.add(o);
    this.anchors[name] = o;
    return o;
  }

  setCutaway(on: boolean) {
    this.doorL.visible = !on;
    for (const o of this.leftTrim) o.visible = !on;
  }

  setInteriorLight(k: number) {
    this.interiorLight.intensity = k * 2.2;
  }

  /** 매 프레임 조작 상태를 메시에 반영 */
  apply(dt: number, time: number) {
    this.seat.apply();
    this.colPivot.rotation.z = -this.tilt * 0.12;
    this.colSlide.position.set(-0.92 * this.tele * 0.06, 0.391 * this.tele * 0.06, 0);
    this.wheelSpin.rotation.z = -this.steer;
    this.tiltLeverG.rotation.x = this.tiltLever * 0.5;

    this.leftStalk.rotation.set(0, -this.lStalkPush * 0.14, -this.lStalkV * 0.17);
    this.lightRing.rotation.x = -this.lightDial * 0.55;
    this.rightStalk.rotation.set(0, -this.rStalkPull * 0.14, this.rStalkV * 0.1);

    this.colGear.visible = this.gearType === 'column';
    this.colGear.rotation.z = this.colGearV * 0.18;
    this.colGearBtnMesh.position.x = 0.127 - this.colGearBtn * 0.004;

    this.leverSet.visible = this.gearType === 'lever';
    const leverAngles = [-0.3, -0.1, 0.06, 0.22];
    const li = Math.max(0, Math.min(3, this.leverPos));
    const i0 = Math.floor(li);
    const i1 = Math.min(3, i0 + 1);
    this.lever.rotation.z = lerp(leverAngles[i0], leverAngles[i1], li - i0);
    this.leverKnobBtn.position.z = -0.03 + this.leverBtn * 0.005;
    const gearChar = (['P', 'R', 'N', 'D'] as const)[Math.round(li)];
    if (this.prndKey !== gearChar && this.leverSet.visible) {
      this.prndKey = gearChar;
      const c = this.prndTex.image as HTMLCanvasElement;
      const ctx = c.getContext('2d')!;
      ctx.clearRect(0, 0, 64, 256);
      ctx.font = `800 40px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ['P', 'R', 'N', 'D'].forEach((g, i) => {
        ctx.fillStyle = g === gearChar ? '#ffffff' : '#5d6673';
        ctx.fillText(g, 32, 34 + i * 64);
      });
      this.prndTex.needsUpdate = true;
    }

    this.dialSet.visible = this.gearType === 'dial';
    this.dialKnob.rotation.y = -this.dialPos * 0.7;
    this.dialPBtnMesh.position.y = 0.008 - this.dialPBtn * 0.004;

    this.epbG.visible = !this.mechanical;
    this.autoHoldG.visible = !this.mechanical;
    this.handbrakeG.visible = this.mechanical;
    this.epbG.rotation.z = this.epbSwitch * 0.25;
    this.autoHoldG.position.y = 0.612 - this.autoHoldBtn * 0.004;
    const ah = this.cluster.state.autoHold;
    this.autoHoldLed.color.set(ah === 'off' ? 0x1d2228 : ah === 'active' ? 0x35d07a : 0xe9eef5);
    this.handbrakeG.rotation.z = -lerp(0.05, 0.42, this.handbrake);
    this.handbrakeBtnMesh.position.x = -0.305 + this.handbrakeBtn * 0.008;

    this.startG.position.x = 0.556 + this.startBtn * 0.006;
    const glow = { off: 0x2a2f38, acc: 0xffa53a, on: 0xff7a2a, run: 0x4b9bff }[this.startGlow];
    this.startRing.color.set(glow);
    this.hazardG.position.x = 0.616 + this.hazardBtn * 0.006;
    this.hazardMat.emissiveIntensity = this.hazardLit && blinkOn(time) ? 2.5 : 0.1;

    this.brakePedal.rotation.z = this.brake * 0.28;
    this.accelPedal.rotation.z = this.accel * 0.2;

    this.mirrorKnob.rotation.y = this.mirrorSel === 'L' ? 0.6 : this.mirrorSel === 'R' ? -0.6 : 0;
    this.mirrorPadG.rotation.set(this.mirrorPad.x * 0.25, 0, -this.mirrorPad.y * 0.25);
    this.roomMirrorPivot.rotation.set(0, this.roomMirror.x, this.roomMirror.y, 'YXZ');
    this.cluster.update(time);
    void dt;
  }

  /** 운전석 시트 기준 운전자 팔다리 기본 자세에 쓰는 기준점들 */
  wheelPoint(angleDeg: number, out = new THREE.Vector3()) {
    const a = angleDeg * DEG;
    out.set(Math.cos(a) * 0.185, Math.sin(a) * 0.185, 0);
    return this.wheelSpin.localToWorld(out);
  }

  /** 손이 핸들 림을 쥐는 자세 (부모 = car.root 좌표) */
  wheelGrip(angleDeg: number, carRoot: THREE.Object3D, onSpin = true) {
    const a = angleDeg * DEG;
    const frame = onSpin ? this.wheelSpin : this.colFrame;
    frame.updateWorldMatrix(true, false);
    const radial = new THREE.Vector3(Math.cos(a), Math.sin(a), 0);
    const rimP = radial.clone().multiplyScalar(0.185);
    const pos = rimP.clone().addScaledVector(radial, 0.045).add(new THREE.Vector3(0, 0, 0.075));
    const finger = new THREE.Vector3(0, 0, -1).addScaledVector(radial, -0.35);
    const toCar = (v: THREE.Vector3, dir: boolean) => {
      const w = dir ? v.clone().transformDirection(frame.matrixWorld) : frame.localToWorld(v.clone());
      if (dir) {
        const inv = new THREE.Matrix4().copy(carRoot.matrixWorld).invert();
        return w.transformDirection(inv);
      }
      return carRoot.worldToLocal(w);
    };
    return { pos: toCar(pos, false), finger: toCar(finger, true), back: toCar(radial, true) };
  }

  /** 벨트 진행도(0=걸려 있음, 1=체결) */
  updateBelt(k: number, man: Mannequin | null) {
    this.beltRibbon.mesh.visible = this.beltVisible;
    this.tongue.visible = this.beltVisible;
    if (!this.beltVisible) return;
    const D = new THREE.Vector3(-0.4, 1.2, DZ - 0.355);
    const A = this.seat.root.position.clone().add(new THREE.Vector3(-0.2, 0.1, -0.27));
    const B = this.buckle.getWorldPosition(new THREE.Vector3());
    this.root.worldToLocal(B);
    B.y += 0.05;
    const stowT = new THREE.Vector3(-0.38, 0.82, DZ - 0.36);
    const hip = this.seat.hip();
    const up = this.seat.backDir();
    const neck = hip.clone().addScaledVector(up, 0.5);
    const shL = man ? man.shoulderL.clone() : neck.clone().add(new THREE.Vector3(0, -0.06, -0.19));
    const S = shL.clone().lerp(neck, 0.4).add(new THREE.Vector3(0.02, 0.08, 0));
    const C = shL.clone().lerp(B, 0.5).add(new THREE.Vector3(0.16, 0.02, 0));
    const L1 = hip.clone().add(new THREE.Vector3(0.15, 0.04, -0.02));
    const tCurve = new THREE.CatmullRomCurve3([
      stowT,
      new THREE.Vector3(-0.2, 1.06, DZ - 0.25),
      new THREE.Vector3(0.08, 0.95, DZ + 0.05),
      new THREE.Vector3(0.05, 0.72, DZ + 0.4),
      B,
    ]);
    const e = ease(k);
    const T = tCurve.getPoint(e);
    const w = THREE.MathUtils.smoothstep(k, 0.25, 1);
    const S2 = D.clone().lerp(T, 0.25).lerp(S, w);
    const C2 = S2.clone().lerp(T, 0.5).lerp(C, w);
    const L2 = T.clone().lerp(A, 0.5).lerp(L1, w);
    const pts = k < 0.02 ? [D, D.clone().lerp(T, 0.5), T, T.clone().lerp(A, 0.5), A] : [D, S2, C2, T, L2, A];
    this.beltRibbon.update(pts, hip, neck);
    this.tongue.position.copy(T);
    this.tongue.lookAt(T.clone().add(new THREE.Vector3(1, 0, 0)));
    return T;
  }
}

function placeBetween(m: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3) {
  const d = new THREE.Vector3().subVectors(b, a);
  m.position.copy(a).addScaledVector(d, 0.5);
  m.scale.y = d.length();
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
}
