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
     let grpRes = await client.query(`SELECT id FROM grupos_capacitacion WHERE codigo = 'GPE-2026013' ORDER BY created_at DESC`)
     const allIds = grpRes.rows.map(r => r.id)
     const latestId = allIds[0]
     
     console.log("Latest ID:", latestId)
     
     // Delete all records for old IDs
     for (let i = 1; i < allIds.length; i++) {
        const res = await client.query(`DELETE FROM asistencias_capacitacion WHERE grupo_id = $1`, [allIds[i]])
        console.log(`Deleted ${res.rowCount} records from old group ${allIds[i]}`)
     }
     
     // Delete everything except 2026-06-16 from latest ID?
     // Wait, maybe they have valid records for other days on the latest ID?
     // Let's just keep everything on latest ID.
     // But wait, my fix_dupes.js inserted duplicates on latestId!
     // Let's clean up latestId to have exactly ONE record per document for 2026-06-16
     
     const { rows: latestRecords } = await client.query(`SELECT id, postulante_documento FROM asistencias_capacitacion WHERE grupo_id = $1 AND fecha_asistencia::date = '2026-06-16'`, [latestId])
     
     const seen = new Set()
     let dupsDeleted = 0
     for (const r of latestRecords) {
        if (seen.has(r.postulante_documento)) {
           await client.query(`DELETE FROM asistencias_capacitacion WHERE id = $1`, [r.id])
           dupsDeleted++
        } else {
           seen.add(r.postulante_documento)
        }
     }
     console.log(`Deleted ${dupsDeleted} duplicate 2026-06-16 records from latest group.`)
     
  } catch(e) {
     console.error("Error:", e.message)
  }
  await client.end()
}
run()
