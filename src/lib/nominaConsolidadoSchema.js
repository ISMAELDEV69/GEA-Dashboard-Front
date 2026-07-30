
function parseTimestamp(val) {
  if (!val) return null
  const s = String(val).trim()
  // If DD/MM/YYYY HH:MM:SS
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{1,2}):(\d{1,2}))?/)
  if (m) {
    const yyyy = m[3]
    const mm = m[2].padStart(2, '0')
    const dd = m[1].padStart(2, '0')
    const hh = (m[4] || '00').padStart(2, '0')
    const min = (m[5] || '00').padStart(2, '0')
    const ss = (m[6] || '00').padStart(2, '0')
    return `${yyyy}-${mm}-${dd}T${hh}:${min}:${ss}`
  }
  // Try Excel serial datetime (e.g. 45000.418)
  if (/^\d+\.\d+$/.test(s) || /^\d{5}$/.test(s)) {
    const serial = parseFloat(s)
    const d = new Date((serial - 25569) * 86400 * 1000)
    return d.toISOString()
  }
  return s // fallback
}

import { parseExcelDate } from './capacidadRysSchema.js'

// No UI Form structure needed yet since Phase B will be a grid
export const NOMINA_DB_FIELDS = [
  'marca_temporal', 'periodo_reclutado', 'semana_trabajo', 'reclutador', 'sede', 'tipo_documento', 'documento',
  'apellido_paterno', 'apellido_materno', 'nombres', 'celular', 'celular_referencia', 'correo',
  'genero', 'fecha_nacimiento', 'edad', 'estado_civil', 'n_hijos', 'nivel_academico', 'carrera',
  'nacionalidad', 'lugar_residencia', 'distrito_residencia', 'direccion_domicilio',
  'exp_call_center', 'exp_tipo_campana', 'exp_tiempo_call', 'exp_otra', 'exp_tiempo_otra',
  'fuente_oferta', 'observacion_reclutamiento', 'campana', 'grupo_codigo', 'modalidad',
  'condicion', 'horario_gestion', 'descanso', 'envio_dni', 'test_psicologico', 'validacion_pc',
  'evaluacion_dia_0', 'fecha_inicio_capacitacion', 'fecha_fin_capacitacion', 'fecha_conexion_ojt',
  'fecha_conexion_op', 'pago_capacitacion', 'tipo_contratacion', 'razon_social', 'remuneracion',
  'bono_variable', 'bono_movilidad', 'bono_bienvenida', 'bono_permanencia', 'bono_asistencia_perfecta',
  'cargo_contractual', 'dia_0', 'dia_0_obs', 'status_dia_1', 'dia_1', 'dia_1_obs',
  'doc_cv', 'doc_dni_adjunto', 'doc_certijoven', 'doc_recibo_servicios', 'doc_ficha_datos',
  'doc_autorizacion', 'status_final', 'observacion_final', 'validacion_reingreso', 'fecha_validacion', 'observacion_reingreso', 'evaluar', 'obs_evaluar'
]

