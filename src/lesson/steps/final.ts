import type { Ctx } from '../context';
import { grab, local, world } from '../context';
import type { Step } from '../types';
import { S, V, wheelHand, reach, engineRunning, rows, orbit, calibrateSide, calibrateRoom } from '../helpers';
import type { HandTarget } from '../../world/car/Driver';
import { ICONS, iconSvg, type IconId } from '../../core/icons';
import { crossed, sseg, track, lerp, DEG } from '../../core/util';

const LEGEND: IconId[] = ['brake', 'oil', 'coolant', 'battery', 'airbag', 'belt', 'engine', 'tpms', 'abs', 'fuel'];
const RED_EXAMPLES: IconId[] = ['brake', 'oil', 'coolant', 'battery'];

interface MirrorAim {
  yaw: number;
  pitch: number;
}

/** 사이드미러 각도 적용 */
function aimSide(ctx: Ctx, idx: 0 | 1, a: MirrorAim) {
  ctx.car.mirrors[idx].pivot.rotation.set(0, a.yaw, a.pitch, 'YXZ');
}
const mixAim = (a: MirrorAim, b: MirrorAim, kYaw: number, kPitch: number): MirrorAim => ({
  yaw: lerp(a.yaw, b.yaw, kYaw),
  pitch: lerp(a.pitch, b.pitch, kPitch),
});

/** 운전자가 핸들 맨 위에 손목을 올리는 자세 */
const wristOnTop = (ctx: Ctx) => (): HandTarget => {
  const top = local(ctx, ctx.cockpit.anchors.wheelTop);
  return { pos: top.add(V(-0.03, 0.005, 0.03)), finger: V(0.8, -0.55, 0).normalize(), back: V(0.55, 0.8, 0), pose: 'relaxed' };
};

