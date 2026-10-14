import type * as THREE from 'three';
import type { CamPose, Step } from '../types';
import { S, V, drive, engineRunning } from '../helpers';
import { sampleShots } from '../Player';
import { DrivePath, spiralAngle, type Pose, type Seg } from '../../core/path';
import { PARK_ROAD } from '../../world/env/Environment';
import { CAR } from '../../world/car/Car';
import { crossed, lerp, motion, sseg } from '../../core/util';

/** 핸들을 서서히 감았다가 다시 풀며 90° 도는 모퉁이 */
const corner = (dir: 1 | -1, r: number, easeLen: number): Seg[] => [
  { type: 'spiral', len: easeLen, r, dir },
  { type: 'arc', r, dir, a: Math.PI / 2 - 2 * spiralAngle(easeLen, r) },
  { type: 'spiral', len: easeLen, r, dir, out: true },
];
const cornerLen = (r: number, easeLen: number) => easeLen + (r * Math.PI) / 2;

/**
 * Chapter 1에서 출발 준비를 마친 자리 → 통로로 좌회전 → 출구 정지선 → 도로 가까운 차로로 우회전
 * (수치 검증: 맞은편 주차 차량과 최소 1.1m)
 */
const PARKED: Pose = { x: 0, z: 0, h: 0 };
const PULL_OUT: Seg[] = [{ type: 'line', d: 1.6 }, ...corner(1, 5, 2)];
const S_AISLE = 1.6 + cornerLen(5, 2);
const AISLE = new DrivePath(PARKED, PULL_OUT).sample(S_AISLE);
/** 출구에서 멈추는 위치: 앞범퍼가 정지선 25cm 앞 */
const STOP_Z = PARK_ROAD.stopZ - 0.25 + CAR.halfLen;
const S_STOP = S_AISLE + (AISLE.z - STOP_Z);
const S_ROAD = S_STOP + cornerLen(5.4, 2.2);
const PATH = new DrivePath(PARKED, [...PULL_OUT, { type: 'line', d: AISLE.z - STOP_Z }, ...corner(-1, 5.4, 2.2), { type: 'line', d: 400 }]);

/** 출발 · 감속 시작 · 정지 · 도로 진입 · 차로 안착 */
const T = { go: 2.6, slow: 12, stop: 15.4, merge: 18, road: 21.8 };
const travel = motion([
  [0, 0, 0],
  [T.go, 0, 0],
  [4.6, 2.2, 2.2],
  [8.6, S_AISLE + 0.4, 2.8],
  [T.slow, S_STOP - 6, 3.2],
  [T.stop, S_STOP, 0],
  [T.merge, S_STOP, 0],
  [T.road, S_ROAD, 4.2],
  [27.4, S_ROAD + 37, 9],
]);

/** 왼쪽에서 와서 출구 앞을 지나가는 차 (가까운 차로, 약 36km/h) */
const TRAFFIC = { z: PARK_ROAD.z + PARK_ROAD.lane, v: 10, tPass: 16.6 };
const trafficX = (t: number) => AISLE.x + TRAFFIC.v * (t - TRAFFIC.tPass);

// ── 카메라 ───────────────────────────────────────────────
const carAt = (t: number) => PATH.sample(travel(t));
const fwd = (h: number) => V(Math.cos(h), 0, -Math.sin(h));
const right = (h: number) => V(Math.sin(h), 0, Math.cos(h));
const ground = (p: Pose) => V(p.x, 0, p.z);

const mix = (a: CamPose, b: CamPose, k: number): CamPose =>
  k <= 0 ? a : { pos: a.pos.lerp(b.pos, k), look: a.look.lerp(b.look, k), fov: lerp(a.fov ?? 45, b.fov ?? 45, k) };

/** Chapter 1 마지막 장면의 카메라 자리에서 시작해, 비켜서서 빠져나오는 차를 눈으로 좇는다 */
const OPENING = [S(0, [2.75, 2.6, 7.08], [0, 0.7, 0], 40), S(4, [10.5, 3.0, 5.5], [3.0, 0.7, -0.8], 42)];
function opening(t: number): CamPose {
  const p = sampleShots(OPENING, t);
  return { ...p, look: p.look.lerp(ground(carAt(t)).setY(0.7), sseg(t, 3, 6)) };
}

/** 차 뒤를 따라가는 카메라 — 방향은 조금 늦게 따라와 회전이 부드럽다 */
function chase(t: number): CamPose {
  const c = ground(carAt(t));
  const h = carAt(t - 0.8).h;
  return {
    pos: c.clone().addScaledVector(fwd(h), -7.2).addScaledVector(right(h), 0.9).setY(2.7),
    look: c.clone().addScaledVector(fwd(h), 4).setY(0.9),
    fov: 45,
  };
}

