// 장면 녹화: 고정 20fps로 프레임을 PNG로 저장
// node record.mjs <baseUrl> "<query>" <outDir> <seconds> [port]
//   예) node record.mjs http://localhost:5179 "ch=2&step=1" /tmp/frames 29
import { mkdirSync } from 'node:fs';
import { launch } from './cdp.mjs';

const [base, query, out, seconds, port = '9333'] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const b = await launch({ port: Number(port) });
await b.open(`${base}/?${query}`);
await b.step(3);
const N = Math.round(Number(seconds) * 20);
for (let i = 0; i < N; i++) {
  await b.step(1);
  await b.shot(`${out}/f_${String(i).padStart(4, '0')}.png`);
}
console.log(`frames ${N} → ${out}`, b.errors.length ? `ERRORS ${JSON.stringify(b.errors)}` : 'no errors');
await b.close();
