import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://ujqehcpglfhnytzsyedp.supabase.co'
const SUPABASE_KEY = 'sb_publishable_wt_Muu3dmb0GjulWMDYpqg_NKRYqKNE'
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

async function inspectUsers() {
  const { data, error } = await supabase
    .from('perfiles')
    .select('email, rol, nombre_completo, created_at')
    .order('created_at', { ascending: true })

  if (error) {
    console.error('Error:', error)
    return
  }

  console.log('=== USUARIOS / PERFILES EN LA BASE ujqehcpglfhnytzsyedp ===')
  console.table(data)
}

inspectUsers()
