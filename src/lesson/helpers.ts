import * as THREE from 'three';
import type { Ctx } from './context';
import { blendHand, world, eyeWorld } from './context';
import type { HandTarget } from '../world/car/Driver';
import type { CamFn, Shot, V3 } from './types';
import { ease, lerp, sseg } from '../core/util';
import type { Gear } from '../world/car/Cluster';
import type { DrivePath } from '../core/path';

export const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
export const S = (t: number, pos: V3, look: V3, fov?: number): Shot => ({ t, pos, look, fov });

/** 핸들을 잡고 있는 손 (rest 자세) */
export const wheelHand = (ctx: Ctx, side: 'L' | 'R', angle?: number) => (): HandTarget => ({
  ...ctx.cockpit.wheelGrip(angle ?? (side === 'L' ? 180 : 0), ctx.car.root, false),
  pose: 'grip',
});

/** a → b 로 손 이동 (k: 0..1) */
export const reach = (a: () => HandTarget, b: () => HandTarget, k: number, lift = 0.05) => () =>
  k <= 0 ? a() : k >= 1 ? b() : blendHand(a(), b(), ease(k), lift);

/** 경로 위 s 지점으로 차를 옮기고 바퀴 조향·회전을 맞춘다 */
export function drive(ctx: Ctx, path: DrivePath, s: number, steerState: { v: number }, dt: number, steerOverride?: number) {
  const p = path.sample(s);
  ctx.car.setPose(p.x, p.z, p.h);
  const target = steerOverride ?? p.steer;
  steerState.v = dt > 0 ? lerp(steerState.v, target, 1 - Math.exp(-dt * 6)) : target;
  ctx.car.setSteer(steerState.v);
  ctx.car.setRoll(s);
  ctx.car.root.updateMatrixWorld(true);
}

/** 시동이 걸린 상태의 계기판 */
export function engineRunning(ctx: Ctx, gear: Gear = 'P') {
  const s = ctx.cockpit.cluster.state;
  s.power = 'run';
  s.belt = false;
  s.epb = true;
  s.gear = gear;
  ctx.cockpit.startGlow = 'run';
  ctx.car.lights.drl = true;
}

/** 원 궤도 카메라 */
export function orbit(center: V3, radius: number, height: number, a0: number, a1: number, dur: number, fov = 45): CamFn {
  return (t) => {
    const a = lerp(a0, a1, sseg(t, 0, dur));
    return {
      pos: V(center[0] + Math.cos(a) * radius, height, center[2] + Math.sin(a) * radius),
      look: V(...center),
      fov,
    };
  };
}

/** 인셋 숫자 행 */
export const rows = (items: [key: string, num: string, html: string][]) =>
  items.map(([k, n, html]) => `<div class="row" data-k="${k}"><span class="num">${n}</span><span>${html}</span></div>`).join('');

// ── 미러 보정 ───────────────────────────────────────────
const tmpCam = new THREE.PerspectiveCamera(15, 2, 0.05, 300);

function normalToEuler(n: THREE.Vector3) {
  return { yaw: Math.atan2(n.z, -n.x), pitch: Math.asin(THREE.MathUtils.clamp(-n.y, -1, 1)) };
}

/** 원하는 반사 방향 r을 만드는 거울 회전값 */
function aimMirror(glass: THREE.Object3D, eye: THREE.Vector3, r: THREE.Vector3) {
  const m = glass.getWorldPosition(new THREE.Vector3());
  const v = m.clone().sub(eye).normalize();
  const n = r.clone().normalize().sub(v).normalize();
  return normalToEuler(n);
}

/**
 * 사이드미러: 차체가 거울 안쪽 bodyFrac 만큼 보이고, 수평선이 가운데(+pitchDeg 아래로)에 오도록
 * 거울 각도를 계산한다. (차가 원점·정면 방향일 때)
 */
export function calibrateSide(ctx: Ctx, idx: 0 | 1, bodyFrac = 0.25, downDeg = 0) {
  const s = idx === 0 ? -1 : 1;
  const eye = eyeWorld(ctx);
  const glass = ctx.car.mirrors[idx].glass;
  const m = glass.getWorldPosition(new THREE.Vector3());
  const corner = world(ctx, [-2.33, 0.78, s * 0.93]);
  const beta = (-downDeg * Math.PI) / 180;
  const ndcAt = (alpha: number) => {
    const r = V(-Math.cos(beta) * Math.cos(alpha), Math.sin(beta), s * Math.cos(beta) * Math.sin(alpha));
    tmpCam.position.copy(m);
    tmpCam.up.set(0, 1, 0);
    tmpCam.lookAt(m.clone().add(r));
    tmpCam.updateMatrixWorld();
    tmpCam.updateProjectionMatrix();
    return { ndc: corner.clone().project(tmpCam).x, r };
  };
  const target = idx === 0 ? 2 * bodyFrac - 1 : 1 - 2 * bodyFrac;
  let lo = -0.3;
  let hi = 0.9;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    const { ndc } = ndcAt(mid);
    // 왼쪽: alpha↑ → ndc↓, 오른쪽: alpha↑ → ndc↑
    const tooFar = idx === 0 ? ndc < target : ndc > target;
    if (tooFar) hi = mid;
    else lo = mid;
  }
  const { r } = ndcAt((lo + hi) / 2);
  return aimMirror(glass, eye, r);
}

export function calibrateRoom(ctx: Ctx) {
  const glass = ctx.cockpit.roomMirrorGlass;
  const m = glass.getWorldPosition(new THREE.Vector3());
  const target = world(ctx, [-1.45, 1.16, 0]);
  return aimMirror(glass, eyeWorld(ctx), target.sub(m));
}
