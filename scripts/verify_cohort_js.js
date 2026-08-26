import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://ujqehcpglfhnytzsyedp.supabase.co'
const SUPABASE_KEY = 'sb_publishable_wt_Muu3dmb0GjulWMDYpqg_NKRYqKNE'
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

async function fetchAllConsolidado() {
  const { count } = await supabase.from('consolidado_asistencias').select('*', { count: 'exact', head: true })
  const totalRows = count || 0
  const CHUNK_SIZE = 5000
  const promises = []
  for (let from = 0; from < totalRows; from += CHUNK_SIZE) {
    const to = Math.min(from + CHUNK_SIZE - 1, totalRows - 1)
    promises.push(
      supabase
        .from('consolidado_asistencias')
        .select('documento, campana, codigo_grupo, grupo, fecha_registro_asistencia, sigla, motivo_baja')
        .range(from, to)
        .then(res => res.data || [])
    )
  }
  const chunks = await Promise.all(promises)
  return chunks.flat()
}

function normalizeDate(d) {
  if (!d) return null
  return String(d).substring(0, 10).trim()
}

async function run() {
  console.log('Fetching consolidado...')
  const rawData = await fetchAllConsolidado()
  console.log('Total registros descargados:', rawData.length)

  // 1. Numerar sesiones lectivas reales de clase (DENSE_RANK) por campana + COALESCE(codigo_grupo, grupo)
  // EXACTAMENTE como el SQL:
  // PARTITION BY campana, COALESCE(codigo_grupo, grupo) ORDER BY fecha_registro_asistencia ASC
  const groupDatesMap = new Map() // "campana|gpe" -> Set de fechas

  rawData.forEach(row => {
    const campana = row.campana || 'SIN CAMPAÑA'
    const grupo = row.codigo_grupo || row.grupo || 'SIN GRUPO'
    const fecha = normalizeDate(row.fecha_registro_asistencia)
    if (!fecha) return

    const gKey = `${campana}|${grupo}`
    if (!groupDatesMap.has(gKey)) groupDatesMap.set(gKey, new Set())
    groupDatesMap.get(gKey).add(fecha)
  })

  const sessionNumMap = new Map() // "campana|grupo|fecha" -> dia_sesion (1, 2, 3...)
  groupDatesMap.forEach((dateSet, gKey) => {
    const sortedDates = Array.from(dateSet).sort() // ISO YYYY-MM-DD sort es cronológico exacto
    sortedDates.forEach((dStr, idx) => {
      sessionNumMap.set(`${gKey}|${dStr}`, idx + 1)
    })
  })

  // 2. Resumir por postulante: start_day y first_baja_day
  const postulanteMap = new Map() // doc -> { start_day, first_baja_day }

  rawData.forEach(row => {
    const doc = row.documento ? String(row.documento).trim() : null
    if (!doc) return
    const campana = row.campana || 'SIN CAMPAÑA'
    const grupo = row.codigo_grupo || row.grupo || 'SIN GRUPO'
    const fecha = normalizeDate(row.fecha_registro_asistencia)
    if (!fecha) return

    const gKey = `${campana}|${grupo}`
    const diaSesion = sessionNumMap.get(`${gKey}|${fecha}`)
    if (!diaSesion || diaSesion < 1 || diaSesion > 15) return

    const sigla = String(row.sigla || '').trim().toUpperCase()
    const mot = String(row.motivo_baja || '').trim().toUpperCase()
    const esBaja = (sigla === 'B' || (mot !== '' && mot !== 'NULL'))

    if (!postulanteMap.has(doc)) {
      postulanteMap.set(doc, {
        start_day: diaSesion,
        first_baja_day: null
      })
    }

    const p = postulanteMap.get(doc)
    if (diaSesion < p.start_day) p.start_day = diaSesion
    if (esBaja) {
      if (p.first_baja_day === null || diaSesion < p.first_baja_day) {
        p.first_baja_day = diaSesion
      }
    }
  })

  const allPersons = Array.from(postulanteMap.values())
  const totalInicial = allPersons.filter(p => p.start_day <= 2).length || allPersons.length

  console.log(`\n📊 POBLACIÓN INICIAL DE LA COHORTE: ${totalInicial}\n`)

  const results = []
  for (let day = 1; day <= 15; day++) {
    let activos = 0
    let bajas = 0

    allPersons.forEach(p => {
      if (p.start_day <= day) {
        if (p.first_baja_day === null || p.first_baja_day > day) {
          activos++
        } else if (p.first_baja_day === day) {
          bajas++
        }
      }
    })

    const totalEnProceso = activos + bajas
    const pctRetencionAcumulada = totalInicial > 0 ? ((activos / totalInicial) * 100).toFixed(1) : '0.0'
    const pctSupervivenciaDiaria = totalEnProceso > 0 ? ((activos / totalEnProceso) * 100).toFixed(1) : '100.0'

    results.push({
      dia: `Día ${day}`,
      activos_en_sesion: activos,
      bajas_en_esta_sesion: bajas,
      total_en_proceso: totalEnProceso,
      pct_retencion_acumulada: `${pctRetencionAcumulada}%`,
      pct_supervivencia_diaria: `${pctSupervivenciaDiaria}%`
    })
  }

  console.table(results)
}

run().catch(console.error)
