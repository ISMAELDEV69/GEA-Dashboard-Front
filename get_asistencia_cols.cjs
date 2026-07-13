const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });
const client = new Client({ connectionString: process.env.DATABASE_URL });

async function run() {
  await client.connect();
  const res = await client.query(`
    SELECT column_name 
    FROM information_schema.columns 
    WHERE table_name = 'consolidado_asistencias'
    ORDER BY ordinal_position;
  `);
  console.log(res.rows.map(r => r.column_name).join(', '));
  await client.end();
}
run();
