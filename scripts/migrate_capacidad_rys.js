import fs from 'fs'
import pkg from 'pg';
const { Client } = pkg;

const envStr = fs.readFileSync('.env.local', 'utf8')
let dbUrl;
for (const line of envStr.split('\n')) {
  if (line.startsWith('DATABASE_URL=')) dbUrl = line.split('=')[1].trim();
}

const client = new Client({ connectionString: dbUrl })

async function run() {
  await client.connect()
  try {
     console.log('1. Dropping dependent views...');
     await client.query(`DROP VIEW IF EXISTS v_nominas_consolidado CASCADE;`);
     await client.query(`DROP VIEW IF EXISTS v_capacidad_rys CASCADE;`);
     await client.query(`DROP VIEW IF EXISTS v_capacidad_rys_operativo CASCADE;`);

     console.log('2. Creating capacidad_rys table...');
     await client.query(`
        CREATE TABLE capacidad_rys (
          codigo VARCHAR(100) PRIMARY KEY,
          campana VARCHAR(100),
          segmento VARCHAR(100),
          area_traslado VARCHAR(100),
          semana_label VARCHAR(50),
          modalidad text,
          condicion_laboral VARCHAR(100),
          estado VARCHAR(50),
          fecha_inicio DATE,
          periodo VARCHAR(100),
          rango_horario VARCHAR(100),
          extension_teoria VARCHAR(100),
          fecha_inicio_ojt DATE,
          extension_ojt VARCHAR(100),
          fecha_ingreso_op DATE,
          rq_solicitado NUMERIC,
          rq_ftes_solicitado NUMERIC,
          meta_dia_0 INTEGER,
          meta_dia_1 INTEGER,
          periodo_ingreso_op VARCHAR(100),
          periodo_rys VARCHAR(100),
          semana_trabajo INTEGER,
          formador_documento VARCHAR(30),
          created_at TIMESTAMPTZ DEFAULT NOW()
        );
     `);

     console.log('3. Migrating data into capacidad_rys...');
     await client.query(`
        INSERT INTO capacidad_rys (
          codigo, campana, segmento, area_traslado, semana_label, modalidad, condicion_laboral, estado,
          fecha_inicio, periodo, rango_horario, extension_teoria, fecha_inicio_ojt, extension_ojt,
          fecha_ingreso_op, rq_solicitado, rq_ftes_solicitado, meta_dia_0, meta_dia_1,
          periodo_ingreso_op, periodo_rys, semana_trabajo, formador_documento, created_at
        )
        SELECT 
          g.codigo, c.nombre, c.segmento, g.area_traslado, g.semana_label, g.modalidad::text, g.condicion, g.estado_grupo,
          g.fecha_registro, g.periodo_capacitacion, g.rango_horario, g.extension_teoria, g.fecha_inicio_ojt, g.extension_ojt,
          g.fecha_ingreso_op, g.rq_solicitado, g.rq_ftes_solicitado, g.meta_dia_0, g.meta_dia_1,
          g.periodo_ingreso_op, g.periodo_rys, g.semana_trabajo, g.formador_documento, g.created_at
        FROM grupos_capacitacion g
        JOIN campanas c ON g.campana_id = c.id
        ON CONFLICT (codigo) DO NOTHING;
     `);

     console.log('4. Adding text columns to nominas...');
     await client.query(`
        ALTER TABLE nominas
        ADD COLUMN IF NOT EXISTS campana VARCHAR(100),
        ADD COLUMN IF NOT EXISTS segmento VARCHAR(100),
        ADD COLUMN IF NOT EXISTS grupo_codigo VARCHAR(100);
     `);

     console.log('5. Migrating data into nominas...');
     await client.query(`
        UPDATE nominas n
        SET 
          campana = c.nombre,
          segmento = c.segmento,
          grupo_codigo = g.codigo
        FROM campanas c
        LEFT JOIN grupos_capacitacion g ON n.grupo_id = g.id
        WHERE n.campana_id = c.id;
     `);

     console.log('6. Adding text column to grupo_reclutadores...');
     await client.query(`
        ALTER TABLE grupo_reclutadores
        ADD COLUMN IF NOT EXISTS grupo_codigo VARCHAR(100);
     `);
     await client.query(`
        UPDATE grupo_reclutadores gr
        SET grupo_codigo = g.codigo
        FROM grupos_capacitacion g
        WHERE gr.grupo_id = g.id;
     `);

     console.log('7. Dropping foreign keys and old tables...');
     await client.query(`ALTER TABLE nominas DROP COLUMN campana_id;`);
     await client.query(`ALTER TABLE nominas DROP COLUMN grupo_id;`);
     await client.query(`ALTER TABLE grupo_reclutadores DROP COLUMN grupo_id;`);
     await client.query(`DROP TABLE IF EXISTS campana_reclutadores CASCADE;`);
     await client.query(`DROP TABLE IF EXISTS grupos_capacitacion CASCADE;`);
     await client.query(`DROP TABLE IF EXISTS campanas CASCADE;`);

     console.log('Migration complete.');
  } catch(e) {
     console.error("Error:", e.message)
  }
  await client.end()
}
run()
