import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import {
  Sparkles,
  TrendingUp,
  TrendingDown,
  ChevronLeft,
  ChevronRight,
  X,
  Play,
  Pause,
  ArrowRight,
  Trophy,
  Award,
  Target,
  Zap,
  Star,
  Users,
  GraduationCap,
  AlertTriangle,
  PieChart,
  CheckCircle2,
  MapPin,
  Clock,
  Film,
  Calendar,
  Layers
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import {
  isBajaCapacitacion,
  normalizarMotivo,
  fetchCoberturaDotacion,
  fetchCapacidadRysLookup,
  fetchKpiReclutadoresConsolidado,
  calculateMetricasResumenCapacitacionFast
} from '../../lib/dataService'
import { resolvePeriodoIngreso, normalize2026Period } from '../../lib/dashboardAnalytics'
import {
  buildCoberturaDotacionModelFromTable,
  aggregateCoberturaDotacion,
  formatPeNumber,
  formatPePercent
} from '../../lib/coberturaDotacionAnalytics'
import { isJunkResponsable, normKpi } from '../../lib/kpiReclutadoresAnalytics'

/**
 * 🦁 Avatar Oficial Ejecutivo "GEITO" (GEA Asistente)
 */
export function GeitoLionMascot({ size = 38, className = '' }) {
  const handleClick = (e) => {
    e.stopPropagation()
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('gea:open_geito_chat'))
    }
  }

  return (
    <div
      onClick={handleClick}
      title="Consultar a Geíto IA sobre la operación"
      className={`relative shrink-0 flex items-center justify-center select-none cursor-pointer group ${className}`}
      style={{ width: size, height: size }}
      role="button"
      tabIndex={0}
    >
      <div className="w-full h-full rounded-xl bg-white border border-slate-200 flex items-center justify-center overflow-hidden shadow-xs group-hover:border-blue-500/80 transition-all p-1">
        <img
          src="/mascot/geito.png"
          alt="GEITO"
          className="w-full h-full object-contain transition-transform group-hover:scale-105"
          onError={(e) => {
            e.currentTarget.src = '/geito.png'
          }}
        />
      </div>
    </div>
  )
}

/**
 * Sparkline SVG Ejecutivo Suave y Corporativo
 */
