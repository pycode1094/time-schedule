# 강사 시간표 변경 알림: 인수인계 메모

> 다른 컴퓨터에서 Claude Code로 이어서 작업할 때 이 문서를 먼저 읽히세요.
> 예: "docs/HANDOFF-alimtalk.md 읽고 '사람이 할 일'과 '남은 일'부터 이어서 진행해줘"

작성일: 2026-11-02 · 갱신: 2026-11-03 (발송 방식을 "발송 도우미 → 비즈고 API 직접 호출"로 확정)

---

## 1. 목표

종합시간표 엑셀이 수정되어 관리자 화면에서 업로드되면, **일정이 바뀐 강사에게만** 카카오 알림톡으로 "시간표가 변경되었다"고 알린다.
강사는 알림의 [시간표 확인] 버튼으로 사이트에 들어와, 강사별 탭의 **"최근 변경"** 에서 무엇이 바뀌었는지 확인한다.

---

## 2. 결정 사항

| 항목 | 결정 | 이유 |
|---|---|---|
| 발송 | **발송 도우미(`notify-helper/`) → 비즈고 OMNI API V2 직접 호출** (확정, 2026-11-03) | 이미 API 키를 받았다. 발송 시점 · 대상 · 결과를 이 앱에서 바로 확인할 수 있다. |
| 발송 위치 | **시간표를 올리는 PC(팀장님 PC)** 에서 도우미를 실행 (127.0.0.1:5599) | 비즈고는 **연동관리에 등록한 IP에서만** 호출을 받는다. GitHub Pages · Cloudflare Worker는 고정 IP가 없다. |
| 비즈고 허용 IP | **도우미가 도는 PC의 공인 IP** (GitHub Pages 아님, `ipconfig`의 내부 IP 아님) | 도우미가 https://api.ipify.org 로 확인해 `EXPECTED_PUBLIC_IPS`와 비교한다. 틀리면 발송을 막는다. |
| 알림톡 문구 | **고정**. 템플릿 `01000_2_20`(승인됨), 변수 `#{이름}` 하나, 강조 제목 없음, 버튼 WL "시간표 확인" → `https://pycode1094.github.io/time-schedule/` (모바일 링크만) | 변경 내용은 카톡에 넣지 않는다. 문구가 강사마다 같아 검수와 관리가 쉽다. |
| 문구를 만드는 곳 | **도우미가 `templates.json`으로 만든다.** 관리자 화면은 이름 · 번호만 보내고 다른 필드는 무시 | 화면이나 다른 경로에서 임의 문구를 보낼 수 없게 |
| 변경 내용 확인 | 사이트 **강사별 탭 "최근 변경"** + 바뀐 칸 강조, `?teacher=이름` | 업로드할 때 변경 요약(전화번호 없음)을 Worker에 저장한다(4단계). |
| 카카오 채널 | 기존 **@부산인력개발원** | 알림톡은 지정한 번호로만 1:1 발송되므로 학생에게는 가지 않는다. |
| 개인정보 | 전화번호는 관리자 브라우저와 발송 도우미 안에서만 쓴다 | Worker 업로드본은 연락처를 지운 사본(0단계), 변경 내역 · 로그에는 전체 번호가 없다. |
| TIS 넘기기 (4단계) | **보류.** 코드(`src/utils/tisHandoff.js` 등)는 남기고 화면에서 숨김 | `VITE_NOTIFY_MODE=tis`로 다시 켤 수 있다. |

---

## 3. 진행 현황

### 완료 (git 커밋됨, push는 아직 안 함)

| 커밋 | 내용 |
|---|---|
| `2cc4e19` | 0단계: git init. 개인정보와 비밀번호 노출 제거. `default-schedule.xlsx`의 전화번호 열을 비우고 원본은 `private/`에 백업. 관리자 비밀번호를 `.env.local`/wrangler secret으로 옮김. 업로드할 때 전화번호를 지운 사본만 전송. |
| `774c892` | 1단계: `parseTeachers`에서 전화번호 읽기, `src/utils/scheduleDiff.js`, `scripts/diff-test.mjs` |
| `e43ecc4` | 2단계: 관리자 패널 업로드 미리보기 모달 |
| `82e3e47` | 이 인수인계 메모 |
| `83e56a6` | 3단계: 발송 도우미 첫 버전 |
| `67fbe22` | 4단계: TIS 넘기기(현재 보류) + 사이트 "최근 변경" 표시 · `?teacher=` · 변경 내역 API(`/api/schedule/changes`, `/api/admin/changes`) |
| `4b2302f` | 5단계: 발송 도우미 확정 · 보안 강화 (아래) |
| `e78ae00` 이후 | 예시 IP 교체, 시간당 한도 5회, 템플릿 승인 반영, 샌드박스 · 운영 1건 발송 확인 (6단계) |

