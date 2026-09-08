import { useState, useMemo, memo } from 'react'
import {
  Calendar,
  Layers,
  Users,
  TrendingDown,
  TrendingUp,
  Target,
  Sparkles,
  Info,
  CheckCircle2,
  AlertCircle,
  HelpCircle
} from 'lucide-react'
import Card, { CardHeader, CardTitle, CardDescription, CardContent } from '../ui/Card'
import { Badge } from '../ui/badge'
import { computePeriodVariance } from '../../lib/dashboardAnalytics'

// Función auxiliar para formatear porcentajes
function formatPct(val) {
  if (val === null || val === undefined || isNaN(val)) return '0.00%'
  return `${Number(val).toFixed(2)}%`
}

// Función auxiliar para formatear enteros
function formatNum(val) {
  if (val === null || val === undefined || isNaN(val)) return '0'
  return Number(val).toLocaleString('es-PE')
}

// Indicador semafórico cyberpunk para deserciones (menor es mejor)
function getDesertionBadgeStyle(pct) {
  const p = Number(pct) || 0
  if (p <= 30) {
    return {
      bg: 'rgba(16, 185, 129, 0.12)',
      border: 'rgba(16, 185, 129, 0.35)',
      text: '#34d399',
      glow: '0 0 8px rgba(16, 185, 129, 0.2)'
    }
  }
  if (p <= 55) {
    return {
      bg: 'rgba(245, 158, 11, 0.12)',
      border: 'rgba(245, 158, 11, 0.35)',
      text: '#fbbf24',
      glow: '0 0 8px rgba(245, 158, 11, 0.2)'
    }
  }
  return {
    bg: 'rgba(244, 63, 94, 0.12)',
    border: 'rgba(244, 63, 94, 0.35)',
    text: '#fb7185',
    glow: '0 0 8px rgba(244, 63, 94, 0.2)'
  }
}

// Indicador semafórico cyberpunk para cumplimientos (mayor es mejor)
function getFulfillmentBadgeStyle(pct) {
  const p = Number(pct) || 0
  if (p >= 80) {
    return {
      bg: 'rgba(6, 182, 212, 0.12)',
      border: 'rgba(6, 182, 212, 0.35)',
      text: '#22d3ee',
      glow: '0 0 8px rgba(6, 182, 212, 0.2)'
    }
  }
  if (p >= 60) {
    return {
      bg: 'rgba(129, 140, 248, 0.12)',
      border: 'rgba(129, 140, 248, 0.35)',
      text: '#818cf8',
      glow: '0 0 8px rgba(129, 140, 248, 0.2)'
    }
  }
  return {
    bg: 'rgba(244, 63, 94, 0.12)',
    border: 'rgba(244, 63, 94, 0.35)',
    text: '#fb7185',
    glow: '0 0 8px rgba(244, 63, 94, 0.2)'
  }
}

// Celda de Métrica con formato Cyberpunk y Micro-Indicador de Varianza
const MetricCell = memo(function MetricCell({ 
  value, 
  prevValue = null,
  isPct = false, 
  isFulfillment = false, 
  isHighlighted = false,
  isTotal = false 
}) {
  const variance = (prevValue != null && value != null && !isTotal)
    ? computePeriodVariance(value, prevValue, !isFulfillment)
    : null

  if (!isPct) {
    return (
      <div 
        className={`py-0.5 px-2 text-right font-mono font-bold text-[10.5px] tracking-tight tabular-nums transition-colors duration-150 flex items-center justify-end gap-1 ${
          isTotal 
            ? 'text-indigo-300 font-extrabold' 
            : isHighlighted 
              ? 'text-cyan-300 bg-cyan-500/5' 
              : 'text-slate-200'
        }`}
      >
        <span>{formatNum(value)}</span>
        {variance && !variance.isNeutral && (
          <span 
            className={`text-[8px] font-black shrink-0 ${
              variance.isImprovement ? 'text-emerald-400' : 'text-rose-400'
            }`}
            title={`vs. anterior: ${variance.formattedDeltaPct}`}
          >
            {variance.delta > 0 ? '▲' : '▼'}
          </span>
        )}
      </div>
    )
  }

  const style = isFulfillment 
    ? getFulfillmentBadgeStyle(value) 
    : getDesertionBadgeStyle(value)

  return (
    <div className={`py-0.5 px-1.5 flex items-center justify-end gap-1 transition-colors duration-150 ${
      isHighlighted ? 'bg-indigo-500/5' : ''
    }`}>
      <span
        className="inline-flex items-center justify-center min-w-[50px] px-1.5 py-0.2 rounded-md text-[9.5px] font-mono font-bold tracking-tight border transition-all duration-150 select-none tabular-nums shadow-xs"
        style={{
          backgroundColor: style.bg,
          borderColor: style.border,
          color: style.text,
          boxShadow: isHighlighted ? style.glow : 'none'
        }}
      >
        {formatPct(value)}
      </span>
      {variance && !variance.isNeutral && (
        <span 
          className={`text-[8px] font-black shrink-0 ${
            variance.isImprovement ? 'text-emerald-400' : 'text-rose-400'
          }`}
          title={`vs. anterior: ${variance.formattedDeltaPct} (${variance.isImprovement ? 'Mejora' : 'Retroceso'})`}
        >
          {variance.delta > 0 ? '▲' : '▼'}
        </span>
      )}
    </div>
  )
})

