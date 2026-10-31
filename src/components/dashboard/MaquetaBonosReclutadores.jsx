import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import {
  Banknote, Award, Target, Users, TrendingUp, Sparkles, Filter,
  ChevronRight, ChevronDown, CheckCircle2, AlertTriangle, XCircle,
  HelpCircle, Download, Search, Sliders, Calculator, Eye, Shield,
  ArrowUpRight, ArrowDownRight, RefreshCw, Layers, PieChart as PieIcon,
  Check, FileSpreadsheet, Info, X, Printer, CreditCard, UploadCloud
} from 'lucide-react'
import {
  MATRIZ_CARGOS,
  calcularMaquetaBonosReclutadores,
  fmtMoney,
  fmtPct,
  round2,
  getAlcanceDia1,
  getAlcanceDotacion,
  getAlcanceCalidad,
  getAlcanceProcesosAdm
} from '../../lib/maquetaReclutadoresEngine'
import { 
  getEquipoReclutamiento, 
  guardarLiquidacionPeriodo, 
  fetchMaquetaBaseOperativa, 
  guardarMaquetaBaseOperativa, 
  sincronizarMaquetaBaseDesdeConsolidado,
  fetchLiquidacionesPeriodo,
  fetchTrazabilidadPostulantesGrupoMaqueta
} from '../../lib/dataService'
import Card, { CardHeader, CardTitle, CardContent } from '../ui/Card'

