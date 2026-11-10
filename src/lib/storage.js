// ─────────────────────────────────────────────────────────────
// localStorage 안전 래퍼
//   시크릿 창 · 사이트 데이터 차단 · 용량 초과에서는 접근 자체가 예외를 던질 수 있다.
//   실패하면 기본값을 돌려주고 조용히 넘어간다 (화면은 저장 없이도 동작해야 한다).
//   여기에는 화면 편의 정보(마지막으로 본 강사, 최근 검색, 테마)만 둔다.
// ─────────────────────────────────────────────────────────────
const PREFIX = 'ts:';

export function readJson(key, fallback) {
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function writeJson(key, value) {
  try {
    if (value === undefined || value === null) window.localStorage.removeItem(PREFIX + key);
    else window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* 저장 못 해도 화면은 그대로 */
  }
}

// ── 마지막으로 본 강사 · 최근 본 강사 ─────────────────────────
const MAX_RECENT_TEACHERS = 5;

export function getRememberedTeacher() {
  const v = readJson('teacher', null);
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

export function getRecentTeachers() {
  const v = readJson('recentTeachers', []);
  return Array.isArray(v) ? v.filter(n => typeof n === 'string' && n.trim()).slice(0, MAX_RECENT_TEACHERS) : [];
}

export function rememberTeacher(name) {
  if (!name) return;
  writeJson('teacher', name);
  writeJson('recentTeachers', [name, ...getRecentTeachers().filter(n => n !== name)].slice(0, MAX_RECENT_TEACHERS));
}

// ── 최근 검색 (선택한 항목) ───────────────────────────────────
const MAX_RECENT_SEARCHES = 6;

export function getRecentSearches() {
  const v = readJson('recentSearches', []);
  return Array.isArray(v)
    ? v.filter(s => s && typeof s.kind === 'string' && typeof s.id === 'string' && typeof s.label === 'string').slice(0, MAX_RECENT_SEARCHES)
    : [];
}

export function addRecentSearch(item) {
  const next = [item, ...getRecentSearches().filter(s => !(s.kind === item.kind && s.id === item.id))];
  writeJson('recentSearches', next.slice(0, MAX_RECENT_SEARCHES));
}

export function clearRecentSearches() {
  writeJson('recentSearches', null);
}
