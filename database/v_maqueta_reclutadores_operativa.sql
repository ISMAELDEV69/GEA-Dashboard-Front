-- Maqueta operativa viva para pagos de reclutadores.
-- Espina: metas_equipos (quién encargó el supervisor + meta grupal/individual por semana)
-- Filtro de corte: capacidad_rys.periodo_ingreso_op
-- Día 1: nominas.dia_1
-- Dotación: I-OP único en consolidado_asistencias por DNI + grupo + campaña
-- Día 1 individual: tal cual metas_equipos.meta_dia_1_individual (no se prorratea).
-- RQ de ingresos: metas_equipos.rq es del GRUPO. Se reparte en enteros entre
-- los reclutadores encargados (6÷2 = 3 y 3). Si no divide exacto, el resto
-- (+1) va a quienes más I-OP/nómina aportaron, para no usar decimales y para
-- que la suma de RQ individuales sea exactamente el RQ del grupo.
-- rq_individual es meta de Día 0, no se usa como RQ OP.

CREATE OR REPLACE FUNCTION public.norm_persona_nombre(p_nombre text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    array_to_string(
      ARRAY(
        SELECT tok
        FROM unnest(
          regexp_split_to_array(
            upper(trim(regexp_replace(coalesce(p_nombre, ''), '\s+', ' ', 'g'))),
            '\s+'
          )
        ) AS tok
        WHERE tok <> ''
          AND tok NOT IN ('DE', 'DEL', 'LA', 'LAS', 'LOS', 'Y')
        ORDER BY tok
      ),
      ' '
    ),
    ''
  );
$$;

DROP VIEW IF EXISTS public.v_maqueta_reclutadores_operativa;

CREATE VIEW public.v_maqueta_reclutadores_operativa
WITH (security_invoker = true) AS
WITH cap AS (
  SELECT
    UPPER(TRIM(codigo)) AS grupo,
    UPPER(TRIM(campana)) AS campana,
    COALESCE(
      NULLIF(TRIM(periodo_ingreso_op), ''),
      TO_CHAR(fecha_ingreso_op, 'YYYYMM')
    ) AS periodo_efectivo,
    COALESCE(NULLIF(TRIM(semana_label), ''), 'SEM ' || semana_trabajo::text) AS semana,
    NULLIF(TRIM(segmento), '') AS segmento,
    NULLIF(TRIM(modalidad), '') AS modalidad,
    fecha_registro,
    fecha_ingreso_op
  FROM public.capacidad_rys
  WHERE NULLIF(TRIM(codigo), '') IS NOT NULL
    AND NULLIF(TRIM(campana), '') IS NOT NULL
),
me AS (
  SELECT
    UPPER(TRIM(grupo)) AS grupo,
    UPPER(TRIM(campana)) AS campana,
    NULLIF(UPPER(TRIM(semana)), '') AS semana,
    TRIM(responsable) AS responsable,
    public.norm_persona_nombre(responsable) AS responsable_norm,
    COALESCE(meta_dia_1_grupal, 0)::integer AS meta_d1_grupal,
    COALESCE(meta_dia_1_individual, 0)::integer AS meta_d1_ind,
    COALESCE(rq, 0)::integer AS rq_grupal
  FROM public.metas_equipos
  WHERE NULLIF(TRIM(responsable), '') IS NOT NULL
    AND public.norm_persona_nombre(responsable) <> ''
    AND UPPER(TRIM(responsable)) NOT IN (
      'ADMIN', 'CAPACITACION', 'RECUPERADO', 'TRASLADO',
      'RECLUTADOR', 'SIN ASIGNAR', 'SIN NOMINA', 'SIN NÓMINA', 'FORMADOR', 'REASIGNADO'
    )
),
nom AS (
  SELECT
    UPPER(TRIM(grupo_codigo)) AS grupo,
    UPPER(TRIM(campana)) AS campana,
    public.norm_persona_nombre(reclutador) AS reclutador_norm,
    TRIM(documento) AS documento,
    UPPER(TRIM(COALESCE(dia_1, ''))) AS dia_1
  FROM public.nominas
  WHERE COALESCE(activo, true) = true
    AND NULLIF(TRIM(grupo_codigo), '') IS NOT NULL
    AND NULLIF(TRIM(reclutador), '') IS NOT NULL
    AND NULLIF(TRIM(documento), '') IS NOT NULL
),
iop AS (
  SELECT DISTINCT
    TRIM(documento) AS documento,
    UPPER(TRIM(COALESCE(codigo_grupo, grupo))) AS grupo,
    UPPER(TRIM(campana)) AS campana
  FROM public.consolidado_asistencias
  WHERE UPPER(TRIM(COALESCE(sigla, ''))) IN ('I-OP', 'IOP')
     OR UPPER(TRIM(COALESCE(estado, ''))) IN ('INGRESO A OPERACION', 'I-OP', 'INGRESO')
),
nom_agg AS (
  SELECT
    n.grupo,
    n.campana,
    n.reclutador_norm,
    COUNT(DISTINCT n.documento)::integer AS nomina,
    COUNT(DISTINCT n.documento) FILTER (
      WHERE n.dia_1 IN ('ASISTIO', 'ASISTIÓ', 'SI', 'OK', 'A')
    )::integer AS dia1,
    COUNT(DISTINCT n.documento) FILTER (
      WHERE i.documento IS NOT NULL
    )::integer AS iop
  FROM nom n
  LEFT JOIN iop i
    ON i.documento = n.documento
   AND i.grupo = n.grupo
   AND i.campana = n.campana
  GROUP BY 1, 2, 3
),
me_share AS (
  SELECT
    me.*,
    COALESCE(na.nomina, 0) AS nomina,
    COALESCE(na.dia1, 0) AS dia1,
    COALESCE(na.iop, 0) AS iop,
    COUNT(*) OVER (PARTITION BY me.grupo, me.campana, me.semana) AS n_asig,
    ROW_NUMBER() OVER (
      PARTITION BY me.grupo, me.campana, me.semana
      ORDER BY COALESCE(na.iop, 0) DESC, COALESCE(na.nomina, 0) DESC, me.responsable_norm
    ) AS rn
  FROM me
  LEFT JOIN nom_agg na
    ON na.grupo = me.grupo
   AND na.campana = me.campana
   AND na.reclutador_norm = me.responsable_norm
)
SELECT
  c.periodo_efectivo,
  s.grupo AS codigo_gpe,
  COALESCE(s.semana, c.semana) AS semana,
  c.fecha_registro AS fecha_inicio_capa,
  c.fecha_ingreso_op AS fecha_fin_capa,
  c.segmento,
  s.campana,
  COALESCE(c.modalidad, 'PRESENCIAL') AS modalidad,
  'Asistente de Reclutamiento y Selección'::character varying AS tipo_reclutador,
  s.responsable AS analista_reclutador,
  s.meta_d1_grupal AS meta_dia_1_grupal,
  s.nomina,
  s.meta_d1_ind AS meta_dia_1_individual,
  s.meta_d1_ind AS meta_dia_1_nuevo_criterio,
  s.dia1 AS asistencia_dia_1,
  s.iop AS dotacion,
  (
    CASE
      WHEN COALESCE(s.n_asig, 0) <= 0 THEN s.rq_grupal
      ELSE (s.rq_grupal / s.n_asig)
         + CASE WHEN s.rn <= (s.rq_grupal % s.n_asig) THEN 1 ELSE 0 END
    END
  )::integer AS rq_op
