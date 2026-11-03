# 알림톡 발송 도우미 (notify-helper)

종합시간표를 올리는 PC에서 실행하는 작은 서버입니다. 관리자 화면에서 **[업로드 + 알림 발송]** 을 누르면, 일정이 바뀐 강사에게 이 도우미가 인포뱅크 비즈고 OMNI API V2로 카카오 알림톡을 보냅니다.

```
관리자 화면 (브라우저) ──POST /notify──▶ 발송 도우미 (127.0.0.1:5599) ──▶ 비즈고 API ──▶ 카카오 알림톡
     이름 · 번호만 보냄                   문구는 등록 템플릿으로 여기서 만듦
```

- 알림톡에는 변경 내용이 들어가지 않습니다. 등록한 고정 문구와 [시간표 확인] 버튼만 갑니다. 무엇이 바뀌었는지는 강사가 사이트의 강사별 탭("최근 변경")에서 확인합니다.
- Node 20 이상만 있으면 됩니다. 외부 npm 패키지를 쓰지 않습니다.

## ⚠ 비즈고에 등록하는 IP는 "이 도우미가 도는 PC의 공인 IP"입니다

- 비즈고는 **연동관리에 등록한 IP에서 온 호출만** 받습니다.
- 등록할 IP는 **GitHub Pages 주소가 아니고**, `ipconfig`에 나오는 내부 IP(192.168.x.x 등)도 아닙니다. **발송 도우미를 실행하는 PC의 공인 IP**입니다.
- 공인 IP는 도우미 시작 화면이나 `http://127.0.0.1:5599/health`의 `publicIp`에서 볼 수 있습니다. 네이버에서 "내 아이피"로 검색해도 됩니다.
- 그 IP를 비즈고 연동관리에 등록하고, `.env`의 `EXPECTED_PUBLIC_IPS`에도 똑같이 적습니다(쉼표 구분, CIDR 가능. 예: `203.0.113.10` 또는 `203.0.113.0/24`).
- 도우미는 시작할 때와 발송 직전(10분 캐시)에 https://api.ipify.org 로 현재 공인 IP를 확인합니다.
  - 목록에 없으면 발송을 막고 "현재 공인 IP x.x.x.x 가 비즈고 허용 IP에 없습니다. 비즈고 연동관리에 추가하세요"라고 안내합니다.
  - 조회에 실패하면 경고만 하고 진행합니다.
- 비즈고가 인증 오류나 IP 오류를 돌려줘도 같은 안내로 바꿔 보여줍니다.
- 사무실 인터넷 회선이 바뀌거나, 다른 PC에서 발송하면 공인 IP가 달라질 수 있습니다.

## 실행

```bash
cp notify-helper/.env.example notify-helper/.env   # 처음 한 번. 값은 직접 입력
npm run notify-helper
```

- `127.0.0.1:5599`에서만 대기하므로 같은 PC의 브라우저에서만 접근할 수 있습니다.
- 관리자 화면에서 시간표를 올리면 미리보기 창에 **"발송 도우미 연결됨 · dry-run · IP 정상 (x.x.x.x)"** 처럼 상태가 나옵니다.
  - 발송할 수 없는 상태면 [업로드 + 알림 발송] 버튼이 꺼지고 사유가 표시됩니다: 도우미 꺼짐, 키 없음, IP 불일치, `NOTIFY_ENABLED=false`, 발신 프로필 키·템플릿 코드 미설정. DRY-RUN은 키·발신 프로필·IP 불일치를 경고로만 보여줍니다.
  - [업로드만]은 도우미 상태와 상관없이 항상 동작합니다.
- `.env`와 `templates.json`은 요청마다 다시 읽으므로 고친 뒤 재시작하지 않아도 됩니다. 단, `BIZGO_BASE_URL`이 허용 주소가 아니면 아예 시작하지 않습니다.
- 터미널에서 환경변수로 준 값이 `.env`보다 우선합니다(테스트용). **API 키만은 `.env` 파일에서만** 읽습니다.

## 팀장님 PC에 설치 (로그온 시 자동 실행)

```powershell
# 저장소 폴더에서, 일반 PowerShell
powershell -ExecutionPolicy Bypass -File scripts\install-notify-helper.ps1
```

1. Node.js 20 이상인지 확인합니다.
2. `notify-helper\.env`를 **현재 사용자만** 읽고 쓸 수 있게 권한을 바꿉니다(icacls). 편집기로 고친 뒤 권한이 풀렸다면 스크립트를 다시 실행하세요.
3. 작업 스케줄러에 `TimeSchedule-NotifyHelper`를 등록합니다. 로그온하면 창 없이 실행되고(로그온 직후 창이 잠깐 깜빡일 수 있음), 실패하면 1분 뒤 다시 시작하며, 실행 시간 제한이 없습니다.
4. 바로 시작해서 `/health`로 상태를 보여줍니다. 시작에 실패하면 원인이 `notify-helper\logs\start-error.txt`에 남습니다.

