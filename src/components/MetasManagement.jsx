import React, { useState, useEffect, useCallback, useMemo, Fragment } from 'react'
import { createPortal } from 'react-dom'
import {
  Target, Users, Check, X,
  Loader2, AlertCircle, Edit, Save, HelpCircle, Search, RotateCcw
} from 'lucide-react'
import { fetchGruposConMetas, fetchReclutadoresFull, saveGrupoMetas, updateGrupoCapacidadField } from '../lib/dataService'
import { resolvePeriodoIngreso, normalize2026Period } from '../lib/dashboardAnalytics'
import PageLayout from './ui/PageLayout'
import PageHeader from './ui/PageHeader'
import Card from './ui/Card'

// Normalizador oficial de segmento idéntico a ResumenCapacitacion y Capacidad R&S
const normalizeSegmento = (rawSeg, campana) => {
  let s = String(rawSeg || '').trim().toUpperCase()
  const c = String(campana || '').toUpperCase()

  if (c.includes('TUVES') || c.includes('CHILE') || s === 'CLARO CHILE' || s.includes('CHILE')) {
    return 'CLARO CHILE'
  }
  if (c.includes('LIPIGAS') || c.includes('LIMAGAS') || s === 'LIPIGAS' || s.includes('LIPIGAS')) {
    return 'LIPIGAS'
  }
  if (c.includes('CLARO POSTPAGO')) {
    return 'CLARO PERU'
  }
  if (c.includes('RETENCIONES FIJA') || c.includes('RETENCION FIJA') || c.includes('FIJA INBOUND')) {
    return 'CLARO PERU'
  }
  if (
    s === 'CLARO PERU RETENCIONES' ||
    s.includes('RETENCION') || 
    c.includes('RETENCION') || 
    c.includes('CONTACTADOS') || 
    c.includes('CONTENCI') || 
    c.includes('DESCUENTO') || 
    c.includes('BABYSTING') || 
    c.includes('CONSULTA PREVIA') || 
    c.includes('MI CLARO') || 
    c.includes('ENCUESTAS IZO') ||
    c.includes('CANAL DIGITAL') ||
    c.includes('WSP INBOUND')
  ) {
    return 'CLARO PERU RETENCIONES'
  }
  if (
    s === 'CLARO PERU OUT' ||
    s.includes('OUT') || 
    c.includes('OUT') || 
    c.includes('PREVENTIVA') || 
    c.includes('PORTA OUT') || 
    c.includes('RENO') || 
    c.includes('VENTAS') || 
    c.includes('CROSS') || 
    c.includes('MIGRACIONES') ||
    c.includes('UPGRADE') ||
    c.includes('VENTA')
  ) {
    return 'CLARO PERU OUT'
  }
  return 'CLARO PERU'
}

// Extracción canónica del periodo de Capacidad R&S
const getCapacidadPeriodo = (g) => {
  if (!g) return ''
  const pIngreso = resolvePeriodoIngreso(g)
  if (pIngreso) return pIngreso
  const pDirect = normalize2026Period(g.periodo_ingreso_op || g.fecha_ingreso_op || g.periodo_ingreso)
  if (pDirect) return pDirect
  const pRaw = normalize2026Period(g.periodo || g.periodo_rys)
  if (pRaw) return pRaw
  if (g.periodo) {
    const clean = String(g.periodo).replace(/\D/g, '').slice(0, 6)
    if (clean) return clean
  }
  return ''
}

const isGrupoPeriodoMatch = (g, targetPeriodo) => {
  if (!targetPeriodo || targetPeriodo === 'Todos') return true
  const cleanTarget = String(targetPeriodo).trim()
  const pCap = getCapacidadPeriodo(g)
  if (pCap === cleanTarget) return true
  const pRaw = normalize2026Period(g.periodo || g.periodo_rys)
  if (pRaw === cleanTarget) return true
  if (String(g.periodo).trim() === cleanTarget) return true
  if (String(g.periodo_ingreso_op).trim() === cleanTarget) return true
  return false
}

const getSemanaStr = (g) => {
  if (!g) return ''
  const val = g.semana_label || g.semana || (g.semana_trabajo ? `SEM ${g.semana_trabajo}` : '')
  if (!val) return ''
  const clean = String(val).trim().toUpperCase()
  const num = parseInt(clean.replace(/\D/g, ''), 10)
  return (!isNaN(num) && num > 0) ? `SEM ${num}` : clean
}

const matchSemana = (valA, valB) => {
  if (!valA || !valB) return false
  const strB = String(valB).trim().toUpperCase()
  if (strB === 'TODOS' || strB === 'TODAS' || !strB) return true
  const numA = parseInt(String(valA).replace(/\D/g, ''), 10)
  const numB = parseInt(String(valB).replace(/\D/g, ''), 10)
  if (!isNaN(numA) && !isNaN(numB)) return numA === numB
  return String(valA).trim().toUpperCase() === String(valB).trim().toUpperCase()
}

const isGrupoSegmentoMatch = (g, targetSegmento) => {
  if (!targetSegmento || targetSegmento === 'Todos') return true
  const normG = normalizeSegmento(g.segmento, g.campana || g.campana_nombre)
  return normG === String(targetSegmento).trim().toUpperCase()
}

