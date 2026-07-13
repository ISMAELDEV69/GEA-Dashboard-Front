-- Campos de documentación adjunta (status en consolidado Excel)
ALTER TABLE nominas
  ADD COLUMN IF NOT EXISTS doc_cv               VARCHAR(80),
  ADD COLUMN IF NOT EXISTS doc_dni_adjunto        VARCHAR(80),
  ADD COLUMN IF NOT EXISTS doc_certijoven         VARCHAR(80),
  ADD COLUMN IF NOT EXISTS doc_recibo_servicios   VARCHAR(80),
  ADD COLUMN IF NOT EXISTS doc_ficha_datos        VARCHAR(80),
  ADD COLUMN IF NOT EXISTS doc_autorizacion       VARCHAR(80),
  ADD COLUMN IF NOT EXISTS observacion_estado     TEXT;

-- Actualizar vista consolidada (recrear con nuevos campos)
DROP VIEW IF EXISTS v_capacidad_rys_operativo CASCADE;
DROP VIEW IF EXISTS v_nominas_consolidado CASCADE;

CREATE OR REPLACE VIEW v_nominas_consolidado AS
SELECT
  n.id AS nomina_id,
  p.documento, p.tipo_documento, p.apellido_paterno, p.apellido_materno, p.nombres,
  p.celular, p.celular_referencia, p.correo, p.genero, p.fecha_nacimiento,
  EXTRACT(YEAR FROM AGE(CURRENT_DATE, p.fecha_nacimiento))::INTEGER AS edad,
  p.estado_civil, p.n_hijos, p.nivel_academico, p.carrera, p.nacionalidad,
  p.lugar_residencia, p.distrito_residencia, p.direccion_domicilio,
  n.periodo_reclutado, n.semana_trabajo,
  r.nombre_completo AS reclutador, s.nombre AS sede, c.nombre AS campana, c.segmento,
  n.reclutador_id, n.sede_id, n.campana_id,
  n.fuente_oferta, n.observacion_reclutamiento,
  n.exp_call_center, n.exp_tipo_campana, n.exp_tiempo_campana, n.exp_otra, n.exp_tiempo_otra,
  n.grupo_codigo,
  COALESCE(n.modalidad::TEXT, g.modalidad::TEXT) AS modalidad,
  COALESCE(n.condicion, g.condicion) AS condicion,
  COALESCE(n.horario_gestion, g.rango_horario) AS horario_gestion,
  n.descanso, n.envio_dni, n.test_psicologico, n.validacion_pc, n.evaluacion_dia_0,
  n.fecha_inicio_capacitacion, n.fecha_fin_capacitacion, n.fecha_conexion_ojt, n.fecha_conexion_op,
  n.pago_capacitacion, n.tipo_contratacion, n.razon_social, n.remuneracion,
  n.bono_variable, n.bono_movilidad, n.bono_bienvenida, n.bono_permanencia, n.bono_asistencia_perfecta,
  n.cargo_contractual, n.dia_0, n.dia_0_obs, n.status_dia_1, n.dia_1, n.dia_1_obs,
  n.doc_cv, n.doc_dni_adjunto, n.doc_certijoven, n.doc_recibo_servicios,
  n.doc_ficha_datos, n.doc_autorizacion, n.observacion_estado,
  n.estado::TEXT AS estado, n.activo,
  g.area_traslado, g.periodo_capacitacion, g.estado_grupo, g.meta_dia_0, g.meta_dia_1,
  g.rq_ftes_solicitado, g.periodo_rys, g.formador_documento,
  p.created_at, n.updated_at
FROM nominas n
JOIN postulantes p ON p.documento = n.postulante_documento
LEFT JOIN reclutadores r ON r.id = n.reclutador_id
LEFT JOIN sedes s ON s.id = n.sede_id
LEFT JOIN campanas c ON c.id = n.campana_id
LEFT JOIN grupos_capacitacion g ON g.codigo = n.grupo_codigo
WHERE n.activo = TRUE;

-- Recrear vista capacidad si existe base
CREATE OR REPLACE VIEW v_capacidad_rys_operativo AS
SELECT v.*,
  COALESCE(n.cnt, 0)::INTEGER AS postulantes_activos,
  CASE WHEN v.meta_dia_0 > 0 THEN ROUND(100.0 * COALESCE(n.cnt, 0) / v.meta_dia_0, 1) END AS pct_cumplimiento_meta,
  CASE WHEN v.rq_ftes_solicitado IS NOT NULL AND COALESCE(n.cnt, 0) > v.rq_ftes_solicitado THEN TRUE ELSE FALSE END AS excede_rq_ftes,
  CASE WHEN v.campana IS NOT NULL AND COALESCE(n.cnt, 0) = 0 AND v.estado IN ('ACTIVO', 'EN_CURSO') THEN TRUE ELSE FALSE END AS sin_postulantes_activo
FROM v_capacidad_rys v
LEFT JOIN (
  SELECT grupo_codigo, COUNT(*)::INTEGER AS cnt FROM nominas
  WHERE activo = TRUE AND grupo_codigo IS NOT NULL GROUP BY grupo_codigo
) n ON n.grupo_codigo = v.grupo_capacitacion;
