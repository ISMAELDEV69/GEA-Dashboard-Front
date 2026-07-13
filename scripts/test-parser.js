import { syncCapacidadRysFromDrive } from './src/lib/dataService.js'
import fs from 'fs'

async function run() {
  const { parseCapacidadRysCsv } = await import('./src/lib/capacidadRysSchema.js')
  const res = await fetch("https://docs.google.com/spreadsheets/d/1GNbzbpIDbueydVqOQr-D032Pma1L9FkHf-JPsU9Qi1s/export?format=csv&gid=249081259")
  const text = await res.text()
  
  const payloads = parseCapacidadRysCsv(text)
  console.log("Total parsed:", payloads.length)
  
  // Find a row that has OJT
  const withOjt = payloads.find(p => p.fecha_inicio_ojt)
  console.log("Row with OJT:")
  console.log(withOjt)
  
  // Let's check some random dates
  const randomDates = payloads.slice(100, 105).map(p => ({
    codigo: p.codigo,
    f_reg: p.fecha_registro,
    f_ojt: p.fecha_inicio_ojt,
    f_op: p.fecha_ingreso_op
  }))
  console.log("Random dates:", randomDates)
}

run()
