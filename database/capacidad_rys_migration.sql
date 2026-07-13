-- CAPACIDAD_RYS v.Final — campos de planificación por grupo de capacitación
-- Fuente: https://docs.google.com/spreadsheets/d/e/2PACX-1vR5cIgvA11b8Xczt-fwGREZ9XPWMXxPq5OTpNMXgaiU3jEMWD4FwVjAdFpDX5V3fI5lXEQST8S_vI70/pubhtml

ALTER TABLE grupos_capacitacion
  ADD COLUMN IF NOT EXISTS area_traslado        VARCHAR(100),
  ADD COLUMN IF NOT EXISTS semana_label         VARCHAR(20),
  ADD COLUMN IF NOT EXISTS condicion             VARCHAR(50),
  ADD COLUMN IF NOT EXISTS estado_grupo         VARCHAR(30) DEFAULT 'PLANIFICADO',
  ADD COLUMN IF NOT EXISTS periodo_capacitacion  VARCHAR(10),
  ADD COLUMN IF NOT EXISTS rango_horario        VARCHAR(50),
  ADD COLUMN IF NOT EXISTS extension_teoria     VARCHAR(50),
  ADD COLUMN IF NOT EXISTS fecha_inicio_ojt     DATE,
  ADD COLUMN IF NOT EXISTS extension_ojt        VARCHAR(50),
  ADD COLUMN IF NOT EXISTS fecha_ingreso_op     DATE,
  ADD COLUMN IF NOT EXISTS rq_solicitado        NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS rq_ftes_solicitado   NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS meta_dia_0           INTEGER,
  ADD COLUMN IF NOT EXISTS meta_dia_1           INTEGER,
  ADD COLUMN IF NOT EXISTS periodo_ingreso_op   VARCHAR(10),
  ADD COLUMN IF NOT EXISTS periodo_rys          VARCHAR(20);

CREATE INDEX IF NOT EXISTS idx_grupos_periodo ON grupos_capacitacion(periodo_capacitacion);
CREATE INDEX IF NOT EXISTS idx_grupos_estado ON grupos_capacitacion(estado_grupo);

-- Vista plana = estructura Excel CAPACIDAD_RYS
CREATE OR REPLACE VIEW v_capacidad_rys AS
SELECT
  c.segmento,
  g.area_traslado,
  c.nombre                    AS campana,
  g.codigo                    AS grupo_capacitacion,
  COALESCE(g.semana_label, 'SEM ' || g.semana_trabajo::TEXT) AS semana,
  g.modalidad::TEXT           AS modalidad,
  g.condicion                 AS condicion_laboral,
  g.estado_grupo              AS estado,
  g.fecha_registro            AS fecha_inicio,
  g.periodo_capacitacion      AS periodo,
  g.rango_horario,
  g.extension_teoria,
  g.fecha_inicio_ojt,
  g.extension_ojt,
  g.fecha_ingreso_op          AS fecha_ingreso_op,
  g.rq_solicitado,
  g.rq_ftes_solicitado,
  g.meta_dia_0,
  g.meta_dia_1,
  g.periodo_ingreso_op,
  g.periodo_rys,
  g.semana_trabajo,
  g.formador_documento,
  g.campana_id,
  g.created_at
FROM grupos_capacitacion g
JOIN campanas c ON c.id = g.campana_id
ORDER BY g.periodo_capacitacion DESC NULLS LAST, g.codigo;
