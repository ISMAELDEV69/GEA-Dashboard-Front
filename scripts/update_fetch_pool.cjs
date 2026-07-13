const fs = require('fs');

let content = fs.readFileSync('src/lib/dataService.js', 'utf8');

// Update fetchGoogleFormsPool to reverse the rows
const newFunc = `
import * as XLSX from 'xlsx'

export async function fetchGoogleFormsPool(url) {
  try {
    const response = await fetch(url)
    if (!response.ok) throw new Error('Error al descargar el archivo: ' + response.statusText)
    const arrayBuffer = await response.arrayBuffer()
    const workbook = XLSX.read(arrayBuffer, { type: 'array' })
    const sheetName = workbook.SheetNames[0]
    const worksheet = workbook.Sheets[sheetName]
    const matrix = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' })
    
    if (matrix.length < 2) return []
    
    // Clean headers
    for (let i = 0; i < Math.min(matrix.length, 10); i++) {
      if (matrix[i].some(c => String(c).toUpperCase().includes('DNI'))) {
        const { mapGoogleFormHeaders, parseGoogleFormRow } = await import('./nominaConsolidadoSchema.js')
        const colIdx = mapGoogleFormHeaders(matrix[i])
        
        let rows = []
        for (let j = i + 1; j < matrix.length; j++) {
          const row = matrix[j]
          // Ignore empty rows
          if (!row.some(c => String(c).trim() !== '')) continue
          rows.push(parseGoogleFormRow(row, colIdx))
        }
        
        // Reverse to show newest first, and limit to top 800 to avoid saturation
        rows = rows.reverse().slice(0, 800)
        return rows
      }
    }
    return []
  } catch (err) {
    console.error('fetchGoogleFormsPool error:', err)
    throw err
  }
}
`

content = content.replace(/export async function fetchGoogleFormsPool[\s\S]+?\}\n\}/, newFunc.trim())
fs.writeFileSync('src/lib/dataService.js', content)
console.log('fetchGoogleFormsPool updated for reverse sorting');
