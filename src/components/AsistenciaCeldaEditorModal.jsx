import React, { useState, useEffect } from 'react'
import {
  X,
  Calendar,
  Save,
  Trash2,
  AlertCircle,
  Loader2,
  CheckCircle2,
  User,
  ShieldCheck,
  CheckSquare,
  Square,
  Sparkles,
  Layers
} from 'lucide-react'
import {
  guardarAsistenciaLoteFechas,
  eliminarAsistenciaLoteFechas
} from '../lib/dataService'

const SIGLAS_OPCIONES = [
  {
    value: 'A',
    label: 'Asistencia (Presente)',
    short: 'A',
    bg: 'bg-emerald-500/15',
    text: 'text-emerald-400',
    border: 'border-emerald-500/40',
    selectedStyle: 'bg-emerald-600 text-white border-emerald-400 ring-2 ring-emerald-400/50'
  },
  {
    value: 'FI',
    label: 'Falta Injustificada',
    short: 'FI',
    bg: 'bg-amber-500/15',
    text: 'text-amber-400',
    border: 'border-amber-500/40',
    selectedStyle: 'bg-amber-600 text-white border-amber-400 ring-2 ring-amber-400/50'
  },
  {
    value: 'FJ',
    label: 'Falta Justificada',
    short: 'FJ',
    bg: 'bg-violet-500/15',
    text: 'text-violet-400',
    border: 'border-violet-500/40',
    selectedStyle: 'bg-violet-600 text-white border-violet-400 ring-2 ring-violet-400/50'
  },
  {
    value: 'I-OP',
    label: 'Ingreso a Operaciones',
    short: 'I-OP',
    bg: 'bg-blue-500/15',
    text: 'text-blue-400',
    border: 'border-blue-500/40',
    selectedStyle: 'bg-blue-600 text-white border-blue-400 ring-2 ring-blue-400/50'
  },
  {
    value: 'B',
    label: 'Baja (Cesado / Deserción)',
    short: 'B',
    bg: 'bg-rose-500/15',
    text: 'text-rose-400',
    border: 'border-rose-500/40',
    selectedStyle: 'bg-rose-600 text-white border-rose-400 ring-2 ring-rose-400/50'
  }
]

const MOTIVOS_DEFAULT = [
  'DESERCIÓN',
  'RETIRO VOLUNTARIO',
  'OBSERVADO',
  'SOBREDOTACIÓN',
  'BAJA DIA 1',
  'PROBLEMAS TECNOLÓGICOS / CONECTIVIDAD',
  'NO CUMPLE PERFIL',
  'OTRO'
]

const STATUS_BADGE_STYLE = {
  'A': 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  'FI': 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  'FJ': 'bg-violet-500/20 text-violet-400 border-violet-500/30',
  'I-OP': 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  'B': 'bg-rose-500/20 text-rose-400 border-rose-500/30',
}

