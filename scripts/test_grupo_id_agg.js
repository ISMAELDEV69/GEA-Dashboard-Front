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
     
     console.log("Grupo ID:", grupo_id)
     
     // 1. Fetch formAsis by grupo_id (ALL DATES)
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
     
     // Let's print out what we found for Miguel
     console.log("Miguel aggregated:", mapFormFull.get('47936231'))
     
  } catch(e) {
     console.error("Error:", e.message)
  }
  await client.end()
}
run()
