import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://ujqehcpglfhnytzsyedp.supabase.co'
const SUPABASE_KEY = 'sb_publishable_wt_Muu3dmb0GjulWMDYpqg_NKRYqKNE'
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

async function fetchRecords() {
  const { data, error } = await supabase
    .from('consolidado_asistencias')
    .select('id, documento, apellido_paterno, apellido_materno, nombres, fecha_registro_asistencia, sigla, estado, motivo_baja, codigo_grupo, campana, nombre_formador, created_at')
    .eq('codigo_grupo', 'GPE-2026013')
    .eq('fecha_registro_asistencia', '6/8/2026')
    .order('documento', { ascending: true })

  if (error) {
    console.error('Error:', error)
    return
  }

  console.log(JSON.stringify(data, null, 2))
}

fetchRecords()
