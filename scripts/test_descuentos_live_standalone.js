import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://ujqehcpglfhnytzsyedp.supabase.co'
const SUPABASE_KEY = 'sb_publishable_wt_Muu3dmb0GjulWMDYpqg_NKRYqKNE'

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

const normalizeGPE = (val) => String(val || '').replace(/^GPE-?/i, '').trim();
const normalizeCampana = (c) => String(c || '').toUpperCase().replace(/\s+/g, '');
const normalizeDNI = (d) => String(d || '').trim();

const makeDescuentoKey = (doc, camp, grupo) => {
  return `${normalizeDNI(doc)}|${normalizeCampana(camp)}|${normalizeGPE(grupo)}`;
}

async function getDescuentosSetGlobal() {
  let allData = [];
  let from = 0;
  const step = 1000;
  let hasMore = true;
  while(hasMore) {
    const { data } = await supabase.from('descuentos')
      .select('dni_ce, campana, grupo_cap, procede, autoriza_rys, autoriza_cap')
      .range(from, from + step - 1);
    if (data && data.length > 0) {
      allData = allData.concat(data);
      if (data.length < step) hasMore = false;
      else from += step;
    } else hasMore = false;
  }

  const procedeData = allData.filter(row => {
    if (String(row.procede || '').trim().toUpperCase() === 'PROCEDE') return true;
    const rys = String(row.autoriza_rys || '').trim().toUpperCase() === 'SI';
    const cap = (String(row.autoriza_cap || '').trim().toUpperCase() === 'SI' || !row.autoriza_cap);
    return rys && cap;
  });

  return new Set(procedeData.map(d => makeDescuentoKey(d.dni_ce, d.campana, d.grupo_cap)));
}

async function fetchAllConsolidadoFiltered(descSet) {
  const { data } = await supabase.from('consolidado_asistencias')
    .select('id, documento, motivo_baja, fecha_registro_asistencia, campana, codigo_grupo, grupo, nombre_formador, sigla, estado')
    .eq('codigo_grupo', 'GPE-2026040')
    .eq('campana', 'CLARO POSTPAGO');

  let allData = data || [];
  if (descSet && descSet.size > 0) {
    allData = allData.filter(row => !descSet.has(makeDescuentoKey(row.documento, row.campana, row.codigo_grupo)));
  }
  return allData;
}

async function liveProof() {
  console.log('========================================================================')
  console.log('PRUEBA EN VIVO: RASTREO DE UN CASO REAL APROBADO EN LOS DASHBOARDS')
  console.log('Caso: DNI 47049464 | LIZ MADELEYNE MEJIA HUERTA | GPE-2026040 | CLARO POSTPAGO')
  console.log('========================================================================')

  const targetDoc = '47049464'
  const targetGroup = 'GPE-2026040'
  const targetCamp = 'CLARO POSTPAGO'

  // 1. Estado en tabla descuentos
  const { data: dRow } = await supabase.from('descuentos').select('*').eq('dni_ce', targetDoc)
  console.log('1. Registro en tabla descuentos:', dRow[0])

  // 2. Estado en tabla consolidado_asistencias (antes de filtro)
  const { data: rawAsis } = await supabase.from('consolidado_asistencias')
    .select('documento, campana, codigo_grupo, sigla, estado, fecha_registro_asistencia')
    .eq('documento', targetDoc)
  console.log('2. Registros crudos en consolidado_asistencias:', rawAsis)

  // 3. Evaluar Set de Descuentos
  const descSet = await getDescuentosSetGlobal()
  const key = makeDescuentoKey(targetDoc, targetCamp, targetGroup)
  console.log(`3. Key generada: '${key}', ¿Existe en Set?:`, descSet.has(key))

  // 4. Evaluar dataset filtrado (como lo consumen MotivosBajasBI, ConsolidadoPowerBI, AttendanceBI)
  const filtered = await fetchAllConsolidadoFiltered(descSet)
  const foundInFiltered = filtered.filter(r => r.documento === targetDoc)
  console.log(`4. Registros tras aplicar filtro de Descuentos: ${foundInFiltered.length}`)
  console.log(foundInFiltered.length === 0 ? '✅ EXCLUIDO CON ÉXITO de todas las vistas de BI' : '❌ ERROR: No se excluyó')
}

liveProof()
