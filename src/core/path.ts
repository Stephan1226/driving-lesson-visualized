/**
 * 차량 주행 경로 — 뒷바퀴 축 중심 기준 기구학(자전거 모델).
 * 포즈는 차체 중심(car.root) 기준으로 입·출력한다.
 * heading h: 0 = +X, + = 왼쪽으로 회전(위에서 볼 때 반시계)
 */
export interface Pose {
  x: number;
  z: number;
  h: number;
}
export type Seg =
  | { type: 'line'; d: number }
  | { type: 'arc'; r: number; dir: 1 | -1; a: number }
  /** 완화 곡선: 길이 len 동안 곡률을 0 → 1/r 로 서서히 (핸들을 감는 구간) */
  | { type: 'spiral'; len: number; r: number; dir: 1 | -1 };

/** 완화 곡선 구간에서 회전하는 각도 */
export const spiralAngle = (len: number, r: number) => len / (2 * r);

const REAR = -1.37;
const WHEELBASE = 2.75;

const fwd = (h: number) => [Math.cos(h), -Math.sin(h)] as const;
const left = (h: number) => [-Math.sin(h), -Math.cos(h)] as const;

export interface PathSample extends Pose {
  steer: number;
}

export class DrivePath {
  length = 0;
  private parts: { seg: Seg; len: number; rx: number; rz: number; h: number }[] = [];

  constructor(start: Pose, segs: Seg[]) {
    const [fx, fz] = fwd(start.h);
    let rx = start.x + fx * REAR;
    let rz = start.z + fz * REAR;
    let h = start.h;
    for (const seg of segs) {
      const len = seg.type === 'line' ? Math.abs(seg.d) : seg.type === 'spiral' ? seg.len : seg.r * seg.a;
      this.parts.push({ seg, len, rx, rz, h });
      const end = this.eval(seg, rx, rz, h, len);
      rx = end.rx;
      rz = end.rz;
      h = end.h;
      this.length += len;
    }
  }

  private eval(seg: Seg, rx: number, rz: number, h: number, s: number) {
    if (seg.type === 'line') {
      const [fx, fz] = fwd(h);
      const sgn = Math.sign(seg.d) || 1;
      return { rx: rx + fx * s * sgn, rz: rz + fz * s * sgn, h, steer: 0 };
    }
    if (seg.type === 'spiral') {
      const N = 24;
      const du = s / N;
      const k = seg.dir / (seg.len * seg.r);
      let x = rx;
      let z = rz;
      for (let i = 0; i < N; i++) {
        const u = (i + 0.5) * du;
        const [fx, fz] = fwd(h + (k * u * u) / 2);
        x += fx * du;
        z += fz * du;
      }
      return { rx: x, rz: z, h: h + (k * s * s) / 2, steer: Math.atan(WHEELBASE * k * s) };
    }
    const [lx, lz] = left(h);
    const cx = rx + lx * seg.r * seg.dir;
    const cz = rz + lz * seg.r * seg.dir;
    const th = (seg.dir * s) / seg.r;
    const vx = rx - cx;
    const vz = rz - cz;
    const c = Math.cos(th);
    const sn = Math.sin(th);
    return {
      rx: cx + vx * c + vz * sn,
      rz: cz - vx * sn + vz * c,
      h: h + th,
      steer: Math.atan(WHEELBASE / seg.r) * seg.dir,
    };
  }

  sample(s: number): PathSample {
    s = Math.max(0, Math.min(this.length, s));
    let acc = 0;
    for (let i = 0; i < this.parts.length; i++) {
      const p = this.parts[i];
      if (s <= acc + p.len || i === this.parts.length - 1) {
        const e = this.eval(p.seg, p.rx, p.rz, p.h, Math.min(p.len, s - acc));
        const [fx, fz] = fwd(e.h);
        return { x: e.rx - fx * REAR, z: e.rz - fz * REAR, h: e.h, steer: e.steer };
      }
      acc += p.len;
    }
    return { x: 0, z: 0, h: 0, steer: 0 };
  }

  /** s 지점에서 몇 번째 구간인지 */
  segmentAt(s: number) {
    let acc = 0;
    for (let i = 0; i < this.parts.length; i++) {
      acc += this.parts[i].len;
      if (s <= acc) return i;
    }
    return this.parts.length - 1;
  }
}

export interface Box2 {
  cx: number;
  cz: number;
  hx: number;
  hz: number;
  h: number;
}

/** 회전된 두 직사각형 겹침 판정 (SAT) */
export function overlap(a: Box2, b: Box2) {
  const axes = (o: Box2) => [fwd(o.h), left(o.h)];
  const all = [...axes(a), ...axes(b)];
  for (const [ax, az] of all) {
    const proj = (o: Box2) => {
      const [ux, uz] = fwd(o.h);
      const [vx, vz] = left(o.h);
      const c = o.cx * ax + o.cz * az;
      const r = o.hx * Math.abs(ux * ax + uz * az) + o.hz * Math.abs(vx * ax + vz * az);
      return [c - r, c + r];
    };
    const [a0, a1] = proj(a);
    const [b0, b1] = proj(b);
    if (a1 < b0 || b1 < a0) return false;
  }
  return true;
}

export const carBox = (p: Pose): Box2 => ({ cx: p.x, cz: p.z, hx: 2.37, hz: 0.93, h: p.h });

/** 경로를 따라가며 처음 충돌하는 거리(s). 없으면 null */
export function firstHit(path: DrivePath, obstacle: Box2, step = 0.01): number | null {
  for (let s = 0; s <= path.length; s += step) if (overlap(carBox(path.sample(s)), obstacle)) return s;
  return null;
}
