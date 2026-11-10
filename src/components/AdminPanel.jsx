import { useEffect, useRef, useState } from 'react';
import { LogOut, RotateCcw, Trash2, Upload } from 'lucide-react';
import Screen from '../ui/Screen.jsx';
import Card from '../ui/Card.jsx';
import Button from '../ui/Button.jsx';
import BottomSheet from '../ui/BottomSheet.jsx';
import { Badge, Tag } from '../ui/Chip.jsx';
import { ScreenSkeleton } from '../ui/Skeleton.jsx';
import { goBack } from '../lib/router.js';
import TisTargetsModal from './TisTargetsModal';
import { API_BASE, parseWorkbook } from '../utils/parseExcel.js';
import { stripTeacherContacts } from '../utils/sanitizeExcel.js';
import { diffByTeacher, formatChangeMessage } from '../utils/scheduleDiff.js';
import { toChangeRecords } from '../utils/changeLog.js';
import { toNotifyChanges } from '../utils/notifyChanges.js';

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
  // 업로드 전 변경 미리보기: { file, buf, requestId, items: [{ teacher, phone, changes, notify, message, checked }] }
  //   notify: 도우미에 보낼 구조화된 변경 값 { changes, moreChanges } (toNotifyChanges)
  const [preview,   setPreview]     = useState(null);
  // 발송 도우미 상태 (helper 모드): null = 확인 중, { connected: false } = 꺼짐, { connected: true, ok, mode, ... } = /health 응답
  const [helper,    setHelper]      = useState(null);
  // 도우미가 만든 강사별 실제 발송 문구 (/preview): null = 확인 전 · 중, { error } | { buttons, byTeacher: { 이름: { text } | { code, result } } }
  const [sendTexts, setSendTexts]   = useState(null);
  // TIS 로 넘길 알림 대상 (tis 모드): { uploadedAt, items: [{ teacher, phone, changeCount, checked }] }
  //   전화번호가 들어 있으므로 이 탭의 메모리에만 둔다 (저장소 · 서버로 보내지 않음)
  const [tisTargets, setTisTargets] = useState(null);
  const [showTis,    setShowTis]    = useState(false);
  const fileRef = useRef(null);
  const helperCheckSeq = useRef(0);

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
        notify:  toNotifyChanges(t.changes),
        message: formatChangeMessage(t.changes, { vars: { 강사명: t.teacher } }),
        checked: !!t.phone,
      }));
      // requestId: 같은 미리보기에서 보낸 요청은 재전송돼도 한 번만 발송 (도우미의 idempotencyKey)
      setPreview({ file, buf, items, requestId: crypto.randomUUID() });
      if (NOTIFY_MODE === 'helper') checkHelper(items);
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

  // 도우미 상태 확인 → 연결되면 번호 있는 강사의 실제 발송 문구를 받아 온다
  //   늦게 온 이전 확인 결과가 새 미리보기를 덮어쓰지 않게 순번으로 거른다
  async function checkHelper(items) {
    const seq = ++helperCheckSeq.current;
    setHelper(null);
    setSendTexts(null);
    let health;
    try {
      // 도우미가 공인 IP 를 조회하느라(최대 3초) 늦을 수 있어 여유를 둔다
      const res = await fetch(`${NOTIFY_HELPER_URL}/health`, { cache: 'no-store', signal: AbortSignal.timeout(8000) });
      health = { connected: true, ...(await res.json()) };
    } catch {
      health = { connected: false };
    }
    if (seq !== helperCheckSeq.current) return;
    setHelper(health);
    if (!health.connected) return;
    const texts = await fetchSendTexts(items);
    if (seq === helperCheckSeq.current) setSendTexts(texts);
  }

  // 도우미 /preview: 강사별로 실제 발송될 문구 (보내지 않음). 번호는 보내지 않는다
  async function fetchSendTexts(items) {
    const targets = items.filter(t => t.phone);
    if (targets.length === 0) return { byTeacher: {} };
    try {
      const res = await fetch(`${NOTIFY_HELPER_URL}/preview`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ recipients: targets.map(t => ({ name: t.teacher, ...t.notify })) }),
        signal:  AbortSignal.timeout(8000),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        return { error: res.status === 404 ? '발송 도우미가 문구 미리보기를 지원하지 않습니다. 도우미를 최신 버전으로 바꿔 주세요' : (json?.error || `HTTP ${res.status}`) };
      }
      // 결과는 보낸 순서대로 온다 (이름 형식 오류면 name 이 바뀌므로 순서로 맞춘다)
      return { buttons: json.buttons || [], byTeacher: Object.fromEntries(targets.map((t, i) => [t.teacher, json.results[i] || {}])) };
    } catch {
      return { error: '발송 도우미에서 문구를 받아 오지 못했습니다' };
    }
  }

  // 발송 도우미에 알림 발송 요청. 실패해도 throw 하지 않고 안내 문구만 반환 (업로드는 이미 끝난 상태)
  //   보내는 것은 requestId 와 강사 이름 · 번호 · 구조화된 변경 값뿐. 문구는 도우미가 등록 템플릿으로 만든다
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
    // 도우미에는 이름 · 번호 · 구조화된 변경 값만 보낸다 (문구는 보내지 않음)
    const helperRecipients = withNotify && NOTIFY_MODE === 'helper'
      ? items.filter(t => t.checked && t.phone).map(t => ({ name: t.teacher, phone: t.phone, ...t.notify }))
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

  // 전체 페이지(#/admin)로 열릴 때: 예전 [관리자] 버튼을 누른 것과 같은 준비
  //   (로그인돼 있으면 패널 + 기업교육 목록, 아니면 로그인 입력)
  useEffect(() => {
    openAdmin();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function leavePage() {
    closeLogin();
    closePanel();
    goBack('/more');
  }

  return (
    <Screen title="관리자" onBack={leavePage}>
      {!adminPassword ? (
        <div className="max-w-md">
          <h1 className="text-title1 text-ink">관리자 로그인</h1>
          <p className="mt-1.5 text-body text-ink-2">시간표를 올리고 강사님께 알림을 보내는 곳이에요.</p>
          <form onSubmit={handleLoginSubmit} className="mt-6 space-y-4">
            <label className="block">
              <span className="mb-2 block text-label font-semibold text-ink-2">비밀번호</span>
              <input
                autoFocus={showLogin}
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={busy}
                className="w-full h-14 px-4 rounded-input bg-surface text-body text-ink placeholder:text-ink-2 outline-none focus:ring-2 focus:ring-[var(--ring)]"
                placeholder="관리자 비밀번호"
              />
            </label>
            {loginErr && <p role="alert" className="text-label font-semibold text-del">{loginErr}</p>}
            <Button type="submit" size="lg" block disabled={busy || !password}>
              {busy ? '확인 중...' : '로그인'}
            </Button>
          </form>
        </div>
      ) : !showPanel ? (
        <ScreenSkeleton label="관리자 화면을 여는 중이에요" />
      ) : (
        <div className="space-y-4">
          <h1 className="text-title1 text-ink">관리자</h1>

          {/* ── 훈련취업팀 · 종합시간표 ─────────────────── */}
          <Card>
            <Tag>훈련취업팀</Tag>
            <h2 className="mt-2 text-title2 text-ink">종합시간표</h2>
            <p className="mt-1 text-label text-ink-2">통합 파일 1개예요. 올리기 전에 강사별 변경 내용을 확인하고, 교강사 연락처는 자동으로 지워요.</p>
            <dl className="mt-4 divide-y divide-line rounded-[14px] bg-fill px-4">
              <div className="flex items-center justify-between gap-3 py-3 text-label">
                <dt className="text-ink-2">지금 보여 주는 시간표</dt>
                <dd className="font-semibold text-ink">{source === 'uploaded' ? '관리자 업로드본' : '기본 내장본'}</dd>
              </div>
              {uploadedAt && (
                <div className="flex items-center justify-between gap-3 py-3 text-label">
                  <dt className="text-ink-2">업로드 시각</dt>
                  <dd className="font-semibold text-ink tabular">{new Date(uploadedAt).toLocaleString('ko-KR')}</dd>
                </div>
              )}
            </dl>

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
            <div
              onClick={() => !busy && fileRef.current?.click()}
              className="mt-4 hidden lg:flex flex-col items-center justify-center gap-1 rounded-[16px] border-2 border-dashed border-line p-6 text-center cursor-pointer hover:bg-fill/60"
              onDragOver={(e) => { e.preventDefault(); }}
              onDrop={(e) => {
                e.preventDefault();
                if (!busy) handleUploadFile(e.dataTransfer.files[0]);
              }}
            >
              <Upload aria-hidden="true" className="w-6 h-6 text-ink-3" />
              <p className="text-body font-semibold text-ink">엑셀 파일을 여기로 끌어다 놓아도 돼요</p>
              <p className="text-label text-ink-2">.xlsx · 기존 업로드본을 대체해요</p>
            </div>
            <Button size="lg" block className="mt-4" disabled={busy} onClick={() => !busy && fileRef.current?.click()}>
              <Upload aria-hidden="true" className="w-5 h-5" />
              종합시간표 엑셀 올리기
            </Button>

            <div className="mt-3 space-y-2">
              {uploadErr && <Note tone="error">{uploadErr}</Note>}
              {uploadMsg && <Note tone="ok">{uploadMsg}</Note>}
              {uploadWarn && <Note tone="warn">{uploadWarn}</Note>}
              {tisTargets && !showTis && (
                <Button variant="secondary" size="sm" onClick={() => setShowTis(true)}>
                  알림 대상 다시 열기 ({tisTargets.items.filter(t => t.phone && t.checked).length}명)
                </Button>
              )}
              {notifyMsg && (
                <Note tone={notifyMsg.ok ? 'ok' : 'warn'}>
                  <p className="font-semibold">{notifyMsg.text}</p>
                  {notifyMsg.details?.length > 0 && (
                    <ul className="mt-1 list-disc pl-5">
                      {notifyMsg.details.map((d, i) => <li key={i}>{d}</li>)}
                    </ul>
                  )}
                  {notifyMsg.results?.length > 0 && <NotifyResults results={notifyMsg.results} />}
                </Note>
              )}
            </div>

            <Button variant="ghost" size="sm" className="mt-3 -ml-2 hover:text-del" onClick={handleResetUpload} disabled={busy || source !== 'uploaded'}>
              <RotateCcw aria-hidden="true" className="w-4 h-4" />
              기본 시간표로 되돌리기
            </Button>
          </Card>

          {/* ── 기업교육팀 · 과정별 시간표 ─────────────── */}
          <Card>
            <Tag>기업교육팀</Tag>
            <h2 className="mt-2 text-title2 text-ink">과정별 시간표</h2>
            <p className="mt-1 text-label text-ink-2">과정마다 파일 1개예요. 파일이 쌓이고, 같은 파일명을 올리면 그 과정만 바뀌어요. 올리기 전에 확인 창이 떠요.</p>

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
            <div
              onClick={() => !busy && corpFileRef.current?.click()}
              className="mt-4 hidden lg:flex flex-col items-center justify-center gap-1 rounded-[16px] border-2 border-dashed border-line p-6 text-center cursor-pointer hover:bg-fill/60"
              onDragOver={(e) => { e.preventDefault(); }}
              onDrop={(e) => {
                e.preventDefault();
                if (!busy) handleCorpUploadFiles(e.dataTransfer.files);
              }}
            >
              <Upload aria-hidden="true" className="w-6 h-6 text-ink-3" />
              <p className="text-body font-semibold text-ink">훈련시간표 엑셀을 여기로 끌어다 놓아도 돼요</p>
              <p className="text-label text-ink-2">.xlsx · 여러 파일을 한 번에 올릴 수 있어요</p>
            </div>
            <Button variant="secondary" size="lg" block className="mt-4" disabled={busy} onClick={() => !busy && corpFileRef.current?.click()}>
              <Upload aria-hidden="true" className="w-5 h-5" />
              훈련시간표 엑셀 올리기
            </Button>

            <div className="mt-3 space-y-2">
              {corpErr && <Note tone="error">{corpErr}</Note>}
              {corpMsg && <Note tone="ok">{corpMsg}</Note>}
            </div>

            {/* 업로드된 파일 목록 */}
            <div className="mt-4">
              {corpFiles === null && <p className="text-label text-ink-2">목록을 불러오고 있어요...</p>}
              {corpFiles !== null && corpFiles.length === 0 && (
                <p className="text-label text-ink-2">
                  올라온 파일이 없어요
                  {corpSource === 'default' && ' — 지금은 내장 기본 파일을 보여 주고 있어요. 올리면 업로드 목록으로 바뀌어요.'}
                </p>
              )}
              {corpFiles?.length > 0 && (
                <ul className="divide-y divide-line rounded-[14px] bg-fill">
                  {(corpFiles || [])
                    .slice()
                    .sort((a, b) => a.fileName.localeCompare(b.fileName, 'ko'))
                    .map(f => (
                      <li key={f.id} className="flex items-center gap-3 px-4 py-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-label font-semibold text-ink">{f.fileName}</p>
                          {f.uploadedAt && (
                            <p className="text-caption text-ink-2 tabular">{new Date(f.uploadedAt).toLocaleString('ko-KR')}</p>
                          )}
                        </div>
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => handleCorpDelete(f)}
                          disabled={busy}
                          aria-label={`${f.fileName} 삭제`}
                        >
                          <Trash2 aria-hidden="true" className="w-4 h-4" />
                          삭제
                        </Button>
                      </li>
                    ))}
                </ul>
              )}
            </div>
          </Card>

          <Button variant="surface" onClick={handleLogoutClick} disabled={busy}>
            <LogOut aria-hidden="true" className="w-5 h-5" />
            로그아웃
          </Button>
        </div>
      )}

      {/* 처리 중 안내 (화면 아래 작은 알림) */}
      {busy && (
        <div
          role="status"
          aria-live="polite"
          className="fixed inset-x-0 bottom-[calc(72px+env(safe-area-inset-bottom))] lg:bottom-8 z-[60] mx-auto w-fit max-w-[90vw] rounded-full bg-ink px-5 py-3 text-label font-semibold text-surface shadow-[var(--shadow-pop)] lg:ml-[calc(50%+120px)] lg:-translate-x-1/2"
        >
          {busyMsg || '처리 중...'}
        </div>
      )}

      {/* 업로드 전 변경 미리보기 */}
      {preview && (
        <PreviewModal
          preview={preview}
          helper={helper}
          sendTexts={sendTexts}
          onRecheckHelper={() => checkHelper(preview.items)}
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
    </Screen>
  );
}

// 결과 · 오류 안내 상자
const NOTE_TONE = {
  ok: 'bg-add-weak text-ink',
  warn: 'bg-mod-weak text-ink',
  error: 'bg-del-weak text-del',
};
function Note({ tone, children }) {
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`rounded-[14px] px-4 py-3 text-label ${NOTE_TONE[tone]}`}>
      {children}
    </div>
  );
}

