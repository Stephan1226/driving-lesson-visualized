import * as THREE from 'three';
import { Car, lightsOff } from '../world/car/Car';
import { Cockpit, DZ, EYE } from '../world/car/Cockpit';
import { Hand, Mannequin, type HandPose, type HandTarget, type FootTarget } from '../world/car/Driver';
import { clusterDefaults } from '../world/car/Cluster';
import { placeCoin } from '../world/car/Wheel';
import { ParkEnv, GarageEnv, type EnvName } from '../world/env/Environment';
import { CityEnv } from '../world/env/City';
import { Fx } from '../world/Fx';
import { Mirrors, type MirrorId } from '../world/Mirrors';
import { MAT } from '../world/materials';
import type { Overlay } from '../ui/Overlay';
import type { Labels } from '../ui/Labels';
import { sfx, type Sfx } from '../core/audio';
import type { Mode, V3 } from './types';

export type HandSpec = HandTarget | 'wheel' | 'lap' | (() => HandTarget);
export interface DriverPose {
  handL?: HandSpec;
  handR?: HandSpec;
  footR?: 'brake' | 'accel' | 'floor' | 'between';
  footL?: 'rest' | 'floor';
  /** 다리 위치 블렌드용 (0..1, footR 이전 위치 → 현재) */
}

export interface Ctx {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  car: Car;
  cockpit: Cockpit;
  man: Mannequin;
  handL: Hand;
  handR: Hand;
  park: ParkEnv;
  garage: GarageEnv;
  city: CityEnv;
  env: EnvName;
  mode: Mode;
  fx: Fx;
  mirrors: Mirrors;
  ui: Overlay;
  labels: Labels;
  sfx: Sfx;
  time: number;
  dusk: number;
  driver: DriverPose | null;
  ghost: { L?: () => HandTarget; R?: () => HandTarget };
  /** 오른발 페달 이동(0 = 브레이크, 1 = 가속) */
  footBlend: number;
  /** 인셋에 크게 보여줄 거울 */
  hud: MirrorId | null;
}

export function createCtx(renderer: THREE.WebGLRenderer, ui: Overlay): Ctx {
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xdfeaf5, 45, 160);
  const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.02, 900);
  const car = new Car({ color: 0x2f6fe0, detailed: true, plate: '12가 3456' });
  const cockpit = new Cockpit();
  car.root.add(cockpit.root);
  const man = new Mannequin();
  car.root.add(man.root);
  const handL = new Hand(true, MAT.skin, true);
  const handR = new Hand(false, MAT.skin, true);
  car.root.add(handL.root, handR.root);
  const park = new ParkEnv();
  const garage = new GarageEnv();
  const city = new CityEnv();
  const fx = new Fx();
  scene.add(park.group, garage.group, city.group, car.root, fx.group);
  const mirrors = new Mirrors({
    left: car.mirrors[0].glass,
    right: car.mirrors[1].glass,
    room: cockpit.roomMirrorGlass,
  });
  car.onTick = (on) => sfx.tick(on);
  return {
    renderer, scene, camera, car, cockpit, man, handL, handR, park, garage, city, env: 'park', mode: 'exterior', fx, mirrors, ui,
    labels: ui.labels, sfx, time: 0, dusk: 0, driver: null, ghost: {}, footBlend: 0, hud: null,
  };
}

export function setEnv(ctx: Ctx, env: EnvName) {
  ctx.env = env;
  ctx.park.group.visible = env === 'park';
  ctx.garage.group.visible = env === 'garage';
  ctx.city.group.visible = env === 'city';
  const fog = ctx.scene.fog as THREE.Fog;
  if (env === 'city') {
    ctx.scene.background = null;
    fog.color.set(0xe3ebf2);
    fog.near = 70;
    fog.far = 240;
  } else if (env === 'garage') {
    ctx.scene.background = new THREE.Color(0x1a1d20);
    fog.color.set(0x2a2e31);
    fog.near = 14;
    fog.far = 40;
  } else {
    ctx.scene.background = null;
    fog.near = 45;
    fog.far = 160;
    ctx.park.setDaylight(1 - ctx.dusk, ctx.scene);
  }
}