export const finalSteps: Step[] = [
  {
    id: 'warning-lights',
    section: 4,
    title: '계기판 경고등 확인',
    body: '시동을 걸면 경고등이 <b>모두 켜졌다가 꺼지는 게 정상</b>이에요(전구 점검). 출발 전, <b>꺼지지 않고 남아 있는 등</b>이 없는지 꼭 확인하세요. <b style="color:#e5352b">빨간색</b>은 즉시 정차·점검, <b style="color:#d98306">노란색</b>은 빠른 점검, <b style="color:#15924a">초록</b>·<b style="color:#2a62e8">파란색</b>은 작동 중 표시입니다.',
    facts: [
      { k: '빨강', v: '위험 — 즉시 정차' },
      { k: '노랑', v: '주의 — 빨리 점검' },
      { k: '초록·파랑', v: '작동 중' },
    ],
    env: 'park',
    mode: 'interior',
    duration: 16,
    inset: `<h3>꼭 알아둘 경고등</h3><div class="grid">${LEGEND.map(
      (id) => `<div class="ic" data-k="${id}">${iconSvg(id, undefined, 24)}<span>${ICONS[id].name}</span></div>`,
    ).join('')}</div><div class="note" id="wl-desc">시동 후에도 켜져 있으면 해당 계통을 점검하세요.</div>`,
    cam: [S(0, [-0.12, 1.12, -0.38], [0.55, 0.975, -0.38], 36), S(16, [-0.1, 1.11, -0.38], [0.55, 0.975, -0.38], 36)],
    enter(ctx) {
      ctx.labels.add('cl', ctx.cockpit.anchors.clusterWarn, { text: '', dir: 'down', len: 70, visible: false });
    },
    update(ctx, t, prev) {
      const s = ctx.cockpit.cluster.state;
      if (t < 1) {
        s.power = 'off';
      } else {
        engineRunning(ctx);
      }
      if (crossed(prev, t, 1)) ctx.sfx.engine();
      s.bulbCheck = t > 1 && t < 4;
      s.sweep = sseg(t, 1.1, 3.2);
      let lit: IconId | null = null;
      let text = '';
      let kind: '' | 'warn' | 'amber' | 'ok' = '';
      if (t > 1 && t < 4) {
        text = '전구 점검: 모두 켜짐';
        kind = 'amber';
      } else if (t >= 4 && t < 8.5) {
        lit = 'tpms';
        text = '노란 타이어 경고등이 안 꺼졌어요 → 공기압 확인';
        kind = 'amber';
      } else if (t >= 8.5 && t < 9.2) {
        text = '✓ 모두 꺼짐 — 출발 가능';
        kind = 'ok';
      } else if (t >= 9.2) {
        lit = RED_EXAMPLES[Math.min(3, Math.floor((t - 9.2) / 1.6))];
        text = `${ICONS[lit].name}: ${ICONS[lit].desc}`;
        kind = 'warn';
      }
      s.warnings = lit ? [lit] : [];
      s.highlight = lit;
      ctx.labels.set('cl', { visible: !!text, text, kind });
      ctx.ui.insetActive(s.bulbCheck ? LEGEND : lit);
      const desc = ctx.ui.insetQuery('#wl-desc');
      if (desc && lit) desc.textContent = `${ICONS[lit].name} — ${ICONS[lit].desc}`;
    },
  },
  {
    id: 'side-mirror',
    section: 4,
    title: '사이드미러 맞추기',
    body: '운전석 문의 미러 스위치에서 <b>L/R을 고르고</b> 방향 버튼으로 조절해요. 거울 안쪽에 <b>내 차 옆면이 1/4 정도</b> 보이고, <b>수평선(도로 끝)이 거울 가운데</b>쯤 오면 알맞습니다. 오른쪽 미러는 도로가 조금 더 보이게 <b>약간 아래로</b> 맞춰요.',
    facts: [
      { k: '차체', v: '거울 안쪽 약 1/4' },
      { k: '수평선', v: '가운데 (오른쪽은 살짝 아래)' },
    ],
    tip: '미러는 반드시 <b>바른 자세로 앉은 상태</b>에서 맞춰요. 시트를 움직였다면 다시 맞춰야 합니다.',
    env: 'park',
    mode: 'interior',
    duration: 19,
    hud: 'left',
    inset: `<h3 id="mv-title">왼쪽 사이드미러에 보이는 모습</h3>
      <div class="mirror-view" style="aspect-ratio:2/1"><div class="guide">
        <div class="g-h"></div><div class="g-v" id="gv" style="left:75%"></div>
        <span class="g-t" id="gt-body" style="right:6px;top:6px">차체 1/4</span>
        <span class="g-t" style="left:6px;top:calc(50% - 26px)">수평선</span>
      </div></div>
      <div class="note" id="mv-note"></div>`,
    cam: [
      S(0, [-0.08, 1.08, -0.42], [0.32, 0.74, -0.8], 44),
      S(2.2, [-0.08, 1.08, -0.42], [0.32, 0.74, -0.8], 44),
      S(3.4, [-0.36, 1.2, -0.38], [0.96, 1.04, -1.1], 52),
      S(10.4, [-0.36, 1.2, -0.38], [0.96, 1.04, -1.1], 52),
      S(11.8, [-0.36, 1.2, -0.38], [0.96, 1.02, 1.1], 52),
    ],
    enter(ctx) {
      ctx.car.root.updateMatrixWorld(true);
      const goodL = calibrateSide(ctx, 0, 0.25, 0);
      const goodR = calibrateSide(ctx, 1, 0.25, 5);
      ctx.car.root.userData = {
        goodL,
        goodR,
        badL: { yaw: goodL.yaw + 0.14, pitch: goodL.pitch - 0.1 },
        badR: { yaw: goodR.yaw - 0.13, pitch: goodR.pitch - 0.09 },
      };
      ctx.labels.add('sw', ctx.cockpit.anchors.mirrorSwitch, { text: '', kind: 'info', dir: 'up', len: 40, visible: false });
      ctx.labels.add('ml', ctx.car.anchors.mirrorL, { text: '왼쪽 미러', dir: 'up', len: 30, visible: false });
      ctx.labels.add('mr', ctx.car.anchors.mirrorR, { text: '오른쪽 미러', dir: 'up', len: 30, visible: false });
    },
    update(ctx, t, prev) {
      const c = ctx.cockpit;
      const d = ctx.car.root.userData as Record<'goodL' | 'goodR' | 'badL' | 'badR', MirrorAim>;
      const right = t > 10.6;
      ctx.hud = right ? 'right' : 'left';
      c.mirrorSel = t < 1.4 ? null : right ? 'R' : 'L';
      if (crossed(prev, t, 1.4) || crossed(prev, t, 10.6)) ctx.sfx.click();
      // 왼쪽: 높이 → 좌우 순서로
      aimSide(ctx, 0, mixAim(d.badL, d.goodL, sseg(t, 6, 9), sseg(t, 3.6, 5.6)));
      aimSide(ctx, 1, mixAim(d.badR, d.goodR, sseg(t, 14.2, 16.6), sseg(t, 11.8, 13.8)));
      const padY = (t > 3.6 && t < 5.6) || (t > 11.8 && t < 13.8) ? 1 : 0;
      const padX = t > 6 && t < 9 ? -1 : t > 14.2 && t < 16.6 ? 1 : 0;
      c.mirrorPad.set(padX, padY);
      ctx.ghost.L = reach(wheelHand(ctx, 'L'), grab(ctx, 'mirrorSwitch', [0.3, -0.88, -0.2], [0.88, 0.3, 0.1], 'point'), sseg(t, 0.2, 1.2));
      ctx.ghost.R = wheelHand(ctx, 'R');
      const phase = right
        ? t < 11.8 ? ['R 선택', '오른쪽: 지금은 하늘만 많이 보여요'] : t < 14.2 ? ['▼ 아래로', '도로가 조금 더 보이게 살짝 아래로'] : t < 16.6 ? ['▶ 바깥쪽으로', '차체가 1/4만 보이게'] : ['✓ 완성', '✓ 차체 1/4 · 수평선은 가운데보다 살짝 위']
        : t < 1.4 ? ['', ''] : t < 3.6 ? ['L 선택', '지금은 하늘과 내 차만 많이 보여요'] : t < 6 ? ['▼ 아래로', '수평선이 가운데 오도록 내리기'] : t < 9 ? ['◀ 바깥쪽으로', '차체가 1/4만 보이게 바깥쪽으로'] : ['✓ 완성', '✓ 차체 1/4 · 수평선 가운데'];
      ctx.labels.set('sw', { visible: t > 1.2 && t < 3.2, text: phase[0] });
      ctx.labels.show('ml', t > 2.6 && t < 3.8);
      ctx.labels.show('mr', t > 11.2 && t < 12.4);
      const title = ctx.ui.insetQuery('#mv-title');
      if (title) title.textContent = right ? '오른쪽 사이드미러에 보이는 모습' : '왼쪽 사이드미러에 보이는 모습';
      const gv = ctx.ui.insetQuery('#gv');
      if (gv) gv.style.left = right ? '25%' : '75%';
      const gt = ctx.ui.insetQuery('#gt-body');
      if (gt) {
        gt.style.left = right ? '6px' : '';
        gt.style.right = right ? '' : '6px';
      }
      const note = ctx.ui.insetQuery('#mv-note');
      if (note) note.textContent = phase[1];
      if (crossed(prev, t, 9) || crossed(prev, t, 16.6)) ctx.sfx.chime();
    },
  },
  {
    id: 'room-mirror',
    section: 4,
    title: '룸미러 맞추기',
    body: '바른 자세로 앉아 <b>고개를 움직이지 않은 채</b>, 거울 테두리를 잡고 <b>뒷유리 전체가 거울 가운데에 꽉 차게</b> 보이도록 맞춥니다. 밤에 뒤차 불빛이 눈부시면 아래쪽 레버나 자동 감광 기능을 쓰세요.',
    facts: [
      { k: '기준', v: '뒷유리가 가운데에 가득' },
      { k: '잡는 곳', v: '거울 면 말고 테두리' },
    ],
    env: 'park',
    mode: 'interior',
    duration: 12,
    hud: 'room',
    inset: `<h3>룸미러에 보이는 모습</h3>
      <div class="mirror-view" style="aspect-ratio:4/1"><div class="guide"><div class="g-h"></div><div class="g-v" style="left:50%"></div></div></div>
      <div class="note" id="rm-note"></div>`,
    cam: [S(0, [-0.36, 1.21, -0.38], [0.44, 1.3, 0.0], 50), S(12, [-0.36, 1.21, -0.38], [0.44, 1.3, 0.0], 50)],
    enter(ctx) {
      ctx.car.root.updateMatrixWorld(true);
      const good = calibrateRoom(ctx);
      ctx.car.root.userData = { good, bad: { yaw: good.yaw + 0.17, pitch: good.pitch + 0.08 } };
      ctx.labels.add('rm', ctx.cockpit.anchors.roomMirror, { text: '', dir: 'down', len: 60, visible: false });
    },
    update(ctx, t, prev) {
      const d = ctx.car.root.userData as { good: MirrorAim; bad: MirrorAim };
      const k = sseg(t, 2.4, 7.4);
      ctx.cockpit.roomMirror.set(lerp(d.bad.yaw, d.good.yaw, k), lerp(d.bad.pitch, d.good.pitch, k));
      const edge = (): HandTarget => {
        const p = local(ctx, ctx.cockpit.anchors.roomMirror).add(V(0.0, -0.06, 0.12));
        return { pos: p.add(V(-0.08, -0.01, 0.02)), finger: V(0.85, 0.1, -0.5).normalize(), back: V(0, 1, 0), pose: 'pinch' };
      };
      ctx.ghost.R = t < 8.2 ? reach(wheelHand(ctx, 'R'), edge, sseg(t, 0.8, 2.2)) : reach(edge, wheelHand(ctx, 'R'), sseg(t, 8.2, 9.2));
      ctx.ghost.L = wheelHand(ctx, 'L');
      const note = ctx.ui.insetQuery('#rm-note');
      const msg = t < 2.4 ? '뒷유리가 한쪽으로 치우쳐 있어요' : t < 7.4 ? '테두리를 잡고 천천히 돌리기' : '✓ 뒷유리가 가운데에 가득';
      if (note) note.textContent = msg;
      ctx.labels.set('rm', { visible: t > 0.6, text: t < 7.4 ? '테두리를 잡고 조절' : '✓ 완성', kind: t < 7.4 ? 'info' : 'ok' });
      if (crossed(prev, t, 7.4)) ctx.sfx.chime();
    },
  },
  {
    id: 'steering-position',
    section: 4,
    title: '핸들 위치 맞추기 (틸트·텔레스코픽)',
    body: '핸들 아래 <b>레버를 내리면</b> 핸들의 높이와 앞뒤 거리를 바꿀 수 있어요. 등을 등받이에 붙인 채 팔을 뻗었을 때 <b>손목이 핸들 맨 위에 닿는 거리</b>, <b>계기판이 가리지 않는 높이</b>로 맞춘 뒤 레버를 올려 고정합니다.',
    facts: [
      { k: '거리', v: '손목이 핸들 위에 닿게' },
      { k: '높이', v: '계기판이 잘 보이게' },
    ],
    tip: '핸들이 너무 가까우면 에어백이 터질 때 위험하고, 너무 멀면 급하게 돌리기 어려워요.',
    env: 'park',
    mode: 'cutaway',
    duration: 14,
    cut: true,
    cam: [S(0, [0.1, 1.25, -2.3], [0.0, 0.95, -0.38], 38), S(14, [0.05, 1.22, -2.2], [0.0, 0.95, -0.38], 38)],
    enter(ctx) {
      ctx.driver = { handL: 'wheel', handR: 'wheel', footR: 'brake', footL: 'rest' };
      engineRunning(ctx);
      ctx.labels.add('lever', ctx.cockpit.anchors.tiltLever, { text: '', kind: 'info', dir: 'down', len: 50, visible: false });
      ctx.labels.add('wrist', ctx.cockpit.anchors.wheelTop, { text: '손목이 핸들 위에 닿으면 OK', kind: 'ok', dir: 'up', len: 50, visible: false });
      ctx.labels.add('cl', ctx.cockpit.anchors.cluster, { text: '계기판이 가리지 않게', kind: 'info', dir: 'up', len: 70, visible: false });
    },
    update(ctx, t, prev) {
      const c = ctx.cockpit;
      c.tiltLever = track(t, [[1, 0], [1.4, 1], [6, 1], [6.4, 0]]);
      c.tilt = track(t, [[0, 1.2], [2, 1.2], [5.4, 0]]);
      c.tele = track(t, [[0, -1.2], [2, -1.2], [5.4, 0]]);
      if (crossed(prev, t, 1.4) || crossed(prev, t, 6.4)) ctx.sfx.click();
      const home = wheelHand(ctx, 'R');
      const tiltGrab = grab(ctx, 'tiltLever', [0.2, -0.3, 0.93], [0, 1, 0], 'pinch');
      ctx.driver!.handL = t < 7 ? reach(wheelHand(ctx, 'L'), tiltGrab, sseg(t, 0.2, 1.0)) : reach(tiltGrab, wheelHand(ctx, 'L'), sseg(t, 7, 7.8));
      ctx.driver!.handR = t < 8 ? home : t < 11.5 ? reach(home, wristOnTop(ctx), sseg(t, 8, 9)) : reach(wristOnTop(ctx), home, sseg(t, 11.5, 12.5));
      ctx.labels.set('lever', { visible: t > 1 && t < 6.6, text: t < 6 ? '레버 내리기 → 핸들 이동' : '레버 올려 고정' });
      ctx.labels.show('wrist', t > 9 && t < 11.6);
      ctx.labels.show('cl', t > 5.4 && t < 8);
    },
  },
  {
    id: 'seat',
    section: 4,
    title: '시트 포지션 맞추기',
    body: '<b>① 앞뒤</b> 브레이크를 끝까지 밟아도 무릎이 살짝 굽혀지는 위치 · <b>② 등받이</b> 어깨를 붙인 채 손목이 핸들 위에 닿게 · <b>③ 높이</b> 앞이 잘 보이고 머리 위 주먹 하나 · <b>④ 헤드레스트</b> 머리 가운데 높이',
    tip: '실제로 탔을 땐 <b>시트 → 핸들 → 미러 → 안전벨트</b> 순서로 맞추는 게 좋아요. 시트를 움직이면 미러와 벨트 위치가 달라지거든요.',
    env: 'park',
    mode: 'cutaway',
    duration: 20,
    inset: `<h3>시트 맞추는 순서</h3>${rows([
      ['slide', '1', '<b>앞뒤</b> — 무릎이 살짝 굽혀지게'],
      ['back', '2', '<b>등받이</b> — 약 100~110°, 손목이 핸들 위에'],
      ['height', '3', '<b>높이</b> — 시야 확보, 머리 위 주먹 하나'],
      ['head', '4', '<b>헤드레스트</b> — 머리 가운데'],
    ])}`,
    cam: [S(0, [-0.3, 1.05, -2.75], [-0.08, 0.8, -0.38], 40), S(20, [-0.25, 1.08, -2.7], [-0.08, 0.82, -0.38], 40)],
    enter(ctx) {
      ctx.driver = { handL: 'wheel', handR: 'wheel', footR: 'brake', footL: 'rest' };
      ctx.labels.add('knee', () => world(ctx, ctx.man.kneeR.clone().add(V(0, 0.08, -0.12))), { text: '', dir: 'up', len: 60, visible: false });
      ctx.labels.add('wrist', ctx.cockpit.anchors.wheelTop, { text: '', dir: 'up', len: 46, visible: false });
      ctx.labels.add('head', ctx.cockpit.anchors.headrest, { text: '', dir: 'left', len: 50, visible: false });
    },
    update(ctx, t) {
      const c = ctx.cockpit;
      const seat = c.seat;
      seat.slide = track(t, [[0, -0.17], [1.6, -0.17], [2.6, 0.13], [4, 0.13], [5.2, 0]]);
      c.brake = 1;
      seat.recline = track(t, [[6.4, 18], [7.4, 38], [9.4, 38], [10.6, 14]]) * DEG;
      seat.height = track(t, [[11.6, -0.035], [12.8, -0.035], [13.8, 0.02]]);
      seat.headUp = track(t, [[14.6, -0.1], [15.6, -0.1], [16.8, 0.02]]);
      ctx.driver!.handR = t > 7 && t < 11.4 ? wristOnTop(ctx) : 'wheel';
      const legPhase = t < 2.2 ? 'far' : t < 4.6 ? 'close' : 'good';
      ctx.labels.set('knee', {
        visible: t < 6.2,
        text: legPhase === 'far' ? '너무 멀어요: 다리가 쭉 펴짐' : legPhase === 'close' ? '너무 가까워요: 무릎이 핸들에 닿을 듯' : '무릎이 살짝 굽혀지면 OK',
        kind: legPhase === 'good' ? 'ok' : 'warn',
      });
      ctx.labels.set('wrist', {
        visible: t > 7.6 && t < 11.4,
        text: t < 10.2 ? '너무 눕히면 손목이 안 닿아요' : '등을 붙인 채 손목이 닿으면 OK',
        kind: t < 10.2 ? 'warn' : 'ok',
      });
      ctx.labels.set('head', {
        visible: t > 11.6 && t < 18.5,
        text: t < 14.4 ? '높이: 머리 위 주먹 하나' : t < 16.6 ? '헤드레스트가 너무 낮아요' : '헤드레스트 중심 = 머리 중심',
        kind: t < 14.4 ? 'info' : t < 16.6 ? 'warn' : 'ok',
      });
      const step = t < 6 ? 'slide' : t < 11.2 ? 'back' : t < 14.4 ? 'height' : 'head';
      ctx.ui.insetActive(step);
      const done = [t > 5.2 && 'slide', t > 10.6 && 'back', t > 13.8 && 'height', t > 16.8 && 'head'].filter(Boolean) as string[];
      ctx.ui.insetActive(done, 'done');
    },
  },
  {
    id: 'outro',
    section: 4,
    title: '출발 준비 완료!',
    body: '오늘 배운 순서를 한 번에 정리해요. 차에 타기 전 <b>외부 점검</b> → 타서 <b>시트·핸들·미러</b> → <b>안전벨트</b> → <b>브레이크 밟고 시동</b> → <b>경고등 확인</b> → 브레이크를 밟은 채 <b>D</b> → 주변을 살핀 뒤 천천히 출발.',
    env: 'park',
    mode: 'exterior',
    duration: 14,
    inset: `<h3>출발 전 체크리스트</h3>${rows([
      ['a', '1', '타이어 · 차 밑 · 등화 · 엔진룸'],
      ['b', '2', '시트 → 핸들 → 미러'],
      ['c', '3', '안전벨트 찰칵'],
      ['d', '4', '브레이크 밟고 시동'],
      ['e', '5', '경고등 꺼짐 확인'],
      ['f', '6', '브레이크 밟은 채 D (EPB 자동 해제)'],
    ])}<div class="note">기둥 옆에서 나올 땐 뒷바퀴가 기둥을 지난 뒤 핸들! 주차할 땐 오토홀드 OFF.</div>`,
    cam: orbit([0, 0.7, 0], 7.6, 2.6, -1.0, 1.2, 14, 40),
    enter(ctx) {
      engineRunning(ctx);
      ctx.driver = { handL: 'wheel', handR: 'wheel', footR: 'brake', footL: 'rest' };
      ctx.car.lights.drl = true;
      ctx.car.lights.tail = true;
    },
    update(ctx, t, prev) {
      const keys = ['a', 'b', 'c', 'd', 'e', 'f'];
      const n = Math.min(6, Math.floor((t - 0.5) / 1.2) + 1);
      ctx.ui.insetActive(keys.slice(0, Math.max(0, n)), 'done');
      if (crossed(prev, t, 7.8)) ctx.sfx.chime();
    },
  },
];
