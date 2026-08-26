import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://lqvvhovfvwzaprdgdobc.supabase.co'
const SUPABASE_KEY = 'sb_publishable_hqkYCTr8g29RzFZnXiho5Q_7QAGdUKg'
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

async function resumenGruposRecientes() {
  const { data } = await supabase
    .from('consolidado_asistencias')
    .select('codigo_grupo, campana, nombre_formador, fecha_registro_asistencia, created_at')
    .order('created_at', { ascending: false })
    .limit(500)

  const summary = new Map()
  data.forEach(r => {
    const k = `${r.codigo_grupo} | ${r.campana} | ${r.nombre_formador || 'Sin formador'}`
    if (!summary.has(k)) {
      summary.set(k, { count: 0, ult_fecha_asistencia: r.fecha_registro_asistencia, created_at: r.created_at })
    }
    summary.get(k).count++
  })

  console.log('Grupos con registros de asistencia más recientes en la base de datos:')
  console.table(Array.from(summary.entries()).map(([k, v]) => ({
    Grupo_Campana_Formador: k,
    Registros_Asistencia: v.count,
    Fecha_Asistencia: v.ult_fecha_asistencia,
    Fecha_Sincronizacion_BD: v.created_at
  })))
}

resumenGruposRecientes().catch(console.error)