제거: `powershell -ExecutionPolicy Bypass -File scripts\uninstall-notify-helper.ps1`. 작업과 실행 중인 도우미를 지웁니다. `.env`와 로그는 남기고, `-ResetEnvPermissions`를 주면 `.env` 권한을 원래대로 돌립니다.

## 문구: `templates.json`

`.env`의 `BIZGO_TEMPLATE_CODE`와 같은 이름의 설정을 자동으로 고릅니다.

| 템플릿 코드 | 용도 |
|---|---|
| `01000_2_20` | 강사용 시간표 변경 안내. 비즈고 등록본, **승인됨**. 평소에 쓰는 템플릿 |
| `education_scheduled_v1` | 비즈고 기본 템플릿(수강생용). 예비 **연동 테스트용**으로만 남겨 둠. `testOnly`라서 `NOTIFY_TEST_PHONE`이 있어야 보냅니다. 쓰려면 본문을 비즈고 콘솔에서 복사해 넣어야 합니다 |

`01000_2_20` 본문 (줄바꿈은 `\n`, 끝 줄바꿈 없음, 강조 제목 없음):

```
안녕하세요 #{이름} 강사님,
부산인력개발원입니다.

담당하시는 수업의 시간표가 변경되었습니다.
아래 [시간표 확인] 버튼을 눌러 변경된 일정을 확인해 주세요.

감사합니다.
```

- 변수는 `#{이름}` 하나이고, 강사명으로 채웁니다(`variables: { "강사명": "#{이름}" }`).
- 버튼은 웹링크(WL) "시간표 확인", 모바일 링크 `https://pycode1094.github.io/time-schedule/`입니다. PC 링크는 등록하지 않았으므로 넣지 않습니다.

> **⚠ 등록된 템플릿과 글자 하나까지 같아야 합니다.** 본문의 띄어쓰기·줄바꿈·문장부호, 강조 제목 유무, 버튼(이름·타입·링크)이 하나라도 다르면 발송에 실패합니다. 비즈고에서 문구를 고쳐 다시 검수받았다면 `templates.json`도 함께 고치세요.

**문구는 항상 이 도우미가 만듭니다.** 관리자 화면은 강사 이름과 번호만 보내고, 그 밖의 필드(문구, 변경내용 등)는 무시합니다. 이름은 한글 2~10자 또는 영문 이름만 받습니다. 줄바꿈이나 띄어쓴 문장이 섞인 이름은 거부해서 `#{이름}`으로 임의 문구를 넣을 수 없게 했습니다.

## 설정: `notify-helper/.env`

| 이름 | 기본값 | 설명 |
|---|---|---|
| `NOTIFY_ENABLED` | 켜짐 | **킬스위치.** `false`면 DRY-RUN을 포함해 모든 발송 거부 |
| `NOTIFY_DRY_RUN` | `true` | `true`면 비즈고를 호출하지 않고 요청 내용만 만듭니다 |
| `BIZGO_API_KEY` | | 통합키(`mars_ak_`로 시작). 이 파일에서만 읽고, 시작할 때 형식만 검사합니다 |
| `BIZGO_BASE_URL` | 샌드박스 | `https://sandbox-mars.ibapi.kr/api/comm` 또는 `https://mars.ibapi.kr/api/comm`만. 다른 주소면 시작 거부 |
| `BIZGO_SENDER_KEY` | | 발신 프로필 키. 샌드박스·운영에서만 필수 |
| `BIZGO_TEMPLATE_CODE` | | `01000_2_20` 또는 `education_scheduled_v1` |
| `BIZGO_SMS_FROM` | (선택) | 알림톡 실패 시 문자 대체발송 번호(90바이트 이하 SMS, 넘으면 LMS) |
| `BIZGO_PAYMENT_CODE` | (선택) | 정산용 부서코드 |
| `EXPECTED_PUBLIC_IPS` | | 비즈고 허용 IP(이 PC의 공인 IP). 쉼표, CIDR. 비우면 비교하지 않고 경고만 |
| `NOTIFY_TEST_PHONE` | | 값이 있으면 **모든 알림을 이 번호로만** 보냅니다. 운영 전환 시 반드시 비우기 |
| `NOTIFY_MAX_RECIPIENTS` | 50 | 요청당 최대 인원 |
| `NOTIFY_MAX_REQUESTS_PER_HOUR` | 5 | 시간당 발송 요청 수(샌드박스·운영만 셈) |
| `NOTIFY_MAX_SENDS_PER_DAY` | 200 | 하루 발송 건수(샌드박스·운영만 셈) |
| `NOTIFY_PHONE_COOLDOWN_MIN` | 10 | 같은 번호에 다시 보내기까지 기다리는 시간(분) |
| `ALLOWED_ORIGINS` | localhost:5173, 127.0.0.1:5173, https://pycode1094.github.io | 발송을 허용할 관리자 화면 주소. 정확히 같아야 함 |

