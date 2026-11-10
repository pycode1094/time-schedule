// 빈 화면 · 오류 안내
export default function EmptyState({ icon: Icon, title, description, action, tone = 'neutral', className = '' }) {
  const iconColor = tone === 'error' ? 'text-del bg-del-weak' : 'text-ink-3 bg-fill';
  return (
    <div className={`flex flex-col items-center text-center px-6 py-10 ${className}`} role={tone === 'error' ? 'alert' : undefined}>
      {Icon && (
        <span className={`mb-4 inline-flex items-center justify-center w-14 h-14 rounded-full ${iconColor}`}>
          <Icon aria-hidden="true" className="w-7 h-7" />
        </span>
      )}
      <p className="text-title3 text-ink">{title}</p>
      {description && <p className="mt-1.5 text-label text-ink-2 max-w-sm">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
