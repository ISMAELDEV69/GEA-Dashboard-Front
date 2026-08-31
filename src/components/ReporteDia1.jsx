import React, { useState, useEffect, useMemo, useRef } from 'react'
import {
  fetchGruposDia1,
  fetchAsistenciasReclutador,
  getDetalleCalibracion,
  calculateMetricasReporteCalibracionFast,
  DB_MODE
} from '../lib/dataService'
import { supabase } from '../lib/supabase'
import {
  RefreshCw, FileText, CheckCircle2, AlertTriangle, Users,
  Layers, ArrowUpRight, ArrowDownRight, Sparkles, TrendingUp,
  SlidersHorizontal, Calendar, Clock, Target, ChevronDown, X, Search
} from 'lucide-react'
import PageLayout from './ui/PageLayout'
import PageHeader from './ui/PageHeader'
import Card from './ui/Card'
import { useToast } from '../context/ToastContext'

function KPICardSkeleton() {
  return (
    <Card className="p-4 flex items-center justify-between shadow-xs border-[var(--border-subtle)] animate-pulse">
      <div className="flex flex-col gap-2 w-full pr-4">
        <div className="h-2.5 w-20 bg-slate-300 dark:bg-slate-700/50 rounded" />
        <div className="h-7 w-28 bg-slate-300 dark:bg-slate-700/60 rounded" />
        <div className="h-2.5 w-36 bg-slate-300 dark:bg-slate-700/40 rounded" />
      </div>
      <div className="h-10 w-10 rounded-xl bg-slate-300 dark:bg-slate-700/50 shrink-0" />
    </Card>
  )
}

