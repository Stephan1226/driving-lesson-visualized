import type { Ctx } from '../context';
import type { Step } from '../types';
import { rows, engineRunning } from '../helpers';
import { DrivePath, type Pose } from '../../core/path';
import { CITY, leftTurnArc, type SignalState } from '../../world/env/City';
import { crossed, sseg } from '../../core/util';
import { V, corner, Mover, placeCar, driveOur, walkPed, mix, fixed, chaseCam, toWorld, sWhereFront } from '../road';

const { lanes, ix } = CITY;
const L1 = lanes[0];
const FRONT = 2.37;
const R: SignalState = { red: true };
const G: SignalState = { green: true };
const Y: SignalState = { yellow: true };
const RL: SignalState = { red: true, left: true };
const phase = (t: number, keys: [number, SignalState][]) => {
  let s = keys[0][1];
  for (const [k, v] of keys) if (t >= k) s = v;
  return s;
};

/** 1차로 정지선 앞에 선 차의 중심 x */
const STOP_X = ix.stopE - 0.25 - FRONT;
/** 정지선 앞 → 유도선을 따라 좌회전 → 세로 도로 북쪽(−Z) */
function leftPath(x0: number) {
  const lt = leftTurnArc();
  const rearStart = x0 - 1.37;
  return new DrivePath({ x: x0, z: L1, h: 0 }, [
    { type: 'line', d: lt.startX - rearStart },
    { type: 'arc', r: lt.R, dir: 1, a: Math.PI / 2 },
    { type: 'line', d: 300 },
  ]);
}
const LEFT_TURN_LEN = (leftTurnArc().R * Math.PI) / 2;

/** −X로 오는 맞은편 직진 차: tPass에 교차로 가운데를 지남 */
const oncoming = (lane: number, tPass: number, v = 11) =>
  new Mover(new DrivePath({ x: ix.x + v * (tPass + 20), z: -lane, h: Math.PI }, [{ type: 'line', d: 900 }]), [[-20, 0, v]]);

const setMain = (ctx: Ctx, e: SignalState, w: SignalState, side: SignalState) => {
  ctx.city.sig.E.set(e);
  ctx.city.sig.E3.set(e.left ? { red: true } : e);
  ctx.city.sig.W.set(w);
  ctx.city.sig.N.set(side);
  ctx.city.sig.S.set(side);
};

const blinkL = (ctx: Ctx, prev: number, t: number, on: number, off: number) => {
  ctx.car.lights.turnL = t > on && t < off;
  if (crossed(prev, t, on)) ctx.car.blinkT0 = ctx.time;
};

