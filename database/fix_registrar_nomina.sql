-- Fix registrar_nomina: auto-crear grupo + estado EN_CAPACITACION para flujo reclutador → capacitador
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

  -- Auto-crear grupo de capacitación por campaña + semana (visible para formador)
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
    exp_call_center, exp_tipo_campana, exp_tiempo_campana, exp_otra, exp_tiempo_otra,
    grupo_codigo, modalidad, condicion, horario_gestion, descanso,
    envio_dni, test_psicologico, validacion_pc, evaluacion_dia_0,
    fecha_inicio_capacitacion, fecha_fin_capacitacion,
    fecha_conexion_ojt, fecha_conexion_op, pago_capacitacion,
    tipo_contratacion, razon_social, remuneracion,
    bono_variable, bono_movilidad, bono_bienvenida, bono_permanencia, bono_asistencia_perfecta,
    cargo_contractual, dia_0, dia_0_obs, status_dia_1, dia_1, dia_1_obs,
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
