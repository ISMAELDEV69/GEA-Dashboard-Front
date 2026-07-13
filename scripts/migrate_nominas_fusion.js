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
     await client.query(`DROP VIEW IF EXISTS v_capacidad_rys_operativo CASCADE;`);

     console.log('2. Adding personal columns to nominas table...');
     await client.query(`
        ALTER TABLE nominas
        ADD COLUMN IF NOT EXISTS tipo_documento VARCHAR(20) DEFAULT 'DNI',
        ADD COLUMN IF NOT EXISTS apellido_paterno VARCHAR(50),
        ADD COLUMN IF NOT EXISTS apellido_materno VARCHAR(50),
        ADD COLUMN IF NOT EXISTS nombres VARCHAR(100),
        ADD COLUMN IF NOT EXISTS celular VARCHAR(20),
        ADD COLUMN IF NOT EXISTS celular_referencia VARCHAR(20),
        ADD COLUMN IF NOT EXISTS correo VARCHAR(100),
        ADD COLUMN IF NOT EXISTS genero VARCHAR(20),
        ADD COLUMN IF NOT EXISTS fecha_nacimiento DATE,
        ADD COLUMN IF NOT EXISTS estado_civil VARCHAR(30),
        ADD COLUMN IF NOT EXISTS n_hijos INTEGER DEFAULT 0,
        ADD COLUMN IF NOT EXISTS nivel_academico VARCHAR(100),
        ADD COLUMN IF NOT EXISTS carrera VARCHAR(100),
        ADD COLUMN IF NOT EXISTS nacionalidad VARCHAR(50) DEFAULT 'PERUANA',
        ADD COLUMN IF NOT EXISTS lugar_residencia VARCHAR(100),
        ADD COLUMN IF NOT EXISTS distrito_residencia VARCHAR(100),
        ADD COLUMN IF NOT EXISTS direccion_domicilio TEXT,
        ADD COLUMN IF NOT EXISTS lugar_nacimiento VARCHAR(100),
        ADD COLUMN IF NOT EXISTS entidad VARCHAR(100),
        ADD COLUMN IF NOT EXISTS celular_emergencia VARCHAR(20),
        ADD COLUMN IF NOT EXISTS contacto_emergencia VARCHAR(100),
        ADD COLUMN IF NOT EXISTS parentesco VARCHAR(50);
     `);

     console.log('3. Renaming postulante_documento to documento...');
     await client.query(`
        ALTER TABLE nominas RENAME COLUMN postulante_documento TO documento;
     `);

     console.log('4. Migrating data from postulantes to nominas...');
     await client.query(`
        UPDATE nominas n
        SET
          tipo_documento = p.tipo_documento,
          apellido_paterno = p.apellido_paterno,
          apellido_materno = p.apellido_materno,
          nombres = p.nombres,
          celular = p.celular,
          celular_referencia = p.celular_referencia,
          correo = p.correo,
          genero = p.genero,
          fecha_nacimiento = p.fecha_nacimiento,
          estado_civil = p.estado_civil,
          n_hijos = p.n_hijos,
          nivel_academico = p.nivel_academico,
          carrera = p.carrera,
          nacionalidad = p.nacionalidad,
          lugar_residencia = p.lugar_residencia,
          distrito_residencia = p.distrito_residencia,
          direccion_domicilio = p.direccion_domicilio,
          lugar_nacimiento = p.lugar_nacimiento,
          entidad = p.entidad,
          celular_emergencia = p.celular_emergencia,
          contacto_emergencia = p.contacto_emergencia,
          parentesco = p.parentesco
        FROM postulantes p
        WHERE n.documento = p.documento;
     `);
     
     console.log('Migration step 1 complete. Columns added and data migrated.');
  } catch(e) {
     console.error("Error:", e.message)
  }
  await client.end()
}
run()
