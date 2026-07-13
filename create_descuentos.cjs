require('dotenv').config({ path: '.env.local' });
const { Client } = require('pg');

async function migrate() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const sql = `
    CREATE TABLE IF NOT EXISTS descuentos (
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
      
      fuera_de_plazo VARCHAR(10) DEFAULT 'NO',
      autoriza_rys VARCHAR(20) DEFAULT 'PENDIENTE',
      comentario_rys TEXT,
      columna_s VARCHAR(10),
      
      usuario_registro VARCHAR(100),
      fecha_registro TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
    );

    -- RLS Policies
    ALTER TABLE descuentos ENABLE ROW LEVEL SECURITY;
    
    -- Admin has full access
    DROP POLICY IF EXISTS "Descuentos Select" ON descuentos;
    CREATE POLICY "Descuentos Select" ON descuentos FOR SELECT USING (true);
    
    DROP POLICY IF EXISTS "Descuentos Insert" ON descuentos;
    CREATE POLICY "Descuentos Insert" ON descuentos FOR INSERT WITH CHECK (true);
    
    DROP POLICY IF EXISTS "Descuentos Update" ON descuentos;
    CREATE POLICY "Descuentos Update" ON descuentos FOR UPDATE USING (true);
    
    DROP POLICY IF EXISTS "Descuentos Delete" ON descuentos;
    CREATE POLICY "Descuentos Delete" ON descuentos FOR DELETE USING (true);
  `;

  try {
    await client.query(sql);
    console.log("Tabla descuentos creada correctamente.");
  } catch (err) {
    console.error("Error creating table:", err);
  } finally {
    await client.end();
  }
}

migrate();
