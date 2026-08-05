/**
 * CAPACIDAD_RYS v.Final — mapeo de columnas del Excel operativo GEA
 * https://docs.google.com/spreadsheets/d/e/2PACX-1vR5cIgvA11b8Xczt-fwGREZ9XPWMXxPq5OTpNMXgaiU3jEMWD4FwVjAdFpDX5V3fI5lXEQST8S_vI70/pubhtml
 */

/** Bloques visuales para UI (data storytelling por fase) */
export const CAPACIDAD_RYS_GROUPS = [
  {
    id: 'identidad',
    title: 'Identidad del grupo',
    color: '#6366f1',
    fields: ['segmento', 'area_traslado', 'campana', 'grupo_capacitacion', 'semana'],
  },
  {
    id: 'operacion',
    title: 'Operación y modalidad',
    color: '#2dd4bf',
    fields: ['sede', 'modalidad', 'condicion_laboral', 'estado', 'fecha_inicio', 'periodo', 'rango_horario'],
  },
  {
    id: 'pipeline',
    title: 'Pipeline capacitación → OP',
    color: '#f59e0b',
    fields: ['extension_teoria', 'fecha_inicio_ojt', 'extension_ojt', 'fecha_ingreso_op', 'periodo_ingreso_op', 'periodo_rys'],
  },
  {
    id: 'metas',
    title: 'Requerimiento y metas',
    color: '#10b981',
    fields: ['rq_solicitado', 'rq_ftes_solicitado', 'meta_dia_0', 'meta_dia_1'],
  },
]

/** Columnas en orden del Excel */
export const CAPACIDAD_RYS_COLUMNS = [
  { key: 'segmento', label: 'SEGMENTO', db: 'segmento', type: 'text' },
  { key: 'area_traslado', label: 'AREA / TRASLADO', db: 'area_traslado', type: 'text' },
  { key: 'campana', label: 'CAMPAÑA', db: 'campana', type: 'text' },
  { key: 'grupo_capacitacion', label: 'GRUPO DE CAPACITACION', db: 'codigo', type: 'text', required: true },
  { key: 'semana', label: 'SEMANA', db: 'semana_label', type: 'text' },
  { key: 'sede', label: 'SEDE', db: 'sede', type: 'text' },
  { key: 'modalidad', label: 'MODALIDAD', db: 'modalidad', type: 'select', options: ['PRESENCIAL', 'REMOTO', 'HIBRIDO'] },
  { key: 'condicion_laboral', label: 'CONDICION LABORAL', db: 'condicion', type: 'text' },
  { key: 'estado', label: 'ESTADO', db: 'estado', type: 'select', options: ['PLANIFICADO', 'ACTIVO', 'EN_CURSO', 'CERRADO'] },
  { key: 'fecha_inicio', label: 'FECHA DE INICIO', db: 'fecha_registro', type: 'date' },
  { key: 'periodo', label: 'PERIODO', db: 'periodo', type: 'text' },
  { key: 'rango_horario', label: 'RANGO HORARIO', db: 'rango_horario', type: 'text' },
  { key: 'extension_teoria', label: 'EXTENSIÓN TEORIA', db: 'extension_teoria', type: 'text' },
  { key: 'fecha_inicio_ojt', label: 'FECHA INICIO OJT', db: 'fecha_inicio_ojt', type: 'date' },
  { key: 'extension_ojt', label: 'EXTENSIÓN OJT', db: 'extension_ojt', type: 'text' },
  { key: 'fecha_ingreso_op', label: 'FECHA INGRESO OP.', db: 'fecha_ingreso_op', type: 'date' },
  { key: 'rq_solicitado', label: 'RQ SOLICITADO', db: 'rq_solicitado', type: 'number' },
  { key: 'rq_ftes_solicitado', label: 'RQ FTES SOLICITADO', db: 'rq_ftes_solicitado', type: 'number' },
  { key: 'meta_dia_0', label: 'META DIA 0', db: 'meta_dia_0', type: 'integer' },
  { key: 'meta_dia_1', label: 'META DIA 1', db: 'meta_dia_1', type: 'integer' },
  { key: 'periodo_ingreso_op', label: 'PERIODO INGRESO OP.', db: 'periodo_ingreso_op', type: 'text' },
  { key: 'periodo_rys', label: 'PERIODO RYS', db: 'periodo_rys', type: 'text' },
]

