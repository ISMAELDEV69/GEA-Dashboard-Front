-- KPI reclutadores consolidado
-- Grano: periodo + semana + segmento + campaña + grupo + responsable
-- Pedido (RQ / metas / RQ FTES) se parte entre reclutadores de esa nómina.
-- Ingresos (nómina, D0, D1, I-OP) son lo que trajo cada uno.
-- Tope = menor(trajo, pedido partido). Formato se deja nulo por ahora.

CREATE TABLE IF NOT EXISTS public.kpi_reclutadores_consolidado (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  anio integer NOT NULL,
  periodo_reclutado text NOT NULL,
  periodo_efectivo text,
  semana integer NOT NULL,
  grupo_g text NOT NULL,
  segmento text NOT NULL,
  campana text NOT NULL,
  modalidad text,
  fecha_inicio date,
  fecha_ingreso_op date,
  rq numeric NOT NULL DEFAULT 0,
  rq_individual numeric NOT NULL DEFAULT 0,
  formato text,
  responsable text NOT NULL,
  estado_grupo text,
  nomina integer NOT NULL DEFAULT 0,
  meta_dia_1_individual numeric NOT NULL DEFAULT 0,
  dia_0 integer NOT NULL DEFAULT 0,
  dia_1 integer NOT NULL DEFAULT 0,
  meta_dia_1_campana numeric NOT NULL DEFAULT 0,
  dotacion_ftes numeric NOT NULL DEFAULT 0,
  dotacion_q integer NOT NULL DEFAULT 0,
  rq_asignado numeric NOT NULL DEFAULT 0,
  dia_1_tope numeric NOT NULL DEFAULT 0,
  dotacion_q_tope numeric NOT NULL DEFAULT 0,
  dotacion_ftes_tope numeric NOT NULL DEFAULT 0,
  rq_ftes numeric NOT NULL DEFAULT 0,
  meta_dia_0_individual numeric NOT NULL DEFAULT 0,
  n_reclutadores integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT kpi_reclutadores_llave UNIQUE (
    periodo_reclutado, semana, segmento, campana, grupo_g, responsable
  )
);

CREATE INDEX IF NOT EXISTS kpi_reclutadores_semana_idx
  ON public.kpi_reclutadores_consolidado (semana, segmento, campana);
CREATE INDEX IF NOT EXISTS kpi_reclutadores_responsable_idx
  ON public.kpi_reclutadores_consolidado (responsable);

ALTER TABLE public.kpi_reclutadores_consolidado ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS kpi_reclutadores_select ON public.kpi_reclutadores_consolidado;
CREATE POLICY kpi_reclutadores_select
  ON public.kpi_reclutadores_consolidado
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS kpi_reclutadores_write ON public.kpi_reclutadores_consolidado;
CREATE POLICY kpi_reclutadores_write
  ON public.kpi_reclutadores_consolidado
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.kpi_reclutadores_consolidado TO authenticated;

