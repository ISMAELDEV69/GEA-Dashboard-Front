
function parseTimestamp(val) {
  if (!val) return null
  const s = String(val).trim()
  if (!s || s === '-' || s === '0') return null
  // If DD/MM/YYYY HH:MM:SS or DD/MM/YYYY
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/)
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
  if (/^\d{5}(?:\.\d+)?$/.test(s)) {
    const serial = parseFloat(s)
    if (serial >= 30000 && serial <= 60000) {
      const d = new Date((serial - 25569) * 86400 * 1000)
      if (!isNaN(d.getTime())) return d.toISOString()
    }
  }
  // Try direct Date parse if looks like a date format (contains / or - or T)
  if (s.includes('/') || s.includes('-') || s.includes('T')) {
    const parsedDate = new Date(s)
    if (!isNaN(parsedDate.getTime()) && parsedDate.getFullYear() >= 1990 && parsedDate.getFullYear() <= 2100) {
      return parsedDate.toISOString()
    }
  }
  return null
}

import { parseExcelDate } from './capacidadRysSchema.js'

// No UI Form structure needed yet since Phase B will be a grid
export const NOMINA_DB_FIELDS = [
  'marca_temporal', 'periodo_reclutado', 'semana_trabajo', 'reclutador', 'sede', 'tipo_documento', 'documento',
  'postulante_documento', 'grupo_id', 'origen',
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
  const colIdx = {}

  let tiempoExpCount = 0
  let observacionCount = 0

  headers.forEach((h, i) => {
    // Exact matching where possible, fallback to includes
    if (h.includes('MARCA TEMPORAL') || h.includes('TIMESTAMP') || h === 'HORA DE REGISTRO') colIdx['marca_temporal'] = i
    else if (h.includes('PERIODO RECLUTADO') || h === 'PERIODO' || h.includes('PERÍODO')) colIdx['periodo_reclutado'] = i
    else if (h.includes('SEMANA DE TRABAJO') || h === 'SEMANA') colIdx['semana_trabajo'] = i
    else if (h.includes('RECLUTADOR') || h.includes('SELECCIONADOR') || h.includes('PSICOLOG') || h.includes('QUIEN TE CONTACTO') || h.includes('QUIÉN TE CONTACTÓ')) colIdx['reclutador'] = i
    else if (h.includes('CAMPAÑA') || h.includes('CAMPANA') || h.includes('A QUE CAMPAÑA') || h.includes('A QUÉ CAMPAÑA')) colIdx['campana'] = i
    else if (h.includes('SEDE')) colIdx['sede'] = i
    else if (h.includes('TIPO DE DOCUMENTO') || h === 'TIPO DOC') colIdx['tipo_documento'] = i
    else if (h.includes('DNI') || h.includes('DOCUMENTO') || h.includes('C.E.') || h.includes('CEDULA') || h === 'NRO DE IDENTIFICACION' || h === 'NUMERO DE IDENTIFICACION') {
      if (colIdx['documento'] === undefined) colIdx['documento'] = i
    }
    else if (h.includes('APELLIDO PATERNO') || h === 'PATERNO') colIdx['apellido_paterno'] = i
    else if (h.includes('APELLIDO MATERNO') || h === 'MATERNO') colIdx['apellido_materno'] = i
    else if (h.includes('APELLIDOS') && colIdx['apellido_paterno'] === undefined) colIdx['apellido_paterno'] = i
    else if (h.includes('NOMBRES') || h.includes('NOMBRE COMPLETO') || h === 'NOMBRE') {
      if (colIdx['nombres'] === undefined) colIdx['nombres'] = i
    }
    else if (h.includes('CELULAR') || h.includes('MÓVIL') || h.includes('MOVIL') || h.includes('TELEFONO') || h.includes('TELÉFONO')) {
      if (h.includes('REFERENCIA') || h.includes('EMERGENCIA') || h.includes('FAMILIAR')) colIdx['celular_referencia'] = i
      else if (colIdx['celular'] === undefined) colIdx['celular'] = i
    }
    else if (h.includes('CORREO') || h.includes('EMAIL') || h.includes('E-MAIL')) colIdx['correo'] = i
    else if (h.includes('GÉNERO') || h.includes('GENERO') || h.includes('SEXO')) colIdx['genero'] = i
    else if (h.includes('FECHA DE NACIMIENTO') || h.includes('F. NACIMIENTO') || h.includes('NACIMIENTO')) colIdx['fecha_nacimiento'] = i
    else if (h === 'EDAD' || h.includes('EDAD')) colIdx['edad'] = i
    else if (h.includes('ESTADO CIVIL')) colIdx['estado_civil'] = i
    else if (h.includes('HIJOS') || h.includes('N° DE HIJOS')) colIdx['n_hijos'] = i
    else if (h.includes('NIVEL ACADÉMICO') || h.includes('NIVEL ACADEMICO') || h.includes('GRADO DE INSTRUCCION')) colIdx['nivel_academico'] = i
    else if (h.includes('CARREA') || h.includes('CARRERA') || h.includes('PROFESION') || h.includes('PROFESIÓN')) colIdx['carrera'] = i
    else if (h.includes('NACIONALIDAD') || h.includes('PAÍS') || h.includes('PAIS')) colIdx['nacionalidad'] = i
    else if (h.includes('LUGAR DE RESIDENCIA') || h.includes('RESIDENCIA')) colIdx['lugar_residencia'] = i
    else if (h.includes('DISTRITO')) colIdx['distrito_residencia'] = i
    else if (h.includes('DIRECCIÓN') || h.includes('DIRECCION') || h.includes('DOMICILIO')) colIdx['direccion_domicilio'] = i
    else if (h.includes('EXPERIENCIA') && (h.includes('CALL') || h.includes('CENTER'))) colIdx['exp_call_center'] = i
    else if (h.includes('TIPO DE EXPERIENCIA')) colIdx['exp_tipo_campana'] = i
    else if (h.includes('TIEMPO DE EXPERIENCIA') || h.includes('CUANTO TIEMPO')) {
      if (tiempoExpCount === 0) colIdx['exp_tiempo_call'] = i
      if (tiempoExpCount === 1) colIdx['exp_tiempo_otra'] = i
      tiempoExpCount++
    }
    else if (h.includes('OTRA EXPERIENCIA')) colIdx['exp_otra'] = i
    else if (h.includes('OFERTA') || h.includes('ENTERASTE') || h.includes('FUENTE')) colIdx['fuente_oferta'] = i
    else if (h === 'STATUS DÍA 1' || h === 'STATUS DIA 1' || h === 'STATUS' || h === 'ESTADO DÍA 1' || h === 'ESTADO DIA 1') colIdx['status_dia_1'] = i
    else if (h === 'DÍA 0' || h === 'DIA 0' || h === 'ASISTENCIA DÍA 0' || h === 'ASISTENCIA DIA 0') colIdx['dia_0'] = i
    else if (h === 'DÍA 1' || h === 'DIA 1' || h === 'ASISTENCIA DÍA 1' || h === 'ASISTENCIA DIA 1') colIdx['dia_1'] = i
    else if (h.includes('OBSERVACIONES DÍA 0') || h.includes('OBS DÍA 0') || h.includes('OBS DIA 0')) colIdx['dia_0_obs'] = i
    else if (h.includes('OBSERVACIONES DÍA 1') || h.includes('OBS DÍA 1') || h.includes('OBS DIA 1')) colIdx['dia_1_obs'] = i
    else if (h === 'EVALUAR' || h.includes('EVALUAR')) colIdx['evaluar'] = i
    else if (h === 'OBS. EVALUAR' || h === 'OBS EVALUAR') colIdx['obs_evaluar'] = i
    else if (h === 'OBSERVACION' || h === 'OBSERVACIONES' || h.includes('OBSERVACION RECLUTAMIENTO')) {
      if (observacionCount === 0) colIdx['observacion_reclutamiento'] = i
      else if (observacionCount === 1) colIdx['dia_0_obs'] = i
      else if (observacionCount === 2) colIdx['dia_1_obs'] = i
      else if (observacionCount === 3) colIdx['observacion_final'] = i
      observacionCount++
    }
  })

  return colIdx
}

