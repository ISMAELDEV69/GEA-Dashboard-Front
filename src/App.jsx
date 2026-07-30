import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import {
  LayoutDashboard, UserPlus, ClipboardCheck, History,
  ChevronRight, Menu, X, Activity, Loader2,
  Wifi, WifiOff, RefreshCw, LogOut, User, Sun, Moon, Laptop,
  Target, GraduationCap, Layers, BarChart3, CalendarDays, Users, UserCheck, Shield, Eye
} from 'lucide-react'
import Dashboard from './components/Dashboard'
import NominaForm from './components/NominaForm'
import NominaCompletar from './pages/NominaCompletar'
import AsistenciaForm from './components/AsistenciaForm'
import AuditLogs from './components/AuditLogs'
import AttendanceBI from './components/AttendanceBI'
import ConsolidadoPowerBI from './components/ConsolidadoPowerBI'
import DescuentosBI from './components/DescuentosBI'
import MotivosBajasBI from './components/MotivosBajasBI'
import Login from './components/Login'
import DescuentosForm from './components/DescuentosForm'
import DescuentosAutorizacion from './components/DescuentosAutorizacion'
import LegacyDashboards from './components/LegacyDashboards'
import DashboardsAdmin from './components/DashboardsAdmin'
import PostulantesTable from './components/PostulantesTable'
import UserManagement from './components/UserManagement'
import MetasManagement from './components/MetasManagement'
import MotivosBajaAdmin from './components/MotivosBajaAdmin'
import GeaLogo from './components/GeaLogo'
import PerfilConfig from './components/PerfilConfig'
import CapacidadRys from './components/CapacidadRys'
import KeepAliveView from './components/KeepAliveView'
import GlobalTaskBar from './components/GlobalTaskBar'
import AsistenciaReclutadorDia1 from './components/AsistenciaReclutadorDia1'
import ReporteDia1 from './components/ReporteDia1'
import PropuestasModule from './pages/PropuestasModule'
import ResetPassword from './components/ResetPassword'
import EquipoReclutamiento from './pages/EquipoReclutamiento'
import EquipoFormacion from './pages/EquipoFormacion'
import AsignacionFormador from './pages/AsignacionFormador'
import ForcePasswordChange from './components/ForcePasswordChange'
import RolePermissionsAdmin from './components/RolePermissionsAdmin'
import { BackgroundTasksProvider } from './context/BackgroundTasksContext'
import { supabase } from './lib/supabase'
import {
  DB_MODE,
  fetchPostulantes,
  fetchGrupos,
  fetchAsistencias,
  fetchReclutadores,
  fetchSedes,
  fetchCampanas,
  fetchAuditLogs,
  fetchFormadores,
  insertPostulante,
  insertPostulantesBulk,
  updatePostulante,
  saveAsistenciaSession,
  fetchUserProfile,
  createUserAccount,
  updateUserRole,
  signOut,
  fetchGruposConMetas,
  fetchMotivosBaja,
  fetchDescuentosPendientes,
  fetchHomologadas,
  subscribeOperationalData,
  fetchModulePermissions,
  fetchAppRoles,
} from './lib/dataService'

