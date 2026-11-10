import { BookOpen, DoorOpen, House, Menu, UserRound } from 'lucide-react';

// 주요 메뉴: 폰은 하단 탭바, PC(lg 이상)는 좌측 사이드바. 같은 구조
export const NAV_ITEMS = [
  { id: 'home', path: '/', label: '홈', icon: House, match: ['', 'day'] },
  { id: 'teacher', path: '/teacher', label: '강사', icon: UserRound, match: ['teacher'] },
  { id: 'room', path: '/room', label: '강의실', icon: DoorOpen, match: ['room'] },
  { id: 'course', path: '/course', label: '과정', icon: BookOpen, match: ['course'] },
  { id: 'more', path: '/more', label: '더보기', icon: Menu, match: ['more', 'corp', 'admin'] },
];

export function activeNavId(segments) {
  const first = segments[0] || '';
  return NAV_ITEMS.find(n => n.match.includes(first))?.id || 'home';
}
