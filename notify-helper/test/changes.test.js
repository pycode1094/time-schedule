// #{변경내용} 만들기 · 템플릿 설정 단위 테스트 (npm test)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseChanges, buildChangesText, MAX_CHANGES, CHANGES_MAX_LENGTH } from '../changes.js';
import { loadConfig } from '../config.js';
import { buildMessage } from '../alimtalk.js';

const TODAY = '2026-11-04'; // 수요일
const base = { date: '2026-11-05', startPeriod: 3, endPeriod: 3, course: '스마트제조 3기', room: '(908)자동제어실', type: '변경', before: '', after: '' };
const ch = (over = {}) => ({ ...base, ...over });

function render(list, more) {
  const parsed = parseChanges(list, more);
  assert.equal(parsed.error, undefined, parsed.error);
  return buildChangesText(parsed.changes, { today: TODAY, moreChanges: parsed.moreChanges });
}
const errorOf = (list, more) => parseChanges(list, more).error;
const errorFor = (over) => errorOf([ch(over)]);

test('한 줄 형식', () => {
  assert.equal(render([ch({ endPeriod: 4 })]), '▶ 11/05(목) 3~4교시 스마트제조 3기 · (908)자동제어실 [변경]');
  assert.equal(render([ch({ room: '', type: '추가' })]), '▶ 11/05(목) 3교시 스마트제조 3기 [추가]');
  assert.equal(render([ch({ date: '2026-12-01', type: '삭제' })]), '▶ 12/01(화) 3교시 스마트제조 3기 · (908)자동제어실 [삭제]');
});

test('줄 합치기: 같은 날 · 과정 · 강의실 · 유형의 연속 교시', () => {
  assert.equal(render([ch({ startPeriod: 4, endPeriod: 4 }), ch()]), '▶ 11/05(목) 3~4교시 스마트제조 3기 · (908)자동제어실 [변경]');
  // 겹치는 범위도 합친다
  assert.equal(render([ch({ startPeriod: 1, endPeriod: 4 }), ch({ startPeriod: 4, endPeriod: 6 })]), '▶ 11/05(목) 1~6교시 스마트제조 3기 · (908)자동제어실 [변경]');
  // 이어지지 않으면 · 유형/강의실/날짜가 다르면 따로
  assert.equal(render([ch(), ch({ startPeriod: 5, endPeriod: 5 })]).split('\n').length, 2);
  assert.equal(render([ch(), ch({ startPeriod: 4, endPeriod: 4, type: '추가' })]).split('\n').length, 2);
  assert.equal(render([ch(), ch({ startPeriod: 4, endPeriod: 4, room: '(909)프로그램실3' })]).split('\n').length, 2);
  assert.equal(render([ch(), ch({ startPeriod: 4, endPeriod: 4, date: '2026-11-06' })]).split('\n').length, 2);
});

test('정렬: 날짜 → 교시 → 삭제 · 추가 · 변경', () => {
  const out = render([
    ch({ date: '2026-11-06', startPeriod: 1, endPeriod: 1 }),
    ch({ startPeriod: 5, endPeriod: 5, type: '추가' }),
    ch({ startPeriod: 5, endPeriod: 5, type: '삭제', room: '(905)로봇제어실' }),
    ch({ startPeriod: 1, endPeriod: 2 }),
  ]);
  assert.deepEqual(out.split('\n').map(l => l.slice(2, 16)), ['11/05(목) 1~2교시', '11/05(목) 5교시 스', '11/05(목) 5교시 스', '11/06(금) 1교시 스']);
  assert.match(out.split('\n')[1], /\[삭제\]$/);
  assert.match(out.split('\n')[2], /\[추가\]$/);
});