// The exact column headers from the form to parse
const HEADER_ALIASES = {
  periodo_reclutado: ['PERIODO RECLUTADO'],
  semana_trabajo: ['SEMANA DE TRABAJO'],
  reclutador: ['RECLUTADOR'],
  sede: ['SEDE'],
  tipo_documento: ['TIPO DE DOCUMENTO'],
  documento: ['NRO DE DNI O C.E.', 'NRO DE DNI'],
  apellido_paterno: ['APELLIDO PATERNO'],
  apellido_materno: ['APELLIDO MATERNO'],
  nombres: ['NOMBRES COMPLETOS'],
  celular: ['NÚMERO DE CELULAR / MÓVIL', 'NÚMERO DE CELULAR', 'CELULAR'],
  celular_referencia: ['NÚMERO DE CELULAR DE REFERENCIA'],
  correo: ['CORREO ELECTRONICO'],
  genero: ['GÉNERO O SEXO DEL POSTULANTE'],
  fecha_nacimiento: ['FECHA DE NACIMIENTO'],
  edad: ['EDAD'],
  estado_civil: ['ESTADO CIVIL'],
  n_hijos: ['N° DE HIJOS', 'N° DE HIJOS'],
  nivel_academico: ['NIVEL ACADÉMICO'],
  carrera: ['MENCIONAR CARREA', 'MENCIONAR CARRERA'],
  nacionalidad: ['NACIONALIDAD'],
  lugar_residencia: ['LUGAR DE RESIDENCIA ACTUAL'],
  distrito_residencia: ['DISTRITO DE RESIDENCIA'],
  direccion_domicilio: ['DIRECCIÓN DE DOMICILIO ACTUAL'],
  exp_call_center: ['¿CUENTAS CON EXPERIENCIA LABORAL EN CALL CENTER?'],
  exp_tipo_campana: ['¿QUE TIPO DE EXPERIENCIA TIENES? ( ORIENTADO A LA CAMPAÑA QUE POSTULAS)'],
  exp_tiempo_call: ['TIEMPO DE EXPERIENCIA'], // First occurrence
  exp_otra: ['DETALLANOS OTRA EXPERIENCIA LABORAL'],
  exp_tiempo_otra: ['TIEMPO DE EXPERIENCIA2'], // We'll handle duplicate manually
  fuente_oferta: ['¿CÓMO TE ENTERASTE DE LA OFERTA LABORAL?'],
  observacion_reclutamiento: ['OBSERVACION'], // First occurrence
}

export function mapGoogleFormHeaders(headerRow = []) {
  const headers = headerRow.map(h => String(h || '').toUpperCase().trim())
  const colIdx = { marca_temporal: 0 }

  let tiempoExpCount = 0
  let observacionCount = 0

  headers.forEach((h, i) => {
    // Exact matching where possible, fallback to includes
    if (h.includes('MARCA TEMPORAL') || h.includes('TIMESTAMP')) colIdx['marca_temporal'] = i
    else if (h.includes('PERIODO RECLUTADO')) colIdx['periodo_reclutado'] = i
    else if (h.includes('SEMANA DE TRABAJO')) colIdx['semana_trabajo'] = i
    else if (h.includes('RECLUTADOR')) colIdx['reclutador'] = i
    else if (h.includes('SEDE')) colIdx['sede'] = i
    else if (h.includes('TIPO DE DOCUMENTO')) colIdx['tipo_documento'] = i
    else if (h.includes('NRO DE DNI O C.E.')) colIdx['documento'] = i
    else if (h.includes('APELLIDO PATERNO')) colIdx['apellido_paterno'] = i
    else if (h.includes('APELLIDO MATERNO')) colIdx['apellido_materno'] = i
    else if (h.includes('NOMBRES COMPLETOS')) colIdx['nombres'] = i
    else if (h.includes('CELULAR / MÓVIL') || h === 'NÚMERO DE CELULAR / MÓVIL') colIdx['celular'] = i
    else if (h.includes('CELULAR DE REFERENCIA')) colIdx['celular_referencia'] = i
    else if (h.includes('CORREO ELECTRONICO')) colIdx['correo'] = i
    else if (h.includes('GÉNERO O SEXO')) colIdx['genero'] = i
    else if (h.includes('FECHA DE NACIMIENTO')) colIdx['fecha_nacimiento'] = i
    else if (h === 'EDAD' || h.includes('EDAD')) colIdx['edad'] = i
    else if (h.includes('ESTADO CIVIL')) colIdx['estado_civil'] = i
    else if (h.includes('N° DE HIJOS')) colIdx['n_hijos'] = i
    else if (h.includes('NIVEL ACADÉMICO') || h.includes('NIVEL ACADEMICO')) colIdx['nivel_academico'] = i
    else if (h.includes('MENCIONAR CARREA') || h.includes('MENCIONAR CARRERA')) colIdx['carrera'] = i
    else if (h.includes('NACIONALIDAD')) colIdx['nacionalidad'] = i
    else if (h.includes('LUGAR DE RESIDENCIA ACTUAL')) colIdx['lugar_residencia'] = i
    else if (h.includes('DISTRITO DE RESIDENCIA')) colIdx['distrito_residencia'] = i
    else if (h.includes('DIRECCIÓN DE DOMICILIO ACTUAL') || h.includes('DIRECCION DE DOMICILIO')) colIdx['direccion_domicilio'] = i
    else if (h.includes('¿CUENTAS CON EXPERIENCIA LABORAL EN CALL CENTER?')) colIdx['exp_call_center'] = i
    else if (h.includes('¿QUE TIPO DE EXPERIENCIA TIENES?')) colIdx['exp_tipo_campana'] = i
    else if (h.includes('TIEMPO DE EXPERIENCIA')) {
      if (tiempoExpCount === 0) colIdx['exp_tiempo_call'] = i
      if (tiempoExpCount === 1) colIdx['exp_tiempo_otra'] = i
      tiempoExpCount++
    }
    else if (h.includes('DETALLANOS OTRA EXPERIENCIA LABORAL')) colIdx['exp_otra'] = i
    else if (h.includes('¿CÓMO TE ENTERASTE DE LA OFERTA LABORAL?')) colIdx['fuente_oferta'] = i
    else if (h === 'OBSERVACION' || h === 'OBSERVACIONES') {
      if (observacionCount === 0) colIdx['observacion_reclutamiento'] = i
      if (observacionCount === 1) colIdx['dia_0_obs'] = i
      if (observacionCount === 2) colIdx['dia_1_obs'] = i
      if (observacionCount === 3) colIdx['observacion_final'] = i
      observacionCount++
    }
  })

  return colIdx
}

