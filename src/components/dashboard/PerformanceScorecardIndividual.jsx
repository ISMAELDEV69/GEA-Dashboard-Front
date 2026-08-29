import { useState, useMemo, memo, useRef, useEffect, useCallback } from 'react'
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts'
import {
  Trophy, Award, Target, Users, UserCheck, Calendar, Sparkles, TrendingUp,
  AlertTriangle, CheckCircle2, Star, Clock, Filter, ArrowUpRight, ArrowDownRight,
  GraduationCap, Briefcase, Zap, HelpCircle, ChevronRight, Eye, Search, X, Shield, Activity, Layers
} from 'lucide-react'
import {
  computeAllRecruitersPerformance,
  getRecruiterIndividualDetails,
  computeAllTrainersPerformance,
  getTrainerIndividualDetails,
  norm,
  matchPerson
} from '../../lib/performanceScorecardEngine'
import PageLayout from '../ui/PageLayout'
import Card, { CardHeader, CardTitle, CardContent } from '../ui/Card'

// ── Componente de Estrellas de Desempeño ──────────────────────────────────
function StarRating({ count = 5 }) {
  return (
    <div className="flex items-center gap-0.5" title={`Calificación: ${count} de 5 estrellas`}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          size={11}
          className={
            star <= count
              ? 'fill-amber-400 text-amber-400 drop-shadow-[0_0_6px_rgba(251,191,36,0.6)]'
              : 'fill-slate-800/80 text-slate-800'
          }
        />
      ))}
    </div>
  )
}

// ── Tooltip Cyberpunk para Micro-Gráficos ──────────────────────────────────
function ScorecardChartTooltip({ active, payload, label, unit = '' }) {
  if (!active || !payload || !payload.length) return null
  return (
    <div className="rounded-xl border border-cyan-500/40 bg-slate-950/95 p-2.5 shadow-2xl shadow-cyan-950/50 backdrop-blur-xl text-[11px] font-mono">
      <div className="text-cyan-400 font-bold mb-1.5 border-b border-slate-800 pb-1 flex items-center justify-between gap-2">
        <span>Día {label} del Mes</span>
        <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse" />
      </div>
      {payload.map((entry, idx) => (
        <div key={idx} className="flex items-center justify-between gap-4 text-slate-200 py-0.5">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full shadow-xs" style={{ backgroundColor: entry.color }} />
            <span className="text-slate-300 font-semibold">{entry.name}:</span>
          </span>
          <span className="font-black text-white font-mono drop-shadow-xs">
            {entry.value} {unit}
          </span>
        </div>
      ))}
    </div>
  )
}

