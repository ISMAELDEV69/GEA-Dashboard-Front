import { useMemo, useState, useEffect, useCallback } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, Cell, LabelList
} from 'recharts'
import { Filter, Search, AlertCircle, RefreshCw, Loader2, Sparkles, Layers, Download, X } from 'lucide-react'
import { fetchAllDescuentosBI, invalidateCache } from '../lib/dataService'

const COLORS = {
  bars: 'var(--accent)',
  barsLight: 'var(--accent-hover)',
  text: 'var(--text-primary)',
}

// In-memory module cache for instant switching without re-fetching
let cachedDescuentos = null

export default function DescuentosBI() {
  const [data, setData] = useState(cachedDescuentos || [])
  const [loading, setLoading] = useState(!cachedDescuentos)
  const [error, setError] = useState(null)
  const [visibleRows, setVisibleRows] = useState(100)

  // View Mode
  const [viewMode, setViewMode] = useState('TABLA GENERAL')

  // Top Bar Filters
  const [selectedFechaEnvio, setSelectedFechaEnvio] = useState('TODAS')
  const [selectedProcede, setSelectedProcede] = useState('TODAS')
  const [selectedSegmento, setSelectedSegmento] = useState('TODAS')
  const [selectedCampana, setSelectedCampana] = useState('TODAS')
  const [selectedGrupo, setSelectedGrupo] = useState('TODAS')
  const [selectedPeriodo, setSelectedPeriodo] = useState('TODAS')
  const [selectedMotivo, setSelectedMotivo] = useState('TODAS')
  const [searchDocumento, setSearchDocumento] = useState('')

  const loadData = useCallback(async (force = false) => {
    if (force === true) {
      invalidateCache('all_descuentos_bi')
      cachedDescuentos = null
    } else if (cachedDescuentos && cachedDescuentos.length > 0) {
      setData(cachedDescuentos)
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const descRes = await fetchAllDescuentosBI()
      const enriched = (descRes || []).map(d => {
        let p = 'SIN PERIODO'
        if (d.fecha_baja) {
          if (d.fecha_baja.includes('/')) {
            const parts = d.fecha_baja.split('/')
            if (parts.length === 3) p = `${parts[2]}${parts[1].padStart(2, '0')}`
          } else if (d.fecha_baja.includes('-')) {
            const parts = d.fecha_baja.split('-')
            if (parts.length >= 2) p = `${parts[0]}${parts[1].padStart(2, '0')}`
          }
        }
        return {
          ...d,
          periodo: p
        }
      })
      cachedDescuentos = enriched
      setData(enriched)
    } catch (err) {
      console.error(err)
      setError(err?.message || 'Error al cargar los datos analíticos de descuentos.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Derived Filter Lists (Hierarchical Cross-filtering)
  const segmentos = useMemo(() => ['TODAS', ...new Set(data.map(d => d.segmento).filter(Boolean))], [data])
  
  const campanas = useMemo(() => {
    const filtered = data.filter(d => selectedSegmento === 'TODAS' || d.segmento === selectedSegmento)
    return ['TODAS', ...new Set(filtered.map(d => d.campana).filter(Boolean))]
  }, [data, selectedSegmento])
  
  const grupos = useMemo(() => {
    const filtered = data.filter(d => 
      (selectedSegmento === 'TODAS' || d.segmento === selectedSegmento) && 
      (selectedCampana === 'TODAS' || d.campana === selectedCampana)
    )
    return ['TODAS', ...new Set(filtered.map(d => d.grupo_cap).filter(Boolean))]
  }, [data, selectedSegmento, selectedCampana])
  
  const periodos = useMemo(() => {
    const filtered = data.filter(d => 
      (selectedSegmento === 'TODAS' || d.segmento === selectedSegmento) && 
      (selectedCampana === 'TODAS' || d.campana === selectedCampana) &&
      (selectedGrupo === 'TODAS' || d.grupo_cap === selectedGrupo)
    )
    const ps = filtered.map(d => d.periodo).filter(Boolean)
    return ['TODAS', ...new Set(ps)].sort((a, b) => b.localeCompare(a))
  }, [data, selectedSegmento, selectedCampana, selectedGrupo])

  const motivos = useMemo(() => {
    const filtered = data.filter(d => 
      (selectedSegmento === 'TODAS' || d.segmento === selectedSegmento) && 
      (selectedCampana === 'TODAS' || d.campana === selectedCampana) &&
      (selectedGrupo === 'TODAS' || d.grupo_cap === selectedGrupo) &&
      (selectedPeriodo === 'TODAS' || d.periodo === selectedPeriodo)
    )
    return ['TODAS', ...new Set(filtered.map(d => d.motivo || 'SIN MOTIVO'))].sort()
  }, [data, selectedSegmento, selectedCampana, selectedGrupo, selectedPeriodo])

  const fechasEnvio = useMemo(() => {
    const dates = data.map(d => d.fecha_registro ? d.fecha_registro.split('T')[0] : null).filter(Boolean)
    return ['TODAS', ...new Set(dates)].sort((a, b) => b.localeCompare(a))
  }, [data])

  const procedes = ['TODAS', 'PROCEDE', 'NO PROCEDE', 'PENDIENTE']

  // Apply filters
  const filteredData = useMemo(() => {
    return data.filter(d => {
      if (selectedSegmento !== 'TODAS' && d.segmento !== selectedSegmento) return false
      if (selectedCampana !== 'TODAS' && d.campana !== selectedCampana) return false
      if (selectedGrupo !== 'TODAS' && d.grupo_cap !== selectedGrupo) return false
      if (selectedPeriodo !== 'TODAS' && d.periodo !== selectedPeriodo) return false
      if (selectedMotivo !== 'TODAS' && d.motivo !== selectedMotivo) return false
      if (selectedProcede !== 'TODAS' && (d.procede || 'PENDIENTE').toUpperCase() !== selectedProcede) return false
      if (selectedFechaEnvio !== 'TODAS' && (!d.fecha_registro || !d.fecha_registro.startsWith(selectedFechaEnvio))) return false
      if (searchDocumento && !String(d.dni_ce || '').includes(searchDocumento.trim()) && !String(d.postulante || '').toLowerCase().includes(searchDocumento.trim().toLowerCase())) return false
      return true
    })
  }, [data, selectedSegmento, selectedCampana, selectedGrupo, selectedPeriodo, selectedMotivo, selectedProcede, selectedFechaEnvio, searchDocumento])

  // 1. Descuentos por Periodo
  const byPeriod = useMemo(() => {
    const counts = {}
    filteredData.forEach(d => {
      const p = d.periodo || 'SIN PERIODO'
      counts[p] = (counts[p] || 0) + 1
    })
    return Object.entries(counts)
      .map(([period, value]) => ({ period, value }))
      .sort((a, b) => b.period.localeCompare(a.period))
  }, [filteredData])

  // 2. Ranking de Motivos
  const byMotivo = useMemo(() => {
    const counts = {}
    filteredData.forEach(d => {
      const m = (d.motivo || 'SIN MOTIVO').toUpperCase()
      counts[m] = (counts[m] || 0) + 1
    })
    return Object.entries(counts)
      .map(([motivo, value]) => ({ motivo, value }))
      .sort((a, b) => b.value - a.value)
  }, [filteredData])

  // 3. Matriz Cruzada de Descuentos (Porcentajes)
  const matrixData = useMemo(() => {
    const rowCounts = {}
    const colTotals = {}
    let grandTotal = 0

    filteredData.forEach(d => {
      const c = (d.campana || 'SIN CAMPAÑA').toUpperCase()
      const m = (d.motivo || 'SIN MOTIVO').toUpperCase()
      
      if (!rowCounts[c]) rowCounts[c] = { total: 0, motivos: {} }
      rowCounts[c].motivos[m] = (rowCounts[c].motivos[m] || 0) + 1
      rowCounts[c].total++
      
      colTotals[m] = (colTotals[m] || 0) + 1
      grandTotal++
    })

    const topMotivos = byMotivo.map(m => m.motivo).slice(0, 12)
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
            Cargando Descuentos BI...
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
          <button onClick={() => loadData(true)} className="px-4 py-2 rounded-xl bg-cyan-500 text-white text-xs font-bold hover:bg-cyan-600 transition-all cursor-pointer">
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
        
        {/* Title + Mode Switcher */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_8px_#06B6D4] animate-pulse" />
            <h2 className="text-xs sm:text-sm font-black tracking-tight text-[var(--text-primary)] uppercase">
              Descuentos de Formación <span className="text-[10px] text-[var(--text-muted)] font-medium lowercase">· auditoría bi</span>
            </h2>
          </div>

          <div className="flex items-center bg-[var(--bg-elevated)] p-0.5 rounded-lg border border-[var(--border-subtle)]">
            <button
              onClick={() => setViewMode('TABLA GENERAL')}
              className={`px-2.5 py-0.5 rounded-md text-[10px] font-bold transition-all cursor-pointer ${
                viewMode === 'TABLA GENERAL'
                  ? 'bg-cyan-500 text-white shadow-xs'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              General ({filteredData.length})
            </button>
            <button
              onClick={() => setViewMode('PORCENTAJES')}
              className={`px-2.5 py-0.5 rounded-md text-[10px] font-bold transition-all cursor-pointer ${
                viewMode === 'PORCENTAJES'
                  ? 'bg-cyan-500 text-white shadow-xs'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              Matriz %
            </button>
          </div>
        </div>

        {/* Inline Compact Filter Badges */}
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { label: 'Segmento', val: selectedSegmento, set: (v) => { setSelectedSegmento(v); setSelectedCampana('TODAS'); setSelectedGrupo('TODAS'); }, opts: segmentos },
            { label: 'Campaña', val: selectedCampana, set: (v) => { setSelectedCampana(v); setSelectedGrupo('TODAS'); }, opts: campanas },
            { label: 'Grupo', val: selectedGrupo, set: setSelectedGrupo, opts: grupos },
            { label: 'Periodo', val: selectedPeriodo, set: setSelectedPeriodo, opts: periodos },
            { label: 'Procede', val: selectedProcede, set: setSelectedProcede, opts: procedes },
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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 min-h-[175px] h-[190px] lg:h-[230px] 2xl:h-[280px] shrink-0">
        
        {/* Chart 1: Descuentos por Periodo */}
        <div className="rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-2.5 flex flex-col min-w-0 shadow-xs">
          <div className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)] mb-1 flex items-center justify-between">
            <span>Descuentos por Periodo</span>
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
            <span>Ranking de Motivos de Descuento</span>
            <span className="text-[10px] font-mono text-cyan-400 font-bold">{filteredData.length} registros</span>
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
                <Bar dataKey="value" fill="#8B5CF6" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                  <LabelList dataKey="value" position="top" fill="var(--text-muted)" fontSize={10} fontWeight="bold" />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

      </div>

      {/* ── 3. FULL-HEIGHT DATA TABLE WITH INTERNAL SCROLL ── */}
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-xl">
        
        {/* Table Toolbar */}
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--border-subtle)] bg-[var(--bg-elevated)]/40 shrink-0">
          <div className="relative flex-1 max-w-xs">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              type="text"
              value={searchDocumento}
              onChange={(e) => setSearchDocumento(e.target.value)}
              placeholder="Buscar por DNI o postulante..."
              className="w-full h-7 pl-7 pr-6 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-normal)] text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] outline-none focus:border-cyan-500 transition-colors font-medium"
            />
            {searchDocumento && (
              <button onClick={() => setSearchDocumento('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                <X size={11} />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] text-[var(--text-muted)] font-mono font-bold">
              Mostrando {Math.min(visibleRows, filteredData.length)} de {filteredData.length}
            </span>
            {filteredData.length > visibleRows && (
              <button
                onClick={() => setVisibleRows(prev => prev + 200)}
                className="px-2 py-0.5 text-[10px] font-bold rounded bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 transition-all cursor-pointer"
              >
                + Cargar más
              </button>
            )}
          </div>
        </div>

        {/* Scrollable Table View */}
        <div 
          className="flex-1 min-h-0 overflow-x-auto overflow-y-auto custom-scrollbar relative"
          onScroll={(e) => {
            const { scrollTop, scrollHeight, clientHeight } = e.currentTarget
            if (scrollHeight - scrollTop - clientHeight < 200 && visibleRows < filteredData.length) {
              setVisibleRows(prev => Math.min(prev + 100, filteredData.length))
            }
          }}
        >
          {viewMode === 'TABLA GENERAL' ? (
            <table className="w-full text-left text-xs whitespace-nowrap border-separate border-spacing-0">
              <thead className="sticky top-0 z-20">
                <tr>
                  <th className="px-3 py-2 border-r border-b border-[var(--border-normal)] font-black text-[9px] text-[var(--text-muted)] uppercase bg-[var(--table-head-bg)]">SEDE</th>
                  <th className="px-3 py-2 border-r border-b border-[var(--border-normal)] font-black text-[9px] text-[var(--text-muted)] uppercase bg-[var(--table-head-bg)]">SEGMENTO</th>
                  <th className="px-3 py-2 border-r border-b border-[var(--border-normal)] font-black text-[9px] text-[var(--text-muted)] uppercase bg-[var(--table-head-bg)]">GPE</th>
                  <th className="px-3 py-2 border-r border-b border-[var(--border-normal)] font-black text-[9px] text-[var(--text-muted)] uppercase bg-[var(--table-head-bg)]">CAMPAÑA</th>
                  <th className="px-3 py-2 border-r border-b border-[var(--border-normal)] font-black text-[9px] text-[var(--text-muted)] uppercase bg-[var(--table-head-bg)]">SUPERVISOR</th>
                  <th className="px-3 py-2 border-r border-b border-[var(--border-normal)] font-black text-[9px] text-[var(--text-muted)] uppercase bg-[var(--table-head-bg)]">FORMADOR</th>
                  <th className="px-3 py-2 border-r border-b border-[var(--border-normal)] font-black text-[9px] text-[var(--text-muted)] uppercase bg-[var(--table-head-bg)]">DNI/CE</th>
                  <th className="px-3 py-2 border-r border-b border-[var(--border-normal)] font-black text-[9px] text-[var(--text-muted)] uppercase bg-[var(--table-head-bg)]">POSTULANTE</th>
                  <th className="px-3 py-2 border-r border-b border-[var(--border-normal)] font-black text-[9px] text-[var(--text-muted)] uppercase bg-[var(--table-head-bg)]">FECHA BAJA</th>
                  <th className="px-3 py-2 border-r border-b border-[var(--border-normal)] font-black text-[9px] text-[var(--text-muted)] uppercase bg-[var(--table-head-bg)]">MOTIVO</th>
                  <th className="px-3 py-2 border-r border-b border-[var(--border-normal)] font-black text-[9px] text-[var(--text-muted)] uppercase text-center bg-[var(--table-head-bg)]">PROCEDE</th>
                  <th className="px-3 py-2 border-b border-[var(--border-normal)] font-black text-[9px] text-[var(--text-muted)] uppercase bg-[var(--table-head-bg)]">COMENTARIO RYS</th>
                </tr>
              </thead>
              <tbody>
                {filteredData.slice(0, visibleRows).map((row, i) => (
                  <tr key={row.id || i} className="hover:bg-[var(--bg-elevated)] transition-colors group">
                    <td className="px-3 py-1.5 border-r border-b border-[var(--border-subtle)] text-[11px] text-[var(--text-muted)]">{row.sede}</td>
                    <td className="px-3 py-1.5 border-r border-b border-[var(--border-subtle)] text-[11px] text-[var(--text-muted)]">{row.segmento}</td>
                    <td className="px-3 py-1.5 border-r border-b border-[var(--border-subtle)] text-[11px] font-mono font-bold text-[var(--text-primary)]">{row.grupo_cap}</td>
                    <td className="px-3 py-1.5 border-r border-b border-[var(--border-subtle)] text-[11px] text-[var(--text-primary)]">{row.campana}</td>
                    <td className="px-3 py-1.5 border-r border-b border-[var(--border-subtle)] text-[11px] text-[var(--text-secondary)]">{row.supervisor}</td>
                    <td className="px-3 py-1.5 border-r border-b border-[var(--border-subtle)] text-[11px] text-[var(--text-secondary)]">{row.formador}</td>
                    <td className="px-3 py-1.5 border-r border-b border-[var(--border-subtle)] text-[11px] font-mono font-bold text-[var(--text-primary)]">{row.dni_ce}</td>
                    <td className="px-3 py-1.5 border-r border-b border-[var(--border-subtle)] text-[11px] font-medium text-[var(--text-primary)]">{row.postulante}</td>
                    <td className="px-3 py-1.5 border-r border-b border-[var(--border-subtle)] text-[11px] font-mono text-[var(--text-muted)]">{row.fecha_baja}</td>
                    <td className="px-3 py-1.5 border-r border-b border-[var(--border-subtle)] text-[11px] text-[var(--text-primary)]">{row.motivo}</td>
                    <td className="px-3 py-1.5 border-r border-b border-[var(--border-subtle)] text-center">
                      <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${
                        (row.procede || '').toUpperCase() === 'PROCEDE' ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30' :
                        (row.procede || '').toUpperCase() === 'NO PROCEDE' ? 'bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/30' :
                        'bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30'
                      }`}>
                        {row.procede || 'PENDIENTE'}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 border-b border-[var(--border-subtle)] text-[11px] text-[var(--text-muted)] max-w-xs truncate" title={row.comentario_rys}>
                      {row.comentario_rys || '—'}
                    </td>
                  </tr>
                ))}
                {filteredData.length === 0 && (
                  <tr>
                    <td colSpan={12} className="px-4 py-16 text-center text-[var(--text-muted)]">
                      <AlertCircle size={32} className="mx-auto mb-2 text-[var(--text-faint)]" />
                      <p className="font-bold text-xs">No hay registros de descuentos con los filtros aplicados.</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          ) : (
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
                  <td className="px-3 py-2 text-center font-black text-xs text-cyan-400 font-mono">
                    {matrixData.grandTotal}
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>

      </div>

    </div>
  )
}
