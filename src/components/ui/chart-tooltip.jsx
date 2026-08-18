import React from "react"
import { cn } from "../../lib/utils"

export function ChartTooltipContent({
  active,
  payload,
  label,
  title,
  formatter,
  labelFormatter,
  className
}) {
  if (!active || !payload || !payload.length) {
    return null
  }

  return (
    <div
      className={cn(
        "rounded-xl border border-[var(--border-normal)] bg-[var(--bg-surface)]/95 p-3 text-xs shadow-xl backdrop-blur-md transition-all duration-150 animate-in fade-in-0 zoom-in-95",
        className
      )}
    >
      <div className="font-bold text-[var(--text-primary)] mb-1.5 pb-1 border-b border-[var(--border-subtle)] flex items-center justify-between gap-4">
        <span>{labelFormatter ? labelFormatter(label, payload) : (label || title)}</span>
      </div>
      <div className="space-y-1">
        {payload.map((item, index) => {
          const color = item.color || item.fill || item.stroke || 'var(--accent)'
          const name = item.name || item.dataKey
          const value = formatter ? formatter(item.value, item.name, item) : item.value

          return (
            <div key={`item-${index}`} className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-1.5 text-[var(--text-muted)]">
                <span
                  className="h-2 w-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: color }}
                />
                <span className="capitalize">{name}:</span>
              </div>
              <span className="font-semibold text-[var(--text-primary)] tabular-nums">
                {value}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
