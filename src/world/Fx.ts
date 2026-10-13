import * as THREE from 'three';
import { MAT } from './materials';

/** 바닥에 그려지는 바퀴 궤적 */
export class Trail {
  mesh: THREE.Mesh;
  private pts: THREE.Vector3[] = [];
  private max = 600;
  private geo = new THREE.BufferGeometry();

  constructor(color: number, private width = 0.07) {
    this.geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.max * 2 * 3), 3));
    const idx: number[] = [];
    for (let i = 0; i < this.max - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
    this.geo.setIndex(idx);
    this.geo.setDrawRange(0, 0);
    this.mesh = new THREE.Mesh(
      this.geo,
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }),
    );
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
  }

  clear() {
    this.pts = [];
    this.geo.setDrawRange(0, 0);
  }

  push(p: THREE.Vector3) {
    const last = this.pts[this.pts.length - 1];
    if (last && last.distanceToSquared(p) < 0.03 * 0.03) return;
    if (this.pts.length >= this.max) return;
    this.pts.push(p.clone().setY(0.02));
    const pos = this.geo.getAttribute('position') as THREE.BufferAttribute;
    const n = this.pts.length;
    for (let i = Math.max(0, n - 2); i < n; i++) {
      const a = this.pts[Math.max(0, i - 1)];
      const b = this.pts[Math.min(n - 1, i + 1)];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const len = Math.hypot(dx, dz) || 1;
      const sx = (-dz / len) * this.width * 0.5;
      const sz = (dx / len) * this.width * 0.5;
      const p0 = this.pts[i];
      pos.setXYZ(i * 2, p0.x + sx, 0.02, p0.z + sz);
      pos.setXYZ(i * 2 + 1, p0.x - sx, 0.02, p0.z - sz);
    }
    pos.needsUpdate = true;
    this.geo.setDrawRange(0, Math.max(0, (n - 1) * 6));
  }
}

/** 보행자(차 한 바퀴 돌기 연출) */
export class Walker {
  root = new THREE.Group();
  private legs: THREE.Mesh[] = [];
  private arms: THREE.Mesh[] = [];
  constructor() {
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.5, 6, 14), MAT.shirt);
    body.position.y = 1.15;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 20, 16), MAT.skin);
    head.position.y = 1.62;
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.125, 20, 16, 0, Math.PI * 2, 0, Math.PI * 0.55), MAT.hair);
    hair.position.y = 1.63;
    this.root.add(body, head, hair);
    for (const s of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.62, 4, 10), MAT.pants);
      leg.geometry.translate(0, -0.38, 0);
      leg.position.set(0, 0.84, s * 0.09);
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.5, 4, 10), MAT.shirt);
      arm.geometry.translate(0, -0.28, 0);
      arm.position.set(0, 1.42, s * 0.22);
      this.legs.push(leg);
      this.arms.push(arm);
      this.root.add(leg, arm);
    }
    this.root.traverse((o) => (o.castShadow = true));
  }
  /** phase: 걸음 주기(rad), lookDown: 0..1 허리 숙이기 */
  pose(phase: number, crouch = 0) {
    const sw = Math.sin(phase) * 0.5 * (1 - crouch);
    this.legs[0].rotation.z = sw;
    this.legs[1].rotation.z = -sw;
    this.arms[0].rotation.z = -sw * 0.8;
    this.arms[1].rotation.z = sw * 0.8;
    this.root.children[0].rotation.z = -crouch * 0.5;
    this.root.position.y = Math.abs(Math.cos(phase)) * 0.03 - crouch * 0.25;
  }
}

/** 장면 효과 모음 */
export class Fx {
  group = new THREE.Group();
  trails = [new Trail(0x2f8bff), new Trail(0xff4d3d)];
  puddle: THREE.Mesh;
  puddleMat: THREE.MeshStandardMaterial;
  walker = new Walker();
  ring: THREE.Mesh;
  ringMat: THREE.MeshBasicMaterial;
  line: THREE.Group;
  private dims = new Map<string, THREE.Group>();

  constructor() {
    this.group.add(...this.trails.map((t) => t.mesh));
    this.puddleMat = new THREE.MeshStandardMaterial({ color: 0x1b1410, roughness: 0.08, metalness: 0.2, transparent: true, opacity: 0.9 });
    const shape = new THREE.Shape();
    for (let i = 0; i <= 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const r = 0.22 + Math.sin(a * 3) * 0.04 + Math.cos(a * 5) * 0.03;
      if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r * 0.75);
      else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r * 0.75);
    }
    this.puddle = new THREE.Mesh(new THREE.ShapeGeometry(shape), this.puddleMat);
    this.puddle.rotation.x = -Math.PI / 2;
    this.puddle.renderOrder = 1;
    this.ringMat = new THREE.MeshBasicMaterial({ color: 0xffd34d, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide });
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.34, 0.42, 48), this.ringMat);
    this.ring.rotation.x = -Math.PI / 2;
    this.line = new THREE.Group();
    for (let i = 0; i < 9; i++) {
      const d = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.22), new THREE.MeshBasicMaterial({ color: 0xffd34d, depthWrite: false, transparent: true }));
      d.rotation.x = -Math.PI / 2;
      d.position.set(0, 0.022, -1.6 + i * 0.4);
      this.line.add(d);
    }
    this.group.add(this.puddle, this.walker.root, this.ring, this.line);
    this.reset();
  }

  reset() {
    this.trails.forEach((t) => t.clear());
    this.puddle.visible = false;
    this.walker.root.visible = false;
    this.ring.visible = false;
    this.line.visible = false;
    this.line.children.forEach((c) => (((c as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 1));
    for (const d of this.dims.values()) this.group.remove(d);
    this.dims.clear();
  }

  /** 두 점 사이 치수선 */
  dim(id: string, a: THREE.Vector3, b: THREE.Vector3, color = 0xffd34d) {
    let g = this.dims.get(id);
    if (g) this.group.remove(g);
    g = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true });
    const d = new THREE.Vector3().subVectors(b, a);
    const len = d.length();
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.025, len, 0.025), mat);
    bar.position.copy(a).addScaledVector(d, 0.5);
    bar.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize());
    g.add(bar);
    for (const p of [a, b]) {
      const tick = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.025, 0.025), mat);
      tick.position.copy(p);
      tick.quaternion.copy(bar.quaternion);
      g.add(tick);
    }
    g.renderOrder = 5;
    g.traverse((o) => (o.renderOrder = 5));
    this.group.add(g);
    this.dims.set(id, g);
  }

  hideDim(id: string, hidden = true) {
    const g = this.dims.get(id);
    if (g) g.visible = !hidden;
  }

  update(time: number) {
    if (this.ring.visible) {
      const k = (time * 1.2) % 1;
      this.ring.scale.setScalar(0.8 + k * 0.6);
      this.ringMat.opacity = 0.9 * (1 - k);
    }
  }
}