export function setDusk(ctx: Ctx, k: number) {
  ctx.dusk = k;
  if (ctx.env === 'park') ctx.park.setDaylight(1 - k, ctx.scene);
}

export function applyMode(ctx: Ctx, mode: Mode) {
  ctx.mode = mode;
  ctx.car.setGhost(mode === 'cutaway');
  ctx.cockpit.setCutaway(mode === 'cutaway');
  ctx.cockpit.setInteriorLight(mode === 'cutaway' ? 1 : mode === 'interior' ? 0.55 : 0);
  ctx.mirrors.enabled = mode === 'interior';
}

/** 모든 장면 상태를 기본값으로 */
export function resetWorld(ctx: Ctx) {
  const { car, cockpit: c, fx } = ctx;
  car.setPose(0, 0, 0);
  car.setSteer(0);
  car.setRoll(0);
  car.setPitch(0);
  car.setHood(0);
  car.setDipstick(0);
  car.lights = lightsOff();
  car.wiperMode = 'off';
  car.washer = 0;
  const fl = car.wheels[0];
  fl.setTreadWear(0.15);
  fl.setPadWear(0.1);
  fl.setXray(0);
  car.wheels.forEach((w) => w.setDeflate(0));
  placeCoin(fl, 0);
  car.mirrors.forEach((m) => m.pivot.rotation.set(0, 0, 0));
  ctx.garage.neighbor.setDoor(0);
  ctx.park.reset();
  ctx.city.reset();
  car.setMirrorFold(0);

  Object.assign(c, {
    steer: 0, tilt: 0, tele: 0, tiltLever: 0, lStalkV: 0, lStalkPush: 0, lightDial: 0, rStalkV: 0, rStalkPull: 0,
    colGearV: 0, colGearBtn: 0, gearType: 'lever', leverPos: 0, leverBtn: 0, dialPos: 0, dialPBtn: 0, epbSwitch: 0,
    autoHoldBtn: 0, mechanical: false, handbrake: 1, handbrakeBtn: 0, startBtn: 0, startGlow: 'off', hazardBtn: 0,
    hazardLit: false, brake: 0, accel: 0, mirrorSel: null, belt: 1, beltVisible: false,
  });
  c.mirrorPad.set(0, 0);
  c.roomMirror.set(0, 0);
  c.seat.slide = 0;
  c.seat.recline = (18 * Math.PI) / 180;
  c.seat.height = 0;
  c.seat.headUp = 0;
  c.cluster.state = clusterDefaults();
  ctx.man.root.visible = false;
  ctx.man.setOpacity(1);
  ctx.handL.root.visible = false;
  ctx.handR.root.visible = false;
  ctx.driver = null;
  ctx.ghost = {};
  ctx.footBlend = 0;
  ctx.hud = null;
  car.blinkT0 = 0;
  fx.reset();
  ctx.labels.clear();
  setDusk(ctx, 0);
}

// ── 좌표 도우미 ─────────────────────────────────────────
const _w = new THREE.Vector3();
/** 오브젝트의 차량 로컬 좌표 */
export function local(ctx: Ctx, o: THREE.Object3D) {
  o.getWorldPosition(_w);
  return ctx.car.root.worldToLocal(_w.clone());
}
export const vec = (v: V3) => new THREE.Vector3(...v);

/** 차량 로컬 좌표 → 월드 */
export function world(ctx: Ctx, v: V3 | THREE.Vector3) {
  const p = Array.isArray(v) ? new THREE.Vector3(...v) : v.clone();
  return ctx.car.root.localToWorld(p);
}

