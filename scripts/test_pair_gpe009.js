import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://lqvvhovfvwzaprdgdobc.supabase.co'
const SUPABASE_KEY = 'sb_publishable_hqkYCTr8g29RzFZnXiho5Q_7QAGdUKg'

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

async function testPair() {
  const { data: nominas } = await supabase
    .from('nominas')
    .select('documento, dia_0, dia_1, campana, grupo_codigo')
    .eq('grupo_codigo', 'GPE-2026009')
    .eq('campana', 'RETENCIONES FIJA INBOUND')

  console.log('--- GPE-2026009 en RETENCIONES FIJA INBOUND ---')
  console.log('1. Total Nómina:', nominas.length)
  console.log('2. Día 0 (ASISTIO):', nominas.filter(n => String(n.dia_0).toUpperCase().trim() === 'ASISTIO').length)
  console.log('3. Día 1 (ASISTIO):', nominas.filter(n => String(n.dia_1).toUpperCase().trim() === 'ASISTIO').length)

  const { data: asistencias } = await supabase
    .from('consolidado_asistencias')
    .select('documento, fecha_registro_asistencia, sigla, motivo_baja, estado')
    .eq('codigo_grupo', 'GPE-2026009')
    .eq('campana', 'RETENCIONES FIJA INBOUND')

  console.log('4. Ingresos I-OP:', new Set(asistencias.filter(a => a.sigla === 'I-OP').map(a => a.documento)).size)
  
  // Activos OJT (fecha OJT: 2026-07-24)
  const ojtDocs = new Set(asistencias.filter(a => a.fecha_registro_asistencia === '2026-07-24' && a.estado === 'ACTIVO').map(a => a.documento))
  console.log('5. Activos OJT (en 2026-07-24):', ojtDocs.size)

  // Activos Actuales
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
  console.log('6. Activos Actuales:', activos)
}

testPair().catch(console.error)
