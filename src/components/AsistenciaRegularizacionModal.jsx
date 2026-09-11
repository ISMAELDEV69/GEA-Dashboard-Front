import React, { useState, useEffect, useMemo } from 'react'
import {
  X,
  Calendar,
  Save,
  Loader2,
  AlertCircle,
  Plus,
  Trash2,
  CheckCheck,
  RotateCcw
} from 'lucide-react'
import { regularizarAsistenciaPostulante, parseFechaAsistencia } from '../lib/dataService'
import { useToast } from '../context/ToastContext'

const SIGLAS = [
  { value: 'A', label: 'Asistencia', short: 'A', activeClass: 'bg-emerald-600 text-white font-black border-emerald-600' },
  { value: 'I-OP', label: 'Ingreso Op.', short: 'I-OP', activeClass: 'bg-blue-600 text-white font-black border-blue-600' },
  { value: 'FI', label: 'Falta Injust.', short: 'FI', activeClass: 'bg-amber-600 text-white font-black border-amber-600' },
  { value: 'FJ', label: 'Falta Just.', short: 'FJ', activeClass: 'bg-violet-600 text-white font-black border-violet-600' },
  { value: 'B', label: 'Baja', short: 'B', activeClass: 'bg-rose-600 text-white font-black border-rose-600' }
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

function getDayOfWeek(dateStr) {
  if (!dateStr) return ''
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
  return days[dt.getUTCDay()]
}

function getInitials(name = '') {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'P'
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase()
  return (parts[0][0] + parts[1][0]).toUpperCase()
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
  motivosBaja = [],
  isReadOnly = false,
  onRegularizacionSaved
}) {
  const toast = useToast()
  const [recordsState, setRecordsState] = useState([])
  const [originalRecordsMap, setOriginalRecordsMap] = useState(new Map())
  const [isSaving, setIsSaving] = useState(false)
  const [newDateInput, setNewDateInput] = useState('')
  const [showAddDate, setShowAddDate] = useState(false)

  // Construir el historial inicial de fechas para este postulante
  useEffect(() => {
    if (!isOpen || !postulante) {
      setRecordsState([])
      setOriginalRecordsMap(new Map())
      setShowAddDate(false)
      setNewDateInput('')
      return
    }

    const cleanDoc = String(postulante.documento || '').trim()
    const targetGrupo = String(grupoCodigo || postulante.grupo || '').trim().toUpperCase()

    // 1. Filtrar registros del postulante en este grupo
    const docRecords = asistencias.filter(a => {
      const matchDoc = String(a.postulante_documento || a.documento || '').trim() === cleanDoc
      const aGrupo = String(a.grupo_codigo || a.codigo_grupo || a.grupo || '').trim().toUpperCase()
      const matchGrupo = !targetGrupo || !aGrupo || aGrupo === targetGrupo
      return matchDoc && matchGrupo
    })

    const recordsByDate = new Map()

    docRecords.forEach(a => {
      const parsed = parseFechaAsistencia(a.fecha_asistencia || a.fecha_registro_asistencia || a.fecha) || a.fecha_asistencia
      if (parsed) {
        recordsByDate.set(parsed, {
          fecha: parsed,
          sigla: a.sigla_asistencia || a.sigla || 'A',
          motivo_baja: a.motivo_baja || '',
          origen: 'bd'
        })
      }
    })

    // 2. Incluir fechas del grupo que correspondan
    ;(groupDates || []).forEach(d => {
      if (d && !recordsByDate.has(d)) {
        recordsByDate.set(d, {
          fecha: d,
          sigla: 'A',
          motivo_baja: '',
          origen: 'grupo'
        })
      }
    })

    // 3. Ordenar cronológicamente ascendente
    const sortedList = Array.from(recordsByDate.values()).sort((a, b) => a.fecha.localeCompare(b.fecha))

    const origMap = new Map()
    sortedList.forEach(r => {
      origMap.set(r.fecha, { sigla: r.sigla, motivo_baja: r.motivo_baja })
    })

    setRecordsState(sortedList)
    setOriginalRecordsMap(origMap)
  }, [isOpen, postulante, grupoCodigo, asistencias, groupDates])

  // Detectar cambios realizados
  const hasChanges = useMemo(() => {
    if (recordsState.length !== originalRecordsMap.size) return true
    for (const r of recordsState) {
      const orig = originalRecordsMap.get(r.fecha)
      if (!orig) return true
      if (orig.sigla !== r.sigla || (orig.motivo_baja || '') !== (r.motivo_baja || '')) return true
    }
    return false
  }, [recordsState, originalRecordsMap])

  const handleStatusChange = (fecha, newSigla) => {
    setRecordsState(prev => prev.map(r => {
      if (r.fecha !== fecha) return r
      let newMotivo = r.motivo_baja
      if (newSigla !== 'B') {
        newMotivo = ''
      } else if (!newMotivo) {
        newMotivo = 'DESERCIÓN'
      }
      return { ...r, sigla: newSigla, motivo_baja: newMotivo }
    }))
  }

  const handleMotiveChange = (fecha, newMotivo) => {
    setRecordsState(prev => prev.map(r => {
      if (r.fecha !== fecha) return r
      return { ...r, motivo_baja: newMotivo }
    }))
  }

  const handleAddCustomDate = () => {
    if (!newDateInput) return
    if (recordsState.some(r => r.fecha === newDateInput)) {
      toast.warning('Fecha duplicada', 'Esta fecha ya se encuentra en el historial.')
      return
    }
    const newRecord = {
      fecha: newDateInput,
      sigla: 'A',
      motivo_baja: '',
      origen: 'manual'
    }
    const updated = [...recordsState, newRecord].sort((a, b) => a.fecha.localeCompare(b.fecha))
    setRecordsState(updated)
    setNewDateInput('')
    setShowAddDate(false)
    toast.info('Fecha añadida', `Se agregó la fecha ${formatPrettyDate(newDateInput)} a la regularización.`)
  }

  const handleRemoveDate = (fecha) => {
    setRecordsState(prev => prev.filter(r => r.fecha !== fecha))
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
        records: recordsState
      })

      if (res && res.success) {
        toast.success(
          'Regularización guardada',
          `Asistencia de ${postulante.nombres || cleanDoc} actualizada con éxito.`
        )
        if (onRegularizacionSaved) {
          onRegularizacionSaved({
            documento: cleanDoc,
            updatedRecords: recordsState
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-xs animate-fadeIn">
      <div 
        className="w-full max-w-5xl rounded-xl shadow-2xl flex flex-col overflow-hidden border border-[var(--border-normal)] bg-[var(--bg-surface)] text-[var(--text-primary)] max-h-[92vh] animate-slideUp"
        onClick={e => e.stopPropagation()}
      >
        {/* ── HEADER MINIMALISTA ── */}
        <div className="px-6 py-4 border-b border-[var(--border-subtle)] bg-[var(--bg-elevated)]/70 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-10 h-10 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-normal)] text-[var(--text-primary)] flex items-center justify-center font-bold text-xs font-mono shrink-0 shadow-xs">
              {initials}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm font-bold tracking-tight text-[var(--text-primary)] uppercase truncate">
                  {fullName}
                </h3>
                <span className="text-[11px] font-mono text-[var(--text-secondary)] bg-[var(--bg-surface)] px-2 py-0.5 rounded border border-[var(--border-subtle)]">
                  DNI: {postulante.documento}
                </span>
                {postulante.tipoReclutado && (
                  <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded bg-[var(--bg-surface)] text-[var(--text-muted)] border border-[var(--border-subtle)]">
                    {postulante.tipoReclutado}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 text-xs text-[var(--text-muted)] mt-0.5">
                <span>Grupo: <strong className="text-[var(--text-secondary)] font-mono">{grupoCodigo}</strong></span>
                {campana && <span>· Campaña: <strong className="text-[var(--text-secondary)]">{campana}</strong></span>}
                {dia1Date && (
                  <span>· Día 1 de inicio: <strong className="text-cyan-600 dark:text-cyan-400">{formatPrettyDate(dia1Date)}</strong></span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleMarkAllAttended}
              disabled={isSaving || isReadOnly}
              className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg border border-[var(--border-normal)] hover:bg-[var(--bg-muted)] text-[var(--text-secondary)] transition-colors cursor-pointer"
              title="Marcar todas las fechas como Asistencia (A)"
            >
              <CheckCheck size={13} />
              <span>Marcar todo A</span>
            </button>
            {hasChanges && (
              <button
                onClick={handleReset}
                disabled={isSaving}
                className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg border border-[var(--border-normal)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                title="Deshacer cambios locales"
              >
                <RotateCcw size={12} />
                <span>Revertir</span>
              </button>
            )}
            <button
              onClick={onClose}
              disabled={isSaving}
              className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] rounded-lg transition-colors cursor-pointer ml-1"
              title="Cerrar"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* ── SUB-BARRA DE ESTADO Y ACCIONES DE FECHA ── */}
        <div className="px-6 py-2.5 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] flex items-center justify-between gap-3 text-xs shrink-0">
          <div className="flex items-center gap-2 text-[var(--text-muted)]">
            <Calendar size={13} className="text-[var(--text-secondary)]" />
            <span>Calendario horizontal de capacitación ({recordsState.length} {recordsState.length === 1 ? 'día' : 'días'})</span>
          </div>

          {!showAddDate ? (
            <button
              onClick={() => setShowAddDate(true)}
              disabled={isReadOnly || isSaving}
              className="flex items-center gap-1 text-xs font-medium text-cyan-600 dark:text-cyan-400 hover:underline cursor-pointer"
            >
              <Plus size={13} />
              <span>Agregar fecha adicional</span>
            </button>
          ) : (
            <div className="flex items-center gap-1.5 bg-[var(--bg-elevated)] px-2 py-1 rounded-lg border border-[var(--border-normal)]">
              <span className="text-[11px] text-[var(--text-muted)]">Nueva fecha:</span>
              <input
                type="date"
                value={newDateInput}
                onChange={e => setNewDateInput(e.target.value)}
                className="text-xs bg-transparent border-0 outline-none text-[var(--text-primary)] font-mono"
              />
              <button
                onClick={handleAddCustomDate}
                disabled={!newDateInput}
                className="px-2 py-0.5 bg-[var(--text-primary)] text-[var(--bg-surface)] text-[11px] font-bold rounded cursor-pointer disabled:opacity-30"
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

        {/* ── CUERPO: CALENDARIO HORIZONTAL DE DÍAS ── */}
        <div className="flex-1 overflow-x-auto overflow-y-hidden p-6 custom-scrollbar bg-[var(--bg-base)]/30">
          {recordsState.length === 0 ? (
            <div className="h-48 flex flex-col items-center justify-center text-[var(--text-muted)] space-y-2 border border-dashed border-[var(--border-normal)] rounded-xl">
              <Calendar size={24} className="opacity-40" />
              <p className="text-xs font-medium">No se encontraron fechas de asistencia para este postulante.</p>
              <p className="text-[11px]">Usa el botón "Agregar fecha adicional" para iniciar la regularización.</p>
            </div>
          ) : (
            <div className="flex items-stretch gap-3 min-w-max pb-2">
              {recordsState.map((rec, index) => {
                const diaNumero = index + 1
                const isDia1 = index === 0
                const isBaja = rec.sigla === 'B'
                const dayName = getDayOfWeek(rec.fecha)
                const isModified = originalRecordsMap.has(rec.fecha) && (
                  originalRecordsMap.get(rec.fecha).sigla !== rec.sigla ||
                  (originalRecordsMap.get(rec.fecha).motivo_baja || '') !== (rec.motivo_baja || '')
                )

                return (
                  <div
                    key={rec.fecha}
                    className={`w-52 rounded-xl border flex flex-col justify-between p-3.5 transition-all bg-[var(--bg-surface)] ${
                      isModified
                        ? 'border-cyan-500 shadow-sm ring-1 ring-cyan-500/30'
                        : isBaja
                        ? 'border-rose-500/40'
                        : 'border-[var(--border-subtle)] hover:border-[var(--border-normal)]'
                    }`}
                  >
                    {/* Encabezado del Día */}
                    <div className="pb-3 border-b border-[var(--border-subtle)]">
                      <div className="flex items-center justify-between mb-1">
                        <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded font-mono ${
                          isDia1 
                            ? 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 border border-cyan-500/30'
                            : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] border border-[var(--border-subtle)]'
                        }`}>
                          DÍA {String(diaNumero).padStart(2, '0')}
                        </span>
                        
                        {rec.origen === 'manual' && (
                          <button
                            onClick={() => handleRemoveDate(rec.fecha)}
                            className="text-[var(--text-muted)] hover:text-rose-500 transition-colors p-0.5 cursor-pointer"
                            title="Quitar fecha añadida manualmente"
                          >
                            <Trash2 size={12} />
                          </button>
                        )}

                        {isModified && (
                          <span className="text-[9px] font-bold text-cyan-600 dark:text-cyan-400">
                            Editado
                          </span>
                        )}
                      </div>

                      <div className="text-xs font-bold text-[var(--text-primary)] mt-1.5">
                        {dayName}, {formatPrettyDate(rec.fecha)}
                      </div>
                      <div className="text-[10px] font-mono text-[var(--text-muted)]">
                        {formatSpreadsheetDate(rec.fecha)}
                      </div>
                    </div>

                    {/* Selector Horizontal de Sigla (Botones Segmentados de 1 Clic) */}
                    <div className="py-3">
                      <label className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider block mb-1.5">
                        Estado:
                      </label>
                      <div className="grid grid-cols-5 gap-1 bg-[var(--bg-elevated)] p-1 rounded-lg border border-[var(--border-subtle)]">
                        {SIGLAS.map(s => {
                          const isSelected = rec.sigla === s.value
                          return (
                            <button
                              key={s.value}
                              type="button"
                              onClick={() => handleStatusChange(rec.fecha, s.value)}
                              disabled={isReadOnly || isSaving}
                              title={s.label}
                              className={`py-1 text-[11px] rounded transition-all cursor-pointer text-center font-mono ${
                                isSelected
                                  ? s.activeClass
                                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)]'
                              }`}
                            >
                              {s.short}
                            </button>
                          )
                        })}
                      </div>

                      {/* Motivo de Baja si es B */}
                      {isBaja ? (
                        <div className="mt-2.5">
                          <label className="text-[10px] font-bold text-rose-600 dark:text-rose-400 uppercase tracking-wider block mb-1">
                            Motivo de Baja:
                          </label>
                          <select
                            value={rec.motivo_baja || ''}
                            onChange={e => handleMotiveChange(rec.fecha, e.target.value)}
                            disabled={isReadOnly || isSaving}
                            className="w-full py-1 px-2 text-xs font-medium rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-400 focus:border-rose-500 outline-none cursor-pointer truncate"
                          >
                            <option value="">-- Seleccionar --</option>
                            <option value="BAJA DIA 1">BAJA DIA 1</option>
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
                        <div className="mt-2.5 h-6 flex items-center">
                          <span className="text-[11px] text-[var(--text-muted)] truncate">
                            {SIGLAS.find(s => s.value === rec.sigla)?.label}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Pie de Tarjeta del Día */}
                    <div className="pt-2 border-t border-[var(--border-subtle)] text-[10px] text-[var(--text-muted)] flex items-center justify-between">
                      <span>{isDia1 ? 'Primer día' : `Día ${diaNumero}`}</span>
                      <span className="font-mono">{rec.sigla}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* ── FOOTER ACTIONS MINIMALISTA ── */}
        <div className="px-6 py-3.5 border-t border-[var(--border-subtle)] bg-[var(--bg-elevated)]/60 flex items-center justify-between gap-3 shrink-0">
          <div className="text-xs text-[var(--text-muted)]">
            {hasChanges ? (
              <span className="text-cyan-600 dark:text-cyan-400 font-medium flex items-center gap-1.5">
                <AlertCircle size={14} /> Tienes modificaciones pendientes para este postulante
              </span>
            ) : (
              <span>Sin modificaciones pendientes</span>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-1.5 rounded-lg border border-[var(--border-normal)] text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-muted)] transition-colors cursor-pointer"
            >
              Cancelar
            </button>

            <button
              onClick={handleSaveRegularizacion}
              disabled={isSaving || isReadOnly || !hasChanges}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-[var(--text-primary)] text-[var(--bg-surface)] font-bold text-xs hover:opacity-90 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              {isSaving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
              <span>{isSaving ? 'Guardando...' : 'Guardar Regularización'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
