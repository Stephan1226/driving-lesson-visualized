import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { TIRE_R } from './Wheel';

/**
 * 차체 형상 — 차 길이 방향(X)으로 단면을 이어 붙이는(로프트) 방식.
 * 모든 치수는 차량 로컬 좌표(+X 전방, +Y 위, +Z 오른쪽), 단위 m.
 */
export const XF = 2.34; // 앞 끝(범퍼 곡면 시작)
export const XR = -2.32; // 뒤 끝
export const AXLE_F = 1.38;
export const AXLE_R = -1.37;
export const ARCH_R = 0.405;
export const COWL_X = 1.12; // 앞유리 아래 끝
export const DECK_X = -1.72; // 뒷유리 아래 끝
/** 앞문 범위 */
export const DOOR = { x0: -0.38, x1: 0.985 };
export const B_PILLAR: [number, number] = [-0.43, -0.33];

/** Fritsch–Carlson 단조 3차 보간 (오버슈트 없는 부드러운 곡선) */
function monotone(keys: [number, number][]) {
  const xs = keys.map((k) => k[0]);
  const ys = keys.map((k) => k[1]);
  const n = xs.length;
  const d: number[] = [];
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  const m: number[] = [d[0]];
  for (let i = 1; i < n - 1; i++) m.push(d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2);
  m.push(d[n - 2]);
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) {
      m[i] = m[i + 1] = 0;
      continue;
    }
    const a = m[i] / d[i];
    const b = m[i + 1] / d[i];
    const s = a * a + b * b;
    if (s > 9) {
      const t = 3 / Math.sqrt(s);
      m[i] = t * a * d[i];
      m[i + 1] = t * b * d[i];
    }
  }
  return (x: number) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0;
    while (x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i];
    const t = (x - xs[i]) / h;
    const t2 = t * t;
    const t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
  };
}

/** 하부 차체의 윗선(트렁크 → 벨트라인 → 보닛) */
export const yTop = monotone([
  [XR, 0.9], [-2.27, 0.955], [-2.15, 0.99], [DECK_X, 1.0], [COWL_X, 0.975], [1.35, 0.952], [1.75, 0.905], [2.1, 0.852], [2.27, 0.808], [XF, 0.77],
]);
/** 하부 차체의 바닥선 */
export const yBot = monotone([
  [XR, 0.37], [-2.24, 0.315], [-1.9, 0.29], [-0.9, 0.27], [0.9, 0.27], [1.9, 0.29], [2.22, 0.315], [XF, 0.37],
]);
/** 평면에서 본 반폭 (앞뒤 모서리가 둥글게 줄어듦) */
export const halfW = monotone([
  [XR, 0.79], [-2.22, 0.855], [-2.02, 0.9], [-1.72, 0.92], [1.6, 0.92], [1.9, 0.905], [2.1, 0.87], [2.25, 0.82], [XF, 0.765],
]);

const sm = (t: number) => {
  t = Math.min(1, Math.max(0, t));
  return t * t * (3 - 2 * t);
};
/** 높이 비율 u(0 = 바닥, 1 = 윗선)에 따른 옆면 볼륨: 아래로 말려 들어가고, 어깨에서 가장 넓고, 위로 둥글게 */
export function fU(u: number) {
  return 1 - 0.07 * sm(1 - u / 0.17) - 0.034 * Math.pow(sm((u - 0.8) / 0.2), 1.5) + 0.004 * Math.exp(-(((u - 0.72) / 0.011) ** 2));
}
const U_SAMPLES = [0, 0.025, 0.06, 0.11, 0.17, 0.25, 0.33, 0.42, 0.5, 0.58, 0.64, 0.68, 0.7, 0.71, 0.716, 0.72, 0.724, 0.73, 0.745, 0.77, 0.81, 0.86, 0.9, 0.94, 0.97, 1];

export function archY(x: number) {
  for (const ax of [AXLE_F, AXLE_R]) {
    const d = x - ax;
    if (Math.abs(d) < ARCH_R) return TIRE_R + Math.sqrt(ARCH_R * ARCH_R - d * d);
  }
  return -Infinity;
}

