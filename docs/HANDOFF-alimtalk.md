# 강사 시간표 변경 알림: 인수인계 메모

> 다른 컴퓨터에서 Claude Code로 이어서 작업할 때 이 문서를 먼저 읽히세요.
> 예: "docs/HANDOFF-alimtalk.md 읽고 '사람이 할 일'과 '남은 일'부터 이어서 진행해줘"

작성일: 2026-11-02 · 갱신: 2026-11-04 (7단계 배포 완료, v2 템플릿 `01000_2_21` 적용: 알림톡에 변경 내용 포함)

---

## 1. 목표

종합시간표 엑셀이 수정되어 관리자 화면에서 업로드되면, **일정이 바뀐 강사에게만** 카카오 알림톡으로 무엇이 바뀌었는지(최대 5줄) 알린다.
강사는 알림의 [시간표 확인] 버튼으로 사이트에 들어와, 강사 화면의 **"바뀐 수업이 N개 있어요"** 에서 자세한 내용을 확인한다. (UI 개편 후: 기억한 강사가 있으면 기본 주소로도 바로 강사 화면, 없으면 홈 맨 위 강사 검색)

---

## 2. 결정 사항

| 항목 | 결정 | 이유 |
|---|---|---|
| 발송 | **발송 도우미(`notify-helper/`) → 비즈고 OMNI API V2 직접 호출** (확정, 2026-11-03) | 이미 API 키를 받았다. 발송 시점 · 대상 · 결과를 이 앱에서 바로 확인할 수 있다. |
| 발송 위치 | **시간표를 올리는 PC(팀장님 PC)** 에서 도우미를 실행 (127.0.0.1:5599) | 비즈고는 **연동관리에 등록한 IP에서만** 호출을 받는다. GitHub Pages · Cloudflare Worker는 고정 IP가 없다. |
| 비즈고 허용 IP | **도우미가 도는 PC의 공인 IP** (GitHub Pages 아님, `ipconfig`의 내부 IP 아님) | 도우미가 https://api.ipify.org 로 확인해 `EXPECTED_PUBLIC_IPS`와 비교한다. 틀리면 발송을 막는다. |
| 알림톡 문구 | **템플릿 `01000_2_21`**(v2, 승인됨, 2026-11-04 적용). 변수 `#{이름}` · `#{변경내용}`, 강조 제목 없음, 버튼 WL "시간표 확인" → `https://pycode1094.github.io/time-schedule/` (모바일 링크만). `01000_2_20`(v1, 변경 내용 없음)은 예비로 남김 | 강사가 카톡만 보고도 무엇이 바뀌었는지 알 수 있게 |
| 문구를 만드는 곳 | **도우미가 만든다.** 관리자 화면은 이름 · 번호 · 구조화된 변경 값(날짜 · 교시 · 과정 · 강의실 · 유형 · 변경 전후 요약)만 보낸다. 도우미가 검사한 뒤 정해진 형식으로 `#{변경내용}`을 만든다. 자유 문장은 받지 않는다 | 화면이나 다른 경로에서 임의 문구 · 링크를 넣을 수 없게 |
| `#{변경내용}` 형식 | `▶ 11/05(목) 3~4교시 과정명 · 강의실 [변경]`. 같은 날 · 과정 · 강의실 · 유형의 연속 교시는 한 줄. 최대 5줄(넘으면 4줄 + "외 N건"), 오늘 이전 제외, 500자 이내 | 짧게. 자세한 내용은 사이트에서 |
| 변경 내용 확인 | 사이트 **강사 화면 "바뀐 수업"** 카드 · 시트 + 바뀐 수업 표시, `?teacher=이름` (해시와 같이 써도 됨: `?teacher=이름#/teacher`) | 업로드할 때 변경 요약(전화번호 없음)을 Worker에 저장한다(4단계). |
| 카카오 채널 | 기존 **@부산인력개발원** | 알림톡은 지정한 번호로만 1:1 발송되므로 학생에게는 가지 않는다. |
| 개인정보 | 전화번호는 관리자 브라우저와 발송 도우미 안에서만 쓴다 | Worker 업로드본은 연락처를 지운 사본(0단계). 변경 내역 · 로그 · 도우미 `/preview` 요청에는 전체 번호가 없다. |
| 공개 저장소 | 2026-11-03 저장소를 지우고 같은 이름으로 새로 만들어 공개용 이력(커밋 1개)으로 시작 | 예전 저장소 · 로컬 이력에 강사 번호 · 비밀번호 · 공인 IP가 있었다(7단계 기록). |
| TIS 넘기기 (4단계) | **보류.** 코드(`src/utils/tisHandoff.js` 등)는 남기고 화면에서 숨김 | `VITE_NOTIFY_MODE=tis`로 다시 켤 수 있다. |

