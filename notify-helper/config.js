// ─────────────────────────────────────────────────────────────
// 발송 도우미 설정 읽기 (요청마다 다시 읽으므로 대부분 재시작 없이 반영)
//   notify-helper/.env            API 키 등 (gitignore)
//     - BIZGO_API_KEY 는 .env 파일에서만 읽는다 (환경변수로 넘긴 값은 무시)
//     - 그 밖의 값은 이미 설정된 환경변수가 우선 (테스트용)
//   notify-helper/templates.json  템플릿 코드별 문구 · 제목 · 버튼 · 변수 연결
//     .env 의 BIZGO_TEMPLATE_CODE 와 같은 이름의 설정을 자동으로 고른다
//
//   fatal     시작 거부 (BIZGO_BASE_URL 이 비즈고 주소가 아님)
//   problems  항상 발송 불가 (설정 오류, NOTIFY_ENABLED=false)
//   notReady  실제 발송(샌드박스/운영)만 막음. DRY-RUN 에서는 경고로만 표시
// ─────────────────────────────────────────────────────────────
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseIpList } from './publicIp.js';

export const HELPER_DIR = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_ENV_FILE = path.join(HELPER_DIR, '.env');
export const TEMPLATES_FILE = path.join(HELPER_DIR, 'templates.json');
export const DEFAULT_BASE_URL = 'https://sandbox-mars.ibapi.kr/api/comm';
export const ALLOWED_BIZGO_HOSTS = ['mars.ibapi.kr', 'sandbox-mars.ibapi.kr'];
export const MODE_LABEL = { 'dry-run': 'DRY-RUN', sandbox: '샌드박스', production: '운영' };
export const KILL_SWITCH_MESSAGE = '발송이 꺼져 있습니다 (NOTIFY_ENABLED=false)';

// 템플릿 변수에 연결할 수 있는 항목. 관리자 화면은 이름과 번호만 보내므로 강사명 하나뿐이다
export const DATA_FIELDS = ['강사명'];

const API_KEY_PREFIX = 'mars_ak_';
const DEFAULT_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173', 'https://pycode1094.github.io'];
const DEFAULT_LIMITS = {
  maxRecipients:      { key: 'NOTIFY_MAX_RECIPIENTS',        value: 50 },
  maxRequestsPerHour: { key: 'NOTIFY_MAX_REQUESTS_PER_HOUR', value: 5 },
  maxSendsPerDay:     { key: 'NOTIFY_MAX_SENDS_PER_DAY',     value: 200 },
  phoneCooldownMin:   { key: 'NOTIFY_PHONE_COOLDOWN_MIN',    value: 10 },
};

// "<<...>>" 는 아직 채우지 않은 자리표시
const PLACEHOLDER = /<<.*?>>/s;

