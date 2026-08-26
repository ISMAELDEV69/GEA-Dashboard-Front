import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://lqvvhovfvwzaprdgdobc.supabase.co'
const SUPABASE_KEY = 'sb_publishable_hqkYCTr8g29RzFZnXiho5Q_7QAGdUKg'
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

async function getAug14Uploads() {
  const { data: allAug14, error } = await supabase
    .from('nominas')
    .select('id, documento, apellido_paterno, apellido_materno, nombres, grupo_codigo, campana, reclutador, periodo_reclutado, semana_trabajo, created_at')
    .gte('created_at', '2026-08-14T00:00:00Z')
    .order('created_at', { ascending: false })

  if (error) {
    console.error(error)
    return
  }

  console.log(`Total registros del lote más reciente: ${allAug14?.length || 0}`)

  const byGroup = {}
  for (const n of allAug14 || []) {
    const key = `${n.grupo_codigo || 'SIN_GRUPO'} (${n.campana || 'Sin Campaña'}) [Periodo: ${n.periodo_reclutado || '-'}]`
    if (!byGroup[key]) byGroup[key] = []
    byGroup[key].push(n)
  }

  for (const [grp, items] of Object.entries(byGroup)) {
    console.log(`\n========================================`)
    console.log(`GRUPO: ${grp} -> ${items.length} personas`)
    console.log(`========================================`)
    items.forEach((it, idx) => {
      console.log(`${idx + 1}. DNI: ${it.documento} | Nombre: ${it.nombres} ${it.apellido_paterno} ${it.apellido_materno} | ID: ${it.id}`)
    })
  }
}

getAug14Uploads().catch(console.error)
