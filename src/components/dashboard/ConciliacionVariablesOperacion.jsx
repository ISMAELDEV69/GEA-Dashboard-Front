import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import {
  ShieldCheck, Calculator, ArrowDownRight, TrendingDown, Users,
  DollarSign, CheckCircle2, UserX, AlertTriangle, Search, Filter,
  Download, RefreshCw, FileSpreadsheet, Eye, Edit3, X, Check,
  Clock, ArrowRight, ShieldAlert, Sparkles, Building2, UploadCloud,
  FileText, CheckSquare, AlertCircle, UserCheck, BarChart3, Layers, Award
} from 'lucide-react'
import * as XLSX from 'xlsx'
import {
  fetchVariablesValidacion,
  fetchPeriodosVariablesValidacion,
  updateVariableValidacionRow,
  procesarCesesBulkVariables,
  aprobarTodosPendientesVariables,
  guardarNuevasVariablesBulk,
  aplicarValidacionExcelBulk
} from '../../lib/dataService'

const soles = (v) =>
  `S/. ${Number(v || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export default function ConciliacionVariablesOperacion({ userProfile }) {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState([])
  const [periodos, setPeriodos] = useState(['202610'])
  const [periodoSel, setPeriodoSel] = useState('202610')

  // Sub-vistas ejecutivas: 'matriz' | 'responsables' | 'flujo_reduccion'
  const [subVista, setSubVista] = useState('matriz')

  // Filtros
  const [filtroTipoBono, setFiltroTipoBono] = useState('TODOS')
  const [filtroEstado, setFiltroEstado] = useState('TODOS')
  const [filtroCampana, setFiltroCampana] = useState('TODOS')
  const [filtroResponsable, setFiltroResponsable] = useState('TODOS')
  const [busqueda, setBusqueda] = useState('')

  // Paginación
  const [pagina, setPagina] = useState(1)
  const itemsPorPagina = 50

  // Modal de Bajas Masivas (Pegar texto)
  const [modalCesesOpen, setModalCesesOpen] = useState(false)
  const [dnisCesesTexto, setDnisCesesTexto] = useState('')
  const [motivoCese, setMotivoCese] = useState('BAJA EN OPERACIÓN')
  const [fechaCeseInput, setFechaCeseInput] = useState('')
  const [savingCeses, setSavingCeses] = useState(false)

  // Modal de Importación de Excel
  const [modalExcelOpen, setModalExcelOpen] = useState(false)
  const [excelTabModo, setExcelTabModo] = useState('bajas_operacion') // 'bajas_operacion' | 'nueva_nomina'
  const [archivoExcelNombre, setArchivoExcelNombre] = useState('')
  const [procesandoExcel, setProcesandoExcel] = useState(false)
  const [filasExcelParseadas, setFilasExcelParseadas] = useState([])
  const [resumenParseoExcel, setResumenParseoExcel] = useState(null)
  const [periodoNuevaNomina, setPeriodoNuevaNomina] = useState('202611')
  const fileInputRef = useRef(null)

  // Edición inline de una fila
  const [editandoFilaId, setEditandoFilaId] = useState(null)
  const [montoEditado, setMontoEditado] = useState(0)
  const [observacionEditada, setObservacionEditada] = useState('')
  const [guardandoFila, setGuardandoFila] = useState(false)

  // Notificación toast
  const [alerta, setAlerta] = useState(null)

  const mostrarAlerta = (mensaje, tipo = 'success') => {
    setAlerta({ mensaje, tipo })
    setTimeout(() => setAlerta(null), 6000)
  }

  // Cargar datos desde Supabase
  const cargarDatos = useCallback(async (p = periodoSel) => {
    setLoading(true)
    try {
      const [lista, perList] = await Promise.all([
        fetchVariablesValidacion(p),
        fetchPeriodosVariablesValidacion()
      ])
      setData(lista || [])
      if (perList && perList.length) {
        setPeriodos(prev => Array.from(new Set([...perList, ...prev])))
      }
    } catch (err) {
      console.error('Error al cargar validaciones:', err)
      mostrarAlerta(`Error al cargar datos: ${err.message}`, 'error')
    } finally {
      setLoading(false)
    }
  }, [periodoSel])

  useEffect(() => {
    cargarDatos(periodoSel)
  }, [periodoSel, cargarDatos])

  // Listado único de campañas para filtro
  const campanasDisponibles = useMemo(() => {
    const set = new Set()
    data.forEach(r => {
      if (r.campana) set.add(r.campana.trim().toUpperCase())
    })
    return Array.from(set).sort()
  }, [data])

  // Listado único de responsables que autorizaron para filtro
  const responsablesDisponibles = useMemo(() => {
    const set = new Set()
    data.forEach(r => {
      const resp = (r.validado_por || '').trim().toUpperCase()
      if (resp && !['WFM_ADMIN', 'WFM_ANALISTA', 'WFM_OPERACIONES'].includes(resp)) {
        set.add(resp)
      }
    })
    return Array.from(set).sort()
  }, [data])

  // Cálculos ejecutivos (VS Operación)
  const kpis = useMemo(() => {
    let enviadoTotal = 0
    let aprobadoTotal = 0
    let cesadosCount = 0
    let aprobadosCount = 0
    let pendientesCount = 0
    let observadosCount = 0

    const desglose = {
      BIENVENIDA: { enviado: 0, aprobado: 0, count: 0, cesados: 0 },
      PERMANENCIA: { enviado: 0, aprobado: 0, count: 0, cesados: 0 },
      ASISTENCIA_PERFECTA: { enviado: 0, aprobado: 0, count: 0, cesados: 0 }
    }

    data.forEach(r => {
      const env = Number(r.monto_enviado || 0)
      const apr = Number(r.monto_aprobado || 0)
      const st = r.estado_validacion || 'PENDIENTE'
      const tipo = r.tipo_bono || 'OTRO'

      enviadoTotal += env
      aprobadoTotal += apr

      if (st === 'CESADO') cesadosCount++
      else if (st === 'APROBADO') aprobadosCount++
      else if (st === 'OBSERVADO') observadosCount++
      else pendientesCount++

      if (desglose[tipo]) {
        desglose[tipo].enviado += env
        desglose[tipo].aprobado += apr
        desglose[tipo].count++
        if (st === 'CESADO') desglose[tipo].cesados++
      }
    })

    const ahorroTotal = Math.max(0, enviadoTotal - aprobadoTotal)
    const pctAhorro = enviadoTotal > 0 ? ((ahorroTotal / enviadoTotal) * 100).toFixed(1) : '0.0'

    return {
      totalRegistros: data.length,
      enviadoTotal,
      aprobadoTotal,
      ahorroTotal,
      pctAhorro,
      cesadosCount,
      aprobadosCount,
      pendientesCount,
      observadosCount,
      desglose
    }
  }, [data])

  // Métricas agregadas por responsable / supervisor que autorizó
  const metricasPorResponsable = useMemo(() => {
    const map = {}
    data.forEach(r => {
      let resp = (r.validado_por || '').trim().toUpperCase()
      if (!resp || ['WFM_ADMIN', 'WFM_ANALISTA', 'WFM_OPERACIONES'].includes(resp)) {
        resp = 'SIN ASIGNAR'
      }

      const apr = Number(r.monto_aprobado || 0)
      const env = Number(r.monto_enviado || 0)
      const st = r.estado_validacion || 'PENDIENTE'
      const tipo = r.tipo_bono || 'OTRO'

      if (!map[resp]) {
        map[resp] = {
          responsable: resp,
          bienvenida_casos: 0,
          bienvenida_monto: 0,
          permanencia_casos: 0,
          permanencia_monto: 0,
          asistencia_casos: 0,
          asistencia_monto: 0,
          total_casos_aprobados: 0,
          total_monto_aprobado: 0,
          total_cesados: 0,
          total_monto_enviado: 0,
          ahorro_generado: 0
        }
      }

      map[resp].total_monto_enviado += env

      if (st === 'CESADO') {
        map[resp].total_cesados++
        map[resp].ahorro_generado += env
      } else {
        map[resp].total_casos_aprobados++
        map[resp].total_monto_aprobado += apr

        if (tipo === 'BIENVENIDA') {
          map[resp].bienvenida_casos++
          map[resp].bienvenida_monto += apr
        } else if (tipo === 'PERMANENCIA') {
          map[resp].permanencia_casos++
          map[resp].permanencia_monto += apr
        } else if (tipo.includes('ASISTENCIA')) {
          map[resp].asistencia_casos++
          map[resp].asistencia_monto += apr
        }
      }
    })

    return Object.values(map).sort((a, b) => b.total_monto_aprobado - a.total_monto_aprobado)
  }, [data])

  // Datos para la tabla del Flujo de Reducción (Proyección vs Real vs Reducción)
  const flujoReduccion = useMemo(() => {
    const proyBienvenida = 43480
    const proyPermanencia = 88410
    const proyAsistencia = 78225
    const proyTotal = proyBienvenida + proyPermanencia + proyAsistencia

    const realBienvenida = kpis.desglose.BIENVENIDA.aprobado
    const realPermanencia = kpis.desglose.PERMANENCIA.aprobado
    const realAsistencia = kpis.desglose.ASISTENCIA_PERFECTA.aprobado
    const realTotal = kpis.aprobadoTotal

    const redBienvenidaPct = proyBienvenida > 0 ? (((proyBienvenida - realBienvenida) / proyBienvenida) * 100).toFixed(1) : '0.0'
    const redPermanenciaPct = proyPermanencia > 0 ? (((proyPermanencia - realPermanencia) / proyPermanencia) * 100).toFixed(1) : '0.0'
    const redAsistenciaPct = proyAsistencia > 0 ? (((proyAsistencia - realAsistencia) / proyAsistencia) * 100).toFixed(1) : '0.0'
    const redTotalPct = proyTotal > 0 ? (((proyTotal - realTotal) / proyTotal) * 100).toFixed(1) : '0.0'

    // Porcentaje de Ejecución / Pagado
    const ejecBienvenidaPct = proyBienvenida > 0 ? ((realBienvenida / proyBienvenida) * 100).toFixed(1) : '0.0'
    const ejecPermanenciaPct = proyPermanencia > 0 ? ((realPermanencia / proyPermanencia) * 100).toFixed(1) : '0.0'
    const ejecAsistenciaPct = proyAsistencia > 0 ? ((realAsistencia / proyAsistencia) * 100).toFixed(1) : '0.0'
    const ejecTotalPct = proyTotal > 0 ? ((realTotal / proyTotal) * 100).toFixed(1) : '0.0'

    return {
      proyBienvenida,
      proyPermanencia,
      proyAsistencia,
      proyTotal,
      realBienvenida,
      realPermanencia,
      realAsistencia,
      realTotal,
      redBienvenidaPct,
      redPermanenciaPct,
      redAsistenciaPct,
      redTotalPct,
      ejecBienvenidaPct,
      ejecPermanenciaPct,
      ejecAsistenciaPct,
      ejecTotalPct,
      ahorroBienvenida: proyBienvenida - realBienvenida,
      ahorroPermanencia: proyPermanencia - realPermanencia,
      ahorroAsistencia: proyAsistencia - realAsistencia,
      ahorroTotal: proyTotal - realTotal
    }
  }, [kpis])

  // Filtro de filas
  const filasFiltradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return data.filter(r => {
      if (filtroTipoBono !== 'TODOS' && r.tipo_bono !== filtroTipoBono) return false
      if (filtroEstado !== 'TODOS' && r.estado_validacion !== filtroEstado) return false
      if (filtroCampana !== 'TODOS' && (r.campana || '').toUpperCase() !== filtroCampana) return false
      if (filtroResponsable !== 'TODOS' && (r.validado_por || '').toUpperCase() !== filtroResponsable) return false

      if (q) {
        const doc = String(r.documento || '').toLowerCase()
        const nom = String(r.apellidos_nombres || '').toLowerCase()
        const camp = String(r.campana || '').toLowerCase()
        const resp = String(r.validado_por || '').toLowerCase()
        if (!doc.includes(q) && !nom.includes(q) && !camp.includes(q) && !resp.includes(q)) return false
      }

      return true
    })
  }, [data, filtroTipoBono, filtroEstado, filtroCampana, filtroResponsable, busqueda])

  // Paginación
  const totalPaginas = Math.ceil(filasFiltradas.length / itemsPorPagina) || 1
  const filasPaginadas = useMemo(() => {
    const inicio = (pagina - 1) * itemsPorPagina
    return filasFiltradas.slice(inicio, inicio + itemsPorPagina)
  }, [filasFiltradas, pagina])

  // Marcar cese individual rápido
  const handleToggleCese = async (fila) => {
    const esCesadoActualmente = fila.estado_validacion === 'CESADO'
    const nuevoEstado = esCesadoActualmente ? 'APROBADO' : 'CESADO'
    const nuevoMonto = esCesadoActualmente ? fila.monto_enviado : 0
    const nuevoMotivo = esCesadoActualmente ? null : 'CESE REPORTADO POR OPERACIÓN'

    try {
      await updateVariableValidacionRow(fila.id, {
        estado_validacion: nuevoEstado,
        monto_aprobado: nuevoMonto,
        motivo_ajuste: nuevoMotivo,
        validado_por: userProfile?.username || userProfile?.email || 'WFM_ANALISTA'
      })

      setData(prev =>
        prev.map(item =>
          item.id === fila.id
            ? { ...item, estado_validacion: nuevoEstado, monto_aprobado: nuevoMonto, motivo_ajuste: nuevoMotivo }
            : item
        )
      )

      mostrarAlerta(
        `${fila.apellidos_nombres} marcado como ${nuevoEstado} (Monto: ${soles(nuevoMonto)})`,
        nuevoEstado === 'CESADO' ? 'warning' : 'success'
      )
    } catch (err) {
      console.error(err)
      mostrarAlerta(`Error al actualizar estado: ${err.message}`, 'error')
    }
  }

  // Guardar edición inline
  const handleGuardarEdicionInline = async (fila) => {
    setGuardandoFila(true)
    try {
      const nuevoMonto = Number(montoEditado)
      const nuevoEstado = nuevoMonto === 0 ? 'CESADO' : nuevoMonto < fila.monto_enviado ? 'OBSERVADO' : 'APROBADO'

      await updateVariableValidacionRow(fila.id, {
        monto_aprobado: nuevoMonto,
        estado_validacion: nuevoEstado,
        observacion_operacion: observacionEditada,
        validado_por: userProfile?.username || userProfile?.email || 'WFM_ANALISTA'
      })

      setData(prev =>
        prev.map(item =>
          item.id === fila.id
            ? {
                ...item,
                monto_aprobado: nuevoMonto,
                estado_validacion: nuevoEstado,
                observacion_operacion: observacionEditada
              }
            : item
        )
      )

      setEditandoFilaId(null)
      mostrarAlerta(`Registro actualizado: ${soles(nuevoMonto)} (${nuevoEstado})`)
    } catch (err) {
      mostrarAlerta(`Error: ${err.message}`, 'error')
    } finally {
      setGuardandoFila(false)
    }
  }

  // Procesar ceses masivos desde texto
  const handleEjecutarCesesMasivos = async () => {
    const rawLines = dnisCesesTexto
      .split(/[\n,;]+/)
      .map(x => x.trim().replace(/\D/g, ''))
      .filter(x => x.length >= 7)

    if (!rawLines.length) {
      mostrarAlerta('Ingresa al menos un número de DNI válido.', 'warning')
      return
    }

    setSavingCeses(true)
    try {
      const res = await procesarCesesBulkVariables(periodoSel, rawLines, {
        motivo: motivoCese || 'BAJA REPORTADA POR OPERACIÓN',
        fecha_cese: fechaCeseInput || null,
        observacion: 'Conciliación y validación de variables RRHH/Operación',
        validado_por: userProfile?.username || userProfile?.email || 'WFM_ADMIN'
      })

      await cargarDatos(periodoSel)
      setModalCesesOpen(false)
      setDnisCesesTexto('')
      mostrarAlerta(`✓ ${res.count} registros de bajas procesados y descontados a S/. 0.00`)
    } catch (err) {
      mostrarAlerta(`Error al procesar ceses: ${err.message}`, 'error')
    } finally {
      setSavingCeses(false)
    }
  }

  // Aprobar todos los pendientes
  const handleAprobarTodosPendientes = async () => {
    if (kpis.pendientesCount === 0) {
      mostrarAlerta('No hay registros en estado Pendiente para aprobar.', 'info')
      return
    }

    const conf = window.confirm(
      `¿Deseas aprobar todos los ${kpis.pendientesCount} registros pendientes para el periodo ${periodoSel}?\n\nSe mantendrán los montos enviados intactos.`
    )
    if (!conf) return

    setLoading(true)
    try {
      const res = await aprobarTodosPendientesVariables(
        periodoSel,
        userProfile?.username || userProfile?.email || 'WFM_ADMIN'
      )
      await cargarDatos(periodoSel)
      mostrarAlerta(`✓ ${res.count} registros marcados como APROBADOS.`)
    } catch (err) {
      mostrarAlerta(`Error al aprobar: ${err.message}`, 'error')
    } finally {
      setLoading(false)
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // LÓGICA DE PARSEO Y CARGA DE ARCHIVO EXCEL
  // ─────────────────────────────────────────────────────────────────────────────
  const procesarArchivoExcel = (file) => {
    if (!file) return
    setArchivoExcelNombre(file.name)
    setProcesandoExcel(true)
    setFilasExcelParseadas([])
    setResumenParseoExcel(null)

    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const buffer = e.target.result
        const workbook = XLSX.read(buffer, { type: 'array' })
        const sheetNames = workbook.SheetNames

        if (excelTabModo === 'bajas_operacion') {
          // MODO 1: Buscar bajas/ceses en las hojas
          let allRows = []
          sheetNames.forEach(sheetName => {
            const sheet = workbook.Sheets[sheetName]
            const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' })
            allRows = allRows.concat(rows)
          })

          if (!allRows.length) {
            throw new Error('El archivo Excel está vacío o no contiene filas de datos.')
          }

          // Detectar columnas claves en la primera fila
          const sample = allRows[0]
          const keys = Object.keys(sample)

          const keyDni = keys.find(k => /dni|doc|cedula|ident/i.test(k))
          const keyEstado = keys.find(k => /estado|situacion|condicion|baja|cese|valida/i.test(k))
          const keyMotivo = keys.find(k => /motivo|observ|causa/i.test(k))
          const keyFechaCese = keys.find(k => /fecha.*cese|f_cese|fecha.*baja|egreso/i.test(k))
          const keyMontoAprobado = keys.find(k => /monto.*aprob|pago.*final|aprobado/i.test(k))

          if (!keyDni) {
            throw new Error('No se encontró una columna que contenga el DNI o Documento en el Excel.')
          }

          let cesadosDetectados = 0
          let activosDetectados = 0
          let observadosDetectados = 0

          const parsed = []
          allRows.forEach((r, idx) => {
            const rawDoc = String(r[keyDni] || '').trim().replace(/\D/g, '')
            if (rawDoc.length < 7) return

            const rawEstado = keyEstado ? String(r[keyEstado] || '').trim().toUpperCase() : ''
            const rawMotivo = keyMotivo ? String(r[keyMotivo] || '').trim() : ''
            const rawFechaCese = keyFechaCese ? String(r[keyFechaCese] || '').trim() : null
            const rawMonto = keyMontoAprobado ? Number(r[keyMontoAprobado]) : undefined

            // Determinar si es cese
            const esCese =
              rawEstado.includes('CESE') ||
              rawEstado.includes('BAJA') ||
              rawEstado.includes('DESVINC') ||
              rawEstado.includes('INACTIVO') ||
              rawEstado.includes('NO LABOR') ||
              rawEstado.includes('RENUNCIA') ||
              rawEstado.includes('DESPIDO') ||
              rawEstado === 'NO' ||
              rawEstado === '0'

            const esActivo =
              rawEstado.includes('ACTIVO') ||
              rawEstado.includes('APROB') ||
              rawEstado.includes('LABOR') ||
              rawEstado.includes('OK') ||
              rawEstado === 'SI' ||
              rawEstado === '1'

            let finalEstado = 'PENDIENTE'
            if (esCese) {
              finalEstado = 'CESADO'
              cesadosDetectados++
            } else if (esActivo) {
              finalEstado = 'APROBADO'
              activosDetectados++
            } else if (rawEstado) {
              finalEstado = 'OBSERVADO'
              observadosDetectados++
            }

            parsed.push({
              idTemporal: idx,
              documento: rawDoc,
              estado_validacion: finalEstado,
              monto_aprobado: esCese ? 0 : rawMonto,
              motivo_ajuste: rawMotivo || (esCese ? 'CESE VALIDADO POR OPERACIÓN' : ''),
              fecha_cese: rawFechaCese,
              observacion_operacion: rawMotivo
            })
          })

          setFilasExcelParseadas(parsed)
          setResumenParseoExcel({
            total: parsed.length,
            cesados: cesadosDetectados,
            activos: activosDetectados,
            observados: observadosDetectados
          })
        } else {
          // MODO 2: Nueva propuesta de variables completa
          let allRows = []

          sheetNames.forEach(sheetName => {
            const sheet = workbook.Sheets[sheetName]
            const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' })

            // Inferir tipo de bono según el nombre de la hoja
            let tipoBonoHoja = 'BIENVENIDA'
            const sNameUpper = sheetName.toUpperCase()
            if (sNameUpper.includes('PERMANENCIA')) tipoBonoHoja = 'PERMANENCIA'
            else if (sNameUpper.includes('ASISTENCIA') || sNameUpper.includes('PERFECTA')) tipoBonoHoja = 'ASISTENCIA_PERFECTA'
            else if (sNameUpper.includes('BIENVENIDA')) tipoBonoHoja = 'BIENVENIDA'

            rows.forEach((r, idx) => {
              const keys = Object.keys(r)
              const keyDni = keys.find(k => /dni|doc|cedula/i.test(k))
              const keyNom = keys.find(k => /nom|colaborador|apellido/i.test(k))
              const keyCamp = keys.find(k => /campa|cuenta|servicio/i.test(k))
              const keyCargo = keys.find(k => /cargo|puesto|rol/i.test(k))
              const keyMonto = keys.find(k => /monto|bono|total|importe/i.test(k))
              const keyFechaIng = keys.find(k => /ingreso|fecha_ing/i.test(k))
              const keyTipoBonoCol = keys.find(k => /tipo.*bono/i.test(k))

              const doc = keyDni ? String(r[keyDni] || '').trim().replace(/\D/g, '') : ''
              if (doc.length < 7) return

              const monto = keyMonto ? Number(r[keyMonto] || 0) : 100
              const tipoFinal = keyTipoBonoCol ? String(r[keyTipoBonoCol]).toUpperCase().trim() : tipoBonoHoja

              allRows.push({
                item_num: idx + 1,
                periodo: periodoNuevaNomina,
                tipo_bono: tipoFinal,
                documento: doc,
                apellidos_nombres: keyNom ? String(r[keyNom]).toUpperCase().trim() : 'COLABORADOR',
                cargo: keyCargo ? String(r[keyCargo]).toUpperCase().trim() : 'ASESOR',
                campana: keyCamp ? String(r[keyCamp]).toUpperCase().trim() : 'GENERAL',
                fecha_ingreso: keyFechaIng ? String(r[keyFechaIng]).trim() : null,
                monto_enviado: monto,
                monto_aprobado: monto,
                estado_validacion: 'PENDIENTE'
              })
            })
          })

          const totalSoles = allRows.reduce((s, r) => s + (r.monto_enviado || 0), 0)

          setFilasExcelParseadas(allRows)
          setResumenParseoExcel({
            total: allRows.length,
            montoTotal: totalSoles,
            porTipo: {
              BIENVENIDA: allRows.filter(r => r.tipo_bono.includes('BIENVENIDA')).length,
              PERMANENCIA: allRows.filter(r => r.tipo_bono.includes('PERMANENCIA')).length,
              ASISTENCIA_PERFECTA: allRows.filter(r => r.tipo_bono.includes('ASISTENCIA')).length
            }
          })
        }
      } catch (err) {
        console.error('Error parseando Excel:', err)
        mostrarAlerta(`Error al procesar Excel: ${err.message}`, 'error')
      } finally {
        setProcesandoExcel(false)
      }
    }

    reader.readAsArrayBuffer(file)
  }

  // Guardar bajas procesadas desde Excel
  const handleGuardarBajasDesdeExcel = async () => {
    if (!filasExcelParseadas.length) return
    setProcesandoExcel(true)
    try {
      const res = await aplicarValidacionExcelBulk(
        periodoSel,
        filasExcelParseadas,
        userProfile?.username || userProfile?.email || 'WFM_OPERACIONES'
      )
      await cargarDatos(periodoSel)
      setModalExcelOpen(false)
      setFilasExcelParseadas([])
      setResumenParseoExcel(null)
      mostrarAlerta(
        `✓ Validación aplicada: ${res.cesados} ceses descontados a S/. 0 y ${res.aprobados} registros aprobados.`
      )
    } catch (err) {
      mostrarAlerta(`Error al aplicar bajas: ${err.message}`, 'error')
    } finally {
      setProcesandoExcel(false)
    }
  }

  // Guardar nueva nómina completa desde Excel
  const handleGuardarNuevaNominaDesdeExcel = async () => {
    if (!filasExcelParseadas.length) return
    setProcesandoExcel(true)
    try {
      const res = await guardarNuevasVariablesBulk(periodoNuevaNomina, filasExcelParseadas)
      setPeriodos(prev => Array.from(new Set([periodoNuevaNomina, ...prev])))
      setPeriodoSel(periodoNuevaNomina)
      await cargarDatos(periodoNuevaNomina)
      setModalExcelOpen(false)
      setFilasExcelParseadas([])
      setResumenParseoExcel(null)
      mostrarAlerta(`✓ ${res.count} registros guardados exitosamente para el periodo ${periodoNuevaNomina}`)
    } catch (err) {
      mostrarAlerta(`Error al guardar nueva nómina: ${err.message}`, 'error')
    } finally {
      setProcesandoExcel(false)
    }
  }

  // Exportar a Excel
  const handleExportarExcel = (tipo = 'auditoria') => {
    let filasAExportar = []

    if (tipo === 'nomina_aprobada') {
      filasAExportar = data
        .filter(r => r.monto_aprobado > 0 && r.estado_validacion !== 'CESADO')
        .map((r, i) => ({
          'ITEM': i + 1,
          'PERIODO': r.periodo,
          'TIPO BONO': r.tipo_bono,
          'DNI': r.documento,
          'COLABORADOR': r.apellidos_nombres,
          'CARGO': r.cargo,
          'CAMPAÑA': r.campana,
          'FECHA INGRESO': r.fecha_ingreso,
          'MONTO APROBADO (S/)': Number(r.monto_aprobado || 0),
          'ESTADO': r.estado_validacion,
          'VALIDADO POR': r.validado_por || 'WFM',
          'FECHA VALIDACIÓN': r.fecha_validacion ? r.fecha_validacion.substring(0, 10) : ''
        }))
    } else {
      filasAExportar = data.map((r, i) => {
        const env = Number(r.monto_enviado || 0)
        const apr = Number(r.monto_aprobado || 0)
        const diff = env - apr
        return {
          'ITEM': i + 1,
          'PERIODO': r.periodo,
          'TIPO BONO': r.tipo_bono,
          'DNI': r.documento,
          'COLABORADOR': r.apellidos_nombres,
          'CARGO': r.cargo,
          'CAMPAÑA': r.campana,
          'FECHA INGRESO': r.fecha_ingreso,
          'MONTO ENVIADO WFM (S/)': env,
          'MONTO APROBADO OP (S/)': apr,
          'AHORRO / REDUCCIÓN (S/)': diff,
          '% REDUCCIÓN': env > 0 ? `${((diff / env) * 100).toFixed(0)}%` : '0%',
          'ESTADO VALIDACIÓN': r.estado_validacion,
          'MOTIVO AJUSTE / CESE': r.motivo_ajuste || '',
          'OBSERVACIONES': r.observacion_operacion || '',
          'VALIDADO POR': r.validado_por || ''
        }
      })
    }

    const ws = XLSX.utils.json_to_sheet(filasAExportar)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, tipo === 'nomina_aprobada' ? 'Nomina_Pagos' : 'Auditoria_VS')
    const fileName =
      tipo === 'nomina_aprobada'
        ? `GEA_Nomina_Aprobada_Variables_${periodoSel}.xlsx`
        : `GEA_Auditoria_Variables_VS_Operacion_${periodoSel}.xlsx`
    XLSX.writeFile(wb, fileName)
    mostrarAlerta(`✓ Archivo Excel generado: ${fileName}`)
  }

  return (
    <div className="space-y-6">
      {/* Toast Alert */}
      {alerta && (
        <div
          className={`fixed top-4 right-4 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl border text-sm animate-in fade-in slide-in-from-top-2 duration-200 ${
            alerta.tipo === 'error'
              ? 'bg-rose-950 border-rose-500/50 text-rose-200'
              : alerta.tipo === 'warning'
              ? 'bg-amber-950 border-amber-500/50 text-amber-200'
              : 'bg-emerald-950 border-emerald-500/50 text-emerald-200'
          }`}
        >
          {alerta.tipo === 'error' ? (
            <ShieldAlert size={18} className="text-rose-400" />
          ) : alerta.tipo === 'warning' ? (
            <AlertTriangle size={18} className="text-amber-400" />
          ) : (
            <CheckCircle2 size={18} className="text-emerald-400" />
          )}
          <span className="font-medium">{alerta.mensaje}</span>
          <button
            onClick={() => setAlerta(null)}
            className="text-white/60 hover:text-white p-1 rounded-lg"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Header del Módulo */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 bg-[var(--bg-surface)] p-5 rounded-2xl border border-[var(--border-normal)] shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 uppercase tracking-wider">
              Control de Calidad & Auditoría
            </span>
            <span className="text-xs text-[var(--text-muted)] font-mono">
              Tabla: variables_validacion_operacion
            </span>
          </div>
          <h2 className="text-xl font-bold text-[var(--text-primary)] mt-1 flex items-center gap-2">
            <ShieldCheck className="text-emerald-400" />
            Conciliación de Pagos Variables con Operación & RRHH
          </h2>
          <p className="text-xs text-[var(--text-muted)] mt-1 max-w-2xl">
            Cruce de lo calculado por Capacitación frente a la validación de ceses y bajas de Operaciones.
            Asegura que el personal inactivo no reciba bonos indebidos y audita el ahorro real para la gerencia.
          </p>
        </div>

        {/* Selector de Periodo y Acciones Principales */}
        <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
          <div className="flex items-center gap-2 bg-[var(--bg-base)] border border-[var(--border-normal)] rounded-xl px-3 py-1.5">
            <Clock size={15} className="text-[var(--accent)]" />
            <span className="text-xs font-bold text-[var(--text-muted)]">PERIODO:</span>
            <select
              value={periodoSel}
              onChange={(e) => {
                setPeriodoSel(e.target.value)
                setPagina(1)
              }}
              className="bg-transparent text-sm font-bold text-[var(--text-primary)] focus:outline-none cursor-pointer"
            >
              {periodos.map(p => (
                <option key={p} value={p} className="bg-slate-900 text-white">
                  {p}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={() => cargarDatos(periodoSel)}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-[var(--bg-elevated)] hover:bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border-normal)] transition-colors cursor-pointer"
            title="Recargar datos"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Actualizar
          </button>

          {/* BOTÓN: IMPORTAR EXCEL */}
          <button
            onClick={() => {
              setModalExcelOpen(true)
              setFilasExcelParseadas([])
              setResumenParseoExcel(null)
              setArchivoExcelNombre('')
            }}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-cyan-600 hover:bg-cyan-500 text-white shadow-lg shadow-cyan-600/20 transition-all cursor-pointer"
            title="Subir archivo Excel con bajas de operación o nueva nómina"
          >
            <UploadCloud size={15} />
            Importar Excel
          </button>

          {/* BOTÓN: PROCESAR CESES RÁPIDOS POR TEXTO */}
          <button
            onClick={() => setModalCesesOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-600/20 transition-all cursor-pointer"
            title="Pegar lista de DNIs cesados"
          >
            <UserX size={15} />
            Bajas por DNIs
          </button>

          {/* BOTÓN: APROBAR PENDIENTES */}
          <button
            onClick={handleAprobarTodosPendientes}
            disabled={kpis.pendientesCount === 0 || loading}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
              kpis.pendientesCount === 0
                ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/20 cursor-pointer'
            }`}
          >
            <CheckCircle2 size={15} />
            Aprobar Pendientes ({kpis.pendientesCount})
          </button>
        </div>
      </div>

      {/* ── CUADRO EJECUTIVO: COMPARATIVO VS (PARA SEBAS / GERENCIA) ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Enviado a Operación */}
        <div className="rounded-2xl border border-blue-500/20 bg-blue-500/5 p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-blue-400 uppercase tracking-wider flex items-center gap-1.5">
              <Calculator size={15} /> Calculado por WFM
            </span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300">
              {kpis.totalRegistros} casos
            </span>
          </div>
          <div className="my-2">
            <div className="text-2xl font-black text-[var(--text-primary)]">
              {soles(kpis.enviadoTotal)}
            </div>
            <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
              Total enviado a validar a Operaciones
            </p>
          </div>
          <div className="text-[11px] font-semibold text-blue-300/80 pt-2 border-t border-blue-500/15 flex items-center justify-between">
            <span>Propuesta Inicial 100%</span>
            <span>Periodo {periodoSel}</span>
          </div>
        </div>

        {/* KPI 2: Aprobado / Nómina Final */}
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 flex flex-col justify-between ring-1 ring-emerald-500/30">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
              <CheckCircle2 size={15} /> Nómina Aprobada (Pago)
            </span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300">
              {kpis.aprobadosCount} activos
            </span>
          </div>
          <div className="my-2">
            <div className="text-2xl font-black text-emerald-400">
              {soles(kpis.aprobadoTotal)}
            </div>
            <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
              Monto final autorizado para desembolso
            </p>
          </div>
          <div className="text-[11px] font-semibold text-emerald-400/80 pt-2 border-t border-emerald-500/15 flex items-center justify-between">
            <span>{kpis.pendientesCount} pendientes de revisión</span>
            <span className="font-mono">FINAL</span>
          </div>
        </div>

        {/* KPI 3: Ahorro / Reducción por Ceses */}
        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
              <TrendingDown size={15} /> Ahorro por Ceses
            </span>
            <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300">
              -{kpis.pctAhorro}%
            </span>
          </div>
          <div className="my-2">
            <div className="text-2xl font-black text-amber-400">
              {soles(kpis.ahorroTotal)}
            </div>
            <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
              Reducción directa por personal inactivo
            </p>
          </div>
          <div className="text-[11px] font-semibold text-amber-300/80 pt-2 border-t border-amber-500/15 flex items-center justify-between">
            <span>{kpis.cesadosCount} bajas confirmadas</span>
            <span className="text-emerald-400 font-bold">Ahorro Gerencial</span>
          </div>
        </div>

        {/* KPI 4: Estado Operativo de Casos */}
        <div className="rounded-2xl border border-purple-500/20 bg-purple-500/5 p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-purple-400 uppercase tracking-wider flex items-center gap-1.5">
              <Users size={15} /> Estado de los Casos
            </span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300">
              Auditoría
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 my-2 text-xs">
            <div className="bg-emerald-950/30 border border-emerald-500/20 rounded-lg p-1.5 text-center">
              <span className="text-[10px] text-emerald-400 block font-bold">APROBADOS</span>
              <span className="text-base font-black text-white">{kpis.aprobadosCount}</span>
            </div>
            <div className="bg-rose-950/30 border border-rose-500/20 rounded-lg p-1.5 text-center">
              <span className="text-[10px] text-rose-400 block font-bold">CESADOS</span>
              <span className="text-base font-black text-white">{kpis.cesadosCount}</span>
            </div>
            <div className="bg-amber-950/30 border border-amber-500/20 rounded-lg p-1.5 text-center">
              <span className="text-[10px] text-amber-400 block font-bold">PENDIENTES</span>
              <span className="text-base font-black text-white">{kpis.pendientesCount}</span>
            </div>
            <div className="bg-blue-950/30 border border-blue-500/20 rounded-lg p-1.5 text-center">
              <span className="text-[10px] text-blue-400 block font-bold">OBSERVADOS</span>
              <span className="text-base font-black text-white">{kpis.observadosCount}</span>
            </div>
          </div>
          <div className="text-[11px] font-semibold text-purple-300/80 pt-2 border-t border-purple-500/15 flex items-center justify-between">
            <span>Trazabilidad 100%</span>
            <span>DNI Validado</span>
          </div>
        </div>
      </div>

      {/* ── DESGLOSE COMPARATIVO POR TIPO DE VARIABLE (STRIP) ── */}
      <div className="bg-[var(--bg-surface)] p-4 rounded-2xl border border-[var(--border-normal)] space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h3 className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider flex items-center gap-2">
            <Sparkles size={14} className="text-amber-400" />
            Comparativo VS por Tipo de Bono Variable
          </h3>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleExportarExcel('auditoria')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 transition-colors cursor-pointer"
            >
              <FileSpreadsheet size={14} />
              Exportar Matriz VS (Auditoría)
            </button>
            <button
              onClick={() => handleExportarExcel('nomina_aprobada')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-blue-600/10 hover:bg-blue-600/20 text-blue-400 border border-blue-500/30 transition-colors cursor-pointer"
            >
              <Download size={14} />
              Exportar Nómina Aprobada (Banco)
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Bienvenida */}
          <div className="p-3.5 rounded-xl border border-slate-700/50 bg-slate-800/20 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-amber-400">1. BONO DE BIENVENIDA</span>
              <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 font-mono">
                {kpis.desglose.BIENVENIDA.count} casos
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2 my-2 text-xs">
              <div>
                <span className="text-[10px] text-slate-400 block">Enviado</span>
                <span className="font-bold text-white">{soles(kpis.desglose.BIENVENIDA.enviado)}</span>
              </div>
              <div>
                <span className="text-[10px] text-emerald-400 block">Aprobado</span>
                <span className="font-bold text-emerald-300">{soles(kpis.desglose.BIENVENIDA.aprobado)}</span>
              </div>
              <div>
                <span className="text-[10px] text-rose-400 block">Ahorro</span>
                <span className="font-bold text-rose-400">
                  {soles(kpis.desglose.BIENVENIDA.enviado - kpis.desglose.BIENVENIDA.aprobado)}
                </span>
              </div>
            </div>
            <div className="text-[10px] text-slate-400 flex items-center justify-between pt-1.5 border-t border-slate-700/50">
              <span>{kpis.desglose.BIENVENIDA.cesados} cesados</span>
              <span className="text-amber-400 font-medium">Primer Mes</span>
            </div>
          </div>

          {/* Permanencia */}
          <div className="p-3.5 rounded-xl border border-slate-700/50 bg-slate-800/20 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-purple-400">2. BONO DE PERMANENCIA</span>
              <span className="text-[10px] px-2 py-0.5 rounded bg-purple-500/10 text-purple-300 font-mono">
                {kpis.desglose.PERMANENCIA.count} casos
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2 my-2 text-xs">
              <div>
                <span className="text-[10px] text-slate-400 block">Enviado</span>
                <span className="font-bold text-white">{soles(kpis.desglose.PERMANENCIA.enviado)}</span>
              </div>
              <div>
                <span className="text-[10px] text-emerald-400 block">Aprobado</span>
                <span className="font-bold text-emerald-300">{soles(kpis.desglose.PERMANENCIA.aprobado)}</span>
              </div>
              <div>
                <span className="text-[10px] text-rose-400 block">Ahorro</span>
                <span className="font-bold text-rose-400">
                  {soles(kpis.desglose.PERMANENCIA.enviado - kpis.desglose.PERMANENCIA.aprobado)}
                </span>
              </div>
            </div>
            <div className="text-[10px] text-slate-400 flex items-center justify-between pt-1.5 border-t border-slate-700/50">
              <span>{kpis.desglose.PERMANENCIA.cesados} cesados</span>
              <span className="text-purple-400 font-medium">Meses 1 a 4</span>
            </div>
          </div>

          {/* Asistencia Perfecta */}
          <div className="p-3.5 rounded-xl border border-slate-700/50 bg-slate-800/20 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-cyan-400">3. ASISTENCIA PERFECTA</span>
              <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-300 font-mono">
                {kpis.desglose.ASISTENCIA_PERFECTA.count} casos
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2 my-2 text-xs">
              <div>
                <span className="text-[10px] text-slate-400 block">Enviado</span>
                <span className="font-bold text-white">{soles(kpis.desglose.ASISTENCIA_PERFECTA.enviado)}</span>
              </div>
              <div>
                <span className="text-[10px] text-emerald-400 block">Aprobado</span>
                <span className="font-bold text-emerald-300">{soles(kpis.desglose.ASISTENCIA_PERFECTA.aprobado)}</span>
              </div>
              <div>
                <span className="text-[10px] text-rose-400 block">Ahorro</span>
                <span className="font-bold text-rose-400">
                  {soles(kpis.desglose.ASISTENCIA_PERFECTA.enviado - kpis.desglose.ASISTENCIA_PERFECTA.aprobado)}
                </span>
              </div>
            </div>
            <div className="text-[10px] text-slate-400 flex items-center justify-between pt-1.5 border-t border-slate-700/50">
              <span>{kpis.desglose.ASISTENCIA_PERFECTA.cesados} cesados</span>
              <span className="text-cyan-400 font-medium">0 Faltas en Capa</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── SELECTOR DE SUB-VISTAS EJECUTIVAS ── */}
      <div className="flex items-center gap-2 border-b border-[var(--border-normal)] pb-2 pt-1 overflow-x-auto">
        <button
          onClick={() => setSubVista('matriz')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            subVista === 'matriz'
              ? 'bg-[var(--accent)] text-white shadow-md shadow-[var(--accent)]/20'
              : 'bg-[var(--bg-surface)] text-[var(--text-muted)] hover:text-white border border-[var(--border-normal)]'
          }`}
        >
          <Layers size={15} />
          Matriz Detallada ({filasFiltradas.length})
        </button>

        <button
          onClick={() => setSubVista('responsables')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            subVista === 'responsables'
              ? 'bg-purple-600 text-white shadow-md shadow-purple-600/20'
              : 'bg-[var(--bg-surface)] text-[var(--text-muted)] hover:text-white border border-[var(--border-normal)]'
          }`}
        >
          <Users size={15} />
          Distribución por Responsable ({metricasPorResponsable.length})
        </button>

        <button
          onClick={() => setSubVista('flujo_reduccion')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            subVista === 'flujo_reduccion'
              ? 'bg-amber-600 text-white shadow-md shadow-amber-600/20'
              : 'bg-[var(--bg-surface)] text-[var(--text-muted)] hover:text-white border border-[var(--border-normal)]'
          }`}
        >
          <TrendingDown size={15} />
          Flujo de Reducción Gerencial (Proyección vs Real)
        </button>
      </div>

      {/* ── VISTA: FLUJO DE REDUCCIÓN GERENCIAL (PROYECCIÓN VS REAL) ── */}
      {subVista === 'flujo_reduccion' && (
        <div className="bg-[var(--bg-surface)] p-6 rounded-2xl border border-[var(--border-normal)] space-y-4 shadow-sm animate-in fade-in duration-200">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 border-b border-[var(--border-normal)] pb-4">
            <div>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-amber-500/10 text-amber-400 border border-amber-500/20 uppercase tracking-wider">
                Auditoría Presupuestal
              </span>
              <h3 className="text-lg font-bold text-[var(--text-primary)] mt-1 flex items-center gap-2">
                <TrendingDown className="text-amber-400" size={20} />
                Flujo y Matriz de Reducción Gerencial
              </h3>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                Comparativo de lo inicialmente proyectado para desembolso frente al monto real validado tras descartar ceses e inasistencias.
              </p>
            </div>
            <div className="text-right">
              <span className="text-xs text-[var(--text-muted)] block">Ahorro Gerencial Consolidado</span>
              <span className="text-2xl font-black text-emerald-400">{soles(flujoReduccion.ahorroTotal)}</span>
              <span className="text-[11px] font-bold text-amber-400 block">(-{flujoReduccion.redTotalPct}% de reducción)</span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left border-collapse border border-slate-700/60 rounded-xl overflow-hidden">
              <thead>
                <tr className="bg-slate-900/90 text-white font-bold uppercase tracking-wider text-xs border-b border-slate-700">
                  <th className="px-4 py-3.5 border-r border-slate-700/60 text-slate-300">ESTADO</th>
                  <th className="px-4 py-3.5 border-r border-slate-700/60 text-right text-amber-400">BONO DE BIENVENIDA</th>
                  <th className="px-4 py-3.5 border-r border-slate-700/60 text-right text-purple-400">BONO DE PERMANENCIA</th>
                  <th className="px-4 py-3.5 border-r border-slate-700/60 text-right text-cyan-400">BONO DE ASISTENCIA</th>
                  <th className="px-4 py-3.5 text-right text-emerald-400 bg-slate-950/60">TOTAL CONSOLIDADO</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80 font-mono text-xs">
                {/* Fila Proyección */}
                <tr className="hover:bg-slate-800/30 transition-colors">
                  <td className="px-4 py-3.5 font-sans font-bold text-slate-200 border-r border-slate-700/60 uppercase">
                    PROYECCIÓN
                  </td>
                  <td className="px-4 py-3.5 text-right font-bold text-slate-300 border-r border-slate-700/60">
                    {soles(flujoReduccion.proyBienvenida)}
                  </td>
                  <td className="px-4 py-3.5 text-right font-bold text-slate-300 border-r border-slate-700/60">
                    {soles(flujoReduccion.proyPermanencia)}
                  </td>
                  <td className="px-4 py-3.5 text-right font-bold text-slate-300 border-r border-slate-700/60">
                    {soles(flujoReduccion.proyAsistencia)}
                  </td>
                  <td className="px-4 py-3.5 text-right font-black text-white bg-slate-950/40">
                    {soles(flujoReduccion.proyTotal)}
                  </td>
                </tr>

                {/* Fila Real */}
                <tr className="hover:bg-slate-800/30 transition-colors bg-emerald-950/10">
                  <td className="px-4 py-3.5 font-sans font-bold text-emerald-400 border-r border-slate-700/60 uppercase flex items-center gap-1.5">
                    <CheckCircle2 size={14} />
                    REAL (VALIDADO)
                  </td>
                  <td className="px-4 py-3.5 text-right font-bold text-emerald-400 border-r border-slate-700/60">
                    {soles(flujoReduccion.realBienvenida)}
                  </td>
                  <td className="px-4 py-3.5 text-right font-bold text-emerald-400 border-r border-slate-700/60">
                    {soles(flujoReduccion.realPermanencia)}
                  </td>
                  <td className="px-4 py-3.5 text-right font-bold text-emerald-400 border-r border-slate-700/60">
                    {soles(flujoReduccion.realAsistencia)}
                  </td>
                  <td className="px-4 py-3.5 text-right font-black text-emerald-300 bg-slate-950/40">
                    {soles(flujoReduccion.realTotal)}
                  </td>
                </tr>

                {/* Fila Reducción */}
                <tr className="hover:bg-slate-800/30 transition-colors bg-amber-950/15">
                  <td className="px-4 py-3.5 font-sans font-bold text-amber-400 border-r border-slate-700/60 uppercase flex items-center gap-1.5">
                    <TrendingDown size={14} />
                    REDUCCIÓN (%)
                  </td>
                  <td className="px-4 py-3.5 text-right font-black text-amber-400 border-r border-slate-700/60">
                    {flujoReduccion.redBienvenidaPct}% <span className="text-[10px] text-slate-400 font-sans block">({flujoReduccion.ejecBienvenidaPct}% ejec.)</span>
                  </td>
                  <td className="px-4 py-3.5 text-right font-black text-amber-400 border-r border-slate-700/60">
                    {flujoReduccion.redPermanenciaPct}% <span className="text-[10px] text-slate-400 font-sans block">({flujoReduccion.ejecPermanenciaPct}% ejec.)</span>
                  </td>
                  <td className="px-4 py-3.5 text-right font-black text-amber-400 border-r border-slate-700/60">
                    {flujoReduccion.redAsistenciaPct}% <span className="text-[10px] text-slate-400 font-sans block">({flujoReduccion.ejecAsistenciaPct}% ejec.)</span>
                  </td>
                  <td className="px-4 py-3.5 text-right font-black text-amber-300 bg-slate-950/40">
                    {flujoReduccion.redTotalPct}% <span className="text-[10px] text-slate-400 font-sans block">({flujoReduccion.ejecTotalPct}% ejec.)</span>
                  </td>
                </tr>

                {/* Fila Ahorro Total */}
                <tr className="hover:bg-slate-800/30 transition-colors bg-slate-900/60 font-bold border-t-2 border-slate-700">
                  <td className="px-4 py-3.5 font-sans font-bold text-rose-300 border-r border-slate-700/60 uppercase">
                    AHORRO TOTAL (S/)
                  </td>
                  <td className="px-4 py-3.5 text-right text-rose-300 border-r border-slate-700/60">
                    {soles(flujoReduccion.ahorroBienvenida)}
                  </td>
                  <td className="px-4 py-3.5 text-right text-rose-300 border-r border-slate-700/60">
                    {soles(flujoReduccion.ahorroPermanencia)}
                  </td>
                  <td className="px-4 py-3.5 text-right text-rose-300 border-r border-slate-700/60">
                    {soles(flujoReduccion.ahorroAsistencia)}
                  </td>
                  <td className="px-4 py-3.5 text-right font-black text-emerald-400 bg-slate-950/60 text-sm">
                    {soles(flujoReduccion.ahorroTotal)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="p-3 bg-slate-900/60 border border-slate-800 rounded-xl text-xs text-slate-400 flex items-center justify-between">
            <span>ℹ️ Datos sincronizados con Supabase y conciliados tras la exclusión de cesados de permanencia confirmados.</span>
            <button
              onClick={() => setSubVista('matriz')}
              className="text-cyan-400 hover:text-cyan-300 font-bold flex items-center gap-1 cursor-pointer"
            >
              Ver casos individuales en la matriz <ArrowRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* ── VISTA: DISTRIBUCIÓN POR RESPONSABLE / AUTORIZADOR ── */}
      {subVista === 'responsables' && (
        <div className="bg-[var(--bg-surface)] p-6 rounded-2xl border border-[var(--border-normal)] space-y-4 shadow-sm animate-in fade-in duration-200">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 border-b border-[var(--border-normal)] pb-4">
            <div>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-purple-500/10 text-purple-400 border border-purple-500/20 uppercase tracking-wider">
                Control Operativo & Autorizaciones
              </span>
              <h3 className="text-lg font-bold text-[var(--text-primary)] mt-1 flex items-center gap-2">
                <Users className="text-purple-400" size={20} />
                Distribución y Autorizaciones por Responsable
              </h3>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                Mapeo exacto de los supervisores y responsables que autorizaron la nómina de bonos en Operaciones.
              </p>
            </div>
            <div className="text-right">
              <span className="text-xs text-[var(--text-muted)] block">Total Responsables</span>
              <span className="text-xl font-black text-purple-400">{metricasPorResponsable.length} autorizadores</span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse border border-[var(--border-normal)] rounded-xl overflow-hidden">
              <thead>
                <tr className="bg-[var(--bg-base)] text-[var(--text-muted)] font-bold uppercase tracking-wider text-[11px] border-b border-[var(--border-normal)]">
                  <th className="px-3.5 py-3">#</th>
                  <th className="px-3.5 py-3">Responsable (Autorizó)</th>
                  <th className="px-3.5 py-3 text-right">Bono Bienvenida</th>
                  <th className="px-3.5 py-3 text-right">Bono Permanencia</th>
                  <th className="px-3.5 py-3 text-right">Asistencia Perfecta</th>
                  <th className="px-3.5 py-3 text-center">Casos Aprobados</th>
                  <th className="px-3.5 py-3 text-right text-emerald-400">Total Autorizado (S/)</th>
                  <th className="px-3.5 py-3 text-center">% Part.</th>
                  <th className="px-3.5 py-3 text-center">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-normal)] font-mono">
                {metricasPorResponsable.map((item, idx) => {
                  const partPct = kpis.aprobadoTotal > 0
                    ? ((item.total_monto_aprobado / kpis.aprobadoTotal) * 100).toFixed(1)
                    : '0.0'

                  return (
                    <tr key={item.responsable} className="hover:bg-[var(--bg-elevated)]/50 transition-colors">
                      <td className="px-3.5 py-2.5 text-center text-slate-500">{idx + 1}</td>
                      <td className="px-3.5 py-2.5 font-sans font-bold text-white flex items-center gap-2">
                        <UserCheck size={14} className="text-cyan-400" />
                        {item.responsable}
                      </td>
                      <td className="px-3.5 py-2.5 text-right text-amber-300">
                        {soles(item.bienvenida_monto)} <span className="text-[10px] text-slate-400 font-sans block">({item.bienvenida_casos} casos)</span>
                      </td>
                      <td className="px-3.5 py-2.5 text-right text-purple-300">
                        {soles(item.permanencia_monto)} <span className="text-[10px] text-slate-400 font-sans block">({item.permanencia_casos} casos)</span>
                      </td>
                      <td className="px-3.5 py-2.5 text-right text-cyan-300">
                        {soles(item.asistencia_monto)} <span className="text-[10px] text-slate-400 font-sans block">({item.asistencia_casos} casos)</span>
                      </td>
                      <td className="px-3.5 py-2.5 text-center font-bold text-white">
                        {item.total_casos_aprobados}
                      </td>
                      <td className="px-3.5 py-2.5 text-right font-black text-emerald-400 text-sm">
                        {soles(item.total_monto_aprobado)}
                      </td>
                      <td className="px-3.5 py-2.5 text-center font-bold text-slate-300">
                        {partPct}%
                      </td>
                      <td className="px-3.5 py-2.5 text-center">
                        <button
                          onClick={() => {
                            setFiltroResponsable(item.responsable)
                            setSubVista('matriz')
                          }}
                          className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-cyan-600/20 hover:bg-cyan-600/40 text-cyan-300 border border-cyan-500/30 transition-all cursor-pointer"
                        >
                          Ver Casos
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── BARRA DE BÚSQUEDA Y FILTROS ── */}
      <div className="bg-[var(--bg-surface)] p-4 rounded-2xl border border-[var(--border-normal)] flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[280px]">
          {/* Buscador */}
          <div className="relative flex-1 min-w-[200px]">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              type="text"
              value={busqueda}
              onChange={(e) => {
                setBusqueda(e.target.value)
                setPagina(1)
              }}
              placeholder="Buscar por DNI, Nombre, Campaña o Responsable..."
              className="w-full pl-9 pr-3 py-1.5 bg-[var(--bg-base)] border border-[var(--border-normal)] rounded-xl text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
            />
            {busqueda && (
              <button
                onClick={() => setBusqueda('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
              >
                <X size={13} />
              </button>
            )}
          </div>

          {/* Filtro Tipo Bono */}
          <div className="flex items-center gap-1.5 bg-[var(--bg-base)] border border-[var(--border-normal)] rounded-xl px-2.5 py-1.5">
            <span className="text-[11px] font-bold text-[var(--text-muted)] uppercase">Bono:</span>
            <select
              value={filtroTipoBono}
              onChange={(e) => {
                setFiltroTipoBono(e.target.value)
                setPagina(1)
              }}
              className="bg-transparent text-xs font-semibold text-[var(--text-primary)] focus:outline-none cursor-pointer"
            >
              <option value="TODOS" className="bg-slate-900">TODOS LOS BONOS</option>
              <option value="BIENVENIDA" className="bg-slate-900">BIENVENIDA</option>
              <option value="PERMANENCIA" className="bg-slate-900">PERMANENCIA</option>
              <option value="ASISTENCIA_PERFECTA" className="bg-slate-900">ASISTENCIA PERFECTA</option>
            </select>
          </div>

          {/* Filtro Estado */}
          <div className="flex items-center gap-1.5 bg-[var(--bg-base)] border border-[var(--border-normal)] rounded-xl px-2.5 py-1.5">
            <span className="text-[11px] font-bold text-[var(--text-muted)] uppercase">Estado:</span>
            <select
              value={filtroEstado}
              onChange={(e) => {
                setFiltroEstado(e.target.value)
                setPagina(1)
              }}
              className="bg-transparent text-xs font-semibold text-[var(--text-primary)] focus:outline-none cursor-pointer"
            >
              <option value="TODOS" className="bg-slate-900">TODOS LOS ESTADOS</option>
              <option value="PENDIENTE" className="bg-slate-900">PENDIENTE</option>
              <option value="APROBADO" className="bg-slate-900">APROBADO</option>
              <option value="CESADO" className="bg-slate-900">CESADO</option>
              <option value="OBSERVADO" className="bg-slate-900">OBSERVADO</option>
            </select>
          </div>

          {/* Filtro Campaña */}
          <div className="flex items-center gap-1.5 bg-[var(--bg-base)] border border-[var(--border-normal)] rounded-xl px-2.5 py-1.5">
            <span className="text-[11px] font-bold text-[var(--text-muted)] uppercase">Campaña:</span>
            <select
              value={filtroCampana}
              onChange={(e) => {
                setFiltroCampana(e.target.value)
                setPagina(1)
              }}
              className="bg-transparent text-xs font-semibold text-[var(--text-primary)] focus:outline-none cursor-pointer"
            >
              <option value="TODOS" className="bg-slate-900">TODAS LAS CAMPAÑAS</option>
              {campanasDisponibles.map(c => (
                <option key={c} value={c} className="bg-slate-900">
                  {c}
                </option>
              ))}
            </select>
          </div>

          {/* Filtro Responsable que autorizó */}
          <div className="flex items-center gap-1.5 bg-[var(--bg-base)] border border-[var(--border-normal)] rounded-xl px-2.5 py-1.5">
            <span className="text-[11px] font-bold text-cyan-400 uppercase">Autorizó:</span>
            <select
              value={filtroResponsable}
              onChange={(e) => {
                setFiltroResponsable(e.target.value)
                setPagina(1)
              }}
              className="bg-transparent text-xs font-semibold text-[var(--text-primary)] focus:outline-none cursor-pointer"
            >
              <option value="TODOS" className="bg-slate-900">TODOS LOS RESPONSABLES</option>
              {responsablesDisponibles.map(r => (
                <option key={r} value={r} className="bg-slate-900">
                  {r}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Contador de resultados */}
        <div className="text-xs font-medium text-[var(--text-muted)] shrink-0">
          Mostrando <strong className="text-[var(--text-primary)]">{filasFiltradas.length}</strong> de {data.length} registros
        </div>
      </div>

      {/* ── TABLA PRINCIPAL DE VALIDACIÓN ── */}
      <div className="bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-normal)] overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="border-b border-[var(--border-normal)] bg-[var(--bg-base)] text-[var(--text-muted)] font-bold uppercase tracking-wider text-[11px]">
                <th className="px-3.5 py-3 w-12 text-center">#</th>
                <th className="px-3.5 py-3">Documento (DNI)</th>
                <th className="px-3.5 py-3">Colaborador</th>
                <th className="px-3.5 py-3">Campaña / Cargo</th>
                <th className="px-3.5 py-3">Tipo Bono</th>
                <th className="px-3.5 py-3 text-right">Enviado (S/)</th>
                <th className="px-3.5 py-3 text-right text-emerald-400">Aprobado (S/)</th>
                <th className="px-3.5 py-3 text-right text-amber-400">Ahorro (S/)</th>
                <th className="px-3.5 py-3 text-center">Estado Validación</th>
                <th className="px-3.5 py-3">Motivo / Obs. Operación</th>
                <th className="px-3.5 py-3">Autorizado Por</th>
                <th className="px-3.5 py-3 text-center">Acciones de Ajuste</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-normal)]">
              {loading ? (
                <tr>
                  <td colSpan={12} className="py-12 text-center text-[var(--text-muted)]">
                    <RefreshCw className="animate-spin inline-block mr-2" size={18} />
                    Cargando base de validación...
                  </td>
                </tr>
              ) : filasPaginadas.length === 0 ? (
                <tr>
                  <td colSpan={12} className="py-12 text-center text-[var(--text-muted)]">
                    No se encontraron registros que coincidan con los filtros seleccionados.
                  </td>
                </tr>
              ) : (
                filasPaginadas.map((r, index) => {
                  const env = Number(r.monto_enviado || 0)
                  const apr = Number(r.monto_aprobado || 0)
                  const ahorro = env - apr
                  const esCesado = r.estado_validacion === 'CESADO'
                  const esAprobado = r.estado_validacion === 'APROBADO'
                  const esEditando = editandoFilaId === r.id

                  return (
                    <tr
                      key={r.id}
                      className={`hover:bg-[var(--bg-elevated)]/50 transition-colors ${
                        esCesado ? 'bg-rose-950/15 opacity-80' : ''
                      }`}
                    >
                      {/* # Item */}
                      <td className="px-3.5 py-2.5 text-center text-[var(--text-muted)] font-mono text-[10px]">
                        {(pagina - 1) * itemsPorPagina + index + 1}
                      </td>

                      {/* DNI */}
                      <td className="px-3.5 py-2.5 font-mono font-bold text-[var(--text-primary)]">
                        {r.documento}
                      </td>

                      {/* Colaborador */}
                      <td className="px-3.5 py-2.5 font-semibold text-[var(--text-primary)] max-w-[220px] truncate" title={r.apellidos_nombres}>
                        {r.apellidos_nombres}
                      </td>

                      {/* Campaña y Cargo */}
                      <td className="px-3.5 py-2.5">
                        <div className="font-semibold text-slate-300">{r.campana || '—'}</div>
                        <div className="text-[10px] text-[var(--text-muted)] truncate max-w-[150px]">{r.cargo || ''}</div>
                      </td>

                      {/* Tipo Bono */}
                      <td className="px-3.5 py-2.5">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                            r.tipo_bono === 'BIENVENIDA'
                              ? 'bg-amber-500/10 text-amber-300 border border-amber-500/20'
                              : r.tipo_bono === 'PERMANENCIA'
                              ? 'bg-purple-500/10 text-purple-300 border border-purple-500/20'
                              : 'bg-cyan-500/10 text-cyan-300 border border-cyan-500/20'
                          }`}
                        >
                          {r.tipo_bono}
                        </span>
                      </td>

                      {/* Monto Enviado */}
                      <td className="px-3.5 py-2.5 text-right font-mono font-semibold text-[var(--text-muted)]">
                        {soles(env)}
                      </td>

                      {/* Monto Aprobado */}
                      <td className="px-3.5 py-2.5 text-right font-mono font-black">
                        {esEditando ? (
                          <input
                            type="number"
                            step="10"
                            value={montoEditado}
                            onChange={(e) => setMontoEditado(e.target.value)}
                            className="w-20 px-1.5 py-0.5 text-right bg-slate-900 border border-emerald-500 rounded text-emerald-400 font-bold focus:outline-none"
                            autoFocus
                          />
                        ) : (
                          <span className={apr === 0 ? 'text-rose-400' : 'text-emerald-400'}>
                            {soles(apr)}
                          </span>
                        )}
                      </td>

                      {/* Ahorro / Variación */}
                      <td className="px-3.5 py-2.5 text-right font-mono font-bold">
                        {ahorro > 0 ? (
                          <span className="text-amber-400 font-bold">
                            -{soles(ahorro)}
                          </span>
                        ) : (
                          <span className="text-slate-600 font-normal">S/. 0.00</span>
                        )}
                      </td>

                      {/* Estado Validación */}
                      <td className="px-3.5 py-2.5 text-center">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                            esCesado
                              ? 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
                              : esAprobado
                              ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                              : r.estado_validacion === 'OBSERVADO'
                              ? 'bg-blue-500/15 text-blue-300 border border-blue-500/30'
                              : 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                          }`}
                        >
                          {esCesado && <UserX size={11} />}
                          {esAprobado && <CheckCircle2 size={11} />}
                          {r.estado_validacion || 'PENDIENTE'}
                        </span>
                      </td>

                      {/* Motivo / Obs Operación */}
                      <td className="px-3.5 py-2.5 max-w-[200px]">
                        {esEditando ? (
                          <input
                            type="text"
                            value={observacionEditada}
                            onChange={(e) => setObservacionEditada(e.target.value)}
                            placeholder="Motivo u observación..."
                            className="w-full px-1.5 py-0.5 bg-slate-900 border border-slate-700 rounded text-white text-[11px] focus:outline-none"
                          />
                        ) : (
                          <div className="text-[11px] text-[var(--text-muted)] truncate" title={r.motivo_ajuste || r.observacion_operacion || ''}>
                            {r.motivo_ajuste || r.observacion_operacion || <span className="text-slate-600">—</span>}
                          </div>
                        )}
                      </td>

                      {/* Autorizado Por */}
                      <td className="px-3.5 py-2.5">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700">
                          <UserCheck size={11} className="text-cyan-400" />
                          {r.validado_por || 'OPERACIONES'}
                        </span>
                      </td>

                      {/* Acciones */}
                      <td className="px-3.5 py-2.5 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {esEditando ? (
                            <>
                              <button
                                onClick={() => handleGuardarEdicionInline(r)}
                                disabled={guardandoFila}
                                className="p-1 rounded bg-emerald-600 text-white hover:bg-emerald-500"
                                title="Guardar cambios"
                              >
                                <Check size={13} />
                              </button>
                              <button
                                onClick={() => setEditandoFilaId(null)}
                                className="p-1 rounded bg-slate-700 text-slate-300 hover:bg-slate-600"
                                title="Cancelar"
                              >
                                <X size={13} />
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={() => handleToggleCese(r)}
                                className={`px-2 py-1 rounded text-[10px] font-bold transition-all cursor-pointer ${
                                  esCesado
                                    ? 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/30'
                                    : 'bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 border border-rose-500/30'
                                }`}
                                title={esCesado ? 'Reactivar y autorizar pago' : 'Marcar cese y descontar bono'}
                              >
                                {esCesado ? 'Reactivar' : 'Marcar Cese'}
                              </button>

                              <button
                                onClick={() => {
                                  setEditandoFilaId(r.id)
                                  setMontoEditado(r.monto_aprobado)
                                  setObservacionEditada(r.observacion_operacion || r.motivo_ajuste || '')
                                }}
                                className="p-1 text-[var(--text-muted)] hover:text-white rounded hover:bg-slate-800"
                                title="Editar monto u observación manualmente"
                              >
                                <Edit3 size={13} />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Paginación */}
        {totalPaginas > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--border-normal)] bg-[var(--bg-base)] text-xs text-[var(--text-muted)]">
            <div>
              Página <strong className="text-[var(--text-primary)]">{pagina}</strong> de {totalPaginas}
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setPagina(p => Math.max(1, p - 1))}
                disabled={pagina === 1}
                className="px-2.5 py-1 rounded-lg border border-[var(--border-normal)] bg-[var(--bg-surface)] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[var(--bg-elevated)] text-[var(--text-primary)]"
              >
                Anterior
              </button>
              <button
                onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))}
                disabled={pagina === totalPaginas}
                className="px-2.5 py-1 rounded-lg border border-[var(--border-normal)] bg-[var(--bg-surface)] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[var(--bg-elevated)] text-[var(--text-primary)]"
              >
                Siguiente
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── MODAL: IMPORTAR EXCEL (SMART IMPORTER) ── */}
      {modalExcelOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] flex flex-col">
            {/* Header del Modal */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center">
                  <UploadCloud size={20} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">
                    Importador Inteligente de Excel (.xlsx / .csv)
                  </h3>
                  <p className="text-xs text-slate-400">
                    Carga archivos devueltos por Operaciones o nuevas propuestas de nómina
                  </p>
                </div>
              </div>
              <button
                onClick={() => setModalExcelOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
              >
                <X size={18} />
              </button>
            </div>

            {/* Pestañas del Modal */}
            <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 gap-1">
              <button
                type="button"
                onClick={() => {
                  setExcelTabModo('bajas_operacion')
                  setFilasExcelParseadas([])
                  setResumenParseoExcel(null)
                }}
                className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                  excelTabModo === 'bajas_operacion'
                    ? 'bg-cyan-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <UserX size={14} />
                1. Validar Bajas / Ceses desde Excel de Operación
              </button>
              <button
                type="button"
                onClick={() => {
                  setExcelTabModo('nueva_nomina')
                  setFilasExcelParseadas([])
                  setResumenParseoExcel(null)
                }}
                className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                  excelTabModo === 'nueva_nomina'
                    ? 'bg-cyan-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <FileText size={14} />
                2. Cargar Nueva Nómina (Nuevo Periodo)
              </button>
            </div>

            {/* Zona de Drop / Carga de Archivo */}
            <div className="space-y-4 overflow-y-auto pr-1">
              {excelTabModo === 'nueva_nomina' && (
                <div className="flex items-center gap-3 p-3 bg-slate-950 border border-slate-800 rounded-xl">
                  <label className="text-xs font-bold text-slate-300 uppercase shrink-0">
                    Periodo Destino:
                  </label>
                  <input
                    type="text"
                    value={periodoNuevaNomina}
                    onChange={(e) => setPeriodoNuevaNomina(e.target.value)}
                    placeholder="Ej: 202611"
                    className="px-3 py-1 bg-slate-900 border border-slate-700 rounded-lg text-xs font-mono font-bold text-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                  />
                  <span className="text-[11px] text-slate-400">
                    Se creará o actualizará este periodo en la base de datos
                  </span>
                </div>
              )}

              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-700 hover:border-cyan-500/60 bg-slate-950/60 rounded-2xl p-6 text-center cursor-pointer transition-all hover:bg-cyan-950/10 group"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx, .xls, .csv"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) procesarArchivoExcel(file)
                  }}
                />
                <div className="w-12 h-12 rounded-full bg-cyan-500/10 text-cyan-400 flex items-center justify-center mx-auto mb-2 group-hover:scale-110 transition-transform">
                  <UploadCloud size={24} />
                </div>
                <div className="text-xs font-bold text-white">
                  {archivoExcelNombre ? (
                    <span className="text-cyan-300 font-mono">{archivoExcelNombre}</span>
                  ) : (
                    'Haz clic aquí para seleccionar el archivo Excel (.xlsx / .csv)'
                  )}
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  {excelTabModo === 'bajas_operacion'
                    ? 'Detecta automáticamente las columnas de DNI, Estado (Cesado/Activo), Fecha de Cese y Observaciones.'
                    : 'Lee las hojas de Bienvenida, Permanencia y Asistencia Perfecta con sus montos y colaboradores.'}
                </p>
              </div>

              {/* Resumen del Parseo */}
              {procesandoExcel && (
                <div className="py-6 text-center text-xs text-cyan-400 flex items-center justify-center gap-2">
                  <RefreshCw size={16} className="animate-spin" />
                  Analizando y validando estructura del archivo...
                </div>
              )}

              {resumenParseoExcel && !procesandoExcel && (
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3">
                  <div className="text-xs font-bold text-slate-300 uppercase flex items-center justify-between">
                    <span>Resultado del Análisis:</span>
                    <span className="text-cyan-400 font-mono">{resumenParseoExcel.total} registros leídos</span>
                  </div>

                  {excelTabModo === 'bajas_operacion' ? (
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div className="p-2.5 rounded-lg bg-rose-950/30 border border-rose-500/30 text-center">
                        <span className="text-[10px] text-rose-400 font-bold block">CESADOS / BAJAS</span>
                        <span className="text-xl font-black text-rose-300">{resumenParseoExcel.cesados}</span>
                        <span className="text-[9px] text-slate-400 block mt-0.5">Se descontarán a S/. 0</span>
                      </div>
                      <div className="p-2.5 rounded-lg bg-emerald-950/30 border border-emerald-500/30 text-center">
                        <span className="text-[10px] text-emerald-400 font-bold block">ACTIVOS / APROBADOS</span>
                        <span className="text-xl font-black text-emerald-300">{resumenParseoExcel.activos}</span>
                        <span className="text-[9px] text-slate-400 block mt-0.5">Mantendrán bono</span>
                      </div>
                      <div className="p-2.5 rounded-lg bg-blue-950/30 border border-blue-500/30 text-center">
                        <span className="text-[10px] text-blue-400 font-bold block">OBSERVADOS</span>
                        <span className="text-xl font-black text-blue-300">{resumenParseoExcel.observados}</span>
                        <span className="text-[9px] text-slate-400 block mt-0.5">Para revisión</span>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-4 gap-2 text-xs">
                      <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-center">
                        <span className="text-[10px] text-amber-400 font-bold block">BIENVENIDA</span>
                        <span className="text-base font-black text-white">{resumenParseoExcel.porTipo.BIENVENIDA}</span>
                      </div>
                      <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-center">
                        <span className="text-[10px] text-purple-400 font-bold block">PERMANENCIA</span>
                        <span className="text-base font-black text-white">{resumenParseoExcel.porTipo.PERMANENCIA}</span>
                      </div>
                      <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-center">
                        <span className="text-[10px] text-cyan-400 font-bold block">ASIST. PERFECTA</span>
                        <span className="text-base font-black text-white">{resumenParseoExcel.porTipo.ASISTENCIA_PERFECTA}</span>
                      </div>
                      <div className="p-2.5 rounded-lg bg-emerald-950/40 border border-emerald-500/30 text-center">
                        <span className="text-[10px] text-emerald-400 font-bold block">TOTAL ESTIMADO</span>
                        <span className="text-sm font-black text-emerald-300">{soles(resumenParseoExcel.montoTotal)}</span>
                      </div>
                    </div>
                  )}

                  {/* Vista previa de los primeros 10 registros */}
                  <div className="max-h-36 overflow-y-auto border border-slate-800 rounded-lg">
                    <table className="w-full text-[10px] text-left">
                      <thead className="bg-slate-900 text-slate-400 sticky top-0">
                        <tr>
                          <th className="px-2 py-1">DNI</th>
                          <th className="px-2 py-1">Estado Detectado</th>
                          <th className="px-2 py-1">Monto</th>
                          <th className="px-2 py-1">Observación</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800">
                        {filasExcelParseadas.slice(0, 15).map((f, i) => (
                          <tr key={i} className="hover:bg-slate-900/50">
                            <td className="px-2 py-1 font-mono text-white">{f.documento}</td>
                            <td className="px-2 py-1">
                              <span
                                className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                                  f.estado_validacion === 'CESADO'
                                    ? 'bg-rose-500/20 text-rose-300'
                                    : f.estado_validacion === 'APROBADO'
                                    ? 'bg-emerald-500/20 text-emerald-300'
                                    : 'bg-slate-800 text-slate-400'
                                }`}
                              >
                                {f.estado_validacion}
                              </span>
                            </td>
                            <td className="px-2 py-1 font-mono text-emerald-400">
                              {soles(f.monto_aprobado ?? f.monto_enviado ?? 0)}
                            </td>
                            <td className="px-2 py-1 text-slate-400 truncate max-w-[150px]">
                              {f.motivo_ajuste || f.observacion_operacion || '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* Footer de Acciones del Modal */}
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setModalExcelOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                Cancelar
              </button>

              {excelTabModo === 'bajas_operacion' ? (
                <button
                  type="button"
                  onClick={handleGuardarBajasDesdeExcel}
                  disabled={!filasExcelParseadas.length || procesandoExcel}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-cyan-600 hover:bg-cyan-500 text-white shadow-lg shadow-cyan-600/20 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {procesandoExcel ? (
                    <>
                      <RefreshCw size={14} className="animate-spin" /> Aplicando...
                    </>
                  ) : (
                    <>
                      <CheckSquare size={14} /> Aplicar Validación a Base de Datos
                    </>
                  )}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleGuardarNuevaNominaDesdeExcel}
                  disabled={!filasExcelParseadas.length || procesandoExcel}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/20 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {procesandoExcel ? (
                    <>
                      <RefreshCw size={14} className="animate-spin" /> Guardando...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={14} /> Guardar Nueva Nómina ({periodoNuevaNomina})
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: BAJAS MASIVAS PEGANDO DNIs ── */}
      {modalCesesOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-rose-500/20 text-rose-400 flex items-center justify-center">
                  <UserX size={18} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">
                    Procesar Ceses y Bajas por DNIs
                  </h3>
                  <p className="text-xs text-slate-400">
                    Periodo objetivo: <strong className="text-cyan-400">{periodoSel}</strong>
                  </p>
                </div>
              </div>
              <button
                onClick={() => setModalCesesOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-slate-300 uppercase">
                  Pega la lista de Documentos / DNIs cesados:
                </label>
                <p className="text-[11px] text-slate-500">
                  Copia y pega la columna de DNIs desde el Excel de Operación o correo (uno por línea o separados por comas).
                </p>
                <textarea
                  rows={6}
                  value={dnisCesesTexto}
                  onChange={(e) => setDnisCesesTexto(e.target.value)}
                  placeholder="Ejemplo:&#10;72465637&#10;45467160&#10;71829304"
                  className="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs font-mono text-rose-300 focus:outline-none focus:ring-1 focus:ring-rose-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-bold text-slate-400 uppercase">
                    Motivo del Ajuste
                  </label>
                  <input
                    type="text"
                    value={motivoCese}
                    onChange={(e) => setMotivoCese(e.target.value)}
                    className="p-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:ring-1 focus:ring-rose-500"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-bold text-slate-400 uppercase">
                    Fecha de Cese (Opcional)
                  </label>
                  <input
                    type="date"
                    value={fechaCeseInput}
                    onChange={(e) => setFechaCeseInput(e.target.value)}
                    className="p-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:ring-1 focus:ring-rose-500"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setModalCesesOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleEjecutarCesesMasivos}
                disabled={savingCeses}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-600/20 transition-all cursor-pointer"
              >
                {savingCeses ? (
                  <>
                    <RefreshCw size={14} className="animate-spin" /> Procesando...
                  </>
                ) : (
                  <>
                    <UserX size={14} /> Aplicar Ceses a Nómina
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
