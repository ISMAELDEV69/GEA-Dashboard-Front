import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://ujqehcpglfhnytzsyedp.supabase.co'
const SUPABASE_KEY = 'sb_publishable_wt_Muu3dmb0GjulWMDYpqg_NKRYqKNE'
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

async function testWebMetrics() {
  console.log('='.repeat(80))
  console.log('📊 VERIFICANDO MÉTRICAS DEL DASHBOARD EN LA BASE ACTIVA (PRODUCCIÓN)')
  console.log('='.repeat(80))

  // 1. Capacidad RYS
  const { data: capRys } = await supabase.from('capacidad_rys').select('*')
  console.log(`Grupos en capacidad_rys: ${capRys?.length || 0}`)

  // 2. Nominas
  let nominas = []
  let from = 0
  while (true) {
    const { data } = await supabase.from('nominas').select('documento, campana, grupo_codigo, dia_0, dia_1, activo').range(from, from + 999)
    if (!data || data.length === 0) break
    nominas = nominas.concat(data)
    if (data.length < 1000) break
    from += 1000
  }
  console.log(`Total nóminas en DB: ${nominas.length}`)

  // 3. Descuentos
  let desc = []
  from = 0
  while (true) {
    const { data } = await supabase.from('descuentos').select('dni_ce, campana, grupo_cap, procede, autoriza_rys, autoriza_cap').range(from, from + 999)
    if (!data || data.length === 0) break
    desc = desc.concat(data)
    if (data.length < 1000) break
    from += 1000
  }
  const procedeDesc = desc.filter(row => {
    if (String(row.procede || '').trim().toUpperCase() === 'PROCEDE') return true
    const rys = String(row.autoriza_rys || '').trim().toUpperCase() === 'SI'
    const cap = (String(row.autoriza_cap || '').trim().toUpperCase() === 'SI' || !row.autoriza_cap)
    return rys && cap
  })
  const descSet = new Set(procedeDesc.map(d => `${d.dni_ce}|${d.campana || ''}|${d.grupo_cap || ''}`))
  const nominasEfectivas = nominas.filter(n => !descSet.has(`${n.documento}|${n.campana || ''}|${n.grupo_codigo || ''}`))

  console.log(`Descuentos aplicados: ${nominas.length - nominasEfectivas.length}`)
  console.log(`Total Nómina Efectiva en Dashboard: ${nominasEfectivas.length}`)

  // 4. Consolidado
  let asis = []
  from = 0
  while (true) {
    const { data } = await supabase.from('consolidado_asistencias').select('documento, codigo_grupo, campana, sigla, estado, motivo_baja, fecha_registro_asistencia').range(from, from + 999)
    if (!data || data.length === 0) break
    asis = asis.concat(data)
    if (data.length < 1000) break
    from += 1000
  }
  console.log(`Total registros en consolidado_asistencias: ${asis.length}`)

  // 5. Conteo Día 0 y Día 1
  const dia0Count = nominasEfectivas.filter(n => String(n.dia_0).toUpperCase().trim() === 'ASISTIO').length
  console.log(`Total Asistió Día 0: ${dia0Count}`)

  // Total I-OP
  const iopDocs = new Set(asis.filter(a => String(a.sigla).toUpperCase().trim() === 'I-OP').map(a => a.documento))
  const iopCount = nominasEfectivas.filter(n => iopDocs.has(n.documento)).length
  console.log(`Total Ingresos I-OP: ${iopCount}`)
}

testWebMetrics().catch(console.error)
