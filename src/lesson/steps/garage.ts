import * as THREE from 'three';
import type { Ctx } from '../context';
import type { Step } from '../types';
import { S, V } from '../helpers';
import { DrivePath, firstHit, spiralAngle, type Box2, type Seg } from '../../core/path';
import { PILLAR } from '../../world/env/Environment';
import { crossed, ease, lerp, seg, sseg, track } from '../../core/util';

/** 우리 차가 주차된 자리: 기둥(+Z) 쪽으로 붙임 */
const PARKED = { x: 0, z: 0.25, h: 0 };
const PILLAR_BOX: Box2 = {
  cx: (PILLAR.x0 + PILLAR.x1) / 2,
  cz: (PILLAR.z0 + PILLAR.z1) / 2,
  hx: (PILLAR.x1 - PILLAR.x0) / 2,
  hz: (PILLAR.z1 - PILLAR.z0) / 2,
  h: 0,
};
const R = 4.3;

/** 핸들을 서서히 감아(완화 곡선) 90° 도는 구간 */
export const quarterTurn = (dir: 1 | -1, r = R, ease = 1.2): Seg[] => [
  { type: 'spiral', len: ease, r, dir },
  { type: 'arc', r, dir, a: Math.PI / 2 - spiralAngle(ease, r) },
];

/** 경로 위 s 지점으로 차를 옮기고 바퀴 조향·회전을 맞춘다 */
function drive(ctx: Ctx, path: DrivePath, s: number, steerState: { v: number }, dt: number) {
  const p = path.sample(s);
  ctx.car.setPose(p.x, p.z, p.h);
  steerState.v = dt > 0 ? lerp(steerState.v, p.steer, 1 - Math.exp(-dt * 6)) : p.steer;
  ctx.car.setSteer(steerState.v);
  ctx.car.setRoll(s);
  ctx.car.root.updateMatrixWorld(true);
}

function pushTrails(ctx: Ctx) {
  ctx.fx.trails[0].push(ctx.car.wheelContact(1));
  ctx.fx.trails[1].push(ctx.car.wheelContact(3));
}

const trailLegend = (ctx: Ctx) => {
  ctx.labels.add('trailF', () => ctx.car.wheelContact(1), { text: '앞바퀴', kind: 'info', dir: 'right', len: 30, visible: false });
  ctx.labels.add('trailR', () => ctx.car.wheelContact(3), { text: '뒷바퀴', kind: 'warn', dir: 'right', len: 30, visible: false });
};

