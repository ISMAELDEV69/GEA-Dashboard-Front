import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://ujqehcpglfhnytzsyedp.supabase.co'
const SUPABASE_KEY = 'sb_publishable_wt_Muu3dmb0GjulWMDYpqg_NKRYqKNE'
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

async function inspect() {
  const { data: p } = await supabase.from('perfiles').select('*').limit(5)
  console.log('Perfiles:', p)

  const { data: a } = await supabase.from('audit_logs').select('usuario_email, fecha').order('fecha', { ascending: false }).limit(5)
  console.log('Audit logs usuarios recientes:', a)
}

inspect()
