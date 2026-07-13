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
     let cRes = await client.query(`SELECT * FROM consolidado_asistencias LIMIT 1`)
     console.log("Keys:", Object.keys(cRes.rows[0]))
  } catch(e) {
     console.error("Error:", e.message)
  }
  await client.end()
}
run()
