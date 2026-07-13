import fs from 'fs'

async function run() {
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
  const campanaIdx = header.findIndex(h => h.includes('CAMPAÑA'))
  
  const rawCodes = []
  for(let i=1; i<matrix.length; i++) {
    if (matrix[i].every(c => !String(c).trim())) continue
    const code = String(matrix[i][gpeIndex] || '').trim()
    const campana = String(matrix[i][campanaIdx] || '').trim()
    if (code) rawCodes.push(`${code} | ${campana}`)
  }
  
  const counts = {}
  for (const c of rawCodes) {
    counts[c] = (counts[c] || 0) + 1
  }
  const duplicates = Object.entries(counts).filter(([k,v]) => v > 1)
  console.log("Duplicates on (GPE, Campaña):")
  console.log(duplicates)
}

run()
