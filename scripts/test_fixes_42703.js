import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://ujqehcpglfhnytzsyedp.supabase.co'
const SUPABASE_KEY = 'sb_publishable_wt_Muu3dmb0GjulWMDYpqg_NKRYqKNE'

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

async function testAllFixedQueries() {
  console.log('=== TEST 1: Query a perfiles con columnas reales (id, nombre, rol) ===')
  const { data: pData, error: pErr } = await supabase
    .from('perfiles')
    .select('id, nombre, rol')
    .limit(1)

  if (pErr) {
    console.error('❌ Error en perfiles:', pErr)
  } else {
    console.log('✅ perfiles select OK! (Sin error 42703)')
  }

  console.log('\n=== TEST 2: Update simulado en perfiles solo con { nombre } ===')
  // Simular update con id aleatorio o existente
  const { error: upErr } = await supabase
    .from('perfiles')
    .update({ nombre: 'TEST_VERIFICACION' })
    .eq('id', '00000000-0000-0000-0000-000000000000')

  if (upErr && upErr.code === '42703') {
    console.error('❌ Error 42703 en update perfiles:', upErr)
  } else {
    console.log('✅ Update perfiles no arroja error de columna inexistente!')
  }

  console.log('\n=== TEST 3: Query a consolidado_asistencias con columnas reales ===')
  const { data: cData, error: cErr } = await supabase
    .from('consolidado_asistencias')
    .select('documento, fecha_registro_asistencia, sigla, motivo_baja, estado, campana, codigo_grupo')
    .limit(5)

  if (cErr) {
    console.error('❌ Error en consolidado_asistencias:', cErr)
  } else {
    console.log(`✅ consolidado_asistencias select OK (${cData.length} filas leídas)!`)
  }
}

testAllFixedQueries()