export default function ResumenMensualCapacitacion({
  resumenData = { columns: [], totalSummary: null },
  className = ''
}) {
  const [hoveredCol, setHoveredCol] = useState(null)
  const [showFormulaTooltip, setShowFormulaTooltip] = useState(false)

  const { columns = [], totalSummary } = resumenData
  const hasData = columns.length > 0

  return (
    <Card className={`w-full h-full shadow-xs flex flex-col overflow-hidden border border-slate-800/90 bg-slate-900/80 rounded-xl backdrop-blur-md ${className}`}>
      {/* Header Cyberpunk Enterprise Compacto */}
      <CardHeader className="flex flex-row items-center justify-between py-1 px-3 bg-gradient-to-r from-slate-900/90 via-slate-900/40 to-slate-900/90 border-b border-slate-800/80 shrink-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <div className="h-5 w-5 rounded-md bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shrink-0 shadow-xs">
            <Calendar size={11} />
          </div>
          <CardTitle className="text-[11px] font-black tracking-tight flex items-center gap-1.5 text-slate-100 truncate">
            <span>Resumen Mensual de Capacitación en Relación a Grupo</span>
            <Badge variant="outline" className="text-[8px] font-mono py-0 px-1.5 bg-indigo-500/10 text-indigo-300 border-indigo-500/30 shrink-0">
              {columns.length} {columns.length === 1 ? 'Periodo' : 'Periodos'} (≥ 202608)
            </Badge>
          </CardTitle>
        </div>

        {/* Info Pill & Helper */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setShowFormulaTooltip(!showFormulaTooltip)}
            className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-bold tracking-tight border transition-all cursor-pointer select-none shadow-xs ${
              showFormulaTooltip
                ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40'
                : 'bg-slate-950/80 text-slate-400 border-slate-700/80 hover:text-slate-200'
            }`}
            title="Ver fórmulas aplicadas"
          >
            <Info size={10} className={showFormulaTooltip ? 'text-indigo-400' : ''} />
            <span>{showFormulaTooltip ? 'Ocultar' : 'Fórmulas'}</span>
          </button>
        </div>
      </CardHeader>

      {/* Banner Desplegable de Fórmulas Cyberpunk */}
      {showFormulaTooltip && (
        <div className="px-3 py-1.5 bg-slate-950/90 border-b border-indigo-500/20 grid grid-cols-2 md:grid-cols-3 gap-1.5 text-[9px] font-mono shrink-0 animate-in fade-in duration-150">
          <div className="p-1 rounded bg-slate-900/80 border border-slate-800">
            <span className="text-indigo-400 font-bold">% Deserción Nómina:</span>{' '}
            <span className="text-slate-300">(Nómina - Día 0) / Nómina</span>
          </div>
          <div className="p-1 rounded bg-slate-900/80 border border-slate-800">
            <span className="text-amber-400 font-bold">% Deserción Día 0:</span>{' '}
            <span className="text-slate-300">(Día 0 - Día 1) / Día 0</span>
          </div>
          <div className="p-1 rounded bg-slate-900/80 border border-slate-800">
            <span className="text-rose-400 font-bold">% Deserción Global:</span>{' '}
            <span className="text-slate-300">(Nómina - Ingresos OP) / Nómina</span>
          </div>
          <div className="p-1 rounded bg-slate-900/80 border border-slate-800">
            <span className="text-purple-400 font-bold">% Deserción D1 vs Ingresos:</span>{' '}
            <span className="text-slate-300">(Día 1 - Ingresos OP) / Día 1</span>
          </div>
          <div className="p-1 rounded bg-slate-900/80 border border-slate-800">
            <span className="text-cyan-400 font-bold">% Cumplimiento Día 1:</span>{' '}
            <span className="text-slate-300">Día 1 Real / Meta RQ Día 1 (Cupos)</span>
          </div>
          <div className="p-1 rounded bg-slate-900/80 border border-slate-800">
            <span className="text-emerald-400 font-bold">% Dotación (FTEs):</span>{' '}
            <span className="text-slate-300">Ingresos Reales (FTEs) / Meta RQ OP (FTEs)</span>
          </div>
        </div>
      )}

      {/* Contenido: Matriz con Visualización Completa y Scroll Horizontal si es necesario */}
      <CardContent className="p-0 flex flex-col">
        <div className="w-full overflow-x-auto custom-scrollbar">
          <table className="w-full text-left border-collapse min-w-[620px]">
            {/* Header: Periodos de Ingreso */}
            <thead>
              <tr className="bg-slate-950/80 border-b border-slate-800 text-[9.5px] font-extrabold text-slate-300 uppercase tracking-wider sticky top-0 z-20 backdrop-blur-md">
                <th className="py-1 px-2.5 sticky left-0 z-30 bg-slate-950/95 backdrop-blur-md border-r border-slate-800 min-w-[195px] text-slate-100">
                  <div className="flex items-center justify-between">
                    <span>Periodo / Cohorte</span>
                    <span className="text-[8px] font-normal text-slate-500 lowercase font-mono">≥ 202608</span>
                  </div>
                </th>
                {columns.map((col) => (
                  <th
                    key={col.periodo}
                    onMouseEnter={() => setHoveredCol(col.periodo)}
                    onMouseLeave={() => setHoveredCol(null)}
                    className={`py-1 px-2 text-right font-mono tracking-wider transition-colors min-w-[90px] cursor-pointer ${
                      hoveredCol === col.periodo 
                        ? 'text-cyan-300 bg-cyan-500/10' 
                        : 'text-slate-200'
                    }`}
                  >
                    <div className="flex flex-col items-end">
                      <span className="font-bold text-[10.5px]">{col.periodo}</span>
                      <span className="text-[8px] font-normal text-slate-400">
                        {col.nomina} post.
                      </span>
                    </div>
                  </th>
                ))}
                {totalSummary && (
                  <th className="py-1 px-2.5 text-right font-mono font-black text-indigo-300 bg-indigo-950/40 border-l border-indigo-500/30 min-w-[100px]">
                    <div className="flex flex-col items-end">
                      <span className="font-extrabold text-indigo-300 text-[10.5px]">TOTAL</span>
                      <span className="text-[8px] font-normal text-indigo-400/80">consolidado</span>
                    </div>
                  </th>
                )}
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-800/60 text-[10.5px]">
              {hasData ? (
                <>
                  {/* SECCIÓN 1: POSTULACIÓN / AGENTES (CONTEOS) */}
                  <tr className="bg-slate-950/50 border-t border-indigo-500/30">
                    <td 
                      colSpan={columns.length + (totalSummary ? 2 : 1)} 
                      className="py-0.5 px-2.5 text-[8.5px] font-black uppercase tracking-widest text-indigo-400 bg-indigo-950/30 sticky left-0"
                    >
                      <div className="flex items-center gap-1.5">
                        <Users size={10} className="text-indigo-400" />
                        <span>Postulación / Agentes</span>
                      </div>
                    </td>
                  </tr>

                  {/* Fila: Nómina */}
                  <tr className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-0.5 px-2.5 font-semibold text-[10.5px] text-slate-200 sticky left-0 bg-slate-900/95 backdrop-blur-md border-r border-slate-800">
                      <div className="flex items-center gap-1.5">
                        <div className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                        <span>Nómina</span>
                      </div>
                    </td>
                    {columns.map((col, idx) => (
                      <td 
                        key={col.periodo}
                        onMouseEnter={() => setHoveredCol(col.periodo)}
                        onMouseLeave={() => setHoveredCol(null)}
                      >
                        <MetricCell 
                          value={col.nomina} 
                          prevValue={idx > 0 ? columns[idx - 1]?.nomina : null}
                          isHighlighted={hoveredCol === col.periodo} 
                        />
                      </td>
                    ))}
                    {totalSummary && (
                      <td className="bg-indigo-500/5 border-l border-indigo-500/20">
                        <MetricCell value={totalSummary.nomina} isTotal />
                      </td>
                    )}
                  </tr>

                  {/* Fila: Día 0 */}
                  <tr className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-0.5 px-2.5 font-semibold text-[10.5px] text-slate-200 sticky left-0 bg-slate-900/95 backdrop-blur-md border-r border-slate-800">
                      <div className="flex items-center gap-1.5">
                        <div className="h-1.5 w-1.5 rounded-full bg-blue-400" />
                        <span>Día 0</span>
                      </div>
                    </td>
                    {columns.map((col, idx) => (
                      <td 
                        key={col.periodo}
                        onMouseEnter={() => setHoveredCol(col.periodo)}
                        onMouseLeave={() => setHoveredCol(null)}
                      >
                        <MetricCell 
                          value={col.dia0} 
                          prevValue={idx > 0 ? columns[idx - 1]?.dia0 : null}
                          isHighlighted={hoveredCol === col.periodo} 
                        />
                      </td>
                    ))}
                    {totalSummary && (
                      <td className="bg-indigo-500/5 border-l border-indigo-500/20">
                        <MetricCell value={totalSummary.dia0} isTotal />
                      </td>
                    )}
                  </tr>

                  {/* Fila: Día 1 */}
                  <tr className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-0.5 px-2.5 font-semibold text-[10.5px] text-slate-200 sticky left-0 bg-slate-900/95 backdrop-blur-md border-r border-slate-800">
                      <div className="flex items-center gap-1.5">
                        <div className="h-1.5 w-1.5 rounded-full bg-cyan-400" />
                        <span>Día 1</span>
                      </div>
                    </td>
                    {columns.map((col, idx) => (
                      <td 
                        key={col.periodo}
                        onMouseEnter={() => setHoveredCol(col.periodo)}
                        onMouseLeave={() => setHoveredCol(null)}
                      >
                        <MetricCell 
                          value={col.dia1} 
                          prevValue={idx > 0 ? columns[idx - 1]?.dia1 : null}
                          isHighlighted={hoveredCol === col.periodo} 
                        />
                      </td>
                    ))}
                    {totalSummary && (
                      <td className="bg-indigo-500/5 border-l border-indigo-500/20">
                        <MetricCell value={totalSummary.dia1} isTotal />
                      </td>
                    )}
                  </tr>

                  {/* Fila: Ingresos */}
                  <tr className="hover:bg-slate-800/40 transition-colors bg-emerald-500/[0.03]">
                    <td className="py-0.5 px-2.5 font-bold text-[10.5px] text-emerald-400 sticky left-0 bg-slate-900/95 backdrop-blur-md border-r border-slate-800">
                      <div className="flex items-center gap-1.5">
                        <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.8)]" />
                        <span>Ingresos</span>
                      </div>
                    </td>
                    {columns.map((col, idx) => (
                      <td 
                        key={col.periodo}
                        onMouseEnter={() => setHoveredCol(col.periodo)}
                        onMouseLeave={() => setHoveredCol(null)}
                      >
                        <MetricCell 
                          value={col.ingresos} 
                          prevValue={idx > 0 ? columns[idx - 1]?.ingresos : null}
                          isHighlighted={hoveredCol === col.periodo} 
                        />
                      </td>
                    ))}
                    {totalSummary && (
                      <td className="bg-indigo-500/5 border-l border-indigo-500/20">
                        <MetricCell value={totalSummary.ingresos} isTotal />
                      </td>
                    )}
                  </tr>

                  {/* SECCIÓN 2: INDICADORES (PORCENTAJES DE RETENCIÓN / CUMPLIMIENTO) */}
                  <tr className="bg-slate-950/50 border-t border-cyan-500/30">
                    <td 
                      colSpan={columns.length + (totalSummary ? 2 : 1)} 
                      className="py-0.5 px-2.5 text-[8.5px] font-black uppercase tracking-widest text-cyan-400 bg-cyan-950/30 sticky left-0"
                    >
                      <div className="flex items-center gap-1.5">
                        <TrendingUp size={10} className="text-cyan-400" />
                        <span>Indicadores de Eficacia & Retención</span>
                      </div>
                    </td>
                  </tr>

                  {/* 1. % Deserción Nómina */}
                  <tr className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-0.5 px-2.5 font-medium text-[10px] text-slate-300 sticky left-0 bg-slate-900/95 backdrop-blur-md border-r border-slate-800">
                      % Deserción Nómina
                    </td>
                    {columns.map((col, idx) => (
                      <td 
                        key={col.periodo}
                        onMouseEnter={() => setHoveredCol(col.periodo)}
                        onMouseLeave={() => setHoveredCol(null)}
                      >
                        <MetricCell 
                          value={col.indicators.pctDesercionNomina} 
                          prevValue={idx > 0 ? columns[idx - 1]?.indicators?.pctDesercionNomina : null}
                          isPct 
                          isHighlighted={hoveredCol === col.periodo} 
                        />
                      </td>
                    ))}
                    {totalSummary && (
                      <td className="bg-indigo-500/5 border-l border-indigo-500/20">
                        <MetricCell value={totalSummary.indicators.pctDesercionNomina} isPct isTotal />
                      </td>
                    )}
                  </tr>

                  {/* 2. % Deserción Día 0 */}
                  <tr className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-0.5 px-2.5 font-medium text-[10px] text-slate-300 sticky left-0 bg-slate-900/95 backdrop-blur-md border-r border-slate-800">
                      % Deserción Día 0
                    </td>
                    {columns.map((col, idx) => (
                      <td 
                        key={col.periodo}
                        onMouseEnter={() => setHoveredCol(col.periodo)}
                        onMouseLeave={() => setHoveredCol(null)}
                      >
                        <MetricCell 
                          value={col.indicators.pctDesercionDia0} 
                          prevValue={idx > 0 ? columns[idx - 1]?.indicators?.pctDesercionDia0 : null}
                          isPct 
                          isHighlighted={hoveredCol === col.periodo} 
                        />
                      </td>
                    ))}
                    {totalSummary && (
                      <td className="bg-indigo-500/5 border-l border-indigo-500/20">
                        <MetricCell value={totalSummary.indicators.pctDesercionDia0} isPct isTotal />
                      </td>
                    )}
                  </tr>

                  {/* 3. % Deserción Global (Ingresos vs Nómina) */}
                  <tr className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-0.5 px-2.5 font-medium text-[10px] text-slate-300 sticky left-0 bg-slate-900/95 backdrop-blur-md border-r border-slate-800">
                      <span className="font-semibold text-rose-300">% Deserción Global</span>{' '}
                      <span className="text-[8.5px] text-slate-500">(Nómina a OP)</span>
                    </td>
                    {columns.map((col, idx) => (
                      <td 
                        key={col.periodo}
                        onMouseEnter={() => setHoveredCol(col.periodo)}
                        onMouseLeave={() => setHoveredCol(null)}
                      >
                        <MetricCell 
                          value={col.indicators.pctDesercionGlobal} 
                          prevValue={idx > 0 ? columns[idx - 1]?.indicators?.pctDesercionGlobal : null}
                          isPct 
                          isHighlighted={hoveredCol === col.periodo} 
                        />
                      </td>
                    ))}
                    {totalSummary && (
                      <td className="bg-indigo-500/5 border-l border-indigo-500/20">
                        <MetricCell value={totalSummary.indicators.pctDesercionGlobal} isPct isTotal />
                      </td>
                    )}
                  </tr>

                  {/* 4. % Deserción (D1 vs Ingresos) */}
                  <tr className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-0.5 px-2.5 font-medium text-[10px] text-slate-300 sticky left-0 bg-slate-900/95 backdrop-blur-md border-r border-slate-800">
                      % Deserción (D1 vs Ingresos)
                    </td>
                    {columns.map((col, idx) => (
                      <td 
                        key={col.periodo}
                        onMouseEnter={() => setHoveredCol(col.periodo)}
                        onMouseLeave={() => setHoveredCol(null)}
                      >
                        <MetricCell 
                          value={col.indicators.pctDesercionD1VsIngresos} 
                          prevValue={idx > 0 ? columns[idx - 1]?.indicators?.pctDesercionD1VsIngresos : null}
                          isPct 
                          isHighlighted={hoveredCol === col.periodo} 
                        />
                      </td>
                    ))}
                    {totalSummary && (
                      <td className="bg-indigo-500/5 border-l border-indigo-500/20">
                        <MetricCell value={totalSummary.indicators.pctDesercionD1VsIngresos} isPct isTotal />
                      </td>
                    )}
                  </tr>

                  {/* 5. % Cumplimiento Día 1 */}
                  <tr className="hover:bg-slate-800/40 transition-colors bg-cyan-500/[0.02]">
                    <td className="py-0.5 px-2.5 font-semibold text-[10px] text-cyan-300 sticky left-0 bg-slate-900/95 backdrop-blur-md border-r border-slate-800">
                      % Cumplimiento Día 1
                    </td>
                    {columns.map((col, idx) => (
                      <td 
                        key={col.periodo}
                        onMouseEnter={() => setHoveredCol(col.periodo)}
                        onMouseLeave={() => setHoveredCol(null)}
                      >
                        <MetricCell 
                          value={col.indicators.pctCumplimientoDia1} 
                          prevValue={idx > 0 ? columns[idx - 1]?.indicators?.pctCumplimientoDia1 : null}
                          isPct 
                          isFulfillment 
                          isHighlighted={hoveredCol === col.periodo} 
                        />
                      </td>
                    ))}
                    {totalSummary && (
                      <td className="bg-indigo-500/5 border-l border-indigo-500/20">
                        <MetricCell value={totalSummary.indicators.pctCumplimientoDia1} isPct isFulfillment isTotal />
                      </td>
                    )}
                  </tr>

                  {/* 6. % Dotación */}
                  <tr className="hover:bg-slate-800/40 transition-colors bg-emerald-500/[0.03] border-b border-indigo-500/20">
                    <td className="py-0.5 px-2.5 font-black text-[10.5px] text-emerald-300 sticky left-0 bg-slate-900/95 backdrop-blur-md border-r border-slate-800">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <CheckCircle2 size={10} className="text-emerald-400" />
                          <span>% Dotación</span>
                        </div>
                        <span className="text-[8px] font-mono px-1 py-0.2 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">FTE</span>
                      </div>
                    </td>
                    {columns.map((col, idx) => (
                      <td 
                        key={col.periodo}
                        onMouseEnter={() => setHoveredCol(col.periodo)}
                        onMouseLeave={() => setHoveredCol(null)}
                      >
                        <MetricCell 
                          value={col.indicators.pctDotacion} 
                          prevValue={idx > 0 ? columns[idx - 1]?.indicators?.pctDotacion : null}
                          isPct 
                          isFulfillment 
                          isHighlighted={hoveredCol === col.periodo} 
                        />
                      </td>
                    ))}
                    {totalSummary && (
                      <td className="bg-indigo-500/5 border-l border-indigo-500/20">
                        <MetricCell value={totalSummary.indicators.pctDotacion} isPct isFulfillment isTotal />
                      </td>
                    )}
                  </tr>
                </>
              ) : (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-xs text-slate-500">
                    No hay registros disponibles para los periodos seleccionados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Footer Bar con Leyenda Semafórica Minimalista Compacta */}
        <div className="px-3 py-0.5 bg-slate-950/80 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2 text-[9px] text-slate-400 shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="font-bold text-slate-400 uppercase tracking-wider text-[8.5px]">Deserción:</span>
            <div className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              <span>≤ 30% Óptimo</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
              <span>31% - 55% Alerta</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
              <span>&gt; 55% Crítico</span>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <span className="font-bold text-slate-400 uppercase tracking-wider text-[8.5px]">Dotación:</span>
            <div className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" />
              <span>≥ 80% Meta</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
              <span>&lt; 60% Bajo</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
