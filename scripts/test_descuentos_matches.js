import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://ujqehcpglfhnytzsyedp.supabase.co'
const SUPABASE_KEY = 'sb_publishable_wt_Muu3dmb0GjulWMDYpqg_NKRYqKNE'

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

const normalizeGPE = (val) => String(val || '').replace(/^GPE-?/i, '').trim();
const normalizeCampana = (c) => String(c || '').toUpperCase().replace(/\s+/g, '');
const normalizeDNI = (d) => String(d || '').trim();

const makeDescuentoKey = (doc, camp, grupo) => {
  return `${normalizeDNI(doc)}|${normalizeCampana(camp)}|${normalizeGPE(grupo)}`;
}

async function verifyApprovedCase() {
  console.log('=== BUSCANDO REGISTROS DE DESCUENTOS APROBADOS QUE COINCIDAN CON CONSOLIDADO_ASISTENCIAS ===')
  
  // 1. Traer descuentos con PROCEDE
  const { data: descList } = await supabase
    .from('descuentos')
    .select('id, dni_ce, campana, grupo_cap, procede, autoriza_cap, autoriza_rys, motivo, fecha_baja')
    .eq('procede', 'PROCEDE')
    .limit(300)

  console.log(`Total descuentos evaluados: ${descList?.length}`)

  // Generar keys de descuentos
  const descKeys = new Set(descList.map(d => makeDescuentoKey(d.dni_ce, d.campana, d.grupo_cap)))
  const descDnis = [...new Set(descList.map(d => String(d.dni_ce).trim()))]

  // 2. Buscar estos DNIs en consolidado_asistencias
  const { data: rawAsis } = await supabase
    .from('consolidado_asistencias')
    .select('id, documento, campana, codigo_grupo, grupo, sigla, motivo_baja, estado, fecha_registro_asistencia')
    .in('documento', descDnis)

  console.log(`Encontrados en consolidado_asistencias: ${rawAsis?.length} registros`)

  // 3. Evaluar matches exactos por makeDescuentoKey
  const matches = []
  rawAsis?.forEach(r => {
    const key = makeDescuentoKey(r.documento, r.campana, r.codigo_grupo)
    if (descKeys.has(key)) {
      matches.push({
        asistencia: r,
        key: key
      })
    }
  })

  console.log(`Matches exactos (DNI + Campaña + Grupo) excluidos por el Set de Descuentos: ${matches.length}`)
  if (matches.length > 0) {
    console.log('\n--- DETALLE DE CASO REAL APROBADO Y EXCLUIDO ---')
    const sample = matches[0]
    console.log('Asistencia en BD cruda:', sample.asistencia)
    console.log('Key calculada:', sample.key)
    const matchingDesc = descList.find(d => makeDescuentoKey(d.dni_ce, d.campana, d.grupo_cap) === sample.key)
    console.log('Descuento aprobado en BD:', matchingDesc)
  } else {
    console.log('\nAnalizando por qué no hubo match exacto de key entre los encontrados...')
    rawAsis?.slice(0, 5).forEach(r => {
      console.log('Asistencia:', r.documento, '|', r.campana, '|', r.codigo_grupo, 'Key ->', makeDescuentoKey(r.documento, r.campana, r.codigo_grupo))
    })
    descList?.slice(0, 5).forEach(d => {
      console.log('Descuento:', d.dni_ce, '|', d.campana, '|', d.grupo_cap, 'Key ->', makeDescuentoKey(d.dni_ce, d.campana, d.grupo_cap))
    })
  }
}

verifyApprovedCase()