### 5단계에서 만든 것

**관리자 화면** (`VITE_NOTIFY_MODE` 기본값 `helper`)
- 미리보기 창에서 도우미 `/health`를 확인해 "발송 도우미 연결됨 · dry-run · IP 정상 (x.x.x.x)"처럼 표시한다.
- 아래 경우에는 [업로드 + 알림 발송]을 끄고 사유를 보여준다: 도우미 꺼짐, 키 없음, IP 불일치, `NOTIFY_ENABLED=false`, 발신 프로필 키·템플릿 코드 미설정, 시간당 한도. DRY-RUN은 키·발신 프로필·IP 불일치를 경고로만 보여준다.
- 발송 결과는 강사별로 접수/실패와 사유를 보여준다. [업로드만]은 항상 동작한다.
- 도우미에는 `{ requestId, recipients: [{ name, phone }] }`만 보낸다.

**발송 도우미** (`notify-helper/`, Node 내장 기능만, 외부 의존성 0)
- `templates.json`: `01000_2_20`(강사용, 승인됨)과 `education_scheduled_v1`(예비 연동 테스트용, `testOnly`). `.env`의 `BIZGO_TEMPLATE_CODE`로 자동 선택한다.
- 공인 IP 확인: 시작할 때와 발송 직전(10분 캐시, 3초 타임아웃). 불일치면 실제 발송을 차단하고, 조회 실패면 경고만 한다. 비즈고 인증·IP 오류도 같은 안내로 바꿔 보여준다.
- 보안:
  - 127.0.0.1에만 바인딩, Host·Origin 정확히 일치, JSON만 64KB까지
  - `BIZGO_BASE_URL`은 비즈고 두 주소만(아니면 시작 거부), 리다이렉트를 따라가지 않음, 10초 타임아웃
  - 키는 `.env`에서만 읽고 어디에도 출력하지 않음
- 남용 방지(.env로 조절): 요청당 50명, 시간당 5회, 하루 200건, 같은 번호 10분, 같은 `requestId` 재전송 차단, 번호·이름 형식 오류는 그 강사만 제외
- 킬스위치: `NOTIFY_ENABLED=false`
- 로그: 날짜별 jsonl, 번호 뒤 4자리, 이름 첫 글자 + `**`, 30일 지나면 자동 삭제
- 설치: `scripts/install-notify-helper.ps1`(Node 20 확인, 로그온 시 창 없이 자동 실행, `.env`를 현재 사용자만 읽게), `scripts/uninstall-notify-helper.ps1`. **만들기만 했고 실행은 하지 않았다.**

**비밀 유출 검사**: `scripts/check-secrets.mjs` + `.githooks/pre-commit`
- 스테이징된 파일에 API 키, 휴대전화 번호, `.env`, xlsx 원본이 있으면 커밋을 막는다. 공개용 `default-schedule.xlsx`는 압축을 풀어 번호가 없는지 검사한다.
- `--history`로 전체 이력을 검사할 수 있다. 2026-11-03 기준 커밋 6개에서 문제 없음.
- 훅은 각 PC에서 `git config core.hooksPath .githooks`로 켠다.

**확인 결과 (2026-11-03, 이 PC, DRY-RUN)**
- `test-data/old.xlsx` → `new.xlsx`: 변경 강사 3명 중 번호 있는 1명에게 DRY-RUN 요청이 만들어졌다. 본문은 등록 문구와 글자 단위로 일치했고, 강조 제목은 없고, 버튼만 들어갔다.
- 보안 테스트: 실제 도우미 21개 항목, 가짜 네트워크로 실제 발송 모드 17개 항목 모두 통과
  - 실제 도우미: 다른 Origin·잘못된 Host·51명·같은 요청 재전송·Content-Type·64KB·킬스위치·IP 불일치·허용되지 않은 BASE_URL
  - 실제 발송 모드: IP 불일치 차단·비즈고 IP 오류 안내·시간당/하루 한도·같은 번호 10분·리다이렉트 거부·키 노출 없음
