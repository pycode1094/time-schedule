// ─────────────────────────────────────────────────────────────
// 비밀 · 개인정보 유출 검사 (외부 의존성 없음)
//
//   node scripts/check-secrets.mjs                     스테이징된 파일 검사 (pre-commit 훅에서 실행)
//   node scripts/check-secrets.mjs --history           git 전체 이력(모든 브랜치) 검사
//   node scripts/check-secrets.mjs --history publish   한 브랜치(ref)의 이력만 검사 (push 하기 전)
//   node scripts/check-secrets.mjs --file 파일.xlsx    파일 하나 검사 (예: 운영 Worker 에서 받은 xlsx)
//
//   실패 조건
//   - 비즈고 API 키 모양 (mars_ak_ 로 시작하는 긴 문자열)
//   - 휴대전화 번호 (010-xxxx-xxxx / 010xxxxxxxx 등 01X)
//   - 이 PC 의 공인 IP: notify-helper/.env 의 EXPECTED_PUBLIC_IPS 에 든 IP(CIDR 범위 포함)
//   - .env 파일 (.env.example 제외), private/ · test-data/ · notify-helper/logs/ 아래 파일
//   - xlsx 원본. 공개용 public/data/default-schedule.xlsx 만 허용하되,
//     압축을 풀어 시트 안에 전화번호가 없는지 검사한다
//   찾은 값은 화면에 그대로 내보내지 않는다 (번호는 뒤 4자리, 키는 접두, IP 는 가림).
//
//   훅 켜기: git config core.hooksPath .githooks
// ─────────────────────────────────────────────────────────────
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { parseIpList, ipInRanges } from '../notify-helper/publicIp.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const KEY_RE   = /mars_ak_[A-Za-z0-9_-]{8,}/g;
const PHONE_RE = /(?<![A-Za-z0-9])01[016789]-?\d{3,4}-?\d{4}(?![A-Za-z0-9])/g;
const IPV4_RE  = /(?<![\d.])(?:\d{1,3}\.){3}\d{1,3}(?![\d.])/g;
// 엑셀 숫자 셀로 들어가 앞자리 0 이 빠진 번호 (<v>1012345678</v>)
const XLSX_NUMBER_PHONE_RE = /<v>1[016789]\d{7,8}<\/v>/g;
// 문서 · 코드의 형식 예시로 널리 쓰는 번호는 허용
const EXAMPLE_PHONES = new Set(['01012345678', '01000000000']);
const SHEET_RE = /\.(xlsx|xlsm|xls)$/i;
const ALLOWED_SHEETS = new Set(['public/data/default-schedule.xlsx']);
const PRIVATE_DIRS = ['private/', 'test-data/', 'notify-helper/logs/'];

const git = (args, opts = {}) => execFileSync('git', args, { maxBuffer: 256 * 1024 * 1024, ...opts });

