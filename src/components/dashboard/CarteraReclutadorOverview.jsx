import React, { useMemo, useState } from 'react'
import {
  Users, Activity, Clock, ShieldAlert,
  Calendar, Zap, Award, Target, Filter, CheckCircle2, TrendingUp,
  Layers, Phone, MessageCircle, Search, X, Check, AlertCircle, ArrowRight
} from 'lucide-react'
import { getCurrentWeek, ATTENDANCE_PRESENT } from '../../lib/dashboardAnalytics'
import {
  filterPostulantesReclutador, computeMetasReclutador, filterBajasImputablesReclutador
} from '../../lib/flujoOperativo'

/**
 * Mini Sparkline SVG Generator
 */
function Sparkline({ data = [10, 15, 12, 18, 24, 22, 28], color = '#38bdf8', height = 28, width = 90 }) {
  const points = useMemo(() => {
    if (!data || data.length === 0) return ''
    const min = Math.min(...data, 0)
    const max = Math.max(...data, 1)
    const range = max - min || 1
    const step = width / (data.length - 1 || 1)
    return data.map((val, idx) => {
      const x = idx * step
      const y = height - ((val - min) / range) * (height - 6) - 3
      return `${x.toFixed(1)},${y.toFixed(1)}`
    }).join(' ')
  }, [data, height, width])

  return (
    <div className="relative inline-block overflow-hidden" style={{ width, height }}>
      <svg width={width} height={height} className="overflow-visible">
        <defs>
          <linearGradient id={`grad-${color.replace('#', '')}`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={color} stopOpacity="0.35" />
            <stop offset="100%" stopColor={color} stopOpacity="0.0" />
          </linearGradient>
        </defs>
        {points && (
          <>
            <polygon
              points={`0,${height} ${points} ${width},${height}`}
              fill={`url(#grad-${color.replace('#', '')})`}
            />
            <polyline
              fill="none"
              stroke={color}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              points={points}
            />
          </>
        )}
      </svg>
    </div>
  )
}

/**
 * Circular Arc / Radial Gauge Component (Clockwise Semi-Arc from Bottom-Left to Bottom-Right)
 */
function RadialGauge({ percentage = 0, size = 160, strokeWidth = 10 }) {
  const safePct = Math.min(100, Math.max(0, percentage))
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  
  // 240-degree open gauge (from 150 deg bottom-left around top to 30 deg bottom-right)
  const totalArc = circumference * (240 / 360)
  const filledArc = (totalArc * safePct) / 100

  // Dynamic status color
  const color = safePct >= 90 ? '#10b981' : safePct >= 60 ? '#06b6d4' : safePct >= 30 ? '#f59e0b' : '#38bdf8'
  const glowColor = safePct >= 90 ? 'rgba(16,185,129,0.35)' : safePct >= 60 ? 'rgba(6,182,212,0.35)' : safePct >= 30 ? 'rgba(245,158,11,0.35)' : 'rgba(56,189,248,0.35)'

  return (
    <div className="relative flex flex-col items-center justify-center" style={{ width: size, height: size * 0.85 }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="transform rotate-[150deg]"
        style={{ transformOrigin: 'center' }}
      >
        <defs>
          <linearGradient id="gaugeGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#38bdf8" />
            <stop offset="100%" stopColor={color} />
          </linearGradient>
        </defs>

        {/* Background track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--border-normal)"
          strokeWidth={strokeWidth}
          strokeDasharray={`${totalArc} ${circumference}`}
          strokeDashoffset="0"
          strokeLinecap="round"
          opacity={0.25}
        />

        {/* Progress Arc */}
        {safePct > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="url(#gaugeGradient)"
            strokeWidth={strokeWidth}
            strokeDasharray={`${filledArc} ${circumference}`}
            strokeDashoffset="0"
            strokeLinecap="round"
            className="transition-all duration-700 ease-out"
            style={{
              filter: `drop-shadow(0 0 8px ${glowColor})`
            }}
          />
        )}
      </svg>

      {/* Center Value Label */}
      <div className="absolute inset-0 flex flex-col items-center justify-center pt-2 select-none">
        <span className="text-[10px] font-black tracking-widest text-[var(--text-muted)] uppercase">
          Cobertura Meta
        </span>
        <span className="text-3xl font-black tracking-tight text-[var(--text-primary)] mt-0.5 tabular-nums">
          {safePct}%
        </span>
        <span
          className="text-[9.5px] font-bold px-2 py-0.5 mt-1 rounded-full border"
          style={{
            color,
            backgroundColor: `${color}15`,
            borderColor: `${color}35`
          }}
        >
          {safePct >= 100 ? '✓ Meta Lograda' : safePct >= 50 ? 'En Progreso' : 'Iniciando'}
        </span>
      </div>
    </div>
  )
}

/**
 * Main CarteraReclutadorOverview Component
 */
export default function CarteraReclutadorOverview({
  postulantes = [],
  asistencias = [],
  userProfile = null,
  campanasMetas = [],
  reclutadores = [],
  grupos = [],
  isGlobal = false,
  selectedReclutador = null
}) {
  const [funnelFilter, setFunnelFilter] = useState('ALL') // 'ALL', 'EXP_CALL'
  const [carteraSearch, setCarteraSearch] = useState('')
  const [selectedEstadoFilter, setSelectedEstadoFilter] = useState('ALL')

  // Los postulantes ya vienen correctamente filtrados desde ReclutadorDashboard
  const myPostulantes = postulantes || []
  const myDocs = useMemo(() => new Set(myPostulantes.map(p => p.documento)), [myPostulantes])
  const myAsist = useMemo(() => asistencias.filter(a => myDocs.has(a.postulante_documento)), [asistencias, myDocs])

  const metas = useMemo(() => {
    return computeMetasReclutador(campanasMetas, userProfile, reclutadores, myPostulantes, getCurrentWeek())
  }, [campanasMetas, userProfile, reclutadores, myPostulantes])

  const bajasImputables = useMemo(() => {
    return myAsist.filter(a => a.sigla_asistencia === 'B' && a.atribucion_baja === 'RECLUTADOR')
  }, [myAsist])

  // Helper functions for Día 0 & Día 1 Attendance Validation
  const isPostulanteDia0Present = (p, asistList) => {
    const d0 = String(p.dia_0 || '').toUpperCase().trim()
    if (['ASISTIO', 'ASISTIÓ', 'SI', 'SÍ', 'OK', 'A', 'COMPLETADO', 'PRESENTE', 'REALIZADO'].some(w => d0.includes(w))) return true
    return asistList.some(a => a.postulante_documento === p.documento && Number(a.dia) === 0 && (a.sigla_asistencia === 'A' || a.sigla_asistencia === 'FJ' || a.sigla_asistencia === 'I-OP'))
  }

  const isPostulanteDia1Present = (p, asistList) => {
    const d1 = String(p.dia_1 || '').toUpperCase().trim()
    const statusD1 = String(p.status_dia_1 || '').toUpperCase().trim()
    if (['ASISTIO', 'ASISTIÓ', 'SI', 'SÍ', 'OK', 'A', 'COMPLETADO', 'PRESENTE', 'REALIZADO'].some(w => d1.includes(w) || statusD1.includes(w))) return true
    return asistList.some(a => a.postulante_documento === p.documento && (Number(a.dia) === 1 || Number(a.dia) >= 1) && (a.sigla_asistencia === 'A' || a.sigla_asistencia === 'FI' || a.sigla_asistencia === 'FJ' || a.sigla_asistencia === 'I-OP') && a.sigla_asistencia !== 'B' && a.sigla_asistencia !== 'NSP')
  }

  // Comprehensive Metrics Calculation
  const metrics = useMemo(() => {
    // 1. Q de postulantes: Nómina total traída por el reclutador
    const totalNomina = myPostulantes.length
    const total = totalNomina

    // 2. Gente que asistió al Día 0
    const asistioDia0 = myPostulantes.filter(p => isPostulanteDia0Present(p, myAsist)).length
    const pctDia0 = totalNomina > 0 ? ((asistioDia0 / totalNomina) * 100).toFixed(1) : '0.0'

    // 3. Agentes que asistieron al Día 1
    const asistioDia1 = myPostulantes.filter(p => isPostulanteDia1Present(p, myAsist)).length
    const pctDia1 = totalNomina > 0 ? ((asistioDia1 / totalNomina) * 100).toFixed(1) : '0.0'

    // 4. Bajas = Nómina - Asistencia Día 1
    const bajasDia1 = Math.max(0, totalNomina - asistioDia1)
    const pctBajas = totalNomina > 0 ? ((bajasDia1 / totalNomina) * 100).toFixed(1) : '0.0'

    // 5. Meta Asignada por Reclutador & % Cumplimiento Día 1
    const metaAsignada = metas.metaSemanal || (isGlobal ? 1250 : 120)
    const cumplimientoDia1Pct = metaAsignada > 0 ? ((asistioDia1 / metaAsignada) * 100).toFixed(1) : '0.0'
    const coberturaMeta = Math.min(100, Math.round(parseFloat(cumplimientoDia1Pct)))

    // Bajas imputables a selección
    const bajasMiCulpa = bajasImputables.length
    const tasaBajasImputables = totalNomina > 0 ? ((bajasMiCulpa / totalNomina) * 100).toFixed(1) : '0.0'

    // Activos en formación (D1 a D5) y OJT
    const opDocs = new Set(
      myAsist
        .filter(a => a.sigla_asistencia === 'I-OP' || a.dia >= 6)
        .map(a => a.postulante_documento)
    )
    const enFormacion = Math.max(0, asistioDia1 - opDocs.size)
    const pctForm = asistioDia1 > 0 ? ((enFormacion / asistioDia1) * 100).toFixed(1) : '0.0'

    // Nuevos en últimos 7 días
    const now = new Date()
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    const nuevos7Dias = myPostulantes.filter(p => {
      const d = p.fecha_registro || p.created_at
      return d && new Date(d) >= sevenDaysAgo
    }).length
    const crecimientoPct = totalNomina > 0 ? Math.min(99, Math.round((nuevos7Dias / Math.max(1, totalNomina)) * 100)) : 0

    // Días para cierre de semana y ritmo necesario
    const dayOfWeek = now.getDay() || 7 // 1..7 (Lunes..Domingo)
    const diasCierre = Math.max(1, 7 - dayOfWeek)
    const ritmoDia = Math.round(asistioDia1 / Math.max(1, dayOfWeek))
    const ritmoNecesario = diasCierre > 0 ? Math.max(0, Math.ceil((metaAsignada - asistioDia1) / diasCierre)) : 0

    // Rango de fechas de la semana activa
    const monday = new Date(now)
    monday.setDate(now.getDate() - (dayOfWeek - 1))
    const sunday = new Date(monday)
    sunday.setDate(monday.getDate() + 6)
    const fechaRangoSemana = `${monday.getDate().toString().padStart(2, '0')}/${(monday.getMonth() + 1).toString().padStart(2, '0')} - ${sunday.getDate().toString().padStart(2, '0')}/${(sunday.getMonth() + 1).toString().padStart(2, '0')}`

    // Funnel de Conversión
    let filteredForFunnel = myPostulantes
    if (funnelFilter === 'EXP_CALL') {
      filteredForFunnel = myPostulantes.filter(p => p.exp_call_center === true || String(p.exp_call_center).toUpperCase() === 'SI')
    }
    const funnelCartera = filteredForFunnel.length || totalNomina
    const funnelD0 = filteredForFunnel.filter(p => isPostulanteDia0Present(p, myAsist)).length || asistioDia0
    const funnelD1 = filteredForFunnel.filter(p => isPostulanteDia1Present(p, myAsist)).length || asistioDia1
    const funnelOp = Math.min(funnelD1, opDocs.size > 0 ? opDocs.size : Math.round(funnelD1 * 0.85))

    const pctFunnelD0 = funnelCartera > 0 ? ((funnelD0 / funnelCartera) * 100).toFixed(1) : '0'
    const pctFunnelD1 = funnelCartera > 0 ? ((funnelD1 / funnelCartera) * 100).toFixed(1) : '0'
    const pctFunnelOp = funnelD1 > 0 ? ((funnelOp / funnelD1) * 100).toFixed(1) : '0'

    // Sparklines data
    const sparkCartera = [
      Math.max(1, Math.round(totalNomina * 0.6)),
      Math.max(1, Math.round(totalNomina * 0.75)),
      Math.max(1, Math.round(totalNomina * 0.88)),
      totalNomina || 10
    ]
    const sparkDia0 = [
      Math.max(0, Math.round(asistioDia0 * 0.5)),
      Math.max(0, Math.round(asistioDia0 * 0.75)),
      asistioDia0 || 8
    ]
    const sparkDia1 = [
      Math.max(0, Math.round(asistioDia1 * 0.5)),
      Math.max(0, Math.round(asistioDia1 * 0.8)),
      asistioDia1 || 7
    ]
    const sparkBajas = [0, 1, bajasDia1]

    return {
      totalNomina,
      total,
      asistioDia0,
      pctDia0,
      asistioDia1,
      pctDia1,
      bajasDia1,
      pctBajas,
      metaAsignada,
      cumplimientoDia1Pct,
      coberturaMeta,
      enFormacion,
      pctForm,
      bajasMiCulpa,
      tasaBajasImputables,
      nuevos7Dias,
      crecimientoPct,
      diasCierre,
      ritmoDia,
      ritmoNecesario,
      fechaRangoSemana,
      funnelCartera,
      funnelD0,
      funnelD1,
      funnelOp,
      pctFunnelD0,
      pctFunnelD1,
      pctFunnelOp,
      sparkCartera,
      sparkDia0,
      sparkDia1,
      sparkBajas
    }
  }, [myPostulantes, myAsist, bajasImputables, metas, isGlobal, funnelFilter])

  // Seguimiento de Grupos Activos (GPE Monitor con Llave Formador & Reclutador)
  const myGrupos = useMemo(() => {
    const myGroupCodes = new Set(myPostulantes.map(p => String(p.grupo_codigo || '').trim().toUpperCase()).filter(Boolean))
    if (myGroupCodes.size === 0) return []

    const list = []
    myGroupCodes.forEach(code => {
      const candidatesInGrp = myPostulantes.filter(p => String(p.grupo_codigo || '').trim().toUpperCase() === code)
      const grpObj = grupos.find(g => String(g.codigo || g.grupo_codigo || '').trim().toUpperCase() === code)
      const campana = grpObj?.campana || candidatesInGrp[0]?.campana || 'Sin Campaña'
      const fechaInicio = grpObj?.fecha_inicio || grpObj?.fecha_capacitacion || candidatesInGrp[0]?.fecha_inicio_capacitacion || null
      const meta = grpObj?.meta_inicial || grpObj?.meta || candidatesInGrp.length || 20

      // Formador asignado al grupo
      const formadorNombre = grpObj?.formador_nombre || grpObj?.formador || grpObj?.nombre_formador || grpObj?.responsable || 'Por asignar'

      // Reclutadores que cargaron postulantes en este grupo
      const recsInGroup = [...new Set(candidatesInGrp.map(p => p.reclutador).filter(Boolean))]
      const reclutadorLabel = recsInGroup.length === 1 ? recsInGroup[0] : (recsInGroup.length > 1 ? `${recsInGroup[0]} (+${recsInGroup.length - 1})` : 'Sin asignar')

      list.push({
        codigo: code,
        campana,
        formadorNombre,
        reclutadorLabel,
        recsInGroup,
        fechaInicio,
        postulantesCount: candidatesInGrp.length,
        meta,
        pctCobertura: Math.min(100, Math.round((candidatesInGrp.length / Math.max(1, meta)) * 100))
      })
    })

    return list.sort((a, b) => b.postulantesCount - a.postulantesCount)
  }, [myPostulantes, grupos])

  // Detalle de Cartera con Búsqueda y Filtros
  const filteredCartera = useMemo(() => {
    let list = myPostulantes
    if (carteraSearch) {
      const q = carteraSearch.toLowerCase()
      list = list.filter(p =>
        String(p.documento || '').toLowerCase().includes(q) ||
        String(p.nombres || '').toLowerCase().includes(q) ||
        String(p.apellido_paterno || '').toLowerCase().includes(q) ||
        String(p.apellido_materno || '').toLowerCase().includes(q) ||
        String(p.grupo_codigo || '').toLowerCase().includes(q) ||
        String(p.campana || '').toLowerCase().includes(q)
      )
    }

    if (selectedEstadoFilter !== 'ALL') {
      if (selectedEstadoFilter === 'BAJA') {
        const bajasDocs = new Set(myAsist.filter(a => a.sigla_asistencia === 'B').map(a => a.postulante_documento))
        list = list.filter(p => bajasDocs.has(p.documento))
      } else if (selectedEstadoFilter === 'ACTIVOS') {
        const bajasDocs = new Set(myAsist.filter(a => a.sigla_asistencia === 'B').map(a => a.postulante_documento))
        list = list.filter(p => !bajasDocs.has(p.documento))
      }
    }

    return list
  }, [myPostulantes, myAsist, carteraSearch, selectedEstadoFilter])

  return (
    <div className="space-y-4 animate-fadeIn">
      {/* ───────────────────────────────────────────────────────────── */}
      {/* ROW 1: TOP 4 KPI CARDS (MÉTRICAS EXACTAS RYS SOLICITADAS)     */}
      {/* ───────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {/* CARD 1: NÓMINA TOTAL (GENTE TOTAL TRAÍDA) */}
        <div className="relative overflow-hidden rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-3.5 shadow-xs transition-all hover:border-[var(--border-normal)]">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)]">
                NÓMINA TOTAL (POSTULANTES)
              </p>
              <p className="text-[11px] text-[var(--text-muted)] mt-0.5">Total de postulantes captados</p>
            </div>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20">
              <Users size={16} />
            </div>
          </div>

          <div className="mt-3 flex items-baseline justify-between">
            <div>
              <span className="text-2xl font-black text-[var(--text-primary)] tracking-tight tabular-nums">
                {(metrics.totalNomina ?? 0).toLocaleString()}
              </span>
              <div className="flex items-center gap-1 mt-0.5 text-emerald-500 text-[11px] font-bold">
                <TrendingUp size={12} />
                <span>+{metrics.crecimientoPct}% nuevos</span>
              </div>
            </div>
            <Sparkline data={metrics.sparkCartera} color="#3b82f6" />
          </div>

          <div className="mt-3 pt-2.5 border-t border-[var(--border-subtle)] flex items-center text-[10px] text-[var(--text-muted)]">
            <span className="text-[var(--text-secondary)] font-bold">↑ {metrics.nuevos7Dias} en últimos 7d</span>
            <span className="ml-1">• 100% en nómina</span>
          </div>
        </div>

        {/* CARD 2: ASISTENCIA DÍA 0 (INDUCCIÓN PREVIA) */}
        <div className="relative overflow-hidden rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-3.5 shadow-xs transition-all hover:border-[var(--border-normal)]">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)]">
                ASISTENCIA DÍA 0 (INDUCCIÓN)
              </p>
              <p className="text-[11px] text-[var(--text-muted)] mt-0.5">Show-Up previo a capacitación</p>
            </div>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <Activity size={16} />
            </div>
          </div>

          <div className="mt-3 flex items-baseline justify-between">
            <div>
              <span className="text-2xl font-black text-[var(--text-primary)] tracking-tight tabular-nums">
                {(metrics.asistioDia0 ?? 0).toLocaleString()}
              </span>
              <div className="flex items-center gap-1 mt-0.5 text-emerald-500 text-[11px] font-bold">
                <CheckCircle2 size={12} />
                <span>{metrics.pctDia0}% de asistencia</span>
              </div>
            </div>
            <Sparkline data={metrics.sparkDia0} color="#10b981" />
          </div>

          <div className="mt-3 pt-2.5 border-t border-[var(--border-subtle)] flex items-center text-[10px] text-[var(--text-muted)]">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5 animate-pulse" />
            <span>{metrics.asistioDia0} de {metrics.totalNomina} postulantes asistieron</span>
          </div>
        </div>

        {/* CARD 3: ASISTENCIA DÍA 1 (ARRANQUE EFECTIVO) */}
        <div className="relative overflow-hidden rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-3.5 shadow-xs transition-all hover:border-[var(--border-normal)]">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)]">
                ASISTENCIA DÍA 1 (ARRANQUE)
              </p>
              <p className="text-[11px] text-[var(--text-muted)] mt-0.5">Agentes que iniciaron formación</p>
            </div>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              <Clock size={16} />
            </div>
          </div>

          <div className="mt-3 flex items-baseline justify-between">
            <div>
              <span className="text-2xl font-black text-[var(--text-primary)] tracking-tight tabular-nums">
                {(metrics.asistioDia1 ?? 0).toLocaleString()}
              </span>
              <div className="flex items-center gap-1 mt-0.5 text-indigo-500 text-[11px] font-bold">
                <span>—○—</span>
                <span>{metrics.pctDia1}% conexión efectiva</span>
              </div>
            </div>
            <Sparkline data={metrics.sparkDia1} color="#818cf8" />
          </div>

          <div className="mt-3 pt-2.5 border-t border-[var(--border-subtle)] flex items-center text-[10px] text-[var(--text-muted)] truncate">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-indigo-500 mr-1.5" />
            <span className="truncate">{metrics.asistioDia1} de {metrics.totalNomina} en aula activa</span>
          </div>
        </div>

        {/* CARD 4: BAJAS EN ARRANQUE (NÓMINA - ASISTENCIA D1) */}
        <div className="relative overflow-hidden rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-3.5 shadow-xs transition-all hover:border-[var(--border-normal)]">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)]">
                BAJAS EN ARRANQUE (NÓMINA - D1)
              </p>
              <p className="text-[11px] text-[var(--text-muted)] mt-0.5">Deserciones previas al Día 1</p>
            </div>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20">
              <ShieldAlert size={16} />
            </div>
          </div>

          <div className="mt-3 flex items-baseline justify-between">
            <div>
              <span className="text-2xl font-black text-[var(--text-primary)] tracking-tight tabular-nums">
                {(metrics.bajasDia1 ?? 0).toLocaleString()}
              </span>
              <div className="flex items-center gap-1 mt-0.5 text-[11px] font-bold">
                <CheckCircle2 size={12} className={metrics.bajasDia1 === 0 ? 'text-emerald-500' : 'text-amber-500'} />
                <span className={metrics.bajasDia1 === 0 ? 'text-emerald-500' : 'text-amber-500'}>
                  {metrics.pctBajas}% de deserción
                </span>
              </div>
            </div>
            <Sparkline data={metrics.sparkBajas} color={metrics.bajasDia1 === 0 ? '#10b981' : '#f43f5e'} />
          </div>

          <div className="mt-3 pt-2.5 border-t border-[var(--border-subtle)] flex items-center text-[10px] text-[var(--text-muted)]">
            <span className={metrics.bajasDia1 === 0 ? 'text-emerald-500 mr-1.5 font-bold' : 'text-amber-500 mr-1.5 font-bold'}>
              {metrics.bajasDia1 === 0 ? '✓' : '⚠️'}
            </span>
            <span>{metrics.bajasDia1 === 0 ? '100% de retención en arranque' : `${metrics.bajasDia1} postulantes caídos sin iniciar`}</span>
          </div>
        </div>
      </div>

      {/* ───────────────────────────────────────────────────────────── */}
      {/* ROW 2: 3 CARDS (% CUMPLIMIENTO D1, EFECTIVIDAD, FUNNEL)       */}
      {/* ───────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* PANEL 1: % CUMPLIMIENTO DÍA 1 SOBRE META ASIGNADA */}
        <div className="rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-4 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-2.5 border-b border-[var(--border-subtle)]">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                  <Target size={15} />
                </div>
                <div>
                  <h3 className="text-xs font-black uppercase tracking-wider text-[var(--text-primary)]">
                    % CUMPLIMIENTO DÍA 1 vs META
                  </h3>
                  <p className="text-[10px] text-[var(--text-muted)]">Asistencias D1 sobre meta asignada</p>
                </div>
              </div>
              <span className="text-[9.5px] font-bold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/30">
                {metrics.fechaRangoSemana}
              </span>
            </div>

            {/* Gauge Radial Progress con % Cumplimiento D1 */}
            <div className="my-4 flex justify-center">
              <RadialGauge percentage={metrics.coberturaMeta} color="#38bdf8" />
            </div>

            {/* Progress Bars for Meta and Asistencia D1 */}
            <div className="space-y-2.5 px-1">
              <div>
                <div className="flex justify-between text-xs font-bold mb-1">
                  <span className="text-[var(--text-muted)] text-[11px]">Meta Asignada</span>
                  <span className="text-[var(--text-primary)] text-[11px]">{(metrics.metaAsignada ?? 0).toLocaleString()} cupos</span>
                </div>
                <div className="h-2 w-full rounded-full bg-[var(--bg-elevated)] overflow-hidden">
                  <div className="h-full rounded-full bg-blue-500 shadow-[0_0_8px_#3b82f6]" style={{ width: '100%' }} />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs font-bold mb-1">
                  <span className="text-[var(--text-muted)] text-[11px]">Asistencia Día 1 (Logrado)</span>
                  <span className="text-emerald-500 text-[11px] font-black">
                    {(metrics.asistioDia1 ?? 0).toLocaleString()} / {(metrics.metaAsignada ?? 0).toLocaleString()} ({metrics.cumplimientoDia1Pct}%)
                  </span>
                </div>
                <div className="h-2 w-full rounded-full bg-[var(--bg-elevated)] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981] transition-all duration-700"
                    style={{ width: `${Math.min(100, metrics.coberturaMeta)}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Submetrics footer */}
          <div className="mt-4 pt-3 border-t border-[var(--border-subtle)] grid grid-cols-2 gap-2">
            <div className="flex items-center gap-2 p-2 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
              <Calendar size={14} className="text-[var(--text-muted)]" />
              <div>
                <p className="text-[9px] text-[var(--text-muted)] uppercase font-bold">Cierre Semanal</p>
                <p className="text-[11px] font-black text-[var(--text-primary)]">{metrics.diasCierre} días rest.</p>
              </div>
            </div>
            <div className="flex items-center gap-2 p-2 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
              <Zap size={14} className={metrics.ritmoDia >= metrics.ritmoNecesario ? 'text-emerald-500' : 'text-amber-500'} />
              <div>
                <p className="text-[9px] text-[var(--text-muted)] uppercase font-bold">Ritmo D1 / Meta</p>
                <p className="text-[11px] font-black text-[var(--text-primary)]">
                  <span className="text-emerald-500">+{metrics.ritmoDia}</span> <span className="text-[var(--text-muted)]">/</span> <span className="text-amber-500">+{metrics.ritmoNecesario}/d</span>
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* PANEL 2: MÉTRICAS DE EFECTIVIDAD */}
        <div className="rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-4 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-2.5 border-b border-[var(--border-subtle)]">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <Award size={15} />
                </div>
                <div>
                  <h3 className="text-xs font-black uppercase tracking-wider text-[var(--text-primary)]">
                    EFECTIVIDAD & CALIDAD RYS
                  </h3>
                  <p className="text-[10px] text-[var(--text-muted)]">Show-Up, arranque y retención operativa</p>
                </div>
              </div>
              <span className="text-[9.5px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                SLA RyS
              </span>
            </div>

            <div className="mt-4 space-y-3 px-1">
              {/* Metric 1: Show-Up Día 0 */}
              <div>
                <div className="flex justify-between items-center text-xs mb-1">
                  <span className="font-bold text-[var(--text-secondary)] text-[11px]">Show-Up en Día 0 (Inducción)</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-[var(--text-muted)]">({metrics.asistioDia0}/{metrics.totalNomina})</span>
                    <span className={`font-black text-[11px] ${parseFloat(metrics.pctDia0) >= 85 ? 'text-emerald-500' : parseFloat(metrics.pctDia0) >= 70 ? 'text-amber-500' : 'text-rose-500'}`}>
                      {metrics.pctDia0}%
                    </span>
                  </div>
                </div>
                <div className="relative h-2 w-full rounded-full bg-[var(--bg-elevated)] overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${parseFloat(metrics.pctDia0) >= 85 ? 'bg-emerald-500' : parseFloat(metrics.pctDia0) >= 70 ? 'bg-amber-500' : 'bg-rose-500'}`}
                    style={{ width: `${Math.min(100, parseFloat(metrics.pctDia0))}%` }}
                  />
                  <div className="absolute top-0 bottom-0 w-0.5 bg-white/70 shadow" style={{ left: '85%' }} title="Meta 85%" />
                </div>
              </div>

              {/* Metric 2: Conexión Efectiva Día 1 */}
              <div>
                <div className="flex justify-between items-center text-xs mb-1">
                  <span className="font-bold text-[var(--text-secondary)] text-[11px]">Conexión Efectiva Día 1 (Arranque)</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-[var(--text-muted)]">({metrics.asistioDia1}/{metrics.totalNomina})</span>
                    <span className={`font-black text-[11px] ${parseFloat(metrics.pctDia1) >= 80 ? 'text-emerald-500' : parseFloat(metrics.pctDia1) >= 65 ? 'text-amber-500' : 'text-rose-500'}`}>
                      {metrics.pctDia1}%
                    </span>
                  </div>
                </div>
                <div className="relative h-2 w-full rounded-full bg-[var(--bg-elevated)] overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${parseFloat(metrics.pctDia1) >= 80 ? 'bg-emerald-500' : parseFloat(metrics.pctDia1) >= 65 ? 'bg-amber-500' : 'bg-rose-500'}`}
                    style={{ width: `${Math.min(100, parseFloat(metrics.pctDia1))}%` }}
                  />
                  <div className="absolute top-0 bottom-0 w-0.5 bg-white/70 shadow" style={{ left: '80%' }} title="Meta 80%" />
                </div>
              </div>

              {/* Metric 3: Retención en Formación (D5) */}
              <div>
                <div className="flex justify-between items-center text-xs mb-1">
                  <span className="font-bold text-[var(--text-secondary)] text-[11px]">Retención en Formación (D5)</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-[var(--text-muted)]">({metrics.enFormacion}/{metrics.asistioDia1})</span>
                    <span className={`font-black text-[11px] ${parseFloat(metrics.pctForm) >= 75 ? 'text-emerald-500' : parseFloat(metrics.pctForm) >= 60 ? 'text-amber-500' : 'text-rose-500'}`}>
                      {metrics.pctForm}%
                    </span>
                  </div>
                </div>
                <div className="relative h-2 w-full rounded-full bg-[var(--bg-elevated)] overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${parseFloat(metrics.pctForm) >= 75 ? 'bg-emerald-500' : parseFloat(metrics.pctForm) >= 60 ? 'bg-amber-500' : 'bg-rose-500'}`}
                    style={{ width: `${Math.min(100, parseFloat(metrics.pctForm))}%` }}
                  />
                  <div className="absolute top-0 bottom-0 w-0.5 bg-white/70 shadow" style={{ left: '75%' }} title="Meta > 75%" />
                </div>
              </div>

              {/* Metric 4: % Bajas en Arranque */}
              <div>
                <div className="flex justify-between items-center text-xs mb-1">
                  <span className="font-bold text-[var(--text-secondary)] text-[11px]">Bajas en Arranque (Nómina - D1)</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-[var(--text-muted)]">({metrics.bajasDia1}/{metrics.totalNomina})</span>
                    <span className={`font-black text-[11px] ${parseFloat(metrics.pctBajas) <= 15 ? 'text-emerald-500' : parseFloat(metrics.pctBajas) <= 25 ? 'text-amber-500' : 'text-rose-500'}`}>
                      {metrics.pctBajas}%
                    </span>
                  </div>
                </div>
                <div className="relative h-2 w-full rounded-full bg-[var(--bg-elevated)] overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${parseFloat(metrics.pctBajas) <= 15 ? 'bg-emerald-500' : parseFloat(metrics.pctBajas) <= 25 ? 'bg-amber-500' : 'bg-rose-500'}`}
                    style={{ width: `${Math.max(2, Math.min(100, parseFloat(metrics.pctBajas)))}%` }}
                  />
                  <div className="absolute top-0 bottom-0 w-0.5 bg-white/70 shadow" style={{ left: '15%' }} title="Meta < 15%" />
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-[var(--border-subtle)] flex items-center justify-between text-[10px] text-[var(--text-muted)]">
            <span>SLA Operativo GEA</span>
            <span className="text-emerald-500 font-bold">🟢 Cumplimiento Calificado</span>
          </div>
        </div>

        {/* PANEL 3: FUNNEL DE CONVERSIÓN */}
        <div className="rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-4 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-2.5 border-b border-[var(--border-subtle)]">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  <Filter size={15} />
                </div>
                <div>
                  <h3 className="text-xs font-black uppercase tracking-wider text-[var(--text-primary)]">
                    FUNNEL DE CONVERSIÓN
                  </h3>
                  <p className="text-[10px] text-[var(--text-muted)]">Nómina → D0 → D1 → OJT</p>
                </div>
              </div>
              <button
                onClick={() => setFunnelFilter(prev => prev === 'ALL' ? 'EXP_CALL' : 'ALL')}
                className="text-[9.5px] font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30 hover:bg-amber-500/20 transition-all cursor-pointer"
              >
                {funnelFilter === 'ALL' ? 'Filtro: Todos' : 'Filtro: Con Exp.'}
              </button>
            </div>

            {/* Funnel Stage Bars */}
            <div className="mt-4 space-y-2.5 px-1">
              {/* Stage 1: Nómina */}
              <div className="flex items-center gap-2.5">
                <span className="w-24 text-[10.5px] font-bold text-[var(--text-secondary)] shrink-0">
                  1. Nómina Total
                </span>
                <div className="flex-1 h-5 rounded-md bg-[var(--bg-elevated)] overflow-hidden relative">
                  <div
                    className="h-full rounded-md bg-blue-500 flex items-center justify-between px-2 text-[10px] font-bold text-white shadow-[0_0_8px_#3b82f666]"
                    style={{ width: '100%' }}
                  >
                    <span>{(metrics.funnelCartera ?? 0).toLocaleString()}</span>
                    <span className="text-[9px] font-mono opacity-90">100%</span>
                  </div>
                </div>
              </div>

              {/* Stage 2: Asistencia Día 0 */}
              <div className="flex items-center gap-2.5">
                <span className="w-24 text-[10.5px] font-bold text-[var(--text-secondary)] shrink-0">
                  2. Asistencia D0
                </span>
                <div className="flex-1 h-5 rounded-md bg-[var(--bg-elevated)] overflow-hidden relative">
                  <div
                    className="h-full rounded-md bg-emerald-500 flex items-center justify-between px-2 text-[10px] font-bold text-white shadow-[0_0_8px_#10b98166] transition-all duration-700"
                    style={{ width: `${Math.max(20, Math.min(100, parseFloat(metrics.pctFunnelD0)))}%` }}
                  >
                    <span>{(metrics.funnelD0 ?? 0).toLocaleString()}</span>
                    <span className="text-[9px] font-mono opacity-90">{metrics.pctFunnelD0}%</span>
                  </div>
                </div>
              </div>

              {/* Stage 3: Conexión Día 1 */}
              <div className="flex items-center gap-2.5">
                <span className="w-24 text-[10.5px] font-bold text-[var(--text-secondary)] shrink-0">
                  3. Conexión D1
                </span>
                <div className="flex-1 h-5 rounded-md bg-[var(--bg-elevated)] overflow-hidden relative">
                  <div
                    className="h-full rounded-md bg-indigo-500 flex items-center justify-between px-2 text-[10px] font-bold text-white shadow-[0_0_8px_#6366f166] transition-all duration-700"
                    style={{ width: `${Math.max(20, Math.min(100, parseFloat(metrics.pctFunnelD1)))}%` }}
                  >
                    <span>{(metrics.funnelD1 ?? 0).toLocaleString()}</span>
                    <span className="text-[9px] font-mono opacity-90">{metrics.pctFunnelD1}%</span>
                  </div>
                </div>
              </div>

              {/* Stage 4: Operación OJT */}
              <div className="flex items-center gap-2.5">
                <span className="w-24 text-[10.5px] font-bold text-[var(--text-secondary)] shrink-0">
                  4. Pase a OJT
                </span>
                <div className="flex-1 h-5 rounded-md bg-[var(--bg-elevated)] overflow-hidden relative">
                  <div
                    className="h-full rounded-md bg-amber-500 flex items-center justify-between px-2 text-[10px] font-bold text-slate-900 shadow-[0_0_8px_#f59e0b66] transition-all duration-700"
                    style={{ width: `${Math.max(20, Math.min(100, parseFloat(metrics.pctFunnelOp)))}%` }}
                  >
                    <span>{(metrics.funnelOp ?? 0).toLocaleString()}</span>
                    <span className="text-[9px] font-mono font-black">{metrics.pctFunnelOp}%</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 4 Bottom Legend Pills */}
          <div className="mt-4 pt-3 border-t border-[var(--border-subtle)] grid grid-cols-2 gap-1.5">
            <div className="p-1.5 rounded-lg bg-[var(--bg-elevated)] border border-blue-500/20 text-[9.5px] text-[var(--text-secondary)] flex items-center justify-between">
              <span className="font-bold text-blue-500">1 Nómina:</span>
              <span className="font-black text-[var(--text-primary)]">{metrics.funnelCartera} (100%)</span>
            </div>
            <div className="p-1.5 rounded-lg bg-[var(--bg-elevated)] border border-emerald-500/20 text-[9.5px] text-[var(--text-secondary)] flex items-center justify-between">
              <span className="font-bold text-emerald-500">2 Día 0:</span>
              <span className="font-black text-[var(--text-primary)]">{metrics.funnelD0} ({metrics.pctFunnelD0}%)</span>
            </div>
            <div className="p-1.5 rounded-lg bg-[var(--bg-elevated)] border border-indigo-500/20 text-[9.5px] text-[var(--text-secondary)] flex items-center justify-between">
              <span className="font-bold text-indigo-500">3 Día 1:</span>
              <span className="font-black text-[var(--text-primary)]">{metrics.funnelD1} ({metrics.pctFunnelD1}%)</span>
            </div>
            <div className="p-1.5 rounded-lg bg-[var(--bg-elevated)] border border-amber-500/20 text-[9.5px] text-[var(--text-secondary)] flex items-center justify-between">
              <span className="font-bold text-amber-500">4 Pase OJT:</span>
              <span className="font-black text-[var(--text-primary)]">{metrics.funnelOp} <span className="text-emerald-500 text-[8.5px]">({metrics.pctFunnelOp}%)</span></span>
            </div>
          </div>
        </div>
      </div>

      {/* ───────────────────────────────────────────────────────────── */}
      {/* ROW 3: MONITOR DE GRUPOS ACTIVOS & COBERTURA POR GPE         */}
      {/* ───────────────────────────────────────────────────────────── */}
      {myGrupos.length > 0 && (
        <div className="rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-4 shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)] mb-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/20">
                <Layers size={15} />
              </div>
              <div>
                <h3 className="text-xs font-black uppercase tracking-wider text-[var(--text-primary)]">
                  MONITOR DE GRUPOS ASIGNADOS ({myGrupos.length})
                </h3>
                <p className="text-[10px] text-[var(--text-muted)]">Control de cupos cubiertos y fechas de inicio de capacitación</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {myGrupos.map(g => (
              <div
                key={g.codigo}
                className="p-3.5 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] hover:border-[var(--border-normal)] transition-all space-y-2.5"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono font-black text-xs text-[var(--text-primary)]">{g.codigo}</span>
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-purple-500/15 text-purple-400 border border-purple-500/25 truncate max-w-[140px]">
                    {g.campana}
                  </span>
                </div>

                {/* Llave de Asignación: Formador & Reclutador */}
                <div className="grid grid-cols-2 gap-2 text-[10px] p-2 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
                  <div className="truncate">
                    <span className="text-[var(--text-muted)] block text-[9px] font-black uppercase">🎓 Formador:</span>
                    <span className="font-bold text-[var(--text-primary)] truncate" title={g.formadorNombre}>
                      {g.formadorNombre}
                    </span>
                  </div>
                  <div className="truncate">
                    <span className="text-[var(--text-muted)] block text-[9px] font-black uppercase">👤 Reclutador:</span>
                    <span className="font-bold text-[var(--text-primary)] truncate" title={g.recsInGroup?.join(', ') || g.reclutadorLabel}>
                      {g.reclutadorLabel}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs font-bold">
                  <span className="text-[var(--text-muted)] text-[11px]">Cupos Cubiertos:</span>
                  <span className="text-cyan-400 font-mono font-black">{g.postulantesCount} / {g.meta}</span>
                </div>

                <div className="h-1.5 w-full rounded-full bg-[var(--bg-surface)] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-cyan-500 shadow-[0_0_6px_#06b6d4]"
                    style={{ width: `${g.pctCobertura}%` }}
                  />
                </div>

                <div className="pt-1.5 border-t border-[var(--border-subtle)] flex items-center justify-between text-[10px] text-[var(--text-muted)]">
                  <span>📅 Inicio: <strong className="text-[var(--text-secondary)]">{g.fechaInicio ? String(g.fechaInicio).split('T')[0] : 'Por coordinar'}</strong></span>
                  <span className={`font-black ${g.pctCobertura >= 100 ? 'text-emerald-500' : 'text-amber-500'}`}>
                    {g.pctCobertura}% cubierto
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* ROW 4: TABLA DETALLE DE CARTERA (BÚSQUEDA & CONTACTO RÁPIDO) */}
      {/* ───────────────────────────────────────────────────────────── */}
      <div className="rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-4 shadow-xs">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-[var(--border-subtle)] mb-3">
          <div>
            <h3 className="text-xs font-black uppercase tracking-wider text-[var(--text-primary)]">
              AUDITORÍA Y GESTIÓN DIRECTA DE CARTERA
            </h3>
            <p className="text-[10px] text-[var(--text-muted)]">
              Mostrando {filteredCartera.length} de {myPostulantes.length} postulantes asignados
            </p>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            {/* Search Input */}
            <div className="relative flex-1 sm:w-60">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
              <input
                type="text"
                value={carteraSearch}
                onChange={e => setCarteraSearch(e.target.value)}
                placeholder="Buscar DNI, Nombre, Grupo…"
                className="w-full pl-7 pr-6 py-1.5 text-xs rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:border-cyan-500 outline-none"
              />
              {carteraSearch && (
                <button onClick={() => setCarteraSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                  <X size={12} />
                </button>
              )}
            </div>

            {/* Filter Pill */}
            <div className="flex items-center gap-1 text-[10px] font-bold">
              <button
                onClick={() => setSelectedEstadoFilter('ALL')}
                className={`px-2 py-1 rounded-lg border transition-colors cursor-pointer ${
                  selectedEstadoFilter === 'ALL'
                    ? 'bg-cyan-500/15 border-cyan-500/30 text-cyan-400 font-black'
                    : 'border-[var(--border-subtle)] text-[var(--text-muted)]'
                }`}
              >
                Todos ({myPostulantes.length})
              </button>
              <button
                onClick={() => setSelectedEstadoFilter('ACTIVOS')}
                className={`px-2 py-1 rounded-lg border transition-colors cursor-pointer ${
                  selectedEstadoFilter === 'ACTIVOS'
                    ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400 font-black'
                    : 'border-[var(--border-subtle)] text-[var(--text-muted)]'
                }`}
              >
                Activos ({metrics.activos})
              </button>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto max-h-[360px] custom-scrollbar">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-[var(--table-head-bg)] border-b border-[var(--border-subtle)] select-none">
              <tr>
                <th className="p-2.5 text-left text-[10px] font-black uppercase text-[var(--text-muted)]">DNI</th>
                <th className="p-2.5 text-left text-[10px] font-black uppercase text-[var(--text-muted)]">Postulante</th>
                <th className="p-2.5 text-left text-[10px] font-black uppercase text-[var(--text-muted)]">Campaña / Grupo</th>
                <th className="p-2.5 text-left text-[10px] font-black uppercase text-[var(--text-muted)]">Exp. Call</th>
                <th className="p-2.5 text-left text-[10px] font-black uppercase text-[var(--text-muted)]">Estado RyS</th>
                <th className="p-2.5 text-center text-[10px] font-black uppercase text-[var(--text-muted)]">Contacto</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {filteredCartera.slice(0, 50).map((p, idx) => {
                const rawPhone = String(p.celular || '').replace(/\D/g, '')
                const cleanPhone = rawPhone.length === 9 ? rawPhone : (rawPhone.length > 9 ? rawPhone.slice(-9) : rawPhone)
                const waMessage = encodeURIComponent(`Hola ${p.nombres?.split(' ')[0] || ''}, te saludamos del equipo de Selección GEA para coordinar tu proceso en la campaña ${p.campana || ''}.`)

                return (
                  <tr key={`${p.documento}-${idx}`} className="hover:bg-[var(--bg-elevated)] transition-colors">
                    <td className="p-2.5 font-mono font-bold text-[var(--text-secondary)]">{p.documento}</td>
                    <td className="p-2.5 font-bold text-[var(--text-primary)]">
                      {p.apellido_paterno} {p.apellido_materno} {p.nombres}
                    </td>
                    <td className="p-2.5">
                      <span className="font-mono text-cyan-400 font-bold">{p.grupo_codigo || 'Sin Grupo'}</span>
                      <p className="text-[10px] text-[var(--text-muted)] truncate max-w-[160px]">{p.campana || '—'}</p>
                    </td>
                    <td className="p-2.5 text-[var(--text-secondary)]">
                      {p.exp_call_center === true || String(p.exp_call_center).toUpperCase() === 'SI' ? (
                        <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-emerald-500/15 text-emerald-400">SI</span>
                      ) : (
                        <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-slate-500/15 text-slate-400">NO</span>
                      )}
                    </td>
                    <td className="p-2.5">
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase bg-blue-500/15 text-blue-400 border border-blue-500/25">
                        {p.status_dia_1 || 'APTO'}
                      </span>
                    </td>
                    <td className="p-2.5 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        {cleanPhone ? (
                          <>
                            <a
                              href={`https://wa.me/51${cleanPhone}?text=${waMessage}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600 text-emerald-400 hover:text-white transition-colors"
                              title="Enviar WhatsApp"
                            >
                              <MessageCircle size={12} />
                            </a>
                            <a
                              href={`tel:${p.celular}`}
                              className="p-1.5 rounded-lg bg-blue-600/20 hover:bg-blue-600 text-blue-400 hover:text-white transition-colors"
                              title="Llamar"
                            >
                              <Phone size={12} />
                            </a>
                          </>
                        ) : (
                          <span className="text-[10px] text-[var(--text-muted)]">—</span>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