export default function MaquetaBonosReclutadores({
  kpiRows = [],
  userProfile = null,
  periodoSeleccionado = '',
  onSelectPeriodo = null,
  periodosDisponibles = []
}) {
  const userRole = String(userProfile?.rol || userProfile?.role || '').toLowerCase()
  const isLockedRecruiter = userRole === 'reclutador'

  // ── 1. ESTADOS LOCALES ─────────────────────────────────────────────────────
  const [equipoList, setEquipoList] = useState([])
  const [loadingEquipo, setLoadingEquipo] = useState(true)
  const [activeTab, setActiveTab] = useState('bonos_oficial') // 'bonos_oficial' | 'base_operativa' | 'simulador' | 'trazabilidad_auditoria' | 'maqueta_reglas'
  const [searchTerm, setSearchTerm] = useState('')
  const [searchBaseTerm, setSearchBaseTerm] = useState('')
  const [filterBaseCampana, setFilterBaseCampana] = useState('TODAS')
  const [filterBaseModalidad, setFilterBaseModalidad] = useState('TODAS')
  const [filterCargo, setFilterCargo] = useState('TODOS')
  const [filterSemaforo, setFilterSemaforo] = useState('TODOS')
  const [filterEstado, setFilterEstado] = useState('TODOS') // 'TODOS' | 'ACTIVO' | 'CESE'
  const [filterComision, setFilterComision] = useState('TODOS') // 'TODOS' | 'CON_BONO' | 'SIN_BONO'
  const [selectedPersona, setSelectedPersona] = useState(null)
  const [boletaPersona, setBoletaPersona] = useState(null)
  const [boletaTab, setBoletaTab] = useState('resumen') // 'resumen' | 'grupos' | 'postulantes'
  const [selectedGpeTrace, setSelectedGpeTrace] = useState(null)
  const [postulantesTrace, setPostulantesTrace] = useState([])
  const [loadingPostulantesTrace, setLoadingPostulantesTrace] = useState(false)
  const [filterPostulantesTrace, setFilterPostulantesTrace] = useState('TODOS') // 'TODOS' | 'MIOS' | 'DIA1' | 'IOP' | 'BAJA'
  const [expandedRecruiterKey, setExpandedRecruiterKey] = useState(null)
  const [isDispersionModalOpen, setIsDispersionModalOpen] = useState(false)
  const [useTope, setUseTope] = useState(false)
  const [modeloMaqueta, setModeloMaqueta] = useState('sheets_oficial') // 'sheets_oficial' | 'diferenciado'

  // Sobrescrituras manuales de auditoría persistidas por periodo: { [key]: { calidad: 100, procesosAdm: 100, motivo: '', fecha: '' } }
  const [manualAuditOverrides, setManualAuditOverrides] = useState({})
  const [editingAuditKey, setEditingAuditKey] = useState(null)
  const [tempCalidad, setTempCalidad] = useState(100)
  const [tempProcesos, setTempProcesos] = useState(100)
  const [tempMotivoAudit, setTempMotivoAudit] = useState('')

  // Estado de persistencia y liquidaciones cerradas en base de datos
  const [savingLiq, setSavingLiq] = useState(false)
  const [liqSavedSuccess, setLiqSavedSuccess] = useState(false)
  const [liquidacionesGuardadas, setLiquidacionesGuardadas] = useState([])
  const [loadingLiqGuardadas, setLoadingLiqGuardadas] = useState(false)

  // Estado de Base Operativa Oficial (maqueta_reclutadores_base)
  const [baseFromDb, setBaseFromDb] = useState([])
  const [loadingBaseDb, setLoadingBaseDb] = useState(false)
  const [syncingBase, setSyncingBase] = useState(false)
  const [syncBaseSuccess, setSyncBaseSuccess] = useState(false)

  // Cargar ajustes de auditoría persistidos en localStorage por periodo
  useEffect(() => {
    const pKey = `gea_maqueta_audit_${periodoSeleccionado || 'actual'}`
    try {
      const saved = localStorage.getItem(pKey)
      setManualAuditOverrides(saved ? JSON.parse(saved) : {})
    } catch {
      setManualAuditOverrides({})
    }
  }, [periodoSeleccionado])

  const guardarOverrideAuditoria = useCallback((personaKey, calidadVal, procesosVal, motivoVal = '') => {
    const pKey = `gea_maqueta_audit_${periodoSeleccionado || 'actual'}`
    setManualAuditOverrides((prev) => {
      const next = {
        ...prev,
        [personaKey]: {
          calidad: Math.min(100, Math.max(0, Number(calidadVal) || 0)),
          procesosAdm: Math.min(100, Math.max(0, Number(procesosVal) || 0)),
          motivo: String(motivoVal || '').trim(),
          fecha: new Date().toISOString(),
          por: userProfile?.nombre_completo || userProfile?.email || 'Auditor RyS'
        }
      }
      try {
        localStorage.setItem(pKey, JSON.stringify(next))
      } catch (e) {
        console.warn('[MaquetaAudit] No se pudo guardar en localStorage:', e)
      }
      return next
    })
    setEditingAuditKey(null)
  }, [periodoSeleccionado, userProfile])

  // Carga inicial de la Base Operativa y Liquidaciones guardadas en BD
  useEffect(() => {
    let isMounted = true
    setLoadingBaseDb(true)
    fetchMaquetaBaseOperativa(periodoSeleccionado)
      .then((data) => {
        if (isMounted) setBaseFromDb(Array.isArray(data) ? data : [])
      })
      .catch((err) => console.warn('[MaquetaBase] Error al cargar base:', err))
      .finally(() => {
        if (isMounted) setLoadingBaseDb(false)
      })

    setLoadingLiqGuardadas(true)
    fetchLiquidacionesPeriodo(periodoSeleccionado)
      .then((data) => {
        if (isMounted) setLiquidacionesGuardadas(Array.isArray(data) ? data : [])
      })
      .catch((err) => console.warn('[MaquetaLiq] Error al cargar liquidaciones:', err))
      .finally(() => {
        if (isMounted) setLoadingLiqGuardadas(false)
      })

    return () => { isMounted = false }
  }, [periodoSeleccionado])

  // ── 2. CARGA DE CATÁLOGO MAESTRO (Lista_de_reclutadores) ───────────────────
  useEffect(() => {
    let isMounted = true
    setLoadingEquipo(true)
    getEquipoReclutamiento()
      .then((data) => {
        if (isMounted) setEquipoList(Array.isArray(data) ? data : [])
      })
      .catch((err) => {
        console.warn('[MaquetaBonos] Error al cargar equipo_reclutamiento:', err)
      })
      .finally(() => {
        if (isMounted) setLoadingEquipo(false)
      })
    return () => { isMounted = false }
  }, [])

  // Filtrar kpiRows en vivo únicamente para el periodo seleccionado
  const kpiRowsPeriodo = useMemo(() => {
    const pNorm = String(periodoSeleccionado || '').replace(/\D/g, '').slice(0, 6)
    if (!pNorm) return kpiRows || []
    const filtered = (kpiRows || []).filter((r) => {
      const pEf = String(r.periodo_efectivo || '').replace(/\D/g, '').slice(0, 6)
      const pRec = String(r.periodo_reclutado || '').replace(/\D/g, '').slice(0, 6)
      return pEf === pNorm || (!pEf && pRec === pNorm)
    })
    return filtered.length > 0 ? filtered : (kpiRows || [])
  }, [kpiRows, periodoSeleccionado])

  // Adaptador de filas operativas: cruza maqueta_reclutadores_base con kpiRowsPeriodo para no perder topes, calidad ni alertas de desfase en vivo
  const { effectiveKpiRows, syncDiagnostics } = useMemo(() => {
    const norm = (s) => String(s || '').trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ')

    // Mapa de filas en vivo por (codigo_gpe | campana | responsable) y (codigo_gpe | responsable)
    const liveMapExact = new Map()
    const liveMapByGpeResp = new Map()
    for (const k of kpiRowsPeriodo) {
      const gpe = norm(k.grupo_g || k.codigo_gpe)
      const camp = norm(k.campana)
      const resp = norm(k.responsable)
      if (!gpe || !resp) continue
      liveMapExact.set(`${gpe}|${camp}|${resp}`, k)
      liveMapByGpeResp.set(`${gpe}|${resp}`, k)
    }

    if (baseFromDb && baseFromDb.length > 0) {
      const matchedLiveKeys = new Set()
      let totalConDesfase = 0

      const baseMapped = baseFromDb.map((b) => {
        const gpe = norm(b.codigo_gpe)
        const camp = norm(b.campana)
        const resp = norm(b.analista_reclutador)
        const exactKey = `${gpe}|${camp}|${resp}`
        const fallbackKey = `${gpe}|${resp}`
        const liveRow = liveMapExact.get(exactKey) || liveMapByGpeResp.get(fallbackKey) || null
        if (liveRow) {
          matchedLiveKeys.add(`${norm(liveRow.grupo_g || liveRow.codigo_gpe)}|${norm(liveRow.campana)}|${norm(liveRow.responsable)}`)
        }

        const d1Base = Number(b.asistencia_dia_1 || 0)
        const dotBase = Number(b.dotacion || 0)
        const d1Vivo = liveRow ? Number(liveRow.dia_1 || 0) : d1Base
        const dotVivo = liveRow ? Number(liveRow.dotacion_q || 0) : dotBase
        const tieneDesfase = Boolean(liveRow && (d1Vivo !== d1Base || dotVivo !== dotBase))
        if (tieneDesfase) totalConDesfase += 1

        return {
          responsable: b.analista_reclutador,
          meta_dia_1_individual: Number(b.meta_dia_1_individual || liveRow?.meta_dia_1_individual || 0),
          meta_dia_1_campana: Number(b.meta_dia_1_grupal || liveRow?.meta_dia_1_campana || 0),
          dia_1: d1Base,
          dia_1_tope: liveRow?.dia_1_tope !== undefined ? Number(liveRow.dia_1_tope) : Math.min(d1Base, Number(b.meta_dia_1_individual || d1Base)),
          dotacion_q: dotBase,
          dotacion_q_tope: liveRow?.dotacion_q_tope !== undefined ? Number(liveRow.dotacion_q_tope) : Math.min(dotBase, Number(b.rq_op || dotBase)),
          rq: Number(b.rq_op || liveRow?.rq_individual || liveRow?.rq || 0),
          nomina: Number(b.nomina || liveRow?.nomina || 0),
          aptos: Number(liveRow?.aptos || liveRow?.cantidad_aptos || 0),
          evaluados: Number(liveRow?.evaluados || liveRow?.cantidad_evaluados || 0),
          campana: b.campana,
          codigo_gpe: b.codigo_gpe,
          grupo_g: b.codigo_gpe,
          segmento: b.segmento,
          modalidad: b.modalidad,
          semana: b.semana,
          fecha_inicio: b.fecha_inicio_capa,
          fecha_ingreso_op: b.fecha_fin_capa,
          tipo_reclutador: b.tipo_reclutador,
          origen_fuente: 'BASE_BD',
          dia_1_vivo: d1Vivo,
          dotacion_vivo: dotVivo,
          tiene_desfase_vivo: tieneDesfase,
        }
      })

      // Identificar reclutadores presentes en la base oficial
      const reclutadoresEnBase = new Set(baseMapped.map(b => norm(b.responsable)))

      // Si kpiRowsPeriodo tiene filas de un reclutador o grupo nuevo que NO está en la base oficial, agregarlas como respaldo operativo
      const filasFaltantes = kpiRowsPeriodo.filter(k => {
        const nom = norm(k.responsable)
        if (!nom || nom === 'ADMIN' || nom === 'RECLUTADOR' || nom.includes('SIN NOMINA') || nom === 'RECUPERADO') return false
        const gpeKey = `${norm(k.grupo_g || k.codigo_gpe)}|${norm(k.campana)}|${nom}`
        if (matchedLiveKeys.has(gpeKey)) return false
        const exists = Array.from(reclutadoresEnBase).some(r => r === nom || r.includes(nom) || nom.includes(r))
        return !exists
      }).map(k => ({
        responsable: k.responsable,
        meta_dia_1_individual: Number(k.meta_dia_1_individual || 0),
        meta_dia_1_campana: Number(k.meta_dia_1_campana || 0),
        dia_1: Number(k.dia_1 || 0),
        dia_1_tope: Number(k.dia_1_tope ?? k.dia_1 ?? 0),
        dotacion_q: Number(k.dotacion_q || 0),
        dotacion_q_tope: Number(k.dotacion_q_tope ?? k.dotacion_q ?? 0),
        rq: Number(k.rq_individual || k.rq || 0),
        nomina: Number(k.nomina || 0),
        aptos: Number(k.aptos || k.cantidad_aptos || 0),
        evaluados: Number(k.evaluados || k.cantidad_evaluados || 0),
        campana: k.campana,
        codigo_gpe: k.grupo_g,
        grupo_g: k.grupo_g,
        segmento: k.segmento,
        modalidad: k.modalidad,
        semana: k.semana,
        fecha_inicio: k.fecha_inicio,
        fecha_ingreso_op: k.fecha_ingreso_op,
        tipo_reclutador: k.cargo || 'Asistente de Reclutamiento y Selección',
        origen_fuente: 'RESPALDO_VIVO',
        dia_1_vivo: Number(k.dia_1 || 0),
        dotacion_vivo: Number(k.dotacion_q || 0),
        tiene_desfase_vivo: false,
      }))

      return {
        effectiveKpiRows: [...baseMapped, ...filasFaltantes],
        syncDiagnostics: {
          usandoBaseDb: true,
          totalBaseDb: baseMapped.length,
          totalFaltantesEnBase: filasFaltantes.length,
          totalConDesfase,
          isSynced: totalConDesfase === 0 && filasFaltantes.length === 0
        }
      }
    }

    return {
      effectiveKpiRows: kpiRowsPeriodo.map(k => ({
        ...k,
        origen_fuente: 'CONSOLIDADO_VIVO',
        dia_1_vivo: Number(k.dia_1 || 0),
        dotacion_vivo: Number(k.dotacion_q || 0),
        tiene_desfase_vivo: false,
      })),
      syncDiagnostics: {
        usandoBaseDb: false,
        totalBaseDb: 0,
        totalFaltantesEnBase: kpiRowsPeriodo.length,
        totalConDesfase: 0,
        isSynced: false
      }
    }
  }, [baseFromDb, kpiRowsPeriodo])

  // ── 3. EJECUCIÓN DEL MOTOR DE CÁLCULO DE MAQUETA ────────────────────────────
  const { filas, resumen, mediaEquipo } = useMemo(() => {
    return calcularMaquetaBonosReclutadores(effectiveKpiRows, equipoList, manualAuditOverrides, {
      useTope,
      modelo: modeloMaqueta
    })
  }, [effectiveKpiRows, equipoList, manualAuditOverrides, useTope, modeloMaqueta])

  // Identificar usuario actual si es reclutador bloqueado
  const selfKey = useMemo(() => {
    if (!isLockedRecruiter || !userProfile) return null
    const candidates = [
      userProfile.nombre_completo,
      userProfile.nombre,
      userProfile.nombres_completos,
      userProfile.documento,
      userProfile.dni,
      userProfile.alias,
      userProfile.alix
    ].filter(Boolean).map(s => String(s).trim().toUpperCase())

    for (const f of filas) {
      const fNom = String(f.nombre || '').trim().toUpperCase()
      const fDoc = String(f.documento || '').trim().toUpperCase()
      const fAlias = String(f.alias || '').trim().toUpperCase()
      if (candidates.some(c => c === fNom || c === fDoc || c === fAlias || fNom.includes(c) || c.includes(fNom))) {
        return f.key
      }
    }
    return filas[0]?.key || null
  }, [isLockedRecruiter, userProfile, filas])

  // Auto-selección inicial
  useEffect(() => {
    if (isLockedRecruiter && selfKey) {
      const hit = filas.find(f => f.key === selfKey)
      if (hit) setSelectedPersona(hit)
    } else if (!selectedPersona && filas.length > 0) {
      setSelectedPersona(filas[0])
    } else if (selectedPersona) {
      const updated = filas.find(f => f.key === selectedPersona.key)
      if (updated) setSelectedPersona(updated)
    }
  }, [isLockedRecruiter, selfKey, filas])

  // ── 4. PARTICIONAMIENTO Y FILTRADO ──────────────────────────────────────────
  const countsEstado = useMemo(() => {
    let activos = 0
    let cesados = 0
    let conBono = 0
    for (const f of filas) {
      if (f.estado === 'CESE' || f.fechaCese) cesados++
      else activos++
      if (f.bonoNeto > 0) conBono++
    }
    return { activos, cesados, conBono, total: filas.length }
  }, [filas])

  const filasFiltradas = useMemo(() => {
    return filas.filter((f) => {
      if (isLockedRecruiter && selfKey && f.key !== selfKey) return false
      if (filterCargo !== 'TODOS' && f.cargoClave !== filterCargo) return false
      if (filterSemaforo !== 'TODOS' && f.semaforoGlobal !== filterSemaforo) return false
      
      // Filtro de Estado Activo / Cesado
      if (filterEstado !== 'TODOS') {
        const isCese = f.estado === 'CESE' || Boolean(f.fechaCese)
        if (filterEstado === 'ACTIVO' && isCese) return false
        if (filterEstado === 'CESE' && !isCese) return false
      }

      // Filtro de Comisión
      if (filterComision !== 'TODOS') {
        if (filterComision === 'CON_BONO' && f.bonoNeto <= 0) return false
        if (filterComision === 'SIN_BONO' && f.bonoNeto > 0) return false
      }

      if (searchTerm.trim()) {
        const q = searchTerm.trim().toUpperCase()
        const match =
          f.nombre.toUpperCase().includes(q) ||
          f.documento.includes(q) ||
          f.cargo.toUpperCase().includes(q) ||
          f.campanas.toUpperCase().includes(q)
        if (!match) return false
      }
      return true
    })
  }, [filas, isLockedRecruiter, selfKey, filterCargo, filterSemaforo, filterEstado, filterComision, searchTerm])

  const totalesTabla = useMemo(() => {
    if (!filasFiltradas.length) {
      return {
        mediaDia1: 0,
        mediaDotacion: 0,
        mediaPuntos: 0,
        sumBruto: 0,
        sumNeto: 0,
        sumEfectivo: 0,
        sumSodexo: 0
      }
    }
    const sumD1 = filasFiltradas.reduce((acc, f) => acc + (Number(f.pctDia1Operativo) || 0), 0)
    const sumDot = filasFiltradas.reduce((acc, f) => acc + (Number(f.pctDotacionOperativo) || 0), 0)
    const sumPuntos = filasFiltradas.reduce((acc, f) => acc + (Number(f.totalPuntosPct) || 0), 0)
    const sumBruto = filasFiltradas.reduce((acc, f) => acc + (Number(f.bonoBruto) || 0), 0)
    const sumNeto = filasFiltradas.reduce((acc, f) => acc + (Number(f.bonoNeto) || 0), 0)
    const sumEfectivo = filasFiltradas.reduce((acc, f) => acc + (Number(f.bonoEfectivo) || 0), 0)
    const sumSodexo = filasFiltradas.reduce((acc, f) => acc + (Number(f.bonoSodexo) || 0), 0)

    return {
      mediaDia1: round2(sumD1 / filasFiltradas.length),
      mediaDotacion: round2(sumDot / filasFiltradas.length),
      mediaPuntos: round2(sumPuntos / filasFiltradas.length),
      sumBruto,
      sumNeto,
      sumEfectivo,
      sumSodexo
    }
  }, [filasFiltradas])

  // ── 5. MODELADO DE LA TABLA "BASE OPERATIVA" (16 ENCABEZADOS) ──────────────
  const baseOperativaRows = useMemo(() => {
    if (baseFromDb && baseFromDb.length > 0) {
      return baseFromDb.map((b, idx) => {
        const resp = String(b.analista_reclutador || '').trim().toUpperCase()
        const matchedRec = (equipoList || []).find((eq) => {
          const eqNom = String(eq.nombres_completos || eq.nombre_completo || eq.nombre || '').trim().toUpperCase()
          const eqDoc = String(eq.documento || '').trim()
          const eqAlias = String(eq.alias || '').trim().toUpperCase()
          return (eqNom && (eqNom === resp || eqNom.includes(resp) || resp.includes(eqNom))) || (eqAlias && eqAlias === resp) || (eqDoc && eqDoc === resp)
        })
        const isCesado = (matchedRec?.estado || '').trim().toUpperCase() === 'CESE'
        const fechaCese = matchedRec?.fecha_cese || null

        return {
          id: b.id || `${b.codigo_gpe}-${idx}`,
          periodoEfectivo: b.periodo_efectivo || '-',
          codigoGpe: b.codigo_gpe || '-',
          fechaInicioCapa: b.fecha_inicio_capa || '-',
          fechaFinCapa: b.fecha_fin_capa || '-',
          segmento: b.segmento || '-',
          campana: b.campana || '-',
          modalidad: b.modalidad || 'PRESENCIAL',
          tipoReclutador: b.tipo_reclutador || matchedRec?.cargo || 'Interno',
          analistaReclutador: b.analista_reclutador || '-',
          metaDia1Grupal: Number(b.meta_dia_1_grupal || 0),
          nomina: Number(b.nomina || 0),
          metaDia1Individual: Number(b.meta_dia_1_individual || 0),
          metaDia1NuevoCriterio: Number(b.meta_dia_1_nuevo_criterio || 0),
          asistenciaDia1: Number(b.asistencia_dia_1 || 0),
          dotacion: Number(b.dotacion || 0),
          rqOp: Number(b.rq_op || 0),
          isDb: true,
          isCesado,
          fechaCese
        }
      })
    }

    return (kpiRows || []).map((r, idx) => {
      const resp = String(r.responsable || '').trim()
      const respNorm = resp.toUpperCase()
      const matchedRec = (equipoList || []).find((eq) => {
        const eqNom = String(eq.nombres_completos || eq.nombre_completo || eq.nombre || '').trim().toUpperCase()
        return eqNom && (eqNom === respNorm || eqNom.includes(respNorm) || respNorm.includes(eqNom))
      })
      const tipoRec = matchedRec?.tipo || matchedRec?.cargo || (r.tipo_reclutador || 'Interno')

      const metaD1Grupal = Number(r.meta_dia_1_campana ?? r.rq ?? 0)
      const nomina = Number(r.nomina || 0)
      const metaD1Ind = Number(r.meta_dia_1_individual ?? r.rq_individual ?? 0)
      const metaD1Nuevo = Number(r.meta_dia_1_nuevo_criterio ?? (r.meta_dia_1_individual || r.rq_individual || 0))
      const asistenciaD1 = Number(r.dia_1 || 0)
      const dotacion = Number(r.dotacion_q ?? r.dotacion_ftes ?? 0)
      const rqOp = Number(r.rq_individual ?? r.rq ?? 0)

      return {
        id: r.id || `${r.grupo_g || 'GRP'}-${idx}`,
        periodoEfectivo: r.periodo_efectivo || r.periodo_reclutado || '-',
        codigoGpe: r.grupo_g || r.codigo_gpe || r.grupo || '-',
        fechaInicioCapa: r.fecha_inicio || r.fecha_inicio_capacitacion || '-',
        fechaFinCapa: r.fecha_ingreso_op || r.fecha_fin_capa || '-',
        segmento: r.segmento || '-',
        campana: r.campana || '-',
        modalidad: r.modalidad || (String(r.segmento || '').toUpperCase().includes('REMOTO') ? 'REMOTO' : 'PRESENCIAL'),
        tipoReclutador: tipoRec,
        analistaReclutador: resp || '-',
        metaDia1Grupal: metaD1Grupal,
        nomina: nomina,
        metaDia1Individual: metaD1Ind,
        metaDia1NuevoCriterio: metaD1Nuevo,
        asistenciaDia1: asistenciaD1,
        dotacion: dotacion,
        rqOp: rqOp,
      }
    })
  }, [baseFromDb, kpiRows, equipoList])

  const campanasBaseDisponibles = useMemo(() => {
    const set = new Set(baseOperativaRows.map((r) => r.campana).filter((c) => c && c !== '-'))
    return Array.from(set).sort()
  }, [baseOperativaRows])

  const baseOperativaFiltrada = useMemo(() => {
    return baseOperativaRows.filter((r) => {
      if (filterBaseCampana !== 'TODAS' && r.campana !== filterBaseCampana) return false
      if (filterBaseModalidad !== 'TODAS' && r.modalidad !== filterBaseModalidad) return false
      if (searchBaseTerm.trim()) {
        const q = searchBaseTerm.trim().toUpperCase()
        const match =
          r.codigoGpe.toUpperCase().includes(q) ||
          r.analistaReclutador.toUpperCase().includes(q) ||
          r.campana.toUpperCase().includes(q) ||
          r.segmento.toUpperCase().includes(q)
        if (!match) return false
      }
      return true
    })
  }, [baseOperativaRows, filterBaseCampana, filterBaseModalidad, searchBaseTerm])

  const baseTotales = useMemo(() => {
    return baseOperativaFiltrada.reduce(
      (acc, r) => {
        acc.metaDia1Grupal += r.metaDia1Grupal
        acc.nomina += r.nomina
        acc.metaDia1Individual += r.metaDia1Individual
        acc.metaDia1NuevoCriterio += r.metaDia1NuevoCriterio
        acc.asistenciaDia1 += r.asistenciaDia1
        acc.dotacion += r.dotacion
        acc.rqOp += r.rqOp
        return acc
      },
      {
        metaDia1Grupal: 0,
        nomina: 0,
        metaDia1Individual: 0,
        metaDia1NuevoCriterio: 0,
        asistenciaDia1: 0,
        dotacion: 0,
        rqOp: 0,
      }
    )
  }, [baseOperativaFiltrada])

  // ── 6. EXPORTACIONES A CSV / EXCEL ──────────────────────────────────────────
  const handleExportCsv = useCallback(() => {
    const headers = [
      'Cargo', 'Personal RYS', '% Cump. Día 1', '% Dotación', '% Calidad', 'Procesos Adm.',
      'Puntos Día 1', 'Puntos Dotación', 'Puntos Calidad', 'Puntos Procesos Adm.',
      'TOTAL PUNTOS (%)', 'Bono Bruto (S/)', 'Bono Neto (S/)', 'Bono Neto Efectivo (S/)', 'Bono Neto Sodexo (S/)', 'Estado'
    ]
    const lines = [headers.join(';')]
    filasFiltradas.forEach((f) => {
      lines.push([
        `"${f.cargo}"`, `"${f.nombre}"`,
        `${f.pctDia1Operativo}%`, `${f.pctDotacionOperativo}%`, `${f.alcanceCalidad}%`, `${f.alcanceProcesosAdm}%`,
        `${f.puntosDia1}%`, `${f.puntosDotacion}%`, `${f.puntosCalidad}%`, `${f.puntosProcesosAdm}%`,
        `${f.totalPuntosPct}%`, f.bonoBruto, f.bonoNeto, f.bonoEfectivo, f.bonoSodexo, f.estado
      ].join(';'))
    })
    const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `liquidacion_bonos_reclutadores_${periodoSeleccionado || 'actual'}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }, [filasFiltradas, periodoSeleccionado])

  const handleGuardarEnBd = useCallback(async () => {
    try {
      setSavingLiq(true)
      const res = await guardarLiquidacionPeriodo(periodoSeleccionado || 'actual', filasFiltradas, userProfile)
      if (res.success) {
        setLiqSavedSuccess(true)
        setTimeout(() => setLiqSavedSuccess(false), 4500)
        const updatedLiq = await fetchLiquidacionesPeriodo(periodoSeleccionado || 'actual')
        setLiquidacionesGuardadas(Array.isArray(updatedLiq) ? updatedLiq : [])
      }
    } catch (err) {
      alert('Error al guardar liquidación: ' + (err?.message || err))
    } finally {
      setSavingLiq(false)
    }
  }, [periodoSeleccionado, filasFiltradas, userProfile])

  const handleCargarPostulantesGrupo = useCallback(async (grupo, persona) => {
    if (!grupo?.codigoGpe) return
    setSelectedGpeTrace(grupo)
    setBoletaTab('postulantes')
    setLoadingPostulantesTrace(true)
    setFilterPostulantesTrace('TODOS')
    try {
      const nombresRec = [
        persona?.nombre,
        persona?.alias,
        ...(persona?.nombresNominaCruzados || []),
        grupo.responsableOriginal
      ].filter(Boolean)
      const data = await fetchTrazabilidadPostulantesGrupoMaqueta({
        codigoGpe: grupo.codigoGpe,
        campana: grupo.campana,
        nombresReclutador: nombresRec
      })
      setPostulantesTrace(Array.isArray(data) ? data : [])
    } catch (err) {
      console.warn('[MaquetaTrazabilidad] Error cargando postulantes:', err)
      setPostulantesTrace([])
    } finally {
      setLoadingPostulantesTrace(false)
    }
  }, [])

  const handleOpenBoletaTrazabilidad = useCallback((persona, initialTab = 'resumen', initialGrupo = null) => {
    if (!persona) return
    setBoletaPersona(persona)
    setBoletaTab(initialTab)
    const targetGrp = initialGrupo || persona.gruposDetalle?.[0] || null
    setSelectedGpeTrace(targetGrp)
    if (initialTab === 'postulantes' && targetGrp) {
      handleCargarPostulantesGrupo(targetGrp, persona)
    } else {
      setPostulantesTrace([])
    }
  }, [handleCargarPostulantesGrupo])

  // Mantener boletaPersona sincronizada si cambian los cálculos o auditoría manual
  useEffect(() => {
    if (boletaPersona) {
      const updated = filas.find(f => f.key === boletaPersona.key)
      if (updated) setBoletaPersona(updated)
    }
  }, [filas])

  const handleExportBaseCsv = useCallback(() => {
    const headers = [
      'PERIODO EFECTIVO', 'CÓDIGO GPE', 'FECHA INICIO CAPA', 'FECHA FIN CAPA',
      'SEGMENTO', 'CAMPAÑA', 'MODALIDAD', 'TIPO DE RECLUTADOR', 'ANALISTA / RECLUTADOR',
      'META DIA 1 GRUPAL', 'NOMINA', 'META DIA 1 INDIVIDUAL', 'META DIA 1 NUEVO CRITERIO',
      'ASISTENCIA DÍA 1', 'DOTACIÓN', 'RQ OP.'
    ]
    const lines = [headers.join(';')]
    baseOperativaFiltrada.forEach((r) => {
      lines.push([
        `"${r.periodoEfectivo}"`, `"${r.codigoGpe}"`, `"${r.fechaInicioCapa}"`, `"${r.fechaFinCapa}"`,
        `"${r.segmento}"`, `"${r.campana}"`, `"${r.modalidad}"`, `"${r.tipoReclutador}"`, `"${r.analistaReclutador}"`,
        r.metaDia1Grupal, r.nomina, r.metaDia1Individual, r.metaDia1NuevoCriterio, r.asistenciaDia1, r.dotacion, r.rqOp
      ].join(';'))
    })
    const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `base_operativa_reclutadores_${periodoSeleccionado || 'actual'}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }, [baseOperativaFiltrada, periodoSeleccionado])

  const handleExportDispersionEfectivo = useCallback(() => {
    const headers = ['Documento', 'Personal RyS', 'Cargo', 'Importe a Transferir (S/)', 'Modalidad Pago', 'Estado']
    const lines = [headers.join(';')]
    filasFiltradas.forEach(f => {
      lines.push([`"${f.documento}"`, `"${f.nombre}"`, `"${f.cargo}"`, f.bonoEfectivo, 'CUENTA DE AHORROS / EFECTIVO', f.estado].join(';'))
    })
    const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `dispersion_efectivo_banco_${periodoSeleccionado || 'actual'}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }, [filasFiltradas, periodoSeleccionado])

  const handleExportDispersionSodexo = useCallback(() => {
    const headers = ['Documento', 'Personal RyS', 'Cargo', 'Importe Sodexo (S/)', 'Beneficio', 'Estado']
    const lines = [headers.join(';')]
    filasFiltradas.forEach(f => {
      lines.push([`"${f.documento}"`, `"${f.nombre}"`, `"${f.cargo}"`, f.bonoSodexo, 'TARJETA DE ALIMENTOS SODEXO', f.estado].join(';'))
    })
    const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `dispersion_sodexo_alimentos_${periodoSeleccionado || 'actual'}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }, [filasFiltradas, periodoSeleccionado])

  const fileInputRef = useRef(null)

  const handleSincronizarBase = async () => {
    try {
      setSyncingBase(true)
      const res = await sincronizarMaquetaBaseDesdeConsolidado(periodoSeleccionado)
      if (res.success) {
        setSyncBaseSuccess(true)
        setTimeout(() => setSyncBaseSuccess(false), 3000)
        const updated = await fetchMaquetaBaseOperativa(periodoSeleccionado)
        setBaseFromDb(updated)
      } else {
        alert(res.message || 'No se encontraron registros de nóminas para este periodo.')
      }
    } catch (err) {
      console.error('Error al sincronizar base:', err)
      alert('Error: ' + err.message)
    } finally {
      setSyncingBase(false)
    }
  }

  const handleImportBaseCsv = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async (evt) => {
      try {
        const text = evt.target?.result
        if (!text) return
        const lines = text.split(/\r?\n/).filter(Boolean)
        if (lines.length < 2) return
        const rows = []
        for (let i = 1; i < lines.length; i++) {
          const sep = lines[i].includes(';') ? ';' : ','
          const cols = lines[i].split(sep).map(c => c.trim().replace(/^"|"$/g, ''))
          if (cols.length < 3) continue
          rows.push({
            periodo_efectivo: cols[0] || periodoSeleccionado,
            codigo_gpe: cols[1] || 'GPE-S/C',
            fecha_inicio_capa: cols[2] && cols[2] !== '-' ? cols[2] : null,
            fecha_fin_capa: cols[3] && cols[3] !== '-' ? cols[3] : null,
            segmento: cols[4] || '',
            campana: cols[5] || '',
            modalidad: cols[6] || 'PRESENCIAL',
            tipo_reclutador: cols[7] || 'Interno',
            analista_reclutador: cols[8] || '',
            meta_dia_1_grupal: Number(cols[9]) || 0,
            nomina: Number(cols[10]) || 0,
            meta_dia_1_individual: Number(cols[11]) || 0,
            meta_dia_1_nuevo_criterio: Number(cols[12]) || 0,
            asistencia_dia_1: Number(cols[13]) || 0,
            dotacion: Number(cols[14]) || 0,
            rq_op: Number(cols[15]) || 0,
          })
        }
        if (rows.length) {
          await guardarMaquetaBaseOperativa(rows)
          const updated = await fetchMaquetaBaseOperativa(periodoSeleccionado)
          setBaseFromDb(updated)
          alert(`¡Se guardaron ${rows.length} registros en maqueta_reclutadores_base!`)
        }
      } catch (err) {
        console.error('Error al importar base CSV:', err)
        alert('Error al importar CSV: ' + err.message)
      }
    }
    reader.readAsText(file)
  }

  // ── ESTILOS DINÁMICOS DE CELDAS SEGÚN TRAMO DEL SHEETS ─────────────────────
  const getBadgeCell = (alcancePct, semaforo) => {
    const val = Number(alcancePct) || 0
    if (val >= 100 || semaforo === 'VERDE') {
      return 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold'
    }
    if (val >= 70 || semaforo === 'AMBAR') {
      return 'bg-amber-400/25 text-amber-300 border border-amber-400/40 font-bold'
    }
    return 'bg-rose-500/20 text-rose-300 border border-rose-500/40 font-medium'
  }

  return (
    <div className="space-y-4 select-none">
      {/* ── BARRA SUPERIOR: ACCIONES Y FILTROS ─────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-[var(--bg-surface)] p-3 rounded-2xl border border-[var(--border-subtle)] shadow-xs">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
            <Banknote size={16} className="text-emerald-400" />
            <span className="text-xs font-bold text-[var(--text-primary)]">Maqueta & Liquidación RyS</span>
          </div>

          {/* Selector de Período */}
          {periodosDisponibles.length > 0 && onSelectPeriodo && (
            <select
              value={periodoSeleccionado}
              onChange={(e) => onSelectPeriodo(e.target.value)}
              className="text-xs px-2.5 py-1.5 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-primary)] outline-none cursor-pointer focus:border-[var(--accent)] font-mono"
            >
              {periodosDisponibles.map((p) => (
                <option key={p} value={p}>Corte: {p}</option>
              ))}
            </select>
          )}

          {/* Switch de Topes */}
          <button
            type="button"
            onClick={() => setUseTope(!useTope)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
              useTope
                ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                : 'bg-[var(--bg-elevated)] border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
            title="Activa o desactiva los topes individuales por grupo en Día 1 y Dotación"
          >
            <span>Con Topes</span>
            <span className={`w-2 h-2 rounded-full ${useTope ? 'bg-amber-400' : 'bg-slate-500'}`} />
          </button>

          {/* Selector de Modelo de Maqueta */}
          <select
            value={modeloMaqueta}
            onChange={(e) => setModeloMaqueta(e.target.value)}
            className="text-xs px-2.5 py-1.5 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-primary)] outline-none cursor-pointer focus:border-[var(--accent)] font-semibold"
            title="Elige entre la Maqueta General 50/40/10 (Sheets Oficial) o Pesos Diferenciados por Cargo"
          >
            <option value="sheets_oficial">Modelo: Oficial (50/40/10)</option>
            <option value="diferenciado">Modelo: Diferenciado por Cargo</option>
          </select>

          {/* Indicador en vivo de Sincronización Base vs Nóminas */}
          {syncDiagnostics.usandoBaseDb ? (
            syncDiagnostics.isSynced ? (
              <div className="flex items-center gap-1.5">
                <span
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[11px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                  title="La tabla maqueta_reclutadores_base coincide con las asistencias registradas"
                >
                  <CheckCircle2 size={12} />
                  <span>Base al Día ({syncDiagnostics.totalBaseDb} GPE)</span>
                </span>
                <button
                  type="button"
                  onClick={handleSincronizarBase}
                  disabled={syncingBase}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-semibold bg-[var(--bg-elevated)] hover:bg-[var(--surface-hover)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all cursor-pointer shadow-xs disabled:opacity-50"
                  title="Re-consultar asistencias de hoy en consolidado_asistencias para actualizar ingresos I-OP"
                >
                  <RefreshCw size={11} className={syncingBase ? 'animate-spin text-cyan-400' : 'text-cyan-400'} />
                  <span>{syncingBase ? 'Actualizando...' : 'Actualizar'}</span>
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleSincronizarBase}
                disabled={syncingBase}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[11px] font-bold bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/40 cursor-pointer transition-all animate-pulse"
                title="Existen ingresos nuevos en consolidado_asistencias que difieren de la base guardada. Haz clic para actualizar."
              >
                <AlertTriangle size={12} className="text-amber-400" />
                <span>
                  {syncingBase
                    ? 'Sincronizando...'
                    : `${syncDiagnostics.totalConDesfase} GPE con ingresos nuevos · Clic para actualizar`}
                </span>
              </button>
            )
          ) : (
            <div className="flex items-center gap-1.5">
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[11px] font-semibold bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
                <span>Fuente: Consolidado en Vivo ({effectiveKpiRows.length} GPE)</span>
              </span>
              <button
                type="button"
                onClick={handleSincronizarBase}
                disabled={syncingBase}
                className="flex items-center gap-1 px-2 py-1 rounded-xl text-[11px] font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-all cursor-pointer"
              >
                <RefreshCw size={11} className={syncingBase ? 'animate-spin' : ''} />
                <span>Sincronizar</span>
              </button>
            </div>
          )}
        </div>

        {/* Botones de Acción de Finanzas / Exportación */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExportCsv}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-[var(--bg-elevated)] hover:bg-[var(--surface-hover)] border border-[var(--border-subtle)] text-[var(--text-primary)] transition-all cursor-pointer shadow-xs"
            title="Exportar archivo consolidado a Excel / CSV"
          >
            <Download size={13} className="text-cyan-400" />
            <span>Exportar Excel</span>
          </button>

          <button
            type="button"
            onClick={() => setIsDispersionModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white transition-all cursor-pointer shadow-xs"
            title="Generar listas de pago para Banco y Sodexo"
          >
            <CreditCard size={13} />
            <span>Dispersión de Pagos</span>
          </button>
        </div>
      </div>

      {/* ── TARJETAS KPIS SUPERIORES (RESUMEN FINANCIERO) ─────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
        {/* 1. Total Bono Neto */}
        <div className="p-3.5 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] flex flex-col justify-between relative overflow-hidden shadow-xs border-l-4 border-l-emerald-500">
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)] block">
              Total Bono Neto
            </span>
            <div className="text-xl sm:text-2xl font-black font-mono text-emerald-400 mt-0.5">
              {fmtMoney(resumen.totalBonoNetoAPagar)}
            </div>
          </div>
          <div className="text-[10px] text-[var(--text-secondary)] font-semibold mt-1">
            Presupuesto: {fmtMoney(resumen.totalBonoBrutoPresupuestado)}
          </div>
        </div>

        {/* 2. Pago en Efectivo */}
        <div className="p-3.5 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] flex flex-col justify-between shadow-xs border-l-4 border-l-cyan-500">
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)] block">
              Pago Efectivo (60% / 75%)
            </span>
            <div className="text-xl font-black font-mono text-cyan-400 mt-0.5">
              {fmtMoney(resumen.totalPagoEfectivo)}
            </div>
          </div>
          <span className="text-[10px] text-[var(--text-muted)]">Abono cuenta bancaria</span>
        </div>

        {/* 3. Pago en Sodexo */}
        <div className="p-3.5 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] flex flex-col justify-between shadow-xs border-l-4 border-l-amber-500">
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)] block">
              Pago Sodexo (40% / 25%)
            </span>
            <div className="text-xl font-black font-mono text-amber-400 mt-0.5">
              {fmtMoney(resumen.totalPagoSodexo)}
            </div>
          </div>
          <span className="text-[10px] text-[var(--text-muted)]">Tarjeta de alimentos</span>
        </div>

        {/* 4. Promedio Equipo (Alimenta a Liderazgo) */}
        <div className="p-3.5 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] flex flex-col justify-between shadow-xs border-l-4 border-l-purple-500">
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)] block flex items-center justify-between">
              <span>Promedio Equipo</span>
              <span className="text-[9px] font-bold text-purple-400">Media</span>
            </span>
            <div className="text-xl font-black font-mono text-purple-300 mt-0.5">
              {fmtPct(mediaEquipo.pctDia1)} D1 · {fmtPct(mediaEquipo.pctDotacion)} Dot
            </div>
          </div>
          <div className="text-[10px] text-[var(--text-muted)]">
            D1: {mediaEquipo.dia1Total}/{mediaEquipo.dia1MetaTotal} · Dot: {mediaEquipo.dotacionTotal}/{mediaEquipo.rqTotal}
          </div>
        </div>

        {/* 5. Total Evaluados */}
        <div className="p-3.5 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] flex flex-col justify-between shadow-xs border-l-4 border-l-slate-500">
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)] block">
              Total Evaluados
            </span>
            <div className="text-xl font-black font-mono text-slate-200 mt-0.5">
              {filasFiltradas.length} personas
            </div>
          </div>
          <div className="text-[10px] text-emerald-400 font-bold">
            {resumen.totalEnMeta} alcanzaron meta (≥85%)
          </div>
        </div>
      </div>

      {/* ── SELECTOR DE PESTAÑAS PRINCIPALES ──────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-1 bg-[var(--bg-elevated)] p-1 rounded-2xl border border-[var(--border-subtle)] w-fit">
        <button
          type="button"
          onClick={() => setActiveTab('bonos_oficial')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'bonos_oficial'
              ? 'bg-[var(--accent)] text-white shadow-xs'
              : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
          }`}
        >
          <FileSpreadsheet size={13} />
          <span>Bonos Reclutadores (Maqueta Oficial)</span>
          <span className="text-[10px] opacity-80 font-mono">({filasFiltradas.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('base_operativa')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'base_operativa'
              ? 'bg-[var(--accent)] text-white shadow-xs'
              : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
          }`}
        >
          <Layers size={13} />
          <span>Base Operativa (16 Columnas)</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('simulador')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'simulador'
              ? 'bg-[var(--accent)] text-white shadow-xs'
              : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
          }`}
        >
          <Calculator size={13} />
          <span>Ficha y Simulación 360°</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('trazabilidad_auditoria')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'trazabilidad_auditoria'
              ? 'bg-[var(--accent)] text-white shadow-xs'
              : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
          }`}
        >
          <Shield size={13} />
          <span>Trazabilidad y Cierres BD</span>
          {liquidacionesGuardadas.length > 0 && (
            <span className="px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-300 text-[9px] font-mono">
              {liquidacionesGuardadas.length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('maqueta_reglas')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'maqueta_reglas'
              ? 'bg-[var(--accent)] text-white shadow-xs'
              : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
          }`}
        >
          <Sliders size={13} />
          <span>Escalas y Tramos</span>
        </button>
      </div>

      {/* ── TABLA PRINCIPAL: MAQUETA Y BONOS RECLUTADORES (DISEÑO IDÉNTICO AL SHEETS) ──────────────── */}
      {activeTab === 'bonos_oficial' && (
        <Card className="border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-sm overflow-hidden">
          <CardHeader className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]">
            <div className="flex items-center gap-2">
              <CardTitle className="text-xs font-black uppercase tracking-wider text-[var(--text-primary)] flex items-center gap-2">
                <FileSpreadsheet size={15} className="text-amber-500" />
                <span>Bonos_Reclutadores · Maqueta General de Pago</span>
              </CardTitle>
              <span className="text-[10px] text-[var(--text-muted)]">
                Haz clic en ▸ para desglosar grupos GPE o en el nombre para abrir la Boleta & Trazabilidad 360°
              </span>
            </div>

            {/* Controles: Filtros de Estado, Comisión, Cargo y Buscador */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Pills de Estado (Activos / Cesados) */}
              <div className="flex items-center gap-1 bg-slate-900/90 p-1 rounded-xl border border-slate-800 text-[11px]">
                <button
                  type="button"
                  onClick={() => setFilterEstado('TODOS')}
                  className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                    filterEstado === 'TODOS'
                      ? 'bg-cyan-600 text-white shadow-xs'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Todos ({countsEstado.total})
                </button>
                <button
                  type="button"
                  onClick={() => setFilterEstado('ACTIVO')}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                    filterEstado === 'ACTIVO'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-emerald-400 hover:text-emerald-300'
                  }`}
                >
                  <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Activos ({countsEstado.activos})
                </button>
                <button
                  type="button"
                  onClick={() => setFilterEstado('CESE')}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                    filterEstado === 'CESE'
                      ? 'bg-rose-600 text-white shadow-xs'
                      : 'text-rose-400 hover:text-rose-300'
                  }`}
                >
                  <span className="size-1.5 rounded-full bg-rose-400" />
                  Cesados ({countsEstado.cesados})
                </button>
              </div>

              {/* Pill de Comisión (Con Bono / Sin Bono) */}
              <button
                type="button"
                onClick={() => setFilterComision(filterComision === 'CON_BONO' ? 'TODOS' : 'CON_BONO')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[11px] font-bold border transition-all cursor-pointer ${
                  filterComision === 'CON_BONO'
                    ? 'bg-amber-500/20 border-amber-500/60 text-amber-300 shadow-xs'
                    : 'bg-slate-900/80 border-slate-800 text-slate-400 hover:text-amber-300'
                }`}
                title="Mostrar solo colaboradores que superan la valla y cobran bono"
              >
                <Award size={12} className={filterComision === 'CON_BONO' ? 'text-amber-400' : 'text-slate-500'} />
                <span>Solo con Bono ({countsEstado.conBono})</span>
              </button>
              <select
                value={filterCargo}
                onChange={(e) => setFilterCargo(e.target.value)}
                className="text-xs px-2.5 py-1 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-primary)] outline-none focus:border-[var(--accent)] cursor-pointer"
              >
                <option value="TODOS">Todos los Cargos</option>
                <option value="ASISTENTE">Asistentes</option>
                <option value="ANALISTA">Analistas</option>
                <option value="ANALISTA_ADMINISTRATIVO">Analista Administrativo</option>
                <option value="SUPERVISOR">Supervisores</option>
                <option value="COORDINADOR">Coordinadores</option>
              </select>

              <div className="relative">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                <input
                  type="text"
                  placeholder="Filtrar por colaborador o cargo..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8 pr-3 py-1 text-xs rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder-[var(--text-muted)] outline-none focus:border-[var(--accent)] w-56"
                />
              </div>

              <button
                type="button"
                onClick={handleExportCsv}
                className="flex items-center gap-1.5 px-3 py-1 text-xs rounded-lg bg-[var(--bg-elevated)] hover:bg-[var(--surface-hover)] border border-[var(--border-subtle)] text-[var(--text-primary)] font-semibold transition-all cursor-pointer shadow-xs"
                title="Exportar archivo CSV con todas las columnas"
              >
                <Download size={13} className="text-emerald-500" />
                <span>Exportar</span>
              </button>

              <button
                type="button"
                onClick={handleGuardarEnBd}
                disabled={savingLiq}
                className={`flex items-center gap-1.5 px-3 py-1 text-xs rounded-lg font-bold transition-all cursor-pointer shadow-xs border ${
                  liqSavedSuccess
                    ? 'bg-emerald-600 border-emerald-500 text-white'
                    : 'bg-indigo-600 hover:bg-indigo-500 border-indigo-500 text-white disabled:opacity-50'
                }`}
                title="Congela y guarda la liquidación de este periodo en la base de datos para auditoría"
              >
                {liqSavedSuccess ? (
                  <>
                    <CheckCircle2 size={13} />
                    <span>¡Guardado en BD!</span>
                  </>
                ) : savingLiq ? (
                  <>
                    <RefreshCw size={13} className="animate-spin" />
                    <span>Guardando...</span>
                  </>
                ) : (
                  <>
                    <Shield size={13} />
                    <span>Guardar en BD</span>
                  </>
                )}
              </button>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            <div className="overflow-x-auto max-h-[620px] custom-scrollbar bg-[var(--bg-surface)]">
              <table className="w-full text-left text-xs border-collapse font-sans bg-[var(--bg-surface)]">
                {/* ── CABECERA DE DOS NIVELES IDÉNTICA AL EXCEL ── */}
                <thead className="sticky top-0 z-20 whitespace-nowrap shadow-md">
                  {/* NIVEL 1: BLOQUES TEMÁTICOS CON ESTILO LIMPIO DARK-GLASS */}
                  <tr className="text-[10px] font-black uppercase tracking-wider text-white select-none">
                    <th colSpan={2} className="bg-slate-900/95 border-b border-r border-slate-800 py-1.5 px-2.5 text-slate-300 text-left">
                      COLABORADOR
                    </th>
                    <th colSpan={2} className="bg-cyan-950/70 text-cyan-300 text-center py-1.5 px-2 border-r border-slate-800 shadow-xs">
                      CUMPLIMIENTO OPERATIVO
                    </th>
                    <th colSpan={3} className="bg-slate-900/90 text-slate-400 text-center py-1.5 px-2 border-r border-slate-800 shadow-xs">
                      PESOS OFICIALES (50/40/10)
                    </th>
                    <th colSpan={3} className="bg-indigo-950/70 text-indigo-300 text-center py-1.5 px-2 border-r border-slate-800 shadow-xs">
                      % ALCANCE TRAMOS
                    </th>
                    <th colSpan={4} className="bg-teal-950/70 text-teal-300 text-center py-1.5 px-2 border-r border-slate-800 shadow-xs">
                      PUNTOS PONDERADOS
                    </th>
                    <th colSpan={2} className="bg-amber-950/70 text-amber-300 text-center py-1.5 px-2 border-r border-slate-800 shadow-xs">
                      LIQUIDACIÓN BRUTA / NETA
                    </th>
                    <th colSpan={2} className="bg-emerald-950/80 text-emerald-300 text-center py-1.5 px-2 shadow-xs">
                      DISPERSIÓN (60% / 40%)
                    </th>
                  </tr>

                  {/* NIVEL 2: ENCABEZADOS DE CADA COLUMNA */}
                  <tr className="text-[9.5px] font-bold uppercase text-slate-400 bg-slate-900/95 border-b border-slate-800 select-none">
                    <th className="py-2 px-2.5 text-left border-r border-slate-800 text-slate-200">PERSONAL</th>
                    <th className="py-2 px-2.5 text-left border-r border-slate-800 text-slate-300">CARGO</th>
                    
                    {/* INDICADORES */}
                    <th className="py-2 px-2 text-right border-r border-slate-800 bg-cyan-950/20 text-cyan-400">CUMP D1</th>
                    <th className="py-2 px-2 text-right border-r border-slate-800 bg-cyan-950/20 text-cyan-400">DOTAC</th>
                    
                    {/* PESOS */}
                    <th className="py-2 px-2 text-right border-r border-slate-800 text-slate-400">D1</th>
                    <th className="py-2 px-2 text-right border-r border-slate-800 text-slate-400">DOT</th>
                    <th className="py-2 px-2 text-right border-r border-slate-800 text-slate-400">CAL</th>
                    
                    {/* % ALCANCE */}
                    <th className="py-2 px-2 text-right border-r border-slate-800 bg-indigo-950/20 text-indigo-400">D1</th>
                    <th className="py-2 px-2 text-right border-r border-slate-800 bg-indigo-950/20 text-indigo-400">DOT</th>
                    <th className="py-2 px-2 text-right border-r border-slate-800 bg-indigo-950/20 text-indigo-400">CAL</th>
                    
                    {/* PUNTOS (%) */}
                    <th className="py-2 px-2 text-right border-r border-slate-800 bg-teal-950/20 text-teal-400">D1</th>
                    <th className="py-2 px-2 text-right border-r border-slate-800 bg-teal-950/20 text-teal-400">DOT</th>
                    <th className="py-2 px-2 text-right border-r border-slate-800 bg-teal-950/20 text-teal-400">CAL</th>
                    <th className="py-2 px-2 text-right border-r border-slate-800 bg-teal-950/40 text-teal-300 font-black">TOTAL</th>
                    
                    {/* RESULTADOS */}
                    <th className="py-2 px-2 text-right border-r border-slate-800 text-slate-400">BRUTO</th>
                    <th className="py-2 px-2 text-right border-r border-slate-800 bg-emerald-950/40 text-emerald-300 font-black">NETO</th>
                    
                    {/* SUBDIVIDIDO */}
                    <th className="py-2 px-2 text-right border-r border-slate-800 bg-emerald-950/20 text-emerald-400">EFECTIVO 60%</th>
                    <th className="py-2 px-2 text-right bg-amber-950/20 text-amber-400">SODEXO 40%</th>
                  </tr>
                </thead>

                {/* ── CUERPO DE DATOS CON FORMATOS Y SEMÁFOROS EXACTOS ── */}
                <tbody className="divide-y divide-[var(--border-subtle)] text-[11px] font-sans bg-[var(--bg-surface)]">
                  {filasFiltradas.length === 0 ? (
                    <tr>
                      <td colSpan={18} className="py-12 text-center text-xs text-[var(--text-muted)]">
                        No se encontraron colaboradores para el periodo y filtros actuales.
                      </td>
                    </tr>
                  ) : (
                    filasFiltradas.map((f) => {
                      const d1High = f.pctDia1Operativo >= 100
                      const d1Low = f.pctDia1Operativo < 70
                      const dotHigh = f.pctDotacionOperativo >= 100
                      const dotLow = f.pctDotacionOperativo < 70
                      const isMeta = f.totalPuntosPct >= 85
                      const isExpanded = expandedRecruiterKey === f.key

                      return (
                        <React.Fragment key={f.key}>
                          <tr
                            className="bg-[var(--bg-surface)] hover:bg-[var(--surface-hover)] transition-colors whitespace-nowrap group"
                          >
                            {/* PERSONAL */}
                            <td className="py-2 px-3 border-r border-b border-slate-800 bg-slate-900/30">
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => setExpandedRecruiterKey(isExpanded ? null : f.key)}
                                    className="size-5 rounded hover:bg-slate-800 text-slate-400 hover:text-cyan-400 flex items-center justify-center cursor-pointer transition-colors"
                                    title="Desplegar grupos GPE"
                                  >
                                    {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                                  </button>
                                  
                                  {/* Avatar iniciales */}
                                  <div className="size-6 rounded-full bg-slate-800 border border-slate-700 text-cyan-400 flex items-center justify-center text-[10px] font-black shrink-0">
                                    {(f.alias || f.nombre).slice(0, 2).toUpperCase()}
                                  </div>

                                  <div className="flex flex-col min-w-0">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <span
                                        onClick={() => handleOpenBoletaTrazabilidad(f, 'resumen')}
                                        className="font-bold text-slate-100 hover:text-cyan-400 cursor-pointer transition-colors text-[11.5px] truncate max-w-[190px]"
                                        title={f.nombre}
                                      >
                                        {f.nombre}
                                      </span>
                                      
                                      {/* Badge Estado */}
                                      {f.estado === 'CESE' ? (
                                        <span
                                          className="px-1.5 py-0.5 bg-rose-950/80 border border-rose-700/60 text-rose-300 text-[8.5px] font-black rounded tracking-wider inline-flex items-center gap-1 leading-tight shadow-xs"
                                          title={f.fechaCese ? `Colaborador Cesado el ${f.fechaCese}` : 'Colaborador Cesado'}
                                        >
                                          <span className="size-1 rounded-full bg-rose-400" />
                                          <span>CESE</span>
                                          {f.fechaCese && <span className="opacity-90 font-mono text-[7.5px]">({f.fechaCese})</span>}
                                        </span>
                                      ) : (
                                        <span className="px-1.5 py-0.5 bg-emerald-950/60 border border-emerald-700/50 text-emerald-300 text-[8px] font-bold rounded inline-flex items-center gap-1">
                                          <span className="size-1 rounded-full bg-emerald-400 animate-pulse" />
                                          <span>ACTIVO</span>
                                        </span>
                                      )}

                                      {!f.enCatalogo && (
                                        <span
                                          className="px-1 py-0.2 bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[8px] font-bold rounded-xs"
                                          title="Sin registro en catálogo"
                                        >
                                          S/CAT
                                        </span>
                                      )}
                                    </div>
                                    <span className="text-[9.5px] text-slate-400 font-mono">
                                      {f.documento ? `DNI: ${f.documento}` : ''} {f.alias ? `· Alias: ${f.alias}` : ''}
                                    </span>
                                  </div>
                                </div>

                                <button
                                  type="button"
                                  onClick={() => handleOpenBoletaTrazabilidad(f, 'grupos')}
                                  className="px-1.5 py-0.5 rounded bg-slate-800/90 hover:bg-cyan-500/20 text-[9px] font-mono text-slate-400 hover:text-cyan-300 border border-slate-700 cursor-pointer shrink-0"
                                  title="Ver trazabilidad de grupos GPE y postulantes"
                                >
                                  {f.evaluadoSobreEquipo ? 'Eq' : `${f.gruposCount}G`}
                                </button>
                              </div>
                            </td>

                            {/* CARGO */}
                            <td
                              className="py-2 px-2.5 text-[10px] uppercase font-medium border-r border-b border-slate-800 max-w-[180px] truncate"
                              title={f.cargo}
                            >
                              <span className="px-2 py-0.5 rounded-md bg-slate-800/80 border border-slate-700/70 text-slate-300 font-semibold tracking-wide">
                                {f.cargo}
                              </span>
                            </td>

                            {/* INDICADORES: CUMP D1 */}
                            <td
                              onClick={() => handleOpenBoletaTrazabilidad(f, 'grupos')}
                              title={`Día 1: ${f.dia1Real} asistieron / ${f.dia1Meta} meta (${f.evaluadoSobreEquipo ? 'Media Equipo' : `${f.gruposCount} grupos`}) — Clic para ver grupos`}
                              className={`py-1.5 px-2 text-right font-mono border-r border-b border-[var(--border-subtle)] cursor-pointer hover:underline ${
                                d1High
                                  ? 'text-emerald-400 font-bold'
                                  : d1Low
                                  ? 'text-rose-400 font-bold'
                                  : 'text-[var(--text-primary)] font-medium'
                              }`}
                            >
                              {Number(f.pctDia1Operativo || 0).toFixed(2)}%
                              <span className="text-[9px] text-[var(--text-muted)] ml-1 font-normal">
                                ({f.dia1Real}/{f.dia1Meta})
                              </span>
                            </td>

                            {/* INDICADORES: DOTAC */}
                            <td
                              onClick={() => handleOpenBoletaTrazabilidad(f, 'grupos')}
                              title={`Dotación (I-OP): ${f.dotacionReal} ingresos / ${f.rqReal} RQ OP (${f.evaluadoSobreEquipo ? 'Media Equipo' : `${f.gruposCount} grupos`}) — Clic para ver grupos`}
                              className={`py-1.5 px-2 text-right font-mono border-r border-b border-[var(--border-subtle)] cursor-pointer hover:underline ${
                                dotHigh
                                  ? 'text-emerald-400 font-bold'
                                  : dotLow
                                  ? 'text-rose-400 font-bold'
                                  : 'text-[var(--text-primary)] font-medium'
                              }`}
                            >
                              {Number(f.pctDotacionOperativo || 0).toFixed(2)}%
                              <span className="text-[9px] text-[var(--text-muted)] ml-1 font-normal">
                                ({f.dotacionReal}/{f.rqReal})
                              </span>
                            </td>

                            {/* PESOS: D1 */}
                            <td className="py-1.5 px-2 text-right font-mono text-[var(--text-muted)] border-r border-b border-[var(--border-subtle)]">
                              {Number(f.pesoDia1 || 50).toFixed(2)}%
                            </td>

                            {/* PESOS: DOT */}
                            <td className="py-1.5 px-2 text-right font-mono text-[var(--text-muted)] border-r border-b border-[var(--border-subtle)]">
                              {Number(f.pesoDotacion || 40).toFixed(2)}%
                            </td>

                            {/* PESOS: CAL */}
                            <td className="py-1.5 px-2 text-right font-mono text-[var(--text-muted)] border-r border-b border-[var(--border-subtle)]">
                              {Number(f.pesoCalidad + (f.pesoProcesosAdm || 0)).toFixed(2)}%
                            </td>

                            {/* % ALCANCE: D1 */}
                            <td className="py-1.5 px-2 text-right font-mono text-[var(--text-secondary)] border-r border-b border-[var(--border-subtle)]">
                              {Number(f.alcanceDia1 || 0).toFixed(2)}%
                            </td>

                            {/* % ALCANCE: DOT */}
                            <td className="py-1.5 px-2 text-right font-mono text-[var(--text-secondary)] border-r border-b border-[var(--border-subtle)]">
                              {Number(f.alcanceDotacion || 0).toFixed(2)}%
                            </td>

                            {/* % ALCANCE: CAL */}
                            <td className="py-1.5 px-2 text-right font-mono text-[var(--text-secondary)] border-r border-b border-[var(--border-subtle)]">
                              {Number(f.alcanceCalidad || 100).toFixed(2)}%
                            </td>

                            {/* PUNTOS (%): D1 */}
                            <td className="py-1.5 px-2 text-right font-mono text-[var(--text-primary)] border-r border-b border-[var(--border-subtle)]">
                              {Number(f.puntosDia1 || 0).toFixed(2)}%
                            </td>

                            {/* PUNTOS (%): DOT */}
                            <td className="py-1.5 px-2 text-right font-mono text-[var(--text-primary)] border-r border-b border-[var(--border-subtle)]">
                              {Number(f.puntosDotacion || 0).toFixed(2)}%
                            </td>

                            {/* PUNTOS (%): CAL */}
                            <td className="py-1.5 px-2 text-right font-mono text-[var(--text-primary)] border-r border-b border-[var(--border-subtle)]">
                              {Number((f.puntosCalidad || 0) + (f.puntosProcesosAdm || 0)).toFixed(2)}%
                            </td>

                            {/* PUNTOS (%): TOTAL */}
                            <td
                              className={`py-1.5 px-2 text-right font-mono font-bold border-r border-b border-[var(--border-subtle)] ${
                                isMeta
                                  ? 'text-emerald-400'
                                  : 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
                              }`}
                            >
                              {isMeta ? `▲ ${Number(f.totalPuntosPct || 0).toFixed(2)}%` : `▼ ${Number(f.totalPuntosPct || 0).toFixed(2)}%`}
                            </td>

                            {/* RESULTADOS: BRUTO */}
                            <td className="py-1.5 px-2 text-right font-mono text-[var(--text-secondary)] border-r border-b border-[var(--border-subtle)]">
                              {Number(f.bonoBruto || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>

                            {/* RESULTADOS: NETO */}
                            <td className="py-2 px-2.5 text-right font-mono border-r border-b border-slate-800 bg-emerald-950/20">
                              {f.bonoNeto > 0 ? (
                                <div className="flex flex-col items-end">
                                  <span className="font-black text-emerald-400 text-xs">
                                    S/ {Number(f.bonoNeto || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </span>
                                  <span className="text-[8px] font-bold text-emerald-300 bg-emerald-950/80 px-1 rounded border border-emerald-700/50">
                                    COMISIONA
                                  </span>
                                </div>
                              ) : (
                                <div className="flex flex-col items-end">
                                  <span className="font-medium text-slate-500 text-xs">
                                    S/ 0.00
                                  </span>
                                  <span className="text-[8px] font-medium text-slate-400">
                                    Sin Valla
                                  </span>
                                </div>
                              )}
                            </td>

                            {/* SUBDIVIDIDO: EFECTIVO 60 */}
                            <td className="py-2 px-2 text-right font-mono font-bold border-r border-b border-slate-800">
                              {f.bonoEfectivo > 0 ? (
                                <span className="text-emerald-300">
                                  S/ {Number(f.bonoEfectivo || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                              ) : (
                                <span className="text-slate-600">-</span>
                              )}
                            </td>

                            {/* SUBDIVIDIDO: SODEXO 40 */}
                            <td className="py-2 px-2 text-right font-mono font-bold border-b border-slate-800">
                              {f.bonoSodexo > 0 ? (
                                <span className="text-amber-300">
                                  S/ {Number(f.bonoSodexo || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                              ) : (
                                <span className="text-slate-600">-</span>
                              )}
                            </td>
                          </tr>

                          {/* SUB-FILA DESPLEGABLE DE TRAZABILIDAD POR GRUPOS (NIVEL 2 -> NIVEL 3) */}
                          {isExpanded && (
                            <tr className="bg-[var(--bg-elevated)]/90 border-b border-[var(--border-normal)]">
                              <td colSpan={18} className="p-3">
                                <div className="rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-3 space-y-2.5">
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div className="flex flex-wrap items-center gap-2 text-xs">
                                      <span className="font-black text-cyan-400 uppercase tracking-wider">
                                        Trazabilidad de Origen · {f.nombre}
                                      </span>
                                      <span className="px-2 py-0.5 rounded bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[10px] font-mono text-[var(--text-secondary)]">
                                        Match Catálogo: {f.tipoMatch}
                                      </span>
                                      {f.nombresNominaCruzados?.length > 0 && (
                                        <span className="text-[10px] text-[var(--text-muted)] font-mono">
                                          Nómina: {f.nombresNominaCruzados.join(' | ')}
                                        </span>
                                      )}
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => handleOpenBoletaTrazabilidad(f, 'resumen')}
                                      className="px-2.5 py-1 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-[10px] font-bold cursor-pointer"
                                    >
                                      Abrir Ficha & Auditoría 360°
                                    </button>
                                  </div>

                                  {f.evaluadoSobreEquipo && (
                                    <div className="p-2 rounded-lg bg-purple-500/10 border border-purple-500/30 text-[11px] text-purple-200 flex items-center justify-between">
                                      <span>
                                        <strong>Cargo de Liderazgo ({f.cargo}):</strong> Se evalúa sobre la <strong>Media General del Equipo Operativo</strong> (Día 1: {mediaEquipo.dia1Total}/{mediaEquipo.dia1MetaTotal} = {fmtPct(mediaEquipo.pctDia1)} · Dotación: {mediaEquipo.dotacionTotal}/{mediaEquipo.rqTotal} = {fmtPct(mediaEquipo.pctDotacion)}).
                                      </span>
                                    </div>
                                  )}

                                  {(!f.gruposDetalle || f.gruposDetalle.length === 0) ? (
                                    <div className="text-[11px] text-[var(--text-muted)] py-2">
                                      No registra grupos directos asignados como reclutador en este corte.
                                    </div>
                                  ) : (
                                    <div className="overflow-x-auto">
                                      <table className="w-full text-[11px] border-collapse">
                                        <thead>
                                          <tr className="text-[10px] uppercase text-[var(--text-muted)] border-b border-[var(--border-subtle)]">
                                            <th className="py-1.5 px-2 text-left">Código GPE</th>
                                            <th className="py-1.5 px-2 text-left">Campaña / Segmento</th>
                                            <th className="py-1.5 px-2 text-left">Inicio → Fin Capa</th>
                                            <th className="py-1.5 px-2 text-left">Fuente</th>
                                            <th className="py-1.5 px-2 text-right">Nómina</th>
                                            <th className="py-1.5 px-2 text-right">Asist. Día 1 / Meta</th>
                                            <th className="py-1.5 px-2 text-right">Dotación (I-OP) / RQ</th>
                                            <th className="py-1.5 px-2 text-right">Acción Nominal</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-[var(--border-subtle)] font-mono">
                                          {f.gruposDetalle.map((g, gIdx) => (
                                            <tr key={`${g.codigoGpe}-${gIdx}`} className="hover:bg-[var(--bg-elevated)]">
                                              <td className="py-1.5 px-2 font-bold text-cyan-400">{g.codigoGpe}</td>
                                              <td className="py-1.5 px-2 font-sans">
                                                <span className="font-semibold text-[var(--text-primary)]">{g.campana}</span>
                                                <span className="text-[10px] text-[var(--text-muted)] ml-1.5">({g.segmento})</span>
                                              </td>
                                              <td className="py-1.5 px-2 text-[var(--text-muted)]">{g.fechaInicio} → {g.fechaIngresoOp}</td>
                                              <td className="py-1.5 px-2 font-sans">
                                                <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                                                  g.origenFuente === 'BASE_BD'
                                                    ? 'bg-emerald-500/15 text-emerald-400'
                                                    : 'bg-cyan-500/15 text-cyan-300'
                                                }`}>
                                                  {g.origenFuente === 'BASE_BD' ? 'Base BD' : 'En Vivo'}
                                                </span>
                                                {g.tieneDesfaseVivo && (
                                                  <span className="ml-1 px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[9px] font-bold">
                                                    Vivo: D1={g.dia1Vivo} / Dot={g.dotacionVivo}
                                                  </span>
                                                )}
                                              </td>
                                              <td className="py-1.5 px-2 text-right text-indigo-300 font-bold">{g.nomina}</td>
                                              <td className="py-1.5 px-2 text-right text-amber-300 font-bold">
                                                {g.dia1} / {g.dia1Meta}
                                              </td>
                                              <td className="py-1.5 px-2 text-right text-emerald-400 font-bold">
                                                {g.dotacion} / {g.rq}
                                              </td>
                                              <td className="py-1.5 px-2 text-right font-sans">
                                                <button
                                                  type="button"
                                                  onClick={() => handleOpenBoletaTrazabilidad(f, 'postulantes', g)}
                                                  className="px-2 py-0.5 rounded bg-cyan-500/15 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/30 text-[10px] font-bold cursor-pointer"
                                                >
                                                  Ver Postulantes (DNI)
                                                </button>
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      )
                    })
                  )}
                </tbody>

                {/* ── FILA FINAL DE TOTALES (SUMA Y PROMEDIOS EXACTOS) ── */}
                <tfoot className="sticky bottom-0 bg-[var(--bg-elevated)] border-t-2 border-[var(--border-normal)] font-mono text-[11px] font-bold z-10 whitespace-nowrap shadow-md">
                  <tr className="border-b border-[var(--border-subtle)]">
                    <td
                      colSpan={2}
                      className="py-2.5 px-2.5 text-left font-sans font-black uppercase text-[11px] text-[var(--accent)] border-r border-[var(--border-subtle)]"
                    >
                      TOTAL ({filasFiltradas.length})
                    </td>
                    
                    {/* Media Cump D1 */}
                    <td className="py-2.5 px-2 text-right text-purple-300 border-r border-[var(--border-subtle)] font-black">
                      {Number(totalesTabla.mediaDia1 || 0).toFixed(2)}%
                    </td>

                    {/* Media Dotac */}
                    <td className="py-2.5 px-2 text-right text-blue-300 border-r border-[var(--border-subtle)] font-black">
                      {Number(totalesTabla.mediaDotacion || 0).toFixed(2)}%
                    </td>

                    {/* Pesos vacíos */}
                    <td colSpan={3} className="py-2.5 px-2 border-r border-[var(--border-subtle)] bg-[var(--bg-surface)]/50" />

                    {/* % Alcance vacíos */}
                    <td colSpan={3} className="py-2.5 px-2 border-r border-[var(--border-subtle)] bg-[var(--bg-surface)]/50" />

                    {/* Puntos D1, DOT, CAL vacíos */}
                    <td colSpan={3} className="py-2.5 px-2 border-r border-[var(--border-subtle)] bg-[var(--bg-surface)]/50" />

                    {/* Media Total Puntos */}
                    <td className="py-2.5 px-2 text-right text-[var(--text-primary)] font-black border-r border-[var(--border-subtle)]">
                      {Number(totalesTabla.mediaPuntos || 0).toFixed(2)}%
                    </td>

                    {/* Suma Bruto */}
                    <td className="py-2.5 px-2 text-right text-[var(--text-secondary)] font-black border-r border-[var(--border-subtle)]">
                      {Number(totalesTabla.sumBruto || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>

                    {/* Suma Neto */}
                    <td className="py-2.5 px-2 text-right text-emerald-400 font-black border-r border-[var(--border-subtle)]">
                      {Number(totalesTabla.sumNeto || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>

                    {/* Suma Efectivo */}
                    <td className="py-2.5 px-2 text-right text-cyan-300 font-black border-r border-[var(--border-subtle)]">
                      {Number(totalesTabla.sumEfectivo || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>

                    {/* Suma Sodexo */}
                    <td className="py-2.5 px-2 text-right text-amber-300 font-black">
                      {Number(totalesTabla.sumSodexo || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* ── BARRA DE ESTADO INFERIOR IDÉNTICA AL SHEETS ── */}
            <div className="flex items-center justify-between px-3 py-2 bg-[var(--bg-surface)] border-t border-[var(--border-subtle)] text-[10px] text-[var(--text-muted)] font-mono">
              <div className="flex items-center gap-3">
                <span className="font-bold tracking-wider">{filasFiltradas.length} FILAS</span>
                <span>•</span>
                <span>MONEDA: PEN</span>
              </div>
              <div className="flex items-center gap-1.5 text-emerald-400 font-semibold">
                <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>CONECTADO</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── TABLA 3: BASE OPERATIVA (LOS 16 ENCABEZADOS EXACTOS DEL SHEETS) ── */}
      {activeTab === 'base_operativa' && (
        <Card>
          <CardHeader className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[var(--border-subtle)]">
            <div className="flex items-center gap-3">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary)] flex items-center gap-2">
                <Layers size={14} className="text-cyan-400" />
                Base Operativa Oficial (16 Columnas)
              </CardTitle>
              <span className="text-[10px] text-[var(--text-muted)] font-mono">{baseOperativaFiltrada.length} registros</span>
              {baseFromDb.length > 0 ? (
                <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  BD Conectada (maqueta_reclutadores_base)
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-full text-[9px] font-medium bg-amber-500/15 text-amber-300 border border-amber-500/30">
                  Calculado en Memoria
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                <input
                  type="text"
                  placeholder="Buscar código, reclutador..."
                  value={searchBaseTerm}
                  onChange={(e) => setSearchBaseTerm(e.target.value)}
                  className="pl-8 pr-3 py-1 text-xs rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-primary)] outline-none focus:border-[var(--accent)] w-52"
                />
              </div>

              <select
                value={filterBaseCampana}
                onChange={(e) => setFilterBaseCampana(e.target.value)}
                className="text-xs px-2.5 py-1 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-primary)] outline-none cursor-pointer max-w-[140px] truncate"
              >
                <option value="TODAS">Todas Campañas</option>
                {campanasBaseDisponibles.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>

              <button
                type="button"
                onClick={handleSincronizarBase}
                disabled={syncingBase}
                className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white transition-all cursor-pointer shadow-xs disabled:opacity-50"
                title="Cruza las nóminas de postulantes y control de asistencia para este periodo y guarda en maqueta_reclutadores_base"
              >
                <RefreshCw size={13} className={syncingBase ? 'animate-spin' : ''} />
                <span>{syncingBase ? 'Sincronizando...' : syncBaseSuccess ? '¡Sincronizado!' : 'Sincronizar Nóminas'}</span>
              </button>

              <input
                type="file"
                ref={fileInputRef}
                accept=".csv"
                onChange={handleImportBaseCsv}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold bg-[var(--bg-elevated)] hover:bg-[var(--surface-hover)] border border-[var(--border-subtle)] text-[var(--text-primary)] transition-all cursor-pointer shadow-xs"
                title="Cargar archivo CSV con las 16 columnas operativas directamente a la base de datos"
              >
                <UploadCloud size={13} className="text-cyan-400" />
                <span>Importar CSV</span>
              </button>

              <button
                type="button"
                onClick={handleExportBaseCsv}
                className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold bg-cyan-600 hover:bg-cyan-500 text-white transition-all cursor-pointer shadow-xs ml-auto"
              >
                <Download size={13} />
                <span>Exportar CSV</span>
              </button>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            <div className="overflow-x-auto max-h-[580px] custom-scrollbar">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="sticky top-0 bg-[var(--table-head-bg)] text-[10px] font-black uppercase text-[var(--text-muted)] shadow-xs z-10 whitespace-nowrap">
                  <tr>
                    <th className="py-2.5 px-2.5 border-b border-[var(--border-subtle)]">PERIODO EFECTIVO</th>
                    <th className="py-2.5 px-2.5 border-b border-[var(--border-subtle)]">CÓDIGO GPE</th>
                    <th className="py-2.5 px-2.5 border-b border-[var(--border-subtle)]">FECHA INICIO CAPA</th>
                    <th className="py-2.5 px-2.5 border-b border-[var(--border-subtle)]">FECHA FIN CAPA</th>
                    <th className="py-2.5 px-2.5 border-b border-[var(--border-subtle)]">SEGMENTO</th>
                    <th className="py-2.5 px-2.5 border-b border-[var(--border-subtle)]">CAMPAÑA</th>
                    <th className="py-2.5 px-2.5 border-b border-[var(--border-subtle)]">MODALIDAD</th>
                    <th className="py-2.5 px-2.5 border-b border-[var(--border-subtle)]">TIPO DE RECLUTADOR</th>
                    <th className="py-2.5 px-2.5 border-b border-[var(--border-subtle)]">ANALISTA / RECLUTADOR</th>
                    <th className="py-2.5 px-2.5 border-b border-[var(--border-subtle)] text-right">META DIA 1 GRUPAL</th>
                    <th className="py-2.5 px-2.5 border-b border-[var(--border-subtle)] text-right">NOMINA</th>
                    <th className="py-2.5 px-2.5 border-b border-[var(--border-subtle)] text-right">META DIA 1 INDIVIDUAL</th>
                    <th className="py-2.5 px-2.5 border-b border-[var(--border-subtle)] text-right">META DIA 1 NUEVO CRITERIO</th>
                    <th className="py-2.5 px-2.5 border-b border-[var(--border-subtle)] text-right">ASISTENCIA DÍA 1</th>
                    <th className="py-2.5 px-2.5 border-b border-[var(--border-subtle)] text-right">DOTACIÓN</th>
                    <th className="py-2.5 px-2.5 border-b border-[var(--border-subtle)] text-right">RQ OP.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)] font-sans">
                  {baseOperativaFiltrada.map((r, idx) => (
                    <tr key={r.id || idx} className="hover:bg-[var(--surface-hover)] transition-colors whitespace-nowrap text-[11px]">
                      <td className="py-2 px-2.5 font-mono text-[var(--text-muted)]">{r.periodoEfectivo}</td>
                      <td
                        className="py-2 px-2.5 font-mono font-bold text-cyan-400 cursor-pointer hover:underline"
                        title="Haz clic para ver los postulantes nominales (DNI) de este grupo"
                        onClick={() => {
                          const hitPersona = filas.find(f =>
                            f.nombresNominaCruzados?.includes(r.analistaReclutador) ||
                            f.nombre.toUpperCase().includes(String(r.analistaReclutador || '').toUpperCase())
                          ) || filas[0]
                          handleOpenBoletaTrazabilidad(hitPersona, 'postulantes', {
                            codigoGpe: r.codigoGpe,
                            campana: r.campana,
                            segmento: r.segmento,
                            responsableOriginal: r.analistaReclutador,
                            nomina: r.nomina,
                            dia1: r.asistenciaDia1,
                            dia1Meta: r.metaDia1Individual,
                            dotacion: r.dotacion,
                            rq: r.rqOp,
                          })
                        }}
                      >
                        {r.codigoGpe}
                      </td>
                      <td className="py-2 px-2.5 text-[var(--text-muted)]">{r.fechaInicioCapa}</td>
                      <td className="py-2 px-2.5 text-[var(--text-muted)]">{r.fechaFinCapa}</td>
                      <td className="py-2 px-2.5 text-[var(--text-secondary)]">{r.segmento}</td>
                      <td className="py-2 px-2.5 font-medium text-[var(--text-primary)] max-w-[150px] truncate">{r.campana}</td>
                      <td className="py-2 px-2.5">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          r.modalidad === 'REMOTO' ? 'bg-indigo-500/15 text-indigo-400' : 'bg-emerald-500/15 text-emerald-400'
                        }`}>
                          {r.modalidad}
                        </span>
                      </td>
                      <td className="py-2 px-2.5 text-[var(--text-secondary)]">{r.tipoReclutador}</td>
                      <td className="py-2 px-2.5 font-bold text-[var(--text-primary)] max-w-[200px]">
                        <div className="flex items-center gap-1.5 truncate">
                          <span className="truncate">{r.analistaReclutador}</span>
                          {r.isCesado && (
                            <span
                              className="px-1 py-0.2 bg-rose-600 text-white text-[8px] font-black rounded shrink-0 shadow-xs"
                              title={r.fechaCese ? `Cesado el ${r.fechaCese}` : 'Colaborador Cesado'}
                            >
                              CESE
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-2 px-2.5 font-mono text-right text-[var(--text-secondary)]">{r.metaDia1Grupal}</td>
                      <td className="py-2 px-2.5 font-mono text-right font-bold text-indigo-400">{r.nomina}</td>
                      <td className="py-2 px-2.5 font-mono text-right text-[var(--text-secondary)]">{r.metaDia1Individual}</td>
                      <td className="py-2 px-2.5 font-mono text-right text-amber-400 font-semibold">{r.metaDia1NuevoCriterio}</td>
                      <td className="py-2 px-2.5 font-mono text-right font-bold text-amber-300">{r.asistenciaDia1}</td>
                      <td className="py-2 px-2.5 font-mono text-right font-bold text-emerald-400">{r.dotacion}</td>
                      <td className="py-2 px-2.5 font-mono text-right font-bold text-blue-400">{r.rqOp}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="sticky bottom-0 bg-[var(--bg-elevated)] border-t-2 border-[var(--border-normal)] font-mono text-xs font-black z-10 whitespace-nowrap">
                  <tr>
                    <td colSpan={9} className="py-2.5 px-2.5 text-right font-sans text-[11px] uppercase tracking-wider text-[var(--text-muted)]">
                      TOTALES ACUMULADOS:
                    </td>
                    <td className="py-2.5 px-2.5 text-right text-[var(--text-secondary)]">{baseTotales.metaDia1Grupal}</td>
                    <td className="py-2.5 px-2.5 text-right text-indigo-400">{baseTotales.nomina}</td>
                    <td className="py-2.5 px-2.5 text-right text-[var(--text-secondary)]">{baseTotales.metaDia1Individual}</td>
                    <td className="py-2.5 px-2.5 text-right text-amber-400">{baseTotales.metaDia1NuevoCriterio}</td>
                    <td className="py-2.5 px-2.5 text-right text-amber-300">{baseTotales.asistenciaDia1}</td>
                    <td className="py-2.5 px-2.5 text-right text-emerald-400">{baseTotales.dotacion}</td>
                    <td className="py-2.5 px-2.5 text-right text-blue-400">{baseTotales.rqOp}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── TABLA 4: FICHA Y SIMULACIÓN 360° ───────────────────────────────── */}
      {activeTab === 'simulador' && selectedPersona && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-4 space-y-3">
            <Card>
              <CardHeader className="py-3 border-b border-[var(--border-subtle)]">
                <CardTitle className="text-xs font-bold text-[var(--text-primary)] flex items-center justify-between">
                  <span>Seleccionar Reclutador</span>
                  <span className="text-[10px] text-[var(--text-muted)] font-mono">{filas.length} registrados</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-2 max-h-[560px] overflow-y-auto custom-scrollbar space-y-1">
                {filas.map((f) => {
                  const isSel = selectedPersona?.key === f.key
                  return (
                    <div
                      key={f.key}
                      onClick={() => {
                        setSelectedPersona(f)
                        setEditingAuditKey(null)
                      }}
                      className={`p-2.5 rounded-xl cursor-pointer transition-all border ${
                        isSel
                          ? 'bg-[var(--accent-soft)]/25 border-[var(--accent)] shadow-xs'
                          : 'bg-[var(--bg-surface)] hover:bg-[var(--bg-elevated)] border-transparent text-[var(--text-secondary)]'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs text-[var(--text-primary)] truncate max-w-[180px]">{f.nombre}</span>
                        <span className="font-mono font-black text-xs text-emerald-400">{fmtMoney(f.bonoNeto)}</span>
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-[var(--text-muted)] mt-1 font-sans">
                        <span>{f.cargo} · {f.evaluadoSobreEquipo ? 'Media Eq.' : `${f.gruposCount} GPE`}</span>
                        <span className="font-mono font-bold text-cyan-400">{fmtPct(f.totalPuntosPct)}</span>
                      </div>
                    </div>
                  )
                })}
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-8 space-y-4">
            <Card>
              <CardHeader className="border-b border-[var(--border-subtle)] pb-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-black text-[var(--text-primary)]">{selectedPersona.nombre}</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                      {selectedPersona.cargo}
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-secondary)]">
                      Cruce: {selectedPersona.tipoMatch}
                    </span>
                  </div>
                  <p className="text-xs text-[var(--text-muted)] mt-0.5">
                    {selectedPersona.configCargo.descripcion}
                    {selectedPersona.nombresNominaCruzados?.length > 0 && (
                      <span className="ml-2 font-mono text-[10px] text-cyan-400">
                        [Nómina: {selectedPersona.nombresNominaCruzados.join(', ')}]
                      </span>
                    )}
                  </p>
                </div>

                <div className="text-right">
                  <span className="text-[10px] uppercase font-bold text-[var(--text-muted)] block">Bono Neto Total</span>
                  <span className="text-2xl font-black font-mono text-emerald-400">{fmtMoney(selectedPersona.bonoNeto)}</span>
                </div>
              </CardHeader>

              <CardContent className="p-4 space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <div className="p-2.5 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
                    <span className="text-[10px] text-[var(--text-muted)] block">
                      Día 1 ({selectedPersona.pesoDia1}%)
                    </span>
                    <strong className="text-sm font-mono text-white">{selectedPersona.dia1Real}</strong>
                    <span className="text-[10px] text-[var(--text-muted)]"> / {selectedPersona.dia1Meta}</span>
                    <div className="font-mono font-bold text-purple-300 mt-1">
                      {fmtPct(selectedPersona.pctDia1Operativo)} → {selectedPersona.puntosDia1} pts
                    </div>
                  </div>

                  <div className="p-2.5 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
                    <span className="text-[10px] text-[var(--text-muted)] block">
                      Dotación ({selectedPersona.pesoDotacion}%)
                    </span>
                    <strong className="text-sm font-mono text-white">{selectedPersona.dotacionReal}</strong>
                    <span className="text-[10px] text-[var(--text-muted)]"> / {selectedPersona.rqReal}</span>
                    <div className="font-mono font-bold text-blue-300 mt-1">
                      {fmtPct(selectedPersona.pctDotacionOperativo)} → {selectedPersona.puntosDotacion} pts
                    </div>
                  </div>

                  <div className="p-2.5 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
                    <span className="text-[10px] text-[var(--text-muted)] block">Efectivo ({selectedPersona.pctEfectivo}%)</span>
                    <div className="text-base font-mono font-black text-cyan-400 mt-1">{fmtMoney(selectedPersona.bonoEfectivo)}</div>
                    <span className="text-[9px] text-[var(--text-muted)]">Depósito banco</span>
                  </div>

                  <div className="p-2.5 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
                    <span className="text-[10px] text-[var(--text-muted)] block">Sodexo ({selectedPersona.pctSodexo}%)</span>
                    <div className="text-base font-mono font-black text-amber-400 mt-1">{fmtMoney(selectedPersona.bonoSodexo)}</div>
                    <span className="text-[9px] text-[var(--text-muted)]">Tarjeta alimentos</span>
                  </div>
                </div>

                {/* Panel de Auditoría Persistente de Calidad y Procesos Adm. */}
                <div className="p-3.5 rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="text-xs font-bold text-[var(--text-primary)] block">
                        Auditoría de Calidad ({selectedPersona.pesoCalidad}%) y Procesos Adm. ({selectedPersona.pesoProcesosAdm}%)
                      </span>
                      <span className="text-[10px] text-[var(--text-muted)]">
                        Calidad actual: <strong>{fmtPct(selectedPersona.pctCalidadReal)}</strong> ({selectedPersona.origenCalidad})
                        {selectedPersona.auditNote ? ` · Nota: "${selectedPersona.auditNote}"` : ''}
                      </span>
                    </div>
                    {editingAuditKey !== selectedPersona.key ? (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingAuditKey(selectedPersona.key)
                          setTempCalidad(selectedPersona.pctCalidadReal ?? 100)
                          setTempProcesos(selectedPersona.alcanceProcesosAdm ?? 100)
                          setTempMotivoAudit(selectedPersona.auditNote || '')
                        }}
                        className="px-3 py-1 rounded-lg bg-[var(--bg-surface)] hover:bg-[var(--surface-hover)] border border-[var(--border-subtle)] text-xs font-bold text-amber-300 cursor-pointer"
                      >
                        Editar Auditoría
                      </button>
                    ) : (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => guardarOverrideAuditoria(selectedPersona.key, tempCalidad, tempProcesos, tempMotivoAudit)}
                          className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold cursor-pointer"
                        >
                          Guardar Ajuste
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingAuditKey(null)}
                          className="px-2.5 py-1 rounded-lg bg-[var(--bg-surface)] text-xs text-[var(--text-muted)] cursor-pointer"
                        >
                          Cancelar
                        </button>
                      </div>
                    )}
                  </div>

                  {editingAuditKey === selectedPersona.key && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2 border-t border-[var(--border-subtle)] text-xs">
                      <label className="space-y-1">
                        <span className="text-[10px] text-[var(--text-muted)] font-bold block">% Cumplimiento Calidad</span>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="0.5"
                          value={tempCalidad}
                          onChange={(e) => setTempCalidad(e.target.value)}
                          className="w-full px-2.5 py-1.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-primary)] font-mono"
                        />
                      </label>
                      <label className="space-y-1">
                        <span className="text-[10px] text-[var(--text-muted)] font-bold block">% Alcance Procesos Adm.</span>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="5"
                          value={tempProcesos}
                          onChange={(e) => setTempProcesos(e.target.value)}
                          className="w-full px-2.5 py-1.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-primary)] font-mono"
                        />
                      </label>
                      <label className="space-y-1">
                        <span className="text-[10px] text-[var(--text-muted)] font-bold block">Motivo / Sustento de Auditoría</span>
                        <input
                          type="text"
                          placeholder="Ej: Auditoría file postulantes..."
                          value={tempMotivoAudit}
                          onChange={(e) => setTempMotivoAudit(e.target.value)}
                          className="w-full px-2.5 py-1.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-primary)]"
                        />
                      </label>
                    </div>
                  )}
                </div>

                {/* Grupos del Reclutador en Ficha 360 */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)]">
                      Grupos GPE que sustentan sus indicadores ({selectedPersona.gruposDetalle?.length || 0})
                    </span>
                    <button
                      type="button"
                      onClick={() => handleOpenBoletaTrazabilidad(selectedPersona, 'resumen')}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-cyan-600 hover:bg-cyan-500 text-white transition-all cursor-pointer shadow-xs"
                    >
                      <Eye size={13} />
                      <span>Abrir Boleta & Trazabilidad Nominal</span>
                    </button>
                  </div>

                  {selectedPersona.gruposDetalle?.length > 0 && (
                    <div className="overflow-x-auto rounded-xl border border-[var(--border-subtle)] max-h-[240px] custom-scrollbar">
                      <table className="w-full text-[11px] border-collapse">
                        <thead className="bg-[var(--bg-elevated)] text-[10px] uppercase text-[var(--text-muted)] sticky top-0">
                          <tr>
                            <th className="py-1.5 px-2.5 text-left">Grupo GPE</th>
                            <th className="py-1.5 px-2.5 text-left">Campaña</th>
                            <th className="py-1.5 px-2.5 text-right">Nómina</th>
                            <th className="py-1.5 px-2.5 text-right">Día 1 / Meta</th>
                            <th className="py-1.5 px-2.5 text-right">Dotación / RQ</th>
                            <th className="py-1.5 px-2.5 text-right">Postulantes</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--border-subtle)] font-mono">
                          {selectedPersona.gruposDetalle.map((g, i) => (
                            <tr key={`${g.codigoGpe}-${i}`} className="hover:bg-[var(--bg-elevated)]">
                              <td className="py-1.5 px-2.5 font-bold text-cyan-400">{g.codigoGpe}</td>
                              <td className="py-1.5 px-2.5 font-sans text-[var(--text-primary)]">{g.campana}</td>
                              <td className="py-1.5 px-2.5 text-right text-indigo-300">{g.nomina}</td>
                              <td className="py-1.5 px-2.5 text-right text-amber-300">{g.dia1} / {g.dia1Meta}</td>
                              <td className="py-1.5 px-2.5 text-right text-emerald-400">{g.dotacion} / {g.rq}</td>
                              <td className="py-1.5 px-2.5 text-right font-sans">
                                <button
                                  type="button"
                                  onClick={() => handleOpenBoletaTrazabilidad(selectedPersona, 'postulantes', g)}
                                  className="px-2 py-0.5 rounded bg-cyan-500/15 hover:bg-cyan-500/30 text-cyan-300 text-[10px] font-bold cursor-pointer"
                                >
                                  Ver DNI
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* ── PESTAÑA NUEVA: TRAZABILIDAD Y CIERRES EN BD (AUDITORÍA HISTÓRICA VS EN VIVO) ── */}
      {activeTab === 'trazabilidad_auditoria' && (
        <div className="space-y-4">
          {/* Bloque 1: Comparativa Liquidación Guardada en BD vs Cálculo Actual */}
          <Card>
            <CardHeader className="py-3 border-b border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle className="text-xs font-black uppercase tracking-wider text-[var(--text-primary)] flex items-center gap-2">
                  <Shield size={14} className="text-indigo-400" />
                  <span>Auditoría de Liquidación Guardada en BD vs. Tiempo Real ({periodoSeleccionado || 'Actual'})</span>
                </CardTitle>
                <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                  Compara la última foto congelada en <code className="text-cyan-300">maqueta_reclutadores_liquidaciones</code> contra el cálculo vivo actual para detectar variaciones post-cierre.
                </p>
              </div>
              <div className="flex items-center gap-2">
                {liquidacionesGuardadas.length > 0 && (
                  <span className="px-2.5 py-1 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-[10px] font-mono text-emerald-300">
                    Último cierre: {String(liquidacionesGuardadas[0]?.fecha_cierre || '').slice(0, 16).replace('T', ' ')} · Por: {liquidacionesGuardadas[0]?.liquidado_por || 'Admin'}
                  </span>
                )}
                <button
                  type="button"
                  onClick={handleGuardarEnBd}
                  disabled={savingLiq}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer"
                >
                  <Shield size={13} />
                  <span>{savingLiq ? 'Actualizando Cierre...' : 'Actualizar Cierre en BD'}</span>
                </button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {loadingLiqGuardadas ? (
                <div className="py-8 text-center text-xs text-[var(--text-muted)]">Consultando liquidaciones cerradas...</div>
              ) : liquidacionesGuardadas.length === 0 ? (
                <div className="py-8 text-center space-y-2">
                  <p className="text-xs text-[var(--text-muted)]">
                    Aún no se ha congelado ninguna liquidación en Base de Datos para el corte <strong>{periodoSeleccionado}</strong>.
                  </p>
                  <p className="text-[11px] text-[var(--text-secondary)]">
                    Usa el botón <strong>"Guardar en BD"</strong> para registrar la foto oficial y habilitar la auditoría de variaciones.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto max-h-[420px] custom-scrollbar">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="sticky top-0 bg-[var(--table-head-bg)] text-[10px] font-black uppercase text-[var(--text-muted)] z-10">
                      <tr>
                        <th className="py-2 px-3 border-b border-[var(--border-subtle)]">Personal RyS</th>
                        <th className="py-2 px-3 border-b border-[var(--border-subtle)]">Cargo</th>
                        <th className="py-2 px-3 border-b border-[var(--border-subtle)] text-right">D1 (BD → Vivo)</th>
                        <th className="py-2 px-3 border-b border-[var(--border-subtle)] text-right">Dotación (BD → Vivo)</th>
                        <th className="py-2 px-3 border-b border-[var(--border-subtle)] text-right">Puntos BD</th>
                        <th className="py-2 px-3 border-b border-[var(--border-subtle)] text-right">Puntos Vivo</th>
                        <th className="py-2 px-3 border-b border-[var(--border-subtle)] text-right">Bono Neto BD</th>
                        <th className="py-2 px-3 border-b border-[var(--border-subtle)] text-right">Bono Neto Vivo</th>
                        <th className="py-2 px-3 border-b border-[var(--border-subtle)] text-right">Variación (Δ S/)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border-subtle)] text-[11px] font-mono">
                      {liquidacionesGuardadas.map((liq, idx) => {
                        const vivo = filas.find(
                          f => f.nombre.toUpperCase() === String(liq.personal_rys || '').toUpperCase() ||
                               (f.documento && f.documento === String(liq.colaborador_id || ''))
                        )
                        const netoBd = Number(liq.bono_neto || 0)
                        const netoVivo = vivo ? Number(vivo.bonoNeto || 0) : 0
                        const deltaNeto = round2(netoVivo - netoBd)
                        const hasDiff = Math.abs(deltaNeto) >= 0.01

                        return (
                          <tr key={liq.id || idx} className={hasDiff ? 'bg-amber-500/5 hover:bg-amber-500/10' : 'hover:bg-[var(--surface-hover)]'}>
                            <td className="py-2 px-3 font-sans font-bold text-[var(--text-primary)]">{liq.personal_rys}</td>
                            <td className="py-2 px-3 font-sans text-[10px] text-[var(--text-muted)]">{liq.cargo}</td>
                            <td className="py-2 px-3 text-right">
                              {Number(liq.real_dia_1 || 0)}/{Number(liq.meta_dia_1 || 0)} →{' '}
                              <span className="text-purple-300 font-bold">{vivo ? `${vivo.dia1Real}/${vivo.dia1Meta}` : '-'}</span>
                            </td>
                            <td className="py-2 px-3 text-right">
                              {Number(liq.real_dotacion || 0)}/{Number(liq.rq_dotacion || 0)} →{' '}
                              <span className="text-blue-300 font-bold">{vivo ? `${vivo.dotacionReal}/${vivo.rqReal}` : '-'}</span>
                            </td>
                            <td className="py-2 px-3 text-right text-[var(--text-secondary)]">{fmtPct(liq.total_puntos_pct || 0)}</td>
                            <td className="py-2 px-3 text-right text-cyan-300 font-bold">{vivo ? fmtPct(vivo.totalPuntosPct) : '-'}</td>
                            <td className="py-2 px-3 text-right text-[var(--text-secondary)]">{fmtMoney(netoBd)}</td>
                            <td className="py-2 px-3 text-right text-emerald-400 font-bold">{vivo ? fmtMoney(netoVivo) : '-'}</td>
                            <td className="py-2 px-3 text-right font-bold">
                              {!hasDiff ? (
                                <span className="text-emerald-400">✓ Sin cambio</span>
                              ) : (
                                <span className={deltaNeto > 0 ? 'text-amber-300' : 'text-rose-400'}>
                                  {deltaNeto > 0 ? `+${fmtMoney(deltaNeto)}` : fmtMoney(deltaNeto)}
                                </span>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Bloque 2: Auditoría de Cruce de Nombres Nómina <-> Catálogo Equipo Reclutamiento */}
          <Card>
            <CardHeader className="py-3 border-b border-[var(--border-subtle)]">
              <CardTitle className="text-xs font-black uppercase tracking-wider text-[var(--text-primary)] flex items-center gap-2">
                <Users size={14} className="text-cyan-400" />
                <span>Matriz de Trazabilidad de Identidad (Nómina ↔ Catálogo Equipo RyS)</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto max-h-[380px] custom-scrollbar">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="sticky top-0 bg-[var(--table-head-bg)] text-[10px] font-black uppercase text-[var(--text-muted)] z-10">
                    <tr>
                      <th className="py-2 px-3 border-b border-[var(--border-subtle)]">Colaborador Consolidado</th>
                      <th className="py-2 px-3 border-b border-[var(--border-subtle)]">DNI</th>
                      <th className="py-2 px-3 border-b border-[var(--border-subtle)]">Tipo de Cruce</th>
                      <th className="py-2 px-3 border-b border-[var(--border-subtle)]">Nombres / Alias Detectados en Nómina</th>
                      <th className="py-2 px-3 border-b border-[var(--border-subtle)] text-right">Grupos GPE</th>
                      <th className="py-2 px-3 border-b border-[var(--border-subtle)] text-right">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-subtle)] text-[11px]">
                    {filas.map((f) => (
                      <tr key={f.key} className="hover:bg-[var(--surface-hover)]">
                        <td className="py-2 px-3 font-bold text-[var(--text-primary)]">{f.nombre}</td>
                        <td className="py-2 px-3 font-mono text-[var(--text-muted)]">{f.documento || 'S/D'}</td>
                        <td className="py-2 px-3">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            f.tipoMatch === 'EXACTO' || f.tipoMatch === 'ALIAS'
                              ? 'bg-emerald-500/15 text-emerald-400'
                              : f.tipoMatch === 'DIFUSO'
                              ? 'bg-amber-500/15 text-amber-300'
                              : f.tipoMatch === 'NO_EN_CATALOGO'
                              ? 'bg-rose-500/20 text-rose-300'
                              : 'bg-slate-500/20 text-slate-300'
                          }`}>
                            {f.tipoMatch}
                          </span>
                        </td>
                        <td className="py-2 px-3 font-mono text-[10px] text-[var(--text-secondary)]">
                          {f.nombresNominaCruzados?.length > 0 ? f.nombresNominaCruzados.join(' · ') : 'Sin grupos en nómina'}
                        </td>
                        <td className="py-2 px-3 font-mono text-right font-bold text-cyan-400">{f.gruposCount}</td>
                        <td className="py-2 px-3 text-right">
                          <button
                            type="button"
                            onClick={() => handleOpenBoletaTrazabilidad(f, 'grupos')}
                            className="px-2.5 py-0.5 rounded bg-[var(--bg-elevated)] hover:bg-cyan-500/20 text-cyan-300 text-[10px] font-bold border border-[var(--border-subtle)] cursor-pointer"
                          >
                            Inspeccionar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── TABLA 5: ESCALAS Y TRAMOS DE MAQUETA ────────────────────────────── */}
      {activeTab === 'maqueta_reglas' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="py-3 border-b border-[var(--border-subtle)]">
              <CardTitle className="text-xs font-bold text-amber-400 uppercase">
                Maqueta Asistentes de RyS (50% Día 1 + 40% Dotación + 10% Calidad)
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 text-xs space-y-2">
              <p className="text-[11px] text-[var(--text-muted)]">Escala oficial de tramos aplicada a Asistentes:</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="p-2.5 rounded-lg bg-[var(--bg-elevated)]">
                  <strong className="text-cyan-400 block mb-1">% Dotación (40%):</strong>
                  <div className="space-y-0.5 text-[10px] font-mono">
                    <div>&lt; 65.00%: 0.00% Alcance</div>
                    <div className="text-amber-300 font-bold">75.00% a 79.99%: 70.00% Alcance</div>
                    <div className="text-amber-300 font-bold">80.00% a 89.99%: 85.00% Alcance</div>
                    <div className="text-emerald-400 font-bold">≥ 90.00%: 100.00% Alcance</div>
                  </div>
                </div>
                <div className="p-2.5 rounded-lg bg-[var(--bg-elevated)]">
                  <strong className="text-purple-400 block mb-1">% Día 1 (50%):</strong>
                  <div className="space-y-0.5 text-[10px] font-mono">
                    <div>&lt; 75.00%: 0.00% Alcance</div>
                    <div className="text-amber-300 font-bold">75.00% a 84.99%: 70.00% Alcance</div>
                    <div className="text-amber-300 font-bold">85.00% a 99.99%: 85.00% Alcance</div>
                    <div className="text-emerald-400 font-bold">≥ 100.00%: 100.00% Alcance</div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="py-3 border-b border-[var(--border-subtle)]">
              <CardTitle className="text-xs font-bold text-cyan-400 uppercase">
                Maqueta Analistas de RyS (40% Día 1 + 40% Dotación + 10% Calidad + 10% Procesos)
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 text-xs space-y-2">
              <p className="text-[11px] text-[var(--text-muted)]">Escala oficial con 4 indicadores y Procesos Administrativos:</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="p-2.5 rounded-lg bg-[var(--bg-elevated)]">
                  <strong className="text-cyan-400 block mb-1">% Dotación (40%):</strong>
                  <div className="space-y-0.5 text-[10px] font-mono">
                    <div>&lt; 60.00%: 0.00% Alcance</div>
                    <div>60.00% a 69.99%: 50.00% Alcance</div>
                    <div className="text-amber-300 font-bold">70.00% a 74.99%: 70.00% Alcance</div>
                    <div className="text-amber-300 font-bold">75.00% a 79.99%: 85.00% Alcance</div>
                    <div className="text-emerald-400 font-bold">≥ 80.00%: 100.00% Alcance</div>
                  </div>
                </div>
                <div className="p-2.5 rounded-lg bg-[var(--bg-elevated)]">
                  <strong className="text-purple-400 block mb-1">% Día 1 (40%):</strong>
                  <div className="space-y-0.5 text-[10px] font-mono">
                    <div>&lt; 60.00%: 0.00% Alcance</div>
                    <div>60.00% a 69.99%: 50.00% Alcance</div>
                    <div className="text-amber-300 font-bold">70.00% a 84.99%: 70.00% Alcance</div>
                    <div className="text-amber-300 font-bold">85.00% a 99.99%: 85.00% Alcance</div>
                    <div className="text-emerald-400 font-bold">≥ 100.00%: 100.00% Alcance</div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="md:col-span-2">
            <CardHeader className="py-3 border-b border-[var(--border-subtle)]">
              <CardTitle className="text-xs font-bold text-emerald-400 uppercase flex items-center justify-between">
                <span>Indicador Oficial de Calidad (10.00% del Bono Total)</span>
                <span className="text-[10px] text-[var(--text-muted)] font-mono">Fórmula: (Cantidad Aptos / Cantidad Evaluados) • Meta: ≥ 80.00%</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 text-xs space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 font-mono text-center">
                <div className="p-2.5 rounded-xl bg-[var(--bg-elevated)] border border-rose-500/20">
                  <div className="text-[10px] text-rose-400 font-bold">&lt; 65.00%</div>
                  <div className="text-sm font-black text-rose-400 mt-1">0.00%</div>
                  <span className="text-[9px] text-[var(--text-muted)] block">Alcance (0.0% Pts)</span>
                </div>
                <div className="p-2.5 rounded-xl bg-[var(--bg-elevated)] border border-amber-500/20">
                  <div className="text-[10px] text-amber-400 font-bold">65.00% - 69.99%</div>
                  <div className="text-sm font-black text-amber-400 mt-1">50.00%</div>
                  <span className="text-[9px] text-[var(--text-muted)] block">Alcance (5.0% Pts)</span>
                </div>
                <div className="p-2.5 rounded-xl bg-[var(--bg-elevated)] border border-amber-500/20">
                  <div className="text-[10px] text-amber-400 font-bold">70.00% - 74.99%</div>
                  <div className="text-sm font-black text-amber-400 mt-1">70.00%</div>
                  <span className="text-[9px] text-[var(--text-muted)] block">Alcance (7.0% Pts)</span>
                </div>
                <div className="p-2.5 rounded-xl bg-[var(--bg-elevated)] border border-teal-500/20">
                  <div className="text-[10px] text-teal-400 font-bold">75.00% - 79.99%</div>
                  <div className="text-sm font-black text-teal-400 mt-1">85.00%</div>
                  <span className="text-[9px] text-[var(--text-muted)] block">Alcance (8.5% Pts)</span>
                </div>
                <div className="p-2.5 rounded-xl bg-[var(--bg-elevated)] border border-emerald-500/30">
                  <div className="text-[10px] text-emerald-400 font-bold">≥ 80.00% (Meta)</div>
                  <div className="text-sm font-black text-emerald-400 mt-1">100.00%</div>
                  <span className="text-[9px] text-emerald-400 font-bold block">Alcance (10.0% Pts)</span>
                </div>
              </div>
              <p className="text-[10px] text-[var(--text-muted)] text-center">
                Puntos (%) aportados al bono = <span className="font-bold text-[var(--text-primary)]">% Alcance × 10.00%</span>. Si el resultado es ≥ 80.00%, el reclutador asegura el 10.00% íntegro de su bono.
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── MODAL SLIDE-OVER: BOLETA Y TRAZABILIDAD 360° (3 NIVELES) ─────────── */}
      {boletaPersona && (
        <div className="fixed inset-0 z-50 flex items-center justify-center sm:justify-end bg-black/60 backdrop-blur-xs p-3 sm:p-6 animate-in fade-in">
          <div className="w-full max-w-2xl bg-[var(--bg-surface)] border border-[var(--border-normal)] rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
            {/* Cabecera Boleta */}
            <div className="p-4 bg-[var(--bg-elevated)] border-b border-[var(--border-subtle)] flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                  <Banknote size={16} />
                </div>
                <div>
                  <h3 className="text-xs font-black uppercase tracking-wider text-[var(--text-primary)]">
                    Boleta & Trazabilidad 360° RyS
                  </h3>
                  <span className="text-[10px] text-[var(--text-muted)] font-mono">
                    GEA Perú · Corte {periodoSeleccionado || 'Actual'} · {modeloMaqueta === 'sheets_oficial' ? 'Maqueta Oficial 50/40/10' : 'Maqueta por Cargo'}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setBoletaPersona(null)}
                className="size-7 rounded-lg hover:bg-rose-500/20 text-[var(--text-muted)] hover:text-rose-300 flex items-center justify-center cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Sub-pestañas de Trazabilidad dentro de la Boleta */}
            <div className="px-5 pt-3 pb-2 bg-[var(--bg-elevated)]/60 border-b border-[var(--border-subtle)] flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setBoletaTab('resumen')}
                className={`px-3 py-1 rounded-xl text-xs font-bold cursor-pointer transition-all ${
                  boletaTab === 'resumen'
                    ? 'bg-[var(--accent)] text-white'
                    : 'bg-[var(--bg-surface)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
              >
                1. Boleta & Cálculo
              </button>
              <button
                type="button"
                onClick={() => setBoletaTab('grupos')}
                className={`px-3 py-1 rounded-xl text-xs font-bold cursor-pointer transition-all ${
                  boletaTab === 'grupos'
                    ? 'bg-[var(--accent)] text-white'
                    : 'bg-[var(--bg-surface)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
              >
                2. Grupos GPE ({boletaPersona.gruposDetalle?.length || 0})
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!selectedGpeTrace && boletaPersona.gruposDetalle?.length > 0) {
                    handleCargarPostulantesGrupo(boletaPersona.gruposDetalle[0], boletaPersona)
                  } else {
                    setBoletaTab('postulantes')
                  }
                }}
                className={`px-3 py-1 rounded-xl text-xs font-bold cursor-pointer transition-all ${
                  boletaTab === 'postulantes'
                    ? 'bg-[var(--accent)] text-white'
                    : 'bg-[var(--bg-surface)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
              >
                3. Postulantes Nominales (DNI)
              </button>
            </div>

            {/* Contenido Boleta */}
            <div className="p-5 overflow-y-auto space-y-4 custom-scrollbar text-xs flex-1">
              {/* Info Colaborador */}
              <div className="p-3.5 rounded-2xl bg-[var(--bg-base)] border border-[var(--border-subtle)] flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-black text-[var(--text-primary)]">{boletaPersona.nombre}</span>
                    <span className="px-1.5 py-0.5 rounded bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[9px] font-mono text-cyan-300">
                      Cruce: {boletaPersona.tipoMatch}
                    </span>
                  </div>
                  <div className="text-[11px] text-[var(--text-secondary)] mt-0.5">{boletaPersona.cargo}</div>
                  {boletaPersona.documento && (
                    <div className="text-[10px] text-[var(--text-muted)] font-mono mt-0.5">DNI: {boletaPersona.documento}</div>
                  )}
                  {boletaPersona.nombresNominaCruzados?.length > 0 && (
                    <div className="text-[10px] text-[var(--text-muted)] font-mono mt-0.5">
                      Nómina RYS: {boletaPersona.nombresNominaCruzados.join(' | ')}
                    </div>
                  )}
                </div>
                <div className="text-right">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-black ${
                    boletaPersona.estado === 'ACTIVO' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-rose-500/15 text-rose-400'
                  }`}>
                    {boletaPersona.estado}
                  </span>
                  <div className="text-[10px] text-[var(--text-muted)] mt-1 font-mono">
                    Bruto: {fmtMoney(boletaPersona.bonoBruto)}
                  </div>
                </div>
              </div>

              {/* TAB 1: RESUMEN Y FÓRMULA DE LIQUIDACIÓN */}
              {boletaTab === 'resumen' && (
                <>
                  <div className="space-y-2">
                    <span className="text-[10px] font-black uppercase text-[var(--text-muted)] tracking-wider block">
                      Desglose Matemático de Indicadores & Maqueta
                    </span>

                    <div className="space-y-1.5 font-mono text-[11px]">
                      {/* Día 1 */}
                      {boletaPersona.pesoDia1 > 0 && (
                        <div className="p-2.5 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] flex items-center justify-between">
                          <div>
                            <div className="font-sans font-bold text-[var(--text-primary)]">
                              % Cumplimiento Día 1 ({boletaPersona.dia1Real} / {boletaPersona.dia1Meta})
                            </div>
                            <div className="text-[10px] text-[var(--text-muted)]">
                              {boletaPersona.evaluadoSobreEquipo ? 'Media Eq: ' : 'Logrado: '}
                              {fmtPct(boletaPersona.pctDia1Aplicado)} ({boletaPersona.tramoDia1}) → {boletaPersona.alcanceDia1}% Alcance
                            </div>
                          </div>
                          <div className="text-right font-black text-purple-300">
                            {boletaPersona.alcanceDia1}% × {boletaPersona.pesoDia1}% = {fmtPct(boletaPersona.puntosDia1)}
                          </div>
                        </div>
                      )}

                      {/* Dotación */}
                      {boletaPersona.pesoDotacion > 0 && (
                        <div className="p-2.5 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] flex items-center justify-between">
                          <div>
                            <div className="font-sans font-bold text-[var(--text-primary)]">
                              % Dotación Ingresos OP ({boletaPersona.dotacionReal} / {boletaPersona.rqReal})
                            </div>
                            <div className="text-[10px] text-[var(--text-muted)]">
                              {boletaPersona.evaluadoSobreEquipo ? 'Media Eq: ' : 'Logrado: '}
                              {fmtPct(boletaPersona.pctDotacionAplicado)} ({boletaPersona.tramoDotacion}) → {boletaPersona.alcanceDotacion}% Alcance
                            </div>
                          </div>
                          <div className="text-right font-black text-blue-300">
                            {boletaPersona.alcanceDotacion}% × {boletaPersona.pesoDotacion}% = {fmtPct(boletaPersona.puntosDotacion)}
                          </div>
                        </div>
                      )}

                      {/* Calidad */}
                      {boletaPersona.pesoCalidad > 0 && (
                        <div className="p-2.5 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] flex items-center justify-between">
                          <div>
                            <div className="font-sans font-bold text-[var(--text-primary)]">% Calidad (Aptos / Evaluados)</div>
                            <div className="text-[10px] text-[var(--text-muted)]">
                              Resultado: {fmtPct(boletaPersona.pctCalidadReal || 100)}
                              {boletaPersona.evaluadosReal > 0 ? ` (${boletaPersona.aptosReal || 0} Aptos / ${boletaPersona.evaluadosReal} Eval.)` : ` (${boletaPersona.origenCalidad})`}
                              {' '}→ {boletaPersona.alcanceCalidad}% Alcance
                            </div>
                          </div>
                          <div className="text-right font-black text-emerald-300">
                            {boletaPersona.alcanceCalidad}% × {boletaPersona.pesoCalidad}% = {fmtPct(boletaPersona.puntosCalidad)}
                          </div>
                        </div>
                      )}

                      {/* Procesos Adm */}
                      {boletaPersona.pesoProcesosAdm > 0 && (
                        <div className="p-2.5 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] flex items-center justify-between">
                          <div>
                            <div className="font-sans font-bold text-[var(--text-primary)]">Procesos Administrativos</div>
                            <div className="text-[10px] text-[var(--text-muted)]">
                              Alcance: {boletaPersona.alcanceProcesosAdm}% ({boletaPersona.origenProcesosAdm})
                            </div>
                          </div>
                          <div className="text-right font-black text-amber-300">
                            {boletaPersona.alcanceProcesosAdm}% × {boletaPersona.pesoProcesosAdm}% = {fmtPct(boletaPersona.puntosProcesosAdm)}
                          </div>
                        </div>
                      )}

                      {/* Total Puntos */}
                      <div className="p-2.5 rounded-xl bg-[var(--accent-soft)]/20 border border-[var(--accent)] flex items-center justify-between">
                        <span className="font-sans font-black text-[var(--text-primary)]">TOTAL PUNTOS ALCANZADOS:</span>
                        <span className="text-sm font-black text-emerald-400 font-mono">{fmtPct(boletaPersona.totalPuntosPct)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Resultado Financiero Final Subdividido */}
                  <div className="p-4 rounded-2xl bg-gradient-to-br from-[var(--bg-elevated)] to-[var(--bg-base)] border border-[var(--border-normal)] space-y-3">
                    <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2">
                      <span className="text-xs uppercase font-bold text-[var(--text-muted)]">Bono Neto Total:</span>
                      <span className="text-xl font-black font-mono text-emerald-400">{fmtMoney(boletaPersona.bonoNeto)}</span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="p-2.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
                        <span className="text-[10px] text-[var(--text-muted)] uppercase block font-bold">
                          Depósito Efectivo ({boletaPersona.pctEfectivo}%)
                        </span>
                        <div className="text-base font-black font-mono text-cyan-400 mt-0.5">
                          {fmtMoney(boletaPersona.bonoEfectivo)}
                        </div>
                        <span className="text-[9px] text-[var(--text-muted)]">Transferencia BCP/BBVA</span>
                      </div>

                      <div className="p-2.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
                        <span className="text-[10px] text-[var(--text-muted)] uppercase block font-bold">
                          Tarjeta Sodexo ({boletaPersona.pctSodexo}%)
                        </span>
                        <div className="text-base font-black font-mono text-amber-400 mt-0.5">
                          {fmtMoney(boletaPersona.bonoSodexo)}
                        </div>
                        <span className="text-[9px] text-[var(--text-muted)]">Vale de alimentos</span>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* TAB 2: DESGLOSE POR GRUPOS GPE (NIVEL 2) */}
              {boletaTab === 'grupos' && (
                <div className="space-y-3">
                  {boletaPersona.evaluadoSobreEquipo && (
                    <div className="p-3 rounded-xl bg-purple-500/10 border border-purple-500/30 text-[11px] text-purple-200">
                      <strong>Nota de Liderazgo:</strong> El cálculo de bono para <strong>{boletaPersona.cargo}</strong> se realiza sobre la <strong>Media General del Equipo Operativo</strong> (Día 1: {mediaEquipo.dia1Total}/{mediaEquipo.dia1MetaTotal} = {fmtPct(mediaEquipo.pctDia1)} · Dotación: {mediaEquipo.dotacionTotal}/{mediaEquipo.rqTotal} = {fmtPct(mediaEquipo.pctDotacion)}).
                    </div>
                  )}

                  {(!boletaPersona.gruposDetalle || boletaPersona.gruposDetalle.length === 0) ? (
                    <div className="p-6 text-center text-[var(--text-muted)] bg-[var(--bg-elevated)] rounded-2xl">
                      No tiene grupos GPE directos registrados como reclutador en este corte.
                    </div>
                  ) : (
                    <div className="overflow-x-auto rounded-2xl border border-[var(--border-subtle)]">
                      <table className="w-full text-[11px] border-collapse">
                        <thead className="bg-[var(--bg-elevated)] text-[10px] uppercase text-[var(--text-muted)]">
                          <tr>
                            <th className="py-2 px-2.5 text-left">Código GPE</th>
                            <th className="py-2 px-2.5 text-left">Campaña</th>
                            <th className="py-2 px-2.5 text-left">Fuente</th>
                            <th className="py-2 px-2.5 text-right">Nómina</th>
                            <th className="py-2 px-2.5 text-right">Día 1 / Meta</th>
                            <th className="py-2 px-2.5 text-right">Dotación / RQ</th>
                            <th className="py-2 px-2.5 text-right">Nivel 3</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--border-subtle)] font-mono">
                          {boletaPersona.gruposDetalle.map((g, i) => (
                            <tr key={`${g.codigoGpe}-${i}`} className="hover:bg-[var(--bg-elevated)]">
                              <td className="py-2 px-2.5 font-bold text-cyan-400">{g.codigoGpe}</td>
                              <td className="py-2 px-2.5 font-sans">
                                <div className="font-semibold text-[var(--text-primary)]">{g.campana}</div>
                                <div className="text-[9px] text-[var(--text-muted)]">{g.segmento} · {g.fechaInicio}</div>
                              </td>
                              <td className="py-2 px-2.5 font-sans">
                                <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                                  g.origenFuente === 'BASE_BD' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-cyan-500/15 text-cyan-300'
                                }`}>
                                  {g.origenFuente === 'BASE_BD' ? 'Base BD' : 'Vivo'}
                                </span>
                                {g.tieneDesfaseVivo && (
                                  <div className="text-[9px] text-amber-300 font-bold mt-0.5">
                                    Vivo: D1={g.dia1Vivo} / Dot={g.dotacionVivo}
                                  </div>
                                )}
                              </td>
                              <td className="py-2 px-2.5 text-right text-indigo-300 font-bold">{g.nomina}</td>
                              <td className="py-2 px-2.5 text-right text-amber-300 font-bold">{g.dia1} / {g.dia1Meta}</td>
                              <td className="py-2 px-2.5 text-right text-emerald-400 font-bold">{g.dotacion} / {g.rq}</td>
                              <td className="py-2 px-2.5 text-right font-sans">
                                <button
                                  type="button"
                                  onClick={() => handleCargarPostulantesGrupo(g, boletaPersona)}
                                  className="px-2.5 py-1 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-[10px] font-bold cursor-pointer"
                                >
                                  Ver Postulantes
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: POSTULANTES NOMINALES DEL GRUPO (NIVEL 3 - DNI) */}
              {boletaTab === 'postulantes' && (
                <div className="space-y-3">
                  {/* Selector rápido de grupo GPE del reclutador */}
                  {boletaPersona.gruposDetalle?.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[10px] font-bold uppercase text-[var(--text-muted)] mr-1">Grupo GPE:</span>
                      {boletaPersona.gruposDetalle.map((g, idx) => {
                        const isActiveGpe = selectedGpeTrace?.codigoGpe === g.codigoGpe && selectedGpeTrace?.campana === g.campana
                        return (
                          <button
                            key={`${g.codigoGpe}-${idx}`}
                            type="button"
                            onClick={() => handleCargarPostulantesGrupo(g, boletaPersona)}
                            className={`px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold cursor-pointer border transition-all ${
                              isActiveGpe
                                ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300'
                                : 'bg-[var(--bg-elevated)] border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                            }`}
                          >
                            {g.codigoGpe} ({g.campana})
                          </button>
                        )
                      })}
                    </div>
                  )}

                  {selectedGpeTrace && (
                    <div className="p-2.5 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-2 text-[11px]">
                      <div>
                        <strong className="text-cyan-400 font-mono">{selectedGpeTrace.codigoGpe}</strong>
                        <span className="text-[var(--text-secondary)] ml-2">{selectedGpeTrace.campana}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-1">
                        {[
                          { id: 'TODOS', label: `Todos (${postulantesTrace.length})` },
                          { id: 'MIOS', label: `De este Reclutador (${postulantesTrace.filter(p => p.perteneceAReclutador).length})` },
                          { id: 'DIA1', label: `Asistió D1 (${postulantesTrace.filter(p => p.perteneceAReclutador && p.asistioDia1).length})` },
                          { id: 'IOP', label: `Dotación I-OP (${postulantesTrace.filter(p => p.perteneceAReclutador && p.tieneIop).length})` },
                          { id: 'BAJA', label: `Bajas (${postulantesTrace.filter(p => p.perteneceAReclutador && p.esBaja).length})` },
                        ].map((tab) => (
                          <button
                            key={tab.id}
                            type="button"
                            onClick={() => setFilterPostulantesTrace(tab.id)}
                            className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer ${
                              filterPostulantesTrace === tab.id
                                ? 'bg-[var(--accent)] text-white'
                                : 'bg-[var(--bg-surface)] text-[var(--text-muted)]'
                            }`}
                          >
                            {tab.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {loadingPostulantesTrace ? (
                    <div className="py-10 text-center text-xs text-[var(--text-muted)]">
                      Cargando postulantes nominales desde <code className="text-cyan-400">nominas</code> y <code className="text-cyan-400">consolidado_asistencias</code>...
                    </div>
                  ) : postulantesTrace.length === 0 ? (
                    <div className="py-8 text-center text-xs text-[var(--text-muted)] bg-[var(--bg-elevated)] rounded-2xl">
                      Selecciona un grupo GPE para inspeccionar sus postulantes nominales (DNI).
                    </div>
                  ) : (
                    <div className="overflow-x-auto rounded-2xl border border-[var(--border-subtle)] max-h-[380px] custom-scrollbar">
                      <table className="w-full text-[11px] border-collapse">
                        <thead className="bg-[var(--bg-elevated)] text-[10px] uppercase text-[var(--text-muted)] sticky top-0">
                          <tr>
                            <th className="py-2 px-2.5 text-left">DNI</th>
                            <th className="py-2 px-2.5 text-left">Postulante</th>
                            <th className="py-2 px-2.5 text-left">Reclutador Nómina</th>
                            <th className="py-2 px-2.5 text-center">Día 1</th>
                            <th className="py-2 px-2.5 text-center">Dotación (I-OP)</th>
                            <th className="py-2 px-2.5 text-center">Estado / Asist.</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--border-subtle)]">
                          {postulantesTrace
                            .filter((p) => {
                              if (filterPostulantesTrace === 'MIOS') return p.perteneceAReclutador
                              if (filterPostulantesTrace === 'DIA1') return p.perteneceAReclutador && p.asistioDia1
                              if (filterPostulantesTrace === 'IOP') return p.perteneceAReclutador && p.tieneIop
                              if (filterPostulantesTrace === 'BAJA') return p.perteneceAReclutador && p.esBaja
                              return true
                            })
                            .map((p) => (
                              <tr
                                key={p.documento}
                                className={p.perteneceAReclutador ? 'hover:bg-[var(--bg-elevated)]' : 'opacity-55 hover:opacity-90'}
                              >
                                <td className="py-1.5 px-2.5 font-mono font-bold text-cyan-300">{p.documento}</td>
                                <td className="py-1.5 px-2.5 font-semibold text-[var(--text-primary)]">{p.nombreCompleto}</td>
                                <td className="py-1.5 px-2.5 text-[10px] text-[var(--text-secondary)]">
                                  {p.reclutador}
                                  {p.perteneceAReclutador && (
                                    <span className="ml-1 px-1 py-0.2 rounded bg-cyan-500/20 text-cyan-300 text-[8.5px] font-bold">
                                      MÍO
                                    </span>
                                  )}
                                </td>
                                <td className="py-1.5 px-2.5 text-center font-mono">
                                  {p.asistioDia1 ? (
                                    <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 text-[10px] font-bold">
                                      ✓ Sí
                                    </span>
                                  ) : (
                                    <span className="px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-400 text-[10px]">
                                      No
                                    </span>
                                  )}
                                </td>
                                <td className="py-1.5 px-2.5 text-center font-mono">
                                  {p.tieneIop ? (
                                    <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-bold">
                                      ✓ I-OP {p.fechaIop ? `(${p.fechaIop.slice(5)})` : ''}
                                    </span>
                                  ) : (
                                    <span className="text-[10px] text-[var(--text-muted)]">—</span>
                                  )}
                                </td>
                                <td className="py-1.5 px-2.5 text-center">
                                  <span className={`px-1.5 py-0.5 rounded text-[9.5px] font-bold ${
                                    p.tieneIop
                                      ? 'bg-emerald-500/15 text-emerald-400'
                                      : p.esBaja
                                      ? 'bg-rose-500/15 text-rose-400'
                                      : 'bg-amber-500/15 text-amber-300'
                                  }`}>
                                    {p.estadoResumen} ({p.diasAsistidos}d)
                                  </span>
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Pie Boleta con Botón Imprimir */}
            <div className="p-4 bg-[var(--bg-elevated)] border-t border-[var(--border-subtle)] flex items-center justify-between">
              <span className="text-[10px] text-[var(--text-muted)]">Emitido por GEA WFM Platform · Trazabilidad Nivel 1-2-3</span>
              <button
                type="button"
                onClick={() => window.print()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-cyan-600 hover:bg-cyan-500 text-white cursor-pointer shadow-xs"
              >
                <Printer size={13} />
                <span>Imprimir Boleta</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: DISPERSIÓN DE PAGOS PARA TESORERÍA ──────────────────────── */}
      {isDispersionModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="w-full max-w-md bg-[var(--bg-surface)] border border-[var(--border-normal)] rounded-3xl shadow-2xl overflow-hidden p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
              <div className="flex items-center gap-2">
                <CreditCard size={18} className="text-blue-400" />
                <h3 className="text-sm font-black uppercase tracking-wider text-[var(--text-primary)]">
                  Dispersión de Pagos RyS
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsDispersionModalOpen(false)}
                className="size-7 rounded-lg hover:bg-rose-500/20 text-[var(--text-muted)] hover:text-rose-300 flex items-center justify-center cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <p className="text-xs text-[var(--text-muted)]">
              Descarga los archivos listos para ejecutar la transferencia bancaria y la recarga en la plataforma Sodexo/Pluxee:
            </p>

            <div className="space-y-3">
              <div className="p-3.5 rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-[var(--text-primary)]">Nómina en Efectivo (Bancos)</div>
                  <div className="text-[10px] text-[var(--text-muted)] mt-0.5">
                    {filasFiltradas.length} personas · Total: <strong className="text-cyan-400 font-mono">{fmtMoney(resumen.totalPagoEfectivo)}</strong>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleExportDispersionEfectivo}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-cyan-600 hover:bg-cyan-500 text-white cursor-pointer shadow-xs"
                >
                  <Download size={13} />
                  <span>Descargar</span>
                </button>
              </div>

              <div className="p-3.5 rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-[var(--text-primary)]">Nómina Sodexo (Alimentos)</div>
                  <div className="text-[10px] text-[var(--text-muted)] mt-0.5">
                    {filasFiltradas.length} personas · Total: <strong className="text-amber-400 font-mono">{fmtMoney(resumen.totalPagoSodexo)}</strong>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleExportDispersionSodexo}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-500 text-white cursor-pointer shadow-xs"
                >
                  <Download size={13} />
                  <span>Descargar</span>
                </button>
              </div>
            </div>

            <div className="pt-2 text-right">
              <button
                type="button"
                onClick={() => setIsDispersionModalOpen(false)}
                className="px-4 py-1.5 rounded-xl text-xs font-bold bg-[var(--bg-elevated)] hover:bg-[var(--surface-hover)] text-[var(--text-secondary)] border border-[var(--border-subtle)] cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
