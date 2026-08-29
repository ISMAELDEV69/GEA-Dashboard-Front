import { useState, useMemo, useRef, useCallback, useEffect } from 'react'
import {
  Layers, Upload, Download, Filter, Search, Edit2, Save, X,
  Loader2, AlertCircle, CheckCircle2, BarChart3, Calendar, RefreshCw, Users
} from 'lucide-react'
import {
  CAPACIDAD_RYS_COLUMNS,
  CAPACIDAD_RYS_GROUPS,
  grupoToCapacidadRow,
  parseCapacidadRysCsv,
  parseSemanaLabel,
} from '../lib/capacidadRysSchema'
import { saveGrupoCapacitacion, importCapacidadRysBulk, syncCapacidadRysFromDrive } from '../lib/dataService'
import { enrichGruposWithStats } from '../lib/capacidadRysSync'
import PageLayout from './ui/PageLayout'
import PageHeader from './ui/PageHeader'
import Card from './ui/Card'

const ESTADO_COLORS = {
  PLANIFICADO: 'bg-slate-500/15 text-slate-400 border-slate-500/25',
  ACTIVO: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
  EN_CURSO: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/25',
  CERRADO: 'bg-amber-500/15 text-amber-400 border-amber-500/25',
}

const EMPTY_FORM = {
  codigo: '',
  campana_nombre: '',
  segmento: '',
  area_traslado: '',
  semana_label: '',
  semana_trabajo: '',
  modalidad: 'PRESENCIAL',
  condicion: '',
  estado: 'PLANIFICADO',
  fecha_registro: '',
  periodo: '',
  rango_horario: '',
  extension_teoria: '',
  fecha_inicio_ojt: '',
  extension_ojt: '',
  fecha_ingreso_op: '',
  rq_solicitado: '',
  rq_ftes_solicitado: '',
  meta_dia_0: '',
  meta_dia_1: '',
  periodo_ingreso_op: '',
  periodo_rys: '',
}

function grupoToForm(g) {
  if (!g) return { ...EMPTY_FORM }
  return {
    codigo: g.codigo || '',
    campana_nombre: g.campana || '',
    segmento: g.segmento || '',
    area_traslado: g.area_traslado || '',
    semana_label: g.semana_label || (g.semana_trabajo ? `SEM ${g.semana_trabajo}` : ''),
    semana_trabajo: g.semana_trabajo ?? '',
    modalidad: g.modalidad || 'PRESENCIAL',
    condicion: g.condicion || '',
    estado: g.estado || 'PLANIFICADO',
    fecha_registro: g.fecha_registro || g.fecha || '',
    periodo: g.periodo || '',
    rango_horario: g.rango_horario || '',
    extension_teoria: g.extension_teoria || '',
    fecha_inicio_ojt: g.fecha_inicio_ojt || '',
    extension_ojt: g.extension_ojt || '',
    fecha_ingreso_op: g.fecha_ingreso_op || '',
    rq_solicitado: g.rq_solicitado ?? '',
    rq_ftes_solicitado: g.rq_ftes_solicitado ?? '',
    meta_dia_0: g.meta_dia_0 ?? '',
    meta_dia_1: g.meta_dia_1 ?? '',
    periodo_ingreso_op: g.periodo_ingreso_op || '',
    periodo_rys: g.periodo_rys || '',
  }
}

