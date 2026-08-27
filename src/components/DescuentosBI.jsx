import { useMemo, useState, useEffect, useCallback } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, Cell, LabelList
} from 'recharts'
import { 
  Filter, Search, AlertCircle, RefreshCw, Loader2, Sparkles, 
  Layers, Download, X, AlertTriangle, CheckCircle2, Clock, 
  TrendingDown, DollarSign, FileText, Ban, Activity, ShieldCheck, 
  BarChart3, PieChart as PieIcon, ArrowRight
} from 'lucide-react'
import { fetchAllDescuentosBI, invalidateCache } from '../lib/dataService'

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

  const procedes = ['TODAS', 'PROCEDE', 'NO PROCEDE', 'PENDIENTE']

  // Apply filters
  const filteredData = useMemo(() => {
    return data.filter(d => {
      if (selectedSegmento !== 'TODAS' && d.segmento !== selectedSegmento) return false
      if (selectedCampana !== 'TODAS' && d.campana !== selectedCampana) return false
      if (selectedGrupo !== 'TODAS' && d.grupo_cap !== selectedGrupo) return false
      if (selectedPeriodo !== 'TODAS' && d.periodo !== selectedPeriodo) return false
      if (selectedMotivo !== 'TODAS' && d.motivo !== selectedMotivo) return false
      if (selectedProcede !== 'TODAS') {
        const proc = (d.procede || 'PENDIENTE').toUpperCase()
        if (selectedProcede === 'PROCEDE' && proc !== 'PROCEDE' && proc !== 'SI') return false
        if (selectedProcede === 'NO PROCEDE' && proc !== 'NO PROCEDE' && proc !== 'NO') return false
        if (selectedProcede === 'PENDIENTE' && proc !== 'PENDIENTE') return false
      }
      if (selectedFechaEnvio !== 'TODAS' && (!d.fecha_registro || !d.fecha_registro.startsWith(selectedFechaEnvio))) return false
      if (searchDocumento && !String(d.dni_ce || '').includes(searchDocumento.trim()) && !String(d.postulante || '').toLowerCase().includes(searchDocumento.trim().toLowerCase())) return false
      return true
    })
  }, [data, selectedSegmento, selectedCampana, selectedGrupo, selectedPeriodo, selectedMotivo, selectedProcede, selectedFechaEnvio, searchDocumento])

  // KPIs
  const kpis = useMemo(() => {
    let procede = 0
    let noProcede = 0
    let pendiente = 0
    filteredData.forEach(d => {
      const p = (d.procede || 'PENDIENTE').toUpperCase()
      if (p === 'PROCEDE' || p === 'SI') procede++
      else if (p === 'NO PROCEDE' || p === 'NO') noProcede++
      else pendiente++
    })
    return {
      total: filteredData.length,
      procede,
      noProcede,
      pendiente,
      pctProcede: filteredData.length > 0 ? Math.round((procede / filteredData.length) * 100) : 0,
      pctNoProcede: filteredData.length > 0 ? Math.round((noProcede / filteredData.length) * 100) : 0,
      pctPendiente: filteredData.length > 0 ? Math.round((pendiente / filteredData.length) * 100) : 0,
    }
  }, [filteredData])

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

  // 2. Ranking de Motivos (Magenta / Red flag Pareto)
  const byMotivo = useMemo(() => {
    const counts = {}
    filteredData.forEach(d => {
      const m = (d.motivo || 'SIN MOTIVO').toUpperCase()
      counts[m] = (counts[m] || 0) + 1
    })
    return Object.entries(counts)
      .map(([motivo, value]) => ({ 
        motivo, 
        value,
        pct: filteredData.length > 0 ? ((value / filteredData.length) * 100).toFixed(1) : 0
      }))
      .sort((a, b) => b.value - a.value)
  }, [filteredData])

  // Top 3 Motivos
  const top3Motivos = useMemo(() => byMotivo.slice(0, 3), [byMotivo])

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

    const topMotivos = byMotivo.map(m => m.motivo).slice(0, 8)
    const rows = Object.keys(rowCounts).sort().map(c => {
      const row = { campana: c, total: rowCounts[c].total }
      topMotivos.forEach(m => {
        row[m] = rowCounts[c].motivos[m] || 0
      })
      return row
    })

    return { rows, topMotivos, grandTotal, colTotals }
  }, [filteredData, byMotivo])

  const hasActiveFilters = selectedSegmento !== 'TODAS' || selectedCampana !== 'TODAS' || selectedGrupo !== 'TODAS' || selectedPeriodo !== 'TODAS' || selectedProcede !== 'TODAS' || selectedMotivo !== 'TODAS' || Boolean(searchDocumento)

  const clearAllFilters = () => {
    setSelectedSegmento('TODAS')
    setSelectedCampana('TODAS')
    setSelectedGrupo('TODAS')
    setSelectedPeriodo('TODAS')
    setSelectedProcede('TODAS')
    setSelectedMotivo('TODAS')
    setSearchDocumento('')
  }

  if (loading) {
    return (
      <div className="min-h-[500px] flex items-center justify-center bg-[var(--bg-base)]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 size={36} className="animate-spin text-cyan-500" />
          <p className="text-xs font-black uppercase tracking-widest text-[var(--text-muted)]">
            Cargando Analítica &amp; BI de Descuentos...
          </p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-[500px] flex items-center justify-center p-6 bg-[var(--bg-base)]">
        <div className="p-6 rounded-2xl bg-[var(--bg-card)] border border-rose-500/40 text-center max-w-sm space-y-3 shadow-xl">
          <AlertCircle size={32} className="text-rose-500 mx-auto" />
          <h3 className="text-sm font-black text-[var(--text-primary)]">Error al cargar analítica</h3>
          <p className="text-xs text-[var(--text-muted)]">{error}</p>
          <button onClick={() => loadData(true)} className="px-5 py-2 rounded-xl bg-rose-500 text-white text-xs font-bold hover:bg-rose-600 transition-all cursor-pointer shadow-md">
            Reintentar
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5 pb-12 animate-fade-in p-3 sm:p-5 select-none font-sans text-[var(--text-primary)]">
      
      {/* ── 1. HEADER PRINCIPAL CON FILTROS EN LÍNEA Y TOGGLE DE VISTAS ── */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-[var(--surface)] p-4 rounded-2xl border border-[var(--border-subtle)] shadow-lg backdrop-blur-md">
        
        {/* Title + Toggle de Vistas */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-rose-500/20 to-pink-500/20 border border-rose-500/30 flex items-center justify-center text-rose-400">
              <DollarSign className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-sm sm:text-base font-black tracking-tight text-[var(--text-primary)] uppercase flex items-center gap-2">
                ANALÍTICA DE DESCUENTOS
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20 font-bold">
                  Auditoría Financiera
                </span>
              </h1>
              <p className="text-[11px] text-[var(--text-secondary)] font-medium">
                Control de afectación económica, dictámenes y causales de bajas
              </p>
            </div>
          </div>

          <div className="flex items-center bg-[var(--surface-elevated)] p-1 rounded-xl border border-[var(--border-subtle)] ml-auto lg:ml-2">
            <button
              onClick={() => setViewMode('TABLA GENERAL')}
              className={`px-3 py-1 rounded-lg text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5 ${
                viewMode === 'TABLA GENERAL'
                  ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40 shadow-xs'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              General ({filteredData.length})
            </button>
            <button
              onClick={() => setViewMode('PORCENTAJES')}
              className={`px-3 py-1 rounded-lg text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5 ${
                viewMode === 'PORCENTAJES'
                  ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40 shadow-xs'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              <PieIcon className="w-3.5 h-3.5" />
              Matriz %
            </button>
          </div>
        </div>

        {/* Filtros en Línea con Chips Activos */}
        <div className="flex flex-wrap items-center gap-2">
          {[
            { label: 'Segmento', val: selectedSegmento, set: (v) => { setSelectedSegmento(v); setSelectedCampana('TODAS'); setSelectedGrupo('TODAS'); }, opts: segmentos, reset: () => setSelectedSegmento('TODAS') },
            { label: 'Campaña', val: selectedCampana, set: (v) => { setSelectedCampana(v); setSelectedGrupo('TODAS'); }, opts: campanas, reset: () => setSelectedCampana('TODAS') },
            { label: 'Grupo', val: selectedGrupo, set: setSelectedGrupo, opts: grupos, reset: () => setSelectedGrupo('TODAS') },
            { label: 'Periodo', val: selectedPeriodo, set: setSelectedPeriodo, opts: periodos, reset: () => setSelectedPeriodo('TODAS') },
            { label: 'Procede', val: selectedProcede, set: setSelectedProcede, opts: procedes, reset: () => setSelectedProcede('TODAS') },
          ].map(({ label, val, set, opts, reset }) => {
            const isActive = val !== 'TODAS'
            return (
              <div 
                key={label} 
                className={`flex items-center gap-1.5 rounded-xl px-2.5 py-1 transition-all duration-200 ${
                  isActive 
                    ? 'bg-cyan-500/15 border border-cyan-500/60 shadow-xs' 
                    : 'bg-[var(--surface-elevated)] border border-[var(--border-subtle)] hover:border-cyan-500/40'
                }`}
              >
                <span className={`text-[10px] font-black uppercase tracking-wider ${isActive ? 'text-cyan-400' : 'text-[var(--text-muted)]'}`}>
                  {label}:
                </span>
                <select
                  value={val}
                  onChange={(e) => set(e.target.value)}
                  className="bg-transparent text-xs font-bold text-[var(--text-primary)] outline-none cursor-pointer max-w-[120px] truncate"
                >
                  {opts.map((opt) => (
                    <option key={opt} value={opt} className="bg-[var(--surface)] text-[var(--text-primary)] font-bold">
                      {opt}
                    </option>
                  ))}
                </select>
                {isActive && (
                  <button 
                    onClick={reset}
                    className="w-4 h-4 rounded-full bg-rose-500/20 text-rose-400 hover:bg-rose-500 hover:text-white flex items-center justify-center text-[10px] font-bold transition-all cursor-pointer"
                    title={`Restablecer ${label}`}
                  >
                    ×
                  </button>
                )}
              </div>
            )
          })}

          {hasActiveFilters && (
            <button
              onClick={clearAllFilters}
              className="px-3 py-1 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-400 hover:bg-rose-500 hover:text-white text-xs font-black uppercase tracking-wider transition-all cursor-pointer shadow-xs"
              title="Limpiar todos los filtros"
            >
              Limpiar
            </button>
          )}

          <button
            onClick={() => loadData(true)}
            className="h-8 w-8 rounded-xl bg-[var(--surface-elevated)] border border-[var(--border-subtle)] hover:border-cyan-500 text-cyan-400 hover:bg-cyan-500/10 flex items-center justify-center transition-all cursor-pointer shrink-0 shadow-xs"
            title="Refrescar datos"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* ── 2. NIVEL 1: 4 SCORECARD KPIS HORIZONTALES (EQUILIBRADOS Y AMPLIOS) ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* KPI 1: TOTAL SOLICITUDES DESCUENTOS */}
        <div className="relative overflow-hidden bg-gradient-to-br from-[var(--surface)] via-[var(--surface-elevated)] to-rose-950/20 p-5 rounded-2xl border border-rose-500/25 shadow-lg group hover:border-rose-500/50 transition-all">
          <div className="absolute top-0 right-0 w-28 h-28 bg-rose-500/10 rounded-full blur-2xl group-hover:bg-rose-500/20 transition-all pointer-events-none" />
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-[10px] font-black text-rose-400 tracking-wider uppercase px-2.5 py-0.5 bg-rose-500/10 rounded-md border border-rose-500/20 flex items-center gap-1.5">
              <DollarSign className="w-3 h-3" />
              1 · Total Descuentos
            </span>
            <div className="w-8 h-8 rounded-lg bg-rose-500/10 text-rose-400 flex items-center justify-center">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-black text-rose-400 tracking-tight">
            {kpis.total.toLocaleString()}
          </div>
          <p className="text-xs font-semibold text-[var(--text-secondary)] mt-1">
            Solicitudes Auditadas en Periodo
          </p>
          <div className="mt-4 pt-3 border-t border-[var(--border-subtle)] flex items-center justify-between text-[11px]">
            <span className="text-[var(--text-muted)]">Universo Evaluado:</span>
            <span className="font-bold text-cyan-400 font-mono">100% Total Bajas</span>
          </div>
        </div>

        {/* KPI 2: PROCEDE (APROBADOS) */}
        <div className="relative overflow-hidden bg-gradient-to-br from-[var(--surface)] via-[var(--surface-elevated)] to-emerald-950/20 p-5 rounded-2xl border border-emerald-500/25 shadow-lg group hover:border-emerald-500/50 transition-all">
          <div className="absolute top-0 right-0 w-28 h-28 bg-emerald-500/10 rounded-full blur-2xl group-hover:bg-emerald-500/20 transition-all pointer-events-none" />
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-[10px] font-black text-emerald-400 tracking-wider uppercase px-2.5 py-0.5 bg-emerald-500/10 rounded-md border border-emerald-500/20 flex items-center gap-1.5">
              <CheckCircle2 className="w-3 h-3" />
              2 · Procede / Aprobados
            </span>
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black text-emerald-400 tracking-tight">
              {kpis.procede.toLocaleString()}
            </span>
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">
              {kpis.pctProcede}%
            </span>
          </div>
          <p className="text-xs font-semibold text-[var(--text-secondary)] mt-1">
            Descuentos Efectivos Aplicados
          </p>
          <div className="mt-4 pt-3 border-t border-[var(--border-subtle)] flex items-center justify-between text-[11px]">
            <span className="text-[var(--text-muted)]">Afectación en nómina:</span>
            <span className="font-bold text-emerald-400 font-mono">Descuento Real</span>
          </div>
        </div>

        {/* KPI 3: NO PROCEDE (RECHAZADOS) */}
        <div className="relative overflow-hidden bg-gradient-to-br from-[var(--surface)] via-[var(--surface-elevated)] to-cyan-950/20 p-5 rounded-2xl border border-cyan-500/25 shadow-lg group hover:border-cyan-500/50 transition-all">
          <div className="absolute top-0 right-0 w-28 h-28 bg-cyan-500/10 rounded-full blur-2xl group-hover:bg-cyan-500/20 transition-all pointer-events-none" />
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-[10px] font-black text-cyan-400 tracking-wider uppercase px-2.5 py-0.5 bg-cyan-500/10 rounded-md border border-cyan-500/20 flex items-center gap-1.5">
              <Ban className="w-3 h-3" />
              3 · No Procede (Revertidos)
            </span>
            <div className="w-8 h-8 rounded-lg bg-cyan-500/10 text-cyan-400 flex items-center justify-center">
              <Ban className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black text-cyan-400 tracking-tight">
              {kpis.noProcede.toLocaleString()}
            </span>
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-mono">
              {kpis.pctNoProcede}%
            </span>
          </div>
          <p className="text-xs font-semibold text-[var(--text-secondary)] mt-1">
            Sin Afectación Económica al Postulante
          </p>
          <div className="mt-4 pt-3 border-t border-[var(--border-subtle)] flex items-center justify-between text-[11px]">
            <span className="text-[var(--text-muted)]">Resolución:</span>
            <span className="font-bold text-cyan-400 font-mono">Rechazado / Justificado</span>
          </div>
        </div>

        {/* KPI 4: PENDIENTES */}
        <div className="relative overflow-hidden bg-gradient-to-br from-[var(--surface)] via-[var(--surface-elevated)] to-amber-950/20 p-5 rounded-2xl border border-amber-500/25 shadow-lg group hover:border-amber-500/50 transition-all">
          <div className="absolute top-0 right-0 w-28 h-28 bg-amber-500/10 rounded-full blur-2xl group-hover:bg-amber-500/20 transition-all pointer-events-none" />
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-[10px] font-black text-amber-400 tracking-wider uppercase px-2.5 py-0.5 bg-amber-500/10 rounded-md border border-amber-500/20 flex items-center gap-1.5">
              <Clock className="w-3 h-3" />
              4 · Pendientes de Dictamen
            </span>
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black text-amber-400 tracking-tight">
              {kpis.pendiente.toLocaleString()}
            </span>
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 font-mono">
              {kpis.pctPendiente}%
            </span>
          </div>
          <p className="text-xs font-semibold text-[var(--text-secondary)] mt-1">
            En Evaluación por Jefaturas RyS &amp; Cap
          </p>
          <div className="mt-4 pt-3 border-t border-[var(--border-subtle)] flex items-center justify-between text-[11px]">
            <span className="text-[var(--text-muted)]">Estado:</span>
            <span className="font-bold text-amber-400 font-mono">Pendiente Validación</span>
          </div>
        </div>

      </div>

      {/* ── 3. NIVEL 2: GRÁFICOS CON ALTURA Y ESPACIO GENEROSO ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        
        {/* Gráfico 1 (5 cols): Descuentos por Periodo (Barras Horizontales) */}
        <div className="lg:col-span-5 bg-[var(--surface)] p-5 rounded-2xl border border-[var(--border-subtle)] shadow-lg flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-black text-[var(--text-primary)] flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-cyan-400" />
                DISTRIBUCIÓN POR PERIODO
              </h3>
              <span className="text-xs font-bold text-cyan-400 bg-cyan-500/10 px-2.5 py-0.5 rounded-md border border-cyan-500/20 font-mono">
                {byPeriod.length} periodos
              </span>
            </div>
            <p className="text-xs text-[var(--text-secondary)] mb-3">
              Volumen histórico de solicitudes de descuento registradas por ciclo
            </p>

            <div className="h-[280px] w-full pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byPeriod.slice(0, 8)} layout="vertical" margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" horizontal={false} />
                  <XAxis type="number" hide />
                  <YAxis 
                    dataKey="period" 
                    type="category" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: 'var(--text-secondary)', fontSize: 11, fontWeight: 'bold' }} 
                    width={55} 
                  />
                  <RechartsTooltip 
                    cursor={{ fill: 'rgba(244,63,94,0.08)' }} 
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const p = payload[0]?.payload
                        return (
                          <div className="p-3 rounded-xl bg-[var(--surface-elevated)] border border-[var(--border-subtle)] text-xs shadow-2xl space-y-1">
                            <p className="font-black text-cyan-400">Periodo {p?.period}</p>
                            <p className="font-bold text-rose-400 text-sm">{p?.value.toLocaleString()} solicitudes</p>
                          </div>
                        )
                      }
                      return null
                    }}
                  />
                  <Bar dataKey="value" fill="#f43f5e" radius={[0, 6, 6, 0]} maxBarSize={22}>
                    <LabelList dataKey="value" position="right" fill="var(--text-primary)" fontSize={11} fontWeight="bold" />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Gráfico 2 (7 cols): Ranking de Motivos de Descuento (Pareto Causal) */}
        <div className="lg:col-span-7 bg-[var(--surface)] p-5 rounded-2xl border border-[var(--border-subtle)] shadow-lg flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-black text-[var(--text-primary)] flex items-center gap-2">
                  <Activity className="w-4 h-4 text-rose-400" />
                  RANKING DE MOTIVOS DE DESCUENTO
                </h3>
                <span className="text-[10px] font-bold text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-md border border-rose-500/20 uppercase">
                  Pareto Causal
                </span>
              </div>
              <span className="text-xs font-mono font-bold text-[var(--text-muted)]">
                {filteredData.length.toLocaleString()} registros
              </span>
            </div>

            {/* Top 3 Pills de Causales Críticas */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">
              {top3Motivos.map((m, idx) => (
                <div key={m.motivo} className="p-2 rounded-xl bg-[var(--surface-elevated)] border border-rose-500/20 flex flex-col justify-between">
                  <div className="flex items-center justify-between gap-1 text-[10px]">
                    <span className="font-black text-rose-400 bg-rose-500/15 px-1.5 py-0.2 rounded border border-rose-500/20">
                      #{idx + 1}
                    </span>
                    <span className="font-mono font-bold text-rose-400">
                      {m.value} ({m.pct}%)
                    </span>
                  </div>
                  <p className="text-[11px] font-bold text-[var(--text-primary)] truncate mt-1" title={m.motivo}>
                    {m.motivo}
                  </p>
                </div>
              ))}
            </div>

            <div className="h-[230px] w-full pt-1">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byMotivo.slice(0, 8)} margin={{ top: 15, right: 15, left: -20, bottom: 25 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
                  <XAxis 
                    dataKey="motivo" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: 'var(--text-secondary)', fontSize: 9.5, fontWeight: 'bold' }} 
                    angle={-15} 
                    textAnchor="end" 
                    interval={0}
                    height={35}
                  />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: 'var(--text-muted)', fontSize: 10 }} />
                  <RechartsTooltip 
                    cursor={{ fill: 'rgba(244,63,94,0.08)' }} 
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const m = payload[0]?.payload
                        return (
                          <div className="p-3 rounded-xl bg-[var(--surface-elevated)] border border-[var(--border-subtle)] text-xs shadow-2xl space-y-1">
                            <p className="font-black text-rose-400 uppercase">{m?.motivo}</p>
                            <p className="font-bold text-[var(--text-primary)] text-sm">Total Descuentos: {m?.value}</p>
                            <p className="text-cyan-400 text-[11px] font-bold">Impacto Causal: {m?.pct}% del universo</p>
                          </div>
                        )
                      }
                      return null
                    }}
                  />
                  <Bar dataKey="value" fill="#f43f5e" radius={[6, 6, 0, 0]} maxBarSize={36}>
                    <LabelList dataKey="value" position="top" fill="var(--text-primary)" fontSize={10} fontWeight="bold" />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

      </div>

      {/* ── 4. NIVEL 3: TABLA DETALLADA / MATRIZ % (ANCHO COMPLETO Y ELEGANTE) ── */}
      <div className="bg-[var(--surface)] p-5 rounded-2xl border border-[var(--border-subtle)] shadow-lg space-y-4">
        
        {/* Table Toolbar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[var(--border-subtle)]">
          <div className="relative flex-1 max-w-md">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              type="text"
              value={searchDocumento}
              onChange={(e) => setSearchDocumento(e.target.value)}
              placeholder="Buscar por DNI, postulante o motivo..."
              className="w-full h-9 pl-9 pr-8 rounded-xl bg-[var(--surface-elevated)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] outline-none focus:border-cyan-500 transition-colors font-medium"
            />
            {searchDocumento && (
              <button onClick={() => setSearchDocumento('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer">
                <X size={14} />
              </button>
            )}
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs text-[var(--text-muted)] font-mono font-bold">
              Mostrando <strong className="text-[var(--text-primary)]">{Math.min(visibleRows, filteredData.length)}</strong> de {filteredData.length.toLocaleString()} registros
            </span>
            {filteredData.length > visibleRows && (
              <button
                onClick={() => setVisibleRows(prev => prev + 200)}
                className="px-3 py-1 text-xs font-bold rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 transition-all cursor-pointer"
              >
                + Cargar más
              </button>
            )}
          </div>
        </div>

        {/* Scrollable Table View */}
        <div 
          className="overflow-x-auto max-h-[440px] border border-[var(--border-subtle)] rounded-xl relative custom-scrollbar"
          onScroll={(e) => {
            const { scrollTop, scrollHeight, clientHeight } = e.currentTarget
            if (scrollHeight - scrollTop - clientHeight < 200 && visibleRows < filteredData.length) {
              setVisibleRows(prev => Math.min(prev + 100, filteredData.length))
            }
          }}
        >
          {viewMode === 'TABLA GENERAL' ? (
            <table className="w-full text-left text-xs whitespace-nowrap border-separate border-spacing-0">
              <thead className="bg-[var(--surface-elevated)] sticky top-0 z-20 text-[10px] uppercase font-black text-[var(--text-muted)] tracking-wider border-b border-[var(--border-subtle)]">
                <tr>
                  <th className="px-3 py-3 border-r border-b border-[var(--border-subtle)]">SEDE</th>
                  <th className="px-3 py-3 border-r border-b border-[var(--border-subtle)]">SEGMENTO</th>
                  <th className="px-3 py-3 border-r border-b border-[var(--border-subtle)] font-mono">GPE</th>
                  <th className="px-3 py-3 border-r border-b border-[var(--border-subtle)]">CAMPAÑA</th>
                  <th className="px-3 py-3 border-r border-b border-[var(--border-subtle)]">SUPERVISOR</th>
                  <th className="px-3 py-3 border-r border-b border-[var(--border-subtle)]">FORMADOR</th>
                  <th className="px-3 py-3 border-r border-b border-[var(--border-subtle)] font-mono">DNI/CE</th>
                  <th className="px-3 py-3 border-r border-b border-[var(--border-subtle)]">POSTULANTE</th>
                  <th className="px-3 py-3 border-r border-b border-[var(--border-subtle)] font-mono">FECHA BAJA</th>
                  <th className="px-3 py-3 border-r border-b border-[var(--border-subtle)]">MOTIVO</th>
                  <th className="px-3 py-3 border-r border-b border-[var(--border-subtle)] text-center">PROCEDE</th>
                  <th className="px-3 py-3 border-b border-[var(--border-subtle)]">COMENTARIO RYS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {filteredData.slice(0, visibleRows).map((row, i) => (
                  <tr key={row.id || i} className="hover:bg-[var(--surface-hover)] transition-colors font-medium">
                    <td className="px-3 py-2.5 border-r border-b border-[var(--border-subtle)] text-[var(--text-muted)]">{row.sede}</td>
                    <td className="px-3 py-2.5 border-r border-b border-[var(--border-subtle)] text-[var(--text-secondary)]">{row.segmento}</td>
                    <td className="px-3 py-2.5 border-r border-b border-[var(--border-subtle)] font-mono font-bold text-cyan-400">{row.grupo_cap}</td>
                    <td className="px-3 py-2.5 border-r border-b border-[var(--border-subtle)] text-[var(--text-primary)]">{row.campana}</td>
                    <td className="px-3 py-2.5 border-r border-b border-[var(--border-subtle)] text-[var(--text-secondary)]">{row.supervisor}</td>
                    <td className="px-3 py-2.5 border-r border-b border-[var(--border-subtle)] text-[var(--text-secondary)]">{row.formador}</td>
                    <td className="px-3 py-2.5 border-r border-b border-[var(--border-subtle)] font-mono font-bold text-[var(--text-primary)]">{row.dni_ce}</td>
                    <td className="px-3 py-2.5 border-r border-b border-[var(--border-subtle)] font-semibold text-[var(--text-primary)]">{row.postulante}</td>
                    <td className="px-3 py-2.5 border-r border-b border-[var(--border-subtle)] font-mono text-[var(--text-muted)]">{row.fecha_baja}</td>
                    <td className="px-3 py-2.5 border-r border-b border-[var(--border-subtle)] text-[var(--text-primary)]">{row.motivo}</td>
                    <td className="px-3 py-2.5 border-r border-b border-[var(--border-subtle)] text-center">
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider ${
                        (row.procede || '').toUpperCase() === 'PROCEDE' || (row.procede || '').toUpperCase() === 'SI'
                          ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' :
                        (row.procede || '').toUpperCase() === 'NO PROCEDE' || (row.procede || '').toUpperCase() === 'NO'
                          ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30' :
                          'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                      }`}>
                        {row.procede || 'PENDIENTE'}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 border-b border-[var(--border-subtle)] text-[var(--text-muted)] max-w-xs truncate" title={row.comentario_rys}>
                      {row.comentario_rys || '—'}
                    </td>
                  </tr>
                ))}
                {filteredData.length === 0 && (
                  <tr>
                    <td colSpan={12} className="px-4 py-16 text-center text-[var(--text-muted)]">
                      <AlertCircle size={32} className="mx-auto mb-2 opacity-40 text-rose-500" />
                      <p className="font-bold text-xs">No hay registros de descuentos con los filtros aplicados.</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-left text-xs whitespace-nowrap border-separate border-spacing-0">
              <thead className="bg-[var(--surface-elevated)] sticky top-0 z-20 text-[10px] uppercase font-black text-[var(--text-muted)] tracking-wider border-b border-[var(--border-subtle)]">
                <tr>
                  <th className="sticky left-0 z-30 px-3 py-3 border-r border-b border-[var(--border-subtle)] text-cyan-400 bg-[var(--surface-elevated)] tracking-wider">
                    CAMPAÑA
                  </th>
                  {matrixData.topMotivos.map(m => (
                    <th key={m} className="px-3 py-3 border-r border-b border-[var(--border-subtle)] text-center max-w-[140px] truncate bg-[var(--surface-elevated)]" title={m}>
                      {m}
                    </th>
                  ))}
                  <th className="px-3 py-3 border-b border-[var(--border-subtle)] text-rose-400 text-center bg-[var(--surface-elevated)]">
                    TOTAL
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {matrixData.rows.map((row) => (
                  <tr key={row.campana} className="hover:bg-[var(--surface-hover)] transition-colors font-medium">
                    <td className="sticky left-0 z-10 px-3 py-2.5 border-r border-b border-[var(--border-subtle)] font-bold text-[var(--text-primary)] bg-[var(--surface)]">
                      {row.campana}
                    </td>
                    {matrixData.topMotivos.map(m => {
                      const val = row[m]
                      const pct = matrixData.grandTotal > 0 ? ((val / matrixData.grandTotal) * 100).toFixed(1) : 0
                      const hasVal = val > 0
                      return (
                        <td key={m} className="px-3 py-2.5 border-r border-b border-[var(--border-subtle)] text-center relative">
                          {hasVal ? (
                            <div className="flex items-center justify-center gap-1.5">
                              <span className="text-[11px] font-mono font-bold text-rose-400">{pct}%</span>
                              <span className="text-[10px] text-[var(--text-muted)] font-mono">({val})</span>
                            </div>
                          ) : (
                            <span className="text-[10px] text-[var(--text-muted)] opacity-30">—</span>
                          )}
                        </td>
                      )
                    })}
                    <td className="px-3 py-2.5 border-b border-[var(--border-subtle)] text-center text-xs font-black text-rose-400 font-mono bg-[var(--surface-elevated)]/40">
                      {row.total}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-[var(--surface-elevated)] sticky bottom-0 z-20 border-t-2 border-[var(--border-subtle)]">
                <tr>
                  <td className="sticky left-0 z-30 px-3 py-3 border-r border-[var(--border-subtle)] font-black text-xs text-[var(--text-primary)] bg-[var(--surface-elevated)]">
                    TOTAL GENERAL
                  </td>
                  {matrixData.topMotivos.map(m => (
                    <td key={m} className="px-3 py-3 border-r border-[var(--border-subtle)] text-center font-black text-xs text-rose-400 font-mono">
                      {matrixData.grandTotal > 0 ? ((matrixData.colTotals[m] / matrixData.grandTotal) * 100).toFixed(1) : 0}%
                    </td>
                  ))}
                  <td className="px-3 py-3 text-center font-black text-sm text-rose-400 font-mono">
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
