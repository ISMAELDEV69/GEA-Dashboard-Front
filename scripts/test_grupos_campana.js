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
     let cRes = await client.query(`SELECT id, codigo, campana_id, created_at FROM grupos_capacitacion WHERE codigo = 'GPE-2026013' ORDER BY created_at DESC LIMIT 5`)
     console.log("Grupos:", cRes.rows)
     
     if (cRes.rows.length > 0) {
        let camp = await client.query(`SELECT id, nombre FROM campanas WHERE id = $1`, [cRes.rows[0].campana_id])
        console.log("Campana:", camp.rows)
     }
  } catch(e) {
     console.error("Error:", e.message)
  }
  await client.end()
}
run()
