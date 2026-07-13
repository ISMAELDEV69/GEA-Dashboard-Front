import fs from 'fs'
import { createClient } from '@supabase/supabase-js'

const envStr = fs.readFileSync('.env.local', 'utf8')
let url, key;
for (const line of envStr.split('\n')) {
  if (line.startsWith('VITE_SUPABASE_URL=')) url = line.split('=')[1].trim();
  if (line.startsWith('VITE_SUPABASE_ANON_KEY=')) key = line.split('=')[1].trim();
}

const supabase = createClient(url, key)

async function run() {
  const grupo_codigo = 'GPE-2026013'
  
  // Get all nominas + postulantes
  const { data: nominas } = await supabase.from('nominas').select('*, postulantes(documento, nombres, apellido_paterno, apellido_materno)')
  
  const postulantesMapped = nominas.map(n => ({
    ...n,
    ...n.postulantes,
    documento: n.postulante_documento
  }))

  const selectedGrupo = grupo_codigo
  const activeGrupoObj = { codigo: selectedGrupo }
  
  // Formador Filter
  const { data: asistencias } = await supabase.from('asistencias_capacitacion').select('postulante_documento, grupos_capacitacion!inner(codigo)').eq('grupos_capacitacion.codigo', selectedGrupo)
  const mappedDocs = new Set(asistencias.map(a => a.postulante_documento))

  const formadorList = postulantesMapped.filter(p => {
    const inGroup = mappedDocs.has(p.documento) || p.grupo_id === selectedGrupo || p.grupo_codigo === selectedGrupo || (activeGrupoObj && p.grupo_codigo === activeGrupoObj.codigo)
    if (!inGroup) return false
    
    const dia0Val = (p.dia_0 || '').toString().toUpperCase().trim()
    const statusDia1Val = (p.status_dia_1 || '').toString().toUpperCase().trim()
    
    if (statusDia1Val === 'CESE' || statusDia1Val === 'BAJA' || statusDia1Val === 'DESISTE') return false
    
    const asistioD0 = dia0Val === 'ASISTIO'
    const faltaD0 = dia0Val === 'FALTA' || dia0Val.includes('FALTA')
    const agregadoD1 = statusDia1Val === 'AGREGADO'
    
    if (!dia0Val && !statusDia1Val) return true
    if (asistioD0 || agregadoD1) return true
    return false
  })

  // Reclutador Filter
  const reclutadorList = postulantesMapped.filter(p => {
    if (p.grupo_codigo !== selectedGrupo || !p.activo) return false;
    
    const dia0Val = (p.dia_0 || '').toString().toUpperCase().trim()
    const statusDia1Val = (p.status_dia_1 || '').toString().toUpperCase().trim()
    
    if (statusDia1Val === 'CESE' || statusDia1Val === 'BAJA' || statusDia1Val === 'DESISTE') return false
    
    const asistioD0 = dia0Val === 'ASISTIO'
    const agregadoD1 = statusDia1Val === 'AGREGADO'
    
    if (!dia0Val && !statusDia1Val) return true
    if (asistioD0 || agregadoD1) return true
    return false
  })

  console.log("Formador Count:", formadorList.length)
  console.log("Reclutador Count:", reclutadorList.length)
  
  const recDocs = new Set(reclutadorList.map(r => r.documento))
  const formDocs = new Set(formadorList.map(r => r.documento))
  
  const inFormNotRec = formadorList.filter(f => !recDocs.has(f.documento))
  const inRecNotForm = reclutadorList.filter(r => !formDocs.has(r.documento))
  
  if (inFormNotRec.length > 0) {
    console.log("\nPeople in Formador but NOT in Reclutador:")
    inFormNotRec.forEach(p => {
       console.log(`- ${p.documento} (${p.nombres}): activo=${p.activo}, grupo_codigo=${p.grupo_codigo}, inMappedDocs=${mappedDocs.has(p.documento)}`)
    })
  }
  
  if (inRecNotForm.length > 0) {
    console.log("\nPeople in Reclutador but NOT in Formador:")
    inRecNotForm.forEach(p => {
       console.log(`- ${p.documento} (${p.nombres}): activo=${p.activo}, grupo_codigo=${p.grupo_codigo}, inMappedDocs=${mappedDocs.has(p.documento)}`)
    })
  }

}
run()
