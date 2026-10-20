import React, { memo } from 'react'

/**
 * Componente SemicircleGauge (Tacómetro Semicircular Dinámico y Adaptable a Temas)
 * @param {number} value - Porcentaje actual (ej: 51.21)
 * @param {string} title - Título del gauge (ej: "% Deserción")
 * @param {number} target - Meta de referencia (ej: 20.0)
 * @param {string} type - 'desercion' (menor es mejor) o 'dotacion' (mayor es mejor)
 * @param {Array} subMetrics - Métricas inferiores [{ label: 'Q Día 1', value: '7,475' }, { label: 'Desertores', value: '3,828' }]
 */
function SemicircleGaugeComponent({
  value = 0,
  title = '',
  target = null,
  type = 'desercion',
  subMetrics = [],
  maxVal = 100,
  compact = false,
}) {
  const numericVal = Math.max(0, Number(value) || 0)
  const displayVal = numericVal.toFixed(2)
  const effectiveMax = Math.max(maxVal, numericVal > 100 ? Math.ceil(numericVal / 50) * 50 : 100)
  const pctRatio = Math.min(1, numericVal / effectiveMax)

  // Color dinámico según tipo y semáforo
  let fillColor = '#10B981' // Verde
  let glowColor = 'rgba(16, 185, 129, 0.4)'

  if (type === 'desercion') {
    if (numericVal > 35) {
      fillColor = '#EF4444' // Rojo
      glowColor = 'rgba(239, 68, 68, 0.4)'
    } else if (numericVal > 20) {
      fillColor = '#F59E0B' // Ámbar
      glowColor = 'rgba(245, 158, 11, 0.4)'
    } else {
      fillColor = '#10B981' // Verde
      glowColor = 'rgba(16, 185, 129, 0.4)'
    }
  } else {
    if (numericVal >= 100) {
      fillColor = '#10B981' // Verde
      glowColor = 'rgba(16, 185, 129, 0.4)'
    } else if (numericVal >= 80) {
      fillColor = '#F59E0B' // Ámbar
      glowColor = 'rgba(245, 158, 11, 0.4)'
    } else {
      fillColor = '#EF4444' // Rojo
      glowColor = 'rgba(239, 68, 68, 0.4)'
    }
  }

  // Geometría del arco SVG
  const radius = 70
  const strokeWidth = 16
  const cx = 95
  const cy = 88
  const circumference = Math.PI * radius
  const strokeDashoffset = circumference * (1 - pctRatio)

  // Posición del marcador de meta (target)
  let targetMarker = null
  if (target !== null && typeof target === 'number' && !isNaN(target) && target >= 0 && target <= effectiveMax) {
    const targetRatio = target / effectiveMax
    const angleRad = Math.PI * (1 - targetRatio)
    targetMarker = {
      x: cx + radius * Math.cos(angleRad),
      y: cy - radius * Math.sin(angleRad),
      val: target
    }
  }

  // Identificador único para el gradiente
  const gradId = `gaugeGrad_${title.replace(/[^a-zA-Z0-9]/g, '')}`

  const strokeW = compact ? 12 : strokeWidth

  return (
    <div
      className={`flex flex-col items-center justify-between relative overflow-hidden transition-colors duration-300 ${
        compact
          ? 'p-3.5 rounded-xl bg-[var(--surface-elevated)]/80 border border-[var(--border-normal)] shadow-sm shadow-black/10'
          : 'p-4 rounded-2xl bg-[var(--surface-elevated)] border border-[var(--border-normal)] shadow-md'
      }`}
    >
      <div className="w-full flex items-center justify-between text-[10px] font-mono mb-0.5 px-0.5">
        {targetMarker ? (
          <>
            <span className="font-semibold text-[var(--text-primary)] tabular-nums">
              {targetMarker.val.toFixed(1)}%
            </span>
            <span className="text-[var(--text-muted)] uppercase tracking-wide font-sans">Meta</span>
          </>
        ) : (
          <span className="text-[var(--text-muted)] uppercase tracking-wide font-sans ml-auto">—</span>
        )}
      </div>

      <div className={`relative flex items-center justify-center ${compact ? 'w-[160px] h-[88px]' : 'w-[190px] h-[100px] my-1'}`}>
        <svg viewBox="0 0 190 105" className="w-full h-full overflow-visible">
          <defs>
            <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor={fillColor} stopOpacity="0.75" />
              <stop offset="100%" stopColor={fillColor} stopOpacity="1" />
            </linearGradient>
          </defs>

          <path
            d={`M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`}
            fill="none"
            stroke="var(--border-normal)"
            strokeWidth={strokeW}
            strokeLinecap="round"
            className="opacity-70"
          />

          <path
            d={`M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`}
            fill="none"
            stroke={`url(#${gradId})`}
            strokeWidth={strokeW}
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            className="transition-all duration-700 ease-out"
            style={compact ? undefined : { filter: `drop-shadow(0 0 6px ${glowColor})` }}
          />

          {targetMarker && (
            <circle
              cx={targetMarker.x}
              cy={targetMarker.y}
              r={compact ? 3.5 : 4.5}
              fill="#FFFFFF"
              stroke={fillColor}
              strokeWidth="2"
            />
          )}

          <text x={cx - radius - 2} y={cy + 15} textAnchor="start" className="fill-[var(--text-muted)] text-[9px] font-mono">
            0%
          </text>
          <text x={cx + radius + 2} y={cy + 15} textAnchor="end" className="fill-[var(--text-muted)] text-[9px] font-mono">
            {effectiveMax}%
          </text>
        </svg>

        <div className="absolute bottom-1 left-0 right-0 flex flex-col items-center justify-center pointer-events-none">
          <span
            className={`font-bold font-mono tracking-tight tabular-nums ${compact ? 'text-xl' : 'text-2xl'}`}
            style={{
              color: fillColor,
              ...(compact ? {} : { textShadow: `0 0 12px ${glowColor}` }),
            }}
          >
            {displayVal}%
          </span>
        </div>
      </div>

      <div className={`w-full text-center ${compact ? 'mt-1 mb-1' : 'mt-2 mb-2'}`}>
        <span
          className={`inline-block px-2.5 py-1 rounded-lg text-[11px] font-black uppercase tracking-wider border ${
            compact
              ? 'bg-[var(--surface)] text-cyan-300/90 border-cyan-500/20'
              : 'bg-[var(--surface)] text-[var(--accent)] border-[var(--border-normal)] shadow-xs'
          }`}
        >
          {title}
        </span>
      </div>

      {subMetrics && subMetrics.length > 0 && (
        <div
          className={`w-full grid grid-cols-2 gap-2 border-t border-[var(--border-subtle)] text-center font-mono ${
            compact ? 'pt-2 mt-0.5' : 'pt-2.5 mt-1 border-[var(--border-normal)]'
          }`}
        >
          {subMetrics.map((m, idx) => (
            <div key={idx} className="flex flex-col min-w-0">
              <span className={`font-bold text-[var(--text-primary)] tabular-nums ${compact ? 'text-xs' : 'text-sm'}`}>
                {m.value}
              </span>
              <span className="text-[9px] font-medium text-[var(--text-muted)] uppercase tracking-tight font-sans truncate">
                {m.label}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export const SemicircleGauge = memo(SemicircleGaugeComponent)
export default SemicircleGauge
