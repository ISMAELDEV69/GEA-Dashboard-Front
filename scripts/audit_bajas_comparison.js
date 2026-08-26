import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://ujqehcpglfhnytzsyedp.supabase.co'
const SUPABASE_KEY = 'sb_publishable_wt_Muu3dmb0GjulWMDYpqg_NKRYqKNE'

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

function normalizeText(value, fallback = '') {
  if (value === null || value === undefined) return fallback
  return String(value).trim()
}

function isBajaDia1(motivo, sigla, row) {
  const m = normalizeText(motivo).toUpperCase()
  const s = normalizeText(sigla).toUpperCase()
  const t = normalizeText(row?.tipo_baja || row?.tipo || '').toUpperCase()
  
  if (t.includes('DIA_1') || t.includes('DIA 1') || t.includes('D1')) return true
  if (s === 'BD1' || s === 'D1') return true
  if (
    m === 'BAJA DIA 1' || 
    m === 'BAJA DÍA 1' || 
    m === 'BAJA D1' || 
    m === 'DÍA 1' || 
    m === 'DIA 1' || 
    m.includes('BAJA DIA 1') || 
    m.includes('BAJA DÍA 1') || 
    m.includes('BAJA D1') ||
    m.includes('(BAJA DIA 1)') ||
    m.includes('(BAJA DÍA 1)')
  ) return true
  return false
}

async function runAudit() {
  console.log('=== AUDITORIA DETALLADA: MOTIVOS DE BAJAS VS RESUMEN CAPACITACION ===\n')

  // 1. Fetch capacidad_rys
  const { data: capData } = await supabase
    .from('capacidad_rys')
    .select('codigo, campana, meta_dia_1, rq_solicitado, fecha_inicio_ojt, periodo, segmento, semana_label, semana_trabajo')

  const capMap = new Map()
  capData.forEach(c => {
    capMap.set(`${String(c.campana).trim().toUpperCase()}|${String(c.codigo).trim().toUpperCase()}`, c)
    capMap.set(String(c.codigo).trim().toUpperCase(), c)
  })

  // 2. Fetch consolidado_asistencias
  let consolidado = []
  let from = 0
  const step = 2000
  while (true) {
    const { data, error } = await supabase
      .from('consolidado_asistencias')
      .select('*')
      .range(from, from + step - 1)
    if (error) {
      console.error('Error fetching consolidado:', error)
      break
    }
    if (data && data.length > 0) {
      consolidado = consolidado.concat(data)
      if (data.length < step) break
      from += step
    } else {
      break
    }
  }

  console.log(`Total registros en consolidado_asistencias: ${consolidado.length}`)

  // Filtrar grupos de Periodo = 202608 y Semana = 34 / SEM 34
  const gruposSemana34 = capData.filter(c => {
    const p = String(c.periodo || '').trim()
    const sem = String(c.semana_label || c.semana_trabajo || '').replace(/\D/g, '')
    return p === '202608' && sem === '34'
  })

  console.log(`Grupos en Periodo 202608, Semana 34: ${gruposSemana34.length}`)
  gruposSemana34.forEach(g => {
    console.log(`  - Grupo: ${g.codigo}, Campaña: ${g.campana}, Segmento: ${g.segmento}, OJT: ${g.fecha_inicio_ojt}`)
  })

  const codigosGpeSemana34 = new Set(gruposSemana34.map(g => String(g.codigo).trim().toUpperCase()))

  // Registros en consolidado para estos grupos
  const asistenciasSemana34 = consolidado.filter(r => {
    const gCode = String(r.codigo_grupo || r.grupo || '').trim().toUpperCase()
    return codigosGpeSemana34.has(gCode)
  })

  console.log(`\nTotal asistencias en consolidado para Semana 34: ${asistenciasSemana34.length}`)

  // Analizar cada registro con el criterio de ResumenCapacitacion vs MotivosBajasBI
  const bajasResumenCapacitacion = []
  const bajasMotivosBI = []

  const seenResumen = new Set()
  const seenMotivos = new Set()

  asistenciasSemana34.sort((a, b) => new Date(a.fecha_registro_asistencia || 0) - new Date(b.fecha_registro_asistencia || 0))

  for (const r of asistenciasSemana34) {
    const doc = String(r.documento || '').trim()
    const sigla = String(r.sigla || '').trim().toUpperCase()
    const estado = String(r.estado || '').trim().toUpperCase()
    const motivo = String(r.motivo_baja || '').trim().toUpperCase()
    const fecha = r.fecha_registro_asistencia

    // Criterio ResumenCapacitacion.jsx (línea 289):
    const isBajaResumen = sigla === 'B' || motivo.includes('BAJA') || estado === 'CESADO' || estado === 'BAJA' || estado === 'INACTIVO'
    if (isBajaResumen && doc && !seenResumen.has(doc)) {
      seenResumen.add(doc)
      bajasResumenCapacitacion.push({
        doc,
        nombre: `${r.nombres || ''} ${r.apellido_paterno || ''}`,
        grupo: r.codigo_grupo || r.grupo,
        campana: r.campana,
        fecha,
        sigla,
        estado,
        motivo,
        isBajaDia1: isBajaDia1(motivo, sigla, r)
      })
    }

    // Criterio MotivosBajasBI.jsx (línea 191-192):
    const isDia1 = isBajaDia1(motivo, sigla, r)
    const isBajaMotivos = !isDia1 && (sigla === 'B' || sigla === 'BAJA' || (motivo !== '' && motivo !== 'NULL')) && sigla !== 'ASISTIO' && sigla !== 'A'
    if (isBajaMotivos && doc && !seenMotivos.has(doc)) {
      seenMotivos.add(doc)
      bajasMotivosBI.push({
        doc,
        nombre: `${r.nombres || ''} ${r.apellido_paterno || ''}`,
        grupo: r.codigo_grupo || r.grupo,
        campana: r.campana,
        fecha,
        sigla,
        estado,
        motivo,
        isBajaDia1: isDia1
      })
    }
  }

  console.log(`\n======================================================`)
  console.log(`RESULTADO RESUMEN CAPACITACION: ${bajasResumenCapacitacion.length} bajas detectadas`)
  console.log(`RESULTADO MOTIVOS DE BAJAS BI : ${bajasMotivosBI.length} bajas detectadas`)
  console.log(`======================================================\n`)

  console.log(`--- DESGLOSE DE LAS ${bajasResumenCapacitacion.length} BAJAS DE RESUMEN CAPACITACION ---`)
  bajasResumenCapacitacion.forEach((b, i) => {
    console.log(`${i + 1}. Doc: ${b.doc} | Fecha: ${b.fecha} | Grupo: ${b.grupo} | Sigla: "${b.sigla}" | Estado: "${b.estado}" | Motivo: "${b.motivo}" | ¿Es Baja Dia 1?: ${b.isBajaDia1 ? 'SI (EXCLUIDO EN MOTIVOS BI)' : 'NO'}`)
  })

  console.log(`\n--- DESGLOSE DE LAS ${bajasMotivosBI.length} BAJAS DE MOTIVOS DE BAJAS BI ---`)
  bajasMotivosBI.forEach((b, i) => {
    console.log(`${i + 1}. Doc: ${b.doc} | Fecha: ${b.fecha} | Grupo: ${b.grupo} | Sigla: "${b.sigla}" | Estado: "${b.estado}" | Motivo: "${b.motivo}"`)
  })
}

runAudit().catch(console.error)
