import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://lqvvhovfvwzaprdgdobc.supabase.co'
const SUPABASE_KEY = 'sb_publishable_hqkYCTr8g29RzFZnXiho5Q_7QAGdUKg'
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

async function listAllTables() {
  const tableList = [
    'consolidado_asistencias',
    'asistencias_capacitacion',
    'asistencias',
    'asistencias_consolidado',
    'control_asistencias',
    'piloto_portal',
    'asistencias_piloto',
    'nominas',
    'capacidad_rys',
    'descuentos',
    'descuentos_bi',
    'postulantes',
    'grupos',
    'audit_logs'
  ]

  console.log('Verificando conteo de registros en posibles tablas de Supabase:\n')
  for (const t of tableList) {
    try {
      const { count, error } = await supabase.from(t).select('*', { count: 'exact', head: true })
      if (error) {
        console.log(`  ❌ ${t}: No existe o sin acceso (${error.message})`)
      } else {
        console.log(`  ✅ ${t}: ${count} registros`)
      }
    } catch(e) {
      console.log(`  ❌ ${t}: Error`)
    }
  }
}

listAllTables().catch(console.error)