export const turnSteps: Step[] = [
  {
    id: 'left-arrow',
    section: 3,
    title: '초록불은 직진 신호, 좌회전은 화살표에',
    body: '좌회전 차로에 서 있을 때 <b>초록불이 켜졌다고 출발하면 안 돼요</b>. 초록불은 <b>직진 신호</b>라서 맞은편 직진 차도 함께 출발해요. 좌회전은 <b>초록 화살표(좌회전 신호)</b>가 켜질 때 가요. 신호가 바뀌면 화살표가 함께 켜졌는지 꼭 확인하세요.',
    facts: [
      { k: '초록 ●', v: '직진' },
      { k: '초록 ←', v: '좌회전' },
    ],
    tip: '"비보호" 표지가 있는 곳만 초록불에 좌회전할 수 있어요 (다음 장면).',
    env: 'city',
    mode: 'exterior',
    cut: true,
    duration: 20,
    inset: `<h3>좌회전 차로의 신호</h3>
      <div class="row" data-k="r"><span class="key" style="background:#e5352b">빨강</span><span>대기</span></div>
      <div class="row" data-k="g"><span class="key" style="background:#15924a">초록 ●</span><span><b>직진 신호</b> → 좌회전 차는 계속 대기</span></div>
      <div class="row" data-k="l"><span class="key" style="background:#15924a">빨강+←</span><span><b>좌회전 신호</b> → 출발</span></div>`,
    cam: (t, ctx) => {
      const d = ctx.car.root.userData as { car: Mover };
      const wide = fixed([226, 15, 16], [256, 0, -4], 50);
      return mix(wide, chaseCam(d.car, t, 9, 4, -1, 8), sseg(t, 14, 16.4));
    },
    enter(ctx) {
      engineRunning(ctx, 'D');
      ctx.driver = { handL: 'wheel', handR: 'wheel', footR: 'brake', footL: 'rest' };
      ctx.car.lights.tail = true;
      const path = leftPath(STOP_X);
      const sTurn = leftTurnArc().startX - (STOP_X - 1.37);
      ctx.car.root.userData = {
        steer: { v: 0 },
        car: new Mover(path, [[0, 0, 0], [13.2, 0, 0], [15.6, sTurn + 1.5, 4], [18.6, sTurn + LEFT_TURN_LEN, 5.5], [20, sTurn + LEFT_TURN_LEN + 10, 8]]),
        ghost: new Mover(path, [[0, 0, 0], [4, 0, 0], [6.2, sTurn + 3.6, 4.5], [6.8, sTurn + 5, 0]]),
        on: [oncoming(lanes[1], 6.5), oncoming(lanes[2], 8), oncoming(lanes[1], 10.2)],
      };
      ctx.labels.add('sig', () => toWorld({ x: ix.crossW + 4, z: 3.4, h: 0 }, 0, 5.4, 0), { text: '', kind: 'info', dir: 'up', len: 34, visible: false });
      ctx.labels.add('wait', () => ctx.car.root.position.clone().add(V(0, 1.8, 0)), { text: '좌회전 차로: 아직 대기', kind: 'amber', len: 28, visible: false });
      ctx.labels.add('hit', V(256, 1, -lanes[1]), { text: '맞은편 직진 차와 충돌 위험', kind: 'warn', big: true, len: 40, visible: false });
    },
    update(ctx, t, prev, dt) {
      const d = ctx.car.root.userData as { steer: { v: number }; car: Mover; ghost: Mover; on: Mover[] };
      driveOur(ctx, d.car, t, d.steer, dt);
      ctx.car.lights.brake = t < 13.2;
      blinkL(ctx, prev, t, 0.2, 18.4);
      const e = phase(t, [[0, R], [2, G], [10, Y], [12.4, RL]]);
      const w = phase(t, [[0, R], [2, G], [10, Y], [12.4, R]]);
      setMain(ctx, e, w, R);
      d.on.forEach((m, i) => placeCar(ctx.city.cars[i], m, t));
      const g = ctx.city.ghost;
      g.root.visible = t > 4 && t < 8.6;
      if (g.root.visible) placeCar(g, d.ghost, t);
      if (crossed(prev, t, 4)) ctx.ui.toast('초록불이니 좌회전해도 될까?', '');
      if (crossed(prev, t, 6.4)) {
        ctx.ui.flash();
        ctx.sfx.squeal();
      }
      ctx.labels.set('sig', {
        visible: t > 1.8 && t < 15,
        text: e.left ? '좌회전 신호 → 출발' : e.green ? '초록불 = 직진 신호' : e.yellow ? '노란불' : '빨간불',
        kind: e.left ? 'ok' : 'info',
      });
      ctx.labels.show('wait', t > 2.4 && t < 12.4 && !(t > 4 && t < 8.6));
      ctx.labels.show('hit', t > 6.4 && t < 8.6);
      ctx.ui.insetActive(e.left ? 'l' : e.green ? 'g' : 'r');
    },
  },
  {
    id: 'unprotected-left',
    section: 3,
    title: '비보호 좌회전: 초록불에, 맞은편 직진 차 먼저',
    body: '<b>"비보호" 표지</b>가 있는 교차로는 좌회전 화살표가 없어요. <b>초록불일 때만</b> 좌회전할 수 있고, 그때도 <b>맞은편 직진 차가 먼저</b>예요. 맞은편 차가 다 지나간 뒤 돌고, 돌아 들어가는 길의 <b>횡단보도에 사람</b>이 있으면 앞에서 멈춰요.',
    facts: [
      { k: '빨간불', v: '좌회전 금지 (신호위반)' },
      { k: '초록불', v: '맞은편 직진 차 먼저' },
      { k: '사고 나면', v: '좌회전 차 책임이 커요' },
    ],
    env: 'city',
    mode: 'exterior',
    cut: true,
    duration: 22,
    inset: `<h3>비보호 좌회전 순서</h3>${rows([
      ['1', '1', '<b>빨간불</b>: 정지선에서 대기 (돌면 신호위반)'],
      ['2', '2', '<b>초록불</b>: 맞은편 직진 차가 다 지나갈 때까지'],
      ['3', '3', '틈이 나면 <b>천천히 좌회전</b>'],
      ['4', '4', '건너는 <b>사람</b>이 있으면 횡단보도 앞에서 멈춤'],
    ])}`,
    cam: (t) => {
      const wide = fixed([228, 16, 18], [258, 0, -6], 50);
      return mix(wide, fixed([276, 9, -6], [261, 0, -16], 50), sseg(t, 14, 16.4));
    },
    enter(ctx) {
      engineRunning(ctx, 'D');
      ctx.driver = { handL: 'wheel', handR: 'wheel', footR: 'brake', footL: 'rest' };
      ctx.car.lights.tail = true;
      ctx.city.setUnprotected(true);
      const path = leftPath(STOP_X);
      const sTurn = leftTurnArc().startX - (STOP_X - 1.37);
      // 북쪽 횡단보도(세로 도로를 건너는 곳) 앞에서 멈출 거리
      const sCross = sWhereFront(path, (f) => -(f.z - (ix.crossN + 2 + 0.6)), sTurn, sTurn + LEFT_TURN_LEN + 20);
      ctx.car.root.userData = {
        steer: { v: 0 },
        car: new Mover(path, [[0, 0, 0], [10.4, 0, 0], [12.6, sTurn + 1.5, 4], [15.4, sCross, 0], [18.6, sCross, 0], [20.4, sCross + 6, 5], [22, sCross + 16, 8]]),
        on: [oncoming(lanes[1], 5.4), oncoming(lanes[2], 6.8), oncoming(lanes[1], 9.2)],
      };
      ctx.labels.add('sign', () => V(ix.crossW + 4, 4.4, 3.4), { text: '비보호', sub: '화살표 없음', kind: 'info', dir: 'up', len: 30, visible: false });
      ctx.labels.add('me', () => ctx.car.root.position.clone().add(V(0, 1.8, 0)), { text: '', kind: 'amber', len: 28, visible: false });
    },
    update(ctx, t, prev, dt) {
      const d = ctx.car.root.userData as { steer: { v: number }; car: Mover; on: Mover[] };
      driveOur(ctx, d.car, t, d.steer, dt);
      ctx.car.lights.brake = t < 10.4 || (t > 14.6 && t < 18.6);
      blinkL(ctx, prev, t, 0.2, 20.2);
      const e = phase(t, [[0, R], [3.2, G]]);
      setMain(ctx, e, e, R);
      d.on.forEach((m, i) => placeCar(ctx.city.cars[i], m, t));
      // 세로 도로가 빨강이라 그 길을 건너는 사람은 초록
      const walk = t > 3.2;
      ctx.city.ped.N_w.set(walk);
      ctx.city.ped.N_e.set(walk);
      if (t > 3.2) walkPed(ctx, 0, [ix.x + ix.half + 1.2, ix.crossN + 0.8], [ix.x - ix.half - 1.2, ix.crossN + 0.8], 12.4, 1.2, t);
      ctx.labels.show('sign', t > 0.4 && t < 6);
      const msg: [string, string] =
        t < 3.2 ? ['빨간불: 비보호라도 금지', 'warn'] : t < 10.4 ? ['맞은편 직진 차 먼저', 'amber'] : t < 14.6 ? ['틈 → 천천히 좌회전', 'ok'] : t < 18.6 ? ['횡단보도 사람 먼저', 'amber'] : ['출발', 'ok'];
      ctx.labels.set('me', { visible: t > 0.6, text: msg[0], kind: msg[1] as 'warn' });
      const step = t < 3.2 ? '1' : t < 10.4 ? '2' : t < 14.6 ? '3' : '4';
      ctx.ui.insetActive(step);
      ctx.ui.insetActive(['1', '2', '3', '4'].filter((k) => k < step), 'done');
    },
  },
  {
    id: 'uturn-wait',
    section: 3,
    title: '유턴은 정지선에서 조금 떨어져서 기다리기',
    body: '교차로 앞에서 유턴할 땐 <b>정지선에 바짝 붙지 말고 차 한 대 길이쯤 떨어져</b> 기다려요. 붙어 서 있다가 돌면 차 앞이 <b>정지선을 넘어 횡단보도까지</b> 나가요. 떨어져 있으면 <b>한 번에</b> 돌 수 있고 횡단보도도 침범하지 않아요. 유턴은 <b>표지에 적힌 신호</b>(예: 좌회전시)에만 해요.',
    facts: [
      { k: '대기 위치', v: '정지선 뒤 약 3~4m' },
      { k: '유턴 신호', v: '표지 아래 글씨 확인' },
    ],
    tip: '유턴 표지 아래 "좌회전시", "보행신호시" 같은 글씨가 있으면 그 신호일 때만 돌 수 있어요. 아무 글씨가 없으면 맞은편 차가 없을 때 돌아요.',
    env: 'city',
    mode: 'exterior',
    cut: true,
    duration: 18,
    cam: () => fixed([236, 17, 13], [242, 0, -3], 52),
    enter(ctx) {
      engineRunning(ctx, 'D');
      ctx.driver = { handL: 'wheel', handR: 'wheel', footR: 'brake', footL: 'rest' };
      ctx.car.lights.tail = true;
      const waitX = ix.stopE - 3.75 - FRONT;
      const x0 = 200;
      const uturn = (start: Pose, lead: number) => new DrivePath(start, [{ type: 'line', d: lead }, ...corner(1, 4.938, 1.2, Math.PI), { type: 'line', d: 200 }]);
      const lead = waitX - x0;
      const U_LEN = 4.938 * Math.PI + 1.2;
      ctx.car.root.userData = {
        steer: { v: 0 },
        car: new Mover(uturn({ x: x0, z: L1, h: 0 }, lead), [[0, 0, 8], [2.2, 15, 6], [5, lead, 0], [11.2, lead, 0], [15.2, lead + U_LEN, 4], [18, lead + U_LEN + 14, 7]]),
        ghost: new Mover(uturn({ x: STOP_X, z: L1, h: 0 }, 0), [[0, 0, 0], [6, 0, 0], [9.6, U_LEN * 0.55, 3], [10.4, U_LEN * 0.62, 0]]),
      };
      ctx.labels.add('gap', V(ix.stopE - 1.9, 0.2, L1 + 1.4), { text: '정지선에서 한 대 길이쯤 뒤', kind: 'ok', dir: 'up', len: 40, visible: false });
      ctx.labels.add('cw', V(ix.crossE, 0.3, -1.2), { text: '바짝 붙으면 횡단보도 침범', kind: 'warn', big: true, dir: 'down', len: 40, visible: false });
      ctx.labels.add('sign', V(ix.uturn.x1 - 2, 2.9, CITY.half + 0.8), { text: '유턴 표지: 좌회전시', kind: 'info', dir: 'up', len: 26, visible: false });
    },
    update(ctx, t, prev, dt) {
      const d = ctx.car.root.userData as { steer: { v: number }; car: Mover; ghost: Mover };
      driveOur(ctx, d.car, t, d.steer, dt);
      ctx.car.lights.brake = (t > 2 && t < 11.2) || d.car.speed(t) < 0.2;
      blinkL(ctx, prev, t, 0.3, 16);
      const e = phase(t, [[0, R], [10.6, RL]]);
      setMain(ctx, e, R, R);
      const g = ctx.city.ghost;
      g.root.visible = t > 5.6 && t < 11;
      if (g.root.visible) placeCar(g, d.ghost, t);
      if (crossed(prev, t, 5.6)) ctx.ui.toast('정지선에 바짝 붙어 있었다면?', '');
      if (crossed(prev, t, 9.4)) {
        ctx.ui.flash();
        ctx.sfx.squeal();
      }
      ctx.labels.show('sign', t > 0.6 && t < 5);
      ctx.labels.show('gap', t > 4.6 && t < 10.6);
      ctx.labels.show('cw', t > 9.4 && t < 11.2);
    },
  },
];
