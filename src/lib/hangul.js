// ─────────────────────────────────────────────────────────────
// 한글 검색: 초성 검색 지원
//   "ㄱㅇㅅ" → 김유성,  "김ㅇ" → 김유성,  "로보" → 스마트제조공정 로보틱스 …
//   검색어의 글자가 자음(ㄱ~ㅎ)이면 대상 글자의 초성과 비교하고, 아니면 글자 그대로 비교한다.
//   공백과 대소문자는 무시한다.
// ─────────────────────────────────────────────────────────────
const CHO = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
const HANGUL_START = 0xac00;
const HANGUL_END = 0xd7a3;
const CHO_SET = new Set(CHO);

function choseongOf(ch) {
  const code = ch.charCodeAt(0);
  if (code < HANGUL_START || code > HANGUL_END) return ch;
  return CHO[Math.floor((code - HANGUL_START) / 588)];
}

function normalize(s) {
  return String(s || '').replace(/\s+/g, '').toLowerCase();
}

// 검색어 글자 q 가 대상 글자 t 와 맞는지
function charMatches(q, t) {
  if (q === t) return true;
  return CHO_SET.has(q) && choseongOf(t) === q;
}

// 대상 문자열에서 검색어가 처음 맞는 위치 (없으면 -1)
export function matchIndex(text, query) {
  const t = normalize(text);
  const q = normalize(query);
  if (!q) return 0;
  outer: for (let i = 0; i + q.length <= t.length; i++) {
    for (let j = 0; j < q.length; j++) {
      if (!charMatches(q[j], t[i + j])) continue outer;
    }
    return i;
  }
  return -1;
}

export function matches(text, query) {
  return matchIndex(text, query) >= 0;
}

// 여러 항목 검색 → 앞에서 맞는 것, 짧은 것 순
export function search(items, query, getText, limit = 20) {
  const q = normalize(query);
  if (!q) return [];
  return items
    .map(item => ({ item, idx: matchIndex(getText(item), q), len: normalize(getText(item)).length }))
    .filter(r => r.idx >= 0)
    .sort((a, b) => a.idx - b.idx || a.len - b.len)
    .slice(0, limit)
    .map(r => r.item);
}
