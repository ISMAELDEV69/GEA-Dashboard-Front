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
CREATE OR REPLACE VIEW v_capacidad_rys AS
 SELECT c.segmento,
    g.area_traslado,
    c.nombre AS campana,
    g.codigo AS grupo_capacitacion,
    COALESCE(g.semana_label, ('SEM '::text || g.semana_trabajo::text)::character varying) AS semana,
    g.modalidad::text AS modalidad,
    g.condicion AS condicion_laboral,
    g.estado_grupo AS estado,
    g.fecha_registro AS fecha_inicio,
    g.periodo_capacitacion AS periodo,
    g.rango_horario,
    g.extension_teoria,
    g.fecha_inicio_ojt,
    g.extension_ojt,
    g.fecha_ingreso_op,
    g.rq_solicitado,
    g.rq_ftes_solicitado,
    g.meta_dia_0,
    g.meta_dia_1,
    g.periodo_ingreso_op,
    g.periodo_rys,
    g.semana_trabajo,
    g.formador_documento,
    g.campana_id,
    g.created_at,
    g.id AS grupo_id
   FROM grupos_capacitacion g
     JOIN campanas c ON c.id = g.campana_id
  ORDER BY g.periodo_capacitacion DESC NULLS LAST, g.codigo;

CREATE OR REPLACE VIEW v_capacidad_rys_operativo AS
 SELECT c.segmento,
    g.area_traslado,
    c.nombre AS campana,
    g.codigo AS grupo_capacitacion,
    g.id AS grupo_id,
    g.modalidad::text AS modalidad,
    g.condicion AS condicion_laboral,
    g.estado_grupo AS estado,
    g.periodo_capacitacion AS periodo,
    g.rango_horario,
    g.fecha_ingreso_op
   FROM grupos_capacitacion g
     JOIN campanas c ON c.id = g.campana_id
  WHERE g.estado_grupo::text = ANY (ARRAY['ACTIVO'::character varying, 'EN CURSO'::character varying, 'PLANIFICADO'::character varying]::text[]);

CREATE OR REPLACE VIEW v_nominas_consolidado AS
SELECT
  n.id                          AS nomina_id,
  p.documento,
  p.tipo_documento,
  p.apellido_paterno,
  p.apellido_materno,
  p.nombres,
  p.celular,
  p.celular_referencia,
  p.celular_emergencia,
  p.contacto_emergencia,
  p.parentesco,
  p.correo,
  p.genero,
  p.fecha_nacimiento,
  EXTRACT(YEAR FROM AGE(CURRENT_DATE, p.fecha_nacimiento))::INTEGER AS edad,
  p.estado_civil,
  p.n_hijos,
  p.nivel_academico,
  p.carrera,
  p.entidad,
  p.nacionalidad,
  p.lugar_nacimiento,
  p.lugar_residencia,
  p.distrito_residencia,
  p.direccion_domicilio,

  n.periodo_reclutado,
  n.semana_trabajo,
  r.nombre_completo             AS reclutador,
  s.nombre                      AS sede,
  c.nombre                      AS campana,
  c.segmento                    AS segmento,
  n.reclutador_id,
  n.sede_id,
  n.campana_id,
  n.fuente_oferta,
  n.observacion_reclutamiento,

  n.exp_call_center,
  n.exp_tipo_campana,
  n.exp_tiempo_campana,
  n.exp_otra,
  n.exp_tiempo_otra,

  g.codigo                      AS grupo_codigo,
  n.grupo_id,
  COALESCE(n.modalidad::TEXT, crys.modalidad) AS modalidad,
  COALESCE(n.condicion, crys.condicion_laboral) AS condicion,
  COALESCE(n.horario_gestion, crys.rango_horario) AS horario_gestion,
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

  n.dia_0,
  n.dia_0_obs,
  n.status_dia_1,
  n.dia_1,
  n.dia_1_obs,
  n.estado::TEXT                AS estado,
  n.activo,

  n.doc_cv,
  n.doc_dni_adjunto,
  n.doc_certijoven,
  n.doc_recibo_servicios,
  n.doc_ficha_datos,
  n.doc_autorizacion,

  crys.area_traslado,
  crys.semana                   AS grupo_semana_label,
  crys.estado                   AS grupo_estado,
  crys.rango_horario            AS grupo_rango_horario,
  crys.periodo                  AS grupo_periodo,
  crys.extension_teoria,
  crys.fecha_inicio_ojt         AS grupo_fecha_inicio_ojt,
  crys.extension_ojt,
  crys.fecha_ingreso_op         AS grupo_fecha_ingreso_op,
  crys.rq_solicitado,
  crys.rq_ftes_solicitado,
  crys.meta_dia_0,
  crys.meta_dia_1,

  n.created_at

FROM nominas n
JOIN postulantes p ON n.postulante_documento = p.documento
LEFT JOIN reclutadores r ON n.reclutador_id = r.id
LEFT JOIN sedes s ON n.sede_id = s.id
LEFT JOIN campanas c ON n.campana_id = c.id
LEFT JOIN grupos_capacitacion g ON n.grupo_id = g.id
LEFT JOIN v_capacidad_rys crys ON crys.grupo_id = n.grupo_id
WHERE n.activo = TRUE;
`
    await client.query(sql)
    console.log("Views recreated successfully!")
  } catch(e) {
     console.error("Error:", e)
  }
  await client.end()
}
run()