export default function CapacidadRys({ grupos = [], campanas = [], postulantes = [], onRefresh, readOnly = false }) {
  const fileRef = useRef(null)
  const [search, setSearch] = useState('')
  const [filterPeriodo, setFilterPeriodo] = useState('TODOS')
  const [filterEstado, setFilterEstado] = useState('TODOS')
  const [filterCampana, setFilterCampana] = useState('TODOS')
  const [filterSegmento, setFilterSegmento] = useState('TODOS')
  const [filterSemana, setFilterSemana] = useState('TODOS')
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importProgress, setImportProgress] = useState(null)
  const [syncing, setSyncing] = useState(false)
  const [syncProgress, setSyncProgress] = useState(null)
  const [message, setMessage] = useState(null)
  const [error, setError] = useState(null)

  const gruposEnriquecidos = useMemo(
    () => enrichGruposWithStats(grupos, postulantes),
    [grupos, postulantes]
  )

  const getSemanaStr = useCallback((g) => {
    if (!g) return ''
    const s = g.semana_label || (g.semana_trabajo ? `SEM ${g.semana_trabajo}` : '')
    if (!s) return ''
    const num = String(s).replace(/\D/g, '')
    return num ? `SEM ${num}` : String(s).trim().toUpperCase()
  }, [])

  const periodos = useMemo(() => {
    const subset = gruposEnriquecidos.filter(g => 
      (filterEstado === 'TODOS' || g.estado === filterEstado) &&
      (filterCampana === 'TODOS' || g.campana === filterCampana) &&
      (filterSegmento === 'TODOS' || g.segmento === filterSegmento) &&
      (filterSemana === 'TODOS' || getSemanaStr(g) === filterSemana)
    )
    return ['TODOS', ...Array.from(new Set(subset.map(g => g.periodo).filter(Boolean))).sort().reverse()]
  }, [gruposEnriquecidos, filterEstado, filterCampana, filterSegmento, filterSemana, getSemanaStr])

  const campanaOptions = useMemo(() => {
    const subset = gruposEnriquecidos.filter(g => 
      (filterPeriodo === 'TODOS' || g.periodo === filterPeriodo) &&
      (filterEstado === 'TODOS' || g.estado === filterEstado) &&
      (filterSegmento === 'TODOS' || g.segmento === filterSegmento) &&
      (filterSemana === 'TODOS' || getSemanaStr(g) === filterSemana)
    )
    return ['TODOS', ...Array.from(new Set(subset.map(g => g.campana).filter(Boolean))).sort()]
  }, [gruposEnriquecidos, filterPeriodo, filterEstado, filterSegmento, filterSemana, getSemanaStr])

  const estados = useMemo(() => {
    const subset = gruposEnriquecidos.filter(g => 
      (filterPeriodo === 'TODOS' || g.periodo === filterPeriodo) &&
      (filterCampana === 'TODOS' || g.campana === filterCampana) &&
      (filterSegmento === 'TODOS' || g.segmento === filterSegmento) &&
      (filterSemana === 'TODOS' || getSemanaStr(g) === filterSemana)
    )
    return ['TODOS', ...Array.from(new Set(subset.map(g => g.estado).filter(Boolean))).sort()]
  }, [gruposEnriquecidos, filterPeriodo, filterCampana, filterSegmento, filterSemana, getSemanaStr])

  const segmentos = useMemo(() => {
    const subset = gruposEnriquecidos.filter(g => 
      (filterPeriodo === 'TODOS' || g.periodo === filterPeriodo) &&
      (filterEstado === 'TODOS' || g.estado === filterEstado) &&
      (filterCampana === 'TODOS' || g.campana === filterCampana) &&
      (filterSemana === 'TODOS' || getSemanaStr(g) === filterSemana)
    )
    return ['TODOS', ...Array.from(new Set(subset.map(g => g.segmento).filter(Boolean))).sort()]
  }, [gruposEnriquecidos, filterPeriodo, filterEstado, filterCampana, filterSemana, getSemanaStr])

  const segmentoOptions = useMemo(() => {
    return Array.from(new Set(gruposEnriquecidos.map(c => c?.segmento).filter(Boolean))).sort()
  }, [gruposEnriquecidos])

  const semanas = useMemo(() => {
    const subset = gruposEnriquecidos.filter(g => 
      (filterPeriodo === 'TODOS' || g.periodo === filterPeriodo) &&
      (filterEstado === 'TODOS' || g.estado === filterEstado) &&
      (filterCampana === 'TODOS' || g.campana === filterCampana) &&
      (filterSegmento === 'TODOS' || g.segmento === filterSegmento)
    )
    return ['TODOS', ...Array.from(new Set(subset.map(g => getSemanaStr(g)).filter(Boolean))).sort()]
  }, [gruposEnriquecidos, filterPeriodo, filterEstado, filterCampana, filterSegmento, getSemanaStr])

  useEffect(() => {
    if (filterPeriodo !== 'TODOS' && !periodos.includes(filterPeriodo)) setFilterPeriodo('TODOS')
    if (filterEstado !== 'TODOS' && !estados.includes(filterEstado)) setFilterEstado('TODOS')
    if (filterCampana !== 'TODOS' && !campanaOptions.includes(filterCampana)) setFilterCampana('TODOS')
    if (filterSegmento !== 'TODOS' && !segmentos.includes(filterSegmento)) setFilterSegmento('TODOS')
    if (filterSemana !== 'TODOS' && !semanas.includes(filterSemana)) setFilterSemana('TODOS')
  }, [filterPeriodo, periodos, filterEstado, estados, filterCampana, campanaOptions, filterSegmento, segmentos, filterSemana, semanas])

  const filtered = useMemo(() => {
    const q = (search || '').trim().toUpperCase()
    return gruposEnriquecidos.filter(g => {
      const gPeriodo = String(g.periodo || '').trim().toUpperCase()
      const gEstado = String(g.estado || '').trim().toUpperCase()
      const gCampana = String(g.campana || '').trim().toUpperCase()
      const gSegmento = String(g.segmento || '').trim().toUpperCase()
      const gSemana = getSemanaStr(g).toUpperCase()

      const fPeriodo = String(filterPeriodo || '').trim().toUpperCase()
      const fEstado = String(filterEstado || '').trim().toUpperCase()
      const fCampana = String(filterCampana || '').trim().toUpperCase()
      const fSegmento = String(filterSegmento || '').trim().toUpperCase()
      const fSemana = String(filterSemana || '').trim().toUpperCase()

      if (fPeriodo !== 'TODOS' && gPeriodo !== fPeriodo) return false
      if (fEstado !== 'TODOS' && gEstado !== fEstado) return false
      if (fCampana !== 'TODOS' && gCampana !== fCampana) return false
      if (fSegmento !== 'TODOS' && gSegmento !== fSegmento) return false
      if (fSemana !== 'TODOS' && gSemana !== fSemana) return false

      if (!q) return true
      const hay = [g.codigo, g.campana, g.segmento, g.area_traslado, g.periodo, gSemana, g.modalidad, g.condicion, g.estado]
        .join(' ').toUpperCase()
      return hay.includes(q)
    })
  }, [gruposEnriquecidos, search, filterPeriodo, filterEstado, filterSegmento, filterCampana, filterSemana, getSemanaStr])

  const kpis = useMemo(() => {
    const activos = filtered.filter(g => {
      const e = String(g.estado).trim().toUpperCase()
      return e === 'EN CURSO' || e === 'EN_CURSO' || e === 'ACTIVO'
    }).length
    const proyeccion = filtered.length - activos
    const meta0 = filtered.reduce((s, g) => s + (Number(g.meta_dia_0) || 0), 0)
    const meta1 = filtered.reduce((s, g) => s + (Number(g.meta_dia_1) || 0), 0)
    const rqFtes = filtered.reduce((s, g) => s + (Number(g.rq_ftes_solicitado) || 0), 0)
    const ingresados = filtered.reduce((s, g) => s + (g.postulantes_activos || 0), 0)
    
    const enRiesgo = filtered.filter(g => {
      const meta = Number(g.meta_dia_0) || 0
      if (meta <= 0) return false
      const act = Number(g.postulantes_activos) || 0
      const pct = (act / meta) * 100
      return pct < 75
    }).length

    const coberturaPct = meta0 > 0 ? ((ingresados / meta0) * 100).toFixed(1) : 0
    const deficitCupos = Math.max(0, meta0 - ingresados)

    return { total: filtered.length, activos, proyeccion, meta0, meta1, rqFtes, ingresados, enRiesgo, coberturaPct, deficitCupos }
  }, [filtered])

  const openEdit = (g) => {
    setEditing(g?.codigo || 'new')
    setForm(g ? grupoToForm(g) : { ...EMPTY_FORM })
    setMessage(null)
    setError(null)
  }

  const closeEdit = () => {
    setEditing(null)
    setForm(EMPTY_FORM)
  }

  const handleFormChange = (field, value) => {
    setForm(prev => {
      const next = { ...prev, [field]: value }
      if (field === 'semana_label') {
        const parsed = parseSemanaLabel(value)
        next.semana_trabajo = parsed.number ?? ''
      }
      return next
    })
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    setMessage(null)
    try {
      const payload = {
        ...form,
        semana_trabajo: form.semana_trabajo ? Number(form.semana_trabajo) : null,
        rq_solicitado: form.rq_solicitado !== '' ? Number(form.rq_solicitado) : null,
        rq_ftes_solicitado: form.rq_ftes_solicitado !== '' ? Number(form.rq_ftes_solicitado) : null,
        meta_dia_0: form.meta_dia_0 !== '' ? Number(form.meta_dia_0) : null,
        meta_dia_1: form.meta_dia_1 !== '' ? Number(form.meta_dia_1) : null,
      }
      await saveGrupoCapacitacion(payload)
      setMessage('Grupo guardado correctamente.')
      closeEdit()
      onRefresh?.()
    } catch (err) {
      setError(err.message || 'Error al guardar.')
    } finally {
      setSaving(false)
    }
  }

  const handleImportFile = useCallback(async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    setError(null)
    setMessage(null)
    setImportProgress({ current: 0, total: 0 })
    try {
      const text = await file.text()
      const payloads = parseCapacidadRysCsv(text)
      if (!payloads.length) throw new Error('No se encontraron filas válidas en el archivo.')
      setImportProgress({ current: 0, total: payloads.length })
      const result = await importCapacidadRysBulk(payloads, {
        onProgress: (cur, tot) => setImportProgress({ current: cur, total: tot }),
      })
      let msg = `Importación: ${result.ok} grupos con código importados.`
      if (result.ignored > 0) msg += ` Se omitieron ${result.ignored} grupos sin código.`
      if (result.fail > 0) msg += ` (${result.fail} con error).`
      msg += ` Total procesados: ${result.total}.`
      setMessage(msg)
      if (result.errors?.length) console.warn('Import errors:', result.errors)
      onRefresh?.()
    } catch (err) {
      setError(err.message || 'Error al importar CSV.')
    } finally {
      setImporting(false)
      setImportProgress(null)
      if (fileRef.current) fileRef.current.value = ''
    }
  }, [onRefresh])

  const handleExport = () => {
    const headers = CAPACIDAD_RYS_COLUMNS.map(c => c.label).join(',')
    const rows = filtered.map(g => {
      const r = grupoToCapacidadRow(g)
      return CAPACIDAD_RYS_COLUMNS.map(c => {
        const val = r[c.key] ?? ''
        const s = String(val)
        return s.includes(',') ? `"${s}"` : s
      }).join(',')
    })
    const blob = new Blob([headers + '\n' + rows.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `CAPACIDAD_RYS_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <PageLayout className="space-y-6">
      {/* Header narrativo */}
      <PageHeader
        title="CAPACIDAD RYS — Planificación de cohortes"
        subtitle="Vista operativa alineada al Excel CAPACIDAD_RYS v.Final: cada fila es un grupo de capacitación con metas, pipeline teórico/OJT/OP y requerimiento de FTEs."
        icon={Layers}
        actions={
          <div className="flex flex-wrap gap-2">
            {!readOnly && (
              <>
              <button
                onClick={() => openEdit(null)}
                className="btn-primary flex items-center gap-2"
              >
                <Layers size={14} /> Nuevo grupo
              </button>
              <button
                onClick={() => fileRef.current?.click()}
                disabled={importing}
                className="btn-secondary flex items-center gap-2"
              >
                {importing ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                Importar CSV
              </button>
              <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleImportFile} />
              <button
                onClick={async () => {
                  setSyncing(true)
                  setError(null)
                  setMessage(null)
                  setSyncProgress(null)
                  try {
                    const result = await syncCapacidadRysFromDrive({
                      onProgress: (ev) => setSyncProgress(ev),
                    })
                    if (result.errors && result.errors.length > 0) {
                      setMessage(`Sincronización Drive: ${result.ok} grupos actualizados. (${result.fail} con error). Error: ${result.errors[0]?.message}`)
                    } else {
                      let msg = `Sincronización Drive: ${result.ok} grupos actualizados.`
                      setMessage(msg)
                    }
                    if (result.errors?.length) console.warn('Sync errors:', result.errors)
                    onRefresh?.()
                  } catch (err) {
                    setError(err.message || 'Error al sincronizar desde Drive.')
                  } finally {
                    setSyncing(false)
                    setSyncProgress(null)
                  }
                }}
                disabled={syncing}
                className="btn-primary bg-rose-600 hover:bg-rose-700 text-white border-none flex items-center gap-2 shadow-sm font-bold"
              >
                {syncing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                {syncing ? (syncProgress?.message || 'Sincronizando…') : 'Sincronizar desde Drive'}
              </button>
            </>
          )}
          <button
            onClick={handleExport}
            className="btn-secondary flex items-center gap-2"
          >
            <Download size={14} /> Exportar
          </button>
        </div>
        }
      />

      {message && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm">
          <CheckCircle2 size={16} /> {message}
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm">
          <AlertCircle size={16} /> {error}
        </div>
      )}
      {importProgress && (
        <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
          Importando {importProgress.current} / {importProgress.total}…
        </div>
      )}

      {/* KPIs Ejecutivos de Capacidad */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {/* CARD 1: COHORTES / GRUPOS */}
        <div className="rounded-xl p-3.5 border bg-[var(--bg-surface)] border-[var(--border-subtle)] shadow-xs transition-all hover:border-[var(--border-normal)] flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)]">
              TOTAL GRUPOS
            </span>
            <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              <Layers size={14} />
            </div>
          </div>
          <div className="my-1.5">
            <span className="text-2xl font-black text-indigo-400 tabular-nums">
              {kpis.total.toLocaleString()}
            </span>
          </div>
          <div className="text-[10px] font-medium text-[var(--text-muted)] pt-1.5 border-t border-[var(--border-subtle)] flex items-center justify-between">
            <span>En curso: <strong className="text-emerald-400">{kpis.activos}</strong></span>
            <span>Proy: <strong className="text-slate-300">{kpis.proyeccion}</strong></span>
          </div>
        </div>

        {/* CARD 2: REQUERIMIENTO FTEs */}
        <div className="rounded-xl p-3.5 border bg-[var(--bg-surface)] border-[var(--border-subtle)] shadow-xs transition-all hover:border-[var(--border-normal)] flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)]">
              RQ SOLICITADO
            </span>
            <div className="p-1.5 rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/20">
              <Users size={14} />
            </div>
          </div>
          <div className="my-1.5">
            <span className="text-2xl font-black text-purple-400 tabular-nums">
              {kpis.rqFtes.toLocaleString()}
            </span>
            <span className="text-xs text-[var(--text-muted)] ml-1 font-bold">FTEs</span>
          </div>
          <div className="text-[10px] font-medium text-[var(--text-muted)] pt-1.5 border-t border-[var(--border-subtle)] truncate">
            Solicitado por Operación / Cliente
          </div>
        </div>

        {/* CARD 3: META DÍA 0 & DÍA 1 */}
        <div className="rounded-xl p-3.5 border bg-[var(--bg-surface)] border-[var(--border-subtle)] shadow-xs transition-all hover:border-[var(--border-normal)] flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)]">
              METAS D0 / D1
            </span>
            <div className="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              <Calendar size={14} />
            </div>
          </div>
          <div className="my-1.5">
            <span className="text-2xl font-black text-cyan-400 tabular-nums">
              {kpis.meta0.toLocaleString()}
            </span>
            <span className="text-xs text-[var(--text-muted)] ml-1 font-bold">cupos</span>
          </div>
          <div className="text-[10px] font-medium text-[var(--text-muted)] pt-1.5 border-t border-[var(--border-subtle)] flex items-center justify-between">
            <span>Meta D1 (Aula):</span>
            <span className="text-cyan-300 font-bold">{kpis.meta1.toLocaleString()}</span>
          </div>
        </div>

        {/* CARD 4: AVANCE DE COBERTURA REAL */}
        <div className="rounded-xl p-3.5 border bg-[var(--bg-surface)] border-[var(--border-subtle)] shadow-xs transition-all hover:border-[var(--border-normal)] flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)]">
              COBERTURA REAL
            </span>
            <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <CheckCircle2 size={14} />
            </div>
          </div>
          <div className="my-1.5">
            <span className="text-2xl font-black text-emerald-400 tabular-nums">
              {kpis.ingresados.toLocaleString()}
            </span>
            <span className="text-xs text-[var(--text-muted)] ml-1 font-mono font-bold">/ {kpis.meta0.toLocaleString()}</span>
          </div>
          <div className="text-[10px] font-medium text-[var(--text-muted)] pt-1.5 border-t border-[var(--border-subtle)] flex items-center justify-between">
            <span className="text-emerald-400 font-bold">{kpis.coberturaPct}% cubierto</span>
            <span>Falta: {kpis.deficitCupos.toLocaleString()}</span>
          </div>
        </div>

        {/* CARD 5: GRUPOS EN RIESGO */}
        <div className="rounded-xl p-3.5 border bg-[var(--bg-surface)] border-[var(--border-subtle)] shadow-xs transition-all hover:border-[var(--border-normal)] flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)]">
              GRUPOS EN RIESGO
            </span>
            <div className="p-1.5 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20">
              <AlertCircle size={14} />
            </div>
          </div>
          <div className="my-1.5">
            <span className="text-2xl font-black text-rose-400 tabular-nums">
              {kpis.enRiesgo.toLocaleString()}
            </span>
            <span className="text-xs text-[var(--text-muted)] ml-1 font-bold">grupos</span>
          </div>
          <div className="text-[10px] font-medium text-[var(--text-muted)] pt-1.5 border-t border-[var(--border-subtle)] truncate">
            {kpis.enRiesgo > 0 ? '⚠️ Déficit <75% de meta' : '✓ Cobertura óptima'}
          </div>
        </div>
      </div>

      {/* Filtros */}
      <Card>
        <div className="flex flex-wrap gap-4 items-center">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar grupo, campaña, segmento…"
              className="form-input w-full pl-9 pr-3 py-2 text-sm"
            />
          </div>
          {/* Filtro Periodo (Select) */}
          <select
            value={filterPeriodo}
            onChange={e => setFilterPeriodo(e.target.value)}
            className="form-input px-3 py-2 text-sm w-full md:w-auto min-w-[140px]"
          >
            {periodos.map(o => <option key={o} value={o}>{o === 'TODOS' ? 'Todos Período' : o}</option>)}
          </select>

          {/* Filtro Semana (Select) */}
          <select
            value={filterSemana}
            onChange={e => setFilterSemana(e.target.value)}
            className="form-input px-3 py-2 text-sm w-full md:w-auto min-w-[140px]"
          >
            {semanas.map(o => <option key={o} value={o}>{o === 'TODOS' ? 'Todas Semanas' : o}</option>)}
          </select>

          {/* Filtro Segmento (Select) */}
          <select
            value={filterSegmento}
            onChange={e => setFilterSegmento(e.target.value)}
            className="form-input px-3 py-2 text-sm w-full md:w-auto min-w-[140px]"
          >
            {segmentos.map(o => <option key={o} value={o}>{o === 'TODOS' ? 'Todos Segmento' : o}</option>)}
          </select>

          {/* Filtro Campaña (Select) */}
          <select
            value={filterCampana}
            onChange={e => setFilterCampana(e.target.value)}
            className="form-input px-3 py-2 text-sm w-full md:w-auto min-w-[140px]"
          >
            {campanaOptions.map(o => <option key={o} value={o}>{o === 'TODOS' ? 'Todos Campaña' : o}</option>)}
          </select>

          {/* Filtro Estado (Select) */}
          <select
            value={filterEstado}
            onChange={e => setFilterEstado(e.target.value)}
            className="form-input px-3 py-2 text-sm w-full md:w-auto min-w-[140px]"
          >
            {estados.map(o => <option key={o} value={o}>{o === 'TODOS' ? 'Todos Estado' : o}</option>)}
          </select>
        </div>
      </Card>

      <div className="text-[10px] text-gray-500 mb-2">
        DEBUG STATE: P:[{filterPeriodo}] S:[{filterSegmento}] C:[{filterCampana}] E:[{filterEstado}] Sem:[{filterSemana}] Q:[{search}] | Filtered:{filtered.length}
      </div>

      {/* Tabla con encabezados agrupados */}
      <Card noPadding className="w-full">
        <div className="table-scroll overflow-x-auto w-full">
          <table className="w-full text-left text-xs min-w-[1400px]">
            <thead>
              <tr>
                {CAPACIDAD_RYS_GROUPS.map(grp => (
                  <th
                    key={grp.id}
                    colSpan={grp.fields.length}
                    className="px-3 py-2 font-bold uppercase tracking-wider text-[10px] border-b border-r text-center"
                    style={{
                      background: `${grp.color}22`,
                      color: grp.color,
                      borderColor: 'var(--border-subtle)',
                    }}
                  >
                    {grp.title}
                  </th>
                ))}
                <th
                  rowSpan={2}
                  className="px-3 py-2 font-bold text-[10px] border-b border-r border-[var(--border-subtle)] sticky right-[52px] z-20 bg-[var(--table-head-bg)] text-cyan-500"
                >
                  REAL / META
                </th>
                <th
                  rowSpan={2}
                  className="px-3 py-2 font-bold text-[10px] border-b border-[var(--border-subtle)] sticky right-0 z-20 bg-[var(--table-head-bg)] text-[var(--text-muted)]"
                >
                  Acciones
                </th>
              </tr>
              <tr>
                {CAPACIDAD_RYS_COLUMNS.map(col => (
                  <th
                    key={col.key}
                    className="px-3 py-2 font-semibold whitespace-nowrap border-b border-r border-[var(--border-subtle)] bg-[var(--table-head-bg)] text-[var(--text-muted)]"
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={CAPACIDAD_RYS_COLUMNS.length + 2} className="px-6 py-12 text-center" style={{ color: 'var(--text-muted)' }}>
                    No hay grupos registrados. Importa el CSV de CAPACIDAD_RYS o crea uno nuevo.
                  </td>
                </tr>
              ) : filtered.map((g, idx) => {
                const row = grupoToCapacidadRow(g)
                const real = g.postulantes_activos ?? 0
                const meta0 = g.meta_dia_0
                return (
                  <tr
                    key={idx}
                    className={`border-b border-[var(--border-subtle)] transition-colors hover:bg-[var(--bg-muted)] ${g.tiene_inconsistencias ? 'bg-rose-500/5' : ''}`}
                  >
                    {CAPACIDAD_RYS_COLUMNS.map(col => (
                      <td key={col.key} className="px-3 py-2 whitespace-nowrap max-w-[180px] truncate text-[var(--text-secondary)]">
                        {col.key === 'estado' ? (
                          <span className={`inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold border ${ESTADO_COLORS[row[col.key]] || ESTADO_COLORS.PLANIFICADO}`}>
                            {row[col.key] || '—'}
                          </span>
                        ) : col.key === 'grupo_capacitacion' ? (
                          String(row[col.key] || '').startsWith('PROY-') ? '—' : (String(row[col.key] || '').replace(/_\d+$/, '') || '—')
                        ) : (
                          row[col.key] || '—'
                        )}
                      </td>
                    ))}
                    <td className="px-3 py-2 sticky right-[52px] whitespace-nowrap bg-[var(--bg-surface)]">
                      <span className="font-bold text-[var(--text-primary)]">{real}</span>
                      {meta0 != null && meta0 !== '' && (
                        <span className="text-[var(--text-muted)]"> / {meta0}</span>
                      )}
                      {g.pct_cumplimiento_meta != null && (
                        <span className={`ml-1 text-[10px] font-bold ${g.pct_cumplimiento_meta >= 100 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'}`}>
                          ({g.pct_cumplimiento_meta}%)
                        </span>
                      )}
                      {g.tiene_inconsistencias && (
                        <div className="text-[9px] text-rose-500 dark:text-rose-400 mt-0.5 max-w-[120px] truncate" title={g.inconsistencias?.map(i => i.message).join('; ')}>
                          {g.inconsistencias?.[0]?.message}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 sticky right-0 bg-[var(--bg-surface)] border-l border-[var(--border-subtle)]">
                      {!readOnly && (
                        <button
                          onClick={() => openEdit(g)}
                          className="p-1.5 rounded-lg transition-colors text-[var(--accent)] hover:bg-[var(--accent)]/10"
                          title="Editar"
                        >
                          <Edit2 size={14} />
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2 text-[10px] border-t border-[var(--border-subtle)] flex items-center justify-between gap-2 text-[var(--text-muted)] bg-[var(--bg-muted)]">
          <span>{filtered.length} de {gruposEnriquecidos.length} grupos — sincronizado con nómina en tiempo real</span>
          <span className="opacity-70 hidden sm:inline">Scroll dentro de la tabla · ~10 filas visibles</span>
        </div>
      </Card>

      {/* Modal edición */}
      {editing && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div
            className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl border border-[var(--border-subtle)] shadow-2xl bg-[var(--bg-surface)]"
          >
            <div className="sticky top-0 flex items-center justify-between px-6 py-4 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] z-10">
              <h4 className="font-bold text-[var(--text-primary)]">
                {editing === 'new' ? 'Nuevo grupo de capacitación' : `Editar ${form.codigo}`}
              </h4>
              <button onClick={closeEdit} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"><X size={18} /></button>
            </div>
            <div className="p-6 space-y-6">
              {CAPACIDAD_RYS_GROUPS.map(grp => (
                <div key={grp.id}>
                  <h5 className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: grp.color }}>
                    {grp.title}
                  </h5>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {grp.fields.map(fieldKey => {
                      const col = CAPACIDAD_RYS_COLUMNS.find(c => c.key === fieldKey)
                      if (!col) return null
                      const formKey = {
                        campana: 'campana_nombre',
                        grupo_capacitacion: 'codigo',
                        condicion_laboral: 'condicion',
                        estado: 'estado',
                        fecha_inicio: 'fecha_registro',
                        periodo: 'periodo',
                        semana: 'semana_label',
                      }[fieldKey] || fieldKey

                      const listId = ['campana_nombre', 'segmento'].includes(formKey) ? `list-${formKey}` : undefined;

                      if (col.type === 'select') {
                        return (
                          <label key={fieldKey} className="block">
                            <span className="text-[10px] font-bold uppercase text-[var(--text-muted)]">{col.label}</span>
                            <select
                              value={form[formKey] || ''}
                              onChange={e => handleFormChange(formKey, e.target.value)}
                              disabled={formKey === 'codigo' && editing !== 'new'}
                              className="form-input mt-1 w-full px-3 py-2"
                            >
                              {col.options.map(o => <option key={o} value={o}>{o}</option>)}
                            </select>
                          </label>
                        )
                      }

                      return (
                        <label key={fieldKey} className="block">
                          <span className="text-[10px] font-bold uppercase text-[var(--text-muted)]">{col.label}</span>
                          <input
                            type={col.type === 'date' ? 'date' : col.type === 'number' || col.type === 'integer' ? 'number' : 'text'}
                            value={form[formKey] ?? ''}
                            onChange={e => handleFormChange(formKey, e.target.value)}
                            disabled={formKey === 'codigo' && editing !== 'new'}
                            list={listId}
                            className="form-input mt-1 w-full px-3 py-2"
                          />
                          {listId && (
                             <datalist id={listId}>
                                {formKey === 'campana_nombre' && campanaOptions.map(c => <option key={c} value={c} />)}
                                {formKey === 'segmento' && segmentoOptions.map(s => <option key={s} value={s} />)}
                             </datalist>
                          )}
                        </label>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
            <div className="sticky bottom-0 flex justify-end gap-2 px-6 py-4 border-t border-[var(--border-subtle)] bg-[var(--bg-surface)] z-10">
              <button onClick={closeEdit} className="btn-secondary">
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !form.codigo?.trim()}
                className="btn-primary flex items-center gap-2"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </PageLayout>
  )
}
