require('dotenv').config({ path: '.env.local' });
const { Client } = require('pg');

async function migrate() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const sql = `ALTER TABLE descuentos ADD COLUMN IF NOT EXISTS supervisor_tarde VARCHAR(10) DEFAULT 'NO';`;

  try {
    await client.query(sql);
    console.log("Columna supervisor_tarde agregada correctamente.");
  } catch (err) {
    console.error("Error altering table:", err);
  } finally {
    await client.end();
  }
}

migrate();
