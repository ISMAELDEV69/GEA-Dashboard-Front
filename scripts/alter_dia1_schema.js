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
     await client.query(`
        ALTER TABLE asistencias_dia1_reclutador 
        RENAME COLUMN sigla_asistencia TO sigla_inicial;
     `)
     console.log("Renamed sigla_asistencia to sigla_inicial.")
  } catch(e) {
     console.error("Error renaming:", e.message)
  }
  
  try {
     await client.query(`
        ALTER TABLE asistencias_dia1_reclutador 
        ADD COLUMN sigla_final VARCHAR(255);
     `)
     console.log("Added sigla_final.")
  } catch(e) {
     console.error("Error adding column:", e.message)
  }
  
  await client.end()
}
run()
