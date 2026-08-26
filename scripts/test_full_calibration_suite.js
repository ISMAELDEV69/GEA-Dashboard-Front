import { executeSql } from './sql_runner.js'

async function testFullSuite() {
  console.log('======================================================================')
  console.log('🧪 SUITE DE PRUEBAS DE CALIBRACIÓN - GRUPO GPE-2026009')
  console.log('======================================================================\n')

  const grupo_codigo = 'GPE-2026009'
  const campana = 'RETENCIONES FIJA INBOUND'

  // 1. Nóminas
  const nominas = await executeSql(`
    SELECT documento, dia_0, dia_1, status_dia_1
    FROM nominas
    WHERE grupo_codigo = '${grupo_codigo}' AND campana = '${campana}';
  `)

  // 2. Asistencias
  const asistencias = await executeSql(`
    SELECT documento, sigla, motivo_baja, estado, fecha_registro_asistencia
    FROM consolidado_asistencias
    WHERE codigo_grupo = '${grupo_codigo}' AND campana = '${campana}'
    ORDER BY created_at ASC;
  `)

  // 3. Descuentos autorizados
  const descuentos = await executeSql(`
    SELECT dni_ce, campana, grupo_cap, procede, autoriza_rys, autoriza_cap
    FROM descuentos
    WHERE (procede ILIKE 'PROCEDE' OR (autoriza_rys ILIKE 'SI' AND (autoriza_cap ILIKE 'SI' OR autoriza_cap IS NULL)));
  `)

  const descSet = new Set(descuentos.map(d => `${d.dni_ce}|${d.campana}|${d.grupo_cap}`))

  // Filtrado de descuentos
  const validNominas = nominas.filter(n => !descSet.has(`${n.documento}|${campana}|${grupo_codigo}`))
  const total_nomina = validNominas.length
  const asistio_dia0 = validNominas.filter(n => String(n.dia_0).toUpperCase().trim() === 'ASISTIO').length

  // Cálculo Día 1 Reclutamiento (Teórico)
  const dia1_teorico = validNominas.filter(n => String(n.dia_1).toUpperCase().trim() === 'ASISTIO').length

  // Cálculo Día 1 Efectivo (Descontando BAJA DÍA 1)
  let countRecEfectivo = 0
  for (const n of validNominas) {
    if (String(n.dia_1).toUpperCase().trim() === 'ASISTIO') {
      const records = asistencias.filter(r => r.documento === n.documento)
      const isBajaDia1 = records.some(r => {
        const m = String(r.motivo_baja || '').toUpperCase()
        const e = String(r.estado || '').toUpperCase()
        return m.includes('BAJA DIA 1') || e.includes('BAJA DIA 1')
      })
      if (!isBajaDia1) {
        countRecEfectivo++
      }
    }
  }

  // Cálculo Formador Día 1
  let earliestIso = null
  let earliestRaw = null
  for (const row of asistencias) {
    if (row.fecha_registro_asistencia) {
      const raw = String(row.fecha_registro_asistencia).trim()
      let iso = raw
      if (raw.includes('/')) {
        const parts = raw.split('/')
        if (parts.length === 3) iso = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`
      }
      if (!earliestIso || iso < earliestIso) {
        earliestIso = iso
        earliestRaw = raw
      }
    }
  }

  const mapFormFull = new Map()
  for (const f of asistencias) {
    const doc = f.documento
    const isBaja = String(f.motivo_baja || '').toUpperCase().includes('BAJA DIA 1') || String(f.estado || '').toUpperCase().includes('BAJA DIA 1')
    if (!mapFormFull.has(doc)) {
      mapFormFull.set(doc, f)
    } else {
      const existing = mapFormFull.get(doc)
      const existingIsBaja = String(existing.motivo_baja || '').toUpperCase().includes('BAJA DIA 1') || String(existing.estado || '').toUpperCase().includes('BAJA DIA 1')
      if (isBaja) {
        mapFormFull.set(doc, f)
      } else if (!existingIsBaja && f.fecha_registro_asistencia === earliestRaw) {
        mapFormFull.set(doc, f)
      }
    }
  }

  let countFormEfectivo = 0
  const mapRec = new Map(validNominas.map(r => [r.documento, r.dia_1]))
  const allDocs = new Set([...mapFormFull.keys(), ...mapRec.keys()])
  let isCalibrated = true

  for (const doc of allDocs) {
    const formRecord = mapFormFull.get(doc)
    const recSigla = mapRec.get(doc)

    if (!recSigla) continue

    const formSigla = formRecord ? formRecord.sigla : 'Sin registro'
    const isBajaDia1 = formRecord && (
      String(formRecord.motivo_baja || '').toUpperCase().includes('BAJA DIA 1') ||
      String(formRecord.estado || '').toUpperCase().includes('BAJA DIA 1') ||
      (formSigla === 'B' && String(formRecord.motivo_baja || '').toUpperCase().includes('BAJA'))
    )
    const effectiveFormSigla = isBajaDia1 ? 'Sin registro' : formSigla

    const isFormAsistencia = ['A', 'FI', 'FJ', 'I-OP'].includes(effectiveFormSigla)
    const isRecAsistencia = String(recSigla).toUpperCase().trim() === 'ASISTIO' && !isBajaDia1

    if (isFormAsistencia) countFormEfectivo++
    if (isFormAsistencia !== isRecAsistencia) {
      isCalibrated = false
    }
  }

  console.log(`📌 1. RESUMEN CAPACITACIÓN & CALIBRACIÓN (Grupo: ${grupo_codigo}):`)
  console.log(`   - Total Nómina: ${total_nomina}`)
  console.log(`   - Asistió Día 0: ${asistio_dia0}`)
  console.log(`   - Asistió Día 1 Teórico (Reclutamiento sin filtro): ${dia1_teorico}`)
  console.log(`   - Asistió Día 1 Efectivo (Reclutador Calibrado): ${countRecEfectivo}`)
  console.log(`   - Asistió Día 1 Formador (En Sala Calibrado): ${countFormEfectivo}`)
  console.log(`   - Estado de Calibración: ${isCalibrated && countRecEfectivo === countFormEfectivo ? '✅ CALIBRADO' : '❌ DESCALIBRADO'}`)

  console.log('\n======================================================================')
  console.log('🔍 VERIFICACIÓN DE PERSONAS CON BAJA DÍA 1 EXCLUIDAS:')
  const bajasExcluidas = []
  for (const n of validNominas) {
    const records = asistencias.filter(r => r.documento === n.documento)
    for (const r of records) {
      const m = String(r.motivo_baja || '').toUpperCase()
      const e = String(r.estado || '').toUpperCase()
      if (m.includes('BAJA DIA 1') || e.includes('BAJA DIA 1')) {
        bajasExcluidas.push({
          documento: n.documento,
          dia_1_nomina: n.dia_1,
          sigla_asistencia: r.sigla,
          motivo_baja: r.motivo_baja,
          estado_formador: r.estado
        })
      }
    }
  }
  console.table(bajasExcluidas)

  console.log('\n======================================================================')
  if (countRecEfectivo === 14 && countFormEfectivo === 14 && isCalibrated) {
    console.log('🎉 RESULTADO: Calibración exitosa. Ambos conteos dan 14 y están calibrados.')
  } else {
    console.error('⚠️ ALERTA: Los conteos no coinciden con 14.')
  }
}

testFullSuite().catch(console.error)
