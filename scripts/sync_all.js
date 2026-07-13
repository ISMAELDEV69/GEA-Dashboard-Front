import fs from 'fs'
import pkg from 'pg';
const { Client } = pkg;

const envStr = fs.readFileSync('.env.local', 'utf8')
let dbUrl;
for (const line of envStr.split('\n')) {
  if (line.startsWith('DATABASE_URL=')) dbUrl = line.split('=')[1].trim();
}

const client = new Client({ connectionString: dbUrl })

export function parseLineRobust(text) {
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

function parseEuropeanNumber(val) {
  if (val == null || val === '') return null
  const n = Number(String(val).replace(',', '.').replace(/[^\d.-]/g, ''))
  return Number.isFinite(n) ? n : null
}

function parseExcelDate(val) {
  if (!val) return null
  const s = String(val).trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  const d = new Date(s)
  if (!Number.isNaN(d.getTime())) return d.toISOString().split('T')[0]
  return null
}

function normalizeModalidad(val) {
  const v = String(val || 'PRESENCIAL').toUpperCase().trim()
  if (v.includes('REMOT')) return 'REMOTO'
  if (v.includes('HIBR') || v.includes('HYBR')) return 'HIBRIDO'
  return 'PRESENCIAL'
}

function parseSemanaLabel(val) {
  if (!val) return { label: '', number: null }
  const s = String(val).trim().toUpperCase()
  const match = s.match(/(\d{1,2})/)
  const num = match ? Number(match[1]) : null
  return { label: s.startsWith('SEM') ? s : (num ? `SEM ${num}` : s), number: num }
}

async function run() {
  await client.connect()
  try {
    const csvUrl = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vR5cIgvA11b8Xczt-fwGREZ9XPWMXxPq5OTpNMXgaiU3jEMWD4FwVjAdFpDX5V3fI5lXEQST8S_vI70/pub?output=csv'
    const res = await fetch(csvUrl)
    const text = await res.text()

    const matrix = parseLineRobust(text)
    const headers = matrix[0].map(h => String(h || '').toUpperCase().trim())
    const colIdx = {
      segmento: headers.findIndex(h => h.includes('SEGMENTO')),
      area_traslado: headers.findIndex(h => h.includes('AREA / TRASLADO') || h.includes('TRASLADO')),
      campana: headers.findIndex(h => h.includes('CAMPAÑA')),
      codigo: headers.findIndex(h => h.includes('GRUPO DE CAPACITACION')),
      semana: headers.findIndex(h => h.includes('SEMANA')),
      modalidad: headers.findIndex(h => h.includes('MODALIDAD')),
      condicion: headers.findIndex(h => h.includes('CONDICION')),
      estado: headers.findIndex(h => h.includes('ESTADO')),
      fecha_inicio: headers.findIndex(h => h.includes('FECHA DE INICIO')),
      periodo: headers.findIndex(h => h.includes('PERIODO')),
      rango_horario: headers.findIndex(h => h.includes('RANGO HORARIO') || h.includes('HORARIO')),
      extension_teoria: headers.findIndex(h => h.includes('TEORIA')),
      fecha_inicio_ojt: headers.findIndex(h => h.includes('FECHA INICIO OJT')),
      extension_ojt: headers.findIndex(h => h.includes('EXTENSION OJT')),
      fecha_ingreso_op: headers.findIndex(h => h.includes('FECHA INGRESO OP')),
      rq_solicitado: headers.findIndex(h => h.includes('RQ SOLICITADO')),
      rq_ftes_solicitado: headers.findIndex(h => h.includes('RQ FTES SOLICITADO')),
      meta_dia_0: headers.findIndex(h => h.includes('META DIA 0')),
      meta_dia_1: headers.findIndex(h => h.includes('META DIA 1')),
      periodo_ingreso_op: headers.findIndex(h => h.includes('PERIODO INGRESO OP')),
      periodo_rys: headers.findIndex(h => h.includes('RYS')),
    }

    const campResult = await client.query("SELECT id, nombre FROM campanas")
    const campanaMap = new Map()
    campResult.rows.forEach(c => campanaMap.set(c.nombre.toUpperCase(), c.id))

    const finalPayloads = []
    const validCodes = []
    const seenCodes = new Set()
    
    for (let i = 1; i < matrix.length; i++) {
      const row = matrix[i]
      if (row.every(c => !String(c).trim())) continue
      
      const get = (key) => {
        const idx = colIdx[key]
        return idx >= 0 ? row[idx] : null
      }

      let codigo = String(get('codigo') || '').trim().toUpperCase()
      if (!codigo) codigo = `S/C-FILA-${i + 1}`
      
      let finalCodigo = codigo
      let counter = 1
      while (seenCodes.has(finalCodigo)) {
        finalCodigo = `${codigo}_${counter}`
        counter++
      }
      seenCodes.add(finalCodigo)
      validCodes.push(finalCodigo)

      const campana_nombre = String(get('campana') || 'SIN CAMPAÑA').trim().toUpperCase()
      let campana_id = campanaMap.get(campana_nombre)
      
      if (!campana_id) {
        const insertCamp = await client.query("INSERT INTO campanas (nombre, segmento) VALUES ($1, $2) RETURNING id", [campana_nombre, String(get('segmento') || '').trim().toUpperCase()])
        campana_id = insertCamp.rows[0].id
        campanaMap.set(campana_nombre, campana_id)
      }

      const semana = parseSemanaLabel(get('semana'))

      finalPayloads.push({
        codigo: finalCodigo,
        campana_id,
        semana_trabajo: semana.number,
        semana_label: semana.label,
        modalidad: normalizeModalidad(get('modalidad')),
        condicion: String(get('condicion') || '').trim().toUpperCase() || null,
        rango_horario: String(get('rango_horario') || '').trim() || null,
        fecha_registro: parseExcelDate(get('fecha_inicio')) || new Date().toISOString().split('T')[0],
        periodo_capacitacion: String(get('periodo') || '').trim() || null,
        fecha_inicio_ojt: parseExcelDate(get('fecha_inicio_ojt')),
        fecha_ingreso_op: parseExcelDate(get('fecha_ingreso_op')),
        extension_teoria: String(get('extension_teoria') || '').trim() || null,
        extension_ojt: String(get('extension_ojt') || '').trim() || null,
        rq_solicitado: parseEuropeanNumber(get('rq_solicitado')),
        rq_ftes_solicitado: parseEuropeanNumber(get('rq_ftes_solicitado')),
        meta_dia_0: parseEuropeanNumber(get('meta_dia_0')),
        meta_dia_1: parseEuropeanNumber(get('meta_dia_1')),
        periodo_ingreso_op: String(get('periodo_ingreso_op') || '').trim() || null,
        periodo_rys: String(get('periodo_rys') || row[20] || '').trim() || null,
        area_traslado: String(get('area_traslado') || '').trim().toUpperCase() || null,
        estado_grupo: String(get('estado') || 'PLANIFICADO').trim().toUpperCase(),
      })
    }
    
    console.log(`Prepared ${finalPayloads.length} payloads. Deleting ghosts...`)
    
    // Find codes in DB not in CSV
    const dbCodes = await client.query("SELECT codigo FROM grupos_capacitacion")
    const toDelete = dbCodes.rows.map(r => r.codigo).filter(c => !validCodes.includes(c))
    if (toDelete.length > 0) {
      for (let i = 0; i < toDelete.length; i+=100) {
         const chunk = toDelete.slice(i, i+100)
         const placeholders = chunk.map((_, idx) => `$${idx+1}`).join(',')
         try {
           await client.query(`DELETE FROM grupos_capacitacion WHERE codigo IN (${placeholders})`, chunk)
         } catch(e) {
           console.log("Could not delete some rows (FK constraint). Skipping deletion for them.")
         }
      }
    }

    console.log(`Upserting ${finalPayloads.length} rows...`)
    for (const p of finalPayloads) {
      await client.query(`
        INSERT INTO grupos_capacitacion (
          codigo, campana_id, semana_trabajo, semana_label, modalidad, condicion,
          rango_horario, fecha_registro, periodo_capacitacion, fecha_inicio_ojt,
          fecha_ingreso_op, extension_teoria, extension_ojt, rq_solicitado,
          rq_ftes_solicitado, meta_dia_0, meta_dia_1, periodo_ingreso_op,
          periodo_rys, area_traslado, estado_grupo
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21
        ) ON CONFLICT (codigo) DO UPDATE SET
          campana_id = EXCLUDED.campana_id,
          semana_trabajo = EXCLUDED.semana_trabajo,
          semana_label = EXCLUDED.semana_label,
          modalidad = EXCLUDED.modalidad,
          condicion = EXCLUDED.condicion,
          rango_horario = EXCLUDED.rango_horario,
          fecha_registro = EXCLUDED.fecha_registro,
          periodo_capacitacion = EXCLUDED.periodo_capacitacion,
          fecha_inicio_ojt = EXCLUDED.fecha_inicio_ojt,
          fecha_ingreso_op = EXCLUDED.fecha_ingreso_op,
          extension_teoria = EXCLUDED.extension_teoria,
          extension_ojt = EXCLUDED.extension_ojt,
          rq_solicitado = EXCLUDED.rq_solicitado,
          rq_ftes_solicitado = EXCLUDED.rq_ftes_solicitado,
          meta_dia_0 = EXCLUDED.meta_dia_0,
          meta_dia_1 = EXCLUDED.meta_dia_1,
          periodo_ingreso_op = EXCLUDED.periodo_ingreso_op,
          periodo_rys = EXCLUDED.periodo_rys,
          area_traslado = EXCLUDED.area_traslado,
          estado_grupo = EXCLUDED.estado_grupo
      `, [
        p.codigo, p.campana_id, p.semana_trabajo, p.semana_label, p.modalidad, p.condicion,
        p.rango_horario, p.fecha_registro, p.periodo_capacitacion, p.fecha_inicio_ojt,
        p.fecha_ingreso_op, p.extension_teoria, p.extension_ojt, p.rq_solicitado,
        p.rq_ftes_solicitado, p.meta_dia_0, p.meta_dia_1, p.periodo_ingreso_op,
        p.periodo_rys, p.area_traslado, p.estado_grupo
      ])
    }
    console.log("Successfully synced all rows!")
  } catch(e) {
     console.error("Error:", e)
  }
  await client.end()
}
run()
