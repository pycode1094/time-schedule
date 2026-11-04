// ─────────────────────────────────────────────────────────────
// 알림톡 문구 · 비즈고 요청 바디 만들기 · 발송
//   비즈고 OMNI API V2  POST {Base URI}/v1/send/omni
//   text 는 템플릿 변수를 모두 치환한 전체 문구 (등록 템플릿과 한 글자라도 다르면 실패)
//   문구는 항상 templates.json 으로 이 도우미가 만든다. 관리자 화면이 보낸 문구는 쓰지 않는다.
//   #{변경내용} 은 관리자 화면이 보낸 구조화된 값을 검사해 changes.js 가 만든다.
// ─────────────────────────────────────────────────────────────
import crypto from 'node:crypto';

export const MESSAGE_MAX_LENGTH = 1000;   // 알림톡 본문 최대 글자 수
export const IDEMPOTENCY_TTL_SEC = 86400;
const SEND_TIMEOUT_MS = 10000;
const SMS_MAX_BYTES = 90;
const LMS_MAX_BYTES = 2000;
const LMS_TITLE_MAX_BYTES = 40;

export const charLength = (s) => [...s].length;
export const normalizePhone = (p) => String(p ?? '').replace(/[^0-9]/g, '');
// 휴대전화: 01X 로 시작하는 10~11자리
export const isMobile = (p) => /^01[016789]\d{7,8}$/.test(p);
export const maskPhone = (p) => (p ? `***-****-${String(p).slice(-4)}` : '(번호 없음)');

// 콘솔 · 로그 · 응답에 나갈 문자열에서 전화번호와 API 키 모양을 가린다
export const scrub = (s) => String(s ?? '')
  .replace(/mars_ak_[A-Za-z0-9_-]+/g, 'mars_ak_***')
  .replace(/01[016789]-?\d{3,4}-?\d{4}/g, (m) => maskPhone(m.replace(/-/g, '')));

// 강사 이름: 한글 2~10자(띄어쓰기 없음) 또는 영문 이름(단어 4개, 30자 이내)만.
//   줄바꿈 · 기호 · 띄어쓴 한글은 거부 (#{이름} 으로 임의 문구를 넣지 못하게)
export function cleanName(raw) {
  const name = String(raw ?? '').trim();
  if (/^[가-힣]{2,10}$/.test(name)) return name;
  if (name.length <= 30 && /^[A-Za-z]+( [A-Za-z]+){0,3}$/.test(name)) return name;
  return '';
}

