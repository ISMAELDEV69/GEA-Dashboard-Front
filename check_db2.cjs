const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });
const client = new Client({ connectionString: process.env.DATABASE_URL });

async function run() {
  await client.connect();
  const res = await client.query(`SELECT * FROM descuentos LIMIT 1;`);
  console.log("descuentos columns from select:", Object.keys(res.rows[0] || {}));
  await client.end();
}
run();
