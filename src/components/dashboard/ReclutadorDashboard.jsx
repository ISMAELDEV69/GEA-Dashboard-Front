import { useMemo, useState, memo } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import {
  PhoneCall, ThumbsUp, Target, Users, Percent, Award, AlertTriangle, Sparkles,
  UserCheck, RefreshCw, MessageCircle, Filter, Calendar, Layers, Clock, X, RotateCcw,
  Briefcase, GraduationCap, CheckCircle2, Key
} from 'lucide-react'
import {
  buildReclutadorNarrative, buildMotiveData, getCurrentWeek, ATTENDANCE_PRESENT
} from '../../lib/dashboardAnalytics'
import {
  filterPostulantesReclutador, computeMetasReclutador, filterBajasImputablesReclutador,
} from '../../lib/flujoOperativo'
import { DashboardHeader, KpiCard, StorySection, EmptyDataHint, CHART_COLORS, chartTooltipStyle } from './StoryComponents'
import CarteraReclutadorOverview from './CarteraReclutadorOverview'
import Card, { CardHeader } from '../ui/Card'

function matchRecruiter(candidateReclutador, targetName) {
  if (!candidateReclutador || !targetName) return false
  const c = String(candidateReclutador).trim().toUpperCase()
  const t = String(targetName).trim().toUpperCase()
  if (c === t) return true
  if (c.includes(t) || t.includes(c)) return true
  
  const cWords = c.split(/\s+/).filter(w => w.length >= 3)
  const tWords = t.split(/\s+/).filter(w => w.length >= 3)
  return cWords.some(w => tWords.includes(w))
}

function matchCampana(c1, c2) {
  if (!c1 || !c2) return false
  return String(c1).trim().toUpperCase() === String(c2).trim().toUpperCase()
}

function matchGrupo(g1, g2) {
  if (!g1 || !g2) return false
  const clean1 = String(g1).trim().toUpperCase().replace(/_\d+$/, '')
  const clean2 = String(g2).trim().toUpperCase().replace(/_\d+$/, '')
  return clean1 === clean2
}

function matchPeriodo(p1, p2) {
  if (!p1 || !p2) return false
  const clean1 = String(p1).replace(/\D/g, '')
  const clean2 = String(p2).replace(/\D/g, '')
  if (clean1 && clean2) return clean1 === clean2
  return String(p1).trim().toUpperCase() === String(p2).trim().toUpperCase()
}

function matchSemana(s1, s2) {
  if (!s1 || !s2) return false
  const n1 = String(s1).replace(/\D/g, '')
  const n2 = String(s2).replace(/\D/g, '')
  if (n1 && n2) return n1 === n2
  return String(s1).trim().toUpperCase() === String(s2).trim().toUpperCase()
}

