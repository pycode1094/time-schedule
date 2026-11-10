// ─────────────────────────────────────────────────────────────
// 화면 테마: 'system' | 'light' | 'dark'
//   system 이면 <html> 에서 data-theme 를 빼고 CSS 가 prefers-color-scheme 을 따른다.
//   첫 화면 깜빡임을 막는 같은 코드가 index.html <head> 에도 있다.
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import { readJson, writeJson } from './storage.js';

const THEMES = ['system', 'light', 'dark'];
const BAR_COLOR = { light: '#F2F4F6', dark: '#0F1115' };

export function getThemePref() {
  const v = readJson('theme', 'system');
  return THEMES.includes(v) ? v : 'system';
}

function systemDark() {
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  } catch {
    return false;
  }
}

export function resolvedTheme(pref) {
  if (pref === 'light' || pref === 'dark') return pref;
  return systemDark() ? 'dark' : 'light';
}

export function applyTheme(pref) {
  const root = document.documentElement;
  if (pref === 'light' || pref === 'dark') root.setAttribute('data-theme', pref);
  else root.removeAttribute('data-theme');
  // 주소창 · 상태 표시줄 색 (수동 선택이면 두 media 메타를 같은 색으로)
  const color = BAR_COLOR[resolvedTheme(pref)];
  document.querySelectorAll('meta[name="theme-color"]').forEach(m => {
    const media = m.getAttribute('media') || '';
    m.setAttribute('content', pref === 'system' ? BAR_COLOR[media.includes('dark') ? 'dark' : 'light'] : color);
  });
}

export function useTheme() {
  const [pref, setPref] = useState(getThemePref);
  useEffect(() => { applyTheme(pref); }, [pref]);
  function change(next) {
    if (!THEMES.includes(next)) return;
    writeJson('theme', next === 'system' ? null : next);
    setPref(next);
  }
  return [pref, change];
}
