import fs from 'fs'
import pkg from 'pg';
const { Client } = pkg;
import { parseLineRobust } from './purge_extra.js'

const envStr = fs.readFileSync('.env.local', 'utf8')
let dbUrl;
for (const line of envStr.split('\n')) {
  if (line.startsWith('DATABASE_URL=')) dbUrl = line.split('=')[1].trim();
}
const client = new Client({ connectionString: dbUrl })

async function getCampanas(client) {
  const res = await client.query('SELECT id, UPPER(TRIM(nombre)) as nombre, UPPER(TRIM(segmento)) as segmento FROM campanas')
  const map = {}
  for (const r of res.rows) {
    const key = `${r.segmento || ''}|${r.nombre}`
    map[key] = r.id
  }
  return map
}

function parseDate(dStr) {
  if (!dStr) return null;
  if (typeof dStr === 'number') {
     const date = new Date((dStr - (25567 + 2)) * 86400 * 1000);
     return date.toISOString().split('T')[0];
  }
  const str = String(dStr).trim();
  if (str.includes('/')) {
    const [d, m, y] = str.split('/');
    if (y && m && d) {
       const yr = y.length === 2 ? `20${y}` : y;
       return `${yr}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
  }
  return null;
}

function parseHoras(str) {
  if (!str) return null
  const num = parseInt(str.replace(/[^0-9-]/g, ''))
  return isNaN(num) ? null : num
}

function parseFtes(str) {
  if (!str) return null
  const num = parseFloat(str.replace(/[^0-9.-]/g, ''))
  return isNaN(num) ? null : num
}

async function run() {
  await client.connect()
  try {
    console.log("Fetching Excel...")
    const csvUrl = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vR5cIgvA11b8Xczt-fwGREZ9XPWMXxPq5OTpNMXgaiU3jEMWD4FwVjAdFpDX5V3fI5lXEQST8S_vI70/pub?output=csv'
    const res = await fetch(csvUrl)
    const text = await res.text()

    const matrix = parseLineRobust(text)
    const headers = matrix[0].map(h => String(h || '').toUpperCase().trim())

    const iSeg = headers.findIndex(h => h.includes('SEGMENTO'))
    const iTras = headers.findIndex(h => h.includes('AREA') || h.includes('TRASLADO'))
    const iCamp = headers.findIndex(h => h.includes('CAMPAÑA'))
    const iCod = headers.findIndex(h => h.includes('GRUPO DE CAPACITACION'))
    const iSem = headers.findIndex(h => h.includes('SEMANA'))
    const iMod = headers.findIndex(h => h.includes('MODALIDAD'))
    const iCond = headers.findIndex(h => h.includes('CONDICION'))
    const iEst = headers.findIndex(h => h.includes('ESTADO'))
    const iFecInicio = headers.findIndex(h => h.includes('FECHA INICIO'))
    const iPerCap = headers.findIndex(h => h === 'PERIODO')
    const iRango = headers.findIndex(h => h.includes('RANGO HORARIO'))
    const iExtTeo = headers.findIndex(h => h.includes('EXTENSION TEORIA'))
    const iFecOjt = headers.findIndex(h => h.includes('FECHA INICIO OJT'))
    const iExtOjt = headers.findIndex(h => h.includes('EXTENSION OJT'))
    const iFecOp = headers.findIndex(h => h.includes('FECHA INGRESO OP'))
    const iRqSol = headers.findIndex(h => h.includes('RQ SOLICITADO'))
    const iRqFte = headers.findIndex(h => h.includes('RQ FTES'))
    const iMeta0 = headers.findIndex(h => h.includes('META DIA 0'))
    const iMeta1 = headers.findIndex(h => h.includes('META DIA 1'))
    const iPerOp = headers.findIndex(h => h.includes('PERIODO INGRESO OP'))
    const iPerRys = headers.findIndex(h => h === 'PERIODO RYS')
    const iFormadorDoc = headers.findIndex(h => h.includes('DOCUMENTO FORMADOR'))

    const campanasMap = await getCampanas(client)

    // GET ALL EXISTING GROUPS
    const existingRes = await client.query('SELECT id, codigo, campana_id FROM grupos_capacitacion')
    const existingGroups = existingRes.rows
    const usedGroups = new Set()

    let inserted = 0
    let updated = 0

    for (let i = 1; i < matrix.length; i++) {
      const row = matrix[i]
      if (row.every(c => !String(c).trim())) continue

      let segmento = String(row[iSeg] || '').trim().toUpperCase()
      let campana = String(row[iCamp] || '').trim().toUpperCase()
      const campKey = `${segmento}|${campana}`
      let campana_id = campanasMap[campKey]

      if (!campana_id && campana) {
         const iRes = await client.query('INSERT INTO campanas (nombre, segmento) VALUES ($1, $2) RETURNING id', [campana, segmento])
         campana_id = iRes.rows[0].id
         campanasMap[campKey] = campana_id
      }

      let codigo = String(row[iCod] || '').trim().toUpperCase()
      let semanaStr = String(row[iSem] || '').trim()
      let semana_trabajo = parseHoras(semanaStr)
      
      const args = [
        codigo || '', campana_id, String(row[iTras] || '').trim().toUpperCase() || null,
        semanaStr || null, semana_trabajo,
        String(row[iMod] || '').trim().toUpperCase() || null, String(row[iCond] || '').trim().toUpperCase() || null,
        String(row[iEst] || '').trim().toUpperCase() || null, parseDate(row[iFecInicio]) || new Date().toISOString(),
        String(row[iPerCap] || '').trim() || null, String(row[iRango] || '').trim() || null,
        parseHoras(row[iExtTeo]), parseDate(row[iFecOjt]), parseHoras(row[iExtOjt]),
        parseDate(row[iFecOp]), parseHoras(row[iRqSol]), parseFtes(row[iRqFte]),
        parseHoras(row[iMeta0]), parseHoras(row[iMeta1]), String(row[iPerOp] || '').trim() || null,
        String(row[iPerRys] || '').trim() || null, String(row[iFormadorDoc] || '').trim() || null
      ]

      // FIND A MATCHING EXISTING GROUP THAT HASN'T BEEN USED YET
      let match = existingGroups.find(g => !usedGroups.has(g.id) && g.codigo === codigo && g.campana_id == campana_id)
      // IF NOT FOUND, FALLBACK TO JUST CODIGO OR JUST CAMPANA
      if (!match) match = existingGroups.find(g => !usedGroups.has(g.id) && g.codigo === codigo)
      
      if (match) {
         usedGroups.add(match.id)
         await client.query(`
           UPDATE grupos_capacitacion SET
             codigo=$1, campana_id=$2, area_traslado=$3, semana_label=$4, semana_trabajo=$5,
             modalidad=$6, condicion=$7, estado_grupo=$8, fecha_registro=$9, periodo_capacitacion=$10,
             rango_horario=$11, extension_teoria=$12, fecha_inicio_ojt=$13, extension_ojt=$14,
             fecha_ingreso_op=$15, rq_solicitado=$16, rq_ftes_solicitado=$17, meta_dia_0=$18, meta_dia_1=$19,
             periodo_ingreso_op=$20, periodo_rys=$21, formador_documento=$22
           WHERE id=$23
         `, [...args, match.id])
         updated++
      } else {
         await client.query(`
           INSERT INTO grupos_capacitacion (
             codigo, campana_id, area_traslado, semana_label, semana_trabajo,
             modalidad, condicion, estado_grupo, fecha_registro, periodo_capacitacion,
             rango_horario, extension_teoria, fecha_inicio_ojt, extension_ojt,
             fecha_ingreso_op, rq_solicitado, rq_ftes_solicitado, meta_dia_0, meta_dia_1,
             periodo_ingreso_op, periodo_rys, formador_documento
           ) VALUES (
             $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
             $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22
           )
         `, args)
         inserted++
      }
    }
    console.log(`Sync complete! Updated: ${updated}, Inserted: ${inserted}`)
    
    // Check unused
    const unused = existingGroups.filter(g => !usedGroups.has(g.id))
    if (unused.length > 0) {
      console.log(`There are ${unused.length} unused groups. We will mark them as INACTIVO but not delete to avoid cascading delete of nominas.`)
      // Not actually modifying them here unless necessary
    }

  } catch(e) {
     console.error(e)
  }
  await client.end()
}
run()
