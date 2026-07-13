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
     // Create a minimal dummy payload based on what the UI sends
     const payload = {
        documento: '99999999',
        tipo_documento: 'DNI',
        apellido_paterno: 'TEST',
        apellido_materno: 'TEST',
        nombres: 'TEST',
        campana_id: 1, // Need a valid one or just any number
        semana_trabajo: 26,
        periodo_reclutado: '202605',
        grupo_codigo: 'GPE-2026010',
        reclutador_id: '00000000-0000-0000-0000-000000000000',
        sede_id: 1,
        fecha_nacimiento: '1990-01-01',
        n_hijos: 0,
        envio_dni: null,
        fecha_inicio_capacitacion: null,
        fecha_fin_capacitacion: null,
        fecha_conexion_ojt: null,
        fecha_conexion_op: null,
        fecha_inscripcion_curso: null,
        fecha_ingreso: null,
        pago_capacitacion: false,
        exp_call_center: false,
        remuneracion: 0,
        bono_variable: 0,
        bono_movilidad: 0,
        bono_bienvenida: 0,
        bono_permanencia: 0,
        bono_asistencia_perfecta: 0,
        estado: 'RECLUTADO'
     }
     
     // First let's get a real campana_id and reclutador_id to avoid FK errors
     const camp = await client.query('SELECT id FROM campanas LIMIT 1')
     if(camp.rows.length) payload.campana_id = camp.rows[0].id
     const rec = await client.query('SELECT id FROM reclutadores LIMIT 1')
     if(rec.rows.length) payload.reclutador_id = rec.rows[0].id
     const sede = await client.query('SELECT id FROM sedes LIMIT 1')
     if(sede.rows.length) payload.sede_id = sede.rows[0].id

     console.log("Testing with payload:", payload)
     
     const res = await client.query(`SELECT registrar_nomina($1::jsonb)`, [JSON.stringify(payload)])
     console.log("Success! ID:", res.rows[0])
     
     // cleanup
     await client.query(`DELETE FROM nominas WHERE postulante_documento = '99999999'`)
     await client.query(`DELETE FROM postulantes WHERE documento = '99999999'`)
  } catch(e) {
     console.error("Error from DB:", e)
  }
  await client.end()
}
run()
