import { executeSql } from './sql_runner.js'

async function inspectGpe009Nomina() {
  const sql = `
    SELECT 
      n.documento,
      CONCAT(n.apellido_paterno, ' ', n.apellido_materno, ' ', n.nombres) AS postulante,
      n.dia_0,
      n.dia_1,
      n.status_dia_1,
      ca.sigla_d1,
      ca.motivo_baja_d1,
      ca.estado_d1
    FROM nominas n
    LEFT JOIN (
      SELECT 
        documento,
        sigla AS sigla_d1,
        motivo_baja AS motivo_baja_d1,
        estado AS estado_d1
      FROM consolidado_asistencias
      WHERE campana = 'RETENCIONES FIJA INBOUND'
        AND codigo_grupo = 'GPE-2026009'
        AND fecha_registro_asistencia = '13/7/2026'
    ) ca ON n.documento = ca.documento
    WHERE n.campana = 'RETENCIONES FIJA INBOUND'
      AND n.grupo_codigo = 'GPE-2026009'
    ORDER BY n.dia_0 DESC, n.dia_1 DESC, n.apellido_paterno;
  `

  const result = await executeSql(sql)
  console.log('📋 AUDITORÍA NOMINA VS ASISTENCIA DÍA 1 (13/07/2026):')
  console.table(result)
}

inspectGpe009Nomina().catch(console.error)
