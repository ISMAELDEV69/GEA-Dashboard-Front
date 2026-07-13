import fs from 'fs'
import pkg from 'pg';
const { Client } = pkg;

const envStr = fs.readFileSync('.env.local', 'utf8')
let dbUrl;
for (const line of envStr.split('\n')) {
  if (line.startsWith('DATABASE_URL=')) dbUrl = line.split('=')[1].trim();
}

const client = new Client({ connectionString: dbUrl })

export function parseLineRobust(text) {
  const rows = []
  let row = []
  let cell = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    const next = text[i + 1]
    if (inQuotes) {
      if (ch === '"' && next === '"') { cell += '"'; i++ }
      else if (ch === '"') inQuotes = false
      else cell += ch
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ',' || ch === '\t') {
      row.push(cell)
      cell = ''
    } else if (ch === '\r') {
    } else if (ch === '\n') {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else {
      cell += ch
    }
  }
  if (cell || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }
  return rows
}

async function run() {
  await client.connect()
  try {
    const csvUrl = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vR5cIgvA11b8Xczt-fwGREZ9XPWMXxPq5OTpNMXgaiU3jEMWD4FwVjAdFpDX5V3fI5lXEQST8S_vI70/pub?output=csv'
    const res = await fetch(csvUrl)
    const text = await res.text()

    const matrix = parseLineRobust(text)
    const headers = matrix[0].map(h => String(h || '').toUpperCase().trim())
    const codigoIdx = headers.findIndex(h => h.includes('GRUPO DE CAPACITACION'))

    const validCodes = []
    
    for (let i = 1; i < matrix.length; i++) {
      const row = matrix[i]
      if (row.every(c => !String(c).trim())) continue
      
      let codigo = String(row[codigoIdx] || '').trim().toUpperCase()
      if (!codigo) continue; // SKIP EMPTY CODES
      
      validCodes.push(codigo)
    }

    console.log(`Found ${validCodes.length} valid actual codes in CSV.`)
    
    // Find codes in DB not in CSV
    const dbCodes = await client.query("SELECT codigo FROM grupos_capacitacion")
    const toDelete = dbCodes.rows.map(r => r.codigo).filter(c => !validCodes.includes(c))
    
    console.log(`Found ${toDelete.length} extra codes in DB to delete.`)
    if (toDelete.length > 0) {
      // Delete in chunks to avoid query limits
      for (let i = 0; i < toDelete.length; i+=100) {
         const chunk = toDelete.slice(i, i+100)
         const placeholders = chunk.map((_, idx) => `$${idx+1}`).join(',')
         await client.query(`DELETE FROM grupos_capacitacion WHERE codigo IN (${placeholders})`, chunk)
      }
      console.log("Deleted extra rows successfully!")
    }

  } catch(e) {
     console.error("Error:", e)
  }
  await client.end()
}
run()