// 이 PC 의 공인 IP (notify-helper/.env 의 EXPECTED_PUBLIC_IPS). 값은 출력하지 않는다
function loadPublicIpRanges() {
  try {
    const text = fs.readFileSync(path.join(ROOT, 'notify-helper/.env'), 'utf8');
    const line = text.split(/\r?\n/).find(l => /^\s*EXPECTED_PUBLIC_IPS\s*=/.test(l));
    return line ? parseIpList(line.slice(line.indexOf('=') + 1).trim().replace(/^(['"])(.*)\1$/, '$2')).ranges : [];
  } catch {
    return [];
  }
}
const PUBLIC_IP_RANGES = loadPublicIpRanges();

const isEnvFile = (p) => {
  const base = p.split('/').pop();
  return /^\.env($|\.)/.test(base) && base !== '.env.example';
};
const isBinary = (buf) => buf.subarray(0, 8000).includes(0);
const maskPhone = (m) => `***-****-${m.replace(/\D/g, '').slice(-4)}`;

// ── 최소한의 zip 읽기 (xlsx 안의 xml 꺼내기) ───────────────────
function unzipXmlEntries(buf) {
  const out = [];
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('zip 형식이 아닙니다');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('zip 디렉터리 오류');
    const method   = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen  = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commLen  = buf.readUInt16LE(p + 32);
    const local    = buf.readUInt32LE(p + 42);
    const name     = buf.subarray(p + 46, p + 46 + nameLen).toString('utf8');
    p += 46 + nameLen + extraLen + commLen;
    if (!name.endsWith('.xml')) continue;
    const lNameLen  = buf.readUInt16LE(local + 26);
    const lExtraLen = buf.readUInt16LE(local + 28);
    const start = local + 30 + lNameLen + lExtraLen;
    const data = buf.subarray(start, start + compSize);
    const xml = method === 8 ? zlib.inflateRawSync(data) : method === 0 ? data : null;
    if (xml) out.push({ name, text: xml.toString('utf8') });
  }
  return out;
}

// ── 파일 1개 검사 → 문제 목록 [{ kind, detail }] ─────────────
//   allowAnySheet: --file 로 직접 검사할 때는 xlsx 도 내용만 본다
function scanFile(filePath, buf, { allowAnySheet = false } = {}) {
  const issues = [];
  if (isEnvFile(filePath)) issues.push({ kind: '.env 파일', detail: '환경변수 파일은 커밋하지 않습니다' });
  const dir = PRIVATE_DIRS.find(d => filePath.startsWith(d));
  if (dir) issues.push({ kind: '비공개 폴더', detail: `${dir} 아래 파일은 커밋하지 않습니다` });

  const scanText = (text, where = '') => {
    text.split('\n').forEach((line, i) => {
      for (const m of line.matchAll(KEY_RE)) {
        issues.push({ kind: 'API 키', detail: `${where}${i + 1}행: mars_ak_*** (${m[0].length}자)` });
      }
      for (const m of line.matchAll(PHONE_RE)) {
        if (EXAMPLE_PHONES.has(m[0].replace(/\D/g, ''))) continue;
        issues.push({ kind: '전화번호', detail: `${where}${i + 1}행: ${maskPhone(m[0])}` });
      }
      if (PUBLIC_IP_RANGES.length) {
        for (const m of line.matchAll(IPV4_RE)) {
          if (ipInRanges(m[0], PUBLIC_IP_RANGES)) {
            issues.push({ kind: '공인 IP', detail: `${where}${i + 1}행: EXPECTED_PUBLIC_IPS 에 있는 IP (${m[0].split('.')[0]}.*.*.*)` });
          }
        }
      }
    });
  };

  if (SHEET_RE.test(filePath)) {
    if (!allowAnySheet && !ALLOWED_SHEETS.has(filePath)) {
      issues.push({ kind: 'xlsx 원본', detail: '엑셀 파일은 커밋하지 않습니다 (공개용 default-schedule.xlsx 만 허용)' });
      return issues;
    }
    let entries;
    try {
      entries = unzipXmlEntries(buf);
    } catch (e) {
      issues.push({ kind: 'xlsx 검사 실패', detail: e.message });
      return issues;
    }
    for (const { name, text } of entries) {
      scanText(text.replace(/></g, '>\n<'), `${name} `);
      for (const m of text.matchAll(XLSX_NUMBER_PHONE_RE)) {
        issues.push({ kind: '전화번호', detail: `${name} 숫자 셀: ${maskPhone(m[0])}` });
      }
    }
    return issues;
  }

  if (!isBinary(buf)) scanText(buf.toString('utf8'));
  return issues;
}

// ── 스테이징된 파일 ──────────────────────────────────────────
function checkStaged() {
  const names = git(['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z']).toString('utf8').split('\0').filter(Boolean);
  const findings = [];
  for (const p of names) {
    const buf = git(['show', `:${p}`]);
    for (const issue of scanFile(p, buf)) findings.push({ path: p, ...issue });
  }
  return { label: `스테이징된 파일 ${names.length}개`, findings };
}

// ── 이력 (ref 를 주면 그 브랜치만, 없으면 모든 브랜치) ──────────
function checkHistory(ref) {
  const commits = git(['rev-list', ...(ref ? [ref] : ['--all'])]).toString('utf8').split('\n').filter(Boolean);
  const blobs = new Map(); // sha → { paths: Set, commits: Set }
  for (const c of commits) {
    const tree = git(['ls-tree', '-r', '-z', c]).toString('utf8').split('\0').filter(Boolean);
    for (const entry of tree) {
      const [meta, p] = entry.split('\t');
      const [, type, sha] = meta.split(' ');
      if (type !== 'blob') continue;
      if (!blobs.has(sha)) blobs.set(sha, { paths: new Set(), commits: new Set() });
      blobs.get(sha).paths.add(p);
      blobs.get(sha).commits.add(c.slice(0, 7));
    }
  }
  const findings = [];
  for (const [sha, { paths, commits: cs }] of blobs) {
    const buf = git(['cat-file', 'blob', sha]);
    for (const p of paths) {
      for (const issue of scanFile(p, buf)) findings.push({ path: p, commits: [...cs], ...issue });
    }
  }
  return { label: `git 이력 ${ref ? `(${ref}) ` : '(모든 브랜치) '}커밋 ${commits.length}개, 파일 ${blobs.size}개(내용 기준)`, findings };
}

// ── 파일 하나 ────────────────────────────────────────────────
function checkFile(file) {
  const findings = scanFile(path.basename(file), fs.readFileSync(file), { allowAnySheet: true }).map(i => ({ path: file, ...i }));
  return { label: `파일 ${file}`, findings };
}

const args = process.argv.slice(2);
const argValue = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : null;
};
const mode = args.includes('--file') ? 'file' : args.includes('--history') ? 'history' : 'staged';
const { label, findings } = mode === 'file' ? checkFile(argValue('--file'))
  : mode === 'history' ? checkHistory(argValue('--history'))
  : checkStaged();
const ipNote = PUBLIC_IP_RANGES.length ? '공인 IP 포함' : '공인 IP 는 EXPECTED_PUBLIC_IPS 가 없어 건너뜀';

if (findings.length === 0) {
  console.log(`[check-secrets] ${label} 검사: 문제 없음 (${ipNote})`);
  process.exit(0);
}

console.error(`[check-secrets] ${label} 검사: ${findings.length}건 발견 (${ipNote})${mode === 'staged' ? ' — 커밋을 중단합니다' : ''}`);
for (const f of findings) {
  console.error(`  - [${f.kind}] ${f.path}${f.commits ? ` (커밋 ${f.commits.join(', ')})` : ''}: ${f.detail}`);
}
if (mode === 'staged') console.error('  해당 파일을 스테이징에서 빼거나 내용을 고친 뒤 다시 커밋하세요. (git restore --staged <파일>)');
process.exit(1);