export default function AsistenciaCeldaEditorModal({
  isOpen,
  onClose,
  cellData, // { documento, nombre_completo, gpe, campana, semana, fecha, siglaActual, rowInfo, allCohortDates, personFechas }
  motivosBaja = [],
  onSaved,
  onDeleted
}) {
  const [selectedDates, setSelectedDates] = useState(new Set())
  const [selectedSigla, setSelectedSigla] = useState('A')
  const [motivoBaja, setMotivoBaja] = useState('DESERCIÓN')
  const [otroMotivo, setOtroMotivo] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [errorMsg, setErrorMsg] = useState(null)
  const [successMsg, setSuccessMsg] = useState(null)

  const cohortDates = cellData?.allCohortDates || (cellData?.fecha ? [cellData.fecha] : [])
  const personFechas = cellData?.personFechas || {}

  useEffect(() => {
    if (isOpen && cellData) {
      // Iniciar con la fecha donde se hizo clic seleccionada
      setSelectedDates(new Set([cellData.fecha]))
      setSelectedSigla(cellData.siglaActual || 'A')
      setMotivoBaja('DESERCIÓN')
      setOtroMotivo('')
      setErrorMsg(null)
      setSuccessMsg(null)
    }
  }, [isOpen, cellData])

  if (!isOpen || !cellData) return null

  const listaMotivos = motivosBaja?.length
    ? motivosBaja.map(m => (typeof m === 'string' ? m : m.motivo || m.nombre)).filter(Boolean)
    : MOTIVOS_DEFAULT

  // Toggles de selección de fechas
  const toggleDate = (date) => {
    setSelectedDates(prev => {
      const next = new Set(prev)
      if (next.has(date)) {
        if (next.size > 1) next.delete(date) // mantener al menos 1
      } else {
        next.add(date)
      }
      return next
    })
  }

  const selectAllDates = () => {
    setSelectedDates(new Set(cohortDates))
  }

  const selectOnlyGaps = () => {
    const gaps = cohortDates.filter(d => !personFechas[d] || personFechas[d] === '—')
    if (gaps.length > 0) {
      setSelectedDates(new Set(gaps))
    }
  }

  const selectOnlyClickedDate = () => {
    setSelectedDates(new Set([cellData.fecha]))
  }

  const fechasArray = Array.from(selectedDates)

  // Guardar en lote o individual
  const handleGuardar = async () => {
    if (fechasArray.length === 0) {
      setErrorMsg('Debes seleccionar al menos una fecha.')
      return
    }

    setSaving(true)
    setErrorMsg(null)
    setSuccessMsg(null)

    const finalMotivo = selectedSigla === 'B' 
      ? (motivoBaja === 'OTRO' ? otroMotivo.trim() || 'DESERCIÓN' : motivoBaja)
      : ''

    // Actualización reactiva instantánea: cerramos modal y notificamos de inmediato al componente padre
    onSaved?.({
      documento: cellData.documento,
      fechas: fechasArray,
      sigla: selectedSigla,
      motivo_baja: finalMotivo
    })

    try {
      // Ejecución estricta en base de datos en segundo plano
      const res = await guardarAsistenciaLoteFechas({
        documento: cellData.documento,
        grupo_codigo: cellData.gpe,
        campana: cellData.campana,
        semana: cellData.semana,
        periodo: cellData.periodo,
        segmento: cellData.segmento,
        fechas: fechasArray,
        sigla: selectedSigla,
        motivo_baja: finalMotivo,
        postulanteInfo: cellData.rowInfo || {},
        usuarioRegistro: 'ADMINISTRADOR'
      })

      if (!res.success) {
        console.error('Aviso al guardar en lote:', res.message)
      }
      onClose()
    } catch (err) {
      console.error('Error guardando en Supabase:', err)
      setErrorMsg(err.message || 'Error al guardar la asistencia.')
    } finally {
      setSaving(false)
    }
  }

  // Eliminar en lote o individual con alcance estrictamente delimitado
  const handleEliminar = async () => {
    if (fechasArray.length === 0) return

    const confirmPrompt = `¿Confirmas la ELIMINACIÓN ESTRICTA de ${fechasArray.length} fecha(s) para este postulante?\n\nEsta operación solo afectará a:\n• Postulante: ${cellData.nombre_completo} (DNI: ${cellData.documento})\n• Período: ${cellData.periodo || '—'}\n• Semana: ${cellData.semana || '—'}\n• Segmento: ${cellData.segmento || '—'}\n• Campaña: ${cellData.campana || '—'}\n• Grupo (GPE): ${cellData.gpe || '—'}\n• Fechas: ${fechasArray.join(', ')}\n\nLas celdas volverán a quedar vacías (—). Ningún otro grupo, campaña ni usuario será modificado.`

    if (!window.confirm(confirmPrompt)) return

    setDeleting(true)
    setErrorMsg(null)

    // Actualización reactiva instantánea: limpiamos celdas de inmediato en la tabla en <5ms
    onDeleted?.({
      documento: cellData.documento,
      fechas: fechasArray
    })

    try {
      // Ejecución estricta en base de datos en segundo plano
      const res = await eliminarAsistenciaLoteFechas({
        documento: cellData.documento,
        grupo_codigo: cellData.gpe,
        campana: cellData.campana,
        semana: cellData.semana,
        periodo: cellData.periodo,
        segmento: cellData.segmento,
        fechas: fechasArray
      })

      if (!res.success) {
        console.error('Aviso al eliminar en lote:', res.message)
      }
      onClose()
    } catch (err) {
      console.error('Error eliminando en Supabase:', err)
      setErrorMsg(err.message || 'Error al eliminar la asistencia.')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-xl bg-[var(--bg-surface,#111827)] border border-[var(--border-normal,#374151)] rounded-2xl shadow-2xl overflow-hidden text-[var(--text-primary,#f3f4f6)] animate-scaleIn max-h-[92vh] flex flex-col">
        
        {/* Cabecera */}
        <div className="flex items-center justify-between px-6 py-3.5 border-b border-[var(--border-subtle,#1f2937)] bg-[var(--bg-elevated,#1e293b)] shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <ShieldCheck size={20} />
            </div>
            <div>
              <h3 className="text-sm font-bold tracking-tight text-white flex items-center gap-2">
                Edición Reactiva de Asistencia
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
                  Solo Admin
                </span>
              </h3>
              <p className="text-xs text-[var(--text-muted,#9ca3af)]">
                Modificación estrictamente acotada a este usuario, periodo, semana, segmento, campaña y grupo
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={saving || deleting}
            className="text-[var(--text-muted,#9ca3af)] hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Contenido con scroll independiente */}
        <div className="p-6 space-y-4 overflow-y-auto">
          
          {/* Ficha contextual del postulante con alcance estricto */}
          <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <User size={14} className="text-cyan-400" />
                <span className="text-xs font-bold text-white uppercase">{cellData.nombre_completo}</span>
              </div>
              <span className="font-mono text-xs font-semibold text-slate-400">DNI: {cellData.documento}</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-2 border-t border-slate-800/80 text-[11px]">
              <div>
                <span className="block text-[10px] text-slate-500 uppercase font-semibold">Período / Semana</span>
                <span className="font-mono font-bold text-slate-300 truncate block">
                  {cellData.periodo || '—'} / {cellData.semana || '—'}
                </span>
              </div>
              <div>
                <span className="block text-[10px] text-slate-500 uppercase font-semibold">Segmento / Campaña</span>
                <span className="font-bold text-slate-300 truncate block">
                  {cellData.segmento || '—'} - {cellData.campana || '—'}
                </span>
              </div>
              <div>
                <span className="block text-[10px] text-slate-500 uppercase font-semibold">Grupo (GPE)</span>
                <span className="font-mono font-bold text-cyan-300">{cellData.gpe || '—'}</span>
              </div>
              <div className="col-span-2 sm:col-span-3 pt-1 border-t border-slate-800/50 flex items-center justify-between">
                <span className="text-[10px] text-slate-500 uppercase font-semibold">Fechas seleccionadas:</span>
                <span className="font-bold text-cyan-400 flex items-center gap-1 text-[11px]">
                  <Layers size={12} /> {selectedDates.size} de {cohortDates.length} días de la cohorte
                </span>
              </div>
            </div>
          </div>

          {/* Selector Múltiple de Fechas de la Cohorte */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                <Calendar size={13} className="text-cyan-400" />
                Fechas a Afectar:
              </label>

              {/* Botones de selección rápida */}
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={selectAllDates}
                  className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
                >
                  Todas
                </button>
                <button
                  type="button"
                  onClick={selectOnlyGaps}
                  className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 transition-colors"
                >
                  Solo Huecos (—)
                </button>
                <button
                  type="button"
                  onClick={selectOnlyClickedDate}
                  className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-800 hover:bg-slate-700 text-slate-400 border border-slate-700 transition-colors"
                >
                  Solo Esta
                </button>
              </div>
            </div>

            {/* Grid de Chips de Fechas */}
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5 max-h-36 overflow-y-auto p-2 bg-black/20 rounded-xl border border-slate-800">
              {cohortDates.map(d => {
                const isSelected = selectedDates.has(d)
                const currentSigla = personFechas[d] || '—'
                const badgeStyle = STATUS_BADGE_STYLE[currentSigla] || 'bg-slate-800 text-slate-400 border-slate-700'

                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => toggleDate(d)}
                    className={`flex items-center justify-between px-2 py-1.5 rounded-lg border text-[11px] font-mono transition-all ${
                      isSelected
                        ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200 ring-1 ring-cyan-400/60 shadow-sm'
                        : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <span className="font-semibold">{d.split('/')[0]}/{d.split('/')[1]}</span>
                    <span className={`text-[9px] font-black px-1.5 py-0.2 rounded border ${badgeStyle}`}>
                      {currentSigla}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Mensajes de error */}
          {errorMsg && (
            <div className="flex items-center gap-2 p-2.5 text-xs rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 animate-fadeIn">
              <AlertCircle size={15} className="shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Selector de Sigla / Estado */}
          <div className="space-y-2">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-300">
              Estado a Asignar para las {selectedDates.size} Fechas:
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {SIGLAS_OPCIONES.map(op => {
                const isSelected = selectedSigla === op.value
                return (
                  <button
                    key={op.value}
                    type="button"
                    onClick={() => setSelectedSigla(op.value)}
                    className={`flex items-center justify-between p-2.5 rounded-xl border text-xs font-medium transition-all ${
                      isSelected
                        ? op.selectedStyle
                        : `${op.bg} ${op.text} ${op.border} hover:scale-[1.01]`
                    }`}
                  >
                    <span className="truncate">{op.label}</span>
                    <span className="font-mono font-black text-xs px-2 py-0.5 rounded bg-black/30">
                      {op.short}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Motivo de Baja si se selecciona 'B' */}
          {selectedSigla === 'B' && (
            <div className="p-3.5 rounded-xl bg-rose-500/5 border border-rose-500/20 space-y-2.5 animate-fadeIn">
              <label className="block text-xs font-bold text-rose-400 uppercase tracking-wider">
                Motivo de Baja:
              </label>
              <select
                value={motivoBaja}
                onChange={e => setMotivoBaja(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-rose-500"
              >
                {listaMotivos.map((mot, idx) => (
                  <option key={idx} value={mot}>
                    {mot}
                  </option>
                ))}
              </select>

              {motivoBaja === 'OTRO' && (
                <input
                  type="text"
                  placeholder="Especificar motivo de baja..."
                  value={otroMotivo}
                  onChange={e => setOtroMotivo(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg bg-slate-900 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-rose-500"
                />
              )}
            </div>
          )}
        </div>

        {/* Barra de Acciones */}
        <div className="flex items-center justify-between px-6 py-3.5 border-t border-[var(--border-subtle,#1f2937)] bg-[var(--bg-elevated,#1e293b)] shrink-0">
          <button
            type="button"
            onClick={handleEliminar}
            disabled={saving || deleting || selectedDates.size === 0}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 transition-all hover:scale-105 active:scale-95 disabled:opacity-40"
          >
            {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
            <span>
              {selectedDates.size === 1 ? 'Eliminar Registro' : `Eliminar (${selectedDates.size}) Fechas`}
            </span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving || deleting}
              className="px-4 py-2 text-xs font-semibold rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleGuardar}
              disabled={saving || deleting || selectedDates.size === 0}
              className="flex items-center gap-2 px-5 py-2 text-xs font-bold rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white shadow-lg shadow-cyan-900/30 transition-all hover:scale-105 active:scale-95 disabled:opacity-40"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              <span>
                {selectedDates.size === 1 ? 'Guardar Estado' : `Aplicar a (${selectedDates.size}) Fechas`}
              </span>
            </button>
          </div>
        </div>

      </div>
    </div>
  )
}
