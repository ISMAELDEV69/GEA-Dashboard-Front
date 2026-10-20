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
  UserX,
  RotateCcw
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
import { MessageCircle, Phone } from 'lucide-react'
import GeaCommandMap from '../components/dashboard/GeaCommandMap'
import MobilityReubicacionModal from '../components/dashboard/MobilityReubicacionModal'
import QuickMessageReubicacionModal from '../components/dashboard/QuickMessageReubicacionModal'
import { analyzeMobilityAndDistances, GEA_SEDES, stableJitter, calculateHaversineKm, PERU_DEPARTAMENTOS, resolveDistrictCoordinates, resolveSedeGea, LIMA_DISTRITOS } from '../lib/geoMobilityService'
import { fetchAnaliticaMovilidad, fetchAsistencias } from '../lib/dataService'
import { resolvePeriodoIngreso, normalize2026Period } from '../lib/dashboardAnalytics'
import { supabase } from '../lib/supabase'
import { useIsDarkTheme } from '../hooks/useIsDarkTheme'

// Normalizador de Semana para alineación con las 5 llaves de ResumenCapacitacion
const normSem = (val) => {
  if (!val) return ''
  const s = String(val).trim().toUpperCase()
  if (['ALL', 'TODAS', 'TODOS', '-', 'NULL', 'UNDEFINED'].includes(s)) return ''
  const num = s.replace(/\D/g, '')
  return num ? `SEM ${parseInt(num, 10)}` : s
}

// Normalizador de Segmento operativo (Alineado estrictamente con ResumenCapacitacion y Capacidad R&S)
const normalizeSegmento = (rawSeg, campana) => {
  let s = String(rawSeg || '').trim().toUpperCase()
  const c = String(campana || '').toUpperCase()

  // 1. Campañas exclusivas de CLARO CHILE
  if (
    c.includes('TUVES') ||
    c.includes('CHILE') ||
    s === 'CLARO CHILE' ||
    s.includes('CHILE') ||
    c === 'POSTPAGO' ||
    c === 'ANULACIÓN' ||
    c === 'ANULACION' ||
    c === 'CONTENCIÓN' ||
    c === 'CONTENCION' ||
    c === 'DESCUENTO' ||
    c.startsWith('BO ') ||
    c.includes('BLINDAJE')
  ) {
    return 'CLARO CHILE'
  }

  // 2. Campañas exclusivas de LIPIGAS
  if (c.includes('LIPIGAS') || c.includes('LIMAGAS') || s === 'LIPIGAS' || s.includes('LIPIGAS')) {
    return 'LIPIGAS'
  }

  // 3. EXCEPCIÓN CLAVE: Campañas de Claro Postpago pertenecen a "CLARO PERU"
  if (c.includes('CLARO POSTPAGO')) {
    return 'CLARO PERU'
  }

  // 4. EXCEPCIÓN CLAVE: "RETENCIONES FIJA INBOUND" y "RETENCIONES FIJA" pertenecen a "CLARO PERU"
  if (c.includes('RETENCIONES FIJA') || c.includes('RETENCION FIJA') || c.includes('FIJA INBOUND')) {
    return 'CLARO PERU'
  }

  // 5. Palabras clave y subtipos de RETENCIONES
  if (
    s === 'CLARO PERU RETENCIONES' ||
    s.includes('RETENCION') || 
    c.includes('RETENCION') || 
    c.includes('CONTACTADOS') || 
    c.includes('BABYSTING') || 
    c.includes('CONSULTA PREVIA') || 
    c.includes('MI CLARO') || 
    c.includes('ENCUESTAS IZO') ||
    c.includes('CANAL DIGITAL') ||
    c.includes('WSP INBOUND')
  ) {
    return 'CLARO PERU RETENCIONES'
  }

  // 6. Palabras clave y subtipos de OUT
  if (
    s === 'CLARO PERU OUT' ||
    s.includes('OUT') || 
    c.includes('OUT') || 
    c.includes('PREVENTIVA') || 
    c.includes('PORTA OUT') || 
    c.includes('RENO') || 
    c.includes('VENTAS') || 
    c.includes('CROSS') ||
    c.includes('MIGRACIONES') ||
    c.includes('UPGRADE') ||
    c.includes('VENTA')
  ) {
    return 'CLARO PERU OUT'
  }

  // 7. Si viene explícito CLARO PERU u otro segmento
  if (s === 'CLARO PERU') return 'CLARO PERU'
  if (s && s !== 'OTROS' && s !== 'NULL' && s !== 'UNDEFINED' && s !== '—') {
    return s
  }

  return 'CLARO PERU'
}

