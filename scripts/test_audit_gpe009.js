import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://lqvvhovfvwzaprdgdobc.supabase.co'
const SUPABASE_KEY = 'sb_publishable_hqkYCTr8g29RzFZnXiho5Q_7QAGdUKg'

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

async function auditGpe009() {
  console.log('--- AUDITORIA DE GRUPO GPE-2026009 ---')
  
  const { data: nominas } = await supabase
    .from('nominas')
    .select('documento, dia_0, dia_1, campana, grupo_codigo')
    .eq('grupo_codigo', 'GPE-2026009')

  console.log('Total Nómina:', nominas.length)
  console.log('Día 0 (ASISTIO):', nominas.filter(n => String(n.dia_0).toUpperCase().trim() === 'ASISTIO').length)
  console.log('Día 1 (ASISTIO):', nominas.filter(n => String(n.dia_1).toUpperCase().trim() === 'ASISTIO').length)

  const { data: cap } = await supabase
    .from('capacidad_rys')
    .select('codigo, campana, fecha_inicio_ojt')
    .eq('codigo', 'GPE-2026009')
  console.log('Capacidad RYS OJT Date:', cap)

  const { data: asistencias } = await supabase
    .from('consolidado_asistencias')
    .select('documento, fecha_registro_asistencia, sigla, motivo_baja, estado')
    .eq('codigo_grupo', 'GPE-2026009')

  console.log('Total Asistencias registradas:', asistencias?.length)
  
  // Activos actuales
  const docs = [...new Set(nominas.map(n => n.documento))]
  let activos = 0
  for (const doc of docs) {
    const recs = (asistencias || []).filter(a => a.documento === doc)
    if (recs.length > 0) {
      const sorted = recs.sort((a,b) => new Date(a.fecha_registro_asistencia) - new Date(b.fecha_registro_asistencia))
      const last = sorted[sorted.length - 1]
      if (String(last.estado).toUpperCase() === 'ACTIVO' && !String(last.motivo_baja || '').includes('BAJA DIA 1')) {
        activos++
      }
    }
  }
  console.log('Activos Actuales:', activos)
}

auditGpe009().catch(console.error)
