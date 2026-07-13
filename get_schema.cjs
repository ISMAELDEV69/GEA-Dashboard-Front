const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });
const client = new Client({ connectionString: process.env.DATABASE_URL });

async function run() {
  await client.connect();
  const res = await client.query(`
    SELECT column_name, data_type, character_maximum_length, column_default, is_nullable
    FROM information_schema.columns 
    WHERE table_name = 'descuentos';
  `);
  console.table(res.rows);
  await client.end();
}
run();
