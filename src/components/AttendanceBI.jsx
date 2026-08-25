import { useState, useMemo, useEffect } from 'react'
import { parseFechaAsistencia } from '../lib/dataService'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, AreaChart, Area, Cell, PieChart, Pie, Legend, ScatterChart, Scatter, ZAxis
} from 'recharts'
import {
  TrendingDown, Users, Percent, ShieldAlert,
  Award, Filter, Activity, PieChart as PieChartIcon,
  Sparkles, Layers, RotateCcw
} from 'lucide-react'

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#8b5cf6', '#06b6d4', '#14b8a6', '#3b82f6', '#14b8a6']

/* ── Animated Counter ── */
function useAnimatedCounter(targetValue, duration = 800) {
  const [current, setCurrent] = useState(0)

  useEffect(() => {
    const target = Number(targetValue) || 0
    if (target === 0) {
      setCurrent(0)
      return
    }
    const start = performance.now()
    let frameId

    function animate(now) {
      const progress = Math.min((now - start) / duration, 1)
      const easeOutQuad = 1 - Math.pow(1 - progress, 3)
      setCurrent(Math.round(target * easeOutQuad))
      if (progress < 1) {
        frameId = requestAnimationFrame(animate)
      }
    }

    frameId = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(frameId)
  }, [targetValue, duration])

  return current
}

