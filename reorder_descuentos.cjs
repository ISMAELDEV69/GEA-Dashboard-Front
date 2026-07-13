const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });
const client = new Client({ connectionString: process.env.DATABASE_URL });

async function run() {
  await client.connect();
  try {
    await client.query('BEGIN');
    
    // 1. Rename old table
    await client.query('ALTER TABLE descuentos RENAME TO descuentos_old;');
    
    // 2. Create new table with desired order
    await client.query(`
      CREATE TABLE descuentos (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        sede VARCHAR(100),
        segmento VARCHAR(100),
        grupo_cap VARCHAR(100),
        campana VARCHAR(100),
        supervisor VARCHAR(255),
        formador VARCHAR(255),
        dni_ce VARCHAR(20) NOT NULL,
        postulante VARCHAR(255),
        fecha_baja DATE,
        motivo VARCHAR(255),
        comentarios TEXT,
        autoriza_cap VARCHAR(50),
        autoriza_rys VARCHAR(20) DEFAULT '',
        comentario_rys TEXT,
        estado VARCHAR(50),
        bono VARCHAR(100),
        usuario_registro VARCHAR(100),
        fecha_registro TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
        usuario_autoriza VARCHAR(255),
        fecha_autorizacion TIMESTAMP WITH TIME ZONE,
        fuera_de_plazo VARCHAR(10) DEFAULT 'NO',
        columna_s VARCHAR(10),
        procede VARCHAR(50)
      );
    `);
    
    // 3. Enable RLS and recreate policies
    await client.query(`
      ALTER TABLE descuentos ENABLE ROW LEVEL SECURITY;
      CREATE POLICY "Descuentos Select" ON descuentos FOR SELECT USING (true);
      CREATE POLICY "Descuentos Insert" ON descuentos FOR INSERT WITH CHECK (true);
      CREATE POLICY "Descuentos Update" ON descuentos FOR UPDATE USING (true);
      CREATE POLICY "Descuentos Delete" ON descuentos FOR DELETE USING (true);
    `);
    
    // 4. Copy data
    await client.query(`
      INSERT INTO descuentos (
        id, sede, segmento, grupo_cap, campana, supervisor, formador, dni_ce, postulante, fecha_baja, motivo, comentarios,
        autoriza_cap, autoriza_rys, comentario_rys, estado, bono, usuario_registro, fecha_registro, usuario_autoriza, fecha_autorizacion,
        fuera_de_plazo, columna_s, procede
      )
      SELECT 
        id, sede, segmento, grupo_cap, campana, supervisor, formador, dni_ce, postulante, fecha_baja, motivo, comentarios,
        autoriza_cap, autoriza_rys, comentario_rys, estado, bono, usuario_registro, fecha_registro, usuario_autoriza, fecha_autorizacion,
        fuera_de_plazo, columna_s, procede
      FROM descuentos_old;
    `);
    
    // 5. Drop old table (Wait, just rename it to _backup for safety)
    // Actually we can keep it as _backup in case.
    await client.query('ALTER TABLE descuentos_old RENAME TO descuentos_backup_2026;');
    
    await client.query('COMMIT');
    console.log("Migration successful!");
  } catch (err) {
    await client.query('ROLLBACK');
    console.error("Migration failed:", err);
  } finally {
    await client.end();
  }
}
run();
