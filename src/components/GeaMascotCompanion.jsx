import React, { useState } from 'react'

/**
 * GeaMascotCompanion - Asistente Virtual Flotante Oficial de GEA Perú
 * - Permanece fijo en la pantalla (fixed) al hacer scroll sin bloquear contenido.
 * - Sin animaciones de caminata: ícono flotante con hover amigable y badge "Asistente GEA".
 * - Al hacer clic, abre un modal/popover de soporte directo.
 * - Formatea y envía la consulta directamente al WhatsApp corporativo del administrador.
 */
export default function GeaMascotCompanion({ 
  userName = 'Usuario', 
  adminPhone = '51980690494', // Número de destino WhatsApp actualizado
  currentView = 'Selector de Módulos (DataCenter)' 
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [tipo, setTipo] = useState('Problema Técnico')
  const [mensaje, setMensaje] = useState('')
  const [sentSuccess, setSentSuccess] = useState(false)

  const handleOpenModal = () => {
    setIsOpen(true)
    setSentSuccess(false)
  }

  const handleCloseModal = () => {
    setIsOpen(false)
    setMensaje('')
  }

  const handleSendWhatsApp = (e) => {
    e.preventDefault()
    if (!mensaje.trim()) return

    const fechaHora = new Date().toLocaleString('es-PE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })

    // Mensaje estructurado y profesional para WhatsApp
    const waText = 
`🦁 *SOLICITUD DE ASISTENCIA - GEA DATACENTER*
━━━━━━━━━━━━━━━━━━━━
👤 *Usuario:* ${userName}
📌 *Tipo:* ${tipo}
💻 *Origen:* ${currentView}
📅 *Fecha:* ${fechaHora}

💬 *Detalle:*
${mensaje.trim()}
━━━━━━━━━━━━━━━━━━━━
_Enviado desde la Plataforma GEA Perú_`

    const waUrl = `https://wa.me/${adminPhone.replace(/\D/g, '')}?text=${encodeURIComponent(waText)}`
    
    // Abrir WhatsApp en pestaña nueva
    window.open(waUrl, '_blank', 'noopener,noreferrer')

    setSentSuccess(true)
    setTimeout(() => {
      handleCloseModal()
    }, 1600)
  }

  return (
    <>
      {/* Botón Flotante Fijo en Esquina Inferior Derecha */}
      <div 
        className="gea-floating-assistant-btn"
        onClick={handleOpenModal}
        title="Asistente Virtual GEA — Haz clic para ayuda o soporte"
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && handleOpenModal()}
      >
        {/* Tooltip / Píldora de saludo fija */}
        <div className="assistant-pill-badge">
          <span className="assistant-pulse-dot"></span>
          <span>Asistente GEA</span>
        </div>

        {/* Personaje Mascota León (Libre, silueta completa sin círculo ni marco) */}
        <div className="assistant-character-stage">
          <img
            src="/mascot/mascot_transparent.png"
            alt="Mascota León GEA - Asistente Virtual"
            className="assistant-lion-character"
            draggable="false"
          />
          <div className="assistant-character-shadow"></div>
        </div>
      </div>

      {/* Modal / Popover de Soporte Directo */}
      {isOpen && (
        <div className="assistant-modal-backdrop" onClick={handleCloseModal}>
          <div 
            className="assistant-modal-card" 
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header del Modal */}
            <div className="assistant-modal-header">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-full bg-[#E8F0FE] border border-[#BBD3FB] flex items-center justify-center overflow-hidden p-0.5 shrink-0 shadow-sm">
                  <img
                    src="/mascot/mascot_transparent.png"
                    alt="León GEA"
                    className="w-full h-full object-contain"
                  />
                </div>
                <div>
                  <h3 className="text-base font-bold text-[#202124] leading-tight">
                    Asistente de Soporte GEA
                  </h3>
                  <p className="text-xs text-[#5F6368] mt-0.5">
                    ¿Tienes dudas o algún problema? Te atendemos directo.
                  </p>
                </div>
              </div>
              <button 
                type="button"
                className="assistant-modal-close-btn"
                onClick={handleCloseModal}
                title="Cerrar"
              >
                ✕
              </button>
            </div>

            {/* Cuerpo del Formulario */}
            {sentSuccess ? (
              <div className="py-8 px-6 text-center flex flex-col items-center justify-center gap-2">
                <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-xl mb-1 shadow-sm">
                  ✓
                </div>
                <h4 className="text-base font-bold text-[#202124]">¡Solicitud enviada!</h4>
                <p className="text-xs text-[#5F6368] max-w-xs">
                  Te hemos redirigido a WhatsApp con tu mensaje listo para enviar al administrador.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSendWhatsApp} className="assistant-modal-body">
                {/* Selector de Tipo */}
                <div className="mb-3">
                  <label className="block text-xs font-semibold text-[#3C4043] mb-1.5 uppercase tracking-wider">
                    Tipo de solicitud:
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { id: 'Problema Técnico', icon: '🚨', label: 'Problema / Error' },
                      { id: 'Consulta de Nóminas', icon: '📝', label: 'Nóminas / Horarios' },
                      { id: 'Permisos / Accesos', icon: '🔑', label: 'Accesos / Claves' },
                      { id: 'Sugerencia / Otro', icon: '💬', label: 'Otra Consulta' }
                    ].map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className={`assistant-type-chip ${tipo === item.id ? 'active' : ''}`}
                        onClick={() => setTipo(item.id)}
                      >
                        <span>{item.icon}</span>
                        <span className="truncate">{item.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Textarea de Mensaje */}
                <div className="mb-4">
                  <label className="block text-xs font-semibold text-[#3C4043] mb-1.5 uppercase tracking-wider">
                    Describe tu problema o solicitud:
                  </label>
                  <textarea
                    rows={4}
                    required
                    value={mensaje}
                    onChange={(e) => setMensaje(e.target.value)}
                    placeholder="Escribe aquí tu consulta o el inconveniente detectado para ayudarte de inmediato..."
                    className="assistant-textarea"
                  />
                </div>

                {/* Botón de Enviar a WhatsApp */}
                <button
                  type="submit"
                  className="assistant-submit-btn"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" className="shrink-0">
                    <path d="M17.472 14.382c-.301-.15-1.78-.878-2.056-.978-.276-.1-.476-.15-.676.15-.2.3-.776.978-.952 1.178-.176.2-.351.226-.652.076-.3-.15-1.267-.467-2.414-1.49-.893-.796-1.496-1.78-1.672-2.08-.176-.3-.019-.462.132-.612.136-.135.301-.351.452-.527.15-.176.201-.3.301-.5.101-.2.05-.376-.025-.526-.075-.15-.676-1.63-1.028-2.231-.25-.599-.502-.519-.677-.528l-.577-.01c-.201 0-.527.075-.803.376s-1.054 1.03-1.054 2.512 1.079 2.914 1.23 3.115c.15.2 2.124 3.243 5.145 4.548.719.311 1.28.497 1.718.636.722.23 1.378.198 1.898.12.58-.088 1.78-.728 2.03-1.431.251-.703.251-1.306.176-1.431-.076-.126-.276-.201-.577-.351z"/>
                    <path d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2.05 21.95l4.912-1.332A9.956 9.956 0 0 0 12 22c5.523 0 10-4.477 10-10S17.523 2 12 2zm0 18.2c-1.63 0-3.17-.46-4.48-1.26l-.32-.2-3.32.9.92-3.23-.21-.34A8.17 8.17 0 0 1 3.8 12c0-4.52 3.68-8.2 8.2-8.2s8.2 3.68 8.2 8.2-3.68 8.2-8.2 8.2z"/>
                  </svg>
                  <span>Enviar a mi celular (WhatsApp)</span>
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  )
}
