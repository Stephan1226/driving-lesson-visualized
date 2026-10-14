import type { Step } from '../types';
import { rows, engineRunning } from '../helpers';
import { DrivePath, type Pose } from '../../core/path';
import { CITY, leftTurnArc, type SignalState } from '../../world/env/City';
import { crossed, sseg } from '../../core/util';
import { V, Mover, placeCar, driveOur, mix, fixed, chaseCam, plan } from '../road';

const { rb, ix, lanes } = CITY;
const FRONT = 2.37;

// ── 회전교차로 경로 ───────────────────────────────────────
// 남쪽 진입로(−Z로 진행, x = 262)에서 들어가 반시계로 돌아 n번째 출구로 나간다.
// 진입·진출 원호(반경 10)는 회전 차로 원(반경 11)에 접하도록 계산 (수치 검증: 출구 차로 중심에 정확히 도착)
const RE = 10;
const Z0 = rb.z + 3 * Math.sqrt(2 * RE + 13); // 진입 원호가 시작하는 뒷바퀴 축 z
const AE = Math.acos((2 + RE) / (RE + rb.ring));

/** 남쪽 기준 포즈를 회전교차로 중심으로 k×90° 돌린다 (k = 1 동쪽, 2 북쪽, 3 서쪽 진입로) */
function rotate(p: Pose, k: number): Pose {
  const a = (k * Math.PI) / 2;
  const dx = p.x - rb.x;
  const dz = p.z - rb.z;
  return { x: rb.x + dx * Math.cos(a) + dz * Math.sin(a), z: rb.z - dx * Math.sin(a) + dz * Math.cos(a), h: p.h + a };
}
/** entry 진입로에서 approach m 앞에서 출발해 n번째 출구로 */
function rbPath(entry: number, n: number, approach: number) {
  const startZ = Z0 - 1.37 + approach;
  const ac = 2 * AE + ((n - 2) * Math.PI) / 2;
  const segs = [
    { type: 'line' as const, d: approach },
    { type: 'arc' as const, r: RE, dir: -1 as const, a: AE },
    { type: 'arc' as const, r: rb.ring, dir: 1 as const, a: ac },
    { type: 'arc' as const, r: RE, dir: -1 as const, a: AE },
    { type: 'line' as const, d: 200 },
  ];
  const path = new DrivePath(rotate({ x: rb.x + 2, z: startZ, h: Math.PI / 2 }, entry), segs);
  const ring0 = approach + RE * AE;
  return { path, ring0, ring1: ring0 + rb.ring * ac, exit1: ring0 + rb.ring * ac + RE * AE };
}
/** 진입로 양보선 앞에 선 차의 경로 거리: 출발점(차 중심)에서 앞범퍼가 양보선 0.6m 앞에 닿을 때까지 */
const yieldS = (approach: number) => Z0 - 1.37 + approach - (rb.z + rb.outer + 0.6 + FRONT);

