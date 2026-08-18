import { useMemo, useState, useEffect, useCallback } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, Cell, LabelList
} from 'recharts'
import { Filter, AlertCircle, RefreshCw, Loader2, Sparkles, TrendingDown, Layers } from 'lucide-react'
import { fetchGrupos, fetchAllAsistenciasBajas, fetchPostulantes } from '../lib/dataService'

const COLORS = {
  bars: 'var(--accent)',
  barsLight: 'var(--accent-hover)',
  text: 'var(--text-primary)',
  bg: 'var(--bg-elevated)'
}

// In-memory cache to make tab switching instant
let cachedMotivosBajas = null

export default function MotivosBajasBI({ grupos: propGrupos = [], postulantes: propPostulantes = [] }) {
  const [data, setData] = useState(cachedMotivosBajas || [])
  const [loading, setLoading] = useState(!cachedMotivosBajas)
  const [error, setError] = useState(null)

  // Top Bar Filters
  const [selectedSegmento, setSelectedSegmento] = useState('TODAS')
  const [selectedCampana, setSelectedCampana] = useState('TODAS')
  const [selectedGrupo, setSelectedGrupo] = useState('TODAS')
  const [selectedPeriodo, setSelectedPeriodo] = useState('TODAS')
  const [selectedSemana, setSelectedSemana] = useState('TODAS')

  const loadData = useCallback(async (force = false) => {
    if (!force && cachedMotivosBajas && cachedMotivosBajas.length > 0) {
      setData(cachedMotivosBajas)
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const gruposPromise = (propGrupos && propGrupos.length > 0) ? Promise.resolve(propGrupos) : fetchGrupos()
      const postulantesPromise = (propPostulantes && propPostulantes.length > 0) ? Promise.resolve(propPostulantes) : fetchPostulantes()
      
      const [grupos, asistenciasBajas, postulantes] = await Promise.all([
        gruposPromise,
        fetchAllAsistenciasBajas(),
        postulantesPromise
      ])

      // Create a map for fast lookup of group info (periodo)
      const groupMap = new Map()
      grupos.forEach(g => {
        groupMap.set(`${g.codigo}-${g.campana}`, g)
      })

      const postulantesMap = new Map()
      postulantes.forEach(p => {
        postulantesMap.set(p.documento, p)
      })

      // Deduplicate by person (documento) so we don't count the same person multiple times
      const uniqueBajasMap = new Map()
      asistenciasBajas.forEach(a => {
        const p = postulantesMap.get(a.documento)
        // Considerar si la persona existe en nómina y no es "BAJA DIA 1"
        if (a.motivo_baja !== 'BAJA DIA 1' && p) {
          uniqueBajasMap.set(a.documento, a)
        }
      })

      // Map over unique asistencias to build the final bajas array
      const bajas = Array.from(uniqueBajasMap.values()).map(a => {
        const groupInfo = groupMap.get(`${a.codigo_grupo}-${a.campana}`)
        
        return {
          documento: a.documento,
          motivo_baja: a.motivo_baja || 'SIN MOTIVO',
          fecha_baja: a.fecha_registro_asistencia,
          campana: a.campana || 'SIN CAMPAÑA',
          periodo_ingreso: groupInfo?.periodo || 'SIN PERIODO',
          semana: groupInfo?.semana_label || (groupInfo?.semana_trabajo ? `SEM ${groupInfo.semana_trabajo}` : 'SIN SEMANA'),
          grupo_cap: a.grupo || a.codigo_grupo || 'SIN GRUPO',
          segmento: groupInfo?.segmento || 'SIN SEGMENTO'
        }
      })

      cachedMotivosBajas = bajas
      setData(bajas)
    } catch (err) {
      console.error(err)
      setError(err?.message || 'Error al cargar los datos de motivos de bajas.')
    } finally {
      setLoading(false)
    }
  }, [propGrupos, propPostulantes])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Derived Filter Lists (Hierarchical Cross-filtering)
  const segmentos = useMemo(() => ['TODAS', ...new Set(data.map(d => d.segmento).filter(Boolean))], [data])
  
  const campanas = useMemo(() => {
    const filtered = data.filter(d => selectedSegmento === 'TODAS' || d.segmento === selectedSegmento)
    return ['TODAS', ...new Set(filtered.map(d => d.campana || d.campaign).filter(Boolean))]
  }, [data, selectedSegmento])

  const grupos = useMemo(() => {
    const filtered = data.filter(d => 
      (selectedSegmento === 'TODAS' || d.segmento === selectedSegmento) && 
      (selectedCampana === 'TODAS' || (d.campana || d.campaign) === selectedCampana)
    )
    return ['TODAS', ...new Set(filtered.map(d => d.grupo_cap).filter(Boolean))]
  }, [data, selectedSegmento, selectedCampana])

  const periodos = useMemo(() => {
    const filtered = data.filter(d => 
      (selectedSegmento === 'TODAS' || d.segmento === selectedSegmento) && 
      (selectedCampana === 'TODAS' || (d.campana || d.campaign) === selectedCampana) &&
      (selectedGrupo === 'TODAS' || d.grupo_cap === selectedGrupo)
    )
    return ['TODAS', ...new Set(filtered.map(d => d.periodo_ingreso).filter(Boolean))].sort()
  }, [data, selectedSegmento, selectedCampana, selectedGrupo])

  const semanas = useMemo(() => {
    const filtered = data.filter(d => 
      (selectedSegmento === 'TODAS' || d.segmento === selectedSegmento) && 
      (selectedCampana === 'TODAS' || (d.campana || d.campaign) === selectedCampana) &&
      (selectedGrupo === 'TODAS' || d.grupo_cap === selectedGrupo) &&
      (selectedPeriodo === 'TODAS' || d.periodo_ingreso === selectedPeriodo)
    )
    const sems = filtered.map(d => d.semana).filter(Boolean)
    return ['TODAS', ...new Set(sems)].sort()
  }, [data, selectedSegmento, selectedCampana, selectedGrupo, selectedPeriodo])

  // Apply filters
  const filteredData = useMemo(() => {
    return data.filter(d => {
      if (selectedSegmento !== 'TODAS' && d.segmento !== selectedSegmento) return false
      if (selectedCampana !== 'TODAS' && (d.campana || d.campaign) !== selectedCampana) return false
      if (selectedGrupo !== 'TODAS' && d.grupo_cap !== selectedGrupo) return false
      if (selectedPeriodo !== 'TODAS' && d.periodo_ingreso !== selectedPeriodo) return false
      if (selectedSemana !== 'TODAS' && d.semana !== selectedSemana) return false
      return true
    })
  }, [data, selectedSegmento, selectedCampana, selectedGrupo, selectedPeriodo, selectedSemana])

  // 1. Bajas por periodo
  const byPeriod = useMemo(() => {
    const counts = {}
    filteredData.forEach(d => {
      const period = d.periodo_ingreso || 'SIN PERIODO'
      counts[period] = (counts[period] || 0) + 1
    })
    return Object.entries(counts)
      .map(([period, value]) => ({ period, value }))
      .sort((a, b) => b.period.localeCompare(a.period))
  }, [filteredData])

  // 2. Ranking de Motivos
  const byMotivo = useMemo(() => {
    const counts = {}
    filteredData.forEach(d => {
      const m = (d.motivo_baja || 'SIN MOTIVO').toUpperCase()
      counts[m] = (counts[m] || 0) + 1
    })
    return Object.entries(counts)
      .map(([motivo, value]) => ({ motivo, value }))
      .sort((a, b) => b.value - a.value)
  }, [filteredData])

  // 3. Matriz Cruzada (Campaña vs Motivo)
  const matrixData = useMemo(() => {
    const rowCounts = {}
    const colTotals = {}
    let grandTotal = 0

    filteredData.forEach(d => {
      const c = ((d.campana || d.campaign) || 'SIN CAMPAÑA').toUpperCase()
      const m = (d.motivo_baja || 'SIN MOTIVO').toUpperCase()
      
      if (!rowCounts[c]) rowCounts[c] = { total: 0, motivos: {} }
      rowCounts[c].motivos[m] = (rowCounts[c].motivos[m] || 0) + 1
      rowCounts[c].total++
      
      colTotals[m] = (colTotals[m] || 0) + 1
      grandTotal++
    })

    const topMotivos = byMotivo.map(m => m.motivo).slice(0, 15)
    const rows = Object.keys(rowCounts).sort().map(c => {
      const row = { campana: c, total: rowCounts[c].total }
      topMotivos.forEach(m => {
        row[m] = rowCounts[c].motivos[m] || 0
      })
      return row
    })

    return { rows, topMotivos, grandTotal, colTotals }
  }, [filteredData, byMotivo])

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-[var(--bg-base)]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 size={32} className="animate-spin text-cyan-400" />
          <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
            Cargando Análisis de Bajas...
          </p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center p-6 bg-[var(--bg-base)]">
        <div className="p-6 rounded-2xl bg-[var(--bg-surface)] border border-rose-500/30 text-center max-w-sm space-y-3 shadow-xl">
          <AlertCircle size={28} className="text-rose-500 mx-auto" />
          <h3 className="text-sm font-bold text-[var(--text-primary)]">Error al cargar datos</h3>
          <p className="text-xs text-[var(--text-muted)]">{error}</p>
          <button onClick={loadData} className="px-4 py-2 rounded-xl bg-cyan-500 text-white text-xs font-bold hover:bg-cyan-600 transition-all cursor-pointer">
            Reintentar
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col overflow-hidden bg-[var(--bg-base)] p-3 gap-2 select-none">
      
      {/* ── 1. COMPACT HERO HEADER + FILTERS IN 1 ROW (Height ~38px) ── */}
      <div className="flex flex-wrap items-center justify-between gap-2 shrink-0 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl px-3 py-1.5 shadow-xs">
        
        {/* Title + Total Badge */}
        <div className="flex items-center gap-2.5">
          <div className="w-2 h-2 rounded-full bg-rose-500 shadow-[0_0_8px_#F43F5E] animate-pulse" />
          <h2 className="text-xs sm:text-sm font-black tracking-tight text-[var(--text-primary)] uppercase">
            Análisis de Bajas <span className="text-[10px] text-[var(--text-muted)] font-medium lowercase">· motivos & deserción</span>
          </h2>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-500/15 text-rose-500 border border-rose-500/30">
            Total: {filteredData.length} bajas
          </span>
        </div>

        {/* Inline Compact Filter Badges */}
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { label: 'Segmento', val: selectedSegmento, set: (v) => { setSelectedSegmento(v); setSelectedCampana('TODAS'); setSelectedGrupo('TODAS'); }, opts: segmentos },
            { label: 'Campaña', val: selectedCampana, set: (v) => { setSelectedCampana(v); setSelectedGrupo('TODAS'); }, opts: campanas },
            { label: 'Grupo', val: selectedGrupo, set: setSelectedGrupo, opts: grupos },
            { label: 'Periodo', val: selectedPeriodo, set: (v) => { setSelectedPeriodo(v); setSelectedSemana('TODAS'); }, opts: periodos },
            { label: 'Semana', val: selectedSemana, set: setSelectedSemana, opts: semanas },
          ].map(({ label, val, set, opts }) => (
            <div key={label} className="flex items-center gap-1 bg-[var(--bg-elevated)] border border-[var(--border-normal)] rounded-lg px-2 py-1">
              <span className="text-[8px] font-black uppercase tracking-wider text-[var(--text-muted)]">
                {label}:
              </span>
              <select
                value={val}
                onChange={(e) => set(e.target.value)}
                className="bg-transparent text-[11px] font-bold text-[var(--text-primary)] outline-none cursor-pointer max-w-[110px] truncate"
              >
                {opts.map((opt) => (
                  <option key={opt} value={opt} className="bg-[var(--bg-surface)] text-[var(--text-primary)]">
                    {opt}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </div>

      {/* ── 2. FLUID RESPONSIVE CHARTS ROW (Auto-scales on Large Monitors) ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-2 min-h-[175px] h-[190px] lg:h-[230px] 2xl:h-[280px] shrink-0">
        
        {/* Chart 1: Bajas por Periodo */}
        <div className="rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-2.5 flex flex-col min-w-0 shadow-xs">
          <div className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)] mb-1 flex items-center justify-between">
            <span>Bajas por Periodo</span>
            <Layers size={12} className="text-cyan-400" />
          </div>
          <div className="flex-1 min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byPeriod} layout="vertical" margin={{ top: 5, right: 30, left: 35, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-normal)" horizontal={false} opacity={0.3} />
                <XAxis type="number" hide />
                <YAxis dataKey="period" type="category" axisLine={false} tickLine={false} tick={{fill: 'var(--text-muted)', fontSize: 10, fontWeight: 700}} width={48} />
                <RechartsTooltip cursor={{fill: 'rgba(128,128,128,0.1)'}} contentStyle={{backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)', color: 'var(--text-primary)', borderRadius: '8px', fontSize: '11px'}} />
                <Bar dataKey="value" fill="#06B6D4" radius={[0, 4, 4, 0]} isAnimationActive={false}>
                  <LabelList dataKey="value" position="right" fill="var(--text-muted)" fontSize={10} fontWeight="bold" />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 2: Ranking de Motivos (2 columns) */}
        <div className="md:col-span-2 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-2.5 flex flex-col min-w-0 shadow-xs">
          <div className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)] mb-1 flex items-center justify-between">
            <span>Ranking de Motivos de Deserción</span>
            <TrendingDown size={12} className="text-rose-500" />
          </div>
          <div className="flex-1 min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byMotivo.slice(0, 10)} margin={{ top: 10, right: 15, left: -20, bottom: 35 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-normal)" vertical={false} opacity={0.3} />
                <XAxis 
                  dataKey="motivo" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{fill: 'var(--text-muted)', fontSize: 8.5, fontWeight: 600}} 
                  angle={-25} 
                  textAnchor="end" 
                  interval={0}
                  height={35}
                />
                <YAxis axisLine={false} tickLine={false} tick={{fill: 'var(--text-muted)', fontSize: 10}} />
                <RechartsTooltip cursor={{fill: 'rgba(128,128,128,0.1)'}} contentStyle={{backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)', color: 'var(--text-primary)', borderRadius: '8px', fontSize: '11px'}} />
                <Bar dataKey="value" fill="#F43F5E" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                  <LabelList dataKey="value" position="top" fill="var(--text-muted)" fontSize={10} fontWeight="bold" />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Top 3 Motivos Quick Cards */}
        <div className="rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-2.5 flex flex-col justify-between min-w-0 shadow-xs">
          <div className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)]">
            Top Motivos
          </div>
          <div className="space-y-1.5 my-auto">
            {byMotivo.slice(0, 3).map((m, idx) => (
              <div key={m.motivo} className="flex items-center justify-between p-2 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
                <div className="min-w-0 flex-1 truncate pr-2">
                  <p className="text-[9.5px] font-bold text-[var(--text-muted)] truncate uppercase">
                    #{idx + 1} {m.motivo}
                  </p>
                </div>
                <span className="text-sm font-black text-rose-500 font-mono">
                  {m.value}
                </span>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* ── 3. FULL-HEIGHT MATRIX TABLE WITH INTERNAL SCROLL ── */}
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-xl">
        
        {/* Matrix Header Toolbar */}
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--border-subtle)] bg-[var(--bg-elevated)]/40 shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-black text-[var(--text-primary)] uppercase tracking-tight">
              Matriz Cruzada: Campaña vs Motivo
            </span>
            <span className="text-[9px] text-[var(--text-muted)] font-bold">
              ({matrixData.rows.length} campañas analizadas)
            </span>
          </div>
          <span className="text-[10px] font-mono font-bold text-cyan-400">
            Total General: {matrixData.grandTotal}
          </span>
        </div>

        {/* Scrollable Matrix Table */}
        <div className="flex-1 min-h-0 overflow-x-auto overflow-y-auto custom-scrollbar relative">
          <table className="w-full text-left text-xs whitespace-nowrap border-separate border-spacing-0">
            <thead className="sticky top-0 z-20">
              <tr>
                <th className="sticky left-0 z-30 px-3 py-2 border-r border-b border-[var(--border-normal)] font-black text-[9px] text-[var(--text-muted)] uppercase bg-[var(--table-head-bg)] tracking-wider">
                  CAMPAÑA
                </th>
                {matrixData.topMotivos.map(m => (
                  <th key={m} className="px-3 py-2 border-r border-b border-[var(--border-normal)] font-black text-[9px] text-[var(--text-muted)] uppercase text-center max-w-[130px] truncate bg-[var(--table-head-bg)]" title={m}>
                    {m}
                  </th>
                ))}
                <th className="px-3 py-2 border-b border-[var(--border-normal)] font-black text-[9px] text-[var(--text-primary)] uppercase text-center bg-[var(--table-head-bg)]">
                  TOTAL
                </th>
              </tr>
            </thead>
            <tbody>
              {matrixData.rows.map((row) => (
                <tr key={row.campana} className="hover:bg-[var(--bg-elevated)] transition-colors group">
                  <td className="sticky left-0 z-10 px-3 py-1.5 border-r border-b border-[var(--border-subtle)] font-bold text-[11px] text-[var(--text-primary)] bg-[var(--bg-surface)] group-hover:bg-[var(--bg-elevated)]">
                    {row.campana}
                  </td>
                  {matrixData.topMotivos.map(m => {
                    const val = row[m]
                    const pct = matrixData.grandTotal > 0 ? ((val / matrixData.grandTotal) * 100).toFixed(1) : 0
                    const hasVal = val > 0
                    return (
                      <td key={m} className="px-3 py-1.5 border-r border-b border-[var(--border-subtle)] text-center relative">
                        {hasVal ? (
                          <div className="flex items-center justify-center gap-1">
                            <span className="text-[11px] font-mono font-bold text-[var(--text-primary)]">{pct}%</span>
                            <span className="text-[9px] text-[var(--text-muted)] font-mono">({val})</span>
                          </div>
                        ) : (
                          <span className="text-[10px] text-[var(--text-muted)] opacity-40">—</span>
                        )}
                      </td>
                    )
                  })}
                  <td className="px-3 py-1.5 border-b border-[var(--border-subtle)] text-center text-[11px] font-black text-[var(--text-primary)] font-mono bg-[var(--bg-elevated)]/40">
                    {row.total}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-[var(--table-head-bg)] sticky bottom-0 z-20 border-t-2 border-[var(--border-normal)]">
              <tr>
                <td className="sticky left-0 z-30 px-3 py-2 border-r border-[var(--border-normal)] font-black text-[10px] text-[var(--text-primary)] bg-[var(--table-head-bg)]">
                  TOTAL GENERAL
                </td>
                {matrixData.topMotivos.map(m => (
                  <td key={m} className="px-3 py-2 border-r border-[var(--border-normal)] text-center font-black text-[10px] text-[var(--text-primary)] font-mono">
                    {matrixData.grandTotal > 0 ? ((matrixData.colTotals[m] / matrixData.grandTotal) * 100).toFixed(1) : 0}%
                  </td>
                ))}
                <td className="px-3 py-2 text-center font-black text-xs text-rose-500 font-mono">
                  {matrixData.grandTotal}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

      </div>

    </div>
  )
}
