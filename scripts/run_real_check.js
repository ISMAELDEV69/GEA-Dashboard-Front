import fs from 'fs'
import pkg from 'pg';
const { Client } = pkg;

const envStr = fs.readFileSync('.env.local', 'utf8')
let dbUrl;
for (const line of envStr.split('\n')) {
  if (line.startsWith('DATABASE_URL=')) dbUrl = line.split('=')[1].trim();
}

const client = new Client({ connectionString: dbUrl })

async function run() {
  await client.connect()
  try {
     let grpRes = await client.query(`SELECT id FROM grupos_capacitacion WHERE codigo = 'GPE-2026013' ORDER BY created_at DESC LIMIT 1`)
     const grupo_id = grpRes.rows[0].id
     
     // 1. Fetch formAsis
     const { rows: formAsis } = await client.query(`SELECT postulante_documento, sigla_asistencia, motivo_baja, fecha_asistencia FROM asistencias_capacitacion WHERE grupo_id = $1`, [grupo_id])
     
     // 2. Fetch recAsis
     const { rows: recAsis } = await client.query(`SELECT postulante_documento, sigla_final FROM asistencias_dia1_reclutador WHERE grupo_id = $1`, [grupo_id])
     
     // 3. Aggregate
     const mapFormFull = new Map()
     for (const f of formAsis) {
        const doc = f.postulante_documento
        const dStr = new Date(f.fecha_asistencia).toISOString().split('T')[0]
        
        if (!mapFormFull.has(doc)) {
           mapFormFull.set(doc, f)
        } else {
           const existing = mapFormFull.get(doc)
           if (f.motivo_baja === 'BAJA DIA 1') {
              mapFormFull.set(doc, f)
           } else if (existing.motivo_baja !== 'BAJA DIA 1' && dStr === '2026-06-16') {
              mapFormFull.set(doc, f)
           }
        }
     }
     
     const mapRec = new Map(recAsis.map(r => [r.postulante_documento, r.sigla_final]))
     const allDocs = new Set([...mapFormFull.keys(), ...mapRec.keys()])
     
     let isCalibrated = true
     for (const doc of allDocs) {
        const formRecord = mapFormFull.get(doc)
        const recSigla = mapRec.get(doc) || 'Sin registro'
        const formSigla = formRecord ? formRecord.sigla_asistencia : 'Sin registro'
        const isBajaDia1 = formRecord && formSigla === 'B' && formRecord.motivo_baja === 'BAJA DIA 1'
        const effectiveFormSigla = isBajaDia1 ? 'Sin registro' : formSigla;
        const isFormAsistencia = effectiveFormSigla === 'A' || effectiveFormSigla === 'I-OP'
        const isRecAsistencia = recSigla === 'A'
        
        if (isFormAsistencia !== isRecAsistencia) {
           isCalibrated = false
           break
        }
     }
     
     const newState = isCalibrated ? 'CALIBRADO' : 'DESCALIBRADO'
     await client.query(`UPDATE grupos_dia1 SET estado_calibracion = $1 WHERE grupo_id = $2`, [newState, grupo_id])
     console.log("Updated to", newState)
     
  } catch(e) {
     console.error("Error:", e.message)
  }
  await client.end()
}
run()
