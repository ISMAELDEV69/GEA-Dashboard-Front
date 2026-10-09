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
  Search,
  Check,
  UserX
} from 'lucide-react'
import {
  ResponsiveContainer,
  ComposedChart,
  BarChart,
  Bar,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  LabelList
} from 'recharts'
import GeaCommandMap from '../components/dashboard/GeaCommandMap'
import MobilityReubicacionModal from '../components/dashboard/MobilityReubicacionModal'
import { analyzeMobilityAndDistances, GEA_SEDES } from '../lib/geoMobilityService'
import { fetchAnaliticaMovilidad } from '../lib/dataService'
import { useIsDarkTheme } from '../hooks/useIsDarkTheme'

export default function UbicacionView({
  postulantes = [],
  sedes = [],
  grupos = [],
  asistencias = [],
  userProfile = null
}) {
  const isDark = useIsDarkTheme()

  const [selectedSedeFilter, setSelectedSedeFilter] = useState('TODAS') // 'TODAS', 'ATE', 'JOCKEY', 'SAN_ISIDRO', 'COMAS'
  const [selectedModalidadFilter, setSelectedModalidadFilter] = useState('TODAS') // 'TODAS', 'PRESENCIAL', 'REMOTO'
  const [selectedEstadoFilter, setSelectedEstadoFilter] = useState('TODOS') // 'TODOS', 'I-OP', 'ACTIVO', 'BAJA'
  const [selectedPeriodoFilter, setSelectedPeriodoFilter] = useState('TODOS')
  const [isReubicacionModalOpen, setIsReubicacionModalOpen] = useState(false)
  const [selectedPostulanteParaReubicar, setSelectedPostulanteParaReubicar] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false)
  const [mapMode, setMapMode] = useState('trayectorias') // 'puntos' | 'trayectorias' | 'reubicacion'

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
    let isMounted = true
    startTransition(() => {
      fetchAnaliticaMovilidad({ periodo: selectedPeriodoFilter })
        .then(rows => {
          if (!isMounted) return
          if (Array.isArray(rows) && rows.length > 0) {
            const mapped = rows.map(r => ({
              id: r.id,
              documento: r.documento,
              nombre: r.nombre_completo,
              candidato: r.nombre_completo,
              modalidad: r.modalidad || 'PRESENCIAL',
              distrito: r.ciudad || r.distrito_residencia || 'LIMA',
              ciudad: r.ciudad || 'LIMA',
              departamento: r.departamento || 'LIMA',
              direccion: r.direccion_domicilio || '',
              lat: Number(r.lat_origen || -12.0463),
              lng: Number(r.lng_origen || -76.9248),
              sede: {
                id: r.sede_asignada,
                nombre: r.sede_asignada === 'SAN_ISIDRO' ? 'Sede San Isidro' : r.sede_asignada === 'JOCKEY' ? 'Sede Surco' : r.sede_asignada === 'COMAS' ? 'Sede Comas' : 'Sede Ate',
                lat: Number(r.sede_lat || -12.0565),
                lng: Number(r.sede_lng || -76.9535),
                color: r.sede_asignada === 'SAN_ISIDRO' ? '#06B6D4' : r.sede_asignada === 'JOCKEY' ? '#F59E0B' : r.sede_asignada === 'COMAS' ? '#EC4899' : '#10B981'
              },
              distanciaKm: Number(r.distancia_km || 0),
              rangoDistancia: r.rango_distancia || '<5km',
              esCritico: Boolean(r.es_zona_critica),
              asistioDia0: Boolean(r.asistio_dia_0),
              asistioDia1: Boolean(r.asistio_dia_1),
              esIOP: r.estado_operativo === 'I-OP',
              esActivo: r.estado_operativo === 'ACTIVO_AULA',
              esBaja: r.estado_operativo === 'BAJA',
              estadoOperativo: r.estado_operativo,
              periodo: r.periodo,
              campana: r.campana,
              grupoCodigo: r.grupo_codigo
            }))

            const pers = [...new Set(mapped.map(m => m.periodo).filter(Boolean))].sort((a,b) => b.localeCompare(a))

            setMobilityData(prev => ({
              ...prev,
              postulantesMapped: mapped,
              periodosDisponibles: pers.length > 0 ? pers : prev.periodosDisponibles
            }))
          } else {
            const result = analyzeMobilityAndDistances(postulantes || [], {
              periodo: selectedPeriodoFilter,
              asistencias: asistencias || []
            })
            setMobilityData(result)
          }
        })
        .catch(err => {
          console.warn('Error fetching analitica movilidad:', err)
          const result = analyzeMobilityAndDistances(postulantes || [], {
            periodo: selectedPeriodoFilter,
            asistencias: asistencias || []
          })
          setMobilityData(result)
        })
    })
    return () => { isMounted = false }
  }, [postulantes, asistencias, selectedPeriodoFilter])

  // ── 1. Filtrado reactivo de postulantes de la nómina ─────────────────────────
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
          return sId === 'SAN_ISIDRO' || sId === 'SAN ISIDRO' || sId.includes('ISIDRO') || sId.includes('COLOMBIA') || sId.includes('CANAVAL')
        }
        if (selectedSedeFilter === 'ATE') {
          return sId === 'ATE' || sId.includes('FRUTALES') || sId.includes('PURUCHUCO') || sId.includes('AYLLON')
        }
        if (selectedSedeFilter === 'JOCKEY') {
          return sId === 'JOCKEY' || sId === 'SURCO' || sId.includes('SURCO') || sId.includes('OLGUIN') || sId.includes('PRADO')
        }
        if (selectedSedeFilter === 'COMAS') {
          return sId === 'COMAS' || sId.includes('ANGELES') || sId.includes('NORTE') || sId.includes('UNIVERSITARIA')
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

  // ── 2. Métricas de Alto Impacto (KPI Cards) ──────────────────────────────────
  const currentMetrics = useMemo(() => {
    const total = filteredAsesores.length
    const presenciales = filteredAsesores.filter(a => a.modalidad === 'PRESENCIAL')
    const remotos = filteredAsesores.filter(a => a.modalidad === 'REMOTO').length
    const iop = filteredAsesores.filter(a => a.esIOP).length
    const bajas = filteredAsesores.filter(a => a.esBaja).length
    const activos = filteredAsesores.filter(a => a.esActivo).length
    const criticos = presenciales.filter(a => a.distanciaKm > 14).length

    const distTot = presenciales.reduce((acc, a) => acc + (a.distanciaKm || 0), 0)
    const distProm = presenciales.length > 0 ? (distTot / presenciales.length).toFixed(1).replace('.', ',') : '0,0'
    const pctCrit = total > 0 ? Math.round((criticos / total) * 100) : 0
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

  // ── 3. Embudo de Flujo Operativo: Nómina -> Día 0 -> Día 1 (Exactamente 3 etapas) ──
  const funnelOperativo = useMemo(() => {
    const totalNomina = filteredAsesores.length
    const dia0 = filteredAsesores.filter(a => a.asistioDia0).length
    const dia1 = filteredAsesores.filter(a => a.asistioDia1).length

    const pctD0 = totalNomina > 0 ? Math.round((dia0 / totalNomina) * 100) : 0
    const pctD1 = totalNomina > 0 ? Math.round((dia1 / totalNomina) * 100) : 0

    return [
      { step: 'Nómina total', count: totalNomina, pct: 100, barWidthPct: 100, color: '#0284C7' },
      { step: 'Asistencia día 0', count: dia0, pct: pctD0, barWidthPct: Math.max(10, pctD0), color: '#06B6D4' },
      { step: 'Asistencia día 1', count: dia1, pct: pctD1, barWidthPct: Math.max(10, pctD1), color: '#10B981' }
    ]
  }, [filteredAsesores])

  // ── 4. Donut: Asesores por Sede ──────────────────────────────────────────────
  const sedeDonutData = useMemo(() => {
    const sedesConfig = [
      { id: 'ATE', nombre: 'Ate', color: '#10B981' },
      { id: 'JOCKEY', nombre: 'Jockey Plaza', color: '#F59E0B' },
      { id: 'SAN_ISIDRO', nombre: 'San Isidro', color: '#06B6D4' },
      { id: 'COMAS', nombre: 'Comas', color: '#EC4899' }
    ]

    const allMapped = mobilityData.postulantesMapped || []

    return sedesConfig.map(s => {
      const count = allMapped.filter(a => {
        const sId = String(a.sede?.id || a.sede || '').toUpperCase()
        if (s.id === 'SAN_ISIDRO') {
          return sId === 'SAN_ISIDRO' || sId === 'SAN ISIDRO' || sId.includes('ISIDRO') || sId.includes('COLOMBIA') || sId.includes('CANAVAL')
        }
        if (s.id === 'ATE') {
          return sId === 'ATE' || sId.includes('FRUTALES') || sId.includes('PURUCHUCO') || sId.includes('AYLLON')
        }
        if (s.id === 'JOCKEY') {
          return sId === 'JOCKEY' || sId === 'SURCO' || sId.includes('SURCO') || sId.includes('OLGUIN') || sId.includes('PRADO')
        }
        if (s.id === 'COMAS') {
          return sId === 'COMAS' || sId.includes('ANGELES') || sId.includes('NORTE') || sId.includes('UNIVERSITARIA')
        }
        return sId === s.id
      }).length

      return {
        id: s.id,
        name: s.nombre,
        value: count,
        color: s.color,
        isSelected: selectedSedeFilter === s.id
      }
    })
  }, [mobilityData.postulantesMapped, selectedSedeFilter])

  // ── 5. Horizontal Bars: Distancia promedio por distrito ──────────────────────
  const distritosBarData = useMemo(() => {
    const map = new Map()
    filteredAsesores.forEach(a => {
      const dName = a.distrito || 'LIMA'
      if (!map.has(dName)) map.set(dName, [])
      if (a.modalidad === 'PRESENCIAL' && a.distanciaKm > 0) {
        map.get(dName).push(a.distanciaKm)
      }
    })

    const realList = []
    map.forEach((distancias, dName) => {
      if (distancias.length > 0) {
        const prom = distancias.reduce((acc, v) => acc + v, 0) / distancias.length
        realList.push({
          distrito: dName,
          distancia: Number(prom.toFixed(1))
        })
      }
    })

    if (realList.length > 0) {
      return realList
        .sort((a, b) => b.distancia - a.distancia)
        .slice(0, 7)
        .map(d => {
          let color = '#0284C7'
          if (d.distancia >= 10) color = '#EF4444'
          else if (d.distancia >= 6) color = '#F59E0B'
          return { ...d, color }
        })
    }

    return []
  }, [filteredAsesores])

  // ── 6. Diagnóstico de Reclutamiento: Rutas con Riesgo de Deserción (>12 km) ─
  const rutasRiesgoReclutamiento = useMemo(() => {
    const map = new Map()

    filteredAsesores.forEach(a => {
      if (a.modalidad === 'PRESENCIAL' && a.distanciaKm >= 9) {
        const dist = a.distrito || 'LIMA'
        const sedeNom = a.sede?.nombre?.replace('Sede ', '').split(' (')[0] || 'Sede'
        const key = `${dist}__${sedeNom}`

        if (!map.has(key)) {
          map.set(key, {
            distrito: dist,
            sede: sedeNom,
            total: 0,
            distanciaKm: a.distanciaKm,
            bajas: 0,
            reubicable: a.sedeSugerida ? a.sedeSugerida.replace('Sede ', '').split(' (')[0] : null,
            ahorroKm: a.ahorroKm || 0
          })
        }
        const item = map.get(key)
        item.total++
        if (a.esBaja) item.bajas++
      }
    })

    const list = Array.from(map.values())
      .sort((a, b) => b.distanciaKm - a.distanciaKm)
      .slice(0, 4)

    return list
  }, [filteredAsesores])

  // ── 7. Asesores por rango de distancia ───────────────────────────────────────
  const distanceRangeChartData = useMemo(() => {
    const buckets = [
      { range: '< 5 km', min: 0, max: 5, color: '#0284C7' },
      { range: '5 – 10 km', min: 5, max: 10, color: '#0284C7' },
      { range: '10 – 15 km', min: 10, max: 15, color: '#F59E0B' },
      { range: '> 15 km', min: 15, max: 999, color: '#EF4444' }
    ]

    const presenciales = filteredAsesores.filter(a => a.modalidad === 'PRESENCIAL')
    const totalPres = presenciales.length

    if (totalPres > 0) {
      let runningSum = 0
      return buckets.map(b => {
        const count = presenciales.filter(a => a.distanciaKm >= b.min && a.distanciaKm < b.max).length
        runningSum += count
        const acumuladoPct = Math.round((runningSum / totalPres) * 100)
        return {
          range: b.range,
          asesores: count,
          acumulado: acumuladoPct,
          color: b.color
        }
      })
    }

    return buckets.map(b => ({
      range: b.range,
      asesores: 0,
      acumulado: 0,
      color: b.color
    }))
  }, [filteredAsesores])

  // ── 8. Reubicaciones inmediatas ──────────────────────────────────────────────
  const sugerenciasReubicacion = useMemo(() => {
    const base = mobilityData.sugerenciasReubicacion || []
    if (selectedSedeFilter === 'TODAS') return base
    return base.filter(s => s.sedeActual?.includes(selectedSedeFilter) || s.sedeSugerida?.includes(selectedSedeFilter))
  }, [mobilityData.sugerenciasReubicacion, selectedSedeFilter])

  const reubicacionesTableList = useMemo(() => {
    if (sugerenciasReubicacion.length > 0) {
      return sugerenciasReubicacion.slice(0, 5)
    }
    return []
  }, [sugerenciasReubicacion])

  const handleOpenReubicar = (asesor = null) => {
    setSelectedPostulanteParaReubicar(asesor)
    setIsReubicacionModalOpen(true)
  }

  // Sede Buttons Configuration
  const SEDE_BUTTONS = [
    { id: 'TODAS', label: 'Todas' },
    { id: 'ATE', label: 'Ate' },
    { id: 'JOCKEY', label: 'Jockey Plaza' },
    { id: 'SAN_ISIDRO', label: 'San Isidro' },
    { id: 'COMAS', label: 'Comas' }
  ]

  return (
    <div className="flex flex-col w-full h-full min-h-[calc(100vh-60px)] bg-[var(--bg-base)] text-[var(--text-primary)] p-3 sm:p-5 gap-3.5 overflow-y-auto font-sans transition-colors duration-200">
      
      {/* ── 1. CABECERA: TÍTULO Y SELECTOR DE SEDES (PILLS) ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-sm">
        <div className="flex items-center gap-3">
          <h1 className="text-base sm:text-lg font-bold tracking-tight text-[var(--text-primary)]">
            GEA Perú · Workforce Management
          </h1>
          {isPending && (
            <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 text-[11px] font-medium animate-pulse">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-500" />
              Sincronizando...
            </span>
          )}
        </div>

        {/* Sede Pills - Reactivas a todo el tablero */}
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          {SEDE_BUTTONS.map(pill => {
            const isActive = selectedSedeFilter === pill.id
            return (
              <button
                key={pill.id}
                onClick={() => setSelectedSedeFilter(pill.id)}
                className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                  isActive
                    ? 'bg-[#00897B] text-white shadow-sm'
                    : 'bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] border border-[var(--border-subtle)]'
                }`}
              >
                {pill.label}
              </button>
            )
          })}

          {/* Toggle de Filtros Avanzados (Período, Búsqueda, Modalidad) */}
          <button
            onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
            title="Filtros avanzados"
            className={`p-1.5 rounded-full border transition-all cursor-pointer ${
              showAdvancedFilters || searchTerm || selectedModalidadFilter !== 'TODAS' || selectedEstadoFilter !== 'TODOS'
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400'
                : 'bg-[var(--bg-surface)] border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            <SlidersHorizontal size={14} />
          </button>
        </div>
      </div>

      {/* ── BARRA EXPANDIBLE DE FILTROS AVANZADOS ── */}
      {showAdvancedFilters && (
        <div className="flex flex-wrap items-center justify-between gap-2.5 px-4 py-2.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-sm text-xs animate-in fade-in duration-200">
          <div className="flex flex-wrap items-center gap-2">
            {/* Período */}
            <div className="flex items-center gap-1.5 bg-[var(--bg-elevated)] px-3 py-1.5 rounded-lg border border-[var(--border-subtle)]">
              <span className="text-[var(--text-muted)] font-medium">Período:</span>
              <select
                value={selectedPeriodoFilter}
                onChange={e => setSelectedPeriodoFilter(e.target.value)}
                className="bg-transparent text-[var(--text-primary)] font-semibold outline-none cursor-pointer text-xs"
              >
                <option value="TODOS" className="bg-[var(--bg-surface)] text-[var(--text-primary)]">Todos los Períodos</option>
                {(mobilityData.periodosDisponibles?.length > 0 ? mobilityData.periodosDisponibles : ['202609', '202608']).map(per => (
                  <option key={per} value={per} className="bg-[var(--bg-surface)] text-[var(--text-primary)] font-mono">
                    Período {per}
                  </option>
                ))}
              </select>
            </div>

            {/* Modalidad */}
            <div className="flex items-center gap-1.5 bg-[var(--bg-elevated)] px-3 py-1.5 rounded-lg border border-[var(--border-subtle)]">
              <span className="text-[var(--text-muted)] font-medium">Modalidad:</span>
              <select
                value={selectedModalidadFilter}
                onChange={e => setSelectedModalidadFilter(e.target.value)}
                className="bg-transparent text-[var(--text-primary)] font-medium outline-none cursor-pointer text-xs"
              >
                <option value="TODAS" className="bg-[var(--bg-surface)] text-[var(--text-primary)]">Todas las Modalidades</option>
                <option value="PRESENCIAL" className="bg-[var(--bg-surface)] text-cyan-600 dark:text-cyan-300">🏢 Solo Presenciales</option>
                <option value="REMOTO" className="bg-[var(--bg-surface)] text-indigo-600 dark:text-indigo-300">💻 Solo Remotos</option>
              </select>
            </div>

            {/* Estado Operativo */}
            <div className="flex items-center gap-1.5 bg-[var(--bg-elevated)] px-3 py-1.5 rounded-lg border border-[var(--border-subtle)]">
              <span className="text-[var(--text-muted)] font-medium">Estado:</span>
              <select
                value={selectedEstadoFilter}
                onChange={e => setSelectedEstadoFilter(e.target.value)}
                className="bg-transparent text-[var(--text-primary)] font-medium outline-none cursor-pointer text-xs"
              >
                <option value="TODOS" className="bg-[var(--bg-surface)] text-[var(--text-primary)]">Todos los Estados</option>
                <option value="ACTIVO" className="bg-[var(--bg-surface)] text-cyan-600 dark:text-cyan-300">🔵 Activos en Capa</option>
                <option value="I-OP" className="bg-[var(--bg-surface)] text-emerald-600 dark:text-emerald-400">🟢 Pase a OP (I-OP)</option>
                <option value="BAJA" className="bg-[var(--bg-surface)] text-rose-600 dark:text-rose-400">🔴 Bajas / Cesados</option>
              </select>
            </div>
          </div>

          {/* Buscador Rápido */}
          <div className="w-full sm:w-64 relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              type="text"
              placeholder="Buscar asesor, DNI o distrito..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] transition-all"
            />
          </div>
        </div>
      )}

      {/* ── 2. TOP 5 STRIP DE INDICADORES (KPIs) ── */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {/* KPI 1: Nómina total */}
        <div className="p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] flex flex-col justify-between shadow-sm">
          <span className="text-xs font-normal text-[var(--text-muted)]">
            Nómina total
          </span>
          <div className="text-2xl sm:text-3xl font-bold text-[var(--text-primary)] my-1 tracking-tight">
            {currentMetrics.total.toLocaleString()}
          </div>
          <span className="text-[11px] text-[var(--text-muted)]">
            {currentMetrics.presenciales.toLocaleString()} pres. - {currentMetrics.remotos.toLocaleString()} rem.
          </span>
        </div>

        {/* KPI 2: Ingreso a OP */}
        <div className="p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] flex flex-col justify-between shadow-sm">
          <span className="text-xs font-normal text-[var(--text-muted)]">
            Ingreso a OP
          </span>
          <div className="text-2xl sm:text-3xl font-bold text-[var(--text-primary)] my-1 tracking-tight">
            {currentMetrics.iop.toLocaleString()}
          </div>
          <span className="text-[11px] text-[var(--text-muted)]">
            {currentMetrics.pctIop}% de conversión
          </span>
        </div>

        {/* KPI 3: Activos en aula */}
        <div className="p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] flex flex-col justify-between shadow-sm">
          <span className="text-xs font-normal text-[var(--text-muted)]">
            Activos en aula
          </span>
          <div className="text-2xl sm:text-3xl font-bold text-[var(--text-primary)] my-1 tracking-tight">
            {currentMetrics.activos.toLocaleString()}
          </div>
          <span className="text-[11px] text-[var(--text-muted)]">
            Capacitación / OJT
          </span>
        </div>

        {/* KPI 4: Distancia prom. al traslado */}
        <div className="p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] flex flex-col justify-between shadow-sm">
          <span className="text-xs font-normal text-[var(--text-muted)]">
            Distancia prom. al traslado
          </span>
          <div className="text-2xl sm:text-3xl font-bold text-[var(--text-primary)] my-1 tracking-tight">
            {currentMetrics.distProm} km
          </div>
          <span className="text-[11px] text-[var(--text-muted)]">
            ▲ 0,6 km vs. semana anterior
          </span>
        </div>

        {/* KPI 5: Zona crítica (>14 km) */}
        <div className="p-4 rounded-xl bg-[var(--bg-surface)] border border-rose-200 dark:border-rose-900/40 flex flex-col justify-between shadow-sm col-span-2 sm:col-span-1">
          <span className="text-xs font-normal text-rose-500 dark:text-rose-400">
            Zona crítica (&gt;14 km)
          </span>
          <div className="text-2xl sm:text-3xl font-bold text-rose-500 dark:text-rose-400 my-1 tracking-tight">
            {currentMetrics.criticos}
          </div>
          <span className="text-[11px] text-[var(--text-muted)]">
            {currentMetrics.pctCrit}% de la nómina
          </span>
        </div>
      </div>

      {/* ── 3. CUERPO PRINCIPAL: IZQUIERDA (EMBUDO + DONUT) · CENTRO (MAPA CON TRAYECTORIAS) · DERECHA (DISTANCIAS + ALERTAS RECLUTAMIENTO) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5">

        {/* ── COLUMNA IZQUIERDA (3 COLS): EMBUDO RECLUTAMIENTO (NÓMINA -> D0 -> D1) + ASESORES POR SEDE ── */}
        <div className="lg:col-span-3 flex flex-col gap-3.5">
          
          {/* Chart 1: Embudo operativo (Exclusivo Nómina, Día 0 y Día 1) */}
          <div className="p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] flex flex-col shadow-sm">
            <div className="mb-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-[var(--text-primary)] tracking-tight">
                  Embudo de Reclutamiento
                </h3>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold">
                  Efectividad D1: {funnelOperativo[2]?.pct}%
                </span>
              </div>
              <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                Datos de Nómina · Nómina, Día 0 y Día 1
              </p>
            </div>

            <div className="space-y-3.5 my-2">
              {funnelOperativo.map((step, idx) => (
                <div key={idx} className="grid grid-cols-12 items-center gap-1.5 text-xs">
                  {/* Etapa */}
                  <span className="col-span-4 text-[11px] text-[var(--text-secondary)] font-medium truncate">
                    {step.step}
                  </span>

                  {/* Barra centrada */}
                  <div className="col-span-5 flex items-center justify-center h-4">
                    <div
                      className="h-3 rounded-full transition-all duration-500"
                      style={{
                        width: `${step.barWidthPct}%`,
                        backgroundColor: step.color
                      }}
                    />
                  </div>

                  {/* Conteos alineados a la derecha */}
                  <div className="col-span-3 text-right">
                    <div className="font-bold font-mono text-[var(--text-primary)] text-xs leading-none">
                      {step.count.toLocaleString()}
                    </div>
                    <div className="text-[10px] text-[var(--text-muted)] leading-none mt-0.5 font-mono">
                      {step.pct}%
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-2 pt-2.5 border-t border-[var(--border-subtle)] flex items-center justify-between text-[11px] text-[var(--text-muted)]">
              <span>Deserción antes de D1:</span>
              <strong className="text-rose-600 dark:text-rose-400 font-mono">
                {Math.max(0, (funnelOperativo[0]?.count || 0) - (funnelOperativo[2]?.count || 0))} postulantes
              </strong>
            </div>
          </div>

          {/* Chart 2: Asesores por sede (Donut Chart) */}
          <div className="p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] flex flex-col shadow-sm">
            <div className="mb-2">
              <h3 className="text-xs font-bold text-[var(--text-primary)] tracking-tight">
                Asesores por sede
              </h3>
              <p className="text-[11px] text-[var(--text-muted)]">
                Clic en un segmento para filtrar todo el tablero
              </p>
            </div>

            <div className="flex items-center justify-between gap-2 mt-1">
              {/* Donut Chart */}
              <div className="w-[120px] h-[120px] relative shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={sedeDonutData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={36}
                      outerRadius={54}
                      paddingAngle={3}
                      cursor="pointer"
                      onClick={entry => setSelectedSedeFilter(selectedSedeFilter === entry.id ? 'TODAS' : entry.id)}
                    >
                      {sedeDonutData.map(entry => (
                        <Cell
                          key={entry.id}
                          fill={entry.color}
                          opacity={selectedSedeFilter === 'TODAS' || selectedSedeFilter === entry.id ? 1 : 0.35}
                          stroke="transparent"
                        />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Leyenda y Totales */}
              <div className="flex flex-col gap-1.5 text-xs flex-1 min-w-0">
                {sedeDonutData.map(s => (
                  <div
                    key={s.id}
                    onClick={() => setSelectedSedeFilter(selectedSedeFilter === s.id ? 'TODAS' : s.id)}
                    className={`flex items-center justify-between gap-1 px-1.5 py-0.5 rounded cursor-pointer transition-colors ${
                      selectedSedeFilter === s.id ? 'bg-[var(--accent-soft)] font-bold' : 'hover:bg-[var(--bg-elevated)]'
                    }`}
                  >
                    <span className="flex items-center gap-1.5 truncate text-[11px] text-[var(--text-secondary)]">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                      <span className="truncate">{s.name}</span>
                    </span>
                    <span className="font-mono text-xs text-[var(--text-primary)] font-semibold shrink-0">
                      {s.value.toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── COLUMNA CENTRAL (6 COLS): MAPA REAL CON BOTONES DE TRAYECTORIAS Y REUBICACIÓN ── */}
        <div className="lg:col-span-6 flex flex-col gap-3.5">
          <div className="rounded-xl overflow-hidden border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-sm flex flex-col relative">
            
            {/* Header del Mapa con Botones Explícitos para Trayectorias, Distancias y Reubicaciones */}
            <div className="px-4 py-3 bg-[var(--bg-surface)] border-b border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-2.5">
              <div>
                <h3 className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                  <Compass size={15} className="text-cyan-600 dark:text-cyan-400" />
                  <span>Plano Cartográfico de Asesores</span>
                </h3>
                <p className="text-[11px] text-[var(--text-muted)]">
                  Mapeo interactivo de domicilios y rutas de traslado hacia las 4 sedes GEA
                </p>
              </div>

              {/* 🧭 BOTONES DE CONTROL DE LÍNEAS DE DISTANCIA, PUNTOS Y REUBICACIÓN */}
              <div className="flex flex-wrap items-center gap-1.5">
                {/* 1. Modo Puntos */}
                <button
                  onClick={() => setMapMode('puntos')}
                  title="Ver solo marcadores de postulantes"
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                    mapMode === 'puntos'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-subtle)]'
                  }`}
                >
                  <MapPin size={12} />
                  <span>Puntos</span>
                </button>

                {/* 2. Modo Trayectorias (Líneas de distancia a sede) */}
                <button
                  onClick={() => setMapMode('trayectorias')}
                  title="Dibujar líneas de distancia desde cada domicilio hasta la sede asignada"
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                    mapMode === 'trayectorias'
                      ? 'bg-cyan-600 text-white shadow-xs ring-1 ring-cyan-400/50'
                      : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-subtle)]'
                  }`}
                >
                  <Navigation size={12} />
                  <span>Líneas de Distancia</span>
                </button>

                {/* 3. Modo Reubicaciones */}
                <button
                  onClick={() => setMapMode('reubicacion')}
                  title="Visualizar rutas de ahorro y traslados a sedes más cercanas"
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                    mapMode === 'reubicacion'
                      ? 'bg-amber-500 text-slate-950 shadow-xs'
                      : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-subtle)]'
                  }`}
                >
                  <Zap size={12} />
                  <span>Reubicaciones ({sugerenciasReubicacion.length})</span>
                </button>

                {/* 4. Botón Acción Reubicar */}
                <button
                  onClick={() => handleOpenReubicar(null)}
                  title="Abrir motor para reasignar sede a postulantes con traslados excesivos"
                  className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
                >
                  <ArrowRight size={12} />
                  <span>Reubicar</span>
                </button>
              </div>
            </div>

            {/* Canvas de Mapa GeaCommandMap */}
            <div className="w-full h-[480px] relative">
              <GeaCommandMap
                mobilityData={{
                  ...mobilityData,
                  postulantesMapped: filteredAsesores,
                  asesoresMapeados: filteredAsesores,
                  sugerenciasReubicacion
                }}
                selectedSedeId={selectedSedeFilter}
                onSelectSede={setSelectedSedeFilter}
                onOpenReasignacionModal={handleOpenReubicar}
                mapMode={mapMode}
                onMapModeChange={setMapMode}
              />
            </div>
          </div>
        </div>

        {/* ── COLUMNA DERECHA (3 COLS): DISTANCIA POR DISTRITO + DIAGNÓSTICO DE RECLUTAMIENTO ── */}
        <div className="lg:col-span-3 flex flex-col gap-3.5">
          
          {/* Widget 1: Distancia promedio por distrito */}
          <div className="p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] flex flex-col shadow-sm">
            <div className="mb-2">
              <h3 className="text-xs font-bold text-[var(--text-primary)] tracking-tight">
                Distancia promedio por distrito
              </h3>
              <p className="text-[11px] text-[var(--text-muted)]">
                km a la sede · rojo = más de 10 km
              </p>
            </div>

            <div className="space-y-1.5 my-1">
              {distritosBarData.length === 0 ? (
                <div className="py-5 text-center text-xs text-[var(--text-muted)]">
                  Sin traslados presenciales en este filtro
                </div>
              ) : (
                distritosBarData.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-xs">
                    <span className="w-28 text-[11px] text-[var(--text-secondary)] truncate text-right">
                      {item.distrito}
                    </span>
                    <div className="flex-1 flex items-center gap-1.5">
                      <div className="flex-1 bg-[var(--bg-muted)] h-2.5 rounded-xs overflow-hidden">
                        <div
                          className="h-full rounded-xs transition-all duration-500"
                          style={{
                            width: `${Math.min(100, (item.distancia / 15) * 100)}%`,
                            backgroundColor: item.color
                          }}
                        />
                      </div>
                      <span className="text-[10px] font-mono font-bold text-[var(--text-primary)] w-7 text-right">
                        {item.distancia.toString().replace('.', ',')}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Escala numérica inferior (0, 5, 10, 15) */}
            <div className="flex items-center justify-between text-[10px] font-mono text-[var(--text-muted)] pl-28 pr-7 pt-1 border-t border-[var(--border-subtle)] mt-1">
              <span>0</span>
              <span>5</span>
              <span>10</span>
              <span>15</span>
            </div>
          </div>

          {/* Widget 2: Alertas de Reclutamiento por Rutas Críticas (>12 km) */}
          <div className="p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] flex flex-col shadow-sm">
            <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-[var(--border-subtle)]">
              <div>
                <h3 className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                  <AlertTriangle size={13} className="text-amber-500" />
                  <span>Rutas de Reclutamiento Críticas</span>
                </h3>
                <p className="text-[11px] text-[var(--text-muted)]">
                  Candidatos traídos con alto riesgo de caída por distancia
                </p>
              </div>
            </div>

            <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
              {rutasRiesgoReclutamiento.length === 0 ? (
                <div className="py-6 text-center text-xs text-[var(--text-muted)]">
                  No se detectan rutas críticas de traslado (&gt; 9 km) en este filtro
                </div>
              ) : (
                rutasRiesgoReclutamiento.map((r, idx) => (
                  <div
                    key={idx}
                    className="p-2 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-[var(--text-primary)] truncate text-[11px]">
                        {r.distrito} → {r.sede}
                      </span>
                      <span className={`px-1.5 py-0.2 rounded text-[10px] font-mono font-bold ${
                        r.distanciaKm >= 14 ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30' : 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                      }`}>
                        {r.distanciaKm} km
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-[var(--text-muted)]">
                      <span>{r.total} postulantes en nómina</span>
                      <span className="text-rose-600 dark:text-rose-400 font-semibold">{r.bajas} bajas tempranas</span>
                    </div>

                    {r.reubicable && (
                      <div className="flex items-center justify-between text-[10px] pt-1 border-t border-[var(--border-subtle)] text-emerald-600 dark:text-emerald-400">
                        <span>⚡ Mejor sede: <strong>{r.reubicable}</strong></span>
                        <span className="font-mono font-bold">-{r.ahorroKm} km</span>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── 4. FILA INFERIOR: ASESORES POR RANGO DE DISTANCIA (IZQ) Y REUBICACIONES INMEDIATAS (DER) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5">
        
        {/* Chart 5: Asesores por rango de distancia (40-45% width) */}
        <div className="lg:col-span-5 p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] flex flex-col shadow-sm">
          <div className="mb-2">
            <h3 className="text-xs font-bold text-[var(--text-primary)] tracking-tight">
              Asesores por rango de distancia
            </h3>
            <p className="text-[11px] text-[var(--text-muted)]">
              Barras: asesores · Línea: % acumulado
            </p>
          </div>

          <div className="w-full h-[180px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={distanceRangeChartData} margin={{ top: 20, right: 15, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isDark ? '#334155' : '#E2E8F0'} />
                <XAxis
                  dataKey="range"
                  tick={{ fontSize: 10, fill: isDark ? '#94A3B8' : '#64748B' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  yAxisId="left"
                  tick={{ fontSize: 9, fill: isDark ? '#94A3B8' : '#64748B' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  domain={[0, 100]}
                  tickFormatter={v => `${v}%`}
                  tick={{ fontSize: 9, fill: isDark ? '#94A3B8' : '#64748B' }}
                  axisLine={false}
                  tickLine={false}
                />
                <RechartsTooltip
                  contentStyle={{
                    backgroundColor: isDark ? 'var(--bg-surface)' : '#FFFFFF',
                    borderColor: 'var(--border-subtle)',
                    fontSize: '11px',
                    borderRadius: '8px'
                  }}
                  formatter={(value, name) => [name === 'acumulado' ? `${value}%` : value, name === 'acumulado' ? '% Acumulado' : 'Asesores']}
                />
                <Bar yAxisId="left" dataKey="asesores" barSize={38} radius={[2, 2, 0, 0]}>
                  <LabelList dataKey="asesores" position="top" style={{ fontSize: 10, fontWeight: 'bold', fill: isDark ? '#E2E8F0' : '#334155' }} />
                  {distanceRangeChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
                <Line
                  yAxisId="right"
                  type="linear"
                  dataKey="acumulado"
                  name="acumulado"
                  stroke={isDark ? '#CBD5E1' : '#0F172A'}
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: isDark ? '#CBD5E1' : '#0F172A' }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* Leyenda */}
          <div className="flex items-center justify-center gap-4 text-[11px] text-[var(--text-muted)] mt-1">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#0284C7]" /> Asesores
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-slate-800 dark:bg-slate-300" /> % acumulado
            </span>
          </div>
        </div>

        {/* Panel 6: Reubicaciones inmediatas (55-60% width) */}
        <div className="lg:col-span-7 p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] flex flex-col shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h3 className="text-xs font-bold text-[var(--text-primary)] tracking-tight">
                Reubicaciones inmediatas
              </h3>
              <p className="text-[11px] text-[var(--text-muted)]">
                {sugerenciasReubicacion.length} disponibles · ordenadas por ahorro de traslado
              </p>
            </div>
            <button
              onClick={() => handleOpenReubicar(null)}
              className="text-xs text-[var(--accent)] hover:underline font-medium cursor-pointer"
            >
              Ver todas ({sugerenciasReubicacion.length})
            </button>
          </div>

          {/* Tabla de Reubicaciones Inmediatas */}
          <div className="overflow-x-auto w-full">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-[var(--border-subtle)] text-[var(--text-muted)] text-[11px]">
                  <th className="py-2 font-normal">Asesor</th>
                  <th className="py-2 font-normal">Vive en</th>
                  <th className="py-2 font-normal">Sede sugerida</th>
                  <th className="py-2 font-normal">Ahorro</th>
                  <th className="py-2 font-normal text-right"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {reubicacionesTableList.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-xs text-[var(--text-muted)]">
                      No hay sugerencias de reubicación pendientes para este filtro
                    </td>
                  </tr>
                ) : (
                  reubicacionesTableList.map((item, idx) => (
                    <tr key={item.id || idx} className="hover:bg-[var(--bg-elevated)]/50 transition-colors">
                      <td className="py-2.5 font-medium text-[var(--text-primary)]">
                        {item.nombre || item.candidato}
                      </td>
                      <td className="py-2.5 text-[var(--text-secondary)]">
                        {item.distrito}
                      </td>
                      <td className="py-2.5 text-[var(--text-secondary)] font-medium">
                        {item.sedeSugerida}
                      </td>
                      <td className="py-2.5">
                        <div className="inline-flex items-center px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-mono font-semibold text-[11px]">
                          {item.ahorroKm?.toString().replace('.', ',')} km
                        </div>
                      </td>
                      <td className="py-2.5 text-right">
                        <button
                          onClick={() => handleOpenReubicar(item)}
                          className="px-3 py-1 rounded-md bg-[#00897B] hover:bg-[#00796B] text-white font-medium text-xs shadow-xs transition-all cursor-pointer"
                        >
                          Reubicar
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ── MODAL DE REUBICACIÓN INTELIGENTE (PRESERVADO) ── */}
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
