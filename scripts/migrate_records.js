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
     const res1 = await client.query(`
        SELECT id FROM campanas WHERE upper(nombre) = 'CONTENCIÓN' LIMIT 1
     `)
     const campId = res1.rows[0].id;
     
     const res2 = await client.query(`
        SELECT id FROM grupos_capacitacion 
        WHERE codigo = 'GPE-2026013' AND campana_id = $1 LIMIT 1
     `, [campId])
     
     const targetGroupId = res2.rows[0].id;
     
     // Update the 10 most recent nominas created at 15:06 (which is 10:06 local time) 
     // that were assigned to GPE-2026009
     const res3 = await client.query(`
        UPDATE nominas
        SET grupo_id = $1
        WHERE created_at >= '2026-06-26 15:00:00+00' 
        AND grupo_id IN (SELECT id FROM grupos_capacitacion WHERE codigo = 'GPE-2026009')
        RETURNING postulante_documento
     `, [targetGroupId])
     
     console.log("Migrated records:", res3.rows.length)
  } catch(e) {
     console.error("Error:", e.message)
  }
  await client.end()
}
run()
