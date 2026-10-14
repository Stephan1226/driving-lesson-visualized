import type { Step } from '../types';
import { rows, engineRunning, wheelHand } from '../helpers';
import { DrivePath, type Pose } from '../../core/path';
import { CITY } from '../../world/env/City';
import { crossed, sseg } from '../../core/util';
import { V, corner, cornerLen, Mover, placeCar, driveOur, walkPed, mix, fixed, chaseCam, eyeCam, toWorld, plan } from '../road';
import type { SignalState } from '../../world/env/City';

const { exit, lanes, alley } = CITY;
const L3 = lanes[2];
const FRONT_ = 2.37;

/** 건물 통로 안에서 출발 → 보도 앞 → 차도 앞 → 3차로로 우회전 */
const START: Pose = { x: exit.x, z: 30, h: Math.PI / 2 };
const LOOK_Z = exit.front + 0.1 + 2.37; // 앞범퍼가 건물 앞면(보도 시작)에서 멈춤
const EDGE_Z = CITY.half + 0.4 + 2.37; // 앞범퍼가 차도 가장자리에서 멈춤
const R_OUT = 5.223; // 3차로 중심으로 들어가는 반경 (수치 맞춤, 연석 모서리와 0.8m)
const S_LOOK = START.z - LOOK_Z;
const S_EDGE = START.z - EDGE_Z;
const S_LANE = S_EDGE + cornerLen(R_OUT, 1.5);
/** 잘못된 예: 멈추지 않고 나오다 보행자 앞에서 급정거 (앞범퍼 z = 13) */
const S_GHOST = START.z - (13 + 2.37);
const HIT_T = 5.8;
const OUT = new DrivePath(START, [{ type: 'line', d: S_EDGE }, ...corner(-1, R_OUT, 1.5), { type: 'line', d: 300 }]);

/** 보도 가운데 줄 (사람이 걷는 선) */
const WALK_Z = (CITY.half + 0.3 + exit.front - 0.5) / 2;

const sideWalk = (x0: number, x1: number): [[number, number], [number, number]] => [[x0, WALK_Z], [x1, WALK_Z]];

/** 운전석 눈 위치 (차 포즈 기준) */
const eyeOf = (p: Pose) => toWorld(p, -0.36, 1.2, -0.38);

/** +X로 달리는 직진 차: tPass에 x = at 지점을 지남 */
const passer = (lane: number, tPass: number, at = exit.x, v = 11) =>
  new Mover(new DrivePath({ x: at - v * (tPass + 20), z: lane, h: 0 }, [{ type: 'line', d: 600 }]), [[-20, 0, v]]);

