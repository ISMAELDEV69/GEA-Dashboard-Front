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
  const { data: grpData } = await supabase.from('grupos_capacitacion').select('id, campana_id').eq('codigo', grupo_codigo).order('created_at', { ascending: false }).limit(1).single()
  console.log("Grupo ID:", grpData.id, "Campana ID:", grpData.campana_id)

  const { data: config } = await supabase.from('grupos_dia1').select('*').eq('grupo_id', grpData.id).limit(1).maybeSingle()
  console.log("Config fecha_dia1:", config?.fecha_dia1)
  const fecha_dia1_ref = config?.fecha_dia1

  const { data: recAsis } = await supabase.from('asistencias_dia1_reclutador').select('*').eq('grupo_id', grpData.id)
  console.log("Reclutador records:", recAsis?.length)

  const { data: rawFormAsis } = await supabase.from('consolidado_asistencias')
    .select('documento, fecha_registro_asistencia, sigla, motivo_baja')
    .eq('codigo_grupo', grupo_codigo)
    .order('created_at', { ascending: true })

  const formAsis = (rawFormAsis || []).map(row => {
    let isoDate = ''
    if (row.fecha_registro_asistencia) {
      const parts = row.fecha_registro_asistencia.split('/')
      if (parts.length === 3) isoDate = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`
    }
    return {
      postulante_documento: row.documento,
      sigla_asistencia: row.sigla,
      motivo_baja: row.motivo_baja,
      fecha_asistencia: isoDate
    }
  }).filter(f => f.fecha_asistencia)

  console.log("FormAsis records:", formAsis.length)
  if (formAsis.length > 0) {
    console.log("First FormAsis:", formAsis[0])
    console.log("Is fecha_asistencia === fecha_dia1_ref?", formAsis[0].fecha_asistencia === fecha_dia1_ref)
  }

  const mapFormFull = new Map()
  for (const f of formAsis) {
    const doc = f.postulante_documento
    if (!mapFormFull.has(doc)) {
      mapFormFull.set(doc, f)
    } else {
      const existing = mapFormFull.get(doc)
      if (f.motivo_baja === 'BAJA DIA 1') {
        mapFormFull.set(doc, f)
      } else if (existing.motivo_baja !== 'BAJA DIA 1' && f.fecha_asistencia === fecha_dia1_ref) {
        mapFormFull.set(doc, f)
      } else if (f.fecha_asistencia === fecha_dia1_ref) {
        mapFormFull.set(doc, f)
      }
    }
  }

  console.log("MapFormFull size:", mapFormFull.size)
  
  if (mapFormFull.size > 0) {
      const firstDoc = Array.from(mapFormFull.keys())[0]
      const formRecord = mapFormFull.get(firstDoc)
      const formSigla = formRecord ? formRecord.sigla_asistencia : 'Sin registro'
      const isBajaDia1 = formRecord && formSigla === 'B' && formRecord.motivo_baja === 'BAJA DIA 1'
      const effectiveFormSigla = isBajaDia1 ? 'Sin registro' : formSigla;
      console.log("Test doc:", firstDoc, "effectiveFormSigla:", effectiveFormSigla)
  }
}
run()
