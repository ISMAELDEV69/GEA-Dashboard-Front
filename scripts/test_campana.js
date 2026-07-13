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
     let cRes = await client.query(`SELECT id, nombre FROM campanas WHERE nombre ILIKE '%CONTEN%'`)
     console.log("Campanas:", cRes.rows)
     
     // Let's find all GPE-2026013 groups
     let gRes = await client.query(`SELECT id, created_at, campana_id FROM grupos_capacitacion WHERE codigo = 'GPE-2026013' ORDER BY created_at ASC`)
     console.log("All GPE-2026013:", gRes.rows)
  } catch(e) {
     console.error("Error:", e.message)
  }
  await client.end()
}
run()
