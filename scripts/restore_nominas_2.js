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
     // Use the existing 64 people
     // If they belong to ANULACIÓN, I will just set them to GPE-2026008 since that's the only one that had people
     const updateRes = await client.query(`
        UPDATE nominas n
        SET grupo_id = (SELECT id FROM grupos_capacitacion WHERE codigo = 'GPE-2026008' LIMIT 1)
        WHERE n.grupo_id IS NULL AND n.campana_id = (SELECT id FROM campanas WHERE nombre = 'ANULACIÓN' LIMIT 1)
        RETURNING n.id
     `)
     console.log("Restored GPE-2026008:", updateRes.rowCount)
     
  } catch(e) {
     console.error("Error:", e)
  }
  await client.end()
}
run()
