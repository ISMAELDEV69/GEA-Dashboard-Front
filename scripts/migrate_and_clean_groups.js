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
     let grpRes = await client.query(`SELECT id, codigo, created_at FROM grupos_capacitacion WHERE codigo = 'GPE-2026013' ORDER BY created_at DESC`)
     const allGroups = grpRes.rows
     const latestId = allGroups[0].id
     
     console.log("Keeping Latest ID:", latestId)
     
     for (let i = 1; i < allGroups.length; i++) {
        const oldId = allGroups[i].id
        console.log(`Processing old group: ${oldId}`)
        
        // Find any asistencias in this old group
        const { rows: asis } = await client.query(`SELECT * FROM asistencias_capacitacion WHERE grupo_id = $1`, [oldId])
        
        for (const a of asis) {
           // Does it already exist in the latest group for this date?
           const { rows: existing } = await client.query(`SELECT id FROM asistencias_capacitacion WHERE grupo_id = $1 AND postulante_documento = $2 AND fecha_asistencia = $3`, [latestId, a.postulante_documento, a.fecha_asistencia])
           
           if (existing.length === 0) {
              console.log(`Migrating ${a.postulante_documento} for ${a.fecha_asistencia} to latest group`)
              await client.query(`UPDATE asistencias_capacitacion SET grupo_id = $1 WHERE id = $2`, [latestId, a.id])
           } else {
              // Delete the duplicate
              await client.query(`DELETE FROM asistencias_capacitacion WHERE id = $1`, [a.id])
           }
        }
        
        // Now delete the old group itself!
        await client.query(`DELETE FROM asistencias_dia1_reclutador WHERE grupo_id = $1`, [oldId])
        await client.query(`DELETE FROM grupos_dia1 WHERE grupo_id = $1`, [oldId])
        await client.query(`DELETE FROM asistencias_capacitacion WHERE grupo_id = $1`, [oldId])
        
        const res = await client.query(`DELETE FROM grupos_capacitacion WHERE id = $1`, [oldId])
        console.log(`Deleted old group ${oldId} - Rows affected: ${res.rowCount}`)
     }
     
  } catch(e) {
     console.error("Error:", e.message)
  }
  await client.end()
}
run()
