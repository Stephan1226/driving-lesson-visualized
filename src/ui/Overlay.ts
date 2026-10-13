import { Labels } from './Labels';

export interface Fact {
  k: string;
  v: string;
}
export interface StepText {
  title: string;
  body: string;
  facts?: Fact[];
  tip?: string;
  section: number;
}
export interface SectionInfo {
  title: string;
  place: string;
}

export interface OverlayHandlers {
  onStart(): void;
  onPrev(): void;
  onNext(): void;
  onToggle(): void;
  onReplay(): void;
  onJump(i: number): void;
  onSound(): boolean;
  onCamReset(): void;
}

const ICON = {
  prev: 'M6 6h2v12H6zm3.5 6 8.5 6V6z',
  next: 'M16 6h2v12h-2zM6 18l8.5-6L6 6z',
  play: 'M8 5v14l11-7z',
  pause: 'M6 5h4v14H6zm8 0h4v14h-4z',
  replay: 'M12 5V1L7 6l5 5V7a5 5 0 1 1-5 5H5a7 7 0 1 0 7-7z',
  sound: 'M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 8v8a4.5 4.5 0 0 0 2.5-4zM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6z',
  mute: 'M3 9v6h4l5 5V4L7 9H3zm13.6 3 2.2-2.2-1.4-1.4-2.2 2.2-2.2-2.2-1.4 1.4 2.2 2.2-2.2 2.2 1.4 1.4 2.2-2.2 2.2 2.2 1.4-1.4z',
  list: 'M4 6h16v2H4zm0 5h16v2H4zm0 5h16v2H4z',
  cam: 'M12 9a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zm8-4h-3.2L15 3H9L7.2 5H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2z',
};
const svg = (d: string) => `<svg viewBox="0 0 24 24"><path d="${d}"/></svg>`;

const h = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = '') => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
};

export class Overlay {
  labels: Labels;
  private caption = h('div', 'caption hidden');
  private capChip = h('span', 'chip');
  private capCount = h('span', 'count');
  private capTitle = h('h1', 'cap-title');
  private capBody = h('p', 'cap-body');
  private capFacts = h('div', 'cap-facts');
  private capTip = h('div', 'cap-tip');
  insetEl = h('div', 'inset hidden');
  private controls = h('div', 'controls');
  private playBtn = h('button', 'primary');
  private soundBtn = h('button');
  private tlSteps: HTMLDivElement[] = [];
  private tlLabel = h('div', 'tl-label');
  private outline = h('div', 'outline hidden');
  private links: HTMLAnchorElement[] = [];
  private start = h('div', 'start');
  private fadeEl = h('div', 'fade');
  private toastLayer = h('div');
  freeCam = h('div', 'free-cam hidden', '자유 시점 — 클릭하면 안내 카메라로 돌아갑니다');
  private current = -1;

  constructor(
    root: HTMLElement,
    private sections: SectionInfo[],
    private steps: StepText[],
    handlers: OverlayHandlers,
  ) {
    root.append(this.fadeEl);
    this.labels = new Labels(root);
    root.append(this.toastLayer);

    const meta = h('div', 'cap-meta');
    meta.append(this.capChip, this.capCount);
    this.caption.append(meta, this.capTitle, this.capBody, this.capFacts, this.capTip);
    root.append(this.caption, this.insetEl, this.freeCam);
    this.freeCam.onclick = () => handlers.onCamReset();

    // 하단 컨트롤
    const prev = h('button', '', svg(ICON.prev));
    prev.title = '이전 (←)';
    prev.onclick = () => handlers.onPrev();
    this.playBtn.onclick = () => handlers.onToggle();
    this.playBtn.title = '재생/일시정지 (Space)';
    const next = h('button', '', svg(ICON.next));
    next.title = '다음 (→)';
    next.onclick = () => handlers.onNext();
    const replay = h('button', '', svg(ICON.replay));
    replay.title = '이 장면 다시 보기 (R)';
    replay.onclick = () => handlers.onReplay();
    const tl = h('div', 'timeline');
    sections.forEach((_, si) => {
      const sec = h('div', 'tl-sec');
      const idx = steps.map((s, i) => [s, i] as const).filter(([s]) => s.section === si);
      sec.style.flex = String(idx.length);
      for (const [s, i] of idx) {
        const st = h('div', 'tl-step') as HTMLDivElement;
        st.title = `${i + 1}. ${s.title}`;
        st.append(h('div', 'fill'));
        st.onclick = () => handlers.onJump(i);
        sec.append(st);
        this.tlSteps[i] = st;
      }
      tl.append(sec);
    });
    this.soundBtn.innerHTML = svg(ICON.sound);
    this.soundBtn.title = '효과음';
    this.soundBtn.onclick = () => {
      const on = handlers.onSound();
      this.soundBtn.innerHTML = svg(on ? ICON.sound : ICON.mute);
      this.soundBtn.classList.toggle('off', !on);
    };
    const list = h('button', '', svg(ICON.list));
    list.title = '목차';
    list.onclick = () => this.outline.classList.toggle('hidden');
    this.controls.append(prev, this.playBtn, next, replay, tl, this.tlLabel, this.soundBtn, list);
    root.append(this.controls);
    this.setPlaying(true);

    // 목차
    sections.forEach((sec, si) => {
      this.outline.append(h('h4', '', `${String(si + 1).padStart(2, '0')} · ${sec.title}`));
      steps.forEach((s, i) => {
        if (s.section !== si) return;
        const a = h('a', '', `${i + 1}. ${s.title}`) as HTMLAnchorElement;
        a.onclick = () => handlers.onJump(i);
        this.links[i] = a;
        this.outline.append(a);
      });
    });
    root.append(this.outline);

    // 시작 화면
    const box = h('div', 'box');
    box.innerHTML = `
      <div class="eyebrow">운전 첫걸음 · CHAPTER 1</div>
      <h1>주행 전 확인 사항</h1>
      <p>운전을 처음 배우는 분을 위한 3D 애니메이션 강의입니다. 차에 타기 전 점검부터 출발 직전 자세 잡기까지, 장면마다 직접 보면서 익혀요.</p>
      <ol>${sections.map((s, i) => `<li><span>${i + 1}</span>${s.title} <em style="font-style:normal;color:#9aa3b2;font-size:13px">· ${s.place}</em></li>`).join('')}</ol>
      <button>시작하기</button>
      <div class="keys"><kbd>←</kbd> <kbd>→</kbd> 이전/다음 · <kbd>Space</kbd> 일시정지 · <kbd>R</kbd> 다시 보기 · 화면을 드래그하면 자유 시점</div>`;
    box.querySelector('button')!.onclick = () => {
      this.start.classList.add('hidden');
      handlers.onStart();
    };
    this.start.append(box);
    root.append(this.start);
  }

