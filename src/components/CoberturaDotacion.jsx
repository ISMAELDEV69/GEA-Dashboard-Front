import React, { useCallback, useEffect, useMemo, useState, memo } from 'react'
import {
  ResponsiveContainer,
  ComposedChart,
  BarChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  LabelList,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts'
import { Download, Eraser } from 'lucide-react'
import * as XLSX from 'xlsx'
import { GeaModernDeltaEmblem } from './GeaLogo'
import {
  COBERTURA_COLORS,
  MODALIDADES,
  buildCoberturaDotacionModel,
  aggregateCoberturaDotacion,
  formatPeNumber,
  formatPePercent,
  formatCorteDate,
} from '../lib/coberturaDotacionAnalytics'

function useIsDarkTheme() {
  const [isDark, setIsDark] = useState(() => {
    if (typeof document === 'undefined') return true
    return document.documentElement.getAttribute('data-theme') !== 'light'
  })

  useEffect(() => {
    const el = document.documentElement
    const sync = () => setIsDark(el.getAttribute('data-theme') !== 'light')
    sync()
    const obs = new MutationObserver(sync)
    obs.observe(el, { attributes: true, attributeFilter: ['data-theme'] })
    return () => obs.disconnect()
  }, [])

  return isDark
}

function getVisualTheme(isDark) {
  if (isDark) {
    return {
      rq: '#FB923C',
      ingresos: '#4ADE80',
      line: '#38BDF8',
      presencial: '#A78BFA',
      remoto: '#FACC15',
      hibrido: '#2DD4BF',
      headerBg: 'linear-gradient(90deg, #020617 0%, #0F172A 55%, #164E63 100%)',
      filterBg: 'var(--bg-elevated)',
      filterLabel: 'var(--text-primary)',
      cardBg: 'var(--bg-surface)',
      pageBg: 'var(--bg-base)',
      grid: 'rgba(148,163,184,0.22)',
      tick: '#E2E8F0',
      label: '#F8FAFC',
      tooltipBg: '#0F172A',
      tooltipBorder: 'rgba(148,163,184,0.35)',
      tooltipText: '#F8FAFC',
      up: 'text-emerald-400',
      down: 'text-red-400',
      neutral: 'text-[var(--text-primary)]',
    }
  }
  return {
    rq: COBERTURA_COLORS.rq,
    ingresos: COBERTURA_COLORS.ingresos,
    line: COBERTURA_COLORS.line,
    presencial: COBERTURA_COLORS.presencial,
    remoto: COBERTURA_COLORS.remoto,
    hibrido: COBERTURA_COLORS.hibrido,
    headerBg: `linear-gradient(90deg, ${COBERTURA_COLORS.header} 0%, #1f4e89 55%, #163A6B 100%)`,
    filterBg: COBERTURA_COLORS.filterBar,
    filterLabel: '#163A6B',
    cardBg: '#FFFFFF',
    pageBg: '#e8edf3',
    grid: '#e2e8f0',
    tick: '#475569',
    label: '#1e293b',
    tooltipBg: '#FFFFFF',
    tooltipBorder: '#e2e8f0',
    tooltipText: '#1e293b',
    up: 'text-emerald-600',
    down: 'text-red-600',
    neutral: 'text-slate-900',
  }
}

function deltaPct(ingresos, rq) {
  if (!rq) return ingresos > 0 ? 100 : 0
  return ((ingresos - rq) / rq) * 100
}

function formatDelta(ingresos, rq) {
  const d = deltaPct(ingresos, rq)
  const sign = d > 0 ? '+' : ''
  return `${sign}${formatPePercent(d)}`
}

const ComboTooltip = memo(({ active, payload, label, theme }) => {
  if (!active || !payload?.length) return null
  const row = payload[0]?.payload
  if (!row) return null
  return (
    <div
      className="rounded-md px-3 py-2 text-[11px] shadow-lg"
      style={{ background: theme.tooltipBg, border: `1px solid ${theme.tooltipBorder}`, color: theme.tooltipText }}
    >
      <p className="mb-1 font-bold">{label}</p>
      <p style={{ color: theme.rq }}>Requerido: {formatPeNumber(row.requerimiento)}</p>
      <p style={{ color: theme.ingresos }}>Ingresos: {formatPeNumber(row.ingresos)}</p>
      <p style={{ color: theme.line }}>Cobertura: {formatPePercent(row.coberturaPct)}</p>
      <p className={row.brecha >= 0 ? theme.up : theme.down}>
        Brecha: {formatPeNumber(row.brecha)}
      </p>
    </div>
  )
})
ComboTooltip.displayName = 'ComboTooltip'

const PairTooltip = memo(({ active, payload, label, mode, theme }) => {
  if (!active || !payload?.length) return null
  const row = payload[0]?.payload
  if (!row) return null
  const title = label || row.segmento || row.campana
  return (
    <div
      className="rounded-md px-3 py-2 text-[11px] shadow-lg"
      style={{ background: theme.tooltipBg, border: `1px solid ${theme.tooltipBorder}`, color: theme.tooltipText }}
    >
      <p className="mb-1 font-bold">{title}</p>
      <p>Requerimiento: {formatPeNumber(row.requerimiento)}</p>
      <p>Ingresos: {formatPeNumber(row.ingresos)}</p>
      <p>{mode === 'brecha' ? `Brecha: ${formatPeNumber(row.brecha)}` : `Cobertura: ${formatPePercent(row.coberturaPct)}`}</p>
    </div>
  )
})
PairTooltip.displayName = 'PairTooltip'

function KpiCard({ title, value, subtitle, tone = 'neutral', theme }) {
  const valueClass = tone === 'up' ? theme.up : tone === 'down' ? theme.down : theme.neutral
  return (
    <article
      className="flex min-h-[118px] flex-col rounded-sm border border-[var(--border-normal)] px-4 py-3 shadow-[0_2px_6px_rgba(15,23,42,0.18)]"
      style={{ background: theme.cardBg }}
    >
      <h3 className="text-center text-[12px] font-black uppercase tracking-[0.08em] text-[var(--text-primary)]">
        {title}
      </h3>
      <p className="text-center text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
        Último periodo evaluado
      </p>
      <p className={`mt-1 text-center text-[34px] font-black leading-none tabular-nums ${valueClass}`}>
        {value}
      </p>
      {subtitle ? (
        <p className="mt-2 text-center text-[10px] font-semibold leading-tight text-[var(--text-secondary)]">
          {subtitle}
        </p>
      ) : null}
    </article>
  )
}

function SectionTitle({ children, isDark }) {
  return (
    <div className="mb-2 flex justify-center">
      <span
        className={`rounded-sm px-4 py-1 text-[11px] font-black uppercase tracking-wider shadow-sm ${
          isDark ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-400/40' : 'bg-[#163A6B] text-white'
        }`}
      >
        {children}
      </span>
    </div>
  )
}

function CoberturaDotacion({ grupos = [], postulantes = [], asistencias = [] }) {
  const isDark = useIsDarkTheme()
  const theme = useMemo(() => getVisualTheme(isDark), [isDark])
  const modColor = {
    PRESENCIAL: theme.presencial,
    REMOTO: theme.remoto,
    HIBRIDO: theme.hibrido,
  }

  const [segmento, setSegmento] = useState('')
  const [campana, setCampana] = useState('')
  const [periodo, setPeriodo] = useState('')
  const [modalidades, setModalidades] = useState(() => [...MODALIDADES])
  const [segmentMode, setSegmentMode] = useState('cobertura')
  const [activeTableKey, setActiveTableKey] = useState('')

  const model = useMemo(
    () => buildCoberturaDotacionModel(grupos, asistencias, postulantes),
    [grupos, asistencias, postulantes]
  )

  const effectivePeriodo = periodo || model.defaultPeriodo

  const filters = useMemo(
    () => ({ segmento, campana, periodo: effectivePeriodo, modalidades }),
    [segmento, campana, effectivePeriodo, modalidades]
  )

  const view = useMemo(
    () => aggregateCoberturaDotacion(model, filters),
    [model, filters]
  )

  const campanaOptions = view.filterOptions.campanas

  const clearFilters = useCallback(() => {
    setSegmento('')
    setCampana('')
    setPeriodo(model.defaultPeriodo || '')
    setModalidades([...MODALIDADES])
    setActiveTableKey('')
  }, [model.defaultPeriodo])

  const toggleModalidad = useCallback((mod) => {
    setModalidades((prev) => {
      const on = prev.includes(mod)
      if (on) {
        const next = prev.filter((m) => m !== mod)
        return next.length ? next : [...MODALIDADES]
      }
      return [...prev, mod]
    })
  }, [])

  const kpis = view.kpis
  const kpiTone = kpis.brecha >= 0 ? 'up' : 'down'

  const handleExport = useCallback(() => {
    const rows = [
      ...view.tabla.map((r) => ({
        SEGMENTO: r.segmento,
        CAMPAÑA: r.campana,
        REQUERIMIENTO: r.requerimiento,
        INGRESOS: r.ingresos,
        '% COBERTURA': Number((r.coberturaPct / 100).toFixed(4)),
        BRECHA: r.brecha,
      })),
      {
        SEGMENTO: 'Total',
        CAMPAÑA: '',
        REQUERIMIENTO: kpis.requerimiento,
        INGRESOS: kpis.ingresos,
        '% COBERTURA': Number((kpis.coberturaPct / 100).toFixed(4)),
        BRECHA: kpis.brecha,
      },
    ]
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Cobertura')
    XLSX.writeFile(wb, `GEA_Cobertura_Dotacion_${effectivePeriodo || 'all'}.xlsx`)
  }, [view.tabla, kpis, effectivePeriodo])

  const pieData = view.modalidad.filter((m) => m.ingresos > 0)
  const selectClass = 'mt-1 h-8 rounded-sm border border-[var(--border-normal)] bg-[var(--input-bg)] px-2 text-[12px] font-semibold text-[var(--text-primary)]'

  return (
    <div className="h-full overflow-auto p-3 text-[var(--text-primary)]" style={{ background: theme.pageBg }}>
      <div className="mx-auto max-w-[1600px] space-y-3">
        <header
          className="flex items-center justify-between gap-4 px-5 py-3 text-white shadow-md"
          style={{ background: theme.headerBg }}
        >
          <h1 className="text-[18px] font-black uppercase tracking-[0.06em] md:text-[22px]">
            WFM Reporte Gerencial de Cobertura de Dotación
          </h1>
          <div className="flex items-center gap-3">
            <div className="text-right leading-tight">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-white/80">
                Actualizado al corte de:
              </p>
              <p className="text-[15px] font-black">{formatCorteDate(model.corteIso)}</p>
            </div>
            <div className="flex items-center gap-2 border-l border-white/20 pl-3">
              <GeaModernDeltaEmblem className="h-9 w-9" variant="white" animated={false} />
              <div className="leading-tight">
                <p className="text-[13px] font-black tracking-wide">GEA</p>
                <p className="text-[10px] font-semibold text-white/80">PERÚ</p>
              </div>
            </div>
          </div>
        </header>

        <section
          className="flex flex-wrap items-end gap-3 rounded-sm px-4 py-3 shadow-sm border border-[var(--border-normal)]"
          style={{ background: theme.filterBg }}
        >
          <p className="mr-1 text-[15px] font-black uppercase tracking-wide" style={{ color: theme.filterLabel }}>Filtros</p>
          <label className="flex min-w-[140px] flex-col text-[10px] font-black uppercase tracking-wide" style={{ color: theme.filterLabel }}>
            Segmento
            <select
              value={segmento}
              onChange={(e) => {
                setSegmento(e.target.value)
                setCampana('')
              }}
              className={selectClass}
            >
              <option value="">Todas</option>
              {view.filterOptions.segmentos.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>
          <label className="flex min-w-[180px] flex-1 flex-col text-[10px] font-black uppercase tracking-wide" style={{ color: theme.filterLabel }}>
            Campaña
            <select
              value={campana}
              onChange={(e) => setCampana(e.target.value)}
              className={selectClass}
            >
              <option value="">Todas</option>
              {campanaOptions.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>
          <label className="flex min-w-[120px] flex-col text-[10px] font-black uppercase tracking-wide" style={{ color: theme.filterLabel }}>
            Periodo
            <select
              value={effectivePeriodo}
              onChange={(e) => setPeriodo(e.target.value)}
              className={selectClass}
            >
              {view.filterOptions.periodos.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </label>
          <div className="flex flex-col text-[10px] font-black uppercase tracking-wide" style={{ color: theme.filterLabel }}>
            Modalidad
            <div className="mt-1 flex gap-1">
              {MODALIDADES.map((m) => {
                const on = modalidades.includes(m)
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => toggleModalidad(m)}
                    className={`h-8 min-w-[96px] rounded-sm px-3 text-[11px] font-black uppercase tracking-wide shadow-sm transition ${
                      on
                        ? (isDark ? 'bg-cyan-500 text-slate-950' : 'bg-[#163A6B] text-white')
                        : (isDark ? 'bg-[var(--bg-base)] text-[var(--text-primary)] border border-[var(--border-normal)]' : 'bg-white/70 text-[#163A6B]')
                    }`}
                  >
                    {m}
                  </button>
                )
              })}
            </div>
          </div>
          <button
            type="button"
            onClick={clearFilters}
            className={`ml-auto flex h-8 items-center gap-1 rounded-sm px-3 text-[11px] font-black uppercase tracking-wide shadow-sm ${
              isDark ? 'bg-cyan-500 text-slate-950' : 'bg-[#163A6B] text-white'
            }`}
          >
            <Eraser size={12} />
            Borrar filtros
          </button>
        </section>

        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard theme={theme} title="Requerimiento" value={formatPeNumber(kpis.requerimiento)} />
          <KpiCard
            theme={theme}
            title="Ingresos efectivos"
            value={formatPeNumber(kpis.ingresos)}
            tone={kpiTone}
            subtitle={
              <>
                Objetivo: {formatPeNumber(kpis.requerimiento)} ({formatDelta(kpis.ingresos, kpis.requerimiento)})
                <br />
                {effectivePeriodo}
              </>
            }
          />
          <KpiCard
            theme={theme}
            title="% Cobertura"
            value={formatPePercent(kpis.coberturaPct)}
            tone={kpiTone}
            subtitle={
              <>
                Objetivo: 100 % ({formatDelta(kpis.ingresos, kpis.requerimiento)})
                <br />
                {effectivePeriodo}
              </>
            }
          />
          <KpiCard
            theme={theme}
            title="Brecha"
            value={formatPeNumber(kpis.brecha)}
            tone={kpiTone}
            subtitle={<>Objetivo: 0,00</>}
          />
        </section>

        <section className="grid grid-cols-1 gap-3 xl:grid-cols-3">
          <div className="rounded-sm border border-[var(--border-normal)] p-3 shadow-sm xl:col-span-2" style={{ background: theme.cardBg }}>
            <SectionTitle isDark={isDark}>Seguimiento cobertura</SectionTitle>
            <div className="mb-1 flex items-center justify-center gap-4 text-[10px] font-semibold text-[var(--text-secondary)]">
              <span className="flex items-center gap-1"><i className="inline-block h-2 w-2 rounded-full" style={{ background: theme.rq }} /> Total Requerido</span>
              <span className="flex items-center gap-1"><i className="inline-block h-2 w-2 rounded-full" style={{ background: theme.ingresos }} /> Ingresos Efectivos</span>
              <span className="flex items-center gap-1"><i className="inline-block h-2 w-2 rounded-full" style={{ background: theme.line }} /> % Cobertura</span>
            </div>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={view.seguimiento}
                  margin={{ top: 22, right: 18, left: 0, bottom: 8 }}
                  onClick={(state) => {
                    const p = state?.activeLabel
                    if (p) setPeriodo(p)
                  }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={theme.grid} />
                  <XAxis dataKey="periodo" tick={{ fontSize: 11, fill: theme.tick }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: theme.tick }} axisLine={false} tickLine={false} />
                  <YAxis yAxisId="pct" orientation="right" tick={{ fontSize: 10, fill: theme.tick }} axisLine={false} tickLine={false} unit="%" />
                  <Tooltip content={<ComboTooltip theme={theme} />} />
                  <Bar dataKey="requerimiento" fill={theme.rq} radius={[2, 2, 0, 0]} maxBarSize={28} cursor="pointer">
                    <LabelList
                      dataKey="requerimiento"
                      position="top"
                      formatter={(v) => (v ? Math.round(v) : '')}
                      style={{ fontSize: 9, fill: theme.label }}
                    />
                  </Bar>
                  <Bar dataKey="ingresos" fill={theme.ingresos} radius={[2, 2, 0, 0]} maxBarSize={28} cursor="pointer">
                    <LabelList
                      dataKey="coberturaPct"
                      position="top"
                      formatter={(v) => (v ? `${Number(v).toFixed(1)}%` : '')}
                      style={{ fontSize: 9, fill: theme.line, fontWeight: 700 }}
                    />
                  </Bar>
                  <Line
                    yAxisId="pct"
                    type="monotone"
                    dataKey="coberturaPct"
                    stroke={theme.line}
                    strokeWidth={2.4}
                    dot={{ r: 3, fill: theme.line }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-sm border border-[var(--border-normal)] p-3 shadow-sm" style={{ background: theme.cardBg }}>
            <SectionTitle isDark={isDark}>Cobertura segmentada</SectionTitle>
            <div className="mb-2 flex justify-end gap-1">
              {['cobertura', 'brecha'].map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setSegmentMode(mode)}
                  className={`h-7 rounded-sm px-3 text-[10px] font-black uppercase tracking-wide ${
                    segmentMode === mode
                      ? (isDark ? 'bg-cyan-500 text-slate-950' : 'bg-[#163A6B] text-white')
                      : (isDark ? 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] border border-[var(--border-normal)]' : 'bg-[#d6d3ea] text-[#163A6B]')
                  }`}
                >
                  {mode === 'cobertura' ? 'Cobertura' : 'Brecha'}
                </button>
              ))}
            </div>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={view.segmentos}
                  layout="vertical"
                  margin={{ top: 4, right: 36, left: 8, bottom: 4 }}
                  onClick={(state) => {
                    const name = state?.activePayload?.[0]?.payload?.segmento
                    if (!name) return
                    setSegmento((prev) => (prev === name ? '' : name))
                    setCampana('')
                  }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={theme.grid} />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 10, fill: theme.tick }}
                    axisLine={false}
                    tickLine={false}
                    unit={segmentMode === 'cobertura' ? '%' : ''}
                  />
                  <YAxis
                    type="category"
                    dataKey="segmento"
                    width={118}
                    tick={{ fontSize: 10, fill: theme.label }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip content={<PairTooltip mode={segmentMode} theme={theme} />} />
                  <Bar
                    dataKey={segmentMode === 'cobertura' ? 'coberturaPct' : 'brecha'}
                    fill={segmentMode === 'cobertura' ? theme.ingresos : theme.presencial}
                    maxBarSize={16}
                    cursor="pointer"
                    radius={[0, 3, 3, 0]}
                  >
                    <LabelList
                      dataKey={segmentMode === 'cobertura' ? 'coberturaPct' : 'brecha'}
                      position="right"
                      formatter={(v) => (segmentMode === 'cobertura' ? formatPePercent(v) : formatPeNumber(v))}
                      style={{ fontSize: 10, fill: theme.label, fontWeight: 700 }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-3 xl:grid-cols-3">
          <div className="rounded-sm border border-[var(--border-normal)] p-3 shadow-sm xl:col-span-2" style={{ background: theme.cardBg }}>
            <SectionTitle isDark={isDark}>Cobertura nivel campañas</SectionTitle>
            <div className="mb-1 flex items-center justify-center gap-4 text-[10px] font-semibold text-[var(--text-secondary)]">
              <span className="flex items-center gap-1"><i className="inline-block h-2 w-2 rounded-full" style={{ background: theme.rq }} /> Total Requerido</span>
              <span className="flex items-center gap-1"><i className="inline-block h-2 w-2 rounded-full" style={{ background: theme.ingresos }} /> Ingresos Efectivos</span>
            </div>
            <div className="h-[240px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={view.campanas}
                  margin={{ top: 18, right: 8, left: 0, bottom: 32 }}
                  onClick={(state) => {
                    const name = state?.activePayload?.[0]?.payload?.campana
                    if (name) setCampana((prev) => (prev === name ? '' : name))
                  }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={theme.grid} />
                  <XAxis
                    dataKey="campana"
                    interval={0}
                    tick={{ fontSize: 9, fill: theme.tick }}
                    axisLine={false}
                    tickLine={false}
                    angle={-18}
                    textAnchor="end"
                    height={48}
                  />
                  <YAxis tick={{ fontSize: 10, fill: theme.tick }} axisLine={false} tickLine={false} />
                  <Tooltip content={<PairTooltip mode="cobertura" theme={theme} />} />
                  <Bar dataKey="requerimiento" fill={theme.rq} maxBarSize={22} cursor="pointer" />
                  <Bar dataKey="ingresos" fill={theme.ingresos} maxBarSize={22} cursor="pointer" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-sm border border-[var(--border-normal)] p-3 shadow-sm" style={{ background: theme.cardBg }}>
            <SectionTitle isDark={isDark}>Participación por modalidad</SectionTitle>
            <div className="h-[240px]">
              {pieData.length === 0 ? (
                <p className="flex h-full items-center justify-center text-sm text-[var(--text-muted)]">Sin ingresos en el periodo</p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      dataKey="ingresos"
                      nameKey="modalidad"
                      innerRadius={52}
                      outerRadius={78}
                      paddingAngle={2}
                      onClick={(_, idx) => {
                        const mod = pieData[idx]?.modalidad
                        if (mod) toggleModalidad(mod)
                      }}
                    >
                      {pieData.map((entry) => (
                        <Cell key={entry.modalidad} fill={modColor[entry.modalidad] || '#94a3b8'} cursor="pointer" />
                      ))}
                      <LabelList
                        dataKey="ingresos"
                        position="outside"
                        formatter={(v) => formatPeNumber(v)}
                        style={{ fontSize: 10, fill: theme.label }}
                      />
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        background: theme.tooltipBg,
                        border: `1px solid ${theme.tooltipBorder}`,
                        color: theme.tooltipText,
                        fontSize: 11,
                      }}
                      formatter={(value, name, item) => [
                        `${formatPeNumber(value)} (${formatPePercent(item?.payload?.participacion)})`,
                        name,
                      ]}
                    />
                    <Legend
                      verticalAlign="middle"
                      align="right"
                      layout="vertical"
                      iconType="circle"
                      formatter={(value) => <span className="text-[10px] font-semibold text-[var(--text-secondary)]">{value}</span>}
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </section>

        <section className="rounded-sm border border-[var(--border-normal)] p-3 shadow-sm" style={{ background: theme.cardBg }}>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[11px] font-black uppercase tracking-wide text-[var(--text-primary)]">
              Detalle segmento × campaña · {effectivePeriodo}
            </p>
            <button
              type="button"
              onClick={handleExport}
              className={`flex items-center gap-1 rounded-sm px-3 py-1.5 text-[10px] font-black uppercase tracking-wide ${
                isDark ? 'bg-cyan-500 text-slate-950' : 'bg-[#163A6B] text-white'
              }`}
            >
              <Download size={12} />
              Excel
            </button>
          </div>
          <div className="overflow-auto">
            <table className="min-w-full border-collapse text-[11px]">
              <thead>
                <tr className={isDark ? 'bg-slate-800 text-cyan-100' : 'bg-[#163A6B] text-white'}>
                  {['Segmento', 'Campaña', 'Requerimiento', 'Ingresos', '% Cobertura', 'Brecha'].map((h) => (
                    <th key={h} className={`border px-2 py-1.5 text-left font-black uppercase tracking-wide ${isDark ? 'border-slate-700' : 'border-[#0f2b50]'}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {view.tabla.map((r) => {
                  const key = `${r.segmento}|${r.campana}`
                  const active = activeTableKey === key
                  return (
                    <tr
                      key={key}
                      onClick={() => {
                        setSegmento(r.segmento)
                        setCampana(r.campana)
                        setActiveTableKey(key)
                      }}
                      className={`cursor-pointer border-b border-[var(--border-subtle)] ${
                        active
                          ? (isDark ? 'bg-cyan-500/15' : 'bg-indigo-50')
                          : (isDark ? 'odd:bg-[var(--bg-surface)] even:bg-[var(--bg-elevated)] hover:bg-cyan-500/10' : 'odd:bg-white even:bg-slate-50 hover:bg-indigo-50/70')
                      }`}
                    >
                      <td className="px-2 py-1.5 font-semibold text-[var(--text-primary)]">{r.segmento}</td>
                      <td className="px-2 py-1.5 text-[var(--text-secondary)]">{r.campana}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-[var(--text-primary)]">{formatPeNumber(r.requerimiento)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-[var(--text-primary)]">{formatPeNumber(r.ingresos)}</td>
                      <td className={`px-2 py-1.5 text-right font-bold tabular-nums ${r.coberturaPct >= 100 ? theme.up : theme.down}`}>
                        {formatPePercent(r.coberturaPct)}
                      </td>
                      <td className={`px-2 py-1.5 text-right font-bold tabular-nums ${r.brecha >= 0 ? theme.up : theme.down}`}>
                        {formatPeNumber(r.brecha)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className={`font-black ${isDark ? 'bg-slate-800 text-[var(--text-primary)]' : 'bg-slate-100'}`}>
                  <td className="px-2 py-1.5" colSpan={2}>Total</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{formatPeNumber(kpis.requerimiento)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{formatPeNumber(kpis.ingresos)}</td>
                  <td className={`px-2 py-1.5 text-right tabular-nums ${kpis.coberturaPct >= 100 ? theme.up : theme.down}`}>
                    {formatPePercent(kpis.coberturaPct)}
                  </td>
                  <td className={`px-2 py-1.5 text-right tabular-nums ${kpis.brecha >= 0 ? theme.up : theme.down}`}>
                    {formatPeNumber(kpis.brecha)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>
      </div>
    </div>
  )
}

export default memo(CoberturaDotacion)
