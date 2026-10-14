/** Chapter 2 도로 장면 공용 도우미: 경로 조각, 다른 차·보행자 움직이기, 카메라 섞기 */
import * as THREE from 'three';
import type { Ctx } from './context';
import type { CamPose } from './types';
import { DrivePath, spiralAngle, type Pose, type Seg } from '../core/path';
import type { Car } from '../world/car/Car';
import { lerp, motion, type MotionKey } from '../core/util';

export const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** 핸들을 서서히 감았다가 다시 풀며 angle만큼 도는 모퉁이 (dir: 1 = 왼쪽, −1 = 오른쪽) */
export const corner = (dir: 1 | -1, r: number, easeLen: number, angle = Math.PI / 2): Seg[] => [
  { type: 'spiral', len: easeLen, r, dir },
  { type: 'arc', r, dir, a: angle - 2 * spiralAngle(easeLen, r) },
  { type: 'spiral', len: easeLen, r, dir, out: true },
];
export const cornerLen = (r: number, easeLen: number, angle = Math.PI / 2) => r * angle + easeLen;

/** 차 방향 벡터 */
export const fwd = (h: number) => V(Math.cos(h), 0, -Math.sin(h));
export const right = (h: number) => V(Math.sin(h), 0, Math.cos(h));
export const ground = (p: Pose) => V(p.x, 0, p.z);
/** 차 로컬 좌표(+X 앞, +Z 오른쪽) → 세계 */
export const toWorld = (p: Pose, lx: number, ly: number, lz: number) =>
  ground(p).addScaledVector(fwd(p.h), lx).addScaledVector(right(p.h), lz).setY(ly);

/** 앞범퍼(차 중심에서 2.37m)가 target에 닿는 경로 위치 s (target: 앞범퍼 좌표를 받아 0이 되는 함수, 증가 방향으로 부호 변화) */
export function sWhereFront(path: DrivePath, f: (front: THREE.Vector3) => number, s0 = 0, s1 = path.length) {
  const val = (s: number) => f(toWorld(path.sample(s), 2.37, 0, 0));
  let a = s0;
  let b = s1;
  const fa = val(a);
  for (let i = 0; i < 40; i++) {
    const m = (a + b) / 2;
    if (Math.sign(val(m)) === Math.sign(fa)) a = m;
    else b = m;
  }
  return (a + b) / 2;
}

/** 경로 + 시간별 이동 거리. at(t)로 포즈, s(t)로 거리 */
export class Mover {
  travel: (t: number) => number;
  constructor(
    public path: DrivePath,
    keys: MotionKey[],
  ) {
    this.travel = motion(keys);
  }
  at(t: number) {
    return this.path.sample(this.travel(t));
  }
  /** 속도 (m/s) */
  speed(t: number) {
    return (this.travel(t + 0.05) - this.travel(t - 0.05)) / 0.1;
  }
}

export type PlanStep = ['to', number, number] | ['hold', number];
/**
 * 거리·속도 계획 → MotionKey. ['to', 거리, 그때 속도]는 시간을 (거리 차 ÷ 평균 속도)로 정해
 * 구간마다 가감속이 일정해진다. ['hold', 시각]은 그 시각까지 멈춰 있기(직전 속도 0이어야 함).
 */
export function plan(start: number, v0: number, steps: PlanStep[], t0 = 0): MotionKey[] {
  const keys: MotionKey[] = [[t0, start, v0]];
  let [t, s, v] = [t0, start, v0];
  for (const st of steps) {
    if (st[0] === 'hold') {
      t = Math.max(t, st[1]);
      keys.push([t, s, 0]);
      v = 0;
    } else {
      const [, s1, v1] = st;
      t += (s1 - s) / Math.max(0.05, (v + v1) / 2);
      s = s1;
      v = v1;
      keys.push([t, s, v]);
    }
  }
  return keys;
}

/** 다른 차를 경로 위에 놓는다 (조향·바퀴 굴림 포함) */
export function placeCar(car: Car, m: Mover, t: number) {
  const s = m.travel(t);
  const p = m.path.sample(s);
  car.root.visible = true;
  car.setPose(p.x, p.z, p.h);
  car.setSteer(p.steer);
  car.setRoll(s);
}

/** 우리 차를 Mover 위에 놓는다 */
export function driveOur(ctx: Ctx, m: Mover, t: number, steer: { v: number }, dt: number) {
  const s = m.travel(t);
  const p = m.path.sample(s);
  ctx.car.setPose(p.x, p.z, p.h);
  steer.v = dt > 0 ? lerp(steer.v, p.steer, 1 - Math.exp(-dt * 6)) : p.steer;
  ctx.car.setSteer(steer.v);
  ctx.car.setRoll(s);
  ctx.cockpit.steer = -steer.v * 4;
  ctx.car.root.updateMatrixWorld(true);
  ctx.city.setSunCenter(p.x, p.z);
  return p;
}

/** 직선 경로 */
export const straight = (start: Pose, d: number) => new DrivePath(start, [{ type: 'line', d }]);

/** 보행자: 두 점 사이를 t0부터 speed(m/s)로 걷는다. 끝에 닿으면 멈춤(숨기지 않음) */
export function walkPed(ctx: Ctx, i: number, a: [number, number], b: [number, number], t0: number, speed: number, t: number, show = true) {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const len = Math.hypot(dx, dz);
  const k = Math.min(1, Math.max(0, ((t - t0) * speed) / len));
  const x = a[0] + dx * k;
  const z = a[1] + dz * k;
  const moving = k > 0 && k < 1;
  ctx.city.placePed(i, x, z, dx, dz, moving ? (t - t0) * speed * 4.2 : 0);
  ctx.city.peds[i].holder.visible = show;
  return V(x, ctx.city.groundY(x, z), z);
}

/** 두 카메라 포즈 섞기 (a를 고쳐 씀) */
export const mix = (a: CamPose, b: CamPose, k: number): CamPose =>
  k <= 0 ? a : { pos: a.pos.lerp(b.pos, k), look: a.look.lerp(b.look, k), fov: lerp(a.fov ?? 45, b.fov ?? 45, k) };

/** 고정 카메라 */
export const fixed = (pos: [number, number, number], look: [number, number, number], fov = 45): CamPose => ({
  pos: V(...pos),
  look: V(...look),
  fov,
});

/** 차 뒤를 따라가는 카메라 — 방향은 lag초 늦게 따라와 회전이 부드럽다 */
export function chaseCam(m: Mover, t: number, back = 7.5, height = 3, side = 0.8, ahead = 4, lag = 0.8, fov = 45): CamPose {
  const c = ground(m.at(t));
  const h = m.at(t - lag).h;
  return {
    pos: c.clone().addScaledVector(fwd(h), -back).addScaledVector(right(h), side).setY(height),
    look: c.clone().addScaledVector(fwd(h), ahead).setY(0.9),
    fov,
  };
}

/** 운전석 눈높이 카메라 (우리 차), 차 로컬 방향 (lx, ly, lz)을 바라봄 */
export function eyeCam(ctx: Ctx, lookLocal: [number, number, number], fov = 62): CamPose {
  const root = ctx.car.root;
  root.updateMatrixWorld(true);
  const pos = root.localToWorld(V(-0.36, 1.22, -0.38));
  const look = root.localToWorld(V(...lookLocal));
  return { pos, look, fov };
}
