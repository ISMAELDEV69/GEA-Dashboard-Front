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
     
     // Let's create a fake BAJA DIA 1 on 26/06 for Maru
     await client.query(`INSERT INTO asistencias_capacitacion (grupo_id, postulante_documento, fecha_asistencia, sigla_asistencia, motivo_baja) VALUES ($1, '76854207', '2026-06-26', 'B', 'BAJA DIA 1') ON CONFLICT DO NOTHING`, [grupo_id])
     
     // Query all records
     let fRes = await client.query(`SELECT postulante_documento, sigla_asistencia, motivo_baja, fecha_asistencia FROM asistencias_capacitacion WHERE grupo_id = $1`, [grupo_id])
     
     const formAsis = fRes.rows;
     const fecha_dia1 = new Date('2026-06-16T00:00:00Z') // simplified
     
     // How to aggregate?
     const mapFormFull = new Map()
     for (const f of formAsis) {
        if (!mapFormFull.has(f.postulante_documento)) {
           mapFormFull.set(f.postulante_documento, f)
        } else {
           const existing = mapFormFull.get(f.postulante_documento)
           // If the current one is BAJA DIA 1, it overrides!
           if (f.motivo_baja === 'BAJA DIA 1') {
              mapFormFull.set(f.postulante_documento, f)
           } else if (existing.motivo_baja !== 'BAJA DIA 1') {
              // otherwise, prefer the one on fecha_dia1
              // ignoring timezones for this test logic
              const d1 = new Date(existing.fecha_asistencia).toISOString().split('T')[0]
              const d2 = new Date(f.fecha_asistencia).toISOString().split('T')[0]
              if (d2 === '2026-06-16') {
                 mapFormFull.set(f.postulante_documento, f)
              }
           }
        }
     }
     
     console.log("Maru aggregated state:", mapFormFull.get('76854207'))
     
  } catch(e) {
     console.error("Error:", e.message)
  }
  await client.end()
}
run()
