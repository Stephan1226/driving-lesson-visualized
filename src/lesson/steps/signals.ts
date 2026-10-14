import type { Step } from '../types';
import { rows, engineRunning } from '../helpers';
import { DrivePath } from '../../core/path';
import { CITY, type SignalState } from '../../world/env/City';
import { crossed, sseg } from '../../core/util';
import { V, corner, Mover, placeCar, driveOur, walkPed, mix, fixed, chaseCam, toWorld } from '../road';

const { lanes, ix, mid } = CITY;
const L2 = lanes[1];
const FRONT = 2.37;

const G: SignalState = { green: true };
const Y: SignalState = { yellow: true };
const R: SignalState = { red: true };
/** 시간에 따라 바뀌는 신호: [[시작 시각, 상태], ...] */
const phase = (t: number, keys: [number, SignalState][]) => {
  let s = keys[0][1];
  for (const [k, v] of keys) if (t >= k) s = v;
  return s;
};

/** +X로 달리는 우리 차 (2차로) */
const eastPath = (x0: number) => new DrivePath({ x: x0, z: L2, h: 0 }, [{ type: 'line', d: 600 }]);

export const signalSteps: Step[] = [
  {
    id: 'red-stop',
    section: 2,
    title: '빨간불이면 정지선 앞에서 멈춤',
    body: '신호등 있는 교차로에선 <b>빨간불에 정지선 앞</b>에서 멈춰요. 노란불로 바뀌면 <b>정지선 전에 멈출 수 있을 때는 멈추고</b>, 이미 정지선을 넘었을 때만 빠르게 지나가요. 멈출 땐 <b>횡단보도 위에 걸치지 않게</b> 정지선 앞에 서야 보행자가 안전하게 건너요.',
    facts: [
      { k: '빨간불', v: '정지선 앞에서 정지' },
      { k: '노란불', v: '멈출 수 있으면 정지' },
    ],
    env: 'city',
    mode: 'exterior',
    cut: true,
    duration: 15,
    inset: `<h3>신호 읽기</h3>
      <div class="row" data-k="g"><span class="key" style="background:#15924a">초록</span><span>진행 (직진·우회전)</span></div>
      <div class="row" data-k="y"><span class="key" style="background:#d98306">노랑</span><span>정지선 전이면 <b>멈춤</b>, 이미 넘었으면 빠르게 통과</span></div>
      <div class="row" data-k="r"><span class="key" style="background:#e5352b">빨강</span><span><b>정지선 앞</b>에서 정지</span></div>`,
    cam: (t, ctx) => {
      const d = ctx.car.root.userData as { car: Mover };
      return mix(chaseCam(d.car, t, 9, 3.6, 1.4, 10), fixed([233, 8.5, -10], [245, 0, 4], 46), sseg(t, 7.2, 9.4));
    },
    enter(ctx) {
      engineRunning(ctx, 'D');
      ctx.driver = { handL: 'wheel', handR: 'wheel', footR: 'accel', footL: 'rest' };
      ctx.car.lights.tail = true;
      const x0 = 175;
      const sStop = ix.stopE - 0.25 - FRONT - x0;
      ctx.car.root.userData = {
        steer: { v: 0 },
        car: new Mover(eastPath(x0), [[0, 0, 11], [3.2, 35.2, 11], [9, sStop, 0]]),
        cross: new Mover(new DrivePath({ x: ix.x - ix.half / 2, z: -90, h: -Math.PI / 2 }, [{ type: 'line', d: 400 }]), [[0, 0, 0], [6.6, 0, 0], [9.6, 18, 10], [12, 42, 11]]),
      };
      ctx.labels.add('y', () => toWorld({ x: ix.crossW + 4, z: 3.4, h: 0 }, 0, 5.4, 0), { text: '노란불: 멈출 수 있으면 멈춤', kind: 'amber', dir: 'up', len: 30, visible: false });
      ctx.labels.add('stop', () => ctx.car.root.position.clone().add(V(0, 1.8, 0)), { text: '정지선 앞에서 정지', kind: 'ok', len: 28, visible: false });
      ctx.labels.add('cw', V(ix.crossE, 0.2, -2), { text: '횡단보도는 사람 차지', kind: 'info', dir: 'down', len: 40, visible: false });
    },
    update(ctx, t, _prev, dt) {
      const d = ctx.car.root.userData as { steer: { v: number }; car: Mover; cross: Mover };
      driveOur(ctx, d.car, t, d.steer, dt);
      const v = d.car.speed(t);
      ctx.car.lights.brake = t > 3.3;
      if (ctx.driver) ctx.driver.footR = t > 3.2 ? 'brake' : 'accel';
      ctx.cockpit.brake = t > 3.2 ? 1 : 0;
      const main = phase(t, [[0, G], [2.4, Y], [5.4, R]]);
      const side = phase(t, [[0, R], [6.4, G]]);
      ctx.city.sig.E.set(main);
      ctx.city.sig.W.set(main);
      ctx.city.sig.N.set(side);
      ctx.city.sig.S.set(side);
      const walk = t > 6.4;
      ctx.city.ped.E_n.set(walk);
      ctx.city.ped.E_s.set(walk);
      ctx.city.ped.W_n.set(walk);
      ctx.city.ped.W_s.set(walk);
      if (t > 6.4) {
        walkPed(ctx, 0, [ix.crossE - 0.8, CITY.half + 1.2], [ix.crossE - 0.8, -CITY.half - 1.2], 7, 1.3, t);
        walkPed(ctx, 1, [ix.crossE + 0.8, -CITY.half - 1.2], [ix.crossE + 0.8, CITY.half + 1.2], 7.8, 1.2, t);
      }
      placeCar(ctx.city.cars[3], d.cross, t);
      ctx.labels.show('y', t > 2.4 && t < 5.6);
      ctx.labels.show('stop', t > 8.6);
      ctx.labels.show('cw', t > 9.6);
      ctx.ui.insetActive(main.green ? 'g' : main.yellow ? 'y' : 'r');
      void v;
    },
  },
  {
    id: 'mid-signal',
    section: 2,
    title: '교차로가 아닌 곳의 정지선·신호등도 지키기',
    body: '교차로가 아닌데 <b>정지선과 신호등</b>이 있고, <b>40m쯤 앞에 횡단보도</b>가 또 있는 곳이 있어요. 앞 횡단보도만 보고 첫 정지선을 지나치면 안 돼요. 이 신호는 <b>왼쪽 건물에서 나오는 차</b>가 좌회전 신호를 받고 내 차로로 들어오는 동안 나를 세우는 신호예요.',
    facts: [
      { k: '첫 정지선', v: '건물 진출입로 신호' },
      { k: '40m 앞', v: '횡단보도 신호' },
    ],
    tip: '신호등이 두 개 연달아 보이면 각각 따로 지켜요. 앞 신호가 초록이어도 가까운 신호가 빨강이면 멈춤.',
    env: 'city',
    mode: 'exterior',
    cut: true,
    duration: 21,
    inset: `<h3>신호가 두 번 있는 길</h3>${rows([
      ['1', '1', '<b>첫 정지선</b>: 건물 진출입로 신호'],
      ['2', '2', '건물 차가 <b>좌회전 신호</b>로 내 차로에 들어옴'],
      ['3', '3', '초록불 → 출발, <b>40m 앞 횡단보도 신호</b> 다시 확인'],
    ])}`,
    cam: (t, ctx) => {
      const d = ctx.car.root.userData as { car: Mover };
      let p = mix(chaseCam(d.car, t, 9, 3.6, 1.4, 12), fixed([106, 11, -5], [128, 0, 2], 50), sseg(t, 3.2, 6));
      p = mix(p, chaseCam(d.car, t, 10, 4, 1.4, 12), sseg(t, 14.6, 16.8));
      return p;
    },
    enter(ctx) {
      engineRunning(ctx, 'D');
      ctx.driver = { handL: 'wheel', handR: 'wheel', footR: 'accel', footL: 'rest' };
      ctx.car.lights.tail = true;
      const x0 = 40;
      const sStop = mid.stopE - 0.25 - FRONT - x0;
      // 왼쪽 건물 차: 진출입로 정지선에서 대기 → 좌회전 신호에 2차로로 (반경 10, 수치 맞춤)
      const zWait = mid.driveStop - 0.2 - FRONT;
      const bStart = { x: mid.driveLane, z: -45, h: -Math.PI / 2 };
      const bPath = new DrivePath(bStart, [{ type: 'line', d: -4.7 - bStart.z }, ...corner(1, 10, 2), { type: 'line', d: 300 }]);
      const sWait = zWait - bStart.z;
      // 앞 횡단보도 신호만 보고 1차로로 그냥 달리는 차 (반투명 빨강): 건물 차가 들어올 때 진출입로에 닿음
      const gx0 = 4.8;
      ctx.car.root.userData = {
        steer: { v: 0 },
        car: new Mover(eastPath(x0), [[0, 0, 11], [3.2, 35.2, 11], [9.4, sStop, 0], [14.8, sStop, 0], [17.4, sStop + 13, 8], [21, sStop + 50, 11]]),
        ghost: new Mover(new DrivePath({ x: gx0, z: lanes[0], h: 0 }, [{ type: 'line', d: 600 }]), [[0, 0, 11], [11, 121, 11], [11.7, 124.85, 0]]),
        bld: new Mover(bPath, [[0, sWait - 4, 2], [2, sWait, 0], [6.6, sWait, 0], [8.8, sWait + 8.2, 6], [10.8, sWait + 22.2, 7], [12.2, sWait + 30.2, 6.5], [15, sWait + 54, 9], [19, sWait + 95, 11]]),
      };
      ctx.labels.add('first', V(mid.stopE, 0.2, 9.2), { text: '첫 정지선', sub: '건물 진출입로 신호', kind: 'amber', dir: 'up', len: 50, visible: false });
      ctx.labels.add('cross', V(mid.cross, 0.2, 9.2), { text: '횡단보도는 40m 앞', kind: 'info', dir: 'up', len: 50, visible: false });
      ctx.labels.add('bld', () => ctx.city.cars[4].root.position.clone().add(V(0, 1.9, 0)), { text: '좌회전 신호 받고 출발', kind: 'warn', len: 26, visible: false });
      ctx.labels.add('hit', V(129, 1, lanes[0]), { text: '건물 차와 충돌!', kind: 'warn', big: true, len: 44, visible: false });
    },
    update(ctx, t, prev, dt) {
      const d = ctx.car.root.userData as { steer: { v: number }; car: Mover; ghost: Mover; bld: Mover };
      driveOur(ctx, d.car, t, d.steer, dt);
      const L = ctx.car.lights;
      L.brake = (t > 3.3 && t < 14.8) || d.car.speed(t) < 0.2;
      if (ctx.driver) ctx.driver.footR = L.brake ? 'brake' : 'accel';
      const our = phase(t, [[0, G], [2, Y], [5, R], [14.5, G]]);
      ctx.city.sig.midE.set(our);
      ctx.city.sig.midW.set(our);
      ctx.city.sig.midDrive.set(phase(t, [[0, R], [6.4, { red: true, left: true }], [12.6, R]]));
      ctx.city.sig.crossE.set(G);
      ctx.city.sig.crossW.set(G);
      const b = ctx.city.cars[4];
      placeCar(b, d.bld, t);
      b.lights.turnL = t < 12.4;
      b.lights.brake = t < 6.7;
      b.update(dt, ctx.time, 0);
      const g = ctx.city.ghost;
      g.root.visible = t > 8 && t < 12.8;
      if (g.root.visible) placeCar(g, d.ghost, t);
      if (crossed(prev, t, 8)) ctx.ui.toast('앞 횡단보도 신호만 보고 지나가면?', '');
      if (crossed(prev, t, 11.2)) {
        ctx.ui.flash();
        ctx.sfx.squeal();
      }
      ctx.labels.show('first', t > 1 && t < 14.6);
      ctx.labels.show('cross', t > 1.6 && t < 6.4);
      ctx.labels.show('bld', t > 6.4 && t < 12.6);
      ctx.labels.show('hit', t > 11.2 && t < 12.9);
      const step = t < 6.4 ? '1' : t < 14.5 ? '2' : '3';
      ctx.ui.insetActive(step);
      ctx.ui.insetActive(['1', '2', '3'].filter((k) => k < step), 'done');
    },
  },
];
