import { useState, useRef, useCallback, useEffect } from 'react'
import {
  User, Camera, Save, CheckCircle, Lock,
  Bell, Shield, Palette, X, Eye, EyeOff,
  Layout, RotateCcw, Edit3
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { DB_MODE } from '../lib/dataService'

const ROL_LABELS = {
  admin:      'Administrador',
  reclutador: 'Reclutador',
  formador:   'Formador',
  visor:      'Directivo',
}

const ROL_COLORS = {
  admin:      { bg: 'var(--accent-soft)', text: 'var(--accent)', border: 'var(--accent-glow)' },
  reclutador: { bg: 'rgba(167,139,250,0.15)', text: '#a78bfa', border: 'rgba(167,139,250,0.3)' },
  formador:   { bg: 'rgba(52,211,153,0.15)', text: '#34d399', border: 'rgba(52,211,153,0.3)' },
  visor:      { bg: 'rgba(251,191,36,0.15)', text: '#fbbf24', border: 'rgba(251,191,36,0.3)' },
}

const NOTIF_DEFAULTS = {
  desercion: true,
  asistencia: true,
  postulantes: false,
  reportes: false,
}

const DENSITY_OPTIONS = [
  { id: 'compact', label: 'Compacta', desc: 'Más filas visibles, menos espacio' },
  { id: 'comfortable', label: 'Cómoda', desc: 'Equilibrio entre legibilidad y densidad' },
  { id: 'spacious', label: 'Amplia', desc: 'Máxima legibilidad, más padding' },
]

export default function PerfilConfig({ userProfile, onProfileUpdate, theme, setTheme, themes = [] }) {
  const [activeTab, setActiveTab] = useState('cuenta')
  const [nombre, setNombre] = useState(userProfile?.nombre || '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState(null)
  const [showPassword, setShowPassword] = useState(false)
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [passwordSaved, setPasswordSaved] = useState(false)
  const [notifs, setNotifs] = useState(() => {
    try {
      return { ...NOTIF_DEFAULTS, ...JSON.parse(localStorage.getItem('gea-notifs') || '{}') }
    } catch {
      return NOTIF_DEFAULTS
    }
  })
  const [density, setDensity] = useState(() => localStorage.getItem('gea-density') || 'comfortable')
  const [sidebarDefault, setSidebarDefault] = useState(() => localStorage.getItem('gea-sidebar') !== 'collapsed')

  const rol = userProfile?.rol || 'visor'
  const rolColor = ROL_COLORS[rol] || ROL_COLORS.visor

  useEffect(() => {
    setNombre(userProfile?.nombre || '')
  }, [userProfile])

  useEffect(() => {
    document.documentElement.setAttribute('data-density', density)
    localStorage.setItem('gea-density', density)
  }, [density])

  useEffect(() => {
    localStorage.setItem('gea-sidebar', sidebarDefault ? 'open' : 'collapsed')
  }, [sidebarDefault])

  const handleSaveProfile = async () => {
    setSaving(true)
    setError(null)
    try {
      const updates = {
        nombre: nombre.trim(),
      }

      if (DB_MODE === 'supabase' && userProfile?.id) {
        const { error: dbErr } = await supabase
          .from('perfiles')
          .update(updates)
          .eq('id', userProfile.id)
        if (dbErr) throw dbErr
      } else {
        const stored = JSON.parse(localStorage.getItem('gea-perfil') || '{}')
        localStorage.setItem('gea-perfil', JSON.stringify({ ...stored, ...updates, id: userProfile?.id }))
      }

      onProfileUpdate?.({ ...userProfile, ...updates })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      setError(err.message || 'Error al guardar el perfil.')
    } finally {
      setSaving(false)
    }
  }

  const handleChangePassword = async () => {
    if (password !== passwordConfirm) {
      setError('Las contraseñas no coinciden.')
      return
    }
    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.')
      return
    }
    setPasswordSaving(true)
    setError(null)
    try {
      if (DB_MODE === 'supabase') {
        const { error: pwErr } = await supabase.auth.updateUser({ password })
        if (pwErr) throw pwErr
      }
      setPassword('')
      setPasswordConfirm('')
      setPasswordSaved(true)
      setTimeout(() => setPasswordSaved(false), 3000)
    } catch (err) {
      setError(err.message || 'Error al cambiar la contraseña.')
    } finally {
      setPasswordSaving(false)
    }
  }

  const toggleNotif = (key) => {
    setNotifs(prev => {
      const next = { ...prev, [key]: !prev[key] }
      localStorage.setItem('gea-notifs', JSON.stringify(next))
      return next
    })
  }

  const initials = nombre?.[0]?.toUpperCase() || 'U'

  const tabs = [
    { id: 'cuenta', label: 'Mi Cuenta', icon: User },
    { id: 'interfaz', label: 'Interfaz', icon: Palette },
    { id: 'seguridad', label: 'Seguridad', icon: Lock },
    { id: 'notificaciones', label: 'Notificaciones', icon: Bell },
  ]

  const notifItems = [
    { key: 'desercion', label: 'Alertas de deserción', desc: 'Notificar cuando un alumno acumula 3+ FI' },
    { key: 'asistencia', label: 'Guardado de asistencia', desc: 'Confirmar cada vez que se guarda correctamente' },
    { key: 'postulantes', label: 'Nuevos postulantes', desc: 'Alertar cuando se registra un nuevo ingreso' },
    { key: 'reportes', label: 'Reportes semanales', desc: 'Resumen automático cada lunes' },
  ]

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-fadeIn">

      {/* Header */}
      <div
        className="relative overflow-hidden rounded-3xl border p-8 shadow-xl"
        style={{ background: 'var(--bg-card)', borderColor: 'var(--border-subtle)' }}
      >
        <div className="absolute inset-0 opacity-30 pointer-events-none" style={{ background: 'var(--accent-gradient)' }} />
        <div className="relative flex flex-col sm:flex-row items-center sm:items-start gap-6">

          <div className="relative flex-shrink-0">
            <div
              className="w-20 h-20 rounded-2xl shadow-xl overflow-hidden border-2 flex items-center justify-center"
              style={{ borderColor: 'var(--accent-glow)', background: 'var(--accent-gradient)' }}
            >
              <span className="text-3xl font-black text-white">{initials}</span>
            </div>
          </div>

          <div className="flex-1 text-center sm:text-left">
            <h1 className="text-2xl font-black" style={{ color: 'var(--text-primary)' }}>
              {nombre || 'Sin nombre'}
            </h1>
            <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
              {userProfile?.segmento ? `Segmento asignado: ${userProfile.segmento}` : (ROL_LABELS[rol] ?? rol)}
            </p>
            <div className="flex flex-wrap justify-center sm:justify-start gap-2 mt-3">
              <span
                className="text-[11px] font-extrabold px-3 py-1 rounded-full uppercase tracking-wider border"
                style={{ background: rolColor.bg, color: rolColor.text, borderColor: rolColor.border }}
              >
                {ROL_LABELS[rol] ?? rol}
              </span>
              {userProfile?.segmento && (
                <span className="text-[11px] font-bold px-3 py-1 rounded-full uppercase tracking-wider bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                  {userProfile.segmento}
                </span>
              )}
              {DB_MODE === 'supabase' ? (
                <span className="text-[11px] font-bold px-3 py-1 rounded-full uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  Cuenta activa
                </span>
              ) : (
                <span className="text-[11px] font-bold px-3 py-1 rounded-full uppercase tracking-wider bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  Modo Demo
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl border overflow-x-auto" style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)' }}>
        {tabs.map(tab => {
          const TIcon = tab.icon
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap min-w-fit"
              style={isActive
                ? { background: 'var(--accent)', color: 'white', boxShadow: '0 2px 8px var(--accent-glow)' }
                : { color: 'var(--text-muted)' }
              }
            >
              <TIcon size={14} />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Tab: Mi Cuenta */}
      {activeTab === 'cuenta' && (
        <div className="rounded-2xl border p-6 space-y-6" style={{ background: 'var(--bg-card)', borderColor: 'var(--border-subtle)' }}>
          <div className="flex items-center gap-2 mb-2">
            <Edit3 size={16} style={{ color: 'var(--accent)' }} />
            <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Información de la Cuenta</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                Nombre de Usuario
              </label>
              <input
                value={nombre}
                onChange={e => setNombre(e.target.value)}
                placeholder="Tu nombre completo"
                className="w-full rounded-xl px-4 py-2.5 text-sm font-medium border outline-none transition-all"
                style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
                onFocus={e => { e.target.style.borderColor = 'var(--accent)' }}
                onBlur={e => { e.target.style.borderColor = 'var(--border-subtle)' }}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                Rol del sistema
              </label>
              <div
                className="w-full rounded-xl px-4 py-2.5 text-sm font-bold border flex items-center gap-2"
                style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)', color: rolColor.text }}
              >
                <Shield size={14} />
                {ROL_LABELS[rol] ?? rol}
                <span className="text-xs opacity-60 font-normal ml-auto">Solo admin puede cambiar</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                Segmento asignado
              </label>
              <div
                className="w-full rounded-xl px-4 py-2.5 text-sm font-bold border flex items-center gap-2"
                style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
              >
                {userProfile?.segmento || 'Acceso Global (Sin restricción)'}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                Identificador de Usuario (UUID)
              </label>
              <div
                className="w-full rounded-xl px-4 py-2.5 text-xs font-mono border flex items-center gap-2 truncate opacity-70"
                style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)', color: 'var(--text-muted)' }}
              >
                {userProfile?.id || '—'}
              </div>
            </div>
          </div>

          {error && (
            <div className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-2.5 font-medium">
              {error}
            </div>
          )}

          <div className="flex justify-end">
            <button
              onClick={handleSaveProfile}
              disabled={saving}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold text-white transition-all active:scale-95 disabled:opacity-60"
              style={{ background: saved ? '#10b981' : 'var(--accent)', boxShadow: '0 4px 14px var(--accent-glow)' }}
            >
              {saved ? <CheckCircle size={15} /> : <Save size={15} />}
              {saving ? 'Guardando…' : saved ? '¡Guardado!' : 'Guardar cambios'}
            </button>
          </div>
        </div>
      )}

      {/* Tab: Interfaz */}
      {activeTab === 'interfaz' && (
        <div className="rounded-2xl border p-6 space-y-6" style={{ background: 'var(--bg-card)', borderColor: 'var(--border-subtle)' }}>
          <div className="flex items-center gap-2">
            <Palette size={16} style={{ color: 'var(--accent)' }} />
            <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Apariencia e Interfaz</h3>
          </div>

          {/* Theme picker */}
          <div className="space-y-3">
            <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Tema de color</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {themes.map(t => {
                const TIcon = t.icon
                const isActive = theme === t.id
                const previews = {
                  light: ['#f0f4f8', '#0d9488', '#6366f1'],
                  dark: ['#0a0f1a', '#2dd4bf', '#818cf8'],
                  comfortable: ['#0c1222', '#818cf8', '#c084fc'],
                }
                const colors = previews[t.id] || previews.dark
                return (
                  <button
                    key={t.id}
                    onClick={() => setTheme?.(t.id)}
                    className="rounded-2xl border p-4 text-left transition-all hover:scale-[1.02] active:scale-[0.98]"
                    style={{
                      background: 'var(--bg-elevated)',
                      borderColor: isActive ? 'var(--accent)' : 'var(--border-subtle)',
                      boxShadow: isActive ? '0 0 0 2px var(--accent-soft)' : 'none',
                    }}
                  >
                    <div className="flex gap-1.5 mb-3">
                      {colors.map((c, i) => (
                        <div key={i} className="h-6 flex-1 rounded-lg" style={{ background: c }} />
                      ))}
                    </div>
                    <div className="flex items-center gap-2">
                      <TIcon size={14} style={{ color: isActive ? 'var(--accent)' : 'var(--text-muted)' }} />
                      <span className="text-xs font-bold" style={{ color: isActive ? 'var(--accent)' : 'var(--text-primary)' }}>
                        {t.label}
                      </span>
                      {isActive && <CheckCircle size={12} className="ml-auto" style={{ color: 'var(--accent)' }} />}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Density */}
          <div className="space-y-3">
            <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Densidad de tablas</p>
            <div className="space-y-2">
              {DENSITY_OPTIONS.map(opt => (
                <button
                  key={opt.id}
                  onClick={() => setDensity(opt.id)}
                  className="w-full flex items-center gap-3 p-4 rounded-xl border text-left transition-all"
                  style={{
                    background: density === opt.id ? 'var(--accent-soft)' : 'var(--bg-elevated)',
                    borderColor: density === opt.id ? 'var(--accent)' : 'var(--border-subtle)',
                  }}
                >
                  <Layout size={16} style={{ color: density === opt.id ? 'var(--accent)' : 'var(--text-muted)' }} />
                  <div>
                    <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{opt.label}</p>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{opt.desc}</p>
                  </div>
                  {density === opt.id && <CheckCircle size={14} className="ml-auto" style={{ color: 'var(--accent)' }} />}
                </button>
              ))}
            </div>
          </div>

          {/* Sidebar preference */}
          <div
            className="flex items-center justify-between p-4 rounded-xl border"
            style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)' }}
          >
            <div>
              <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Menú lateral expandido</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Mostrar el sidebar abierto al iniciar sesión</p>
            </div>
            <button
              onClick={() => setSidebarDefault(v => !v)}
              className="relative w-11 h-6 rounded-full transition-all flex-shrink-0"
              style={{ background: sidebarDefault ? 'var(--accent)' : 'var(--border-subtle)' }}
            >
              <span
                className="absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all"
                style={{ left: sidebarDefault ? '1.375rem' : '0.25rem' }}
              />
            </button>
          </div>

          <div className="flex justify-end">
            <button
              onClick={() => { setTheme?.('dark'); setDensity('comfortable'); setSidebarDefault(true) }}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all"
              style={{ color: 'var(--text-muted)', border: '1px solid var(--border-subtle)' }}
            >
              <RotateCcw size={12} />
              Restaurar valores predeterminados
            </button>
          </div>
        </div>
      )}

      {/* Tab: Seguridad */}
      {activeTab === 'seguridad' && (
        <div className="rounded-2xl border p-6 space-y-6" style={{ background: 'var(--bg-card)', borderColor: 'var(--border-subtle)' }}>
          <div className="flex items-center gap-2 mb-2">
            <Lock size={16} style={{ color: 'var(--accent)' }} />
            <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Cambiar Contraseña</h3>
          </div>

          {DB_MODE !== 'supabase' && (
            <div className="text-xs bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-xl px-4 py-3 font-medium">
              Cambio de contraseña disponible solo con Supabase activo.
            </div>
          )}

          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                Nueva contraseña
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  className="w-full rounded-xl px-4 py-2.5 pr-10 text-sm font-medium border outline-none transition-all"
                  style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
                  disabled={DB_MODE !== 'supabase'}
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }}>
                  {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                Confirmar contraseña
              </label>
              <input
                type="password"
                value={passwordConfirm}
                onChange={e => setPasswordConfirm(e.target.value)}
                placeholder="Repite la nueva contraseña"
                className="w-full rounded-xl px-4 py-2.5 text-sm font-medium border outline-none transition-all"
                style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
                disabled={DB_MODE !== 'supabase'}
              />
            </div>
          </div>

          {password && (
            <div className="space-y-1">
              <div className="flex gap-1">
                {[1,2,3,4].map(i => (
                  <div
                    key={i}
                    className="h-1 flex-1 rounded-full transition-all"
                    style={{
                      background: i <= (password.length < 6 ? 1 : password.length < 8 ? 2 : password.length < 12 ? 3 : 4)
                        ? (password.length < 6 ? '#ef4444' : password.length < 8 ? '#f59e0b' : password.length < 12 ? '#3b82f6' : '#10b981')
                        : 'var(--border-subtle)'
                    }}
                  />
                ))}
              </div>
              <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                {password.length < 6 ? 'Muy débil' : password.length < 8 ? 'Débil' : password.length < 12 ? 'Buena' : 'Excelente'}
              </p>
            </div>
          )}

          {error && (
            <div className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-2.5 font-medium">
              {error}
            </div>
          )}

          <div className="flex justify-end">
            <button
              onClick={handleChangePassword}
              disabled={passwordSaving || DB_MODE !== 'supabase' || !password}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold text-white transition-all active:scale-95 disabled:opacity-50"
              style={{ background: passwordSaved ? '#10b981' : 'var(--accent)' }}
            >
              {passwordSaved ? <CheckCircle size={15} /> : <Lock size={15} />}
              {passwordSaving ? 'Actualizando…' : passwordSaved ? '¡Actualizado!' : 'Actualizar contraseña'}
            </button>
          </div>
        </div>
      )}

      {/* Tab: Notificaciones */}
      {activeTab === 'notificaciones' && (
        <div className="rounded-2xl border p-6 space-y-4" style={{ background: 'var(--bg-card)', borderColor: 'var(--border-subtle)' }}>
          <div className="flex items-center gap-2 mb-2">
            <Bell size={16} style={{ color: 'var(--accent)' }} />
            <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Preferencias de Notificaciones</h3>
          </div>

          {notifItems.map(item => (
            <div
              key={item.key}
              className="flex items-center justify-between p-4 rounded-xl border"
              style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)' }}
            >
              <div>
                <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{item.label}</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{item.desc}</p>
              </div>
              <button
                onClick={() => toggleNotif(item.key)}
                className="relative w-11 h-6 rounded-full transition-all flex-shrink-0"
                style={{ background: notifs[item.key] ? 'var(--accent)' : 'var(--border-subtle)' }}
              >
                <span
                  className="absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all"
                  style={{ left: notifs[item.key] ? '1.375rem' : '0.25rem' }}
                />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
