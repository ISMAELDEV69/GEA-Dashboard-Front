import React, { useState, useEffect, useMemo, useRef } from 'react'
import {
  X,
  Calendar,
  Save,
  Loader2,
  AlertCircle,
  Plus,
  Trash2,
  CheckCheck,
  RotateCcw,
  Check,
  ChevronDown,
  Clock,
  UserCheck
} from 'lucide-react'
import { regularizarAsistenciaPostulante, parseFechaAsistencia } from '../lib/dataService'
import { canAssignBajaDia1, defaultBajaMotivo, sanitizeBajaDia1Motivo, isBajaDia1Motivo } from '../lib/bajaDia1Rules'
import { useToast } from '../context/ToastContext'

const SIGLAS = [
  { value: 'A', label: 'Asistencia', short: 'A', bg: 'bg-emerald-500/15', text: 'text-emerald-500 dark:text-emerald-400', border: 'border-emerald-500/40', activeClass: 'bg-emerald-600 text-white font-black' },
  { value: 'I-OP', label: 'Ingreso Op.', short: 'I-OP', bg: 'bg-blue-500/15', text: 'text-blue-500 dark:text-blue-400', border: 'border-blue-500/40', activeClass: 'bg-blue-600 text-white font-black' },
  { value: 'FI', label: 'Falta Injust.', short: 'FI', bg: 'bg-amber-500/15', text: 'text-amber-500 dark:text-amber-400', border: 'border-amber-500/40', activeClass: 'bg-amber-600 text-white font-black' },
  { value: 'FJ', label: 'Falta Just.', short: 'FJ', bg: 'bg-violet-500/15', text: 'text-violet-500 dark:text-violet-400', border: 'border-violet-500/40', activeClass: 'bg-violet-600 text-white font-black' },
  { value: 'B', label: 'Baja', short: 'B', bg: 'bg-rose-500/15', text: 'text-rose-500 dark:text-rose-400', border: 'border-rose-500/40', activeClass: 'bg-rose-600 text-white font-black' }
]

function formatSpreadsheetDate(dateStr) {
  if (!dateStr) return ''
  const [year, month, day] = dateStr.split('-')
  return `${parseInt(day, 10)}/${parseInt(month, 10)}/${year}`
}

function formatPrettyDate(dateStr) {
  if (!dateStr) return ''
  const parts = dateStr.split('-')
  if (parts.length !== 3) return dateStr
  const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
  const day = parseInt(parts[2], 10)
  const monthIdx = parseInt(parts[1], 10) - 1
  const year = parts[0]
  return `${day} ${months[monthIdx] || ''} ${year}`
}

