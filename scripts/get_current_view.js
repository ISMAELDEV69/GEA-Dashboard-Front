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
        SELECT pg_get_viewdef('v_nominas_consolidado'::regclass) 
     `)
     console.log(res.rows[0].pg_get_viewdef)
  } catch(e) {
     console.error("Error:", e.message)
  }
  await client.end()
}
run()
