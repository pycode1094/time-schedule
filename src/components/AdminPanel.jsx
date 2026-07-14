import { useRef, useState } from 'react';
import { API_BASE } from '../utils/parseExcel.js';

export default function AdminPanel({
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

  async function handleUploadFile(file) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.xlsx')) {
      setUploadErr('.xlsx 파일만 업로드할 수 있습니다.');
      return;
    }
    setUploadErr(null);
    setUploadMsg(null);
    setBusy(true);
    setBusyMsg('업로드 중...');
    try {
      const buf = await file.arrayBuffer();
      const res = await fetch(`${API_BASE}/api/admin/upload`, {
        method:  'POST',
        headers: {
          'Content-Type':       'application/octet-stream',
          'X-Admin-Password':   adminPassword,
          'X-File-Name':        encodeURIComponent(file.name),
        },
        body: buf,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) throw new Error(json.error || '업로드 실패');
      setUploadMsg(`업로드 완료: ${json.fileName} (${(json.size / 1024).toFixed(1)} KB)`);
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
              </div>

              {uploadErr && <p className="text-xs text-red-600">{uploadErr}</p>}
              {uploadMsg && <p className="text-xs text-green-600">{uploadMsg}</p>}

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
    </>
  );
}

function Modal({ children, onClose, title, width = 'max-w-sm' }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/40">
      <div className={`bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full ${width} p-4 sm:p-5 max-h-[90vh] overflow-y-auto`}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-semibold text-gray-800">{title}</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1 -m-1"
            aria-label="닫기"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
