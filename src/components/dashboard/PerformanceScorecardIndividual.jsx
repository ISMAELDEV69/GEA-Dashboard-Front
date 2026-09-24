import { useState, useMemo, memo, useRef, useEffect, useCallback } from 'react'
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell
} from 'recharts'
import {
  Trophy, Award, Target, Users, UserCheck, Calendar, Sparkles, TrendingUp,
  AlertTriangle, CheckCircle2, Star, Clock, Filter, ArrowUpRight, ArrowDownRight,
  GraduationCap, Briefcase, Zap, HelpCircle, ChevronRight, ChevronDown, ChevronUp,
  Eye, Search, X, Shield, Activity, Layers, PieChart as PieIcon, ListFilter, Download
} from 'lucide-react'
import {
  computeAllRecruitersPerformance,
  getRecruiterIndividualDetails,
  computeAllTrainersPerformance,
  getTrainerIndividualDetails,
  getRecruitersContributionByGroup,
  norm,
  matchPerson,
  formatSemanaLabel
} from '../../lib/performanceScorecardEngine'
import PageLayout from '../ui/PageLayout'
import Card, { CardHeader, CardTitle, CardContent } from '../ui/Card'
import KpiReclutadoresDashboard from './KpiReclutadoresDashboard'
import KpiFormadoresDashboard from './KpiFormadoresDashboard'

