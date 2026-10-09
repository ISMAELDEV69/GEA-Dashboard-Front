import React, { useState } from 'react'
import {
  AlertTriangle,
  Zap,
  Calendar,
  ArrowRight,
  CheckCircle2,
  X,
  Clock,
  Sparkles,
  Loader2,
  ChevronRight
} from 'lucide-react'

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

function getDayOfWeekShort(dateStr) {
  if (!dateStr) return ''
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
  return days[dt.getUTCDay()]
}

function formatSpreadsheetDate(dateStr) {
  if (!dateStr) return ''
  const [year, month, day] = dateStr.split('-')
  return `${parseInt(day, 10)}/${parseInt(month, 10)}/${year}`
}

export default function AsistenciaGapAssistantModal({
  isOpen,
  onClose,
  missingDates = [],
  currentDate = '',
  grupoCodigo = '',
  campana = '',
  onAutocompletar,
  onSelectDateToEdit,
  onProceedCurrentOnly,
  isProcessing = false
}) {
  const [localProcessing, setLocalProcessing] = useState(false)

  if (!isOpen || !missingDates.length) return null

  const handleAutocompletarClick = async () => {
    setLocalProcessing(true)
    try {
      await onAutocompletar(missingDates)
    } finally {
      setLocalProcessing(false)
    }
  }

  const busy = isProcessing || localProcessing
  const formattedCurrentDate = formatPrettyDate(currentDate)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/75 backdrop-blur-xs animate-fadeIn">
      <div 
        className="w-full max-w-2xl rounded-3xl shadow-2xl flex flex-col overflow-hidden border border-amber-500/40 bg-[var(--bg-surface)] text-[var(--text-primary)] animate-slideUp"
        onClick={e => e.stopPropagation()}
      >
        {/* Header con gradiente ámbar */}
        <div className="px-6 py-5 border-b border-amber-500/30 bg-gradient-to-r from-amber-500/15 via-orange-500/10 to-transparent flex items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/40 text-amber-500 flex items-center justify-center shrink-0 shadow-lg shadow-amber-500/10">
              <AlertTriangle className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-500 border border-amber-500/30">
                  Advertencia de Días Faltantes
                </span>
                <span className="text-xs font-mono font-bold text-[var(--text-muted)]">
                  Grupo: <strong className="text-[var(--text-primary)]">{grupoCodigo}</strong>
                </span>
              </div>
              <h3 className="text-lg font-black tracking-tight text-[var(--text-primary)] mt-1">
                ¿Deseas regularizar los días anteriores?
              </h3>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="p-2 rounded-xl text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-colors disabled:opacity-50"
          >
            <X size={20} />
          </button>
        </div>

        {/* Cuerpo del modal */}
        <div className="p-6 space-y-5 overflow-y-auto max-h-[70vh]">
          {/* Mensaje descriptivo */}
          <div className="text-sm text-[var(--text-secondary)] leading-relaxed">
            Hemos detectado que estás guardando la asistencia del <strong className="text-[var(--text-primary)]">{formattedCurrentDate}</strong>, pero tu cohorte <strong className="text-amber-500">{grupoCodigo}</strong> tiene <strong className="text-amber-500">{missingDates.length} día(s) laboral(es) anterior(es) sin registro</strong>:
          </div>

          {/* Lista de días faltantes en chips destacados */}
          <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/25 space-y-2">
            <div className="text-xs font-black uppercase tracking-wider text-amber-500 flex items-center gap-1.5">
              <Clock size={14} /> Días sin asistencia guardada:
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
              {missingDates.map(dateIso => (
                <div 
                  key={dateIso}
                  className="flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-[var(--bg-surface)] border border-amber-500/30 text-xs font-bold shadow-xs hover:border-amber-500 transition-all"
                >
                  <div className="flex items-center gap-2">
                    <Calendar size={15} className="text-amber-500 shrink-0" />
                    <div>
                      <span className="text-[var(--text-muted)] font-normal mr-1">{getDayOfWeekShort(dateIso)}</span>
                      <strong className="text-[var(--text-primary)] font-mono">{formatSpreadsheetDate(dateIso)}</strong>
                    </div>
                  </div>
                  {onSelectDateToEdit && (
                    <button
                      type="button"
                      onClick={() => onSelectDateToEdit(dateIso)}
                      disabled={busy}
                      className="text-[11px] text-cyan-600 dark:text-cyan-400 font-bold hover:underline flex items-center gap-0.5 ml-2"
                      title="Editar manualmente este día"
                    >
                      Editar <ChevronRight size={13} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Opciones de Acción */}
          <div className="space-y-3 pt-2">
            <div className="text-xs font-black uppercase tracking-wider text-[var(--text-muted)]">
              Elige cómo deseas proceder:
            </div>

            {/* Opción 1: Autocompletar inteligente (Recomendada) */}
            <button
              type="button"
              onClick={handleAutocompletarClick}
              disabled={busy}
              className="w-full text-left p-4 rounded-2xl bg-gradient-to-r from-emerald-500/15 via-teal-500/10 to-transparent border-2 border-emerald-500/50 hover:border-emerald-500 hover:shadow-lg hover:shadow-emerald-500/10 transition-all group relative overflow-hidden"
            >
              <div className="flex items-start gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-500 flex items-center justify-center shrink-0 mt-0.5 group-hover:scale-110 transition-transform">
                  {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Zap className="w-5 h-5" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black uppercase tracking-wide text-emerald-500">
                      ⚡ Autocompletar días faltantes con asistencia previa (Recomendado)
                    </span>
                  </div>
                  <p className="text-xs text-[var(--text-secondary)] mt-1 leading-snug">
                    Replica la asistencia de los alumnos activos como <strong>Asistió (A)</strong> y mantiene intactas las <strong>Bajas (B)</strong> ya consolidadas. Guarda los días pendientes y luego la fecha de hoy.
                  </p>
                </div>
              </div>
            </button>

            {/* Opción 2: Continuar y guardar solo hoy (Sin bloqueo forzoso) */}
            <button
              type="button"
              onClick={onProceedCurrentOnly}
              disabled={busy}
              className="w-full text-left p-3.5 rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] hover:border-[var(--border-normal)] hover:bg-[var(--bg-elevated)]/80 transition-all group"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-muted)] flex items-center justify-center shrink-0">
                    <ArrowRight size={16} />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-[var(--text-primary)]">
                      Continuar y guardar solo la asistencia de hoy ({formatSpreadsheetDate(currentDate)})
                    </div>
                    <div className="text-[11px] text-[var(--text-muted)]">
                      No se modificarán los días anteriores. Podrás regularizarlos después en cualquier momento.
                    </div>
                  </div>
                </div>
                <span className="text-xs font-bold text-cyan-600 dark:text-cyan-400 group-hover:translate-x-1 transition-transform">
                  Guardar Hoy →
                </span>
              </div>
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-[var(--border-subtle)] bg-[var(--bg-elevated)]/60 flex items-center justify-between text-xs text-[var(--text-muted)]">
          <span>Total postulantes a sincronizar en este grupo</span>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="px-4 py-1.5 rounded-xl font-bold hover:bg-[var(--bg-surface)] text-[var(--text-secondary)] transition-colors"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}
