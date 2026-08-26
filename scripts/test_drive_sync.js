import fetch from 'node-fetch'

async function testPubHtml() {
  const url = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQNqbcgwWaeZiPwDaetDMft_rwv6BWFM-wNdA10VIKVWLo5uvnPFcbHgHvrDIiUyyWa08pDWN_VNX0e/pubhtml'
  console.log('Fetching Google Sheet URL:', url)
  const resp = await fetch(url)
  console.log('Status HTTP:', resp.status)
  const html = await resp.text()
  
  const regexPush = /items\.push\(\{\s*name:\s*"([^"]+)",[\s\S]*?gid:\s*"([^"]+)"/g
  let match
  const sheets = []
  while ((match = regexPush.exec(html)) !== null) {
    sheets.push({ name: match[1], gid: match[2] })
  }
  console.log('Sheets found:', sheets)
  
  for (const s of sheets) {
    const baseUrl = url.replace(/(\/pubhtml|\/pub).*/, '')
    const csvUrl = `${baseUrl}/pub?gid=${s.gid}&single=true&output=csv`
    const csvResp = await fetch(csvUrl)
    const csvText = await csvResp.text()
    const lines = csvText.split('\n').filter(Boolean)
    console.log(`\nHoja "${s.name}" (gid=${s.gid}) -> ${lines.length} filas`)
    if (lines.length > 1) {
      console.log('  Cabecera:', lines[0].substring(0, 100))
      console.log('  Última fila:', lines[lines.length - 1].substring(0, 100))
    }
  }
}

testPubHtml().catch(console.error)