// Paleta ejecutiva para gráficos y motivos
const PALETTE_COLORS = ['#6366f1', '#06b6d4', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#3b82f6', '#f43f5e']

// ── Tooltip Ejecutivo para Gráficos Recharts ───────────────────────────────
function ExecutiveChartTooltip({ active, payload, label, unit = '' }) {
  if (!active || !payload || !payload.length) return null
  return (
    <div className="rounded-xl border border-[var(--border-subtle)] bg-slate-900/95 p-3 shadow-2xl backdrop-blur-xl text-xs font-mono">
      <div className="text-cyan-400 font-bold mb-2 border-b border-slate-800 pb-1 flex items-center justify-between gap-3">
        <span>{label}</span>
        <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse" />
      </div>
      {payload.map((entry, idx) => (
        <div key={idx} className="flex items-center justify-between gap-4 text-slate-200 py-0.5">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color || entry.fill }} />
            <span className="text-slate-300 font-medium">{entry.name}:</span>
          </span>
          <span className="font-bold text-white font-mono">
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
  const userRole = String(userProfile?.rol || userProfile?.role || '').toLowerCase()
  const isRecruiterUser = userRole === 'reclutador'
  const isTrainerUser = userRole === 'formador'
  const isSelfLocked = isRecruiterUser || isTrainerUser

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
  const [filterSegmento, setFilterSegmento] = useState('Todos Segmentos')
  const [filterCampana, setFilterCampana] = useState('Todas Campañas')
  const [filterGrupo, setFilterGrupo] = useState('Todos los Grupos')
  const [selectedIdentifier, setSelectedIdentifier] = useState('TODOS')
  const [searchQuery, setSearchQuery] = useState('')
  const [isSearchDropdownOpen, setIsSearchDropdownOpen] = useState(false)
  const [showNominalTable, setShowNominalTable] = useState(false)
  const [nominalSearch, setNominalSearch] = useState('')
  const searchContainerRef = useRef(null)

  // Normalización de períodos a 6 dígitos
  const normalizePeriodo = (raw) => {
    if (!raw) return ''
    const str = String(raw).trim().toUpperCase()
    const m = str.match(/(\d{4})[-_/\s]?(\d{2})/)
    if (m) return `${m[1]}${m[2]}`
    const digits = str.replace(/\D/g, '')
    return digits.length >= 6 ? digits.slice(0, 6) : digits
  }

  // Inferencia y resolución determinística de Segmento oficial
  const resolveSegmento = useCallback((seg, camp) => {
    const s = String(seg || '').trim().toUpperCase()
    if (s && s !== 'GENERAL' && s !== 'NULL' && s !== 'UNDEFINED') return s
    const c = String(camp || '').trim().toUpperCase()
    if (c.includes('LIPIGAS') || c.includes('LIMAGAS')) return 'LIPIGAS'
    if (c.includes('TUVES') || c.includes('CHILE') || c.includes('VTR') || c.includes('BO TÉCNICO')) return 'CLARO CHILE'
    if (c.includes('RETENCIONES FIJA') || c.includes('RETENCION FIJA') || c.includes('FIJA INBOUND')) return 'CLARO PERU'
    if (c.includes('CLARO POSTPAGO')) return 'CLARO PERU'
    if (c.includes('RETENCION') || c.includes('CONTENCI') || c.includes('DESCUENTO') || c.includes('CONTACTADOS') || c.includes('BABYSTING')) return 'CLARO PERU RETENCIONES'
    if (c.includes('OUT') || c.includes('UPGRADE') || c.includes('PREVENTIVA') || c.includes('PORTA') || c.includes('RENOVACION') || c.includes('MIGRA') || c.includes('OLAS')) return 'CLARO PERU OUT'
    return 'CLARO PERU'
  }, [])

  // Resolución de período priorizando PERÍODO DE INGRESO A OPERACIÓN de capacidad_rys
  const getGPeriodo = useCallback((g) => {
    if (!g) return ''
    const directIngreso = normalizePeriodo(g.periodo_ingreso_op || g.periodo_ingreso)
    if (directIngreso && directIngreso.length === 6) return directIngreso

    if (g.fecha_ingreso_op) {
      const fromFechaIngreso = normalizePeriodo(g.fecha_ingreso_op)
      if (fromFechaIngreso && fromFechaIngreso.length === 6) return fromFechaIngreso
    }

    const perGen = normalizePeriodo(g.periodo)
    if (perGen && perGen.length === 6) return perGen
    return ''
  }, [])

  // Mapa de resolución relacional de grupos con clave compuesta (código + campaña)
  const { grupoCompositeMap, grupoCodeMap } = useMemo(() => {
    const compMap = new Map()
    const codeMap = new Map()

    const registerGroup = (code, periodo, segmento, campana, gObj) => {
      const c = norm(code)
      if (!c) return
      const camp = (campana || '').trim().toUpperCase()
      const seg = resolveSegmento(segmento, camp)
      const per = getGPeriodo(gObj) || normalizePeriodo(periodo)

      const entry = { periodo: per, segmento: seg, campana: camp, codigo: c }

      if (camp) {
        compMap.set(`${c}|${norm(camp)}`, entry)
      }
      if (!codeMap.has(c)) {
        codeMap.set(c, entry)
      }
    }

    ;(grupos || []).forEach(g => registerGroup(g.codigo || g.grupo_codigo, g.periodo, g.segmento, g.campana, g))
    ;(campanasMetas || []).forEach(g => registerGroup(g.codigo || g.grupo_codigo || g.codigo_grupo, g.periodo, g.segmento, g.campana_nombre || g.campana, g))

    return { grupoCompositeMap: compMap, grupoCodeMap: codeMap }
  }, [grupos, campanasMetas, resolveSegmento, getGPeriodo])

  const getPPeriodo = useCallback((p) => {
    const gCode = norm(p.grupo_codigo)
    const camp = norm(p.campana)
    if (gCode && camp) {
      const g = grupoCompositeMap.get(`${gCode}|${camp}`)
      if (g && g.periodo) return g.periodo
    }
    if (gCode) {
      const g = grupoCodeMap.get(gCode)
      if (g && g.periodo) return g.periodo
    }

    const directIngreso = normalizePeriodo(p.periodo_ingreso_op || p.periodo_ingreso)
    if (directIngreso && directIngreso.length === 6) return directIngreso

    if (p.fecha_ingreso_op) {
      const fromFechaOP = normalizePeriodo(p.fecha_ingreso_op)
      if (fromFechaOP && fromFechaOP.length === 6) return fromFechaOP
    }

    const direct = normalizePeriodo(p.periodo_reclutado || p.periodo || p.periodo_rys)
    if (direct && direct.length === 6) return direct

    const fromDate = normalizePeriodo(p.fecha_ingreso || p.fecha_registro || p.marca_temporal || p.created_at)
    if (fromDate && fromDate.length === 6) return fromDate
    return ''
  }, [grupoCompositeMap, grupoCodeMap])

  const getPSegmento = useCallback((p) => {
    const gCode = norm(p.grupo_codigo)
    const camp = norm(p.campana)
    if (gCode && camp) {
      const g = grupoCompositeMap.get(`${gCode}|${camp}`)
      if (g && g.segmento) return g.segmento
    }
    if (gCode) {
      const g = grupoCodeMap.get(gCode)
      if (g && g.segmento) return g.segmento
    }
    return resolveSegmento(p.segmento, p.campana)
  }, [grupoCompositeMap, grupoCodeMap, resolveSegmento])

  const getPCampana = useCallback((p) => {
    if (p.campana && p.campana.trim()) return p.campana.trim().toUpperCase()
    const gCode = norm(p.grupo_codigo)
    if (gCode) {
      const g = grupoCodeMap.get(gCode)
      if (g && g.campana) return g.campana
    }
    return 'GENERAL'
  }, [grupoCodeMap])

  // ── Opciones de Filtros en Cascada Estricta ──────────────────────────────
  // 1. Períodos: limitados estrictamente al año en curso (2026)
  const periodosOptions = useMemo(() => {
    const set = new Set()
    grupos.forEach(g => {
      const per = getGPeriodo(g)
      if (per && per.startsWith('2026')) set.add(per)
    })
    campanasMetas.forEach(g => {
      const per = getGPeriodo(g)
      if (per && per.startsWith('2026')) set.add(per)
    })
    postulantes.forEach(p => {
      const per = getPPeriodo(p)
      if (per && per.startsWith('2026')) set.add(per)
    })
    return ['Todos', ...Array.from(set).sort((a, b) => b.localeCompare(a))]
  }, [grupos, campanasMetas, postulantes, getGPeriodo, getPPeriodo])

  // 2. Segmentos disponibles: depende ESTRICTAMENTE de filterPeriodo
  const segmentosOptions = useMemo(() => {
    const set = new Set()
    const matchPer = (per) => filterPeriodo === 'Todos' || per === filterPeriodo

    grupos.forEach(g => {
      const per = getGPeriodo(g)
      if (!matchPer(per)) return
      const camp = (g.campana || '').trim().toUpperCase()
      const seg = resolveSegmento(g.segmento, camp)
      if (seg && seg !== 'GENERAL') set.add(seg)
    })
    campanasMetas.forEach(g => {
      const per = getGPeriodo(g)
      if (!matchPer(per)) return
      const camp = (g.campana_nombre || g.campana || '').trim().toUpperCase()
      const seg = resolveSegmento(g.segmento, camp)
      if (seg && seg !== 'GENERAL') set.add(seg)
    })
    postulantes.forEach(p => {
      const per = getPPeriodo(p)
      if (!matchPer(per)) return
      const seg = getPSegmento(p)
      if (seg && seg !== 'GENERAL') set.add(seg)
    })

    return ['Todos Segmentos', ...Array.from(set).sort()]
  }, [grupos, campanasMetas, postulantes, filterPeriodo, getGPeriodo, getPPeriodo, resolveSegmento, getPSegmento])

  // 3. Campañas disponibles: depende de filterPeriodo Y filterSegmento
  const campanasOptions = useMemo(() => {
    const set = new Set()
    const matchPer = (per) => filterPeriodo === 'Todos' || per === filterPeriodo
    const matchSeg = (seg) => filterSegmento === 'Todos Segmentos' || seg === filterSegmento

    grupos.forEach(g => {
      const per = getGPeriodo(g)
      if (!matchPer(per)) return
      const camp = (g.campana || '').trim().toUpperCase()
      const seg = resolveSegmento(g.segmento, camp)
      if (!matchSeg(seg)) return
      if (camp && camp !== 'GENERAL') set.add(camp)
    })
    campanasMetas.forEach(g => {
      const per = getGPeriodo(g)
      if (!matchPer(per)) return
      const camp = (g.campana_nombre || g.campana || '').trim().toUpperCase()
      const seg = resolveSegmento(g.segmento, camp)
      if (!matchSeg(seg)) return
      if (camp && camp !== 'GENERAL') set.add(camp)
    })
    postulantes.forEach(p => {
      const per = getPPeriodo(p)
      if (!matchPer(per)) return
      const seg = getPSegmento(p)
      if (!matchSeg(seg)) return
      const camp = getPCampana(p)
      if (camp && camp !== 'GENERAL') set.add(camp)
    })

    return ['Todas Campañas', ...Array.from(set).sort()]
  }, [grupos, campanasMetas, postulantes, filterPeriodo, filterSegmento, getGPeriodo, getPPeriodo, resolveSegmento, getPSegmento, getPCampana])

  // 4. Grupos disponibles: depende de filterPeriodo, filterSegmento Y filterCampana
  const gruposOptions = useMemo(() => {
    const set = new Set()
    const matchPer = (per) => filterPeriodo === 'Todos' || per === filterPeriodo
    const matchSeg = (seg) => filterSegmento === 'Todos Segmentos' || seg === filterSegmento
    const matchCamp = (camp) => filterCampana === 'Todas Campañas' || camp === filterCampana

    grupos.forEach(g => {
      const per = getGPeriodo(g)
      if (!matchPer(per)) return
      const camp = (g.campana || '').trim().toUpperCase()
      const seg = resolveSegmento(g.segmento, camp)
      if (!matchSeg(seg)) return
      if (!matchCamp(camp)) return
      const code = (g.codigo || g.grupo_codigo || '').trim().toUpperCase()
      if (code) set.add(code)
    })
    campanasMetas.forEach(g => {
      const per = getGPeriodo(g)
      if (!matchPer(per)) return
      const camp = (g.campana_nombre || g.campana || '').trim().toUpperCase()
      const seg = resolveSegmento(g.segmento, camp)
      if (!matchSeg(seg)) return
      if (!matchCamp(camp)) return
      const code = (g.grupo_codigo || g.codigo || g.codigo_grupo || '').trim().toUpperCase()
      if (code) set.add(code)
    })
    postulantes.forEach(p => {
      const per = getPPeriodo(p)
      if (!matchPer(per)) return
      const seg = getPSegmento(p)
      if (!matchSeg(seg)) return
      const camp = getPCampana(p)
      if (!matchCamp(camp)) return
      if (p.grupo_codigo && p.grupo_codigo.trim()) set.add(p.grupo_codigo.trim().toUpperCase())
    })

    return ['Todos los Grupos', ...Array.from(set).sort()]
  }, [grupos, campanasMetas, postulantes, filterPeriodo, filterSegmento, filterCampana, getGPeriodo, getPPeriodo, resolveSegmento, getPSegmento, getPCampana])

  // Auto-resets dependientes en cascada
  const prevPeriodoRef = useRef(filterPeriodo)
  useEffect(() => {
    if (prevPeriodoRef.current !== filterPeriodo) {
      prevPeriodoRef.current = filterPeriodo
      if (filterSegmento !== 'Todos Segmentos' && !segmentosOptions.includes(filterSegmento)) {
        setFilterSegmento('Todos Segmentos')
      }
      if (filterCampana !== 'Todas Campañas' && !campanasOptions.includes(filterCampana)) {
        setFilterCampana('Todas Campañas')
      }
      if (filterGrupo !== 'Todos los Grupos' && !gruposOptions.includes(filterGrupo)) {
        setFilterGrupo('Todos los Grupos')
      }
    }
  }, [filterPeriodo, filterSegmento, filterCampana, filterGrupo, segmentosOptions, campanasOptions, gruposOptions])

  const prevSegmentoRef = useRef(filterSegmento)
  useEffect(() => {
    if (prevSegmentoRef.current !== filterSegmento) {
      prevSegmentoRef.current = filterSegmento
      if (filterCampana !== 'Todas Campañas' && !campanasOptions.includes(filterCampana)) {
        setFilterCampana('Todas Campañas')
      }
      if (filterGrupo !== 'Todos los Grupos' && !gruposOptions.includes(filterGrupo)) {
        setFilterGrupo('Todos los Grupos')
      }
    }
  }, [filterSegmento, filterCampana, filterGrupo, campanasOptions, gruposOptions])

  const prevCampanaRef = useRef(filterCampana)
  useEffect(() => {
    if (prevCampanaRef.current !== filterCampana) {
      prevCampanaRef.current = filterCampana
      if (filterGrupo !== 'Todos los Grupos' && !gruposOptions.includes(filterGrupo)) {
        setFilterGrupo('Todos los Grupos')
      }
    }
  }, [filterCampana, filterGrupo, gruposOptions])

  // Helpers de validación de filtros activos
  const isPeriodoAll = useCallback((p) => !p || p === 'Todos' || p === 'Todos los Períodos', [])
  const isSegmentoAll = useCallback((s) => !s || s === 'Todos' || s === 'Todos Segmentos', [])
  const isCampanaAll = useCallback((c) => !c || c === 'Todos' || c === 'Todas Campañas' || c === 'Todas', [])
  const isGrupoAll = useCallback((g) => !g || g === 'Todos' || g === 'Todos los Grupos', [])

  // Filtrado de Datos Base
  const filteredPostulantes = useMemo(() => {
    return postulantes.filter(p => {
      if (!isPeriodoAll(filterPeriodo) && getPPeriodo(p) !== filterPeriodo) return false
      if (!isSegmentoAll(filterSegmento) && getPSegmento(p) !== filterSegmento) return false
      if (!isCampanaAll(filterCampana) && getPCampana(p) !== filterCampana) return false
      if (!isGrupoAll(filterGrupo) && (p.grupo_codigo || '').trim().toUpperCase() !== filterGrupo) return false
      return true
    })
  }, [postulantes, filterPeriodo, filterSegmento, filterCampana, filterGrupo, getPPeriodo, getPSegmento, getPCampana, isPeriodoAll, isSegmentoAll, isCampanaAll, isGrupoAll])

  const filteredGrupos = useMemo(() => {
    return grupos.filter(g => {
      if (!isPeriodoAll(filterPeriodo)) {
        const per = getGPeriodo(g)
        if (per && per !== filterPeriodo) return false
      }
      const camp = (g.campana || '').trim().toUpperCase()
      const seg = resolveSegmento(g.segmento, camp)
      if (!isSegmentoAll(filterSegmento) && seg !== filterSegmento) return false
      if (!isCampanaAll(filterCampana) && camp !== filterCampana) return false
      if (!isGrupoAll(filterGrupo)) {
        const code = (g.codigo || g.grupo_codigo || '').trim().toUpperCase()
        if (code !== filterGrupo) return false
      }
      return true
    })
  }, [grupos, filterPeriodo, filterSegmento, filterCampana, filterGrupo, isPeriodoAll, isSegmentoAll, isCampanaAll, isGrupoAll, getGPeriodo, resolveSegmento])

  const filteredCampanasMetas = useMemo(() => {
    return campanasMetas.filter(g => {
      if (!isPeriodoAll(filterPeriodo)) {
        const per = getGPeriodo(g)
        if (per && per !== filterPeriodo) return false
      }
      const camp = (g.campana_nombre || g.campana || '').trim().toUpperCase()
      const seg = resolveSegmento(g.segmento, camp)
      if (!isSegmentoAll(filterSegmento) && seg !== filterSegmento) return false
      if (!isCampanaAll(filterCampana) && camp !== filterCampana) return false
      if (!isGrupoAll(filterGrupo)) {
        const code = (g.grupo_codigo || g.codigo || g.codigo_grupo || '').trim().toUpperCase()
        if (code !== filterGrupo) return false
      }
      return true
    })
  }, [campanasMetas, filterPeriodo, filterSegmento, filterCampana, filterGrupo, isPeriodoAll, isSegmentoAll, isCampanaAll, isGrupoAll, getGPeriodo, resolveSegmento])

  const filteredAsistencias = useMemo(() => {
    const validGroupCodes = new Set(filteredGrupos.map(g => norm(g.codigo || g.grupo_codigo)).filter(Boolean))
    const validPostulanteDocs = new Set(filteredPostulantes.map(p => p.documento).filter(Boolean))

    return asistencias.filter(a => {
      const gCode = norm(a.codigo_grupo || a.grupo || a.grupo_codigo)
      const doc = a.postulante_documento || a.documento
      const camp = (a.campana || '').trim().toUpperCase()
      const seg = resolveSegmento(a.segmento, camp)

      // 1. Filtro estricto de Grupo
      if (!isGrupoAll(filterGrupo)) {
        if (gCode !== norm(filterGrupo)) return false
      }

      // 2. Filtro estricto de Campaña
      if (!isCampanaAll(filterCampana)) {
        if (camp !== filterCampana) return false
      }

      // 3. Filtro estricto de Segmento
      if (!isSegmentoAll(filterSegmento)) {
        if (seg !== filterSegmento) return false
      }

      // 4. Filtro de Período y Coherencia de Grupos/Postulantes
      if (!isPeriodoAll(filterPeriodo)) {
        if (gCode && validGroupCodes.size > 0 && !validGroupCodes.has(gCode) && !validPostulanteDocs.has(doc)) {
          return false
        }
      }

      return true
    })
  }, [asistencias, filteredGrupos, filteredPostulantes, filterCampana, filterSegmento, filterGrupo, filterPeriodo, isGrupoAll, isCampanaAll, isSegmentoAll, isPeriodoAll, resolveSegmento])

  // Motor Analítico
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

  const rankedTrainers = useMemo(() => {
    return computeAllTrainersPerformance(
      filteredPostulantes,
      filteredAsistencias,
      filteredGrupos,
      formadores
    )
  }, [filteredPostulantes, filteredAsistencias, filteredGrupos, formadores])

  const activePersonList = activeRole === 'RECLUTADOR' ? rankedRecruiters : rankedTrainers

  const currentTargetIdentifier = useMemo(() => {
    if (isSelfLocked && selfIdentifier) {
      const selfMatch = activePersonList.find(p => 
        matchPerson(p.nombre, selfIdentifier) || 
        (p.dni && p.dni === selfIdentifier) || 
        (p.usuario && norm(p.usuario) === norm(selfIdentifier))
      )
      if (selfMatch) return selfMatch.nombre
    }
    if (!selectedIdentifier || selectedIdentifier === 'TODOS' || selectedIdentifier === 'ALL') {
      return 'TODOS'
    }
    const match = activePersonList.find(p => 
      norm(p.nombre) === norm(selectedIdentifier) || 
      norm(p.dni) === norm(selectedIdentifier) || 
      norm(p.usuario) === norm(selectedIdentifier)
    )
    if (match) return match.nombre
    return 'TODOS'
  }, [isSelfLocked, selfIdentifier, selectedIdentifier, activePersonList])

  useEffect(() => {
    if (selectedIdentifier !== 'TODOS' && activePersonList.length > 0) {
      const exists = activePersonList.some(p => norm(p.nombre) === norm(selectedIdentifier))
      if (!exists) {
        setSelectedIdentifier('TODOS')
      }
    }
  }, [activePersonList, selectedIdentifier])

  // Detalle individual o consolidado
  const individualData = useMemo(() => {
    if (!currentTargetIdentifier) return null
    if (activeRole === 'RECLUTADOR') {
      return getRecruiterIndividualDetails(
        currentTargetIdentifier, 
        filteredPostulantes, 
        filteredAsistencias, 
        rankedRecruiters, 
        filteredCampanasMetas,
        attendanceIndexes
      )
    } else {
      return getTrainerIndividualDetails(
        currentTargetIdentifier, 
        filteredAsistencias, 
        rankedTrainers, 
        filteredGrupos, 
        filteredPostulantes
      )
    }
  }, [activeRole, currentTargetIdentifier, filteredPostulantes, filteredAsistencias, rankedRecruiters, rankedTrainers, filteredCampanasMetas, filteredGrupos, attendanceIndexes])

  // Trazabilidad y aportación de reclutadores al grupo/campaña activa
  const recruitersContribution = useMemo(() => {
    if (activeRole !== 'RECLUTADOR') return []
    return getRecruitersContributionByGroup(
      filteredPostulantes,
      filteredAsistencias,
      reclutadores,
      formadores
    )
  }, [activeRole, filteredPostulantes, filteredAsistencias, reclutadores, formadores])

  // Buscador de colaboradores
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return activePersonList.slice(0, 15)
    const q = norm(searchQuery)
    return activePersonList.filter(p => {
      const matchName = norm(p.nombre).includes(q)
      const matchDni = norm(p.dni).includes(q)
      const matchUser = norm(p.usuario).includes(q)
      return matchName || matchDni || matchUser
    })
  }, [activePersonList, searchQuery])

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target)) {
        setIsSearchDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Filtrado de la tabla nominal
  const filteredNominalRows = useMemo(() => {
    if (!individualData) return []
    const rows = activeRole === 'RECLUTADOR' 
      ? (individualData.postulantesNominal || [])
      : (individualData.alumnosNominal || [])
    
    if (!nominalSearch.trim()) return rows
    const q = norm(nominalSearch)
    return rows.filter(r => 
      norm(r.nombre_completo).includes(q) ||
      norm(r.documento).includes(q) ||
      norm(r.campana).includes(q) ||
      norm(r.grupo_codigo).includes(q) ||
      norm(r.estado).includes(q)
    )
  }, [individualData, activeRole, nominalSearch])

  return (
    <PageLayout className="h-full overflow-y-auto flex flex-col gap-4 p-4 sm:p-6 w-full custom-scrollbar bg-[var(--surface-ground)]">
      
      {/* ── 1. BARRA DE CONTROL Y FILTROS EN CASCADA ── */}
      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] px-3 py-1 rounded-xl">
        <div className="flex flex-wrap items-center justify-between gap-2">
          
          {isSelfLocked ? (
            <span className="text-[11px] font-semibold text-[var(--accent)] px-2 py-1">
              {isRecruiterUser ? 'Mis indicadores' : 'Mi formación'}
            </span>
          ) : (
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => {
                setActiveRole('RECLUTADOR')
                setSelectedIdentifier('')
                setSearchQuery('')
              }}
              className={`flex items-center gap-1 rounded-md font-semibold transition-all cursor-pointer select-none text-[11px] px-2 py-1 ${
                activeRole === 'RECLUTADOR'
                  ? 'text-[var(--accent)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              <Users size={12} />
              <span>Reclutadores</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveRole('FORMADOR')
                setSelectedIdentifier('')
                setSearchQuery('')
              }}
              className={`flex items-center gap-1 rounded-md font-semibold transition-all cursor-pointer select-none text-[11px] px-2 py-1 ${
                activeRole === 'FORMADOR'
                  ? 'text-[var(--accent)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              <GraduationCap size={12} />
              <span>Formadores</span>
            </button>
          </div>
          )}

          {false && (
          <div className="flex flex-wrap items-center gap-2">
            {/* Período */}
            <div className="flex items-center gap-1.5 bg-slate-900/60 border border-slate-800 rounded-xl px-3 py-1.5 text-xs">
              <Calendar size={13} className="text-cyan-400" />
              <span className="text-[10px] font-bold text-slate-400 uppercase">Período:</span>
              <select
                value={filterPeriodo}
                onChange={(e) => {
                  setFilterPeriodo(e.target.value)
                  setSelectedIdentifier('TODOS')
                }}
                className="bg-transparent font-bold text-slate-100 outline-none cursor-pointer"
              >
                {periodosOptions.map(p => (
                  <option key={p} value={p} className="bg-slate-900 text-slate-100">{p}</option>
                ))}
              </select>
            </div>

            {/* Segmento */}
            <div className="flex items-center gap-1.5 bg-slate-900/60 border border-slate-800 rounded-xl px-3 py-1.5 text-xs">
              <Filter size={13} className="text-indigo-400" />
              <span className="text-[10px] font-bold text-slate-400 uppercase">Segmento:</span>
              <select
                value={filterSegmento}
                onChange={(e) => {
                  setFilterSegmento(e.target.value)
                  setSelectedIdentifier('TODOS')
                }}
                className="bg-transparent font-bold text-slate-100 outline-none cursor-pointer max-w-[130px] truncate"
              >
                {segmentosOptions.map(s => (
                  <option key={s} value={s} className="bg-slate-900 text-slate-100">{s}</option>
                ))}
              </select>
            </div>

            {/* Campaña */}
            <div className="flex items-center gap-1.5 bg-slate-900/60 border border-slate-800 rounded-xl px-3 py-1.5 text-xs">
              <Briefcase size={13} className="text-emerald-400" />
              <span className="text-[10px] font-bold text-slate-400 uppercase">Campaña:</span>
              <select
                value={filterCampana}
                onChange={(e) => {
                  setFilterCampana(e.target.value)
                  setSelectedIdentifier('TODOS')
                }}
                className="bg-transparent font-bold text-slate-100 outline-none cursor-pointer max-w-[140px] truncate"
              >
                {campanasOptions.map(c => (
                  <option key={c} value={c} className="bg-slate-900 text-slate-100">{c}</option>
                ))}
              </select>
            </div>

            {/* Grupo */}
            <div className="flex items-center gap-1.5 bg-slate-900/60 border border-slate-800 rounded-xl px-3 py-1.5 text-xs">
              <Layers size={13} className="text-purple-400" />
              <span className="text-[10px] font-bold text-slate-400 uppercase">Grupo:</span>
              <select
                value={filterGrupo}
                onChange={(e) => {
                  setFilterGrupo(e.target.value)
                  setSelectedIdentifier('TODOS')
                }}
                className="bg-transparent font-bold text-slate-100 outline-none cursor-pointer max-w-[140px] truncate"
              >
                {gruposOptions.map(g => (
                  <option key={g} value={g} className="bg-slate-900 text-slate-100">{g}</option>
                ))}
              </select>
            </div>
          </div>
          )}
        </div>

        {false && activeRole === 'FORMADOR' && (
        <div className="pt-3 border-t border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-1 min-w-[280px]">
            <span className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5 shrink-0">
              <Award size={15} className="text-cyan-400" />
              {activeRole === 'RECLUTADOR' ? 'Reclutador:' : 'Formador:'}
            </span>

            {isSelfLocked ? (
              <div className="flex-1 px-3 py-1.5 rounded-xl bg-slate-900/60 border border-slate-800 text-xs font-bold text-indigo-300 flex items-center justify-between">
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
                className="flex-1 h-9 px-3 bg-slate-900/80 border border-slate-700 hover:border-cyan-500 rounded-xl text-xs font-bold text-slate-100 outline-none cursor-pointer transition-colors"
              >
                <option value="TODOS" className="bg-slate-900 text-cyan-300 font-bold">
                  {activeRole === 'RECLUTADOR' 
                    ? `[ TODOS LOS RECLUTADORES (CONSOLIDADO) ] • ${filteredPostulantes.length} postulantes` 
                    : `[ TODOS LOS FORMADORES (CONSOLIDADO) ] • ${filteredGrupos.length} aulas`}
                </option>
                {activePersonList.map((person) => (
                  <option key={person.nombre} value={person.nombre} className="bg-slate-900 text-slate-100">
                    {person.nombre} • {activeRole === 'RECLUTADOR' 
                      ? `${person.totalPostulantes} postulantes (${person.qDia1} Día 1 • ${person.ingresantesOP} a OP)` 
                      : `${person.totalAlumnos} alumnos (${person.pctAsistencia}% Asist. • ${person.ingresantesOP} a OP)`}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Buscador Rápido por DNI o Nombre */}
          {!isSelfLocked && (
            <div ref={searchContainerRef} className="relative w-full sm:w-72">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Buscar por nombre o DNI..."
                  value={searchQuery}
                  onFocus={() => setIsSearchDropdownOpen(true)}
                  onChange={(e) => {
                    setSearchQuery(e.target.value)
                    setIsSearchDropdownOpen(true)
                  }}
                  className="w-full h-9 pl-8 pr-8 bg-slate-900/80 border border-slate-700 hover:border-cyan-500 rounded-xl text-xs font-medium text-slate-100 placeholder-slate-500 outline-none transition-colors"
                />
                <Search size={13} className="absolute left-2.5 top-2.5 text-slate-400" />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-2.5 text-slate-500 hover:text-slate-300 cursor-pointer"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>

              {isSearchDropdownOpen && (
                <div className="absolute top-10 left-0 right-0 z-50 max-h-60 overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 shadow-2xl p-1 space-y-1 custom-scrollbar">
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
                        className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-slate-800 text-left transition-colors cursor-pointer"
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-200 truncate">{person.nombre}</p>
                          <p className="text-[10px] text-slate-400 font-mono">
                            {person.dni ? `DNI: ${person.dni} • ` : ''}
                            {activeRole === 'RECLUTADOR' 
                              ? `${person.totalPostulantes} postulantes` 
                              : `${person.totalAlumnos} alumnos`}
                          </p>
                        </div>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold font-mono text-cyan-400 bg-cyan-500/10 border border-cyan-500/20">
                          {person.qDia1 ?? person.asistenciasEfectivas} Día 1 • {person.ingresantesOP} OP
                        </span>
                      </button>
                    ))
                  ) : (
                    <div className="p-3 text-center text-xs text-slate-500">Sin coincidencias</div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
        )}
      </div>

      {activeRole === 'RECLUTADOR' ? (
        <KpiReclutadoresDashboard userProfile={userProfile} />
      ) : (
        <KpiFormadoresDashboard
          postulantes={postulantes}
          asistencias={asistencias}
          grupos={grupos}
          campanasMetas={campanasMetas}
          userProfile={userProfile}
        />
      )}
      {false && individualData ? (
        <>
          {/* ── 2. HERO CARD: IDENTIDAD Y DESEMPEÑO OPERATIVO ── */}
          <div className="bg-[var(--surface)] p-5 rounded-2xl border border-[var(--border-subtle)] shadow-md flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-tr from-cyan-600 to-indigo-600 text-white font-black text-xl shadow-lg">
                {individualData.isConsolidated ? (
                  <Layers size={26} />
                ) : (
                  individualData.nombre.slice(0, 2).toUpperCase()
                )}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-lg sm:text-xl font-black text-[var(--text-primary)] uppercase">
                    {individualData.nombre}
                  </h1>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                    individualData.isConsolidated
                      ? 'bg-cyan-500/15 border border-cyan-500/30 text-cyan-400'
                      : 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-400'
                  }`}>
                    {individualData.isConsolidated ? 'Vista Consolidada' : 'Activo'}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-secondary)] mt-1">
                  {individualData.isConsolidated ? (
                    <span>
                      Filtros activos: <strong className="text-cyan-400">{filterCampana}</strong> • Grupo: <strong className="text-purple-400">{filterGrupo}</strong> • Período: <strong className="text-indigo-400">{filterPeriodo}</strong>
                    </span>
                  ) : (
                    <>
                      <span>Rol: <strong className="text-[var(--text-primary)]">{activeRole === 'RECLUTADOR' ? 'Especialista de RyS' : 'Formador Titular'}</strong></span>
                      {individualData.dni && (
                        <>
                          <span>•</span>
                          <span>DNI: <strong className="font-mono text-cyan-400">{individualData.dni}</strong></span>
                        </>
                      )}
                      <span>•</span>
                      <span>Segmento: <strong className="text-indigo-400">{individualData.segmento || 'General'}</strong></span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Badges de Métricas Operativas (Sin rankings ni categorías forzadas) */}
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="px-3.5 py-2 rounded-xl bg-slate-900/70 border border-slate-800 text-center min-w-[95px]">
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">
                  {activeRole === 'RECLUTADOR' ? 'Grupos / Cohortes' : 'Aulas Asignadas'}
                </span>
                <span className="text-base font-black font-mono text-white">
                  {activeRole === 'RECLUTADOR' 
                    ? (individualData.gruposAsignadosCount || individualData.gruposBreakdown?.length || 0)
                    : (individualData.gruposCount || individualData.gruposBreakdown?.length || 0)}
                </span>
              </div>

              <div className="px-3.5 py-2 rounded-xl bg-cyan-500/10 border border-cyan-500/25 text-center min-w-[95px]">
                <span className="text-[9px] font-bold text-cyan-300 uppercase tracking-wider block">
                  {activeRole === 'RECLUTADOR' ? 'Efect. Día 1' : '% Asistencia'}
                </span>
                <span className="text-base font-black font-mono text-cyan-400">
                  {activeRole === 'RECLUTADOR' ? `${individualData.pctQDia1}%` : `${individualData.pctAsistencia}%`}
                </span>
              </div>

              <div className="px-3.5 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-center min-w-[95px]">
                <span className="text-[9px] font-bold text-emerald-300 uppercase tracking-wider block">
                  {activeRole === 'RECLUTADOR' ? 'Conv. a OP' : 'Pases a OP'}
                </span>
                <span className="text-base font-black font-mono text-emerald-400">
                  {activeRole === 'RECLUTADOR' ? `${individualData.pctConversionOP}%` : `${individualData.pctRetencionOP}%`}
                </span>
              </div>

              <div className="px-3.5 py-2 rounded-xl bg-rose-500/10 border border-rose-500/25 text-center min-w-[95px]">
                <span className="text-[9px] font-bold text-rose-300 uppercase tracking-wider block">
                  {activeRole === 'RECLUTADOR' ? 'Tasa Bajas' : 'Ausentismo'}
                </span>
                <span className="text-base font-black font-mono text-rose-400">
                  {activeRole === 'RECLUTADOR' 
                    ? `${individualData.pctBajas ?? (individualData.totalPostulantes > 0 ? Math.round((individualData.bajas / individualData.totalPostulantes) * 100) : 0)}%` 
                    : `${individualData.pctAusentismo}%`}
                </span>
              </div>
            </div>
          </div>

          {/* ── 3. TARJETAS DE KPIS PRINCIPALES (4 HERO KPIS) ── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {activeRole === 'RECLUTADOR' ? (
              <>
                <div className="p-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface)] flex flex-col justify-between shadow-sm">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Postulantes Citados</span>
                  <span className="text-3xl font-black text-indigo-400 font-mono mt-1">
                    {individualData.totalPostulantes}
                  </span>
                  <span className="text-[10px] text-slate-500 mt-1">
                    {individualData.hasExplicitMeta ? `Meta asignada: ${individualData.metaVolumen}` : 'Volumen registrado en período'}
                  </span>
                </div>

                <div className="p-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface)] flex flex-col justify-between shadow-sm">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-400">Q Día 1 (Asistieron)</span>
                  <span className="text-3xl font-black text-cyan-400 font-mono mt-1">
                    {individualData.qDia1}
                  </span>
                  <span className="text-[10px] text-cyan-400/80 font-bold mt-1">
                    {individualData.pctQDia1}% de efectividad de citación
                  </span>
                </div>

                <div className="p-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface)] flex flex-col justify-between shadow-sm">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">Ingresantes a Operación (OP)</span>
                  <span className="text-3xl font-black text-emerald-400 font-mono mt-1">
                    {individualData.ingresantesOP}
                  </span>
                  <span className="text-[10px] text-emerald-400/80 font-bold mt-1">
                    {individualData.pctConversionOP}% de conversión sobre Día 1
                  </span>
                </div>

                <div className="p-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface)] flex flex-col justify-between shadow-sm">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-rose-400">Bajas Totales</span>
                  <span className="text-3xl font-black text-rose-400 font-mono mt-1">
                    {individualData.bajas}
                  </span>
                  <span className="text-[10px] text-rose-400/80 font-bold mt-1">
                    {individualData.bajasImputables} imputables ({individualData.pctBajasImputables}%)
                  </span>
                </div>
              </>
            ) : (
              <>
                <div className="p-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface)] flex flex-col justify-between shadow-sm">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Alumnos Gestionados</span>
                  <span className="text-3xl font-black text-indigo-400 font-mono mt-1">
                    {individualData.totalAlumnos}
                  </span>
                  <span className="text-[10px] text-slate-500 mt-1">
                    {individualData.gruposCount} {individualData.gruposCount === 1 ? 'aula asignada' : 'aulas asignadas'}
                  </span>
                </div>

                <div className="p-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface)] flex flex-col justify-between shadow-sm">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-400">% Asistencia en Aula</span>
                  <span className="text-3xl font-black text-cyan-400 font-mono mt-1">
                    {individualData.pctAsistencia}%
                  </span>
                  <span className="text-[10px] text-cyan-400/80 font-bold mt-1">
                    {individualData.asistenciasEfectivas} asistencias efectivas registradas
                  </span>
                </div>

                <div className="p-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface)] flex flex-col justify-between shadow-sm">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">Graduados a Operación (OP)</span>
                  <span className="text-3xl font-black text-emerald-400 font-mono mt-1">
                    {individualData.ingresantesOP}
                  </span>
                  <span className="text-[10px] text-emerald-400/80 font-bold mt-1">
                    {individualData.pctRetencionOP}% retención a producción
                  </span>
                </div>

                <div className="p-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface)] flex flex-col justify-between shadow-sm">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400">Ausentismo (Faltas)</span>
                  <span className="text-3xl font-black text-amber-400 font-mono mt-1">
                    {individualData.ausentismoCount}
                  </span>
                  <span className="text-[10px] text-amber-400/80 font-bold mt-1">
                    {individualData.pctAusentismo}% tasa de inasistencia activa
                  </span>
                </div>
              </>
            )}
          </div>

          {/* ── 4. GRÁFICOS DE ALTO IMPACTO: FUNNEL + EVOLUCIÓN POR SEMANAS ── */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            
            {/* GRÁFICO 1: FUNNEL DE CONVERSIÓN VISUAL (EMBUDO OPERATIVO) (5 cols) */}
            <div className="lg:col-span-5 bg-[var(--surface)] p-5 rounded-2xl border border-[var(--border-subtle)] shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
                  <div className="flex items-center gap-2">
                    <TrendingUp size={16} className="text-cyan-400" />
                    <h3 className="text-xs font-black uppercase tracking-wider text-[var(--text-primary)]">
                      {activeRole === 'RECLUTADOR' ? 'Embudo de Reclutamiento (Funnel)' : 'Embudo de Retención en Formación'}
                    </h3>
                  </div>
                  <span className="text-[10px] font-mono text-slate-400 font-bold">Conversión Real</span>
                </div>

                {/* Pasos del Funnel */}
                <div className="mt-4 space-y-3.5">
                  {individualData.funnel.map((step, idx) => (
                    <div key={idx} className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-[var(--text-primary)] flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: step.color }} />
                          {step.stage}
                        </span>
                        <span className="font-mono font-bold text-white">
                          {step.count} <span className="text-slate-400 text-[10px] font-normal">({step.pct}%)</span>
                        </span>
                      </div>

                      {/* Barra de progreso visual con caída */}
                      <div className="h-3 w-full rounded-full bg-slate-800/80 overflow-hidden p-0.5 border border-slate-700/50">
                        <div 
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${Math.min(100, Math.max(5, step.pct))}%`,
                            backgroundColor: step.color
                          }}
                        />
                      </div>

                      <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono">
                        <span>{step.subtext}</span>
                        {step.dropCount > 0 && (
                          <span className="text-rose-400 flex items-center gap-0.5">
                            <ArrowDownRight size={11} />
                            Fuga: -{step.dropCount} ({step.dropPct}%)
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-[var(--border-subtle)] text-[11px] text-slate-400 flex items-center justify-between">
                <span>Conversión a Operación (sobre Día 1):</span>
                <span className="font-mono font-bold text-emerald-400 text-xs">
                  {activeRole === 'RECLUTADOR' ? `${individualData.pctConversionOP}% a Operación` : `${individualData.pctRetencionOP}% a Operación`}
                </span>
              </div>
            </div>

            {/* GRÁFICO 2: EVOLUCIÓN POR SEMANAS OPERATIVAS (7 cols) */}
            <div className="lg:col-span-7 bg-[var(--surface)] p-5 rounded-2xl border border-[var(--border-subtle)] shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
                  <div className="flex items-center gap-2">
                    <Calendar size={16} className="text-indigo-400" />
                    <h3 className="text-xs font-black uppercase tracking-wider text-[var(--text-primary)]">
                      Evolución por Semanas Operativas (Cohortes Reales)
                    </h3>
                  </div>
                  <span className="text-[10px] font-mono text-slate-400 font-bold">Semana a Semana</span>
                </div>

                <div className="h-[250px] w-full mt-4">
                  <ResponsiveContainer width="100%" height="100%">
                    {activeRole === 'RECLUTADOR' ? (
                      <BarChart data={individualData.weeklyEvolution} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(51, 65, 85, 0.3)" vertical={false} />
                        <XAxis dataKey="semana" stroke="#94a3b8" fontSize={11} tickLine={false} />
                        <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} />
                        <Tooltip content={<ExecutiveChartTooltip unit="postulantes" />} />
                        <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                        <Bar dataKey="postulantes" name="Postulantes" fill="#6366f1" radius={[4, 4, 0, 0]} maxBarSize={28} />
                        <Bar dataKey="qDia1" name="Q Día 1" fill="#06b6d4" radius={[4, 4, 0, 0]} maxBarSize={28} />
                        <Bar dataKey="ingresantesOP" name="Ingreso a OP" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={28} />
                      </BarChart>
                    ) : (
                      <BarChart data={individualData.weeklyEvolution} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(51, 65, 85, 0.3)" vertical={false} />
                        <XAxis dataKey="semana" stroke="#94a3b8" fontSize={11} tickLine={false} />
                        <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} />
                        <Tooltip content={<ExecutiveChartTooltip unit="asistencias" />} />
                        <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                        <Bar dataKey="asistenciasEfectivas" name="Presentes" fill="#06b6d4" radius={[4, 4, 0, 0]} maxBarSize={28} />
                        <Bar dataKey="faltas" name="Faltas" fill="#f59e0b" radius={[4, 4, 0, 0]} maxBarSize={28} />
                        <Bar dataKey="bajas" name="Bajas Aula" fill="#f43f5e" radius={[4, 4, 0, 0]} maxBarSize={28} />
                        <Bar dataKey="ingresantesOP" name="Pases a OP" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={28} />
                      </BarChart>
                    )}
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="pt-2 border-t border-[var(--border-subtle)] text-[10px] text-slate-400 flex items-center justify-between font-mono">
                <span>{individualData.weeklyEvolution.length} semanas registradas en el período</span>
                <span>Datos agregados en tiempo real</span>
              </div>
            </div>
          </div>

          {/* ── 4.5. APORTACIÓN Y COMPARATIVA DE RECLUTADORES EN EL GRUPO/COHORTE (EXCLUSIVO RECLUTAMIENTO) ── */}
          {activeRole === 'RECLUTADOR' && recruitersContribution.length > 0 && (
            <div className="bg-[var(--surface)] p-5 rounded-2xl border border-[var(--border-subtle)] shadow-sm space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[var(--border-subtle)]">
                <div className="flex items-center gap-2">
                  <Users size={18} className="text-cyan-400" />
                  <div>
                    <h3 className="text-xs font-black uppercase tracking-wider text-[var(--text-primary)]">
                      Aportación de Reclutadores en {filterGrupo !== 'Todos los Grupos' ? `el Grupo ${filterGrupo}` : (filterCampana !== 'Todas Campañas' ? `la Campaña ${filterCampana}` : 'el Período Seleccionado')}
                    </h3>
                    <p className="text-[10px] text-slate-400">
                      Trazabilidad de nóminas enviadas, asistencia al Día 1 y graduación a producción por cada reclutador
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-[11px] font-mono">
                  <span className="px-2.5 py-1 rounded-lg bg-slate-900/80 border border-slate-800 text-cyan-300 font-bold">
                    {recruitersContribution.length} {recruitersContribution.length === 1 ? 'reclutador aportante' : 'reclutadores aportantes'}
                  </span>
                  <span className="px-2.5 py-1 rounded-lg bg-slate-900/80 border border-slate-800 text-emerald-300 font-bold">
                    {recruitersContribution.reduce((acc, r) => acc + r.totalCitados, 0)} postulantes enviados
                  </span>
                </div>
              </div>

              {/* Gráfica de Alto Impacto: Citados vs Día 1 vs OP */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[11px] text-slate-300 font-bold">
                  <span>Comparativa Visual de Rendimiento (Top 10 Reclutadores)</span>
                  <span className="text-[10px] text-slate-400 font-mono">Barras por volumen y conversión</span>
                </div>
                <div className="h-[250px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart 
                      data={recruitersContribution.slice(0, 10)} 
                      margin={{ top: 10, right: 10, left: -20, bottom: 25 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(51, 65, 85, 0.3)" vertical={false} />
                      <XAxis 
                        dataKey="reclutador" 
                        stroke="#94a3b8" 
                        fontSize={10} 
                        tickLine={false} 
                        interval={0}
                        angle={-20}
                        textAnchor="end"
                      />
                      <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} />
                      <Tooltip content={<ExecutiveChartTooltip unit="postulantes" />} />
                      <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '15px' }} />
                      <Bar dataKey="totalCitados" name="Citados (Nómina)" fill="#6366f1" radius={[4, 4, 0, 0]} maxBarSize={24} />
                      <Bar dataKey="qDia1" name="Asistieron Día 1" fill="#06b6d4" radius={[4, 4, 0, 0]} maxBarSize={24} />
                      <Bar dataKey="ingresantesOP" name="Graduados a OP" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={24} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Tabla Detallada de Trazabilidad */}
              <div className="overflow-x-auto rounded-xl border border-slate-800 custom-scrollbar">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-900 sticky top-0 text-[10px] font-black uppercase text-slate-400 tracking-wider">
                    <tr>
                      <th className="py-2.5 px-3">#</th>
                      <th className="py-2.5 px-3">Reclutador</th>
                      <th className="py-2.5 px-2 text-center">Citados</th>
                      <th className="py-2.5 px-2 text-center">Asistieron D1</th>
                      <th className="py-2.5 px-2 text-center">% Asist. D1</th>
                      <th className="py-2.5 px-2 text-center">Pase a OP</th>
                      <th className="py-2.5 px-2 text-center">% Conv. OP</th>
                      <th className="py-2.5 px-2 text-center">Bajas</th>
                      <th className="py-2.5 px-3 text-center">Efectividad BPO</th>
                      <th className="py-2.5 px-3 text-center">Ficha 360°</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 font-mono">
                    {recruitersContribution.map((r, idx) => (
                      <tr key={idx} className="hover:bg-slate-800/40 transition-colors">
                        <td className="py-2 px-3 text-slate-500 font-bold">{idx + 1}</td>
                        <td className="py-2 px-3 font-sans font-bold text-slate-200">
                          <span className="truncate max-w-[200px] block" title={r.reclutador}>{r.reclutador}</span>
                        </td>
                        <td className="py-2 px-2 text-center font-bold text-indigo-400">{r.totalCitados}</td>
                        <td className="py-2 px-2 text-center font-bold text-cyan-400">{r.qDia1}</td>
                        <td className="py-2 px-2 text-center text-slate-300">{r.pctDia1}%</td>
                        <td className="py-2 px-2 text-center font-bold text-emerald-400">{r.ingresantesOP}</td>
                        <td className="py-2 px-2 text-center text-emerald-300 font-bold">{r.pctConversionOP}%</td>
                        <td className="py-2 px-2 text-center text-rose-400">{r.bajas}</td>
                        <td className="py-2 px-3 text-center">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            r.semaforo === 'VERDE'
                              ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                              : r.semaforo === 'AMBAR'
                              ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                              : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                          }`}>
                            {r.semaforo === 'VERDE' ? 'ALTO IMPACTO' : r.semaforo === 'AMBAR' ? 'REGULAR' : 'CRÍTICO'}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-center">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedIdentifier(r.reclutador)
                              setSearchQuery('')
                            }}
                            className="px-2.5 py-1 rounded-lg bg-blue-600/20 hover:bg-blue-600/40 text-blue-300 border border-blue-500/30 text-[10px] font-bold transition-colors cursor-pointer"
                          >
                            Ver Análisis
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── 5. DESGLOSE DE MOTIVOS DE BAJA REALES ── */}
          {individualData.motivosBajaBreakdown && individualData.motivosBajaBreakdown.length > 0 && (
            <div className="bg-[var(--surface)] p-5 rounded-2xl border border-[var(--border-subtle)] shadow-sm space-y-3">
              <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
                <div className="flex items-center gap-2">
                  <AlertTriangle size={16} className="text-amber-400" />
                  <h3 className="text-xs font-black uppercase tracking-wider text-[var(--text-primary)]">
                    Análisis de Causas y Motivos de Baja (Deserciones)
                  </h3>
                </div>
                <span className="text-xs font-bold text-slate-400 font-mono">
                  {individualData.motivosBajaBreakdown.reduce((acc, m) => acc + m.count, 0)} bajas analizadas
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {individualData.motivosBajaBreakdown.map((m, idx) => (
                  <div key={idx} className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-slate-200 truncate max-w-[180px]" title={m.motivo}>
                        {m.motivo}
                      </span>
                      <span className="text-xs font-mono font-bold text-rose-400">
                        {m.count}
                      </span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
                      <div className="h-full bg-rose-500 rounded-full" style={{ width: `${Math.min(100, m.pct)}%` }} />
                    </div>
                    <span className="text-[9.5px] text-slate-400 font-mono block text-right">
                      {m.pct}% del total
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── 6. TABLERO DE INDICADORES (METAS OPERATIVAS / MAQUETAS CONTACT CENTER) ── */}
          {individualData.indicadores && individualData.indicadores.length > 0 && (
            <div className="bg-[var(--surface)] p-5 rounded-2xl border border-[var(--border-subtle)] shadow-sm space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
                <div className="flex items-center gap-2">
                  <Target size={17} className="text-cyan-400" />
                  <h3 className="text-xs font-black uppercase tracking-wider text-[var(--text-primary)]">
                    INDICADORES
                  </h3>
                </div>
                <span className="text-[10px] font-mono text-slate-400 font-bold uppercase">
                  Metas y Maquetas Operativas
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                {individualData.indicadores.map((ind, idx) => (
                  <div 
                    key={idx} 
                    className="p-4 rounded-xl bg-slate-900/70 border border-slate-800 flex flex-col justify-between space-y-3 hover:border-slate-700 transition-colors"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-bold text-slate-200 leading-snug">
                          {ind.nombre}
                        </span>
                        <span 
                          className="px-2 py-0.5 rounded text-[9px] font-bold font-mono tracking-wider shrink-0"
                          style={{
                            backgroundColor: `${ind.color}18`,
                            color: ind.color,
                            border: `1px solid ${ind.color}40`
                          }}
                        >
                          {ind.estado}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400 mt-1 line-clamp-2">
                        {ind.descripcion}
                      </p>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-baseline justify-between text-xs font-mono">
                        <span className="text-2xl font-black" style={{ color: ind.color }}>
                          {ind.actual}{ind.unidad}
                        </span>
                        <span className="text-[11px] text-slate-400">
                          Meta: <strong className="text-slate-200 font-bold">{ind.tipo === 'menor_es_mejor' ? '≤' : '≥'} {ind.meta}{ind.unidad}</strong>
                        </span>
                      </div>

                      {/* Barra de Progreso Visual */}
                      <div className="h-2 w-full rounded-full bg-slate-800 overflow-hidden p-0.5 border border-slate-700/50">
                        <div 
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${Math.min(100, Math.max(5, (ind.actual / (ind.meta || 1)) * 100))}%`,
                            backgroundColor: ind.color
                          }}
                        />
                      </div>

                      <div className="text-[9.5px] text-slate-500 font-mono flex items-center justify-between">
                        <span>{ind.detalle}</span>
                        <span className="font-bold" style={{ color: ind.color }}>
                          {ind.cumple ? '✓ Cumple' : '! Desvío'}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── 7. TABLA DE TRAZABILIDAD NOMINAL (AUDITORÍA NOMINAL DETALLADA) ── */}
          <div className="bg-[var(--surface)] p-5 rounded-2xl border border-[var(--border-subtle)] shadow-sm space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[var(--border-subtle)]">
              <div className="flex items-center gap-2">
                <ListFilter size={16} className="text-cyan-400" />
                <h3 className="text-xs font-black uppercase tracking-wider text-[var(--text-primary)]">
                  {activeRole === 'RECLUTADOR' ? 'Trazabilidad Nominal de Postulantes' : 'Trazabilidad Nominal de Alumnos Asignados'}
                </h3>
              </div>

              <div className="flex items-center gap-2">
                {showNominalTable && (
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Filtrar por nombre, DNI o grupo..."
                      value={nominalSearch}
                      onChange={(e) => setNominalSearch(e.target.value)}
                      className="h-8 pl-7 pr-3 bg-slate-900/90 border border-slate-700 rounded-lg text-xs text-slate-100 placeholder-slate-500 outline-none w-64"
                    />
                    <Search size={12} className="absolute left-2.5 top-2.5 text-slate-400" />
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => setShowNominalTable(!showNominalTable)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-bold text-slate-200 transition-colors cursor-pointer"
                >
                  <span>{showNominalTable ? 'Ocultar Detalle' : 'Ver Detalle Nominal'}</span>
                  {showNominalTable ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
              </div>
            </div>

            {showNominalTable && (
              <div className="overflow-x-auto max-h-[450px] rounded-xl border border-slate-800 custom-scrollbar">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-900 sticky top-0 z-10 text-[10px] font-black uppercase text-slate-400 tracking-wider">
                    <tr>
                      <th className="py-2.5 px-3">Documento</th>
                      <th className="py-2.5 px-3">Apellidos y Nombres</th>
                      <th className="py-2.5 px-3">Campaña</th>
                      <th className="py-2.5 px-3">Grupo</th>
                      <th className="py-2.5 px-2 text-center">Semana</th>
                      <th className="py-2.5 px-2 text-center">Día 1</th>
                      <th className="py-2.5 px-3 text-center">Estado</th>
                      <th className="py-2.5 px-3">Motivo Baja</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 font-mono">
                    {filteredNominalRows.map((r, idx) => (
                      <tr key={idx} className="hover:bg-slate-800/40 transition-colors">
                        <td className="py-2 px-3 font-bold text-slate-300">{r.documento}</td>
                        <td className="py-2 px-3 font-sans font-medium text-white">{r.nombre_completo}</td>
                        <td className="py-2 px-3 font-sans text-slate-300 truncate max-w-[140px]">{r.campana}</td>
                        <td className="py-2 px-3 text-cyan-400">{r.grupo_codigo}</td>
                        <td className="py-2 px-2 text-center text-slate-400">{r.semana}</td>
                        <td className="py-2 px-2 text-center">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            r.hasD1 || r.dia_1 === 'Asistió'
                              ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                              : 'bg-slate-800 text-slate-400'
                          }`}>
                            {r.dia_1 || '-'}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-center">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            r.isOP
                              ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                              : r.isBaja
                              ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                              : 'bg-blue-500/15 text-blue-400 border border-blue-500/30'
                          }`}>
                            {r.estado}
                          </span>
                        </td>
                        <td className="py-2 px-3 font-sans text-[11px] text-slate-400 truncate max-w-[180px]" title={r.motivo_baja}>
                          {r.motivo_baja}
                        </td>
                      </tr>
                    ))}
                    {filteredNominalRows.length === 0 && (
                      <tr>
                        <td colSpan={8} className="py-8 text-center text-slate-500 text-xs">
                          No se encontraron registros nominales para los filtros activos.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : null}
    </PageLayout>
  )
}

export default memo(PerformanceScorecardIndividual)
