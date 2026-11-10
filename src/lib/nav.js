import { CalendarDays, DoorOpen, LayoutGrid, Menu } from 'lucide-react';

// 주요 메뉴 (폰 하단 탭바). PC(1024px 이상)는 예전 탭 화면(src/desktop)을 쓴다
//   내 시간표: 기억한 강사의 캘린더 (처음이면 강사 검색)
export const NAV_ITEMS = [
  { id: 'teacher', path: '/teacher', label: '내 시간표', icon: CalendarDays, match: ['', 'teacher'] },
  { id: 'course', path: '/course', label: '전체 시간표', icon: LayoutGrid, match: ['course', 'day', 'home'] },
  { id: 'room', path: '/room', label: '강의실', icon: DoorOpen, match: ['room'] },
  { id: 'more', path: '/more', label: '더보기', icon: Menu, match: ['more', 'corp', 'admin'] },
];

export function activeNavId(segments) {
  const first = segments[0] || '';
  return NAV_ITEMS.find(n => n.match.includes(first))?.id || 'teacher';
}
