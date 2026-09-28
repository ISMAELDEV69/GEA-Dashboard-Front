import React, { useEffect, useState, useRef, useCallback } from 'react'

/**
 * GeaModernDeltaEmblem - Isotipo Oficial Corporativo GEA (Delta con 3 franjas de color: Verde, Azul y Rojo/Naranja)
 * - Triángulo / Delta con marco envolvente azul marino (navy corporativo)
 * - 3 franjas horizontales redondeadas (Pirámide de valor: Verde, Azul, Rojo/Naranja)
 * - 100% Vectorial, transparente, con animación profesional de cambio de color y destello de luz.
 */
export function GeaModernDeltaEmblem({ 
  className = 'w-10 h-10', 
  variant = 'color', // 'color' | 'white'
  animated = true 
}) {
  const isWhite = variant === 'white'
  
  return (
    <svg
      viewBox="0 0 110 98"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`gea-corporate-emblem shrink-0 overflow-visible ${animated ? 'is-animated' : ''} ${className}`}
    >
      <defs>
        {/* 1. Marco Azul Marino / Navy Corporativo */}
        <linearGradient id="geaNavyFrameGrad" x1="12" y1="10" x2="98" y2="88" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#0B2B67" />
          <stop offset="50%" stopColor="#004F9F" />
          <stop offset="100%" stopColor="#082255" />
        </linearGradient>

        {/* 2. Franja Superior Verde (Vida / Crecimiento) */}
        <linearGradient id="geaGreenBarGrad" x1="32" y1="24" x2="56" y2="35" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#009E49" />
          <stop offset="100%" stopColor="#22C55E" />
        </linearGradient>

        {/* 3. Franja Media Azul (Tecnología / Confianza) */}
        <linearGradient id="geaBlueBarGrad" x1="26" y1="42" x2="72" y2="53" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#004B9B" />
          <stop offset="100%" stopColor="#0077D7" />
        </linearGradient>

        {/* 4. Franja Inferior Rojo a Naranja (Pasión / Energía / Compromiso) */}
        <linearGradient id="geaRedOrangeBarGrad" x1="20" y1="60" x2="88" y2="71" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#C81D25" />
          <stop offset="60%" stopColor="#EA580C" />
          <stop offset="100%" stopColor="#F97316" />
        </linearGradient>

        {/* 5. Destello Shimmer Metálico Transversal */}
        <linearGradient id="geaSheenGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="rgba(255,255,255,0)" />
          <stop offset="40%" stopColor="rgba(255,255,255,0.03)" />
          <stop offset="50%" stopColor="rgba(255,255,255,0.5)" />
          <stop offset="60%" stopColor="rgba(255,255,255,0.03)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </linearGradient>

        {/* Filtro Resplandor Suave */}
        <filter id="geaEmblemGlow" x="-15%" y="-15%" width="130%" height="130%">
          <feDropShadow dx="0" dy="2.5" stdDeviation="3" floodColor="#004B9B" floodOpacity="0.25" />
        </filter>
      </defs>

      <g filter={isWhite ? 'none' : 'url(#geaEmblemGlow)'}>
        {/* ── A. MARCO DELTA ENVOLVENTE (Azul Marino / Navy) ── */}
        {/* Asta Ascendente Izquierda (Punta afilada de la pirámide y caída diagonal) */}
        <path
          d="M 12 84 
             C 10 84, 9 81, 10 78 
             L 34 11 
             C 35 9, 38 9, 39 12 
             L 43 23 
             C 44 26, 42 28, 39 30 
             L 28 53 
             C 27 57, 27 61, 28 65 
             L 30 81 
             C 30 83, 28 84, 26 84 
             Z"
          fill={isWhite ? '#FFFFFF' : 'url(#geaNavyFrameGrad)'}
          className="gea-delta-left-fin"
        />

        {/* Base Inferior y Ala Curva Derecha Ascendente */}
        <path
          d="M 14 84 
             L 84 84 
             C 89 84, 94 81, 97 76 
             L 101 69 
             C 103 65, 101 60, 97 59 
             L 92 58 
             C 89 58, 87 60, 86 63 
             L 83 69 
             C 81 72, 77 74, 73 74 
             L 20 74 
             C 16 74, 13 78, 14 84 
             Z"
          fill={isWhite ? '#FFFFFF' : 'url(#geaNavyFrameGrad)'}
          className="gea-delta-right-wing"
        />

        {/* ── B. LAS TRES FRANJAS INTERNAS DE COLOR (PIRÁMIDE DE NIVELES) ── */}
        {/* 1. Franja Superior (Verde) */}
        <rect
          x="32"
          y="24"
          width="24"
          height="11"
          rx="5.5"
          fill={isWhite ? '#FFFFFF' : 'url(#geaGreenBarGrad)'}
          className="gea-bar-green"
        />

        {/* 2. Franja Media (Azul) */}
        <rect
          x="26"
          y="42"
          width="46"
          height="11"
          rx="5.5"
          fill={isWhite ? '#FFFFFF' : 'url(#geaBlueBarGrad)'}
          className="gea-bar-blue"
        />

        {/* 3. Franja Inferior (Rojo / Naranja) */}
        <rect
          x="20"
          y="60"
          width="68"
          height="11"
          rx="5.5"
          fill={isWhite ? '#FFFFFF' : 'url(#geaRedOrangeBarGrad)'}
          className="gea-bar-red"
        />

        {/* ── C. CAPA DE DESTELLO SHIMMER METÁLICO ── */}
        {animated && !isWhite && (
          <g className="gea-sheen-overlay" pointerEvents="none">
            <rect
              x="0"
              y="0"
              width="110"
              height="98"
              fill="url(#geaSheenGrad)"
              className="gea-sheen-rect"
            />
          </g>
        )}
      </g>
    </svg>
  )
}

