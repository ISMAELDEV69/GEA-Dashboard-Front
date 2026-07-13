const XLSX = require('xlsx')

const wb = XLSX.readFile("/Users/saidaquino/Library/Mobile Documents/com~apple~CloudDocs/ARCHIVOS/IMPLEMENTACION PORTAL/__MACOSX-1/GEAismael/PLANTILLA NOMINA/SEMANA 17 GRUPO PRUEBA.xlsx")
const ws = wb.Sheets[wb.SheetNames[0]]
const data = XLSX.utils.sheet_to_json(ws, { header: 1 })

// Col 55 is DIA 0 (index 55)
// Col 56 is OBSERVACIONES
// Col 57 is STATUS DIA 1
// Check the actual raw values in column 55

console.log("Checking DIA 0 col (idx 55):")
for(let i=1; i<Math.min(data.length, 30); i++) {
  if(!data[i]) continue;
  console.log(i, "dia_0=" + JSON.stringify(data[i][55]) + " dia_0_obs=" + JSON.stringify(data[i][56]) + " status_dia1=" + JSON.stringify(data[i][57]))
}