CREATE OR REPLACE FUNCTION public.refresh_kpi_reclutadores(p_semana_min integer DEFAULT 36)
RETURNS integer
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_rows integer := 0;
BEGIN
  DELETE FROM public.kpi_reclutadores_consolidado
  WHERE semana >= p_semana_min;

  WITH cap AS (
    SELECT
      LEFT(periodo, 4)::integer AS anio,
      TRIM(periodo) AS periodo_reclutado,
      COALESCE(
        NULLIF(TRIM(periodo_ingreso_op), ''),
        TO_CHAR(fecha_ingreso_op, 'YYYYMM')
      ) AS periodo_efectivo,
      semana_trabajo AS semana,
      UPPER(TRIM(codigo)) AS grupo_g,
      UPPER(TRIM(segmento)) AS segmento,
      UPPER(TRIM(campana)) AS campana,
      NULLIF(TRIM(modalidad), '') AS modalidad,
      fecha_registro AS fecha_inicio,
      fecha_ingreso_op,
      COALESCE(rq_solicitado, 0)::numeric AS rq,
      COALESCE(rq_ftes_solicitado, 0)::numeric AS rq_ftes,
      COALESCE(meta_dia_0, 0)::numeric AS meta_d0,
      COALESCE(meta_dia_1, 0)::numeric AS meta_d1,
      NULLIF(TRIM(estado), '') AS estado_grupo
    FROM public.capacidad_rys
    WHERE semana_trabajo >= p_semana_min
  ),
  iop AS (
    SELECT DISTINCT ON (
      TRIM(documento),
      UPPER(TRIM(COALESCE(codigo_grupo, grupo))),
      UPPER(TRIM(campana))
    )
      TRIM(documento) AS documento,
      UPPER(TRIM(COALESCE(codigo_grupo, grupo))) AS grupo_g,
      UPPER(TRIM(campana)) AS campana,
      UPPER(TRIM(COALESCE(condicion_laboral, ''))) AS condicion
    FROM public.consolidado_asistencias
    WHERE UPPER(TRIM(COALESCE(sigla, ''))) IN ('I-OP', 'IOP')
       OR UPPER(TRIM(COALESCE(estado, ''))) IN ('INGRESO A OPERACION', 'I-OP', 'INGRESO')
    ORDER BY
      TRIM(documento),
      UPPER(TRIM(COALESCE(codigo_grupo, grupo))),
      UPPER(TRIM(campana))
  ),
  nom AS (
    SELECT
      UPPER(TRIM(grupo_codigo)) AS grupo_g,
      UPPER(TRIM(campana)) AS campana,
      TRIM(UPPER(reclutador)) AS responsable,
      TRIM(documento) AS documento,
      UPPER(TRIM(COALESCE(dia_0, ''))) AS dia_0,
      UPPER(TRIM(COALESCE(dia_1, ''))) AS dia_1,
      UPPER(TRIM(COALESCE(condicion, ''))) AS condicion
    FROM public.nominas
    WHERE COALESCE(activo, true) = true
      AND NULLIF(TRIM(grupo_codigo), '') IS NOT NULL
      AND NULLIF(TRIM(reclutador), '') IS NOT NULL
  ),
  flag AS (
    SELECT
      n.grupo_g,
      n.campana,
      n.responsable,
      1 AS nomina,
      CASE WHEN n.dia_0 IN ('ASISTIO', 'ASISTIÓ', 'SI') THEN 1 ELSE 0 END AS d0,
      CASE WHEN n.dia_1 IN ('ASISTIO', 'ASISTIÓ', 'SI', 'OK') THEN 1 ELSE 0 END AS d1,
      CASE WHEN i.documento IS NOT NULL THEN 1 ELSE 0 END AS iop_q,
      CASE
        WHEN i.documento IS NOT NULL THEN
          CASE
            WHEN COALESCE(NULLIF(i.condicion, ''), n.condicion) LIKE '%PART%' THEN 0.5
            ELSE 1.0
          END
        ELSE 0
      END AS iop_ftes
    FROM nom n
    LEFT JOIN iop i
      ON i.documento = n.documento
     AND i.grupo_g = n.grupo_g
     AND i.campana = n.campana
  ),
  agg AS (
    SELECT
      grupo_g,
      campana,
      responsable,
      SUM(nomina)::integer AS nomina,
      SUM(d0)::integer AS dia_0,
      SUM(d1)::integer AS dia_1,
      SUM(iop_q)::integer AS dotacion_q,
      SUM(iop_ftes)::numeric AS dotacion_ftes
    FROM flag
    GROUP BY 1, 2, 3
  ),
  ncnt AS (
    SELECT grupo_g, campana, COUNT(*)::integer AS n_reclutadores
    FROM agg
    GROUP BY 1, 2
  )
  INSERT INTO public.kpi_reclutadores_consolidado (
    anio, periodo_reclutado, periodo_efectivo, semana, grupo_g, segmento, campana,
    modalidad, fecha_inicio, fecha_ingreso_op, rq, rq_individual, formato,
    responsable, estado_grupo, nomina, meta_dia_1_individual, dia_0, dia_1,
    meta_dia_1_campana, dotacion_ftes, dotacion_q, rq_asignado, dia_1_tope,
    dotacion_q_tope, dotacion_ftes_tope, rq_ftes, meta_dia_0_individual,
    n_reclutadores, updated_at
  )
  SELECT
    c.anio,
    c.periodo_reclutado,
    c.periodo_efectivo,
    c.semana,
    c.grupo_g,
    c.segmento,
    c.campana,
    c.modalidad,
    c.fecha_inicio,
    c.fecha_ingreso_op,
    c.rq,
    CASE WHEN COALESCE(k.n_reclutadores, 0) > 0 THEN ROUND(c.rq / k.n_reclutadores, 2) ELSE 0 END,
    NULL,
    COALESCE(a.responsable, 'SIN NOMINA'),
    c.estado_grupo,
    COALESCE(a.nomina, 0),
    CASE WHEN COALESCE(k.n_reclutadores, 0) > 0 THEN ROUND(c.meta_d1 / k.n_reclutadores, 2) ELSE 0 END,
    COALESCE(a.dia_0, 0),
    COALESCE(a.dia_1, 0),
    c.meta_d1,
    COALESCE(a.dotacion_ftes, 0),
    COALESCE(a.dotacion_q, 0),
    CASE WHEN COALESCE(k.n_reclutadores, 0) > 0 THEN ROUND(c.rq / k.n_reclutadores, 2) ELSE 0 END,
    CASE
      WHEN COALESCE(k.n_reclutadores, 0) > 0
        THEN LEAST(COALESCE(a.dia_1, 0), ROUND(c.rq / k.n_reclutadores, 2))
      ELSE 0
    END,
    CASE
      WHEN COALESCE(k.n_reclutadores, 0) > 0
        THEN LEAST(COALESCE(a.dotacion_q, 0), ROUND(c.rq / k.n_reclutadores, 2))
      ELSE 0
    END,
    CASE
      WHEN COALESCE(k.n_reclutadores, 0) > 0
        THEN LEAST(COALESCE(a.dotacion_ftes, 0), ROUND(c.rq_ftes / k.n_reclutadores, 2))
      ELSE 0
    END,
    c.rq_ftes,
    CASE WHEN COALESCE(k.n_reclutadores, 0) > 0 THEN ROUND(c.meta_d0 / k.n_reclutadores, 2) ELSE 0 END,
    COALESCE(k.n_reclutadores, 0),
    now()
  FROM cap c
  LEFT JOIN agg a
    ON a.grupo_g = c.grupo_g AND a.campana = c.campana
  LEFT JOIN ncnt k
    ON k.grupo_g = c.grupo_g AND k.campana = c.campana;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows;
END;
$$;

GRANT EXECUTE ON FUNCTION public.refresh_kpi_reclutadores(integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.trg_refresh_kpi_reclutadores()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  PERFORM public.refresh_kpi_reclutadores(36);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_kpi_after_capacidad ON public.capacidad_rys;
CREATE TRIGGER trg_kpi_after_capacidad
  AFTER INSERT OR UPDATE OR DELETE ON public.capacidad_rys
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.trg_refresh_kpi_reclutadores();

DROP TRIGGER IF EXISTS trg_kpi_after_nominas ON public.nominas;
CREATE TRIGGER trg_kpi_after_nominas
  AFTER INSERT OR UPDATE OR DELETE ON public.nominas
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.trg_refresh_kpi_reclutadores();

DROP TRIGGER IF EXISTS trg_kpi_after_consolidado ON public.consolidado_asistencias;
CREATE TRIGGER trg_kpi_after_consolidado
  AFTER INSERT OR UPDATE OR DELETE ON public.consolidado_asistencias
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.trg_refresh_kpi_reclutadores();
