import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { MAT } from '../materials';
import { orient, solveIK, lerp } from '../../core/util';

export type HandPose = 'open' | 'grip' | 'point' | 'pinch' | 'relaxed' | 'press';

const CURL: Record<HandPose, { f: [number, number, number, number]; thumb: number }> = {
  open: { f: [0.08, 0.08, 0.08, 0.08], thumb: 0.1 },
  relaxed: { f: [0.45, 0.5, 0.55, 0.6], thumb: 0.3 },
  grip: { f: [1.35, 1.4, 1.45, 1.5], thumb: 0.9 },
  point: { f: [0.05, 1.5, 1.55, 1.6], thumb: 0.9 },
  pinch: { f: [0.75, 1.1, 1.3, 1.4], thumb: 0.75 },
  press: { f: [0.2, 1.4, 1.45, 1.5], thumb: 0.7 },
};

/**
 * 손 — 로컬: 손목 원점, 손가락 +Z, 손등 +Y, (오른손 기준) 엄지 +X
 */
export class Hand {
  root = new THREE.Group();
  private fingers: THREE.Group[][] = [];
  private thumb: THREE.Group[] = [];
  private cur = { ...CURL.relaxed, f: [...CURL.relaxed.f] as [number, number, number, number] };

  constructor(public left: boolean, mat: THREE.Material = MAT.skin, cuff = false) {
    const g = new THREE.Group();
    this.root.add(g);
    if (left) g.scale.x = -1;
    const palm = new THREE.Mesh(new RoundedBoxGeometry(0.084, 0.03, 0.095, 3, 0.012), mat);
    palm.position.set(0, 0, 0.048);
    g.add(palm);
    const segGeo1 = new THREE.CapsuleGeometry(0.0095, 0.03, 4, 8);
    segGeo1.rotateX(Math.PI / 2);
    segGeo1.translate(0, 0, 0.02);
    const segGeo2 = new THREE.CapsuleGeometry(0.0088, 0.022, 4, 8);
    segGeo2.rotateX(Math.PI / 2);
    segGeo2.translate(0, 0, 0.016);
    const xs = [0.03, 0.01, -0.01, -0.03]; // 검지 → 새끼
    const lens = [1, 1.08, 1.0, 0.82];
    xs.forEach((x, i) => {
      const j1 = new THREE.Group();
      j1.position.set(x, 0, 0.094);
      const s1 = new THREE.Mesh(segGeo1, mat);
      j1.add(s1);
      const j2 = new THREE.Group();
      j2.position.set(0, 0, 0.038 * lens[i]);
      j2.add(new THREE.Mesh(segGeo2, mat));
      j1.add(j2);
      j1.scale.setScalar(lens[i]);
      g.add(j1);
      this.fingers.push([j1, j2]);
    });
    const t1 = new THREE.Group();
    t1.position.set(0.04, -0.008, 0.03);
    t1.rotation.y = 0.75;
    t1.add(new THREE.Mesh(segGeo1, mat));
    const t2 = new THREE.Group();
    t2.position.set(0, 0, 0.036);
    t2.add(new THREE.Mesh(segGeo2, mat));
    t1.add(t2);
    g.add(t1);
    this.thumb = [t1, t2];
    if (cuff) {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.033, 0.036, 0.06, 16), MAT.shirt);
      c.rotation.x = Math.PI / 2;
      c.position.z = -0.02;
      c.scale.set(1.25, 1, 0.8);
      g.add(c);
    }
    this.setPose('relaxed', 1);
    this.root.traverse((o) => (o.castShadow = true));
  }

  /** 포즈를 k(0..1)만큼 블렌드 */
  setPose(p: HandPose, k = 1) {
    const t = CURL[p];
    for (let i = 0; i < 4; i++) this.cur.f[i] = lerp(this.cur.f[i], t.f[i], k);
    this.cur.thumb = lerp(this.cur.thumb, t.thumb, k);
    this.fingers.forEach(([a, b], i) => {
      a.rotation.x = this.cur.f[i];
      b.rotation.x = this.cur.f[i] * 1.1;
    });
    this.thumb[0].rotation.x = this.cur.thumb * 0.6;
    this.thumb[1].rotation.x = this.cur.thumb * 0.8;
  }

  /** 부모 좌표계에서 손목 위치 / 손가락 방향 / 손등 방향 지정 */
  place(pos: THREE.Vector3, fingerDir: THREE.Vector3, backDir: THREE.Vector3) {
    this.root.position.copy(pos);
    orient(this.root, fingerDir, backDir);
  }
}

export interface HandTarget {
  pos: THREE.Vector3;
  finger: THREE.Vector3;
  back: THREE.Vector3;
  pose: HandPose;
}
export interface FootTarget {
  ankle: THREE.Vector3;
  toe: THREE.Vector3;
}

const LIMB = {
  thigh: 0.45,
  shin: 0.43,
  upper: 0.29,
  fore: 0.27,
  torso: 0.5,
  foot: 0.2,
};

/** 앉아 있는 운전자 마네킹 — 2본 IK로 팔·다리 계산 */
export class Mannequin {
  root = new THREE.Group();
  private mats = {
    shirt: MAT.shirt.clone(),
    pants: MAT.pants.clone(),
    skin: MAT.skin.clone(),
    shoe: MAT.shoe.clone(),
    hair: MAT.hair.clone(),
    black: MAT.black.clone(),
  };
  handL = new Hand(true, this.mats.skin);
  handR = new Hand(false, this.mats.skin);
  head = new THREE.Group();
  private parts: Record<string, THREE.Mesh> = {};
  shoulderL = new THREE.Vector3();
  shoulderR = new THREE.Vector3();
  kneeR = new THREE.Vector3();
  hipR = new THREE.Vector3();
  ankleR = new THREE.Vector3();
  wristR = new THREE.Vector3();

