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
     console.log('5. Migrating data into nominas...');
     await client.query(`
        UPDATE nominas n
        SET campana = c.nombre, segmento = c.segmento
        FROM campanas c
        WHERE n.campana_id = c.id;
     `);
     await client.query(`
        UPDATE nominas n
        SET grupo_codigo = g.codigo
        FROM grupos_capacitacion g
        WHERE n.grupo_id = g.id;
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
