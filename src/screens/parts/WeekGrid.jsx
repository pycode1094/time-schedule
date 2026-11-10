import { Badge } from '../../ui/Chip.jsx';
import { PERIODS, dateParts, periodRange, periodTime, todayStr } from '../../lib/schedule.js';
import { TYPE_LABEL } from '../../utils/scheduleDiff.js';

// ─────────────────────────────────────────────────────────────
// PC 주간 그리드 (lg 이상에서만 쓴다. 폰은 날짜 칩 + 카드)
//   열: 요일, 행: 교시. 연속 교시는 칸을 합친다. 글자는 자르지 않고 줄을 바꾼다.
//   items: [{ id, date, periodStart, periodEnd, title, lines: [], tone?: changed|added|removed, overlap? }]
//   periodTimes: [{ period, time }] (없으면 본원 교시 시간)
// ─────────────────────────────────────────────────────────────
const TONE_BG = {
  changed: 'bg-mod-weak',
  added: 'bg-add-weak',
  removed: 'bg-surface border-2 border-dashed border-line',
};

function clusterByDay(items) {
  // 같은 날 교시가 겹치는 항목은 한 칸에 위아래로 (시간 겹침 표시)
  const byDay = new Map();
  for (const it of items) {
    if (!byDay.has(it.date)) byDay.set(it.date, []);
    byDay.get(it.date).push(it);
  }
  const clusters = [];
  for (const [date, list] of byDay) {
    const sorted = [...list].sort((a, b) => a.periodStart - b.periodStart || a.periodEnd - b.periodEnd);
    let cur = null;
    for (const it of sorted) {
      if (cur && it.periodStart <= cur.end) {
        cur.items.push(it);
        cur.end = Math.max(cur.end, it.periodEnd);
      } else {
        cur = { date, start: it.periodStart, end: it.periodEnd, items: [it] };
        clusters.push(cur);
      }
    }
  }
  return clusters;
}

export default function WeekGrid({ days, items, periodTimes, onItemClick, emptyText = '이 주에는 수업이 없어요', label = '주간 시간표' }) {
  const today = todayStr();
  const rows = periodTimes?.length
    ? periodTimes
    : PERIODS.map(p => ({ period: p, time: periodTime(p, p) }));
  const periodRow = new Map(rows.map((r, i) => [r.period, i + 2]));
  const clusters = clusterByDay(items.filter(it => periodRow.has(it.periodStart) && periodRow.has(it.periodEnd)));

  return (
    <div className="bg-surface rounded-card overflow-hidden" role="region" aria-label={label}>
      <div
        className="grid"
        style={{
          gridTemplateColumns: `104px repeat(${days.length}, minmax(0, 1fr))`,
          gridTemplateRows: `auto repeat(${rows.length}, minmax(60px, auto))`,
        }}
      >
        {/* 머리줄 */}
        <div className="sticky top-0 border-b border-line" style={{ gridRow: 1, gridColumn: 1 }} />
        {days.map((d, i) => {
          const { d: dd, w } = dateParts(d);
          const isToday = d === today;
          return (
            <div key={d} className="px-3 py-3 text-center border-b border-l border-line" style={{ gridRow: 1, gridColumn: i + 2 }}>
              <span className={`block text-label font-semibold ${isToday ? 'text-primary-ink' : 'text-ink-2'}`}>{isToday ? `오늘 · ${w}` : w}</span>
              <span className={`block text-title3 tabular ${isToday ? 'text-primary-ink' : 'text-ink'}`}>{dateParts(d).m}/{dd}</span>
            </div>
          );
        })}
        {/* 교시 열 + 빈 칸 */}
        {rows.map((r, ri) => (
          <div key={`p${r.period}`} className="px-3 py-2 border-b border-line flex flex-col justify-center" style={{ gridRow: ri + 2, gridColumn: 1 }}>
            <span className="text-label font-semibold text-ink">{r.period}교시</span>
            {r.time && <span className="text-caption text-ink-3 tabular whitespace-nowrap">{r.time.replace('~', '–')}</span>}
          </div>
        ))}
        {rows.map((r, ri) => days.map((d, di) => (
          <div key={`c${r.period}-${d}`} className="border-b border-l border-line" style={{ gridRow: ri + 2, gridColumn: di + 2 }} aria-hidden="true" />
        )))}
        {/* 수업 */}
        {clusters.map(c => {
          const col = days.indexOf(c.date);
          if (col < 0) return null;
          const rowStart = periodRow.get(c.start);
          const rowEnd = periodRow.get(c.end) + 1;
          const overlap = c.items.filter(i => i.tone !== 'removed').length > 1;
          return (
            <div key={`${c.date}-${c.start}`} className="relative z-10 p-1.5 flex flex-col gap-1.5" style={{ gridColumn: col + 2, gridRow: `${rowStart} / ${rowEnd}` }}>
              {c.items.map(it => {
                const Tag = onItemClick ? 'button' : 'div';
                return (
                  <Tag
                    key={it.id}
                    type={onItemClick ? 'button' : undefined}
                    onClick={onItemClick ? () => onItemClick(it) : undefined}
                    className={[
                      'flex-1 w-full text-left rounded-[12px] px-2.5 py-2',
                      onItemClick ? 'press hover:brightness-[0.98]' : '',
                      overlap && it.tone !== 'removed' ? 'bg-del-weak' : TONE_BG[it.tone] || 'bg-fill',
                    ].join(' ')}
                  >
                    <span className="flex flex-wrap items-center gap-1">
                      <span className="text-caption font-semibold text-ink-2 tabular">{periodRange(it.periodStart, it.periodEnd)}</span>
                      {overlap && it.tone !== 'removed' && <Badge tone="overlap" className="px-1.5!">겹침</Badge>}
                      {it.tone && <Badge tone={it.tone} className={`px-1.5! ${it.tone !== 'removed' ? 'bg-surface!' : ''}`}>{TYPE_LABEL[it.tone]}</Badge>}
                    </span>
                    <span className={`mt-0.5 block text-label font-semibold ${it.tone === 'removed' ? 'text-ink-2 line-through' : 'text-ink'}`}>{it.title}</span>
                    {it.lines?.filter(Boolean).map((line, li) => (
                      <span key={li} className="mt-0.5 block text-caption text-ink-2">{line}</span>
                    ))}
                  </Tag>
                );
              })}
            </div>
          );
        })}
      </div>
      {items.length === 0 && (
        <p className="px-5 py-8 text-center text-body text-ink-2 border-t border-line">{emptyText}</p>
      )}
    </div>
  );
}
