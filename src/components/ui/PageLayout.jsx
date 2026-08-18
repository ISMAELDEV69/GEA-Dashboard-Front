export default function PageLayout({ children, className = '' }) {
  return (
    <div className={`flex flex-col w-full min-h-0 bg-[var(--bg-base)] text-[var(--text-primary)] gea-theme ${className}`}>
      {children}
    </div>
  )
}
