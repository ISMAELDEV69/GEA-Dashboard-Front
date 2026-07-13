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
     await client.query(`UPDATE grupos_dia1 SET estado_calibracion = 'DESCALIBRADO' WHERE grupo_id = $1`, [masterId])
     console.log("Updated to DESCALIBRADO")
  } catch(e) {
     console.error("Error:", e.message)
  }
  await client.end()
}
run()
