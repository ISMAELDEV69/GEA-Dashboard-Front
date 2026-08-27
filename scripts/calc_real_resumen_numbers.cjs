const https = require('https');

const SUPABASE_URL = 'https://ujqehcpglfhnytzsyedp.supabase.co';
const SUPABASE_KEY = 'sb_publishable_wt_Muu3dmb0GjulWMDYpqg_NKRYqKNE';

function fetchSupabaseRange(path, offset = 0, limit = 1000) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${SUPABASE_URL}/rest/v1/${path}`);
    const req = https.request(url, {
      method: 'GET',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Range-Unit': 'items',
        'Range': `${offset}-${offset + limit - 1}`
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function fetchAll(tableWithSelect) {
  let all = [];
  let offset = 0;
  const step = 1000;
  while (true) {
    const chunk = await fetchSupabaseRange(tableWithSelect, offset, step);
    if (!Array.isArray(chunk) || chunk.length === 0) break;
    all.push(...chunk);
    if (chunk.length < step) break;
    offset += step;
  }
  return all;
}

async function run() {
  console.log('Fetching datos completos paginados de Supabase...');
  const [capacidad, nominas, asistencias, asistCap, descuentos] = await Promise.all([
    fetchAll('capacidad_rys?select=codigo,campana,segmento,sede,estado,rq_solicitado,fecha_inicio_ojt,periodo,semana_label,semana_trabajo'),
    fetchAll('nominas?select=documento,campana,grupo_codigo,dia_0,dia_1,estado'),
    fetchAll('consolidado_asistencias?select=documento,campana,codigo_grupo,sigla,sigla_asistencia,estado,motivo_baja,observacion_estado,fecha_registro_asistencia'),
    fetchAll('asistencias_capacitacion?select=postulante_documento,grupo_codigo,sigla,estado,motivo_baja,fecha_asistencia'),
    fetchAll('descuentos?select=dni_ce,campana,grupo_cap,procede,autoriza_rys,autoriza_cap')
  ]);

  console.log(`Capacidad: ${capacidad.length} grupos`);
  console.log(`Nominas: ${nominas.length} registros`);
  console.log(`Consolidado Asistencias: ${asistencias.length} registros`);
  console.log(`Asistencias Capacitacion: ${asistCap.length} registros`);
  console.log(`Descuentos: ${descuentos.length} registros`);

  // 1. Analisis de Sede
  let conSede = 0;
  let sinSede = 0;
  capacidad.forEach(g => {
    const s = (g.sede || '').trim().toUpperCase();
    if (s) conSede++;
    else sinSede++;
  });
  console.log('\n--- DISTRIBUCION DE SEDES EN capacidad_rys ---');
  console.log(`Grupos con Sede poblada: ${conSede} (${Math.round((conSede/capacidad.length)*100)}%)`);
  console.log(`Grupos con Sede NULL o vacia: ${sinSede} (${Math.round((sinSede/capacidad.length)*100)}%)`);

  // 2. Descuentos set
  const descSet = new Set();
  descuentos.forEach(d => {
    const autRys = (d.autoriza_rys || '').trim().toUpperCase();
    const autCap = (d.autoriza_cap || '').trim().toUpperCase();
    const procede = (d.procede || '').trim().toUpperCase();
    if (procede === 'PROCEDE' || (autRys === 'SI' && autCap === 'SI') || autRys === 'SI') {
      const key = `${(d.dni_ce||'').trim()}|${(d.campana||'').trim().toUpperCase()}|${(d.grupo_cap||'').trim().toUpperCase()}`;
      descSet.add(key);
    }
  });

  // Group nominas by grupo
  const nomMap = new Map();
  nominas.forEach(n => {
    const doc = (n.documento || '').trim();
    const camp = (n.campana || '').trim().toUpperCase();
    const gpe = (n.grupo_codigo || '').trim().toUpperCase();
    const descKey = `${doc}|${camp}|${gpe}`;
    if (!descSet.has(descKey)) {
      const gKey = `${camp}|${gpe}`;
      if (!nomMap.has(gKey)) nomMap.set(gKey, []);
      nomMap.get(gKey).push(n);
    }
  });

  // Group asistencias by grupo & doc
  const asisMap = new Map();
  asistencias.forEach(a => {
    const doc = (a.documento || '').trim();
    const camp = (a.campana || '').trim().toUpperCase();
    const gpe = (a.codigo_grupo || '').trim().toUpperCase();
    const docKey = `${doc}|${camp}|${gpe}`;
    if (!asisMap.has(docKey)) asisMap.set(docKey, []);
    asisMap.get(docKey).push(a);
  });

  // Calculate 4 stages:
  let totalReclutados = 0;
  let totalDia1Asistio = 0;
  let totalDia1ExcluidoBaja = 0;
  let totalActivosOjt = 0;
  let totalIngresosIop = 0;
  let totalRqSolicitado = 0;

  // By Segment breakdown
  const segStats = {};

  capacidad.forEach(g => {
    const seg = (g.segmento || 'SIN SEGMENTO').trim().toUpperCase();
    if (!segStats[seg]) {
      segStats[seg] = { rq: 0, reclutados: 0, d1: 0, ojt: 0, iop: 0, grupos: 0 };
    }
    segStats[seg].grupos++;

    const camp = (g.campana || '').trim().toUpperCase();
    const gpe = (g.codigo || '').trim().toUpperCase();
    const gKey = `${camp}|${gpe}`;
    const groupNoms = nomMap.get(gKey) || [];
    
    const rq = (parseInt(g.rq_solicitado, 10) || 0);
    totalRqSolicitado += rq;
    segStats[seg].rq += rq;

    groupNoms.forEach(n => {
      totalReclutados++;
      segStats[seg].reclutados++;

      const doc = (n.documento || '').trim();
      const docKey = `${doc}|${camp}|${gpe}`;
      const records = asisMap.get(docKey) || [];

      const tieneIop = records.some(r => {
        const s = (r.sigla || r.sigla_asistencia || '').trim().toUpperCase();
        return s === 'I-OP';
      });

      const d1Nomina = (n.dia_1 || '').trim().toUpperCase() === 'ASISTIO';
      
      const isBajaDia1 = records.some(r => {
        const m = (r.motivo_baja || '').toUpperCase();
        const e = (r.estado || '').toUpperCase();
        const o = (r.observacion_estado || '').toUpperCase();
        return m.includes('BAJA DIA 1') || e.includes('BAJA DIA 1') || o.includes('BAJA DIA 1');
      });

      if ((d1Nomina || tieneIop) && !isBajaDia1) {
        totalDia1Asistio++;
        segStats[seg].d1++;
      } else if (d1Nomina && isBajaDia1) {
        totalDia1ExcluidoBaja++;
      }

      // OJT
      let isOjt = false;
      if (tieneIop) {
        isOjt = true;
      } else if ((d1Nomina || records.length > 0) && !isBajaDia1) {
        if (g.fecha_inicio_ojt) {
          const hasOjtAsis = records.some(r => {
            const f = (r.fecha_registro_asistencia || '').slice(0, 10);
            return f >= g.fecha_inicio_ojt && (r.sigla === 'A' || r.sigla_asistencia === 'A');
          });
          if (hasOjtAsis) isOjt = true;
        }
      }
      if (isOjt) {
        totalActivosOjt++;
        segStats[seg].ojt++;
      }

      if (tieneIop) {
        totalIngresosIop++;
        segStats[seg].iop++;
      }
    });
  });

  console.log('\n=== METRICAS REALES GLOBALES DE PRODUCCION (882 GRUPOS) ===');
  console.log(`1. Total Requerimiento Solicitado (RQ): ${totalRqSolicitado}`);
  console.log(`2. Etapa 1 - Total Reclutados (Nómina sin descuentos): ${totalReclutados}`);
  console.log(`3. Etapa 2 - Inicio Formación (Día 1 asistió sin Baja Día 1): ${totalDia1Asistio}`);
  console.log(`   (Postulantes con dia_1='ASISTIO' pero con Baja Día 1 excluidos: ${totalDia1ExcluidoBaja})`);
  console.log(`4. Etapa 3 - Activos / Conexión en OJT: ${totalActivosOjt}`);
  console.log(`5. Etapa 4 - Pases a Operaciones (I-OP): ${totalIngresosIop}`);
  console.log(`\nTasas Reales Globales:`);
  console.log(`- Conversión D1 vs Reclutados: ${Math.round((totalDia1Asistio/totalReclutados)*100)}%`);
  console.log(`- Retención OJT vs D1: ${Math.round((totalActivosOjt/totalDia1Asistio)*100)}%`);
  console.log(`- Conversión Global I-OP vs Reclutados: ${Math.round((totalIngresosIop/totalReclutados)*100)}%`);
  console.log(`- Cumplimiento de RQ (I-OP vs Solicitado): ${totalRqSolicitado > 0 ? Math.round((totalIngresosIop/totalRqSolicitado)*100) : 'N/A'}%`);

  console.log('\n=== DESGLOSE REAL POR SEGMENTO ===');
  console.table(segStats);
}

run().catch(console.error);
