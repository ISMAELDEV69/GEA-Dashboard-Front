const fs = require('fs');

let content = fs.readFileSync('src/lib/nominaConsolidadoSchema.js', 'utf8');

const parser = `
function parseTimestamp(val) {
  if (!val) return null
  const s = String(val).trim()
  // If DD/MM/YYYY HH:MM:SS
  const m = s.match(/^(\\d{1,2})\\/(\\d{1,2})\\/(\\d{4})(?:\\s+(\\d{1,2}):(\\d{1,2}):(\\d{1,2}))?/)
  if (m) {
    const yyyy = m[3]
    const mm = m[2].padStart(2, '0')
    const dd = m[1].padStart(2, '0')
    const hh = (m[4] || '00').padStart(2, '0')
    const min = (m[5] || '00').padStart(2, '0')
    const ss = (m[6] || '00').padStart(2, '0')
    return \`\${yyyy}-\${mm}-\${dd}T\${hh}:\${min}:\${ss}\`
  }
  // Try Excel serial datetime (e.g. 45000.418)
  if (/^\\d+\\.\\d+$/.test(s) || /^\\d{5}$/.test(s)) {
    const serial = parseFloat(s)
    const d = new Date((serial - 25569) * 86400 * 1000)
    return d.toISOString()
  }
  return s // fallback
}

`

content = parser + content;

fs.writeFileSync('src/lib/nominaConsolidadoSchema.js', content);
console.log('Injected parseTimestamp');
