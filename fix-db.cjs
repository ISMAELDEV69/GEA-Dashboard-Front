const { Client } = require('pg');

const DATABASE_URL = "postgresql://postgres:ismael3953036POM@db.lqvvhovfvwzaprdgdobc.supabase.co:5432/postgres";

async function run() {
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log("Connected to PostgreSQL");
    
    // Check if app_role exists
    const res = await client.query(`
      SELECT enumlabel 
      FROM pg_enum 
      JOIN pg_type ON pg_enum.enumtypid = pg_type.oid 
      WHERE pg_type.typname = 'app_role';
    `);
    console.log("Current app_role values:", res.rows.map(r => r.enumlabel));

    // Add new values
    const newRoles = ['supervisor_capacitacion', 'coordinador_rys', 'jefe_rys', 'jefe_capacitacion'];
    
    for (const role of newRoles) {
      try {
        console.log(`Adding ${role}...`);
        await client.query(`ALTER TYPE app_role ADD VALUE IF NOT EXISTS '${role}'`);
        console.log(`Added ${role}`);
      } catch (e) {
        console.error(`Failed to add ${role}:`, e.message);
      }
    }
    
    // Check again
    const res2 = await client.query(`
      SELECT enumlabel 
      FROM pg_enum 
      JOIN pg_type ON pg_enum.enumtypid = pg_type.oid 
      WHERE pg_type.typname = 'app_role';
    `);
    console.log("Updated app_role values:", res2.rows.map(r => r.enumlabel));
    
    // Clear PostgREST Cache
    console.log("Notifying PostgREST to reload schema...");
    await client.query(`NOTIFY pgrst, 'reload schema'`);
    console.log("Cache cleared!");

  } catch (err) {
    console.error("Fatal Error:", err);
  } finally {
    await client.end();
  }
}

run();
