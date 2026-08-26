import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://ujqehcpglfhnytzsyedp.supabase.co'
const SUPABASE_KEY = 'sb_publishable_wt_Muu3dmb0GjulWMDYpqg_NKRYqKNE'

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

async function testErrors() {
  console.log('1. Probando perfiles con cargo...')
  const p1 = await supabase.from('perfiles').select('id, nombre, rol, cargo, telefono, avatar_url, segmento').limit(1)
  console.log('Result perfiles con cargo:', p1.error?.message || 'OK')

  console.log('2. Probando consolidado_asistencias con periodo...')
  const c1 = await supabase.from('consolidado_asistencias').select('periodo').limit(1)
  console.log('Result consolidado_asistencias con periodo:', c1.error?.message || 'OK')

  console.log('3. Probando consolidado_asistencias con tipo_baja...')
  const c2 = await supabase.from('consolidado_asistencias').select('tipo_baja').limit(1)
  console.log('Result consolidado_asistencias con tipo_baja:', c2.error?.message || 'OK')

  console.log('4. Probando RPC get_my_profile...')
  const r1 = await supabase.rpc('get_my_profile')
  console.log('Result get_my_profile:', r1.error?.message || 'OK')
}

testErrors()
