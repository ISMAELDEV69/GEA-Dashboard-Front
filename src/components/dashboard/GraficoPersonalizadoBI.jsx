import React, { useState, useMemo, memo } from 'react'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  ComposedChart,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts'
import {
  BarChart3,
  ChevronDown,
} from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '../ui/card'
import { KPI_CATALOG, buildGraficoPersonalizadoData, computePeriodVariance } from '../../lib/dashboardAnalytics'

/**
 * Custom Tooltip Cyberpunk Enterprise con Análisis de Varianza
 */
const CustomTooltip = memo(({ active, payload, label, kpiConfig }) => {
  if (!active || !payload || !payload.length) return null
  const d = payload[0]?.payload
  if (!d) return null

  const isPercent = kpiConfig?.type === 'percent'
  const formatVal = (v) => {
    if (v == null) return '-'
    return isPercent ? `${Number(v).toFixed(1)}%` : Number(v).toLocaleString('es-PE')
  }

  const v = d.variance

  return (
    <div className="bg-slate-950/95 border border-slate-700/90 rounded-lg p-2 shadow-2xl backdrop-blur-md text-[10.5px] min-w-[195px] animate-in fade-in duration-150 z-50">
      <div className="flex items-center justify-between border-b border-slate-800 pb-1 mb-1 font-mono text-slate-300">
        <span className="font-bold text-slate-100">{d.label || label}</span>
        {d.isProjection && (
          <span className="text-[8.5px] px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 uppercase font-black tracking-wider">
            Proyección
          </span>
        )}
      </div>

      <div className="space-y-1 font-mono">
        <div className="flex items-center justify-between text-slate-300">
          <span className="text-[9.5px] text-slate-400">{kpiConfig?.label}:</span>
          <span className="font-bold text-slate-100 tabular-nums">
            {formatVal(d.valor)}
          </span>
        </div>

        {/* Varianza vs Período Anterior */}
        {v && (
          <div className="flex items-center justify-between text-[9.5px] py-0.5 px-1 rounded bg-slate-900/80 border border-slate-800/80">
            <span className="text-slate-400">vs. Anterior:</span>
            <span className={`font-black tabular-nums flex items-center gap-0.5 ${
              v.isNeutral 
                ? 'text-slate-400' 
                : v.isImprovement 
                  ? 'text-emerald-400' 
                  : 'text-rose-400'
            }`}>
              {v.deltaPct > 0 ? '▲' : v.deltaPct < 0 ? '▼' : '—'} {v.formattedDeltaPct}
              <span className="text-[8px] font-normal text-slate-400">
                ({v.isImprovement ? 'Mejora' : 'Baja'})
              </span>
            </span>
          </div>
        )}

        {d.meta != null && d.meta > 0 && (
          <div className="flex items-center justify-between text-amber-400">
            <span className="text-[9.5px] text-amber-400/90">Meta RQ:</span>
            <span className="font-bold tabular-nums">
              {formatVal(d.meta)}
            </span>
          </div>
        )}

        {/* Desglose contextual compacto */}
        <div className="pt-1 mt-1 border-t border-slate-800/80 grid grid-cols-2 gap-x-2 gap-y-0.5 text-[9px] text-slate-400">
          <div>Nómina: <span className="text-slate-200 font-bold">{d.nomina ?? '-'}</span></div>
          <div>Día 0: <span className="text-blue-300 font-bold">{d.dia0 ?? '-'}</span></div>
          <div>Día 1: <span className="text-cyan-300 font-bold">{d.dia1 ?? '-'}</span></div>
          <div>Pases OP: <span className="text-emerald-300 font-bold">{d.ingresos ?? '-'}</span></div>
        </div>
      </div>
    </div>
  )
})

