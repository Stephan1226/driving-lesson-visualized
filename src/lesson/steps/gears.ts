import * as THREE from 'three';
import type { Ctx } from '../context';
import { grab, local } from '../context';
import type { Step } from '../types';
import { S, V, wheelHand, reach, engineRunning, rows } from '../helpers';
import { quarterTurn } from './garage';
import type { HandTarget } from '../../world/car/Driver';
import type { Gear } from '../../world/car/Cluster';
import { DrivePath } from '../../core/path';
import { crossed, sseg, track, pick, lerp } from '../../core/util';

const GEARS: Gear[] = ['P', 'R', 'N', 'D'];

/** 버튼을 누른 채(브레이크 표시 포함) 기어를 옮기는 장면 공통 */
function brakeLabel(ctx: Ctx) {
  ctx.labels.add('brake', ctx.cockpit.anchors.clusterWarn, { text: '🦶 브레이크 밟는 중', kind: 'warn', dir: 'down', len: 34, visible: false });
}

const prndInset = (title: string, extra = '') => `<h3>${title}</h3>
  <div class="row" data-k="P"><span class="key">P</span><span><b>주차</b> — 세워 둘 때, 시동 걸고 끌 때</span></div>
  <div class="row" data-k="R"><span class="key">R</span><span><b>후진</b> — 뒤로 갈 때</span></div>
  <div class="row" data-k="N"><span class="key">N</span><span><b>중립</b> — 바퀴에 힘 전달 X (밀거나 견인)</span></div>
  <div class="row" data-k="D"><span class="key">D</span><span><b>주행</b> — 앞으로 갈 때</span></div>${extra}`;

/** 손이 홈(핸들) → 목표 → 홈 */
function visit(home: () => HandTarget, target: () => HandTarget, t: number, t0: number, t1: number, t2: number, t3: number) {
  if (t < t1) return reach(home, target, sseg(t, t0, t1));
  if (t < t2) return target;
  return reach(target, home, sseg(t, t2, t3));
}

