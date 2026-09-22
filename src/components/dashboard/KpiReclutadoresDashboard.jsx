import { createContext, useCallback, useContext, useEffect, useMemo, useState, memo } from 'react'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, ScatterChart, Scatter, ZAxis, Cell, LabelList,
} from 'recharts'
import {
  RefreshCw, RotateCcw, AlertTriangle, CheckCircle2, Download,
} from 'lucide-react'
import {
  fetchKpiReclutadoresConsolidado,
  refreshKpiReclutadores,
} from '../../lib/dataService'
import {
  buildFilterOptions,
  buildKpiModel,
  filterKpiRows,
  fmtNum,
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
      className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4"
      style={{ borderLeft: `3px solid ${color}` }}
    >
      <p className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)]">{label}</p>
      <p className="text-2xl font-black font-mono mt-1" style={{ color }}>{value}</p>
      {sub && <p className="text-[10px] text-[var(--text-muted)] mt-1 font-medium">{sub}</p>}
    </div>
  )
}

function KpiReclutadoresDashboard({ userProfile = null }) {
  const userRole = String(userProfile?.role || '').toLowerCase()
  const isLocked = userRole === 'reclutador'

  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [refreshing, setRefreshing] = useState(false)
  const [updatedAt, setUpdatedAt] = useState(null)

  const [periodo, setPeriodo] = useState('ALL')
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

  const loadRows = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchKpiReclutadoresConsolidado()
      setRows(data || [])
      const stamp = (data || []).reduce((acc, row) => {
        if (!row.updated_at) return acc
        return !acc || row.updated_at > acc ? row.updated_at : acc
      }, null)
      setUpdatedAt(stamp)
    } catch (err) {
      setError(err?.message || 'No se pudo cargar kpi_reclutadores_consolidado')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadRows()
  }, [loadRows])

  const lockedName = useMemo(
    () => (isLocked ? resolveLockedRecruiter(rows, userProfile) : null),
    [isLocked, rows, userProfile]
  )

  const effectiveResponsable = lockedName || responsable

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

  const resetFilters = () => {
    setPeriodo('ALL')
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
      await refreshKpiReclutadores(36)
      await loadRows()
    } catch (err) {
      setError(err?.message || 'No se pudo refrescar el consolidado')
    } finally {
      setRefreshing(false)
    }
  }

  const exportCsv = () => {
    const headers = [
      'periodo', 'semana', 'segmento', 'campana', 'grupo', 'responsable',
      'rq', 'rq_individual', 'nomina', 'dia_0', 'dia_1', 'dia_1_tope',
      'dotacion_q', 'dotacion_q_tope', 'dotacion_ftes', 'n_reclutadores',
    ]
    const lines = [headers.join(';')]
    filtered.forEach((row) => {
      lines.push([
        row.periodo_reclutado, row.semana, row.segmento, row.campana, row.grupo_g, row.responsable,
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
          <option value="ALL" className={OPTION_CLASS}>Periodo</option>
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
          <MiniSelect value={responsable} onChange={(e) => setResponsable(e.target.value)} wide>
            <option value="ALL" className={OPTION_CLASS}>Reclutador</option>
            {options.responsables.map((r) => <option key={r} value={r} className={OPTION_CLASS}>{r}</option>)}
          </MiniSelect>
        )}

        <span className="hidden sm:block h-4 w-px bg-[var(--border-normal)]" />

        <MiniToggle checked={useTope} onChange={(e) => setUseTope(e.target.checked)} label="Tope" />
        <MiniToggle checked={includeEmptyGroups} onChange={(e) => setIncludeEmptyGroups(e.target.checked)} label="Sin nómina" />

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

      <div className="flex items-center gap-1 px-1">
        {[
          { id: 'resumen', label: 'Resumen' },
          { id: 'reclutadores', label: 'Reclutadores' },
          { id: 'segmentos', label: 'Segmentos' },
          { id: 'alertas', label: 'Alertas' },
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

      {vista === 'resumen' && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
            <KpiTile
              label="Día 1 vs RQ"
              value={`${fmtNum(t.d1Show, useTope ? 1 : 0)} / ${fmtNum(t.rq, 1)}`}
              sub={`${t.pctD1Rq}% del pedido${useTope ? ' (tope)' : ''}`}
              tone={t.pctD1Rq >= 80 ? 'emerald' : t.pctD1Rq >= 50 ? 'amber' : 'rose'}
            />
            <KpiTile
              label="OP Q vs RQ"
              value={`${fmtNum(t.iopShow, useTope ? 1 : 0)} / ${fmtNum(t.rq, 1)}`}
              sub={`${t.pctOpRq}% ingreso a operación`}
              tone="emerald"
            />
            <KpiTile
              label="Nómina → Día 1"
              value={`${t.pctNominaD1}%`}
              sub={`${fmtNum(t.dia1)} de ${fmtNum(t.nomina)} citados`}
              tone="cyan"
            />
            <KpiTile
              label="Día 1 → OP"
              value={`${t.pctOpD1}%`}
              sub={`${fmtNum(t.iop)} ingresos · ${fmtNum(t.iopFtes, 1)} FTEs`}
              tone="indigo"
            />
            <KpiTile
              label={useTope ? 'Día 1 con tope' : 'Día 1 sin tope'}
              value={fmtNum(useTope ? t.dia1Tope : t.dia1, useTope ? 1 : 0)}
              sub={useTope ? `Real ${fmtNum(t.dia1)} · tope ${fmtNum(t.dia1Tope, 1)}` : `Tope ${fmtNum(t.dia1Tope, 1)}`}
              tone="amber"
            />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <ChartFrame
              tall
              title="Embudo global de conversión"
              caption="Eje X: personas. Eje Y: etapa. Porcentaje vs la etapa anterior al pasar el cursor."
            >
              <RankBarChart
                data={model.funnel.map((step) => ({ nombre: step.etapa.replace(/^\d+\.\s*/, ''), d1Show: step.value }))}
                valueKey="d1Show"
              />
            </ChartFrame>

            <ChartFrame
              tall
              title="Evolución semanal"
              caption="Eje X: semana operativa. Eje Y: personas. RQ es el pedido grupal del corte."
            >
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={model.weekly} margin={{ top: 16, right: 16, left: 4, bottom: 8 }}>
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
                  <Line type="linear" dataKey="rq" name="RQ" stroke={theme.rq} strokeWidth={2} dot={false} isAnimationActive={false} />
                  <Line type="linear" dataKey="nomina" name="Nómina" stroke={theme.nomina} strokeWidth={2.2} dot={{ r: 3 }} isAnimationActive={false} />
                  <Line type="linear" dataKey="dia1" name="Día 1" stroke={theme.dia1} strokeWidth={2.2} dot={{ r: 3 }} isAnimationActive={false} />
                  <Line type="linear" dataKey="iop" name="Ingreso OP" stroke={theme.iop} strokeWidth={2.2} dot={{ r: 3 }} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </ChartFrame>
          </div>
        </>
      )}

      {vista === 'reclutadores' && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <ChartFrame
            tall
            title="Top reclutadores del corte"
            caption="Eje X: personas que llegaron a Día 1. Eje Y: reclutador. Ranking del filtro actual, sin ADMIN."
          >
            <RankBarChart data={model.recruiters.slice(0, 8)} valueKey="d1Show" />
          </ChartFrame>

          <ChartFrame
            tall
            title="Eficiencia vs cobertura"
            caption="Eje X: % Día 1 / RQ. Eje Y: % Nómina → Día 1. Tamaño = nómina. Derecha cubre pedido; arriba la lista llega."
          >
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 12, right: 12, bottom: 8, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={theme.grid} />
                <XAxis type="number" dataKey="pctD1Rq" name="% D1/RQ" unit="%" stroke={theme.tick} fontSize={12} tickLine={false} axisLine={false} />
                <YAxis type="number" dataKey="pctNominaD1" name="% Nómina→D1" unit="%" stroke={theme.tick} fontSize={12} tickLine={false} axisLine={false} />
                <ZAxis type="number" dataKey="nomina" range={[40, 220]} />
                <Tooltip content={<ChartTooltipContent />} />
                <Scatter data={model.recruiters} fill={theme.nomina} name="Reclutador">
                  {model.recruiters.map((rec) => (
                    <Cell key={rec.nombre} fill={rec.pctD1Rq >= 80 ? theme.iop : rec.pctD1Rq >= 50 ? theme.dia1 : theme.red} />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </ChartFrame>

          {model.topeCompare.length > 0 && (
            <div className="xl:col-span-2">
              <ChartFrame
                title="Día 1 real vs tope"
                caption="Eje X: reclutador. Eje Y: personas. Si la barra gris se aleja de la azul, hay sobrecumplimiento que el tope no cuenta."
              >
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={model.topeCompare} margin={{ top: 12, right: 12, left: 0, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={theme.grid} vertical={false} />
                    <XAxis dataKey="nombre" stroke={theme.tick} fontSize={11} tickLine={false} axisLine={false} interval={0} />
                    <YAxis stroke={theme.tick} fontSize={12} tickLine={false} axisLine={false} />
                    <Tooltip content={<ChartTooltipContent />} />
                    <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                    <Bar dataKey="real" name="Día 1 real" fill={theme.rq} radius={[5, 5, 0, 0]} maxBarSize={22} />
                    <Bar dataKey="tope" name="Día 1 tope" fill={theme.tope} radius={[5, 5, 0, 0]} maxBarSize={22} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartFrame>
            </div>
          )}
        </div>
      )}

      {vista === 'segmentos' && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <ChartFrame
            tall
            title="Día 1 por segmento"
            caption="Eje X: personas en Día 1. Eje Y: segmento del corte filtrado."
          >
            <RankBarChart
              data={model.segments.map((s) => ({ nombre: prettySegment(s.segmento), d1Show: s.dia1 }))}
              valueKey="d1Show"
            />
          </ChartFrame>

          <ChartFrame
            tall
            title="Segmento: RQ, Día 1 e ingreso OP"
            caption="Eje X: segmento. Eje Y: personas. RQ es el pedido del grupo. Retenciones puede tener más OP que Día 1."
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={model.segments} margin={{ top: 12, right: 12, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={theme.grid} vertical={false} />
                <XAxis dataKey="segmento" stroke={theme.tick} fontSize={11} tickLine={false} axisLine={false} interval={0} />
                <YAxis stroke={theme.tick} fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip content={<ChartTooltipContent />} />
                <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                <Bar dataKey="rq" name="RQ" fill={theme.rq} radius={[5, 5, 0, 0]} maxBarSize={26} />
                <Bar dataKey="dia1" name="Día 1" fill={theme.dia1} radius={[5, 5, 0, 0]} maxBarSize={26} />
                <Bar dataKey="iop" name="Ingreso OP" fill={theme.iop} radius={[5, 5, 0, 0]} maxBarSize={26} />
              </BarChart>
            </ResponsiveContainer>
          </ChartFrame>

          <div className="xl:col-span-2">
            <ChartFrame
              auto
              title="Semana × segmento"
              caption="Eje X: semana. Eje Y: segmento. El número es Día 1 (mismas personas que el ranking). El ámbar es más intenso si hubo más Día 1."
            >
              <HeatmapGrid rows={model.heatmap} weeks={model.weeks} />
            </ChartFrame>
          </div>
        </div>
      )}

      {vista === 'alertas' && (
        <>
          <ChartFrame
            tall
            title="Dónde se cae la gente"
            caption="Misma lista, de arriba hacia abajo. La primera barra es la partida. Las del medio son bajas. La última es quien sí llegó a operación. Todas miden personas, con el mismo ancho."
          >
            <RankBarChart data={model.fuga} valueKey="d1Show" shorten={false} />
          </ChartFrame>

          <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="text-xs uppercase tracking-wider flex items-center gap-2">
              <AlertTriangle size={14} className="text-amber-400" />
              Alerta por grupo
            </CardTitle>
            <span className="text-[10px] font-mono text-[var(--text-muted)]">
              {model.alerts.length} grupos · clic para ver reclutadores
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
                  <th className="py-2 px-2 text-right">N</th>
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
                    onClick={() => setSelectedGrupo(g.key === selectedGrupo ? null : g.key)}
                    className={`cursor-pointer hover:bg-[var(--surface-hover)] ${selectedGrupo === g.key ? 'bg-[var(--accent-soft)]' : ''}`}
                  >
                    <td className="py-2 px-2 text-[var(--accent)]">{g.grupo}</td>
                    <td className="py-2 px-2 font-sans text-[var(--text-primary)] truncate max-w-[180px]">{g.campana}</td>
                    <td className="py-2 px-2">{g.semana}</td>
                    <td className="py-2 px-2 text-right">{fmtNum(g.rq, 1)}</td>
                    <td className="py-2 px-2 text-right">{g.nReclutadores}</td>
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

          {selectedAlert && (
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
        {fmtNum(t.grupos)} grupos · {fmtNum(t.reclutadores)} reclutadores · {fmtNum(t.nomina)} en nómina
        {cascadeRows.length !== filtered.length ? ` · ${filtered.length} filas visibles` : ''}
      </div>
    </div>
    </KpiThemeContext.Provider>
  )
}

export default memo(KpiReclutadoresDashboard)
