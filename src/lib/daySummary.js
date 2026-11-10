import { useMemo } from 'react';
import { collectLessons, courseIndex, mergeBlocks } from './schedule.js';

// 날짜 하루의 과정별 요약: [{ course, blocks, periods: "1~7교시", rooms, teachers }]
export function useDaySummary(data, date) {
  return useMemo(() => {
    const courseById = courseIndex(data.courses);
    const blocks = mergeBlocks(collectLessons(data.schedule, courseById, [date]));
    const byCourse = new Map();
    for (const b of blocks) {
      if (!byCourse.has(b.courseId)) byCourse.set(b.courseId, []);
      byCourse.get(b.courseId).push(b);
    }
    const rows = data.courses
      .filter(c => byCourse.has(c.id))
      .map(c => {
        const list = byCourse.get(c.id);
        const start = Math.min(...list.map(b => b.periodStart));
        const end = Math.max(...list.map(b => b.periodEnd));
        return {
          course: c, blocks: list, start, end,
          rooms: [...new Set(list.map(b => b.room).filter(Boolean))],
          teachers: [...new Set(list.map(b => b.teacher).filter(Boolean))],
        };
      });
    return {
      rows,
      teachers: new Set(blocks.map(b => b.teacher).filter(Boolean)).size,
      rooms: new Set(blocks.map(b => b.room).filter(Boolean)).size,
    };
  }, [data, date]);
}
