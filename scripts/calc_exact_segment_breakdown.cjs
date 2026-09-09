const https = require('https');
const SUPABASE_URL = 'https://ujqehcpglfhnytzsyedp.supabase.co';
const SUPABASE_KEY = 'sb_publishable_wt_Muu3dmb0GjulWMDYpqg_NKRYqKNE';

function fetchAll(table) {
  return new Promise((resolve, reject) => {
    https.get(SUPABASE_URL + '/rest/v1/' + table, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_KEY,
        'Range-Unit': 'items',
        'Range': '0-2000'
      }
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve(JSON.parse(d)));
    }).on('error', reject);
  });
}

function normalizePeriodUniversal(val) {
  if (!val) return null;
  const s = String(val).trim();
  if (!s || s === '-' || s === '0' || s === 'null' || s === 'undefined') return null;
  const numOnly = s.replace(/\D/g, '');
  if (numOnly.length >= 6) {
    const y = parseInt(numOnly.substring(0, 4), 10);
    const m = parseInt(numOnly.substring(4, 6), 10);
    if (y >= 2020 && y <= 2030 && m >= 1 && m <= 12) {
      return String(y) + String(m).padStart(2, '0');
    }
  }
  return null;
}

function getGrupoPeriodo(g) {
  if (!g) return null;
  let per = normalizePeriodUniversal(g.periodo_ingreso_op);
  if (per) return per;
  if (g.fecha_ingreso_op) {
    per = normalizePeriodUniversal(g.fecha_ingreso_op);
    if (per) return per;
  }
  per = normalizePeriodUniversal(g.periodo);
  if (per) return per;
  if (g.fecha_inicio_ojt || g.fecha_inicio || g.fecha_registro) {
    per = normalizePeriodUniversal(g.fecha_inicio_ojt || g.fecha_inicio || g.fecha_registro);
    if (per) return per;
  }
  return null;
}

function oldNormalizeSegmento(rawSeg, campana) {
  let s = String(rawSeg || '').trim().toUpperCase();
  const c = String(campana || '').toUpperCase();
  if (s.includes('CHILE') || c.includes('CHILE')) return 'CLARO CHILE';
  if (
    s.includes('RETENCION') || 
    c.includes('RETENCION') || 
    c.includes('CONTACTADOS') || 
    c.includes('CONTENCI') || 
    c.includes('DESCUENTO') || 
    c.includes('BABYSTING') || 
    c.includes('CONSULTA PREVIA') || 
    c.includes('MI CLARO') || 
    c.includes('ENCUESTAS IZO') ||
    c.includes('CANAL DIGITAL') ||
    c.includes('WSP INBOUND')
  ) {
    return 'CLARO PERU RETENCIONES';
  }
  if (
    s.includes('OUT') || 
    c.includes('OUT') || 
    c.includes('PREVENTIVA') || 
    c.includes('PORTA OUT') || 
    c.includes('RENO OUT') || 
    c.includes('VENTAS OUT') || 
    c.includes('CROSS') ||
    c.includes('MIGRACIONES')
  ) {
    return 'CLARO PERU OUT';
  }
  if (s.includes('LIPIGAS') || c.includes('LIPIGAS')) return 'LIPIGAS';
  return 'CLARO PERU';
}

function newNormalizeSegmento(rawSeg, campana) {
  let s = String(rawSeg || '').trim().toUpperCase();
  const c = String(campana || '').toUpperCase();

  // EXCEPCIÓN CLAVE: Retenciones Fija Inbound pertenece a CLARO PERU
  if (c.includes('RETENCIONES FIJA') || c.includes('RETENCION FIJA') || c.includes('FIJA INBOUND')) {
    return 'CLARO PERU';
  }

  // Si en la base de datos ya viene explícito CLARO PERU y no es de Chile/Lipigas/Out
  if (s === 'CLARO PERU' && !c.includes('CHILE') && !c.includes('LIPIGAS') && !c.includes('OUT') && !c.includes('CONTACTADOS') && !c.includes('CONSULTA PREVIA')) {
    return 'CLARO PERU';
  }

  if (s.includes('CHILE') || c.includes('CHILE')) return 'CLARO CHILE';
  if (
    s.includes('RETENCION') || 
    c.includes('RETENCION') || 
    c.includes('CONTACTADOS') || 
    c.includes('CONTENCI') || 
    c.includes('DESCUENTO') || 
    c.includes('BABYSTING') || 
    c.includes('CONSULTA PREVIA') || 
    c.includes('MI CLARO') || 
    c.includes('ENCUESTAS IZO') ||
    c.includes('CANAL DIGITAL') ||
    c.includes('WSP INBOUND')
  ) {
    return 'CLARO PERU RETENCIONES';
  }
  if (
    s.includes('OUT') || 
    c.includes('OUT') || 
    c.includes('PREVENTIVA') || 
    c.includes('PORTA OUT') || 
    c.includes('RENO OUT') || 
    c.includes('VENTAS OUT') || 
    c.includes('CROSS') ||
    c.includes('MIGRACIONES')
  ) {
    return 'CLARO PERU OUT';
  }
  if (s.includes('LIPIGAS') || c.includes('LIPIGAS')) return 'LIPIGAS';
  return 'CLARO PERU';
}

async function main() {
  const grupos = await fetchAll('capacidad_rys?select=codigo,campana,segmento,estado,area_traslado,periodo,periodo_ingreso_op,fecha_inicio_ojt,fecha_ingreso_op,rq_solicitado,rq_ftes_solicitado');

  const groups08 = grupos.filter(g => getGrupoPeriodo(g) === '202608');
  console.log('Total 202608 groups:', groups08.length);

  const segOld = {};
  const segNew = {};

  groups08.forEach(g => {
    const isRec = (g.area_traslado || '').toUpperCase() === 'RECLUTAMIENTO';
    const fte = Number(g.rq_ftes_solicitado || g.rq_solicitado || 0);

    const sOld = oldNormalizeSegmento(g.segmento, g.campana);
    const sNew = newNormalizeSegmento(g.segmento, g.campana);

    if (!segOld[sOld]) segOld[sOld] = { count: 0, rqFtes: 0 };
    if (!segNew[sNew]) segNew[sNew] = { count: 0, rqFtes: 0 };

    segOld[sOld].count++;
    segNew[sNew].count++;

    if (isRec) {
      segOld[sOld].rqFtes += fte;
      segNew[sNew].rqFtes += fte;
    }
  });

  console.log('\n--- ANTES (CON EL CRUCE: RETENCIONES FIJA SUMANDO A RETENCIONES) ---');
  for (const [k, v] of Object.entries(segOld)) {
    console.log(`${k} -> Grupos: ${v.count} | RQ FTEs: ${v.rqFtes}`);
  }

  console.log('\n--- DESPUES (CORREGIDO: RETENCIONES FIJA SUMANDO A CLARO PERU) ---');
  for (const [k, v] of Object.entries(segNew)) {
    console.log(`${k} -> Grupos: ${v.count} | RQ FTEs: ${v.rqFtes}`);
  }
}
main();
