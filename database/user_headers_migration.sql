-- Migración para alinear con los encabezados exactos del Excel de reclutamiento

-- 1. Agregar nuevas columnas a POSTULANTES
ALTER TABLE postulantes
  ADD COLUMN IF NOT EXISTS lugar_nacimiento VARCHAR(150),
  ADD COLUMN IF NOT EXISTS entidad VARCHAR(150),
  ADD COLUMN IF NOT EXISTS celular_emergencia VARCHAR(30),
  ADD COLUMN IF NOT EXISTS contacto_emergencia VARCHAR(150),
  ADD COLUMN IF NOT EXISTS parentesco VARCHAR(50);

-- 2. Agregar nuevas columnas a NOMINAS
ALTER TABLE nominas
  ADD COLUMN IF NOT EXISTS fecha_ingreso DATE,
  ADD COLUMN IF NOT EXISTS tipo_trabajo VARCHAR(100),
  ADD COLUMN IF NOT EXISTS rango_salarial VARCHAR(100),
  ADD COLUMN IF NOT EXISTS fecha_inscripcion_curso DATE;

-- 3. Actualizar función registrar_nomina para recibir los nuevos datos
CREATE OR REPLACE FUNCTION registrar_nomina(p_data JSONB)
RETURNS UUID AS $$
DECLARE
  v_nomina_id UUID;
  v_doc VARCHAR(30);
  v_grupo_codigo VARCHAR(50);
  v_campana_nombre VARCHAR(150);
