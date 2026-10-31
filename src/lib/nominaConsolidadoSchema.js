
function parseTimestamp(val) {
  if (!val) return null
  if (val instanceof Date && !isNaN(val.getTime())) {
    return val.toISOString()
  }
  const s = String(val).trim()
  if (!s || s === '-' || s === '0') return null
  
  // If DD/MM/YYYY HH:MM:SS or MM/DD/YYYY HH:MM:SS or D/M/YY H:M:S
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/)
  if (m) {
    let yNum = parseInt(m[3], 10)
    if (yNum < 100) yNum = yNum >= 70 ? 1900 + yNum : 2000 + yNum
    const yyyy = String(yNum)
    const p1 = parseInt(m[1], 10)
    const p2 = parseInt(m[2], 10)
    let ddNum = p1
    let mmNum = p2
    if (p2 > 12 && p1 <= 12) {
      mmNum = p1
      ddNum = p2
    }
    const mm = String(mmNum).padStart(2, '0')
    const dd = String(ddNum).padStart(2, '0')
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
import { resolveDistrictCoordinates } from './geoMobilityService.js'

export const NOMINA_DB_FIELDS = [
  'marca_temporal', 'periodo_reclutado', 'semana_trabajo', 'reclutador', 'sede', 'tipo_documento', 'documento',
  'apellido_paterno', 'apellido_materno', 'nombres', 'celular', 'celular_referencia', 'usuario_whatsapp', 'correo',
  'genero', 'fecha_nacimiento', 'edad', 'estado_civil', 'n_hijos', 'nivel_academico', 'carrera',
  'nacionalidad', 'lugar_residencia', 'distrito_residencia', 'direccion_domicilio',
  'exp_call_center', 'exp_tipo_campana', 'exp_tiempo_call', 'exp_tiempo_campana', 'exp_otra', 'exp_tiempo_otra',
  'fuente_oferta', 'observacion_reclutamiento', 'campana', 'segmento', 'grupo_codigo', 'modalidad',
  'condicion', 'horario_gestion', 'descanso', 'envio_dni', 'test_psicologico', 'validacion_pc',
  'evaluacion_dia_0', 'fecha_inicio_capacitacion', 'fecha_fin_capacitacion', 'fecha_conexion_ojt',
  'fecha_conexion_op', 'pago_capacitacion', 'tipo_contratacion', 'razon_social', 'remuneracion',
  'bono_variable', 'bono_movilidad', 'bono_bienvenida', 'bono_permanencia', 'bono_asistencia_perfecta', 'bono_nocturno',
  'cargo_contractual', 'dia_0', 'dia_0_obs', 'status_dia_1', 'dia_1', 'dia_1_obs',
  'doc_cv', 'doc_dni_adjunto', 'doc_certijoven', 'doc_recibo_servicios', 'doc_ficha_datos',
  'doc_autorizacion', 'status_final', 'observacion_final', 'revision_estado', 'validacion_reingreso', 'fecha_validacion', 'observacion_reingreso', 'evaluar', 'obs_evaluar',
  'estado', 'observacion_estado', 'activo'
]

/** Edad en años cumplidos desde fecha YYYY-MM-DD (o DD/MM/YYYY). null si no es válida. */
export function calcEdadFromFechaISO(fecha) {
  if (!fecha) return null
  const s = String(fecha).trim()
  let y, m, d, mt
  if ((mt = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) { y = +mt[1]; m = +mt[2]; d = +mt[3] }
  else if ((mt = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/))) { d = +mt[1]; m = +mt[2]; y = +mt[3] }
  else return null
  const t = new Date()
  let age = t.getFullYear() - y
  if (t.getMonth() + 1 < m || (t.getMonth() + 1 === m && t.getDate() < d)) age--
  return age >= 14 && age <= 90 ? age : null
}

/**
 * Parsea fechas de nacimiento garantizando el formato estándar DÍA / MES / AÑO (DD/MM/YYYY).
 * Soporta seriales de Excel, Date objects, texto en español (ej: "15 de mayo de 1998")
 * y separadores /, -, ., retornando siempre el formato ISO YYYY-MM-DD.
 */
export function parseFechaNacimiento(val, edadHint = null) {
  if (val === null || val === undefined || val === '') return null

  const currentYear = new Date().getFullYear()
  const minYear = 1935
  const maxYear = currentYear - 14

  const resolveYearWithHint = (y) => {
    if (y >= minYear && y <= maxYear) return y
    if (y > maxYear && y <= currentYear + 1 && edadHint !== null && edadHint !== undefined && edadHint !== '') {
      const mEdad = String(edadHint).match(/\b(1[4-9]|[2-8][0-9])\b/)
      if (mEdad) {
        const ageNum = parseInt(mEdad[1], 10)
        if (ageNum >= 14 && ageNum <= 85) {
          return currentYear - ageNum
        }
      }
    }
    return y
  }

  // 1. Si viene como Date object (evitar desfase de zona horaria UTC-5 de Perú)
  if (val instanceof Date && !isNaN(val.getTime())) {
    const yUtc = resolveYearWithHint(val.getUTCFullYear())
    const mUtc = String(val.getUTCMonth() + 1).padStart(2, '0')
    const dUtc = String(val.getUTCDate()).padStart(2, '0')
    if (yUtc >= minYear && yUtc <= maxYear) return `${yUtc}-${mUtc}-${dUtc}`
    const yLocal = resolveYearWithHint(val.getFullYear())
    const mLocal = String(val.getMonth() + 1).padStart(2, '0')
    const dLocal = String(val.getDate()).padStart(2, '0')
    if (yLocal >= minYear && yLocal <= maxYear) return `${yLocal}-${mLocal}-${dLocal}`
  }

  let s = String(val).trim()
  if (!s || s === '-' || s === '0' || s.toUpperCase() === 'NULL' || s === 'undefined' || s === '...') return null

  // Limpiar comillas, apóstrofes y prefijos
  s = s.replace(/^['"`’‘“”\s]+|['"`’‘“”\s]+$/g, '')

  // 1.5 Formato compacto de 8 dígitos continuos sin separadores (DDMMYYYY o YYYYMMDD)
  if (/^\d{8}$/.test(s)) {
    const p1 = parseInt(s.slice(0, 4), 10)
    const p2 = parseInt(s.slice(4, 6), 10)
    const p3 = parseInt(s.slice(6, 8), 10)
    if (p1 >= minYear && p1 <= maxYear && p2 >= 1 && p2 <= 12 && p3 >= 1 && p3 <= 31) {
      return `${p1}-${String(p2).padStart(2, '0')}-${String(p3).padStart(2, '0')}`
    }
    const dCompact = parseInt(s.slice(0, 2), 10)
    const mCompact = parseInt(s.slice(2, 4), 10)
    const yCompact = resolveYearWithHint(parseInt(s.slice(4, 8), 10))
    if (yCompact >= minYear && yCompact <= maxYear && mCompact >= 1 && mCompact <= 12 && dCompact >= 1 && dCompact <= 31) {
      return `${yCompact}-${String(mCompact).padStart(2, '0')}-${String(dCompact).padStart(2, '0')}`
    }
  }

  // 2. Número serial de Excel (ej. 36525 = 31/12/1999)
  if (/^\d{4,6}(?:\.\d+)?$/.test(s)) {
    const serial = parseFloat(s)
    if (serial >= 12000 && serial <= 50000) {
      const d = new Date(Math.round((serial - 25569) * 86400 * 1000))
      if (!isNaN(d.getTime())) {
        const y = resolveYearWithHint(d.getUTCFullYear())
        const m = String(d.getUTCMonth() + 1).padStart(2, '0')
        const day = String(d.getUTCDate()).padStart(2, '0')
        if (y >= minYear && y <= maxYear) return `${y}-${m}-${day}`
      }
    }
  }

  // 3. Formato en texto español: "15 de mayo de 1998", "24 de agosto del 2000", "5 mayo 2001"
  const MESES_MAP = {
    enero: 1, ene: 1,
    febrero: 2, feb: 2,
    marzo: 3, mar: 3,
    abril: 4, abr: 4,
    mayo: 5, may: 5,
    junio: 6, jun: 6,
    julio: 7, jul: 7,
    agosto: 8, ago: 8,
    setiembre: 9, septiembre: 9, set: 9, sep: 9,
    octubre: 10, oct: 10,
    noviembre: 11, nov: 11,
    diciembre: 12, dic: 12
  }
  const matchTexto = s.toLowerCase().match(/^(\d{1,2})\s*(?:de)?\s*([a-záéíóúñ]+)\s*(?:del?|de)?\s*(\d{2,4})/i)
  if (matchTexto) {
    const d = parseInt(matchTexto[1], 10)
    const mStr = matchTexto[2].normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
    const yRaw = parseInt(matchTexto[3], 10)
    const m = MESES_MAP[mStr]
    let y = yRaw < 100 ? (yRaw >= 35 ? 1900 + yRaw : 2000 + yRaw) : yRaw
    y = resolveYearWithHint(y)
    if (m && d >= 1 && d <= 31 && y >= minYear && y <= maxYear) {
      return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    }
  }

  // 4. Formato ISO estricto si vino como YYYY-MM-DD o YYYY/MM/DD
  const matchIso = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/)
  if (matchIso) {
    const y = resolveYearWithHint(parseInt(matchIso[1], 10))
    const m = parseInt(matchIso[2], 10)
    const d = parseInt(matchIso[3], 10)
    if (y >= minYear && y <= maxYear && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    }
  }

  // 5. Formato DÍA / MES / AÑO (el estándar estricto de postulantes: DD/MM/YYYY o DD-MM-YYYY o DD.MM.YYYY o "DD MM YYYY")
  const matchDma = s.match(/^(\d{1,2})[\s\-_/.]+(\d{1,2})[\s\-_/.]+(\d{2,4})/)
  if (matchDma) {
    const d = parseInt(matchDma[1], 10)
    const m = parseInt(matchDma[2], 10)
    let y = parseInt(matchDma[3], 10)
    if (y < 100) {
      y = y >= 35 ? 1900 + y : 2000 + y
    }
    y = resolveYearWithHint(y)
    // Caso 1: d > 12 y m <= 12 -> Ej: 25/08/1999 -> Día=25, Mes=08
    if (d > 12 && m <= 12) {
      if (y >= minYear && y <= maxYear && d <= 31 && m >= 1) {
        return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      }
    }
    // Caso 2: m > 12 y d <= 12 -> Ej: 08/25/1999 -> El usuario ingresó MM/DD/YYYY por error, corregir
    else if (m > 12 && d <= 12) {
      if (y >= minYear && y <= maxYear && m <= 31 && d >= 1) {
        return `${y}-${String(d).padStart(2, '0')}-${String(m).padStart(2, '0')}`
      }
    }
    // Caso 3: Ambos <= 12 -> Ej: 05/11/1998 -> Prioridad estándar DÍA / MES: Día=05, Mes=11
    else if (d >= 1 && d <= 31 && m >= 1 && m <= 12) {
      if (y >= minYear && y <= maxYear) {
        return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      }
    }
  }

  // 6. Fallback clásico parseExcelDate
  const fallback = parseExcelDate(s)
  if (fallback) {
    const parts = fallback.split('-')
    const y = resolveYearWithHint(parseInt(parts[0], 10))
    if (y >= minYear && y <= maxYear) return `${y}-${parts[1]}-${parts[2]}`
  }

  return null
}

/**
 * Extrae y valida la edad del postulante a partir de números ("24"), combinaciones de texto
 * ("23 años", "tengo 22", "25 AÑOS DE EDAD") o palabras en español ("veinticuatro").
 * Si no viene o no es válida, la calcula automáticamente a partir de la fecha de nacimiento.
 */
export function parseEdadValue(val, fechaNacISO = null) {
  if (val !== null && val !== undefined && val !== '') {
    const s = String(val).trim().toLowerCase()

    // 1. Extraer números de edad válidos (14 a 85 años)
    const mNum = s.match(/\b(1[4-9]|[2-8][0-9])\b/) || s.match(/(\d{1,2})\s*(?:año|ano|a|$)/i) || s.match(/\d{1,2}/)
    if (mNum) {
      const n = parseInt(mNum[1] || mNum[0], 10)
      if (n >= 14 && n <= 85) return n
    }

    // 2. Extraer edad expresada en palabras en español
    const TEXTO_EDAD = {
      'catorce': 14, 'quince': 15, 'dieciseis': 16, 'dieciséis': 16, 'diecisiete': 17,
      'dieciocho': 18, 'diecinueve': 19, 'veinte': 20, 'veintiuno': 21, 'veintidos': 22,
      'veintidós': 22, 'veintitres': 23, 'veintitrés': 23, 'veinticuatro': 24, 'veinticinco': 25,
      'veintiseis': 26, 'veintiséis': 26, 'veintisiete': 27, 'veintiocho': 28, 'veintinueve': 29,
      'treinta': 30, 'treinta y uno': 31, 'treinta y dos': 32, 'treinta y tres': 33,
      'treinta y cuatro': 34, 'treinta y cinco': 35, 'treinta y seis': 36, 'treinta y siete': 37,
      'treinta y ocho': 38, 'treinta y nueve': 39, 'cuarenta': 40, 'cuarenta y cinco': 45, 'cincuenta': 50
    }
    const cleanWord = s.replace(/años?|anos?|de\s+edad/g, '').trim()
    if (TEXTO_EDAD[cleanWord]) {
      return TEXTO_EDAD[cleanWord]
    }
  }

  // 3. Fallback automático: Calcular edad exacta desde fecha_nacimiento
  if (fechaNacISO) {
    const calculated = calcEdadFromFechaISO(fechaNacISO)
    if (calculated) return calculated
  }

  return null
}

/**
 * Normaliza textos de tiempo de experiencia que combinan números con letras
 * (ej: "3mese", "3meses", "6 m", "1año", "1 a 3 meses", "12 meses a mas").
 */
export function normalizeTiempoExperiencia(val) {
  if (val === null || val === undefined || val === '') return null
  let s = String(val).trim()
  if (!s || s === '-' || s === '...' || s.toUpperCase() === 'NULL' || s === 'undefined') return null

  // 1. Mayúsculas y sin tildes para estandarizar
  s = s.toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

  // Limpiar valores previamente corrompidos por reemplazo de preposición "A" -> "AÑOS"
  s = s.replace(/\b12\s*MESES\s*ANOS\s*MAS\b/g, '12 MESES A MAS')

  // 2. Si es 0 / sin experiencia / ninguno
  if (
    s === '0' || s === '0M' || s === '0 MESES' || s === '0 MESE' || s === '0 ANOS' || s === '0 AÑOS' ||
    s.includes('SIN EXP') || s.includes('NINGUN') || s === 'NO' || s === 'NINGUNA' ||
    s.includes('NO TENGO') || s.includes('NO CUENTO') || s.includes('SIN EXPERIENCIA')
  ) {
    return 'SIN EXPERIENCIA'
  }

  // 3. Casos numéricos aislados (ej. "3" -> "3 MESES", "6" -> "6 MESES", "1" -> "1 MES")
  if (s === '1') return '1 MES'
  if (s === '3') return '3 MESES'
  if (s === '6') return '6 MESES'
  if (s === '12') return '1 AÑO'
  if (s === '24') return '2 AÑOS'

  // 4. Separar números pegados a letras: "3MESE" -> "3 MESE", "6MESES" -> "6 MESES", "1ANO" -> "1 AÑO"
  s = s.replace(/(\d+)([A-Z]+)/g, '$1 $2')
  s = s.replace(/([A-Z]+)(\d+)/g, '$1 $2')

  // Normalizar palabras clave (sin reemplazar la preposición aislada "A")
  s = s.replace(/\bMESES?\b|\bMESE\b|\bMES\b|\bM\b/g, 'MESES')
  s = s.replace(/\bANOS?\b|\bANIOS?\b/g, 'AÑOS')
  s = s.replace(/(\d+)\s+A$/g, '$1 AÑOS')
  s = s.replace(/\s+/g, ' ').trim()

  // 5. Mapeo a rangos estándar de Call Center
  if (s.match(/1\s*(?:-|A|\/)\s*3\s*MESES?/i) || s === '1 - 3' || s === '1-3' || s === '1 A 3') {
    return '1 - 3 MESES'
  }
  if (s.match(/3\s*(?:-|A|\/)\s*6\s*MESES?/i) || s === '3 - 6' || s === '3-6' || s === '3 A 6') {
    return '3 - 6 MESES'
  }
  if (s.match(/6\s*(?:-|A|\/)\s*9\s*MESES?/i) || s === '6 - 9' || s === '6-9' || s === '6 A 9') {
    return '6 - 9 MESES'
  }
  if (s.match(/9\s*(?:-|A|\/)\s*12\s*MESES?/i) || s === '9 - 12' || s === '9-12' || s === '9 A 12') {
    return '9 - 12 MESES'
  }
  if (s.match(/6\s*(?:-|A|\/)\s*12\s*MESES?/i) || s === '6 - 12' || s === '6-12' || s === '6 A 12') {
    return '6 - 12 MESES'
  }
  if (
    s.includes('12 MESES A MAS') || s.includes('12 A MAS') || s.includes('1 ANO A MAS') ||
    s.includes('1 AÑO A MAS') || s.includes('MAS DE 1') || s.includes('12 MESES A MÁS') ||
    s.includes('+12') || s.includes('1 AÑO A MÁS') || s.includes('2 AÑOS A MAS') ||
    s.includes('12 MESES AÑOS MAS')
  ) {
    return '12 MESES A MAS'
  }

  // Casos simples: "3 MESES", "6 MESES", "1 AÑO", "2 AÑOS"
  if (s.match(/^1\s*AÑO|^1\s*ANO/i)) return '1 AÑO'
  if (s.match(/^2\s*AÑO|^2\s*ANO/i)) return '2 AÑOS'
  if (s.match(/^3\s*MESES?/i)) return '3 MESES'
  if (s.match(/^6\s*MESES?/i)) return '6 MESES'

  // Cualquier otro "X MESES"
  const mSoloMeses = s.match(/^(\d+)\s*MESES?$/i)
  if (mSoloMeses) {
    const num = parseInt(mSoloMeses[1], 10)
    return `${num} ${num === 1 ? 'MES' : 'MESES'}`
  }

  return s.replace(/\bANOS\b/g, 'AÑOS').replace(/\bANO\b/g, 'AÑO')
}

/**
 * Extrae números de teléfono peruanos y referencias desde cadenas de texto o números,
 * manejando notación científica, prefijos (+51 / 51), múltiples números en una celda
 * (ej: "920521426 LLAMADA 943354239 WHATSAPP"), y separadores de espacios o guiones.
 */
export function extractPhonesFromText(val) {
  if (val === null || val === undefined || val === '') return { primary: null, secondary: null }
  if (val instanceof Date) return { primary: null, secondary: null }

  // 1. Número numérico de Excel
  if (typeof val === 'number' && Number.isFinite(val)) {
    const asInt = Math.round(val)
    if (asInt > 0) {
      let s = String(asInt)
      if (s.startsWith('51') && s.length === 11 && s[2] === '9') s = s.substring(2)
      if (s.length >= 7 && s.length <= 11) {
        return { primary: s, secondary: null }
      }
      return { primary: null, secondary: null }
    }
  }

  let s = String(val).trim()
  if (!s || s === '-' || s === '...' || s.toUpperCase() === 'NULL' || s === 'undefined') {
    return { primary: null, secondary: null }
  }

  // 1.5 Blindaje contra fechas y marcas temporales (ej. "22/10/2026 9:04:38", "2026-10-22T09:04:38", o dígitos concatenados de timestamp "2210202690438")
  if (
    /^\d{1,4}[\/\-]\d{1,2}[\/\-]\d{1,4}/.test(s) ||
    /\b\d{1,2}:\d{2}(?::\d{2})?\b/.test(s) ||
    (/^\d{12,15}$/.test(s) && /202[4-9]/.test(s))
  ) {
    return { primary: null, secondary: null }
  }

  // 2. Notación científica de Excel (ej. 9.87654E+08)
  if (/e\+?\d+/i.test(s)) {
    const n = Number(s)
    if (Number.isFinite(n) && n > 0) {
      let sNum = String(Math.round(n))
      if (sNum.startsWith('51') && sNum.length === 11 && sNum[2] === '9') sNum = sNum.substring(2)
      if (sNum.length >= 7 && sNum.length <= 11) {
        return { primary: sNum, secondary: null }
      }
    }
  }

  const phonesFound = []

  // 3. Dividir por separadores habituales de múltiples teléfonos (slash, comas, guiones dobles, palabras clave)
  const tokens = s.split(/[\/,;\n\r|—–]|\s+[-–—]\s+|\b(?:LLAMADA|LLAMADAS|WSP|WTSP|WHATSAPP|WHATS|PERSONAL|REF|REFERENCIA|CASA|MAMA|PAPA|HERMANO|FIJO|MOVIL|CEL|CELULAR|O|Y)\b/i)
  for (const token of tokens) {
    let digits = token.replace(/\D/g, '')
    if (digits.startsWith('51') && digits.length === 11 && digits[2] === '9') {
      digits = digits.substring(2)
    }
    if (digits.length === 9 && digits.startsWith('9')) {
      if (!phonesFound.includes(digits)) phonesFound.push(digits)
    }
  }

  // 4. Si aún no encontramos o solo encontramos 1, buscar secuencias de 9 dígitos continuos o con espacios/guiones
  if (phonesFound.length < 2) {
    const directMatches = s.matchAll(/(?:^|[^\d])(?:\+?51\s*)?(9\d{8})(?=[^\d]|$)/g)
    for (const m of directMatches) {
      const d = m[1]
      if (!phonesFound.includes(d)) phonesFound.push(d)
    }
  }
  if (phonesFound.length < 2) {
    let cleaned = s.replace(/(?:\+51|51)\s*(9[\d\s.-]{8,14})/g, '$1')
    const matches = cleaned.matchAll(/(?:^|[^\d])(9[\d\s.-]{8,12}\d)(?:$|[^\d])/g)
    for (const m of matches) {
      let d = m[1].replace(/\D/g, '')
      if (d.startsWith('51') && d.length === 11 && d[2] === '9') d = d.substring(2)
      if (d.length === 9 && d.startsWith('9') && !phonesFound.includes(d)) {
        phonesFound.push(d)
      }
    }
  }

  // 5. Fallback si no hubo match que inicie con 9 (fijos de 7-8 dígitos o +51 con 11 dígitos)
  if (phonesFound.length === 0) {
    const allDigits = s.replace(/[^\d]/g, '')
    if (allDigits.length >= 7 && allDigits.length <= 11) {
      let f = allDigits
      if (f.startsWith('51') && f.length === 11 && f[2] === '9') f = f.substring(2)
      if (f.length >= 7 && f.length <= 9) {
        phonesFound.push(f)
      }
    }
  }

  return {
    primary: phonesFound[0] || null,
    secondary: phonesFound[1] || null
  }
}

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
  celular: ['NÚMERO DE CELULAR / MÓVIL', 'NÚMERO DE CELULAR', 'CELULAR', 'NUMERO DE CELULAR'],
  celular_referencia: [
    'NÚMERO DE CELULAR DE REFERENCIA',
    'NUMERO DE CELULAR DE REFERENCIA',
    'CELULAR DE REFERENCIA',
    'NUMERO DE REFERENCIA',
    'TELEFONO DE REFERENCIA',
    'CEL. REF.',
    'CEL. REF',
    'CEL REF',
    'CONTACTO DE EMERGENCIA',
    'NUMERO DE EMERGENCIA',
    'CELULAR DE EMERGENCIA',
    'TELEFONO DE EMERGENCIA',
    'NUMERO FAMILIAR',
    'CELULAR FAMILIAR',
    'REFERENCIA FAMILIAR',
    'CELULAR SECUNDARIO',
    'NUMERO SECUNDARIO',
    'TELEFONO SECUNDARIO',
    'CELULAR 2',
    'NUMERO 2',
    'TELEFONO 2'
  ],
  usuario_whatsapp: [
    'BRINDAME EL USUARIO DE TU WTSP EN CASO LO HALLAS MODIFICADO ASI :',
    'BRINDAME EL USUARIO DE TU WTSP EN CASO LO HAYAS MODIFICADO ASI :',
    'BRINDAME EL USUARIO DE TU WTSP EN CASO LO HAYAS MODIFICADO',
    'BRINDAME EL USUARIO DE TU WTSP',
    'BRINDAME EL USUARIO DE TU WHATSAPP',
    'BRINDAME EL USUARIO DE TU WSP',
    'USUARIO DE TU WTSP',
    'USUARIO DE TU WHATSAPP',
    'USUARIO DE TU WSP',
    'USUARIO WTSP',
    'USUARIO WHATSAPP',
    'USUARIO WSP',
    'NUMERO DE WHATSAPP',
    'NUMERO DE WTSP',
    'NUMERO DE WSP',
    'NUMERO WHATSAPP',
    'NUMERO WTSP',
    'NUMERO WSP',
    'WTSP',
    'WHATSAPP',
    'WSP'
  ],
  correo: ['CORREO ELECTRONICO'],
  genero: ['GÉNERO O SEXO DEL POSTULANTE'],
  fecha_nacimiento: ['FECHA DE NACIMIENTO'],
  edad: ['EDAD'],
  estado_civil: ['ESTADO CIVIL'],
  n_hijos: ['N° DE HIJOS', 'N° DE HIJOS'],
  nivel_academico: ['NIVEL ACADÉMICO'],
  carrera: ['MENCIONAR CARREA', 'MENCIONAR CARRERA'],
  nacionalidad: ['NACIONALIDAD'],
  lugar_residencia: ['LUGAR DE RESIDENCIA ACTUAL', 'LUGAR DE RESIDENCIA', 'DEPARTAMENTO / PROVINCIA'],
  distrito_residencia: [
    'DISTRITO DE RESIDENCIA',
    'DISTRITO DE RESIDENCIA ACTUAL',
    'DISTRITO ACTUAL',
    'DISTRITO',
    'COMUNA',
    'LOCALIDAD'
  ],
  direccion_domicilio: ['DIRECCIÓN DE DOMICILIO ACTUAL', 'DIRECCION DE DOMICILIO ACTUAL', 'DIRECCIÓN', 'DIRECCION', 'DOMICILIO ACTUAL', 'DONDE VIVES'],
  exp_call_center: ['¿CUENTAS CON EXPERIENCIA LABORAL EN CALL CENTER?'],
  exp_tipo_campana: ['¿QUE TIPO DE EXPERIENCIA TIENES? ( ORIENTADO A LA CAMPAÑA QUE POSTULAS)'],
  exp_tiempo_call: ['TIEMPO DE EXPERIENCIA'], // First occurrence
  exp_otra: ['DETALLANOS OTRA EXPERIENCIA LABORAL'],
  exp_tiempo_otra: ['TIEMPO DE EXPERIENCIA2'], // We'll handle duplicate manually
  fuente_oferta: ['¿CÓMO TE ENTERASTE DE LA OFERTA LABORAL?'],
  observacion_reclutamiento: ['OBSERVACION'], // First occurrence
}

/** Quita tildes/ñ raros para matchear encabezados del Google Form aunque cambien acentos. */
function foldHeader(h) {
  return String(h || '')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[º°]/g, 'O')
    .replace(/[^\w\s/?().]/g, ' ')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function mapGoogleFormHeaders(headerRow = []) {
  const headers = headerRow.map(h => String(h || '').toUpperCase().trim())
  const colIdx = {}

  headers.forEach((h, i) => {
    // Normalizar texto eliminando saltos de línea, acentos y espacios extra
    const clean = foldHeader(h)

    if (clean.includes('MARCA TEMPORAL') || clean.includes('TIMESTAMP') || clean === 'HORA DE REGISTRO') colIdx['marca_temporal'] = i
    else if (clean.includes('PERIODO RECLUTADO') || clean === 'PERIODO') colIdx['periodo_reclutado'] = i
    else if (clean.includes('SEMANA DE TRAB') || (clean.includes('SEMANA') && !clean.includes('EXPERIENCIA'))) colIdx['semana_trabajo'] = i
    else if (clean.includes('RECLUTADOR') || clean.includes('SELECCIONADOR') || clean.includes('PSICOLOG') || clean.includes('QUIEN TE CONTACTO')) colIdx['reclutador'] = i
    // Experiencia ANTES que campaña: el form dice "...ORIENTADO A LA CAMPAÑA..."
    else if (clean.includes('TIPO DE EXPERIENCIA') || (clean.includes('EXPERIENCIA') && clean.includes('ORIENTADO'))) {
      colIdx['exp_tipo_campana'] = i
    }
    else if (clean.includes('EXPERIENCIA') && (clean.includes('CALL') || clean.includes('CENTER'))) colIdx['exp_call_center'] = i
    else if (clean.includes('OTRA EXPERIENCIA') && (clean.includes('TIEMPO') || clean.includes('CUANTO') || clean.includes('QUE TIEMPO'))) {
      colIdx['exp_tiempo_otra'] = i
    }
    else if (
      clean.includes('TIEMPO DE EXPERIENCIA') ||
      clean.includes('TIEMPO EXPERIENCIA') ||
      clean.includes('CUANTO TIEMPO') ||
      clean.includes('QUE TIEMPO') ||
      (clean.includes('TIEMPO') && clean.includes('EXPERIENCIA'))
    ) {
      if (clean.includes('OTRA') || clean.includes('OTRO')) {
        colIdx['exp_tiempo_otra'] = i
      } else if (colIdx['exp_tiempo_call'] === undefined) {
        colIdx['exp_tiempo_call'] = i
      } else if (colIdx['exp_tiempo_otra'] === undefined) {
        colIdx['exp_tiempo_otra'] = i
      }
    }
    else if (clean.includes('OTRA EXPERIENCIA') || clean.includes('OTRAS EXPERIENCIAS')) colIdx['exp_otra'] = i
    else if (
      (clean.includes('CAMPANA') || clean.includes('A QUE CAMPANA')) &&
      !clean.includes('EXPERIENCIA') &&
      !clean.includes('TIPO DE')
    ) {
      colIdx['campana'] = i
    }
    else if (clean.includes('SEDE') || clean.includes('LUGAR DE TRABAJO') || clean.includes('SEDE DE PREFERENCIA')) colIdx['sede'] = i
    else if (clean.includes('MODALIDAD') || clean.includes('PRESENCIAL O REMOTO') || clean.includes('REMOTO O PRESENCIAL') || clean.includes('HOME OFFICE') || clean.includes('TELETRABAJO')) colIdx['modalidad'] = i
    else if (clean.includes('TIPO DE DOCUMENTO') || clean === 'TIPO DOC') colIdx['tipo_documento'] = i
    else if (clean.includes('DNI') || clean.includes('DOCUMENTO') || clean.includes('C.E.') || clean.includes('CEDULA') || clean.includes('IDENTIFICACION')) {
      if (colIdx['documento'] === undefined) colIdx['documento'] = i
    }
    else if (clean.includes('APELLIDO PATERNO') || clean === 'PATERNO') colIdx['apellido_paterno'] = i
    else if (clean.includes('APELLIDO MATERNO') || clean === 'MATERNO') colIdx['apellido_materno'] = i
    else if ((clean === 'APELLIDOS' || clean.includes('APELLIDOS Y NOMBRES') || clean.includes('APELLIDO(S)')) && colIdx['apellido_paterno'] === undefined) colIdx['apellido_paterno'] = i
    else if (clean.includes('NOMBRES') || clean.includes('NOMBRE COMPLETO') || clean === 'NOMBRE') {
      if (colIdx['nombres'] === undefined) colIdx['nombres'] = i
    }
    // 1. CELULAR DE REFERENCIA / EMERGENCIA / SEGUNDO CONTACTO
    else if (
      (clean.includes('REFERENCIA') || clean.includes('REF.') || clean.includes(' REF') ||
       clean.includes('EMERGENCIA') || clean.includes('FAMILIAR') || clean.includes('SEGUNDO') ||
       clean.includes('SECUNDARIO') || clean.includes('ALTERNATIVO') || clean.includes('RESPALDO') ||
       clean.includes('CELULAR 2') || clean.includes('TELEFONO 2') || clean.includes('NUMERO 2') || clean.includes('CONTACTO 2')) &&
      !clean.includes('LUGAR') && !clean.includes('DIRECCION') && !clean.includes('DOMICILIO') &&
      !clean.includes('NOMBRE') && !clean.includes('APELLIDO') && !clean.includes('PARENTESCO') &&
      !clean.includes('RELACION') && !clean.includes('RELACIÓN') && !clean.includes('VINCULO') &&
      !clean.includes('VÍNCULO') && !clean.includes('QUIEN') && !clean.includes('QUIÉN')
    ) {
      const hasPhoneWord = clean.includes('CEL') || clean.includes('MOVIL') || clean.includes('MÓVIL') ||
                           clean.includes('TEL') || clean.includes('NUMERO') || clean.includes('NÚMERO') ||
                           clean.includes('NRO') || clean.includes('NUM') || clean.includes('WHATSAPP') || clean.includes('WSP')
      // Si tiene palabra explícita de teléfono/número, toma prioridad total sobre cualquier mapeo previo
      if (hasPhoneWord || colIdx['celular_referencia'] === undefined) {
        colIdx['celular_referencia'] = i
      }
    }
    // 2. USUARIO WHATSAPP / WTSP / WSP (Evaluado antes de celular genérico para evitar que 'USUARIO WSP' o 'NUMERO DE WHATSAPP' sea capturado como celular)
    else if (
      clean.includes('USUARIO DE TU WTSP') ||
      clean.includes('USUARIO DE TU WHATSAPP') ||
      clean.includes('USUARIO DE TU WSP') ||
      clean.includes('USUARIO WTSP') ||
      clean.includes('USUARIO WHATSAPP') ||
      clean.includes('USUARIO WSP') ||
      clean.includes('MODIFICADO') ||
      clean.includes('HALLAS') ||
      clean.includes('HAYAS') ||
      (clean.includes('USUARIO') && (clean.includes('WSP') || clean.includes('WTSP') || clean.includes('WHATS') || clean.includes('CHAT') || clean.includes('RED'))) ||
      ((clean === 'WHATSAPP' || clean === 'WTSP' || clean === 'WSP' || clean.includes('NUMERO DE WHATSAPP') || clean.includes('NUMERO WHATSAPP') || clean.includes('NUMERO WSP') || clean.includes('NUMERO DE WSP')) && colIdx['celular'] !== undefined)
    ) {
      if (colIdx['usuario_whatsapp'] === undefined) {
        colIdx['usuario_whatsapp'] = i
      }
    }
    // 3. CELULAR PRINCIPAL / MOVIL / TELEFONO
    else if (
      clean.includes('CELULAR') || clean.includes('MOVIL') || clean.includes('TELEFONO') ||
      clean.includes('TELF') || clean.includes('NRO DE CEL') || clean.includes('NUMERO DE CEL') ||
      clean.includes('NUMERO PERSONAL') || clean.includes('CELULAR PERSONAL') ||
      clean.includes('TELEFONO PERSONAL') || clean.includes('TELEFONO DE CONTACTO') || clean.includes('NUMERO DE CONTACTO') ||
      (clean.includes('WHATSAPP') && !clean.includes('USUARIO') && !clean.includes('HALLAS') && !clean.includes('HAYAS') && !clean.includes('MODIFICADO')) ||
      (clean.includes('NUMERO') && (clean.includes('CEL') || clean.includes('WHATS') || clean.includes('CONTACTO')))
    ) {
      if (clean.includes('REFERENCIA') || clean.includes('EMERGENCIA') || clean.includes('FAMILIAR') || clean.includes('SEGUNDO') || clean.includes('OPCIONAL')) {
        colIdx['celular_referencia'] = i
      } else if (colIdx['celular'] === undefined) {
        colIdx['celular'] = i
      } else if (colIdx['celular_referencia'] === undefined) {
        colIdx['celular_referencia'] = i
      }
    }
    else if (clean.includes('CORREO') || clean.includes('EMAIL') || clean.includes('E-MAIL')) colIdx['correo'] = i
    else if (clean.includes('GENERO') || clean.includes('SEXO')) colIdx['genero'] = i
    else if (clean.includes('FECHA DE NACIMIENTO') || clean.includes('F. NACIMIENTO') || clean.includes('F.NACIMIENTO') || clean.includes('FECHA NAC') || (clean.includes('NACIMIENTO') && !clean.includes('LUGAR'))) colIdx['fecha_nacimiento'] = i
    else if (clean === 'EDAD' || clean.startsWith('EDAD ') || clean.includes(' TU EDAD') || clean.includes('CUANTOS ANOS') || clean.includes('CUANTOS AÑOS') || clean.includes('EDAD DEL POSTULANTE') || clean.includes('INDICA TU EDAD')) colIdx['edad'] = i
    else if (clean.includes('ESTADO CIVIL')) colIdx['estado_civil'] = i
    else if (clean.includes('HIJOS')) colIdx['n_hijos'] = i
    else if (clean.includes('NIVEL ACADEMICO') || clean.includes('GRADO DE INSTRUCCION')) colIdx['nivel_academico'] = i
    else if (clean.includes('CARREA') || clean.includes('CARRERA') || clean.includes('PROFESION')) colIdx['carrera'] = i
    else if (clean.includes('NACIONALIDAD') || clean.includes('PAIS')) colIdx['nacionalidad'] = i
    
    // DISTRITO: Debe evaluarse estricta y prioritariamente ANTES de LUGAR DE RESIDENCIA para que "DISTRITO DE RESIDENCIA" no sea capturado por "RESIDENCIA"
    else if (clean.includes('DISTRITO') || clean.includes('COMUNA') || clean.includes('LOCALIDAD') || clean.includes('MUNICIPIO') || clean.includes('BARRIO')) {
      if (colIdx['distrito_residencia'] === undefined) colIdx['distrito_residencia'] = i
    }
    // LUGAR DE RESIDENCIA / DEPARTAMENTO / PROVINCIA (Excluyendo DISTRITO / COMUNA)
    else if (!clean.includes('DISTRITO') && !clean.includes('COMUNA') && !clean.includes('LOCALIDAD') && (
      clean.includes('LUGAR DE RESIDENCIA') || clean.includes('RESIDENCIA') || clean.includes('DEPARTAMENTO') || clean.includes('PROVINCIA') || clean.includes('REGION') || clean.includes('CIUDAD')
    )) {
      if (colIdx['lugar_residencia'] === undefined) colIdx['lugar_residencia'] = i
    }
    else if (clean.includes('DIRECCION') || clean.includes('DOMICILIO') || clean.includes('DONDE VIVES') || clean.includes('CALLE') || clean.includes('AVENIDA')) colIdx['direccion_domicilio'] = i
    else if (clean.includes('OFERTA') || clean.includes('ENTERASTE') || clean.includes('FUENTE')) colIdx['fuente_oferta'] = i
    else if (clean.includes('WTSP') || clean.includes('WHATSAPP') || clean.includes('WSP')) {
      if (colIdx['usuario_whatsapp'] === undefined) {
        colIdx['usuario_whatsapp'] = i
      }
    }
    else if (clean.includes('CARGO CONTRACTUAL') || (clean.includes('CARGO') && !clean.includes('DESCARGA')) || clean.includes('PUESTO')) colIdx['cargo_contractual'] = i
    else if (clean.includes('BONO ASIST') || clean.includes('ONO ASIST')) colIdx['bono_asistencia_perfecta'] = i
    
    // Status Día 1
    else if (clean.includes('STATUS DIA 1') || clean.includes('STATUS DIA1') || clean === 'STATUS' || clean === 'ESTADO DIA 1') colIdx['status_dia_1'] = i
    
    // Día 0 (Asistencia)
    else if (clean === 'DIA 0' || clean === 'DIA0' || clean === 'D0' || clean.includes('ASISTENCIA DIA 0') || (clean.includes('DIA 0') && !clean.includes('OBS') && !clean.includes('MOTIVO'))) colIdx['dia_0'] = i
    
    // Observaciones Día 0
    else if ((clean.includes('OBS') || clean.includes('MOTIVO')) && (clean.includes('DIA 0') || clean.includes('DIA0') || clean.includes('D0'))) colIdx['dia_0_obs'] = i
    
    // Día 1 (Asistencia)
    else if (clean === 'DIA 1' || clean === 'DIA1' || clean === 'D1' || clean.includes('ASISTENCIA DIA 1') || (clean.includes('DIA 1') && !clean.includes('STATUS') && !clean.includes('ESTADO') && !clean.includes('OBS') && !clean.includes('MOTIVO'))) colIdx['dia_1'] = i
    
    // Observaciones Día 1
    else if (clean.includes('NO ASISTIO DIA 0') || clean.includes('ASISTE DIA1') || clean.includes('ASISTE DIA 1') || ((clean.includes('OBS') || clean.includes('MOTIVO')) && (clean.includes('DIA 1') || clean.includes('DIA1') || clean.includes('D1')))) colIdx['dia_1_obs'] = i
    
    else if (clean.includes('OBS') && clean.includes('EVALUAR')) colIdx['obs_evaluar'] = i
    else if (clean.includes('EVALUAR')) colIdx['evaluar'] = i
  })

  // Segunda pasada contextual para columnas genéricas "OBSERVACIONES" o "OBS"
  headers.forEach((h, i) => {
    const clean = foldHeader(h)
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
 * Limpia y normaliza números de documento de identidad (DNI, CE, Pasaporte),
 * eliminando apóstrofes iniciales (ej. '006541136 puesto en Excel/Sheets para preservar ceros),
 * comillas simples/dobles, prefijos de texto como "DNI:" o "NRO", caracteres de control y espacios.
 * Preserva y restituye ceros iniciales según el tipo de documento y nacionalidad.
 */
export function cleanDocumento(val, rowContext = {}) {
  if (val === null || val === undefined) return ''
  let s = String(val).trim()
  if (!s) return ''
  
  // 1. Si viene como fórmula Excel ej. ="006541136" o ='006541136'
  if (s.startsWith('=')) {
    s = s.replace(/^=\s*["']?/, '').replace(/["']?$/, '').trim()
  }
  
  // 2. Eliminar comillas simples, dobles, apóstrofes (incluyendo Unicode ’ ‘ ` " ” “) al inicio y final
  s = s.replace(/^['"`’‘“”\s]+|['"`’‘“”\s]+$/g, '')
  
  // 3. Si el texto tiene formato como 'DNI: 006541136', 'CE: 12345678', 'NRO. 00123456', limpiar el prefijo
  s = s.replace(/^(?:DNI|CE|C\.E\.|PASAPORTE|DOC|DOCUMENTO|NRO|N°|NUM|ID)[\s:.\-_#]*/i, '')
  
  // 4. Eliminar comillas o apóstrofes residuales incrustados y espacios
  s = s.replace(/['"`’‘“”\s]/g, '').trim()
  
  // 5. Determinar contexto de documento y nacionalidad
  const tipoDoc = String(rowContext.tipo_documento || '').toUpperCase()
  const nac = String(rowContext.nacionalidad || '').toUpperCase()
  const isForeign = (tipoDoc && (tipoDoc.includes('CE') || tipoDoc.includes('EXTRANJ') || tipoDoc.includes('PTP') || tipoDoc.includes('PASAPORTE') || tipoDoc.includes('CEDULA') || tipoDoc !== 'DNI')) || (nac && !nac.includes('PERU'))

  // 6. Normalización inteligente de ceros iniciales
  if (/^\d+$/.test(s)) {
    if (s.length === 7) {
      if (isForeign) {
        // CE extranjero numérico estándar (9 dígitos): restaurar los dos ceros '00'
        s = '00' + s
      } else {
        // DNI peruano estándar (8 dígitos): restaurar un cero '0'
        s = '0' + s
      }
    } else if (s.length === 8 && s.startsWith('0') && isForeign) {
      // CE extranjero que había recibido solo 1 cero por error anterior: llevarlo a 9 dígitos '00'
      s = '0' + s
    }
  }
  
  return s
}

/**
 * Valida si un valor parece un documento de identidad válido (DNI, CE, Pasaporte)
 * y descarta textos de apuntes, notas, subtotales o encabezados repetidos.
 */
export function isValidDocumento(val) {
  if (!val) return false
  const clean = cleanDocumento(val).toUpperCase()
  if (clean.length < 5 || clean.length > 25) return false
  
  // Lista de palabras clave que suelen aparecer en notas, tablas secundarias o resúmenes al pie de página
  const invalidKeywords = [
    'TOTAL', 'SUBTOTAL', 'NOTA', 'NOTAS', 'OBSERVACION', 'OBSERVACIONES', 'OBS',
    'RESUMEN', 'FIRMA', 'APUNTES', 'COORDINAR', 'PENDIENTE', 'REVISADO', 'FECHA',
    'PROMEDIO', 'GRUPO', 'CAMPANA', 'CAMPAÑA', 'SEDE', 'RECLUTADOR', 'NRO', 'DNI', 'C.E.',
    'HORARIO', 'HORARIOS', 'ESPECIAL', 'ESPECIALES', 'SOLICITUD', 'SOLICITUDES', 'CAPACITACION',
    'PRESENCIAL', 'DESCANSO', 'ESTUDIO', 'ESTUDIOS', 'CAIDOS', 'CAÍDOS', 'DESISTIDO', 'DESISTIDOS', 'BAJA', 'BAJAS'
  ]
  if (invalidKeywords.some(kw => clean === kw || clean.startsWith(kw + ' ') || clean.endsWith(' ' + kw))) return false
  
  // Debe contener al menos algún número o formato alfanumérico de documento válido
  return /[0-9]/.test(clean) && /^[A-Z0-9\-_.]+$/i.test(clean)
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

/** Normaliza teléfonos (Sheets a veces manda number / notación científica / múltiples teléfonos). */
export function normalizePhoneValue(val) {
  const { primary } = extractPhonesFromText(val)
  return primary
}

export function parseGoogleFormRow(row, colIdx) {
  const get = (key) => {
    const i = colIdx[key]
    return i >= 0 ? row[i] : null
  }

  // ?? evita perder 0 numérico (n_hijos / edad)
  const str = (k) => {
    const v = get(k)
    if (v === null || v === undefined) return null
    const s = String(v).trim()
    return s && s !== '...' ? s : null
  }
  const rawTipoDoc = str('tipo_documento') ? str('tipo_documento').toUpperCase() : 'DNI'
  const rawNac = str('nacionalidad') ? str('nacionalidad').toUpperCase() : 'PERUANA'
  
  let rawDoc = cleanDocumento(get('documento'), { tipo_documento: rawTipoDoc, nacionalidad: rawNac })

  // Fallback: Si no hay documento en la columna mapeada, buscar en las demás celdas de la fila un DNI válido
  if (!isValidDocumento(rawDoc)) {
    for (let cIdx = 0; cIdx < row.length; cIdx++) {
      const candidate = cleanDocumento(row[cIdx], { tipo_documento: rawTipoDoc, nacionalidad: rawNac })
      if (isValidDocumento(candidate) && /^\d{6,15}$/.test(candidate)) {
        rawDoc = candidate
        break
      }
    }
  }

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
  let rawUsuarioWhatsapp = str('usuario_whatsapp')
  let rawObs = str('observacion_reclutamiento')

  // Normalizar detección de AGREGADO / AGREGADO A DÍA X
  const allRowText = [rawStatusDia1, rawDia0, rawDia1, rawDia0Obs, rawDia1Obs, rawObs, rawUsuarioWhatsapp]
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
  const normPhone = (k) => normalizePhoneValue(get(k))

  let rawLugar = normUpper('lugar_residencia')
  let rawDistrito = normUpper('distrito_residencia')
  let rawDireccion = normUpper('direccion_domicilio')

  // Fallback inteligente: Si distrito_residencia viene vacío, extraerlo desde la dirección o lugar
  if (!rawDistrito && (rawDireccion || rawLugar)) {
    const geo = resolveDistrictCoordinates(rawLugar, rawDireccion, rawDoc)
    if (geo && geo.resolved && geo.distrito) {
      rawDistrito = geo.distrito.toUpperCase()
    }
  }
  // 1. Fecha de Nacimiento en formato Día Mes Año / ISO / Serials (con soporte de edadHint)
  const fechaNacParsed = parseFechaNacimiento(get('fecha_nacimiento'), get('edad'))

  // 2. Edad: parsear texto ("24", "23 años", "tengo 22", "veinticuatro") o calcular desde fecha_nacimiento
  const edadParsed = parseEdadValue(get('edad'), fechaNacParsed)

  // 3. Extracción robusta de celulares (personal y referencia)
  const phonesFromCel = extractPhonesFromText(get('celular'))
  const phonesFromRef = extractPhonesFromText(get('celular_referencia'))
  const phonesFromWsp = extractPhonesFromText(rawUsuarioWhatsapp)

  // Celular principal: celular directo, si no wsp, si no teléfono de referencia
  let celularNorm = phonesFromCel.primary || phonesFromWsp.primary || phonesFromRef.primary || null

  // Celular de referencia:
  // 1) Si vino en la columna de referencia (phonesFromRef.primary), PRESERVARLO (incluso si coincide con el principal)
  // 2) Si no vino, pero el campo celular trajo un segundo número (ej. "987654321 / 912345678"), usar phonesFromCel.secondary
  // 3) Si el campo referencia trajo un segundo número, usar phonesFromRef.secondary
  // 4) Si whatsapp trajo un número válido diferente al principal, usarlo como respaldo
  let celularRefNorm = phonesFromRef.primary ||
                       phonesFromCel.secondary ||
                       phonesFromRef.secondary ||
                       (phonesFromWsp.primary && phonesFromWsp.primary !== celularNorm ? phonesFromWsp.primary : null) ||
                       null

  // Columnas excluidas del escaneo de emergencia de teléfonos (fechas, marcas temporales, DNI, edad, hijos)
  const excludedPhoneCols = new Set(
    [
      colIdx.marca_temporal,
      colIdx.fecha_nacimiento,
      colIdx.edad,
      colIdx.n_hijos,
      colIdx.documento,
      colIdx.periodo_reclutado,
      colIdx.semana_trabajo
    ].filter(idx => idx !== undefined && idx >= 0)
  )

  // Fallback exhaustivo para celular si sigue vacío: buscar en toda la fila un número de 9 dígitos que inicie en 9
  if (!celularNorm) {
    for (let cIdx = 0; cIdx < row.length; cIdx++) {
      if (excludedPhoneCols.has(cIdx)) continue
      if (cIdx === 0 && colIdx.marca_temporal === undefined && /^\d{1,4}[\/\-]\d{1,2}[\/\-]\d{1,4}/.test(String(row[0] || '').trim())) continue
      const cellVal = String(row[cIdx] || '').trim()
      if (!cellVal || cellVal === rawDoc) continue
      const candidate = extractPhonesFromText(cellVal)
      if (candidate.primary && /^9\d{8}$/.test(candidate.primary) && candidate.primary !== rawDoc) {
        celularNorm = candidate.primary
        if (candidate.secondary && /^9\d{8}$/.test(candidate.secondary) && candidate.secondary !== rawDoc) {
          celularRefNorm = candidate.secondary
        }
        break
      }
    }
  }

  // Fallback exhaustivo para celular de referencia si sigue vacío:
  // Buscar en toda la fila un número de 9 dígitos que sea diferente al celular principal y al DNI
  if (!celularRefNorm) {
    for (let cIdx = 0; cIdx < row.length; cIdx++) {
      if (excludedPhoneCols.has(cIdx)) continue
      if (cIdx === 0 && colIdx.marca_temporal === undefined && /^\d{1,4}[\/\-]\d{1,2}[\/\-]\d{1,4}/.test(String(row[0] || '').trim())) continue
      const cellVal = String(row[cIdx] || '').trim()
      if (!cellVal || cellVal === rawDoc) continue
      const candidate = extractPhonesFromText(cellVal)
      if (candidate.primary && /^9\d{8}$/.test(candidate.primary) && candidate.primary !== rawDoc && candidate.primary !== celularNorm) {
        celularRefNorm = candidate.primary
        break
      }
      if (candidate.secondary && /^9\d{8}$/.test(candidate.secondary) && candidate.secondary !== rawDoc && candidate.secondary !== celularNorm) {
        celularRefNorm = candidate.secondary
        break
      }
    }
  }

  const nHijosParsed = (() => {
    const raw = get('n_hijos')
    if (raw === null || raw === undefined || raw === '') return 0
    const m = String(raw).match(/\d{1,2}/)
    if (!m) return 0
    const n = parseInt(m[0], 10)
    return Number.isFinite(n) && n >= 0 && n <= 20 ? n : 0
  })()

  // 4. Normalización de tiempo de experiencia (separa números de letras: "3mese" -> "3 MESES")
  const expTiempoCall = normalizeTiempoExperiencia(get('exp_tiempo_call')) || normUpper('exp_tiempo_call')
  const expTiempoOtra = normalizeTiempoExperiencia(get('exp_tiempo_otra')) || normUpper('exp_tiempo_otra')

  // Limpieza y normalización de Usuario WhatsApp (descarta placeholders como 'no tengo', '-', etc.)
  let cleanUsuarioWhatsapp = null
  if (rawUsuarioWhatsapp) {
    const wClean = rawUsuarioWhatsapp.replace(/[\r\n]+/g, ' ').trim()
    const wUpper = wClean.toUpperCase()
    const invalidPlaceholders = [
      '-', '.', '*', '--', '---', '...', 'NO', 'NO TIENE', 'NO TENGO', 'NO TENGO USUARIO',
      'NO TENGO NOMBRE DE USUARIO', 'NINGUNO', 'NINGUNA', 'NO APLICA', 'NOAPLICA', 'N/A', 'NA',
      'NO LO HE MODIFICADO', 'NO HE MODIFICADO', 'NO MODIFIQUE', 'SIN MODIFICAR', 'SIN USUARIO',
      'NO DISPONIBLE', 'NO CUENTA', 'NO POSEE', 'X', 'XX', 'XXX', 'UNDEFINED', 'NULL'
    ]
    const isJunk = invalidPlaceholders.includes(wUpper) ||
                   wUpper.startsWith('NO TENGO') ||
                   wUpper.startsWith('NO LO HE') ||
                   wUpper.startsWith('NO HE') ||
                   wUpper === 'NO' ||
                   /^[-.*_/#]+$/.test(wClean)

    if (!isJunk) {
      // Si el postulante ingresó un número telefónico en vez de alias, formatearlo
      const wspPhone = extractPhonesFromText(wClean)
      if (wspPhone.primary) {
        cleanUsuarioWhatsapp = wspPhone.primary
      } else {
        cleanUsuarioWhatsapp = wClean
      }
    }
  }

  // Fallback: Si no indicó un alias personalizado de WhatsApp (o puso placeholder),
  // su WhatsApp de contacto es su celular principal (o de referencia)
  if (!cleanUsuarioWhatsapp) {
    cleanUsuarioWhatsapp = celularNorm || celularRefNorm || null
  }

  const rawMarcaTemporal = str('marca_temporal') || (
    colIdx.marca_temporal === undefined && row[0] && /^\d{1,4}[\/\-]\d{1,2}[\/\-]\d{1,4}/.test(String(row[0]).trim())
      ? String(row[0]).trim()
      : null
  )

  return {
    marca_temporal: parseTimestamp(rawMarcaTemporal),
    periodo_reclutado: normUpper('periodo_reclutado'),
    semana_trabajo: parseInt(get('semana_trabajo'), 10) || null,
    reclutador: normUpper('reclutador'),
    sede: normUpper('sede'),
    tipo_documento: normUpper('tipo_documento') || 'DNI',
    documento: rawDoc,
    apellido_paterno: rawApPaterno ? rawApPaterno.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase() : null,
    apellido_materno: rawApMaterno ? rawApMaterno.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase() : null,
    nombres: rawNombres ? rawNombres.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase() : null,
    celular: celularNorm || celularRefNorm,
    celular_referencia: celularRefNorm,
    usuario_whatsapp: cleanUsuarioWhatsapp,
    correo: normLower('correo'),
    genero: normUpper('genero'),
    fecha_nacimiento: fechaNacParsed,
    edad: edadParsed,
    estado_civil: normUpper('estado_civil'),
    n_hijos: nHijosParsed,
    nivel_academico: normUpper('nivel_academico'),
    carrera: normUpper('carrera'),
    nacionalidad: normUpper('nacionalidad') || 'PERUANA',
    lugar_residencia: rawLugar,
    distrito_residencia: rawDistrito,
    direccion_domicilio: rawDireccion,
    modalidad: normUpper('modalidad') || (allRowText.includes('REMOT') || allRowText.includes('HOME OFFICE') || allRowText.includes('TELETRABAJO') ? 'REMOTO' : 'PRESENCIAL'),
    exp_call_center: normUpper('exp_call_center'),
    exp_tipo_campana: normUpper('exp_tipo_campana'),
    exp_tiempo_call: expTiempoCall,
    // Alias BD (RPC adjudicar usa exp_tiempo_campana)
    exp_tiempo_campana: expTiempoCall,
    exp_otra: normUpper('exp_otra'),
    exp_tiempo_otra: expTiempoOtra,
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
    if (isSecondaryHeader && !rowCells.some(cell => /^\d{6,15}$/.test(cell) || isValidDocumento(cell))) {
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

export function applyNominaPayloadToForm(payload = {}, setValue) {
  if (!payload || typeof setValue !== 'function') return
  const cleanDoc = cleanDocumento(payload.documento)
  
  const fields = [
    'documento', 'tipo_documento', 'apellido_paterno', 'apellido_materno', 'nombres',
    'celular', 'celular_referencia', 'usuario_whatsapp', 'correo', 'genero', 'fecha_nacimiento', 'edad',
    'estado_civil', 'n_hijos', 'nivel_academico', 'carrera', 'nacionalidad',
    'lugar_residencia', 'distrito_residencia', 'direccion_domicilio', 'exp_call_center',
    'exp_tipo_campana', 'exp_tiempo_call', 'exp_otra', 'exp_tiempo_otra', 'fuente_oferta',
    'observacion_reclutamiento', 'campana', 'segmento', 'grupo_codigo', 'modalidad',
    'condicion', 'horario_gestion', 'descanso', 'envio_dni', 'test_psicologico',
    'validacion_pc', 'evaluacion_dia_0', 'fecha_inicio_capacitacion', 'fecha_fin_capacitacion',
    'fecha_conexion_ojt', 'fecha_conexion_op', 'pago_capacitacion', 'tipo_contratacion',
    'razon_social', 'remuneracion', 'bono_variable', 'bono_movilidad', 'bono_bienvenida',
    'bono_permanencia', 'bono_asistencia_perfecta', 'bono_nocturno', 'cargo_contractual', 'dia_0',
    'dia_0_obs', 'status_dia_1', 'dia_1', 'dia_1_obs', 'revision_estado', 'estado', 'periodo_reclutado', 'semana_trabajo', 'reclutador', 'sede'
  ]

  fields.forEach(field => {
    if (payload[field] !== undefined && payload[field] !== null) {
      if (field === 'documento') {
        setValue('documento', cleanDoc, { shouldValidate: true })
      } else {
        setValue(field, payload[field], { shouldValidate: true })
      }
    }
  })
}

export const NOMINA_FORM_GROUPS = []
export const STEP_LABELS = []
export const STEP_FIELDS = {}
export const REQUIRED_NOMINA_FIELDS = []
export const parseMoney = () => 0
export const NOMINA_FIELD_META = {}
