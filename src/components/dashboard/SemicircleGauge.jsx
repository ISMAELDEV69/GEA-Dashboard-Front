import React, { memo } from 'react'

/**
 * Componente SemicircleGauge (Cabina de Control / Cockpit Gauge)
 * Diseñado con números grandes, directos y de alto contraste:
 * - Tacómetro radial de 240° con puntero exterior indicador (cero interferencia con el texto central)
 * - Números analíticos en tamaño prominente (text-lg / text-xl font-black) y formato directo
 * - Badges de estado con LED indicador de alta visibilidad
 *
 * @param {number} value - Porcentaje actual (ej: 76.5)
 * @param {string} title - Título del indicador (ej: "Dotación vs RQ")
 * @param {number|null} target - Meta de referencia (ej: 80.0)
 * @param {'desercion'|'dotacion'} type - Determina el sentido del semáforo
 * @param {Array<{label: string, value: string|number, highlight?: 'healthy'|'caution'|'critical'}>} metrics - Filas clave-valor
 * @param {{label: string, tone?: 'healthy'|'caution'|'critical'}} status - Estado actual con LED indicador
 * @param {Array} subMetrics - Fallback de compatibilidad
 * @param {number} maxVal - Escala máxima (default: 100)
 */
function SemicircleGaugeComponent({
  value = 0,
  title = '',
  target = null,
  type = 'desercion',
  metrics = [],
  status = null,
  subMetrics = [],
  maxVal = 100,
  compact = false,
}) {
  const numericVal = Math.max(0, Number(value) || 0)
  const displayVal = numericVal.toFixed(2)
  const effectiveMax = Math.max(maxVal, numericVal > 100 ? Math.ceil(numericVal / 50) * 50 : 100)
  const pctRatio = Math.min(1, numericVal / effectiveMax)

  // ── 1. Determinar estado de salud y colores de acento ──
  let statusTone = 'healthy'
  let statusText = 'En Meta'

  if (type === 'desercion') {
    if (numericVal > 35) {
      statusTone = 'critical'
      statusText = 'Crítico'
    } else if (numericVal > 20) {
      statusTone = 'caution'
      statusText = 'Precaución'
    } else {
      statusTone = 'healthy'
      statusText = 'Controlado'
    }
  } else {
    // Para dotación, mayor es mejor
    if (numericVal >= 80) {
      statusTone = 'healthy'
      statusText = 'En Meta'
    } else if (numericVal >= 60) {
      statusTone = 'caution'
      statusText = 'Alerta'
    } else {
      statusTone = 'critical'
      statusText = 'Crítico'
    }
  }

  // Sobrescribir con status explícito si fue provisto
  if (status && status.label) {
    statusText = status.label
    if (status.tone) statusTone = status.tone
  }

  const toneConfig = {
    healthy: {
      text: 'text-emerald-400',
      dot: 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]',
      border: 'border-emerald-500/30',
      badgeBg: 'bg-emerald-500/15 text-emerald-300',
      needleGlow: '#10B981',
    },
    caution: {
      text: 'text-amber-400',
      dot: 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.9)]',
      border: 'border-amber-500/30',
      badgeBg: 'bg-amber-500/15 text-amber-300',
      needleGlow: '#F59E0B',
    },
    critical: {
      text: 'text-rose-400',
      dot: 'bg-rose-400 shadow-[0_0_8px_rgba(244,63,94,0.9)]',
      border: 'border-rose-500/30',
      badgeBg: 'bg-rose-500/15 text-rose-300',
      needleGlow: '#F43F5E',
    },
  }[statusTone]

  // ── 2. Geometría del Tacómetro Radial (240° Sweep) ──
  // Centro: (80, 80), Radio del arco: 52
  // Arco barre desde 210° (abajo-izq) hasta -30° (abajo-der) en sentido horario
  const cx = 80
  const cy = 80
  const radius = 52
  const arcLength = radius * ((240 * Math.PI) / 180) // ~217.82 px
  const strokeDashoffset = arcLength * (1 - pctRatio)

  // Ángulo del puntero en radianes y grados
  const needleDeg = 210 - pctRatio * 240
  const needleRad = (needleDeg * Math.PI) / 180

  // Puntero exterior: cuña indicadora que emerge desde r = 38 hasta r = 50
  // Al no nacer desde el centro (r=0), JAMÁS colisiona con el número central
  const tipRadius = 50
  const baseRadius = 38
  const tipX = cx + tipRadius * Math.cos(needleRad)
  const tipY = cy - tipRadius * Math.sin(needleRad)

  const perpRad = needleRad + Math.PI / 2
  const baseHalfWidth = 4.5
  const baseX = cx + baseRadius * Math.cos(needleRad)
  const baseY = cy - baseRadius * Math.sin(needleRad)
  const leftX = baseX + baseHalfWidth * Math.cos(perpRad)
  const leftY = baseY - baseHalfWidth * Math.sin(perpRad)
  const rightX = baseX - baseHalfWidth * Math.cos(perpRad)
  const rightY = baseY + baseHalfWidth * Math.sin(perpRad)

  // Marcador de Meta / Target (si aplica)
  let targetCoords = null
  if (target !== null && typeof target === 'number' && target >= 0 && target <= effectiveMax) {
    const tRatio = Math.min(1, target / effectiveMax)
    const tDeg = 210 - tRatio * 240
    const tRad = (tDeg * Math.PI) / 180
    targetCoords = {
      x: cx + radius * Math.cos(tRad),
      y: cy - radius * Math.sin(tRad),
      val: target,
    }
  }

  // Lista normalizada de métricas a mostrar en la columna derecha
  const displayMetrics = (metrics && metrics.length > 0)
    ? metrics
    : (subMetrics && subMetrics.length > 0)
      ? subMetrics
      : []

  // ID único para gradientes SVG
  const cleanId = title.replace(/[^a-zA-Z0-9]/g, '') || 'gauge'
  const arcGradId = `cockpitArcGrad_${cleanId}`
  const needleGlowId = `cockpitNeedleGlow_${cleanId}`

  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[var(--surface-elevated)] via-[var(--surface)] to-slate-950/80 border border-[var(--border-subtle)] hover:border-cyan-500/35 transition-all duration-300 p-4 shadow-lg shadow-black/25 flex flex-col justify-between group">
      {/* Fondo con resplandor técnico sutil */}
      <div className="pointer-events-none absolute -top-12 -left-12 w-36 h-36 bg-cyan-500/5 rounded-full blur-2xl group-hover:bg-cyan-500/10 transition-colors" />

      {/* ── Cabecera de la Tarjeta ── */}
      <div className="relative flex items-center justify-between pb-2.5 mb-2.5 border-b border-white/[0.08]">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-2 h-3.5 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.7)] shrink-0" />
          <h4 className="text-xs font-black uppercase tracking-wider text-white truncate">
            {title}
          </h4>
        </div>
        {target !== null && (
          <span className="shrink-0 text-[10.5px] font-mono font-black px-2.5 py-0.5 rounded-md bg-[var(--surface)] border border-cyan-500/25 text-cyan-300">
            META: <strong className="text-white">{target}%</strong>
          </span>
        )}
      </div>

      {/* ── Contenido Split: Tacómetro Radial + Métricas con Números Grandes ── */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5 items-center flex-1">
        {/* Lado Izquierdo: Tacómetro Radial Cockpit */}
        <div className="md:col-span-5 flex flex-col items-center justify-center relative">
          <div className="relative w-[150px] h-[135px] flex items-center justify-center">
            <svg viewBox="0 0 160 145" className="w-full h-full overflow-visible select-none">
              <defs>
                {/* Gradiente cromático según tipo */}
                {type === 'desercion' ? (
                  <linearGradient id={arcGradId} x1="0%" y1="100%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#06B6D4" />   {/* Cian / Seguro */}
                    <stop offset="35%" stopColor="#10B981" />  {/* Verde / En Meta */}
                    <stop offset="65%" stopColor="#F59E0B" />  {/* Ámbar / Alerta */}
                    <stop offset="100%" stopColor="#F43F5E" /> {/* Rojo / Crítico */}
                  </linearGradient>
                ) : (
                  <linearGradient id={arcGradId} x1="0%" y1="100%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#F43F5E" />   {/* Rojo / Crítico */}
                    <stop offset="45%" stopColor="#F59E0B" />  {/* Ámbar / En Proceso */}
                    <stop offset="75%" stopColor="#10B981" />  {/* Verde / Meta */}
                    <stop offset="100%" stopColor="#06B6D4" /> {/* Cian / Superávit */}
                  </linearGradient>
                )}

                {/* Filtro de brillo para la aguja */}
                <filter id={needleGlowId} x="-50%" y="-50%" width="200%" height="200%">
                  <feDropShadow dx="0" dy="0" stdDeviation="2.5" floodColor={toneConfig.needleGlow} floodOpacity="0.85" />
                </filter>
              </defs>

              {/* Riel oscuro de fondo (240° sweep) */}
              <path
                d="M 34.97 106 A 52 52 0 1 1 125.03 106"
                fill="none"
                stroke="rgba(255, 255, 255, 0.08)"
                strokeWidth="11"
                strokeLinecap="round"
              />

              {/* Arco graduado de progreso iluminado */}
              <path
                d="M 34.97 106 A 52 52 0 1 1 125.03 106"
                fill="none"
                stroke={`url(#${arcGradId})`}
                strokeWidth="11"
                strokeLinecap="round"
                strokeDasharray={arcLength}
                strokeDashoffset={strokeDashoffset}
                className="transition-all duration-700 ease-out"
                style={{
                  filter: `drop-shadow(0 0 7px ${toneConfig.needleGlow}55)`,
                }}
              />

              {/* Marcador visual de meta en el arco */}
              {targetCoords && (
                <circle
                  cx={targetCoords.x}
                  cy={targetCoords.y}
                  r="3.5"
                  fill="#FFFFFF"
                  stroke="#0F172A"
                  strokeWidth="1.5"
                />
              )}

              {/* Puntero indicador que apunta desde la corona interior hacia el arco */}
              <polygon
                points={`${leftX},${leftY} ${tipX},${tipY} ${rightX},${rightY}`}
                fill="#FFFFFF"
                className="transition-all duration-700 ease-out"
              />

              {/* Puntero con foco luminoso en la punta */}
              <circle
                cx={tipX}
                cy={tipY}
                r="3"
                fill="#FFFFFF"
                filter={`url(#${needleGlowId})`}
                className="transition-all duration-700 ease-out"
              />

              {/* Pozo interior oscuro / Dial Well protegido (cubre la base del puntero) */}
              <circle
                cx={cx}
                cy={cy}
                r="40"
                fill="#0A0E1A"
                stroke="rgba(255, 255, 255, 0.08)"
                strokeWidth="1.5"
              />

              {/* Hitos de escala alrededor del arco (0%, 25%, 50%, 75%, 100%) */}
              <text x="24" y="122" textAnchor="middle" className="fill-slate-500 font-mono text-[8px] font-bold">
                0%
              </text>
              <text x="22" y="58" textAnchor="middle" className="fill-slate-500 font-mono text-[8px] font-bold">
                25%
              </text>
              <text x="80" y="21" textAnchor="middle" className="fill-slate-500 font-mono text-[8px] font-bold">
                50%
              </text>
              <text x="138" y="58" textAnchor="middle" className="fill-slate-500 font-mono text-[8px] font-bold">
                75%
              </text>
              <text x="136" y="122" textAnchor="middle" className="fill-slate-500 font-mono text-[8px] font-bold">
                {effectiveMax}%
              </text>
            </svg>

            {/* Texto central en el interior del dial: 100% libre de interferencias */}
            <div className="absolute top-[48px] left-0 right-0 flex flex-col items-center justify-center pointer-events-none z-10">
              <span className="font-mono font-black text-xl text-white tracking-tight tabular-nums drop-shadow-md">
                {displayVal}%
              </span>
              <span className="text-[8.5px] font-black uppercase tracking-wider text-slate-400 mt-0.5">
                {type === 'dotacion' ? 'COBERTURA' : 'DESERCIÓN'}
              </span>
            </div>
          </div>
        </div>

        {/* Lado Derecho: Bloque Analítico con Números Grandes y Directos */}
        <div className="md:col-span-7 flex flex-col justify-center space-y-2 border-t md:border-t-0 md:border-l border-white/[0.08] pt-2.5 md:pt-0 md:pl-4">
          {displayMetrics.map((m, idx) => {
            const rawVal = String(m.value || '')
            // Separar número de la unidad/detalle para darle tamaño gigante
            const match = rawVal.match(/^([+\-]?[\d.,]+)\s*(.*)$/)
            const numPart = match ? match[1] : rawVal
            const unitPart = match ? match[2] : ''

            const isHighlight = m.highlight
            const isNegative = rawVal.startsWith('-')
            const isPositive = rawVal.startsWith('+')

            const valColor =
              isHighlight === 'critical' || isNegative
                ? 'text-rose-400'
                : isHighlight === 'healthy' || isPositive
                  ? 'text-emerald-400'
                  : isHighlight === 'caution'
                    ? 'text-amber-400'
                    : 'text-white'

            return (
              <div
                key={idx}
                className="flex items-center justify-between gap-3 py-1 border-b border-white/[0.06] last:border-b-0"
              >
                <span className="text-xs font-semibold text-slate-300 truncate">
                  {m.label}:
                </span>
                <div className="flex items-baseline gap-1.5 shrink-0 text-right">
                  <span className={`text-base sm:text-lg lg:text-xl font-black font-mono tabular-nums tracking-tight ${valColor}`}>
                    {numPart}
                  </span>
                  {unitPart && (
                    <span className="text-[11px] font-bold text-slate-400/90 tracking-tight">
                      {unitPart}
                    </span>
                  )}
                </div>
              </div>
            )
          })}

          {/* Fila de Estado / Status de Salud con Badge Grande y LED Pulsante */}
          <div className="flex items-center justify-between gap-2 pt-2 text-xs">
            <span className="text-xs font-semibold text-slate-400">Status:</span>
            <div
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-black tracking-wide ${toneConfig.badgeBg} ${toneConfig.border}`}
            >
              <span className={`w-2 h-2 rounded-full ${toneConfig.dot} animate-pulse`} />
              <span className={toneConfig.text}>{statusText}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export const SemicircleGauge = memo(SemicircleGaugeComponent)
export default SemicircleGauge
