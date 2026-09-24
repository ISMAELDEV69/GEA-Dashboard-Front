import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import {
  BarChart, Bar, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, Cell, LabelList,
} from 'recharts'
import { RotateCcw } from 'lucide-react'
import {
  buildFilterOptions,
  buildFormadorModel,
  buildFormadorPeople,
  filterFormadorRows,
  fmtNum,
  GAUGE_METRICS,
  resolveLockedFormador,
  semaforoDesercion,
  semaforoDotacion,
  semaforoIngresoOp,
} from '../../lib/kpiFormadoresAnalytics'
import { ChartTooltipContent } from '../ui/chart-tooltip'
import Card, { CardHeader, CardTitle, CardContent } from '../ui/Card'

const OPTION_CLASS = 'bg-[var(--bg-surface)] text-[var(--text-primary)]'
const MINI_SELECT =
  'h-7 max-w-[140px] bg-transparent text-[11px] text-[var(--text-primary)] outline-none cursor-pointer border-0 border-b border-[var(--border-normal)] hover:border-[var(--accent)] focus:border-[var(--accent)] truncate appearance-auto'

const KpiThemeContext = createContext(null)
function useKpiTheme() {
  return useContext(KpiThemeContext)
}

function cssVar(name, fallback) {
  if (typeof document === 'undefined') return fallback
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value || fallback
}

function hexToRgb(hex) {
  const raw = String(hex || '').replace('#', '')
  const full = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw
  const n = parseInt(full, 16)
  if (Number.isNaN(n)) return '245, 166, 35'
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`
}

function buildPresentation(mode) {
  const isLight = mode === 'light'
  const accent = cssVar('--accent', isLight ? '#0369A1' : mode === 'comfortable' ? '#818CF8' : '#38BDF8')
  const amber = cssVar('--neon-amber', isLight ? '#D97706' : '#F59E0B')
  const green = cssVar('--neon-green', isLight ? '#16A34A' : '#22C55E')
  const cyan = cssVar('--neon-cyan', isLight ? '#0891B2' : '#06B6D4')
  const violet = cssVar('--neon-violet', isLight ? '#7C3AED' : '#A855F7')
  const red = cssVar('--neon-red', isLight ? '#E11D48' : '#F43F5E')
  const muted = cssVar('--text-muted', isLight ? '#64748B' : '#94A3B8')
  const tick = cssVar('--text-secondary', isLight ? '#334155' : '#CBD5E1')
  const label = cssVar('--text-primary', isLight ? '#0F172A' : '#F8FAFC')
  return {
    mode,
    isLight,
    accent,
    amber,
    green,
    cyan,
    violet,
    red,
    muted,
    tick,
    label,
    dia1: amber,
    ojt: cyan,
    iop: green,
    desercion: red,
    grid: isLight ? 'rgba(15,23,42,0.08)' : 'rgba(148,163,184,0.16)',
    cursor: isLight ? 'rgba(15,23,42,0.05)' : 'rgba(255,255,255,0.05)',
    heatRgb: hexToRgb(amber),
    heatTextHot: isLight ? '#0F172A' : '#0B1220',
    heatTextCold: isLight ? '#334155' : '#F8FAFC',
    emptyCell: isLight ? 'rgba(15,23,42,0.04)' : 'rgba(255,255,255,0.04)',
    palette: isLight
      ? [green, accent, violet, amber, '#C2410C', '#0F766E', '#BE185D', '#1D4ED8', muted, '#7C2D12']
      : [green, cyan, violet, amber, '#FB923C', '#F472B6', accent, '#2DD4BF', muted, red],
  }
}

function useAppPresentation() {
  const [mode, setMode] = useState(() => {
    if (typeof document === 'undefined') return 'dark'
    return document.documentElement.getAttribute('data-theme') || 'dark'
  })
  useEffect(() => {
    const el = document.documentElement
    const sync = () => setMode(el.getAttribute('data-theme') || 'dark')
    const obs = new MutationObserver(sync)
    obs.observe(el, { attributes: true, attributeFilter: ['data-theme'] })
    sync()
    return () => obs.disconnect()
  }, [])
  return useMemo(() => buildPresentation(mode), [mode])
}

function MiniSelect({ value, onChange, children, wide = false, mono = false }) {
  return (
    <select
      value={value}
      onChange={onChange}
      className={`${MINI_SELECT} ${wide ? 'max-w-[180px]' : ''} ${mono ? 'font-mono' : ''}`}
    >
      {children}
    </select>
  )
}

function shortName(name) {
  return String(name || '').trim().split(/\s+/).slice(0, 2).join(' ')
}

function ChartFrame({ title, caption, children, tall = false, auto = false, extra = null }) {
  return (
    <div className={`rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] ${auto ? 'p-3' : 'p-5'}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <h3 className="text-[17px] font-semibold tracking-tight text-[var(--text-primary)]">{title}</h3>
        {extra}
      </div>
      <div className={auto ? '' : tall ? 'h-[360px]' : 'h-[280px]'}>{children}</div>
      {caption && <p className="text-[11px] leading-relaxed text-[var(--text-muted)] mt-2">{caption}</p>}
    </div>
  )
}

function resolveSemaforo(kind, value) {
  if (kind === 'desercion') return semaforoDesercion(value)
  if (kind === 'dotacion') return semaforoDotacion(value)
  return semaforoIngresoOp(value)
}

