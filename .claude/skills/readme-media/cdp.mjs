// 의존성 없는 헤드리스 Chrome 드라이버 (DevTools Protocol, Node 24 내장 WebSocket)
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// requestAnimationFrame을 손으로 돌려 고정 간격 프레임을 만든다
const MANUAL_RAF = `
  window.__raf = [];
  window.requestAnimationFrame = (cb) => (window.__raf.push(cb), window.__raf.length);
  // 시작 시각을 실제 시계에 맞춘다 (THREE.Timer는 생성 시각 기준으로 재므로, 0부터 세면 첫 프레임이 음수로 튄다)
  window.__ts = null;
  window.__step = (dt) => {
    if (window.__ts === null) window.__ts = performance.now();
    window.__ts += dt * 1000;
    const q = window.__raf; window.__raf = []; q.forEach((cb) => cb(window.__ts));
  };
`;

export async function launch({ port = 9333, width = 1280, height = 720 } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'cdp-'));
  const proc = spawn(CHROME, [
    '--headless=new', '--use-angle=metal', '--hide-scrollbars', '--mute-audio',
    `--remote-debugging-port=${port}`, `--user-data-dir=${dir}`, `--window-size=${width},${height}`, 'about:blank',
  ], { stdio: 'ignore' });
  let targets;
  for (let i = 0; i < 50; i++) {
    try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); break; } catch { await sleep(200); }
  }
  const page = targets.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0;
  const pending = new Map();
  const listeners = [];
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) {
      const { res, rej } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? rej(new Error(msg.error.message)) : res(msg.result);
    } else if (msg.method) listeners.forEach((l) => l(msg));
  };
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
  const errors = [];
  listeners.push((m) => {
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text);
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map((a) => a.value ?? a.description).join(' '));
  });
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });

  const api = {
    errors,
    async open(url, { manualRaf = true } = {}) {
      if (manualRaf) await send('Page.addScriptToEvaluateOnNewDocument', { source: MANUAL_RAF });
      const loaded = new Promise((r) => listeners.push((m) => m.method === 'Page.loadEventFired' && r()));
      await send('Page.navigate', { url });
      await loaded;
      for (let i = 0; i < 100; i++) { if (await api.eval('!!window.__app')) break; await sleep(100); }
    },
    async eval(expr) {
      const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
      return r.result.value;
    },
    /** 고정 dt로 n 프레임 진행 */
    async step(n = 1, dt = 1 / 20) { await api.eval(`for (let i = 0; i < ${n}; i++) window.__step(${dt})`); },
    async shot(path) {
      const { data } = await send('Page.captureScreenshot', { format: 'png' });
      writeFileSync(path, Buffer.from(data, 'base64'));
    },
    async close() { try { await send('Browser.close'); } catch {} proc.kill(); },
  };
  return api;
}