/** 콕핏 앵커를 잡는 유령 손 */
export function grab(ctx: Ctx, anchor: string, finger: V3, back: V3, pose: HandPose, off: V3 = [0, 0, 0]): () => HandTarget {
  return () => {
    const p = local(ctx, ctx.cockpit.anchors[anchor]).add(new THREE.Vector3(...off));
    const f = new THREE.Vector3(...finger).normalize();
    const pos = p.clone().addScaledVector(f, -0.075);
    return { pos, finger: f, back: new THREE.Vector3(...back), pose };
  };
}

/** 손을 특정 지점에서 다른 지점으로 이동시키는 보간 */
export function blendHand(a: HandTarget, b: HandTarget, k: number, lift = 0.06): HandTarget {
  const pos = a.pos.clone().lerp(b.pos, k);
  pos.y += Math.sin(k * Math.PI) * lift;
  return {
    pos,
    finger: a.finger.clone().lerp(b.finger, k).normalize(),
    back: a.back.clone().lerp(b.back, k).normalize(),
    pose: k < 0.5 ? a.pose : b.pose,
  };
}

/** 유령 손/마네킹 자세를 매 프레임 반영 (콕핏 apply 이후 호출) */
export function applyDriver(ctx: Ctx) {
  const { cockpit: c, man, car } = ctx;
  car.root.updateMatrixWorld(true);
  for (const [side, hand] of [['L', ctx.handL], ['R', ctx.handR]] as const) {
    const fn = ctx.ghost[side];
    hand.root.visible = !!fn;
    if (fn) {
      const t = fn();
      hand.place(t.pos, t.finger, t.back);
      hand.setPose(t.pose, 0.25);
    }
  }
  const d = ctx.driver;
  man.root.visible = !!d;
  if (!d) return;
  const hip = c.seat.hip();
  const resolve = (spec: HandSpec | undefined, side: -1 | 1): HandTarget => {
    if (typeof spec === 'function') return spec();
    if (spec && spec !== 'wheel' && spec !== 'lap') return spec;
    if (spec === 'lap') {
      const p = hip.clone().add(new THREE.Vector3(0.24, 0.12, side * 0.11));
      return { pos: p, finger: new THREE.Vector3(1, -0.4, 0), back: new THREE.Vector3(0, 1, 0), pose: 'relaxed' };
    }
    const g = c.wheelGrip(side < 0 ? 180 : 0, car.root);
    return { ...g, pose: 'grip' };
  };
  const foot = (which: 'brake' | 'accel' | 'floor' | 'between' | 'rest', press: number): FootTarget => {
    let toe: THREE.Vector3;
    if (which === 'rest') toe = local(ctx, c.anchors.footrest).add(new THREE.Vector3(-0.02, 0.06, 0.02));
    else if (which === 'floor') toe = new THREE.Vector3(0.6, 0.27, DZ + 0.02);
    else {
      const b = local(ctx, c.anchors.brake).add(new THREE.Vector3(-0.01, 0.03, 0));
      const a = local(ctx, c.anchors.accel).add(new THREE.Vector3(-0.01, 0.0, 0));
      const k = which === 'brake' ? 0 : which === 'accel' ? 1 : ctx.footBlend;
      toe = b.clone().lerp(a, k);
      toe.y += Math.sin(k * Math.PI) * 0.05;
    }
    // 뒤꿈치는 바닥 근처 고정, 발끝이 페달 위
    const heel = new THREE.Vector3(toe.x - 0.21, 0.24, toe.z - 0.01);
    const ankle = heel.clone().add(new THREE.Vector3(0.02, 0.08 + press * 0.0, 0));
    return { ankle, toe };
  };
  man.update({
    hip,
    back: c.seat.backDir(),
    hands: [resolve(d.handL ?? 'wheel', -1), resolve(d.handR ?? 'wheel', 1)],
    feet: [foot(d.footL ?? 'rest', 0), foot(d.footR ?? 'brake', c.brake)],
  });
}

/** 운전석 눈 위치(월드) — 미러 반사 계산용 */
export function eyeWorld(ctx: Ctx) {
  const s = ctx.cockpit.seat;
  return world(ctx, EYE.clone().add(new THREE.Vector3(s.slide, s.height, 0)));
}
