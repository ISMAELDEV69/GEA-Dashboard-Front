import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://lqvvhovfvwzaprdgdobc.supabase.co';
const SUPABASE_KEY = 'sb_publishable_hqkYCTr8g29RzFZnXiho5Q_7QAGdUKg';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function run() {
  const grupoCodigo = 'GPE-2026009';
  console.log(`=== REVISIÓN DE CÁLCULO ACTIVOS PARA GRUPO: ${grupoCodigo} ===\n`);

  // 1. Capacidad
  const { data: cap, error: errCap } = await supabase
    .from('capacidad_rys')
    .select('*')
    .ilike('codigo', `%${grupoCodigo}%`);

  if (errCap) console.error('Error cap:', errCap);
  console.log('1. CAPACIDAD_RYS:');
  console.log(JSON.stringify(cap, null, 2));

  // 2. Nóminas
  const { data: nom, error: errNom } = await supabase
    .from('nominas')
    .select('*')
    .ilike('grupo_codigo', `%${grupoCodigo}%`);

  if (errNom) console.error('Error nom:', errNom);
  console.log('\n2. TOTAL NÓMINAS:', nom?.length || 0);

  // 3. Asistencias
  const { data: asis, error: errAsis } = await supabase
    .from('consolidado_asistencias')
    .select('*')
    .ilike('codigo_grupo', `%${grupoCodigo}%`);

  if (errAsis) console.error('Error asis:', errAsis);
  console.log('3. TOTAL ASISTENCIAS (REGISTROS):', asis?.length || 0);

  // 4. Postulantes únicos
  const docs = [...new Set((nom || []).map(n => n.documento).filter(Boolean))];
  console.log('4. DOCUMENTOS ÚNICOS EN NÓMINAS:', docs.length);

  let activosCount = 0;
  const activosList = [];

  for (const doc of docs) {
    const recs = (asis || []).filter(a => String(a.documento).trim() === String(doc).trim());
    const sorted = [...recs].sort((a, b) => new Date(a.fecha_registro_asistencia || 0) - new Date(b.fecha_registro_asistencia || 0));
    const last = sorted[sorted.length - 1];
    const tieneIOP = recs.some(r => String(r.sigla || '').toUpperCase().trim() === 'I-OP');
    const isBajaDia1 = sorted.some(r => String(r.motivo_baja || '').toUpperCase().includes('BAJA DIA 1') || String(r.estado || '').toUpperCase().includes('BAJA'));

    const isActivo = last && String(last.estado || '').toUpperCase() === 'ACTIVO' && !isBajaDia1 && !tieneIOP;

    if (isActivo || (last && String(last.estado || '').toUpperCase() === 'ACTIVO')) {
      activosCount++;
      activosList.push({
        documento: doc,
        nombres: last?.nombres || (nom.find(n => n.documento === doc)?.nombres_apellidos),
        ultimo_estado: last?.estado,
        ultima_sigla: last?.sigla,
        ultima_fecha: last?.fecha_registro_asistencia,
        total_asistencias: recs.length,
        motivo_baja: last?.motivo_baja
      });
    }
  }

  console.log(`\n5. TOTAL ACTIVOS DETECTADOS: ${activosCount}`);
  if (activosList.length > 0) {
    console.table(activosList);
  }
}

run().catch(console.error);
