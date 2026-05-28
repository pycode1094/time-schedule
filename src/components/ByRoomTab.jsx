import { useState } from 'react';
import RoomMatrixView from './RoomMatrixView';
import RoomEmptyFinder from './RoomEmptyFinder';
import RoomSingleView from './RoomSingleView';

const MODES = [
  { id: 'matrix', label: '강의실 매트릭스', desc: '하루 전체 강의실 × 교시' },
  { id: 'empty',  label: '빈 강의실 찾기',   desc: '날짜+교시로 빈 곳 검색' },
  { id: 'single', label: '강의실별 주간',    desc: '한 강의실의 주간 시간표' },
];

export default function ByRoomTab({ courses, schedule }) {
  const [mode, setMode] = useState('matrix');
  const current = MODES.find(m => m.id === mode);

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
      </div>

      {mode === 'matrix' && <RoomMatrixView courses={courses} schedule={schedule} />}
      {mode === 'empty'  && <RoomEmptyFinder courses={courses} schedule={schedule} />}
      {mode === 'single' && <RoomSingleView  courses={courses} schedule={schedule} />}
    </div>
  );
}
