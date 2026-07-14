import { useCallback, useEffect, useState } from 'react';
import ScheduleView from './components/ScheduleView';
import { loadCurrentSchedule } from './utils/parseExcel.js';
import { loadCorpSchedules } from './utils/parseCorpExcel.js';

const ADMIN_STORAGE_KEY = 'time-schedule-admin-password';

export default function App() {
  const [parsedData, setParsedData] = useState(null);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);
  const [adminPassword, setAdminPassword] = useState(
    () => sessionStorage.getItem(ADMIN_STORAGE_KEY) || null
  );
  // 기업교육팀 시간표 (없거나 로드 실패 시 null → 기존 화면 그대로)
  const [corpData, setCorpData] = useState(null);

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
      const data = await loadCurrentSchedule();
      setParsedData(data);
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

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-100">
            <svg className="w-8 h-8 text-blue-600 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
          <p className="text-lg font-medium text-gray-700">시간표를 불러오고 있습니다...</p>
        </div>
      </div>
    );
  }

  if (error || !parsedData) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white border border-red-200 rounded-2xl p-6 space-y-3 text-center">
          <h2 className="text-lg font-semibold text-red-600">시간표를 불러올 수 없습니다</h2>
          <p className="text-sm text-gray-600">{error || '알 수 없는 오류'}</p>
          <button
            onClick={reload}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
          >
            다시 시도
          </button>
        </div>
      </div>
    );
  }

  return (
    <ScheduleView
      data={parsedData}
      corpData={corpData}
      onCorpReload={reloadCorp}
      adminPassword={adminPassword}
      onAdminLogin={handleAdminLogin}
      onAdminLogout={handleAdminLogout}
      onReload={reload}
    />
  );
}
