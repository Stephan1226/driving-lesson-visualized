import { canvasTexture, roundRect, FONT } from '../../core/util';

/**
 * 비사업용 승용차 반사필름식 번호판 (2020.7~, 520×110mm)
 * 흰 바탕·검은 글자, 왼쪽 청색 띠에 태극 문양·홀로그램·KOR. 치수는 국토부 고시 도면(mm) 기준.
 */
export const PLATE = { w: 0.52, h: 0.11 };

/**
 * 장면 속 차마다 하나씩 주는 특별한 번호 — 차종기호는 승용(100~699),
 * 용도기호는 비사업용 한글(가~마, 거~저, 고~조, 구~주)만 쓴다.
 */
const SPECIAL = [
  '123가 4567', '111나 1111', '222다 2222', '333라 3333', '444마 4444', '555거 5555',
  '666너 6666', '234더 5678', '345러 6789', '100머 1000', '200버 2000', '300서 3000',
  '400어 4000', '500저 5000', '600고 6000', '121노 2121', '212도 1212', '343로 4343',
  '454모 5454', '565보 6565', '177소 7777', '188오 8888', '199조 9999', '101구 1010',
  '202누 2020', '303두 3030', '654루 3210', '321무 9876', '100부 1004', '282수 8282',
  '246우 8642', '135주 7531', '456가 6543', '567나 7654', '678다 8765', '112라 1122',
];

/** i번째 차의 번호 (0 = 우리 차) */
export const specialPlate = (i: number) => SPECIAL[i % SPECIAL.length];

const PX = 2; // 캔버스 px/mm
const PI = Math.PI;
const INK = '#121314';

/** 타원 호 — lift면 새 획으로 시작 */
function arc(c: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, lift = false) {
  if (lift) c.moveTo(cx + rx * Math.cos(a0), cy + ry * Math.sin(a0));
  c.ellipse(cx, cy, rx, ry, 0, a0, a1);
}

/**
 * 번호판 숫자: 획 중심선 경로. (w, h)는 중심선 상자, e는 획 두께의 절반.
 * 굵기가 고른 좁은 고딕 — 3·5는 윗변이 평평하고 6·9는 곧은 사선이 고리로 이어진다.
 */
const DIGIT: Record<string, (c: CanvasRenderingContext2D, w: number, h: number, e: number) => void> = {
  '0': (c, w, h) => {
    const r = w / 2;
    const k = r * 1.2;
    arc(c, r, k, r, k, PI, 2 * PI, true);
    arc(c, r, h - k, r, k, 0, PI);
    c.closePath();
  },
  '1': (c, w, h, e) => {
    c.moveTo(w * 0.64, -e);
    c.lineTo(w * 0.64, h + e);
    c.moveTo(w * 0.64, 0);
    c.lineTo(w * 0.02, h * 0.22);
  },
  '2': (c, w, h, e) => {
    const r = w / 2;
    arc(c, r, r * 1.05, r, r * 1.05, PI * 1.02, PI * 2.2, true);
    c.lineTo(0, h);
    c.lineTo(w + e, h);
  },
  '3': (c, w, h) => {
    const ry = h * 0.31;
    c.moveTo(w * 0.04, 0);
    c.lineTo(w, 0);
    arc(c, w / 2, h - ry, w / 2, ry, -PI * 0.62, PI * 0.8);
  },
  '4': (c, w, h, e) => {
    c.moveTo(w + e, h * 0.7);
    c.lineTo(0, h * 0.7);
    c.lineTo(w * 0.7, 0);
    c.moveTo(w * 0.7, -e);
    c.lineTo(w * 0.7, h + e);
  },
  '5': (c, w, h) => {
    const ry = h * 0.32;
    c.moveTo(w * 0.96, 0);
    c.lineTo(w * 0.06, 0);
    arc(c, w / 2, h - ry, w / 2, ry, -PI * 0.8, PI * 0.8);
  },
  '6': (c, w, h, e) => {
    const ry = h * 0.32;
    const cy = h - ry;
    const a = -PI * 0.86;
    arc(c, w / 2, cy, w / 2, ry, 0, 2 * PI, true);
    c.moveTo(w * 0.8, -e * 0.5);
    c.lineTo(w / 2 + (w / 2) * Math.cos(a), cy + ry * Math.sin(a));
  },
  '7': (c, w, h, e) => {
    c.moveTo(0, 0);
    c.lineTo(w, 0);
    c.lineTo(w * 0.28, h + e * 0.8);
  },
  '8': (c, w, h) => {
    const rt = h * 0.215;
    const rb = h * 0.285;
    arc(c, w / 2, rt, w * 0.44, rt, 0, 2 * PI, true);
    arc(c, w / 2, h - rb, w / 2, rb, 0, 2 * PI, true);
  },
  '9': (c, w, h, e) => {
    c.translate(w, h);
    c.rotate(PI);
    DIGIT['6'](c, w, h, e);
  },
};

