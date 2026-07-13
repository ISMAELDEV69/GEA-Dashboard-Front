import * as XLSX from 'xlsx'

const wb = XLSX.readFile("/Users/saidaquino/Library/Mobile Documents/com~apple~CloudDocs/ARCHIVOS/IMPLEMENTACION PORTAL/__MACOSX-1/GEAismael/PLANTILLA NOMINA/SEMANA 17 GRUPO PRUEBA.xlsx")
const ws = wb.Sheets[wb.SheetNames[0]]
const data = XLSX.utils.sheet_to_json(ws, { header: 1 })

// Look for the header row
let headerRow = null;
let headerIdx = 0;
for(let i = 0; i < Math.min(data.length, 30); i++) {
  const row = data[i];
  if(row.some(c => String(c).includes('DIA 0') || String(c).includes('DÍA 0') || String(c).includes('STATUS'))) {
    headerRow = row;
    headerIdx = i;
    break;
  }
}
if(!headerRow) {
  // Just look at the data directly
  for(let i = 0; i < Math.min(data.length, 10); i++) {
    console.log("Row " + i + ":", data[i])
  }
} else {
  console.log("Header row " + headerIdx + ":", headerRow)
  // Print some data rows showing the dia columns
  const dia0Idx = headerRow.findIndex(h => String(h).toUpperCase().includes('DIA 0') || String(h).toUpperCase().includes('DÍA 0'))
  const statusDia1Idx = headerRow.findIndex(h => String(h).toUpperCase().includes('STATUS') && !String(h).toUpperCase().includes('FINAL'))
  console.log("DIA 0 column index:", dia0Idx, "STATUS DIA 1:", statusDia1Idx)
  
  for(let i = headerIdx+1; i < Math.min(data.length, headerIdx+20); i++) {
    if(!data[i] || data[i].every(c => !c)) continue;
    console.log("Row " + i + " dia_0=" + data[i][dia0Idx] + " status_dia1=" + data[i][statusDia1Idx])
  }
}
