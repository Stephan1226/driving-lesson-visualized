import type { Step } from '../types';
import { S, V, orbit } from '../helpers';
import { placeCoin, COIN_ANGLE } from '../../world/car/Wheel';
import { crossed, sseg, track, lerp, pick } from '../../core/util';

const LEAKS = [
  { k: 'oil', color: 0x1b1410, op: 0.92, text: '검은색·갈색 기름', sub: '엔진오일이 새는 중 → 정비소', kind: 'warn' as const },
  { k: 'coolant', color: 0x2fbf6a, op: 0.85, text: '초록·분홍 물', sub: '냉각수가 새는 중 → 정비소', kind: 'warn' as const },
  { k: 'brake', color: 0xc9a43a, op: 0.88, text: '노랗고 미끈한 기름', sub: '브레이크액 → 운행 전 점검', kind: 'warn' as const },
  { k: 'ac', color: 0xa9cce8, op: 0.5, text: '맑은 물', sub: '에어컨 물 → 정상이에요', kind: 'ok' as const },
];

export const exteriorSteps: Step[] = [
  {
    id: 'walkaround',
    section: 0,
    title: '차에 타기 전, 한 바퀴',
    body: '운전석에 앉기 전에 <b>차 주위를 한 바퀴 돌며</b> 상태를 눈으로 확인하는 습관부터 시작합니다. 익숙해지면 1~2분이면 충분해요.',
    facts: [
      { k: '언제', v: '매번 출발 전' },
      { k: '소요', v: '약 1~2분' },
      { k: '순서', v: '앞 → 옆 → 뒤 → 반대편' },
    ],
    env: 'park',
    mode: 'exterior',
    duration: 12,
    cam: orbit([0, 0.4, 0], 9.6, 4.3, -2.25, -0.55, 12, 42),
    enter(ctx) {
      ctx.car.setMirrorFold(1);
      ctx.fx.walker.root.visible = true;
      ctx.labels.add('walker', () => ctx.fx.walker.root.position.clone().add(V(0, 1.85, 0)), { text: '한 바퀴 점검', kind: 'info', len: 24 });
      ctx.labels.add('front', ctx.car.anchors.headL, { text: '앞', sub: '전조등·앞유리·번호판', dir: 'up', visible: false });
      ctx.labels.add('side', ctx.car.wheels[1].anchors.tire, { text: '옆', sub: '타이어·문·미러', visible: false });
      ctx.labels.add('rear', ctx.car.anchors.tailL, { text: '뒤', sub: '후미등·트렁크·차 밑', visible: false });
    },
    update(ctx, t) {
      const th = lerp(-Math.PI / 2, (Math.PI * 3) / 2, sseg(t, 0.3, 11.6));
      const x = 3.25 * Math.cos(th);
      const z = 1.95 * Math.sin(th);
      const dx = -3.25 * Math.sin(th);
      const dz = 1.95 * Math.cos(th);
      const w = ctx.fx.walker;
      w.root.position.set(x, 0, z);
      w.root.rotation.y = Math.atan2(-dz, dx);
      w.pose(t * 7.5);
      ctx.labels.show('front', th > -0.6 && th < 0.9);
      ctx.labels.show('side', th > 0.9 && th < 2.3);
      ctx.labels.show('rear', th > 2.3 && th < 4.2);
    },
  },
  {
    id: 'under',
    section: 0,
    title: '차 밑과 주변 살피기',
    body: '허리를 숙여 차 밑에 <b>기름이나 물이 샌 자국</b>이 없는지, 바퀴 주변에 못·돌·유리 조각은 없는지, <b>고양이</b>가 숨어 있지 않은지 확인합니다.',
    facts: [
      { k: '얼룩 색', v: '어떤 액체인지 알려줘요' },
      { k: '겨울철', v: '보닛·바퀴 사이 고양이 주의' },
    ],
    env: 'park',
    mode: 'exterior',
    duration: 14,
    inset: `<h3>바닥 얼룩 색으로 보는 누유</h3>
      <div class="row" data-k="oil"><span class="sw" style="background:#2a1d14"></span><span><b>검은색·갈색</b> — 엔진오일</span></div>
      <div class="row" data-k="coolant"><span class="sw" style="background:#2fbf6a"></span><span><b>초록·분홍</b> — 냉각수</span></div>
      <div class="row" data-k="brake"><span class="sw" style="background:#c9a43a"></span><span><b>노란 기름</b> — 브레이크액 (즉시 점검)</span></div>
      <div class="row" data-k="ac"><span class="sw" style="background:#a9cce8"></span><span><b>맑은 물</b> — 에어컨 응축수 (정상)</span></div>
      <div class="note">얼룩이 보이면 사진을 찍어 정비소에 보여주면 원인을 찾기 쉬워요.</div>`,
    cam: [S(0, [5.6, 1.5, -4.3], [1.6, 0.2, 0], 40), S(4, [3.7, 0.55, -2.7], [1.55, 0.05, 0.1], 38), S(14, [3.3, 0.45, -2.25], [1.55, 0.05, 0.15], 36)],
    enter(ctx) {
      ctx.car.setMirrorFold(1);
      const { fx } = ctx;
      fx.puddle.visible = true;
      fx.puddle.position.set(1.55, 0.015, 0.12);
      fx.puddle.scale.setScalar(1.25);
      fx.walker.root.visible = true;
      fx.walker.root.position.set(3.0, 0, 1.55);
      fx.walker.root.rotation.y = Math.atan2(1.45, -1.45);
      fx.walker.pose(0, 1);
      ctx.labels.add('leak', ctx.car.anchors.under, { text: '', kind: 'warn', len: 46 });
    },
    update(ctx, t) {
      const i = Math.max(0, Math.min(3, Math.floor((t - 1.5) / 3)));
      const L = LEAKS[i];
      ctx.fx.puddleMat.color.set(L.color);
      ctx.fx.puddleMat.opacity = L.op * sseg(t, 0.5, 1.5);
      ctx.labels.set('leak', { text: L.text, sub: L.sub, kind: L.kind, visible: t > 1.5 });
      ctx.ui.insetActive(t > 1.5 ? L.k : null, L.kind === 'ok' ? 'on' : 'on');
      ctx.fx.walker.pose(0, 1);
    },
  },
  {
    id: 'tread',
    section: 0,
    title: '타이어 트레드(홈) 깊이',
    body: '타이어 홈이 닳으면 빗길에서 쉽게 미끄러져요. 홈 깊이가 <span class="hl">1.6mm 이하</span>면 교체해야 합니다. <b>100원 동전</b>을 이순신 장군 감투가 아래로 가게 홈에 꽂아 보세요. <b>감투가 보이면 교체 시기</b>예요.',
    facts: [
      { k: '법적 한계', v: '1.6mm' },
      { k: '교체 주기', v: '약 4~6만 km · 3~5년' },
      { k: '점검', v: '월 1회' },
    ],
    tip: '홈 속 작은 돌기(마모 한계선)가 타이어 표면과 높이가 같아졌다면 바로 교체하세요. 오래된 타이어는 홈이 남아 있어도 고무가 굳어 위험해요.',
    env: 'park',
    mode: 'exterior',
    duration: 16,
    inset: `<h3>100원 동전 테스트</h3>
      <svg viewBox="0 0 320 128" width="100%">
        ${coinPanel(0, 66, '정상 · 감투 안 보임', '#15924a', 'ok')}
        ${coinPanel(164, 94, '교체 · 감투 보임', '#e5352b', 'bad')}
      </svg>
      <div class="note">동전을 홈에 거꾸로 꽂고 옆에서 봤을 때, 이순신 장군의 감투(모자)가 보이면 홈 깊이가 약 3mm 이하라는 뜻이에요.</div>`,
    cam: (t, ctx) => {
      const w = ctx.car.wheels[0];
      const radial = V(Math.cos(COIN_ANGLE), Math.sin(COIN_ANGLE), 0).transformDirection(w.flip.matrixWorld);
      const coin = w.spin.localToWorld(V(Math.cos(COIN_ANGLE) * 0.334, Math.sin(COIN_ANGLE) * 0.334, 0));
      const n = V(0, 0, -1).transformDirection(w.flip.matrixWorld);
      const hub = w.root.getWorldPosition(V(0, 0, 0));
      const far = hub.clone().addScaledVector(n, 2.8).add(V(1.9, 0.95, 0));
      const mid = hub.clone().addScaledVector(n, 0.9).add(V(0.25, 0.25, 0));
      const near = coin.clone().addScaledVector(n, 0.3).addScaledVector(radial, 0.05);
      const k1 = sseg(t, 0, 3);
      const k2 = sseg(t, 3, 5.5);
      const pos = far.lerp(mid, k1).lerp(near, k2);
      const look = hub.clone().lerp(coin, k2);
      const up = V(0, 1, 0).lerp(radial, k2 * 0.6).normalize();
      return { pos, look, fov: lerp(40, 34, k2), up };
    },
    enter(ctx) {
      ctx.car.setMirrorFold(1);
      ctx.car.setSteer(0.36);
      const w = ctx.car.wheels[0];
      ctx.labels.add('coin', () => w.coin!.getWorldPosition(V(0, 0, 0)).add(V(0, 0.016, 0)), { text: '', dir: 'right', len: 50, visible: false });
      ctx.labels.add('tire', w.anchors.tire, { text: '앞바퀴를 살짝 꺾으면 홈이 잘 보여요', kind: 'info' });
    },
    update(ctx, t, prev) {
      const w = ctx.car.wheels[0];
      placeCoin(w, sseg(t, 3.2, 5.6));
      w.setTreadWear(track(t, [[0, 0.08], [9.5, 0.08], [12.5, 0.93]]));
      ctx.labels.show('tire', t < 2.8);
      const st = pick(t, [[0, ''], [6, 'ok'], [9.5, 'wear'], [12.6, 'bad']] as [number, string][]);
      ctx.labels.set('coin', {
        visible: st !== '',
        text: st === 'ok' ? '감투가 홈 속에 숨음' : st === 'wear' ? '타이어가 닳으면…' : '감투가 보임 → 교체!',
        sub: st === 'ok' ? '홈이 충분해요 (정상)' : st === 'bad' ? '홈 깊이 3mm 이하' : '',
        kind: st === 'ok' ? 'ok' : st === 'bad' ? 'warn' : 'amber',
      });
      ctx.ui.insetActive(st === 'ok' ? 'ok' : st === 'bad' ? 'bad' : null);
      if (crossed(prev, t, 12.6)) ctx.sfx.warn();
    },
  },
  {
    id: 'pressure',
    section: 0,
    title: '타이어 공기압',
    body: '한쪽 타이어만 <b>유난히 납작해 보이지 않는지</b> 확인하세요. 공기압이 부족하면 연비가 나빠지고 타이어가 빨리 닳으며, 고속에서 위험해요. 적정 공기압은 <b>운전석 문 안쪽 스티커</b>에 적혀 있습니다.',
    facts: [
      { k: '점검', v: '월 1회 · 장거리 전' },
      { k: '적정값', v: '보통 33~36 psi (스티커 확인)' },
      { k: '계기판', v: 'TPMS 경고등' },
    ],
    tip: '계기판에 노란 타이어 모양 경고등(TPMS)이 켜지면, 가까운 정비소나 주유소에서 공기압부터 확인하세요.',
    env: 'park',
    mode: 'exterior',
    duration: 13,
    inset: `<h3>공기압 게이지</h3>
      <svg viewBox="0 0 320 120" width="100%">
        <path d="M40 104 A120 120 0 0 1 280 104" fill="none" stroke="#e3e8f0" stroke-width="16" stroke-linecap="round"/>
        <path d="M40 104 A120 120 0 0 1 116 7" fill="none" stroke="#ffb4ae" stroke-width="16" stroke-linecap="round"/>
        <path d="M209 10 A120 120 0 0 1 247 34" fill="none" stroke="#9fe0b8" stroke-width="16" stroke-linecap="round"/>
        <g id="needle" transform="rotate(0 160 104)"><line x1="160" y1="104" x2="160" y2="18" stroke="#141820" stroke-width="5" stroke-linecap="round"/></g>
        <circle cx="160" cy="104" r="9" fill="#141820"/>
        <text x="40" y="120" font-size="11" text-anchor="middle" fill="#7b8597">0</text>
        <text x="280" y="120" font-size="11" text-anchor="middle" fill="#7b8597">50</text>
        <text id="psi" x="160" y="80" font-size="22" font-weight="800" text-anchor="middle" fill="#141820">35 psi</text>
      </svg>
      <div class="row" data-k="sticker"><span class="key">스티커</span><span>운전석 문을 열면 보이는 기둥(B필러)에 <b>적정 공기압</b>이 적혀 있어요</span></div>`,
    cam: [S(0, [0.6, 1.1, -4.9], [-0.3, 0.35, -0.8], 40), S(4, [-0.85, 0.55, -2.75], [-1.37, 0.3, -0.8], 36), S(13, [-0.75, 0.5, -2.5], [-1.37, 0.28, -0.8], 34)],
    enter(ctx) {
      ctx.car.setMirrorFold(1);
      ctx.labels.add('rl', ctx.car.wheels[2].anchors.tire, { text: '', len: 40, visible: false });
    },
    update(ctx, t) {
      const k = track(t, [[0, 0], [3, 0], [5.5, 1], [8.5, 1], [10.5, 0]]);
      ctx.car.wheels[2].setDeflate(k);
      const psi = Math.round(lerp(35, 21, k));
      const needle = ctx.ui.insetQuery('#needle');
      needle?.setAttribute('transform', `rotate(${((psi / 50) * 180 - 90).toFixed(1)} 160 104)`);
      const txt = ctx.ui.insetQuery('#psi');
      if (txt) {
        txt.textContent = `${psi} psi`;
        txt.setAttribute('fill', psi < 30 ? '#e5352b' : '#141820');
      }
      ctx.labels.set('rl', {
        visible: t > 4,
        text: k > 0.5 ? '바닥이 넓게 퍼짐 → 공기 부족' : '적정 공기압',
        kind: k > 0.5 ? 'warn' : 'ok',
      });
      ctx.ui.insetActive(t > 10.5 ? 'sticker' : null);
    },
  },
  {
    id: 'brake-pad',
    section: 0,
    title: '브레이크 패드·디스크',
    body: '휠 사이로 둥근 <b>디스크</b>와 이를 붙잡는 <b>캘리퍼</b>가 보여요. 캘리퍼 안 <b>패드</b>가 닳아 <span class="hl">3mm 이하</span>가 되거나, 브레이크를 밟을 때 <b>‘끼익’ 쇳소리</b>가 나면 교체 시기입니다.',
    facts: [
      { k: '패드 교체', v: '약 3~5만 km' },
      { k: '디스크', v: '패드 2번 갈 때 함께 점검' },
      { k: '새 패드', v: '약 10mm' },
    ],
    tip: '패드 끝의 마모 경고 철판이 디스크에 닿으면 쇳소리가 나요. 소리를 무시하면 디스크까지 상합니다.',
    env: 'park',
    mode: 'exterior',
    duration: 15,
    inset: `<h3>패드 두께</h3>
      <svg viewBox="0 0 320 96" width="100%">
        <text x="0" y="14" font-size="12" font-weight="700" fill="#4a5363">새 패드</text>
        <rect x="70" y="2" width="12" height="16" fill="#9aa0a6"/><rect x="82" y="2" width="120" height="16" rx="2" fill="#5a4636"/>
        <text x="210" y="15" font-size="12" font-weight="800" fill="#141820">10 mm</text>
        <text x="0" y="52" font-size="12" font-weight="700" fill="#4a5363">지금</text>
        <rect x="70" y="40" width="12" height="16" fill="#9aa0a6"/><rect id="padbar" x="82" y="40" width="120" height="16" rx="2" fill="#5a4636"/>
        <text id="padmm" x="210" y="53" font-size="12" font-weight="800" fill="#141820">10 mm</text>
        <line x1="118" y1="34" x2="118" y2="64" stroke="#e5352b" stroke-width="2" stroke-dasharray="4 3"/>
        <text x="118" y="80" font-size="11" font-weight="700" fill="#e5352b" text-anchor="middle">3mm 이하 = 교체</text>
      </svg>`,
    cam: [S(0, [3.1, 0.95, -2.9], [1.38, 0.4, -0.85], 38), S(3, [1.78, 0.56, -1.78], [1.3, 0.42, -0.84], 32), S(15, [1.62, 0.6, -1.58], [1.25, 0.44, -0.83], 30)],
    enter(ctx) {
      ctx.car.setMirrorFold(1);
      const w = ctx.car.wheels[0];
      ctx.labels.add('disc', w.anchors.disc, { text: '브레이크 디스크', dir: 'down', len: 40, visible: false });
      ctx.labels.add('caliper', () => w.anchors.pad.getWorldPosition(V(0, 0, 0)).add(V(-0.02, 0.04, 0)), { text: '캘리퍼', kind: 'info', len: 30, visible: false });
      ctx.labels.add('pad', w.anchors.pad, { text: '패드', dir: 'left', len: 46, visible: false });
    },
    update(ctx, t, prev) {
      const w = ctx.car.wheels[0];
      w.setXray(sseg(t, 2.2, 4));
      const wear = track(t, [[0, 0], [7, 0], [11, 1]]);
      w.setPadWear(wear);
      ctx.labels.show('disc', t > 4);
      ctx.labels.show('caliper', t > 4.6);
      const mm = lerp(10, 2.5, wear);
      ctx.labels.set('pad', {
        visible: t > 5.2,
        text: wear > 0.95 ? '패드 2.5mm → 교체!' : `패드 ${mm.toFixed(0)}mm`,
        kind: wear > 0.95 ? 'warn' : '',
      });
      const bar = ctx.ui.insetQuery('#padbar');
      bar?.setAttribute('width', String((120 * mm) / 10));
      bar?.setAttribute('fill', mm <= 3 ? '#e5352b' : '#5a4636');
      const mmt = ctx.ui.insetQuery('#padmm');
      if (mmt) mmt.textContent = `${mm.toFixed(1)} mm`;
      if (crossed(prev, t, 11.2)) {
        ctx.sfx.squeal();
        ctx.ui.toast('끼익—', 'warn');
      }
    },
  },
  {
    id: 'engine-bay',
    section: 0,
    title: '보닛 열고 오일·냉각수·워셔액',
    body: '보닛을 열고 <b>노란 고리의 엔진오일 게이지</b>를 뽑아 닦은 뒤, 다시 꽂았다 빼서 기름 자국이 <b>L과 F 사이</b>인지 봅니다. <b>냉각수·워셔액</b>은 통 옆의 MIN–MAX 사이면 정상이에요.',
    facts: [
      { k: '엔진오일', v: '약 1만 km · 1년' },
      { k: '냉각수', v: '양은 수시 · 교환은 차종별' },
      { k: '워셔액', v: '부족할 때마다' },
    ],
    tip: '⚠️ 엔진이 뜨거울 때 냉각수 뚜껑을 열면 끓는 물이 뿜어져 나와요. 반드시 엔진이 식은 뒤에, 평평한 곳에서 확인하세요.',
    env: 'park',
    mode: 'exterior',
    duration: 18,
    inset: `<h3>엔진오일 게이지 읽기</h3>
      <svg viewBox="0 0 320 70" width="100%">
        <rect x="10" y="30" width="300" height="10" rx="5" fill="#c9ced6"/>
        <rect x="150" y="27" width="110" height="16" rx="6" fill="#b07a1e" opacity="0.85"/>
        <line x1="150" y1="18" x2="150" y2="52" stroke="#141820" stroke-width="2"/>
        <line x1="260" y1="18" x2="260" y2="52" stroke="#141820" stroke-width="2"/>
        <text x="150" y="66" font-size="13" font-weight="800" text-anchor="middle">L</text>
        <text x="260" y="66" font-size="13" font-weight="800" text-anchor="middle">F</text>
        <text x="205" y="14" font-size="12" font-weight="700" text-anchor="middle" fill="#15924a">이 사이면 정상</text>
      </svg>
      <div class="row" data-k="oil"><span class="sw" style="background:#f5c518"></span><span><b>엔진오일</b> 노란 고리 게이지</span></div>
      <div class="row" data-k="coolant"><span class="sw" style="background:#ff5fa2"></span><span><b>냉각수</b> 반투명 통 · MIN~MAX</span></div>
      <div class="row" data-k="washer"><span class="sw" style="background:#2f7de1"></span><span><b>워셔액</b> 파란 뚜껑(유리 그림)</span></div>
      <div class="row" data-k="brake"><span class="sw" style="background:#d9b44a"></span><span><b>브레이크액</b> 작은 통 · 2년마다 교환</span></div>`,
    cam: [
      S(0, [5.2, 2.1, -2.6], [1.7, 0.8, 0], 42),
      S(3, [3.5, 2.05, -1.25], [1.65, 0.85, -0.05], 44),
      S(7.5, [3.2, 1.95, -1.05], [1.6, 0.86, -0.05], 44),
      S(9.8, [2.2, 1.5, -0.95], [1.46, 1.12, -0.24], 34),
      S(13, [2.2, 1.5, -0.95], [1.46, 1.12, -0.24], 34),
      S(15.5, [3.6, 2.05, -1.3], [1.65, 0.85, 0], 44),
    ],
    enter(ctx) {
      ctx.car.setMirrorFold(1);
      const a = ctx.car.anchors;
      ctx.labels.add('dip', a.dipstick, { text: '엔진오일 게이지', kind: 'amber', len: 34, visible: false });
      ctx.labels.add('cap', a.oilCap, { text: '오일 주입구', len: 30, dir: 'right', visible: false });
      ctx.labels.add('cool', a.coolant, { text: '냉각수', kind: 'info', len: 34, visible: false });
      ctx.labels.add('wash', a.washer, { text: '워셔액', kind: 'info', len: 30, visible: false });
      ctx.labels.add('bf', a.brakeFluid, { text: '브레이크액', len: 50, visible: false });
      ctx.labels.add('tip', a.dipTip, { text: 'L~F 사이 = 정상', kind: 'ok', dir: 'left', len: 40, visible: false });
    },
    update(ctx, t) {
      ctx.car.setHood(track(t, [[0.3, 0], [2.6, 1]]));
      ctx.car.setDipstick(track(t, [[7.5, 0], [9.6, 1], [13.2, 1], [15, 0]]));
      const showList = t > 2.8 && (t < 7.5 || t > 15);
      ctx.labels.show('dip', t > 3 && t < 7.5);
      ctx.labels.show('cap', showList && t > 3.6);
      ctx.labels.show('cool', showList && t > 4.2);
      ctx.labels.show('wash', showList && t > 4.8);
      ctx.labels.show('bf', showList && t > 5.4);
      ctx.labels.show('tip', t > 10 && t < 13.4);
      const active = t < 3 ? null : t < 7.5 ? (['oil', 'coolant', 'washer', 'brake'][Math.min(3, Math.floor((t - 3) / 1.1))] as string) : t < 15 ? 'oil' : ['coolant', 'washer', 'brake'];
      ctx.ui.insetActive(active);
    },
  },
  {
    id: 'lights',
    section: 0,
    title: '등화장치·와이퍼·유리',
    body: '<b>전조등, 방향지시등, 브레이크등</b>이 깨지거나 꺼진 곳은 없는지, <b>와이퍼 고무</b>가 갈라지지 않았는지, 앞유리와 사이드미러가 깨끗한지 확인합니다.',
    facts: [
      { k: '와이퍼 블레이드', v: '6개월~1년' },
      { k: '전구', v: '나가면 바로 교체' },
    ],
    tip: '브레이크등은 혼자 보기 어려워요. 벽이나 뒤차 유리에 비친 빛으로 확인하거나 동승자에게 부탁하세요.',
    env: 'park',
    mode: 'exterior',
    duration: 15,
    cam: [
      S(0, [6.6, 1.5, -3.1], [1.8, 0.7, 0], 40),
      S(5.2, [4.4, 2.3, -1.4], [1.0, 1.0, 0], 42),
      S(7.6, [4.4, 2.3, -1.4], [1.0, 1.0, 0], 42),
      S(9.6, [-6.6, 1.5, -2.7], [-1.8, 0.8, 0], 40),
      S(15, [-6.2, 1.8, 2.6], [-1.8, 0.8, 0], 40),
    ],
    enter(ctx) {
      ctx.car.setMirrorFold(1);
      const a = ctx.car.anchors;
      ctx.labels.add('head', a.headL, { text: '전조등', len: 34, visible: false });
      ctx.labels.add('turn', a.turnFL, { text: '방향지시등', kind: 'amber', dir: 'down', len: 34, visible: false });
      ctx.labels.add('wiper', a.wiper, { text: '와이퍼 고무 갈라짐 확인', kind: 'info', len: 36, visible: false });
      ctx.labels.add('brake', a.tailL, { text: '브레이크등', kind: 'warn', len: 34, visible: false });
      ctx.labels.add('hmsl', a.hmsl, { text: '보조 제동등', kind: 'warn', len: 30, visible: false });
      ctx.labels.add('rturn', a.turnRL, { text: '방향지시등', kind: 'amber', dir: 'down', len: 30, visible: false });
    },
    update(ctx, t, prev) {
      const L = ctx.car.lights;
      L.drl = true;
      L.low = t > 0.8 && t < 3;
      L.turnL = t > 3 && t < 5.4;
      if (crossed(prev, t, 3)) ctx.car.blinkT0 = ctx.time;
      if (crossed(prev, t, 5.6) || crossed(prev, t, 6.6)) ctx.car.mist();
      L.brake = t > 9.4 && t < 11.6;
      L.tail = t > 9.4;
      L.hazard = t > 11.8 && t < 14.6;
      if (crossed(prev, t, 11.8)) ctx.car.blinkT0 = ctx.time;
      ctx.labels.show('head', L.low);
      ctx.labels.show('turn', L.turnL);
      ctx.labels.show('wiper', t > 5.4 && t < 7.8);
      ctx.labels.show('brake', L.brake);
      ctx.labels.show('hmsl', L.brake);
      ctx.labels.show('rturn', L.hazard);
    },
  },
];

function coinPanel(x: number, surface: number, title: string, color: string, key: string) {
  return `<g transform="translate(${x},0)" data-k="${key}" class="coinp">
    <text x="78" y="12" font-size="12" font-weight="800" text-anchor="middle" fill="${color}">${title}</text>
    <circle cx="78" cy="64" r="32" fill="#cfd3d9" stroke="#8d939b" stroke-width="3"/>
    <ellipse cx="80" cy="60" rx="13" ry="15" fill="#9aa0a8"/>
    <path d="M58 82 Q78 106 98 82 Z" fill="#454a52"/>
    <rect x="0" y="${surface}" width="156" height="${128 - surface}" fill="#26272b"/>
    <line x1="0" y1="${surface}" x2="156" y2="${surface}" stroke="${color}" stroke-width="2" stroke-dasharray="5 4"/>
  </g>`;
}

