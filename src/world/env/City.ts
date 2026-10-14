import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { Car, specialPlate } from '../car/Car';
import { Walker } from '../Fx';
import { MAT } from '../materials';
import { canvasTexture, textTexture, blinkOn } from '../../core/util';
import { rng, noiseTex, arrowShape } from './Environment';
import { roadMark, type RoadMarkKind } from './roadMarks';

/**
 * 시내 도로 배치 (세계 좌표, m).
 * 본 도로는 X축 방향, 가운데선 z = 0. +X로 가는 차는 +Z 쪽 차로를 쓴다(우측 통행).
 */
export const CITY = {
  /** 본 도로 반폭 (편도 3차로 × 3.2m + 갓길) */
  half: 10,
  /** +X 방향 1·2·3차로 중심 z (−X 방향은 부호 반대) */
  lanes: [1.75, 4.95, 8.15] as const,
  curbH: 0.12,
  /** 건물 주차장 출구 (+Z 쪽 건물). apron: 보도 구간 폭의 절반, passage: 건물 통로 폭의 절반, front: 건물 앞면 z */
  exit: { x: 0, apron: 4.5, passage: 3, front: 14.5 },
  /**
   * 신호 있는 골목 T자 교차로 (+Z 쪽 골목, 양방향 1차로).
   * 맞은편(−X) 정지선은 골목 바로 오른쪽, 그 1차로는 좌회전 신호에 골목으로 좌회전·유턴
   */
  alley: { x: -90, half: 3.5, fillet: 5, stopE: -99.5, stopW: -80.5, stopS: 15.2, cross: 12.6 },
  /** 교차로가 아닌 곳의 신호: 왼쪽(−Z) 건물 진출입로와 40m 앞 횡단보도 */
  mid: { stopE: 116, stopW: 134, drive: 125, driveLane: 123, driveHalf: 4, driveStop: -14.6, cross: 158, stopCrossE: 154.6, stopCrossW: 161.4 },
  /** 신호 교차로: 세로 도로(편도 1차로)는 x = 260 */
  ix: {
    x: 260, half: 4, fillet: 6,
    crossE: 246, crossW: 274, crossN: -20, crossS: 20,
    stopE: 242.6, stopW: 277.4, stopN: -23.4, stopS: 23.4,
    /** 좌회전 차로 유턴 구역 */
    uturn: { x0: 226, x1: 241 },
    /** 좌회전 궤적 반경 (뒷바퀴 축 기준, 1차로 → 세로 도로 북쪽 차로) */
    leftR: 11,
  },
  /** 회전교차로: 세로 도로 북쪽 끝 */
  rb: { x: 260, z: -170, island: 8, outer: 14, ring: 11, arm: 4 },
};

/** 교차로 좌회전 원호: 1차로(+X)에서 세로 도로 북쪽 차로(−Z)로. 뒷바퀴 축 기준 중심·반경·시작점 */
export function leftTurnArc() {
  const { ix, lanes } = CITY;
  const R = ix.leftR;
  const endX = ix.x + ix.half / 2; // 북쪽으로 가는 차로 중심
  return { R, cx: endX - R, cz: lanes[0] - R, startX: endX - R, endX };
}

type P = [number, number];
const arc = (cx: number, cz: number, r: number, a0: number, a1: number, n = 14): P[] => {
  const pts: P[] = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    pts.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]);
  }
  return pts;
};
const deg = (d: number) => (d * Math.PI) / 180;

/** 바닥 위 노면 표시용 재질 (바닥과 겹쳐 깜빡이지 않게 앞으로 당김) */
const paintMat = (color: number) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.75, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
const WHITE = paintMat(0xf2f2ee);
const YELLOW = paintMat(0xf2c230);

function stripe(g: THREE.Group, x0: number, z0: number, x1: number, z1: number, w = 0.15, mat = WHITE) {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(len, w), mat);
  m.rotation.x = -Math.PI / 2;
  m.rotation.z = -Math.atan2(z1 - z0, x1 - x0);
  m.position.set((x0 + x1) / 2, 0.012, (z0 + z1) / 2);
  m.receiveShadow = true;
  g.add(m);
}
function dashed(g: THREE.Group, x0: number, z0: number, x1: number, z1: number, on = 3, off = 5, w = 0.15, mat = WHITE) {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const ux = (x1 - x0) / len;
  const uz = (z1 - z0) / len;
  for (let s = 0; s < len; s += on + off) {
    const e = Math.min(len, s + on);
    stripe(g, x0 + ux * s, z0 + uz * s, x0 + ux * e, z0 + uz * e, w, mat);
  }
}
/** 점선 곡선 (좌회전 유도선, 별표 6의 525: 도색·빈 길이 각 50~100cm) */
function dashedCurve(g: THREE.Group, pts: THREE.Vector2[], on = 1, off = 1, w = 0.15) {
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const seg = a.distanceTo(b);
    const phase = acc % (on + off);
    if (phase < on) stripe(g, a.x, a.y, b.x, b.y, w);
    acc += seg;
  }
}
function zebra(g: THREE.Group, cx: number, cz: number, alongX: boolean, span: number, width = 4) {
  // 길을 가로지르는 줄무늬: alongX = 줄이 X방향으로 늘어섬(길이 Z방향인 도로를 건넘)
  const n = Math.floor(span / 1.0);
  for (let i = 0; i < n; i++) {
    const o = -span / 2 + 0.5 + i * 1.0;
    if (alongX) stripe(g, cx + o, cz - width / 2, cx + o, cz + width / 2, 0.5);
    else stripe(g, cx - width / 2, cz + o, cx + width / 2, cz + o, 0.5);
  }
}

// ── 신호등 ──────────────────────────────────────────────
export interface SignalState {
  red?: boolean;
  yellow?: boolean;
  left?: boolean;
  green?: boolean;
}
const lampMat = (on: number, off: number) => ({ mat: new THREE.MeshBasicMaterial({ color: off, toneMapped: false }), on, off });

