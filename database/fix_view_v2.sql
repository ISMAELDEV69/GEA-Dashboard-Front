-- FIX: Restore v_nominas_consolidado with internal column names the frontend expects.
-- The previous migration broke it by using Spanish aliases ("Nro de DNI o C.E." etc.)
-- which the JS code doesn't recognise.

DROP VIEW IF EXISTS v_nominas_consolidado CASCADE;

CREATE VIEW v_nominas_consolidado AS
SELECT
  -- Core identity
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

  -- Reclutamiento
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

  -- Experiencia
  n.exp_call_center,
  n.exp_tipo_campana,
  n.exp_tiempo_campana,
  n.exp_otra,
  n.exp_tiempo_otra,

  -- Capacitación
  n.grupo_codigo,
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

  -- Seguimiento
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
LEFT JOIN v_capacidad_rys crys ON n.grupo_codigo = crys.grupo_capacitacion
WHERE n.activo = TRUE;