export default function UbicacionView({
  postulantes = [],
  sedes = [],
  grupos = [],
  asistencias = [],
  userProfile = null
}) {
  const isDark = useIsDarkTheme()

  // ── Las 5 Llaves Maestras de Geometría y Workforce ──────────────────────────
  const [selectedPeriodoFilter, setSelectedPeriodoFilter] = useState('TODOS') // Periodo de ingreso a capacidad (YYYYMM)
  const [selectedSemanaFilter, setSelectedSemanaFilter] = useState('TODAS')
  const [selectedSegmentoFilter, setSelectedSegmentoFilter] = useState('TODOS')
  const [selectedCampanaFilter, setSelectedCampanaFilter] = useState('TODAS')
  const [selectedGrupoFilter, setSelectedGrupoFilter] = useState('TODOS')

  // ── Filtros Operativos Adicionales ──────────────────────────────────────────
  const [selectedSedeFilter, setSelectedSedeFilter] = useState('TODAS') // 'TODAS', 'ATE', 'JOCKEY', 'SAN_ISIDRO', 'COMAS'
  const [selectedModalidadFilter, setSelectedModalidadFilter] = useState('TODAS') // 'TODAS', 'PRESENCIAL', 'REMOTO'
  const [selectedDepartamentoFilter, setSelectedDepartamentoFilter] = useState('TODOS') // 'TODOS', 'LIMA', 'PROVINCIAS', o nombre de departamento
  const [selectedEstadoFilter, setSelectedEstadoFilter] = useState('TODOS') // 'TODOS', 'I-OP', 'ACTIVO', 'BAJA'
  const [isReubicacionModalOpen, setIsReubicacionModalOpen] = useState(false)
  const [selectedPostulanteParaReubicar, setSelectedPostulanteParaReubicar] = useState(null)
  const [quickMessageModalItem, setQuickMessageModalItem] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(true)
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

  // Sincronización de asistencias de respaldo si no están precargadas en props
  const [localAsistencias, setLocalAsistencias] = useState([])
  useEffect(() => {
    if (!asistencias || asistencias.length === 0) {
      fetchAsistencias()
        .then(res => {
          if (Array.isArray(res) && res.length > 0) {
            setLocalAsistencias(res)
          }
        })
        .catch(err => console.warn('Error loading fallback asistencias in UbicacionView:', err))
    }
  }, [asistencias])

  const effectiveAsistencias = useMemo(() => {
    return (Array.isArray(asistencias) && asistencias.length > 0) ? asistencias : localAsistencias
  }, [asistencias, localAsistencias])

  useEffect(() => {
    let isMounted = true
    startTransition(() => {
      fetchAnaliticaMovilidad()
        .then(rows => {
          if (!isMounted) return
          if (Array.isArray(rows) && rows.length > 0) {
            // Mapeos rápidos para enriquecer datos de contacto y grupo desde postulantes y grupos
            const postMap = new Map()
            if (Array.isArray(postulantes)) {
              for (const p of postulantes) {
                const docKey = String(p.documento || p.postulante_documento || '').trim()
                if (docKey) {
                  postMap.set(docKey, p)
                  const cleanD = docKey.replace(/\D/g, '')
                  if (cleanD) postMap.set(cleanD, p)
                }
                if (p.id) postMap.set(String(p.id), p)
              }
            }

            const grpMap = new Map()
            if (Array.isArray(grupos)) {
              for (const g of grupos) {
                const rawC = String(g.codigo || g.grupo_codigo || g.codigo_grupo || '').trim().toUpperCase()
                const gCamp = String(g.campana || '').trim().toUpperCase()
                if (rawC) {
                  const clean = rawC.replace(/\s*\(SEM\s*\d+.*?\)/i, '').replace(/\s*-\s*SEM\s*\d+.*$/i, '').trim()
                  const withoutPrefix = clean.replace(/^[A-Z]+[_-]/, '')
                  const digitsOnly = clean.replace(/\D/g, '')

                  grpMap.set(rawC, g)
                  grpMap.set(clean, g)
                  grpMap.set(clean.replace(/[-\s]/g, '_'), g)
                  grpMap.set(clean.replace(/[_-]/g, ''), g)
                  if (withoutPrefix) grpMap.set(withoutPrefix, g)
                  if (digitsOnly) grpMap.set(digitsOnly, g)

                  if (gCamp) {
                    grpMap.set(`${gCamp}|${rawC}`, g)
                    grpMap.set(`${gCamp}|${clean}`, g)
                    if (withoutPrefix) grpMap.set(`${gCamp}|${withoutPrefix}`, g)
                  }
                }
                const gName = String(g.nombre || g.campana || '').trim().toUpperCase()
                if (gName) grpMap.set(gName, g)
              }
            }

            const findGroup = (cod, camp) => {
              if (!cod || cod === '—') return {}
              const u = String(cod).trim().toUpperCase()
              const clean = u.replace(/\s*\(SEM\s*\d+.*?\)/i, '').replace(/\s*-\s*SEM\s*\d+.*$/i, '').trim()
              const cleanUnderscore = clean.replace(/[-\s]/g, '_')
              const digitsOnly = clean.replace(/\D/g, '')
              const withoutPrefix = clean.replace(/^[A-Z]+[_-]/, '')

              const campU = String(camp || '').trim().toUpperCase()
              if (campU) {
                const matchCamp = grpMap.get(`${campU}|${clean}`) || grpMap.get(`${campU}|${u}`) || grpMap.get(`${campU}|${withoutPrefix}`)
                if (matchCamp) return matchCamp
              }

              return (
                grpMap.get(u) ||
                grpMap.get(clean) ||
                grpMap.get(cleanUnderscore) ||
                grpMap.get(clean.replace(/[_-]/g, '')) ||
                grpMap.get(withoutPrefix) ||
                (digitsOnly ? grpMap.get(digitsOnly) : null) ||
                {}
              )
            }

            const sugerencias = []
            const mapped = rows.map((r, idx) => {
              const doc = String(r.documento || '').trim()
              const cleanDoc = doc.replace(/\D/g, '')
              const seed = doc || r.id || String(idx)
              const dep = String(r.departamento || '').toUpperCase().trim()
              const rawDistrito = String(r.distrito_residencia || r.ciudad || '').toUpperCase().trim()
              const rawDir = String(r.direccion_domicilio || '').toUpperCase().trim()

              const pMatch = postMap.get(doc) || (cleanDoc ? postMap.get(cleanDoc) : null) || (r.id ? postMap.get(String(r.id)) : null) || {}
              const candCelular = String(pMatch.celular || pMatch.telefono || r.celular || pMatch.celular_referencia || pMatch.movil || '').trim()
              // Precedencia al código de grupo explícito (de la analítica o del postulante)
              const rawGrupoCod = String(
                r.grupo_codigo ||
                pMatch.grupo_codigo ||
                pMatch.codigo_grupo ||
                (pMatch.grupo && !/CLARO|LIPIGAS|CHILE|RETENCIONES|OUT|PORTA/i.test(pMatch.grupo) ? pMatch.grupo : '') ||
                pMatch.grupo ||
                '—'
              ).trim()
              const candCampana = String(r.campana || pMatch.campana || pMatch.campaign || '—').trim().toUpperCase()
              const gObj = findGroup(rawGrupoCod, candCampana)
              const effGrupoCod = String(
                gObj.codigo ||
                gObj.grupo_codigo ||
                gObj.codigo_grupo ||
                r.grupo_codigo ||
                pMatch.grupo_codigo ||
                pMatch.codigo_grupo ||
                rawGrupoCod ||
                '—'
              ).trim()
              const effCampana = String(gObj.campana || candCampana || '—').trim().toUpperCase()
              const candGrupoNombre = String(gObj.nombre || gObj.campana || pMatch.grupo || pMatch.campana || r.campana || effGrupoCod).trim()

              // ── RESOLUCIÓN DE LAS 5 LLAVES COMPUESTAS DE CAPACIDAD ──
              // Período de ingreso a OP / capacidad (prioridad periodo_ingreso_op del grupo / cohorte)
              const rawPeriodoIngreso =
                resolvePeriodoIngreso(gObj) ||
                normalize2026Period(gObj.periodo_ingreso_op || gObj.fecha_ingreso_op || gObj.periodo_ingreso || gObj.periodo_efectivo || gObj.periodo || gObj.periodo_rys || gObj.fecha_inicio_ojt || gObj.fecha_inicio || gObj.fecha_registro) ||
                normalize2026Period(pMatch.periodo_ingreso_op || pMatch.periodo_ingreso || pMatch.fecha_ingreso_op || pMatch.periodo_reclutado || pMatch.periodo || pMatch.fecha_ingreso || pMatch.fecha_conexion_op || pMatch.fecha_inicio_capacitacion || pMatch.created_at) ||
                normalize2026Period(r.periodo) ||
                'SIN PERIODO'

              const rawPeriodoReclutado =
                normalize2026Period(r.periodo) ||
                normalize2026Period(pMatch.periodo_reclutado || pMatch.periodo) ||
                normalize2026Period(gObj.periodo || gObj.periodo_rys) ||
                ''
              const rawPeriodoGrupo =
                normalize2026Period(gObj.periodo || gObj.periodo_rys) ||
                ''

              const candSemana = normSem(gObj.semana || gObj.semana_label || gObj.semana_trabajo || pMatch.semana || r.semana) || '—'
              const rawCandSegmento = gObj.segmento || r.segmento || pMatch.segmento || ''
              const candSegmento = normalizeSegmento(rawCandSegmento, candCampana)

              let rawLat = Number(r.lat_origen)
              let rawLng = Number(r.lng_origen)

              const isLimaDefaultCoords = (isNaN(rawLat) || rawLat === 0 || (rawLat >= -12.15 && rawLat <= -11.95 && rawLng >= -77.10 && rawLng <= -76.85))

              // ── 1. Si es de provincia/otro departamento pero vino con centroide de Lima por defecto (-12.0463) ──
              if (dep && dep !== 'LIMA' && dep !== 'CALLAO') {
                if (isLimaDefaultCoords) {
                  const depMatch = PERU_DEPARTAMENTOS[rawDistrito] || PERU_DEPARTAMENTOS[dep]
                  if (depMatch) {
                    rawLat = depMatch.lat
                    rawLng = depMatch.lng
                  }
                }
              } else {
                // ── 2. Si es de Lima / Callao pero tiene coordenadas genéricas de Lima Centro:
                // Resolver el distrito real específico de Lima Metropolitana
                if (isLimaDefaultCoords && (rawDistrito || rawDir)) {
                  const distRes = resolveDistrictCoordinates(rawDistrito, rawDir, seed)
                  if (distRes && distRes.resolved) {
                    rawLat = distRes.lat
                    rawLng = distRes.lng
                  }
                }
              }

              const baseLat = (!isNaN(rawLat) && rawLat !== 0) ? rawLat : -12.0463
              const baseLng = (!isNaN(rawLng) && rawLng !== 0) ? rawLng : -76.9248

              // Aplicar jitter determinista para que postulantes del mismo distrito o ciudad no se superpongan en un solo pixel
              const { jLat, jLng } = stableJitter(seed, (dep && dep !== 'LIMA' && dep !== 'CALLAO') ? 0.012 : 0.007)
              const origenLat = Number((baseLat + jLat).toFixed(6))
              const origenLng = Number((baseLng + jLng).toFixed(6))

              const sedeId = r.sede_asignada || 'ATE'
              const sedeConfig = GEA_SEDES[sedeId] || GEA_SEDES.ATE
              const rawSedeLat = Number(r.sede_lat)
              const rawSedeLng = Number(r.sede_lng)
              const destinoLat = (!isNaN(rawSedeLat) && rawSedeLat !== 0) ? rawSedeLat : sedeConfig.lat
              const destinoLng = (!isNaN(rawSedeLng) && rawSedeLng !== 0) ? rawSedeLng : sedeConfig.lng
              const sedeNombre = sedeId === 'SAN_ISIDRO' ? 'Sede San Isidro' : sedeId === 'JOCKEY' ? 'Sede Surco' : sedeId === 'COMAS' ? 'Sede Comas' : 'Sede Ate'
              const sedeColor = sedeId === 'SAN_ISIDRO' ? '#06B6D4' : sedeId === 'JOCKEY' ? '#F59E0B' : sedeId === 'COMAS' ? '#EC4899' : '#10B981'

              const modalidad = r.modalidad || 'PRESENCIAL'
              const isRemoto = modalidad === 'REMOTO'
              
              // Calcular distancia real exacta desde origen resuelto a destino de la sede asignada
              let distKm = 0
              if (modalidad === 'PRESENCIAL' && origenLat && destinoLat) {
                distKm = Number(calculateHaversineKm(origenLat, origenLng, destinoLat, destinoLng).toFixed(1))
              } else if (modalidad === 'PRESENCIAL') {
                distKm = Number(r.distancia_km || 0)
              }
              const tiempoEstimadoMin = Math.round(distKm * 2.8)

              // ── Búsqueda de la sede verdaderamente más cercana para presenciales ──
              let mejorSede = null
              let menorDistancia = distKm
              let maxAhorro = 0

              if (modalidad === 'PRESENCIAL' && origenLat && origenLng && distKm > 2) {
                for (const [key, sedeOpt] of Object.entries(GEA_SEDES)) {
                  if (sedeOpt.id !== sedeConfig.id && sedeOpt.lat && sedeOpt.lng) {
                    const dOpt = Number(calculateHaversineKm(origenLat, origenLng, sedeOpt.lat, sedeOpt.lng).toFixed(1))
                    const ahorro = Number((distKm - dOpt).toFixed(1))
                    // Si reduce al menos 1.5 km respecto a la sede actual y es más cercana que la óptima previa
                    if (ahorro >= 1.5 && dOpt < menorDistancia) {
                      menorDistancia = dOpt
                      mejorSede = sedeOpt
                      maxAhorro = ahorro
                    }
                  }
                }
              }

              const sedeSugerida = mejorSede ? mejorSede.nombre : null
              const sedeSugeridaId = mejorSede ? mejorSede.id : null
              const sedeSugeridaLat = mejorSede ? mejorSede.lat : null
              const sedeSugeridaLng = mejorSede ? mejorSede.lng : null
              const ahorroKm = maxAhorro
              const ahorroMin = Math.round(maxAhorro * 2.8)

              const isIOP = r.estado_operativo === 'I-OP'
              const isActivo = r.estado_operativo === 'ACTIVO_AULA'
              const isBaja = r.estado_operativo === 'BAJA'
              const candidatoNombre = r.nombre_completo || 'Postulante'

              if (sedeSugerida && ahorroKm > 0) {
                sugerencias.push({
                  id: r.id || doc || idx,
                  nombre: candidatoNombre,
                  candidato: candidatoNombre,
                  documento: doc || '—',
                  celular: candCelular,
                  telefono: candCelular,
                  grupo: candGrupoNombre,
                  codigo_grupo: effGrupoCod,
                  grupo_codigo: effGrupoCod,
                  distrito: r.ciudad || r.distrito_residencia || 'LIMA',
                  departamento: r.departamento || 'LIMA',
                  direccion: r.direccion_domicilio || 'Domicilio Registrado',
                  sedeActual: sedeNombre,
                  sedeActualId: sedeId,
                  distanciaActual: distKm,
                  distanciaActualKm: distKm,
                  tiempoActualMin: tiempoEstimadoMin,
                  sedeSugerida,
                  sedeSugeridaId,
                  sedeSugeridaLat,
                  sedeSugeridaLng,
                  distanciaSugerida: menorDistancia,
                  distanciaOptimaKm: menorDistancia,
                  tiempoSugeridoMin: Math.round(menorDistancia * 2.8),
                  ahorroKm,
                  ahorroMin,
                  periodoIngreso: rawPeriodoIngreso,
                  periodo: rawPeriodoIngreso,
                  periodoReclutado: rawPeriodoReclutado,
                  periodoGrupo: rawPeriodoGrupo,
                  semana: candSemana,
                  segmento: candSegmento,
                  campana: effCampana,
                  grupoCodigo: effGrupoCod,
                  rawGrupoCodigo: String(r.grupo_codigo || pMatch.grupo_codigo || rawGrupoCod || '').trim(),
                  modalidad,
                  estadoOperativo: r.estado_operativo,
                  esBaja,
                  esIOP
                })
              }

              return {
                id: r.id,
                documento: doc,
                nombre: candidatoNombre,
                candidato: candidatoNombre,
                celular: candCelular,
                telefono: candCelular,
                grupo: candGrupoNombre,
                codigo_grupo: effGrupoCod,
                grupo_codigo: effGrupoCod,
                // Las 5 Llaves Maestras de Capacidad & Workforce
                periodoIngreso: rawPeriodoIngreso,
                periodo: rawPeriodoIngreso, // Sincronizado estrictamente al periodo de ingreso a OP
                periodoReclutado: rawPeriodoReclutado,
                periodoGrupo: rawPeriodoGrupo,
                semana: candSemana,
                segmento: candSegmento,
                campana: effCampana,
                grupoCodigo: effGrupoCod,
                rawGrupoCodigo: String(r.grupo_codigo || pMatch.grupo_codigo || rawGrupoCod || '').trim(),
                modalidad,
                distrito: r.ciudad || r.distrito_residencia || 'LIMA',
                ciudad: r.ciudad || 'LIMA',
                departamento: r.departamento || 'LIMA',
                direccion: r.direccion_domicilio || '',
                // Coordenadas origen (compatibilidad con GeaCommandMap y componentes)
                origenLat,
                origenLng,
                lat: origenLat,
                lng: origenLng,
                // Coordenadas destino de sede
                destinoLat,
                destinoLng,
                sede: {
                  id: sedeId,
                  nombre: sedeNombre,
                  lat: destinoLat,
                  lng: destinoLng,
                  color: sedeColor
                },
                distanciaKm: distKm,
                tiempoEstimadoMin,
                rangoDistancia: r.rango_distancia || (distKm < 5 ? '<5km' : distKm < 10 ? '5-10km' : distKm < 15 ? '10-15km' : '>15km'),
                esCritico: Boolean(r.es_zona_critica) || (modalidad === 'PRESENCIAL' && distKm > 14),
                asistioDia0: Boolean(r.asistio_dia_0),
                asistioDia1: Boolean(r.asistio_dia_1),
                esIOP,
                esActivo,
                esBaja,
                estadoOperativo: r.estado_operativo,
                motivoBaja: r.motivo_baja,
                sedeSugerida,
                sedeSugeridaId,
                sedeSugeridaLat,
                sedeSugeridaLng,
                ahorroKm,
                ahorroMin
              }
            })

            // ── B. Enriquecer con postulantes de la base activa no presentes en analitica_movilidad_geografica ──
            const mappedDocs = new Set()
            mapped.forEach(m => {
              const d = String(m.documento || '').trim()
              if (d) {
                mappedDocs.add(d)
                const cd = d.replace(/\D/g, '')
                if (cd) mappedDocs.add(cd)
              }
            })

            if (Array.isArray(postulantes) && postulantes.length > 0) {
              postulantes.forEach((p, pIdx) => {
                const doc = String(p.documento || p.postulante_documento || '').trim()
                const cleanD = doc.replace(/\D/g, '')
                if (!doc || mappedDocs.has(doc) || (cleanD && mappedDocs.has(cleanD))) return
                mappedDocs.add(doc)
                if (cleanD) mappedDocs.add(cleanD)

                const candCelular = String(p.celular || p.telefono || p.celular_referencia || p.movil || '').trim()
                const rawGrupoCod = String(
                  p.grupo_codigo ||
                  p.codigo_grupo ||
                  (p.grupo && !/CLARO|LIPIGAS|CHILE|RETENCIONES|OUT|PORTA/i.test(p.grupo) ? p.grupo : '') ||
                  p.grupo ||
                  '—'
                ).trim()
                const candCampana = String(p.campana || p.campaign || '—').trim().toUpperCase()
                const gObj = findGroup(rawGrupoCod, candCampana)
                const effGrupoCod = String(
                  gObj.codigo ||
                  gObj.grupo_codigo ||
                  gObj.codigo_grupo ||
                  p.grupo_codigo ||
                  p.codigo_grupo ||
                  rawGrupoCod ||
                  '—'
                ).trim()
                const effCampana = String(gObj.campana || candCampana || '—').trim().toUpperCase()
                const candGrupoNombre = String(gObj.nombre || effCampana || p.grupo || effGrupoCod).trim()

                const rawPeriodoIngreso =
                  resolvePeriodoIngreso(gObj) ||
                  normalize2026Period(gObj.periodo_ingreso_op || gObj.fecha_ingreso_op || gObj.periodo_ingreso || gObj.periodo_efectivo || gObj.periodo || gObj.periodo_rys || gObj.fecha_inicio_ojt || gObj.fecha_inicio || gObj.fecha_registro) ||
                  normalize2026Period(p.periodo_ingreso_op || p.periodo_ingreso || p.fecha_ingreso_op || p.periodo_reclutado || p.periodo || p.fecha_ingreso || p.fecha_conexion_op || p.fecha_inicio_capacitacion || p.created_at) ||
                  'SIN PERIODO'

                const rawPeriodoReclutado =
                  normalize2026Period(p.periodo_reclutado || p.periodo) ||
                  normalize2026Period(gObj.periodo || gObj.periodo_rys) ||
                  ''
                const rawPeriodoGrupo =
                  normalize2026Period(gObj.periodo || gObj.periodo_rys) ||
                  ''

                const candSemana = normSem(gObj.semana || gObj.semana_label || gObj.semana_trabajo || p.semana || p.semana_trabajo) || '—'
                const rawCandSegmento = gObj.segmento || p.segmento || ''
                const candSegmento = normalizeSegmento(rawCandSegmento, effCampana)

                const rawLugar = String(p.distrito_residencia || p.distrito || p.ciudad || p.lugar_residencia || '').toUpperCase().trim()
                const rawDir = String(p.direccion_domicilio || p.direccion || '').toUpperCase().trim()
                const rawSede = String(p.sede || '').toUpperCase().trim()
                const dep = String(p.departamento || '').toUpperCase().trim()

                const geoSeed = doc || p.id || String(pIdx)
                const geoDomicilio = resolveDistrictCoordinates(rawLugar, rawDir, geoSeed)
                const sedeAsignada = resolveSedeGea(rawSede, p)

                const rawMod = String(p.modalidad || p.tipo_trabajo || p.condicion || '').toUpperCase().trim()
                const isRemoto = rawMod.includes('REMOT') || rawMod.includes('HOME') || rawMod.includes('TELETRABAJO') || candCampana.includes('REMOT')
                const modalidad = isRemoto ? 'REMOTO' : 'PRESENCIAL'

                const origenLat = geoDomicilio.lat || -12.0463
                const origenLng = geoDomicilio.lng || -76.9248
                const destinoLat = sedeAsignada.lat || -12.0560
                const destinoLng = sedeAsignada.lng || -76.9530

                let distKm = 0
                if (modalidad === 'PRESENCIAL' && origenLat && destinoLat) {
                  distKm = Number(calculateHaversineKm(origenLat, origenLng, destinoLat, destinoLng).toFixed(1))
                }
                const tiempoEstimadoMin = Math.round(distKm * 2.8)

                const estadoRaw = String(p.estado || p.estado_capacitacion || p.sigla || '').toUpperCase().trim()
                const rawStatusD1 = String(p.status_dia_1 || '').toUpperCase().trim()
                const isIOP = estadoRaw === 'I-OP' || estadoRaw === 'IOP' || rawStatusD1 === 'I-OP'
                const isBaja = !isIOP && (estadoRaw === 'BAJA' || estadoRaw === 'CESADO' || Boolean(p.motivo_baja) || p.activo === false)
                const isActivo = !isIOP && !isBaja
                const candidatoNombre = p.candidato || `${p.nombres || ''} ${p.apellido_paterno || ''}`.trim() || 'Postulante'

                // Búsqueda de sede más cercana para posible reubicación
                let mejorSede = null
                let menorDistancia = distKm
                let maxAhorro = 0

                if (modalidad === 'PRESENCIAL' && origenLat && origenLng && distKm > 2 && sedeAsignada.id) {
                  for (const [key, sedeOpt] of Object.entries(GEA_SEDES)) {
                    if (sedeOpt.id !== sedeAsignada.id && sedeOpt.lat && sedeOpt.lng) {
                      const dOpt = Number(calculateHaversineKm(origenLat, origenLng, sedeOpt.lat, sedeOpt.lng).toFixed(1))
                      const ahorro = Number((distKm - dOpt).toFixed(1))
                      if (ahorro >= 1.5 && dOpt < menorDistancia) {
                        menorDistancia = dOpt
                        mejorSede = sedeOpt
                        maxAhorro = ahorro
                      }
                    }
                  }
                }

                if (mejorSede && maxAhorro > 0) {
                  sugerencias.push({
                    id: p.id || doc,
                    nombre: candidatoNombre,
                    candidato: candidatoNombre,
                    documento: doc || '—',
                    celular: candCelular,
                    telefono: candCelular,
                    grupo: candGrupoNombre,
                    codigo_grupo: effGrupoCod,
                    grupo_codigo: effGrupoCod,
                    distrito: geoDomicilio.distrito || rawLugar || 'LIMA',
                    departamento: dep || 'LIMA',
                    direccion: rawDir || 'Domicilio Registrado',
                    sedeActual: sedeAsignada.nombre,
                    sedeActualId: sedeAsignada.id,
                    distanciaActual: distKm,
                    distanciaActualKm: distKm,
                    tiempoActualMin: tiempoEstimadoMin,
                    sedeSugerida: mejorSede.nombre,
                    sedeSugeridaId: mejorSede.id,
                    sedeSugeridaLat: mejorSede.lat,
                    sedeSugeridaLng: mejorSede.lng,
                    distanciaSugerida: menorDistancia,
                    distanciaOptimaKm: menorDistancia,
                    tiempoSugeridoMin: Math.round(menorDistancia * 2.8),
                    ahorroKm: maxAhorro,
                    ahorroMin: Math.round(maxAhorro * 2.8),
                    periodoIngreso: rawPeriodoIngreso,
                    periodo: rawPeriodoIngreso,
                    periodoReclutado: rawPeriodoReclutado,
                    periodoGrupo: rawPeriodoGrupo,
                    semana: candSemana,
                    segmento: candSegmento,
                    campana: effCampana,
                    grupoCodigo: effGrupoCod,
                    rawGrupoCodigo: String(p.grupo_codigo || p.codigo_grupo || rawGrupoCod || '').trim(),
                    modalidad,
                    estadoOperativo: isIOP ? 'I-OP' : isBaja ? 'BAJA' : 'ACTIVO',
                    esBaja,
                    esIOP
                  })
                }

                mapped.push({
                  id: p.id || doc,
                  documento: doc,
                  nombre: candidatoNombre,
                  candidato: candidatoNombre,
                  celular: candCelular,
                  telefono: candCelular,
                  grupo: candGrupoNombre,
                  codigo_grupo: effGrupoCod,
                  grupo_codigo: effGrupoCod,
                  periodoIngreso: rawPeriodoIngreso,
                  periodo: rawPeriodoIngreso,
                  periodoReclutado: rawPeriodoReclutado,
                  periodoGrupo: rawPeriodoGrupo,
                  semana: candSemana,
                  segmento: candSegmento,
                  campana: effCampana,
                  grupoCodigo: effGrupoCod,
                  rawGrupoCodigo: String(p.grupo_codigo || p.codigo_grupo || rawGrupoCod || '').trim(),
                  modalidad,
                  distrito: geoDomicilio.distrito || rawLugar || 'LIMA',
                  ciudad: geoDomicilio.distrito || rawLugar || 'LIMA',
                  departamento: dep || 'LIMA',
                  direccion: rawDir || 'Domicilio Registrado',
                  origenLat,
                  origenLng,
                  lat: origenLat,
                  lng: origenLng,
                  destinoLat,
                  destinoLng,
                  sede: {
                    id: sedeAsignada.id,
                    nombre: sedeAsignada.nombre,
                    lat: destinoLat,
                    lng: destinoLng,
                    color: sedeAsignada.color
                  },
                  distanciaKm: distKm,
                  tiempoEstimadoMin,
                  rangoDistancia: distKm < 5 ? '<5km' : distKm < 10 ? '5-10km' : distKm < 15 ? '10-15km' : '>15km',
                  esCritico: Boolean(modalidad === 'PRESENCIAL' && distKm > 14),
                  asistioDia0: Boolean(p.asistio_dia_0 || p.dia_0),
                  asistioDia1: Boolean(p.asistio_dia_1 || p.dia_1),
                  esIOP,
                  esActivo,
                  esBaja,
                  estadoOperativo: isIOP ? 'I-OP' : isBaja ? 'BAJA' : 'ACTIVO',
                  motivoBaja: p.motivo_baja || null,
                  sedeSugerida: mejorSede ? mejorSede.nombre : null,
                  sedeSugeridaId: mejorSede ? mejorSede.id : null,
                  sedeSugeridaLat: mejorSede ? mejorSede.lat : null,
                  sedeSugeridaLng: mejorSede ? mejorSede.lng : null,
                  ahorroKm: maxAhorro,
                  ahorroMin: Math.round(maxAhorro * 2.8)
                })
              })
            }

            // Ordenar sugerencias por mayor ahorro de traslado
            sugerencias.sort((a, b) => (b.ahorroKm || 0) - (a.ahorroKm || 0))

            // Extraer periodos disponibles reales
            const persSet = new Set()
            mapped.forEach(m => {
              const p = normalize2026Period(m.periodoIngreso) || normalize2026Period(m.periodo) || (m.periodoIngreso !== 'SIN PERIODO' ? m.periodoIngreso : null)
              if (p) persSet.add(p)
              const pRec = normalize2026Period(m.periodoReclutado)
              if (pRec) persSet.add(pRec)
              const pGrp = normalize2026Period(m.periodoGrupo)
              if (pGrp) persSet.add(pGrp)
            })
            if (Array.isArray(grupos)) {
              grupos.forEach(g => {
                const p = resolvePeriodoIngreso(g) || normalize2026Period(g.periodo_ingreso_op || g.fecha_ingreso_op || g.periodo_ingreso || g.periodo_efectivo || g.periodo || g.periodo_rys)
                if (p) persSet.add(p)
                const pGrp = normalize2026Period(g.periodo || g.periodo_rys)
                if (pGrp) persSet.add(pGrp)
              })
            }
            persSet.add('202609')
            persSet.add('202608')
            const pers = Array.from(persSet).filter(p => /^\d{6}$/.test(p)).sort((a,b) => b.localeCompare(a))

            setMobilityData(prev => ({
              ...prev,
              postulantesMapped: mapped,
              sugerenciasReubicacion: sugerencias,
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
  }, [postulantes, asistencias, grupos])

  const allAsesores = mobilityData.postulantesMapped || []

  // ── Helpers de Comparación Normalizada para las 5 Llaves Maestras ──────────
  const isPeriodoMatch = (a, filter) => {
    if (!filter || filter === 'TODOS') return true
    const cleanFilter = (normalize2026Period(filter) || String(filter).replace(/\D/g, '')).slice(0, 6)

    const pIngreso = (normalize2026Period(a.periodoIngreso) || String(a.periodoIngreso || '').replace(/\D/g, '')).slice(0, 6)
    const pPer = (normalize2026Period(a.periodo) || String(a.periodo || '').replace(/\D/g, '')).slice(0, 6)
    const pRec = (normalize2026Period(a.periodoReclutado) || String(a.periodoReclutado || '').replace(/\D/g, '')).slice(0, 6)
    const pGrp = (normalize2026Period(a.periodoGrupo) || String(a.periodoGrupo || '').replace(/\D/g, '')).slice(0, 6)

    if (cleanFilter) {
      if (
        (pIngreso && pIngreso === cleanFilter) ||
        (pPer && pPer === cleanFilter) ||
        (pRec && pRec === cleanFilter) ||
        (pGrp && pGrp === cleanFilter)
      ) {
        return true
      }
    }
    return (
      a.periodoIngreso === filter ||
      a.periodo === filter ||
      a.periodoReclutado === filter ||
      a.periodoGrupo === filter
    )
  }

  const isSemanaMatch = (a, filter) => {
    if (!filter || filter === 'TODAS') return true
    return normSem(a.semana) === normSem(filter) || a.semana === filter
  }

  const isSegmentoMatch = (a, filter) => {
    if (!filter || filter === 'TODOS') return true
    const normFilter = normalizeSegmento(filter, filter)
    const normA = normalizeSegmento(a.segmento, a.campana)
    return normA === normFilter
  }

  const isCampanaMatch = (a, filter) => {
    if (!filter || filter === 'TODAS') return true
    const ca = String(a.campana || '').trim().toUpperCase()
    const cf = String(filter || '').trim().toUpperCase()
    return ca === cf || ca.includes(cf) || cf.includes(ca)
  }

  const isGrupoMatch = (a, filter) => {
    if (!filter || filter === 'TODOS') return true
    const gf = String(filter || '').trim().toUpperCase()
    const cleanFilter = gf.replace(/\s*\(SEM\s*\d+.*?\)/i, '').replace(/\s*-\s*SEM\s*\d+.*$/i, '').trim()
    const normFilter = cleanFilter.replace(/[_\s-]/g, '')
    const filterDigits = cleanFilter.replace(/\D/g, '')
    const filterNoPrefix = normFilter.replace(/^[A-Z]+/, '')

    const candidateValues = [
      a.grupoCodigo,
      a.codigo_grupo,
      a.grupo_codigo,
      a.rawGrupoCodigo,
      a.grupo
    ].filter(Boolean)

    for (const rawVal of candidateValues) {
      const val = String(rawVal).trim().toUpperCase()
      if (!val || val === '—') continue
      if (val === gf) return true

      const cleanVal = val.replace(/\s*\(SEM\s*\d+.*?\)/i, '').replace(/\s*-\s*SEM\s*\d+.*$/i, '').trim()
      const normVal = cleanVal.replace(/[_\s-]/g, '')
      if (normVal === normFilter) return true

      const valNoPrefix = normVal.replace(/^[A-Z]+/, '')
      if (filterNoPrefix && valNoPrefix && valNoPrefix === filterNoPrefix) return true

      const valDigits = cleanVal.replace(/\D/g, '')
      if (filterDigits.length >= 4 && valDigits.length >= 4) {
        if (valDigits === filterDigits || valDigits.includes(filterDigits) || filterDigits.includes(valDigits)) {
          return true
        }
      }

      if (val.includes(gf) || gf.includes(val)) return true
    }

    return false
  }

  // 1. Periodos disponibles (YYYYMM)
  const availablePeriodos = useMemo(() => {
    const set = new Set()
    allAsesores.forEach(a => {
      const p1 = normalize2026Period(a.periodoIngreso)
      const p2 = normalize2026Period(a.periodo)
      const p3 = normalize2026Period(a.periodoReclutado)
      const p4 = normalize2026Period(a.periodoGrupo)
      if (p1) set.add(p1)
      if (p2) set.add(p2)
      if (p3) set.add(p3)
      if (p4) set.add(p4)
    })
    if (Array.isArray(grupos)) {
      grupos.forEach(g => {
        const p1 = resolvePeriodoIngreso(g)
        const p2 = normalize2026Period(g.periodo_ingreso_op || g.fecha_ingreso_op || g.periodo_ingreso || g.periodo_efectivo)
        const p3 = normalize2026Period(g.periodo || g.periodo_rys)
        if (p1) set.add(p1)
        if (p2) set.add(p2)
        if (p3) set.add(p3)
      })
    }
    set.add('202609')
    set.add('202608')
    return Array.from(set).filter(p => /^\d{6}$/.test(p)).sort((a, b) => b.localeCompare(a))
  }, [allAsesores, grupos])

  // 2. Semanas disponibles (cascada según selectedPeriodoFilter)
  const availableSemanas = useMemo(() => {
    const set = new Set()
    allAsesores.forEach(a => {
      if (!isPeriodoMatch(a, selectedPeriodoFilter)) return
      if (a.semana && a.semana !== '—') set.add(a.semana)
    })
    if (Array.isArray(grupos)) {
      grupos.forEach(g => {
        if (selectedPeriodoFilter !== 'TODOS') {
          const cleanFilter = (normalize2026Period(selectedPeriodoFilter) || String(selectedPeriodoFilter).replace(/\D/g, '')).slice(0, 6)
          const gIngreso = (resolvePeriodoIngreso(g) || normalize2026Period(g.periodo_ingreso_op || g.fecha_ingreso_op || g.periodo_ingreso) || '').slice(0, 6)
          const gPer = (normalize2026Period(g.periodo || g.periodo_rys) || '').slice(0, 6)
          if (cleanFilter && gIngreso !== cleanFilter && gPer !== cleanFilter) return
        }
        const sem = normSem(g.semana || g.semana_label || g.semana_trabajo)
        if (sem && sem !== '—') set.add(sem)
      })
    }
    return Array.from(set).sort((a, b) => {
      const numA = parseInt(String(a).replace(/\D/g, ''), 10) || 0
      const numB = parseInt(String(b).replace(/\D/g, ''), 10) || 0
      return numA - numB
    })
  }, [allAsesores, grupos, selectedPeriodoFilter])

  // 3. Segmentos disponibles (cascada según periodo y semana)
  const availableSegmentos = useMemo(() => {
    const set = new Set()
    allAsesores.forEach(a => {
      if (!isPeriodoMatch(a, selectedPeriodoFilter)) return
      if (!isSemanaMatch(a, selectedSemanaFilter)) return
      const seg = normalizeSegmento(a.segmento, a.campana)
      if (seg && seg !== 'OTROS') set.add(seg)
    })
    if (Array.isArray(grupos)) {
      grupos.forEach(g => {
        if (selectedPeriodoFilter !== 'TODOS') {
          const cleanFilter = (normalize2026Period(selectedPeriodoFilter) || String(selectedPeriodoFilter).replace(/\D/g, '')).slice(0, 6)
          const gIngreso = (resolvePeriodoIngreso(g) || normalize2026Period(g.periodo_ingreso_op || g.fecha_ingreso_op || g.periodo_ingreso) || '').slice(0, 6)
          const gPer = (normalize2026Period(g.periodo || g.periodo_rys) || '').slice(0, 6)
          if (cleanFilter && gIngreso !== cleanFilter && gPer !== cleanFilter) return
        }
        if (selectedSemanaFilter !== 'TODAS') {
          const sem = normSem(g.semana || g.semana_label || g.semana_trabajo)
          if (sem !== normSem(selectedSemanaFilter)) return
        }
        const seg = normalizeSegmento(g.segmento, g.campana)
        if (seg && seg !== 'OTROS') set.add(seg)
      })
    }
    // Asegurar los segmentos clave de la operación si no hubiera filtros restrictivos
    if (set.size === 0) {
      ;['CLARO PERU', 'CLARO PERU RETENCIONES', 'CLARO PERU OUT', 'CLARO CHILE', 'LIPIGAS'].forEach(s => set.add(s))
    }
    return Array.from(set).sort()
  }, [allAsesores, grupos, selectedPeriodoFilter, selectedSemanaFilter])

  // 4. Campañas disponibles (cascada según periodo, semana, segmento)
  const availableCampanas = useMemo(() => {
    const set = new Set()
    allAsesores.forEach(a => {
      if (!isPeriodoMatch(a, selectedPeriodoFilter)) return
      if (!isSemanaMatch(a, selectedSemanaFilter)) return
      if (!isSegmentoMatch(a, selectedSegmentoFilter)) return
      if (a.campana && a.campana !== '—') set.add(a.campana)
    })
    if (Array.isArray(grupos)) {
      grupos.forEach(g => {
        if (selectedPeriodoFilter !== 'TODOS') {
          const cleanFilter = (normalize2026Period(selectedPeriodoFilter) || String(selectedPeriodoFilter).replace(/\D/g, '')).slice(0, 6)
          const gIngreso = (resolvePeriodoIngreso(g) || normalize2026Period(g.periodo_ingreso_op || g.fecha_ingreso_op || g.periodo_ingreso) || '').slice(0, 6)
          const gPer = (normalize2026Period(g.periodo || g.periodo_rys) || '').slice(0, 6)
          if (cleanFilter && gIngreso !== cleanFilter && gPer !== cleanFilter) return
        }
        if (selectedSemanaFilter !== 'TODAS') {
          const sem = normSem(g.semana || g.semana_label || g.semana_trabajo)
          if (sem !== normSem(selectedSemanaFilter)) return
        }
        if (selectedSegmentoFilter !== 'TODOS') {
          const seg = normalizeSegmento(g.segmento, g.campana)
          if (seg !== normalizeSegmento(selectedSegmentoFilter, selectedSegmentoFilter)) return
        }
        const camp = String(g.campana || g.nombre || '').trim()
        if (camp && camp !== '—') set.add(camp)
      })
    }
    return Array.from(set).sort()
  }, [allAsesores, grupos, selectedPeriodoFilter, selectedSemanaFilter, selectedSegmentoFilter])

  // 5. Grupos disponibles (cascada según periodo, semana, segmento, campaña)
  const availableGrupos = useMemo(() => {
    const set = new Set()
    allAsesores.forEach(a => {
      if (!isPeriodoMatch(a, selectedPeriodoFilter)) return
      if (!isSemanaMatch(a, selectedSemanaFilter)) return
      if (!isSegmentoMatch(a, selectedSegmentoFilter)) return
      if (!isCampanaMatch(a, selectedCampanaFilter)) return
      if (a.grupoCodigo && a.grupoCodigo !== '—') set.add(a.grupoCodigo)
    })
    if (Array.isArray(grupos)) {
      grupos.forEach(g => {
        if (selectedPeriodoFilter !== 'TODOS') {
          const cleanFilter = (normalize2026Period(selectedPeriodoFilter) || String(selectedPeriodoFilter).replace(/\D/g, '')).slice(0, 6)
          const gIngreso = (resolvePeriodoIngreso(g) || normalize2026Period(g.periodo_ingreso_op || g.fecha_ingreso_op || g.periodo_ingreso) || '').slice(0, 6)
          const gPer = (normalize2026Period(g.periodo || g.periodo_rys) || '').slice(0, 6)
          if (cleanFilter && gIngreso !== cleanFilter && gPer !== cleanFilter) return
        }
        if (selectedSemanaFilter !== 'TODAS') {
          const sem = normSem(g.semana || g.semana_label || g.semana_trabajo)
          if (sem !== normSem(selectedSemanaFilter)) return
        }
        if (selectedSegmentoFilter !== 'TODOS') {
          const seg = normalizeSegmento(g.segmento, g.campana)
          if (seg !== normalizeSegmento(selectedSegmentoFilter, selectedSegmentoFilter)) return
        }
        if (selectedCampanaFilter !== 'TODAS') {
          const camp = String(g.campana || g.nombre || '').trim().toUpperCase()
          const cf = String(selectedCampanaFilter).trim().toUpperCase()
          if (!camp.includes(cf) && !cf.includes(camp)) return
        }
        const gCod = String(g.codigo || g.grupo_codigo || g.codigo_grupo || '').trim()
        if (gCod && gCod !== '—') set.add(gCod)
      })
    }
    return Array.from(set).sort()
  }, [allAsesores, grupos, selectedPeriodoFilter, selectedSemanaFilter, selectedSegmentoFilter, selectedCampanaFilter])

  // Manejadores de cambio con cascada automática
  const handlePeriodoChange = (val) => {
    setSelectedPeriodoFilter(val)
    setSelectedSemanaFilter('TODAS')
    setSelectedSegmentoFilter('TODOS')
    setSelectedCampanaFilter('TODAS')
    setSelectedGrupoFilter('TODOS')
  }

  const handleSemanaChange = (val) => {
    setSelectedSemanaFilter(val)
    setSelectedSegmentoFilter('TODOS')
    setSelectedCampanaFilter('TODAS')
    setSelectedGrupoFilter('TODOS')
  }

  const handleSegmentoChange = (val) => {
    setSelectedSegmentoFilter(val)
    setSelectedCampanaFilter('TODAS')
    setSelectedGrupoFilter('TODOS')
  }

  const handleCampanaChange = (val) => {
    setSelectedCampanaFilter(val)
    setSelectedGrupoFilter('TODOS')
  }

  const handleGrupoChange = (val) => {
    setSelectedGrupoFilter(val)
  }

  const handleResetFilters = () => {
    setSelectedPeriodoFilter('TODOS')
    setSelectedSemanaFilter('TODAS')
    setSelectedSegmentoFilter('TODOS')
    setSelectedCampanaFilter('TODAS')
    setSelectedGrupoFilter('TODOS')
    setSelectedModalidadFilter('TODAS')
    setSelectedDepartamentoFilter('TODOS')
    setSelectedEstadoFilter('TODOS')
    setSelectedSedeFilter('TODAS')
    setSearchTerm('')
  }

  const activeFiltersCount = useMemo(() => {
    let count = 0
    if (selectedPeriodoFilter !== 'TODOS') count++
    if (selectedSemanaFilter !== 'TODAS') count++
    if (selectedSegmentoFilter !== 'TODOS') count++
    if (selectedCampanaFilter !== 'TODAS') count++
    if (selectedGrupoFilter !== 'TODOS') count++
    if (selectedModalidadFilter !== 'TODAS') count++
    if (selectedDepartamentoFilter !== 'TODOS') count++
    if (selectedEstadoFilter !== 'TODOS') count++
    if (selectedSedeFilter !== 'TODAS') count++
    if (searchTerm.trim()) count++
    return count
  }, [
    selectedPeriodoFilter,
    selectedSemanaFilter,
    selectedSegmentoFilter,
    selectedCampanaFilter,
    selectedGrupoFilter,
    selectedModalidadFilter,
    selectedDepartamentoFilter,
    selectedEstadoFilter,
    selectedSedeFilter,
    searchTerm
  ])

  // ── 1. Filtrado reactivo de postulantes según las 5 LLAVES COMPUESTAS ────────
  const filteredAsesores = useMemo(() => {
    let list = mobilityData.postulantesMapped || []

    // 1. Las 5 Llaves Maestras con Normalización Robusta:
    if (selectedPeriodoFilter !== 'TODOS') {
      list = list.filter(a => isPeriodoMatch(a, selectedPeriodoFilter))
    }
    if (selectedSemanaFilter !== 'TODAS') {
      list = list.filter(a => isSemanaMatch(a, selectedSemanaFilter))
    }
    if (selectedSegmentoFilter !== 'TODOS') {
      list = list.filter(a => isSegmentoMatch(a, selectedSegmentoFilter))
    }
    if (selectedCampanaFilter !== 'TODAS') {
      list = list.filter(a => isCampanaMatch(a, selectedCampanaFilter))
    }
    if (selectedGrupoFilter !== 'TODOS') {
      list = list.filter(a => isGrupoMatch(a, selectedGrupoFilter))
    }

    // 2. Filtro por Modalidad (Presencial vs Remoto)
    if (selectedModalidadFilter !== 'TODAS') {
      list = list.filter(a => a.modalidad === selectedModalidadFilter)
    }

    // 2b. Filtro por Departamento / Región
    if (selectedDepartamentoFilter === 'PROVINCIAS') {
      list = list.filter(a => {
        const d = String(a.departamento || '').toUpperCase().trim()
        return d !== 'LIMA' && d !== 'CALLAO'
      })
    } else if (selectedDepartamentoFilter === 'LIMA') {
      list = list.filter(a => {
        const d = String(a.departamento || '').toUpperCase().trim()
        return d === 'LIMA' || d === 'CALLAO'
      })
    } else if (selectedDepartamentoFilter !== 'TODOS') {
      list = list.filter(a => {
        const d = String(a.departamento || '').toUpperCase().trim()
        return d === selectedDepartamentoFilter
      })
    }

    // 3. Filtro por Estado Operativo (I-OP, Activos en Capa, Bajas/Cesados)
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
    selectedPeriodoFilter,
    selectedSemanaFilter,
    selectedSegmentoFilter,
    selectedCampanaFilter,
    selectedGrupoFilter,
    selectedModalidadFilter,
    selectedDepartamentoFilter,
    selectedEstadoFilter,
    selectedSedeFilter,
    searchTerm
  ])

  // Catálogo dinámico de departamentos presentes en la nómina
  const departamentosDisponibles = useMemo(() => {
    const counts = {}
    ;(mobilityData.postulantesMapped || []).forEach(p => {
      const dep = String(p.departamento || 'LIMA').toUpperCase().trim()
      if (dep) counts[dep] = (counts[dep] || 0) + 1
    })
    return Object.entries(counts)
      .map(([dep, count]) => ({ dep, count }))
      .sort((a, b) => b.count - a.count)
  }, [mobilityData.postulantesMapped])

  // ── 2. Métricas de Alto Impacto (KPI Cards) ──────────────────────────────────
  const currentMetrics = useMemo(() => {
    const total = filteredAsesores.length
    const presenciales = filteredAsesores.filter(a => a.modalidad === 'PRESENCIAL')
    const remotos = filteredAsesores.filter(a => a.modalidad === 'REMOTO').length
    const iop = filteredAsesores.filter(a => a.esIOP).length
    const bajas = filteredAsesores.filter(a => a.esBaja).length
    const activos = filteredAsesores.filter(a => a.esActivo).length
    const criticos = presenciales.filter(a => a.distanciaKm > 14).length

    const validPresenciales = presenciales.filter(a => a.distanciaKm > 0 && a.distanciaKm <= 45)
    const distTot = validPresenciales.reduce((acc, a) => acc + (a.distanciaKm || 0), 0)
    const distProm = validPresenciales.length > 0 ? (distTot / validPresenciales.length).toFixed(1).replace('.', ',') : '0,0'
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
  // ── 4. Donut: Asesores por Sede (Reactivo a filtros de cohorte) ──────────────
  const sedeDonutData = useMemo(() => {
    const sedesConfig = [
      { id: 'ATE', nombre: 'Ate', color: '#10B981' },
      { id: 'JOCKEY', nombre: 'Jockey Plaza', color: '#F59E0B' },
      { id: 'SAN_ISIDRO', nombre: 'San Isidro', color: '#06B6D4' },
      { id: 'COMAS', nombre: 'Comas', color: '#EC4899' }
    ]

    let cohort = mobilityData.postulantesMapped || []
    if (selectedPeriodoFilter !== 'TODOS') {
      cohort = cohort.filter(a => isPeriodoMatch(a, selectedPeriodoFilter))
    }
    if (selectedSemanaFilter !== 'TODAS') {
      cohort = cohort.filter(a => isSemanaMatch(a, selectedSemanaFilter))
    }
    if (selectedSegmentoFilter !== 'TODOS') {
      cohort = cohort.filter(a => isSegmentoMatch(a, selectedSegmentoFilter))
    }
    if (selectedCampanaFilter !== 'TODAS') {
      cohort = cohort.filter(a => isCampanaMatch(a, selectedCampanaFilter))
    }
    if (selectedGrupoFilter !== 'TODOS') {
      cohort = cohort.filter(a => isGrupoMatch(a, selectedGrupoFilter))
    }
    if (selectedModalidadFilter !== 'TODAS') {
      cohort = cohort.filter(a => a.modalidad === selectedModalidadFilter)
    }
    if (selectedDepartamentoFilter === 'PROVINCIAS') {
      cohort = cohort.filter(a => {
        const d = String(a.departamento || '').toUpperCase().trim()
        return d !== 'LIMA' && d !== 'CALLAO'
      })
    } else if (selectedDepartamentoFilter === 'LIMA') {
      cohort = cohort.filter(a => {
        const d = String(a.departamento || '').toUpperCase().trim()
        return d === 'LIMA' || d === 'CALLAO'
      })
    } else if (selectedDepartamentoFilter !== 'TODOS') {
      cohort = cohort.filter(a => String(a.departamento || '').toUpperCase().trim() === selectedDepartamentoFilter)
    }
    if (selectedEstadoFilter === 'I-OP') {
      cohort = cohort.filter(a => a.esIOP || a.estadoOperativo === 'I-OP')
    } else if (selectedEstadoFilter === 'ACTIVO') {
      cohort = cohort.filter(a => a.esActivo && !a.esIOP && !a.esBaja)
    } else if (selectedEstadoFilter === 'BAJA') {
      cohort = cohort.filter(a => a.esBaja)
    }
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase()
      cohort = cohort.filter(a =>
        String(a.nombre || a.candidato || '').toLowerCase().includes(q) ||
        String(a.distrito || '').toLowerCase().includes(q) ||
        String(a.documento || '').toLowerCase().includes(q) ||
        String(a.campana || '').toLowerCase().includes(q)
      )
    }

    const items = sedesConfig.map(s => {
      const count = cohort.filter(a => {
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

    const total = items.reduce((sum, item) => sum + item.value, 0)
    return items.map(item => ({
      ...item,
      totalCohort: total,
      pctNum: total > 0 ? (item.value / total) * 100 : 0,
      pct: total > 0 ? ((item.value / total) * 100).toFixed(1) : '0.0'
    }))
  }, [
    mobilityData.postulantesMapped,
    selectedPeriodoFilter,
    selectedSemanaFilter,
    selectedSegmentoFilter,
    selectedCampanaFilter,
    selectedGrupoFilter,
    selectedModalidadFilter,
    selectedDepartamentoFilter,
    selectedEstadoFilter,
    searchTerm,
    selectedSedeFilter
  ])

  const totalSedesCount = useMemo(() => {
    return sedeDonutData.reduce((acc, curr) => acc + curr.value, 0)
  }, [sedeDonutData])

  const selectedSedeItem = useMemo(() => {
    return sedeDonutData.find(s => s.id === selectedSedeFilter)
  }, [sedeDonutData, selectedSedeFilter])

  // ── 5. Análisis de Bajas y Deserción por Distancia ──────────────────────────
  const bajasDistanciaStats = useMemo(() => {
    const bajas = filteredAsesores.filter(a => a.esBaja)
    const totalBajas = bajas.length

    // Identificar bajas donde el motivo registrado fue DISTANCIA / LEJANÍA,
    // o que vivían a distancia crítica (>= 10 km) en presencial y fueron baja
    const bajasPorDistancia = bajas.filter(a => {
      const m = String(a.motivoBaja || '').toUpperCase()
      if (m.includes('DISTANCIA') || m.includes('LEJAN') || m.includes('TRASLADO') || m.includes('VIAJE')) {
        return true
      }
      if (a.modalidad === 'PRESENCIAL' && a.distanciaKm >= 10 && (
        m.includes('DESERCI') || m.includes('FALTA') || m.includes('NO ASIST') || m.includes('ABANDON') || m.includes('BAJA D') || !m || m === 'BAJA'
      )) {
        return true
      }
      return false
    })

    const countBajasDistancia = bajasPorDistancia.length
    const pctSobreBajas = totalBajas > 0 ? Math.round((countBajasDistancia / totalBajas) * 100) : 0

    // Distancias válidas para cálculo promedio (filtrando provincias distantes de >45 km)
    const validDists = bajasPorDistancia
      .map(b => b.distanciaKm)
      .filter(d => typeof d === 'number' && d > 0 && d <= 45)

    const distPromedio = validDists.length > 0
      ? (validDists.reduce((acc, v) => acc + v, 0) / validDists.length).toFixed(1)
      : '0.0'

    // Agrupación de bajas por distrito
    const distMap = new Map()
    bajasPorDistancia.forEach(b => {
      const distName = b.distrito || 'LIMA'
      if (!distMap.has(distName)) {
        distMap.set(distName, {
          distrito: distName,
          count: 0,
          sedes: {},
          distanciaAcum: 0,
          distanciaCount: 0
        })
      }
      const entry = distMap.get(distName)
      entry.count += 1
      const sNom = b.sede?.nombre?.replace('Sede ', '') || 'GEA'
      entry.sedes[sNom] = (entry.sedes[sNom] || 0) + 1
      if (b.distanciaKm > 0 && b.distanciaKm <= 45) {
        entry.distanciaAcum += b.distanciaKm
        entry.distanciaCount += 1
      }
    })

    const topDistritos = Array.from(distMap.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 6)
      .map(d => {
        const mainSede = Object.entries(d.sedes).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Sede'
        const avgKm = d.distanciaCount > 0 ? (d.distanciaAcum / d.distanciaCount).toFixed(1) : '-'
        return {
          distrito: d.distrito,
          count: d.count,
          mainSede,
          avgKm
        }
      })

    const maxCount = topDistritos.length > 0 ? Math.max(...topDistritos.map(d => d.count)) : 1

    return {
      totalBajas,
      countBajasDistancia,
      pctSobreBajas,
      distPromedio,
      topDistritos,
      maxCount
    }
  }, [filteredAsesores])

  // ── 6. Alertador de Faltas (Injustificadas FI y Justificadas FJ) ───────────
  const faltasAlertData = useMemo(() => {
    const cohortDocsSet = new Set(filteredAsesores.map(a => String(a.documento || '').trim()).filter(Boolean))
    const asesorByDoc = new Map(filteredAsesores.map(a => [String(a.documento || '').trim(), a]))

    let countFI = 0
    let countFJ = 0
    const asesoresFaltasMap = new Map()

    const rawList = Array.isArray(effectiveAsistencias) ? effectiveAsistencias : []
    rawList.forEach(item => {
      const doc = String(item.postulante_documento || item.documento || item.documento_identidad || '').trim()
      if (!doc || !cohortDocsSet.has(doc)) return

      const rawSig = String(item.sigla_asistencia || item.sigla || item.estado || '').trim().toUpperCase()
      const isFI = rawSig === 'FI' || rawSig === 'FALTA INJUSTIFICADA' || (rawSig === 'FALTA' && !rawSig.includes('JUSTIF'))
      const isFJ = rawSig === 'FJ' || rawSig === 'FALTA JUSTIFICADA' || rawSig.includes('JUSTIF')

      if (isFI || isFJ) {
        if (isFI) countFI++
        if (isFJ) countFJ++

        if (!asesoresFaltasMap.has(doc)) {
          const asesor = asesorByDoc.get(doc) || {}
          asesoresFaltasMap.set(doc, {
            id: asesor.id || doc,
            doc,
            documento: doc,
            nombre: asesor.nombre || asesor.candidato || `${item.nombres || ''} ${item.apellido_paterno || ''}`.trim() || 'Asesor',
            candidato: asesor.nombre || asesor.candidato || `${item.nombres || ''} ${item.apellido_paterno || ''}`.trim() || 'Asesor',
            sede: asesor.sede?.nombre?.replace('Sede ', '').split(' (')[0] || asesor.sede || item.sede || '—',
            sedeActual: asesor.sede?.nombre || asesor.sede || item.sede || '—',
            sedeSugerida: asesor.sedeSugerida || null,
            ahorroKm: asesor.ahorroKm || 0,
            ahorroMin: asesor.ahorroMin || 0,
            distrito: asesor.distrito || item.ciudad || '—',
            grupo: asesor.grupoCodigo || item.codigo_grupo || item.grupo || '—',
            codigo_grupo: asesor.grupoCodigo || item.codigo_grupo || '—',
            grupo_codigo: asesor.grupoCodigo || item.codigo_grupo || '—',
            modalidad: asesor.modalidad || 'PRESENCIAL',
            celular: asesor.celular || item.celular || '',
            telefono: asesor.celular || item.celular || '',
            countFI: 0,
            countFJ: 0,
            totalFaltas: 0
          })
        }

        const aData = asesoresFaltasMap.get(doc)
        if (isFI) aData.countFI++
        if (isFJ) aData.countFJ++
        aData.totalFaltas++
      }
    })

    const listaAsesoresAlerta = Array.from(asesoresFaltasMap.values()).sort((a, b) => {
      // Prioridad por gravedad: más faltas injustificadas primero, luego total de faltas
      if (b.countFI !== a.countFI) return b.countFI - a.countFI
      return b.totalFaltas - a.totalFaltas
    })

    const totalFaltas = countFI + countFJ
    const pctFI = totalFaltas > 0 ? Math.round((countFI / totalFaltas) * 100) : 0
    const pctFJ = totalFaltas > 0 ? Math.round((countFJ / totalFaltas) * 100) : 0

    return {
      countFI,
      countFJ,
      totalFaltas,
      pctFI,
      pctFJ,
      totalAfectados: listaAsesoresAlerta.length,
      listaAsesoresAlerta
    }
  }, [effectiveAsistencias, filteredAsesores])

  // ── 7. Asesores por rango de distancia ───────────────────────────────────────
  const distanceRangeChartData = useMemo(() => {
    const buckets = [
      { range: '< 5 km', min: 0, max: 5, color: '#0284C7' },
      { range: '5 – 10 km', min: 5, max: 10, color: '#0284C7' },
      { range: '10 – 15 km', min: 10, max: 15, color: '#F59E0B' },
      { range: '> 15 km', min: 15, max: 999, color: '#EF4444' }
    ]

    const presenciales = filteredAsesores.filter(a => a.modalidad === 'PRESENCIAL' && a.distanciaKm > 0 && a.distanciaKm <= 45)
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

  // ── 8. Reubicaciones inmediatas (conectadas a filteredAsesores) ───────────────
  const sugerenciasReubicacion = useMemo(() => {
    const filteredDocSet = new Set(filteredAsesores.map(a => a.documento || a.id))
    const base = (mobilityData.sugerenciasReubicacion || []).filter(s =>
      filteredDocSet.has(s.documento) || filteredDocSet.has(s.id)
    )

    if (selectedSedeFilter === 'TODAS') return base
    return base.filter(s => {
      const matchActual = s.sedeActualId === selectedSedeFilter ||
        (selectedSedeFilter === 'SAN_ISIDRO' && (s.sedeActual?.includes('Isidro') || s.sedeActualId === 'SAN_ISIDRO')) ||
        (selectedSedeFilter === 'JOCKEY' && (s.sedeActual?.includes('Surco') || s.sedeActual?.includes('Jockey') || s.sedeActualId === 'JOCKEY')) ||
        (selectedSedeFilter === 'ATE' && (s.sedeActual?.includes('Ate') || s.sedeActualId === 'ATE')) ||
        (selectedSedeFilter === 'COMAS' && (s.sedeActual?.includes('Comas') || s.sedeActualId === 'COMAS'))

      const matchSugerida = s.sedeSugeridaId === selectedSedeFilter ||
        (selectedSedeFilter === 'SAN_ISIDRO' && (s.sedeSugerida?.includes('Isidro') || s.sedeSugeridaId === 'SAN_ISIDRO')) ||
        (selectedSedeFilter === 'JOCKEY' && (s.sedeSugerida?.includes('Surco') || s.sedeSugerida?.includes('Jockey') || s.sedeSugeridaId === 'JOCKEY')) ||
        (selectedSedeFilter === 'ATE' && (s.sedeSugerida?.includes('Ate') || s.sedeSugeridaId === 'ATE')) ||
        (selectedSedeFilter === 'COMAS' && (s.sedeSugerida?.includes('Comas') || s.sedeSugeridaId === 'COMAS'))

      return matchActual || matchSugerida
    })
  }, [mobilityData.sugerenciasReubicacion, filteredAsesores, selectedSedeFilter])

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

  const handleOpenQuickMessage = (asesor) => {
    if (!asesor) return
    setQuickMessageModalItem(asesor)
  }

  const handleApplyReubicacion = async (itemOrId, targetSedeId = null) => {
    const item = typeof itemOrId === 'object' && itemOrId !== null
      ? itemOrId
      : (mobilityData.sugerenciasReubicacion || []).find(s => s.id === itemOrId || s.documento === itemOrId)

    if (!item) return

    const targetSede = targetSedeId
      ? (GEA_SEDES[targetSedeId] || Object.values(GEA_SEDES).find(s => s.nombre.includes(targetSedeId)))
      : (Object.values(GEA_SEDES).find(s => s.id === item.sedeSugeridaId || s.nombre === item.sedeSugerida) || GEA_SEDES.ATE)

    if (!targetSede) return

    try {
      if (supabase && item.documento && item.documento !== '—') {
        // Actualizar en analitica_movilidad_geografica
        await supabase
          .from('analitica_movilidad_geografica')
          .update({
            sede_asignada: targetSede.id,
            sede_lat: targetSede.lat,
            sede_lng: targetSede.lng,
            updated_at: new Date().toISOString()
          })
          .eq('documento', item.documento)

        // Actualizar en nominas si existe
        await supabase
          .from('nominas')
          .update({ sede: targetSede.nombre })
          .eq('documento', item.documento)

        // Actualizar en postulantes si existe
        await supabase
          .from('postulantes')
          .update({ sede: targetSede.nombre })
          .eq('documento', item.documento)
      }

      // Actualizar estado local reactivo inmediatamente
      setMobilityData(prev => {
        const updatedPostulantes = (prev.postulantesMapped || []).map(p => {
          if (p.id === item.id || (p.documento && p.documento === item.documento)) {
            const newDist = calculateHaversineKm(p.origenLat, p.origenLng, targetSede.lat, targetSede.lng)
            return {
              ...p,
              sede: {
                id: targetSede.id,
                nombre: targetSede.nombre,
                lat: targetSede.lat,
                lng: targetSede.lng,
                color: targetSede.color
              },
              destinoLat: targetSede.lat,
              destinoLng: targetSede.lng,
              distanciaKm: newDist,
              tiempoEstimadoMin: Math.round(newDist * 2.8),
              sedeSugerida: null,
              sedeSugeridaId: null,
              ahorroKm: 0,
              ahorroMin: 0
            }
          }
          return p
        })

        const updatedSugerencias = (prev.sugerenciasReubicacion || []).filter(
          s => s.id !== item.id && s.documento !== item.documento
        )

        return {
          ...prev,
          postulantesMapped: updatedPostulantes,
          sugerenciasReubicacion: updatedSugerencias
        }
      })
    } catch (err) {
      console.warn('Error aplicando reubicación:', err)
    }
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

      {/* ── BARRA INTEGRAL DE FILTROS (5 LLAVES MAESTRAS + OPERACIÓN) ── */}
      {showAdvancedFilters && (
        <div className="flex flex-col gap-2.5 px-4 py-3 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-sm text-xs animate-in fade-in duration-200">
          {/* Fila 1: Las 5 Llaves Maestras de Capacidad y Workforce */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              {/* 1. Periodo */}
              <div className="flex items-center gap-1.5 bg-[var(--bg-elevated)] px-2.5 py-1.5 rounded-lg border border-[var(--border-subtle)]">
                <span className="text-[var(--text-muted)] font-semibold text-[11px]">Período:</span>
                <select
                  value={selectedPeriodoFilter}
                  onChange={e => handlePeriodoChange(e.target.value)}
                  className="bg-transparent text-[var(--text-primary)] font-bold outline-none cursor-pointer text-xs"
                >
                  <option value="TODOS" className="bg-[var(--bg-surface)] text-[var(--text-primary)]">Todos</option>
                  {availablePeriodos.map(per => (
                    <option key={per} value={per} className="bg-[var(--bg-surface)] text-[var(--text-primary)] font-mono">
                      {per}
                    </option>
                  ))}
                </select>
              </div>

              {/* 2. Semana */}
              <div className="flex items-center gap-1.5 bg-[var(--bg-elevated)] px-2.5 py-1.5 rounded-lg border border-[var(--border-subtle)]">
                <span className="text-[var(--text-muted)] font-semibold text-[11px]">Semana:</span>
                <select
                  value={selectedSemanaFilter}
                  onChange={e => handleSemanaChange(e.target.value)}
                  className="bg-transparent text-[var(--text-primary)] font-medium outline-none cursor-pointer text-xs"
                >
                  <option value="TODAS" className="bg-[var(--bg-surface)] text-[var(--text-primary)]">Todas</option>
                  {availableSemanas.map(sem => (
                    <option key={sem} value={sem} className="bg-[var(--bg-surface)] text-[var(--text-primary)] font-mono">
                      {sem}
                    </option>
                  ))}
                </select>
              </div>

              {/* 3. Segmento */}
              <div className="flex items-center gap-1.5 bg-[var(--bg-elevated)] px-2.5 py-1.5 rounded-lg border border-[var(--border-subtle)]">
                <span className="text-[var(--text-muted)] font-semibold text-[11px]">Segmento:</span>
                <select
                  value={selectedSegmentoFilter}
                  onChange={e => handleSegmentoChange(e.target.value)}
                  className="bg-transparent text-[var(--text-primary)] font-medium outline-none cursor-pointer text-xs"
                >
                  <option value="TODOS" className="bg-[var(--bg-surface)] text-[var(--text-primary)]">Todos</option>
                  {availableSegmentos.map(seg => (
                    <option key={seg} value={seg} className="bg-[var(--bg-surface)] text-[var(--text-primary)]">
                      {seg}
                    </option>
                  ))}
                </select>
              </div>

              {/* 4. Campaña */}
              <div className="flex items-center gap-1.5 bg-[var(--bg-elevated)] px-2.5 py-1.5 rounded-lg border border-[var(--border-subtle)]">
                <span className="text-[var(--text-muted)] font-semibold text-[11px]">Campaña:</span>
                <select
                  value={selectedCampanaFilter}
                  onChange={e => handleCampanaChange(e.target.value)}
                  className="bg-transparent text-[var(--text-primary)] font-medium outline-none cursor-pointer text-xs max-w-[150px] truncate"
                >
                  <option value="TODAS" className="bg-[var(--bg-surface)] text-[var(--text-primary)]">Todas</option>
                  {availableCampanas.map(c => (
                    <option key={c} value={c} className="bg-[var(--bg-surface)] text-[var(--text-primary)]">
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              {/* 5. Grupo */}
              <div className="flex items-center gap-1.5 bg-[var(--bg-elevated)] px-2.5 py-1.5 rounded-lg border border-[var(--border-subtle)]">
                <span className="text-[var(--text-muted)] font-semibold text-[11px]">Grupo:</span>
                <select
                  value={selectedGrupoFilter}
                  onChange={e => handleGrupoChange(e.target.value)}
                  className="bg-transparent text-[var(--text-primary)] font-mono font-bold outline-none cursor-pointer text-xs max-w-[130px] truncate"
                >
                  <option value="TODOS" className="bg-[var(--bg-surface)] text-[var(--text-primary)]">Todos</option>
                  {availableGrupos.map(g => (
                    <option key={g} value={g} className="bg-[var(--bg-surface)] text-[var(--text-primary)] font-mono">
                      {g}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Reset Filters */}
            {activeFiltersCount > 0 && (
              <button
                onClick={handleResetFilters}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 font-bold text-xs transition-all cursor-pointer shrink-0"
              >
                <RotateCcw size={12} />
                <span>Limpiar filtros ({activeFiltersCount})</span>
              </button>
            )}
          </div>

          {/* Fila 2: Modalidad, Región, Estado Operativo y Buscador */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[var(--border-subtle)]/70">
            <div className="flex flex-wrap items-center gap-2">
              {/* Modalidad */}
              <div className="flex items-center gap-1.5 bg-[var(--bg-elevated)] px-2.5 py-1.5 rounded-lg border border-[var(--border-subtle)]">
                <span className="text-[var(--text-muted)] font-medium text-[11px]">Modalidad:</span>
                <select
                  value={selectedModalidadFilter}
                  onChange={e => setSelectedModalidadFilter(e.target.value)}
                  className="bg-transparent text-[var(--text-primary)] font-medium outline-none cursor-pointer text-xs"
                >
                  <option value="TODAS" className="bg-[var(--bg-surface)] text-[var(--text-primary)]">Todas</option>
                  <option value="PRESENCIAL" className="bg-[var(--bg-surface)] text-cyan-600 dark:text-cyan-300">🏢 Solo Presenciales</option>
                  <option value="REMOTO" className="bg-[var(--bg-surface)] text-indigo-600 dark:text-indigo-300">💻 Solo Remotos</option>
                </select>
              </div>

              {/* Departamento / Cobertura Nacional */}
              <div className="flex items-center gap-1.5 bg-[var(--bg-elevated)] px-2.5 py-1.5 rounded-lg border border-[var(--border-subtle)]">
                <span className="text-[var(--text-muted)] font-medium text-[11px]">Región/Depto:</span>
                <select
                  value={selectedDepartamentoFilter}
                  onChange={e => setSelectedDepartamentoFilter(e.target.value)}
                  className="bg-transparent text-[var(--text-primary)] font-medium outline-none cursor-pointer text-xs"
                >
                  <option value="TODOS" className="bg-[var(--bg-surface)] text-[var(--text-primary)]">🇵🇪 Todos los Deptos</option>
                  <option value="LIMA" className="bg-[var(--bg-surface)] text-cyan-600 dark:text-cyan-400">🏢 Lima & Callao</option>
                  <option value="PROVINCIAS" className="bg-[var(--bg-surface)] text-amber-500 font-bold">📍 Solo Provincias</option>
                  {departamentosDisponibles.filter(d => d.dep !== 'LIMA' && d.dep !== 'CALLAO').map(d => (
                    <option key={d.dep} value={d.dep} className="bg-[var(--bg-surface)] text-[var(--text-primary)]">
                      {d.dep} ({d.count})
                    </option>
                  ))}
                </select>
              </div>

              {/* Estado Operativo */}
              <div className="flex items-center gap-1.5 bg-[var(--bg-elevated)] px-2.5 py-1.5 rounded-lg border border-[var(--border-subtle)]">
                <span className="text-[var(--text-muted)] font-medium text-[11px]">Estado:</span>
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

          {/* Chart 2: Asesores por sede (Donut Chart Proporcionado) */}
          <div className="p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] flex flex-col shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h3 className="text-xs font-bold text-[var(--text-primary)] tracking-tight flex items-center gap-1.5">
                  <Building2 size={13} className="text-emerald-600 dark:text-emerald-400" />
                  <span>Asesores por sede</span>
                </h3>
                <p className="text-[11px] text-[var(--text-muted)]">
                  Clic en un segmento para filtrar todo el tablero
                </p>
              </div>
              {selectedSedeFilter !== 'TODAS' && (
                <button
                  onClick={() => setSelectedSedeFilter('TODAS')}
                  className="text-[10px] px-2 py-0.5 rounded font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 transition-all flex items-center gap-1 shrink-0"
                  title="Restablecer filtro de sede"
                >
                  <span>Ver todas</span>
                  <span className="font-bold">✕</span>
                </button>
              )}
            </div>

            <div className="flex items-center justify-between gap-3 mt-1">
              {/* Donut Chart with Centered KPI */}
              <div className="w-[136px] h-[136px] relative shrink-0 flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <RechartsTooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const d = payload[0].payload
                          return (
                            <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] px-2.5 py-1.5 rounded-lg shadow-lg text-xs">
                              <div className="flex items-center gap-1.5 font-bold text-[var(--text-primary)]">
                                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.color }} />
                                <span>{d.name}</span>
                              </div>
                              <div className="flex items-center justify-between gap-3 text-[11px] text-[var(--text-secondary)] mt-1 font-mono">
                                <span>{d.value.toLocaleString()} asesores</span>
                                <span className="font-bold text-[var(--text-primary)]">{d.pct}%</span>
                              </div>
                            </div>
                          )
                        }
                        return null
                      }}
                    />
                    <Pie
                      data={sedeDonutData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={42}
                      outerRadius={63}
                      paddingAngle={4}
                      cornerRadius={3}
                      cursor="pointer"
                      onClick={entry => setSelectedSedeFilter(selectedSedeFilter === entry.id ? 'TODAS' : entry.id)}
                    >
                      {sedeDonutData.map(entry => (
                        <Cell
                          key={entry.id}
                          fill={entry.color}
                          opacity={selectedSedeFilter === 'TODAS' || selectedSedeFilter === entry.id ? 1 : 0.3}
                          stroke="transparent"
                        />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>

                {/* Central Overlay inside the Donut Hole */}
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none select-none text-center px-1">
                  {selectedSedeFilter !== 'TODAS' && selectedSedeItem ? (
                    <>
                      <span className="text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)] truncate max-w-[76px] leading-tight">
                        {selectedSedeItem.name}
                      </span>
                      <span className="text-sm font-black font-mono text-[var(--text-primary)] leading-tight my-0.5">
                        {selectedSedeItem.value.toLocaleString()}
                      </span>
                      <span
                        className="text-[9px] font-bold px-1.5 py-0.2 rounded-full text-white leading-tight shadow-xs"
                        style={{ backgroundColor: selectedSedeItem.color }}
                      >
                        {selectedSedeItem.pct}%
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)] leading-tight">
                        Total
                      </span>
                      <span className="text-base font-black font-mono text-[var(--text-primary)] leading-tight my-0.5">
                        {totalSedesCount.toLocaleString()}
                      </span>
                      <span className="text-[9px] text-[var(--text-muted)] leading-tight">
                        Asesores
                      </span>
                    </>
                  )}
                </div>
              </div>

              {/* Leyenda y Proporciones */}
              <div className="flex flex-col gap-1.5 text-xs flex-1 min-w-0 justify-center">
                {sedeDonutData.map(s => {
                  const isActive = selectedSedeFilter === s.id
                  const isDimmed = selectedSedeFilter !== 'TODAS' && !isActive

                  return (
                    <div
                      key={s.id}
                      onClick={() => setSelectedSedeFilter(selectedSedeFilter === s.id ? 'TODAS' : s.id)}
                      className={`group flex flex-col px-2 py-1 rounded-lg cursor-pointer transition-all border ${
                        isActive
                          ? 'bg-[var(--accent-soft)] border-emerald-500/40 shadow-xs'
                          : isDimmed
                          ? 'opacity-45 hover:opacity-90 border-transparent hover:bg-[var(--bg-elevated)]'
                          : 'border-transparent hover:bg-[var(--bg-elevated)]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1.5">
                        <div className="flex items-center gap-1.5 truncate min-w-0">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0 transition-transform group-hover:scale-110"
                            style={{
                              backgroundColor: s.color,
                              boxShadow: isActive ? `0 0 8px ${s.color}` : `0 0 4px ${s.color}66`
                            }}
                          />
                          <span
                            className={`text-[11px] truncate ${
                              isActive ? 'font-bold text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'
                            }`}
                          >
                            {s.name}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-[10px] font-mono px-1 py-0.2 rounded bg-black/5 dark:bg-white/10 text-[var(--text-muted)] font-medium">
                            {s.pct}%
                          </span>
                          <span className="font-mono text-xs font-bold text-[var(--text-primary)] min-w-[36px] text-right">
                            {s.value.toLocaleString()}
                          </span>
                        </div>
                      </div>

                      {/* Mini barra de proporción visual */}
                      <div className="w-full h-1 bg-[var(--border-subtle)]/40 rounded-full overflow-hidden mt-1">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${Math.max(2, s.pctNum)}%`,
                            backgroundColor: s.color
                          }}
                        />
                      </div>
                    </div>
                  )
                })}
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
                onSendQuickMessage={handleOpenQuickMessage}
                mapMode={mapMode}
                onMapModeChange={setMapMode}
              />
            </div>
          </div>
        </div>

        {/* ── COLUMNA DERECHA (3 COLS): DISTANCIA POR DISTRITO + DIAGNÓSTICO DE RECLUTAMIENTO ── */}
        <div className="lg:col-span-3 flex flex-col gap-3.5">
          
          {/* Widget 1: Bajas y Deserción por Distancia */}
          <div className="p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] flex flex-col shadow-sm">
            <div className="flex items-center justify-between mb-2 pb-2 border-b border-[var(--border-subtle)]">
              <div>
                <h3 className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1.5 tracking-tight">
                  <UserX size={14} className="text-rose-500" />
                  <span>Bajas por Distancia</span>
                </h3>
                <p className="text-[11px] text-[var(--text-muted)]">
                  Deserción atribuible a lejanía por distrito
                </p>
              </div>
              <div className="text-right">
                <span className="text-sm font-black font-mono text-rose-600 dark:text-rose-400">
                  {bajasDistanciaStats.countBajasDistancia}
                </span>
                <span className="text-[10px] text-[var(--text-muted)] block font-medium">
                  {bajasDistanciaStats.pctSobreBajas}% del total bajas
                </span>
              </div>
            </div>

            {/* Micro métricas de impacto */}
            <div className="grid grid-cols-2 gap-2 mb-3">
              <div className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-center">
                <span className="text-[10px] text-rose-700 dark:text-rose-300 font-semibold uppercase block">Bajas Lejanía</span>
                <span className="text-base font-black font-mono text-rose-600 dark:text-rose-400">
                  {bajasDistanciaStats.countBajasDistancia}
                </span>
              </div>
              <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-center">
                <span className="text-[10px] text-amber-700 dark:text-amber-300 font-semibold uppercase block">Dist. Promedio</span>
                <span className="text-base font-black font-mono text-amber-600 dark:text-amber-400">
                  {bajasDistanciaStats.distPromedio} km
                </span>
              </div>
            </div>

            {/* Listado de Distritos Afectados */}
            <div className="space-y-2 my-1 flex-1">
              {bajasDistanciaStats.topDistritos.length === 0 ? (
                <div className="py-6 flex flex-col items-center justify-center text-center text-xs text-[var(--text-muted)] gap-1.5">
                  <CheckCircle2 size={24} className="text-emerald-500 opacity-80" />
                  <span>Sin bajas por distancia en este corte</span>
                </div>
              ) : (
                bajasDistanciaStats.topDistritos.map((item, idx) => {
                  const pctWidth = Math.max(12, Math.round((item.count / bajasDistanciaStats.maxCount) * 100))
                  return (
                    <div key={idx} className="flex flex-col gap-1 text-xs">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-semibold text-[var(--text-primary)] truncate max-w-[130px]" title={item.distrito}>
                          {item.distrito}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] text-[var(--text-muted)] truncate max-w-[110px]">
                            ➔ {item.mainSede} ({item.avgKm} km)
                          </span>
                          <span className="px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-700 dark:text-rose-300 font-bold font-mono text-[10px]">
                            {item.count} {item.count === 1 ? 'baja' : 'bajas'}
                          </span>
                        </div>
                      </div>
                      <div className="w-full bg-[var(--bg-muted)] h-1.5 rounded-xs overflow-hidden">
                        <div
                          className="h-full rounded-xs bg-rose-500 transition-all duration-500"
                          style={{ width: `${pctWidth}%` }}
                        />
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>

          {/* Widget 2: Alertador de Faltas (Injustificadas FI y Justificadas FJ) */}
          <div className="p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] flex flex-col shadow-sm">
            <div className="flex items-center justify-between mb-2.5 pb-2 border-b border-[var(--border-subtle)]">
              <div>
                <h3 className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                  <ShieldAlert size={14} className="text-rose-500" />
                  <span>Alertador de Faltas</span>
                </h3>
                <p className="text-[11px] text-[var(--text-muted)]">
                  Inasistencias injustificadas (FI) y justificadas (FJ)
                </p>
              </div>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold border ${
                faltasAlertData.totalFaltas > 0
                  ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/25'
                  : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/25'
              }`}>
                {faltasAlertData.totalFaltas} {faltasAlertData.totalFaltas === 1 ? 'falta' : 'faltas'}
              </span>
            </div>

            {/* Split KPIs: Injustificadas vs Justificadas */}
            <div className="grid grid-cols-2 gap-2 mb-2">
              {/* Tarjeta FI */}
              <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-rose-600 dark:text-rose-400 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                    Injustificadas (FI)
                  </span>
                  <span className="text-[9px] font-mono font-bold px-1 py-0.2 rounded bg-rose-500/20 text-rose-700 dark:text-rose-300">
                    {faltasAlertData.pctFI}%
                  </span>
                </div>
                <div className="mt-1 flex items-baseline justify-between">
                  <span className="text-lg font-black font-mono text-rose-700 dark:text-rose-300 leading-none">
                    {faltasAlertData.countFI.toLocaleString()}
                  </span>
                  <span className="text-[9px] text-rose-600/80 dark:text-rose-400/80 font-medium">
                    {faltasAlertData.countFI === 1 ? 'registro' : 'registros'}
                  </span>
                </div>
              </div>

              {/* Tarjeta FJ */}
              <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                    Justificadas (FJ)
                  </span>
                  <span className="text-[9px] font-mono font-bold px-1 py-0.2 rounded bg-amber-500/20 text-amber-700 dark:text-amber-300">
                    {faltasAlertData.pctFJ}%
                  </span>
                </div>
                <div className="mt-1 flex items-baseline justify-between">
                  <span className="text-lg font-black font-mono text-amber-700 dark:text-amber-300 leading-none">
                    {faltasAlertData.countFJ.toLocaleString()}
                  </span>
                  <span className="text-[9px] text-amber-600/80 dark:text-amber-400/80 font-medium">
                    {faltasAlertData.countFJ === 1 ? 'registro' : 'registros'}
                  </span>
                </div>
              </div>
            </div>

            {/* Barra Proporcional de Ausentismo */}
            {faltasAlertData.totalFaltas > 0 && (
              <div className="mb-2">
                <div className="w-full bg-[var(--border-subtle)]/40 h-1.5 rounded-full overflow-hidden flex">
                  <div
                    className="h-full bg-rose-500 transition-all duration-500"
                    style={{ width: `${faltasAlertData.pctFI}%` }}
                    title={`Faltas Injustificadas: ${faltasAlertData.countFI} (${faltasAlertData.pctFI}%)`}
                  />
                  <div
                    className="h-full bg-amber-400 transition-all duration-500"
                    style={{ width: `${faltasAlertData.pctFJ}%` }}
                    title={`Faltas Justificadas: ${faltasAlertData.countFJ} (${faltasAlertData.pctFJ}%)`}
                  />
                </div>
              </div>
            )}

            {/* Lista de Asesores con Faltas / Riesgo Operativo */}
            <div className="space-y-1.5 max-h-[165px] overflow-y-auto pr-1">
              {faltasAlertData.listaAsesoresAlerta.length === 0 ? (
                <div className="py-5 text-center text-xs text-[var(--text-muted)] flex flex-col items-center gap-1">
                  <CheckCircle2 size={20} className="text-emerald-500 mb-0.5" />
                  <span className="font-semibold text-[var(--text-primary)]">Sin alertas de inasistencia</span>
                  <span className="text-[10px]">No hay faltas injustificadas ni justificadas en esta cohorte</span>
                </div>
              ) : (
                faltasAlertData.listaAsesoresAlerta.map((asesor, idx) => (
                  <div
                    key={asesor.doc || idx}
                    className="p-2 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-xs flex flex-col gap-1 hover:border-rose-500/30 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-1.5">
                      <div className="flex items-center gap-1.5 min-w-0 truncate">
                        <span className={`w-2 h-2 rounded-full shrink-0 ${
                          asesor.countFI >= 2 ? 'bg-rose-600 animate-pulse' : asesor.countFI > 0 ? 'bg-rose-500' : 'bg-amber-500'
                        }`} />
                        <span className="font-bold text-[var(--text-primary)] truncate text-[11px]" title={asesor.nombre}>
                          {asesor.nombre}
                        </span>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        {asesor.countFI > 0 && (
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/30">
                            {asesor.countFI} FI
                          </span>
                        )}
                        {asesor.countFJ > 0 && (
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                            {asesor.countFJ} FJ
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-[var(--text-muted)] pt-0.5">
                      <span className="truncate max-w-[170px]" title={`${asesor.sede} · ${asesor.grupo} · ${asesor.distrito}`}>
                        {asesor.sede} · {asesor.grupo}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <span className={`font-semibold ${
                          asesor.countFI >= 2 ? 'text-rose-600 dark:text-rose-400' : 'text-[var(--text-secondary)]'
                        }`}>
                          {asesor.countFI >= 2 ? 'Riesgo Crítico' : `${asesor.totalFaltas} ${asesor.totalFaltas === 1 ? 'falta' : 'faltas'}`}
                        </span>
                        {asesor.celular && (
                          <button
                            onClick={() => handleOpenQuickMessage(asesor)}
                            className="p-0.5 rounded text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 transition-colors"
                            title="Enviar WhatsApp de regularización o alerta"
                          >
                            <MessageCircle size={11} />
                          </button>
                        )}
                      </div>
                    </div>
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
                  <th className="py-2 font-normal">Grupo</th>
                  <th className="py-2 font-normal">Teléfono</th>
                  <th className="py-2 font-normal">Vive en</th>
                  <th className="py-2 font-normal">Sede sugerida</th>
                  <th className="py-2 font-normal">Ahorro</th>
                  <th className="py-2 font-normal text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {reubicacionesTableList.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-6 text-center text-xs text-[var(--text-muted)]">
                      No hay sugerencias de reubicación pendientes para este filtro
                    </td>
                  </tr>
                ) : (
                  reubicacionesTableList.map((item, idx) => (
                    <tr key={item.id || idx} className="hover:bg-[var(--bg-elevated)]/50 transition-colors">
                      {/* Asesor */}
                      <td className="py-2.5 font-medium text-[var(--text-primary)]">
                        <div>
                          <span>{item.nombre || item.candidato}</span>
                          {item.documento && item.documento !== '—' && (
                            <span className="block text-[10px] text-[var(--text-muted)] font-mono">
                              DNI: {item.documento}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Grupo y Código */}
                      <td className="py-2.5 text-[var(--text-secondary)]">
                        <div className="flex flex-col gap-0.5">
                          <span className="truncate max-w-[140px] font-medium" title={item.grupo}>
                            {item.grupo || 'Sin grupo'}
                          </span>
                          {(item.codigo_grupo || item.grupo_codigo) && item.codigo_grupo !== '—' && (
                            <span className="w-fit px-1.5 py-0.2 rounded bg-cyan-500/10 border border-cyan-500/30 text-cyan-700 dark:text-cyan-300 font-bold font-mono text-[9px]">
                              {item.codigo_grupo || item.grupo_codigo}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Teléfono */}
                      <td className="py-2.5 font-mono text-emerald-600 dark:text-emerald-400 font-bold">
                        {item.celular || item.telefono ? (
                          <div className="flex items-center gap-1">
                            <Phone size={10} />
                            <span>{item.celular || item.telefono}</span>
                          </div>
                        ) : (
                          <span className="text-[var(--text-muted)] font-normal">—</span>
                        )}
                      </td>

                      {/* Vive en */}
                      <td className="py-2.5 text-[var(--text-secondary)]">
                        {item.distrito}
                      </td>

                      {/* Sede sugerida */}
                      <td className="py-2.5 text-[var(--text-secondary)] font-medium">
                        <div>
                          <span className="text-[var(--text-primary)] font-bold">{item.sedeSugerida}</span>
                          <span className="block text-[10px] text-[var(--text-muted)]">
                            Actual: {item.sedeActual}
                          </span>
                        </div>
                      </td>

                      {/* Ahorro */}
                      <td className="py-2.5">
                        <div className="inline-flex flex-col items-start">
                          <div className="inline-flex items-center px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-mono font-semibold text-[11px]">
                            {item.ahorroKm?.toString().replace('.', ',')} km
                          </div>
                          <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-mono mt-0.5">
                            ~{item.ahorroMin || Math.round(item.ahorroKm * 2.8)} min menos
                          </span>
                        </div>
                      </td>

                      {/* Acciones: Mensaje Rápido y Reubicar */}
                      <td className="py-2.5 text-right">
                        <div className="inline-flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleOpenQuickMessage(item)}
                            title="Enviar mensaje rápido por WhatsApp para coordinar reubicación"
                            className="px-2.5 py-1 rounded-md bg-[#25D366] hover:bg-[#20BD5A] text-white font-bold text-xs shadow-xs transition-all cursor-pointer flex items-center gap-1 active:scale-95"
                          >
                            <MessageCircle size={12} />
                            <span>Mensaje</span>
                          </button>

                          <button
                            onClick={() => handleOpenReubicar(item)}
                            title="Gestionar reubicación de este asesor"
                            className="px-3 py-1 rounded-md bg-[#00897B] hover:bg-[#00796B] text-white font-medium text-xs shadow-xs transition-all cursor-pointer active:scale-95"
                          >
                            Reubicar
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
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
        onApplyReubicacion={handleApplyReubicacion}
        onSendQuickMessage={handleOpenQuickMessage}
      />

      {/* ── MODAL DE MENSAJE RÁPIDO POR WHATSAPP ── */}
      <QuickMessageReubicacionModal
        isOpen={Boolean(quickMessageModalItem)}
        onClose={() => setQuickMessageModalItem(null)}
        item={quickMessageModalItem}
        onApplyReubicacion={handleApplyReubicacion}
      />
    </div>
  )
}
