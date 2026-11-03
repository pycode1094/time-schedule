// ─────────────────────────────────────────────────────────────
// 이 PC 의 공인 IP 확인
//   비즈고는 연동관리에 등록한 IP 에서 온 호출만 받는다.
//   등록할 IP 는 GitHub Pages 가 아니라 "이 발송 도우미가 도는 PC 의 공인 IP" 다
//   (ipconfig 에 나오는 192.168.x.x 같은 내부 IP 도 아님).
//
//   https://api.ipify.org 로 현재 공인 IP 를 조회해 EXPECTED_PUBLIC_IPS 와 비교한다.
//     - 쉼표 구분, CIDR 가능 (예: 203.0.113.10 또는 203.0.113.0/24). IPv4 만
//     - 10분 캐시 (실패는 1분), 타임아웃 3초, 리다이렉트는 따라가지 않음
//     - 조회 실패 → unknown (경고만 하고 진행)
// ─────────────────────────────────────────────────────────────
const IPIFY_URL = 'https://api.ipify.org?format=json';
const LOOKUP_TIMEOUT_MS = 3000;
const CACHE_MS = 10 * 60 * 1000;
const FAIL_CACHE_MS = 60 * 1000;

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

function ipToInt(ip) {
  const m = IPV4.exec(String(ip ?? ''));
  if (!m) return null;
  const p = m.slice(1).map(Number);
  if (p.some(n => n > 255)) return null;
  return p[0] * 16777216 + p[1] * 65536 + p[2] * 256 + p[3];
}

export const ipGuidance = (ip) =>
  `현재 공인 IP ${ip || '(확인 실패)'} 가 비즈고 허용 IP에 없습니다. 비즈고 연동관리에 추가하세요`;

// "203.0.113.10, 203.0.113.0/24" → { ranges: [{ text, start, end }], invalid: [] }
export function parseIpList(raw) {
  const ranges = [];
  const invalid = [];
  for (const item of String(raw || '').split(',').map(s => s.trim()).filter(Boolean)) {
    const [ip, bitsRaw, extra] = item.split('/');
    const base = ipToInt(ip);
    const bits = bitsRaw === undefined ? 32 : (/^\d{1,2}$/.test(bitsRaw) ? Number(bitsRaw) : NaN);
    if (base === null || extra !== undefined || !(bits >= 0 && bits <= 32)) {
      invalid.push(item);
      continue;
    }
    const size = 2 ** (32 - bits);
    const start = Math.floor(base / size) * size;
    ranges.push({ text: item, start, end: start + size - 1 });
  }
  return { ranges, invalid };
}

export function ipInRanges(ip, ranges) {
  const n = ipToInt(ip);
  return n !== null && ranges.some(r => n >= r.start && n <= r.end);
}

// fetchImpl 은 테스트에서 바꿔 끼울 수 있게 받는다
export function createIpChecker(fetchImpl = globalThis.fetch) {
  let cache = null; // { ip, error, at }

  async function lookup({ force = false } = {}) {
    const now = Date.now();
    if (!force && cache && now - cache.at < (cache.ip ? CACHE_MS : FAIL_CACHE_MS)) return cache;
    try {
      const res = await fetchImpl(IPIFY_URL, { redirect: 'manual', signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS) });
      if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (ipToInt(json?.ip) === null) throw new Error('응답 형식 오류');
      cache = { ip: json.ip, error: null, at: now };
    } catch (e) {
      const error = e?.name === 'TimeoutError' ? '시간 초과(3초)' : (e?.cause?.code || e?.message || '알 수 없음');
      cache = { ip: null, error, at: now };
    }
    return cache;
  }

  // → { status: 'ok' | 'mismatch' | 'unknown', ip, reason? }
  async function check(expected, opts) {
    const r = await lookup(opts);
    if (!r.ip) return { status: 'unknown', ip: null, reason: `공인 IP 조회 실패(${r.error}) — 확인하지 못한 채 진행합니다` };
    if (!expected?.ranges?.length) {
      return { status: 'unknown', ip: r.ip, reason: 'EXPECTED_PUBLIC_IPS 가 비어 있어 비즈고 허용 IP와 비교하지 않았습니다' };
    }
    return ipInRanges(r.ip, expected.ranges)
      ? { status: 'ok', ip: r.ip }
      : { status: 'mismatch', ip: r.ip, reason: ipGuidance(r.ip) };
  }

  // 마지막으로 확인한 IP (조회하지 않음)
  const cached = () => cache?.ip || null;

  return { check, lookup, cached };
}