/**
 * Valida si un valor parece un documento de identidad válido (DNI, CE, Pasaporte)
 * y descarta textos de apuntes, notas, subtotales o encabezados repetidos.
 */
export function isValidDocumento(val) {
  if (!val) return false
  const s = String(val).trim().toUpperCase()
  if (s.length < 5 || s.length > 25) return false
  
  // Lista de palabras clave que suelen aparecer en notas, tablas secundarias o resúmenes al pie de página
  const invalidKeywords = [
    'TOTAL', 'SUBTOTAL', 'NOTA', 'NOTAS', 'OBSERVACION', 'OBSERVACIONES', 'OBS',
    'RESUMEN', 'FIRMA', 'APUNTES', 'COORDINAR', 'PENDIENTE', 'REVISADO', 'FECHA',
    'PROMEDIO', 'GRUPO', 'CAMPANA', 'CAMPAÑA', 'SEDE', 'RECLUTADOR', 'NRO', 'DNI', 'C.E.',
    'HORARIO', 'HORARIOS', 'ESPECIAL', 'ESPECIALES', 'SOLICITUD', 'SOLICITUDES', 'CAPACITACION',
    'PRESENCIAL', 'DESCANSO', 'ESTUDIO', 'ESTUDIOS', 'CAIDOS', 'CAÍDOS', 'DESISTIDO', 'DESISTIDOS', 'BAJA', 'BAJAS'
  ]
  if (invalidKeywords.some(kw => s.includes(kw))) return false
  
  // Debe contener al menos algún número o formato alfanumérico de documento válido
  return /[0-9]/.test(s) && /^[A-Z0-9\-_.]+$/i.test(s)
}

