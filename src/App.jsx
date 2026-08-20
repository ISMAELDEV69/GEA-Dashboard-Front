import { useState, useEffect, useCallback, useRef, useMemo, lazy, Suspense } from 'react'
import {
  LayoutDashboard, UserPlus, ClipboardCheck, History,
  Activity, Loader2, Target, GraduationCap, Layers, BarChart3, Users, UserCheck, Shield, Eye, Radio
} from 'lucide-react'

// ── Vistas Críticas / Modales Síncronos ──────────────────────────────────────────
import Login from './components/Login'
import ResetPassword from './components/ResetPassword'
import ForcePasswordChange from './components/ForcePasswordChange'
import ErrorBoundary from './components/ErrorBoundary'
import { ToastProvider } from './context/ToastContext'
import { TooltipProvider } from './components/ui/tooltip'
import AppSidebar from './components/layout/AppSidebar'
import AppHeader from './components/layout/AppHeader'
import CommandPalette from './components/layout/CommandPalette'
import KeepAliveView from './components/KeepAliveView'
import ViewLoadingSkeleton from './components/ui/ViewLoadingSkeleton'
import GlobalTaskBar from './components/GlobalTaskBar'
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
  signOut,
  fetchGruposConMetas,
  fetchMotivosBaja,
  fetchHomologadas,
  subscribeOperationalData,
  fetchModulePermissions,
  fetchAppRoles,
} from './lib/dataService'

import { lazyWithRetry } from './lib/lazyWithRetry'

// ── Code Splitting Seguro y Resiliente ante Nuevos Despliegues en Netlify ─────────
const Dashboard = lazyWithRetry(() => import('./components/Dashboard'))
const ReclutadorDashboard = lazyWithRetry(() => import('./components/dashboard/ReclutadorDashboard'))
const NominaForm = lazyWithRetry(() => import('./components/NominaForm'))
const NominaCompletar = lazyWithRetry(() => import('./pages/NominaCompletar'))
const AsistenciaForm = lazyWithRetry(() => import('./components/AsistenciaForm'))
const AttendanceBI = lazyWithRetry(() => import('./components/AttendanceBI'))
const ConsolidadoPowerBI = lazyWithRetry(() => import('./components/ConsolidadoPowerBI'))
const DescuentosBI = lazyWithRetry(() => import('./components/DescuentosBI'))
const MotivosBajasBI = lazyWithRetry(() => import('./components/MotivosBajasBI'))
const DescuentosForm = lazyWithRetry(() => import('./components/DescuentosForm'))
const DescuentosAutorizacion = lazyWithRetry(() => import('./components/DescuentosAutorizacion'))
const PropuestasModule = lazyWithRetry(() => import('./pages/PropuestasModule'))
const ReporteDia1 = lazyWithRetry(() => import('./components/ReporteDia1'))
const ResumenCapacitacion = lazyWithRetry(() => import('./components/ResumenCapacitacion'))
const CapacidadRys = lazyWithRetry(() => import('./components/CapacidadRys'))
const MetasManagement = lazyWithRetry(() => import('./components/MetasManagement'))
const AuditLogs = lazyWithRetry(() => import('./components/AuditLogs'))
const UserManagement = lazyWithRetry(() => import('./components/UserManagement'))
const EquipoReclutamiento = lazyWithRetry(() => import('./pages/EquipoReclutamiento'))
const EquipoFormacion = lazyWithRetry(() => import('./pages/EquipoFormacion'))
const AsignacionFormador = lazyWithRetry(() => import('./pages/AsignacionFormador'))
const MotivosBajaAdmin = lazyWithRetry(() => import('./components/MotivosBajaAdmin'))
const PerfilConfig = lazyWithRetry(() => import('./components/PerfilConfig'))
const LegacyDashboards = lazyWithRetry(() => import('./components/LegacyDashboards'))
const DashboardsAdmin = lazyWithRetry(() => import('./components/DashboardsAdmin'))
const RolePermissionsAdmin = lazyWithRetry(() => import('./components/RolePermissionsAdmin'))
const PostulantesTable = lazyWithRetry(() => import('./components/PostulantesTable'))

