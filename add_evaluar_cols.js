import pkg from 'pg'
const { Client } = pkg
const connectionString = 'postgresql://postgres:ismael3953036POM@db.lqvvhovfvwzaprdgdobc.supabase.co:5432/postgres'

async function run() {
  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } })
  try {
    await client.connect()
    console.log("Adding evaluar columns...")
    
    // Add columns
    await client.query(`
      ALTER TABLE nominas ADD COLUMN IF NOT EXISTS evaluar text;
      ALTER TABLE nominas ADD COLUMN IF NOT EXISTS obs_evaluar text;
    `)
    
    // Check v_nominas_consolidado to recreate it with the new columns
    // We can just get the definition and replace it
    const defRes = await client.query(`
      SELECT pg_get_viewdef('v_nominas_consolidado', true) as def;
    `)
    let viewDef = defRes.rows[0].def;
    
    if (!viewDef.includes('n.evaluar')) {
      console.log("Recreating v_nominas_consolidado to include new columns...");
      
      // Need to find the end of the SELECT list before FROM
      // A quick hack is to replace "n.observacion_final," with "n.observacion_final, n.evaluar, n.obs_evaluar,"
      if (viewDef.includes('n.observacion_final,')) {
         viewDef = viewDef.replace('n.observacion_final,', 'n.observacion_final, n.evaluar, n.obs_evaluar,');
      } else {
         viewDef = viewDef.replace('n.observacion_final\n', 'n.observacion_final, n.evaluar, n.obs_evaluar\n');
      }
      
      await client.query(`
        DROP VIEW v_nominas_consolidado;
        CREATE OR REPLACE VIEW v_nominas_consolidado AS
        ${viewDef}
      `)
    }
    
    await client.query(`NOTIFY pgrst, 'reload schema'`)
    console.log("Done")
  } catch (err) {
    console.error(err)
  } finally {
    await client.end()
  }
}
run()
