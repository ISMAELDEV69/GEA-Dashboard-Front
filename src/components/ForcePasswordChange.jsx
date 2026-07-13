import React, { useState } from 'react'
import { Lock, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { supabase } from '../lib/supabase'

export default function ForcePasswordChange({ userProfile, onComplete }) {
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)

    if (newPassword.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres')
      return
    }

    if (newPassword !== confirmPassword) {
      setError('Las contraseñas no coinciden')
      return
    }

    setLoading(true)

    try {
      // 1. Cambiar clave en Supabase Auth
      const { error: authError } = await supabase.auth.updateUser({
        password: newPassword
      })

      if (authError) throw authError

      // 2. Marcar must_change_password como false en perfiles
      const { error: profileError } = await supabase
        .from('perfiles')
        .update({ must_change_password: false })
        .eq('id', userProfile.id)

      if (profileError) throw profileError

      // Éxito
      setSuccess(true)
      setTimeout(() => {
        if (onComplete) onComplete()
      }, 2000)

    } catch (err) {
      setError(err.message || 'Error al actualizar la contraseña')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: 'var(--bg-base)' }}>
      <div className="max-w-md w-full bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-3xl p-8 shadow-sm">
        
        <div className="w-16 h-16 rounded-2xl bg-blue-500/10 flex items-center justify-center mx-auto mb-6 text-blue-500">
          <Lock size={32} />
        </div>
        
        <h2 className="text-2xl font-black text-center mb-2 text-gray-900 dark:text-white">Cambio Obligatorio</h2>
        <p className="text-sm text-center text-gray-500 dark:text-slate-400 mb-8">
          Hola <strong>{userProfile?.nombre?.split(' ')[0]}</strong>, por motivos de seguridad debes cambiar tu contraseña predeterminada para continuar.
        </p>

        {success ? (
          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-6 flex flex-col items-center text-center animate-in zoom-in duration-300">
            <CheckCircle2 size={48} className="text-emerald-500 mb-4" />
            <h3 className="font-bold text-emerald-600 dark:text-emerald-400">¡Contraseña Actualizada!</h3>
            <p className="text-xs text-emerald-600/80 dark:text-emerald-400/80 mt-2">Redirigiendo a tu espacio de trabajo...</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-3">
                <AlertCircle className="text-red-500 shrink-0 mt-0.5" size={16} />
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              </div>
            )}

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-slate-400 mb-2 ml-1">
                Nueva Contraseña
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                required
                className="w-full px-4 py-3 bg-gray-50 dark:bg-slate-800/50 border border-gray-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none text-gray-900 dark:text-slate-100"
                placeholder="Mínimo 6 caracteres"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-slate-400 mb-2 ml-1">
                Confirmar Contraseña
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                required
                className="w-full px-4 py-3 bg-gray-50 dark:bg-slate-800/50 border border-gray-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none text-gray-900 dark:text-slate-100"
                placeholder="Repite tu nueva contraseña"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-colors flex items-center justify-center gap-2 mt-4 shadow-sm"
            >
              {loading ? <Loader2 size={18} className="animate-spin" /> : <Lock size={18} />}
              Guardar y Continuar
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
