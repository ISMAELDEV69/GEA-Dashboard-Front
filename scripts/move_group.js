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
     let res = await client.query(`SELECT id FROM grupos_capacitacion WHERE codigo = 'GPE-2026013'`)
     const targetId = res.rows[0].id;
     
     res = await client.query(`SELECT id FROM grupos_capacitacion WHERE codigo = 'GPR-2026004'`)
     const sourceId = res.rows[0].id;
     
     console.log(`Moving from ${sourceId} to ${targetId}`)
     
     res = await client.query(`UPDATE nominas SET grupo_id = $1 WHERE grupo_id = $2`, [targetId, sourceId])
     console.log("Updated rows:", res.rowCount)
  } catch(e) {
     console.error("Error:", e.message)
  }
  await client.end()
}
run()
