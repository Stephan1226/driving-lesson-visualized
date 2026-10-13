/**
 * 계기판 아이콘 — 24x24 SVG path data.
 * 같은 데이터를 HTML(SVG)과 계기판 캔버스(Path2D) 양쪽에서 사용한다.
 */
export type IconId =
  | 'engine' | 'brake' | 'battery' | 'oil' | 'coolant' | 'airbag' | 'belt'
  | 'tpms' | 'abs' | 'epb' | 'autohold' | 'turnL' | 'turnR' | 'low' | 'high' | 'tail' | 'fuel';

export const COLORS = {
  red: '#ff4438',
  amber: '#ffb020',
  green: '#35d07a',
  blue: '#4b8dff',
  white: '#e9eef5',
} as const;
export type IconColor = keyof typeof COLORS;

export interface Icon {
  id: IconId;
  name: string;
  color: IconColor;
  d: string;
  fill?: boolean;
  text?: string[];
  textSize?: number;
  desc?: string;
}

const ring = (r: number) => `M12 ${12 - r}a${r} ${r} 0 1 0 .01 0`;
const brackets = 'M4 5.6a9.6 9.6 0 0 0 0 12.8 M20 5.6a9.6 9.6 0 0 1 0 12.8';

export const ICONS: Record<IconId, Icon> = {
  engine: {
    id: 'engine', name: '엔진 경고등', color: 'amber',
    d: 'M3 10h2V8h3V6h6v2h2l2 2h2v6h-2l-2 2H7l-2-2H3z M10 6V4 M8 4h4',
    desc: '엔진·배기 계통 이상. 빠르게 정비소 점검',
  },
  brake: {
    id: 'brake', name: '브레이크 경고등', color: 'red',
    d: `${ring(6)} M12 9v3.6 M12 14.8v.5 ${brackets}`,
    desc: '브레이크액 부족·제동장치 이상. 즉시 정차',
  },
  battery: {
    id: 'battery', name: '충전 경고등', color: 'red',
    d: 'M3 8h18v11H3z M6 8V6h3v2 M15 8V6h3v2 M6 13.5h4 M14 13.5h4 M16 11.5v4',
    desc: '발전기·배터리 충전 이상',
  },
  oil: {
    id: 'oil', name: '엔진오일 압력', color: 'red',
    d: 'M3 11l4 1h7l3-2 5 1-6 6H8l-1-2H3z M8 12V9h3v3 M7.5 9h4 M21 15.5c0 .9-.5 1.4-1 1.4s-1-.5-1-1.4.6-1.6 1-2.2c.4.6 1 1.3 1 2.2z',
    desc: '오일 부족·압력 저하. 즉시 정차 후 시동 끄기',
  },
  coolant: {
    id: 'coolant', name: '냉각수 온도', color: 'red',
    d: 'M12 3v9 M12 4.5h3 M12 7.5h3 M12 10.5h2 M10 12.4a2.6 2.6 0 1 0 4 0 M2.5 18.5c1.6-1 3.2 1 4.8 0s3.2 1 4.8 0 3.2 1 4.8 0 3.2 1 4.8 0',
    desc: '엔진 과열. 안전한 곳에 정차',
  },
  airbag: {
    id: 'airbag', name: '에어백 경고등', color: 'red',
    d: 'M8 3.6a1.6 1.6 0 1 0 .01 0 M7.6 7.5v7l3.2 4.8 M7.6 14.5H4 M16.5 9.5a3.6 3.6 0 1 0 .01 0',
    desc: '에어백 시스템 이상',
  },
  belt: {
    id: 'belt', name: '안전벨트 미착용', color: 'red',
    d: 'M12 2.8a2 2 0 1 0 .01 0 M7 21v-7.5a5 5 0 0 1 10 0V21 M9 8.8l7 10.5',
    desc: '안전벨트를 매면 꺼짐',
  },
  tpms: {
    id: 'tpms', name: '타이어 공기압', color: 'amber',
    d: 'M6.5 4.5c-3 3.6-3 9.6 0 13.2h11c3-3.6 3-9.6 0-13.2 M7.5 20.5l.8-2.8 M11.2 20.5l.3-2.8 M12.8 20.5l-.3-2.8 M16.5 20.5l-.8-2.8 M12 7.5v5.5 M12 15.2v.5',
    desc: '공기압 부족. 가까운 곳에서 점검',
  },
  abs: {
    id: 'abs', name: 'ABS 경고등', color: 'amber',
    d: `${ring(7.4)} ${brackets}`,
    text: ['ABS'], textSize: 5.4,
    desc: 'ABS 이상(일반 제동은 가능). 점검 필요',
  },
  epb: {
    id: 'epb', name: '파킹 브레이크', color: 'red',
    d: `${ring(7.4)} ${brackets}`,
    text: ['P'], textSize: 9,
    desc: '파킹 브레이크 체결 중',
  },
  autohold: {
    id: 'autohold', name: '오토홀드', color: 'green',
    d: 'M1.5 6.5h21v11h-21z',
    text: ['AUTO', 'HOLD'], textSize: 4.6,
    desc: '흰색=대기, 초록=작동 중',
  },
  turnL: { id: 'turnL', name: '좌측 방향지시등', color: 'green', d: 'M10 5L3 12l7 7v-4h9V9h-9z', fill: true },
  turnR: { id: 'turnR', name: '우측 방향지시등', color: 'green', d: 'M14 5l7 7-7 7v-4H5V9h9z', fill: true },
  low: {
    id: 'low', name: '전조등', color: 'green',
    d: 'M10.5 5.5c5 0 8.5 2.5 8.5 6.5s-3.5 6.5-8.5 6.5z M8 7.6l-5 1.6 M8 11.2l-5 1.6 M8 14.8l-5 1.6',
  },
  high: {
    id: 'high', name: '상향등', color: 'blue',
    d: 'M10.5 5.5c5 0 8.5 2.5 8.5 6.5s-3.5 6.5-8.5 6.5z M8 7.5H3 M8 10.3H3 M8 13.1H3 M8 15.9H3',
  },
  tail: {
    id: 'tail', name: '미등', color: 'green',
    d: 'M9 7.5c-2.8 0-4.4 2-4.4 4.5s1.6 4.5 4.4 4.5z M15 7.5c2.8 0 4.4 2 4.4 4.5s-1.6 4.5-4.4 4.5z M3.5 9.6h-2 M3.5 14.4h-2 M20.5 9.6h2 M20.5 14.4h2',
  },
  fuel: {
    id: 'fuel', name: '연료 부족', color: 'amber',
    d: 'M5 20V5a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v15 M3.5 20h12 M7 7h5v4H7z M14 10h2a1.5 1.5 0 0 1 1.5 1.5V16a1.5 1.5 0 0 0 3 0V8L18 5.5',
    desc: '연료 부족. 주유하기',
  },
};

