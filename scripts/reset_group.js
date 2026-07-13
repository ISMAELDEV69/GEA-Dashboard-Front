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
     const codigo = 'GPE-2026013'
     
     await client.query(`DELETE FROM consolidado_asistencias WHERE codigo_grupo = $1`, [codigo])
     await client.query(`DELETE FROM asistencias_dia1_reclutador WHERE grupo_id = $1`, [masterId])
     await client.query(`DELETE FROM asistencias_capacitacion WHERE grupo_id = $1`, [masterId])
     await client.query(`DELETE FROM grupos_dia1 WHERE grupo_id = $1`, [masterId])
     
     console.log("Reset completado.")
  } catch(e) {
     console.error("Error:", e.message)
  }
  await client.end()
}
run()
