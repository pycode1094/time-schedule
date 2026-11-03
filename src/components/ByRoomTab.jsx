import { useState, useMemo } from 'react';
import RoomMatrixView from './RoomMatrixView';
import RoomEmptyFinder from './RoomEmptyFinder';
import RoomSingleView from './RoomSingleView';

const MODES = [
  { id: 'matrix', label: '강의실 매트릭스', desc: '하루 전체 강의실 × 교시' },
  { id: 'empty',  label: '빈 강의실 찾기',   desc: '날짜+교시로 빈 곳 검색' },
  { id: 'single', label: '강의실별 주간',    desc: '한 강의실의 주간 시간표' },
];

// 기업교육팀 강의실 사용분(본원 교시로 시간대 매핑된 roomSchedule)을
// 본원 스케줄에 병합. corpData가 없으면 원본 그대로 → 기존 동작 유지.
function mergeCorpIntoSchedule(courses, schedule, corpData) {
  if (!corpData || !corpData.roomSchedule) return { courses, schedule };
  const mergedCourses = [...courses, ...corpData.courses];
  const mergedSchedule = { ...schedule };
  for (const [dateStr, entry] of Object.entries(corpData.roomSchedule)) {
    mergedSchedule[dateStr] = mergedSchedule[dateStr]
      ? { ...mergedSchedule[dateStr], courses: { ...mergedSchedule[dateStr].courses, ...entry.courses } }
      : entry;
  }
  return { courses: mergedCourses, schedule: mergedSchedule };
}

export default function ByRoomTab({ courses, schedule, corpData }) {
  const [mode, setMode] = useState('matrix');
  const current = MODES.find(m => m.id === mode);

  const merged = useMemo(
    () => mergeCorpIntoSchedule(courses, schedule, corpData),
    [courses, schedule, corpData]
  );

  return (
    <div className="space-y-3 sm:space-y-4">
      <div className="flex flex-wrap items-center gap-1.5">
        {MODES.map(m => (
          <button
            key={m.id}
            onClick={() => setMode(m.id)}
            className={[
              'px-3 sm:px-4 py-1.5 text-xs sm:text-sm font-medium rounded-full transition-colors',
              mode === m.id
                ? 'bg-teal-600 text-white shadow-sm'
                : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50',
            ].join(' ')}
          >
            {m.label}
          </button>
        ))}
        {current?.desc && (
          <span className="ml-1 text-[11px] sm:text-xs text-gray-400 hidden sm:inline">
            {current.desc}
          </span>
        )}
        {corpData?.courses?.length > 0 && (
          <span className="ml-auto inline-flex items-center gap-1 text-[10px] sm:text-[11px] font-medium text-purple-600 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
            기업교육팀 사용 현황 포함 ({corpData.courses.length}개 과정)
          </span>
        )}
      </div>

      {mode === 'matrix' && <RoomMatrixView courses={merged.courses} schedule={merged.schedule} />}
      {mode === 'empty'  && <RoomEmptyFinder courses={merged.courses} schedule={merged.schedule} />}
      {mode === 'single' && <RoomSingleView  courses={merged.courses} schedule={merged.schedule} />}
    </div>
  );
}