BEGIN
  v_doc := p_data->>'documento';

  INSERT INTO postulantes (
    documento, tipo_documento, apellido_paterno, apellido_materno, nombres,
    celular, celular_referencia, celular_emergencia, contacto_emergencia, parentesco,
    correo, genero, fecha_nacimiento, estado_civil, n_hijos,
    nivel_academico, carrera, entidad, nacionalidad,
    lugar_residencia, distrito_residencia, direccion_domicilio, lugar_nacimiento,
    updated_at
  ) VALUES (
    v_doc,
    COALESCE(p_data->>'tipo_documento', 'DNI'),
    p_data->>'apellido_paterno',
    p_data->>'apellido_materno',
    p_data->>'nombres',
    p_data->>'celular',
    p_data->>'celular_referencia',
    p_data->>'celular_emergencia',
    p_data->>'contacto_emergencia',
    p_data->>'parentesco',
    p_data->>'correo',
    p_data->>'genero',
    (p_data->>'fecha_nacimiento')::DATE,
    p_data->>'estado_civil',
    COALESCE((p_data->>'n_hijos')::INTEGER, 0),
    p_data->>'nivel_academico',
    p_data->>'carrera',
    p_data->>'entidad',
    COALESCE(p_data->>'nacionalidad', 'PERUANA'),
    p_data->>'lugar_residencia',
    p_data->>'distrito_residencia',
    p_data->>'direccion_domicilio',
    p_data->>'lugar_nacimiento',
    NOW()
  )
  ON CONFLICT (documento) DO UPDATE SET
    tipo_documento = EXCLUDED.tipo_documento,
    apellido_paterno = EXCLUDED.apellido_paterno,
    apellido_materno = EXCLUDED.apellido_materno,
    nombres = EXCLUDED.nombres,
    celular = EXCLUDED.celular,
    celular_referencia = EXCLUDED.celular_referencia,
    celular_emergencia = EXCLUDED.celular_emergencia,
    contacto_emergencia = EXCLUDED.contacto_emergencia,
    parentesco = EXCLUDED.parentesco,
    correo = EXCLUDED.correo,
    genero = EXCLUDED.genero,
    fecha_nacimiento = EXCLUDED.fecha_nacimiento,
    estado_civil = EXCLUDED.estado_civil,
    n_hijos = EXCLUDED.n_hijos,
    nivel_academico = EXCLUDED.nivel_academico,
    carrera = EXCLUDED.carrera,
    entidad = EXCLUDED.entidad,
    nacionalidad = EXCLUDED.nacionalidad,
    lugar_residencia = EXCLUDED.lugar_residencia,
    distrito_residencia = EXCLUDED.distrito_residencia,
    direccion_domicilio = EXCLUDED.direccion_domicilio,
    lugar_nacimiento = EXCLUDED.lugar_nacimiento,
    updated_at = NOW();

  UPDATE nominas SET activo = FALSE, updated_at = NOW()
  WHERE postulante_documento = v_doc AND activo = TRUE;

  IF (p_data->>'campana_id') IS NOT NULL AND (p_data->>'semana_trabajo') IS NOT NULL THEN
    SELECT nombre INTO v_campana_nombre FROM campanas WHERE id = (p_data->>'campana_id')::BIGINT;
    v_grupo_codigo := COALESCE(
      NULLIF(TRIM(p_data->>'grupo_codigo'), ''),
      'GPE-' || COALESCE(p_data->>'periodo_reclutado', to_char(CURRENT_DATE, 'YYYYMM'))
        || '-S' || lpad((p_data->>'semana_trabajo')::TEXT, 2, '0')
        || '-' || upper(left(regexp_replace(COALESCE(v_campana_nombre, 'GRUPO'), '\s+', '', 'g'), 12))
    );
    INSERT INTO grupos_capacitacion (codigo, campana_id, fecha_registro, semana_trabajo)
    VALUES (
      v_grupo_codigo,
      (p_data->>'campana_id')::BIGINT,
      CURRENT_DATE,
      (p_data->>'semana_trabajo')::INTEGER
    )
    ON CONFLICT (codigo) DO UPDATE SET
      semana_trabajo = EXCLUDED.semana_trabajo,
      campana_id = EXCLUDED.campana_id;

    IF NULLIF(TRIM(p_data->>'formador_documento'), '') IS NOT NULL THEN
      UPDATE grupos_capacitacion
      SET formador_documento = NULLIF(TRIM(p_data->>'formador_documento'), '')
      WHERE codigo = v_grupo_codigo;
    END IF;
  ELSE
    v_grupo_codigo := NULLIF(TRIM(p_data->>'grupo_codigo'), '');
  END IF;

  INSERT INTO nominas (
    postulante_documento, periodo_reclutado, semana_trabajo,
    reclutador_id, sede_id, campana_id,
    fuente_oferta, observacion_reclutamiento,
    fecha_ingreso, tipo_trabajo, rango_salarial, fecha_inscripcion_curso,
    exp_call_center, exp_tipo_campana, exp_tiempo_campana, exp_otra, exp_tiempo_otra,
    grupo_codigo, modalidad, condicion, horario_gestion, descanso,
    envio_dni, test_psicologico, validacion_pc, evaluacion_dia_0,
    fecha_inicio_capacitacion, fecha_fin_capacitacion,
    fecha_conexion_ojt, fecha_conexion_op, pago_capacitacion,
    tipo_contratacion, razon_social, remuneracion,
    bono_variable, bono_movilidad, bono_bienvenida, bono_permanencia, bono_asistencia_perfecta,
    cargo_contractual, dia_0, dia_0_obs, status_dia_1, dia_1, dia_1_obs,
    doc_cv, doc_dni_adjunto, doc_certijoven, doc_recibo_servicios, doc_ficha_datos, doc_autorizacion,
    estado, activo
  ) VALUES (
    v_doc,
    p_data->>'periodo_reclutado',
    (p_data->>'semana_trabajo')::INTEGER,
    (p_data->>'reclutador_id')::BIGINT,
    (p_data->>'sede_id')::BIGINT,
    (p_data->>'campana_id')::BIGINT,
    p_data->>'fuente_oferta',
    p_data->>'observacion_reclutamiento',
    (p_data->>'fecha_ingreso')::DATE,
    p_data->>'tipo_trabajo',
    p_data->>'rango_salarial',
    (p_data->>'fecha_inscripcion_curso')::DATE,
    (p_data->>'exp_call_center')::BOOLEAN,
    p_data->>'exp_tipo_campana',
    p_data->>'exp_tiempo_campana',
    p_data->>'exp_otra',
    p_data->>'exp_tiempo_otra',
    v_grupo_codigo,
    (p_data->>'modalidad')::modalidad_tipo,
    p_data->>'condicion',
    p_data->>'horario_gestion',
    p_data->>'descanso',
    (p_data->>'envio_dni')::DATE,
    p_data->>'test_psicologico',
    p_data->>'validacion_pc',
    p_data->>'evaluacion_dia_0',
    (p_data->>'fecha_inicio_capacitacion')::DATE,
    (p_data->>'fecha_fin_capacitacion')::DATE,
    (p_data->>'fecha_conexion_ojt')::DATE,
    (p_data->>'fecha_conexion_op')::DATE,
    COALESCE((p_data->>'pago_capacitacion')::BOOLEAN, FALSE),
    p_data->>'tipo_contratacion',
    p_data->>'razon_social',
    (p_data->>'remuneracion')::NUMERIC,
    (p_data->>'bono_variable')::NUMERIC,
    (p_data->>'bono_movilidad')::NUMERIC,
    (p_data->>'bono_bienvenida')::NUMERIC,
    (p_data->>'bono_permanencia')::NUMERIC,
    (p_data->>'bono_asistencia_perfecta')::NUMERIC,
    p_data->>'cargo_contractual',
    (p_data->>'dia_0')::DATE,
    p_data->>'dia_0_obs',
    p_data->>'status_dia_1',
    (p_data->>'dia_1')::DATE,
    p_data->>'dia_1_obs',
    p_data->>'doc_cv',
    p_data->>'doc_dni_adjunto',
    p_data->>'doc_certijoven',
    p_data->>'doc_recibo_servicios',
    p_data->>'doc_ficha_datos',
    p_data->>'doc_autorizacion',
    CASE
      WHEN v_grupo_codigo IS NOT NULL THEN COALESCE((p_data->>'estado')::nomina_estado, 'EN_CAPACITACION')
      ELSE COALESCE((p_data->>'estado')::nomina_estado, 'RECLUTADO')
    END,
    TRUE
  )
  RETURNING id INTO v_nomina_id;

  RETURN v_nomina_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION registrar_nomina(JSONB) TO authenticated;

