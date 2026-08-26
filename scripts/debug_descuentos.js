import { createClient } from '@supabase/supabase-js'
const supabase = createClient('https://lqvvhovfvwzaprdgdobc.supabase.co', 'sb_publishable_hqkYCTr8g29RzFZnXiho5Q_7QAGdUKg')

console.log('='.repeat(70))
console.log('DIAGNOSTICO DE DESCUENTOS - Tabla: descuentos')
console.log('='.repeat(70))

// Leer tabla descuentos (igual que getDescuentosSetGlobal)
let allDesc = []
let from = 0
while(true) {
  const { data, error } = await supabase.from('descuentos')
    .select('dni_ce, campana, grupo_cap, procede, autoriza_rys, autoriza_cap')
    .range(from, from + 999)
  if (error) { console.log('Error tabla descuentos:', error.message); break }
  if (!data || data.length === 0) break
  allDesc = allDesc.concat(data)
  if (data.length < 1000) break
  from += 1000
}
console.log('\nTotal en tabla descuentos: ' + allDesc.length)

// Aplicar misma lógica que getDescuentosSetGlobal
const procedeData = allDesc.filter(row => {
  if (String(row.procede || '').trim().toUpperCase() === 'PROCEDE') return true
  const rys = String(row.autoriza_rys || '').trim().toUpperCase() === 'SI'
  const cap = (String(row.autoriza_cap || '').trim().toUpperCase() === 'SI' || !row.autoriza_cap)
  return rys && cap
})
console.log('Descuentos que PROCEDEN: ' + procedeData.length)

// Ver muestra de los que proceden
if (procedeData.length > 0) {
  console.log('\nEjemplos de descuentos que SE APLICAN (excluyen de nomina):')
  procedeData.slice(0, 10).forEach(d => {
    console.log('  DNI/CE: ' + d.dni_ce + ' | Campaña: ' + d.campana + ' | Grupo: ' + d.grupo_cap + ' | Procede: ' + d.procede)
  })
}

// Leer nominas completas
let allNominas = []
let nFrom = 0
while(true) {
  const { data } = await supabase.from('nominas').select('documento, grupo_codigo, campana').range(nFrom, nFrom + 999)
  if (!data || data.length === 0) break
  allNominas = allNominas.concat(data)
  if (data.length < 1000) break
  nFrom += 1000
}
console.log('\nTotal nominas en DB: ' + allNominas.length)

// Construir set de descuentos
function makeKey(doc, campana, grupo) {
  return `${doc}|${campana || ''}|${grupo || ''}`
}
const descSet = new Set(procedeData.map(d => makeKey(d.dni_ce, d.campana, d.grupo_cap)))

// Comparar con nóminas
const nominasSinDescuentos = allNominas.filter(n => !descSet.has(makeKey(n.documento, n.campana, n.grupo_codigo)))
console.log('Nominas despues de aplicar descuentos: ' + nominasSinDescuentos.length)
console.log('Excluidos por descuentos: ' + (allNominas.length - nominasSinDescuentos.length))

console.log('\n' + '='.repeat(70))
console.log('RESUMEN:')
console.log('  Total DB (nominas):               ' + allNominas.length)
console.log('  Excluidos por descuentos:         ' + (allNominas.length - nominasSinDescuentos.length))
console.log('  Resultado final (como dashboard): ' + nominasSinDescuentos.length)
console.log('  Dashboard muestra actualmente:    621')
console.log('='.repeat(70))

if (nominasSinDescuentos.length === 621) {
  console.log('\n✅ CONFIRMADO: El 621 es correcto dado los descuentos actuales.')
  console.log('   Si quieres ver 638, revisa si los descuentos son correctos.')
} else {
  console.log('\n❓ El calculo da ' + nominasSinDescuentos.length + ' pero el dashboard muestra 621.')
  console.log('   Puede haber un problema en la key de descuentos (campo dni_ce vs documento, o grupo_cap vs grupo_codigo).')
}
