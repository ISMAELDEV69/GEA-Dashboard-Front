import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import * as XLSX from 'xlsx'
import {
  UserCheck, AlertCircle, CheckCircle2,
  Award, Sparkles, TrendingUp, Flame, Check, User, Phone, Briefcase,
  UploadCloud, FileSpreadsheet, RefreshCw, UserPlus, FileText, ClipboardPaste, Lock
} from 'lucide-react'
import { ensureReclutador, ensureSede, ensureCampana } from '../lib/dataService'
import { findGrupoPlan, grupoToNominaDefaults } from '../lib/capacidadRysSync'
import {
  NOMINA_FORM_GROUPS, STEP_LABELS, STEP_FIELDS, REQUIRED_NOMINA_FIELDS,
  parseNominaRows, applyNominaPayloadToForm, parseMoney,
} from '../lib/nominaConsolidadoSchema'
import PageLayout from './ui/PageLayout'
import PageHeader from './ui/PageHeader'
import Card from './ui/Card'
import NominaFieldGrid from './nomina/NominaFieldGrid'
import NominaFormPool from './nomina/NominaFormPool.jsx'
import NominaGridEditor from './nomina/NominaGridEditor.jsx'

function CatalogField({ label, name, value, onChange, onBlur, errors, options = [], placeholder, hint, onQuickAdd, adding }) {
  return (
    <div>
      <label className="form-label">{label}</label>
      <div className="flex gap-2">
        <input
          list={`${name}-catalog`}
          name={name}
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          onBlur={(e) => onBlur?.(e.target.value.trim().toUpperCase())}
          placeholder={placeholder}
          className="form-input flex-1"
          autoComplete="off"
        />
        {onQuickAdd && (
          <button
            type="button"
            onClick={onQuickAdd}
            disabled={adding}
            title="Guardar en catálogo"
            className="flex-shrink-0 px-3 py-2 rounded-xl border border-indigo-500/30 bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 transition-colors disabled:opacity-50"
          >
            <UserPlus size={16} />
          </button>
        )}
      </div>
      <datalist id={`${name}-catalog`}>
        {options.map((opt) => (
          <option key={opt} value={opt} />
        ))}
      </datalist>
      {hint && <p className="text-[10px] mt-1 opacity-60">{hint}</p>}
      {errors?.[name] && <p className="form-error">{errors[name].message}</p>}
    </div>
  )
}

const SEGMENTOS_SIU = ['CLARO PERU', 'CLARO PERU RETENCIONES', 'CLARO CHILE', 'CLARO PERU OUT']

function inferSegmento(campana) {
  const c = (campana || '').toUpperCase()
  if (c.includes('RETENCION')) return 'CLARO PERU RETENCIONES'
  if (c.includes('CHILE') || c.includes('VTR')) return 'CLARO CHILE'
  if (c.includes('OUT') || c.includes('UPGRADE')) return 'CLARO PERU OUT'
  return 'CLARO PERU'
}

function suggestGrupoCodigo(periodo, semana, campana) {
  const p = periodo || `${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}`
  const s = String(semana || 1).padStart(2, '0')
  const camp = (campana || 'GRUPO').replace(/\s+/g, '').slice(0, 12).toUpperCase()
  return `GPE-${p}-S${s}-${camp}`
}

// Period and dynamic week values
const todayDate = new Date()
const currentPeriodoVal = todayDate.getFullYear().toString() + (todayDate.getMonth() + 1).toString().padStart(2, '0')

function getWeekNumber(d) {
  d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay()||7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
  const weekNo = Math.ceil(( ( (d - yearStart) / 86400000) + 1)/7);
  return weekNo;
}
const currentWeekVal = getWeekNumber(new Date())

const NOMINA_DRAFT_KEY = 'gea-nomina-draft'
const NOMINA_DRAFT_META_KEY = 'gea-nomina-draft-meta'