/** 숫자 한 자 (x, y = 글자 상자 왼쪽 위, mm) */
function digit(c: CanvasRenderingContext2D, d: string, x: number, y: number, w: number, h: number, sw: number) {
  const pen = DIGIT[d];
  if (!pen) return;
  c.save();
  c.translate(x + sw / 2, y + sw / 2);
  c.beginPath();
  pen(c, w - sw, h - sw, sw / 2);
  c.restore();
  c.lineWidth = sw;
  c.lineCap = 'butt';
  c.lineJoin = 'miter';
  c.miterLimit = 2;
  c.strokeStyle = INK;
  c.stroke();
}

/** 한글 한 자를 상자(w×h)에 맞춰 그린다. 가로로 좁힌 만큼 세로 획을 옆으로 번져 굵기를 맞춘다. */
function hangul(c: CanvasRenderingContext2D, ch: string, x: number, y: number, w: number, h: number) {
  c.font = `800 100px ${FONT}`;
  c.textAlign = 'left';
  c.textBaseline = 'alphabetic';
  const m = c.measureText(ch);
  const gw = m.actualBoundingBoxLeft + m.actualBoundingBoxRight;
  const gh = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent;
  if (!gw || !gh) return;
  const sy = h / gh;
  const t = 12; // 100px 굵은 글꼴의 획 두께(대략)
  const spread = Math.max(0, (t * (sy - w / gw)) / (1 - t / gw)); // 세로 획을 더 번질 폭(mm)
  const sx = (w - spread) / gw;
  c.fillStyle = INK;
  for (let d = 0; d <= spread; d += 0.25) {
    c.save();
    c.translate(x + d, y);
    c.scale(sx, sy);
    c.fillText(ch, m.actualBoundingBoxLeft, m.actualBoundingBoxAscent);
    c.restore();
  }
}

/** 태극 문양 (기울어진 S자 경계, 청색 단색) */
function taegeuk(c: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  const ring = c.createRadialGradient(cx - r * 0.3, cy - r * 0.4, r * 0.1, cx, cy, r);
  ring.addColorStop(0, '#3d74c9');
  ring.addColorStop(1, '#0d2c73');
  c.fillStyle = ring;
  c.beginPath();
  c.arc(cx, cy, r, 0, 2 * PI);
  c.fill();
  c.strokeStyle = '#cfe6ff';
  c.lineWidth = 1.2;
  c.stroke();
  const t = r * 0.74;
  c.save();
  c.translate(cx, cy);
  c.rotate(Math.atan2(2, 3));
  c.beginPath();
  c.arc(0, 0, t, PI, 2 * PI);
  c.arc(t / 2, 0, t / 2, 0, PI, true);
  c.arc(-t / 2, 0, t / 2, 0, PI);
  c.fillStyle = '#9cc8ff';
  c.fill();
  c.beginPath();
  c.arc(0, 0, t, 0, 2 * PI);
  c.strokeStyle = 'rgba(220, 238, 255, 0.85)';
  c.lineWidth = 0.8;
  c.stroke();
  c.restore();
}

