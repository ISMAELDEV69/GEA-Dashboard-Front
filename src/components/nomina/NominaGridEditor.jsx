import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { checkCalibracionDia1, fetchReclutadoresFull, invalidateCache } from '../../lib/dataService'
import { nameMatches } from '../../lib/dashboardAnalytics'
import { Loader2, Save, AlertCircle, CheckCircle2, Users, FileCheck, UserCheck, ShieldCheck, RefreshCw, ChevronDown, ChevronUp, Trash2, AlertTriangle, Pencil, X, Eye, Lock, MessageSquare, Copy, Check, Sparkles, FileSpreadsheet, FileWarning, CheckCheck, Send, Filter } from 'lucide-react'
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
  { key: 'reclutador', label: 'RECLUTADOR', width: 220, isLocked: true },
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
  { key: 'status_final', label: 'STATUS FINAL', width: 120, type: 'select', options: ['COMPLETO', 'PENDIENTE', 'DESISTE', 'NO PROCEDE'] },
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

  // ── Role Permissions & Read-Only Mode ───────────────────────────
  const isCapacitacionRole = ['supervisor_capacitacion', 'formador', 'jefe_capacitacion', 'visor'].includes(currentRole)
  const isReadOnly = isCapacitacionRole

  // ── Duplicate Detection & Delete Management ─────────────────────
  const [onlyDuplicatesFilter, setOnlyDuplicatesFilter] = useState(false)
  const [onlyIncompleteDocsFilter, setOnlyIncompleteDocsFilter] = useState(false)
  const [rowToDelete, setRowToDelete] = useState(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteFeedback, setDeleteFeedback] = useState(null)

  // ── WhatsApp Report State ───────────────────────────────────────
  const [showWhatsappModal, setShowWhatsappModal] = useState(false)
  const [whatsappDia, setWhatsappDia] = useState('DIA_0') // 'DIA_0' | 'DIA_1'
  const [whatsappRq, setWhatsappRq] = useState('')
  const [whatsappAsistenciaFinal, setWhatsappAsistenciaFinal] = useState('')
  const [whatsappMenciones, setWhatsappMenciones] = useState(() => {
    return localStorage.getItem('gea_wa_menciones') || '@Tania @Cristina'
  })
  const [whatsappNota, setWhatsappNota] = useState(() => {
    return localStorage.getItem('gea_wa_nota') || 'Se procede a llamar a las faltas y agregados'
  })
  const [copiedFeedback, setCopiedFeedback] = useState(false)

  // ── Candidate (DNI / Name) Edit Management with Audit ───────────
  const [candidateToEdit, setCandidateToEdit] = useState(null)
  const [editFormData, setEditFormData] = useState({
    documento: '',
    apellido_paterno: '',
    apellido_materno: '',
    nombres: '',
    celular: ''
  })
  const [isSavingCandidate, setIsSavingCandidate] = useState(false)
  const [candidateSaveFeedback, setCandidateSaveFeedback] = useState(null)

  const handleOpenEditCandidate = (row) => {
    if (isReadOnly) return
    setCandidateToEdit(row)
    setEditFormData({
      documento: row.documento || '',
      apellido_paterno: row.apellido_paterno || '',
      apellido_materno: row.apellido_materno || '',
      nombres: row.nombres || '',
      celular: row.celular || ''
    })
    setCandidateSaveFeedback(null)
  }

  const handleSaveCandidate = async (e) => {
    if (e) e.preventDefault()
    if (!candidateToEdit || isReadOnly) return

    const newDoc = String(editFormData.documento || '').trim()
    const newApePat = String(editFormData.apellido_paterno || '').trim().toUpperCase()
    const newApeMat = String(editFormData.apellido_materno || '').trim().toUpperCase()
    const newNombres = String(editFormData.nombres || '').trim().toUpperCase()
    const newCel = String(editFormData.celular || '').trim()

    if (!newDoc) {
      alert('El DNI / Documento es obligatorio.')
      return
    }
    if (!newNombres || !newApePat) {
      alert('Los nombres y apellido paterno son obligatorios.')
      return
    }

    setIsSavingCandidate(true)
    try {
      const oldDoc = String(candidateToEdit.documento || '').trim()
      const newFullName = `${newApePat} ${newApeMat} ${newNombres}`.trim()

      // 1. Actualizar en tabla nominas (columnas existentes en nominas)
      const updatePayload = {
        documento: newDoc,
        apellido_paterno: newApePat,
        apellido_materno: newApeMat,
        nombres: newNombres,
        celular: newCel,
        updated_at: new Date().toISOString()
      }

      const { error: nomErr } = await supabase
        .from('nominas')
        .update(updatePayload)
        .eq('id', candidateToEdit.id)

      if (nomErr) throw nomErr

      // 2. Sincronizar en tabla postulantes si existe en la base de datos
      try {
        await supabase
          .from('postulantes')
          .upsert({
            documento: newDoc,
            apellido_paterno: newApePat,
            apellido_materno: newApeMat,
            nombres: newNombres,
            celular: newCel,
            updated_at: new Date().toISOString()
          })
      } catch (e) {
        console.warn('Sync postulantes error (non-blocking):', e)
      }

      // 3. Si el DNI cambió, propagar en cascada a tablas vinculadas
      if (oldDoc && oldDoc !== newDoc) {
        try {
          await supabase
            .from('asistencias_dia1_reclutador')
            .update({ postulante_documento: newDoc })
            .eq('postulante_documento', oldDoc)
        } catch (e) {
          console.warn('Sync asistencias_dia1_reclutador doc err:', e)
        }

        try {
          await supabase
            .from('consolidado_asistencias')
            .update({ documento: newDoc })
            .eq('documento', oldDoc)
        } catch (e) {
          console.warn('Sync consolidado_asistencias doc err:', e)
        }

        try {
          await supabase
            .from('descuentos')
            .update({ documento: newDoc })
            .eq('documento', oldDoc)
        } catch (e) {
          console.warn('Sync descuentos doc err:', e)
        }
      }

      // 4. Registrar en audit_logs
      const auditPayload = {
        tabla_afectada: 'nominas',
        operacion: 'UPDATE_CANDIDATO_DNI',
        id_registro: String(candidateToEdit.id),
        valores_anteriores: JSON.stringify({
          documento: oldDoc,
          apellido_paterno: candidateToEdit.apellido_paterno,
          apellido_materno: candidateToEdit.apellido_materno,
          nombres: candidateToEdit.nombres,
          celular: candidateToEdit.celular,
          grupo_codigo: grupoCodigo,
          campana: campana
        }),
        valores_nuevos: JSON.stringify({
          documento: newDoc,
          apellido_paterno: newApePat,
          apellido_materno: newApeMat,
          nombres: newNombres,
          celular: newCel,
          grupo_codigo: grupoCodigo,
          campana: campana
        }),
        usuario_email: userProfile?.email || userProfile?.usuario || userProfile?.nombre_completo || 'reclutador',
        fecha: new Date().toISOString()
      }

      try {
        await supabase.from('audit_logs').insert(auditPayload)
      } catch (e) {
        console.warn('Error registrando audit_log:', e)
      }

      // 5. Recalibrar grupo si cambió
      try {
        await checkCalibracionDia1(grupoCodigo, campana)
      } catch (e) {
        console.warn('Recalibration error:', e)
      }

      // 5. Invalidar caches
      invalidateCache('all_consolidado')
      invalidateCache('all_asistencias_bajas')
      invalidateCache('resumen_cap_')

      // 6. Optimistic update
      setData(prev => prev.map(r => r.id === candidateToEdit.id ? { ...r, ...updatePayload } : r))

      setCandidateSaveFeedback({
        type: 'success',
        message: `✅ Postulante actualizado: ${newFullName} (DNI ${newDoc}). Auditoría registrada.`
      })

      setTimeout(() => {
        setCandidateToEdit(null)
        setCandidateSaveFeedback(null)
      }, 1500)

      if (onSaveComplete) onSaveComplete()
    } catch (err) {
      console.error('Error guardando cambios del postulante:', err)
      alert('Error al guardar: ' + (err.message || err))
    } finally {
      setIsSavingCandidate(false)
    }
  }

  const duplicateDocsSet = useMemo(() => {
    const counts = new Map()
    data.forEach(r => {
      const doc = String(r.documento || '').trim()
      if (doc) {
        counts.set(doc, (counts.get(doc) || 0) + 1)
      }
    })
    const dups = new Set()
    for (const [doc, count] of counts.entries()) {
      if (count > 1) dups.add(doc)
    }
    return dups
  }, [data])

  const totalDuplicates = useMemo(() => {
    return data.filter(r => {
      const doc = String(r.documento || '').trim()
      return doc && duplicateDocsSet.has(doc)
    }).length
  }, [data, duplicateDocsSet])

  const handleDeleteRow = async () => {
    if (!rowToDelete || isReadOnly) return
    setIsDeleting(true)
    try {
      const { error: delErr } = await supabase
        .from('nominas')
        .delete()
        .eq('id', rowToDelete.id)

      if (delErr) {
        if (delErr.code === '23503') { // foreign_key_violation
          const { error: softErr } = await supabase
            .from('nominas')
            .update({ activo: false, estado: 'DESASIGNADO', updated_at: new Date().toISOString() })
            .eq('id', rowToDelete.id)
          if (softErr) throw softErr

          setDeleteFeedback({
            type: 'info',
            message: `ℹ️ Se desasignó a ${rowToDelete.nombre} de la nómina (tenía asistencias u operaciones vinculadas).`
          })
        } else {
          throw delErr
        }
      } else {
        setDeleteFeedback({
          type: 'success',
          message: `🗑️ ${rowToDelete.nombre} (DNI ${rowToDelete.documento}) ha sido eliminado de la nómina.`
        })
      }

      // Optimistic update
      setData(prev => prev.filter(r => r.id !== rowToDelete.id))
      setRowToDelete(null)
      
      // Invalidate cache across all dashboards
      invalidateCache('all_consolidado')
      invalidateCache('all_asistencias_bajas')
      invalidateCache('resumen_cap_')
      invalidateCache('grupos_con_metas')

      if (onSaveComplete) onSaveComplete()
      setTimeout(() => setDeleteFeedback(null), 5000)
    } catch (err) {
      console.error('Error eliminando postulante de nomina:', err)
      alert('Error al eliminar: ' + err.message)
    } finally {
      setIsDeleting(false)
    }
  }

  const visibleColumns = useMemo(() => {
    if (isCapacitacionRole) {
      if (columnTab === 'DOCUMENTOS') return POSTULANTE_COLUMNS
      if (columnTab === 'TODO') return [...POSTULANTE_COLUMNS, ...OPERACION_COLUMNS]
    }
    if (columnTab === 'POSTULANTE') return POSTULANTE_COLUMNS
    if (columnTab === 'OPERATIVO') return OPERACION_COLUMNS
    if (columnTab === 'DOCUMENTOS') return DOCUMENTOS_COLUMNS
    return ALL_EDITABLE_COLUMNS
  }, [columnTab, isCapacitacionRole])

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
      if (onlyDuplicatesFilter) {
        const doc = String(row.documento || '').trim()
        if (!doc || !duplicateDocsSet.has(doc)) return false
      }
      if (onlyIncompleteDocsFilter) {
        const isComplete = (row.status_final || '').toUpperCase() === 'COMPLETO' || (
          (row.doc_cv || '').toUpperCase() === 'OK' &&
          (row.doc_dni_adjunto || '').toUpperCase() === 'OK' &&
          (row.doc_certijoven || '').toUpperCase() === 'OK' &&
          (row.doc_recibo_servicios || '').toUpperCase() === 'OK' &&
          (row.doc_ficha_datos || '').toUpperCase() === 'OK' &&
          (row.doc_autorizacion || '').toUpperCase() === 'OK'
        )
        if (isComplete) return false
      }
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
  }, [data, filters, onlyDuplicatesFilter, duplicateDocsSet])

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
        .eq('activo', true)
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
          query = query.or(`semana_trabajo.eq.${semanaNum},semana_trabajo.is.null`)
        }
      }

      if (campana) {
        query = query.ilike('campana', `%${String(campana).trim()}%`)
      }

      const { data: rows, error: err } = await query

      if (err) throw err
      
      let finalRows = rows || []

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
    if (isReadOnly || key === 'reclutador') return
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
    if (isReadOnly || !selectedColumn || selectedColumn === 'reclutador' || filteredData.length < 2) return
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

  // Handle 1-click mark all 6 documents + status_final OK for a single candidate
  const handleMarkAllDocsOk = async (rowId) => {
    if (isReadOnly) return
    const docsUpdate = {
      doc_cv: 'OK',
      doc_dni_adjunto: 'OK',
      doc_certijoven: 'OK',
      doc_recibo_servicios: 'OK',
      doc_ficha_datos: 'OK',
      doc_autorizacion: 'OK',
      status_final: 'COMPLETO'
    }

    setData(prev => prev.map(r => r.id === rowId ? { ...r, ...docsUpdate } : r))
    setSavingStatus('saving')

    try {
      const { error: err } = await supabase
        .from('nominas')
        .update(docsUpdate)
        .eq('id', rowId)

      if (err) throw err
      setSavingStatus('saved')
      setTimeout(() => setSavingStatus('idle'), 2000)
      onSaveComplete?.()
    } catch (err) {
      console.error('Error al validar documentos:', err)
      setSavingStatus('error')
    }
  }

  // Handle bulk mark all 6 documents OK for all currently filtered candidates
  const handleBulkMarkAllFilteredDocsOk = async () => {
    if (isReadOnly || filteredData.length === 0) return
    if (!window.confirm(`¿Deseas marcar todos los documentos como 'OK' para los ${filteredData.length} postulantes en la vista actual?`)) return

    const docsUpdate = {
      doc_cv: 'OK',
      doc_dni_adjunto: 'OK',
      doc_certijoven: 'OK',
      doc_recibo_servicios: 'OK',
      doc_ficha_datos: 'OK',
      doc_autorizacion: 'OK',
      status_final: 'COMPLETO'
    }

    const targetIds = filteredData.map(f => f.id)
    setData(prev => prev.map(r => targetIds.includes(r.id) ? { ...r, ...docsUpdate } : r))
    setSavingStatus('saving')

    try {
      const { error: bulkErr } = await supabase
        .from('nominas')
        .update(docsUpdate)
        .in('id', targetIds)

      if (bulkErr) throw bulkErr
      setSavingStatus('saved')
      setTimeout(() => setSavingStatus('idle'), 2000)
      onSaveComplete?.()
    } catch (err) {
      console.error('Error masivo al validar documentos:', err)
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

  // Recalcular KPIs sobre la vista filtrada dinámicamente
  const kpisFiltered = useMemo(() => {
    const total = filteredData.length
    const asistieronD0 = filteredData.filter(d => (d.dia_0 || '').toUpperCase() === 'ASISTIO').length
    const asistieronD1 = filteredData.filter(d => (d.dia_1 || '').toUpperCase() === 'ASISTIO').length
    const docsOk = filteredData.filter(d => {
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
  }, [filteredData])

  const activeColumnFiltersCount = useMemo(() => {
    let count = 0
    for (const k in filters) {
      if (filters[k] && filters[k].length > 0) count++
    }
    if (onlyIncompleteDocsFilter) count++
    if (onlyDuplicatesFilter) count++
    return count
  }, [filters, onlyIncompleteDocsFilter, onlyDuplicatesFilter])

  const handleClearAllFilters = () => {
    setFilters({})
    setOnlyIncompleteDocsFilter(false)
    setOnlyDuplicatesFilter(false)
  }

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

  // ── WhatsApp Summary Generator Logic ────────────────────────────
  const cleanGrupoCode = String(grupoCodigo || '').startsWith('PROY-') 
    ? String(grupoCodigo) 
    : String(grupoCodigo || '').replace(/_\d+$/, '')

  const totalNomina = data.length
  const asistieronVal = whatsappDia === 'DIA_0' ? kpis.asistieronD0 : kpis.asistieronD1
  const faltasVal = Math.max(0, totalNomina - asistieronVal)
  const diaLabel = whatsappDia === 'DIA_0' ? 'DÍA 0' : 'DIA 1'

  const generatedWhatsappText = useMemo(() => {
    const rqVal = whatsappRq ? whatsappRq.trim() : (data[0]?.rq || '—')
    const asisArray = [
      `📍 ${diaLabel}`,
      `✅ CAMPAÑA: ${(campana || data[0]?.campana || 'CAMPAÑA').toUpperCase()}`,
      `✅ ${cleanGrupoCode}`,
      `✅ RQ: ${rqVal}`,
      ``,
      `• PERSONAS EN NOMINA: ${totalNomina} (${cleanGrupoCode})`,
      `• PERSONAS EN ASISTENCIA INICIAL: ${asistieronVal}`,
      `• ASISTENCIA FINAL : ${whatsappAsistenciaFinal ? whatsappAsistenciaFinal.trim() : '-'}`,
      `• FALTAS: ${faltasVal}`,
      ``,
      whatsappMenciones ? whatsappMenciones.trim() : '',
      whatsappNota ? whatsappNota.trim() : ''
    ]
    return asisArray.filter(l => l !== null && l !== undefined).join('\n')
  }, [diaLabel, campana, cleanGrupoCode, whatsappRq, data, totalNomina, asistieronVal, whatsappAsistenciaFinal, faltasVal, whatsappMenciones, whatsappNota])

  const handleCopyWhatsapp = async () => {
    try {
      await navigator.clipboard.writeText(generatedWhatsappText)
      localStorage.setItem('gea_wa_menciones', whatsappMenciones)
      localStorage.setItem('gea_wa_nota', whatsappNota)
      setCopiedFeedback(true)
      setTimeout(() => setCopiedFeedback(false), 2500)
    } catch (err) {
      console.error('Clipboard copy error:', err)
      alert('No se pudo copiar automáticamente al portapapeles.')
    }
  }

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
            <div className="text-[10px] font-extrabold uppercase tracking-wider text-[var(--text-muted)] flex items-center gap-1">
              Total Postulantes
              {filteredData.length < data.length && (
                <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-cyan-500/20 text-cyan-400 font-bold">Filtrados</span>
              )}
            </div>
            <div className="text-xl sm:text-2xl font-black text-cyan-400 leading-none mt-1 flex items-baseline gap-1" style={{ fontFamily: 'Space Grotesk, Inter, sans-serif' }}>
              {filteredData.length}
              {filteredData.length < data.length && (
                <span className="text-xs font-bold text-[var(--text-muted)]">/ {kpis.total}</span>
              )}
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
            <div className="text-xl sm:text-2xl font-black text-emerald-400 leading-none mt-1 flex items-baseline gap-1" style={{ fontFamily: 'Space Grotesk, Inter, sans-serif' }}>
              {kpisFiltered.asistieronD0}
              <span className="text-xs font-bold text-[var(--text-muted)]">
                ({kpisFiltered.pctD0}%)
                {filteredData.length < data.length && ` / ${kpis.asistieronD0}`}
              </span>
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
            <div className="text-xl sm:text-2xl font-black text-purple-400 leading-none mt-1 flex items-baseline gap-1" style={{ fontFamily: 'Space Grotesk, Inter, sans-serif' }}>
              {kpisFiltered.asistieronD1}
              <span className="text-xs font-bold text-[var(--text-muted)]">
                ({kpisFiltered.pctD1}%)
                {filteredData.length < data.length && ` / ${kpis.asistieronD1}`}
              </span>
            </div>
          </div>
          <div className="p-2 rounded-lg bg-purple-500/10 text-purple-400">
            <ShieldCheck size={18} />
          </div>
        </div>

        {/* Documentación OK (Oculto para Supervisores de Capacitación) */}
        {!isCapacitacionRole && (
          <div className="p-2.5 sm:p-3 rounded-xl bg-[var(--bg-surface)] border border-orange-500/20 shadow-[0_0_12px_rgba(255,122,0,0.08)] flex items-center justify-between">
            <div>
              <div className="text-[10px] font-extrabold uppercase tracking-wider text-[var(--text-muted)]">Documentos OK</div>
              <div className="text-xl sm:text-2xl font-black text-orange-400 leading-none mt-1 flex items-baseline gap-1" style={{ fontFamily: 'Space Grotesk, Inter, sans-serif' }}>
                {kpisFiltered.docsOk}
                <span className="text-xs font-bold text-[var(--text-muted)]">
                  ({kpisFiltered.pctDocs}%)
                  {filteredData.length < data.length && ` / ${kpis.docsOk}`}
                </span>
              </div>
            </div>
            <div className="p-2 rounded-lg bg-orange-500/10 text-orange-400">
              <FileCheck size={18} />
            </div>
          </div>
        )}
      </div>

      {/* ── TOOLBAR: Grupo Info, Replicar, Estado Guardado ── */}
      <div className="p-3 sm:p-4 border-b border-[var(--border-subtle)] flex flex-wrap justify-between items-center gap-3 bg-[var(--bg-surface)]">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-extrabold text-[var(--text-primary)] text-base">
              {isReadOnly ? 'Consulta de Nómina' : 'Edición de Nómina'}
            </h3>
            <span className="font-mono text-xs font-black px-2 py-0.5 rounded-md bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
              {grupoCodigo}
            </span>
            {isReadOnly && (
              <span className="px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                <Eye size={12} /> Solo Lectura (Capacitación)
              </span>
            )}
          </div>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            {[periodo, semana ? (semana.toUpperCase().startsWith('SEM') ? semana : `Sem ${semana}`) : '', segmento, campana].filter(Boolean).join(' · ')}
            {([periodo, semana, segmento, campana].some(Boolean) ? ' · ' : '')}
            {filteredData.length < data.length ? (
              <strong className="text-cyan-400">{filteredData.length} de {data.length} candidatos visibles</strong>
            ) : (
              `${data.length} candidatos cargados`
            )}
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
          {!isCapacitacionRole && (
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
          )}
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
          {/* Botón Resumen WhatsApp */}
          <button
            type="button"
            onClick={() => setShowWhatsappModal(true)}
            className="text-xs px-3 py-1.5 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 font-black rounded-lg border border-emerald-500/40 transition-all flex items-center gap-1.5 cursor-pointer shadow-xs active:scale-95"
            title="Generar y copiar resumen de asistencia para WhatsApp con 1 clic"
          >
            <MessageSquare size={14} className="text-emerald-400" />
            <span>📲 Resumen WhatsApp</span>
          </button>

          {/* Botón Validar Todos OK cuando está en pestaña Documentos */}
          {!isReadOnly && columnTab === 'DOCUMENTOS' && (
            <button
              type="button"
              onClick={handleBulkMarkAllFilteredDocsOk}
              disabled={filteredData.length === 0 || savingStatus === 'saving'}
              className="text-xs px-3 py-1.5 bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 font-black rounded-lg border border-amber-500/40 transition-all flex items-center gap-1.5 cursor-pointer active:scale-95 shadow-xs disabled:opacity-40"
              title="Marcar todos los 6 documentos como OK para los postulantes filtrados"
            >
              <CheckCheck size={14} className="text-amber-400" />
              <span>⚡ Validar Todos OK ({filteredData.length})</span>
            </button>
          )}

          {/* Toggle Solo Incompletos */}
          {!isCapacitacionRole && kpis.total > 0 && kpis.docsOk < kpis.total && (
            <button
              type="button"
              onClick={() => setOnlyIncompleteDocsFilter(prev => !prev)}
              className={`text-xs px-2.5 py-1.5 rounded-lg font-bold border transition-all flex items-center gap-1.5 cursor-pointer shadow-xs ${
                onlyIncompleteDocsFilter
                  ? 'bg-amber-500 text-black border-amber-400 font-black'
                  : 'bg-amber-500/10 text-amber-300 border-amber-500/30 hover:bg-amber-500/20'
              }`}
              title="Filtrar solo postulantes con documentos pendientes"
            >
              <FileWarning size={13} />
              <span>{onlyIncompleteDocsFilter ? 'Ver Todos' : `Solo Incompletos (${data.length - kpis.docsOk})`}</span>
            </button>
          )}

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

          {!isReadOnly && (
            <button 
              onClick={handleBulkUpdate}
              disabled={data.length < 2 || savingStatus === 'saving' || !selectedColumn || selectedColumn === 'reclutador'}
              className="text-xs px-3 py-1.5 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 font-bold rounded-lg border border-cyan-500/30 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
            >
              <CheckCircle2 size={14} /> 
              {selectedColumn 
                ? (selectedColumn === 'reclutador' ? 'Reclutador no replicable' : `Replicar "${ALL_EDITABLE_COLUMNS.find(c => c.key === selectedColumn)?.label}" a todos`) 
                : 'Selecciona columna para replicar'}
            </button>
          )}

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

      {/* ── BARRA DINÁMICA DE CONTEO EN VIVO Y FILTROS ACTIVOS ── */}
      <div className="px-4 py-2.5 bg-[var(--bg-elevated)]/60 border-b border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-2.5 text-xs">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          {filteredData.length === data.length ? (
            <span className="font-bold text-[var(--text-secondary)] flex items-center gap-1.5">
              <Users size={14} className="text-cyan-400" />
              <span>Nómina completa: <strong className="text-[var(--text-primary)]">{data.length}</strong> postulantes</span>
            </span>
          ) : (
            <span className="font-black px-2.5 py-1 rounded-lg bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 flex items-center gap-1.5 shadow-2xs">
              <Filter size={13} />
              Mostrando {filteredData.length} de {data.length} postulantes ({data.length - filteredData.length} ocultos por filtros)
            </span>
          )}

          {/* Chips de filtros activos por columna */}
          {Object.entries(filters).map(([k, vals]) => {
            if (!vals || vals.length === 0) return null
            const colDef = ALL_EDITABLE_COLUMNS.find(c => c.key === k) || { label: k }
            return (
              <span
                key={k}
                className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 text-[11px] font-bold animate-in fade-in"
              >
                <span>{colDef.label}: <strong className="text-indigo-200">{vals.join(', ')}</strong></span>
                <button
                  type="button"
                  onClick={() => handleFilterChange(k, [])}
                  className="hover:text-rose-400 transition-colors cursor-pointer"
                  title="Quitar este filtro"
                >
                  <X size={12} />
                </button>
              </span>
            )
          })}

          {onlyIncompleteDocsFilter && (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-300 border border-amber-500/30 text-[11px] font-bold animate-in fade-in">
              <span>Filtro: Incompletos ({filteredData.length})</span>
              <button
                type="button"
                onClick={() => setOnlyIncompleteDocsFilter(false)}
                className="hover:text-rose-400 transition-colors cursor-pointer"
                title="Quitar filtro de incompletos"
              >
                <X size={12} />
              </button>
            </span>
          )}

          {onlyDuplicatesFilter && (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-rose-500/15 text-rose-300 border border-rose-500/30 text-[11px] font-bold animate-in fade-in">
              <span>Filtro: Duplicados ({filteredData.length})</span>
              <button
                type="button"
                onClick={() => setOnlyDuplicatesFilter(false)}
                className="hover:text-rose-400 transition-colors cursor-pointer"
                title="Quitar filtro de duplicados"
              >
                <X size={12} />
              </button>
            </span>
          )}
        </div>

        {/* Botón Limpiar Todos los Filtros */}
        {activeColumnFiltersCount > 0 && (
          <button
            type="button"
            onClick={handleClearAllFilters}
            className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 transition-all flex items-center gap-1 cursor-pointer active:scale-95 ml-auto"
            title="Quitar todos los filtros y ver la nómina completa"
          >
            <X size={13} /> Limpiar Filtros ({activeColumnFiltersCount})
          </button>
        )}
      </div>

      {/* Duplicate Filter Alert Banner */}
      {totalDuplicates > 0 && (
        <div className="p-3 mx-4 mt-3 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between text-xs text-amber-200">
          <div className="flex items-center gap-2">
            <AlertTriangle size={15} className="text-amber-400 shrink-0" />
            <span>
              Se detectaron <strong>{duplicateDocsSet.size} DNI(s) repetidos</strong> ({totalDuplicates} filas en total) en esta nómina.
            </span>
          </div>
          <button
            type="button"
            onClick={() => setOnlyDuplicatesFilter(prev => !prev)}
            className={`px-3 py-1 rounded-lg font-bold border transition-all cursor-pointer ${
              onlyDuplicatesFilter
                ? 'bg-amber-500 text-black border-amber-400 shadow-xs'
                : 'bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500/30'
            }`}
          >
            {onlyDuplicatesFilter ? 'Ver Todos los Postulantes' : `Filtrar solo Repetidos (${totalDuplicates})`}
          </button>
        </div>
      )}

      {/* Delete Feedback Toast */}
      {deleteFeedback && (
        <div className={`p-3 mx-4 mt-3 rounded-xl text-xs font-bold border animate-in fade-in duration-200 ${
          deleteFeedback.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-cyan-500/10 border-cyan-500/30 text-cyan-300'
        }`}>
          {deleteFeedback.message}
        </div>
      )}

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
                    <span>CANDIDATO {isReadOnly ? '(Solo Lectura)' : ''}</span>
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
                        className={`transition-colors flex-1 truncate flex items-center gap-1 ${!isReadOnly && col.key !== 'reclutador' ? 'cursor-pointer hover:text-cyan-400' : ''}`}
                        onClick={() => !isReadOnly && col.key !== 'reclutador' && setSelectedColumn(col.key)}
                        title={col.key === 'reclutador' ? "Columna bloqueada (no editable)" : (!isReadOnly ? "Haz clic para seleccionar y replicar esta columna" : "")}
                      >
                        {col.key === 'reclutador' && <Lock size={10} className="text-amber-400 shrink-0" />}
                        <span className="truncate">{col.label}</span>
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
              {filteredData.map(row => {
                const docClean = String(row.documento || '').trim()
                const isDuplicate = docClean && duplicateDocsSet.has(docClean)
                const fullName = [row.apellido_paterno, row.apellido_materno, row.nombres].filter(Boolean).join(' ') || row.nombre_completo || 'SIN NOMBRE'

                return (
                  <tr 
                    key={row.id} 
                    className={`transition-colors ${
                      isDuplicate 
                        ? 'bg-amber-500/5 hover:bg-amber-500/10 border-l-2 border-l-amber-400' 
                        : 'hover:bg-[var(--bg-muted)]'
                    }`}
                  >
                    <td className={`p-2.5 border-r border-[var(--border-subtle)] sticky left-0 z-10 shadow-sm flex flex-col justify-center ${
                      isDuplicate ? 'bg-[var(--bg-surface)]' : 'bg-[var(--bg-surface)]'
                    }`}>
                      <div className="flex items-center justify-between gap-1.5">
                        <span className="font-bold text-[var(--text-primary)] uppercase truncate max-w-[200px]" title={fullName}>
                          {fullName}
                        </span>
                        {!isReadOnly && (
                          <button
                            type="button"
                            onClick={() => handleOpenEditCandidate(row)}
                            title={`Editar datos principales de ${fullName} (DNI, nombres)`}
                            className="p-1 rounded-md text-cyan-600 dark:text-cyan-400 hover:bg-cyan-500/15 transition-all cursor-pointer shrink-0"
                          >
                            <Pencil size={12} />
                          </button>
                        )}
                      </div>
                      <div className="flex items-center justify-between gap-2 mt-0.5">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[10px] text-[var(--text-muted)] font-mono font-bold">{row.documento}</span>
                          {isDuplicate && (
                            <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 uppercase tracking-wider">
                              Repetido
                            </span>
                          )}
                          {!isReadOnly && (columnTab === 'DOCUMENTOS' || columnTab === 'TODO') && (
                            <button
                              type="button"
                              onClick={() => handleMarkAllDocsOk(row.id)}
                              title={`Validar todos los 6 documentos de ${fullName} como OK`}
                              className="text-[9.5px] px-1.5 py-0.5 rounded font-black bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/25 transition-all flex items-center gap-0.5 cursor-pointer shadow-2xs"
                            >
                              <Sparkles size={10} /> Todo OK
                            </button>
                          )}
                        </div>
                        {!isReadOnly && (
                          <button
                            type="button"
                            onClick={() => setRowToDelete({
                              id: row.id,
                              nombre: fullName,
                              documento: row.documento
                            })}
                            title={`Eliminar a ${fullName} de esta nómina`}
                            className={`p-1 rounded-md transition-all cursor-pointer ${
                              isDuplicate
                                ? 'text-red-400 hover:text-red-300 hover:bg-red-500/20 opacity-100'
                                : 'text-[var(--text-muted)] hover:text-red-400 hover:bg-red-500/15 opacity-30 hover:opacity-100'
                            }`}
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </td>
                    {visibleColumns.map(col => {
                      const val = row[col.key] || '';
                      let badgeClass = 'text-[var(--text-primary)]';
                      if (val === 'OK' || val === 'COMPLETO' || val === 'APROBADO' || val === 'APTO' || val === 'ASISTIO') {
                        badgeClass = 'bg-emerald-500/10 text-emerald-400 font-bold';
                      } else if (val === 'PENDIENTE' || val === 'FALTA' || val === 'DESAPROBADO' || val === 'CESE' || val === 'OBSERVADO') {
                        badgeClass = 'bg-red-500/10 text-red-400 font-bold';
                      } else if (val === 'DESISTE' || val === 'NO PROCEDE') {
                        badgeClass = 'bg-amber-500/10 text-amber-400 font-bold';
                      }

                      return (
                        <td key={col.key} className={`p-0 border-r border-[var(--border-subtle)] ${badgeClass}`}>
                          {col.key === 'reclutador' ? (
                            <div 
                              className="w-full h-full p-2 text-xs font-bold select-none truncate flex items-center gap-1.5 text-[var(--text-secondary)] bg-[var(--bg-elevated)]/30"
                              title={`Reclutador asignado: ${val || 'Sin asignar'} (Bloqueado)`}
                            >
                              <Lock size={11} className="text-amber-400/80 shrink-0" />
                              <span className="truncate">{val || '—'}</span>
                            </div>
                          ) : isReadOnly ? (
                            <div className="w-full h-full p-2 text-xs font-semibold select-none truncate flex items-center">
                              {val || '—'}
                            </div>
                          ) : col.type === 'select' ? (
                            <select
                              value={val}
                              onChange={e => handleCellChange(row.id, col.key, e.target.value, false)}
                              onBlur={e => handleCellChange(row.id, col.key, e.target.value, true)}
                              onFocus={() => setSelectedColumn(col.key)}
                              className="w-full h-full p-2 bg-transparent text-xs font-semibold outline-none focus:ring-1 focus:ring-cyan-400 transition-colors"
                            >
                              <option value="" className="bg-[var(--bg-surface)] text-[var(--text-muted)]">--</option>
                              {(col.options || []).map(opt => (
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
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ── MODAL EDITAR CANDIDATO (DNI / NOMBRES) CON AUDITORÍA ── */}
      {candidateToEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-lg rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-normal)] shadow-2xl overflow-hidden animate-slideUp">
            <div className="p-4 border-b border-[var(--border-subtle)] flex items-center justify-between bg-[var(--bg-elevated)]">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 border border-cyan-500/30">
                  <Pencil size={16} />
                </div>
                <div>
                  <h3 className="text-sm font-black text-[var(--text-primary)] uppercase tracking-wider">
                    Editar Datos Principales
                  </h3>
                  <p className="text-[11px] text-[var(--text-muted)] font-medium">
                    Corrección de DNI, nombres y contacto con registro de auditoría
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCandidateToEdit(null)}
                className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-rose-500 hover:bg-rose-500/10 transition-colors cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveCandidate} className="p-5 space-y-4">
              {candidateSaveFeedback && (
                <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-xs font-bold animate-fadeIn">
                  {candidateSaveFeedback.message}
                </div>
              )}

              <div className="space-y-3">
                {/* DNI */}
                <div>
                  <label className="block text-[10px] font-extrabold uppercase tracking-wider text-[var(--text-muted)] mb-1">
                    DNI / Documento de Identidad <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={editFormData.documento}
                    onChange={e => setEditFormData(prev => ({ ...prev, documento: e.target.value }))}
                    placeholder="Ej. 74589632"
                    className="w-full px-3 py-2 text-xs font-mono font-bold rounded-xl bg-[var(--input-bg)] border border-[var(--input-border)] focus:border-cyan-400 text-[var(--text-primary)] outline-none transition-all"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {/* Apellido Paterno */}
                  <div>
                    <label className="block text-[10px] font-extrabold uppercase tracking-wider text-[var(--text-muted)] mb-1">
                      Apellido Paterno <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={editFormData.apellido_paterno}
                      onChange={e => setEditFormData(prev => ({ ...prev, apellido_paterno: e.target.value }))}
                      className="w-full px-3 py-2 text-xs font-bold uppercase rounded-xl bg-[var(--input-bg)] border border-[var(--input-border)] focus:border-cyan-400 text-[var(--text-primary)] outline-none transition-all"
                    />
                  </div>

                  {/* Apellido Materno */}
                  <div>
                    <label className="block text-[10px] font-extrabold uppercase tracking-wider text-[var(--text-muted)] mb-1">
                      Apellido Materno
                    </label>
                    <input
                      type="text"
                      value={editFormData.apellido_materno}
                      onChange={e => setEditFormData(prev => ({ ...prev, apellido_materno: e.target.value }))}
                      className="w-full px-3 py-2 text-xs font-bold uppercase rounded-xl bg-[var(--input-bg)] border border-[var(--input-border)] focus:border-cyan-400 text-[var(--text-primary)] outline-none transition-all"
                    />
                  </div>
                </div>

                {/* Nombres */}
                <div>
                  <label className="block text-[10px] font-extrabold uppercase tracking-wider text-[var(--text-muted)] mb-1">
                    Nombres Completos <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={editFormData.nombres}
                    onChange={e => setEditFormData(prev => ({ ...prev, nombres: e.target.value }))}
                    className="w-full px-3 py-2 text-xs font-bold uppercase rounded-xl bg-[var(--input-bg)] border border-[var(--input-border)] focus:border-cyan-400 text-[var(--text-primary)] outline-none transition-all"
                  />
                </div>

                {/* Celular */}
                <div>
                  <label className="block text-[10px] font-extrabold uppercase tracking-wider text-[var(--text-muted)] mb-1">
                    Teléfono / Celular
                  </label>
                  <input
                    type="text"
                    value={editFormData.celular}
                    onChange={e => setEditFormData(prev => ({ ...prev, celular: e.target.value }))}
                    placeholder="Ej. 987654321"
                    className="w-full px-3 py-2 text-xs font-bold rounded-xl bg-[var(--input-bg)] border border-[var(--input-border)] focus:border-cyan-400 text-[var(--text-primary)] outline-none transition-all"
                  />
                </div>
              </div>

              <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-[11px] text-blue-300 font-medium">
                ℹ️ Al guardar, se registrará una entrada en la bitácora de auditoría (audit_logs) y se actualizará en cascada la asistencia del postulante.
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-[var(--border-subtle)]">
                <button
                  type="button"
                  onClick={() => setCandidateToEdit(null)}
                  disabled={isSavingCandidate}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] border border-[var(--border-normal)] transition-all cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingCandidate}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-cyan-500 hover:bg-cyan-400 text-black transition-all flex items-center gap-1.5 shadow-md shadow-cyan-500/20 cursor-pointer disabled:opacity-50"
                >
                  {isSavingCandidate ? (
                    <>
                      <Loader2 size={13} className="animate-spin" /> Guardando...
                    </>
                  ) : (
                    <>
                      <Save size={13} /> Guardar Cambios
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL CONFIRMACIÓN DE ELIMINACIÓN ── */}
      {rowToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-[var(--bg-elevated)] border border-[var(--border-subtle)] w-full max-w-sm rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="space-y-1.5">
              <h3 className="text-base font-bold text-[var(--text-primary)]">
                Eliminar de la nómina
              </h3>
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                ¿Eliminar a <strong className="text-[var(--text-primary)]">{rowToDelete.nombre}</strong> (DNI <span className="font-mono text-cyan-400 font-bold">{rowToDelete.documento}</span>)? Esta acción no se puede deshacer.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setRowToDelete(null)}
                className="px-4 py-2 text-xs font-bold rounded-xl bg-[var(--bg-muted)] hover:bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-subtle)] transition-all cursor-pointer disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleDeleteRow}
                className="px-4 py-2 text-xs font-bold rounded-xl bg-red-600 hover:bg-red-500 text-white shadow-md shadow-red-600/30 transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
              >
                {isDeleting ? (
                  <>
                    <Loader2 size={13} className="animate-spin" />
                    Eliminando...
                  </>
                ) : (
                  'Eliminar'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL GENERADOR DE RESUMEN WHATSAPP (1-CLIC) ── */}
      {showWhatsappModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4 animate-in fade-in duration-200">
          <div className="bg-[var(--bg-elevated)] border border-[var(--border-subtle)] w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="px-5 py-4 border-b border-[var(--border-subtle)] flex items-center justify-between bg-gradient-to-r from-emerald-500/10 via-transparent to-transparent">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30 shrink-0">
                  <MessageSquare size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-black text-[var(--text-primary)] flex items-center gap-1.5">
                    Resumen Rápido para WhatsApp
                  </h3>
                  <p className="text-[11px] text-[var(--text-muted)]">
                    Genera el formato oficial de asistencia para grupos de WhatsApp
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowWhatsappModal(false)}
                className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)] transition-all cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Body */}
            <div className="p-5 space-y-4 overflow-y-auto">
              {/* Selector de Día */}
              <div>
                <label className="block text-[10px] font-extrabold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">
                  Seleccionar Tipo de Reporte
                </label>
                <div className="grid grid-cols-2 gap-2 bg-[var(--bg-surface)] p-1 rounded-xl border border-[var(--border-subtle)]">
                  <button
                    type="button"
                    onClick={() => setWhatsappDia('DIA_0')}
                    className={`py-2 text-xs font-black rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                      whatsappDia === 'DIA_0'
                        ? 'bg-emerald-500 text-black shadow-xs'
                        : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    📍 DÍA 0 ({kpis.asistieronD0} Asistieron)
                  </button>
                  <button
                    type="button"
                    onClick={() => setWhatsappDia('DIA_1')}
                    className={`py-2 text-xs font-black rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                      whatsappDia === 'DIA_1'
                        ? 'bg-emerald-500 text-black shadow-xs'
                        : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    📍 DÍA 1 ({kpis.asistieronD1} Asistieron)
                  </button>
                </div>
              </div>

              {/* Grid Parámetros Operativos */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-extrabold uppercase tracking-wider text-[var(--text-muted)] mb-1">
                    Meta RQ (Requerimiento)
                  </label>
                  <input
                    type="text"
                    value={whatsappRq}
                    onChange={e => setWhatsappRq(e.target.value)}
                    placeholder="Ej. 8 ó 12"
                    className="w-full px-3 py-2 text-xs font-bold rounded-xl bg-[var(--input-bg)] border border-[var(--input-border)] focus:border-emerald-400 text-[var(--text-primary)] outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-extrabold uppercase tracking-wider text-[var(--text-muted)] mb-1">
                    Asistencia Final (Opcional)
                  </label>
                  <input
                    type="text"
                    value={whatsappAsistenciaFinal}
                    onChange={e => setWhatsappAsistenciaFinal(e.target.value)}
                    placeholder="Ej. 8 ó -"
                    className="w-full px-3 py-2 text-xs font-bold rounded-xl bg-[var(--input-bg)] border border-[var(--input-border)] focus:border-emerald-400 text-[var(--text-primary)] outline-none transition-all"
                  />
                </div>
              </div>

              {/* Menciones y Nota */}
              <div className="space-y-3">
                <div>
                  <label className="block text-[10px] font-extrabold uppercase tracking-wider text-[var(--text-muted)] mb-1">
                    Menciones / Supervisores (@)
                  </label>
                  <input
                    type="text"
                    value={whatsappMenciones}
                    onChange={e => setWhatsappMenciones(e.target.value)}
                    placeholder="Ej. @Tania @Cristina @Nicole"
                    className="w-full px-3 py-2 text-xs font-bold rounded-xl bg-[var(--input-bg)] border border-[var(--input-border)] focus:border-emerald-400 text-[var(--text-primary)] outline-none transition-all"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-extrabold uppercase tracking-wider text-[var(--text-muted)] mb-1">
                    Nota o Mensaje Operativo Adicional
                  </label>
                  <input
                    type="text"
                    value={whatsappNota}
                    onChange={e => setWhatsappNota(e.target.value)}
                    placeholder="Ej. Se procede a llamar a las faltas y agregados"
                    className="w-full px-3 py-2 text-xs font-semibold rounded-xl bg-[var(--input-bg)] border border-[var(--input-border)] focus:border-emerald-400 text-[var(--text-primary)] outline-none transition-all"
                  />
                </div>
              </div>

              {/* Vista Previa Estilo Burbuja WhatsApp */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[10px] font-extrabold uppercase tracking-wider text-[var(--text-muted)]">
                    Vista Previa (Formato WhatsApp)
                  </label>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                    Idéntico al Chat Oficial
                  </span>
                </div>
                <div className="p-3.5 rounded-xl bg-[#0b141a] border border-[#202c33] font-mono text-xs text-[#e9edef] whitespace-pre-wrap leading-relaxed shadow-inner select-all relative">
                  {generatedWhatsappText}
                </div>
              </div>
            </div>

            {/* Footer con Botón Copiar */}
            <div className="p-4 border-t border-[var(--border-subtle)] bg-[var(--bg-surface)] flex items-center justify-between gap-3">
              <div className="text-xs text-[var(--text-muted)] font-medium">
                {copiedFeedback ? (
                  <span className="text-emerald-400 font-bold flex items-center gap-1 animate-fadeIn">
                    <Check size={14} /> ¡Copiado al portapapeles!
                  </span>
                ) : (
                  <span>Listo para pegar en WhatsApp.</span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowWhatsappModal(false)}
                  className="px-3.5 py-2 text-xs font-bold rounded-xl text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] border border-[var(--border-normal)] transition-all cursor-pointer"
                >
                  Cerrar
                </button>
                <button
                  type="button"
                  onClick={handleCopyWhatsapp}
                  className={`px-4 py-2 text-xs font-black rounded-xl transition-all flex items-center gap-2 cursor-pointer shadow-md active:scale-95 ${
                    copiedFeedback
                      ? 'bg-emerald-400 text-black shadow-emerald-500/30'
                      : 'bg-emerald-500 hover:bg-emerald-400 text-black shadow-emerald-500/20'
                  }`}
                >
                  {copiedFeedback ? (
                    <>
                      <Check size={15} /> Copiado con Éxito
                    </>
                  ) : (
                    <>
                      <Copy size={15} /> Copiar Resumen (1 Clic)
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