function loadNominaDraft() {
  try {
    const raw = sessionStorage.getItem(NOMINA_DRAFT_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function loadNominaDraftMeta() {
  try {
    const raw = sessionStorage.getItem(NOMINA_DRAFT_META_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function clearNominaDraft() {
  sessionStorage.removeItem(NOMINA_DRAFT_KEY)
  sessionStorage.removeItem(NOMINA_DRAFT_META_KEY)
}

function hasNominaDraftContent(values) {
  if (!values) return false
  return Boolean(
    values.documento?.trim()
    || values.nombres?.trim()
    || values.apellido_paterno?.trim()
    || values.celular?.trim()
    || values.correo?.trim()
  )
}

const NOMINA_FORM_DEFAULTS = {
  tipo_documento: 'DNI',
  genero: 'FEMENINO',
  estado_civil: 'SOLTERO',
  n_hijos: 0,
  periodo_reclutado: currentPeriodoVal,
  semana_trabajo: currentWeekVal,
  nacionalidad: 'PERUANA',
  sede: '',
  reclutador: '',
  campana: '',
  segmento: '',
  grupo_codigo: '',
  formador_nombre: '',
  formador_documento: '',
  celular: '',
  celular_referencia: '',
  correo: '',
}

// Validation schema for a single candidate
const schema = z.object({
  documento: z
    .string()
    .min(8, { message: 'El documento debe tener al menos 8 dígitos' })
    .max(12, { message: 'El documento debe tener máximo 12 dígitos' })
    .regex(/^\d+$/, { message: 'El documento debe contener solo números' }),
  tipo_documento: z.enum(['DNI', 'CE', 'PASAPORTE']),
  apellido_paterno: z.string().min(2, { message: 'El apellido paterno es requerido' }),
  apellido_materno: z.string().min(2, { message: 'El apellido materno es requerido' }),
  nombres: z.string().min(2, { message: 'El nombre completo es requerido' }),
  celular: z
    .string()
    .min(9, { message: 'El celular debe tener al menos 9 dígitos' })
    .regex(/^\+?[0-9\s-]+$/, { message: 'Formato de celular inválido' }),
  celular_referencia: z.string().optional(),
  correo: z.string().email({ message: 'Correo electrónico inválido' }),
  genero: z.enum(['MASCULINO', 'FEMENINO']),
  fecha_nacimiento: z.string().refine((val) => {
    const birth = new Date(val)
    const today = new Date()
    let age = today.getFullYear() - birth.getFullYear()
    const monthDiff = today.getMonth() - birth.getMonth()
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--
    }
    return age >= 16 && age <= 70
  }, { message: 'El candidato debe tener entre 16 y 70 años' }),
  estado_civil: z.enum(['SOLTERO', 'CASADO', 'DIVORCIADO', 'CONVIVIENTE', 'VIUDO']),
  n_hijos: z.number().min(0, { message: 'No puede ser negativo' }).default(0),
  nivel_academico: z.string().min(2, { message: 'Nivel académico es requerido' }),
  carrera: z.string().optional(),
  entidad: z.string().optional(),
  nacionalidad: z.string().optional(),
  lugar_nacimiento: z.string().optional(),
  lugar_residencia: z.string().optional(),
  distrito_residencia: z.string().optional(),
  direccion_domicilio: z.string().optional(),
  celular_emergencia: z.string().optional(),
  contacto_emergencia: z.string().optional(),
  parentesco: z.string().optional(),
  fuente_oferta: z.string().optional(),
  exp_call_center: z.boolean().optional(),
  exp_tipo_campana: z.string().optional(),
  exp_tiempo_campana: z.string().optional(),
  exp_otra: z.string().optional(),
  exp_tiempo_otra: z.string().optional(),
  observacion: z.string().optional(),
  periodo_reclutado: z.string().regex(/^\d{6}$/, { message: 'Formato de periodo requerido (AAAAMM), ej: 202604' }),
  semana_trabajo: z.number().min(1).max(53, { message: 'La semana de trabajo debe estar entre 1 y 53' }),
  reclutador: z.string().min(2, { message: 'Ingresa el nombre del reclutador' }),
  sede: z.string().min(2, { message: 'Ingresa la sede' }),
  campana: z.string().min(2, { message: 'Ingresa la campaña' }),
  segmento: z.string().optional(),
  grupo_codigo: z.string().optional(),
  formador_nombre: z.string().optional(),
  formador_documento: z.string().optional(),
  modalidad: z.enum(['PRESENCIAL', 'REMOTO', 'HIBRIDO']).optional(),
  condicion: z.string().optional(),
  horario_gestion: z.string().optional(),
  descanso: z.string().optional(),
  envio_dni: z.string().optional(),
  test_psicologico: z.string().optional(),
  validacion_pc: z.string().optional(),
  evaluacion_dia_0: z.string().optional(),
  fecha_inicio_capacitacion: z.string().optional(),
  fecha_fin_capacitacion: z.string().optional(),
  fecha_conexion_ojt: z.string().optional(),
  fecha_conexion_op: z.string().optional(),
  pago_capacitacion: z.boolean().optional(),
  fecha_inscripcion_curso: z.string().optional(),
  fecha_ingreso: z.string().optional(),
  tipo_trabajo: z.string().optional(),
  tipo_contratacion: z.string().optional(),
  razon_social: z.string().optional(),
  rango_salarial: z.string().optional(),
  remuneracion: z.union([z.string(), z.number()]).optional(),
  bono_variable: z.union([z.string(), z.number()]).optional(),
  bono_movilidad: z.union([z.string(), z.number()]).optional(),
  bono_bienvenida: z.union([z.string(), z.number()]).optional(),
  bono_permanencia: z.union([z.string(), z.number()]).optional(),
  bono_asistencia_perfecta: z.union([z.string(), z.number()]).optional(),
  cargo_contractual: z.string().optional(),
  dia_0: z.string().optional(),
  dia_0_obs: z.string().optional(),
  status_dia_1: z.string().optional(),
  dia_1: z.string().optional(),
  dia_1_obs: z.string().optional(),
  doc_cv: z.string().optional(),
  doc_dni_adjunto: z.string().optional(),
  doc_certijoven: z.string().optional(),
  doc_recibo_servicios: z.string().optional(),
  doc_ficha_datos: z.string().optional(),
  doc_autorizacion: z.string().optional(),
  estado: z.enum(['RECLUTADO', 'EN_CAPACITACION', 'EN_OJT', 'EN_OPERACION', 'BAJA', 'CESADO']).optional(),
  observacion_estado: z.string().optional(),
})

export default function NominaForm({ 
  reclutadores = [], 
  sedes = [], 
  campanas = [], 
  grupos = [],
  formadores = [],
  postulantes = [], 
  asistencias = [], 
  userProfile = null,
  onSave,
  onSaveBulk,
  onCatalogRefresh,
}) {
  const savedDraft = useMemo(() => loadNominaDraft(), [])
  const savedMeta = useMemo(() => loadNominaDraftMeta(), [])
  const hadSavedDraft = useMemo(() => hasNominaDraftContent(savedDraft), [savedDraft])

  const [activeTab, setActiveTab] = useState(savedMeta?.activeTab || 'manual')
  const [bulkSubTab, setBulkSubTab] = useState('pool')
  const [step, setStep] = useState(savedMeta?.step || 1)
  const [saving, setSaving] = useState(false)
  const [addingCatalog, setAddingCatalog] = useState(null)
  const defaultsSetRef = useRef(hadSavedDraft)
  const grupoPlanRef = useRef(null)
  const draftSaveTimerRef = useRef(null)

  // Bulk uploading states
  const [dragActive, setDragActive] = useState(false)
  const [uploadLoading, setUploadLoading] = useState(false)
  const [uploadError, setUploadError] = useState(null)
  const [uploadSuccess, setUploadSuccess] = useState(null)
  const [googlePaste, setGooglePaste] = useState('')
  const [googleError, setGoogleError] = useState(null)
  const fileInputRef = useRef(null)

  // Bulk Destination Overrides
  const [bulkPeriodo, setBulkPeriodo] = useState('')
  const [bulkSegmento, setBulkSegmento] = useState('')
  const [bulkCampana, setBulkCampana] = useState('')
  const [bulkGrupo, setBulkGrupo] = useState('')
  const googleFileRef = useRef(null)

  const bulkPeriodos = useMemo(() => {
    return [...new Set(grupos.map(g => g.periodo ? String(g.periodo).trim() : null).filter(Boolean))].sort()
  }, [grupos])

  const bulkSegmentos = useMemo(() => {
    let filtered = grupos.filter(g => g.periodo)
    if (bulkPeriodo) filtered = filtered.filter(g => String(g.periodo).trim() === String(bulkPeriodo).trim())
    return [...new Set(filtered.map(g => g.segmento ? String(g.segmento).trim() : null).filter(Boolean))].sort()
  }, [grupos, bulkPeriodo])

  const bulkCampanas = useMemo(() => {
    let filtered = grupos.filter(g => g.periodo)
    if (bulkPeriodo) filtered = filtered.filter(g => String(g.periodo).trim() === String(bulkPeriodo).trim())
    if (bulkSegmento) filtered = filtered.filter(g => String(g.segmento).trim() === String(bulkSegmento).trim())
    return [...new Set(filtered.map(g => g.campana ? String(g.campana).trim() : null).filter(Boolean))].sort()
  }, [grupos, bulkPeriodo, bulkSegmento])

  const bulkGruposList = useMemo(() => {
    let filtered = grupos.filter(g => g.periodo);
    if (bulkPeriodo) filtered = filtered.filter(g => String(g.periodo).trim() === String(bulkPeriodo).trim());
    if (bulkSegmento) filtered = filtered.filter(g => String(g.segmento).trim() === String(bulkSegmento).trim());
    if (bulkCampana) filtered = filtered.filter(g => String(g.campana).trim() === String(bulkCampana).trim());
    
    // Remove duplicates
    const unique = [];
    const seen = new Set();
    for (const g of filtered) {
      if (!seen.has(g.codigo)) {
        seen.add(g.codigo);
        unique.push(g);
      }
    }
    return unique.sort((a,b) => String(a.codigo).localeCompare(String(b.codigo)));
  }, [grupos, bulkPeriodo, bulkSegmento, bulkCampana])

  const {
    register,
    handleSubmit,
    reset,
    watch,
    trigger,
    setValue,
    getValues,
    control,
    getFieldState,
    formState: { errors, isSubmitSuccessful }
  } = useForm({
    resolver: zodResolver(schema),
    mode: 'onChange',
    defaultValues: {
      ...NOMINA_FORM_DEFAULTS,
      ...(savedDraft || {}),
    }
  })

  const persistDraft = useCallback(() => {
    const values = getValues()
    if (!hasNominaDraftContent(values)) {
      clearNominaDraft()
      return
    }
    sessionStorage.setItem(NOMINA_DRAFT_KEY, JSON.stringify(values))
    sessionStorage.setItem(NOMINA_DRAFT_META_KEY, JSON.stringify({
      step,
      activeTab,
      savedAt: Date.now(),
    }))
  }, [getValues, step, activeTab])

  useEffect(() => {
    const scheduleSave = () => {
      if (draftSaveTimerRef.current) clearTimeout(draftSaveTimerRef.current)
      draftSaveTimerRef.current = setTimeout(persistDraft, 350)
    }
    const sub = watch(scheduleSave)
    return () => {
      sub.unsubscribe()
      if (draftSaveTimerRef.current) clearTimeout(draftSaveTimerRef.current)
    }
  }, [watch, persistDraft])

  useEffect(() => {
    persistDraft()
  }, [step, activeTab, persistDraft])

  useEffect(() => {
    const saveNow = () => persistDraft()
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') saveNow()
    }
    window.addEventListener('pagehide', saveNow)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('pagehide', saveNow)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [persistDraft])

  // Solo pre-llenar una vez — NO sobrescribir lo que el usuario escribe
  useEffect(() => {
    if (defaultsSetRef.current) return
    const ready = reclutadores.length || sedes.length || campanas.length || userProfile?.nombre
    if (!ready) return

    if (userProfile?.rol === 'reclutador' && userProfile?.nombre) {
      setValue('reclutador', (userProfile.nombre_completo || userProfile.nombre).toUpperCase())
    } else if (reclutadores[0]) {
      setValue('reclutador', reclutadores[0])
    }
    if (sedes[0]) setValue('sede', sedes[0])
    if (campanas[0]) {
      const camp = campanas[0]?.nombre || campanas[0] || ''
      setValue('campana', camp)
      setValue('segmento', inferSegmento(camp))
    }
    defaultsSetRef.current = true
  }, [reclutadores, sedes, campanas, userProfile, setValue])

  const watchedCampana = watch('campana')
  const watchedSemana = watch('semana_trabajo')
  const watchedPeriodo = watch('periodo_reclutado')
  const watchedGrupoCodigo = watch('grupo_codigo')
  const suggestedGrupo = useMemo(
    () => suggestGrupoCodigo(watchedPeriodo, watchedSemana, watchedCampana),
    [watchedPeriodo, watchedSemana, watchedCampana]
  )

  const matchedGrupoPlan = useMemo(() => findGrupoPlan(grupos, {
    codigo: watchedGrupoCodigo,
    campana: watchedCampana,
    semana: watchedSemana,
    periodo: watchedPeriodo,
  }), [grupos, watchedGrupoCodigo, watchedCampana, watchedSemana, watchedPeriodo])

  // Sincronizar con plan CAPACIDAD_RYS al cambiar campaña/semana/grupo
  useEffect(() => {
    if (step !== 3 || !matchedGrupoPlan) return
    if (grupoPlanRef.current === matchedGrupoPlan.codigo) return
    const defaults = grupoToNominaDefaults(matchedGrupoPlan)
    const currentCodigo = getValues('grupo_codigo')
    const shouldApply = !currentCodigo
      || currentCodigo.toUpperCase() === suggestedGrupo.toUpperCase()
      || currentCodigo.toUpperCase() === matchedGrupoPlan.codigo.toUpperCase()
    if (!shouldApply) return
    grupoPlanRef.current = matchedGrupoPlan.codigo
    for (const [key, val] of Object.entries(defaults)) {
      if (val !== undefined && val !== null && val !== '') {
        setValue(key, val, { shouldDirty: true, shouldValidate: false })
      }
    }
    if (matchedGrupoPlan.formador_documento && formadores.length) {
      const f = formadores.find(x => x.documento === matchedGrupoPlan.formador_documento)
      if (f?.nombre_completo) setValue('formador_nombre', f.nombre_completo)
    }
  }, [step, matchedGrupoPlan, suggestedGrupo, setValue, getValues, formadores])

  // Reactive inputs
  // eslint-disable-next-line react-hooks/incompatible-library
  const selectedReclutador = watch('reclutador')
  const currentSemana = watch('semana_trabajo') || 16

  // Gamification Metrics
  const recruiterStats = useMemo(() => {
    if (!selectedReclutador) return { total: 0, weekCount: 0, retentionRate: 100, rank: 'Semilla', badgeColor: 'bg-gray-100 text-gray-800 border-gray-200' }

    const totalCandidates = postulantes.filter(p => p.reclutador === selectedReclutador)
    const totalCount = totalCandidates.length
    const weekCount = totalCandidates.filter(p => Number(p.semana_trabajo) === Number(currentSemana)).length

    const candidateDocs = new Set(totalCandidates.map(c => c.documento))
    const totalBajas = asistencias.filter(
      a => candidateDocs.has(a.postulante_documento) && a.sigla_asistencia === 'B'
    ).length

    const activeCount = totalCount - totalBajas
    const retentionRate = totalCount > 0 ? Math.round((activeCount / totalCount) * 100) : 100

    let rank = '🌱 En Crecimiento'
    let badgeColor = 'bg-green-50 text-green-700 border-green-200 dark:bg-green-500/10 dark:text-green-400 dark:border-green-800/20'
    if (totalCount >= 10 && retentionRate >= 80) {
      rank = '⭐ Reclutador de Calidad'
      badgeColor = 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-800/20'
    }
    if (totalCount >= 25 && retentionRate >= 90) {
      rank = '🏆 Reclutador de Élite'
      badgeColor = 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-800/20'
    }

    return {
      total: totalCount,
      weekCount,
      retentionRate,
      rank,
      badgeColor
    }
  }, [selectedReclutador, currentSemana, postulantes, asistencias])

  // Form submit handler — solo al pulsar "Finalizar" explícitamente
  const onSubmit = async (data) => {
    if (step !== TOTAL_STEPS) return
    setSaving(true)
    try {
      const money = (v) => (typeof v === 'number' ? v : parseMoney(v))
      const payload = {
        ...data,
        reclutador: data.reclutador.trim().toUpperCase(),
        sede: data.sede.trim().toUpperCase(),
        campana: data.campana.trim().toUpperCase(),
        segmento: data.segmento?.trim().toUpperCase() || inferSegmento(data.campana),
        grupo_codigo: data.grupo_codigo?.trim().toUpperCase() || suggestGrupoCodigo(data.periodo_reclutado, data.semana_trabajo, data.campana),
        formador_nombre: data.formador_nombre?.trim().toUpperCase() || null,
        formador_documento: data.formador_documento?.trim() || null,
        modalidad: data.modalidad || matchedGrupoPlan?.modalidad || null,
        condicion: data.condicion || matchedGrupoPlan?.condicion || null,
        horario_gestion: data.horario_gestion || matchedGrupoPlan?.rango_horario || null,
        remuneracion: money(data.remuneracion),
        bono_variable: money(data.bono_variable),
        bono_movilidad: money(data.bono_movilidad),
        bono_bienvenida: money(data.bono_bienvenida),
        bono_permanencia: money(data.bono_permanencia),
        bono_asistencia_perfecta: money(data.bono_asistencia_perfecta),
      }
      await ensureReclutador(payload.reclutador)
      await ensureSede(payload.sede)
      await ensureCampana(payload.campana, payload.segmento)
      const result = await onSave(payload)
      if (onCatalogRefresh) await onCatalogRefresh()
      defaultsSetRef.current = false
      clearNominaDraft()
      reset(NOMINA_FORM_DEFAULTS)
      setStep(1)
      alert(
        `✅ Postulante registrado correctamente\n\n` +
        `ID Nómina: ${result?.nomina_id || '—'}\n` +
        `DNI: ${payload.documento}\n` +
        `Grupo: ${result?.grupo_codigo || '—'}\n` +
        `Campaña: ${payload.campana}\n\n` +
        `El capacitador ya puede verlo en Asistencias (mismo grupo/campaña).`
      )
    } catch (err) {
      alert(err.message || 'Error al guardar el postulante.')
    } finally {
      setSaving(false)
    }
  }

  const handleQuickAddCatalog = async (type) => {
    const value = getValues(type)?.trim()
    if (!value || value.length < 2) {
      alert('Escribe al menos 2 caracteres antes de guardar en catálogo.')
      return
    }
    setAddingCatalog(type)
    try {
      const upper = value.toUpperCase()
      if (type === 'reclutador') await ensureReclutador(upper)
      else if (type === 'sede') await ensureSede(upper)
      else if (type === 'campana') await ensureCampana(upper, getValues('segmento'))
      setValue(type, upper)
      if (onCatalogRefresh) await onCatalogRefresh()
      alert(`"${upper}" guardado en catálogo.`)
    } catch (err) {
      alert(err.message || 'No se pudo guardar en catálogo.')
    } finally {
      setAddingCatalog(null)
    }
  }

  const STEP1_FIELDS = STEP_FIELDS[1]
  const STEP2_FIELDS = STEP_FIELDS[2]
  const STEP3_FIELDS = STEP_FIELDS[3]
  const STEP4_FIELDS = STEP_FIELDS[4]
  const TOTAL_STEPS = 4

  const catalogProps = {
    reclutadorOptions: reclutadores,
    reclutadorQuickAdd: () => handleQuickAddCatalog('reclutador'),
    reclutadorAdding: addingCatalog === 'reclutador',
    sedeOptions: sedes,
    sedeQuickAdd: () => handleQuickAddCatalog('sede'),
    sedeAdding: addingCatalog === 'sede',
    campanaOptions: campanas.map(c => c?.nombre || c),
    campanaQuickAdd: () => handleQuickAddCatalog('campana'),
    campanaAdding: addingCatalog === 'campana',
  }

  const importDefaults = useMemo(() => ({
    periodo: currentPeriodoVal,
    semana: currentWeekVal,
    reclutador: selectedReclutador || reclutadores[0],
    sede: sedes[0],
    campana: campanas[0]?.nombre || campanas[0] || '',
  }), [selectedReclutador, reclutadores, sedes, campanas])

  const processImportMatrix = async (matrix, { fillForm = false } = {}) => {
    let rows = parseNominaRows(matrix, importDefaults)
    if (!rows.length) throw new Error('No se encontraron filas válidas. Verifica encabezados del Excel/Google Form.')

    // Apply bulk destination overrides if the user selected them
    if (bulkSegmento || bulkCampana || bulkGrupo) {
      rows = rows.map(r => ({
        ...r,
        segmento: bulkSegmento || r.segmento,
        campana: bulkCampana || r.campana,
        grupo_codigo: bulkGrupo || r.grupo_codigo
      }))
    }

    if (fillForm && rows.length >= 1) {
      applyNominaPayloadToForm(rows[0], setValue)
      setActiveTab('manual')
      setStep(1)
      grupoPlanRef.current = null
      return { mode: 'form', count: 1 }
    }

    if (onSaveBulk) {
      const res = await onSaveBulk(rows)
      return { mode: 'bulk', ...res }
    }
    for (const row of rows) await onSave(row)
    return { mode: 'bulk', inserted: rows, skipped: [], failed: [] }
  }

  const handleGooglePasteImport = async () => {
    setGoogleError(null)
    try {
      const lines = googlePaste.trim().split(/\r?\n/).filter(Boolean)
      if (lines.length < 2) throw new Error('Pega al menos encabezados + 1 fila de respuesta.')
      const matrix = lines.map(line => line.split('\t').length > 1
        ? line.split('\t')
        : line.split(',').map(c => c.replace(/^"|"$/g, '')))
      const result = await processImportMatrix(matrix, { fillForm: lines.length <= 3 })
      if (result.mode === 'form') {
        setUploadSuccess('Respuesta de Google Form cargada en el formulario. Revisa y guarda.')
      } else {
        let msg = `Carga finalizada. Insertados: ${result.inserted?.length || 0}.`
        if (result.skipped?.length > 0) msg += ` Omitidos: ${result.skipped.length}.`
        if (result.failed?.length > 0) {
          msg += ` Fallidos: ${result.failed.length}.`
          setGoogleError(`Hubo ${result.failed.length} errores. Ejemplo: ${result.failed[0]?.reason}`)
        }
        if (result.inserted?.length > 0) {
          setUploadSuccess(msg)
        } else if (result.failed?.length > 0) {
          setUploadSuccess(null)
        } else {
          setUploadSuccess(msg)
        }
      }
      setGooglePaste('')
    } catch (err) {
      setGoogleError(err.message)
    }
  }

  const handleFinalizar = async () => {
    if (step !== TOTAL_STEPS || saving) return

    const ok1 = await trigger(STEP1_FIELDS)
    if (!ok1) { setStep(1); return }

    const ok2 = await trigger(STEP2_FIELDS)
    if (!ok2) { setStep(2); return }

    const ok3 = await trigger(['reclutador', 'sede', 'campana', 'periodo_reclutado', 'semana_trabajo'])
    if (!ok3) { setStep(3); return }

    handleSubmit(onSubmit)()
  }

  const handleFormKeyDown = (e) => {
    // Evita que Enter en un campo dispare el guardado antes de terminar
    if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') {
      e.preventDefault()
    }
  }

  const goToStep = async (target) => {
    if (target < step) {
      setStep(target)
      return
    }
    if (target === step) return

    if (target >= 2) {
      const ok1 = await trigger(STEP1_FIELDS)
      if (!ok1) return
    }
    if (target === 2) {
      setStep(2)
      return
    }
    if (target === 3) {
      const ok2 = await trigger(STEP2_FIELDS)
      if (!ok2) { setStep(2); return }
      setStep(3)
      return
    }
    if (target === 4) {
      const ok2 = await trigger(STEP2_FIELDS)
      if (!ok2) { setStep(2); return }
      const ok3 = await trigger(['reclutador', 'sede', 'campana', 'periodo_reclutado', 'semana_trabajo'])
      if (!ok3) { setStep(3); return }
      setStep(4)
    }
  }

  const handleNext = async () => {
    if (step === 1) {
      const ok = await trigger(STEP1_FIELDS)
      if (ok) setStep(2)
    } else if (step === 2) {
      const ok = await trigger(STEP2_FIELDS)
      if (ok) setStep(3)
    } else if (step === 3) {
      const ok = await trigger(['reclutador', 'sede', 'campana', 'periodo_reclutado', 'semana_trabajo'])
      if (ok) setStep(4)
    }
  }

  const handlePrev = () => {
    setStep(s => Math.max(1, s - 1))
  }

  // Validation feedback icon
  const getInputValidationIcon = (fieldName) => {
    const { invalid, isDirty } = getFieldState(fieldName)
    if (!isDirty) return null
    if (invalid) {
      return <AlertCircle size={15} className="text-red-500 flex-shrink-0" />
    }
    return <CheckCircle2 size={15} className="text-green-500 flex-shrink-0" />
  }

  // Drag and drop events
  const handleDrag = (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true)
    } else if (e.type === "dragleave") {
      setDragActive(false)
    }
  }

  const handleDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processExcelFile(e.dataTransfer.files[0])
    }
  }

  const handleFileInputChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      processExcelFile(e.target.files[0])
    }
  }

  // Parse Excel file client-side
  const processExcelFile = (file) => {
    setUploadLoading(true)
    setUploadError(null)
    setUploadSuccess(null)

    const reader = new FileReader()
    reader.onload = async (e) => {
      try {
        const data = new Uint8Array(e.target.result)
        const workbook = XLSX.read(data, { type: 'array' })
        
        // Find best sheet (default to 'Nomina' or first worksheet)
        const sheetName = workbook.SheetNames.includes('Nomina') 
          ? 'Nomina' 
          : workbook.SheetNames[0]
        const worksheet = workbook.Sheets[sheetName]
        
        // Convert to array of arrays
        const json = XLSX.utils.sheet_to_json(worksheet, { header: 1 })
        
        if (!json || json.length < 2) {
          throw new Error('El archivo está vacío o no contiene suficientes filas.')
        }

        const result = await processImportMatrix(json, { fillForm: json.length <= 3 })
        if (result.mode === 'form') {
          setUploadSuccess('Archivo cargado en el formulario. Revisa los datos y guarda.')
        } else {
          let msg = `Carga masiva finalizada. Insertados: ${result.inserted?.length || 0}.`
          if (result.skipped?.length > 0) msg += ` Omitidos: ${result.skipped.length}.`
          if (result.failed?.length > 0) {
            msg += ` Fallidos: ${result.failed.length}.`
            setUploadError(`Hubo ${result.failed.length} errores. Ejemplo: ${result.failed[0]?.reason}`)
          }
          if (result.inserted?.length > 0) {
            setUploadSuccess(msg)
          } else if (result.failed?.length > 0) {
            // If everything failed, only show the error, clear success
            setUploadSuccess(null)
          } else {
            setUploadSuccess(msg)
          }
        }
      } catch (err) {
        console.error(err)
        setUploadError(err.message || 'Error al leer el archivo Excel. Verifica el formato de columnas.')
      } finally {
        setUploadLoading(false)
        if (fileInputRef.current) {
          fileInputRef.current.value = ''
        }
      }
    }
    reader.readAsArrayBuffer(file)
  }

  const triggerUploadClick = () => {
    fileInputRef.current.click()
  }

  return (
    <PageLayout className="p-4 md:p-6 space-y-6">
      <PageHeader 
        title="Nómina Operativa" 
        subtitle="Registro y Carga Masiva de Postulantes"
      />
      <div className="animate-fadeIn">
        {/* ── Form Container ── */}
        <Card noPadding className="flex flex-col min-h-[580px]">
          <div className="p-6 md:p-8 flex-1 flex flex-col">
        {/* Navigation Tabs */}
        <div className="flex border-b border-gray-200 dark:border-slate-800 mb-6">
          <button
            onClick={() => setActiveTab('manual')}
            className={`pb-4 px-6 font-medium text-sm border-b-2 transition-colors ${
              activeTab === 'manual'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-slate-400'
            }`}
          >
            Formulario Manual
          </button>
          <button
            onClick={() => setActiveTab('bulk')}
            className={`pb-4 px-6 font-medium text-sm border-b-2 transition-colors ${
              activeTab === 'bulk'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-slate-400'
            }`}
          >
            Carga Masiva y Bolsa
          </button>
        </div>

        {activeTab === 'manual' ? (
          <>
            {/* Header info */}
            <div className="flex items-center justify-between pb-6 border-b border-gray-100 dark:border-slate-800 mb-6">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-xl">
                  <UserCheck size={22} />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-100">Registro Individual</h2>
                  <p className="text-gray-500 dark:text-slate-450 text-xs mt-0.5">Ingresa los datos del postulante paso a paso.</p>
                </div>
              </div>
              <div className="text-right">
                <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Paso {step} de {TOTAL_STEPS}</span>
                <p className="text-xs font-bold text-blue-600">
                  {STEP_LABELS[step - 1]}
                </p>
              </div>
            </div>

            {/* Stepper Progress bar */}
            <div className="relative mb-8 px-4">
              <div className="absolute top-1/2 left-0 w-full h-[2px] bg-gray-100 dark:bg-slate-800 -translate-y-1/2 z-0" />
              <div
                className="absolute top-1/2 left-0 h-[2px] bg-blue-600 -translate-y-1/2 transition-all duration-350 z-0"
                style={{ width: `${((step - 1) / (TOTAL_STEPS - 1)) * 100}%` }}
              />
              <div className="flex justify-between relative z-10">
                {[
                  { num: 1, label: 'Personal', icon: User },
                  { num: 2, label: 'Contacto', icon: Phone },
                  { num: 3, label: 'Reclutamiento', icon: Briefcase },
                  { num: 4, label: 'Contrato', icon: FileText },
                ].map(({ num, label, icon: Icon }) => {
                  const isActive = step >= num
                  const isCurrent = step === num
                  return (
                    <button
                      key={num}
                      type="button"
                      onClick={() => goToStep(num)}
                      className="flex flex-col items-center focus:outline-none"
                    >
                      <div className={`
                        w-9 h-9 rounded-full flex items-center justify-center border transition-all duration-200
                        ${isCurrent ? 'bg-blue-600 border-blue-600 text-white shadow-sm scale-105' : ''}
                        ${isActive && !isCurrent ? 'bg-blue-50 dark:bg-slate-850 border-blue-600 text-blue-600 dark:text-blue-400' : ''}
                        ${!isActive ? 'bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-800 text-gray-400 dark:text-slate-600' : ''}
                      `}>
                        {step > num ? <Check size={14} /> : <Icon size={14} />}
                      </div>
                      <span className={`text-[10px] font-semibold mt-1.5 uppercase tracking-wider ${isActive ? 'text-gray-900 dark:text-slate-300' : 'text-gray-400'}`}>
                        {label}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>

            {isSubmitSuccessful && (
              <div className="mb-6 p-4 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800/30 text-green-700 dark:text-green-400 rounded-xl flex items-center space-x-3 animate-fadeIn">
                <CheckCircle2 size={18} className="text-green-600 dark:text-green-400 flex-shrink-0" />
                <span className="text-xs font-medium">¡Candidato registrado con éxito! La nómina ha sido actualizada.</span>
              </div>
            )}

            {/* Form */}
            <form
              onSubmit={(e) => e.preventDefault()}
              onKeyDown={handleFormKeyDown}
              className="flex-1 flex flex-col justify-between"
            >
              <div className="space-y-5">
                {step === 1 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5 animate-slideInRight">
                    {/* Document Type */}
                    <div>
                      <label className="form-label">Tipo de Documento</label>
                      <select
                        {...register('tipo_documento')}
                        className="form-input"
                      >
                        <option value="DNI">DNI (Perú)</option>
                        <option value="CE">C.E. (Extranjería)</option>
                        <option value="PASAPORTE">Pasaporte</option>
                      </select>
                    </div>

                    {/* Document Number */}
                    <div>
                      <label className="form-label flex items-center justify-between">
                        <span>Número de Documento</span>
                        {getInputValidationIcon('documento')}
                      </label>
                      <input
                        type="text"
                        {...register('documento')}
                        placeholder="Ej. 75977988"
                        className={`form-input ${errors.documento ? 'border-red-300 focus:border-red-500 focus:ring-red-500/20' : ''}`}
                      />
                      {errors.documento && (
                        <p className="form-error">{errors.documento.message}</p>
                      )}
                    </div>

                    {/* LastName 1 */}
                    <div>
                      <label className="form-label flex items-center justify-between">
                        <span>Apellido Paterno</span>
                        {getInputValidationIcon('apellido_paterno')}
                      </label>
                      <input
                        type="text"
                        {...register('apellido_paterno')}
                        placeholder="Ej. ARMAS"
                        className="form-input"
                      />
                      {errors.apellido_paterno && (
                        <p className="form-error">{errors.apellido_paterno.message}</p>
                      )}
                    </div>

                    {/* LastName 2 */}
                    <div>
                      <label className="form-label flex items-center justify-between">
                        <span>Apellido Materno</span>
                        {getInputValidationIcon('apellido_materno')}
                      </label>
                      <input
                        type="text"
                        {...register('apellido_materno')}
                        placeholder="Ej. ANGULO"
                        className="form-input"
                      />
                      {errors.apellido_materno && (
                        <p className="form-error">{errors.apellido_materno.message}</p>
                      )}
                    </div>

                    {/* Names */}
                    <div className="md:col-span-2">
                      <label className="form-label flex items-center justify-between">
                        <span>Nombres Completos</span>
                        {getInputValidationIcon('nombres')}
                      </label>
                      <input
                        type="text"
                        {...register('nombres')}
                        placeholder="Ej. DIEGO ALEXANDER"
                        className="form-input"
                      />
                      {errors.nombres && (
                        <p className="form-error">{errors.nombres.message}</p>
                      )}
                    </div>

                    {/* Gender */}
                    <div>
                      <label className="form-label">Género</label>
                      <select
                        {...register('genero')}
                        className="form-input"
                      >
                        <option value="FEMENINO">Femenino</option>
                        <option value="MASCULINO">Masculino</option>
                      </select>
                    </div>

                    {/* Birthdate */}
                    <div>
                      <label className="form-label flex items-center justify-between">
                        <span>Fecha de Nacimiento</span>
                        {getInputValidationIcon('fecha_nacimiento')}
                      </label>
                      <input
                        type="date"
                        {...register('fecha_nacimiento')}
                        className="form-input"
                      />
                      {errors.fecha_nacimiento && (
                        <p className="form-error">{errors.fecha_nacimiento.message}</p>
                      )}
                    </div>

                    {/* Civil status */}
                    <div>
                      <label className="form-label">Estado Civil</label>
                      <select
                        {...register('estado_civil')}
                        className="form-input"
                      >
                        <option value="SOLTERO">Soltero/a</option>
                        <option value="CASADO">Casado/a</option>
                        <option value="DIVORCIADO">Divorciado/a</option>
                        <option value="CONVIVIENTE">Conviviente</option>
                        <option value="VIUDO">Viudo/a</option>
                      </select>
                    </div>

                    {/* Children count */}
                    <div>
                      <label className="form-label">Número de Hijos</label>
                      <input
                        type="number"
                        {...register('n_hijos', { valueAsNumber: true })}
                        className="form-input"
                      />
                    </div>

                    {/* Academic details */}
                    <div className="md:col-span-2">
                      <label className="form-label flex items-center justify-between">
                        <span>Nivel Académico</span>
                        {getInputValidationIcon('nivel_academico')}
                      </label>
                      <input
                        type="text"
                        {...register('nivel_academico')}
                        placeholder="Ej. SECUNDARIA COMPLETA o UNIVERSITARIO TRUNCO"
                        className="form-input"
                      />
                      {errors.nivel_academico && (
                        <p className="form-error">{errors.nivel_academico.message}</p>
                      )}
                    </div>

                    <div>
                      <label className="form-label">Mencionar Carrera</label>
                      <input type="text" {...register('carrera')} placeholder="Ej. PSICOLOGÍA" className="form-input" />
                    </div>
                    <div>
                      <label className="form-label">Nacionalidad</label>
                      <input type="text" {...register('nacionalidad')} placeholder="PERUANA" className="form-input" />
                    </div>
                  </div>
                )}

                {step === 2 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5 animate-slideInRight">
                    {/* Primary phone */}
                    <div>
                      <label className="form-label flex items-center justify-between">
                        <span>Celular Principal</span>
                        {getInputValidationIcon('celular')}
                      </label>
                      <input
                        type="text"
                        {...register('celular')}
                        placeholder="Ej. 900428103"
                        className="form-input"
                      />
                      {errors.celular && (
                        <p className="form-error">{errors.celular.message}</p>
                      )}
                    </div>

                    {/* Reference phone */}
                    <div>
                      <label className="form-label">Celular de Referencia (Opcional)</label>
                      <input
                        type="text"
                        {...register('celular_referencia')}
                        placeholder="Ej. 999888777"
                        className="form-input"
                      />
                    </div>

                    {/* Email */}
                    <div className="md:col-span-2">
                      <label className="form-label flex items-center justify-between">
                        <span>Correo Electrónico</span>
                        {getInputValidationIcon('correo')}
                      </label>
                      <input
                        type="text"
                        {...register('correo')}
                        placeholder="Ej. candidato@correo.com"
                        className="form-input"
                      />
                      {errors.correo && (
                        <p className="form-error">{errors.correo.message}</p>
                      )}
                    </div>

                    <div className="md:col-span-2 border-t border-gray-100 dark:border-slate-800 pt-4 mt-2">
                      <p className="text-xs font-bold text-gray-500 dark:text-slate-400 mb-3 uppercase tracking-wider">Residencia y experiencia</p>
                      <NominaFieldGrid
                        fields={['lugar_residencia', 'distrito_residencia', 'direccion_domicilio', 'exp_call_center', 'exp_tipo_campana', 'exp_tiempo_campana', 'exp_otra', 'exp_tiempo_otra', 'fuente_oferta', 'observacion']}
                        register={register}
                        errors={errors}
                      />
                    </div>
                  </div>
                )}

                {step === 3 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5 animate-slideInRight">
                    {matchedGrupoPlan && (
                      <div className="md:col-span-2 text-xs rounded-xl px-4 py-3 border border-emerald-200 dark:border-emerald-800/40 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-800 dark:text-emerald-300">
                        <strong>Plan CAPACIDAD_RYS:</strong> {matchedGrupoPlan.codigo} — {matchedGrupoPlan.campana}
                        {matchedGrupoPlan.meta_dia_0 != null && (
                          <span className="ml-2 opacity-80">
                            Meta D0: {matchedGrupoPlan.meta_dia_0} | Ingresados: {matchedGrupoPlan.postulantes_activos ?? 0}
                          </span>
                        )}
                        {matchedGrupoPlan.modalidad && (
                          <span className="ml-2 opacity-70">| {matchedGrupoPlan.modalidad} | {matchedGrupoPlan.rango_horario || '—'}</span>
                        )}
                      </div>
                    )}
                    <p className="md:col-span-2 text-xs text-gray-500 dark:text-slate-400 bg-blue-50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/30 rounded-xl px-4 py-3">
                      Asigna campaña, grupo y capacitador. Todos los campos son editables — si dejas el grupo vacío se genera automáticamente al guardar.
                    </p>

                    <Controller
                      name="reclutador"
                      control={control}
                      render={({ field }) => (
                        <CatalogField
                          label="Reclutador Responsable"
                          name="reclutador"
                          value={field.value}
                          onChange={field.onChange}
                          onBlur={field.onChange}
                          errors={errors}
                          options={reclutadores}
                          placeholder="Ej. MEDINA HUARI ALDO MANUEL"
                          hint="Escribe o selecciona. Si no existe, se crea al guardar."
                          onQuickAdd={() => handleQuickAddCatalog('reclutador')}
                          adding={addingCatalog === 'reclutador'}
                        />
                      )}
                    />

                    <Controller
                      name="sede"
                      control={control}
                      render={({ field }) => (
                        <CatalogField
                          label="Sede de Trabajo"
                          name="sede"
                          value={field.value}
                          onChange={field.onChange}
                          onBlur={field.onChange}
                          errors={errors}
                          options={sedes}
                          placeholder="Ej. SAN ISIDRO"
                          hint="Nueva sede se guarda automáticamente."
                          onQuickAdd={() => handleQuickAddCatalog('sede')}
                          adding={addingCatalog === 'sede'}
                        />
                      )}
                    />

                    <Controller
                      name="campana"
                      control={control}
                      render={({ field }) => (
                        <CatalogField
                          label="Campaña Asignada"
                          name="campana"
                          value={field.value}
                          onChange={(v) => {
                            field.onChange(v)
                            if (!getValues('segmento')) setValue('segmento', inferSegmento(v))
                          }}
                          onBlur={(v) => field.onChange(v)}
                          errors={errors}
                          options={campanas.map(c => c?.nombre || c)}
                          placeholder="Ej. RETENCIONES"
                          hint="Escribe la campaña a la que pertenece el postulante."
                          onQuickAdd={() => handleQuickAddCatalog('campana')}
                          adding={addingCatalog === 'campana'}
                        />
                      )}
                    />

                    <Controller
                      name="segmento"
                      control={control}
                      render={({ field }) => (
                        <CatalogField
                          label="Segmento (SIU)"
                          name="segmento"
                          value={field.value}
                          onChange={field.onChange}
                          onBlur={field.onChange}
                          errors={errors}
                          options={SEGMENTOS_SIU}
                          placeholder="Ej. CLARO PERU RETENCIONES"
                          hint="Segmento de negocio — editable."
                        />
                      )}
                    />

                    <Controller
                      name="grupo_codigo"
                      control={control}
                      render={({ field }) => (
                        <div>
                          <CatalogField
                            label="Grupo de Capacitación"
                            name="grupo_codigo"
                            value={field.value}
                            onChange={field.onChange}
                            onBlur={field.onChange}
                            errors={errors}
                            options={(grupos || []).map(g => g.codigo).filter(Boolean)}
                            placeholder={suggestedGrupo}
                            hint={`Sugerido: ${suggestedGrupo} — déjalo vacío para usar el automático.`}
                          />
                        </div>
                      )}
                    />

                    <div className="space-y-2">
                      <label className="form-label">Capacitador / Formador</label>
                      <Controller
                        name="formador_nombre"
                        control={control}
                        render={({ field }) => (
                          <>
                            <input
                              list="formadores-nomina"
                              value={field.value || ''}
                              onChange={(e) => {
                                const v = e.target.value
                                field.onChange(v)
                                const found = formadores.find(f =>
                                  f.nombre_completo?.toUpperCase() === v.toUpperCase()
                                )
                                if (found) setValue('formador_documento', found.documento)
                              }}
                              onBlur={(e) => field.onChange(e.target.value.trim().toUpperCase())}
                              placeholder="Nombre del capacitador"
                              className="form-input w-full"
                              autoComplete="off"
                            />
                            <datalist id="formadores-nomina">
                              {formadores.map(f => (
                                <option key={f.documento} value={f.nombre_completo} />
                              ))}
                            </datalist>
                          </>
                        )}
                      />
                      <input
                        type="text"
                        {...register('formador_documento')}
                        placeholder="DNI del capacitador (opcional)"
                        className="form-input w-full"
                      />
                      <p className="text-[10px] opacity-60">El formador verá al postulante en Asistencias bajo este grupo/campaña.</p>
                    </div>

                    {/* Period */}
                    <div>
                      <label className="form-label flex items-center justify-between">
                        <span>Periodo Reclutamiento</span>
                        {getInputValidationIcon('periodo_reclutado')}
                      </label>
                      <input
                        type="text"
                        {...register('periodo_reclutado')}
                        placeholder="AAAAMM, ej: 202604"
                        className="form-input"
                      />
                      {errors.periodo_reclutado && (
                        <p className="form-error">{errors.periodo_reclutado.message}</p>
                      )}
                    </div>

                    {/* Week */}
                    <div>
                      <label className="form-label flex items-center justify-between">
                        <span>Semana de Capacitación</span>
                        {getInputValidationIcon('semana_trabajo')}
                      </label>
                      <input
                        type="number"
                        {...register('semana_trabajo', { valueAsNumber: true })}
                        className="form-input"
                      />
                      {errors.semana_trabajo && (
                        <p className="form-error">{errors.semana_trabajo.message}</p>
                      )}
                    </div>

                    <div className="md:col-span-2 border-t border-gray-100 dark:border-slate-800 pt-4 mt-2">
                      <p className="text-xs font-bold text-gray-500 dark:text-slate-400 mb-3 uppercase tracking-wider">Pipeline capacitación</p>
                      <NominaFieldGrid
                        fields={['modalidad', 'condicion', 'horario_gestion', 'descanso', 'envio_dni', 'test_psicologico', 'validacion_pc', 'evaluacion_dia_0', 'fecha_inicio_capacitacion', 'fecha_fin_capacitacion', 'fecha_conexion_ojt', 'fecha_conexion_op', 'pago_capacitacion']}
                        register={register}
                        errors={errors}
                      />
                    </div>
                  </div>
                )}

                {step === 4 && (
                  <div className="space-y-6 animate-slideInRight max-h-[55vh] overflow-y-auto pr-1">
                    <NominaFieldGrid
                      fields={NOMINA_FORM_GROUPS.filter(g => g.id === 'contrato').flatMap(g => g.fields)}
                      register={register}
                      errors={errors}
                    />
                    <div className="border-t border-gray-100 dark:border-slate-800 pt-4">
                      <p className="text-xs font-bold text-gray-500 dark:text-slate-400 mb-3 uppercase tracking-wider">Día 0 / Día 1 y documentos</p>
                      <NominaFieldGrid
                        fields={NOMINA_FORM_GROUPS.filter(g => g.id === 'seguimiento').flatMap(g => g.fields)}
                        register={register}
                        errors={errors}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Navigation Actions */}
              <div className="flex items-center justify-between border-t border-gray-100 dark:border-slate-800 pt-6 mt-8">
                {step > 1 ? (
                  <button
                    type="button"
                    onClick={handlePrev}
                    className="btn-secondary"
                  >
                    Anterior
                  </button>
                ) : (
                  <div />
                )}

                {step < TOTAL_STEPS ? (
                  <button
                    type="button"
                    onClick={handleNext}
                    className="btn-primary"
                  >
                    Siguiente
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleFinalizar}
                    disabled={saving}
                    className="btn-primary flex items-center gap-1.5"
                  >
                    {saving ? (
                      <>
                        <RefreshCw size={14} className="animate-spin" />
                        <span>Guardando...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles size={14} />
                        <span>Finalizar</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            </form>
          </>
        ) : (
          /* ── BULK UPLOAD TAB ── */
          <div className="flex-1 flex flex-col justify-between animate-fadeIn">
            <div>
              <div className="flex items-center space-x-3 pb-6 border-b border-gray-100 dark:border-slate-800 mb-6">
                <div className="p-2.5 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-xl">
                  <UploadCloud size={22} />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-100">Asignación desde Bolsa</h2>
                  <p className="text-gray-500 dark:text-slate-450 text-xs mt-0.5">Asigna postulantes desde las respuestas de Google Forms directamente a un grupo.</p>
                </div>
              </div>

              {/* ── SELECCIÓN DE DESTINO ── */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-6 p-4 bg-gray-50 dark:bg-slate-800/50 rounded-2xl border border-gray-100 dark:border-slate-800">
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1">Periodo</label>
                  <select value={bulkPeriodo} onChange={e => { setBulkPeriodo(e.target.value); setBulkSegmento(''); setBulkCampana(''); setBulkGrupo('') }} className="w-full text-sm border-gray-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 font-medium focus:ring-blue-500/20 focus:border-blue-500">
                    <option value="" disabled>Seleccione Período</option>
                    {bulkPeriodos.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1">Segmento</label>
                  <select value={bulkSegmento} onChange={e => { setBulkSegmento(e.target.value); setBulkCampana(''); setBulkGrupo('') }} className="w-full text-sm border-gray-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 font-medium focus:ring-blue-500/20 focus:border-blue-500">
                    <option value="" disabled>Seleccione Segmento</option>
                    {bulkSegmentos.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1">Campaña</label>
                  <select value={bulkCampana} onChange={e => { setBulkCampana(e.target.value); setBulkGrupo('') }} className="w-full text-sm border-gray-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 font-medium focus:ring-blue-500/20 focus:border-blue-500">
                    <option value="" disabled>Seleccione Campaña</option>
                    {bulkCampanas.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1">Grupo (GPE)</label>
                  <select value={bulkGrupo} onChange={e => setBulkGrupo(e.target.value)} className="w-full text-sm border-gray-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 font-medium focus:ring-blue-500/20 focus:border-blue-500">
                    <option value="" disabled>Seleccione Grupo (GPE)</option>
                    {bulkGruposList.map(g => (
                      <option key={g.codigo} value={g.codigo}>
                        {String(g.codigo).startsWith('PROY-') ? '—' : String(g.codigo).replace(/_\d+$/, '')}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {bulkGrupo && (
                <div className="mb-4 p-3 bg-blue-50/50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800/50 rounded-xl text-blue-700 dark:text-blue-300 text-xs flex items-center space-x-2">
                  <User size={16} className="text-blue-500 flex-shrink-0" />
                  <span>
                    El grupo seleccionado ya tiene <strong>{postulantes.filter(p => p.grupo_codigo === bulkGrupo).length}</strong> persona(s) inscrita(s). Al cargar el archivo, solo se agregarán las personas nuevas.
                  </span>
                </div>
              )}
              {/* ONLY GOOGLE FORMS POOL */}
                <NominaFormPool 
                  bulkPeriodo={bulkPeriodo} 
                  bulkSegmento={bulkSegmento} 
                  bulkCampana={bulkCampana} 
                  bulkGrupo={bulkGrupo}
                  reclutador={userProfile?.nombre_completo}
                  grupos={grupos}
                />
              
            {/* Template Download Help */}
            <div className="mt-8 border-t border-gray-100 dark:border-slate-800 pt-6 flex flex-col md:flex-row md:items-center md:justify-between text-xs text-gray-500">
              <span className="flex items-center gap-1.5">
                <FileSpreadsheet size={14} className="text-green-600 dark:text-green-400" />
                <span>Compatible con consolidado GEA (68 columnas) y respuestas de Google Forms.</span>
              </span>
              <span className="mt-2 md:mt-0">
                Usa las columnas estándar del formato de asistencia.
              </span>
            </div>
          </div>
        </div>
        )}
          </div>
        </Card>


      </div>
    </PageLayout>
  )
}
