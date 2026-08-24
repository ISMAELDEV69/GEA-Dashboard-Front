import { useState, useMemo, memo } from 'react'
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Cell, ScatterChart, Scatter, ZAxis } from 'recharts'
import { 
  Users, GraduationCap, Award, BellRing, Target, AlertTriangle, ShieldAlert, TrendingUp,
  Filter, RotateCcw, Layers, Clock, Calendar, Briefcase, Building2, UserCheck, CheckCircle2
} from 'lucide-react'
import {
  computeGlobalMetrics, buildConsolidadoFunnel, nameMatches, buildAttendanceIndexes, buildCampanaEtapaHeatmap, getExactGrupoMetasOps
} from '../../lib/dashboardAnalytics'
import { DashboardHeader, KpiCard } from './StoryComponents'
import PageLayout from '../ui/PageLayout'
import PageHeader from '../ui/PageHeader'
import Card, {
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent
} from '../ui/Card'
import { ChartTooltipContent } from '../ui/chart-tooltip'
import { Badge } from '../ui/badge'

const chartTooltipStyle = { background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: '12px', color: 'var(--text-primary)', fontSize: '11px' }

export function normalizeEstado(val) {
  if (!val) return ''
  return String(val).toUpperCase().trim().replace(/[\s_-]+/g, '_')
}

export function isGrupoVigente(g) {
  const st = normalizeEstado(g?.estado)
  return st === 'ACTIVO' || st === 'EN_CURSO' || st === 'ABIERTO' || st.includes('ACTIVO') || st.includes('CURSO')
}

export function isGrupoPlanificado(g) {
  const st = normalizeEstado(g?.estado)
  return st === 'PLANIFICADO' || st.includes('PLANIF')
}

const normStr = (s) => String(s || '').trim().toUpperCase()

const matchStr = (val, target) => {
  if (!target || target === 'ALL') return true
  return normStr(val) === normStr(target)
}

const matchGrp = (val, target) => {
  if (!target || target === 'ALL') return true
  const nVal = normStr(val)
  const nTarget = normStr(target)
  return nVal === nTarget || nVal.replace(/_\d+$/, '') === nTarget
}

const matchRec = (val, target) => {
  if (!target || target === 'ALL') return true
  const nVal = normStr(val)
  const nTarget = normStr(target)
  return nVal.includes(nTarget) || nTarget.includes(nVal)
}

// Interpolación de color continua (RGB Multi-Stop Gradient)
function getHeatmapColor(pct) {
  if (pct === null || pct === undefined || isNaN(pct)) {
    return {
      bg: 'rgba(51, 65, 85, 0.4)',
      text: '#94a3b8',
      subText: '#64748b'
    }
  }

  const p = Math.max(0, Math.min(100, pct))
  
  // 5 Puntos de anclaje cromático (Rojo intenso -> Naranja -> Ámbar -> Turquesa -> Esmeralda vivo)
  const stops = [
    { pos: 0, r: 225, g: 29, b: 72 },    // Rose 600 #e11d48 (0%)
    { pos: 35, r: 234, g: 88, b: 12 },   // Orange 600 #ea580c (35%)
    { pos: 60, r: 217, g: 119, b: 6 },   // Amber 600 #d97706 (60%)
    { pos: 80, r: 13, g: 148, b: 136 },  // Teal 600 #0d9488 (80%)
    { pos: 100, r: 16, g: 185, b: 129 }  // Emerald 500 #10b981 (100%)
  ]

  let lower = stops[0]
  let upper = stops[stops.length - 1]

  for (let i = 0; i < stops.length - 1; i++) {
    if (p >= stops[i].pos && p <= stops[i + 1].pos) {
      lower = stops[i]
      upper = stops[i + 1]
      break
    }
  }

  const range = upper.pos - lower.pos
  const t = range === 0 ? 0 : (p - lower.pos) / range

  const r = Math.round(lower.r + t * (upper.r - lower.r))
  const g = Math.round(lower.g + t * (upper.g - lower.g))
  const b = Math.round(lower.b + t * (upper.b - lower.b))

  // Cálculo de luminancia relativa para contraste automático óptimo
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b)
  const isLight = luminance > 145

  const bg = `rgba(${r}, ${g}, ${b}, 0.88)`
  const text = isLight ? '#0f172a' : '#ffffff'
  const subText = isLight ? 'rgba(15, 23, 42, 0.8)' : 'rgba(255, 255, 255, 0.85)'

  return { bg, text, subText }
}

// ── Componente KPI de Alto Impacto Visual (Glassmorphism + Ambient Beam) ──
function ModernKpiCard({ 
  label, 
  value, 
  sub, 
  icon: Icon, 
  badge, 
  badgeColor, 
  accentColor = '#6366f1',
  gradientFrom = 'rgba(99, 102, 241, 0.14)'
}) {
  return (
    <div 
      className="group relative overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3.5 transition-all duration-300 hover:-translate-y-0.5 hover:border-[var(--border-normal)] hover:shadow-lg hover:shadow-black/25 flex flex-col justify-between"
      style={{
        background: `radial-gradient(circle at top right, ${gradientFrom}, transparent 70%), var(--bg-surface)`
      }}
    >
      {/* Barra superior de acento con brillo sutil */}
      <div 
        className="absolute top-0 left-0 right-0 h-[2px] opacity-80 transition-opacity duration-300 group-hover:opacity-100"
        style={{
          background: `linear-gradient(90deg, transparent, ${accentColor}, transparent)`
        }}
      />

      <div className="flex items-start justify-between gap-2 mb-2">
        {/* Contenedor del Icono con fondo tonal */}
        <div 
          className="flex h-8 w-8 items-center justify-center rounded-xl border transition-all duration-300 group-hover:scale-110 shadow-xs"
          style={{
            backgroundColor: `${accentColor}18`,
            borderColor: `${accentColor}35`,
            color: accentColor
          }}
        >
          <Icon size={16} strokeWidth={2.3} />
        </div>

        {/* Badge de contexto */}
        {badge && (
          <span 
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold tracking-tight border uppercase shadow-2xs"
            style={{
              backgroundColor: `${badgeColor || accentColor}15`,
              borderColor: `${badgeColor || accentColor}30`,
              color: badgeColor || accentColor
            }}
          >
            {badge}
          </span>
        )}
      </div>

      {/* Métricas Principales */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: accentColor }} />
          {label}
        </p>
        <div className="flex items-baseline gap-1.5 mt-0.5">
          <span 
            className="text-2xl font-black tracking-tight font-mono tabular-nums"
            style={{ color: accentColor }}
          >
            {typeof value === 'number' ? value.toLocaleString('es-PE') : value}
          </span>
        </div>
        {sub && (
          <p className="mt-1 text-[10px] font-medium text-[var(--text-secondary)] truncate">
            {sub}
          </p>
        )}
      </div>
    </div>
  )
}