---

## 3. 진행 현황

### 지금 상태 (2026-11-04)

- **7단계 실행 완료**(사람, 2026-11-03):
  - 기존 저장소 삭제 → 같은 이름으로 재생성 → `publish`를 `main`으로 push
  - Pages 배포, `VITE_API_BASE` 등록
  - Worker 재배포, `ADMIN_PASSWORD` 변경, 운영 Worker 원본 재업로드
- 공개 사이트의 `default-schedule.xlsx`와 Worker `/api/schedule` 엑셀 모두 **전화번호 0건** 확인.
- 내 PC에서 운영 사이트 ↔ 발송 도우미 연결 확인, **실제 발송 1건 성공**(`01000_2_20`).
- **v2 템플릿 `01000_2_21` 적용**(8단계, 아래). 내 PC `notify-helper/.env`: `BIZGO_TEMPLATE_CODE=01000_2_21`, `NOTIFY_DRY_RUN=true`, `NOTIFY_TEST_PHONE` 비움.
- 브랜치:
  - `main`: 공개 이력(`origin/main`)
  - `private-history`: 예전 로컬 이력. **절대 push 금지**(`4b2302f`에 이 PC의 공인 IP가 남아 있음)

### 커밋

**공개 이력 (`main`)**

| 커밋 | 내용 |
|---|---|
| `90e55b8` | 초기 공개 버전 (0~7단계 결과를 커밋 1개로) |
| 그다음 | 8단계: v2 템플릿 `01000_2_21`, 구조화된 변경 값, 미리보기 실제 문구 |

**예전 로컬 이력 (`private-history`, push 금지)**: `2cc4e19` ~ `46c89ee`. 단계별 내용은 다음과 같다.
- 0단계: 개인정보 · 비밀번호 노출 제거. `default-schedule.xlsx`의 전화번호 열을 비우고 원본은 `private/`에 백업. 관리자 비밀번호를 `.env.local`/wrangler secret으로 옮김. 업로드할 때 전화번호를 지운 사본만 전송
- 1~2단계: `parseTeachers`에서 전화번호 읽기, `src/utils/scheduleDiff.js`, `scripts/diff-test.mjs`, 업로드 미리보기 모달
- 3단계: 발송 도우미 첫 버전
- 4단계: TIS 넘기기(현재 보류) + 사이트 "최근 변경" 표시 · `?teacher=` · 변경 내역 API(`/api/schedule/changes`, `/api/admin/changes`)
- 5단계: 발송 도우미 확정 · 보안 강화
- 6단계: 예시 IP 교체, 시간당 한도 5회, 샌드박스 · 운영 1건 발송 확인
- 7단계: 공개용 이력 · 저장소 교체 절차 · 팀장님 PC 설치 안내서

### 8단계: v2 템플릿 (변경 내용 포함), 2026-11-04

**관리자 화면**
- `src/utils/notifyChanges.js`: `diffByTeacher` 결과 → 구조화된 값 `{ changes: [...최대 10건], moreChanges }`. 도우미와 같은 기준으로 미리 합치고, 과정명 40 · 강의실 20 · 요약 40자로 자른다.
- 미리보기 창: 도우미 `POST /preview`로 강사별 **실제 발송 문구**를 받아 노란 칸("카카오톡 발송 문구")에 보여준다. 번호는 보내지 않는다. 문구를 받아 오기 전이거나 실패하면 [업로드 + 알림 발송]을 끈다.
- `/notify`에는 `{ name, phone, changes, moreChanges }`를 보낸다.

**발송 도우미**
- `notify-helper/changes.js`: 검사 → 합치기 → `#{변경내용}` 만들기.
  - 날짜 · 교시 · 유형 · 길이를 검사한다. 링크와 `#{ }`는 거부하고, 제어문자는 공백으로 바꾼다.
  - 같은 날 · 과정 · 강의실 · 유형의 연속 교시를 합친 뒤 5줄 · 500자로 줄인다.
  - 규칙 표는 `notify-helper/README.md`에 있다.
- `templates.json`: `01000_2_21` 추가(본문이 등록 문구와 글자 단위로 같은지 테스트로 확인). `01000_2_20`은 예비. 템플릿에 `#{변경내용}`이 없으면 `changes`를 읽지 않는다.
- `POST /preview` 추가: 문구만 돌려준다. 번호를 받지 않고, 비즈고를 호출하지 않고, 기록하지 않는다. 킬스위치와 무관, 100명까지.
- 요청 바디 한도 64KB → **256KB**(50명 × 변경 10건이 들어가도록).
- 한 건이라도 틀린 강사는 `INVALID_CHANGES`, 오늘 이후 변경이 없는 강사는 `NO_CHANGES`로 보내지 않는다(그 강사만 제외).
- 변경 전 · 후 요약(`before`/`after`)은 검사만 하고 문구에는 넣지 않는다(한 줄을 짧게).

