import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://lqvvhovfvwzaprdgdobc.supabase.co'
const SUPABASE_KEY = 'sb_publishable_hqkYCTr8g29RzFZnXiho5Q_7QAGdUKg'

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

async function testView() {
  console.log('--- Consultando v_nominas_consolidado ---')
  const { data, error } = await supabase
    .from('v_nominas_consolidado')
    .select('documento, campana, grupo_codigo, dia_0, status_dia_1')
    .in('grupo_codigo', ['GPE-2026012-1', 'GPE-2026012-2', 'GPE-2026013'])

  if (error) {
    console.error('Error:', error.message)
  } else {
    console.log(`Total encontrados en v_nominas_consolidado: ${data?.length}`)
    console.log('Por grupo:', data?.reduce((acc, r) => {
      acc[r.grupo_codigo] = (acc[r.grupo_codigo] || 0) + 1
      return acc
    }, {}))
    console.log('Muestra dia_0 y status_dia_1:', data?.slice(0, 5))
  }
}

testView().catch(console.error)
