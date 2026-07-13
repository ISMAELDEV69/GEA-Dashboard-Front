const fs = require('fs');

let content = fs.readFileSync('src/lib/dataService.js', 'utf8');

const startTag = `  // 2. Extraer códigos válidos para limpieza`;
const endTag = `  } catch (err) {`;

const startIndex = content.indexOf(startTag);
const endIndex = content.indexOf(endTag, startIndex);

if (startIndex !== -1 && endIndex !== -1) {
  const newContent = `  // 2. Borrar todos los registros actuales
  try {
    const { error: errDel } = await supabase.from('capacidad_rys').delete().neq('codigo', 'xxxx_impossible_xxxx')
    if (errDel) throw errDel

    results.deleted = 0 // Optional: count existing before deleting if needed

    // 3. Preparar filas para inserción masiva en capacidad_rys
    const rowsToUpsert = validPayloads.map(p => {
      const campana = (p.campana_nombre || 'SIN CAMPAÑA').toUpperCase()
      const codigo = p.codigo || null
      
      return {
        codigo,
        campana,
        semana_trabajo: p.semana_trabajo || null,
        semana_label: p.semana_label || null,
        modalidad: p.modalidad || 'PRESENCIAL',
        condicion: p.condicion || null,
        rango_horario: p.rango_horario || null,
        fecha_registro: p.fecha_registro || new Date().toISOString().split('T')[0],
        periodo: p.periodo || null,
        fecha_inicio_ojt: p.fecha_inicio_ojt || null,
        fecha_ingreso_op: p.fecha_ingreso_op || null,
        extension_teoria: p.extension_teoria || null,
        extension_ojt: p.extension_ojt || null,
        rq_solicitado: p.rq_solicitado ?? null,
        rq_ftes_solicitado: p.rq_ftes_solicitado ?? null,
        meta_dia_0: p.meta_dia_0 ?? null,
        meta_dia_1: p.meta_dia_1 ?? null,
        periodo_ingreso_op: p.periodo_ingreso_op || null,
        periodo_rys: p.periodo_rys || null,
        area_traslado: p.area_traslado || null,
        estado: p.estado || 'PLANIFICADO',
      }
    })

    // 4. Inserción masiva
    const BATCH_SIZE = 500
    for (let i = 0; i < rowsToUpsert.length; i += BATCH_SIZE) {
      const batch = rowsToUpsert.slice(i, i + BATCH_SIZE)
      const { error } = await supabase.from('capacidad_rys').insert(batch)
      
      if (error) {
        results.fail += batch.length
        results.errors.push({ message: error.message })
      } else {
        results.ok += batch.length
      }
      onProgress?.(Math.min(i + BATCH_SIZE, rowsToUpsert.length), rowsToUpsert.length)
    }
`;
  content = content.substring(0, startIndex) + newContent + content.substring(endIndex);
  fs.writeFileSync('src/lib/dataService.js', content);
  console.log('Successfully updated importCapacidadRysBulk!');
} else {
  console.error('Tags not found.');
}
