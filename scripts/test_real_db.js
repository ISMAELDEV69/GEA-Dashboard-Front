import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://ujqehcpglfhnytzsyedp.supabase.co'
const SUPABASE_KEY = 'sb_publishable_wt_Muu3dmb0GjulWMDYpqg_NKRYqKNE'
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

async function test() {
  const { data, error } = await supabase
    .from('consolidado_asistencias')
    .select('id, documento, fecha_registro_asistencia, codigo_grupo, campana, created_at, sigla')
    .ilike('codigo_grupo', '%2026013%')
    .limit(20)

  if (error) {
    console.error('Error:', error)
    return
  }

  console.log('ENCONTRADOS EN ujqehcpglfhnytzsyedp:', data?.length)
  console.table(data)
}

test()
