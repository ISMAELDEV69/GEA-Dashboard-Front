import { useState } from 'react'
import { Mail, Lock, Eye, EyeOff, Sun, Moon, Laptop, Loader2, AlertCircle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import GeaLogo from './GeaLogo'

const THEMES = [
  { id: 'dark',        label: 'Oscuro',   icon: Moon,   desc: 'Modo noche clásico' },
  { id: 'comfortable', label: 'Cómodo',   icon: Laptop, desc: 'Azul profundo para jornadas largas' },
  { id: 'light',       label: 'Claro',    icon: Sun,    desc: 'Alta luminosidad' },
]

export default function Login({ theme, setTheme }) {
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [showPw,   setShowPw]   = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState(null)
  const [isResetMode, setIsResetMode] = useState(false)
  const [resetSent, setResetSent] = useState(false)

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const cleanInput = email.trim().toLowerCase()
      const loginEmail = cleanInput.includes('@') ? cleanInput : `${cleanInput}@gea.com`
      const { error: authErr } = await supabase.auth.signInWithPassword({ email: loginEmail, password })
      if (authErr) throw authErr
    } catch (err) {
      console.error('Login error:', err)
      setError(
        err?.message === 'Invalid login credentials'
          ? 'Correo o contraseña incorrectos. Verifica tus datos.'
          : err?.message || JSON.stringify(err) || 'Error inesperado al iniciar sesión.'
      )
    } finally {
      setLoading(false)
    }
  }

  const handleResetPassword = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setResetSent(false)
    try {
      const cleanEmail = email.trim().toLowerCase()
      const { error: authErr } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
        redirectTo: window.location.origin,
      })
      if (authErr) throw authErr
      setResetSent(true)
    } catch (err) {
      setError(err.message || 'Error al enviar el correo de recuperación.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center relative transition-colors duration-300"
      style={{ backgroundColor: 'var(--bg-base)' }}
    >
      {/* ── Theme Switcher (top right) ── */}
      <div className="absolute top-6 right-6 flex items-center gap-1 p-1 rounded-full border bg-[var(--bg-surface)] border-[var(--border-subtle)] shadow-sm">
        {THEMES.map(t => {
          const Icon = t.icon
          const isActive = theme === t.id
          return (
            <button
              key={t.id}
              title={`${t.label} — ${t.desc}`}
              onClick={() => setTheme(t.id)}
              className={`p-2 rounded-full transition-all duration-200 ${
                isActive
                  ? 'bg-[var(--accent)] text-white shadow-sm'
                  : 'text-[var(--text-muted)] hover:bg-[var(--bg-muted)]'
              }`}
            >
              <Icon size={14} />
            </button>
          )
        })}
      </div>

      {/* ── Login Container ── */}
      <div
        className="w-full max-w-[450px] mx-4 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-[28px] p-10 md:p-12 shadow-sm animate-fadeIn"
      >
        {/* Header Section */}
        <div className="flex flex-col items-center text-center mb-8">
          {/* Brand Logo */}
          <div className="mb-5">
            <GeaLogo size="large" showText={true} showTagline={true} />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
            {isResetMode ? 'Recuperar contraseña' : 'Iniciar sesión'}
          </h1>
          <p className="text-sm text-[var(--text-secondary)] mt-2">
            {isResetMode ? 'Ingresa tu correo o usuario para recibir un enlace de recuperación' : 'Ingresa tu Usuario ALIX o Correo para continuar'}
          </p>
        </div>

        {/* Error Notification */}
        {error && (
          <div className="mb-6 p-4 rounded-xl flex items-start gap-3 text-sm font-medium border bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800/30 text-red-600 dark:text-red-400 animate-fadeIn">
            <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {resetSent && (
          <div className="mb-6 p-4 rounded-xl flex items-start gap-3 text-sm font-medium border bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800/30 text-green-600 dark:text-green-400 animate-fadeIn">
            <span>Se ha enviado un enlace de recuperación a tu correo. Revisa tu bandeja de entrada o spam.</span>
          </div>
        )}

        {/* Credentials Form */}
        <form onSubmit={isResetMode ? handleResetPassword : handleLogin} className="space-y-6">
          {/* Email Address Input */}
          <div className="space-y-1">
            <label className="block text-xs font-bold text-[var(--text-secondary)] mb-1.5 ml-1">
              Usuario
            </label>
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-[var(--text-muted)] group-focus-within:text-[var(--accent)] transition-colors">
                <Mail size={18} />
              </div>
              <input
                id="email"
                type="text"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-11 pr-4 py-3 bg-[var(--input-bg)] border border-[var(--input-border)] rounded-2xl text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20 focus:border-[var(--accent)] transition-all sm:text-sm shadow-sm"
                placeholder="Ingresa tu usuario (ej. mlopez)"
              />
            </div>
          </div>

          {/* Password Input (Hidden in Reset Mode) */}
          {!isResetMode && (
            <div className="space-y-1">
              <label className="block text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1.5 ml-1">
                Contraseña
              </label>
              <div className="relative group">
                <Lock size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-[var(--text-muted)] group-focus-within:text-[var(--accent)] transition-colors" />
                <input
                  type={showPw ? 'text' : 'password'}
                  required={!isResetMode}
                  autoComplete="current-password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Ingresa tu contraseña"
                  className="w-full pl-10 pr-12 py-3 bg-[var(--input-bg)] border border-[var(--input-border)] rounded-xl text-sm focus:ring-2 focus:ring-[var(--accent)]/20 focus:border-[var(--accent)] transition-all outline-none text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
                />
                <button
                  type="button"
                  onClick={() => setShowPw(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-muted)] transition-colors"
                >
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
          )}

          {/* Submit Actions */}
          <div className="pt-2 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              {isResetMode ? (
                <button
                  type="button"
                  onClick={() => { setIsResetMode(false); setError(null); setResetSent(false); }}
                  className="text-xs text-[var(--accent)] hover:underline"
                >
                  Volver al inicio de sesión
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => { setIsResetMode(true); setError(null); }}
                  className="text-xs text-[var(--accent)] hover:underline"
                >
                  ¿Olvidaste tu contraseña?
                </button>
              )}
              
              <button
                type="submit"
                disabled={loading || !email || (!isResetMode && !password)}
                className="btn-primary flex items-center gap-2 rounded-full px-6"
              >
                {loading ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>{isResetMode ? 'Enviando...' : 'Siguiente...'}</span>
                  </>
                ) : (
                  <span>{isResetMode ? 'Enviar enlace' : 'Siguiente'}</span>
                )}
              </button>
            </div>
          </div>
        </form>

        {/* Footer Info */}
        <p className="mt-8 text-center text-xs text-[var(--text-muted)]">
          ¿No tienes acceso? Solicita una cuenta al administrador del sistema.
        </p>
      </div>
    </div>
  )
}