-- 4. Recrear VISTA v_nominas_consolidado con ESTRICTAMENTE las columnas en el orden exacto del usuario
DROP VIEW IF EXISTS v_nominas_consolidado;
CREATE VIEW v_nominas_consolidado AS
SELECT
  -- El usuario pide estas 35 columnas en este orden exacto:
  p.documento                                                 AS "Nro de DNI o C.E.",
  p.nombres                                                   AS "Nombres",
  p.apellido_paterno                                          AS "Apellido Paterno",
  p.apellido_materno                                          AS "Apellido Materno",
  p.celular                                                   AS "N° Celular 1",
  p.fecha_nacimiento                                          AS "FECHA NACIMIENTO",
  EXTRACT(YEAR FROM AGE(CURRENT_DATE, p.fecha_nacimiento))::INTEGER AS "EDAD",
  p.tipo_documento                                            AS "Tipo de documento",
  p.estado_civil                                              AS "Estado Civil",
  p.lugar_residencia                                          AS "LUGAR DE RESIDENCIA",
  p.direccion_domicilio                                       AS "DIRECCION",
  p.distrito_residencia                                       AS "DISTRITO",
  p.lugar_nacimiento                                          AS "LUGAR DE NACIMIENTO",
  p.nacionalidad                                              AS "NACIONALIDAD",
  p.nivel_academico                                           AS "Nivel",
  p.carrera                                                   AS "CARRERA O PROFESION",
  p.entidad                                                   AS "Entidad",
  n.fecha_ingreso                                             AS "FECHA DE INGRESO",
  c.nombre                                                    AS "Campaña/Area",
  n.condicion                                                 AS "Condición de Contrato",
  n.tipo_trabajo                                              AS "TIPO DE TRABAJO",
  n.modalidad::TEXT                                           AS "MODALIDAD DE TRABAJO",
  n.horario_gestion                                           AS "HORARIO DE TRABAJO",
  n.rango_salarial                                            AS "Rango Salarial",
  p.celular_emergencia                                        AS "N° Celular de Emergencia",
  p.contacto_emergencia                                       AS "Contacto de Emergencia",
  p.parentesco                                                AS "Parentesco",
  p.n_hijos                                                   AS "N° de Hijos",
  s.nombre                                                    AS "SEDE",
  n.fecha_inscripcion_curso                                   AS "FECHA DE INSCRIPCION AL CURSO",
  n.fecha_inicio_capacitacion                                 AS "Fecha Inicio Capa",
  n.fuente_oferta                                             AS "Medio De Reclutamiento",
  r.nombre_completo                                           AS "NOMBRE Y APELLIDO DE RECLUTADOR",
  n.observacion_reclutamiento                                 AS "OBSERVACIONES RECLUTAMIENTO",
  n.estado::TEXT                                              AS "STATUS",

  -- Columnas adicionales requeridas por el Frontend / Lógica (ocultas en el Excel pero vitales)
  n.id                                                        AS nomina_id,
  n.grupo_codigo                                              AS grupo_codigo,
  c.segmento                                                  AS segmento,
  n.periodo_reclutado,
  n.semana_trabajo,
  n.reclutador_id,
  n.sede_id,
  n.campana_id,
  n.doc_cv,
  n.doc_dni_adjunto,
  n.doc_certijoven,
  n.doc_recibo_servicios,
  n.doc_ficha_datos,
  n.doc_autorizacion
FROM nominas n
JOIN postulantes p ON n.postulante_documento = p.documento
LEFT JOIN reclutadores r ON n.reclutador_id = r.id
LEFT JOIN sedes s ON n.sede_id = s.id
LEFT JOIN campanas c ON n.campana_id = c.id
WHERE n.activo = TRUE;