// ── RBAC: which nav items each role can see ──────────────────────
const ALL_NAV = [
  { id: 'dashboard',    label: 'Dashboard',    icon: LayoutDashboard, description: 'Analítica y KPIs',        roles: ['admin','reclutador','formador','visor'] },
  { id: 'metas',        label: 'Metas y Equipos', icon: Target,       description: 'Objetivos de Campañas',   roles: ['admin'] },
  { id: 'capacidad',    label: 'Capacidad RYS',   icon: Layers,        description: 'Planificación de Grupos', roles: ['admin','formador','visor'] },
  { id: 'legacy_dashboards', label: 'Dashboards', icon: BarChart3, description: 'Panel de Control', roles: ['admin','formador','visor','reclutador'] },
  { id: 'attendancebi', label: 'Analítica BI', icon: Activity,        description: 'BI y Retención',          roles: ['admin','formador','visor'] },
  { id: 'consolidado',  label: 'Consolidado BI', icon: Activity,      description: 'Power BI Dashboard',      roles: ['admin','formador','visor'] },
  { id: 'motivos_bajas_bi', label: 'Motivos Bajas', icon: Activity,   description: 'BI de Bajas',             roles: ['admin','formador','visor'] },
  { id: 'descuentos_bi', label: 'Motivos Desc.', icon: Activity,      description: 'BI de Descuentos',        roles: ['admin','formador','visor'] },
  { id: 'propuestas',   label: 'Propuestas',    icon: ClipboardCheck, description: 'Formatos y Consolidado',  roles: ['admin','visor','reclutador'] },
  { id: 'descuentos_form', label: 'Cargar Descuentos', icon: Layers, description: 'Ingreso Masivo de Descuentos', roles: ['admin'] },
  { id: 'descuentos_auth', label: 'Autorizar RYS', icon: ClipboardCheck, description: 'Aprobación de Descuentos', roles: ['admin'] },
  { id: 'nomina', label: 'Bolsa de Postulantes', icon: UserPlus, description: 'Ingreso de Postulantes', roles: ['admin','reclutador'] },
  { id: 'nominas_completar', label: 'Nóminas', icon: ClipboardCheck, description: 'Completar Datos', roles: ['admin','reclutador','formador'] },
  { id: 'reportedia1',  label: 'Reporte Día 1', icon: Activity,        description: 'Calibración Día 1',      roles: ['admin','visor','reclutador','formador'] },
  { id: 'asistencia',   label: 'Asistencias',   icon: ClipboardCheck,  description: 'Registro Diario',         roles: ['admin','formador'] },
  { id: 'auditlogs',    label: 'Auditoría',     icon: History,         description: 'Historial de Cambios',    roles: ['admin'] },
  { id: 'users',        label: 'Usuarios',      icon: User,            description: 'Gestión de Cuentas',     roles: ['admin'] },
  { id: 'equipo_reclutamiento', label: 'Eq. Reclutamiento', icon: Users, description: 'Directorio y condiciones', roles: ['admin'] },
  { id: 'equipo_formacion', label: 'Equipo Formación', icon: GraduationCap, description: 'Directorio y condiciones', roles: ['admin'] },
  { id: 'asignacion_formador', label: 'Asignar Formador', icon: UserCheck, description: 'Asignar Formadores a Grupos', roles: ['admin', 'formador'] },
  { id: 'config',       label: 'Configuraciones', icon: LayoutDashboard, description: 'Motivos de Baja y otros', roles: ['admin'] },
  { id: 'dashboards_admin', label: 'Gestor Dashboards', icon: BarChart3, description: 'Administrar enlaces', roles: ['admin'] },
  { id: 'role_permissions', label: 'Permisos de Roles', icon: Shield, description: 'Gestor de Accesos', roles: ['admin'] },
]

const THEMES = [
  { id: 'dark',        icon: Moon,   label: 'Oscuro' },
  { id: 'comfortable', icon: Laptop, label: 'Cómodo' },
  { id: 'light',       icon: Sun,    label: 'Claro' },
]

const DEFAULT_ROL_COLORS = {
  admin:      'bg-indigo-500/15 text-indigo-400 border-indigo-500/25',
  reclutador: 'bg-violet-500/15 text-violet-400 border-violet-500/25',
  formador:   'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
  visor:      'bg-amber-500/15 text-amber-400 border-amber-500/25',
  supervisor_capacitacion: 'bg-orange-500/15 text-orange-400 border-orange-500/25',
  coordinador_rys:         'bg-cyan-500/15 text-cyan-400 border-cyan-500/25',
  jefe_rys:                'bg-sky-500/15 text-sky-400 border-sky-500/25',
  jefe_capacitacion:       'bg-amber-500/15 text-amber-400 border-amber-500/25',
}

// Etiqueta visual del rol (visor → Directivo)
const DEFAULT_ROL_LABELS = {
  admin:      'Admin',
  reclutador: 'Reclutador',
  formador:   'Formador',
  visor:      'Directivo',
  supervisor_capacitacion: 'Supervisor Cap.',
  coordinador_rys:         'Coordinador RYS',
  jefe_rys:                'Jefe RYS',
  jefe_capacitacion:       'Jefe Cap.',
}

const VIEW_META = {
  perfil: { label: 'Mi Perfil', description: 'Configura tu cuenta e interfaz' },
}

