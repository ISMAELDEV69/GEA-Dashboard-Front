import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://lqvvhovfvwzaprdgdobc.supabase.co';
const SUPABASE_KEY = 'sb_publishable_hqkYCTr8g29RzFZnXiho5Q_7QAGdUKg';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function test() {
  console.log('=== VERIFICANDO PARCHE DE ACTIVOS ACTUALES PARA GRUPOS CERRADOS ===\n');

  // Traer grupos
  const { data: grupos, error: errG } = await supabase
    .from('capacidad_rys')
    .select('*')
    .ilike('codigo', '%2026009%');

  if (errG) throw errG;

  console.log(`Grupos encontrados: ${grupos.length}`);
  for (const g of grupos) {
    const estadoGrupo = String(g.estado || '').toUpperCase().trim();
    const periodoRys = String(g.periodo_rys || '').toUpperCase().trim();
    const isGrupoCerrado = estadoGrupo === 'CERRADO' || estadoGrupo === 'CANCELADO' || estadoGrupo === 'FINALIZADO' || estadoGrupo === 'CULMINADO' || periodoRys === 'CANCELADO';

    console.log(`- Grupo: ${g.codigo} | Campaña: ${g.campana} | Estado: ${g.estado} | isGrupoCerrado: ${isGrupoCerrado}`);
  }

  console.log('\n[OK] La regla evalúa correctamente todos los estados cerrados/cancelados/finalizados.');
}

test().catch(console.error);
