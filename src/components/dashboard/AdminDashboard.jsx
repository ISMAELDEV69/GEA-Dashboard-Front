import { useState, useEffect, useMemo, memo } from 'react'
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Cell, ScatterChart, Scatter, ZAxis } from 'recharts'
import { 
  Users, GraduationCap, Award, BellRing, Target, AlertTriangle, ShieldAlert, TrendingUp,
  Filter, RotateCcw, Layers, Clock, Calendar, Briefcase, Building2, UserCheck, CheckCircle2
} from 'lucide-react'
import {
  computeGlobalMetrics, buildConsolidadoFunnel, nameMatches, buildAttendanceIndexes, buildCampanaEtapaHeatmap, buildResumenMensualCapacitacion, getExactGrupoMetasOps, computePeriodVariance,
  MIN_PERIODO_CORTE, isCampanaOperativa, isCampanaProyectada, getGrupoPeriodo, normalize2026Period
} from '../../lib/dashboardAnalytics'
import ResumenMensualCapacitacion from './ResumenMensualCapacitacion'
import GraficoPersonalizadoBI from './GraficoPersonalizadoBI'
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

function isGrupoVigente(g) {
  if (!g) return false
  if (g.is_cerrado) return false
  const st = normalizeEstado(g.estado || g.estado_grupo)
  if (st.includes('CANCEL') || st.includes('INACT') || st.includes('PROYECT') || st.includes('PLANIF')) return false
  return st.includes('CURSO') || st.includes('ACT') || (!st.includes('CERR') && !st.includes('FIN') && !st.includes('CULM'))
}

export function isGrupoPlanificado(g) {
  return isCampanaProyectada(g)
}

const normStr = (s) => String(s || '').trim().toUpperCase()

export const normalizeSemana = (val) => {
  if (!val) return ''
  const s = String(val).trim().toUpperCase()
  if (s === 'ALL' || s === 'TODAS' || s === 'TODOS' || s === '-' || s === 'NULL' || s === 'UNDEFINED') return ''
  const num = s.replace(/\D/g, '')
  return num ? `SEM ${num}` : s
}

export const matchSemana = (valA, valB) => {
  if (!valB || valB === 'ALL' || valB === 'TODAS' || valB === 'TODOS') return true
  if (!valA) return false
  const numA = parseInt(String(valA).replace(/\D/g, ''), 10)
  const numB = parseInt(String(valB).replace(/\D/g, ''), 10)
  if (!isNaN(numA) && !isNaN(numB)) return numA === numB
  return normStr(valA) === normStr(valB)
}

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