  constructor() {
    const cap = (name: string, r: number, len: number, mat: THREE.Material) => {
      const g = new THREE.CapsuleGeometry(r, Math.max(0.01, len), 6, 14);
      const m = new THREE.Mesh(g, mat);
      m.castShadow = true;
      this.parts[name] = m;
      this.root.add(m);
      return m;
    };
    cap('torso', 0.13, LIMB.torso - 0.12, this.mats.shirt).scale.set(0.85, 1, 1.32);
    cap('pelvis', 0.13, 0.12, this.mats.pants).scale.set(0.95, 1, 1.25);
    cap('neck', 0.045, 0.06, this.mats.skin);
    for (const s of ['L', 'R']) {
      cap('upper' + s, 0.048, LIMB.upper, this.mats.shirt);
      cap('fore' + s, 0.04, LIMB.fore, this.mats.skin);
      cap('thigh' + s, 0.07, LIMB.thigh, this.mats.pants);
      cap('shin' + s, 0.052, LIMB.shin, this.mats.pants);
      const foot = new THREE.Mesh(new RoundedBoxGeometry(0.1, 0.075, LIMB.foot + 0.06, 3, 0.03), this.mats.shoe);
      foot.castShadow = true;
      this.parts['foot' + s] = foot;
      this.root.add(foot);
    }
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.1, 24, 18), this.mats.skin);
    skull.scale.set(1.0, 1.12, 0.92);
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.104, 24, 18, 0, Math.PI * 2, 0, Math.PI * 0.55), this.mats.hair);
    hair.scale.set(1.04, 1.12, 0.96);
    hair.position.set(-0.012, 0.012, 0);
    hair.rotation.z = 0.25;
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.018, 10, 8), this.mats.skin);
    nose.position.set(0.098, -0.005, 0);
    this.head.add(skull, hair, nose);
    for (const z of [-0.035, 0.035]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.009, 8, 6), this.mats.black);
      eye.position.set(0.088, 0.02, z);
      this.head.add(eye);
    }
    this.root.add(this.head, this.handL.root, this.handR.root);
    this.head.traverse((o) => (o.castShadow = true));
  }

  /** 반투명하게(페달처럼 다리 뒤에 가려지는 것을 보여줄 때) */
  setOpacity(body: number, shoes = body) {
    for (const [k, m] of Object.entries(this.mats)) {
      const o = k === 'shoe' ? shoes : body;
      m.transparent = o < 1;
      m.opacity = o;
      m.depthWrite = o >= 1;
    }
  }

  private bone(name: string, a: THREE.Vector3, b: THREE.Vector3) {
    const m = this.parts[name];
    const d = new THREE.Vector3().subVectors(b, a);
    m.position.copy(a).addScaledVector(d, 0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  }

  update(o: {
    hip: THREE.Vector3;
    back: THREE.Vector3;
    hands: [HandTarget, HandTarget];
    feet: [FootTarget, FootTarget];
  }) {
    const side = new THREE.Vector3(0, 0, 1);
    const up = o.back.clone().normalize();
    const neckBase = o.hip.clone().addScaledVector(up, LIMB.torso);
    this.bone('pelvis', o.hip.clone().addScaledVector(up, -0.02), o.hip.clone().addScaledVector(up, 0.12));
    this.bone('torso', o.hip.clone().addScaledVector(up, 0.14), neckBase.clone().addScaledVector(up, -0.06));
    const headUp = up.clone().lerp(new THREE.Vector3(0, 1, 0), 0.6).normalize();
    const headC = neckBase.clone().addScaledVector(headUp, 0.15).add(new THREE.Vector3(0.02, 0, 0));
    this.bone('neck', neckBase, headC.clone().addScaledVector(headUp, -0.08));
    this.head.position.copy(headC);
    this.head.rotation.z = Math.atan2(-headUp.x, headUp.y) * 0.5;

    // 팔
    ['L', 'R'].forEach((s, i) => {
      const sign = i === 0 ? -1 : 1;
      const sh = neckBase.clone().addScaledVector(up, -0.06).addScaledVector(side, sign * 0.19);
      (i === 0 ? this.shoulderL : this.shoulderR).copy(sh);
      const t = o.hands[i];
      const hint = new THREE.Vector3(-0.2, -1, sign * 0.7);
      const { mid, end } = solveIK(sh, t.pos, LIMB.upper, LIMB.fore, hint);
      this.bone('upper' + s, sh, mid);
      this.bone('fore' + s, mid, end);
      if (i === 1) this.wristR.copy(end);
      const hand = i === 0 ? this.handL : this.handR;
      hand.place(end, t.finger, t.back);
      hand.setPose(t.pose, 0.35);
    });

    // 다리
    ['L', 'R'].forEach((s, i) => {
      const sign = i === 0 ? -1 : 1;
      const hj = o.hip.clone().addScaledVector(side, sign * 0.1);
      const f = o.feet[i];
      const { mid, end } = solveIK(hj, f.ankle, LIMB.thigh, LIMB.shin, new THREE.Vector3(0.3, 1, sign * 0.15));
      this.bone('thigh' + s, hj, mid);
      this.bone('shin' + s, mid, end);
      if (i === 1) {
        this.hipR.copy(hj);
        this.kneeR.copy(mid);
        this.ankleR.copy(end);
      }
      const foot = this.parts['foot' + s];
      const dir = new THREE.Vector3().subVectors(f.toe, f.ankle).normalize();
      foot.position.copy(end).addScaledVector(dir, LIMB.foot / 2 - 0.01).add(new THREE.Vector3(0, -0.035, 0));
      orient(foot, dir, new THREE.Vector3(0, 1, 0));
    });
  }
}
