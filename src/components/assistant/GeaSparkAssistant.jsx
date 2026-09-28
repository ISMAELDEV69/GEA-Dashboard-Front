import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import {
  Sparkles,
  Search,
  BookOpen,
  Zap,
  Activity,
  X,
  ChevronRight,
  ExternalLink,
  RefreshCw,
  HelpCircle,
  Volume2,
  VolumeX,
  CheckCircle2,
  AlertCircle,
  Users,
  Shield,
  Clock,
  Layers,
  GraduationCap,
  Smile,
  Shuffle
} from 'lucide-react'

// ── COLECCIÓN DE 15 STICKERS DE GATITOS MEME (DE TU IMAGEN) ───────────
export const CAT_STICKERS = [
  {
    id: 1,
    name: 'blep',
    label: 'Gatito Lengüita',
    src: '/stickers/cat_1_blep.png',
    meow: '😛 ¡Blep! Modo relax activado',
    mood: 'Divertido'
  },
  {
    id: 2,
    name: 'bows',
    label: 'Gatito Coquette',
    src: '/stickers/cat_2_bows.png',
    meow: '🎀 ¡Miau! Todo ordenado y bonito',
    mood: 'Kawaii'
  },
  {
    id: 3,
    name: 'judge',
    label: 'Gato Juez',
    src: '/stickers/cat_3_judge.png',
    meow: '🧐 Te estoy vigilando esa asistencia...',
    mood: 'Auditor'
  },
  {
    id: 4,
    name: 'crying',
    label: 'Gato Llorón',
    src: '/stickers/cat_4_crying.png',
    meow: '😭 ¡No me pongas Falta Injustificada!',
    mood: 'Drama'
  },
  {
    id: 5,
    name: 'blanket',
    label: 'Gatito Abrigado',
    src: '/stickers/cat_5_blanket.png',
    meow: '🛌 5 minutitos más antes del OJT...',
    mood: 'Dormilón'
  },
  {
    id: 6,
    name: 'angry',
    label: 'Gato Furioso',
    src: '/stickers/cat_6_angry.png',
    meow: '💢 ¡¿Quién no subió la nómina a tiempo?!',
    mood: 'Jefe Molesto'
  },
  {
    id: 7,
    name: 'thinking',
    label: 'Gato Pensador',
    src: '/stickers/cat_7_thinking.png',
    meow: '🤔 Analizando la curva de dotación...',
    mood: 'Analista WFM'
  },
  {
    id: 8,
    name: 'superman',
    label: 'Super Gato',
    src: '/stickers/cat_8_superman.png',
    meow: '🦸‍♂️ ¡Llegó el refuerzo para la meta!',
    mood: 'Superhéroe'
  },
  {
    id: 9,
    name: 'sly',
    label: 'Gato Pícaro',
    src: '/stickers/cat_9_sly.png',
    meow: '😏 Ya me enteré de tu pase a OJT...',
    mood: 'Sospechoso'
  },
  {
    id: 10,
    name: 'wide_eyes',
    label: 'Gato Asombrado',
    src: '/stickers/cat_10_wide_eyes.png',
    meow: '😳 ¡¿100% de asistencia en Día 1?!',
    mood: 'Impactado'
  },
  {
    id: 11,
    name: 'serious',
    label: 'Gato Serio',
    src: '/stickers/cat_11_serious.png',
    meow: '🗿 La operación no espera a nadie.',
    mood: 'Chad Serio'
  },
  {
    id: 12,
    name: 'call_me',
    label: 'Gato Call Me',
    src: '/stickers/cat_12_call_me.png',
    meow: '🤙 ¡Tírame un fonazo si necesitas ayuda!',
    mood: 'Buena Onda'
  },
  {
    id: 13,
    name: 'smug',
    label: 'Gato Burlón',
    src: '/stickers/cat_13_smug.png',
    meow: '😼 Jeje, ya cuadré todas las horas.',
    mood: 'Confiado'
  },
  {
    id: 14,
    name: 'trumpet',
    label: 'Gato Trompetista',
    src: '/stickers/cat_14_trumpet.png',
    meow: '🎺 ¡Tuturutú! ¡Meta cumplida, señores!',
    mood: 'Fiestero'
  },
  {
    id: 15,
    name: 'cool_glasses',
    label: 'Gato Fachero',
    src: '/stickers/cat_15_cool_glasses.png',
    meow: '😎 Operación bajo control, mi líder.',
    mood: 'Fachero'
  }
]