const HEADER_ALIASES = {
  segmento: ['SEGMENTO'],
  area_traslado: ['AREA', 'TRASLADO', 'AREA / TRASLADO'],
  campana: ['CAMPAÑA', 'CAMPANA', 'CAMPA'],
  grupo_capacitacion: ['GRUPO DE CAPACITACION', 'GRUPO', 'GPE'],
  semana: ['SEMANA'],
  sede: ['SEDE', 'SEDE TRABAJO', 'SEDE DE TRABAJO'],
  modalidad: ['MODALIDAD'],
  condicion_laboral: ['CONDICION LABORAL', 'CONDICION'],
  estado: ['ESTADO'],
  fecha_inicio: ['FECHA DE INICIO', 'FECHA INICIO'],
  periodo: ['PERIODO'],
  rango_horario: ['RANGO HORARIO', 'HORARIO'],
  extension_teoria: ['EXTENSION TEORIA', 'EXTENSIÓN TEORIA', 'TEORIA'],
  fecha_inicio_ojt: ['FECHA INICIO OJT', 'OJT'],
  extension_ojt: ['EXTENSION OJT', 'EXTENSIÓN OJT'],
  fecha_ingreso_op: ['FECHA INGRESO OP', 'INGRESO OP'],
  rq_solicitado: ['RQ SOLICITADO'],
  rq_ftes_solicitado: ['RQ FTES SOLICITADO', 'RQ FTES', 'FTES SOLICITADO'],
  meta_dia_0: ['META DIA 0', 'META DÍA 0'],
  meta_dia_1: ['META DIA 1', 'META DÍA 1'],
  periodo_ingreso_op: ['PERIODO INGRESO OP'],
  periodo_rys: ['RYS', 'PERIODO RYS'],
}

export function parseSemanaLabel(val) {
  if (!val) return { label: '', number: null }
  const s = String(val).trim().toUpperCase()
  const match = s.match(/(\d{1,2})/)
  const num = match ? Number(match[1]) : null
  return { label: s.startsWith('SEM') ? s : (num ? `SEM ${num}` : s), number: num }
}

export function parseEuropeanNumber(val) {
  if (val == null || val === '') return null
  const n = Number(String(val).replace(',', '.').replace(/[^\d.-]/g, ''))
  return Number.isFinite(n) ? n : null
}