## 테스트 순서: 단계별 `.env` 바꾸는 방법

각 단계에서 `.env`를 고친 뒤 관리자 화면에서 시간표를 다시 올리고, 미리보기 창의 상태 줄을 확인한 다음 [업로드 + 알림 발송]을 누릅니다. 강사별 결과는 패널과 도우미 창에 나옵니다.

> 시간당 5회 한도는 샌드박스·운영 요청을 셉니다. 테스트를 여러 번 해야 하면 `NOTIFY_MAX_REQUESTS_PER_HOUR`를 잠시 늘렸다가 되돌리세요. 같은 강사 번호로는 10분 안에 다시 보내지 않습니다. 이 기록은 메모리에만 있어서 도우미를 다시 시작하면 초기화됩니다.

**1. DRY-RUN: 비즈고 호출 없이 요청 바디만 확인** (지금 상태)
```
NOTIFY_DRY_RUN=true
BIZGO_TEMPLATE_CODE=01000_2_20
```

**2. 샌드박스: 실제 발송·과금 없이 인증·IP·연동만 확인**
```
NOTIFY_DRY_RUN=false
BIZGO_BASE_URL=https://sandbox-mars.ibapi.kr/api/comm
BIZGO_SENDER_KEY=(발신 프로필 키)
EXPECTED_PUBLIC_IPS=(이 PC 공인 IP, /health 의 publicIp)
NOTIFY_TEST_PHONE=(내 번호)
```
미리보기 상태 줄이 "· sandbox · IP 정상"이면 됩니다. 결과가 `A000`(접수)이면 연동은 성공입니다. 샌드박스는 실제로 보내지 않아서, 템플릿 문구 불일치는 다음 단계에서 최종 확인합니다.

**3. 실제 1건: 내 폰으로만**
```
BIZGO_BASE_URL=https://mars.ibapi.kr/api/comm
BIZGO_TEMPLATE_CODE=01000_2_20
NOTIFY_TEST_PHONE=(내 번호)          ← 반드시 유지
```
미리보기에서 강사 1명만 체크하고 보냅니다. 누구에게 보내는 요청이든 내 폰으로만 옵니다. 받은 메시지의 문구와 버튼이 등록 내용과 같은지 확인하세요. 확인이 끝나면 `NOTIFY_TEST_PHONE`을 비우고 `NOTIFY_DRY_RUN=true`로 되돌립니다.

**4. 운영**
```
NOTIFY_TEST_PHONE=                   ← 비우기
```
미리보기 상태 줄이 빨간색으로 "실제 강사 번호로 발송됩니다"가 됩니다. 팀장님 PC에 설치할 때는 그 PC의 공인 IP를 비즈고 연동관리와 `EXPECTED_PUBLIC_IPS`에 넣습니다.

급하게 멈춰야 하면 `NOTIFY_ENABLED=false`로 바꿉니다. 재시작하지 않아도 바로 반영됩니다.

## 보안 · 남용 방지

| 항목 | 동작 |
|---|---|
| 바인딩 | `127.0.0.1:5599`에만 |
| Host 헤더 | `127.0.0.1:5599` / `localhost:5599`만(DNS 리바인딩 방지) |
| Origin | `ALLOWED_ORIGINS`와 정확히 같을 때만. Chrome Private Network Access 사전 요청에는 `Access-Control-Allow-Private-Network: true`로 응답 |
| 요청 형식 | POST는 `Content-Type: application/json`만, 바디 64KB까지, `requestId` 필수 |
| 문구 | 등록 템플릿으로 도우미가 생성. 클라이언트가 보낸 문구·변경내용은 무시 |
| API 키 | `.env`에서만 읽음. 콘솔·로그·응답·에러에 키와 Authorization 헤더가 나오지 않음(에러 문구 속 `mars_ak_…`도 가림) |
| 비즈고 호출 | `BIZGO_BASE_URL`은 비즈고 두 주소만, 리다이렉트를 따라가지 않음, 타임아웃 10초 |
| 재전송 | 같은 `requestId`는 한 번만 처리(409). 강사별 `idempotencyKey`로 비즈고도 중복을 막음 |
| 한도 | 요청당 50명, 시간당 5회, 하루 200건(로그 기준이라 재시작해도 유지), 같은 번호 10분(메모리) |
| 번호·이름 | 01X로 시작하는 10~11자리가 아니거나 이름 형식이 틀리면 그 강사만 빼고 사유를 돌려줌 |
| 인증·IP 오류 | 비즈고 인증 오류(A001, A002, 50009, 401/403)가 나면 IP 안내로 바꿔 보여주고 나머지는 보내지 않음 |
| 킬스위치 | `NOTIFY_ENABLED=false`면 모든 발송 거부 |