- 이 PC의 공인 IP는 `/health`의 `publicIp`로 확인할 수 있다(이 문서에는 적지 않음).
- **샌드박스 발송 (2026-11-03)**: `EXPECTED_PUBLIC_IPS` 설정 → ipStatus `ok`, test-data 업로드 후 1명 발송 → 비즈고 `A000 Success`(msgKey 발급). 로그는 이름 `김**`, 번호 뒤 4자리만
- **운영 1건 (2026-11-03)**: `BIZGO_BASE_URL` 운영, `NOTIFY_TEST_PHONE` 설정 → 미리보기 "production · IP 정상 · 모든 알림을 테스트 번호로만 발송", 강사 1명 체크 → 테스트 번호로만 `A000 Success`(msgKey 발급). 로그에 `mode: production`, `to4`(테스트 번호 뒤 4자리) 기록. 끝난 뒤 `NOTIFY_TEST_PHONE` 비움, `NOTIFY_DRY_RUN=true`로 되돌림(BASE_URL 은 운영 주소 그대로)

### 사람이 할 일

- [x] 비즈고 템플릿 `01000_2_20` 검수 승인
- [x] `notify-helper/.env`에 `EXPECTED_PUBLIC_IPS` 입력, 샌드박스에서 IP 정상 확인 (2026-11-03)
- [x] 발신 프로필 키(`BIZGO_SENDER_KEY`) 입력, 샌드박스 · 운영에서 정상 동작 확인 (2026-11-03)
- [x] 단계별 테스트: 샌드박스 → `01000_2_20`으로 내 폰 1건 (2026-11-03, 둘 다 A000)
- [ ] 내 폰으로 받은 메시지의 문구 · [시간표 확인] 버튼 링크가 등록 내용과 같은지 눈으로 확인
- [ ] 운영 전환: `NOTIFY_DRY_RUN=false`, `NOTIFY_TEST_PHONE` 비움 (`.env` 바꾸는 방법은 `notify-helper/README.md`의 "테스트 순서")
- [ ] **GitHub 저장소 교체 · Pages 재배포** (아래 7단계 명령어 1~5). **급함**: 지금 공개 사이트가 번호 32개가 든 엑셀을 그대로 내려준다
- [ ] 운영 관리자 비밀번호 변경: `wrangler secret put ADMIN_PASSWORD` (직접 입력). 예전 비밀번호는 공개 저장소에 노출됐었다
- [ ] **Worker 재배포** (`wrangler deploy`): 변경 내역 API가 4단계에서 새로 생겼다
- [ ] 운영 Worker 에 저장된 예전 원본(연락처 포함일 수 있음)을 관리자 화면으로 다시 올려 교체
- [ ] **팀장님 PC 설치**: `docs/INSTALL-teamlead-pc.md` (비개발자용 안내서). USB 는 `git archive` 로 만든 공개용 사본
- [ ] 각 PC에서 `git config core.hooksPath .githooks`

---

## 4. 남은 일

- 문구가 바뀌면 `notify-helper/templates.json`만 고친다.
- 배포: 아래 7단계로 새 저장소에 push(Pages는 `deploy.yml`), Worker 재배포, 팀장님 PC 설치.

### 7단계: 배포 준비 (2026-11-03 준비 완료, 실행은 사람이)

되돌릴 수 없는 작업(저장소 삭제 · 생성, push, `wrangler deploy`, secret, 설치 스크립트 실행)은 하지 않았다. 아래 명령어를 사람이 직접 실행한다.

**공개용 이력: 로컬 `publish` 브랜치**
- 로컬 `main` 이력(`2cc4e19` ~)에는 공개하면 안 되는 값이 남아 있다. `4b2302f`의 README · `.env.example` 예시에 이 PC의 실제 공인 IP(= `notify-helper/.env`의 `EXPECTED_PUBLIC_IPS` 값)가 들어 있다. 그래서 `main`은 로컬에만 둔다.
- 현재 파일 상태를 부모 없는 커밋 1개("초기 공개 버전")로 만든 `publish` 브랜치를 push한다. `main` 최신 커밋과 파일 내용이 같다.
- 검사 결과 (2026-11-03):
  - `check-secrets --history publish`: 커밋 1개에서 문제 0건(공인 IP · 번호 · `mars_ak_` · `.env` · `private/` · `test-data/` · xlsx 원본 모두 없음)
  - `default-schedule.xlsx`: 연락처 열 33행 모두 빈칸
- `check-secrets` 보강:
  - `--history <브랜치>`로 한 브랜치만 검사
  - `notify-helper/.env`의 `EXPECTED_PUBLIC_IPS`(CIDR 포함)와 같은 IP를 찾음(값은 출력 안 함)
  - `private/` · `test-data/` · `notify-helper/logs/` 경로 차단
  - `--file`로 파일 하나 검사(운영에서 받은 xlsx 확인용)