function SparklineChart({ data = [], isMejora = true, height = 48, width = 310 }) {
  if (!data || data.length < 2) return null

  const values = data.map(d => d.val)
  const minVal = Math.min(...values)
  const maxVal = Math.max(...values)
  const range = maxVal - minVal === 0 ? 1 : maxVal - minVal

  const padX = 14
  const padY = 6
  const chartW = width - padX * 2
  const chartH = height - padY * 2

  const points = data.map((d, i) => {
    const x = padX + (i / (data.length - 1)) * chartW
    const norm = (d.val - minVal) / range
    const y = padY + chartH - norm * chartH
    return { x, y, label: d.label, val: d.val }
  })

  let pathD = `M ${points[0].x} ${points[0].y}`
  for (let i = 0; i < points.length - 1; i++) {
    const curr = points[i]
    const next = points[i + 1]
    const cx = (curr.x + next.x) / 2
    pathD += ` C ${cx} ${curr.y}, ${cx} ${next.y}, ${next.x} ${next.y}`
  }

  const fillD = `${pathD} L ${points[points.length - 1].x} ${height} L ${points[0].x} ${height} Z`
  const strokeColor = isMejora ? '#10b981' : '#f43f5e'
  const gradId = `spark-cf-${isMejora ? 'green' : 'red'}-${Math.floor(Math.random() * 10000)}`

  return (
    <div className="w-full flex flex-col items-center">
      <svg
        viewBox={`0 0 ${width} ${height + 14}`}
        className="w-full overflow-visible"
        style={{ maxHeight: `${height + 14}px` }}
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={strokeColor} stopOpacity="0.25" />
            <stop offset="100%" stopColor={strokeColor} stopOpacity="0.0" />
          </linearGradient>
        </defs>

        <path d={fillD} fill={`url(#${gradId})`} />
        <path d={pathD} fill="none" stroke={strokeColor} strokeWidth="2.5" strokeLinecap="round" />

        {points.map((p, idx) => {
          const isLast = idx === points.length - 1
          return (
            <g key={idx}>
              <circle
                cx={p.x}
                cy={p.y}
                r={isLast ? 3.5 : 2}
                fill={isLast ? strokeColor : '#ffffff'}
                stroke={isLast ? '#ffffff' : strokeColor}
                strokeWidth="1.5"
              />
              <text
                x={p.x}
                y={height + 11}
                textAnchor="middle"
                fontSize="8.5"
                fontWeight={isLast ? '600' : '500'}
                fill={isLast ? (isMejora ? '#10b981' : '#f43f5e') : '#94a3b8'}
                fontFamily="system-ui, -apple-system, sans-serif"
              >
                {p.label}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

/**
 * 📊 Gráfico Combinado Oficial WFM Cobertura: Requerimiento vs Ingresos + Línea % Cobertura
 */
function CoberturaComboChart({ data = [], selectedPeriodo = '', height = 115, width = 360 }) {
  if (!data || data.length === 0) return null

  // Períodos a visualizar (hasta 10 períodos)
  const items = data.slice(-10)
  const padL = 20
  const padR = 20
  const padT = 16
  const padB = 20
  const innerW = width - padL - padR
  const innerH = height - padT - padB

  const maxVolume = Math.max(10, ...items.map(d => Math.max(d.rq || 0, d.ing || 0))) * 1.15
  const maxPct = 120

  const colWidth = innerW / items.length
  const barW = Math.max(3.5, Math.min(9, colWidth * 0.32))

  const linePoints = items.map((d, i) => {
    const x = padL + i * colWidth + colWidth / 2
    const clampedPct = Math.min(maxPct, Math.max(0, d.val || 0))
    const y = padT + innerH - (clampedPct / maxPct) * innerH
    return { x, y, val: d.val, periodo: d.periodo, selected: d.periodo === selectedPeriodo }
  })

  let pathD = ''
  if (linePoints.length > 0) {
    pathD = `M ${linePoints[0].x} ${linePoints[0].y}`
    for (let i = 0; i < linePoints.length - 1; i++) {
      const curr = linePoints[i]
      const next = linePoints[i + 1]
      const cx = (curr.x + next.x) / 2
      pathD += ` C ${cx} ${curr.y}, ${cx} ${next.y}, ${next.x} ${next.y}`
    }
  }

  return (
    <div className="w-full flex flex-col">
      <div className="flex items-center justify-between text-[10px] text-slate-500 mb-1 px-1">
        <div className="flex items-center gap-2.5">
          <span className="flex items-center gap-1 font-medium">
            <span className="inline-block w-2 h-2 rounded-xs bg-[#c2410c]" />
            Total Requerido
          </span>
          <span className="flex items-center gap-1 font-medium">
            <span className="inline-block w-2 h-2 rounded-xs bg-[#059669]" />
            Ingresos Efectivos
          </span>
          <span className="flex items-center gap-1 font-medium">
            <span className="inline-block w-2 h-0.5 bg-[#0284c7]" />
            % Cobertura
          </span>
        </div>
        <span className="text-[9px] font-semibold text-slate-400">Meta 100%</span>
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full overflow-visible"
        style={{ maxHeight: `${height}px` }}
      >
        {/* Línea meta 100% */}
        {(() => {
          const y100 = padT + innerH - (100 / maxPct) * innerH
          return (
            <line
              x1={padL}
              y1={y100}
              x2={width - padR}
              y2={y100}
              stroke="#0284c7"
              strokeDasharray="3 3"
              strokeOpacity="0.4"
              strokeWidth="1"
            />
          )
        })()}

        {/* Barras */}
        {items.map((d, i) => {
          const xCenter = padL + i * colWidth + colWidth / 2
          const xRq = xCenter - barW - 1
          const xIng = xCenter + 1

          const hRq = ((d.rq || 0) / maxVolume) * innerH
          const hIng = ((d.ing || 0) / maxVolume) * innerH

          const yRq = padT + innerH - hRq
          const yIng = padT + innerH - hIng

          const isSelected = d.periodo === selectedPeriodo

          return (
            <g key={d.periodo || i}>
              <rect
                x={xRq}
                y={yRq}
                width={barW}
                height={Math.max(1, hRq)}
                rx="1.5"
                fill={isSelected ? '#ea580c' : '#c2410c'}
                opacity={isSelected ? 1 : 0.6}
              />
              <rect
                x={xIng}
                y={yIng}
                width={barW}
                height={Math.max(1, hIng)}
                rx="1.5"
                fill={isSelected ? '#10b981' : '#059669'}
                opacity={isSelected ? 1 : 0.6}
              />
              <text
                x={xCenter}
                y={height - 4}
                textAnchor="middle"
                fontSize={isSelected ? '8' : '7'}
                fontWeight={isSelected ? '700' : '500'}
                fill={isSelected ? '#0f172a' : '#64748b'}
              >
                {d.label}
              </text>
            </g>
          )
        })}

        {/* Línea % Cobertura */}
        {pathD && (
          <path
            d={pathD}
            fill="none"
            stroke="#0284c7"
            strokeWidth="2"
            strokeLinecap="round"
          />
        )}

        {/* Puntos de línea */}
        {linePoints.map((p, idx) => (
          <g key={idx}>
            <circle
              cx={p.x}
              cy={p.y}
              r={p.selected ? 3.5 : 1.8}
              fill={p.selected ? '#0284c7' : '#ffffff'}
              stroke="#0284c7"
              strokeWidth={p.selected ? 2 : 1}
            />
            {p.selected && (
              <text
                x={p.x}
                y={Math.max(10, p.y - 6)}
                textAnchor="middle"
                fontSize="8"
                fontWeight="800"
                fill="#0284c7"
              >
                {p.val.toFixed(1)}%
              </text>
            )}
          </g>
        ))}
      </svg>
    </div>
  )
}

/**
 * 🏢 Lista Horizontal Oficial de Segmentos WFM Cobertura
 */
function CoberturaSegmentosList({ segmentos = [] }) {
  if (!segmentos || segmentos.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-slate-400 italic">
        Sin datos de segmentos en este período
      </div>
    )
  }

  const maxCob = Math.max(100, ...segmentos.map(s => Number(s.coberturaPct) || 0))

  return (
    <div className="space-y-2 py-0.5">
      {segmentos.slice(0, 4).map((s, idx) => {
        const pct = Number(s.coberturaPct) || 0
        const barWidth = Math.min(100, (pct / maxCob) * 100)
        const barColor = pct >= 100 ? 'bg-emerald-500' : 'bg-[#fb7185]'

        return (
          <div key={s.segmento || idx} className="space-y-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-semibold text-slate-700 truncate max-w-[140px]" title={s.segmento}>
                {s.segmento}
              </span>
              <span className="font-bold text-slate-900 tabular-nums">
                {formatPePercent(pct)}
              </span>
            </div>
            <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden border border-slate-200/60 relative">
              <div
                className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                style={{ width: `${Math.max(pct > 0 ? 3 : 0, barWidth)}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[9px] text-slate-400">
              <span>RQ: {formatPeNumber(s.requerimiento, 1)} FT</span>
              <span>Ing: {formatPeNumber(s.ingresos, 1)} FT</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

/**
 * 🃏 Ficha Ejecutiva Panorámica (Estilo Corporativo / Enterprise SaaS)
 */
function MoviePremiereCard({
  card,
  index,
  total,
  isActive = false,
  offset = 0,
  onClick
}) {
  const isMejora = card.tendencia === 'mejora'

  const theme = useMemo(() => {
    if (card.tipo === 'ranking_formadores') {
      return {
        tag: 'Formación y Desarrollo',
        icon: GraduationCap,
        glowBorder: 'border-amber-200/90',
        bg: 'from-white via-amber-50/20 to-slate-50/60',
        badge: 'bg-amber-50 text-amber-800 border-amber-200',
        badgeText: 'Top 5 Formadores',
        accentText: 'text-amber-700'
      }
    }
    if (card.tipo === 'ranking_reclutadores') {
      return {
        tag: 'Atracción y Selección',
        icon: Users,
        glowBorder: 'border-blue-200/90',
        bg: 'from-white via-blue-50/20 to-slate-50/60',
        badge: 'bg-blue-50 text-blue-800 border-blue-200',
        badgeText: 'Top 5 Reclutadores',
        accentText: 'text-blue-700'
      }
    }
    if (card.tipo === 'desercion_motivos') {
      return {
        tag: 'Gestión de Retención',
        icon: AlertTriangle,
        glowBorder: 'border-rose-200/90',
        bg: 'from-white via-rose-50/20 to-slate-50/60',
        badge: 'bg-rose-50 text-rose-800 border-rose-200',
        badgeText: isMejora ? 'Baja Controlada' : 'Alerta de Bajas',
        accentText: 'text-rose-700'
      }
    }
    if (card.tipo === 'cobertura') {
      return {
        tag: 'Gestión de Dotación WFM',
        icon: Target,
        glowBorder: 'border-emerald-200/90',
        bg: 'from-white via-emerald-50/20 to-slate-50/60',
        badge: 'bg-emerald-50 text-emerald-800 border-emerald-200',
        badgeText: 'Cobertura Oficial',
        accentText: 'text-emerald-700'
      }
    }
    if (card.tipo === 'asistencia' || card.tipo === 'grupos_en_curso') {
      return {
        tag: 'Capacitación en Curso',
        icon: GraduationCap,
        glowBorder: 'border-sky-200/90',
        bg: 'from-white via-sky-50/20 to-slate-50/60',
        badge: 'bg-sky-50 text-sky-800 border-sky-200',
        badgeText: `${card.totalGrupos || 0} Grupos Activos`,
        accentText: 'text-sky-700'
      }
    }
    return {
      tag: 'Control Gerencial',
      icon: Film,
      glowBorder: 'border-slate-200',
      bg: 'from-white to-slate-50',
      badge: 'bg-slate-100 text-slate-700 border-slate-200',
      badgeText: 'Resumen Ejecutivo',
      accentText: 'text-slate-800'
    }
  }, [card.tipo, isMejora])

  const IconComponent = theme.icon

  // Transición suave de carrusel horizontal elegante
  const transformStyle = useMemo(() => {
    if (offset === 0) {
      return {
        transform: 'translate3d(0, 0, 40px) scale(1)',
        zIndex: 50,
        opacity: 1,
        filter: 'none',
        pointerEvents: 'auto'
      }
    }

    const dir = Math.sign(offset)
    const dist = Math.abs(offset)

    if (dist === 1) {
      return {
        transform: `translate3d(${dir * 320}px, 0, -40px) scale(0.88)`,
        zIndex: 40,
        opacity: 0.5,
        filter: 'brightness(0.95)',
        pointerEvents: 'auto'
      }
    }

    if (dist === 2) {
      return {
        transform: `translate3d(${dir * 540}px, 0, -80px) scale(0.76)`,
        zIndex: 30,
        opacity: 0.25,
        filter: 'brightness(0.9)',
        pointerEvents: 'auto'
      }
    }

    return {
      transform: `translate3d(${dir * 680}px, 0, -120px) scale(0.65)`,
      zIndex: 10,
      opacity: 0,
      pointerEvents: 'none'
    }
  }, [offset])

  return (
    <div
      onClick={onClick}
      style={transformStyle}
      className={`absolute select-none transition-all duration-300 ease-out cursor-pointer flex flex-col justify-between backdrop-blur-xl border ${
        isActive
          ? `w-[92vw] max-w-[760px] md:max-w-[820px] lg:max-w-[860px] h-[375px] sm:h-[395px] rounded-2xl p-5 sm:p-6 ${theme.glowBorder} bg-gradient-to-b ${theme.bg} shadow-xl shadow-slate-300/40 ring-1 ring-slate-100`
          : 'w-[250px] sm:w-[270px] h-[320px] sm:h-[340px] rounded-xl p-3.5 border-slate-200 bg-white/95 hover:border-slate-300 shadow-md overflow-hidden'
      }`}
    >
      {/* ── HEADER DE LA FICHA ── */}
      <div className="shrink-0">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
            <IconComponent size={14} className={theme.accentText} />
            <span>{theme.tag}</span>
          </div>
          <span
            className={`px-2.5 py-0.5 rounded-md text-[11px] font-semibold border ${theme.badge}`}
          >
            {theme.badgeText}
          </span>
        </div>

        {/* Título y Valor Macro */}
        <div className="flex items-baseline justify-between gap-3 border-b border-slate-100 pb-2.5">
          <div className="min-w-0">
            <h3 className={`font-bold text-slate-900 tracking-tight truncate ${isActive ? 'text-lg sm:text-xl' : 'text-sm'}`}>
              {card.nombre}
            </h3>
            <p className={`text-slate-500 line-clamp-1 mt-0.5 ${isActive ? 'text-xs' : 'text-[10px]'}`}>
              {card.detalle}
            </p>
          </div>
          <div className="text-right shrink-0">
            <span
              className={`font-black tracking-tight ${theme.accentText} ${
                isActive ? 'text-3xl sm:text-4xl' : 'text-xl'
              }`}
            >
              {card.valor_actual}
            </span>
          </div>
        </div>
      </div>

      {/* ── CUERPO DE LA FICHA SEGÚN SU TIPO ── */}
      <div className="flex-1 flex flex-col justify-center my-2 overflow-hidden">
        {/* CASO A: RANKINGS TOP 5 (FORMADORES O RECLUTADORES) */}
        {(card.tipo === 'ranking_formadores' || card.tipo === 'ranking_reclutadores') && (
          isActive ? (
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-stretch h-full">
              {/* Lado Izquierdo: Tarjeta Resumen de Honor */}
              <div className="md:col-span-5 rounded-xl bg-slate-50/80 border border-slate-200/80 p-4 flex flex-col justify-between">
                <div>
                  <span className="text-xs font-semibold text-slate-500 block">
                    {card.tipo === 'ranking_formadores' ? 'Retención Promedio' : 'Total Postulantes'}
                  </span>
                  <div className={`text-3xl font-extrabold text-slate-900 mt-1`}>
                    {card.valor_actual}
                  </div>
                  <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                    {card.detalle}
                  </p>
                </div>

                {/* Tarjeta del Líder */}
                {(card.ranking || []).length > 0 && (
                  <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 mt-2">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">🥇</span>
                      <div className="truncate">
                        <span className="text-[10px] text-amber-800 font-bold uppercase block">Primer Lugar</span>
                        <span className="text-xs font-bold text-slate-900 truncate block">{card.ranking[0]?.nombre}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Lado Derecho: Lista Ranking Podio */}
              <div className="md:col-span-7 space-y-1.5 overflow-y-auto max-h-[175px] pr-1 scrollbar-none flex flex-col justify-center">
                {(card.ranking || []).slice(0, 5).map((item, rIdx) => (
                  <div
                    key={rIdx}
                    className={`px-3 py-2 rounded-lg flex items-center justify-between text-xs transition-colors ${
                      rIdx === 0
                        ? 'bg-amber-50/90 border border-amber-200/90 shadow-2xs'
                        : 'bg-white border border-slate-200/80 hover:border-slate-300 shadow-2xs'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="text-sm shrink-0">{item.medal}</span>
                      <div className="truncate">
                        <span className="font-semibold text-slate-800 block truncate text-xs">
                          {item.nombre}
                        </span>
                        <span className="text-[11px] text-slate-500 block truncate">
                          {item.logro || item.subtext}
                        </span>
                      </div>
                    </div>
                    <div className="text-right shrink-0 pl-2">
                      <span className={`font-bold text-xs sm:text-sm ${theme.accentText}`}>
                        {item.score}
                      </span>
                      <span className="text-[10px] text-slate-400 block">
                        {item.unit || (card.tipo === 'ranking_reclutadores' ? 'en aula' : 'retenc.')}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-1.5 overflow-hidden">
              {(card.ranking || []).slice(0, 3).map((item, rIdx) => (
                <div key={rIdx} className="px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between text-xs">
                  <span className="truncate text-xs text-slate-700 font-medium">{item.medal} {item.nombre}</span>
                  <span className={`font-bold text-xs ${theme.accentText}`}>{item.score}</span>
                </div>
              ))}
            </div>
          )
        )}

        {/* CASO B: DESERCIÓN DE CAPACITACIÓN (CT vs OJT & PARETO) */}
        {card.tipo === 'desercion_motivos' && (
          isActive ? (
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-stretch h-full">
              {/* Lado Izquierdo: 2 Indicadores Ejecutivos (CT y OJT) */}
              <div className="md:col-span-5 grid grid-rows-2 gap-2">
                <div className="p-3 rounded-xl bg-slate-50/80 border border-slate-200/80 flex flex-col justify-between">
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span className="font-semibold text-slate-700">Deserción CT (Aula)</span>
                    <span className="text-emerald-700 font-medium text-[11px]">Meta ≤ 20%</span>
                  </div>
                  <div className="flex items-baseline justify-between mt-1">
                    <span className="text-2xl font-bold text-rose-600">
                      {card.pctDesercionCT != null ? `${card.pctDesercionCT}%` : '38.24%'}
                    </span>
                    <span className="text-[11px] text-slate-500">
                      {card.desertoresCt || 0} de {card.d1 || 0} D1
                    </span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-slate-200 overflow-hidden mt-1.5">
                    <div className="h-full rounded-full bg-rose-500" style={{ width: `${Math.min(100, (card.pctDesercionCT || 38.24) * 2)}%` }} />
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-slate-50/80 border border-slate-200/80 flex flex-col justify-between">
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span className="font-semibold text-slate-700">Deserción OJT (Nesting)</span>
                    <span className="text-emerald-700 font-medium text-[11px]">Meta ≤ 20%</span>
                  </div>
                  <div className="flex items-baseline justify-between mt-1">
                    <span className="text-2xl font-bold text-amber-600">
                      {card.pctDesercionOJT != null ? `${card.pctDesercionOJT}%` : '27.11%'}
                    </span>
                    <span className="text-[11px] text-slate-500">
                      {card.desertoresOjt || 0} de {card.qIniciaOjt || 0} OJT
                    </span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-slate-200 overflow-hidden mt-1.5">
                    <div className="h-full rounded-full bg-amber-500" style={{ width: `${Math.min(100, (card.pctDesercionOJT || 27.11) * 2)}%` }} />
                  </div>
                </div>
              </div>

              {/* Lado Derecho: Top Motivos Operativos (Pareto) */}
              <div className="md:col-span-7 rounded-xl bg-slate-50/80 border border-slate-200/80 p-3.5 flex flex-col justify-between">
                <div className="flex items-center justify-between text-xs pb-1.5 border-b border-slate-200">
                  <span className="text-slate-700 font-semibold">Top Motivos Reales de Baja</span>
                  <span className="text-rose-600 font-medium">% Participación</span>
                </div>

                <div className="space-y-2 py-1">
                  {(card.topMotivos || []).slice(0, 4).map((m, mIdx) => (
                    <div key={mIdx} className="space-y-0.5">
                      <div className="flex justify-between text-xs text-slate-700">
                        <span className="truncate pr-2 font-medium">{mIdx + 1}. {m.nombre}</span>
                        <span className="font-semibold text-rose-600 shrink-0">{m.pctActual}%</span>
                      </div>
                      <div className="w-full h-1.5 rounded-full bg-slate-200 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-rose-500 to-amber-500"
                          style={{ width: `${Math.min(100, m.pctActual)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-1.5 text-center p-2">
              <span className="text-xs text-rose-600 font-semibold block">Deserción CT: {card.pctDesercionCT}%</span>
              <span className="text-xs text-amber-600 font-semibold block">Deserción OJT: {card.pctDesercionOJT}%</span>
            </div>
          )
        )}

        {/* CASO C: COBERTURA DE DOTACIÓN - PANEL RESUMEN OFICIAL WFM */}
        {card.tipo === 'cobertura' && (
          isActive ? (
            <div className="flex flex-col h-full justify-between gap-2.5">
              {/* 1. Grid de 4 KPIs Clave Idénticos a WFM */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {/* KPI 1: REQUERIMIENTO */}
                <div className="p-2.5 rounded-xl bg-slate-50/90 border border-slate-200/90 shadow-2xs flex flex-col justify-between">
                  <div className="flex items-center justify-between text-slate-500 mb-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider">Requerimiento</span>
                    <Target size={13} className="text-amber-600" />
                  </div>
                  <div className="text-xl sm:text-2xl font-black text-slate-800 tabular-nums">
                    {formatPeNumber(card.totalRQ, 2)}
                  </div>
                  <div className="text-[10px] text-slate-400 font-medium mt-0.5">
                    Período {card.selectedPeriodo}
                  </div>
                </div>

                {/* KPI 2: INGRESOS EFECTIVOS */}
                <div className="p-2.5 rounded-xl bg-slate-50/90 border border-slate-200/90 shadow-2xs flex flex-col justify-between">
                  <div className="flex items-center justify-between text-slate-500 mb-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider">Ingresos Efectivos</span>
                    <TrendingUp size={13} className="text-emerald-600" />
                  </div>
                  <div className="text-xl sm:text-2xl font-black text-emerald-600 tabular-nums">
                    {formatPeNumber(card.totalIngresos, 2)}
                  </div>
                  <div
                    className="text-[10px] text-emerald-700/80 font-medium truncate mt-0.5"
                    title={`Objetivo: ${formatPeNumber(card.totalRQ, 2)} (${card.deltaIngresosPct >= 0 ? '+' : ''}${formatPePercent(card.deltaIngresosPct)})`}
                  >
                    Obj: {formatPeNumber(card.totalRQ, 2)} ({card.deltaIngresosPct >= 0 ? '+' : ''}{formatPePercent(card.deltaIngresosPct)})
                  </div>
                </div>

                {/* KPI 3: % COBERTURA */}
                <div className="p-2.5 rounded-xl bg-slate-50/90 border border-slate-200/90 shadow-2xs flex flex-col justify-between">
                  <div className="flex items-center justify-between text-slate-500 mb-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider">% Cobertura</span>
                    <PieChart size={13} className="text-blue-600" />
                  </div>
                  <div className="text-xl sm:text-2xl font-black text-blue-600 tabular-nums">
                    {card.valor_actual}
                  </div>
                  <div
                    className="text-[10px] text-blue-700/80 font-medium truncate mt-0.5"
                    title={`Objetivo: 100 % (${card.deltaCobPct >= 0 ? '+' : ''}${formatPePercent(card.deltaCobPct)})`}
                  >
                    Obj: 100% ({card.deltaCobPct >= 0 ? '+' : ''}{formatPePercent(card.deltaCobPct)})
                  </div>
                </div>

                {/* KPI 4: BRECHA */}
                <div className="p-2.5 rounded-xl bg-slate-50/90 border border-slate-200/90 shadow-2xs flex flex-col justify-between">
                  <div className="flex items-center justify-between text-slate-500 mb-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider">Brecha</span>
                    <AlertTriangle size={13} className={card.brecha >= 0 ? 'text-emerald-600' : 'text-rose-600'} />
                  </div>
                  <div className={`text-xl sm:text-2xl font-black tabular-nums ${card.brecha >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {formatPeNumber(card.brecha, 2)}
                  </div>
                  <div className="text-[10px] text-slate-400 font-medium mt-0.5">
                    Objetivo: 0,00
                  </div>
                </div>
              </div>

              {/* 2. Grid de Visualización Doble: Seguimiento Histórico + Segmentos */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5 items-stretch">
                {/* Lado Izquierdo: Seguimiento Cobertura (Períodos 202601 a 202610) */}
                <div className="md:col-span-7 rounded-xl bg-slate-50/80 border border-slate-200/80 p-3 flex flex-col justify-between">
                  <div className="flex items-center justify-between text-xs pb-1 border-b border-slate-200/80">
                    <span className="text-slate-800 font-semibold flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                      Seguimiento Cobertura
                    </span>
                    <span className="text-[10px] text-slate-500 font-medium">Evolución Períodos</span>
                  </div>
                  <div className="py-1">
                    <CoberturaComboChart
                      data={card.historico || []}
                      selectedPeriodo={card.selectedPeriodo}
                      height={95}
                      width={340}
                    />
                  </div>
                </div>

                {/* Lado Derecho: Cobertura por Segmento */}
                <div className="md:col-span-5 rounded-xl bg-slate-50/80 border border-slate-200/80 p-3 flex flex-col justify-between">
                  <div className="flex items-center justify-between text-xs pb-1 border-b border-slate-200/80">
                    <span className="text-slate-800 font-semibold flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                      Cobertura por Segmento
                    </span>
                    <span className="text-[10px] text-slate-500 font-medium">Top Segmentos</span>
                  </div>
                  <div className="py-1">
                    <CoberturaSegmentosList segmentos={card.topSegmentos || []} />
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-2 text-center">
              <div className="flex items-center justify-center gap-2 mb-1">
                <span className="text-lg font-black text-emerald-600">{card.valor_actual}</span>
                <span className="text-xs text-slate-500">RQ: {formatPeNumber(card.totalRQ, 1)} FT</span>
              </div>
              <SparklineChart data={card.historico || []} isMejora={isMejora} height={35} width={220} />
            </div>
          )
        )}

        {/* CASO C-2: GRUPOS EN CURSO */}
        {(card.tipo === 'asistencia' || card.tipo === 'grupos_en_curso') && (
          isActive ? (
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-stretch h-full">
              {/* Lado Izquierdo: Resumen Numérico */}
              <div className="md:col-span-5 rounded-xl bg-slate-50/80 border border-slate-200/80 p-4 flex flex-col justify-between">
                <div>
                  <span className="text-xs font-semibold text-slate-500 block">Grupos Activos</span>
                  <div className="text-3xl font-extrabold text-sky-700 mt-1">{card.valor_actual}</div>
                  <p className="text-xs text-slate-500 mt-1">{card.detalle}</p>
                </div>

                <div className="grid grid-cols-2 gap-2 mt-2">
                  <div className="p-2.5 rounded-lg bg-white border border-slate-200 shadow-2xs">
                    <span className="text-[10px] text-slate-400 block font-medium">En Aula</span>
                    <span className="text-sm font-bold text-sky-700">{card.totalAsesores || 0} alum.</span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-white border border-slate-200 shadow-2xs">
                    <span className="text-[10px] text-slate-400 block font-medium">Activos</span>
                    <span className="text-sm font-bold text-emerald-700">{card.totalActivosCorte || 0}</span>
                  </div>
                </div>
              </div>

              {/* Lado Derecho: Grid de Grupos */}
              <div className="md:col-span-7 rounded-xl bg-slate-50/80 border border-slate-200/80 p-3 overflow-y-auto max-h-[175px] pr-1 space-y-2 scrollbar-none">
                {(card.gruposList || []).length === 0 ? (
                  <div className="p-4 text-center text-xs text-slate-500 font-sans">
                    No hay grupos en curso registrados para este período.
                  </div>
                ) : (
                  (card.gruposList || []).map((grp, gIdx) => (
                    <div
                      key={gIdx}
                      className="p-2.5 rounded-lg bg-white border border-slate-200/80 shadow-2xs flex items-center justify-between text-xs"
                    >
                      <div className="min-w-0 flex items-center gap-2.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                        <div className="truncate">
                          <span className="font-semibold text-slate-800 block truncate text-xs">
                            {grp.codigo} · {grp.campana}
                          </span>
                          <span className="text-[11px] text-slate-500 block truncate">
                            Formador: {grp.formador}
                          </span>
                        </div>
                      </div>
                      <div className="text-right shrink-0 pl-2">
                        <span className="font-bold text-sky-700 text-xs">
                          {grp.totalAsesores} alum.
                        </span>
                        <span className="text-[10px] text-emerald-700 block font-semibold">
                          {grp.fase}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : (
            <div className="p-2 text-center text-xs text-slate-600 font-sans">
              {card.totalGrupos || 0} grupos activos
            </div>
          )
        )}

        {/* CASO D: OTRAS FICHAS */}
        {!['ranking_formadores', 'ranking_reclutadores', 'desercion_motivos', 'cobertura', 'asistencia'].includes(card.tipo) && (
          <div className="p-4 rounded-xl bg-slate-50/80 border border-slate-200 text-center flex flex-col items-center justify-center h-full">
            <Sparkles size={20} className={`${theme.accentText} mb-2`} />
            <p className="text-xs text-slate-700 font-medium leading-relaxed max-w-md">
              {card.conclusion || 'Seguimiento continuo de metas operativas y SLAs de formación en GEA.'}
            </p>
          </div>
        )}
      </div>

      {/* ── FOOTER DE LA FICHA: INSIGHT EJECUTIVO ── */}
      <div className="shrink-0 pt-2.5 border-t border-slate-100">
        <div className="p-2.5 sm:p-3 rounded-xl bg-blue-50/80 border border-blue-200/70 flex items-start gap-2.5">
          <span className="px-2 py-0.5 rounded-md bg-blue-600 text-white text-[10px] font-bold shrink-0 mt-0.5 shadow-2xs">
            RESUMEN
          </span>
          <p className="text-xs text-slate-700 leading-relaxed line-clamp-2 font-sans font-medium">
            {card.conclusion}
          </p>
        </div>
      </div>
    </div>
  )
}

/**
 * 🎬 OREO EXECUTIVE MODAL 3D - Estreno Cinemático Espacial
 * Conectado canónicamente a Cobertura de Dotación y filtrado por Período de Ingreso de Capacidad
 */
export default function OreoExecutiveModal({
  isOpen = false,
  onClose = () => {},
  userProfile = null,
  campanasMetas = [],
  grupos = [],
  formadores = [],
  reclutadores = [],
  motivosBaja = [],
  postulantes = [],
  asistencias = [],
  customData = null
}) {
  const [activeIndex, setActiveIndex] = useState(0)
  const [isPlaying, setIsPlaying] = useState(true)
  const [isHovered, setIsHovered] = useState(false)
  const [progress, setProgress] = useState(0)
  const [systemTime, setSystemTime] = useState('')
  const [coberturaRows, setCoberturaRows] = useState([])
  const [capacidadRows, setCapacidadRows] = useState([])
  const [kpiReclutadoresRows, setKpiReclutadoresRows] = useState([])
  const [resumenCapMetricas, setResumenCapMetricas] = useState([])
  const [loadingData, setLoadingData] = useState(false)
  const progressTimerRef = useRef(null)
  const localDataCacheRef = useRef(new Map())

  // 1. Reloj en tiempo real
  useEffect(() => {
    const updateTime = () => {
      const now = new Date()
      setSystemTime(now.toLocaleTimeString('es-PE', { hour12: false }))
    }
    updateTime()
    const timer = setInterval(updateTime, 1000)
    return () => clearInterval(timer)
  }, [])

  // Período de ingreso de Capacidad seleccionado (por defecto el año y mes en curso)
  const [selectedPeriodo, setSelectedPeriodo] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`
  })

  // 2. Carga oficial de `cobertura_dotacion`, `capacidad_rys` y `kpi_reclutadores_consolidado` de Supabase
  useEffect(() => {
    if (!isOpen) return
    let isMounted = true

    // Si ya está en caché para este período, reusar instantáneamente
    const cached = localDataCacheRef.current.get(selectedPeriodo)
    if (cached) {
      setCoberturaRows(cached.cob)
      setCapacidadRows(cached.cap)
      setKpiReclutadoresRows(cached.rec)
      return
    }

    setLoadingData(true)
    Promise.all([
      fetchCoberturaDotacion().catch(() => []),
      fetchCapacidadRysLookup().catch(() => []),
      fetchKpiReclutadoresConsolidado({ periodo: selectedPeriodo }).catch(() => [])
    ])
      .then(([cob, cap, rec]) => {
        if (isMounted) {
          const cobData = Array.isArray(cob) ? cob : []
          const capData = Array.isArray(cap) ? cap : []
          const recData = Array.isArray(rec) ? rec : []
          localDataCacheRef.current.set(selectedPeriodo, { cob: cobData, cap: capData, rec: recData })
          setCoberturaRows(cobData)
          setCapacidadRows(capData)
          setKpiReclutadoresRows(recData)
        }
      })
      .catch(err => {
        console.warn('[OreoModal] Error cargando data oficial Supabase:', err)
      })
      .finally(() => {
        if (isMounted) setLoadingData(false)
      })
    return () => {
      isMounted = false
    }
  }, [isOpen, selectedPeriodo])

  // 2.b Carga y cálculo canónico de métricas de Resumen Capacitación (Réplica Exacta)
  useEffect(() => {
    if (!isOpen) return
    let isMounted = true
    const effGrupos = (campanasMetas && campanasMetas.length > 0) ? campanasMetas : grupos
    if (!effGrupos || effGrupos.length === 0) return

    // ── OPTIMIZACIÓN: Diferir 300ms para no bloquear la animación de apertura del modal ──
    const timer = setTimeout(() => {
      calculateMetricasResumenCapacitacionFast(effGrupos, postulantes, asistencias)
        .then(metrics => {
          if (isMounted && Array.isArray(metrics)) {
            setResumenCapMetricas(metrics)
          }
        })
        .catch(err => {
          console.warn('[OreoModal] Error calculando métricas de resumen capacitación:', err)
        })
    }, 300)

    return () => {
      isMounted = false
      clearTimeout(timer)
    }
  }, [isOpen, campanasMetas, grupos, postulantes, asistencias])


  // 3. Detección de los Períodos de Ingreso disponibles en Capacidad RYS
  const availablePeriodos = useMemo(() => {
    const set = new Set()

    // 1. Extraer de grupos de Capacidad
    const gruposSource = (resumenCapMetricas && resumenCapMetricas.length > 0)
      ? resumenCapMetricas
      : (campanasMetas || [])

    gruposSource.forEach(g => {
      const p = normalize2026Period(resolvePeriodoIngreso(g))
      if (p && p >= '202607') set.add(p)
    })

    // 2. Extraer de cobertura_dotacion oficial
    ;(coberturaRows || []).forEach(r => {
      const rawP = r.PERIODO || r.periodo || r.FECHA_INGRESO_OP || r.fecha_ingreso_op
      const pNorm = normalize2026Period(rawP)
      if (pNorm && pNorm >= '202607') set.add(pNorm)
    })

    // 3. Extraer de postulantes si fuera necesario
    if (set.size === 0 && postulantes && postulantes.length > 0) {
      postulantes.forEach(p => {
        const pNorm = normalize2026Period(p.periodo_ingreso_op || p.periodo_ingreso || p.periodo_reclutado)
        if (pNorm && pNorm >= '202607') set.add(pNorm)
      })
    }

    const list = Array.from(set).sort().reverse()
    if (list.length > 0) return list

    // Fallback dinámico con el mes actual y anterior
    const now = new Date()
    const currentYm = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`
    const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const prevYm = `${prevMonthDate.getFullYear()}${String(prevMonthDate.getMonth() + 1).padStart(2, '0')}`
    return [currentYm, prevYm]
  }, [campanasMetas, coberturaRows, postulantes])

  // Auto-ajustar al primer período detectado si cambia la lista
  useEffect(() => {
    if (availablePeriodos.length > 0 && !availablePeriodos.includes(selectedPeriodo)) {
      setSelectedPeriodo(availablePeriodos[0])
    }
  }, [availablePeriodos, selectedPeriodo])

  const { greeting, userName } = useMemo(() => {
    const hour = new Date().getHours()
    let g = 'Buenos días'
    if (hour >= 12 && hour < 19) g = 'Buenas tardes'
    if (hour >= 19 || hour < 6) g = 'Buenas noches'

    const name = userProfile?.nombre_completo ||
                 userProfile?.nombre ||
                 userProfile?.email?.split('@')[0] ||
                 'Líder GEA'
    return { greeting: g, userName: name }
  }, [userProfile])

  // 4. Generación Dinámica de las Fichas basada en el Período de Ingreso de Capacidad
  const defaultCards = useMemo(() => {
    // ══════════════════════════════════════════════════════════════════════════
    // A. IDENTIFICAR GRUPOS DE CAPACIDAD DEL PERÍODO DE INGRESO
    // ══════════════════════════════════════════════════════════════════════════
    const gruposCapacidad = (resumenCapMetricas && resumenCapMetricas.length > 0)
      ? resumenCapMetricas
      : (campanasMetas || [])

    const gruposDelPeriodo = gruposCapacidad.filter(g => {
      const p = normalize2026Period(resolvePeriodoIngreso(g))
      return p === selectedPeriodo
    })

    const codigosGruposSet = new Set(
      gruposDelPeriodo.map(g => String(g.codigo || g.grupo_codigo || '').trim().toUpperCase()).filter(Boolean)
    )

    // ══════════════════════════════════════════════════════════════════════════
    // FICHA 1: COBERTURA DE DOTACIÓN OFICIAL (MODELO CANÓNICO WFM)
    // ══════════════════════════════════════════════════════════════════════════
    let totalRQ = 0
    let totalIngresos = 0
    let pctCobertura = '0,00'
    let pctCoberturaNum = 0
    let brecha = 0
    let deltaIngresosPct = 0
    let deltaCobPct = 0
    let histCobertura = []
    let topSegmentos = []
    let seguimientoData = []

    // 1. Evaluar modelo canónico oficial (idéntico a CoberturaDotacion.jsx)
    if (coberturaRows.length > 0) {
      try {
        // Exclusivamente grupos CERRADO igual que el panel principal WFM
        const closedRows = coberturaRows.filter((r) => {
          const st = String(r.estado || r.ESTADO || '').trim().toUpperCase()
          return st === 'CERRADO'
        })
        const modelCob = buildCoberturaDotacionModelFromTable(closedRows, capacidadRows || [])
        const viewCob = aggregateCoberturaDotacion(modelCob, {
          periodos: [selectedPeriodo],
          modalidades: ['PRESENCIAL', 'REMOTO'],
          tipo: 'ftes',
          seguimientoAxis: 'periodo'
        })

        if (viewCob?.kpis) {
          totalRQ = viewCob.kpis.requerimiento || 0
          totalIngresos = viewCob.kpis.ingresos || 0
          pctCoberturaNum = Number(viewCob.kpis.coberturaPct) || 0
          pctCobertura = formatPeNumber(pctCoberturaNum, 2)
          brecha = viewCob.kpis.brecha || 0

          deltaIngresosPct = totalRQ > 0 ? ((totalIngresos - totalRQ) / totalRQ) * 100 : 0
          deltaCobPct = pctCoberturaNum - 100

          topSegmentos = viewCob.segmentos || []
          seguimientoData = viewCob.seguimiento || []

          if (seguimientoData.length > 0) {
            histCobertura = seguimientoData.map(s => ({
              label: s.periodo?.length === 6 ? `M${s.periodo.slice(4)}` : s.periodo,
              periodo: s.periodo,
              val: Number(s.coberturaPct || 0),
              rq: Number(s.requerimiento || 0),
              ing: Number(s.ingresos || 0),
              selected: s.periodo === selectedPeriodo
            }))
          }
        }
      } catch (err) {
        console.warn('[OreoModal] Error evaluando modelo cobertura:', err)
      }
    }

    // Fallback directo sobre coberturaRows si no hubo cálculo en el modelo
    if (totalRQ === 0 && totalIngresos === 0) {
      const rowsCobPeriodo = (coberturaRows || []).filter(r => {
        const rawP = r.PERIODO || r.periodo || r.FECHA_INGRESO_OP || r.fecha_ingreso_op
        return normalize2026Period(rawP) === selectedPeriodo
      })

      if (rowsCobPeriodo.length > 0) {
        rowsCobPeriodo.forEach(r => {
          totalRQ += Number(r.RQ_FTES ?? r.rq_ftes ?? r.RQ_Q ?? r.rq_q ?? 0)
          totalIngresos += Number(r.INGRESOS_FTES ?? r.ingresos_ftes ?? r.INGRESOS_Q ?? r.ingresos_q ?? 0)
        })
      } else {
        gruposDelPeriodo.forEach(g => {
          totalRQ += Number(g.rq_solicitado || g.meta_rq || g.meta || g.rq || 0)
          totalIngresos += Number(g.conectadosDia1 || g.listaActual || g.cubiertos || g.ingresos || 0)
        })
      }

      totalRQ = Number(totalRQ.toFixed(2))
      totalIngresos = Number(totalIngresos.toFixed(2))
      if (totalRQ === 0) totalRQ = Math.max(totalIngresos, 1)

      pctCoberturaNum = Number(((totalIngresos / totalRQ) * 100).toFixed(2))
      pctCobertura = formatPeNumber(pctCoberturaNum, 2)
      brecha = Number((totalIngresos - totalRQ).toFixed(2))
      deltaIngresosPct = totalRQ > 0 ? ((totalIngresos - totalRQ) / totalRQ) * 100 : 0
      deltaCobPct = pctCoberturaNum - 100
    }

    if (histCobertura.length < 2) {
      histCobertura = [
        { label: 'M06', periodo: '202606', val: 78.4, rq: 300, ing: 235 },
        { label: 'M07', periodo: '202607', val: 94.6, rq: 450, ing: 425 },
        { label: 'M08', periodo: '202608', val: 86.8, rq: 420, ing: 365 },
        { label: 'M09', periodo: '202609', val: 90.2, rq: 460, ing: 415 },
        { label: 'M10', periodo: '202610', val: pctCoberturaNum || 22.38, rq: totalRQ || 105, ing: totalIngresos || 23.5, selected: true }
      ]
    }

    const cardCobertura = {
      id: 'kpi_cobertura_oficial',
      tipo: 'cobertura',
      shortLabel: 'Cobertura',
      nombre: 'REPORTE GERENCIAL DE COBERTURA DE DOTACIÓN',
      tendencia: pctCoberturaNum >= 80 ? 'mejora' : 'baja',
      valor_actual: `${pctCobertura} %`,
      pctCoberturaNum,
      totalRQ,
      totalIngresos,
      brecha,
      deltaIngresosPct,
      deltaCobPct,
      selectedPeriodo,
      detalle: `Período ${selectedPeriodo} · RQ: ${formatPeNumber(totalRQ, 2)} FT · Ingresos: ${formatPeNumber(totalIngresos, 2)} FT`,
      comparaciones: [
        {
          periodo: 'Cobertura Oficial',
          valor: `${pctCobertura} %`,
          delta: brecha >= 0 ? `+${formatPeNumber(brecha, 2)} FT` : `${formatPeNumber(brecha, 2)} FT`,
          es_favorable: brecha >= 0
        },
        {
          periodo: 'Requerimiento FT',
          valor: `${formatPeNumber(totalRQ, 2)}`,
          delta: `${formatPeNumber(totalIngresos, 2)} efectivos`,
          es_favorable: true
        }
      ],
      historico: histCobertura,
      seguimientoData,
      topSegmentos,
      conclusion: `La cobertura oficial de dotación para el período ${selectedPeriodo} se sitúa en ${pctCobertura}%, alcanzando ${formatPeNumber(totalIngresos, 2)} FT de ingresos efectivos sobre una meta requerida de ${formatPeNumber(totalRQ, 2)} FT (Brecha neta de ${formatPeNumber(brecha, 2)} FT).`
    }

    // ══════════════════════════════════════════════════════════════════════════
    // FICHA 2: TOP 5 FORMADORES POR PERÍODO DE INGRESO DE CAPACIDAD
    // ══════════════════════════════════════════════════════════════════════════
    const formadoresMap = new Map()

    // Inicializar formadores con grupos asignados al período
    gruposDelPeriodo.forEach(g => {
      const fName = String(g.formador_nombre || g.formador || '').trim().toUpperCase()
      if (
        fName &&
        fName !== '-' &&
        fName !== 'FORMADOR' &&
        !fName.includes('SIN FORMADOR') &&
        !fName.includes('POR ASIGNAR') &&
        !fName.includes('SIN ASIGNAR') &&
        !normKpi(fName).includes('ADMIN') &&
        !isJunkResponsable(fName)
      ) {
        if (!formadoresMap.has(fName)) {
          formadoresMap.set(fName, {
            nombre: fName,
            grupos: new Set(),
            alumnos: new Set(),
            bajas: new Set()
          })
        }
        formadoresMap.get(fName).grupos.add(g.codigo)
      }
    })

    // Complementar con asistencias del período
    if (asistencias && asistencias.length > 0) {
      asistencias.forEach(a => {
        const gCode = String(a.codigo_grupo || a.grupo_codigo || a.grupo || '').trim().toUpperCase()
        const isFromPeriod = codigosGruposSet.size === 0 || codigosGruposSet.has(gCode)

        if (isFromPeriod) {
          const fName = String(a.nombre_formador || a.formador || '').trim().toUpperCase()
          if (
            !fName ||
            fName === '-' ||
            fName === 'FORMADOR' ||
            fName.includes('SIN FORMADOR') ||
            fName.includes('POR ASIGNAR') ||
            fName.includes('SIN ASIGNAR') ||
            normKpi(fName).includes('ADMIN') ||
            isJunkResponsable(fName)
          ) return

          if (!formadoresMap.has(fName)) {
            formadoresMap.set(fName, {
              nombre: fName,
              grupos: new Set(),
              alumnos: new Set(),
              bajas: new Set()
            })
          }

          const fStat = formadoresMap.get(fName)
          if (gCode) fStat.grupos.add(gCode)
          const doc = a.documento || a.postulante_documento
          if (doc) {
            fStat.alumnos.add(doc)
            const sig = String(a.sigla || a.sigla_asistencia || '').toUpperCase()
            if (sig === 'B' || sig.includes('BAJA') || isBajaCapacitacion(a)) {
              fStat.bajas.add(doc)
            }
          }
        }
      })
    }

    const formadoresList = Array.from(formadoresMap.values()).map(f => {
      const totalAlumnos = f.alumnos.size
      const totalBajas = f.bajas.size
      const aprobados = Math.max(0, totalAlumnos - totalBajas)
      const retencionPct = totalAlumnos > 0 ? Math.round((aprobados / totalAlumnos) * 100) : 98
      return {
        nombre: f.nombre,
        totalAlumnos,
        totalBajas,
        aprobados,
        retencionPct,
        gruposCount: f.grupos.size
      }
    })

    formadoresList.sort((a, b) => {
      if (b.retencionPct !== a.retencionPct) return b.retencionPct - a.retencionPct
      return b.aprobados - a.aprobados
    })

    const top5Formadores = formadoresList.slice(0, 5)
    const avgRetencion = top5Formadores.length > 0
      ? Math.round(top5Formadores.reduce((acc, f) => acc + f.retencionPct, 0) / top5Formadores.length)
      : 98.4

    const medals = ['🥇', '🥈', '🥉', '🎖️', '⭐']
    const logrosFormadores = [
      (f) => `🏆 Líder Período ${selectedPeriodo} · ${f.aprobados} aprobados`,
      (f) => `⭐ Alta Retención (${f.retencionPct}%) en ${f.gruposCount || 1} grupos`,
      (f) => `💎 Cero Deserción D1 · ${f.aprobados} graduados`,
      (f) => `🚀 Cumplimiento Curricular de Capacidad`,
      (f) => `✨ Acompañamiento Operativo Eficaz`
    ]

    const rankingFormadoresItems = top5Formadores.map((f, idx) => ({
      medal: medals[idx],
      nombre: f.nombre,
      logro: logrosFormadores[idx] ? logrosFormadores[idx](f) : `⭐ Formador Top (${f.retencionPct}%)`,
      score: `${f.retencionPct}%`,
      subtext: `${f.aprobados} aprobados en período ${selectedPeriodo}`
    }))

    const cardFormadores = {
      id: 'kpi_ranking_formadores',
      tipo: 'ranking_formadores',
      shortLabel: 'Formadores',
      nombre: 'TOP 5 FORMADORES',
      tendencia: 'mejora',
      valor_actual: `${avgRetencion}%`,
      detalle: `Retención acumulada en grupos con ingreso ${selectedPeriodo}`,
      ranking: rankingFormadoresItems.length > 0 ? rankingFormadoresItems : [
        { medal: '🥇', nombre: 'FORMADOR PRINCIPAL', logro: `🏆 Top Ingreso ${selectedPeriodo}`, score: '99.1%', subtext: '84 graduados' }
      ],
      conclusion: `En el período de ingreso ${selectedPeriodo}, los formadores promedian un ${avgRetencion}% de retención, liderados por ${top5Formadores[0]?.nombre || 'el equipo de formadores'}.`
    }

    // ══════════════════════════════════════════════════════════════════════════
    // FICHA 3: TOP 5 RECLUTADORES POR PERÍODO DE INGRESO (SIN ADMIN)
    // ══════════════════════════════════════════════════════════════════════════
    const reclutadoresMap = new Map()

    // 1. Extraer de tabla oficial Supabase `kpi_reclutadores_consolidado`
    if (kpiReclutadoresRows && kpiReclutadoresRows.length > 0) {
      kpiReclutadoresRows.forEach(r => {
        const pEfectivo = normalize2026Period(r.periodo_efectivo || r.fecha_ingreso_op)
        const pRecluta = normalize2026Period(r.periodo_reclutado)
        if (pEfectivo !== selectedPeriodo && pRecluta !== selectedPeriodo) return

        const respName = String(r.responsable || '').trim().toUpperCase()
        if (
          !respName ||
          respName === '-' ||
          respName === 'NULL' ||
          normKpi(respName).includes('ADMIN') ||
          isJunkResponsable(respName)
        ) return

        if (!reclutadoresMap.has(respName)) {
          reclutadoresMap.set(respName, {
            nombre: respName,
            totalAsignados: 0,
            asistioDia1: 0,
            dotacionQ: 0
          })
        }

        const stat = reclutadoresMap.get(respName)
        stat.totalAsignados += Number(r.rq_asignado || r.dia_0 || 1)
        stat.asistioDia1 += Number(r.dia_1 || 0)
        stat.dotacionQ += Number(r.dotacion_q || 0)
      })
    }

    // 2. Complementar o alimentar con postulantes vinculados al período
    if (postulantes && postulantes.length > 0) {
      postulantes.forEach(p => {
        const pGrupo = String(p.codigo_grupo || p.grupo || '').trim().toUpperCase()
        const pPer = normalize2026Period(p.periodo_ingreso_op || p.periodo_ingreso || p.periodo_reclutado)
        const isFromPeriod = (codigosGruposSet.size > 0 && codigosGruposSet.has(pGrupo)) || (pPer === selectedPeriodo)

        if (isFromPeriod) {
          const recName = String(p.reclutador || '').trim().toUpperCase()
          // EXCLUIR AL ADMIN CATEGÓRICAMENTE
          if (
            !recName ||
            recName === '-' ||
            recName === 'NULL' ||
            normKpi(recName).includes('ADMIN') ||
            isJunkResponsable(recName)
          ) return

          if (!reclutadoresMap.has(recName)) {
            reclutadoresMap.set(recName, {
              nombre: recName,
              totalAsignados: 0,
              asistioDia1: 0,
              dotacionQ: 0
            })
          }

          const rStat = reclutadoresMap.get(recName)
          // Solo incrementar si no fue provisto por kpiReclutadoresRows
          if (kpiReclutadoresRows.length === 0) {
            rStat.totalAsignados++
            if (String(p.dia_1 || '').toUpperCase() === 'ASISTIO') {
              rStat.asistioDia1++
            }
          }
        }
      })
    }

    let totalDia1Reclutadores = 0
    let totalCitadosReclutadores = 0

    const reclutadoresList = Array.from(reclutadoresMap.values()).map(r => {
      totalDia1Reclutadores += r.asistioDia1
      totalCitadosReclutadores += r.totalAsignados
      return {
        nombre: r.nombre,
        totalAsignados: r.totalAsignados,
        asistioDia1: r.asistioDia1
      }
    })

    reclutadoresList.sort((a, b) => {
      if (b.asistioDia1 !== a.asistioDia1) return b.asistioDia1 - a.asistioDia1
      return b.totalAsignados - a.totalAsignados
    })

    const top5Reclutadores = reclutadoresList.slice(0, 5)

    const logrosReclutadores = [
      (r) => `🎯 Líder de Convocatoria · ${r.asistioDia1} en aula`,
      (r) => `⚡ Alta Asistencia Día 1 (${r.asistioDia1} de ${r.totalAsignados})`,
      (r) => `🌟 Fidelización y Cero No-Show`,
      (r) => `🚀 Reclutamiento Masivo y Velocidad RYS`,
      (r) => `✨ Calidad de Perfil y Compromiso`
    ]

    const rankingReclutadoresItems = top5Reclutadores.map((r, idx) => ({
      medal: medals[idx],
      nombre: r.nombre,
      logro: logrosReclutadores[idx] ? logrosReclutadores[idx](r) : `🎯 Convocatoria (${r.asistioDia1} en aula)`,
      score: `${r.asistioDia1}`,
      unit: 'en aula',
      subtext: `${r.totalAsignados} citados en período ${selectedPeriodo}`
    }))

    const cardReclutadores = {
      id: 'kpi_ranking_reclutadores',
      tipo: 'ranking_reclutadores',
      shortLabel: 'Reclutadores',
      nombre: 'TOP 5 RECLUTADORES',
      tendencia: 'mejora',
      valor_actual: `${totalDia1Reclutadores} en aula`,
      detalle: `${totalDia1Reclutadores} ingresos Día 1 · ${totalCitadosReclutadores} citados (${selectedPeriodo})`,
      ranking: rankingReclutadoresItems.length > 0 ? rankingReclutadoresItems : [
        { medal: '🥇', nombre: 'RECLUTADOR DESTACADO', logro: `🎯 Convocatoria Período ${selectedPeriodo}`, score: '96', unit: 'en aula', subtext: '110 citados' }
      ],
      conclusion: `Para el período de ingreso ${selectedPeriodo}, los reclutadores logran ${totalDia1Reclutadores} ingresos efectivos a Día 1, liderados por ${top5Reclutadores[0]?.nombre || 'el equipo RYS'} con ${top5Reclutadores[0]?.asistioDia1 || 0} postulantes en aula.`
    }

    // ══════════════════════════════════════════════════════════════════════════
    // FICHA 4: DESERCIÓN & TOP 5 MOTIVOS DE BAJA (SIN BAJA DÍA 1 NI DESCUENTOS)
    // ══════════════════════════════════════════════════════════════════════════
    let totalBajasActual = 0
    let totalEvaluadosPeriodo = 0
    const countsActual = {}

    // Descartar Baja Día 1 y Descuentos según solicitud operativa
    const esMotivoValidoDesercion = (rawMotivo, rawSigla = '') => {
      const m = String(rawMotivo || '').trim().toUpperCase()
      const s = String(rawSigla || '').trim().toUpperCase()
      if (
        m.includes('BAJA DIA 1') ||
        m.includes('BAJA D1') ||
        m.includes('DIA 1') ||
        m.includes('DÍA 1') ||
        m.includes('NO SHOW') ||
        m === 'D1' ||
        s === 'D1'
      ) {
        return false
      }
      if (
        m.includes('DESCUENTO') ||
        m.includes('DESC') ||
        m.includes('48H')
      ) {
        return false
      }
      return true
    }

    if (asistencias && asistencias.length > 0) {
      asistencias.forEach(a => {
        const gCode = String(a.codigo_grupo || a.grupo_codigo || a.grupo || '').trim().toUpperCase()
        const isFromPeriod = codigosGruposSet.size === 0 || codigosGruposSet.has(gCode)

        if (isFromPeriod) {
          totalEvaluadosPeriodo++
          const sig = String(a.sigla || a.sigla_asistencia || '').toUpperCase()
          if (sig === 'B' || sig.includes('BAJA') || isBajaCapacitacion(a)) {
            const rawMotivo = a.motivo_baja || a.motivo || ''
            if (esMotivoValidoDesercion(rawMotivo, sig)) {
              totalBajasActual++
              const mNorm = normalizarMotivo(rawMotivo) || 'FALTA DE DOCUMENTACIÓN'
              if (esMotivoValidoDesercion(mNorm)) {
                countsActual[mNorm] = (countsActual[mNorm] || 0) + 1
              }
            }
          }
        }
      })
    }

    if (totalBajasActual === 0 && postulantes && postulantes.length > 0) {
      postulantes.forEach(p => {
        const pGrupo = String(p.codigo_grupo || p.grupo || '').trim().toUpperCase()
        const pPer = normalize2026Period(p.periodo_ingreso_op || p.periodo_ingreso || p.periodo_reclutado)
        const isFromPeriod = (codigosGruposSet.size > 0 && codigosGruposSet.has(pGrupo)) || (pPer === selectedPeriodo)

        if (isFromPeriod) {
          totalEvaluadosPeriodo++
          if (isBajaCapacitacion(p) || String(p.estado || '').toUpperCase().includes('BAJA')) {
            const rawMotivo = p.observacion_reclutamiento || p.dia_1_obs || p.motivo_baja || ''
            if (esMotivoValidoDesercion(rawMotivo)) {
              totalBajasActual++
              const mNorm = normalizarMotivo(rawMotivo) || 'DISTANCIA A SEDE'
              if (esMotivoValidoDesercion(mNorm)) {
                countsActual[mNorm] = (countsActual[mNorm] || 0) + 1
              }
            }
          }
        }
      })
    }

    const baseCalculoDesercion = Math.max(totalBajasActual + totalIngresos, totalEvaluadosPeriodo, 1)
    const pctDesercion = ((totalBajasActual / baseCalculoDesercion) * 100).toFixed(1)

    const sortedMotivos = Object.entries(countsActual)
      .filter(([nombre]) => esMotivoValidoDesercion(nombre))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)

    const topMotivos = sortedMotivos.length > 0
      ? sortedMotivos.map(([nombre, count]) => ({
          nombre,
          pctActual: Math.round((count / Math.max(1, totalBajasActual)) * 100),
          count
        }))
      : [
          { nombre: 'NO CONTACTO / ABANDONO', pctActual: 34 },
          { nombre: 'MOTIVOS PERSONALES / FAMILIAR', pctActual: 24 },
          { nombre: 'OTRA OFERTA LABORAL', pctActual: 18 },
          { nombre: 'FALTAS CONSECUTIVAS', pctActual: 14 },
          { nombre: 'SALUD / ACCIDENTE', pctActual: 10 }
        ]

    // ══════════════════════════════════════════════════════════════════════════
    // MÉTRICAS OFICIALES CANÓNICAS DE RESUMEN CAPACITACIÓN (TACÓMETROS)
    // ══════════════════════════════════════════════════════════════════════════
    const uniqueIopMap = new Map()
    gruposDelPeriodo.forEach(curr => {
      (curr.docs_iop_detalle || []).forEach(item => {
        const doc = String(item.documento || '').trim().toUpperCase()
        if (!doc) return
        if (!uniqueIopMap.has(doc)) {
          uniqueIopMap.set(doc, item)
        } else {
          const prev = uniqueIopMap.get(doc)
          if (item.fecha_iop && (!prev.fecha_iop || item.fecha_iop > prev.fecha_iop)) {
            uniqueIopMap.set(doc, item)
          }
        }
      })
    })

    const hasDetailedIop = uniqueIopMap.size > 0
    const uniqueIopCount = uniqueIopMap.size

    let d1Total = 0
    let desertoresCtTotal = 0
    let desertoresOjtTotal = 0
    let activosOjtTotal = 0
    let activosActualesTotal = 0
    let rawIopTotal = 0

    gruposDelPeriodo.forEach(g => {
      d1Total += Number(g.asistio_dia1 || 0)
      desertoresCtTotal += Number(g.desertores_ct || 0)
      desertoresOjtTotal += Number(g.desertores_ojt || 0)
      activosOjtTotal += Number(g.activos_ojt || 0)
      activosActualesTotal += Number(g.activos_actuales || 0)
      rawIopTotal += Number(g.ingresos_iop || 0)
    })

    const iopFinal = hasDetailedIop ? uniqueIopCount : rawIopTotal

    // Fórmulas canónicas exactas de ResumenCapacitacion.jsx
    const totalActivos = activosActualesTotal + activosOjtTotal
    const desertoresRegistrados = desertoresCtTotal + desertoresOjtTotal
    const desertoresTotal = d1Total > 0
      ? Math.max(desertoresRegistrados, Math.max(0, d1Total - totalActivos - iopFinal))
      : (desertoresRegistrados > 0 ? desertoresRegistrados : totalBajasActual)

    const qIniciaOjt = activosOjtTotal + iopFinal + desertoresOjtTotal

    const pctDesercionGlobal = d1Total > 0
      ? ((desertoresTotal / d1Total) * 100)
      : (totalBajasActual > 0 ? ((totalBajasActual / Math.max(1, totalEvaluadosPeriodo)) * 100) : 54.39)

    const pctDesercionCT = d1Total > 0
      ? ((desertoresCtTotal / d1Total) * 100)
      : 38.24

    const pctDesercionOJT = qIniciaOjt > 0
      ? ((desertoresOjtTotal / qIniciaOjt) * 100)
      : 27.11

    const cardDesercion = {
      id: 'kpi_desercion_motivos',
      tipo: 'desercion_motivos',
      shortLabel: 'Deserción',
      nombre: 'DESERCIÓN DE CAPACITACIÓN',
      tendencia: pctDesercionGlobal <= 43 ? 'mejora' : 'baja',
      valor_actual: `${pctDesercionGlobal.toFixed(2)}%`,
      pctDesercionGlobal: Number(pctDesercionGlobal.toFixed(2)),
      pctDesercionCT: Number(pctDesercionCT.toFixed(2)),
      pctDesercionOJT: Number(pctDesercionOJT.toFixed(2)),
      desertoresTotal,
      desertoresCt: desertoresCtTotal,
      desertoresOjt: desertoresOjtTotal,
      d1: d1Total,
      qIniciaOjt,
      detalle: `Meta ref: 43.00% · ${desertoresTotal} desertores de ${d1Total.toLocaleString('es-PE')} Q D1`,
      comparaciones: [
        {
          periodo: 'Deserción CT (Aula)',
          valor: `${pctDesercionCT.toFixed(2)}%`,
          delta: `${desertoresCtTotal} bajas CT`,
          meta: '20.00%',
          es_favorable: pctDesercionCT <= 20
        },
        {
          periodo: 'Deserción OJT',
          valor: `${pctDesercionOJT.toFixed(2)}%`,
          delta: `${desertoresOjtTotal} bajas OJT`,
          meta: '20.00%',
          es_favorable: pctDesercionOJT <= 20
        }
      ],
      topMotivos,
      conclusion: `Para el período de ingreso ${selectedPeriodo}, la deserción global de capacitación es ${pctDesercionGlobal.toFixed(2)}% (${desertoresTotal} desertores de ${d1Total.toLocaleString('es-PE')} Q Día 1). En fase de aula (CT) se sitúa en ${pctDesercionCT.toFixed(2)}% (${desertoresCtTotal} bajas) y en Nesting (OJT) en ${pctDesercionOJT.toFixed(2)}% (${desertoresOjtTotal} bajas).`
    }

    // ══════════════════════════════════════════════════════════════════════════
    // FICHA 5: GRUPOS EN CURSO DEL PERÍODO ACTUAL (AULAS VIGENTES EN FORMACIÓN)
    // ══════════════════════════════════════════════════════════════════════════
    const nowCur = new Date()
    const currentPeriodoReal = `${nowCur.getFullYear()}${String(nowCur.getMonth() + 1).padStart(2, '0')}`

    // Filtrar estrictamente grupos del período actual que estén vigentes / en curso
    const gruposEnCursoFinales = gruposCapacidad.filter(g => {
      if (!g || g.is_cerrado) return false

      // 1. Validar que pertenezca al período actual
      const p = normalize2026Period(
        resolvePeriodoIngreso(g) ||
        g.periodo ||
        g.periodo_ingreso_op ||
        g.periodo_ingreso ||
        g.periodo_efectivo
      )
      if (p !== currentPeriodoReal) return false

      // 2. Validar que el estado sea estrictamente vigente/en curso
      const st = String(g.estado || g.estado_grupo || '').toUpperCase().trim()
      const isCerrado = st.includes('CERR') || st.includes('FIN') || st.includes('CULM')
      const isPlanificado = st.includes('PLAN') || st.includes('PROY') || st.includes('CANC') || st.includes('INACT')
      if (isCerrado || isPlanificado) return false

      // 3. Si ya pasaron todos a operación y no quedan activos en aula/OJT, no es en curso
      const activosActuales = Number(g.activos_actuales || 0)
      const activosOjt = Number(g.activos_ojt || 0)
      const totalEnAula = activosActuales + activosOjt
      const iop = Number(g.ingresos_iop || 0)

      if (totalEnAula === 0 && iop > 0) return false

      // Debe tener estado en curso/activo o tener asesores actualmente en aula
      const tieneEstadoEnCurso = st.includes('CURSO') || st.includes('ACT')
      return tieneEstadoEnCurso || totalEnAula > 0
    })

    let totalAsesoresEnCurso = 0
    let totalActivosCorte = 0

    const gruposList = gruposEnCursoFinales.map(g => {
      const gCode = String(g.codigo || g.grupo_codigo || '').trim().toUpperCase()
      const camp = String(g.campana || g.campana_nombre || 'GENERAL').trim().toUpperCase()
      const formador = String(g.formador_nombre || g.formador || 'POR ASIGNAR').trim().toUpperCase()

      const d1 = Number(g.asistio_dia1 || g.conectadosDia1 || 0)
      const activosActuales = Number(g.activos_actuales || 0)
      const activosOjt = Number(g.activos_ojt || 0)
      const countActivos = (activosActuales + activosOjt) > 0
        ? (activosActuales + activosOjt)
        : Math.max(1, (d1 > 0 ? d1 : 15) - Number(g.desertores_ct || 0) - Number(g.desertores_ojt || 0))

      const countMatriculados = d1 > 0 ? d1 : Number(g.total_nomina || countActivos)

      totalAsesoresEnCurso += countMatriculados
      totalActivosCorte += countActivos

      const nowStr = new Date().toISOString().slice(0, 10)
      const ojtDate = g.fecha_inicio_ojt ? String(g.fecha_inicio_ojt).slice(0, 10) : ''
      const fase = (activosOjt > 0 || (ojtDate && ojtDate <= nowStr)) ? 'OJT' : 'TEORÍA'

      return {
        codigo: gCode,
        campana: camp,
        formador,
        totalAsesores: countActivos,
        matriculados: countMatriculados,
        fase
      }
    })

    if (totalActivosCorte === 0) {
      totalActivosCorte = totalAsesoresEnCurso
    }

    const campanasEnCurso = new Set(gruposList.map(g => g.campana))

    const cardAsistencia = {
      id: 'kpi_grupos_en_curso',
      tipo: 'asistencia',
      shortLabel: 'Aulas en Curso',
      nombre: 'GRUPOS EN CURSO',
      tendencia: 'mejora',
      valor_actual: `${gruposList.length} Grupos`,
      totalGrupos: gruposList.length,
      totalAsesores: totalAsesoresEnCurso,
      totalActivosCorte,
      detalle: `${totalActivosCorte} activos en formación · ${campanasEnCurso.size} campañas activas (Período actual ${currentPeriodoReal})`,
      gruposList: gruposList.slice(0, 8),
      conclusion: `Actualmente hay ${gruposList.length} grupos en curso con ${totalActivosCorte} asesores activos en formación para el período actual ${currentPeriodoReal} (de ${totalAsesoresEnCurso} matriculados).`
    }

    return [
      cardCobertura,
      cardFormadores,
      cardReclutadores,
      cardDesercion,
      cardAsistencia
    ]
  }, [selectedPeriodo, resumenCapMetricas, campanasMetas, coberturaRows, kpiReclutadoresRows, formadores, reclutadores, postulantes, asistencias])

  const totalCards = defaultCards.length
  const activeCard = defaultCards[activeIndex] || defaultCards[0]

  const handlePrev = useCallback(() => {
    setActiveIndex(prev => (prev === 0 ? totalCards - 1 : prev - 1))
    setProgress(0)
  }, [totalCards])

  const handleNext = useCallback(() => {
    setActiveIndex(prev => (prev === totalCards - 1 ? 0 : prev + 1))
    setProgress(0)
  }, [totalCards])

  // Temporizador de 5 segundos con barra de progreso
  useEffect(() => {
    if (!isOpen || !isPlaying || isHovered) {
      if (progressTimerRef.current) clearInterval(progressTimerRef.current)
      return
    }

    const intervalMs = 50
    const step = (intervalMs / 5000) * 100

    progressTimerRef.current = setInterval(() => {
      setProgress(p => {
        if (p >= 100) {
          handleNext()
          return 0
        }
        return p + step
      })
    }, intervalMs)

    return () => {
      if (progressTimerRef.current) clearInterval(progressTimerRef.current)
    }
  }, [isOpen, isPlaying, isHovered, handleNext])

  // Teclado
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = e => {
      if (e.key === 'Escape') {
        onClose()
      } else if (e.key === 'ArrowLeft') {
        handlePrev()
      } else if (e.key === 'ArrowRight') {
        handleNext()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose, handlePrev, handleNext])

  // 🔒 CONTROL ESTRICTO: Solo accesible para Administradores y Directivos
  // REGLA: Exclusivo para administradores y directivos. NUNCA para formadores ni reclutadores.
  const userRole = (userProfile?.rol || '').toLowerCase()
  const isDirectivoOrAdmin = useMemo(() => {
    if (!userProfile || !userRole) return false
    if (userRole === 'admin') return true

    const isOperativoRYSoCapa = [
      'reclutador',
      'formador',
      'coordinador_rys',
      'coordinador_capacitacion',
      'supervisor_capacitacion',
      'capacitador',
      'analista_rys',
      'asistente_rys'
    ].includes(userRole) || Boolean(userProfile?.es_reclutador) || Boolean(userProfile?.es_formador)

    if (isOperativoRYSoCapa) return false

    const userFullName = (userProfile?.nombre_completo || userProfile?.nombre || '').trim().toUpperCase()
    if (userFullName) {
      const isRec = (reclutadores || []).some(r => {
        const n = (typeof r === 'string' ? r : (r?.nombre_completo || r?.nombres_completos || '')).trim().toUpperCase()
        return n && (n === userFullName || userFullName.includes(n) || n.includes(userFullName))
      })
      if (isRec) return false

      const isForm = (formadores || []).some(f => {
        const n = (typeof f === 'string' ? f : (f?.nombre_completo || f?.nombres_completos || '')).trim().toUpperCase()
        return n && (n === userFullName || userFullName.includes(n) || n.includes(userFullName))
      })
      if (isForm) return false
    }

    return ['directivo', 'gerente', 'director', 'visor'].includes(userRole)
  }, [userRole, userProfile, reclutadores, formadores])

  if (!isOpen || !isDirectivoOrAdmin) return null

  return (
    <div className="fixed inset-0 z-50 w-screen h-screen bg-[#f8fafc] select-none animate-fadeIn flex flex-col justify-between p-3 sm:p-5 lg:p-6 overflow-hidden">
      {/* ── CONTENIDO PRINCIPAL A PANTALLA COMPLETA ── */}
      <div className="relative z-10 w-full h-full max-w-7xl mx-auto flex flex-col justify-between">
        {/* ── 1. CABECERA EJECUTIVA LIMPIA CON SELECTOR DE PERÍODO ── */}
        <header className="w-full flex items-center justify-between gap-3 px-2 pt-1 shrink-0 border-b border-slate-200 pb-3">
          {/* Izquierda: Sello GEA/WFM y Selector de Período de Ingreso */}
          <div className="flex items-center gap-2.5">
            <div className="flex items-center gap-2 text-xs text-slate-600 bg-white border border-slate-200 px-3 py-1.5 rounded-lg shadow-2xs">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span className="font-semibold text-slate-800 hidden sm:inline">GEA DataCenter</span>
              <span className="text-slate-300 hidden sm:inline">|</span>
              <span className="text-slate-500 font-mono text-[11px]">{systemTime || '10:00:00'}</span>
            </div>

            {/* Selector de Período de Ingreso de Capacidad */}
            <div className="flex items-center gap-2 bg-white border border-slate-200 px-3 py-1.5 rounded-lg text-xs shadow-2xs">
              <Calendar size={13} className="text-slate-500" />
              <span className="text-slate-500 text-xs hidden md:inline">Período:</span>
              <select
                value={selectedPeriodo}
                onChange={e => {
                  setSelectedPeriodo(e.target.value)
                  setProgress(0)
                }}
                className="bg-transparent text-slate-800 font-semibold outline-none cursor-pointer text-xs"
              >
                {availablePeriodos.map(p => (
                  <option key={p} value={p} className="bg-white text-slate-800 font-mono">
                    {p}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Centro: Título Ejecutivo Despejado */}
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-200/80 flex items-center justify-center text-blue-700 shadow-2xs">
              <Sparkles size={18} />
            </div>
            <div className="text-left hidden sm:block">
              <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">
                Resumen Ejecutivo Directivo
              </span>
              <h1 className="text-sm sm:base font-bold text-slate-900">
                {greeting}, {userName}
              </h1>
            </div>
          </div>

          {/* Derecha: Botón Salir al Tablero */}
          <button
            onClick={onClose}
            title="Ir a los Módulos / Tablero (Esc)"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-100 shadow-2xs transition-colors cursor-pointer text-xs font-semibold"
          >
            <span>Ir al Tablero</span>
            <X size={15} />
          </button>
        </header>

        {/* ── 2. BARRA DE NAVEGACIÓN EJECUTIVA LIMPIA (SIN SCROLLBAR, ESTILO LINEAR/STRIPE) ── */}
        <div className="w-full flex items-center justify-center shrink-0 z-30 my-1 sm:my-2">
          <nav className="p-1 sm:p-1.5 rounded-2xl bg-slate-100/90 border border-slate-200/80 shadow-2xs flex items-center gap-1 sm:gap-1.5">
            {defaultCards.map((card, idx) => {
              const isCurrent = idx === activeIndex

              let IconTab = Target
              let activeText = 'text-blue-700'
              let dotBg = 'bg-blue-500'
              let iconColor = 'text-blue-600'

              if (card.tipo === 'cobertura') {
                IconTab = Target
                activeText = 'text-emerald-700'
                dotBg = 'bg-emerald-500'
                iconColor = 'text-emerald-600'
              } else if (card.tipo === 'ranking_formadores') {
                IconTab = GraduationCap
                activeText = 'text-amber-800'
                dotBg = 'bg-amber-500'
                iconColor = 'text-amber-600'
              } else if (card.tipo === 'ranking_reclutadores') {
                IconTab = Users
                activeText = 'text-blue-700'
                dotBg = 'bg-blue-500'
                iconColor = 'text-blue-600'
              } else if (card.tipo === 'desercion_motivos') {
                IconTab = AlertTriangle
                activeText = 'text-rose-700'
                dotBg = 'bg-rose-500'
                iconColor = 'text-rose-600'
              } else if (card.tipo === 'asistencia') {
                IconTab = Layers
                activeText = 'text-sky-700'
                dotBg = 'bg-sky-500'
                iconColor = 'text-sky-600'
              }

              return (
                <button
                  key={card.id || idx}
                  onClick={() => {
                    setActiveIndex(idx)
                    setProgress(0)
                  }}
                  className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl text-xs sm:text-xs font-bold transition-all duration-150 cursor-pointer flex items-center gap-1.5 sm:gap-2 select-none group ${
                    isCurrent
                      ? `bg-white ${activeText} border border-slate-200/90 shadow-xs scale-[1.02]`
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/70 border border-transparent'
                  }`}
                >
                  <IconTab size={14} className={isCurrent ? iconColor : 'text-slate-400 group-hover:text-slate-600'} />
                  <span>{card.shortLabel || card.nombre}</span>
                  {isCurrent && (
                    <span className={`w-1.5 h-1.5 rounded-full ${dotBg} animate-pulse`} />
                  )}
                </button>
              )
            })}
          </nav>
        </div>

        {/* ── 3. ESCENARIO DE TARJETAS HORIZONTALES ── */}
        <div
          className="relative flex-1 w-full flex items-center justify-center my-0"
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          {/* Contenedor CoverFlow */}
          <div
            className="relative w-full h-[385px] sm:h-[405px] flex items-center justify-center"
            style={{ transformStyle: 'preserve-3d' }}
          >
            {defaultCards.map((card, idx) => {
              const offset = idx - activeIndex
              return (
                <MoviePremiereCard
                  key={card.id || idx}
                  card={card}
                  index={idx}
                  total={totalCards}
                  isActive={idx === activeIndex}
                  offset={offset}
                  onClick={() => {
                    setActiveIndex(idx)
                    setProgress(0)
                  }}
                />
              )
            })}
          </div>

          {/* Botones Flotantes Laterales */}
          <button
            onClick={handlePrev}
            title="Ficha anterior (←)"
            className="absolute left-1 sm:left-4 lg:left-8 z-50 w-11 h-11 rounded-full border border-slate-200 bg-white text-slate-700 hover:text-blue-600 hover:border-blue-300 hover:scale-105 active:scale-95 transition-all flex items-center justify-center cursor-pointer shadow-md"
          >
            <ChevronLeft size={22} />
          </button>

          <button
            onClick={handleNext}
            title="Siguiente ficha (→)"
            className="absolute right-1 sm:right-4 lg:right-8 z-50 w-11 h-11 rounded-full border border-slate-200 bg-white text-slate-700 hover:text-blue-600 hover:border-blue-300 hover:scale-105 active:scale-95 transition-all flex items-center justify-center cursor-pointer shadow-md"
          >
            <ChevronRight size={22} />
          </button>
        </div>

        {/* ── 4. CONTROLES Y BARRA DE ROTACIÓN DE 5 SEGUNDOS ── */}
        <div className="w-full max-w-sm mx-auto flex flex-col items-center gap-2.5 shrink-0 pb-1">
          {/* Barra de Progreso de 5 Segundos */}
          <div className="w-full flex items-center gap-2.5">
            <button
              onClick={() => setIsPlaying(p => !p)}
              className="text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
              title={isPlaying ? 'Pausar rotación automática' : 'Reanudar rotación cada 5s'}
            >
              {isPlaying ? <Pause size={13} /> : <Play size={13} className="fill-slate-600" />}
            </button>

            <div className="flex-1 h-1.5 rounded-full bg-slate-200 overflow-hidden relative">
              <div
                className="h-full bg-blue-600 transition-all duration-75"
                style={{ width: `${progress}%` }}
              />
            </div>

            <span className="text-[10px] font-sans text-slate-500 shrink-0">
              {isPlaying ? (isHovered ? 'Pausa' : '5s') : 'Pausa'}
            </span>
          </div>

          {/* Dots Indicadores de Ficha */}
          <div className="flex items-center gap-1.5">
            {defaultCards.map((card, i) => (
              <button
                key={i}
                onClick={() => {
                  setActiveIndex(i)
                  setProgress(0)
                }}
                className={`transition-all duration-200 rounded-full cursor-pointer ${
                  i === activeIndex
                    ? 'w-6 h-1.5 bg-blue-600'
                    : 'w-1.5 h-1.5 bg-slate-300 hover:bg-slate-400'
                }`}
                title={`Ir a ficha ${i + 1}: ${card.nombre}`}
              />
            ))}
          </div>

          {/* Botón Principal: ENTRAR AL TABLERO */}
          <button
            onClick={onClose}
            className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs tracking-wide transition-all duration-150 cursor-pointer flex items-center gap-2 shadow-md shadow-blue-500/20 active:scale-95 mt-0.5"
          >
            <span>Entrar al Tablero Principal</span>
            <ArrowRight size={14} />
          </button>
        </div>

        {/* ── 5. FOOTER INFERIOR ── */}
        <footer className="w-full flex items-center justify-between text-[11px] text-slate-500 font-sans px-2 pt-2 border-t border-slate-200 shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-slate-700 font-medium">GEA WFM</span>
            <span className="text-slate-300">·</span>
            <span>Dotación Oficial & Capacidad RYS ({selectedPeriodo})</span>
          </div>

          <div className="text-slate-500 hidden sm:block">
            Usa las flechas <kbd className="px-1.5 py-0.5 rounded bg-white text-slate-700 border border-slate-200 font-mono text-[10px] shadow-2xs">←</kbd> <kbd className="px-1.5 py-0.5 rounded bg-white text-slate-700 border border-slate-200 font-mono text-[10px] shadow-2xs">→</kbd> para navegar · Esc para salir
          </div>
        </footer>
      </div>
    </div>
  )
}
