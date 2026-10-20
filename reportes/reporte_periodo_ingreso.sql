-- Reporte capacidad por PERIODO DE INGRESO (no periodo de inicio / capa)
-- Criterio: coalesce(periodo_ingreso_op, to_char(fecha_ingreso_op, 'YYYYMM'))
-- Cambia el valor '202610' abajo. Nota: 202810 no tiene filas en BD hoy.

WITH base AS (
  SELECT
    c.codigo,
    c.campana,
    c.segmento,
    c.modalidad,
    c.condicion,
    c.periodo AS periodo_inicio,
    coalesce(nullif(trim(c.periodo_ingreso_op), ''), to_char(c.fecha_ingreso_op, 'YYYYMM')) AS periodo_ingreso,
    c.fecha_registro,
    c.fecha_inicio_ojt,
    c.fecha_ingreso_op,
    c.meta_dia_0,
    c.meta_dia_1,
    c.rq_solicitado,
    c.semana_label,
    c.estado
  FROM capacidad_rys c
  WHERE coalesce(nullif(trim(c.periodo_ingreso_op), ''), to_char(c.fecha_ingreso_op, 'YYYYMM')) = '202610'
),
nom AS (
  SELECT
    upper(trim(grupo_codigo)) AS grupo_codigo,
    upper(trim(campana)) AS campana,
    count(*) AS nomina_q
  FROM nominas
  WHERE coalesce(activo, true) = true
    AND upper(coalesce(estado, '')) NOT IN ('DESASIGNADO')
  GROUP BY 1, 2
),
asis AS (
  SELECT
    upper(trim(coalesce(codigo_grupo, grupo))) AS grupo_codigo,
    upper(trim(campana)) AS campana,
    count(DISTINCT documento) FILTER (
      WHERE upper(coalesce(sigla, '')) IN ('A', 'ASISTIO')
         OR upper(coalesce(estado, '')) = 'ACTIVO'
    ) AS asistencia_q
  FROM consolidado_asistencias
  GROUP BY 1, 2
),
rec AS (
  SELECT
    upper(trim(grupo_codigo)) AS grupo_codigo,
    upper(trim(campana)) AS campana,
    string_agg(DISTINCT coalesce(reclutador_nombre, ''), ', ' ORDER BY coalesce(reclutador_nombre, '')) AS analistas,
    sum(coalesce(meta_dia_1_individual, 0)) AS meta_dia_1_individual
  FROM grupo_reclutadores
  GROUP BY 1, 2
)
SELECT
  b.periodo_ingreso AS "PERIODO EFE",
  b.codigo AS "CODIGO GPE",
  b.fecha_registro AS "FECHA INICIO",
  b.fecha_inicio_ojt AS "FECHA FIN CA",
  b.segmento AS "SEGMENTO",
  b.campana AS "CAMPAÑA",
  b.modalidad AS "MODALIDAD",
  b.condicion AS "TIPO DE REC",
  coalesce(r.analistas, '') AS "ANALISTA / R",
  b.meta_dia_1 AS "META DIA 1 G",
  coalesce(n.nomina_q, 0) AS "NOMINA",
  coalesce(r.meta_dia_1_individual, 0) AS "META DIA 1 INDIVIDUAL",
  coalesce(a.asistencia_q, 0) AS "ASISTENCIA",
  coalesce(n.nomina_q, 0) AS "DOTACION",
  b.rq_solicitado AS "RQ OP"
FROM base b
LEFT JOIN nom n
  ON n.grupo_codigo = upper(trim(b.codigo)) AND n.campana = upper(trim(b.campana))
LEFT JOIN asis a
  ON a.grupo_codigo = upper(trim(b.codigo)) AND a.campana = upper(trim(b.campana))
LEFT JOIN rec r
  ON r.grupo_codigo = upper(trim(b.codigo)) AND r.campana = upper(trim(b.campana))
ORDER BY b.segmento, b.campana, b.codigo;
