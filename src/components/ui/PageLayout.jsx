export default function PageLayout({ children, className = '' }) {
  return (
    <div className={`flex flex-col h-full w-full bg-[var(--bg-base)] text-[var(--text-primary)] gea-theme overflow-hidden ${className}`}>
      {children}
    </div>
  )
}
