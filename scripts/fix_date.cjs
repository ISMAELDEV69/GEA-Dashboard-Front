const fs = require('fs');
let content = fs.readFileSync('src/lib/capacidadRysSchema.js', 'utf8');

const newParse = `
export function parseExcelDate(val) {
  if (!val) return null
  const s = String(val).trim()
  
  if (/^\\d{5}$/.test(s)) {
    const serial = parseInt(s, 10)
    // Excel epoch is Dec 30, 1899. 25569 is Jan 1, 1970
    const d = new Date((serial - 25569) * 86400 * 1000)
    return d.toISOString().split('T')[0]
  }

  if (/^\\d{4}-\\d{2}-\\d{2}$/.test(s)) return s
  const m = s.match(/^(\\d{1,2})\\/(\\d{1,2})\\/(\\d{4})$/)
  if (m) return \`\${m[3]}-\${m[2].padStart(2, '0')}-\${m[1].padStart(2, '0')}\`
  
  const d = new Date(s)
  if (!Number.isNaN(d.getTime())) return d.toISOString().split('T')[0]
  return null
}
`

content = content.replace(/export function parseExcelDate[\s\S]+?\}\n/, newParse.trim() + '\n')
fs.writeFileSync('src/lib/capacidadRysSchema.js', content);
console.log('Fixed parseExcelDate');
