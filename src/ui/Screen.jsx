import { TopBar } from './PageHeader.jsx';

// 화면 틀
//   최상위 화면(홈 · 강사 · 강의실 · 과정 · 더보기): 위 여백 + 큰 제목은 화면이 직접
//   하위 화면: onBack 을 주면 ‹ 뒤로 + 작은 제목이 위에 붙는다
export default function Screen({ title, onBack, topRight, children, className = '' }) {
  if (onBack) {
    return (
      <div className={`animate-screen-in ${className}`}>
        <TopBar title={title} onBack={onBack} right={topRight} />
        <div className="pt-2 lg:pt-4">{children}</div>
      </div>
    );
  }
  return (
    <div className={`animate-screen-in pt-[max(1.75rem,env(safe-area-inset-top))] lg:pt-10 ${className}`}>
      {children}
    </div>
  );
}
