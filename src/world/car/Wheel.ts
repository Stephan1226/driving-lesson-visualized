import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { MAT } from '../materials';
import { lerp } from '../../core/util';

export const TIRE_R = 0.335;
const BASE_R = 0.322; // 트레드 블록이 올라가는 바닥 반경
const TREAD_H = 0.013; // 새 타이어 트레드 높이(시각적으로 약간 과장)
const COLS = [-0.075, -0.025, 0.025, 0.075];
const PER_COL = 56;

/**
 * 바퀴: root(허브, 조향) → flip(우측 바퀴 180°) → spin(굴림) → rubber(타이어+트레드)
 * 바퀴 로컬 좌표: 축 = Z, 바깥쪽 면 = -Z
 */
export class Wheel {
  root = new THREE.Group();
  flip = new THREE.Group();
  spin = new THREE.Group();
  rubber = new THREE.Group();
  brake = new THREE.Group();
  rimMat: THREE.MeshStandardMaterial;
  caliperMat?: THREE.MeshStandardMaterial;
  tread?: THREE.InstancedMesh;
  padFriction: THREE.Mesh[] = [];
  padBacking: THREE.Mesh[] = [];
  coin?: THREE.Group;
  anchors: Record<string, THREE.Object3D> = {};
  private treadWear = -1;
  private _deflate = 0;