export const roundaboutSteps: Step[] = [
  {
    id: 'rb-yield',
    section: 5,
    title: '회전교차로: 돌고 있는 차가 먼저',
    body: '회전교차로에서는 <b>이미 돌고 있는 차가 우선</b>이에요. 들어가기 전 <b>양보선 앞에서 속도를 줄이고</b>, 왼쪽에서 돌아오는 차가 있으면 지나간 뒤 들어가요. 안에서는 <b>반시계 방향</b>으로 돌고, 멈추거나 후진하지 않아요.',
    facts: [
      { k: '우선', v: '회전 중인 차' },
      { k: '진입 전', v: '양보선 앞 서행·대기' },
      { k: '방향', v: '반시계 (가운데 섬이 왼쪽)' },
    ],
    env: 'city',
    mode: 'exterior',
    cut: true,
    duration: 16,
    cam: (t, ctx) => {
      const d = ctx.car.root.userData as { car: Mover };
      return mix(fixed([rb.x + 22, 17, rb.z + 26], [rb.x - 2, 0, rb.z + 4], 50), chaseCam(d.car, t, 10, 5, 0, 8), sseg(t, 12, 14.6));
    },
    enter(ctx) {
      engineRunning(ctx, 'D');
      ctx.driver = { handL: 'wheel', handR: 'wheel', footR: 'brake', footL: 'rest' };
      ctx.car.lights.tail = true;
      const me = rbPath(0, 2, 20);
      const wait = yieldS(20);
      // 서쪽에서 들어와 동쪽으로 나가는 차: 우리 진입로 앞을 지나감
      const c1 = rbPath(3, 2, 30);
      ctx.car.root.userData = {
        steer: { v: 0 },
        me,
        car: new Mover(me.path, plan(0, 7, [['to', 8, 5], ['to', wait, 0], ['hold', 8.6], ['to', me.ring0 + 2, 4.5], ['to', me.exit1, 5], ['to', me.exit1 + 30, 8]])),
        c1: new Mover(c1.path, plan(4, 7, [['to', c1.ring0 - 2, 5], ['to', c1.exit1, 5.5], ['to', c1.exit1 + 40, 8]])),
      };
      ctx.labels.add('me', () => ctx.car.root.position.clone().add(V(0, 1.8, 0)), { text: '', kind: 'amber', len: 28, visible: false });
      ctx.labels.add('c1', () => ctx.city.cars[0].root.position.clone().add(V(0, 1.9, 0)), { text: '돌고 있는 차가 먼저', kind: 'info', len: 24, visible: false });
    },
    update(ctx, t, prev, dt) {
      const d = ctx.car.root.userData as { steer: { v: number }; car: Mover; c1: Mover; me: ReturnType<typeof rbPath> };
      driveOur(ctx, d.car, t, d.steer, dt);
      ctx.car.lights.brake = (t > 1.5 && t < 8.6) || d.car.speed(t) < 0.15;
      ctx.car.lights.turnL = t > 0.3 && d.car.travel(t) < d.me.ring0 + rb.ring * AE;
      if (crossed(prev, t, 0.3)) ctx.car.blinkT0 = ctx.time;
      placeCar(ctx.city.cars[0], d.c1, t);
      const msg: [string, string] = t < 5.6 ? ['양보선 앞에서 서행', 'amber'] : t < 8.6 ? ['왼쪽에서 도는 차 먼저', 'amber'] : ['틈 → 진입', 'ok'];
      ctx.labels.set('me', { visible: t > 0.6 && t < 12, text: msg[0], kind: msg[1] as 'ok' });
      ctx.labels.show('c1', t > 3.6 && t < 8);
    },
  },
  {
    id: 'rb-signal',
    section: 5,
    title: '들어갈 땐 왼쪽, 나갈 땐 오른쪽 깜빡이',
    body: '회전교차로에 <b>들어갈 땐 왼쪽 깜빡이</b>를 켜서 돌고 있다는 걸 알리고, <b>나가기 직전에 오른쪽 깜빡이</b>로 바꿔요. 그래야 진입로에서 기다리는 차가 <b>내가 나가는지, 계속 도는지</b> 알 수 있어요. 첫 번째 출구로 바로 나갈 땐 처음부터 오른쪽 깜빡이를 켜요.',
    facts: [
      { k: '진입', v: '왼쪽 깜빡이' },
      { k: '진출 직전', v: '오른쪽 깜빡이' },
    ],
    env: 'city',
    mode: 'exterior',
    cut: true,
    duration: 17,
    inset: `<h3>회전교차로 깜빡이</h3>${rows([
      ['in', '←', '<b>들어갈 때</b>: 왼쪽 깜빡이'],
      ['round', '↻', '돌면서 나갈 출구 확인'],
      ['out', '→', '<b>나가기 직전</b>: 오른쪽 깜빡이'],
    ])}`,
    cam: () => fixed([rb.x + 4, 44, rb.z + 30], [rb.x, 0, rb.z - 2], 46),
    enter(ctx) {
      engineRunning(ctx, 'D');
      ctx.driver = { handL: 'wheel', handR: 'wheel', footR: 'accel', footL: 'rest' };
      ctx.car.lights.tail = true;
      const me = rbPath(0, 2, 22);
      const wait = yieldS(22);
      // 북쪽 진입로 양보선에서 기다리는 차: 내 깜빡이를 보고 판단
      const other = rbPath(2, 2, 26);
      ctx.car.root.userData = {
        steer: { v: 0 },
        me,
        /** 동쪽 출구(첫 출구)를 지나는 지점 */
        sEast: me.ring0 + rb.ring * AE + 1.2,
        car: new Mover(me.path, plan(0, 7, [['to', wait, 2.5], ['to', me.ring0, 4], ['to', me.exit1, 5], ['to', me.exit1 + 30, 8]])),
        other: new Mover(other.path, plan(yieldS(26) - 6, 3, [['to', yieldS(26), 0]])),
      };
      ctx.labels.add('me', () => ctx.car.root.position.clone().add(V(0, 1.8, 0)), { text: '', kind: 'info', len: 28, visible: false });
      ctx.labels.add('other', () => ctx.city.cars[2].root.position.clone().add(V(0, 1.9, 0)), { text: '', kind: 'info', len: 24, visible: false });
    },
    update(ctx, t, prev, dt) {
      const d = ctx.car.root.userData as { steer: { v: number }; car: Mover; other: Mover; me: ReturnType<typeof rbPath>; sEast: number };
      driveOur(ctx, d.car, t, d.steer, dt);
      const s = d.car.travel(t);
      const L = ctx.car.lights;
      const wasL = L.turnL;
      const wasR = L.turnR;
      L.turnL = t > 0.3 && s < d.sEast;
      L.turnR = s >= d.sEast && s < d.me.exit1 - 1;
      if ((!wasL && L.turnL) || (!wasR && L.turnR)) ctx.car.blinkT0 = ctx.time;
      L.brake = d.car.speed(t) < 3 && s < d.me.ring0;
      const o = ctx.city.cars[2];
      placeCar(o, d.other, t);
      o.lights.brake = true;
      o.update(dt, ctx.time, 0);
      const phase = s < d.me.ring0 ? 'in' : s < d.sEast ? 'round' : 'out';
      ctx.labels.set('me', {
        visible: t > 0.6 && s < d.me.exit1 + 6,
        text: phase === 'in' ? '들어갈 때: 왼쪽 깜빡이' : phase === 'round' ? '왼쪽 깜빡이: 계속 돌아요' : '나가기 직전: 오른쪽 깜빡이',
        kind: phase === 'out' ? 'ok' : 'info',
      });
      ctx.labels.set('other', {
        visible: t > 5 && s < d.me.exit1 + 2,
        text: phase === 'out' ? '저 차는 나가는구나' : '저 차는 계속 도네',
        kind: phase === 'out' ? 'ok' : 'info',
      });
      ctx.ui.insetActive(phase);
      void prev;
    },
  },
  {
    id: 'guide-left',
    section: 5,
    title: '유도선 따라 도는 좌회전도 깜빡이는 꼭',
    body: '좌회전 차로라서, 바닥에 <b>유도선</b>이 그려져 있어서 깜빡이를 안 켜는 사람이 많아요. 그래도 <b>나부터 켜요</b>. 뒤차·옆 차·건너려는 사람이 <b>내 의도를 미리 알면</b> 생길 수 있는 혼란을 막을 수 있어요. <b>깜빡이는 장식이 아니에요.</b>',
    facts: [
      { k: '언제부터', v: '일반도로 30m 전 (고속도로 100m)' },
      { k: '언제나', v: '좌·우회전, 차로 변경, 유턴, 출발' },
    ],
    env: 'city',
    mode: 'exterior',
    cut: true,
    duration: 20,
    inset: `<h3>깜빡이는 장식이 아니에요</h3>${rows([
      ['a', '1', '좌·우회전, <b>차로 변경</b>, 유턴, 출발할 때'],
      ['b', '2', '일반도로 <b>30m 전</b>, 고속도로 <b>100m 전</b>부터'],
      ['c', '3', '좌회전 차로·<b>유도선</b>이 있어도 켜기'],
      ['d', '4', '다 돌고 나면 꺼졌는지 확인'],
    ])}`,
    cam: (t, ctx) => {
      const d = ctx.car.root.userData as { car: Mover };
      return mix(chaseCam(d.car, t, 10, 4.5, 1.2, 14), fixed([222, 16, 19], [250, 0, -3], 52), sseg(t, 6, 8.6));
    },
    enter(ctx) {
      engineRunning(ctx, 'D');
      ctx.driver = { handL: 'wheel', handR: 'wheel', footR: 'accel', footL: 'rest' };
      ctx.car.lights.tail = true;
      const lt = leftTurnArc();
      const mk = (x0: number) =>
        new DrivePath({ x: x0, z: lanes[0], h: 0 }, [
          { type: 'line', d: lt.startX - (x0 - 1.37) },
          { type: 'arc', r: lt.R, dir: 1, a: Math.PI / 2 },
          { type: 'line', d: 300 },
        ]);
      const stopX = ix.stopE - 0.25 - FRONT;
      const arcLen = (lt.R * Math.PI) / 2;
      /** 정지선 앞 차(중심 stopX)가 원호 시작까지 가야 하는 거리 */
      const toArc = lt.startX - (stopX - 1.37);
      // 앞차(깜빡이 없음)와 우리 차(깜빡이 켬)가 같은 좌회전 차로에서 차례로
      const x0 = 160;
      const meStop = stopX - 7.5 - x0;
      const ox0 = stopX - 12;
      ctx.car.root.userData = {
        steer: { v: 0 },
        car: new Mover(mk(x0), plan(0, 11, [['to', 30, 11], ['to', meStop, 0], ['hold', 11.4], ['to', meStop + 7.5 + toArc, 5], ['to', meStop + 7.5 + toArc + arcLen, 5.5], ['to', meStop + 7.5 + toArc + arcLen + 20, 8]])),
        other: new Mover(mk(ox0), plan(0, 6, [['to', 12, 0], ['hold', 10.6], ['to', 12 + toArc, 5], ['to', 12 + toArc + arcLen, 5.5], ['to', 12 + toArc + arcLen + 30, 8]])),
        blinkOn: ix.stopE - 30,
      };
      ctx.labels.add('other', () => ctx.city.cars[3].root.position.clone().add(V(0, 1.9, 0)), { text: '깜빡이 없음 → 뒤·옆 차가 헷갈려요', kind: 'warn', len: 24, visible: false });
      ctx.labels.add('me', () => ctx.car.root.position.clone().add(V(0, 1.8, 0)), { text: '', kind: 'ok', len: 28, visible: false });
    },
    update(ctx, t, prev, dt) {
      const d = ctx.car.root.userData as { steer: { v: number }; car: Mover; other: Mover; blinkOn: number };
      const p = driveOur(ctx, d.car, t, d.steer, dt);
      const L = ctx.car.lights;
      const was = L.turnL;
      L.turnL = p.x + FRONT > d.blinkOn && t < 18.6;
      if (!was && L.turnL) ctx.car.blinkT0 = ctx.time;
      L.brake = (t > 3.4 && t < 11.4) || d.car.speed(t) < 0.15;
      if (ctx.driver) ctx.driver.footR = L.brake ? 'brake' : 'accel';
      const sig: SignalState = t < 10.6 ? { red: true } : { red: true, left: true };
      ctx.city.sig.E.set(sig);
      ctx.city.sig.W.set({ red: true });
      ctx.city.sig.N.set({ red: true });
      ctx.city.sig.S.set({ red: true });
      const o = ctx.city.cars[3];
      placeCar(o, d.other, t);
      o.lights.brake = d.other.speed(t) < 0.2;
      o.update(dt, ctx.time, 0);
      ctx.labels.show('other', t > 4 && t < 12.6);
      ctx.labels.set('me', {
        visible: t > 1.2 && t < 17,
        text: !L.turnL ? '좌회전할 거라면…' : t < 11.4 ? '30m 전부터 왼쪽 깜빡이' : '유도선 따라 좌회전',
        kind: L.turnL ? 'ok' : 'info',
      });
      ctx.ui.insetActive(t < 7 ? 'b' : t < 13 ? 'c' : 'a');
      void prev;
    },
  },
];
