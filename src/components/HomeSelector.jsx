import React, { useState, useRef } from 'react'
import { GeaModernDeltaEmblem } from './GeaLogo'
import GeaMascotCompanion from './GeaMascotCompanion'
import '../styles/homeSelector.css'

/**
 * Extrae de forma inteligente el nombre de pila real del usuario,
 * detectando y evitando tomar los apellidos paterno/materno cuando el nombre
 * viene registrado en formato institucional peruano (ej. "APELLIDO_PAT APELLIDO_MAT NOMBRE" -> "Nombre").
 */
function resolveDisplayName(profile) {
  if (!profile) return 'Colaborador'

  // 1. Si el perfil tiene explícitamente primer_nombre
  if (profile.primer_nombre) {
    const fn = String(profile.primer_nombre).trim()
    if (fn) return fn.charAt(0).toUpperCase() + fn.slice(1).toLowerCase()
  }

  // 2. Si tiene nombres o nombres_completos explícitos (sin apellidos)
  const explicitNombres = profile.nombres_completos || profile.nombres || profile.first_name
  if (explicitNombres) {
    const fn = String(explicitNombres).trim().split(/\s+/)[0]
    if (fn) return fn.charAt(0).toUpperCase() + fn.slice(1).toLowerCase()
  }

  // 3. Cadena completa registrada en el perfil
  const raw = String(profile.nombre_completo || profile.nombre || profile.name || '').trim()
  
  // Si no hay nombre registrado, intentar extraer del email o rol
  if (!raw) {
    if (profile.email) {
      const emailPrefix = String(profile.email).split('@')[0].split(/[._-]/)[0]
      if (emailPrefix) {
        return emailPrefix.charAt(0).toUpperCase() + emailPrefix.slice(1).toLowerCase()
      }
    }
    if (profile.rol) {
      return profile.rol.charAt(0).toUpperCase() + profile.rol.slice(1).toLowerCase()
    }
    return 'Colaborador'
  }

  const parts = raw.split(/\s+/).filter(Boolean)
  if (parts.length === 1) {
    return parts[0].charAt(0).toUpperCase() + parts[0].slice(1).toLowerCase()
  }

  // Si tiene apellido paterno registrado y coincide con la primera palabra
  const apPaterno = String(profile.apellido_paterno || '').trim().toLowerCase()
  if (apPaterno && parts[0].toLowerCase() === apPaterno) {
    const target = parts.length >= 3 ? parts[2] : parts[1]
    return target.charAt(0).toUpperCase() + target.slice(1).toLowerCase()
  }

  // Heurística estándar para formato de nómina/RRHH peruano:
  // [Apellido Paterno] [Apellido Materno] [Nombre 1] [Nombre 2...] (3 o más palabras)
  if (parts.length >= 3) {
    const target = parts[2]
    return target.charAt(0).toUpperCase() + target.slice(1).toLowerCase()
  }

  // Si tiene 2 palabras:
  if (parts.length === 2) {
    // Si la 2da palabra es el apellido conocido
    if (apPaterno && parts[1].toLowerCase() === apPaterno) {
      return parts[0].charAt(0).toUpperCase() + parts[0].slice(1).toLowerCase()
    }
    return parts[0].charAt(0).toUpperCase() + parts[0].slice(1).toLowerCase()
  }

  return parts[0].charAt(0).toUpperCase() + parts[0].slice(1).toLowerCase()
}

function resolveInitials(profile, firstName) {
  if (!profile) return firstName || 'GEA'

  const ap = profile?.apellido_paterno || ''
  if (ap) {
    return `${firstName} ${ap.charAt(0).toUpperCase()}.`
  }
  const raw = String(profile?.nombre_completo || profile?.nombre || '').trim()
  const parts = raw.split(/\s+/).filter(Boolean)
  if (parts.length >= 3) {
    // En formato peruano (PATERNO MATERNO NOMBRES), el apellido paterno es parts[0]
    return `${firstName} ${parts[0].charAt(0).toUpperCase()}.`
  }
  if (parts.length === 2) {
    // Formato Nombre Apellido
    return `${firstName} ${parts[1].charAt(0).toUpperCase()}.`
  }
  return firstName
}

