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
     const queries = [
       `ALTER TABLE asistencias_capacitacion DROP COLUMN IF EXISTS grupo_id CASCADE;`,
       `ALTER TABLE asistencias_capacitacion ADD COLUMN IF NOT EXISTS grupo_codigo VARCHAR(100);`,
       
       `ALTER TABLE grupos_dia1 DROP COLUMN IF EXISTS grupo_id CASCADE;`,
       `ALTER TABLE grupos_dia1 ADD COLUMN IF NOT EXISTS grupo_codigo VARCHAR(100);`,
       
       `ALTER TABLE asistencias_dia1_reclutador DROP COLUMN IF EXISTS grupo_id CASCADE;`,
       `ALTER TABLE asistencias_dia1_reclutador ADD COLUMN IF NOT EXISTS grupo_codigo VARCHAR(100);`
     ];
     
     for (const q of queries) {
         console.log("Running:", q);
         await client.query(q);
     }
     console.log('Migration complete.');
  } catch(e) {
     console.error("Error:", e.message)
  }
  await client.end()
}
run()