/**
 * GeaPyramidEmblem - Isotipo Oficial Corporativo Pirámide 3D con Órbitas (Azul, Verde y Rojo)
 * 100% vectorial, fondo transparente, sin marcos blancos.
 */
export function GeaPyramidEmblem({ className = 'w-9 h-9' }) {
  return (
    <svg
      viewBox="0 0 100 90"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`shrink-0 overflow-visible ${className}`}
    >
      <defs>
        {/* Degradado Cara Izquierda Pirámide (Sombra Metálica) */}
        <linearGradient id="pyrLeftFace" x1="28" y1="20" x2="42" y2="76" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#9C958C" />
          <stop offset="50%" stopColor="#8A837A" />
          <stop offset="100%" stopColor="#6E675E" />
        </linearGradient>

        {/* Degradado Cara Derecha Pirámide (Luz Metálica) */}
        <linearGradient id="pyrRightFace" x1="48" y1="20" x2="68" y2="76" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#E4E0D8" />
          <stop offset="50%" stopColor="#CCC7BC" />
          <stop offset="100%" stopColor="#ADA89E" />
        </linearGradient>

        {/* Sombra base suave */}
        <radialGradient id="pyrFloorShadow" cx="50" cy="80" r="38" fx="50" fy="80" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="rgba(0,0,0,0.14)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0)" />
        </radialGradient>
      </defs>

      {/* Sombra de suelo sutil */}
      <ellipse cx="48" cy="78" rx="36" ry="6" fill="url(#pyrFloorShadow)" />

      {/* ── 1. ÓRBITA AZUL (Parte Trasera) ── */}
      <path
        d="M 12 56 C 2 40 18 24 38 28"
        stroke="#004D9D"
        strokeWidth="4.2"
        strokeLinecap="round"
        fill="none"
      />

      {/* ── 2. PIRÁMIDE 3D ── */}
      {/* Cara Izquierda (Sombra) */}
      <path
        d="M 46 16 L 16 68 L 44 76 Z"
        fill="url(#pyrLeftFace)"
      />

      {/* Cara Derecha (Luz) */}
      <path
        d="M 46 16 L 44 76 L 82 64 Z"
        fill="url(#pyrRightFace)"
      />

      {/* Arista Central de la Pirámide */}
      <line x1="46" y1="16" x2="44" y2="76" stroke="rgba(255,255,255,0.45)" strokeWidth="1.2" />

      {/* ── 3. ÓRBITA VERDE (Superior / Frontal) ── */}
      <path
        d="M 32 38 C 42 20 74 18 82 34 C 88 46 64 56 46 48"
        stroke="#008836"
        strokeWidth="4.2"
        strokeLinecap="round"
        fill="none"
      />

      {/* ── 4. ÓRBITA AZUL (Parte Frontal) ── */}
      <path
        d="M 12 56 C 18 64 36 60 52 46"
        stroke="#004D9D"
        strokeWidth="4.2"
        strokeLinecap="round"
        fill="none"
      />

      {/* ── 5. ÓRBITA ROJA (Inferior / Delantera) ── */}
      <path
        d="M 24 68 C 34 82 72 78 84 62 C 92 50 78 44 64 50"
        stroke="#E30613"
        strokeWidth="4.2"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  )
}

