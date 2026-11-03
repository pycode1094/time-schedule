// ─────────────────────────────────────────────────────────────
// TIS 수신자 엑셀 양식
//   TIS 업로드 양식이 정해지면 이 파일만 고친다 (고친 뒤 다시 빌드·배포).
//
//   columns  엑셀 왼쪽 열부터 순서대로
//     header  1행에 들어갈 열 이름
//     field   phone        수신번호 (phoneFormat 형식)
//             name         강사명
//             changeCount  변경 건수
// ─────────────────────────────────────────────────────────────
export default {
  // {date} → 다운로드 시각 (예: 20261102-1605)
  fileName: '시간표변경_알림대상_{date}.xlsx',
  sheetName: '수신자',

  // 수신번호 형식 (엑셀과 [번호 복사] 공통)
  //   'digits' 01012345678   'dashed' 010-1234-5678
  phoneFormat: 'digits',

  columns: [
    { header: '수신번호', field: 'phone' },
    { header: '이름',     field: 'name' },
  ],
};