export default function App() {
  // ── Theme ──────────────────────────────────────────────────
  const [theme, setTheme] = useState(() => localStorage.getItem('gea-theme') || 'dark')

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('gea-theme', theme)
    const density = localStorage.getItem('gea-density') || 'comfortable'
    document.documentElement.setAttribute('data-density', density)
  }, [theme])

  // ── Auth / Session ─────────────────────────────────────────
  const [session,     setSession]     = useState(undefined)   // undefined = loading
  const [userProfile, setUserProfile] = useState(null)
  const [isRecoveringPassword, setIsRecoveringPassword] = useState(false)

  useEffect(() => {
    // Initial session check
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s ?? null)
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'PASSWORD_RECOVERY') {
        setIsRecoveringPassword(true)
      }
      setSession(s ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  // Load profile whenever session changes
  useEffect(() => {
    if (!session) { setUserProfile(null); return }
    fetchUserProfile(session.user.id, session.user)
      .then(p => {
        if (p) {
          setUserProfile(p)
        } else {
          setUserProfile({
            id: session.user.id,
            nombre: session.user.email?.split('@')[0] || 'Usuario',
            rol: session.user.user_metadata?.rol || 'visor',
          })
        }
      })
      .catch((err) => {
        console.error('Error cargando perfil:', err)
        const meta = session.user.user_metadata || {}
        const metaRol = meta.rol
        setUserProfile({
          id: session.user.id,
          nombre: meta.nombre || session.user.email?.split('@')[0] || 'Usuario',
          rol: ['admin', 'reclutador', 'formador', 'visor'].includes(metaRol) ? metaRol : 'visor',
        })
      })
  }, [session])

  const [demoProfile, setDemoProfile] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('gea-perfil') || '{}')
      return { id: 'demo', nombre: 'Usuario Demo', rol: 'admin', ...stored }
    } catch {
      return { id: 'demo', nombre: 'Usuario Demo', rol: 'admin' }
    }
  })

  // For demo mode (no session), treat as admin so the app is still usable
  const isDemoMode  = DB_MODE !== 'supabase'
  const effectiveSession = isDemoMode ? 'demo' : session
  const effectiveProfile = isDemoMode ? demoProfile : userProfile

  const realRole = (effectiveProfile?.rol || 'visor').toLowerCase()
  const [viewAsRole, setViewAsRole] = useState(null)
  const currentRole = realRole === 'admin' && viewAsRole ? viewAsRole : realRole
  
  const [navPermissions, setNavPermissions] = useState([])

  const navItems = ALL_NAV.filter(item => {
    // Check if there is a permission override in DB
    const dbPerm = navPermissions.find(p => p.module_id === item.id)
    if (dbPerm) {
      return dbPerm.roles.includes(currentRole)
    }
    // Fallback to hardcoded roles if not found in DB
    return item.roles.includes(currentRole)
  })

  // ── UI State ───────────────────────────────────────────────
  const [activeView,  setActiveView]  = useState('dashboard')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState(null)

  const SPECIAL_VIEWS = ['perfil']

  // Make sure active view is always accessible after role changes
  useEffect(() => {
    if (navItems.length && !navItems.find(i => i.id === activeView) && !SPECIAL_VIEWS.includes(activeView)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setActiveView(navItems[0].id)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentRole])

  // ── Data ──────────────────────────────────────────────────
  const [postulantes,  setPostulantes]  = useState([])
  const [asistencias,  setAsistencias]  = useState([])
  const [grupos,       setGrupos]       = useState([])
  const [reclutadores, setReclutadores] = useState([])
  const [sedes,        setSedes]        = useState([])
  const [campanas,     setCampanas]     = useState([])
  const [auditLogs,    setAuditLogs]    = useState([])
  const [formadores,   setFormadores]   = useState([])
  const [campanasMetas, setCampanasMetas] = useState([])
  const [motivosBaja, setMotivosBaja] = useState([])
  const [opcionesHomologadas, setOpcionesHomologadas] = useState([])
  const [appRoles, setAppRoles] = useState([])

  const rolLabels = useMemo(() => {
    const labels = { ...DEFAULT_ROL_LABELS }
    appRoles.forEach(r => { labels[r.id] = r.label })
    return labels
  }, [appRoles])

  const rolColors = useMemo(() => {
    const colors = { ...DEFAULT_ROL_COLORS }
    appRoles.forEach(r => { colors[r.id] = r.color })
    return colors
  }, [appRoles])

  const hasLoadedOnceRef = useRef(false)

  const loadAllData = useCallback(async ({ silent = hasLoadedOnceRef.current } = {}) => {
    if (!silent) setLoading(true)
    setError(null)
    try {
      const [p, a, r, s, c, al, f, cm, mb, mp, ar] = await Promise.all([
        fetchPostulantes(),
        fetchAsistencias(),
        fetchReclutadores(),
        fetchSedes(),
        fetchCampanas(),
        fetchAuditLogs(),
        fetchFormadores(),
        fetchGruposConMetas(),
        fetchMotivosBaja(),
        fetchModulePermissions(),
        fetchAppRoles()
      ])
      const g = await fetchGrupos(p)
      const homologadasData = await fetchHomologadas()
        
      setPostulantes(p)
      setGrupos(g)
      setAsistencias(a)
      setReclutadores(r)
      setSedes(s)
      setCampanas(c)
      setAuditLogs(al)
      setFormadores(f)
      setCampanasMetas(cm)
      setMotivosBaja(mb)
      setNavPermissions(mp || [])
      setAppRoles(ar || [])
      setOpcionesHomologadas(homologadasData)
      hasLoadedOnceRef.current = true
    } catch (err) {
      console.error('Error loading data:', err)
      setError(err.message || 'Error al cargar los datos.')
    } finally {
      if (!silent) setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!effectiveSession) {
      hasLoadedOnceRef.current = false
      return
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadAllData()
  }, [effectiveSession, loadAllData])

  // Tiempo real: sincronizar CAPACIDAD_RYS ↔ nómina ↔ asistencia
  useEffect(() => {
    if (!effectiveSession || DB_MODE !== 'supabase') return undefined
    const unsubscribe = subscribeOperationalData(() => {
      loadAllData()
    })
    return unsubscribe
  }, [effectiveSession, loadAllData])

  const refreshCatalogs = useCallback(async () => {
    const p = postulantes.length ? postulantes : await fetchPostulantes()
    const [r, s, c, g, f] = await Promise.all([
      fetchReclutadores(),
      fetchSedes(),
      fetchCampanas(),
      fetchGrupos(p),
      fetchFormadores(),
    ])
    setReclutadores(r)
    setSedes(s)
    setCampanas(c)
    setGrupos(g)
    setFormadores(f)
    return { r, s, c, g, f }
  }, [postulantes])

  const handleSaveNomina = async (data) => {
    const saved = await insertPostulante(data)
    setPostulantes(prev => [saved, ...prev])
    await refreshCatalogs()
    const newLogs = await fetchAuditLogs()
    setAuditLogs(newLogs)
    return saved
  }

  const handleSaveNominaBulk = async (dataList) => {
    const saved = await insertPostulantesBulk(dataList)
    if (saved && saved.inserted) {
      setPostulantes(prev => {
        const newDocs = new Set(saved.inserted.map(p => p.documento));
        return [...saved.inserted, ...prev.filter(p => !newDocs.has(p.documento))];
      })
    }
    await refreshCatalogs()
    const newLogs = await fetchAuditLogs()
    setAuditLogs(newLogs)
    return saved
  }

  const handleEditPostulante = async (updatedData) => {
    const updated = await updatePostulante(updatedData.documento, updatedData)
    setPostulantes(prev => prev.map(p => p.documento === updatedData.documento ? updated : p))
    const newLogs = await fetchAuditLogs()
    setAuditLogs(newLogs)
  }

  const handleSaveAsistencia = async (payload) => {
    await saveAsistenciaSession(payload)
    const [g, p, a, al, cm, f] = await Promise.all([
      fetchGrupos(postulantes),
      fetchPostulantes(),
      fetchAsistencias(),
      fetchAuditLogs(),
      fetchGruposConMetas(),
      fetchFormadores(),
    ])
    setGrupos(g)
    setPostulantes(p)
    setAsistencias(a)
    setAuditLogs(al)
    setCampanasMetas(cm)
    setFormadores(f)
  }

  const handleSignOut = async () => {
    await signOut()
    setSession(null)
    setUserProfile(null)
  }

  const isSupabase = DB_MODE === 'supabase'

  // ── Loading splash (checking auth) ────────────────────────
  if (session === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--bg-base)' }}>
        <div className="flex flex-col items-center gap-4">
          <Loader2 size={36} className="text-indigo-400 animate-spin" />
          <p className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>Verificando sesión…</p>
        </div>
      </div>
    )
  }

  // ── Login screen ──────────────────────────────────────────
  if (isRecoveringPassword) {
    return <ResetPassword onResetComplete={() => setIsRecoveringPassword(false)} />
  }

  if (!effectiveSession) {
    return <Login theme={theme} setTheme={setTheme} />
  }

  // Si el usuario requiere cambiar su contraseña, lo atrapamos aquí
  if (userProfile?.must_change_password) {
    return (
      <ForcePasswordChange 
        userProfile={userProfile} 
        onComplete={() => setUserProfile(prev => ({ ...prev, must_change_password: false }))} 
      />
    )
  }

  // ── Main App ──────────────────────────────────────────────
  const activeItem = navItems.find(i => i.id === activeView) ?? VIEW_META[activeView]

  return (
    <BackgroundTasksProvider onSyncComplete={loadAllData}>
    <div
      className="h-screen w-full flex overflow-hidden transition-colors duration-300"
      style={{ backgroundColor: 'var(--bg-base)', color: 'var(--text-primary)' }}
    >
      {/* ── Sidebar ── */}
      <aside className={`
        ${sidebarOpen ? 'w-64' : 'w-16'}
        flex-shrink-0 flex flex-col border-r transition-all duration-300 ease-in-out relative z-20
      `}
      style={{ background: 'var(--sidebar-bg)', borderColor: 'var(--border-subtle)' }}>

        {/* Logo */}
        <div className="flex items-center h-16 px-4 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
          {sidebarOpen ? (
            <GeaLogo size="small" showText={true} showTagline={true} />
          ) : (
            <GeaLogo size="small" showText={false} />
          )}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="ml-auto p-1.5 rounded-lg transition-colors"
            style={{ color: 'var(--text-muted)' }}
          >
            {sidebarOpen ? <X size={16} /> : <Menu size={16} />}
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto min-h-0 custom-scrollbar">
          {navItems.map(item => {
            const Icon = item.icon
            const isActive = activeView === item.id
            return (
              <button
                key={item.id}
                onClick={() => setActiveView(item.id)}
                className={`w-full flex items-center rounded-xl px-3 py-2.5 transition-all duration-200 group ${
                  isActive ? 'text-white shadow-sm' : ''
                }`}
                style={isActive
                  ? { background: 'var(--accent-soft)', color: 'var(--accent)' }
                  : { color: 'var(--text-muted)' }
                }
                onMouseEnter={e => { if (!isActive) e.currentTarget.style.backgroundColor = 'var(--bg-elevated)' }}
                onMouseLeave={e => { if (!isActive) e.currentTarget.style.backgroundColor = '' }}
              >
                <Icon size={18} className="flex-shrink-0" />
                {sidebarOpen && (
                  <>
                    <div className="ml-3 text-left overflow-hidden">
                      <div className="text-xs font-bold whitespace-nowrap">{item.label}</div>
                      <div className="text-[10px] opacity-70 whitespace-nowrap">{item.description}</div>
                    </div>
                    {isActive && <ChevronRight size={14} className="ml-auto" style={{ color: 'var(--accent)' }} />}
                  </>
                )}
              </button>
            )
          })}
        </nav>

        {/* Status + User panel */}
        {sidebarOpen && (
          <div className="p-4 border-t space-y-3" style={{ borderColor: 'var(--border-subtle)' }}>
            {/* User card */}
            {effectiveProfile && (
              <div className="rounded-xl p-3 space-y-2" style={{ background: 'var(--glass-light)', border: '1px solid var(--border-subtle)' }}>
                <div className="flex items-center gap-2">
                  {/* Avatar con foto */}
                  <button
                    onClick={() => setActiveView('perfil')}
                    className="flex-shrink-0 transition-all hover:scale-105 active:scale-95"
                    title="Ir a mi perfil"
                  >
                    <div className="w-7 h-7 rounded-full overflow-hidden border border-indigo-500/40 flex items-center justify-center"
                      style={{ background: 'var(--accent-gradient)' }}>
                      {effectiveProfile.avatar_url ? (
                        <img src={effectiveProfile.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-[10px] font-black text-white">
                          {effectiveProfile.nombre?.[0]?.toUpperCase() ?? 'U'}
                        </span>
                      )}
                    </div>
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-bold truncate" style={{ color: 'var(--text-primary)' }}>
                      {effectiveProfile.nombre}
                    </p>
                    <span className={`inline-flex items-center text-[9px] font-extrabold px-1.5 py-0.5 rounded-md uppercase tracking-wider border ${rolColors[currentRole]}`}>
                      {rolLabels[currentRole] ?? currentRole}
                    </span>
                  </div>
                </div>
                {/* Botón configurar perfil */}
                <button
                  onClick={() => setActiveView('perfil')}
                  className="w-full flex items-center justify-center gap-1.5 text-[10px] font-bold px-2 py-1.5 rounded-lg transition-all"
                  style={{ color: 'var(--text-muted)', border: '1px solid var(--border-subtle)' }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--accent-soft)'; e.currentTarget.style.color = 'var(--accent)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = ''; e.currentTarget.style.color = 'var(--text-muted)' }}
                >
                  <User size={10} />
                  Configurar perfil
                </button>
              </div>
            )}

            {/* DB status */}
            <div className="rounded-xl p-3 space-y-2" style={{ background: 'var(--glass-light)', border: '1px solid var(--border-subtle)' }}>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Base de datos</span>
                <div className="flex items-center space-x-1">
                  {isSupabase
                    ? <><Wifi size={10} className="text-emerald-400" /><span className="text-[10px] text-emerald-400 font-bold">Supabase</span></>
                    : <><WifiOff size={10} className="text-amber-400" /><span className="text-[10px] text-amber-400 font-bold">Demo</span></>
                  }
                </div>
              </div>
              <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                <span className="font-semibold" style={{ color: 'var(--text-secondary)' }}>{new Set(postulantes.map(p => p.documento)).size}</span> postulantes
              </div>
              <button
                onClick={loadAllData}
                className="w-full flex items-center justify-center space-x-1 text-[10px] transition-colors mt-1"
                style={{ color: 'var(--text-muted)' }}
              >
                <RefreshCw size={10} /><span>Actualizar datos</span>
              </button>
            </div>

            {/* Theme & Sign out */}
            <div className="flex gap-2">
              {/* Quick theme toggle */}
              <div className="flex gap-1 rounded-xl p-1 flex-1 justify-center" style={{ background: 'var(--bg-elevated)' }}>
                {THEMES.map(t => {
                  const TIcon = t.icon
                  return (
                    <button
                      key={t.id}
                      title={t.label}
                      onClick={() => setTheme(t.id)}
                      className={`p-1.5 rounded-lg transition-all ${theme === t.id ? 'text-white shadow-sm' : ''}`}
                      style={theme === t.id
                        ? { background: 'var(--accent)' }
                        : { color: 'var(--text-muted)' }
                      }
                    >
                      <TIcon size={12} />
                    </button>
                  )
                })}
              </div>
              {/* Sign out */}
              {!isDemoMode && (
                <button
                  onClick={handleSignOut}
                  title="Cerrar sesión"
                  className="p-2 rounded-xl transition-colors"
                  style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}
                  onMouseEnter={e => { e.currentTarget.style.color = '#f87171'; e.currentTarget.style.backgroundColor = 'rgba(239,68,68,0.1)' }}
                  onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.backgroundColor = 'var(--bg-elevated)' }}
                >
                  <LogOut size={14} />
                </button>
              )}
            </div>
          </div>
        )}
      </aside>

      {/* ── Main content ── */}
      <main className="flex-1 flex flex-col overflow-auto">
        {/* Top Bar */}
        <header
          className="h-16 border-b flex items-center px-8 sticky top-0 z-10 backdrop-blur"
          style={{ background: 'var(--header-bg)', borderColor: 'var(--border-subtle)' }}
        >
          <div>
            {activeItem && (
              <>
                <h2 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>{activeItem.label}</h2>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{activeItem.description}</p>
              </>
            )}
          </div>

          <div className="ml-auto flex items-center space-x-3">
            {/* Connection badge */}
            {isSupabase ? (
              <div className="flex items-center space-x-2 text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-3 py-1.5 rounded-xl">
                <Wifi size={12} /><span className="font-semibold">Supabase</span>
              </div>
            ) : (
              <div className="flex items-center space-x-2 text-xs bg-amber-500/10 text-amber-400 border border-amber-500/20 px-3 py-1.5 rounded-xl">
                <Activity size={12} /><span className="font-semibold">Modo Demo</span>
              </div>
            )}

            {/* View As toggle for Admin */}
            {realRole === 'admin' && (
              <div className="flex items-center gap-1 bg-[var(--bg-elevated)] border border-[var(--border-subtle)] p-1 rounded-xl shadow-sm">
                <div className="px-2 text-[var(--text-muted)] flex items-center">
                  <Eye size={12} className="mr-1" />
                  <span className="text-[10px] font-bold uppercase tracking-wider hidden md:inline">Vista</span>
                </div>
                {appRoles.map(r => (
                  <button
                    key={r.id}
                    title={`Ver como ${r.label}`}
                    onClick={() => setViewAsRole(r.id === 'admin' ? null : r.id)}
                    className={`px-1.5 py-1 text-[10px] font-bold rounded-lg transition-all ${
                      (viewAsRole || 'admin') === r.id 
                        ? 'bg-[var(--accent)] text-white shadow-sm' 
                        : 'text-[var(--text-secondary)] hover:bg-[var(--bg-muted)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    {r.short_label || r.label.charAt(0).toUpperCase()}
                  </button>
                ))}
              </div>
            )}

            {/* Theme toggle pill */}
            <div className="flex gap-0.5 rounded-xl p-1 border" style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)' }}>
              {THEMES.map(t => {
                const TIcon = t.icon
                return (
                  <button
                    key={t.id}
                    title={t.label}
                    onClick={() => setTheme(t.id)}
                    className={`p-1.5 rounded-lg transition-all ${theme === t.id ? 'text-white shadow-sm' : ''}`}
                    style={theme === t.id
                      ? { background: 'var(--accent)' }
                      : { color: 'var(--text-muted)' }
                    }
                  >
                    <TIcon size={13} />
                  </button>
                )
              })}
            </div>

            {/* Avatar → link to profile */}
            <button
              id="btn-perfil-avatar"
              onClick={() => setActiveView('perfil')}
              title="Configurar perfil"
              className="w-8 h-8 rounded-full overflow-hidden shadow-lg transition-all hover:scale-110 active:scale-95 flex-shrink-0"
              style={{ background: 'var(--accent-gradient)', boxShadow: '0 0 0 0 transparent' }}
              onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 0 0 2px var(--accent-glow)' }}
              onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 0 0 0 transparent' }}
            >
              {effectiveProfile?.avatar_url ? (
                <img src={effectiveProfile.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                <span className="w-full h-full flex items-center justify-center text-xs font-black text-white">
                  {effectiveProfile?.nombre?.[0]?.toUpperCase() ?? <User size={14} />}
                </span>
              )}
            </button>
          </div>
        </header>

        {/* Content area */}
        <div className="flex-1 p-8">
          {loading && (
            <div className="flex flex-col items-center justify-center h-80 space-y-4">
              <Loader2 size={40} className="text-indigo-400 animate-spin" />
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                Cargando datos{isSupabase ? ' desde Supabase' : ' locales'}…
              </p>
            </div>
          )}

          {!loading && error && (
            <div className="glass rounded-2xl p-8 text-center space-y-4 border border-rose-500/20">
              <p className="text-rose-400 font-semibold">Error al cargar los datos</p>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{error}</p>
              <button onClick={() => loadAllData({ silent: false })} className="btn-primary px-6 py-2 rounded-xl text-sm">Reintentar</button>
            </div>
          )}

          {!loading && !error && (
            <>
              <KeepAliveView viewId="dashboard" activeView={activeView}>
                {navItems.some(i => i.id === 'dashboard') && (
                  <Dashboard postulantes={postulantes} asistencias={asistencias} grupos={grupos} role={currentRole} userProfile={effectiveProfile} campanasMetas={campanasMetas} formadores={formadores} reclutadores={reclutadores} />
                )}
              </KeepAliveView>

              {activeView === 'metas' && navItems.some(i => i.id === 'metas') && <MetasManagement postulantes={postulantes} asistencias={asistencias} />}

              <KeepAliveView viewId="capacidad" activeView={activeView}>
                {navItems.some(i => i.id === 'capacidad') && (
                  <CapacidadRys grupos={grupos} campanas={campanas} postulantes={postulantes} onRefresh={loadAllData} readOnly={currentRole !== 'admin'} />
                )}
              </KeepAliveView>

              {activeView === 'attendancebi' && navItems.some(i => i.id === 'attendancebi') && (
                <AttendanceBI grupos={grupos} postulantes={postulantes} asistencias={asistencias} />
              )}

              {activeView === 'consolidado' && navItems.some(i => i.id === 'consolidado') && (
                <ConsolidadoPowerBI />
              )}
              
              {activeView === 'motivos_bajas_bi' && navItems.some(i => i.id === 'motivos_bajas_bi') && (
                <MotivosBajasBI />
              )}

              {activeView === 'descuentos_bi' && navItems.some(i => i.id === 'descuentos_bi') && (
                <DescuentosBI />
              )}

              {activeView === 'legacy_dashboards' && navItems.some(i => i.id === 'legacy_dashboards') && (
                <LegacyDashboards currentRole={currentRole} />
              )}

              {activeView === 'dashboards_admin' && navItems.some(i => i.id === 'dashboards_admin') && (
                <DashboardsAdmin />
              )}
              
              {activeView === 'role_permissions' && navItems.some(i => i.id === 'role_permissions') && (
                <RolePermissionsAdmin />
              )}

              <KeepAliveView viewId="descuentos_form" activeView={activeView}>
                {navItems.some(i => i.id === 'descuentos_form') && (
                  <DescuentosForm 
                    userProfile={effectiveProfile} 
                    grupos={grupos}
                    opcionesHomologadas={opcionesHomologadas}
                  />
                )}
              </KeepAliveView>

              <KeepAliveView viewId="descuentos_auth" activeView={activeView}>
                {navItems.some(i => i.id === 'descuentos_auth') && (
                  <DescuentosAutorizacion />
                )}
              </KeepAliveView>

              <KeepAliveView viewId="propuestas" activeView={activeView}>
                <PropuestasModule />
              </KeepAliveView>

              <KeepAliveView viewId="nomina" activeView={activeView} className="space-y-12">
                {navItems.some(i => i.id === 'nomina') && (
                  <>
                    <NominaForm
                      reclutadores={reclutadores}
                      sedes={sedes}
                      campanas={campanas}
                      grupos={grupos}
                      formadores={formadores}
                      postulantes={postulantes}
                      asistencias={asistencias}
                      userProfile={effectiveProfile}
                      onSave={handleSaveNomina}
                      onSaveBulk={handleSaveNominaBulk}
                      onCatalogRefresh={refreshCatalogs}
                    />
                    <PostulantesTable postulantes={postulantes} asistencias={asistencias} reclutadores={reclutadores} sedes={sedes} onEdit={handleEditPostulante} />
                  </>
                )}
              </KeepAliveView>

              <KeepAliveView viewId="nominas_completar" activeView={activeView}>
                {navItems.some(i => i.id === 'nominas_completar') && (
                  <NominaCompletar grupos={grupos} />
                )}
              </KeepAliveView>

              <KeepAliveView viewId="asistencia" activeView={activeView}>
                {navItems.some(i => i.id === 'asistencia') && (
                  <AsistenciaForm grupos={grupos} postulantes={postulantes} asistencias={asistencias} formadores={formadores} campanasMetas={campanasMetas} motivosBaja={motivosBaja} userProfile={effectiveProfile} userRole={currentRole} onSave={handleSaveAsistencia} />
                )}
              </KeepAliveView>
              <KeepAliveView viewId="reportedia1" activeView={activeView}>
                {navItems.some(i => i.id === 'reportedia1') && (
                  <ReporteDia1 grupos={grupos} postulantes={postulantes} asistencias={asistencias} userProfile={effectiveProfile} />
                )}
              </KeepAliveView>

              {activeView === 'auditlogs' && navItems.some(i => i.id === 'auditlogs') && <AuditLogs logs={auditLogs} />}
              {activeView === 'users' && navItems.some(i => i.id === 'users') && <UserManagement navPermissions={navPermissions} />}
              {activeView === 'equipo_reclutamiento' && navItems.some(i => i.id === 'equipo_reclutamiento') && <EquipoReclutamiento />}
              {activeView === 'equipo_formacion' && navItems.some(i => i.id === 'equipo_formacion') && <EquipoFormacion />}
              {activeView === 'asignacion_formador' && navItems.some(i => i.id === 'asignacion_formador') && (
                <AsignacionFormador
                  grupos={grupos}
                  formadores={formadores}
                  onRefresh={loadAllData}
                />
              )}
              {activeView === 'config' && navItems.some(i => i.id === 'config') && <MotivosBajaAdmin motivosBaja={motivosBaja} onRefresh={loadAllData} />}
              {activeView === 'perfil' && (
                <PerfilConfig
                  userProfile={effectiveProfile}
                  theme={theme}
                  setTheme={setTheme}
                  themes={THEMES}
                  onProfileUpdate={(updated) => {
                    if (isDemoMode) {
                      try {
                        const stored = JSON.parse(localStorage.getItem('gea-perfil') || '{}')
                        const merged = { ...stored, ...updated, id: 'demo' }
                        localStorage.setItem('gea-perfil', JSON.stringify(merged))
                        setDemoProfile(merged)
                      } catch { /* ignore */ }
                    } else {
                      setUserProfile(updated)
                    }
                  }}
                />
              )}
            </>
          )}
        </div>
      </main>
      <GlobalTaskBar />
    </div>
    </BackgroundTasksProvider>
  )
}
