import * as XLSX from 'xlsx'

async function inspectSheet() {
  const url = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQNqbcgwWaeZiPwDaetDMft_rwv6BWFM-wNdA10VIKVWLo5uvnPFcbHgHvrDIiUyyWa08pDWN_VNX0e/pubhtml'
  
  // Try fetching pubhtml or pub?output=xlsx
  const xlsxUrl = url.replace('/pubhtml', '/pub') + (url.includes('?') ? '&output=xlsx' : '?output=xlsx')
  console.log('Fetching XLSX from:', xlsxUrl)
  
  const resp = await fetch(xlsxUrl)
  const buf = await resp.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'buffer' })
  
  console.log('Sheet names:', wb.SheetNames)
  for (const name of wb.SheetNames.slice(0, 5)) {
    const ws = wb.Sheets[name]
    const matrix = XLSX.utils.sheet_to_json(ws, { header: 1 })
    console.log(`\n=== HOJA: "${name}" (${matrix.length} filas) ===`)
    if (matrix.length > 0) {
      console.log('Fila 0 (Encabezados):', matrix[0])
      if (matrix.length > 1) {
        console.log('Fila 1 (Primer registro):', matrix[1])
      }
    }
  }
}

inspectSheet().catch(console.error)
