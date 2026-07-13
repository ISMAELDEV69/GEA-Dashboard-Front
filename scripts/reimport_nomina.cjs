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
     // Find DIA 0 column
     const dia0Idx = headers.findIndex(h => String(h).toUpperCase().match(/DI[AÁ]\s*0$/) && !String(h).toUpperCase().includes('EVALUACION'))
     const dia0obsIdx = headers.findIndex((h, i) => i > dia0Idx && String(h).toUpperCase().includes('OBSERVACION'))
     const statusDia1Idx = headers.findIndex(h => String(h).toUpperCase().includes('STATUS DIA 1') || String(h).toUpperCase().includes('STATUS DÍA 1'))
     const dia1Idx = headers.findIndex(h => String(h).toUpperCase().match(/DI[AÁ]\s*1$/) && !String(h).toUpperCase().includes('EVALUACION'))
     const dniIdx = headers.findIndex(h => String(h).toUpperCase().includes('DNI') || String(h).toUpperCase().includes('DOCUMENTO'))
     
     console.log("Indices - DNI:", dniIdx, "DIA0:", dia0Idx, "DIA0_OBS:", dia0obsIdx, "STATUS_DIA1:", statusDia1Idx, "DIA1:", dia1Idx)
     
     let updated = 0
     for(let i = 1; i < data.length; i++) {
       const row = data[i]
       if(!row || row.every(c => !c)) continue
       const dni = String(row[dniIdx] || '').trim()
       if(!dni) continue
       const dia0Val = String(row[dia0Idx] || '').trim().toUpperCase()
       const dia1Val = String(row[dia1Idx] || '').trim().toUpperCase()
       
       if(!dia0Val) continue
       
       const res = await client.query(
         `UPDATE nominas SET dia_0 = $1, dia_1 = $2 
          WHERE postulante_documento = $3 AND (dia_0 IS NULL OR dia_0 = '') RETURNING id`,
         [dia0Val || null, dia1Val || null, dni]
       )
       updated += res.rowCount
     }
     console.log("Updated rows:", updated)
  } catch(e) {
     console.error("Error:", e.message)
  }
  await client.end()
}
run()
