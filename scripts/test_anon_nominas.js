import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://lqvvhovfvwzaprdgdobc.supabase.co'
const ANON_KEY = 'sb_publishable_hqkYCTr8g29RzFZnXiho5Q_7QAGdUKg'

const supabase = createClient(SUPABASE_URL, ANON_KEY)

async function testQuery() {
  console.log('1. Query with grupo_codigo only:')
  const q1 = await supabase.from('nominas').select('documento, campana, grupo_codigo').eq('grupo_codigo', 'GPE-2026012-1')
  console.log('   Count:', q1.data?.length, 'Campana in DB:', q1.data?.map(d => JSON.stringify(d.campana)))

  console.log('\n2. Query with grupo_codigo and campana = "RETENCIONES FIJA INBOUND":')
  const q2 = await supabase.from('nominas').select('documento, campana, grupo_codigo').eq('grupo_codigo', 'GPE-2026012-1').eq('campana', 'RETENCIONES FIJA INBOUND')
  console.log('   Count:', q2.data?.length)

  console.log('\n3. Query with ilike campana:')
  const q3 = await supabase.from('nominas').select('documento, campana, grupo_codigo').eq('grupo_codigo', 'GPE-2026012-1').ilike('campana', '%RETENCIONES%')
  console.log('   Count:', q3.data?.length)
}

testQuery().catch(console.error)
