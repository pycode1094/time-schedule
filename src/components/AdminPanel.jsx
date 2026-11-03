import { useRef, useState } from 'react';
import Modal from './Modal';
import TisTargetsModal from './TisTargetsModal';
import { API_BASE, parseWorkbook } from '../utils/parseExcel.js';
import { stripTeacherContacts } from '../utils/sanitizeExcel.js';
import { diffByTeacher, formatChangeMessage } from '../utils/scheduleDiff.js';
import { toChangeRecords } from '../utils/changeLog.js';

const maskPhone = (phone) => `***-****-${phone.slice(-4)}`;

// 알림 방식 (VITE_NOTIFY_MODE)
//   helper (기본) 업로드하는 PC 의 발송 도우미(notify-helper/)가 비즈고 API 로 직접 보낸다
//   tis    업로드 후 알림 대상 강사를 엑셀 · 번호 복사로 TIS 에 넘긴다 (보류, 코드만 남겨 둠)
const NOTIFY_MODE = import.meta.env?.VITE_NOTIFY_MODE === 'tis' ? 'tis' : 'helper';

// 알림톡 발송 도우미 (helper 모드): 업로드하는 PC 에서 실행 (npm run notify-helper)
//   비즈고 API 는 등록된 IP 에서만 호출되므로 Worker 가 아니라 이 PC 에서 보낸다
const NOTIFY_HELPER_URL = (import.meta.env?.VITE_NOTIFY_HELPER_URL || 'http://127.0.0.1:5599').replace(/\/$/, '');

