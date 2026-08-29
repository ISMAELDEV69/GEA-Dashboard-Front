import React, { useState, useMemo, memo } from 'react'
import {
  ResponsiveContainer,
  ComposedChart,
  LineChart,
  AreaChart,
  Area,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ReferenceLine
} from 'recharts'
import {
  TrendingUp,
  Activity,
  Target,
  Percent,
  Calendar,
  Layers,
  Info,
  CheckCircle2,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react'
import Card, { CardHeader, CardTitle, CardDescription, CardContent } from '../ui/Card'
import { Badge } from '../ui/badge'

// Tooltip personalizado Cyberpunk Enterprise
const CustomChartTooltip = memo(function CustomChartTooltip({ active, payload, label, mode }) {
  if (!active || !payload || !payload.length) return null

  const item = payload[0]?.payload || {}

  return (
    <div className="rounded-xl border border-slate-700/80 bg-slate-900/95 p-3 shadow-2xl backdrop-blur-md min-w-[200px] text-xs font-sans text-slate-100 z-50">
      <div className="flex items-center justify-between border-b border-slate-800 pb-1.5 mb-2">
        <span className="font-bold text-slate-200 flex items-center gap-1.5">
          <Calendar size={12} className="text-indigo-400" />
          {item.fecha ? `Fecha: ${item.fecha}` : item.label || label}
        </span>
        {mode === 'METAS_RQ' && (
          <span className={`text-[10px] font-mono font-bold px-1.5 py-0.2 rounded border ${
            (item.brechaOP || 0) >= 0 
              ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' 
              : 'bg-rose-500/15 text-rose-400 border-rose-500/30'
          }`}>
            {(item.brechaOP || 0) >= 0 ? `+${item.brechaOP}` : item.brechaOP} Brecha
          </span>
        )}
      </div>

      <div className="space-y-1.5">
        {payload.map((entry, idx) => {
          const isPct = mode === 'TASAS' || entry.name.includes('%')
          const formattedVal = isPct 
            ? `${Number(entry.value).toFixed(1)}%`
            : Number(entry.value).toLocaleString('es-PE')

          return (
            <div key={`tt-item-${idx}`} className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-1.5 min-w-0">
                <span 
                  className="h-2 w-2 rounded-full shrink-0" 
                  style={{ backgroundColor: entry.color || entry.stroke || entry.fill }} 
                />
                <span className="text-[11px] text-slate-400 truncate">
                  {entry.name}:
                </span>
              </div>
              <span className="font-mono font-bold text-slate-200 tabular-nums shrink-0">
                {formattedVal}
              </span>
            </div>
          )
        })}
      </div>

      {mode === 'METAS_RQ' && (
        <div className="mt-2 pt-1.5 border-t border-slate-800/80 text-[9.5px] text-slate-400 flex flex-col gap-0.5">
          <div className="flex justify-between">
            <span>Cumplimiento RQ OP:</span>
            <strong className="text-emerald-400">{item.pctCumplimientoRq || 0}%</strong>
          </div>
          <div className="flex justify-between">
            <span>Cumplimiento D1:</span>
            <strong className="text-indigo-400">{item.pctCumplimientoD1 || 0}%</strong>
          </div>
        </div>
      )}
    </div>
  )
})

export default function EvolutivoDashboardChart({
  evolutivoData,
  daysRange = 30,
  onDaysRangeChange,
  weeksRange = 'ALL',
  onWeeksRangeChange,
  className = ''
}) {
  // 3 Modos conmutables: 'FLUJO' | 'METAS_RQ' | 'TASAS'
  const [activeMode, setActiveMode] = useState('FLUJO')

  const {
    flujoDiarioData = [],
    flujoTotals = { reclutados: 0, asistenciaD1: 0, conversionesOP: 0 },
    metasRqData = [],
    metasTotals = { totalMetaRqOp: 0, totalMetaAperturaD1: 0, totalIngresosReal: 0, totalDia1Real: 0, brechaGlobalOP: 0 },
    tasasData = [],
    tasasTotals = { avgConversionOP: 0, avgDesercionTemprana: 0, avgCumplimientoD1: 0, avgDotacion: 0 }
  } = evolutivoData || {}

  return (
    <Card className={`w-full shadow-xs hover:shadow-sm transition-all duration-200 flex flex-col border border-slate-800/80 bg-[var(--bg-surface)] ${className}`}>
      {/* Cabecera Interactiva Cyberpunk Compacta */}
      <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 pb-1 pt-2 px-3 bg-gradient-to-r from-[var(--bg-surface)] via-slate-900/30 to-[var(--bg-surface)] border-b border-[var(--border-subtle)]">
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 rounded-lg bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shrink-0">
            {activeMode === 'FLUJO' && <Activity size={14} />}
            {activeMode === 'METAS_RQ' && <Target size={14} />}
            {activeMode === 'TASAS' && <Percent size={14} />}
          </div>
          <div>
            <CardTitle className="text-xs font-black tracking-tight flex items-center gap-1.5 text-[var(--text-primary)]">
              {activeMode === 'FLUJO' && 'Evolutivo de Flujo Operativo y Conversión'}
              {activeMode === 'METAS_RQ' && 'Evolutivo vs. Metas RQ (Capacidad R&S)'}
              {activeMode === 'TASAS' && 'Evolutivo de Tasas & Deserción (%)'}
            </CardTitle>
          </div>
        </div>

        {/* Barra de 3 Botones Conmutadores + Selector de Rango Compactos */}
        <div className="flex flex-wrap items-center gap-1.5">
          {/* Botones de Modo */}
          <div className="flex items-center p-0.5 rounded-lg bg-slate-900/80 border border-slate-800 shadow-inner">
            <button
              type="button"
              onClick={() => setActiveMode('FLUJO')}
              className={`flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[10px] font-bold transition-all cursor-pointer select-none ${
                activeMode === 'FLUJO'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Activity size={11} />
              <span>Flujo Diario</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveMode('METAS_RQ')}
              className={`flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[10px] font-bold transition-all cursor-pointer select-none ${
                activeMode === 'METAS_RQ'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Target size={11} />
              <span>vs. Metas RQ</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveMode('TASAS')}
              className={`flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[10px] font-bold transition-all cursor-pointer select-none ${
                activeMode === 'TASAS'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Percent size={11} />
              <span>Tasas & Deserción</span>
            </button>
          </div>

          {/* Selector de Rango Adaptativo según Modo */}
          {activeMode === 'FLUJO' ? (
            <div className="flex items-center gap-0.5 p-0.5 rounded-md bg-slate-900/60 border border-slate-800 text-[9.5px]">
              {[15, 30, 60].map(d => (
                <button
                  key={`day-range-${d}`}
                  type="button"
                  onClick={() => onDaysRangeChange && onDaysRangeChange(d)}
                  className={`px-1.5 py-0.2 rounded font-mono transition-all cursor-pointer ${
                    daysRange === d
                      ? 'bg-slate-700 text-white font-bold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {d}d
                </button>
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-0.5 p-0.5 rounded-md bg-slate-900/60 border border-slate-800 text-[9.5px]">
              {[
                { id: '8', label: '8 Sem' },
                { id: '12', label: '12 Sem' },
                { id: 'ALL', label: 'Todo 2026' }
              ].map(w => (
                <button
                  key={`week-range-${w.id}`}
                  type="button"
                  onClick={() => onWeeksRangeChange && onWeeksRangeChange(w.id)}
                  className={`px-1.5 py-0.2 rounded font-sans transition-all cursor-pointer ${
                    weeksRange === w.id
                      ? 'bg-slate-700 text-white font-bold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {w.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </CardHeader>

      {/* Sub-barra de Resumen Rápido de Totales */}
      <div className="px-3 py-1 bg-slate-950/40 border-b border-slate-800/60 flex flex-wrap items-center justify-between gap-2.5 text-[10.5px]">
        {activeMode === 'FLUJO' && (
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-[#8b5cf6]" />
              <span className="text-slate-400">Reclutados ({daysRange}d):</span>
              <span className="font-mono font-bold text-slate-100 tabular-nums">
                {flujoTotals.reclutados.toLocaleString('es-PE')}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-[#06b6d4]" />
              <span className="text-slate-400">Día 1:</span>
              <span className="font-mono font-bold text-cyan-300 tabular-nums">
                {flujoTotals.asistenciaD1.toLocaleString('es-PE')}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-[#10b981]" />
              <span className="text-slate-400">Pases OP:</span>
              <span className="font-mono font-bold text-emerald-400 tabular-nums">
                {flujoTotals.conversionesOP.toLocaleString('es-PE')}
              </span>
            </div>
          </div>
        )}

        {activeMode === 'METAS_RQ' && (
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-[#f59e0b]" />
              <span className="text-slate-400">Meta RQ OP:</span>
              <span className="font-mono font-bold text-amber-300 tabular-nums">
                {metasTotals.totalMetaRqOp.toLocaleString('es-PE')}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-[#6366f1]" />
              <span className="text-slate-400">Meta Apertura D1:</span>
              <span className="font-mono font-bold text-indigo-300 tabular-nums">
                {metasTotals.totalMetaAperturaD1.toLocaleString('es-PE')}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-[#10b981]" />
              <span className="text-slate-400">Ingresos OP Reales:</span>
              <span className="font-mono font-bold text-emerald-400 tabular-nums">
                {metasTotals.totalIngresosReal.toLocaleString('es-PE')}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-slate-400">Brecha:</span>
              <span className={`font-mono font-black tabular-nums ${
                metasTotals.brechaGlobalOP >= 0 ? 'text-emerald-400' : 'text-rose-400'
              }`}>
                {metasTotals.brechaGlobalOP >= 0 ? `+${metasTotals.brechaGlobalOP}` : metasTotals.brechaGlobalOP} OP
              </span>
            </div>
          </div>
        )}

        {activeMode === 'TASAS' && (
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-[#10b981]" />
              <span className="text-slate-400">Prom. Conversión OP:</span>
              <span className="font-mono font-bold text-emerald-400 tabular-nums">
                {tasasTotals.avgConversionOP}%
              </span>
            </div>
            <div className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-[#f43f5e]" />
              <span className="text-slate-400">Prom. Deserción Temprana:</span>
              <span className="font-mono font-bold text-rose-400 tabular-nums">
                {tasasTotals.avgDesercionTemprana}%
              </span>
            </div>
            <div className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-[#818cf8]" />
              <span className="text-slate-400">Cumplimiento D1:</span>
              <span className="font-mono font-bold text-indigo-300 tabular-nums">
                {tasasTotals.avgCumplimientoD1}%
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Cuerpo del Gráfico Compacto */}
      <CardContent className="pt-1 px-2 pb-2 flex-1 flex flex-col min-h-0">
        <div className="h-[155px] w-full rounded-lg bg-slate-950/60 border border-slate-800/80 p-1.5">
          <ResponsiveContainer width="100%" height="100%">
            {activeMode === 'FLUJO' ? (
              <AreaChart data={flujoDiarioData} margin={{ top: 10, right: 15, left: -15, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradReclutados" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.0} />
                  </linearGradient>
                  <linearGradient id="gradD1" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#06b6d4" stopOpacity={0.0} />
                  </linearGradient>
                  <linearGradient id="gradOP" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.45} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} vertical={false} />
                <XAxis 
                  dataKey="label" 
                  tick={{ fontSize: 10, fill: '#94a3b8' }} 
                  interval="preserveStartEnd" 
                  axisLine={{ stroke: '#334155' }}
                  tickLine={false}
                />
                <YAxis 
                  tick={{ fontSize: 10, fill: '#94a3b8' }} 
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                />
                <RechartsTooltip content={<CustomChartTooltip mode="FLUJO" />} />
                <Area 
                  type="monotone" 
                  dataKey="reclutados" 
                  name="Reclutados" 
                  stroke="#8b5cf6" 
                  strokeWidth={2.5} 
                  fillOpacity={1} 
                  fill="url(#gradReclutados)" 
                />
                <Area 
                  type="monotone" 
                  dataKey="asistenciaD1" 
                  name="Asistencia Día 1" 
                  stroke="#06b6d4" 
                  strokeWidth={2} 
                  fillOpacity={1} 
                  fill="url(#gradD1)" 
                />
                <Area 
                  type="monotone" 
                  dataKey="conversionesOP" 
                  name="Pases a OP (I-OP)" 
                  stroke="#10b981" 
                  strokeWidth={2.5} 
                  fillOpacity={1} 
                  fill="url(#gradOP)" 
                />
              </AreaChart>
            ) : activeMode === 'METAS_RQ' ? (
              <ComposedChart data={metasRqData} margin={{ top: 10, right: 15, left: -15, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} vertical={false} />
                <XAxis 
                  dataKey="label" 
                  tick={{ fontSize: 10, fill: '#94a3b8' }} 
                  axisLine={{ stroke: '#334155' }}
                  tickLine={false}
                />
                <YAxis 
                  tick={{ fontSize: 10, fill: '#94a3b8' }} 
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                />
                <RechartsTooltip content={<CustomChartTooltip mode="METAS_RQ" />} />
                <Bar 
                  dataKey="ingresosReal" 
                  name="Ingresos Reales OP" 
                  fill="#10b981" 
                  radius={[4, 4, 0, 0]} 
                  barSize={18}
                />
                <Bar 
                  dataKey="dia1Real" 
                  name="Día 1 Real" 
                  fill="#38bdf8" 
                  opacity={0.7}
                  radius={[4, 4, 0, 0]} 
                  barSize={14}
                />
                <Line 
                  type="monotone" 
                  dataKey="metaRqOp" 
                  name="Meta Requerida OP (RQ)" 
                  stroke="#f59e0b" 
                  strokeWidth={2.5} 
                  strokeDasharray="4 4"
                  dot={{ r: 4, fill: '#f59e0b' }}
                />
                <Line 
                  type="monotone" 
                  dataKey="metaAperturaD1" 
                  name="Meta Apertura Día 1" 
                  stroke="#818cf8" 
                  strokeWidth={2} 
                  strokeDasharray="2 2"
                  dot={{ r: 3, fill: '#818cf8' }}
                />
              </ComposedChart>
            ) : (
              <LineChart data={tasasData} margin={{ top: 10, right: 15, left: -15, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} vertical={false} />
                <XAxis 
                  dataKey="label" 
                  tick={{ fontSize: 10, fill: '#94a3b8' }} 
                  axisLine={{ stroke: '#334155' }}
                  tickLine={false}
                />
                <YAxis 
                  tick={{ fontSize: 10, fill: '#94a3b8' }} 
                  axisLine={false}
                  tickLine={false}
                  domain={[0, 100]}
                  unit="%"
                />
                <ReferenceLine y={80} stroke="#10b981" strokeDasharray="3 3" strokeOpacity={0.6} label={{ value: 'Meta 80%', fill: '#10b981', fontSize: 9, position: 'insideTopRight' }} />
                <ReferenceLine y={50} stroke="#f59e0b" strokeDasharray="3 3" strokeOpacity={0.5} label={{ value: 'Alerta 50%', fill: '#f59e0b', fontSize: 9, position: 'insideTopRight' }} />
                <RechartsTooltip content={<CustomChartTooltip mode="TASAS" />} />
                <Line 
                  type="monotone" 
                  dataKey="pctConversionOP" 
                  name="% Conversión a OP" 
                  stroke="#10b981" 
                  strokeWidth={2.5} 
                  dot={{ r: 4, fill: '#10b981' }}
                  activeDot={{ r: 6 }}
                />
                <Line 
                  type="monotone" 
                  dataKey="pctDesercionTemprana" 
                  name="% Deserción Temprana (Nómina a D1)" 
                  stroke="#f43f5e" 
                  strokeWidth={2} 
                  dot={{ r: 3, fill: '#f43f5e' }}
                  activeDot={{ r: 5 }}
                />
                <Line 
                  type="monotone" 
                  dataKey="pctCumplimientoD1" 
                  name="% Cumplimiento Meta D1" 
                  stroke="#818cf8" 
                  strokeWidth={2} 
                  strokeDasharray="4 4"
                  dot={{ r: 3, fill: '#818cf8' }}
                  activeDot={{ r: 5 }}
                />
                <Line 
                  type="monotone" 
                  dataKey="pctDotacion" 
                  name="% Dotación OP (vs Meta RQ)" 
                  stroke="#fbbf24" 
                  strokeWidth={2} 
                  dot={{ r: 3, fill: '#fbbf24' }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            )}
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}
