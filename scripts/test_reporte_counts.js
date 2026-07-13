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
     
     const { rows: recAsis } = await client.query(`SELECT postulante_documento, sigla_final FROM asistencias_dia1_reclutador WHERE grupo_id = $1`, [grupo_id])
     const { rows: formAsis } = await client.query(`SELECT postulante_documento, sigla_asistencia, motivo_baja, fecha_asistencia FROM asistencias_capacitacion WHERE grupo_id = $1`, [grupo_id])
     
     const mapFormFull = new Map()
     for (const f of formAsis) {
       const doc = f.postulante_documento
       if (!mapFormFull.has(doc)) {
         mapFormFull.set(doc, f)
       } else {
         const existing = mapFormFull.get(doc)
         if (f.motivo_baja === 'BAJA DIA 1') {
           mapFormFull.set(doc, f)
         } else if (existing.motivo_baja !== 'BAJA DIA 1' && new Date(f.fecha_asistencia).toISOString().split('T')[0] === '2026-06-16') {
           mapFormFull.set(doc, f)
         }
       }
     }

     const mapRec = new Map(recAsis.map(r => [r.postulante_documento, r.sigla_final]))
     const allDocs = new Set([...mapFormFull.keys(), ...mapRec.keys()])
     
     let countRec = 0
     let countForm = 0
     
     for (const doc of allDocs) {
       const formRecord = mapFormFull.get(doc)
       const recSigla = mapRec.get(doc) || 'Sin registro'
       const formSigla = formRecord ? formRecord.sigla_asistencia : 'Sin registro'
       const isBajaDia1 = formRecord && formSigla === 'B' && formRecord.motivo_baja === 'BAJA DIA 1'
       const effectiveFormSigla = isBajaDia1 ? 'Sin registro' : formSigla;
       
       if (effectiveFormSigla === 'A' || effectiveFormSigla === 'I-OP') countForm++
       if (recSigla === 'A') countRec++
     }
     
     console.log("Count Reclutador:", countRec)
     console.log("Count Formador:", countForm)
     
  } catch(e) {
     console.error("Error:", e.message)
  }
  await client.end()
}
run()
