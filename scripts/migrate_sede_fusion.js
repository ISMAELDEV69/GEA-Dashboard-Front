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
     console.log('1. Dropping dependent views...');
     await client.query(`DROP VIEW IF EXISTS v_nominas_consolidado CASCADE;`);

     console.log('2. Adding sede column to nominas table...');
     await client.query(`
        ALTER TABLE nominas
        ADD COLUMN IF NOT EXISTS sede VARCHAR(100) DEFAULT 'LIMA';
     `);

     console.log('3. Migrating data from sedes to nominas...');
     await client.query(`
        UPDATE nominas n
        SET sede = s.nombre
        FROM sedes s
        WHERE n.sede_id = s.id;
     `);

     console.log('4. Dropping sede_id from nominas...');
     await client.query(`
        ALTER TABLE nominas DROP COLUMN sede_id;
     `);

     console.log('5. Dropping sedes table...');
     await client.query(`
        DROP TABLE IF EXISTS sedes CASCADE;
     `);

     console.log('Migration complete.');
  } catch(e) {
     console.error("Error:", e.message)
  }
  await client.end()
}
run()