  constructor(public side: -1 | 1, public front: boolean, detailed: boolean) {
    this.root.add(this.flip);
    this.flip.rotation.y = side === 1 ? Math.PI : 0;
    this.flip.add(this.spin, this.brake);
    this.spin.add(this.rubber);

    // 타이어 (Lathe 단면 회전체)
    const top = detailed ? BASE_R : TIRE_R - 0.004;
    const prof = [
      [0.232, -0.098], [0.262, -0.108], [0.3, -0.112], [top - 0.006, -0.106], [top - 0.001, -0.095],
      [top, -0.06], [top, 0.06], [top - 0.001, 0.095], [top - 0.006, 0.106], [0.3, 0.112], [0.262, 0.108], [0.232, 0.098],
    ].map(([r, y]) => new THREE.Vector2(r, y));
    const tireGeo = new THREE.LatheGeometry(prof, detailed ? 72 : 40);
    tireGeo.rotateX(Math.PI / 2);
    const tire = new THREE.Mesh(tireGeo, MAT.rubber);
    tire.castShadow = true;
    this.rubber.add(tire);

    // 휠(림)
    this.rimMat = MAT.alloy.clone();
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.228, 0.228, 0.19, 36, 1, true), MAT.darkAlloy.clone());
    barrel.rotation.x = Math.PI / 2;
    (barrel.material as THREE.Material).side = THREE.DoubleSide;
    const lip = new THREE.Mesh(new THREE.TorusGeometry(0.226, 0.011, 8, 48), this.rimMat);
    lip.position.z = -0.088;
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.07, 0.04, 24), this.rimMat);
    hub.rotation.x = Math.PI / 2;
    hub.position.z = -0.078;
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.01, 20), MAT.chrome);
    cap.rotation.x = Math.PI / 2;
    cap.position.z = -0.1;
    this.spin.add(barrel, lip, hub, cap);
    const spokeGeo = new RoundedBoxGeometry(0.17, 0.042, 0.022, 2, 0.008);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const s = new THREE.Mesh(spokeGeo, this.rimMat);
      s.position.set(Math.cos(a) * 0.145, Math.sin(a) * 0.145, -0.08);
      s.rotation.z = a;
      this.spin.add(s);
    }
    this.rimParts = [barrel, lip, hub, ...this.spin.children.filter((c) => (c as THREE.Mesh).geometry === spokeGeo)];

    // 브레이크 디스크·캘리퍼 (회전하지 않음)
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.026, 44), MAT.disc);
    disc.rotation.x = Math.PI / 2;
    const discHat = new THREE.Mesh(new THREE.CylinderGeometry(0.088, 0.088, 0.05, 28), MAT.darkAlloy);
    discHat.rotation.x = Math.PI / 2;
    discHat.position.z = -0.03;
    this.brake.add(disc, discHat);
    if (detailed) {
      const ang = ((side === -1 ? 150 : 30) * Math.PI) / 180;
      this.caliperMat = MAT.caliper.clone();
      const cal = new THREE.Mesh(new RoundedBoxGeometry(0.075, 0.16, 0.1, 3, 0.02), this.caliperMat);
      cal.position.set(Math.cos(ang) * 0.192, Math.sin(ang) * 0.192, 0);
      cal.rotation.z = ang;
      this.brake.add(cal);
      for (const dir of [-1, 1]) {
        const fr = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.11, 1), MAT.pad);
        const bk = new THREE.Mesh(new THREE.BoxGeometry(0.056, 0.118, 0.004), MAT.backing);
        for (const m of [fr, bk]) {
          m.position.set(Math.cos(ang) * 0.172, Math.sin(ang) * 0.172, 0);
          m.rotation.z = ang;
          m.userData.dir = dir;
          this.brake.add(m);
        }
        this.padFriction.push(fr);
        this.padBacking.push(bk);
      }
      const padAnchor = new THREE.Object3D();
      padAnchor.position.set(Math.cos(ang) * 0.172, Math.sin(ang) * 0.172, -0.03);
      this.brake.add(padAnchor);
      this.anchors.pad = padAnchor;
      const discAnchor = new THREE.Object3D();
      discAnchor.position.set(0.12, -0.08, -0.02);
      this.brake.add(discAnchor);
      this.anchors.disc = discAnchor;
      this.setPadWear(0);

      // 트레드 블록
      const blockGeo = new THREE.BoxGeometry(1, 1, 1);
      this.tread = new THREE.InstancedMesh(blockGeo, MAT.tread, COLS.length * PER_COL + 8);
      this.tread.castShadow = true;
      this.rubber.add(this.tread);
      this.setTreadWear(0);

      // 동전(100원) — 트레드 홈에 꽂는 장면용
      this.coin = makeCoin();
      this.coin.visible = false;
      this.spin.add(this.coin);

      const treadAnchor = new THREE.Object3D();
      treadAnchor.position.set(TIRE_R + 0.005, 0.0, -0.06);
      this.spin.add(treadAnchor);
      this.anchors.tread = treadAnchor;
    }
    const tireAnchor = new THREE.Object3D();
    tireAnchor.position.set(0, 0.2, -0.12);
    this.flip.add(tireAnchor);
    this.anchors.tire = tireAnchor;
  }

  rimParts: THREE.Object3D[];

  /** 0 = 새 타이어, 1 = 한계까지 마모 */
  setTreadWear(w: number) {
    if (!this.tread || Math.abs(w - this.treadWear) < 1e-4) return;
    this.treadWear = w;
    const h = lerp(TREAD_H, TREAD_H * 0.17, w);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    let i = 0;
    COLS.forEach((zc, ci) => {
      for (let k = 0; k < PER_COL; k++) {
        const a = ((k + (ci % 2) * 0.5) / PER_COL) * Math.PI * 2;
        const rr = BASE_R + h / 2;
        p.set(Math.cos(a) * rr, Math.sin(a) * rr, zc);
        q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), a - Math.PI / 2);
        s.set(((Math.PI * 2 * TIRE_R) / PER_COL) * 0.84, h, 0.04);
        m.compose(p, q, s);
        this.tread!.setMatrixAt(i++, m);
      }
    });
    // 마모 한계선(트레드 홈 속 돌기, 1.6mm)
    const wh = TREAD_H * 0.2;
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + 0.03;
      p.set(Math.cos(a) * (BASE_R + wh / 2), Math.sin(a) * (BASE_R + wh / 2), 0);
      q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), a - Math.PI / 2);
      s.set(0.016, wh, 0.012);
      m.compose(p, q, s);
      this.tread!.setMatrixAt(i++, m);
    }
    this.tread.instanceMatrix.needsUpdate = true;
  }

  /** 0 = 새 패드(약 10mm), 1 = 교체 시점(3mm 이하) */
  setPadWear(w: number) {
    const t = lerp(0.012, 0.0032, w);
    this.padFriction.forEach((m) => {
      const dir = m.userData.dir as number;
      m.scale.z = t;
      m.position.z = dir * (0.013 + t / 2);
    });
    this.padBacking.forEach((m) => {
      const dir = m.userData.dir as number;
      m.position.z = dir * (0.013 + t + 0.002);
    });
  }

  /** 0..1 — 투시 모드: 휠과 캘리퍼를 반투명하게 */
  setXray(k: number) {
    const op = lerp(1, 0.14, k);
    for (const p of this.rimParts) {
      const m = (p as THREE.Mesh).material as THREE.MeshStandardMaterial;
      m.transparent = k > 0.001;
      m.opacity = op;
      m.depthWrite = k < 0.5;
    }
    if (this.caliperMat) {
      this.caliperMat.transparent = k > 0.001;
      this.caliperMat.opacity = lerp(1, 0.38, k);
      this.caliperMat.depthWrite = k < 0.5;
    }
  }

  /** 공기압 부족 표현 (0..1) */
  setDeflate(k: number) {
    if (k === this._deflate) return;
    this._deflate = k;
    const sy = 1 - 0.085 * k;
    this.rubber.scale.set(1, 1, 1 + 0.16 * k);
    // 스핀이 0일 때만 사용하는 연출이므로 단순히 세로로 눌러준다
    this.rubber.scale.y = sy;
    this.rubber.scale.x = 1 + 0.02 * k;
    this.rubber.position.y = -TIRE_R * (1 - sy);
  }
}