/** 하부 차체 옆면 위의 점 (side = +1 오른쪽, -1 왼쪽) */
export function sidePt(x: number, u: number, side: number, clampArch = true) {
  const yb = yBot(x);
  let y = yb + (yTop(x) - yb) * u;
  if (clampArch) y = Math.max(y, archY(x));
  return new THREE.Vector3(x, y, halfW(x) * fU(u) * side);
}
/** u에 해당하는 높이 */
export const yAt = (x: number, u: number) => yBot(x) + (yTop(x) - yBot(x)) * u;

// ── 캐빈(유리·지붕) 옆모습 ──────────────────────────────
const roofCurves = [
  new THREE.QuadraticBezierCurve(new THREE.Vector2(DECK_X, 1.0), new THREE.Vector2(-1.32, 1.27), new THREE.Vector2(-1.02, 1.41)),
  new THREE.QuadraticBezierCurve(new THREE.Vector2(-1.02, 1.41), new THREE.Vector2(-0.4, 1.475), new THREE.Vector2(0.3, 1.455)),
  new THREE.QuadraticBezierCurve(new THREE.Vector2(0.3, 1.455), new THREE.Vector2(0.76, 1.23), new THREE.Vector2(COWL_X, 0.975)),
];
const roofTable: [number, number][] = [];
for (const c of roofCurves) for (const p of c.getPoints(60)) roofTable.push([p.x, p.y]);
roofTable.sort((a, b) => a[0] - b[0]);
export function roofY(x: number) {
  if (x <= roofTable[0][0]) return roofTable[0][1];
  for (let i = 1; i < roofTable.length; i++) {
    if (x <= roofTable[i][0]) {
      const [x0, y0] = roofTable[i - 1];
      const [x1, y1] = roofTable[i];
      return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0 || 1);
    }
  }
  return roofTable[roofTable.length - 1][1];
}
export const TUMBLE = 0.3; // 캐빈 옆면이 위로 갈수록 안쪽으로 기우는 정도
/** 캐빈 벨트라인에서의 반폭 */
export const beltW = (x: number) => halfW(x) * fU(1) - 0.035;
/** 캐빈 옆면(유리)의 높이 y에서 반폭 */
export const cabinW = (x: number, y: number) => beltW(x) - TUMBLE * Math.max(0, y - yTop(x));

/** 캐빈 단면: 오른쪽 벨트 → 지붕 → 왼쪽 벨트 (41점, 인덱스 0..40) */
export const GH_N = 41;
export function cabinRing(x: number) {
  const belt = yTop(x);
  const h = Math.max(0.0005, roofY(x) - belt);
  const wb = beltW(x);
  const wt = wb - TUMBLE * h;
  const crown = 0.026 * Math.min(1, h / 0.35);
  const half: [number, number][] = [
    [wb, belt],
    [wb - TUMBLE * h * 0.5, belt + h * 0.5],
    [wb - TUMBLE * h * 0.86, belt + h * 0.86],
    [wt * 0.9, belt + h * 0.985 + crown * 0.4],
    [wt * 0.48, belt + h + crown * 0.85],
    [0, belt + h + crown],
  ];
  const ctrl = [...half, ...half.slice(0, 5).reverse().map(([z, y]) => [-z, y] as [number, number])];
  const curve = new THREE.CatmullRomCurve3(ctrl.map(([z, y]) => new THREE.Vector3(x, y, z)), false, 'catmullrom', 0.5);
  return curve.getPoints(GH_N - 1);
}
/** 캐빈 단면 인덱스 구간: 옆(0..8), 모서리(8..12), 위(12..28) */
export const GH = { side: 8, corner: 12, top: 28 };

// ── 공용 로프트 ────────────────────────────────────────
function stationList(x0: number, x1: number, step: number, dense: [number, number][] = [], denseStep = step, extra: number[] = []) {
  const set = new Set<number>();
  for (const x of extra) if (x > x0 && x < x1) set.add(x);
  for (let x = x0; x < x1; x += step) set.add(+x.toFixed(4));
  for (const [a, b] of dense) for (let x = Math.max(a, x0); x < Math.min(b, x1); x += denseStep) set.add(+x.toFixed(4));
  set.add(x1);
  return [...set].sort((a, b) => a - b);
}