export const gearSteps: Step[] = [
  {
    id: 'gear-lever',
    section: 3,
    title: '기어 ① 기어봉(레버식)',
    body: '가장 흔한 형태예요. <b>브레이크를 밟은 채</b> 손잡이 버튼을 누르고 앞뒤로 움직여 <b>P · R · N · D</b>를 고릅니다. 지금 기어는 레버 옆 표시와 <b>계기판</b>에서 확인해요.',
    facts: [
      { k: 'P', v: '주차' },
      { k: 'R', v: '후진' },
      { k: 'N', v: '중립' },
      { k: 'D', v: '주행' },
    ],
    tip: 'P와 R은 차가 완전히 멈춘 뒤에만 넣어요. 움직이는 중에 넣으면 변속기가 크게 상할 수 있어요.',
    env: 'park',
    mode: 'interior',
    duration: 14,
    inset: prndInset('기어 위치'),
    cam: [S(0, [-0.44, 1.26, 0.06], [0.38, 0.8, -0.18], 58), S(14, [-0.42, 1.26, 0.04], [0.38, 0.8, -0.18], 58)],
    enter(ctx) {
      engineRunning(ctx);
      brakeLabel(ctx);
      ctx.labels.add('knob', ctx.cockpit.anchors.lever, { text: '버튼 누른 채 이동', kind: 'info', dir: 'right', len: 36, visible: false });
      ctx.labels.add('gear', ctx.cockpit.anchors.clusterGear, { text: '', dir: 'up', len: 40 });
    },
    update(ctx, t, prev) {
      const c = ctx.cockpit;
      c.brake = track(t, [[0.4, 0], [1, 1]]);
      c.leverPos = track(t, [[2, 0], [2.8, 1], [5, 1], [5.8, 2], [8, 2], [8.8, 3], [11.6, 3], [12.8, 0]]);
      c.leverBtn = track(t, [[1.7, 0], [1.9, 1], [2.9, 1], [3.1, 0], [4.7, 0], [4.9, 1], [5.9, 1], [6.1, 0], [7.7, 0], [7.9, 1], [8.9, 1], [9.1, 0], [11.3, 0], [11.5, 1], [12.9, 1], [13.1, 0]]);
      const g = GEARS[Math.round(c.leverPos)];
      c.cluster.state.gear = g;
      for (const at of [2.8, 5.8, 8.8, 12.8]) if (crossed(prev, t, at)) ctx.sfx.click();
      const knob = grab(ctx, 'lever', [0.3, -0.62, -0.72], [0.1, 0.8, 0.6], 'grip', [0.0, -0.02, 0.0]);
      ctx.ghost.R = visit(wheelHand(ctx, 'R'), knob, t, 0.4, 1.6, 13.2, 14);
      ctx.ghost.L = wheelHand(ctx, 'L');
      ctx.ui.insetActive(g);
      ctx.labels.show('brake', c.brake > 0.5);
      ctx.labels.show('knob', c.leverBtn > 0.5);
      ctx.labels.set('gear', { text: `계기판: ${g}` });
    },
  },
  {
    id: 'gear-column',
    section: 3,
    title: '기어 ② 칼럼식',
    body: '핸들 오른쪽 뒤에 달린 레버로 기어를 바꿔요. <b>위로 올리면 R, 아래로 내리면 D</b>, 살짝만 움직이면 N. <b>P는 레버 끝 버튼</b>을 누릅니다. 손을 크게 움직이지 않아도 돼서 편해요.',
    facts: [
      { k: 'R', v: '위로' },
      { k: 'D', v: '아래로' },
      { k: 'P', v: '끝 버튼' },
      { k: '예', v: '벤츠, 현대 아이오닉 5·그랜저 등' },
    ],
    tip: '차종에 따라 레버 끝을 돌리는 방식도 있어요. 처음 타는 차라면 계기판의 기어 표시를 꼭 확인하세요.',
    env: 'park',
    mode: 'interior',
    duration: 14,
    inset: `<h3>칼럼식 레버</h3>
      <div class="row" data-k="R"><span class="key">↑ 위로</span><span><b>R</b> 후진</span></div>
      <div class="row" data-k="N"><span class="key">↕ 살짝</span><span><b>N</b> 중립</span></div>
      <div class="row" data-k="D"><span class="key">↓ 아래로</span><span><b>D</b> 주행</span></div>
      <div class="row" data-k="P"><span class="key">끝 버튼</span><span><b>P</b> 주차</span></div>
      <div class="note">레버는 움직인 뒤 가운데로 돌아와요. 기어는 계기판 표시로 확인!</div>`,
    cam: [S(0, [-0.14, 1.16, 0.12], [0.33, 0.93, -0.22], 46), S(14, [-0.12, 1.16, 0.1], [0.33, 0.93, -0.22], 46)],
    enter(ctx) {
      engineRunning(ctx);
      ctx.cockpit.gearType = 'column';
      brakeLabel(ctx);
      ctx.labels.add('lever', ctx.cockpit.anchors.colGear, { text: '', kind: 'info', dir: 'right', len: 40, visible: false });
      ctx.labels.add('gear', ctx.cockpit.anchors.clusterGear, { text: '', dir: 'up', len: 40 });
    },
    update(ctx, t, prev) {
      const c = ctx.cockpit;
      c.brake = track(t, [[0.4, 0], [1, 1]]);
      c.colGearV = track(t, [[1.8, 0], [2.2, 1], [2.8, 1], [3.1, 0], [5.8, 0], [6.2, -1], [6.8, -1], [7.1, 0], [8.8, 0], [9.1, 0.5], [9.6, 0.5], [9.9, 0]]);
      c.colGearBtn = track(t, [[11.3, 0], [11.5, 1], [11.9, 0]]);
      const g = pick<Gear>(t, [[0, 'P'], [2.2, 'R'], [6.2, 'D'], [9.1, 'N'], [11.5, 'P']]);
      c.cluster.state.gear = g;
      for (const at of [2.2, 6.2, 9.1, 11.5]) if (crossed(prev, t, at)) ctx.sfx.click();
      const tip = grab(ctx, 'colGear', [0.35, -0.1, -0.93], [0, 1, 0], 'pinch', [0.0, 0.0, 0.0]);
      ctx.ghost.R = visit(wheelHand(ctx, 'R'), tip, t, 0.4, 1.5, 12.4, 13.4);
      ctx.ghost.L = wheelHand(ctx, 'L');
      const phase = t > 11.2 ? 'P' : t > 8.6 ? 'N' : t > 5.6 ? 'D' : t > 1.6 ? 'R' : null;
      ctx.ui.insetActive(phase);
      const txt: Record<string, string> = { R: '위로 → R', D: '아래로 → D', N: '살짝 → N', P: '끝 버튼 → P' };
      ctx.labels.set('lever', { visible: !!phase, text: phase ? txt[phase] : '' });
      ctx.labels.show('brake', c.brake > 0.5);
      ctx.labels.set('gear', { text: `계기판: ${g}` });
    },
  },
  {
    id: 'gear-dial',
    section: 3,
    title: '기어 ③ 다이얼식',
    body: '센터 콘솔의 <b>둥근 다이얼</b>을 돌려 기어를 바꿔요. <b>왼쪽으로 돌리면 R, 오른쪽으로 돌리면 D</b>, 가운데가 N. <b>P는 따로 있는 P 버튼</b>을 누릅니다.',
    facts: [
      { k: 'R', v: '왼쪽으로' },
      { k: 'D', v: '오른쪽으로' },
      { k: 'P', v: 'P 버튼' },
      { k: '예', v: '기아 쏘렌토·스포티지·K8 등' },
    ],
    tip: '어떤 방식이든 기어를 바꿀 땐 브레이크를 밟은 상태여야 해요. 안 밟으면 기어가 움직이지 않거나 경고가 떠요.',
    env: 'park',
    mode: 'interior',
    duration: 13,
    inset: `<h3>다이얼</h3>
      <div class="row" data-k="R"><span class="key">↺ 왼쪽</span><span><b>R</b> 후진</span></div>
      <div class="row" data-k="N"><span class="key">가운데</span><span><b>N</b> 중립</span></div>
      <div class="row" data-k="D"><span class="key">↻ 오른쪽</span><span><b>D</b> 주행</span></div>
      <div class="row" data-k="P"><span class="key">P 버튼</span><span><b>P</b> 주차</span></div>`,
    cam: [S(0, [-0.22, 1.08, 0.2], [0.32, 0.64, 0.0], 44), S(13, [-0.2, 1.08, 0.18], [0.32, 0.64, 0.0], 44)],
    enter(ctx) {
      engineRunning(ctx);
      ctx.cockpit.gearType = 'dial';
      brakeLabel(ctx);
      ctx.labels.add('dial', ctx.cockpit.anchors.dial, { text: '', kind: 'info', dir: 'right', len: 50, visible: false });
      ctx.labels.add('pbtn', ctx.cockpit.anchors.dialP, { text: 'P 버튼', dir: 'up', len: 40, visible: false });
      ctx.labels.add('gear', ctx.cockpit.anchors.clusterGear, { text: '', dir: 'up', len: 40 });
    },
    update(ctx, t, prev) {
      const c = ctx.cockpit;
      c.brake = track(t, [[0.4, 0], [1, 1]]);
      c.dialPos = track(t, [[1.8, 0], [2.3, -1], [4.6, -1], [5.1, 0], [7.2, 0], [7.7, 1], [9.8, 1], [10.6, 0]]);
      c.dialPBtn = track(t, [[10.4, 0], [10.6, 1], [10.9, 0]]);
      const g = pick<Gear>(t, [[0, 'P'], [2.3, 'R'], [5.1, 'N'], [7.7, 'D'], [10.6, 'P']]);
      c.cluster.state.gear = g;
      for (const at of [2.3, 5.1, 7.7, 10.6]) if (crossed(prev, t, at)) ctx.sfx.click();
      const knob = (): HandTarget => {
        const a = -c.dialPos * 0.7;
        const rot = (v: THREE.Vector3) => v.applyAxisAngle(V(0, 1, 0), a);
        const top = local(ctx, c.anchors.dial);
        const finger = rot(V(0.62, -0.78, 0)).normalize();
        return { pos: top.addScaledVector(finger, -0.07).add(V(-0.01, 0.01, 0)), finger, back: rot(V(0.78, 0.62, 0)), pose: 'grip' };
      };
      const pbtn = grab(ctx, 'dialP', [0.5, -0.85, 0.05], [0.85, 0.5, 0], 'point');
      const home = wheelHand(ctx, 'R');
      ctx.ghost.R = t < 9.8 ? visit(home, knob, t, 0.4, 1.6, 99, 100) : t < 11.6 ? reach(knob, pbtn, sseg(t, 9.8, 10.4)) : reach(pbtn, home, sseg(t, 11.6, 12.6));
      ctx.ghost.L = wheelHand(ctx, 'L');
      const phase = t > 10.4 ? 'P' : t > 7.5 ? 'D' : t > 4.9 ? 'N' : t > 2.1 ? 'R' : null;
      ctx.ui.insetActive(phase);
      const txt: Record<string, string> = { R: '왼쪽으로 → R', N: '가운데 → N', D: '오른쪽으로 → D' };
      ctx.labels.set('dial', { visible: !!phase && phase !== 'P', text: phase ? txt[phase] ?? '' : '' });
      ctx.labels.show('pbtn', t > 9.6 && t < 12);
      ctx.labels.show('brake', c.brake > 0.5);
      ctx.labels.set('gear', { text: `계기판: ${g}` });
    },
  },
  {
    id: 'epb',
    section: 3,
    title: '전자식 파킹 브레이크 (EPB)',
    body: '요즘 차는 손으로 당기는 사이드 브레이크 대신 <b>(P) 스위치</b>가 있어요. 스위치를 <b>위로 당기면 체결</b>, <b>브레이크를 밟은 채 누르면 해제</b>됩니다. 계기판의 빨간 <b>(P)</b> 표시로 상태를 확인하세요.',
    facts: [
      { k: '체결', v: '스위치 당기기' },
      { k: '해제', v: '브레이크 + 스위치 누르기' },
      { k: '표시', v: '계기판 빨간 (P)' },
    ],
    env: 'park',
    mode: 'interior',
    duration: 13,
    inset: `<h3>EPB 스위치</h3>
      <div class="row red" data-k="on"><span class="key">↑ 당기기</span><span><b>체결</b> — 계기판 (P) 켜짐</span></div>
      <div class="row green" data-k="off"><span class="key">↓ 누르기</span><span><b>해제</b> — 브레이크를 밟은 채로</span></div>
      <div class="note">‘윙—’ 하는 모터 소리는 뒷바퀴 브레이크가 조이고 풀리는 소리예요. 정상입니다.</div>`,
    cam: [S(0, [-0.34, 1.22, 0.06], [0.33, 0.77, -0.16], 58), S(13, [-0.32, 1.22, 0.04], [0.33, 0.77, -0.16], 58)],
    enter(ctx) {
      engineRunning(ctx);
      brakeLabel(ctx);
      ctx.labels.add('sw', ctx.cockpit.anchors.epb, { text: '(P) 스위치', kind: 'info', dir: 'left', len: 46, visible: false });
      ctx.labels.add('p', ctx.cockpit.anchors.clusterP, { text: '', dir: 'up', len: 46 });
    },
    update(ctx, t, prev) {
      const c = ctx.cockpit;
      const s = c.cluster.state;
      c.brake = track(t, [[2, 0], [2.6, 1], [6, 1], [6.5, 0]]);
      c.epbSwitch = track(t, [[3.9, 0], [4.1, -1], [4.5, -1], [4.7, 0], [8.4, 0], [8.6, 1], [9, 1], [9.2, 0]]);
      s.epb = t < 4.8 || t > 9.1;
      if (crossed(prev, t, 4.15) || crossed(prev, t, 8.6)) {
        ctx.sfx.click();
        ctx.sfx.motor();
      }
      if (crossed(prev, t, 4.8)) ctx.ui.toast('해제', 'ok');
      if (crossed(prev, t, 9.1)) ctx.ui.toast('체결', 'warn');
      const press = grab(ctx, 'epb', [0.55, -0.83, 0.05], [0.83, 0.55, 0], 'press', [0.01, 0.0, 0]);
      const pull = grab(ctx, 'epb', [0.75, -0.3, 0.2], [0.3, 0.95, 0], 'pinch', [0.03, -0.012, 0]);
      const home = wheelHand(ctx, 'R');
      ctx.ghost.R = t < 6 ? visit(home, press, t, 2.6, 3.7, 5, 6) : visit(home, pull, t, 6.8, 8.1, 9.6, 10.6);
      ctx.ghost.L = wheelHand(ctx, 'L');
      ctx.labels.show('sw', t > 2.2 && t < 10);
      ctx.labels.set('p', { text: s.epb ? '(P) 켜짐 = 체결' : '(P) 꺼짐 = 해제', kind: s.epb ? 'warn' : 'ok' });
      ctx.labels.show('brake', c.brake > 0.5);
      ctx.ui.insetActive(t > 3.9 && t < 6.5 ? 'off' : t > 8.4 ? 'on' : null);
    },
  },
  {
    id: 'epb-auto',
    section: 3,
    title: 'D로 바꾸면 알아서 풀려요',
    body: 'EPB 차량은 <b>안전벨트를 매고 문을 닫은 상태</b>에서 <b>브레이크를 밟고 P → D(또는 R)</b>로 바꾸면 파킹 브레이크가 자동으로 풀립니다. 차종에 따라 가속 페달을 밟을 때 풀리기도 해요. 반대로 <b>P에 넣거나 시동을 끄면</b> 자동으로 걸리는 차가 많아요.',
    facts: [
      { k: '조건', v: '시동 · 벨트 · 문 닫힘 · 브레이크' },
      { k: '자동 해제', v: 'P → D / R' },
      { k: '자동 체결', v: 'P 또는 시동 OFF' },
    ],
    env: 'park',
    mode: 'interior',
    duration: 14,
    inset: `<h3>자동 해제 조건</h3>${rows([
      ['belt', '✓', '운전석 <b>안전벨트</b> 착용'],
      ['door', '✓', '<b>문</b> 모두 닫힘'],
      ['brake', '✓', '<b>브레이크</b> 밟기'],
      ['shift', '✓', '<b>P → D</b> (또는 R)'],
    ])}`,
    cam: [S(0, [-0.38, 1.23, -0.04], [0.4, 0.8, -0.2], 56), S(14, [-0.36, 1.23, -0.04], [0.4, 0.8, -0.2], 56)],
    enter(ctx) {
      engineRunning(ctx);
      ctx.labels.add('p', ctx.cockpit.anchors.clusterP, { text: '', dir: 'up', len: 46 });
      brakeLabel(ctx);
    },
    update(ctx, t, prev) {
      const c = ctx.cockpit;
      const s = c.cluster.state;
      c.brake = track(t, [[2.2, 0], [2.8, 1]]);
      c.leverPos = track(t, [[4.2, 0], [6, 3], [9.4, 3], [11, 0]]);
      c.leverBtn = track(t, [[3.9, 0], [4.1, 1], [6.1, 1], [6.3, 0], [9.2, 0], [9.4, 1], [11.1, 1], [11.3, 0]]);
      s.gear = GEARS[Math.round(c.leverPos)];
      s.epb = t < 6.2 || t > 11.2;
      if (crossed(prev, t, 6.2)) {
        ctx.sfx.motor();
        ctx.ui.toast('자동 해제!', 'ok');
      }
      if (crossed(prev, t, 11.2)) {
        ctx.sfx.motor();
        ctx.ui.toast('P → 자동 체결', 'warn');
      }
      const knob = grab(ctx, 'lever', [0.3, -0.62, -0.72], [0.1, 0.8, 0.6], 'grip', [0, -0.02, 0]);
      ctx.ghost.R = visit(wheelHand(ctx, 'R'), knob, t, 2.8, 3.9, 11.6, 12.6);
      ctx.ghost.L = wheelHand(ctx, 'L');
      const done = [t > 0.8 && 'belt', t > 1.6 && 'door', t > 2.8 && 'brake', t > 6 && 'shift'].filter(Boolean) as string[];
      ctx.ui.insetActive(done, 'done');
      ctx.ui.insetActive(t > 3.9 && t < 6.2 ? 'shift' : null, 'on');
      ctx.labels.set('p', { text: s.epb ? '(P) 체결' : '(P) 꺼짐 — 자동으로 풀림', kind: s.epb ? 'warn' : 'ok' });
      ctx.labels.show('brake', c.brake > 0.5);
    },
  },
  {
    id: 'handbrake',
    section: 3,
    title: '사이드 브레이크가 손잡이식이라면',
    body: '전자식이 아닌 차는 순서를 지켜요. <b>① 브레이크 밟기 → ② 사이드 브레이크 풀기 → ③ 기어 변경</b>. 손잡이식은 살짝 위로 당기면서 <b>끝의 버튼을 누른 채</b> 내리고, 발로 밟는 풋 파킹은 한 번 더 밟으면(또는 레버를 당기면) 풀립니다.',
    facts: [
      { k: '순서', v: '브레이크 → 사이드 해제 → 기어' },
      { k: '확인', v: '계기판 빨간 (!) 꺼짐' },
    ],
    tip: '사이드를 채운 채 출발하면 차가 무겁게 움직이고 브레이크가 과열돼요. 출발 전 계기판 표시를 꼭 확인하세요.',
    env: 'park',
    mode: 'interior',
    duration: 15,
    inset: `<h3>출발 순서</h3>${rows([
      ['1', '1', '<b>브레이크</b> 밟기'],
      ['2', '2', '<b>사이드 브레이크</b> 풀기 (버튼 누르고 내림)'],
      ['3', '3', '<b>기어</b> P → D'],
    ])}`,
    cam: [S(0, [-0.52, 1.26, 0.26], [0.12, 0.64, -0.06], 50), S(15, [-0.5, 1.26, 0.24], [0.14, 0.66, -0.08], 50)],
    enter(ctx) {
      engineRunning(ctx);
      const c = ctx.cockpit;
      c.mechanical = true;
      c.cluster.state.epb = false;
      ctx.labels.add('hb', c.anchors.handbrake, { text: '버튼 누른 채 내리기', kind: 'info', dir: 'right', len: 40, visible: false });
      ctx.labels.add('warn', c.anchors.handbrake, { text: '', dir: 'left', len: 60, visible: false });
    },
    update(ctx, t, prev) {
      const c = ctx.cockpit;
      const s = c.cluster.state;
      c.brake = track(t, [[1, 0], [1.6, 1]]);
      c.handbrake = track(t, [[4.4, 1], [4.8, 1.1], [5.2, 1.1], [6.4, 0]]);
      c.handbrakeBtn = track(t, [[4.5, 0], [4.7, 1], [6.4, 1], [6.6, 0]]);
      c.leverPos = track(t, [[8.8, 0], [10.4, 3]]);
      c.leverBtn = track(t, [[8.5, 0], [8.7, 1], [10.5, 1], [10.7, 0]]);
      s.gear = GEARS[Math.round(c.leverPos)];
      s.epb = false;
      s.warnings = c.handbrake > 0.3 ? ['brake'] : [];
      if (crossed(prev, t, 4.7)) ctx.sfx.click();
      const hb = grab(ctx, 'handbrake', [0.1, -0.8, -0.58], [0, 0.6, -0.8], 'grip', [0.02, 0.0, 0]);
      const knob = grab(ctx, 'lever', [0.3, -0.62, -0.72], [0.1, 0.8, 0.6], 'grip', [0, -0.02, 0]);
      const home = wheelHand(ctx, 'R');
      ctx.ghost.R = t < 7 ? visit(home, hb, t, 2.6, 4, 99, 100) : t < 11 ? reach(hb, knob, sseg(t, 7, 8.3)) : reach(knob, home, sseg(t, 11, 12));
      ctx.ghost.L = wheelHand(ctx, 'L');
      const step = t > 8.5 ? '3' : t > 3.8 ? '2' : t > 1 ? '1' : null;
      ctx.ui.insetActive(step);
      ctx.ui.insetActive([t > 1.6 && '1', t > 6.4 && '2', t > 10.4 && '3'].filter(Boolean) as string[], 'done');
      ctx.labels.show('hb', t > 4.4 && t < 6.6);
      ctx.labels.set('warn', { visible: t > 1.5, text: s.warnings.length ? '계기판 (!) 켜짐 = 체결 중' : '(!) 꺼짐 → 출발 OK', kind: s.warnings.length ? 'warn' : 'ok' });
    },
  },
  {
    id: 'autohold',
    section: 3,
    title: '오토홀드 (AUTO HOLD)',
    body: '<b>AUTO HOLD 버튼</b>을 누르면 계기판에 흰색 표시가 켜져요(대기). 차가 멈춘 뒤 <b>브레이크에서 발을 떼도 초록색으로 바뀌며 그대로 서 있어요</b>. 그래서 신호 대기 중 <b>기어를 N으로 옮기거나 브레이크를 계속 밟고 있을 필요가 없어요</b>. 가속 페달을 밟으면 자동으로 풀립니다.',
    facts: [
      { k: '흰색', v: '대기' },
      { k: '초록', v: '작동 — 정지 유지' },
      { k: '해제', v: '가속 페달' },
    ],
    tip: '오토홀드는 시동을 끄면 함께 꺼지는 차가 많아요. 필요하면 시동 걸 때마다 버튼을 눌러 켜 주세요.',
    env: 'park',
    mode: 'interior',
    duration: 15,
    inset: `<h3>신호 대기 상황</h3>
      <svg viewBox="0 0 320 112" width="100%">
        <rect x="0" y="38" width="320" height="58" fill="#5b5f66" rx="4"/>
        <line x1="0" y1="67" x2="320" y2="67" stroke="#fff" stroke-width="2" stroke-dasharray="12 10"/>
        <rect x="236" y="40" width="5" height="54" fill="#fff"/>
        <rect x="270" y="0" width="20" height="40" rx="5" fill="#1b1f26"/>
        <circle id="tl-r" cx="280" cy="10" r="6" fill="#ff4438"/>
        <circle cx="280" cy="21" r="6" fill="#3a3f47"/>
        <circle id="tl-g" cx="280" cy="32" r="6" fill="#2a3a2f"/>
        <g id="ah-car" transform="translate(40 0)">
          <rect x="0" y="70" width="52" height="22" rx="7" fill="#2f6fe0"/>
          <rect x="12" y="73" width="22" height="16" rx="4" fill="#0c131c"/>
        </g>
      </svg>
      <div class="row" data-k="pedal"><span class="key" id="ah-pedal">—</span><span id="ah-pedal-t">주행 중</span></div>
      <div class="row" data-k="lamp"><span class="key" id="ah-lamp" style="background:#1b2029">AUTO HOLD</span><span id="ah-lamp-t">꺼짐</span></div>`,
    cam: [S(0, [-0.3, 1.2, -0.02], [0.18, 0.66, 0.06], 48), S(2.2, [-0.22, 1.14, -0.38], [0.55, 0.96, -0.36], 40), S(15, [-0.22, 1.14, -0.38], [0.55, 0.96, -0.36], 40)],
    enter(ctx) {
      engineRunning(ctx, 'D');
      ctx.cockpit.cluster.state.epb = false;
      ctx.labels.add('btn', ctx.cockpit.anchors.autohold, { text: 'AUTO HOLD 버튼', kind: 'info', dir: 'right', len: 40, visible: false });
      ctx.labels.add('ah', ctx.cockpit.anchors.clusterAH, { text: '', dir: 'up', len: 46, visible: false });
    },
    update(ctx, t, prev) {
      const c = ctx.cockpit;
      const s = c.cluster.state;
      c.autoHoldBtn = track(t, [[0.9, 0], [1.1, 1], [1.4, 0]]);
      if (crossed(prev, t, 1.1)) ctx.sfx.click();
      const speed = track(t, [[0, 30], [2, 30], [5, 0], [10.8, 0], [14, 22]], (x) => x);
      s.speed = speed;
      s.rpm = 0.8 + speed / 25;
      c.brake = track(t, [[2.4, 0], [3, 0.7], [6, 0.7], [6.3, 0]]);
      c.accel = track(t, [[10.6, 0], [11, 0.5]]);
      s.autoHold = t < 1.1 ? 'off' : t > 5 && t < 10.8 ? 'active' : 'standby';
      if (crossed(prev, t, 5)) ctx.sfx.chime();
      ctx.ghost.R = visit(wheelHand(ctx, 'R'), grab(ctx, 'autohold', [0.55, -0.83, 0.05], [0.83, 0.55, 0], 'point'), t, 0, 0.9, 1.4, 2.2);
      ctx.ghost.L = wheelHand(ctx, 'L');
      // 인셋 애니메이션
      const x = track(t, [[0, 20], [5, 178], [10.8, 178], [14, 360]], (k) => k * (2 - k));
      ctx.ui.insetQuery('#ah-car')?.setAttribute('transform', `translate(${x.toFixed(1)} 0)`);
      const green = t > 10;
      ctx.ui.insetQuery('#tl-r')?.setAttribute('fill', green ? '#3a2a2a' : '#ff4438');
      ctx.ui.insetQuery('#tl-g')?.setAttribute('fill', green ? '#35d07a' : '#2a3a2f');
      const pedal = c.accel > 0.2 ? ['가속', '가속 페달 → 오토홀드 해제, 출발'] : c.brake > 0.2 ? ['브레이크', t > 5 ? '멈춤 → 이제 발을 떼도 돼요' : '감속해서 정지'] : t > 6.2 && t < 10.8 ? ['발 뗌', '<b>발을 떼도 정지 유지!</b> (N 필요 없음)'] : ['—', t < 2 ? '주행 중' : '…'];
      const pk = ctx.ui.insetQuery('#ah-pedal');
      if (pk) pk.textContent = pedal[0];
      const pt = ctx.ui.insetQuery('#ah-pedal-t');
      if (pt) pt.innerHTML = pedal[1];
      const lamp = ctx.ui.insetQuery('#ah-lamp');
      if (lamp) lamp.style.background = s.autoHold === 'active' ? '#15924a' : s.autoHold === 'standby' ? '#e9eef5' : '#1b2029';
      if (lamp) lamp.style.color = s.autoHold === 'standby' ? '#141820' : '#ffffff';
      const lt = ctx.ui.insetQuery('#ah-lamp-t');
      if (lt) lt.textContent = s.autoHold === 'active' ? '초록 — 작동 중 (정지 유지)' : s.autoHold === 'standby' ? '흰색 — 대기' : '꺼짐';
      ctx.ui.insetActive(t > 6.2 && t < 10.8 ? ['pedal', 'lamp'] : s.autoHold === 'active' ? 'lamp' : null);
      ctx.labels.show('btn', t > 0.3 && t < 2.2);
      ctx.labels.set('ah', {
        visible: t > 1.4,
        text: s.autoHold === 'active' ? '초록 = 정지 유지 중' : '흰색 = 대기',
        kind: s.autoHold === 'active' ? 'ok' : '',
      });
    },
  },
  {
    id: 'autohold-parking',
    section: 3,
    title: '주차할 땐 오토홀드 끄기',
    body: '주차처럼 <b>조금 움직이고 멈추기</b>를 반복할 땐, 오토홀드가 멈출 때마다 브레이크를 꽉 잡아 <b>차가 울컥거리고</b>, 다시 움직이려고 가속 페달을 더 세게 밟게 돼 위험해요. 주차 전엔 <b>오토홀드를 끄고</b> 브레이크 발 힘으로 속도를 섬세하게 조절하세요.',
    facts: [
      { k: '주차 전', v: 'AUTO HOLD OFF' },
      { k: '속도 조절', v: '브레이크를 살살 떼며' },
    ],
    env: 'park',
    mode: 'exterior',
    duration: 18,
    inset: `<h3>같은 후진 주차, 다른 느낌</h3>
      <div class="row red" data-k="on"><span class="key" style="background:#e5352b">ON</span><span>멈출 때마다 꽉 → <b>울컥</b>, 출발할 때 덜컥</span></div>
      <div class="row green" data-k="off"><span class="key" style="background:#15924a">OFF</span><span>브레이크로 <b>부드럽게</b> 천천히</span></div>`,
    cam: [S(0, [8.4, 5.6, 2.4], [2.6, 0, -4.4], 44), S(18, [8.0, 5.8, 2.0], [2.4, 0, -4.2], 44)],
    enter(ctx) {
      const path = new DrivePath({ x: 0, z: -2.5, h: 0 }, [{ type: 'line', d: 2.4 }, ...quarterTurn(1, 4.5)]);
      ctx.car.root.userData = { path, steer: 0 };
      ctx.car.lights.drl = true;
      ctx.labels.add('mode', () => ctx.car.root.position.clone().add(V(0, 1.6, 0)), { text: '', big: true, len: 30 });
      ctx.labels.add('jolt', () => ctx.car.root.position.clone().add(V(-1.4, 1.0, 0)), { text: '울컥!', kind: 'warn', dir: 'left', len: 30, visible: false });
    },
    update(ctx, t, prev, dt) {
      const d = ctx.car.root.userData as { path: DrivePath; steer: number };
      const stops = [1.6, 3.2, 4.8, 6.4, 8.0];
      let p: number;
      if (t < 9) {
        p = track(t, [[0.5, 0], [1.6, 0.2], [2.1, 0.2], [3.2, 0.42], [3.7, 0.42], [4.8, 0.64], [5.3, 0.64], [6.4, 0.85], [6.9, 0.85], [8, 1]], (x) => x * x);
      } else {
        p = sseg(t, 9.6, 17.2);
      }
      const s = d.path.length * (1 - p);
      const pose = d.path.sample(s);
      ctx.car.setPose(pose.x, pose.z, pose.h);
      d.steer = dt > 0 ? lerp(d.steer, pose.steer, 1 - Math.exp(-dt * 6)) : pose.steer;
      ctx.car.setSteer(d.steer);
      ctx.car.setRoll(s);
      let pitch = 0;
      let jolt = false;
      for (const st of stops) {
        const tau = t - st;
        if (t < 9 && tau > 0 && tau < 0.8) {
          pitch += 0.03 * Math.exp(-5 * tau) * Math.cos(16 * tau);
          jolt = jolt || tau < 0.55;
        }
        if (crossed(prev, t, st)) ctx.sfx.thud();
      }
      ctx.car.setPitch(pitch);
      const run1 = t < 9;
      const moving = run1 ? !stops.some((st) => t > st && t < st + 0.5) && t > 0.5 && t < 8 : t > 9.6 && t < 17.2;
      ctx.car.lights.reverse = moving;
      ctx.car.lights.brake = run1 ? jolt : t > 16.6;
      if (crossed(prev, t, 8.6)) ctx.ui.toast('이번엔 오토홀드를 끄고', 'ok');
      ctx.labels.set('mode', {
        text: run1 ? 'AUTO HOLD ON' : 'AUTO HOLD OFF',
        sub: run1 ? '멈출 때마다 꽉 잡음' : '브레이크로 부드럽게',
        kind: run1 ? 'warn' : 'ok',
      });
      ctx.labels.show('jolt', jolt);
      ctx.ui.insetActive(run1 ? 'on' : 'off');
    },
  },
];
