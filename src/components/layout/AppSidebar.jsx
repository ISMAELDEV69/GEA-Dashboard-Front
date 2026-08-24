import React, { useState, useEffect, useMemo, useTransition } from 'react'
import {
  LayoutDashboard,
  BarChart3,
  Activity,
  Layers,
  ClipboardCheck,
  UserPlus,
  Target,
  Users,
  GraduationCap,
  UserCheck,
  Shield,
  History,
  User,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronRight,
  LogOut,
  Sparkles,
  Zap,
  Radio
} from 'lucide-react'
import { Tooltip, TooltipTrigger, TooltipContent } from '../ui/tooltip'
import { Badge } from '../ui/badge'
import GeaLogo from '../GeaLogo'

// Estructura de navegación agrupada semánticamente
export const NAV_SECTIONS = [
  {
    title: 'Analítica & Reportes',
    items: [
      { id: 'resumen_capacitacion', label: 'Resumen Cap.', icon: BarChart3, description: 'KPIs y embudo de capacitación', badge: 'Live' },
      { id: 'consolidado', label: 'Control de Asistencia', icon: Activity, description: 'Power BI de metas vs real' },
      { id: 'descuentos_bi', label: 'Descuentos BI', icon: Layers, description: 'Análisis de procedencias' },
      { id: 'motivos_bajas_bi', label: 'Motivos de Bajas', icon: Activity, description: 'Pareto causal de deserción' },
      { id: 'attendancebi', label: 'Dispersión BI', icon: Activity, description: 'Métricas de retención diaria' },
      { id: 'dashboard', label: 'Dashboard General', icon: LayoutDashboard, description: 'Embudo de conversión y KPIs' },
      { id: 'reportedia1', label: 'Reporte Día 1', icon: Radio, description: 'Calibración inicial de grupos' },
    ]
  },
  {
    title: 'Operaciones',
    items: [
      { id: 'cartera_reclutador', label: 'Mi Cartera', icon: Users, description: 'Métricas, metas y postulantes' },
      { id: 'capacidad', label: 'Capacidad RYS', icon: Layers, description: 'Planificación de grupos y metas' },
      { id: 'asignacion_formador', label: 'Asignar Formador', icon: UserCheck, description: 'Distribución de formadores' },
      { id: 'asistencia', label: 'Marcación Asistencia', icon: ClipboardCheck, description: 'Registro diario A / F / B' },
      { id: 'nominas_completar', label: 'Nóminas', icon: ClipboardCheck, description: 'Validación y completar datos' },
      { id: 'nomina', label: 'Bolsa Postulantes', icon: UserPlus, description: 'Ingreso masivo y registro' },
      { id: 'propuestas', label: 'Propuestas', icon: ClipboardCheck, description: 'Formatos y acuerdos' },
      { id: 'descuentos_auth', label: 'Autorizar RYS', icon: Shield, description: 'Aprobación de descuentos' },
      { id: 'descuentos_form', label: 'Cargar Descuentos', icon: Layers, description: 'Ingreso de incidencias' },
    ]
  },
  {
    title: 'Administración',
    items: [
      { id: 'metas', label: 'Metas y Equipos', icon: Target, description: 'Objetivos de campañas' },
      { id: 'equipo_reclutamiento', label: 'Eq. Reclutamiento', icon: Users, description: 'Directorio de reclutadores' },
      { id: 'equipo_formacion', label: 'Equipo Formación', icon: GraduationCap, description: 'Directorio de formadores' },
      { id: 'users', label: 'Usuarios', icon: User, description: 'Cuentas y roles del sistema' },
      { id: 'role_permissions', label: 'Permisos de Roles', icon: Shield, description: 'Gestión de accesos y módulos' },
      { id: 'dashboards_admin', label: 'Gestor Dashboards', icon: BarChart3, description: 'Enlaces externos y embebidos' },
      { id: 'auditlogs', label: 'Auditoría', icon: History, description: 'Historial de modificaciones' },
    ]
  }
]

