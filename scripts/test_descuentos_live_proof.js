import { 
  getDescuentosSetGlobal, 
  fetchMotivosBajasData, 
  fetchDashboardData, 
  calculateMetricasResumenCapacitacionFast, 
  fetchAllAsistenciasBajas 
} from '../src/lib/dataService.js'

async function liveProof() {
  console.log('========================================================================')
  console.log('PRUEBA EN VIVO: RASTREO DE UN CASO REAL APROBADO EN LOS DASHBOARDS')
  console.log('Caso: DNI 47049464 | LIZ MADELEYNE MEJIA HUERTA | GPE-2026040 | CLARO POSTPAGO')
  console.log('========================================================================')

  const targetDoc = '47049464'
  const targetGroup = 'GPE-2026040'
  const targetCamp = 'CLARO POSTPAGO'

  // 1. Verificar si getDescuentosSetGlobal contiene la key
  const descSet = await getDescuentosSetGlobal()
  console.log(`Total keys en Set de Descuentos Globales: ${descSet.size}`)
  
  const expectedKey = `${targetDoc}|CLAROPOSTPAGO|2026040`
  const hasKey = descSet.has(expectedKey)
  console.log(`¿El Set Global contiene '${expectedKey}'?:`, hasKey ? '✅ SÍ (Aprobado)' : '❌ NO')

  // 2. Probar fetchMotivosBajasData (MotivosBajasBI.jsx)
  console.log('\n--- 1. Evaluando MotivosBajasBI.jsx (fetchMotivosBajasData) ---')
  const mbData = await fetchMotivosBajasData()
  const foundInMB = (mbData.consolidado || []).filter(r => String(r.documento).trim() === targetDoc)
  console.log(`Registros de ${targetDoc} en dataset de MotivosBajasBI: ${foundInMB.length}`)
  console.log(foundInMB.length === 0 ? '✅ EXCLUIDO 100% de Motivos de Bajas (No cuenta como baja ni afecta formador)' : '❌ ERROR: Aparece en Motivos de Bajas')

  // 3. Probar fetchDashboardData (ConsolidadoPowerBI.jsx)
  console.log('\n--- 2. Evaluando ConsolidadoPowerBI.jsx (fetchDashboardData) ---')
  const cpData = await fetchDashboardData()
  const foundInCP = (cpData.consolidado || []).filter(r => String(r.documento).trim() === targetDoc)
  console.log(`Registros de ${targetDoc} en dataset de ConsolidadoPowerBI: ${foundInCP.length}`)
  console.log(foundInCP.length === 0 ? '✅ EXCLUIDO 100% de Consolidado PowerBI (No cuenta en desertores)' : '❌ ERROR: Aparece en Consolidado PowerBI')

  // 4. Probar fetchAllAsistenciasBajas (AttendanceBI.jsx)
  console.log('\n--- 3. Evaluando AttendanceBI.jsx (fetchAllAsistenciasBajas) ---')
  const atData = await fetchAllAsistenciasBajas()
  const foundInAT = (atData || []).filter(r => String(r.documento).trim() === targetDoc)
  console.log(`Registros de ${targetDoc} en dataset de AttendanceBI Bajas: ${foundInAT.length}`)
  console.log(foundInAT.length === 0 ? '✅ EXCLUIDO 100% de AttendanceBI Bajas' : '❌ ERROR: Aparece en AttendanceBI')

  // 5. Probar calculateMetricasResumenCapacitacionFast (ResumenCapacitacion.jsx)
  console.log('\n--- 4. Evaluando ResumenCapacitacion.jsx (calculateMetricasResumenCapacitacionFast) ---')
  const testGrupos = [{ codigo: targetGroup, campana: targetCamp, periodo: '202606' }]
  const testNominas = [{ documento: targetDoc, campana: targetCamp, grupo_codigo: targetGroup, dia_0: 'ASISTIO', dia_1: 'ASISTIO' }]
  const testAsis = [{ documento: targetDoc, campana: targetCamp, codigo_grupo: targetGroup, sigla: 'B', motivo_baja: 'FAMILIAR', estado: 'CESADO' }]
  
  const resMetrics = await calculateMetricasResumenCapacitacionFast(testGrupos, testNominas, testAsis)
  console.log('Resultado cálculo para nómina con descuento:', resMetrics[0])
  console.log(`total_nomina: ${resMetrics[0].total_nomina}, asistio_dia1: ${resMetrics[0].asistio_dia1}`)
  console.log(resMetrics[0].total_nomina === 0 ? '✅ EXCLUIDO 100% de Nómina y Deserción en Resumen Capacitación' : '❌ ERROR: No fue excluido')
}

liveProof()
