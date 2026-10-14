import * as THREE from 'three';

export const DEG = Math.PI / 180;

export const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smooth = (t: number) => {
  t = clamp(t);
  return t * t * (3 - 2 * t);
};
export const ease = (t: number) => {
  t = clamp(t);
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
};
export const linear = (t: number) => clamp(t);

/** 0..1 progress of t inside [a, b] */
export const seg = (t: number, a: number, b: number) => clamp((t - a) / (b - a));
/** smoothed 0..1 progress of t inside [a, b] */
export const sseg = (t: number, a: number, b: number) => smooth(seg(t, a, b));

export type Key = [time: number, value: number];

/** Keyframe interpolation for scripted animation. */
export function track(t: number, keys: Key[], e: (t: number) => number = smooth): number {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [t1, v1] = keys[i];
    if (t <= t1) {
      const [t0, v0] = keys[i - 1];
      return lerp(v0, v1, e((t - t0) / (t1 - t0 || 1)));
    }
  }
  return keys[keys.length - 1][1];
}

export type MotionKey = [time: number, dist: number, speed: number];

/**
 * 주행 거리 키프레임: (시각, 거리, 속도)를 3차 에르미트로 이어 위치·속도가 끊기지 않게 한다.
 * 마지막 키 이후엔 그 속도로 계속 간다.
 */
export function motion(keys: MotionKey[]) {
  return (t: number) => {
    if (t <= keys[0][0]) return keys[0][1];
    for (let i = 1; i < keys.length; i++) {
      const [t1, s1, v1] = keys[i];
      if (t > t1) continue;
      const [t0, s0, v0] = keys[i - 1];
      const h = t1 - t0;
      const u = (t - t0) / h;
      const u2 = u * u;
      const u3 = u2 * u;
      return (2 * u3 - 3 * u2 + 1) * s0 + (u3 - 2 * u2 + u) * h * v0 + (3 * u2 - 2 * u3) * s1 + (u3 - u2) * h * v1;
    }
    const [tn, sn, vn] = keys[keys.length - 1];
    return sn + vn * (t - tn);
  };
}

/** Discrete keyframes: value of the last key whose time <= t. */
export function pick<T>(t: number, keys: [number, T][]): T {
  let v = keys[0][1];
  for (const [k, val] of keys) if (t >= k) v = val;
  return v;
}

/** True exactly once when time passes `at`. */
export const crossed = (prev: number, t: number, at: number) => prev < at && t >= at;

export const blinkOn = (time: number, hz = 1.4) => (time * hz) % 1 < 0.55;

export const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

export function canvasTexture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  draw(ctx, w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export const FONT = `"Pretendard", "Apple SD Gothic Neo", "Noto Sans KR", system-ui, sans-serif`;

export function textTexture(
  text: string,
  opts: { w?: number; h?: number; bg?: string; fg?: string; size?: number; weight?: number; radius?: number } = {},
) {
  const { w = 256, h = 128, bg = '#1b1e24', fg = '#ffffff', size = 56, weight = 700, radius = 16 } = opts;
  return canvasTexture(w, h, (ctx) => {
    if (bg !== 'transparent') {
      ctx.fillStyle = bg;
      roundRect(ctx, 0, 0, w, h, radius);
      ctx.fill();
    }
    ctx.fillStyle = fg;
    ctx.font = `${weight} ${size}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const lines = text.split('\n');
    lines.forEach((ln, i) => ctx.fillText(ln, w / 2, h / 2 + (i - (lines.length - 1) / 2) * size * 1.1));
  });
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Orient an object so that local +Z points along `forward` and local +Y along `up` (orthogonalised). */
export function orient(obj: THREE.Object3D, forward: THREE.Vector3, up: THREE.Vector3) {
  const z = forward.clone().normalize();
  const x = new THREE.Vector3().crossVectors(up, z).normalize();
  const y = new THREE.Vector3().crossVectors(z, x);
  obj.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}

/** Place a Y-axis aligned mesh (cylinder/capsule) between two points. */
export function stretchBetween(obj: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3, baseLength = 1) {
  const d = new THREE.Vector3().subVectors(b, a);
  const len = d.length();
  obj.position.copy(a).addScaledVector(d, 0.5);
  obj.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  obj.scale.set(1, len / baseLength, 1);
}

/** Two-bone IK: returns the middle joint position given root, target, bone lengths and a bend hint direction. */
export function solveIK(root: THREE.Vector3, target: THREE.Vector3, a: number, b: number, hint: THREE.Vector3) {
  const dir = new THREE.Vector3().subVectors(target, root);
  let d = dir.length();
  dir.normalize();
  d = clamp(d, Math.abs(a - b) + 1e-3, a + b - 1e-4);
  const cosA = clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1);
  const sinA = Math.sqrt(1 - cosA * cosA);
  const perp = hint.clone().addScaledVector(dir, -hint.dot(dir));
  if (perp.lengthSq() < 1e-8) perp.set(0, 1, 0);
  perp.normalize();
  const mid = root.clone().addScaledVector(dir, a * cosA).addScaledVector(perp, a * sinA);
  const end = root.clone().addScaledVector(dir, d);
  return { mid, end };
}

export function setOpacity(obj: THREE.Object3D, opacity: number) {
  obj.traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.Material | undefined;
    if (m && !Array.isArray(m)) {
      m.transparent = opacity < 1;
      m.opacity = opacity;
      m.depthWrite = opacity > 0.5;
    }
  });
}

export function shadows(obj: THREE.Object3D, cast = true, receive = true) {
  obj.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = cast;
      o.receiveShadow = receive;
    }
  });
  return obj;
}