export function parseGoogleFormRow(row, colIdx) {
  const get = (key) => {
    const i = colIdx[key]
    return i >= 0 ? row[i] : null
  }

  const str = (k) => String(get(k) || '').trim() || null

  return {
    marca_temporal: parseTimestamp(str('marca_temporal')),
    periodo_reclutado: str('periodo_reclutado'),
    semana_trabajo: parseInt(get('semana_trabajo')) || null,
    reclutador: str('reclutador'),
    sede: str('sede'),
    tipo_documento: str('tipo_documento'),
    documento: str('documento'),
    apellido_paterno: str('apellido_paterno'),
    apellido_materno: str('apellido_materno'),
    nombres: str('nombres'),
    celular: str('celular'),
    celular_referencia: str('celular_referencia'),
    correo: str('correo'),
    genero: str('genero'),
    fecha_nacimiento: parseExcelDate(get('fecha_nacimiento')),
    edad: parseInt(get('edad')) || null,
    estado_civil: str('estado_civil'),
    n_hijos: parseInt(get('n_hijos')) || null,
    nivel_academico: str('nivel_academico'),
    carrera: str('carrera'),
    nacionalidad: str('nacionalidad'),
    lugar_residencia: str('lugar_residencia'),
    distrito_residencia: str('distrito_residencia'),
    direccion_domicilio: str('direccion_domicilio'),
    exp_call_center: str('exp_call_center'),
    exp_tipo_campana: str('exp_tipo_campana'),
    exp_tiempo_call: str('exp_tiempo_call'),
    exp_otra: str('exp_otra'),
    exp_tiempo_otra: str('exp_tiempo_otra'),
    fuente_oferta: str('fuente_oferta'),
    observacion_reclutamiento: str('observacion_reclutamiento'),
  }
}

// Dummy exports to satisfy legacy imports
export const NOMINA_FORM_GROUPS = []
export const STEP_LABELS = []
export const STEP_FIELDS = {}
export const REQUIRED_NOMINA_FIELDS = []
export const parseNominaRows = () => []
export const applyNominaPayloadToForm = () => {}
export const parseMoney = () => 0
export const NOMINA_FIELD_META = {}
export const parseCsvToMatrix = () => []
