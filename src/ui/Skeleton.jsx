// 스켈레톤 로딩
export default function Skeleton({ className = '' }) {
  return <span aria-hidden="true" className={`block rounded-[10px] bg-fill animate-shimmer ${className}`} />;
}

// 화면 하나 분량의 로딩 모양 (제목 + 카드 몇 개)
export function ScreenSkeleton({ label = '시간표를 불러오고 있어요' }) {
  return (
    <div role="status" aria-live="polite" className="space-y-4">
      <span className="sr-only">{label}</span>
      <Skeleton className="h-4 w-28" />
      <Skeleton className="h-8 w-56" />
      <div className="grid grid-cols-5 gap-1.5 pt-2">
        {Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-[68px] rounded-[16px]" />)}
      </div>
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} className="bg-surface rounded-card p-5 space-y-3">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-6 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      ))}
    </div>
  );
}
