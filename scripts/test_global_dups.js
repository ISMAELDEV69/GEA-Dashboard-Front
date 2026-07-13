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
     let cRes = await client.query(`
        SELECT documento, COUNT(*) 
        FROM v_nominas_consolidado 
        WHERE documento IN (
            SELECT documento FROM v_nominas_consolidado WHERE grupo_codigo = 'GPE-2026013'
        )
        GROUP BY documento 
        HAVING COUNT(*) > 1 
        LIMIT 5
     `)
     console.log("Dups across ALL groups for people in GPE-2026013:", cRes.rows)
  } catch(e) {
     console.error("Error:", e.message)
  }
  await client.end()
}
run()
