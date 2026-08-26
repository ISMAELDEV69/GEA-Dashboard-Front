import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://lqvvhovfvwzaprdgdobc.supabase.co'
const SUPABASE_KEY = 'sb_publishable_hqkYCTr8g29RzFZnXiho5Q_7QAGdUKg'

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

async function testAsistenciaEligibility() {
  const { data } = await supabase
    .from('v_nominas_consolidado')
    .select('documento, apellido_paterno, nombres, grupo_codigo, campana, dia_0, status_dia_1')
    .in('grupo_codigo', ['GPE-2026012-1', 'GPE-2026012-2', 'GPE-2026013'])

  for (const gCode of ['GPE-2026012-1', 'GPE-2026012-2', 'GPE-2026013']) {
    const list = data.filter(d => d.grupo_codigo === gCode)
    const eligible = list.filter(p => {
      const d0 = (p.dia_0 || '').toUpperCase().trim() === 'ASISTIO'
      const d1 = (p.status_dia_1 || '').toUpperCase().trim()
      return d0 || d1 === 'AGREGADO' || d1 === 'RECUPERADO'
    })
    console.log(`Grupo ${gCode}: Total ${list.length}, Aptos para Asistencia: ${eligible.length}`)
  }
}

testAsistenciaEligibility().catch(console.error)
