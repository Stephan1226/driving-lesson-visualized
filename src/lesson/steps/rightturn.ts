import type { Ctx } from '../context';
import type { Step } from '../types';
import { rows, engineRunning } from '../helpers';
import { DrivePath } from '../../core/path';
import { CITY, type SignalState } from '../../world/env/City';
import { crossed, sseg } from '../../core/util';
import { V, corner, Mover, placeCar, driveOur, walkPed, mix, fixed, sWhereFront } from '../road';

const { lanes, ix, half } = CITY;
const L3 = lanes[2];
const FRONT = 2.37;
const STOP_X = ix.stopE - 0.25 - FRONT;
const R: SignalState = { red: true };
const G: SignalState = { green: true };

/** 3차로 → 세로 도로 남쪽(+Z) 차로로 우회전 (반경 7, 연석 모서리와 0.95m, 수치 맞춤) */
const TURN_STRAIGHT = 11.37;
function rightPath(x0: number) {
  return new DrivePath({ x: x0, z: L3, h: 0 }, [
    { type: 'line', d: STOP_X - x0 + TURN_STRAIGHT },
    ...corner(-1, 7, 2),
    { type: 'line', d: 200 },
  ]);
}
/** 앞범퍼 기준 위치들 (경로 거리 s) */
function marks(path: DrivePath, x0: number) {
  return {
    stop: STOP_X - x0,
    /** 앞 횡단보도를 지나 교차로 가장자리 */
    edge: ix.crossE + 2 + 1.3 - FRONT - x0,
    /** 돌아 들어간 길의 횡단보도 앞 */
    cross2: sWhereFront(path, (f) => f.z - (ix.crossS - 2 - 0.6), STOP_X - x0, path.length),
  };
}

const walkSig = (ctx: Ctx, mainCross: boolean, sideCross: boolean) => {
  for (const k of ['E_n', 'E_s', 'W_n', 'W_s']) ctx.city.ped[k].set(mainCross);
  for (const k of ['N_w', 'N_e', 'S_w', 'S_e']) ctx.city.ped[k].set(sideCross);
};

/** +Z로 내려오는 세로 도로 직진 차 (북쪽에서 옴) */
const southbound = (tPass: number, v = 10) =>
  new Mover(new DrivePath({ x: ix.x - ix.half / 2, z: -v * (tPass + 20), h: -Math.PI / 2 }, [{ type: 'line', d: 900 }]), [[-20, 0, v]]);

const blinkR = (ctx: Ctx, prev: number, t: number, on: number, off: number) => {
  ctx.car.lights.turnR = t > on && t < off;
  if (crossed(prev, t, on)) ctx.car.blinkT0 = ctx.time;
};

