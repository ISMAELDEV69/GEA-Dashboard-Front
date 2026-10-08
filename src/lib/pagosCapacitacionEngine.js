/**
 * Motor de calculo de pagos de capacitacion.
 *
 * Reglas de negocio:
 * - Solo califican personas con status_final = 'COMPLETO' o 'USUARIO CREADO'
 * - Los MONTOS provienen EXCLUSIVAMENTE de propuestas (config_pagos_grupo).
 *   Los campos de montos en nominas (pago_capacitacion, bono_bienvenida, etc.)
 *   son IGNORADOS para evitar errores de carga del reclutador.
 * - Si el grupo NO tiene propuesta configurada -> persona aparece con sin_propuesta=true
 *   y todos los montos en 0 (para que el analista sepa que grupos faltan).
 * - Se pagan unicamente dias con sigla_asistencia = 'A' (Asistio)
 * - Se cuentan dias HASTA (sin incluir) fecha_conexion_ojt (OJT lo paga operaciones)
 * - Bono asistencia perfecta: si NO hubo ningun dia FI ni FJ durante la capacitacion
 * - Bono permanencia se fracciona en cuotas (N cuotas iguales)
 */

import { toIsoDate } from './propuestaParser.js'

const STATUS_CALIFICA = new Set(['COMPLETO', 'USUARIO CREADO'])
const SIGLA_ASISTIO = 'A'
const SIGLAS_FALTA = new Set(['FI', 'FJ'])
const SIGLA_BAJA = 'B'

const normPago = (v) => String(v || '').trim().toUpperCase()

/** SEM 35, 35 y SEM35 equivalen a la misma semana. */
export function normalizarSemanaPago(val) {
  if (val == null || val === '') return ''
  const str = String(val).trim().toUpperCase()
  const num = str.replace(/\D/g, '')
  return num ? `SEM ${num}` : str
}

/** Llave de negocio: periodo + semana + segmento + campaña + código de grupo. */
export function claveGrupoPago({ periodo = '', semana = '', segmento = '', campana = '', codigo = '' } = {}) {
  return [
    normPago(periodo),
    normalizarSemanaPago(semana),
    normPago(segmento),
    normPago(campana),
    normPago(codigo),
  ].join('|')
}

export function claveDesdeCapacidad(g = {}) {
  return claveGrupoPago({
    periodo: g.periodo,
    semana: g.semana_label || (g.semana_trabajo != null && g.semana_trabajo !== '' ? `SEM ${g.semana_trabajo}` : '') || g.semana,
    segmento: g.segmento,
    campana: g.campana,
    codigo: g.codigo || g.grupo_capacitacion || g.grupo || g.grupo_codigo,
  })
}

export function claveDesdeConfig(c = {}) {
  return claveGrupoPago({
    periodo: c.periodoCapa || c.periodo,
    semana: c.semana || c.semana_trabajo,
    segmento: c.segmento,
    campana: c.campana,
    codigo: c.grupo || c.grupo_codigo,
  })
}

export function claveDesdeNomina(n = {}) {
  return claveGrupoPago({
    periodo: n.periodo_reclutado || n.periodo,
    semana: n.semana_trabajo || n.semana,
    segmento: n.segmento,
    campana: n.campana,
    codigo: n.grupo_codigo || n.codigo_grupo || n.grupo,
  })
}