**확인 결과 (2026-11-04, 이 PC)**
- `npm test`(node:test) 17개 통과
  - 한 줄 형식 · 줄 합치기 · 정렬 · 5줄 초과("외 N건", `moreChanges`) · 과거 날짜 제외
  - 악의적 입력: URL · `#{ }` · 줄바꿈 · 안 보이는 문자 · 초과 길이 · 형식 오류
  - 500자, 템플릿 본문 일치, `01000_2_20`이 `changes`를 무시
  - `/preview` · `/notify` DRY-RUN, `/preview` 보안(Origin · Host · Content-Type · 256KB · 100명)
- DRY-RUN(localhost:5173, `test-data/old.xlsx` → `new.xlsx`): 변경 강사 3명 중 번호 있는 1명
  - 미리보기 노란 칸 문구와 도우미 요청 바디 `text`가 같다
  - `/preview` 요청에 번호가 없고, 응답에도 전체 번호가 없다
- lint · build 통과

### 사람이 할 일

- [x] 비즈고 템플릿 `01000_2_20` 검수 승인, 허용 IP · 발신 프로필 키 입력, 샌드박스 · 운영 1건 (2026-11-03)
- [x] GitHub 저장소 교체 · Pages 재배포 · `VITE_API_BASE` (2026-11-03)
- [x] 운영 관리자 비밀번호 변경, Worker 재배포, 운영 Worker 원본 재업로드 (2026-11-03)
- [x] 운영 사이트 ↔ 도우미 연결, 실제 1건 `01000_2_20` (2026-11-03)
- [x] 비즈고 템플릿 `01000_2_21` 검수 승인
- [ ] **`01000_2_21` 실제 1건 테스트**(내 폰). `.env` 바꿀 줄은 `notify-helper/README.md`의 "테스트 순서" 3번. 받은 문구 · 버튼이 미리보기 노란 칸과 같은지 확인
  - 비즈고에 PC 링크를 등록했다면 `templates.json`의 `01000_2_21` 버튼에 `"urlPc": "https://pycode1094.github.io/time-schedule/"`를 추가해야 한다(지금은 모바일 링크만)
- [ ] 운영 전환: `NOTIFY_DRY_RUN=false`, `NOTIFY_TEST_PHONE` 비움
- [ ] **팀장님 PC 설치**: `docs/INSTALL-teamlead-pc.md`(비개발자용). USB는 아래 `git archive`로 만든 공개용 사본
- [ ] 각 PC에서 `git config core.hooksPath .githooks`

---

## 4. 남은 일

- 문구가 바뀌면 `notify-helper/templates.json`을 고치고 비즈고에 다시 검수받는다. `#{변경내용}`의 한 줄 형식 · 줄 수는 `notify-helper/changes.js`에서만 바꾼다(관리자 화면의 `src/utils/notifyChanges.js`와 합치는 기준 · `MAX_CHANGES`를 같게 유지).
- 사이트(GitHub Pages)는 push하면 바로 바뀐다. 사이트가 쓰는 도우미 기능(예: `/preview`)이 바뀌면 **팀장님 PC 도우미도 같이 업데이트**해야 한다. 도우미가 옛 버전이면 미리보기에 "문구 미리보기를 지원하지 않습니다"가 뜨고 발송 버튼이 꺼진다.
- 팀장님 PC용 USB (공개용 사본: `.env` · `test-data` · `private` 없음):
  ```powershell
  git archive --format=zip --prefix=time-schedule/ -o $env:USERPROFILE\Desktop\time-schedule-usb.zip main
  ```
- push는 `git push origin main`만 한다. `private-history`는 push하지 않는다.
- (보류) TIS 넘기기: TIS 연동 방식이 정해지면 `src/config/tis.config.js`(엑셀 양식), `src/utils/tisHandoff.js`(URL 파라미터·폼 POST)만 고치면 된다. 다시 쓰려면 `VITE_NOTIFY_MODE=tis`.

### 7단계 기록: 저장소 교체 (2026-11-03 실행 완료)

- **이유**:
  - 기존 공개 저장소의 `public/data/default-schedule.xlsx`에 강사 휴대전화 번호 32개가 있었다(이력 포함 96건). 공개 사이트에서도 그대로 받아졌다.
  - 소스에 관리자 비밀번호가 하드코딩되어 있었다.
  - 로컬 이력(`4b2302f`)에는 이 PC의 공인 IP가 있었다.
