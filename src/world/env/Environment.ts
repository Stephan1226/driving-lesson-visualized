import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { Car } from '../car/Car';
import { MAT } from '../materials';
import { canvasTexture, textTexture, lerp } from '../../core/util';

export type EnvName = 'park' | 'garage';

/** 공원 주차장 남쪽 출구(출구 전용 통로 x0..x1)와 그 앞 왕복 2차로 도로(중심 z, 반폭 half) */
export const PARK_ROAD = { x0: 2.5, x1: 9.5, lotZ: -19.1, z: -31.25, half: 4, lane: 1.85, stopZ: -26.45 };

/** 결정적 난수(매번 같은 배치) */
function rng(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

function line(group: THREE.Group, x0: number, z0: number, x1: number, z1: number, w = 0.12, color = 0xf4f4f0, y = 0.012) {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(len, w), new THREE.MeshStandardMaterial({ color, roughness: 0.8 }));
  m.rotation.x = -Math.PI / 2;
  m.rotation.z = -Math.atan2(z1 - z0, x1 - x0);
  m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
  m.receiveShadow = true;
  group.add(m);
  return m;
}

const noiseTex = (base: string, spread: number, size = 256) =>
  canvasTexture(size, size, (c, w, h) => {
    c.fillStyle = base;
    c.fillRect(0, 0, w, h);
    const r = rng(7);
    for (let i = 0; i < w * h * 0.25; i++) {
      const v = (r() - 0.5) * spread;
      c.fillStyle = v > 0 ? `rgba(255,255,255,${v})` : `rgba(0,0,0,${-v})`;
      c.fillRect(r() * w, r() * h, 1.5, 1.5);
    }
  });

// ─────────────────────────────────────────────────────────────
export class ParkEnv {
  group = new THREE.Group();
  hemi = new THREE.HemisphereLight(0xcfe6ff, 0x5d6b4a, 1.1);
  sun = new THREE.DirectionalLight(0xfff2dc, 2.6);
  sky: THREE.Mesh;
  skyMat: THREE.ShaderMaterial;
  lamps: THREE.MeshStandardMaterial;
  lampLights: THREE.PointLight[] = [];
  fogDay = new THREE.Color(0xdfeaf5);
  fogDusk = new THREE.Color(0x3a3550);
  neighbors: Car[] = [];
  /** 앞 도로를 지나가는 차 (챕터 2) */
  traffic = new Car({ color: 0xb8322a, plate: '57다 2468' });