function lookupPorClaves(map, n) {
  // 1. Clave exacta completa: periodo + semana + segmento + campana + codigo
  const full = claveDesdeNomina(n)
  if (map.has(full)) return map.get(full)

  // 2. Sin segmento: periodo + semana + campana + codigo
  const sinSegmento = claveGrupoPago({
    periodo: n.periodo_reclutado || n.periodo,
    semana: n.semana_trabajo || n.semana,
    campana: n.campana,
    codigo: n.grupo_codigo || n.codigo_grupo || n.grupo,
  })
  if (map.has(sinSegmento)) return map.get(sinSegmento)

  // 3. Sin semana: periodo + campana + codigo
  const sinSemana = claveGrupoPago({
    periodo: n.periodo_reclutado || n.periodo,
    campana: n.campana,
    codigo: n.grupo_codigo || n.codigo_grupo || n.grupo,
  })
  if (map.has(sinSemana)) return map.get(sinSemana)

  // 4. Solo campana + codigo
  const soloCampCod = claveGrupoPago({
    campana: n.campana,
    codigo: n.grupo_codigo || n.codigo_grupo || n.grupo,
  })
  if (map.has(soloCampCod)) return map.get(soloCampCod)

  return null
}

export function calcularPagosCapacitacion(nominas = [], asistencias = [], configPagos = [], periodoConsulta = 'TODOS', gruposCapacidad = []) {
  const asistenciasPorDoc = new Map()
  for (const a of asistencias) {
    const doc = String(a.postulante_documento || '').trim()
    if (!doc) continue
    if (!asistenciasPorDoc.has(doc)) asistenciasPorDoc.set(doc, [])
    asistenciasPorDoc.get(doc).push(a)
  }

  const configPorGrupo = new Map()
  for (const c of configPagos) {
    const full = claveDesdeConfig(c)
    if (full.replace(/\|/g, '')) configPorGrupo.set(full, c)

    const sinSegmento = claveGrupoPago({
      periodo: c.periodoCapa || c.periodo,
      semana: c.semana || c.semana_trabajo,
      campana: c.campana,
      codigo: c.grupo || c.grupo_codigo,
    })
    if (!configPorGrupo.has(sinSegmento)) configPorGrupo.set(sinSegmento, c)

    const sinSemana = claveGrupoPago({
      periodo: c.periodoCapa || c.periodo,
      campana: c.campana,
      codigo: c.grupo || c.grupo_codigo,
    })
    if (!configPorGrupo.has(sinSemana)) configPorGrupo.set(sinSemana, c)

    const soloCampCod = claveGrupoPago({
      campana: c.campana,
      codigo: c.grupo || c.grupo_codigo,
    })
    if (!configPorGrupo.has(soloCampCod)) configPorGrupo.set(soloCampCod, c)

    if (c.cod) {
      const conCod = claveGrupoPago({
        campana: c.campana,
        codigo: c.cod,
      })
      if (!configPorGrupo.has(conCod)) configPorGrupo.set(conCod, c)
    }
  }

  const capacidadPorGrupo = new Map()
  for (const cap of gruposCapacidad) {
    const full = claveDesdeCapacidad(cap)
    if (full.replace(/\|/g, '')) capacidadPorGrupo.set(full, cap)
    const sinSegmento = claveGrupoPago({
      periodo: cap.periodo,
      semana: cap.semana_label || cap.semana_trabajo || cap.semana,
      campana: cap.campana,
      codigo: cap.codigo || cap.grupo_capacitacion || cap.grupo,
    })
    if (!capacidadPorGrupo.has(sinSegmento)) capacidadPorGrupo.set(sinSegmento, cap)

    const sinSemana = claveGrupoPago({
      periodo: cap.periodo,
      campana: cap.campana,
      codigo: cap.codigo || cap.grupo_capacitacion || cap.grupo,
    })
    if (!capacidadPorGrupo.has(sinSemana)) capacidadPorGrupo.set(sinSemana, cap)

    const soloCampCod = claveGrupoPago({
      campana: cap.campana,
      codigo: cap.codigo || cap.grupo_capacitacion || cap.grupo,
    })
    if (!capacidadPorGrupo.has(soloCampCod)) capacidadPorGrupo.set(soloCampCod, cap)
  }

  const getMesIndex = (periodo, mesAfectacionBonos, config) => {
    if (!periodo || periodo === 'TODOS') return 1
    const pClean = String(periodo).replace(/\D/g, '')
    const bClean = String(mesAfectacionBonos || '').replace(/\D/g, '')
    const cClean = String(config?.periodoCapa || config?.periodo || '').replace(/\D/g, '')

    // Si coincide con el periodo de capacitación del grupo (cohorte) o con el mes de afectación, es Mes 1
    if (!bClean || (cClean && pClean === cClean)) return 1
    if (pClean === bClean) return 1

    if (pClean.length !== 6 || bClean.length !== 6) return 1
    const y1 = parseInt(bClean.slice(0, 4), 10)
    const m1 = parseInt(bClean.slice(4, 6), 10)
    const y2 = parseInt(pClean.slice(0, 4), 10)
    const m2 = parseInt(pClean.slice(4, 6), 10)
    const diff = (y2 - y1) * 12 + (m2 - m1)
    if (diff <= 0) return 1 // Cohorte actual o mes inicial = Mes 1
    return diff + 1 // 2=Mes 2, 3=Mes 3, 4=Mes 4
  }

  const resultado = []

  for (const n of nominas) {
    const doc = String(n.documento || '').trim()
    if (!doc) continue

    const rawGpe = String(n.grupo_codigo || '').trim().toUpperCase()

    const config = lookupPorClaves(configPorGrupo, n)
    const capInfo = lookupPorClaves(capacidadPorGrupo, n)
    const sinPropuesta = !config || (!config.grupo_codigo && !config.grupo)

    const rawAsistencias = asistenciasPorDoc.get(doc) || []

    // 1. Detectar si es Agregado
    const statusDia1Str = String(n.status_dia_1 || '').toUpperCase().trim()
    const tipoRecStr = String(n.tipo_reclutado || n.condicion || n.tipo || '').toUpperCase().trim()
    const obsD1Str = String(n.dia_1_obs || n.observacion_dia_1 || '').toUpperCase().trim()
    const obsD0Str = String(n.dia_0_obs || '').toUpperCase().trim()
    const dia0Nomina = String(n.dia_0 || '').toUpperCase().trim()
    const dia0ObsNomina = String(n.dia_0_obs || '').toUpperCase().trim()
    const evalDia0 = String(n.evaluacion_dia_0 || '').toUpperCase().trim()

    const esAgregado = statusDia1Str.includes('AGREGADO') || 
                       tipoRecStr.includes('AGREGADO') || 
                       obsD1Str.includes('AGREGADO') || 
                       (obsD0Str.includes('AGREGADO') && dia0Nomina !== 'ASISTIO')

    // 2. Detectar si la persona tiene registro formal de I-OP (Ingreso a Operaciones / OJT)
    let fIopDetectada = null
    let fUltimoIop = null
    const iopRecords = []

    for (const a of rawAsistencias) {
      const s = String(a.sigla_asistencia || a.sigla || a.estado || '').toUpperCase().trim()
      const isIop = s === 'I-OP' || s === 'IOP' || s.includes('INGRESO A OPERACION') || s.includes('INGRESO OP')
      if (isIop) {
        iopRecords.push(a)
        const dIso = toIsoDate(a.fecha_asistencia || a.fecha_original || a.fecha_hora_registro || a.created_at)
        if (dIso) {
          if (!fIopDetectada || dIso < fIopDetectada) fIopDetectada = dIso
          if (!fUltimoIop || dIso > fUltimoIop) fUltimoIop = dIso
        }
      }
    }

    const tieneIop = iopRecords.length > 0
    const totalIop = iopRecords.length

    // 3. Fechas límites para delimitar la capacitación
    const fInicioCapacidad = toIsoDate(capInfo?.fecha_registro)
    const fInicioIso = toIsoDate(n.fecha_inicio_capacitacion)
      || toIsoDate(config?.fechaInicioCapa)
      || fInicioCapacidad
      || null

    const fOjtCapacidad = toIsoDate(capInfo?.fecha_inicio_ojt)
    const fOjtIso = fOjtCapacidad 
      || toIsoDate(n.fecha_conexion_ojt)
      || fIopDetectada 
      || toIsoDate(config?.ingresoOperacion)
      || null

    // 4. Detectar si asistió al Día 0 (Inducción)
    const asistioDia0Nomina = dia0Nomina === 'ASISTIO' || 
                              dia0Nomina === 'SI' || 
                              dia0Nomina === 'A' || 
                              dia0Nomina === 'PRESENTE' || 
                              dia0ObsNomina.includes('ASIST') || 
                              dia0ObsNomina.includes('CONECT') ||
                              evalDia0.includes('ASIST') ||
                              evalDia0.includes('APROB')

    // Verificar en asistencia registros previos a fInicioIso (hasta 4 días antes, ej. inducción)
    let asistioDia0Asistencia = false
    for (const a of rawAsistencias) {
      if (!a.fecha_asistencia) continue
      const faIso = toIsoDate(a.fecha_asistencia)
      if (!faIso) continue
      if (fInicioIso && faIso < fInicioIso) {
        const msDiff = new Date(fInicioIso).getTime() - new Date(faIso).getTime()
        const daysDiff = msDiff / (1000 * 60 * 60 * 24)
        if (daysDiff <= 4) {
          const s = String(a.sigla_asistencia || a.sigla || a.estado || '').toUpperCase().trim()
          if (s === 'A' || s === 'ASISTIO' || s === 'PRESENTE') {
            asistioDia0Asistencia = true
          }
        }
      }
    }

    const asistioDia0 = asistioDia0Nomina || asistioDia0Asistencia
    const dia0StatusLabel = esAgregado && !asistioDia0 ? 'N/A' : (asistioDia0 ? 'ASISTIO' : (dia0Nomina ? dia0Nomina : 'FALTA'))

    // 5. Deduplicación por fecha única tomando el ÚLTIMO corte del día
    const cortesPorFecha = new Map()
    for (const a of rawAsistencias) {
      if (!a.fecha_asistencia) continue
      const faIso = toIsoDate(a.fecha_asistencia)
      if (!faIso) continue

      // Permitir inducción (hasta 4 días antes del inicio formal)
      if (fInicioIso && faIso < fInicioIso) {
        const msDiff = new Date(fInicioIso).getTime() - new Date(faIso).getTime()
        const daysDiff = msDiff / (1000 * 60 * 60 * 24)
        if (daysDiff > 4) continue
      }
      if (fOjtIso && faIso >= fOjtIso) continue

      cortesPorFecha.set(faIso, a)
    }

    const asistenciasPersona = Array.from(cortesPorFecha.values())

    // 6. Conteo de asistencias válidas
    const asistenciasValidas = asistenciasPersona.filter(a => {
      const s = String(a.sigla_asistencia || '').toUpperCase().trim()
      return s === 'A' || s === 'ASISTIO' || s === 'PRESENTE'
    })

    const dia0YaEnAsistencia = fInicioIso && asistenciasValidas.some(a => toIsoDate(a.fecha_asistencia) < fInicioIso)

    let diasAsistidos = asistenciasValidas.length
    if (asistioDia0 && !dia0YaEnAsistencia) {
      diasAsistidos += 1
    }

    // 7. Faltas y asistencia perfecta
    const tuvoFaltasAsistencia = asistenciasPersona.some(a => {
      const s = String(a.sigla_asistencia || '').toUpperCase().trim()
      return s === 'FI' || s === 'FJ' || s === 'F' || s === 'FALTA' || s === 'INASISTENCIA'
    })
    const dia1Nomina = String(n.dia_1 || '').toUpperCase().trim()
    const faltoDia1Nomina = dia1Nomina === 'FALTA' || dia1Nomina === 'FI' || dia1Nomina === 'F'
    const faltoDia0Nomina = !esAgregado && !asistioDia0 && dia0Nomina === 'FALTA'
    const tuveFaltas = tuvoFaltasAsistencia || (!esAgregado && faltoDia1Nomina) || faltoDia0Nomina

    // 8. Estatus final e inspección de TODO el historial global (sin corte OJT para bajas)
    const sortedAsistenciasGlobal = [...rawAsistencias].sort((x, y) => {
      const dx = toIsoDate(x.fecha_asistencia || x.fecha_original || x.created_at) || ''
      const dy = toIsoDate(y.fecha_asistencia || y.fecha_original || y.created_at) || ''
      if (dx !== dy) return dx.localeCompare(dy)
      const tx = new Date(x.fecha_hora_registro || x.created_at || 0).getTime()
      const ty = new Date(y.fecha_hora_registro || y.created_at || 0).getTime()
      return tx - ty
    })

    const ultimaAsisGlobal = sortedAsistenciasGlobal[sortedAsistenciasGlobal.length - 1]
    const siglaUltimaGlobal = String(ultimaAsisGlobal?.sigla_asistencia || ultimaAsisGlobal?.sigla || ultimaAsisGlobal?.estado || '').toUpperCase().trim()
    const estadoUltimoGlobal = String(ultimaAsisGlobal?.estado || '').toUpperCase().trim()

    const esUltimaBaja = siglaUltimaGlobal === 'B' || 
                         siglaUltimaGlobal === 'BAJA' || 
                         siglaUltimaGlobal === 'CESADO' || 
                         siglaUltimaGlobal === 'DESERTO' || 
                         estadoUltimoGlobal === 'CESADO' || 
                         estadoUltimoGlobal === 'BAJA' || 
                         estadoUltimoGlobal === 'DESERTO' ||
                         estadoUltimoGlobal.includes('BAJA')

    const statusNominaStr = String(n.status_final || '').toUpperCase().trim()
    const esBajaNomina = statusNominaStr.includes('BAJA') || 
                         statusNominaStr.includes('CESE') || 
                         statusNominaStr.includes('CESADO') || 
                         statusNominaStr.includes('DESERT') || 
                         statusNominaStr.includes('NO SHOW')

    const tieneRegistroBaja = sortedAsistenciasGlobal.some(a => {
      const s = String(a.sigla_asistencia || a.sigla || a.estado || '').toUpperCase().trim()
      const e = String(a.estado || '').toUpperCase().trim()
      return s === 'B' || s === 'BAJA' || s === 'CESADO' || s === 'DESERTO' || e === 'CESADO' || e === 'BAJA'
    })

    // REGLA FUNDAMENTAL DE NEGOCIO:
    // Solo se paga capacitación hasta la fecha de OJT y SÍ O SÍ si llegaron a ingresar a la operación (I-OP).
    // Si fueron baja en cualquier momento o no llegaron a I-OP, NO SE LES PAGA (S/. 0.00).
    let statusFinalAsistencia = 'SIN ASISTENCIA'
    let esBaja = false

    if (tieneIop && !esUltimaBaja && !esBajaNomina) {
      statusFinalAsistencia = 'I-OP'
      esBaja = false
    } else {
      esBaja = true
      if (esUltimaBaja || esBajaNomina || tieneRegistroBaja) {
        statusFinalAsistencia = 'BAJA'
      } else if (diasAsistidos === 0) {
        statusFinalAsistencia = 'SIN ASISTENCIA'
      } else {
        statusFinalAsistencia = 'NO INGRESO A OP'
      }
    }

    if (esBaja) {
      resultado.push({
        documento: doc,
        apellido_paterno: n.apellido_paterno || '',
        apellido_materno: n.apellido_materno || '',
        nombres: n.nombres || '',
        nombre_completo: [n.apellido_paterno, n.apellido_materno, n.nombres].filter(Boolean).join(' '),
        reclutador: n.reclutador || '',
        grupo_codigo: n.grupo_codigo || '',
        campana: n.campana || '',
        semana_trabajo: n.semana_trabajo || '',
        periodo_reclutado: n.periodo_reclutado || '',
        fecha_inicio_capacitacion: n.fecha_inicio_capacitacion || null,
        fecha_fin_capacitacion: n.fecha_fin_capacitacion || null,
        fecha_conexion_ojt: fOjtIso || n.fecha_conexion_ojt || null,
        fecha_ingreso_ojt: fOjtIso || null,
        fecha_conexion_op: n.fecha_conexion_op || null,
        status_final: statusFinalAsistencia,
        status_asistencia: statusFinalAsistencia,
        tiene_iop: tieneIop,
        total_iop: totalIop,
        fecha_primer_iop: fIopDetectada,
        fecha_ultimo_iop: fUltimoIop,
        asistio_dia_0: asistioDia0,
        dia_0_status: dia0StatusLabel,
        es_agregado: esAgregado,
        status_dia_1: n.status_dia_1 || '',
        tipo_reclutado: n.tipo_reclutado || '',
        es_baja: true,
        dias_asistidos: diasAsistidos,
        tuvo_faltas: tuveFaltas,
        asistencia_perfecta: false,
        sin_propuesta: false,
        monto_dias_capa: 0,
        bono_bienvenida: 0,
        bono_asistencia_perfecta: 0,
        bono_permanencia_total: 0,
        cuotas_permanencia: [],
        monto_cuota_permanencia: 0,
        total_sin_permanencia: 0,
        total_general: 0,
        config_aplicada: null,
      })
      continue
    }

    let montoDias = 0
    let bonoBienvenida = 0
    let bonoAsistenciaPerfecta = 0
    let bonoPermanencia = 0
    let cuotas = 1
    let mesBonoNumero = 1

    if (!sinPropuesta) {
      const tarifaDia = parseFloat(config.pagoPorDia || config.monto_dia_capa) || 0
      
      // Mes de Afectación - Pago Capa
      const pClean = String(periodoConsulta || '').replace(/\D/g, '')
      const mesCapaClean = String(config.mesAfectacionCapa || '').replace(/\D/g, '')
      const periodoCapaClean = String(config.periodoCapa || config.periodo || '').replace(/\D/g, '')

      const aplicaPagoCapa = !periodoConsulta || periodoConsulta === 'TODOS' || 
        !mesCapaClean || mesCapaClean === pClean || periodoCapaClean === pClean
      
      if (aplicaPagoCapa) {
        const diasMax = parseInt(config.diasCapa) || diasAsistidos
        const diasCalculo = diasMax > 0 ? Math.min(diasAsistidos, diasMax) : diasAsistidos
        montoDias = +(tarifaDia * diasCalculo).toFixed(2)
        const pagoCompletoConfig = parseFloat(config.pagoCompleto) || 0
        if (pagoCompletoConfig > 0 && diasAsistidos >= diasMax) {
          montoDias = pagoCompletoConfig
        }
      }

      // Mes de Afectación - Bonos (M1, M2, M3, M4)
      mesBonoNumero = getMesIndex(periodoConsulta, config.mesAfectacionBonos, config)

      if (periodoConsulta === 'TODOS' || mesBonoNumero === 1) {
        bonoBienvenida = parseFloat(config.bonoBienvenidaM1 ?? config.bono_bienvenida) || 0
        bonoPermanencia = parseFloat(config.bonoPermanenciaM1 ?? config.bono_permanencia_total) || 0
        if (!tuveFaltas && diasAsistidos > 0) {
          bonoAsistenciaPerfecta = parseFloat(config.bonoAsistenciaM1 ?? config.bono_asistencia_perfecta) || 0
        }
      } else if (mesBonoNumero === 2) {
        bonoBienvenida = parseFloat(config.bonoBienvenidaM2) || 0
        bonoPermanencia = parseFloat(config.bonoPermanenciaM2) || 0
        if (!tuveFaltas && diasAsistidos > 0) {
          bonoAsistenciaPerfecta = parseFloat(config.bonoAsistenciaM2) || 0
        }
      } else if (mesBonoNumero === 3) {
        bonoBienvenida = parseFloat(config.bonoBienvenidaM3) || 0
        bonoPermanencia = parseFloat(config.bonoPermanenciaM3) || 0
        if (!tuveFaltas && diasAsistidos > 0) {
          bonoAsistenciaPerfecta = parseFloat(config.bonoAsistenciaM3) || 0
        }
      } else if (mesBonoNumero === 4) {
        bonoPermanencia = parseFloat(config.bonoPermanenciaM4) || 0
      }
      
      cuotas = parseInt(config.cuotas_permanencia) || 1
    }

    if (cuotas < 1) cuotas = 1
    const totalGeneral = montoDias + bonoBienvenida + bonoAsistenciaPerfecta + bonoPermanencia

    resultado.push({
      documento: doc,
      apellido_paterno: n.apellido_paterno || '',
      apellido_materno: n.apellido_materno || '',
      nombres: n.nombres || '',
      nombre_completo: [n.apellido_paterno, n.apellido_materno, n.nombres].filter(Boolean).join(' '),
      reclutador: n.reclutador || '',
      grupo_codigo: n.grupo_codigo || '',
      campana: n.campana || '',
      semana_trabajo: n.semana_trabajo || '',
      periodo_reclutado: n.periodo_reclutado || '',
      fecha_inicio_capacitacion: n.fecha_inicio_capacitacion || null,
      fecha_fin_capacitacion: n.fecha_fin_capacitacion || null,
      fecha_conexion_ojt: fOjtIso || n.fecha_conexion_ojt || null,
      fecha_ingreso_ojt: fOjtIso || null,
      fecha_conexion_op: n.fecha_conexion_op || null,
      status_final: statusFinalAsistencia,
      status_asistencia: statusFinalAsistencia,
      tiene_iop: tieneIop,
      total_iop: totalIop,
      fecha_primer_iop: fIopDetectada,
      fecha_ultimo_iop: fUltimoIop,
      asistio_dia_0: asistioDia0,
      dia_0_status: dia0StatusLabel,
      es_agregado: esAgregado,
      status_dia_1: n.status_dia_1 || '',
      tipo_reclutado: n.tipo_reclutado || '',
      es_baja: false,
      dias_asistidos: diasAsistidos,
      tuvo_faltas: tuveFaltas,
      asistencia_perfecta: !tuveFaltas && diasAsistidos > 0,
      sin_propuesta: sinPropuesta,
      mes_bono_numero: mesBonoNumero,
      monto_dias_capa: +montoDias.toFixed(2),
      bono_bienvenida: +bonoBienvenida.toFixed(2),
      bono_asistencia_perfecta: +bonoAsistenciaPerfecta.toFixed(2),
      bono_permanencia_total: +bonoPermanencia.toFixed(2),
      cuotas_permanencia: [{ numero: mesBonoNumero, monto: bonoPermanencia }],
      monto_cuota_permanencia: bonoPermanencia,
      total_sin_permanencia: +(montoDias + bonoBienvenida + bonoAsistenciaPerfecta).toFixed(2),
      total_general: +totalGeneral.toFixed(2),
      config_aplicada: config || null,
    })
  }

  resultado.sort((a, b) => {
    // Bajas siempre al final
    if (a.es_baja && !b.es_baja) return 1
    if (!a.es_baja && b.es_baja) return -1
    // Sin propuesta primero (entre los que sí califican)
    if (a.sin_propuesta && !b.sin_propuesta) return -1
    if (!a.sin_propuesta && b.sin_propuesta) return 1
    if (a.campana < b.campana) return -1
    if (a.campana > b.campana) return 1
    if ((a.semana_trabajo || 0) < (b.semana_trabajo || 0)) return -1
    if ((a.semana_trabajo || 0) > (b.semana_trabajo || 0)) return 1
    return a.nombre_completo.localeCompare(b.nombre_completo)
  })

  return resultado
}

