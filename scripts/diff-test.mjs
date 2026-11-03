// ─────────────────────────────────────────────────────────────
// 시간표 변경 감지 확인용 스크립트 (발송하지 않음)
//
//   node scripts/diff-test.mjs old.xlsx new.xlsx [--today=YYYY-MM-DD] [--all]
//
//   --today=  과거 변경 제외 기준일 (기본: 오늘)
//   --all     과거 날짜 변경도 포함
//
//   강사별 변경 내용, 전화번호(뒤 4자리만), 알림톡 메시지 미리보기를 출력한다.
// ─────────────────────────────────────────────────────────────
import fs from 'node:fs';
import path from 'node:path';
import { parseWorkbook } from '../src/utils/parseExcel.js';
import {
  diffByTeacher, formatChange, formatChangeMessage, renderTemplate,
  DEFAULT_TEMPLATE, MESSAGE_MAX_LENGTH,
} from '../src/utils/scheduleDiff.js';

const args  = process.argv.slice(2);
const files = args.filter(a => !a.startsWith('--'));
const today = args.find(a => a.startsWith('--today='))?.slice('--today='.length);
const all   = args.includes('--all');

if (files.length !== 2 || (today && !/^\d{4}-\d{2}-\d{2}$/.test(today))) {
  console.error('사용법: node scripts/diff-test.mjs old.xlsx new.xlsx [--today=YYYY-MM-DD] [--all]');
  process.exit(1);
}

function load(file) {
  const buf = fs.readFileSync(file);
  const ab  = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  return parseWorkbook(ab, path.basename(file), { log: false });
}

const maskPhone = (p) => (p ? `***-****-${p.slice(-4)}` : '(번호 없음)');
const charLength = (s) => [...s].length;

const oldData = load(files[0]);
const newData = load(files[1]);
const options = { excludePast: !all, ...(today ? { today } : {}) };
const result  = diffByTeacher(oldData, newData, options);

console.log(`이전: ${files[0]}  (${oldData.meta.dateRange.start} ~ ${oldData.meta.dateRange.end})`);
console.log(`이후: ${files[1]}  (${newData.meta.dateRange.start} ~ ${newData.meta.dateRange.end})`);
console.log(`기준: ${all ? '과거 포함 전체' : `${today || '오늘'} 이후만`}`);
console.log(`변경된 강사: ${result.length}명\n`);

for (const { teacher, phone, changes } of result) {
  console.log(`■ ${teacher}  전화 ${maskPhone(phone)}  변경 ${changes.length}건`);
  for (const c of changes) console.log(`  ${formatChange(c)}`);

  const vars    = { 강사명: teacher };
  const body    = formatChangeMessage(changes, { vars });
  const message = renderTemplate(DEFAULT_TEMPLATE, { ...vars, 변경내용: body });
  console.log(`  ── 메시지 미리보기 (${charLength(message)}/${MESSAGE_MAX_LENGTH}자) ──`);
  console.log(message.replace(/^/gm, '  │ '));
  console.log();
}