/** 단면 배열을 이어 메시로. 바깥쪽 방향이 자동으로 맞춰진다 */
export function loft(rings: THREE.Vector3[][], opts: { closeRing?: boolean; group?: (i: number, j: number) => number; uv?: boolean } = {}) {
  const nr = rings.length;
  const np = rings[0].length;
  const pos = new Float32Array(nr * np * 3);
  const uvs = new Float32Array(nr * np * 2);
  rings.forEach((r, i) =>
    r.forEach((p, j) => {
      pos.set([p.x, p.y, p.z], (i * np + j) * 3);
      uvs.set([j / (np - 1), i / (nr - 1)], (i * np + j) * 2);
    }),
  );
  const groups = new Map<number, number[]>();
  const jMax = opts.closeRing ? np : np - 1;
  for (let i = 0; i < nr - 1; i++) {
    for (let j = 0; j < jMax; j++) {
      const j2 = (j + 1) % np;
      const a = i * np + j;
      const b = (i + 1) * np + j;
      const c = (i + 1) * np + j2;
      const d = i * np + j2;
      const g = opts.group ? opts.group(i, j) : 0;
      if (g < 0) continue;
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g)!.push(a, d, b, b, d, c);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  if (opts.uv) geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  const index: number[] = [];
  const keys = [...groups.keys()].sort((a, b) => a - b);
  for (const k of keys) {
    const arr = groups.get(k)!;
    geo.addGroup(index.length, arr.length, k);
    index.push(...arr);
  }
  geo.setIndex(index);
  geo.computeVertexNormals();
  orientOutward(geo);
  return geo;
}

/** 법선이 차 중심에서 바깥을 향하도록 감기 방향 보정 */
function orientOutward(geo: THREE.BufferGeometry) {
  const p = geo.getAttribute('position');
  const n = geo.getAttribute('normal');
  let score = 0;
  for (let i = 0; i < p.count; i++) {
    score += n.getX(i) * p.getX(i) * 0.3 + n.getY(i) * (p.getY(i) - 0.65) + n.getZ(i) * p.getZ(i);
  }
  if (score >= 0) return;
  const idx = geo.getIndex()!;
  const arr = idx.array as unknown as number[];
  for (let i = 0; i < arr.length; i += 3) [arr[i + 1], arr[i + 2]] = [arr[i + 2], arr[i + 1]];
  idx.needsUpdate = true;
  geo.computeVertexNormals();
}

/** 하부 차체 단면: 오른쪽 윗선 → 바닥 → 왼쪽 윗선 */
function lowerRing(x: number) {
  const pts: THREE.Vector3[] = [];
  for (let i = U_SAMPLES.length - 1; i >= 0; i--) pts.push(sidePt(x, U_SAMPLES[i], 1));
  const yb = Math.max(yBot(x) - 0.006, archY(x));
  const w = halfW(x) * fU(0);
  for (const k of [0.88, 0.6, 0.3, 0, -0.3, -0.6, -0.88]) pts.push(new THREE.Vector3(x, yb, w * k));
  for (let i = 0; i < U_SAMPLES.length; i++) pts.push(sidePt(x, U_SAMPLES[i], -1));
  return pts;
}

const LID_T = [-1, -0.97, -0.92, -0.84, -0.72, -0.56, -0.38, -0.19, 0, 0.19, 0.38, 0.56, 0.72, 0.84, 0.92, 0.97, 1];
/** 보닛·트렁크 뚜껑 단면 (왼쪽 → 오른쪽) */
function lidRing(x: number, crown: number) {
  const we = halfW(x) * fU(1);
  const yt = yTop(x);
  return LID_T.map((t) => new THREE.Vector3(x, yt + crown * (1 - Math.pow(Math.abs(t), 2.4)), t * we));
}

/** 끝단(범퍼) 곡면: 경계 고리를 중심으로 모아 둥글게 닫는다 */
function domeCap(loop: THREE.Vector3[], dir: 1 | -1) {
  const c = new THREE.Vector3();
  loop.forEach((p) => c.add(p));
  c.divideScalar(loop.length);
  const steps: [number, number][] = [[1, 0], [0.95, 0.018], [0.84, 0.032], [0.64, 0.042], [0.38, 0.048], [0.12, 0.051], [0, 0.052]];
  const rings = steps.map(([s, dx]) =>
    loop.map((p) => new THREE.Vector3(p.x + dir * dx, c.y + (p.y - c.y) * s, c.z + (p.z - c.z) * s)),
  );
  return loft(rings, { closeRing: true });
}

export interface BodyGeometry {
  front: THREE.BufferGeometry; // 엔진룸 부근 하부(안쪽이 보임)
  middle: THREE.BufferGeometry;
  rear: THREE.BufferGeometry;
  hood: THREE.BufferGeometry;
  trunk: THREE.BufferGeometry;
  nose: THREE.BufferGeometry;
  tail: THREE.BufferGeometry;
  /** 그룹: 0 = 유리, 1 = 차체색, 2 = 검정 필러 */
  cabin: THREE.BufferGeometry;
}

export function buildBody(detailed: boolean, skipDoorWindow = false): BodyGeometry {
  const step = detailed ? 0.03 : 0.05;
  const dStep = detailed ? 0.012 : 0.02;
  const archDense: [number, number][] = [
    [AXLE_R - ARCH_R - 0.03, AXLE_R + ARCH_R + 0.03],
    [AXLE_F - ARCH_R - 0.03, AXLE_F + ARCH_R + 0.03],
  ];
  const lower = (x0: number, x1: number) => loft(stationList(x0, x1, step, archDense, dStep).map(lowerRing));
  const front = lower(COWL_X - 0.2, XF);
  const middle = lower(DECK_X + 0.02, COWL_X - 0.2);
  const rear = lower(XR, DECK_X + 0.02);
  const hood = loft(stationList(COWL_X, XF, step).map((x) => lidRing(x, 0.03)));
  const trunk = loft(stationList(XR, DECK_X, step).map((x) => lidRing(x, 0.022)));
  const loopAt = (x: number, crown: number) => {
    const u = lowerRing(x);
    const l = lidRing(x, crown);
    return [...u, ...l.slice(1, -1)];
  };
  const nose = domeCap(loopAt(XF, 0.03), 1);
  const tail = domeCap(loopAt(XR, 0.022), -1);

  // 유리·필러 경계가 단면과 정확히 겹치도록 경계 위치에 단면을 추가
  const xs = stationList(DECK_X, COWL_X, detailed ? 0.025 : 0.04, [], 0, [B_PILLAR[0], B_PILLAR[1], 0.3, -1.02, DOOR.x0, DOOR.x1]);
  const rings = xs.map(cabinRing);
  const cabin = loft(rings, {
    group: (i, j) => {
      const x = (xs[i] + xs[i + 1]) / 2;
      const jj = j < 20 ? j : 39 - j; // 좌우 대칭 인덱스
      // 열리는 문(오른쪽 앞문)의 유리는 문과 함께 따로 만든다
      if (skipDoorWindow && j < 20 && jj < GH.side && x > DOOR.x0 && x < DOOR.x1) return -1;
      if (jj < GH.side) {
        // 옆 유리 · B필러 (C필러는 cPillarPatch로 덮는다)
        if (x > B_PILLAR[0] && x < B_PILLAR[1]) return 2;
        return 0;
      }
      if (jj < GH.corner) return 1; // A필러 · 지붕 레일
      if (x > 0.3) return 0; // 앞유리
      if (x < -1.02) return 0; // 뒷유리
      return 1; // 지붕
    },
  });
  return { front, middle, rear, hood, trunk, nose, tail, cabin };
}

// ── 표면 위 장식(램프·문틈·몰딩) ───────────────────────
/** 옆면 위 사각 패치 (x0..x1, u0..u1), off만큼 바깥으로 */
export function sidePatch(x0: number, x1: number, u0: number, u1: number, side: number, off = 0.003, nx = 10, nu = 4) {
  const rings: THREE.Vector3[][] = [];
  for (let i = 0; i <= nx; i++) {
    const x = x0 + ((x1 - x0) * i) / nx;
    const r: THREE.Vector3[] = [];
    for (let j = 0; j <= nu; j++) {
      const u = u0 + ((u1 - u0) * j) / nu;
      const p = sidePt(x, u, side, false);
      const e = 0.002;
      const px = sidePt(x + e, u, side, false).sub(sidePt(x - e, u, side, false));
      const pu = sidePt(x, u + e, side, false).sub(sidePt(x, u - e, side, false));
      const n = new THREE.Vector3().crossVectors(px, pu).normalize();
      if (n.z * side < 0) n.negate();
      r.push(p.addScaledVector(n, off));
    }
    rings.push(r);
  }
  return loft(rings, { uv: true });
}

/** 앞·뒤 끝 곡면 위 패치 — 앞(+X)/뒤(-X)에서 레이를 쏴서 표면을 따라간다 */
export function capPatch(cap: THREE.Mesh, dir: 1 | -1, y0: number, y1: number, z0: number, z1: number, off = 0.003, ny = 4, nz = 10) {
  const ray = new THREE.Raycaster();
  const rings: THREE.Vector3[][] = [];
  for (let i = 0; i <= nz; i++) {
    const z = z0 + ((z1 - z0) * i) / nz;
    const r: THREE.Vector3[] = [];
    for (let j = 0; j <= ny; j++) {
      const y = y0 + ((y1 - y0) * j) / ny;
      ray.set(new THREE.Vector3(dir * 4, y, z), new THREE.Vector3(-dir, 0, 0));
      const hit = ray.intersectObject(cap, false)[0];
      const p = hit ? hit.point.clone().addScaledVector(hit.face!.normal, off) : new THREE.Vector3(dir === 1 ? XF : XR, y, z);
      r.push(p);
    }
    rings.push(r);
  }
  return loft(rings, { uv: true });
}

/** 옆면 + 끝 곡면을 이어 감싸는 램프 */
export function wrapLamp(cap: THREE.Mesh, dir: 1 | -1, xIn: number, u0: number, u1: number, zIn: number, side: number, off = 0.004) {
  const xEnd = dir === 1 ? XF : XR;
  const a = sidePatch(Math.min(xIn, xEnd), Math.max(xIn, xEnd), u0, u1, side, off, 8, 3);
  const zEdge = halfW(xEnd) * fU((u0 + u1) / 2) * 0.985;
  const y0 = yAt(xEnd, u0);
  const y1 = yAt(xEnd, u1);
  const b = capPatch(cap, dir, y0, y1, side > 0 ? zIn : -zEdge, side > 0 ? zEdge : -zIn, off, 3, 8);
  a.deleteAttribute('uv');
  b.deleteAttribute('uv');
  return mergeGeometries([a.toNonIndexed(), b.toNonIndexed()])!;
}

/** 옆면을 따라가는 세로 선(문틈) */
export function sideLine(x: number, u0: number, u1: number, side: number, w = 0.005) {
  return sidePatch(x - w / 2, x + w / 2, u0, u1, side, 0.0015, 1, 24);
}

/** C필러: 옆 유리 뒤쪽을 비스듬한 경계로 덮는 차체색 패치 */
export function cPillarPatch(side: number) {
  const cLine = (x: number) => 1.0 + (x + 1.48) * 0.78;
  const rings: THREE.Vector3[][] = [];
  for (let x = DECK_X; x <= -0.98; x += 0.02) {
    const belt = yTop(x);
    const top = belt + (roofY(x) - belt) * 0.86;
    const y0 = Math.min(top, Math.max(belt, cLine(x)));
    const r: THREE.Vector3[] = [];
    for (let k = 0; k <= 6; k++) {
      const y = y0 + ((top - y0) * k) / 6;
      r.push(new THREE.Vector3(x, y, side * (cabinW(x, y) + 0.0025)));
    }
    rings.push(r);
  }
  return loft(rings);
}

/** 캐빈 단면 점 (인덱스 j, 0..40) */
export function cabinPt(x: number, j: number) {
  return cabinRing(x)[j];
}
