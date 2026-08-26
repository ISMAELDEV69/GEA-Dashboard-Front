function parseExcelDate(val) {
  if (!val) return null
  const s = String(val).trim()
  if (!s || s === '-' || s === '0' || s === 'NULL' || s === 'undefined') return null

  // 1. Excel serial number (e.g. 37171)
  if (/^\d{4,6}(?:\.\d+)?$/.test(s)) {
    const serial = parseFloat(s)
    if (serial >= 1000 && serial <= 80000) {
      const d = new Date(Math.round((serial - 25569) * 86400 * 1000))
      if (!isNaN(d.getTime())) {
        const yyyy = d.getUTCFullYear()
        const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
        const dd = String(d.getUTCDate()).padStart(2, '0')
        return `${yyyy}-${mm}-${dd}`
      }
    }
  }

  // 2. Date split by -, /, .
  const parts = s.split(/[-/.\s]+/)
  if (parts.length >= 3) {
    const n1 = parseInt(parts[0], 10)
    const n2 = parseInt(parts[1], 10)
    const n3 = parseInt(parts[2], 10)

    if (!isNaN(n1) && !isNaN(n2) && !isNaN(n3)) {
      let year, month, day

      // Case: YYYY-MM-DD or YYYY-DD-MM (e.g. 2003-31-05 or 2003-05-31)
      if (n1 >= 1900 && n1 <= 2100) {
        year = n1
        if (n2 > 12 && n3 <= 12) {
          day = n2
          month = n3
        } else {
          month = n2
          day = n3
        }
      } 
      // Case: DD-MM-YYYY or MM-DD-YYYY or DD-MM-YY (e.g. 31-05-2003 or 05-31-2003)
      else if (n3 >= 1900 || n3 < 100) {
        year = n3 < 100 ? (n3 >= 50 ? 1900 + n3 : 2000 + n3) : n3
        if (n1 > 12 && n2 <= 12) {
          day = n1
          month = n2
        } else if (n2 > 12 && n1 <= 12) {
          day = n2
          month = n1
        } else {
          // Default LatAm standard: DD/MM/YYYY
          day = n1
          month = n2
        }
      }

      if (year && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      }
    }
  }

  const d = new Date(s)
  if (!isNaN(d.getTime()) && d.getFullYear() >= 1900 && d.getFullYear() <= 2100) {
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    return `${yyyy}-${mm}-${dd}`
  }

  return null
}

console.log('2003-31-05 ->', parseExcelDate('2003-31-05'))
console.log('31/05/2003 ->', parseExcelDate('31/05/2003'))
console.log('31-05-2003 ->', parseExcelDate('31-05-2003'))
console.log('05/31/2003 ->', parseExcelDate('05/31/2003'))
console.log('2003/05/31 ->', parseExcelDate('2003/05/31'))
console.log('37171 ->', parseExcelDate('37171'))
console.log('invalid ->', parseExcelDate('texto invalido'))
