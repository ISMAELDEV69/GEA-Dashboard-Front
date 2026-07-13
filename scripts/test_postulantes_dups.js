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
     let cRes = await client.query(`SELECT documento, COUNT(*) FROM postulantes WHERE grupo_codigo = 'GPE-2026013' GROUP BY documento HAVING COUNT(*) > 1 LIMIT 5`)
     console.log("Dups in postulantes:", cRes.rows)
     
     let tRes = await client.query(`SELECT COUNT(*) FROM postulantes WHERE grupo_codigo = 'GPE-2026013'`)
     console.log("Total postulantes GPE-2026013:", tRes.rows)
  } catch(e) {
     console.error("Error:", e.message)
  }
  await client.end()
}
run()
