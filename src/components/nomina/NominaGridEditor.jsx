import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { checkCalibracionDia1, fetchReclutadoresFull } from '../../lib/dataService'
import { nameMatches } from '../../lib/dashboardAnalytics'
import { Loader2, Save, AlertCircle, CheckCircle2, Users, FileCheck, UserCheck, ShieldCheck, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react'
import ColumnFilter from '../ui/ColumnFilter'

function getHeaderColor(key, isSelected = false) {
  const group1 = ['celular', 'celular_referencia', 'correo', 'genero', 'fecha_nacimiento', 'edad', 'estado_civil', 'n_hijos', 'nivel_academico', 'carrera', 'distrito_residencia', 'lugar_residencia', 'direccion_domicilio', 'exp_call_center', 'exp_tipo_campana', 'exp_tiempo_call', 'fuente_oferta', 'observacion_reclutamiento'];
  const group2 = ['doc_cv', 'doc_dni_adjunto', 'doc_certijoven', 'doc_recibo_servicios', 'doc_ficha_datos', 'doc_autorizacion', 'status_final', 'observacion_final'];
  const group3 = ['validacion_reingreso', 'fecha_validacion', 'observacion_reingreso'];
  
  if (isSelected) {
    return 'bg-cyan-500/20 text-cyan-300 shadow-inner border-b-2 border-cyan-400';
  }

  if (group1.includes(key)) {
    return 'bg-sky-500/10 text-sky-300';
  }
  
  if (group2.includes(key)) {
    return 'bg-amber-500/10 text-amber-300';
  }
  
  if (group3.includes(key)) {
    return 'bg-emerald-500/10 text-emerald-300';
  }
  
  return 'bg-[var(--table-head-bg)] text-[var(--text-secondary)]';
}

// 1. Datos Demográficos y de Contacto (Cargados desde Bolsa de Postulantes)
export const POSTULANTE_COLUMNS = [
  { key: 'celular', label: 'CELULAR', width: 130 },
  { key: 'celular_referencia', label: 'CEL. REF.', width: 130 },
  { key: 'correo', label: 'CORREO', width: 220 },
  { key: 'genero', label: 'GÉNERO', width: 110 },
  { key: 'fecha_nacimiento', label: 'F. NACIMIENTO', width: 130 },
  { key: 'edad', label: 'EDAD', width: 90, type: 'number' },
  { key: 'estado_civil', label: 'ESTADO CIVIL', width: 130 },
  { key: 'n_hijos', label: 'N° HIJOS', width: 90, type: 'number' },
  { key: 'nivel_academico', label: 'NIVEL ACADÉMICO', width: 160 },
  { key: 'carrera', label: 'CARRERA', width: 160 },
  { key: 'distrito_residencia', label: 'DISTRITO', width: 150 },
  { key: 'lugar_residencia', label: 'LUGAR RESIDENCIA', width: 160 },
  { key: 'direccion_domicilio', label: 'DIRECCIÓN', width: 220 },
  { key: 'exp_call_center', label: 'EXP. CALL', width: 130 },
  { key: 'exp_tipo_campana', label: 'EXP. CAMPAÑA', width: 160 },
  { key: 'exp_tiempo_call', label: 'TIEMPO EXP.', width: 130 },
  { key: 'fuente_oferta', label: 'FUENTE OFERTA', width: 160 },
  { key: 'observacion_reclutamiento', label: 'OBS. RECLUTAMIENTO', width: 220 }
]

// 2. Gestión Operativa y Capacitación
export const OPERACION_COLUMNS = [
  { key: 'reclutador', label: 'RECLUTADOR', width: 220, type: 'select', options: [] },
  { key: 'sede', label: 'SEDE', width: 150, type: 'select', options: ['ATE', 'SAN ISIDRO', 'COMAS', 'JOCKEY'] },
  { key: 'modalidad', label: 'MODALIDAD', width: 120, type: 'select', options: ['PRESENCIAL', 'HIBRIDO', 'REMOTO'] },
  { key: 'condicion', label: 'CONDICIÓN', width: 120, type: 'select', options: ['FULL TIME', 'PART TIME'] },
  { key: 'horario_gestion', label: 'HORARIO DE GESTIÓN', width: 150 },
  { key: 'descanso', label: 'DESCANSO', width: 100 },
  { key: 'envio_dni', label: 'ENVÍO DNI', width: 120, type: 'select', options: ['SI', '-', 'PENDIENTE'] },
  { key: 'test_psicologico', label: 'TEST PSICO.', width: 120, type: 'select', options: ['SI', '-', 'PENDIENTE'] },
  { key: 'validacion_pc', label: 'VALID. PC', width: 120, type: 'select', options: ['SI', '-', 'PENDIENTE'] },
  { key: 'evaluacion_dia_0', label: 'EVAL. DÍA 0', width: 120, type: 'select', options: ['SI', '-', 'PENDIENTE'] },
  { key: 'fecha_inicio_capacitacion', label: 'INICIO CAPA.', width: 120, type: 'date' },
  { key: 'fecha_fin_capacitacion', label: 'FIN CAPA.', width: 120, type: 'date' },
  { key: 'fecha_conexion_ojt', label: 'CONEXIÓN OJT', width: 120, type: 'date' },
  { key: 'fecha_conexion_op', label: 'CONEXIÓN OP', width: 120, type: 'date' },
  { key: 'pago_capacitacion', label: 'PAGO CAPA.', width: 100 },
  { key: 'tipo_contratacion', label: 'TIPO CONTRATACIÓN', width: 150 },
  { key: 'razon_social', label: 'RAZÓN SOCIAL', width: 150, type: 'select', options: ['GEA', 'SET'] },
  { key: 'remuneracion', label: 'REMUNERACIÓN', width: 120, type: 'number' },
  { key: 'bono_variable', label: 'BONO VARIABLE', width: 120, type: 'number' },
  { key: 'bono_movilidad', label: 'BONO MOVILIDAD', width: 120, type: 'number' },
  { key: 'bono_bienvenida', label: 'BONO BIENVENIDA', width: 120, type: 'number' },
  { key: 'bono_permanencia', label: 'BONO PERMANENCIA', width: 120, type: 'number' },
  { key: 'bono_asistencia_perfecta', label: 'BONO ASIST. PERF.', width: 120, type: 'number' },
  { key: 'cargo_contractual', label: 'CARGO CONTRACTUAL', width: 200, type: 'select', options: ['AGENTE TMK OUTBOUND', 'AGENTE TMK INBOUND', 'AGENTE TMK RETENCIONES'] },
  { key: 'dia_0', label: 'DÍA 0', width: 120, type: 'select', options: ['ASISTIO', 'FALTA'] },
  { key: 'dia_0_obs', label: 'OBSERVACIONES DÍA 0', width: 200 },
  { key: 'status_dia_1', label: 'STATUS DÍA 1', width: 120, type: 'select', options: ['APTO', 'RECUPERADO', 'AGREGADO', 'CESE', 'OBSERVADO'] },
  { key: 'dia_1', label: 'DÍA 1', width: 120, type: 'select', options: ['ASISTIO', 'FALTA'] },
  { key: 'dia_1_obs', label: 'OBSERVACIONES DÍA 1', width: 200 },
  { key: 'evaluar', label: 'EVALUAR', width: 150, type: 'select', options: ['APROBADO', 'DESAPROBADO', 'NO DA EVALUAR', 'NO LE LLEGA EL CORREO', 'SIN STATUS', 'DESAPRUEBA Y DA SEGUNDO EVALUAR'] },
  { key: 'obs_evaluar', label: 'OBS. EVALUAR', width: 200 }
]

// 3. Documentación y Validación
export const DOCUMENTOS_COLUMNS = [
  { key: 'doc_cv', label: 'CV', width: 80, type: 'select', options: ['OK', 'PENDIENTE'] },
  { key: 'doc_dni_adjunto', label: 'DNI (ADJUNTO)', width: 120, type: 'select', options: ['OK', 'PENDIENTE'] },
  { key: 'doc_certijoven', label: 'CERTIJOVEN', width: 120, type: 'select', options: ['OK', 'PENDIENTE'] },
  { key: 'doc_recibo_servicios', label: 'RECIBO SERV.', width: 120, type: 'select', options: ['OK', 'PENDIENTE'] },
  { key: 'doc_ficha_datos', label: 'FICHA DATOS', width: 120, type: 'select', options: ['OK', 'PENDIENTE'] },
  { key: 'doc_autorizacion', label: 'AUTORIZACIÓN', width: 120, type: 'select', options: ['OK', 'PENDIENTE'] },
  { key: 'status_final', label: 'STATUS FINAL', width: 120, type: 'select', options: ['COMPLETO', 'PENDIENTE'] },
  { key: 'observacion_final', label: 'OBS. FINAL', width: 200 },
  { key: 'validacion_reingreso', label: 'VALIDACIÓN DE REINGRESO', width: 160, type: 'select', options: ['REINGRESO', 'NO REINGRESO'] },
  { key: 'fecha_validacion', label: 'FECHA DE VALIDACIÓN', width: 150, type: 'date' },
  { key: 'observacion_reingreso', label: 'OBSERVACIÓN REINGRESO', width: 200 }
]

export const ALL_EDITABLE_COLUMNS = [
  ...POSTULANTE_COLUMNS,
  ...OPERACION_COLUMNS,
  ...DOCUMENTOS_COLUMNS
]

export default function NominaGridEditor({
  grupoCodigo,
  campana,
  periodo,
  semana,
  segmento,
  onSaveComplete,
  userProfile = null,
  currentRole = null,
  reclutadores = [],
  refreshKey = 0
}) {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [columnTab, setColumnTab] = useState('POSTULANTE') // 'POSTULANTE' | 'OPERATIVO' | 'DOCUMENTOS' | 'TODO'
  const [lastUpdatedTime, setLastUpdatedTime] = useState(() => {
    const now = new Date()
    return now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  })
  const [savingStatus, setSavingStatus] = useState('idle') // 'idle' | 'saving' | 'saved' | 'error'
  const [error, setError] = useState(null)
  const [selectedColumn, setSelectedColumn] = useState(null)
  const [filters, setFilters] = useState({})
  const [reclutadoresList, setReclutadoresList] = useState([])
  const [externalChangeDetected, setExternalChangeDetected] = useState(false)
  const [showMissingDetails, setShowMissingDetails] = useState(false)

  const visibleColumns = useMemo(() => {
    if (columnTab === 'POSTULANTE') return POSTULANTE_COLUMNS
    if (columnTab === 'OPERATIVO') return OPERACION_COLUMNS
    if (columnTab === 'DOCUMENTOS') return DOCUMENTOS_COLUMNS
    return ALL_EDITABLE_COLUMNS
  }, [columnTab])

  // Debounce ref to store pending updates grouped by rowId
  const pendingUpdatesRef = useRef(new Map())
  const debounceTimersRef = useRef(new Map())
  const lastLoadedAtRef = useRef(null)

  useEffect(() => {
    fetchReclutadoresFull()
      .then(res => setReclutadoresList((res || []).filter(r => r.activo)))
      .catch(err => console.error("Error cargando reclutadores:", err))
  }, [])

  const reclutadorOptions = useMemo(() => {
    const names = new Set([
      ...reclutadoresList.map(r => r.nombre_completo),
      ...data.map(d => d.reclutador).filter(Boolean)
    ]);
    return [...names].sort();
  }, [reclutadoresList, data]);

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }))
  }

  const filteredData = useMemo(() => {
    return data.filter(row => {
      for (const key in filters) {
        const selections = filters[key];
        if (!selections || selections.length === 0) continue;
        
        let rowVal = '';
        if (key === 'candidato') {
          rowVal = `${row.apellido_paterno || ''} ${row.nombres || ''} ${row.documento || ''}`.trim();
        } else {
          rowVal = String(row[key] || '').trim();
        }
        
        if (!selections.includes(rowVal)) {
          return false;
        }
      }
      return true
    })
  }, [data, filters])

  const userFullName = userProfile?.nombre_completo || userProfile?.nombre || ''

  const loadData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    else setIsRefreshing(true)
    setError(null)
    setExternalChangeDetected(false)
    try {
      let query = supabase
        .from('nominas')
        .select('*')
        .order('apellido_paterno', { ascending: true })
        .limit(5000)

      if (grupoCodigo && grupoCodigo !== 'ALL') {
        const cleanCod = String(grupoCodigo).split(' - ')[0].trim()
        query = query.or(`grupo_codigo.eq.${cleanCod},grupo_codigo.ilike.%${cleanCod}%`)
      }

      if (periodo) {
        const rawP = String(periodo).replace(/\D/g, '')
        if (rawP) {
          query = query.or(`periodo_reclutado.eq.${periodo},periodo_reclutado.ilike.%${rawP}%`)
        } else {
          query = query.eq('periodo_reclutado', String(periodo).trim())
        }
      }

      if (semana) {
        const semanaNum = parseInt(String(semana).replace(/\D/g, ''), 10)
        if (!isNaN(semanaNum)) {
          query = query.eq('semana_trabajo', semanaNum)
        }
      }

      if (campana) {
        query = query.ilike('campana', `%${String(campana).trim()}%`)
      }

      if (currentRole === 'reclutador') {
        if (userFullName) {
          query = query.ilike('reclutador', `%${userFullName.trim()}%`)
        }
      }

      const { data: rows, error: err } = await query

      if (err) throw err
      
      let finalRows = rows || []
      if (currentRole === 'reclutador') {
        if (userFullName) {
          finalRows = finalRows.filter(r => nameMatches(r.reclutador, userFullName))
        }
      }

      setData(finalRows)
      lastLoadedAtRef.current = new Date().toISOString()
      const now = new Date()
      setLastUpdatedTime(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }))
    } catch (err) {
      console.error('Error cargando nomina en grid:', err)
      setError(err.message)
    } finally {
      setLoading(false)
      setIsRefreshing(false)
    }
  }, [grupoCodigo, campana, periodo, semana, segmento, currentRole, userFullName])

  useEffect(() => {
    if (grupoCodigo) loadData(false)
  }, [grupoCodigo, campana, periodo, semana, segmento, currentRole, userFullName, refreshKey])

  // ── Realtime concurrency detection ─────────────────────────────
  useEffect(() => {
    if (!grupoCodigo) return
    const channel = supabase
      .channel(`nominas-concurrency-${grupoCodigo}-${periodo || 'all'}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'nominas', filter: `grupo_codigo=eq.${grupoCodigo}` },
        (payload) => {
          const updatedAt = payload.new?.updated_at
          const loadedAt = lastLoadedAtRef.current
          if (updatedAt && loadedAt && updatedAt > loadedAt) {
            setExternalChangeDetected(true)
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [grupoCodigo, periodo])

  // Flush batched updates for a row to database
  const flushRowUpdate = async (rowId) => {
    const rowUpdates = pendingUpdatesRef.current.get(rowId)
    if (!rowUpdates || Object.keys(rowUpdates).length === 0) return

    pendingUpdatesRef.current.delete(rowId)
    setSavingStatus('saving')

    try {
      const { error: err } = await supabase
        .from('nominas')
        .update(rowUpdates)
        .eq('id', rowId)

      if (err) throw err

      lastLoadedAtRef.current = new Date().toISOString()

      if (rowUpdates.dia_1) {
        await checkCalibracionDia1(grupoCodigo, campana).catch(e => console.error('Calibration check error:', e))
      }

      setSavingStatus('saved')
      setTimeout(() => setSavingStatus('idle'), 2000)
      onSaveComplete?.()
    } catch (err) {
      console.error('Save error', err)
      setSavingStatus('error')
    }
  }

  // Handle cell edit with 1.2s debounce and row-level batching
  const handleCellChange = (rowId, key, value, immediate = false) => {
    const updateObj = { [key]: value || null }
    if (key === 'reclutador') {
      const recObj = reclutadores.find(r => (r.nombre_completo || '').trim().toUpperCase() === (value || '').trim().toUpperCase())
      updateObj.reclutador_id = recObj ? recObj.id : null
    }

    // 1. Optimistic local state update
    setData(prev => prev.map(r => r.id === rowId ? { ...r, ...updateObj } : r))

    // 2. Accumulate in batch
    const currentPending = pendingUpdatesRef.current.get(rowId) || {}
    pendingUpdatesRef.current.set(rowId, { ...currentPending, ...updateObj })

    // 3. Clear previous debounce timer for this row
    if (debounceTimersRef.current.has(rowId)) {
      clearTimeout(debounceTimersRef.current.get(rowId))
    }

    if (immediate) {
      flushRowUpdate(rowId)
    } else {
      setSavingStatus('saving')
      const timer = setTimeout(() => {
        flushRowUpdate(rowId)
        debounceTimersRef.current.delete(rowId)
      }, 1200)
      debounceTimersRef.current.set(rowId, timer)
    }
  }

  // Handle bulk replication of a column to all filtered rows
  const handleBulkUpdate = async () => {
    if (!selectedColumn || filteredData.length < 2) return
    const firstRow = filteredData[0]
    const updateObj = { [selectedColumn]: firstRow[selectedColumn] || null }
    if (selectedColumn === 'reclutador') {
      const recObj = reclutadores.find(r => (r.nombre_completo || '').trim().toUpperCase() === (firstRow[selectedColumn] || '').trim().toUpperCase())
      updateObj.reclutador_id = recObj ? recObj.id : null
    }

    const updatedData = data.map(row => {
      const inFilter = filteredData.some(f => f.id === row.id)
      if (inFilter && row.id !== firstRow.id) {
        return { ...row, ...updateObj }
      }
      return row
    })

    setData(updatedData)
    setSavingStatus('saving')

    try {
      const targetIds = filteredData.filter(f => f.id !== firstRow.id).map(f => f.id)
      const { error: err } = await supabase
        .from('nominas')
        .update(updateObj)
        .in('id', targetIds)

      if (err) throw err

      if (selectedColumn === 'dia_1') {
        await checkCalibracionDia1(grupoCodigo, campana).catch(e => console.error('Calibration check error:', e))
      }

      setSavingStatus('saved')
      setTimeout(() => setSavingStatus('idle'), 2000)
      onSaveComplete?.()
    } catch (err) {
      console.error('Bulk save error', err)
      setError(err.message)
      setSavingStatus('error')
    }
  }

  // Fix docsOk: check ALL 7 doc columns per spec
  const kpis = useMemo(() => {
    const total = data.length
    const asistieronD0 = data.filter(d => (d.dia_0 || '').toUpperCase() === 'ASISTIO').length
    const asistieronD1 = data.filter(d => (d.dia_1 || '').toUpperCase() === 'ASISTIO').length
    const docsOk = data.filter(d => {
      if ((d.status_final || '').toUpperCase() === 'COMPLETO') return true
      return (
        (d.doc_cv || '').toUpperCase() === 'OK' &&
        (d.doc_dni_adjunto || '').toUpperCase() === 'OK' &&
        (d.doc_certijoven || '').toUpperCase() === 'OK' &&
        (d.doc_recibo_servicios || '').toUpperCase() === 'OK' &&
        (d.doc_ficha_datos || '').toUpperCase() === 'OK' &&
        (d.doc_autorizacion || '').toUpperCase() === 'OK'
      )
    }).length

    return {
      total,
      asistieronD0,
      pctD0: total > 0 ? ((asistieronD0 / total) * 100).toFixed(0) : 0,
      asistieronD1,
      pctD1: total > 0 ? ((asistieronD1 / total) * 100).toFixed(0) : 0,
      docsOk,
      pctDocs: total > 0 ? ((docsOk / total) * 100).toFixed(0) : 0,
    }
  }, [data])

  const missingDataCandidates = useMemo(() => {
    const invalidList = []
    data.forEach(p => {
      const dia0Val = (p.dia_0 || '').toString().toUpperCase().trim()
      const statusDia1Val = (p.status_dia_1 || '').toString().toUpperCase().trim()
      
      const asistioD0 = dia0Val === 'ASISTIO'
      const agregadoD1 = statusDia1Val === 'AGREGADO' || statusDia1Val === 'RECUPERADO'
      
      if (asistioD0 || agregadoD1) {
        const missing = []
        if (!p.sede) missing.push('Sede')
        if (!p.modalidad) missing.push('Modalidad')
        if (!p.condicion) missing.push('Condición Laboral')

        if (missing.length > 0) {
          invalidList.push({
            nombre: `${p.apellido_paterno || ''} ${p.nombres || ''}`.trim() || p.documento || 'Sin nombre',
            faltantes: missing.join(', ')
          })
        }
      }
    })
    return invalidList
  }, [data])

  if (!grupoCodigo) {
    return (
      <div className="p-8 text-center text-[var(--text-muted)] bg-[var(--bg-surface)] rounded-xl border border-[var(--border-subtle)]">
        Selecciona un grupo para empezar a editar su nómina.
      </div>
    )
  }

  return (
    <div
      className="flex flex-col rounded-2xl border border-[var(--border-subtle)] overflow-hidden shadow-2xl space-y-0"
      style={{
        background: 'var(--bg-surface)'
      }}
    >
      {/* ── 4 MINI KPIS BAR ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 border-b border-[var(--border-subtle)] bg-[var(--bg-elevated)]/50">
        {/* Total Postulantes */}
        <div className="p-2.5 sm:p-3 rounded-xl bg-[var(--bg-surface)] border border-cyan-500/20 shadow-[0_0_12px_rgba(0,245,255,0.08)] flex items-center justify-between">
          <div>
            <div className="text-[10px] font-extrabold uppercase tracking-wider text-[var(--text-muted)]">Total Postulantes</div>
            <div className="text-xl sm:text-2xl font-black text-cyan-400 leading-none mt-1" style={{ fontFamily: 'Space Grotesk, Inter, sans-serif' }}>
              {kpis.total}
            </div>
          </div>
          <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400">
            <Users size={18} />
          </div>
        </div>

        {/* Asistieron Día 0 */}
        <div className="p-2.5 sm:p-3 rounded-xl bg-[var(--bg-surface)] border border-emerald-500/20 shadow-[0_0_12px_rgba(57,255,20,0.08)] flex items-center justify-between">
          <div>
            <div className="text-[10px] font-extrabold uppercase tracking-wider text-[var(--text-muted)]">Asistieron Día 0</div>
            <div className="text-xl sm:text-2xl font-black text-emerald-400 leading-none mt-1" style={{ fontFamily: 'Space Grotesk, Inter, sans-serif' }}>
              {kpis.asistieronD0} <span className="text-xs font-bold text-[var(--text-muted)]">({kpis.pctD0}%)</span>
            </div>
          </div>
          <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
            <UserCheck size={18} />
          </div>
        </div>

        {/* Asistieron Día 1 */}
        <div className="p-2.5 sm:p-3 rounded-xl bg-[var(--bg-surface)] border border-purple-500/20 shadow-[0_0_12px_rgba(191,95,255,0.08)] flex items-center justify-between">
          <div>
            <div className="text-[10px] font-extrabold uppercase tracking-wider text-[var(--text-muted)]">Asistieron Día 1</div>
            <div className="text-xl sm:text-2xl font-black text-purple-400 leading-none mt-1" style={{ fontFamily: 'Space Grotesk, Inter, sans-serif' }}>
              {kpis.asistieronD1} <span className="text-xs font-bold text-[var(--text-muted)]">({kpis.pctD1}%)</span>
            </div>
          </div>
          <div className="p-2 rounded-lg bg-purple-500/10 text-purple-400">
            <ShieldCheck size={18} />
          </div>
        </div>

        {/* Documentación OK */}
        <div className="p-2.5 sm:p-3 rounded-xl bg-[var(--bg-surface)] border border-orange-500/20 shadow-[0_0_12px_rgba(255,122,0,0.08)] flex items-center justify-between">
          <div>
            <div className="text-[10px] font-extrabold uppercase tracking-wider text-[var(--text-muted)]">Documentos OK</div>
            <div className="text-xl sm:text-2xl font-black text-orange-400 leading-none mt-1" style={{ fontFamily: 'Space Grotesk, Inter, sans-serif' }}>
              {kpis.docsOk} <span className="text-xs font-bold text-[var(--text-muted)]">({kpis.pctDocs}%)</span>
            </div>
          </div>
          <div className="p-2 rounded-lg bg-orange-500/10 text-orange-400">
            <FileCheck size={18} />
          </div>
        </div>
      </div>

      {/* ── TOOLBAR: Grupo Info, Replicar, Estado Guardado ── */}
      <div className="p-3 sm:p-4 border-b border-[var(--border-subtle)] flex flex-wrap justify-between items-center gap-3 bg-[var(--bg-surface)]">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-extrabold text-[var(--text-primary)] text-base">Edición de Nómina</h3>
            <span className="font-mono text-xs font-black px-2 py-0.5 rounded-md bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
              {grupoCodigo}
            </span>
          </div>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            {[periodo, semana ? (semana.toUpperCase().startsWith('SEM') ? semana : `Sem ${semana}`) : '', segmento, campana].filter(Boolean).join(' · ')}
            {([periodo, semana, segmento, campana].some(Boolean) ? ' · ' : '')}
            {data.length} candidatos cargados
          </p>
        </div>

        {/* View Mode Tabs Selector */}
        <div className="flex items-center bg-[var(--bg-elevated)] p-1 rounded-xl border border-[var(--border-subtle)] gap-1">
          <button
            type="button"
            onClick={() => setColumnTab('POSTULANTE')}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              columnTab === 'POSTULANTE'
                ? 'bg-sky-500 text-white shadow-xs'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            👤 Datos Postulante (Bolsa)
          </button>
          <button
            type="button"
            onClick={() => setColumnTab('OPERATIVO')}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              columnTab === 'OPERATIVO'
                ? 'bg-cyan-500 text-white shadow-xs'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            ⚙️ Operación & Capa
          </button>
          <button
            type="button"
            onClick={() => setColumnTab('DOCUMENTOS')}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              columnTab === 'DOCUMENTOS'
                ? 'bg-amber-500 text-white shadow-xs'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            📑 Documentos
          </button>
          <button
            type="button"
            onClick={() => setColumnTab('TODO')}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              columnTab === 'TODO'
                ? 'bg-purple-500 text-white shadow-xs'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            🌐 Ver Todo ({visibleColumns.length})
          </button>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          {/* Botón de Actualizar sin recargar página */}
          <button
            type="button"
            onClick={() => {
              loadData(true)
              if (onSaveComplete) onSaveComplete()
            }}
            disabled={loading || isRefreshing}
            className="text-xs px-3 py-1.5 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 font-bold rounded-lg border border-cyan-500/30 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 cursor-pointer active:scale-95 shadow-2xs"
            title="Recargar postulantes y nuevos ingresos de este grupo"
          >
            <RefreshCw size={13} className={(loading || isRefreshing) ? 'animate-spin text-cyan-400' : ''} />
            <span>{isRefreshing ? 'Actualizando...' : 'Actualizar'}</span>
          </button>

          <button 
            onClick={handleBulkUpdate}
            disabled={data.length < 2 || savingStatus === 'saving' || !selectedColumn}
            className="text-xs px-3 py-1.5 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 font-bold rounded-lg border border-cyan-500/30 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
          >
            <CheckCircle2 size={14} /> 
            {selectedColumn 
              ? `Replicar "${ALL_EDITABLE_COLUMNS.find(c => c.key === selectedColumn)?.label}" a todos` 
              : 'Selecciona columna para replicar'}
          </button>

          {/* Autosave status pill + subtle timestamp */}
          <div className="flex items-center gap-2 text-xs font-bold px-3 py-1.5 rounded-lg border bg-[var(--bg-elevated)] border-[var(--border-subtle)]">
            {savingStatus === 'saving' && (
              <span className="flex items-center gap-1.5 text-cyan-400">
                <Loader2 size={13} className="animate-spin" /> Guardando...
              </span>
            )}
            {savingStatus === 'saved' && (
              <span className="flex items-center gap-1.5 text-emerald-400">
                <CheckCircle2 size={13} /> Guardado ✓
              </span>
            )}
            {savingStatus === 'error' && (
              <span className="flex items-center gap-1.5 text-red-400">
                <AlertCircle size={13} /> Error al guardar
              </span>
            )}
            {savingStatus === 'idle' && (
              <span className="text-[var(--text-muted)] flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Sincronizado
              </span>
            )}
            {lastUpdatedTime && (
              <span className="text-[10px] text-[var(--text-muted)] font-mono opacity-60 border-l border-[var(--border-subtle)] pl-2" title="Hora de última sincronización">
                {lastUpdatedTime}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* External concurrency alert */}
      {externalChangeDetected && (
        <div className="p-3 mx-4 mt-3 rounded-xl bg-cyan-900/30 border border-cyan-500/30 flex items-center justify-between text-xs text-cyan-200">
          <span>⚠️ Se han detectado cambios recientes en este grupo por otro usuario.</span>
          <button onClick={loadData} className="px-2 py-1 rounded bg-cyan-500/20 hover:bg-cyan-500/40 text-cyan-300 font-bold flex items-center gap-1">
            <RefreshCw size={12} /> Recargar
          </button>
        </div>
      )}

      {/* Missing data alert (Collapsible) */}
      {missingDataCandidates.length > 0 && (
        <div className="mx-4 my-3 rounded-xl bg-orange-500/10 border border-orange-500/30 overflow-hidden shadow-sm transition-all">
          <div className="p-3 flex items-center justify-between gap-3 bg-orange-500/5">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="bg-orange-500/20 p-1.5 rounded-lg text-orange-400 shrink-0">
                <AlertCircle size={16} />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="text-xs font-black text-orange-300 uppercase tracking-wider">
                    Atención: Candidatos con datos obligatorios incompletos ({missingDataCandidates.length})
                  </h4>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-200 border border-orange-500/30">
                    Sede / Modalidad / Condición
                  </span>
                </div>
                <p className="text-[11px] text-orange-200/80 truncate mt-0.5">
                  Cumplen regla de asistencia pero faltan datos para que pasen a la pantalla del Formador.
                </p>
              </div>
            </div>

            <button
              onClick={() => setShowMissingDetails(prev => !prev)}
              className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-500/20 hover:bg-orange-500/30 text-orange-200 hover:text-orange-100 text-xs font-bold border border-orange-500/30 transition-all cursor-pointer shadow-sm"
              title={showMissingDetails ? "Ocultar lista de postulantes" : "Ver qué candidatos faltan"}
            >
              {showMissingDetails ? (
                <>
                  <ChevronUp size={14} />
                  <span>Ocultar ({missingDataCandidates.length})</span>
                </>
              ) : (
                <>
                  <ChevronDown size={14} />
                  <span>Ver faltantes ({missingDataCandidates.length})</span>
                </>
              )}
            </button>
          </div>

          {showMissingDetails && (
            <div className="p-3 border-t border-orange-500/20 bg-black/20">
              <div className="flex flex-wrap gap-2 max-h-36 overflow-y-auto pr-1">
                {missingDataCandidates.map((c, idx) => (
                  <span key={idx} className="text-[10px] bg-orange-950/60 px-2.5 py-1 rounded-md border border-orange-500/30 text-orange-200 font-medium">
                    <strong className="text-orange-300">{c.nombre}:</strong> {c.faltantes}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── GRID TABLE ── */}
      <div className="overflow-auto table-scroll" style={{ minHeight: '520px', maxHeight: 'calc(100vh - 280px)' }}>
        {loading && data.length === 0 ? (
          <div className="h-64 flex items-center justify-center text-[var(--text-muted)] gap-2">
            <Loader2 className="animate-spin text-cyan-400" /> Cargando nómina...
          </div>
        ) : data.length === 0 ? (
          <div className="h-64 flex items-center justify-center text-[var(--text-muted)]">
            No hay candidatos asignados a este grupo.
          </div>
        ) : (
          <table className="w-full text-left text-xs whitespace-nowrap">
            <thead className="bg-[var(--table-head-bg)] sticky top-0 z-10 shadow-sm">
              <tr>
                <th className="p-2.5 font-bold text-[var(--text-secondary)] border-r border-[var(--border-subtle)] sticky left-0 bg-[var(--table-head-bg)] z-20 shadow-sm align-middle uppercase tracking-wider text-[10px]">
                  <div className="flex items-center justify-between gap-2">
                    <span>CANDIDATO (Solo Lectura)</span>
                    <ColumnFilter 
                      columnKey="candidato"
                      label="Candidato"
                      data={data}
                      currentSelection={filters['candidato']}
                      onApply={(selections) => handleFilterChange('candidato', selections)}
                    />
                  </div>
                </th>
                {visibleColumns.map(col => (
                  <th 
                    key={col.key} 
                    className={`p-2.5 font-bold border-r border-[var(--border-subtle)] select-none align-middle uppercase tracking-wider text-[10px] ${getHeaderColor(col.key, selectedColumn === col.key)}`} 
                    style={{ minWidth: col.width }}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <div 
                        className="cursor-pointer hover:text-cyan-400 transition-colors flex-1 truncate"
                        onClick={() => setSelectedColumn(col.key)}
                        title="Haz clic para seleccionar y replicar esta columna"
                      >
                        {col.label}
                      </div>
                      <ColumnFilter 
                        columnKey={col.key}
                        label={col.label}
                        data={data}
                        currentSelection={filters[col.key]}
                        onApply={(selections) => handleFilterChange(col.key, selections)}
                      />
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {filteredData.map(row => (
                <tr key={row.id} className="hover:bg-[var(--bg-muted)] transition-colors">
                  <td className="p-2.5 border-r border-[var(--border-subtle)] sticky left-0 bg-[var(--bg-surface)] z-10 shadow-sm flex flex-col">
                    <span className="font-bold text-[var(--text-primary)] uppercase">
                      {[row.apellido_paterno, row.apellido_materno, row.nombres].filter(Boolean).join(' ') || row.nombre_completo || 'SIN NOMBRE'}
                    </span>
                    <span className="text-[10px] text-[var(--text-muted)] font-mono">{row.documento}</span>
                  </td>
                  {visibleColumns.map(col => {
                    const val = row[col.key] || '';
                    let badgeClass = 'text-[var(--text-primary)]';
                    if (val === 'OK' || val === 'COMPLETO' || val === 'APROBADO' || val === 'APTO' || val === 'ASISTIO') {
                      badgeClass = 'bg-emerald-500/10 text-emerald-400 font-bold';
                    } else if (val === 'PENDIENTE' || val === 'FALTA' || val === 'DESAPROBADO' || val === 'CESE' || val === 'OBSERVADO') {
                      badgeClass = 'bg-red-500/10 text-red-400 font-bold';
                    }

                    return (
                      <td key={col.key} className={`p-0 border-r border-[var(--border-subtle)] ${badgeClass}`}>
                        {col.type === 'select' ? (
                          <select
                            value={val}
                            onChange={e => handleCellChange(row.id, col.key, e.target.value, false)}
                            onBlur={e => handleCellChange(row.id, col.key, e.target.value, true)}
                            onFocus={() => setSelectedColumn(col.key)}
                            className="w-full h-full p-2 bg-transparent text-xs font-semibold outline-none focus:ring-1 focus:ring-cyan-400 transition-colors"
                          >
                            <option value="" className="bg-[var(--bg-surface)] text-[var(--text-muted)]">--</option>
                            {(col.key === 'reclutador' ? reclutadorOptions : col.options || []).map(opt => (
                              <option key={opt} value={opt} className="bg-[var(--bg-surface)] text-[var(--text-primary)]">
                                {opt}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type={col.type || 'text'}
                            value={val}
                            onChange={e => handleCellChange(row.id, col.key, e.target.value, false)}
                            onBlur={e => handleCellChange(row.id, col.key, e.target.value, true)}
                            onFocus={() => setSelectedColumn(col.key)}
                            onKeyDown={e => e.key === 'Enter' && e.target.blur()}
                            className="w-full h-full p-2 bg-transparent text-xs font-medium outline-none focus:ring-1 focus:ring-cyan-400 transition-colors placeholder:text-[var(--text-muted)]/40"
                            placeholder="..."
                          />
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