test('최대 5줄: 넘으면 4줄 + "외 N건"', () => {
  const days = (n) => Array.from({ length: n }, (_, i) => ch({ date: `2026-11-${String(10 + i).padStart(2, '0')}` }));
  assert.equal(render(days(5)).split('\n').length, 5);
  assert.doesNotMatch(render(days(5)), /외/);

  const six = render(days(6)).split('\n');
  assert.equal(six.length, 5);
  assert.equal(six[4], '외 2건');

  const seven = render(days(7)).split('\n');
  assert.equal(seven.length, 5);
  assert.equal(seven[3].slice(2, 7), '11/13');
  assert.equal(seven[4], '외 3건');

  // 화면이 보내지 않은 나머지(moreChanges)도 센다
  assert.deepEqual(render(days(3), 4).split('\n').slice(3), ['외 4건']);
  assert.equal(render(days(10), 5).split('\n')[4], '외 11건');
  assert.equal(render(days(2), 1).split('\n').length, 3);
});

test('오늘 이전 날짜 제외 (오늘은 포함)', () => {
  assert.equal(render([ch({ date: '2026-11-03' }), ch({ date: '2026-11-04' })]), '▶ 11/04(수) 3교시 스마트제조 3기 · (908)자동제어실 [변경]');
  assert.equal(render([ch({ date: '2026-11-03' }), ch({ date: '2025-12-31' })]), '');
});

test('악의적 입력: 링크(URL)는 거부', () => {
  for (const course of ['https://evil.example/a', 'HTTP://EVIL', 'javascript://x', '과정 www.evil', 'naver.com 특강', '공지 bit.ly/abc', '1.2.3.4 접속', 'evil.co.kr']) {
    assert.match(errorFor({ course }) || '', /링크/, course);
  }
  assert.match(errorFor({ room: 'http://x' }) || '', /강의실에 링크/);
  assert.match(errorFor({ after: 'abc.kr' }) || '', /변경 후 요약에 링크/);
  // 정상 과정명은 통과
  for (const course of ['ASP.NET 웹개발', 'C# 프로그래밍', 'Node.js 과정', '[한화오션] Ocean DX Academy-부산(7회차)']) {
    assert.equal(errorFor({ course }), undefined, course);
  }
});

