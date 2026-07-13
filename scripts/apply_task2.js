import fs from 'fs'

const file = 'src/lib/dataService.js'
let content = fs.readFileSync(file, 'utf8')

// We will replace insertPostulantesBulk entirely
const oldBulkStart = content.indexOf('export async function insertPostulantesBulk(payloads) {')
const oldBulkEnd = content.indexOf('export async function deletePostulante(doc) {')

if (oldBulkStart > -1 && oldBulkEnd > oldBulkStart) {
  const newBulk = `export async function insertPostulantesBulk(payloads) {
  const cleanPayloads = payloads.filter(p => p.documento && p.documento.trim());
  if (cleanPayloads.length === 0) return { inserted: [], skipped: [], failed: [] };

  // Identify the target group from the payload
  const targetGrupo = cleanPayloads[0].grupo_codigo;

  let existingDocs = new Set();
  const results = { inserted: [], skipped: [], failed: [] };
  
  if (DB_MODE === 'supabase') {
    // Ya no verificamos docs activos en este grupo. 
    // La función registrar_nomina ahora hace el UPDATE nominas SET activo = FALSE para cualquier nómina anterior.
    // Esto previene la violación del uq_nominas_postulante_activo.
    
    for (const payload of cleanPayloads) {
      if (existingDocs.has(payload.documento)) {
        results.skipped.push(payload.documento);
        continue;
      }
      try {
        const saved = await insertPostulante(payload);
        results.inserted.push(saved);
        existingDocs.add(payload.documento);
        
        // TAREA 4: Enlazar nómina -> asistencia
        try {
          // Import dynamic to avoid circular dependencies if any, but since we are in dataService we can just require it or it's better to just do the logic here if sheetImportUtils is not imported.
          // Wait, sheetImportUtils might not be imported at the top. Let's check.
        } catch(e) {}

      } catch (err) {
        console.error('Bulk skip:', payload.documento, err.message);
        results.failed.push({ documento: payload.documento, reason: err.message });
      }
    }

    try {
      await checkCalibracionDia1(targetGrupo)
    } catch(e) {
      console.error("Error checkCalibracionDia1 from upsertAsistencias:", e)
    }

    return results;
  }

  // Local mode...
  return { inserted: [], skipped: [], failed: [] };
}

`
  // Actually, wait, let's use replace_file_content for precision.
  console.log("Found locations, use replace_file_content instead.")
}