export default function MetasManagement({ postulantes = [], asistencias = [] }) {
  const [grupos, setGrupos] = useState([])
  const [reclutadores, setReclutadores] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  
  // Filtros
  const [filterPeriodo, setFilterPeriodo] = useState('Todos')
  const [filterSemana, setFilterSemana] = useState('Todos')
  const [filterSegmento, setFilterSegmento] = useState('Todos')
  const [filterCampana, setFilterCampana] = useState('Todos')
  const [filterGrupo, setFilterGrupo] = useState('')

  // Modal State
  const [editingGrupo, setEditingGrupo] = useState(null)
  const [selectedRecs, setSelectedRecs] = useState([]) // Array of { reclutador_id, nombre_completo, meta_rq_individual, meta_dia_1_individual }
  const [recruiterSearch, setRecruiterSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(null)

  const loadData = useCallback(async (isInit = false) => {
    if (!isInit) {
      setLoading(true)
      setError(null)
    }
    try {
      // Forzar lectura fresca de capacidad_rys
      const [gData, rData] = await Promise.all([
        fetchGruposConMetas(true),
        fetchReclutadoresFull()
      ])
      // Filtrar estrictamente: solo grupos traídos por RECLUTAMIENTO (excluyendo RECUPERADO, CAPACITACIÓN, etc.)
      const recluGrupos = (gData || []).filter(g => {
        const area = String(g.area_traslado || '').trim().toUpperCase()
        return area === 'RECLUTAMIENTO'
      })
      setGrupos(recluGrupos)
      setReclutadores((rData || []).filter(r => r.activo))

      if (isInit && recluGrupos && recluGrupos.length > 0) {
        // Encontrar los periodos disponibles
        const allPers = new Set()
        recluGrupos.forEach(g => {
          const p = getCapacidadPeriodo(g)
          if (p) allPers.add(p)
          const pRaw = normalize2026Period(g.periodo)
          if (pRaw) allPers.add(pRaw)
        })
        const sortedPers = Array.from(allPers).filter(p => /^\d{6}$/.test(p)).sort((a, b) => b.localeCompare(a))
        
        // Priorizar el periodo 2026 más reciente (ej. 202604 o 202603) o el primero disponible
        const active2026 = sortedPers.find(p => p.startsWith('2026')) || sortedPers[0]
        if (active2026) {
          setFilterPeriodo(active2026)
        } else {
          setFilterPeriodo('Todos')
        }
        setFilterSemana('Todos')
        setFilterSegmento('Todos')
        setFilterCampana('Todos')
      }
    } catch (err) {
      console.error(err)
      setError('Error al cargar metas de grupos y reclutadores.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData(true)
  }, [loadData])

  useEffect(() => {
    const prev = document.body.style.overflow
    if (editingGrupo) document.body.style.overflow = 'hidden'
    else document.body.style.overflow = prev
    return () => { document.body.style.overflow = prev }
  }, [editingGrupo])

  // ── Opciones de Filtro en Cascada (Alimentadas de Capacidad R&S) ──
  // Períodos: Lista TODOS los periodos existentes en Capacidad R&S (sin ser bloqueado por la semana)
  const periodosOptions = useMemo(() => {
    const set = new Set()
    grupos.forEach(g => {
      const p = getCapacidadPeriodo(g)
      if (p) set.add(p)
      const pRaw = normalize2026Period(g.periodo)
      if (pRaw) set.add(pRaw)
      if (g.periodo && String(g.periodo).trim()) set.add(String(g.periodo).trim())
    })
    const list = Array.from(set).filter(p => /^\d{6}$/.test(p) || p.length > 0).sort((a, b) => b.localeCompare(a))
    return ['Todos', ...list]
  }, [grupos])
  
  // Semanas: Muestra las semanas disponibles dentro del período seleccionado
  const semanasOptions = useMemo(() => {
    const subset = grupos.filter(g => isGrupoPeriodoMatch(g, filterPeriodo))
    const list = subset.map(g => getSemanaStr(g)).filter(Boolean)
    const unique = [...new Set(list)].sort((a, b) => {
      const numA = parseInt(a.replace(/\D/g, ''), 10) || 0
      const numB = parseInt(b.replace(/\D/g, ''), 10) || 0
      return numB - numA
    })
    return ['Todos', ...unique]
  }, [grupos, filterPeriodo])
  
  // Segmentos: Muestra los segmentos normalizados disponibles en el período y semana
  const segmentosOptions = useMemo(() => {
    const subset = grupos.filter(g => 
      isGrupoPeriodoMatch(g, filterPeriodo) &&
      matchSemana(getSemanaStr(g), filterSemana)
    )
    const list = subset.map(g => normalizeSegmento(g.segmento, g.campana || g.campana_nombre)).filter(Boolean)
    return ['Todos', ...new Set(list)].sort()
  }, [grupos, filterPeriodo, filterSemana])

  // Campañas: Muestra las campañas disponibles según período, semana y segmento
  const campanasOptions = useMemo(() => {
    const subset = grupos.filter(g => 
      isGrupoPeriodoMatch(g, filterPeriodo) &&
      matchSemana(getSemanaStr(g), filterSemana) &&
      isGrupoSegmentoMatch(g, filterSegmento)
    )
    const list = subset.map(g => g.campana_nombre || g.campana).filter(Boolean)
    return ['Todos', ...new Set(list)].sort()
  }, [grupos, filterPeriodo, filterSemana, filterSegmento])

  // Manejadores en cascada explícitos
  const handlePeriodoChange = (val) => {
    setFilterPeriodo(val)
    setFilterSemana('Todos')
    setFilterSegmento('Todos')
    setFilterCampana('Todos')
  }

  const handleSemanaChange = (val) => {
    setFilterSemana(val)
    setFilterSegmento('Todos')
    setFilterCampana('Todos')
  }

  const handleSegmentoChange = (val) => {
    setFilterSegmento(val)
    setFilterCampana('Todos')
  }

  const handleCampanaChange = (val) => {
    setFilterCampana(val)
  }

  // Aplicar filtros
  const filteredGrupos = useMemo(() => {
    return grupos.filter(g => {
      if (!isGrupoPeriodoMatch(g, filterPeriodo)) return false
      if (!matchSemana(getSemanaStr(g), filterSemana)) return false
      if (!isGrupoSegmentoMatch(g, filterSegmento)) return false
      if (filterCampana !== 'Todos' && String(g.campana_nombre || g.campana).trim() !== String(filterCampana).trim()) return false
      if (filterGrupo) {
        const q = filterGrupo.trim().toLowerCase()
        const searchString = `${g.grupo_codigo || ''} ${g.codigo || ''} ${g.campana_nombre || ''} ${g.campana || ''}`.toLowerCase()
        if (!searchString.includes(q)) return false
      }
      return true
    })
  }, [grupos, filterPeriodo, filterSemana, filterSegmento, filterCampana, filterGrupo])

  const handleEditClick = (g) => {
    setEditingGrupo(g)
    // Deep clone
    setSelectedRecs(g.reclutadores_metas.map(rm => ({ ...rm })))
    setRecruiterSearch('')
    setSaveSuccess(null)
  }

  const handleToggleRecruiter = (rec) => {
    const exists = selectedRecs.some(r => r.reclutador_id === rec.id || r.nombre_completo === rec.nombre_completo)
    if (exists) {
      setSelectedRecs(prev => prev.filter(r => r.reclutador_id !== rec.id && r.nombre_completo !== rec.nombre_completo))
    } else {
      setSelectedRecs(prev => [...prev, {
        reclutador_id: rec.id,
        nombre_completo: rec.nombre_completo,
        documento: rec.documento || null,
        alias: rec.alias || null,
        meta_rq_individual: 0,
        meta_dia_1_individual: 0
      }])
    }
  }

  const handleMetaChange = (recId, field, value) => {
    const val = parseInt(value, 10) || 0
    setSelectedRecs(prev => prev.map(r => {
      if (r.reclutador_id === recId || r.nombre_completo === recId) {
        return { ...r, [field]: val }
      }
      return r
    }))
  }

  const handleSave = async () => {
    if (!editingGrupo) return
    setSaving(true)
    setSaveSuccess(null)
    try {
      await saveGrupoMetas(editingGrupo.grupo_codigo, selectedRecs, {
        periodo: editingGrupo.periodo,
        semana: editingGrupo.semana_label || editingGrupo.semana,
        segmento: editingGrupo.segmento,
        campana: editingGrupo.campana_nombre || editingGrupo.campana
      })
      setSaveSuccess('Metas de grupo guardadas con éxito!')
      setTimeout(() => {
        setEditingGrupo(null)
        loadData()
      }, 1000)
    } catch (err) {
      console.error(err)
      setError('Error al guardar las metas del grupo.')
    } finally {
      setSaving(false)
    }
  }

  // Cálculos para el modal
  const sumIndividualRQ = selectedRecs.reduce((acc, r) => acc + (r.meta_rq_individual || 0), 0)
  const sumIndividualDia1 = selectedRecs.reduce((acc, r) => acc + (r.meta_dia_1_individual || 0), 0)

  // Filtrado de reclutadores en modal
  const filteredReclutadores = reclutadores.filter(r => 
    r.nombre_completo.toLowerCase().includes(recruiterSearch.toLowerCase())
  )

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <Loader2 size={32} className="text-indigo-400 animate-spin" />
        <p className="text-sm text-slate-400">Cargando objetivos por grupo...</p>
      </div>
    )
  }

  return (
    <PageLayout className="space-y-6">
      {/* Title block */}
      <PageHeader
        title="Metas y Equipos de Campaña"
        subtitle="Asigna objetivos de reclutamiento (RQ) y Día 1 a nivel individual para cada Grupo de Capacitación traído por Reclutamiento."
        icon={Target}
        actions={
          <div className="flex items-center gap-2">
            <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              Área: Exclusivo Reclutamiento
            </span>
            <button
              type="button"
              onClick={() => loadData(false)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-[var(--border-normal)] bg-[var(--bg-elevated)] hover:bg-[var(--bg-muted)] text-[var(--text-primary)] font-bold text-xs transition-all active:scale-95 cursor-pointer shadow-xs"
              title="Recargar grupos frescos de Capacidad R&S"
            >
              <RotateCcw size={14} className={loading ? 'animate-spin' : ''} />
              <span>Actualizar</span>
            </button>
          </div>
        }
      />

      {error && (
        <div className="flex items-center gap-2.5 p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl text-rose-400 text-sm">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* Filtros */}
      <Card>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="flex flex-col">
            <label className="text-[10px] uppercase font-bold text-[var(--text-secondary)] mb-1">Período</label>
            <select value={filterPeriodo} onChange={e => handlePeriodoChange(e.target.value)} className="form-input bg-[var(--input-bg)] border-[var(--input-border)] text-[var(--text-primary)] rounded-xl px-3 py-2 text-sm">
              {periodosOptions.map(o => <option key={o} value={o}>{o === 'Todos' ? 'Todos los Períodos' : o}</option>)}
            </select>
          </div>
          <div className="flex flex-col">
            <label className="text-[10px] uppercase font-bold text-[var(--text-secondary)] mb-1">Semana</label>
            <select value={filterSemana} onChange={e => handleSemanaChange(e.target.value)} className="form-input bg-[var(--input-bg)] border-[var(--input-border)] text-[var(--text-primary)] rounded-xl px-3 py-2 text-sm">
              {semanasOptions.map(o => <option key={o} value={o}>{o === 'Todos' ? 'Todas las Semanas' : o}</option>)}
            </select>
          </div>
          <div className="flex flex-col">
            <label className="text-[10px] uppercase font-bold text-[var(--text-secondary)] mb-1">Segmento</label>
            <select value={filterSegmento} onChange={e => handleSegmentoChange(e.target.value)} className="form-input bg-[var(--input-bg)] border-[var(--input-border)] text-[var(--text-primary)] rounded-xl px-3 py-2 text-sm">
              {segmentosOptions.map(o => <option key={o} value={o}>{o === 'Todos' ? 'Todos los Segmentos' : o}</option>)}
            </select>
          </div>
          <div className="flex flex-col">
            <label className="text-[10px] uppercase font-bold text-[var(--text-secondary)] mb-1">Campaña</label>
            <select value={filterCampana} onChange={e => handleCampanaChange(e.target.value)} className="form-input bg-[var(--input-bg)] border-[var(--input-border)] text-[var(--text-primary)] rounded-xl px-3 py-2 text-sm">
              {campanasOptions.map(o => <option key={o} value={o}>{o === 'Todos' ? 'Todas las Campañas' : o}</option>)}
            </select>
          </div>
          <div className="flex flex-col">
            <label className="text-[10px] uppercase font-bold text-[var(--text-secondary)] mb-1">Buscar Grupo</label>
            <input
              type="text"
              placeholder="Código del grupo..."
              value={filterGrupo}
              onChange={e => setFilterGrupo(e.target.value)}
              className="form-input bg-[var(--input-bg)] border-[var(--input-border)] text-[var(--text-primary)] rounded-xl px-3 py-2 text-sm"
            />
          </div>
        </div>
      </Card>

      <div className="text-xs text-[var(--text-secondary)] font-medium">
        Mostrando {filteredGrupos.length} grupos
      </div>

      {/* Table Layout */}
      <Card noPadding className="w-full">
        <div className="w-full overflow-x-auto table-scroll">
          <table className="w-full text-left text-[11px] whitespace-nowrap border-collapse">
            <thead>
              {/* Header row 1: Week indicator */}
              <tr>
                <th colSpan="8" className="bg-[var(--accent)]/10 text-[var(--accent)] border-b border-r border-[var(--border-subtle)] px-3 py-2 text-center uppercase tracking-widest font-black text-xs">
                  {filterSemana === 'Todos' ? 'TODAS LAS SEMANAS' : `SEMANA ${filterSemana}`}
                </th>
                <th colSpan="10" className="bg-[var(--table-head-bg)] border-b border-[var(--border-subtle)]"></th>
              </tr>
              {/* Header row 2: Column Names */}
              <tr className="bg-[var(--table-head-bg)] text-[var(--text-secondary)] font-bold uppercase tracking-wider text-[10px]">
                <th className="border-b border-r border-[var(--border-subtle)] px-3 py-2 text-center bg-orange-500/10 text-orange-600 dark:text-orange-400">Grupo</th>
                <th className="border-b border-r border-[var(--border-subtle)] px-3 py-2 text-center bg-orange-500/10 text-orange-600 dark:text-orange-400">Campaña</th>
                <th className="border-b border-r border-[var(--border-subtle)] px-3 py-2 text-center bg-orange-500/10 text-orange-600 dark:text-orange-400">Sede</th>
                <th className="border-b border-r border-[var(--border-subtle)] px-3 py-2 text-center bg-orange-500/10 text-orange-600 dark:text-orange-400">Modalidad</th>
                <th className="border-b border-r border-[var(--border-subtle)] px-3 py-2 text-center bg-orange-500/10 text-orange-600 dark:text-orange-400">Horario</th>
                <th className="border-b border-r border-[var(--border-subtle)] px-3 py-2 text-center bg-orange-500/10 text-orange-600 dark:text-orange-400">Fecha de Inicio</th>
                <th className="border-b border-r border-[var(--border-subtle)] px-3 py-2 text-center bg-orange-500/10 text-orange-600 dark:text-orange-400">Fecha Ingreso OP</th>
                <th className="border-b border-r border-[var(--border-subtle)] px-3 py-2 text-center bg-orange-500/10 text-orange-600 dark:text-orange-400">RQ</th>
                <th className="border-b border-r border-[var(--border-subtle)] px-3 py-2 text-center bg-orange-500/10 text-orange-600 dark:text-orange-400">Responsable</th>
                <th className="border-b border-r border-[var(--border-subtle)] px-3 py-2 text-center bg-amber-500/10 text-amber-600 dark:text-amber-400">RQ Individual</th>
                <th className="border-b border-r border-[var(--border-subtle)] px-3 py-2 text-center bg-amber-500/10 text-amber-600 dark:text-amber-400">#</th>
                <th className="border-b border-r border-[var(--border-subtle)] px-3 py-2 text-center bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">Lista Actual</th>
                <th className="border-b border-r border-[var(--border-subtle)] px-3 py-2 text-center bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">Meta Día 0</th>
                <th className="border-b border-r border-[var(--border-subtle)] px-3 py-2 text-center bg-orange-500/10 text-orange-600 dark:text-orange-400">Conectados Día 0</th>
                <th className="border-b border-r border-[var(--border-subtle)] px-3 py-2 text-center bg-amber-500/10 text-amber-600 dark:text-amber-400">Meta Día 1</th>
                <th className="border-b border-r border-[var(--border-subtle)] px-3 py-2 text-center bg-orange-500/10 text-orange-600 dark:text-orange-400">Conectados Día 1</th>
                <th className="border-b border-r border-[var(--border-subtle)] px-3 py-2 text-center bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">Meta Día 1</th>
                <th className="border-b border-[var(--border-subtle)] px-3 py-2 text-center bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">Total Día 1</th>
              </tr>
            </thead>
          <tbody>
            {filteredGrupos.map(g => {
              const recsRaw = g.reclutadores_metas || []
              const recs = recsRaw.map(r => {
                 const recName = r.nombre_completo || '';
                 const recPostulantes = postulantes.filter(p => 
                   p.grupo_codigo === g.grupo_codigo && 
                   p.campana === g.campana_nombre && 
                   (p.reclutador_id === r.reclutador_id || p.reclutador === recName)
                 );
                 const rqReal = recPostulantes.length;
                 const dia1Real = recPostulantes.filter(p => {
                    const asisGroup = asistencias.filter(a => a.postulante_documento === p.documento && a.grupo_codigo === g.grupo_codigo && a.campana === g.campana_nombre);
                    if (asisGroup.length === 0) return false;
                    const earliest = asisGroup.map(a => a.fecha_asistencia).sort()[0];
                    const asis = asisGroup.find(a => a.fecha_asistencia === earliest);
                    return asis && (asis.sigla_asistencia === 'A' || asis.sigla_asistencia === 'I-OP');
                 }).length;
                 
                 const parts = recName.split(' ');
                 let alias = r.alias || parts[0];
                 if (!r.alias) {
                   if (parts.length >= 3) {
                     alias = parts.slice(2).join(' '); // Nombres
                   } else if (parts.length === 2) {
                     alias = parts[1];
                   }
                 }

                 return { ...r, conteo_individual: rqReal, conectados_dia_1_individual: dia1Real, alias };
              });
              const rowCount = recs.length > 0 ? recs.length : 1
              const getTrafficColor = (current, target) => {
                if (target === 0 && current === 0) return 'text-[var(--text-muted)]'
                if (current >= target) return 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-bold'
                if (current > 0) return 'bg-amber-500/20 text-amber-600 dark:text-amber-400 font-bold'
                return 'bg-rose-500/20 text-rose-600 dark:text-rose-400 font-bold'
              }
              const baseRowClasses = "border-b border-[var(--border-subtle)] transition-colors hover:bg-[var(--bg-muted)]"

              return (
                <React.Fragment key={`${g.grupo_codigo}-${g.campana_nombre}`}>
                  <tr className={baseRowClasses}>
                    {/* Left spanned columns */}
                    <td rowSpan={rowCount} className="border-r border-[var(--border-subtle)] px-2 py-1.5 text-center font-mono font-bold text-[var(--text-primary)]">
                      {g.grupo_codigo}
                    </td>
                    <td rowSpan={rowCount} className="border-r border-[var(--border-subtle)] px-2 py-1.5 text-center text-[var(--text-primary)] font-bold truncate max-w-[120px]" title={g.campana_nombre}>
                      {g.campana_nombre}
                    </td>
                    <td rowSpan={rowCount} className="border-r border-[var(--border-subtle)] p-1 text-center text-[var(--text-secondary)]">
                      <input
                        key={`sede-${g.grupo_codigo}-${g.sede}`}
                        type="text"
                        defaultValue={g.sede && g.sede !== '-' ? g.sede : ''}
                        placeholder="Ingresar..."
                        onBlur={async (e) => {
                          const val = e.target.value.trim() || '-';
                          if (val !== g.sede) {
                            try {
                              await updateGrupoCapacidadField(g.grupo_codigo, g.campana_nombre, 'sede', val === '-' ? null : val);
                              setGrupos(prev => prev.map(item => item.grupo_codigo === g.grupo_codigo && item.campana_nombre === g.campana_nombre ? { ...item, sede: val } : item));
                            } catch (err) {
                              console.error('Error al guardar sede:', err);
                            }
                          }
                        }}
                        onKeyDown={e => e.key === 'Enter' && e.target.blur()}
                        className="w-20 text-center bg-transparent hover:bg-black/5 dark:hover:bg-white/5 focus:bg-black/10 dark:focus:bg-white/10 border border-transparent hover:border-[var(--border-normal)] focus:border-[var(--accent)] rounded px-1 py-1 text-xs outline-none font-semibold text-[var(--text-primary)] transition-all placeholder:text-[var(--text-muted)] placeholder:font-normal placeholder:italic"
                        title="Haz clic para escribir la Sede y presiona Enter para guardar"
                      />
                    </td>
                    <td rowSpan={rowCount} className="border-r border-[var(--border-subtle)] px-2 py-1.5 text-center text-[var(--text-secondary)] truncate max-w-[80px]" title={g.modalidad}>
                      {g.modalidad || '-'}
                    </td>
                    <td rowSpan={rowCount} className="border-r border-[var(--border-subtle)] p-1 text-center text-[var(--text-secondary)] font-mono">
                      <input
                        key={`horario-${g.grupo_codigo}-${g.horario}`}
                        type="text"
                        defaultValue={g.horario && g.horario !== '-' ? g.horario : ''}
                        placeholder="Ingresar..."
                        onBlur={async (e) => {
                          const val = e.target.value.trim() || '-';
                          if (val !== g.horario) {
                            try {
                              await updateGrupoCapacidadField(g.grupo_codigo, g.campana_nombre, 'rango_horario', val === '-' ? null : val);
                              setGrupos(prev => prev.map(item => item.grupo_codigo === g.grupo_codigo && item.campana_nombre === g.campana_nombre ? { ...item, horario: val } : item));
                            } catch (err) {
                              console.error('Error al guardar horario:', err);
                            }
                          }
                        }}
                        onKeyDown={e => e.key === 'Enter' && e.target.blur()}
                        className="w-24 text-center bg-transparent hover:bg-black/5 dark:hover:bg-white/5 focus:bg-black/10 dark:focus:bg-white/10 border border-transparent hover:border-[var(--border-normal)] focus:border-[var(--accent)] rounded px-1 py-1 text-xs font-mono outline-none text-[var(--text-primary)] transition-all placeholder:text-[var(--text-muted)] placeholder:font-normal placeholder:italic"
                        title="Haz clic para escribir el Horario y presiona Enter para guardar"
                      />
                    </td>
                    <td rowSpan={rowCount} className="border-r border-[var(--border-subtle)] px-2 py-1.5 text-center text-[var(--text-secondary)]">
                      {g.fecha_inicio ? new Date(g.fecha_inicio).toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '-'}
                    </td>
                    <td rowSpan={rowCount} className="border-r border-[var(--border-subtle)] px-2 py-1.5 text-center text-[var(--text-secondary)]">
                      {g.fecha_ingreso_op ? new Date(g.fecha_ingreso_op).toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '-'}
                    </td>
                    <td rowSpan={rowCount} className="border-r border-[var(--border-subtle)] px-2 py-1.5 text-center font-bold text-[var(--text-primary)]">
                      {g.rq_ftes_solicitado || g.rq_solicitado}
                    </td>

                    {/* Middle rows (First recruiter or empty) */}
                    {recs.length > 0 ? (
                      <>
                        <td className="border-r border-[var(--border-subtle)] px-2 py-1.5 text-center text-[var(--text-primary)] cursor-pointer hover:text-[var(--accent)] underline decoration-dashed underline-offset-2" onClick={() => handleEditClick(g)} title={recs[0].documento ? `DNI: ${recs[0].documento} (${recs[0].nombre_completo})` : recs[0].nombre_completo}>
                          <span>{recs[0].alias || recs[0].nombre_completo}</span>
                          {recs[0].documento && (
                            <span className="block text-[9px] font-mono text-[var(--text-muted)] tracking-wider">[{recs[0].documento}]</span>
                          )}
                        </td>
                        <td className="border-r border-[var(--border-subtle)] px-2 py-1.5 text-center font-bold bg-[var(--bg-muted)] text-[var(--text-primary)]">
                          {recs[0].meta_rq_individual}
                        </td>
                        <td className="border-r border-[var(--border-subtle)] px-2 py-1.5 text-center font-black bg-amber-500/10 text-amber-600 dark:text-amber-400">
                          {recs[0].conteo_individual}
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="border-r border-[var(--border-subtle)] px-2 py-1.5 text-center text-[var(--text-muted)] italic cursor-pointer hover:text-[var(--accent)]" onClick={() => handleEditClick(g)}>
                          Asignar...
                        </td>
                        <td className="border-r border-[var(--border-subtle)] px-2 py-1.5 text-center font-bold bg-[var(--bg-muted)] text-[var(--text-muted)]">-</td>
                        <td className="border-r border-[var(--border-subtle)] px-2 py-1.5 text-center font-black bg-black/5 text-[var(--text-muted)]">-</td>
                      </>
                    )}

                    {/* Right spanned columns */}
                    <td rowSpan={rowCount} className={`border-r border-[var(--border-subtle)] px-2 py-1.5 text-center text-lg font-black ${g.lista_actual >= (g.rq_ftes_solicitado || g.rq_solicitado) ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400' : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-500'}`}>
                      {g.lista_actual}
                    </td>
                    <td rowSpan={rowCount} className="border-r border-[var(--border-subtle)] px-2 py-1.5 text-center font-bold text-[var(--text-primary)]">
                      {g.meta_dia_0_grupal}
                    </td>
                    <td rowSpan={rowCount} className={`border-r border-[var(--border-subtle)] px-2 py-1.5 text-center font-bold ${getTrafficColor(g.conectados_dia_0, g.meta_dia_0_grupal)}`}>
                      {g.conectados_dia_0}
                    </td>

                    {/* Middle rows continuation */}
                    {recs.length > 0 ? (
                      <>
                        <td className="border-r border-[var(--border-subtle)] px-2 py-1.5 text-center font-bold text-[var(--text-primary)]">
                          {recs[0].meta_dia_1_individual}
                        </td>
                        <td className={`border-r border-[var(--border-subtle)] px-2 py-1.5 text-center font-bold ${getTrafficColor(recs[0].conectados_dia_1_individual, recs[0].meta_dia_1_individual)}`}>
                          {recs[0].conectados_dia_1_individual}
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="border-r border-[var(--border-subtle)] px-2 py-1.5 text-center font-bold text-[var(--text-muted)]">-</td>
                        <td className="border-r border-[var(--border-subtle)] px-2 py-1.5 text-center font-bold text-[var(--text-muted)]">-</td>
                      </>
                    )}

                    {/* Right spanned columns continuation */}
                    <td rowSpan={rowCount} className="border-r border-[var(--border-subtle)] px-2 py-1.5 text-center font-bold text-[var(--text-primary)]">
                      {g.meta_dia_1_grupal}
                    </td>
                    <td rowSpan={rowCount} className={`px-2 py-1.5 text-center text-lg font-black ${getTrafficColor(g.conectados_dia_1_grupal, g.meta_dia_1_grupal)}`}>
                      {g.conectados_dia_1_grupal}
                    </td>
                  </tr>

                  {/* Additional rows for recruiters 2+ */}
                  {recs.slice(1).map((r, idx) => (
                    <tr key={idx} className={baseRowClasses}>
                      <td className="border-r border-[var(--border-subtle)] px-2 py-1.5 text-center text-[var(--text-primary)] cursor-pointer hover:text-[var(--accent)] underline decoration-dashed underline-offset-2" onClick={() => handleEditClick(g)} title={r.documento ? `DNI: ${r.documento} (${r.nombre_completo})` : r.nombre_completo}>
                        <span>{r.alias || r.nombre_completo}</span>
                        {r.documento && (
                          <span className="block text-[9px] font-mono text-[var(--text-muted)] tracking-wider">[{r.documento}]</span>
                        )}
                      </td>
                      <td className="border-r border-[var(--border-subtle)] px-2 py-1.5 text-center font-bold bg-[var(--bg-muted)] text-[var(--text-primary)]">
                        {r.meta_rq_individual}
                      </td>
                      <td className="border-r border-[var(--border-subtle)] px-2 py-1.5 text-center font-black bg-amber-500/10 text-amber-600 dark:text-amber-400">
                        {r.conteo_individual}
                      </td>
                      <td className="border-r border-[var(--border-subtle)] px-2 py-1.5 text-center font-bold text-[var(--text-primary)]">
                        {r.meta_dia_1_individual}
                      </td>
                      <td className={`border-r border-[var(--border-subtle)] px-2 py-1.5 text-center font-bold ${getTrafficColor(r.conectados_dia_1_individual, r.meta_dia_1_individual)}`}>
                        {r.conectados_dia_1_individual}
                      </td>
                    </tr>
                  ))}
                </React.Fragment>
              )
            })}
          </tbody>
        </table>
        </div>
      </Card>

      {filteredGrupos.length === 0 && (
        <div className="text-center py-20 text-[var(--text-muted)]">
          No se encontraron grupos que coincidan con los filtros.
        </div>
      )}

      {/* Edit Goal / Team Modal */}
      {editingGrupo && createPortal(
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center p-4 sm:p-6"
          role="dialog"
          aria-modal="true"
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            aria-label="Cerrar"
            onClick={() => setEditingGrupo(null)}
          />
          <div className="relative w-full max-w-3xl max-h-[min(90vh,800px)] rounded-3xl border border-[var(--border-normal)] bg-[var(--bg-surface)] shadow-2xl flex flex-col overflow-hidden">
            
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-[var(--border-subtle)] flex justify-between items-start shrink-0 bg-[var(--bg-surface)]">
              <div>
                <h3 className="text-lg font-black text-[var(--text-primary)]">Asignar Metas y Equipo</h3>
                <p className="text-xs text-[var(--text-secondary)] mt-1 font-mono">{editingGrupo.grupo_codigo} — {editingGrupo.campana_nombre}</p>
              </div>
              <button
                type="button"
                onClick={() => setEditingGrupo(null)}
                className="p-1.5 hover:bg-[var(--bg-muted)] text-[var(--text-muted)] hover:text-[var(--text-primary)] rounded-xl transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1 min-h-0">
              
              {/* Header con las sumas actuales vs Capacidad */}
              <div className="grid grid-cols-2 gap-4 bg-[var(--bg-muted)] p-4 rounded-2xl border border-[var(--border-subtle)]">
                <div className="flex flex-col items-center justify-center text-center">
                  <p className="text-[10px] font-black uppercase text-[var(--text-secondary)] mb-1">Suma RQ Equipo</p>
                  <p className="text-3xl font-black text-[var(--accent)]">{sumIndividualRQ}</p>
                  <p className="text-[10px] text-[var(--text-muted)] mt-1">Requerido Capacidad: <span className="font-bold text-[var(--text-primary)]">{editingGrupo.rq_ftes_solicitado || editingGrupo.rq_solicitado}</span></p>
                </div>
                <div className="flex flex-col items-center justify-center text-center border-l border-[var(--border-subtle)]">
                  <p className="text-[10px] font-black uppercase text-[var(--text-secondary)] mb-1">Suma Día 1 Equipo</p>
                  <p className="text-3xl font-black text-emerald-500">{sumIndividualDia1}</p>
                  <p className="text-[10px] text-[var(--text-muted)] mt-1">Requerido Capacidad: <span className="font-bold text-[var(--text-primary)]">{editingGrupo.meta_dia_1_grupal}</span></p>
                </div>
              </div>

              {/* Team Assignment Section */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-black uppercase tracking-wider text-[var(--text-secondary)] block">Elegir Miembros del Equipo</label>
                  
                  {/* Buscador de reclutadores */}
                  <div className="relative w-48 sm:w-64">
                    <input
                      type="text"
                      placeholder="Buscar reclutador..."
                      value={recruiterSearch}
                      onChange={e => setRecruiterSearch(e.target.value)}
                      className="w-full form-input py-1.5 pl-8 pr-3 text-xs"
                    />
                    <Search className="absolute left-2.5 top-2 text-[var(--text-muted)]" size={12} />
                  </div>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 max-h-[180px] overflow-y-auto pr-2 custom-scrollbar">
                  {filteredReclutadores.length > 0 ? (
                    filteredReclutadores.map(r => {
                      const isChecked = selectedRecs.some(sr => sr.reclutador_id === r.id || sr.nombre_completo === r.nombre_completo)
                      return (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => handleToggleRecruiter(r)}
                          className={`flex items-center justify-between p-2.5 rounded-xl border text-left text-xs font-medium transition-all ${
                            isChecked
                              ? 'bg-[var(--accent)]/10 border-[var(--accent)] text-[var(--text-primary)] font-bold shadow-sm'
                              : 'bg-[var(--bg-surface)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--border-normal)]'
                          }`}
                        >
                          <span className="truncate pr-2">
                            <span className="font-bold">{r.alias || r.nombre_completo}</span>
                            {r.documento && <span className="ml-1 text-[10px] text-[var(--text-muted)] font-mono">[{r.documento}]</span>}
                          </span>
                          <div className={`shrink-0 w-3.5 h-3.5 rounded flex items-center justify-center border transition-all ${
                            isChecked 
                              ? 'bg-[var(--accent)] border-[var(--accent)] text-white' 
                              : 'border-[var(--border-normal)] bg-[var(--bg-muted)]'
                          }`}>
                            {isChecked && <Check size={10} strokeWidth={4} />}
                          </div>
                        </button>
                      )
                    })
                  ) : (
                    <div className="col-span-full py-4 text-center text-xs text-[var(--text-muted)] bg-[var(--bg-muted)] rounded-xl">
                      No se encontraron reclutadores.
                    </div>
                  )}
                </div>
              </div>

              {/* Individual Goals Inputs for Selected recruiters */}
              <div className="space-y-4 border-t border-[var(--border-subtle)] pt-6">
                <label className="text-xs font-black uppercase tracking-wider text-[var(--text-secondary)] block">Metas Individuales Asignadas</label>
                
                {selectedRecs.length > 0 ? (
                  <div className="space-y-2.5">
                    {selectedRecs.map((rm, idx) => {
                      const recName = rm.nombre_completo || '';
                      let rqReal = 0;
                      let dia1Real = 0;
                      
                      if (editingGrupo) {
                        const recPostulantes = postulantes.filter(p => 
                          p.grupo_codigo === editingGrupo.grupo_codigo && 
                          p.campana === editingGrupo.campana_nombre && 
                          (p.reclutador_id === rm.reclutador_id || p.reclutador === recName)
                        );
                        rqReal = recPostulantes.length;
                        
                        dia1Real = recPostulantes.filter(p => {
                          const asisGroup = asistencias.filter(a => a.postulante_documento === p.documento && a.grupo_codigo === editingGrupo.grupo_codigo && a.campana === editingGrupo.campana_nombre);
                          if (asisGroup.length === 0) return false;
                          const earliest = asisGroup.map(a => a.fecha_asistencia).sort()[0];
                          const asis = asisGroup.find(a => a.fecha_asistencia === earliest);
                          return asis && (asis.sigla_asistencia === 'A' || asis.sigla_asistencia === 'I-OP');
                        }).length;
                      }

                      return (
                      <div key={idx} className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 bg-[var(--bg-muted)] rounded-xl border border-[var(--border-subtle)] gap-4 transition-colors hover:border-[var(--border-normal)]">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-[var(--accent)]/10 text-[var(--accent)] border border-[var(--accent)]/20 flex items-center justify-center font-bold text-xs shrink-0">
                            {recName[0] || '?'}
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-[var(--text-primary)] truncate pr-4">{recName}</p>
                            <p className="text-[10px] text-[var(--text-muted)] font-mono">DNI: <span className="font-bold text-[var(--accent)]">{rm.documento || 'No registrado'}</span></p>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-4 shrink-0">
                          {/* Input RQ */}
                          <div className="flex flex-col items-center gap-1">
                            <span className="text-[9px] text-[var(--text-secondary)] font-bold uppercase">RQ Indiv.</span>
                            <div className="flex flex-col items-center gap-0.5">
                              <input
                                type="number"
                                min="0"
                                value={rm.meta_rq_individual}
                                onChange={e => handleMetaChange(rm.reclutador_id || recName, 'meta_rq_individual', e.target.value)}
                                className="w-16 form-input py-1 px-2 text-center text-xs font-bold"
                              />
                              <span className={`text-[9px] font-bold ${rqReal >= (parseInt(rm.meta_rq_individual) || 0) && rqReal > 0 ? 'text-emerald-500' : 'text-[var(--text-muted)]'}`}>Real: {rqReal}</span>
                            </div>
                          </div>
                          {/* Input Dia 1 */}
                          <div className="flex flex-col items-center gap-1">
                            <span className="text-[9px] text-[var(--text-secondary)] font-bold uppercase">Día 1 Indiv.</span>
                            <div className="flex flex-col items-center gap-0.5">
                              <input
                                type="number"
                                min="0"
                                value={rm.meta_dia_1_individual}
                                onChange={e => handleMetaChange(rm.reclutador_id || recName, 'meta_dia_1_individual', e.target.value)}
                                className="w-16 form-input py-1 px-2 text-center text-xs font-bold focus:border-emerald-500 focus:ring-emerald-500/20"
                              />
                              <span className={`text-[9px] font-bold ${dia1Real >= (parseInt(rm.meta_dia_1_individual) || 0) && dia1Real > 0 ? 'text-emerald-500' : 'text-[var(--text-muted)]'}`}>Real: {dia1Real}</span>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedRecs(prev => prev.filter(r => r.reclutador_id !== rm.reclutador_id && r.nombre_completo !== rm.nombre_completo));
                            }}
                            className="w-7 h-7 rounded bg-rose-500/10 text-rose-500 flex items-center justify-center hover:bg-rose-500 hover:text-white transition-colors ml-2 shrink-0"
                            title="Quitar reclutador"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      </div>
                    )})}
                  </div>
                ) : (
                  <div className="py-10 text-center text-xs text-[var(--text-muted)] bg-[var(--bg-muted)] rounded-2xl border border-dashed border-[var(--border-normal)]">
                    Selecciona reclutadores en la sección superior para asignarles metas individuales.
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-[var(--border-subtle)] bg-[var(--bg-surface)] flex items-center justify-between gap-4 shrink-0 backdrop-blur-sm">
              {saveSuccess ? (
                <div className="text-xs font-extrabold text-emerald-500 flex items-center gap-1.5">
                  <Check size={14} /> {saveSuccess}
                </div>
              ) : (
                <div className="text-[10px] text-[var(--text-muted)] flex items-center gap-1.5 max-w-[200px] leading-tight">
                  <HelpCircle size={14} className="shrink-0" />
                  Las sumatorias se calculan automáticamente.
                </div>
              )}
              
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setEditingGrupo(null)}
                  disabled={saving}
                  className="btn-secondary"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="btn-primary"
                >
                  {saving ? (
                    <>
                      <Loader2 size={16} className="animate-spin" /> Guardando...
                    </>
                  ) : (
                    <>
                      <Save size={16} /> Guardar Cambios
                    </>
                  )}
                </button>
              </div>
            </div>

          </div>
        </div>,
        document.body
      )}
    </PageLayout>
  )
}
