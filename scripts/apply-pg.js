import fs from 'fs'
import pkg from 'pg';
const { Client } = pkg;

const envStr = fs.readFileSync('.env.local', 'utf8')
let dbUrl;
for (const line of envStr.split('\n')) {
  if (line.startsWith('DATABASE_URL=')) dbUrl = line.split('=')[1].trim();
}

const client = new Client({ connectionString: dbUrl })
const sql = fs.readFileSync('database/dia1_schema.sql', 'utf8')

async function run() {
  await client.connect()
  try {
     await client.query(sql)
     console.log("SQL aplicado correctamente con pg!")
  } catch(e) {
     console.error("Error SQL:", e)
  }
  await client.end()
}
run()
