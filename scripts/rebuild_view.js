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
     // Rebuild the view correctly
     // nominas does NOT have grupo_codigo, it only has grupo_id
     // Need to JOIN grupos_capacitacion to get the code
     await client.query(`DROP VIEW IF EXISTS v_nominas_consolidado CASCADE`)
     
     await client.query(`
CREATE VIEW v_nominas_consolidado AS
SELECT
  -- Core identity
  n.id                          AS nomina_id,
  n.documento,
  n.tipo_documento,
  n.apellido_paterno,
  n.apellido_materno,
  n.nombres,
  n.celular,
  n.celular_referencia,
  n.celular_emergencia,
  n.contacto_emergencia,
  n.parentesco,
  n.correo,
  n.genero,
  n.fecha_nacimiento,
  EXTRACT(YEAR FROM AGE(CURRENT_DATE, n.fecha_nacimiento))::INTEGER AS edad,
  n.estado_civil,
  n.n_hijos,
  n.nivel_academico,
  n.carrera,
  n.entidad,
  n.nacionalidad,
  n.lugar_nacimiento,
  n.lugar_residencia,
  n.distrito_residencia,
  n.direccion_domicilio,

  -- Reclutamiento
  n.periodo_reclutado,
  n.semana_trabajo,
  r.nombre_completo             AS reclutador,
  n.sede                        AS sede,
  n.campana                     AS campana,
  n.segmento                    AS segmento,
  n.reclutador_id,
  n.fuente_oferta,
  n.observacion_reclutamiento,

  -- Experiencia
  n.exp_call_center,
  n.exp_tipo_campana,
  n.exp_tiempo_campana,
  n.exp_otra,
  n.exp_tiempo_otra,

  -- Capacitación
  n.grupo_codigo                AS grupo_codigo,
  n.grupo_codigo                AS grupo_codigo_alt,
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
  n.fecha_inscripcion_curso,

  -- Contrato & Compensación
  n.fecha_ingreso,
  n.tipo_trabajo,
  n.tipo_contratacion,
  n.razon_social,
  n.rango_salarial,
  n.remuneracion,
  n.bono_variable,
  n.bono_movilidad,
  n.bono_bienvenida,
  n.bono_permanencia,
  n.bono_asistencia_perfecta,
  n.cargo_contractual,

  -- Seguimiento DIA 0 / DIA 1
  n.dia_0,
  n.dia_0_obs,
  n.status_dia_1,
  n.dia_1,
  n.dia_1_obs,
  n.estado::TEXT                AS estado,
  n.activo,

  -- Documentos
  n.doc_cv,
  n.doc_dni_adjunto,
  n.doc_certijoven,
  n.doc_recibo_servicios,
  n.doc_ficha_datos,
  n.doc_autorizacion,

  -- Extras del grupo Capacidad RYS
  cr.area_traslado,
  cr.semana_label               AS grupo_semana_label,
  cr.estado                     AS grupo_estado,
  cr.rango_horario              AS grupo_rango_horario,
  cr.periodo                    AS grupo_periodo,
  cr.extension_teoria,
  cr.fecha_inicio_ojt           AS grupo_fecha_inicio_ojt,
  cr.extension_ojt,
  cr.fecha_ingreso_op           AS grupo_fecha_ingreso_op,
  cr.rq_solicitado,
  cr.rq_ftes_solicitado,
  cr.meta_dia_0,
  cr.meta_dia_1,

  n.created_at

FROM nominas n
LEFT JOIN reclutadores r ON n.reclutador_id = r.id
LEFT JOIN capacidad_rys cr ON n.grupo_codigo = cr.codigo
WHERE n.activo = TRUE
     `)
     console.log("View rebuilt successfully to read only from nominas!")
  } catch(e) {
     console.error("Error:", e.message)
  }
  await client.end()
}
run()
