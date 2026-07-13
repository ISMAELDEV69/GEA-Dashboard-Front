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
     await client.query(`ALTER TABLE nominas ADD COLUMN IF NOT EXISTS dia_0_status varchar(50) DEFAULT NULL`)
     console.log("Added dia_0_status column")
     
     // Populate it for existing rows based on dia_0_obs
     // If dia_0_obs contains ASISTIO or similar, or dia_0 has a date, mark as ASISTIO
     // Check what dia_0_obs values look like
     const res = await client.query(`SELECT DISTINCT dia_0_obs FROM nominas WHERE dia_0_obs IS NOT NULL LIMIT 20`)
     console.log("Unique dia_0_obs:", res.rows)
  } catch(e) {
     console.error("Error:", e)
  }
  await client.end()
}
run()