const HeatmapCell = memo(function HeatmapCell({ 
  pct, 
  count, 
  total, 
  isMissing = false, 
  warningTooltip = 'Sin fecha OJT registrada' 
}) {
  if (isMissing) {
    return (
      <div 
        className="w-full h-full min-h-[36px] flex items-center justify-center gap-1 px-1.5 py-1 rounded-md bg-amber-500/10 border border-amber-500/25 text-amber-400 text-xs font-mono"
        title={warningTooltip}
      >
        <AlertTriangle size={12} className="text-amber-400 shrink-0" />
        <span className="text-[10px] font-sans font-medium">Sin fecha</span>
      </div>
    )
  }

  const { bg, text, subText } = getHeatmapColor(pct)

  return (
    <div 
      className="w-full h-full min-h-[36px] flex flex-col items-center justify-center px-1.5 py-0.5 rounded-md shadow-xs transition-all select-none"
      style={{ backgroundColor: bg }}
    >
      <span className="font-black text-xs tracking-tight leading-none" style={{ color: text }}>
        {pct}%
      </span>
      {count !== undefined && (
        <span className="text-[9.5px] font-mono leading-none mt-0.5 font-medium" style={{ color: subText }}>
          {count}{total ? `/${total}` : ''}
        </span>
      )}
    </div>
  )
})

