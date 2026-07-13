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
     let cRes = await client.query(`SELECT COUNT(*) FROM consolidado_asistencias WHERE codigo_grupo = 'GPE-2026013'`)
     console.log("Count in consolidado:", cRes.rows)
     
     let dRes = await client.query(`SELECT codigo_grupo, COUNT(*) FROM consolidado_asistencias GROUP BY codigo_grupo`)
     console.log("All codigos:", dRes.rows)
  } catch(e) {
     console.error("Error:", e.message)
  }
  await client.end()
}
run()
