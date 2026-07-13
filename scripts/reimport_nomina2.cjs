const XLSX = require('xlsx')
const { Client } = require('pg')
const fs = require('fs')

const envStr = fs.readFileSync('.env.local', 'utf8')
let dbUrl;
for (const line of envStr.split('\n')) {
  if (line.startsWith('DATABASE_URL=')) dbUrl = line.split('=')[1].trim();
}

const client = new Client({ connectionString: dbUrl })

async function run() {
  await client.connect()
  try {
     const wb = XLSX.readFile("/Users/saidaquino/Library/Mobile Documents/com~apple~CloudDocs/ARCHIVOS/IMPLEMENTACION PORTAL/__MACOSX-1/GEAismael/PLANTILLA NOMINA/SEMANA 17 GRUPO PRUEBA.xlsx")
     const ws = wb.Sheets[wb.SheetNames[0]]
     const data = XLSX.utils.sheet_to_json(ws, { header: 1 })
     
     const headers = data[0]
     const dia0Idx = 55  // Known from previous inspection
     const dia1Idx = 58
     const dniIdx = 6   // "Nro de DNI o C.E."
     
     // Check current DB state
     const existing = await client.query(`SELECT postulante_documento, dia_0 FROM nominas WHERE dia_0 IS NOT NULL LIMIT 5`)
     console.log("Rows with dia_0:", existing.rowCount, existing.rows.slice(0,3))
     
     const total = await client.query(`SELECT count(*) FROM nominas`)
     console.log("Total nominas:", total.rows[0].count)
     
     let updated = 0
     for(let i = 1; i < data.length; i++) {
       const row = data[i]
       if(!row || row.every(c => !c)) continue
       const dni = String(row[dniIdx] || '').trim()
       if(!dni) continue
       const dia0Val = String(row[dia0Idx] || '').trim().toUpperCase()
       const dia1Val = String(row[dia1Idx] || '').trim().toUpperCase()
       
       // Always update (even if already set)
       const res = await client.query(
         `UPDATE nominas SET dia_0 = $1, dia_1 = $2 WHERE postulante_documento = $3 RETURNING id`,
         [dia0Val || null, dia1Val || null, dni]
       )
       updated += res.rowCount
       if(res.rowCount > 0 && i <= 5) {
         console.log("Updated DNI:", dni, "dia_0:", dia0Val, "dia_1:", dia1Val)
       }
     }
     console.log("Total updated:", updated)
     
     // Verify
     const check = await client.query(`SELECT postulante_documento, dia_0, dia_1 FROM nominas WHERE dia_0 IS NOT NULL LIMIT 10`)
     console.log("After update:", check.rows)
  } catch(e) {
     console.error("Error:", e.message)
  }
  await client.end()
}
run()
