import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { 
  Search, 
  Sun, 
  Moon, 
  Laptop, 
  Wifi, 
  WifiOff, 
  ChevronRight, 
  Command, 
  Bell, 
  User, 
  ShieldCheck, 
  Sparkles,
  RefreshCw,
  Eye,
  Check,
  CheckCheck,
  GraduationCap,
  Users,
  ExternalLink,
  X,
  AlertCircle
} from 'lucide-react'
import {
  fetchNotificaciones,
  marcarNotificacionLeida,
  marcarTodasNotificacionesLeidas
} from '../../lib/dataService'
import { supabase } from '../../lib/supabase'
import { Tooltip, TooltipTrigger, TooltipContent } from '../ui/tooltip'
import { Badge } from '../ui/badge'
import GeaLogo from '../GeaLogo'


const BREADCRUMB_MAP = {
  scorecard_individual: { section: 'Analítica & BI', label: 'KPIS - Reclutador / Formador' },
  resumen_capacitacion: { section: 'Analítica & BI', label: 'Resumen Capacitación' },
  cobertura_dotacion: { section: 'Analítica & BI', label: 'Cobertura de Dotación' },
  ubicacion: { section: 'Analítica & BI', label: 'Ubicación & Mapa de Movilidad' },
  consolidado: { section: 'Analítica & BI', label: 'Control de Asistencia' },
  descuentos_bi: { section: 'Analítica & BI', label: 'Descuentos BI' },
  motivos_bajas_bi: { section: 'Analítica & BI', label: 'Motivos de Bajas' },
  attendancebi: { section: 'Analítica & BI', label: 'Dispersión BI' },
  dashboard: { section: 'Analítica & BI', label: 'Dashboard General' },
  reportedia1: { section: 'Analítica & BI', label: 'Reporte Día 1' },
  capacidad: { section: 'Operaciones', label: 'Capacidad RYS' },
  asignacion_formador: { section: 'Operaciones', label: 'Asignar Formador' },
  asistencia: { section: 'Operaciones', label: 'Marcación de Asistencia' },
  cartera_reclutador: { section: 'Reclutamiento', label: 'Mi Cartera (Métricas & Requerimientos)' },
  nominas_completar: { section: 'Operaciones', label: 'Nóminas' },
  nomina: { section: 'Operaciones', label: 'Bolsa de Postulantes' },
  bolsa_capa: { section: 'Operaciones', label: 'Bolsa de Capa' },
  propuestas: { section: 'Operaciones', label: 'Propuestas' },
  pagos_capacitacion: { section: 'Operaciones', label: 'Pagos de Capacitación' },
  descuentos_auth: { section: 'Operaciones', label: 'Autorización RYS' },
  descuentos_form: { section: 'Operaciones', label: 'Cargar Descuentos' },
  metas: { section: 'Administración', label: 'Metas y Equipos' },
  equipo_reclutamiento: { section: 'Administración', label: 'Equipo Reclutamiento' },
  equipo_formacion: { section: 'Administración', label: 'Equipo Formación' },
  users: { section: 'Administración', label: 'Gestión de Usuarios' },
  role_permissions: { section: 'Administración', label: 'Permisos de Roles' },
  dashboards_admin: { section: 'Administración', label: 'Gestor Dashboards' },
  auditlogs: { section: 'Administración', label: 'Registro de Auditoría' },
  perfil: { section: 'Configuración', label: 'Mi Perfil' },
}

const VIEW_ROLE_MODES = [
  { id: 'admin', label: 'A', title: 'Administrador' },
  { id: 'reclutador', label: 'R', title: 'Reclutador' },
  { id: 'formador', label: 'F', title: 'Formador' },
  { id: 'visor', label: 'V', title: 'Directivo' },
  { id: 'supervisor_capacitacion', label: 'SC', title: 'Supervisor Capacitación' },
  { id: 'coordinador_rys', label: 'CR', title: 'Coordinador RYS' },
  { id: 'jefe_rys', label: 'JR', title: 'Jefe RYS' },
  { id: 'jefe_capacitacion', label: 'JC', title: 'Jefe Capacitación' },
  { id: 'calidad', label: 'Q', title: 'Calidad' },
]