FROM me_share s
JOIN cap c
  ON c.grupo = s.grupo
 AND c.campana = s.campana;

GRANT SELECT ON public.v_maqueta_reclutadores_operativa TO authenticated;

CREATE OR REPLACE FUNCTION public.refresh_maqueta_reclutadores_base(p_periodo text)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_periodo text := regexp_replace(coalesce(p_periodo, ''), '\D', '', 'g');
  v_rows integer := 0;
BEGIN
  IF length(v_periodo) < 6 THEN
    RAISE EXCEPTION 'Periodo inválido: %', p_periodo;
  END IF;
  v_periodo := substr(v_periodo, 1, 6);

  PERFORM pg_advisory_xact_lock(hashtext('refresh_maqueta_reclutadores_base'));

  DELETE FROM public.maqueta_reclutadores_base
  WHERE periodo_efectivo = v_periodo;

  INSERT INTO public.maqueta_reclutadores_base (
    periodo_efectivo, codigo_gpe, semana, fecha_inicio_capa, fecha_fin_capa,
    segmento, campana, modalidad, tipo_reclutador, analista_reclutador,
    meta_dia_1_grupal, nomina, meta_dia_1_individual, meta_dia_1_nuevo_criterio,
    asistencia_dia_1, dotacion, rq_op
  )
  SELECT
    periodo_efectivo, codigo_gpe, semana, fecha_inicio_capa, fecha_fin_capa,
    segmento, campana, modalidad, tipo_reclutador, analista_reclutador,
    meta_dia_1_grupal, nomina, meta_dia_1_individual, meta_dia_1_nuevo_criterio,
    asistencia_dia_1, dotacion, rq_op
  FROM public.v_maqueta_reclutadores_operativa
  WHERE periodo_efectivo = v_periodo;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows;
END;
$$;

GRANT EXECUTE ON FUNCTION public.refresh_maqueta_reclutadores_base(text) TO authenticated;

NOTIFY pgrst, 'reload schema';
