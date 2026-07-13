export default function Card({ children, className = '', noPadding = false }) {
  return (
    <div className={`glass flex flex-col ${noPadding ? '' : 'p-4 md:p-6'} ${className}`}>
      {children}
    </div>
  )
}

export function CardHeader({ title, subtitle, actions, className = '' }) {
  return (
    <div className={`flex items-center justify-between mb-4 border-b border-[var(--border-subtle)] pb-3 ${className}`}>
      <div>
        <h3 className="text-sm font-bold text-[var(--text-primary)] uppercase tracking-wide">{title}</h3>
        {subtitle && <p className="text-xs text-[var(--text-muted)] mt-0.5">{subtitle}</p>}
      </div>
      {actions && <div>{actions}</div>}
    </div>
  )
}
