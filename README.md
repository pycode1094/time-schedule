# 부산인력개발원 종합시간표 뷰어

부산상공회의소 부산인력개발원의 종합시간표 엑셀 파일(.xlsx)을 브라우저에서 바로 조회할 수 있는 웹 애플리케이션입니다.

## 주요 기능

| 탭 | 설명 |
|---|---|
| **과정별** | 과정 선택 후 주간 시간표 조회, 연속 동일 수업 자동 병합 |
| **날짜별** | 특정 날짜의 전체 과정 수업 현황, 강의실 사용 현황 |
| **강사별** | 강사 검색/선택 후 주간 스케줄, 시간 중복 배정 감지 |
| **전체 주간** | 모든 과정을 카테고리별로 한눈에 보는 주간 요약, 강사 중복 경고 |

## 기술 스택

- **Vite** + **React** — 빠른 빌드 및 HMR
- **Tailwind CSS v4** — 유틸리티 기반 스타일링
- **SheetJS (xlsx)** — 브라우저에서 직접 엑셀 파싱 (서버 불필요)

## 실행 방법

### 개발 서버

```bash
npm install
npm run dev
```

브라우저에서 http://localhost:5173 접속 후 엑셀 파일을 드래그앤드롭 또는 클릭하여 업로드합니다.

### 관리자 비밀번호

```bash
cp .env.example .env.local   # ADMIN_PASSWORD= 에 값 입력 (커밋되지 않음)
```

비어 있으면 개발 서버의 관리자 API는 모두 거부됩니다. 운영 Worker는 `wrangler secret put ADMIN_PASSWORD` 로 설정하며, 없으면 마찬가지로 거부합니다.

### 시간표 변경 감지 확인

```bash
node scripts/diff-test.mjs old.xlsx new.xlsx [--today=YYYY-MM-DD] [--all]
```

두 시간표를 비교해 강사별 추가/삭제/변경 수업과 알림 메시지 미리보기를 출력합니다 (발송하지 않음). 기본적으로 오늘 이전 날짜의 변경은 제외합니다.

### 강사 변경 알림 (발송 도우미 → 비즈고 알림톡)

```bash
cp notify-helper/.env.example notify-helper/.env   # 비즈고 키 등 직접 입력 (커밋되지 않음)
npm run notify-helper
```

시간표를 올리는 PC에서 발송 도우미를 실행합니다. 관리자 화면에서 [업로드 + 알림 발송]을 누르면, 일정이 바뀐 강사에게 도우미(`http://127.0.0.1:5599`)가 비즈고 API로 알림톡을 보냅니다.

- 문구는 등록 템플릿 `01000_2_21`에 바뀐 수업 요약(최대 5줄)과 [시간표 확인] 버튼을 붙인 것입니다.
- 관리자 화면은 변경을 구조화된 값(날짜 · 교시 · 과정 · 강의실 · 유형)으로만 보냅니다. 도우미가 이 값을 검사한 뒤 문구를 만듭니다.
- 미리보기 창에서 강사별 실제 발송 문구를 확인할 수 있습니다.
- 도우미 테스트: `npm test`

- **비즈고에 등록하는 허용 IP는 도우미가 도는 PC의 공인 IP입니다.** GitHub Pages 주소가 아닙니다.
- 설정, 템플릿, 단계별 테스트는 [notify-helper/README.md](notify-helper/README.md)를 참고하세요.
- 시간표를 올리는 PC에 설치하는 방법(비개발자용)은 [docs/INSTALL-teamlead-pc.md](docs/INSTALL-teamlead-pc.md)에 있습니다.

업로드할 때 변경 요약(전화번호 없음)이 함께 저장됩니다. 그래서 강사별 탭에서 강사를 고르면 "최근 변경" 목록과 바뀐 칸이 표시됩니다. 주소에 `?teacher=이름`을 붙이면 그 강사의 시간표가 바로 열립니다.

TIS(내부 발송 사이트)로 넘기는 방식(`src/utils/tisHandoff.js`)은 보류 중이며 `VITE_NOTIFY_MODE=tis`일 때만 보입니다. 진행 상황은 [docs/HANDOFF-alimtalk.md](docs/HANDOFF-alimtalk.md)를 참고하세요.

### 비밀 · 개인정보 유출 검사

```bash
git config core.hooksPath .githooks   # 처음 한 번: 커밋할 때마다 자동 검사
npm run check-secrets                 # 스테이징된 파일 검사
node scripts/check-secrets.mjs --history   # git 전체 이력 검사
```

스테이징된 파일에 아래가 있으면 커밋을 막습니다.
- 비즈고 API 키(`mars_ak_…`)
- 휴대전화 번호
- `.env` 파일
- 엑셀 원본

공개용 `public/data/default-schedule.xlsx`만 허용하며, 이 파일도 안에 전화번호가 없는지 검사합니다.

### 프로덕션 빌드

```bash
npm run build
```

`dist/` 폴더에 정적 파일이 생성됩니다. 별도 서버 없이 `dist/index.html`을 브라우저로 열거나, 정적 호스팅 서비스에 배포할 수 있습니다.

## 사용법

1. 종합시간표 엑셀 파일(.xlsx)을 업로드 화면에 드래그하거나 클릭하여 선택
2. 자동으로 파싱 후 시간표 뷰어로 전환
3. 상단 탭으로 과정별 / 날짜별 / 강사별 / 전체 주간 뷰 전환
4. 주간 네비게이션으로 원하는 주/월 이동

## 엑셀 파일 형식

- Sheet 1: 종합시간표 (양성과정) — 날짜별 8교시 x 18개 과정
- Sheet 2: 교강사연락처 — 강사명, 분야 정보
