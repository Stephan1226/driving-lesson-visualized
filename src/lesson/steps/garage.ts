import * as THREE from 'three';
import type { Ctx } from '../context';
import type { Step } from '../types';
import { S, V, rows, drive } from '../helpers';
import { DrivePath, firstHitParts, spiralAngle, BODY_PART, type Box2, type Seg, type Part } from '../../core/path';
import { PILLAR } from '../../world/env/Environment';
import { MIRROR_BOX } from '../../world/car/Car';
import { crossed, ease, seg, sseg, track } from '../../core/util';

/** 우리 차가 주차된 자리: 기둥(+Z) 쪽으로 약 15cm까지 붙임 */
const PARKED = { x: 0, z: 0.27, h: 0 };
const PILLAR_BOX: Box2 = {
  cx: (PILLAR.x0 + PILLAR.x1) / 2,
  cz: (PILLAR.z0 + PILLAR.z1) / 2,
  hx: (PILLAR.x1 - PILLAR.x0) / 2,
  hz: (PILLAR.z1 - PILLAR.z0) / 2,
  h: 0,
};
const R = 4.3;
/** 사이드미러를 편 상태의 충돌 부위 */
const PARTS: Part[] = [
  BODY_PART,
  { name: 'mirrorL', x: MIRROR_BOX.x, z: -MIRROR_BOX.z, hx: MIRROR_BOX.hx, hz: MIRROR_BOX.hz },
  { name: 'mirrorR', x: MIRROR_BOX.x, z: MIRROR_BOX.z, hx: MIRROR_BOX.hx, hz: MIRROR_BOX.hz },
];

/** 핸들을 서서히 감아(완화 곡선) 90° 도는 구간 */
export const quarterTurn = (dir: 1 | -1, r = R, easeLen = 1.2): Seg[] => [
  { type: 'spiral', len: easeLen, r, dir },
  { type: 'arc', r, dir, a: Math.PI / 2 - spiralAngle(easeLen, r) },
];

/**
 * 올바른 출차 경로 (수치 검증: 미러·차체와 기둥·옆 차 사이 최소 6cm)
 *  ① 핸들을 미리 기둥 반대쪽(왼쪽)으로 → 0.4m 전진 → 핸들 풀기
 *  ② 반대로 살짝 감았다 풀어 차를 바르게
 *  ③ 뒷바퀴가 기둥 끝을 지날 때까지 직진 → ④ 오른쪽으로 돌아 나가기
 */
const AVOID = { r: 8, arc: 0.4, unwind: 0.8, r2: 8, straight: 0.8 };
const avoidHead = AVOID.arc / AVOID.r + AVOID.unwind / (2 * AVOID.r);
const realign = avoidHead * AVOID.r2;
export const EXIT_PHASE = {
  avoid: AVOID.arc + AVOID.unwind, // 미러가 기둥을 비켜 나가는 구간 끝
  realign: AVOID.arc + AVOID.unwind + 2 * realign, // 차를 바르게 세운 지점
  turn: AVOID.arc + AVOID.unwind + 2 * realign + AVOID.straight, // 회전 시작
};
export const PRE_STEER = Math.atan(2.75 / AVOID.r);
const exitPath = () =>
  new DrivePath(PARKED, [
    { type: 'arc', r: AVOID.r, dir: 1, a: AVOID.arc / AVOID.r },
    { type: 'spiral', len: AVOID.unwind, r: AVOID.r, dir: 1, out: true },
    { type: 'spiral', len: realign, r: AVOID.r2, dir: -1 },
    { type: 'spiral', len: realign, r: AVOID.r2, dir: -1, out: true },
    { type: 'line', d: AVOID.straight },
    ...quarterTurn(-1),
  ]);

function pushTrails(ctx: Ctx) {
  ctx.fx.trails[0].push(ctx.car.wheelContact(1));
  ctx.fx.trails[1].push(ctx.car.wheelContact(3));
}

const trailLegend = (ctx: Ctx) => {
  ctx.labels.add('trailF', () => ctx.car.wheelContact(1), { text: '앞바퀴', kind: 'info', dir: 'right', len: 30, visible: false });
  ctx.labels.add('trailR', () => ctx.car.wheelContact(3), { text: '뒷바퀴', kind: 'warn', dir: 'right', len: 30, visible: false });
};