export function parseGoogleFormRow(row, colIdx) {
  const get = (key) => {
    const i = colIdx[key]
    return i >= 0 ? row[i] : null
  }

  const str = (k) => String(get(k) || '').trim() || null
  const rawDoc = str('documento')

  // Si no tiene un documento válido (es nota, apunte o fila vacía), retornar null
  if (!isValidDocumento(rawDoc)) {
    return null
  }

  const rawNombres = str('nombres')
  const rawApPaterno = str('apellido_paterno')
  
  // Si tampoco tiene nombres ni apellido, es una fila basura
  if (!rawNombres && !rawApPaterno) {
    return null
  }

  let rawStatusDia1 = str('status_dia_1')
  let rawDia0 = str('dia_0')
  let rawDia1 = str('dia_1')
  let rawDia0Obs = str('dia_0_obs')
  let rawDia1Obs = str('dia_1_obs')
  let rawObs = str('observacion_reclutamiento')

  // Normalizar detección de AGREGADO / AGREGADO A DÍA X
  const allRowText = [rawStatusDia1, rawDia0, rawDia1, rawDia0Obs, rawDia1Obs, rawObs]
    .filter(Boolean)
    .join(' ')
    .toUpperCase()

  if (allRowText.includes('AGREGADO') || allRowText.includes('RECUPERADO')) {
    if (!rawStatusDia1 || rawStatusDia1 === '-' || rawStatusDia1.includes('AGREGADO')) {
      rawStatusDia1 = allRowText.includes('RECUPERADO') ? 'RECUPERADO' : 'AGREGADO'
    }
    // Si viene como "AGREGADO A DÍA 2", "AGREGADO AL DÍA 2", etc.
    const matchAgregadoDia = allRowText.match(/AGREGADO\s+(?:A|AL)\s+D[IÍ]A\s*(\d+)/i)
    if (matchAgregadoDia) {
      const diaNum = parseInt(matchAgregadoDia[1], 10)
      rawDia1Obs = `AGREGADO A DÍA ${diaNum}`
      // Si fue agregado en Día 2 o posterior, Día 0 y Día 1 quedan como FALTA
      if (diaNum >= 2) {
        if (!rawDia0 || rawDia0 === '-' || rawDia0.includes('AGREGADO')) rawDia0 = 'FALTA'
        if (!rawDia1 || rawDia1 === '-' || rawDia1.includes('AGREGADO')) rawDia1 = 'FALTA'
      }
    }
  }

  return {
    marca_temporal: parseTimestamp(str('marca_temporal')),
    periodo_reclutado: str('periodo_reclutado'),
    semana_trabajo: parseInt(get('semana_trabajo')) || null,
    reclutador: str('reclutador'),
    sede: str('sede'),
    tipo_documento: str('tipo_documento') || 'DNI',
    documento: rawDoc,
    apellido_paterno: rawApPaterno,
    apellido_materno: str('apellido_materno'),
    nombres: rawNombres,
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
    observacion_reclutamiento: rawObs,
    status_dia_1: rawStatusDia1 || 'APTO',
    dia_0: rawDia0 || null,
    dia_0_obs: rawDia0Obs || null,
    dia_1: rawDia1 || null,
    dia_1_obs: rawDia1Obs || null,
    evaluar: str('evaluar') || null,
    obs_evaluar: str('obs_evaluar') || null,
  }
}