// 발송 도우미 상태: 한 줄 칩 "연결됨 · dry-run · IP 정상" + 대상 · 템플릿 · 한도 + 막힌 사유
const IP_LABEL = { ok: 'IP 정상', mismatch: 'IP 불일치', unknown: 'IP 확인 안 됨' };

function HelperStatus({ helper, onRecheck }) {
  const recheck = (
    <button type="button" onClick={onRecheck} className="press ml-auto flex-shrink-0 min-h-11 px-3 rounded-full text-label font-semibold text-primary-ink hover:bg-surface">
      다시 확인
    </button>
  );
  if (!helper) {
    return <p role="status" className="text-label text-ink-2">발송 도우미 확인 중...</p>;
  }
  if (!helper.connected) {
    return (
      <div className="rounded-[14px] bg-mod-weak px-4 py-3 text-label text-ink">
        <div className="flex flex-wrap items-center gap-2">
          <StatusChip dot="bg-mod">발송 도우미 꺼짐</StatusChip>
          {recheck}
        </div>
        <p className="mt-2 font-semibold">알림 발송 불가: 발송 도우미가 꺼져 있습니다</p>
        <p className="text-ink-2">
          발송 도우미를 실행해 주세요 (<code className="font-mono">npm run notify-helper</code>).
          알림 없이 업로드만 하는 것은 가능합니다.
        </p>
      </div>
    );
  }
  const ipText = `${IP_LABEL[helper.ipStatus] || 'IP 확인 안 됨'}${helper.publicIp ? ` (${helper.publicIp})` : ''}`;
  const summary = `발송 도우미 연결됨 · ${helper.mode} · ${ipText}`;
  const chipText = `연결됨 · ${helper.mode} · ${IP_LABEL[helper.ipStatus] || 'IP 확인 안 됨'}`;
  const target = helper.mode === 'dry-run'
    ? '실제 발송 없음'
    : helper.testPhone
      ? `모든 알림을 테스트 번호 ${helper.testPhone}로만 발송`
      : '실제 강사 번호로 발송됩니다';
  const warnings = helper.warnings || [];

  if (!helper.ok) {
    return (
      <div className="rounded-[14px] bg-del-weak px-4 py-3 text-label text-ink">
        <div className="flex flex-wrap items-center gap-2">
          <StatusChip dot="bg-del" title={summary}>{chipText}</StatusChip>
          {recheck}
        </div>
        <p className="mt-2 font-semibold text-del">알림 발송 불가:</p>
        <ul className="list-disc pl-5">
          {(helper.problems || []).map((p, i) => <li key={i}>{p}</li>)}
        </ul>
      </div>
    );
  }
  const tone = helper.mode === 'production' && !helper.testPhone
    ? 'bg-del-weak'
    : 'bg-add-weak';
  return (
    <div className={`rounded-[14px] px-4 py-3 text-label text-ink ${tone}`}>
      <div className="flex flex-wrap items-center gap-2">
        <StatusChip dot={helper.mode === 'production' && !helper.testPhone ? 'bg-del' : 'bg-add'} title={summary}>{chipText}</StatusChip>
        {recheck}
      </div>
      <p className="mt-2">
        <span className="font-semibold">{target}</span>
        <span className="text-ink-2"> · 템플릿 {helper.template}</span>
        {helper.limits && helper.mode !== 'dry-run' && (
          <span className="text-ink-2">
            {' '}· 이번 시간 {helper.limits.requestsLastHour}/{helper.limits.maxRequestsPerHour}회 · 오늘 {helper.limits.sentToday}/{helper.limits.maxSendsPerDay}건
          </span>
        )}
      </p>
      {warnings.length > 0 && (
        <ul className="mt-1 list-disc pl-5 text-mod">
          {warnings.map((w, i) => <li key={i}>{w}</li>)}
        </ul>
      )}
    </div>
  );
}