export const rightTurnSteps: Step[] = [
  {
    id: 'right-red',
    section: 4,
    title: '빨간불 우회전: 일단 멈췄다가, 사람·직진 차 보고',
    body: '앞 신호가 <b>빨간불</b>일 때 우회전하려면 <b>정지선 앞에서 완전히 멈춰요</b>(속도 0). 앞 횡단보도에 <b>건너는 사람</b>이 없는지, 왼쪽에서 오는 <b>직진 차</b>가 없는지 보고 천천히 돌아요. 돌아 들어간 길의 횡단보도도 <b>사람만 보면 돼요</b>, 건너는 사람이 있으면 그 앞에서 다시 멈춥니다.',
    facts: [
      { k: '빨간불', v: '정지선에서 완전 정지' },
      { k: '확인 순서', v: '앞 횡단보도 → 직진 차 → 돌아간 횡단보도' },
    ],
    tip: '우회전 신호등(화살표)이 따로 있는 교차로는 그 신호를 따라요.',
    env: 'city',
    mode: 'exterior',
    cut: true,
    duration: 25,
    inset: `<h3>빨간불 우회전</h3>${rows([
      ['1', '1', '정지선 앞 <b>완전 정지</b> (0 km/h)'],
      ['2', '2', '앞 <b>횡단보도</b>에 사람이 없을 때까지'],
      ['3', '3', '왼쪽 <b>직진 차</b>가 지나갈 때까지'],
      ['4', '4', '돌아간 길 <b>횡단보도에 사람</b> → 멈춤'],
    ])}`,
    cam: (t) => mix(fixed([234, 15, 30], [252, 0, 9], 50), fixed([273, 13, 27], [255, 0, 14], 50), sseg(t, 14.4, 16.8)),
    enter(ctx) {
      engineRunning(ctx, 'D');
      ctx.driver = { handL: 'wheel', handR: 'wheel', footR: 'brake', footL: 'rest' };
      ctx.car.lights.tail = true;
      const x0 = 205;
      const path = rightPath(x0);
      const m = marks(path, x0);
      ctx.car.root.userData = {
        steer: { v: 0 },
        m,
        car: new Mover(path, [[0, 0, 9], [1.4, 12.6, 9], [5.4, m.stop, 0], [10.8, m.stop, 0], [12.4, m.edge, 0], [14.6, m.edge, 0], [17.4, m.cross2, 0], [21.8, m.cross2, 0], [23.4, m.cross2 + 5, 5], [25, m.cross2 + 14, 7]]),
        cross: southbound(13.2),
      };
      ctx.labels.add('me', () => ctx.car.root.position.clone().add(V(0, 1.8, 0)), { text: '', kind: 'amber', len: 28, visible: false });
      ctx.labels.add('car', () => ctx.city.cars[2].root.position.clone().add(V(0, 1.9, 0)), { text: '직진 차 먼저', kind: 'info', len: 24, visible: false });
    },
    update(ctx, t, prev, dt) {
      const d = ctx.car.root.userData as { steer: { v: number }; car: Mover; cross: Mover };
      driveOur(ctx, d.car, t, d.steer, dt);
      const moving = d.car.speed(t) > 0.15;
      ctx.car.lights.brake = t > 1.4 && !moving;
      blinkR(ctx, prev, t, 0.3, 23.6);
      ctx.city.sig.E.set(R);
      ctx.city.sig.W.set(R);
      ctx.city.sig.N.set(G);
      ctx.city.sig.S.set(G);
      walkSig(ctx, true, false);
      // 앞 횡단보도: 본 도로를 건너는 사람 두 명 (보행 신호 초록)
      walkPed(ctx, 0, [ix.crossE - 0.8, half + 1.2], [ix.crossE - 0.8, -half - 1.2], 3.6, 1.3, t);
      walkPed(ctx, 1, [ix.crossE + 0.8, -4], [ix.crossE + 0.8, half + 1.2], 0, 1.3, t);
      // 돌아간 길 횡단보도: 늦게 건너는 사람
      walkPed(ctx, 2, [ix.x + ix.half + 1.2, ix.crossS - 0.8], [ix.x - ix.half - 1.2, ix.crossS - 0.8], 14, 1.15, t, t > 13);
      placeCar(ctx.city.cars[2], d.cross, t);
      const msg: [string, string] =
        t < 5.4 ? ['빨간불 → 정지선에서 멈춤', 'amber'] : t < 10.8 ? ['0 km/h · 앞 횡단보도 사람', 'amber'] : t < 14.6 ? ['왼쪽 직진 차 확인', 'amber'] : t < 17.4 ? ['천천히 우회전', 'ok'] : t < 21.8 ? ['건너는 사람 먼저', 'amber'] : ['출발', 'ok'];
      ctx.labels.set('me', { visible: t > 0.6, text: msg[0], kind: msg[1] as 'ok' });
      ctx.labels.show('car', t > 12 && t < 14.6);
      const step = t < 5.4 ? '1' : t < 10.8 ? '2' : t < 14.6 ? '3' : '4';
      ctx.ui.insetActive(step);
      ctx.ui.insetActive(['1', '2', '3', '4'].filter((k) => k < step), 'done');
    },
  },
  {
    id: 'right-green',
    section: 4,
    title: '초록불 우회전: 속도 줄여 들어가고, 사람만 보기',
    body: '앞 신호가 <b>초록불</b>이면 멈추지 않고 우회전해도 돼요. 다만 <b>속도를 충분히 줄여</b> 들어가요. 이때 돌아 들어가는 길은 차가 멈춰 있고 <b>사람이 건너는 신호</b>라서, 횡단보도에 <b>건너는 사람이 있으면 그 앞에서 멈춰</b> 기다려요.',
    facts: [
      { k: '초록불', v: '서행으로 진입' },
      { k: '돌아간 횡단보도', v: '보행 신호 → 사람 먼저' },
    ],
    env: 'city',
    mode: 'exterior',
    cut: true,
    duration: 17,
    cam: () => fixed([273, 13, 27], [254, 0, 13], 50),
    enter(ctx) {
      engineRunning(ctx, 'D');
      ctx.driver = { handL: 'wheel', handR: 'wheel', footR: 'accel', footL: 'rest' };
      ctx.car.lights.tail = true;
      const x0 = 200;
      const path = rightPath(x0);
      const m = marks(path, x0);
      ctx.car.root.userData = {
        steer: { v: 0 },
        car: new Mover(path, [[0, 0, 11], [1.6, 17.6, 10], [4.6, m.stop, 4], [8.2, m.cross2, 0], [12.6, m.cross2, 0], [14.4, m.cross2 + 5, 5], [17, m.cross2 + 18, 8]]),
      };
      ctx.labels.add('me', () => ctx.car.root.position.clone().add(V(0, 1.8, 0)), { text: '', kind: 'ok', len: 28, visible: false });
    },
    update(ctx, t, prev, dt) {
      const d = ctx.car.root.userData as { steer: { v: number }; car: Mover };
      driveOur(ctx, d.car, t, d.steer, dt);
      ctx.car.lights.brake = (t > 1.6 && t < 4.6) || d.car.speed(t) < 0.15;
      if (ctx.driver) ctx.driver.footR = ctx.car.lights.brake ? 'brake' : 'accel';
      blinkR(ctx, prev, t, 0.2, 15);
      ctx.city.sig.E.set(G);
      ctx.city.sig.W.set(G);
      ctx.city.sig.N.set(R);
      ctx.city.sig.S.set(R);
      walkSig(ctx, false, true);
      walkPed(ctx, 0, [ix.x - ix.half - 1.2, ix.crossS + 0.8], [ix.x + ix.half + 1.2, ix.crossS + 0.8], 4.6, 1.3, t);
      walkPed(ctx, 1, [ix.x + ix.half + 1.2, ix.crossS - 0.8], [ix.x - ix.half - 1.2, ix.crossS - 0.8], 5.4, 1.2, t);
      const msg: [string, string] = t < 4.6 ? ['초록불: 속도 줄이기', 'ok'] : t < 8.2 ? ['천천히 우회전', 'ok'] : t < 12.6 ? ['건너는 사람 먼저', 'amber'] : ['출발', 'ok'];
      ctx.labels.set('me', { visible: t > 0.6, text: msg[0], kind: msg[1] as 'ok' });
    },
  },
];