const ReporteDia1 = ({ grupos = [], postulantes = [], asistencias = [] }) => {
  const toast = useToast()
  // Dataset crudo en memoria cargado desde Supabase
  const [rawReportData, setRawReportData] = useState([])
  const [loading, setLoading] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [selectedGroupDetail, setSelectedGroupDetail] = useState(null)
  const [discrepancias, setDiscrepancias] = useState([])
  const [loadingDetails, setLoadingDetails] = useState(false)
  const [isInitialized, setIsInitialized] = useState(false)

  // 1. Estado Atómico Consolidado (Single Source of Truth)
  const [filters, setFilters] = useState({
    periodo: '',
    semana: '',
    segmento: '',
    campana: '',
    grupo: ''
  })

  const reqIdRef = useRef(0)

  // Auto-selección inicial al montar con el periodo y semana más reciente
  useEffect(() => {
    if (grupos.length > 0 && !isInitialized) {
      const uniquePeriodos = [...new Set(grupos.map(g => g.periodo ? String(g.periodo).trim() : null).filter(Boolean))].sort().reverse()
      if (uniquePeriodos.length > 0) {
        const latestPeriodo = uniquePeriodos[0]
        const filteredByPeriodo = grupos.filter(g => String(g.periodo).trim() === latestPeriodo)
        const uniqueSemanas = [...new Set(filteredByPeriodo.map(g => g.semana_label ? String(g.semana_label).trim() : null).filter(Boolean))].sort().reverse()
        const latestSemana = uniqueSemanas.length > 0 ? uniqueSemanas[0] : ''

        setFilters(prev => ({
          ...prev,
          periodo: latestPeriodo,
          semana: latestSemana
        }))
      }
      setIsInitialized(true)
    }
  }, [grupos, isInitialized])

  // Carga inicial y sincronización ultrarrápida en memoria
  const loadReport = async (forceInitial = false) => {
    if (grupos.length === 0) return
    const currentReqId = ++reqIdRef.current
    
    // Solo mostrar loading completo si no hay datos en memoria
    if (rawReportData.length === 0 || forceInitial) {
      setLoading(true)
    } else {
      setIsSyncing(true)
    }

    try {
      if (DB_MODE === 'supabase') {
        const bulkResults = await calculateMetricasReporteCalibracionFast(grupos, postulantes, asistencias)
        if (currentReqId === reqIdRef.current) {
          setRawReportData(bulkResults.sort((a, b) => String(b.fecha_inicio || '').localeCompare(String(a.fecha_inicio || ''))))
        }
      } else {
        if (currentReqId === reqIdRef.current) {
          setRawReportData([])
        }
      }
    } catch (err) {
      console.error("Error al cargar el reporte del Día 1:", err)
      toast.error('Error al cargar reporte Día 1', err.message || 'No se pudo procesar la información.')
    } finally {
      if (currentReqId === reqIdRef.current) {
        setLoading(false)
        setIsSyncing(false)
      }
    }
  }

  // Ejecutar cuando lleguen grupos, postulantes o asistencias
  useEffect(() => {
    if (grupos.length > 0) {
      loadReport()
    }
  }, [grupos.length, postulantes.length, asistencias.length])

  // Escuchar refresco global
  useEffect(() => {
    const handleRefresh = () => loadReport(true)
    window.addEventListener('gea-global-refresh', handleRefresh)
    return () => window.removeEventListener('gea-global-refresh', handleRefresh)
  }, [grupos, postulantes, asistencias])

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. OPCIONES DE DROPDOWNS EN CASCADA (Derivación pura en memoria)
  // ─────────────────────────────────────────────────────────────────────────────
  const optPeriodo = useMemo(() => {
    return [...new Set(grupos.map(g => g.periodo ? String(g.periodo).trim() : null).filter(Boolean))].sort().reverse()
  }, [grupos])

  const optSemana = useMemo(() => {
    let filtered = grupos
    if (filters.periodo) {
      filtered = filtered.filter(g => String(g.periodo || '').trim() === filters.periodo)
    }
    const unique = [...new Set(filtered.map(g => {
      const s = g.semana_label || (g.semana_trabajo ? `SEM ${g.semana_trabajo}` : '')
      if (!s) return null
      const num = String(s).replace(/\D/g, '')
      return num ? `SEM ${num}` : String(s).trim().toUpperCase()
    }).filter(Boolean))]
    return unique.sort((a, b) => {
      const numA = parseInt(String(a).replace(/\D/g, ''), 10) || 0
      const numB = parseInt(String(b).replace(/\D/g, ''), 10) || 0
      return numA - numB
    })
  }, [grupos, filters.periodo])

  const optSegmento = useMemo(() => {
    let filtered = grupos
    if (filters.periodo) {
      filtered = filtered.filter(g => String(g.periodo || '').trim() === filters.periodo)
    }
    if (filters.semana) {
      const numF = parseInt(String(filters.semana).replace(/\D/g, ''), 10)
      filtered = filtered.filter(g => {
        const s = g.semana_label || (g.semana_trabajo ? `SEM ${g.semana_trabajo}` : '')
        const numG = parseInt(String(s).replace(/\D/g, ''), 10)
        if (!isNaN(numF) && !isNaN(numG)) return numF === numG
        return String(s || '').trim().toUpperCase() === String(filters.semana).trim().toUpperCase()
      })
    }
    return [...new Set(filtered.map(g => g.segmento ? String(g.segmento).trim() : null).filter(Boolean))].sort()
  }, [grupos, filters.periodo, filters.semana])

  const optCampana = useMemo(() => {
    let filtered = grupos
    if (filters.periodo) {
      filtered = filtered.filter(g => String(g.periodo || '').trim() === filters.periodo)
    }
    if (filters.semana) {
      filtered = filtered.filter(g => String(g.semana_label || '').trim() === filters.semana)
    }
    if (filters.segmento) {
      filtered = filtered.filter(g => String(g.segmento || '').trim() === filters.segmento)
    }
    return [...new Set(filtered.map(g => g.campana ? String(g.campana).trim() : null).filter(Boolean))].sort()
  }, [grupos, filters.periodo, filters.semana, filters.segmento])

  const optGrupo = useMemo(() => {
    let filtered = grupos
    if (filters.periodo) {
      filtered = filtered.filter(g => String(g.periodo || '').trim() === filters.periodo)
    }
    if (filters.semana) {
      filtered = filtered.filter(g => String(g.semana_label || '').trim() === filters.semana)
    }
    if (filters.segmento) {
      filtered = filtered.filter(g => String(g.segmento || '').trim() === filters.segmento)
    }
    if (filters.campana) {
      filtered = filtered.filter(g => String(g.campana || '').trim() === filters.campana)
    }
    
    const unique = []
    const seen = new Set()
    for (const g of filtered) {
      const code = String(g.codigo || '').trim()
      if (code && !seen.has(code.toUpperCase())) {
        seen.add(code.toUpperCase())
        unique.push(g)
      }
    }
    return unique.sort((a, b) => String(a.codigo).localeCompare(String(b.codigo)))
  }, [grupos, filters.periodo, filters.semana, filters.segmento, filters.campana])

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. FILTRADO ESTRICTO REACTIVO EN MEMORIA (0 ms - Sin substring ni match parcial)
  // ─────────────────────────────────────────────────────────────────────────────
  const filteredReportData = useMemo(() => {
    return rawReportData.filter(r => {
      if (filters.periodo && String(r.periodo || '').trim() !== filters.periodo) {
        return false
      }
      if (filters.semana && String(r.semana_label || '').trim() !== filters.semana) {
        return false
      }
      if (filters.segmento && String(r.segmento || '').trim() !== filters.segmento) {
        return false
      }
      if (filters.campana && String(r.campana || '').trim() !== filters.campana) {
        return false
      }
      if (filters.grupo && String(r.grupo_codigo || '').trim() !== filters.grupo) {
        return false
      }
      return true
    })
  }, [rawReportData, filters.periodo, filters.semana, filters.segmento, filters.campana, filters.grupo])

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. KPIS CALCULADOS DIRECTAMENTE SOBRE EL DATASET FILTRADO (filteredReportData)
  // ─────────────────────────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const totalFilas = filteredReportData.length
    const gruposUnicosSet = new Set(filteredReportData.map(r => String(r.grupo_codigo || '').trim()).filter(Boolean))
    const totalGruposUnicos = gruposUnicosSet.size

    const calibrados = filteredReportData.filter(r => r.estado === 'CALIBRADO').length
    const descalibrados = filteredReportData.filter(r => r.estado === 'DESCALIBRADO').length
    const pendientes = filteredReportData.filter(r => r.estado === 'PENDIENTE').length
    const totalNomina = filteredReportData.reduce((acc, r) => acc + (Number(r.total_nomina) || 0), 0)
    const totalDia0 = filteredReportData.reduce((acc, r) => acc + (Number(r.total_dia0) || 0), 0)
    const sumRec = filteredReportData.reduce((acc, r) => acc + (Number(r.total_reclutador) || 0), 0)
    const sumForm = filteredReportData.reduce((acc, r) => acc + (Number(r.total_formador) || 0), 0)
    const pctCalibracion = totalFilas > 0 ? Math.round((calibrados / totalFilas) * 100) : 0
    const delta = sumForm - sumRec

    return {
      totalFilas,
      totalGruposUnicos,
      calibrados,
      descalibrados,
      pendientes,
      totalNomina,
      totalDia0,
      sumRec,
      sumForm,
      pctCalibracion,
      delta
    }
  }, [filteredReportData])

  // ─────────────────────────────────────────────────────────────────────────────
  // 5. HANDLERS DE FILTRO ATÓMICOS
  // ─────────────────────────────────────────────────────────────────────────────
  const handlePeriodoChange = (val) => {
    setFilters(prev => ({
      ...prev,
      periodo: val,
      semana: '',
      segmento: '',
      campana: '',
      grupo: ''
    }))
  }

  const handleSemanaChange = (val) => {
    setFilters(prev => ({
      ...prev,
      semana: val,
      segmento: '',
      campana: '',
      grupo: ''
    }))
  }

  const handleSegmentoChange = (val) => {
    setFilters(prev => {
      // Si la campaña actual pertenece al nuevo segmento, se conserva; de lo contrario se resetea
      const validCampanas = val 
        ? grupos.filter(g => (!prev.periodo || String(g.periodo).trim() === prev.periodo) &&
                             (!prev.semana || String(g.semana_label).trim() === prev.semana) &&
                             String(g.segmento || '').trim() === val)
                .map(g => String(g.campana || '').trim())
        : []
      const keepCampana = prev.campana && validCampanas.includes(prev.campana) ? prev.campana : ''

      return {
        ...prev,
        segmento: val,
        campana: keepCampana,
        grupo: ''
      }
    })
  }

  const handleCampanaChange = (val) => {
    setFilters(prev => {
      // Si no había segmento seleccionado y se elige una campaña, auto-inferir el segmento
      let autoSegmento = prev.segmento
      if (val && !prev.segmento) {
        const found = grupos.find(g => String(g.campana || '').trim() === val && g.segmento)
        if (found) autoSegmento = String(found.segmento).trim()
      }

      return {
        ...prev,
        segmento: autoSegmento,
        campana: val,
        grupo: ''
      }
    })
  }

  const handleGrupoChange = (val) => {
    setFilters(prev => ({
      ...prev,
      grupo: val
    }))
  }

  const handleRowClick = async (row) => {
    if (row.estado !== 'DESCALIBRADO') {
      setSelectedGroupDetail(null)
      setDiscrepancias([])
      return
    }
    
    if (selectedGroupDetail === row.grupo_codigo) {
      setSelectedGroupDetail(null)
      return
    }

    setSelectedGroupDetail(row.grupo_codigo)
    setLoadingDetails(true)
    try {
      const detalles = await getDetalleCalibracion(row.grupo_codigo, row.campana)
      setDiscrepancias(detalles || [])
    } catch (err) {
      console.error('Error al cargar detalles de discrepancia:', err)
      toast.error('Error al cargar detalles', err.message || 'No se pudo obtener el desglose de discrepancias.')
    } finally {
      setLoadingDetails(false)
    }
  }

  // Buscador rápido en tabla (in-memory)
  const [tableSearch, setTableSearch] = useState('')

  const displayedReportData = useMemo(() => {
    if (!tableSearch.trim()) return filteredReportData
    const q = tableSearch.toLowerCase().trim()
    return filteredReportData.filter(r => 
      String(r.grupo_codigo || '').toLowerCase().includes(q) ||
      String(r.campana || '').toLowerCase().includes(q)
    )
  }, [filteredReportData, tableSearch])

  const handleResetFilters = () => {
    setFilters({
      periodo: '',
      semana: '',
      segmento: '',
      campana: '',
      grupo: ''
    })
    setTableSearch('')
  }

  const getStatusBadge = (estado) => {
    if (estado === 'CALIBRADO') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold tracking-tight bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 shadow-xs">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400 shrink-0" />
          CALIBRADO
        </span>
      )
    }
    if (estado === 'DESCALIBRADO') {
      return (
        <div className="inline-flex flex-col items-center">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold tracking-tight bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/35 shadow-xs animate-pulse">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 dark:bg-rose-400 shrink-0" />
            DESCALIBRADO
          </span>
          <span className="text-[9px] text-rose-600 dark:text-rose-400/80 font-medium tracking-tight mt-0.5">
            Ver discrepancias →
          </span>
        </div>
      )
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium tracking-tight bg-[var(--bg-muted)] text-[var(--text-muted)] border border-[var(--border-normal)]">
        <span className="w-1.5 h-1.5 rounded-full bg-[var(--text-muted)]/60 shrink-0" />
        PENDIENTE
      </span>
    )
  }

  // Indicador de filtros activos
  const activeFiltersCount = useMemo(() => {
    let count = 0
    if (filters.periodo) count++
    if (filters.semana) count++
    if (filters.segmento) count++
    if (filters.campana) count++
    if (filters.grupo) count++
    return count
  }, [filters])

  return (
    <PageLayout>
      {/* ─────────────────────────────────────────────────────────────
          HEADER HERO CON BADGE EN VIVO
          ───────────────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6 pb-5 border-b border-[var(--border-normal)]">
        <div>
          <div className="flex items-center gap-2.5 mb-1.5">
            <div className="p-2 rounded-xl bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--accent)]/20 shadow-xs">
              <FileText size={18} />
            </div>
            <h1 className="text-xl md:text-2xl font-black tracking-tight text-[var(--text-primary)]">
              REPORTE DE CALIBRACIÓN <span className="text-[var(--accent)]">— DÍA 1</span>
            </h1>
            <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 shadow-xs">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400 animate-ping" />
              Live Audit
            </span>
          </div>
          <p className="text-xs text-[var(--text-muted)] font-medium flex items-center gap-2">
            <span>Auditoría de asistencia inicial: Reclutamiento vs Formación</span>
            <span className="text-[var(--border-normal)]">•</span>
            <span className="font-mono font-bold text-[var(--text-secondary)]">{kpis.totalFilas} grupos procesados</span>
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            onClick={() => loadReport(false)}
            disabled={loading || isSyncing}
            className="px-4 py-2 rounded-xl text-xs font-bold text-[var(--text-primary)] bg-[var(--bg-surface)] hover:bg-[var(--bg-elevated)] border border-[var(--border-normal)] hover:border-[var(--accent)] transition-all flex items-center gap-2 shadow-xs cursor-pointer"
          >
            <RefreshCw size={13} className={(loading || isSyncing) ? 'animate-spin text-[var(--accent)]' : 'text-[var(--text-muted)]'} />
            <span>{isSyncing ? 'Sincronizando...' : 'Refrescar Datos'}</span>
          </button>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          1. BARRA DE COMANDO DE FILTROS (THEME ENGINE SYNCED)
          ───────────────────────────────────────────────────────────── */}
      <div className="mb-6 bg-[var(--bg-surface)] border border-[var(--border-normal)] rounded-2xl p-4 shadow-xs">
        <div className="flex items-center justify-between mb-3 pb-2.5 border-b border-[var(--border-subtle)]">
          <div className="flex items-center gap-2">
            <SlidersHorizontal size={14} className="text-[var(--accent)]" />
            <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary)]">
              Filtros Operativos
            </span>
            {activeFiltersCount > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--accent)]/30">
                {activeFiltersCount} activos
              </span>
            )}
          </div>
          {activeFiltersCount > 0 && (
            <button
              onClick={handleResetFilters}
              className="text-[11px] font-bold text-[var(--text-muted)] hover:text-rose-500 flex items-center gap-1 transition-colors cursor-pointer"
            >
              <X size={12} />
              Limpiar filtros
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Periodo */}
          <div className="flex flex-col">
            <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1.5 flex items-center gap-1">
              <Calendar size={11} className="text-[var(--text-muted)]" />
              Periodo
            </label>
            <div className="relative">
              <select
                value={filters.periodo}
                onChange={e => handlePeriodoChange(e.target.value)}
                className="w-full px-3 py-2 text-xs font-bold rounded-xl bg-[var(--input-bg)] border border-[var(--input-border)] focus:border-[var(--accent)] text-[var(--text-primary)] transition-all cursor-pointer appearance-none pr-8"
              >
                <option value="" className="bg-[var(--bg-surface)] text-[var(--text-primary)]">Todos los Periodos</option>
                {optPeriodo.map(o => (
                  <option key={o} value={o} className="bg-[var(--bg-surface)] text-[var(--text-primary)]">{o}</option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none" />
            </div>
          </div>

          {/* Semana */}
          <div className="flex flex-col">
            <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1.5 flex items-center gap-1">
              <Clock size={11} className="text-[var(--text-muted)]" />
              Semana
            </label>
            <div className="relative">
              <select
                value={filters.semana}
                onChange={e => handleSemanaChange(e.target.value)}
                className="w-full px-3 py-2 text-xs font-bold rounded-xl bg-[var(--input-bg)] border border-[var(--input-border)] focus:border-[var(--accent)] text-[var(--text-primary)] transition-all cursor-pointer appearance-none pr-8"
              >
                <option value="" className="bg-[var(--bg-surface)] text-[var(--text-primary)]">Todas las Semanas</option>
                {optSemana.map(o => (
                  <option key={o} value={o} className="bg-[var(--bg-surface)] text-[var(--text-primary)]">{o}</option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none" />
            </div>
          </div>

          {/* Segmento */}
          <div className="flex flex-col">
            <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1.5 flex items-center gap-1">
              <Target size={11} className="text-[var(--text-muted)]" />
              Segmento
            </label>
            <div className="relative">
              <select
                value={filters.segmento}
                onChange={e => handleSegmentoChange(e.target.value)}
                className="w-full px-3 py-2 text-xs font-bold rounded-xl bg-[var(--input-bg)] border border-[var(--input-border)] focus:border-[var(--accent)] text-[var(--text-primary)] transition-all cursor-pointer appearance-none pr-8"
              >
                <option value="" className="bg-[var(--bg-surface)] text-[var(--text-primary)]">Todos los Segmentos</option>
                {optSegmento.map(o => (
                  <option key={o} value={o} className="bg-[var(--bg-surface)] text-[var(--text-primary)]">{o}</option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none" />
            </div>
          </div>

          {/* Campaña */}
          <div className="flex flex-col">
            <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1.5 flex items-center gap-1 truncate">
              <Sparkles size={11} className="text-[var(--text-muted)]" />
              Campaña
            </label>
            <div className="relative">
              <select
                value={filters.campana}
                onChange={e => handleCampanaChange(e.target.value)}
                className="w-full px-3 py-2 text-xs font-bold rounded-xl bg-[var(--input-bg)] border border-[var(--input-border)] focus:border-[var(--accent)] text-[var(--text-primary)] transition-all cursor-pointer appearance-none pr-8 truncate"
              >
                <option value="" className="bg-[var(--bg-surface)] text-[var(--text-primary)]">Todas las Campañas</option>
                {optCampana.map(o => (
                  <option key={o} value={o} className="bg-[var(--bg-surface)] text-[var(--text-primary)]">{o}</option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none" />
            </div>
          </div>

          {/* Grupo */}
          <div className="flex flex-col">
            <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1.5 flex items-center gap-1">
              <Users size={11} className="text-[var(--text-muted)]" />
              Grupo GPE
            </label>
            <div className="relative">
              <select
                value={filters.grupo}
                onChange={e => handleGrupoChange(e.target.value)}
                className="w-full px-3 py-2 text-xs font-bold rounded-xl bg-[var(--input-bg)] border border-[var(--input-border)] focus:border-[var(--accent)] text-[var(--text-primary)] transition-all cursor-pointer appearance-none pr-8 truncate"
              >
                <option value="" className="bg-[var(--bg-surface)] text-[var(--text-primary)]">Todos los Grupos</option>
                {optGrupo.map(g => (
                  <option key={g.codigo} value={g.codigo} className="bg-[var(--bg-surface)] text-[var(--text-primary)]">
                    {String(g.codigo).startsWith('PROY-') ? '—' : String(g.codigo).replace(/_\d+$/, '')}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none" />
            </div>
          </div>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          2. KPIS EJECUTIVOS (CALIBRACIÓN DINÁMICA POR TEMA)
          ───────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {loading && rawReportData.length === 0 ? (
          <>
            <KPICardSkeleton />
            <KPICardSkeleton />
            <KPICardSkeleton />
            <KPICardSkeleton />
          </>
        ) : (
          <>
            {/* KPI 1: TOTAL GRUPOS */}
            <div className="relative overflow-hidden bg-[var(--bg-surface)] border border-[var(--border-normal)] hover:border-[var(--accent)] rounded-2xl p-4 flex flex-col justify-between shadow-xs transition-all group">
              <div className="absolute top-0 right-0 w-24 h-24 bg-[var(--accent-glow)] rounded-full blur-2xl pointer-events-none transition-colors" />
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)] flex items-center gap-1.5">
                    <Layers size={13} className="text-[var(--accent)]" />
                    Total Grupos
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--accent)]/30">
                    {kpis.totalFilas} asignaciones
                  </span>
                </div>
                <div className="flex items-baseline gap-2 mt-3">
                  <span className="text-3xl lg:text-4xl font-black text-[var(--text-primary)] font-mono tracking-tight">
                    {kpis.totalGruposUnicos.toLocaleString()}
                  </span>
                  <span className="text-xs font-bold text-[var(--text-muted)]">
                    grupos únicos
                  </span>
                </div>
              </div>
              <div className="text-[11px] font-medium text-[var(--text-muted)] mt-3 pt-2.5 border-t border-[var(--border-subtle)] flex items-center justify-between">
                <span>Nómina Total:</span>
                <span className="font-mono font-bold text-[var(--text-secondary)]">{kpis.totalNomina.toLocaleString()} post.</span>
              </div>
            </div>

            {/* KPI 2: CALIBRADOS */}
            <div className="relative overflow-hidden bg-[var(--bg-surface)] border border-emerald-500/30 hover:border-emerald-500/60 rounded-2xl p-4 flex flex-col justify-between shadow-xs transition-all group">
              <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none transition-colors" />
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                    <CheckCircle2 size={13} className="text-emerald-500" />
                    Calibrados
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                    {kpis.pctCalibracion}% Éxito
                  </span>
                </div>
                <div className="flex items-baseline gap-2 mt-3">
                  <span className="text-3xl lg:text-4xl font-black text-emerald-600 dark:text-emerald-400 font-mono tracking-tight">
                    {kpis.calibrados.toLocaleString()}
                  </span>
                  <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400/90">
                    {kpis.descalibrados === 0 && kpis.calibrados > 0 ? '100% en regla' : `${kpis.pctCalibracion}% en regla`}
                  </span>
                </div>
              </div>
              <div className="text-[11px] font-medium text-[var(--text-muted)] mt-3 pt-2.5 border-t border-[var(--border-subtle)] flex items-center justify-between">
                <span>Estado Recl. vs Form.:</span>
                <span className={kpis.descalibrados > 0 ? 'font-bold text-rose-600 dark:text-rose-400' : 'font-bold text-emerald-600 dark:text-emerald-400'}>
                  {kpis.descalibrados > 0 ? `${kpis.descalibrados} con desvío` : 'Sin desvíos'}
                </span>
              </div>
            </div>

            {/* KPI 3: DESCALIBRADOS */}
            <div className={`relative overflow-hidden rounded-2xl p-4 flex flex-col justify-between shadow-xs transition-all group ${
              kpis.descalibrados > 0 
                ? 'bg-[var(--bg-surface)] border border-rose-500/40 hover:border-rose-500/70 shadow-rose-500/5' 
                : 'bg-[var(--bg-surface)] border border-[var(--border-normal)]'
            }`}>
              <div className={`absolute top-0 right-0 w-24 h-24 rounded-full blur-2xl pointer-events-none transition-colors ${
                kpis.descalibrados > 0 ? 'bg-rose-500/10 dark:bg-rose-500/15' : 'bg-slate-500/5'
              }`} />
              <div>
                <div className="flex items-center justify-between">
                  <span className={`text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 ${
                    kpis.descalibrados > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-[var(--text-muted)]'
                  }`}>
                    <AlertTriangle size={13} className={kpis.descalibrados > 0 ? 'text-rose-500' : 'text-[var(--text-muted)]'} />
                    Descalibrados
                  </span>
                  {kpis.descalibrados > 0 ? (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/35 animate-pulse">
                      ¡Auditar!
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-[var(--bg-muted)] text-[var(--text-muted)] border border-[var(--border-normal)]">
                      0 Desvíos
                    </span>
                  )}
                </div>
                <div className="flex items-baseline gap-2 mt-3">
                  <span className={`text-3xl lg:text-4xl font-black font-mono tracking-tight ${
                    kpis.descalibrados > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-[var(--text-primary)]'
                  }`}>
                    {kpis.descalibrados.toLocaleString()}
                  </span>
                  <span className={`text-xs font-bold ${
                    kpis.descalibrados > 0 ? 'text-rose-600 dark:text-rose-400/90' : 'text-[var(--text-muted)]'
                  }`}>
                    {kpis.descalibrados > 0 ? 'grupos con desvío' : 'calibración óptima'}
                  </span>
                </div>
              </div>
              <div className="text-[11px] font-medium text-[var(--text-muted)] mt-3 pt-2.5 border-t border-[var(--border-subtle)] flex items-center justify-between">
                <span>Acción:</span>
                <span className={kpis.descalibrados > 0 ? 'font-bold text-rose-600 dark:text-rose-400' : 'text-[var(--text-muted)]'}>
                  {kpis.descalibrados > 0 ? 'Clic en fila para ver DNI' : 'En regla'}
                </span>
              </div>
            </div>

            {/* KPI 4: ASISTENCIAS DÍA 1 */}
            <div className="relative overflow-hidden bg-[var(--bg-surface)] border border-[var(--border-normal)] hover:border-purple-500/40 rounded-2xl p-4 flex flex-col justify-between shadow-xs transition-all group">
              <div className="absolute top-0 right-0 w-24 h-24 bg-purple-500/10 rounded-full blur-2xl pointer-events-none transition-colors" />
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-wider text-purple-600 dark:text-purple-400 flex items-center gap-1.5">
                    <Users size={13} className="text-purple-500" />
                    Asistencias Día 1
                  </span>
                  {kpis.delta !== 0 ? (
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-black ${
                      kpis.delta > 0 ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/35' : 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/35'
                    }`}>
                      Δ {kpis.delta > 0 ? `+${kpis.delta}` : kpis.delta}
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25">
                      Exacto
                    </span>
                  )}
                </div>
                <div className="flex items-baseline gap-1 mt-3 font-mono">
                  <span className="text-3xl lg:text-4xl font-black text-[var(--accent)] tracking-tight">
                    {kpis.sumRec}
                  </span>
                  <span className="text-lg text-[var(--text-muted)] font-normal mx-1">/</span>
                  <span className="text-2xl font-black text-purple-600 dark:text-purple-400">
                    {kpis.sumForm}
                  </span>
                </div>
                {/* Micro barra dual de progreso */}
                <div className="w-full bg-[var(--bg-muted)] h-2 rounded-full mt-2.5 overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-[var(--accent)] to-purple-500 transition-all duration-500 rounded-full"
                    style={{
                      width: `${kpis.sumForm > 0 ? Math.min(100, Math.round((kpis.sumRec / kpis.sumForm) * 100)) : 0}%`
                    }}
                  />
                </div>
              </div>
              <div className="text-[11px] font-medium text-[var(--text-muted)] mt-2.5 pt-2 border-t border-[var(--border-subtle)] flex items-center justify-between">
                <span>Reclutador vs Formador:</span>
                <span className="font-mono text-xs font-bold text-[var(--text-secondary)]">
                  {kpis.sumForm > 0 ? `${Math.round((kpis.sumRec / kpis.sumForm) * 100)}%` : '—'}
                </span>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ─────────────────────────────────────────────────────────────
          3. MATRIZ DE CALIBRACIÓN (TABLA THEME-SYNCRONIZED)
          ───────────────────────────────────────────────────────────── */}
      {loading && rawReportData.length === 0 ? (
        <div className="text-center py-20 bg-[var(--bg-surface)] border border-[var(--border-normal)] rounded-2xl">
          <div className="animate-spin h-8 w-8 border-3 border-[var(--accent)] border-t-transparent rounded-full mx-auto mb-3"></div>
          <p className="text-xs text-[var(--text-muted)] font-bold tracking-widest uppercase">Cargando matriz de calibración...</p>
        </div>
      ) : filteredReportData.length === 0 ? (
        <div className="bg-[var(--bg-surface)] border border-[var(--border-normal)] rounded-2xl text-center py-16 px-4 shadow-xs">
          <Layers size={32} className="mx-auto text-[var(--text-muted)] mb-3 opacity-50" />
          <h3 className="text-sm font-bold text-[var(--text-primary)] mb-1">Sin resultados</h3>
          <p className="text-xs text-[var(--text-muted)] max-w-sm mx-auto">No se encontraron grupos con Día 1 para la combinación de filtros seleccionada.</p>
          <button 
            onClick={handleResetFilters}
            className="mt-4 px-4 py-2 rounded-xl text-xs font-bold text-[var(--accent)] bg-[var(--accent-soft)] hover:bg-[var(--accent-soft)]/80 border border-[var(--accent)]/30 transition-all cursor-pointer"
          >
            Restablecer todos los filtros
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="bg-[var(--bg-surface)] border border-[var(--border-normal)] rounded-2xl overflow-hidden shadow-xs">
            {/* Toolbar de la tabla */}
            <div className="p-3.5 border-b border-[var(--border-normal)] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-[var(--bg-elevated)]/50">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider">
                  Matriz de Grupos
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-[var(--bg-surface)] text-[var(--text-secondary)] border border-[var(--border-normal)] shadow-2xs">
                  {displayedReportData.length} de {filteredReportData.length}
                </span>
              </div>

              {/* Buscador rápido */}
              <div className="relative min-w-[240px]">
                <input
                  type="text"
                  value={tableSearch}
                  onChange={e => setTableSearch(e.target.value)}
                  placeholder="Buscar grupo o campaña..."
                  className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl bg-[var(--input-bg)] border border-[var(--input-border)] focus:border-[var(--accent)] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none transition-all"
                />
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                {tableSearch && (
                  <button onClick={() => setTableSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer">
                    <X size={12} />
                  </button>
                )}
              </div>
            </div>

            {/* Contenedor de la tabla con scroll suave */}
            <div className="table-scroll overflow-x-auto max-h-[58vh]">
              <table className="w-full text-xs text-left relative border-collapse">
                <thead className="bg-[var(--table-head-bg)] text-[var(--text-muted)] text-[10px] font-bold uppercase tracking-wider sticky top-0 z-10 border-b border-[var(--border-normal)] shadow-xs">
                  <tr>
                    <th className="px-4 py-3">Código Grupo</th>
                    <th className="px-4 py-3">Campaña</th>
                    <th className="px-3 py-3">F. Inicio</th>
                    <th className="px-3 py-3">Fecha Día 1</th>
                    <th className="px-3 py-3 text-right">Nómina Total</th>
                    <th className="px-3 py-3 text-right">Asist. Día 0</th>
                    <th className="px-3 py-3 text-right">Asist. Día 1 (Recl.)</th>
                    <th className="px-3 py-3 text-right">Asist. Formador</th>
                    <th className="px-4 py-3 text-center">Estado Calibración</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)]">
                  {displayedReportData.map((row) => {
                    const pctDia1 = row.total_nomina > 0 ? Math.round((row.total_reclutador / row.total_nomina) * 100) : 0
                    const isSelected = selectedGroupDetail === row.grupo_codigo
                    
                    return (
                      <tr 
                        key={`${row.grupo_codigo}-${row.campana}`} 
                        onClick={() => handleRowClick(row)}
                        className={`transition-all duration-150 ${
                          row.estado === 'DESCALIBRADO' 
                            ? 'cursor-pointer bg-rose-500/[0.03] hover:bg-rose-500/[0.08] active:scale-[0.998]' 
                            : 'hover:bg-[var(--bg-elevated)]/50'
                        } ${isSelected ? 'bg-rose-500/[0.12] ring-1 ring-inset ring-rose-500/40' : ''}`}
                      >
                        {/* Grupo */}
                        <td className="px-4 py-2.5">
                          <span className="font-mono font-bold text-xs text-[var(--accent)] bg-[var(--accent-soft)] border border-[var(--accent)]/30 px-2.5 py-0.5 rounded-md shadow-2xs">
                            {row.grupo_codigo}
                          </span>
                        </td>

                        {/* Campaña */}
                        <td className="px-4 py-2.5 text-[var(--text-primary)] font-bold max-w-[220px] truncate">
                          {row.campana}
                        </td>

                        {/* Inicio */}
                        <td className="px-3 py-2.5 text-[var(--text-muted)] font-mono text-[11px]">
                          {row.fecha_inicio || '—'}
                        </td>

                        {/* Día 1 */}
                        <td className="px-3 py-2.5 font-mono text-[11px]">
                          {row.fecha_dia1 ? (
                            <span className="text-[var(--text-secondary)] font-bold">{row.fecha_dia1}</span>
                          ) : (
                            <span className="text-[var(--text-muted)] italic">No definida</span>
                          )}
                        </td>

                        {/* Nómina */}
                        <td className="px-3 py-2.5 text-right font-mono font-black text-[var(--text-primary)] tabular-nums text-xs">
                          {row.total_nomina}
                        </td>

                        {/* Día 0 */}
                        <td className="px-3 py-2.5 text-right font-mono font-bold text-[var(--text-secondary)] tabular-nums text-xs">
                          {row.total_dia0}
                        </td>

                        {/* Día 1 Reclutador */}
                        <td className="px-3 py-2.5 text-right tabular-nums">
                          <div className="inline-flex items-center justify-end gap-2.5">
                            <span className="font-mono font-black text-[var(--accent)] text-xs">
                              {row.total_reclutador}
                            </span>
                            {row.total_nomina > 0 && (
                              <div className="w-12 bg-[var(--bg-muted)] h-1.5 rounded-full overflow-hidden shrink-0" title={`${pctDia1}% de la nómina`}>
                                <div 
                                  className="h-full bg-gradient-to-r from-blue-500 to-[var(--accent)] rounded-full" 
                                  style={{ width: `${Math.min(100, pctDia1)}%` }} 
                                />
                              </div>
                            )}
                          </div>
                        </td>

                        {/* Asist Formador */}
                        <td className="px-3 py-2.5 text-right font-mono font-black text-purple-600 dark:text-purple-400 tabular-nums text-xs">
                          {row.total_formador}
                        </td>

                        {/* Estado */}
                        <td className="px-4 py-2.5 text-center">
                          {getStatusBadge(row.estado)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* ─────────────────────────────────────────────────────────────
              DETALLE DE DISCREPANCIAS (DRAWER / PANEL EN VIVO)
              ───────────────────────────────────────────────────────────── */}
          {selectedGroupDetail && (
            <div className="bg-[var(--bg-surface)] border border-rose-500/40 rounded-2xl p-5 shadow-md shadow-rose-500/5 animate-fadeIn">
              <div className="flex items-center justify-between pb-3.5 mb-4 border-b border-[var(--border-normal)]">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30">
                    <AlertTriangle size={16} />
                  </div>
                  <div>
                    <h3 className="text-xs font-black uppercase tracking-wider text-[var(--text-primary)]">
                      Auditoría de Discrepancias — Grupo: <span className="font-mono text-rose-600 dark:text-rose-400">{selectedGroupDetail}</span>
                    </h3>
                    <p className="text-[11px] text-[var(--text-muted)] font-medium">Comparación uno a uno de marcas entre Reclutamiento y Formación</p>
                  </div>
                </div>
                <button 
                  onClick={() => setSelectedGroupDetail(null)}
                  className="px-3 py-1.5 rounded-lg text-xs text-[var(--text-muted)] hover:text-rose-600 dark:hover:text-white bg-[var(--bg-elevated)] hover:bg-rose-500/20 border border-[var(--border-normal)] transition-all font-bold cursor-pointer"
                >
                  Cerrar Auditoría ✕
                </button>
              </div>
              
              {loadingDetails ? (
                <div className="text-center py-8">
                  <div className="animate-spin h-5 w-5 border-2 border-rose-500 border-t-transparent rounded-full mx-auto mb-2"></div>
                  <p className="text-xs text-[var(--text-muted)] font-mono">Cargando discrepancias del grupo...</p>
                </div>
              ) : discrepancias.length === 0 ? (
                <div className="text-center py-8 text-xs text-[var(--text-muted)] bg-[var(--bg-base)] rounded-xl p-4 border border-[var(--border-normal)]">
                  No se encontraron discrepancias directas por documento (la descalibración puede deberse a una diferencia en la cantidad total de registros).
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-[var(--border-normal)] shadow-xs">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[var(--table-head-bg)] text-[var(--text-muted)] text-[10px] font-bold uppercase tracking-wider border-b border-[var(--border-normal)]">
                      <tr>
                        <th className="px-4 py-2.5">Documento</th>
                        <th className="px-4 py-2.5">Postulante</th>
                        <th className="px-4 py-2.5 text-center border-l border-[var(--border-normal)]">Reclutador Marcó</th>
                        <th className="px-4 py-2.5 text-center border-l border-[var(--border-normal)]">Formador Marcó</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border-subtle)] bg-[var(--bg-surface)]">
                      {discrepancias.map(d => (
                        <tr key={d.documento} className="hover:bg-[var(--bg-elevated)]/50 transition-colors">
                          <td className="px-4 py-2.5 font-mono font-bold text-xs text-[var(--text-primary)]">{d.documento}</td>
                          <td className="px-4 py-2.5 text-[var(--text-primary)] font-bold">{d.nombre}</td>
                          <td className="px-4 py-2.5 text-center border-l border-[var(--border-normal)]">
                            <span className="px-2.5 py-1 rounded-md font-mono font-bold text-xs bg-[var(--bg-base)] text-[var(--text-primary)] border border-[var(--border-normal)]">
                              {d.sigla_reclutador || '—'}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-center border-l border-[var(--border-normal)]">
                            <span className="px-2.5 py-1 rounded-md font-mono font-bold text-xs bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                              {d.sigla_formador || '—'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </PageLayout>
  )
}

export default ReporteDia1
