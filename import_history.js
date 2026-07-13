import { createClient } from '@supabase/supabase-js'
import xlsx from 'xlsx'
import fs from 'fs'

const env = fs.readFileSync('.env.local', 'utf-8');
let url = '', key = '';
env.split('\n').forEach(line => {
  if (line.startsWith('VITE_SUPABASE_URL=')) url = line.split('=')[1].trim();
  if (line.startsWith('VITE_SUPABASE_ANON_KEY=')) key = line.split('=')[1].trim();
});
const supabase = createClient(url, key);

function parseDate(excelDate) {
  if (!excelDate) return null;
  if (typeof excelDate === 'number') {
    const d = new Date((excelDate - (25567 + 1)) * 86400 * 1000)
    return d.toISOString().split('T')[0]
  }
  // Try string format dd/mm/yyyy
  const parts = String(excelDate).split(' ')[0].split('/');
  if (parts.length === 3) {
    return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`
  }
  return null;
}

function parseDateTime(excelDate) {
  if (!excelDate) return null;
  if (typeof excelDate === 'number') {
    const d = new Date((excelDate - (25567 + 1)) * 86400 * 1000)
    return d.toISOString()
  }
  return String(excelDate);
}

async function run() {
  try {
    console.log('Reading CARGA DE ASISTENCIA...');
    const wbAsis = xlsx.readFile('CARGA DE ASISTENCIA.xlsx');
    const asisSheet = wbAsis.Sheets[wbAsis.SheetNames[0]];
    const asisData = xlsx.utils.sheet_to_json(asisSheet);
    
    const formattedAsis = asisData.map(r => ({
      documento: String(r['DOCUMENTO'] || ''),
      apellido_materno: String(r['APELLIDO MATERNO'] || ''),
      apellido_paterno: String(r['APELLIDO PATERNO'] || ''),
      nombres: String(r['NOMBRES'] || ''),
      celular: String(r['CELULAR'] || ''),
      condicion_laboral: String(r['CONDICION LABORAL'] || ''),
      campana: String(r['CAMPAÑA'] || ''),
      grupo: String(r['GRUPO(GPE-2025-0000)'] || ''),
      documento_formador: String(r['DOCUMENTO FORMADOR'] || ''),
      nombre_formador: String(r['NOMBRE FORMADOR'] || ''),
      fecha_registro_asistencia: parseDate(r['FECHA REGISTO DE ASISTENCIA']),
      tipo_reclutado: String(r['TIPO RECLUTADO'] || ''),
      estado: String(r['ESTADO'] || ''),
      sigla: String(r['SIGLA'] || ''),
      motivo_baja: r['MOTIVO DE BAJA'] ? String(r['MOTIVO DE BAJA']) : null,
      fecha_hora_registro: parseDateTime(r['FECHA Y HORA DE REGISTRO']),
      codigo_grupo: String(r['CODIGO DE GRUPO'] || ''),
      archivo_origen: 'CARGA_HISTORICA_ASISTENCIA.xlsx'
    }));

    console.log(`Inserting ${formattedAsis.length} rows into consolidado_asistencias...`);
    // Insert in chunks of 1000
    for (let i = 0; i < formattedAsis.length; i += 1000) {
      const chunk = formattedAsis.slice(i, i + 1000);
      const { error } = await supabase.from('consolidado_asistencias').insert(chunk);
      if (error) console.error('Error inserting asistencias chunk:', error);
      else console.log(`Inserted chunk ${i/1000 + 1}`);
    }
    
    console.log('Reading CARGA_DESCUENTOS...');
    const wbDesc = xlsx.readFile('CARGA_DESCUENTOS.xlsx');
    const descSheet = wbDesc.Sheets[wbDesc.SheetNames[0]];
    const descData = xlsx.utils.sheet_to_json(descSheet);

    const formattedDesc = descData.map(r => ({
      sede: String(r['SEDE'] || ''),
      segmento: String(r['SEGMENTO'] || ''),
      grupo_cap: String(r['GRUPO DE CAPACITACION'] || ''),
      campana: String(r['CAMPAÑA'] || ''),
      supervisor: String(r['SUPERVISOR'] || ''),
      formador: String(r['FORMADOR'] || ''),
      dni_ce: String(r['DNI O CE'] || ''),
      postulante: String(r['POSTULANTE'] || ''),
      fecha_baja: parseDate(r['FECHA DE BAJA/CESE']),
      motivo: r['MOTIVO'] ? String(r['MOTIVO']) : null,
      autoriza_rys: String(r['AUTORIZA JEFE RYS'] || ''),
      autoriza_cap: String(r['AUTORIZA JEFE CAP.'] || ''),
      procede: String(r['PROCEDE'] || ''),
      comentario_rys: r['COMENTARIO RYS'] ? String(r['COMENTARIO RYS']) : null,
      fecha_registro: parseDateTime(r['FECHA DE ENVIO'])
    }));

    console.log(`Inserting ${formattedDesc.length} rows into descuentos...`);
    // Insert in chunks of 1000
    for (let i = 0; i < formattedDesc.length; i += 1000) {
      const chunk = formattedDesc.slice(i, i + 1000);
      const { error } = await supabase.from('descuentos').insert(chunk);
      if (error) console.error('Error inserting descuentos chunk:', error);
      else console.log(`Inserted chunk ${i/1000 + 1}`);
    }
    
    console.log('Done!');
  } catch (err) {
    console.error('Fatal error:', err);
  }
}

run();
