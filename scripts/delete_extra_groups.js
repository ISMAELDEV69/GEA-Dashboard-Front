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
     const res = await client.query(`
        DELETE FROM grupos_capacitacion WHERE id NOT IN (
            SELECT DISTINCT grupo_id FROM nominas
        )
     `)
     console.log("Deleted groups:", res.rowCount)
  } catch(e) {
     console.error("Error:", e)
  }
  await client.end()
}
run()
