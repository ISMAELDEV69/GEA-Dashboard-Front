import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://ujqehcpglfhnytzsyedp.supabase.co'
const SUPABASE_KEY = 'sb_publishable_wt_Muu3dmb0GjulWMDYpqg_NKRYqKNE'
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

async function verifyActiveConnection() {
  console.log('='.repeat(80))
  console.log('🚀 ESTADO DE CONEXIÓN ACTIVA CON SUPABASE DE PRODUCCIÓN')
  console.log('='.repeat(80))

  const { count: countAsis } = await supabase.from('consolidado_asistencias').select('*', { count: 'exact', head: true })
  const { count: countNom } = await supabase.from('nominas').select('*', { count: 'exact', head: true })
  const { count: countCap } = await supabase.from('capacidad_rys').select('*', { count: 'exact', head: true })
  const { count: countDesc } = await supabase.from('descuentos').select('*', { count: 'exact', head: true })

  console.log(`✅ Base de datos conectada: ${SUPABASE_URL}`)
  console.log(`   - consolidado_asistencias: ${countAsis} registros`)
  console.log(`   - nominas:                 ${countNom} registros`)
  console.log(`   - capacidad_rys:           ${countCap} grupos planificados`)
  console.log(`   - descuentos:              ${countDesc} registros`)

  const { data: ultimosHoy } = await supabase
    .from('consolidado_asistencias')
    .select('codigo_grupo, campana, documento, fecha_registro_asistencia, sigla, estado, created_at')
    .order('created_at', { ascending: false })
    .limit(5)

  console.log('\nÚltimas asistencias registradas en la base activa:')
  console.table(ultimosHoy)
}

verifyActiveConnection().catch(console.error)
