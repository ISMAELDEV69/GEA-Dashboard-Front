import { executeSql } from './sql_runner.js'

async function runAudit() {
  const sql = `
    WITH nomina_grupo AS (
        SELECT 
            COUNT(*) AS total_nomina,
            COUNT(CASE WHEN UPPER(TRIM(dia_0)) = 'ASISTIO' THEN 1 END) AS asistio_dia_0,
            COUNT(CASE WHEN UPPER(TRIM(dia_1)) = 'ASISTIO' THEN 1 END) AS asistio_dia_1
        FROM nominas
        WHERE campana = 'RETENCIONES FIJA INBOUND'
          AND grupo_codigo = 'GPE-2026009'
    ),
    ultimos_estados AS (
        SELECT DISTINCT ON (documento)
            documento, estado, motivo_baja, sigla, fecha_registro_asistencia
        FROM consolidado_asistencias
        WHERE campana = 'RETENCIONES FIJA INBOUND'
          AND codigo_grupo = 'GPE-2026009'
        ORDER BY documento, fecha_registro_asistencia DESC
    ),
    metricas_asistencia AS (
        SELECT 
            COUNT(CASE WHEN UPPER(TRIM(sigla)) = 'I-OP' THEN 1 END) AS ingresos_iop,
            COUNT(CASE WHEN UPPER(TRIM(estado)) = 'ACTIVO' AND COALESCE(motivo_baja, '') NOT ILIKE '%BAJA DIA 1%' THEN 1 END) AS activos_actuales
        FROM ultimos_estados
    )
    SELECT 
        'GPE-2026009' AS grupo,
        'RETENCIONES FIJA INBOUND' AS campana,
        n.total_nomina,
        n.asistio_dia_0,
        n.asistio_dia_1,
        a.ingresos_iop,
        a.activos_actuales,
        (n.asistio_dia_1 - a.activos_actuales) AS desertores,
        CONCAT(ROUND(((n.asistio_dia_1 - a.activos_actuales)::numeric / NULLIF(n.asistio_dia_1, 0)::numeric) * 100, 1), '%') AS pct_desercion,
        CONCAT(ROUND((a.activos_actuales::numeric / NULLIF(n.total_nomina, 0)::numeric) * 100, 1), '%') AS pct_retencion
    FROM nomina_grupo n
    CROSS JOIN metricas_asistencia a;
  `

  const result = await executeSql(sql)
  console.log('✅ Resultado de ejecución SQL directa:')
  console.table(result)
}

runAudit().catch(console.error)
