import pkg from 'pg'
const { Client } = pkg
const connectionString = 'postgresql://postgres:ismael3953036POM@db.lqvvhovfvwzaprdgdobc.supabase.co:5432/postgres'

async function run() {
  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } })
  try {
    await client.connect()
    
    // Create trigger function
    await client.query(`
      CREATE OR REPLACE FUNCTION trg_sync_semana_trabajo()
      RETURNS TRIGGER AS $$
      BEGIN
        IF NEW.grupo_codigo IS NOT NULL AND (TG_OP = 'INSERT' OR OLD.grupo_codigo IS DISTINCT FROM NEW.grupo_codigo OR NEW.semana_trabajo IS NULL) THEN
          SELECT semana_trabajo INTO NEW.semana_trabajo
          FROM capacidad_rys
          WHERE codigo = NEW.grupo_codigo
          LIMIT 1;
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `)
    
    // Create trigger
    await client.query(`
      DROP TRIGGER IF EXISTS sync_semana_trabajo_trg ON nominas;
      CREATE TRIGGER sync_semana_trabajo_trg
      BEFORE INSERT OR UPDATE ON nominas
      FOR EACH ROW
      EXECUTE FUNCTION trg_sync_semana_trabajo();
    `)
    
    // Update existing rows
    await client.query(`
      UPDATE nominas n
      SET semana_trabajo = cr.semana_trabajo
      FROM capacidad_rys cr
      WHERE n.grupo_codigo = cr.codigo AND (n.semana_trabajo IS NULL OR n.semana_trabajo != cr.semana_trabajo);
    `)
    
    console.log('Trigger created and existing rows updated.')
  } catch(e) {
    console.log(e)
  } finally {
    await client.end()
  }
}
run()
