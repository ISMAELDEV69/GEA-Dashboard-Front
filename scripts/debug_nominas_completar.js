import { createClient } from '@supabase/supabase-js';
import { inferSegmento } from '../src/lib/capacidadRysSync.js';

const SUPABASE_URL = 'https://lqvvhovfvwzaprdgdobc.supabase.co';
const SUPABASE_KEY = 'sb_publishable_hqkYCTr8g29RzFZnXiho5Q_7QAGdUKg';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function testFilter() {
  const { data: grupos } = await supabase.from('capacidad_rys').select('*');

  console.log(`Total grupos en capacidad_rys: ${grupos.length}`);

  // Simular los filtros de NominaCompletar
  const bulkPeriodo = '202608';
  const bulkSegmento = 'CLARO PERU';
  const bulkCampana = 'RETENCIONES FIJA INBOUND';

  let filtered = grupos.filter(g => g.periodo);
  if (bulkPeriodo) filtered = filtered.filter(g => String(g.periodo).trim() === String(bulkPeriodo).trim());
  
  console.log(`\nGrupos con periodo 202608: ${filtered.length}`);
  filtered.forEach(g => console.log(`- ${g.codigo} | ${g.campana} | seg: ${g.segmento} | infer: ${inferSegmento(g.campana)}`));

  if (bulkSegmento) filtered = filtered.filter(g => {
    const seg = g.segmento || inferSegmento(g.campana);
    return String(seg).trim() === String(bulkSegmento).trim();
  });

  console.log(`\nGrupos con segmento CLARO PERU: ${filtered.length}`);
  filtered.forEach(g => console.log(`- ${g.codigo} | ${g.campana} | seg: ${g.segmento}`));

  if (bulkCampana) filtered = filtered.filter(g => String(g.campana).trim() === String(bulkCampana).trim());

  console.log(`\nGrupos con campaña RETENCIONES FIJA INBOUND: ${filtered.length}`);
  filtered.forEach(g => console.log(`- ${g.codigo} | ${g.campana} | seg: ${g.segmento}`));
}

testFilter().catch(console.error);
