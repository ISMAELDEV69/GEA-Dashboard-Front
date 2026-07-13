/**
 * Utilidades de importación Sheets → BD (nómina + asistencia día 0/1)
 */
import { inferSegmento } from './sheetSources.js'

/** Texto de columna DÍA 0 / DÍA 1 → sigla de asistencia */
export function diaStatusToSigla(status, obs = '') {
  if (!status) return null
  const s = String(status).trim().toUpperCase()
  const o = String(obs || '').trim().toUpperCase()

  if (s === 'A' || s.includes('ASISTIO') || s === 'I-OP' || s.includes('INGRESO OP')) return 'A'
  if (s === 'FI' || s.includes('FALTA') || s.includes('AUSENTE')) return 'FI'
  if (s === 'FJ' || s.includes('JUSTIFIC')) return 'FJ'
  if (s === 'B' || s.includes('DESISTE') || s.includes('BAJA')) return 'B'
  if (s.includes('I-OP')) return 'I-OP'

  if (o.includes('DESISTE') || o.includes('SALUD') || o.includes('VIAJE')) return 'B'
  return s.length <= 6 ? s : 'A'
}

export function bajaMotivoFromObs(obs) {
  const o = String(obs || '').trim().toUpperCase()
  if (!o) return 'BAJA DIA 1'
  if (o.includes('SALUD')) return 'SALUD'
  if (o.includes('VIAJE')) return 'VIAJE'
  if (o.includes('ECONOM')) return 'ECONÓMICO'
  if (o.includes('NO RESPONDE') || o.includes('NO CONTACTO')) return 'NO CONTACTO'
  if (o.includes('DESISTE')) return 'BAJA DIA 1'
  return o.length > 80 ? o.slice(0, 80) : o
}

/** Registros de asistencia derivados de columnas DÍA 0 / DÍA 1 del consolidado */
export function asistenciaRecordsFromNominaRow(payload) {
  const records = []
  const grupo = payload.grupo_codigo
  const doc = payload.documento
  if (!grupo || !doc) return records

  const push = (fecha, status, obs) => {
    const sigla = diaStatusToSigla(status, obs)
    if (!sigla || !fecha) return
    records.push({
      documento: doc,
      grupo_codigo: grupo,
      fecha_asistencia: fecha,
      sigla,
      motivo_baja: sigla === 'B' ? bajaMotivoFromObs(obs) : null,
    })
  }

  push(payload.fecha_fin_capacitacion || payload.fecha_inicio_capacitacion, payload.dia_0_status || payload.dia_0, payload.dia_0_obs)
  push(payload.fecha_conexion_op || payload.fecha_conexion_ojt, payload.dia_1_status || payload.dia_1, payload.dia_1_obs)

  return records
}

/** Metadatos de grupo únicos a partir de filas importadas */
export function extractGruposFromRows(rows) {
  const map = new Map()
  for (const r of rows) {
    const codigo = r.grupo_codigo?.trim().toUpperCase()
    if (!codigo) continue
    if (map.has(codigo)) continue
    map.set(codigo, {
      codigo,
      campana_nombre: r.campana,
      segmento: inferSegmento(r.campana),
      semana_trabajo: r.semana_trabajo,
      semana_label: `SEM ${r.semana_trabajo}`,
      modalidad: ['REMOTO', 'PRESENCIAL', 'HIBRIDO'].includes(r.modalidad) ? r.modalidad : 'REMOTO',
      condicion: r.condicion,
      rango_horario: r.horario_gestion,
      fecha_registro: r.fecha_inicio_capacitacion,
      periodo: r.periodo_reclutado,
      fecha_inicio_ojt: r.fecha_conexion_ojt,
      fecha_ingreso_op: r.fecha_conexion_op,
      estado: 'ACTIVO',
    })
  }
  return [...map.values()]
}

/** Payload nómina → JSONB para RPC registrar_nomina (sin campos auxiliares) */
export function toRegistrarNominaRpc(payload, ids) {
  const estado = payload.estado && ['RECLUTADO', 'EN_CAPACITACION', 'EN_OJT', 'EN_OPERACION', 'BAJA', 'CESADO'].includes(payload.estado)
    ? payload.estado
    : (payload.grupo_codigo ? 'EN_CAPACITACION' : 'RECLUTADO')

  return {
    documento: payload.documento,
    tipo_documento: payload.tipo_documento,
    apellido_paterno: payload.apellido_paterno,
    apellido_materno: payload.apellido_materno,
    nombres: payload.nombres,
    celular: payload.celular,
    celular_referencia: payload.celular_referencia,
    correo: payload.correo,
    genero: payload.genero,
    fecha_nacimiento: payload.fecha_nacimiento,
    estado_civil: payload.estado_civil,
    n_hijos: payload.n_hijos,
    nivel_academico: payload.nivel_academico,
    carrera: payload.carrera,
    nacionalidad: payload.nacionalidad,
    lugar_residencia: payload.lugar_residencia,
    distrito_residencia: payload.distrito_residencia,
    direccion_domicilio: payload.direccion_domicilio,
    periodo_reclutado: payload.periodo_reclutado,
    semana_trabajo: payload.semana_trabajo,
    reclutador_id: ids.reclutador_id,
    sede_id: ids.sede_id,
    campana: ids.campana,
    fuente_oferta: payload.fuente_oferta,
    observacion_reclutamiento: payload.observacion,
    exp_call_center: payload.exp_call_center,
    exp_tipo_campana: payload.exp_tipo_campana,
    exp_tiempo_campana: payload.exp_tiempo_campana,
    exp_otra: payload.exp_otra,
    exp_tiempo_otra: payload.exp_tiempo_otra,
    grupo_codigo: payload.grupo_codigo,
    modalidad: payload.modalidad,
    condicion: payload.condicion,
    horario_gestion: payload.horario_gestion,
    descanso: payload.descanso,
    envio_dni: payload.envio_dni,
    test_psicologico: payload.test_psicologico,
    validacion_pc: payload.validacion_pc,
    evaluacion_dia_0: payload.evaluacion_dia_0 || payload.dia_0_status,
    fecha_inicio_capacitacion: payload.fecha_inicio_capacitacion,
    fecha_fin_capacitacion: payload.fecha_fin_capacitacion,
    fecha_conexion_ojt: payload.fecha_conexion_ojt,
    fecha_conexion_op: payload.fecha_conexion_op,
    pago_capacitacion: payload.pago_capacitacion,
    tipo_contratacion: payload.tipo_contratacion,
    razon_social: payload.razon_social,
    remuneracion: payload.remuneracion,
    bono_variable: payload.bono_variable,
    bono_movilidad: payload.bono_movilidad,
    bono_bienvenida: payload.bono_bienvenida,
    bono_permanencia: payload.bono_permanencia,
    bono_asistencia_perfecta: payload.bono_asistencia_perfecta,
    cargo_contractual: payload.cargo_contractual,
    dia_0: payload.dia_0,
    dia_0_obs: payload.dia_0_obs,
    status_dia_1: payload.status_dia_1,
    dia_1: payload.dia_1,
    dia_1_obs: payload.dia_1_obs,
    doc_cv: payload.doc_cv,
    doc_dni_adjunto: payload.doc_dni_adjunto,
    doc_certijoven: payload.doc_certijoven,
    doc_recibo_servicios: payload.doc_recibo_servicios,
    doc_ficha_datos: payload.doc_ficha_datos,
    doc_autorizacion: payload.doc_autorizacion,
    observacion_estado: payload.observacion_estado,
    estado,
  }
}
