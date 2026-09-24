import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, memo } from 'react'
import {
  BarChart, Bar, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, Cell, LabelList,
} from 'recharts'
import {
  RefreshCw, RotateCcw, AlertTriangle, CheckCircle2, Download,
} from 'lucide-react'
import {
  fetchKpiReclutadoresConsolidado,
  fetchNominasAuditoria,
  refreshKpiReclutadores,
} from '../../lib/dataService'
import {
  buildAuditoriaMatrix,
  buildFilterOptions,
  buildKpiModel,
  currentOperativePeriodo,
  filterKpiRows,
  fmtNum,
  recentOperativePeriodos,
  resolveLockedRecruiter,
} from '../../lib/kpiReclutadoresAnalytics'
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
    rq: muted,
    nomina: cyan,
    dia0: violet,
    dia1: amber,
    iop: green,
    tope: accent,
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
    sync()
    const obs = new MutationObserver(sync)
    obs.observe(el, { attributes: true, attributeFilter: ['data-theme'] })
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

function MiniToggle({ checked, onChange, label }) {
  return (
    <label className="inline-flex items-center gap-1 text-[11px] text-[var(--text-muted)] cursor-pointer select-none hover:text-[var(--text-primary)]">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="size-3 rounded-sm accent-[var(--accent)]"
      />
      {label}
    </label>
  )
}

function shortName(name) {
  return String(name || '').trim().split(/\s+/).slice(0, 2).join(' ')
}

