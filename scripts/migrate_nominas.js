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
     await client.query('BEGIN')

     console.log('Dropping dependent view...')
     await client.query(`DROP VIEW IF EXISTS v_nominas_consolidado CASCADE`)

     console.log('Renaming old nominas table...')
     await client.query(`ALTER TABLE nominas RENAME TO nominas_old`)

     console.log('Creating new nominas table...')
     await client.query(`
      CREATE TABLE nominas (
        documento TEXT PRIMARY KEY,
        periodo_reclutado TEXT,
        semana_trabajo INTEGER,
        reclutador TEXT,
        sede TEXT,
        tipo_documento TEXT,
        apellido_paterno TEXT,
        apellido_materno TEXT,
        nombres TEXT,
        celular TEXT,
        celular_referencia TEXT,
        correo TEXT,
        genero TEXT,
        fecha_nacimiento DATE,
        estado_civil TEXT,
        n_hijos INTEGER,
        nivel_academico TEXT,
        carrera TEXT,
        nacionalidad TEXT,
        lugar_residencia TEXT,
        distrito_residencia TEXT,
        direccion_domicilio TEXT,
        exp_call_center TEXT,
        exp_tipo_campana TEXT,
        exp_tiempo_call TEXT,
        exp_otra TEXT,
        exp_tiempo_otra TEXT,
        fuente_oferta TEXT,
        observacion_reclutamiento TEXT,
        campana TEXT,
        grupo_codigo TEXT,
        modalidad TEXT,
        condicion TEXT,
        horario_gestion TEXT,
        descanso TEXT,
        envio_dni DATE,
        test_psicologico TEXT,
        validacion_pc TEXT,
        evaluacion_dia_0 TEXT,
        fecha_inicio_capacitacion DATE,
        fecha_fin_capacitacion DATE,
        fecha_conexion_ojt DATE,
        fecha_conexion_op DATE,
        pago_capacitacion TEXT,
        tipo_contratacion TEXT,
        razon_social TEXT,
        remuneracion NUMERIC,
        bono_variable NUMERIC,
        bono_movilidad NUMERIC,
        bono_bienvenida NUMERIC,
        bono_permanencia NUMERIC,
        bono_asistencia_perfecta NUMERIC,
        cargo_contractual TEXT,
        dia_0 DATE,
        dia_0_obs TEXT,
        status_dia_1 TEXT,
        dia_1 DATE,
        dia_1_obs TEXT,
        doc_cv TEXT,
        doc_dni_adjunto TEXT,
        doc_certijoven TEXT,
        doc_recibo_servicios TEXT,
        doc_ficha_datos TEXT,
        doc_autorizacion TEXT,
        status_final TEXT,
        observacion_final TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        activo BOOLEAN DEFAULT TRUE,
        reclutador_id UUID
      )
     `)

     console.log('Recreating view...')
     await client.query(`
CREATE VIEW v_nominas_consolidado AS
SELECT
  n.documento AS nomina_id,
  n.documento,
  n.tipo_documento,
  n.apellido_paterno,
  n.apellido_materno,
  n.nombres,
  n.celular,
  n.celular_referencia,
  NULL AS celular_emergencia,
  NULL AS contacto_emergencia,
  NULL AS parentesco,
  n.correo,
  n.genero,
  n.fecha_nacimiento,
  EXTRACT(YEAR FROM AGE(CURRENT_DATE, n.fecha_nacimiento))::INTEGER AS edad,
  n.estado_civil,
  n.n_hijos,
  n.nivel_academico,
  n.carrera,
  NULL AS entidad,
  n.nacionalidad,
  NULL AS lugar_nacimiento,
  n.lugar_residencia,
  n.distrito_residencia,
  n.direccion_domicilio,
  n.periodo_reclutado,
  n.semana_trabajo,
  n.reclutador,
  n.sede,
  n.campana,
  NULL AS segmento,
  n.reclutador_id,
  n.fuente_oferta,
  n.observacion_reclutamiento,
  n.exp_call_center,
  n.exp_tipo_campana,
  n.exp_tiempo_call AS exp_tiempo_campana,
  n.exp_otra,
  n.exp_tiempo_otra,
  n.grupo_codigo,
  n.grupo_codigo AS grupo_codigo_alt,
  COALESCE(n.modalidad::TEXT, cr.modalidad) AS modalidad,
  COALESCE(n.condicion, cr.condicion) AS condicion,
  COALESCE(n.horario_gestion, cr.rango_horario) AS horario_gestion,
  n.descanso,
  n.envio_dni,
  n.test_psicologico,
  n.validacion_pc,
  n.evaluacion_dia_0,
  n.fecha_inicio_capacitacion,
  n.fecha_fin_capacitacion,
  n.fecha_conexion_ojt,
  n.fecha_conexion_op,
  n.pago_capacitacion,
  NULL AS fecha_inscripcion_curso,
  NULL AS fecha_ingreso,
  NULL AS tipo_trabajo,
  n.tipo_contratacion,
  n.razon_social,
  NULL AS rango_salarial,
  n.remuneracion,
  n.bono_variable,
  n.bono_movilidad,
  n.bono_bienvenida,
  n.bono_permanencia,
  n.bono_asistencia_perfecta,
  n.cargo_contractual,
  n.dia_0,
  n.dia_0_obs,
  n.status_dia_1,
  n.dia_1,
  n.dia_1_obs,
  n.status_final AS estado,
  n.activo,
  n.doc_cv,
  n.doc_dni_adjunto,
  n.doc_certijoven,
  n.doc_recibo_servicios,
  n.doc_ficha_datos,
  n.doc_autorizacion,
  cr.area_traslado,
  cr.semana_label AS grupo_semana_label,
  cr.estado AS grupo_estado,
  cr.rango_horario AS grupo_rango_horario,
  cr.periodo AS grupo_periodo,
  cr.extension_teoria,
  cr.fecha_inicio_ojt AS grupo_fecha_inicio_ojt,
  cr.extension_ojt,
  cr.fecha_ingreso_op AS grupo_fecha_ingreso_op,
  cr.rq_solicitado,
  cr.rq_ftes_solicitado,
  cr.meta_dia_0,
  cr.meta_dia_1,
  n.created_at
FROM nominas n
LEFT JOIN capacidad_rys cr ON n.grupo_codigo = cr.codigo
WHERE n.activo = TRUE
     `)

     await client.query('COMMIT')
     console.log('Migration successful!')

  } catch(e) {
     await client.query('ROLLBACK')
     console.error("Error:", e.message)
  }
  await client.end()
}
run()