export const garageSteps: Step[] = [
  {
    id: 'garage-park',
    section: 1,
    title: '기둥 옆 칸은 기둥 쪽으로 붙여서',
    body: '지하 주차장 기둥 옆 칸에 세울 땐 <b>기둥 쪽으로 바짝 붙여</b> 주차하는 게 매너예요. 그만큼 <b>옆 차가 문을 열고 타고 내릴 공간</b>이 넉넉해집니다.',
    facts: [
      { k: '기둥 쪽', v: '약 20cm' },
      { k: '옆 차 쪽', v: '약 75cm' },
    ],
    tip: '기둥이 조수석 쪽이라면 동승자는 주차하기 전에 미리 내리게 하세요.',
    env: 'garage',
    mode: 'exterior',
    duration: 16,
    cam: [
      S(0, [10.5, 2.2, -9.5], [5.5, 0.6, -4.5], 48),
      S(3.5, [9.5, 7.8, -6.5], [3.0, 0, -1.8], 46),
      S(9.5, [5.6, 6.6, -4.4], [0.7, 0, -0.5], 44),
      S(16, [4.4, 5.2, -3.8], [0.5, 0, -0.7], 42),
    ],
    enter(ctx) {
      const st = { v: 0 };
      const path = new DrivePath(PARKED, [
        { type: 'line', d: 4.0 },
        ...quarterTurn(1),
      ]);
      ctx.car.root.userData.path = path;
      ctx.car.root.userData.steer = st;
      ctx.labels.add('gapP', V(1.75, 0.1, 1.27), { text: '기둥 쪽 약 20cm', kind: 'amber', dir: 'up', len: 44, visible: false });
      ctx.labels.add('gapN', V(0.3, 0.1, -1.05), { text: '옆 차 쪽 약 75cm', kind: 'ok', dir: 'left', len: 60, visible: false });
      ctx.labels.add('door', ctx.garage.neighbor.anchors.doorEdge, { text: '문 열 공간 넉넉', sub: '문콕 걱정 없음', kind: 'ok', len: 34, visible: false });
    },
    update(ctx, t, prev, dt) {
      const path = ctx.car.root.userData.path as DrivePath;
      const s = path.length * (1 - ease(seg(t, 0.6, 9.2)));
      drive(ctx, path, s, ctx.car.root.userData.steer, dt);
      const moving = t > 0.6 && t < 9.2;
      ctx.car.lights.reverse = moving;
      ctx.car.lights.brake = t > 8.6 && t < 10;
      ctx.car.lights.tail = true;
      if (crossed(prev, t, 9.6)) {
        ctx.fx.dim('pillar', V(1.75, 0.06, 1.18), V(1.75, 0.06, 1.35), 0xffb020);
        ctx.fx.dim('neighbor', V(0.3, 0.06, -0.68), V(0.3, 0.06, -1.42), 0x35d07a);
      }
      ctx.labels.show('gapP', t > 9.6);
      ctx.labels.show('gapN', t > 9.8);
      ctx.garage.neighbor.setDoor(track(t, [[10.6, 0], [12.4, 0.52]]));
      ctx.labels.show('door', t > 12.2);
    },
  },
  {
    id: 'garage-exit-wrong',
    section: 1,
    title: '나올 때 바로 꺾으면 ‘쿵’',
    body: '기둥에 붙여 댔다면 <b>나올 때가 진짜 주의 구간</b>이에요. 앞바퀴만 생각하고 바로 핸들을 꺾으면, 차의 옆면과 뒷바퀴는 앞바퀴보다 <b>안쪽으로 파고들며</b> 돌기 때문에(내륜차) 기둥에 긁힙니다.',
    facts: [
      { k: '내륜차', v: '회전할 때 뒷바퀴가 앞바퀴보다 안쪽으로 지나가는 차이' },
    ],
    env: 'garage',
    mode: 'exterior',
    duration: 12,
    cam: [
      S(0, [0.6, 7.2, -3.4], [1.3, 0, 1.0], 42),
      S(5.2, [0.8, 7.0, -3.0], [1.5, 0, 1.4], 40),
      S(7.6, [4.2, 1.7, 3.6], [1.4, 0.55, 1.25], 44),
      S(12, [4.4, 1.8, 3.9], [1.4, 0.55, 1.2], 44),
    ],
    enter(ctx) {
      const path = new DrivePath(PARKED, [
        { type: 'line', d: 0.3 },
        ...quarterTurn(-1, R, 0.7),
      ]);
      const hit = firstHit(path, PILLAR_BOX) ?? path.length;
      ctx.car.root.userData = { path, hit, steer: { v: 0 }, hitAt: -1 };
      trailLegend(ctx);
      ctx.labels.add('start', ctx.car.anchors.mirrorR, { text: '바로 핸들을 오른쪽으로…', kind: 'amber', len: 40, visible: false });
      ctx.labels.add('hit', V(PILLAR.x0, 0.7, PILLAR.z0), { text: '옆면이 기둥에 긁힘!', kind: 'warn', big: true, len: 50, visible: false });
    },
    update(ctx, t, prev, dt) {
      const d = ctx.car.root.userData as { path: DrivePath; hit: number; steer: { v: number }; hitAt: number };
      const raw = Math.max(0, (t - 1) * 0.3);
      const s = Math.min(raw, d.hit);
      drive(ctx, d.path, s, d.steer, dt);
      if (t > 1 && raw <= d.hit) pushTrails(ctx);
      const hitT = 1 + d.hit / 0.3;
      if (crossed(prev, t, hitT)) {
        ctx.sfx.thud();
        ctx.ui.flash();
        ctx.ui.toast('쿵!', 'warn');
      }
      const since = t - hitT;
      ctx.car.setPitch(since > 0 && since < 0.6 ? Math.sin(since * 30) * 0.012 * (1 - since / 0.6) : 0);
      ctx.car.lights.brake = t > hitT;
      ctx.labels.show('start', t > 0.8 && t < hitT);
      ctx.labels.show('hit', t > hitT + 0.1);
      ctx.labels.show('trailF', t > hitT + 1.2);
      ctx.labels.show('trailR', t > hitT + 1.2);
    },
  },
  {
    id: 'garage-exit-right',
    section: 1,
    title: '기둥을 지날 때까지 직진, 그다음 핸들',
    body: '<b>뒷바퀴가 기둥을 완전히 지날 때까지</b> 똑바로 빠져나온 뒤에 핸들을 돌리세요. 나오는 동안 <b>사이드미러로 기둥과의 간격</b>을 계속 확인하며 천천히 움직입니다.',
    facts: [
      { k: '핸들 시점', v: '뒷바퀴가 기둥 끝을 지난 뒤' },
      { k: '속도', v: '사람 걷는 속도 이하' },
    ],
    tip: '반대로 기둥 옆 칸에 후진으로 들어갈 때도 같은 원리예요. 차 뒷부분이 기둥을 지난 뒤에 핸들을 감아야 해요.',
    env: 'garage',
    mode: 'exterior',
    duration: 16,
    cam: [
      S(0, [0.8, 7.4, -3.2], [1.6, 0, 1.2], 42),
      S(7, [2.0, 8.0, -3.0], [2.6, 0, 1.6], 44),
      S(13.5, [3.8, 8.6, -2.2], [4.0, 0, 2.6], 46),
      S(16, [3.8, 8.6, -2.2], [4.0, 0, 2.6], 46),
    ],
    enter(ctx) {
      const straight = 3.6;
      const path = new DrivePath(PARKED, [
        { type: 'line', d: straight },
        ...quarterTurn(-1),
      ]);
      ctx.car.root.userData = { path, straight, steer: { v: 0 } };
      const line = ctx.fx.line;
      line.visible = true;
      line.position.set(PILLAR.x1, 0, PARKED.z);
      line.rotation.set(0, 0, 0);
      ctx.labels.add('line', V(PILLAR.x1, 0.05, -1.35), { text: '뒷바퀴가 이 선을 지나면 핸들', kind: 'amber', dir: 'left', len: 36 });
      ctx.labels.add('mirror', ctx.car.anchors.mirrorR, { text: '사이드미러로 기둥 간격 확인', kind: 'info', len: 36, visible: false });
      trailLegend(ctx);
      ctx.labels.add('clear', V(PILLAR.x1 + 0.2, 0.6, PILLAR.z0 + 0.2), { text: '뒷바퀴도 기둥을 비켜감', kind: 'ok', big: true, len: 50, visible: false });
    },
    update(ctx, t, prev, dt) {
      const d = ctx.car.root.userData as { path: DrivePath; straight: number; steer: { v: number } };
      const sPrev = d.path.length * ease(seg(prev, 1, 13.5));
      const s = d.path.length * ease(seg(t, 1, 13.5));
      drive(ctx, d.path, s, d.steer, dt);
      if (t > 1) pushTrails(ctx);
      if (sPrev < d.straight && s >= d.straight && t > 0) {
        ctx.ui.toast('이제 핸들 ↻', 'ok');
        ctx.sfx.chime();
      }
      ctx.labels.show('mirror', t > 1.2 && s < d.straight);
      ctx.labels.show('line', s < d.straight + 0.5);
      ctx.labels.show('trailF', t > 11);
      ctx.labels.show('trailR', t > 11);
      ctx.labels.show('clear', t > 12);
      ctx.car.lights.tail = true;
      ctx.car.lights.turnR = s > d.straight - 1.2 && s < d.path.length - 0.5;
      if (crossed(sPrev, s, d.straight - 1.2)) ctx.car.blinkT0 = ctx.time;
      ctx.fx.line.children.forEach((c) => (((c as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 1 - sseg(s, d.straight, d.straight + 1.5)));
    },
  },
];
