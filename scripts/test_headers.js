import fs from 'fs'
const CAPACIDAD_RYS_COLUMNS = [
  { key: 'segmento', label: 'SEGMENTO', db: 'segmento', type: 'text' },
  { key: 'area_traslado', label: 'AREA / TRASLADO', db: 'area_traslado', type: 'text' },
  { key: 'campana', label: 'CAMPAÑA', db: 'campana', type: 'text' },
  { key: 'grupo_capacitacion', label: 'GRUPO DE CAPACITACION', db: 'codigo', type: 'text', required: true },
  { key: 'semana', label: 'SEMANA', db: 'semana_label', type: 'text' },
  { key: 'modalidad', label: 'MODALIDAD', db: 'modalidad', type: 'select', options: ['PRESENCIAL', 'REMOTO', 'HIBRIDO'] },
  { key: 'condicion_laboral', label: 'CONDICION LABORAL', db: 'condicion', type: 'text' },
  { key: 'estado', label: 'ESTADO', db: 'estado_grupo', type: 'select', options: ['PLANIFICADO', 'ACTIVO', 'EN_CURSO', 'CERRADO'] },
  { key: 'fecha_inicio', label: 'FECHA DE INICIO', db: 'fecha_registro', type: 'date' },
  { key: 'periodo', label: 'PERIODO', db: 'periodo_capacitacion', type: 'text' },
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

async function run() {
    const csvUrl = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vR5cIgvA11b8Xczt-fwGREZ9XPWMXxPq5OTpNMXgaiU3jEMWD4FwVjAdFpDX5V3fI5lXEQST8S_vI70/pub?output=csv'
    const res = await fetch(csvUrl)
    const text = await res.text()
    const headerRow = text.split('\n')[0].split(',')
    const headers = headerRow.map(h => String(h || '').toUpperCase().trim())
    
    console.log("Headers:", headers)
    
    const colIdx = {}
    for (const col of CAPACIDAD_RYS_COLUMNS) {
      const aliases = HEADER_ALIASES[col.key] || [col.label]
      colIdx[col.key] = headers.findIndex(h =>
        aliases.some(a => h.includes(a.toUpperCase()))
      )
    }
    
    console.log("colIdx:", colIdx)
}
run()
