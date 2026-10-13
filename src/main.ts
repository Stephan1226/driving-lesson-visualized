import './ui/style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Overlay } from './ui/Overlay';
import { createCtx, applyDriver, eyeWorld, resetWorld, setEnv, applyMode } from './lesson/context';
import { Player } from './lesson/Player';
import { SECTIONS, STEPS } from './lesson/chapter1';
import { sfx } from './core/audio';
import { blinkOn } from './core/util';

const canvas = document.getElementById('scene') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: false });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.shadowMap.autoUpdate = false;

let player: Player;
const ui = new Overlay(document.getElementById('ui')!, SECTIONS, STEPS, {
  onStart: () => {
    sfx.unlock();
    void player.go(0);
  },
  onPrev: () => player.prev(),
  onNext: () => player.next(),
  onToggle: () => player.toggle(),
  onReplay: () => player.replay(),
  onJump: (i) => void player.go(i),
  onSound: () => {
    sfx.unlock();
    sfx.muted = !sfx.muted;
    return !sfx.muted;
  },
  onCamReset: () => player.exitUserCam(),
});

const ctx = createCtx(renderer, ui);
const pmrem = new THREE.PMREMGenerator(renderer);
ctx.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
ctx.scene.environmentIntensity = 0.55;

const controls = new OrbitControls(ctx.camera, canvas);
controls.enableDamping = true;
controls.enablePan = false;
controls.minDistance = 0.15;
controls.maxDistance = 30;
player = new Player(ctx, STEPS, controls);

// 시작 화면 뒤 배경 (차 주위를 천천히 도는 카메라)
resetWorld(ctx);
setEnv(ctx, 'park');
applyMode(ctx, 'exterior');
ctx.car.lights.drl = true;
function attract(time: number) {
  const a = time * 0.12 - 2.2;
  ctx.camera.position.set(Math.cos(a) * 8.5, 3.2, Math.sin(a) * 8.5);
  ctx.camera.lookAt(0, 0.6, 0);
}

// 주소로 바로 진입: ?step=3 (또는 id) &t=초 &pause=1
const params = new URLSearchParams(location.search);
const stepParam = params.get('step');
if (stepParam) {
  const idx = /^\d+$/.test(stepParam) ? Number(stepParam) - 1 : STEPS.findIndex((s) => s.id === stepParam);
  if (idx >= 0) {
    document.querySelector('.start')?.classList.add('hidden');
    void player.go(idx).then(() => {
      const t = Number(params.get('t') ?? 0);
      if (t > 0) {
        // 이벤트가 순서대로 일어나도록 잘게 나눠 진행
        for (let x = 0; x < t; x += 1 / 30) player.update(1 / 30);
      }
      if (params.get('pause') === '1') player.toggle();
    });
  }
}

addEventListener('keydown', (e) => {
  if (!ui.started) return;
  if (e.key === 'ArrowRight') player.next();
  else if (e.key === 'ArrowLeft') player.prev();
  else if (e.key === ' ') {
    e.preventDefault();
    player.toggle();
  } else if (e.key === 'r' || e.key === 'R') player.replay();
});

/** 상단 자막 카드에 가리지 않도록 화면 중심을 살짝 아래로 */
function fitCamera() {
  renderer.setSize(innerWidth, innerHeight);
  ctx.camera.aspect = innerWidth / innerHeight;
  ctx.camera.setViewOffset(innerWidth, innerHeight, 0, -innerHeight * 0.1, innerWidth, innerHeight);
  ctx.camera.updateProjectionMatrix();
}
fitCamera();
addEventListener('resize', fitCamera);

/** 차량 등화 상태를 계기판 표시와 비상등 버튼에 반영 */
function syncIndicators() {
  const L = ctx.car.lights;
  const cs = ctx.cockpit.cluster.state;
  const b = blinkOn(ctx.time - ctx.car.blinkT0);
  cs.turnL = (L.turnL || L.hazard) && b;
  cs.turnR = (L.turnR || L.hazard) && b;
  cs.low = L.low;
  cs.high = L.high || L.flash;
  cs.tail = L.tail || L.low;
  ctx.cockpit.hazardLit = L.hazard;
}

/**
 * 거울 화면을 인셋 안 캔버스에 그린다: 메인 캔버스의 해당 영역에 렌더한 뒤 즉시 2D 캔버스로 복사.
 * (인셋 카드 배경이 반투명이라 WebGL 캔버스를 그대로 비치게 할 수 없기 때문)
 */
function drawMirrorInset(id: NonNullable<typeof ctx.hud>) {
  const view = ui.insetQuery('.mirror-view');
  if (!view || ui.insetEl.classList.contains('hidden')) return;
  let cv = view.querySelector('canvas');
  if (!cv) {
    cv = document.createElement('canvas');
    view.prepend(cv);
  }
  const r = view.getBoundingClientRect();
  if (r.width < 4 || r.height < 4) return;
  ctx.mirrors.drawHud(renderer, id, r, innerHeight);
  const dpr = renderer.getPixelRatio();
  const w = Math.round(r.width * dpr);
  const h = Math.round(r.height * dpr);
  if (cv.width !== w || cv.height !== h) {
    cv.width = w;
    cv.height = h;
  }
  cv.getContext('2d')!.drawImage(renderer.domElement, r.left * dpr, r.top * dpr, w, h, 0, 0, w, h);
}

const timer = new THREE.Timer();
function frame(ts: number) {
  timer.update(ts);
  const dt = Math.min(timer.getDelta(), 1 / 20);
  ctx.time += dt;
  if (player.index >= 0) player.update(dt);
  else attract(ctx.time);

  syncIndicators();
  ctx.cockpit.apply(dt, ctx.time);
  applyDriver(ctx);
  ctx.car.update(dt, ctx.time, ctx.dusk);
  ctx.fx.update(ctx.time);
  ctx.garage.ceiling.visible = ctx.camera.position.y < 2.6;

  renderer.shadowMap.needsUpdate = true;
  ctx.mirrors.render(renderer, ctx.scene, eyeWorld(ctx));
  renderer.render(ctx.scene, ctx.camera);
  if (ctx.hud) drawMirrorInset(ctx.hud);
  ui.labels.update(ctx.camera, innerWidth, innerHeight);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// 디버그용
(window as unknown as { __app: unknown }).__app = { ctx, player, THREE };
