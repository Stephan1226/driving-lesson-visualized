import * as THREE from 'three';
import { COLORS, drawIcon, type IconId } from '../../core/icons';
import { FONT, roundRect } from '../../core/util';

export type Gear = 'P' | 'R' | 'N' | 'D';

export interface ClusterState {
  power: 'off' | 'acc' | 'on' | 'run';
  sweep: number;
  bulbCheck: boolean;
  speed: number;
  rpm: number;
  gear: Gear;
  warnings: IconId[];
  belt: boolean;
  epb: boolean;
  autoHold: 'off' | 'standby' | 'active';
  turnL: boolean;
  turnR: boolean;
  low: boolean;
  high: boolean;
  tail: boolean;
  message: string;
  highlight: IconId | null;
}

export const clusterDefaults = (): ClusterState => ({
  power: 'off', sweep: 0, bulbCheck: false, speed: 0, rpm: 0, gear: 'P', warnings: [], belt: true, epb: true,
  autoHold: 'off', turnL: false, turnR: false, low: false, high: false, tail: false, message: '', highlight: null,
});

const W = 1024;
const H = 384;
const SLOTS: IconId[] = ['belt', 'airbag', 'brake', 'abs', 'engine', 'tpms', 'oil', 'battery', 'coolant', 'fuel'];

/** 계기판 — 캔버스 텍스처로 그린다 */
export class Cluster {
  canvas = document.createElement('canvas');
  ctx: CanvasRenderingContext2D;
  texture: THREE.CanvasTexture;
  state = clusterDefaults();
  private key = '';
  pulse = 0;

  constructor() {
    this.canvas.width = W;
    this.canvas.height = H;
    this.ctx = this.canvas.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 8;
    this.draw();
  }

  update(time: number) {
    this.pulse = (Math.sin(time * 6) + 1) / 2;
    const s = this.state;
    const key = JSON.stringify(s) + (s.highlight ? Math.round(this.pulse * 6) : '');
    if (key !== this.key) {
      this.key = key;
      this.draw();
      this.texture.needsUpdate = true;
    }
  }

