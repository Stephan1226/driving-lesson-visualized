import type { Ctx } from '../context';
import { grab, world } from '../context';
import type { Step } from '../types';
import { S, V, wheelHand, reach, engineRunning, rows } from '../helpers';
import type { HandTarget } from '../../world/car/Driver';
import { crossed, sseg, track, pick, DEG, blinkOn } from '../../core/util';

/** 버튼·레버를 일정 시간 동안 잡고 있다가 핸들로 돌아가는 유령 손 */
function handTimeline(home: () => HandTarget, target: () => HandTarget, t: number, t0: number, t1: number, t2: number, t3: number) {
  if (t < t1) return reach(home, target, sseg(t, t0, t1));
  if (t < t2) return target;
  return reach(target, home, sseg(t, t2, t3));
}

const setBlink = (ctx: Ctx, prev: number, t: number, at: number) => {
  if (crossed(prev, t, at)) ctx.car.blinkT0 = ctx.time;
};

export const controlSteps: Step[] = [
  {
    id: 'seatbelt',
    section: 2,
    title: '타면 가장 먼저, 안전벨트',
    body: '출발 전 가장 먼저 할 일! 벨트를 천천히 당겨 <b>꼬이지 않게</b> 몸 앞으로 가져와 <b>‘찰칵’</b> 소리가 날 때까지 끼웁니다. 어깨띠는 <b>쇄골 가운데</b>, 허리띠는 배가 아닌 <b>골반 뼈</b> 위로 지나가야 해요.',
    facts: [
      { k: '어깨띠', v: '목·겨드랑이 X, 쇄골 중앙' },
      { k: '허리띠', v: '배 X, 골반 위로 낮게' },
      { k: '뒷좌석', v: '모든 좌석 착용 의무' },
    ],
    env: 'park',
    mode: 'cutaway',
    duration: 13,
    cut: true,
    cam: [S(0, [1.0, 1.3, -1.95], [-0.12, 0.85, -0.3], 40), S(6.5, [0.85, 1.25, -1.75], [-0.12, 0.85, -0.32], 38), S(13, [0.6, 1.12, -1.45], [-0.15, 0.82, -0.34], 38)],
    enter(ctx) {
      const c = ctx.cockpit;
      c.beltVisible = true;
      c.cluster.state.power = 'on';
      c.cluster.state.belt = true;
      ctx.driver = { handL: 'wheel', handR: 'lap', footR: 'floor', footL: 'rest' };
      const chest = () => {
        const hip = c.seat.hip();
        return world(ctx, ctx.man.shoulderL.clone().lerp(hip, 0.32).add(V(0.15, 0, 0.1)));
      };
      ctx.labels.add('sh', chest, { text: '어깨띠: 쇄골 가운데', kind: 'ok', dir: 'right', len: 70, visible: false });
      ctx.labels.add('lap', () => world(ctx, c.seat.hip().add(V(0.18, 0.02, 0.02))), { text: '허리띠: 골반 위로 낮게', kind: 'ok', dir: 'down', len: 60, visible: false });
      ctx.labels.add('buckle', c.anchors.buckle, { text: '찰칵!', kind: 'info', len: 30, visible: false });
    },
    update(ctx, t, prev) {
      const c = ctx.cockpit;
      const k = sseg(t, 1.6, 6.4);
      const T = c.updateBelt(k, ctx.man)!;
      const finger = V(0.25, -0.1, -1).normalize();
      const hold: HandTarget = { pos: T.clone().addScaledVector(finger, -0.07).add(V(-0.01, 0.02, 0)), finger, back: V(0, 1, 0.1), pose: 'pinch' };
      const lap = (): HandTarget => ({ pos: c.seat.hip().add(V(0.24, 0.12, 0.11)), finger: V(1, -0.4, 0), back: V(0, 1, 0), pose: 'relaxed' });
      const wheel = wheelHand(ctx, 'R');
      ctx.driver!.handR = t < 1.6 ? reach(lap, () => hold, sseg(t, 0.2, 1.6)) : t < 6.8 ? hold : reach(() => hold, wheel, sseg(t, 6.9, 8.2));
      if (crossed(prev, t, 6.45)) {
        ctx.sfx.buckle();
        ctx.ui.toast('찰칵!', 'ok');
        c.cluster.state.belt = false;
      }
      ctx.labels.show('buckle', t > 6.4 && t < 8);
      ctx.labels.show('sh', t > 8);
      ctx.labels.show('lap', t > 8.6);
    },
  },
  {
    id: 'pedals',
    section: 2,
    title: '페달은 오른발 하나로',
    body: '자동변속기 차의 페달은 두 개예요. <b>오른쪽 좁고 긴 것이 가속(액셀)</b>, <b>왼쪽 넓은 것이 브레이크</b>. 둘 다 <b>오른발로만</b> 밟고, 왼발은 왼쪽 발판(풋레스트)에 둡니다. 뒤꿈치를 바닥에 붙인 채 <b>발끝만 돌려</b> 옮겨요.',
    facts: [
      { k: '가속', v: '오른쪽 · 좁고 긴 페달' },
      { k: '브레이크', v: '왼쪽 · 넓은 페달' },
      { k: '왼발', v: '풋레스트에 고정' },
    ],
    tip: '처음엔 오른발을 항상 브레이크 위에 올려 두는 습관을 들이세요. 급할 때 헷갈리지 않아요.',
    env: 'park',
    mode: 'cutaway',
    duration: 13,
    cam: [S(0, [-0.1, 1.05, -1.2], [0.62, 0.3, -0.45], 46), S(3, [0.08, 0.86, -0.78], [0.68, 0.27, -0.42], 50), S(13, [0.1, 0.84, -0.74], [0.68, 0.27, -0.42], 50)],
    enter(ctx) {
      ctx.driver = { handL: 'wheel', handR: 'wheel', footR: 'between', footL: 'rest' };
      ctx.man.setOpacity(0.28, 0.95);
      const a = ctx.cockpit.anchors;
      ctx.labels.add('brake', a.brake, { text: '브레이크', sub: '넓은 페달', kind: 'warn', dir: 'left', len: 60, visible: false });
      ctx.labels.add('accel', a.accel, { text: '가속(액셀)', sub: '오른쪽 좁은 페달', kind: 'ok', dir: 'right', len: 50, visible: false });
      ctx.labels.add('rest', a.footrest, { text: '왼발은 풋레스트', kind: 'info', dir: 'down', len: 40, visible: false });
      ctx.labels.add('heel', () => world(ctx, ctx.man.ankleR.clone().add(V(-0.03, -0.1, 0))), { text: '뒤꿈치는 고정', sub: '발끝만 좌우로', dir: 'up', len: 50, visible: false });
    },
    update(ctx, t) {
      const c = ctx.cockpit;
      ctx.footBlend = track(t, [[0, 0], [3.2, 0], [4.3, 1], [7.2, 1], [8.3, 0]]);
      c.brake = track(t, [[0.6, 0], [1.4, 0.85], [2.8, 0.85], [3.1, 0], [8.5, 0], [9.3, 0.9]]);
      c.accel = track(t, [[4.6, 0], [5.4, 0.6], [6.6, 0.6], [7.0, 0]]);
      ctx.car.lights.brake = c.brake > 0.3;
      ctx.labels.show('brake', t > 0.8);
      ctx.labels.show('accel', t > 4.4);
      ctx.labels.show('rest', t > 2);
      ctx.labels.show('heel', t > 3.4 && t < 8.6);
    },
  },
  {
    id: 'start',
    section: 2,
    title: '시동 걸기',
    body: '<b>브레이크를 꾹 밟은 채</b> START 버튼을 누릅니다. 계기판 경고등이 <b>모두 켜졌다가 몇 초 뒤 꺼지면 정상</b>이에요. 열쇠를 꽂는 차라면 ON에서 잠시 기다렸다가 START까지 돌립니다.',
    facts: [
      { k: '순서', v: '브레이크 → 버튼' },
      { k: '브레이크 없이 누르면', v: '전원만 켜짐(ACC·ON)' },
    ],
    env: 'park',
    mode: 'interior',
    duration: 14,
    inset: `<h3>시동 순서</h3>${rows([
      ['brake', '1', '<b>브레이크</b>를 끝까지 꾹 밟기'],
      ['btn', '2', '<b>START 버튼</b> 누르기'],
      ['check', '3', '경고등이 켜졌다 <b>꺼지는지</b> 확인'],
    ])}<div class="note">P(주차) 상태에서만 시동이 걸려요.</div>`,
    cam: [
      S(0, [-0.34, 1.22, -0.36], [0.6, 0.9, -0.2], 52),
      S(2, [-0.16, 1.12, -0.26], [0.56, 0.86, -0.17], 44),
      S(3.4, [-0.16, 1.12, -0.26], [0.56, 0.86, -0.17], 44),
      S(5, [-0.2, 1.13, -0.38], [0.55, 0.97, -0.38], 40),
    ],
    enter(ctx) {
      const c = ctx.cockpit;
      ctx.labels.add('btn', c.anchors.start, { text: 'START 버튼', dir: 'right', len: 40, visible: false });
      ctx.labels.add('cl', c.anchors.cluster, { text: '경고등 전부 켜짐', sub: '몇 초 뒤 꺼지면 정상', kind: 'amber', dir: 'up', len: 70, visible: false });
      ctx.labels.add('p', c.anchors.clusterP, { text: '(P) 파킹 브레이크 표시는 남아요', kind: 'info', dir: 'up', len: 60, visible: false });
    },
    update(ctx, t, prev) {
      const c = ctx.cockpit;
      const s = c.cluster.state;
      s.power = t < 0.5 ? 'off' : t < 2.6 ? 'acc' : 'run';
      s.message = t > 0.5 && t < 2.6 ? '브레이크를 밟고 시동 버튼을 누르세요' : '';
      c.brake = track(t, [[0.9, 0], [1.5, 1]]);
      c.startGlow = t < 0.5 ? 'off' : t < 2.6 ? 'acc' : 'run';
      c.startBtn = track(t, [[2.45, 0], [2.6, 1], [2.9, 0]]);
      s.bulbCheck = t > 2.6 && t < 5.2;
      s.sweep = sseg(t, 2.7, 4.8);
      s.rpm = t > 2.8 ? 0.8 : 0;
      s.belt = false;
      ctx.ghost.R = handTimeline(wheelHand(ctx, 'R'), grab(ctx, 'start', [1, -0.05, 0.1], [0, 1, 0], 'point'), t, 1.4, 2.4, 3.1, 4.2);
      ctx.ghost.L = wheelHand(ctx, 'L');
      if (crossed(prev, t, 2.6)) {
        ctx.sfx.engine();
        ctx.car.lights.drl = true;
      }
      ctx.labels.show('btn', t > 1.2 && t < 3.4);
      ctx.labels.show('cl', t > 3 && t < 5.4);
      ctx.labels.show('p', t > 6);
      ctx.ui.insetActive(t < 1.5 ? null : t < 2.6 ? 'brake' : t < 3.4 ? 'btn' : 'check');
    },
  },
  {
    id: 'steering',
    section: 2,
    title: '핸들 잡는 법·돌리는 법',
    body: '핸들은 시계의 <b>9시와 3시</b> 방향을 가볍게 잡아요. 조금 돌릴 땐 손을 미끄러뜨리며 <b>밀고 당기는(푸시-풀)</b> 방식, 크게 돌릴 땐 손을 <b>엇갈려 넘기는(핸드 오버 핸드)</b> 방식으로 돌립니다.',
    facts: [
      { k: '기본 위치', v: '9시 · 3시' },
      { k: '끝까지', v: '한쪽으로 약 1.5바퀴' },
    ],
    tip: '돌린 뒤 손에 힘을 빼면 핸들이 저절로 풀려요. 손 안에서 살짝 미끄러지게 잡아 풀리는 속도를 조절합니다.',
    env: 'park',
    mode: 'interior',
    duration: 15.5,
    inset: `<h3>핸들 돌리기</h3>${rows([
      ['hold', '1', '<b>9시·3시</b>를 가볍게 잡기'],
      ['push', '2', '<b>푸시-풀</b>: 조금 돌릴 때'],
      ['hoh', '3', '<b>핸드 오버 핸드</b>: 크게 돌릴 때'],
      ['back', '4', '<b>복원</b>: 미끄러지듯 풀기'],
    ])}`,
    cam: [S(0, [-0.64, 1.3, 0.04], [0.22, 0.93, -0.38], 44), S(15.5, [-0.6, 1.3, 0.0], [0.22, 0.93, -0.38], 44)],
    enter(ctx) {
      engineRunning(ctx);
      ctx.labels.add('deg', ctx.cockpit.anchors.wheelTop, { text: '', kind: 'info', len: 26 });
    },
    update(ctx, t) {
      const c = ctx.cockpit;
      // 핸들 각도(도, + = 오른쪽/시계 방향)
      const W = track(t, [[2, 0], [3.8, 75], [4.4, 75], [5.6, 0], [6.4, 0], [7.9, 90], [9.0, 90], [10.4, 180], [11.4, 180], [12.8, 270], [13.4, 270], [15, 0]]);
      c.steer = W * DEG;
      ctx.car.setSteer(-W * DEG * 0.075);
      const grip = (deg: number) => (): HandTarget => ({ ...c.wheelGrip(deg, ctx.car.root, false), pose: 'grip' });
      // 각 손의 림 위 각도(0 = 3시, 90 = 12시, 180 = 9시). 잡고 있으면 핸들과 함께 시계 방향으로 이동
      let L: () => HandTarget;
      let R: () => HandTarget;
      if (t < 8.0 || t > 13.4) {
        // 함께 돌리기 / 복원 시 9·3시로 미끄러지며 복귀
        const k = t > 13.4 ? sseg(t, 13.4, 15) : 0;
        const ang = t > 13.4 ? 0 : W;
        L = grip(180 - ang * (1 - k));
        R = grip(0 - ang * (1 - k));
      } else if (t < 9.0) {
        L = grip(90);
        R = reach(grip(-90), grip(150), sseg(t, 8.0, 9.0), 0.1);
      } else if (t < 10.4) {
        L = grip(90 - (W - 90));
        R = grip(150 - (W - 90));
      } else if (t < 11.4) {
        L = reach(grip(0), grip(180), sseg(t, 10.4, 11.4), 0.1);
        R = grip(60);
      } else {
        L = grip(180 - (W - 180));
        R = grip(60 - (W - 180));
      }
      ctx.ghost.L = L;
      ctx.ghost.R = R;
      ctx.labels.set('deg', { text: t < 2 ? '9시 · 3시' : `핸들 ${Math.round(W)}°` });
      ctx.ui.insetActive(t < 2 ? 'hold' : t < 6.2 ? 'push' : t < 13.4 ? 'hoh' : 'back');
    },
  },
  {
    id: 'turn-signal',
    section: 2,
    title: '방향지시등(깜빡이)',
    body: '핸들 왼쪽 레버를 <b>위로 올리면 오른쪽</b>, <b>아래로 내리면 왼쪽</b> 깜빡이가 켜져요. <b>반만 살짝 밀었다 놓으면 3번 깜빡</b>이고 꺼져 차선 바꿀 때 편하고, 끝까지 내리면 계속 켜졌다가 <b>핸들이 돌아오면 저절로 꺼집니다</b>.',
    facts: [
      { k: '위로', v: '오른쪽' },
      { k: '아래로', v: '왼쪽' },
      { k: '반만 살짝', v: '3번 깜빡' },
    ],
    tip: '방향을 바꾸기 최소 30m 전(고속도로 100m 전)부터 켜서 주변 차에 미리 알려주세요.',
    env: 'park',
    mode: 'interior',
    duration: 16,
    inset: `<h3>왼쪽 레버</h3>
      <div class="row" data-k="up"><span class="key">↑ 끝까지</span><span><b>오른쪽</b> 깜빡이 계속</span></div>
      <div class="row" data-k="half"><span class="key">↕ 반만</span><span>살짝 밀었다 놓으면 <b>3번만</b> 깜빡</span></div>
      <div class="row" data-k="down"><span class="key">↓ 끝까지</span><span><b>왼쪽</b> 깜빡이 계속</span></div>
      <div class="row" data-k="cancel"><span class="key">자동 해제</span><span>회전 후 핸들이 풀리면 꺼짐</span></div>`,
    cam: [S(0, [-0.3, 1.17, -0.6], [0.33, 0.9, -0.47], 46), S(11, [-0.3, 1.17, -0.6], [0.33, 0.9, -0.47], 46), S(12, [-0.42, 1.2, -0.5], [0.4, 0.92, -0.42], 50)],
    enter(ctx) {
      engineRunning(ctx);
      ctx.labels.add('lever', ctx.cockpit.anchors.lStalk, { text: '', dir: 'left', len: 40, visible: false });
      ctx.labels.add('cl', ctx.cockpit.anchors.cluster, { text: '계기판 화살표도 깜빡', kind: 'ok', dir: 'up', len: 46, visible: false });
    },
    update(ctx, t, prev) {
      const c = ctx.cockpit;
      const L = ctx.car.lights;
      c.lStalkV = track(t, [[1.4, 0], [1.8, 1], [5, 1], [5.4, 0], [6.4, 0], [6.65, -0.5], [6.95, 0], [9.6, 0], [10, -1], [14.5, -1], [14.7, 0]]);
      c.steer = track(t, [[11.4, 0], [12.4, -1.6], [13.4, -1.6], [14.6, 0]]);
      L.turnR = t > 1.8 && t < 5.4;
      L.turnL = (t > 6.65 && t < 6.65 + 3 / 1.4 - 0.2) || (t > 10 && t < 14.7);
      setBlink(ctx, prev, t, 1.8);
      setBlink(ctx, prev, t, 6.65);
      setBlink(ctx, prev, t, 10);
      if (crossed(prev, t, 14.7)) ctx.sfx.click();
      const stalk = grab(ctx, 'lStalk', [0.55, -0.15, 0.82], [-0.2, 1, 0], 'pinch', [0, 0, -0.01]);
      const home = (): HandTarget => ({ ...c.wheelGrip(180, ctx.car.root, true), pose: 'grip' });
      ctx.ghost.L = handTimeline(home, stalk, t, 0.3, 1.3, 10.6, 11.3);
      ctx.ghost.R = (): HandTarget => ({ ...c.wheelGrip(0, ctx.car.root, true), pose: 'grip' });
      const phase = t > 14.6 ? 'cancel' : t > 9.9 ? 'down' : t > 6.5 ? 'half' : t > 1.7 && t < 5.5 ? 'up' : null;
      ctx.ui.insetActive(phase);
      const txt: Record<string, string> = { up: '위로 → 오른쪽', half: '반만 → 3번 깜빡', down: '아래로 → 왼쪽', cancel: '핸들 복원 → 자동 꺼짐' };
      ctx.labels.set('lever', { visible: !!phase, text: phase ? txt[phase] : '', kind: phase === 'cancel' ? 'ok' : 'info' });
      ctx.labels.show('cl', (L.turnL || L.turnR) && blinkOn(ctx.time - ctx.car.blinkT0) && t < 11);
    },
  },
  {
    id: 'hazard',
    section: 2,
    title: '비상등(비상 점멸등)',
    body: '가운데의 <b>빨간 삼각형 버튼</b>을 누르면 좌우 깜빡이가 <b>동시에</b> 점멸해요. 고장·사고로 멈췄을 때, 급하게 속도를 줄여 <b>뒤차에 위험을 알릴 때</b> 켜고, 양보받은 뒤 <b>‘감사합니다’</b>의 뜻으로 2~3번 켜기도 합니다.',
    facts: [
      { k: '고장·사고', v: '즉시 켜고 안전한 곳으로' },
      { k: '감사 표시', v: '2~3번 깜빡' },
      { k: '끄기', v: '버튼 한 번 더' },
    ],
    env: 'park',
    mode: 'interior',
    duration: 13,
    cam: [
      S(0, [-0.22, 1.18, -0.16], [0.62, 0.88, 0.0], 46),
      S(3.6, [-0.22, 1.18, -0.16], [0.62, 0.88, 0.0], 46),
      S(5.4, [-1.2, 2.6, 0.0], [-1.6, 0.9, 0], 50),
      S(7.4, [-7.6, 1.6, 0.4], [-1.6, 0.8, 0], 40),
      S(13, [-7.0, 1.9, -2.4], [-1.6, 0.8, 0], 40),
    ],
    enter(ctx) {
      engineRunning(ctx);
      const a = ctx.car.anchors;
      ctx.labels.add('btn', ctx.cockpit.anchors.hazard, { text: '비상등 버튼', kind: 'warn', len: 36, visible: false });
      ctx.labels.add('rl', a.turnRL, { text: '왼쪽', kind: 'amber', dir: 'down', len: 34, visible: false });
      ctx.labels.add('rr', a.turnRR, { text: '오른쪽', kind: 'amber', dir: 'down', len: 34, visible: false });
      ctx.labels.add('both', a.hmsl, { text: '양쪽이 동시에 깜빡', kind: 'amber', len: 40, visible: false });
    },
    update(ctx, t, prev) {
      const c = ctx.cockpit;
      c.hazardBtn = track(t, [[1.6, 0], [1.8, 1], [2.1, 0], [11.6, 0], [11.8, 1], [12.1, 0]]);
      ctx.car.lights.hazard = t > 1.8 && t < 11.8;
      setBlink(ctx, prev, t, 1.8);
      if (crossed(prev, t, 1.8) || crossed(prev, t, 11.8)) ctx.sfx.click();
      ctx.ghost.R = handTimeline(wheelHand(ctx, 'R'), grab(ctx, 'hazard', [1, -0.1, 0.05], [0, 1, 0], 'point'), t, 0.4, 1.6, 2.4, 3.4);
      ctx.ghost.L = wheelHand(ctx, 'L');
      ctx.labels.show('btn', t > 1 && t < 4);
      ctx.labels.show('rl', t > 7.2);
      ctx.labels.show('rr', t > 7.2);
      ctx.labels.show('both', t > 7.6 && t < 11.8);
    },
  },
  {
    id: 'wipers',
    section: 2,
    title: '와이퍼와 워셔액',
    body: '오른쪽 레버를 <b>아래로 한 칸씩</b> 내리면 AUTO(또는 INT 간헐) → 저속 → 고속. <b>위로 살짝</b> 올리면 한 번만 닦고, 레버를 <b>몸 쪽으로 당기면</b> 워셔액이 뿌려지며 닦여요.',
    facts: [
      { k: 'MIST', v: '위로 → 1번' },
      { k: 'AUTO·LO·HI', v: '아래로 한 칸씩' },
      { k: '워셔액', v: '몸 쪽으로 당기기' },
    ],
    tip: '마른 유리에 와이퍼만 켜면 고무와 유리가 상해요. 먼지가 묻어 있으면 워셔액부터 뿌리세요.',
    env: 'park',
    mode: 'interior',
    duration: 16,
    inset: `<h3>오른쪽 레버</h3>
      <div class="row" data-k="mist"><span class="key">↑ MIST</span><span>한 번만 닦기</span></div>
      <div class="row" data-k="off"><span class="key">OFF</span><span>꺼짐</span></div>
      <div class="row" data-k="int"><span class="key">↓ AUTO</span><span>비 오는 양에 맞춰(간헐)</span></div>
      <div class="row" data-k="lo"><span class="key">↓↓ LO</span><span>저속 연속</span></div>
      <div class="row" data-k="hi"><span class="key">↓↓↓ HI</span><span>고속 연속</span></div>
      <div class="row" data-k="wash"><span class="key">당기기</span><span><b>워셔액</b> 분사 + 닦기</span></div>`,
    cam: [S(0, [-0.36, 1.2, -0.38], [1.5, 0.84, -0.12], 58), S(16, [-0.34, 1.21, -0.36], [1.5, 0.86, -0.1], 58)],
    enter(ctx) {
      engineRunning(ctx);
      ctx.labels.add('lever', ctx.cockpit.anchors.rStalk, { text: '', dir: 'right', len: 40, visible: false });
      ctx.labels.add('wiper', ctx.car.anchors.wiper, { text: '', kind: 'info', len: 30, visible: false });
    },
    update(ctx, t, prev) {
      const c = ctx.cockpit;
      c.rStalkV = track(t, [[1.5, 0], [1.7, 1], [2.1, 1], [2.3, 0], [3.5, 0], [3.7, -1], [6.5, -1], [6.7, -2], [9, -2], [9.2, -3], [11.5, -3], [11.8, 0]]);
      c.rStalkPull = track(t, [[12.4, 0], [12.8, 1], [14.8, 1], [15.2, 0]]);
      ctx.car.wiperMode = pick(t, [[0, 'off'], [3.7, 'int'], [6.7, 'lo'], [9.2, 'hi'], [11.8, 'off']] as [number, 'off' | 'int' | 'lo' | 'hi'][]);
      ctx.car.washer = c.rStalkPull > 0.5 ? 1 : 0;
      if (crossed(prev, t, 1.7)) ctx.car.mist();
      for (const at of [1.7, 3.7, 6.7, 9.2, 11.8]) if (crossed(prev, t, at)) ctx.sfx.click();
      ctx.ghost.R = handTimeline(wheelHand(ctx, 'R'), grab(ctx, 'rStalk', [-0.5, -0.15, -0.85], [0.2, 1, 0], 'pinch', [0, 0, 0.01]), t, 0.3, 1.3, 15.2, 16);
      ctx.ghost.L = wheelHand(ctx, 'L');
      const phase = t > 12.6 && t < 15.2 ? 'wash' : t > 11.6 ? 'off' : t > 9.1 ? 'hi' : t > 6.6 ? 'lo' : t > 3.6 ? 'int' : t > 1.6 ? 'mist' : null;
      ctx.ui.insetActive(phase);
      const txt: Record<string, [string, string]> = {
        mist: ['위로 살짝', '한 번만 닦기'], int: ['아래로 1칸', 'AUTO / 간헐'], lo: ['아래로 2칸', '저속'], hi: ['아래로 3칸', '고속'],
        off: ['OFF', '꺼짐'], wash: ['몸 쪽으로 당기기', '워셔액 분사'],
      };
      ctx.labels.set('lever', { visible: !!phase, text: phase ? txt[phase][0] : '' });
      ctx.labels.set('wiper', { visible: !!phase && phase !== 'off', text: phase ? txt[phase][1] : '' });
    },
  },
  {
    id: 'headlights',
    section: 2,
    title: '전조등 켜기',
    body: '왼쪽 레버 끝의 다이얼을 돌려요: <b>OFF → 미등 → 전조등 → AUTO</b>. 평소엔 <b>AUTO</b>에 두면 어두워질 때 저절로 켜집니다. 레버를 <b>앞으로 밀면 상향등</b>(멀리 비춤), <b>몸 쪽으로 당기면</b> 잠깐 번쩍(패싱)해요.',
    facts: [
      { k: '추천', v: 'AUTO' },
      { k: '상향등', v: '앞에 차가 없을 때만' },
      { k: '터널·비·안개', v: '낮에도 켜기' },
    ],
    tip: '상향등은 마주 오는 차나 앞차 운전자의 눈을 부시게 해요. 차가 보이면 바로 내려 주세요.',
    env: 'park',
    mode: 'interior',
    duration: 17,
    dusk: 0.92,
    inset: `<h3>왼쪽 레버 끝 다이얼</h3>
      <div class="row" data-k="off"><span class="key">OFF</span><span>꺼짐</span></div>
      <div class="row" data-k="tail"><span class="key">미등</span><span>차폭등·번호판등 (주차·대기)</span></div>
      <div class="row" data-k="low"><span class="key">전조등</span><span>일반 야간 주행 (하향등)</span></div>
      <div class="row" data-k="auto"><span class="key">AUTO</span><span>밝기에 따라 자동</span></div>
      <div class="row" data-k="high"><span class="key">앞으로 밀기</span><span><b>상향등</b> 켜짐 (파란 표시)</span></div>
      <div class="row" data-k="flash"><span class="key">당기기</span><span>잠깐 번쩍 <b>패싱</b></span></div>`,
    cam: [
      S(0, [-0.16, 1.09, -0.72], [0.34, 0.88, -0.56], 44),
      S(5.2, [-0.16, 1.09, -0.72], [0.34, 0.88, -0.56], 44),
      S(7.4, [9.6, 1.7, 3.2], [2.2, 0.5, 0], 42),
      S(17, [10.4, 2.3, -3.0], [2.2, 0.5, 0], 42),
    ],
    enter(ctx) {
      engineRunning(ctx);
      ctx.labels.add('dial', ctx.cockpit.anchors.lStalk, { text: '', dir: 'left', len: 40, visible: false });
      ctx.labels.add('beam', () => world(ctx, [6, 0.1, 0]), { text: '', kind: 'info', len: 36, visible: false });
    },
    update(ctx, t, prev) {
      const c = ctx.cockpit;
      const L = ctx.car.lights;
      c.lightDial = track(t, [[1.2, 0], [1.6, 1], [3.4, 1], [3.8, 2], [14.2, 2], [14.6, 3]]);
      c.lStalkPush = track(t, [[8.2, 0], [8.6, 1], [11, 1], [11.3, 0], [12.4, 0], [12.6, -1], [12.9, 0], [13.1, 0], [13.3, -1], [13.6, 0]]);
      L.tail = c.lightDial > 0.5;
      L.low = c.lightDial > 1.5;
      L.high = t > 8.6 && t < 11.1;
      L.flash = (t > 12.6 && t < 12.9) || (t > 13.3 && t < 13.6);
      for (const at of [1.6, 3.8, 8.6, 11.1, 14.6]) if (crossed(prev, t, at)) ctx.sfx.click();
      ctx.ghost.L = handTimeline(wheelHand(ctx, 'L'), grab(ctx, 'lStalk', [0.55, -0.1, 0.83], [-0.25, 1, 0], 'pinch', [0, 0, -0.01]), t, 0.2, 1.1, 15.4, 16.4);
      ctx.ghost.R = wheelHand(ctx, 'R');
      const phase = t > 14.5 ? 'auto' : t > 12.5 ? 'flash' : t > 8.5 && t < 11.2 ? 'high' : t > 3.7 ? 'low' : t > 1.5 ? 'tail' : 'off';
      ctx.ui.insetActive(phase);
      const txt: Record<string, string> = { off: 'OFF', tail: '한 칸 → 미등', low: '두 칸 → 전조등', high: '앞으로 밀기 → 상향등', flash: '당기기 → 패싱', auto: 'AUTO' };
      ctx.labels.set('dial', { visible: t > 1 && t < 6.4, text: txt[phase] });
      const beam: Record<string, string> = { low: '전조등(하향): 가까운 도로를 비춤', high: '상향등: 멀리까지 비춤', flash: '패싱: 번쩍!', auto: 'AUTO: 어두우면 자동으로 켜짐', tail: '', off: '' };
      ctx.labels.set('beam', { visible: t > 7.2 && !!beam[phase], text: beam[phase], kind: phase === 'high' ? 'info' : '' });
    },
  },
];