function ChartFrame({ title, caption, children, tall = false, auto = false }) {
  return (
    <div className="rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-5">
      <h3 className="text-[17px] font-semibold tracking-tight text-[var(--text-primary)] mb-3">{title}</h3>
      <div className={auto ? '' : tall ? 'h-[360px]' : 'h-[280px]'}>{children}</div>
      {caption && <p className="text-[11px] leading-relaxed text-[var(--text-muted)] mt-3">{caption}</p>}
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

function heatFill(dia1, max, theme) {
  if (max <= 0 || !dia1) {
    return { bg: theme.emptyCell, color: theme.muted }
  }
  const t = Math.max(0.12, Math.min(1, dia1 / max))
  return {
    bg: `rgba(${theme.heatRgb}, ${0.12 + t * 0.78})`,
    color: t > 0.5 ? theme.heatTextHot : theme.heatTextCold,
  }
}

function HeatmapGrid({ rows, weeks }) {
  const theme = useKpiTheme()
  const maxD1 = Math.max(1, ...rows.flatMap((row) => row.cells.map((cell) => cell.dia1 || 0)))
  return (
    <>
      <div className="overflow-x-auto">
        <div
          className="grid gap-1.5 min-w-[420px]"
          style={{ gridTemplateColumns: `minmax(108px, 1.1fr) repeat(${weeks.length}, minmax(64px, 1fr))` }}
        >
          <div />
          {weeks.map((w) => (
            <div key={w} className="text-center text-[11px] text-[var(--text-muted)] pb-1">Sem {w}</div>
          ))}
          {rows.map((row) => (
            <div key={row.segmento} className="contents">
              <div className="flex items-center text-[12px] text-[var(--text-secondary)] pr-2 truncate">
                {prettySegment(row.segmento)}
              </div>
              {row.cells.map((cell) => {
                if (cell.empty) {
                  return (
                    <div
                      key={cell.semana}
                      className="h-11 rounded-lg text-[12px] flex items-center justify-center text-[var(--text-muted)]"
                      style={{ background: theme.emptyCell }}
                    >
                      —
                    </div>
                  )
                }
                const tone = heatFill(cell.dia1, maxD1, theme)
                return (
                  <div
                    key={cell.semana}
                    className="h-11 rounded-lg flex flex-col items-center justify-center"
                    style={{ background: tone.bg, color: tone.color }}
                    title={`${prettySegment(row.segmento)} · Sem ${cell.semana} · Día 1 ${cell.dia1} · Nómina ${cell.nomina} · RQ ${cell.rq}`}
                  >
                    <span className="text-[13px] font-semibold leading-none">{cell.dia1}</span>
                    <span className="text-[10px] opacity-70 mt-0.5">pers.</span>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2 mt-3 text-[10px] text-[var(--text-muted)]">
        <span>Menos</span>
        <div className="flex gap-0.5">
          {[0.15, 0.35, 0.55, 0.75, 0.95].map((t) => (
            <span key={t} className="h-2 w-4 rounded-sm" style={{ background: `rgba(${theme.heatRgb}, ${t})` }} />
          ))}
        </div>
        <span>Más Día 1</span>
      </div>
    </>
  )
}

function labelDaySafe(iso) {
  const d = new Date(`${iso}T12:00:00`)
  if (Number.isNaN(d.getTime())) return iso
  const days = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
  return `${days[d.getDay()]} ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
}

function AuditoriaMatrix({ matrix }) {
  const theme = useKpiTheme()
  const columns = matrix?.columns || []
  const rows = matrix?.rows || []
  if (!rows.length) {
    return <p className="text-xs text-[var(--text-muted)] py-8 text-center">Sin nóminas diarias en el corte para auditar.</p>
  }
  const maxDay = Math.max(1, ...rows.flatMap((row) => columns.map((col) => Number(row.days?.[col.key] || 0))))
  return (
    <div className="overflow-auto max-h-[520px] custom-scrollbar">
      <table className="min-w-full border-collapse text-[11px]">
        <thead className="sticky top-0 z-10 bg-[var(--bg-surface)]">
          <tr>
            <th className="sticky left-0 z-20 bg-[var(--bg-surface)] text-left font-medium text-[var(--text-muted)] px-2 py-1 min-w-[120px]">Reclutador</th>
            <th className="text-left font-medium text-[var(--text-muted)] py-1 min-w-[88px]">Segmento</th>
            <th className="text-left font-medium text-[var(--text-muted)] py-1 min-w-[110px]">Campaña</th>
            <th className="text-left font-medium text-[var(--text-muted)] py-1 min-w-[88px]">Grupo</th>
            <th className="text-center font-medium text-[var(--text-muted)] py-1 min-w-[72px]">Inicio</th>
            <th className="text-center font-medium text-[var(--text-muted)] py-1 min-w-[40px]">Tot</th>
            {columns.map((col) => (
              <th key={col.key} className="text-center font-medium text-[var(--text-muted)] py-1 min-w-[40px]">{col.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="hover:bg-[var(--surface-hover)]">
              <td className="sticky left-0 z-10 bg-[var(--bg-surface)] px-2 py-0.5 truncate text-[12px] text-[var(--text-secondary)]" title={row.reclutador}>
                {shortName(row.reclutador)}
              </td>
              <td className="truncate text-[var(--text-secondary)] pr-1" title={row.segmento}>{prettySegment(row.segmento)}</td>
              <td className="truncate text-[var(--text-secondary)] pr-1" title={row.campana}>{row.campana}</td>
              <td className="font-mono text-[var(--accent)] truncate" title={row.grupo}>{row.grupo || '—'}</td>
              <td className="text-center font-mono text-[10px] text-[var(--text-muted)] whitespace-nowrap">
                {row.inicio ? row.inicio.slice(8, 10) + '/' + row.inicio.slice(5, 7) : '—'}
              </td>
              <td className="text-center font-mono font-semibold">{row.total}</td>
              {columns.map((col) => {
                const value = Number(row.days?.[col.key] || 0)
                const fecha = row.dayDates?.[col.key] || ''
                const empty = value === 0
                const tone = empty ? { bg: theme.emptyCell, color: theme.muted } : heatFill(value, maxDay, theme)
                return (
                  <td
                    key={`${row.key}-${col.key}`}
                    className="text-center font-mono font-semibold h-8"
                    style={{ background: tone.bg, color: tone.color }}
                    title={fecha ? `${row.reclutador} · ${row.grupo} · ${col.label} ${labelDaySafe(fecha)}: ${value} pers.` : `${row.reclutador} · ${row.grupo} · ${col.label}`}
                  >
                    {empty ? '—' : value}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ResultadosAulaMatrix({ groups, useTope = false }) {
  const theme = useKpiTheme()
  const data = (groups || []).flatMap((g) => {
    const people = (g.reclutadores || []).filter((r) => r.nombre)
    const source = people.length ? people : [{ nombre: 'Sin reclutador', rqIndividual: g.rq, nomina: g.nomina, dia0: g.dia0, dia1: g.dia1, dia1Tope: g.dia1Tope, iop: g.iop, iopTope: g.iopTope }]
    return source.map((r) => ({
      key: `${g.key}|${r.nombre}`,
      reclutador: r.nombre,
      campana: g.campana,
      grupo: g.grupo,
      rq: r.rqIndividual,
      nomina: r.nomina,
      dia0: r.dia0,
      dia1Show: useTope ? r.dia1Tope : r.dia1,
      iopShow: useTope ? r.iopTope : r.iop,
    }))
  }).sort((a, b) => a.reclutador.localeCompare(b.reclutador) || String(a.grupo || '').localeCompare(String(b.grupo || '')))

  if (!data.length) {
    return <p className="text-xs text-[var(--text-muted)] py-8 text-center">Sin resultados de reclutamiento en el corte.</p>
  }

  const tot = data.reduce((acc, row) => {
    acc.rq += numSafe(row.rq)
    acc.nomina += numSafe(row.nomina)
    acc.dia0 += numSafe(row.dia0)
    acc.dia1 += numSafe(row.dia1Show)
    acc.iop += numSafe(row.iopShow)
    return acc
  }, { rq: 0, nomina: 0, dia0: 0, dia1: 0, iop: 0 })

  return (
    <div className="overflow-auto max-h-[520px] custom-scrollbar">
      <table className="w-full text-left text-xs border-collapse">
        <thead className="sticky top-0 z-10 bg-[var(--table-head-bg)] text-[10px] font-black uppercase text-[var(--text-muted)]">
          <tr>
            <th className="py-2 px-2">Reclutador</th>
            <th className="py-2 px-2">Campaña</th>
            <th className="py-2 px-2">Grupo</th>
            <th className="py-2 px-2 text-right">RQ</th>
            <th className="py-2 px-2 text-right">Nómina</th>
            <th className="py-2 px-2 text-right">Día 0</th>
            <th className="py-2 px-2 text-right">Día 1</th>
            <th className="py-2 px-2 text-right">I-OP</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border-subtle)] font-mono">
          {data.map((row) => (
            <tr key={row.key} className="hover:bg-[var(--surface-hover)]">
              <td className="py-1.5 px-2 font-sans text-[var(--text-primary)] truncate max-w-[180px]" title={row.reclutador}>
                {shortName(row.reclutador)}
              </td>
              <td className="py-1.5 px-2 font-sans text-[var(--text-secondary)] truncate max-w-[160px]" title={row.campana}>
                {row.campana || '—'}
              </td>
              <td className="py-1.5 px-2 text-[var(--accent)] truncate" title={row.grupo}>
                {row.grupo || '—'}
              </td>
              <td className="py-1.5 px-2 text-right">{fmtNum(row.rq)}</td>
              <td className="py-1.5 px-2 text-right" style={{ color: theme.nomina }}>{fmtNum(row.nomina)}</td>
              <td className="py-1.5 px-2 text-right" style={{ color: theme.dia0 }}>{fmtNum(row.dia0)}</td>
              <td className="py-1.5 px-2 text-right" style={{ color: theme.dia1 }}>{fmtNum(row.dia1Show, useTope ? 1 : 0)}</td>
              <td className="py-1.5 px-2 text-right" style={{ color: theme.iop }}>{fmtNum(row.iopShow)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot className="sticky bottom-0 bg-[var(--bg-surface)] font-mono font-semibold">
          <tr>
            <td className="py-2 px-2 font-sans" colSpan={3}>{data.length} filas</td>
            <td className="py-2 px-2 text-right">{fmtNum(tot.rq)}</td>
            <td className="py-2 px-2 text-right" style={{ color: theme.nomina }}>{fmtNum(tot.nomina)}</td>
            <td className="py-2 px-2 text-right" style={{ color: theme.dia0 }}>{fmtNum(tot.dia0)}</td>
            <td className="py-2 px-2 text-right" style={{ color: theme.dia1 }}>{fmtNum(tot.dia1, useTope ? 1 : 0)}</td>
            <td className="py-2 px-2 text-right" style={{ color: theme.iop }}>{fmtNum(tot.iop)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

function RecruiterMatrix({ rows, useTope = false }) {
  const theme = useKpiTheme()
  const data = rows || []
  if (!data.length) {
    return <p className="text-xs text-[var(--text-muted)] py-8 text-center">Sin reclutadores en el corte.</p>
  }
  const totGrupos = data.reduce((acc, row) => acc + numSafe(row.grupos), 0)
  const totDot = data.reduce((acc, row) => acc + numSafe(row.iopShow), 0)
  const totDes = data.reduce((acc, row) => acc + numSafe(row.desercion), 0)
  const totD1 = data.reduce((acc, row) => acc + numSafe(row.d1Show), 0)
  const totPct = totD1 ? Math.round((totDes / totD1) * 1000) / 10 : 0

  return (
    <div className="overflow-x-auto max-h-[480px] custom-scrollbar">
      <table className="w-full text-left text-xs border-collapse">
        <thead className="sticky top-0 bg-[var(--table-head-bg)] text-[10px] font-black uppercase text-[var(--text-muted)]">
          <tr>
            <th className="py-2 px-2">Reclutador</th>
            <th className="py-2 px-2 text-right">Grupos</th>
            <th className="py-2 px-2 text-right">Dotación</th>
            <th className="py-2 px-2 text-right">Deserción</th>
            <th className="py-2 px-2 text-right">% Des.</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border-subtle)] font-mono">
          {data.map((row) => (
            <tr key={row.nombre} className="hover:bg-[var(--surface-hover)]">
              <td className="py-2 px-2 font-sans text-[var(--text-primary)] truncate max-w-[240px]" title={row.nombre}>
                {row.nombre}
              </td>
              <td className="py-2 px-2 text-right">{row.grupos}</td>
              <td className="py-2 px-2 text-right" style={{ color: theme.iop }}>{fmtNum(row.iopShow, useTope ? 1 : 0)}</td>
              <td className="py-2 px-2 text-right" style={{ color: theme.red }}>{fmtNum(row.desercion, useTope ? 1 : 0)}</td>
              <td className="py-2 px-2 text-right">{row.pctDesercion}%</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-[var(--border-normal)] font-mono font-semibold">
            <td className="py-2 px-2 font-sans">Total</td>
            <td className="py-2 px-2 text-right">{totGrupos}</td>
            <td className="py-2 px-2 text-right" style={{ color: theme.iop }}>{fmtNum(totDot, useTope ? 1 : 0)}</td>
            <td className="py-2 px-2 text-right" style={{ color: theme.red }}>{fmtNum(totDes, useTope ? 1 : 0)}</td>
            <td className="py-2 px-2 text-right">{totPct}%</td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

function numSafe(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function RankBarChart({ data, valueKey, nameKey = 'nombre', suffix = ' pers.', shorten = true }) {
  const theme = useKpiTheme()
  const rows = (data || []).map((row) => ({
    label: shorten ? shortName(row[nameKey]) : String(row[nameKey] || ''),
    full: row[nameKey],
    value: Number(row[valueKey] || 0),
  }))
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 56, left: 4, bottom: 4 }}>
        <XAxis type="number" hide />
        <YAxis
          type="category"
          dataKey="label"
          width={shorten ? 128 : 168}
          tick={{ fill: theme.tick, fontSize: 12 }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          cursor={{ fill: theme.cursor }}
          content={<ChartTooltipContent />}
          formatter={(value) => [`${value}${suffix}`, '']}
          labelFormatter={(_, payload) => payload?.[0]?.payload?.full}
        />
        <Bar dataKey="value" radius={[0, 7, 7, 0]} barSize={18} isAnimationActive={false}>
          {rows.map((row, i) => (
            <Cell key={row.full} fill={theme.palette[i % theme.palette.length]} />
          ))}
          <LabelList
            dataKey="value"
            position="right"
            formatter={(value) => `${value}${suffix}`}
            style={{ fill: theme.label, fontSize: 11, fontWeight: 600 }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

function SemaforoBadge({ value }) {
  const theme = useKpiTheme()
  const map = {
    VERDE: theme.isLight
      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
      : 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    AMBAR: theme.isLight
      ? 'bg-amber-50 text-amber-700 border-amber-200'
      : 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    ROJO: theme.isLight
      ? 'bg-rose-50 text-rose-700 border-rose-200'
      : 'bg-rose-500/15 text-rose-400 border-rose-500/30',
    CRITICO: 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] border-[var(--border-normal)]',
  }
  const label = {
    VERDE: 'CUBIERTO',
    AMBAR: 'EN RIESGO',
    ROJO: 'HUECO',
    CRITICO: 'SIN NÓMINA',
  }
  return (
    <span className={`px-2 py-0.5 rounded text-[10px] font-black border ${map[value] || map.CRITICO}`}>
      {label[value] || value}
    </span>
  )
}

function KpiTile({ label, value, sub, tone = 'cyan' }) {
  const theme = useKpiTheme()
  const color = {
    cyan: theme.cyan,
    emerald: theme.green,
    amber: theme.amber,
    indigo: theme.violet,
    rose: theme.red,
  }[tone] || theme.accent
  return (
    <div
      className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 min-w-0 flex-1"
      style={{ borderLeft: `3px solid ${color}` }}
    >
      <p className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)]">{label}</p>
      <p className="text-2xl font-black font-mono mt-1" style={{ color }}>{value}</p>
      {sub && <p className="text-[10px] text-[var(--text-muted)] mt-1 font-medium">{sub}</p>}
    </div>
  )
}

function FlowArrow() {
  return (
    <div className="hidden md:flex items-center justify-center shrink-0 w-6 text-[var(--text-muted)]" aria-hidden>
      <span className="text-lg leading-none">→</span>
    </div>
  )
}

function KpiReclutadoresDashboard({ userProfile = null }) {
  const userRole = String(userProfile?.rol || userProfile?.role || '').toLowerCase()
  const isLocked = userRole === 'reclutador'
  const canSeeRanking = [
    'admin',
    'jefe_rys',
    'coordinador_rys',
    'supervisor_capacitacion',
    'jefe_capacitacion',
  ].includes(userRole)

  const [rows, setRows] = useState([])
  const [nominas, setNominas] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [refreshing, setRefreshing] = useState(false)
  const [updatedAt, setUpdatedAt] = useState(null)

  const [periodo, setPeriodo] = useState(() => currentOperativePeriodo())
  const [semana, setSemana] = useState('ALL')
  const [segmento, setSegmento] = useState('ALL')
  const [campana, setCampana] = useState('ALL')
  const [grupo, setGrupo] = useState('ALL')
  const [responsable, setResponsable] = useState('ALL')
  const [useTope, setUseTope] = useState(false)
  const [includeEmptyGroups, setIncludeEmptyGroups] = useState(false)
  const [selectedGrupo, setSelectedGrupo] = useState(null)
  const [vista, setVista] = useState('resumen')
  const theme = useAppPresentation()

  const hasLoadedRef = useRef(false)
  const loadRows = useCallback(async () => {
    setError(null)
    if (!hasLoadedRef.current) setLoading(true)
    else setRefreshing(true)
    try {
      const [data, nominaRows] = await Promise.all([
        fetchKpiReclutadoresConsolidado({ periodo }),
        fetchNominasAuditoria({ periodo }).catch(() => []),
      ])
      const nextRows = data || []
      setRows(nextRows)
      setNominas(nominaRows || [])
      const stamp = nextRows.reduce((acc, row) => {
        if (!row.updated_at) return acc
        return !acc || row.updated_at > acc ? row.updated_at : acc
      }, null)
      setUpdatedAt(stamp)
      hasLoadedRef.current = true
      if (periodo === currentOperativePeriodo() && nextRows.length === 0) {
        const prevPeriod = recentOperativePeriodos(2)[1]
        if (prevPeriod && prevPeriod !== periodo) setPeriodo(prevPeriod)
      }
    } catch (err) {
      setError(err?.message || 'No se pudo cargar kpi_reclutadores_consolidado')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [periodo])

  useEffect(() => {
    loadRows()
  }, [loadRows])

  const lockedName = useMemo(
    () => (isLocked ? resolveLockedRecruiter(rows, userProfile) : null),
    [isLocked, rows, userProfile]
  )

  const effectiveResponsable = isLocked ? (lockedName || '__SIN_PERFIL__') : responsable

  useEffect(() => {
    if (!canSeeRanking && vista !== 'resumen') setVista('resumen')
  }, [canSeeRanking, vista])

  const cascadeRows = useMemo(() => {
    return filterKpiRows(rows, {
      periodo,
      semana,
      segmento,
      campana,
      grupo: 'ALL',
      responsable: effectiveResponsable,
      includeEmptyGroups: true,
    })
  }, [rows, periodo, semana, segmento, campana, effectiveResponsable])

  const options = useMemo(() => {
    const base = filterKpiRows(rows, {
      periodo,
      semana: 'ALL',
      segmento: 'ALL',
      campana: 'ALL',
      grupo: 'ALL',
      responsable: effectiveResponsable,
      includeEmptyGroups: true,
    })
    const byPeriodo = filterKpiRows(base, { periodo, includeEmptyGroups: true, responsable: effectiveResponsable })
    const bySeg = filterKpiRows(byPeriodo, { periodo, segmento, includeEmptyGroups: true, responsable: effectiveResponsable })
    const byCamp = filterKpiRows(bySeg, { periodo, segmento, campana, includeEmptyGroups: true, responsable: effectiveResponsable })
    return {
      all: buildFilterOptions(rows),
      semanas: buildFilterOptions(byPeriodo).semanas,
      segmentos: buildFilterOptions(byPeriodo).segmentos,
      campanas: buildFilterOptions(bySeg).campanas,
      grupos: buildFilterOptions(byCamp).grupos,
      responsables: buildFilterOptions(rows).responsables,
    }
  }, [rows, periodo, segmento, campana, effectiveResponsable])

  const filtered = useMemo(() => {
    return filterKpiRows(rows, {
      periodo,
      semana,
      segmento,
      campana,
      grupo,
      responsable: effectiveResponsable,
      includeEmptyGroups,
    })
  }, [rows, periodo, semana, segmento, campana, grupo, effectiveResponsable, includeEmptyGroups])

  const model = useMemo(
    () => buildKpiModel(filtered, {
      useTope,
      singleRecruiter: effectiveResponsable !== 'ALL',
    }),
    [filtered, useTope, effectiveResponsable]
  )

  const auditoria = useMemo(
    () => buildAuditoriaMatrix(nominas, filtered, {
      lockedName: isLocked ? effectiveResponsable : (effectiveResponsable !== 'ALL' ? effectiveResponsable : null),
    }),
    [nominas, filtered, isLocked, effectiveResponsable]
  )

  const activeFilters = [
    periodo !== 'ALL',
    semana !== 'ALL',
    segmento !== 'ALL',
    campana !== 'ALL',
    grupo !== 'ALL',
    !isLocked && responsable !== 'ALL',
    useTope,
    includeEmptyGroups,
  ].filter(Boolean).length

  const periodoOptions = useMemo(() => {
    const seeded = recentOperativePeriodos(4)
    const fromData = options.all.periodos || []
    return Array.from(new Set([...seeded, ...fromData])).sort((a, b) => b.localeCompare(a))
  }, [options.all.periodos])

  const resetFilters = () => {
    setPeriodo(currentOperativePeriodo())
    setSemana('ALL')
    setSegmento('ALL')
    setCampana('ALL')
    setGrupo('ALL')
    if (!isLocked) setResponsable('ALL')
    setUseTope(false)
    setIncludeEmptyGroups(false)
    setSelectedGrupo(null)
  }

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      await refreshKpiReclutadores(31)
      await loadRows()
    } catch (err) {
      setError(err?.message || 'No se pudo refrescar el consolidado')
    } finally {
      setRefreshing(false)
    }
  }

  const exportCsv = () => {
    const headers = [
      'periodo_ingreso', 'periodo_capa', 'semana', 'segmento', 'campana', 'grupo', 'responsable',
      'rq', 'rq_individual', 'nomina', 'dia_0', 'dia_1', 'dia_1_tope',
      'dotacion_q', 'dotacion_q_tope', 'dotacion_ftes', 'n_reclutadores',
    ]
    const lines = [headers.join(';')]
    filtered.forEach((row) => {
      lines.push([
        row.periodo_efectivo || row.periodo_reclutado, row.periodo_reclutado, row.semana, row.segmento, row.campana, row.grupo_g, row.responsable,
        row.rq, row.rq_individual, row.nomina, row.dia_0, row.dia_1, row.dia_1_tope,
        row.dotacion_q, row.dotacion_q_tope, row.dotacion_ftes, row.n_reclutadores,
      ].join(';'))
    })
    const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'kpi-reclutadores-consolidado.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const selectedAlert = selectedGrupo
    ? model.alerts.find((g) => g.key === selectedGrupo)
    : null

  if (loading) {
    return (
      <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-10 text-center text-[var(--text-muted)]">
        Cargando tablero desde kpi_reclutadores_consolidado…
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-6 text-sm text-rose-200 space-y-3">
        <p className="font-bold">No se pudo armar el KPI de reclutadores.</p>
        <p className="text-rose-300/80">{error}</p>
        <button
          type="button"
          onClick={loadRows}
          className="px-3 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-bold cursor-pointer"
        >
          Reintentar
        </button>
      </div>
    )
  }

  const t = model.totals

  return (
    <KpiThemeContext.Provider value={theme}>
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-1">
        <MiniSelect value={periodo} onChange={(e) => { setPeriodo(e.target.value); setGrupo('ALL') }}>
          <option value="ALL" className={OPTION_CLASS}>Todos los periodos (más lento)</option>
          {periodoOptions.map((p) => <option key={p} value={p} className={OPTION_CLASS}>{p}</option>)}
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
          <MiniSelect value={responsable} onChange={(e) => setResponsable(e.target.value)} wide>
            <option value="ALL" className={OPTION_CLASS}>Reclutador</option>
            {options.responsables.map((r) => <option key={r} value={r} className={OPTION_CLASS}>{r}</option>)}
          </MiniSelect>
        )}

        <span className="hidden sm:block h-4 w-px bg-[var(--border-normal)]" />

        <MiniToggle checked={useTope} onChange={(e) => setUseTope(e.target.checked)} label="Tope" />
        {!isLocked && (
          <MiniToggle checked={includeEmptyGroups} onChange={(e) => setIncludeEmptyGroups(e.target.checked)} label="Sin nómina" />
        )}

        <span className="ml-auto flex items-center gap-1">
          {activeFilters > 0 && (
            <button
              type="button"
              onClick={resetFilters}
              title="Limpiar filtros"
              className="h-7 px-1.5 inline-flex items-center gap-1 text-[11px] text-[var(--text-muted)] hover:text-[var(--neon-red)] cursor-pointer"
            >
              <RotateCcw size={11} />
              {activeFilters}
            </button>
          )}
          <button
            type="button"
            onClick={exportCsv}
            title="Exportar CSV"
            className="size-7 inline-flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
          >
            <Download size={13} />
          </button>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            title={refreshing ? 'Recalculando' : (updatedAt ? `Recalcular · ${String(updatedAt).replace('T', ' ').slice(0, 16)}` : 'Recalcular')}
            className="size-7 inline-flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer disabled:opacity-40"
          >
            <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
          </button>
        </span>
      </div>

      {canSeeRanking && (
      <div className="flex items-center gap-1 px-1">
        {[
          { id: 'resumen', label: 'Resumen' },
          { id: 'ranking', label: 'Ranking' },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setVista(tab.id)}
            className={`h-7 px-2.5 rounded-md text-[11px] font-medium cursor-pointer ${
              vista === tab.id
                ? 'bg-[var(--accent-soft)] text-[var(--accent)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      )}

      {vista === 'resumen' && (
        <>
          <div className="flex flex-col md:flex-row md:items-stretch gap-2">
            <KpiTile
              label="1. Nómina"
              value={fmtNum(t.nomina)}
              sub={isLocked ? 'Personas que trajo' : 'Personas en nómina'}
              tone="indigo"
            />
            <FlowArrow />
            <KpiTile
              label="2. Día 0"
              value={fmtNum(t.dia0)}
              sub={`${t.pctD0Nomina}% de la nómina`}
              tone="indigo"
            />
            <FlowArrow />
            <KpiTile
              label="3. Día 1"
              value={fmtNum(useTope ? t.dia1Tope : t.dia1, useTope ? 1 : 0)}
              sub={`${t.pctD1D0}% del Día 0`}
              tone="amber"
            />
            <FlowArrow />
            <KpiTile
              label="4. Operación"
              value={fmtNum(useTope ? t.iopTope : t.iop, useTope ? 1 : 0)}
              sub={`${t.pctOpD1}% del Día 1 · ${fmtNum(t.iopFtes, 1)} FTE`}
              tone="emerald"
            />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <ChartFrame
              tall
              title="Dónde se cae la gente"
              caption="La primera barra es la nómina. Las del medio son quienes no pasaron de etapa. La última es quien llegó a operación."
            >
              <RankBarChart data={model.fuga} valueKey="d1Show" shorten={false} />
            </ChartFrame>

            <ChartFrame
              tall
              title="Evolución semanal"
              caption="Eje X: semana operativa. Eje Y: personas. Solo nómina, Día 0 y Día 1."
            >
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={model.weekly} margin={{ top: 16, right: 16, left: 4, bottom: 8 }}>
                  <defs>
                    <linearGradient id="kpiAreaNomina" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={theme.nomina} stopOpacity={0.42} />
                      <stop offset="100%" stopColor={theme.nomina} stopOpacity={0.04} />
                    </linearGradient>
                    <linearGradient id="kpiAreaDia0" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={theme.dia0} stopOpacity={0.42} />
                      <stop offset="100%" stopColor={theme.dia0} stopOpacity={0.04} />
                    </linearGradient>
                    <linearGradient id="kpiAreaDia1" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={theme.dia1} stopOpacity={0.42} />
                      <stop offset="100%" stopColor={theme.dia1} stopOpacity={0.04} />
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
                  <Area type="linear" dataKey="nomina" name="Nómina" stroke={theme.nomina} fill="url(#kpiAreaNomina)" strokeWidth={2.2} dot={{ r: 3, fill: theme.nomina }} isAnimationActive={false} />
                  <Area type="linear" dataKey="dia0" name="Día 0" stroke={theme.dia0} fill="url(#kpiAreaDia0)" strokeWidth={2.2} dot={{ r: 3, fill: theme.dia0 }} isAnimationActive={false} />
                  <Area type="linear" dataKey="dia1" name="Día 1" stroke={theme.dia1} fill="url(#kpiAreaDia1)" strokeWidth={2.2} dot={{ r: 3, fill: theme.dia1 }} isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </ChartFrame>
          </div>

          <ChartFrame
            auto
            title="Auditoría diaria de nómina"
            caption="D1 es el primer día que ese reclutador cargó nómina en ese grupo. D2, D3… son los siguientes días en que sí trajo gente. El cursor muestra la fecha real."
          >
            <AuditoriaMatrix matrix={auditoria} />
          </ChartFrame>

          <ChartFrame
            auto
            title="Matriz de resultados"
            caption="Una fila por reclutador y grupo. RQ individual, nómina, Día 0, Día 1 e ingreso a operación del corte."
          >
            <ResultadosAulaMatrix groups={model.groups} useTope={useTope} />
          </ChartFrame>
        </>
      )}

      {canSeeRanking && vista === 'ranking' && (
        <>
        <ChartFrame
          tall
          title="Top reclutadores"
          caption="Eje X: personas que llegaron a Día 1. Eje Y: reclutador. Ranking del filtro actual, sin ADMIN."
        >
          <RankBarChart data={model.recruiters.slice(0, 8)} valueKey="d1Show" />
        </ChartFrame>

        <ChartFrame
          auto
          title="Matriz por reclutador"
          caption="Dotación = ingreso a operación. Deserción = Día 1 que no llegó a operación. Grupos = aulas del corte en las que reclutó."
        >
          <RecruiterMatrix rows={model.recruiters} useTope={useTope} />
        </ChartFrame>

        <ChartFrame
          auto
          title="Semana × segmento"
          caption="Eje X: semana. Eje Y: segmento. El número es Día 1 (mismas personas que el ranking). El ámbar es más intenso si hubo más Día 1."
        >
          <HeatmapGrid rows={model.heatmap} weeks={model.weeks} />
        </ChartFrame>

          <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="text-xs uppercase tracking-wider flex items-center gap-2">
              <AlertTriangle size={14} className="text-amber-400" />
              Alerta por grupo
            </CardTitle>
            <span className="text-[10px] font-mono text-[var(--text-muted)]">
              {model.alerts.length} grupos{isLocked ? '' : ' · clic para ver reclutadores'}
            </span>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto max-h-[380px] custom-scrollbar">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="sticky top-0 bg-[var(--table-head-bg)] text-[10px] font-black uppercase text-[var(--text-muted)]">
                <tr>
                  <th className="py-2 px-2">Grupo</th>
                  <th className="py-2 px-2">Campaña</th>
                  <th className="py-2 px-2">Sem</th>
                  <th className="py-2 px-2 text-right">RQ</th>
                  {!isLocked && <th className="py-2 px-2 text-right">N</th>}
                  <th className="py-2 px-2 text-right">Nómina</th>
                  <th className="py-2 px-2 text-right">D1</th>
                  <th className="py-2 px-2 text-right">OP</th>
                  <th className="py-2 px-2 text-right">% D1/RQ</th>
                  <th className="py-2 px-2">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)] font-mono">
                {model.alerts.map((g) => (
                  <tr
                    key={g.key}
                    onClick={() => { if (!isLocked) setSelectedGrupo(g.key === selectedGrupo ? null : g.key) }}
                    className={`${isLocked ? '' : 'cursor-pointer hover:bg-[var(--surface-hover)]'} ${selectedGrupo === g.key ? 'bg-[var(--accent-soft)]' : ''}`}
                  >
                    <td className="py-2 px-2 text-[var(--accent)]">{g.grupo}</td>
                    <td className="py-2 px-2 font-sans text-[var(--text-primary)] truncate max-w-[180px]">{g.campana}</td>
                    <td className="py-2 px-2">{g.semana}</td>
                    <td className="py-2 px-2 text-right">{fmtNum(g.rq, 1)}</td>
                    {!isLocked && <td className="py-2 px-2 text-right">{g.nReclutadores}</td>}
                    <td className="py-2 px-2 text-right" style={{ color: theme.nomina }}>{g.nomina}</td>
                    <td className="py-2 px-2 text-right" style={{ color: theme.dia1 }}>{fmtNum(g.d1Show, useTope ? 1 : 0)}</td>
                    <td className="py-2 px-2 text-right" style={{ color: theme.iop }}>{fmtNum(g.iopShow, useTope ? 1 : 0)}</td>
                    <td className="py-2 px-2 text-right">{g.pctD1Rq}%</td>
                    <td className="py-2 px-2"><SemaforoBadge value={g.semaforo} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {!isLocked && selectedAlert && (
            <div className="mt-4 rounded-xl border border-[var(--border-normal)] bg-[var(--bg-elevated)] p-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-black text-[var(--accent)]">
                  {selectedAlert.grupo} · {selectedAlert.campana} · Sem {selectedAlert.semana}
                </p>
                <span className="text-[10px] text-[var(--text-muted)]">{selectedAlert.reclutadores.length} reclutadores</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="text-[10px] uppercase text-[var(--text-muted)]">
                    <tr>
                      <th className="py-1 px-2 text-left">Reclutador</th>
                      <th className="py-1 px-2 text-right">RQ part.</th>
                      <th className="py-1 px-2 text-right">Nómina</th>
                      <th className="py-1 px-2 text-right">D0</th>
                      <th className="py-1 px-2 text-right">D1</th>
                      <th className="py-1 px-2 text-right">OP</th>
                    </tr>
                  </thead>
                  <tbody className="font-mono">
                    {selectedAlert.reclutadores.map((rec) => (
                      <tr key={rec.nombre} className="border-t border-[var(--border-subtle)]">
                        <td className="py-1.5 px-2 font-sans text-[var(--text-primary)]">{rec.nombre}</td>
                        <td className="py-1.5 px-2 text-right">{fmtNum(rec.rqIndividual, 2)}</td>
                        <td className="py-1.5 px-2 text-right">{rec.nomina}</td>
                        <td className="py-1.5 px-2 text-right">{rec.dia0}</td>
                        <td className="py-1.5 px-2 text-right">{useTope ? fmtNum(rec.dia1Tope, 2) : rec.dia1}</td>
                        <td className="py-1.5 px-2 text-right">{useTope ? fmtNum(rec.iopTope, 2) : rec.iop}</td>
                      </tr>
                    ))}
                    {selectedAlert.reclutadores.length === 0 && (
                      <tr>
                        <td colSpan={6} className="py-4 text-center text-[var(--text-muted)]">Este grupo no tiene nómina cargada.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
        </>
      )}

      <div className="flex items-center gap-2 text-[10px] text-[var(--text-muted)]">
        <CheckCircle2 size={12} style={{ color: theme.iop }} />
        {fmtNum(t.grupos)} grupos · {isLocked ? `${fmtNum(t.nomina)} en tu nómina` : `${fmtNum(t.reclutadores)} reclutadores · ${fmtNum(t.nomina)} en nómina`}
        {cascadeRows.length !== filtered.length ? ` · ${filtered.length} filas visibles` : ''}
      </div>
    </div>
    </KpiThemeContext.Provider>
  )
}

export default memo(KpiReclutadoresDashboard)