const ROADSIDE = { x: 21, z: PARK_ROAD.z + PARK_ROAD.half + 3.6 };
/** 출구 옆 길가: 멈춘 차와 그 왼쪽(차가 오는 쪽) 도로를 함께 보다가, 도로에 들어서는 차를 좇는다 */
function roadside(t: number): CamPose {
  const k = sseg(t, T.merge + 1, T.road);
  const look = ground(carAt(t)).add(V(-2.5 * (1 - k), 0.8, -3 * (1 - k)));
  return { pos: V(ROADSIDE.x, lerp(1.6, 2.6, k), ROADSIDE.z), look, fov: 42 };
}

/** 도로 위 높은 곳에서 천천히 뒤따르다 멈추고, 차는 멀어진다 */
function away(t: number): CamPose {
  const car = ground(carAt(t));
  const follow = 45 * (1 - Math.exp((-0.55 * Math.max(0, car.x - ROADSIDE.x)) / 45));
  return { pos: V(ROADSIDE.x + follow - 6, 4.4, car.z - 0.4), look: car.setY(0.8), fov: 32 };
}

export const departSteps: Step[] = [
  {
    id: 'depart-intro',
    section: 0,
    title: '이제 출발! 주차장에서 도로로',
    body: 'Chapter 1에서 출발 준비를 마친 그 차로 이제 실제로 움직여 봅니다. 공원 주차장을 빠져나와 도로에 들어서기까지의 흐름을 먼저 한 번 보고, 이어지는 장면에서 하나씩 자세히 살펴볼게요.',
    facts: [
      { k: '주차장 안', v: '걷는 속도로 천천히' },
      { k: '출구', v: '일단 정지 · 왼쪽 확인' },
      { k: '도로 진입', v: '가까운 차로로 우회전' },
    ],
    env: 'park',
    mode: 'exterior',
    duration: 28,
    cam: (t) => {
      let pose = opening(t);
      pose = mix(pose, chase(t), sseg(t, 7.5, 10.5));
      pose = mix(pose, roadside(t), sseg(t, T.slow + 0.8, T.stop + 0.8));
      pose = mix(pose, away(t), sseg(t, T.road + 2, T.road + 5.5));
      return pose;
    },
    enter(ctx) {
      engineRunning(ctx);
      ctx.driver = { handL: 'wheel', handR: 'wheel', footR: 'brake', footL: 'rest' };
      ctx.car.lights.tail = true;
      ctx.car.root.userData = { steer: { v: 0 } };
      const above = (o: { root: THREE.Object3D }) => () => o.root.position.clone().add(V(0, 1.7, 0));
      ctx.labels.add('go', above(ctx.car), { text: '깜빡이 켜고 천천히 출발', kind: 'info', len: 30, visible: false });
      ctx.labels.add('stop', above(ctx.car), { text: '출구에서 일단 정지', sub: '왼쪽에서 오는 차 확인', kind: 'amber', len: 30, visible: false });
      ctx.labels.add('yield', above(ctx.park.traffic), { text: '도로의 차가 먼저', kind: 'warn', len: 30, visible: false });
      ctx.labels.add('merge', above(ctx.car), { text: '가까운 차로로 우회전', kind: 'ok', len: 30, visible: false });
    },
    update(ctx, t, prev, dt) {
      const d = ctx.car.root.userData as { steer: { v: number } };
      drive(ctx, PATH, travel(t), d.steer, dt);
      ctx.cockpit.steer = -d.steer.v * 4;
      const { x, z } = ctx.car.root.position;
      ctx.park.setSunCenter(x, z);

      const L = ctx.car.lights;
      L.brake = t < T.go || (t > T.slow + 0.2 && t < T.merge);
      L.turnL = t > 0.9 && t < 8.6;
      L.turnR = t > T.slow + 1.4 && t < T.road - 0.4;
      if (crossed(prev, t, 0.9) || crossed(prev, t, T.slow + 1.4)) ctx.car.blinkT0 = ctx.time;
      ctx.cockpit.brake = L.brake ? 1 : 0;

      const tr = ctx.park.traffic;
      const tx = trafficX(t);
      tr.root.visible = t > 8;
      tr.setPose(tx, TRAFFIC.z, 0);
      tr.setRoll(tx);

      ctx.labels.show('go', t > 1 && t < 5);
      ctx.labels.show('stop', t > T.stop - 0.3 && t < T.merge);
      ctx.labels.show('yield', t > T.stop && t < TRAFFIC.tPass + 0.6);
      ctx.labels.show('merge', t > T.merge + 0.4 && t < T.road + 0.6);
    },
  },
];
