import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://lqvvhovfvwzaprdgdobc.supabase.co'
const SUPABASE_KEY = 'sb_publishable_hqkYCTr8g29RzFZnXiho5Q_7QAGdUKg'
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

async function checkLatestEver() {
  console.log('=== ÚLTIMOS REGISTROS CREADOS EN NOMINAS ===')
  
  const { data: nominas, error: errN } = await supabase
    .from('nominas')
    .select('id, documento, apellido_paterno, apellido_materno, nombres, grupo_codigo, campana, reclutador, periodo_reclutado, semana_trabajo, created_at, updated_at, marca_temporal')
    .order('created_at', { ascending: false })
    .limit(20)

  if (errN) console.error('Error nominas:', errN)
  else {
    console.log('Top 20 por created_at en nominas:')
    nominas.forEach(n => {
      console.log(`- ID: ${n.id} | DNI: ${n.documento} | Nombre: ${n.nombres} ${n.apellido_paterno} | Grupo: ${n.grupo_codigo} | Campaña: ${n.campana} | Periodo: ${n.periodo_reclutado} | Created: ${n.created_at}`)
    })
  }

  console.log('\n=== ÚLTIMOS REGISTROS POR UPDATED_AT EN NOMINAS ===')
  const { data: nominasUpd, error: errU } = await supabase
    .from('nominas')
    .select('id, documento, apellido_paterno, apellido_materno, nombres, grupo_codigo, campana, reclutador, periodo_reclutado, semana_trabajo, created_at, updated_at, marca_temporal')
    .order('updated_at', { ascending: false })
    .limit(20)

  if (errU) console.error('Error nominas upd:', errU)
  else {
    nominasUpd.forEach(n => {
      console.log(`- ID: ${n.id} | DNI: ${n.documento} | Nombre: ${n.nombres} ${n.apellido_paterno} | Grupo: ${n.grupo_codigo} | Campaña: ${n.campana} | Updated: ${n.updated_at}`)
    })
  }
}

checkLatestEver().catch(console.error)
