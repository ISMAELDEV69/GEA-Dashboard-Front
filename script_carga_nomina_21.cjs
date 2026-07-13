require('dotenv').config({ path: '.env.local' });
const xlsx = require('xlsx');
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

function excelDateToJSDate(serial) {
  if (!serial) return null;
  if (typeof serial === 'string') {
    const parts = serial.split('/');
    if (parts.length === 3) {
      const [m, d, y] = parts;
      return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
    return null;
  }
  const utc_days  = Math.floor(serial - 25569);
  const utc_value = utc_days * 86400;                                        
  const date_info = new Date(utc_value * 1000);
  return date_info.toISOString().split('T')[0];
}

function parseMoney(val) {
  if (!val) return 0;
  if (typeof val === 'number') return val;
  const str = String(val).replace(/[^0-9,.-]/g, '').replace(',', '.');
  return parseFloat(str) || 0;
}

async function run() {
  const wb = xlsx.readFile('NOMINA SEMANA 21 CARGA.xlsx');
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rawData = xlsx.utils.sheet_to_json(ws, { defval: null });

  const groupsSet = new Set();
  const groupsToInsert = [];
  const postulantesToInsert = [];

  for (const row of rawData) {
    const documento = (row['Nro de DNI o C.E.'] || '').toString().trim();
    if (!documento) continue;

    const campana = (row['CAMPAÑA'] || '').toString().trim().toUpperCase();
    const grupo = (row['GRUPO(G000)'] || '').toString().trim().toUpperCase();
    
    const groupKey = `${campana}|${grupo}`;
    if (!groupsSet.has(groupKey)) {
      groupsSet.add(groupKey);
      groupsToInsert.push({
        codigo: grupo,
        campana: campana,
        fecha_inicio: excelDateToJSDate(row['INICIO DE CAPACITACIÓN']) || new Date().toISOString().split('T')[0],
        periodo: (row['PERIODO RECLUTADO'] || '').toString().trim(),
        modalidad: (row['MODALIDAD'] || 'PRESENCIAL').toUpperCase(),
        condicion_laboral: (row['CONDICIÓN'] || 'FULL TIME').toUpperCase(),
        rango_horario: row['HORARIO DE GESTIÓN'] || null,
        estado: 'PLANIFICADO'
      });
    }

    const postulante = {
      documento: documento,
      tipo_documento: (row['TIPO DE DOCUMENTO'] || 'DNI').toUpperCase(),
      apellido_paterno: (row['APELLIDO PATERNO'] || '').toString().trim().toUpperCase(),
      apellido_materno: (row['APELLIDO MATERNO\r\n'] || row['APELLIDO MATERNO'] || '').toString().trim().toUpperCase(),
      nombres: (row['NOMBRES COMPLETOS'] || '').toString().trim().toUpperCase(),
      celular: (row['NÚMERODECELULAR/MÓVIL'] || '').toString().trim(),
      celular_referencia: (row['NÚMERODECELULARDEREFERENCIA'] || '').toString().trim(),
      correo: (row['CORREO ELECTRONICO'] || '').toString().trim().toLowerCase(),
      genero: (row['GÉNERO O SEXO DEL POSTULANTE'] || '').toString().trim().toUpperCase(),
      estado_civil: (row['ESTADO CIVIL'] || '').toString().trim().toUpperCase(),
      n_hijos: parseInt(row['N° de HIJOS']) || 0,
      reclutador: (row['RECLUTADOR'] || '').toString().trim().toUpperCase(),
      sede: (row['SEDE'] || '').toString().trim().toUpperCase(),
      campana: campana,
      grupo_codigo: grupo,
      periodo_reclutado: (row['PERIODO RECLUTADO'] || '').toString().trim(),
      semana_trabajo: parseInt(row['SEMANA DE TRABAJO']) || 21,
      modalidad: (row['MODALIDAD'] || 'PRESENCIAL').toUpperCase(),
      condicion: (row['CONDICIÓN'] || 'FULL TIME').toUpperCase(),
      horario_gestion: row['HORARIO DE GESTIÓN'] || null,
      remuneracion: parseMoney(row['REMUNERACION']),
      bono_variable: parseMoney(row['BONO 1 (VARIABLE)']),
      bono_bienvenida: parseMoney(row['BONO 3 (BIENVENIDA)']),
      status_dia_1: (row['STATUS DIA 1'] === 0 ? 'APTO' : (row['STATUS DIA 1'] || 'APTO')).toString().toUpperCase()
    };
    
    postulantesToInsert.push(postulante);
  }

  console.log(`Insertando/Actualizando ${groupsToInsert.length} grupos en capacidad_rys...`);
  for (const g of groupsToInsert) {
    if (!g.codigo || !g.campana) continue;
    const { error } = await supabase.from('capacidad_rys').upsert(g, { onConflict: 'codigo' });
    if (error) console.warn(`Aviso al insertar grupo ${g.codigo}: ${error.message}`);
  }

  console.log(`Insertando ${postulantesToInsert.length} nominas...`);
  const CHUNK_SIZE = 100;
  for (let i = 0; i < postulantesToInsert.length; i += CHUNK_SIZE) {
    const chunk = postulantesToInsert.slice(i, i + CHUNK_SIZE);
    const { error } = await supabase.from('nominas').upsert(chunk, { onConflict: 'documento' });
    if (error) console.error(`Error en chunk ${i}:`, error.message);
    else console.log(`Chunk ${i} - ${i + chunk.length} completado.`);
  }

  console.log("Carga de nómina finalizada exitosamente.");
}
run();
