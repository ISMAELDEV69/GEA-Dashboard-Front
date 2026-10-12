import React, { useState, useEffect } from 'react'
import {
  X,
  MessageCircle,
  Copy,
  Check,
  Send,
  Phone,
  Zap,
  MapPin,
  Building2,
  Users,
  CheckCircle2,
  Clock,
  ArrowRight
} from 'lucide-react'

/**
 * QuickMessageReubicacionModal
 * Modal interactivo para enviar un mensaje rápido por WhatsApp al asesor
 * con el fin de gestionar y coordinar su cambio a la sede más cercana a su domicilio.
 */
export default function QuickMessageReubicacionModal({
  isOpen,
  onClose,
  item = null,
  onApplyReubicacion = null
}) {
  const [phoneNumber, setPhoneNumber] = useState('')
  const [copied, setCopied] = useState(false)
  const [applied, setApplied] = useState(false)
  const [customMessage, setCustomMessage] = useState('')

  useEffect(() => {
    if (!item) return

    const rawCel = String(item.celular || item.telefono || '').trim()
    setPhoneNumber(rawCel)
    setApplied(false)
    setCopied(false)

    const firstName = (item.nombre || item.candidato || 'estimado/a asesor(a)').split(' ')[0]
    const gNombre = item.grupo || item.campana || 'Capacitación GEA'
    const gCod = item.codigo_grupo || item.grupo_codigo || ''
    const grupoLabel = gCod ? `${gNombre} (Cód. ${gCod})` : gNombre
    const dist = item.distrito || 'tu zona'
    const sActual = item.sedeActual || 'tu sede actual'
    const sSugerida = item.sedeSugerida || 'otra sede GEA'
    const ahorroKm = item.ahorroKm || 0
    const ahorroMin = item.ahorroMin || Math.round(ahorroKm * 2.8)

    const defaultMsg =
      `Hola ${firstName}, te saludamos de Selección y Workforce de *GEA Perú*.\n\n` +
      `Te contactamos sobre tu postulación en el grupo *${grupoLabel}*.\n\n` +
      `Hemos verificado que vives en *${dist}* y actualmente estás asignado/a a *${sActual}*.\n\n` +
      `Para reducir tu tiempo de traslado diario y darte mayor comodidad, tenemos vacante disponible para reubicarte a una sede mucho más cercana a tu hogar:\n` +
      `🏢 *${sSugerida}*\n` +
      `⚡ *Ahorro de traslado:* -${ahorroKm} km menos de recorrido (~${ahorroMin} min menos de viaje al día).\n\n` +
      `¿Te gustaría confirmar tu reubicación a esta sede más cercana? Por favor confírmanos por este medio para actualizar tu sede operativa. ¡Muchas gracias!`

    setCustomMessage(defaultMsg)
  }, [item, isOpen])

  if (!isOpen || !item) return null

  const handleCopyMessage = async () => {
    try {
      await navigator.clipboard.writeText(customMessage)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch (err) {
      console.warn('Error copying to clipboard:', err)
    }
  }

  const handleOpenWhatsApp = () => {
    const cleanDigits = String(phoneNumber || '').replace(/\D/g, '')
    // Si tiene 9 dígitos (formato estándar Perú), anteponer código de país 51
    const finalNumber = cleanDigits.length === 9 ? `51${cleanDigits}` : cleanDigits

    if (finalNumber) {
      const url = `https://wa.me/${finalNumber}?text=${encodeURIComponent(customMessage)}`
      window.open(url, '_blank', 'noopener,noreferrer')
    } else {
      // Fallback si no tiene número: abrir WhatsApp Web con el texto preparado
      const url = `https://web.whatsapp.com/send?text=${encodeURIComponent(customMessage)}`
      window.open(url, '_blank', 'noopener,noreferrer')
    }
  }

  const handleConfirmReubicacion = async () => {
    if (onApplyReubicacion) {
      await onApplyReubicacion(item)
      setApplied(true)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[130] flex items-center justify-center p-3 sm:p-5 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div className="relative w-full max-w-2xl flex flex-col rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-2xl overflow-hidden transition-colors max-h-[92vh]">
        
        {/* Glow sutil */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-2/3 h-16 bg-emerald-500/15 blur-2xl pointer-events-none" />

        {/* ── HEADER ── */}
        <div className="relative z-10 px-5 py-3.5 border-b border-[var(--border-subtle)] bg-[var(--bg-elevated)]/60 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shadow-xs">
              <MessageCircle size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-black tracking-tight text-[var(--text-primary)]">
                  Mensaje Rápido · Reubicación de Sede
                </h3>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 dark:text-emerald-300 font-mono text-[10px] font-bold">
                  WHATSAPP DIRECTO
                </span>
              </div>
              <p className="text-[11px] text-[var(--text-muted)]">
                Gestiona el cambio a la sede más cercana contactando directamente al asesor.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg border border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-muted)] transition-all cursor-pointer"
            title="Cerrar"
          >
            <X size={16} />
          </button>
        </div>

        {/* ── CUERPO DEL MODAL ── */}
        <div className="relative z-10 flex-1 overflow-y-auto p-5 space-y-4 text-xs scrollbar-thin">
          
          {/* Tarjeta de Datos del Asesor y Grupo */}
          <div className="p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-sm text-[var(--text-primary)]">
                  {item.nombre || item.candidato}
                </span>
                {item.documento && item.documento !== '—' && (
                  <span className="px-1.5 py-0.5 rounded bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[10px] font-mono text-[var(--text-secondary)]">
                    DNI: {item.documento}
                  </span>
                )}
              </div>

              <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-[var(--text-muted)] font-mono">
                <span className="flex items-center gap-1 text-[var(--text-secondary)] font-semibold">
                  <Users size={12} className="text-cyan-500" />
                  Grupo: {item.grupo || 'Sin grupo'}
                </span>
                {(item.codigo_grupo || item.grupo_codigo) && item.codigo_grupo !== '—' && (
                  <span className="px-1.5 py-0.2 rounded bg-cyan-500/10 border border-cyan-500/30 text-cyan-700 dark:text-cyan-300 font-bold text-[10px]">
                    Cód: {item.codigo_grupo || item.grupo_codigo}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <MapPin size={11} className="text-amber-500" />
                  {item.distrito}
                </span>
              </div>
            </div>

            {/* Input de Teléfono */}
            <div className="shrink-0 flex items-center gap-2">
              <div className="relative">
                <Phone size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-emerald-600 dark:text-emerald-400" />
                <input
                  type="text"
                  placeholder="Ej: 987654321"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  className="pl-7 pr-2.5 py-1.5 w-36 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] font-mono font-bold focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>
          </div>

          {/* Comparativa Visual de Sedes y Ahorro */}
          <div className="p-3.5 rounded-xl border border-emerald-500/30 bg-emerald-500/5 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 font-mono">
            {/* Sede Actual */}
            <div className="flex-1">
              <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider font-bold">
                Sede Actual Asignada
              </div>
              <div className="text-xs font-bold text-[var(--text-primary)] mt-0.5">
                {item.sedeActual}
              </div>
              <div className="text-[11px] text-rose-600 dark:text-rose-400 font-semibold mt-0.5">
                Distancia: {item.distanciaActual ?? item.distanciaActualKm} km (~{item.tiempoActualMin || Math.round((item.distanciaActual || 0) * 2.8)}m)
              </div>
            </div>

            <div className="hidden sm:flex items-center justify-center px-2">
              <ArrowRight size={16} className="text-emerald-500" />
            </div>

            {/* Sede Sugerida */}
            <div className="flex-1">
              <div className="text-[10px] text-emerald-600 dark:text-emerald-400 uppercase tracking-wider font-bold flex items-center gap-1">
                <Zap size={11} /> Sede Más Cercana
              </div>
              <div className="text-xs font-bold text-emerald-700 dark:text-emerald-300 mt-0.5">
                {item.sedeSugerida}
              </div>
              <div className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold mt-0.5">
                Distancia: {item.distanciaSugerida ?? item.distanciaOptimaKm} km (~{item.tiempoSugeridoMin || Math.round((item.distanciaSugerida || 0) * 2.8)}m)
              </div>
            </div>

            {/* Badge de Ahorro */}
            <div className="p-2 sm:pl-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 sm:border-l sm:border-t-0 sm:border-r-0 sm:border-b-0 text-right shrink-0">
              <div className="text-[10px] text-[var(--text-muted)] uppercase font-bold">Ahorro Diario</div>
              <div className="text-base font-black text-emerald-600 dark:text-emerald-400 font-mono">
                -{item.ahorroKm} km
              </div>
              <div className="text-[10px] text-emerald-600 dark:text-emerald-300">
                -{item.ahorroMin || Math.round(item.ahorroKm * 2.8)} min menos
              </div>
            </div>
          </div>

          {/* Área de Mensaje Editable */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">
                Mensaje pre-redactado para el asesor
              </label>
              <button
                onClick={handleCopyMessage}
                className="flex items-center gap-1 text-[11px] text-cyan-600 dark:text-cyan-400 hover:underline font-semibold cursor-pointer"
              >
                {copied ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                <span>{copied ? '¡Copiado!' : 'Copiar texto'}</span>
              </button>
            </div>
            <textarea
              rows={7}
              value={customMessage}
              onChange={(e) => setCustomMessage(e.target.value)}
              className="w-full p-3 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] font-mono leading-relaxed focus:outline-none focus:border-emerald-500 resize-none"
            />
          </div>
        </div>

        {/* ── FOOTER CON ACCIONES ── */}
        <div className="relative z-10 px-5 py-3 border-t border-[var(--border-subtle)] bg-[var(--bg-elevated)]/60 flex flex-wrap items-center justify-between gap-2.5">
          {/* Botón opcional para aplicar reubicación en sistema */}
          {onApplyReubicacion && (
            <button
              onClick={handleConfirmReubicacion}
              disabled={applied}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                applied
                  ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 border border-emerald-500/40'
                  : 'bg-[var(--bg-surface)] hover:bg-[var(--bg-muted)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-subtle)]'
              }`}
            >
              {applied ? <CheckCircle2 size={13} /> : <Zap size={13} className="text-emerald-500" />}
              <span>{applied ? 'Reubicación Registrada' : 'Registrar Reubicación en Sistema'}</span>
            </button>
          )}

          <div className="flex items-center gap-2 ml-auto">
            <button
              onClick={handleCopyMessage}
              className="px-3.5 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] hover:bg-[var(--bg-muted)] text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 shadow-xs"
            >
              {copied ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />}
              <span>{copied ? 'Copiado' : 'Copiar'}</span>
            </button>

            <button
              onClick={handleOpenWhatsApp}
              className="px-4 py-1.5 rounded-lg bg-[#25D366] hover:bg-[#20BD5A] text-white text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 shadow-md active:scale-95"
            >
              <Send size={13} />
              <span>Enviar por WhatsApp</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
