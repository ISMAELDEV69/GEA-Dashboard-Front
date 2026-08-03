import pkg from 'pg';
const { Client } = pkg;

const OLD_DB = 'postgresql://postgres.lqvvhovfvwzaprdgdobc:3l4ahwgDfMtiBmpd@aws-1-us-east-2.pooler.supabase.com:6543/postgres';
const NEW_DB = 'postgresql://postgres:WO3OywKqpoovtN1m@db.ujqehcpglfhnytzsyedp.supabase.co:5432/postgres';

async function migrateTable(oldClient, newClient, schema, table) {
  console.log(`📥 Extrayendo registros de ${schema}.${table}...`);
  const oldRes = await oldClient.query(`SELECT * FROM ${schema}.${table}`);
  const rows = oldRes.rows;
  console.log(`Encontrados ${rows.length} registros en ${schema}.${table}.`);

  if (rows.length === 0) return;

  // Obtener solo columnas NO generadas en la nueva base de datos
  const colRes = await newClient.query(`
    SELECT column_name 
    FROM information_schema.columns 
    WHERE table_schema = $1 AND table_name = $2 AND is_generated = 'NEVER' AND (identity_generation IS NULL OR identity_generation != 'ALWAYS')
  `, [schema, table]);
  const validCols = new Set(colRes.rows.map(r => r.column_name));

  let copied = 0;
  for (const row of rows) {
    const keys = [];
    const values = [];
    for (const k of Object.keys(row)) {
      if (validCols.has(k)) {
        keys.push(`"${k}"`);
        values.push(row[k]);
      }
    }

    const placeholders = values.map((_, i) => `$${i + 1}`).join(", ");
    const sql = `INSERT INTO ${schema}.${table} (${keys.join(", ")}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`;
    try {
      await newClient.query(sql, values);
      copied++;
    } catch (err) {
      console.error(`⚠️ Error copiando en ${schema}.${table} para id ${row.id || row.email || 'desc'}:`, err.message);
    }
  }
  console.log(`✅ ${copied} de ${rows.length} registros copiados exitosamente en ${schema}.${table}.`);
}

async function migrateAuth() {
  const oldClient = new Client({ connectionString: OLD_DB, ssl: { rejectUnauthorized: false } });
  const newClient = new Client({ connectionString: NEW_DB, ssl: { rejectUnauthorized: false } });

  try {
    await oldClient.connect();
    await newClient.connect();
    console.log("✅ Conectado a ambas bases de datos.");

    await migrateTable(oldClient, newClient, 'auth', 'users');
    await migrateTable(oldClient, newClient, 'auth', 'identities');

  } catch (err) {
    console.error("❌ Error en la migración de auth:", err);
  } finally {
    await oldClient.end();
    await newClient.end();
  }
}

migrateAuth();