function ReclutadorDashboard({
  postulantes = [],
  asistencias = [],
  userProfile = null,
  campanasMetas = [],
  reclutadores = [],
  grupos = [],
  isAdmin = false
}) {
  // Filtros Multidimensionales (Llave Bidireccional / Cross-Filtering)
  const [selectedRecName, setSelectedRecName]   = useState('ALL')
  const [selectedCampana, setSelectedCampana]   = useState('ALL')
  const [selectedGrupo, setSelectedGrupo]       = useState('ALL')
  const [selectedPeriodo, setSelectedPeriodo]   = useState('ALL')
  const [selectedSemana, setSelectedSemana]     = useState('ALL')
  const [selectedExpCall, setSelectedExpCall]   = useState('ALL')
  const [selectedEstado, setSelectedEstado]     = useState('ALL')

  // 1. Catálogo OFICIAL de reclutadores (exclusivo para usuarios con rol reclutador)
  const reclutadoresList = useMemo(() => {
    const list = []
    const seen = new Set()

    ;(reclutadores || []).forEach(r => {
      const name = typeof r === 'string' ? r.trim() : (r?.nombre_completo || r?.nombre || '').trim()
      if (name && !seen.has(name.toUpperCase())) {
        seen.add(name.toUpperCase())
        list.push(name)
      }
    })

    return list.sort((a, b) => a.localeCompare(b))
  }, [reclutadores])

  const isGlobalView = isAdmin && selectedRecName === 'ALL'

  // ── NIVEL 1 DE LLAVE: Postulantes filtrados por Reclutador ──
  const postulantesByRecruiter = useMemo(() => {
    if (isAdmin) {
      if (selectedRecName !== 'ALL') {
        return postulantes.filter(p => matchRecruiter(p.reclutador, selectedRecName))
      }
      return postulantes
    }
    return filterPostulantesReclutador(postulantes, userProfile, reclutadores)
  }, [postulantes, userProfile, reclutadores, isAdmin, selectedRecName])

  // ── NIVEL 2 DE LLAVE: Campañas activas para ese Reclutador ──
  const campanasList = useMemo(() => {
    const set = new Set()
    postulantesByRecruiter.forEach(p => {
      const c = String(p.campana || '').trim()
      if (c && c !== '-') set.add(c)
    })
    return Array.from(set).sort()
  }, [postulantesByRecruiter])

  const postulantesByCampana = useMemo(() => {
    if (selectedCampana === 'ALL') return postulantesByRecruiter
    return postulantesByRecruiter.filter(p => matchCampana(p.campana, selectedCampana))
  }, [postulantesByRecruiter, selectedCampana])

  // ── NIVEL 3 DE LLAVE: Grupos activos para ese Reclutador + Campaña ──
  const gruposList = useMemo(() => {
    const set = new Set()
    postulantesByCampana.forEach(p => {
      const g = String(p.grupo_codigo || '').trim()
      if (g && g !== '-') set.add(g)
    })
    return Array.from(set).sort()
  }, [postulantesByCampana])

  const postulantesByGrupo = useMemo(() => {
    if (selectedGrupo === 'ALL') return postulantesByCampana
    return postulantesByCampana.filter(p => matchGrupo(p.grupo_codigo, selectedGrupo))
  }, [postulantesByCampana, selectedGrupo])

  // ── NIVEL 4 DE LLAVE: Periodos activos para ese Reclutador + Campaña + Grupo ──
  const periodosList = useMemo(() => {
    const set = new Set()
    postulantesByGrupo.forEach(p => {
      const per = String(p.periodo_reclutado || p.periodo || '').trim()
      if (per && per !== '-') set.add(per)
    })
    return Array.from(set).sort().reverse()
  }, [postulantesByGrupo])

  const postulantesByPeriodo = useMemo(() => {
    if (selectedPeriodo === 'ALL') return postulantesByGrupo
    return postulantesByGrupo.filter(p => matchPeriodo(p.periodo_reclutado || p.periodo, selectedPeriodo))
  }, [postulantesByGrupo, selectedPeriodo])

  // ── NIVEL 5 DE LLAVE: Semanas activas para ese Reclutador + Campaña + Grupo + Periodo ──
  const semanasList = useMemo(() => {
    const set = new Set()
    postulantesByPeriodo.forEach(p => {
      const s = String(p.semana_trabajo || p.semana || '').trim()
      if (s && s !== '-' && s !== 'null') set.add(s)
    })
    return Array.from(set).sort((a, b) => Number(String(a).replace(/\D/g, '')) - Number(String(b).replace(/\D/g, '')))
  }, [postulantesByPeriodo])

  // ── RESULTADO FINAL: Postulantes con todos los filtros de la llave aplicados ──
  const myPostulantes = useMemo(() => {
    let list = postulantesByPeriodo

    if (selectedSemana !== 'ALL') {
      list = list.filter(p => matchSemana(p.semana_trabajo || p.semana, selectedSemana))
    }

    if (selectedExpCall !== 'ALL') {
      const wantsExp = selectedExpCall === 'SI'
      list = list.filter(p => (p.exp_call_center === true || String(p.exp_call_center).toUpperCase() === 'SI') === wantsExp)
    }

    if (selectedEstado !== 'ALL') {
      const bajasDocs = new Set(asistencias.filter(a => a.sigla_asistencia === 'B').map(a => a.postulante_documento))
      const opDocs = new Set(asistencias.filter(a => a.sigla_asistencia === 'I-OP' || a.dia >= 6).map(a => a.postulante_documento))

      if (selectedEstado === 'ACTIVOS') {
        list = list.filter(p => !bajasDocs.has(p.documento))
      } else if (selectedEstado === 'BAJAS') {
        list = list.filter(p => bajasDocs.has(p.documento))
      } else if (selectedEstado === 'OJT') {
        list = list.filter(p => opDocs.has(p.documento) || Boolean(p.fecha_conexion_op))
      } else if (selectedEstado === 'CAPACITACION') {
        list = list.filter(p => !bajasDocs.has(p.documento) && !opDocs.has(p.documento))
      }
    }

    return list
  }, [postulantesByPeriodo, selectedSemana, selectedExpCall, selectedEstado, asistencias])

  // ── DETALLE ASOCIATIVO DE LA LLAVE DEL GRUPO ACTIVO ──
  const activeGrupoInfo = useMemo(() => {
    if (selectedGrupo === 'ALL') return null
    const grpObj = grupos.find(g => matchGrupo(g.codigo || g.grupo_codigo, selectedGrupo))
    const inGrp = postulantes.filter(p => matchGrupo(p.grupo_codigo, selectedGrupo))
    const campana = grpObj?.campana || inGrp[0]?.campana || 'Sin Campaña'
    const formador = grpObj?.formador_nombre || grpObj?.formador || grpObj?.nombre_formador || grpObj?.responsable || 'Por asignar'
    const recs = [...new Set(inGrp.map(p => p.reclutador).filter(Boolean))]
    const fechaInicio = grpObj?.fecha_inicio || grpObj?.fecha_capacitacion || inGrp[0]?.fecha_inicio_capacitacion || null
    const periodo = grpObj?.periodo || inGrp[0]?.periodo_reclutado || inGrp[0]?.periodo || null
    const semana = grpObj?.semana_label || grpObj?.semana || inGrp[0]?.semana_trabajo || null

    return {
      codigo: selectedGrupo,
      campana,
      formador,
      reclutadores: recs,
      fechaInicio,
      periodo,
      semana,
      totalPostulantes: inGrp.length
    }
  }, [selectedGrupo, grupos, postulantes])

  // Handlers para efecto de Llave en Cascada (Cascade Reset)
  const handleRecruiterChange = (recName) => {
    setSelectedRecName(recName)
    setSelectedCampana('ALL')
    setSelectedGrupo('ALL')
    setSelectedPeriodo('ALL')
    setSelectedSemana('ALL')
  }

  const handleCampanaChange = (campana) => {
    setSelectedCampana(campana)
    setSelectedGrupo('ALL')
    setSelectedPeriodo('ALL')
    setSelectedSemana('ALL')
  }

  const handleGrupoChange = (grupo) => {
    setSelectedGrupo(grupo)
    if (grupo !== 'ALL') {
      const grpObj = grupos.find(g => matchGrupo(g.codigo || g.grupo_codigo, grupo))
      if (grpObj?.campana && selectedCampana === 'ALL') {
        setSelectedCampana(grpObj.campana)
      }
    }
    setSelectedPeriodo('ALL')
    setSelectedSemana('ALL')
  }

  const handlePeriodoChange = (periodo) => {
    setSelectedPeriodo(periodo)
    setSelectedSemana('ALL')
  }

  const activeFiltersCount = useMemo(() => {
    let count = 0
    if (isAdmin && selectedRecName !== 'ALL') count++
    if (selectedCampana !== 'ALL') count++
    if (selectedGrupo !== 'ALL') count++
    if (selectedPeriodo !== 'ALL') count++
    if (selectedSemana !== 'ALL') count++
    if (selectedExpCall !== 'ALL') count++
    if (selectedEstado !== 'ALL') count++
    return count
  }, [isAdmin, selectedRecName, selectedCampana, selectedGrupo, selectedPeriodo, selectedSemana, selectedExpCall, selectedEstado])

  const resetAllFilters = () => {
    setSelectedRecName('ALL')
    setSelectedCampana('ALL')
    setSelectedGrupo('ALL')
    setSelectedPeriodo('ALL')
    setSelectedSemana('ALL')
    setSelectedExpCall('ALL')
    setSelectedEstado('ALL')
  }

  const effectiveProfile = useMemo(() => {
    if (!isAdmin) return userProfile
    if (selectedRecName === 'ALL') return userProfile
    return {
      ...userProfile,
      nombre: selectedRecName,
      nombre_completo: selectedRecName,
    }
  }, [isAdmin, selectedRecName, userProfile])

  const myDocs = useMemo(() => new Set(myPostulantes.map(p => p.documento)), [myPostulantes])
  const myAsist = useMemo(() => asistencias.filter(a => myDocs.has(a.postulante_documento)), [asistencias, myDocs])

  const metas = useMemo(() =>
    computeMetasReclutador(campanasMetas, effectiveProfile, reclutadores, myPostulantes, getCurrentWeek()),
    [campanasMetas, effectiveProfile, reclutadores, myPostulantes])

  const bajasImputables = useMemo(() => {
    return myAsist.filter(a => a.sigla_asistencia === 'B' && a.atribucion_baja === 'RECLUTADOR')
  }, [myAsist])

  const stats = useMemo(() => {
    const total = myPostulantes.length
    const bajas = myAsist.filter(a => a.sigla_asistencia === 'B').length
    const bajasMiCulpa = bajasImputables.length
    const retentionRate = total > 0 ? Math.round(((total - bajasMiCulpa) / total) * 100) : 100
    const weeklyCount = metas.derivadosSemana
    const conExp = myPostulantes.filter(p => p.exp_call_center === true || String(p.exp_call_center).toUpperCase() === 'SI').length
    const enOp = myPostulantes.filter(p =>
      p.fecha_conexion_op || myAsist.some(a => a.postulante_documento === p.documento && a.sigla_asistencia === 'I-OP'))
    return { total, bajas, bajasMiCulpa, retentionRate, weeklyCount, conExp, enOp, currentWeek: getCurrentWeek() }
  }, [myPostulantes, myAsist, bajasImputables, metas])

  const stories = useMemo(() => buildReclutadorNarrative(stats, myPostulantes), [stats, myPostulantes])
  const myMotivos = useMemo(() => buildMotiveData(bajasImputables), [bajasImputables])

  // Candidatos que FALTARON a su DÍA 0 o DÍA 1 para rescate y contacto inmediato por el Reclutador
  const faltantesDia1 = useMemo(() => {
    const map = new Map()

    myAsist.forEach(a => {
      const isFalta = (a.sigla_asistencia === 'FI' || a.sigla_asistencia === 'F' || a.sigla_asistencia === 'NSP' || a.sigla_asistencia === 'B')
      if ((Number(a.dia) === 0 || Number(a.dia) === 1) && isFalta) {
        const c = myPostulantes.find(p => p.documento === a.postulante_documento)
        if (c && !map.has(c.documento)) {
          const rawPhone = String(c.celular || '').replace(/\D/g, '')
          const cleanPhone = rawPhone.length === 9 ? rawPhone : (rawPhone.length > 9 ? rawPhone.slice(-9) : rawPhone)
          const primerNombre = (c.nombres || '').split(' ')[0] || 'postulante'
          map.set(c.documento, {
            documento: c.documento,
            nombre: `${c.apellido_paterno || ''} ${c.apellido_materno || ''} ${c.nombres || ''}`.trim() || c.documento,
            primerNombre,
            celular: c.celular,
            cleanPhone,
            campana: c.campana || 'General',
            fecha: a.fecha || c.fecha_registro,
            tipoFalta: a.sigla_asistencia === 'B' ? 'Baja' : (Number(a.dia) === 0 ? 'Falta D0' : 'Falta D1'),
            motivoBaja: a.motivo_baja || null
          })
        }
      }
    })

    myPostulantes.forEach(c => {
      const st = String(c.status_dia_1 || '').toUpperCase()
      const d0 = String(c.dia_0 || '').toUpperCase()
      const isFaltaNomina = st === 'FALTA' || st === 'DESISTIDO' || st === 'NSP' || d0 === 'FALTA'
      if (isFaltaNomina && !map.has(c.documento)) {
        const rawPhone = String(c.celular || '').replace(/\D/g, '')
        const cleanPhone = rawPhone.length === 9 ? rawPhone : (rawPhone.length > 9 ? rawPhone.slice(-9) : rawPhone)
        const primerNombre = (c.nombres || '').split(' ')[0] || 'postulante'
        map.set(c.documento, {
          documento: c.documento,
          nombre: `${c.apellido_paterno || ''} ${c.apellido_materno || ''} ${c.nombres || ''}`.trim() || c.documento,
          primerNombre,
          celular: c.celular,
          cleanPhone,
          campana: c.campana || 'General',
          fecha: c.fecha_registro || null,
          tipoFalta: st === 'DESISTIDO' ? 'Desistió' : 'Falta D1',
          motivoBaja: c.dia_1_obs || c.dia_0_obs || null
        })
      }
    })

    return Array.from(map.values()).slice(0, 10)
  }, [myAsist, myPostulantes])

  return (
    <div className="h-full flex flex-col overflow-y-auto custom-scrollbar p-3 sm:p-4 gap-3.5 bg-[var(--bg-base)] text-[var(--text-primary)]">
      {/* ── 1. Top Header Bar ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl p-4 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-base sm:text-lg font-black tracking-tight text-[var(--text-primary)]">
              MI CARTERA & RECLUTAMIENTO
            </h1>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/30">
              {isAdmin ? (selectedRecName === 'ALL' ? 'Supervisión Global' : `Cartera: ${selectedRecName}`) : (stats.retentionRate >= 80 ? 'Reclutador Calificado' : 'En Seguimiento')}
            </span>
          </div>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            {isAdmin
              ? (selectedRecName === 'ALL'
                  ? `Supervisión global de ${postulantes.length} postulantes registrados`
                  : `Visualizando la cartera de ${selectedRecName} (${myPostulantes.length} postulantes)`)
              : `${userProfile?.nombre || 'Reclutador'} — Gestión Integral de Cartera, Efectividad y Funnel Operativo`}
          </p>
        </div>

        {/* Counter and Active Filters Badge */}
        <div className="flex items-center gap-2">
          {activeFiltersCount > 0 && (
            <button
              onClick={resetAllFilters}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-rose-500/15 hover:bg-rose-500/25 text-rose-600 dark:text-rose-400 border border-rose-500/30 transition-all cursor-pointer shadow-2xs active:scale-95"
              title="Restablecer todos los filtros"
            >
              <RotateCcw size={13} />
              <span>Limpiar Filtros ({activeFiltersCount})</span>
            </button>
          )}
          <span className="text-xs font-mono font-bold px-3 py-1.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-600 dark:text-cyan-400">
            {myPostulantes.length} postulante(s)
          </span>
        </div>
      </div>

      {/* ── 2. Barra de Filtros Multidimensional (Llave Maestra) ── */}
      <div className="p-3.5 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl shadow-xs space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-[var(--border-subtle)]">
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-[var(--text-primary)]">
            <Filter size={14} className="text-cyan-500" />
            <span>Filtros de Segmentación & Análisis (Llave Maestra)</span>
          </div>
          <span className="text-[11px] text-[var(--text-muted)]">
            {activeFiltersCount === 0 ? 'Sin filtros aplicados (Mostrando todo)' : `${activeFiltersCount} filtro(s) activo(s)`}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-2.5">
          {/* 1. Reclutador (Admin only: sólo usuarios del equipo de reclutamiento) */}
          {isAdmin && (
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-[var(--text-muted)] flex items-center gap-1">
                <UserCheck size={11} className="text-blue-500" />
                <span>Reclutador</span>
              </label>
              <select
                value={selectedRecName}
                onChange={(e) => handleRecruiterChange(e.target.value)}
                className="w-full bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 px-2.5 py-1.5 rounded-xl text-xs font-bold outline-none cursor-pointer shadow-xs focus:ring-1 focus:ring-cyan-500 truncate"
              >
                <option value="ALL" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">
                  Todos ({postulantes.length})
                </option>
                {reclutadoresList.map((recName) => {
                  const count = postulantes.filter(p => matchRecruiter(p.reclutador, recName)).length
                  return (
                    <option key={recName} value={recName} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">
                      {recName} ({count})
                    </option>
                  )
                })}
              </select>
            </div>
          )}

          {/* 2. Campaña (en cascada) */}
          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase text-[var(--text-muted)] flex items-center gap-1">
              <Layers size={11} className="text-purple-500" />
              <span>Campaña</span>
            </label>
            <select
              value={selectedCampana}
              onChange={(e) => handleCampanaChange(e.target.value)}
              className="w-full bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 px-2.5 py-1.5 rounded-xl text-xs font-bold outline-none cursor-pointer shadow-xs focus:ring-1 focus:ring-cyan-500 truncate"
            >
              <option value="ALL" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">
                Todas ({campanasList.length})
              </option>
              {campanasList.map((c) => {
                const count = postulantesByRecruiter.filter(p => matchCampana(p.campana, c)).length
                return (
                  <option key={c} value={c} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">
                    {c} ({count})
                  </option>
                )
              })}
            </select>
          </div>

          {/* 3. Grupo (GPE en cascada) */}
          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase text-[var(--text-muted)] flex items-center gap-1">
              <Clock size={11} className="text-amber-500" />
              <span>Grupo (GPE)</span>
            </label>
            <select
              value={selectedGrupo}
              onChange={(e) => handleGrupoChange(e.target.value)}
              className="w-full bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 px-2.5 py-1.5 rounded-xl text-xs font-bold outline-none cursor-pointer shadow-xs focus:ring-1 focus:ring-cyan-500 truncate font-mono"
            >
              <option value="ALL" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 font-sans">
                Todos ({gruposList.length})
              </option>
              {gruposList.map((g) => {
                const count = postulantesByCampana.filter(p => matchGrupo(p.grupo_codigo, g)).length
                const grpMeta = grupos.find(gr => matchGrupo(gr.codigo, g))
                const formName = grpMeta?.formador_nombre || grpMeta?.formador || ''
                return (
                  <option key={g} value={g} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">
                    {g} ({count}){formName ? ` · 🎓 ${formName.split(' ')[0]}` : ''}
                  </option>
                )
              })}
            </select>
          </div>

          {/* 4. Periodo (en cascada) */}
          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase text-[var(--text-muted)] flex items-center gap-1">
              <Calendar size={11} className="text-emerald-500" />
              <span>Periodo</span>
            </label>
            <select
              value={selectedPeriodo}
              onChange={(e) => handlePeriodoChange(e.target.value)}
              className="w-full bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 px-2.5 py-1.5 rounded-xl text-xs font-bold outline-none cursor-pointer shadow-xs focus:ring-1 focus:ring-cyan-500 font-mono"
            >
              <option value="ALL" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 font-sans">
                Todos ({periodosList.length})
              </option>
              {periodosList.map((per) => {
                const count = postulantesByGrupo.filter(p => matchPeriodo(p.periodo_reclutado || p.periodo, per)).length
                return (
                  <option key={per} value={per} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">
                    {per} ({count})
                  </option>
                )
              })}
            </select>
          </div>

          {/* 5. Semana de Trabajo (en cascada) */}
          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase text-[var(--text-muted)] flex items-center gap-1">
              <Calendar size={11} className="text-cyan-500" />
              <span>Semana</span>
            </label>
            <select
              value={selectedSemana}
              onChange={(e) => setSelectedSemana(e.target.value)}
              className="w-full bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 px-2.5 py-1.5 rounded-xl text-xs font-bold outline-none cursor-pointer shadow-xs focus:ring-1 focus:ring-cyan-500"
            >
              <option value="ALL" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">
                Todas ({semanasList.length})
              </option>
              {semanasList.map((sem) => {
                const count = postulantesByPeriodo.filter(p => matchSemana(p.semana_trabajo || p.semana, sem)).length
                return (
                  <option key={sem} value={sem} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">
                    Semana {sem} ({count})
                  </option>
                )
              })}
            </select>
          </div>

          {/* 6. Experiencia Call Center */}
          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase text-[var(--text-muted)] flex items-center gap-1">
              <Briefcase size={11} className="text-indigo-500" />
              <span>Exp. Call</span>
            </label>
            <select
              value={selectedExpCall}
              onChange={(e) => setSelectedExpCall(e.target.value)}
              className="w-full bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 px-2.5 py-1.5 rounded-xl text-xs font-bold outline-none cursor-pointer shadow-xs focus:ring-1 focus:ring-cyan-500"
            >
              <option value="ALL" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">Todos</option>
              <option value="SI" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">Con Exp. (SI)</option>
              <option value="NO" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">Sin Exp. (NO)</option>
            </select>
          </div>

          {/* 7. Estado Operativo */}
          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase text-[var(--text-muted)] flex items-center gap-1">
              <Award size={11} className="text-emerald-500" />
              <span>Estado</span>
            </label>
            <select
              value={selectedEstado}
              onChange={(e) => setSelectedEstado(e.target.value)}
              className="w-full bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 px-2.5 py-1.5 rounded-xl text-xs font-bold outline-none cursor-pointer shadow-xs focus:ring-1 focus:ring-cyan-500"
            >
              <option value="ALL" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">Todos</option>
              <option value="ACTIVOS" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">Activos (Sin Baja)</option>
              <option value="CAPACITACION" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">En Formación (D1-D5)</option>
              <option value="OJT" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">Pase a OJT / Piso</option>
              <option value="BAJAS" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">Bajas Registradas</option>
            </select>
          </div>
        </div>

        {/* ── BANNER ASOCIATIVO DE LA LLAVE DEL GRUPO (Formador & Reclutador) ── */}
        {activeGrupoInfo && (
          <div className="mt-2.5 p-3 rounded-xl bg-gradient-to-r from-blue-500/10 via-purple-500/10 to-cyan-500/10 border border-blue-500/30 flex flex-wrap items-center justify-between gap-3 shadow-xs">
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <div className="flex items-center gap-1.5 font-mono font-black text-cyan-600 dark:text-cyan-300 bg-cyan-500/15 px-2.5 py-1 rounded-lg border border-cyan-500/30">
                <Key size={13} className="text-cyan-400" />
                <span>GRUPO: {activeGrupoInfo.codigo}</span>
              </div>

              <div className="flex items-center gap-1 text-[var(--text-secondary)] font-bold">
                <span className="text-[10px] text-[var(--text-muted)] uppercase">🏷️ Campaña:</span>
                <span className="text-[var(--text-primary)]">{activeGrupoInfo.campana}</span>
              </div>

              <div className="flex items-center gap-1 font-bold">
                <span className="text-[10px] text-[var(--text-muted)] uppercase">🎓 Formador:</span>
                <span className="text-purple-600 dark:text-purple-300 font-extrabold">{activeGrupoInfo.formador}</span>
              </div>

              <div className="flex items-center gap-1 font-bold">
                <span className="text-[10px] text-[var(--text-muted)] uppercase">👤 Reclutador(es):</span>
                <span className="text-blue-600 dark:text-blue-300 font-extrabold">
                  {activeGrupoInfo.reclutadores.length > 0 ? activeGrupoInfo.reclutadores.join(', ') : 'Sin reclutador'}
                </span>
              </div>

              {activeGrupoInfo.fechaInicio && (
                <div className="flex items-center gap-1 text-[var(--text-muted)] text-[11px]">
                  <span>📅 Inicio:</span>
                  <strong className="text-[var(--text-primary)]">{String(activeGrupoInfo.fechaInicio).split('T')[0]}</strong>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-black px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 border border-emerald-500/30">
                {activeGrupoInfo.totalPostulantes} postulantes en grupo
              </span>
            </div>
          </div>
        )}
      </div>

      {stats.bajasMiCulpa > 0 && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 flex items-start gap-2.5 shadow-xs">
          <AlertTriangle size={16} className="text-amber-400 shrink-0 mt-0.5" />
          <div className="text-xs text-amber-200">
            <span className="font-bold text-amber-300">{stats.bajasMiCulpa} baja(s) imputables a selección. </span>
            <span className="text-amber-200/80">Motivos como sin PC, documentación o habilidades no verificadas descuentan la efectividad operativa.</span>
          </div>
        </div>
      )}

      {/* 🌟 VISTA INTEGRAL DE CARTERA (LOOKER / HIGH-DENSITY BI) */}
      <CarteraReclutadorOverview
        postulantes={myPostulantes}
        asistencias={asistencias}
        userProfile={effectiveProfile}
        campanasMetas={campanasMetas}
        reclutadores={reclutadores}
        grupos={grupos}
        isGlobal={isGlobalView && activeFiltersCount === 0}
        selectedReclutadorName={selectedRecName}
      />

      {/* Breakdown Details */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
        <div className="rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-3.5 shadow-xs">
          <h4 className="text-xs font-black uppercase tracking-wider text-[var(--text-primary)] mb-2">
            Bajas imputables a preselección
          </h4>
          <div className="h-44">
            {myMotivos.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={myMotivos} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" opacity={0.3} />
                  <XAxis dataKey="name" tick={{ fontSize: 9, fill: 'var(--text-muted)' }} angle={-15} textAnchor="end" interval={0} height={35} />
                  <YAxis tick={{ fontSize: 9, fill: 'var(--text-muted)' }} />
                  <Tooltip contentStyle={chartTooltipStyle} />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                    {myMotivos.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex flex-col items-center justify-center h-full">
                <ThumbsUp size={24} className="text-emerald-500 mb-1.5" />
                <p className="text-xs text-[var(--text-muted)] font-bold">Sin bajas por mala preselección</p>
              </div>
            )}
          </div>
        </div>

        <div className="rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-3.5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="p-1 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20">
                  <PhoneCall size={14} />
                </div>
                <div>
                  <h4 className="text-xs font-black uppercase tracking-wider text-[var(--text-primary)]">
                    BANDEJA DE RESCATE: INASISTENCIAS D0 / D1
                  </h4>
                  <p className="text-[10px] text-[var(--text-muted)]">Postulantes caídos con contacto inmediato</p>
                </div>
              </div>
              <span className="text-[9.5px] font-bold px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/30">
                {faltantesDia1.length} pendientes
              </span>
            </div>

            <div className="space-y-1.5 max-h-[210px] overflow-y-auto custom-scrollbar pr-1">
              {faltantesDia1.length > 0 ? faltantesDia1.map(item => {
                const waMessage = encodeURIComponent(`Hola ${item.primerNombre}, te saludamos del equipo de Selección GEA. Vimos que no pudiste conectarte a tu inicio de capacitación en ${item.campana}. ¿Tuviste algún inconveniente? Queremos ayudarte a no perder tu vacante.`)
                return (
                  <div key={item.documento} className="flex justify-between items-center p-2 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] hover:border-[var(--border-normal)] transition-colors">
                    <div className="min-w-0 pr-2">
                      <p className="text-xs font-bold text-[var(--text-primary)] truncate">{item.nombre}</p>
                      <div className="flex items-center gap-2 text-[10px] text-[var(--text-muted)] mt-0.5">
                        <span>📱 {item.celular || 'Sin cel'}</span>
                        <span>•</span>
                        <span className="truncate">{item.campana}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-[9px] font-black px-1.5 py-0.5 rounded-md bg-rose-500/10 text-rose-400 border border-rose-500/20">
                        {item.tipoFalta}
                      </span>
                      {item.cleanPhone && (
                        <>
                          <a
                            href={`https://wa.me/51${item.cleanPhone}?text=${waMessage}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 rounded-md text-white shadow-xs bg-emerald-600 hover:bg-emerald-500 transition-colors flex items-center justify-center cursor-pointer"
                            title="Contactar por WhatsApp"
                          >
                            <MessageCircle size={12} />
                          </a>
                          <a
                            href={`tel:${item.celular}`}
                            className="p-1.5 rounded-md text-white shadow-xs bg-blue-600 hover:bg-blue-500 transition-colors flex items-center justify-center cursor-pointer"
                            title="Llamar al candidato"
                          >
                            <PhoneCall size={12} />
                          </a>
                        </>
                      )}
                    </div>
                  </div>
                )
              }) : (
                <div className="flex flex-col items-center justify-center py-10">
                  <ThumbsUp size={24} className="text-emerald-500 mb-1.5" />
                  <p className="text-xs text-[var(--text-muted)] font-bold">¡Excelente! 100% de asistencia registrada en Día 1</p>
                </div>
              )}
            </div>
          </div>

          <div className="mt-3 pt-2 border-t border-[var(--border-subtle)] flex items-center justify-between text-[10px] text-[var(--text-muted)]">
            <span>Objetivo RyS: Reducir NSP en D1</span>
            <span className="text-blue-400 font-bold">Contacto en &lt; 2h</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default memo(ReclutadorDashboard)

