import React, { useCallback, useEffect, useId, useMemo, useState, memo } from 'react'
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
  ReferenceLine,
} from 'recharts'
import { Download, Eraser, ClipboardList, ArrowLeft, Target, TrendingUp, Percent, GitCompare, LineChart, GraduationCap, UserPlus } from 'lucide-react'
import * as XLSX from 'xlsx'
import { GeaModernDeltaEmblem } from './GeaLogo'
import ViewLoadingSkeleton from './ui/ViewLoadingSkeleton'
import { fetchCoberturaDotacion, fetchCapacidadRysLookup } from '../lib/dataService'
import {
  COBERTURA_COLORS,
  MODALIDADES,
  buildCoberturaDotacionModelFromTable,
  aggregateCoberturaDotacion,
  formatPeNumber,
  formatPePercent,
  formatCorteDate,
  coberturaStatus,
  coberturaTone,
} from '../lib/coberturaDotacionAnalytics'
import {
  joinCoberturaConCapacidad,
  buildRequerimientosModel,
  aggregateRequerimientos,
} from '../lib/coberturaRequerimientosAnalytics'

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
      proy: '#60A5FA',
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
      rqSoft: '#FDBA74',
      ingSoft: '#86EFAC',
      proySoft: '#93C5FD',
      amber: '#FBBF24',
      danger: '#F87171',
      track: 'rgba(148,163,184,0.14)',
      up: 'text-emerald-400',
      down: 'text-red-400',
      neutral: 'text-[var(--text-primary)]',
    }
  }
  return {
    rq: COBERTURA_COLORS.rq,
    ingresos: COBERTURA_COLORS.ingresos,
    line: COBERTURA_COLORS.line,
    proy: '#3B82F6',
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
    rqSoft: '#F2B07A',
    ingSoft: '#7BC89A',
    proySoft: '#93C5FD',
    amber: '#D97706',
    danger: '#DC2626',
    track: 'rgba(15,23,42,0.06)',
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

function coverageFill(pct, theme) {
  const tone = coberturaTone(pct)
  if (tone === 'ok') return theme.ingresos
  if (tone === 'warn') return theme.amber
  return theme.danger
}

function statusBadge(pct, theme) {
  const status = coberturaStatus(pct)
  const tone = coberturaTone(pct)
  const cls = tone === 'ok' ? theme.up : tone === 'warn' ? 'text-amber-400' : theme.down
  return { status, cls }
}

const ComboTooltip = memo(({ active, payload, label, theme }) => {
  if (!active || !payload?.length) return null
  const row = payload[0]?.payload
  if (!row) return null
  const badge = statusBadge(row.coberturaPct, theme)
  return (
    <div
      className="min-w-[180px] rounded-xl px-3.5 py-2.5 text-[11px] shadow-2xl"
      style={{ background: theme.tooltipBg, border: `1px solid ${theme.tooltipBorder}`, color: theme.tooltipText }}
    >
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="font-black tracking-wide">{label}</p>
        <span className={`rounded-full px-2 py-0.5 text-[9px] font-black ${badge.cls}`} style={{ background: 'var(--bg-elevated)' }}>
          {badge.status}
        </span>
      </div>
      <div className="space-y-1 leading-tight">
        <p style={{ color: theme.rq }}>RQ · {formatPeNumber(row.requerimiento)}</p>
        <p style={{ color: theme.ingresos }}>Ingresos · {formatPeNumber(row.ingresos)}</p>
        {row.proyeccion != null ? (
          <p style={{ color: theme.proy || theme.line }}>Proyección · {formatPeNumber(row.proyeccion)}</p>
        ) : null}
        <p style={{ color: theme.line }}>Cobertura · {formatPePercent(row.coberturaPct)}</p>
        <p className={row.brecha >= 0 ? theme.up : theme.down}>Brecha · {formatPeNumber(row.brecha)}</p>
      </div>
    </div>
  )
})
ComboTooltip.displayName = 'ComboTooltip'

const PairTooltip = memo(({ active, payload, label, mode, theme }) => {
  if (!active || !payload?.length) return null
  const row = payload[0]?.payload
  if (!row) return null
  const title = label || row.semana || row.segmento || row.campana
  const badge = statusBadge(row.coberturaPct, theme)
  return (
    <div
      className="min-w-[180px] rounded-xl px-3.5 py-2.5 text-[11px] shadow-2xl"
      style={{ background: theme.tooltipBg, border: `1px solid ${theme.tooltipBorder}`, color: theme.tooltipText }}
    >
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="font-black tracking-wide">{title}</p>
        <span className={`rounded-full px-2 py-0.5 text-[9px] font-black ${badge.cls}`}>{badge.status}</span>
      </div>
      <p>RQ · {formatPeNumber(row.requerimiento)}</p>
      <p>Ingresos · {formatPeNumber(row.ingresos)}</p>
      <p>{mode === 'brecha' ? `Brecha · ${formatPeNumber(row.brecha)}` : `Cobertura · ${formatPePercent(row.coberturaPct)}`}</p>
    </div>
  )
})
PairTooltip.displayName = 'PairTooltip'

function KpiCard({
  title,
  value,
  subtitle,
  tone = 'neutral',
  theme,
  accent,
  icon: Icon,
  period,
  progress,
}) {
  const accentColor = accent || (tone === 'up' ? theme.ingresos : tone === 'down' ? theme.danger : theme.line)
  const valueClass = tone === 'up' ? theme.up : tone === 'down' ? theme.down : theme.neutral
  const barPct = progress == null ? null : Math.max(0, Math.min(100, Number(progress) || 0))

  return (
    <article
      className="group relative flex min-h-[128px] flex-col overflow-hidden rounded-xl border border-[var(--border-normal)] px-4 py-3.5 shadow-[0_10px_28px_rgba(2,6,23,0.16)] transition duration-200 hover:-translate-y-0.5"
      style={{
        background: `linear-gradient(145deg, ${accentColor}18 0%, ${theme.cardBg} 46%)`,
      }}
    >
      <span className="absolute inset-y-0 left-0 w-[3px]" style={{ background: accentColor }} />
      <div className="flex items-start justify-between gap-2 pl-1">
        {Icon ? (
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
            style={{ background: `${accentColor}22`, color: accentColor }}
          >
            <Icon size={15} strokeWidth={2.25} />
          </span>
        ) : <span />}
        {period ? (
          <span
            className="shrink-0 rounded-full px-2 py-0.5 text-[9px] font-black tabular-nums tracking-wide"
            style={{ background: `${accentColor}24`, color: accentColor }}
          >
            {period}
          </span>
        ) : null}
      </div>
      <h3 className="mt-2.5 pl-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text-secondary)]">
        {title}
      </h3>
      <p className={`mt-auto pl-1 pt-3 text-[32px] font-black leading-none tracking-tight tabular-nums ${valueClass}`}>
        {value}
      </p>
      {subtitle ? (
        <p className="mt-2 pl-1 text-[10px] font-semibold leading-snug text-[var(--text-secondary)]">
          {subtitle}
        </p>
      ) : null}
      {barPct != null ? (
        <div className="mt-3 ml-1 h-1.5 overflow-hidden rounded-full" style={{ background: theme.track }}>
          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${barPct}%`, background: accentColor }} />
        </div>
      ) : (
        <div className="mt-3 ml-1 h-[2px] w-10 rounded-full opacity-80" style={{ background: accentColor }} />
      )}
    </article>
  )
}

function ChartCard({ children, className = '', theme }) {
  return (
    <div
      className={`rounded-xl border border-[var(--border-normal)] p-3 shadow-[0_8px_24px_rgba(2,6,23,0.18)] ${className}`}
      style={{ background: theme.cardBg }}
    >
      {children}
    </div>
  )
}

function ChartLegend({ theme, items }) {
  return (
    <div className="mb-2 flex flex-wrap items-center justify-center gap-4 text-[10px] font-semibold text-[var(--text-secondary)]">
      {items.map((item) => (
        <span key={item.label} className="flex items-center gap-1.5">
          <i className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: item.color }} />
          {item.label}
        </span>
      ))}
    </div>
  )
}

function SectionTitle({ children, isDark }) {
  return (
    <div className="mb-2 flex justify-center">
      <span
        className={`rounded-full px-4 py-1 text-[11px] font-black uppercase tracking-wider shadow-sm ${
          isDark ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-400/40' : 'bg-[#163A6B] text-white'
        }`}
      >
        {children}
      </span>
    </div>
  )
}

function SelectedPctLabel({ x, y, width, index, value, data, theme }) {
  const row = data?.[index]
  if (!row?.selected || value == null || value === '') return null
  return (
    <text x={x + width / 2} y={y - 8} textAnchor="middle" fill={theme.line} fontSize={11} fontWeight={700}>
      {`${Number(value).toFixed(1)}%`}
    </text>
  )
}

function CoverageDot({ cx, cy, payload, theme }) {
  if (cx == null || cy == null) return null
  if (payload?.selected) {
    return (
      <g>
        <circle cx={cx} cy={cy} r={9} fill={theme.line} opacity={0.22} />
        <circle cx={cx} cy={cy} r={4.5} fill={theme.line} stroke="#fff" strokeWidth={1.6} />
      </g>
    )
  }
  return <circle cx={cx} cy={cy} r={3} fill={theme.line} />
}

function RequerimientosReport({
  model,
  theme,
  isDark,
  gid,
  onBack,
}) {
  const [segmento, setSegmento] = useState('')
  const [campana, setCampana] = useState('')
  const [periodo, setPeriodo] = useState('')
  const [estado, setEstado] = useState('')
  const [modalidades, setModalidades] = useState(() => [...MODALIDADES])
  const [segmentMode, setSegmentMode] = useState('cobertura')
  const [activeTableKey, setActiveTableKey] = useState('')
  const rqGrad = `rqReq-${gid}`
  const ingGrad = `ingReq-${gid}`
  const proyGrad = `proyReq-${gid}`
  const modColor = { PRESENCIAL: theme.presencial, REMOTO: theme.remoto }
  const selectClass = 'mt-1 h-8 rounded-sm border border-[var(--border-normal)] bg-[var(--input-bg)] px-2 text-[12px] font-semibold text-[var(--text-primary)]'
  const effectivePeriodo = periodo || model.defaultPeriodo
  const filters = useMemo(
    () => ({ segmento, campana, periodo: effectivePeriodo, estado, modalidades }),
    [segmento, campana, effectivePeriodo, estado, modalidades]
  )
  const view = useMemo(() => aggregateRequerimientos(model, filters), [model, filters])
  const kpis = view.kpis
  const campanasChart = view.campanasChart || []
  const pieData = view.modalidad.filter((m) => m.ingresos > 0)

  const clearFilters = useCallback(() => {
    setSegmento('')
    setCampana('')
    setPeriodo(model.defaultPeriodo || '')
    setEstado('')
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

  const handleExport = useCallback(() => {
    const rows = view.tabla.map((r) => ({
      SEGMENTO: r.segmento,
      CAMPAÑA: r.campana,
      ESCUELA: r.gpe,
      ESTADO: r.estado,
      REQUERIMIENTO: r.requerimiento,
      'DIA 1': r.dia1,
      'PROYECCION DE INGRESOS': r.proyeccion,
      INGRESOS: r.ingresos,
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Requerimientos')
    XLSX.writeFile(wb, `GEA_Requerimientos_${effectivePeriodo || 'all'}.xlsx`)
  }, [view.tabla, effectivePeriodo])

  const reqLegend = [
    { label: 'Requerimiento', color: theme.rq },
    { label: 'Proyección', color: theme.proy },
    { label: 'Ingresos', color: theme.ingresos },
  ]

  return (
    <div className="h-full overflow-auto p-3 text-[var(--text-primary)]" style={{ background: theme.pageBg }}>
      <div className="mx-auto max-w-[1600px] space-y-3">
        <header className="flex items-center justify-between gap-4 px-5 py-3 text-white shadow-md" style={{ background: theme.headerBg }}>
          <h1 className="text-[18px] font-black uppercase tracking-[0.06em] md:text-[22px]">
            WFM Reporte Gerencial de Cobertura de Dotación
          </h1>
          <div className="flex items-center gap-3">
            <div className="text-right leading-tight">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-white/80">Actualizado al corte de:</p>
              <p className="text-[15px] font-black">{view.corteLabel}</p>
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

        <section className="flex flex-wrap items-end gap-3 rounded-sm px-4 py-3 shadow-sm border border-[var(--border-normal)]" style={{ background: theme.filterBg }}>
          <p className="mr-1 text-[15px] font-black uppercase tracking-wide" style={{ color: theme.filterLabel }}>Filtros</p>
          <label className="flex min-w-[140px] flex-col text-[10px] font-black uppercase tracking-wide" style={{ color: theme.filterLabel }}>
            Segmento
            <select value={segmento} onChange={(e) => { setSegmento(e.target.value); setCampana('') }} className={selectClass}>
              <option value="">Todas</option>
              {view.filterOptions.segmentos.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label className="flex min-w-[180px] flex-1 flex-col text-[10px] font-black uppercase tracking-wide" style={{ color: theme.filterLabel }}>
            Campaña
            <select value={campana} onChange={(e) => setCampana(e.target.value)} className={selectClass}>
              <option value="">Todas</option>
              {view.filterOptions.campanas.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label className="flex min-w-[120px] flex-col text-[10px] font-black uppercase tracking-wide" style={{ color: theme.filterLabel }}>
            Periodo
            <select value={effectivePeriodo} onChange={(e) => setPeriodo(e.target.value)} className={selectClass}>
              {view.filterOptions.periodos.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
          <label className="flex min-w-[120px] flex-col text-[10px] font-black uppercase tracking-wide" style={{ color: theme.filterLabel }}>
            Estado
            <select value={estado} onChange={(e) => setEstado(e.target.value)} className={selectClass}>
              <option value="">Todas</option>
              {view.filterOptions.estados.map((s) => <option key={s} value={s}>{s}</option>)}
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
            onClick={onBack}
            className={`ml-auto flex h-8 items-center gap-1 rounded-sm px-3 text-[11px] font-black uppercase tracking-wide shadow-sm ${
              isDark ? 'bg-[var(--bg-base)] text-[var(--text-primary)] border border-[var(--border-normal)]' : 'bg-white text-[#163A6B]'
            }`}
          >
            <ArrowLeft size={12} />
            Volver
          </button>
          <button
            type="button"
            onClick={clearFilters}
            className={`flex h-8 items-center gap-1 rounded-sm px-3 text-[11px] font-black uppercase tracking-wide shadow-sm ${
              isDark ? 'bg-cyan-500 text-slate-950' : 'bg-[#163A6B] text-white'
            }`}
          >
            <Eraser size={12} />
            Borrar filtros
          </button>
        </section>

        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <KpiCard
            theme={theme}
            title="Requerimiento"
            value={formatPeNumber(kpis.requerimiento)}
            accent={theme.rq}
            icon={Target}
            period={effectivePeriodo}
          />
          <KpiCard
            theme={theme}
            title="Ingresos efectivos"
            value={formatPeNumber(kpis.ingresos)}
            tone={kpis.ingresos >= kpis.requerimiento ? 'up' : 'down'}
            accent={theme.ingresos}
            icon={TrendingUp}
            period={effectivePeriodo}
            subtitle={`Objetivo: ${formatPeNumber(kpis.requerimiento)} (${formatDelta(kpis.ingresos, kpis.requerimiento)})`}
          />
          <KpiCard
            theme={theme}
            title="Ingresos proyectados"
            value={formatPeNumber(kpis.proyeccion)}
            tone={kpis.proyeccion >= kpis.requerimiento ? 'up' : 'down'}
            accent={theme.proy}
            icon={LineChart}
            period={effectivePeriodo}
            subtitle={`Objetivo: ${formatPeNumber(kpis.requerimiento)} (${formatDelta(kpis.proyeccion, kpis.requerimiento)})`}
          />
          <KpiCard
            theme={theme}
            title="Brecha de capacitación"
            value={formatPeNumber(kpis.brechaCapacitacion)}
            tone={kpis.brechaCapacitacion >= 0 ? 'up' : 'down'}
            accent={kpis.brechaCapacitacion >= 0 ? theme.ingresos : theme.danger}
            icon={GraduationCap}
            period={effectivePeriodo}
            subtitle="Objetivo: 0,00"
          />
          <KpiCard
            theme={theme}
            title="Brecha de reclutamiento"
            value={formatPeNumber(kpis.brechaReclutamiento)}
            tone={kpis.brechaReclutamiento >= 0 ? 'up' : 'down'}
            accent={kpis.brechaReclutamiento >= 0 ? theme.ingresos : theme.danger}
            icon={UserPlus}
            period={effectivePeriodo}
            subtitle="Objetivo: 0,00"
          />
        </section>

        <section className="grid grid-cols-1 gap-3 xl:grid-cols-3">
          <ChartCard theme={theme} className="xl:col-span-2">
            <SectionTitle isDark={isDark}>Seguimiento cobertura</SectionTitle>
            <ChartLegend theme={theme} items={reqLegend} />
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={view.seguimiento}
                  margin={{ top: 16, right: 8, left: 0, bottom: 8 }}
                  onClick={(state) => {
                    const p = state?.activeLabel
                    if (p) setPeriodo(p)
                  }}
                >
                  <defs>
                    <linearGradient id={rqGrad} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={theme.rqSoft} />
                      <stop offset="100%" stopColor={theme.rq} />
                    </linearGradient>
                    <linearGradient id={proyGrad} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={theme.proySoft} />
                      <stop offset="100%" stopColor={theme.proy} />
                    </linearGradient>
                    <linearGradient id={ingGrad} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={theme.ingSoft} />
                      <stop offset="100%" stopColor={theme.ingresos} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={theme.grid} />
                  <XAxis dataKey="periodo" tick={{ fontSize: 11, fill: theme.tick }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: theme.tick }} axisLine={false} tickLine={false} />
                  <Tooltip content={<ComboTooltip theme={theme} />} />
                  <Bar dataKey="requerimiento" fill={`url(#${rqGrad})`} radius={[5, 5, 0, 0]} maxBarSize={22} cursor="pointer">
                    {view.seguimiento.map((row) => (
                      <Cell key={`rq-${row.periodo}`} fill={`url(#${rqGrad})`} fillOpacity={row.selected ? 1 : 0.42} />
                    ))}
                  </Bar>
                  <Bar dataKey="proyeccion" fill={`url(#${proyGrad})`} radius={[5, 5, 0, 0]} maxBarSize={22} cursor="pointer">
                    {view.seguimiento.map((row) => (
                      <Cell key={`pr-${row.periodo}`} fill={`url(#${proyGrad})`} fillOpacity={row.selected ? 1 : 0.42} />
                    ))}
                  </Bar>
                  <Bar dataKey="ingresos" fill={`url(#${ingGrad})`} radius={[5, 5, 0, 0]} maxBarSize={22} cursor="pointer">
                    {view.seguimiento.map((row) => (
                      <Cell key={`ing-${row.periodo}`} fill={`url(#${ingGrad})`} fillOpacity={row.selected ? 1 : 0.42} />
                    ))}
                  </Bar>
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          <ChartCard theme={theme}>
            <SectionTitle isDark={isDark}>Brecha segmentada</SectionTitle>
            <div className="mb-2 flex justify-end gap-1">
              {['cobertura', 'brecha'].map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setSegmentMode(mode)}
                  className={`h-7 rounded-full px-3 text-[10px] font-black uppercase tracking-wide ${
                    segmentMode === mode
                      ? (isDark ? 'bg-cyan-500 text-slate-950' : 'bg-[#163A6B] text-white')
                      : (isDark ? 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] border border-[var(--border-normal)]' : 'bg-[#d6d3ea] text-[#163A6B]')
                  }`}
                >
                  {mode === 'cobertura' ? 'Cobertura' : 'Brecha'}
                </button>
              ))}
            </div>
            <div className="h-[268px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={view.segmentos}
                  layout="vertical"
                  margin={{ top: 4, right: 48, left: 8, bottom: 4 }}
                  onClick={(state) => {
                    const name = state?.activePayload?.[0]?.payload?.segmento
                    if (!name) return
                    setSegmento((prev) => (prev === name ? '' : name))
                    setCampana('')
                  }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={theme.grid} />
                  <XAxis type="number" tick={{ fontSize: 10, fill: theme.tick }} axisLine={false} tickLine={false} unit={segmentMode === 'cobertura' ? '%' : ''} />
                  <YAxis type="category" dataKey="segmento" width={118} tick={{ fontSize: 10, fill: theme.label }} axisLine={false} tickLine={false} />
                  <Tooltip content={<PairTooltip mode={segmentMode} theme={theme} />} />
                  <Bar dataKey={segmentMode === 'cobertura' ? 'coberturaPct' : 'brecha'} maxBarSize={18} cursor="pointer" radius={[0, 8, 8, 0]} background={{ fill: theme.track, radius: 8 }}>
                    {view.segmentos.map((row) => (
                      <Cell
                        key={row.segmento}
                        fill={segmentMode === 'cobertura' ? coverageFill(row.coberturaPct, theme) : (row.brecha >= 0 ? theme.ingresos : theme.danger)}
                        fillOpacity={!segmento || segmento === row.segmento ? 1 : 0.35}
                      />
                    ))}
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
          </ChartCard>
        </section>

        <section className="grid grid-cols-1 gap-3 xl:grid-cols-3">
          <ChartCard theme={theme} className="xl:col-span-2">
            <SectionTitle isDark={isDark}>Cobertura nivel campañas</SectionTitle>
            <ChartLegend theme={theme} items={reqLegend} />
            <div style={{ height: Math.max(260, campanasChart.length * 36) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={campanasChart}
                  layout="vertical"
                  margin={{ top: 8, right: 16, left: 4, bottom: 8 }}
                  onClick={(state) => {
                    const row = state?.activePayload?.[0]?.payload
                    if (!row || row.isOtras) return
                    if (row.campana) setCampana((prev) => (prev === row.campana ? '' : row.campana))
                  }}
                >
                  <defs>
                    <linearGradient id={`${rqGrad}-h`} x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor={theme.rq} />
                      <stop offset="100%" stopColor={theme.rqSoft} />
                    </linearGradient>
                    <linearGradient id={`${proyGrad}-h`} x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor={theme.proy} />
                      <stop offset="100%" stopColor={theme.proySoft} />
                    </linearGradient>
                    <linearGradient id={`${ingGrad}-h`} x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor={theme.ingresos} />
                      <stop offset="100%" stopColor={theme.ingSoft} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={theme.grid} />
                  <XAxis type="number" tick={{ fontSize: 10, fill: theme.tick }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="campanaShort" width={132} tick={{ fontSize: 10, fill: theme.label }} axisLine={false} tickLine={false} />
                  <Tooltip content={<ComboTooltip theme={theme} />} />
                  <Bar dataKey="requerimiento" fill={`url(#${rqGrad}-h)`} maxBarSize={10} cursor="pointer" radius={[0, 6, 6, 0]}>
                    {campanasChart.map((row) => (
                      <Cell key={`crq-${row.campana}`} fill={`url(#${rqGrad}-h)`} fillOpacity={!campana || campana === row.campana ? 1 : 0.35} />
                    ))}
                  </Bar>
                  <Bar dataKey="proyeccion" fill={`url(#${proyGrad}-h)`} maxBarSize={10} cursor="pointer" radius={[0, 6, 6, 0]}>
                    {campanasChart.map((row) => (
                      <Cell key={`cpr-${row.campana}`} fill={`url(#${proyGrad}-h)`} fillOpacity={!campana || campana === row.campana ? 1 : 0.35} />
                    ))}
                  </Bar>
                  <Bar dataKey="ingresos" fill={`url(#${ingGrad}-h)`} maxBarSize={10} cursor="pointer" radius={[0, 6, 6, 0]}>
                    {campanasChart.map((row) => (
                      <Cell key={`cing-${row.campana}`} fill={`url(#${ingGrad}-h)`} fillOpacity={!campana || campana === row.campana ? 1 : 0.35} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          <ChartCard theme={theme}>
            <SectionTitle isDark={isDark}>Participación por modalidad</SectionTitle>
            <div className="relative h-[268px]">
              {pieData.length === 0 ? (
                <p className="flex h-full items-center justify-center text-sm text-[var(--text-muted)]">Sin ingresos en el periodo</p>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={pieData} dataKey="ingresos" nameKey="modalidad" cx="38%" cy="50%" innerRadius={62} outerRadius={90} paddingAngle={4} stroke={isDark ? '#0F172A' : '#fff'} strokeWidth={2} onClick={(_, idx) => { const mod = pieData[idx]?.modalidad; if (mod) toggleModalidad(mod) }}>
                        {pieData.map((entry) => (
                          <Cell key={entry.modalidad} fill={modColor[entry.modalidad] || '#94a3b8'} fillOpacity={modalidades.includes(entry.modalidad) ? 1 : 0.28} cursor="pointer" />
                        ))}
                      </Pie>
                      <Tooltip content={<PairTooltip mode="cobertura" theme={theme} />} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="pointer-events-none absolute left-[38%] top-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
                    <p className="text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)]">Total FTE</p>
                    <p className="text-[18px] font-black tabular-nums text-[var(--text-primary)]">{formatPeNumber(view.ingresosModTotal)}</p>
                  </div>
                  <ul className="absolute right-1 top-1/2 flex w-[44%] -translate-y-1/2 flex-col gap-2 pr-1">
                    {pieData.map((m) => (
                      <li key={m.modalidad}>
                        <button type="button" onClick={() => toggleModalidad(m.modalidad)} className="flex w-full items-center gap-2 text-left">
                          <i className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: modColor[m.modalidad], opacity: modalidades.includes(m.modalidad) ? 1 : 0.35 }} />
                          <span className="min-w-0">
                            <span className="block truncate text-[10px] font-black uppercase tracking-wide text-[var(--text-primary)]">{m.modalidad}</span>
                            <span className="block text-[10px] font-semibold text-[var(--text-secondary)]">{formatPeNumber(m.ingresos)} · {formatPePercent(m.participacion)}</span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </ChartCard>
        </section>

        <ChartCard theme={theme}>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[11px] font-black uppercase tracking-wide text-[var(--text-primary)]">
              Detalle segmento × campaña × escuela · {effectivePeriodo}
            </p>
            <button type="button" onClick={handleExport} className={`flex items-center gap-1 rounded-sm px-3 py-1.5 text-[10px] font-black uppercase tracking-wide ${isDark ? 'bg-cyan-500 text-slate-950' : 'bg-[#163A6B] text-white'}`}>
              <Download size={12} />
              Excel
            </button>
          </div>
          <div className="overflow-auto">
            <table className="min-w-full border-collapse text-[11px]">
              <thead>
                <tr className={isDark ? 'bg-slate-800 text-cyan-100' : 'bg-[#163A6B] text-white'}>
                  {['Segmento', 'Campaña', 'Escuela', 'Estado', 'Requerimiento', 'Día 1', 'Proyección', 'Ingresos'].map((h) => (
                    <th key={h} className={`border px-2 py-1.5 text-left font-black uppercase tracking-wide ${isDark ? 'border-slate-700' : 'border-[#0f2b50]'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {view.tabla.map((r) => {
                  const key = `${r.segmento}|${r.campana}|${r.gpe}|${r.estado}`
                  const active = activeTableKey === key
                  return (
                    <tr
                      key={key}
                      onClick={() => {
                        setSegmento(r.segmento)
                        setCampana(r.campana)
                        setEstado(r.estado)
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
                      <td className="px-2 py-1.5 text-[var(--text-secondary)]">{r.gpe}</td>
                      <td className="px-2 py-1.5 text-[var(--text-secondary)]">{r.estado}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{formatPeNumber(r.requerimiento)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{formatPeNumber(r.dia1)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{formatPeNumber(r.proyeccion)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{formatPeNumber(r.ingresos)}</td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className={`font-black ${isDark ? 'bg-slate-800 text-[var(--text-primary)]' : 'bg-slate-100'}`}>
                  <td className="px-2 py-1.5" colSpan={4}>Total</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{formatPeNumber(kpis.requerimiento)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{formatPeNumber(kpis.dia1)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{formatPeNumber(kpis.proyeccion)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{formatPeNumber(kpis.ingresos)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </ChartCard>
      </div>
    </div>
  )
}

function CoberturaDotacion() {
  const isDark = useIsDarkTheme()
  const theme = useMemo(() => getVisualTheme(isDark), [isDark])
  const gid = useId().replace(/:/g, '')
  const rqGrad = `rqGrad-${gid}`
  const ingGrad = `ingGrad-${gid}`
  const modColor = {
    PRESENCIAL: theme.presencial,
    REMOTO: theme.remoto,
  }

  const [tableRows, setTableRows] = useState([])
  const [capacidadRows, setCapacidadRows] = useState([])
  const [page, setPage] = useState('cobertura')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [semana, setSemana] = useState('')
  const [campana, setCampana] = useState('')
  const [periodo, setPeriodo] = useState('')
  const [modalidades, setModalidades] = useState(() => [...MODALIDADES])
  const [segmentMode, setSegmentMode] = useState('cobertura')
  const [activeTableKey, setActiveTableKey] = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setLoadError('')
      try {
        const [rows, capacidad] = await Promise.all([
          fetchCoberturaDotacion(),
          fetchCapacidadRysLookup().catch(() => []),
        ])
        if (!cancelled) {
          setTableRows(Array.isArray(rows) ? rows : [])
          setCapacidadRows(Array.isArray(capacidad) ? capacidad : [])
        }
      } catch (err) {
        if (!cancelled) setLoadError(err?.message || 'No se pudo leer cobertura_dotacion')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  const model = useMemo(
    () => buildCoberturaDotacionModelFromTable(tableRows),
    [tableRows]
  )
  const requerimientosModel = useMemo(
    () => buildRequerimientosModel(joinCoberturaConCapacidad(tableRows, capacidadRows)),
    [tableRows, capacidadRows]
  )

  const effectivePeriodo = periodo || model.defaultPeriodo

  const filters = useMemo(
    () => ({ semana, campana, periodo: effectivePeriodo, modalidades }),
    [semana, campana, effectivePeriodo, modalidades]
  )

  const view = useMemo(
    () => aggregateCoberturaDotacion(model, filters),
    [model, filters]
  )

  const campanaOptions = view.filterOptions.campanas

  const clearFilters = useCallback(() => {
    setSemana('')
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
        SEMANA: r.semana || r.segmento,
        CAMPAÑA: r.campana,
        REQUERIMIENTO: r.requerimiento,
        INGRESOS: r.ingresos,
        '% COBERTURA': Number((r.coberturaPct / 100).toFixed(4)),
        BRECHA: r.brecha,
      })),
      {
        SEMANA: 'Total',
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
  const campanasChart = (view.campanasChart || view.campanas || []).map((s) => ({
    ...s,
    campanaShort: s.campanaShort || s.campana,
  }))
  if (loading) return <ViewLoadingSkeleton title="Cargando cobertura de dotación..." />
  if (loadError) {
    return (
      <div className="p-6 text-sm text-[var(--text-primary)]">
        <p className="font-black uppercase tracking-wide">No se pudo cargar cobertura_dotacion</p>
        <p className="mt-2 text-[var(--text-secondary)]">{loadError}</p>
        <p className="mt-2 text-[var(--text-secondary)]">
          Si RLS no tiene política de lectura, ejecuta `database/cobertura_dotacion_rls.sql` en el SQL Editor de Supabase.
        </p>
      </div>
    )
  }
  if (!tableRows.length) {
    return (
      <div className="p-6 text-sm text-[var(--text-primary)]">
        <p className="font-black uppercase tracking-wide">Sin filas en cobertura_dotacion</p>
        <p className="mt-2 text-[var(--text-secondary)]">
          La tabla existe pero esta sesión no recibe datos. Casi siempre es RLS sin política SELECT.
          Abre el SQL Editor de Supabase y ejecuta `database/cobertura_dotacion_rls.sql`, luego recarga.
        </p>
      </div>
    )
  }
  if (page === 'requerimientos') {
    if (!requerimientosModel.rows.length) {
      return (
        <div className="p-6 text-sm text-[var(--text-primary)]">
          <button
            type="button"
            onClick={() => setPage('cobertura')}
            className="mb-4 flex h-8 items-center gap-1 rounded-sm px-3 text-[11px] font-black uppercase tracking-wide border border-[var(--border-normal)]"
          >
            <ArrowLeft size={12} />
            Volver
          </button>
          <p className="font-black uppercase tracking-wide">Sin cruce con capacidad</p>
          <p className="mt-2 text-[var(--text-secondary)]">
            No hay filas de cobertura_dotacion que coincidan con capacidad_rys en periodo, semana, campaña y grupo.
            Segmento y estado del grupo se toman de esa ficha de capacidad.
          </p>
        </div>
      )
    }
    return (
      <RequerimientosReport
        model={requerimientosModel}
        theme={theme}
        isDark={isDark}
        gid={gid}
        onBack={() => setPage('cobertura')}
      />
    )
  }

  const selectClass = 'mt-1 h-8 rounded-sm border border-[var(--border-normal)] bg-[var(--input-bg)] px-2 text-[12px] font-semibold text-[var(--text-primary)]'
  const sharedLegend = [
    { label: 'Total Requerido', color: theme.rq },
    { label: 'Ingresos Efectivos', color: theme.ingresos },
    { label: '% Cobertura / meta 100%', color: theme.line },
  ]

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
            Semana
            <select
              value={semana}
              onChange={(e) => {
                setSemana(e.target.value)
                setCampana('')
              }}
              className={selectClass}
            >
              <option value="">Todas</option>
              {(view.filterOptions.semanas || view.filterOptions.segmentos || []).map((s) => (
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
            onClick={() => setPage('requerimientos')}
            className={`ml-auto flex h-8 items-center gap-1 rounded-sm px-3 text-[11px] font-black uppercase tracking-wide shadow-sm ${
              isDark ? 'bg-[var(--bg-base)] text-cyan-200 border border-cyan-400/40' : 'bg-white text-[#163A6B]'
            }`}
          >
            <ClipboardList size={12} />
            Requerimientos
          </button>
          <button
            type="button"
            onClick={clearFilters}
            className={`flex h-8 items-center gap-1 rounded-sm px-3 text-[11px] font-black uppercase tracking-wide shadow-sm ${
              isDark ? 'bg-cyan-500 text-slate-950' : 'bg-[#163A6B] text-white'
            }`}
          >
            <Eraser size={12} />
            Borrar filtros
          </button>
        </section>

        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            theme={theme}
            title="Requerimiento"
            value={formatPeNumber(kpis.requerimiento)}
            accent={theme.rq}
            icon={Target}
            period={effectivePeriodo}
          />
          <KpiCard
            theme={theme}
            title="Ingresos efectivos"
            value={formatPeNumber(kpis.ingresos)}
            tone={kpiTone}
            accent={theme.ingresos}
            icon={TrendingUp}
            period={effectivePeriodo}
            subtitle={`Objetivo: ${formatPeNumber(kpis.requerimiento)} (${formatDelta(kpis.ingresos, kpis.requerimiento)})`}
          />
          <KpiCard
            theme={theme}
            title="% Cobertura"
            value={formatPePercent(kpis.coberturaPct)}
            tone={kpiTone}
            accent={coverageFill(kpis.coberturaPct, theme)}
            icon={Percent}
            period={effectivePeriodo}
            progress={kpis.coberturaPct}
            subtitle={`Objetivo: 100 % (${formatDelta(kpis.ingresos, kpis.requerimiento)})`}
          />
          <KpiCard
            theme={theme}
            title="Brecha"
            value={formatPeNumber(kpis.brecha)}
            tone={kpiTone}
            accent={kpis.brecha >= 0 ? theme.ingresos : theme.danger}
            icon={GitCompare}
            period={effectivePeriodo}
            subtitle="Objetivo: 0,00"
          />
        </section>

        <section className="grid grid-cols-1 gap-3 xl:grid-cols-3">
          <ChartCard theme={theme} className="xl:col-span-2">
            <SectionTitle isDark={isDark}>Seguimiento cobertura</SectionTitle>
            <ChartLegend theme={theme} items={sharedLegend} />
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={view.seguimiento}
                  margin={{ top: 28, right: 22, left: 0, bottom: 8 }}
                  onClick={(state) => {
                    const p = state?.activeLabel
                    if (p) setPeriodo(p)
                  }}
                >
                  <defs>
                    <linearGradient id={rqGrad} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={theme.rqSoft} />
                      <stop offset="100%" stopColor={theme.rq} />
                    </linearGradient>
                    <linearGradient id={ingGrad} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={theme.ingSoft} />
                      <stop offset="100%" stopColor={theme.ingresos} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={theme.grid} />
                  <XAxis dataKey="periodo" tick={{ fontSize: 11, fill: theme.tick }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: theme.tick }} axisLine={false} tickLine={false} />
                  <YAxis
                    yAxisId="pct"
                    orientation="right"
                    domain={[0, (max) => Math.max(120, Math.ceil((Number(max) || 0) / 10) * 10)]}
                    tick={{ fontSize: 10, fill: theme.tick }}
                    axisLine={false}
                    tickLine={false}
                    unit="%"
                  />
                  <ReferenceLine yAxisId="pct" y={100} stroke={theme.line} strokeDasharray="5 5" strokeOpacity={0.55} />
                  <Tooltip content={<ComboTooltip theme={theme} />} />
                  <Bar dataKey="requerimiento" fill={`url(#${rqGrad})`} radius={[5, 5, 0, 0]} maxBarSize={26} cursor="pointer" animationDuration={320}>
                    {view.seguimiento.map((row) => (
                      <Cell key={`rq-${row.periodo}`} fill={`url(#${rqGrad})`} fillOpacity={row.selected ? 1 : 0.42} />
                    ))}
                  </Bar>
                  <Bar dataKey="ingresos" fill={`url(#${ingGrad})`} radius={[5, 5, 0, 0]} maxBarSize={26} cursor="pointer" animationDuration={320}>
                    {view.seguimiento.map((row) => (
                      <Cell key={`ing-${row.periodo}`} fill={`url(#${ingGrad})`} fillOpacity={row.selected ? 1 : 0.42} />
                    ))}
                    <LabelList
                      dataKey="coberturaPct"
                      content={(props) => <SelectedPctLabel {...props} data={view.seguimiento} theme={theme} />}
                    />
                  </Bar>
                  <Line
                    yAxisId="pct"
                    type="monotone"
                    dataKey="coberturaPct"
                    stroke={theme.line}
                    strokeWidth={3}
                    dot={(props) => <CoverageDot {...props} theme={theme} />}
                    activeDot={{ r: 6, stroke: '#fff', strokeWidth: 2, fill: theme.line }}
                    animationDuration={320}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          <ChartCard theme={theme}>
            <SectionTitle isDark={isDark}>Cobertura por semana</SectionTitle>
            <div className="mb-2 flex justify-end gap-1">
              {['cobertura', 'brecha'].map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setSegmentMode(mode)}
                  className={`h-7 rounded-full px-3 text-[10px] font-black uppercase tracking-wide ${
                    segmentMode === mode
                      ? (isDark ? 'bg-cyan-500 text-slate-950' : 'bg-[#163A6B] text-white')
                      : (isDark ? 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] border border-[var(--border-normal)]' : 'bg-[#d6d3ea] text-[#163A6B]')
                  }`}
                >
                  {mode === 'cobertura' ? 'Cobertura' : 'Brecha'}
                </button>
              ))}
            </div>
            <div className="h-[268px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={view.segmentos}
                  layout="vertical"
                  margin={{ top: 4, right: 48, left: 8, bottom: 4 }}
                  onClick={(state) => {
                    const name = state?.activePayload?.[0]?.payload?.semana || state?.activePayload?.[0]?.payload?.segmento
                    if (!name) return
                    setSemana((prev) => (prev === name ? '' : name))
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
                    dataKey="semana"
                    width={118}
                    tick={{ fontSize: 10, fill: theme.label }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip content={<PairTooltip mode={segmentMode} theme={theme} />} />
                  <Bar
                    dataKey={segmentMode === 'cobertura' ? 'coberturaPct' : 'brecha'}
                    maxBarSize={18}
                    cursor="pointer"
                    radius={[0, 8, 8, 0]}
                    animationDuration={320}
                    background={{ fill: theme.track, radius: 8 }}
                  >
                    {view.segmentos.map((row) => (
                      <Cell
                        key={row.semana || row.segmento}
                        fill={segmentMode === 'cobertura' ? coverageFill(row.coberturaPct, theme) : (row.brecha >= 0 ? theme.ingresos : theme.danger)}
                        fillOpacity={!semana || semana === (row.semana || row.segmento) ? 1 : 0.35}
                      />
                    ))}
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
          </ChartCard>
        </section>

        <section className="grid grid-cols-1 gap-3 xl:grid-cols-3">
          <ChartCard theme={theme} className="xl:col-span-2">
            <SectionTitle isDark={isDark}>Cobertura nivel campañas</SectionTitle>
            <ChartLegend
              theme={theme}
              items={[
                { label: 'Total Requerido', color: theme.rq },
                { label: 'Ingresos Efectivos', color: theme.ingresos },
              ]}
            />
            <div style={{ height: Math.max(260, (campanasChart?.length || 6) * 34) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={campanasChart}
                  layout="vertical"
                  margin={{ top: 8, right: 16, left: 4, bottom: 8 }}
                  onClick={(state) => {
                    const row = state?.activePayload?.[0]?.payload
                    if (!row || row.isOtras) return
                    if (row.campana) setCampana((prev) => (prev === row.campana ? '' : row.campana))
                  }}
                >
                  <defs>
                    <linearGradient id={`${rqGrad}-h`} x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor={theme.rq} />
                      <stop offset="100%" stopColor={theme.rqSoft} />
                    </linearGradient>
                    <linearGradient id={`${ingGrad}-h`} x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor={theme.ingresos} />
                      <stop offset="100%" stopColor={theme.ingSoft} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={theme.grid} />
                  <XAxis type="number" tick={{ fontSize: 10, fill: theme.tick }} axisLine={false} tickLine={false} />
                  <YAxis
                    type="category"
                    dataKey="campanaShort"
                    width={132}
                    tick={{ fontSize: 10, fill: theme.label }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip content={<PairTooltip mode="cobertura" theme={theme} />} />
                  <Bar dataKey="requerimiento" fill={`url(#${rqGrad}-h)`} maxBarSize={12} cursor="pointer" radius={[0, 6, 6, 0]} animationDuration={320}>
                    {(campanasChart || []).map((row) => (
                      <Cell key={`crq-${row.campana}`} fill={`url(#${rqGrad}-h)`} fillOpacity={!campana || campana === row.campana ? 1 : 0.35} />
                    ))}
                  </Bar>
                  <Bar dataKey="ingresos" fill={`url(#${ingGrad}-h)`} maxBarSize={12} cursor="pointer" radius={[0, 6, 6, 0]} animationDuration={320}>
                    {(campanasChart || []).map((row) => (
                      <Cell key={`cing-${row.campana}`} fill={`url(#${ingGrad}-h)`} fillOpacity={!campana || campana === row.campana ? 1 : 0.35} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          <ChartCard theme={theme}>
            <SectionTitle isDark={isDark}>Participación por modalidad</SectionTitle>
            <div className="relative h-[268px]">
              {pieData.length === 0 ? (
                <p className="flex h-full items-center justify-center text-sm text-[var(--text-muted)]">Sin ingresos en el periodo</p>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        dataKey="ingresos"
                        nameKey="modalidad"
                        cx="38%"
                        cy="50%"
                        innerRadius={62}
                        outerRadius={90}
                        paddingAngle={4}
                        stroke={isDark ? '#0F172A' : '#fff'}
                        strokeWidth={2}
                        animationDuration={320}
                        onClick={(_, idx) => {
                          const mod = pieData[idx]?.modalidad
                          if (mod) toggleModalidad(mod)
                        }}
                      >
                        {pieData.map((entry) => {
                          const active = modalidades.includes(entry.modalidad)
                          return (
                            <Cell
                              key={entry.modalidad}
                              fill={modColor[entry.modalidad] || '#94a3b8'}
                              fillOpacity={active ? 1 : 0.28}
                              cursor="pointer"
                            />
                          )
                        })}
                      </Pie>
                      <Tooltip content={<PairTooltip mode="cobertura" theme={theme} />} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="pointer-events-none absolute left-[38%] top-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
                    <p className="text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)]">Total FTE</p>
                    <p className="text-[18px] font-black tabular-nums text-[var(--text-primary)]">{formatPeNumber(view.ingresosModTotal)}</p>
                  </div>
                  <ul className="absolute right-1 top-1/2 flex w-[44%] -translate-y-1/2 flex-col gap-2 pr-1">
                    {pieData.map((m) => (
                      <li key={m.modalidad}>
                        <button
                          type="button"
                          onClick={() => toggleModalidad(m.modalidad)}
                          className="flex w-full items-center gap-2 text-left"
                        >
                          <i className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: modColor[m.modalidad], opacity: modalidades.includes(m.modalidad) ? 1 : 0.35 }} />
                          <span className="min-w-0">
                            <span className="block truncate text-[10px] font-black uppercase tracking-wide text-[var(--text-primary)]">{m.modalidad}</span>
                            <span className="block text-[10px] font-semibold text-[var(--text-secondary)]">
                              {formatPeNumber(m.ingresos)} · {formatPePercent(m.participacion)}
                            </span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </ChartCard>
        </section>

        <ChartCard theme={theme}>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[11px] font-black uppercase tracking-wide text-[var(--text-primary)]">
              Detalle semana × campaña · {effectivePeriodo}
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
                  {['Semana', 'Campaña', 'Requerimiento', 'Ingresos', '% Cobertura', 'Brecha'].map((h) => (
                    <th key={h} className={`border px-2 py-1.5 text-left font-black uppercase tracking-wide ${isDark ? 'border-slate-700' : 'border-[#0f2b50]'}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {view.tabla.map((r) => {
                  const rowSemana = r.semana || r.segmento
                  const key = `${rowSemana}|${r.campana}`
                  const active = activeTableKey === key
                  return (
                    <tr
                      key={key}
                      onClick={() => {
                        setSemana(rowSemana)
                        setCampana(r.campana)
                        setActiveTableKey(key)
                      }}
                      className={`cursor-pointer border-b border-[var(--border-subtle)] ${
                        active
                          ? (isDark ? 'bg-cyan-500/15' : 'bg-indigo-50')
                          : (isDark ? 'odd:bg-[var(--bg-surface)] even:bg-[var(--bg-elevated)] hover:bg-cyan-500/10' : 'odd:bg-white even:bg-slate-50 hover:bg-indigo-50/70')
                      }`}
                    >
                      <td className="px-2 py-1.5 font-semibold text-[var(--text-primary)]">{r.semana || r.segmento}</td>
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
        </ChartCard>
      </div>
    </div>
  )
}

export default memo(CoberturaDotacion)
