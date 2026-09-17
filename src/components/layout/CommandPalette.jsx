import React, { useState, useEffect, useRef, useMemo } from 'react'
import {
  Search,
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
  Radio,
  Sparkles,
  ArrowRight,
  Sun,
  Moon,
  Zap,
  X,
  Building2,
  Phone,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Copy,
  Check,
  Lock,
  UserCheck2
} from 'lucide-react'
import { fetchPostulantes, fetchPostulantesReclutador } from '../../lib/dataService'
import { filterPostulantesReclutador, filterGruposFormador, resolveFormadorDocumento, resolveReclutadorId } from '../../lib/flujoOperativo'

const QUICK_COMMANDS = [
  { id: 'resumen_capacitacion', title: 'Resumen Capacitación (Looker Studio)', section: 'Analítica & BI', icon: BarChart3 },
  { id: 'cobertura_dotacion', title: 'Cobertura de Dotación (WFM Gerencial)', section: 'Analítica & BI', icon: Target },
  { id: 'reportedia1', title: 'Reporte de Calibración — Día 1', section: 'Analítica & BI', icon: Target },
  { id: 'consolidado', title: 'Control de Asistencia (Power BI)', section: 'Analítica & BI', icon: LayoutDashboard },
  { id: 'attendancebi', title: 'Dispersión BI (Métricas y Retención)', section: 'Analítica & BI', icon: Activity },
  { id: 'descuentos_bi', title: 'Descuentos y Auditoría BI', section: 'Analítica & BI', icon: Layers },
  { id: 'asistencia', title: 'Control y Marcación de Asistencia', section: 'Operaciones', icon: ClipboardCheck },
  { id: 'cartera_reclutador', title: 'Mi Cartera de Postulantes & Reclutamiento', section: 'Reclutamiento', icon: Target },
  { id: 'nomina', title: 'Bolsa General de Postulantes', section: 'Operaciones', icon: UserPlus },
  { id: 'nominas_completar', title: 'Completar Nóminas Operativas', section: 'Operaciones', icon: Users },
  { id: 'asignacion_formador', title: 'Asignar Formador a Grupo', section: 'Operaciones', icon: GraduationCap },
  { id: 'capacidad', title: 'Capacidad y Dimensionamiento RYS', section: 'Operaciones', icon: UserCheck },
  { id: 'descuentos_auth', title: 'Autorización RYS de Descuentos', section: 'Operaciones', icon: Shield },
  { id: 'descuentos_form', title: 'Cargar Descuentos de Asistencia', section: 'Operaciones', icon: Layers },
  { id: 'users', title: 'Gestión de Usuarios y Roles', section: 'Administración', icon: Users },
  { id: 'auditlogs', title: 'Registro de Auditoría del Sistema', section: 'Administración', icon: History },
  { id: 'perfil', title: 'Mi Perfil de Usuario', section: 'Configuración', icon: User },
]

