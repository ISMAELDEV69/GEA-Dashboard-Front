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
  sincronizarMaquetaBaseDesdeConsolidado 
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
  const [activeTab, setActiveTab] = useState('bonos_oficial') // 'bonos_oficial' | 'base_operativa' | 'simulador' | 'maqueta_reglas'
  const [searchTerm, setSearchTerm] = useState('')
  const [searchBaseTerm, setSearchBaseTerm] = useState('')
  const [filterBaseCampana, setFilterBaseCampana] = useState('TODAS')
  const [filterBaseModalidad, setFilterBaseModalidad] = useState('TODAS')
  const [filterCargo, setFilterCargo] = useState('TODOS')
  const [filterSemaforo, setFilterSemaforo] = useState('TODOS')
  const [selectedPersona, setSelectedPersona] = useState(null)
  const [boletaPersona, setBoletaPersona] = useState(null)
  const [isDispersionModalOpen, setIsDispersionModalOpen] = useState(false)
  const [useTope, setUseTope] = useState(false)

  // Sobrescrituras manuales de auditoría en memoria: { [key]: { calidad: 100, procesosAdm: 100 } }
  const [manualAuditOverrides, setManualAuditOverrides] = useState({})
  const [editingAuditKey, setEditingAuditKey] = useState(null)
  const [tempCalidad, setTempCalidad] = useState(100)
  const [tempProcesos, setTempProcesos] = useState(100)

  // Estado de persistencia en base de datos
  const [savingLiq, setSavingLiq] = useState(false)
  const [liqSavedSuccess, setLiqSavedSuccess] = useState(false)

  // Estado de Base Operativa Oficial (maqueta_reclutadores_base)
  const [baseFromDb, setBaseFromDb] = useState([])
  const [loadingBaseDb, setLoadingBaseDb] = useState(false)
  const [syncingBase, setSyncingBase] = useState(false)
  const [syncBaseSuccess, setSyncBaseSuccess] = useState(false)

  // Carga inicial de la Base Operativa guardada en BD
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

  // Adaptador de filas operativas: prioriza maqueta_reclutadores_base si existe en BD
  const effectiveKpiRows = useMemo(() => {
    if (baseFromDb && baseFromDb.length > 0) {
      return baseFromDb.map((b) => ({
        responsable: b.analista_reclutador,
        meta_dia_1_individual: Number(b.meta_dia_1_individual || 0),
        meta_dia_1_campana: Number(b.meta_dia_1_grupal || 0),
        dia_1: Number(b.asistencia_dia_1 || 0),
        dotacion_q: Number(b.dotacion || 0),
        rq: Number(b.rq_op || 0),
        nomina: Number(b.nomina || 0),
        campana: b.campana,
        codigo_gpe: b.codigo_gpe,
        grupo_g: b.codigo_gpe,
        segmento: b.segmento,
        modalidad: b.modalidad,
        fecha_inicio: b.fecha_inicio_capa,
        fecha_ingreso_op: b.fecha_fin_capa,
        tipo_reclutador: b.tipo_reclutador,
      }))
    }
    return kpiRows
  }, [baseFromDb, kpiRows])

  // ── 3. EJECUCIÓN DEL MOTOR DE CÁLCULO DE MAQUETA ────────────────────────────
  const { filas, resumen, mediaEquipo } = useMemo(() => {
    return calcularMaquetaBonosReclutadores(effectiveKpiRows, equipoList, manualAuditOverrides, { useTope })
  }, [effectiveKpiRows, equipoList, manualAuditOverrides, useTope])

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
  const filasFiltradas = useMemo(() => {
    return filas.filter((f) => {
      if (isLockedRecruiter && selfKey && f.key !== selfKey) return false
      if (filterCargo !== 'TODOS' && f.cargoClave !== filterCargo) return false
      if (filterSemaforo !== 'TODOS' && f.semaforoGlobal !== filterSemaforo) return false
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
  }, [filas, isLockedRecruiter, selfKey, filterCargo, filterSemaforo, searchTerm])

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
      return baseFromDb.map((b, idx) => ({
        id: b.id || `${b.codigo_gpe}-${idx}`,
        periodoEfectivo: b.periodo_efectivo || '-',
        codigoGpe: b.codigo_gpe || '-',
        fechaInicioCapa: b.fecha_inicio_capa || '-',
        fechaFinCapa: b.fecha_fin_capa || '-',
        segmento: b.segmento || '-',
        campana: b.campana || '-',
        modalidad: b.modalidad || 'PRESENCIAL',
        tipoReclutador: b.tipo_reclutador || 'Interno',
        analistaReclutador: b.analista_reclutador || '-',
        metaDia1Grupal: Number(b.meta_dia_1_grupal || 0),
        nomina: Number(b.nomina || 0),
        metaDia1Individual: Number(b.meta_dia_1_individual || 0),
        metaDia1NuevoCriterio: Number(b.meta_dia_1_nuevo_criterio || 0),
        asistenciaDia1: Number(b.asistencia_dia_1 || 0),
        dotacion: Number(b.dotacion || 0),
        rqOp: Number(b.rq_op || 0),
        isDb: true
      }))
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
      }
    } catch (err) {
      alert('Error al guardar liquidación: ' + (err?.message || err))
    } finally {
      setSavingLiq(false)
    }
  }, [periodoSeleccionado, filasFiltradas, userProfile])

  const handleExportBaseCsv = useCallback(() => {
    const headers = [
      'PERIODO EFECTIVO', 'CODIGPE-O GPE-', 'FECHA INICIO CAPA', 'FECHA FIN CAPA',
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
          >
            <span>Con Topes</span>
            <span className={`w-2 h-2 rounded-full ${useTope ? 'bg-amber-400' : 'bg-slate-500'}`} />
          </button>
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
            Alimenta a Supervisores y Jefaturas
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
              <span className="text-[10px] text-[var(--text-muted)]">Cálculo sistemático oficial según tramos acumulados en Base</span>
            </div>

            {/* Controles: Filtro de Cargo y Buscador Rápido */}
            <div className="flex flex-wrap items-center gap-2">
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
                <thead className="sticky top-0 z-20 whitespace-nowrap shadow-xs">
                  {/* NIVEL 1: BLOQUES TEMÁTICOS CON SUS COLORES OFICIALES */}
                  <tr className="text-[11px] font-black uppercase tracking-wider text-white select-none">
                    <th colSpan={2} className="bg-[var(--table-head-bg)] border-b border-r border-[var(--border-subtle)] py-1" />
                    <th colSpan={2} className="bg-[#E65100] text-white text-center py-1.5 px-2 border-r border-white/20 shadow-xs">
                      INDICADORES
                    </th>
                    <th colSpan={3} className="bg-[#1E88E5] text-white text-center py-1.5 px-2 border-r border-white/20 shadow-xs">
                      PESOS
                    </th>
                    <th colSpan={3} className="bg-[#FBC02D] text-slate-950 text-center py-1.5 px-2 border-r border-black/10 shadow-xs font-black">
                      % ALCANCE
                    </th>
                    <th colSpan={4} className="bg-[#26A69A] text-white text-center py-1.5 px-2 border-r border-white/20 shadow-xs">
                      PUNTOS (%)
                    </th>
                    <th colSpan={2} className="bg-[#FB8C00] text-white text-center py-1.5 px-2 border-r border-white/20 shadow-xs">
                      RESULTADOS
                    </th>
                    <th colSpan={2} className="bg-[#42A5F5] text-white text-center py-1.5 px-2 shadow-xs">
                      SUBDIVIDIDO
                    </th>
                  </tr>

                  {/* NIVEL 2: ENCABEZADOS DE CADA COLUMNA */}
                  <tr className="text-[10px] font-black uppercase text-[var(--text-secondary)] bg-[var(--table-head-bg)] border-b border-[var(--border-normal)] select-none">
                    <th className="py-2 px-2.5 text-left border-r border-[var(--border-subtle)] text-[var(--text-primary)]">PERSONAL</th>
                    <th className="py-2 px-2.5 text-left border-r border-[var(--border-subtle)] text-[var(--text-secondary)]">CARGO</th>
                    
                    {/* INDICADORES */}
                    <th className="py-2 px-2 text-right border-r border-[var(--border-subtle)] bg-orange-500/10 text-orange-400">CUMP D1</th>
                    <th className="py-2 px-2 text-right border-r border-[var(--border-subtle)] bg-orange-500/10 text-orange-400">DOTAC</th>
                    
                    {/* PESOS */}
                    <th className="py-2 px-2 text-right border-r border-[var(--border-subtle)] bg-blue-500/10 text-blue-400">D1</th>
                    <th className="py-2 px-2 text-right border-r border-[var(--border-subtle)] bg-blue-500/10 text-blue-400">DOT</th>
                    <th className="py-2 px-2 text-right border-r border-[var(--border-subtle)] bg-blue-500/10 text-blue-400">CAL</th>
                    
                    {/* % ALCANCE */}
                    <th className="py-2 px-2 text-right border-r border-[var(--border-subtle)] bg-amber-500/10 text-amber-400">D1</th>
                    <th className="py-2 px-2 text-right border-r border-[var(--border-subtle)] bg-amber-500/10 text-amber-400">DOT</th>
                    <th className="py-2 px-2 text-right border-r border-[var(--border-subtle)] bg-amber-500/10 text-amber-400">CAL</th>
                    
                    {/* PUNTOS (%) */}
                    <th className="py-2 px-2 text-right border-r border-[var(--border-subtle)] bg-teal-500/10 text-teal-400">D1</th>
                    <th className="py-2 px-2 text-right border-r border-[var(--border-subtle)] bg-teal-500/10 text-teal-400">DOT</th>
                    <th className="py-2 px-2 text-right border-r border-[var(--border-subtle)] bg-teal-500/10 text-teal-400">CAL</th>
                    <th className="py-2 px-2 text-right border-r border-[var(--border-subtle)] bg-teal-500/20 text-teal-300">TOTAL</th>
                    
                    {/* RESULTADOS */}
                    <th className="py-2 px-2 text-right border-r border-[var(--border-subtle)] bg-orange-500/10 text-orange-400">BRUTO</th>
                    <th className="py-2 px-2 text-right border-r border-[var(--border-subtle)] bg-orange-500/10 text-orange-400">NETO</th>
                    
                    {/* SUBDIVIDIDO */}
                    <th className="py-2 px-2 text-right border-r border-[var(--border-subtle)] bg-sky-500/10 text-sky-400">EFECTIVO 60</th>
                    <th className="py-2 px-2 text-right bg-sky-500/10 text-sky-400">SODEXO 40</th>
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

                      return (
                        <tr
                          key={f.key}
                          className="bg-[var(--bg-surface)] hover:bg-[var(--surface-hover)] transition-colors whitespace-nowrap group"
                        >
                          {/* PERSONAL */}
                          <td
                            className="py-1.5 px-2.5 font-bold text-[var(--text-primary)] border-r border-b border-[var(--border-subtle)] cursor-pointer hover:text-cyan-400 transition-colors"
                            onClick={() => setBoletaPersona(f)}
                            title="Haz clic para ver la Boleta de Liquidación individual"
                          >
                            <div className="flex items-center gap-1.5">
                              <span>{f.alias || f.nombre.split(' ').slice(0, 2).join(' ')}</span>
                              {f.estado === 'CESE' && (
                                <span className="px-1 py-0.2 bg-[#DC2626] text-white text-[8.5px] font-black rounded-xs tracking-wider inline-block leading-tight">
                                  CESE
                                </span>
                              )}
                            </div>
                          </td>

                          {/* CARGO */}
                          <td
                            className="py-1.5 px-2.5 text-[10px] uppercase font-medium text-[var(--text-muted)] border-r border-b border-[var(--border-subtle)] max-w-[210px] truncate"
                            title={f.cargo}
                          >
                            {f.cargo}
                          </td>

                          {/* INDICADORES: CUMP D1 */}
                          <td
                            className={`py-1.5 px-2 text-right font-mono border-r border-b border-[var(--border-subtle)] ${
                              d1High
                                ? 'text-emerald-400 font-bold'
                                : d1Low
                                ? 'text-rose-400 font-bold'
                                : 'text-[var(--text-primary)] font-medium'
                            }`}
                          >
                            {Number(f.pctDia1Operativo || 0).toFixed(2)}%
                          </td>

                          {/* INDICADORES: DOTAC */}
                          <td
                            className={`py-1.5 px-2 text-right font-mono border-r border-b border-[var(--border-subtle)] ${
                              dotHigh
                                ? 'text-emerald-400 font-bold'
                                : dotLow
                                ? 'text-rose-400 font-bold'
                                : 'text-[var(--text-primary)] font-medium'
                            }`}
                          >
                            {Number(f.pctDotacionOperativo || 0).toFixed(2)}%
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
                            {Number(f.pesoCalidad || 10).toFixed(2)}%
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
                            {Number(f.puntosCalidad || 0).toFixed(2)}%
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
                          <td className="py-1.5 px-2 text-right font-mono font-bold text-emerald-400 border-r border-b border-[var(--border-subtle)]">
                            {Number(f.bonoNeto || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>

                          {/* SUBDIVIDIDO: EFECTIVO 60 */}
                          <td className="py-1.5 px-2 text-right font-mono font-bold text-cyan-300 border-r border-b border-[var(--border-subtle)]">
                            {Number(f.bonoEfectivo || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>

                          {/* SUBDIVIDIDO: SODEXO 40 */}
                          <td className="py-1.5 px-2 text-right font-mono font-bold text-amber-300 border-b border-[var(--border-subtle)]">
                            {Number(f.bonoSodexo || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                        </tr>
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
                    <th className="py-2.5 px-2.5 border-b border-[var(--border-subtle)]">CODIGPE-O GPE-</th>
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
                      <td className="py-2 px-2.5 font-mono font-bold text-cyan-400">{r.codigoGpe}</td>
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
                      <td className="py-2 px-2.5 font-bold text-[var(--text-primary)] max-w-[170px] truncate">{r.analistaReclutador}</td>
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
              <CardContent className="p-2 max-h-[520px] overflow-y-auto custom-scrollbar space-y-1">
                {filas.map((f) => {
                  const isSel = selectedPersona?.key === f.key
                  return (
                    <div
                      key={f.key}
                      onClick={() => setSelectedPersona(f)}
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
                        <span>{f.cargo}</span>
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
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-black text-[var(--text-primary)]">{selectedPersona.nombre}</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                      {selectedPersona.cargo}
                    </span>
                  </div>
                  <p className="text-xs text-[var(--text-muted)] mt-0.5">{selectedPersona.configCargo.descripcion}</p>
                </div>

                <div className="text-right">
                  <span className="text-[10px] uppercase font-bold text-[var(--text-muted)] block">Bono Neto Total</span>
                  <span className="text-2xl font-black font-mono text-emerald-400">{fmtMoney(selectedPersona.bonoNeto)}</span>
                </div>
              </CardHeader>

              <CardContent className="p-4 space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <div className="p-2.5 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
                    <span className="text-[10px] text-[var(--text-muted)] block">Día 1</span>
                    <strong className="text-sm font-mono text-white">{selectedPersona.dia1Real}</strong>
                    <span className="text-[10px] text-[var(--text-muted)]"> / {selectedPersona.dia1Meta}</span>
                    <div className="font-mono font-bold text-purple-300 mt-1">{fmtPct(selectedPersona.pctDia1Operativo)}</div>
                  </div>

                  <div className="p-2.5 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
                    <span className="text-[10px] text-[var(--text-muted)] block">Dotación</span>
                    <strong className="text-sm font-mono text-white">{selectedPersona.dotacionReal}</strong>
                    <span className="text-[10px] text-[var(--text-muted)]"> / {selectedPersona.rqReal}</span>
                    <div className="font-mono font-bold text-blue-300 mt-1">{fmtPct(selectedPersona.pctDotacionOperativo)}</div>
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

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => setBoletaPersona(selectedPersona)}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-cyan-600 hover:bg-cyan-500 text-white transition-all cursor-pointer shadow-xs"
                  >
                    <Eye size={14} />
                    <span>Abrir Boleta de Liquidación Completa</span>
                  </button>
                </div>
              </CardContent>
            </Card>
          </div>
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

      {/* ── MODAL SLIDE-OVER: BOLETA DE LIQUIDACIÓN INDIVIDUAL ──────────────── */}
      {boletaPersona && (
        <div className="fixed inset-0 z-50 flex items-center justify-center sm:justify-end bg-black/60 backdrop-blur-xs p-3 sm:p-6 animate-in fade-in">
          <div className="w-full max-w-lg bg-[var(--bg-surface)] border border-[var(--border-normal)] rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
            {/* Cabecera Boleta */}
            <div className="p-4 bg-[var(--bg-elevated)] border-b border-[var(--border-subtle)] flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                  <Banknote size={16} />
                </div>
                <div>
                  <h3 className="text-xs font-black uppercase tracking-wider text-[var(--text-primary)]">
                    Boleta de Liquidación RyS
                  </h3>
                  <span className="text-[10px] text-[var(--text-muted)] font-mono">
                    GEA Perú · Corte {periodoSeleccionado || 'Actual'}
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

            {/* Contenido Boleta */}
            <div className="p-5 overflow-y-auto space-y-4 custom-scrollbar text-xs">
              {/* Info Colaborador */}
              <div className="p-3.5 rounded-2xl bg-[var(--bg-base)] border border-[var(--border-subtle)] flex items-center justify-between">
                <div>
                  <div className="text-sm font-black text-[var(--text-primary)]">{boletaPersona.nombre}</div>
                  <div className="text-[11px] text-[var(--text-secondary)] mt-0.5">{boletaPersona.cargo}</div>
                  {boletaPersona.documento && (
                    <div className="text-[10px] text-[var(--text-muted)] font-mono mt-0.5">DNI: {boletaPersona.documento}</div>
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

              {/* Detalle por Indicador */}
              <div className="space-y-2">
                <span className="text-[10px] font-black uppercase text-[var(--text-muted)] tracking-wider block">
                  Desglose de Indicadores & Maqueta
                </span>

                <div className="space-y-1.5 font-mono text-[11px]">
                  {/* Día 1 */}
                  {boletaPersona.configCargo.pesoDia1 > 0 && (
                    <div className="p-2.5 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] flex items-center justify-between">
                      <div>
                        <div className="font-sans font-bold text-[var(--text-primary)]">% Cumplimiento Día 1</div>
                        <div className="text-[10px] text-[var(--text-muted)]">
                          {boletaPersona.evaluadoSobreEquipo ? 'Media Eq: ' : 'Logrado: '}
                          {fmtPct(boletaPersona.pctDia1ParaMaqueta || boletaPersona.pctDia1Operativo)} → {boletaPersona.alcanceDia1}% Alcance
                        </div>
                      </div>
                      <div className="text-right font-black text-purple-300">
                        {boletaPersona.alcanceDia1}% × {boletaPersona.configCargo.pesoDia1}% = {fmtPct(boletaPersona.puntosDia1)}
                      </div>
                    </div>
                  )}

                  {/* Dotación */}
                  {boletaPersona.configCargo.pesoDotacion > 0 && (
                    <div className="p-2.5 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] flex items-center justify-between">
                      <div>
                        <div className="font-sans font-bold text-[var(--text-primary)]">% Dotación (Ingresos OP)</div>
                        <div className="text-[10px] text-[var(--text-muted)]">
                          {boletaPersona.evaluadoSobreEquipo ? 'Media Eq: ' : 'Logrado: '}
                          {fmtPct(boletaPersona.pctDotacionParaMaqueta || boletaPersona.pctDotacionOperativo)} → {boletaPersona.alcanceDotacion}% Alcance
                        </div>
                      </div>
                      <div className="text-right font-black text-blue-300">
                        {boletaPersona.alcanceDotacion}% × {boletaPersona.configCargo.pesoDotacion}% = {fmtPct(boletaPersona.puntosDotacion)}
                      </div>
                    </div>
                  )}

                  {/* Calidad */}
                  {boletaPersona.configCargo.pesoCalidad > 0 && (
                    <div className="p-2.5 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] flex items-center justify-between">
                      <div>
                        <div className="font-sans font-bold text-[var(--text-primary)]">% Calidad (Aptos / Evaluados)</div>
                        <div className="text-[10px] text-[var(--text-muted)]">
                          Resultado: {fmtPct(boletaPersona.pctCalidadReal || 100)}
                          {boletaPersona.evaluadosReal > 0 ? ` (${boletaPersona.aptosReal || 0} Aptos / ${boletaPersona.evaluadosReal} Eval.)` : ''} 
                          → {boletaPersona.alcanceCalidad}% Alcance
                        </div>
                      </div>
                      <div className="text-right font-black text-emerald-300">
                        {boletaPersona.alcanceCalidad}% × {boletaPersona.configCargo.pesoCalidad}% = {fmtPct(boletaPersona.puntosCalidad)}
                      </div>
                    </div>
                  )}

                  {/* Procesos Adm */}
                  {boletaPersona.configCargo.pesoProcesosAdm > 0 && (
                    <div className="p-2.5 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] flex items-center justify-between">
                      <div>
                        <div className="font-sans font-bold text-[var(--text-primary)]">Procesos Administrativos</div>
                        <div className="text-[10px] text-[var(--text-muted)]">Alcance: {boletaPersona.alcanceProcesosAdm}%</div>
                      </div>
                      <div className="text-right font-black text-amber-300">
                        {boletaPersona.alcanceProcesosAdm}% × {boletaPersona.configCargo.pesoProcesosAdm}% = {fmtPct(boletaPersona.puntosProcesosAdm)}
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
            </div>

            {/* Pie Boleta con Botón Imprimir */}
            <div className="p-4 bg-[var(--bg-elevated)] border-t border-[var(--border-subtle)] flex items-center justify-between">
              <span className="text-[10px] text-[var(--text-muted)]">Emitido por GEA WFM Platform</span>
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