/** 차량 신호등 (가로형 4색: 적·황·녹색 좌회전 화살표·녹). three = 화살표 없는 3색 */
export class SignalHead {
  root = new THREE.Group();
  private lamps: Record<'red' | 'yellow' | 'left' | 'green', ReturnType<typeof lampMat>>;
  constructor(three = false) {
    const n = three ? 3 : 4;
    const w = n * 0.38 + 0.1;
    const housing = new THREE.Mesh(new RoundedBoxGeometry(w, 0.44, 0.3, 2, 0.05), MAT.black);
    const visor = new THREE.Mesh(new THREE.BoxGeometry(w, 0.04, 0.22), MAT.black);
    visor.position.set(0, 0.24, 0.24);
    this.root.add(housing, visor);
    this.lamps = {
      red: lampMat(0xff3b2f, 0x3a1210),
      yellow: lampMat(0xffb81f, 0x3a2a0c),
      left: lampMat(0x2dff8a, 0x0e2c1a),
      green: lampMat(0x2dff8a, 0x0e2c1a),
    };
    const order = three ? (['red', 'yellow', 'green'] as const) : (['red', 'yellow', 'left', 'green'] as const);
    order.forEach((k, i) => {
      const x = (i - (n - 1) / 2) * 0.38;
      const lamp = this.lamps[k];
      if (k === 'left') {
        const bg = new THREE.Mesh(new THREE.CircleGeometry(0.15, 24), new THREE.MeshBasicMaterial({ color: 0x0b0c0e }));
        bg.position.set(x, 0, 0.152);
        const arrow = new THREE.Mesh(new THREE.ShapeGeometry(arrowShape()), lamp.mat);
        arrow.scale.setScalar(0.11);
        arrow.rotation.z = Math.PI; // 운전자 기준 왼쪽
        arrow.position.set(x, 0, 0.155);
        this.root.add(bg, arrow);
      } else {
        const disc = new THREE.Mesh(new THREE.CircleGeometry(0.15, 24), lamp.mat);
        disc.position.set(x, 0, 0.152);
        this.root.add(disc);
      }
    });
    this.set({});
  }
  set(s: SignalState) {
    for (const k of ['red', 'yellow', 'left', 'green'] as const) {
      const l = this.lamps[k];
      l.mat.color.setHex(s[k] ? l.on : l.off);
    }
  }
}

const figureTex = (walk: boolean, color: string) =>
  canvasTexture(64, 64, (c) => {
    c.fillStyle = '#0b0c0e';
    c.fillRect(0, 0, 64, 64);
    c.strokeStyle = c.fillStyle = color;
    c.lineWidth = 6;
    c.lineCap = 'round';
    c.beginPath();
    c.arc(32, 13, 6, 0, Math.PI * 2);
    c.fill();
    c.beginPath();
    c.moveTo(32, 22);
    c.lineTo(walk ? 30 : 32, 40);
    c.moveTo(walk ? 30 : 32, 40);
    c.lineTo(walk ? 20 : 26, 58);
    c.moveTo(walk ? 30 : 32, 40);
    c.lineTo(walk ? 42 : 38, 58);
    c.moveTo(32, 26);
    c.lineTo(walk ? 20 : 25, 36);
    c.moveTo(32, 26);
    c.lineTo(walk ? 44 : 39, 36);
    c.stroke();
  });

/** 보행 신호등 (위: 빨간 서 있는 사람, 아래: 초록 걷는 사람) */
export class PedSignal {
  root = new THREE.Group();
  private stop: THREE.MeshBasicMaterial;
  private walk: THREE.MeshBasicMaterial;
  constructor() {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 3, 10), MAT.trim);
    pole.position.y = 1.5;
    const box = new THREE.Mesh(new RoundedBoxGeometry(0.34, 0.68, 0.22, 2, 0.03), MAT.black);
    box.position.y = 2.6;
    this.stop = new THREE.MeshBasicMaterial({ map: figureTex(false, '#ff3b2f'), toneMapped: false });
    this.walk = new THREE.MeshBasicMaterial({ map: figureTex(true, '#2dff8a'), toneMapped: false });
    const a = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.26), this.stop);
    a.position.set(0, 2.76, 0.112);
    const b = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.26), this.walk);
    b.position.set(0, 2.44, 0.112);
    this.root.add(pole, box, a, b);
    this.set(false);
  }
  set(walk: boolean) {
    this.walk.color.setHex(walk ? 0xffffff : 0x1c1c1c);
    this.stop.color.setHex(walk ? 0x1c1c1c : 0xffffff);
  }
}

/** 기둥 + 가로대에 매단 차량 신호등. face: 신호등이 바라보는 방향(운전자 쪽) */
function mastSignal(g: THREE.Group, pole: P, head: P, face: P, three = false) {
  const poleMat = MAT.trim;
  const h = 5.6;
  const p = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.14, h, 12), poleMat);
  p.position.set(pole[0], h / 2, pole[1]);
  const dx = head[0] - pole[0];
  const dz = head[1] - pole[1];
  const len = Math.hypot(dx, dz) + 0.6;
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, len, 10), poleMat);
  arm.rotation.z = Math.PI / 2;
  arm.rotation.y = -Math.atan2(dz, dx);
  arm.position.set(pole[0] + dx / 2, h - 0.15, pole[1] + dz / 2);
  g.add(p, arm);
  const s = new SignalHead(three);
  s.root.position.set(head[0], h - 0.55, head[1]);
  s.root.rotation.y = Math.atan2(face[0], face[1]);
  g.add(s.root);
  return s;
}

const SHIRTS = [0xd94f45, 0x3f7fd9, 0xf2b33d, 0x48a868, 0x8d5bd1, 0xe8e8e2];

// ─────────────────────────────────────────────────────────
export class CityEnv {
  group = new THREE.Group();
  hemi = new THREE.HemisphereLight(0xd6e8ff, 0x6b6a62, 1.1);
  sun = new THREE.DirectionalLight(0xfff2dc, 2.5);
  /** 장면에서 움직이는 차 (평소엔 숨김) */
  cars: Car[] = [];
  /** "이렇게 하면?"을 보여주는 반투명 빨간 차 */
  ghost: Car;
  /** 보행자 (holder 위치·방향, walker 걸음) */
  peds: { holder: THREE.Group; walker: Walker }[] = [];
  sig: Record<string, SignalHead> = {};
  ped: Record<string, PedSignal> = {};
  /** 비보호 좌회전 장면에서만 쓰는 3색 신호등·표지 */
  unprotected = new THREE.Group();
  /** 출구 사각지대: 벽에 가려 운전석에서 안 보이는 보도 (빨간 반투명) */
  blind: THREE.Mesh;
  private sig4E!: SignalHead;
  private warnLamps: THREE.MeshBasicMaterial[] = [];

