import { cn } from "../../lib/utils"

function Skeleton({ className, ...props }) {
  return (
    <div
      className={cn("animate-pulse rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)]", className)}
      {...props}
    />
  )
}

export { Skeleton }
