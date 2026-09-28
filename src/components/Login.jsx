import { useState, useRef, useEffect, useMemo } from 'react'
import '../styles/loginPortal.css'
import GalaxyCanvas from './login/GalaxyCanvas'
import FloatingKpiChips from './login/FloatingKpiChips'
import GeaLogo, { GeaModernDeltaEmblem } from './GeaLogo'
import { supabase } from '../lib/supabase'
import { useRocketLaunch } from '../hooks/useRocketLaunch'

const CODE_PREFIXES = ['GPE', 'GPOP', 'GPR']

export default function Login({ theme, setTheme }) {
  const [usuario, setUsuario] = useState(() => {
    try {
      return localStorage.getItem('gea_saved_user') || ''
    } catch {
      return ''
    }
  })
  const [contrasena, setContrasena] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(() => {
    try {
      return localStorage.getItem('gea_remember_user') === 'true'
    } catch {
      return false
    }
  })

  const [userError, setUserError] = useState(false)
  const [authError, setAuthError] = useState(null)
  const [isResetMode, setIsResetMode] = useState(false)
  const [resetSent, setResetSent] = useState(false)
  const [isResetLoading, setIsResetLoading] = useState(false)

  const cardRef = useRef(null)
  const btnRef = useRef(null)
  const userInputRef = useRef(null)

  const { isLaunching, launch } = useRocketLaunch({ btnRef, cardRef })

  // Fecha actual en formato "Sábado 26 sep"
  const formattedDate = useMemo(() => {
    try {
      const now = new Date()
      const d = now.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'short' })
      return d.charAt(0).toUpperCase() + d.slice(1).replace('.', '')
    } catch {
      return 'Sábado 26 sep'
    }
  }, [])

  // Grupo actual aleatorio con cambio periódico
  const [groupCode, setGroupCode] = useState('GPOP-202631')
  const [isCodeFading, setIsCodeFading] = useState(false)
  const [isCodeFlashing, setIsCodeFlashing] = useState(false)

  const generateRandomCode = () => {
    const prefix = CODE_PREFIXES[Math.floor(Math.random() * CODE_PREFIXES.length)]
    const suffix = String(Math.floor(Math.random() * 100)).padStart(2, '0')
    return `${prefix}-2026${suffix}`
  }

  useEffect(() => {
    const prefersReduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
    let timeoutId

    const scheduleNextCycle = () => {
      const delay = 4000 + Math.random() * 2500
      timeoutId = setTimeout(() => {
        const nextCode = generateRandomCode()
        if (prefersReduced) {
          setGroupCode(nextCode)
          scheduleNextCycle()
          return
        }

        setIsCodeFading(true)
        setTimeout(() => {
          setGroupCode(nextCode)
          setIsCodeFading(false)
          setIsCodeFlashing(true)
          setTimeout(() => setIsCodeFlashing(false), 650)
          scheduleNextCycle()
        }, 260)
      }, delay)
    }

    scheduleNextCycle()
    return () => clearTimeout(timeoutId)
  }, [])

  // Partículas flotantes de ambientación
  const particles = useMemo(() => {
    return Array.from({ length: 14 }, (_, i) => ({
      id: i,
      size: 2 + Math.random() * 3,
      left: Math.random() * 100,
      bottom: Math.random() * 30,
      duration: 6 + Math.random() * 8,
      delay: Math.random() * 8,
      opacity: 0.3 + Math.random() * 0.4,
    }))
  }, [])

  // Acción real de autenticación con Supabase
  const doLogin = async () => {
    const cleanInput = usuario.trim().toLowerCase()
    const loginEmail = cleanInput.includes('@') ? cleanInput : `${cleanInput}@gea.com`

    try {
      if (rememberMe) {
        localStorage.setItem('gea_remember_user', 'true')
        localStorage.setItem('gea_saved_user', cleanInput)
      } else {
        localStorage.removeItem('gea_remember_user')
        localStorage.removeItem('gea_saved_user')
      }
    } catch {
      // Ignorar errores en modo estricto
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email: loginEmail,
      password: contrasena,
    })

    if (error) throw error
    return data
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setAuthError(null)

    if (isResetMode) {
      return handleResetPassword(e)
    }

    if (!usuario.trim()) {
      setUserError(true)
      userInputRef.current?.focus()
      return
    }

    setUserError(false)

    try {
      await launch(doLogin)
    } catch (err) {
      console.error('Login error:', err)
      setAuthError(
        err?.message === 'Invalid login credentials'
          ? 'Correo o contraseña incorrectos. Verifica tus datos.'
          : err?.message || 'Error inesperado al iniciar sesión.'
      )
    }
  }

  const handleResetPassword = async (e) => {
    e.preventDefault()
    if (!usuario.trim()) {
      setUserError(true)
      userInputRef.current?.focus()
      return
    }

    setIsResetLoading(true)
    setAuthError(null)
    setResetSent(false)

    try {
      const cleanInput = usuario.trim().toLowerCase()
      const resetEmail = cleanInput.includes('@') ? cleanInput : `${cleanInput}@gea.com`
      const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
        redirectTo: window.location.origin,
      })
      if (error) throw error
      setResetSent(true)
    } catch (err) {
      setAuthError(err.message || 'Error al enviar el correo de recuperación.')
    } finally {
      setIsResetLoading(false)
    }
  }

  return (
    <div className="login-page-wrapper">
      <div ref={cardRef} className="login-card card">
        {/* ── Panel Izquierdo: Brand & Galaxy ────────────────────────────── */}
        <aside className="login-brand brand">
          {/* Canvas reactivo con estrellas, planetas 3D y parallax */}
          <GalaxyCanvas />

          {/* Partículas flotantes hacia arriba */}
          {particles.map((p) => (
            <span
              key={p.id}
              className="login-particle"
              style={{
                width: `${p.size}px`,
                height: `${p.size}px`,
                left: `${p.left}%`,
                bottom: `${p.bottom}%`,
                animationDuration: `${p.duration}s`,
                animationDelay: `${p.delay}s`,
                opacity: p.opacity,
              }}
            />
          ))}

          {/* Chips flotantes de mini-KPIs con conteo animado */}
          <FloatingKpiChips />

          {/* Barra superior de estado */}
          <div className="login-brand__top">
            <span>{formattedDate}</span>
            <span>Sala RYC</span>
          </div>

          {/* Bloque de Grupo Actual transparente */}
          <div className="login-brand__group">
            <div className="login-brand__panel">
              <p className="login-brand__label">Grupo actual</p>
              <h1
                className={`login-brand__code ${isCodeFlashing ? 'flash' : ''}`}
                style={{ opacity: isCodeFading ? 0 : 1 }}
              >
                {groupCode}
              </h1>
              <p className="login-brand__day">Día 3 de 5 · Capacitación teórica</p>

              <div
                className="login-steps"
                role="progressbar"
                aria-valuemin={1}
                aria-valuemax={5}
                aria-valuenow={3}
                aria-label="Progreso del grupo: día 3 de 5"
              >
                <div className="login-steps__track">
                  <span className="login-steps__dot done" />
                  <span className="login-steps__dot done" />
                  <span className="login-steps__dot current" />
                  <span className="login-steps__dot" />
                  <span className="login-steps__dot" />
                </div>
              </div>
            </div>
          </div>

          {/* Footer de Marca */}
          <div className="login-brand__footer">
            <GeaModernDeltaEmblem className="w-10 h-10" />
            <div className="login-brand__org">
              GEA Perú
              <small>Reclutamiento y Capacitación</small>
            </div>
          </div>
        </aside>

        {/* ── Panel Derecho: Formulario de Acceso ────────────────────────── */}
        <main className="login-form-container form">
          {/* Logo Oficial Corporativo GEA PERÚ / Workforce Management con animación */}
          <div className="flex items-center justify-center mb-6">
            <GeaLogo
              size="large"
              showText={true}
              showSubtitle={true}
              showTagline={false}
              subtitle="WORKFORCE MANAGEMENT"
            />
          </div>

          <h2 className="login-form__title">
            {isResetMode ? 'Recuperar contraseña' : 'Tu grupo te espera'}
          </h2>
          <p className="login-form__sub">
            {isResetMode
              ? 'Ingresa tu usuario para recibir un enlace de recuperación'
              : 'Buenos días, equipo de formación'}
          </p>

          {/* Mensajes de error general o confirmación */}
          {authError && (
            <div className="mb-5 p-3.5 rounded-xl flex items-start gap-2.5 text-xs font-semibold bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/40 text-red-600 dark:text-red-400">
              <svg className="w-4 h-4 mt-0.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 8v5M12 16.5v.5" />
              </svg>
              <span>{authError}</span>
            </div>
          )}

          {resetSent && (
            <div className="mb-5 p-3.5 rounded-xl flex items-start gap-2.5 text-xs font-semibold bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900/40 text-green-600 dark:text-green-400">
              <span>Se ha enviado un enlace de recuperación a tu correo. Revisa tu bandeja de entrada o spam.</span>
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate>
            {/* Campo Usuario */}
            <div className={`login-field ${userError ? 'has-error' : ''}`}>
              <label htmlFor="usuario">Usuario</label>
              <div className="login-field__wrap">
                <span className="login-field__icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="8" r="4" />
                    <path d="M4 21c0-4 3.6-6 8-6s8 2 8 6" />
                  </svg>
                </span>
                <input
                  ref={userInputRef}
                  id="usuario"
                  name="usuario"
                  type="text"
                  placeholder="Documento o código"
                  autoComplete="username"
                  autoFocus
                  required
                  value={usuario}
                  onChange={(e) => {
                    setUsuario(e.target.value)
                    if (userError) setUserError(false)
                  }}
                />
              </div>
              {userError && (
                <p className="login-field__error">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 8v5M12 16.5v.5" />
                  </svg>
                  Ingresa tu documento o código.
                </p>
              )}
            </div>

            {/* Campo Contraseña (Oculto en recuperación) */}
            {!isResetMode && (
              <div className="login-field">
                <label htmlFor="contrasena">Contraseña</label>
                <div className="login-field__wrap">
                  <span className="login-field__icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="4" y="11" width="16" height="10" rx="2" />
                      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                    </svg>
                  </span>
                  <input
                    id="contrasena"
                    name="contrasena"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Tu contraseña"
                    autoComplete="current-password"
                    required
                    value={contrasena}
                    onChange={(e) => setContrasena(e.target.value)}
                  />
                  <button
                    type="button"
                    className="login-field__toggle"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    aria-pressed={showPassword}
                  >
                    {showPassword ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                        <line x1="1" y1="1" x2="23" y2="23" />
                      </svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* Fila de opciones: Recordar usuario y Olvidaste contraseña */}
            <div className="login-form__row">
              {isResetMode ? (
                <button
                  type="button"
                  onClick={() => {
                    setIsResetMode(false)
                    setAuthError(null)
                    setResetSent(false)
                  }}
                  className="login-link"
                >
                  ← Volver al inicio de sesión
                </button>
              ) : (
                <>
                  <label className="login-check">
                    <input
                      type="checkbox"
                      id="recordar"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                    />
                    Recordar mi usuario en este equipo
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setIsResetMode(true)
                      setAuthError(null)
                      setResetSent(false)
                    }}
                    className="login-link"
                  >
                    ¿Olvidaste tu contraseña?
                  </button>
                </>
              )}
            </div>

            {/* Botón con efecto de cohete despegando */}
            <button
              ref={btnRef}
              className={`login-btn btn ${isLaunching ? 'launching' : ''} ${isResetLoading ? 'loading' : ''}`}
              type="submit"
              id="submitBtn"
              disabled={isLaunching || isResetLoading || (!isResetMode && !contrasena)}
            >
              <span className="spinner" aria-hidden="true" />
              <svg className="login-btn__rocket btn__rocket" aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M12 2c3 2 4.5 5.5 4.5 9 0 2-.5 3.7-1.2 5l-3.3 1.7-3.3-1.7C7.5 14.7 7 13 7 11c0-3.5 1.5-7 5-9z" fill="#fff" />
                <circle cx="12" cy="9.6" r="1.8" fill="#2F6BFF" />
                <path d="M7.3 13.5 4.5 15l1-3.2M16.7 13.5l2.8 1.5-1-3.2" stroke="#ffd166" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M10.3 17.2 9.6 21l2.4-1.6 2.4 1.6-.7-3.8" fill="#ff7a45" />
              </svg>
              <span className="login-btn__label btn__label">
                {isResetMode ? 'Enviar enlace' : 'Ingresar al portal'}
              </span>
              <svg className="login-btn__arrow btn__arrow" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </button>

            <p className="login-form__help">
              ¿Problemas para acceder?{' '}
              <a
                className="login-link"
                href="mailto:soporte@gea.com?subject=Soporte%20Acceso%20Portal%20GEA"
                onClick={(e) => {
                  e.preventDefault()
                  alert('Para soporte técnico o desbloqueo de cuenta, contacta a tu supervisor o escribe a mesa de ayuda interna.')
                }}
              >
                Contacta a soporte
              </a>
            </p>
          </form>
        </main>
      </div>
    </div>
  )
}
