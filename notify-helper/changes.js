// ─────────────────────────────────────────────────────────────
// 알림톡 #{변경내용} 만들기
//   관리자 화면은 강사별 변경을 구조화된 값으로만 보낸다 (자유 문장 없음)
//     changes:     [{ date: 'YYYY-MM-DD', startPeriod, endPeriod, course, room,
//                     type: '추가' | '삭제' | '변경', before, after }]   강사당 MAX_CHANGES 건까지
//     moreChanges: 화면이 보내지 않은 나머지 건수 (정수)
//   이 도우미가 검사한 뒤 정해진 형식으로 문구를 만든다.
//     ▶ 11/05(목) 3~4교시 과정명 · 강의실 [변경]
//   - 날짜 · 교시는 형식 검사, 문자열은 길이 제한 (넘으면 거부. 화면이 미리 잘라 보낸다)
//   - 줄바꿈 · 제어문자 · 보이지 않는 문자는 공백으로 바꾸고, 링크(URL) · #{ } 는 거부
//   - 같은 날 · 과정 · 강의실 · 유형의 연속 교시는 한 줄로 합친다
//   - 오늘 이전 날짜는 빼고, 최대 5줄 (넘으면 4줄 + "외 N건"), 전체 500자 이내
//   - before / after(변경 전 · 후 요약)는 검사만 하고 문구에는 넣지 않는다 (한 줄을 짧게)
// ─────────────────────────────────────────────────────────────
import { localDate } from './guard.js';

export const MAX_CHANGES = 10;          // 강사당 받는 항목 수 (src/utils/notifyChanges.js 와 같게)
export const MAX_MORE_CHANGES = 9999;
export const MAX_LINES = 5;
export const CHANGES_MAX_LENGTH = 500;
export const MAX_PERIOD = 12;

// 같은 날 · 교시면 이 순서로 (scheduleDiff 의 TYPE_ORDER 와 같음)
export const CHANGE_TYPES = ['삭제', '추가', '변경'];
const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];

const TEXT_FIELDS = {
  course: { label: '과정명',       max: 40, required: true },
  room:   { label: '강의실',       max: 20 },
  before: { label: '변경 전 요약', max: 40 },
  after:  { label: '변경 후 요약', max: 40 },
};

// 줄바꿈 · 탭 · 제어문자, 폭 없는 문자 · 방향 제어 · BOM, 한글 채움 문자처럼 안 보이는 문자
// eslint-disable-next-line no-control-regex
const INVISIBLE = /[\u0000-\u001F\u007F-\u009F\u00AD\u061C\u115F\u1160\u180E\u200B-\u200F\u2028-\u202E\u2060-\u206F\u3164\uFEFF\uFFA0]/g;

// 링크로 보일 수 있는 것: 스킴(http:// 등), www., IP 주소, 흔한 도메인 끝(.com .kr 등)
//   도메인 끝은 소문자만 본다. "ASP.NET" 같은 과정명을 잘못 막지 않게
const URL_LIKE = [
  /[a-z][a-z0-9+.-]*:\/\//i,
  /www\./i,
  /\d{1,3}(\.\d{1,3}){3}/,
  /[^\s.]\.(com|net|org|kr|co|io|me|ly|gl|link|xyz|site|app|dev|shop|info|biz|to)(?![a-z0-9])/,
];
const TEMPLATE_LIKE = /#\{|[{}]/;

const charLength = (s) => [...s].length;

function cleanText(raw, { label, max, required }) {
  if (raw === undefined || raw === null) raw = '';
  if (typeof raw !== 'string') return { error: `${label}은 문자열이어야 합니다` };
  const value = raw.normalize('NFC').replace(INVISIBLE, ' ').replace(/\s+/g, ' ').trim();
  if (!value) return required ? { error: `${label}이 비어 있습니다` } : { value: '' };
  if (URL_LIKE.some(re => re.test(value))) return { error: `${label}에 링크(URL)를 넣을 수 없습니다` };
  if (TEMPLATE_LIKE.test(value)) return { error: `${label}에 #{ } 를 넣을 수 없습니다` };
  if (charLength(value) > max) return { error: `${label}은 ${max}자까지입니다` };
  return { value };
}

