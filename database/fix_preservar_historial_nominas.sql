-- ==============================================================================
-- FIX: Preservación Histórica de Nóminas y Postulantes en Reingresos
-- 1. Reactiva todos los registros históricos válidos en la tabla nominas
-- 2. Actualiza la función RPC public.adjudicar_postulantes_pool para NO
--    desactivar registros de reclutadores/semanas previas al adjudicar.
-- ==============================================================================

-- 1. REACTIVACIÓN DE REGISTROS HISTÓRICOS VÁLIDOS
-- Reactiva registros que no hayan sido eliminados explícitamente (estado = 'DESASIGNADO')
UPDATE public.nominas
SET activo = true,
    updated_at = NOW()
WHERE COALESCE(activo, false) = false
  AND COALESCE(estado, '') != 'DESASIGNADO';

-- 2. ACTUALIZACIÓN DEL RPC DE ADJUDICACIÓN ATÓMICA
CREATE OR REPLACE FUNCTION public.adjudicar_postulantes_pool(
  p_target_grupo    VARCHAR,
  p_target_campana  VARCHAR,
  p_postulantes     JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_item            JSONB;
  v_doc             TEXT;
  v_inserted_count  INTEGER := 0;
  v_updated_count   INTEGER := 0;
  v_clean_grupo     TEXT;
  v_clean_campana   TEXT;
BEGIN
  v_clean_grupo := UPPER(TRIM(p_target_grupo));
  v_clean_campana := UPPER(TRIM(p_target_campana));

  IF v_clean_grupo IS NULL OR v_clean_grupo = '' THEN
    RAISE EXCEPTION 'El código de grupo destino es obligatorio.';
  END IF;

  IF jsonb_array_length(p_postulantes) = 0 THEN
    RETURN jsonb_build_object(
      'success', true,
      'inserted', 0,
      'updated', 0,
      'deactivated', 0
    );
  END IF;

  -- Procesar inserción / actualización de postulantes en el grupo destino
  -- NOTA: Se preserva el historial de semanas y grupos anteriores intacto para proteger
  -- los indicadores de los reclutadores previos.
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_postulantes)
  LOOP
    v_doc := TRIM(COALESCE(v_item->>'documento', ''));
    IF v_doc = '' THEN
      CONTINUE;
    END IF;

    -- Si ya existe un registro en este mismo grupo exacto, actualizar datos demográficos sin pisar seguimiento operativo
    IF EXISTS (
      SELECT 1 FROM public.nominas
      WHERE documento = v_doc
        AND UPPER(TRIM(grupo_codigo)) = v_clean_grupo
    ) THEN
      UPDATE public.nominas
      SET
        nombres = COALESCE(NULLIF(TRIM(v_item->>'nombres'), ''), nombres),
        apellido_paterno = COALESCE(NULLIF(TRIM(v_item->>'apellido_paterno'), ''), apellido_paterno),
        apellido_materno = COALESCE(NULLIF(TRIM(v_item->>'apellido_materno'), ''), apellido_materno),
        celular = COALESCE(NULLIF(TRIM(v_item->>'celular'), ''), celular),
        celular_referencia = COALESCE(NULLIF(TRIM(v_item->>'celular_referencia'), ''), celular_referencia),
        correo = COALESCE(NULLIF(TRIM(v_item->>'correo'), ''), correo),
        genero = COALESCE(NULLIF(TRIM(v_item->>'genero'), ''), genero),
        fecha_nacimiento = CASE 
          WHEN v_item->>'fecha_nacimiento' IS NOT NULL AND v_item->>'fecha_nacimiento' <> '' 
          THEN (v_item->>'fecha_nacimiento')::DATE 
          ELSE fecha_nacimiento 
        END,
        estado_civil = COALESCE(NULLIF(TRIM(v_item->>'estado_civil'), ''), estado_civil),
        n_hijos = CASE 
          WHEN v_item->>'n_hijos' IS NOT NULL AND v_item->>'n_hijos' <> '' 
          THEN (v_item->>'n_hijos')::INTEGER 
          ELSE n_hijos 
        END,
        nivel_academico = COALESCE(NULLIF(TRIM(v_item->>'nivel_academico'), ''), nivel_academico),
        carrera = COALESCE(NULLIF(TRIM(v_item->>'carrera'), ''), carrera),
        nacionalidad = COALESCE(NULLIF(TRIM(v_item->>'nacionalidad'), ''), nacionalidad),
        lugar_residencia = COALESCE(NULLIF(TRIM(v_item->>'lugar_residencia'), ''), lugar_residencia),
        distrito_residencia = COALESCE(NULLIF(TRIM(v_item->>'distrito_residencia'), ''), distrito_residencia),
        direccion_domicilio = COALESCE(NULLIF(TRIM(v_item->>'direccion_domicilio'), ''), direccion_domicilio),
        exp_call_center = COALESCE(NULLIF(TRIM(v_item->>'exp_call_center'), ''), exp_call_center),
        exp_tipo_campana = COALESCE(NULLIF(TRIM(v_item->>'exp_tipo_campana'), ''), exp_tipo_campana),
        fuente_oferta = COALESCE(NULLIF(TRIM(v_item->>'fuente_oferta'), ''), fuente_oferta),
        activo = true,
        updated_at = NOW()
      WHERE documento = v_doc
        AND UPPER(TRIM(grupo_codigo)) = v_clean_grupo;

      v_updated_count := v_updated_count + 1;
    ELSE
      -- Insertar nuevo registro activo en la nómina para este grupo
      INSERT INTO public.nominas (
        documento,
        tipo_documento,
        nombres,
        apellido_paterno,
        apellido_materno,
        celular,
        celular_referencia,
        correo,
        genero,
        fecha_nacimiento,
        estado_civil,
        n_hijos,
        nivel_academico,
        carrera,
        nacionalidad,
        lugar_residencia,
        distrito_residencia,
        direccion_domicilio,
        exp_call_center,
        exp_tipo_campana,
        exp_tiempo_campana,
        exp_otra,
        exp_tiempo_otra,
        fuente_oferta,
        observacion_reclutamiento,
        campana,
        grupo_codigo,
        modalidad,
        condicion,
        horario_gestion,
        descanso,
        envio_dni,
        test_psicologico,
        validacion_pc,
        evaluacion_dia_0,
        fecha_inicio_capacitacion,
        fecha_fin_capacitacion,
        fecha_conexion_ojt,
        fecha_conexion_op,
        pago_capacitacion,
        tipo_contratacion,
        razon_social,
        remuneracion,
        bono_variable,
        bono_movilidad,
        bono_bienvenida,
        bono_permanencia,
        bono_asistencia_perfecta,
        cargo_contractual,
        dia_0,
        dia_0_obs,
        status_dia_1,
        dia_1,
        dia_1_obs,
        doc_cv,
        doc_dni_adjunto,
        doc_certijoven,
        doc_recibo_servicios,
        doc_ficha_datos,
        doc_autorizacion,
        status_final,
        observacion_final,
        periodo_reclutado,
        semana_trabajo,
        reclutador,
        segmento,
        activo,
        marca_temporal,
        evaluar,
        obs_evaluar,
        created_at,
        updated_at
      ) VALUES (
        v_doc,
        COALESCE(v_item->>'tipo_documento', 'DNI ( DOCUMENTO NACIONAL DE IDENTIDAD)'),
        TRIM(COALESCE(v_item->>'nombres', '')),
        TRIM(COALESCE(v_item->>'apellido_paterno', '')),
        TRIM(COALESCE(v_item->>'apellido_materno', '')),
        NULLIF(TRIM(v_item->>'celular'), ''),
        NULLIF(TRIM(v_item->>'celular_referencia'), ''),
        NULLIF(TRIM(v_item->>'correo'), ''),
        NULLIF(TRIM(v_item->>'genero'), ''),
        CASE WHEN v_item->>'fecha_nacimiento' IS NOT NULL AND v_item->>'fecha_nacimiento' <> '' THEN (v_item->>'fecha_nacimiento')::DATE ELSE NULL END,
        NULLIF(TRIM(v_item->>'estado_civil'), ''),
        CASE WHEN v_item->>'n_hijos' IS NOT NULL AND v_item->>'n_hijos' <> '' THEN (v_item->>'n_hijos')::INTEGER ELSE 0 END,
        NULLIF(TRIM(v_item->>'nivel_academico'), ''),
        NULLIF(TRIM(v_item->>'carrera'), ''),
        COALESCE(NULLIF(TRIM(v_item->>'nacionalidad'), ''), 'PERUANA'),
        NULLIF(TRIM(v_item->>'lugar_residencia'), ''),
        NULLIF(TRIM(v_item->>'distrito_residencia'), ''),
        NULLIF(TRIM(v_item->>'direccion_domicilio'), ''),
        NULLIF(TRIM(v_item->>'exp_call_center'), ''),
        NULLIF(TRIM(v_item->>'exp_tipo_campana'), ''),
        NULLIF(TRIM(v_item->>'exp_tiempo_campana'), ''),
        NULLIF(TRIM(v_item->>'exp_otra'), ''),
        NULLIF(TRIM(v_item->>'exp_tiempo_otra'), ''),
        NULLIF(TRIM(v_item->>'fuente_oferta'), ''),
        NULLIF(TRIM(v_item->>'observacion_reclutamiento'), ''),
        v_clean_campana,
        v_clean_grupo,
        NULLIF(TRIM(v_item->>'modalidad'), ''),
        NULLIF(TRIM(v_item->>'condicion'), ''),
        NULLIF(TRIM(v_item->>'horario_gestion'), ''),
        NULLIF(TRIM(v_item->>'descanso'), ''),
        NULLIF(TRIM(v_item->>'envio_dni'), ''),
        NULLIF(TRIM(v_item->>'test_psicologico'), ''),
        NULLIF(TRIM(v_item->>'validacion_pc'), ''),
        NULLIF(TRIM(v_item->>'evaluacion_dia_0'), ''),
        CASE WHEN v_item->>'fecha_inicio_capacitacion' IS NOT NULL AND v_item->>'fecha_inicio_capacitacion' <> '' THEN (v_item->>'fecha_inicio_capacitacion')::DATE ELSE NULL END,
        CASE WHEN v_item->>'fecha_fin_capacitacion' IS NOT NULL AND v_item->>'fecha_fin_capacitacion' <> '' THEN (v_item->>'fecha_fin_capacitacion')::DATE ELSE NULL END,
        CASE WHEN v_item->>'fecha_conexion_ojt' IS NOT NULL AND v_item->>'fecha_conexion_ojt' <> '' THEN (v_item->>'fecha_conexion_ojt')::DATE ELSE NULL END,
        CASE WHEN v_item->>'fecha_conexion_op' IS NOT NULL AND v_item->>'fecha_conexion_op' <> '' THEN (v_item->>'fecha_conexion_op')::DATE ELSE NULL END,
        CASE WHEN v_item->>'pago_capacitacion' IS NOT NULL AND v_item->>'pago_capacitacion' <> '' THEN (v_item->>'pago_capacitacion')::NUMERIC ELSE NULL END,
        NULLIF(TRIM(v_item->>'tipo_contratacion'), ''),
        NULLIF(TRIM(v_item->>'razon_social'), ''),
        CASE WHEN v_item->>'remuneracion' IS NOT NULL AND v_item->>'remuneracion' <> '' THEN (v_item->>'remuneracion')::NUMERIC ELSE NULL END,
        CASE WHEN v_item->>'bono_variable' IS NOT NULL AND v_item->>'bono_variable' <> '' THEN (v_item->>'bono_variable')::NUMERIC ELSE NULL END,
        CASE WHEN v_item->>'bono_movilidad' IS NOT NULL AND v_item->>'bono_movilidad' <> '' THEN (v_item->>'bono_movilidad')::NUMERIC ELSE NULL END,
        CASE WHEN v_item->>'bono_bienvenida' IS NOT NULL AND v_item->>'bono_bienvenida' <> '' THEN (v_item->>'bono_bienvenida')::NUMERIC ELSE NULL END,
        CASE WHEN v_item->>'bono_permanencia' IS NOT NULL AND v_item->>'bono_permanencia' <> '' THEN (v_item->>'bono_permanencia')::NUMERIC ELSE NULL END,
        CASE WHEN v_item->>'bono_asistencia_perfecta' IS NOT NULL AND v_item->>'bono_asistencia_perfecta' <> '' THEN (v_item->>'bono_asistencia_perfecta')::NUMERIC ELSE NULL END,
        NULLIF(TRIM(v_item->>'cargo_contractual'), ''),
        NULLIF(TRIM(v_item->>'dia_0'), ''),
        NULLIF(TRIM(v_item->>'dia_0_obs'), ''),
        COALESCE(NULLIF(TRIM(v_item->>'status_dia_1'), ''), 'APTO'),
        NULLIF(TRIM(v_item->>'dia_1'), ''),
        NULLIF(TRIM(v_item->>'dia_1_obs'), ''),
        NULLIF(TRIM(v_item->>'doc_cv'), ''),
        NULLIF(TRIM(v_item->>'doc_dni_adjunto'), ''),
        NULLIF(TRIM(v_item->>'doc_certijoven'), ''),
        NULLIF(TRIM(v_item->>'doc_recibo_servicios'), ''),
        NULLIF(TRIM(v_item->>'doc_ficha_datos'), ''),
        NULLIF(TRIM(v_item->>'doc_autorizacion'), ''),
        NULLIF(TRIM(v_item->>'status_final'), ''),
        NULLIF(TRIM(v_item->>'observacion_final'), ''),
        NULLIF(TRIM(v_item->>'periodo_reclutado'), ''),
        CASE WHEN v_item->>'semana_trabajo' IS NOT NULL AND v_item->>'semana_trabajo' <> '' THEN (v_item->>'semana_trabajo')::INTEGER ELSE NULL END,
        COALESCE(NULLIF(TRIM(v_item->>'reclutador'), ''), 'RECLUTAMIENTO'),
        NULLIF(TRIM(v_item->>'segmento'), ''),
        true,
        CASE WHEN v_item->>'marca_temporal' IS NOT NULL AND v_item->>'marca_temporal' <> '' THEN (v_item->>'marca_temporal')::TIMESTAMPTZ ELSE NOW() END,
        NULLIF(TRIM(v_item->>'evaluar'), ''),
        NULLIF(TRIM(v_item->>'obs_evaluar'), ''),
        NOW(),
        NOW()
      );

      v_inserted_count := v_inserted_count + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'inserted', v_inserted_count,
    'updated', v_updated_count,
    'deactivated', 0
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.adjudicar_postulantes_pool(VARCHAR, VARCHAR, JSONB) TO authenticated, anon;
