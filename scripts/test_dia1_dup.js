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
     let cRes = await client.query(`SELECT fecha_dia1 FROM grupos_dia1 WHERE grupo_id = '24cdb593-81ac-4f3e-94b8-d96765b5fa2b'`)
     console.log("Dia1 for top dup:", cRes.rows)
     
     // Find the one where Reclutador actually saved records
     let recRes = await client.query(`SELECT grupo_id, COUNT(*) FROM asistencias_dia1_reclutador GROUP BY grupo_id HAVING COUNT(*) > 50`)
     console.log("Groups with Reclutador records:", recRes.rows)
     
     // Check config for that group
     if (recRes.rows.length > 0) {
        let conf = await client.query(`SELECT fecha_dia1 FROM grupos_dia1 WHERE grupo_id = $1`, [recRes.rows[0].grupo_id])
        console.log("Config for the valid group:", conf.rows)
     }
     
  } catch(e) {
     console.error("Error:", e.message)
  }
  await client.end()
}
run()
