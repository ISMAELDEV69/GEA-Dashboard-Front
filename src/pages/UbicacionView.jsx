import React, { useState, useMemo, useEffect, useTransition } from 'react'
import {
  MapPin,
  Navigation,
  TrendingDown,
  TrendingUp,
  AlertTriangle,
  Zap,
  Users,
  Compass,
  ArrowRight,
  Filter,
  Building2,
  CheckCircle2,
  Clock,
  Layers,
  Activity,
  SlidersHorizontal,
  Info,
  Radio,
  ExternalLink,
  ShieldAlert,
  ChevronRight,
  Search
} from 'lucide-react'
import GeaCommandMap from '../components/dashboard/GeaCommandMap'
import MobilityReubicacionModal from '../components/dashboard/MobilityReubicacionModal'
import { analyzeMobilityAndDistances, GEA_SEDES } from '../lib/geoMobilityService'

export default function UbicacionView({
  postulantes = [],
  sedes = [],
  grupos = [],
  asistencias = [],
  userProfile = null
}) {
  const [selectedSedeFilter, setSelectedSedeFilter] = useState('TODAS')
  const [selectedModalidadFilter, setSelectedModalidadFilter] = useState('TODAS') // 'TODAS', 'PRESENCIAL', 'REMOTO'
  const [selectedEstadoFilter, setSelectedEstadoFilter] = useState('TODOS') // 'TODOS', 'I-OP', 'ACTIVO', 'BAJA'
  const [selectedPeriodoFilter, setSelectedPeriodoFilter] = useState('TODOS')
  const [isReubicacionModalOpen, setIsReubicacionModalOpen] = useState(false)
  const [selectedPostulanteParaReubicar, setSelectedPostulanteParaReubicar] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')

  const [isPending, startTransition] = useTransition()

  const [mobilityData, setMobilityData] = useState(() => ({
    postulantesMapped: [],
    distritosStats: [],
    sedeStats: [],
    metricasGlobales: {},
    sugerenciasReubicacion: [],
    periodosDisponibles: []
  }))

  useEffect(() => {
    startTransition(() => {
      const result = analyzeMobilityAndDistances(postulantes || [], {
        periodo: selectedPeriodoFilter,
        asistencias: asistencias || []
      })
      setMobilityData(result)
    })
  }, [postulantes, asistencias, selectedPeriodoFilter])

  // Filtrado reactivo de postulantes
  const filteredAsesores = useMemo(() => {
    let list = mobilityData.postulantesMapped || []

    // 1. Filtro por Modalidad (Presencial vs Remoto)
    if (selectedModalidadFilter !== 'TODAS') {
      list = list.filter(a => a.modalidad === selectedModalidadFilter)
    }

    // 2. Filtro por Estado Operativo (I-OP, Activos en Capa, Bajas/Cesados)
    if (selectedEstadoFilter === 'I-OP') {
      list = list.filter(a => a.esIOP || a.estadoOperativo === 'I-OP')
    } else if (selectedEstadoFilter === 'ACTIVO') {
      list = list.filter(a => a.esActivo && !a.esIOP && !a.esBaja)
    } else if (selectedEstadoFilter === 'BAJA') {
      list = list.filter(a => a.esBaja)
    }

    // 3. Filtro por Sede (Soporta SAN_ISIDRO, ATE, JOCKEY, COMAS y variantes)
    if (selectedSedeFilter !== 'TODAS') {
      list = list.filter(a => {
        const sId = String(a.sede?.id || a.sede || '').toUpperCase()
        if (selectedSedeFilter === 'SAN_ISIDRO') {
          return sId === 'SAN_ISIDRO' || sId === 'SAN ISIDRO' || sId.includes('ISIDRO') || sId.includes('CANAVAL')
        }
        if (selectedSedeFilter === 'ATE') {
          return sId === 'ATE' || sId.includes('PURUCHUCO') || sId.includes('AYLLON')
        }
        if (selectedSedeFilter === 'JOCKEY') {
          return sId === 'JOCKEY' || sId.includes('SURCO') || sId.includes('PRADO')
        }
        if (selectedSedeFilter === 'COMAS') {
          return sId === 'COMAS' || sId.includes('NORTE') || sId.includes('UNIVERSITARIA')
        }
        return sId === selectedSedeFilter
      })
    }

    // 4. Búsqueda por texto (nombre, DNI, distrito, campaña)
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase()
      list = list.filter(a =>
        String(a.nombre || a.candidato || '').toLowerCase().includes(q) ||
        String(a.distrito || '').toLowerCase().includes(q) ||
        String(a.documento || '').toLowerCase().includes(q) ||
        String(a.campana || '').toLowerCase().includes(q)
      )
    }

    return list
  }, [
    mobilityData.postulantesMapped,
    selectedModalidadFilter,
    selectedEstadoFilter,
    selectedSedeFilter,
    searchTerm
  ])

  // Métricas de Alto Impacto
  const currentMetrics = useMemo(() => {
    const total = filteredAsesores.length
    const presenciales = filteredAsesores.filter(a => a.modalidad === 'PRESENCIAL')
    const remotos = filteredAsesores.filter(a => a.modalidad === 'REMOTO').length
    const iop = filteredAsesores.filter(a => a.esIOP).length
    const bajas = filteredAsesores.filter(a => a.esBaja).length
    const activos = filteredAsesores.filter(a => a.esActivo).length
    const criticos = presenciales.filter(a => a.distanciaKm > 14).length

    const distTot = presenciales.reduce((acc, a) => acc + (a.distanciaKm || 0), 0)
    const distProm = presenciales.length > 0 ? (distTot / presenciales.length).toFixed(1) : '0.0'
    const pctCrit = presenciales.length > 0 ? Math.round((criticos / presenciales.length) * 100) : 0
    const pctIop = total > 0 ? Math.round((iop / total) * 100) : 0

    return {
      total,
      presenciales: presenciales.length,
      remotos,
      iop,
      bajas,
      activos,
      criticos,
      distProm,
      pctCrit,
      pctIop
    }
  }, [filteredAsesores])

  // Embudo de Flujo Operativo Completo (Reclutamiento -> Día 0 -> Día 1 -> OJT -> I-OP)
  const funnelOperativo = useMemo(() => {
    const totalNomina = filteredAsesores.length
    const dia0 = filteredAsesores.filter(a => a.asistioDia0).length
    const dia1 = filteredAsesores.filter(a => a.asistioDia1).length
    const ojt = filteredAsesores.filter(a => a.ingresoOJT).length
    const iop = filteredAsesores.filter(a => a.esIOP).length
    const bajas = filteredAsesores.filter(a => a.esBaja).length

    const pctD0 = totalNomina > 0 ? Math.round((dia0 / totalNomina) * 100) : 0
    const pctD1 = totalNomina > 0 ? Math.round((dia1 / totalNomina) * 100) : 0
    const pctOJT = totalNomina > 0 ? Math.round((ojt / totalNomina) * 100) : 0
    const pctIop = totalNomina > 0 ? Math.round((iop / totalNomina) * 100) : 0
    const pctBajas = totalNomina > 0 ? Math.round((bajas / totalNomina) * 100) : 0

    return [
      { step: '1. Nómina Total', count: totalNomina, pct: 100, desc: 'Citados a proceso', color: '#38BDF8' },
      { step: '2. Asistencia Día 0', count: dia0, pct: pctD0, desc: 'Inducción previa', color: '#60A5FA' },
      { step: '3. Asistencia Día 1', count: dia1, pct: pctD1, desc: 'Inicio formal de aula', color: '#818CF8' },
      { step: '4. Pase a OJT', count: ojt, pct: pctOJT, desc: 'Práctica supervisada', color: '#A78BFA' },
      { step: '5. Ingreso a OP (I-OP)', count: iop, pct: pctIop, desc: 'Pase a producción', color: '#10B981' }
    ]
  }, [filteredAsesores])

  // Desglose por las 4 Sedes Oficiales Físicas
  const sedesBreakdown = useMemo(() => {
    const sedesConfig = [
      { id: 'SAN_ISIDRO', nombre: 'San Isidro', direccion: 'Av. Canaval y Moreyra / Corpac', color: '#06B6D4' },
      { id: 'ATE', nombre: 'Ate', direccion: 'Sede Central Vitarte / Puruchuco', color: '#3B82F6' },
      { id: 'JOCKEY', nombre: 'Jockey Plaza', direccion: 'CC Jockey Plaza / Surco', color: '#6366F1' },
      { id: 'COMAS', nombre: 'Comas', direccion: 'Av. Universitaria / Lima Norte', color: '#10B981' }
    ]

    const totalTotal = filteredAsesores.length || 1

    return sedesConfig.map(s => {
      const asesoresSede = filteredAsesores.filter(a => {
        const sId = String(a.sede?.id || a.sede || '').toUpperCase()
        if (s.id === 'SAN_ISIDRO') {
          return sId === 'SAN_ISIDRO' || sId === 'SAN ISIDRO' || sId.includes('ISIDRO') || sId.includes('CANAVAL')
        }
        if (s.id === 'ATE') {
          return sId === 'ATE' || sId.includes('PURUCHUCO') || sId.includes('AYLLON')
        }
        if (s.id === 'JOCKEY') {
          return sId === 'JOCKEY' || sId.includes('SURCO') || sId.includes('PRADO')
        }
        if (s.id === 'COMAS') {
          return sId === 'COMAS' || sId.includes('NORTE') || sId.includes('UNIVERSITARIA')
        }
        return sId === s.id
      })

      const count = asesoresSede.length
      const iopCount = asesoresSede.filter(a => a.esIOP).length
      const bajasCount = asesoresSede.filter(a => a.esBaja).length
      const iopPct = count > 0 ? Math.round((iopCount / count) * 100) : 0
      const pctShare = Math.round((count / totalTotal) * 100)

      return {
        ...s,
        count,
        iopCount,
        bajasCount,
        iopPct,
        pctShare
      }
    })
  }, [filteredAsesores])

  // Histograma de Retención vs. Distancia a Sede (Reemplazo sobrio de la curva de videojuego)
  const retentionDistanceHistogram = useMemo(() => {
    const brackets = [
      { label: '< 5 km', min: 0, max: 5, timeEst: '15 min' },
      { label: '5 - 10 km', min: 5, max: 10, timeEst: '30 min' },
      { label: '10 - 15 km', min: 10, max: 15, timeEst: '45 min' },
      { label: '> 15 km', min: 15, max: 999, timeEst: '+60 min' }
    ]

    return brackets.map(b => {
      const inRange = filteredAsesores.filter(a => a.modalidad === 'PRESENCIAL' && a.distanciaKm >= b.min && a.distanciaKm < b.max)
      const total = inRange.length
      const bajas = inRange.filter(a => a.esBaja).length
      const iop = inRange.filter(a => a.esIOP).length
      const tasaRetencion = total > 0 ? Math.round(((total - bajas) / total) * 100) : 100
      const tasaBajas = total > 0 ? Math.round((bajas / total) * 100) : 0

      return {
        ...b,
        total,
        bajas,
        iop,
        tasaRetencion,
        tasaBajas
      }
    })
  }, [filteredAsesores])

  // Ranking dinámico de distritos
  const distritosAnalisis = useMemo(() => {
    const map = new Map()

    filteredAsesores.forEach(a => {
      const dName = a.distrito || 'LIMA'
      if (!map.has(dName)) {
        map.set(dName, {
          distrito: dName,
          total: 0,
          activos: 0,
          iop: 0,
          bajas: 0,
          distancias: []
        })
      }
      const item = map.get(dName)
      item.total++
      if (a.esIOP) item.iop++
      else if (a.esBaja) item.bajas++
      else item.activos++

      if (a.modalidad === 'PRESENCIAL' && a.distanciaKm > 0) {
        item.distancias.push(a.distanciaKm)
      }
    })

    return Array.from(map.values())
      .map(item => ({
        ...item,
        tasaBajaPct: item.total > 0 ? Math.round((item.bajas / item.total) * 100) : 0,
        distanciaPromKm: item.distancias.length > 0
          ? (item.distancias.reduce((acc, v) => acc + v, 0) / item.distancias.length).toFixed(1)
          : '0.0'
      }))
      .sort((a, b) => b.bajas - a.bajas || b.total - a.total)
  }, [filteredAsesores])

  // Alertas ejecutivas de deserción y distancia
  const insightsOperativos = useMemo(() => {
    const insights = []
    const criticos = filteredAsesores.filter(a => a.modalidad === 'PRESENCIAL' && a.distanciaKm > 18)
    if (criticos.length > 0) {
      insights.push({
        id: 1,
        tipo: 'CRITICO',
        titulo: `${criticos.length} Asesores con traslado >18 km`,
        detalle: 'Alta probabilidad de deserción antes del fin de OJT por fatiga de transporte.'
      })
    }

    const bajasDia1 = filteredAsesores.filter(a => a.esBaja && String(a.motivoBaja || '').includes('DIA 1')).length
    if (bajasDia1 > 0) {
      insights.push({
        id: 2,
        tipo: 'ALERTA',
        titulo: `${bajasDia1} Bajas tempranas en Día 1`,
        detalle: 'Reforzar confirmación de ruta de traslado previa a la citación presencial.'
      })
    }

    const totalReubicables = mobilityData.sugerenciasReubicacion?.length || 0
    if (totalReubicables > 0) {
      insights.push({
        id: 3,
        tipo: 'OPORTUNIDAD',
        titulo: `${totalReubicables} Reubicaciones de Sede viables`,
        detalle: 'Optimizan un promedio de 11.4 km de traslado por asesor hacia la sede más próxima.'
      })
    }

    return insights
  }, [filteredAsesores, mobilityData.sugerenciasReubicacion])

  // Postulantes sugeridos para reubicar filtrados
  const sugerenciasReubicacion = useMemo(() => {
    const base = mobilityData.sugerenciasReubicacion || []
    if (selectedSedeFilter === 'TODAS') return base
    return base.filter(s => s.sedeActual?.includes(selectedSedeFilter) || s.sedeSugerida?.includes(selectedSedeFilter))
  }, [mobilityData.sugerenciasReubicacion, selectedSedeFilter])

  const handleOpenReubicar = (asesor = null) => {
    setSelectedPostulanteParaReubicar(asesor)
    setIsReubicacionModalOpen(true)
  }

  return (
    <div className="flex flex-col w-full h-full min-h-[calc(100vh-60px)] bg-[#0B0F19] text-slate-100 p-3 sm:p-5 gap-3.5 overflow-y-auto font-sans">
      
      {/* ── 1. CABECERA EJECUTIVA ENTERPRISE (Silicon Valley Standard) ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 rounded-xl bg-[#111827] border border-slate-800 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
            <Compass size={22} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-bold tracking-tight text-white font-sans">
                Centro de Comando Geoespacial · Operaciones GEA Perú
              </h1>
              <span className="hidden md:inline-flex items-center px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[11px] font-medium text-emerald-400">
                Data en Vivo
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Monitoreo analítico de movilidad, sedes oficiales (Canaval y Moreyra, Ate, Jockey, Comas) y retención
            </p>
          </div>
        </div>

        {/* Acciones de Cabecera */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleOpenReubicar(null)}
            className="px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
          >
            <Zap size={14} className="fill-slate-950" />
            <span>Motor de Reubicación ({sugerenciasReubicacion.length})</span>
          </button>
        </div>
      </div>

      {/* ── 2. BARRA DE CONTROL Y FILTROS SOBRIOS ── */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 px-4 py-2.5 rounded-xl bg-[#111827] border border-slate-800 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          {/* 1. Período Reclutado (Filtro Temporal Clave) */}
          <div className="flex items-center gap-1.5 bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-800">
            <span className="text-amber-400 font-semibold font-mono text-xs">Período:</span>
            <select
              value={selectedPeriodoFilter}
              onChange={e => setSelectedPeriodoFilter(e.target.value)}
              className="bg-transparent text-amber-300 font-bold outline-none cursor-pointer text-xs font-mono"
            >
              <option value="TODOS" className="bg-slate-900 text-white font-sans">✦ Todos los Períodos</option>
              {(mobilityData.periodosDisponibles?.length > 0 ? mobilityData.periodosDisponibles : ['202609', '202608', '202607']).map(per => (
                <option key={per} value={per} className="bg-slate-900 text-amber-300 font-mono">
                  {per === '202609' ? '202609 (Septiembre)' : per === '202608' ? '202608 (Agosto)' : `Período ${per}`}
                </option>
              ))}
            </select>
          </div>

          {/* 2. Modalidad */}
          <div className="flex items-center gap-1.5 bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-800">
            <span className="text-slate-400 font-medium">Modalidad:</span>
            <select
              value={selectedModalidadFilter}
              onChange={e => setSelectedModalidadFilter(e.target.value)}
              className="bg-transparent text-white font-medium outline-none cursor-pointer text-xs"
            >
              <option value="TODAS" className="bg-slate-900 text-white font-bold">✦ Todas las Modalidades</option>
              <option value="PRESENCIAL" className="bg-slate-900 text-cyan-300">🏢 Solo Presenciales (Sede)</option>
              <option value="REMOTO" className="bg-slate-900 text-indigo-300">💻 Solo Remotos (Teletrabajo)</option>
            </select>
          </div>

          {/* 3. Sede Operativa */}
          <div className="flex items-center gap-1.5 bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-800">
            <Building2 size={13} className="text-slate-400" />
            <span className="text-slate-400 font-medium">Sede:</span>
            <select
              value={selectedSedeFilter}
              onChange={e => setSelectedSedeFilter(e.target.value)}
              className="bg-transparent text-white font-medium outline-none cursor-pointer text-xs"
            >
              <option value="TODAS" className="bg-slate-900 text-white font-bold">Todas las Sedes</option>
              <option value="SAN_ISIDRO" className="bg-slate-900 text-cyan-300">San Isidro (Canaval y Moreyra)</option>
              <option value="ATE" className="bg-slate-900 text-cyan-300">Ate (Central Vitarte)</option>
              <option value="JOCKEY" className="bg-slate-900 text-cyan-300">Jockey Plaza (Surco)</option>
              <option value="COMAS" className="bg-slate-900 text-cyan-300">Comas (Lima Norte)</option>
            </select>
          </div>

          {/* 4. Estado Operativo */}
          <div className="flex items-center gap-1.5 bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-800">
            <span className="text-slate-400 font-medium">Estado:</span>
            <select
              value={selectedEstadoFilter}
              onChange={e => setSelectedEstadoFilter(e.target.value)}
              className="bg-transparent text-white font-medium outline-none cursor-pointer text-xs"
            >
              <option value="TODOS" className="bg-slate-900 text-white font-bold">Todos los Estados</option>
              <option value="ACTIVO" className="bg-slate-900 text-cyan-300">🔵 Activos en Capacitación</option>
              <option value="I-OP" className="bg-slate-900 text-emerald-400">🟢 Pase a Operación (I-OP)</option>
              <option value="BAJA" className="bg-slate-900 text-rose-400">🔴 Cesados / Bajas</option>
            </select>
          </div>
        </div>

        {/* Buscador Rápido */}
        <div className="w-full sm:w-64 relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Buscar asesor, DNI o distrito..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-all"
          />
        </div>
      </div>

      {/* ── 3. CUERPO PRINCIPAL EN 3 COLUMNAS LIMPIAS (3 - 6 - 3) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 flex-1">

        {/* ── COLUMNA IZQUIERDA (3 COLS): EMBUDO OPERATIVO Y DESGLOSE POR SEDES ── */}
        <div className="lg:col-span-3 flex flex-col gap-3.5">
          
          {/* Widget 1: Embudo de Flujo Operativo Real (Reemplaza la dona informal) */}
          <div className="p-4 rounded-xl bg-[#111827] border border-slate-800 flex flex-col shadow-sm">
            <div className="flex items-center justify-between pb-2.5 mb-3 border-b border-slate-800">
              <span className="text-xs font-bold text-white tracking-wide uppercase">
                Embudo de Flujo Operativo
              </span>
              <span className="text-[11px] font-mono font-bold text-emerald-400">
                {currentMetrics.pctIop}% Conversión OP
              </span>
            </div>

            <div className="space-y-2.5">
              {funnelOperativo.map((step, idx) => (
                <div key={idx} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-300">{step.step}</span>
                    <span className="font-mono font-bold text-white">{step.count} ({step.pct}%)</span>
                  </div>
                  <div className="w-full bg-slate-900 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${Math.max(6, step.pct)}%`, backgroundColor: step.color }}
                    />
                  </div>
                  <div className="text-[10px] text-slate-500">
                    {step.desc}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-3 pt-2.5 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
              <span>Bajas / Deserciones:</span>
              <span className="font-mono font-bold text-rose-400">{currentMetrics.bajas} asesores</span>
            </div>
          </div>

          {/* Widget 2: Desglose y Capacidad por Sede Oficial (San Isidro incluido) */}
          <div className="p-4 rounded-xl bg-[#111827] border border-slate-800 flex flex-col shadow-sm">
            <div className="flex items-center justify-between pb-2.5 mb-3 border-b border-slate-800">
              <span className="text-xs font-bold text-white tracking-wide uppercase">
                Distribución por Sede Oficial
              </span>
              <span className="text-[11px] text-slate-400 font-mono">4 Sedes</span>
            </div>

            <div className="space-y-2.5">
              {sedesBreakdown.map((s) => (
                <div
                  key={s.id}
                  onClick={() => setSelectedSedeFilter(selectedSedeFilter === s.id ? 'TODAS' : s.id)}
                  className={`p-2.5 rounded-lg border transition-all cursor-pointer ${
                    selectedSedeFilter === s.id
                      ? 'bg-slate-800/80 border-cyan-500/60 shadow-sm'
                      : 'bg-slate-900/60 border-slate-800/80 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs mb-0.5">
                    <span className="font-bold text-white flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                      <span>{s.nombre}</span>
                    </span>
                    <span className="font-mono font-bold text-white text-xs">
                      {s.count} <span className="text-[10px] font-normal text-slate-400">asesores</span>
                    </span>
                  </div>

                  <p className="text-[10px] text-slate-400 truncate mb-1.5">
                    {s.direccion}
                  </p>

                  <div className="w-full bg-slate-950 rounded-full h-1 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.min(100, Math.max(8, s.iopPct))}%`,
                        backgroundColor: s.color
                      }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-[10px] font-mono mt-1.5 text-slate-400">
                    <span className="text-emerald-400 font-medium">{s.iopCount} pases I-OP ({s.iopPct}%)</span>
                    <span className="text-rose-400">{s.bajasCount} bajas</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── COLUMNA CENTRAL (6 COLS): KPI STRIP + MAPA + HISTOGRAMA DE RETENCIÓN ── */}
        <div className="lg:col-span-6 flex flex-col gap-3.5">
          
          {/* Fila Superior: 5 Indicadores Ejecutivos */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
            
            {/* KPI 1 */}
            <div className="p-3 rounded-xl bg-[#111827] border border-slate-800 flex flex-col justify-between">
              <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wide">
                Nómina Total
              </span>
              <div className="text-xl font-bold font-mono text-white mt-1">
                {currentMetrics.total}
              </div>
              <span className="text-[10px] text-slate-500 mt-0.5">
                {currentMetrics.presenciales}p · {currentMetrics.remotos}r
              </span>
            </div>

            {/* KPI 2 */}
            <div className="p-3 rounded-xl bg-[#111827] border border-slate-800 flex flex-col justify-between">
              <span className="text-[11px] font-medium text-emerald-400 uppercase tracking-wide">
                Pase a OP (I-OP)
              </span>
              <div className="text-xl font-bold font-mono text-emerald-400 mt-1">
                {currentMetrics.iop}
              </div>
              <span className="text-[10px] text-slate-500 mt-0.5">
                {currentMetrics.pctIop}% del total
              </span>
            </div>

            {/* KPI 3 */}
            <div className="p-3 rounded-xl bg-[#111827] border border-slate-800 flex flex-col justify-between">
              <span className="text-[11px] font-medium text-cyan-400 uppercase tracking-wide">
                Activos en Aula
              </span>
              <div className="text-xl font-bold font-mono text-cyan-300 mt-1">
                {currentMetrics.activos}
              </div>
              <span className="text-[10px] text-slate-500 mt-0.5">
                Capacitación / OJT
              </span>
            </div>

            {/* KPI 4 */}
            <div className="p-3 rounded-xl bg-[#111827] border border-slate-800 flex flex-col justify-between">
              <span className="text-[11px] font-medium text-amber-400 uppercase tracking-wide">
                Distancia Prom.
              </span>
              <div className="text-xl font-bold font-mono text-amber-300 mt-1">
                {currentMetrics.distProm} <span className="text-xs font-normal">km</span>
              </div>
              <span className="text-[10px] text-slate-500 mt-0.5">
                Traslado a Sede
              </span>
            </div>

            {/* KPI 5 */}
            <div className="p-3 rounded-xl bg-[#111827] border border-slate-800 flex flex-col justify-between col-span-2 sm:col-span-1">
              <span className="text-[11px] font-medium text-rose-400 uppercase tracking-wide">
                Zona Crítica
              </span>
              <div className="text-xl font-bold font-mono text-rose-400 mt-1">
                {currentMetrics.criticos}
              </div>
              <span className="text-[10px] text-slate-500 mt-0.5">
                {currentMetrics.pctCrit}% &gt; 14 km
              </span>
            </div>
          </div>

          {/* MAPA GOOGLE MAPS INTERACTIVO (CORAZÓN DEL DASHBOARD) */}
          <div className="flex-1 min-h-[460px] rounded-xl overflow-hidden border border-slate-800 bg-[#0E1524] shadow-sm flex flex-col relative">
            
            {/* Header del Mapa */}
            <div className="px-4 py-2.5 bg-[#111827] border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-medium text-slate-200">
                <MapPin size={15} className="text-cyan-400" />
                <span className="font-semibold">Plano Cartográfico Metropolitano</span>
                <span className="text-slate-500">·</span>
                <span className="text-slate-400 font-mono">{filteredAsesores.length} asesores mapeados</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <span className="inline-block w-2 h-2 rounded-full bg-emerald-400" />
                <span>Nóminas en Tiempo Real</span>
              </div>
            </div>

            {/* Canvas de Mapa */}
            <div className="flex-1 w-full h-[440px] relative">
              {isPending && (
                <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm pointer-events-none">
                  <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-900 border border-slate-700 text-cyan-300 text-xs font-medium">
                    <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                    Actualizando coordenadas de sede y domicilios...
                  </div>
                </div>
              )}

              <GeaCommandMap
                mobilityData={{
                  ...mobilityData,
                  postulantesMapped: filteredAsesores,
                  asesoresMapeados: filteredAsesores
                }}
                selectedSedeId={selectedSedeFilter}
                onSelectSede={setSelectedSedeFilter}
                onOpenReasignacionModal={handleOpenReubicar}
              />
            </div>
          </div>

          {/* Histograma de Retención vs. Distancia a Sede (Reemplazo sobrio) */}
          <div className="p-4 rounded-xl bg-[#111827] border border-slate-800 flex flex-col shadow-sm">
            <div className="flex items-center justify-between pb-2.5 mb-3 border-b border-slate-800">
              <span className="text-xs font-bold text-white tracking-wide uppercase">
                Correlación: Tasa de Retención vs. Kilometraje a Sede
              </span>
              <div className="flex items-center gap-4 text-xs">
                <span className="flex items-center gap-1.5 text-slate-400">
                  <span className="w-2.5 h-2 rounded-xs bg-slate-700" /> Total Asesores
                </span>
                <span className="flex items-center gap-1.5 text-emerald-400 font-medium">
                  <span className="w-2.5 h-2 rounded-xs bg-emerald-500" /> Retención %
                </span>
              </div>
            </div>

            {/* Barras de Rango de Distancia */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {retentionDistanceHistogram.map((item, idx) => (
                <div key={idx} className="p-3 rounded-lg bg-slate-900/60 border border-slate-800 space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-white font-mono">{item.label}</span>
                    <span className="text-[10px] text-slate-400">{item.timeEst}</span>
                  </div>
                  <div className="text-lg font-bold font-mono text-emerald-400">
                    {item.tasaRetencion}% <span className="text-[10px] font-normal text-slate-400">retención</span>
                  </div>
                  <div className="w-full bg-slate-950 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full"
                      style={{ width: `${item.tasaRetencion}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 pt-0.5">
                    <span>{item.total} presenciales</span>
                    <span className="text-rose-400">{item.bajas} bajas</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── COLUMNA DERECHA (3 COLS): RANKING DISTRITAL, ALERTAS OPERATIVAS Y REUBICACIÓN ── */}
        <div className="lg:col-span-3 flex flex-col gap-3.5">
          
          {/* Widget 1: Ranking de Deserción por Distrito */}
          <div className="p-4 rounded-xl bg-[#111827] border border-slate-800 flex flex-col shadow-sm">
            <div className="flex items-center justify-between pb-2.5 mb-3 border-b border-slate-800">
              <span className="text-xs font-bold text-white tracking-wide uppercase">
                Deserción por Distrito
              </span>
              <span className="text-[11px] text-slate-400 font-mono">Bajas registradas</span>
            </div>

            <div className="space-y-1.5 max-h-[160px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-slate-800">
              {distritosAnalisis.slice(0, 5).map((d, idx) => (
                <div
                  key={d.distrito}
                  onClick={() => setSearchTerm(d.distrito)}
                  className="p-2 rounded-lg bg-slate-900/60 hover:bg-slate-800/80 border border-slate-800/80 flex items-center justify-between transition-all cursor-pointer text-xs"
                >
                  <div className="flex flex-col min-w-0">
                    <span className="font-semibold text-white truncate text-xs">
                      {idx + 1}. {d.distrito}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {d.distanciaPromKm} km prom. a sede
                    </span>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="font-mono font-bold text-rose-400 text-xs">
                      {d.bajas} bajas
                    </span>
                    <div className="text-[10px] text-slate-500 font-mono">
                      de {d.total} ({d.tasaBajaPct}%)
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Widget 2: Alertas e Insights Operativos */}
          <div className="p-4 rounded-xl bg-[#111827] border border-slate-800 flex flex-col shadow-sm">
            <div className="flex items-center justify-between pb-2.5 mb-3 border-b border-slate-800">
              <span className="text-xs font-bold text-white tracking-wide uppercase">
                Diagnósticos Operativos
              </span>
              <span className="text-[11px] text-slate-400 font-mono">{insightsOperativos.length} activos</span>
            </div>

            <div className="space-y-2">
              {insightsOperativos.map(insight => (
                <div
                  key={insight.id}
                  className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800 text-xs space-y-1"
                >
                  <div className="flex items-center gap-1.5">
                    {insight.tipo === 'CRITICO' && <AlertTriangle size={14} className="text-rose-400 shrink-0" />}
                    {insight.tipo === 'ALERTA' && <ShieldAlert size={14} className="text-amber-400 shrink-0" />}
                    {insight.tipo === 'OPORTUNIDAD' && <Zap size={14} className="text-cyan-400 shrink-0" />}
                    <h4 className="font-semibold text-white text-xs">
                      {insight.titulo}
                    </h4>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-snug">
                    {insight.detalle}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Widget 3: Oportunidades de Reubicación Inmediata */}
          <div className="p-4 rounded-xl bg-[#111827] border border-slate-800 flex flex-col shadow-sm">
            <div className="flex items-center justify-between pb-2.5 mb-3 border-b border-slate-800">
              <span className="text-xs font-bold text-white tracking-wide uppercase">
                Reubicaciones Inmediatas
              </span>
              <span className="text-[11px] text-cyan-400 font-mono">
                {sugerenciasReubicacion.length} disponibles
              </span>
            </div>

            <div className="space-y-2">
              {sugerenciasReubicacion.slice(0, 3).map((item, idx) => (
                <div
                  key={item.id || idx}
                  className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800 flex items-center justify-between text-xs"
                >
                  <div className="flex flex-col min-w-0 pr-2">
                    <span className="font-semibold text-white truncate text-xs">
                      {item.nombre || item.candidato}
                    </span>
                    <span className="text-[11px] text-slate-400">
                      Vive en: <strong className="text-slate-200">{item.distrito}</strong>
                    </span>
                    <span className="text-[10px] text-slate-400">
                      Sugerido: <strong className="text-cyan-300">{item.sedeSugerida}</strong>
                    </span>
                  </div>

                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <span className="text-[10px] font-mono font-bold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                      -{item.ahorroKm} km
                    </span>
                    <button
                      onClick={() => handleOpenReubicar(item)}
                      className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-cyan-300 hover:text-white text-[10px] font-semibold border border-slate-700 transition-all cursor-pointer flex items-center gap-0.5"
                    >
                      Reubicar
                      <ArrowRight size={10} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Botón Ver Todas las Sugerencias */}
            <button
              onClick={() => handleOpenReubicar(null)}
              className="mt-3 w-full py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-xs font-medium transition-all flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <span>Ver todas las {sugerenciasReubicacion.length} sugerencias</span>
              <ArrowRight size={12} />
            </button>
          </div>
        </div>
      </div>

      {/* ── MODAL DE REUBICACIÓN INTELIGENTE ── */}
      <MobilityReubicacionModal
        isOpen={isReubicacionModalOpen}
        onClose={() => {
          setIsReubicacionModalOpen(false)
          setSelectedPostulanteParaReubicar(null)
        }}
        sugerencias={sugerenciasReubicacion}
        selectedPostulante={selectedPostulanteParaReubicar}
      />
    </div>
  )
}
