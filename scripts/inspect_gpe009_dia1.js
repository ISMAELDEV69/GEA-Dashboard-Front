import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://lqvvhovfvwzaprdgdobc.supabase.co'
const SUPABASE_KEY = 'sb_publishable_hqkYCTr8g29RzFZnXiho5Q_7QAGdUKg'

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

async function inspectDia1() {
  const { data: nominas } = await supabase
    .from('nominas')
    .select('documento, apellido_paterno, apellido_materno, nombres, dia_0, dia_1, status_dia_1')
    .eq('grupo_codigo', 'GPE-2026009')
    .eq('campana', 'RETENCIONES FIJA INBOUND')
    .order('apellido_paterno')

  console.log(`📋 Total postulantes en nominas para GPE-2026009: ${nominas.length}`)
  console.log('\nListado detallado:')
  nominas.forEach((n, idx) => {
    console.log(`${idx + 1}. DNI: ${n.documento} | ${n.apellido_paterno} ${n.apellido_materno} ${n.nombres} | Dia 0: "${n.dia_0}" | Dia 1: "${n.dia_1}" | Status D1: "${n.status_dia_1}"`)
  })

  // Conteo en consolidado_asistencias del dia 1
  const { data: asisArray } = await supabase
    .from('consolidado_asistencias')
    .select('documento, fecha_registro_asistencia, sigla, motivo_baja, estado')
    .eq('codigo_grupo', 'GPE-2026009')
    .eq('campana', 'RETENCIONES FIJA INBOUND')
    .order('fecha_registro_asistencia')

  const dates = [...new Set(asisArray.map(a => a.fecha_registro_asistencia))].sort()
  console.log('\nFechas registradas por el formador en consolidado_asistencias:', dates)
  if (dates.length > 0) {
    const firstDate = dates[0]
    const d1Asis = asisArray.filter(a => a.fecha_registro_asistencia === firstDate)
    console.log(`\nAsistencias en la primera fecha (${firstDate}) registradas por el Formador:`)
    console.log(`Total registros: ${d1Asis.length}`)
    console.log(`Asistieron (A, FI, FJ): ${d1Asis.filter(a => a.sigla === 'A' || a.sigla === 'FI' || a.sigla === 'FJ').length}`)
    console.log(`Faltaron (F): ${d1Asis.filter(a => a.sigla === 'F').length}`)
    console.log(`Bajas (B): ${d1Asis.filter(a => a.sigla === 'B').length}`)
  }
}

inspectDia1().catch(console.error)
