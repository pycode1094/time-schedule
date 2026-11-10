import { useCallback, useEffect, useMemo, useState } from 'react';
import { BottomNav, Sidebar } from '../ui/Nav.jsx';
import { activeNavId } from '../lib/nav.js';
import { useRoute, navigate, openSheet } from '../lib/router.js';
import { getRecentTeachers, getRememberedTeacher, rememberTeacher } from '../lib/storage.js';
import { collectTeachers, hasWeekendLessons } from '../lib/schedule.js';
import { buildChanges } from '../lib/changes.js';
import { useTheme } from '../lib/theme.js';
import { getUrlTeacher, setUrlTeacher } from '../utils/urlState.js';
import TeacherScreen from './TeacherScreen.jsx';
import RoomScreen from './RoomScreen.jsx';
import CourseScreen from './CourseScreen.jsx';
import HomeScreen from './HomeScreen.jsx';
import DayScreen from './DayScreen.jsx';
import SearchSheet from './parts/SearchSheet.jsx';
import CorpScreen from './CorpScreen.jsx';
import MoreScreen from './MoreScreen.jsx';
import AdminPanel from '../components/AdminPanel.jsx';

// ─────────────────────────────────────────────────────────────
// 앱 틀: 하단 탭바(폰) · 사이드바(PC) + 해시 라우팅 + 강사 기억
//   ?teacher= 는 강사 화면에 있는 동안 주소에 남겨 둔다 (기존과 같이 공유 가능)
// ─────────────────────────────────────────────────────────────
export default function AppShell({ data, changeLog, corpData, onCorpReload, adminPassword, onAdminLogin, onAdminLogout, onReload, status }) {
  const route = useRoute();
  const [teacher, setTeacher] = useState(() => getUrlTeacher() || getRememberedTeacher());
  const [recentTeachers, setRecentTeachers] = useState(getRecentTeachers);
  const [themePref, setTheme] = useTheme();

  const allChanges = useMemo(() => buildChanges(changeLog), [changeLog]);
  const teachers = useMemo(
    () => (data ? collectTeachers(data.teachers, data.schedule, [...allChanges.current, ...allChanges.past].map(c => c.teacher)) : []),
    [data, allChanges],
  );
  const withWeekend = useMemo(() => (data ? hasWeekendLessons(data.schedule) : false), [data]);

  const isTeacherRoute = route.segments[0] === 'teacher';
  const teacherKnown = !!teacher && teachers.some(t => t.name === teacher);

  // 주소의 ?teacher= 맞추기 (같으면 건드리지 않음: 열린 시트의 기록을 지키기 위해)
  useEffect(() => {
    const inUrl = getUrlTeacher();
    if (isTeacherRoute && teacher) {
      if (inUrl !== teacher) setUrlTeacher(teacher);
    } else if (!isTeacherRoute && inUrl) {
      setUrlTeacher(null);
    }
  }, [route.hash, isTeacherRoute, teacher]);

  // 주소로 들어온 강사가 시간표에 있으면 기억 (최근 본 강사 목록은 다음에 고를 때 갱신)
  useEffect(() => {
    if (teacherKnown) rememberTeacher(teacher);
  }, [teacherKnown, teacher]);

  // 화면이 바뀌면 맨 위로
  useEffect(() => { window.scrollTo(0, 0); }, [route.path]);

  const selectTeacher = useCallback((name) => {
    setTeacher(name);
    rememberTeacher(name);
    setRecentTeachers(getRecentTeachers());
    if (window.location.hash.replace(/\?.*$/, '') !== '#/teacher') navigate('/teacher');
  }, []);

  const app = {
    data, changeLog, corpData, allChanges, teacher, teachers, recentTeachers, selectTeacher, withWeekend, navigate,
    adminPassword, onAdminLogin, onAdminLogout, onReload, onCorpReload, themePref, setTheme,
  };

  const activeId = activeNavId(route.segments);
  const meta = data?.meta;

  return (
    <div className="min-h-dvh bg-canvas">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-[12px] focus:bg-surface focus:px-4 focus:py-3 focus:text-ink">
        본문으로 건너뛰기
      </a>
      <Sidebar
        activeId={activeId}
        onNavigate={(p) => navigate(p)}
        onSearch={() => openSheet('search')}
        footer={meta ? (
          <>
            <span className="block">시간표 기간</span>
            <span className="mt-0.5 block whitespace-nowrap tabular">{meta.dateRange.start} ~ {meta.dateRange.end}</span>
          </>
        ) : null}
      />
      <main id="main" className="lg:pl-60">
        <div key={route.path} className="mx-auto w-full max-w-[640px] lg:max-w-[1164px] px-5 lg:px-8 pb-28 lg:pb-16">
          {status || <Routes route={route} app={app} />}
        </div>
      </main>
      {!status && <SearchSheet open={route.sheet === 'search'} app={app} />}
      <BottomNav activeId={activeId} onNavigate={(p) => navigate(p)} />
    </div>
  );
}

function Routes({ route, app }) {
  const [first] = route.segments;
  const { data, corpData } = app;
  switch (first) {
    case 'teacher':
      return <TeacherScreen app={app} route={route} />;
    case 'day':
      return <DayScreen app={app} route={route} />;
    case 'room':
      return <RoomScreen app={app} route={route} />;
    case 'course':
      return <CourseScreen app={app} route={route} />;
    case 'corp':
      return <CorpScreen app={app} route={route} />;
    case 'more':
      return <MoreScreen app={app} route={route} />;
    case 'admin':
      return (
        <AdminPanel
          currentData={data}
          adminPassword={app.adminPassword}
          onLogin={app.onAdminLogin}
          onLogout={app.onAdminLogout}
          onReload={app.onReload}
          onCorpReload={app.onCorpReload}
          corpSource={corpData?.source}
          uploadedAt={data.meta.uploadedAt}
          source={data.meta.source}
        />
      );
    default:
      return <HomeScreen app={app} route={route} />;
  }
}
