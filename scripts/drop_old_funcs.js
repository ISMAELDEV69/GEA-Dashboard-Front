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
       `DROP FUNCTION IF EXISTS public.sugerir_grupo_capacitacion(bigint, integer, character varying, character varying);`,
       `DROP FUNCTION IF EXISTS public.resolver_grupo_capacidad(bigint, integer, character varying, character varying);`,
       `NOTIFY pgrst, 'reload schema';`
     ];
     
     for (const q of queries) {
         console.log("Running:", q);
         await client.query(q);
     }
     console.log('Old functions dropped and cache reloaded.');
  } catch(e) {
     console.error("Error:", e.message)
  }
  await client.end()
}
run()
