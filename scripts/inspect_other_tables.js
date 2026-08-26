import { createClient } from '@supabase/supabase-js'

const OTHER_SUPABASE_URL = 'https://ujqehcpglfhnytzsyedp.supabase.co'
const OTHER_SUPABASE_KEY = 'sb_publishable_wt_Muu3dmb0GjulWMDYpqg_NKRYqKNE'
const otherSupabase = createClient(OTHER_SUPABASE_URL, OTHER_SUPABASE_KEY)

async function inspectAllOtherTables() {
  const tableList = [
    'consolidado_asistencias',
    'asistencias_capacitacion',
    'nominas',
    'capacidad_rys',
    'descuentos',
    'descuentos_bi',
    'postulantes',
    'grupos',
    'audit_logs',
    'perfiles'
  ]

  console.log('='.repeat(80))
  console.log(`📋 CONTEO DE TABLAS EN LA BASE DE DATOS DE PRODUCCIÓN REAL (${OTHER_SUPABASE_URL}):`)
  console.log('='.repeat(80))

  for (const t of tableList) {
    try {
      const { count, error } = await otherSupabase.from(t).select('*', { count: 'exact', head: true })
      if (error) {
        console.log(`  ❌ ${t}: No existe o sin permisos (${error.message})`)
      } else {
        console.log(`  ✅ ${t}: ${count} registros`)
      }
    } catch(e) {
      console.log(`  ❌ ${t}: Error`)
    }
  }
}

inspectAllOtherTables().catch(console.error)
