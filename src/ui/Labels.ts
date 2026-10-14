import * as THREE from 'three';

export type Anchor = THREE.Object3D | THREE.Vector3 | (() => THREE.Vector3);
export type LabelKind = '' | 'warn' | 'ok' | 'info' | 'amber';

export interface LabelOpts {
  text: string;
  sub?: string;
  kind?: LabelKind;
  dir?: 'up' | 'down' | 'left' | 'right';
  len?: number;
  big?: boolean;
  visible?: boolean;
}

interface Label {
  el: HTMLDivElement;
  pill: HTMLDivElement;
  stem: HTMLDivElement;
  anchor: Anchor;
  opts: Required<LabelOpts>;
}

const tmp = new THREE.Vector3();

/** 3D 지점에 붙는 설명 라벨 */
export class Labels {
  layer = document.createElement('div');
  private map = new Map<string, Label>();

  constructor(parent: HTMLElement) {
    this.layer.className = 'labels';
    parent.appendChild(this.layer);
  }

  add(id: string, anchor: Anchor, o: LabelOpts) {
    this.remove(id);
    const el = document.createElement('div');
    const dot = document.createElement('div');
    dot.className = 'dot';
    const stem = document.createElement('div');
    stem.className = 'stem';
    const pill = document.createElement('div');
    pill.className = 'pill';
    el.append(stem, dot, pill);
    // 처음엔 투명하게: 숨긴 라벨이 첫 프레임에 잠깐 비쳤다 사라지지 않도록
    el.style.opacity = '0';
    this.layer.appendChild(el);
    const opts: Required<LabelOpts> = { sub: '', kind: '', dir: 'up', len: 36, big: false, visible: true, ...o };
    const l: Label = { el, pill, stem, anchor, opts };
    this.map.set(id, l);
    this.render(l, true);
    return this;
  }

  set(id: string, o: Partial<LabelOpts>) {
    const l = this.map.get(id);
    if (!l) return;
    const before = l.opts.text + l.opts.kind;
    const wasVisible = l.opts.visible;
    Object.assign(l.opts, o);
    this.render(l, before !== l.opts.text + l.opts.kind || (!wasVisible && l.opts.visible));
  }

  show(id: string, v: boolean) {
    const l = this.map.get(id);
    if (l && l.opts.visible !== v) this.set(id, { visible: v });
  }

  has(id: string) {
    return this.map.has(id);
  }

  remove(id: string) {
    const l = this.map.get(id);
    if (l) {
      l.el.remove();
      this.map.delete(id);
    }
  }

  clear() {
    for (const id of [...this.map.keys()]) this.remove(id);
  }

  private render(l: Label, pop: boolean) {
    const o = l.opts;
    l.el.className = `label ${o.kind} ${o.big ? 'big' : ''} ${pop ? 'pop' : ''}`;
    l.pill.innerHTML = o.text + (o.sub ? `<small>${o.sub}</small>` : '');
    const L = o.len;
    const s = l.stem.style;
    const p = l.pill.style;
    s.left = s.top = s.width = s.height = '';
    if (o.dir === 'up') {
      Object.assign(s, { left: '-1px', top: `${-L}px`, width: '2px', height: `${L}px` });
      Object.assign(p, { left: '0px', top: `${-L}px`, transform: 'translate(-50%, -100%)' });
    } else if (o.dir === 'down') {
      Object.assign(s, { left: '-1px', top: '0px', width: '2px', height: `${L}px` });
      Object.assign(p, { left: '0px', top: `${L}px`, transform: 'translate(-50%, 0)' });
    } else if (o.dir === 'left') {
      Object.assign(s, { left: `${-L}px`, top: '-1px', width: `${L}px`, height: '2px' });
      Object.assign(p, { left: `${-L}px`, top: '0px', transform: 'translate(-100%, -50%)' });
    } else {
      Object.assign(s, { left: '0px', top: '-1px', width: `${L}px`, height: '2px' });
      Object.assign(p, { left: `${L}px`, top: '0px', transform: 'translate(0, -50%)' });
    }
    if (pop) {
      // 애니메이션 재시작
      void l.pill.offsetWidth;
    }
  }

  update(camera: THREE.Camera, w: number, h: number) {
    for (const l of this.map.values()) {
      const a = l.anchor;
      if (a instanceof THREE.Object3D) a.getWorldPosition(tmp);
      else if (a instanceof THREE.Vector3) tmp.copy(a);
      else tmp.copy(a());
      tmp.project(camera);
      const behind = tmp.z > 1 || tmp.z < -1;
      const x = (tmp.x * 0.5 + 0.5) * w;
      const y = (-tmp.y * 0.5 + 0.5) * h;
      const vis = l.opts.visible && !behind;
      l.el.style.opacity = vis ? '1' : '0';
      l.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    }
  }
}
