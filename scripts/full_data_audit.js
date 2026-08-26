import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://lqvvhovfvwzaprdgdobc.supabase.co'
const SUPABASE_KEY = 'sb_publishable_hqkYCTr8g29RzFZnXiho5Q_7QAGdUKg'
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

async function runAudit() {
  console.log('=== INICIANDO AUDITORÍA COMPLETA DE GRUPOS EN LA WEB ===')

  // 1. Obtener todas las nóminas
  const { data: nominas, error: errNom } = await supabase
    .from('nominas')
    .select('id, documento, nombres, apellido_paterno, grupo_codigo, campana, reclutador, periodo_reclutado, semana_trabajo, created_at, activo')

  if (errNom) {
    console.error('Error cargando nominas:', errNom)
    return
  }

  // 2. Obtener todas las capacidades
  const { data: capacidades } = await supabase
    .from('capacidad_rys')
    .select('codigo, campana, segmento, periodo, semana_label, semana_trabajo, meta_dia_1, rq_solicitado, estado')

  const capMap = new Map()
  ;(capacidades || []).forEach(c => {
    const cod = String(c.codigo || '').trim().toUpperCase()
    if (cod) capMap.set(cod, c)
  })

  // 3. Agrupar nóminas por grupo_codigo
  const gruposMap = {}

  nominas.forEach(n => {
    const gpe = String(n.grupo_codigo || 'SIN_GRUPO').trim().toUpperCase()
    if (!gruposMap[gpe]) {
      gruposMap[gpe] = {
        grupo_codigo: gpe,
        campanas: new Set(),
        periodos: new Set(),
        semanas: new Set(),
        reclutadores: {},
        total_postulantes: 0,
        activos: 0,
        primera_carga: n.created_at,
        ultima_carga: n.created_at,
        muestra_postulantes: []
      }
    }

    const g = gruposMap[gpe]
    if (n.campana) g.campanas.add(String(n.campana).trim())
    if (n.periodo_reclutado) g.periodos.add(String(n.periodo_reclutado).trim())
    if (n.semana_trabajo) g.semanas.add(String(n.semana_trabajo).trim())

    const rec = String(n.reclutador || 'NO ESPECIFICADO').trim().toUpperCase()
    g.reclutadores[rec] = (g.reclutadores[rec] || 0) + 1

    g.total_postulantes += 1
    if (n.activo !== false) g.activos += 1

    if (n.created_at && (!g.primera_carga || n.created_at < g.primera_carga)) g.primera_carga = n.created_at
    if (n.created_at && (!g.ultima_carga || n.created_at > g.ultima_carga)) g.ultima_carga = n.created_at

    if (g.muestra_postulantes.length < 3) {
      g.muestra_postulantes.push(`${n.documento} - ${n.nombres} ${n.apellido_paterno}`)
    }
  })

  console.log(`\nTotal Grupos con Nóminas en la Web: ${Object.keys(gruposMap).length}`)
  console.log(`Total Personas en Nóminas: ${nominas.length}\n`)

  const summary = Object.values(gruposMap).sort((a, b) => b.total_postulantes - a.total_postulantes)

  summary.forEach((g, idx) => {
    const cap = capMap.get(g.grupo_codigo)
    const reclutadorStr = Object.entries(g.reclutadores)
      .map(([name, count]) => `${name} (${count})`)
      .join(', ')

    console.log(`--------------------------------------------------------------------------------`)
    console.log(`${idx + 1}. GRUPO: ${g.grupo_codigo}`)
    console.log(`   - Campaña(s): ${Array.from(g.campanas).join(' / ') || cap?.campana || 'N/A'}`)
    console.log(`   - Segmento: ${cap?.segmento || 'N/A'}`)
    console.log(`   - Período: ${Array.from(g.periodos).join(', ') || cap?.periodo || 'N/A'} | Semana: ${Array.from(g.semanas).join(', ') || cap?.semana_label || cap?.semana_trabajo || 'N/A'}`)
    console.log(`   - Total Postulantes: ${g.total_postulantes} (Activos: ${g.activos}) | Meta D1: ${cap?.meta_dia_1 ?? '—'} | RQ: ${cap?.rq_solicitado ?? '—'}`)
    console.log(`   - Reclutador(es): ${reclutadorStr}`)
    console.log(`   - Última Carga: ${g.ultima_carga || '—'}`)
  })
}

runAudit().catch(console.error)
