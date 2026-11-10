// ─────────────────────────────────────────────────────────────
// 해시 라우팅 (라이브러리 없이)
//   주소: /time-schedule/?teacher=이름#/teacher?sheet=changes
//     - ?teacher= (검색 파라미터)는 알림톡 링크 · 공유용. 읽기 · 쓰기는 utils/urlState.js 그대로
//     - #/경로 는 화면, #...?sheet= 는 열린 바텀시트 (폰의 뒤로가기로 닫히게)
//   GitHub Pages 주소(/time-schedule/)는 바뀌지 않는다.
// ─────────────────────────────────────────────────────────────
import { useMemo, useSyncExternalStore } from 'react';
import { getUrlTeacher } from '../utils/urlState.js';
import { getRememberedTeacher } from './storage.js';

const listeners = new Set();
function emit() {
  for (const l of listeners) l();
}
if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', emit);
  window.addEventListener('popstate', emit);
}

function subscribe(l) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function parseHash(hash) {
  const raw = (hash || '').replace(/^#/, '');
  const [pathPart, queryPart = ''] = raw.split('?');
  const path = pathPart && pathPart.startsWith('/') ? pathPart : '/';
  const segments = path.split('/').filter(Boolean).map(s => {
    try { return decodeURIComponent(s); } catch { return s; }
  });
  const query = new URLSearchParams(queryPart);
  return { hash: raw, path, segments, sheet: query.get('sheet'), query };
}

export function useRoute() {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash, () => '');
  return useMemo(() => parseHash(hash), [hash]);
}

function urlWithHash(hashBody) {
  const url = new URL(window.location.href);
  url.hash = hashBody ? `#${hashBody}` : '';
  return url;
}

export function buildPath(...segments) {
  return '/' + segments.filter(s => s !== undefined && s !== null && s !== '').map(s => encodeURIComponent(String(s))).join('/');
}

// 화면 이동
export function navigate(path, { replace = false } = {}) {
  const url = urlWithHash(path);
  if (url.href === window.location.href) return;
  if (replace) window.history.replaceState(window.history.state, '', url);
  else window.history.pushState({ tsNav: true }, '', url);
  emit();
}

// ‹ 뒤로: 앱 안에서 온 화면이면 브라우저 뒤로, 주소로 바로 들어왔으면 fallback 으로
export function goBack(fallback = '/') {
  if (window.history.state?.tsNav) window.history.back();
  else navigate(fallback, { replace: true });
}

// 바텀시트 열기: 같은 화면에 ?sheet= 를 붙여 기록을 하나 쌓는다 → 뒤로가기로 닫힘
export function openSheet(name, extra = {}) {
  const { path, query } = parseHash(window.location.hash);
  const q = new URLSearchParams(query);
  q.set('sheet', name);
  for (const [k, v] of Object.entries(extra)) q.set(k, v);
  const url = urlWithHash(`${path}?${q.toString()}`);
  window.history.pushState({ tsSheet: name }, '', url);
  emit();
}

// 바텀시트 닫기: 우리가 쌓은 기록이면 뒤로, 아니면(주소로 바로 들어온 경우) 시트 표시만 지운다
export function closeSheet() {
  const { path, query, sheet } = parseHash(window.location.hash);
  if (!sheet) return;
  if (window.history.state?.tsSheet === sheet) {
    window.history.back();
    return;
  }
  const q = new URLSearchParams(query);
  q.delete('sheet');
  const rest = q.toString();
  window.history.replaceState(null, '', urlWithHash(rest ? `${path}?${rest}` : path));
  emit();
}

// 시트를 닫은 "다음에" 실행 (뒤로가기가 끝나기 전에 다른 화면으로 가면 기록이 꼬인다)
export function closeSheetThen(fn) {
  const { sheet } = parseHash(window.location.hash);
  if (sheet && window.history.state?.tsSheet === sheet) {
    const onPop = () => {
      window.removeEventListener('popstate', onPop);
      fn();
    };
    window.addEventListener('popstate', onPop);
    window.history.back();
    return;
  }
  closeSheet();
  fn();
}

// 첫 진입 화면 정하기 (앱을 그리기 전에 한 번)
//   1) ?teacher= 가 있으면 그 강사 화면 (#/teacher 와 같이 써도 된다)
//   2) #/경로 가 있으면 그 화면
//   3) 기억한 강사가 있으면 그 강사 화면, 없으면 홈 (홈 맨 위에 강사 검색)
export function resolveEntryRoute() {
  const hash = window.location.hash;
  const replaceTo = (path) => window.history.replaceState(window.history.state, '', urlWithHash(path));
  if (getUrlTeacher()) {
    if (!/^#\/teacher(\?|\/|$)/.test(hash)) replaceTo('/teacher');
    return;
  }
  if (hash && hash !== '#') return;
  if (getRememberedTeacher()) replaceTo('/teacher');
}
