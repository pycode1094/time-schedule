// ─────────────────────────────────────────────────────────────
// 홈 화면에 추가 (PWA 설치)
//   Chrome · Edge · 삼성 인터넷은 beforeinstallprompt 를 준다 → [홈 화면에 추가] 버튼
//   iPhone Safari 는 이벤트가 없으므로 "공유 › 홈 화면에 추가" 안내만
// ─────────────────────────────────────────────────────────────
import { useSyncExternalStore } from 'react';

let deferred = null;
const listeners = new Set();
const emit = () => listeners.forEach(l => l());

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e;
    emit();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    emit();
  });
}

export function useInstallPrompt() {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l); },
    () => deferred,
    () => null,
  );
}

export async function promptInstall() {
  if (!deferred) return false;
  const e = deferred;
  deferred = null;
  emit();
  await e.prompt();
  const choice = await e.userChoice.catch(() => null);
  return choice?.outcome === 'accepted';
}

export function isStandalone() {
  try {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  } catch {
    return false;
  }
}

export function isIos() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent || '');
}