// ── RBAC: Navegación de Vistas por Rol ──────────────────────────────────────────
const ALL_NAV = [
  { id: 'resumen_capacitacion', label: 'Resumen Cap.', icon: BarChart3, description: 'KPIs y embudo de capacitación', roles: ['admin', 'visor', 'formador', 'supervisor_capacitacion', 'jefe_capacitacion'] },
  { id: 'consolidado', label: 'Control de Asistencia', icon: Activity, description: 'Power BI de metas vs real', roles: ['admin', 'formador', 'visor', 'supervisor_capacitacion', 'coordinador_rys'] },
  { id: 'descuentos_bi', label: 'Descuentos BI', icon: Layers, description: 'Análisis de procedencias', roles: ['admin', 'formador', 'visor'] },
  { id: 'motivos_bajas_bi', label: 'Motivos de Bajas', icon: Activity, description: 'Pareto causal de deserción', roles: ['admin', 'formador', 'visor'] },
  { id: 'attendancebi', label: 'Dispersión BI', icon: Activity, description: 'Métricas de retención diaria', roles: ['admin', 'formador', 'visor'] },
  { id: 'dashboard', label: 'Dashboard General', icon: LayoutDashboard, description: 'Control Operativo y SLAs', roles: ['admin', 'reclutador', 'formador', 'visor', 'supervisor_capacitacion', 'coordinador_rys', 'jefe_rys', 'jefe_capacitacion'] },
  { id: 'reportedia1', label: 'Reporte Día 1', icon: Radio, description: 'Calibración inicial de grupos', roles: ['admin', 'visor', 'reclutador', 'formador'] },
  { id: 'cartera_reclutador', label: 'Mi Cartera', icon: Users, description: 'Métricas, metas y postulantes', roles: ['admin', 'reclutador', 'coordinador_rys', 'jefe_rys'] },
  { id: 'capacidad', label: 'Capacidad RYS', icon: Layers, description: 'Planificación de grupos y metas', roles: ['admin', 'formador', 'visor', 'coordinador_rys', 'jefe_rys'] },
  { id: 'asignacion_formador', label: 'Asignar Formador', icon: UserCheck, description: 'Distribución de formadores', roles: ['admin', 'formador', 'supervisor_capacitacion', 'jefe_capacitacion'] },
  { id: 'asistencia', label: 'Marcación Asistencia', icon: ClipboardCheck, description: 'Registro diario A / F / B', roles: ['admin', 'formador', 'supervisor_capacitacion'] },
  { id: 'nominas_completar', label: 'Nóminas', icon: ClipboardCheck, description: 'Validación y completar datos', roles: ['admin', 'reclutador', 'formador'] },
  { id: 'nomina', label: 'Bolsa Postulantes', icon: UserPlus, description: 'Ingreso masivo y registro', roles: ['admin', 'reclutador', 'formador', 'supervisor_capacitacion', 'coordinador_rys', 'jefe_rys', 'jefe_capacitacion', 'visor'] },
  { id: 'propuestas', label: 'Propuestas', icon: ClipboardCheck, description: 'Formatos y acuerdos', roles: ['admin', 'visor', 'reclutador'] },
  { id: 'descuentos_auth', label: 'Autorizar RYS', icon: Shield, description: 'Aprobación de descuentos', roles: ['admin', 'jefe_rys', 'coordinador_rys', 'jefe_capacitacion'] },
  { id: 'descuentos_form', label: 'Cargar Descuentos', icon: Layers, description: 'Ingreso de incidencias', roles: ['admin', 'formador', 'reclutador'] },
  { id: 'metas', label: 'Metas y Equipos', icon: Target, description: 'Objetivos de campañas', roles: ['admin', 'coordinador_rys', 'jefe_rys', 'jefe_capacitacion'] },
  { id: 'equipo_reclutamiento', label: 'Eq. Reclutamiento', icon: Users, description: 'Directorio de reclutadores', roles: ['admin', 'coordinador_rys', 'jefe_rys'] },
  { id: 'equipo_formacion', label: 'Equipo Formación', icon: GraduationCap, description: 'Directorio de formadores', roles: ['admin', 'supervisor_capacitacion', 'jefe_capacitacion'] },
  { id: 'config', label: 'Configuraciones', icon: LayoutDashboard, description: 'Motivos de Baja y otros', roles: ['admin'] },
  { id: 'legacy_dashboards', label: 'Dashboards', icon: BarChart3, description: 'Panel de Control', roles: ['admin', 'formador', 'visor', 'reclutador'] },
  { id: 'dashboards_admin', label: 'Gestor Dashboards', icon: BarChart3, description: 'Administrar enlaces', roles: ['admin'] },
  { id: 'role_permissions', label: 'Permisos de Roles', icon: Shield, description: 'Gestor de Accesos', roles: ['admin'] },
  { id: 'users', label: 'Usuarios', icon: Users, description: 'Gestión de Cuentas', roles: ['admin'] },
  { id: 'auditlogs', label: 'Auditoría', icon: History, description: 'Historial de Cambios', roles: ['admin'] },
]

