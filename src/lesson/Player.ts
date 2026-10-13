import * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { Ctx } from './context';
import { resetWorld, setEnv, applyMode, setDusk } from './context';
import type { CamPose, Shot, Step } from './types';
import { ease, smooth } from '../core/util';

const HOLD = 1.6;
const UP = new THREE.Vector3(0, 1, 0);

export class Player {
  index = -1;
  t = 0;
  playing = true;
  userCam = false;
  private busy = false;
  private camFrom: CamPose | null = null;
  private blend = 1;
  private blendDur = 1.6;
  private look = new THREE.Vector3();

  constructor(
    private ctx: Ctx,
    public steps: Step[],
    private controls: OrbitControls,
  ) {
    controls.addEventListener('start', () => {
      if (this.index < 0) return;
      this.userCam = true;
      ctx.ui.freeCam.classList.remove('hidden');
    });
  }

  get step() {
    return this.steps[this.index];
  }

  async go(i: number) {
    if (this.busy || i < 0 || i >= this.steps.length) return;
    this.busy = true;
    const prev = this.steps[this.index];
    const next = this.steps[i];
    const fade = !prev || prev.env !== next.env || !!next.cut || i < this.index - 1;
    if (fade && prev) await this.ctx.ui.fade(true);
    this.index = i;
    this.t = 0;
    resetWorld(this.ctx);
    setEnv(this.ctx, next.env);
    applyMode(this.ctx, next.mode);
    setDusk(this.ctx, next.dusk ?? 0);
    this.ctx.hud = next.hud ?? null;
    next.enter?.(this.ctx);
    next.update?.(this.ctx, 0, 0, 0);
    this.ctx.ui.showInset(next.inset ?? null);
    this.ctx.ui.setStep(i);
    this.exitUserCam(false);
    if (fade) {
      this.camFrom = null;
      this.blend = 1;
      this.applyCam(this.shotAt(0));
    } else {
      this.camFrom = { pos: this.ctx.camera.position.clone(), look: this.look.clone(), fov: this.ctx.camera.fov, up: this.ctx.camera.up.clone() };
      this.blend = 0;
    }
    if (fade && prev) await this.ctx.ui.fade(false);
    this.busy = false;
  }

  next() {
    void this.go(this.index + 1);
  }
  prev() {
    void this.go(this.index - 1);
  }
  replay() {
    const i = this.index;
    this.index = -1;
    void this.go(i).then(() => (this.playing = true));
  }
  toggle() {
    this.playing = !this.playing;
    this.ctx.ui.setPlaying(this.playing);
  }

  exitUserCam(blend = true) {
    if (!this.userCam) return;
    this.userCam = false;
    this.ctx.ui.freeCam.classList.add('hidden');
    if (blend) {
      this.camFrom = { pos: this.ctx.camera.position.clone(), look: this.controls.target.clone(), fov: this.ctx.camera.fov, up: this.ctx.camera.up.clone() };
      this.blend = 0;
    }
  }

  update(dt: number) {
    const s = this.step;
    if (!s || this.busy) return;
    const adv = this.playing ? dt : 0;
    const prevT = this.t;
    this.t += adv;
    s.update?.(this.ctx, this.t, prevT, adv);
    this.blend = Math.min(1, this.blend + dt / this.blendDur);

    if (!this.userCam) {
      const target = this.shotAt(this.t);
      if (this.camFrom && this.blend < 1) {
        const k = ease(this.blend);
        target.pos.lerpVectors(this.camFrom.pos, target.pos, k);
        target.look.lerpVectors(this.camFrom.look, target.look, k);
        target.fov = THREE.MathUtils.lerp(this.camFrom.fov ?? 45, target.fov ?? 45, k);
        target.up = (this.camFrom.up ?? UP).clone().lerp(target.up ?? UP, k).normalize();
      }
      this.applyCam(target);
    } else {
      this.controls.update();
    }

    this.ctx.ui.setProgress(this.t / s.duration);
    if (this.playing && this.t > s.duration + HOLD && this.index < this.steps.length - 1) this.next();
  }

  private applyCam(p: CamPose) {
    const cam = this.ctx.camera;
    cam.position.copy(p.pos);
    this.look.copy(p.look);
    cam.up.copy(p.up ?? UP);
    cam.lookAt(p.look);
    const fov = p.fov ?? 45;
    if (Math.abs(cam.fov - fov) > 1e-3) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
    this.controls.target.copy(p.look);
  }

  private shotAt(t: number): CamPose {
    const cam = this.step.cam;
    if (typeof cam === 'function') return cam(t, this.ctx);
    return sampleShots(cam, t);
  }
}

export function sampleShots(shots: Shot[], t: number): CamPose {
  const mk = (s: Shot) => ({ pos: new THREE.Vector3(...s.pos), look: new THREE.Vector3(...s.look), fov: s.fov ?? 45 });
  if (t <= shots[0].t) return mk(shots[0]);
  for (let i = 1; i < shots.length; i++) {
    if (t <= shots[i].t) {
      const a = mk(shots[i - 1]);
      const b = mk(shots[i]);
      const k = smooth((t - shots[i - 1].t) / (shots[i].t - shots[i - 1].t));
      return { pos: a.pos.lerp(b.pos, k), look: a.look.lerp(b.look, k), fov: a.fov + (b.fov - a.fov) * k };
    }
  }
  return mk(shots[shots.length - 1]);
}
