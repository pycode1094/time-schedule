// 발송 도우미 /preview · /notify(DRY-RUN) 테스트 (npm test)
//   임시 .env · 로그 폴더, 가짜 네트워크(공인 IP 조회만 응답, 비즈고 호출은 실패 처리)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createHandler } from '../server.js';
import { formatLine } from '../changes.js';
import { localDate } from '../guard.js';

const ORIGIN = 'http://localhost:5173';
const day = (offset) => localDate(new Date(Date.now() + offset * 86400000));
const TOMORROW = day(1);
const change = (over = {}) => ({
  date: TOMORROW, startPeriod: 3, endPeriod: 4, course: '스마트제조 3기', room: '(908)자동제어실',
  type: '변경', before: '감시제어 · (908)자동제어실', after: '감시제어 · (909)프로그램실3', ...over,
});
const LINE = formatLine(change());

async function startHelper(templateCode) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nh-srv-'));
  const envFile = path.join(dir, '.env');
  fs.writeFileSync(envFile, `NOTIFY_DRY_RUN=true\nBIZGO_TEMPLATE_CODE=${templateCode}\nALLOWED_ORIGINS=${ORIGIN}\n`);
  const bizgoCalls = [];
  const fetchImpl = async (url) => {
    if (String(url).startsWith('https://api.ipify.org')) return Response.json({ ip: '203.0.113.10' });
    bizgoCalls.push(url);
    throw new Error('테스트에서는 비즈고를 호출하지 않는다');
  };
  const quiet = { log() {}, warn() {}, error() {} };
  const app = createHandler({ envFile, logDir: path.join(dir, 'logs'), fetchImpl, logger: quiet });
  const server = http.createServer((req, res) => app.handle(req, res));
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();

  const post = (pathname, body, headers = {}) => new Promise((resolve, reject) => {
    const data = typeof body === 'string' ? body : JSON.stringify(body);
    const req = http.request({
      host: '127.0.0.1', port, path: pathname, method: 'POST',
      headers: { Host: '127.0.0.1:5599', Origin: ORIGIN, 'Content-Type': 'application/json', ...headers },
    }, (res) => {
      let text = '';
      res.on('data', (c) => { text += c; });
      res.on('end', () => resolve({ status: res.statusCode, json: JSON.parse(text) }));
    });
    req.on('error', reject);
    req.end(data);
  });
  const close = () => new Promise(r => server.close(() => { fs.rmSync(dir, { recursive: true, force: true }); r(); }));
  return { post, close, bizgoCalls };
}

test('01000_2_21: /preview 는 강사별 실제 문구를, /notify(DRY-RUN) 는 같은 문구의 요청 바디를 만든다', async (t) => {
  const h = await startHelper('01000_2_21');
  t.after(h.close);

  const recipients = [
    { name: '홍길동', changes: [change(), change({ startPeriod: 5, endPeriod: 5, type: '추가' })] },
    { name: '김철수', changes: [change({ course: '공지 https://evil.example' })] },
    { name: '이영희', changes: [change({ date: day(-1) })] },
    { name: '홍길동 링크를 누르세요', changes: [change()] },
    { name: '박민수', changes: [change({ course: '과정\n▶ 가짜 줄' })] },
  ];
  const pv = await h.post('/preview', { recipients });
  assert.equal(pv.status, 200);
  assert.equal(pv.json.usesChanges, true);
  assert.deepEqual(pv.json.buttons, ['시간표 확인']);
  const [ok, url, past, badName, newline] = pv.json.results;
  assert.equal(ok.text, [
    '안녕하세요 홍길동 강사님,', '대한상공회의소 부산인력개발원입니다.', '',
    '담당하시는 수업의 시간표가 아래와 같이 변경되었습니다.', '',
    LINE, formatLine(change({ startPeriod: 5, endPeriod: 5, type: '추가' })), '',
    '자세한 일정은 [시간표 확인] 버튼을 눌러 확인해 주세요.', '', '감사합니다.',
  ].join('\n'));
  assert.equal(url.code, 'INVALID_CHANGES');
  assert.match(url.result, /링크/);
  assert.equal(past.code, 'NO_CHANGES');
  assert.equal(badName.code, 'INVALID_NAME');
  assert.equal(newline.text.split('\n').filter(l => l.startsWith('▶')).length, 1);

  const nt = await h.post('/notify', {
    requestId: 'test-request-0001',
    recipients: [
      { name: '홍길동', phone: '010-1234-5678', changes: recipients[0].changes, text: '이 필드는 무시된다' },
      { name: '김철수', phone: '01000000000', changes: recipients[1].changes },
    ],
  });
  assert.equal(nt.status, 200);
  assert.equal(nt.json.mode, 'dry-run');
  assert.equal(nt.json.prepared, 1);
  assert.equal(nt.json.results[1].code, 'INVALID_CHANGES');
  const alimtalk = nt.json.previews[0].body.messageFlow[0].alimtalk;
  assert.equal(alimtalk.templateCode, '01000_2_21');
  assert.equal(alimtalk.text, ok.text);
  assert.equal(alimtalk.title, undefined);
  assert.equal(nt.json.previews[0].body.destinations[0].to, '***-****-5678');
  assert.deepEqual(h.bizgoCalls, []);
});

test('01000_2_20(예비): changes 는 읽지 않는다 (틀린 값이어도 무시)', async (t) => {
  const h = await startHelper('01000_2_20');
  t.after(h.close);
  const pv = await h.post('/preview', { recipients: [{ name: '홍길동', changes: 'www.evil' }, { name: '김철수' }] });
  assert.equal(pv.json.usesChanges, false);
  for (const r of pv.json.results) assert.match(r.text, /담당하시는 수업의 시간표가 변경되었습니다\./);
});

test('/preview 보안: 다른 Origin · Content-Type · 크기 · 인원', async (t) => {
  const h = await startHelper('01000_2_21');
  t.after(h.close);
  const one = { recipients: [{ name: '홍길동', changes: [change()] }] };
  assert.equal((await h.post('/preview', one, { Origin: 'https://evil.example' })).status, 403);
  assert.equal((await h.post('/preview', one, { Host: 'evil.example:5599' })).status, 403);
  assert.equal((await h.post('/preview', one, { 'Content-Type': 'text/plain' })).status, 415);
  assert.equal((await h.post('/preview', 'x'.repeat(257 * 1024))).status, 413);
  const many = { recipients: Array.from({ length: 101 }, () => one.recipients[0]) };
  assert.equal((await h.post('/preview', many)).status, 400);
  assert.deepEqual(h.bizgoCalls, []);
});
