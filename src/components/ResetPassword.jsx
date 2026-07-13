import { useState } from 'react'
import { Lock, Eye, EyeOff, Loader2, AlertCircle, CheckCircle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import GeaLogo from './GeaLogo'

export default function ResetPassword({ onResetComplete }) {
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(false)

  const handleReset = async (e) => {
    e.preventDefault()
    if (password !== passwordConfirm) {
      setError('Las contraseñas no coinciden.')
      return
    }
    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.')
      return
    }

    setLoading(true)
    setError(null)
    try {
      const { error: updateErr } = await supabase.auth.updateUser({ password })
      if (updateErr) throw updateErr
      
      setSuccess(true)
      setTimeout(() => {
        onResetComplete()
      }, 3000)
    } catch (err) {
      setError(err.message || 'Error al actualizar la contraseña.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center relative transition-colors duration-300" style={{ backgroundColor: 'var(--bg-base)' }}>
      <div className="w-full max-w-[450px] mx-4 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-[28px] p-10 md:p-12 shadow-sm animate-fadeIn">
        <div className="flex flex-col items-center text-center mb-8">
          <div className="mb-5">
            <GeaLogo size="large" showText={true} showTagline={false} />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
            Crea una nueva contraseña
          </h1>
          <p className="text-sm text-[var(--text-secondary)] mt-2">
            Asegúrate de usar una contraseña que recuerdes.
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-xl flex items-start gap-3 text-sm font-medium border bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800/30 text-red-600 dark:text-red-400 animate-fadeIn">
            <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {success ? (
          <div className="mb-6 p-6 rounded-xl flex flex-col items-center justify-center gap-3 text-center border bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800/30 text-green-700 dark:text-green-400 animate-fadeIn">
            <CheckCircle size={32} className="text-green-500" />
            <span className="font-semibold text-lg">¡Contraseña Actualizada!</span>
            <span className="text-sm">Redirigiendo al sistema...</span>
          </div>
        ) : (
          <form onSubmit={handleReset} className="space-y-6">
            <div className="space-y-1">
              <label className="block text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1.5 ml-1">
                Nueva Contraseña
              </label>
              <div className="relative group">
                <Lock size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-[var(--text-muted)] group-focus-within:text-[var(--accent)] transition-colors" />
                <input
                  type={showPw ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
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

            <div className="space-y-1">
              <label className="block text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1.5 ml-1">
                Confirmar Contraseña
              </label>
              <div className="relative group">
                <Lock size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-[var(--text-muted)] group-focus-within:text-[var(--accent)] transition-colors" />
                <input
                  type={showPw ? 'text' : 'password'}
                  required
                  value={passwordConfirm}
                  onChange={e => setPasswordConfirm(e.target.value)}
                  placeholder="Repite la contraseña"
                  className="w-full pl-10 pr-12 py-3 bg-[var(--input-bg)] border border-[var(--input-border)] rounded-xl text-sm focus:ring-2 focus:ring-[var(--accent)]/20 focus:border-[var(--accent)] transition-all outline-none text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !password || !passwordConfirm}
              className="btn-primary w-full flex items-center justify-center gap-2 rounded-full py-3"
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Guardando...</span>
                </>
              ) : (
                <span>Guardar nueva contraseña</span>
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