## 로그

`notify-helper/logs/YYYY-MM-DD.jsonl`(gitignore)에 강사 1명당 한 줄씩 남습니다. **30일 지난 파일은 자동 삭제**됩니다.

```json
{"at":"…","mode":"production","requestId":"…","template":"01000_2_20","name":"홍**","phone4":"1234","status":"sent","code":"A000","result":"Success","called":true,"msgKey":"…"}
```

- 이름은 첫 글자와 `**`, 번호는 뒤 4자리만 남깁니다. 문구는 남기지 않습니다(고정 문구이므로 템플릿 코드로 충분).
- `NOTIFY_TEST_PHONE`을 쓰면 실제로 받은 번호의 뒤 4자리를 `to4`에 남깁니다.
- 시간당·하루 한도는 이 로그로 셉니다(DRY-RUN 기록은 세지 않음).

## API

`GET /health`
```json
{ "ok": true, "enabled": true, "mode": "dry-run", "template": "01000_2_20",
  "apiKey": "ok", "senderKey": true, "ipStatus": "ok", "publicIp": "x.x.x.x",
  "testPhone": null, "maxRecipients": 50,
  "limits": { "maxRequestsPerHour": 3, "requestsLastHour": 0, "maxSendsPerDay": 200, "sentToday": 0, … },
  "problems": [], "warnings": [] }
```
- `apiKey`는 `ok` / `missing` / `invalid`(값은 내보내지 않음), `ipStatus`는 `ok` / `mismatch` / `unknown`입니다.
- `problems`가 지금 발송을 막는 사유입니다.

`POST /notify` 요청 바디는 `{ "requestId": "uuid", "recipients": [{ "name": "홍길동", "phone": "010…" }] }`입니다. 응답은 다음과 같습니다.
```json
{ "ok": true, "mode": "sandbox", "sent": 1, "failed": 1, "results": [
  { "name": "홍길동", "phone": "***-****-1234", "status": "sent",   "code": "A000", "result": "Success" },
  { "name": "김철수", "phone": "***-****-5678", "status": "failed", "code": "COOLDOWN", "result": "10분 안에 같은 번호로 보낸 적이 있습니다 …" } ] }
```
- `sent`는 비즈고가 **접수**했다는 뜻입니다. 실제 수신 결과는 비즈고 콘솔에서 확인합니다.
- 상태 코드: 400 형식 오류, 403 Origin·Host, 409 같은 요청 재전송, 413 너무 큼, 415 Content-Type, 429 한도, 503 발송 불가(킬스위치·설정·IP)

## 문제 해결

| 증상 | 확인할 것 |
|---|---|
| "발송 도우미가 꺼져 있습니다" | 도우미 실행 여부(`npm run notify-helper` 또는 작업 스케줄러), [다시 확인] |
| "IP 불일치" / "비즈고 허용 IP에 없습니다" | 표시된 공인 IP를 비즈고 연동관리에 등록하고 `EXPECTED_PUBLIC_IPS`에도 추가 |
| 인증 오류(A001, A002) | API 키를 다시 복사해 `.env`에 넣기, 허용 IP 확인 |
| 템플릿 불일치 오류 | `templates.json`의 본문·버튼과 비즈고 등록 내용 비교, 검수 승인 여부 |
| "허용되지 않은 주소에서의 요청" | 관리자 화면 주소를 `ALLOWED_ORIGINS`에 추가 |
| "시간당 발송 요청 한도" | 표시된 시각 이후 다시, 또는 `NOTIFY_MAX_REQUESTS_PER_HOUR` 조정 |
| 시작하자마자 꺼짐 | `logs/start-error.txt` 확인(대개 `BIZGO_BASE_URL`), 포트 5599를 다른 도우미가 쓰는 중 |
| 업로드는 됐는데 알림만 실패 | 같은 파일을 다시 올려도 변경이 없어 알림이 다시 나가지 않습니다. 로그에서 실패한 강사를 확인해 따로 안내하세요 |
| GitHub Pages 화면에서 연결 안 됨 | Chrome이 "로컬 네트워크 액세스" 권한을 물으면 허용 |
