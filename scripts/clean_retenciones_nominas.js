import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://lqvvhovfvwzaprdgdobc.supabase.co'
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY || 'sb_secret_yFPHoSad3S_sFm-wKmCm3A_oauamLbk' || process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_hqkYCTr8g29RzFZnXiho5Q_7QAGdUKg'

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

async function clean() {
  console.log('🧹 Limpiando registros de nominas de GPE-2026012-1, GPE-2026012-2, GPE-2026013...')
  
  const { data: deletedNominas, error: errNom } = await supabase
    .from('nominas')
    .delete()
    .in('grupo_codigo', ['GPE-2026012-1', 'GPE-2026012-2', 'GPE-2026013'])
    .select('documento')

  if (errNom) {
    console.error('Error eliminando en nominas:', errNom.message)
  } else {
    console.log(`✅ Eliminados ${deletedNominas?.length || 0} registros de nominas.`)
  }

  console.log('🧹 Limpiando grupos creados en capacidad_rys (periodo 202608)...')
  const { error: errCap } = await supabase
    .from('capacidad_rys')
    .delete()
    .in('codigo', ['GPE-2026012-1', 'GPE-2026012-2'])
    .eq('periodo', '202608')

  if (errCap) {
    console.error('Error eliminando en capacidad_rys:', errCap.message)
  } else {
    console.log('✅ Grupos limpiados en capacidad_rys.')
  }

  console.log('\n🎉 ¡Base de datos limpia y lista para recibir el nuevo CSV!')
}

clean().catch(console.error)