function semaforoFill(level, theme) {
  if (theme.isLight) {
    if (level === 'VERDE') return { bg: 'rgba(22, 163, 74, 0.20)', color: '#166534' }
    if (level === 'AMBAR') return { bg: 'rgba(217, 119, 6, 0.22)', color: '#92400E' }
    if (level === 'ROJO') return { bg: 'rgba(225, 29, 72, 0.18)', color: '#9F1239' }
  }
  if (level === 'VERDE') return { bg: 'rgba(34, 197, 94, 0.28)', color: '#86EFAC' }
  if (level === 'AMBAR') return { bg: 'rgba(245, 158, 11, 0.28)', color: '#FCD34D' }
  if (level === 'ROJO') return { bg: 'rgba(244, 63, 94, 0.28)', color: '#FDA4AF' }
  return { bg: theme.emptyCell, color: theme.muted }
}

function gaugeTone(value, kind, theme) {
  const level = resolveSemaforo(kind, value)
  if (level === 'VERDE') return theme.green
  if (level === 'AMBAR') return theme.amber
  return theme.red
}

function GaugeNeedle({ title, value = 0, part = 0, total = 0, partLabel, totalLabel, invert = false, digits = 0, semaforo = 'ingresoOp' }) {
  const theme = useKpiTheme()
  const clamped = Math.max(0, Math.min(100, Number(value) || 0))
  const angle = -180 + (clamped / 100) * 180
  const color = gaugeTone(clamped, semaforo || (invert ? 'desercion' : 'ingresoOp'), theme)
  const cx = 80
  const cy = 78
  const r = 58
  const rad = (angle * Math.PI) / 180
  const nx = cx + Math.cos(rad) * (r - 10)
  const ny = cy + Math.sin(rad) * (r - 10)

  return (
    <div className="flex flex-col items-center min-w-[180px]">
      <svg viewBox="0 0 160 100" className="w-[180px] h-[112px]" role="img" aria-label={`${title} ${clamped}%`}>
        <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`} fill="none" stroke={theme.grid} strokeWidth="10" strokeLinecap="round" />
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${(clamped / 100) * Math.PI * r} ${Math.PI * r}`}
        />
        <line x1={cx} y1={cy} x2={nx} y2={ny} stroke={theme.label} strokeWidth="2.4" strokeLinecap="round" />
        <circle cx={cx} cy={cy} r="4" fill={theme.label} />
      </svg>
      <p className="text-2xl font-black font-mono leading-none" style={{ color }}>{fmtNum(clamped, 1)}%</p>
      <p className="text-[11px] font-medium text-[var(--text-primary)] mt-1 text-center">{title}</p>
      <p className="text-[10px] text-[var(--text-muted)] font-mono mt-0.5">
        {fmtNum(part, digits)} {partLabel} / {fmtNum(total, digits)} {totalLabel}
      </p>
    </div>
  )
}

