import React from 'react'

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

/**
 * GeaLogo - Logotipo Oficial Corporativo GEA PERU Workforce Management
 */
export default function GeaLogo({ 
  collapsed = false, 
  size = 'medium',
  showText = true,
  showTagline = true,
  className = '' 
}) {
  const iconSizeClass = collapsed 
    ? 'w-8 h-8' 
    : size === 'large' 
      ? 'w-14 h-14' 
      : size === 'small' 
        ? 'w-7.5 h-7.5' 
        : 'w-10 h-10'

  if (collapsed) {
    return (
      <div className={`flex items-center justify-center p-1 ${className}`} title="GEA PERU - Workforce Management">
        <GeaPolygonalHead className={iconSizeClass} />
      </div>
    )
  }

  return (
    <div className={`flex items-center gap-3.5 select-none ${className}`}>
      {/* Isotipo: Cabeza Poligonal Red Neuronal */}
      <div className="shrink-0 flex items-center justify-center">
        <GeaPolygonalHead className={iconSizeClass} />
      </div>

      {/* Tipografía Oficial */}
      {showText && (
        <div className="flex flex-col min-w-0 leading-none">
          <div className="flex items-center gap-1.5">
            <span className={`font-black tracking-tight font-sans text-[var(--text-primary)] ${
              size === 'large' ? 'text-2xl' : 'text-lg'
            }`}>
              GEA
            </span>
            <span className={`font-black tracking-tight font-sans text-[#007cc2] dark:text-[#38bdf8] ${
              size === 'large' ? 'text-2xl' : 'text-lg'
            }`}>
              PERU
            </span>
          </div>
          {showTagline && (
            <span className={`font-medium tracking-normal text-[var(--text-muted)] mt-1 truncate ${
              size === 'large' ? 'text-xs' : 'text-[10.5px]'
            }`}>
              Workforce Management
            </span>
          )}
        </div>
      )}
    </div>
  )
}