/** 520×110mm 좌표로 번호판 전체를 그린다 */
function drawPlate(c: CanvasRenderingContext2D, text: string) {
  // 바탕 (모서리 R12)
  c.fillStyle = '#f7f7f3';
  roundRect(c, 0, 0, 520, 110, 12);
  c.fill();

  // 왼쪽 청색 띠 (폭 56.3, 경계선 1.28)
  c.save();
  roundRect(c, 4, 4, 512, 102, 8);
  c.clip();
  const band = c.createLinearGradient(0, 110, 56, 0);
  band.addColorStop(0, '#0a1d55');
  band.addColorStop(0.55, '#1f56b8');
  band.addColorStop(1, '#5b9be8');
  c.fillStyle = band;
  c.fillRect(0, 0, 56.3, 110);
  c.fillStyle = 'rgba(255, 255, 255, 0.12)';
  c.beginPath();
  c.moveTo(0, 58);
  c.lineTo(56.3, 30);
  c.lineTo(56.3, 44);
  c.lineTo(0, 72);
  c.fill();
  c.fillStyle = '#a9d6ff';
  c.fillRect(56.3, 0, 1.28, 110);
  c.restore();

  // 태극 문양(Ø36.5), 홀로그램(Ø22.6), KOR
  taegeuk(c, 28.5, 25, 18.25);
  const holo = c.createRadialGradient(27, 64, 1, 27, 64, 11.3);
  holo.addColorStop(0, 'rgba(255, 255, 255, 0.35)');
  holo.addColorStop(0.7, 'rgba(200, 235, 255, 0.18)');
  holo.addColorStop(1, 'rgba(255, 255, 255, 0.05)');
  c.fillStyle = holo;
  c.beginPath();
  c.arc(27, 64, 11.3, 0, 2 * PI);
  c.fill();
  c.strokeStyle = 'rgba(255, 255, 255, 0.4)';
  c.lineWidth = 0.6;
  c.stroke();
  c.save();
  c.font = `italic 800 26px ${FONT}`;
  c.textAlign = 'center';
  c.textBaseline = 'alphabetic';
  const kw = c.measureText('KOR').width;
  c.translate(28.5, 97);
  c.scale(Math.min(1, 42 / kw), 1);
  c.lineWidth = 1.2;
  c.strokeStyle = '#0a1d55';
  c.strokeText('KOR', 0, 0);
  c.fillStyle = '#ffffff';
  c.fillText('KOR', 0, 0);
  c.restore();

  // 테두리 (R10~R8, 두께 2)
  c.strokeStyle = INK;
  c.lineWidth = 2;
  roundRect(c, 3, 3, 514, 102, 9);
  c.stroke();

  // 문자: 숫자 칸 50, 한글 칸 85, 글자 높이 85 — 흰 영역(65~500)의 가운데에 둔다
  const m = /^(\d+)\s*(\D)\s*(\d+)$/.exec(text.trim());
  const [a, ch, b] = m ? [m[1], m[2], m[3]] : ['', '', text];
  let x = 65 + (435 - 50 * (a.length + b.length) - (ch ? 85 : 0)) / 2;
  for (const d of a) {
    digit(c, d, x + 3, 12.5, 44, 85, 12);
    x += 50;
  }
  if (ch) {
    hangul(c, ch, x + 11, 21, 44, 68);
    x += 85;
  }
  for (const d of b) {
    digit(c, d, x + 3, 12.5, 44, 85, 12);
    x += 50;
  }
}

/** 번호판 텍스처 (1040×220, 모서리는 투명 — alphaTest로 잘라 쓴다) */
export function plateTexture(text: string) {
  const draw = (c: CanvasRenderingContext2D, w: number, h: number) => {
    c.clearRect(0, 0, w, h);
    c.save();
    c.scale(PX, PX);
    drawPlate(c, text);
    c.restore();
  };
  const tex = canvasTexture(520 * PX, 110 * PX, draw);
  tex.anisotropy = 8;
  // 한글 웹폰트(Pretendard)가 늦게 받아지면 한 번 더 그린다
  document.fonts
    ?.load(`800 100px Pretendard`, text)
    .then((f) => {
      if (!f.length) return;
      const cv = tex.image as HTMLCanvasElement;
      draw(cv.getContext('2d')!, cv.width, cv.height);
      tex.needsUpdate = true;
    })
    .catch(() => {});
  return tex;
}