/* ── Mini Sparkline ── */
function MiniSparkline({ values = [], color = '#06B6D4' }) {
  const raw = values.length >= 3 ? values : [10, 15, 12, 22, 18, 30]
  const min = Math.min(...raw)
  const max = Math.max(...raw)
  const range = max - min || 1

  const points = raw.map((value, index) => {
    const x = (index / (raw.length - 1)) * 100
    const y = 20 - ((value - min) / range) * 15
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })

  const polylineStr = points.join(' ')
  const areaStr = `0,24 ${polylineStr} 100,24`

  return (
    <svg viewBox="0 0 100 24" preserveAspectRatio="none" className="h-full w-full overflow-visible">
      <defs>
        <linearGradient id={`grad-spk-${color.replace('#', '')}`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0.0" />
        </linearGradient>
      </defs>
      <polygon points={areaStr} fill={`url(#grad-spk-${color.replace('#', '')})`} />
      <polyline
        points={polylineStr}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/* ── Compact Micro KPI Card (~54px) ── */
function CompactKPICard({ label, value, isPercentage = false, icon: Icon, color = '#06B6D4', trend = [], sub = '' }) {
  const numericVal = typeof value === 'number' ? value : parseInt(value, 10) || 0
  const animatedVal = useAnimatedCounter(numericVal)

  return (
    <div 
      className="group relative flex items-center justify-between p-2 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] hover:border-[var(--border-normal)] transition-all shadow-xs min-w-0"
      style={{ borderLeft: `3px solid ${color}` }}
    >
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <div 
          className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: `${color}15`, color, border: `1px solid ${color}30` }}
        >
          <Icon size={14} strokeWidth={2.4} />
        </div>
        <div className="min-w-0 truncate">
          <p className="text-[8.5px] font-black uppercase tracking-wider text-[var(--text-muted)] truncate">
            {label}
          </p>
          <div className="flex items-baseline gap-1">
            <p 
              className="text-base font-black leading-none tabular-nums"
              style={{ color, fontFamily: 'Space Grotesk, Inter, sans-serif' }}
            >
              {animatedVal.toLocaleString('es-PE')}{isPercentage ? '%' : ''}
            </p>
            {sub && (
              <span className="text-[8px] font-semibold text-[var(--text-muted)] truncate">
                {sub}
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="w-12 h-5 opacity-70 group-hover:opacity-100 transition-opacity shrink-0 ml-1">
        <MiniSparkline values={trend} color={color} />
      </div>
    </div>
  )
}

export default function AttendanceBI({ grupos = [], postulantes = [], asistencias = [], formadores = [] }) {
  const [selectedPeriodo, setSelectedPeriodo] = useState('TODOS')
  const [selectedSemana, setSelectedSemana] = useState('TODAS')
  const [selectedSegmento, setSelectedSegmento] = useState('TODOS')
  const [selectedCampana, setSelectedCampana] = useState('TODAS')
  const [selectedGrupoCode, setSelectedGrupoCode] = useState('TODOS')

  // 1. Hierarchical Filter Options
  const periodosList = useMemo(() => {
    const list = new Set(grupos.map(g => g.periodo).filter(Boolean))
    return ['TODOS', ...Array.from(list).sort((a, b) => b.localeCompare(a))]
  }, [grupos])

  const semanasList = useMemo(() => {
    const subset = grupos.filter(g => selectedPeriodo === 'TODOS' || g.periodo === selectedPeriodo)
    const list = new Set(subset.map(g => g.semana_label).filter(Boolean))
    return ['TODAS', ...Array.from(list).sort((a, b) => b.localeCompare(a))]
  }, [grupos, selectedPeriodo])

  const segmentosList = useMemo(() => {
    const subset = grupos.filter(g => {
      const matchPeriodo = selectedPeriodo === 'TODOS' || g.periodo === selectedPeriodo
      const matchSemana = selectedSemana === 'TODAS' || g.semana_label === selectedSemana
      return matchPeriodo && matchSemana
    })
    const list = new Set(subset.map(g => g.segmento).filter(Boolean))
    return ['TODOS', ...Array.from(list).sort()]
  }, [grupos, selectedPeriodo, selectedSemana])

  const campanasList = useMemo(() => {
    const subset = grupos.filter(g => {
      const matchPeriodo = selectedPeriodo === 'TODOS' || g.periodo === selectedPeriodo
      const matchSemana = selectedSemana === 'TODAS' || g.semana_label === selectedSemana
      const matchSegmento = selectedSegmento === 'TODOS' || g.segmento === selectedSegmento
      return matchPeriodo && matchSemana && matchSegmento
    })
    const list = new Set(subset.map(g => g.campana).filter(Boolean))
    return ['TODAS', ...Array.from(list).sort()]
  }, [grupos, selectedPeriodo, selectedSemana, selectedSegmento])

  const gruposList = useMemo(() => {
    const subset = grupos.filter(g => {
      const matchPeriodo = selectedPeriodo === 'TODOS' || g.periodo === selectedPeriodo
      const matchSemana = selectedSemana === 'TODAS' || g.semana_label === selectedSemana
      const matchSegmento = selectedSegmento === 'TODOS' || g.segmento === selectedSegmento
      const matchCampana = selectedCampana === 'TODAS' || g.campana === selectedCampana
      return matchPeriodo && matchSemana && matchSegmento && matchCampana
    })
    const list = new Set(subset.map(g => String(g.codigo).startsWith('PROY-') ? 'EN PROYECCIÓN' : String(g.codigo).replace(/_\d+$/, '')).filter(Boolean))
    return ['TODOS', ...Array.from(list).sort()]
  }, [grupos, selectedPeriodo, selectedSemana, selectedSegmento, selectedCampana])

  // 2. Filtered Postulantes
  const filteredPostulantes = useMemo(() => {
    return postulantes.filter(p => {
      const pCampana = (p.campana || p.campaign || '').toUpperCase().trim()
      const sCampana = selectedCampana.toUpperCase().trim()
      const matchCampana = selectedCampana === 'TODAS' || pCampana === sCampana
      
      const pGpe = String(p.grupo_codigo || '').startsWith('PROY-') ? 'EN PROYECCIÓN' : String(p.grupo_codigo || '').replace(/_\d+$/, '')
      const matchGrupo = selectedGrupoCode === 'TODOS' || pGpe === selectedGrupoCode

      const matchedGrupo = grupos.find(g => {
        const gCode = String(g.codigo || '').startsWith('PROY-') ? 'EN PROYECCIÓN' : String(g.codigo || '').replace(/_\d+$/, '')
        const gCampana = (g.campana || '').toUpperCase().trim()
        return gCode === pGpe && gCampana === pCampana
      })

      const pSegmento = p.segmento || (matchedGrupo ? matchedGrupo.segmento : null)
      const safePSegmento = (pSegmento || '').toUpperCase().trim()
      const safeSSegmento = selectedSegmento.toUpperCase().trim()
      const matchSegmento = selectedSegmento === 'TODOS' || safePSegmento === safeSSegmento
      
      const pPeriodo = matchedGrupo ? matchedGrupo.periodo : null
      const matchPeriodo = selectedPeriodo === 'TODOS' || pPeriodo === selectedPeriodo
      
      const pSemana = matchedGrupo ? matchedGrupo.semana_label : null
      const matchSemana = selectedSemana === 'TODAS' || pSemana === selectedSemana

      return matchPeriodo && matchSemana && matchSegmento && matchCampana && matchGrupo
    })
  }, [postulantes, grupos, selectedPeriodo, selectedSemana, selectedSegmento, selectedCampana, selectedGrupoCode])

  const candidateDocsSet = useMemo(() => new Set(filteredPostulantes.map(p => p.documento)), [filteredPostulantes])

  // 3. Filtered Assistances
  const filteredAsistencias = useMemo(() => {
    return asistencias.filter(a => {
      const doc = a.postulante_documento || a.documento || a.documento_identidad
      const strippedGpe = String(a.grupo_codigo || a.codigo_grupo || '').startsWith('PROY-') ? 'EN PROYECCIÓN' : String(a.grupo_codigo || a.codigo_grupo || '').replace(/_\d+$/, '')
      const matchGrupo = selectedGrupoCode === 'TODOS' || strippedGpe === selectedGrupoCode
      const matchCandidate = candidateDocsSet.has(doc)
      return matchGrupo && matchCandidate
    })
  }, [asistencias, selectedGrupoCode, candidateDocsSet])

  // 4. Robust Metrics Processing
  const { biMetrics, motivesData, desertionTrend, recruiterData, formadorData } = useMemo(() => {
    const totalCount = filteredPostulantes.length
    
    // Attendance Rate
    const totalRecords = filteredAsistencias.length
    const presentCount = filteredAsistencias.filter(a => ['A', 'I-OP', 'FJ'].includes(a.sigla_asistencia || a.sigla)).length
    const attendanceRate = totalRecords > 0 ? Math.round((presentCount / totalRecords) * 100) : 0
    
    const bajasMap = new Map() // doc -> motivo
    const bajasDatesMap = new Map() // doc -> earliest baja date

    // From Asistencias
    filteredAsistencias.forEach(a => {
      const doc = a.postulante_documento || a.documento || a.documento_identidad
      if (!doc) return
      const sigla = a.sigla_asistencia || a.sigla
      const motivo = (a.motivo_baja || '').toUpperCase().trim()
      const estado = String(a.estado || '').toUpperCase().trim()
      const isBaja = sigla === 'B' || motivo.includes('BAJA') || estado === 'CESADO' || estado === 'BAJA' || estado === 'INACTIVO'

      if (isBaja) {
        const m = motivo || (estado === 'CESADO' ? 'CESADO' : 'NO ESPECIFICADO')
        if (!bajasMap.has(doc)) {
          bajasMap.set(doc, m)
        }
        const rawDate = a.fecha_registro_asistencia || a.fecha_asistencia || a.fecha || a.fecha_registro || a.created_at
        if (rawDate) {
          const d = parseFechaAsistencia(rawDate) || String(rawDate).split('T')[0]
          if (d && (!bajasDatesMap.has(doc) || d < bajasDatesMap.get(doc))) {
            bajasDatesMap.set(doc, d)
          }
        }
      }
    })

    // From Postulantes status fallback
    filteredPostulantes.forEach(p => {
      const doc = p.documento
      if (!doc) return
      if ((p.estado === 'CESADO' || p.motivo_baja) && !bajasMap.has(doc)) {
        const m = (p.motivo_baja || 'NO ESPECIFICADO').toUpperCase().trim()
        bajasMap.set(doc, m)
        const rawDate = p.fecha_baja || p.fecha_modificacion || p.fecha_creacion || p.created_at
        if (rawDate) {
          const d = parseFechaAsistencia(rawDate) || String(rawDate).split('T')[0]
          if (d && !bajasDatesMap.has(doc)) {
            bajasDatesMap.set(doc, d)
          }
        }
      }
    })

    // Conteo ÚNICO de Bajas Día 1 (1 por persona)
    let bajasDia1Count = 0
    bajasMap.forEach((motivo) => {
      if (motivo.includes('BAJA DIA 1') || motivo.includes('BAJA DÍA 1')) {
        bajasDia1Count++
      }
    })

    const activeBajas = bajasMap.size
    const retentionRate = totalCount > 0 ? Math.round(((totalCount - activeBajas) / totalCount) * 100) : 0

    // Motives Breakdown
    const motivesCount = {}
    bajasMap.forEach((motivo) => {
      motivesCount[motivo] = (motivesCount[motivo] || 0) + 1
    })

    const motivesData = Object.entries(motivesCount)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)

    // Curva de Deserción Acumulada Exacta (1 baja por persona en su primera fecha de deserción)
    const dailyBajas = {}
    bajasDatesMap.forEach((date) => {
      if (date && date.length >= 8) {
        dailyBajas[date] = (dailyBajas[date] || 0) + 1
      }
    })

    // Fallback para bajas sin fecha específica registrada
    const bajasSinFecha = activeBajas - bajasDatesMap.size
    if (bajasSinFecha > 0) {
      const fallbackDate = Object.keys(dailyBajas).sort()[0] || new Date().toISOString().split('T')[0]
      dailyBajas[fallbackDate] = (dailyBajas[fallbackDate] || 0) + bajasSinFecha
    }

    let accum = 0
    const sortedDates = Object.keys(dailyBajas).sort()
    const desertionTrend = sortedDates.map(date => {
      accum += dailyBajas[date]
      return {
        Fecha: date.length > 5 ? date.substring(5) : date,
        BajasDia: dailyBajas[date],
        BajasAcumuladas: accum
      }
    })

    // Recruiter Performance Matrix
    const recruitersMap = {}
    filteredPostulantes.forEach(p => {
      const rec = (p.reclutador || 'Sin Asignar').trim()
      if (!recruitersMap[rec]) recruitersMap[rec] = { name: rec, total: 0, bajas: 0 }
      recruitersMap[rec].total++
      if (bajasMap.has(p.documento)) {
        recruitersMap[rec].bajas++
      }
    })

    const recruiterData = Object.values(recruitersMap)
      .map(r => ({
        name: r.name.split(' ').slice(0, 2).join(' '),
        Total: r.total,
        Retencion: r.total > 0 ? Math.round(((r.total - r.bajas) / r.total) * 100) : 0,
        Bajas: r.bajas
      }))
      .filter(r => r.Total > 0 && r.name !== 'Sin Asignar')

    // Robust Formador Performance Matrix
    const formadorDocToName = new Map()
    formadores.forEach(f => {
      if (f.documento) {
        formadorDocToName.set(String(f.documento).trim(), f.nombre_completo || f.nombre)
      }
    })

    const groupMap = new Map()
    grupos.forEach(g => {
      const cleanCode = String(g.codigo || g.grupo_codigo || '').replace(/_\d+$/, '').toUpperCase().trim()
      const cleanCamp = String(g.campana || '').toUpperCase().trim()
      
      let formador = (g.formador_nombre || g.nombre_formador || g.formador || g.responsable || '').trim()
      if (!formador && g.formador_documento) {
        formador = formadorDocToName.get(String(g.formador_documento).trim()) || ''
      }
      if (formador) {
        groupMap.set(cleanCode, formador)
        groupMap.set(`${cleanCode}-${cleanCamp}`, formador)
      }
    })

    const formadoresMap = {}
    filteredPostulantes.forEach(p => {
      const pGpe = String(p.grupo_codigo || p.codigo_grupo || '').replace(/_\d+$/, '').toUpperCase().trim()
      const pCamp = String(p.campana || '').toUpperCase().trim()
      
      let formador = (
        p.formador_nombre || 
        p.nombre_formador || 
        p.formador || 
        groupMap.get(`${pGpe}-${pCamp}`) || 
        groupMap.get(pGpe) || 
        (p.formador_documento ? formadorDocToName.get(String(p.formador_documento).trim()) : null) ||
        (p.supervisor ? `Sup: ${p.supervisor}` : null) ||
        pGpe ||
        'Sin Asignar'
      ).trim()

      if (formador && formador !== 'Sin Asignar') {
        if (!formadoresMap[formador]) formadoresMap[formador] = { name: formador, total: 0, bajas: 0, op: 0 }
        formadoresMap[formador].total++
        if (bajasMap.has(p.documento) || p.estado === 'CESADO') {
          const motivo = String(bajasMap.get(p.documento) || p.motivo_baja || '').toUpperCase()
          const isBajaDia1 = motivo.includes('BAJA DIA 1') || motivo.includes('BAJA DÍA 1') || motivo.includes('PERIODO GRACIA')
          if (!isBajaDia1) {
            formadoresMap[formador].bajas++
          }
        }
        if (p.estado === 'I-OP' || p.estado === 'ACTIVO' || p.fecha_conexion_op) {
          formadoresMap[formador].op++
        }
      }
    })

    // If still empty and there are groups, use group codes as cohorts
    if (Object.keys(formadoresMap).length === 0) {
      filteredPostulantes.forEach(p => {
        const cohort = p.grupo_codigo || p.campana || 'Grupo General'
        if (!formadoresMap[cohort]) formadoresMap[cohort] = { name: cohort, total: 0, bajas: 0, op: 0 }
        formadoresMap[cohort].total++
        if (bajasMap.has(p.documento) || p.estado === 'CESADO') {
          const motivo = String(bajasMap.get(p.documento) || p.motivo_baja || '').toUpperCase()
          const isBajaDia1 = motivo.includes('BAJA DIA 1') || motivo.includes('BAJA DÍA 1') || motivo.includes('PERIODO GRACIA')
          if (!isBajaDia1) {
            formadoresMap[cohort].bajas++
          }
        }
        if (p.estado === 'I-OP' || p.estado === 'ACTIVO' || p.fecha_conexion_op) formadoresMap[cohort].op++
      })
    }

    const formadorData = Object.values(formadoresMap)
      .map(f => ({
        name: f.name.split(' ').slice(0, 2).join(' '),
        Total: f.total,
        Desercion: f.total > 0 ? Math.round((f.bajas / f.total) * 100) : 0,
        Dotacion: f.total > 0 ? Math.round((f.op / f.total) * 100) : 0
      }))
      .filter(f => f.Total > 0)

    return {
      biMetrics: { totalCount, attendanceRate, activeBajas, retentionRate, bajasDia1: bajasDia1Count },
      motivesData,
      desertionTrend,
      recruiterData,
      formadorData
    }
  }, [filteredPostulantes, filteredAsistencias, grupos])

  const hasActiveFilters = selectedPeriodo !== 'TODOS' || selectedSemana !== 'TODAS' || selectedSegmento !== 'TODOS' || selectedCampana !== 'TODAS' || selectedGrupoCode !== 'TODOS'

  const handleResetFilters = () => {
    setSelectedPeriodo('TODOS')
    setSelectedSemana('TODAS')
    setSelectedSegmento('TODOS')
    setSelectedCampana('TODAS')
    setSelectedGrupoCode('TODOS')
  }

  return (
    <div className="h-full flex flex-col overflow-y-auto custom-scrollbar bg-[var(--bg-base)] p-2.5 gap-2 select-none text-[var(--text-primary)]">
      
      {/* ── 1. COMPACT HERO HEADER + FILTERS (Height ~36px) ── */}
      <div className="flex flex-wrap items-center justify-between gap-2 shrink-0 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl px-2.5 py-1.5 shadow-xs">
        
        {/* Title */}
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-indigo-500 shadow-[0_0_8px_#6366F1] animate-pulse" />
          <h2 className="text-xs font-black tracking-tight text-[var(--text-primary)] uppercase">
            Dispersión BI & Retención <span className="text-[9px] text-[var(--text-muted)] font-medium lowercase">· control de asistencia</span>
          </h2>
          <span className="px-1.5 py-0.5 rounded-full text-[9px] font-black bg-indigo-500/15 text-indigo-400 border border-indigo-500/30">
            {filteredPostulantes.length} postulantes
          </span>
        </div>

        {/* Inline Filters */}
        <div className="flex flex-wrap items-center gap-1">
          {[
            { label: 'Periodo', val: selectedPeriodo, set: (v) => { setSelectedPeriodo(v); setSelectedSemana('TODAS'); setSelectedSegmento('TODOS'); setSelectedCampana('TODAS'); setSelectedGrupoCode('TODOS'); }, opts: periodosList },
            { label: 'Semana', val: selectedSemana, set: (v) => { setSelectedSemana(v); setSelectedSegmento('TODOS'); setSelectedCampana('TODAS'); setSelectedGrupoCode('TODOS'); }, opts: semanasList },
            { label: 'Segmento', val: selectedSegmento, set: (v) => { setSelectedSegmento(v); setSelectedCampana('TODAS'); setSelectedGrupoCode('TODOS'); }, opts: segmentosList },
            { label: 'Campaña', val: selectedCampana, set: (v) => { setSelectedCampana(v); setSelectedGrupoCode('TODOS'); }, opts: campanasList },
            { label: 'Grupo', val: selectedGrupoCode, set: setSelectedGrupoCode, opts: gruposList },
          ].map(({ label, val, set, opts }) => (
            <div key={label} className="flex items-center gap-1 bg-[var(--bg-elevated)] border border-[var(--border-normal)] rounded-md px-1.5 py-0.5">
              <span className="text-[7.5px] font-black uppercase tracking-wider text-[var(--text-muted)]">
                {label}:
              </span>
              <select
                value={val}
                onChange={(e) => set(e.target.value)}
                className="bg-transparent text-[10px] font-bold text-[var(--text-primary)] outline-none cursor-pointer max-w-[95px] truncate"
              >
                {opts.map((opt) => (
                  <option key={opt} value={opt} className="bg-[var(--bg-surface)] text-[var(--text-primary)]">
                    {opt}
                  </option>
                ))}
              </select>
            </div>
          ))}

          {hasActiveFilters && (
            <button
              onClick={handleResetFilters}
              title="Limpiar filtros"
              className="p-1 rounded-md bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 border border-amber-500/30 transition-all cursor-pointer"
            >
              <RotateCcw size={11} />
            </button>
          )}
        </div>
      </div>

      {/* ── 2. COMPACT 5 KPI CARDS ROW (Height ~54px) ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-1.5 shrink-0">
        <CompactKPICard
          label="Total Reclutados"
          value={biMetrics.totalCount}
          icon={Users}
          color="#6366F1"
          trend={[10, 20, 18, 25, 30, biMetrics.totalCount]}
          sub="en nómina"
        />
        <CompactKPICard
          label="Tasa Asistencia"
          value={biMetrics.attendanceRate}
          isPercentage
          icon={Percent}
          color="#10B981"
          trend={[80, 85, 82, 88, biMetrics.attendanceRate]}
          sub="promedio"
        />
        <CompactKPICard
          label="Deserción Total"
          value={biMetrics.activeBajas}
          icon={TrendingDown}
          color="#F43F5E"
          trend={[5, 12, 18, biMetrics.activeBajas]}
          sub={`${((biMetrics.activeBajas / (biMetrics.totalCount || 1)) * 100).toFixed(0)}% total`}
        />
        <CompactKPICard
          label="Bajas Día 1"
          value={biMetrics.bajasDia1}
          icon={ShieldAlert}
          color="#EF4444"
          trend={[2, 6, 9, biMetrics.bajasDia1]}
          sub="abandono D1"
        />
        <CompactKPICard
          label="Retención Real"
          value={biMetrics.retentionRate}
          isPercentage
          icon={Award}
          color="#F59E0B"
          trend={[90, 85, 78, biMetrics.retentionRate]}
          sub="activos neta"
        />
      </div>

      {/* ── 3. DYNAMIC FLEX-GROWING CHARTS CANVAS (Auto-expands on Large Screens) ── */}
      <div className="flex-1 min-h-0 flex flex-col gap-2">
        
        {/* ROW 1: DESERCIÓN & MOTIVOS (Flex-1) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-2 flex-1 min-h-[210px]">
          
          {/* Gráfica 1: Causas de Deserción Donut + Ranking (5 cols) */}
          <div className="lg:col-span-5 h-full min-h-[210px] rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-2.5 flex flex-col shadow-xs">
            <div className="flex items-center justify-between pb-1.5 mb-1 border-b border-[var(--border-subtle)] shrink-0">
              <div className="flex items-center gap-1.5">
                <PieChartIcon size={13} className="text-indigo-400" />
                <span className="text-[11px] font-bold text-[var(--text-primary)] uppercase tracking-tight">
                  Causas de Deserción
                </span>
              </div>
              <span className="text-[9px] font-mono font-bold text-rose-500 bg-rose-500/10 px-1.5 py-0.5 rounded-full border border-rose-500/20">
                {biMetrics.activeBajas} bajas
              </span>
            </div>

            <div className="flex-1 min-h-0 grid grid-cols-1 sm:grid-cols-12 gap-1 items-center">
              {/* Donut Chart (5 cols) */}
              <div className="sm:col-span-5 h-full min-h-[140px] flex items-center justify-center relative">
                {motivesData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={motivesData}
                        cx="50%"
                        cy="50%"
                        innerRadius={36}
                        outerRadius={56}
                        paddingAngle={3}
                        dataKey="value"
                      >
                        {motivesData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <RechartsTooltip 
                        contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: '8px', fontSize: '10px', color: 'var(--text-primary)' }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="text-center text-[10px] text-[var(--text-muted)]">
                    Sin bajas
                  </div>
                )}
                {motivesData.length > 0 && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-base font-black text-[var(--text-primary)] tabular-nums">
                      {biMetrics.activeBajas}
                    </span>
                    <span className="text-[7.5px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                      Bajas
                    </span>
                  </div>
                )}
              </div>

              {/* Ranking List (7 cols) */}
              <div className="sm:col-span-7 flex flex-col justify-center space-y-1 overflow-y-auto max-h-[180px] custom-scrollbar pr-1">
                {motivesData.slice(0, 5).map((m, i) => {
                  const pct = biMetrics.activeBajas > 0 ? ((m.value / biMetrics.activeBajas) * 100).toFixed(0) : 0
                  return (
                    <div key={m.name} className="p-1 rounded-md bg-[var(--bg-elevated)]/60 border border-[var(--border-subtle)] text-[10px] flex items-center justify-between">
                      <div className="flex items-center gap-1 min-w-0 flex-1 truncate pr-1">
                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                        <span className="text-[9.5px] font-bold text-[var(--text-secondary)] truncate uppercase" title={m.name}>
                          {m.name}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0 font-mono">
                        <span className="text-[9.5px] font-black text-[var(--text-primary)]">{m.value}</span>
                        <span className="text-[8.5px] text-[var(--text-muted)]">({pct}%)</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Gráfica 2: Curva de Deserción Acumulada (7 cols) */}
          <div className="lg:col-span-7 h-full min-h-[210px] rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-2.5 flex flex-col shadow-xs">
            <div className="flex items-center justify-between pb-1.5 mb-1 border-b border-[var(--border-subtle)] shrink-0">
              <div className="flex items-center gap-1.5">
                <TrendingDown size={13} className="text-rose-500" />
                <span className="text-[11px] font-bold text-[var(--text-primary)] uppercase tracking-tight">
                  Curva de Deserción Acumulada
                </span>
              </div>
              <span className="text-[9px] font-mono text-[var(--text-muted)]">
                Evolución acumulada
              </span>
            </div>

            <div className="flex-1 min-h-0">
              {desertionTrend.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={desertionTrend} margin={{ top: 10, right: 15, left: -25, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorBajaAttendanceFull" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#F43F5E" stopOpacity={0.4}/>
                        <stop offset="95%" stopColor="#F43F5E" stopOpacity={0.0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-normal)" opacity={0.2} vertical={false} />
                    <XAxis dataKey="Fecha" stroke="var(--text-muted)" fontSize={9} tickLine={false} />
                    <YAxis domain={[0, 'dataMax']} stroke="var(--text-muted)" fontSize={9} tickLine={false} />
                    <RechartsTooltip
                      contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: '8px', fontSize: '10px', color: 'var(--text-primary)' }}
                    />
                    <Area type="monotone" name="Bajas Acumuladas" dataKey="BajasAcumuladas" stroke="#F43F5E" strokeWidth={2} fillOpacity={1} fill="url(#colorBajaAttendanceFull)" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-[var(--text-muted)] text-[10px]">
                  Sin bajas acumuladas en el período seleccionado.
                </div>
              )}
            </div>
          </div>

        </div>

        {/* ROW 2: RENDIMIENTO POR EQUIPOS (Flex-1) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-2 flex-1 min-h-[210px]">
          
          {/* Gráfica 3: Eficiencia de RyS (Volumen vs. Retención) */}
          <div className="h-full min-h-[210px] rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-2.5 flex flex-col shadow-xs">
            <div className="flex items-center justify-between pb-1.5 mb-1 border-b border-[var(--border-subtle)] shrink-0">
              <div className="flex items-center gap-1.5">
                <Award size={13} className="text-indigo-400" />
                <span className="text-[11px] font-bold text-[var(--text-primary)] uppercase tracking-tight">
                  Eficiencia de RyS (Volumen vs. Retención)
                </span>
              </div>
              <span className="text-[9px] font-mono text-[var(--text-muted)]">
                Volumen Traído vs % Retención
              </span>
            </div>

            <div className="flex-1 min-h-0">
              {recruiterData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{ top: 10, right: 15, bottom: 10, left: -25 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-normal)" opacity={0.2} />
                    <XAxis type="number" dataKey="Total" name="Volumen" stroke="var(--text-muted)" fontSize={9} tickLine={false} label={{ value: 'Volumen', position: 'insideBottom', offset: -5, fill: 'var(--text-muted)', fontSize: 9 }} />
                    <YAxis type="number" dataKey="Retencion" name="Retención" unit="%" stroke="var(--text-muted)" fontSize={9} tickLine={false} domain={[0, 100]} />
                    <ZAxis type="category" dataKey="name" name="Reclutador" />
                    <RechartsTooltip 
                      cursor={{ strokeDasharray: '3 3' }} 
                      contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: '8px', fontSize: '10px', color: 'var(--text-primary)' }}
                    />
                    <Scatter data={recruiterData} fill="#8b5cf6">
                      {recruiterData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.Retencion >= 80 ? '#10b981' : entry.Retencion < 50 ? '#ef4444' : '#f59e0b'} />
                      ))}
                    </Scatter>
                  </ScatterChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-[var(--text-muted)] text-[10px]">
                  Sin datos de reclutadores con los filtros seleccionados.
                </div>
              )}
            </div>
          </div>

          {/* Gráfica 4: Eficacia de Formación: Pase a Operaciones vs. Fuga */}
          <div className="h-full min-h-[210px] rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-2.5 flex flex-col shadow-xs">
            <div className="flex items-center justify-between pb-1.5 mb-1 border-b border-[var(--border-subtle)] shrink-0">
              <div className="flex items-center gap-1.5">
                <Activity size={13} className="text-emerald-400" />
                <span className="text-[11px] font-bold text-[var(--text-primary)] uppercase tracking-tight">
                  Eficacia de Formación: Pase a Operaciones vs. Fuga
                </span>
              </div>
              <span className="text-[9px] font-mono text-[var(--text-muted)]">
                % Pase a OPE (I-OP) vs % Deserción
              </span>
            </div>

            <div className="flex-1 min-h-0">
              {formadorData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{ top: 10, right: 15, bottom: 10, left: -25 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-normal)" opacity={0.2} />
                    <XAxis type="number" dataKey="Dotacion" name="Dotación" unit="%" stroke="var(--text-muted)" fontSize={9} tickLine={false} domain={[0, 100]} label={{ value: 'Dotación %', position: 'insideBottom', offset: -5, fill: 'var(--text-muted)', fontSize: 9 }} />
                    <YAxis type="number" dataKey="Desercion" name="Deserción" unit="%" stroke="var(--text-muted)" fontSize={9} tickLine={false} domain={[0, 100]} />
                    <ZAxis type="category" dataKey="name" name="Formador" />
                    <RechartsTooltip 
                      cursor={{ strokeDasharray: '3 3' }} 
                      contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: '8px', fontSize: '10px', color: 'var(--text-primary)' }}
                    />
                    <Scatter data={formadorData} fill="#10b981">
                      {formadorData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.Desercion > 50 ? '#ef4444' : entry.Dotacion >= 75 ? '#10b981' : '#f59e0b'} />
                      ))}
                    </Scatter>
                  </ScatterChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-[var(--text-muted)] text-[10px]">
                  Sin datos de formadores con los filtros seleccionados.
                </div>
              )}
            </div>
          </div>

        </div>

      </div>

    </div>
  )
}