/**
 * Parsea una matriz bidimensional (CSV / Excel) a filas de nómina válidas,
 * omitiendo automáticamente notas al pie, subtotales, tablas secundarias y filas vacías.
 */
export function parseNominaRows(matrix = [], defaults = {}) {
  if (!Array.isArray(matrix) || matrix.length < 2) return []

  // Buscar fila de encabezados
  let headerIndex = -1
  for (let i = 0; i < Math.min(matrix.length, 15); i++) {
    const row = matrix[i] || []
    if (row.some(c => {
      const s = String(c || '').toUpperCase()
      return s.includes('DNI') || s.includes('DOCUMENTO') || (s.includes('NOMBRES') && s.includes('APELLIDO'))
    })) {
      headerIndex = i
      break
    }
  }

  if (headerIndex === -1) return []

  const colIdx = mapGoogleFormHeaders(matrix[headerIndex])
  const results = []
  for (let i = headerIndex + 1; i < matrix.length; i++) {
    const row = matrix[i]
    if (!row || !row.length) continue

    const rowCells = row.map(c => String(c || '').toUpperCase().trim()).filter(Boolean)
    const isSecondaryHeader = rowCells.some(cell => 
      cell === 'HORARIO ESPECIAL' || 
      cell.startsWith('HORARIO ESPECIAL') || 
      cell === 'HORARIOS ESPECIALES' ||
      cell === 'SOLICITUDES DE HORARIO'
    )
    if (isSecondaryHeader && !rowCells.some(cell => /^\d{8}$/.test(cell))) {
      break
    }

    const parsed = parseGoogleFormRow(row, colIdx)
    if (!parsed) continue

    // Inyectar defaults si no vienen en la fila
    if (defaults.periodo && !parsed.periodo_reclutado) parsed.periodo_reclutado = defaults.periodo
    if (defaults.semana && !parsed.semana_trabajo) parsed.semana_trabajo = defaults.semana
    if (defaults.reclutador && !parsed.reclutador) parsed.reclutador = defaults.reclutador

    results.push(parsed)
  }

  return results
}

/**
 * Parsea un texto CSV simple a matriz 2D
 */
export function parseCsvToMatrix(text) {
  if (!text) return []
  const lines = text.split(/\r?\n/)
  return lines.map(line => {
    // Regex básico para CSV con comillas
    const row = []
    let inQuotes = false
    let current = ''
    for (let i = 0; i < line.length; i++) {
      const char = line[i]
      if (char === '"' || char === "'") {
        inQuotes = !inQuotes
      } else if (char === ',' && !inQuotes) {
        row.push(current.trim())
        current = ''
      } else {
        current += char
      }
    }
    row.push(current.trim())
    return row
  }).filter(r => r.some(c => c !== ''))
}

// Dummy exports to satisfy legacy imports
export const NOMINA_FORM_GROUPS = []
export const STEP_LABELS = []
export const STEP_FIELDS = {}
export const REQUIRED_NOMINA_FIELDS = []
export const applyNominaPayloadToForm = () => {}
export const parseMoney = () => 0
export const NOMINA_FIELD_META = {}