export default function AppHeader({
  activeView,
  theme,
  setTheme,
  onOpenCommandPalette,
  onRefreshData,
  isRefreshing,
  userProfile,
  onOpenProfile,
  isOnline = true,
  realRole = 'admin',
  currentRole = 'admin',
  onSelectViewRole,
  onGoToPortal,
  onOpenOreoResumen,
  onNavigate
}) {
  const breadcrumb = BREADCRUMB_MAP[activeView] || { section: 'GEA DataCenter', label: 'Plataforma' }

  // ── GESTIÓN DE NOTIFICACIONES / ALERTAS DE APERTURA DE CAPA ──
  const [notificaciones, setNotificaciones] = useState([])
  const [isOpenNotifs, setIsOpenNotifs] = useState(false)
  const [loadingNotifs, setLoadingNotifs] = useState(false)
  const notifsRef = useRef(null)

  const unreadCount = useMemo(() => {
    return notificaciones.filter(n => !n.leido).length
  }, [notificaciones])

  const cargarNotificaciones = useCallback(async () => {
    try {
      setLoadingNotifs(true)
      const data = await fetchNotificaciones({ rol: currentRole || realRole || 'admin', limit: 35 })
      setNotificaciones(data || [])
    } catch (e) {
      console.warn('Error al cargar notificaciones en AppHeader:', e)
    } finally {
      setLoadingNotifs(false)
    }
  }, [currentRole, realRole])

  useEffect(() => {
    cargarNotificaciones()

    const handleLocalEvent = () => cargarNotificaciones()
    window.addEventListener('gea-notificacion-creada', handleLocalEvent)
    window.addEventListener('gea-notificaciones-actualizadas', handleLocalEvent)

    let channel = null
    try {
      if (supabase?.channel) {
        channel = supabase.channel('realtime_notificaciones_header')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'notificaciones' }, () => {
            cargarNotificaciones()
          })
          .subscribe()
      }
    } catch (err) {
      console.warn('Error suscribiendo realtime en AppHeader:', err)
    }

    return () => {
      window.removeEventListener('gea-notificacion-creada', handleLocalEvent)
      window.removeEventListener('gea-notificaciones-actualizadas', handleLocalEvent)
      if (channel) supabase.removeChannel(channel)
    }
  }, [cargarNotificaciones])

  // Cerrar panel al hacer click fuera
  useEffect(() => {
    function handleClickOutside(event) {
      if (notifsRef.current && !notifsRef.current.contains(event.target)) {
        setIsOpenNotifs(false)
      }
    }
    if (isOpenNotifs) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpenNotifs])

  const handleMarcarLeida = async (e, id) => {
    e.stopPropagation()
    await marcarNotificacionLeida(id)
    setNotificaciones(prev => prev.map(n => n.id === id ? { ...n, leido: true } : n))
  }

  const handleMarcarTodasLeidas = async () => {
    await marcarTodasNotificacionesLeidas(currentRole || realRole || 'admin')
    setNotificaciones(prev => prev.map(n => ({ ...n, leido: true })))
  }

  const handleAccionNotif = async (n) => {
    if (!n.leido) {
      await marcarNotificacionLeida(n.id)
      setNotificaciones(prev => prev.map(item => item.id === n.id ? { ...item, leido: true } : item))
    }
    setIsOpenNotifs(false)
    const target = n.datos?.target_view || 'bolsa_capa'
    if (onNavigate) {
      onNavigate(target)
    }
  }

  const formatTimeAgo = (dateString) => {
    if (!dateString) return ''
    const date = new Date(dateString)
    const now = new Date()
    const diffSec = Math.floor((now - date) / 1000)
    if (diffSec < 60) return 'Ahora'
    const diffMin = Math.floor(diffSec / 60)
    if (diffMin < 60) return `Hace ${diffMin}m`
    const diffHours = Math.floor(diffMin / 60)
    if (diffHours < 24) return `Hace ${diffHours}h`
    const diffDays = Math.floor(diffHours / 24)
    if (diffDays === 1) return 'Ayer'
    if (diffDays < 7) return `Hace ${diffDays}d`
    return date.toLocaleDateString('es-PE', { day: '2-digit', month: 'short' })
  }


  return (
    <header className="h-14 bg-[var(--bg-surface)] border-b border-[var(--border-normal)] px-4 flex items-center justify-between shrink-0 z-20">
      
      {/* ─────────────────────────────────────────────────────────────
          1. BREADCRUMBS DINÁMICOS
          ───────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 text-xs">
        {onGoToPortal && (
          <>
            <button
              type="button"
              onClick={onGoToPortal}
              className="text-[var(--text-muted)] hover:text-cyan-400 font-medium transition-colors cursor-pointer flex items-center gap-1"
              title="Ir al Portal de Módulos (Inicio)"
            >
              Inicio
            </button>
            <ChevronRight className="h-3.5 w-3.5 text-[var(--text-muted)] opacity-60" />
          </>
        )}
        <span className="text-[var(--text-muted)] font-medium">
          {breadcrumb.section}
        </span>
        <ChevronRight className="h-3.5 w-3.5 text-[var(--text-muted)] opacity-60" />
        <span className="text-[var(--text-primary)] font-bold tracking-tight">
          {breadcrumb.label}
        </span>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          2. LOGO GEA CON PIXEL-DISSOLVE (donde estaba el pingüino)
          ───────────────────────────────────────────────────────────── */}
      <div className="hidden md:flex items-center justify-center">
        <div
          onClick={() => onGoToPortal && onGoToPortal()}
          title="GEA PERÚ – Workforce Management"
          className="cursor-pointer hover:scale-105 transition-transform duration-200"
        >
          <GeaLogo
            size="medium"
            showTagline={true}
            showSubtitle={true}
          />
        </div>
      </div>


      {/* ─────────────────────────────────────────────────────────────
          3. ACCIONES: RESUMEN OREO + VISTA ROLES + TEMA + REFRESH + PERFIL
          ───────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2">
        
        {/* Identificación de Usuario y Rol (Estilo GEA ATC) */}
        {userProfile && (
          <div className="hidden lg:flex items-center gap-2 pr-2 border-r border-[var(--border-subtle)] text-xs">
            <span className="font-bold tracking-wide text-[var(--text-primary)]">
              {(userProfile.nombre || 'USUARIO').toUpperCase()}
            </span>
            <span className="px-2 py-0.5 rounded-md bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 font-black text-[10px] tracking-wider uppercase">
              {currentRole}
            </span>
          </div>
        )}

        {/* Botón Resumen GEITO (Asistente Ejecutivo GEA) */}
        {onOpenOreoResumen && (
          <button
            onClick={onOpenOreoResumen}
            title="Abrir Resumen Diario GEITO con KPIs 3D"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/15 border border-amber-500/40 text-amber-300 hover:text-white hover:bg-amber-500/25 hover:border-amber-400 transition-all cursor-pointer text-xs font-bold shadow-[0_0_12px_rgba(245,158,11,0.25)] group"
          >
            <span className="text-sm">🦁</span>
            <span>Resumen</span>
          </button>
        )}

        {/* Modos de Vista por Rol (Simulación para Administrador) */}
        {realRole === 'admin' && onSelectViewRole && (
          <div className="flex items-center gap-1 px-2 py-1 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-normal)] text-xs select-none shadow-2xs">
            <div className="flex items-center gap-1 pr-1.5 border-r border-[var(--border-subtle)] text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)]">
              <Eye size={12} className="opacity-70" />
              <span className="hidden xl:inline">VISTA</span>
            </div>
            <div className="flex items-center gap-0.5">
              {VIEW_ROLE_MODES.map(mode => {
                const isActive = currentRole === mode.id
                return (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => onSelectViewRole(mode.id)}
                    title={`Ver interfaz como: ${mode.title}`}
                    className={`px-2 py-0.5 text-[11px] font-black rounded-lg transition-all cursor-pointer ${
                      isActive
                        ? 'bg-cyan-500 text-slate-950 shadow-[0_0_10px_rgba(0,245,255,0.4)] font-black'
                        : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)]'
                    }`}
                  >
                    {mode.label}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Botón Refrescar Datos */}
        {onRefreshData && (
          <button
            onClick={onRefreshData}
            disabled={isRefreshing}
            title="Recargar datos de Supabase manualmente"
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-normal)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-[var(--border-strong)] transition-all cursor-pointer disabled:opacity-50 text-xs font-semibold shadow-2xs group"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin text-cyan-400' : 'group-hover:text-cyan-400 transition-colors'}`} />
            <span className="hidden sm:inline">Refrescar</span>
          </button>
        )}

        {/* Campana de Notificaciones & Alertas para Administradores / Supervisores */}
        <div className="relative" ref={notifsRef}>
          <button
            type="button"
            onClick={() => setIsOpenNotifs(!isOpenNotifs)}
            title="Alertas de apertura de grupos en Bolsa de Capa"
            className={`relative p-2 rounded-xl transition-all cursor-pointer flex items-center justify-center ${
              isOpenNotifs || unreadCount > 0
                ? 'bg-amber-500/15 border border-amber-500/40 text-amber-300 shadow-[0_0_12px_rgba(245,158,11,0.25)]'
                : 'bg-[var(--bg-elevated)] border border-[var(--border-normal)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-[var(--border-strong)]'
            }`}
          >
            <Bell className={`h-4 w-4 ${unreadCount > 0 ? 'text-amber-400 animate-pulse' : ''}`} />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] px-1 items-center justify-center rounded-full bg-rose-500 text-[10px] font-black text-white shadow-[0_0_8px_rgba(244,63,94,0.6)]">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>

          {/* Panel Dropdown de Alertas */}
          {isOpenNotifs && (
            <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 max-w-[92vw] bg-[var(--bg-surface)] border border-[var(--border-normal)] rounded-2xl shadow-2xl z-50 overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150">
              {/* Encabezado */}
              <div className="p-3 bg-[var(--bg-elevated)] border-b border-[var(--border-subtle)] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-amber-500/15 text-amber-400">
                    <Bell size={14} />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-[var(--text-primary)] leading-tight">
                      Alertas de Capacitación
                    </h4>
                    <p className="text-[10px] text-[var(--text-muted)]">
                      {unreadCount} {unreadCount === 1 ? 'pendiente de validación' : 'pendientes de validación'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  {unreadCount > 0 && (
                    <button
                      type="button"
                      onClick={handleMarcarTodasLeidas}
                      title="Marcar todas como leídas"
                      className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold text-cyan-400 hover:bg-cyan-500/10 transition-colors cursor-pointer"
                    >
                      <CheckCheck size={12} />
                      <span className="hidden sm:inline">Marcar todo</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setIsOpenNotifs(false)}
                    className="p-1 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)] transition-colors cursor-pointer"
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>

              {/* Lista de Alertas */}
              <div className="max-h-[380px] overflow-y-auto divide-y divide-[var(--border-subtle)]/60">
                {loadingNotifs && notificaciones.length === 0 ? (
                  <div className="p-8 text-center text-xs text-[var(--text-muted)]">
                    Cargando alertas...
                  </div>
                ) : notificaciones.length === 0 ? (
                  <div className="p-8 text-center">
                    <div className="inline-flex p-3 rounded-2xl bg-[var(--bg-elevated)] text-[var(--text-muted)] mb-2">
                      <Bell size={20} className="opacity-40" />
                    </div>
                    <p className="text-xs font-semibold text-[var(--text-primary)]">Sin alertas pendientes</p>
                    <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                      Cuando los usuarios de Capacitación creen grupos en Bolsa de Capa, recibirás la alerta automática aquí.
                    </p>
                  </div>
                ) : (
                  notificaciones.map((n) => {
                    const isApertura = n.tipo === 'apertura_grupo_capa'
                    const isNomina = n.tipo === 'carga_nomina_capa'
                    return (
                      <div
                        key={n.id}
                        onClick={() => handleAccionNotif(n)}
                        className={`p-3 transition-colors cursor-pointer relative group ${
                          !n.leido
                            ? 'bg-amber-500/[0.05] hover:bg-amber-500/[0.09]'
                            : 'hover:bg-[var(--bg-elevated)]/60 opacity-80 hover:opacity-100'
                        }`}
                      >
                        {/* Indicador no leído */}
                        {!n.leido && (
                          <div className="absolute left-0 top-0 bottom-0 w-1 bg-amber-400" />
                        )}

                        <div className="flex items-start gap-2.5">
                          {/* Icono por tipo */}
                          <div className={`p-1.5 rounded-lg shrink-0 mt-0.5 ${
                            isApertura
                              ? 'bg-amber-500/20 text-amber-300'
                              : isNomina
                                ? 'bg-cyan-500/20 text-cyan-300'
                                : 'bg-slate-500/20 text-slate-300'
                          }`}>
                            {isApertura ? <GraduationCap size={14} /> : isNomina ? <Users size={14} /> : <AlertCircle size={14} />}
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-1">
                              <span className={`text-[10px] font-black uppercase tracking-wider ${
                                isApertura ? 'text-amber-400' : isNomina ? 'text-cyan-400' : 'text-[var(--text-muted)]'
                              }`}>
                                {isApertura ? 'Apertura de Grupo' : isNomina ? 'Carga Nómina' : 'Notificación'}
                              </span>
                              <span className="text-[10px] text-[var(--text-muted)]">
                                {formatTimeAgo(n.created_at)}
                              </span>
                            </div>

                            <h5 className="text-xs font-bold text-[var(--text-primary)] mt-0.5 leading-snug">
                              {n.titulo}
                            </h5>

                            <p className="text-[11px] text-[var(--text-muted)] mt-1 line-clamp-2 leading-relaxed">
                              {n.mensaje}
                            </p>

                            {/* Tags de detalle */}
                            {n.datos && (n.datos.codigo || n.datos.campana) && (
                              <div className="flex flex-wrap gap-1 mt-2">
                                {n.datos.codigo && (
                                  <span className="px-1.5 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/25 text-amber-300 font-bold text-[10px]">
                                    {n.datos.codigo}
                                  </span>
                                )}
                                {n.datos.campana && (
                                  <span className="px-1.5 py-0.5 rounded-md bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-muted)] text-[10px]">
                                    {n.datos.campana}
                                  </span>
                                )}
                                {n.datos.usuario && (
                                  <span className="px-1.5 py-0.5 rounded-md bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-muted)] text-[10px]">
                                    Por: {n.datos.usuario}
                                  </span>
                                )}
                              </div>
                            )}

                            {/* Botón de acción directo para validar */}
                            <div className="mt-2.5 flex items-center justify-between">
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-cyan-400 group-hover:underline">
                                Validar en Bolsa de Capa
                                <ExternalLink size={11} />
                              </span>

                              {!n.leido && (
                                <button
                                  type="button"
                                  onClick={(e) => handleMarcarLeida(e, n.id)}
                                  title="Marcar como leída"
                                  className="p-1 rounded text-[var(--text-muted)] hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors"
                                >
                                  <Check size={12} />
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          )}
        </div>

        {/* Selector de Tema Rápido */}
        <div className="flex items-center p-0.5 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
          {[
            { id: 'dark', icon: Moon, title: 'Oscuro' },
            { id: 'comfortable', icon: Laptop, title: 'Cómodo' },
            { id: 'light', icon: Sun, title: 'Claro' }
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setTheme(t.id)}
              title={`Modo ${t.title}`}
              className={`
                p-1 rounded-md transition-all cursor-pointer
                ${theme === t.id 
                  ? 'bg-[var(--bg-surface)] text-[var(--accent)] shadow-xs font-bold' 
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }
              `}
            >
              <t.icon className="h-3.5 w-3.5" />
            </button>
          ))}
        </div>

        {/* Perfil Trigger */}
        <button
          onClick={onOpenProfile}
          className="flex items-center gap-2 pl-1 hover:opacity-80 transition-opacity cursor-pointer"
        >
          <div className="h-7 w-7 rounded-full bg-[var(--accent)]/15 border border-[var(--accent)]/30 text-[var(--accent)] flex items-center justify-center font-black text-xs">
            {(userProfile?.nombre || 'U')[0].toUpperCase()}
          </div>
        </button>

      </div>

    </header>
  )
}
