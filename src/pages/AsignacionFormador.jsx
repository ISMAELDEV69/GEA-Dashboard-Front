import React, { useState, useMemo, useEffect } from 'react'
import {
  Search, Users, Loader2, Check, UserCheck, AlertCircle,
  Calendar, Filter, X, GraduationCap, ChevronLeft, ChevronRight,
  Sparkles, RefreshCw, CheckCircle2, ShieldAlert, Clock, ArrowRight, Split,
  Shield
} from 'lucide-react'
import { updateGrupoFormador, getEquipoFormacion } from '../lib/dataService'
import { isSubgroupCode } from '../lib/flujoOperativo'
import { inferSegmento } from '../lib/capacidadRysSync'
import DividirGrupoModal from '../components/asignacion/DividirGrupoModal'

const PAGE_SIZE = 40

export default function AsignacionFormador({ grupos = [], formadores = [], userProfile = null, onRefresh }) {
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedPeriodo, setSelectedPeriodo] = useState('')
  const [selectedSegmento, setSelectedSegmento] = useState('')
  const [selectedCampana, setSelectedCampana] = useState('')
  const [selectedSemana, setSelectedSemana] = useState('')
  const [filterStatus, setFilterStatus] = useState('ALL') // 'ALL', 'ASSIGNED', 'UNASSIGNED'
  const [currentPage, setCurrentPage] = useState(1)
  
  const [savingRow, setSavingRow] = useState(null)
  const [successRow, setSuccessRow] = useState(null)
  const [equipoFormacionData, setEquipoFormacionData] = useState([])
  const [selectedGrupoForSplit, setSelectedGrupoForSplit] = useState(null)

  const isSupervisor = userProfile?.rol === 'supervisor_capacitacion'
  const supervisorSegmento = isSupervisor && userProfile?.segmento ? String(userProfile.segmento).trim().toUpperCase() : null

  useEffect(() => {
    getEquipoFormacion().then(data => {
      setEquipoFormacionData(data || [])
    })
  }, [])

  // Opciones de filtro
  const periodos = useMemo(() => {
    return [...new Set(grupos.map(g => g.periodo ? String(g.periodo).trim() : null).filter(Boolean))].sort()
  }, [grupos])

  const segmentos = useMemo(() => {
    if (supervisorSegmento) return [supervisorSegmento]
    let filtered = grupos.filter(g => g.periodo)
    if (selectedPeriodo) filtered = filtered.filter(g => String(g.periodo).trim() === String(selectedPeriodo).trim())
    return [...new Set(filtered.map(g => g.segmento ? String(g.segmento).trim() : null).filter(Boolean))].sort()
  }, [grupos, selectedPeriodo, supervisorSegmento])

  const campanas = useMemo(() => {
    let filtered = grupos.filter(g => g.periodo)
    if (supervisorSegmento) {
      filtered = filtered.filter(g => {
        const s = String(g.segmento || inferSegmento(g.campana) || '').trim().toUpperCase()
        return s === supervisorSegmento
      })
    }
    if (selectedPeriodo) filtered = filtered.filter(g => String(g.periodo).trim() === String(selectedPeriodo).trim())
    if (selectedSegmento && !supervisorSegmento) filtered = filtered.filter(g => String(g.segmento).trim() === String(selectedSegmento).trim())
    return [...new Set(filtered.map(g => g.campana ? String(g.campana).trim() : null).filter(Boolean))].sort()
  }, [grupos, selectedPeriodo, selectedSegmento, supervisorSegmento])

  const semanas = useMemo(() => {
    let filtered = grupos.filter(g => g.periodo)
    if (supervisorSegmento) {
      filtered = filtered.filter(g => {
        const s = String(g.segmento || inferSegmento(g.campana) || '').trim().toUpperCase()
        return s === supervisorSegmento
      })
    }
    if (selectedPeriodo) filtered = filtered.filter(g => String(g.periodo).trim() === String(selectedPeriodo).trim())
    if (selectedSegmento && !supervisorSegmento) filtered = filtered.filter(g => String(g.segmento).trim() === String(selectedSegmento).trim())
    if (selectedCampana) filtered = filtered.filter(g => String(g.campana).trim() === String(selectedCampana).trim())
    return [...new Set(filtered.map(g => g.semana_label ? String(g.semana_label).trim() : null).filter(Boolean))].sort()
  }, [grupos, selectedPeriodo, selectedSegmento, selectedCampana, supervisorSegmento])

  // Filtrar grupos para la tabla
  const filteredGrupos = useMemo(() => {
    let res = [...grupos]

    // Restricción estricta de segmento para supervisor_capacitacion
    if (supervisorSegmento) {
      res = res.filter(g => {
        const gSeg = String(g.segmento || inferSegmento(g.campana) || '').trim().toUpperCase()
        return gSeg === supervisorSegmento
      })
    }
    
    if (selectedPeriodo) res = res.filter(g => String(g.periodo).trim() === String(selectedPeriodo).trim())
    if (selectedSegmento && !supervisorSegmento) res = res.filter(g => String(g.segmento).trim() === String(selectedSegmento).trim())
    if (selectedCampana) res = res.filter(g => String(g.campana).trim() === String(selectedCampana).trim())
    if (selectedSemana) res = res.filter(g => String(g.semana_label).trim() === String(selectedSemana).trim())
    
    if (filterStatus === 'ASSIGNED') {
      res = res.filter(g => g.formador_documento)
    } else if (filterStatus === 'UNASSIGNED') {
      res = res.filter(g => !g.formador_documento)
    }

    if (searchTerm) {
      const q = searchTerm.toLowerCase()
      res = res.filter(g => 
        (g.codigo && g.codigo.toLowerCase().includes(q)) ||
        (g.campana && g.campana.toLowerCase().includes(q)) ||
        (g.formador_nombre && g.formador_nombre.toLowerCase().includes(q)) ||
        (g.modalidad && g.modalidad.toLowerCase().includes(q))
      )
    }

    res.sort((a, b) => {
      const pA = a.periodo || ''
      const pB = b.periodo || ''
      if (pA !== pB) return pB.localeCompare(pA)
      return (a.codigo || '').localeCompare(b.codigo || '')
    })

    const unique = []
    const seen = new Set()
    for (const g of res) {
      const key = `${g.codigo}|${g.campana}`
      if (!seen.has(key)) {
        seen.add(key)
        unique.push(g)
      }
    }
    
    return unique
  }, [grupos, selectedPeriodo, selectedSegmento, selectedCampana, selectedSemana, filterStatus, searchTerm, supervisorSegmento])

  const formadoresActivos = useMemo(() => {
    const map = new Map()

    // 1. Desde equipoFormacionData (tabla formadores de Supabase)
    equipoFormacionData.forEach(f => {
      const doc = String(f.documento || '').trim()
      if (f.estado?.trim().toUpperCase() === 'ACTIVO' && doc) {
        map.set(doc, {
          documento: doc,
          nombres_completos: f.datos_completos || f.nombres_completos || f.nombre_completo || '',
          segmento: f.segmento || '',
          subcampana: f.subcampana || '',
          cargo_funcional: f.cargo_funcional || '',
          estado: f.estado || 'ACTIVO'
        })
      }
    })

    // 2. Complementar con formadores prop (perfiles / auth)
    formadores.forEach(f => {
      const doc = String(f.documento || f.id || '').trim()
      if (doc && !map.has(doc)) {
        map.set(doc, {
          documento: doc,
          nombres_completos: f.nombre_completo || f.nombres_completos || f.nombre || '',
          segmento: f.segmento || '',
          subcampana: f.subcampana || '',
          cargo_funcional: f.cargo_funcional || '',
          estado: f.estado || 'ACTIVO'
        })
      }
    })

    const allList = Array.from(map.values()).sort((a, b) => (a.nombres_completos || '').localeCompare(b.nombres_completos || ''))

    if (supervisorSegmento) {
      return allList.filter(f => f.segmento && f.segmento.trim().toUpperCase() === supervisorSegmento)
    }

    return allList
  }, [equipoFormacionData, formadores, supervisorSegmento])

  const totalGrupos = grupos.length
  const totalConFormador = useMemo(() => grupos.filter(g => g.formador_documento).length, [grupos])
  const totalSinFormador = totalGrupos - totalConFormador
  const pctAsignados = totalGrupos > 0 ? Math.round((totalConFormador / totalGrupos) * 100) : 0

  // Paginación
  const totalPages = Math.ceil(filteredGrupos.length / PAGE_SIZE) || 1
  const paginatedGrupos = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE
    return filteredGrupos.slice(start, start + PAGE_SIZE)
  }, [filteredGrupos, currentPage])

  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm, selectedPeriodo, selectedSegmento, selectedCampana, selectedSemana, filterStatus])

  const handleAssign = async (grupo_codigo, campana, formador_documento) => {
    try {
      const rowKey = `${grupo_codigo}|${campana}`
      setSavingRow(rowKey)
      await updateGrupoFormador(grupo_codigo, campana, formador_documento || null)
      
      setSuccessRow(rowKey)
      setTimeout(() => setSuccessRow(null), 2000)
      
      if (onRefresh) {
        onRefresh()
      }
    } catch (err) {
      alert("Error al asignar el formador")
    } finally {
      setSavingRow(null)
    }
  }

  const clearAllFilters = () => {
    setSearchTerm('')
    setSelectedPeriodo('')
    setSelectedSegmento('')
    setSelectedCampana('')
    setSelectedSemana('')
    setFilterStatus('ALL')
  }

  const hasActiveFilters = Boolean(
    searchTerm || selectedPeriodo || selectedSegmento || selectedCampana || selectedSemana || filterStatus !== 'ALL'
  )

  return (
    <div className="h-full flex flex-col overflow-hidden p-3 gap-2.5 bg-[var(--bg-base)] text-[var(--text-primary)] animate-fadeIn">
      
      {/* ── TOP HEADER UNIFICADO: TÍTULO + FILTROS AL LADO DERECHO ── */}
      <div className="rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] px-3.5 py-2.5 shadow-xs flex flex-wrap items-center justify-between gap-3 shrink-0">
        
        {/* Left: Título y Badge */}
        <div className="flex items-center gap-2.5 min-w-[200px]">
          <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20">
            <Users size={16} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm sm:text-base font-black tracking-tight text-[var(--text-primary)]">
                ASIGNACIÓN DE FORMADORES
              </h1>
              <span className="text-[9.5px] font-bold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/30">
                {filteredGrupos.length} grupos
              </span>
              {supervisorSegmento && (
                <span className="text-[9.5px] font-black px-2.5 py-0.5 rounded-full bg-teal-500/10 text-teal-300 border border-teal-500/30 flex items-center gap-1">
                  <Shield size={11} className="text-teal-400" />
                  SEGMENTO: {supervisorSegmento}
                </span>
              )}
            </div>
            <p className="text-[10.5px] text-[var(--text-muted)]">
              {supervisorSegmento ? `Gestión y asignación de formadores para el segmento ${supervisorSegmento}` : 'Distribución ejecutiva de capacitadores por cohorte y fechas de pase a operación'}
            </p>
          </div>
        </div>

        {/* Right: Filtros alineados a la derecha al lado del título */}
        <div className="flex flex-wrap items-center gap-2 flex-1 justify-end">
          {/* Quick Search */}
          <div className="relative min-w-[160px] max-w-[210px] w-full">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" size={13} />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar grupo o formador…"
              className="w-full pl-7 pr-2.5 py-1 rounded-lg border text-xs bg-[var(--bg-elevated)] border-[var(--border-subtle)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-blue-500"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-white cursor-pointer"
              >
                <X size={11} />
              </button>
            )}
          </div>

          {/* Periodo */}
          <select
            value={selectedPeriodo}
            onChange={e => setSelectedPeriodo(e.target.value)}
            className="px-2 py-1 rounded-lg border text-xs bg-[var(--bg-elevated)] border-[var(--border-subtle)] text-[var(--text-primary)] outline-none focus:border-blue-500 cursor-pointer max-w-[130px]"
          >
            <option value="" className="bg-[var(--bg-surface)] text-[var(--text-primary)]">Periodo: Todos</option>
            {periodos.map(p => <option key={p} value={p} className="bg-[var(--bg-surface)] text-[var(--text-primary)]">{p}</option>)}
          </select>

          {/* Semana */}
          <select
            value={selectedSemana}
            onChange={e => setSelectedSemana(e.target.value)}
            className="px-2 py-1 rounded-lg border text-xs bg-[var(--bg-elevated)] border-[var(--border-subtle)] text-[var(--text-primary)] outline-none focus:border-blue-500 cursor-pointer max-w-[125px]"
          >
            <option value="" className="bg-[var(--bg-surface)] text-[var(--text-primary)]">Semana: Todas</option>
            {semanas.map(s => <option key={s} value={s} className="bg-[var(--bg-surface)] text-[var(--text-primary)]">{s}</option>)}
          </select>

          {/* Segmento */}
          <select
            value={selectedSegmento}
            onChange={e => setSelectedSegmento(e.target.value)}
            className="px-2 py-1 rounded-lg border text-xs bg-[var(--bg-elevated)] border-[var(--border-subtle)] text-[var(--text-primary)] outline-none focus:border-blue-500 cursor-pointer max-w-[135px]"
          >
            <option value="" className="bg-[var(--bg-surface)] text-[var(--text-primary)]">Segmento: Todos</option>
            {segmentos.map(s => <option key={s} value={s} className="bg-[var(--bg-surface)] text-[var(--text-primary)]">{s}</option>)}
          </select>

          {/* Campaña */}
          <select
            value={selectedCampana}
            onChange={e => setSelectedCampana(e.target.value)}
            className="px-2 py-1 rounded-lg border text-xs bg-[var(--bg-elevated)] border-[var(--border-subtle)] text-[var(--text-primary)] outline-none focus:border-blue-500 cursor-pointer max-w-[140px]"
          >
            <option value="" className="bg-[var(--bg-surface)] text-[var(--text-primary)]">Campaña: Todas</option>
            {campanas.map(c => <option key={c} value={c} className="bg-[var(--bg-surface)] text-[var(--text-primary)]">{c}</option>)}
          </select>

          {/* Quick Status Buttons */}
          <div className="flex items-center gap-1 p-0.5 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
            <button
              onClick={() => setFilterStatus('ALL')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all cursor-pointer ${filterStatus === 'ALL' ? 'bg-blue-600 text-white shadow-xs' : 'text-[var(--text-muted)] hover:text-white'}`}
            >
              Todos
            </button>
            <button
              onClick={() => setFilterStatus('UNASSIGNED')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold transition-all cursor-pointer ${filterStatus === 'UNASSIGNED' ? 'bg-rose-600 text-white shadow-xs' : 'text-[var(--text-muted)] hover:text-rose-400'}`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-rose-400"></span>
              Sin Formador ({totalSinFormador})
            </button>
            <button
              onClick={() => setFilterStatus('ASSIGNED')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold transition-all cursor-pointer ${filterStatus === 'ASSIGNED' ? 'bg-emerald-600 text-white shadow-xs' : 'text-[var(--text-muted)] hover:text-emerald-400'}`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
              Asignados
            </button>
          </div>
        </div>
      </div>

      {/* ── ROW 2: KPIS COMPACTOS EN LÍNEA (MICRO-BALIZAS DE ESTADO) ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 shrink-0">
        {/* KPI 1 */}
        <div className="flex items-center justify-between px-3.5 py-2 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-xs">
          <div>
            <span className="text-[9px] font-black uppercase tracking-wider text-[var(--text-muted)] block">Grupos Totales</span>
            <span className="text-base sm:text-lg font-black text-blue-400 tabular-nums">{totalGrupos}</span>
          </div>
          <span className="text-[9.5px] font-bold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/30">
            Planificados
          </span>
        </div>

        {/* KPI 2 */}
        <div className="flex items-center justify-between px-3.5 py-2 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-xs">
          <div>
            <span className="text-[9px] font-black uppercase tracking-wider text-[var(--text-muted)] block">Con Formador</span>
            <span className="text-base sm:text-lg font-black text-emerald-400 tabular-nums">{totalConFormador}</span>
          </div>
          <div className="flex items-center gap-1 text-[9.5px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
            {pctAsignados}% asignados
          </div>
        </div>

        {/* KPI 3 */}
        <div className="flex items-center justify-between px-3.5 py-2 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-xs">
          <div>
            <span className="text-[9px] font-black uppercase tracking-wider text-[var(--text-muted)] block">Sin Formador</span>
            <span className="text-base sm:text-lg font-black text-rose-400 tabular-nums">{totalSinFormador}</span>
          </div>
          <div className="flex items-center gap-1.5 text-[9.5px] font-bold px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/30">
            {totalSinFormador > 0 ? (
              <>
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
                </span>
                <span>Por Asignar</span>
              </>
            ) : (
              <span>✓ Al día</span>
            )}
          </div>
        </div>

        {/* KPI 4 */}
        <div className="flex items-center justify-between px-3.5 py-2 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-xs">
          <div>
            <span className="text-[9px] font-black uppercase tracking-wider text-[var(--text-muted)] block">Formadores Activos</span>
            <span className="text-base sm:text-lg font-black text-indigo-400 tabular-nums">{formadoresActivos.length}</span>
          </div>
          <span className="text-[9.5px] font-bold px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/30">
            En Nómina
          </span>
        </div>
      </div>

      {/* Active Filter Chips Bar (si hay filtros aplicados) */}
      {hasActiveFilters && (
        <div className="flex flex-wrap items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-xs shrink-0">
          <span className="text-[10px] font-bold uppercase text-[var(--text-muted)] flex items-center gap-1">
            <Filter size={10} /> Filtros:
          </span>
          {selectedPeriodo && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/30 text-[10px] font-bold">
              Periodo: {selectedPeriodo}
              <button onClick={() => setSelectedPeriodo('')} className="hover:text-white cursor-pointer"><X size={10} /></button>
            </span>
          )}
          {selectedSemana && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/30 text-[10px] font-bold">
              Semana: {selectedSemana}
              <button onClick={() => setSelectedSemana('')} className="hover:text-white cursor-pointer"><X size={10} /></button>
            </span>
          )}
          {selectedSegmento && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-teal-500/10 text-teal-400 border border-teal-500/30 text-[10px] font-bold">
              Segmento: {selectedSegmento}
              <button onClick={() => setSelectedSegmento('')} className="hover:text-white cursor-pointer"><X size={10} /></button>
            </span>
          )}
          {selectedCampana && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 text-[10px] font-bold">
              Campaña: {selectedCampana}
              <button onClick={() => setSelectedCampana('')} className="hover:text-white cursor-pointer"><X size={10} /></button>
            </span>
          )}
          {filterStatus !== 'ALL' && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30 text-[10px] font-bold">
              {filterStatus === 'ASSIGNED' ? 'Con Formador' : 'Sin Formador'}
              <button onClick={() => setFilterStatus('ALL')} className="hover:text-white cursor-pointer"><X size={10} /></button>
            </span>
          )}
          {searchTerm && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-500/10 text-slate-300 border border-slate-500/30 text-[10px] font-bold">
              "{searchTerm}"
              <button onClick={() => setSearchTerm('')} className="hover:text-white cursor-pointer"><X size={10} /></button>
            </span>
          )}
          <button
            onClick={clearAllFilters}
            className="text-[10px] font-bold text-rose-400 hover:text-rose-300 underline ml-1 cursor-pointer"
          >
            Limpiar todo
          </button>
        </div>
      )}

      {/* ── ROW 3: TABLA EXPANDIDA Y ELEVADA CON SEÑALES DE ALERTA PROFESIONALES ── */}
      <div className="flex-1 min-h-0 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] overflow-hidden shadow-xs flex flex-col">
        
        {/* Table Toolbar Header */}
        <div className="flex items-center justify-between px-3.5 py-2 border-b border-[var(--border-subtle)] bg-[var(--bg-elevated)] shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-[10.5px] font-black uppercase tracking-wider text-[var(--text-primary)]">
              Planilla de Asignación por Grupo
            </span>
            <span className="text-[9.5px] font-mono text-[var(--text-muted)]">
              (Mostrando {paginatedGrupos.length} de {filteredGrupos.length})
            </span>
          </div>
          
          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
              <span className="text-[10.5px] font-mono font-bold">Pág {currentPage} de {totalPages}</span>
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-1 rounded-md bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-primary)] disabled:opacity-30 cursor-pointer hover:bg-[var(--bg-elevated)]"
                title="Página anterior"
              >
                <ChevronLeft size={12} />
              </button>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="p-1 rounded-md bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-primary)] disabled:opacity-30 cursor-pointer hover:bg-[var(--bg-elevated)]"
                title="Página siguiente"
              >
                <ChevronRight size={12} />
              </button>
            </div>
          )}
        </div>

        {/* Table Content con scroll interno fluido */}
        <div className="flex-1 overflow-auto custom-scrollbar">
          <table className="w-full text-left text-xs whitespace-nowrap">
            <thead className="sticky top-0 z-10 bg-[var(--table-head-bg)] shadow-xs">
              <tr className="border-b border-[var(--border-subtle)] text-[var(--text-muted)] font-black text-[9.5px] uppercase tracking-wider">
                <th className="px-3.5 py-2">Periodo</th>
                <th className="px-3.5 py-2">Grupo & Modalidad</th>
                <th className="px-3.5 py-2">Campaña / Segmento</th>
                <th className="px-3.5 py-2">Cronograma (OJT / OP)</th>
                <th className="px-3.5 py-2 min-w-[280px]">Formador Asignado</th>
                <th className="px-3.5 py-2 text-center w-28">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {paginatedGrupos.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-[var(--text-muted)]">
                    <p className="font-bold text-xs text-[var(--text-primary)]">No se encontraron grupos con los filtros actuales.</p>
                    <p className="text-[11px] mt-1">Prueba seleccionando otro periodo o limpiando los filtros.</p>
                  </td>
                </tr>
              ) : paginatedGrupos.map(g => {
                const rowKey = `${g.codigo}|${g.campana}`;
                const isSaving = savingRow === rowKey;
                const isSuccess = successRow === rowKey;
                const hasFormador = Boolean(g.formador_documento);
                
                return (
                  <tr key={rowKey} className="transition-colors hover:bg-[var(--bg-muted)] group">
                    {/* Periodo */}
                    <td className="px-3.5 py-2">
                      <span className="font-mono font-bold text-[10.5px] px-2 py-0.5 rounded bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-secondary)]">
                        {g.periodo || '—'}
                      </span>
                    </td>
                    
                    {/* Grupo */}
                    <td className="px-3.5 py-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-black text-xs text-blue-400">{g.codigo}</span>
                        {!isSubgroupCode(g.codigo) ? (
                          <button
                            onClick={() => setSelectedGrupoForSplit(g)}
                            className="px-2 py-0.5 rounded-md bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/30 text-[9.5px] font-black flex items-center gap-1 transition-all shadow-2xs hover:scale-105 active:scale-95 cursor-pointer"
                            title="Dividir este grupo en subgrupos con múltiples formadoras"
                          >
                            <Split size={11} /> Dividir
                          </button>
                        ) : (
                          <span className="px-1.5 py-0.2 rounded bg-purple-500/15 text-purple-400 border border-purple-500/30 text-[8.5px] font-black">
                            SUBGRUPO
                          </span>
                        )}
                      </div>
                      <div className="text-[9.5px] text-[var(--text-muted)] mt-0.5 flex items-center gap-1">
                        <span className="font-semibold text-[var(--text-secondary)]">{g.modalidad || 'Presencial'}</span>
                        <span>•</span>
                        <span>{g.semana_label || 'Sem —'}</span>
                      </div>
                    </td>

                    {/* Campaña */}
                    <td className="px-3.5 py-2">
                      <div className="font-bold text-xs text-[var(--text-primary)] truncate max-w-[180px]">
                        {g.campana || '—'}
                      </div>
                      <div className="text-[10px] text-teal-400 font-semibold mt-0.5">
                        {g.segmento || 'General'}
                      </div>
                    </td>

                    {/* Fechas */}
                    <td className="px-3.5 py-2 text-[10.5px]">
                      <div className="flex items-center gap-1.5 text-[var(--text-secondary)]">
                        <span className="font-black text-[8.5px] tracking-wider px-1.5 py-0.2 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                          OJT
                        </span>
                        <span className="font-mono text-[10px] text-[var(--text-primary)]">{g.fecha_inicio_ojt || '—'}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-[var(--text-secondary)] mt-0.5">
                        <span className="font-black text-[8.5px] tracking-wider px-1.5 py-0.2 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                          OP
                        </span>
                        <span className="font-mono text-[10px] text-[var(--text-primary)]">{g.fecha_ingreso_op || '—'}</span>
                      </div>
                    </td>

                    {/* Formador */}
                    <td className="px-3.5 py-2">
                      <div className="relative w-full max-w-sm flex items-center gap-2">
                        <select
                          value={g.formador_documento || ''}
                          onChange={(e) => handleAssign(g.codigo, g.campana, e.target.value)}
                          disabled={isSaving}
                          className={`w-full px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-all focus:outline-none focus:border-blue-500 cursor-pointer ${
                            hasFormador
                              ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30 hover:border-emerald-500/50 shadow-xs'
                              : 'bg-rose-500/10 text-rose-300 border-rose-500/40 hover:border-rose-500/60 shadow-xs'
                          } ${isSaving ? 'opacity-50 cursor-not-allowed' : ''} ${isSuccess ? 'border-emerald-400 bg-emerald-500/20' : ''}`}
                        >
                          <option value="" className="bg-[var(--bg-surface)] text-rose-400 font-bold">
                            ● [PENDIENTE] Sin Formador Asignado
                          </option>
                          {(() => {
                            const targetSegmento = (supervisorSegmento || g.segmento || inferSegmento(g.campana) || '').trim().toUpperCase();
                            const currentDoc = String(g.formador_documento || '').trim();

                            // 1. Filtrar formadores del segmento del grupo
                            const formadoresDelSegmento = targetSegmento
                              ? formadoresActivos.filter(f => (f.segmento || '').trim().toUpperCase() === targetSegmento)
                              : formadoresActivos;

                            // 2. Verificar si el formador actualmente asignado pertenece a otro segmento (caso legado)
                            const currentAsignado = currentDoc ? formadoresActivos.find(f => f.documento === currentDoc) : null;
                            const isCurrentInSegment = formadoresDelSegmento.some(f => f.documento === currentDoc);

                            return (
                              <>
                                {formadoresDelSegmento.length > 0 ? (
                                  <optgroup label={`Formadores de ${targetSegmento || 'este segmento'} (${formadoresDelSegmento.length})`} className="bg-[var(--bg-surface)] font-bold text-teal-400">
                                    {formadoresDelSegmento.map(f => (
                                      <option key={f.documento} value={f.documento} className="bg-[var(--bg-surface)] text-[var(--text-primary)]">
                                        ✓ {f.nombres_completos} {f.subcampana ? `• ${f.subcampana}` : ''}
                                      </option>
                                    ))}
                                  </optgroup>
                                ) : (
                                  <optgroup label={`Sin formadores registrados en ${targetSegmento || 'este grupo'}`} className="bg-[var(--bg-surface)] font-bold text-amber-400">
                                    {formadoresActivos.map(f => (
                                      <option key={f.documento} value={f.documento} className="bg-[var(--bg-surface)] text-[var(--text-primary)]">
                                        ✓ {f.nombres_completos} {f.segmento ? `(${f.segmento})` : ''}
                                      </option>
                                    ))}
                                  </optgroup>
                                )}

                                {/* Excepción visual: Si ya tenía asignado alguien de otro segmento, mantenerlo visible */}
                                {currentAsignado && !isCurrentInSegment && (
                                  <optgroup label="⚠️ Asignado Previamente (Otro Segmento)" className="bg-[var(--bg-surface)] font-bold text-amber-400">
                                    <option value={currentAsignado.documento} className="bg-[var(--bg-surface)] text-amber-300 font-semibold">
                                      ⚠ {currentAsignado.nombres_completos} ({currentAsignado.segmento || 'Sin Segmento'})
                                    </option>
                                  </optgroup>
                                )}
                              </>
                            );
                          })()}
                        </select>
                        
                        {/* Status Icon */}
                        <div className="w-5 flex-shrink-0 flex items-center justify-center">
                          {isSaving && <Loader2 className="animate-spin text-blue-400" size={13} />}
                          {isSuccess && <CheckCircle2 className="text-emerald-400 animate-in zoom-in duration-300" size={15} />}
                        </div>
                      </div>
                    </td>

                    {/* Estado Grupo con Micro-Balizas de Neón */}
                    <td className="px-3.5 py-2 text-center">
                      {g.estado === 'ACTIVO' || g.estado === 'EN CURSO' ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[9px] font-black bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 shadow-[0_0_8px_rgba(16,185,129,0.15)]">
                          <span className="relative flex h-1.5 w-1.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
                          </span>
                          EN CURSO
                        </span>
                      ) : g.estado === 'FINALIZADO' ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[9px] font-black bg-blue-500/10 text-blue-400 border border-blue-500/30">
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span>
                          FINALIZADO
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[9px] font-black bg-slate-500/10 text-slate-300 border border-slate-500/30">
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                          PROYECCIÓN
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL DE DIVISIÓN DE GRUPOS */}
      {selectedGrupoForSplit && (
        <DividirGrupoModal
          isOpen={!!selectedGrupoForSplit}
          onClose={() => setSelectedGrupoForSplit(null)}
          grupo={selectedGrupoForSplit}
          formadores={formadoresActivos}
          onSuccess={() => {
            if (onRefresh) onRefresh()
          }}
        />
      )}
    </div>
  )
}