export function iconSvg(id: IconId, color?: string, size = 28): string {
  const ic = ICONS[id];
  const c = color ?? COLORS[ic.color];
  const text = ic.text
    ? ic.text
        .map((t, i) => {
          const y = 12 + (i - (ic.text!.length - 1) / 2) * (ic.textSize! * 1.05) + ic.textSize! * 0.36;
          return `<text x="12" y="${y}" fill="${c}" font-size="${ic.textSize}" font-weight="800" text-anchor="middle" font-family="system-ui, sans-serif">${t}</text>`;
        })
        .join('')
    : '';
  const fill = ic.fill ? c : 'none';
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-label="${ic.name}"><path d="${ic.d}" fill="${fill}" stroke="${c}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>${text}</svg>`;
}

const pathCache = new Map<IconId, Path2D>();

export function drawIcon(ctx: CanvasRenderingContext2D, id: IconId, x: number, y: number, size: number, color: string) {
  const ic = ICONS[id];
  let p = pathCache.get(id);
  if (!p) {
    p = new Path2D(ic.d);
    pathCache.set(id, p);
  }
  ctx.save();
  ctx.translate(x - size / 2, y - size / 2);
  ctx.scale(size / 24, size / 24);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1.7;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.shadowColor = color;
  ctx.shadowBlur = 6;
  if (ic.fill) ctx.fill(p);
  else ctx.stroke(p);
  if (ic.text) {
    ctx.font = `800 ${ic.textSize}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ic.text.forEach((t, i) => ctx.fillText(t, 12, 12 + (i - (ic.text!.length - 1) / 2) * ic.textSize! * 1.05));
  }
  ctx.restore();
}
