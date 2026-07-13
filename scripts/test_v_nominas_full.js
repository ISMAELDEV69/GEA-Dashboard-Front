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
        SELECT count(*) FROM v_nominas_consolidado WHERE grupo_codigo = 'GPE-2026013'
     `)
     console.log("Total in GPE-2026013:", cRes.rows)
     
     let tRes = await client.query(`
        SELECT documento, COUNT(*) as ct FROM v_nominas_consolidado WHERE grupo_codigo = 'GPE-2026013' GROUP BY documento ORDER BY ct DESC LIMIT 5
     `)
     console.log("Dups in GPE-2026013:", tRes.rows)
     
     // What about people with same name, different document?
     let nameRes = await client.query(`
        SELECT apellido_paterno, apellido_materno, nombres, COUNT(*) as ct 
        FROM v_nominas_consolidado 
        WHERE grupo_codigo = 'GPE-2026013' 
        GROUP BY apellido_paterno, apellido_materno, nombres 
        ORDER BY ct DESC LIMIT 5
     `)
     console.log("Dups by name:", nameRes.rows)
     
  } catch(e) {
     console.error("Error:", e.message)
  }
  await client.end()
}
run()
