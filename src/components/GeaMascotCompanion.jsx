import React, { useState, useEffect, useRef, useMemo } from 'react'
import {
  Sparkles,
  Send,
  MessageSquare,
  Phone,
  RefreshCw,
  X,
  Bot,
  User,
  Building2,
  TrendingUp,
  AlertTriangle,
  RotateCw,
  Zap
} from 'lucide-react'
import '../styles/geaMascot.css'
import { buildGeaDynamicContext, consultarGeitoIA } from '../lib/geitoAiService'

/**
 * GeaMascotCompanion - Asistente Virtual Ejecutivo e Inteligente Oficial de GEA Perú
 * - Animación elíptica orbital al despegar desde la esquina inferior derecha.
 * - Modo IA Consultivo: Chat multi-turn conectado a la API de Gemini con snapshot dinámico en vivo.
 * - Modo Soporte Directo: Envío estructurado a WhatsApp corporativo.
 */
export default function GeaMascotCompanion({
  userName = 'Usuario',
  adminPhone = '51980690494',
  currentView = 'DataCenter General',
  postulantes = [],
  grupos = [],
  asistencias = [],
  campanasMetas = [],
  sedes = []
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [activeTab, setActiveTab] = useState('ia') // 'ia' | 'soporte'
  const [isFlying, setIsFlying] = useState(true)

  // ── ESTADO DEL CHAT IA ──
  const [inputMessage, setInputMessage] = useState('')
  const [isAiLoading, setIsAiLoading] = useState(false)
  const [messages, setMessages] = useState(() => [
    {
      id: 'welcome',
      sender: 'geito',
      text: `¡Hola ${userName}! 🦁 Soy **Geíto**, tu Asistente Ejecutivo en GEA Perú.\n\nEstoy conectado en vivo a las nóminas, metas y sedes oficiales (*Canaval y Moreyra, Ate, Jockey y Comas*). ¿En qué puedo orientarte hoy para mejorar la operación?`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ])
  const chatScrollRef = useRef(null)

  // ── ESTADO DEL FORMULARIO DE SOPORTE WHATSAPP ──
  const [tipoSoporte, setTipoSoporte] = useState('Problema Técnico')
  const [mensajeSoporte, setMensajeSoporte] = useState('')
  const [sentSuccess, setSentSuccess] = useState(false)

  // Iniciar vuelo elíptico en el montaje
  useEffect(() => {
    setIsFlying(true)
    const timer = setTimeout(() => {
      setIsFlying(false)
    }, 2500)

    const handleOpenChatEvent = (e) => {
      setIsOpen(true)
      setActiveTab('ia')
      if (e.detail?.prompt) {
        handleSendMessage(e.detail.prompt)
      }
    }
    window.addEventListener('gea:open_geito_chat', handleOpenChatEvent)

    return () => {
      clearTimeout(timer)
      window.removeEventListener('gea:open_geito_chat', handleOpenChatEvent)
    }
  }, [])

  // Auto-scroll en el chat al agregar mensajes
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight
    }
  }, [messages, isAiLoading])

  // Contexto dinámico generado en tiempo real
  const dynamicContext = useMemo(() => {
    return buildGeaDynamicContext({
      postulantes,
      grupos,
      asistencias,
      campanasMetas,
      sedes,
      currentView
    })
  }, [postulantes, grupos, asistencias, campanasMetas, sedes, currentView])

  const triggerFlyOrbit = (e) => {
    e?.stopPropagation()
    setIsFlying(false)
    setTimeout(() => {
      setIsFlying(true)
      setTimeout(() => setIsFlying(false), 2500)
    }, 50)
  }

  const handleOpenModal = () => {
    setIsOpen(true)
    setSentSuccess(false)
  }

  const handleCloseModal = () => {
    setIsOpen(false)
  }

  // ── ENVIAR PREGUNTA AL MODELO DE IA ──
  const handleSendMessage = async (textToSend = inputMessage) => {
    const text = String(textToSend || '').trim()
    if (!text || isAiLoading) return

    const userMsgId = Date.now().toString()
    const userMsg = {
      id: userMsgId,
      sender: 'user',
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }

    setMessages(prev => [...prev, userMsg])
    setInputMessage('')
    setIsAiLoading(true)

    try {
      const respuesta = await consultarGeitoIA({
        mensajeUsuario: text,
        historial: messages.slice(-6),
        contextoOperativo: dynamicContext
      })

      const botMsg = {
        id: (Date.now() + 1).toString(),
        sender: 'geito',
        text: respuesta,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }

      setMessages(prev => [...prev, botMsg])
    } catch (err) {
      console.error('Error al consultar Geíto IA:', err)
      const errorMsg = {
        id: (Date.now() + 1).toString(),
        sender: 'geito',
        text: `⚠️ Hubo un inconveniente al conectar con el motor de IA: ${err.message || 'Error de conexión'}. Verifica la conectividad o intenta formular la pregunta nuevamente.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
      setMessages(prev => [...prev, errorMsg])
    } finally {
      setIsAiLoading(false)
    }
  }

  // ── ENVIAR MENSAJE A WHATSAPP CORPORATIVO ──
  const handleSendWhatsApp = (e) => {
    e.preventDefault()
    if (!mensajeSoporte.trim()) return

    const fechaHora = new Date().toLocaleString('es-PE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })

    const waText =
`🦁 *SOLICITUD DE ASISTENCIA - GEA DATACENTER*
━━━━━━━━━━━━━━━━━━━━
👤 *Usuario:* ${userName}
📌 *Tipo:* ${tipoSoporte}
💻 *Origen:* ${currentView}
📅 *Fecha:* ${fechaHora}

💬 *Detalle:*
${mensajeSoporte.trim()}
━━━━━━━━━━━━━━━━━━━━
_Enviado desde la Plataforma GEA Perú_`

    const waUrl = `https://wa.me/${adminPhone.replace(/\D/g, '')}?text=${encodeURIComponent(waText)}`
    window.open(waUrl, '_blank', 'noopener,noreferrer')

    setSentSuccess(true)
    setTimeout(() => {
      handleCloseModal()
    }, 1600)
  }

  // Preguntas rápidas contextuales
  const quickPrompts = [
    '¿Cómo podemos mejorar la retención de este período?',
    '¿Qué sede tiene mayor tasa de deserción y por qué?',
    '¿Cómo optimizar la cobertura en campañas con baja meta?',
    '¿Qué impacto tiene la distancia a Canaval y Moreyra y Ate?'
  ]

  return (
    <>
      {/* ── BOTÓN FLOTANTE CON TRAYECTORIA ELÍPTICA ── */}
      <div
        className={`gea-floating-assistant-btn ${isFlying ? 'geito-flying-in' : ''}`}
        onClick={handleOpenModal}
        title="Geíto IA — Asistente Ejecutivo de GEA Perú"
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && handleOpenModal()}
      >
        {/* Píldora de estado con pulso verde */}
        <div className="assistant-pill-badge">
          <span className="assistant-pulse-dot" />
          <span className="flex items-center gap-1.5">
            <span>Geíto IA</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-cyan-500/20 text-cyan-300 font-mono font-bold">
              En Vivo
            </span>
          </span>
        </div>

        {/* Escenario del Personaje León */}
        <div className="assistant-character-stage">
          <div className="assistant-character-aura" />
          <img
            src="/mascot/geito.png"
            alt="Mascota León GEA - Geíto"
            className="assistant-lion-character"
            draggable="false"
            onError={(e) => {
              e.currentTarget.src = '/mascot/mascot_transparent.png'
            }}
          />
          <div className="assistant-character-shadow" />
        </div>
      </div>

      {/* ── MODAL DEL ASISTENTE INTELIGENTE ── */}
      {isOpen && (
        <div className="fixed inset-0 z-[10000] flex items-end sm:items-center justify-center sm:justify-end sm:p-6 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div
            className="w-full sm:w-[480px] h-[92vh] sm:h-[680px] max-h-[720px] bg-[#080f1e] border border-cyan-500/30 sm:rounded-2xl rounded-t-2xl shadow-[0_0_50px_rgba(0,0,0,0.8)] flex flex-col overflow-hidden text-slate-100"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header del Modal */}
            <div className="p-3.5 bg-[#050b16] border-b border-cyan-500/20 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="relative w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500/20 to-cyan-500/20 border border-cyan-500/40 p-0.5 flex items-center justify-center shrink-0">
                  <img
                    src="/mascot/geito.png"
                    alt="Geíto"
                    className="w-full h-full object-contain"
                    onError={(e) => {
                      e.currentTarget.src = '/mascot/mascot_transparent.png'
                    }}
                  />
                  <span className="absolute -bottom-1 -right-1 w-3 h-3 rounded-full bg-emerald-500 border-2 border-slate-900" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-black text-white flex items-center gap-1.5">
                      <span>GEÍTO</span>
                      <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
                        IA 1.5
                      </span>
                    </h3>
                  </div>
                  <p className="text-[11px] text-cyan-400 font-mono flex items-center gap-1 mt-0.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                    <span>Conectado a Nóminas &amp; Sedes Oficiales</span>
                  </p>
                </div>
              </div>

              {/* Controles de Header */}
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={triggerFlyOrbit}
                  className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-amber-300 transition-colors"
                  title="Hacer volar a Geíto en órbita"
                >
                  <RotateCw size={15} />
                </button>
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-rose-500/30 text-slate-400 hover:text-rose-300 transition-colors"
                  title="Cerrar"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Selector de Pestañas: IA vs Soporte */}
            <div className="flex border-b border-slate-800 bg-slate-900/60 p-1.5 gap-1.5">
              <button
                type="button"
                onClick={() => setActiveTab('ia')}
                className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold font-mono flex items-center justify-center gap-2 transition-all ${
                  activeTab === 'ia'
                    ? 'bg-gradient-to-r from-cyan-600 to-cyan-500 text-white shadow-md'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                <Sparkles size={13} className={activeTab === 'ia' ? 'text-amber-300' : ''} />
                <span>Consultas IA</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('soporte')}
                className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold font-mono flex items-center justify-center gap-2 transition-all ${
                  activeTab === 'soporte'
                    ? 'bg-emerald-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                <Phone size={13} />
                <span>WhatsApp Soporte</span>
              </button>
            </div>

            {/* ── PESTAÑA 1: CHAT DE IA CONSULTIVO ── */}
            {activeTab === 'ia' && (
              <div className="flex-1 flex flex-col min-h-0 bg-[#060c18]/95">
                {/* Snapshot de Datos Vivos en Header del Chat */}
                <div className="px-3 py-2 bg-cyan-950/40 border-b border-cyan-500/15 flex items-center justify-between text-[11px] font-mono text-cyan-300/80">
                  <div className="flex items-center gap-1.5 truncate">
                    <Zap size={12} className="text-amber-400 shrink-0" />
                    <span className="truncate">
                      {postulantes.length} asesores · {grupos.length} grupos · Canaval, Ate, Jockey, Comas
                    </span>
                  </div>
                </div>

                {/* Área de Mensajes */}
                <div
                  ref={chatScrollRef}
                  className="flex-1 overflow-y-auto p-3.5 space-y-3 scrollbar-thin scrollbar-thumb-slate-800"
                >
                  {messages.map((m) => (
                    <div
                      key={m.id}
                      className={`flex gap-2.5 ${m.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      {m.sender === 'geito' && (
                        <div className="w-7 h-7 rounded-lg bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center shrink-0 mt-0.5">
                          <Bot size={15} className="text-cyan-300" />
                        </div>
                      )}
                      <div
                        className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed ${
                          m.sender === 'user'
                            ? 'bg-cyan-600 text-white rounded-br-none shadow-md font-medium'
                            : 'bg-slate-900/90 border border-slate-800 text-slate-200 rounded-bl-none shadow-md'
                        }`}
                      >
                        <div className="whitespace-pre-line break-words">
                          {m.text}
                        </div>
                        <div
                          className={`text-[9px] mt-1 font-mono ${
                            m.sender === 'user' ? 'text-cyan-200/70 text-right' : 'text-slate-400 text-left'
                          }`}
                        >
                          {m.timestamp}
                        </div>
                      </div>
                      {m.sender === 'user' && (
                        <div className="w-7 h-7 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0 mt-0.5">
                          <User size={14} className="text-slate-300" />
                        </div>
                      )}
                    </div>
                  ))}

                  {/* Indicador de pensamiento */}
                  {isAiLoading && (
                    <div className="flex gap-2.5 justify-start">
                      <div className="w-7 h-7 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center shrink-0 mt-0.5">
                        <Sparkles size={14} className="text-amber-400 animate-spin" />
                      </div>
                      <div className="rounded-2xl rounded-bl-none px-3.5 py-2 bg-slate-900/90 border border-amber-500/30 text-amber-300/90 text-xs font-mono flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
                        <span>Geíto analizando datos en tiempo real...</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Preguntas rápidas en carrusel */}
                <div className="p-2 border-t border-slate-800/80 bg-slate-950/80">
                  <div className="text-[10px] font-mono text-slate-400 mb-1 px-1">
                    Preguntas sugeridas:
                  </div>
                  <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                    {quickPrompts.map((q, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => handleSendMessage(q)}
                        disabled={isAiLoading}
                        className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-cyan-500/30 hover:border-cyan-400 text-[11px] text-cyan-300 whitespace-nowrap transition-all cursor-pointer shrink-0 disabled:opacity-50"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Formulario de Input */}
                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    handleSendMessage()
                  }}
                  className="p-2.5 border-t border-slate-800 bg-[#050b16] flex items-center gap-2"
                >
                  <input
                    type="text"
                    placeholder="Haz una consulta a Geíto sobre la operación..."
                    value={inputMessage}
                    onChange={(e) => setInputMessage(e.target.value)}
                    disabled={isAiLoading}
                    className="flex-1 px-3 py-2 rounded-xl bg-slate-900/90 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400 transition-all font-sans disabled:opacity-60"
                  />
                  <button
                    type="submit"
                    disabled={!inputMessage.trim() || isAiLoading}
                    className="p-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 disabled:bg-slate-800 text-slate-950 disabled:text-slate-600 transition-all cursor-pointer shrink-0"
                    title="Enviar mensaje"
                  >
                    <Send size={15} />
                  </button>
                </form>
              </div>
            )}

            {/* ── PESTAÑA 2: SOPORTE WHATSAPP DIRECTO ── */}
            {activeTab === 'soporte' && (
              <div className="flex-1 p-5 overflow-y-auto bg-[#060c18]/95 flex flex-col justify-between">
                {sentSuccess ? (
                  <div className="my-auto text-center flex flex-col items-center justify-center gap-2">
                    <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center justify-center text-xl mb-1 shadow-sm">
                      ✓
                    </div>
                    <h4 className="text-base font-bold text-white">¡Solicitud enviada!</h4>
                    <p className="text-xs text-slate-400 max-w-xs">
                      Te hemos redirigido a WhatsApp con tu mensaje listo para enviar al administrador de GEA.
                    </p>
                  </div>
                ) : (
                  <form onSubmit={handleSendWhatsApp} className="space-y-4">
                    <div className="p-3 rounded-xl bg-emerald-950/30 border border-emerald-500/30 text-xs text-emerald-300">
                      Envía un ticket inmediato al WhatsApp del soporte técnico corporativo de GEA Perú.
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-300 mb-1">
                        Tipo de Asistencia
                      </label>
                      <select
                        value={tipoSoporte}
                        onChange={(e) => setTipoSoporte(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white outline-none cursor-pointer"
                      >
                        <option value="Problema Técnico">Problema Técnico en la Web</option>
                        <option value="Error en Nóminas / Asistencia">Error en Nóminas / Asistencias</option>
                        <option value="Solicitud de Permisos">Solicitud de Acceso o Permisos</option>
                        <option value="Consulta Operativa">Consulta Operativa / Descuentos</option>
                        <option value="Otro">Otro Asunto</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-300 mb-1">
                        Detalle del mensaje
                      </label>
                      <textarea
                        rows={5}
                        placeholder="Describe el inconveniente o consulta detalladamente..."
                        value={mensajeSoporte}
                        onChange={(e) => setMensajeSoporte(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white placeholder-slate-500 outline-none focus:border-emerald-500 transition-all resize-none"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={!mensajeSoporte.trim()}
                      className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 text-white font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg disabled:opacity-60"
                    >
                      <Phone size={14} />
                      <span>Abrir WhatsApp de Soporte</span>
                    </button>
                  </form>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
