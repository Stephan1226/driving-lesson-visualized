---
name: pr-media
description: Capture GIF/MP4 recordings and before/after screenshots of this three.js driving lesson app and embed them in a GitHub PR body. Use when creating a PR in this repo (part of the "커밋해" flow) or when asked to record/screenshot a scene.
---

# PR 미디어 캡처 (driving-lesson-visualized)

The app exposes `window.__app = { ctx, player, THREE }`. Scenes deep-link with `?ch=<n>&step=<n|id>`. The scripts here drive headless Chrome over the DevTools protocol with no npm dependencies. `requestAnimationFrame` is replaced by a manual clock, so every frame advances exactly 1/20 s. Recordings are smooth and repeatable no matter how slowly capture runs.

All scripts take the dev server base URL. If `lsof -nP -iTCP:5179 -sTCP:LISTEN` shows a Vite server for this repo already running, reuse it. Otherwise start one with `npx vite --port 5179 --strictPort` (`run_in_background`).

Put outputs in a temp dir, not the repo: `TMP=${CLAUDE_JOB_DIR:+$CLAUDE_JOB_DIR/tmp}; TMP=${TMP:-$(mktemp -d)}`. Chrome defaults to the macOS app path; set `CHROME_PATH` to use another browser binary.

## 1. Record a scene → MP4 + GIF

```bash
S=.claude/skills/pr-media
node $S/record.mjs http://localhost:5179 "ch=2&step=1" $TMP/frames 29   # seconds of scene time
$S/encode.sh $TMP/frames $TMP/intro 520            # → intro.mp4 (1280x720) + intro.gif (520w, 10fps)
$S/encode.sh $TMP/frames $TMP/part2 520 14 22      # optional: a sub-range in seconds
```

- Recording runs at about 20 frames/s of wall time, so 29 s of scene takes about 30 s. Use `run_in_background` for long scenes.
- Keep each GIF under 5 MB. If it's bigger, split by time range (~10 s per GIF) and/or lower the width (520 worked well). `GIF_COLORS` (default 128) also trades size for quality.
- Look at a contact sheet of a few frames before uploading.

## 2. Stills and before/after

```bash
node $S/shot.mjs http://localhost:5179 "ch=2&step=1" $TMP/stop.png --t 16.6
```

For before/after with the same camera, run `main` in a throwaway worktree on another port:

```bash
git worktree add --detach $TMP/base origin/main
ln -s "$PWD/node_modules" $TMP/base/node_modules
(cd $TMP/base && npx vite --port 5181 --strictPort)   # run_in_background
CAM='{"pos":"11,24,13","look":"3.5,0,-17","fov":42}'
node $S/shot.mjs http://localhost:5181 "step=1&pause=1" $TMP/before.png --cam "$CAM" --hide-ui --port 9341
node $S/shot.mjs http://localhost:5179 "step=1&pause=1" $TMP/after.png  --cam "$CAM" --hide-ui --port 9342
```

Use different `--port`s when running in parallel. When done, clean up: kill the 5181 listener and `git worktree remove --force $TMP/base`.

## 3. Upload to the `pr-assets` branch and embed

Media lives on the orphan branch `pr-assets` under `pr-<N>/`, so binaries never land in `main` through the squash. The repo is public, so raw URLs render inline.

```bash
A=$TMP/assets
git clone --quiet --single-branch --branch pr-assets "$(git remote get-url origin)" $A 2>/dev/null \
  || { git init -q $A && git -C $A checkout -q --orphan pr-assets && git -C $A remote add origin "$(git remote get-url origin)"; }
mkdir -p $A/pr-<N> && cp <files> $A/pr-<N>/
git -C $A add -A && git -C $A commit -qm "PR #<N> media" && git -C $A push -q origin pr-assets
```

URL: `https://raw.githubusercontent.com/Stephan1226/driving-lesson-visualized/pr-assets/pr-<N>/<file>`

In the body:
- GIFs and PNGs inline: `![설명](URL)`
- Before/after as a 2-column table: `| 변경 전 | 변경 후 |`
- MP4 as a link: `[전체 영상 (MP4)](URL)`. GitHub only plays videos uploaded through its own UI.

Create the PR first to get its number, upload, then `gh pr edit <N> --body-file ...`.
