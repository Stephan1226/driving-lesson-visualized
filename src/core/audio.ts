/** Tiny synthesized sound effects — no audio assets needed. */
export class Sfx {
  private ctx?: AudioContext;
  muted = false;

  unlock() {
    if (!this.ctx) this.ctx = new AudioContext();
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  private tone(freq: number, dur: number, type: OscillatorType = 'sine', gain = 0.15, slide = 0) {
    if (this.muted || !this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private noise(dur: number, gain = 0.2, lowpass = 800) {
    if (this.muted || !this.ctx) return;
    const t = this.ctx.currentTime;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = lowpass;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.ctx.destination);
    src.start(t);
  }

  /** 버튼·스위치 클릭 */
  click() {
    this.tone(1800, 0.04, 'square', 0.05);
  }
  /** 방향지시등 릴레이 똑-딱 */
  tick(high: boolean) {
    this.tone(high ? 1250 : 950, 0.03, 'square', 0.06);
  }
  /** 안전벨트 찰칵 */
  buckle() {
    this.tone(2400, 0.03, 'square', 0.08);
    setTimeout(() => this.tone(1600, 0.05, 'square', 0.06), 45);
  }
  /** 충돌 */
  thud() {
    this.noise(0.35, 0.5, 300);
    this.tone(90, 0.3, 'sine', 0.4, -40);
  }
  /** 시동 */
  engine() {
    this.noise(0.9, 0.18, 220);
    this.tone(55, 0.9, 'sawtooth', 0.06, 30);
  }
  chime() {
    this.tone(880, 0.25, 'sine', 0.08);
    setTimeout(() => this.tone(1320, 0.35, 'sine', 0.07), 120);
  }
  warn() {
    this.tone(740, 0.18, 'triangle', 0.1);
  }
  motor() {
    this.tone(180, 0.35, 'sawtooth', 0.04, 60);
  }
  squeal() {
    this.tone(3200, 0.5, 'sawtooth', 0.025, 300);
  }
}

export const sfx = new Sfx();
