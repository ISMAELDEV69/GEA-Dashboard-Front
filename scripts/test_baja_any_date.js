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
     let grpRes = await client.query(`SELECT id FROM grupos_capacitacion WHERE codigo = 'GPE-2026013' ORDER BY created_at DESC LIMIT 1`)
     const grupo_id = grpRes.rows[0].id
     
     let fRes = await client.query(`SELECT postulante_documento, sigla_asistencia, motivo_baja FROM asistencias_capacitacion WHERE grupo_id = $1`, [grupo_id])
     let hasBaja = fRes.rows.filter(f => f.motivo_baja === 'BAJA DIA 1')
     console.log("People with BAJA DIA 1 on ANY date:", hasBaja)
     
  } catch(e) {
     console.error("Error:", e.message)
  }
  await client.end()
}
run()