function makeCoin(): THREE.Group {
  const g = new THREE.Group();
  const R = 0.012;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d')!;
  const grad = ctx.createRadialGradient(110, 100, 10, 128, 128, 128);
  grad.addColorStop(0, '#f1f3f5');
  grad.addColorStop(1, '#a9aeb5');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(128, 128, 127, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#8d939b';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.arc(128, 128, 118, 0, Math.PI * 2);
  ctx.stroke();
  // 인물(옆모습) + 감투
  ctx.fillStyle = '#878d95';
  ctx.beginPath();
  ctx.ellipse(132, 120, 38, 46, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(108, 150, 50, 50);
  ctx.fillStyle = '#4a4f57';
  ctx.beginPath(); // 감투
  ctx.moveTo(92, 82);
  ctx.quadraticCurveTo(130, 20, 172, 82);
  ctx.lineTo(178, 92);
  ctx.lineTo(86, 92);
  ctx.closePath();
  ctx.fill();
  ctx.fillRect(110, 44, 44, 16);
  ctx.fillStyle = '#6a7078';
  ctx.font = '700 40px system-ui';
  ctx.textAlign = 'center';
  ctx.fillText('100', 128, 232);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const faceMat = new THREE.MeshStandardMaterial({ map: tex, metalness: 0.6, roughness: 0.35 });
  const face = new THREE.Mesh(new THREE.CircleGeometry(R, 48), faceMat);
  face.rotation.y = Math.PI; // 바깥쪽(-Z)을 바라봄
  face.position.z = -0.0008;
  const back = new THREE.Mesh(new THREE.CircleGeometry(R, 48), faceMat);
  back.position.z = 0.0008;
  const edge = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 0.0016, 48, 1, true), MAT.alloy);
  edge.rotation.x = Math.PI / 2;
  g.add(face, back, edge);
  g.rotation.z = Math.PI / 2; // 감투가 아래(바퀴 중심 쪽)로
  return g;
}

/** 동전을 꽂는 바퀴 위 각도(로컬, 0 = 정면, 90° = 꼭대기) */
export const COIN_ANGLE = (60 * Math.PI) / 180;

/** 동전 꽂기 진행도 0..1 */
export function placeCoin(w: Wheel, k: number) {
  if (!w.coin) return;
  w.coin.visible = k > 0;
  const r = lerp(BASE_R + 0.072, BASE_R + 0.012, k);
  w.coin.position.set(Math.cos(COIN_ANGLE) * r, Math.sin(COIN_ANGLE) * r, 0);
  w.coin.rotation.z = COIN_ANGLE + Math.PI / 2;
}