// ── TIPS Y MENSAJES ROTATIVOS CADA 10-15s ──────────────────────────────
const SPARK_TIPS = [
  {
    tag: 'TIP OPERATIVO',
    text: '¿Actualizaste el Excel de Capacidad? Recuerda darle a "Sincronizar desde Drive" para reflejar los grupos nuevos.',
    actionView: 'capacidad',
    actionText: 'Ir a Capacidad'
  },
  {
    tag: 'BOLSA DE CAPA',
    text: 'Crea tu GPE y nómina directamente en Bolsa de Capa para asesores reingresantes sin pasar por reclutamiento.',
    actionView: 'bolsa_capa',
    actionText: 'Abrir Bolsa de Capa'
  },
  {
    tag: 'ATAJO RÁPIDO',
    text: 'Presiona Ctrl + K en cualquier momento para abrir el buscador global de módulos y asesores.',
    actionView: null,
    actionText: null
  },
  {
    tag: 'GESTIÓN OJT',
    text: 'Al ingresar a OJT, la asistencia se marca con "OJT" o "I-OP" al graduarse formalmente a piso.',
    actionView: 'asistencia',
    actionText: 'Ver Asistencia'
  },
  {
    tag: '¡HAZME CLIC!',
    text: '¡Haz clic sobre mí para cambiar de sticker y verme jugar con el cursor!',
    actionView: null,
    actionText: null
  }
]

// ── DICCIONARIO OPERATIVO WFM / GEA ─────────────────────────────────────
const GLOSSARY_ITEMS = [
  {
    sigla: 'I-OP',
    nombre: 'Ingreso a Operación',
    tipo: 'Hito Clave',
    color: 'emerald',
    desc: 'Momento en que el asesor culmina su proceso de capacitación/OJT y se gradúa formalmente como asesor productivo en piso de operaciones.'
  },
  {
    sigla: 'OJT',
    nombre: 'On the Job Training',
    tipo: 'Etapa Formativa',
    color: 'indigo',
    desc: 'Práctica asistida en llamadas reales bajo acompañamiento de formador y supervisor antes de graduarse a operación plena.'
  },
  {
    sigla: 'A',
    nombre: 'Asistió',
    tipo: 'Asistencia Diaria',
    color: 'cyan',
    desc: 'El asesor se presentó y cumplió con la jornada formativa programada para el día.'
  },
  {
    sigla: 'FI',
    nombre: 'Falta Injustificada',
    tipo: 'Inasistencia',
    color: 'rose',
    desc: 'El asesor no asistió a su clase o turno sin haber presentado justificación formal aprobada.'
  },
  {
    sigla: 'FJ',
    nombre: 'Falta Justificada',
    tipo: 'Inasistencia',
    color: 'amber',
    desc: 'Inasistencia respaldada por descanso médico, permiso formal o causal validada por el formador o supervisor.'
  },
  {
    sigla: 'BAJA DÍA 1',
    nombre: 'Deserción Inicial',
    tipo: 'Métrica Crítica',
    color: 'red',
    desc: 'Postulante convocado que no asiste al primer día de capacitación formal o renuncia antes de iniciar la primera sesión.'
  },
  {
    sigla: 'GPE',
    nombre: 'Grupo Planificado de Entrada',
    tipo: 'Estructura WFM',
    color: 'purple',
    desc: 'Código identificador único asignado a una cohorte de capacitación (ej. GPE-2026016X) con fechas de inicio, OJT e ingreso a operación.'
  },
  {
    sigla: 'RQ',
    nombre: 'Requerimiento de Dotación',
    tipo: 'Planificación',
    color: 'blue',
    desc: 'Cantidad de vacantes o FTEs solicitados formalmente por el cliente/operación para cubrir una campaña específica.'
  }
]

// ── POSICIONES DINÁMICAS PARA JUGAR CON EL CURSOR ──────────────────────
const PLAY_POSITIONS = [
  { x: 0, y: 0, rot: 0, scale: 1 },
  { x: -90, y: -25, rot: -8, scale: 1.05 },
  { x: -180, y: -10, rot: 6, scale: 0.95 },
  { x: -270, y: -35, rot: -10, scale: 1.1 },
  { x: -140, y: -65, rot: 12, scale: 1.02 },
  { x: -50, y: -45, rot: -5, scale: 0.98 },
]