function AdminDashboard({
  postulantes = [],
  asistencias = [],
  grupos = [],
  campanasMetas = [],
  userProfile = null,
  reclutadores = []
}) {
  // ── Mapeo de Metadata de Grupos (Hash Map O(1)) ──
  const groupMetaMap = useMemo(() => {
    const map = new Map()
    for (const g of (campanasMetas || [])) {
      const code = g.grupo_codigo || g.codigo
      if (code) {
        map.set(code, g)
        const base = String(code).replace(/_\d+$/, '')
        if (!map.has(base)) map.set(base, g)
      }
    }
    return map
  }, [campanasMetas])

  // ── Estados de Filtros en Cascada (Llave Maestra) ──
  const [selectedSegmento, setSelectedSegmento] = useState('ALL')
  const [selectedCampana, setSelectedCampana] = useState('ALL')
  const [selectedGrupo, setSelectedGrupo] = useState('ALL')
  const [selectedPeriodo, setSelectedPeriodo] = useState('ALL')
  const [selectedSemana, setSelectedSemana] = useState('ALL')
  const [selectedReclutador, setSelectedReclutador] = useState('ALL')

  // Paso 1: Lista de Segmentos disponibles
  const segmentosList = useMemo(() => {
    const set = new Set()
    for (const p of postulantes) {
      const g = groupMetaMap.get(p.grupo_codigo)
      const seg = p.segmento || g?.segmento
      if (seg && normStr(seg) !== '-' && normStr(seg) !== 'NULL') set.add(String(seg).trim())
    }
    for (const g of campanasMetas) {
      if (g.segmento && normStr(g.segmento) !== '-' && normStr(g.segmento) !== 'NULL') set.add(String(g.segmento).trim())
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [postulantes, campanasMetas, groupMetaMap])

  // Filtrado por Segmento
  const { postulantesBySeg, campanasBySeg } = useMemo(() => {
    const pList = selectedSegmento === 'ALL'
      ? postulantes
      : postulantes.filter(p => {
          const g = groupMetaMap.get(p.grupo_codigo)
          return matchStr(p.segmento || g?.segmento, selectedSegmento)
        })
    const cList = selectedSegmento === 'ALL'
      ? campanasMetas
      : campanasMetas.filter(g => matchStr(g.segmento, selectedSegmento))
    return { postulantesBySeg: pList, campanasBySeg: cList }
  }, [postulantes, campanasMetas, selectedSegmento, groupMetaMap])

  // Paso 2: Lista de Campañas disponibles (en cascada)
  const campanasList = useMemo(() => {
    const set = new Set()
    for (const p of postulantesBySeg) {
      const g = groupMetaMap.get(p.grupo_codigo)
      const camp = p.campana || g?.campana_nombre || g?.campana
      if (camp && normStr(camp) !== '-' && normStr(camp) !== 'NULL') set.add(String(camp).trim())
    }
    for (const g of campanasBySeg) {
      const camp = g.campana_nombre || g.campana
      if (camp && normStr(camp) !== '-' && normStr(camp) !== 'NULL') set.add(String(camp).trim())
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [postulantesBySeg, campanasBySeg, groupMetaMap])

  // Filtrado por Campaña
  const { postulantesByCamp, campanasByCamp } = useMemo(() => {
    const pList = selectedCampana === 'ALL'
      ? postulantesBySeg
      : postulantesBySeg.filter(p => {
          const g = groupMetaMap.get(p.grupo_codigo)
          return matchStr(p.campana || g?.campana_nombre || g?.campana, selectedCampana)
        })
    const cList = selectedCampana === 'ALL'
      ? campanasBySeg
      : campanasBySeg.filter(g => matchStr(g.campana_nombre || g.campana, selectedCampana))
    return { postulantesByCamp: pList, campanasByCamp: cList }
  }, [postulantesBySeg, campanasBySeg, selectedCampana, groupMetaMap])

  // Paso 3: Lista de Grupos disponibles (en cascada)
  const gruposList = useMemo(() => {
    const set = new Set()
    for (const p of postulantesByCamp) {
      if (p.grupo_codigo && normStr(p.grupo_codigo) !== '-' && normStr(p.grupo_codigo) !== 'NULL') {
        set.add(String(p.grupo_codigo).trim())
      }
    }
    for (const g of campanasByCamp) {
      const code = g.grupo_codigo || g.codigo
      if (code && normStr(code) !== '-' && normStr(code) !== 'NULL') {
        set.add(String(code).trim())
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [postulantesByCamp, campanasByCamp])

  // Filtrado por Grupo
  const { postulantesByGrp, campanasByGrp } = useMemo(() => {
    const pList = selectedGrupo === 'ALL'
      ? postulantesByCamp
      : postulantesByCamp.filter(p => matchGrp(p.grupo_codigo, selectedGrupo))
    const cList = selectedGrupo === 'ALL'
      ? campanasByCamp
      : campanasByCamp.filter(g => matchGrp(g.grupo_codigo || g.codigo, selectedGrupo))
    return { postulantesByGrp: pList, campanasByGrp: cList }
  }, [postulantesByCamp, campanasByCamp, selectedGrupo])

  // Paso 4: Lista de Periodos disponibles (en cascada)
  const periodosList = useMemo(() => {
    const set = new Set()
    for (const p of postulantesByGrp) {
      const g = groupMetaMap.get(p.grupo_codigo)
      const per = p.periodo_reclutado || g?.periodo
      if (per && normStr(per) !== '-' && normStr(per) !== 'NULL') set.add(String(per).trim())
    }
    for (const g of campanasByGrp) {
      if (g.periodo && normStr(g.periodo) !== '-' && normStr(g.periodo) !== 'NULL') set.add(String(g.periodo).trim())
    }
    return Array.from(set).sort((a, b) => b.localeCompare(a))
  }, [postulantesByGrp, campanasByGrp, groupMetaMap])

  // Filtrado por Periodo
  const { postulantesByPer, campanasByPer } = useMemo(() => {
    const pList = selectedPeriodo === 'ALL'
      ? postulantesByGrp
      : postulantesByGrp.filter(p => {
          const g = groupMetaMap.get(p.grupo_codigo)
          return matchStr(p.periodo_reclutado || g?.periodo, selectedPeriodo)
        })
    const cList = selectedPeriodo === 'ALL'
      ? campanasByGrp
      : campanasByGrp.filter(g => matchStr(g.periodo, selectedPeriodo))
    return { postulantesByPer: pList, campanasByPer: cList }
  }, [postulantesByGrp, campanasByGrp, selectedPeriodo, groupMetaMap])

  // Paso 5: Lista de Semanas disponibles (en cascada)
  const semanasList = useMemo(() => {
    const set = new Set()
    for (const p of postulantesByPer) {
      const g = groupMetaMap.get(p.grupo_codigo)
      const sem = p.semana_trabajo || g?.semana_label || g?.semana
      if (sem && normStr(sem) !== '-' && normStr(sem) !== 'NULL') set.add(String(sem).trim())
    }
    for (const g of campanasByPer) {
      const sem = g.semana_label || g.semana
      if (sem && normStr(sem) !== '-' && normStr(sem) !== 'NULL') set.add(String(sem).trim())
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [postulantesByPer, campanasByPer, groupMetaMap])

  // Filtrado por Semana
  const { postulantesBySem, campanasBySem } = useMemo(() => {
    const pList = selectedSemana === 'ALL'
      ? postulantesByPer
      : postulantesByPer.filter(p => {
          const g = groupMetaMap.get(p.grupo_codigo)
          return matchStr(p.semana_trabajo || g?.semana_label || g?.semana, selectedSemana)
        })
    const cList = selectedSemana === 'ALL'
      ? campanasByPer
      : campanasByPer.filter(g => matchStr(g.semana_label || g.semana, selectedSemana))
    return { postulantesBySem: pList, campanasBySem: cList }
  }, [postulantesByPer, campanasByPer, selectedSemana, groupMetaMap])

  // Paso 6: Lista de Reclutadores disponibles (en cascada)
  const reclutadoresList = useMemo(() => {
    const set = new Set()
    for (const p of postulantesBySem) {
      if (p.reclutador && normStr(p.reclutador) !== '-' && normStr(p.reclutador) !== 'NULL') {
        set.add(String(p.reclutador).trim())
      }
    }
    for (const g of campanasBySem) {
      if (g.reclutadores && Array.isArray(g.reclutadores)) {
        for (const r of g.reclutadores) {
          if (r.nombre_completo) set.add(r.nombre_completo.trim())
          else if (r.alias) set.add(r.alias.trim())
        }
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [postulantesBySem, campanasBySem])

  // Datasets finales filtrados
  const filteredPostulantes = useMemo(() => {
    if (selectedReclutador === 'ALL') return postulantesBySem
    return postulantesBySem.filter(p => matchRec(p.reclutador, selectedReclutador))
  }, [postulantesBySem, selectedReclutador])

  const filteredCampanasMetasFinal = useMemo(() => {
    if (selectedReclutador === 'ALL') return campanasBySem
    return campanasBySem.filter(g => {
      if (!g.reclutadores || !Array.isArray(g.reclutadores) || g.reclutadores.length === 0) return true
      return g.reclutadores.some(r => matchRec(r.nombre_completo || r.alias, selectedReclutador))
    })
  }, [campanasBySem, selectedReclutador])

  // Handlers de Cascada
  const handleSegmentoChange = (val) => {
    setSelectedSegmento(val)
    setSelectedCampana('ALL')
    setSelectedGrupo('ALL')
    setSelectedPeriodo('ALL')
    setSelectedSemana('ALL')
    setSelectedReclutador('ALL')
  }

  const handleCampanaChange = (val) => {
    setSelectedCampana(val)
    setSelectedGrupo('ALL')
    setSelectedPeriodo('ALL')
    setSelectedSemana('ALL')
    setSelectedReclutador('ALL')
  }

  const handleGrupoChange = (val) => {
    setSelectedGrupo(val)
    setSelectedPeriodo('ALL')
    setSelectedSemana('ALL')
    setSelectedReclutador('ALL')
  }

  const handlePeriodoChange = (val) => {
    setSelectedPeriodo(val)
    setSelectedSemana('ALL')
  }

  const handleSemanaChange = (val) => {
    setSelectedSemana(val)
  }

  const handleReclutadorChange = (val) => {
    setSelectedReclutador(val)
  }

  const resetAllFilters = () => {
    setSelectedSegmento('ALL')
    setSelectedCampana('ALL')
    setSelectedGrupo('ALL')
    setSelectedPeriodo('ALL')
    setSelectedSemana('ALL')
    setSelectedReclutador('ALL')
  }

  const activeFiltersCount = useMemo(() => {
    return [
      selectedSegmento !== 'ALL',
      selectedCampana !== 'ALL',
      selectedGrupo !== 'ALL',
      selectedPeriodo !== 'ALL',
      selectedSemana !== 'ALL',
      selectedReclutador !== 'ALL'
    ].filter(Boolean).length
  }, [selectedSegmento, selectedCampana, selectedGrupo, selectedPeriodo, selectedSemana, selectedReclutador])

  // Índice Hash O(1) Compartido único por render
  const attendanceIndexes = useMemo(() => {
    return buildAttendanceIndexes(asistencias, filteredPostulantes, filteredCampanasMetasFinal)
  }, [asistencias, filteredPostulantes, filteredCampanasMetasFinal])

  const metrics = useMemo(() => computeGlobalMetrics(filteredPostulantes, asistencias, grupos, attendanceIndexes), [filteredPostulantes, asistencias, grupos, attendanceIndexes])
  const funnel = useMemo(() => buildConsolidadoFunnel(filteredPostulantes, asistencias, attendanceIndexes), [filteredPostulantes, asistencias, attendanceIndexes])

  // Heatmap de Retención Campaña × Etapa
  const heatmapData = useMemo(() => {
    return buildCampanaEtapaHeatmap(filteredPostulantes, asistencias, filteredCampanasMetasFinal, attendanceIndexes)
  }, [filteredPostulantes, asistencias, filteredCampanasMetasFinal, attendanceIndexes])

  // Eficacia Cierre Día 1 (3er Corte / Cierre de Jornada vs. Meta Requerida)
  const dia1Summary = useMemo(() => {
    let dia1 = 0
    let rqDia1 = 0

    for (const r of heatmapData.rows) {
      dia1 += r.dia1Count || 0
      rqDia1 += r.rqDia1 || 0
    }

    const pct = rqDia1 > 0
      ? Math.round((dia1 / rqDia1) * 100)
      : (filteredPostulantes.length > 0 ? Math.round((dia1 / filteredPostulantes.length) * 100) : 0)

    return {
      dia1Count: dia1,
      rqDia1Total: rqDia1,
      pct
    }
  }, [heatmapData.rows, filteredPostulantes.length])

  // Filtro para Metas RQ (Por defecto: Vigentes = ACTIVO / EN CURSO)
  const [filtroEstadoMetas, setFiltroEstadoMetas] = useState('VIGENTES')
  // Modo de medición en Heatmap: 'META_RQ' (Eficacia contra Meta) vs 'RETENCION' (Merma del Embudo)
  const [modoHeatmap, setModoHeatmap] = useState('META_RQ')

  const filteredGruposMetas = useMemo(() => {
    const list = (filteredCampanasMetasFinal || []).filter(c => Number(c.rq_solicitado) > 0)
    if (filtroEstadoMetas === 'TODOS') return list
    if (filtroEstadoMetas === 'PLANIFICADO') {
      return list.filter(isGrupoPlanificado)
    }
    // 'VIGENTES' por defecto: ACTIVO o EN CURSO
    return list.filter(isGrupoVigente)
  }, [filteredCampanasMetasFinal, filtroEstadoMetas])

  // Tendencia Operativa (Últimos 30 días)
  const trendData = useMemo(() => {
    const parseDateKey = (val) => {
      if (!val) return null
      const s = String(val).trim()
      if (!s || s === '-' || s === '0') return null
      if (s.includes('T')) return s.split('T')[0]
      if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0, 10)
      if (s.includes('/')) {
        const parts = s.split('/')
        if (parts.length === 3) {
          const d = parts[0].padStart(2, '0')
          const m = parts[1].padStart(2, '0')
          let y = parts[2].split(' ')[0]
          y = y.length === 2 ? `20${y}` : y
          return `${y}-${m}-${d}`
        }
      }
      const d = new Date(val)
      if (!isNaN(d.getTime())) {
        const y = d.getFullYear()
        const m = String(d.getMonth() + 1).padStart(2, '0')
        const day = String(d.getDate()).padStart(2, '0')
        return `${y}-${m}-${day}`
      }
      return null
    }

    const dateMap = new Map()
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    for (let i = 29; i >= 0; i--) {
      const d = new Date(today)
      d.setDate(today.getDate() - i)
      const yyyy = d.getFullYear()
      const mm = String(d.getMonth() + 1).padStart(2, '0')
      const dd = String(d.getDate()).padStart(2, '0')
      const isoDate = `${yyyy}-${mm}-${dd}`
      const label = `${dd}/${mm}`

      dateMap.set(isoDate, {
        fecha: isoDate,
        label,
        reclutados: 0,
        conversionesOP: 0,
      })
    }

    // 1. Contar postulantes reclutados por día
    filteredPostulantes.forEach(p => {
      const dateRaw = p.fecha_registro || p.created_at || p.marca_temporal
      const dateKey = parseDateKey(dateRaw)
      if (dateKey && dateMap.has(dateKey)) {
        dateMap.get(dateKey).reclutados++
      }
    })

    // 2. Contar conversiones a operación (I-OP) por día
    const opCountedDocsPerDay = new Set()

    asistencias.forEach(a => {
      if (a.sigla_asistencia === 'I-OP') {
        const doc = a.documento || a.numero_documento
        const dateKey = parseDateKey(a.fecha_asistencia || a.fecha)
        if (dateKey && dateMap.has(dateKey) && doc) {
          const comboKey = `${dateKey}_${doc}`
          if (!opCountedDocsPerDay.has(comboKey)) {
            opCountedDocsPerDay.add(comboKey)
            dateMap.get(dateKey).conversionesOP++
          }
        }
      }
    })

    return Array.from(dateMap.values())
  }, [filteredPostulantes, asistencias])

  const trendTotals = useMemo(() => {
    return trendData.reduce(
      (acc, d) => ({
        reclutados: acc.reclutados + d.reclutados,
        conversionesOP: acc.conversionesOP + d.conversionesOP
      }),
      { reclutados: 0, conversionesOP: 0 }
    )
  }, [trendData])

  return (
    <PageLayout className="p-3 md:p-4 space-y-3 overflow-y-auto">
      {/* Title */}
      <PageHeader
        title="Control Operativo"
        subtitle="Centro de Mando: Retención por Etapa, Tendencia Operativa, Metas RQ y Eficacia de Reclutamiento"
        actions={<div className="bg-[var(--accent-soft)] text-[var(--accent)] text-xs font-bold px-3 py-1 rounded-full uppercase">Administración</div>}
      />

      {/* ── BARRA DE FILTROS EN CASCADA (LLAVE MAESTRA) ── */}
      <div className="p-3 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl shadow-xs space-y-2.5">
        <div className="flex items-center justify-between pb-2 border-b border-[var(--border-subtle)]">
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-[var(--text-primary)]">
            <Filter size={14} className="text-indigo-400" />
            <span>Filtros de Segmentación & Análisis (Llave Maestra)</span>
          </div>
          <div className="flex items-center gap-2">
            {activeFiltersCount > 0 && (
              <button
                type="button"
                onClick={resetAllFilters}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-rose-500/15 hover:bg-rose-500/25 text-rose-600 dark:text-rose-400 border border-rose-500/30 transition-all cursor-pointer shadow-2xs active:scale-95"
                title="Restablecer todos los filtros"
              >
                <RotateCcw size={12} />
                <span>Limpiar ({activeFiltersCount})</span>
              </button>
            )}
            <span className="text-[11px] font-mono font-bold px-2.5 py-1 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
              {filteredPostulantes.length.toLocaleString('es-PE')} postulantes
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {/* 1. Segmento / Cliente */}
          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase text-[var(--text-muted)] flex items-center gap-1">
              <Building2 size={11} className="text-blue-400" />
              <span>Segmento</span>
            </label>
            <select
              value={selectedSegmento}
              onChange={(e) => handleSegmentoChange(e.target.value)}
              className="w-full bg-[var(--bg-elevated)] text-[var(--text-primary)] border border-[var(--border-subtle)] px-2.5 py-1.5 rounded-xl text-xs font-bold outline-none cursor-pointer shadow-xs focus:ring-1 focus:ring-indigo-500 truncate"
            >
              <option value="ALL">Todos ({segmentosList.length})</option>
              {segmentosList.map((seg) => {
                const count = postulantes.filter(p => {
                  const g = groupMetaMap.get(p.grupo_codigo)
                  return matchStr(p.segmento || g?.segmento, seg)
                }).length
                return (
                  <option key={seg} value={seg}>
                    {seg} ({count})
                  </option>
                )
              })}
            </select>
          </div>

          {/* 2. Campaña (en cascada) */}
          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase text-[var(--text-muted)] flex items-center gap-1">
              <Layers size={11} className="text-purple-400" />
              <span>Campaña</span>
            </label>
            <select
              value={selectedCampana}
              onChange={(e) => handleCampanaChange(e.target.value)}
              className="w-full bg-[var(--bg-elevated)] text-[var(--text-primary)] border border-[var(--border-subtle)] px-2.5 py-1.5 rounded-xl text-xs font-bold outline-none cursor-pointer shadow-xs focus:ring-1 focus:ring-indigo-500 truncate"
            >
              <option value="ALL">Todas ({campanasList.length})</option>
              {campanasList.map((c) => {
                const count = postulantesBySeg.filter(p => {
                  const g = groupMetaMap.get(p.grupo_codigo)
                  return matchStr(p.campana || g?.campana_nombre || g?.campana, c)
                }).length
                return (
                  <option key={c} value={c}>
                    {c} ({count})
                  </option>
                )
              })}
            </select>
          </div>

          {/* 3. Grupo (GPE en cascada) */}
          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase text-[var(--text-muted)] flex items-center gap-1">
              <Clock size={11} className="text-amber-400" />
              <span>Grupo (GPE)</span>
            </label>
            <select
              value={selectedGrupo}
              onChange={(e) => handleGrupoChange(e.target.value)}
              className="w-full bg-[var(--bg-elevated)] text-[var(--text-primary)] border border-[var(--border-subtle)] px-2.5 py-1.5 rounded-xl text-xs font-bold outline-none cursor-pointer shadow-xs focus:ring-1 focus:ring-indigo-500 truncate font-mono"
            >
              <option value="ALL" className="font-sans">Todos ({gruposList.length})</option>
              {gruposList.map((g) => {
                const count = postulantesByCamp.filter(p => matchGrp(p.grupo_codigo, g)).length
                return (
                  <option key={g} value={g}>
                    {g} ({count})
                  </option>
                )
              })}
            </select>
          </div>

          {/* 4. Periodo (en cascada) */}
          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase text-[var(--text-muted)] flex items-center gap-1">
              <Calendar size={11} className="text-emerald-400" />
              <span>Periodo</span>
            </label>
            <select
              value={selectedPeriodo}
              onChange={(e) => handlePeriodoChange(e.target.value)}
              className="w-full bg-[var(--bg-elevated)] text-[var(--text-primary)] border border-[var(--border-subtle)] px-2.5 py-1.5 rounded-xl text-xs font-bold outline-none cursor-pointer shadow-xs focus:ring-1 focus:ring-indigo-500 font-mono"
            >
              <option value="ALL" className="font-sans">Todos ({periodosList.length})</option>
              {periodosList.map((per) => {
                const count = postulantesByGrp.filter(p => {
                  const g = groupMetaMap.get(p.grupo_codigo)
                  return matchStr(p.periodo_reclutado || g?.periodo, per)
                }).length
                return (
                  <option key={per} value={per}>
                    {per} ({count})
                  </option>
                )
              })}
            </select>
          </div>

          {/* 5. Semana (en cascada) */}
          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase text-[var(--text-muted)] flex items-center gap-1">
              <Calendar size={11} className="text-cyan-400" />
              <span>Semana</span>
            </label>
            <select
              value={selectedSemana}
              onChange={(e) => handleSemanaChange(e.target.value)}
              className="w-full bg-[var(--bg-elevated)] text-[var(--text-primary)] border border-[var(--border-subtle)] px-2.5 py-1.5 rounded-xl text-xs font-bold outline-none cursor-pointer shadow-xs focus:ring-1 focus:ring-indigo-500"
            >
              <option value="ALL">Todas ({semanasList.length})</option>
              {semanasList.map((sem) => {
                const count = postulantesByPer.filter(p => {
                  const g = groupMetaMap.get(p.grupo_codigo)
                  return matchStr(p.semana_trabajo || g?.semana_label || g?.semana, sem)
                }).length
                return (
                  <option key={sem} value={sem}>
                    {sem} ({count})
                  </option>
                )
              })}
            </select>
          </div>

          {/* 6. Reclutador (en cascada) */}
          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase text-[var(--text-muted)] flex items-center gap-1">
              <UserCheck size={11} className="text-rose-400" />
              <span>Reclutador</span>
            </label>
            <select
              value={selectedReclutador}
              onChange={(e) => handleReclutadorChange(e.target.value)}
              className="w-full bg-[var(--bg-elevated)] text-[var(--text-primary)] border border-[var(--border-subtle)] px-2.5 py-1.5 rounded-xl text-xs font-bold outline-none cursor-pointer shadow-xs focus:ring-1 focus:ring-indigo-500 truncate"
            >
              <option value="ALL">Todos ({reclutadoresList.length})</option>
              {reclutadoresList.map((rec) => {
                const count = postulantesBySem.filter(p => matchRec(p.reclutador, rec)).length
                return (
                  <option key={rec} value={rec}>
                    {rec} ({count})
                  </option>
                )
              })}
            </select>
          </div>
        </div>
      </div>

      {/* KPI Widgets Grid (Rediseño Moderno de Alto Impacto) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <ModernKpiCard 
          label="Volumen General" 
          value={metrics.total} 
          sub={`${metrics.inOps.toLocaleString('es-PE')} en OP • ${metrics.inCapacitacion.toLocaleString('es-PE')} en aula`}
          icon={Users} 
          badge="Nómina Total"
          accentColor="#818cf8"
          gradientFrom="rgba(129, 140, 248, 0.14)"
        />
        <ModernKpiCard 
          label="Grupos en Curso" 
          value={(filteredCampanasMetasFinal || []).filter(isGrupoVigente).length || filteredGruposMetas.length} 
          sub={`De ${metrics.totalGrupos} grupos registrados`}
          icon={GraduationCap} 
          badge="Vigentes"
          badgeColor="#10b981"
          accentColor="#10b981"
          gradientFrom="rgba(16, 185, 129, 0.14)"
        />
        <ModernKpiCard 
          label="Conversión a OP" 
          value={`${metrics.conversionRate}%`} 
          sub={`${metrics.inOps.toLocaleString('es-PE')} ingresos confirmados`}
          icon={Award} 
          badge="Efectividad"
          badgeColor="#f59e0b"
          accentColor="#f59e0b"
          gradientFrom="rgba(245, 158, 11, 0.14)"
        />
        <ModernKpiCard 
          label="Eficacia Cierre Día 1" 
          value={`${dia1Summary.pct}%`} 
          sub={`${dia1Summary.dia1Count.toLocaleString('es-PE')} completaron jornada • ${dia1Summary.rqDia1Total.toLocaleString('es-PE')} meta`}
          icon={CheckCircle2} 
          badge="Corte Cierre"
          badgeColor="#06b6d4"
          accentColor="#06b6d4"
          gradientFrom="rgba(6, 182, 212, 0.14)"
        />
      </div>

      {/* SECCIÓN PRINCIPAL: Heatmap Vertical (Izquierda) + Gráficos Apilados (Derecha) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
        {/* COLUMNA IZQUIERDA: Heatmap de Retención Campaña × Etapa (Formato Vertical Expandido) */}
        <Card className="lg:col-span-7 shadow-sm hover:shadow-md transition-all duration-300 flex flex-col">
          <CardHeader className="flex flex-row items-start justify-between pb-1 pt-3 px-4">
            <div>
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <Target size={16} className="text-indigo-400" />
                Heatmap de Campañas
                <Badge variant="secondary" className="text-[9.5px] font-mono py-0 px-1.5">
                  {heatmapData.rows.length} {heatmapData.rows.length === 1 ? 'Campaña' : 'Campañas'}
                </Badge>
              </CardTitle>
              <CardDescription className="text-[11px] text-[var(--text-muted)] mt-0.5">
                {modoHeatmap === 'META_RQ'
                  ? 'Medición de Eficacia: Asistencias reales vs. Requerimientos / Metas asignadas'
                  : 'Evolución del Embudo: Supervivencia de postulantes citados a lo largo de cada etapa'}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {/* Toggle de Modo: Meta RQ vs Postulantes */}
              <div className="flex items-center bg-[var(--bg-elevated)] p-0.5 rounded-lg border border-[var(--border-subtle)]">
                <button
                  type="button"
                  onClick={() => setModoHeatmap('META_RQ')}
                  className={`px-2 py-0.5 rounded-md text-[9.5px] font-semibold transition-all cursor-pointer ${
                    modoHeatmap === 'META_RQ'
                      ? 'bg-[var(--accent)] text-white shadow-xs font-bold'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                  }`}
                  title="Compara la asistencia real contra las Metas / Requerimientos solicitados por la operación"
                >
                  Vs. Meta RQ
                </button>
                <button
                  type="button"
                  onClick={() => setModoHeatmap('RETENCION')}
                  className={`px-2 py-0.5 rounded-md text-[9.5px] font-semibold transition-all cursor-pointer ${
                    modoHeatmap === 'RETENCION'
                      ? 'bg-[var(--accent)] text-white shadow-xs font-bold'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                  }`}
                  title="Compara la asistencia contra el volumen total de postulantes citados en nómina"
                >
                  Vs. Postulantes
                </button>
              </div>

              {heatmapData.totalMissingOjtCampanas > 0 && (
                <div 
                  className="flex items-center gap-1 bg-amber-500/10 border border-amber-500/25 px-2 py-0.5 rounded-md text-[9.5px] text-amber-400 font-semibold shadow-xs" 
                  title="Campañas con grupos que no tienen fecha de inicio OJT configurada en capacidad_rys"
                >
                  <AlertTriangle size={11} className="shrink-0 text-amber-400" />
                  <span>{heatmapData.totalMissingOjtCampanas} sin OJT</span>
                </div>
              )}
            </div>
          </CardHeader>

          <CardContent className="pt-1 px-3 pb-3 flex-1 flex flex-col min-h-0">
            <div className="h-[495px] w-full overflow-y-auto custom-scrollbar border border-[var(--border-subtle)] rounded-xl bg-[var(--bg-surface)]">
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 z-10 bg-[var(--bg-elevated)] border-b border-[var(--border-normal)] text-[9.5px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">
                  <tr>
                    <th className="py-2 px-3">Campaña</th>
                    <th className="py-2 px-2 text-center">Postulantes</th>
                    <th className="py-2 px-1 text-center min-w-[90px]">
                      {modoHeatmap === 'META_RQ' ? 'Día 1 (vs RQ)' : 'Conexión Día 1'}
                    </th>
                    <th className="py-2 px-1 text-center min-w-[90px]">Conexión OJT</th>
                    <th className="py-2 px-1 text-center min-w-[90px]">
                      {modoHeatmap === 'META_RQ' ? 'Pase OP (vs RQ)' : 'Conexión OP'}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)] text-xs">
                  {heatmapData.rows.length > 0 ? (
                    heatmapData.rows.map(row => (
                      <tr key={row.campana} className="hover:bg-[var(--bg-elevated)]/40 transition-colors">
                        <td className="py-1 px-3 font-semibold text-xs text-[var(--text-primary)] truncate max-w-[180px]" title={row.campana}>
                          {row.campana}
                        </td>
                        <td className="py-1 px-2 text-center font-mono font-bold text-xs text-[var(--text-primary)] tabular-nums">
                          {row.totalReclutados}
                        </td>
                        <td className="p-0.5 text-center">
                          <HeatmapCell 
                            pct={modoHeatmap === 'META_RQ' ? row.pctDia1VsRq : row.pctDia1VsRec} 
                            count={row.dia1Count} 
                            total={modoHeatmap === 'META_RQ' ? row.rqDia1 : row.totalReclutados} 
                          />
                        </td>
                        <td className="p-0.5 text-center">
                          <HeatmapCell 
                            pct={row.pctOjt} 
                            count={row.ojtCount} 
                            total={row.ojtEligibleCount}
                            isMissing={row.hasMissingOjt}
                            warningTooltip={`Fecha OJT no definida en ${row.missingOjtGruposCount} grupos de esta campaña`}
                          />
                        </td>
                        <td className="p-0.5 text-center">
                          <HeatmapCell 
                            pct={modoHeatmap === 'META_RQ' ? row.pctOpVsRq : row.pctOpVsRec} 
                            count={row.opCount} 
                            total={modoHeatmap === 'META_RQ' ? row.rqOp : row.totalReclutados} 
                          />
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-xs text-[var(--text-muted)]">
                        No hay datos de campañas registrados.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* COLUMNA DERECHA: Gráficos Apilados Verticalmente (Tendencia Operativa + Metas RQ) */}
        <div className="lg:col-span-5 flex flex-col gap-3">
          {/* 1. Tendencia Operativa (Últimos 30 días) */}
          <Card className="shadow-sm hover:shadow-md transition-all duration-300 flex flex-col">
            <CardHeader className="flex flex-row items-start justify-between pb-1 pt-3 px-4">
              <div>
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <TrendingUp size={16} className="text-indigo-400" />
                  Tendencia Operativa
                  <Badge variant="secondary" className="text-[9.5px] font-mono py-0 px-1.5">
                    30 días
                  </Badge>
                </CardTitle>
                <CardDescription className="text-[11px] text-[var(--text-muted)] mt-0.5">
                  Reclutados vs Incorporaciones (I-OP)
                </CardDescription>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-[#8b5cf6]" />
                  <span className="text-[10px] text-[var(--text-muted)]">Rec:</span>
                  <span className="text-[11px] font-bold text-[var(--text-primary)] tabular-nums">
                    {trendTotals.reclutados}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-[#10b981]" />
                  <span className="text-[10px] text-[var(--text-muted)]">OP:</span>
                  <span className="text-[11px] font-bold text-[var(--text-primary)] tabular-nums">
                    {trendTotals.conversionesOP}
                  </span>
                </div>
              </div>
            </CardHeader>

            <CardContent className="pt-1 px-3 pb-3 flex-1 flex flex-col min-h-0">
              <div className="h-[185px] w-full border border-[var(--border-subtle)] rounded-xl bg-[var(--bg-surface)] p-2">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-normal)" opacity={0.25} vertical={false} />
                    <XAxis 
                      dataKey="label" 
                      tick={{ fontSize: 9, fill: 'var(--text-muted)' }} 
                      interval="preserveStartEnd" 
                      axisLine={{ stroke: 'var(--border-normal)' }}
                      tickLine={false}
                    />
                    <YAxis 
                      tick={{ fontSize: 9, fill: 'var(--text-muted)' }} 
                      axisLine={false}
                      tickLine={false}
                      allowDecimals={false}
                    />
                    <RechartsTooltip 
                      content={<ChartTooltipContent 
                        labelFormatter={(label, payload) => {
                          const item = payload?.[0]?.payload
                        return `Fecha: ${item?.fecha || label}`
                        }}
                        formatter={(val, name) => [`${val} registros`, name]}
                      />} 
                      cursor={{ stroke: 'var(--border-normal)', strokeWidth: 1, strokeDasharray: '3 3' }}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="reclutados" 
                      name="Reclutados" 
                      stroke="#8b5cf6" 
                      strokeWidth={2} 
                      dot={false}
                      activeDot={{ r: 4, strokeWidth: 0, fill: '#8b5cf6' }}
                      animationDuration={600}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="conversionesOP" 
                      name="Conversión OP" 
                      stroke="#10b981" 
                      strokeWidth={2} 
                      dot={false}
                      activeDot={{ r: 4, strokeWidth: 0, fill: '#10b981' }}
                      animationDuration={600}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* 2. Metas RQ */}
          <Card className="shadow-sm hover:shadow-md transition-all duration-300 flex flex-col">
            <CardHeader
              className="pb-1 pt-3 px-4 flex flex-row items-center justify-between"
              title={
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-bold">Metas RQ</span>
                  <Badge variant="secondary" className="text-[9.5px] font-mono py-0 px-1.5">
                    {filteredGruposMetas.length} {filteredGruposMetas.length === 1 ? 'grupo' : 'grupos'}
                  </Badge>
                </div>
              }
              actions={
                <div className="flex items-center gap-1">
                  {[
                    { id: 'VIGENTES', label: 'Vigentes' },
                    { id: 'PLANIFICADO', label: 'Planificados' },
                    { id: 'TODOS', label: 'Todos' }
                  ].map(tab => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setFiltroEstadoMetas(tab.id)}
                      className={`px-2 py-0.5 rounded-md text-[9.5px] font-semibold transition-all cursor-pointer ${
                        filtroEstadoMetas === tab.id
                          ? 'bg-[var(--accent)] text-white shadow-xs font-bold'
                          : 'bg-[var(--bg-elevated)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-muted)] border border-[var(--border-subtle)]'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              }
            />
            <CardContent className="pt-1 px-3 pb-3 flex-1 flex flex-col min-h-0">
              <div className="h-[235px] w-full overflow-y-auto custom-scrollbar border border-[var(--border-subtle)] rounded-xl bg-[var(--bg-surface)] p-1.5">
                {filteredGruposMetas.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {filteredGruposMetas.map(c => {
                      const ops = getExactGrupoMetasOps(c, attendanceIndexes.exactGroupOpsMap, attendanceIndexes.groupOpsMap)
                      const rq = Number(c.rq_solicitado) || 0
                      const pct = rq > 0 ? Math.min(100, Math.round((ops / rq) * 100)) : 0

                      let barColor = 'var(--accent)'
                      if (pct >= 100) barColor = '#10b981'
                      else if (pct < 50) barColor = '#ef4444'
                      else barColor = '#f59e0b'

                      const normEstado = normalizeEstado(c.estado)
                      const estadoLabel = normEstado === 'EN_CURSO' ? 'EN CURSO' : normEstado || 'PLANIFICADO'
                      const estadoClass =
                        isGrupoVigente(c)
                          ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                          : isGrupoPlanificado(c)
                          ? 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30'
                          : normEstado === 'CANCELADO'
                          ? 'bg-rose-500/15 text-rose-400 border-rose-500/30'
                          : 'bg-slate-500/15 text-slate-400 border-slate-500/30'

                      const reclutadores = c.reclutadores || []

                      return (
                        <div
                          key={c.grupo_codigo}
                          className="p-2 rounded-lg bg-[var(--bg-muted)] border border-[var(--border-subtle)] flex flex-col justify-between transition-all hover:border-[var(--border-normal)]"
                        >
                          <div className="flex justify-between items-start mb-1 gap-1">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1">
                                <span className="text-[10px] font-bold text-[var(--text-primary)] font-mono truncate">
                                  {c.grupo_codigo}
                                </span>
                                <span className={`text-[7.5px] font-bold px-1 py-0 rounded-full border uppercase shrink-0 ${estadoClass}`}>
                                  {estadoLabel}
                                </span>
                              </div>
                              <p className="text-[8.5px] text-[var(--text-muted)] mt-0.5 truncate">
                                {c.campana_nombre || 'Sin Campaña'}{c.segmento ? ` • ${c.segmento}` : ''}
                              </p>
                            </div>
                            <div className="text-right shrink-0">
                              <span className="text-[10px] font-black text-[var(--text-primary)]">
                                {ops} <span className="text-[var(--text-muted)] font-medium text-[8px]">/ {rq} OP</span>
                              </span>
                            </div>
                          </div>

                          <div className="mt-0.5">
                            <div className="flex justify-between items-center text-[8.5px] font-bold mb-0.5">
                              <span className="text-[var(--text-muted)] font-normal text-[8px]">
                                {c.meta_dia_1 ? `Día 1: ${c.conectados_dia_1_grupal || 0}/${c.meta_dia_1}` : 'Meta OP'}
                              </span>
                              <span style={{ color: barColor }}>{pct}%</span>
                            </div>
                            <div className="h-1 rounded-full overflow-hidden bg-[var(--bg-elevated)]">
                              <div
                                className="h-full rounded-full transition-all duration-500 ease-out"
                                style={{ width: `${pct}%`, background: barColor }}
                              />
                            </div>
                          </div>

                          {/* Desglose de Reclutadores Asignados */}
                          {reclutadores.length > 0 && (
                            <div className="mt-1.5 pt-1 border-t border-[var(--border-subtle)] flex flex-wrap gap-1">
                              {reclutadores.slice(0, 3).map(r => (
                                <span 
                                  key={r.reclutador_id} 
                                  className="text-[7.5px] px-1 py-0.2 rounded bg-[var(--bg-elevated)] text-[var(--text-secondary)] border border-[var(--border-subtle)] truncate max-w-[135px]" 
                                  title={`${r.nombre_completo}: ${r.conectados_dia_1_individual || 0}/${r.meta_dia_1_individual || 0} D1`}
                                >
                                  {r.alias || (r.nombre_completo ? r.nombre_completo.split(' ')[0] : 'Rec')}: <strong className="text-[var(--text-primary)]">{r.conectados_dia_1_individual || 0}</strong>/{r.meta_dia_1_individual || 0} D1
                                </span>
                              ))}
                              {reclutadores.length > 3 && (
                                <span className="text-[7.5px] px-1 py-0.2 rounded bg-[var(--bg-elevated)] text-[var(--text-muted)] border border-[var(--border-subtle)]">
                                  +{reclutadores.length - 3}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-[var(--text-muted)] text-xs p-4 text-center">
                    <p>No se encontraron grupos con el filtro seleccionado ({filtroEstadoMetas.toLowerCase()}).</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </PageLayout>
  )
}

export default memo(AdminDashboard)
