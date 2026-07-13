import fs from 'fs'

async function run() {
  const { parseCapacidadRysCsv } = await import('./src/lib/capacidadRysSchema.js')
  const res = await fetch("https://docs.google.com/spreadsheets/d/1GNbzbpIDbueydVqOQr-D032Pma1L9FkHf-JPsU9Qi1s/export?format=csv&gid=249081259")
  const text = await res.text()
  
  const parseLineRobust = (text) => {
    const rows = []
    let row = [], cell = '', inQuotes = false
    for (let i = 0; i < text.length; i++) {
      const ch = text[i], next = text[i + 1]
      if (inQuotes) {
        if (ch === '"' && next === '"') { cell += '"'; i++ }
        else if (ch === '"') inQuotes = false
        else cell += ch
      } else if (ch === '"') { inQuotes = true } 
      else if (ch === ',' || ch === '\t') { row.push(cell); cell = '' } 
      else if (ch === '\r') {} 
      else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = '' } 
      else { cell += ch }
    }
    if (cell || row.length > 0) { row.push(cell); rows.push(row) }
    return rows
  }

  const matrix = parseLineRobust(text)
  const header = matrix[0]
  const gpeIndex = header.findIndex(h => h.includes('GRUPO DE CAPA'))
  
  const target = 'GPE-2026001'
  const found = matrix.filter(r => String(r[gpeIndex]||'').trim() === target)
  
  // print just a few columns to see if they differ
  const campanaIdx = header.findIndex(h => h.includes('CAMPAÑA'))
  const segmentoIdx = header.findIndex(h => h.includes('SEGMENTO'))
  const fechaIdx = header.findIndex(h => h.includes('FECHA DE INICIO'))
  
  console.log(`Rows for ${target}:`)
  found.forEach(r => {
    console.log(`${r[segmentoIdx]} | ${r[campanaIdx]} | ${r[fechaIdx]}`)
  })
}

run()
