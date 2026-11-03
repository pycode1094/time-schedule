// Node(scripts/)에서도 SSF 등을 쓰도록 ESM 빌드를 직접 지정 (브라우저 번들은 원래 이 파일을 씀)
import * as XLSX from 'xlsx/xlsx.mjs';

// ─────────────────────────────────────────────────────────────
// 업로드 전 개인정보 제거
//   /api/schedule 은 업로드된 xlsx 를 누구나 받을 수 있게 내려주므로,
//   관리자 업로드 시 브라우저에서 아래 항목을 지운 사본만 서버로 보낸다.
//     - 교강사연락처 시트(2번째 시트)의 연락처 열 + 전화번호 형태의 셀
//     - 외부 통합문서(공유 폴더 경로)를 참조하는 정의된 이름·수식
//   앱이 읽는 값(시간표, 강사 이름·분야)은 그대로 둔다.
//   SheetJS 로 다시 쓰므로 셀 서식은 일부 사라질 수 있다 (앱 표시에는 영향 없음).
// ─────────────────────────────────────────────────────────────
export const PHONE_HEADER_RE = /연락처|전화|휴대|핸드폰|phone|tel|mobile/i;
const PHONE_VALUE_RE  = /0\d{1,2}[-.\s)]*\d{3,4}[-.\s]*\d{4}/;
const EXTERNAL_REF_RE = /\[\d+\]/;
const TEACHER_HEADER_ROW = 1;  // parseExcel.parseTeachers 와 동일 (2행이 헤더)

function looksLikePhone(v) {
  if (typeof v === 'number') return /^1[016789]\d{7,8}$/.test(String(v)); // 앞자리 0이 빠진 숫자 셀
  return typeof v === 'string' && PHONE_VALUE_RE.test(v);
}

// 반환: { data: ArrayBuffer (정리된 xlsx), removed: 지운 셀 수 }
export function stripTeacherContacts(arrayBuffer) {
  const wb = XLSX.read(arrayBuffer, { type: 'array', cellFormula: true, cellNF: true, cellStyles: true });
  let removed = 0;

  const ws = wb.Sheets[wb.SheetNames[1]];
  if (ws?.['!ref']) {
    const range = XLSX.utils.decode_range(ws['!ref']);
    const phoneCols = new Set();
    for (let c = range.s.c; c <= range.e.c; c++) {
      const head = ws[XLSX.utils.encode_cell({ r: TEACHER_HEADER_ROW, c })];
      if (head && PHONE_HEADER_RE.test(String(head.v ?? ''))) phoneCols.add(c);
    }
    for (const addr of Object.keys(ws)) {
      if (addr[0] === '!') continue;
      const { r, c } = XLSX.utils.decode_cell(addr);
      const v = ws[addr].v;
      if ((phoneCols.has(c) && r > TEACHER_HEADER_ROW) || looksLikePhone(v)) {
        if (v != null && v !== '') removed++;
        delete ws[addr];
      }
    }
  }

  // 외부 링크 참조 제거 (SheetJS 는 externalLink 파트 자체는 다시 쓰지 않음)
  if (wb.Workbook?.Names) {
    wb.Workbook.Names = wb.Workbook.Names.filter(n => !EXTERNAL_REF_RE.test(n.Ref || ''));
  }
  for (const name of wb.SheetNames) {
    const sheet = wb.Sheets[name];
    for (const addr of Object.keys(sheet)) {
      if (addr[0] !== '!' && sheet[addr].f && EXTERNAL_REF_RE.test(sheet[addr].f)) delete sheet[addr].f;
    }
  }

  const data = XLSX.write(wb, { type: 'array', bookType: 'xlsx', compression: true });
  return { data, removed };
}