/**
 * GeaPolygonalHead - Isotipo Oficial Fiel 1:1 al Vector Original de GEA PERU
 * Contiene la red de nodos, triangulaciones y el perfil facial exacto.
 */
export function GeaPolygonalHead({ className = 'w-9 h-9' }) {
  return (
    <svg 
      viewBox="100 50 180 175" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg" 
      className={`shrink-0 overflow-visible ${className}`}
    >
      {/* ── 1. RED DE LÍNEAS / TRIANGULACIÓN (Stroke: #007cc2) ── */}
      <g stroke="#007cc2" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round">
        {/* Contorno y Red Superior */}
        <line x1="180" y1="65" x2="142" y2="90" />
        <line x1="180" y1="65" x2="225" y2="75" />
        <line x1="180" y1="65" x2="182" y2="105" />

        {/* Conexiones de Nodos Superiores */}
        <line x1="142" y1="90" x2="128" y2="130" />
        <line x1="142" y1="90" x2="182" y2="105" />
        <line x1="182" y1="105" x2="218" y2="105" />
        <line x1="182" y1="105" x2="164" y2="135" />
        <line x1="182" y1="105" x2="202" y2="135" />
        <line x1="225" y1="75" x2="218" y2="105" />

        {/* Conexiones de Nodos Centrales */}
        <line x1="128" y1="130" x2="140" y2="170" />
        <line x1="128" y1="130" x2="164" y2="135" />
        <line x1="164" y1="135" x2="202" y2="135" />
        <line x1="164" y1="135" x2="140" y2="170" />
        <line x1="164" y1="135" x2="176" y2="168" />

        <line x1="202" y1="135" x2="176" y2="168" />
        <line x1="202" y1="135" x2="210" y2="168" />

        {/* Conexiones de Nodos Inferiores */}
        <line x1="140" y1="170" x2="172" y2="200" />
        <line x1="140" y1="170" x2="176" y2="168" />
        <line x1="176" y1="168" x2="172" y2="200" />
        <line x1="176" y1="168" x2="210" y2="202" />
        <line x1="176" y1="168" x2="210" y2="168" />
        <line x1="172" y1="200" x2="210" y2="202" />

        {/* Conexiones Internas hacia el Perfil Facial */}
        <line x1="218" y1="105" x2="240" y2="102" />
        <line x1="218" y1="105" x2="202" y2="135" />
        <line x1="202" y1="135" x2="230" y2="125" />
        <line x1="202" y1="135" x2="236" y2="152" />
        <line x1="210" y1="168" x2="210" y2="202" />
        <line x1="210" y1="168" x2="236" y2="152" />
        <line x1="210" y1="168" x2="240" y2="170" />
      </g>

      {/* ── 2. PERFIL FACIAL DERECHO CONTINUO (Frente, Nariz, Boca, Mentón, Mandíbula) ── */}
      <path 
        d="M 225 75 
           L 240 102 
           L 230 125 
           L 258 140 
           L 236 152 
           L 248 160 
           L 240 170 
           L 252 180 
           L 225 195 
           L 210 202" 
        stroke="#007cc2" 
        strokeWidth="5.5" 
        strokeLinecap="round" 
        strokeLinejoin="round" 
        fill="none" 
      />

      {/* ── 3. NODOS / VÉRTICES CIRCULARES ── */}
      {/* Nodos Azules (Superiores e Internos) */}
      <circle cx="180" cy="65" r="5.5" fill="#0099e6" stroke="#0f2c59" strokeWidth="2.2" />
      <circle cx="225" cy="75" r="5.5" fill="#0099e6" stroke="#0f2c59" strokeWidth="2.2" />
      <circle cx="182" cy="105" r="5.5" fill="#0099e6" stroke="#0f2c59" strokeWidth="2.2" />
      <circle cx="218" cy="105" r="5.5" fill="#0099e6" stroke="#0f2c59" strokeWidth="2.2" />
      <circle cx="164" cy="135" r="5.5" fill="#0099e6" stroke="#0f2c59" strokeWidth="2.2" />
      <circle cx="202" cy="135" r="5.5" fill="#0099e6" stroke="#0f2c59" strokeWidth="2.2" />
      <circle cx="176" cy="168" r="5.5" fill="#0099e6" stroke="#0f2c59" strokeWidth="2.2" />
      <circle cx="210" cy="168" r="5.5" fill="#0099e6" stroke="#0f2c59" strokeWidth="2.2" />
      <circle cx="210" cy="202" r="5.5" fill="#0099e6" stroke="#0f2c59" strokeWidth="2.2" />

      {/* Nodos Grises / Slate (Posteriores / Espalda) */}
      <circle cx="142" cy="90" r="6" fill="#5e6e82" stroke="#0f2c59" strokeWidth="2.2" />
      <circle cx="128" cy="130" r="6" fill="#5e6e82" stroke="#0f2c59" strokeWidth="2.2" />
      <circle cx="140" cy="170" r="6" fill="#5e6e82" stroke="#0f2c59" strokeWidth="2.2" />
      <circle cx="172" cy="200" r="6" fill="#5e6e82" stroke="#0f2c59" strokeWidth="2.2" />
    </svg>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// RiseWord — Animación moderna: letras que suben con fade escalonado
// Estilo Apple / Vercel / Linear — limpio, preciso, sin parpadeos
// IN:  izquierda → derecha  |  OUT: derecha → izquierda (reverso)
// ─────────────────────────────────────────────────────────────────────────────
function RiseWord({ text, color, fontSize, fontWeight, letterSpacing, holdMs = 2800, pauseMs = 600, riseDelay = 0 }) {
  const [visible, setVisible] = useState(false)
  const timerRef = useRef([])

  const chars = text.split('')
  const n = chars.length
  const IN_STEP  = 38   // ms entre letras (entrada)
  const OUT_STEP = 28   // ms entre letras (salida, un poco más rápido)
  const IN_DUR   = 320  // duración transición entrada
  const OUT_DUR  = 220  // duración transición salida

  // Tiempo que tarda la última letra en terminar su transición
  const totalInMs  = (n - 1) * IN_STEP  + IN_DUR  + 40
  const totalOutMs = (n - 1) * OUT_STEP + OUT_DUR + 40

  const clearAll = () => { timerRef.current.forEach(clearTimeout); timerRef.current = [] }

  useEffect(() => {
    const cycle = () => {
      clearAll()
      // — Fase IN —
      timerRef.current.push(setTimeout(() => {
        setVisible(true)
        // — Fase HOLD → OUT —
        timerRef.current.push(setTimeout(() => {
          setVisible(false)
          // — Pausa → siguiente ciclo —
          timerRef.current.push(setTimeout(cycle, totalOutMs + pauseMs))
        }, totalInMs + holdMs))
      }, riseDelay))
    }
    cycle()
    return clearAll
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <span
      aria-label={text}
      style={{
        display: 'inline-flex',
        letterSpacing,
        fontSize,
        fontWeight,
        lineHeight: 1.1,
        userSelect: 'none',
        // Reserva espacio fijo para evitar layout shifts
        minWidth: '1ch',
        overflow: 'hidden',
        paddingBottom: '0.1em',
      }}
    >
      {chars.map((ch, i) => {
        // Para IN: i=0 primero (izquierda → derecha)
        // Para OUT: i=(n-1) primero (derecha → izquierda)
        const inDelay  = i * IN_STEP
        const outDelay = (n - 1 - i) * OUT_STEP

        return (
          <span
            key={i}
            aria-hidden="true"
            style={{
              display: 'inline-block',
              color,
              willChange: 'transform, opacity',
              opacity: visible ? 1 : 0,
              transform: visible
                ? 'translateY(0) skewX(0deg)'
                : 'translateY(60%) skewX(-4deg)',
              transition: visible
                ? `opacity ${IN_DUR}ms cubic-bezier(0.22,1,0.36,1) ${inDelay}ms, transform ${IN_DUR}ms cubic-bezier(0.22,1,0.36,1) ${inDelay}ms`
                : `opacity ${OUT_DUR}ms ease-in ${outDelay}ms, transform ${OUT_DUR}ms ease-in ${outDelay}ms`,
              // Espacio no-colapsable
              whiteSpace: ch === ' ' ? 'pre' : 'normal',
            }}
          >
            {ch}
          </span>
        )
      })}
    </span>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// SidebarHeadset / SidebarEyes — Call Center Live & Operations Widget
// Headset dinámico de teleoperador con LED activo, ecualizador de voz y
// badge 'LIVE' interactivo para Operaciones, Formación, Reclutamiento y Jefatura.
// ─────────────────────────────────────────────────────────────────────────────

const CALL_CENTER_MODES = [
  {
    id: 'live',
    label: 'LIVE',
    role: 'Operaciones',
    desc: 'Operaciones · Línea Activa',
    primary: '#10B981', // Verde esmeralda / neon
    glow: 'rgba(16, 185, 129, 0.65)',
    bg: 'rgba(16, 185, 129, 0.12)',
    border: 'rgba(16, 185, 129, 0.35)',
  },
  {
    id: 'training',
    label: 'TRAIN',
    role: 'Formación',
    desc: 'Formadores · En Capacitación',
    primary: '#06B6D4', // Cyan eléctrico
    glow: 'rgba(6, 182, 212, 0.65)',
    bg: 'rgba(6, 182, 212, 0.12)',
    border: 'rgba(6, 182, 212, 0.35)',
  },
  {
    id: 'recruiting',
    label: 'RECRUIT',
    role: 'Reclutamiento',
    desc: 'Reclutadores · Entrevistas',
    primary: '#F59E0B', // Ámbar / Naranja
    glow: 'rgba(245, 158, 11, 0.65)',
    bg: 'rgba(245, 158, 11, 0.12)',
    border: 'rgba(245, 158, 11, 0.35)',
  },
  {
    id: 'chief',
    label: 'CHIEF',
    role: 'Jefatura',
    desc: 'Jefatura · Monitoreo y QC',
    primary: '#A855F7', // Violeta / Púrpura VIP
    glow: 'rgba(168, 85, 247, 0.65)',
    bg: 'rgba(168, 85, 247, 0.12)',
    border: 'rgba(168, 85, 247, 0.35)',
  },
]

export function SidebarHeadset({ collapsed = false, onDoubleClick }) {
  const [modeIdx, setModeIdx] = useState(0)
  const [isClicking, setIsClicking] = useState(false)
  const mode = CALL_CENTER_MODES[modeIdx]

  const handleClick = (e) => {
    e.stopPropagation()
    setIsClicking(true)
    setModeIdx((prev) => (prev + 1) % CALL_CENTER_MODES.length)
    setTimeout(() => setIsClicking(false), 260)
  }

  return (
    <div
      onClick={handleClick}
      onDoubleClick={onDoubleClick}
      title={`Call Center GEA · ${mode.desc}\n• Clic: Cambiar rol (Operaciones / Formación / Reclutamiento / Jefatura)\n• Doble clic: Easter egg`}
      style={{
        cursor: 'pointer',
        userSelect: 'none',
      }}
      className={`group relative flex items-center transition-all duration-300 ${
        collapsed
          ? 'justify-center p-1 rounded-xl'
          : 'gap-2 px-2.5 py-1.5 rounded-xl border'
      }`}
    >
      {/* Estilos CSS embebidos para animaciones de ecualizador y pulso */}
      <style>{`
        @keyframes geaEqBar1 {
          0%, 100% { height: 5px; opacity: 0.6; }
          50% { height: 16px; opacity: 1; }
        }
        @keyframes geaEqBar2 {
          0%, 100% { height: 14px; opacity: 0.9; }
          35% { height: 6px; opacity: 0.5; }
          70% { height: 18px; opacity: 1; }
        }
        @keyframes geaEqBar3 {
          0%, 100% { height: 9px; opacity: 0.7; }
          45% { height: 19px; opacity: 1; }
          80% { height: 8px; opacity: 0.6; }
        }
        @keyframes geaEqBar4 {
          0%, 100% { height: 16px; opacity: 1; }
          50% { height: 6px; opacity: 0.5; }
        }
        @keyframes geaBeaconPing {
          0% { transform: scale(1); opacity: 0.8; }
          80%, 100% { transform: scale(2.4); opacity: 0; }
        }
        @keyframes geaMicGlow {
          0%, 100% { filter: drop-shadow(0 0 2px var(--mic-glow)); }
          50% { filter: drop-shadow(0 0 7px var(--mic-glow)); }
        }
      `}</style>

      {/* Contenedor dinámico según esté colapsado o expandido */}
      <div
        style={{
          '--mic-glow': mode.primary,
          background: collapsed ? 'transparent' : mode.bg,
          borderColor: collapsed ? 'transparent' : mode.border,
          boxShadow: isClicking ? `0 0 16px ${mode.glow}` : 'none',
          transform: isClicking ? 'scale(0.96)' : 'scale(1)',
          transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
        className={`flex items-center gap-2 ${
          collapsed
            ? 'p-1 rounded-lg hover:bg-white/10'
            : 'px-2 py-1 rounded-lg border border-opacity-40 backdrop-blur-sm'
        }`}
      >
        {/* 🎧 SVG Headset Call Center */}
        <div className="relative shrink-0 flex items-center justify-center">
          <svg
            width={collapsed ? "26" : "28"}
            height={collapsed ? "26" : "28"}
            viewBox="0 0 32 32"
            fill="none"
            className="overflow-visible"
            style={{
              animation: 'geaMicGlow 2.5s ease-in-out infinite',
              filter: `drop-shadow(0 0 4px ${mode.glow})`,
            }}
          >
            {/* Diadema superior (arco con grosor) */}
            <path
              d="M 6 17 A 10 10 0 0 1 26 17"
              stroke={mode.primary}
              strokeWidth="2.4"
              strokeLinecap="round"
              fill="none"
            />
            {/* Almohadilla superior central */}
            <path
              d="M 11 8 A 12 12 0 0 1 21 8"
              stroke="#FFFFFF"
              strokeWidth="2.8"
              strokeLinecap="round"
              fill="none"
              opacity="0.35"
            />

            {/* Auricular izquierdo (earpad) */}
            <rect
              x="3.5"
              y="13.5"
              width="4.5"
              height="9"
              rx="2.2"
              fill={mode.primary}
              opacity="0.95"
            />
            <rect
              x="4.5"
              y="15"
              width="2.5"
              height="6"
              rx="1.2"
              fill="#FFFFFF"
              opacity="0.5"
            />

            {/* Auricular derecho (earpad) */}
            <rect
              x="24"
              y="13.5"
              width="4.5"
              height="9"
              rx="2.2"
              fill={mode.primary}
              opacity="0.95"
            />
            <rect
              x="25"
              y="15"
              width="2.5"
              height="6"
              rx="1.2"
              fill="#FFFFFF"
              opacity="0.5"
            />

            {/* Brazo de micrófono flexible que baja hacia adelante */}
            <path
              d="M 25 21 C 24 26.5 17 28 12.5 26.5"
              stroke={mode.primary}
              strokeWidth="1.9"
              strokeLinecap="round"
              fill="none"
            />

            {/* Cápsula del micrófono */}
            <rect
              x="8.5"
              y="24.5"
              width="4.5"
              height="3"
              rx="1.4"
              fill="#1E293B"
              stroke={mode.primary}
              strokeWidth="1"
            />

            {/* LED de micrófono activo (punto brillante + halo de pulso) */}
            <circle
              cx="9.5"
              cy="26"
              r="1.4"
              fill="#FFFFFF"
            />
            <circle
              cx="9.5"
              cy="26"
              r="1.4"
              fill={mode.primary}
              opacity="0.75"
            />
          </svg>

          {/* Halo de pulso del headset */}
          <span
            className="absolute rounded-full pointer-events-none"
            style={{
              width: '10px',
              height: '10px',
              left: '4px',
              bottom: '1px',
              background: mode.primary,
              animation: 'geaBeaconPing 2s cubic-bezier(0, 0, 0.2, 1) infinite',
            }}
          />
        </div>

        {/* 📊 Ecualizador de Audio + Badge LIVE (visible cuando la barra está expandida) */}
        {!collapsed && (
          <div className="flex items-center gap-2 pl-0.5">
            {/* Barras de onda de voz / ecualizador */}
            <div
              className="flex items-center gap-[2.5px] h-5 px-1 py-0.5 rounded"
              title="Tráfico de Voz Activo"
            >
              <span
                className="w-[2.5px] rounded-full"
                style={{
                  background: mode.primary,
                  boxShadow: `0 0 4px ${mode.glow}`,
                  animation: 'geaEqBar1 0.75s ease-in-out infinite',
                }}
              />
              <span
                className="w-[2.5px] rounded-full"
                style={{
                  background: mode.primary,
                  boxShadow: `0 0 4px ${mode.glow}`,
                  animation: 'geaEqBar2 0.65s ease-in-out infinite',
                }}
              />
              <span
                className="w-[2.5px] rounded-full"
                style={{
                  background: mode.primary,
                  boxShadow: `0 0 4px ${mode.glow}`,
                  animation: 'geaEqBar3 0.85s ease-in-out infinite',
                }}
              />
              <span
                className="w-[2.5px] rounded-full"
                style={{
                  background: mode.primary,
                  boxShadow: `0 0 4px ${mode.glow}`,
                  animation: 'geaEqBar4 0.7s ease-in-out infinite',
                }}
              />
            </div>

            {/* Separador sutil */}
            <span
              className="w-[1px] h-3.5 opacity-30"
              style={{ background: mode.primary }}
            />

            {/* Badge de Rol y Estado */}
            <div className="flex flex-col leading-none">
              <div className="flex items-center gap-1">
                {/* Punto emisor beacon */}
                <span className="relative flex h-1.5 w-1.5">
                  <span
                    className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
                    style={{ background: mode.primary }}
                  />
                  <span
                    className="relative inline-flex rounded-full h-1.5 w-1.5"
                    style={{ background: mode.primary }}
                  />
                </span>

                <span
                  className="font-black text-[10px] tracking-wider"
                  style={{
                    color: mode.primary,
                    textShadow: `0 0 8px ${mode.glow}`,
                    fontFamily: 'system-ui, -apple-system, sans-serif',
                  }}
                >
                  {mode.label}
                </span>
              </div>

              <span
                className="text-[8.5px] font-semibold tracking-tight text-slate-400 group-hover:text-slate-200 transition-colors"
                style={{ marginTop: '1px' }}
              >
                {mode.role}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// Alias de retrocompatibilidad para no romper importaciones existentes
export const SidebarEyes = SidebarHeadset



// ─────────────────────────────────────────────────────────────────────────────
// GeaLogo - Logotipo Oficial Corporativo GEA PERÚ / Workforce Management
// ─────────────────────────────────────────────────────────────────────────────
export default function GeaLogo({ 
  collapsed = false, 
  size = 'medium',
  showText = true,
  showTagline = true,
  subtitle = 'WORKFORCE MANAGEMENT',
  showSubtitle = true,
  variant = 'modern', // 'modern' | 'polygonal' | 'pyramid'
  className = '' 
}) {
  const iconSizeClass = collapsed 
    ? 'w-8 h-8' 
    : size === 'large' 
      ? 'w-14 h-14' 
      : size === 'small' 
        ? 'w-7.5 h-7.5' 
        : 'w-10 h-10'

  const EmblemComponent = variant === 'polygonal' 
    ? GeaPolygonalHead 
    : variant === 'pyramid' 
      ? GeaPyramidEmblem 
      : GeaModernDeltaEmblem

  const isLarge = size === 'large'

  if (collapsed) {
    return (
      <div className={`flex items-center justify-center p-1 ${className}`} title="GEA PERÚ - Workforce Management">
        <EmblemComponent className={iconSizeClass} />
      </div>
    )
  }

  return (
    <div className={`flex items-center gap-3 select-none ${className}`}>
      {/* Isotipo Oficial */}
      <div className="shrink-0 flex items-center justify-center">
        <EmblemComponent className={iconSizeClass} />
      </div>

      {/* Tipografía con animación rise staggered */}
      {showText && (
        <div className="flex flex-col min-w-0 leading-tight" style={{ gap: '1px' }}>

          {/* ── Línea 1: "GEA PERÚ" ── */}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '5px', overflow: 'hidden' }}>
            {/* GEA: blanco puro en dark, azul marino en light */}
            <RiseWord
              text="GEA"
              color="var(--logo-primary, #FFFFFF)"
              fontSize={isLarge ? '1.5rem' : '1.25rem'}
              fontWeight={900}
              letterSpacing="-0.02em"
              holdMs={2800}
              pauseMs={500}
              riseDelay={0}
            />
            {/* PERÚ: sky accent en dark, azul en light */}
            <RiseWord
              text="PERÚ"
              color="var(--logo-accent, #38BDF8)"
              fontSize={isLarge ? '1rem' : '0.8rem'}
              fontWeight={800}
              letterSpacing="0.06em"
              holdMs={2800}
              pauseMs={500}
              riseDelay={120}
            />
          </div>

          {/* ── Línea 2: Subtítulo ── */}
          {showSubtitle && subtitle && (
            <RiseWord
              text={subtitle}
              color="var(--logo-subtitle, #CBD5E1)"
              fontSize={isLarge ? '0.625rem' : '0.53rem'}
              fontWeight={900}
              letterSpacing="0.1em"
              holdMs={3000}
              pauseMs={600}
              riseDelay={260}
            />
          )}

          {/* ── Línea 3: Tagline ── */}
          {showTagline && (
            <RiseWord
              text="GEA PIENSA EN TI"
              color="var(--logo-tagline, #64748B)"
              fontSize={isLarge ? '0.53rem' : '0.47rem'}
              fontWeight={700}
              letterSpacing="0.12em"
              holdMs={3500}
              pauseMs={800}
              riseDelay={380}
            />
          )}
        </div>
      )}
    </div>
  )
}
