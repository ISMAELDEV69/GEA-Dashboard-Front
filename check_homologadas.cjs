require('dotenv').config({ path: '.env.local' });
const { Client } = require('pg');
async function test() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const res = await client.query('SELECT * FROM opciones_homologadas LIMIT 2;');
  console.log(res.rows);
  await client.end();
}
test();
