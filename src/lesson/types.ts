import type * as THREE from 'three';
import type { EnvName } from '../world/env/Environment';
import type { MirrorId } from '../world/Mirrors';
import type { ChapterInfo, StepText } from '../ui/Overlay';
import type { Ctx } from './context';

export type V3 = [number, number, number];

export interface Shot {
  t: number;
  pos: V3;
  look: V3;
  fov?: number;
}
export interface CamPose {
  pos: THREE.Vector3;
  look: THREE.Vector3;
  fov?: number;
  up?: THREE.Vector3;
}
export type CamFn = (t: number, ctx: Ctx) => CamPose;

/** exterior: 바깥에서 / interior: 실내(차체 그대로) / cutaway: 차체 반투명 */
export type Mode = 'exterior' | 'interior' | 'cutaway';

export interface Step extends StepText {
  id: string;
  env: EnvName;
  mode: Mode;
  duration: number;
  cam: Shot[] | CamFn;
  /** 0 = 낮, 1 = 해질녘 */
  dusk?: number;
  inset?: string;
  hud?: MirrorId;
  /** 진입 시 화면 전환(페이드) 강제 */
  cut?: boolean;
  enter?(ctx: Ctx): void;
  update?(ctx: Ctx, t: number, prev: number, dt: number): void;
}

export interface Chapter extends ChapterInfo {
  steps: Step[];
}
