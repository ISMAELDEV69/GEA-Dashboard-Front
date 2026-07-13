const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });
const client = new Client({ connectionString: process.env.DATABASE_URL });

async function run() {
  await client.connect();
  try {
    await client.query("NOTIFY pgrst, 'reload schema'");
    console.log("Schema cache reloaded!");
  } catch (err) {
    console.error("Failed:", err);
  } finally {
    await client.end();
  }
}
run();
