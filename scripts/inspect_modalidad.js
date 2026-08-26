import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://lqvvhovfvwzaprdgdobc.supabase.co'
const SUPABASE_KEY = 'sb_publishable_hqkYCTr8g29RzFZnXiho5Q_7QAGdUKg'
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

async function inspectModalidad() {
  console.log('='.repeat(70))
  console.log('🔍 PASO 1 — VERIFICACIÓN DE DATOS DE MODALIDAD')
  console.log('='.repeat(70))

  // 1. Capacidad RYS - campo modalidad
  const { data: capRys, error: errCap } = await supabase
    .from('capacidad_rys')
    .select('codigo, campana, modalidad')

  console.log('\n1. TABLA capacidad_rys:')
  if (errCap) {
    console.log('  Error consultando capacidad_rys:', errCap.message)
  } else {
    console.log(`  Total registros en capacidad_rys: ${capRys.length}`)
    const capModalidadCounts = {}
    capRys.forEach(r => {
      const mod = r.modalidad ? String(r.modalidad).trim().toUpperCase() : 'NULL_OR_EMPTY'
      capModalidadCounts[mod] = (capModalidadCounts[mod] || 0) + 1
    })
    console.log('  Distribución de modalidad en capacidad_rys:', capModalidadCounts)
  }

  // 2. Nominas - verificar columnas
  const { data: nominasSample, error: errNomSample } = await supabase
    .from('nominas')
    .select('*')
    .limit(1)

  console.log('\n2. TABLA nominas (Estructura de columnas):')
  if (errNomSample) {
    console.log('  Error consultando nominas:', errNomSample.message)
  } else if (nominasSample && nominasSample.length > 0) {
    const keys = Object.keys(nominasSample[0])
    console.log('  Columnas en nominas:', keys.join(', '))
    const modCols = keys.filter(k => k.toLowerCase().includes('mod') || k.toLowerCase().includes('tipo'))
    console.log('  Columnas relacionadas a modalidad en nominas:', modCols)
  }

  // Revisar si existe columna modalidad o modalidad_tipo en nominas
  const { data: nominasAll, error: errNom } = await supabase
    .from('nominas')
    .select('grupo_codigo, campana, documento')

  console.log('\n3. CRUCE capacidad_rys con nominas:')
  if (!errNom && !errCap) {
    const capMap = new Map()
    capRys.forEach(r => {
      capMap.set(`${r.campana || ''}|${r.codigo || ''}`, r.modalidad ? String(r.modalidad).trim().toUpperCase() : 'NO_DEFINIDA')
    })

    const nominasModalidadCounts = {}
    let nominasSinGrupoEnCap = 0

    nominasAll.forEach(n => {
      const key = `${n.campana || ''}|${n.grupo_codigo || ''}`
      const mod = capMap.get(key)
      if (mod === undefined) {
        nominasSinGrupoEnCap++
      } else {
        nominasModalidadCounts[mod] = (nominasModalidadCounts[mod] || 0) + 1
      }
    })

    console.log(`  Total nominas: ${nominasAll.length}`)
    console.log('  Distribución de nominas cruzadas por modalidad de capacidad_rys:', nominasModalidadCounts)
    console.log(`  Nóminas sin match en capacidad_rys: ${nominasSinGrupoEnCap}`)
  }

  // 4. Ver si consolidado_asistencias tiene campo de modalidad
  const { data: asisSample } = await supabase.from('consolidado_asistencias').select('*').limit(1)
  if (asisSample && asisSample.length > 0) {
    const asisKeys = Object.keys(asisSample[0])
    console.log('\n4. TABLA consolidado_asistencias (columnas):')
    const asisModCols = asisKeys.filter(k => k.toLowerCase().includes('mod'))
    console.log('  Columnas relacionadas a modalidad en consolidado_asistencias:', asisModCols)
  }
}

inspectModalidad().catch(console.error)
