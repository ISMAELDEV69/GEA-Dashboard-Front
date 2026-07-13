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
     
     // 1. Force one person to be 'A' in Reclutador and 'B', 'BAJA DIA 1' in Formador
     let pRes = await client.query(`SELECT postulante_documento FROM asistencias_dia1_reclutador WHERE grupo_id = $1 LIMIT 1`, [grupo_id])
     const doc = pRes.rows[0].postulante_documento
     console.log("Testing with document:", doc)
     
     await client.query(`UPDATE asistencias_dia1_reclutador SET sigla_final = 'A' WHERE grupo_id = $1 AND postulante_documento = $2`, [grupo_id, doc])
     await client.query(`UPDATE asistencias_capacitacion SET sigla_asistencia = 'B', motivo_baja = 'BAJA DIA 1' WHERE grupo_id = $1 AND postulante_documento = $2 AND fecha_asistencia = '2026-06-16'`, [grupo_id, doc])
     
     // 2. Run the exact JS logic from checkCalibracionDia1
     const { rows: recAsis } = await client.query(`SELECT postulante_documento, sigla_final FROM asistencias_dia1_reclutador WHERE grupo_id = $1`, [grupo_id])
     const { rows: formAsis } = await client.query(`SELECT postulante_documento, sigla_asistencia, motivo_baja FROM asistencias_capacitacion WHERE grupo_id = $1 AND fecha_asistencia = '2026-06-16'`, [grupo_id])
     
     const formFiltered = formAsis.filter(f => !(f.sigla_asistencia === 'B' && f.motivo_baja === 'BAJA DIA 1'))
     const mapForm = new Map(formFiltered.map(f => [f.postulante_documento, f.sigla_asistencia]))
     const mapRec = new Map(recAsis.map(r => [r.postulante_documento, r.sigla_final]))
     
     const allDocs = new Set([...mapForm.keys(), ...mapRec.keys()])
     
     let isCalibrated = true
     let discrepancias = []
     
     for (const d of allDocs) {
        const formSigla = mapForm.get(d) || 'Sin registro'
        const recSigla = mapRec.get(d) || 'Sin registro'
        
        const isFormAsistencia = formSigla === 'A' || formSigla === 'I-OP'
        const isRecAsistencia = recSigla === 'A'
        
        if (isFormAsistencia !== isRecAsistencia) {
           isCalibrated = false
           discrepancias.push({ d, formSigla, recSigla })
        }
     }
     
     console.log("Is Calibrated:", isCalibrated)
     console.log("Discrepancias:", discrepancias)
     
  } catch(e) {
     console.error("Error:", e.message)
  }
  await client.end()
}
run()