function StatusChip({ dot, title, children }) {
  return (
    <span title={title} className="inline-flex items-center gap-2 rounded-full bg-surface px-3 py-1.5 text-label font-semibold text-ink">
      <span aria-hidden="true" className={`w-2 h-2 rounded-full ${dot}`} />
      {children}
    </span>
  );
}

// 발송 결과: 강사별 성공/실패와 사유
const RESULT_STYLE = {
  sent:      ['접수', 'added'],
  'dry-run': ['DRY-RUN', 'neutral'],
  failed:    ['실패', 'removed'],
};

function NotifyResults({ results }) {
  return (
    <ul className="mt-2 space-y-1.5">
      {results.map((r, i) => {
        const [label, tone] = RESULT_STYLE[r.status] || RESULT_STYLE.failed;
        return (
          <li key={i} className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <Badge tone={tone}>{label}</Badge>
            <span className="font-semibold text-ink">{r.name}</span>
            <span className="text-ink-2 tabular">{r.phone}</span>
            <span className={r.status === 'failed' ? 'text-del' : 'text-ink-2'}>{r.reason}</span>
          </li>
        );
      })}
    </ul>
  );
}

// 도우미가 만든 실제 발송 문구 (카카오톡에 가는 그대로) — 노란 칸
function SendText({ helper, sendTexts, result }) {
  let body;
  if (!helper?.connected) {
    body = <p>발송 도우미가 연결되면 실제 발송 문구가 표시됩니다</p>;
  } else if (!sendTexts) {
    body = <p>발송 문구 불러오는 중...</p>;
  } else if (sendTexts.error) {
    body = <p className="font-semibold text-del">{sendTexts.error}</p>;
  } else if (result?.text) {
    body = (
      <>
        <pre className="whitespace-pre-wrap break-words font-sans">{result.text}</pre>
        {sendTexts.buttons.map((b, i) => (
          <span key={i} className="inline-block mt-2 mr-1 px-3 py-1 rounded-[10px] border border-kakao-line bg-surface text-label font-semibold text-ink">{b}</span>
        ))}
      </>
    );
  } else {
    body = (
      <p className="font-semibold text-del">
        보내지 않음: {result?.result || '문구를 만들 수 없습니다'}{result?.code ? ` (${result.code})` : ''}
      </p>
    );
  }
  return (
    <div className="rounded-[12px] border border-kakao-line bg-kakao p-3 text-label leading-relaxed text-kakao-ink">
      <p className="mb-1 text-caption font-bold">카카오톡 발송 문구</p>
      {body}
    </div>
  );
}

