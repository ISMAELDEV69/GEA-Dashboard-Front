const startStr = '2026-05-29'
const d = new Date(startStr + 'T12:00:00Z') // Use noon UTC to avoid timezone shifts
d.setUTCDate(d.getUTCDate() + 1)
console.log(d.toISOString().split('T')[0])
