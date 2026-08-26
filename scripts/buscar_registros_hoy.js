import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://lqvvhovfvwzaprdgdobc.supabase.co'
const SUPABASE_KEY = 'sb_publishable_hqkYCTr8g29RzFZnXiho5Q_7QAGdUKg'
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

async function buscarRegistrosHoy() {
  console.log('='.repeat(80))
  console.log('🔍 BÚSQUEDA DE REGISTROS CON FECHA RECIENTE / HOY')
  console.log('='.repeat(80))

  // 1. Buscar en consolidado_asistencias con fechas de agosto
  const { data: asistenciasAgosto, error: errAsis } = await supabase
    .from('consolidado_asistencias')
    .select('id, codigo_grupo, campana, documento, apellido_paterno, nombres, fecha_registro_asistencia, sigla, estado, created_at')
    .ilike('created_at', '%2026-08%')
    .order('created_at', { ascending: false })
    .limit(20)

  console.log('\n1. Registros en consolidado_asistencias con created_at en Agosto 2026:')
  if (errAsis) console.log('Error:', errAsis.message)
  else {
    console.log(`Total encontrados en muestra: ${asistenciasAgosto?.length || 0}`)
    if (asistenciasAgosto && asistenciasAgosto.length > 0) {
      console.log('Últimos timestamps creados en DB:')
      asistenciasAgosto.slice(0, 5).forEach(r => {
        console.log(`  - Grupo: ${r.codigo_grupo} | Fecha Asis: ${r.fecha_registro_asistencia} | created_at: ${r.created_at}`)
      })
    }
  }

  // 2. Buscar por fecha_registro_asistencia que contenga 14/8, 14-08, o 2026-08-14
  const { data: porFecha, error: errFecha } = await supabase
    .from('consolidado_asistencias')
    .select('id, codigo_grupo, campana, documento, fecha_registro_asistencia, sigla, created_at')
    .or('fecha_registro_asistencia.ilike.%14/8%,fecha_registro_asistencia.ilike.%14/08%,fecha_registro_asistencia.ilike.%2026-08-14%')

  console.log('\n2. Registros con fecha_registro_asistencia = 14 de Agosto:')
  if (errFecha) console.log('Error:', errFecha.message)
  else {
    console.log(`Total con fecha de asistencia de hoy (14/08): ${porFecha?.length || 0}`)
    if (porFecha && porFecha.length > 0) {
      console.table(porFecha)
    }
  }

  // 3. Revisar en todas las tablas si hay algún created_at o updated_at hoy (2026-08-14)
  const tables = ['asistencias_capacitacion', 'nominas', 'capacidad_rys', 'audit_logs', 'descuentos']
  console.log('\n3. Verificación de actividad general en otras tablas hoy (2026-08-14):')
  
  for (const table of tables) {
    try {
      const { data, error, count } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true })
        .gte('created_at', '2026-08-14T00:00:00Z')

      if (error) {
        // Intenta buscar por columna fecha si no tiene created_at
        const { count: countFecha } = await supabase
          .from(table)
          .select('*', { count: 'exact', head: true })
          .gte('fecha', '2026-08-14T00:00:00Z')
        console.log(`  - ${table}: ${countFecha ?? 'N/A'} registros con fecha hoy`)
      } else {
        console.log(`  - ${table}: ${count || 0} registros con created_at hoy (2026-08-14)`)
      }
    } catch (e) {
      console.log(`  - ${table}: Error consultando`)
    }
  }

  // 4. Ver el último registro absoluto en toda la tabla consolidado_asistencias
  const { data: maxCreated } = await supabase
    .from('consolidado_asistencias')
    .select('created_at, fecha_registro_asistencia, codigo_grupo')
    .order('created_at', { ascending: false })
    .limit(1)

  console.log('\n4. Último registro absoluto en consolidado_asistencias:')
  console.log(maxCreated)
}

buscarRegistrosHoy().catch(console.error)
