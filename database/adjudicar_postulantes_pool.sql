-- ==============================================================================
-- RPC: Adjudicación Atómica y Segura de Postulantes desde el Pool / Bolsa
-- Resuelve: Concurrencia, RLS de reclutadores previos y preservación histórica
-- ==============================================================================

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
  v_deactivated_count INTEGER := 0;
  v_clean_grupo     TEXT;
  v_clean_campana   TEXT;
  v_target_docs     TEXT[] := ARRAY[]::TEXT[];
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

  -- 1. Recolectar documentos para desactivación atómica previa
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_postulantes)
  LOOP
    v_doc := TRIM(COALESCE(v_item->>'documento', ''));
    IF v_doc <> '' THEN
      v_target_docs := array_append(v_target_docs, v_doc);
    END IF;
  END LOOP;

  -- 2. Desactivar (soft-close) procesos activos previos en otros grupos
  -- Se mantiene el reclutador, campaña y registros pasados intactos para trazabilidad e indicadores
  IF array_length(v_target_docs, 1) > 0 THEN
    WITH deactivated AS (
      UPDATE public.nominas
      SET activo = false,
          updated_at = NOW()
      WHERE documento = ANY(v_target_docs)
        AND (grupo_codigo IS DISTINCT FROM v_clean_grupo OR campana IS DISTINCT FROM v_clean_campana)
        AND COALESCE(activo, true) = true
      RETURNING id
    )
    SELECT count(*) INTO v_deactivated_count FROM deactivated;
  END IF;

  -- 3. Procesar inserción / actualización de postulantes en el grupo destino
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
        fuente_oferta,
        periodo_reclutado,
        semana_trabajo,
        reclutador,
        campana,
        segmento,
        grupo_codigo,
        status_dia_1,
        activo,
        estado,
        marca_temporal,
        created_at,
        updated_at
      ) VALUES (
        v_doc,
        COALESCE(NULLIF(TRIM(v_item->>'tipo_documento'), ''), 'DNI'),
        COALESCE(NULLIF(TRIM(v_item->>'nombres'), ''), ''),
        COALESCE(NULLIF(TRIM(v_item->>'apellido_paterno'), ''), ''),
        COALESCE(NULLIF(TRIM(v_item->>'apellido_materno'), ''), ''),
        NULLIF(TRIM(v_item->>'celular'), ''),
        NULLIF(TRIM(v_item->>'celular_referencia'), ''),
        NULLIF(TRIM(v_item->>'correo'), ''),
        COALESCE(NULLIF(TRIM(v_item->>'genero'), ''), 'MASCULINO'),
        CASE 
          WHEN v_item->>'fecha_nacimiento' IS NOT NULL AND v_item->>'fecha_nacimiento' <> '' 
          THEN (v_item->>'fecha_nacimiento')::DATE 
          ELSE NULL 
        END,
        COALESCE(NULLIF(TRIM(v_item->>'estado_civil'), ''), 'SOLTERO'),
        CASE 
          WHEN v_item->>'n_hijos' IS NOT NULL AND v_item->>'n_hijos' <> '' 
          THEN (v_item->>'n_hijos')::INTEGER 
          ELSE 0 
        END,
        NULLIF(TRIM(v_item->>'nivel_academico'), ''),
        NULLIF(TRIM(v_item->>'carrera'), ''),
        COALESCE(NULLIF(TRIM(v_item->>'nacionalidad'), ''), 'PERUANA'),
        NULLIF(TRIM(v_item->>'lugar_residencia'), ''),
        NULLIF(TRIM(v_item->>'distrito_residencia'), ''),
        NULLIF(TRIM(v_item->>'direccion_domicilio'), ''),
        NULLIF(TRIM(v_item->>'exp_call_center'), ''),
        NULLIF(TRIM(v_item->>'exp_tipo_campana'), ''),
        NULLIF(TRIM(v_item->>'fuente_oferta'), ''),
        NULLIF(TRIM(v_item->>'periodo_reclutado'), ''),
        CASE 
          WHEN v_item->>'semana_trabajo' IS NOT NULL AND v_item->>'semana_trabajo' <> '' 
          THEN (v_item->>'semana_trabajo')::INTEGER 
          ELSE NULL 
        END,
        COALESCE(NULLIF(TRIM(v_item->>'reclutador'), ''), 'RECLUTAMIENTO'),
        v_clean_campana,
        NULLIF(TRIM(v_item->>'segmento'), ''),
        v_clean_grupo,
        COALESCE(NULLIF(TRIM(v_item->>'status_dia_1'), ''), 'APTO'),
        true,
        'RECLUTADO',
        CASE 
          WHEN v_item->>'marca_temporal' IS NOT NULL AND v_item->>'marca_temporal' <> '' 
          THEN (v_item->>'marca_temporal')::TIMESTAMPTZ 
          ELSE NOW() 
        END,
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
    'deactivated', v_deactivated_count,
    'grupo', v_clean_grupo,
    'campana', v_clean_campana
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.adjudicar_postulantes_pool(VARCHAR, VARCHAR, JSONB) TO authenticated, anon;
