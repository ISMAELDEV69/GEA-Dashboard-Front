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

const STATUS_CALIFICA = new Set(['COMPLETO', 'USUARIO CREADO'])
const SIGLA_ASISTIO = 'A'
const SIGLAS_FALTA = new Set(['FI', 'FJ'])
const SIGLA_BAJA = 'B'

export function calcularPagosCapacitacion(nominas = [], asistencias = [], configPagos = []) {
  const asistenciasPorDoc = new Map()
  for (const a of asistencias) {
    const doc = String(a.postulante_documento || '').trim()
    if (!doc) continue
    if (!asistenciasPorDoc.has(doc)) asistenciasPorDoc.set(doc, [])
    asistenciasPorDoc.get(doc).push(a)
  }

  const cleanCode = (v) => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '')

  const configPorGrupo = new Map()
  for (const c of configPagos) {
    if (c.grupo_codigo) {
      const raw = String(c.grupo_codigo).trim().toUpperCase()
      configPorGrupo.set(raw, c)
      configPorGrupo.set(cleanCode(raw), c)
    }
  }

  const resultado = []

  for (const n of nominas) {
    if (!STATUS_CALIFICA.has(n.status_final)) continue

    const doc = String(n.documento || '').trim()
    const rawGpe = String(n.grupo_codigo || '').trim().toUpperCase()

    const config = configPorGrupo.get(rawGpe) || configPorGrupo.get(cleanCode(rawGpe)) || null
    const sinPropuesta = !config || !config.grupo_codigo

    const fechaInicioStr = n.fecha_inicio_capacitacion
    const fechaOjt = n.fecha_conexion_ojt ? new Date(n.fecha_conexion_ojt) : null

    const asistenciasPersona = (asistenciasPorDoc.get(doc) || []).filter(a => {
      if (!a.fecha_asistencia) return false
      const fa = new Date(a.fecha_asistencia)
      if (fechaOjt && fa >= fechaOjt) return false
      if (fechaInicioStr) {
        const fi = new Date(fechaInicioStr)
        if (fa < fi) return false
      }
      return true
    })

    const diasAsistidos = asistenciasPersona.filter(a => a.sigla_asistencia === SIGLA_ASISTIO).length
    const tuveFaltas = asistenciasPersona.some(a => SIGLAS_FALTA.has(a.sigla_asistencia))
    // Si fue dada de baja dentro del rango de capa → NO califica para pago
    const esBaja = asistenciasPersona.some(a => a.sigla_asistencia === SIGLA_BAJA)
    if (esBaja) {
      resultado.push({
        documento: doc,
        apellido_paterno: n.apellido_paterno || '',
        apellido_materno: n.apellido_materno || '',
        nombres: n.nombres || '',
        nombre_completo: [n.apellido_paterno, n.apellido_materno, n.nombres].filter(Boolean).join(' '),
        grupo_codigo: n.grupo_codigo || '',
        campana: n.campana || '',
        semana_trabajo: n.semana_trabajo || '',
        periodo_reclutado: n.periodo_reclutado || '',
        fecha_inicio_capacitacion: n.fecha_inicio_capacitacion || null,
        fecha_fin_capacitacion: n.fecha_fin_capacitacion || null,
        fecha_conexion_ojt: n.fecha_conexion_ojt || null,
        fecha_conexion_op: n.fecha_conexion_op || null,
        status_final: n.status_final || '',
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
    let bonoPermanenciaTotal = 0
    let cuotas = 1

    if (!sinPropuesta) {
      montoDias = (parseFloat(config.monto_dia_capa) || 0) * diasAsistidos
      bonoBienvenida = parseFloat(config.bono_bienvenida) || 0
      if (!tuveFaltas && diasAsistidos > 0) {
        bonoAsistenciaPerfecta = parseFloat(config.bono_asistencia_perfecta) || 0
      }
      bonoPermanenciaTotal = parseFloat(config.bono_permanencia_total) || 0
      cuotas = parseInt(config.cuotas_permanencia) || 1
    }

    if (cuotas < 1) cuotas = 1
    const montoCuota = cuotas > 0 ? +(bonoPermanenciaTotal / cuotas).toFixed(2) : 0
    const cuotasArr = Array.from({ length: cuotas }, (_, i) => ({ numero: i + 1, monto: montoCuota }))
    const totalGeneral = montoDias + bonoBienvenida + bonoAsistenciaPerfecta + bonoPermanenciaTotal

    resultado.push({
      documento: doc,
      apellido_paterno: n.apellido_paterno || '',
      apellido_materno: n.apellido_materno || '',
      nombres: n.nombres || '',
      nombre_completo: [n.apellido_paterno, n.apellido_materno, n.nombres].filter(Boolean).join(' '),
      grupo_codigo: n.grupo_codigo || '',
      campana: n.campana || '',
      semana_trabajo: n.semana_trabajo || '',
      periodo_reclutado: n.periodo_reclutado || '',
      fecha_inicio_capacitacion: n.fecha_inicio_capacitacion || null,
      fecha_fin_capacitacion: n.fecha_fin_capacitacion || null,
      fecha_conexion_ojt: n.fecha_conexion_ojt || null,
      fecha_conexion_op: n.fecha_conexion_op || null,
      status_final: n.status_final || '',
      es_baja: false,
      dias_asistidos: diasAsistidos,
      tuvo_faltas: tuveFaltas,
      asistencia_perfecta: !tuveFaltas && diasAsistidos > 0,
      sin_propuesta: sinPropuesta,
      monto_dias_capa: +montoDias.toFixed(2),
      bono_bienvenida: +bonoBienvenida.toFixed(2),
      bono_asistencia_perfecta: +bonoAsistenciaPerfecta.toFixed(2),
      bono_permanencia_total: +bonoPermanenciaTotal.toFixed(2),
      cuotas_permanencia: cuotasArr,
      monto_cuota_permanencia: montoCuota,
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
  const sinBaja = filas.filter(f => !f.es_baja)
  const conPropuesta = sinBaja.filter(f => !f.sin_propuesta)
  const sinPropuesta = sinBaja.filter(f => f.sin_propuesta)
  const gruposSinPropuesta = [...new Set(sinPropuesta.map(f => f.grupo_codigo).filter(Boolean))].sort()

  return {
    total_personas: filas.length,
    personas_bajas: bajas.length,
    personas_calificadas: sinBaja.length,
    personas_con_propuesta: conPropuesta.length,
    personas_sin_propuesta: sinPropuesta.length,
    grupos_sin_propuesta: gruposSinPropuesta,
    total_monto_dias: +conPropuesta.reduce((s, f) => s + f.monto_dias_capa, 0).toFixed(2),
    total_bono_bienvenida: +conPropuesta.reduce((s, f) => s + f.bono_bienvenida, 0).toFixed(2),
    total_bono_asistencia_perfecta: +conPropuesta.reduce((s, f) => s + f.bono_asistencia_perfecta, 0).toFixed(2),
    total_bono_permanencia: +conPropuesta.reduce((s, f) => s + f.bono_permanencia_total, 0).toFixed(2),
    total_general: +conPropuesta.reduce((s, f) => s + f.total_general, 0).toFixed(2),
    personas_asistencia_perfecta: conPropuesta.filter(f => f.asistencia_perfecta).length,
    max_dias_asistidos: sinBaja.length ? Math.max(...sinBaja.map(f => f.dias_asistidos)) : 0,
    promedio_dias: sinBaja.length ? +(sinBaja.reduce((s, f) => s + f.dias_asistidos, 0) / sinBaja.length).toFixed(1) : 0,
  }
}

export function exportarCSVPagos(filas = [], maxCuotas = 3) {
  const headers = [
    'DNI/CE', 'Apellido Paterno', 'Apellido Materno', 'Nombres',
    'Grupo', 'Campana', 'Semana', 'Status Final',
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
      f.grupo_codigo, f.campana, f.semana_trabajo, f.status_final,
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