  get started() {
    return this.start.classList.contains('hidden');
  }

  setStep(i: number) {
    const s = this.steps[i];
    const first = this.current === -1;
    this.current = i;
    const apply = () => {
      const sec = this.sections[s.section];
      this.capChip.textContent = `${String(s.section + 1).padStart(2, '0')} · ${sec.title}`;
      this.capCount.textContent = `${i + 1} / ${this.steps.length}`;
      this.capTitle.innerHTML = s.title;
      this.capBody.innerHTML = s.body;
      this.capFacts.innerHTML = (s.facts ?? []).map((f) => `<span class="fact"><span class="k">${f.k}</span><span class="v">${f.v}</span></span>`).join('');
      this.capTip.innerHTML = s.tip ?? '';
      this.caption.classList.remove('swap', 'hidden');
    };
    if (first) apply();
    else {
      this.caption.classList.add('swap');
      setTimeout(apply, 260);
    }
    this.tlSteps.forEach((el, k) => {
      el.classList.toggle('done', k < i);
      el.classList.toggle('cur', k === i);
      (el.firstChild as HTMLElement).style.width = k < i ? '100%' : '0';
    });
    this.links.forEach((a, k) => a.classList.toggle('cur', k === i));
    this.tlLabel.textContent = `${i + 1} / ${this.steps.length}`;
  }

  setProgress(frac: number) {
    const el = this.tlSteps[this.current];
    if (el) (el.firstChild as HTMLElement).style.width = `${Math.min(100, frac * 100).toFixed(1)}%`;
  }

  setPlaying(p: boolean) {
    this.playBtn.innerHTML = svg(p ? ICON.pause : ICON.play);
  }

  showInset(html: string | null) {
    if (!html) {
      this.insetEl.classList.add('hidden');
      return;
    }
    this.insetEl.innerHTML = html;
    this.insetEl.classList.remove('hidden');
  }

  /** 인셋 안 data-k 요소 중 keys만 클래스 부여 */
  insetActive(keys: string | string[] | null, cls = 'on') {
    const ks = keys === null ? [] : Array.isArray(keys) ? keys : [keys];
    this.insetEl.querySelectorAll<HTMLElement>('[data-k]').forEach((el) => el.classList.toggle(cls, ks.includes(el.dataset.k!)));
  }

  insetQuery<T extends Element = HTMLElement>(sel: string) {
    return this.insetEl.querySelector<T & Element>(sel);
  }

  toast(text: string, kind: '' | 'warn' | 'ok' = '') {
    const t = h('div', `toast ${kind}`, text);
    this.toastLayer.append(t);
    setTimeout(() => t.remove(), 1700);
  }

  flash() {
    const f = h('div', 'flash');
    this.toastLayer.append(f);
    setTimeout(() => f.remove(), 950);
  }

  fade(on: boolean) {
    this.fadeEl.classList.toggle('on', on);
    return new Promise<void>((r) => setTimeout(r, 460));
  }
}