export default function AppSidebar({
  activeView,
  setActiveView,
  navItems = [],
  userProfile,
  onLogout,
  onOpenProfile
}) {
  const [, startTransition] = useTransition()

  const handleSelectView = (id) => {
    startTransition(() => {
      setActiveView(id)
    })
  }

  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem('gea-sidebar-collapsed') === 'true'
    } catch {
      return false
    }
  })

  const toggleCollapsed = () => {
    setCollapsed(prev => {
      const next = !prev
      localStorage.setItem('gea-sidebar-collapsed', String(next))
      return next
    })
  }

  // Filtrar ítems según los permisos del usuario activo
  const allowedItemIds = useMemo(() => new Set(navItems.map(i => i.id)), [navItems])

  const filteredSections = useMemo(() => {
    return NAV_SECTIONS.map(section => ({
      ...section,
      items: section.items.filter(item => allowedItemIds.has(item.id))
    })).filter(section => section.items.length > 0)
  }, [allowedItemIds])

  return (
    <aside
      className={`
        relative flex flex-col h-screen shrink-0 z-30
        bg-[var(--bg-surface)] border-r border-[var(--border-normal)]
        transition-all duration-300 ease-in-out
        ${collapsed ? 'w-16' : 'w-60'}
      `}
    >
      {/* ─────────────────────────────────────────────────────────────
          1. HEADER FIJO: LOGO GEA + TOGGLE BUTTON (h-14 = 56px exactos)
          ───────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between h-14 px-3.5 border-b border-[var(--border-subtle)] shrink-0">
        <GeaLogo collapsed={collapsed} />

        {/* Toggle Collapse Button */}
        <button
          onClick={toggleCollapsed}
          title={collapsed ? "Expandir menú (Ctrl+B)" : "Colapsar menú (Ctrl+B)"}
          className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-colors cursor-pointer shrink-0"
        >
          {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </button>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          2. NAVEGACIÓN AGRUPADA: CON SCROLL INTERNO INDEPENDIENTE
          ───────────────────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-2 space-y-4">
        {filteredSections.map((section, sIdx) => (
          <div key={sIdx} className="space-y-1">
            
            {/* Título de Categoría (Solo expandido o divisor fino colapsado) */}
            {!collapsed ? (
              <div className="px-2.5 py-1 text-[10px] font-bold tracking-wider uppercase text-[var(--text-muted)] opacity-70">
                {section.title}
              </div>
            ) : (
              sIdx > 0 && <div className="my-2 border-t border-[var(--border-subtle)] mx-2" />
            )}

            {/* Lista de Botones */}
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const isActive = activeView === item.id
                const Icon = item.icon

                // Botón interactivo base
                const buttonContent = (
                  <button
                    onClick={() => handleSelectView(item.id)}
                    className={`
                      w-full flex items-center rounded-xl font-medium text-xs
                      transition-all duration-200 cursor-pointer relative group
                      ${collapsed 
                        ? 'h-10 justify-center' 
                        : 'h-9 px-2.5 gap-2.5 text-left'
                      }
                      ${isActive
                        ? 'bg-[var(--accent)]/15 text-[var(--accent)] font-bold shadow-xs'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]'
                      }
                    `}
                  >
                    {/* Indicador de Barra Activa */}
                    {isActive && (
                      <span 
                        className={`
                          absolute bg-[var(--accent)] rounded-r-full
                          ${collapsed ? 'left-0 top-2 bottom-2 w-1' : 'left-0 top-1.5 bottom-1.5 w-1'}
                        `}
                      />
                    )}

                    {/* Ícono */}
                    <Icon 
                      className={`
                        shrink-0 transition-transform duration-200 group-hover:scale-105
                        ${collapsed ? 'h-4 w-4' : 'h-4 w-4'}
                        ${isActive ? 'text-[var(--accent)]' : 'text-[var(--text-muted)] group-hover:text-[var(--text-primary)]'}
                      `} 
                    />

                    {/* Etiqueta + Badge en modo expandido */}
                    {!collapsed && (
                      <div className="flex-1 flex items-center justify-between truncate">
                        <span className="truncate">{item.label}</span>
                        {item.badge && (
                          <Badge 
                            variant="outline" 
                            className="text-[9px] py-0 px-1 border-emerald-500/30 text-emerald-500 font-mono font-bold"
                          >
                            {item.badge}
                          </Badge>
                        )}
                      </div>
                    )}
                  </button>
                )

                // Si está colapsado, envolvemos con Tooltip lateral
                if (collapsed) {
                  return (
                    <Tooltip key={item.id}>
                      <TooltipTrigger asChild>
                        {buttonContent}
                      </TooltipTrigger>
                      <TooltipContent side="right" sideOffset={12} className="flex flex-col gap-0.5 z-50">
                        <span className="font-bold text-xs">{item.label}</span>
                        <span className="text-[10px] text-[var(--text-muted)]">{item.description}</span>
                      </TooltipContent>
                    </Tooltip>
                  )
                }

                return <div key={item.id}>{buttonContent}</div>
              })}
            </div>

          </div>
        ))}
      </div>

      {/* ─────────────────────────────────────────────────────────────
          3. FOOTER FIJO: PERFIL DE USUARIO + LOGOUT (h-14 = 56px exactos)
          ───────────────────────────────────────────────────────────── */}
      <div className="h-14 px-2 border-t border-[var(--border-subtle)] bg-[var(--bg-surface)] shrink-0 flex items-center justify-between">
        {!collapsed ? (
          <div className="flex items-center justify-between w-full px-1">
            <button
              onClick={onOpenProfile}
              className="flex items-center gap-2.5 truncate text-left hover:opacity-80 transition-opacity cursor-pointer group"
            >
              <div className="h-7 w-7 rounded-full bg-[var(--accent)]/20 text-[var(--accent)] flex items-center justify-center font-bold text-xs shrink-0">
                {(userProfile?.nombre || 'U')[0].toUpperCase()}
              </div>
              <div className="truncate">
                <p className="text-xs font-bold text-[var(--text-primary)] truncate leading-tight group-hover:text-[var(--accent)] transition-colors">
                  {userProfile?.nombre || 'Usuario'}
                </p>
                <p className="text-[10px] text-[var(--text-muted)] font-medium capitalize truncate">
                  {userProfile?.rol || 'Visor'}
                </p>
              </div>
            </button>
            <button
              onClick={onLogout}
              title="Cerrar sesión"
              className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-rose-500 hover:bg-rose-500/10 transition-colors cursor-pointer"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={onOpenProfile}
                className="mx-auto h-8 w-8 rounded-full bg-[var(--accent)]/20 text-[var(--accent)] flex items-center justify-center font-bold text-xs hover:ring-2 hover:ring-[var(--accent)]/40 transition-all cursor-pointer"
              >
                {(userProfile?.nombre || 'U')[0].toUpperCase()}
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={12}>
              <span className="font-bold text-xs">{userProfile?.nombre || 'Usuario'}</span>
              <span className="text-[10px] text-[var(--text-muted)] block capitalize">Rol: {userProfile?.rol || 'Visor'}</span>
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </aside>
  )
}
