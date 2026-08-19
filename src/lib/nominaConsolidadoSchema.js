
function parseTimestamp(val) {
  if (!val) return null
  const s = String(val).trim()
  if (!s || s === '-' || s === '0') return null
  
  // If DD/MM/YYYY HH:MM:SS or D/M/YYYY H:M:S
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

  // If YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS
  const mIso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/)
  if (mIso) {
    const yyyy = mIso[1]
    const mm = mIso[2].padStart(2, '0')
    const dd = mIso[3].padStart(2, '0')
    const hh = (mIso[4] || '00').padStart(2, '0')
    const min = (mIso[5] || '00').padStart(2, '0')
    const ss = (mIso[6] || '00').padStart(2, '0')
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
  return s
}

import { parseExcelDate } from './capacidadRysSchema.js'

export const NOMINA_DB_FIELDS = [
  'marca_temporal', 'periodo_reclutado', 'semana_trabajo', 'reclutador', 'sede', 'tipo_documento', 'documento',
  'apellido_paterno', 'apellido_materno', 'nombres', 'celular', 'celular_referencia', 'correo',
  'genero', 'fecha_nacimiento', 'edad', 'estado_civil', 'n_hijos', 'nivel_academico', 'carrera',
  'nacionalidad', 'lugar_residencia', 'distrito_residencia', 'direccion_domicilio',
  'exp_call_center', 'exp_tipo_campana', 'exp_tiempo_call', 'exp_otra', 'exp_tiempo_otra',
  'fuente_oferta', 'observacion_reclutamiento', 'campana', 'segmento', 'grupo_codigo', 'modalidad',
  'condicion', 'horario_gestion', 'descanso', 'envio_dni', 'test_psicologico', 'validacion_pc',
  'evaluacion_dia_0', 'fecha_inicio_capacitacion', 'fecha_fin_capacitacion', 'fecha_conexion_ojt',
  'fecha_conexion_op', 'pago_capacitacion', 'tipo_contratacion', 'razon_social', 'remuneracion',
  'bono_variable', 'bono_movilidad', 'bono_bienvenida', 'bono_permanencia', 'bono_asistencia_perfecta',
  'cargo_contractual', 'dia_0', 'dia_0_obs', 'status_dia_1', 'dia_1', 'dia_1_obs',
  'doc_cv', 'doc_dni_adjunto', 'doc_certijoven', 'doc_recibo_servicios', 'doc_ficha_datos',
  'doc_autorizacion', 'status_final', 'observacion_final', 'validacion_reingreso', 'fecha_validacion', 'observacion_reingreso', 'evaluar', 'obs_evaluar',
  'estado', 'observacion_estado', 'activo'
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

  headers.forEach((h, i) => {
    // Normalizar texto eliminando saltos de línea y espacios extra
    const clean = h.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim()

    if (clean.includes('MARCA TEMPORAL') || clean.includes('TIMESTAMP') || clean === 'HORA DE REGISTRO') colIdx['marca_temporal'] = i
    else if (clean.includes('PERIODO RECLUTADO') || clean === 'PERIODO' || clean.includes('PERÍODO')) colIdx['periodo_reclutado'] = i
    else if (clean.includes('SEMANA DE TRAB') || clean.includes('SEMANA')) colIdx['semana_trabajo'] = i
    else if (clean.includes('RECLUTADOR') || clean.includes('SELECCIONADOR') || clean.includes('PSICOLOG') || clean.includes('QUIEN TE CONTACTO') || clean.includes('QUIÉN TE CONTACTÓ')) colIdx['reclutador'] = i
    else if (clean.includes('CAMPAÑA') || clean.includes('CAMPANA') || clean.includes('A QUE CAMPAÑA') || clean.includes('A QUÉ CAMPAÑA')) colIdx['campana'] = i
    else if (clean.includes('SEDE')) colIdx['sede'] = i
    else if (clean.includes('TIPO DE DOCUMENTO') || clean === 'TIPO DOC') colIdx['tipo_documento'] = i
    else if (clean.includes('DNI') || clean.includes('DOCUMENTO') || clean.includes('C.E.') || clean.includes('CEDULA') || clean.includes('IDENTIFICACION') || clean.includes('IDENTIFICACIÓN')) {
      if (colIdx['documento'] === undefined) colIdx['documento'] = i
    }
    else if (clean.includes('APELLIDO PATERNO') || clean === 'PATERNO') colIdx['apellido_paterno'] = i
    else if (clean.includes('APELLIDO MATERNO') || clean === 'MATERNO') colIdx['apellido_materno'] = i
    else if ((clean === 'APELLIDOS' || clean.includes('APELLIDOS Y NOMBRES') || clean.includes('APELLIDO(S)')) && colIdx['apellido_paterno'] === undefined) colIdx['apellido_paterno'] = i
    else if (clean.includes('NOMBRES') || clean.includes('NOMBRE COMPLETO') || clean === 'NOMBRE') {
      if (colIdx['nombres'] === undefined) colIdx['nombres'] = i
    }
    else if (clean.includes('CELULAR') || clean.includes('MÓVIL') || clean.includes('MOVIL') || clean.includes('TELEFONO') || clean.includes('TELÉFONO')) {
      if (clean.includes('REFERENCIA') || clean.includes('EMERGENCIA') || clean.includes('FAMILIAR')) colIdx['celular_referencia'] = i
      else if (colIdx['celular'] === undefined) colIdx['celular'] = i
    }
    else if (clean.includes('CORREO') || clean.includes('EMAIL') || clean.includes('E-MAIL')) colIdx['correo'] = i
    else if (clean.includes('GÉNERO') || clean.includes('GENERO') || clean.includes('SEXO')) colIdx['genero'] = i
    else if (clean.includes('FECHA DE NACIMIENTO') || clean.includes('F. NACIMIENTO') || clean.includes('NACIMIENTO')) colIdx['fecha_nacimiento'] = i
    else if (clean === 'EDAD' || clean.includes('EDAD')) colIdx['edad'] = i
    else if (clean.includes('ESTADO CIVIL')) colIdx['estado_civil'] = i
    else if (clean.includes('HIJOS') || clean.includes('N° DE HIJOS')) colIdx['n_hijos'] = i
    else if (clean.includes('NIVEL ACADÉMICO') || clean.includes('NIVEL ACADEMICO') || clean.includes('GRADO DE INSTRUCCION')) colIdx['nivel_academico'] = i
    else if (clean.includes('CARREA') || clean.includes('CARRERA') || clean.includes('PROFESION') || clean.includes('PROFESIÓN')) colIdx['carrera'] = i
    else if (clean.includes('NACIONALIDAD') || clean.includes('PAÍS') || clean.includes('PAIS')) colIdx['nacionalidad'] = i
    else if (clean.includes('LUGAR DE RESIDENCIA') || clean.includes('RESIDENCIA')) colIdx['lugar_residencia'] = i
    else if (clean.includes('DISTRITO')) colIdx['distrito_residencia'] = i
    else if (clean.includes('DIRECCIÓN') || clean.includes('DIRECCION') || clean.includes('DOMICILIO')) colIdx['direccion_domicilio'] = i
    else if (clean.includes('EXPERIENCIA') && (clean.includes('CALL') || clean.includes('CENTER'))) colIdx['exp_call_center'] = i
    else if (clean.includes('TIPO DE EXPERIENCIA')) colIdx['exp_tipo_campana'] = i
    else if (clean.includes('TIEMPO DE EXPERIENCIA') || clean.includes('CUANTO TIEMPO')) {
      if (colIdx['exp_tiempo_call'] === undefined) colIdx['exp_tiempo_call'] = i
      else if (colIdx['exp_tiempo_otra'] === undefined) colIdx['exp_tiempo_otra'] = i
    }
    else if (clean.includes('OTRA EXPERIENCIA')) colIdx['exp_otra'] = i
    else if (clean.includes('OFERTA') || clean.includes('ENTERASTE') || clean.includes('FUENTE')) colIdx['fuente_oferta'] = i
    else if (clean.includes('WTSP') || clean.includes('WHATSAPP')) colIdx['usuario_whatsapp'] = i
    else if (clean.includes('CARGO CONTRACTUAL') || clean.includes('CARGO') || clean.includes('PUESTO')) colIdx['cargo_contractual'] = i
    else if (clean.includes('BONO ASIST') || clean.includes('ONO ASIST')) colIdx['bono_asistencia_perfecta'] = i
    
    // Status Día 1
    else if (clean.includes('STATUS DIA 1') || clean.includes('STATUS DÍA 1') || clean.includes('STATUS DIA1') || clean.includes('STATUS DÍA1') || clean === 'STATUS' || clean === 'ESTADO DIA 1' || clean === 'ESTADO DÍA 1') colIdx['status_dia_1'] = i
    
    // Día 0 (Asistencia)
    else if (clean === 'DIA 0' || clean === 'DÍA 0' || clean === 'DIA0' || clean === 'DÍA0' || clean === 'D0' || clean.includes('ASISTENCIA DÍA 0') || clean.includes('ASISTENCIA DIA 0') || (clean.includes('DIA 0') && !clean.includes('OBS') && !clean.includes('MOTIVO')) || (clean.includes('DÍA 0') && !clean.includes('OBS') && !clean.includes('MOTIVO'))) colIdx['dia_0'] = i
    
    // Observaciones Día 0
    else if ((clean.includes('OBS') || clean.includes('MOTIVO')) && (clean.includes('DIA 0') || clean.includes('DÍA 0') || clean.includes('DIA0') || clean.includes('DÍA0') || clean.includes('D0'))) colIdx['dia_0_obs'] = i
    
    // Día 1 (Asistencia)
    else if (clean === 'DIA 1' || clean === 'DÍA 1' || clean === 'DIA1' || clean === 'DÍA1' || clean === 'D1' || clean.includes('ASISTENCIA DÍA 1') || clean.includes('ASISTENCIA DIA 1') || (clean.includes('DIA 1') && !clean.includes('STATUS') && !clean.includes('ESTADO') && !clean.includes('OBS') && !clean.includes('MOTIVO')) || (clean.includes('DÍA 1') && !clean.includes('STATUS') && !clean.includes('ESTADO') && !clean.includes('OBS') && !clean.includes('MOTIVO'))) colIdx['dia_1'] = i
    
    // Observaciones Día 1
    else if (clean.includes('NO ASISTIÓ DÍA 0') || clean.includes('NO ASISTIO DIA 0') || clean.includes('ASISTE DÍA1') || clean.includes('ASISTE DIA1') || clean.includes('ASISTE DÍA 1') || clean.includes('ASISTE DIA 1') || ((clean.includes('OBS') || clean.includes('MOTIVO')) && (clean.includes('DIA 1') || clean.includes('DÍA 1') || clean.includes('DIA1') || clean.includes('DÍA1') || clean.includes('D1')))) colIdx['dia_1_obs'] = i
    
    else if (clean.includes('OBS') && clean.includes('EVALUAR')) colIdx['obs_evaluar'] = i
    else if (clean.includes('EVALUAR')) colIdx['evaluar'] = i
  })

  // Segunda pasada contextual para columnas genéricas "OBSERVACIONES" o "OBS"
  headers.forEach((h, i) => {
    const clean = h.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim()
    if (clean === 'OBSERVACION' || clean === 'OBSERVACIONES' || clean === 'OBS' || clean === 'OBS.') {
      if (colIdx['dia_0'] !== undefined && (i === colIdx['dia_0'] + 1 || i === colIdx['dia_0'] + 2) && colIdx['dia_0_obs'] === undefined) {
        colIdx['dia_0_obs'] = i
      } else if (colIdx['dia_1'] !== undefined && (i === colIdx['dia_1'] + 1 || i === colIdx['dia_1'] + 2) && colIdx['dia_1_obs'] === undefined) {
        colIdx['dia_1_obs'] = i
      } else if (colIdx['observacion_reclutamiento'] === undefined) {
        colIdx['observacion_reclutamiento'] = i
      }
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

function normalizeAsistencia(val) {
  if (!val) return null
  const s = String(val).trim().toUpperCase()
  if (!s || s === '-' || s === '0' || s === 'NULL' || s === '--' || s === '...') return null
  if (s.includes('ASIST') || s === 'A' || s === 'SI' || s === 'SÍ' || s === 'OK' || s === 'PRESENTE') return 'ASISTIO'
  if (s.includes('FALT') || s === 'F' || s === 'FI' || s === 'FJ' || s === 'NO' || s === 'DESAPROBADO') return 'FALTA'
  if (s.includes('DESERT') || s.includes('BAJA') || s.includes('DESIST') || s === 'B' || s === 'CESE') return 'DESERTO'
  return s
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

  let rawNombres = str('nombres')
  let rawApPaterno = str('apellido_paterno')
  let rawApMaterno = str('apellido_materno')
  
  // Si tampoco tiene nombres ni apellido, es una fila basura
  if (!rawNombres && !rawApPaterno) {
    return null
  }

  // Descomposición inteligente de apellidos y nombres si vienen combinados
  if (rawApPaterno && !rawApMaterno && !rawNombres) {
    const parts = rawApPaterno.trim().split(/\s+/)
    if (parts.length >= 3) {
      rawApPaterno = parts[0]
      rawApMaterno = parts[1]
      rawNombres = parts.slice(2).join(' ')
    } else if (parts.length === 2) {
      rawApPaterno = parts[0]
      rawNombres = parts[1]
    }
  } else if (rawApPaterno && !rawApMaterno && rawNombres) {
    const apParts = rawApPaterno.trim().split(/\s+/)
    if (apParts.length === 2) {
      rawApPaterno = apParts[0]
      rawApMaterno = apParts[1]
    }
  }

  let rawStatusDia1 = str('status_dia_1')
  let rawDia0 = normalizeAsistencia(get('dia_0'))
  let rawDia1 = normalizeAsistencia(get('dia_1'))
  let rawDia0Obs = str('dia_0_obs')
  let rawDia1Obs = str('dia_1_obs')
  let rawObs = str('observacion_reclutamiento') || str('usuario_whatsapp')

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

  const normUpper = (k) => {
    const val = str(k)
    return val ? val.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase() : null
  }
  const normLower = (k) => {
    const val = str(k)
    return val ? val.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase() : null
  }
  const normPhone = (k) => {
    const val = str(k)
    if (!val) return null
    return val.replace(/[^\d+]/g, '').trim() || null
  }

  return {
    marca_temporal: parseTimestamp(str('marca_temporal')),
    periodo_reclutado: normUpper('periodo_reclutado'),
    semana_trabajo: parseInt(get('semana_trabajo')) || null,
    reclutador: normUpper('reclutador'),
    sede: normUpper('sede'),
    tipo_documento: normUpper('tipo_documento') || 'DNI',
    documento: rawDoc,
    apellido_paterno: rawApPaterno ? rawApPaterno.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase() : null,
    apellido_materno: rawApMaterno ? rawApMaterno.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase() : null,
    nombres: rawNombres ? rawNombres.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase() : null,
    celular: normPhone('celular') || normPhone('celular_referencia'),
    celular_referencia: normPhone('celular_referencia'),
    correo: normLower('correo'),
    genero: normUpper('genero'),
    fecha_nacimiento: parseExcelDate(get('fecha_nacimiento')),
    edad: parseInt(get('edad')) || null,
    estado_civil: normUpper('estado_civil'),
    n_hijos: parseInt(get('n_hijos')) || 0,
    nivel_academico: normUpper('nivel_academico'),
    carrera: normUpper('carrera'),
    nacionalidad: normUpper('nacionalidad') || 'PERUANA',
    lugar_residencia: normUpper('lugar_residencia'),
    distrito_residencia: normUpper('distrito_residencia'),
    direccion_domicilio: normUpper('direccion_domicilio'),
    exp_call_center: normUpper('exp_call_center'),
    exp_tipo_campana: normUpper('exp_tipo_campana'),
    exp_tiempo_call: normUpper('exp_tiempo_call'),
    exp_otra: normUpper('exp_otra'),
    exp_tiempo_otra: normUpper('exp_tiempo_otra'),
    fuente_oferta: normUpper('fuente_oferta'),
    observacion_reclutamiento: rawObs ? rawObs.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase() : null,
    cargo_contractual: normUpper('cargo_contractual'),
    bono_asistencia_perfecta: normUpper('bono_asistencia_perfecta'),
    status_dia_1: rawStatusDia1 || 'APTO',
    dia_0: rawDia0 || null,
    dia_0_obs: rawDia0Obs || null,
    dia_1: rawDia1 || null,
    dia_1_obs: rawDia1Obs || null,
    evaluar: normUpper('evaluar') || null,
    obs_evaluar: normUpper('obs_evaluar') || null,
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
 * Parsea un texto CSV respetando comillas multilínea y caracteres de escape RFC 4180
 */
export function parseCsvToMatrix(text) {
  if (!text) return []
  const result = []
  let row = []
  let currentVal = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    const nextChar = text[i + 1]

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        currentVal += '"'
        i++
      } else if (char === '"') {
        inQuotes = false
      } else {
        currentVal += char
      }
    } else {
      if (char === '"') {
        inQuotes = true
      } else if (char === ',') {
        row.push(currentVal.trim())
        currentVal = ''
      } else if (char === '\n' || char === '\r') {
        if (char === '\r' && nextChar === '\n') {
          i++
        }
        row.push(currentVal.trim())
        if (row.some(v => v !== '')) {
          result.push(row)
        }
        row = []
        currentVal = ''
      } else {
        currentVal += char
      }
    }
  }

  if (currentVal || row.length > 0) {
    row.push(currentVal.trim())
    if (row.some(v => v !== '')) {
      result.push(row)
    }
  }

  return result
}

// Dummy exports to satisfy legacy imports
export const NOMINA_FORM_GROUPS = []
export const STEP_LABELS = []
export const STEP_FIELDS = {}
export const REQUIRED_NOMINA_FIELDS = []
export const applyNominaPayloadToForm = () => {}
export const parseMoney = () => 0
export const NOMINA_FIELD_META = {}
