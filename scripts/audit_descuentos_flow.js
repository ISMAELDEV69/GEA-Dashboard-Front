import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://ujqehcpglfhnytzsyedp.supabase.co'
const SUPABASE_KEY = 'sb_publishable_wt_Muu3dmb0GjulWMDYpqg_NKRYqKNE'

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

async function auditDescuentos() {
  console.log('========================================================================')
  console.log('1. CASO DNI 77100009 (CHIROQUE PINTADO LESLIE ANABETH)')
  console.log('========================================================================')
  const { data: dCase, error: errCase } = await supabase
    .from('descuentos')
    .select('*')
    .ilike('dni_ce', '%77100009%')
  
  console.log('Registro en tabla descuentos:', dCase)

  console.log('\n========================================================================')
  console.log('2. CONTEO DE ESTADOS EN TABLA DESCUENTOS')
  console.log('========================================================================')
  const { data: allDesc, error: errDesc } = await supabase
    .from('descuentos')
    .select('id, dni_ce, campana, grupo_cap, procede, autoriza_cap, autoriza_rys')
    
  console.log('Total registros en descuentos:', allDesc?.length)
  const procedeMap = {}
  allDesc?.forEach(d => {
    const p = String(d.procede || 'NULL').trim().toUpperCase()
    procedeMap[p] = (procedeMap[p] || 0) + 1
  })
  console.log('Desglose por columna procede:', procedeMap)

  const autMap = {}
  allDesc?.forEach(d => {
    const key = `CAP: ${d.autoriza_cap || 'NULL'} | RYS: ${d.autoriza_rys || 'NULL'} -> PROCEDE: ${d.procede || 'NULL'}`
    autMap[key] = (autMap[key] || 0) + 1
  })
  console.log('Combinaciones de Autorización:', autMap)

  console.log('\n========================================================================')
  console.log('3. CASOS REALES CON PROCEDE = "SI" EN CONSOLIDADO_ASISTENCIAS')
  console.log('========================================================================')
  const proceden = (allDesc || []).filter(d => String(d.procede || '').toUpperCase().trim() === 'SI')
  console.log(`Total registros con procede = 'SI': ${proceden.length}`)

  // Tomar primeros 10 DNIs aprobados y buscar si están en consolidado_asistencias
  const sampleDnis = proceden.slice(0, 50).map(d => String(d.dni_ce).trim())
  
  const { data: asisSample } = await supabase
    .from('consolidado_asistencias')
    .select('documento, campana, codigo_grupo, grupo, sigla, motivo_baja, estado, fecha_registro_asistencia')
    .in('documento', sampleDnis)
    
  console.log(`De los 50 DNIs aprobados probados, se encontraron ${asisSample?.length} registros en consolidado_asistencias:`)
  console.log(asisSample?.slice(0, 5))
}

auditDescuentos()
