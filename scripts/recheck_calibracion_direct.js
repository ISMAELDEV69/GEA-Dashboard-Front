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
  // Get all configs for this codigo
  const { data: configs } = await supabase.from('grupos_dia1').select('*, grupos_capacitacion!inner(codigo)').eq('grupos_capacitacion.codigo', grupo_codigo)
  
  if (!configs || configs.length === 0) return console.log("No config found")
  
  for(let conf of configs) {
     const { data: recAsis } = await supabase.from('asistencias_dia1_reclutador').select('*, grupos_capacitacion!inner(codigo)').eq('grupos_capacitacion.codigo', grupo_codigo)
     const { data: formAsis } = await supabase.from('asistencias_capacitacion').select('*, grupos_capacitacion!inner(codigo)').eq('grupos_capacitacion.codigo', grupo_codigo).eq('fecha_asistencia', conf.fecha_dia1)
     
     if (!recAsis || recAsis.length === 0 || !formAsis || formAsis.length === 0) {
        console.log(`Setting PENDIENTE because lengths are rec:${recAsis?.length} form:${formAsis?.length}`)
        await supabase.from('grupos_dia1').update({ estado_calibracion: 'PENDIENTE', updated_at: new Date().toISOString() }).eq('grupo_id', conf.grupo_id)
        continue
     }
     
     const formFiltered = formAsis.filter(f => !(f.sigla_asistencia === 'B' && f.motivo_baja === 'BAJA DIA 1'))
     const mapForm = new Map(formFiltered.map(f => [f.postulante_documento, f.sigla_asistencia]))
     const mapRec = new Map(recAsis.map(r => [r.postulante_documento, r.sigla_final]))
     
     const allDocs = new Set([...mapForm.keys(), ...mapRec.keys()])
     let isCalibrated = true
     
     for (const doc of allDocs) {
        const formSigla = mapForm.get(doc) || 'Sin registro'
        const recSigla = mapRec.get(doc) || 'Sin registro'
        const isFormAsistencia = formSigla === 'A' || formSigla === 'I-OP'
        const isRecAsistencia = recSigla === 'A'
        if (isFormAsistencia !== isRecAsistencia) {
           isCalibrated = false
           break
        }
     }
     
     const newState = isCalibrated ? 'CALIBRADO' : 'DESCALIBRADO'
     await supabase.from('grupos_dia1').update({ estado_calibracion: newState, updated_at: new Date().toISOString() }).eq('grupo_id', conf.grupo_id)
     console.log(`Updated state for ${grupo_codigo} to ${newState}`)
  }
}
run()
