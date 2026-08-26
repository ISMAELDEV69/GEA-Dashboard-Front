import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://lqvvhovfvwzaprdgdobc.supabase.co';
const SUPABASE_KEY = 'sb_publishable_hqkYCTr8g29RzFZnXiho5Q_7QAGdUKg';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function findSource() {
  console.log('=== BUSCANDO ORIGEN DE GPE-2026016 Y 202608 ===\n');

  // 1. En capacidad_rys
  const { data: cap, error: errCap } = await supabase
    .from('capacidad_rys')
    .select('*')
    .ilike('codigo', '%2026016%');

  console.log('1. En capacidad_rys con código 2026016:');
  console.log(cap);

  // 2. En capacidad_rys con periodo 202608
  const { data: capPer, error: errCapPer } = await supabase
    .from('capacidad_rys')
    .select('codigo, campana, segmento, periodo, created_at')
    .eq('periodo', '202608');

  console.log('\n2. En capacidad_rys con periodo 202608:');
  console.log(capPer);

  // 3. En nominas
  const { data: nom, error: errNom } = await supabase
    .from('nominas')
    .select('*')
    .ilike('grupo_codigo', '%2026016%');

  console.log('\n3. En nominas con grupo_codigo 2026016:');
  console.log(nom);

  // 4. En consolidado_asistencias
  const { data: asis, error: errAsis } = await supabase
    .from('consolidado_asistencias')
    .select('id, codigo_grupo, campana, created_at')
    .ilike('codigo_grupo', '%2026016%');

  console.log('\n4. En consolidado_asistencias con codigo_grupo 2026016:');
  console.log(asis);
}

findSource().catch(console.error);
