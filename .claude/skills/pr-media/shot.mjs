// 스틸 한 장: 장면의 t초 지점, 또는 지정한 카메라(UI 숨김)로
// node shot.mjs <baseUrl> "<query>" <out.png> [--t 12.5] [--cam '{"pos":"11,24,13","look":"3.5,0,-17","fov":42}'] [--hide-ui] [--port 9334]
//   --cam 을 주면 자유 시점으로 전환해 같은 구도를 main(변경 전)과 비교할 수 있다
import { launch } from './cdp.mjs';

const [base, query, out, ...rest] = process.argv.slice(2);
const opt = (k) => { const i = rest.indexOf(k); return i >= 0 ? rest[i + 1] : undefined; };
const t = Number(opt('--t') ?? 0);
const cam = opt('--cam') ? JSON.parse(opt('--cam')) : null;
const b = await launch({ port: Number(opt('--port') ?? 9334) });
await b.open(`${base}/?${query}`);
await b.step(Math.max(3, Math.round(t * 20)));
if (rest.includes('--hide-ui')) await b.eval(`document.getElementById('ui').style.visibility = 'hidden'`);
if (cam) {
  await b.eval(`(() => {
    const { ctx, player } = window.__app;
    player.userCam = true;
    player.controls.enableDamping = false;
    ctx.camera.position.set(${cam.pos});
    player.controls.target.set(${cam.look});
    ctx.camera.fov = ${cam.fov ?? 45};
    ctx.camera.updateProjectionMatrix();
  })()`);
}
await b.eval(`window.__app.player.playing = false`);
await b.step(2);
await b.shot(out);
console.log(out, b.errors.length ? `ERRORS ${JSON.stringify(b.errors)}` : 'no errors');
await b.close();