// "YYYY-MM-DD" 이고 실제 있는 날짜
export function isDateStr(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

// 변경 1건 검사 → { value } | { error }. 정해진 필드 말고는 읽지 않는다
export function parseChange(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { error: '형식이 올바르지 않습니다' };
  if (!isDateStr(raw.date)) return { error: '날짜는 YYYY-MM-DD 형식이어야 합니다' };
  const { startPeriod: start, endPeriod: end } = raw;
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end > MAX_PERIOD || start > end) {
    return { error: `교시는 1~${MAX_PERIOD} 사이 정수이고 시작이 끝보다 클 수 없습니다` };
  }
  if (!CHANGE_TYPES.includes(raw.type)) return { error: `변경유형은 ${CHANGE_TYPES.join(' · ')} 중 하나여야 합니다` };

  const value = { date: raw.date, startPeriod: start, endPeriod: end, type: raw.type };
  for (const [key, rule] of Object.entries(TEXT_FIELDS)) {
    const r = cleanText(raw[key], rule);
    if (r.error) return { error: r.error };
    value[key] = r.value;
  }
  return { value };
}

// 강사 1명의 changes · moreChanges 검사 → { changes, moreChanges } | { error }
//   한 건이라도 틀리면 그 강사는 보내지 않는다 (일부만 빠진 문구가 가지 않게)
export function parseChanges(list, more) {
  if (!Array.isArray(list) || list.length === 0) return { error: '변경 내용(changes)이 없습니다' };
  if (list.length > MAX_CHANGES) return { error: `변경 내용은 강사당 ${MAX_CHANGES}건까지 받습니다 (나머지는 건수만)` };
  const moreChanges = more ?? 0;
  if (!Number.isInteger(moreChanges) || moreChanges < 0 || moreChanges > MAX_MORE_CHANGES) {
    return { error: 'moreChanges 는 0 이상의 정수여야 합니다' };
  }
  const changes = [];
  for (const [i, raw] of list.entries()) {
    const c = parseChange(raw);
    if (c.error) return { error: `변경 ${i + 1}번째: ${c.error}` };
    changes.push(c.value);
  }
  return { changes, moreChanges };
}

// 같은 날 · 과정 · 강의실 · 유형에서 이어지거나 겹치는 교시를 한 항목으로 → 날짜 · 교시 순
export function mergeChanges(changes) {
  const groups = new Map();
  for (const c of changes) {
    const key = JSON.stringify([c.date, c.course, c.room, c.type]);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(c);
  }
  const merged = [];
  for (const list of groups.values()) {
    let cur = null;
    for (const c of [...list].sort((a, b) => a.startPeriod - b.startPeriod)) {
      if (cur && c.startPeriod <= cur.endPeriod + 1) {
        cur.endPeriod = Math.max(cur.endPeriod, c.endPeriod);
      } else {
        cur = { ...c };
        merged.push(cur);
      }
    }
  }
  return merged.sort((a, b) =>
    a.date.localeCompare(b.date) || a.startPeriod - b.startPeriod ||
    CHANGE_TYPES.indexOf(a.type) - CHANGE_TYPES.indexOf(b.type) || a.course.localeCompare(b.course, 'ko'));
}

// → "▶ 11/05(목) 3~4교시 과정명 · 강의실 [변경]"
export function formatLine({ date, startPeriod, endPeriod, course, room, type }) {
  const [y, m, d] = date.split('-').map(Number);
  const day = DAY_NAMES[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  const pad = (n) => String(n).padStart(2, '0');
  const periods = startPeriod === endPeriod ? `${startPeriod}교시` : `${startPeriod}~${endPeriod}교시`;
  return `▶ ${pad(m)}/${pad(d)}(${day}) ${periods} ${course}${room ? ` · ${room}` : ''} [${type}]`;
}

// 검사를 마친 changes → #{변경내용} 문자열. 오늘 이후 변경이 없으면 ''
export function buildChangesText(changes, { today = localDate(), moreChanges = 0 } = {}) {
  const lines = mergeChanges(changes.filter(c => c.date >= today)).map(formatLine);
  if (lines.length === 0) return '';
  const total = lines.length + moreChanges;
  let shown = total <= MAX_LINES ? lines.length : Math.min(lines.length, MAX_LINES - 1);
  for (;;) {
    const rest = total - shown;
    const text = [...lines.slice(0, shown), ...(rest > 0 ? [`외 ${rest}건`] : [])].join('\n');
    if (charLength(text) <= CHANGES_MAX_LENGTH || shown === 0) return text;
    shown--;
  }
}
