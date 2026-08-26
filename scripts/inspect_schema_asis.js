import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://lqvvhovfvwzaprdgdobc.supabase.co'
const SUPABASE_KEY = 'sb_publishable_hqkYCTr8g29RzFZnXiho5Q_7QAGdUKg'
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

async function inspectSchema() {
  const { data: asisSample } = await supabase.from('asistencias_capacitacion').select('*').limit(1)
  if (asisSample && asisSample.length > 0) {
    console.log('Columnas de asistencias_capacitacion:', Object.keys(asisSample[0]))
  }

  const { data: auditSample } = await supabase.from('audit_logs').select('*').limit(1)
  if (auditSample && auditSample.length > 0) {
    console.log('Columnas de audit_logs:', Object.keys(auditSample[0]))
  }
}

inspectSchema().catch(console.error)