function parseEnvFile(file) {
  if (!fs.existsSync(file)) return {};
  const out = {};
  for (const raw of fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    let value = line.slice(eq + 1).trim();
    if (/^(['"]).*\1$/.test(value)) value = value.slice(1, -1);
    out[line.slice(0, eq).trim()] = value;
  }
  return out;
}

export const templateVars = (s) => [...s.matchAll(/#\{([^}]+)\}/g)].map(m => m[1]);
const varName = (v) => String(v).trim().replace(/^#\{(.*)\}$/, '$1');
const withoutComments = (obj) => Object.fromEntries(Object.entries(obj).filter(([k]) => !k.startsWith('_')));

// BIZGO_BASE_URL 검사: https://mars.ibapi.kr 또는 https://sandbox-mars.ibapi.kr 만 (그 외는 시작 거부)
export function checkBaseUrl(raw) {
  let url;
  try {
    url = new URL(raw || DEFAULT_BASE_URL);
  } catch {
    return { error: 'BIZGO_BASE_URL 형식이 올바르지 않습니다' };
  }
  if (url.protocol !== 'https:' || !ALLOWED_BIZGO_HOSTS.includes(url.hostname) || url.port || url.username || url.password) {
    return { error: 'BIZGO_BASE_URL 은 https://mars.ibapi.kr 또는 https://sandbox-mars.ibapi.kr 로 시작해야 합니다' };
  }
  // "https://sandbox-mars.ibapi.kr" 처럼 경로 없이 적으면 /api/comm 을 붙인다
  if (url.pathname === '/' || url.pathname === '') url.pathname = '/api/comm';
  url.search = '';
  url.hash = '';
  return { baseUrl: url.toString().replace(/\/+$/, ''), sandbox: url.hostname.startsWith('sandbox-') };
}

function loadTemplate(code) {
  const problems = [];
  const notReady = [];
  const warnings = [];
  const fail = (msg) => ({ template: null, problems: [msg], notReady, warnings });

  let all;
  try {
    all = JSON.parse(fs.readFileSync(TEMPLATES_FILE, 'utf8').replace(/^\uFEFF/, ''));
  } catch (e) {
    return fail(`templates.json 을 읽을 수 없습니다: ${e.message}`);
  }
  if (!code) return fail('BIZGO_TEMPLATE_CODE 가 비어 있습니다');
  const t = all.templates?.[code];
  if (!t) return fail(`templates.json 에 "${code}" 템플릿 설정이 없습니다`);

  // 본문: 문자열 또는 줄 배열 (배열은 \n 으로 이어 붙이고 끝에 줄바꿈을 붙이지 않는다)
  const text = Array.isArray(t.text) ? t.text.map(String).join('\n') : (typeof t.text === 'string' ? t.text : '');
  if (!text) problems.push(`templates.json 의 "${code}" 에 본문(text)이 없습니다`);
  if (PLACEHOLDER.test(text)) notReady.push(`templates.json 의 "${code}" 본문에 비즈고에 등록된 원문을 넣어 주세요`);

  const title = typeof t.title === 'string' ? t.title : '';
  if (PLACEHOLDER.test(title)) notReady.push(`templates.json 의 "${code}" title 을 등록된 강조 제목으로 바꿔 주세요`);

  // 변수 연결: { 강사명: "#{이름}" } → { 강사명: "이름" }
  const fieldToVar = {};
  for (const [field, target] of Object.entries(withoutComments(t.variables || {}))) {
    if (!target) continue;
    if (!DATA_FIELDS.includes(field)) {
      problems.push(`variables 의 "${field}" 는 연결할 수 없는 항목입니다 (사용 가능: ${DATA_FIELDS.join(', ')})`);
      continue;
    }
    fieldToVar[field] = varName(target);
  }
  const fixed = Object.fromEntries(
    Object.entries(withoutComments(t.fixedVariables || {})).map(([k, v]) => [varName(k), String(v)]),
  );

  const used = new Set([...templateVars(text), ...templateVars(title)]);
  const provided = new Set([...Object.values(fieldToVar), ...Object.keys(fixed)]);
  const missing = [...used].filter(v => !provided.has(v));
  if (missing.length) problems.push(`값을 연결하지 않은 템플릿 변수: ${missing.map(v => `#{${v}}`).join(', ')}`);
  const unused = [...provided].filter(v => !used.has(v));
  if (unused.length) warnings.push(`본문에 없는 변수에 연결됨: ${unused.map(v => `#{${v}}`).join(', ')}`);

  const buttons = [];
  for (const [i, raw] of (Array.isArray(t.buttons) ? t.buttons : []).entries()) {
    const b = withoutComments(raw || {});
    if (!b.type || !b.name) {
      problems.push(`buttons[${i}] 에 type 과 name 이 필요합니다`);
      continue;
    }
    if (b.type === 'WL' && !b.urlMobile) problems.push(`buttons[${i}] 웹링크(WL)에는 urlMobile 이 필요합니다`);
    if (PLACEHOLDER.test(JSON.stringify(b))) notReady.push(`buttons[${i}] 의 링크를 실제 주소로 바꿔 주세요`);
    buttons.push(b);
  }

  return {
    template: {
      code, msgType: t.msgType || 'AT', text, title, buttons, fieldToVar, fixed,
      testOnly: t.testOnly === true,
    },
    problems, notReady, warnings,
  };
}

// envFile 은 테스트에서만 바꾼다 (실행 시에는 항상 notify-helper/.env)
export function loadConfig({ envFile = DEFAULT_ENV_FILE } = {}) {
  const file = parseEnvFile(envFile);
  const env = (key) => String(process.env[key] ?? file[key] ?? '').trim();

  const problems = [];
  const notReady = [];
  const warnings = [];

  // 킬스위치: NOTIFY_ENABLED=false 이면 모든 발송 거부 (DRY-RUN 포함)
  const enabled = !/^(false|0|no|off)$/i.test(env('NOTIFY_ENABLED'));
  if (!enabled) problems.push(KILL_SWITCH_MESSAGE);

  const dryRun = !/^(false|0|no|off)$/i.test(env('NOTIFY_DRY_RUN') || 'true');
  const base = checkBaseUrl(env('BIZGO_BASE_URL'));
  const fatal = base.error || null;
  if (fatal) problems.push(fatal);
  const mode = dryRun ? 'dry-run' : (base.sandbox ? 'sandbox' : 'production');

  // API 키: .env 파일에서만. 형식(mars_ak_ 접두)만 검사하고 값은 어디에도 출력하지 않는다
  const apiKey = String(file.BIZGO_API_KEY ?? '').trim();
  const apiKeyStatus = !apiKey ? 'missing' : (apiKey.startsWith(API_KEY_PREFIX) && apiKey.length > API_KEY_PREFIX.length ? 'ok' : 'invalid');
  if (apiKeyStatus === 'missing') notReady.push('BIZGO_API_KEY 가 비어 있습니다 (notify-helper/.env)');
  if (apiKeyStatus === 'invalid') notReady.push(`BIZGO_API_KEY 형식이 올바르지 않습니다 (${API_KEY_PREFIX} 로 시작해야 함)`);

  // 발신 프로필 키는 샌드박스/운영에서만 필수
  const senderKey = env('BIZGO_SENDER_KEY');
  if (!senderKey) notReady.push('BIZGO_SENDER_KEY(발신 프로필 키)가 비어 있습니다');

  const smsFrom   = env('BIZGO_SMS_FROM').replace(/[^0-9]/g, '');
  const testPhone = env('NOTIFY_TEST_PHONE').replace(/[^0-9]/g, '');
  if (env('NOTIFY_TEST_PHONE') && !/^01[016789]\d{7,8}$/.test(testPhone)) {
    problems.push('NOTIFY_TEST_PHONE 이 휴대전화 번호 형식이 아닙니다');
  }

  const allowedOrigins = env('ALLOWED_ORIGINS')
    ? env('ALLOWED_ORIGINS').split(',').map(s => s.trim().replace(/\/+$/, '')).filter(Boolean)
    : DEFAULT_ORIGINS;

  const expectedIps = parseIpList(env('EXPECTED_PUBLIC_IPS'));
  if (expectedIps.invalid.length) problems.push(`EXPECTED_PUBLIC_IPS 형식 오류: ${expectedIps.invalid.join(', ')}`);

  const limits = {};
  for (const [name, { key, value }] of Object.entries(DEFAULT_LIMITS)) {
    const raw = env(key);
    const n = Number(raw);
    if (raw && !(Number.isInteger(n) && n >= 1)) warnings.push(`${key} 값이 올바르지 않아 기본값 ${value} 을 씁니다`);
    limits[name] = raw && Number.isInteger(n) && n >= 1 ? n : value;
  }

  const templateCode = env('BIZGO_TEMPLATE_CODE');
  const t = loadTemplate(templateCode);
  // 수강생용 기본 템플릿처럼 강사에게 보내면 안 되는 템플릿은 테스트 번호로만
  if (t.template?.testOnly && !testPhone) {
    t.notReady.push(`${templateCode} 는 테스트 전용(testOnly)이라 NOTIFY_TEST_PHONE 을 설정해야 보낼 수 있습니다`);
  }

  return {
    mode,
    enabled,
    fatal,
    baseUrl: base.baseUrl || '',
    apiKey,
    apiKeyStatus,
    senderKey,
    templateCode,
    template: t.template,
    smsFrom,
    paymentCode: env('BIZGO_PAYMENT_CODE'),
    testPhone,
    allowedOrigins,
    expectedIps,
    limits,
    problems: [...problems, ...t.problems],
    notReady: [...notReady, ...t.notReady],
    warnings: [...warnings, ...t.warnings],
  };
}

// 지금 발송을 막는 사유. DRY-RUN 은 notReady 와 IP 불일치를 경고로만 취급
//   ip: publicIp.check 결과 { status, ip, reason }
export function blockingProblems(cfg, ip) {
  if (cfg.mode === 'dry-run') return [...cfg.problems];
  const out = [...cfg.problems, ...cfg.notReady];
  if (ip?.status === 'mismatch') out.push(ip.reason);
  return out;
}

export function configWarnings(cfg, ip) {
  const out = [...cfg.warnings];
  if (cfg.mode === 'dry-run') {
    out.push(...cfg.notReady);
    if (ip?.status === 'mismatch') out.push(`${ip.reason} (DRY-RUN 이라 진행)`);
  }
  if (ip?.status === 'unknown' && ip.reason) out.push(ip.reason);
  return out;
}
