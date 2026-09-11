import React, { useState, useEffect } from 'react'
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
  Eye
} from 'lucide-react'
import { Tooltip, TooltipTrigger, TooltipContent } from '../ui/tooltip'
import { Badge } from '../ui/badge'

const BREADCRUMB_MAP = {
  scorecard_individual: { section: 'Analítica & BI', label: 'KPIS - Reclutador / Formador' },
  resumen_capacitacion: { section: 'Analítica & BI', label: 'Resumen Capacitación' },
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
  onGoToPortal
}) {
  const breadcrumb = BREADCRUMB_MAP[activeView] || { section: 'GEA DataCenter', label: 'Plataforma' }

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
          2. COMMAND BAR (Buscador central con atajo Ctrl+K)
          ───────────────────────────────────────────────────────────── */}
      <button
        onClick={onOpenCommandPalette}
        className="hidden md:flex items-center gap-2.5 h-8.5 px-3 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-normal)] text-[var(--text-muted)] hover:border-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all cursor-pointer w-64 lg:w-80 shadow-2xs group"
      >
        <Search className="h-3.5 w-3.5 text-[var(--text-muted)] group-hover:text-[var(--accent)] transition-colors" />
        <span className="text-xs font-normal truncate flex-1 text-left">
          Buscar por DNI, nombre, grupo, campaña...
        </span>
        <kbd className="inline-flex items-center gap-0.5 rounded border border-[var(--border-normal)] bg-[var(--bg-surface)] px-1.5 py-0.5 text-[9px] font-mono font-bold text-[var(--text-muted)]">
          <Command className="h-2.5 w-2.5" /> K
        </kbd>
      </button>

      {/* ─────────────────────────────────────────────────────────────
          3. ACCIONES: VISTA ROLES + TEMA + REFRESH + PERFIL
          ───────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2.5">
        
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
