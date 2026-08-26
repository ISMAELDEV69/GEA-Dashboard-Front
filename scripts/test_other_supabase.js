import { createClient } from '@supabase/supabase-js'

const OTHER_SUPABASE_URL = 'https://ujqehcpglfhnytzsyedp.supabase.co'
const OTHER_SUPABASE_KEY = 'sb_publishable_wt_Muu3dmb0GjulWMDYpqg_NKRYqKNE'
const otherSupabase = createClient(OTHER_SUPABASE_URL, OTHER_SUPABASE_KEY)

async function testOtherSupabase() {
  console.log('='.repeat(80))
  console.log('🔍 CONSULTANDO LA BASE DE DATOS DEL EXCEL (ujqehcpglfhnytzsyedp)')
  console.log('='.repeat(80))

  // 1. Contar registros en consolidado_asistencias
  const { count, error: errCount } = await otherSupabase
    .from('consolidado_asistencias')
    .select('*', { count: 'exact', head: true })

  if (errCount) {
    console.log('Error conectando a ujqehcpglfhnytzsyedp:', errCount.message)
    return
  }

  console.log(`Total registros en consolidado_asistencias de ${OTHER_SUPABASE_URL}: ${count}`)

  // 2. Últimos registros en consolidado_asistencias
  const { data: latest } = await otherSupabase
    .from('consolidado_asistencias')
    .select('codigo_grupo, campana, documento, fecha_registro_asistencia, sigla, estado, created_at, fecha_hora_registro')
    .order('created_at', { ascending: false })
    .limit(15)

  console.log('\nÚltimos 15 registros por created_at en la base del Excel:')
  console.table(latest)

  // 3. Ver si tiene registros del grupo GPE-2026039 con fechas del 5 al 13 de agosto
  const { data: gpe039 } = await otherSupabase
    .from('consolidado_asistencias')
    .select('fecha_registro_asistencia, fecha_hora_registro, created_at')
    .eq('codigo_grupo', 'GPE-2026039')
    .limit(20)

  console.log('\nFechas encontradas para GPE-2026039 en la base del Excel:')
  const dates = [...new Set(gpe039?.map(r => r.fecha_registro_asistencia))]
  console.log(dates)
}

testOtherSupabase().catch(console.error)
