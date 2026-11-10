import { MapPin } from 'lucide-react';
import { Badge } from '../../ui/Chip.jsx';
import { periodRange, periodTime } from '../../lib/schedule.js';
import { PERIOD_TIMES } from '../../utils/weekUtils.js';
import { TYPE_LABEL } from '../../utils/scheduleDiff.js';

// ─────────────────────────────────────────────────────────────
// 하루 시간표 (캘린더형)
//   왼쪽: 교시 시작 시각, 오른쪽: 교시 칸 위에 수업 블록
//   4교시 뒤에 점심시간 띠. 블록 높이 = 교시 수
//   items: [{ key, start, end, subject, courseName, room, tone: 'added'|'changed'|'removed'|undefined, overlap }]
// ─────────────────────────────────────────────────────────────
const ROW = 52;      // 교시 한 칸 높이(px)
const LUNCH = 28;    // 점심 띠 높이(px)
const LUNCH_AFTER = 4;
const COUNT = PERIOD_TIMES.length;

function topOf(period) {
  return (period - 1) * ROW + (period > LUNCH_AFTER ? LUNCH : 0);
}

const TONE = {
  added:   { box: 'bg-add-weak', bar: 'bg-add', title: 'text-ink' },
  changed: { box: 'bg-mod-weak', bar: 'bg-mod', title: 'text-ink' },
  removed: { box: 'bg-transparent border-2 border-dashed border-line', bar: '', title: 'text-ink-2 line-through decoration-2' },
  default: { box: 'bg-primary-weak', bar: 'bg-primary', title: 'text-ink' },
};

export default function DayTimeline({ items, onItemClick }) {
  const height = topOf(COUNT) + ROW;
  const starts = PERIOD_TIMES.map(t => t.split('~')[0]);

  return (
    <div className="relative select-none" style={{ height }}>
      {/* 시간 눈금 */}
      {starts.map((t, i) => {
        const p = i + 1;
        return (
          <div key={p} className="absolute inset-x-0 flex" style={{ top: topOf(p), height: ROW }}>
            <span className="w-14 flex-shrink-0 -translate-y-2 pr-2.5 text-right text-caption font-medium text-ink-3 tabular">{t}</span>
            <span className="flex-1 border-t border-line" aria-hidden="true" />
          </div>
        );
      })}
      <div className="absolute inset-x-0 flex" style={{ top: topOf(LUNCH_AFTER) + ROW, height: LUNCH }} aria-hidden="true">
        <span className="w-14 flex-shrink-0" />
        <span className="flex flex-1 items-center rounded-[8px] bg-fill px-3 text-caption font-medium text-ink-3">
          점심시간 {PERIOD_TIMES[LUNCH_AFTER - 1].split('~')[1]}–{starts[LUNCH_AFTER]}
        </span>
      </div>

      {/* 수업 블록 (점심시간을 넘는 수업은 오전 · 오후 두 칸으로 나눠 그린다) */}
      {items.flatMap(it => (it.start <= LUNCH_AFTER && it.end > LUNCH_AFTER
        ? [{ ...it, segKey: `${it.key}-am`, end: LUNCH_AFTER, fullStart: it.start, fullEnd: it.end },
           { ...it, segKey: `${it.key}-pm`, start: LUNCH_AFTER + 1, cont: true, fullStart: it.start, fullEnd: it.end }]
        : [{ ...it, segKey: it.key, fullStart: it.start, fullEnd: it.end }]
      )).map(it => {
        const tone = TONE[it.tone] || TONE.default;
        const top = topOf(it.start) + 3;
        const h = topOf(it.end) + ROW - topOf(it.start) - 6;
        const tall = h >= ROW * 2 - 10;
        const Tag = onItemClick ? 'button' : 'div';
        return (
          <Tag
            key={it.segKey}
            type={onItemClick ? 'button' : undefined}
            onClick={onItemClick ? () => onItemClick(it) : undefined}
            className={`press absolute right-0 left-14 overflow-hidden rounded-[14px] text-left ${tone.box}`}
            style={{ top, height: h }}
            aria-label={`${periodRange(it.fullStart, it.fullEnd)} ${it.subject || ''} ${it.room || ''}${it.tone ? ` ${TYPE_LABEL[it.tone]}` : ''}${it.cont ? ' (오후 이어서)' : ''}`}
          >
            {tone.bar && <span aria-hidden="true" className={`absolute inset-y-0 left-0 w-1 ${tone.bar}`} />}
            <div className="flex h-full flex-col px-4 py-2.5">
              <div className="flex items-start gap-2">
                <p className={`min-w-0 flex-1 text-[16px] font-bold leading-snug ${tone.title} ${tall ? 'line-clamp-2' : 'truncate'}`}>
                  {it.subject || '(과목 없음)'}
                </p>
                {it.overlap && it.tone !== 'removed' && <Badge tone="overlap">시간 겹침</Badge>}
                {it.tone && <Badge tone={it.tone} className={it.tone !== 'removed' ? 'bg-surface!' : ''}>{TYPE_LABEL[it.tone]}</Badge>}
              </div>
              <p className="mt-0.5 truncate text-label text-ink-2 tabular">
                {it.cont ? '점심 후 이어서' : periodRange(it.fullStart, it.fullEnd)} · {periodTime(it.start, it.end)}
              </p>
              {tall && it.room && (
                <p className="mt-0.5 flex flex-wrap items-center gap-x-1 text-label text-ink-2">
                  <MapPin aria-hidden="true" className="w-3.5 h-3.5 flex-shrink-0" />
                  {it.change?.before?.room && it.change.before.room !== it.room && (
                    <><span className="text-ink-3 line-through">{it.change.before.room}</span><span aria-hidden="true">→</span></>
                  )}
                  <span className={it.change?.before?.room && it.change.before.room !== it.room ? 'font-semibold text-ink' : ''}>{it.room}</span>
                </p>
              )}
              {tall && it.courseName && h >= ROW * 3 - 10 && (
                <p className="mt-0.5 truncate text-caption text-ink-3">{it.courseName}</p>
              )}
            </div>
          </Tag>
        );
      })}
    </div>
  );
}
