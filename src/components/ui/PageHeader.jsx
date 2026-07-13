export default function PageHeader({ title, subtitle, actions, className = '' }) {
  return (
    <div className={`flex flex-col md:flex-row md:items-center justify-between p-4 md:px-6 bg-[var(--bg-surface)] border-b border-[var(--border-subtle)] shrink-0 shadow-sm z-10 ${className}`}>
      <div className="flex flex-col mb-4 md:mb-0">
        <h1 className="text-xl md:text-2xl font-black text-[var(--accent)] uppercase tracking-wider flex items-center gap-2">
          {title}
        </h1>
        {subtitle && (
          <p className="text-[var(--text-muted)] text-sm font-medium mt-1">
            {subtitle}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-3">
          {actions}
        </div>
      )}
    </div>
  )
}
