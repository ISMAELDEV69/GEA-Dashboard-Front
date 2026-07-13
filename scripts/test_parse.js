const row = { fecha_registro_asistencia: '26/6/2026' };
let isoDate = ''
if (row.fecha_registro_asistencia) {
  const parts = row.fecha_registro_asistencia.split('/')
  if (parts.length === 3) isoDate = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`
}
console.log(isoDate)
