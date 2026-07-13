const XLSX = require('xlsx')

const wb = XLSX.readFile("/Users/saidaquino/Library/Mobile Documents/com~apple~CloudDocs/ARCHIVOS/IMPLEMENTACION PORTAL/__MACOSX-1/GEAismael/PLANTILLA NOMINA/SEMANA 17 GRUPO PRUEBA.xlsx")

// Check all sheets
console.log("All sheets:", wb.SheetNames)

wb.SheetNames.forEach(name => {
  const ws = wb.Sheets[name]
  const data = XLSX.utils.sheet_to_json(ws, { header: 1 })
  console.log("\n=== Sheet:", name, "===")
  // Find DIA 0 header
  for(let i = 0; i < Math.min(data.length, 5); i++) {
    const row = data[i]
    if(!row) continue;
    console.log("Row " + i + ":", row.slice(50, 75))
  }
})
