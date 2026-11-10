import { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import ByCourseTab from './ByCourseTab';
import ByDateTab from './ByDateTab';
import ByTeacherTab from './ByTeacherTab';
import ByRoomTab from './ByRoomTab';
import WeeklyOverviewTab from './WeeklyOverviewTab';
import CorpScheduleTab from './CorpScheduleTab';
import AdminPanel from '../components/AdminPanel.jsx';
import { useRoute, navigate } from '../lib/router.js';
import { getUrlTeacher, setUrlTeacher } from '../utils/urlState.js';

// ─────────────────────────────────────────────────────────────
// PC 화면 (1024px 이상)
//   예전 구조 그대로: 헤더 + 탭(전체 주간 · 날짜별 · 강사별 · 강의실별 · 과정별 · 기업교육)
//   디자인만 정리 (연한 표 머리줄, 잘리지 않는 글자, 오늘 강조)
//   관리자: 폰과 같은 관리자 화면(#/admin)을 가운데 열로 보여 준다
// ─────────────────────────────────────────────────────────────
const TABS = [
  { id: 'weekly',     label: '전체 주간' },
  { id: 'by-date',    label: '날짜별' },
  { id: 'by-teacher', label: '강사별' },
  { id: 'by-room',    label: '강의실별' },
  { id: 'by-course',  label: '과정별' },
  { id: 'corp',       label: '기업교육' },
];

export default function ScheduleView({ data, changeLog, corpData, onCorpReload, adminPassword, onAdminLogin, onAdminLogout, onReload }) {
  const route = useRoute();
  const isAdmin = route.segments[0] === 'admin';

  // ?teacher=이름 으로 들어오면 강사별 탭부터
  const [activeTab, setActiveTab] = useState(() => (getUrlTeacher() ? 'by-teacher' : 'weekly'));

  function selectTab(id) {
    if (isAdmin) navigate('/', { replace: true });
    setActiveTab(id);
    if (id !== 'by-teacher') setUrlTeacher(null);
  }

  useEffect(() => { window.scrollTo(0, 0); }, [isAdmin]);

  const { meta, courses, teachers, schedule } = data;

  return (
    <div className="desk min-h-screen bg-[#F2F4F6] flex flex-col">
      {/* ── 헤더 ──────────────────────────────────────── */}
      <header className="bg-white border-b border-[#E5E8EB]">
        <div className="max-w-[1376px] mx-auto px-8 pt-5">
          <div className="flex items-center gap-5">
            <button type="button" onClick={() => selectTab('weekly')} className="text-left">
              <p className="text-xs font-semibold text-[#6B7684]">대한상공회의소 부산인력개발원</p>
              <h1 className="text-[22px] font-bold text-[#191F28] leading-tight">종합시간표</h1>
            </button>
            <div className="pl-5 border-l border-[#E5E8EB] text-[13px] leading-relaxed text-[#6B7684] min-w-0">
              <p className="truncate">{meta.fileName}</p>
              <p className="tabular">
                <b className="font-semibold text-[#4E5968]">{courses.length}</b>개 과정 · <b className="font-semibold text-[#4E5968]">{teachers.length}</b>명 강사 · {meta.dateRange.start} ~ {meta.dateRange.end}
              </p>
            </div>
            <div className="flex-1" />
            <button
              type="button"
              onClick={() => (isAdmin ? navigate('/', { replace: true }) : navigate('/admin'))}
              className={`inline-flex items-center gap-1.5 h-10 px-4 rounded-xl border text-sm font-semibold transition-colors ${isAdmin ? 'border-[#1B64DA] bg-[#E8F0FD] text-[#1B64DA]' : 'border-[#E5E8EB] bg-white text-[#4E5968] hover:bg-[#F2F4F6]'}`}
            >
              <ShieldCheck aria-hidden="true" className="w-4 h-4" />
              관리자
            </button>
          </div>

          {/* ── 탭 바 ──────────────────────────────────── */}
          <nav className="flex gap-7 mt-4" aria-label="시간표 보기">
            {TABS.map(tab => {
              const on = !isAdmin && activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => selectTab(tab.id)}
                  aria-current={on ? 'page' : undefined}
                  className={[
                    'pt-2.5 pb-3 text-[15px] font-semibold border-b-2 transition-colors whitespace-nowrap',
                    on ? 'border-[#191F28] text-[#191F28]' : 'border-transparent text-[#6B7684] hover:text-[#191F28]',
                  ].join(' ')}
                >
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      {/* ── 콘텐츠 ─────────────────────────────────────── */}
      <main className="flex-1 max-w-[1376px] mx-auto w-full px-8 py-6">
        {isAdmin ? (
          <div className="mx-auto max-w-[760px]">
            <AdminPanel
              currentData={data}
              adminPassword={adminPassword}
              onLogin={onAdminLogin}
              onLogout={onAdminLogout}
              onReload={onReload}
              onCorpReload={onCorpReload}
              corpSource={corpData?.source}
              uploadedAt={meta.uploadedAt}
              source={meta.source}
            />
          </div>
        ) : (
          <>
            {activeTab === 'by-course' && <ByCourseTab courses={courses} schedule={schedule} />}
            {activeTab === 'by-date' && <ByDateTab courses={courses} schedule={schedule} />}
            {activeTab === 'by-teacher' && (
              <ByTeacherTab courses={courses} teachers={teachers} schedule={schedule} changeLog={changeLog} />
            )}
            {activeTab === 'by-room' && <ByRoomTab courses={courses} schedule={schedule} corpData={corpData} />}
            {activeTab === 'weekly' && <WeeklyOverviewTab courses={courses} schedule={schedule} />}
            {activeTab === 'corp' && <CorpScheduleTab corpData={corpData} />}
          </>
        )}
      </main>
    </div>
  );
}