- **한 일**:
  1. 현재 상태를 부모 없는 커밋 1개(`publish`, 지금의 `main`)로 만들고 `check-secrets --history publish`로 검사했다. 공인 IP · 번호 · `mars_ak_` · `.env` · `private/` · `test-data/` · xlsx 원본 0건, 공개 엑셀 연락처 열 빈칸.
  2. 저장소 삭제 · 재생성 → push → Pages(GitHub Actions) · `VITE_API_BASE`
  3. `wrangler deploy` · `ADMIN_PASSWORD` 변경 → 운영 Worker 원본 재업로드 → 공개 엑셀 · Worker 엑셀 번호 0건 확인
- **한계**: 남의 클론 · 검색엔진 캐시는 지울 수 없다. 예전 비밀번호는 폐기했다.
- **주소 유지**: 저장소 이름(`time-schedule`)과 Vite `base`(`/time-schedule/`)가 그대로라 `https://pycode1094.github.io/time-schedule/`는 바뀌지 않았다. 승인된 알림톡 버튼 링크이므로 **저장소 이름을 바꾸면 안 된다.**
- **프런트 운영 설정**: `deploy.yml` 빌드에 `VITE_NOTIFY_MODE=helper`, `VITE_NOTIFY_HELPER_URL=http://127.0.0.1:5599`를 고정했다. `workflow_dispatch`로 `gh workflow run deploy.yml` 재배포 가능.
- **팀장님 PC `notify-helper/.env`**: `ALLOWED_ORIGINS=https://pycode1094.github.io`(경로 없이). Chrome이 "로컬 네트워크 액세스" 권한을 물으면 허용한다.
- `check-secrets`: `--history <브랜치>`, `--file <xlsx>`(운영에서 받은 엑셀 확인용), `notify-helper/.env`의 `EXPECTED_PUBLIC_IPS`와 같은 IP 검사(값은 출력 안 함), `private/` · `test-data/` · `notify-helper/logs/` 경로 차단.

---

## 5. 보안 주의

- `private/`(연락처 포함 원본), `test-data/`(테스트 xlsx), `.env*`, `notify-helper/.env`, `notify-helper/logs/`, `public/data/schedule-changes.json`은 **gitignore 대상이며 절대 커밋/공개 금지**. 커밋 전 `npm run check-secrets`, 훅을 켜 두면 자동.
- **`private-history` 브랜치는 push 금지.** 예전 이력에 이 PC의 공인 IP가 남아 있다.
- 비즈고 API 키와 비밀번호는 채팅(Claude 포함)에 붙여넣지 말고 `.env` 파일에 직접 입력한다. **Claude에게도 `.env` 값을 읽거나 출력하지 말라고 할 것**(있는지 여부만 확인).
- 전화번호는 관리자 브라우저(미리보기)와 발송 도우미 안에서만 쓴다. 이 동작을 깨뜨리지 않는다.
  - 전체 번호가 들어가지 않는 곳: Worker 업로드본, 변경 내역, 도우미 로그(뒤 4자리만), 도우미 `/preview` 요청, 콘솔
- 운영 Worker의 `GET /api/schedule`과 `GET /api/schedule/changes`는 누구나 받을 수 있다. 둘 다 전화번호를 담지 않는다.
- 이 폴더를 zip으로 옮길 때 위 파일이 포함된다. 이메일이나 공개 클라우드에 올리지 말고 USB 같은 직접 전달 수단을 쓴다. 팀장님 PC용은 `git archive` 사본을 쓴다.

---

## 6. 새 컴퓨터에서 시작하기

```bash
npm ci
git config core.hooksPath .githooks
cp .env.example .env.local                        # ADMIN_PASSWORD 직접 입력
cp notify-helper/.env.example notify-helper/.env  # 비즈고 값 직접 입력 (처음 PC 라면)
npm test                                          # 발송 도우미 테스트
npm run dev
NOTIFY_DRY_RUN=true npm run notify-helper         # 다른 터미널
```

- 변경 감지 스크립트: `node scripts/diff-test.mjs test-data/old.xlsx test-data/new.xlsx`
- 로컬 확인 순서:
  1. 관리자 로그인
  2. `test-data/old.xlsx` [업로드만]
  3. `test-data/new.xlsx` → 미리보기 상태 줄과 노란 칸(카카오톡 발송 문구) 확인 → [업로드 + 알림 발송] (DRY-RUN)
  4. 도우미 창의 요청 바디 `text`가 노란 칸과 같은지 확인
  5. 사이트에서 `?teacher=강사이름` (test-data 에서 번호가 있는 강사)
  6. [기본 시간표로 되돌리기]
- **PC마다 공인 IP가 다를 수 있다.** 새 PC에서 실제(샌드박스 포함) 발송을 하려면 그 PC의 공인 IP가 비즈고에 등록되어 있어야 한다.
