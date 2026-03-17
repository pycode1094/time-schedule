import { useState } from 'react';
import ByCourseTab from './ByCourseTab';
import ByDateTab from './ByDateTab';
import ByTeacherTab from './ByTeacherTab';
import WeeklyOverviewTab from './WeeklyOverviewTab';

const TABS = [
  { id: 'by-course',  label: '과정별' },
  { id: 'by-date',    label: '날짜별' },
  { id: 'by-teacher', label: '강사별' },
  { id: 'weekly',     label: '전체 주간' },
];

export default function ScheduleView({ data, onReset }) {
  const [activeTab, setActiveTab] = useState('by-course');

  const { meta, courses, teachers, schedule } = data;
  const totalDates = Object.keys(schedule).length;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* ── 헤더 ──────────────────────────────────────── */}
      <header className="bg-white border-b border-gray-200 px-3 sm:px-6 py-3 sm:py-4">
        <div className="max-w-screen-xl mx-auto flex items-center justify-between gap-3 sm:gap-4">
          <div className="min-w-0">
            <p className="text-[10px] sm:text-[11px] font-medium text-blue-600 tracking-wider uppercase">
              부산상공회의소 부산인력개발원
            </p>
            <h1 className="text-base sm:text-lg font-bold text-gray-800 leading-tight">
              종합시간표 뷰어
            </h1>
            <p className="text-[10px] sm:text-xs text-gray-400 truncate mt-0.5">
              {meta.fileName}
              <span className="mx-1 sm:mx-1.5 text-gray-300">|</span>
              {meta.dateRange.start} ~ {meta.dateRange.end}
            </p>
          </div>
          <button
            onClick={onReset}
            className="flex-shrink-0 flex items-center gap-1.5 px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            <span className="hidden sm:inline">다른 파일</span>
          </button>
        </div>
      </header>

      {/* ── 요약 바 ────────────────────────────────────── */}
      <div className="bg-white border-b border-gray-100">
        <div className="max-w-screen-xl mx-auto px-3 sm:px-6 py-2 sm:py-2.5">
          <div className="flex flex-wrap items-center gap-x-3 sm:gap-x-5 gap-y-1 text-xs sm:text-sm text-gray-600">
            <Stat value={totalDates} label="일" />
            <Stat value={courses.length} label="개 과정" />
            <Stat value={teachers.length} label="명 강사" />
            <span className="ml-auto text-[10px] sm:text-xs font-medium text-green-600 flex items-center gap-1">
              <svg className="w-3 h-3 sm:w-3.5 sm:h-3.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
              </svg>
              데이터 로드 완료
            </span>
          </div>
        </div>
      </div>

      {/* ── 탭 바 ──────────────────────────────────────── */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-screen-xl mx-auto px-3 sm:px-6">
          <nav className="flex">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={[
                  'flex-1 sm:flex-none px-3 sm:px-5 py-2.5 sm:py-3 text-xs sm:text-sm font-medium border-b-2 transition-colors text-center',
                  activeTab === tab.id
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300',
                ].join(' ')}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* ── 탭 콘텐츠 ─────────────────────────────────── */}
      <main className="flex-1 max-w-screen-xl mx-auto w-full px-2 sm:px-6 py-3 sm:py-5">
        {activeTab === 'by-course' && (
          <ByCourseTab courses={courses} schedule={schedule} />
        )}
        {activeTab === 'by-date' && (
          <ByDateTab courses={courses} schedule={schedule} />
        )}
        {activeTab === 'by-teacher' && (
          <ByTeacherTab courses={courses} teachers={teachers} schedule={schedule} />
        )}
        {activeTab === 'weekly' && (
          <WeeklyOverviewTab courses={courses} schedule={schedule} />
        )}
      </main>
    </div>
  );
}

function Stat({ value, label }) {
  return (
    <span>
      <span className="font-semibold text-blue-600">{value}</span>
      <span className="text-gray-500">{label}</span>
    </span>
  );
}