export default function App() {
  // ── Tema y Densidad Visual ───────────────────────────────────────────────────
  const [theme, setTheme] = useState(() => localStorage.getItem('gea-theme') || 'dark')

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('gea-theme', theme)
    const density = localStorage.getItem('gea-density') || 'comfortable'
    document.documentElement.setAttribute('data-density', density)
  }, [theme])

  // ── Auth & Sesión ────────────────────────────────────────────────────────────
  const [session, setSession] = useState(undefined)
  const [userProfile, setUserProfile] = useState(null)
  const [isRecoveringPassword, setIsRecoveringPassword] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s ?? null)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'PASSWORD_RECOVERY') {
        setIsRecoveringPassword(true)
      }
      setSession(s ?? null)
    })

    const handleSessionExpired = () => {
      console.warn('[App] Session expired event received. Clearing session state.')
      setSession(null)
      setUserProfile(null)
    }
    window.addEventListener('gea:session_expired', handleSessionExpired)

    return () => {
      subscription.unsubscribe()
      window.removeEventListener('gea:session_expired', handleSessionExpired)
    }
  }, [])

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
            rol: session.user.app_metadata?.rol || session.user.user_metadata?.rol || 'visor',
          })
        }
      })
      .catch((err) => {
        console.error('Error cargando perfil:', err)
        const meta = session.user.app_metadata || session.user.user_metadata || {}
        const metaRol = meta.rol
        setUserProfile({
          id: session.user.id,
          nombre: meta.nombre || session.user.email?.split('@')[0] || 'Usuario',
          rol: ['admin', 'reclutador', 'formador', 'visor', 'supervisor_capacitacion', 'coordinador_rys', 'jefe_rys', 'jefe_capacitacion'].includes(metaRol) ? metaRol : 'visor',
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

  const isDemoMode = DB_MODE !== 'supabase'
  const effectiveSession = isDemoMode ? 'demo' : session
  const effectiveProfile = isDemoMode ? demoProfile : userProfile

  const realRole = (effectiveProfile?.rol || 'visor').toLowerCase()
  const [viewAsRole, setViewAsRole] = useState(null)
  const currentRole = realRole === 'admin' && viewAsRole ? viewAsRole : realRole

  const [navPermissions, setNavPermissions] = useState([])

  const navItems = useMemo(() => {
    return ALL_NAV.filter(item => {
      const dbPerm = navPermissions.find(p => p.module_id === item.id)
      if (dbPerm) return dbPerm.roles.includes(currentRole)
      return item.roles.includes(currentRole)
    })
  }, [navPermissions, currentRole])

  // ── Estado de Vista ──────────────────────────────────────────────────────────
  const [activeView, setActiveView] = useState('resumen_capacitacion')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false)

  const SPECIAL_VIEWS = ['perfil']

  // Global Shortcut: Ctrl+K / Cmd+K for Command Palette
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setIsCommandPaletteOpen(prev => !prev)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  useEffect(() => {
    if (navItems.length && !navItems.find(i => i.id === activeView) && !SPECIAL_VIEWS.includes(activeView)) {
      setActiveView(navItems[0].id)
    }
  }, [currentRole, navItems, activeView])

  // ── Datos Globales ───────────────────────────────────────────────────────────
  const [postulantes, setPostulantes] = useState([])
  const [asistencias, setAsistencias] = useState([])
  const [grupos, setGrupos] = useState([])
  const [reclutadores, setReclutadores] = useState([])
  const [sedes, setSedes] = useState([])
  const [campanas, setCampanas] = useState([])
  const [auditLogs, setAuditLogs] = useState([])
  const [formadores, setFormadores] = useState([])
  const [campanasMetas, setCampanasMetas] = useState([])
  const [motivosBaja, setMotivosBaja] = useState([])
  const [opcionesHomologadas, setOpcionesHomologadas] = useState([])
  const [appRoles, setAppRoles] = useState([])

  const hasLoadedOnceRef = useRef(false)

  const loadAllData = useCallback(async ({ silent = hasLoadedOnceRef.current } = {}) => {
    if (!silent) setLoading(true)
    setError(null)
    try {
      // ── FASE 1: Carga Ultrarrápida (<100ms: Catálogos, Roles, Permisos, Grupos y Formadores) ─
      const [r, s, c, mb, mp, ar, h, fInit, gInit] = await Promise.all([
        fetchReclutadores().catch(e => { console.warn('fetchReclutadores error:', e); return [] }),
        fetchSedes().catch(e => { console.warn('fetchSedes error:', e); return [] }),
        fetchCampanas().catch(e => { console.warn('fetchCampanas error:', e); return [] }),
        fetchMotivosBaja().catch(e => { console.warn('fetchMotivosBaja error:', e); return [] }),
        fetchModulePermissions().catch(e => { console.warn('fetchModulePermissions error:', e); return [] }),
        fetchAppRoles().catch(e => { console.warn('fetchAppRoles error:', e); return [] }),
        fetchHomologadas().catch(e => { console.warn('fetchHomologadas error:', e); return [] }),
        fetchFormadores().catch(e => { console.warn('fetchFormadores error:', e); return [] }),
        fetchGrupos().catch(e => { console.warn('fetchGrupos error:', e); return [] })
      ])

      setReclutadores(r || [])
      setSedes(s || [])
      setCampanas(c || [])
      setMotivosBaja(mb || [])
      setNavPermissions(mp || [])
      setAppRoles(ar || [])
      setOpcionesHomologadas(h || [])
      if (fInit?.length) setFormadores(fInit)
      if (gInit?.length) setGrupos(gInit)

      // Desbloquear inmediatamente la UI para que el usuario nunca vea la pantalla trabada
      if (!silent) setLoading(false)
      hasLoadedOnceRef.current = true

      // ── FASE 2: Carga en Segundo Plano (Metas, Postulantes, Asistencias, Logs) ─
      const [cm, p, a, al] = await Promise.all([
        fetchGruposConMetas().catch(e => { console.warn('fetchGruposConMetas error:', e); return [] }),
        fetchPostulantes({ all: true }).catch(e => { console.warn('fetchPostulantes error:', e); return [] }),
        fetchAsistencias().catch(e => { console.warn('fetchAsistencias error:', e); return [] }),
        fetchAuditLogs().catch(e => { console.warn('fetchAuditLogs error:', e); return [] })
      ])

      if (cm?.length) setCampanasMetas(cm)
      if (p?.length) {
        setPostulantes(p)
        const gEnriched = await fetchGrupos(p).catch(e => { console.warn('fetchGrupos enriched error:', e); return null })
        if (gEnriched?.length) setGrupos(gEnriched)
      }
      if (a?.length) setAsistencias(a)
      if (al?.length) setAuditLogs(al)

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
    loadAllData()
  }, [effectiveSession, loadAllData])

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

  // ── Pantalla de Carga de Sesión ──────────────────────────────────────────────
  if (session === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-base)]">
        <div className="flex flex-col items-center gap-4">
          <Loader2 size={36} className="text-cyan-400 animate-spin" />
          <p className="text-sm font-medium text-[var(--text-muted)]">Verificando sesión…</p>
        </div>
      </div>
    )
  }

  // ── Pantalla de Login / Recuperación ─────────────────────────────────────────
  if (isRecoveringPassword) {
    return <ResetPassword onResetComplete={() => setIsRecoveringPassword(false)} />
  }

  if (!effectiveSession) {
    return <Login theme={theme} setTheme={setTheme} />
  }

  if (userProfile?.must_change_password) {
    return (
      <ForcePasswordChange 
        userProfile={userProfile} 
        onComplete={() => setUserProfile(prev => ({ ...prev, must_change_password: false }))} 
      />
    )
  }

  // ── Aplicación Principal ─────────────────────────────────────────────────────
  return (
    <ErrorBoundary>
      <ToastProvider>
        <BackgroundTasksProvider onSyncComplete={loadAllData}>
          <TooltipProvider delayDuration={150}>
            <div
              className="h-screen w-full flex overflow-hidden transition-colors duration-300 bg-[var(--bg-base)] text-[var(--text-primary)]"
            >
              {/* Sidebar Inteligente */}
              <AppSidebar
                activeView={activeView}
                setActiveView={setActiveView}
                navItems={navItems}
                userProfile={effectiveProfile}
                onLogout={handleSignOut}
                onOpenProfile={() => setActiveView('perfil')}
              />

              {/* Contenedor Principal con Header Global */}
              <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
                <AppHeader
                  activeView={activeView}
                  theme={theme}
                  setTheme={setTheme}
                  onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
                  onRefreshData={loadAllData}
                  isRefreshing={loading}
                  userProfile={effectiveProfile}
                  onOpenProfile={() => setActiveView('perfil')}
                  isOnline={isSupabase}
                  realRole={realRole}
                  currentRole={currentRole}
                  viewAsRole={viewAsRole}
                  onSelectViewRole={setViewAsRole}
                />

                {/* Banner de Advertencia en Modo Local / Offline */}
                {!isSupabase && (
                  <div className="bg-amber-500/15 border-b border-amber-500/30 px-4 py-2 text-xs text-amber-300 flex items-center justify-between shadow-xs shrink-0">
                    <div className="flex items-center gap-2">
                      <span className="inline-block w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                      <span className="font-bold">MODO OFFLINE / COPIA LOCAL:</span>
                      <span>No hay conexión en vivo con Supabase. Los datos mostrados corresponden a la copia de respaldo local y NO están sincronizados en tiempo real.</span>
                    </div>
                    <button 
                      onClick={() => loadAllData({ silent: false })} 
                      className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-200 transition-colors"
                    >
                      Reintentar Conexión
                    </button>
                  </div>
                )}

                {/* Content Area con KeepAlive & Suspense Code-Splitting */}
                <main className="flex-1 min-h-0 overflow-hidden flex flex-col bg-[var(--bg-base)]">
                  {loading && (
                    <div className="flex flex-col items-center justify-center h-80 space-y-4">
                      <Loader2 size={40} className="text-cyan-400 animate-spin" />
                      <p className="text-sm text-[var(--text-secondary)]">
                        Cargando datos{isSupabase ? ' desde Supabase' : ' locales'}…
                      </p>
                    </div>
                  )}

                  {!loading && error && (
                    <div className="m-6 glass rounded-2xl p-8 text-center space-y-4 border border-rose-500/20">
                      <p className="text-rose-400 font-semibold">Error al cargar los datos</p>
                      <p className="text-sm text-[var(--text-secondary)]">{error}</p>
                      <button onClick={() => loadAllData({ silent: false })} className="btn-primary px-6 py-2 rounded-xl text-sm">
                        Reintentar
                      </button>
                    </div>
                  )}

                  {!loading && !error && (
                    <Suspense fallback={<ViewLoadingSkeleton />}>
                      {/* 1. Resumen Capacitación (Looker Studio) */}
                      <KeepAliveView viewId="resumen_capacitacion" activeView={activeView}>
                        {navItems.some(i => i.id === 'resumen_capacitacion') && (
                          <ResumenCapacitacion />
                        )}
                      </KeepAliveView>

                      {/* 2. Mi Cartera (Looker / BI) */}
                      <KeepAliveView viewId="cartera_reclutador" activeView={activeView}>
                        {navItems.some(i => i.id === 'cartera_reclutador') && (
                          <ReclutadorDashboard
                            postulantes={postulantes}
                            asistencias={asistencias}
                            userProfile={effectiveProfile}
                            campanasMetas={campanasMetas}
                            reclutadores={reclutadores}
                            grupos={grupos}
                            isAdmin={['admin', 'jefe_rys', 'coordinador_rys', 'supervisor_capacitacion'].includes(currentRole)}
                          />
                        )}
                      </KeepAliveView>

                      {/* 3. Dashboard General (Control Operativo) */}
                      <KeepAliveView viewId="dashboard" activeView={activeView}>
                        {navItems.some(i => i.id === 'dashboard') && (
                          <Dashboard
                            postulantes={postulantes}
                            asistencias={asistencias}
                            grupos={grupos}
                            role={currentRole}
                            userProfile={effectiveProfile}
                            campanasMetas={campanasMetas}
                            formadores={formadores}
                            reclutadores={reclutadores}
                          />
                        )}
                      </KeepAliveView>

                      {/* 4. Metas y Equipos */}
                      <KeepAliveView viewId="metas" activeView={activeView}>
                        {navItems.some(i => i.id === 'metas') && (
                          <MetasManagement postulantes={postulantes} asistencias={asistencias} />
                        )}
                      </KeepAliveView>

                      {/* 5. Capacidad RYS */}
                      <KeepAliveView viewId="capacidad" activeView={activeView}>
                        {navItems.some(i => i.id === 'capacidad') && (
                          <CapacidadRys grupos={grupos} campanas={campanas} postulantes={postulantes} onRefresh={loadAllData} readOnly={currentRole !== 'admin'} />
                        )}
                      </KeepAliveView>

                      {/* 6. Attendance BI */}
                      <KeepAliveView viewId="attendancebi" activeView={activeView}>
                        {navItems.some(i => i.id === 'attendancebi') && (
                          <AttendanceBI grupos={grupos} postulantes={postulantes} asistencias={asistencias} formadores={formadores} />
                        )}
                      </KeepAliveView>

                      {/* 7. Consolidado PowerBI */}
                      <KeepAliveView viewId="consolidado" activeView={activeView}>
                        {navItems.some(i => i.id === 'consolidado') && (
                          <ConsolidadoPowerBI />
                        )}
                      </KeepAliveView>

                      {/* 8. Motivos Bajas BI */}
                      <KeepAliveView viewId="motivos_bajas_bi" activeView={activeView}>
                        {navItems.some(i => i.id === 'motivos_bajas_bi') && (
                          <MotivosBajasBI grupos={grupos} postulantes={postulantes} />
                        )}
                      </KeepAliveView>

                      {/* 9. Descuentos BI */}
                      <KeepAliveView viewId="descuentos_bi" activeView={activeView}>
                        {navItems.some(i => i.id === 'descuentos_bi') && (
                          <DescuentosBI />
                        )}
                      </KeepAliveView>

                      {/* 10. Descuentos Form */}
                      <KeepAliveView viewId="descuentos_form" activeView={activeView}>
                        {navItems.some(i => i.id === 'descuentos_form') && (
                          <DescuentosForm userProfile={effectiveProfile} grupos={grupos} opcionesHomologadas={opcionesHomologadas} />
                        )}
                      </KeepAliveView>

                      {/* 11. Descuentos Autorización */}
                      <KeepAliveView viewId="descuentos_auth" activeView={activeView}>
                        {navItems.some(i => i.id === 'descuentos_auth') && (
                          <DescuentosAutorizacion />
                        )}
                      </KeepAliveView>

                      {/* 12. Propuestas */}
                      <KeepAliveView viewId="propuestas" activeView={activeView}>
                        <PropuestasModule />
                      </KeepAliveView>

                      {/* 13. Nómina Operativa */}
                      <KeepAliveView viewId="nomina" activeView={activeView}>
                        {navItems.some(i => i.id === 'nomina') && (
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
                        )}
                      </KeepAliveView>

                      {/* 14. Nóminas por Completar */}
                      <KeepAliveView viewId="nominas_completar" activeView={activeView}>
                        {navItems.some(i => i.id === 'nominas_completar') && (
                          <NominaCompletar
                            grupos={grupos}
                            userProfile={effectiveProfile}
                            currentRole={currentRole}
                            postulantes={postulantes}
                            reclutadores={reclutadores}
                          />
                        )}
                      </KeepAliveView>

                      {/* 15. Marcación Asistencia */}
                      <KeepAliveView viewId="asistencia" activeView={activeView}>
                        {navItems.some(i => i.id === 'asistencia') && (
                          <AsistenciaForm grupos={grupos} postulantes={postulantes} asistencias={asistencias} formadores={formadores} campanasMetas={campanasMetas} motivosBaja={motivosBaja} userProfile={effectiveProfile} userRole={currentRole} onSave={handleSaveAsistencia} />
                        )}
                      </KeepAliveView>

                      {/* 16. Reporte Día 1 */}
                      <KeepAliveView viewId="reportedia1" activeView={activeView}>
                        {navItems.some(i => i.id === 'reportedia1') && (
                          <ReporteDia1 grupos={grupos} postulantes={postulantes} asistencias={asistencias} userProfile={effectiveProfile} />
                        )}
                      </KeepAliveView>

                      {/* 17. Auditoría */}
                      <KeepAliveView viewId="auditlogs" activeView={activeView}>
                        {navItems.some(i => i.id === 'auditlogs') && <AuditLogs logs={auditLogs} />}
                      </KeepAliveView>

                      {/* 18. Usuarios */}
                      <KeepAliveView viewId="users" activeView={activeView}>
                        {navItems.some(i => i.id === 'users') && <UserManagement navPermissions={navPermissions} />}
                      </KeepAliveView>

                      {/* 19. Equipo Reclutamiento */}
                      <KeepAliveView viewId="equipo_reclutamiento" activeView={activeView}>
                        {navItems.some(i => i.id === 'equipo_reclutamiento') && <EquipoReclutamiento />}
                      </KeepAliveView>

                      {/* 20. Equipo Formación */}
                      <KeepAliveView viewId="equipo_formacion" activeView={activeView}>
                        {navItems.some(i => i.id === 'equipo_formacion') && <EquipoFormacion />}
                      </KeepAliveView>

                      {/* 21. Asignación Formador */}
                      <KeepAliveView viewId="asignacion_formador" activeView={activeView}>
                        {navItems.some(i => i.id === 'asignacion_formador') && (
                          <AsignacionFormador grupos={grupos} formadores={formadores} onRefresh={loadAllData} />
                        )}
                      </KeepAliveView>

                      {/* 22. Configuración */}
                      <KeepAliveView viewId="config" activeView={activeView}>
                        {navItems.some(i => i.id === 'config') && <MotivosBajaAdmin motivosBaja={motivosBaja} onRefresh={loadAllData} />}
                      </KeepAliveView>

                      {/* 23. Legacy Dashboards */}
                      <KeepAliveView viewId="legacy_dashboards" activeView={activeView}>
                        {navItems.some(i => i.id === 'legacy_dashboards') && (
                          <LegacyDashboards currentRole={currentRole} />
                        )}
                      </KeepAliveView>

                      {/* 24. Gestor Dashboards */}
                      <KeepAliveView viewId="dashboards_admin" activeView={activeView}>
                        {navItems.some(i => i.id === 'dashboards_admin') && (
                          <DashboardsAdmin />
                        )}
                      </KeepAliveView>

                      {/* 25. Permisos de Roles */}
                      <KeepAliveView viewId="role_permissions" activeView={activeView}>
                        {navItems.some(i => i.id === 'role_permissions') && (
                          <RolePermissionsAdmin />
                        )}
                      </KeepAliveView>

                      {/* 26. Mi Perfil */}
                      {activeView === 'perfil' && (
                        <PerfilConfig
                          userProfile={effectiveProfile}
                          theme={theme}
                          setTheme={setTheme}
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
                    </Suspense>
                  )}
                </main>
              </div>

              <GlobalTaskBar />
              
              {/* Command Palette Global (Ctrl + K) con Scoping por Usuario y Rol */}
              <CommandPalette
                isOpen={isCommandPaletteOpen}
                onClose={() => setIsCommandPaletteOpen(false)}
                onSelectView={(viewId) => setActiveView(viewId)}
                postulantes={postulantes}
                grupos={grupos}
                userProfile={effectiveProfile}
                currentRole={currentRole}
                reclutadores={reclutadores}
                formadores={formadores}
                navItems={navItems}
                theme={theme}
                setTheme={setTheme}
              />
            </div>
          </TooltipProvider>
        </BackgroundTasksProvider>
      </ToastProvider>
    </ErrorBoundary>
  )
}