-- Sincronización CAPACIDAD_RYS ↔ Nóminas ↔ Asistencias
-- Evita inconsistencias: grupo planificado es la fuente de verdad operativa

DROP VIEW IF EXISTS v_capacidad_rys_operativo CASCADE;
DROP VIEW IF EXISTS v_nominas_consolidado CASCADE;
CREATE OR REPLACE VIEW v_capacidad_rys_operativo AS
SELECT
  v.*,
  COALESCE(n.cnt, 0)::INTEGER                    AS postulantes_activos,
  CASE
    WHEN v.meta_dia_0 IS NOT NULL AND v.meta_dia_0 > 0
    THEN ROUND(100.0 * COALESCE(n.cnt, 0) / v.meta_dia_0, 1)
    ELSE NULL
  END                                            AS pct_cumplimiento_meta,
  CASE
    WHEN v.rq_ftes_solicitado IS NOT NULL AND COALESCE(n.cnt, 0) > v.rq_ftes_solicitado
    THEN TRUE ELSE FALSE
  END                                            AS excede_rq_ftes,
  CASE
    WHEN v.campana IS NOT NULL AND COALESCE(n.cnt, 0) = 0 AND v.estado IN ('ACTIVO', 'EN_CURSO')
    THEN TRUE ELSE FALSE
  END                                            AS sin_postulantes_activo
FROM v_capacidad_rys v
LEFT JOIN (
  SELECT grupo_codigo, COUNT(*)::INTEGER AS cnt
  FROM nominas
  WHERE activo = TRUE AND grupo_codigo IS NOT NULL
  GROUP BY grupo_codigo
) n ON n.grupo_codigo = v.grupo_capacitacion;

-- Enriquecer vista consolidado de nómina con datos del grupo CAPACIDAD_RYS
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
  p.correo,
  p.genero,
  p.fecha_nacimiento,
  EXTRACT(YEAR FROM AGE(CURRENT_DATE, p.fecha_nacimiento))::INTEGER AS edad,
  p.estado_civil,
  p.n_hijos,
  p.nivel_academico,
  p.carrera,
  p.nacionalidad,
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
  n.grupo_codigo,
  COALESCE(n.modalidad::TEXT, g.modalidad::TEXT) AS modalidad,
  COALESCE(n.condicion, g.condicion)               AS condicion,
  COALESCE(n.horario_gestion, g.rango_horario)   AS horario_gestion,
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
  n.tipo_contratacion,
  n.razon_social,
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
  g.area_traslado,
  g.periodo_capacitacion,
  g.estado_grupo,
  g.meta_dia_0,
  g.meta_dia_1,
  g.rq_ftes_solicitado,
  g.periodo_rys,
  g.formador_documento,
  p.created_at,
  n.updated_at
FROM nominas n
JOIN postulantes p ON p.documento = n.postulante_documento
LEFT JOIN reclutadores r ON r.id = n.reclutador_id
LEFT JOIN sedes s ON s.id = n.sede_id
LEFT JOIN campanas c ON c.id = n.campana_id
LEFT JOIN grupos_capacitacion g ON g.codigo = n.grupo_codigo
WHERE n.activo = TRUE;

-- Resolver grupo planificado (CAPACIDAD_RYS) antes de auto-crear
CREATE OR REPLACE FUNCTION resolver_grupo_capacidad(
  p_campana_id BIGINT,
  p_semana INTEGER,
  p_periodo VARCHAR,
  p_grupo_explicito VARCHAR DEFAULT NULL
)
RETURNS VARCHAR AS $$
DECLARE
  v_codigo VARCHAR(50);
BEGIN
  IF NULLIF(TRIM(p_grupo_explicito), '') IS NOT NULL THEN
    SELECT codigo INTO v_codigo FROM grupos_capacitacion
    WHERE UPPER(codigo) = UPPER(TRIM(p_grupo_explicito))
    LIMIT 1;
    IF v_codigo IS NOT NULL THEN RETURN v_codigo; END IF;
  END IF;

  SELECT g.codigo INTO v_codigo
  FROM grupos_capacitacion g
  WHERE g.campana_id = p_campana_id
    AND g.semana_trabajo = p_semana
    AND (
      g.periodo_capacitacion = p_periodo
      OR g.periodo_capacitacion IS NULL
      OR p_periodo IS NULL
    )
  ORDER BY
    CASE WHEN g.periodo_capacitacion = p_periodo THEN 0 ELSE 1 END,
    CASE WHEN g.estado_grupo IN ('ACTIVO', 'EN_CURSO', 'PLANIFICADO') THEN 0 ELSE 1 END,
    g.created_at DESC
  LIMIT 1;

  RETURN v_codigo;
