-- ============================================================================
-- VISTA OFICIAL DE RENDIMIENTO DE CAPACITACIÓN POR COHORTE
-- Nombre: v_resumen_capacitacion_cohortes
-- Propósito: Pre-calcular métricas de dotación, conversión, deserción e I-OP
--           directamente en PostgreSQL para acelerar el Dashboard de >5s a <100ms.
-- ============================================================================

-- 1. Función inmutable para normalizar segmentos oficiales
CREATE OR REPLACE FUNCTION normalize_segmento_oficial(raw_seg text, campana text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
SELECT CASE 
  -- 1. CLARO CHILE
  WHEN UPPER(COALESCE(campana, '')) LIKE '%TUVES%' 
    OR UPPER(COALESCE(campana, '')) LIKE '%CHILE%' 
    OR UPPER(COALESCE(raw_seg, '')) = 'CLARO CHILE'
    OR UPPER(COALESCE(raw_seg, '')) LIKE '%CHILE%' THEN 'CLARO CHILE'

  -- 2. LIPIGAS
  WHEN UPPER(COALESCE(campana, '')) LIKE '%LIPIGAS%' 
    OR UPPER(COALESCE(campana, '')) LIKE '%LIMAGAS%' 
    OR UPPER(COALESCE(raw_seg, '')) = 'LIPIGAS'
    OR UPPER(COALESCE(raw_seg, '')) LIKE '%LIPIGAS%' THEN 'LIPIGAS'

  -- 3. EXCEPCIÓN: Claro Postpago pertenece a CLARO PERU
  WHEN UPPER(COALESCE(campana, '')) LIKE '%CLARO POSTPAGO%' THEN 'CLARO PERU'

  -- 4. EXCEPCIÓN: Retenciones Fija pertenece a CLARO PERU
  WHEN UPPER(COALESCE(campana, '')) LIKE '%RETENCIONES FIJA%' 
    OR UPPER(COALESCE(campana, '')) LIKE '%RETENCION FIJA%' 
    OR UPPER(COALESCE(campana, '')) LIKE '%FIJA INBOUND%' THEN 'CLARO PERU'

  -- 5. Subtipos de RETENCIONES
  WHEN UPPER(COALESCE(raw_seg, '')) = 'CLARO PERU RETENCIONES'
    OR UPPER(COALESCE(raw_seg, '')) LIKE '%RETENCION%'
    OR UPPER(COALESCE(campana, '')) LIKE '%RETENCION%'
    OR UPPER(COALESCE(campana, '')) LIKE '%CONTACTADOS%'
    OR UPPER(COALESCE(campana, '')) LIKE '%CONTENCI%'
    OR UPPER(COALESCE(campana, '')) LIKE '%DESCUENTO%'
    OR UPPER(COALESCE(campana, '')) LIKE '%BABYSTING%'
    OR UPPER(COALESCE(campana, '')) LIKE '%CONSULTA PREVIA%'
    OR UPPER(COALESCE(campana, '')) LIKE '%MI CLARO%'
    OR UPPER(COALESCE(campana, '')) LIKE '%ENCUESTAS IZO%'
    OR UPPER(COALESCE(campana, '')) LIKE '%CANAL DIGITAL%'
    OR UPPER(COALESCE(campana, '')) LIKE '%WSP INBOUND%' THEN 'CLARO PERU RETENCIONES'

  -- 6. Subtipos de OUT
  WHEN UPPER(COALESCE(raw_seg, '')) = 'CLARO PERU OUT'
    OR UPPER(COALESCE(raw_seg, '')) LIKE '%OUT%'
    OR UPPER(COALESCE(campana, '')) LIKE '%OUT%'
    OR UPPER(COALESCE(campana, '')) LIKE '%PREVENTIVA%'
    OR UPPER(COALESCE(campana, '')) LIKE '%PORTA OUT%'
    OR UPPER(COALESCE(campana, '')) LIKE '%RENO%'
    OR UPPER(COALESCE(campana, '')) LIKE '%VENTAS%'
    OR UPPER(COALESCE(campana, '')) LIKE '%CROSS%'
    OR UPPER(COALESCE(campana, '')) LIKE '%MIGRACIONES%'
    OR UPPER(COALESCE(campana, '')) LIKE '%UPGRADE%'
    OR UPPER(COALESCE(campana, '')) LIKE '%VENTA%' THEN 'CLARO PERU OUT'

  -- 7. CLARO PERU
  ELSE 'CLARO PERU'
END;
$$;

-- 2. Función inmutable para parsear fechas de asistencia en formato DD/MM/YYYY o YYYY-MM-DD
CREATE OR REPLACE FUNCTION parse_fecha_asistencia(raw_date text)
RETURNS date LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  clean_str text := TRIM(raw_date);
  parts text[];
BEGIN
  IF clean_str IS NULL OR clean_str = '' OR clean_str = '-' THEN
    RETURN NULL;
  END IF;

  IF clean_str ~ '^\d{4}-\d{2}-\d{2}' THEN
    RETURN SUBSTRING(clean_str FROM 1 FOR 10)::date;
  END IF;

  parts := REGEXP_SPLIT_TO_ARRAY(clean_str, '[\/\-]');
  IF ARRAY_LENGTH(parts, 1) = 3 AND LENGTH(parts[3]) = 4 THEN
    RETURN TO_DATE(LPAD(parts[1], 2, '0') || '/' || LPAD(parts[2], 2, '0') || '/' || parts[3], 'DD/MM/YYYY');
  END IF;

  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$;

-- 3. Índices de soporte de alto rendimiento (si no existen)
CREATE INDEX IF NOT EXISTS idx_asistencias_grupo_campana_sigla 
  ON public.consolidado_asistencias (codigo_grupo, campana, sigla);

CREATE INDEX IF NOT EXISTS idx_nominas_grupo_campana_activo 
  ON public.nominas (grupo_codigo, campana, activo);

-- 4. Vista Principal: v_resumen_capacitacion_cohortes
DROP VIEW IF EXISTS public.v_resumen_capacitacion_cohortes CASCADE;
CREATE OR REPLACE VIEW public.v_resumen_capacitacion_cohortes AS
WITH cohortes_base AS (
  SELECT 
    c.codigo AS grupo_codigo,
    c.campana,
    normalize_segmento_oficial(c.segmento, c.campana) AS segmento,
    COALESCE(c.periodo_ingreso_op, TO_CHAR(c.fecha_ingreso_op, 'YYYYMM'))::character varying(100) AS periodo,
    COALESCE(c.periodo_ingreso_op, TO_CHAR(c.fecha_ingreso_op, 'YYYYMM')) AS periodo_ingreso_op,
    c.periodo AS periodo_capacitacion,
    COALESCE(c.semana_label, CASE WHEN c.semana_trabajo IS NOT NULL THEN 'SEM ' || c.semana_trabajo ELSE '' END) AS semana,
    COALESCE(c.modalidad, 'PRESENCIAL') AS modalidad,
    c.sede,
    c.estado,
    c.area_traslado,
    c.fecha_registro,
    c.fecha_inicio_ojt,
    c.fecha_ingreso_op,
    -- Meta RQ FTEs: Solo se consideran las áreas RECLUTAMIENTO y RECUPERADO
    CASE 
      WHEN UPPER(TRIM(COALESCE(c.area_traslado, ''))) IN ('RECLUTAMIENTO', 'RECUPERADO')
        OR UPPER(TRIM(COALESCE(c.area_traslado, ''))) LIKE '%RECUPER%'
        OR UPPER(TRIM(COALESCE(c.area_traslado, ''))) LIKE '%RECLUTA%'
      THEN COALESCE(c.rq_ftes_solicitado::numeric, c.rq_solicitado::numeric, 0)
      ELSE 0
    END AS rq_solicitado,
    COALESCE(c.rq_ftes_solicitado::numeric, c.rq_solicitado::numeric, 0) AS rq_ftes_original,
    COALESCE(c.meta_dia_0::numeric, 0) AS meta_dia_0,
    COALESCE(c.meta_dia_1::numeric, 0) AS meta_dia_1,
    COALESCE(ef.datos_completos, c.formador_documento, 'SIN ASIGNAR') AS formador
  FROM public.capacidad_rys c
  LEFT JOIN public.equipo_formacion ef ON ef.documento = c.formador_documento
  WHERE c.periodo_ingreso_op >= '202608'
    AND UPPER(COALESCE(c.estado, '')) NOT LIKE '%CANCEL%'
    AND UPPER(COALESCE(c.estado, '')) NOT LIKE '%ANULAD%'
    AND UPPER(COALESCE(c.estado, '')) NOT LIKE '%INACT%'
),
nominas_agg AS (
  SELECT 
    n.grupo_codigo,
    n.campana,
    COUNT(DISTINCT n.documento) AS total_nomina,
    COUNT(DISTINCT CASE WHEN UPPER(COALESCE(n.dia_0, '')) = 'ASISTIO' THEN n.documento END) AS nom_asistio_dia0,
    COUNT(DISTINCT CASE WHEN UPPER(COALESCE(n.dia_1, '')) = 'ASISTIO' THEN n.documento END) AS nom_asistio_dia1
  FROM public.nominas n
  WHERE n.activo = true
  GROUP BY n.grupo_codigo, n.campana
),
asistencias_agg AS (
  SELECT 
    ca.codigo_grupo,
    ca.campana,
    COUNT(DISTINCT CASE 
      WHEN ca.sigla IN ('A', 'FJ', 'I-OP', 'CAPACITACION', 'OJT') THEN ca.documento 
    END) AS asis_dia1,
    COUNT(DISTINCT CASE 
      WHEN ca.sigla = 'B' 
        AND UPPER(COALESCE(ca.estado, '')) NOT LIKE '%DESC%'
        AND UPPER(COALESCE(ca.motivo_baja, '')) NOT LIKE '%DESC%'
        AND (cb.fecha_inicio_ojt IS NULL OR parse_fecha_asistencia(ca.fecha_registro_asistencia) < cb.fecha_inicio_ojt)
      THEN ca.documento 
    END) AS desertores_ct,
    COUNT(DISTINCT CASE 
      WHEN ca.sigla = 'B' 
        AND UPPER(COALESCE(ca.estado, '')) NOT LIKE '%DESC%'
        AND UPPER(COALESCE(ca.motivo_baja, '')) NOT LIKE '%DESC%'
        AND cb.fecha_inicio_ojt IS NOT NULL 
        AND parse_fecha_asistencia(ca.fecha_registro_asistencia) >= cb.fecha_inicio_ojt
      THEN ca.documento 
    END) AS desertores_ojt,
    COUNT(DISTINCT CASE 
      WHEN ca.sigla IN ('A', 'OJT') 
        AND cb.fecha_inicio_ojt IS NOT NULL 
        AND parse_fecha_asistencia(ca.fecha_registro_asistencia) >= cb.fecha_inicio_ojt
        AND NOT EXISTS (
          SELECT 1 FROM public.consolidado_asistencias sub 
          WHERE sub.codigo_grupo = ca.codigo_grupo 
            AND sub.campana = ca.campana 
            AND sub.documento = ca.documento 
            AND sub.sigla IN ('B', 'I-OP')
        )
      THEN ca.documento 
    END) AS activos_ojt
  FROM public.consolidado_asistencias ca
  JOIN cohortes_base cb ON cb.grupo_codigo = ca.codigo_grupo AND cb.campana = ca.campana
  GROUP BY ca.codigo_grupo, ca.campana
),
iop_personas AS (
  SELECT 
    ca.codigo_grupo,
    ca.campana,
    ca.documento,
    MAX(CASE WHEN UPPER(COALESCE(ca.condicion_laboral, '')) LIKE '%PART%' THEN 0.5 ELSE 1.0 END) AS fte
  FROM public.consolidado_asistencias ca
  JOIN cohortes_base cb ON cb.grupo_codigo = ca.codigo_grupo AND cb.campana = ca.campana
  WHERE ca.sigla = 'I-OP' OR UPPER(ca.estado) IN ('INGRESO A OPERACION', 'I-OP')
  GROUP BY ca.codigo_grupo, ca.campana, ca.documento
),
iop_agg AS (
  SELECT 
    codigo_grupo,
    campana,
    COUNT(DISTINCT documento) AS ingresos_iop,
    SUM(fte) AS ingresos_iop_ftes
  FROM iop_personas
  GROUP BY codigo_grupo, campana
)
SELECT 
  cb.grupo_codigo,
  cb.campana,
  cb.segmento,
  cb.periodo,
  cb.periodo_ingreso_op,
  cb.periodo_capacitacion,
  cb.semana,
  cb.modalidad,
  cb.sede,
  cb.estado,
  cb.area_traslado,
  cb.formador,
  cb.fecha_registro,
  cb.fecha_inicio_ojt,
  cb.fecha_ingreso_op,
  cb.rq_solicitado,
  cb.rq_ftes_original,
  cb.meta_dia_0,
  cb.meta_dia_1,
  COALESCE(na.total_nomina, 0) AS total_nomina,
  COALESCE(na.nom_asistio_dia0, 0) AS asistio_dia0,
  GREATEST(COALESCE(na.nom_asistio_dia1, 0), COALESCE(aa.asis_dia1, 0)) AS asistio_dia1,
  COALESCE(aa.activos_ojt, 0) AS activos_ojt,
  COALESCE(aa.desertores_ct, 0) AS desertores_ct,
  COALESCE(aa.desertores_ojt, 0) AS desertores_ojt,
  COALESCE(ia.ingresos_iop, 0) AS ingresos_iop,
  COALESCE(ia.ingresos_iop_ftes, 0) AS ingresos_iop_ftes,
  CASE 
    WHEN cb.rq_solicitado > 0 THEN 
      ROUND((COALESCE(ia.ingresos_iop_ftes, 0) / cb.rq_solicitado) * 100, 2)
    ELSE 0 
  END AS pct_cumplimiento
FROM cohortes_base cb
LEFT JOIN nominas_agg na ON na.grupo_codigo = cb.grupo_codigo AND na.campana = cb.campana
LEFT JOIN asistencias_agg aa ON aa.codigo_grupo = cb.grupo_codigo AND aa.campana = cb.campana
LEFT JOIN iop_agg ia ON ia.codigo_grupo = cb.grupo_codigo AND ia.campana = cb.campana;

-- 5. Permisos de lectura en Supabase
GRANT SELECT ON public.v_resumen_capacitacion_cohortes TO authenticated, anon, service_role;

