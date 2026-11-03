import { useState } from 'react';
import Modal from './Modal';
import {
  TIS_SEND_URL, formatPhone, downloadRecipientsExcel, copyPhoneNumbers, openTisSendPage,
} from '../utils/tisHandoff.js';
import { formatUploadedAt } from '../utils/changeLog.js';

// ─────────────────────────────────────────────────────────────
// 업로드 후 "알림 대상 강사" 화면 (VITE_NOTIFY_MODE=tis)
//   targets: { uploadedAt, items: [{ teacher, phone, changeCount, checked }] }
//   전화번호는 이 화면과 다운로드 파일 · 클립보드에만 쓴다 (서버로 보내지 않음).
// ─────────────────────────────────────────────────────────────
export default function TisTargetsModal({ targets, onToggle, onToggleAll, onClose }) {
  const [msg, setMsg] = useState(null); // { ok, text }
  const { uploadedAt, items } = targets;
  const withPhone = items.filter(t => t.phone);
  const noPhone   = items.filter(t => !t.phone);
  const selected  = withPhone.filter(t => t.checked);
  const recipients = selected.map(t => ({ name: t.teacher, phone: t.phone, changeCount: t.changeCount }));
  const allChecked = withPhone.length > 0 && selected.length === withPhone.length;

  function handleDownload() {
    try {
      const fileName = downloadRecipientsExcel(recipients);
      setMsg({ ok: true, text: `${fileName} 저장 (${recipients.length}명)` });
    } catch (e) {
      setMsg({ ok: false, text: `엑셀을 만들 수 없습니다: ${e.message}` });
    }
  }

  async function handleCopy() {
    try {
      await copyPhoneNumbers(recipients);
      setMsg({ ok: true, text: `번호 ${recipients.length}개를 복사했습니다 (줄바꿈 구분)` });
    } catch (e) {
      setMsg({ ok: false, text: e.message });
    }
  }

  return (
    <Modal onClose={onClose} title={`알림 대상 강사 ${selected.length}명`} width="max-w-xl">
      <div className="space-y-4">
        <div className="text-xs text-gray-500 space-y-0.5">
          {uploadedAt && <p>업로드 완료: {formatUploadedAt(uploadedAt)}</p>}
          <p>
            수신자 엑셀이나 번호를 TIS 발송 화면에 넣고 알림톡을 보내 주세요.
            제외할 강사는 체크를 해제하세요.
          </p>
        </div>

        {withPhone.length === 0 ? (
          <p className="py-6 text-sm text-center text-gray-500 bg-gray-50 rounded-lg">
            번호가 있는 강사가 없습니다
          </p>
        ) : (
          <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-[45vh] overflow-y-auto">
            <label className="flex items-center gap-3 px-3 py-2 bg-gray-50 text-xs text-gray-500 cursor-pointer">
              <input
                type="checkbox"
                checked={allChecked}
                onChange={() => onToggleAll(!allChecked)}
                className="w-4 h-4 accent-blue-600"
              />
              <span className="flex-1">이름</span>
              <span className="w-32">전화번호</span>
              <span className="w-14 text-right">변경</span>
            </label>
            {withPhone.map(t => (
              <label key={t.teacher} className="flex items-center gap-3 px-3 py-2 text-sm cursor-pointer hover:bg-blue-50/40">
                <input
                  type="checkbox"
                  checked={t.checked}
                  onChange={() => onToggle(t.teacher)}
                  className="w-4 h-4 accent-blue-600"
                />
                <span className={`flex-1 font-medium ${t.checked ? 'text-gray-800' : 'text-gray-400 line-through'}`}>{t.teacher}</span>
                <span className={`w-32 font-mono text-xs ${t.checked ? 'text-gray-600' : 'text-gray-300'}`}>{formatPhone(t.phone, 'dashed')}</span>
                <span className="w-14 text-right text-xs text-gray-500">{t.changeCount}건</span>
              </label>
            ))}
          </div>
        )}

        {noPhone.length > 0 && (
          <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
            번호 없음 {noPhone.length}명 (따로 안내 필요): {noPhone.map(t => t.teacher).join(', ')}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleDownload}
            disabled={recipients.length === 0}
            className="px-3 py-2 text-sm border border-blue-600 text-blue-600 rounded-lg hover:bg-blue-50 disabled:opacity-40"
          >
            수신자 엑셀 다운로드
          </button>
          <button
            onClick={handleCopy}
            disabled={recipients.length === 0}
            className="px-3 py-2 text-sm border border-blue-600 text-blue-600 rounded-lg hover:bg-blue-50 disabled:opacity-40"
          >
            번호 복사
          </button>
          <button
            onClick={() => openTisSendPage(recipients)}
            disabled={!TIS_SEND_URL}
            title={TIS_SEND_URL || 'VITE_TIS_SEND_URL 이 설정되지 않았습니다'}
            className="px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40"
          >
            TIS 발송 화면 열기
          </button>
          {!TIS_SEND_URL && <span className="self-center text-xs text-gray-400">TIS 주소 미설정</span>}
        </div>

        {msg && (
          <p className={`text-xs ${msg.ok ? 'text-green-600' : 'text-red-600'}`}>{msg.text}</p>
        )}

        <div className="flex items-center justify-between gap-2 pt-3 border-t border-gray-100">
          <p className="text-[11px] text-gray-400">닫아도 관리자 패널에서 다시 열 수 있습니다 (이 탭을 닫기 전까지).</p>
          <button
            onClick={onClose}
            className="flex-shrink-0 px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
          >
            닫기
          </button>
        </div>
      </div>
    </Modal>
  );
}
