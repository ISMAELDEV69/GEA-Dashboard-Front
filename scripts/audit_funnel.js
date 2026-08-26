import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://lqvvhovfvwzaprdgdobc.supabase.co'
const SUPABASE_KEY = 'sb_publishable_hqkYCTr8g29RzFZnXiho5Q_7QAGdUKg'

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

async function audit() {
  console.log('🔍 Ejecutando auditoría de métricas del Embudo General...')

  // 1. Total Nómina
  const { count: countNomina } = await supabase.from('nominas').select('*', { count: 'exact', head: true })
  
  // 2. Asistió Día 0
  const { count: countDia0 } = await supabase.from('nominas').select('*', { count: 'exact', head: true }).ilike('dia_0', '%ASISTIO%')
  
  // 3. Asistió Día 1 Teórico
  const { data: nominasDia1 } = await supabase.from('nominas').select('documento, campana, grupo_codigo').ilike('dia_1', '%ASISTIO%')
  const countDia1Teorico = nominasDia1?.length || 0

  // Bajas Día 1 en consolidado
  const { data: bajasDia1 } = await supabase.from('consolidado_asistencias')
    .select('documento, codigo_grupo, campana, motivo_baja, estado')
    .or('motivo_baja.ilike.%BAJA DIA 1%,estado.ilike.%BAJA DIA 1%')

  const bajasSet = new Set((bajasDia1 || []).map(b => `${b.codigo_grupo}|${b.campana}|${b.documento}`))

  const countDia1Efectivo = (nominasDia1 || []).filter(n => !bajasSet.has(`${n.grupo_codigo}|${n.campana}|${n.documento}`)).length

  // 4. Ingresos I-OP
  const { data: iopRows } = await supabase.from('consolidado_asistencias').select('documento').eq('sigla', 'I-OP')
  const uniqueIop = new Set(iopRows?.map(r => r.documento)).size

  console.log(`📊 RESULTADOS DE AUDITORÍA:`)
  console.log(`   1. Total Nómina: ${countNomina}`)
  console.log(`   2. Día 0 (Asistió): ${countDia0}`)
  console.log(`   3. Día 1 (Teórico Reclutamiento): ${countDia1Teorico}`)
  console.log(`   4. Día 1 (Efectivo Calibrado sin Bajas Día 1): ${countDia1Efectivo}`)
  console.log(`   5. Ingresos I-OP (Únicos): ${uniqueIop}`)
}

audit().catch(console.error)