- 이후 개발은 공개 이력 위에서 한다(아래 명령어 4-2: 로컬 `publish`를 `main`으로 이름 바꾸기).

**기존 저장소 `pycode1094/time-schedule` 조회 결과 (2026-11-03, 읽기만)**
- 공개(public), 포크 0개, Pages 켜짐, 커밋 20개(2026-03-13 ~ 10-01)
- 이력 전체에서 `public/data/default-schedule.xlsx`에 휴대전화 번호 96건(서로 다른 번호 32개)
- **지금 공개 중인 최신 커밋(`bbd6f54`)에도 32개가 남아 있다.** `https://pycode1094.github.io/time-schedule/data/default-schedule.xlsx`에서도 그대로 받아진다
- 소스에 관리자 비밀번호 하드코딩: 최신 소스와 `4ec793c` · `61ee13f` · `e719423`
- `.env`, 원본 xlsx(`private/` · `test-data/`), `mars_ak_` 키, 이 PC 공인 IP는 없음
- 결론: 저장소를 지우고 새로 만드는 게 맞다. 예전 비밀번호는 노출된 것으로 보고 바꾼다. 남의 클론 · 검색엔진 캐시까지는 지울 수 없다.

**프런트 운영 설정**
- `deploy.yml` 빌드에 `VITE_NOTIFY_MODE=helper`, `VITE_NOTIFY_HELPER_URL=http://127.0.0.1:5599`를 고정해 두었다.
- `workflow_dispatch`도 추가해, 저장소를 새로 만든 뒤 `gh workflow run`으로 다시 배포할 수 있다.
- 팀장님 PC `notify-helper/.env`: `ALLOWED_ORIGINS=https://pycode1094.github.io` (경로 없이). Chrome이 "로컬 네트워크 액세스" 권한을 물으면 허용한다.

**주소 유지**: 저장소 이름(`time-schedule`)과 Vite `base`(`/time-schedule/`)가 그대로이므로 `https://pycode1094.github.io/time-schedule/`는 바뀌지 않는다. 승인된 알림톡 버튼 링크이므로 저장소 이름을 바꾸면 안 된다.

**사람이 실행할 명령어** (PowerShell, 저장소 폴더에서)

```powershell
# ── 0. 준비 (처음 한 번): GitHub CLI 설치 · 로그인, 삭제 권한
winget install --id GitHub.cli          # 설치 후 PowerShell 새로 열기
gh auth login                           # GitHub.com → HTTPS → 브라우저 로그인
gh auth refresh -h github.com -s delete_repo
#    Worker 주소를 미리 확인해 둔다 (기존 저장소 secret 은 다시 읽을 수 없음):
#    Cloudflare 대시보드 → Workers & Pages → time-schedule-api → https://time-schedule-api.<계정>.workers.dev

# ── 1. 공개용 이력 최종 확인
git log --oneline publish                          # 커밋 1개 "초기 공개 버전"
node scripts/check-secrets.mjs --history publish   # "문제 없음 (공인 IP 포함)"

# ── 2. (선택) 기존 저장소 백업. 번호가 들어 있으니 비공개 위치(USB 등)에만
git clone --mirror https://github.com/pycode1094/time-schedule.git D:\backup\time-schedule-old.git

# ── 3. 기존 저장소 삭제 → 같은 이름으로 새로 만들기 (되돌릴 수 없음)
gh repo delete pycode1094/time-schedule --yes
gh repo create pycode1094/time-schedule --public --description "부산인력개발원 종합시간표 뷰어"

# ── 4. publish 를 새 저장소 main 으로 push
git remote add origin https://github.com/pycode1094/time-schedule.git
git push -u origin publish:main
#    4-2. 이후 개발은 공개 이력 위에서: 로컬 브랜치 이름 정리 (예전 이력은 로컬에만 보관)
git branch -m main private-history
git branch -m publish main
git branch -u origin/main main
git checkout main

# ── 5. Pages(GitHub Actions) 켜기 → Worker 주소 secret → 다시 배포
#    (4번 push 때 자동 배포는 Pages 가 꺼져 있어 실패할 수 있다. 여기서 다시 돌린다)
gh api -X POST repos/pycode1094/time-schedule/pages -f build_type=workflow
gh secret set VITE_API_BASE --repo pycode1094/time-schedule          # Worker 주소 입력
gh workflow run deploy.yml --repo pycode1094/time-schedule --ref main
gh run watch --repo pycode1094/time-schedule
#    확인: 사이트가 열리고, 공개 엑셀에 번호가 없는지
curl.exe -s -o $env:TEMP\live.xlsx https://pycode1094.github.io/time-schedule/data/default-schedule.xlsx
node scripts/check-secrets.mjs --file $env:TEMP\live.xlsx; Remove-Item $env:TEMP\live.xlsx

# ── 6. Cloudflare Worker 재배포 → 관리자 비밀번호 변경
npx wrangler login
npx wrangler deploy
npx wrangler secret put ADMIN_PASSWORD                               # 새 비밀번호 직접 입력
curl.exe -s https://time-schedule-api.<계정>.workers.dev/api/schedule/changes   # {"ok":true,"uploads":[...]} 이면 새 코드

# ── 7. 운영 Worker 의 예전 원본 교체
#    https://pycode1094.github.io/time-schedule/ → [관리자] 새 비밀번호로 로그인
#    → 최신 종합시간표 엑셀 선택 → [업로드만]  (연락처를 지운 사본으로 덮어씀)
curl.exe -s -o $env:TEMP\worker.xlsx https://time-schedule-api.<계정>.workers.dev/api/schedule
node scripts/check-secrets.mjs --file $env:TEMP\worker.xlsx; Remove-Item $env:TEMP\worker.xlsx

# ── 8. 팀장님 PC 용 USB (공개용 사본: .env · test-data · private 없음)
git archive --format=zip --prefix=time-schedule/ -o $env:USERPROFILE\Desktop\time-schedule-usb.zip main
#    USB 에 풀어서 전달 → docs/INSTALL-teamlead-pc.md 순서대로 설치 (실제 공인 IP · 키는 따로 전달)
```
- (보류) TIS 넘기기: TIS 연동 방식이 정해지면 `src/config/tis.config.js`(엑셀 양식), `src/utils/tisHandoff.js`(URL 파라미터·폼 POST)만 고치면 된다. 다시 쓰려면 `VITE_NOTIFY_MODE=tis`.

