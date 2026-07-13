const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });
const client = new Client({ connectionString: process.env.DATABASE_URL });

async function run() {
  await client.connect();
  const res = await client.query(`
    SELECT * FROM pg_policies WHERE tablename = 'descuentos';
  `);
  console.log("Policies:", res.rows);
  const trig = await client.query(`
    SELECT trigger_name 
    FROM information_schema.triggers 
    WHERE event_object_table = 'descuentos';
  `);
  console.log("Triggers:", trig.rows);
  await client.end();
}
run();
