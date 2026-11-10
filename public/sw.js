// ─────────────────────────────────────────────────────────────
// 서비스워커: 정적 파일만 캐시한다
//   - 화면 HTML(이동 요청): 네트워크 우선, 오프라인일 때만 저장해 둔 화면
//   - /assets/* (빌드 해시가 붙은 JS · CSS), icons/, manifest, favicon: 캐시 우선
//   - 시간표 데이터는 절대 캐시하지 않는다: /api/*, data/* (xlsx · json), 다른 주소
//     (Cloudflare Worker API, 발송 도우미 127.0.0.1, 글꼴 CDN)는 아예 가로채지 않는다
//   - GET 이 아닌 요청(관리자 업로드 등)도 가로채지 않는다
// ─────────────────────────────────────────────────────────────
const VERSION = 'v1';
const CACHE = `ts-static-${VERSION}`;
const SCOPE = new URL(self.registration.scope).pathname; // "/time-schedule/"
const MAX_ENTRIES = 80;

const PRECACHE = [
  SCOPE,
  `${SCOPE}manifest.webmanifest`,
  `${SCOPE}favicon.svg`,
  `${SCOPE}icons/icon-192.png`,
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(PRECACHE))
      .catch(() => { /* 오프라인 설치 실패는 무시: 다음 방문에 다시 시도 */ })
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('ts-static-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function isStatic(rel) {
  return rel.startsWith('assets/') || rel.startsWith('icons/') || rel === 'manifest.webmanifest' || rel === 'favicon.svg';
}

async function trim(cache) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - MAX_ENTRIES; i++) await cache.delete(keys[i]);
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok && res.type === 'basic') {
    await cache.put(request, res.clone());
    trim(cache);
  }
  return res;
}

async function networkFirstPage(request) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(request);
    if (res.ok && res.type === 'basic') await cache.put(SCOPE, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(SCOPE);
    if (hit) return hit;
    throw err;
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (!url.pathname.startsWith(SCOPE)) return;
  const rel = url.pathname.slice(SCOPE.length);
  if (rel.startsWith('api/') || rel.startsWith('data/')) return; // 시간표 데이터: 항상 네트워크

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstPage(request));
    return;
  }
  if (isStatic(rel)) event.respondWith(cacheFirst(request));
});