export default function AdminPanel({
  currentData,
  adminPassword,
  onLogin,
  onLogout,
  onReload,
  onCorpReload,
  corpSource,
  uploadedAt,
  source,
}) {
  const [showLogin, setShowLogin]   = useState(false);
  const [showPanel, setShowPanel]   = useState(false);
  const [password,  setPassword]    = useState('');
  const [loginErr,  setLoginErr]    = useState(null);
  const [busy,      setBusy]        = useState(false);
  const [busyMsg,   setBusyMsg]     = useState('');
  const [uploadErr, setUploadErr]   = useState(null);
  const [uploadMsg, setUploadMsg]   = useState(null);
  const [uploadWarn, setUploadWarn] = useState(null); // 업로드는 됐지만 변경 내역 저장 실패 등
  const [notifyMsg, setNotifyMsg]   = useState(null); // { ok, text, details? }
  // 업로드 전 변경 미리보기: { file, buf, requestId, items: [{ teacher, phone, changes, message, checked }] }
  const [preview,   setPreview]     = useState(null);
  // 발송 도우미 상태 (helper 모드): null = 확인 중, { connected: false } = 꺼짐, { connected: true, ok, mode, ... } = /health 응답
  const [helper,    setHelper]      = useState(null);
  // TIS 로 넘길 알림 대상 (tis 모드): { uploadedAt, items: [{ teacher, phone, changeCount, checked }] }
  //   전화번호가 들어 있으므로 이 탭의 메모리에만 둔다 (저장소 · 서버로 보내지 않음)
  const [tisTargets, setTisTargets] = useState(null);
  const [showTis,    setShowTis]    = useState(false);
  const fileRef = useRef(null);

  // 기업교육팀 (과정별 개별 파일)
  const [corpFiles,  setCorpFiles]  = useState(null); // null = 로딩 전
  const [corpErr,    setCorpErr]    = useState(null);
  const [corpMsg,    setCorpMsg]    = useState(null);
  const corpFileRef = useRef(null);

  async function refreshCorpList() {
    try {
      const res = await fetch(`${API_BASE}/api/corp/list`, { cache: 'no-store' });
      const json = await res.json().catch(() => ({}));
      setCorpFiles(Array.isArray(json.files) ? json.files : []);
    } catch {
      setCorpFiles([]);
    }
  }

  async function handleLoginSubmit(e) {
    e.preventDefault();
    setLoginErr(null);
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/login`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ password }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) throw new Error(json.error || '로그인 실패');
      onLogin(password);
      setShowLogin(false);
      setShowPanel(true);
      refreshCorpList();
      setPassword('');
    } catch (err) {
      setLoginErr(err.message);
    } finally {
      setBusy(false);
    }
  }

  // 파일 선택 → 현재 시간표와 비교해 미리보기 표시 (아직 업로드하지 않음)
  async function handleUploadFile(file) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.xlsx')) {
      setUploadErr('.xlsx 파일만 업로드할 수 있습니다.');
      return;
    }
    setUploadErr(null);
    setUploadMsg(null);
    setUploadWarn(null);
    setNotifyMsg(null);
    setBusy(true);
    setBusyMsg('변경 내용 확인 중...');
    try {
      const buf = await file.arrayBuffer();
      // 현재 시간표는 연락처가 지워진 버전 → 전화번호는 새 파일의 교강사연락처에서 가져온다
      const newData = parseWorkbook(buf, file.name, { log: false });
      const items = diffByTeacher(currentData, newData).map(t => ({
        ...t,
        message: formatChangeMessage(t.changes, { vars: { 강사명: t.teacher } }),
        checked: !!t.phone,
      }));
      // requestId: 같은 미리보기에서 보낸 요청은 재전송돼도 한 번만 발송 (도우미의 idempotencyKey)
      setPreview({ file, buf, items, requestId: crypto.randomUUID() });
      if (NOTIFY_MODE === 'helper') checkHelper();
    } catch (err) {
      setUploadErr(`파일을 읽을 수 없습니다: ${err.message}`);
    } finally {
      setBusy(false);
      setBusyMsg('');
    }
  }

  function togglePreviewTeacher(name) {
    setPreview(p => ({
      ...p,
      items: p.items.map(t => (t.teacher === name ? { ...t, checked: !t.checked } : t)),
    }));
  }

  async function uploadSchedule(file, buf) {
    // 업로드본은 공개 API(/api/schedule)로 누구나 받을 수 있으므로 연락처를 지운 사본만 올린다
    const { data, removed } = stripTeacherContacts(buf);
    const res = await fetch(`${API_BASE}/api/admin/upload`, {
      method:  'POST',
      headers: {
        'Content-Type':       'application/octet-stream',
        'X-Admin-Password':   adminPassword,
        'X-File-Name':        encodeURIComponent(file.name),
      },
      body: data,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.ok) throw new Error(json.error || '업로드 실패');
    return { ...json, removed };
  }

  // 사이트의 "최근 변경" 표시용 변경 내역 저장. 레코드에는 전화번호가 없다 (toChangeRecords)
  //   실패해도 업로드는 끝난 상태이므로 throw 하지 않고 안내 문구만 반환
  async function saveChanges(uploadedAt, records) {
    try {
      const res = await fetch(`${API_BASE}/api/admin/changes`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Password': adminPassword },
        body:    JSON.stringify({ uploadedAt, changes: records }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) return `변경 내역 저장 실패: ${json.error || res.status} (사이트의 "최근 변경"에 표시되지 않음)`;
      return null;
    } catch {
      return '변경 내역 저장 실패: 서버에 연결할 수 없음 (사이트의 "최근 변경"에 표시되지 않음)';
    }
  }

  async function checkHelper() {
    setHelper(null);
    try {
      // 도우미가 공인 IP 를 조회하느라(최대 3초) 늦을 수 있어 여유를 둔다
      const res = await fetch(`${NOTIFY_HELPER_URL}/health`, { cache: 'no-store', signal: AbortSignal.timeout(8000) });
      setHelper({ connected: true, ...(await res.json()) });
    } catch {
      setHelper({ connected: false });
    }
  }

  // 발송 도우미에 알림 발송 요청. 실패해도 throw 하지 않고 안내 문구만 반환 (업로드는 이미 끝난 상태)
  //   보내는 것은 requestId 와 강사 이름 · 번호뿐. 문구는 도우미가 등록 템플릿으로 만든다
  //   응답: { ok, mode, prepared, sent, failed, results: [{ name, phone, to?, status, code, result }] }
  async function sendNotify(recipients, requestId) {
    let res = null;
    try {
      res = await fetch(`${NOTIFY_HELPER_URL}/notify`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ requestId, recipients }),
      });
    } catch {
      // 도우미 꺼짐
    }
    const json = res ? await res.json().catch(() => null) : null;
    if (!json) {
      return { ok: false, text: '발송 도우미에 연결할 수 없어 알림을 보내지 못했습니다 — 업로드는 완료됨' };
    }
    if (!res.ok || !json.ok) {
      return { ok: false, text: `알림을 보내지 못했습니다: ${json.error || res.status} — 업로드는 완료됨`, details: json.problems };
    }
    const results = json.results.map(r => ({
      name:   r.name,
      phone:  r.to ? `${r.phone} → ${r.to}` : r.phone,
      status: r.status,
      reason: r.status === 'sent' ? `접수${r.code ? ` (${r.code})` : ''}` : r.status === 'dry-run' ? '요청만 만듦 (발송 안 함)' : `${r.result}${r.code ? ` (${r.code})` : ''}`,
    }));
    if (json.mode === 'dry-run') {
      return { ok: true, text: `DRY-RUN: 요청 ${json.prepared}건 생성, 실제 발송 없음 (요청 내용은 발송 도우미 창에 표시)`, results };
    }
    return {
      ok:   json.failed === 0,
      text: `알림 발송(${json.modeLabel}${json.testPhone ? ` · 테스트 번호 ${json.testPhone}` : ''}): 접수 ${json.sent}건, 실패 ${json.failed}건`,
      results,
    };
  }

  async function handleConfirmUpload(withNotify) {
    const { file, buf, items, requestId } = preview;
    // 도우미에는 이름과 번호만 보낸다 (변경 내용 · 문구는 보내지 않음)
    const helperRecipients = withNotify && NOTIFY_MODE === 'helper'
      ? items.filter(t => t.checked && t.phone).map(t => ({ name: t.teacher, phone: t.phone }))
      : [];
    setPreview(null);
    setBusy(true);
    setBusyMsg('업로드 중...');
    try {
      const json = await uploadSchedule(file, buf);
      setUploadMsg(`업로드 완료: ${json.fileName} (${(json.size / 1024).toFixed(1)} KB, 연락처 ${json.removed}건 제거)`);

      const records = toChangeRecords(items);
      if (records.length > 0) {
        setBusyMsg('변경 내역 저장 중...');
        setUploadWarn(await saveChanges(json.uploadedAt, records));
      }

      if (withNotify && NOTIFY_MODE === 'tis') {
        setTisTargets({
          uploadedAt: json.uploadedAt,
          items: items.map(t => ({ teacher: t.teacher, phone: t.phone, changeCount: t.changes.length, checked: !!t.phone })),
        });
        setShowTis(true);
      }
      if (helperRecipients.length > 0) {
        setBusyMsg(`알림 발송 중... (${helperRecipients.length}명)`);
        setNotifyMsg(await sendNotify(helperRecipients, requestId));
      }
      setBusyMsg('새 시간표 적용 중...');
      await onReload();
    } catch (err) {
      setUploadErr(err.message);
    } finally {
      setBusy(false);
      setBusyMsg('');
    }
  }

  async function handleResetUpload() {
    if (!confirm('업로드된 시간표를 삭제하고 기본 시간표로 되돌릴까요?')) return;
    setBusy(true);
    setBusyMsg('초기화 중...');
    setUploadErr(null);
    setUploadMsg(null);
    setUploadWarn(null);
    setNotifyMsg(null);
    try {
      const res = await fetch(`${API_BASE}/api/admin/reset`, {
        method:  'POST',
        headers: { 'X-Admin-Password': adminPassword },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) throw new Error(json.error || '초기화 실패');
      setUploadMsg('기본 시간표로 되돌렸습니다.');
      await onReload();
    } catch (err) {
      setUploadErr(err.message);
    } finally {
      setBusy(false);
      setBusyMsg('');
    }
  }

  // 기업교육팀: 여러 파일 업로드 (같은 파일명은 서버에서 교체 처리)
  async function handleCorpUploadFiles(fileList) {
    const files = [...(fileList || [])];
    if (files.length === 0) return;
    const invalid = files.find(f => !f.name.toLowerCase().endsWith('.xlsx'));
    if (invalid) {
      setCorpErr(`.xlsx 파일만 업로드할 수 있습니다: ${invalid.name}`);
      return;
    }
    const existingNames = new Set((corpFiles || []).map(f => f.fileName));
    const replaceCount = files.filter(f => existingNames.has(f.name)).length;
    const summary = [
      `기업교육팀 시간표 ${files.length}개 파일을 업로드할까요?`,
      '',
      ...files.map(f => `· ${f.name}${existingNames.has(f.name) ? ' (기존 파일 교체)' : ''}`),
      '',
      replaceCount > 0
        ? `${replaceCount}개는 같은 이름의 기존 파일을 교체합니다.`
        : null,
      '업로드 즉시 모든 사용자에게 반영됩니다.',
    ].filter(v => v !== null).join('\n');
    if (!confirm(summary)) return;
    setCorpErr(null);
    setCorpMsg(null);
    setBusy(true);
    try {
      let done = 0, replaced = 0;
      for (const file of files) {
        setBusyMsg(`기업교육팀 업로드 중... (${done + 1}/${files.length})`);
        const buf = await file.arrayBuffer();
        const res = await fetch(`${API_BASE}/api/admin/corp/upload`, {
          method:  'POST',
          headers: {
            'Content-Type':     'application/octet-stream',
            'X-Admin-Password': adminPassword,
            'X-File-Name':      encodeURIComponent(file.name),
          },
          body: buf,
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json.ok) throw new Error(`${file.name}: ${json.error || '업로드 실패'}`);
        done++;
        if (json.replaced) replaced++;
      }
      setCorpMsg(`기업교육팀 ${done}개 파일 업로드 완료${replaced > 0 ? ` (${replaced}개 교체)` : ''}`);
      setBusyMsg('기업교육팀 시간표 적용 중...');
      await refreshCorpList();
      await onCorpReload?.();
    } catch (err) {
      setCorpErr(err.message);
      await refreshCorpList();
    } finally {
      setBusy(false);
      setBusyMsg('');
    }
  }

  async function handleCorpDelete(file) {
    if (!confirm(`기업교육팀 시간표를 삭제할까요?\n\n${file.fileName}`)) return;
    setCorpErr(null);
    setCorpMsg(null);
    setBusy(true);
    setBusyMsg('삭제 중...');
    try {
      const res = await fetch(`${API_BASE}/api/admin/corp/delete`, {
        method:  'POST',
        headers: {
          'Content-Type':     'application/json',
          'X-Admin-Password': adminPassword,
        },
        body: JSON.stringify({ id: file.id }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) throw new Error(json.error || '삭제 실패');
      setCorpMsg(`삭제 완료: ${file.fileName}`);
      await refreshCorpList();
      await onCorpReload?.();
    } catch (err) {
      setCorpErr(err.message);
    } finally {
      setBusy(false);
      setBusyMsg('');
    }
  }

  function openAdmin() {
    setUploadErr(null);
    setUploadMsg(null);
    setUploadWarn(null);
    setNotifyMsg(null);
    setCorpErr(null);
    setCorpMsg(null);
    if (adminPassword) {
      setShowPanel(true);
      refreshCorpList();
    } else {
      setShowLogin(true);
    }
  }

  function closeLogin() {
    setShowLogin(false);
    setPassword('');
    setLoginErr(null);
  }

  function closePanel() {
    setShowPanel(false);
  }

  function handleLogoutClick() {
    onLogout();
    setShowPanel(false);
    setTisTargets(null);
    setShowTis(false);
  }

  function toggleTisTeacher(name) {
    setTisTargets(t => ({
      ...t,
      items: t.items.map(i => (i.teacher === name && i.phone ? { ...i, checked: !i.checked } : i)),
    }));
  }

  function toggleAllTis(checked) {
    setTisTargets(t => ({ ...t, items: t.items.map(i => (i.phone ? { ...i, checked } : i)) }));
  }

  return (
    <>
      <button
        onClick={openAdmin}
        className={[
          'flex-shrink-0 flex items-center gap-1.5 px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium rounded-lg transition-colors',
          adminPassword
            ? 'bg-blue-600 text-white hover:bg-blue-700'
            : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
        ].join(' ')}
        title={adminPassword ? '관리자 모드 (열기)' : '관리자 로그인'}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M12 11c1.657 0 3-1.343 3-3S13.657 5 12 5 9 6.343 9 8s1.343 3 3 3zm0 2c-2.67 0-8 1.337-8 4v2h16v-2c0-2.663-5.33-4-8-4z" />
        </svg>
        <span className="hidden sm:inline">{adminPassword ? '관리자' : '관리자'}</span>
      </button>

      {/* 로그인 모달 */}
      {showLogin && (
        <Modal onClose={closeLogin} title="관리자 로그인">
          <form onSubmit={handleLoginSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">비밀번호</label>
              <input
                autoFocus
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={busy}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                placeholder="관리자 비밀번호"
              />
            </div>
            {loginErr && (
              <p className="text-xs text-red-600">{loginErr}</p>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={closeLogin}
                disabled={busy}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                취소
              </button>
              <button
                type="submit"
                disabled={busy || !password}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {busy ? '확인 중...' : '로그인'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* 관리자 패널 */}
      {showPanel && adminPassword && (
        <Modal onClose={closePanel} title="관리자 패널" width="max-w-lg">
          <div className="space-y-5">
            {/* ── 훈련취업팀 · 종합시간표 ─────────────────── */}
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">훈련취업팀</span>
                <h4 className="text-sm font-semibold text-gray-800">종합시간표 (통합 파일 1개)</h4>
              </div>

              <div className="text-xs text-gray-500 space-y-0.5">
                <p>
                  현재 표시 중:{' '}
                  <span className="font-medium text-gray-700">
                    {source === 'uploaded' ? '관리자 업로드본' : '기본 내장본'}
                  </span>
                </p>
                {uploadedAt && (
                  <p>업로드 시각: {new Date(uploadedAt).toLocaleString('ko-KR')}</p>
                )}
              </div>

              <div
                onClick={() => !busy && fileRef.current?.click()}
                className="border-2 border-dashed border-gray-300 hover:border-blue-400 hover:bg-blue-50/30 rounded-xl p-4 text-center cursor-pointer transition-colors"
                onDragOver={(e) => { e.preventDefault(); }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (!busy) handleUploadFile(e.dataTransfer.files[0]);
                }}
              >
                <input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx"
                  className="hidden"
                  onChange={(e) => {
                    handleUploadFile(e.target.files[0]);
                    e.target.value = '';
                  }}
                />
                <p className="text-sm font-medium text-gray-700">
                  종합시간표 엑셀(.xlsx) 업로드
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  클릭 또는 드래그&드롭. 기존 업로드본을 대체합니다.
                </p>
                <p className="text-xs text-gray-400">
                  업로드 전 강사별 변경 내용 확인 · 교강사 연락처 자동 제거
                </p>
              </div>

              {uploadErr && <p className="text-xs text-red-600">{uploadErr}</p>}
              {uploadMsg && <p className="text-xs text-green-600">{uploadMsg}</p>}
              {uploadWarn && <p className="text-xs text-amber-600">{uploadWarn}</p>}
              {tisTargets && !showTis && (
                <button
                  onClick={() => setShowTis(true)}
                  className="text-xs px-3 py-1.5 border border-blue-600 text-blue-600 rounded-lg hover:bg-blue-50"
                >
                  알림 대상 다시 열기 ({tisTargets.items.filter(t => t.phone && t.checked).length}명)
                </button>
              )}
              {notifyMsg && (
                <div className={`text-xs ${notifyMsg.ok ? 'text-green-600' : 'text-amber-600'}`}>
                  <p>{notifyMsg.text}</p>
                  {notifyMsg.details?.length > 0 && (
                    <ul className="mt-1 list-disc pl-4 text-amber-700">
                      {notifyMsg.details.map((d, i) => <li key={i}>{d}</li>)}
                    </ul>
                  )}
                  {notifyMsg.results?.length > 0 && <NotifyResults results={notifyMsg.results} />}
                </div>
              )}

              <button
                onClick={handleResetUpload}
                disabled={busy || source !== 'uploaded'}
                className="text-xs text-gray-500 hover:text-red-600 disabled:opacity-40"
              >
                기본 시간표로 되돌리기
              </button>
            </section>

            {/* ── 기업교육팀 · 과정별 시간표 ─────────────── */}
            <section className="space-y-3 pt-4 border-t border-gray-200">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">기업교육팀</span>
                <h4 className="text-sm font-semibold text-gray-800">과정별 시간표 (과정마다 파일 1개)</h4>
              </div>

              <div
                onClick={() => !busy && corpFileRef.current?.click()}
                className="border-2 border-dashed border-gray-300 hover:border-purple-400 hover:bg-purple-50/30 rounded-xl p-4 text-center cursor-pointer transition-colors"
                onDragOver={(e) => { e.preventDefault(); }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (!busy) handleCorpUploadFiles(e.dataTransfer.files);
                }}
              >
                <input
                  ref={corpFileRef}
                  type="file"
                  accept=".xlsx"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    handleCorpUploadFiles(e.target.files);
                    e.target.value = '';
                  }}
                />
                <p className="text-sm font-medium text-gray-700">
                  훈련시간표 엑셀(.xlsx) 업로드 — 여러 파일 선택 가능
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  파일이 추가로 쌓이며, 같은 파일명을 올리면 해당 과정만 교체됩니다.
                  업로드 전 확인 창이 표시됩니다.
                </p>
              </div>

              {corpErr && <p className="text-xs text-red-600">{corpErr}</p>}
              {corpMsg && <p className="text-xs text-green-600">{corpMsg}</p>}

              {/* 업로드된 파일 목록 */}
              <div className="space-y-1.5">
                {corpFiles === null && (
                  <p className="text-xs text-gray-400">목록 불러오는 중...</p>
                )}
                {corpFiles !== null && corpFiles.length === 0 && (
                  <p className="text-xs text-gray-400">
                    업로드된 파일 없음
                    {corpSource === 'default' && ' — 현재 내장 기본 파일을 표시 중입니다. 업로드하면 업로드 목록으로 대체됩니다.'}
                  </p>
                )}
                {(corpFiles || [])
                  .slice()
                  .sort((a, b) => a.fileName.localeCompare(b.fileName, 'ko'))
                  .map(f => (
                    <div key={f.id} className="flex items-center gap-2 px-2.5 py-1.5 bg-gray-50 border border-gray-100 rounded-lg">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-gray-700 truncate" title={f.fileName}>{f.fileName}</p>
                        {f.uploadedAt && (
                          <p className="text-[10px] text-gray-400">{new Date(f.uploadedAt).toLocaleString('ko-KR')}</p>
                        )}
                      </div>
                      <button
                        onClick={() => handleCorpDelete(f)}
                        disabled={busy}
                        className="flex-shrink-0 text-[11px] px-2 py-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded disabled:opacity-40"
                        title="이 과정 시간표 삭제"
                      >
                        삭제
                      </button>
                    </div>
                  ))}
              </div>
            </section>

            {busy && (
              <p className="text-xs text-blue-600">{busyMsg || '처리 중...'}</p>
            )}

            <div className="flex justify-end items-center pt-2 border-t border-gray-100">
              <button
                onClick={handleLogoutClick}
                disabled={busy}
                className="text-xs px-3 py-1.5 text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                로그아웃
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* 업로드 전 변경 미리보기 */}
      {preview && (
        <PreviewModal
          preview={preview}
          helper={helper}
          onRecheckHelper={checkHelper}
          onToggle={togglePreviewTeacher}
          onCancel={() => setPreview(null)}
          onConfirm={handleConfirmUpload}
        />
      )}

      {/* 업로드 후 TIS 로 넘길 알림 대상 (tis 모드) */}
      {tisTargets && showTis && (
        <TisTargetsModal
          targets={tisTargets}
          onToggle={toggleTisTeacher}
          onToggleAll={toggleAllTis}
          onClose={() => setShowTis(false)}
        />
      )}
    </>
  );
}

// 발송 도우미 상태: "발송 도우미 연결됨 · dry-run · IP 정상 (x.x.x.x)" + 막힌 사유
const IP_LABEL = { ok: 'IP 정상', mismatch: 'IP 불일치', unknown: 'IP 확인 안 됨' };

function HelperStatus({ helper, onRecheck }) {
  const recheck = (
    <button onClick={onRecheck} className="ml-auto flex-shrink-0 underline hover:no-underline">다시 확인</button>
  );
  if (!helper) {
    return <p className="text-xs text-gray-400">발송 도우미 확인 중...</p>;
  }
  if (!helper.connected) {
    return (
      <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
        <div>
          <p className="font-medium">알림 발송 불가: 발송 도우미가 꺼져 있습니다</p>
          <p>
            발송 도우미를 실행해 주세요 (<code className="font-mono">npm run notify-helper</code>).
            알림 없이 업로드만 하는 것은 가능합니다.
          </p>
        </div>
        {recheck}
      </div>
    );
  }
  const ipText = `${IP_LABEL[helper.ipStatus] || 'IP 확인 안 됨'}${helper.publicIp ? ` (${helper.publicIp})` : ''}`;
  const summary = `발송 도우미 연결됨 · ${helper.mode} · ${ipText}`;
  const target = helper.mode === 'dry-run'
    ? '실제 발송 없음'
    : helper.testPhone
      ? `모든 알림을 테스트 번호 ${helper.testPhone}로만 발송`
      : '실제 강사 번호로 발송됩니다';
  const warnings = helper.warnings || [];

  if (!helper.ok) {
    return (
      <div className="flex items-start gap-2 text-xs text-red-700 bg-red-50 rounded-lg px-3 py-2">
        <div>
          <p className="font-medium">{summary}</p>
          <p className="mt-1">알림 발송 불가:</p>
          <ul className="list-disc pl-4">
            {(helper.problems || []).map((p, i) => <li key={i}>{p}</li>)}
          </ul>
        </div>
        {recheck}
      </div>
    );
  }
  const tone = helper.mode === 'production' && !helper.testPhone
    ? 'text-red-700 bg-red-50'
    : 'text-green-700 bg-green-50';
  return (
    <div className={`flex items-start gap-2 text-xs rounded-lg px-3 py-2 ${tone}`}>
      <div>
        <p className="font-medium">{summary}</p>
        <p>
          {target}
          <span className="text-gray-500"> · 템플릿 {helper.template}</span>
          {helper.limits && helper.mode !== 'dry-run' && (
            <span className="text-gray-500">
              {' '}· 이번 시간 {helper.limits.requestsLastHour}/{helper.limits.maxRequestsPerHour}회 · 오늘 {helper.limits.sentToday}/{helper.limits.maxSendsPerDay}건
            </span>
          )}
        </p>
        {warnings.length > 0 && (
          <ul className="mt-1 list-disc pl-4 text-amber-700">
            {warnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        )}
      </div>
      {recheck}
    </div>
  );
}

// 발송 결과: 강사별 성공/실패와 사유
const RESULT_STYLE = {
  sent:      ['접수', 'bg-green-100 text-green-700'],
  'dry-run': ['DRY-RUN', 'bg-gray-100 text-gray-600'],
  failed:    ['실패', 'bg-red-100 text-red-700'],
};

function NotifyResults({ results }) {
  return (
    <ul className="mt-1.5 space-y-1 text-gray-700">
      {results.map((r, i) => {
        const [label, cls] = RESULT_STYLE[r.status] || RESULT_STYLE.failed;
        return (
          <li key={i} className="flex items-start gap-2">
            <span className={`flex-shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded ${cls}`}>{label}</span>
            <span className="font-medium">{r.name}</span>
            <span className="text-gray-400">{r.phone}</span>
            <span className={r.status === 'failed' ? 'text-red-600' : 'text-gray-500'}>{r.reason}</span>
          </li>
        );
      })}
    </ul>
  );
}

function PreviewModal({ preview, helper, onRecheckHelper, onToggle, onCancel, onConfirm }) {
  const { file, items } = preview;
  const isHelper = NOTIFY_MODE === 'helper';
  const withPhoneCount = items.filter(t => t.phone).length;
  // helper 모드: 여기서 고른 강사에게 도우미가 바로 발송
  // tis 모드:    업로드 후 "알림 대상" 화면에서 고른다 (여기는 확인만)
  const checkedCount = items.filter(t => t.checked).length;
  const maxRecipients = helper?.maxRecipients ?? 50;
  const tooMany = isHelper && checkedCount > maxRecipients;
  const canNotify = isHelper
    ? checkedCount > 0 && !tooMany && !!helper?.connected && !!helper.ok
    : withPhoneCount > 0;

  return (
    <Modal onClose={onCancel} title="업로드 전 변경 내용 확인" width="max-w-2xl">
      <div className="space-y-4">
        <div className="text-xs text-gray-500 space-y-0.5">
          <p className="truncate">
            새 파일: <span className="font-medium text-gray-700">{file.name}</span>
          </p>
          <p>현재 시간표와 비교한 결과입니다. 오늘 이전 날짜의 변경은 제외됩니다.</p>
        </div>

        {items.length === 0 ? (
          <p className="py-6 text-sm text-center text-gray-500 bg-gray-50 rounded-lg">
            강사 일정 변경 없음
          </p>
        ) : (
          <div className="space-y-2">
            <div className="flex items-baseline justify-between">
              <p className="text-sm font-semibold text-gray-800">변경된 강사 {items.length}명</p>
              <p className="text-xs text-gray-500">
                {isHelper ? `알림 대상 ${checkedCount}명 선택` : `번호 있는 강사 ${withPhoneCount}명`}
              </p>
            </div>
            <div className="space-y-2 max-h-[55vh] overflow-y-auto pr-1">
              {items.map(t => (
                <div key={t.teacher} className="border border-gray-200 rounded-lg p-3 space-y-2">
                  <label className={`flex items-center gap-2 ${isHelper && t.phone ? 'cursor-pointer' : ''} ${isHelper && !t.phone ? 'cursor-not-allowed' : ''}`}>
                    {isHelper && (
                      <input
                        type="checkbox"
                        checked={t.checked}
                        disabled={!t.phone}
                        onChange={() => onToggle(t.teacher)}
                        className="w-4 h-4 accent-blue-600"
                      />
                    )}
                    <span className="text-sm font-medium text-gray-800">{t.teacher}</span>
                    {t.phone ? (
                      <span className="text-xs text-gray-500">{maskPhone(t.phone)}</span>
                    ) : (
                      <span
                        className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700"
                        title="교강사연락처 시트에 번호가 없어 알림을 보낼 수 없습니다"
                      >
                        번호 없음
                      </span>
                    )}
                    <span className="ml-auto text-[11px] text-gray-400">{t.changes.length}건</span>
                  </label>
                  <pre className="text-[11px] leading-relaxed text-gray-600 bg-gray-50 rounded p-2 whitespace-pre-wrap break-words font-sans">
                    {t.message}
                  </pre>
                </div>
              ))}
            </div>
          </div>
        )}

        {items.length > 0 && isHelper && (
          <div className="space-y-1">
            <p className="text-xs text-gray-500">
              카카오톡에는 변경 내용 없이 등록된 고정 문구와 [시간표 확인] 버튼이 갑니다. 강사는 사이트의 강사별 탭에서 바뀐 수업을 확인합니다.
            </p>
            <HelperStatus helper={helper} onRecheck={onRecheckHelper} />
            {tooMany && (
              <p className="text-xs text-red-600">한 번에 최대 {maxRecipients}명까지 알림을 보낼 수 있습니다.</p>
            )}
          </div>
        )}
        {items.length > 0 && !isHelper && (
          <p className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
            [업로드 + TIS로 알림 보내기]를 누르면 업로드한 뒤 알림 대상 강사 목록이 열립니다.
            거기서 수신자 엑셀이나 번호를 받아 TIS에서 발송하세요.
          </p>
        )}

        <div className="flex flex-wrap justify-end gap-2 pt-3 border-t border-gray-100">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
          >
            취소
          </button>
          <button
            onClick={() => onConfirm(false)}
            className="px-4 py-2 text-sm border border-blue-600 text-blue-600 rounded-lg hover:bg-blue-50"
          >
            업로드만
          </button>
          <button
            onClick={() => onConfirm(true)}
            disabled={!canNotify}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {isHelper ? '업로드 + 알림 발송' : '업로드 + TIS로 알림 보내기'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
