# 운전 첫걸음 (driving-lesson-visualized)

처음 운전하는 사람을 위한 3D 애니메이션 강의. Vite + TypeScript + three.js.

## 개발

- `npm run dev`: dev 서버. 이미 떠 있는지 `lsof -nP -iTCP:5179 -sTCP:LISTEN`으로 먼저 확인하고, 떠 있으면 재사용
- `npm run typecheck`, `npm run build`
- 장면 바로 열기: `?ch=2&step=1&t=15&pause=1`
  - `ch`: 챕터 (기본 1)
  - `step`: 번호 또는 id
  - `t`: 초
  - `pause=1`: 일시정지
- 디버그 핸들: `window.__app = { ctx, player, THREE }`
- 챕터 정의는 `src/lesson/chapterN.ts`, 장면은 `src/lesson/steps/*.ts`

## 작업 시작 전: main 최신화 확인

구현을 시작할 때마다 먼저 `git fetch origin`을 하고 현재 브랜치가 `origin/main` 기준으로 최신인지 확인한다.

- **`main`에 있을 때:** 뒤처졌으면 `git pull --ff-only`
- **기능 브랜치에 있을 때:** `git merge-base --is-ancestor origin/main HEAD`로 확인
  - 이미 머지됐거나 낡은 브랜치면 최신 `main`에서 새 브랜치를 딴다
  - 머지 안 된 작업이 있으면 `origin/main` 위로 rebase한다. 이미 push한 브랜치면 사용자에게 알린다
- **커밋 안 된 변경이 있을 때:** 건드리지 말고 먼저 사용자에게 알린다

확인 결과를 한 줄로 보고한 뒤 작업한다 (예: "main 최신 상태 확인 (abc1234)").

## README 유지

README에는 챕터별 간단한 설명, 시연 GIF, 목차(섹션·장면), 맵 스크린샷만 둔다. 미디어 파일은 `docs/media/` (`docs/pr/`은 예전 PR 본문에 쓴 사진 보관용). 아래가 바뀌는 작업은 같은 PR에서 README도 함께 고친다. 촬영 방법과 구도는 `readme-media` 스킬 참고.

| 바뀐 것 | README에서 고칠 것 |
|---|---|
| 챕터 추가 | 챕터 섹션 추가 (설명, 시연 GIF, 목차) |
| 챕터 제목·소개·섹션 변경 | 해당 챕터의 설명·목차 |
| 장면 추가·삭제·제목 변경 | 해당 챕터의 목차, 장면 수 |
| 시연 GIF에 쓰인 장면이 눈에 띄게 바뀜 | 해당 GIF 다시 녹화 |
| 맵(환경) 추가 | 맵 표에 스크린샷 추가 |
| 맵 모습이 눈에 띄게 바뀜 | 해당 맵 스크린샷 다시 촬영 |

## "커밋해" = 브랜치 → PR → 스쿼시 머지 → main 풀

사용자가 커밋을 요청하면 확인을 다시 묻지 않고 아래를 한 번에 진행한다. "커밋만" / "PR만"이라고 하면 그 단계에서 멈춘다.

1. `main`에 있으면 짧은 기능 브랜치를 먼저 만든다
2. 위 "README 유지" 대상이면 README와 `docs/media/`가 반영됐는지 확인한다
3. 커밋한다. 메시지는 기존 로그처럼 영어 명령문 (예: `Add ...`, `Fix ...`)
4. push하고 PR을 만든다
   - **제목:** 영어 문장, 첫 글자 대문자, 접두어 없음. 스쿼시 커밋 제목이 되므로 기존 커밋 로그 스타일을 따른다
   - **본문:** 한국어. `## 개요` / `## 변경 사항`(파일명을 적은 `###` 소제목) / `## 확인`. 영상·사진은 넣지 않는다 (README가 그 역할)
5. `gh pr merge <번호> --squash --delete-branch --subject "<PR 제목> (#<번호>)"`. 다른 명령과 묶지 말고 단독으로 실행한다 (`.claude/settings.json`의 허용 규칙에 맞게)
6. `main`으로 돌아와 `git pull` 하고, 스쿼시 커밋이 올라왔는지 확인한다
7. PR 주소와 `main`의 최종 커밋을 보고한다