END;
$$ LANGUAGE plpgsql STABLE;

-- Propagar cambios del grupo a nóminas activas
CREATE OR REPLACE FUNCTION sync_nominas_desde_grupo()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE nominas n SET
    campana_id       = NEW.campana_id,
    semana_trabajo   = NEW.semana_trabajo,
    modalidad        = COALESCE(
      CASE WHEN NEW.modalidad IN ('PRESENCIAL','REMOTO','HIBRIDO') THEN NEW.modalidad::modalidad_tipo ELSE NULL END,
      n.modalidad
    ),
    condicion        = COALESCE(NEW.condicion, n.condicion),
    horario_gestion  = COALESCE(NEW.rango_horario, n.horario_gestion),
    updated_at       = NOW()
  WHERE n.grupo_codigo = NEW.codigo AND n.activo = TRUE;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_nominas_grupo ON grupos_capacitacion;
CREATE TRIGGER trg_sync_nominas_grupo
  AFTER UPDATE ON grupos_capacitacion
  FOR EACH ROW
  WHEN (OLD IS DISTINCT FROM NEW)
  EXECUTE FUNCTION sync_nominas_desde_grupo();

-- registrar_nomina: hereda campos del plan CAPACIDAD_RYS
CREATE OR REPLACE FUNCTION registrar_nomina(p_data JSONB)
RETURNS UUID AS $$
DECLARE
  v_nomina_id UUID;
  v_doc VARCHAR(30);
  v_grupo_codigo VARCHAR(50);
  v_campana_nombre VARCHAR(150);
  v_campana_id BIGINT;
  v_semana INTEGER;
  v_periodo VARCHAR(10);
  v_g_modalidad modalidad_tipo;
  v_g_condicion VARCHAR(100);
  v_g_horario VARCHAR(50);
  v_g_formador VARCHAR(20);
