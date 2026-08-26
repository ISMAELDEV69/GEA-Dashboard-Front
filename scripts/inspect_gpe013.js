import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://ujqehcpglfhnytzsyedp.supabase.co'
const SUPABASE_KEY = 'sb_publishable_wt_Muu3dmb0GjulWMDYpqg_NKRYqKNE'
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

async function inspectGpe013() {
  console.log('='.repeat(80))
  console.log('🔍 REVISIÓN DE POSTULANTES DE GPE-2026013 EN LA BASE DE PRODUCCIÓN')
  console.log('='.repeat(80))

  // 1. Grupo en capacidad_rys
  const { data: grupoCap } = await supabase
    .from('capacidad_rys')
    .select('*')
    .eq('codigo', 'GPE-2026013')

  console.log('\n1. Grupo GPE-2026013 en capacidad_rys:')
  console.table(grupoCap?.map(g => ({
    codigo: g.codigo,
    campana: g.campana,
    segmento: g.segmento,
    periodo: g.periodo,
    formador: g.formador_nombre || g.nombre_formador,
    condicion: g.condicion
  })))

  // 2. Postulantes en nominas para GPE-2026013
  const { data: nominasGpe } = await supabase
    .from('nominas')
    .select('documento, apellido_paterno, apellido_materno, nombres, celular, condicion, campana, grupo_codigo, dia_0, dia_1, status_dia_1, periodo_reclutado')
    .eq('grupo_codigo', 'GPE-2026013')

  console.log(`\n2. Total postulantes en tabla nominas con grupo_codigo = GPE-2026013: ${nominasGpe?.length || 0}`)
  console.table(nominasGpe?.map(p => ({
    DNI: p.documento,
    Nombres: `${p.apellido_paterno || ''} ${p.apellido_materno || ''}, ${p.nombres || ''}`.trim(),
    Campaña: p.campana,
    Grupo: p.grupo_codigo,
    Día_0: p.dia_0,
    Día_1: p.dia_1,
    Status_D1: p.status_dia_1,
    Celular: p.celular || 'NULL',
    Condición: p.condicion || 'NULL'
  })))

  // 3. Evaluar el filtro de AsistenciaForm exactamente
  const activeGrupo = grupoCap?.[0]
  console.log('\n3. Evaluación de cada candidato según las reglas de AsistenciaForm.jsx:')
  nominasGpe?.forEach(p => {
    const dia0Val = (p.dia_0 || '').toString().toUpperCase().trim()
    const statusDia1Val = (p.status_dia_1 || '').toString().toUpperCase().trim()
    const asistioD0 = dia0Val === 'ASISTIO'
    const agregadoD1 = statusDia1Val === 'AGREGADO' || statusDia1Val === 'RECUPERADO'
    const pasaDia0 = asistioD0 || agregadoD1

    const missing = []
    if (!p.documento) missing.push('DNI')
    if (!p.nombres) missing.push('Nombres')
    if (!p.apellido_paterno) missing.push('Apellido Paterno')
    if (!p.apellido_materno) missing.push('Apellido Materno')
    if (!p.celular) missing.push('Celular')
    const cond = p.condicion || activeGrupo?.condicion || ''
    if (!cond) missing.push('Condición Laboral')
    const camp = p.campana || activeGrupo?.campana || ''
    if (!camp) missing.push('Campaña')

    console.log(`  - DNI ${p.documento} (${p.nombres}): pasaDia0=${pasaDia0} (dia_0='${p.dia_0}'), faltantes=[${missing.join(', ')}] -> Pasa: ${pasaDia0 && missing.length === 0}`)
  })
}

inspectGpe013().catch(console.error)
