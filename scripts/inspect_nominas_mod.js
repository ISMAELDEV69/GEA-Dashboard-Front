import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://lqvvhovfvwzaprdgdobc.supabase.co'
const SUPABASE_KEY = 'sb_publishable_hqkYCTr8g29RzFZnXiho5Q_7QAGdUKg'
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

async function inspectDetailed() {
  const { data: nominas } = await supabase.from('nominas').select('modalidad')
  const nomCounts = {}
  nominas.forEach(n => {
    const m = n.modalidad ? String(n.modalidad).trim().toUpperCase() : 'NULL_OR_EMPTY'
    nomCounts[m] = (nomCounts[m] || 0) + 1
  })
  console.log('Distribución columna modalidad en tabla nominas directamente:', nomCounts)
}

inspectDetailed().catch(console.error)