/** 미러 펴기/접기 애니메이션 (모터 소리 포함) */
function mirrorMotion(ctx: Ctx, t: number, prev: number, t0: number, t1: number, from: number, to: number) {
  ctx.car.setMirrorFold(track(t, [[t0, from], [t1, to]]));
  if (crossed(prev, t, t0)) ctx.sfx.motor();
}

/** 미러 위치 표시 (월드) */
const mirrorPoint = (ctx: Ctx, side: 1 | -1) => () => ctx.car.mirrors[side < 0 ? 0 : 1].pivot.getWorldPosition(new THREE.Vector3()).add(V(0, 0.07, 0));

export const garageSteps: Step[] = [
  {
    id: 'garage-park',
    section: 1,
    title: '기둥 옆 칸은 기둥 쪽으로 붙여서',
    body: '지하 주차장 기둥 옆 칸에 세울 땐 <b>기둥 쪽으로 바짝 붙여</b> 주차하는 게 매너예요. 그만큼 <b>옆 차가 문을 열고 타고 내릴 공간</b>이 넉넉해집니다.',
    facts: [
      { k: '기둥 쪽', v: '약 15cm' },
      { k: '옆 차 쪽', v: '약 80cm' },
    ],
    tip: '기둥이 조수석 쪽이라면 동승자는 주차하기 전에 미리 내리게 하세요.',
    env: 'garage',
    mode: 'exterior',
    duration: 16,
    cam: [
      S(0, [11.5, 2.3, 11.5], [6.5, 0.6, 5.5], 48),
      S(3.5, [10.5, 7.6, 7.0], [4.0, 0, 2.6], 46),
      S(10, [5.6, 6.6, -4.4], [0.7, 0, -0.5], 44),
      S(16, [4.4, 5.2, -3.8], [0.5, 0, -0.7], 42),
    ],
    enter(ctx) {
      // 출차 경로를 거꾸로 따라 후진 주차 (미러는 편 상태)
      ctx.car.root.userData = { path: exitPath(), steer: { v: 0 } };
      ctx.labels.add('gapP', V(1.75, 0.1, 1.27), { text: '기둥 쪽 약 15cm', kind: 'amber', dir: 'up', len: 44, visible: false });
      ctx.labels.add('gapN', V(0.3, 0.1, -1.04), { text: '옆 차 쪽 약 80cm', kind: 'ok', dir: 'left', len: 60, visible: false });
      ctx.labels.add('door', ctx.garage.neighbor.anchors.doorEdge, { text: '문 열 공간 넉넉', sub: '문콕 걱정 없음', kind: 'ok', len: 34, visible: false });
    },
    update(ctx, t, prev, dt) {
      const d = ctx.car.root.userData as { path: DrivePath; steer: { v: number } };
      const s = d.path.length * (1 - ease(seg(t, 0.6, 10)));
      drive(ctx, d.path, s, d.steer, dt);
      const moving = t > 0.6 && t < 10;
      ctx.car.lights.reverse = moving;
      ctx.car.lights.brake = t > 9.4 && t < 10.8;
      ctx.car.lights.tail = true;
      if (crossed(prev, t, 10.4)) {
        ctx.fx.dim('pillar', V(1.75, 0.06, 1.19), V(1.75, 0.06, 1.35), 0xffb020);
        ctx.fx.dim('neighbor', V(0.3, 0.06, -0.65), V(0.3, 0.06, -1.43), 0x35d07a);
      }
      ctx.labels.show('gapP', t > 10.4);
      ctx.labels.show('gapN', t > 10.6);
      ctx.garage.neighbor.setDoor(track(t, [[11.4, 0], [13.2, 0.52]]));
      ctx.labels.show('door', t > 13);
    },
  },
  {
    id: 'mirror-fold',
    section: 1,
    title: '주차를 마치면 사이드미러 접기',
    body: '주차가 끝나면 <b>사이드미러를 접어</b> 두세요. 미러는 차체보다 양쪽으로 <b>15~20cm씩 튀어나와</b> 있어서, 좁은 주차장에선 지나가는 사람이나 옆 차·기둥과 부딪히기 쉬워요. 요즘 차는 <b>문을 잠그면 자동으로 접히고</b>(오토 폴딩), 직접 접을 땐 운전석 문의 <b>미러 접기 버튼</b>을 누릅니다.',
    facts: [
      { k: '접을 때', v: '주차 후 시동 끄고 문 잠글 때' },
      { k: '펼 때', v: '출발 전 반드시' },
      { k: '버튼', v: '운전석 문 미러 스위치 옆' },
    ],
    tip: '접힌 채로 출발하면 옆·뒤가 안 보여 위험해요. 출발 전에 미러가 펴졌는지 꼭 확인하세요.',
    env: 'garage',
    mode: 'exterior',
    duration: 12,
    inset: `<h3>미러 접기·펴기</h3>
      <div class="row" data-k="btn"><span class="key">접기 버튼</span><span>운전석 문 손잡이 근처 — 누르면 접히고, 다시 누르면 펴져요</span></div>
      <div class="row" data-k="auto"><span class="key">오토 폴딩</span><span>문을 잠그면 접히고, 잠금을 풀면 펴져요 (차량 설정)</span></div>`,
    cam: [
      S(0, [3.0, 1.85, -0.3], [0.95, 0.95, 1.15], 42),
      S(5.6, [2.9, 1.8, -0.2], [0.95, 0.95, 1.15], 42),
      S(8, [3.6, 6.2, -1.8], [0.4, 0, -0.9], 44),
      S(12, [3.4, 6.0, -1.6], [0.4, 0, -0.9], 44),
    ],
    enter(ctx) {
      ctx.car.setPose(PARKED.x, PARKED.z, PARKED.h);
      ctx.labels.add('mirror', mirrorPoint(ctx, 1), { text: '미러가 차체 밖으로 약 18cm', kind: 'amber', dir: 'up', len: 50, visible: false });
      ctx.labels.add('folded', mirrorPoint(ctx, 1), { text: '접으면 기둥과도 여유', kind: 'ok', dir: 'up', len: 50, visible: false });
      ctx.labels.add('nb', () => ctx.garage.neighbor.mirrors[1].pivot.getWorldPosition(new THREE.Vector3()).add(V(0, 0.08, 0)), {
        text: '옆 차도 접혀 있어요', kind: 'info', dir: 'up', len: 40, visible: false,
      });
    },
    update(ctx, t, prev) {
      mirrorMotion(ctx, t, prev, 2.6, 3.8, 0, 1);
      ctx.labels.show('mirror', t > 0.5 && t < 2.6);
      ctx.labels.show('folded', t > 4 && t < 7.4);
      ctx.labels.show('nb', t > 8.4);
      ctx.ui.insetActive(t < 2.4 ? null : t < 7 ? 'btn' : 'auto');
      if (crossed(prev, t, 3.8)) ctx.ui.toast('접힘', 'ok');
    },
  },
  {
    id: 'garage-exit-wrong',
    section: 1,
    title: '미러를 펴고 그냥 나가면 ‘탁’',
    body: '출발 전에 미러를 펴면 기둥 쪽 미러가 기둥보다 바깥으로 튀어나와요. 이대로 <b>그냥 직진</b>하면 미러가 기둥에 걸리고, <b>바로 핸들을 꺾어도</b> 미러와 안쪽으로 파고드는 차 옆면(내륜차)이 기둥에 긁힙니다.',
    facts: [
      { k: '미러', v: '차체 밖으로 약 18cm' },
      { k: '내륜차', v: '회전할 때 뒷바퀴가 앞바퀴보다 안쪽으로 지나가는 차이' },
    ],
    env: 'garage',
    mode: 'exterior',
    duration: 13,
    cam: [
      S(0, [0.9, 6.4, -2.4], [1.3, 0, 1.0], 40),
      S(3.6, [0.9, 6.4, -2.4], [1.3, 0, 1.0], 40),
      S(5, [3.1, 1.7, -0.4], [1.25, 0.9, 1.25], 42),
      S(6.4, [0.9, 6.4, -2.4], [1.3, 0, 1.0], 40),
      S(9.6, [0.9, 6.4, -2.4], [1.3, 0, 1.0], 40),
      S(11, [3.3, 1.75, -0.6], [1.25, 0.8, 1.25], 42),
    ],
    enter(ctx) {
      const straight = new DrivePath(PARKED, [{ type: 'line', d: 2 }]);
      const turnNow = new DrivePath(PARKED, [{ type: 'line', d: 0.15 }, ...quarterTurn(-1, R, 0.6)]);
      const hitA = firstHitParts(straight, [PILLAR_BOX], PARTS);
      const hitB = firstHitParts(turnNow, [PILLAR_BOX], PARTS);
      ctx.car.root.userData = { straight, turnNow, hitA: hitA?.s ?? 1, hitB: hitB?.s ?? 1, steer: { v: 0 } };
      ctx.car.setMirrorFold(1);
      trailLegend(ctx);
      ctx.labels.add('unfold', mirrorPoint(ctx, 1), { text: '출발 전 미러 펴기', kind: 'info', dir: 'up', len: 40, visible: false });
      ctx.labels.add('hitA', V(PILLAR.x0, 1.05, PILLAR.z0), { text: '미러가 기둥에 걸림!', kind: 'warn', big: true, len: 50, visible: false });
      ctx.labels.add('hitB', V(PILLAR.x0, 0.75, PILLAR.z0), { text: '미러·옆면이 기둥에 긁힘!', kind: 'warn', big: true, len: 50, visible: false });
    },
    update(ctx, t, prev, dt) {
      const d = ctx.car.root.userData as { straight: DrivePath; turnNow: DrivePath; hitA: number; hitB: number; steer: { v: number } };
      const speed = 0.25;
      const tHitA = 1.8 + d.hitA / speed;
      const tHitB = 7.4 + d.hitB / speed;
      if (t < 6.2) {
        mirrorMotion(ctx, t, prev, 0.3, 1.4, 1, 0);
        const s = Math.min(Math.max(0, (t - 1.8) * speed), d.hitA);
        drive(ctx, d.straight, s, d.steer, dt);
      } else {
        if (crossed(prev, t, 6.2)) {
          ctx.fx.reset();
          ctx.ui.toast('이번엔 바로 꺾으면?', '');
        }
        ctx.car.setMirrorFold(0);
        const s = Math.min(Math.max(0, (t - 7.4) * speed), d.hitB);
        drive(ctx, d.turnNow, s, d.steer, dt, t < 7.4 ? -Math.atan(2.75 / R) * sseg(t, 6.6, 7.3) : undefined);
        if (t > 7.4 && s < d.hitB) pushTrails(ctx);
      }
      for (const th of [tHitA, tHitB]) {
        if (crossed(prev, t, th)) {
          ctx.sfx.thud();
          ctx.ui.flash();
          ctx.ui.toast(th === tHitA ? '탁!' : '쿵!', 'warn');
        }
      }
      const since = t < 6.2 ? t - tHitA : t - tHitB;
      ctx.car.setPitch(since > 0 && since < 0.6 ? Math.sin(since * 30) * 0.01 * (1 - since / 0.6) : 0);
      ctx.car.lights.brake = (t > tHitA && t < 6.2) || t > tHitB;
      ctx.labels.show('unfold', t > 0.2 && t < 1.7);
      ctx.labels.show('hitA', t > tHitA + 0.1 && t < 6.2);
      ctx.labels.show('hitB', t > tHitB + 0.1);
      ctx.labels.show('trailF', t > tHitB + 0.8);
      ctx.labels.show('trailR', t > tHitB + 0.8);
    },
  },
  {
    id: 'garage-exit-right',
    section: 1,
    title: '미러 펴고 → 살짝 비켜서 → 충분히 나가서 회전',
    body: '① 미러를 편 뒤 ② 출발 전에 <b>핸들을 기둥 반대쪽으로 살짝</b> 돌려 두고 천천히 나가 미러가 기둥을 비켜 가게 합니다. ③ 미러가 기둥을 지나면 핸들을 풀어 차를 바로 세우고, ④ <b>뒷바퀴가 기둥 끝을 지날 때까지</b> 직진한 다음 ⑤ 돌아 나갑니다. 내내 <b>사이드미러로 기둥 간격</b>을 확인하세요.',
    facts: [
      { k: '핸들', v: '기둥 반대쪽으로 약 2/3바퀴' },
      { k: '회전 시점', v: '뒷바퀴가 기둥 끝을 지난 뒤' },
      { k: '속도', v: '사람 걷는 속도 이하' },
    ],
    tip: '반대 방향(옆 차 쪽)으로 비킬 공간도 확인하세요. 옆 차와의 간격이 좁으면 몇 번 나눠서 조금씩 빠져나와도 괜찮아요.',
    env: 'garage',
    mode: 'exterior',
    duration: 20,
    inset: `<h3>기둥 옆 출차 순서</h3>${rows([
      ['1', '1', '<b>사이드미러 펴기</b>'],
      ['2', '2', '핸들을 <b>기둥 반대쪽</b>으로 살짝, 천천히 출발'],
      ['3', '3', '미러가 기둥을 지나면 <b>핸들 풀어</b> 바르게'],
      ['4', '4', '<b>뒷바퀴가 기둥 끝</b>을 지날 때까지 직진'],
      ['5', '5', '그다음 <b>핸들 돌려</b> 빠져나가기'],
    ])}`,
    cam: [
      S(0, [0.6, 6.4, -2.8], [1.3, 0, 0.9], 40),
      S(9, [1.6, 7.2, -2.8], [2.2, 0, 1.1], 42),
      S(17.5, [3.8, 8.6, -2.2], [4.0, 0, 2.6], 46),
    ],
    enter(ctx) {
      ctx.car.root.userData = { path: exitPath(), steer: { v: 0 } };
      ctx.car.setMirrorFold(1);
      const line = ctx.fx.line;
      line.visible = true;
      line.position.set(PILLAR.x1, 0, PARKED.z);
      line.rotation.set(0, 0, 0);
      ctx.labels.add('mirror', mirrorPoint(ctx, 1), { text: '', kind: 'info', dir: 'up', len: 46, visible: false });
      ctx.labels.add('line', V(PILLAR.x1, 0.05, -1.35), { text: '뒷바퀴가 이 선을 지나면 회전', kind: 'amber', dir: 'left', len: 36, visible: false });
      ctx.labels.add('wheel', () => ctx.car.wheelContact(0).add(V(0, 0.4, 0)), { text: '핸들을 왼쪽으로 살짝', kind: 'info', dir: 'left', len: 40, visible: false });
      trailLegend(ctx);
      ctx.labels.add('clear', V(PILLAR.x1 + 0.2, 0.6, PILLAR.z0 + 0.2), { text: '미러도 뒷바퀴도 기둥을 비켜감', kind: 'ok', big: true, len: 50, visible: false });
    },
    update(ctx, t, prev, dt) {
      const d = ctx.car.root.userData as { path: DrivePath; steer: { v: number } };
      mirrorMotion(ctx, t, prev, 0.3, 1.5, 1, 0);
      const sPrev = d.path.length * ease(seg(prev, 3, 17.5));
      const s = d.path.length * ease(seg(t, 3, 17.5));
      // 출발 전 제자리에서 핸들을 미리 돌려 둔다
      const pre = t < 3 ? PRE_STEER * sseg(t, 1.8, 2.8) : undefined;
      drive(ctx, d.path, s, d.steer, dt, pre);
      if (t > 3) pushTrails(ctx);
      const P = EXIT_PHASE;
      const phase = t < 1.6 ? '1' : s < P.avoid ? '2' : s < P.realign ? '3' : s < P.turn ? '4' : '5';
      ctx.ui.insetActive(phase);
      ctx.ui.insetActive(['1', '2', '3', '4', '5'].filter((k) => k < phase), 'done');
      if (sPrev < P.turn && s >= P.turn && t > 0) {
        ctx.ui.toast('이제 핸들 ↻', 'ok');
        ctx.sfx.chime();
      }
      ctx.labels.show('wheel', t > 1.8 && s < 0.6);
      ctx.labels.set('mirror', {
        visible: (t > 0.3 && t < 1.6) || (s > 0.15 && s < P.avoid),
        text: t < 1.6 ? '① 미러 펴기' : '미러가 기둥을 비켜 지나가요',
        kind: t < 1.6 ? 'info' : 'ok',
      });
      ctx.labels.show('line', s > P.avoid && s < P.turn + 0.4);
      ctx.labels.show('trailF', t > 15);
      ctx.labels.show('trailR', t > 15);
      ctx.labels.show('clear', t > 15.6);
      ctx.car.lights.tail = true;
      ctx.car.lights.turnR = s > P.realign && s < d.path.length - 0.5;
      if (crossed(sPrev, s, P.realign)) ctx.car.blinkT0 = ctx.time;
      ctx.fx.line.children.forEach((c) => (((c as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 1 - sseg(s, P.turn, P.turn + 1.5)));
    },
  },
];