// #{변수} 치환 (값이 없는 변수는 그대로 둠)
export function renderTemplate(template, vars) {
  return template.replace(/#\{([^}]+)\}/g, (m, key) => (key in vars ? String(vars[key]) : m));
}

// 템플릿 → { text, title }. 쓸 수 있는 값은 강사명과 (검사를 마친) 변경내용뿐
export function buildMessage(template, { name, changesText = '' }) {
  const data = { 강사명: name, 변경내용: changesText };
  const values = { ...template.fixed };
  for (const [field, variable] of Object.entries(template.fieldToVar)) values[variable] = data[field];
  return {
    text:  renderTemplate(template.text, values),
    title: template.title ? renderTemplate(template.title, values) : '',
  };
}

// 문자 대체발송 바이트 수 (이통사 EUC-KR 기준: ASCII 1, 그 외 2)
const smsBytes = (s) => [...s].reduce((n, ch) => n + (ch.codePointAt(0) < 0x80 ? 1 : 2), 0);

function cutBytes(s, max) {
  let out = '';
  let used = 0;
  for (const ch of s) {
    const b = smsBytes(ch);
    if (used + b > max) break;
    out += ch;
    used += b;
  }
  return out;
}

// 알림톡 실패 시 문자: 90바이트 이하면 SMS, 넘으면 LMS(mms)
function fallbackStep(from, { text, title }) {
  if (smsBytes(text) <= SMS_MAX_BYTES) return { sms: { from, text } };
  const mms = { from, text: cutBytes(text, LMS_MAX_BYTES) };
  if (title) mms.title = cutBytes(title, LMS_TITLE_MAX_BYTES);
  return { mms };
}

// 같은 요청(미리보기 창 1개 = requestId 1개)의 같은 강사 · 번호는 같은 키 → 비즈고가 중복 발송을 막는다
export function idempotencyKey(requestId, name, phone) {
  const hash = crypto.createHash('sha256').update(`${name}|${phone}`).digest('hex').slice(0, 16);
  return `ts-${requestId}-${hash}`;
}

export function buildBody(cfg, message, to, key) {
  const { template } = cfg;
  const alimtalk = {
    msgType:      template.msgType,
    senderKey:    cfg.senderKey,
    templateCode: template.code,
    text:         message.text,
  };
  // 강조 제목은 등록된 템플릿에 있을 때만 (없으면 넣지 않는다)
  if (message.title) alimtalk.title = message.title;
  if (template.buttons.length) alimtalk.attachment = { button: template.buttons };

  const messageFlow = [{ alimtalk }];
  if (cfg.smsFrom) messageFlow.push(fallbackStep(cfg.smsFrom, message));

  const body = {
    messageFlow,
    destinations:   [{ to }],
    idempotencyKey: key,
    idempotencyTtl: IDEMPOTENCY_TTL_SEC,
  };
  if (cfg.paymentCode) body.paymentCode = cfg.paymentCode;
  return body;
}

// 화면·콘솔용: 수신번호는 뒤 4자리만, 발신 프로필 키는 숨김 (API 키는 바디에 없음)
export function maskBody(body) {
  const copy = structuredClone(body);
  copy.destinations = copy.destinations.map(d => ({ ...d, to: maskPhone(d.to) }));
  for (const step of copy.messageFlow) {
    if (step.alimtalk) step.alimtalk.senderKey = step.alimtalk.senderKey ? '(설정됨 · 표시 안 함)' : '(미설정)';
  }
  return copy;
}

// 비즈고 호출 1건 → { ok, code, result, msgKey?, authFailure? }
//   - 리다이렉트는 따라가지 않는다 (API 키가 다른 곳으로 가지 않게), 타임아웃 10초
//   - 응답 원문에는 전체 수신번호가 들어 있으므로 그대로 넘기지 않는다
//   - 에러 문구에 API 키나 Authorization 헤더가 들어가지 않게 scrub
export async function sendOne(cfg, body, fetchImpl = globalThis.fetch) {
  let res;
  try {
    res = await fetchImpl(`${cfg.baseUrl}/v1/send/omni`, {
      method:   'POST',
      headers:  { 'Content-Type': 'application/json', Authorization: cfg.apiKey },
      body:     JSON.stringify(body),
      redirect: 'manual',
      signal:   AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
  } catch (e) {
    const reason = e?.name === 'TimeoutError' ? '비즈고 응답 시간 초과(10초)' : `비즈고 연결 실패 (${e?.cause?.code || e?.message || '알 수 없음'})`;
    return { ok: false, code: 'NETWORK', result: scrub(reason) };
  }
  if (res.status >= 300 && res.status < 400) {
    return { ok: false, code: `HTTP ${res.status}`, result: '비즈고가 다른 주소로 보내려 했지만 따라가지 않았습니다 (리다이렉트 거부)' };
  }

  const json   = await res.json().catch(() => null);
  const common = json?.common || {};
  const data   = json?.data || {};
  const dest   = data.data?.destinations?.[0] || {};

  // 인증 → 호출 → 수신자 순서로, 처음 실패한 단계의 code/result 를 사유로 쓴다
  const steps = [[common.authCode, common.authResult], [data.code, data.result], [dest.code, dest.result]];
  const failed = steps.find(([code]) => code && code !== 'A000');
  if (failed || !res.ok || data.code !== 'A000') {
    const [code, result] = failed || [`HTTP ${res.status}`, json ? '알 수 없는 응답' : '응답을 읽을 수 없음'];
    // 인증 오류 · 허용 IP 아님 (50009) → 서버가 IP 안내 문구로 바꿔 보여준다
    const authFailure = res.status === 401 || res.status === 403 || ['A001', 'A002', '50009'].includes(code);
    return { ok: false, code: scrub(code), result: scrub(result), authFailure };
  }
  return { ok: true, code: dest.code || data.code, result: scrub(dest.result || data.result), msgKey: dest.msgKey };
}