export function parseExcelDate(val) {
  if (!val) return null
  const s = String(val).trim()
  
  if (/^\d{5}$/.test(s)) {
    const serial = parseInt(s, 10)
    // Excel epoch is Dec 30, 1899. 25569 is Jan 1, 1970
    const d = new Date((serial - 25569) * 86400 * 1000)
    return d.toISOString().split('T')[0]
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  
  // Matches DD/MM/YYYY or DD/MM/YY
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/)
  if (m) {
    let year = parseInt(m[3], 10)
    if (year < 100) year += 2000
    return `${year}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  }
  
  const d = new Date(s)
  if (!Number.isNaN(d.getTime())) return d.toISOString().split('T')[0]
  return null
}

export function normalizeModalidad(val) {
  const v = String(val || 'PRESENCIAL').toUpperCase().trim()
  if (v.includes('REMOT')) return 'REMOTO'
  if (v.includes('HIBR') || v.includes('HYBR')) return 'HIBRIDO'
  return 'PRESENCIAL'
}

/** Detecta índices de columnas en fila de encabezados del CSV/Excel */
export function mapCapacidadRysHeaders(headerRow = []) {
  const headers = headerRow.map(h => String(h || '').toUpperCase().trim())
  const colIdx = {}

  for (const col of CAPACIDAD_RYS_COLUMNS) {
    const aliases = HEADER_ALIASES[col.key] || [col.label]
    colIdx[col.key] = headers.findIndex(h =>
      aliases.some(a => h.includes(a.toUpperCase()))
    )
  }

  return colIdx
}

export function rowToCapacidadRysPayload(row, colIdx, rowIndex = 0) {
  const get = (key) => {
    const i = colIdx[key]
    return i >= 0 ? row[i] : null
  }

  const semana = parseSemanaLabel(get('semana'))
  let codigo = String(get('grupo_capacitacion') || '').trim().toUpperCase()
  const campanaNombre = String(get('campana') || '').trim().toUpperCase()
  const periodo = String(get('periodo') || '').trim()

  if (!codigo) {
    codigo = ''
  }

  return {
    codigo,
    campana_nombre: String(get('campana') || '').trim().toUpperCase(),
    segmento: String(get('segmento') || '').trim().toUpperCase() || null,
    area_traslado: String(get('area_traslado') || '').trim().toUpperCase() || null,
    semana_label: semana.label || null,
    semana_trabajo: semana.number,
    modalidad: normalizeModalidad(get('modalidad')),
    condicion: String(get('condicion_laboral') || '').trim().toUpperCase() || null,
    estado: String(get('estado') || 'PLANIFICADO').trim().toUpperCase(),
    fecha_registro: parseExcelDate(get('fecha_inicio')) || new Date().toISOString().split('T')[0],
    periodo: String(get('periodo') || '').trim() || null,
    rango_horario: String(get('rango_horario') || '').trim() || null,
    extension_teoria: String(get('extension_teoria') || '').trim() || null,
    fecha_inicio_ojt: parseExcelDate(get('fecha_inicio_ojt')),
    extension_ojt: String(get('extension_ojt') || '').trim() || null,
    fecha_ingreso_op: parseExcelDate(get('fecha_ingreso_op')),
    rq_solicitado: parseEuropeanNumber(get('rq_solicitado')),
    rq_ftes_solicitado: parseEuropeanNumber(get('rq_ftes_solicitado')),
    meta_dia_0: parseEuropeanNumber(get('meta_dia_0')),
    meta_dia_1: parseEuropeanNumber(get('meta_dia_1')),
    periodo_ingreso_op: String(get('periodo_ingreso_op') || '').trim() || null,
    periodo_rys: String(get('periodo_rys') || row[20] || '').trim() || null,
  }
}

/** Parsea CSV texto (separador coma) a filas de payload */
export function parseCapacidadRysCsv(text) {
  // Usamos el mismo parser robusto que nominaConsolidado para evitar que las celdas con salto de línea rompan la fila
  const parseLineRobust = (text) => {
    const rows = []
    let row = []
    let cell = ''
    let inQuotes = false
    for (let i = 0; i < text.length; i++) {
      const ch = text[i]
      const next = text[i + 1]
      if (inQuotes) {
        if (ch === '"' && next === '"') { cell += '"'; i++ }
        else if (ch === '"') inQuotes = false
        else cell += ch
      } else if (ch === '"') {
        inQuotes = true
      } else if (ch === ',' || ch === '\t') {
        row.push(cell)
        cell = ''
      } else if (ch === '\r') {
        // ignora \r fuera de quotes
      } else if (ch === '\n') {
        row.push(cell)
        rows.push(row)
        row = []
        cell = ''
      } else {
        cell += ch
      }
    }
    if (cell || row.length > 0) {
      row.push(cell)
      rows.push(row)
    }
    return rows
  }

  const matrix = parseLineRobust(text)
  if (matrix.length < 2) return []

  const headerRow = matrix[0]
  const colIdx = mapCapacidadRysHeaders(headerRow)
  const payloads = []
  const seenCodes = new Set()

  for (let i = 1; i < matrix.length; i++) {
    const row = matrix[i]
    if (row.every(c => !String(c).trim())) continue
    const payload = rowToCapacidadRysPayload(row, colIdx, i - 1)
    if (payload) {
      payloads.push(payload)
    }
  }
  return payloads
}

export function grupoToCapacidadRow(grupo) {
  if (!grupo) return {}
  return {
    segmento: grupo.segmento || '',
    area_traslado: grupo.area_traslado || '',
    campana: grupo.campana || '',
    grupo_capacitacion: grupo.codigo || '',
    semana: grupo.semana_label || (grupo.semana_trabajo ? `SEM ${grupo.semana_trabajo}` : ''),
    modalidad: grupo.modalidad || '',
    condicion_laboral: grupo.condicion || '',
    estado: grupo.estado || '',
    fecha_inicio: grupo.fecha_registro || grupo.fecha || '',
    periodo: grupo.periodo || '',
    rango_horario: grupo.rango_horario || '',
    extension_teoria: grupo.extension_teoria || '',
    fecha_inicio_ojt: grupo.fecha_inicio_ojt || '',
    extension_ojt: grupo.extension_ojt || '',
    fecha_ingreso_op: grupo.fecha_ingreso_op || '',
    rq_solicitado: grupo.rq_solicitado ?? '',
    rq_ftes_solicitado: grupo.rq_ftes_solicitado ?? '',
    meta_dia_0: grupo.meta_dia_0 ?? '',
    meta_dia_1: grupo.meta_dia_1 ?? '',
    periodo_ingreso_op: grupo.periodo_ingreso_op || '',
    periodo_rys: grupo.periodo_rys || '',
  }
}