function FormadorMatrix({ matrix, metric = 'all', selected = null, onSelect }) {
  const theme = useKpiTheme()
  const columns = matrix?.columns || []
  const rows = matrix?.rows || []
  if (!columns.length) {
    return <p className="text-xs text-[var(--text-muted)] py-8 text-center">Sin cruce formador × tiempo en el filtro.</p>
  }

  const specs = {
    pctDotacion: {
      key: 'pctDotacion', label: 'Dot', suffix: '%',
      partKey: 'iopFtes', totalKey: 'rqFte', partLabel: 'I-OP FTE', totalLabel: 'RQ FTES', digits: 1,
      semaforo: 'dotacion',
    },
    pctDesercion: {
      key: 'pctDesercion', label: 'Des', suffix: '%',
      partKey: 'desercion', totalKey: 'dia1', partLabel: 'bajas CT+OJT', totalLabel: 'Día 1 (sigla A)', digits: 0,
      semaforo: 'desercion',
    },
    pctOp: {
      key: 'pctOp', label: 'OP', suffix: '%',
      partKey: 'iop', totalKey: 'rqQ', partLabel: 'I-OP pers.', totalLabel: 'RQ Q', digits: 0,
      semaforo: 'ingresoOp',
    },
  }
  const metrics = metric === 'all' ? Object.values(specs) : [specs[metric] || specs.pctDotacion]

  const nameWidth = 136
  const aulasWidth = 44
  const metricCount = columns.length * metrics.length

  return (
    <div className="overflow-auto max-h-[620px] custom-scrollbar">
      <table className="w-full table-fixed border-collapse text-[11px]">
        <colgroup>
          <col style={{ width: nameWidth }} />
          <col style={{ width: aulasWidth }} />
          {Array.from({ length: metricCount }).map((_, i) => (
            <col key={i} />
          ))}
        </colgroup>
        <thead className="sticky top-0 z-10 bg-[var(--bg-surface)]">
          <tr>
            <th className="sticky left-0 z-20 bg-[var(--bg-surface)] text-left font-medium text-[var(--text-muted)] px-2 py-1">
              Formador
            </th>
            <th className="sticky z-20 bg-[var(--bg-surface)] text-center font-medium text-[var(--text-muted)] py-1" style={{ left: nameWidth }}>
              Aulas
            </th>
            {columns.map((col, colIdx) => (
              <th
                key={col.key}
                colSpan={metrics.length}
                className={`text-center font-medium text-[var(--text-muted)] py-1 whitespace-nowrap ${colIdx > 0 ? 'border-l border-[var(--border-subtle)]' : ''}`}
              >
                {col.label}
              </th>
            ))}
          </tr>
          {metrics.length > 1 && (
          <tr>
            <th className="sticky left-0 z-20 bg-[var(--bg-surface)]" />
            <th className="sticky z-20 bg-[var(--bg-surface)]" style={{ left: nameWidth }} />
            {columns.map((col, colIdx) => metrics.map((m, metricIdx) => (
              <th
                key={`${col.key}-${m.key}`}
                className={`text-center font-medium text-[var(--text-muted)] py-0.5 ${colIdx > 0 && metricIdx === 0 ? 'border-l border-[var(--border-subtle)]' : ''}`}
              >
                {m.label}
              </th>
            )))}
          </tr>
          )}
        </thead>
        <tbody>
          {rows.map((row) => {
            const active = selected === row.nombre
            const nameBg = active ? 'bg-[var(--accent-soft)] text-[var(--accent)]' : 'bg-[var(--bg-surface)] text-[var(--text-secondary)]'
            return (
            <tr
              key={row.nombre}
              onClick={() => onSelect?.(row.nombre)}
              className={`cursor-pointer ${active ? 'outline outline-1 outline-[var(--accent)]' : 'hover:bg-[var(--surface-hover)]'}`}
            >
              <td className={`sticky left-0 z-10 px-2 py-0.5 truncate text-[12px] ${nameBg}`} title={row.nombre}>
                {shortName(row.nombre)}
              </td>
              <td
                className={`sticky z-10 text-center font-mono font-semibold h-8 ${nameBg}`}
                style={{ left: nameWidth }}
                title={`${row.nombre} · ${row.aulas} aula${row.aulas === 1 ? '' : 's'} en el corte`}
              >
                {row.aulas || '—'}
              </td>
              {row.cells.flatMap((cell, colIdx) => metrics.map((m, metricIdx) => {
                const value = Number(cell[m.key] || 0)
                const empty = cell.empty && !value
                const level = empty ? null : resolveSemaforo(m.semaforo, value)
                const tone = empty ? { bg: theme.emptyCell, color: theme.muted } : semaforoFill(level, theme)
                const part = Number(cell[m.partKey] || 0)
                const total = Number(cell[m.totalKey] || 0)
                const tip = empty
                  ? `${row.nombre} · ${cell.key} · ${m.label} —`
                  : `${row.nombre} · ${cell.key} · ${m.label} ${value}% · ${fmtNum(part, m.digits || 0)} ${m.partLabel} de ${fmtNum(total, m.digits || 0)} ${m.totalLabel}`
                return (
                  <td
                    key={`${row.nombre}-${cell.key}-${m.key}`}
                    className={`text-center font-mono font-semibold h-8 ${colIdx > 0 && metricIdx === 0 ? 'border-l border-[var(--border-subtle)]' : ''}`}
                    style={{ background: tone.bg, color: tone.color }}
                    title={tip}
                  >
                    {empty ? '—' : `${value}%`}
                  </td>
                )
              }))}
            </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function prettySegment(name) {
  return String(name || '')
    .replace(/CLARO PERU RETENCIONES/i, 'Retenciones')
    .replace(/CLARO PERU OUT/i, 'Perú Out')
    .replace(/CLARO PERU/i, 'Claro Perú')
    .replace(/CLARO CHILE/i, 'Claro Chile')
    .replace(/LIPIGAS/i, 'Lipigas')
}

function FormadorAulaMatrix({ aulas = [] }) {
  const theme = useKpiTheme()
  const rolled = new Map()
  ;(aulas || []).forEach((a) => {
    if (!a.dia1 && !a.ojt && !a.iop) return
    const key = `${a.formador || ''}|${a.segmento || ''}|${a.campana || ''}|${a.grupo || ''}`
    if (!rolled.has(key)) {
      rolled.set(key, {
        key,
        formador: a.formador,
        segmento: a.segmento,
        campana: a.campana,
        grupo: a.grupo,
        dia1: 0,
        ojt: 0,
        iop: 0,
      })
    }
    const rec = rolled.get(key)
    rec.dia1 += Number(a.dia1 || 0)
    rec.ojt += Number(a.ojt || 0)
    rec.iop += Number(a.iop || 0)
  })
  const data = Array.from(rolled.values()).sort((a, b) => (
    String(a.formador || '').localeCompare(String(b.formador || ''))
    || String(a.grupo || '').localeCompare(String(b.grupo || ''))
  ))

  if (!data.length) {
    return <p className="text-xs text-[var(--text-muted)] py-8 text-center">Sin aulas de formación en el corte.</p>
  }

  const tot = data.reduce((acc, row) => {
    acc.dia1 += Number(row.dia1 || 0)
    acc.ojt += Number(row.ojt || 0)
    acc.iop += Number(row.iop || 0)
    return acc
  }, { dia1: 0, ojt: 0, iop: 0 })

  return (
    <div className="overflow-auto max-h-[520px] custom-scrollbar">
      <table className="w-full text-left text-xs border-collapse">
        <thead className="sticky top-0 z-10 bg-[var(--table-head-bg)] text-[10px] font-black uppercase text-[var(--text-muted)]">
          <tr>
            <th className="py-2 px-2">Formador</th>
            <th className="py-2 px-2">Segmento</th>
            <th className="py-2 px-2">Campaña</th>
            <th className="py-2 px-2">Grupo</th>
            <th className="py-2 px-2 text-right">Día 1</th>
            <th className="py-2 px-2 text-right">OJT</th>
            <th className="py-2 px-2 text-right">I-OP</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border-subtle)] font-mono">
          {data.map((row) => (
            <tr key={row.key} className="hover:bg-[var(--surface-hover)]">
              <td className="py-1.5 px-2 font-sans text-[var(--text-primary)] truncate max-w-[180px]" title={row.formador}>
                {shortName(row.formador) || 'Sin formador'}
              </td>
              <td className="py-1.5 px-2 font-sans text-[var(--text-secondary)] truncate max-w-[140px]" title={row.segmento}>
                {prettySegment(row.segmento) || '—'}
              </td>
              <td className="py-1.5 px-2 font-sans text-[var(--text-secondary)] truncate max-w-[160px]" title={row.campana}>
                {row.campana || '—'}
              </td>
              <td className="py-1.5 px-2 text-[var(--accent)] truncate" title={row.grupo}>
                {row.grupo || '—'}
              </td>
              <td className="py-1.5 px-2 text-right" style={{ color: theme.dia1 }}>{fmtNum(row.dia1)}</td>
              <td className="py-1.5 px-2 text-right" style={{ color: theme.ojt }}>{fmtNum(row.ojt)}</td>
              <td className="py-1.5 px-2 text-right" style={{ color: theme.iop }}>{fmtNum(row.iop)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot className="sticky bottom-0 bg-[var(--bg-surface)] font-mono font-semibold">
          <tr>
            <td className="py-2 px-2 font-sans" colSpan={4}>{data.length} aulas</td>
            <td className="py-2 px-2 text-right" style={{ color: theme.dia1 }}>{fmtNum(tot.dia1)}</td>
            <td className="py-2 px-2 text-right" style={{ color: theme.ojt }}>{fmtNum(tot.ojt)}</td>
            <td className="py-2 px-2 text-right" style={{ color: theme.iop }}>{fmtNum(tot.iop)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

function RankBarChart({ data, valueKey, nameKey = 'nombre', suffix = ' pers.', shorten = true, labelWidth }) {
  const theme = useKpiTheme()
  const rows = (data || []).map((row) => ({
    label: shorten ? shortName(row[nameKey]) : String(row[nameKey] || ''),
    full: row[nameKey],
    value: Number(row[valueKey] || 0),
  }))
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 64, left: 4, bottom: 4 }}>
        <XAxis type="number" hide />
        <YAxis type="category" dataKey="label" width={labelWidth || (shorten ? 128 : 168)} tick={{ fill: theme.tick, fontSize: 12 }} axisLine={false} tickLine={false} />
        <Tooltip cursor={{ fill: theme.cursor }} content={<ChartTooltipContent />} formatter={(value) => [`${value}${suffix}`, '']} labelFormatter={(_, payload) => payload?.[0]?.payload?.full} />
        <Bar dataKey="value" radius={[0, 7, 7, 0]} barSize={18} isAnimationActive={false}>
          {rows.map((row, i) => (
            <Cell key={`${row.full}-${i}`} fill={theme.palette[i % theme.palette.length]} />
          ))}
          <LabelList dataKey="value" position="right" formatter={(value) => `${value}${suffix}`} style={{ fill: theme.label, fontSize: 11, fontWeight: 600 }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

function SemaforoBadge({ value }) {
  const theme = useKpiTheme()
  const map = {
    VERDE: theme.isLight ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    AMBAR: theme.isLight ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    ROJO: theme.isLight ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-rose-500/15 text-rose-400 border-rose-500/30',
    CRITICO: 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] border-[var(--border-normal)]',
  }
  const label = { VERDE: 'OK', AMBAR: 'RIESGO', ROJO: 'CRÍTICO', CRITICO: 'SIN AULA' }
  return (
    <span className={`px-2 py-0.5 rounded text-[10px] font-black border ${map[value] || map.CRITICO}`}>
      {label[value] || value}
    </span>
  )
}

function KpiTile({ label, value, sub, tone = 'cyan' }) {
  const theme = useKpiTheme()
  const color = { cyan: theme.cyan, emerald: theme.green, amber: theme.amber, indigo: theme.violet, rose: theme.red }[tone] || theme.accent
  return (
    <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4" style={{ borderLeft: `3px solid ${color}` }}>
      <p className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)]">{label}</p>
      <p className="text-2xl font-black font-mono mt-1" style={{ color }}>{value}</p>
      {sub && <p className="text-[10px] text-[var(--text-muted)] mt-1 font-medium">{sub}</p>}
    </div>
  )
}

export default function KpiFormadoresDashboard({
  postulantes = [],
  asistencias = [],
  grupos = [],
  campanasMetas = [],
  userProfile = null,
}) {
  const userRole = String(userProfile?.rol || userProfile?.role || '').toLowerCase()
  const isLocked = userRole === 'formador'
  const canSeeKpiFormadores = userRole !== 'formador' && userRole !== 'reclutador'
  const theme = useAppPresentation()

  const [periodo, setPeriodo] = useState('ALL')
  const [semana, setSemana] = useState('ALL')
  const [segmento, setSegmento] = useState('ALL')
  const [campana, setCampana] = useState('ALL')
  const [grupo, setGrupo] = useState('ALL')
  const [formador, setFormador] = useState('ALL')
  const [modalidad, setModalidad] = useState('ALL')
  const [condicion, setCondicion] = useState('ALL')
  const [vista, setVista] = useState('resumen')
  const [ejeFlujo, setEjeFlujo] = useState('periodo')
  const [ejeTiempo, setEjeTiempo] = useState('semana')
  const [etapaMotivo, setEtapaMotivo] = useState('ct')
  const [gaugeMetric, setGaugeMetric] = useState(null)
  const [selectedFormador, setSelectedFormador] = useState(null)

  const people = useMemo(
    () => buildFormadorPeople(postulantes, asistencias, grupos, campanasMetas),
    [postulantes, asistencias, grupos, campanasMetas]
  )

  const lockedName = useMemo(
    () => (isLocked ? resolveLockedFormador(people, userProfile) : null),
    [isLocked, people, userProfile]
  )
  const effectiveFormador = isLocked ? (lockedName || '__SIN_PERFIL__') : formador

  useEffect(() => {
    if (!canSeeKpiFormadores && vista !== 'resumen') setVista('resumen')
  }, [canSeeKpiFormadores, vista])

  const options = useMemo(() => {
    const byPeriodo = filterFormadorRows(people, { periodo, formador: effectiveFormador })
    const bySeg = filterFormadorRows(byPeriodo, { periodo, segmento, formador: effectiveFormador })
    const byCamp = filterFormadorRows(bySeg, { periodo, segmento, campana, formador: effectiveFormador })
    return {
      all: buildFilterOptions(people),
      semanas: buildFilterOptions(byPeriodo).semanas,
      segmentos: buildFilterOptions(byPeriodo).segmentos,
      campanas: buildFilterOptions(bySeg).campanas,
      grupos: buildFilterOptions(byCamp).grupos,
      formadores: buildFilterOptions(people).formadores,
      modalidades: buildFilterOptions(people).modalidades,
      condiciones: buildFilterOptions(people).condiciones,
    }
  }, [people, periodo, segmento, campana, effectiveFormador])

  const filtered = useMemo(() => filterFormadorRows(people, {
    periodo, semana, segmento, campana, grupo, formador: effectiveFormador, modalidad, condicion,
  }), [people, periodo, semana, segmento, campana, grupo, effectiveFormador, modalidad, condicion])

  const model = useMemo(() => buildFormadorModel(filtered), [filtered])
  const t = model.totals
  const motivosEtapa = useMemo(() => {
    const etapa = etapaMotivo === 'ojt' ? 'OJT' : 'CT'
    return (model.motivos || [])
      .filter((m) => m.etapa === etapa)
      .slice(0, 12)
      .map((m) => ({ nombre: m.nombre, d1Show: m.value }))
  }, [model.motivos, etapaMotivo])
  const motivoCaption = etapaMotivo === 'ojt'
    ? (isLocked
      ? 'Tus bajas después de pasar a OJT. Baja Día 1 y descuentos no entran.'
      : 'Deserción en OJT. Baja Día 1 y descuentos no impactan al formador.')
    : (isLocked
      ? 'Tus bajas en capacitación inicial. Baja Día 1 y descuentos no entran.'
      : 'Deserción en capacitación inicial. Baja Día 1 y descuentos no impactan al formador.')
  const motivoExtra = (
    <div className="flex items-center gap-1">
      {[
        { id: 'ct', label: 'Capacitación', count: t.bajaCt },
        { id: 'ojt', label: 'OJT', count: t.bajaOjt },
      ].map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => setEtapaMotivo(tab.id)}
          className={`h-7 px-2.5 rounded-md text-[11px] font-medium cursor-pointer ${
            etapaMotivo === tab.id ? 'bg-[var(--accent-soft)] text-[var(--accent)]' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
          }`}
        >
          {tab.label} · {fmtNum(tab.count)}
        </button>
      ))}
    </div>
  )
  const activeFilters = [periodo, semana, segmento, campana, grupo, modalidad, condicion, !isLocked && formador !== 'ALL' ? formador : null]
    .filter((v) => v && v !== 'ALL').length

  const resetFilters = () => {
    setPeriodo('ALL'); setSemana('ALL'); setSegmento('ALL'); setCampana('ALL')
    setGrupo('ALL'); setModalidad('ALL'); setCondicion('ALL')
    if (!isLocked) setFormador('ALL')
  }

  return (
    <KpiThemeContext.Provider value={theme}>
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-1">
          <MiniSelect value={periodo} onChange={(e) => { setPeriodo(e.target.value); setGrupo('ALL') }}>
            <option value="ALL" className={OPTION_CLASS}>Periodo ingreso</option>
            {options.all.periodos.map((p) => <option key={p} value={p} className={OPTION_CLASS}>{p}</option>)}
          </MiniSelect>
          <MiniSelect value={semana} onChange={(e) => setSemana(e.target.value)}>
            <option value="ALL" className={OPTION_CLASS}>Semana</option>
            {options.semanas.map((s) => <option key={s} value={s} className={OPTION_CLASS}>Sem {s}</option>)}
          </MiniSelect>
          <MiniSelect value={segmento} onChange={(e) => { setSegmento(e.target.value); setCampana('ALL'); setGrupo('ALL') }} wide>
            <option value="ALL" className={OPTION_CLASS}>Segmento</option>
            {options.segmentos.map((s) => <option key={s} value={s} className={OPTION_CLASS}>{s}</option>)}
          </MiniSelect>
          <MiniSelect value={campana} onChange={(e) => { setCampana(e.target.value); setGrupo('ALL') }} wide>
            <option value="ALL" className={OPTION_CLASS}>Campaña</option>
            {options.campanas.map((c) => <option key={c} value={c} className={OPTION_CLASS}>{c}</option>)}
          </MiniSelect>
          <MiniSelect value={grupo} onChange={(e) => setGrupo(e.target.value)} mono>
            <option value="ALL" className={OPTION_CLASS}>Grupo</option>
            {options.grupos.map((g) => <option key={g} value={g} className={OPTION_CLASS}>{g}</option>)}
          </MiniSelect>
          {isLocked ? (
            <span className="h-7 inline-flex items-center text-[11px] text-[var(--text-secondary)] truncate max-w-[160px]">
              {lockedName || 'Mi perfil'}
            </span>
          ) : (
            <MiniSelect value={formador} onChange={(e) => setFormador(e.target.value)} wide>
              <option value="ALL" className={OPTION_CLASS}>Formador</option>
              {options.formadores.map((r) => <option key={r} value={r} className={OPTION_CLASS}>{r}</option>)}
            </MiniSelect>
          )}
          <MiniSelect value={modalidad} onChange={(e) => setModalidad(e.target.value)}>
            <option value="ALL" className={OPTION_CLASS}>Modalidad</option>
            {options.modalidades.map((m) => <option key={m} value={m} className={OPTION_CLASS}>{m}</option>)}
          </MiniSelect>
          <MiniSelect value={condicion} onChange={(e) => setCondicion(e.target.value)}>
            <option value="ALL" className={OPTION_CLASS}>Jornada</option>
            {options.condiciones.map((c) => <option key={c} value={c} className={OPTION_CLASS}>{c}</option>)}
          </MiniSelect>
          {activeFilters > 0 && (
            <button type="button" onClick={resetFilters} className="h-7 px-1.5 inline-flex items-center gap-1 text-[11px] text-[var(--text-muted)] hover:text-[var(--neon-red)] cursor-pointer">
              <RotateCcw size={11} />
              {activeFilters}
            </button>
          )}
        </div>

        {canSeeKpiFormadores && (
        <div className="flex items-center gap-1 px-1">
          {[
            { id: 'resumen', label: 'Resumen' },
            { id: 'kpi', label: 'KPI Formadores' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setVista(tab.id)}
              className={`h-7 px-2.5 rounded-md text-[11px] font-medium cursor-pointer ${
                vista === tab.id ? 'bg-[var(--accent-soft)] text-[var(--accent)]' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        )}

        {vista === 'resumen' && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
              <KpiTile label="Día 1 capacitación" value={fmtNum(t.dia1)} sub="Cohorte que llegó al aula" tone="amber" />
              <KpiTile label="Pasaron a OJT" value={fmtNum(t.ojt)} sub={`${t.pctOjtD1}% del Día 1`} tone="cyan" />
              <KpiTile label="Dotación I-OP" value={fmtNum(t.iop)} sub={`${fmtNum(t.iopFtes, 1)} FTEs · ${t.pctEfectividad}% efect.`} tone="emerald" />
              <KpiTile label="Deserción formador" value={`${t.pctDesercion}%`} sub={`${fmtNum(t.desercion)} bajas CT+OJT de ${fmtNum(t.dia1)} Día 1 (A)`} tone="rose" />
              <KpiTile label="Efectividad D1→OP" value={`${t.pctEfectividad}%`} sub={`${fmtNum(t.iop)} de ${fmtNum(t.dia1)}`} tone="indigo" />
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <ChartFrame
                tall
                title="Flujo de formación"
                caption={ejeFlujo === 'periodo'
                  ? 'Eje X: periodo de ingreso. Eje Y: personas. Día 1, inicio OJT e ingreso a operación.'
                  : 'Eje X: semana. Eje Y: personas. Día 1, inicio OJT e ingreso a operación.'}
                extra={(
                  <div className="flex items-center gap-1">
                    {[
                      { id: 'periodo', label: 'Periodo' },
                      { id: 'semana', label: 'Semana' },
                    ].map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setEjeFlujo(tab.id)}
                        className={`h-7 px-2.5 rounded-md text-[11px] font-medium cursor-pointer ${
                          ejeFlujo === tab.id ? 'bg-[var(--accent-soft)] text-[var(--accent)]' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                )}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={ejeFlujo === 'periodo' ? model.periods : model.weekly} margin={{ top: 16, right: 16, left: 4, bottom: 8 }}>
                    <defs>
                      <linearGradient id="formFlujoDia1" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={theme.dia1} stopOpacity={0.42} />
                        <stop offset="100%" stopColor={theme.dia1} stopOpacity={0.04} />
                      </linearGradient>
                      <linearGradient id="formFlujoOjt" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={theme.ojt} stopOpacity={0.42} />
                        <stop offset="100%" stopColor={theme.ojt} stopOpacity={0.04} />
                      </linearGradient>
                      <linearGradient id="formFlujoIop" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={theme.iop} stopOpacity={0.42} />
                        <stop offset="100%" stopColor={theme.iop} stopOpacity={0.04} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={theme.grid} vertical={false} />
                    <XAxis
                      dataKey="label"
                      stroke={theme.tick}
                      fontSize={12}
                      tickLine={false}
                      axisLine={{ stroke: theme.grid }}
                      tickMargin={8}
                      height={28}
                      padding={{ left: 8, right: 8 }}
                    />
                    <YAxis
                      stroke={theme.tick}
                      fontSize={12}
                      tickLine={false}
                      axisLine={false}
                      domain={[0, (max) => Math.max(Number(max) || 0, 10)]}
                      allowDecimals={false}
                      allowDataOverflow={false}
                      padding={{ top: 10, bottom: 22 }}
                      width={40}
                    />
                    <Tooltip content={<ChartTooltipContent />} />
                    <Legend wrapperStyle={{ fontSize: 12, paddingTop: 4 }} />
                    <Area type="linear" dataKey="dia1" name="Día 1" stroke={theme.dia1} fill="url(#formFlujoDia1)" strokeWidth={2.2} dot={{ r: 3, fill: theme.dia1 }} isAnimationActive={false} />
                    <Area type="linear" dataKey="ojt" name="Inicio OJT" stroke={theme.ojt} fill="url(#formFlujoOjt)" strokeWidth={2.2} dot={{ r: 3, fill: theme.ojt }} isAnimationActive={false} />
                    <Area type="linear" dataKey="iop" name="Ingreso a operación" stroke={theme.iop} fill="url(#formFlujoIop)" strokeWidth={2.2} dot={{ r: 3, fill: theme.iop }} isAnimationActive={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </ChartFrame>

              <ChartFrame
                tall
                title="Motivos de baja"
                caption={motivoCaption}
                extra={motivoExtra}
              >
                {motivosEtapa.length ? (
                  <RankBarChart
                    data={motivosEtapa}
                    valueKey="d1Show"
                    shorten={false}
                    labelWidth={160}
                  />
                ) : (
                  <p className="h-full flex items-center justify-center text-xs text-[var(--text-muted)]">
                    {etapaMotivo === 'ojt' ? 'Sin bajas de OJT en el corte.' : 'Sin bajas de capacitación inicial en el corte.'}
                  </p>
                )}
              </ChartFrame>
            </div>

            <ChartFrame
              auto
              title="Matriz de formadores"
              caption="Una fila por formador, segmento, campaña y grupo. Día 1 con sigla A. OJT e I-OP de esa misma cohorte. Baja Día 1 y descuentos no entran."
            >
              <FormadorAulaMatrix aulas={model.aulas} />
            </ChartFrame>
          </>
        )}

        {canSeeKpiFormadores && vista === 'kpi' && (
          <>
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
              <KpiTile
                label="Formadores con caídas"
                value={fmtNum((model.alertasCaidas || []).length)}
                sub="Tienen al menos una baja CT u OJT"
                tone="rose"
              />
              <KpiTile
                label="Bajas capacitación"
                value={fmtNum(t.bajaCt)}
                sub={`${t.pctDesercionCt}% del Día 1`}
                tone="amber"
              />
              <KpiTile
                label="Bajas OJT"
                value={fmtNum(t.bajaOjt)}
                sub={`${t.pctDesercionOjt}% del OJT`}
                tone="indigo"
              />
              <KpiTile
                label="Deserción formador"
                value={`${t.pctDesercion}%`}
                sub={`${fmtNum(t.desercion)} de ${fmtNum(t.dia1)} Día 1 (A)`}
                tone="rose"
              />
            </div>

            <ChartFrame
              auto
              title={gaugeMetric && GAUGE_METRICS[gaugeMetric] ? `Matriz · ${GAUGE_METRICS[gaugeMetric].label}` : 'Matriz formador × tiempo'}
              caption="Des = bajas CT+OJT / Día 1 (A), sin Baja Día 1 ni descuentos. Verde <38,4%, ámbar 38,4–40%, rojo >40%. Dot = I-OP FTE / RQ FTES: verde ≥95%, ámbar 80–95%, rojo <80%. OP = I-OP pers. / RQ Q: verde ≥90%, ámbar 80–90%, rojo <80%."
              extra={(
                <div className="flex flex-wrap items-center gap-1">
                  {Object.values(GAUGE_METRICS).map((btn) => (
                    <button
                      key={btn.id}
                      type="button"
                      onClick={() => setGaugeMetric((cur) => (cur === btn.id ? null : btn.id))}
                      className={`h-7 px-2.5 rounded-md text-[11px] font-medium cursor-pointer ${
                        gaugeMetric === btn.id ? 'bg-[var(--accent-soft)] text-[var(--accent)]' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      {btn.label}
                    </button>
                  ))}
                  <span className="w-px h-4 bg-[var(--border-subtle)] mx-1" />
                  {[
                    { id: 'semana', label: 'Por semana' },
                    { id: 'periodo', label: 'Por periodo' },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setEjeTiempo(tab.id)}
                      className={`h-7 px-2.5 rounded-md text-[11px] font-medium cursor-pointer ${
                        ejeTiempo === tab.id ? 'bg-[var(--accent-soft)] text-[var(--accent)]' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              )}
            >
              {gaugeMetric && GAUGE_METRICS[gaugeMetric] && (
                <div className="flex flex-wrap justify-center gap-8 mb-3 py-2 border-b border-[var(--border-subtle)]">
                  <GaugeNeedle
                    title="Corte filtrado"
                    value={model.gauges.corte[GAUGE_METRICS[gaugeMetric].valueKey]}
                    part={model.gauges.corte[GAUGE_METRICS[gaugeMetric].partKey]}
                    total={model.gauges.corte[GAUGE_METRICS[gaugeMetric].totalKey]}
                    partLabel={GAUGE_METRICS[gaugeMetric].partLabel}
                    totalLabel={GAUGE_METRICS[gaugeMetric].totalLabel}
                    invert={GAUGE_METRICS[gaugeMetric].invert}
                    digits={GAUGE_METRICS[gaugeMetric].digits || 0}
                    semaforo={GAUGE_METRICS[gaugeMetric].semaforo}
                  />
                  {selectedFormador && model.gauges.formadores[selectedFormador] && (
                    <GaugeNeedle
                      title={shortName(selectedFormador)}
                      value={model.gauges.formadores[selectedFormador][GAUGE_METRICS[gaugeMetric].valueKey]}
                      part={model.gauges.formadores[selectedFormador][GAUGE_METRICS[gaugeMetric].partKey]}
                      total={model.gauges.formadores[selectedFormador][GAUGE_METRICS[gaugeMetric].totalKey]}
                      partLabel={GAUGE_METRICS[gaugeMetric].partLabel}
                      totalLabel={GAUGE_METRICS[gaugeMetric].totalLabel}
                      invert={GAUGE_METRICS[gaugeMetric].invert}
                      digits={GAUGE_METRICS[gaugeMetric].digits || 0}
                      semaforo={GAUGE_METRICS[gaugeMetric].semaforo}
                    />
                  )}
                </div>
              )}
              <FormadorMatrix
                matrix={ejeTiempo === 'periodo' ? model.matrixPeriod : model.matrixWeek}
                metric={gaugeMetric && GAUGE_METRICS[gaugeMetric]?.matrixKey ? GAUGE_METRICS[gaugeMetric].matrixKey : 'all'}
                selected={selectedFormador}
                onSelect={(name) => setSelectedFormador((cur) => (cur === name ? null : name))}
              />
            </ChartFrame>
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <CardTitle className="text-xs uppercase tracking-wider">Ranking formadores</CardTitle>
                  <span className="text-[10px] font-mono text-[var(--text-muted)]">{model.formadores.length} formadores</span>
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto max-h-[380px] custom-scrollbar">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="sticky top-0 bg-[var(--table-head-bg)] text-[10px] font-black uppercase text-[var(--text-muted)]">
                      <tr>
                        <th className="py-2 px-2">Formador</th>
                        <th className="py-2 px-2 text-right">Aulas</th>
                        <th className="py-2 px-2 text-right">D1</th>
                        <th className="py-2 px-2 text-right">OJT</th>
                        <th className="py-2 px-2 text-right">OP</th>
                        <th className="py-2 px-2 text-right">FTE</th>
                        <th className="py-2 px-2 text-right">Baja CT</th>
                        <th className="py-2 px-2 text-right">Baja OJT</th>
                        <th className="py-2 px-2 text-right">% Efect.</th>
                        <th className="py-2 px-2 text-right">% Deserción</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border-subtle)] font-mono">
                      {model.formadores.map((f) => (
                        <tr key={f.nombre} className="hover:bg-[var(--surface-hover)]">
                          <td className="py-2 px-2 font-sans text-[var(--text-primary)] truncate max-w-[200px]">{f.nombre}</td>
                          <td className="py-2 px-2 text-right">{f.aulas}</td>
                          <td className="py-2 px-2 text-right" style={{ color: theme.dia1 }}>{f.dia1}</td>
                          <td className="py-2 px-2 text-right" style={{ color: theme.ojt }}>{f.ojt}</td>
                          <td className="py-2 px-2 text-right" style={{ color: theme.iop }}>{f.iop}</td>
                          <td className="py-2 px-2 text-right" style={{ color: theme.cyan }}>{fmtNum(f.iopFtes, 1)}</td>
                          <td className="py-2 px-2 text-right">{f.bajaCt}</td>
                          <td className="py-2 px-2 text-right">{f.bajaOjt}</td>
                          <td className="py-2 px-2 text-right">{f.pctEfectividad}%</td>
                          <td className="py-2 px-2 text-right">{f.pctDesercion}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <CardTitle className="text-xs uppercase tracking-wider">Alertas de caídas por formador</CardTitle>
                  <span className="text-[10px] font-mono text-[var(--text-muted)]">
                    {(model.alertasCaidas || []).length} formadores · clic para ver aulas
                  </span>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-[11px] text-[var(--text-muted)] mb-3">
                  Solo bajas de capacitación y OJT. Baja Día 1 y descuentos no impactan al formador. Semáforo deserción: verde &lt;38,4%, ámbar 38,4–40%, rojo &gt;40%.
                </p>
                <div className="overflow-x-auto max-h-[420px] custom-scrollbar">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="sticky top-0 bg-[var(--table-head-bg)] text-[10px] font-black uppercase text-[var(--text-muted)]">
                      <tr>
                        <th className="py-2 px-2">Formador</th>
                        <th className="py-2 px-2 text-right">Aulas</th>
                        <th className="py-2 px-2 text-right">D1</th>
                        <th className="py-2 px-2 text-right">Baja CT</th>
                        <th className="py-2 px-2 text-right">Baja OJT</th>
                        <th className="py-2 px-2 text-right">Caídas</th>
                        <th className="py-2 px-2 text-right">% Des.</th>
                        <th className="py-2 px-2">Estado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border-subtle)] font-mono">
                      {(model.alertasCaidas || []).map((f) => (
                        <tr
                          key={f.nombre}
                          onClick={() => setSelectedFormador(f.nombre === selectedFormador ? null : f.nombre)}
                          className={`cursor-pointer hover:bg-[var(--surface-hover)] ${selectedFormador === f.nombre ? 'bg-[var(--accent-soft)]' : ''}`}
                        >
                          <td className="py-2 px-2 font-sans text-[var(--text-primary)] truncate max-w-[220px]">{f.nombre}</td>
                          <td className="py-2 px-2 text-right">{f.aulas}</td>
                          <td className="py-2 px-2 text-right" style={{ color: theme.dia1 }}>{f.dia1}</td>
                          <td className="py-2 px-2 text-right">{f.bajaCt}</td>
                          <td className="py-2 px-2 text-right">{f.bajaOjt}</td>
                          <td className="py-2 px-2 text-right" style={{ color: theme.desercion }}>{f.desercion}</td>
                          <td className="py-2 px-2 text-right">{f.pctDesercion}%</td>
                          <td className="py-2 px-2"><SemaforoBadge value={f.semaforo} /></td>
                        </tr>
                      ))}
                      {!(model.alertasCaidas || []).length && (
                        <tr>
                          <td colSpan={8} className="py-6 text-center text-[var(--text-muted)]">Sin caídas de formación en el corte.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {selectedFormador && (
                  <div className="mt-4 rounded-xl border border-[var(--border-normal)] bg-[var(--bg-elevated)] p-3">
                    <p className="text-xs font-black text-[var(--accent)] mb-2">
                      Aulas de {selectedFormador}
                    </p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead className="text-[10px] uppercase text-[var(--text-muted)]">
                          <tr>
                            <th className="py-1 px-2 text-left">Grupo</th>
                            <th className="py-1 px-2 text-left">Campaña</th>
                            <th className="py-1 px-2 text-right">Sem</th>
                            <th className="py-1 px-2 text-right">D1</th>
                            <th className="py-1 px-2 text-right">Baja CT</th>
                            <th className="py-1 px-2 text-right">Baja OJT</th>
                            <th className="py-1 px-2 text-right">% Des.</th>
                            <th className="py-1 px-2">Estado</th>
                          </tr>
                        </thead>
                        <tbody className="font-mono">
                          {model.aulas.filter((a) => a.formador === selectedFormador && a.desercion > 0).map((a) => (
                            <tr key={a.key} className="border-t border-[var(--border-subtle)]">
                              <td className="py-1.5 px-2 text-[var(--accent)]">{a.grupo}</td>
                              <td className="py-1.5 px-2 font-sans truncate max-w-[180px]">{a.campana}</td>
                              <td className="py-1.5 px-2 text-right">{a.semana}</td>
                              <td className="py-1.5 px-2 text-right">{a.dia1}</td>
                              <td className="py-1.5 px-2 text-right">{a.bajaCt}</td>
                              <td className="py-1.5 px-2 text-right">{a.bajaOjt}</td>
                              <td className="py-1.5 px-2 text-right">{a.pctDesercion}%</td>
                              <td className="py-1.5 px-2"><SemaforoBadge value={a.semaforo} /></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </KpiThemeContext.Provider>
  )
}
