import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://ujqehcpglfhnytzsyedp.supabase.co'
const SUPABASE_KEY = 'sb_publishable_wt_Muu3dmb0GjulWMDYpqg_NKRYqKNE'
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

async function testFixedFilter() {
  const { data: nominasGpe } = await supabase
    .from('nominas')
    .select('*')
    .eq('grupo_codigo', 'GPE-2026013')

  const { data: grupoCap } = await supabase
    .from('capacidad_rys')
    .select('*')
    .eq('codigo', 'GPE-2026013')
    .eq('campana', 'RETENCIONES FIJA INBOUND')

  const activeGrupoObj = grupoCap?.[0]

  const passed = nominasGpe.filter(p => {
    const isGrupoMatch = p.grupo_codigo === 'GPE-2026013' || (activeGrupoObj && p.grupo_codigo === activeGrupoObj.codigo)
    const isCampanaMatch = !activeGrupoObj || p.campana === activeGrupoObj.campana
    if (!isGrupoMatch || !isCampanaMatch) return false

    const dia0Val = (p.dia_0 || '').toString().toUpperCase().trim()
    const statusDia1Val = (p.status_dia_1 || '').toString().toUpperCase().trim()
    
    const asistioD0 = dia0Val === 'ASISTIO'
    const pendienteD0 = dia0Val === '' || dia0Val === 'NULL' || dia0Val === 'PENDIENTE'
    const agregadoD1 = statusDia1Val === 'AGREGADO' || statusDia1Val === 'RECUPERADO'
    const rechazadoD0 = (dia0Val === 'FALTA' || dia0Val === 'NO ASISTIO' || dia0Val === 'DESERTO' || dia0Val === 'NO') && !agregadoD1
    
    if (rechazadoD0) return false
    if (!(asistioD0 || pendienteD0 || agregadoD1)) return false

    const missing = []
    if (!p.documento) missing.push('DNI')
    if (!p.nombres) missing.push('Nombres')
    if (!p.apellido_paterno) missing.push('Apellido Paterno')
    if (!p.celular && !p.telefono) missing.push('Celular')
    const cond = p.condicion || activeGrupoObj?.condicion || 'FULL TIME'
    if (!cond) missing.push('Condición Laboral')
    const camp = p.campana || activeGrupoObj?.campana || ''
    if (!camp) missing.push('Campaña')

    return missing.length === 0
  })

  console.log('='.repeat(80))
  console.log(`✅ RESULTADO DEL FILTRO CORREGIDO:`)
  console.log(`Total postulantes de GPE-2026013 que ahora APARECEN en Asistencias: ${passed.length} de ${nominasGpe.length}`)
  console.log('='.repeat(80))
  console.table(passed.map(p => ({
    DNI: p.documento,
    Postulante: `${p.apellido_paterno || ''} ${p.apellido_materno || ''}, ${p.nombres || ''}`.trim(),
    Campaña: p.campana,
    Grupo: p.grupo_codigo,
    Estado_D0: p.dia_0 || '(Pendiente regularizar)'
  })))
}

testFixedFilter().catch(console.error)