export default function CommandPalette({
  isOpen,
  onClose,
  onSelectView,
  postulantes = [],
  grupos = [],
  userProfile = null,
  currentRole = 'admin',
  reclutadores = [],
  formadores = [],
  navItems = [],
  theme,
  setTheme
}) {
  const [query, setQuery] = useState('')
  const [activeTab, setActiveTab] = useState('all') // 'all' | 'candidates' | 'views'
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [internalCandidates, setInternalCandidates] = useState([])
  const [copiedDoc, setCopiedDoc] = useState(null)
  const inputRef = useRef(null)

  const role = (currentRole || userProfile?.rol || 'visor').toLowerCase()

  // Fetch candidates if prop is empty
  useEffect(() => {
    if (postulantes && postulantes.length > 0) {
      setInternalCandidates(postulantes)
    } else {
      // If recruiter, fetch server-side filtered for accuracy
      const recId = resolveReclutadorId(userProfile, reclutadores)
      if (role === 'reclutador' && recId) {
        fetchPostulantesReclutador(recId, userProfile?.nombre_completo || userProfile?.nombre).then(data => {
          if (Array.isArray(data)) setInternalCandidates(data)
        }).catch(err => console.error('Error loading recruiter candidates for CommandPalette:', err))
      } else {
        fetchPostulantes({ limit: 5000 }).then(data => {
          if (Array.isArray(data)) setInternalCandidates(data)
        }).catch(err => console.error('Error loading candidates for CommandPalette:', err))
      }
    }
  }, [postulantes, role, userProfile, reclutadores])

  useEffect(() => {
    if (isOpen) {
      setQuery('')
      setActiveTab('all')
      setSelectedIndex(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [isOpen])

  // 1. Filter Commands strictly by role permissions
  const authorizedCommands = useMemo(() => {
    if (!navItems || navItems.length === 0) return QUICK_COMMANDS
    const authorizedIds = new Set(navItems.map(i => i.id))
    return QUICK_COMMANDS.filter(cmd => authorizedIds.has(cmd.id) || cmd.id === 'perfil')
  }, [navItems])

  const filteredCommands = useMemo(() => {
    if (!query.trim()) return authorizedCommands
    const q = query.toLowerCase()
    return authorizedCommands.filter(cmd =>
      cmd.title.toLowerCase().includes(q) ||
      cmd.section.toLowerCase().includes(q) ||
      cmd.id.toLowerCase().includes(q)
    )
  }, [query, authorizedCommands])

  // 2. Strict User and Role Scoping for Candidates
  const userScopedCandidates = useMemo(() => {
    if (!internalCandidates || internalCandidates.length === 0) return []

    // ─────────────────────────────────────────────
    // RECLUTADOR: Only candidates assigned to them
    // ─────────────────────────────────────────────
    if (role === 'reclutador') {
      return filterPostulantesReclutador(internalCandidates, userProfile, reclutadores)
    }

    // ─────────────────────────────────────────────
    // FORMADOR: Only candidates in their batches/groups
    // ─────────────────────────────────────────────
    if (role === 'formador') {
      const myGrupos = filterGruposFormador(grupos, userProfile, formadores)
      const myGroupCodes = new Set(
        myGrupos.map(g => String(g.grupo_codigo || g.codigo_grupo || g.codigo || '').toUpperCase().trim()).filter(Boolean)
      )
      const formadorDoc = resolveFormadorDocumento(userProfile, formadores)
      const formadorNom = (userProfile?.nombre_completo || userProfile?.nombre || '').toLowerCase().trim()

      return internalCandidates.filter(p => {
        const gCode = String(p.grupo_codigo || p.grupo || '').toUpperCase().trim()
        if (gCode && myGroupCodes.has(gCode)) return true
        if (formadorDoc && String(p.formador_documento || '').trim() === formadorDoc) return true
        if (formadorNom && p.formador_nombre && String(p.formador_nombre).toLowerCase().includes(formadorNom)) return true
        return false
      })
    }

    // ─────────────────────────────────────────────
    // SUPERVISOR / COORDINADOR CON CAMPAÑAS ASIGNADAS
    // ─────────────────────────────────────────────
    if (userProfile?.campanas_asignadas && Array.isArray(userProfile.campanas_asignadas) && userProfile.campanas_asignadas.length > 0) {
      const assignedSet = new Set(userProfile.campanas_asignadas.map(c => String(c).toUpperCase().trim()))
      return internalCandidates.filter(p => {
        const c = String(p.campana || p.campaign || '').toUpperCase().trim()
        return assignedSet.has(c)
      })
    }

    // ─────────────────────────────────────────────
    // ADMIN / VISOR / COORDINACIÓN GENERAL: Acceso Total
    // ─────────────────────────────────────────────
    return internalCandidates
  }, [internalCandidates, userProfile, role, reclutadores, formadores, grupos])

  // Filter candidates by DNI, full name, campaign, group, or phone
  const filteredCandidates = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []

    return userScopedCandidates.filter(p => {
      const doc = String(p.documento || '').toLowerCase()
      const nom = `${p.nombres || ''} ${p.apellido_paterno || ''} ${p.apellido_materno || ''}`.toLowerCase()
      const camp = String(p.campana || p.campaign || '').toLowerCase()
      const grp = String(p.grupo_codigo || p.grupo || '').toLowerCase()
      const tel = String(p.celular || p.telefono || '').toLowerCase()
      
      return doc.includes(q) || nom.includes(q) || camp.includes(q) || grp.includes(q) || tel.includes(q)
    }).slice(0, 20) // Limit to top 20 for instant speed
  }, [query, userScopedCandidates])

  // Unified items list based on active tab for keyboard navigation
  const unifiedItems = useMemo(() => {
    if (activeTab === 'candidates') {
      return filteredCandidates.map(c => ({ type: 'candidate', data: c }))
    }
    if (activeTab === 'views') {
      return filteredCommands.map(cmd => ({ type: 'command', data: cmd }))
    }
    // 'all'
    const list = []
    filteredCandidates.forEach(c => list.push({ type: 'candidate', data: c }))
    filteredCommands.forEach(cmd => list.push({ type: 'command', data: cmd }))
    return list
  }, [activeTab, filteredCandidates, filteredCommands])

  const handleSelectCandidate = (candidate, targetView = 'asistencia') => {
    if (candidate.grupo_codigo || candidate.grupo) {
      localStorage.setItem('wfm_asis_grupo', candidate.grupo_codigo || candidate.grupo)
    }
    if (candidate.campana || candidate.campaign) {
      localStorage.setItem('wfm_asis_campana', candidate.campana || candidate.campaign)
    }
    if (candidate.periodo) {
      localStorage.setItem('wfm_asis_periodo', candidate.periodo)
    }
    // If recruiter, prefer opening their portfolio
    const destination = role === 'reclutador' ? 'cartera_reclutador' : targetView
    onSelectView(destination)
    onClose()
  }

  const handleCopyDoc = (e, doc) => {
    e.stopPropagation()
    navigator.clipboard.writeText(doc)
    setCopiedDoc(doc)
    setTimeout(() => setCopiedDoc(null), 2000)
  }

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!isOpen) return

      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex(prev => (prev + 1) % (unifiedItems.length || 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex(prev => (prev - 1 + unifiedItems.length) % (unifiedItems.length || 1))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        const selected = unifiedItems[selectedIndex]
        if (selected) {
          if (selected.type === 'command') {
            onSelectView(selected.data.id)
            onClose()
          } else if (selected.type === 'candidate') {
            handleSelectCandidate(selected.data, 'asistencia')
          }
        }
      } else if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, selectedIndex, unifiedItems, onSelectView, onClose])

  if (!isOpen) return null

  const hasQuery = query.trim().length > 0

  return (
    <div 
      onClick={onClose}
      className="fixed inset-0 z-[9999] flex items-start justify-center pt-16 sm:pt-24 px-3 sm:px-4 bg-black/70 backdrop-blur-sm animate-in fade-in-0 duration-150 select-none"
    >
      
      {/* Modal Container */}
      <div 
        onClick={e => e.stopPropagation()}
        className="relative w-full max-w-2xl rounded-3xl bg-[var(--bg-surface)] border border-[var(--border-normal)] shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-150"
      >
        {/* Search Header */}
        <div className="flex items-center px-4 py-3 border-b border-[var(--border-subtle)] gap-3 bg-[var(--bg-elevated)]/50">
          <Search className="h-4 w-4 text-[var(--accent)] shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => {
              setQuery(e.target.value)
              setSelectedIndex(0)
            }}
            placeholder={`Buscar por DNI, Nombre, Campaña, Grupo... (${role === 'reclutador' ? 'Mi Cartera' : role === 'formador' ? 'Mis Grupos' : 'Global'})`}
            className="flex-1 bg-transparent text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] outline-none font-medium"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="p-1 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              <X size={14} />
            </button>
          )}
          <span className="px-1.5 py-0.5 rounded-md text-[10px] font-mono font-bold bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-muted)]">
            ESC
          </span>
        </div>

        {/* User Scope Indicator Bar */}
        <div className="flex items-center justify-between px-4 py-1.5 bg-[var(--bg-surface)] border-b border-[var(--border-subtle)] text-[10px]">
          <div className="flex items-center gap-1.5 text-[var(--text-muted)] font-semibold">
            <Lock size={10} className="text-cyan-500" />
            <span>Alcance:</span>
            <span className="text-[var(--text-primary)] font-bold uppercase tracking-wider">
              {role === 'reclutador' && '👤 Solo mis postulantes asignados'}
              {role === 'formador' && '🎓 Solo mis grupos de capacitación'}
              {role === 'admin' && '👑 Administrador (Acceso Global)'}
              {role === 'visor' && '👁️ Visualización General'}
              {!['reclutador', 'formador', 'admin', 'visor'].includes(role) && `🛡️ ${role.toUpperCase()}`}
            </span>
          </div>

          <span className="text-[10px] text-[var(--text-muted)] font-mono">
            {userScopedCandidates.length} registros disponibles
          </span>
        </div>

        {/* Tab Filters (Visible when searching) */}
        {hasQuery && (
          <div className="flex items-center gap-1.5 px-3.5 py-1.5 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] overflow-x-auto text-[11px] font-bold">
            <button
              onClick={() => { setActiveTab('all'); setSelectedIndex(0); }}
              className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                activeTab === 'all' 
                  ? 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 border border-cyan-500/30' 
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              Todos ({filteredCandidates.length + filteredCommands.length})
            </button>
            <button
              onClick={() => { setActiveTab('candidates'); setSelectedIndex(0); }}
              className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'candidates' 
                  ? 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 border border-cyan-500/30' 
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              <Users size={12} />
              Candidatos ({filteredCandidates.length})
            </button>
            <button
              onClick={() => { setActiveTab('views'); setSelectedIndex(0); }}
              className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'views' 
                  ? 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 border border-cyan-500/30' 
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              <LayoutDashboard size={12} />
              Vistas ({filteredCommands.length})
            </button>
          </div>
        )}

        {/* Results List */}
        <div className="max-h-[380px] overflow-y-auto custom-scrollbar p-2 space-y-1.5">
          {unifiedItems.length === 0 ? (
            <div className="py-12 text-center text-xs text-[var(--text-muted)] font-semibold flex flex-col items-center gap-2">
              <Search size={28} className="opacity-30" />
              <span>No se encontraron registros autorizados para "<strong>{query}</strong>"</span>
              <span className="text-[11px] opacity-70">
                {role === 'reclutador' 
                  ? 'Solo puedes consultar postulantes asignados a tu cartera de reclutamiento.' 
                  : role === 'formador'
                  ? 'Solo puedes consultar postulantes de tus grupos de capacitación.'
                  : 'Verifica los términos de búsqueda ingresados.'}
              </span>
            </div>
          ) : (
            <>
              {/* CANDIDATES GROUP */}
              {filteredCandidates.length > 0 && (activeTab === 'all' || activeTab === 'candidates') && (
                <div className="space-y-1">
                  <div className="px-2 py-1 text-[9px] font-black uppercase tracking-widest text-[var(--accent)] flex items-center justify-between">
                    <span>👥 Postulantes de tu cartera ({filteredCandidates.length})</span>
                    <span className="text-[8px] text-[var(--text-muted)] font-normal lowercase">enter para abrir</span>
                  </div>

                  {filteredCandidates.map((c, idx) => {
                    const itemIndex = idx
                    const isSelected = itemIndex === selectedIndex
                    const nombreCompleto = `${c.nombres || ''} ${c.apellido_paterno || ''} ${c.apellido_materno || ''}`.trim() || 'Sin Nombre'
                    const estadoTxt = String(c.estado || 'ACTIVO').toUpperCase()
                    const isCesado = estadoTxt.includes('CESADO') || estadoTxt.includes('BAJA')

                    return (
                      <div
                        key={`cand_${c.id || c.documento}_${idx}`}
                        onClick={() => handleSelectCandidate(c, 'asistencia')}
                        onMouseEnter={() => setSelectedIndex(itemIndex)}
                        className={`
                          w-full flex items-center justify-between p-2.5 rounded-2xl text-left transition-all cursor-pointer group border
                          ${isSelected 
                            ? 'bg-[var(--accent)]/12 border-[var(--accent)]/40 shadow-xs' 
                            : 'hover:bg-[var(--bg-elevated)] bg-[var(--bg-surface)] border-[var(--border-subtle)]'
                          }
                        `}
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          {/* DNI Mono Badge */}
                          <div 
                            onClick={(e) => handleCopyDoc(e, c.documento)}
                            className="flex items-center gap-1 px-2 py-1 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-normal)] text-[var(--text-primary)] font-mono font-bold text-xs shrink-0 hover:border-cyan-500 transition-colors"
                            title="Click para copiar DNI"
                          >
                            <span>{c.documento}</span>
                            {copiedDoc === c.documento ? (
                              <Check size={11} className="text-emerald-400" />
                            ) : (
                              <Copy size={11} className="opacity-40 group-hover:opacity-100 transition-opacity" />
                            )}
                          </div>

                          {/* Details */}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <p className="text-xs font-black text-[var(--text-primary)] truncate">
                                {nombreCompleto}
                              </p>
                              <span className={`px-1.5 py-0.2 rounded text-[8px] font-black uppercase tracking-wider shrink-0 border ${
                                isCesado 
                                  ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30' 
                                  : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                              }`}>
                                {estadoTxt}
                              </span>
                            </div>

                            {/* Campaign & Group Metadata Chips */}
                            <div className="flex flex-wrap items-center gap-1.5 mt-0.5 text-[10px]">
                              {c.campana && (
                                <span className="text-[var(--text-secondary)] font-bold flex items-center gap-1">
                                  <Radio size={9} className="text-purple-400 shrink-0" />
                                  <span className="truncate max-w-[130px]">{c.campana}</span>
                                </span>
                              )}
                              {(c.grupo_codigo || c.grupo) && (
                                <span className="text-[var(--text-secondary)] font-bold flex items-center gap-1 font-mono">
                                  <Building2 size={9} className="text-blue-400 shrink-0" />
                                  <span className="truncate">{c.grupo_codigo || c.grupo}</span>
                                </span>
                              )}
                              {c.celular && (
                                <span className="text-[var(--text-muted)] font-mono flex items-center gap-0.5 hidden sm:inline-flex">
                                  <Phone size={9} /> {c.celular}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Quick View Actions */}
                        <div className="flex items-center gap-1.5 shrink-0 ml-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleSelectCandidate(c, role === 'reclutador' ? 'cartera_reclutador' : 'asistencia')
                            }}
                            className="text-[10px] font-bold px-2 py-1 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/25 text-cyan-600 dark:text-cyan-400 border border-cyan-500/30 transition-all active:scale-95"
                          >
                            {role === 'reclutador' ? 'Mi Cartera' : 'Asistencia'}
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* COMMANDS GROUP */}
              {filteredCommands.length > 0 && (activeTab === 'all' || activeTab === 'views') && (
                <div className="space-y-1 mt-2">
                  <div className="px-2 py-1 text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)]">
                    ⚡ Vistas & Accesos Autorizados ({filteredCommands.length})
                  </div>

                  {filteredCommands.map((cmd, idx) => {
                    const itemIndex = (activeTab === 'all' ? filteredCandidates.length : 0) + idx
                    const isSelected = itemIndex === selectedIndex
                    const Icon = cmd.icon

                    return (
                      <button
                        key={cmd.id}
                        onClick={() => {
                          onSelectView(cmd.id)
                          onClose()
                        }}
                        onMouseEnter={() => setSelectedIndex(itemIndex)}
                        className={`
                          w-full flex items-center justify-between px-3.5 py-2 rounded-2xl text-left transition-all cursor-pointer group
                          ${isSelected 
                            ? 'bg-[var(--accent)]/15 border border-[var(--accent)]/30 text-[var(--text-primary)]' 
                            : 'hover:bg-[var(--bg-elevated)] text-[var(--text-secondary)] border border-transparent'
                          }
                        `}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`p-1.5 rounded-xl border transition-all ${
                            isSelected 
                              ? 'bg-[var(--accent)] text-white border-[var(--accent)] shadow-[0_0_12px_rgba(6,182,212,0.4)]' 
                              : 'bg-[var(--bg-elevated)] text-[var(--text-muted)] border-[var(--border-subtle)]'
                          }`}>
                            <Icon size={14} />
                          </div>
                          <div className="truncate">
                            <p className="text-xs font-bold text-[var(--text-primary)] truncate">
                              {cmd.title}
                            </p>
                            <p className="text-[9px] text-[var(--text-muted)] font-semibold uppercase tracking-wider">
                              {cmd.section}
                            </p>
                          </div>
                        </div>

                        <ArrowRight size={13} className={`shrink-0 transition-transform ${isSelected ? 'translate-x-0.5 text-[var(--accent)] opacity-100' : 'opacity-0'}`} />
                      </button>
                    )
                  })}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer info */}
        <div className="flex items-center justify-between px-4 py-2 bg-[var(--bg-elevated)]/80 border-t border-[var(--border-subtle)] text-[10px] text-[var(--text-muted)] font-semibold">
          <div className="flex items-center gap-3">
            <span>↑↓ para navegar</span>
            <span>↵ para seleccionar</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Sparkles size={11} className="text-cyan-400" />
            <span>Filtro de Seguridad por Usuario Activo</span>
          </div>
        </div>

      </div>

    </div>
  )
}
