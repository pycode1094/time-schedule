import { ChevronLeft, ChevronRight } from 'lucide-react';
import { IconButton } from './Button.jsx';
import { dateParts, todayStr } from '../lib/schedule.js';
import { useSwipe } from '../lib/swipe.js';

// ─────────────────────────────────────────────────────────────
// 가로 날짜 칩 (한 주)
//   ‹ 11월 2주차 ›  +  [월 9][화 10][수 11][목 12][금 13]
//   좌우 스와이프로 주 이동 (버튼으로도 이동 가능: 스와이프만으로는 접근성이 부족)
//   marks[date] = { lessons: bool, changed: bool }
// ─────────────────────────────────────────────────────────────
export default function DateStrip({
  days, selected, onSelect, marks = {}, title, subtitle, onTitleClick,
  onPrev, onNext, canPrev = true, canNext = true, onToday, className = '', daysClassName = '',
}) {
  const today = todayStr();
  const swipe = useSwipe({ onLeft: canNext ? onNext : null, onRight: canPrev ? onPrev : null });
  const showToday = onToday && !days.includes(today);

  return (
    <div className={className} {...swipe}>
      <div className="flex items-center gap-1">
        <IconButton label="이전 주" onClick={onPrev} disabled={!canPrev} className="-ml-2">
          <ChevronLeft aria-hidden="true" className="w-6 h-6" />
        </IconButton>
        {onTitleClick ? (
          <button type="button" onClick={onTitleClick} className="press min-h-11 px-2 rounded-[12px] text-left hover:bg-fill">
            <span className="block text-title3 text-ink">{title}</span>
            {subtitle && <span className="block text-caption text-ink-2">{subtitle}</span>}
          </button>
        ) : (
          <div className="px-2">
            <span className="block text-title3 text-ink">{title}</span>
            {subtitle && <span className="block text-caption text-ink-2">{subtitle}</span>}
          </div>
        )}
        <IconButton label="다음 주" onClick={onNext} disabled={!canNext}>
          <ChevronRight aria-hidden="true" className="w-6 h-6" />
        </IconButton>
        {showToday && (
          <button type="button" onClick={onToday} className="press ml-auto min-h-11 px-4 rounded-full bg-surface text-label font-semibold text-primary-ink">
            오늘
          </button>
        )}
      </div>

      <div role="group" aria-label="날짜 선택" className={`mt-3 grid gap-1.5 ${daysClassName}`} style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
        {days.map(d => {
          const { d: dd, w } = dateParts(d);
          const isSel = d === selected;
          const isToday = d === today;
          const m = marks[d] || {};
          const label = `${dateParts(d).m}월 ${dd}일 ${w}요일${isToday ? ', 오늘' : ''}${m.lessons ? ', 수업 있음' : ', 수업 없음'}${m.changed ? ', 바뀐 수업 있음' : ''}`;
          return (
            <button
              key={d}
              type="button"
              aria-pressed={isSel}
              aria-label={label}
              onClick={() => onSelect(d)}
              className={[
                'press flex flex-col items-center justify-center gap-0.5 min-h-[68px] rounded-[16px]',
                isSel ? 'bg-primary text-white' : 'bg-surface text-ink hover:brightness-[0.98]',
              ].join(' ')}
            >
              <span className={`text-caption font-semibold ${isSel ? 'text-white' : isToday ? 'text-primary-ink' : 'text-ink-2'}`}>
                {isToday ? '오늘' : w}
              </span>
              <span className={`text-title3 tabular ${!isSel && isToday ? 'text-primary-ink' : ''}`}>{dd}</span>
              <span className="flex h-1.5 items-center gap-1" aria-hidden="true">
                {m.lessons && <span className={`w-1.5 h-1.5 rounded-full ${isSel ? 'bg-white/80' : 'bg-ink-3'}`} />}
                {m.changed && <span className={`w-1.5 h-1.5 rounded-full ${isSel ? 'bg-white' : 'bg-mod'}`} />}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