  private draw() {
    const c = this.ctx;
    const s = this.state;
    c.clearRect(0, 0, W, H);
    c.fillStyle = '#05070a';
    roundRect(c, 0, 0, W, H, 40);
    c.fill();
    const on = s.power !== 'off';
    const lit = s.power === 'on' || s.power === 'run';

    // 게이지
    const gauge = (cx: number, max: number, value: number, label: string, step: number, red?: number) => {
      const r = 150;
      const a0 = (135 * Math.PI) / 180;
      const a1 = (405 * Math.PI) / 180;
      c.lineWidth = 6;
      c.strokeStyle = lit ? '#2a3442' : '#12161c';
      c.beginPath();
      c.arc(cx, 196, r, a0, a1);
      c.stroke();
      if (!lit) return;
      if (red) {
        c.strokeStyle = '#c0392b';
        c.beginPath();
        c.arc(cx, 196, r, a0 + ((a1 - a0) * red) / max, a1);
        c.stroke();
      }
      c.fillStyle = '#c9d4e3';
      c.font = `600 22px ${FONT}`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      for (let v = 0; v <= max; v += step) {
        const a = a0 + ((a1 - a0) * v) / max;
        c.strokeStyle = '#8fa0b8';
        c.lineWidth = 3;
        c.beginPath();
        c.moveTo(cx + Math.cos(a) * (r - 4), 196 + Math.sin(a) * (r - 4));
        c.lineTo(cx + Math.cos(a) * (r - 20), 196 + Math.sin(a) * (r - 20));
        c.stroke();
        c.fillText(String(v), cx + Math.cos(a) * (r - 44), 196 + Math.sin(a) * (r - 44));
      }
      const a = a0 + (a1 - a0) * Math.min(1, value / max);
      c.strokeStyle = '#ff6a3d';
      c.shadowColor = '#ff6a3d';
      c.shadowBlur = 10;
      c.lineWidth = 6;
      c.beginPath();
      c.moveTo(cx, 196);
      c.lineTo(cx + Math.cos(a) * (r - 18), 196 + Math.sin(a) * (r - 18));
      c.stroke();
      c.shadowBlur = 0;
      c.fillStyle = '#1b222c';
      c.beginPath();
      c.arc(cx, 196, 16, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#7f8ea3';
      c.font = `600 18px ${FONT}`;
      c.fillText(label, cx, 196 + 70);
    };
    const sw = s.sweep > 0 && s.sweep < 1 ? Math.sin(s.sweep * Math.PI) : 0;
    gauge(190, 220, Math.max(s.speed, sw * 220), 'km/h', 40);
    gauge(834, 8, Math.max(s.rpm, sw * 8), 'x1000 rpm', 1, 6.5);

    if (lit) {
      // 기어 표시
      const gears: Gear[] = ['P', 'R', 'N', 'D'];
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      gears.forEach((g, i) => {
        const active = g === s.gear;
        c.font = `800 ${active ? 64 : 34}px ${FONT}`;
        c.fillStyle = active ? '#ffffff' : '#4b5666';
        c.fillText(g, 422 + i * 60, 110);
      });
      c.font = `800 72px ${FONT}`;
      c.fillStyle = '#e8eef7';
      c.fillText(String(Math.round(s.speed)), 512, 196);
      c.font = `500 18px ${FONT}`;
      c.fillStyle = '#7f8ea3';
      c.fillText('km/h', 512, 240);
      if (s.message) {
        c.fillStyle = '#ffd36a';
        c.font = `700 21px ${FONT}`;
        c.fillText(s.message, 512, 268);
      }
    }

    if (on) {
      // 경고등
      SLOTS.forEach((id, i) => {
        const x = 380 + (i % 5) * 66;
        const y = i < 5 ? 312 : 352;
        const active = s.bulbCheck || s.warnings.includes(id) || (id === 'belt' && s.belt && lit);
        if (s.highlight === id) {
          c.strokeStyle = `rgba(255,255,255,${0.3 + this.pulse * 0.6})`;
          c.lineWidth = 3;
          c.beginPath();
          c.arc(x, y, 24, 0, Math.PI * 2);
          c.stroke();
        }
        if (active) drawIcon(c, id, x, y, 34, COLORS[iconColor(id)]);
      });
      // 파킹 브레이크, 오토홀드
      if (s.epb || s.bulbCheck) drawIcon(c, 'epb', 330, 52, 40, COLORS.red);
      if (s.autoHold !== 'off' || s.bulbCheck) {
        const col = s.autoHold === 'active' || s.bulbCheck ? COLORS.green : COLORS.white;
        drawIcon(c, 'autohold', 694, 52, 44, col);
        if (s.highlight === 'autohold') {
          c.strokeStyle = `rgba(255,255,255,${0.3 + this.pulse * 0.6})`;
          c.lineWidth = 3;
          roundRect(c, 664, 30, 60, 44, 8);
          c.stroke();
        }
      }
      if (s.highlight === 'epb') {
        c.strokeStyle = `rgba(255,255,255,${0.3 + this.pulse * 0.6})`;
        c.lineWidth = 3;
        c.beginPath();
        c.arc(330, 52, 26, 0, Math.PI * 2);
        c.stroke();
      }
    }
    // 방향지시등·등화 표시 (ACC 이상)
    if (on) {
      if (s.turnL || s.bulbCheck) drawIcon(c, 'turnL', 412, 44, 40, COLORS.green);
      if (s.turnR || s.bulbCheck) drawIcon(c, 'turnR', 612, 44, 40, COLORS.green);
      if (s.tail || s.bulbCheck) drawIcon(c, 'tail', 468, 44, 30, COLORS.green);
      if (s.low || s.bulbCheck) drawIcon(c, 'low', 512, 44, 32, COLORS.green);
      if (s.high || s.bulbCheck) drawIcon(c, 'high', 556, 44, 32, COLORS.blue);
    }
  }
}

function iconColor(id: IconId) {
  return id === 'engine' || id === 'abs' || id === 'tpms' || id === 'fuel' ? 'amber' : 'red';
}
