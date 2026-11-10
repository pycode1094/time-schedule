import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { WifiOff } from 'lucide-react';
import AppShell from './screens/AppShell.jsx';
import DesktopView from './desktop/ScheduleView.jsx';
import Screen from './ui/Screen.jsx';
import Button from './ui/Button.jsx';
import EmptyState from './ui/EmptyState.jsx';
import { ScreenSkeleton } from './ui/Skeleton.jsx';
import { loadCurrentSchedule, loadScheduleChanges } from './utils/parseExcel.js';
import { loadCorpSchedules } from './utils/parseCorpExcel.js';

const ADMIN_STORAGE_KEY = 'time-schedule-admin-password';

// 1024px 이상은 PC 화면(예전 탭 구조), 그 아래는 폰 화면(앱 스타일)
const DESKTOP_QUERY = '(min-width: 1024px)';
function subscribeDesktop(cb) {
  const mq = window.matchMedia(DESKTOP_QUERY);
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
}
function useIsDesktop() {
  return useSyncExternalStore(subscribeDesktop, () => window.matchMedia(DESKTOP_QUERY).matches, () => false);
}

export default function App() {
  const isDesktop = useIsDesktop();
  const [parsedData, setParsedData] = useState(null);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);
  const [adminPassword, setAdminPassword] = useState(
    () => sessionStorage.getItem(ADMIN_STORAGE_KEY) || null
  );
  // 기업교육팀 시간표 (없거나 로드 실패 시 null → 기존 화면 그대로)
  const [corpData, setCorpData] = useState(null);
  // 최근 업로드별 변경 내역 (강사별 탭 "최근 변경")
  const [changeLog, setChangeLog] = useState({ uploads: [] });

  const reloadCorp = useCallback(async () => {
    try {
      setCorpData(await loadCorpSchedules());
    } catch {
      setCorpData(null);
    }
  }, []);

  useEffect(() => { reloadCorp(); }, [reloadCorp]);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [data, changes] = await Promise.all([loadCurrentSchedule(), loadScheduleChanges()]);
      setParsedData(data);
      setChangeLog(changes);
    } catch (e) {
      console.error(e);
      setError(e.message || '시간표를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  function handleAdminLogin(password) {
    sessionStorage.setItem(ADMIN_STORAGE_KEY, password);
    setAdminPassword(password);
  }

  function handleAdminLogout() {
    sessionStorage.removeItem(ADMIN_STORAGE_KEY);
    setAdminPassword(null);
  }

  // 첫 로드만 전체 로딩 화면(스켈레톤). 재로드(업로드 후 등) 중에는 기존 화면을 유지해
  // 관리자 화면의 결과 메시지가 사라지지 않게 한다.
  let status = null;
  if (loading && !parsedData) {
    status = <Screen><ScreenSkeleton /></Screen>;
  } else if (error || !parsedData) {
    status = (
      <Screen>
        <EmptyState
          tone="error"
          icon={WifiOff}
          title="시간표를 불러오지 못했어요"
          description={`인터넷 연결을 확인하고 다시 시도해 주세요.${error ? ` (${error})` : ''}`}
          action={<Button onClick={reload}>다시 시도</Button>}
          className="mt-16"
        />
      </Screen>
    );
  }

  // PC 화면은 라이트 테마로 고정 (예전 화면의 색을 그대로 쓰기 때문)
  useEffect(() => {
    if (!isDesktop) return undefined;
    const root = document.documentElement;
    const prev = root.getAttribute('data-theme');
    root.setAttribute('data-theme', 'light');
    return () => {
      if (prev === null) root.removeAttribute('data-theme');
      else root.setAttribute('data-theme', prev);
    };
  }, [isDesktop]);

  if (isDesktop && !status) {
    return (
      <DesktopView
        data={parsedData}
        changeLog={changeLog}
        corpData={corpData}
        onCorpReload={reloadCorp}
        adminPassword={adminPassword}
        onAdminLogin={handleAdminLogin}
        onAdminLogout={handleAdminLogout}
        onReload={reload}
      />
    );
  }

  return (
    <AppShell
      data={parsedData}
      changeLog={changeLog}
      corpData={corpData}
      onCorpReload={reloadCorp}
      adminPassword={adminPassword}
      onAdminLogin={handleAdminLogin}
      onAdminLogout={handleAdminLogout}
      onReload={reload}
      status={status}
    />
  );
}
