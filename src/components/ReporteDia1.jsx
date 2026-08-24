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
  Layers, ArrowUpRight, ArrowDownRight, Sparkles, TrendingUp
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
    return [...new Set(filtered.map(g => g.semana_label ? String(g.semana_label).trim() : null).filter(Boolean))].sort()
  }, [grupos, filters.periodo])

  const optSegmento = useMemo(() => {
    let filtered = grupos
    if (filters.periodo) {
      filtered = filtered.filter(g => String(g.periodo || '').trim() === filters.periodo)
    }
    if (filters.semana) {
      filtered = filtered.filter(g => String(g.semana_label || '').trim() === filters.semana)
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

  const getStatusBadge = (estado) => {
    if (estado === 'CALIBRADO') return <span className="bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 border border-emerald-500/30 px-3 py-1 rounded-full text-xs font-bold">🟢 CALIBRADO</span>
    if (estado === 'DESCALIBRADO') return <span className="bg-rose-500/20 text-rose-600 dark:text-rose-300 border border-rose-500/30 px-3 py-1 rounded-full text-xs font-bold shadow-xs">🔴 DESCALIBRADO</span>
    return <span className="bg-slate-500/20 text-slate-600 dark:text-slate-300 border border-slate-500/30 px-3 py-1 rounded-full text-xs font-bold">⚪ PENDIENTE</span>
  }

  return (
    <PageLayout>
      <PageHeader
        title="REPORTE DE CALIBRACIÓN – DÍA 1"
        subtitle="Métricas de asistencia iniciales"
        icon={<FileText className="text-[var(--accent)]" />}
        actions={
          <button
            onClick={() => loadReport(false)}
            disabled={loading || isSyncing}
            className="btn btn-primary flex items-center gap-2"
          >
            <RefreshCw size={16} className={(loading || isSyncing) ? 'animate-spin' : ''} />
            {isSyncing ? 'Sincronizando...' : 'Refrescar Reporte'}
          </button>
        }
      />

      {/* ─────────────────────────────────────────────────────────────
          1. FILTROS EN CASCADA CON ESTADO ATÓMICO
          ───────────────────────────────────────────────────────────── */}
      <Card className="mb-4">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div>
            <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5 ml-1">Periodo</label>
            <select
              value={filters.periodo}
              onChange={e => handlePeriodoChange(e.target.value)}
              className="form-input w-full p-2.5"
            >
              <option value="">Todos</option>
              {optPeriodo.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5 ml-1">Semana</label>
            <select
              value={filters.semana}
              onChange={e => handleSemanaChange(e.target.value)}
              className="form-input w-full p-2.5"
            >
              <option value="">Todas</option>
              {optSemana.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5 ml-1">Segmento</label>
            <select
              value={filters.segmento}
              onChange={e => handleSegmentoChange(e.target.value)}
              className="form-input w-full p-2.5"
            >
              <option value="">Todos</option>
              {optSegmento.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5 ml-1">Campaña</label>
            <select
              value={filters.campana}
              onChange={e => handleCampanaChange(e.target.value)}
              className="form-input w-full p-2.5"
            >
              <option value="">Todas</option>
              {optCampana.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5 ml-1">Grupo (GPE)</label>
            <select
              value={filters.grupo}
              onChange={e => handleGrupoChange(e.target.value)}
              className="form-input w-full p-2.5"
            >
              <option value="">Todos</option>
              {optGrupo.map(g => (
                <option key={g.codigo} value={g.codigo}>
                  {String(g.codigo).startsWith('PROY-') ? '—' : String(g.codigo).replace(/_\d+$/, '')}
                </option>
              ))}
            </select>
          </div>
        </div>
      </Card>

      {/* ─────────────────────────────────────────────────────────────
          2. INDICADORES CLAVE DE CALIBRACIÓN (KPIS DIRECTOS)
          ───────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
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
            <Card className="p-4 flex items-center justify-between shadow-xs border-[var(--border-subtle)]">
              <div className="flex flex-col">
                <span className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)]">
                  Total Grupos
                </span>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-2xl font-black text-[var(--text-primary)] font-mono">
                    {kpis.totalGruposUnicos.toLocaleString()}
                  </span>
                  <span className="text-xs text-[var(--text-muted)] font-semibold">
                    {kpis.totalFilas !== kpis.totalGruposUnicos ? `(${kpis.totalFilas} asignaciones)` : 'activos'}
                  </span>
                </div>
                <span className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                  {kpis.totalNomina.toLocaleString()} postulantes en nómina
                </span>
              </div>
              <div className="h-10 w-10 rounded-xl bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 flex items-center justify-center border border-cyan-500/20">
                <Layers size={20} />
              </div>
            </Card>

            {/* KPI 2: CALIBRADOS */}
            <Card className="p-4 flex items-center justify-between shadow-xs border-emerald-500/20">
              <div className="flex flex-col">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                    Calibrados
                  </span>
                  <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-emerald-500/20 text-emerald-700 dark:text-emerald-300">
                    {kpis.pctCalibracion}%
                  </span>
                </div>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400 font-mono">
                    {kpis.calibrados.toLocaleString()}
                  </span>
                  <span className="text-xs text-emerald-600/80 dark:text-emerald-400/80 font-semibold">100% OK</span>
                </div>
                <span className="text-[11px] text-[var(--text-muted)] mt-0.5">
                  Sin desvíos Recl. vs Form.
                </span>
              </div>
              <div className="h-10 w-10 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center border border-emerald-500/20">
                <CheckCircle2 size={20} />
              </div>
            </Card>

            {/* KPI 3: DESCALIBRADOS */}
            <Card className={`p-4 flex items-center justify-between shadow-xs ${
              kpis.descalibrados > 0 ? 'border-rose-500/30 bg-rose-500/[0.02]' : 'border-[var(--border-subtle)]'
            }`}>
              <div className="flex flex-col">
                <span className="text-[10px] font-black uppercase tracking-wider text-rose-600 dark:text-rose-400 flex items-center gap-1">
                  {kpis.descalibrados > 0 && <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping" />}
                  Descalibrados
                </span>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className={`text-2xl font-black font-mono ${kpis.descalibrados > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-[var(--text-primary)]'}`}>
                    {kpis.descalibrados.toLocaleString()}
                  </span>
                  <span className={`text-xs font-semibold ${kpis.descalibrados > 0 ? 'text-rose-600/80 dark:text-rose-400/80' : 'text-[var(--text-muted)]'}`}>
                    {kpis.descalibrados > 0 ? 'por auditar' : '0 desvíos'}
                  </span>
                </div>
                <span className="text-[11px] text-[var(--text-muted)] mt-0.5">
                  {kpis.descalibrados > 0 ? 'Clic en fila para ver DNI' : 'Calibración en regla'}
                </span>
              </div>
              <div className="h-10 w-10 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center border border-rose-500/20">
                <AlertTriangle size={20} />
              </div>
            </Card>

            {/* KPI 4: ASISTENCIAS DÍA 1 */}
            <Card className="p-4 flex items-center justify-between shadow-xs border-purple-500/20">
              <div className="flex flex-col">
                <span className="text-[10px] font-black uppercase tracking-wider text-purple-600 dark:text-purple-400">
                  Asistencias Día 1
                </span>
                <div className="flex items-baseline gap-1.5 font-mono mt-1">
                  <span className="text-2xl font-black text-cyan-600 dark:text-cyan-400">{kpis.sumRec}</span>
                  <span className="text-sm text-[var(--text-muted)] font-bold">/</span>
                  <span className="text-2xl font-black text-purple-600 dark:text-purple-400">{kpis.sumForm}</span>
                  {kpis.delta !== 0 && (
                    <span className={`text-[10px] px-1 py-0.5 rounded font-black ${
                      kpis.delta > 0 ? 'bg-amber-500/20 text-amber-600 dark:text-amber-300' : 'bg-rose-500/20 text-rose-600 dark:text-rose-300'
                    }`}>
                      Δ{kpis.delta > 0 ? `+${kpis.delta}` : kpis.delta}
                    </span>
                  )}
                </div>
                <span className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                  Reclutador vs Formador
                </span>
              </div>
              <div className="h-10 w-10 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center border border-purple-500/20">
                <Users size={20} />
              </div>
            </Card>
          </>
        )}
      </div>

      {/* ─────────────────────────────────────────────────────────────
          3. MATRIZ DE CALIBRACIÓN
          ───────────────────────────────────────────────────────────── */}
      {loading && rawReportData.length === 0 ? (
        <div className="text-center py-10">
          <div className="animate-spin h-8 w-8 border-4 border-[var(--accent)] border-t-transparent rounded-full mx-auto mb-2"></div>
          <p className="text-[var(--text-muted)] font-bold tracking-widest">CARGANDO REPORTE...</p>
        </div>
      ) : filteredReportData.length === 0 ? (
        <Card className="text-center py-10">
          <p className="text-[var(--text-muted)] font-bold">No hay grupos configurados con Día 1 para los filtros seleccionados.</p>
        </Card>
      ) : (
        <div className="space-y-6">
          <Card noPadding className="overflow-hidden">
            <div className="table-scroll overflow-x-auto max-h-[50vh]">
              <table className="w-full text-sm text-left relative">
                <thead className="bg-[var(--table-head-bg)] text-[var(--text-primary)] text-xs font-bold uppercase tracking-widest sticky top-0 z-10 border-b border-[var(--border-subtle)]">
                  <tr>
                    <th className="px-4 py-3">Grupo</th>
                    <th className="px-4 py-3">Campaña</th>
                    <th className="px-4 py-3">Fecha de Inicio</th>
                    <th className="px-4 py-3">Fecha Día 1</th>
                    <th className="px-4 py-3 text-center">Total Nómina</th>
                    <th className="px-4 py-3 text-center">Asistió Día 0</th>
                    <th className="px-4 py-3 text-center">Asistió Día 1</th>
                    <th className="px-4 py-3 text-center">Asistencias Formador</th>
                    <th className="px-4 py-3 text-center">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)]">
                  {filteredReportData.map((row, idx) => (
                    <tr 
                      key={`${row.grupo_codigo}-${row.campana}`} 
                      onClick={() => handleRowClick(row)}
                      className={`transition-colors ${idx % 2 === 0 ? 'bg-[var(--bg-surface)]' : 'bg-[var(--bg-base)]/20'} ${row.estado === 'DESCALIBRADO' ? 'cursor-pointer hover:bg-rose-500/10' : 'hover:bg-[var(--bg-muted)]'} ${selectedGroupDetail === row.grupo_codigo ? 'bg-rose-500/10' : ''}`}
                    >
                      <td className="px-4 py-3 font-bold text-[var(--text-primary)]">{row.grupo_codigo}</td>
                      <td className="px-4 py-3 text-[var(--text-secondary)]">{row.campana}</td>
                      <td className="px-4 py-3 text-[var(--text-secondary)] font-mono text-xs">{row.fecha_inicio || '—'}</td>
                      <td className="px-4 py-3 font-bold text-[var(--accent)] font-mono text-xs">{row.fecha_dia1}</td>
                      <td className="px-4 py-3 text-center font-bold text-[var(--text-primary)]">{row.total_nomina}</td>
                      <td className="px-4 py-3 text-center font-bold text-[var(--text-primary)]">{row.total_dia0}</td>
                      <td className="px-4 py-3 text-center font-bold text-[var(--text-primary)]">{row.total_reclutador}</td>
                      <td className="px-4 py-3 text-center font-bold text-[var(--text-primary)]">{row.total_formador}</td>
                      <td className="px-4 py-3 text-center">
                        {getStatusBadge(row.estado)}
                        {row.estado === 'DESCALIBRADO' && (
                          <div className="text-[10px] text-rose-500 font-bold mt-1 uppercase">Click para ver detalle</div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {selectedGroupDetail && (
            <Card className="bg-rose-500/5 border-rose-500/20 animate-fadeIn">
              <h3 className="text-rose-500 font-black uppercase tracking-wider mb-4 border-b border-rose-500/20 pb-2">
                Detalle de Descalibración: {selectedGroupDetail}
              </h3>
              
              {loadingDetails ? (
                <div className="text-center py-4 text-rose-500 font-bold">Cargando discrepancias...</div>
              ) : discrepancias.length === 0 ? (
                <div className="text-center py-4 text-rose-500 font-bold">No se encontraron discrepancias directas (posible diferencia de cantidad total).</div>
              ) : (
                <div className="table-scroll overflow-x-auto rounded-xl overflow-hidden border border-rose-500/20">
                  <table className="w-full text-left text-xs bg-[var(--bg-surface)]">
                    <thead className="bg-rose-500/10 text-rose-500">
                      <tr>
                        <th className="px-3 py-2 font-bold uppercase">Documento</th>
                        <th className="px-3 py-2 font-bold uppercase">Nombres</th>
                        <th className="px-3 py-2 text-center font-bold uppercase border-l border-rose-500/20">Reclutador Marcó</th>
                        <th className="px-3 py-2 text-center font-bold uppercase border-l border-rose-500/20">Formador Marcó</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border-subtle)]">
                      {discrepancias.map(d => (
                        <tr key={d.documento} className="hover:bg-[var(--bg-muted)] transition-colors">
                          <td className="px-3 py-2 font-mono text-[var(--text-secondary)]">{d.documento}</td>
                          <td className="px-3 py-2 text-[var(--text-primary)] font-medium">{d.nombre}</td>
                          <td className="px-3 py-2 text-center border-l border-rose-500/20">
                            <span className="bg-[var(--bg-elevated)] px-2 py-1 rounded font-bold text-[var(--text-primary)]">{d.sigla_reclutador}</span>
                          </td>
                          <td className="px-3 py-2 text-center border-l border-rose-500/20">
                            <span className="bg-amber-500/20 px-2 py-1 rounded font-bold text-amber-500 border border-amber-500/30">{d.sigla_formador}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          )}
        </div>
      )}
    </PageLayout>
  )
}

export default ReporteDia1
