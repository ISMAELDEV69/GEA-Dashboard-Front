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
     let res = await client.query(`
        CREATE OR REPLACE VIEW v_nominas_consolidado AS
        SELECT n.id AS nomina_id,
           p.documento, p.tipo_documento, p.apellido_paterno, p.apellido_materno, p.nombres, p.celular, p.celular_referencia, p.celular_emergencia, p.contacto_emergencia, p.parentesco, p.correo, p.genero, p.fecha_nacimiento, (EXTRACT(year FROM age((CURRENT_DATE)::timestamp with time zone, (p.fecha_nacimiento)::timestamp with time zone)))::integer AS edad, p.estado_civil, p.n_hijos, p.nivel_academico, p.carrera, p.entidad, p.nacionalidad, p.lugar_nacimiento, p.lugar_residencia, p.distrito_residencia, p.direccion_domicilio,
           n.periodo_reclutado, n.semana_trabajo,
           r.nombre_completo AS reclutador,
           s.nombre AS sede,
           c.nombre AS campana, c.segmento,
           n.reclutador_id, n.sede_id, n.campana_id, n.fuente_oferta, n.observacion_reclutamiento, n.exp_call_center, n.exp_tipo_campana, n.exp_tiempo_campana, n.exp_otra, n.exp_tiempo_otra,
           g.codigo AS grupo_codigo, n.grupo_id,
           COALESCE((n.modalidad)::text, (g.modalidad)::text) AS modalidad, COALESCE(n.condicion, g.condicion) AS condicion, COALESCE(n.horario_gestion, g.rango_horario) AS horario_gestion,
           n.descanso, n.envio_dni, n.test_psicologico, n.validacion_pc, n.evaluacion_dia_0, n.fecha_inicio_capacitacion, n.fecha_fin_capacitacion, n.fecha_conexion_ojt, n.fecha_conexion_op, n.pago_capacitacion, n.fecha_inscripcion_curso, n.fecha_ingreso, n.tipo_trabajo, n.tipo_contratacion, n.razon_social, n.rango_salarial, n.remuneracion, n.bono_variable, n.bono_movilidad, n.bono_bienvenida, n.bono_permanencia, n.bono_asistencia_perfecta, n.cargo_contractual,
           n.dia_0, n.dia_0_obs, n.status_dia_1, n.dia_1, n.dia_1_obs, (n.estado)::text AS estado, n.activo,
           n.doc_cv, n.doc_dni_adjunto, n.doc_certijoven, n.doc_recibo_servicios, n.doc_ficha_datos, n.doc_autorizacion,
           g.area_traslado, g.semana_label AS grupo_semana_label, g.estado_grupo AS grupo_estado, g.rango_horario AS grupo_rango_horario, g.periodo_capacitacion AS grupo_periodo, g.extension_teoria, g.fecha_inicio_ojt AS grupo_fecha_inicio_ojt, g.extension_ojt, g.fecha_ingreso_op AS grupo_fecha_ingreso_op, g.rq_solicitado, g.rq_ftes_solicitado, g.meta_dia_0, g.meta_dia_1,
           n.created_at
        FROM nominas n
        JOIN postulantes p ON (n.postulante_documento)::text = (p.documento)::text
        LEFT JOIN reclutadores r ON n.reclutador_id = r.id
        LEFT JOIN sedes s ON n.sede_id = s.id
        LEFT JOIN campanas c ON n.campana_id = c.id
        LEFT JOIN grupos_capacitacion g ON n.grupo_id = g.id
        -- Removed WHERE n.activo = true so we can see historical data
     `)
     console.log("View successfully updated without the activo=true filter!")
  } catch(e) {
     console.error("Error:", e.message)
  }
  await client.end()
}
run()
