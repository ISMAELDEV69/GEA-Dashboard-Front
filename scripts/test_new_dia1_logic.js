import { executeSql } from './sql_runner.js'

async function testNewLogic() {
  const sqlNominas = `
    SELECT documento, dia_0, dia_1, status_dia_1
    FROM nominas
    WHERE campana = 'RETENCIONES FIJA INBOUND'
      AND grupo_codigo = 'GPE-2026009';
  `
  const nominas = await executeSql(sqlNominas)

  const sqlAsis = `
    SELECT documento, sigla, motivo_baja, estado, fecha_registro_asistencia
    FROM consolidado_asistencias
    WHERE campana = 'RETENCIONES FIJA INBOUND'
      AND codigo_grupo = 'GPE-2026009';
  `
  const asistencias = await executeSql(sqlAsis)

  const total_nomina = nominas.length
  const asistio_dia0 = nominas.filter(n => String(n.dia_0).toUpperCase().trim() === 'ASISTIO').length
  
  let asistio_dia1 = 0
  for (const n of nominas) {
    if (String(n.dia_1).toUpperCase().trim() === 'ASISTIO') {
      const recs = asistencias.filter(r => r.documento === n.documento)
      const isBajaDia1 = recs.some(r => {
        const m = String(r.motivo_baja || '').toUpperCase()
        const e = String(r.estado || '').toUpperCase()
        return m.includes('BAJA DIA 1') || e.includes('BAJA DIA 1')
      })
      if (!isBajaDia1) {
        asistio_dia1++
      }
    }
  }

  console.log(`Resultado con la nueva lógica:`)
  console.log(`- Total Nómina: ${total_nomina}`)
  console.log(`- Asistió Día 0: ${asistio_dia0}`)
  console.log(`- Asistió Día 1 (Efectivo en Sala): ${asistio_dia1}`)
}

testNewLogic().catch(console.error)