function PerformanceScorecardIndividual({
  postulantes = [],
  asistencias = [],
  campanasMetas = [],
  reclutadores = [],
  formadores = [],
  grupos = [],
  userProfile = null,
  attendanceIndexes = null
}) {
  // ── Detección de Rol y Seguridad de Auto-Consulta ───────────────────────
  const userRole = (userProfile?.role || 'admin').toLowerCase()
  const isRecruiterUser = userRole === 'reclutador'
  const isTrainerUser = userRole === 'formador'
  const isSelfLocked = isRecruiterUser || isTrainerUser

  // Identificador propio del usuario autenticado
  const selfIdentifier = useMemo(() => {
    if (isRecruiterUser) {
      return userProfile?.nombre_completo || userProfile?.nombre || userProfile?.documento || userProfile?.dni || userProfile?.usuario || userProfile?.alias || ''
    }
    if (isTrainerUser) {
      return userProfile?.nombre_completo || userProfile?.nombre || userProfile?.formador_documento || userProfile?.documento || userProfile?.dni || userProfile?.usuario || userProfile?.alias || ''
    }
    return ''
  }, [userProfile, isRecruiterUser, isTrainerUser])

  // ── Estados de Control y Filtros ────────────────────────────────────────
  const [activeRole, setActiveRole] = useState(isTrainerUser ? 'FORMADOR' : 'RECLUTADOR')
  const [filterPeriodo, setFilterPeriodo] = useState('Todos')
  const [filterSegmento, setFilterSegmento] = useState('Todos')
  const [filterCampana, setFilterCampana] = useState('Todos')
  const [filterGrupo, setFilterGrupo] = useState('Todos los Grupos')
  const [selectedIdentifier, setSelectedIdentifier] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [isSearchDropdownOpen, setIsSearchDropdownOpen] = useState(false)
  const [showTodayModal, setShowTodayModal] = useState(false)
  const searchContainerRef = useRef(null)

  // Helper para normalizar períodos a 6 dígitos (ej: "202608", "2026-08" -> "202608")
  const normalizePeriodo = (raw) => {
    if (!raw) return ''
    const str = String(raw).trim().toUpperCase()
    const m = str.match(/(\d{4})[-_/\s]?(\d{2})/)
    if (m) return `${m[1]}${m[2]}`
    const digits = str.replace(/\D/g, '')
    return digits.length >= 6 ? digits.slice(0, 6) : digits
  }

  // Mapa de resolución de grupos (para heredar período, segmento y campaña si el postulante no lo tiene)
  const grupoInfoMap = useMemo(() => {
    const map = new Map()
    const addG = (code, periodo, segmento, campana) => {
      const c = norm(code)
      if (!c) return
      map.set(c, {
        periodo: normalizePeriodo(periodo),
        segmento: (segmento || '').trim().toUpperCase(),
        campana: (campana || '').trim().toUpperCase()
      })
    }
    ;(grupos || []).forEach(g => addG(g.codigo || g.grupo_codigo, g.periodo, g.segmento, g.campana))
    ;(campanasMetas || []).forEach(g => addG(g.codigo || g.grupo_codigo || g.codigo_grupo, g.periodo, g.segmento, g.campana_nombre || g.campana))
    return map
  }, [grupos, campanasMetas])

  // Funciones de resolución de atributos de postulante
  const getPPeriodo = useCallback((p) => {
    const direct = normalizePeriodo(p.periodo_reclutado || p.periodo || p.periodo_rys)
    if (direct && direct.length === 6) return direct
    if (p.grupo_codigo) {
      const g = grupoInfoMap.get(norm(p.grupo_codigo))
      if (g && g.periodo) return g.periodo
    }
    const fromDate = normalizePeriodo(p.fecha_ingreso || p.fecha_registro || p.marca_temporal || p.created_at)
    if (fromDate && fromDate.length === 6) return fromDate
    return ''
  }, [grupoInfoMap])

  const getPSegmento = useCallback((p) => {
    if (p.segmento && p.segmento.trim()) return p.segmento.trim().toUpperCase()
    if (p.grupo_codigo) {
      const g = grupoInfoMap.get(norm(p.grupo_codigo))
      if (g && g.segmento) return g.segmento
    }
    return 'GENERAL'
  }, [grupoInfoMap])

  const getPCampana = useCallback((p) => {
    if (p.campana && p.campana.trim()) return p.campana.trim().toUpperCase()
    if (p.grupo_codigo) {
      const g = grupoInfoMap.get(norm(p.grupo_codigo))
      if (g && g.campana) return g.campana
    }
    return 'GENERAL'
  }, [grupoInfoMap])

  // ── 1. Extraer Opciones de Filtros en Cascada Estricta ─────────────────
  
  // A. Períodos Disponibles
  const periodosOptions = useMemo(() => {
    const set = new Set()
    postulantes.forEach(p => {
      const per = getPPeriodo(p)
      if (per && per.length === 6) set.add(per)
    })
    campanasMetas.forEach(g => {
      const per = normalizePeriodo(g.periodo)
      if (per && per.length === 6) set.add(per)
    })
    grupos.forEach(g => {
      const per = normalizePeriodo(g.periodo)
      if (per && per.length === 6) set.add(per)
    })
    return ['Todos', ...Array.from(set).sort((a, b) => b.localeCompare(a))]
  }, [postulantes, campanasMetas, grupos, getPPeriodo])

  // B. Segmentos Disponibles (Filtrados por Período seleccionado)
  const segmentosOptions = useMemo(() => {
    const set = new Set()
    
    postulantes.forEach(p => {
      if (filterPeriodo !== 'Todos') {
        const per = getPPeriodo(p)
        if (per !== filterPeriodo) return
      }
      const seg = getPSegmento(p)
      if (seg) set.add(seg)
    })

    campanasMetas.forEach(g => {
      if (filterPeriodo !== 'Todos' && normalizePeriodo(g.periodo) !== filterPeriodo) return
      if (g.segmento && g.segmento.trim()) set.add(g.segmento.trim().toUpperCase())
    })

    grupos.forEach(g => {
      if (filterPeriodo !== 'Todos' && normalizePeriodo(g.periodo) !== filterPeriodo) return
      if (g.segmento && g.segmento.trim()) set.add(g.segmento.trim().toUpperCase())
    })

    return ['Todos Segmentos', ...Array.from(set).sort()]
  }, [postulantes, campanasMetas, grupos, filterPeriodo, getPPeriodo, getPSegmento])

  // C. Campañas Disponibles (Filtradas por Período Y Segmento seleccionados)
  const campanasOptions = useMemo(() => {
    const set = new Set()

    postulantes.forEach(p => {
      if (filterPeriodo !== 'Todos') {
        const per = getPPeriodo(p)
        if (per !== filterPeriodo) return
      }
      if (filterSegmento !== 'Todos Segmentos') {
        const seg = getPSegmento(p)
        if (seg !== filterSegmento) return
      }
      const camp = getPCampana(p)
      if (camp) set.add(camp)
    })

    campanasMetas.forEach(g => {
      if (filterPeriodo !== 'Todos' && normalizePeriodo(g.periodo) !== filterPeriodo) return
      if (filterSegmento !== 'Todos Segmentos' && g.segmento && g.segmento.trim().toUpperCase() !== filterSegmento) return
      const camp = g.campana_nombre || g.campana
      if (camp && camp.trim()) set.add(camp.trim().toUpperCase())
    })

    grupos.forEach(g => {
      if (filterPeriodo !== 'Todos' && normalizePeriodo(g.periodo) !== filterPeriodo) return
      if (filterSegmento !== 'Todos Segmentos' && g.segmento && g.segmento.trim().toUpperCase() !== filterSegmento) return
      if (g.campana && g.campana.trim()) set.add(g.campana.trim().toUpperCase())
    })

    return ['Todas Campañas', ...Array.from(set).sort()]
  }, [postulantes, campanasMetas, grupos, filterPeriodo, filterSegmento, getPPeriodo, getPSegmento, getPCampana])

  // D. Códigos de Grupo Disponibles (Filtrados por Período, Segmento y Campaña)
  const gruposOptions = useMemo(() => {
    const set = new Set()

    postulantes.forEach(p => {
      if (filterPeriodo !== 'Todos' && getPPeriodo(p) !== filterPeriodo) return
      if (filterSegmento !== 'Todos Segmentos' && getPSegmento(p) !== filterSegmento) return
      if (filterCampana !== 'Todas Campañas' && getPCampana(p) !== filterCampana) return
      if (p.grupo_codigo && p.grupo_codigo.trim()) set.add(p.grupo_codigo.trim().toUpperCase())
    })

    grupos.forEach(g => {
      if (filterPeriodo !== 'Todos' && normalizePeriodo(g.periodo) !== filterPeriodo) return
      if (filterSegmento !== 'Todos Segmentos' && (g.segmento || '').trim().toUpperCase() !== filterSegmento) return
      if (filterCampana !== 'Todas Campañas' && (g.campana || '').trim().toUpperCase() !== filterCampana) return
      const code = g.codigo || g.grupo_codigo
      if (code && code.trim()) set.add(code.trim().toUpperCase())
    })

    campanasMetas.forEach(g => {
      if (filterPeriodo !== 'Todos' && normalizePeriodo(g.periodo) !== filterPeriodo) return
      if (filterSegmento !== 'Todos Segmentos' && (g.segmento || '').trim().toUpperCase() !== filterSegmento) return
      if (filterCampana !== 'Todas Campañas' && (g.campana_nombre || g.campana || '').trim().toUpperCase() !== filterCampana) return
      const code = g.grupo_codigo || g.codigo
      if (code && code.trim()) set.add(code.trim().toUpperCase())
    })

    return ['Todos los Grupos', ...Array.from(set).sort()]
  }, [postulantes, grupos, campanasMetas, filterPeriodo, filterSegmento, filterCampana, getPPeriodo, getPSegmento, getPCampana])

  // Ajuste automático si el valor activo ya no existe en las opciones hijas
  useEffect(() => {
    if (filterSegmento !== 'Todos Segmentos' && !segmentosOptions.includes(filterSegmento)) {
      setFilterSegmento('Todos Segmentos')
    }
  }, [segmentosOptions, filterSegmento])

  useEffect(() => {
    if (filterCampana !== 'Todas Campañas' && !campanasOptions.includes(filterCampana)) {
      setFilterCampana('Todas Campañas')
    }
  }, [campanasOptions, filterCampana])

  useEffect(() => {
    if (filterGrupo !== 'Todos los Grupos' && !gruposOptions.includes(filterGrupo)) {
      setFilterGrupo('Todos los Grupos')
    }
  }, [gruposOptions, filterGrupo])

  // ── 2. Filtrado de Datos Base según Filtros Seleccionados ─────────────────
  const filteredPostulantes = useMemo(() => {
    return postulantes.filter(p => {
      if (filterPeriodo !== 'Todos') {
        const per = getPPeriodo(p)
        if (per !== filterPeriodo) return false
      }
      if (filterSegmento !== 'Todos Segmentos') {
        const seg = getPSegmento(p)
        if (seg !== filterSegmento) return false
      }
      if (filterCampana !== 'Todas Campañas') {
        const camp = getPCampana(p)
        if (camp !== filterCampana) return false
      }
      if (filterGrupo !== 'Todos los Grupos') {
        const gCode = (p.grupo_codigo || '').trim().toUpperCase()
        if (gCode !== filterGrupo) return false
      }
      return true
    })
  }, [postulantes, filterPeriodo, filterSegmento, filterCampana, filterGrupo, getPPeriodo, getPSegmento, getPCampana])

  const filteredGrupos = useMemo(() => {
    return grupos.filter(g => {
      if (filterPeriodo !== 'Todos') {
        const per = normalizePeriodo(g.periodo)
        if (per && per !== filterPeriodo) return false
      }
      if (filterSegmento !== 'Todos Segmentos') {
        const seg = (g.segmento || '').trim().toUpperCase()
        if (seg && seg !== filterSegmento) return false
      }
      if (filterCampana !== 'Todas Campañas') {
        const camp = (g.campana || '').trim().toUpperCase()
        if (camp && camp !== filterCampana) return false
      }
      if (filterGrupo !== 'Todos los Grupos') {
        const code = (g.codigo || g.grupo_codigo || '').trim().toUpperCase()
        if (code !== filterGrupo) return false
      }
      return true
    })
  }, [grupos, filterPeriodo, filterSegmento, filterCampana, filterGrupo])

  const filteredCampanasMetas = useMemo(() => {
    return campanasMetas.filter(g => {
      if (filterPeriodo !== 'Todos') {
        const per = normalizePeriodo(g.periodo)
        if (per && per !== filterPeriodo) return false
      }
      if (filterSegmento !== 'Todos Segmentos') {
        const seg = (g.segmento || '').trim().toUpperCase()
        if (seg && seg !== filterSegmento) return false
      }
      if (filterCampana !== 'Todas Campañas') {
        const camp = (g.campana_nombre || g.campana || '').trim().toUpperCase()
        if (camp && camp !== filterCampana) return false
      }
      if (filterGrupo !== 'Todos los Grupos') {
        const code = (g.grupo_codigo || g.codigo || '').trim().toUpperCase()
        if (code !== filterGrupo) return false
      }
      return true
    })
  }, [campanasMetas, filterPeriodo, filterSegmento, filterCampana, filterGrupo])

  const filteredAsistencias = useMemo(() => {
    const validGroupCodes = new Set(filteredGrupos.map(g => norm(g.codigo || g.grupo_codigo)).filter(Boolean))
    const validPostulanteDocs = new Set(filteredPostulantes.map(p => p.documento).filter(Boolean))

    return asistencias.filter(a => {
      const gCode = norm(a.codigo_grupo || a.grupo || a.grupo_codigo)
      const doc = a.postulante_documento || a.documento
      const camp = (a.campana || '').trim().toUpperCase()
      const seg = (a.segmento || '').trim().toUpperCase()

      // Si se filtró por grupo específico
      if (filterGrupo !== 'Todos los Grupos') {
        if (gCode !== norm(filterGrupo) && !validPostulanteDocs.has(doc)) return false
      }

      // Si el grupo está en los grupos filtrados, es válido
      if (gCode && validGroupCodes.has(gCode)) return true

      // Si el postulante pertenece al conjunto filtrado, es válido
      if (doc && validPostulanteDocs.has(doc)) return true

      // Si no tiene grupo ni postulante directo pero tiene datos de campaña / segmento / período
      if (filterCampana !== 'Todas Campañas') {
        if (camp !== filterCampana) return false
      }

      if (filterSegmento !== 'Todos Segmentos') {
        if (seg && seg !== filterSegmento) return false
      }

      if (filterPeriodo !== 'Todos') {
        const aPeriodo = normalizePeriodo(a.periodo || a.fecha)
        if (aPeriodo && aPeriodo !== filterPeriodo) return false
        if (!aPeriodo && !gCode && !doc) return false
      }

      // Si hay grupos filtrados y la asistencia tiene un gCode que no pertenece a ellos, excluir
      if (gCode && validGroupCodes.size > 0 && !validGroupCodes.has(gCode)) {
        return false
      }

      return true
    })
  }, [asistencias, filteredGrupos, filteredPostulantes, filterCampana, filterSegmento, filterPeriodo, filterGrupo])

  // 3. Cálculos de Reclutadores (con exclusión estricta de formadores)
  const rankedRecruiters = useMemo(() => {
    return computeAllRecruitersPerformance(
      filteredPostulantes,
      filteredAsistencias,
      filteredCampanasMetas,
      attendanceIndexes,
      reclutadores,
      formadores
    )
  }, [filteredPostulantes, filteredAsistencias, filteredCampanasMetas, attendanceIndexes, reclutadores, formadores])

  // 4. Cálculos de Formadores
  const rankedTrainers = useMemo(() => {
    return computeAllTrainersPerformance(
      filteredPostulantes,
      filteredAsistencias,
      filteredGrupos,
      formadores
    )
  }, [filteredPostulantes, filteredAsistencias, filteredGrupos, formadores])

  // Lista activa de personas según rol
  const activePersonList = activeRole === 'RECLUTADOR' ? rankedRecruiters : rankedTrainers

  // Auto-selección inicial o resolución por identificador (Nombre / DNI / Alias)
  // Siempre selecciona primero al asesor #1 (con mejor indicador)
  const currentTargetIdentifier = useMemo(() => {
    // Si el usuario tiene rol Reclutador o Formador, se bloquea a su propio perfil
    if (isSelfLocked && selfIdentifier) {
      const selfMatch = activePersonList.find(p => 
        matchPerson(p.nombre, selfIdentifier) || 
        (p.dni && p.dni === selfIdentifier) || 
        (p.usuario && norm(p.usuario) === norm(selfIdentifier))
      )
      if (selfMatch) return selfMatch.nombre
    }

    if (selectedIdentifier) {
      const match = activePersonList.find(p => 
        norm(p.nombre) === norm(selectedIdentifier) || 
        norm(p.dni) === norm(selectedIdentifier) || 
        norm(p.usuario) === norm(selectedIdentifier)
      )
      if (match) return match.nombre
    }
    // Por defecto toma al asesor #1 (el primero de la lista ordenada por mejor score)
    if (activePersonList.length > 0) return activePersonList[0].nombre
    return ''
  }, [isSelfLocked, selfIdentifier, selectedIdentifier, activePersonList])

  // Auto-ajuste para que siempre cargue el #1 si la persona seleccionada ya no pertenece al filtro
  useEffect(() => {
    if (activePersonList.length > 0) {
      const exists = activePersonList.some(p => norm(p.nombre) === norm(selectedIdentifier))
      if (!exists) {
        setSelectedIdentifier(activePersonList[0].nombre)
      }
    } else {
      setSelectedIdentifier('')
    }
  }, [activePersonList, selectedIdentifier])

  // Detalle individual y evolución temporal (incluyendo desglose por grupo)
  const individualData = useMemo(() => {
    if (!currentTargetIdentifier) return null
    if (activeRole === 'RECLUTADOR') {
      return getRecruiterIndividualDetails(currentTargetIdentifier, filteredPostulantes, filteredAsistencias, rankedRecruiters, filteredCampanasMetas)
    } else {
      return getTrainerIndividualDetails(currentTargetIdentifier, filteredAsistencias, rankedTrainers)
    }
  }, [activeRole, currentTargetIdentifier, filteredPostulantes, filteredAsistencias, rankedRecruiters, rankedTrainers, filteredCampanasMetas])

  // Filtrado multi-criterio: DNI, Nombre, Usuario o Alias
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return activePersonList.slice(0, 15)
    const q = norm(searchQuery)
    return activePersonList.filter(p => {
      const matchName = norm(p.nombre).includes(q)
      const matchDni = norm(p.dni).includes(q)
      const matchUser = norm(p.usuario).includes(q)
      const matchSeg = norm(p.segmento).includes(q)
      return matchName || matchDni || matchUser || matchSeg
    })
  }, [activePersonList, searchQuery])

  // Cerrar buscador al hacer clic afuera
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target)) {
        setIsSearchDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <PageLayout className="h-full overflow-y-auto flex flex-col gap-3 p-3 sm:p-4 w-full custom-scrollbar bg-slate-950/85">
      
      {/* ── 1. CABECERA CYBERPUNK: FILTROS CRUZADOS, SELECTOR DE ASESOR Y PERFIL 360° ── */}
      <div 
        className="relative overflow-visible rounded-2xl border border-indigo-500/30 bg-gradient-to-r from-slate-950 via-slate-900/95 to-slate-950 p-3.5 shadow-2xl backdrop-blur-xl shrink-0"
        style={{
          background: 'radial-gradient(circle at top right, rgba(99, 102, 241, 0.15), transparent 70%), radial-gradient(circle at bottom left, rgba(6, 182, 212, 0.12), transparent 70%), rgba(8, 12, 20, 0.95)'
        }}
      >
        {/* Haz de luz de neón superior */}
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-cyan-400 to-transparent opacity-80 animate-pulse" />

        {/* Fila 1: Selector de Rol y Filtros en Cascada */}
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          
          {/* Switcher de Rol Cyberpunk (Solo interactivo si tiene permiso de gerencia) */}
          <div className="flex items-center gap-1 rounded-xl bg-slate-950/90 p-1 border border-slate-800 shadow-inner">
            <button
              type="button"
              disabled={isTrainerUser}
              onClick={() => {
                setActiveRole('RECLUTADOR')
                setSelectedIdentifier('')
                setSearchQuery('')
              }}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer select-none ${
                activeRole === 'RECLUTADOR'
                  ? 'bg-gradient-to-r from-indigo-600 to-blue-600 text-white shadow-lg shadow-indigo-600/40 border border-indigo-400/40'
                  : 'text-slate-400 hover:text-slate-200'
              } ${isTrainerUser ? 'opacity-40 cursor-not-allowed' : ''}`}
            >
              <Users size={13} />
              <span>KPIS RECLUTADOR</span>
            </button>
            <button
              type="button"
              disabled={isRecruiterUser}
              onClick={() => {
                setActiveRole('FORMADOR')
                setSelectedIdentifier('')
                setSearchQuery('')
              }}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer select-none ${
                activeRole === 'FORMADOR'
                  ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg shadow-purple-600/40 border border-purple-400/40'
                  : 'text-slate-400 hover:text-slate-200'
              } ${isRecruiterUser ? 'opacity-40 cursor-not-allowed' : ''}`}
            >
              <GraduationCap size={13} />
              <span>KPIS FORMADOR (TRAINER)</span>
            </button>
          </div>

          {/* Filtros en Cascada: Período, Segmento, Campaña */}
          <div className="flex flex-wrap items-center gap-2">
            
            {/* Filtro Período */}
            <div className="flex items-center gap-1.5 bg-slate-950/90 border border-slate-800 rounded-xl px-2.5 py-1 shadow-inner">
              <Calendar size={12} className="text-indigo-400" />
              <span className="text-[10px] font-bold text-slate-400 uppercase">Período:</span>
              <select
                value={filterPeriodo}
                onChange={(e) => {
                  setFilterPeriodo(e.target.value)
                  setSelectedIdentifier('')
                }}
                className="bg-transparent text-xs font-black text-slate-100 outline-none cursor-pointer"
              >
                {periodosOptions.map(p => (
                  <option key={p} value={p} className="bg-slate-900 text-slate-100">{p}</option>
                ))}
              </select>
            </div>

            {/* Filtro Segmento */}
            <div className="flex items-center gap-1.5 bg-slate-950/90 border border-slate-800 rounded-xl px-2.5 py-1 shadow-inner">
              <Filter size={12} className="text-cyan-400" />
              <span className="text-[10px] font-bold text-slate-400 uppercase">Segmento:</span>
              <select
                value={filterSegmento}
                onChange={(e) => {
                  setFilterSegmento(e.target.value)
                  setSelectedIdentifier('')
                }}
                className="bg-transparent text-xs font-black text-slate-100 outline-none cursor-pointer max-w-[130px] truncate"
              >
                {segmentosOptions.map(s => (
                  <option key={s} value={s} className="bg-slate-900 text-slate-100">{s}</option>
                ))}
              </select>
            </div>

            {/* Filtro Campaña */}
            <div className="flex items-center gap-1.5 bg-slate-950/90 border border-slate-800 rounded-xl px-2.5 py-1 shadow-inner">
              <Briefcase size={12} className="text-emerald-400" />
              <span className="text-[10px] font-bold text-slate-400 uppercase">Campaña:</span>
              <select
                value={filterCampana}
                onChange={(e) => {
                  setFilterCampana(e.target.value)
                  setSelectedIdentifier('')
                }}
                className="bg-transparent text-xs font-black text-slate-100 outline-none cursor-pointer max-w-[140px] truncate"
              >
                {campanasOptions.map(c => (
                  <option key={c} value={c} className="bg-slate-900 text-slate-100">{c}</option>
                ))}
              </select>
            </div>

            {/* Filtro Grupo */}
            <div className="flex items-center gap-1.5 bg-slate-950/90 border border-slate-800 rounded-xl px-2.5 py-1 shadow-inner">
              <Layers size={12} className="text-purple-400" />
              <span className="text-[10px] font-bold text-slate-400 uppercase">Grupo:</span>
              <select
                value={filterGrupo}
                onChange={(e) => {
                  setFilterGrupo(e.target.value)
                  setSelectedIdentifier('')
                }}
                className="bg-transparent text-xs font-black text-slate-100 outline-none cursor-pointer max-w-[150px] truncate"
              >
                {gruposOptions.map(g => (
                  <option key={g} value={g} className="bg-slate-900 text-slate-100">{g}</option>
                ))}
              </select>
            </div>

            {/* Botón ¿Cómo voy hoy? */}
            <button
              type="button"
              onClick={() => setShowTodayModal(!showTodayModal)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-cyan-500 via-teal-500 to-emerald-500 hover:opacity-90 text-slate-950 font-black text-xs shadow-lg shadow-cyan-500/20 transition-all cursor-pointer active:scale-95 select-none shrink-0"
            >
              <Zap size={13} className="text-slate-950 fill-current" />
              <span>¿Cómo voy hoy?</span>
            </button>
          </div>
        </div>

        {/* Fila 2: Selector Desplegable de Asesor + Buscador Rápido de Auditoría */}
        <div className="mt-2.5 pt-2.5 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2.5">
          
          {/* Selector Desplegable Oficial de Asesor */}
          <div className="flex items-center gap-2 flex-1 min-w-[280px]">
            <span className="text-xs font-black text-cyan-300 uppercase tracking-wider flex items-center gap-1 shrink-0">
              <Award size={14} className="text-cyan-400" />
              {activeRole === 'RECLUTADOR' ? 'Reclutador:' : 'Formador:'}
            </span>
            
            {isSelfLocked ? (
              <div className="flex-1 px-3 py-1.5 rounded-xl bg-slate-950/90 border border-slate-800 text-xs font-black text-indigo-300 flex items-center justify-between">
                <span>{currentTargetIdentifier || userProfile?.nombre_completo || 'Mi Perfil'}</span>
                <span className="text-[10px] text-slate-500 font-mono">🔒 Vista Personal</span>
              </div>
            ) : (
              <select
                value={currentTargetIdentifier}
                onChange={(e) => {
                  setSelectedIdentifier(e.target.value)
                  setSearchQuery('')
                }}
                className="flex-1 h-9 px-3 bg-slate-950/90 border border-slate-700/80 hover:border-cyan-500/60 focus:border-cyan-400 focus:ring-1 focus:ring-cyan-500/40 rounded-xl text-xs font-black text-slate-100 outline-none cursor-pointer transition-all shadow-inner"
              >
                {activePersonList.map((person) => (
                  <option key={person.nombre} value={person.nombre} className="bg-slate-900 text-slate-100 font-semibold py-1">
                    #{person.rank} • {person.nombre} ({person.quartile} - {person.score}%) • {activeRole === 'RECLUTADOR' ? `${person.totalPostulantes} post.` : `${person.totalAlumnos} alum.`}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Buscador Rápido por DNI / Nombre / Alias (Solo para Gerencia/Supervisión) */}
          {!isSelfLocked && (
            <div ref={searchContainerRef} className="relative flex-1 max-w-xs">
              <div className="relative">
                <input
                  type="text"
                  placeholder={`Buscar por DNI, Nombre o Alias...`}
                  value={searchQuery}
                  onFocus={() => setIsSearchDropdownOpen(true)}
                  onChange={(e) => {
                    setSearchQuery(e.target.value)
                    setIsSearchDropdownOpen(true)
                  }}
                  className="w-full h-9 pl-8 pr-8 bg-slate-950/90 border border-slate-700/80 hover:border-cyan-500/60 focus:border-cyan-400 focus:ring-1 focus:ring-cyan-500/40 rounded-xl text-xs font-semibold text-slate-100 placeholder-slate-500 outline-none transition-all shadow-inner"
                />
                <Search size={13} className="absolute left-2.5 top-3 text-cyan-400" />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-3 text-slate-500 hover:text-slate-300 cursor-pointer"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>

              {/* Dropdown flotante de sugerencias */}
              {isSearchDropdownOpen && (
                <div className="absolute top-10 left-0 right-0 z-50 max-h-64 overflow-y-auto rounded-xl border border-slate-700 bg-slate-950/95 shadow-2xl backdrop-blur-2xl custom-scrollbar p-1 space-y-1">
                  {searchResults.length > 0 ? (
                    searchResults.map((person) => (
                      <button
                        key={person.nombre}
                        type="button"
                        onClick={() => {
                          setSelectedIdentifier(person.nombre)
                          setSearchQuery('')
                          setIsSearchDropdownOpen(false)
                        }}
                        className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-slate-900 text-left transition-colors cursor-pointer border border-transparent hover:border-slate-800"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-indigo-500/20 text-indigo-300 font-bold text-xs border border-indigo-500/30">
                            {person.nombre.slice(0, 2).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-slate-200 truncate">{person.nombre}</p>
                            <p className="text-[10px] text-slate-400 font-mono">
                              {person.dni ? `DNI: ${person.dni}` : ''} {person.usuario ? `• @${person.usuario}` : ''}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span 
                            className="px-1.5 py-0.5 rounded text-[9px] font-black font-mono border"
                            style={{
                              backgroundColor: `${person.quartileColor}18`,
                              borderColor: `${person.quartileColor}35`,
                              color: person.quartileColor
                            }}
                          >
                            {person.quartile}
                          </span>
                          <span className="text-[10px] font-mono font-bold text-slate-400">#{person.rank}</span>
                        </div>
                      </button>
                    ))
                  ) : (
                    <div className="p-3 text-center text-xs text-slate-500">
                      No se encontraron coincidencias para "{searchQuery}"
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Fila 3: Banner de Identidad del Asesor Seleccionado */}
        {individualData && (
          <div className="mt-3 pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-tr from-indigo-600 via-cyan-500 to-emerald-400 text-slate-950 font-black text-base shadow-xl border border-white/30">
                  {individualData.nombre.slice(0, 2).toUpperCase()}
                </div>
                <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 border-2 border-slate-950">
                  <span className="h-1.5 w-1.5 rounded-full bg-white animate-ping" />
                </span>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-base sm:text-lg font-black tracking-tight text-white uppercase drop-shadow-sm">
                    {individualData.nombre}
                  </h1>
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
                    Activo
                  </span>
                </div>
                <p className="text-[10.5px] font-medium text-slate-400 flex flex-wrap items-center gap-2 mt-0.5">
                  <span>Rol: <strong className="text-slate-300">{activeRole === 'RECLUTADOR' ? 'Especialista de Reclutamiento' : 'Formador Titular'}</strong></span>
                  {individualData.dni && (
                    <>
                      <span>•</span>
                      <span>DNI: <strong className="text-cyan-300 font-mono">{individualData.dni}</strong></span>
                    </>
                  )}
                  {individualData.usuario && (
                    <>
                      <span>•</span>
                      <span>Usuario: <strong className="text-purple-300 font-mono">@{individualData.usuario}</strong></span>
                    </>
                  )}
                  <span>•</span>
                  <span>Segmento: <strong className="text-indigo-300">{individualData.segmento || 'General'}</strong></span>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="px-3.5 py-1.5 rounded-xl bg-slate-950/90 border border-slate-800 text-right shadow-inner">
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Score Global Ponderado</span>
                <span className="text-base font-black font-mono text-cyan-400 tabular-nums drop-shadow-[0_0_8px_rgba(6,182,212,0.5)]">
                  {individualData.score}%
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── 2 a 6: DETALLES, GRÁFICOS Y CUARTILES DEL ASESOR ── */}
      {individualData ? (
        <>
          {/* Modal / Popover "¿Cómo voy hoy?" */}
          {showTodayModal && (
            <div className="p-3.5 rounded-2xl bg-gradient-to-r from-cyan-950/90 via-slate-900 to-indigo-950/90 border border-cyan-500/50 shadow-2xl flex items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-lg">
                  <Sparkles size={18} />
                </div>
                <div>
                  <h4 className="text-xs font-black text-cyan-200 uppercase tracking-wider">Estado al Día de Hoy ({new Date().toLocaleDateString('es-PE')})</h4>
                  <p className="text-[11.5px] text-slate-200 font-medium mt-0.5">
                    {individualData.runRateMsg}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowTodayModal(false)}
                className="px-3 py-1 rounded-lg text-[11px] font-black bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 cursor-pointer"
              >
                Entendido
              </button>
            </div>
          )}

          {/* ── 2. RANKING EN LA CAMPAÑA / EMPRESA ── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {/* Ranking General */}
            <div 
              className="relative overflow-hidden rounded-2xl border border-slate-800/90 bg-slate-900/80 p-3.5 flex items-center justify-between shadow-xl backdrop-blur-md"
              style={{
                background: `radial-gradient(circle at top right, ${individualData.quartileColor}15, transparent 70%), rgba(15, 23, 42, 0.85)`
              }}
            >
              <div className="flex items-center gap-3.5">
                <div 
                  className="flex h-13 w-13 shrink-0 items-center justify-center rounded-2xl border shadow-xl"
                  style={{
                    backgroundColor: `${individualData.quartileColor}18`,
                    borderColor: `${individualData.quartileColor}45`,
                    color: individualData.quartileColor
                  }}
                >
                  <Trophy size={26} className="drop-shadow-[0_0_10px_currentColor]" />
                </div>
                <div>
                  <span className="text-[9.5px] font-black uppercase tracking-wider text-slate-400 block">
                    Tu Ranking en la Empresa
                  </span>
                  <div className="flex items-baseline gap-2 mt-0.5">
                    <span className="text-2xl sm:text-3xl font-black text-white font-mono tabular-nums drop-shadow-sm">
                      #{individualData.rank}
                    </span>
                    <span className="text-xs text-slate-400 font-medium">
                      de {individualData.totalRank} {activeRole.toLowerCase()}s
                    </span>
                  </div>
                </div>
              </div>
              <span 
                className="px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider border shadow-lg font-mono"
                style={{
                  backgroundColor: `${individualData.quartileColor}25`,
                  borderColor: `${individualData.quartileColor}50`,
                  color: individualData.quartileColor
                }}
              >
                {individualData.quartile}
              </span>
            </div>

            {/* Tu Supervisión / Segmento */}
            <div 
              className="relative overflow-hidden rounded-2xl border border-slate-800/90 bg-slate-900/80 p-3.5 flex items-center justify-between shadow-xl backdrop-blur-md"
              style={{
                background: 'radial-gradient(circle at top right, rgba(99, 102, 241, 0.15), transparent 70%), rgba(15, 23, 42, 0.85)'
              }}
            >
              <div className="flex items-center gap-3.5">
                <div className="flex h-13 w-13 shrink-0 items-center justify-center rounded-2xl bg-indigo-500/15 border border-indigo-500/35 text-indigo-400 shadow-xl">
                  <Award size={26} className="drop-shadow-[0_0_8px_rgba(99,102,241,0.5)]" />
                </div>
                <div>
                  <span className="text-[9.5px] font-black uppercase tracking-wider text-slate-400 block">
                    Posición en tu Segmento
                  </span>
                  <div className="flex items-baseline gap-2 mt-0.5">
                    <span className="text-2xl sm:text-3xl font-black text-white font-mono tabular-nums">
                      #{individualData.segmentRank || 1}
                    </span>
                    <span className="text-xs text-slate-400 font-medium">
                      de {individualData.totalInSegment || 1} en {individualData.segmento || 'General'}
                    </span>
                  </div>
                </div>
              </div>
              <span className="px-3 py-1.5 rounded-xl text-[10.5px] font-black uppercase tracking-wider bg-indigo-500/20 border border-indigo-500/40 text-indigo-300 font-mono shadow-md">
                {(individualData.segmentRank || 1) === 1 
                  ? 'Líder Segmento' 
                  : (individualData.segmentRank || 1) <= Math.ceil((individualData.totalInSegment || 1) * 0.25) 
                    ? 'Top Segmento' 
                    : `Puesto #${individualData.segmentRank}`}
              </span>
            </div>
          </div>

          {/* ── 3. RESULTADOS DEL PERÍODO (GRID DE TARJETAS NEON) ── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
            {activeRole === 'RECLUTADOR' ? (
              <>
                <div className="p-3 rounded-2xl border border-slate-800 bg-slate-900/80 flex flex-col justify-between backdrop-blur-md shadow-lg">
                  <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">Postulantes Enviados</span>
                  <span className="text-2xl font-black text-indigo-400 font-mono tabular-nums mt-1 drop-shadow-[0_0_6px_rgba(129,140,248,0.4)]">
                    {individualData.totalPostulantes.toLocaleString('es-PE')}
                  </span>
                  <span className="text-[9px] text-slate-500 font-medium mt-1">Meta mensual: {individualData.metaVolumen}</span>
                </div>

                <div className="p-3 rounded-2xl border border-slate-800 bg-slate-900/80 flex flex-col justify-between backdrop-blur-md shadow-lg">
                  <span className="text-[9px] font-black uppercase tracking-wider text-cyan-400">Q DÍA 1 (Asistentes)</span>
                  <span className="text-2xl font-black text-cyan-400 font-mono tabular-nums mt-1 drop-shadow-[0_0_6px_rgba(6,182,212,0.4)]">
                    {individualData.qDia1.toLocaleString('es-PE')}
                  </span>
                  <span className="text-[9px] text-cyan-400/80 font-medium mt-1">{individualData.pctQDia1}% de efectividad inicial</span>
                </div>

                <div className="p-3 rounded-2xl border border-slate-800 bg-slate-900/80 flex flex-col justify-between backdrop-blur-md shadow-lg">
                  <span className="text-[9px] font-black uppercase tracking-wider text-emerald-400">INGRESANTES A LA OPERACIÓN</span>
                  <span className="text-2xl font-black text-emerald-400 font-mono tabular-nums mt-1 drop-shadow-[0_0_6px_rgba(16,185,129,0.4)]">
                    {individualData.ingresantesOP.toLocaleString('es-PE')}
                  </span>
                  <span className="text-[9px] text-emerald-400/80 font-medium mt-1">{individualData.pctConversionOP}% conversión final</span>
                </div>

                <div className="p-3 rounded-2xl border border-slate-800 bg-slate-900/80 flex flex-col justify-between backdrop-blur-md shadow-lg">
                  <span className="text-[9px] font-black uppercase tracking-wider text-rose-400">Bajas Imputables</span>
                  <span className="text-2xl font-black text-rose-400 font-mono tabular-nums mt-1 drop-shadow-[0_0_6px_rgba(244,63,94,0.4)]">
                    {individualData.bajasImputables.toLocaleString('es-PE')}
                  </span>
                  <span className="text-[9px] text-rose-400/80 font-medium mt-1">{individualData.pctBajasImputables}% tasa de quiebre</span>
                </div>
              </>
            ) : (
              <>
                <div className="p-3 rounded-2xl border border-slate-800 bg-slate-900/80 flex flex-col justify-between backdrop-blur-md shadow-lg">
                  <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">Total Alumnos Gestionados</span>
                  <span className="text-2xl font-black text-indigo-400 font-mono tabular-nums mt-1 drop-shadow-[0_0_6px_rgba(129,140,248,0.4)]">
                    {individualData.totalAlumnos.toLocaleString('es-PE')}
                  </span>
                  <span className="text-[9px] text-slate-500 font-medium mt-1">{individualData.activosEnAula} activos en aula</span>
                </div>

                <div className="p-3 rounded-2xl border border-slate-800 bg-slate-900/80 flex flex-col justify-between backdrop-blur-md shadow-lg">
                  <span className="text-[9px] font-black uppercase tracking-wider text-cyan-400">% Asistencia en Aula</span>
                  <span className="text-2xl font-black text-cyan-400 font-mono tabular-nums mt-1 drop-shadow-[0_0_6px_rgba(6,182,212,0.4)]">
                    {individualData.pctAsistencia}%
                  </span>
                  <span className="text-[9px] text-cyan-400/80 font-medium mt-1">Asistencia neta registrada</span>
                </div>

                <div className="p-3 rounded-2xl border border-slate-800 bg-slate-900/80 flex flex-col justify-between backdrop-blur-md shadow-lg">
                  <span className="text-[9px] font-black uppercase tracking-wider text-amber-400">Cantidad de Ausentismo</span>
                  <span className="text-2xl font-black text-amber-400 font-mono tabular-nums mt-1 drop-shadow-[0_0_6px_rgba(245,158,11,0.4)]">
                    {individualData.ausentismoCount.toLocaleString('es-PE')}
                  </span>
                  <span className="text-[9px] text-amber-400/80 font-medium mt-1">Faltas de no dados de baja ({individualData.pctAusentismo}%)</span>
                </div>

                <div className="p-3 rounded-2xl border border-slate-800 bg-slate-900/80 flex flex-col justify-between backdrop-blur-md shadow-lg">
                  <span className="text-[9px] font-black uppercase tracking-wider text-emerald-400">INGRESANTES A LA OPERACIÓN</span>
                  <span className="text-2xl font-black text-emerald-400 font-mono tabular-nums mt-1 drop-shadow-[0_0_6px_rgba(16,185,129,0.4)]">
                    {individualData.ingresantesOP.toLocaleString('es-PE')}
                  </span>
                  <span className="text-[9px] text-emerald-400/80 font-medium mt-1">{individualData.pctRetencionOP}% retención a OP</span>
                </div>
              </>
            )}
          </div>

          {/* ── 4. OBJETIVOS DEL PERÍODO CON PROYECCIÓN PREDICTIVA & ESTRELLAS ── */}
          <Card className="border-slate-800/90 bg-slate-900/80 backdrop-blur-md shadow-xl">
            <CardHeader className="py-2.5 px-3.5 border-b border-slate-800/80 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Target size={14} className="text-cyan-400" />
                <CardTitle className="text-xs font-black uppercase tracking-wider text-slate-200">
                  Objetivos del Período y Motor Predictivo
                </CardTitle>
              </div>
              <span className="text-[10px] font-mono text-slate-400 font-bold">
                Día {new Date().getDate()} de {new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate()} gestionados
              </span>
            </CardHeader>
            <CardContent className="p-3 space-y-2.5">
              {individualData.objetivos.map((obj) => (
                <div 
                  key={obj.id}
                  className="p-3 rounded-xl bg-slate-950/80 border border-slate-800/90 hover:border-slate-700 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-inner"
                >
                  {/* Indicador y Valor Actual vs Meta */}
                  <div className="sm:w-1/4">
                    <span className="text-[9.5px] font-black uppercase text-slate-400 block truncate">
                      {obj.label}
                    </span>
                    <div className="flex items-baseline gap-1.5 mt-0.5">
                      <span className="text-lg font-black font-mono text-white tabular-nums drop-shadow-xs">
                        {obj.actual}
                      </span>
                      <span className="text-[10.5px] text-slate-400 font-medium font-mono">
                        / {obj.meta}
                      </span>
                    </div>
                  </div>

                  {/* Barra de Progreso y Estrellas */}
                  <div className="flex-1 space-y-1.5">
                    <div className="flex items-center justify-between text-[10.5px] font-mono">
                      <span className="font-bold text-slate-300">{obj.pct}% alcanzado</span>
                      <StarRating count={obj.stars} />
                    </div>
                    <div className="h-2.5 w-full rounded-full bg-slate-800/90 overflow-hidden p-0.5 border border-slate-700/60 shadow-inner">
                      <div 
                        className="h-full rounded-full transition-all duration-500 shadow-md"
                        style={{
                          width: `${Math.min(100, obj.pct)}%`,
                          backgroundColor: obj.color,
                          boxShadow: `0 0 8px ${obj.color}80`
                        }}
                      />
                    </div>
                  </div>

                  {/* Mensaje Predictivo Run-Rate */}
                  <div className="sm:w-1/3 sm:text-right">
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-300 bg-slate-900 px-2.5 py-1 rounded-lg border border-slate-800 shadow-xs">
                      {obj.proyeccion}
                    </span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* ── 4.5. DESGLOSE DE RENDIMIENTO POR GRUPO (APORTE INDIVIDUAL VS META DE EQUIPO) ── */}
          {individualData.gruposBreakdown && individualData.gruposBreakdown.length > 0 && (
            <Card className="border-slate-800/90 bg-slate-900/80 backdrop-blur-md shadow-2xl overflow-hidden">
              <CardHeader className="pb-2.5 border-b border-slate-800/80">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle className="text-xs sm:text-sm font-black uppercase tracking-wider text-slate-200 flex items-center gap-2">
                    <Layers size={16} className="text-purple-400" />
                    <span>Desglose por Grupos Asignados (Aporte Individual vs Meta de Equipo)</span>
                  </CardTitle>
                  <span className="text-[11px] font-mono font-bold text-purple-300 bg-purple-950/70 border border-purple-800/60 px-2.5 py-0.5 rounded-lg">
                    {individualData.gruposBreakdown.length} {individualData.gruposBreakdown.length === 1 ? 'Grupo Gestionado' : 'Grupos Gestionados'}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="p-3 sm:p-4">
                <div className="overflow-x-auto custom-scrollbar">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-800 text-[10px] font-black uppercase tracking-wider text-slate-400">
                        <th className="py-2 px-2.5">Código Grupo</th>
                        <th className="py-2 px-2.5">Campaña / Sede</th>
                        <th className="py-2 px-2.5 text-center">Equipo</th>
                        <th className="py-2 px-2.5 text-center text-indigo-300">Aporte Individual (Postulantes)</th>
                        <th className="py-2 px-2.5 text-center text-cyan-300">Q Día 1 (Asistentes)</th>
                        <th className="py-2 px-2.5 text-center text-emerald-300">Pases a OP</th>
                        <th className="py-2 px-2.5 text-right">Meta Individual</th>
                        <th className="py-2 px-2.5 text-right">Meta Grupal (Equipo)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-mono">
                      {individualData.gruposBreakdown.map((gb, idx) => (
                        <tr key={idx} className="hover:bg-slate-800/40 transition-colors">
                          <td className="py-2.5 px-2.5 font-bold text-white flex items-center gap-1.5">
                            <span className="h-1.5 w-1.5 rounded-full bg-purple-400" />
                            <span>{gb.codigo}</span>
                          </td>
                          <td className="py-2.5 px-2.5 text-slate-300 font-sans">
                            <div className="font-bold text-xs">{gb.campana}</div>
                            <div className="text-[10px] text-slate-400">{gb.sede} • {gb.modalidad}</div>
                          </td>
                          <td className="py-2.5 px-2.5 text-center">
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-800 border border-slate-700 text-slate-300">
                              {gb.reclutadoresEquipoCount} {gb.reclutadoresEquipoCount === 1 ? 'reclutador' : 'reclutadores'}
                            </span>
                          </td>
                          <td className="py-2.5 px-2.5 text-center">
                            <span className="font-bold text-indigo-400 text-sm">{gb.postulantesEnviados}</span>
                            {gb.metaRqIndividual > 0 && (
                              <span className="text-[10px] text-slate-400 block">({gb.pctAvanceRqInd}% meta)</span>
                            )}
                          </td>
                          <td className="py-2.5 px-2.5 text-center">
                            <span className="font-bold text-cyan-400 text-sm">{gb.qDia1}</span>
                            {gb.metaDia1Individual > 0 && (
                              <span className="text-[10px] text-slate-400 block">({gb.pctAvanceD1Ind}% obj)</span>
                            )}
                          </td>
                          <td className="py-2.5 px-2.5 text-center">
                            <span className="font-bold text-emerald-400 text-sm">{gb.ingresantesOP}</span>
                          </td>
                          <td className="py-2.5 px-2.5 text-right">
                            <div className="text-slate-200 font-bold">RQ: {gb.metaRqIndividual || '-'}</div>
                            <div className="text-[10px] text-cyan-300">D1: {gb.metaDia1Individual || '-'}</div>
                          </td>
                          <td className="py-2.5 px-2.5 text-right">
                            <div className="text-purple-300 font-bold">RQ Total: {gb.rqGrupal || '-'}</div>
                            <div className="text-[10px] text-slate-400">D1 Grupal: {gb.metaDia1Grupal || '-'}</div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ── 5. EVOLUCIÓN DIARIA DEL PERÍODO (MICRO-GRÁFICOS DINÁMICOS GRANDES RECHARTS) ── */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between px-1">
              <h3 className="text-xs sm:text-sm font-black uppercase tracking-wider text-slate-200 flex items-center gap-2">
                <TrendingUp size={16} className="text-cyan-400" />
                Evolución Diaria del Período (Serie Temporal del Mes Activo)
              </h3>
              <span className="text-[11px] text-cyan-400/80 font-mono font-bold">
                Vista Ampliada 360° (Día a Día)
              </span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {activeRole === 'RECLUTADOR' ? (
                <>
                  {/* Gráfico 1: Postulantes por Día (Grande) */}
                  <div className="p-4 rounded-2xl border border-slate-800/90 bg-slate-900/80 backdrop-blur-md shadow-2xl flex flex-col justify-between hover:border-indigo-500/40 transition-all">
                    <div className="flex items-center justify-between mb-3 border-b border-slate-800/60 pb-2">
                      <div className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full bg-indigo-400 shadow-[0_0_8px_rgba(129,140,248,0.8)]" />
                        <span className="text-xs font-black text-slate-200 uppercase tracking-wider">Postulantes Enviados por Día</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10.5px] font-mono text-indigo-300 font-bold px-2 py-0.5 rounded-md bg-indigo-500/15 border border-indigo-500/30">
                          Total Mes: {individualData.totalPostulantes} post.
                        </span>
                      </div>
                    </div>
                    <div className="h-[250px] sm:h-[270px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={individualData.dailyEvolution} margin={{ top: 12, right: 12, left: -12, bottom: 4 }}>
                          <defs>
                            <linearGradient id="recVolGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#818cf8" stopOpacity={1}/>
                              <stop offset="100%" stopColor="#4338ca" stopOpacity={0.4}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(51, 65, 85, 0.4)" vertical={false} />
                          <XAxis dataKey="dia" stroke="#94a3b8" fontSize={11} tickLine={false} tickMargin={6} />
                          <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} />
                          <Tooltip content={<ScorecardChartTooltip unit="postulantes" />} />
                          <Bar dataKey="postulantes" name="Postulantes" fill="url(#recVolGrad)" radius={[6, 6, 0, 0]} maxBarSize={32} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Gráfico 2: Q Día 1 en Aula (Grande) */}
                  <div className="p-4 rounded-2xl border border-slate-800/90 bg-slate-900/80 backdrop-blur-md shadow-2xl flex flex-col justify-between hover:border-cyan-500/40 transition-all">
                    <div className="flex items-center justify-between mb-3 border-b border-slate-800/60 pb-2">
                      <div className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(6,182,212,0.8)]" />
                        <span className="text-xs font-black text-slate-200 uppercase tracking-wider">Q Día 1 (Asistentes en Aula)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10.5px] font-mono text-cyan-300 font-bold px-2 py-0.5 rounded-md bg-cyan-500/15 border border-cyan-500/30">
                          Total Q Día 1: {individualData.qDia1} ({individualData.pctQDia1}%)
                        </span>
                      </div>
                    </div>
                    <div className="h-[250px] sm:h-[270px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={individualData.dailyEvolution} margin={{ top: 12, right: 12, left: -12, bottom: 4 }}>
                          <defs>
                            <linearGradient id="recQDia1Grad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#06b6d4" stopOpacity={0.55}/>
                              <stop offset="100%" stopColor="#06b6d4" stopOpacity={0.02}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(51, 65, 85, 0.4)" vertical={false} />
                          <XAxis dataKey="dia" stroke="#94a3b8" fontSize={11} tickLine={false} tickMargin={6} />
                          <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} />
                          <Tooltip content={<ScorecardChartTooltip unit="asistentes" />} />
                          <Area type="monotone" dataKey="qDia1" name="Q Día 1" stroke="#06b6d4" strokeWidth={3} fillOpacity={1} fill="url(#recQDia1Grad)" activeDot={{ r: 5, stroke: '#fff', strokeWidth: 2 }} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Gráfico 3: INGRESANTES A LA OPERACIÓN por Día (Grande) */}
                  <div className="p-4 rounded-2xl border border-slate-800/90 bg-slate-900/80 backdrop-blur-md shadow-2xl flex flex-col justify-between hover:border-emerald-500/40 transition-all">
                    <div className="flex items-center justify-between mb-3 border-b border-slate-800/60 pb-2">
                      <div className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
                        <span className="text-xs font-black text-slate-200 uppercase tracking-wider">Ingresantes a la Operación (Pases a OP)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10.5px] font-mono text-emerald-300 font-bold px-2 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/30">
                          Total Pases: {individualData.ingresantesOP} ({individualData.pctConversionOP}%)
                        </span>
                      </div>
                    </div>
                    <div className="h-[250px] sm:h-[270px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={individualData.dailyEvolution} margin={{ top: 12, right: 12, left: -12, bottom: 4 }}>
                          <defs>
                            <linearGradient id="recOpGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#10b981" stopOpacity={1}/>
                              <stop offset="100%" stopColor="#047857" stopOpacity={0.4}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(51, 65, 85, 0.4)" vertical={false} />
                          <XAxis dataKey="dia" stroke="#94a3b8" fontSize={11} tickLine={false} tickMargin={6} />
                          <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} />
                          <Tooltip content={<ScorecardChartTooltip unit="asesores a OP" />} />
                          <Bar dataKey="ingresantesOP" name="Ingresantes a OP" fill="url(#recOpGrad)" radius={[6, 6, 0, 0]} maxBarSize={32} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Gráfico 4: Bajas por Día (Grande) */}
                  <div className="p-4 rounded-2xl border border-slate-800/90 bg-slate-900/80 backdrop-blur-md shadow-2xl flex flex-col justify-between hover:border-rose-500/40 transition-all">
                    <div className="flex items-center justify-between mb-3 border-b border-slate-800/60 pb-2">
                      <div className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full bg-rose-400 shadow-[0_0_8px_rgba(244,63,94,0.8)]" />
                        <span className="text-xs font-black text-slate-200 uppercase tracking-wider">Bajas y Deserciones por Día</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10.5px] font-mono text-rose-300 font-bold px-2 py-0.5 rounded-md bg-rose-500/15 border border-rose-500/30">
                          Total Bajas: {individualData.bajas} ({individualData.bajasImputables} imputables)
                        </span>
                      </div>
                    </div>
                    <div className="h-[250px] sm:h-[270px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={individualData.dailyEvolution} margin={{ top: 12, right: 12, left: -12, bottom: 4 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(51, 65, 85, 0.4)" vertical={false} />
                          <XAxis dataKey="dia" stroke="#94a3b8" fontSize={11} tickLine={false} tickMargin={6} />
                          <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} />
                          <Tooltip content={<ScorecardChartTooltip unit="bajas" />} />
                          <Line type="monotone" dataKey="bajas" name="Bajas" stroke="#f43f5e" strokeWidth={3} dot={{ r: 3.5, fill: '#f43f5e', stroke: '#fff', strokeWidth: 1.5 }} activeDot={{ r: 6, stroke: '#fff', strokeWidth: 2 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  {/* Formador Gráfico 1: % Asistencia Diaria en Aula (Grande) */}
                  <div className="p-4 rounded-2xl border border-slate-800/90 bg-slate-900/80 backdrop-blur-md shadow-2xl flex flex-col justify-between hover:border-cyan-500/40 transition-all">
                    <div className="flex items-center justify-between mb-3 border-b border-slate-800/60 pb-2">
                      <div className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(6,182,212,0.8)]" />
                        <span className="text-xs font-black text-slate-200 uppercase tracking-wider">% Asistencia Diaria en Aula</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10.5px] font-mono text-cyan-300 font-bold px-2 py-0.5 rounded-md bg-cyan-500/15 border border-cyan-500/30">
                          Promedio Mes: {individualData.pctAsistencia}%
                        </span>
                      </div>
                    </div>
                    <div className="h-[250px] sm:h-[270px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={individualData.dailyEvolution} margin={{ top: 12, right: 12, left: -12, bottom: 4 }}>
                          <defs>
                            <linearGradient id="colorAsist" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#06b6d4" stopOpacity={0.55}/>
                              <stop offset="100%" stopColor="#06b6d4" stopOpacity={0.02}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(51, 65, 85, 0.4)" vertical={false} />
                          <XAxis dataKey="dia" stroke="#94a3b8" fontSize={11} tickLine={false} tickMargin={6} />
                          <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} domain={[0, 100]} />
                          <Tooltip content={<ScorecardChartTooltip unit="%" />} />
                          <Area type="monotone" dataKey="pctAsistenciaDia" name="% Asistencia" stroke="#06b6d4" strokeWidth={3} fillOpacity={1} fill="url(#colorAsist)" activeDot={{ r: 5, stroke: '#fff', strokeWidth: 2 }} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Formador Gráfico 2: Ausentismo en Aula (Grande) */}
                  <div className="p-4 rounded-2xl border border-slate-800/90 bg-slate-900/80 backdrop-blur-md shadow-2xl flex flex-col justify-between hover:border-amber-500/40 transition-all">
                    <div className="flex items-center justify-between mb-3 border-b border-slate-800/60 pb-2">
                      <div className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.8)]" />
                        <span className="text-xs font-black text-slate-200 uppercase tracking-wider">Cantidad de Ausentismo por Día (Sin Baja)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10.5px] font-mono text-amber-300 font-bold px-2 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/30">
                          Total Faltas: {individualData.ausentismoCount} ({individualData.pctAusentismo}%)
                        </span>
                      </div>
                    </div>
                    <div className="h-[250px] sm:h-[270px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={individualData.dailyEvolution} margin={{ top: 12, right: 12, left: -12, bottom: 4 }}>
                          <defs>
                            <linearGradient id="trainAusentGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#f59e0b" stopOpacity={1}/>
                              <stop offset="100%" stopColor="#b45309" stopOpacity={0.4}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(51, 65, 85, 0.4)" vertical={false} />
                          <XAxis dataKey="dia" stroke="#94a3b8" fontSize={11} tickLine={false} tickMargin={6} />
                          <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} />
                          <Tooltip content={<ScorecardChartTooltip unit="faltas activas" />} />
                          <Bar dataKey="ausentismo" name="Ausentismo (Faltas)" fill="url(#trainAusentGrad)" radius={[6, 6, 0, 0]} maxBarSize={32} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Formador Gráfico 3: Bajas en Aula (Grande) */}
                  <div className="p-4 rounded-2xl border border-slate-800/90 bg-slate-900/80 backdrop-blur-md shadow-2xl flex flex-col justify-between hover:border-rose-500/40 transition-all">
                    <div className="flex items-center justify-between mb-3 border-b border-slate-800/60 pb-2">
                      <div className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full bg-rose-400 shadow-[0_0_8px_rgba(244,63,94,0.8)]" />
                        <span className="text-xs font-black text-slate-200 uppercase tracking-wider">Bajas y Deserciones en Aula</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10.5px] font-mono text-rose-300 font-bold px-2 py-0.5 rounded-md bg-rose-500/15 border border-rose-500/30">
                          Total Deserciones: {individualData.bajas}
                        </span>
                      </div>
                    </div>
                    <div className="h-[250px] sm:h-[270px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={individualData.dailyEvolution} margin={{ top: 12, right: 12, left: -12, bottom: 4 }}>
                          <defs>
                            <linearGradient id="trainBajasGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#f43f5e" stopOpacity={1}/>
                              <stop offset="100%" stopColor="#be123c" stopOpacity={0.4}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(51, 65, 85, 0.4)" vertical={false} />
                          <XAxis dataKey="dia" stroke="#94a3b8" fontSize={11} tickLine={false} tickMargin={6} />
                          <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} />
                          <Tooltip content={<ScorecardChartTooltip unit="bajas en aula" />} />
                          <Bar dataKey="bajas" name="Bajas en Aula" fill="url(#trainBajasGrad)" radius={[6, 6, 0, 0]} maxBarSize={32} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Formador Gráfico 4: INGRESANTES A LA OPERACIÓN (Grande) */}
                  <div className="p-4 rounded-2xl border border-slate-800/90 bg-slate-900/80 backdrop-blur-md shadow-2xl flex flex-col justify-between hover:border-emerald-500/40 transition-all">
                    <div className="flex items-center justify-between mb-3 border-b border-slate-800/60 pb-2">
                      <div className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
                        <span className="text-xs font-black text-slate-200 uppercase tracking-wider">Ingresantes a la Operación (Graduados a OP)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10.5px] font-mono text-emerald-300 font-bold px-2 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/30">
                          Total Graduados: {individualData.ingresantesOP} ({individualData.pctRetencionOP}%)
                        </span>
                      </div>
                    </div>
                    <div className="h-[250px] sm:h-[270px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={individualData.dailyEvolution} margin={{ top: 12, right: 12, left: -12, bottom: 4 }}>
                          <defs>
                            <linearGradient id="trainOpGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#10b981" stopOpacity={1}/>
                              <stop offset="100%" stopColor="#047857" stopOpacity={0.4}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(51, 65, 85, 0.4)" vertical={false} />
                          <XAxis dataKey="dia" stroke="#94a3b8" fontSize={11} tickLine={false} tickMargin={6} />
                          <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} />
                          <Tooltip content={<ScorecardChartTooltip unit="alumnos a OP" />} />
                          <Bar dataKey="ingresantesOP" name="Ingresantes a OP" fill="url(#trainOpGrad)" radius={[6, 6, 0, 0]} maxBarSize={32} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* ── 6. CÓMO SE CALIFICA TU CUARTIL (SCORECARD PONDERADO) ── */}
          <Card className="border-slate-800/90 bg-slate-900/80 backdrop-blur-md shadow-xl">
            <CardHeader className="py-2.5 px-3.5 border-b border-slate-800/80 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Award size={14} className="text-amber-400" />
                <CardTitle className="text-xs font-black uppercase tracking-wider text-slate-200">
                  Cómo se Califica tu Cuartil
                </CardTitle>
              </div>
              <span 
                className="px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider border font-mono shadow-md"
                style={{
                  backgroundColor: `${individualData.quartileColor}20`,
                  borderColor: `${individualData.quartileColor}40`,
                  color: individualData.quartileColor
                }}
              >
                {individualData.quartileLabel} (Score: {individualData.score}%)
              </span>
            </CardHeader>
            <CardContent className="p-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs font-medium text-slate-300">
                {activeRole === 'RECLUTADOR' ? (
                  <>
                    <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/90 shadow-inner">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-200">INGRESANTES A LA OPERACIÓN</span>
                        <span className="text-indigo-400 font-mono font-black text-xs">Peso: 40%</span>
                      </div>
                      <p className="text-[10.5px] text-slate-400 mt-1 leading-relaxed">
                        Premia la calidad y persistencia del postulante hasta su ingreso confirmado.
                      </p>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/90 shadow-inner">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-200">Q DÍA 1 (Efectividad)</span>
                        <span className="text-cyan-400 font-mono font-black text-xs">Peso: 30%</span>
                      </div>
                      <p className="text-[10.5px] text-slate-400 mt-1 leading-relaxed">
                        Mide la asistencia efectiva y retención inicial en el primer día de aula.
                      </p>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/90 shadow-inner">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-200">Volumen vs Meta Asignada</span>
                        <span className="text-emerald-400 font-mono font-black text-xs">Peso: 30%</span>
                      </div>
                      <p className="text-[10.5px] text-slate-400 mt-1 leading-relaxed">
                        Evalúa el cumplimiento de la cuota mensual de postulantes requeridos.
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/90 shadow-inner">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-200">INGRESANTES A LA OPERACIÓN</span>
                        <span className="text-emerald-400 font-mono font-black text-xs">Peso: 45%</span>
                      </div>
                      <p className="text-[10.5px] text-slate-400 mt-1 leading-relaxed">
                        Porcentaje de alumnos que completan la capacitación e ingresan a Operación.
                      </p>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/90 shadow-inner">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-200">% Asistencia en Aula</span>
                        <span className="text-cyan-400 font-mono font-black text-xs">Peso: 35%</span>
                      </div>
                      <p className="text-[10.5px] text-slate-400 mt-1 leading-relaxed">
                        Consistencia y presencia diaria de los alumnos asignados al aula.
                      </p>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/90 shadow-inner">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-200">Control de Ausentismo</span>
                        <span className="text-amber-400 font-mono font-black text-xs">Peso: 20%</span>
                      </div>
                      <p className="text-[10.5px] text-slate-400 mt-1 leading-relaxed">
                        Gestión activa para evitar faltas injustificadas en alumnos que siguen activos.
                      </p>
                    </div>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        </>
      ) : (
        <div className="p-8 rounded-2xl bg-slate-900/60 border border-slate-800 text-center space-y-3">
          <AlertTriangle size={32} className="mx-auto text-cyan-400 animate-pulse" />
          <h3 className="text-base font-black text-slate-200">Selecciona un {activeRole.toLowerCase()} para auditar sus KPIs</h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            Utiliza el buscador superior para auditar por DNI, Nombre o Alias, o selecciona uno de los perfiles disponibles en la lista desplegable.
          </p>
        </div>
      )}
    </PageLayout>
  )
}

export default memo(PerformanceScorecardIndividual)
