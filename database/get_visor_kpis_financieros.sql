-- ====================================================================
-- RPC para métricas agregadas financieras y de embudo del rol Visor
-- Evita transferir miles de filas completas con datos salariales y PII
-- ====================================================================

CREATE OR REPLACE FUNCTION get_visor_kpis_financieros()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result json;
BEGIN
  SELECT json_build_object(
    'total_remuneracion', COALESCE(SUM(remuneracion), 0),
    'total_bonos', COALESCE(SUM(
      COALESCE(bono_variable, 0) + 
      COALESCE(bono_movilidad, 0) + 
      COALESCE(bono_bienvenida, 0) + 
      COALESCE(bono_permanencia, 0) + 
      COALESCE(bono_asistencia_perfecta, 0)
    ), 0),
    'con_test_psico', COUNT(*) FILTER (WHERE test_psicologico IS NOT NULL AND TRIM(test_psicologico) != '' AND UPPER(TRIM(test_psicologico)) NOT IN ('PENDIENTE', 'NO', 'FALLIDO')),
    'eval_d0_done', COUNT(*) FILTER (WHERE evaluacion_dia_0 IS NOT NULL AND TRIM(evaluacion_dia_0) != '' AND UPPER(TRIM(evaluacion_dia_0)) NOT IN ('PENDIENTE', 'NO', 'FALLIDO')),
    'eval_d0_pending', COUNT(*) FILTER (WHERE UPPER(TRIM(evaluacion_dia_0)) = 'PENDIENTE')
  ) INTO result
  FROM nominas
  WHERE activo = true;

  RETURN result;
END;
$$;
