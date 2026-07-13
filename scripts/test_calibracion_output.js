import fs from 'fs'
import { createClient } from '@supabase/supabase-js'

const envStr = fs.readFileSync('.env.local', 'utf8')
let url, key;
for (const line of envStr.split('\n')) {
  if (line.startsWith('VITE_SUPABASE_URL=')) url = line.split('=')[1].trim();
  if (line.startsWith('VITE_SUPABASE_ANON_KEY=')) key = line.split('=')[1].trim();
}
const supabase = createClient(url, key)

async function getDetalleCalibracion(grupo_codigo) {
  const { data: grpData } = await supabase.from('grupos_capacitacion').select('id, campana_id').eq('codigo', grupo_codigo).order('created_at', { ascending: false }).limit(1).single()
  const grupo_id = grpData.id

  const { data: config } = await supabase.from('grupos_dia1').select('*').eq('grupo_id', grupo_id).limit(1).maybeSingle()
  const fecha_dia1_ref = config.fecha_dia1

  const { data: recAsis } = await supabase.from('asistencias_dia1_reclutador').select('*').eq('grupo_id', grupo_id)
  
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

  if (!recAsis) return []

  const docs = [...new Set([...recAsis.map(r => r.postulante_documento), ...formAsis.map(f => f.postulante_documento)])]
  const { data: postulantes } = await supabase.from('postulantes').select('documento, nombres, apellido_paterno, apellido_materno').in('documento', docs)
  const mapNombres = new Map(postulantes?.map(p => [p.documento, `${p.apellido_paterno} ${p.apellido_materno}, ${p.nombres}`]) || [])

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

  const mapRec = new Map(recAsis.map(r => [r.postulante_documento, r.sigla_final]))
  
  const allDocs = new Set([...mapFormFull.keys(), ...mapRec.keys()])
  const discrepancias = []
  
  for (const doc of allDocs) {
    const formRecord = mapFormFull.get(doc)
    const recSigla = mapRec.get(doc) || 'Sin registro'
    
    const formSigla = formRecord ? formRecord.sigla_asistencia : 'Sin registro'
    const isBajaDia1 = formRecord && formSigla === 'B' && formRecord.motivo_baja === 'BAJA DIA 1'
    
    const effectiveFormSigla = isBajaDia1 ? 'Sin registro' : formSigla;
    
    const isFormAsistencia = effectiveFormSigla === 'A' || effectiveFormSigla === 'I-OP'
    const isRecAsistencia = recSigla === 'A'
    
    if (isFormAsistencia !== isRecAsistencia) {
      discrepancias.push({
        documento: doc,
        nombre: mapNombres.get(doc) || 'Desconocido',
        sigla_formador: effectiveFormSigla,
        sigla_reclutador: recSigla
      })
    }
  }
  
  return { discrepancias, countRec: recAsis.filter(r => r.sigla_final === 'A').length, formRecordsCount: mapFormFull.size }
}

run()
async function run() {
   const res = await getDetalleCalibracion('GPE-2026013')
   console.log("Results:", res)
}