test('악의적 입력: #{ } 는 거부', () => {
  assert.match(errorFor({ course: '#{이름} 님' }) || '', /#\{ \}/);
  assert.match(errorFor({ room: '{x}' }) || '', /#\{ \}/);
  assert.match(errorFor({ before: '과정 }' }) || '', /#\{ \}/);
});

test('악의적 입력: 줄바꿈 · 제어문자 · 안 보이는 문자는 공백으로 (줄을 더 만들 수 없음)', () => {
  const out = render([ch({ course: '과정\n▶ 11/06(금) 가짜 [추가]\r\n' })]);
  assert.equal(out.split('\n').length, 1);
  assert.equal(out, '▶ 11/05(목) 3교시 과정 ▶ 11/06(금) 가짜 [추가] · (908)자동제어실 [변경]');
  assert.equal(render([ch({ course: '\u202E과정\u200B명\u0007\t', room: '\uFEFF' })]), '▶ 11/05(목) 3교시 과정 명 [변경]');
  assert.match(errorFor({ course: '\u200B\n' }) || '', /과정명이 비어/);
});

test('악의적 입력: 길이 제한 (과정명 40 · 강의실 20 · 요약 40자)', () => {
  assert.equal(errorFor({ course: '가'.repeat(40) }), undefined);
  assert.match(errorFor({ course: '가'.repeat(41) }) || '', /과정명은 40자까지/);
  assert.match(errorFor({ room: '나'.repeat(21) }) || '', /강의실은 20자까지/);
  assert.match(errorFor({ before: '다'.repeat(41) }) || '', /변경 전 요약은 40자까지/);
  assert.match(errorFor({ after: 'x'.repeat(5000) }) || '', /변경 후 요약은 40자까지/);
  assert.match(errorFor({ course: 123 }) || '', /문자열/);
  assert.match(errorFor({ room: ['a'] }) || '', /문자열/);
});

test('형식 검사: 날짜 · 교시 · 유형', () => {
  for (const date of ['2026-02-30', '2026/11/05', '2026-11-5', 20261105, '', null]) {
    assert.match(errorFor({ date }) || '', /날짜/, String(date));
  }
  for (const p of [[0, 1], [3, 13], [5, 4], ['3', 3], [3.5, 4], [null, 3]]) {
    assert.match(errorFor({ startPeriod: p[0], endPeriod: p[1] }) || '', /교시/, String(p));
  }
  for (const type of ['changed', '변경 ', '', null]) {
    assert.match(errorFor({ type }) || '', /변경유형/, String(type));
  }
});

test('목록 검사: 개수 · moreChanges · 한 건이라도 틀리면 그 강사 전체 거부', () => {
  assert.match(errorOf([]) || '', /없습니다/);
  assert.match(errorOf('x') || '', /없습니다/);
  assert.match(errorOf(Array.from({ length: MAX_CHANGES + 1 }, () => ch())) || '', /10건까지/);
  assert.match(errorOf([null]) || '', /형식/);
  assert.match(errorOf([[]]) || '', /형식/);
  for (const more of [-1, 1.5, '3', 10000]) assert.match(errorOf([ch()], more) || '', /moreChanges/, String(more));
  assert.match(errorOf([ch(), ch({ course: 'www.x' }), ch()]) || '', /^변경 2번째: 과정명에 링크/);
});

test('전체 500자 이내', () => {
  const list = Array.from({ length: MAX_CHANGES }, (_, i) => ch({
    date: `2026-11-${String(10 + i).padStart(2, '0')}`, startPeriod: 1, endPeriod: 12,
    course: '과'.repeat(40), room: '실'.repeat(20),
  }));
  const out = render(list, 9999);
  assert.ok([...out].length <= CHANGES_MAX_LENGTH, `${[...out].length}자`);
  assert.equal(out.split('\n').length, 5);
  assert.equal(out.split('\n')[4], '외 10005건');
});

// ── 템플릿 설정 ──────────────────────────────────────────────
function configFor(code) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nh-tpl-'));
  const envFile = path.join(dir, '.env');
  fs.writeFileSync(envFile, `NOTIFY_DRY_RUN=true\nBIZGO_TEMPLATE_CODE=${code}\n`);
  try { return loadConfig({ envFile }); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

const V2_TEXT = '안녕하세요 #{이름} 강사님,\n대한상공회의소 부산인력개발원입니다.\n\n담당하시는 수업의 시간표가 아래와 같이 변경되었습니다.\n\n#{변경내용}\n\n자세한 일정은 [시간표 확인] 버튼을 눌러 확인해 주세요.\n\n감사합니다.';

test('01000_2_21: 등록 본문과 글자 단위로 같고, 제목 없음, 버튼 1개', () => {
  const cfg = configFor('01000_2_21');
  assert.deepEqual(cfg.problems, []);
  assert.equal(cfg.template.text, V2_TEXT);
  assert.equal(cfg.template.title, '');
  assert.equal(cfg.template.usesChanges, true);
  assert.deepEqual(cfg.template.buttons, [{ type: 'WL', name: '시간표 확인', urlMobile: 'https://pycode1094.github.io/time-schedule/' }]);

  const changesText = render([ch({ endPeriod: 4 })]);
  const { text } = buildMessage(cfg.template, { name: '홍길동', changesText });
  assert.equal(text, V2_TEXT.replace('#{이름}', '홍길동').replace('#{변경내용}', changesText));
  assert.ok(!text.endsWith('\n'));
});

test('01000_2_20(예비): #{변경내용} 이 없으므로 변경 내용은 쓰지 않는다', () => {
  const cfg = configFor('01000_2_20');
  assert.deepEqual(cfg.problems, []);
  assert.equal(cfg.template.usesChanges, false);
  const { text } = buildMessage(cfg.template, { name: '홍길동', changesText: '▶ 무시되어야 함' });
  assert.doesNotMatch(text, /무시/);
  assert.match(text, /^안녕하세요 홍길동 강사님,\n부산인력개발원입니다\./);
});