  constructor() {
    const g = this.group;
    const C = CITY;
    this.sun.position.set(12, 24, 9);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -18; sc.right = 18; sc.top = 18; sc.bottom = -18; sc.near = 1; sc.far = 80;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.02;
    g.add(this.hemi, this.sun, this.sun.target);

    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: { top: { value: new THREE.Color(0x64a8ee) }, horizon: { value: new THREE.Color(0xe8f0f6) } },
      vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 top; uniform vec3 horizon; varying vec3 vP;
        void main(){ float k = smoothstep(-0.05, 0.5, vP.y); gl_FragColor = vec4(mix(horizon, top, k), 1.0); }`,
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(600, 32, 16), skyMat);
    sky.position.set(130, 0, -60);
    g.add(sky);

    // 바닥 전체가 아스팔트, 그 위에 블록(보도·건물 부지)을 얹는다
    const asphalt = noiseTex('#5a5e65', 0.2);
    asphalt.wrapS = asphalt.wrapT = THREE.RepeatWrapping;
    asphalt.repeat.set(380, 300);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(1200, 960), new THREE.MeshStandardMaterial({ map: asphalt, roughness: 0.95 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(100, 0, -100);
    ground.receiveShadow = true;
    g.add(ground);

    const paving = canvasTexture(256, 256, (c, w, h) => {
      c.fillStyle = '#a9a59c';
      c.fillRect(0, 0, w, h);
      const r = rng(11);
      for (let y = 0; y < 4; y++)
        for (let x = 0; x < 4; x++) {
          const v = Math.floor(170 + r() * 16);
          c.fillStyle = `rgb(${v},${v - 3},${v - 9})`;
          c.fillRect(x * 64 + 2, y * 64 + 2, 60, 60);
        }
    });
    paving.wrapS = paving.wrapT = THREE.RepeatWrapping;
    paving.repeat.set(0.5, 0.5);
    const pavingMat = new THREE.MeshStandardMaterial({ map: paving, roughness: 0.9 });
    const curbMat = new THREE.MeshStandardMaterial({ color: 0xbdb9b0, roughness: 0.9 });
    const block = (pts: P[]) => {
      const shape = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));
      const geo = new THREE.ExtrudeGeometry(shape, { depth: C.curbH, bevelEnabled: false, curveSegments: 4 });
      const m = new THREE.Mesh(geo, [pavingMat, curbMat]);
      m.rotation.x = -Math.PI / 2;
      m.receiveShadow = true;
      g.add(m);
    };
    const { ix, rb, exit, mid } = C;
    const f = ix.fillet;
    const W = ix.x - ix.half; // 256
    const E = ix.x + ix.half; // 264
    const ringEdge = Math.sqrt(rb.outer ** 2 - rb.arm ** 2); // 13.4
    // 북서: 골목으로 둘로 나뉘고, 동쪽 블록엔 건물 출구 홈
    const { alley } = C;
    const af = alley.fillet;
    block([[-400, C.half], [alley.x - alley.half - af, C.half], ...arc(alley.x - alley.half - af, C.half + af, af, deg(-90), 0), [alley.x - alley.half, 400], [-400, 400]]);
    block([
      [alley.x + alley.half, 400], [alley.x + alley.half, C.half + af], ...arc(alley.x + alley.half + af, C.half + af, af, deg(180), deg(270)),
      [exit.x - exit.apron, C.half], [exit.x - exit.apron, exit.front - 0.5], [exit.x - exit.passage, exit.front - 0.5],
      [exit.x - exit.passage, 46], [exit.x + exit.passage, 46], [exit.x + exit.passage, exit.front - 0.5], [exit.x + exit.apron, exit.front - 0.5],
      [exit.x + exit.apron, C.half], [W - f, C.half], ...arc(W - f, C.half + f, f, deg(-90), 0), [W, 400],
    ]);
    // 북동
    block([[E, 400], [E, C.half + f], ...arc(E + f, C.half + f, f, deg(180), deg(270)), [700, C.half], [700, 400]]);
    // 남서: 왼쪽 건물 진출입로 홈 포함
    block([
      [-400, -C.half], [mid.drive - mid.driveHalf, -C.half], [mid.drive - mid.driveHalf, -60], [mid.drive + mid.driveHalf, -60],
      [mid.drive + mid.driveHalf, -C.half], [W - f, -C.half], ...arc(W - f, -C.half - f, f, deg(90), 0), [W, rb.z + ringEdge],
      ...arc(rb.x, rb.z, rb.outer, Math.atan2(ringEdge, -rb.arm), Math.atan2(rb.arm, -ringEdge)), [-400, rb.z + rb.arm],
    ]);
    // 남동
    block([
      [700, -C.half], [E + f, -C.half], ...arc(E + f, -C.half - f, f, deg(90), deg(180)), [E, rb.z + ringEdge],
      ...arc(rb.x, rb.z, rb.outer, Math.atan2(ringEdge, rb.arm), Math.atan2(rb.arm, ringEdge)), [700, rb.z + rb.arm],
    ]);
    // 회전교차로 북쪽 두 블록
    block([[-400, rb.z - rb.arm], ...arc(rb.x, rb.z, rb.outer, Math.atan2(-rb.arm, -ringEdge), Math.atan2(-ringEdge, -rb.arm)), [W, -600], [-400, -600]]);
    block([[700, rb.z - rb.arm], ...arc(rb.x, rb.z, rb.outer, Math.atan2(-rb.arm, ringEdge), Math.atan2(-ringEdge, rb.arm)), [E, -600], [700, -600]]);

    // 출구 앞 보도(보행자 통로) 표시: 진출로를 가로지르는 포장
    const walkway = new THREE.Mesh(
      new THREE.PlaneGeometry(exit.apron * 2, exit.front - 0.5 - C.half - 0.3),
      new THREE.MeshStandardMaterial({ map: paving, color: 0xe2d2b8, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
    );
    walkway.rotation.x = -Math.PI / 2;
    walkway.position.set(exit.x, 0.01, (C.half + 0.3 + exit.front - 0.5) / 2);
    walkway.receiveShadow = true;
    g.add(walkway);
    const midWalk = walkway.clone();
    midWalk.scale.x = mid.driveHalf / exit.apron;
    midWalk.position.set(mid.drive, 0.01, -(C.half + 0.3 + 14) / 2);
    midWalk.scale.y = (14 - C.half - 0.3) / (exit.front - 0.5 - C.half - 0.3);
    g.add(midWalk);

    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(8 * 3), 3));
    bg.setIndex([0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6]);
    this.blind = new THREE.Mesh(
      bg,
      new THREE.MeshBasicMaterial({ color: 0xff3b2f, transparent: true, opacity: 0.26, depthWrite: false, side: THREE.DoubleSide }),
    );
    this.blind.frustumCulled = false;
    this.blind.renderOrder = 3;
    g.add(this.blind);

    this.markings();
    this.roundabout();
    this.buildings();
    this.signals();

    // 나무·가로등 (장면 지점 주변은 비워 시야 확보)
    const r = rng(5);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4a33, roughness: 0.9 });
    const leafMats = [0x4f8f3a, 0x5c9c42, 0x3f7d34].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9, flatShading: true }));
    const tree = (x: number, z: number, s = 0.8) => {
      const t = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.1 * s, 0.15 * s, 2.6 * s, 8), trunkMat);
      trunk.position.y = 1.3 * s;
      t.add(trunk);
      for (let i = 0; i < 3; i++) {
        const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry((1.2 - i * 0.2) * s, 1), leafMats[i % 3]);
        leaf.position.set((r() - 0.5) * 0.6 * s, (3 + i * 0.7) * s, (r() - 0.5) * 0.6 * s);
        t.add(leaf);
      }
      t.position.set(x, C.curbH, z);
      t.traverse((o) => (o.castShadow = true));
      g.add(t);
    };
    const clear = (x: number) =>
      Math.abs(x - exit.x) < 22 ||
      Math.abs(x - C.alley.x) < 26 || (x > mid.stopE - 12 && x < mid.cross + 10) || (x > ix.x - 40 && x < ix.x + 30);
    for (let x = -150; x <= 520; x += 14) {
      if (!clear(x)) tree(x, C.half + 1.4);
      if (!clear(x + 7)) tree(x + 7, -C.half - 1.4);
    }
    for (let z = 40; z <= 180; z += 14) {
      tree(W - 1.4, z);
      tree(E + 1.4, z + 7);
    }
    for (let z = -50; z >= -140; z -= 14) {
      tree(W - 1.4, z);
      tree(E + 1.4, z - 7);
    }
    // 회전교차로 진입로 가로수
    const rbc = CITY.rb;
    for (let d = rbc.outer + 16; d < rbc.outer + 60; d += 12) {
      tree(rbc.x - rbc.arm - 1.4, rbc.z - d);
      tree(rbc.x + rbc.arm + 1.4, rbc.z - d - 6);
      tree(rbc.x + d, rbc.z - rbc.arm - 1.4);
      tree(rbc.x + d + 6, rbc.z + rbc.arm + 1.4);
      tree(rbc.x - d, rbc.z + rbc.arm + 1.4);
      tree(rbc.x - d - 6, rbc.z - rbc.arm - 1.4);
    }

    // 장면용 차·보행자
    const colors = [0xe9ebee, 0x2b2f36, 0x9aa3ad, 0xb63a2f, 0x6f8fa8, 0xf2f2f2, 0x3b4a5c, 0x8c2e2e, 0xd9d9d6, 0x4a4f57];
    for (let i = 0; i < colors.length; i++) {
      const car = new Car({ color: colors[i], plate: specialPlate(24 + i) });
      car.root.visible = false;
      this.cars.push(car);
      g.add(car.root);
    }
    this.ghost = new Car({ color: 0xff5a4d });
    const ghostMat = new THREE.MeshBasicMaterial({ color: 0xff4a3d, transparent: true, opacity: 0.32, depthWrite: false });
    this.ghost.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.material = ghostMat;
        m.castShadow = false;
      }
    });
    this.ghost.root.visible = false;
    g.add(this.ghost.root);
    for (const color of SHIRTS) {
      const walker = new Walker();
      const shirt = MAT.shirt.clone();
      shirt.color.setHex(color);
      walker.root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh && m.material === MAT.shirt) m.material = shirt;
      });
      const holder = new THREE.Group();
      holder.add(walker.root);
      holder.visible = false;
      g.add(holder);
      this.peds.push({ holder, walker });
    }
    this.reset();
  }

  private markings() {
    const g = this.group;
    const C = CITY;
    const { ix, mid, alley } = C;
    const X0 = -300;
    const X1 = 640;
    const ixW = ix.x - ix.half - ix.fillet; // 교차로 경계(서)
    const ixE = ix.x + ix.half + ix.fillet;
    // 가운데선(노란 겹선): 유턴 구역·교차로·횡단보도 구간은 끊는다
    const center = (a: number, b: number) => {
      for (const dz of [-0.12, 0.12]) stripe(g, a, dz, b, dz, 0.12, YELLOW);
    };
    center(X0, alley.stopE);
    center(alley.stopW, mid.stopE);
    center(mid.stopE + 0.3, mid.cross - 2.2);
    center(mid.cross + 2.2, ix.uturn.x0);
    // 유턴구역선(별표 6의 502): 가운데선 자리에 흰 점선 (도색 3m · 빈 3m · 너비 0.3m)
    dashed(g, ix.uturn.x0, 0, ix.uturn.x1, 0, 3, 3, 0.3);
    center(ix.uturn.x1, ix.crossE - 2);
    center(ix.crossW + 2, X1);
    // 차선(흰 점선)·가장자리선, 교차로 앞 30m는 실선(차로 변경 금지)
    for (const s of [-1, 1]) {
      for (const lz of [3.35, 6.55]) {
        const z = s * lz;
        const runs: [number, number][] = [[X0, mid.cross - 2.2], [mid.cross + 2.2, ixW], [ixE, X1]];
        for (const [a, b] of runs) {
          if (s > 0 && b === ixW) {
            dashed(g, a, z, ix.stopE - 30, z);
            stripe(g, ix.stopE - 30, z, ix.crossE - 2, z);
          } else if (s < 0 && a === ixE) {
            stripe(g, ix.crossW + 2, z, ix.stopW + 30, z);
            dashed(g, ix.stopW + 30, z, b, z);
          } else dashed(g, a, z, b, z);
        }
      }
      stripe(g, X0, s * 9.75, ixW, s * 9.75, 0.12);
      stripe(g, ixE, s * 9.75, X1, s * 9.75, 0.12);
    }
    // 골목 교차로: 정지선·골목 입구 횡단보도·골목 가운데선
    stripe(g, alley.stopE, 0.2, alley.stopE, 9.8, 0.45);
    stripe(g, alley.stopW, -0.2, alley.stopW, -9.8, 0.45);
    stripe(g, alley.x + 0.2, alley.stopS, alley.x + alley.half - 0.2, alley.stopS, 0.45);
    zebra(g, alley.x, alley.cross, true, 2 * alley.half - 0.6, 3);
    for (const dx of [-0.12, 0.12]) stripe(g, alley.x + dx, alley.stopS + 0.4, alley.x + dx, 400, 0.12, YELLOW);
    // 정지선
    stripe(g, ix.stopE, 0.2, ix.stopE, 9.8, 0.45);
    stripe(g, ix.stopW, -0.2, ix.stopW, -9.8, 0.45);
    stripe(g, ix.x - ix.half + 0.2, ix.stopN, ix.x - 0.2, ix.stopN, 0.45);
    stripe(g, ix.x + 0.2, ix.stopS, ix.x + ix.half - 0.2, ix.stopS, 0.45);
    stripe(g, mid.stopE, 0.2, mid.stopE, 9.8, 0.45);
    stripe(g, mid.stopW, -0.2, mid.stopW, -9.8, 0.45);
    stripe(g, mid.stopCrossE, 0.2, mid.stopCrossE, 9.8, 0.45);
    stripe(g, mid.stopCrossW, -0.2, mid.stopCrossW, -9.8, 0.45);
    stripe(g, mid.driveLane - 1.8, mid.driveStop, mid.driveLane + 1.8, mid.driveStop, 0.45);
    // 횡단보도
    zebra(g, ix.crossE, 0, false, 2 * C.half - 1);
    zebra(g, ix.crossW, 0, false, 2 * C.half - 1);
    zebra(g, ix.x, ix.crossN, true, 2 * ix.half - 0.6);
    zebra(g, ix.x, ix.crossS, true, 2 * ix.half - 0.6);
    zebra(g, mid.cross, 0, false, 2 * C.half - 1);
    // 세로 도로 가운데선
    const rbz = CITY.rb.z;
    for (const [a, b] of [[ix.crossS + 2, 400], [rbz + CITY.rb.outer + 70, ix.crossN - 2], [-600, rbz - CITY.rb.outer - 70]] as const) {
      for (const dx of [-0.12, 0.12]) stripe(g, ix.x + dx, a, ix.x + dx, b, 0.12, YELLOW);
    }
    // 좌회전 유도선: 차가 도는 원호(뒷바퀴 축 기준)를 차로 폭만큼 안팎으로
    const lt = leftTurnArc();
    for (const off of [-1.6, 1.6]) {
      const r = lt.R + off;
      const pts = [new THREE.Vector2(ix.crossE + 2, lt.cz + r)];
      for (let i = 0; i <= 32; i++) {
        const a = (i / 32) * (Math.PI / 2);
        pts.push(new THREE.Vector2(lt.cx + Math.sin(a) * r, lt.cz + Math.cos(a) * r));
      }
      pts.push(new THREE.Vector2(lt.cx + r, ix.crossN + 3));
      dashedCurve(g, pts);
    }
    // 진행방향 노면표시 (별표 6의 537·538·539 도형). 정지선 앞 약 8m·38m에 화살표 끝이 오도록 차로마다 두 개씩
    const mark = (kind: RoadMarkKind, x: number, z: number, heading: number) => g.add(roadMark(kind, x, z, heading, WHITE));
    /** dir = +1: +X로 가는 쪽(정지선 x에서 뒤로), −1: −X로 가는 쪽. kinds는 1·2·3차로 */
    const approach = (stopX: number, dir: 1 | -1, kinds: [RoadMarkKind, RoadMarkKind, RoadMarkKind]) => {
      for (const back of [13, 43]) {
        kinds.forEach((k, i) => mark(k, stopX - dir * back, dir * C.lanes[i], dir > 0 ? 0 : Math.PI));
      }
    };
    approach(ix.stopE, 1, ['leftUturn', 'straight', 'straightRight']); // 1차로: 좌회전시 유턴
    approach(ix.stopW, -1, ['left', 'straight', 'straightRight']);
    approach(alley.stopW, -1, ['leftUturn', 'straight', 'straight']); // 맞은편: 골목으로 좌회전·유턴
    approach(alley.stopE, 1, ['straight', 'straight', 'straightRight']); // 3차로: 골목으로 우회전
  }

  private roundabout() {
    const g = this.group;
    const { rb, ix } = CITY;
    // 가운데 섬
    const islandTop = new THREE.Mesh(new THREE.CylinderGeometry(rb.island, rb.island, 0.3, 48), new THREE.MeshStandardMaterial({ color: 0x7fb05a, roughness: 1 }));
    islandTop.position.set(rb.x, 0.15, rb.z);
    islandTop.receiveShadow = islandTop.castShadow = true;
    const curb = new THREE.Mesh(new THREE.TorusGeometry(rb.island, 0.18, 6, 64), new THREE.MeshStandardMaterial({ color: 0xd8d5ce, roughness: 0.8 }));
    curb.rotation.x = Math.PI / 2;
    curb.position.set(rb.x, 0.12, rb.z);
    g.add(islandTop, curb);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 3.4, 10), new THREE.MeshStandardMaterial({ color: 0x6b4a33 }));
    trunk.position.set(rb.x, 1.9, rb.z);
    const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(2.6, 1), new THREE.MeshStandardMaterial({ color: 0x4f8f3a, flatShading: true }));
    crown.position.set(rb.x, 4.6, rb.z);
    trunk.castShadow = crown.castShadow = true;
    g.add(trunk, crown);
    // 분리대·양보선 (네 방향 진입로)
    const islandMat = new THREE.MeshStandardMaterial({ color: 0xd8d5ce, roughness: 0.85 });
    for (let k = 0; k < 4; k++) {
      const a = (k * Math.PI) / 2;
      // 기준(남쪽 진입로)에서 회전: (dx, dz) 남쪽이 +Z
      const rot = (dx: number, dz: number): P => [rb.x + dx * Math.cos(a) + dz * Math.sin(a), rb.z - dx * Math.sin(a) + dz * Math.cos(a)];
      const shape = [rot(0, rb.outer + 0.6), rot(0.7, rb.outer + 3), rot(0.35, rb.outer + 12), rot(-0.35, rb.outer + 12), rot(-0.7, rb.outer + 3)];
      const s = new THREE.Shape(shape.map(([x, z]) => new THREE.Vector2(x, -z)));
      const m = new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth: 0.15, bevelEnabled: false }), islandMat);
      m.rotation.x = -Math.PI / 2;
      m.castShadow = m.receiveShadow = true;
      g.add(m);
      // 양보선: 진입 차로(오른쪽 차로)를 가로지르는 점선
      const [y0x, y0z] = rot(0.9, rb.outer + 0.4);
      const [y1x, y1z] = rot(rb.arm - 0.2, rb.outer + 0.4);
      dashed(g, y0x, y0z, y1x, y1z, 0.5, 0.4, 0.4);
      // 진입로 가운데선 (분리대 바깥)
      for (const dx of [-0.12, 0.12]) {
        const [ax, az] = rot(dx, rb.outer + 12.5);
        const [bx, bz] = rot(dx, rb.outer + 70);
        stripe(g, ax, az, bx, bz, 0.12, YELLOW);
      }
    }
    // 회전교차로 표지 (남쪽 진입로)
    const signTex = canvasTexture(256, 256, (c) => {
      c.fillStyle = '#1f5fbf';
      c.beginPath();
      c.arc(128, 128, 124, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = c.fillStyle = '#ffffff';
      c.lineWidth = 18;
      for (let i = 0; i < 3; i++) {
        const a0 = (i * 2 * Math.PI) / 3 + 0.35;
        c.beginPath();
        c.arc(128, 128, 62, a0, a0 + 1.5);
        c.stroke();
        const ax = 128 + Math.cos(a0) * 62;
        const ay = 128 + Math.sin(a0) * 62;
        const tx = Math.sin(a0);
        const ty = -Math.cos(a0);
        c.beginPath();
        c.moveTo(ax - tx * 22, ay - ty * 22);
        c.lineTo(ax + Math.cos(a0) * 20, ay + Math.sin(a0) * 20);
        c.lineTo(ax - Math.cos(a0) * 20, ay - Math.sin(a0) * 20);
        c.closePath();
        c.fill();
      }
    });
    const sign = new THREE.Mesh(new THREE.CircleGeometry(0.45, 32), new THREE.MeshStandardMaterial({ map: signTex }));
    sign.position.set(ix.x + ix.half + 1.2, 2.4, rb.z + rb.outer + 18);
    const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.4), MAT.trim);
    sp.position.set(ix.x + ix.half + 1.2, 1.2, rb.z + rb.outer + 18.02);
    g.add(sign, sp);
  }

  private buildings() {
    const g = this.group;
    const C = CITY;
    const r = rng(23);
    const facade = canvasTexture(128, 128, (c, w, h) => {
      c.fillStyle = '#f2f0ea';
      c.fillRect(0, 0, w, h);
      const grad = c.createLinearGradient(0, 30, 0, 100);
      grad.addColorStop(0, '#5d7896');
      grad.addColorStop(1, '#2e4158');
      c.fillStyle = grad;
      c.fillRect(14, 30, 100, 64);
      c.fillStyle = 'rgba(255,255,255,0.25)';
      c.fillRect(14, 30, 100, 6);
    });
    facade.wrapS = facade.wrapT = THREE.RepeatWrapping;
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x8d9096, roughness: 0.95 });
    const tints = [0xe8e2d6, 0xd9dde2, 0xcfc6b8, 0xe9e4da, 0xbfc8d2, 0xd6cbbd];
    const box = (x0: number, z0: number, x1: number, z1: number, h: number, y0 = 0, tint?: number) => {
      const w = x1 - x0;
      const d = z1 - z0;
      const mk = (len: number) => {
        const t = facade.clone();
        t.repeat.set(len / 3, (h - y0) / 3.3);
        t.needsUpdate = true;
        return new THREE.MeshStandardMaterial({ map: t, color: tint ?? tints[Math.floor(r() * tints.length)], roughness: 0.8 });
      };
      const side = mk(d);
      const front = mk(w);
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h - y0, d), [side, side, roofMat, roofMat, front, front]);
      b.position.set((x0 + x1) / 2, C.curbH + (h + y0) / 2, (z0 + z1) / 2);
      b.castShadow = b.receiveShadow = true;
      g.add(b);
      return b;
    };
    const { exit, mid, ix } = C;
    // 출구가 있는 건물: 두 동 사이로 진출로가 나 있고, 양옆 벽이 보도를 가린다
    const tint = 0xd9d4ca;
    box(exit.x - 16, exit.front, exit.x - exit.passage, 46, 10, 0, tint);
    box(exit.x + exit.passage, exit.front, exit.x + 16, 46, 10, 0, tint);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.5), new THREE.MeshBasicMaterial({ map: textTexture('출구 · 출차주의', { w: 512, h: 108, bg: '#1b2733', fg: '#ffd34d', size: 60 }) }));
    sign.position.set(exit.x - exit.passage - 1.6, C.curbH + 3.2, exit.front - 0.02);
    sign.rotation.y = Math.PI;
    g.add(sign);
    for (const s of [-1, 1]) {
      const m = new THREE.MeshBasicMaterial({ color: 0x3a2a0c, toneMapped: false });
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.14, 16, 12), m);
      lamp.position.set(exit.x - exit.passage - 1.6 + s * 1.45, C.curbH + 3.2, exit.front - 0.1);
      g.add(lamp);
      this.warnLamps.push(m);
    }
    // 본 도로 양쪽 건물들
    const row = (from: number, to: number, side: 1 | -1, skip: (a: number, b: number) => boolean) => {
      let x = from;
      while (x < to) {
        const w = 14 + Math.floor(r() * 4) * 4;
        const gap = 3 + Math.floor(r() * 3) * 2;
        const x1 = Math.min(to, x + w);
        if (!skip(x, x1)) {
          const h = 12 + Math.floor(r() * 7) * 4;
          const z0 = side * (exit.front);
          const z1 = side * (exit.front + 18 + r() * 8);
          box(x, Math.min(z0, z1), x1, Math.max(z0, z1), h);
        }
        x = x1 + gap;
      }
    };
    row(-180, ix.x - 50, 1, (a, b) => (b > exit.x - 22 && a < exit.x + 22) || (b > C.alley.x - 26 && a < C.alley.x + 26));
    // 골목 양옆 건물 (골목 입구 모서리도 시야를 가린다)
    box(C.alley.x - 24, exit.front, C.alley.x - C.alley.half - 2.5, exit.front + 24, 14);
    box(C.alley.x + C.alley.half + 2.5, exit.front, C.alley.x + 24, exit.front + 24, 12);
    row(ix.x + 46, 560, 1, () => false);
    row(-180, ix.x - 50, -1, (a, b) => b > mid.drive - 30 && a < mid.drive + 30);
    row(ix.x + 46, 560, -1, () => false);
    // 왼쪽 건물 (진출입로가 있는 큰 건물)
    box(mid.drive - 28, -60, mid.drive - mid.driveHalf - 2, -C.half - 5, 18, 0, 0xe6dfd2);
    box(mid.drive + mid.driveHalf + 2, -60, mid.drive + 28, -C.half - 5, 18, 0, 0xe6dfd2);
    const mart = new THREE.Mesh(new THREE.PlaneGeometry(9, 1.6), new THREE.MeshBasicMaterial({ map: textTexture('센트럴 몰', { w: 512, h: 92, bg: '#c2372e', fg: '#ffffff', size: 64 }) }));
    mart.position.set(mid.drive - 15, C.curbH + 12, -C.half - 4.98);
    g.add(mart);
    // 교차로 모서리 건물
    for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]] as const) {
      const x0 = sx < 0 ? ix.x - ix.half - 40 : ix.x + ix.half + 6;
      const z0 = sz > 0 ? exit.front + 2 : -exit.front - 22;
      box(x0, z0, x0 + 34, z0 + 20, 20 + Math.floor(r() * 4) * 6);
    }
    // 세로 도로 양쪽
    for (let z = 50; z < 300; z += 30) {
      box(ix.x - ix.half - 30, z, ix.x - ix.half - 5, z + 22, 12 + Math.floor(r() * 5) * 4);
      box(ix.x + ix.half + 5, z, ix.x + ix.half + 30, z + 22, 12 + Math.floor(r() * 5) * 4);
    }
    for (let z = -50; z > -140; z -= 30) {
      box(ix.x - ix.half - 30, z - 22, ix.x - ix.half - 5, z, 10 + Math.floor(r() * 4) * 4);
      box(ix.x + ix.half + 5, z - 22, ix.x + ix.half + 30, z, 10 + Math.floor(r() * 4) * 4);
    }
    // 회전교차로 둘레
    const { rb } = C;
    for (const [x0, z0] of [[rb.x - 64, rb.z + 10], [rb.x + 32, rb.z + 10], [rb.x - 46, rb.z - 30], [rb.x + 14, rb.z - 30]] as const) {
      box(x0, z0, x0 + 32, z0 + 20, 9 + Math.floor(r() * 3) * 3);
    }
    // 유턴 표지
    const uTex = canvasTexture(128, 128, (c) => {
      c.fillStyle = '#1f5fbf';
      c.beginPath();
      c.arc(64, 64, 62, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = c.fillStyle = '#fff';
      c.lineWidth = 12;
      c.beginPath();
      c.moveTo(80, 98);
      c.lineTo(80, 56);
      c.arc(64, 56, 16, 0, Math.PI, true);
      c.lineTo(48, 80);
      c.stroke();
      c.beginPath();
      c.moveTo(34, 76);
      c.lineTo(62, 76);
      c.lineTo(48, 98);
      c.closePath();
      c.fill();
    });
    const uSign = (x: number, z: number, face: number, plate?: string) => {
      const s = new THREE.Mesh(new THREE.CircleGeometry(0.4, 32), new THREE.MeshStandardMaterial({ map: uTex }));
      s.position.set(x, 2.6, z);
      s.rotation.y = face;
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.6), MAT.trim);
      p.position.set(x, 1.3, z);
      g.add(s, p);
      if (plate) {
        const t = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.3), new THREE.MeshStandardMaterial({ map: textTexture(plate, { w: 300, h: 100, bg: '#ffffff', fg: '#1a1a1a', size: 46, radius: 6 }) }));
        t.position.set(x, 2.05, z);
        t.rotation.y = face;
        g.add(t);
      }
    };
    uSign(C.alley.stopW + 2, C.half + 0.8, Math.PI / 2, '좌회전시');
    uSign(ix.uturn.x1 - 2, C.half + 0.8, -Math.PI / 2, '좌회전시');
  }

  private signals() {
    const g = this.group;
    const { ix, mid, half } = CITY;
    // 교차로: 각 진입 방향의 신호는 교차로 건너편에
    this.sig4E = mastSignal(g, [ix.crossW + 4, half + 1.5], [ix.crossW + 4, 3.4], [-1, 0]);
    this.sig.E = this.sig4E;
    this.sig.W = mastSignal(g, [ix.crossE - 4, -half - 1.5], [ix.crossE - 4, -3.4], [1, 0]);
    this.sig.S = mastSignal(g, [ix.x - ix.half - 1.5, ix.crossS + 4], [ix.x - 2, ix.crossS + 4], [0, -1]); // +Z로 가는 차가 봄
    this.sig.N = mastSignal(g, [ix.x + ix.half + 1.5, ix.crossN - 4], [ix.x + 2, ix.crossN - 4], [0, 1]);
    // 비보호 좌회전 장면용: 3색 신호등 + 표지
    const three = mastSignal(this.unprotected, [ix.crossW + 4.01, half + 1.5], [ix.crossW + 4, 3.4], [-1, 0], true);
    this.sig.E3 = three;
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.42), new THREE.MeshStandardMaterial({ map: textTexture('비보호', { w: 256, h: 112, bg: '#ffffff', fg: '#1f5fbf', size: 64, radius: 8 }) }));
    plate.position.set(ix.crossW + 4, 4.4, 3.4);
    plate.rotation.y = -Math.PI / 2;
    this.unprotected.add(plate);
    g.add(this.unprotected);
    // 보행 신호 (횡단보도 양끝)
    const pedAt = (id: string, x: number, z: number, face: number) => {
      const p = new PedSignal();
      p.root.position.set(x, CITY.curbH, z);
      p.root.rotation.y = face;
      g.add(p.root);
      this.ped[id] = p;
    };
    pedAt('E_n', ix.crossE + 2.6, half + 0.7, Math.PI); // 본 도로 서쪽 횡단보도 (본 도로를 건넘)
    pedAt('E_s', ix.crossE - 2.6, -half - 0.7, 0);
    pedAt('W_n', ix.crossW + 2.6, half + 0.7, Math.PI);
    pedAt('W_s', ix.crossW - 2.6, -half - 0.7, 0);
    pedAt('S_w', ix.x - ix.half - 0.7, ix.crossS + 2.6, Math.PI / 2); // 세로 도로 남쪽 횡단보도
    pedAt('S_e', ix.x + ix.half + 0.7, ix.crossS - 2.6, -Math.PI / 2);
    pedAt('N_w', ix.x - ix.half - 0.7, ix.crossN - 2.6, Math.PI / 2);
    pedAt('N_e', ix.x + ix.half + 0.7, ix.crossN + 2.6, -Math.PI / 2);
    // 골목 교차로: 본 도로 양방향 + 골목에서 나오는 차
    const al = CITY.alley;
    this.sig.alleyE = mastSignal(g, [al.x + 12, half + 1.5], [al.x + 12, 3.4], [-1, 0]);
    this.sig.alleyW = mastSignal(g, [al.x - 12, -half - 1.5], [al.x - 12, -3.4], [1, 0]);
    this.sig.alleyS = mastSignal(g, [al.x + al.half / 2, -half - 1.5], [al.x + al.half / 2, -5.5], [0, 1]);
    // 교차로가 아닌 곳: 진출입로 신호 + 횡단보도 신호
    this.sig.midE = mastSignal(g, [mid.drive + 6, half + 1.5], [mid.drive + 6, 3.4], [-1, 0]);
    this.sig.midW = mastSignal(g, [mid.drive - 6, -half - 1.5], [mid.drive - 6, -3.4], [1, 0]);
    this.sig.midDrive = mastSignal(g, [mid.drive - 1, half + 1.5], [mid.drive - 1, 7.2], [0, -1]);
    this.sig.crossE = mastSignal(g, [mid.cross + 4, half + 1.5], [mid.cross + 4, 3.4], [-1, 0], true);
    this.sig.crossW = mastSignal(g, [mid.cross - 4, -half - 1.5], [mid.cross - 4, -3.4], [1, 0], true);
    pedAt('mid_n', mid.cross + 2.6, half + 0.7, Math.PI);
    pedAt('mid_s', mid.cross - 2.6, -half - 0.7, 0);
  }

  /** 걷는 사람 배치: 위치(지면)·진행 방향·걸음 위상 */
  placePed(i: number, x: number, z: number, dirX: number, dirZ: number, phase: number) {
    const p = this.peds[i];
    p.holder.visible = true;
    p.holder.position.set(x, this.groundY(x, z), z);
    p.holder.rotation.y = Math.atan2(-dirZ, dirX);
    p.walker.pose(phase);
  }

  /** 보도 위면 연석 높이, 차도·진출로면 0 */
  groundY(x: number, z: number) {
    const { half, exit, mid, ix, curbH } = CITY;
    if (Math.abs(z) < half) return 0;
    if (z > 0 && Math.abs(x - exit.x) < exit.apron && z < exit.front) return 0.01;
    if (z < 0 && Math.abs(x - mid.drive) < mid.driveHalf) return 0.01;
    if (Math.abs(x - ix.x) < ix.half) return 0;
    if (z > 0 && Math.abs(x - CITY.alley.x) < CITY.alley.half) return 0;
    return curbH;
  }

  /**
   * 운전석 눈 위치에서 출구 양옆 벽 모서리 너머로 가려지는 보도 구역을 칠한다.
   * 눈이 건물 앞면을 지나면(벽이 더는 가리지 않으면) 숨긴다.
   */
  setBlind(eye: THREE.Vector3 | null) {
    const { exit, half, curbH } = CITY;
    const zf = exit.front;
    if (!eye || eye.z <= zf + 0.05) {
      this.blind.visible = false;
      return;
    }
    this.blind.visible = true;
    const pos = this.blind.geometry.getAttribute('position') as THREE.BufferAttribute;
    const y = curbH + 0.03;
    const far = 24;
    [-1, 1].forEach((side, i) => {
      const cx = exit.x + side * exit.passage;
      // 눈 → 벽 모서리 직선을 보도 바깥선(z = half)까지 연장
      const k = (zf - half) / (eye.z - zf);
      const xb = cx + (cx - eye.x) * k;
      const lim = exit.x + side * far;
      const xEdge = side < 0 ? Math.max(xb, lim) : Math.min(xb, lim);
      const v = i * 4;
      pos.setXYZ(v, cx, y, zf);
      pos.setXYZ(v + 1, xEdge, y, half + 0.05);
      pos.setXYZ(v + 2, lim, y, half + 0.05);
      pos.setXYZ(v + 3, lim, y, zf);
    });
    pos.needsUpdate = true;
  }

  /** 그림자를 만드는 범위(±18m)의 중심을 옮긴다 */
  setSunCenter(x: number, z: number) {
    this.sun.position.set(x + 12, 24, z + 9);
    this.sun.target.position.set(x, 0, z);
  }

  update(time: number) {
    const on = blinkOn(time, 1.2);
    for (const m of this.warnLamps) m.color.setHex(on ? 0xffb81f : 0x3a2a0c);
  }

  reset() {
    this.setSunCenter(0, 0);
    for (const c of this.cars) {
      c.root.visible = false;
      c.lights.brake = c.lights.turnL = c.lights.turnR = c.lights.hazard = false;
      c.lights.drl = true;
      c.setSteer(0);
    }
    this.ghost.root.visible = false;
    this.blind.visible = false;
    for (const p of this.peds) p.holder.visible = false;
    for (const s of Object.values(this.sig)) s.set({ red: true });
    for (const p of Object.values(this.ped)) p.set(false);
    this.unprotected.visible = false;
    this.sig4E.root.visible = true;
  }

  /** 비보호 좌회전 장면: 동쪽 방향 4색 신호 대신 3색 + 비보호 표지 */
  setUnprotected(on: boolean) {
    this.unprotected.visible = on;
    this.sig4E.root.visible = !on;
  }
}