function PreviewModal({ preview, helper, sendTexts, onRecheckHelper, onToggle, onCancel, onConfirm }) {
  const { file, items } = preview;
  const isHelper = NOTIFY_MODE === 'helper';
  const withPhoneCount = items.filter(t => t.phone).length;
  // helper 모드: 여기서 고른 강사에게 도우미가 바로 발송 (실제 발송 문구를 받아 온 뒤에만)
  // tis 모드:    업로드 후 "알림 대상" 화면에서 고른다 (여기는 확인만)
  const checkedCount = items.filter(t => t.checked).length;
  const maxRecipients = helper?.maxRecipients ?? 50;
  const tooMany = isHelper && checkedCount > maxRecipients;
  const canNotify = isHelper
    ? checkedCount > 0 && !tooMany && !!helper?.connected && !!helper.ok && !!sendTexts && !sendTexts.error
    : withPhoneCount > 0;

  return (
    <BottomSheet
      open
      onClose={onCancel}
      title="업로드 전 변경 내용 확인"
      subtitle={`새 파일: ${file.name}`}
      closeLabel="취소하고 닫기"
      full
      width="lg:max-w-[720px]"
      footer={(
        <div className="space-y-2">
          <Button size="lg" block onClick={() => onConfirm(true)} disabled={!canNotify}>
            {isHelper ? '업로드 + 알림 발송' : '업로드 + TIS로 알림 보내기'}
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="neutral" onClick={onCancel}>취소</Button>
            <Button variant="secondary" onClick={() => onConfirm(false)}>업로드만</Button>
          </div>
        </div>
      )}
    >
      <p className="text-label text-ink-2">현재 시간표와 비교한 결과입니다. 오늘 이전 날짜의 변경은 제외됩니다.</p>

      {items.length === 0 ? (
        <p className="mt-4 rounded-[14px] bg-fill py-8 text-center text-body text-ink-2">강사 일정 변경 없음</p>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-[16px] bg-fill p-4">
              <p className="text-label text-ink-2">변경된 강사</p>
              <p className="mt-0.5 text-display text-ink tabular">{items.length}<span className="ml-1 text-title3">명</span></p>
            </div>
            <div className="rounded-[16px] bg-primary-weak p-4">
              <p className="text-label text-ink-2">{isHelper ? '알림 대상 선택' : '번호 있는 강사'}</p>
              <p className="mt-0.5 text-display text-primary-ink tabular">{isHelper ? checkedCount : withPhoneCount}<span className="ml-1 text-title3">명</span></p>
            </div>
          </div>
          <ul className="mt-4 space-y-3">
            {items.map(t => (
              <li key={t.teacher} className="rounded-[16px] bg-fill p-4 space-y-3">
                <label className={`flex items-center gap-3 min-h-11 ${isHelper && t.phone ? 'cursor-pointer' : ''} ${isHelper && !t.phone ? 'cursor-not-allowed' : ''}`}>
                  {isHelper && (
                    <input
                      type="checkbox"
                      checked={t.checked}
                      disabled={!t.phone}
                      onChange={() => onToggle(t.teacher)}
                      className="w-5 h-5 accent-[var(--primary)]"
                    />
                  )}
                  <span className="text-body font-semibold text-ink">{t.teacher}</span>
                  {t.phone ? (
                    <span className="text-label text-ink-2 tabular">{maskPhone(t.phone)}</span>
                  ) : (
                    <span title="교강사연락처 시트에 번호가 없어 알림을 보낼 수 없습니다">
                      <Badge tone="changed">번호 없음</Badge>
                    </span>
                  )}
                  <span className="ml-auto text-label text-ink-2">{t.changes.length}건</span>
                </label>
                <pre className="rounded-[12px] bg-surface p-3 text-label leading-relaxed text-ink-2 whitespace-pre-wrap break-words font-sans">
                  {t.message}
                </pre>
                {isHelper && t.phone && (
                  <SendText helper={helper} sendTexts={sendTexts} result={sendTexts?.byTeacher?.[t.teacher]} />
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      {items.length > 0 && isHelper && (
        <div className="mt-4 space-y-3">
          <p className="text-label text-ink-2">
            카카오톡에는 강사마다 노란 칸의 문구가 [시간표 확인] 버튼과 함께 갑니다.
            문구는 발송 도우미가 등록 템플릿{helper?.template ? `(${helper.template})` : ''}으로 만듭니다.
            {helper?.usesChanges && ' 변경 내용은 최대 5줄이고, 오늘 이전 날짜는 빠집니다.'}
            {' '}강사는 사이트의 강사 화면에서 자세한 변경을 확인합니다.
          </p>
          <HelperStatus helper={helper} onRecheck={onRecheckHelper} />
          {tooMany && (
            <p role="alert" className="text-label font-semibold text-del">한 번에 최대 {maxRecipients}명까지 알림을 보낼 수 있습니다.</p>
          )}
        </div>
      )}
      {items.length > 0 && !isHelper && (
        <p className="mt-4 rounded-[14px] bg-fill px-4 py-3 text-label text-ink-2">
          [업로드 + TIS로 알림 보내기]를 누르면 업로드한 뒤 알림 대상 강사 목록이 열립니다.
          거기서 수신자 엑셀이나 번호를 받아 TIS에서 발송하세요.
        </p>
      )}
    </BottomSheet>
  );
}