---

## 5. 보안 주의

- `private/`(연락처 포함 원본), `test-data/`(테스트 xlsx), `.env*`, `notify-helper/.env`, `notify-helper/logs/`, `public/data/schedule-changes.json`은 **gitignore 대상이며 절대 커밋/공개 금지**. 커밋 전 `npm run check-secrets`, 훅을 켜 두면 자동.
- 비즈고 API 키와 비밀번호는 채팅(Claude 포함)에 붙여넣지 말고 `.env` 파일에 직접 입력한다. **Claude에게도 `.env` 값을 읽거나 출력하지 말라고 할 것**(있는지 여부만 확인).
- 전화번호는 관리자 브라우저(미리보기)와 발송 도우미 안에서만 쓴다. Worker 업로드본, 변경 내역, 도우미 로그(뒤 4자리만), 콘솔에는 전체 번호가 들어가지 않는다. 이 동작을 깨뜨리지 않는다.
- 운영 Worker의 `GET /api/schedule`과 `GET /api/schedule/changes`는 누구나 받을 수 있다. 둘 다 전화번호를 담지 않는다.
- 이 폴더를 zip으로 옮길 때 위 파일이 포함된다. 이메일이나 공개 클라우드에 올리지 말고 USB 같은 직접 전달 수단을 쓴다.

---

## 6. 새 컴퓨터에서 시작하기

```bash
npm ci
git config core.hooksPath .githooks
cp .env.example .env.local                        # ADMIN_PASSWORD 직접 입력
cp notify-helper/.env.example notify-helper/.env  # 비즈고 값 직접 입력 (처음 PC 라면)
npm run dev
NOTIFY_DRY_RUN=true npm run notify-helper         # 다른 터미널
```

- 변경 감지 스크립트: `node scripts/diff-test.mjs test-data/old.xlsx test-data/new.xlsx`
- 로컬 확인 순서:
  1. 관리자 로그인
  2. `test-data/old.xlsx` [업로드만]
  3. `test-data/new.xlsx` → 미리보기 상태 줄 확인 → [업로드 + 알림 발송] (DRY-RUN)
  4. 도우미 창에서 요청 바디 확인
  5. 사이트에서 `?teacher=강사이름` (test-data 에서 번호가 있는 강사)
  6. [기본 시간표로 되돌리기]
- **PC마다 공인 IP가 다를 수 있다.** 새 PC에서 실제(샌드박스 포함) 발송을 하려면 그 PC의 공인 IP가 비즈고에 등록되어 있어야 한다.
