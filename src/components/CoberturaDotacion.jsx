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
import { Download, ArrowLeft, Target, TrendingUp, Percent, GitCompare, LineChart, GraduationCap, UserPlus } from 'lucide-react'
import * as XLSX from 'xlsx'
import ViewLoadingSkeleton from './ui/ViewLoadingSkeleton'
import { fetchCoberturaDotacion, fetchCapacidadRysLookup } from '../lib/dataService'
import {
  COBERTURA_COLORS,
  MODALIDADES,
  buildCoberturaDotacionModelFromTable,
  aggregateCoberturaDotacion,
  formatPeNumber,
  formatPePercent,
  coberturaStatus,
  coberturaTone,
  metricDecimals,
  metricUnitLabel,
} from '../lib/coberturaDotacionAnalytics'
import {
  joinCoberturaConCapacidad,
  buildRequerimientosModel,
  aggregateRequerimientos,
} from '../lib/coberturaRequerimientosAnalytics'
import { CoberturaReportChrome } from './cobertura/CoberturaFilterBar'

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
      filterBg: 'var(--bg-surface)',
      filterLabel: 'var(--text-muted)',
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
    filterBg: '#FFFFFF',
    filterLabel: '#64748B',
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

function AxisToggle({ value, onChange, isDark }) {
  return (
    <div className="flex justify-end gap-1">
      {[{ id: 'periodo', label: 'Periodo' }, { id: 'semana', label: 'Semana' }].map((opt) => (
        <button
          key={opt.id}
          type="button"
          onClick={() => onChange(opt.id)}
          className={`h-7 rounded-full px-3 text-[10px] font-black uppercase tracking-wide ${
            value === opt.id
              ? (isDark ? 'bg-cyan-500 text-slate-950' : 'bg-[#163A6B] text-white')
              : (isDark ? 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] border border-[var(--border-normal)]' : 'bg-[#d6d3ea] text-[#163A6B]')
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
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

const ComboTooltip = memo(({ active, payload, label, theme, decimals = 2 }) => {
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
        <p style={{ color: theme.rq }}>RQ · {formatPeNumber(row.requerimiento, decimals)}</p>
        <p style={{ color: theme.ingresos }}>Ingresos · {formatPeNumber(row.ingresos, decimals)}</p>
        {row.proyeccion != null && payload.some((p) => p.dataKey === 'proyeccion') ? (
          <p style={{ color: theme.proy || theme.line }}>Proyección · {formatPeNumber(row.proyeccion, decimals)}</p>
        ) : null}
        <p style={{ color: theme.line }}>Cobertura · {formatPePercent(row.coberturaPct)}</p>
        <p className={row.brecha >= 0 ? theme.up : theme.down}>Brecha · {formatPeNumber(row.brecha, decimals)}</p>
      </div>
    </div>
  )
})
ComboTooltip.displayName = 'ComboTooltip'

const PairTooltip = memo(({ active, payload, label, mode, theme, decimals = 2 }) => {
  if (!active || !payload?.length) return null
  const row = payload[0]?.payload
  if (!row) return null
  const title = label || row.condicionLabel || row.segmento || row.campanaShort || row.campana || row.semana
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
      <p>RQ · {formatPeNumber(row.requerimiento, decimals)}</p>
      <p>Ingresos · {formatPeNumber(row.ingresos, decimals)}</p>
      <p>{mode === 'brecha' ? `Brecha · ${formatPeNumber(row.brecha, decimals)}` : `Cobertura · ${formatPePercent(row.coberturaPct)}`}</p>
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

function ModalidadDonut({ pieData, total, theme, isDark, modalidades, toggleModalidad, modColor, decimals = 2, unitLabel = 'FT' }) {
  return (
    <div className="flex h-[268px] items-center gap-5">
      <div className="relative min-h-0 min-w-0 flex-1 self-stretch">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={pieData}
              dataKey="ingresos"
              nameKey="modalidad"
              cx="50%"
              cy="50%"
              innerRadius={58}
              outerRadius={84}
              paddingAngle={4}
              stroke={isDark ? '#0F172A' : '#fff'}
              strokeWidth={2}
              animationDuration={320}
              onClick={(_, idx) => {
                const mod = pieData[idx]?.modalidad
                if (mod) toggleModalidad(mod)
              }}
            >
              {pieData.map((entry) => (
                <Cell
                  key={entry.modalidad}
                  fill={modColor[entry.modalidad] || '#94a3b8'}
                  fillOpacity={modalidades.includes(entry.modalidad) ? 1 : 0.28}
                  cursor="pointer"
                />
              ))}
            </Pie>
            <Tooltip content={<PairTooltip mode="cobertura" theme={theme} decimals={decimals} />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <p className="text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)]">Total {unitLabel}</p>
          <p className="text-[18px] font-black tabular-nums text-[var(--text-primary)]">{formatPeNumber(total, decimals)}</p>
        </div>
      </div>
      <ul className="flex w-[132px] shrink-0 flex-col justify-center gap-3 border-l border-[var(--border-subtle)] pl-4 pr-1">
        {pieData.map((m) => (
          <li key={m.modalidad}>
            <button
              type="button"
              onClick={() => toggleModalidad(m.modalidad)}
              className="flex w-full items-start gap-2 text-left"
            >
              <i
                className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ background: modColor[m.modalidad], opacity: modalidades.includes(m.modalidad) ? 1 : 0.35 }}
              />
              <span className="min-w-0">
                <span className="block text-[10px] font-black uppercase tracking-wide text-[var(--text-primary)]">
                  {m.modalidad}
                </span>
                <span className="block text-[10px] font-semibold text-[var(--text-secondary)]">
                  {formatPeNumber(m.ingresos, decimals)} · {formatPePercent(m.participacion)}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

function JornadaMixChart({
  data,
  theme,
  isDark,
  mode,
  setMode,
  condicion,
  onSelect,
  decimals,
  fmt,
}) {
  const mix = mode === 'volumen'
  return (
    <ChartCard theme={theme}>
      <div className="mb-2 flex items-start justify-between gap-2">
        <SectionTitle isDark={isDark}>Cobertura por jornada</SectionTitle>
        <div className="flex justify-end gap-1">
          {[{ id: 'volumen', label: 'Volumen' }, { id: 'cobertura', label: 'Cobertura' }, { id: 'brecha', label: 'Brecha' }].map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setMode(opt.id)}
              className={`h-7 rounded-full px-3 text-[10px] font-black uppercase tracking-wide ${
                mode === opt.id
                  ? (isDark ? 'bg-cyan-500 text-slate-950' : 'bg-[#163A6B] text-white')
                  : (isDark ? 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] border border-[var(--border-normal)]' : 'bg-[#d6d3ea] text-[#163A6B]')
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
      {mix ? (
        <ChartLegend
          theme={theme}
          items={[
            { label: 'Requerimiento', color: theme.rq },
            { label: 'Ingresos', color: theme.ingresos },
          ]}
        />
      ) : null}
      <div className="h-[268px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            margin={{ top: 16, right: 12, left: 0, bottom: 4 }}
            onClick={(state) => {
              const name = state?.activePayload?.[0]?.payload?.condicion
              if (name) onSelect(name)
            }}
          >
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={theme.grid} />
            <XAxis dataKey="condicionLabel" tick={{ fontSize: 11, fill: theme.tick }} axisLine={false} tickLine={false} />
            <YAxis
              tick={{ fontSize: 10, fill: theme.tick }}
              axisLine={false}
              tickLine={false}
              unit={mode === 'cobertura' ? '%' : ''}
            />
            <Tooltip
              content={<PairTooltip mode={mode === 'brecha' ? 'brecha' : 'cobertura'} theme={theme} decimals={decimals} />}
            />
            {mix ? (
              <>
                <Bar dataKey="requerimiento" maxBarSize={28} cursor="pointer" radius={[5, 5, 0, 0]} animationDuration={320}>
                  {data.map((row) => (
                    <Cell key={`jrq-${row.condicion}`} fill={theme.rq} fillOpacity={!condicion || condicion === row.condicion ? 1 : 0.35} />
                  ))}
                </Bar>
                <Bar dataKey="ingresos" maxBarSize={28} cursor="pointer" radius={[5, 5, 0, 0]} animationDuration={320}>
                  {data.map((row) => (
                    <Cell key={`jing-${row.condicion}`} fill={theme.ingresos} fillOpacity={!condicion || condicion === row.condicion ? 1 : 0.35} />
                  ))}
                  <LabelList
                    dataKey="coberturaPct"
                    position="top"
                    formatter={(v) => formatPePercent(v)}
                    style={{ fontSize: 10, fill: theme.label, fontWeight: 700 }}
                  />
                </Bar>
              </>
            ) : (
              <Bar
                dataKey={mode === 'cobertura' ? 'coberturaPct' : 'brecha'}
                maxBarSize={42}
                cursor="pointer"
                radius={[6, 6, 0, 0]}
                animationDuration={320}
              >
                {data.map((row) => (
                  <Cell
                    key={`j-${row.condicion}`}
                    fill={mode === 'cobertura' ? coverageFill(row.coberturaPct, theme) : (row.brecha >= 0 ? theme.ingresos : theme.danger)}
                    fillOpacity={!condicion || condicion === row.condicion ? 1 : 0.35}
                  />
                ))}
                <LabelList
                  dataKey={mode === 'cobertura' ? 'coberturaPct' : 'brecha'}
                  position="top"
                  formatter={(v) => (mode === 'cobertura' ? formatPePercent(v) : fmt(v))}
                  style={{ fontSize: 10, fill: theme.label, fontWeight: 700 }}
                />
              </Bar>
            )}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
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

function CoverageToggleChart({
  title,
  hint,
  data = [],
  nameKey,
  selected,
  onSelect,
  theme,
  isDark,
  decimals,
  fmt,
  yWidth = 132,
  emptyHint = 'Clic en un segmento para ver sus campañas',
}) {
  const [mode, setMode] = useState('cobertura')
  const maxCob = Math.max(140, ...data.map((r) => Number(r.coberturaPct) || 0))
  const maxBrecha = Math.max(1, ...data.map((r) => Math.abs(Number(r.brecha) || 0)))
  return (
    <ChartCard theme={theme}>
      <SectionTitle isDark={isDark}>{title}</SectionTitle>
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-[10px] font-semibold text-[var(--text-muted)]">{hint || ' '}</p>
        <div className="flex shrink-0 justify-end gap-1">
          {['cobertura', 'brecha'].map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setMode(id)}
              className={`h-7 rounded-full px-3 text-[10px] font-black uppercase tracking-wide ${
                mode === id
                  ? (isDark ? 'bg-cyan-500 text-slate-950' : 'bg-[#163A6B] text-white')
                  : (isDark ? 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] border border-[var(--border-normal)]' : 'bg-[#d6d3ea] text-[#163A6B]')
              }`}
            >
              {id === 'cobertura' ? 'Cobertura' : 'Brecha'}
            </button>
          ))}
        </div>
      </div>
      <div className="h-[268px] overflow-y-auto pr-1">
        {data.length === 0 ? (
          <p className="flex h-full items-center justify-center px-4 text-center text-sm text-[var(--text-muted)]">
            {emptyHint}
          </p>
        ) : (
          <div className="flex min-h-full flex-col justify-evenly gap-1.5">
            {data.map((row) => {
              const name = row[nameKey]
              const label = nameKey === 'campana' ? (row.campanaShort || name) : name
              const active = !selected || selected === name
              const fill = mode === 'cobertura'
                ? coverageFill(row.coberturaPct, theme)
                : (row.brecha >= 0 ? theme.ingresos : theme.danger)
              const valueLabel = mode === 'cobertura' ? formatPePercent(row.coberturaPct) : fmt(row.brecha)
              const barPct = mode === 'cobertura'
                ? Math.max(0, Math.min(100, (Number(row.coberturaPct) / maxCob) * 100))
                : Math.max(0, Math.min(50, (Math.abs(Number(row.brecha)) / maxBrecha) * 50))
              return (
                <button
                  key={name}
                  type="button"
                  title={`${name} · ${valueLabel}`}
                  onClick={() => onSelect?.(name)}
                  className="flex w-full items-center gap-2 rounded-md px-1 py-0.5 text-left transition hover:bg-[var(--bg-elevated)]"
                  style={{ opacity: active ? 1 : 0.38 }}
                >
                  <span
                    className="shrink-0 truncate text-right text-[10px] font-semibold leading-tight text-[var(--text-secondary)]"
                    style={{ width: yWidth }}
                  >
                    {label}
                  </span>
                  <span className="relative h-4 min-w-0 flex-1 rounded-full" style={{ background: theme.track }}>
                    {mode === 'brecha' ? (
                      <span
                        className="absolute top-0 h-full rounded-full"
                        style={{
                          background: fill,
                          width: `${barPct}%`,
                          left: row.brecha >= 0 ? '50%' : `${50 - barPct}%`,
                        }}
                      />
                    ) : (
                      <span
                        className="absolute inset-y-0 left-0 rounded-full"
                        style={{ background: fill, width: `${barPct}%` }}
                      />
                    )}
                  </span>
                  <span className="w-[58px] shrink-0 text-right text-[10px] font-bold text-[var(--text-primary)]">
                    {valueLabel}
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </ChartCard>
  )
}

function CampanasVolumeChart({
  campanasChart = [],
  theme,
  isDark,
  gid,
  decimals,
  fmt,
  campana,
  onSelectCampana,
  volumeLegend,
}) {
  const ranking = (campanasChart || []).filter((r) => !r.isOtras).slice(0, 7)
  const otras = (campanasChart || []).find((r) => r.isOtras)
  const rqGrad = `rqCamp-${gid}`
  const ingGrad = `ingCamp-${gid}`
  const opacityFor = (row) => (!campana || campana === row.campana ? 1 : 0.35)
  return (
    <ChartCard theme={theme} className="xl:col-span-2">
      <SectionTitle isDark={isDark}>Top campañas</SectionTitle>
      <ChartLegend theme={theme} items={volumeLegend} />
      <div className="h-[268px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={ranking}
            layout="vertical"
            margin={{ top: 4, right: 16, left: 4, bottom: 4 }}
            onClick={(state) => {
              const row = state?.activePayload?.[0]?.payload
              if (!row || row.isOtras || !row.campana) return
              onSelectCampana?.(row.campana)
            }}
          >
            <defs>
              <linearGradient id={rqGrad} x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor={theme.rq} />
                <stop offset="100%" stopColor={theme.rqSoft} />
              </linearGradient>
              <linearGradient id={ingGrad} x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor={theme.ingresos} />
                <stop offset="100%" stopColor={theme.ingSoft} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={theme.grid} />
            <XAxis type="number" tick={{ fontSize: 10, fill: theme.tick }} axisLine={false} tickLine={false} />
            <YAxis
              type="category"
              dataKey="campanaShort"
              width={118}
              interval={0}
              tick={{ fontSize: 10, fill: theme.label }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip content={<PairTooltip mode="cobertura" theme={theme} decimals={decimals} />} />
            <Bar dataKey="requerimiento" fill={`url(#${rqGrad})`} maxBarSize={11} cursor="pointer" radius={[0, 6, 6, 0]} animationDuration={320}>
              {ranking.map((row) => (
                <Cell key={`crq-${row.campana}`} fill={`url(#${rqGrad})`} fillOpacity={opacityFor(row)} />
              ))}
            </Bar>
            <Bar dataKey="ingresos" fill={`url(#${ingGrad})`} maxBarSize={11} cursor="pointer" radius={[0, 6, 6, 0]} animationDuration={320}>
              {ranking.map((row) => (
                <Cell key={`cing-${row.campana}`} fill={`url(#${ingGrad})`} fillOpacity={opacityFor(row)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      {otras ? (
        <p className="mt-1 text-center text-[10px] text-[var(--text-muted)]">
          Resto agrupado fuera del ranking · RQ {fmt(otras.requerimiento)} · Ingresos {fmt(otras.ingresos)}
        </p>
      ) : null}
    </ChartCard>
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
  semana,
  setSemana,
  segmento,
  setSegmento,
  campana,
  setCampana,
  periodo,
  setPeriodo,
  estado,
  setEstado,
  modalidades,
  toggleModalidad,
  tipo,
  setTipo,
  seguimientoAxis,
  setSeguimientoAxis,
  onSeguimientoClick,
  clearFilters,
}) {
  const [activeTableKey, setActiveTableKey] = useState('')
  const rqGrad = `rqReq-${gid}`
  const ingGrad = `ingReq-${gid}`
  const proyGrad = `proyReq-${gid}`
  const modColor = { PRESENCIAL: theme.presencial, REMOTO: theme.remoto }
  const decimals = metricDecimals(tipo)
  const fmt = (val) => formatPeNumber(val, decimals)
  const effectivePeriodo = periodo || model.defaultPeriodo
  const filters = useMemo(
    () => ({ semana, segmento, campana, periodo: effectivePeriodo, estado, modalidades, tipo, seguimientoAxis }),
    [semana, segmento, campana, effectivePeriodo, estado, modalidades, tipo, seguimientoAxis]
  )
  const view = useMemo(() => aggregateRequerimientos(model, filters), [model, filters])
  const kpis = view.kpis
  const campanasChart = view.campanasChart || []
  const pieData = view.modalidad.filter((m) => m.ingresos > 0)

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
    XLSX.utils.book_append_sheet(wb, ws, 'Proyectados')
    XLSX.writeFile(wb, `GEA_Proyectados_${effectivePeriodo || 'all'}.xlsx`)
  }, [view.tabla, effectivePeriodo])

  const reqLegend = [
    { label: 'Requerimiento', color: theme.rq },
    { label: 'Proyección', color: theme.proy },
    { label: 'Ingresos', color: theme.ingresos },
  ]

  return (
    <div className="h-full overflow-auto p-3 text-[var(--text-primary)]" style={{ background: theme.pageBg }}>
      <div className="mx-auto max-w-[1600px] space-y-3">
        <CoberturaReportChrome
          corteLabel={view.corteLabel}
          isDark={isDark}
          headerBg={theme.headerBg}
          filterOptions={view.filterOptions}
          periodo={effectivePeriodo}
          defaultPeriodo={model.defaultPeriodo}
          semana={semana}
          segmento={segmento}
          campana={campana}
          estado={estado}
          modalidades={modalidades}
          tipo={tipo}
          onPeriodoChange={(value) => { setPeriodo(value); setSemana(''); setSegmento(''); setCampana('') }}
          onSemanaChange={(value) => { setSemana(value); setSegmento(''); setCampana('') }}
          onSegmentoChange={(value) => { setSegmento(value); setCampana('') }}
          onCampanaChange={setCampana}
          onEstadoChange={setEstado}
          onToggleModalidad={toggleModalidad}
          onTipoChange={setTipo}
          onClear={() => { clearFilters(); setActiveTableKey('') }}
          onBack={onBack}
        />

        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <KpiCard
            theme={theme}
            title="Requerimiento"
            value={fmt(kpis.requerimiento)}
            accent={theme.rq}
            icon={Target}
            period={effectivePeriodo}
          />
          <KpiCard
            theme={theme}
            title="Ingresos efectivos"
            value={fmt(kpis.ingresos)}
            tone={kpis.ingresos >= kpis.requerimiento ? 'up' : 'down'}
            accent={theme.ingresos}
            icon={TrendingUp}
            period={effectivePeriodo}
            subtitle={`Objetivo: ${fmt(kpis.requerimiento)} (${formatDelta(kpis.ingresos, kpis.requerimiento)})`}
          />
          <KpiCard
            theme={theme}
            title="Ingresos proyectados"
            value={fmt(kpis.proyeccion)}
            tone={kpis.proyeccion >= kpis.requerimiento ? 'up' : 'down'}
            accent={theme.proy}
            icon={LineChart}
            period={effectivePeriodo}
            subtitle={`Objetivo: ${fmt(kpis.requerimiento)} (${formatDelta(kpis.proyeccion, kpis.requerimiento)})`}
          />
          <KpiCard
            theme={theme}
            title="Brecha de capacitación"
            value={fmt(kpis.brechaCapacitacion)}
            tone={kpis.brechaCapacitacion >= 0 ? 'up' : 'down'}
            accent={kpis.brechaCapacitacion >= 0 ? theme.ingresos : theme.danger}
            icon={GraduationCap}
            period={effectivePeriodo}
            subtitle={tipo === 'personas' ? 'Objetivo: 0' : 'Objetivo: 0,00'}
          />
          <KpiCard
            theme={theme}
            title="Brecha de reclutamiento"
            value={fmt(kpis.brechaReclutamiento)}
            tone={kpis.brechaReclutamiento >= 0 ? 'up' : 'down'}
            accent={kpis.brechaReclutamiento >= 0 ? theme.ingresos : theme.danger}
            icon={UserPlus}
            period={effectivePeriodo}
            subtitle={tipo === 'personas' ? 'Objetivo: 0' : 'Objetivo: 0,00'}
          />
        </section>

        <section className="grid grid-cols-1 gap-3 xl:grid-cols-3">
          <ChartCard theme={theme} className="xl:col-span-2">
            <div className="mb-2 flex items-start justify-between gap-2">
              <SectionTitle isDark={isDark}>Seguimiento cobertura</SectionTitle>
              <AxisToggle value={seguimientoAxis} onChange={setSeguimientoAxis} isDark={isDark} />
            </div>
            <ChartLegend theme={theme} items={reqLegend} />
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={view.seguimiento}
                  margin={{ top: 16, right: 8, left: 0, bottom: 8 }}
                  onClick={onSeguimientoClick}
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
                  <XAxis dataKey="axisKey" tick={{ fontSize: 11, fill: theme.tick }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: theme.tick }} axisLine={false} tickLine={false} />
                  <Tooltip content={<ComboTooltip theme={theme} decimals={decimals} />} />
                  <Bar dataKey="requerimiento" fill={`url(#${rqGrad})`} radius={[5, 5, 0, 0]} maxBarSize={22} cursor="pointer">
                    {view.seguimiento.map((row) => (
                      <Cell key={`rq-${row.axisKey}`} fill={`url(#${rqGrad})`} fillOpacity={row.selected ? 1 : 0.42} />
                    ))}
                  </Bar>
                  <Bar dataKey="proyeccion" fill={`url(#${proyGrad})`} radius={[5, 5, 0, 0]} maxBarSize={22} cursor="pointer">
                    {view.seguimiento.map((row) => (
                      <Cell key={`pr-${row.axisKey}`} fill={`url(#${proyGrad})`} fillOpacity={row.selected ? 1 : 0.42} />
                    ))}
                  </Bar>
                  <Bar dataKey="ingresos" fill={`url(#${ingGrad})`} radius={[5, 5, 0, 0]} maxBarSize={22} cursor="pointer">
                    {view.seguimiento.map((row) => (
                      <Cell key={`ing-${row.axisKey}`} fill={`url(#${ingGrad})`} fillOpacity={row.selected ? 1 : 0.42} />
                    ))}
                  </Bar>
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
          <CoverageToggleChart
            title="Cobertura por segmento"
            hint={segmento ? `Seleccionado: ${segmento}` : 'Clic para filtrar'}
            data={view.segmentos}
            nameKey="segmento"
            selected={segmento}
            onSelect={(name) => {
              setSegmento((prev) => (prev === name ? '' : name))
              setCampana('')
            }}
            theme={theme}
            isDark={isDark}
            decimals={decimals}
            fmt={fmt}
            yWidth={148}
          />
        </section>

        <section className="grid grid-cols-1 gap-3 xl:grid-cols-3">
          <CampanasVolumeChart
            campanasChart={campanasChart}
            theme={theme}
            isDark={isDark}
            gid={`${gid}-rq`}
            decimals={decimals}
            fmt={fmt}
            campana={campana}
            onSelectCampana={(name) => setCampana((prev) => (prev === name ? '' : name))}
            volumeLegend={reqLegend.filter((item) => item.label !== 'Proyección')}
          />
          <ChartCard theme={theme}>
            <SectionTitle isDark={isDark}>Participación por modalidad</SectionTitle>
            <div className="relative h-[268px]">
              {pieData.length === 0 ? (
                <p className="flex h-full items-center justify-center text-sm text-[var(--text-muted)]">Sin ingresos en el periodo</p>
              ) : (
                <ModalidadDonut
                  pieData={pieData}
                  total={view.ingresosModTotal}
                  theme={theme}
                  isDark={isDark}
                  modalidades={modalidades}
                  toggleModalidad={toggleModalidad}
                  modColor={modColor}
                  decimals={decimals}
                  unitLabel={metricUnitLabel(tipo)}
                />
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
                      <td className="px-2 py-1.5 text-right tabular-nums">{fmt(r.requerimiento)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{formatPeNumber(r.dia1, 0)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{fmt(r.proyeccion)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{fmt(r.ingresos)}</td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className={`font-black ${isDark ? 'bg-slate-800 text-[var(--text-primary)]' : 'bg-slate-100'}`}>
                  <td className="px-2 py-1.5" colSpan={4}>Total</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{fmt(kpis.requerimiento)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{formatPeNumber(kpis.dia1, 0)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{fmt(kpis.proyeccion)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{fmt(kpis.ingresos)}</td>
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
  const [segmento, setSegmento] = useState('')
  const [campana, setCampana] = useState('')
  const [periodo, setPeriodo] = useState('')
  const [estado, setEstado] = useState('')
  const [tipo, setTipo] = useState('ftes')
  const [condicion, setCondicion] = useState('')
  const [jornadaMode, setJornadaMode] = useState('volumen')
  const [seguimientoAxis, setSeguimientoAxis] = useState('periodo')
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
    () => buildCoberturaDotacionModelFromTable(tableRows, capacidadRows),
    [tableRows, capacidadRows]
  )
  const requerimientosModel = useMemo(
    () => buildRequerimientosModel(joinCoberturaConCapacidad(tableRows, capacidadRows)),
    [tableRows, capacidadRows]
  )

  const effectivePeriodo = periodo || model.defaultPeriodo
  const decimals = metricDecimals(tipo)
  const fmt = (val) => formatPeNumber(val, decimals)

  const filters = useMemo(
    () => ({ semana, segmento, campana, periodo: effectivePeriodo, estado, modalidades, tipo, seguimientoAxis, condicion }),
    [semana, segmento, campana, effectivePeriodo, estado, modalidades, tipo, seguimientoAxis, condicion]
  )

  const view = useMemo(
    () => aggregateCoberturaDotacion(model, filters),
    [model, filters]
  )

  useEffect(() => {
    if (estado && view.filterOptions.estados.length && !view.filterOptions.estados.includes(estado)) {
      setEstado('')
    }
  }, [estado, view.filterOptions.estados])

  const clearFilters = useCallback(() => {
    setSemana('')
    setSegmento('')
    setCampana('')
    setEstado('')
    setCondicion('')
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

  const handleSeguimientoClick = useCallback((state) => {
    const key = state?.activeLabel
    if (!key) return
    if (seguimientoAxis === 'semana') {
      setSemana((prev) => (prev === key ? '' : key))
      setCampana('')
      return
    }
    setPeriodo(key)
    setSemana('')
    setSegmento('')
    setCampana('')
  }, [seguimientoAxis])

  const kpis = view.kpis
  const kpiTone = kpis.brecha >= 0 ? 'up' : 'down'

  const handleExport = useCallback(() => {
    const rows = [
      ...view.tabla.map((r) => ({
        PERIODO: r.periodo,
        SEMANA: r.semana,
        CAMPAÑA: r.campana,
        REQUERIMIENTO: r.requerimiento,
        INGRESOS: r.ingresos,
        '% COBERTURA': Number((r.coberturaPct / 100).toFixed(4)),
        BRECHA: r.brecha,
        TIPO: metricUnitLabel(tipo),
      })),
      {
        PERIODO: 'Total',
        SEMANA: '',
        CAMPAÑA: '',
        REQUERIMIENTO: kpis.requerimiento,
        INGRESOS: kpis.ingresos,
        '% COBERTURA': Number((kpis.coberturaPct / 100).toFixed(4)),
        BRECHA: kpis.brecha,
        TIPO: metricUnitLabel(tipo),
      },
    ]
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Cobertura')
    XLSX.writeFile(wb, `GEA_Cobertura_Dotacion_${effectivePeriodo || 'all'}.xlsx`)
  }, [view.tabla, kpis, effectivePeriodo, tipo])

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
          <p className="font-black uppercase tracking-wide">Sin datos para Proyectados</p>
          <p className="mt-2 text-[var(--text-secondary)]">
            No hay filas de cobertura_dotacion para mostrar. El estado del grupo se toma de capacidad_rys cuando existe ficha.
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
        semana={semana}
        setSemana={setSemana}
        segmento={segmento}
        setSegmento={setSegmento}
        campana={campana}
        setCampana={setCampana}
        periodo={periodo}
        setPeriodo={setPeriodo}
        estado={estado}
        setEstado={setEstado}
        modalidades={modalidades}
        toggleModalidad={toggleModalidad}
        tipo={tipo}
        setTipo={setTipo}
        seguimientoAxis={seguimientoAxis}
        setSeguimientoAxis={setSeguimientoAxis}
        onSeguimientoClick={handleSeguimientoClick}
        clearFilters={clearFilters}
      />
    )
  }

  const sharedLegend = [
    { label: 'Total Requerido', color: theme.rq },
    { label: 'Ingresos Efectivos', color: theme.ingresos },
    { label: '% Cobertura / meta 100%', color: theme.line },
  ]

  return (
    <div className="h-full overflow-auto p-3 text-[var(--text-primary)]" style={{ background: theme.pageBg }}>
      <div className="mx-auto max-w-[1600px] space-y-3">
        <CoberturaReportChrome
          corteLabel={view.corteLabel}
          isDark={isDark}
          headerBg={theme.headerBg}
          filterOptions={view.filterOptions}
          periodo={effectivePeriodo}
          defaultPeriodo={model.defaultPeriodo}
          semana={semana}
          segmento={segmento}
          campana={campana}
          estado={estado}
          condicion={condicion}
          modalidades={modalidades}
          tipo={tipo}
          onPeriodoChange={(value) => {
            setPeriodo(value)
            setSemana('')
            setSegmento('')
            setCampana('')
          }}
          onSemanaChange={(value) => {
            setSemana(value)
            setSegmento('')
            setCampana('')
          }}
          onSegmentoChange={(value) => {
            setSegmento(value)
            setCampana('')
          }}
          onCampanaChange={setCampana}
          onEstadoChange={setEstado}
          onToggleModalidad={toggleModalidad}
          onTipoChange={setTipo}
          onClear={clearFilters}
          onProyectados={() => setPage('requerimientos')}
        />

        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            theme={theme}
            title="Requerimiento"
            value={fmt(kpis.requerimiento)}
            accent={theme.rq}
            icon={Target}
            period={effectivePeriodo}
          />
          <KpiCard
            theme={theme}
            title="Ingresos efectivos"
            value={fmt(kpis.ingresos)}
            tone={kpiTone}
            accent={theme.ingresos}
            icon={TrendingUp}
            period={effectivePeriodo}
            subtitle={`Objetivo: ${fmt(kpis.requerimiento)} (${formatDelta(kpis.ingresos, kpis.requerimiento)})`}
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
            value={fmt(kpis.brecha)}
            tone={kpiTone}
            accent={kpis.brecha >= 0 ? theme.ingresos : theme.danger}
            icon={GitCompare}
            period={effectivePeriodo}
            subtitle={tipo === 'personas' ? 'Objetivo: 0' : 'Objetivo: 0,00'}
          />
        </section>

        <section className="grid grid-cols-1 gap-3 xl:grid-cols-3">
          <ChartCard theme={theme} className="xl:col-span-2">
            <div className="mb-2 flex items-start justify-between gap-2">
              <SectionTitle isDark={isDark}>Seguimiento cobertura</SectionTitle>
              <AxisToggle value={seguimientoAxis} onChange={setSeguimientoAxis} isDark={isDark} />
            </div>
            <ChartLegend theme={theme} items={sharedLegend} />
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={view.seguimiento}
                  margin={{ top: 28, right: 22, left: 0, bottom: 8 }}
                  onClick={handleSeguimientoClick}
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
                  <XAxis dataKey="axisKey" tick={{ fontSize: 11, fill: theme.tick }} axisLine={false} tickLine={false} />
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
                  <Tooltip content={<ComboTooltip theme={theme} decimals={decimals} />} />
                  <Bar dataKey="requerimiento" fill={`url(#${rqGrad})`} radius={[5, 5, 0, 0]} maxBarSize={26} cursor="pointer" animationDuration={320}>
                    {view.seguimiento.map((row) => (
                      <Cell key={`rq-${row.axisKey}`} fill={`url(#${rqGrad})`} fillOpacity={row.selected ? 1 : 0.42} />
                    ))}
                  </Bar>
                  <Bar dataKey="ingresos" fill={`url(#${ingGrad})`} radius={[5, 5, 0, 0]} maxBarSize={26} cursor="pointer" animationDuration={320}>
                    {view.seguimiento.map((row) => (
                      <Cell key={`ing-${row.axisKey}`} fill={`url(#${ingGrad})`} fillOpacity={row.selected ? 1 : 0.42} />
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
            <SectionTitle isDark={isDark}>Cobertura por segmento</SectionTitle>
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
                    width={148}
                    tick={{ fontSize: 10, fill: theme.label }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip content={<PairTooltip mode={segmentMode} theme={theme} decimals={decimals} />} />
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
                        key={row.segmento}
                        fill={segmentMode === 'cobertura' ? coverageFill(row.coberturaPct, theme) : (row.brecha >= 0 ? theme.ingresos : theme.danger)}
                        fillOpacity={!segmento || segmento === row.segmento ? 1 : 0.35}
                      />
                    ))}
                    <LabelList
                      dataKey={segmentMode === 'cobertura' ? 'coberturaPct' : 'brecha'}
                      position="right"
                      formatter={(v) => (segmentMode === 'cobertura' ? formatPePercent(v) : fmt(v))}
                      style={{ fontSize: 10, fill: theme.label, fontWeight: 700 }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
        </section>

        <section className="grid grid-cols-1 gap-3">
          <ChartCard theme={theme}>
            <SectionTitle isDark={isDark}>Cobertura nivel campañas</SectionTitle>
            <ChartLegend
              theme={theme}
              items={[
                { label: 'Total Requerido', color: theme.rq },
                { label: 'Ingresos Efectivos', color: theme.ingresos },
              ]}
            />
            <div className="h-[340px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={campanasChart}
                  margin={{ top: 12, right: 8, left: 0, bottom: 8 }}
                  onClick={(state) => {
                    const row = state?.activePayload?.[0]?.payload
                    if (!row || row.isOtras) return
                    if (row.campana) setCampana((prev) => (prev === row.campana ? '' : row.campana))
                  }}
                >
                  <defs>
                    <linearGradient id={`${rqGrad}-h`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={theme.rqSoft} />
                      <stop offset="100%" stopColor={theme.rq} />
                    </linearGradient>
                    <linearGradient id={`${ingGrad}-h`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={theme.ingSoft} />
                      <stop offset="100%" stopColor={theme.ingresos} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={theme.grid} />
                  <XAxis
                    dataKey="campanaShort"
                    interval={0}
                    tick={{ fontSize: 10, fill: theme.label }}
                    axisLine={false}
                    tickLine={false}
                    angle={-38}
                    textAnchor="end"
                    height={78}
                  />
                  <YAxis tick={{ fontSize: 10, fill: theme.tick }} axisLine={false} tickLine={false} />
                  <Tooltip content={<PairTooltip mode="cobertura" theme={theme} decimals={decimals} />} />
                  <Bar dataKey="requerimiento" fill={`url(#${rqGrad}-h)`} maxBarSize={28} cursor="pointer" radius={[6, 6, 0, 0]} animationDuration={320}>
                    {(campanasChart || []).map((row) => (
                      <Cell key={`crq-${row.campanaShort || row.campana}`} fill={`url(#${rqGrad}-h)`} fillOpacity={!campana || campana === row.campana ? 1 : 0.35} />
                    ))}
                  </Bar>
                  <Bar dataKey="ingresos" fill={`url(#${ingGrad}-h)`} maxBarSize={28} cursor="pointer" radius={[6, 6, 0, 0]} animationDuration={320}>
                    {(campanasChart || []).map((row) => (
                      <Cell key={`cing-${row.campanaShort || row.campana}`} fill={`url(#${ingGrad}-h)`} fillOpacity={!campana || campana === row.campana ? 1 : 0.35} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
        </section>

        <section className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          <ChartCard theme={theme}>
            <SectionTitle isDark={isDark}>Participación por modalidad</SectionTitle>
            <div className="relative h-[268px]">
              {pieData.length === 0 ? (
                <p className="flex h-full items-center justify-center text-sm text-[var(--text-muted)]">Sin ingresos en el periodo</p>
              ) : (
                <ModalidadDonut
                  pieData={pieData}
                  total={view.ingresosModTotal}
                  theme={theme}
                  isDark={isDark}
                  modalidades={modalidades}
                  toggleModalidad={toggleModalidad}
                  modColor={modColor}
                  decimals={decimals}
                  unitLabel={metricUnitLabel(tipo)}
                />
              )}
            </div>
          </ChartCard>
          <JornadaMixChart
            data={view.jornada || []}
            theme={theme}
            isDark={isDark}
            mode={jornadaMode}
            setMode={setJornadaMode}
            condicion={condicion}
            onSelect={(name) => setCondicion((prev) => (prev === name ? '' : name))}
            decimals={decimals}
            fmt={fmt}
          />
        </section>

        <ChartCard theme={theme}>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[11px] font-black uppercase tracking-wide text-[var(--text-primary)]">
              Matriz detallada
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
                  {['Periodo', 'Semana', 'Campaña', 'Requerimiento', 'Ingresos', '% Cobertura', 'Brecha'].map((h) => (
                    <th key={h} className={`border px-2 py-1.5 text-left font-black uppercase tracking-wide ${isDark ? 'border-slate-700' : 'border-[#0f2b50]'}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {view.tabla.map((r) => {
                  const key = `${r.periodo}|${r.semana}|${r.campana}`
                  const active = activeTableKey === key
                  return (
                    <tr
                      key={key}
                      onClick={() => {
                        setSemana(r.semana)
                        setCampana(r.campana)
                        setActiveTableKey(key)
                      }}
                      className={`cursor-pointer border-b border-[var(--border-subtle)] ${
                        active
                          ? (isDark ? 'bg-cyan-500/15' : 'bg-indigo-50')
                          : (isDark ? 'odd:bg-[var(--bg-surface)] even:bg-[var(--bg-elevated)] hover:bg-cyan-500/10' : 'odd:bg-white even:bg-slate-50 hover:bg-indigo-50/70')
                      }`}
                    >
                      <td className="px-2 py-1.5 font-semibold text-[var(--text-primary)]">{r.periodo}</td>
                      <td className="px-2 py-1.5 font-semibold tabular-nums text-[var(--text-primary)]">{r.semana}</td>
                      <td className="px-2 py-1.5 text-[var(--text-secondary)]">{r.campana}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-[var(--text-primary)]">{fmt(r.requerimiento)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-[var(--text-primary)]">{fmt(r.ingresos)}</td>
                      <td className={`px-2 py-1.5 text-right font-bold tabular-nums ${r.coberturaPct >= 100 ? theme.up : theme.down}`}>
                        {formatPePercent(r.coberturaPct)}
                      </td>
                      <td className={`px-2 py-1.5 text-right font-bold tabular-nums ${r.brecha >= 0 ? theme.up : theme.down}`}>
                        {fmt(r.brecha)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className={`font-black ${isDark ? 'bg-slate-800 text-[var(--text-primary)]' : 'bg-slate-100'}`}>
                  <td className="px-2 py-1.5" colSpan={3}>Total</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{fmt(kpis.requerimiento)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{fmt(kpis.ingresos)}</td>
                  <td className={`px-2 py-1.5 text-right tabular-nums ${kpis.coberturaPct >= 100 ? theme.up : theme.down}`}>
                    {formatPePercent(kpis.coberturaPct)}
                  </td>
                  <td className={`px-2 py-1.5 text-right tabular-nums ${kpis.brecha >= 0 ? theme.up : theme.down}`}>
                    {fmt(kpis.brecha)}
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