export const exitSteps: Step[] = [
  {
    id: 'exit-blind',
    section: 1,
    title: '건물 출구는 사각지대, 보도 앞에서 한 번 멈춤',
    body: '건물 주차장 출구는 양옆이 <b>벽과 기둥</b>으로 막혀 있어서, 운전석에선 <b>보도로 걸어오는 사람이 안 보여요</b>. 출구를 나가자마자 보도이니 <b>건물 끝선에서 한 번 멈추고</b> 양쪽을 확인한 뒤, 보도는 사람 걷는 속도로 건너세요.',
    facts: [
      { k: '멈추는 곳', v: '건물 끝선 (보도 앞)' },
      { k: '보도 위', v: '사람 걷는 속도' },
    ],
    tip: '출구에 볼록거울(반사경)이나 경고등이 있으면 함께 보세요. 그래도 거울만 믿지 말고 멈춰서 확인하는 게 우선이에요.',
    env: 'city',
    mode: 'exterior',
    duration: 25.5,
    inset: `<h3>건물에서 나올 때</h3>${rows([
      ['1', '1', '<b>건물 끝선</b>에서 멈춤'],
      ['2', '2', '양쪽 <b>보도</b>에 사람이 없는지'],
      ['3', '3', '보도는 <b>천천히</b> 건너기'],
      ['4', '4', '<b>차도 앞</b>에서 다시 멈춤'],
    ])}`,
    cam: (t, ctx) => {
      const top = fixed([-7, 16, -3], [-1.5, 0, 18], 46);
      let p = mix(top, eyeCam(ctx, [3.2, 0.7, -4.2], 66), sseg(t, 13.6, 15));
      p = mix(p, fixed([10, 7, -1], [-0.5, 0, 14], 46), sseg(t, 20.8, 22.2));
      return p;
    },
    enter(ctx) {
      engineRunning(ctx, 'D');
      ctx.driver = { handL: 'wheel', handR: 'wheel', footR: 'brake', footL: 'rest' };
      ctx.car.lights.tail = true;
      ctx.car.root.userData = {
        steer: { v: 0 },
        car: new Mover(OUT, [[0, 0, 0], [9.2, 0, 0], [10.6, 1.8, 2.2], [12.3, 6.6, 2.8], [14.4, S_LOOK, 0], [20.6, S_LOOK, 0], [22.2, S_LOOK + 1.5, 1.6], [24.4, S_EDGE, 0]]),
        ghost: new Mover(OUT, [[0, 0, 0], [1.4, 0, 0], [2.7, 2.6, 4], [5.3, 13, 4], [HIT_T, S_GHOST, 0]]),
      };
      const d = ctx.car.root.userData as { ghost: Mover };
      const ped = () => ctx.city.peds[0].holder.position.clone().add(V(0, 1.95, 0));
      ctx.labels.add('hit', toWorld(d.ghost.at(HIT_T), 2.2, 1.0, 0), { text: '보행자와 부딪힐 뻔', kind: 'warn', big: true, dir: 'right', len: 40, visible: false });
      ctx.labels.add('wall', V(exit.x - exit.passage, 3.2, exit.front), { text: '벽에 가려 보도가 안 보여요', kind: 'warn', dir: 'left', len: 40, visible: false });
      ctx.labels.add('ped', ped, { text: '갑자기 나타난 보행자', kind: 'warn', len: 26, visible: false });
      ctx.labels.add('stop', () => ctx.car.root.position.clone().add(V(0, 1.8, 0)), { text: '건물 끝선에서 멈춤', sub: '양쪽 보도 확인', kind: 'amber', len: 28, visible: false });
      ctx.labels.add('slow', () => ctx.car.root.position.clone().add(V(0, 1.8, 0)), { text: '보도는 걷는 속도로', kind: 'ok', len: 28, visible: false });
    },
    update(ctx, t, prev, dt) {
      const d = ctx.car.root.userData as { steer: { v: number }; car: Mover; ghost: Mover };
      const me = driveOur(ctx, d.car, t, d.steer, dt);
      ctx.car.lights.brake = d.car.speed(t) < 0.3 || (t > 13.4 && t < 14.4) || t > 23.6;
      // 운전석 시점에선 마네킹(머리·팔)이 화면을 가리므로 손만 보여 준다
      const eyeView = t > 13.8 && t < 21.4;
      ctx.driver = eyeView ? null : { handL: 'wheel', handR: 'wheel', footR: 'brake', footL: 'rest' };
      ctx.ghost = eyeView ? { L: wheelHand(ctx, 'L'), R: wheelHand(ctx, 'R') } : {};
      // ① 그냥 빨리 나가면? (반투명 빨간 차)
      const ghostOn = t > 1.2 && t < 8.6;
      const g = ctx.city.ghost;
      g.root.visible = ghostOn;
      if (ghostOn) placeCar(g, d.ghost, t);
      walkPed(ctx, 0, ...sideWalk(-8.6, 9), 1.4, 1.8, t, t < 9.4);
      // ② 제대로: 건물 끝선에서 멈춤 → 보행자 지나감 → 천천히
      if (t > 9.4) walkPed(ctx, 1, ...sideWalk(-10, 12), 11.5, 1.4, t);
      const eyeFrom = ghostOn ? d.ghost.at(t) : me;
      // 운전석 시점(13.6~21초)에선 겹쳐 보여 헷갈리므로 끈다
      ctx.city.setBlind(t < 0.6 || (t > 13.6 && t < 21) ? null : eyeOf(eyeFrom));
      if (crossed(prev, t, HIT_T)) {
        ctx.sfx.squeal();
        ctx.ui.flash();
        ctx.ui.toast('끼익!', 'warn');
      }
      if (crossed(prev, t, 8.9)) ctx.ui.toast('이번엔 건물 끝선에서 멈춰서', '');
      ctx.labels.show('wall', t > 0.6 && t < 4.2);
      ctx.labels.show('ped', t > 3.6 && t < 8.4);
      ctx.labels.show('hit', t > HIT_T && t < 8.4);
      ctx.labels.show('stop', t > 14.2 && t < 20.6);
      ctx.labels.show('slow', t > 21);
      const step = t < 14.4 ? '1' : t < 20.6 ? '2' : t < 24 ? '3' : '4';
      ctx.ui.insetActive(t > 9 ? step : null);
      ctx.ui.insetActive(t > 9 ? ['1', '2', '3', '4'].filter((k) => k < step) : [], 'done');
    },
  },
  {
    id: 'exit-flow',
    section: 1,
    title: '흐름을 탄 직진 차가 먼저',
    body: '차도 앞에서 다시 멈춰 <b>왼쪽에서 오는 차</b>를 봐요. 도로를 따라 달리는 <b>직진 차가 우선</b>이고, 길 밖(건물·주차장)에서 들어가는 내가 기다려야 해요. 틈이 넉넉할 때 <b>가장 가까운 차로</b>(오른쪽 끝 차로)로 우회전해 들어갑니다.',
    facts: [
      { k: '우선', v: '도로를 달리는 직진 차' },
      { k: '들어갈 차로', v: '가장 오른쪽 차로' },
    ],
    tip: '들어간 뒤엔 바로 속도를 올려 흐름에 맞추세요. 느릿느릿 들어가면 뒤차가 급하게 감속해야 해요.',
    env: 'city',
    mode: 'exterior',
    duration: 17,
    cam: (t, ctx) => {
      const d = ctx.car.root.userData as { car: Mover };
      const wide = fixed([7, 13, -17], [-8, 0, 7], 52);
      return mix(wide, chaseCam(d.car, t, 9, 3.4, 1.2, 6), sseg(t, 10.6, 13.4));
    },
    enter(ctx) {
      engineRunning(ctx, 'D');
      ctx.driver = { handL: 'wheel', handR: 'wheel', footR: 'brake', footL: 'rest' };
      ctx.car.lights.tail = true;
      ctx.car.root.userData = {
        steer: { v: 0 },
        car: new Mover(OUT, [[0, S_EDGE, 0], [9.6, S_EDGE, 0], [12.2, S_LANE, 3.6], [16, S_LANE + 25, 9]]),
        traffic: [passer(L3, 2.0), passer(lanes[1], 3.6), passer(L3, 5.6), passer(lanes[1], 7.4), passer(L3, 17.5)],
      };
      ctx.labels.add('flow', () => ctx.city.cars[0].root.position.clone().add(V(0, 1.9, 0)), { text: '직진 차가 먼저', kind: 'info', len: 26, visible: false });
      ctx.labels.add('wait', () => ctx.car.root.position.clone().add(V(0, 1.8, 0)), { text: '틈이 생길 때까지 대기', kind: 'amber', len: 28, visible: false });
      ctx.labels.add('go', () => ctx.car.root.position.clone().add(V(0, 1.8, 0)), { text: '틈이 넉넉 → 끝 차로로', kind: 'ok', len: 28, visible: false });
    },
    update(ctx, t, prev, dt) {
      const d = ctx.car.root.userData as { steer: { v: number }; car: Mover; traffic: Mover[] };
      driveOur(ctx, d.car, t, d.steer, dt);
      d.traffic.forEach((m, i) => placeCar(ctx.city.cars[i], m, t));
      const L = ctx.car.lights;
      L.brake = t < 9.6;
      L.turnR = t > 0.4 && t < 12;
      if (crossed(prev, t, 0.4)) ctx.car.blinkT0 = ctx.time;
      ctx.labels.show('flow', t > 1 && t < 4);
      ctx.labels.show('wait', t > 1 && t < 9.4);
      ctx.labels.show('go', t > 9.6 && t < 12.6);
    },
  },
  {
    id: 'exit-uturn',
    section: 1,
    cut: true,
    title: '왼쪽이 비어도, 맞은편 유턴 차 먼저',
    body: '골목이 <b>신호 교차로</b>에 붙어 있으면, 맞은편 차로는 내 골목 바로 앞 정지선에서 <b>좌회전 신호</b>를 받아요. 이 신호에 내 골목으로 <b>좌회전도 하고 유턴도 해요</b>. 이때 내 왼쪽 직진 차는 빨간불이라 <b>왼쪽이 텅 비어 보이지만</b>, 유턴한 차가 <b>내가 들어갈 끝 차로</b>로 크게 돌아 나와요. 우회전하기 전에 <b>맞은편 유턴 차</b>를 꼭 확인하세요.',
    facts: [
      { k: '왼쪽 직진 차', v: '빨간불이라 멈춤' },
      { k: '맞은편', v: '좌회전 신호에 좌회전·유턴' },
    ],
    tip: '맞은편 신호는 내 자리에서 안 보여요. 맞은편 1차로 차가 왼쪽 깜빡이를 켜고 움직이기 시작하면 유턴을 먼저 의심하세요.',
    env: 'city',
    mode: 'exterior',
    duration: 25,
    inset: `<h3>신호 있는 골목에서 우회전</h3>${rows([
      ['1', '1', '빨간불: <b>정지선에서 일단 멈춤</b>'],
      ['2', '2', '왼쪽 <b>직진 차</b>가 지나갈 때까지'],
      ['3', '3', '맞은편 <b>좌회전 신호</b> → 유턴 차가 끝 차로로'],
      ['4', '4', '<b>유턴 차가 지나간 뒤</b> 우회전'],
    ])}`,
    cam: (t, ctx) => {
      const d = ctx.car.root.userData as { car: Mover };
      const wide = fixed([alley.x + 15, 12, -7.5], [alley.x + 1, 0, 6.5], 56);
      return mix(wide, chaseCam(d.car, t, 9, 3.4, 1.2, 6), sseg(t, 19.4, 21.8));
    },
    enter(ctx) {
      engineRunning(ctx, 'D');
      ctx.driver = { handL: 'wheel', handR: 'wheel', footR: 'brake', footL: 'rest' };
      ctx.car.lights.tail = true;
      // 골목 나가는 차로(x = 골목 + 1.75)에서: 정지선 → 차도 앞(앞범퍼가 연석선 0.9m 안) → 3차로로 우회전 (반경 5.223, 둥근 연석과 0.9m)
      const ax = alley.x + alley.half / 2;
      const z0 = 22;
      const path = new DrivePath({ x: ax, z: z0, h: Math.PI / 2 }, [{ type: 'line', d: z0 - EDGE_Z }, ...corner(-1, R_OUT, 1.5), { type: 'line', d: 300 }]);
      const sStop = z0 - (alley.stopS - 0.2 + FRONT_);
      const sLook = z0 - (CITY.half + 0.9 + FRONT_);
      const sLane = z0 - EDGE_Z + cornerLen(R_OUT, 1.5);
      // 맞은편 1차로: 앞차는 내 골목으로 좌회전(반경 8), 뒤차는 교차로 안까지 들어와 유턴(반경 4.938, 연석과 0.9m)
      const wStop = alley.stopW + 0.2 + FRONT_;
      const ltPath = new DrivePath({ x: wStop, z: -lanes[0], h: Math.PI }, [{ type: 'line', d: 6.17 }, ...corner(1, 8, 2), { type: 'line', d: 80 }]);
      const uPath = new DrivePath({ x: wStop + 6.5, z: -lanes[0], h: Math.PI }, [{ type: 'line', d: 16.5 }, ...corner(1, 4.938, 1.2, Math.PI), { type: 'line', d: 300 }]);
      const U_END = 16.5 + 4.938 * Math.PI + 1.2;
      // 왼쪽에서 오는 직진 차: 흐름 → 노란불에 정지선에서 멈춤
      const eStop = alley.stopE - 0.2 - FRONT_;
      ctx.car.root.userData = {
        steer: { v: 0 },
        car: new Mover(path, plan(0, 3, [['to', sStop, 0], ['hold', 3.6], ['to', sStop + 2, 1.6], ['to', sLook, 0], ['hold', 19.2], ['to', sLane, 4.5], ['to', sLane + 20, 8]])),
        ghost: new Mover(path, plan(sLook, 0, [['hold', 14], ['to', sLook + 1.5, 3], ['to', sLane - 1, 4], ['to', sLane + 1, 0]])),
        flow: [passer(L3, 1.5, alley.x), passer(lanes[1], 3, alley.x), passer(L3, 4.8, alley.x)],
        stopper: new Mover(new DrivePath({ x: eStop - 80, z: L3, h: 0 }, [{ type: 'line', d: 200 }]), plan(0, 11, [['to', 55, 11], ['to', 80, 0]])),
        lt: new Mover(ltPath, plan(0, 0, [['hold', 8.8], ['to', 6.17, 5], ['to', 6.17 + cornerLen(8, 2), 5], ['to', 6.17 + cornerLen(8, 2) + 25, 6]])),
        u: new Mover(uPath, plan(0, 0, [['hold', 10.2], ['to', 16.5, 6], ['to', U_END, 5.5], ['to', U_END + 40, 10]])),
        uEnd: U_END,
      };
      const above = (i: number) => () => ctx.city.cars[i].root.position.clone().add(V(0, 1.9, 0));
      ctx.labels.add('me', () => ctx.car.root.position.clone().add(V(0, 1.8, 0)), { text: '', kind: 'amber', len: 28, visible: false });
      ctx.labels.add('left', above(4), { text: '왼쪽 직진: 빨간불로 멈춤', kind: 'info', len: 24, visible: false });
      ctx.labels.add('lt', above(6), { text: '내 골목으로 좌회전', kind: 'info', len: 24, visible: false });
      ctx.labels.add('u', above(5), { text: '좌회전 신호에 유턴 → 끝 차로로', kind: 'warn', len: 30, visible: false });
      ctx.labels.add('hit', V(alley.x + 7, 1, L3), { text: '유턴 차와 겹침!', kind: 'warn', big: true, len: 40, visible: false });
    },
    update(ctx, t, prev, dt) {
      const d = ctx.car.root.userData as {
        steer: { v: number }; car: Mover; ghost: Mover; flow: Mover[]; stopper: Mover; lt: Mover; u: Mover; uEnd: number;
      };
      driveOur(ctx, d.car, t, d.steer, dt);
      const L = ctx.car.lights;
      L.brake = d.car.speed(t) < 0.5 || (t > 1.6 && t < 3.6);
      L.turnR = t > 0.3 && t < 22;
      if (crossed(prev, t, 0.3)) ctx.car.blinkT0 = ctx.time;
      const G: SignalState = { green: true };
      const Y: SignalState = { yellow: true };
      const R: SignalState = { red: true };
      const main = t < 6 ? G : t < 8 ? Y : R;
      ctx.city.sig.alleyE.set(main);
      ctx.city.sig.alleyW.set(t < 8 ? main : t < 8.6 || t > 20 ? R : { red: true, left: true });
      ctx.city.sig.alleyS.set(R);
      d.flow.forEach((m, i) => placeCar(ctx.city.cars[i], m, t));
      const st = ctx.city.cars[4];
      placeCar(st, d.stopper, t);
      st.lights.brake = t > 6.4;
      st.update(dt, ctx.time, 0);
      const lt = ctx.city.cars[6];
      placeCar(lt, d.lt, t);
      lt.lights.turnL = t < 14.6;
      lt.lights.brake = t < 8.9;
      lt.update(dt, ctx.time, 0);
      const u = ctx.city.cars[5];
      placeCar(u, d.u, t);
      u.lights.turnL = d.u.travel(t) < d.uEnd - 2;
      u.lights.brake = t < 10.3;
      u.update(dt, ctx.time, 0);
      const g = ctx.city.ghost;
      g.root.visible = t > 14 && t < 18.4;
      if (g.root.visible) placeCar(g, d.ghost, t);
      if (crossed(prev, t, 14)) ctx.ui.toast('왼쪽이 비었네? 지금 나가면?', '');
      if (crossed(prev, t, 16.6)) {
        ctx.ui.flash();
        ctx.sfx.squeal();
      }
      const msg: [string, string] =
        t < 3.6 ? ['빨간불 우회전: 정지선에서 멈춤', 'amber'] : t < 6.4 ? ['천천히 나와 왼쪽 확인', 'amber'] : t < 8.6 ? ['왼쪽 직진 차 먼저', 'amber']
        : t < 14 ? ['왼쪽은 비었지만…', 'info'] : t < 19.2 ? ['맞은편 유턴 차 먼저', 'warn'] : ['유턴 차가 지나간 뒤 우회전', 'ok'];
      ctx.labels.set('me', { visible: t > 0.6 && t < 22, text: msg[0], kind: msg[1] as 'ok' });
      ctx.labels.show('left', t > 9 && t < 15);
      ctx.labels.show('lt', t > 9 && t < 14.4);
      ctx.labels.show('u', t > 10.4 && t < 18.6);
      ctx.labels.show('hit', t > 16.6 && t < 18.4);
      const step = t < 3.6 ? '1' : t < 8.6 ? '2' : t < 19.2 ? '3' : '4';
      ctx.ui.insetActive(step);
      ctx.ui.insetActive(['1', '2', '3', '4'].filter((k) => k < step), 'done');
    },
  },
];
