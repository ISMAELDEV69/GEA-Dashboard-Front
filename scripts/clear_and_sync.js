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
    // Check if there are dependent rows in nominas or something
    const checkNomina = await client.query("SELECT count(*) FROM nominas WHERE grupo_codigo IS NOT NULL;")
    console.log("Nominas with grupo_codigo:", checkNomina.rows[0].count)
    
    // Instead of truncate which might fail on FKs, let's just delete the ones that are not in the new CSV.
    // Or just run the sync again, collect all codes, and delete the rest.
  } catch(e) {
     console.error("Error:", e)
  }
  await client.end()
}
run()