BEGIN
  v_doc := p_data->>'documento';
  v_campana_id := (p_data->>'campana_id')::BIGINT;
  v_semana := (p_data->>'semana_trabajo')::INTEGER;
  v_periodo := p_data->>'periodo_reclutado';

  INSERT INTO postulantes (
    documento, tipo_documento, apellido_paterno, apellido_materno, nombres,
    celular, celular_referencia, correo, genero, fecha_nacimiento,
    estado_civil, n_hijos, nivel_academico, carrera, nacionalidad,
    lugar_residencia, distrito_residencia, direccion_domicilio, updated_at
  ) VALUES (
    v_doc,
    COALESCE(p_data->>'tipo_documento', 'DNI'),
    p_data->>'apellido_paterno',
    p_data->>'apellido_materno',
    p_data->>'nombres',
    p_data->>'celular',
    p_data->>'celular_referencia',
    p_data->>'correo',
    p_data->>'genero',
    (p_data->>'fecha_nacimiento')::DATE,
    p_data->>'estado_civil',
    COALESCE((p_data->>'n_hijos')::INTEGER, 0),
    p_data->>'nivel_academico',
    p_data->>'carrera',
    COALESCE(p_data->>'nacionalidad', 'PERUANA'),
    p_data->>'lugar_residencia',
    p_data->>'distrito_residencia',
    p_data->>'direccion_domicilio',
    NOW()
  )
  ON CONFLICT (documento) DO UPDATE SET
    tipo_documento = EXCLUDED.tipo_documento,
    apellido_paterno = EXCLUDED.apellido_paterno,
    apellido_materno = EXCLUDED.apellido_materno,
    nombres = EXCLUDED.nombres,
    celular = EXCLUDED.celular,
    celular_referencia = EXCLUDED.celular_referencia,
    correo = EXCLUDED.correo,
    genero = EXCLUDED.genero,
    fecha_nacimiento = EXCLUDED.fecha_nacimiento,
    estado_civil = EXCLUDED.estado_civil,
    n_hijos = EXCLUDED.n_hijos,
    nivel_academico = EXCLUDED.nivel_academico,
    carrera = EXCLUDED.carrera,
    nacionalidad = EXCLUDED.nacionalidad,
    lugar_residencia = EXCLUDED.lugar_residencia,
    distrito_residencia = EXCLUDED.distrito_residencia,
    direccion_domicilio = EXCLUDED.direccion_domicilio,
    updated_at = NOW();

  UPDATE nominas SET activo = FALSE, updated_at = NOW()
  WHERE postulante_documento = v_doc AND activo = TRUE;

  IF v_campana_id IS NOT NULL AND v_semana IS NOT NULL THEN
    SELECT nombre INTO v_campana_nombre FROM campanas WHERE id = v_campana_id;

    v_grupo_codigo := resolver_grupo_capacidad(
      v_campana_id,
      v_semana,
      v_periodo,
      p_data->>'grupo_codigo'
    );

    IF v_grupo_codigo IS NULL THEN
      v_grupo_codigo := COALESCE(
        NULLIF(TRIM(p_data->>'grupo_codigo'), ''),
        'GPE-' || COALESCE(v_periodo, to_char(CURRENT_DATE, 'YYYYMM'))
          || '-S' || lpad(v_semana::TEXT, 2, '0')
          || '-' || upper(left(regexp_replace(COALESCE(v_campana_nombre, 'GRUPO'), '\s+', '', 'g'), 12))
      );
      INSERT INTO grupos_capacitacion (codigo, campana_id, fecha_registro, semana_trabajo, periodo_capacitacion, estado_grupo)
      VALUES (
        v_grupo_codigo,
        v_campana_id,
        CURRENT_DATE,
        v_semana,
        v_periodo,
        'ACTIVO'
      )
      ON CONFLICT (codigo) DO UPDATE SET
        semana_trabajo = EXCLUDED.semana_trabajo,
        campana_id = EXCLUDED.campana_id,
        periodo_capacitacion = COALESCE(EXCLUDED.periodo_capacitacion, grupos_capacitacion.periodo_capacitacion);
    ELSE
      -- Activar grupo planificado al primer ingreso
      UPDATE grupos_capacitacion
      SET estado_grupo = CASE
            WHEN estado_grupo IN ('PLANIFICADO', 'CERRADO') THEN 'ACTIVO'
            ELSE estado_grupo
          END
      WHERE codigo = v_grupo_codigo;
    END IF;

    SELECT modalidad, condicion, rango_horario, formador_documento
    INTO v_g_modalidad, v_g_condicion, v_g_horario, v_g_formador
    FROM grupos_capacitacion WHERE codigo = v_grupo_codigo;

    IF NULLIF(TRIM(p_data->>'formador_documento'), '') IS NOT NULL THEN
      UPDATE grupos_capacitacion
      SET formador_documento = NULLIF(TRIM(p_data->>'formador_documento'), '')
      WHERE codigo = v_grupo_codigo;
    ELSIF v_g_formador IS NOT NULL AND NULLIF(TRIM(p_data->>'formador_documento'), '') IS NULL THEN
      NULL; -- mantener formador del plan
    END IF;
  ELSE
    v_grupo_codigo := NULLIF(TRIM(p_data->>'grupo_codigo'), '');
    v_g_modalidad := NULL;
    v_g_condicion := NULL;
    v_g_horario := NULL;
  END IF;

  INSERT INTO nominas (
    postulante_documento, periodo_reclutado, semana_trabajo,
    reclutador_id, sede_id, campana_id,
    fuente_oferta, observacion_reclutamiento,
    exp_call_center, exp_tipo_campana, exp_tiempo_campana, exp_otra, exp_tiempo_otra,
    grupo_codigo, modalidad, condicion, horario_gestion, descanso,
    envio_dni, test_psicologico, validacion_pc, evaluacion_dia_0,
    fecha_inicio_capacitacion, fecha_fin_capacitacion,
    fecha_conexion_ojt, fecha_conexion_op, pago_capacitacion,
    tipo_contratacion, razon_social, remuneracion,
    bono_variable, bono_movilidad, bono_bienvenida, bono_permanencia, bono_asistencia_perfecta,
    cargo_contractual, dia_0, dia_0_obs, status_dia_1, dia_1, dia_1_obs,
    doc_cv, doc_dni_adjunto, doc_certijoven, doc_recibo_servicios, doc_ficha_datos, doc_autorizacion,
    observacion_estado, estado, activo
  ) VALUES (
    v_doc,
    v_periodo,
    v_semana,
    (p_data->>'reclutador_id')::BIGINT,
    (p_data->>'sede_id')::BIGINT,
    v_campana_id,
    p_data->>'fuente_oferta',
    p_data->>'observacion_reclutamiento',
    (p_data->>'exp_call_center')::BOOLEAN,
    p_data->>'exp_tipo_campana',
    p_data->>'exp_tiempo_campana',
    p_data->>'exp_otra',
    p_data->>'exp_tiempo_otra',
    v_grupo_codigo,
    COALESCE((p_data->>'modalidad')::modalidad_tipo, v_g_modalidad),
    COALESCE(p_data->>'condicion', v_g_condicion),
    COALESCE(p_data->>'horario_gestion', v_g_horario),
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
    p_data->>'observacion_estado',
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