/**
 * Genera un saludo inclusivo, profesional y dinámico según la hora del día.
 * Elimina la marca de género ("Bienvenido/a") usando fórmulas naturales.
 */
function resolveTimeGreeting() {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'Buenos días';
  if (hour >= 12 && hour < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

/**
 * VisionGlassCard - Tarjeta Monolítica Minimalista de Cristal Líquido (Vision Glass)
 * - Superficie continua unificada sin particiones visuales.
 * - Sutil inclinación en perspectiva 3D reactiva al cursor.
 * - Reflejo especular holográfico de luz suave.
 */
function VisionGlassCard({
  children,
  className = '',
  onClick,
  accentColor = '#005BAC',
  glowRgba = 'rgba(0, 91, 172, 0.22)'
}) {
  const cardRef = useRef(null);
  const [transformStyle, setTransformStyle] = useState({});

  const handleMouseMove = (e) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const rotateX = ((y - centerY) / centerY) * -5.5;
    const rotateY = ((x - centerX) / centerX) * 5.5;

    cardRef.current.style.setProperty('--mouse-x', `${x}px`);
    cardRef.current.style.setProperty('--mouse-y', `${y}px`);

    setTransformStyle({
      transform: `perspective(1000px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg) translate3d(0, -6px, 0)`,
      transition: 'transform 0.08s ease-out'
    });
  };

  const handleMouseLeave = () => {
    setTransformStyle({
      transform: 'perspective(1000px) rotateX(0deg) rotateY(0deg) translate3d(0, 0, 0)',
      transition: 'transform 0.45s cubic-bezier(0.16, 1, 0.3, 1)'
    });
  };

  return (
    <div
      ref={cardRef}
      className={`vision-glass-card ${className}`}
      style={{
        ...transformStyle,
        '--card-accent': accentColor,
        '--card-glow': glowRgba
      }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick && onClick()}
    >
      <div className="vision-card-glare" />
      <div className="vision-card-inner">
        {children}
      </div>
    </div>
  );
}

export default function HomeSelector({
  userProfile,
  onSelectWorkforce,
  ojtUrl = 'https://dashboard-ojt.geaperu.com',
  csatUrl = 'https://encuesta-de-satisfaccion-eight.vercel.app/',
  onNavigateNav
}) {
  const [activeChip, setActiveChip] = useState('Todos')
  const [hoveredModule, setHoveredModule] = useState(null)

  // Obtener nombre de pila real inteligentemente en vez de apellido
  const firstName = resolveDisplayName(userProfile)
  const avatarLabel = resolveInitials(userProfile, firstName)
  const greeting = resolveTimeGreeting()

  const chips = ['Todos', 'Más usados', 'Analítica', 'Favoritos']

  const handleModuleClick = (type) => {
    if (type === 'workforce') {
      if (onSelectWorkforce) onSelectWorkforce()
    } else if (type === 'ojt') {
      if (ojtUrl && ojtUrl !== '#') {
        window.open(ojtUrl, '_blank', 'noopener,noreferrer')
      } else if (onSelectWorkforce) {
        onSelectWorkforce('ojt')
      }
    } else if (type === 'csat') {
      if (csatUrl && csatUrl !== '#') {
        window.open(csatUrl, '_blank', 'noopener,noreferrer')
      } else if (onSelectWorkforce) {
        onSelectWorkforce('csat')
      }
    }
  }

  // Filtrado de tarjetas según el chip seleccionado
  const shouldShowCard = (cardType) => {
    if (activeChip === 'Todos') return true
    if (activeChip === 'Más usados') return true
    if (activeChip === 'Analítica') return cardType === 'workforce' || cardType === 'ojt'
    if (activeChip === 'Favoritos') return cardType === 'workforce'
    return true
  }

  return (
    <div className="home-selector-wrapper">
      {/* Fondo Ambiental Dinámico con Capa Futurista (INTACTO SEGÚN INSTRUCCIÓN) */}
      <div className="ambient-bg" aria-hidden="true">
        {/* Grid de puntos sutil estático */}
        <div className="neural-grid-pattern"></div>

        {/* Líneas de conexión tipo red neuronal / circuitos */}
        <svg
          className="neural-network-canvas"
          viewBox="0 0 1440 900"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          preserveAspectRatio="xMidYMid slice"
        >
          {/* Líneas animadas */}
          <path className="neural-line neural-line-1" d="M 120 180 L 280 180 L 360 260 L 480 260" strokeWidth="1" />
          <path className="neural-line neural-line-2" d="M 1340 140 L 1200 140 L 1120 220 L 980 220" strokeWidth="1" />
          <path className="neural-line neural-line-3" d="M 80 480 L 220 480 L 300 400 L 420 400" strokeWidth="1" />
          <path className="neural-line neural-line-4" d="M 1380 520 L 1240 520 L 1160 600 L 1020 600" strokeWidth="1" />
          <path className="neural-line neural-line-5" d="M 140 760 L 280 760 L 360 680 L 500 680" strokeWidth="1" />
          <path className="neural-line neural-line-6" d="M 1300 780 L 1160 780 L 1080 840 L 940 840" strokeWidth="1" />
          <path className="neural-line neural-line-7" d="M 600 100 L 700 100 L 760 160 L 860 160" strokeWidth="1" />
          <path className="neural-line neural-line-8" d="M 220 340 L 320 340 L 380 400" strokeWidth="1" />

          {/* Nodos con pulso sutil */}
          <circle className="neural-node neural-node-1" cx="120" cy="180" r="3.5" />
          <circle className="neural-node neural-node-1" cx="480" cy="260" r="3.5" />
          <circle className="neural-node neural-node-2" cx="1340" cy="140" r="3.5" />
          <circle className="neural-node neural-node-2" cx="980" cy="220" r="3.5" />
          <circle className="neural-node neural-node-3" cx="80" cy="480" r="3.5" />
          <circle className="neural-node neural-node-3" cx="420" cy="400" r="3.5" />
          <circle className="neural-node neural-node-4" cx="1380" cy="520" r="3.5" />
          <circle className="neural-node neural-node-4" cx="1020" cy="600" r="3.5" />
          <circle className="neural-node neural-node-5" cx="140" cy="760" r="3.5" />
          <circle className="neural-node neural-node-5" cx="500" cy="680" r="3.5" />
          <circle className="neural-node neural-node-6" cx="1300" cy="780" r="3.5" />
          <circle className="neural-node neural-node-6" cx="940" cy="840" r="3.5" />
          <circle className="neural-node neural-node-7" cx="600" cy="100" r="3.5" />
          <circle className="neural-node neural-node-7" cx="860" cy="160" r="3.5" />
          <circle className="neural-node neural-node-8" cx="220" cy="340" r="3.5" />
          <circle className="neural-node neural-node-8" cx="380" cy="400" r="3.5" />
        </svg>

        {/* Manchas difuminadas ambientales */}
        <span className="b1"></span>
        <span className="b2"></span>
        <span className="b3"></span>
        <span className="b4"></span>
      </div>

      {/* Header / Nav */}
      <header className="reveal-nav">
        <div className="home-container nav-inner">
          <div className="brand-section">
            <div 
              className="flex items-center gap-3.5 cursor-pointer select-none group" 
              onClick={() => setActiveChip('Todos')}
              title="GEA PERÚ - Workforce Management"
            >
              {/* Isotipo Oficial Corporativo GEA (3 Franjas de Color Animadas) */}
              <GeaModernDeltaEmblem 
                className="w-11 h-11 group-hover:scale-105 transition-transform duration-300" 
                animated={true}
              />
              
              <div className="flex flex-col leading-tight">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-[22px] font-black tracking-tight text-[#0A2558] font-sans">GEA</span>
                  <span className="text-[13px] font-extrabold tracking-wider text-[#1D4ED8] font-sans uppercase">PERÚ</span>
                </div>
                <span className="text-[9.5px] font-black tracking-wider text-[#005BAC] uppercase mt-0.5">
                  WORKFORCE MANAGEMENT
                </span>
                <span className="text-[7.5px] font-bold text-[#64748B] tracking-widest uppercase mt-0.5">
                  GEA PIENSA EN TI
                </span>
              </div>
            </div>
          </div>

          {/* Perfil de Usuario */}
          <div
            className="avatar-chip-pill"
            onClick={() => onSelectWorkforce && onSelectWorkforce('perfil')}
            title="Ver perfil de usuario"
          >
            <svg viewBox="0 0 32 32" fill="none">
              <circle cx="16" cy="16" r="16" fill="#E8F0FE" />
              <circle cx="16" cy="13" r="5.5" fill="var(--g-blue)" />
              <path d="M5 28c0-6.6 5.4-11 11-11s11 4.4 11 11" fill="var(--g-blue)" />
            </svg>
            <span>{avatarLabel}</span>
          </div>
        </div>
      </header>

      {/* Main Content Hero */}
      <main className="py-10 pb-24">
        <div className="home-container">
          {/* Main Content Hero */}
          <div className="hero-content">
            <h1 className="reveal-1">
              {greeting}, <span className="name-accent">{firstName}</span>
            </h1>
            <p className="reveal-2">Selecciona el módulo al que deseas acceder.</p>

            {/* Chips de Filtro */}
            <div className="chips-row reveal-3">
              {chips.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  className={`chip-btn ${activeChip === chip ? 'active' : ''}`}
                  onClick={() => setActiveChip(chip)}
                >
                  {chip}
                </button>
              ))}
            </div>
          </div>

          {/* Grid de 3 Tarjetas de Módulos (Estilo Vision Glass - Apple VisionOS Minimalist) */}
          <div className="modules-grid">
            {/* 1. Tarjeta Portal Workforce */}
            {shouldShowCard('workforce') && (
              <VisionGlassCard
                className="vision-card-workforce reveal-card"
                onClick={() => handleModuleClick('workforce')}
                accentColor="#005BAC"
                glowRgba="rgba(0, 91, 172, 0.25)"
              >
                {/* Header Superior: Icono de Cristal + Status en Vivo + Flecha Esquina */}
                <div className="vision-header-row">
                  <div className="vision-icon-squircle icon-blue">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                      <circle cx="9" cy="7" r="4" />
                      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                    </svg>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="vision-status-chip chip-blue">
                      <span className="vision-pulse-dot dot-blue" />
                      1,077 Activos
                    </span>
                    <div className="vision-corner-arrow">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M7 17L17 7M17 7H7M17 7V17" />
                      </svg>
                    </div>
                  </div>
                </div>

                {/* Identidad y Tipografía Limpia */}
                <div className="vision-info-group">
                  <div className="vision-pretitle-tag tag-blue">Core Operativo</div>
                  <h2 className="vision-card-title">Reclutamiento & Capacitación</h2>
                  <p className="vision-card-desc">
                    Control integral de nóminas, marcación de asistencia en tiempo real, evaluaciones y embudo formativo.
                  </p>
                </div>

                {/* Superficie de Telemetría Integrada (Sin cortes de banner) */}
                <div className="vision-telemetry-surface">
                  <div className="vision-kpi-grid">
                    <div className="vision-kpi-item">
                      <span className="kpi-micro-label">Asistencia Hoy</span>
                      <div className="flex items-center justify-between mt-1">
                        <span className="kpi-big-num text-[#005BAC]">98.4%</span>
                        <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                          Óptimo
                        </span>
                      </div>
                      <div className="vision-progress-track mt-1.5">
                        <div className="vision-progress-bar bg-[#005BAC]" style={{ width: '98.4%' }} />
                      </div>
                    </div>

                    <div className="vision-kpi-item">
                      <span className="kpi-micro-label">Postulantes</span>
                      <div className="flex items-center justify-between mt-1">
                        <span className="kpi-big-num text-slate-800">+32</span>
                        <div className="flex -space-x-1.5">
                          <span className="w-5 h-5 rounded-full bg-blue-600 text-[9px] font-black text-white flex items-center justify-center ring-1 ring-white">RP</span>
                          <span className="w-5 h-5 rounded-full bg-emerald-500 text-[9px] font-black text-white flex items-center justify-center ring-1 ring-white">JA</span>
                          <span className="w-5 h-5 rounded-full bg-amber-500 text-[9px] font-black text-white flex items-center justify-center ring-1 ring-white">ML</span>
                        </div>
                      </div>
                      <span className="text-[10px] font-semibold text-slate-400 mt-1 block">Registrados hoy</span>
                    </div>
                  </div>

                  {/* Accesos Rápidos Directos con 1 Clic */}
                  <div className="vision-actions-wrapper" onClick={(e) => e.stopPropagation()}>
                    <span className="vision-actions-title">Accesos Directos Rápidos:</span>
                    <div className="vision-action-pills">
                      <button
                        type="button"
                        onClick={() => onSelectWorkforce && onSelectWorkforce('asistencia')}
                        className="vision-pill-btn pill-green"
                        title="Ir directo al Registro y Marcación de Asistencia"
                      >
                        <span className="pill-dot bg-emerald-500" />
                        Marcación Asistencia
                      </button>
                      <button
                        type="button"
                        onClick={() => onSelectWorkforce && onSelectWorkforce('scorecard_individual')}
                        className="vision-pill-btn pill-blue"
                        title="Ver Rendimiento Individual y Rankings"
                      >
                        <span className="pill-dot bg-blue-500" />
                        Mis KPIs 360°
                      </button>
                      <button
                        type="button"
                        onClick={() => onSelectWorkforce && onSelectWorkforce('resumen_capacitacion')}
                        className="vision-pill-btn pill-indigo"
                        title="Ver Resumen de Dotación y Deserción"
                      >
                        <span className="pill-dot bg-indigo-500" />
                        Resumen Dotación
                      </button>
                    </div>
                  </div>
                </div>

                {/* Botón CTA Inferior */}
                <div className="vision-cta-bar cta-blue">
                  <span>Ingresar al Ecosistema</span>
                  <div className="vision-cta-icon">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M5 12h14M12 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              </VisionGlassCard>
            )}

            {/* 2. Tarjeta Análisis en el Proceso OJT */}
            {shouldShowCard('ojt') && (
              <VisionGlassCard
                className="vision-card-ojt reveal-card"
                onClick={() => handleModuleClick('ojt')}
                accentColor="#10B981"
                glowRgba="rgba(16, 185, 129, 0.25)"
              >
                <div className="vision-header-row">
                  <div className="vision-icon-squircle icon-green">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                    </svg>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="vision-status-chip chip-green">
                      <span className="vision-pulse-dot dot-green" />
                      64 en Tránsito
                    </span>
                    <div className="vision-corner-arrow">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M7 17L17 7M17 7H7M17 7V17" />
                      </svg>
                    </div>
                  </div>
                </div>

                <div className="vision-info-group">
                  <div className="vision-pretitle-tag tag-green">Telemetría Operativa</div>
                  <h2 className="vision-card-title">Análisis en el Proceso OJT</h2>
                  <p className="vision-card-desc">
                    Seguimiento continuo de la curva de aprendizaje, nesting y graduación formal hacia operaciones.
                  </p>
                </div>

                <div className="vision-telemetry-surface">
                  {/* Sparkline Neon Minimalista */}
                  <div className="vision-sparkline-box">
                    <div className="flex items-center justify-between mb-1">
                      <span className="kpi-micro-label">Curva de Aprendizaje OJT</span>
                      <span className="text-xs font-black text-emerald-600 font-mono">+18.4%</span>
                    </div>
                    <div className="h-11 w-full flex items-end">
                      <svg className="w-full h-full overflow-visible" viewBox="0 0 240 46" fill="none">
                        <defs>
                          <linearGradient id="visOjtGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#10B981" stopOpacity="0.32" />
                            <stop offset="100%" stopColor="#10B981" stopOpacity="0.0" />
                          </linearGradient>
                        </defs>
                        <path d="M 0 38 Q 40 42, 80 26 T 160 16 T 235 4 L 235 46 L 0 46 Z" fill="url(#visOjtGrad)" />
                        <path d="M 0 38 Q 40 42, 80 26 T 160 16 T 235 4" stroke="#10B981" strokeWidth="2.5" strokeLinecap="round" />
                        <circle cx="235" cy="4" r="4" fill="#10B981" />
                      </svg>
                    </div>
                  </div>

                  <div className="vision-metrics-row mt-3">
                    <div className="vision-mini-badge">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      <span>Retención: <strong>94.2%</strong></span>
                    </div>
                    <div className="vision-mini-badge">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                      <span>SLA Meta: <strong>99.2%</strong></span>
                    </div>
                  </div>
                </div>

                <div className="vision-cta-bar cta-green">
                  <span>Explorar Analítica OJT</span>
                  <div className="vision-cta-icon">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M5 12h14M12 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              </VisionGlassCard>
            )}

            {/* 3. Tarjeta Encuesta de Satisfacción CSAT */}
            {shouldShowCard('csat') && (
              <VisionGlassCard
                className="vision-card-csat reveal-card"
                onClick={() => handleModuleClick('csat')}
                accentColor="#F97316"
                glowRgba="rgba(249, 115, 22, 0.25)"
              >
                <div className="vision-header-row">
                  <div className="vision-icon-squircle icon-coral">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                    </svg>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="vision-status-chip chip-coral">
                      <span className="vision-pulse-dot dot-coral" />
                      98.6% NPS
                    </span>
                    <div className="vision-corner-arrow">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M7 17L17 7M17 7H7M17 7V17" />
                      </svg>
                    </div>
                  </div>
                </div>

                <div className="vision-info-group">
                  <div className="vision-pretitle-tag tag-coral">Experiencia & Clima</div>
                  <h2 className="vision-card-title">Encuesta de Satisfacción</h2>
                  <p className="vision-card-desc">
                    Evaluaciones de satisfacción interna y calidad de onboarding por sede — promedio de 4.6 acumulado.
                  </p>
                </div>

                <div className="vision-telemetry-surface">
                  <div className="vision-kpi-grid">
                    <div className="vision-kpi-item">
                      <span className="kpi-micro-label">Calificación</span>
                      <div className="flex items-center justify-between mt-1">
                        <span className="kpi-big-num text-amber-600">4.9</span>
                        <div className="flex text-amber-400 gap-0.5">
                          {[1, 2, 3, 4, 5].map((s) => (
                            <svg key={s} width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                            </svg>
                          ))}
                        </div>
                      </div>
                      <span className="text-[10px] font-semibold text-slate-400 mt-1 block">Escala 1 a 5</span>
                    </div>

                    <div className="vision-kpi-item">
                      <span className="kpi-micro-label">Promotores NPS</span>
                      <div className="flex items-center justify-between mt-1">
                        <span className="kpi-big-num text-emerald-600">72%</span>
                        <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                          Óptimo
                        </span>
                      </div>
                      <span className="text-[10px] font-semibold text-slate-400 mt-1 block">98.6% satisfacción</span>
                    </div>
                  </div>

                  <div className="vision-metrics-row mt-3">
                    <div className="vision-mini-badge">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                      <span>Promedio: <strong>4.6 / 5.0</strong></span>
                    </div>
                    <div className="vision-mini-badge">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      <span>Fidelidad: <strong>Alta</strong></span>
                    </div>
                  </div>
                </div>

                <div className="vision-cta-bar cta-coral">
                  <span>Consultar Evaluaciones</span>
                  <div className="vision-cta-icon">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M5 12h14M12 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              </VisionGlassCard>
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="footer-wrapper">
        <div className="home-container footer-inner-row">
          <span>© 2026 GEA Perú</span>
          <div className="footer-links-group">
            <a 
              href="https://wa.me/51980690494?text=Hola%2C%20requiero%20asistencia%20de%20Soporte%20Workforce%20GEA"
              target="_blank"
              rel="noopener noreferrer"
              className="footer-workforce-link"
              title="Canal de Soporte Workforce Directo"
            >
              SOPORTE WORKFORCE
            </a>
            <a href="#privacidad" onClick={(e) => { e.preventDefault(); alert('Políticas de Privacidad - GEA Perú 2026'); }}>
              Políticas de Privacidad
            </a>
          </div>
        </div>
      </footer>

      {/* Asistente Virtual Flotante GEA (Fijo en pantalla, WhatsApp directo) */}
      <GeaMascotCompanion userName={firstName} adminPhone="51980690494" />
    </div>
  )
}
