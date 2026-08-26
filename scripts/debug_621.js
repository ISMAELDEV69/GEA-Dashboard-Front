import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://lqvvhovfvwzaprdgdobc.supabase.co'
const SUPABASE_KEY = 'sb_publishable_hqkYCTr8g29RzFZnXiho5Q_7QAGdUKg'
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

async function debug621() {
  console.log('='.repeat(70))
  console.log('DIAGNOSTICO: Por que el dashboard muestra 621?')
  console.log('='.repeat(70))

  // PASO 1: Leer capacidad_rys (igual que fetchCapacidadRysOperativo)
  const { data: capRys, error: errCap } = await supabase
    .from('capacidad_rys')
    .select('codigo, campana')
    .order('periodo', { ascending: false })

  if (errCap) { console.error('Error leyendo capacidad_rys:', errCap.message); return; }
  
  const codigos = [...new Set((capRys || []).map(g => g.codigo).filter(Boolean))]
  const campanas = [...new Set((capRys || []).map(g => g.campana).filter(Boolean))]
  const validPairs = new Set((capRys || []).map(g => `${g.campana || ''}|${g.codigo || ''}`))

  console.log('\nPASO 1 - capacidad_rys')
  console.log('  Total grupos: ' + (capRys || []).length)
  console.log('  Codigos unicos: ' + codigos.length)
  console.log('  Campanas unicas: ' + campanas.length)
  console.log('  Pares validos (campana|codigo): ' + validPairs.size)

  // PASO 2: Consulta bruta a nominas con IN/IN
  let rawNominas = []
  let nFrom = 0
  while(true) {
    const { data } = await supabase.from('nominas')
      .select('documento, grupo_codigo, campana')
      .in('grupo_codigo', codigos)
      .in('campana', campanas)
      .range(nFrom, nFrom + 999)
    if (!data || data.length === 0) break
    rawNominas = rawNominas.concat(data)
    if (data.length < 1000) break
    nFrom += 1000
  }

  console.log('\nPASO 2 - Nominas con .in(grupo_codigo).in(campana) [antes del fix]')
  console.log('  Filas traidas: ' + rawNominas.length)

  // PASO 3: Filtrar con validPairs (fix nuevo)
  const filteredNominas = rawNominas.filter(n => 
    validPairs.has(`${n.campana || ''}|${n.grupo_codigo || ''}`)
  )
  console.log('\nPASO 3 - Despues del filtro validPairs [fix nuevo]')
  console.log('  Filas que pasan el filtro: ' + filteredNominas.length)
  console.log('  Filas EXCLUIDAS por el fix: ' + (rawNominas.length - filteredNominas.length))

  // PASO 4: Total real sin filtros
  let allNominas = []
  let aFrom = 0
  while(true) {
    const { data } = await supabase.from('nominas')
      .select('documento, grupo_codigo, campana')
      .range(aFrom, aFrom + 999)
    if (!data || data.length === 0) break
    allNominas = allNominas.concat(data)
    if (data.length < 1000) break
    aFrom += 1000
  }

  console.log('\nPASO 4 - Total real en tabla nominas (sin filtros)')
  console.log('  Total nominas en DB: ' + allNominas.length)

  // PASO 5: Comparar pares DB vs capacidad_rys
  const paresEnDB = new Set(allNominas.map(n => `${n.campana || ''}|${n.grupo_codigo || ''}`))
  const paresEnDBnoEnCapRys = [...paresEnDB].filter(p => !validPairs.has(p))
  
  console.log('\nPASO 5 - Pares (campana|grupo_codigo) en nominas NO en capacidad_rys')
  console.log('  Pares huerfanos: ' + paresEnDBnoEnCapRys.length)
  
  let totalHuerfanos = 0
  paresEnDBnoEnCapRys.slice(0, 15).forEach(p => {
    const count = allNominas.filter(n => `${n.campana || ''}|${n.grupo_codigo || ''}` === p).length
    totalHuerfanos += count
    console.log('    ' + p + '  -> ' + count + ' registros')
  })
  
  if (paresEnDBnoEnCapRys.length > 15) {
    const restante = paresEnDBnoEnCapRys.slice(15).reduce((acc, p) => {
      return acc + allNominas.filter(n => `${n.campana || ''}|${n.grupo_codigo || ''}` === p).length
    }, 0)
    totalHuerfanos += restante
    console.log('    ... y ' + (paresEnDBnoEnCapRys.length - 15) + ' mas con ' + restante + ' registros')
  }

  console.log('\n' + '='.repeat(70))
  console.log('RESUMEN:')
  console.log('  Total en DB (sin filtros):          ' + allNominas.length)
  console.log('  Con .in(grupo).in(campana) [ANTES]: ' + rawNominas.length)
  console.log('  Con filtro validPairs [AHORA]:       ' + filteredNominas.length)
  console.log('  Registros sin grupo en capacidad_rys: ' + (allNominas.length - filteredNominas.length))
  console.log('='.repeat(70))
  
  if (allNominas.length > filteredNominas.length) {
    console.log('\nCONCLUSION: El dashboard NO muestra ' + (allNominas.length - filteredNominas.length) + ' registros')
    console.log('porque esos grupos/campanas no estan en la tabla capacidad_rys.')
    console.log('Son nominas "huerfanas" sin grupo padre registrado en el sistema.')
  } else if (rawNominas.length > filteredNominas.length) {
    console.log('\nCONCLUSION: El fix corrijo ' + (rawNominas.length - filteredNominas.length) + ' registros de')
    console.log('contaminacion cartesiana. El numero correcto es ' + filteredNominas.length)
  } else {
    console.log('\nCONCLUSION: Todos los numeros coinciden. Revisar cache o filtros de UI.')
  }
}

debug621().catch(console.error)
