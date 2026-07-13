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
     const masterId = '296962e8-3a2b-4c84-96f8-06bf2efee3c1'
     let cRes = await client.query(`SELECT documento, COUNT(*) FROM postulantes_grupos WHERE grupo_id = $1 GROUP BY documento HAVING COUNT(*) > 1 LIMIT 5`, [masterId])
     console.log("Dups in postulantes_grupos for master:", cRes.rows)
     
     let tRes = await client.query(`SELECT COUNT(*) FROM postulantes_grupos WHERE grupo_id = $1`, [masterId])
     console.log("Total in master:", tRes.rows)
     
     // What about other groups?
     const otherIds = [
       'd13d62ab-c0e2-4875-b1f7-77d04f998ff2',
       'ea69657d-45da-4c9d-bf5f-72a00e700523',
       '167d408e-1b9e-4a2b-a035-026a9b64d793',
       '24cdb593-81ac-4f3e-94b8-d96765b5fa2b',
       'd0c65572-ad14-426c-96ba-c025b985a1f5',
       '4ca8a83d-b48f-414a-8043-01e6002f2b1e'
     ]
     let oRes = await client.query(`SELECT COUNT(*) FROM postulantes_grupos WHERE grupo_id = ANY($1)`, [otherIds])
     console.log("Total in otherIds:", oRes.rows)
     
     let allRes = await client.query(`
        SELECT pg.documento, COUNT(*) 
        FROM postulantes_grupos pg
        JOIN grupos_capacitacion gc ON pg.grupo_id = gc.id
        WHERE gc.codigo = 'GPE-2026013'
        GROUP BY pg.documento
        HAVING COUNT(*) > 1
        LIMIT 5
     `)
     console.log("Dups across ALL GPE-2026013:", allRes.rows)
  } catch(e) {
     console.error("Error:", e.message)
  }
  await client.end()
}
run()
