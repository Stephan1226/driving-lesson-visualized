---
name: readme-media
description: Re-capture the README's demo GIFs and map screenshots for this three.js driving lesson app (docs/media/). Use when a chapter, scene, or map changes and the README needs updating, or when asked to record/screenshot a scene.
---

# README 미디어 캡처 (driving-lesson-visualized)

The README shows, per chapter: a short description, demo GIFs and a table of contents, plus map screenshots. Media files live in `docs/media/` on `main`.

The app exposes `window.__app = { ctx, player, THREE }`. Scenes deep-link with `?ch=<n>&step=<n|id>`. The scripts here drive headless Chrome over the DevTools protocol with no npm dependencies. `requestAnimationFrame` is replaced by a manual clock, so every frame advances exactly 1/20 s. Recordings are smooth and repeatable no matter how slowly capture runs.

If `lsof -nP -iTCP:5179 -sTCP:LISTEN` shows a Vite server for this repo already running, reuse it. Otherwise start one with `npx vite --port 5179 --strictPort` (`run_in_background`).

Work files go in a temp dir, not the repo: `TMP=${CLAUDE_JOB_DIR:+$CLAUDE_JOB_DIR/tmp}; TMP=${TMP:-$(mktemp -d)}`. Chrome defaults to the macOS app path; set `CHROME_PATH` to use another browser binary. Run parallel captures on different `port`s.

## Table of contents (목차)

Read the real scene list from the app instead of from source:

```js
// with cdp.mjs: await b.open(`${base}/?ch=1`); then
await b.eval(`window.__app.player.steps.map((s) => [s.section, s.id, s.title])`)
```

Section titles and places come from `src/lesson/chapterN.ts`.

## Demo GIFs

```bash
S=.claude/skills/readme-media
node $S/record.mjs http://localhost:5179 "step=garage-exit-right" $TMP/fr_exit 18 9362   # scene seconds, port
(cd $TMP && $S/encode.sh $TMP/fr_exit ch1-pillar-exit 480 2.5 17.5)                     # width, start, end sec
cp $TMP/ch1-pillar-exit.gif docs/media/
```

- `encode.sh` also writes an MP4, which the README doesn't use, so don't copy it.
- Keep each GIF under about 4–5 MB. Trim the range to about 8–15 s, or use `GIF_COLORS=96`.
- Look at a frame or two before committing: `ffmpeg -ss 4 -i x.gif -frames:v 1 check.png`.

Current clips. Re-record a clip when its scene changes. Ranges are seconds of the recorded frames: frame 0 is scene time 0.2 s.

| file | query | record s | range | notes |
|---|---|---|---|---|
| ch1-walkaround.gif | `step=walkaround` | 10 | 0.2–8.2 | `GIF_COLORS=96` |
| ch1-pillar-exit.gif | `step=garage-exit-right` | 17 | 1.2–16.2 | |
| ch1-side-mirror.gif | `step=side-mirror` | 9 | 0–8.7 | |
| ch2-pull-out.gif | `ch=2&step=depart-intro` | 25 | 0.7–8.7 | |
| ch2-exit-merge.gif | `ch=2&step=depart-intro` | 25 | 12.2–23.7 | same recording as above |
| ch2-exit-blind.gif | `ch=2&step=exit-blind` | 9.5 | 0.6–9.2 | |
| ch2-left-arrow.gif | `ch=2&step=left-arrow` | 10 | 1.4–9.6 | |
| ch2-right-red.gif | `ch=2&step=right-red` | 21 | 3.8–20.8 | |
| ch2-roundabout.gif | `ch=2&step=rb-signal` | 16 | 0–15.8 | |

Fixed-camera scenes produce small GIFs, because only the changing parts are stored. Chase-camera scenes are the big ones.

## Map screenshots

Use the free camera with the UI hidden. On the far park view, raise `camera.near` to avoid ground z-fighting. In the garage, push its fog back so the layout reads.

```bash
NEAR='(() => { const c = window.__app.ctx.camera; c.near = 0.5; c.updateProjectionMatrix(); })()'
node $S/shot.mjs http://localhost:5179 "step=outro" $TMP/park.png --t 1 --hide-ui --port 9371 \
  --cam '{"pos":"12,40,30","look":"1,0,-9","fov":40}' --eval "$NEAR"
node $S/shot.mjs http://localhost:5179 "step=mirror-fold" $TMP/garage.png --t 0 --hide-ui --port 9373 \
  --cam '{"pos":"18,20,-14","look":"5,0,1","fov":45}' --eval 'Object.assign(window.__app.ctx.scene.fog, { near: 30, far: 75 })'
ffmpeg -loglevel error -y -i $TMP/park.png -q:v 3 docs/media/map-park.jpg
ffmpeg -loglevel error -y -i $TMP/garage.png -q:v 3 docs/media/map-garage.jpg
```

The city is dense, so oblique far views get blocked by buildings. Use near-top-down views instead, with fog pushed far:

```bash
WIDE='(() => { const c = window.__app.ctx.camera; c.near = 0.5; c.updateProjectionMatrix(); Object.assign(window.__app.ctx.scene.fog, { near: 200, far: 700 }); })()'
node $S/shot.mjs http://localhost:5179 "ch=2&step=red-stop" $TMP/city.png --t 0 --hide-ui --port 9641 \
  --cam '{"pos":"252,95,38","look":"256,0,-2","fov":45}' --eval "$WIDE"          # → map-city.jpg (signal intersection)
node $S/shot.mjs http://localhost:5179 "ch=2&step=rb-yield" $TMP/rb.png --t 0 --hide-ui --port 9633 \
  --cam '{"pos":"295,40,-130","look":"260,0,-172","fov":46}' --eval "$WIDE"     # → map-roundabout.jpg
```

When a new map (environment) is added, pick an overview camera the same way, add a `map-<name>.jpg` column to the README's 맵 table, and add its preset here.

## Before/after (optional)

To compare a visual fix, run `main` in a throwaway worktree and shoot both with the same `--cam`:

```bash
git worktree add --detach $TMP/base origin/main && ln -s "$PWD/node_modules" $TMP/base/node_modules
(cd $TMP/base && npx vite --port 5181 --strictPort)   # run_in_background; kill the listener and remove the worktree after
```