export function generarResumenPagos(filas = []) {
  const bajas = filas.filter(f => f.es_baja)
  const calificados = filas.filter(f => !f.es_baja && f.dias_asistidos > 0 && !f.sin_propuesta)
  const sinPropuesta = filas.filter(f => !f.es_baja && f.sin_propuesta)
  const gruposSinPropuesta = [...new Set(sinPropuesta.map(f => f.grupo_codigo).filter(Boolean))].sort()

  return {
    total_personas: filas.length,
    personas_bajas: bajas.length,
    personas_calificadas: calificados.length,
    personas_con_propuesta: calificados.length,
    personas_sin_propuesta: sinPropuesta.length,
    grupos_sin_propuesta: gruposSinPropuesta,
    total_monto_dias: +calificados.reduce((s, f) => s + f.monto_dias_capa, 0).toFixed(2),
    total_bono_bienvenida: +calificados.reduce((s, f) => s + f.bono_bienvenida, 0).toFixed(2),
    total_bono_asistencia_perfecta: +calificados.reduce((s, f) => s + f.bono_asistencia_perfecta, 0).toFixed(2),
    total_bono_permanencia: +calificados.reduce((s, f) => s + f.bono_permanencia_total, 0).toFixed(2),
    total_general: +calificados.reduce((s, f) => s + f.total_general, 0).toFixed(2),
    personas_asistencia_perfecta: calificados.filter(f => f.asistencia_perfecta).length,
    max_dias_asistidos: calificados.length ? Math.max(...calificados.map(f => f.dias_asistidos)) : 0,
    promedio_dias: calificados.length ? +(calificados.reduce((s, f) => s + f.dias_asistidos, 0) / calificados.length).toFixed(1) : 0,
  }
}

