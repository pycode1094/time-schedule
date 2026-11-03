// ─────────────────────────────────────────────────────────────
// 알림 대상 강사를 TIS(내부 발송 사이트)로 넘기기
//   알림톡 발송은 TIS 가 한다 (TIS 가 비즈고와 연동되어 있음, 문구 고정).
//   이 앱은 일정이 바뀐 강사의 번호만 골라 넘긴다.
//
//   지금 구현: 수신자 엑셀 다운로드 · 번호 복사 · TIS 발송 화면 새 탭 열기
//   TIS 가 URL 파라미터나 폼 POST 로 수신자를 받게 되면 openTisSendPage 만 바꾸면 된다
//   (이미 recipients 를 받도록 열어 두었다).
//   ※ 전화번호를 URL 파라미터로 넘기면 TIS 서버 로그와 브라우저 기록에 남으므로
//     가능하면 폼 POST(새 탭에 form target="_blank")로 넘긴다.
//
//   recipients: [{ name, phone, changeCount }]   phone 은 숫자만 ("01012345678")
//   전화번호는 브라우저 안에서만 쓴다. 이 앱의 서버(Worker)로 보내거나 console 에 찍지 않는다.
// ─────────────────────────────────────────────────────────────
import * as XLSX from 'xlsx/xlsx.mjs';
import TIS_CONFIG from '../config/tis.config.js';

// TIS 발송 화면 주소 (빌드 시 VITE_TIS_SEND_URL). http(s) 주소가 아니면 미설정으로 본다
const RAW_TIS_URL = (import.meta.env?.VITE_TIS_SEND_URL || '').trim();
export const TIS_SEND_URL = /^https?:\/\//i.test(RAW_TIS_URL) ? RAW_TIS_URL : '';

// "01012345678" → 형식에 맞게
export function formatPhone(phone, format = TIS_CONFIG.phoneFormat) {
  const d = String(phone || '').replace(/\D/g, '');
  if (format === 'dashed' && d.length === 11) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  if (format === 'dashed' && d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return d;
}

const FIELD_VALUE = {
  phone:       (r) => formatPhone(r.phone),
  name:        (r) => r.name,
  changeCount: (r) => r.changeCount,
};

// [헤더행, ...데이터행]
export function recipientRows(recipients, config = TIS_CONFIG) {
  const header = config.columns.map(c => c.header);
  const rows = recipients.map(r => config.columns.map(c => FIELD_VALUE[c.field]?.(r) ?? ''));
  return [header, ...rows];
}

function timestamp(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

// 수신자 엑셀 다운로드 (브라우저 안에서 만들어 바로 저장, 서버로 보내지 않음)
export function downloadRecipientsExcel(recipients, now = new Date()) {
  const ws = XLSX.utils.aoa_to_sheet(recipientRows(recipients));
  // 수신번호 열은 텍스트 서식: 엑셀에서 편집해도 앞자리 0 이 빠지지 않게
  const phoneCol = TIS_CONFIG.columns.findIndex(c => c.field === 'phone');
  if (phoneCol >= 0) {
    for (let r = 1; r <= recipients.length; r++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c: phoneCol })];
      if (cell) { cell.t = 's'; cell.z = '@'; }
    }
  }
  ws['!cols'] = TIS_CONFIG.columns.map(c => ({ wch: c.field === 'phone' ? 16 : 12 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, TIS_CONFIG.sheetName || 'Sheet1');
  const fileName = TIS_CONFIG.fileName.replace('{date}', timestamp(now));
  XLSX.writeFile(wb, fileName);
  return fileName;
}

// 번호 복사 (줄바꿈 구분)
export async function copyPhoneNumbers(recipients) {
  const text = recipients.map(r => formatPhone(r.phone)).join('\n');
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  // clipboard API 를 못 쓰는 환경 (http 주소 등)
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  const ok = document.execCommand('copy');
  ta.remove();
  if (!ok) throw new Error('클립보드에 복사할 수 없습니다');
}

// TIS 발송 화면을 새 탭으로 연다. 지금은 recipients 를 넘기지 않는다
// eslint-disable-next-line no-unused-vars
export function openTisSendPage(recipients) {
  if (!TIS_SEND_URL) return false;
  window.open(TIS_SEND_URL, '_blank', 'noopener,noreferrer');
  return true;
}
