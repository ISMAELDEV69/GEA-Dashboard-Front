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
    const sql = `
BEGIN;

-- 1. DROP dependent views
DROP VIEW IF EXISTS v_nominas_consolidado CASCADE;
DROP VIEW IF EXISTS v_capacidad_rys_operativo CASCADE;
DROP VIEW IF EXISTS v_capacidad_rys CASCADE;

-- 2. Add ID to grupos_capacitacion
ALTER TABLE grupos_capacitacion ADD COLUMN id UUID DEFAULT gen_random_uuid() UNIQUE;

-- 3. Add grupo_id to dependent tables
ALTER TABLE nominas ADD COLUMN grupo_id UUID;
ALTER TABLE grupo_reclutadores ADD COLUMN grupo_id UUID;
ALTER TABLE grupos_dia1 ADD COLUMN grupo_id UUID;
ALTER TABLE asistencias_dia1_reclutador ADD COLUMN grupo_id UUID;
ALTER TABLE asistencias_capacitacion ADD COLUMN grupo_id UUID;

-- 4. Populate new columns
UPDATE nominas n SET grupo_id = g.id FROM grupos_capacitacion g WHERE n.grupo_codigo = g.codigo;
UPDATE grupo_reclutadores n SET grupo_id = g.id FROM grupos_capacitacion g WHERE n.grupo_codigo = g.codigo;
UPDATE grupos_dia1 n SET grupo_id = g.id FROM grupos_capacitacion g WHERE n.grupo_codigo = g.codigo;
UPDATE asistencias_dia1_reclutador n SET grupo_id = g.id FROM grupos_capacitacion g WHERE n.grupo_codigo = g.codigo;
UPDATE asistencias_capacitacion n SET grupo_id = g.id FROM grupos_capacitacion g WHERE n.grupo_codigo = g.codigo;

-- 5. Drop old FKs
ALTER TABLE nominas DROP CONSTRAINT IF EXISTS nominas_grupo_codigo_fkey;
ALTER TABLE grupo_reclutadores DROP CONSTRAINT IF EXISTS grupo_reclutadores_grupo_codigo_fkey;
ALTER TABLE grupos_dia1 DROP CONSTRAINT IF EXISTS grupos_dia1_grupo_codigo_fkey;
ALTER TABLE asistencias_dia1_reclutador DROP CONSTRAINT IF EXISTS asistencias_dia1_reclutador_grupo_codigo_fkey;
ALTER TABLE asistencias_capacitacion DROP CONSTRAINT IF EXISTS asistencias_capacitacion_grupo_codigo_fkey;

-- 6. Drop old PK constraint
ALTER TABLE grupos_capacitacion DROP CONSTRAINT IF EXISTS grupos_capacitacion_pkey CASCADE;

-- 7. Set new PK
ALTER TABLE grupos_capacitacion ADD PRIMARY KEY (id);

-- 8. Add new FKs
ALTER TABLE nominas ADD CONSTRAINT nominas_grupo_id_fkey FOREIGN KEY (grupo_id) REFERENCES grupos_capacitacion(id) ON DELETE CASCADE;
ALTER TABLE grupo_reclutadores ADD CONSTRAINT grupo_reclutadores_grupo_id_fkey FOREIGN KEY (grupo_id) REFERENCES grupos_capacitacion(id) ON DELETE CASCADE;
ALTER TABLE grupos_dia1 ADD CONSTRAINT grupos_dia1_grupo_id_fkey FOREIGN KEY (grupo_id) REFERENCES grupos_capacitacion(id) ON DELETE CASCADE;
ALTER TABLE asistencias_dia1_reclutador ADD CONSTRAINT asistencias_dia1_reclutador_grupo_id_fkey FOREIGN KEY (grupo_id) REFERENCES grupos_capacitacion(id) ON DELETE CASCADE;
ALTER TABLE asistencias_capacitacion ADD CONSTRAINT asistencias_capacitacion_grupo_id_fkey FOREIGN KEY (grupo_id) REFERENCES grupos_capacitacion(id) ON DELETE CASCADE;

-- 9. Drop old columns
ALTER TABLE nominas DROP COLUMN grupo_codigo;
ALTER TABLE grupo_reclutadores DROP COLUMN grupo_codigo;
ALTER TABLE grupos_dia1 DROP COLUMN grupo_codigo;
ALTER TABLE asistencias_dia1_reclutador DROP COLUMN grupo_codigo;
ALTER TABLE asistencias_capacitacion DROP COLUMN grupo_codigo;

COMMIT;
`
    console.log("Running migration...")
    await client.query(sql)
    console.log("Migration complete!")
  } catch(e) {
     console.error("Error:", e)
     await client.query("ROLLBACK;")
  }
  await client.end()
}
run()