export function exportarCSVPagos(filas = [], maxCuotas = 3) {
  const headers = [
    'DNI/CE', 'Apellido Paterno', 'Apellido Materno', 'Nombres',
    'Reclutador',
    'Grupo', 'Campana', 'Semana', 'Status Final', 'Ingreso OP (I-OP)', 'Total Reg. I-OP',
    'Baja', 'Propuesta',
    'Dias Asistidos', 'Asistencia Perfecta',
    'Monto Dias Capa (S/.)',
    'Bono Bienvenida (S/.)',
    'Bono Asist. Perfecta (S/.)',
    ...Array.from({ length: maxCuotas }, (_, i) => `Cuota Permanencia ${i + 1} (S/.)`),
    'Total Permanencia (S/.)',
    'TOTAL GENERAL (S/.)',
  ]

  const rows = filas.map(f => {
    const cuotaVals = Array.from({ length: maxCuotas }, (_, i) => f.cuotas_permanencia[i]?.monto ?? 0)
    return [
      f.documento, f.apellido_paterno, f.apellido_materno, f.nombres,
      f.reclutador || '',
      f.grupo_codigo, f.campana, f.semana_trabajo, f.status_final,
      f.tiene_iop ? 'SI' : 'NO',
      f.total_iop || 0,
      f.es_baja ? 'SI' : 'NO',
      f.es_baja ? 'EXCLUIDO POR BAJA' : (f.sin_propuesta ? 'SIN PROPUESTA' : 'CON PROPUESTA'),
      f.dias_asistidos, f.asistencia_perfecta ? 'SI' : 'NO',
      f.monto_dias_capa, f.bono_bienvenida, f.bono_asistencia_perfecta,
      ...cuotaVals,
      f.bono_permanencia_total, f.total_general,
    ]
  })

  return [headers, ...rows]
    .map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
    .join('\n')
}

