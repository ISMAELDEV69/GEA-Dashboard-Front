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
     let res = await client.query(`
        DELETE FROM grupos_dia1 
        WHERE ctid IN (
            SELECT ctid
            FROM (
                SELECT ctid,
                ROW_NUMBER() OVER( PARTITION BY grupo_id ORDER BY created_at DESC ) as row_num
                FROM grupos_dia1
            ) t
            WHERE t.row_num > 1
        )
     `)
     console.log("Deleted duplicates:", res.rowCount)
  } catch(e) {
     console.error("Error:", e.message)
  }
  await client.end()
}
run()
