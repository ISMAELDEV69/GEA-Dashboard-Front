import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://lqvvhovfvwzaprdgdobc.supabase.co'
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY || 'sb_secret_yFPHoSad3S_sFm-wKmCm3A_oauamLbk' || process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_hqkYCTr8g29RzFZnXiho5Q_7QAGdUKg'

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

async function test() {
  const { data: nominasCount, count } = await supabase
    .from('nominas')
    .select('grupo_codigo, campana, documento', { count: 'exact' })
    .in('grupo_codigo', ['GPE-2026012-1', 'GPE-2026012-2', 'GPE-2026013'])

  const groupCounts = {}
  nominasCount.forEach(n => {
    groupCounts[n.grupo_codigo] = (groupCounts[n.grupo_codigo] || 0) + 1
  })

  console.log('📊 Resumen de registros en base de datos Supabase:')
  console.log('   Total registros cargados:', nominasCount.length)
  console.log('   Por grupo:', groupCounts)
}

test().catch(console.error)
