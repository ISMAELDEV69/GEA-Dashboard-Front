import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://lqvvhovfvwzaprdgdobc.supabase.co'
const SUPABASE_KEY = 'sb_publishable_hqkYCTr8g29RzFZnXiho5Q_7QAGdUKg'
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

async function testModalidadMetrics() {
  console.log('='.repeat(70))
  console.log('📊 SIMULACIÓN DE MÉTRICAS POR MODALIDAD CON DATOS REALES')
  console.log('='.repeat(70))

  // 1. Capacidad RYS
  const { data: capRys } = await supabase.from('capacidad_rys').select('*')
  const capMap = new Map()
  capRys.forEach(r => {
    capMap.set(`${r.campana || ''}|${r.codigo || ''}`, {
      modalidad: (r.modalidad || 'PRESENCIAL').toUpperCase().trim(),
      fecha_inicio_ojt: r.fecha_inicio_ojt
    })
  })

  // 2. Nominas
  let nominasAll = []
  let nFrom = 0
  while(true) {
    const { data } = await supabase.from('nominas').select('documento, dia_0, dia_1, activo, grupo_codigo, campana').range(nFrom, nFrom + 999)
    if (!data || data.length === 0) break
    nominasAll = nominasAll.concat(data)
    if (data.length < 1000) break
    nFrom += 1000
  }

  // 3. Consolidado
  let formAsisAll = []
  let fFrom = 0
  while(true) {
    const { data } = await supabase.from('consolidado_asistencias').select('documento, fecha_registro_asistencia, sigla, motivo_baja, codigo_grupo, campana, estado').range(fFrom, fFrom + 999)
    if (!data || data.length === 0) break
    formAsisAll = formAsisAll.concat(data)
    if (data.length < 1000) break
    fFrom += 1000
  }

  // 4. Descuentos
  let descAll = []
  let dFrom = 0
  while(true) {
    const { data } = await supabase.from('descuentos').select('dni_ce, campana, grupo_cap, procede, autoriza_rys, autoriza_cap').range(dFrom, dFrom + 999)
    if (!data || data.length === 0) break
    descAll = descAll.concat(data)
    if (data.length < 1000) break
    dFrom += 1000
  }
  const procedeDesc = descAll.filter(row => {
    if (String(row.procede || '').trim().toUpperCase() === 'PROCEDE') return true
    const rys = String(row.autoriza_rys || '').trim().toUpperCase() === 'SI'
    const cap = (String(row.autoriza_cap || '').trim().toUpperCase() === 'SI' || !row.autoriza_cap)
    return rys && cap
  })
  const descSet = new Set(procedeDesc.map(d => `${d.dni_ce}|${d.campana || ''}|${d.grupo_cap || ''}`))

  // Filtrar nóminas válidas
  const validNominas = nominasAll.filter(n => !descSet.has(`${n.documento}|${n.campana || ''}|${n.grupo_codigo || ''}`))

  // Agrupar por modalidad
  const metrics = {
    PRESENCIAL: { total_nomina: 0, asistio_dia0: 0, asistio_dia1: 0, ingresos_iop: 0, activos_actuales: 0 },
    REMOTO:     { total_nomina: 0, asistio_dia0: 0, asistio_dia1: 0, ingresos_iop: 0, activos_actuales: 0 }
  }

  // Indexar consolidado por grupo
  const formMap = new Map()
  formAsisAll.forEach(f => {
    const k = `${f.campana || ''}|${f.codigo_grupo || ''}`
    if (!formMap.has(k)) formMap.set(k, [])
    formMap.get(k).push(f)
  })

  // Calcular métricas grupo a grupo
  capRys.forEach(g => {
    const k = `${g.campana || ''}|${g.codigo || ''}`
    const mod = (g.modalidad || 'PRESENCIAL').toUpperCase().trim()
    const target = metrics[mod] || metrics.PRESENCIAL

    const groupNominas = validNominas.filter(n => `${n.campana || ''}|${n.grupo_codigo || ''}` === k)
    const groupForm = formMap.get(k) || []

    target.total_nomina += groupNominas.length
    target.asistio_dia0 += groupNominas.filter(n => String(n.dia_0).toUpperCase().trim() === 'ASISTIO').length

    let d1Count = 0
    groupNominas.forEach(n => {
      if (String(n.dia_1).toUpperCase().trim() === 'ASISTIO') {
        const records = groupForm.filter(r => r.documento === n.documento)
        const isBajaDia1 = records.some(r => {
          const m = String(r.motivo_baja || '').toUpperCase()
          const e = String(r.estado || '').toUpperCase()
          return m.includes('BAJA DIA 1') || e.includes('BAJA DIA 1')
        })
        if (!isBajaDia1) d1Count++
      }
    })
    target.asistio_dia1 += d1Count

    const docs = [...new Set(groupNominas.map(n => n.documento))]
    docs.forEach(doc => {
      const records = groupForm.filter(r => r.documento === doc)
      if (records.some(r => String(r.sigla).toUpperCase().trim() === 'I-OP')) {
        target.ingresos_iop++
      }
      if (records.length > 0) {
        const sorted = [...records].sort((a, b) => new Date(a.fecha_registro_asistencia || 0) - new Date(b.fecha_registro_asistencia || 0))
        const last = sorted[sorted.length - 1]
        const state = String(last.estado || '').toUpperCase()
        const isBaja1 = String(last.motivo_baja || '').toUpperCase().includes('BAJA DIA 1') || String(last.estado || '').toUpperCase().includes('BAJA DIA 1')
        if (state === 'ACTIVO' && !isBaja1) {
          target.activos_actuales++
        }
      }
    })
  })

  console.log('\nResultados globales calculados:')
  for (const [mod, m] of Object.entries(metrics)) {
    const pctDia0 = m.total_nomina > 0 ? ((m.asistio_dia0 / m.total_nomina) * 100).toFixed(1) : '0'
    const pctRetDia1 = m.asistio_dia0 > 0 ? ((m.asistio_dia1 / m.asistio_dia0) * 100).toFixed(1) : '0'
    const pctIopVsNom = m.total_nomina > 0 ? ((m.ingresos_iop / m.total_nomina) * 100).toFixed(1) : '0'
    const pctIopVsDia1 = m.asistio_dia1 > 0 ? ((m.ingresos_iop / m.asistio_dia1) * 100).toFixed(1) : '0'
    console.log(`\n📌 MODALIDAD: ${mod}`)
    console.log(`   - Total Nómina: ${m.total_nomina}`)
    console.log(`   - Asistió Día 0: ${m.asistio_dia0} (${pctDia0}% vs Nómina)`)
    console.log(`   - Asistió Día 1: ${m.asistio_dia1} (${pctRetDia1}% retención sobre Día 0)`)
    console.log(`   - Ingresos (I-OP): ${m.ingresos_iop} (${pctIopVsNom}% sobre Nómina, ${pctIopVsDia1}% sobre Día 1)`)
    console.log(`   - Activos Actuales: ${m.activos_actuales}`)
  }
}

testModalidadMetrics().catch(console.error)
