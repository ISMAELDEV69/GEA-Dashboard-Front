import fs from 'fs'
import pkg from 'pg';
const { Client } = pkg;

const envStr = fs.readFileSync('.env.local', 'utf8')
let dbUrl;
for (const line of envStr.split('\n')) {
  if (line.startsWith('DATABASE_URL=')) dbUrl = line.split('=')[1].trim();
}

const client = new Client({ connectionString: dbUrl })

async function checkCalibracionDia1(grupo_codigo) {
  const { rows: grpData } = await client.query(`SELECT id FROM grupos_capacitacion WHERE codigo = $1 ORDER BY created_at DESC LIMIT 1`, [grupo_codigo])
  if (!grpData.length) return null
  const grupo_id = grpData[0].id

  const { rows: config } = await client.query(`SELECT * FROM grupos_dia1 WHERE grupo_id = $1 LIMIT 1`, [grupo_id])
  if (!config.length) return null
  
  const { rows: recAsis } = await client.query(`SELECT a.*, g.codigo FROM asistencias_dia1_reclutador a JOIN grupos_capacitacion g ON a.grupo_id = g.id WHERE g.codigo = $1`, [grupo_codigo])
  const { rows: formAsis } = await client.query(`SELECT a.*, g.codigo FROM asistencias_capacitacion a JOIN grupos_capacitacion g ON a.grupo_id = g.id WHERE g.codigo = $1 AND a.fecha_asistencia = $2`, [grupo_codigo, config[0].fecha_dia1])
  
  const formFiltered = formAsis.filter(f => !(f.sigla_asistencia === 'B' && f.motivo_baja === 'BAJA DIA 1'))
  const mapForm = new Map(formFiltered.map(f => [f.postulante_documento, f.sigla_asistencia]))
  const mapRec = new Map(recAsis.map(r => [r.postulante_documento, r.sigla_final]))
  
  const allDocs = new Set([...mapForm.keys(), ...mapRec.keys()])
  
  let isCalibrated = true
  
  for (const doc of allDocs) {
    const formSigla = mapForm.get(doc) || 'Sin registro'
    const recSigla = mapRec.get(doc) || 'Sin registro'
    
    const isFormAsistencia = formSigla === 'A' || formSigla === 'I-OP'
    const isRecAsistencia = recSigla === 'A'
    
    if (isFormAsistencia !== isRecAsistencia) {
      isCalibrated = false
      console.log(`Discrepancy for ${doc}: Formador=${formSigla}, Reclutador=${recSigla}`)
      break
    }
  }
  
  const newState = isCalibrated ? 'CALIBRADO' : 'DESCALIBRADO'
  console.log("Calculated new state:", newState)
  await client.query(`UPDATE grupos_dia1 SET estado_calibracion = $1, updated_at = NOW() WHERE grupo_id = $2`, [newState, grupo_id])
  
  return newState
}

async function run() {
  await client.connect()
  try {
     await checkCalibracionDia1('GPE-2026013')
  } catch(e) {
     console.error("Error:", e.message)
  }
  await client.end()
}
run()