  constructor() {
    const g = this.group;
    this.sun.position.set(12, 22, 9);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -16; sc.right = 16; sc.top = 16; sc.bottom = -16; sc.near = 1; sc.far = 70;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.02;
    g.add(this.hemi, this.sun, this.sun.target);

    this.skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        top: { value: new THREE.Color(0x5aa2f0) },
        horizon: { value: new THREE.Color(0xe6f1fb) },
      },
      vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 top; uniform vec3 horizon; varying vec3 vP;
        void main(){ float k = smoothstep(-0.05, 0.5, vP.y); gl_FragColor = vec4(mix(horizon, top, k), 1.0); }`,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), this.skyMat);
    g.add(this.sky);

    const grassTex = noiseTex('#86b862', 0.18);
    grassTex.wrapS = grassTex.wrapT = THREE.RepeatWrapping;
    grassTex.repeat.set(60, 60);
    const grass = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ map: grassTex, roughness: 1 }));
    grass.rotation.x = -Math.PI / 2;
    grass.receiveShadow = true;
    g.add(grass);

    const asphaltTex = noiseTex('#585c63', 0.22);
    asphaltTex.wrapS = asphaltTex.wrapT = THREE.RepeatWrapping;
    asphaltTex.repeat.set(10, 12);
    const lot = new THREE.Mesh(new THREE.PlaneGeometry(32, 38), new THREE.MeshStandardMaterial({ map: asphaltTex, roughness: 0.95 }));
    lot.rotation.x = -Math.PI / 2;
    lot.position.y = 0.006;
    lot.receiveShadow = true;
    g.add(lot);
    // 연석 (남쪽은 출구만큼 비움)
    const curbMat = new THREE.MeshStandardMaterial({ color: 0xc9c8c2, roughness: 0.9 });
    const curb = (x0: number, z0: number, x1: number, z1: number) => {
      const c = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 0.15, z1 - z0), curbMat);
      c.position.set((x0 + x1) / 2, 0.075, (z0 + z1) / 2);
      c.receiveShadow = c.castShadow = true;
      g.add(c);
    };
    const road = PARK_ROAD;
    curb(-16.2, -19.225, road.x0, -18.975);
    curb(road.x1, -19.225, 16.2, -18.975);
    curb(-16.2, 18.975, 16.2, 19.225);
    curb(-16.225, -19.2, -15.975, 19.2);
    curb(15.975, -19.2, 16.225, 19.2);

    // 주차 구획
    const rows: [number, number][] = [[-2.5, 2.5], [9.5, 14.5], [-14.5, -9.5]];
    for (const [x0, x1] of rows) {
      for (let k = -7; k <= 7; k++) line(g, x0, k * 2.5 + 1.25, x1, k * 2.5 + 1.25);
      const back = x0 < 0 && x1 <= 2.5 ? x0 : x1;
      line(g, back, -16.25, back, 16.25);
    }
    // 진행 방향 화살표 (한 방향 순환: 서쪽 통로 ↑, 동쪽 통로 ↓ 출구)
    for (const [x, z, a] of [[6, -8, Math.PI / 2], [6, 8, Math.PI / 2], [-6, 8, -Math.PI / 2], [-6, -8, -Math.PI / 2]] as const) {
      const arrow = new THREE.Mesh(
        new THREE.ShapeGeometry(arrowShape()),
        new THREE.MeshStandardMaterial({ color: 0xf4f4f0, roughness: 0.8 }),
      );
      arrow.rotation.x = -Math.PI / 2;
      arrow.rotation.z = a;
      arrow.position.set(x, 0.012, z);
      g.add(arrow);
    }

    // 주변 차량
    const others: [number, number, number, number][] = [
      [0, -7.5, 0, 0xe9ebee], [0, 7.5, 0, 0x2b2f36], [0, -10, 0, 0x9aa3ad], [0, 12.5, 0, 0xb63a2f], [0, 5, 0, 0x6f8fa8],
      [12, -2.5, Math.PI, 0xf2f2f2], [12, 2.5, Math.PI, 0x3b4a5c], [12, 10, Math.PI, 0x8c2e2e], [12, -7.5, Math.PI, 0x30343b],
      [-12, 0, 0, 0xd9d9d6], [-12, 5, 0, 0x2e4b7a], [-12, -5, 0, 0x4a4f57], [-12, -12.5, 0, 0xe8e2d4],
    ];
    const r = rng(42);
    for (const [x, z, h, color] of others) {
      const car = new Car({ color, plate: `${10 + Math.floor(r() * 89)}${'가나다라마'[Math.floor(r() * 5)]} ${1000 + Math.floor(r() * 8999)}` });
      car.setPose(x, z, h);
      car.setMirrorFold(1);
      g.add(car.root);
      this.neighbors.push(car);
    }

    // 나무·가로등·벤치
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4a33, roughness: 0.9 });
    const leafMats = [0x4f8f3a, 0x5c9c42, 0x3f7d34].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9, flatShading: true }));
    const tree = (x: number, z: number, s: number) => {
      const t = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12 * s, 0.18 * s, 2.2 * s, 8), trunkMat);
      trunk.position.y = 1.1 * s;
      t.add(trunk);
      for (let i = 0; i < 3; i++) {
        const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry((1.3 - i * 0.2) * s, 1), leafMats[i % 3]);
        leaf.position.set((r() - 0.5) * 0.8 * s, (2.6 + i * 0.8) * s, (r() - 0.5) * 0.8 * s);
        t.add(leaf);
      }
      t.position.set(x, 0, z);
      t.traverse((o) => (o.castShadow = true));
      return t;
    };
    // 도로와 주차장~도로 사이 잔디(출구 앞)에 걸리는 나무는 빼기 (난수 순서는 그대로 유지)
    const onRoad = (x: number, z: number) =>
      Math.abs(z - road.z) < road.half + 2.4 || (z < road.lotZ && z > road.z && Math.abs(x) < 28);
    for (let i = 0; i < 46; i++) {
      const side = i % 4;
      const u = (r() - 0.5) * 2;
      const d = 18.5 + r() * 14;
      const [x, z] = side === 0 ? [u * 26, -d - 2] : side === 1 ? [u * 26, d + 2] : side === 2 ? [-d, u * 26] : [d, u * 26];
      const t = tree(x, z, 0.8 + r() * 0.7);
      if (!onRoad(x, z)) g.add(t);
    }
    this.lamps = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffe6b0, emissiveIntensity: 0.1 });
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x3b4048, roughness: 0.5, metalness: 0.5 });
    for (const [x, z] of [[-16.8, -10], [-16.8, 10], [16.8, -10], [16.8, 10], [3.3, -17.6], [3.3, 17.6]]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 6, 10), poleMat);
      pole.position.set(x, 3, z);
      const head = new THREE.Mesh(new RoundedBoxGeometry(0.6, 0.12, 0.3, 2, 0.04), poleMat);
      head.position.set(x + (x > 0 ? -0.25 : 0.25), 6, z);
      const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.02, 0.2), this.lamps);
      bulb.position.set(head.position.x, 5.93, z);
      pole.castShadow = true;
      g.add(pole, head, bulb);
    }
    for (const [x, z] of [[-6, 0], [6, 0]]) {
      const pl = new THREE.PointLight(0xffd9a0, 0, 26, 1.4);
      pl.position.set(x, 5.5, z);
      g.add(pl);
      this.lampLights.push(pl);
    }
    const benchMat = new THREE.MeshStandardMaterial({ color: 0x9a6b43, roughness: 0.8 });
    for (const [x, z, a] of [[-19, -4, Math.PI / 2], [-19, 4, Math.PI / 2], [19.5, 0, -Math.PI / 2]]) {
      const b = new THREE.Group();
      const seat = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.06, 0.45), benchMat);
      seat.position.y = 0.45;
      const back = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.4, 0.05), benchMat);
      back.position.set(0, 0.75, -0.22);
      b.add(seat, back);
      for (const lx of [-0.8, 0.8]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.45, 0.4), poleMat);
        leg.position.set(lx, 0.22, 0);
        b.add(leg);
      }
      b.position.set(x, 0, z);
      b.rotation.y = a;
      b.traverse((o) => (o.castShadow = true));
      g.add(b);
    }
    // 원경 아파트
    const bldMat = new THREE.MeshStandardMaterial({ color: 0xe9e4da, roughness: 1 });
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + 0.2;
      const d = 95 + r() * 40;
      const h = 30 + r() * 30;
      const b = new THREE.Mesh(new THREE.BoxGeometry(16, h, 10), bldMat);
      let bz = Math.sin(a) * d;
      if (Math.abs(bz - road.z) < 16) bz = road.z + Math.sign(bz - road.z) * 16;
      b.position.set(Math.cos(a) * d, h / 2, bz);
      b.rotation.y = -a + Math.PI / 2;
      g.add(b);
    }
    // 표지판
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(1.6, 0.8),
      new THREE.MeshStandardMaterial({ map: textTexture('공원 주차장\nP', { w: 512, h: 256, bg: '#1f5fbf', fg: '#ffffff', size: 70 }) }),
    );
    sign.position.set(-16.6, 2.6, 0);
    sign.rotation.y = Math.PI / 2;
    const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.4), poleMat);
    sp.position.set(-16.62, 1.2, 0);
    g.add(sign, sp);

    // ── 출구 통로와 앞 도로 ─────────────────────────
    const edge = road.z + road.half;
    const roadMat = (w: number, d: number) => {
      const tex = asphaltTex.clone();
      tex.repeat.set(w / 3.2, d / 3.2);
      return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 });
    };
    const flat = (w: number, d: number, x: number, z: number) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), roadMat(w, d));
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, 0.006, z);
      m.receiveShadow = true;
      g.add(m);
    };
    flat(road.x1 - road.x0, -19 - edge, (road.x0 + road.x1) / 2, (-19 + edge) / 2);
    flat(400, road.half * 2, 0, road.z);
    curb(road.x0 - 0.25, edge, road.x0, -18.975);
    curb(road.x1, edge, road.x1 + 0.25, -18.975);
    curb(-200, edge, road.x0 - 0.25, edge + 0.25);
    curb(road.x1 + 0.25, edge, 200, edge + 0.25);
    curb(-200, road.z - road.half - 0.25, 200, road.z - road.half);
    // 중앙선(노란 겹선)·가장자리선·정지선
    for (const dz of [-0.1, 0.1]) line(g, -200, road.z + dz, 200, road.z + dz, 0.1, 0xf2c230);
    line(g, -200, edge - 0.3, road.x0 - 0.3, edge - 0.3);
    line(g, road.x1 + 0.3, edge - 0.3, 200, edge - 0.3);
    line(g, -200, road.z - road.half + 0.3, 200, road.z - road.half + 0.3);
    line(g, road.x0 + 0.15, road.stopZ, road.x1 - 0.15, road.stopZ, 0.35);
    const stopText = new THREE.Mesh(
      new THREE.PlaneGeometry(3.2, 1.0),
      new THREE.MeshStandardMaterial({ map: textTexture('일단정지', { w: 512, h: 160, bg: 'transparent', fg: '#f4f4f0', size: 120, weight: 800 }), transparent: true, roughness: 0.8 }),
    );
    stopText.rotation.x = -Math.PI / 2;
    stopText.position.set((road.x0 + road.x1) / 2, 0.012, road.stopZ + 1.9);
    g.add(stopText);
    const exitSign = new THREE.Mesh(
      new THREE.PlaneGeometry(1.3, 0.5),
      new THREE.MeshStandardMaterial({ map: textTexture('출구 EXIT', { w: 512, h: 196, bg: '#1b7f4b', fg: '#ffffff', size: 74 }) }),
    );
    exitSign.position.set(road.x1 + 0.9, 2.45, road.lotZ - 0.5);
    const ep = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.4), poleMat);
    ep.position.set(road.x1 + 0.9, 1.2, road.lotZ - 0.52);
    g.add(exitSign, ep);
    // 가로수
    for (let x = -64; x <= 100; x += 12) {
      g.add(tree(x, road.z - road.half - 3, 0.85));
      if (Math.abs(x) > 20) g.add(tree(x + 6, edge + 3, 0.85));
    }

    this.traffic.root.visible = false;
    g.add(this.traffic.root);
  }

  /** 그림자를 만드는 범위(±16m)의 중심을 옮긴다 — 차가 주차장 밖으로 나갈 때 */
  setSunCenter(x: number, z: number) {
    this.sun.position.set(x + 12, 22, z + 9);
    this.sun.target.position.set(x, 0, z);
  }

  reset() {
    this.setSunCenter(0, 0);
    this.traffic.root.visible = false;
  }

  setDaylight(k: number, scene: THREE.Scene) {
    this.sun.intensity = lerp(0.12, 2.6, k);
    this.sun.color.setHSL(lerp(0.06, 0.1, k), lerp(0.8, 0.4, k), lerp(0.55, 0.93, k));
    this.hemi.intensity = lerp(0.28, 1.1, k);
    this.skyMat.uniforms.top.value.set(0x5aa2f0).lerp(new THREE.Color(0x141a33), 1 - k);
    this.skyMat.uniforms.horizon.value.set(0xe6f1fb).lerp(new THREE.Color(0xf09a6c), 1 - k);
    this.lamps.emissiveIntensity = lerp(4, 0.1, k);
    for (const l of this.lampLights) l.intensity = lerp(30, 0, k);
    if (scene.fog) (scene.fog as THREE.Fog).color.copy(this.fogDay).lerp(this.fogDusk, 1 - k);
  }
}

// ─────────────────────────────────────────────────────────────
export const PILLAR = { x0: 1.35, x1: 2.15, z0: 1.35, z1: 2.15 };

export class GarageEnv {
  group = new THREE.Group();
  neighbors: Car[] = [];
  neighbor: Car;
  pillar: THREE.Group;
  /** 위에서 내려다볼 때 숨기는 천장 요소 */
  ceiling = new THREE.Group();

  constructor() {
    const g = this.group;
    const hemi = new THREE.HemisphereLight(0xd8e4ec, 0x3c4a40, 0.85);
    const key = new THREE.DirectionalLight(0xf2f6ff, 0.9);
    key.position.set(4, 10, 3);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    const sc = key.shadow.camera;
    sc.left = -14; sc.right = 14; sc.top = 14; sc.bottom = -14; sc.near = 1; sc.far = 30;
    key.shadow.bias = -0.0005;
    key.shadow.normalBias = 0.02;
    g.add(hemi, key, key.target);
    for (const [x, z] of [[0, -4], [0, 4], [6, -6], [6, 6], [6, 0], [12, 0]]) {
      const p = new THREE.PointLight(0xeaf2ff, 6, 11, 1.4);
      p.position.set(x, 2.5, z);
      g.add(p);
    }

    const floorTex = noiseTex('#4f8a6b', 0.1);
    floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
    floorTex.repeat.set(16, 12);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(44, 34), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.45, metalness: 0.05 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(5.5, 0, 0);
    floor.receiveShadow = true;
    const aisle = new THREE.Mesh(new THREE.PlaneGeometry(7, 34), new THREE.MeshStandardMaterial({ color: 0x5a6a62, roughness: 0.6 }));
    aisle.rotation.x = -Math.PI / 2;
    aisle.position.set(6, 0.004, 0);
    aisle.receiveShadow = true;
    g.add(floor, aisle);
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(44, 34), new THREE.MeshStandardMaterial({ color: 0x8a8e93, roughness: 1 }));
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(5.5, 2.75, 0);
    this.ceiling.add(ceil);
    g.add(this.ceiling);
    const wallMat = new THREE.MeshStandardMaterial({ color: 0xd9dcd8, roughness: 0.95 });
    const stripeMat = new THREE.MeshStandardMaterial({ color: 0x2f8a5b, roughness: 0.8 });
    for (const [x, ry] of [[-3.1, Math.PI / 2], [15.2, -Math.PI / 2]] as const) {
      const w = new THREE.Mesh(new THREE.PlaneGeometry(34, 2.75), wallMat);
      w.position.set(x, 1.375, 0);
      w.rotation.y = ry;
      const st = new THREE.Mesh(new THREE.PlaneGeometry(34, 0.25), stripeMat);
      st.position.set(x + (x < 0 ? 0.01 : -0.01), 1.1, 0);
      st.rotation.y = ry;
      g.add(w, st);
    }
    // 천장 형광등·배관
    const tube = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xf4f8ff, emissiveIntensity: 3 });
    for (let z = -14; z <= 14; z += 4) {
      for (const x of [0, 6, 12]) {
        const f = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.04, 0.12), tube);
        f.position.set(x, 2.71, z);
        this.ceiling.add(f);
      }
    }
    const pipeMat = new THREE.MeshStandardMaterial({ color: 0xb33a2e, roughness: 0.6 });
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 34, 12), pipeMat);
    pipe.rotation.x = Math.PI / 2;
    pipe.position.set(3.2, 2.55, 0);
    this.ceiling.add(pipe);

    // 주차 구획 (기둥 3칸마다)
    const slotLines = [-14.75, -12.25, -9.75, -7.25, -6.25, -3.75, -1.25, 1.25, 2.25, 4.75, 7.25, 9.75, 10.75, 13.25];
    for (const z of slotLines) line(g, -2.9, z, 2.5, z, 0.12);
    for (const z of slotLines) line(g, 9.5, z, 14.9, z, 0.12);
    line(g, 2.5, -16, 2.5, 16, 0.1, 0xf2c94c);
    line(g, 9.5, -16, 9.5, 16, 0.1, 0xf2c94c);
    for (const [x, z, a] of [[6, -6, 0], [6, 6, 0], [6, 12, 0]] as const) {
      const arrow = new THREE.Mesh(new THREE.ShapeGeometry(arrowShape()), new THREE.MeshStandardMaterial({ color: 0xf4f4f0 }));
      arrow.rotation.x = -Math.PI / 2;
      arrow.rotation.z = a - Math.PI / 2;
      arrow.position.set(x, 0.012, z);
      g.add(arrow);
    }

    // 기둥
    const pillarTex = textTexture('B2\nA-12', { w: 256, h: 256, bg: '#2f8a5b', fg: '#ffffff', size: 70, radius: 0 });
    const guardTex = canvasTexture(256, 256, (c) => {
      c.fillStyle = '#f2c230';
      c.fillRect(0, 0, 256, 256);
      c.fillStyle = '#1d1d1d';
      for (let i = -256; i < 512; i += 64) {
        c.beginPath();
        c.moveTo(i, 256);
        c.lineTo(i + 32, 256);
        c.lineTo(i + 32 + 256, 0);
        c.lineTo(i + 256, 0);
        c.fill();
      }
    });
    const makePillar = (cx: number, cz: number) => {
      const p = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.8, 2.75, 0.8), MAT.concrete);
      body.position.y = 1.375;
      const guard = new THREE.Mesh(new THREE.BoxGeometry(0.84, 1.0, 0.84), new THREE.MeshStandardMaterial({ map: guardTex, roughness: 0.7 }));
      guard.position.y = 0.5;
      const band = new THREE.Mesh(new THREE.BoxGeometry(0.81, 0.5, 0.81), new THREE.MeshStandardMaterial({ map: pillarTex }));
      band.position.y = 1.7;
      p.add(body, guard, band);
      p.position.set(cx, 0, cz);
      p.traverse((o) => {
        o.castShadow = true;
        o.receiveShadow = true;
      });
      g.add(p);
      return p;
    };
    this.pillar = makePillar((PILLAR.x0 + PILLAR.x1) / 2, (PILLAR.z0 + PILLAR.z1) / 2);
    makePillar(1.75, -6.75);
    makePillar(1.75, 10.25);
    for (const z of [-6.75, 1.75, 10.25]) makePillar(10.25, z);

    // 주변 차량
    this.neighbor = new Car({ color: 0xeceff2, doorRight: true, plate: '34나 5678' });
    this.neighbor.setPose(0, -2.35, 0);
    this.neighbor.setMirrorFold(1);
    g.add(this.neighbor.root);
    const others: [number, number, number, number][] = [
      [0, -5, 0, 0x30343b], [0, 3.5, 0, 0x7b8794], [0, 8.5, 0, 0xb3392d], [0, -8.5, 0, 0xdedad0],
      [12.2, -2.5, Math.PI, 0x23262c], [12.2, 3.5, Math.PI, 0xe9ebee], [12.2, 6, Math.PI, 0x5a7896], [12.2, -5, Math.PI, 0xa9b0b8],
    ];
    for (const [x, z, h, color] of others) {
      const car = new Car({ color });
      car.setPose(x, z, h);
      car.setMirrorFold(1);
      g.add(car.root);
      this.neighbors.push(car);
    }
    // 출구 표지
    const exit = new THREE.Mesh(
      new THREE.PlaneGeometry(1.4, 0.4),
      new THREE.MeshBasicMaterial({ map: textTexture('출구  →', { w: 512, h: 146, bg: '#1b7f4b', fg: '#ffffff', size: 74 }) }),
    );
    exit.position.set(6, 2.4, -6);
    this.ceiling.add(exit);
  }
}

function arrowShape() {
  const s = new THREE.Shape();
  s.moveTo(-1.2, -0.15);
  s.lineTo(0.4, -0.15);
  s.lineTo(0.4, -0.45);
  s.lineTo(1.2, 0);
  s.lineTo(0.4, 0.45);
  s.lineTo(0.4, 0.15);
  s.lineTo(-1.2, 0.15);
  s.closePath();
  return s;
}