const ModernKpiCard = memo(function ModernKpiCard({ 
  label, 
  value, 
  sub, 
  icon: Icon, 
  badge, 
  badgeColor, 
  accentColor = '#6366f1',
  gradientFrom = 'rgba(99, 102, 241, 0.15)',
  delta = null 
}) {
  return (
    <div 
      className="relative overflow-hidden rounded-xl border border-slate-800/80 bg-slate-900/90 p-2 sm:p-2.5 transition-all duration-200 hover:border-slate-700/80 hover:shadow-md group backdrop-blur-md"
      style={{
        background: `linear-gradient(135deg, ${gradientFrom} 0%, rgba(15, 23, 42, 0.8) 100%)`
      }}
    >
      <div 
        className="absolute top-0 left-0 right-0 h-[2px] opacity-70 group-hover:opacity-100 transition-opacity"
        style={{
          background: `linear-gradient(90deg, transparent, ${accentColor}, transparent)`
        }}
      />

      <div className="flex items-center justify-between gap-1.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <div 
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-all duration-200 shadow-xs"
            style={{
              backgroundColor: `${accentColor}18`,
              borderColor: `${accentColor}40`,
              color: accentColor
            }}
          >
            <Icon size={11} strokeWidth={2.5} />
          </div>
          <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 group-hover:text-slate-300 truncate transition-colors">
            {label}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {delta && !delta.isNeutral && (
            <span 
              className={`inline-flex items-center gap-0.5 px-1 py-0 text-[7.5px] font-black border rounded-sm tracking-tight ${
                delta.isImprovement
                  ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35'
                  : 'bg-rose-500/15 text-rose-300 border-rose-500/35'
              }`}
              title={`Variación vs período anterior: ${delta.formattedDeltaPct}`}
            >
              {delta.deltaPct > 0 ? '▲' : '▼'} {delta.formattedDeltaPct}
            </span>
          )}

          {badge && (
            <span 
              className="inline-flex items-center rounded-full px-1.5 py-0 text-[7.5px] font-black tracking-tight border uppercase shadow-xs"
              style={{
                backgroundColor: `${badgeColor || accentColor}15`,
                borderColor: `${badgeColor || accentColor}35`,
                color: badgeColor || accentColor
              }}
            >
              {badge}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-baseline justify-between gap-2 mt-0.5">
        <span 
          className="text-base sm:text-lg xl:text-xl font-black tracking-tight font-mono tabular-nums leading-none drop-shadow-xs"
          style={{ color: accentColor }}
        >
          {typeof value === 'number' ? value.toLocaleString('es-PE') : value}
        </span>
        {sub && (
          <span className="text-[8.5px] sm:text-[9px] font-medium text-slate-400 truncate text-right">
            {sub}
          </span>
        )}
      </div>
    </div>
  )
})

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
  // ── Fusión Unificada de Metadatos de Grupos (capacidad_rys + metas_rys) ──
  const allGroups = useMemo(() => {
    const map = new Map()
    // 1. Registrar todos los grupos de capacidad_rys (campanasMetas) con clave compuesta única
    for (const g of (campanasMetas || [])) {
      const code = String(g.codigo || g.grupo_codigo || '').trim().toUpperCase()
      const camp = String(g.campana || g.campana_nombre || '').trim().toUpperCase()
      const per = String(g.periodo || g.periodo_ingreso_op || '').trim()
      const sem = String(g.semana_trabajo || g.semana_label || g.semana || '').trim()
      const key = g.id || `${camp}|${per}|${sem}|${code}`
      map.set(key, g)
    }
    // 2. Enriquecer con propiedades de grupos (grupos_dia1 / enriched)
    for (const g of (grupos || [])) {
      const code = String(g.codigo || g.grupo_codigo || '').trim().toUpperCase()
      const camp = String(g.campana || g.campana_nombre || '').trim().toUpperCase()
      const per = String(g.periodo || g.periodo_ingreso_op || '').trim()
      const sem = String(g.semana_trabajo || g.semana_label || g.semana || '').trim()
      const key = g.id || `${camp}|${per}|${sem}|${code}`

      if (map.has(key)) {
        map.set(key, { ...g, ...map.get(key) })
      } else {
        let found = false
        for (const [k, existing] of map.entries()) {
          const exCode = String(existing.codigo || existing.grupo_codigo || '').trim().toUpperCase()
          const exCamp = String(existing.campana || existing.campana_nombre || '').trim().toUpperCase()
          if (exCode === code && (exCamp === camp || !camp || !exCamp)) {
            map.set(k, { ...g, ...existing })
            found = true
            break
          }
        }
        if (!found) {
          map.set(key, g)
        }
      }
    }
    return Array.from(map.values())
  }, [campanasMetas, grupos])

  // ── Mapeo de Metadata de Grupos (Hash Map O(1)) ──
  const groupMetaMap = useMemo(() => {
    const map = new Map()
    for (const g of allGroups) {
      const code = String(g.grupo_codigo || g.codigo || '').trim().toUpperCase()
      const camp = String(g.campana || g.campana_nombre || '').trim().toUpperCase()
      if (code) {
        if (camp) {
          map.set(`${camp}|${code}`, g)
        }
        if (!map.has(code)) {
          map.set(code, g)
        }
        const base = code.replace(/_\d+$/, '')
        if (base && !map.has(base)) map.set(base, g)
      }
    }
    return map
  }, [allGroups])

  // ── Estados de Filtros (Llave Maestra Multidireccional) ──
  const [selectedSegmento, setSelectedSegmento] = useState('ALL')
  const [selectedCampana, setSelectedCampana] = useState('ALL')
  const [selectedGrupo, setSelectedGrupo] = useState('ALL')
  const [selectedSemana, setSelectedSemana] = useState('ALL')
  const [selectedReclutador, setSelectedReclutador] = useState('ALL')

  const selectedFilters = useMemo(() => ({
    segmento: selectedSegmento,
    campana: selectedCampana,
    grupo: selectedGrupo,
    semana: selectedSemana,
    reclutador: selectedReclutador
  }), [selectedSegmento, selectedCampana, selectedGrupo, selectedSemana, selectedReclutador])

  // ── Motor Cross-Filtering Multidireccional (Power BI / Excel) ──
  const filterExcluding = (excludeKey = null) => {
    const { segmento, campana, grupo, semana, reclutador } = selectedFilters

    const filteredP = postulantes.filter(p => {
      const g = groupMetaMap.get(p.grupo_codigo)

      // 1. Excluir si pertenece a una campaña/grupo proyectado o con periodo previo a 202608
      if (g && isCampanaProyectada(g)) return false
      const perVal = normalize2026Period(p.periodo_reclutado) || (g ? getGrupoPeriodo(g) : null) || normalize2026Period(p.periodo)
      if (perVal && perVal < MIN_PERIODO_CORTE) return false

      if (excludeKey !== 'segmento' && segmento !== 'ALL') {
        const seg = p.segmento || g?.segmento
        if (!matchStr(seg, segmento)) return false
      }

      if (excludeKey !== 'campana' && campana !== 'ALL') {
        const camp = p.campana || g?.campana_nombre || g?.campana
        if (!matchStr(camp, campana)) return false
      }

      if (excludeKey !== 'grupo' && grupo !== 'ALL') {
        if (!matchGrp(p.grupo_codigo, grupo)) return false
      }

      if (excludeKey !== 'semana' && semana !== 'ALL') {
        const sem = p.semana_trabajo || g?.semana_label || g?.semana
        if (!matchSemana(sem, semana)) return false
      }

      if (excludeKey !== 'reclutador' && reclutador !== 'ALL') {
        if (!matchRec(p.reclutador, reclutador)) return false
      }

      return true
    })

    const filteredC = allGroups.filter(g => {
      // 1. Excluir campañas proyectadas y periodos anteriores a 202608
      if (isCampanaProyectada(g)) return false
      const grpPer = getGrupoPeriodo(g) || normalize2026Period(g.periodo)
      if (grpPer && grpPer < MIN_PERIODO_CORTE) return false

      if (excludeKey !== 'segmento' && segmento !== 'ALL') {
        if (!matchStr(g.segmento, segmento)) return false
      }

      if (excludeKey !== 'campana' && campana !== 'ALL') {
        if (!matchStr(g.campana_nombre || g.campana, campana)) return false
      }

      if (excludeKey !== 'grupo' && grupo !== 'ALL') {
        if (!matchGrp(g.grupo_codigo || g.codigo, grupo)) return false
      }

      if (excludeKey !== 'reclutador' && reclutador !== 'ALL') {
        if (!g.reclutadores || !Array.isArray(g.reclutadores) || g.reclutadores.length === 0) {
          return true
        }
        const matchAny = g.reclutadores.some(r => {
          const name = r.nombre_completo || r.alias || (typeof r === 'string' ? r : '')
          return matchRec(name, reclutador)
        })
        if (!matchAny) return false
      }

      return true
    })

    return { filteredP, filteredC }
  }

  // 1. Datasets para Opciones de Segmentos (excluyendo segmento)
  const { filteredP: pForSeg, filteredC: cForSeg } = useMemo(() => 
    filterExcluding('segmento'),
    [postulantes, allGroups, groupMetaMap, selectedFilters]
  )
  const segmentosList = useMemo(() => {
    const set = new Set()
    for (const p of pForSeg) {
      const g = groupMetaMap.get(p.grupo_codigo)
      const seg = p.segmento || g?.segmento
      if (seg && normStr(seg) !== '-' && normStr(seg) !== 'NULL') set.add(String(seg).trim())
    }
    for (const g of cForSeg) {
      if (g.segmento && normStr(g.segmento) !== '-' && normStr(g.segmento) !== 'NULL') set.add(String(g.segmento).trim())
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [pForSeg, cForSeg, groupMetaMap])

  // 2. Datasets para Opciones de Campañas (excluyendo campana)
  const { filteredP: pForCamp, filteredC: cForCamp } = useMemo(() => 
    filterExcluding('campana'),
    [postulantes, allGroups, groupMetaMap, selectedFilters]
  )
  const campanasList = useMemo(() => {
    const set = new Set()
    for (const p of pForCamp) {
      const g = groupMetaMap.get(p.grupo_codigo)
      const camp = p.campana || g?.campana_nombre || g?.campana
      if (camp && normStr(camp) !== '-' && normStr(camp) !== 'NULL') set.add(String(camp).trim())
    }
    for (const g of cForCamp) {
      const camp = g.campana_nombre || g.campana
      if (camp && normStr(camp) !== '-' && normStr(camp) !== 'NULL') set.add(String(camp).trim())
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [pForCamp, cForCamp, groupMetaMap])

  // 3. Datasets para Opciones de Grupos GPE (excluyendo grupo)
  const { filteredP: pForGrp, filteredC: cForGrp } = useMemo(() => 
    filterExcluding('grupo'),
    [postulantes, allGroups, groupMetaMap, selectedFilters]
  )
  const gruposList = useMemo(() => {
    const set = new Set()
    for (const p of pForGrp) {
      if (p.grupo_codigo && normStr(p.grupo_codigo) !== '-' && normStr(p.grupo_codigo) !== 'NULL') {
        set.add(String(p.grupo_codigo).trim())
      }
    }
    for (const g of cForGrp) {
      const code = g.grupo_codigo || g.codigo
      if (code && normStr(code) !== '-' && normStr(code) !== 'NULL') {
        set.add(String(code).trim())
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [pForGrp, cForGrp])

  // 5. Datasets para Opciones de Semanas (excluyendo semana)
  const { filteredP: pForSem, filteredC: cForSem } = useMemo(() => 
    filterExcluding('semana'),
    [postulantes, allGroups, groupMetaMap, selectedFilters]
  )
  const semanasList = useMemo(() => {
    const set = new Set()
    for (const p of pForSem) {
      const g = groupMetaMap.get(p.grupo_codigo)
      const sem = normalizeSemana(p.semana_trabajo || g?.semana_label || g?.semana)
      if (sem) set.add(sem)
    }
    for (const g of cForSem) {
      const sem = normalizeSemana(g.semana_label || g.semana || g.semana_trabajo)
      if (sem) set.add(sem)
    }
    return Array.from(set).sort((a, b) => {
      const numA = parseInt(String(a).replace(/\D/g, ''), 10) || 0
      const numB = parseInt(String(b).replace(/\D/g, ''), 10) || 0
      return numA - numB
    })
  }, [pForSem, cForSem, groupMetaMap])

  // 6. Datasets para Opciones de Reclutadores (excluyendo reclutador)
  const { filteredP: pForRec, filteredC: cForRec } = useMemo(() => 
    filterExcluding('reclutador'),
    [postulantes, allGroups, groupMetaMap, selectedFilters]
  )
  const reclutadoresList = useMemo(() => {
    const set = new Set()
    for (const p of pForRec) {
      if (p.reclutador && normStr(p.reclutador) !== '-' && normStr(p.reclutador) !== 'NULL') {
        set.add(String(p.reclutador).trim())
      }
    }
    for (const g of cForRec) {
      if (g.reclutadores && Array.isArray(g.reclutadores)) {
        for (const r of g.reclutadores) {
          const name = r.nombre_completo || r.alias || (typeof r === 'string' ? r : '')
          if (name && normStr(name) !== '-' && normStr(name) !== 'NULL') {
            set.add(String(name).trim())
          }
        }
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [pForRec, cForRec])

  // ── Datasets Finales Filtrados (Aplica todos los filtros activos) ──
  const { filteredPostulantes, filteredCampanasMetasFinal } = useMemo(() => {
    const { filteredP, filteredC } = filterExcluding(null)
    return { filteredPostulantes: filteredP, filteredCampanasMetasFinal: filteredC }
  }, [postulantes, allGroups, groupMetaMap, selectedFilters])

  // ── Auto-Reset de selecciones incompatibles con cross-filter ──
  useEffect(() => {
    if (selectedSegmento !== 'ALL' && !segmentosList.includes(selectedSegmento)) {
      setSelectedSegmento('ALL')
    }
  }, [selectedSegmento, segmentosList])

  useEffect(() => {
    if (selectedCampana !== 'ALL' && !campanasList.includes(selectedCampana)) {
      setSelectedCampana('ALL')
    }
  }, [selectedCampana, campanasList])

  useEffect(() => {
    if (selectedGrupo !== 'ALL' && !gruposList.includes(selectedGrupo)) {
      setSelectedGrupo('ALL')
    }
  }, [selectedGrupo, gruposList])

  useEffect(() => {
    if (selectedSemana !== 'ALL' && !semanasList.includes(selectedSemana)) {
      setSelectedSemana('ALL')
    }
  }, [selectedSemana, semanasList])

  useEffect(() => {
    if (selectedReclutador !== 'ALL' && !reclutadoresList.includes(selectedReclutador)) {
      setSelectedReclutador('ALL')
    }
  }, [selectedReclutador, reclutadoresList])

  // ── Handlers Simplificados ──
  const handleSegmentoChange = (val) => setSelectedSegmento(val)
  const handleCampanaChange = (val) => setSelectedCampana(val)
  const handleGrupoChange = (val) => setSelectedGrupo(val)
  const handleSemanaChange = (val) => setSelectedSemana(val)
  const handleReclutadorChange = (val) => setSelectedReclutador(val)

  const resetAllFilters = () => {
    setSelectedSegmento('ALL')
    setSelectedCampana('ALL')
    setSelectedGrupo('ALL')
    setSelectedSemana('ALL')
    setSelectedReclutador('ALL')
  }

  const activeFiltersCount = useMemo(() => {
    return [
      selectedSegmento !== 'ALL',
      selectedCampana !== 'ALL',
      selectedGrupo !== 'ALL',
      selectedSemana !== 'ALL',
      selectedReclutador !== 'ALL'
    ].filter(Boolean).length
  }, [selectedSegmento, selectedCampana, selectedGrupo, selectedSemana, selectedReclutador])

  // Índice Hash O(1) Compartido único por render
  const attendanceIndexes = useMemo(() => {
    return buildAttendanceIndexes(asistencias, filteredPostulantes, filteredCampanasMetasFinal)
  }, [asistencias, filteredPostulantes, filteredCampanasMetasFinal])

  const metrics = useMemo(() => 
    computeGlobalMetrics(filteredPostulantes, asistencias, filteredCampanasMetasFinal, attendanceIndexes), 
    [filteredPostulantes, asistencias, filteredCampanasMetasFinal, attendanceIndexes]
  )
  const funnel = useMemo(() => buildConsolidadoFunnel(filteredPostulantes, asistencias, attendanceIndexes), [filteredPostulantes, asistencias, attendanceIndexes])

  // Resumen Mensual de Capacitación en Relación a Grupo
  const resumenMensualData = useMemo(() => {
    return buildResumenMensualCapacitacion(filteredPostulantes, asistencias, filteredCampanasMetasFinal, attendanceIndexes)
  }, [filteredPostulantes, asistencias, filteredCampanasMetasFinal, attendanceIndexes])

  // Eficacia Cierre Día 1 (3er Corte / Cierre de Jornada vs. Meta Requerida)
  const dia1Summary = useMemo(() => {
    const dia1 = resumenMensualData.totalSummary?.dia1 || 0
    const rqDia1 = resumenMensualData.totalSummary?.metaRqDia1 || 0

    const pct = rqDia1 > 0
      ? Math.round((dia1 / rqDia1) * 100)
      : (filteredPostulantes.length > 0 ? Math.round((dia1 / filteredPostulantes.length) * 100) : 0)

    return {
      dia1Count: dia1,
      rqDia1Total: rqDia1,
      pct
    }
  }, [resumenMensualData, filteredPostulantes.length])

  // ── Cálculo de Varianza Inter-Período (Último Período vs Período Anterior) ──
  const kpiVariances = useMemo(() => {
    const cols = resumenMensualData?.columns || []
    if (cols.length < 2) return {}

    const lastCol = cols[cols.length - 1]
    const prevCol = cols[cols.length - 2]

    // 1. Volumen Nómina
    const volumenVar = computePeriodVariance(lastCol.nomina, prevCol.nomina, false)
    
    // 2. Ingresos OP
    const ingresosVar = computePeriodVariance(lastCol.ingresos, prevCol.ingresos, false)

    // 3. Conversión / Retención OP
    const lastConv = lastCol.nomina > 0 ? (lastCol.ingresos / lastCol.nomina) * 100 : 0
    const prevConv = prevCol.nomina > 0 ? (prevCol.ingresos / prevCol.nomina) * 100 : 0
    const conversionVar = computePeriodVariance(lastConv, prevConv, false)

    // 4. Cumplimiento / Eficacia Día 1
    const eficaciaVar = computePeriodVariance(lastCol.indicators?.pctCumplimientoDia1, prevCol.indicators?.pctCumplimientoDia1, false)

    return {
      volumen: volumenVar,
      ingresos: ingresosVar,
      conversion: conversionVar,
      eficacia: eficaciaVar,
    }
  }, [resumenMensualData])

  return (
    <PageLayout className="min-h-[calc(100vh-3.25rem)] flex flex-col gap-2 p-1.5 sm:p-2 md:p-2.5 overflow-y-auto w-full custom-scrollbar">
      {/* ── BARRA DE FILTROS EN CASCADA COMPACTA (LLAVE MAESTRA) ── */}
      <div className="px-2.5 py-1.5 bg-slate-900/90 border border-slate-800/90 rounded-xl shadow-xs space-y-1 backdrop-blur-md shrink-0">
        <div className="flex items-center justify-between pb-1 border-b border-slate-800/80">
          <div className="flex items-center gap-1.5 text-[10.5px] font-black uppercase tracking-wider text-slate-200">
            <span className="flex h-4 w-4 items-center justify-center rounded bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
              <Filter size={10} />
            </span>
            <span>Filtros de Segmentación (Llave Maestra)</span>
          </div>
          <div className="flex items-center gap-1.5">
            {activeFiltersCount > 0 && (
              <button
                type="button"
                onClick={resetAllFilters}
                className="flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-bold bg-rose-500/15 hover:bg-rose-500/25 text-rose-400 border border-rose-500/30 transition-all cursor-pointer shadow-xs"
                title="Restablecer todos los filtros"
              >
                <RotateCcw size={9} />
                <span>Limpiar ({activeFiltersCount})</span>
              </button>
            )}
            <span className="flex items-center gap-1 text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 shadow-xs">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              {filteredPostulantes.length.toLocaleString('es-PE')} postulantes
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-1.5">
          {/* 1. Segmento / Cliente */}
          <div className="space-y-0.5">
            <label className="text-[8.5px] font-bold uppercase text-slate-400 flex items-center gap-1">
              <Building2 size={9} className="text-blue-400" />
              <span>Segmento</span>
            </label>
            <select
              value={selectedSegmento}
              onChange={(e) => handleSegmentoChange(e.target.value)}
              className="w-full h-7 bg-slate-950/80 text-slate-200 border border-slate-700/70 hover:border-blue-500/50 focus:border-blue-400 focus:ring-1 focus:ring-blue-500/40 px-1.5 py-0 rounded-lg text-[10.5px] font-semibold outline-none cursor-pointer truncate transition-colors shadow-xs"
            >
              <option value="ALL">Todos ({segmentosList.length})</option>
              {segmentosList.map((seg) => {
                const count = pForSeg.filter(p => {
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

          {/* 2. Campaña (Cross-Filtered) */}
          <div className="space-y-0.5">
            <label className="text-[8.5px] font-bold uppercase text-slate-400 flex items-center gap-1">
              <Layers size={9} className="text-purple-400" />
              <span>Campaña</span>
            </label>
            <select
              value={selectedCampana}
              onChange={(e) => handleCampanaChange(e.target.value)}
              className="w-full h-7 bg-slate-950/80 text-slate-200 border border-slate-700/70 hover:border-purple-500/50 focus:border-purple-400 focus:ring-1 focus:ring-purple-500/40 px-1.5 py-0 rounded-lg text-[10.5px] font-semibold outline-none cursor-pointer truncate transition-colors shadow-xs"
            >
              <option value="ALL">Todas ({campanasList.length})</option>
              {campanasList.map((c) => {
                const count = pForCamp.filter(p => {
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

          {/* 3. Grupo (GPE Cross-Filtered) */}
          <div className="space-y-0.5">
            <label className="text-[8.5px] font-bold uppercase text-slate-400 flex items-center gap-1">
              <Clock size={9} className="text-amber-400" />
              <span>Grupo (OPE)</span>
            </label>
            <select
              value={selectedGrupo}
              onChange={(e) => handleGrupoChange(e.target.value)}
              className="w-full h-7 bg-slate-950/80 text-slate-200 border border-slate-700/70 hover:border-amber-500/50 focus:border-amber-400 focus:ring-1 focus:ring-amber-500/40 px-1.5 py-0 rounded-lg text-[10.5px] font-mono outline-none cursor-pointer truncate transition-colors shadow-xs"
            >
              <option value="ALL" className="font-sans">Todos ({gruposList.length})</option>
              {gruposList.map((g) => {
                const count = pForGrp.filter(p => matchGrp(p.grupo_codigo, g)).length
                return (
                  <option key={g} value={g}>
                    {g} ({count})
                  </option>
                )
              })}
            </select>
          </div>

          {/* 4. Semana (Cross-Filtered) */}
          <div className="space-y-0.5">
            <label className="text-[8.5px] font-bold uppercase text-slate-400 flex items-center gap-1">
              <Calendar size={9} className="text-cyan-400" />
              <span>Semana</span>
            </label>
            <select
              value={selectedSemana}
              onChange={(e) => handleSemanaChange(e.target.value)}
              className="w-full h-7 bg-slate-950/80 text-slate-200 border border-slate-700/70 hover:border-cyan-500/50 focus:border-cyan-400 focus:ring-1 focus:ring-cyan-500/40 px-1.5 py-0 rounded-lg text-[10.5px] font-semibold outline-none cursor-pointer truncate transition-colors shadow-xs"
            >
              <option value="ALL">Todas ({semanasList.length})</option>
              {semanasList.map((sem) => {
                const count = pForSem.filter(p => {
                  const g = groupMetaMap.get(p.grupo_codigo)
                  return matchSemana(p.semana_trabajo || g?.semana_label || g?.semana, sem)
                }).length
                return (
                  <option key={sem} value={sem}>
                    {sem} ({count})
                  </option>
                )
              })}
            </select>
          </div>

          {/* 6. Reclutador (Cross-Filtered) */}
          <div className="space-y-0.5">
            <label className="text-[8.5px] font-bold uppercase text-slate-400 flex items-center gap-1">
              <UserCheck size={9} className="text-rose-400" />
              <span>Reclutador</span>
            </label>
            <select
              value={selectedReclutador}
              onChange={(e) => handleReclutadorChange(e.target.value)}
              className="w-full h-7 bg-slate-950/80 text-slate-200 border border-slate-700/70 hover:border-rose-500/50 focus:border-rose-400 focus:ring-1 focus:ring-rose-500/40 px-1.5 py-0 rounded-lg text-[10.5px] font-semibold outline-none cursor-pointer truncate transition-colors shadow-xs"
            >
              <option value="ALL">Todos ({reclutadoresList.length})</option>
              {reclutadoresList.map((rec) => {
                const count = pForRec.filter(p => matchRec(p.reclutador, rec)).length
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

      {/* KPI Widgets Grid Compacto con Varianza */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-1.5 md:gap-2 shrink-0">
        <ModernKpiCard 
          label="Volumen General" 
          value={metrics.total} 
          sub={`${metrics.inOps.toLocaleString('es-PE')} en OP • ${metrics.inCapacitacion.toLocaleString('es-PE')} en aula`}
          icon={Users} 
          badge="Nómina Total"
          accentColor="#818cf8"
          gradientFrom="rgba(129, 140, 248, 0.16)"
          delta={kpiVariances.volumen}
        />
        <ModernKpiCard 
          label="Grupos en Curso" 
          value={(filteredCampanasMetasFinal || []).filter(isGrupoVigente).length} 
          sub={`De ${metrics.totalGrupos} grupos registrados`}
          icon={GraduationCap} 
          badge="Vigentes"
          badgeColor="#10b981"
          accentColor="#10b981"
          gradientFrom="rgba(16, 185, 129, 0.16)"
          delta={kpiVariances.ingresos}
        />
        <ModernKpiCard 
          label="Conversión a OP" 
          value={`${metrics.conversionRate}%`} 
          sub={`${metrics.inOps.toLocaleString('es-PE')} ingresos confirmados`}
          icon={Award} 
          badge="Efectividad"
          badgeColor="#f59e0b"
          accentColor="#f59e0b"
          gradientFrom="rgba(245, 158, 11, 0.16)"
          delta={kpiVariances.conversion}
        />
        <ModernKpiCard 
          label="Eficacia Cierre Día 1" 
          value={`${dia1Summary.pct}%`} 
          sub={`${dia1Summary.dia1Count.toLocaleString('es-PE')} completaron • ${dia1Summary.rqDia1Total.toLocaleString('es-PE')} meta`}
          icon={CheckCircle2} 
          badge="Corte Cierre"
          badgeColor="#06b6d4"
          accentColor="#06b6d4"
          gradientFrom="rgba(6, 182, 212, 0.16)"
          delta={kpiVariances.eficacia}
        />
      </div>

      {/* ZONA ANALÍTICA PRINCIPAL: Gráfica + Matriz Completa */}
      <div className="flex flex-col gap-2 w-full">
        {/* SECCIÓN 1: Gráfico Personalizado Multi-Indicador (Enterprise BI) */}
        <GraficoPersonalizadoBI 
          postulantes={filteredPostulantes}
          asistencias={asistencias}
          campanasMetas={filteredCampanasMetasFinal}
          indexes={attendanceIndexes}
          className="w-full h-[265px] xl:h-[295px]"
        />

        {/* SECCIÓN 2: Resumen Mensual de Capacitación en Relación a Grupo (Tabla Completa Visible) */}
        <ResumenMensualCapacitacion 
          resumenData={resumenMensualData}
          className="w-full"
        />
      </div>
    </PageLayout>
  )
}

export default memo(AdminDashboard)