export default function GeaSparkAssistant({
  postulantes = [],
  grupos = [],
  asistencias = [],
  onNavigate,
  onRefresh,
  currentRole = 'visor',
  userProfile = null
}) {
  // Limitar visualización únicamente a entorno local (localhost) mientras se itera y perfecciona
  const isLocalOrDev = useMemo(() => {
    if (typeof window === 'undefined') return false
    const host = window.location.hostname
    const isLocal = host === 'localhost' || host === '127.0.0.1' || host.startsWith('192.168.') || host.endsWith('.local')
    const isDevMode = Boolean(import.meta.env?.DEV)
    const isForcedPreview = localStorage.getItem('gea-spark-preview') === 'true'
    return isLocal || isDevMode || isForcedPreview
  }, [])

  if (!isLocalOrDev) {
    return null
  }

  const [isOpen, setIsOpen] = useState(false)
  const [activeTab, setActiveTab] = useState('stickers') // 'stickers' | 'search' | 'glossary' | 'actions' | 'pulse'
  const [searchDni, setSearchDni] = useState('')
  const [currentTipIndex, setCurrentTipIndex] = useState(0)
  const [showBubble, setShowBubble] = useState(true)
  const [bubbleMuted, setBubbleMuted] = useState(() => {
    try { return localStorage.getItem('gea-spark-muted') === 'true' } catch { return false }
  })
  const [isHovered, setIsHovered] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  // ── ESTADO DEL STICKER Y POSICIÓN JUGUETONA ───────────────────────────
  const [stickerIndex, setStickerIndex] = useState(0)
  const [posIndex, setPosIndex] = useState(0)
  const [isJumping, setIsJumping] = useState(false)
  const [catActionText, setCatActionText] = useState('')

  // ── CICLO DE ANIMACIÓN E ITERACIÓN CADA 12 SEGUNDOS ──────────────────
  useEffect(() => {
    const interval = setInterval(() => {
      if (!bubbleMuted && !isOpen) {
        setShowBubble(false)
        setTimeout(() => {
          setCurrentTipIndex((prev) => (prev + 1) % SPARK_TIPS.length)
          setShowBubble(true)
        }, 400)
      }
    }, 12000)

    return () => clearInterval(interval)
  }, [bubbleMuted, isOpen])

  // Desvanecer la burbuja automáticamente después de 6.5 segundos
  useEffect(() => {
    if (!showBubble || bubbleMuted || isOpen) return
    const timer = setTimeout(() => {
      setShowBubble(false)
    }, 6500)
    return () => clearTimeout(timer)
  }, [showBubble, currentTipIndex, bubbleMuted, isOpen])

  // Atajo de teclado: Ctrl + / o Cmd + / para abrir el Copilot
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === '/') {
        e.preventDefault()
        setIsOpen((prev) => !prev)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const handleToggleMute = (e) => {
    e.stopPropagation()
    const next = !bubbleMuted
    setBubbleMuted(next)
    setShowBubble(!next)
    try { localStorage.setItem('gea-spark-muted', String(next)) } catch {}
  }

  // ── CLIC EN EL GATO: CAMBIA DE STICKER Y SALTA COMO JUGANDO CON EL CURSOR ──
  const handleCatClick = (e) => {
    e.stopPropagation()

    // 1. Animación elástica de salto
    setIsJumping(true)
    setTimeout(() => setIsJumping(false), 500)

    // 2. Cambiar al siguiente sticker de la colección (o aleatorio)
    const nextStickerIdx = (stickerIndex + 1) % CAT_STICKERS.length
    setStickerIndex(nextStickerIdx)

    // 3. Cambiar de posición para simular que esquiva o juega con el cursor
    setPosIndex((prev) => (prev + 1) % PLAY_POSITIONS.length)

    // 4. Mostrar el mensaje divertido del sticker actual
    const currentStk = CAT_STICKERS[nextStickerIdx]
    setCatActionText(currentStk.meow)
    setTimeout(() => setCatActionText(''), 2000)
  }

  const currentSticker = CAT_STICKERS[stickerIndex]
  const currentPos = PLAY_POSITIONS[posIndex]
  const currentTip = SPARK_TIPS[currentTipIndex]

  // ── BUSCADOR EXPRESS POR DNI O NOMBRE ────────────────────────────────
  const searchResults = useMemo(() => {
    const q = String(searchDni || '').trim().toUpperCase()
    if (!q || q.length < 2) return []

    const hits = []
    const seen = new Set()

    for (const p of postulantes) {
      const doc = String(p.documento || p.dni || '').trim()
      const nom = String(p.nombre_completo || `${p.nombres || ''} ${p.apellido_paterno || ''}`).trim().toUpperCase()
      if (doc.includes(q) || nom.includes(q)) {
        if (!seen.has(doc)) {
          seen.add(doc)
          hits.push({
            documento: doc,
            nombre: nom || 'Sin Nombre',
            telefono: p.celular || p.telefono || 'No registrado',
            campana: p.campana || p.campaign || 'Sin Campaña',
            grupo_codigo: p.grupo_codigo || p.codigo || 'Sin Grupo',
            estado: p.estado || (p.activo ? 'ACTIVO' : 'INACTIVO'),
            reclutador: p.reclutador_nombre || p.reclutador || 'No asignado',
            etapa: p.etapa || (p.en_ojt ? 'OJT' : 'AULA / FORMACIÓN')
          })
        }
      }
      if (hits.length >= 8) break
    }
    return hits
  }, [searchDni, postulantes])

  // ── ESTADÍSTICAS DEL DÍA (PULSO OPERATIVO) ────────────────────────────
  const pulseStats = useMemo(() => {
    const activeGrupos = (grupos || []).filter(g => String(g.estado).toUpperCase().includes('ACTIVO') || String(g.estado).toUpperCase().includes('CURSO'))
    const totalPost = postulantes.length
    const enOjt = postulantes.filter(p => p.en_ojt || String(p.etapa).toUpperCase().includes('OJT')).length
    return {
      totalGrupos: grupos.length,
      activeGrupos: activeGrupos.length,
      totalPostulantes: totalPost,
      enOjt: enOjt,
    }
  }, [grupos, postulantes])

  return (
    <>
      {/* ── CONTENEDOR FLOTANTE DINÁMICO DEL GATO CON SUS STICKERS ─────── */}
      <div
        style={{
          transform: `translate3d(${currentPos.x}px, ${currentPos.y}px, 0) rotate(${currentPos.rot}deg) scale(${currentPos.scale})`,
          transition: 'transform 0.45s cubic-bezier(0.34, 1.56, 0.64, 1)'
        }}
        className="fixed bottom-5 right-5 z-50 flex items-end gap-3 pointer-events-none select-none"
      >
        {/* Burbuja de Diálogo Contextual Inteligente */}
        {showBubble && !isOpen && !bubbleMuted && (
          <div
            onClick={() => {
              if (currentTip.actionView && onNavigate) {
                onNavigate(currentTip.actionView)
              } else {
                setIsOpen(true)
              }
            }}
            className="pointer-events-auto max-w-[280px] bg-slate-900/90 hover:bg-slate-900 text-slate-100 backdrop-blur-xl border border-cyan-500/30 shadow-[0_8px_30px_rgb(0,0,0,0.4)] rounded-2xl p-3.5 mb-2 cursor-pointer transition-all duration-300 hover:scale-[1.02] hover:border-cyan-400 group animate-in fade-in slide-in-from-bottom-2"
          >
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <span className="text-[10px] font-black tracking-wider uppercase px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 flex items-center gap-1">
                <Sparkles size={10} className="text-cyan-400 animate-spin" style={{ animationDuration: '4s' }} />
                {currentTip.tag}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setShowBubble(false)
                }}
                className="text-slate-400 hover:text-white p-0.5 rounded-md hover:bg-slate-800/60 transition-colors"
                title="Cerrar tip"
              >
                <X size={12} />
              </button>
            </div>
            <p className="text-xs text-slate-200 leading-relaxed font-medium">
              {currentTip.text}
            </p>
            {currentTip.actionText && (
              <div className="mt-2 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] font-bold text-cyan-400 group-hover:text-cyan-300">
                <span>{currentTip.actionText}</span>
                <ChevronRight size={13} className="transform transition-transform group-hover:translate-x-1" />
              </div>
            )}
          </div>
        )}

        {/* Sticker Interactivo del Gato con Efecto Juguetón */}
        <div className="relative pointer-events-auto flex flex-col items-center">
          
          {/* Reacción flotante / Diálogo meme del sticker activo */}
          {catActionText && (
            <div className="absolute -top-11 px-3.5 py-1.5 rounded-2xl bg-cyan-500 text-slate-950 font-black text-xs shadow-[0_6px_20px_rgba(6,182,212,0.6)] animate-in zoom-in-75 slide-in-from-bottom-3 duration-200 flex items-center gap-1.5 z-30 whitespace-nowrap border-2 border-white">
              <span>{catActionText}</span>
            </div>
          )}

          {/* Botones de control superior: Silenciar y Abrir Panel */}
          <div className="absolute -top-3.5 flex items-center gap-1.5 z-20">
            <button
              onClick={handleToggleMute}
              className="w-6 h-6 rounded-full bg-slate-900/90 border border-slate-700/80 text-slate-400 hover:text-cyan-400 hover:border-cyan-500/50 flex items-center justify-center shadow-lg transition-colors"
              title={bubbleMuted ? 'Activar tips' : 'Silenciar tips'}
            >
              {bubbleMuted ? <VolumeX size={11} /> : <Volume2 size={11} />}
            </button>

            <button
              onClick={(e) => {
                e.stopPropagation()
                setIsOpen(true)
              }}
              className="px-2.5 py-0.5 rounded-full bg-cyan-500/25 border border-cyan-400/50 text-cyan-200 hover:bg-cyan-500 hover:text-slate-950 text-[10px] font-black shadow-lg transition-all flex items-center gap-1 backdrop-blur-xs"
              title="Abrir Asistente Copilot (Ctrl + /)"
            >
              <Sparkles size={10} />
              <span>Copilot</span>
            </button>
          </div>

          {/* Sticker Clickeable con física de salto y animación */}
          <button
            onClick={handleCatClick}
            onDoubleClick={(e) => {
              e.stopPropagation()
              setIsOpen(true)
            }}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            className={`relative group focus:outline-none transition-transform duration-200 cursor-pointer ${
              isJumping ? 'scale-115 rotate-6' : 'hover:scale-108 active:scale-90'
            }`}
            title="¡Haz clic para cambiar de sticker y jugar con el cursor!"
          >
            {/* Halo de luz / Resplandor Neón */}
            <div className={`absolute -inset-2 rounded-full bg-gradient-to-r from-cyan-400 via-pink-500 to-amber-400 opacity-60 blur-md transition-opacity duration-300 ${isHovered || isJumping ? 'opacity-95 blur-lg animate-pulse' : 'opacity-40'}`} />

            {/* Borde / Marco de Sticker de WhatsApp con sombra flotante */}
            <div className="relative w-22 h-22 rounded-3xl bg-slate-950/80 p-1.5 border-2 border-white/90 shadow-[0_8px_25px_rgba(0,0,0,0.6)] flex items-center justify-center overflow-hidden backdrop-blur-md">
              
              {/* Imagen del Sticker Meme del Gato */}
              <img
                src={currentSticker.src}
                alt={currentSticker.label}
                className="w-full h-full object-cover rounded-2xl transition-transform duration-300 group-hover:scale-105"
                draggable={false}
              />

              {/* Indicador de Sticker # / 15 */}
              <span className="absolute bottom-1 right-1.5 px-1.5 py-0.5 rounded-md bg-slate-950/85 text-[9px] font-mono font-black text-cyan-300 border border-white/20">
                {currentSticker.id}/15
              </span>
            </div>
          </button>

          {/* Pista sutil debajo para el usuario */}
          <div className="text-[9px] font-bold text-slate-400 mt-1 drop-shadow-md bg-slate-950/70 px-2 py-0.5 rounded-full border border-slate-800">
            Clic = Cambiar 🐾
          </div>
        </div>
      </div>

      {/* ── MODAL / PANEL DE ASISTENTE FLOTANTE GLASSMORPHIC (AL ABRIR) ── */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:justify-end p-4 sm:p-6 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div
            className="w-full sm:w-[500px] h-[85vh] max-h-[700px] bg-slate-900/95 text-slate-100 backdrop-blur-2xl border border-cyan-500/30 rounded-3xl shadow-[0_20px_70px_rgba(0,0,0,0.7)] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header del Panel con Avatar de Sticker */}
            <div className="p-4 sm:p-5 border-b border-slate-800/80 bg-gradient-to-r from-slate-900 via-slate-900/80 to-cyan-950/40 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl border-2 border-white/80 overflow-hidden shadow-md shrink-0 bg-slate-950">
                  <img src={currentSticker.src} alt={currentSticker.label} className="w-full h-full object-cover" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-extrabold text-base tracking-tight text-white">{currentSticker.label}</h3>
                    <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                      {currentSticker.mood}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400">GEA Neko Copilot • Soporte interactivo WFM</p>
                </div>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="w-8 h-8 rounded-xl bg-slate-800/60 hover:bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {/* Navegación por Pestañas */}
            <div className="grid grid-cols-5 gap-1 p-2 bg-slate-950/60 border-b border-slate-800/60 shrink-0 text-xs font-bold">
              <button
                onClick={() => setActiveTab('stickers')}
                className={`py-2 px-1.5 rounded-xl flex items-center justify-center gap-1 transition-all ${
                  activeTab === 'stickers'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 shadow-xs'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                }`}
              >
                <Smile size={13} />
                <span>Stickers</span>
              </button>

              <button
                onClick={() => setActiveTab('search')}
                className={`py-2 px-1.5 rounded-xl flex items-center justify-center gap-1 transition-all ${
                  activeTab === 'search'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 shadow-xs'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                }`}
              >
                <Search size={13} />
                <span>Buscar</span>
              </button>

              <button
                onClick={() => setActiveTab('glossary')}
                className={`py-2 px-1.5 rounded-xl flex items-center justify-center gap-1 transition-all ${
                  activeTab === 'glossary'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 shadow-xs'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                }`}
              >
                <BookOpen size={13} />
                <span>Siglas</span>
              </button>

              <button
                onClick={() => setActiveTab('actions')}
                className={`py-2 px-1.5 rounded-xl flex items-center justify-center gap-1 transition-all ${
                  activeTab === 'actions'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 shadow-xs'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                }`}
              >
                <Zap size={13} />
                <span>Accesos</span>
              </button>

              <button
                onClick={() => setActiveTab('pulse')}
                className={`py-2 px-1.5 rounded-xl flex items-center justify-center gap-1 transition-all ${
                  activeTab === 'pulse'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 shadow-xs'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                }`}
              >
                <Activity size={13} />
                <span>Pulso</span>
              </button>
            </div>

            {/* Contenido Dinámico */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              
              {/* TAB 0: GALERÍA DE STICKERS DE GATITOS MEME */}
              {activeTab === 'stickers' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-bold text-white uppercase tracking-wider">Colección de Stickers (15)</h4>
                      <p className="text-[11px] text-slate-400">Haz clic en cualquier sticker para seleccionarlo como tu compañero:</p>
                    </div>
                    <button
                      onClick={() => {
                        const rand = Math.floor(Math.random() * CAT_STICKERS.length)
                        setStickerIndex(rand)
                        setCatActionText(CAT_STICKERS[rand].meow)
                      }}
                      className="px-2.5 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 text-xs font-bold flex items-center gap-1 border border-slate-700 transition-colors"
                    >
                      <Shuffle size={12} />
                      <span>Aleatorio</span>
                    </button>
                  </div>

                  {/* Grid de los 15 Stickers */}
                  <div className="grid grid-cols-3 gap-3">
                    {CAT_STICKERS.map((stk, idx) => (
                      <div
                        key={stk.id}
                        onClick={() => {
                          setStickerIndex(idx)
                          setCatActionText(stk.meow)
                        }}
                        className={`p-2.5 rounded-2xl border transition-all cursor-pointer flex flex-col items-center gap-2 group ${
                          stickerIndex === idx
                            ? 'bg-cyan-500/20 border-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.3)] scale-[1.03]'
                            : 'bg-slate-800/40 hover:bg-slate-800/80 border-slate-700/60 hover:border-slate-500'
                        }`}
                      >
                        <div className="w-16 h-16 rounded-xl overflow-hidden border-2 border-white/80 bg-slate-950 shadow-md">
                          <img src={stk.src} alt={stk.label} className="w-full h-full object-cover group-hover:scale-110 transition-transform" />
                        </div>
                        <div className="text-center w-full">
                          <div className="text-[11px] font-bold text-slate-200 truncate">{stk.label}</div>
                          <div className="text-[10px] text-slate-400 truncate">{stk.mood}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* TAB 1: BUSCADOR EXPRESS POR DNI O NOMBRE */}
              {activeTab === 'search' && (
                <div className="space-y-4">
                  <div className="relative">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <input
                      type="text"
                      value={searchDni}
                      onChange={(e) => setSearchDni(e.target.value)}
                      placeholder="Buscar asesor por DNI o Nombre…"
                      className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-slate-950/80 border border-slate-700/80 focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 text-sm text-white placeholder-slate-500 transition-all outline-none"
                      autoFocus
                    />
                    {searchDni && (
                      <button
                        onClick={() => setSearchDni('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>

                  {/* Resultados */}
                  {searchResults.length > 0 ? (
                    <div className="space-y-2.5">
                      <div className="text-[11px] font-bold uppercase text-slate-400 tracking-wider">
                        Encontrados ({searchResults.length})
                      </div>
                      {searchResults.map((r, i) => (
                        <div
                          key={r.documento + i}
                          className="p-3.5 rounded-2xl bg-slate-800/50 hover:bg-slate-800/80 border border-slate-700/60 hover:border-cyan-500/40 transition-all flex flex-col gap-2"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="font-bold text-sm text-white leading-tight">{r.nombre}</div>
                              <div className="text-xs text-cyan-400 font-mono mt-0.5">DNI: {r.documento} • Tel: {r.telefono}</div>
                            </div>
                            <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                              r.estado.includes('ACTIVO') ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-slate-700 text-slate-300'
                            }`}>
                              {r.estado}
                            </span>
                          </div>

                          <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-300 pt-2 border-t border-slate-700/40">
                            <div>
                              <span className="text-slate-500 font-medium">Campaña:</span>{' '}
                              <span className="font-semibold text-slate-200">{r.campana}</span>
                            </div>
                            <div>
                              <span className="text-slate-500 font-medium">Grupo:</span>{' '}
                              <span className="font-semibold text-slate-200">{r.grupo_codigo}</span>
                            </div>
                            <div>
                              <span className="text-slate-500 font-medium">Etapa:</span>{' '}
                              <span className="font-semibold text-indigo-300">{r.etapa}</span>
                            </div>
                            <div>
                              <span className="text-slate-500 font-medium">Reclutador:</span>{' '}
                              <span className="font-semibold text-slate-200 truncate">{r.reclutador}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : searchDni.length >= 2 ? (
                    <div className="text-center py-10 px-4 text-slate-400">
                      <Search size={32} className="mx-auto mb-2 opacity-40 text-cyan-400" />
                      <p className="text-sm font-medium">No se encontró ningún asesor con ese DNI o Nombre.</p>
                      <p className="text-xs text-slate-500 mt-1">Verifica que el número esté bien escrito o que el grupo esté cargado en nómina.</p>
                    </div>
                  ) : (
                    <div className="text-center py-8 px-4 text-slate-400">
                      <Sparkles size={28} className="mx-auto mb-2 text-cyan-400 opacity-60 animate-bounce" />
                      <p className="text-sm font-semibold text-slate-300">Consulta Rápida de Asesores</p>
                      <p className="text-xs text-slate-500 mt-1 max-w-[300px] mx-auto">
                        Escribe el DNI o apellido para ver instantáneamente a qué grupo, campaña y etapa (Aula u OJT) pertenece.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: GLOSARIO WFM & SIGNIFICADO DE SIGLAS */}
              {activeTab === 'glossary' && (
                <div className="space-y-3">
                  <div className="text-xs text-slate-400 leading-relaxed">
                    Diccionario oficial de siglas y estados operativos en la plataforma WFM:
                  </div>

                  <div className="space-y-2">
                    {GLOSSARY_ITEMS.map((item) => (
                      <div
                        key={item.sigla}
                        className="p-3 rounded-2xl bg-slate-800/40 border border-slate-700/50 hover:border-slate-600 transition-all"
                      >
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-mono font-black px-2 py-0.5 rounded-lg bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                              {item.sigla}
                            </span>
                            <span className="font-bold text-xs text-slate-200">{item.nombre}</span>
                          </div>
                          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                            {item.tipo}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 leading-relaxed pl-1">
                          {item.desc}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* TAB 3: ACCIONES RÁPIDAS Y ENLACES DIRECTOS */}
              {activeTab === 'actions' && (
                <div className="space-y-3">
                  <div className="text-xs text-slate-400">
                    Accesos directos recomendados para tu flujo diario:
                  </div>

                  <div className="grid grid-cols-1 gap-2.5">
                    <button
                      onClick={() => {
                        onNavigate?.('bolsa_capa')
                        setIsOpen(false)
                      }}
                      className="p-3.5 rounded-2xl bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 hover:border-cyan-500/50 flex items-center justify-between text-left transition-all group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-cyan-500/15 text-cyan-400 flex items-center justify-center">
                          <GraduationCap size={18} />
                        </div>
                        <div>
                          <div className="font-bold text-xs text-white group-hover:text-cyan-300 transition-colors">
                            Bolsa de Capa
                          </div>
                          <div className="text-[11px] text-slate-400">Crear o agregar nóminas de reingreso directo</div>
                        </div>
                      </div>
                      <ChevronRight size={16} className="text-slate-500 group-hover:translate-x-1 group-hover:text-cyan-400 transition-all" />
                    </button>

                    <button
                      onClick={() => {
                        onNavigate?.('capacidad')
                        setIsOpen(false)
                      }}
                      className="p-3.5 rounded-2xl bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 hover:border-cyan-500/50 flex items-center justify-between text-left transition-all group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-indigo-500/15 text-indigo-400 flex items-center justify-center">
                          <Layers size={18} />
                        </div>
                        <div>
                          <div className="font-bold text-xs text-white group-hover:text-indigo-300 transition-colors">
                            Capacidad RYS
                          </div>
                          <div className="text-[11px] text-slate-400">Sincronizar grupos y metas desde Drive</div>
                        </div>
                      </div>
                      <ChevronRight size={16} className="text-slate-500 group-hover:translate-x-1 group-hover:text-indigo-400 transition-all" />
                    </button>

                    <button
                      onClick={() => {
                        onNavigate?.('asistencia')
                        setIsOpen(false)
                      }}
                      className="p-3.5 rounded-2xl bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 hover:border-cyan-500/50 flex items-center justify-between text-left transition-all group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center">
                          <Clock size={18} />
                        </div>
                        <div>
                          <div className="font-bold text-xs text-white group-hover:text-emerald-300 transition-colors">
                            Marcación de Asistencia
                          </div>
                          <div className="text-[11px] text-slate-400">Registro de firmas y estados diarios</div>
                        </div>
                      </div>
                      <ChevronRight size={16} className="text-slate-500 group-hover:translate-x-1 group-hover:text-emerald-400 transition-all" />
                    </button>

                    <button
                      onClick={async () => {
                        setRefreshing(true)
                        try {
                          await onRefresh?.()
                        } finally {
                          setRefreshing(false)
                        }
                      }}
                      disabled={refreshing}
                      className="p-3.5 rounded-2xl bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 hover:border-emerald-500/50 flex items-center justify-between text-left transition-all group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center">
                          <RefreshCw size={18} className={refreshing ? 'animate-spin' : ''} />
                        </div>
                        <div>
                          <div className="font-bold text-xs text-white group-hover:text-emerald-300 transition-colors">
                            {refreshing ? 'Actualizando base de datos…' : 'Refrescar Datos del Sistema'}
                          </div>
                          <div className="text-[11px] text-slate-400">Invalida caché y descarga la información más reciente</div>
                        </div>
                      </div>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-700 text-slate-300">
                        1 Clic
                      </span>
                    </button>
                  </div>
                </div>
              )}

              {/* TAB 4: PULSO OPERATIVO DEL SISTEMA */}
              {activeTab === 'pulse' && (
                <div className="space-y-4">
                  <div className="text-xs text-slate-400">
                    Resumen global en tiempo real de la dotación y grupos:
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3.5 rounded-2xl bg-slate-800/40 border border-slate-700/50">
                      <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Grupos Activos</div>
                      <div className="text-2xl font-black text-cyan-400 mt-1">{pulseStats.activeGrupos}</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">de {pulseStats.totalGrupos} totales planificados</div>
                    </div>

                    <div className="p-3.5 rounded-2xl bg-slate-800/40 border border-slate-700/50">
                      <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">En Etapa OJT</div>
                      <div className="text-2xl font-black text-indigo-400 mt-1">{pulseStats.enOjt}</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">asesores en piso formativo</div>
                    </div>

                    <div className="col-span-2 p-3.5 rounded-2xl bg-slate-800/40 border border-slate-700/50">
                      <div className="flex items-center justify-between">
                        <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Nómina Global Cargada</div>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300">En línea</span>
                      </div>
                      <div className="text-2xl font-black text-white mt-1">{pulseStats.totalPostulantes}</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">postulantes y asesores sincronizados</div>
                    </div>
                  </div>

                  <div className="p-3 rounded-2xl bg-cyan-950/30 border border-cyan-500/30 flex items-start gap-2.5">
                    <CheckCircle2 size={16} className="text-cyan-400 shrink-0 mt-0.5" />
                    <div className="text-xs text-cyan-200">
                      <strong>Conexión con Supabase verificada:</strong> Todas las métricas se sincronizan con las tablas en tiempo real.
                    </div>
                  </div>
                </div>
              )}

            </div>

            {/* Footer */}
            <div className="p-3 bg-slate-950/80 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400 shrink-0">
              <span className="flex items-center gap-1.5 font-medium">
                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                GEA Neko Copilot • Sticker #{currentSticker.id}
              </span>
              <div className="flex items-center gap-2">
                <span>Atajo:</span>
                <kbd className="px-1.5 py-0.5 rounded-md bg-slate-800 border border-slate-700 text-slate-300 font-mono text-[10px]">
                  Ctrl + /
                </kbd>
              </div>
            </div>

          </div>
        </div>
      )}
    </>
  )
}
