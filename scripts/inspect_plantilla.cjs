const XLSX = require('xlsx')

const wb = XLSX.readFile("/Users/saidaquino/Library/Mobile Documents/com~apple~CloudDocs/ARCHIVOS/IMPLEMENTACION PORTAL/__MACOSX-1/GEAismael/PLANTILLA NOMINA/SEMANA 17 GRUPO PRUEBA.xlsx")
const ws = wb.Sheets[wb.SheetNames[0]]
const data = XLSX.utils.sheet_to_json(ws, { header: 1 })

console.log("Sheets:", wb.SheetNames)

// Look for the header row
let headerRow = null;
let headerIdx = 0;
for(let i = 0; i < Math.min(data.length, 30); i++) {
  const row = data[i];
  if(row && row.some(c => String(c).toUpperCase().includes('DIA 0') || String(c).toUpperCase().includes('STATUS'))) {
    headerRow = row;
    headerIdx = i;
    break;
  }
}

if(!headerRow) {
  for(let i = 0; i < Math.min(data.length, 10); i++) {
    console.log("Row " + i + ":", data[i])
  }
} else {
  console.log("Header row " + headerIdx + ":", headerRow)
  const dia0Idx = headerRow.findIndex(h => String(h).toUpperCase().match(/DI[AÁ] 0/))
  const statusDia1Idx = headerRow.findIndex(h => String(h).toUpperCase().includes('STATUS') && !String(h).toUpperCase().includes('FINAL'))
  console.log("DIA 0 col:", dia0Idx, "STATUS DIA 1 col:", statusDia1Idx)
  
  for(let i = headerIdx+1; i < Math.min(data.length, headerIdx+20); i++) {
    if(!data[i] || data[i].every(c => !c)) continue;
    console.log("Row " + i + " dia_0=" + data[i][dia0Idx] + " status_dia1=" + data[i][statusDia1Idx])
  }
}

// Now check more values
const allDia0 = data.slice(1).filter(r => r).map(r => r[40]).filter(v => v && v !== '');
const uniq = [...new Set(allDia0)];
console.log("All unique dia_0 values:", uniq.slice(0, 50))

const allStatus = data.slice(1).filter(r => r).map(r => r[57]).filter(v => v && v !== '');
const uniqStatus = [...new Set(allStatus)];
console.log("All unique status_dia_1 values:", uniqStatus.slice(0, 50))