function formatShortDate(dateStr) {
  if (!dateStr) return ''
  const parts = dateStr.split('-')
  if (parts.length !== 3) return dateStr
  const day = parseInt(parts[2], 10)
  const month = parseInt(parts[1], 10)
  return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}`
}

function getDayOfWeekShort(dateStr) {
  if (!dateStr) return ''
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  const days = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
  return days[dt.getUTCDay()]
}

function withDayIndex(list = []) {
  return [...list]
    .sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)))
    .map((r, index) => ({
      ...r,
      dayIndex: index + 1,
      isDia1: index === 0,
    }))
}

function getInitials(name = '') {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'P'
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase()
  return (parts[0][0] + parts[1][0]).toUpperCase()
}

/**
 * Resuelve los días oficiales y programados de la cohorte de capacitación a partir del Día 1
 */
function resolveScheduledCohortDays({
  grupoObj,
  grupoCodigo,
  campana,
  asistencias = [],
  postulanteDoc,
  currentFormFecha
}) {
  const cleanDoc = String(postulanteDoc || '').trim()
  const cleanGrupo = String(grupoCodigo || grupoObj?.codigo || '').trim().toUpperCase()
  const cleanCampana = String(campana || grupoObj?.campana || '').trim().toUpperCase()

  // 1. Filtrar registros del postulante en esta cohorte
  const candidateRecords = (asistencias || []).filter(a => {
    const matchDoc = String(a.postulante_documento || a.documento || '').trim() === cleanDoc
    const aGrupo = String(a.grupo_codigo || a.codigo_grupo || a.grupo || '').trim().toUpperCase()
    const aCampana = String(a.campana || '').trim().toUpperCase()
    const matchGrupo = !cleanGrupo || !aGrupo || aGrupo === cleanGrupo
    const matchCampana = !cleanCampana || !aCampana || cleanCampana.includes(aCampana) || aCampana.includes(cleanCampana)
    return matchDoc && matchGrupo && matchCampana
  })

  // 2. Filtrar asistencias generales del grupo en esta campaña
  const cohortRecords = (asistencias || []).filter(a => {
    const aGrupo = String(a.grupo_codigo || a.codigo_grupo || a.grupo || '').trim().toUpperCase()
    const aCampana = String(a.campana || '').trim().toUpperCase()
    const matchGrupo = !cleanGrupo || !aGrupo || aGrupo === cleanGrupo
    const matchCampana = !cleanCampana || !aCampana || cleanCampana.includes(aCampana) || aCampana.includes(cleanCampana)
    return matchGrupo && matchCampana
  })

  const cohortRegisteredDates = cohortRecords
    .map(a => parseFechaAsistencia(a.fecha_asistencia || a.fecha_registro_asistencia || a.fecha))
    .filter(Boolean)
    .sort()

  const candidateRegisteredDates = candidateRecords
    .map(a => parseFechaAsistencia(a.fecha_asistencia || a.fecha_registro_asistencia || a.fecha))
    .filter(Boolean)
    .sort()

  // 3. Determinar la fecha de inicio oficial (DÍA 1)
  let dia1Iso = null

  if (grupoObj?.fecha_dia_1) {
    dia1Iso = grupoObj.fecha_dia_1
  } else if (grupoObj?.fecha_registro) {
    const [y, m, d] = grupoObj.fecha_registro.split('-').map(Number)
    const startDate = new Date(Date.UTC(y, m - 1, d))
    const dayOfWeek = startDate.getUTCDay()

    // Para grupos GPE registrados en sábado, el día 1 de capacitación inicia el lunes (+2 días)
    if (dayOfWeek === 6 && cleanGrupo.startsWith('GPE')) {
      startDate.setUTCDate(startDate.getUTCDate() + 2)
    } else if (dayOfWeek === 0) {
      // Si cae domingo, se traslada al lunes
      startDate.setUTCDate(startDate.getUTCDate() + 1)
    }

    const calculatedDia1 = startDate.toISOString().split('T')[0]

    // Si hay asistencias registradas para esta cohorte muy cerca de la fecha de registro, calibrar
    if (cohortRegisteredDates.length > 0) {
      const firstReg = cohortRegisteredDates[0]
      if (firstReg >= grupoObj.fecha_registro && firstReg <= calculatedDia1) {
        dia1Iso = firstReg
      } else {
        dia1Iso = calculatedDia1
      }
    } else {
      dia1Iso = calculatedDia1
    }
  }

  if (!dia1Iso) {
    dia1Iso = candidateRegisteredDates[0] || cohortRegisteredDates[0] || currentFormFecha || new Date().toISOString().split('T')[0]
  }

  // 4. Determinar la fecha límite de capacitación (OJT o extensión de teoría)
  let limitIso = null
  let maxWorkingDays = 12 // Estándar de 10-12 días de capacitación

  if (grupoObj?.extension_teoria) {
    const num = parseInt(String(grupoObj.extension_teoria).replace(/\D/g, ''), 10)
    if (!isNaN(num) && num > 0) {
      maxWorkingDays = num
    }
  }

  if (grupoObj?.fecha_inicio_ojt && grupoObj.fecha_inicio_ojt >= dia1Iso) {
    limitIso = grupoObj.fecha_inicio_ojt
  }

  // 5. Generar los días programados desde el DÍA 1 (Lunes a Sábado, excluyendo domingos)
  const scheduledDates = []
  const [startY, startM, startD] = dia1Iso.split('-').map(Number)
  const iterDate = new Date(Date.UTC(startY, startM - 1, startD))

  let workingDaysCount = 0
  let safety = 0

  while (safety < 30) {
    const currentIso = iterDate.toISOString().split('T')[0]
    const dayOfWeek = iterDate.getUTCDay()

    // Domingos no son días laborales de capacitación
    if (dayOfWeek !== 0) {
      scheduledDates.push(currentIso)
      workingDaysCount++
    }

    // Condición de parada: Si se alcanzó la fecha de inicio de OJT o el número de días de teoría
    if (limitIso && currentIso >= limitIso) {
      break
    }
    if (!limitIso && workingDaysCount >= maxWorkingDays) {
      break
    }

    iterDate.setUTCDate(iterDate.getUTCDate() + 1)
    safety++
  }

  // 6. Asegurar que cualquier fecha que este postulante YA tenga registrada en esta cohorte se incluya
  candidateRegisteredDates.forEach(d => {
    if (d && !scheduledDates.includes(d)) {
      scheduledDates.push(d)
    }
  })

  // 7. Incluir la fecha activa en el formulario si corresponde a esta cohorte
  if (currentFormFecha && currentFormFecha >= dia1Iso && !scheduledDates.includes(currentFormFecha)) {
    // Solo si está dentro de un rango razonable (máx 25 días desde día 1)
    const diffDays = Math.round((new Date(currentFormFecha) - new Date(dia1Iso)) / (1000 * 60 * 60 * 24))
    if (diffDays >= 0 && diffDays <= 25) {
      scheduledDates.push(currentFormFecha)
    }
  }

  return {
    dia1Iso,
    scheduledDates: Array.from(new Set(scheduledDates)).sort(),
    candidateRecords
  }
}

export default function AsistenciaRegularizacionModal({
  isOpen,
  onClose,
  postulante,
  grupoCodigo,
  campana,
  semana,
  formadorDoc,
  formadorNombre,
  asistencias = [],
  groupDates = [],
  grupoObj = null,
  currentFormFecha = null,
  motivosBaja = [],
  isReadOnly = false,
  onRegularizacionSaved
}) {
  const toast = useToast()
  const [recordsState, setRecordsState] = useState([])
  const [originalRecordsMap, setOriginalRecordsMap] = useState(new Map())
  const [isSaving, setIsSaving] = useState(false)
  const [activeDropdownDate, setActiveDropdownDate] = useState(null)
  const [showAddDate, setShowAddDate] = useState(false)
  const [newDateInput, setNewDateInput] = useState('')
  const dropdownRef = useRef(null)

  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], [])
  const profileRow = useMemo(() => ({
    tipo_reclutado: postulante?.tipo_reclutado || postulante?.tipoReclutado || '',
    tipoReclutado: postulante?.tipoReclutado || postulante?.tipo_reclutado || '',
    status_dia_1: postulante?.status_dia_1 || '',
    estado: postulante?.estado || '',
  }), [postulante])

  // Cerrar el selector desplegable al hacer clic fuera
  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setActiveDropdownDate(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // ── Construir la lista exacta de días programados de la capacitación ──
  useEffect(() => {
    if (!isOpen || !postulante) {
      setRecordsState([])
      setOriginalRecordsMap(new Map())
      setShowAddDate(false)
      setNewDateInput('')
      setActiveDropdownDate(null)
      return
    }

    const { dia1Iso, scheduledDates, candidateRecords } = resolveScheduledCohortDays({
      grupoObj,
      grupoCodigo,
      campana: campana || postulante.campana,
      asistencias,
      postulanteDoc: postulante.documento,
      currentFormFecha
    })

    // Mapear registros guardados en la BD del postulante
    const candidateMap = new Map()
    candidateRecords.forEach(a => {
      const parsed = parseFechaAsistencia(a.fecha_asistencia || a.fecha_registro_asistencia || a.fecha)
      if (parsed) {
        candidateMap.set(parsed, {
          sigla: a.sigla_asistencia || a.sigla || 'A',
          motivo_baja: a.motivo_baja || ''
        })
      }
    })

    // Construir los registros de cada día programado
    const list = scheduledDates.map((d, index) => {
      const isDia1 = index === 0
      const existing = candidateMap.get(d)
      const isPastOrToday = d <= todayStr

      let sigla = ''
      let motivo_baja = ''
      let isRegistered = false

      if (existing) {
        sigla = existing.sigla
        motivo_baja = existing.motivo_baja || ''
        isRegistered = true
      } else if (isPastOrToday) {
        // Si el día ya transcurrió o es hoy y no tenía marca previa, se inicializa en 'A'
        sigla = 'A'
        motivo_baja = ''
        isRegistered = false
      } else {
        // Días futuros pendientes por completar
        sigla = ''
        motivo_baja = ''
        isRegistered = false
      }

      return {
        fecha: d,
        sigla,
        motivo_baja,
        isRegistered,
        isDia1,
        dayIndex: index + 1,
      }
    })

    const origMap = new Map()
    list.forEach(r => {
      origMap.set(r.fecha, { sigla: r.sigla, motivo_baja: r.motivo_baja })
    })

    setRecordsState(list)
    setOriginalRecordsMap(origMap)
  }, [isOpen, postulante, grupoCodigo, campana, asistencias, grupoObj, currentFormFecha, todayStr])

  // Detectar cambios realizados por el usuario
  const hasChanges = useMemo(() => {
    if (recordsState.length !== originalRecordsMap.size) return true
    for (const r of recordsState) {
      const orig = originalRecordsMap.get(r.fecha)
      if (!orig) return true
      if (orig.sigla !== r.sigla || (orig.motivo_baja || '') !== (r.motivo_baja || '')) return true
    }
    return false
  }, [recordsState, originalRecordsMap])

  // Contadores de progreso y estado
  const stats = useMemo(() => {
    const total = recordsState.length
    const completados = recordsState.filter(r => Boolean(r.sigla)).length
    const asistenciasCount = recordsState.filter(r => r.sigla === 'A' || r.sigla === 'I-OP').length
    const bajasCount = recordsState.filter(r => r.sigla === 'B').length
    const faltasCount = recordsState.filter(r => r.sigla === 'FI' || r.sigla === 'FJ').length
    const pendientesCount = recordsState.filter(r => !r.sigla).length
    return { total, completados, asistenciasCount, bajasCount, faltasCount, pendientesCount }
  }, [recordsState])

  const handleStatusSelect = (fecha, newSigla) => {
    setRecordsState(prev => prev.map(r => {
      if (r.fecha !== fecha) return r
      let newMotivo = r.motivo_baja
      if (newSigla !== 'B') {
        newMotivo = ''
      } else if (!newMotivo) {
        newMotivo = defaultBajaMotivo({
          trainingDayIndex: r.dayIndex || (r.isDia1 ? 1 : 99),
          row: profileRow,
          existingMotivo: '',
        })
      }
      return { ...r, sigla: newSigla, motivo_baja: newMotivo }
    }))
    setActiveDropdownDate(null)
  }

  const handleMotiveChange = (fecha, newMotivo) => {
    setRecordsState(prev => prev.map(r => {
      if (r.fecha !== fecha) return r
      const previous = originalRecordsMap.get(r.fecha)?.motivo_baja || r.motivo_baja
      const nextMotivo = sanitizeBajaDia1Motivo({
        trainingDayIndex: r.dayIndex || (r.isDia1 ? 1 : 99),
        row: profileRow,
        motivo: newMotivo,
        previousMotivo: previous,
      })
      return { ...r, motivo_baja: nextMotivo }
    }))
  }

  const handleMarkAllAttended = () => {
    setRecordsState(prev => prev.map(r => ({
      ...r,
      sigla: 'A',
      motivo_baja: ''
    })))
  }

  const handleReset = () => {
    setRecordsState(prev => prev.map(r => {
      const orig = originalRecordsMap.get(r.fecha)
      if (!orig) return r
      return { ...r, sigla: orig.sigla, motivo_baja: orig.motivo_baja }
    }))
  }

  const handleAddCustomDate = () => {
    if (!newDateInput) return
    if (recordsState.some(r => r.fecha === newDateInput)) {
      toast.warning('Fecha duplicada', 'Esta fecha ya se encuentra en el calendario.')
      return
    }
    const newRecord = {
      fecha: newDateInput,
      sigla: 'A',
      motivo_baja: '',
      isRegistered: false,
      isDia1: false,
      dayIndex: 99,
    }
    const updated = withDayIndex([...recordsState, newRecord])
    setRecordsState(updated)
    setNewDateInput('')
    setShowAddDate(false)
    toast.info('Fecha añadida', `Se agregó la fecha ${formatPrettyDate(newDateInput)} a la regularización.`)
  }

  const handleSaveRegularizacion = async () => {
    if (isReadOnly) {
      toast.error('Modo solo lectura', 'No tienes permisos para regularizar asistencias.')
      return
    }

    const missingMotive = recordsState.find(r => r.sigla === 'B' && !r.motivo_baja)
    if (missingMotive) {
      toast.warning('Motivo requerido', `Selecciona un motivo de baja para el día ${formatSpreadsheetDate(missingMotive.fecha)}.`)
      return
    }

    const blocked = recordsState.find((r) => {
      if (r.sigla !== 'B' || !isBajaDia1Motivo(r.motivo_baja)) return false
      const previous = originalRecordsMap.get(r.fecha)?.motivo_baja || ''
      const allowed = canAssignBajaDia1({
        trainingDayIndex: r.dayIndex || (r.isDia1 ? 1 : 99),
        row: profileRow,
        existingMotivo: previous,
      })
      return !allowed
    })
    if (blocked) {
      toast.warning(
        'Baja Día 1 no permitida',
        `En ${formatSpreadsheetDate(blocked.fecha)} ya no se puede marcar Baja Día 1. Usa otro motivo de formación.`
      )
      return
    }

    // Solo persistimos días que tengan una sigla definida
    const validRecordsToSave = recordsState.filter(r => Boolean(r.sigla))
    if (validRecordsToSave.length === 0) {
      toast.warning('Sin marcas válidas', 'No hay marcas de asistencia definidas para guardar.')
      return
    }

    setIsSaving(true)
    try {
      const cleanDoc = String(postulante.documento || '').trim()
      const targetGroup = String(grupoCodigo || postulante.grupo || '').trim()

      const res = await regularizarAsistenciaPostulante({
        documento: cleanDoc,
        grupo_codigo: targetGroup,
        campana: campana || postulante.campana || '',
        semana: semana || '',
        formadorDoc,
        formadorNombre,
        postulanteInfo: postulante,
        records: validRecordsToSave
      })

      if (res && res.success) {
        toast.success(
          'Regularización guardada',
          `Asistencia de ${postulante.nombres || cleanDoc} actualizada con éxito.`
        )
        if (onRegularizacionSaved) {
          onRegularizacionSaved({
            documento: cleanDoc,
            updatedRecords: validRecordsToSave
          })
        }
        onClose()
      } else {
        throw new Error(res?.message || 'Error al persistir la regularización')
      }
    } catch (err) {
      console.error('Error al guardar regularización:', err)
      toast.error('Error al guardar', err.message || 'No se pudo guardar la regularización.')
    } finally {
      setIsSaving(false)
    }
  }

  if (!isOpen || !postulante) return null

  const fullName = `${postulante.apellido_paterno || ''} ${postulante.apellido_materno || ''} ${postulante.nombres || ''}`.trim() || 'Postulante'
  const initials = getInitials(fullName)
  const dia1Date = recordsState[0]?.fecha || null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/70 backdrop-blur-xs animate-fadeIn">
      <div 
        className="w-full max-w-6xl rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-[var(--border-normal)] bg-[var(--bg-surface)] text-[var(--text-primary)] max-h-[92vh] animate-slideUp"
        onClick={e => e.stopPropagation()}
      >
        {/* ── 1. HEADER: DATOS DEL POSTULANTE Y RESUMEN ── */}
        <div className="px-6 py-4 border-b border-[var(--border-subtle)] bg-[var(--bg-elevated)]/80 flex flex-wrap items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-11 h-11 rounded-xl bg-cyan-500/15 border border-cyan-500/30 text-cyan-600 dark:text-cyan-400 flex items-center justify-center font-black text-sm font-mono shrink-0 shadow-xs">
              {initials}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-black tracking-tight text-[var(--text-primary)] uppercase truncate">
                  {fullName}
                </h3>
                <span className="text-xs font-mono font-bold text-[var(--text-secondary)] bg-[var(--bg-surface)] px-2.5 py-0.5 rounded-lg border border-[var(--border-subtle)]">
                  DNI: {postulante.documento}
                </span>
                {postulante.tipoReclutado && (
                  <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-md bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/30">
                    {postulante.tipoReclutado}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2.5 text-xs text-[var(--text-muted)] mt-1 flex-wrap">
                <span>Grupo: <strong className="text-[var(--text-primary)] font-mono">{grupoCodigo}</strong></span>
                <span>·</span>
                <span>Campaña: <strong className="text-[var(--text-primary)]">{campana || postulante.campana}</strong></span>
                {dia1Date && (
                  <>
                    <span>·</span>
                    <span className="flex items-center gap-1 text-cyan-600 dark:text-cyan-400 font-semibold">
                      <Calendar size={13} /> Día 1 de inicio: <strong className="underline">{formatPrettyDate(dia1Date)}</strong>
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Estadísticas de días en pills */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-xs font-bold shadow-xs">
              <span className="text-[var(--text-muted)]">Programados:</span>
              <span className="text-[var(--text-primary)] font-mono">{stats.total} días</span>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-xs font-bold shadow-xs">
              <UserCheck size={13} />
              <span>{stats.asistenciasCount} Asist.</span>
            </div>
            {stats.bajasCount > 0 && (
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-400 text-xs font-bold shadow-xs">
                <span>{stats.bajasCount} Baja(s)</span>
              </div>
            )}
            {stats.pendientesCount > 0 && (
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-normal)] text-[var(--text-muted)] text-xs font-semibold shadow-xs">
                <Clock size={12} />
                <span>{stats.pendientesCount} por completar</span>
              </div>
            )}
            <button
              onClick={onClose}
              disabled={isSaving}
              className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] rounded-lg transition-colors cursor-pointer ml-1"
              title="Cerrar modal"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* ── 2. TOOLBAR DE ACCIONES: MARCAR TODO A, AÑADIR FECHA ── */}
        <div className="px-6 py-2.5 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] flex items-center justify-between gap-3 text-xs shrink-0">
          <div className="flex items-center gap-2 text-[var(--text-secondary)] font-medium">
            <span className="font-bold text-[var(--text-primary)]">Control de Asistencia del Postulante:</span>
            <span className="text-[11px] text-[var(--text-muted)]">Haz clic en la marca de cualquier día para regularizarla o cambiarla.</span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleMarkAllAttended}
              disabled={isSaving || isReadOnly}
              className="flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 transition-all cursor-pointer shadow-xs active:scale-95"
              title="Marcar todas las fechas como Asistencia (A)"
            >
              <CheckCheck size={14} />
              <span>Marcar todo A</span>
            </button>

            {hasChanges && (
              <button
                onClick={handleReset}
                disabled={isSaving}
                className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg border border-[var(--border-normal)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                title="Deshacer cambios locales"
              >
                <RotateCcw size={13} />
                <span>Revertir</span>
              </button>
            )}

            {!showAddDate ? (
              <button
                onClick={() => setShowAddDate(true)}
                disabled={isReadOnly || isSaving}
                className="flex items-center gap-1 text-xs font-semibold text-cyan-600 dark:text-cyan-400 hover:underline cursor-pointer ml-1"
              >
                <Plus size={14} />
                <span>Agregar fecha</span>
              </button>
            ) : (
              <div className="flex items-center gap-1.5 bg-[var(--bg-elevated)] px-2 py-1 rounded-lg border border-[var(--border-normal)]">
                <span className="text-[11px] text-[var(--text-muted)]">Fecha:</span>
                <input
                  type="date"
                  value={newDateInput}
                  onChange={e => setNewDateInput(e.target.value)}
                  className="text-xs bg-transparent border-0 outline-none text-[var(--text-primary)] font-mono"
                />
                <button
                  onClick={handleAddCustomDate}
                  disabled={!newDateInput}
                  className="px-2 py-0.5 bg-cyan-600 text-white text-[11px] font-bold rounded cursor-pointer disabled:opacity-40"
                >
                  Añadir
                </button>
                <button
                  onClick={() => { setShowAddDate(false); setNewDateInput(''); }}
                  className="text-[var(--text-muted)] hover:text-[var(--text-primary)] p-0.5 cursor-pointer"
                >
                  <X size={13} />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ── 3. CUERPO: FILA HORIZONTAL DE ASISTENCIA (ESTILO CONTROL DE ASISTENCIA) ── */}
        <div className="flex-1 overflow-x-auto p-6 custom-scrollbar bg-[var(--bg-base)]/20 flex flex-col justify-center min-h-[220px]">
          {recordsState.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center text-[var(--text-muted)] space-y-2 border border-dashed border-[var(--border-normal)] rounded-xl">
              <Calendar size={28} className="opacity-40" />
              <p className="text-xs font-medium">No se encontraron fechas de capacitación para este grupo.</p>
              <p className="text-[11px]">Usa el botón "+ Agregar fecha" para iniciar la regularización.</p>
            </div>
          ) : (
            <div className="w-full min-w-max pb-2">
              {/* Tabla horizontal de una sola fila */}
              <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-lg">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-[var(--bg-elevated)] border-b border-[var(--border-subtle)]">
                      {recordsState.map((rec, index) => {
                        const diaNum = index + 1
                        const dayShort = getDayOfWeekShort(rec.fecha)
                        const isDia1 = index === 0
                        const isToday = rec.fecha === todayStr

                        return (
                          <th 
                            key={rec.fecha}
                            className={`px-3 py-3 text-center border-r border-[var(--border-subtle)] last:border-r-0 min-w-[125px] ${
                              isDia1 ? 'bg-cyan-500/10' : isToday ? 'bg-cyan-500/5' : ''
                            }`}
                          >
                            <div className="flex flex-col items-center gap-0.5">
                              <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded font-mono ${
                                isDia1 
                                  ? 'bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 border border-cyan-500/40' 
                                  : 'bg-[var(--bg-surface)] text-[var(--text-secondary)] border border-[var(--border-subtle)]'
                              }`}>
                                DÍA {String(diaNum).padStart(2, '0')}
                              </span>
                              <span className="text-xs font-bold text-[var(--text-primary)] mt-1">
                                {dayShort}, {formatShortDate(rec.fecha)}
                              </span>
                              <span className="text-[9px] font-mono text-[var(--text-muted)]">
                                {formatSpreadsheetDate(rec.fecha)}
                              </span>
                              {isToday && (
                                <span className="text-[8px] font-black uppercase text-cyan-600 dark:text-cyan-400 mt-0.5">
                                  ● HOY
                                </span>
                              )}
                            </div>
                          </th>
                        )
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="divide-x divide-[var(--border-subtle)]">
                      {recordsState.map((rec, index) => {
                        const isBaja = rec.sigla === 'B'
                        const isPending = !rec.sigla
                        const siglaConfig = SIGLAS.find(s => s.value === rec.sigla)
                        const isModified = originalRecordsMap.has(rec.fecha) && (
                          originalRecordsMap.get(rec.fecha).sigla !== rec.sigla ||
                          (originalRecordsMap.get(rec.fecha).motivo_baja || '') !== (rec.motivo_baja || '')
                        )
                        const isDropdownOpen = activeDropdownDate === rec.fecha

                        return (
                          <td 
                            key={rec.fecha}
                            className={`p-3 text-center align-top relative transition-colors ${
                              isModified ? 'bg-cyan-500/5' : isBaja ? 'bg-rose-500/5' : ''
                            }`}
                          >
                            <div className="flex flex-col items-center justify-between min-h-[95px] gap-2">
                              {/* Selector Directo de Marca / Sigla (Garantiza 100% visibilidad de A, I-OP, FI, FJ, B) */}
                              <div className="relative w-full">
                                <select
                                  value={rec.sigla || ''}
                                  onChange={e => handleStatusSelect(rec.fecha, e.target.value)}
                                  disabled={isReadOnly || isSaving}
                                  className={`w-full py-2 pl-2.5 pr-6 rounded-xl border text-center font-bold text-xs outline-none cursor-pointer transition-all shadow-xs appearance-none font-mono ${
                                    isPending
                                      ? 'border-dashed border-[var(--border-normal)] text-[var(--text-muted)] bg-[var(--bg-elevated)]/60 hover:border-cyan-500 hover:text-cyan-400'
                                      : `${siglaConfig?.bg || 'bg-[var(--bg-elevated)]'} ${siglaConfig?.border || 'border-[var(--border-normal)]'} ${siglaConfig?.text || 'text-[var(--text-primary)]'} hover:brightness-110`
                                  } ${isModified ? 'ring-2 ring-cyan-500/60 font-black' : ''}`}
                                  title="Haz clic para seleccionar: A, I-OP, FI, FJ o B"
                                >
                                  <option value="" className="bg-slate-900 text-slate-400 font-sans">
                                    — Pendiente
                                  </option>
                                  <option value="A" className="bg-slate-900 text-emerald-400 font-bold font-sans">
                                    A · Asistencia (Asistió)
                                  </option>
                                  <option value="I-OP" className="bg-slate-900 text-blue-400 font-bold font-sans">
                                    I-OP · Ingreso Operación
                                  </option>
                                  <option value="FI" className="bg-slate-900 text-amber-400 font-bold font-sans">
                                    FI · Falta Injustificada
                                  </option>
                                  <option value="FJ" className="bg-slate-900 text-violet-400 font-bold font-sans">
                                    FJ · Falta Justificada
                                  </option>
                                  <option value="B" className="bg-slate-900 text-rose-400 font-bold font-sans">
                                    B · Baja
                                  </option>
                                </select>
                                <div className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-current opacity-70">
                                  <ChevronDown size={13} />
                                </div>
                              </div>

                              {/* Si es BAJA [B], selector compacto del motivo de baja */}
                              {isBaja ? (
                                <div className="w-full mt-1 animate-fadeIn">
                                  <select
                                    value={rec.motivo_baja || ''}
                                    onChange={e => handleMotiveChange(rec.fecha, e.target.value)}
                                    disabled={isReadOnly || isSaving}
                                    className="w-full py-1 px-1.5 text-[10px] font-bold rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-600 dark:text-rose-400 focus:border-rose-500 outline-none cursor-pointer truncate"
                                    title="Motivo de Baja"
                                  >
                                    <option value="">-- Motivo --</option>
                                    {canAssignBajaDia1({
                                      trainingDayIndex: rec.dayIndex || (isDia1 ? 1 : 99),
                                      row: profileRow,
                                      existingMotivo: rec.motivo_baja,
                                    }) ? (
                                      <option value="BAJA DIA 1">BAJA DIA 1</option>
                                    ) : null}
                                    <option value="OBSERVADO">OBSERVADO</option>
                                    <option value="SOBREDOTACIÓN">SOBREDOTACIÓN</option>
                                    <option value="DESERCIÓN">DESERCIÓN</option>
                                    {motivosBaja
                                      .filter(m => !['BAJA DIA 1', 'OBSERVADO', 'SOBREDOTACIÓN', 'DESERCIÓN'].includes(m.motivo))
                                      .map(m => (
                                        <option key={m.id || m.motivo} value={m.motivo}>
                                          {m.motivo}
                                        </option>
                                      ))}
                                  </select>
                                </div>
                              ) : (
                                <div className="text-[10px] text-[var(--text-muted)] flex items-center justify-center h-6">
                                  {isPending ? (
                                    <span className="italic opacity-60">Por completar</span>
                                  ) : isModified ? (
                                    <span className="font-bold text-cyan-600 dark:text-cyan-400">Editado</span>
                                  ) : (
                                    <span>{rec.isRegistered ? 'Guardado' : 'Asignado'}</span>
                                  )}
                                </div>
                              )}
                            </div>
                          </td>
                        )
                      })}
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Leyenda rápida de Estados de Asistencia */}
              <div className="mt-3.5 flex flex-wrap items-center justify-center gap-2 text-[11px] text-[var(--text-secondary)]">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] mr-1">
                  Leyenda de Marcas:
                </span>
                {SIGLAS.map(s => (
                  <div key={s.value} className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
                    <span className={`font-mono font-black text-[10px] px-1 rounded ${s.bg} ${s.text}`}>
                      {s.value}
                    </span>
                    <span className="text-[10px] font-medium text-[var(--text-secondary)]">
                      {s.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── 4. FOOTER: ESTADO DE MODIFICACIONES Y BOTONES DE GUARDADO ── */}
        <div className="px-6 py-3.5 border-t border-[var(--border-subtle)] bg-[var(--bg-elevated)]/60 flex items-center justify-between gap-3 shrink-0">
          <div className="text-xs text-[var(--text-muted)]">
            {hasChanges ? (
              <span className="text-cyan-600 dark:text-cyan-400 font-bold flex items-center gap-1.5">
                <AlertCircle size={15} /> Tienes modificaciones listas para regularizar y sincronizar
              </span>
            ) : (
              <span>Sin modificaciones pendientes</span>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2 rounded-xl border border-[var(--border-normal)] text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-muted)] transition-colors cursor-pointer"
            >
              Cancelar
            </button>

            <button
              onClick={handleSaveRegularizacion}
              disabled={isSaving || isReadOnly || !hasChanges}
              className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 active:scale-95 text-white font-bold text-xs shadow-md transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              <span>{isSaving ? 'Guardando regularización...' : 'Guardar Regularización'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