export default function GraficoPersonalizadoBI({
  postulantes = [],
  asistencias = [],
  campanasMetas = [],
  indexes = null,
  className = '',
}) {
  // Estados de control de la gráfica
  const [selectedKpi, setSelectedKpi] = useState('INGRESOS_OP')
  const [chartType, setChartType] = useState('BARRAS') // 'BARRAS' | 'LINEAS' | 'AREA' | 'MIXTO'
  const [granularity, setGranularity] = useState('PERIODO') // 'PERIODO' | 'SEMANA' | 'DIARIO'

  const kpiConfig = KPI_CATALOG[selectedKpi] || KPI_CATALOG.INGRESOS_OP
  const isDesertion = selectedKpi.includes('DESERCION') || kpiConfig.isDesertion

  // Ajustar granularidad y tipo de gráfico si la métrica actual no los soporta
  const effectiveGranularity = kpiConfig.allowedGranularities.includes(granularity)
    ? granularity
    : kpiConfig.allowedGranularities[0]

  const effectiveChartType = (!kpiConfig.hasMeta && chartType === 'MIXTO')
    ? 'BARRAS'
    : chartType

  // Procesamiento in-memory memoizado
  const chartDataResult = useMemo(() => {
    return buildGraficoPersonalizadoData(postulantes, asistencias, campanasMetas, indexes, {
      kpiId: selectedKpi,
      granularity: effectiveGranularity,
      days: 30,
    })
  }, [postulantes, asistencias, campanasMetas, indexes, selectedKpi, effectiveGranularity])

  const { data: rawData = [], totalCount = 0, avgPercent = 0 } = chartDataResult

  // Enriquecer datos con cálculo de varianza inter-período (PoP)
  const data = useMemo(() => {
    return (rawData || []).map((d, i, arr) => {
      const prev = i > 0 ? arr[i - 1]?.valor : null
      const variance = prev != null ? computePeriodVariance(d.valor, prev, isDesertion) : null
      return {
        ...d,
        variance,
      }
    })
  }, [rawData, isDesertion])

  // Varianza del último período disponible vs anterior
  const latestVariance = useMemo(() => {
    if (!data || data.length < 2) return null
    const validPoints = data.filter(d => !d.isProjection && d.valor != null)
    if (validPoints.length < 2) return null
    const last = validPoints[validPoints.length - 1]
    const prev = validPoints[validPoints.length - 2]
    return computePeriodVariance(last.valor, prev.valor, isDesertion)
  }, [data, isDesertion])

  const isPercent = kpiConfig.type === 'percent'
  const primaryColor = kpiConfig.color || '#06b6d4'
  const metaColor = kpiConfig.metaColor || '#f59e0b'

  return (
    <Card className={`w-full h-full shadow-xs flex flex-col border border-slate-800/90 bg-slate-900/80 rounded-xl overflow-hidden backdrop-blur-md ${className}`}>
      {/* ── BARRA SUPERIOR UNIFICADA (Título + Leyenda + Controles + Stat Pill en 1 sola fila) ── */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-1 px-2.5 bg-gradient-to-r from-slate-900/95 via-slate-900/60 to-slate-900/95 border-b border-slate-800/80 shrink-0">
        {/* Izquierda: Título y Leyenda Inline */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="flex items-center gap-1.5">
            <div className="h-4.5 w-4.5 rounded-md bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shrink-0 shadow-xs">
              <BarChart3 size={10.5} />
            </div>
            <span className="text-[10.5px] font-black tracking-wider uppercase text-slate-100 flex items-center gap-1">
              <span>Gráfico Personalizado</span>
              <span className="text-[8px] font-mono px-1 py-0.2 rounded bg-slate-800 text-cyan-300/80 font-bold border border-cyan-500/20 lowercase">
                bi
              </span>
            </span>
          </div>

          <div className="h-3 w-px bg-slate-800 hidden sm:block" />

          {/* Leyenda Inline compacta */}
          <div className="flex items-center gap-2 text-[9.5px]">
            <div className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-xs" style={{ backgroundColor: primaryColor }} />
              <span className="text-slate-300 font-semibold">{kpiConfig.label}</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-xs border border-dashed" style={{ borderColor: primaryColor, backgroundColor: `${primaryColor}33` }} />
              <span className="text-slate-400 font-medium">Proyección</span>
            </div>
            {kpiConfig.hasMeta && (
              <div className="flex items-center gap-1">
                <span className="h-0.5 w-2 bg-amber-400 rounded-full" />
                <span className="text-amber-400 font-medium">{kpiConfig.metaLabel || 'Meta RQ'}</span>
              </div>
            )}
          </div>
        </div>

        {/* Derecha: Selectores Compactos y Resumen */}
        <div className="flex items-center gap-1.5 ml-auto">
          {/* Selector 1: Indicador (KPI) */}
          <div className="relative flex items-center">
            <select
              aria-label="Seleccionar Indicador"
              value={selectedKpi}
              onChange={(e) => {
                const nextKpi = e.target.value
                setSelectedKpi(nextKpi)
                const nextConfig = KPI_CATALOG[nextKpi]
                if (nextConfig && !nextConfig.allowedGranularities.includes(granularity)) {
                  setGranularity(nextConfig.allowedGranularities[0])
                }
              }}
              className="appearance-none bg-slate-950/90 border border-slate-700/80 hover:border-cyan-500/50 text-slate-100 text-[10px] font-semibold rounded-md h-6 py-0 pl-2 pr-4.5 cursor-pointer focus:outline-none focus:ring-1 focus:ring-cyan-500 transition-colors shadow-xs max-w-[190px] truncate"
            >
              <optgroup label="── VOLÚMENES Y DOTACIÓN ──">
                <option value="INGRESOS_OP">Ingresos Reales OP (I-OP)</option>
                <option value="NOMINA">Postulantes Nómina</option>
                <option value="DIA_0">Asistencia Día 0</option>
                <option value="DIA_1">Asistencia Día 1 (Aula)</option>
                <option value="META_RQ_OP">Meta Requerida OP (RQ)</option>
                <option value="META_APERTURA_D1">Meta Apertura Día 1</option>
                <option value="COMPARATIVO_OP">Ingresos OP vs. Meta RQ</option>
              </optgroup>
              <optgroup label="── TASAS Y DESERCIÓN (%) ──">
                <option value="PCT_DESERCION_NOMINA">% Deserción Nómina (D0 vs Nómina)</option>
                <option value="PCT_DESERCION_DIA_0">% Deserción Día 0 (D1 vs D0)</option>
                <option value="PCT_DESERCION_GLOBAL">% Deserción Global (Nómina a OP)</option>
                <option value="PCT_DESERCION_CAP">% Deserción Capacitación (D1 a OP)</option>
                <option value="PCT_CUMPLIMIENTO_D1">% Cumplimiento Día 1</option>
                <option value="PCT_DOTACION_OP">% Dotación Operativa</option>
              </optgroup>
            </select>
            <ChevronDown size={9.5} className="absolute right-1 text-slate-400 pointer-events-none" />
          </div>

          {/* Selector 2: Tipo de Gráfica */}
          <div className="relative flex items-center">
            <select
              aria-label="Seleccionar Tipo de Gráfica"
              value={effectiveChartType}
              onChange={(e) => setChartType(e.target.value)}
              className="appearance-none bg-slate-950/90 border border-slate-700/80 hover:border-cyan-500/50 text-slate-100 text-[10px] font-semibold rounded-md h-6 py-0 pl-2 pr-4.5 cursor-pointer focus:outline-none focus:ring-1 focus:ring-cyan-500 transition-colors shadow-xs"
            >
              <option value="BARRAS">Barras</option>
              <option value="LINEAS">Líneas</option>
              <option value="AREA">Área</option>
              {kpiConfig.hasMeta && (
                <option value="MIXTO">Barras + Meta</option>
              )}
            </select>
            <ChevronDown size={9.5} className="absolute right-1 text-slate-400 pointer-events-none" />
          </div>

          {/* Selector 3: Granularidad Temporal */}
          <div className="relative flex items-center">
            <select
              aria-label="Seleccionar Agrupación Temporal"
              value={effectiveGranularity}
              onChange={(e) => setGranularity(e.target.value)}
              className="appearance-none bg-slate-950/90 border border-slate-700/80 hover:border-cyan-500/50 text-slate-100 text-[10px] font-semibold rounded-md h-6 py-0 pl-2 pr-4.5 cursor-pointer focus:outline-none focus:ring-1 focus:ring-cyan-500 transition-colors shadow-xs font-sans"
            >
              {kpiConfig.allowedGranularities.includes('PERIODO') && (
                <option value="PERIODO">Por período</option>
              )}
              {kpiConfig.allowedGranularities.includes('SEMANA') && (
                <option value="SEMANA">Por semana</option>
              )}
              {kpiConfig.allowedGranularities.includes('DIARIO') && (
                <option value="DIARIO">Diario (30d)</option>
              )}
            </select>
            <ChevronDown size={9.5} className="absolute right-1 text-slate-400 pointer-events-none" />
          </div>

          {/* Stat Pill con Varianza */}
          <div className="flex items-center gap-1.5 font-mono text-[9px] px-1.5 py-0.5 rounded-md bg-slate-950 border border-slate-800 shadow-xs shrink-0">
            <div className="flex items-center gap-1">
              <span className="text-slate-400 font-medium">
                {isPercent ? 'Prom:' : 'Total:'}
              </span>
              <span className="font-black text-[10.5px] tabular-nums" style={{ color: primaryColor }}>
                {isPercent ? `${avgPercent}%` : totalCount.toLocaleString('es-PE')}
              </span>
            </div>
            {latestVariance && (
              <span 
                className={`flex items-center gap-0.5 px-1 py-0.2 rounded text-[8px] font-black border tracking-tight ${
                  latestVariance.isNeutral
                    ? 'bg-slate-800 text-slate-400 border-slate-700'
                    : latestVariance.isImprovement
                      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                      : 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                }`}
                title={`Variación del último período (${latestVariance.formattedDeltaPct})`}
              >
                {latestVariance.deltaPct > 0 ? '▲' : latestVariance.deltaPct < 0 ? '▼' : '—'} {latestVariance.formattedDeltaPct}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── LIENZO DE DIBUJO DIRECTO EDGE-TO-EDGE (Sin marcos interiores innecesarios) ── */}
      <div className="p-0.5 pt-1.5 flex-1 min-h-0 flex flex-col w-full">
        <ResponsiveContainer width="100%" height="100%">
          {/* 1. TIPO BARRAS */}
          {effectiveChartType === 'BARRAS' && (
            <BarChart data={data} margin={{ top: 12, right: 15, left: -22, bottom: 0 }}>
              <defs>
                <linearGradient id="colorBarReal" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={primaryColor} stopOpacity={1} />
                  <stop offset="100%" stopColor={primaryColor} stopOpacity={0.6} />
                </linearGradient>
                <linearGradient id="colorBarProj" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={primaryColor} stopOpacity={0.45} />
                  <stop offset="100%" stopColor={primaryColor} stopOpacity={0.15} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} opacity={0.6} />
              <XAxis
                dataKey="label"
                stroke="#64748b"
                fontSize={9.5}
                tickLine={false}
                axisLine={{ stroke: '#334155' }}
              />
              <YAxis
                stroke="#64748b"
                fontSize={9.5}
                tickLine={false}
                axisLine={{ stroke: '#334155' }}
                tickFormatter={(v) => (isPercent ? `${v}%` : v)}
                domain={isPercent ? [0, 100] : ['auto', 'auto']}
              />
              <Tooltip content={<CustomTooltip kpiConfig={kpiConfig} />} />
              <Bar
                dataKey="valorReal"
                name={kpiConfig.label}
                fill="url(#colorBarReal)"
                radius={[3, 3, 0, 0]}
                maxBarSize={48}
              />
              <Bar
                dataKey="proyeccion"
                name="Proyección"
                fill="url(#colorBarProj)"
                stroke={primaryColor}
                strokeDasharray="3 3"
                radius={[3, 3, 0, 0]}
                maxBarSize={48}
              />
            </BarChart>
          )}

          {/* 2. TIPO LÍNEAS */}
          {effectiveChartType === 'LINEAS' && (
            <LineChart data={data} margin={{ top: 12, right: 15, left: -22, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} opacity={0.6} />
              <XAxis
                dataKey="label"
                stroke="#64748b"
                fontSize={9.5}
                tickLine={false}
                axisLine={{ stroke: '#334155' }}
              />
              <YAxis
                stroke="#64748b"
                fontSize={9.5}
                tickLine={false}
                axisLine={{ stroke: '#334155' }}
                tickFormatter={(v) => (isPercent ? `${v}%` : v)}
                domain={isPercent ? [0, 100] : ['auto', 'auto']}
              />
              <Tooltip content={<CustomTooltip kpiConfig={kpiConfig} />} />
              <Line
                type="monotone"
                dataKey="valor"
                name={kpiConfig.label}
                stroke={primaryColor}
                strokeWidth={2.5}
                dot={{ r: 3, fill: primaryColor, stroke: '#0b0f19', strokeWidth: 1.5 }}
                activeDot={{ r: 5, fill: '#fff', stroke: primaryColor, strokeWidth: 2 }}
              />
            </LineChart>
          )}

          {/* 3. TIPO ÁREA */}
          {effectiveChartType === 'AREA' && (
            <AreaChart data={data} margin={{ top: 12, right: 15, left: -22, bottom: 0 }}>
              <defs>
                <linearGradient id="colorAreaKpi" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={primaryColor} stopOpacity={0.45} />
                  <stop offset="95%" stopColor={primaryColor} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} opacity={0.6} />
              <XAxis
                dataKey="label"
                stroke="#64748b"
                fontSize={9.5}
                tickLine={false}
                axisLine={{ stroke: '#334155' }}
              />
              <YAxis
                stroke="#64748b"
                fontSize={9.5}
                tickLine={false}
                axisLine={{ stroke: '#334155' }}
                tickFormatter={(v) => (isPercent ? `${v}%` : v)}
                domain={isPercent ? [0, 100] : ['auto', 'auto']}
              />
              <Tooltip content={<CustomTooltip kpiConfig={kpiConfig} />} />
              <Area
                type="monotone"
                dataKey="valor"
                name={kpiConfig.label}
                stroke={primaryColor}
                strokeWidth={2.5}
                fillOpacity={1}
                fill="url(#colorAreaKpi)"
                dot={{ r: 3, fill: primaryColor, stroke: '#0b0f19', strokeWidth: 1.5 }}
                activeDot={{ r: 5, fill: '#fff', stroke: primaryColor, strokeWidth: 2 }}
              />
            </AreaChart>
          )}

          {/* 4. TIPO MIXTO: BARRAS + META */}
          {effectiveChartType === 'MIXTO' && (
            <ComposedChart data={data} margin={{ top: 12, right: 15, left: -22, bottom: 0 }}>
              <defs>
                <linearGradient id="colorComposedBar" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={primaryColor} stopOpacity={1} />
                  <stop offset="100%" stopColor={primaryColor} stopOpacity={0.6} />
                </linearGradient>
                <linearGradient id="colorComposedProj" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={primaryColor} stopOpacity={0.45} />
                  <stop offset="100%" stopColor={primaryColor} stopOpacity={0.15} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} opacity={0.6} />
              <XAxis
                dataKey="label"
                stroke="#64748b"
                fontSize={9.5}
                tickLine={false}
                axisLine={{ stroke: '#334155' }}
              />
              <YAxis
                stroke="#64748b"
                fontSize={9.5}
                tickLine={false}
                axisLine={{ stroke: '#334155' }}
                tickFormatter={(v) => (isPercent ? `${v}%` : v)}
                domain={isPercent ? [0, 100] : ['auto', 'auto']}
              />
              <Tooltip content={<CustomTooltip kpiConfig={kpiConfig} />} />
              <Bar
                dataKey="valorReal"
                name={kpiConfig.label}
                fill="url(#colorComposedBar)"
                radius={[3, 3, 0, 0]}
                maxBarSize={44}
              />
              <Bar
                dataKey="proyeccion"
                name="Proyección"
                fill="url(#colorComposedProj)"
                stroke={primaryColor}
                strokeDasharray="3 3"
                radius={[3, 3, 0, 0]}
                maxBarSize={44}
              />
              <Line
                type="monotone"
                dataKey="meta"
                name={kpiConfig.metaLabel || 'Meta RQ'}
                stroke={metaColor}
                strokeWidth={2.2}
                strokeDasharray="4 4"
                dot={{ r: 3, fill: metaColor, stroke: '#0b0f19', strokeWidth: 1.5 }}
              />
            </ComposedChart>
          )}
        </ResponsiveContainer>
      </div>
    </Card>
  )
}
