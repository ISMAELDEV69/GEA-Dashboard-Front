require('dotenv').config({ path: '.env.local' });
const { Client } = require('pg');

async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  console.log('Conectado directamente a PostgreSQL en Supabase...');

  // 1. Fetch tables
  const { rows: capacidad } = await client.query(`
    SELECT codigo, campana, segmento, sede, estado, rq_solicitado, fecha_inicio_ojt, periodo, semana_label, semana_trabajo
    FROM capacidad_rys
  `);

  const { rows: nominas } = await client.query(`
    SELECT documento, campana, grupo_codigo, dia_0, dia_1, estado
    FROM nominas
  `);

  const { rows: sample } = await client.query(`SELECT * FROM consolidado_asistencias LIMIT 1`);
  console.log('Columns in consolidado_asistencias:', Object.keys(sample[0] || {}));

  const { rows: asistencias } = await client.query(`
    SELECT * FROM consolidado_asistencias
  `);

  const { rows: descuentos } = await client.query(`
    SELECT dni_ce, campana, grupo_cap, procede, autoriza_rys, autoriza_cap
    FROM descuentos
  `);

  await client.end();

  console.log(`Capacidad: ${capacidad.length} grupos`);
  console.log(`Nominas: ${nominas.length} registros`);
  console.log(`Asistencias: ${asistencias.length} registros`);
  console.log(`Descuentos: ${descuentos.length} registros`);

  // Descuentos set
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

  // Sample dates
  const capWithOjt = capacidad.filter(g => g.fecha_inicio_ojt);
  console.log(`Grupos con fecha_inicio_ojt: ${capWithOjt.length}`);
  console.log('Sample fecha_inicio_ojt:', capWithOjt.slice(0, 5).map(g => ({ cod: g.codigo, fOjt: g.fecha_inicio_ojt })));
  console.log('Sample fecha_registro_asistencia:', asistencias.slice(0, 5).map(a => ({ doc: a.documento, fAsis: a.fecha_registro_asistencia })));

  function parseFechaAsistencia(val) {
    if (!val) return '';
    if (typeof val === 'string') {
      const s = val.trim();
      if (s.includes('T')) return s.split('T')[0];
      if (s.includes('/')) {
        const parts = s.split('/');
        if (parts.length === 3) {
          if (parts[0].length === 4) return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
          return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
        }
      }
      if (s.includes('-')) {
        const parts = s.split('-');
        if (parts.length === 3) {
          if (parts[0].length === 4) return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
          return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
        }
      }
    }
    if (val instanceof Date && !isNaN(val)) {
      return val.toISOString().slice(0, 10);
    }
    return '';
  }

  // Check what siglas exist in consolidado_asistencias
  const siglaCount = {};
  asistencias.forEach(a => {
    const s = (a.sigla || 'VACIO').trim().toUpperCase();
    siglaCount[s] = (siglaCount[s] || 0) + 1;
  });
  console.log('\nDistribución de Siglas en consolidado_asistencias:', siglaCount);

  // Check postulantes with asistencia in groups that have fecha_inicio_ojt
  let docsWithAttendance = 0;
  let docsWithAnyA = 0;
  nomMap.forEach((noms, gKey) => {
    noms.forEach(n => {
      const doc = (n.documento || '').trim();
      const records = asisMap.get(`${doc}|${gKey}`) || [];
      if (records.length > 0) docsWithAttendance++;
      if (records.some(r => r.sigla === 'A' || r.estado === 'ACTIVO')) docsWithAnyA++;
    });
  });
  console.log(`Postulantes con asistencias registradas: ${docsWithAttendance}`);
  console.log(`Postulantes con al menos una 'A' o 'ACTIVO': ${docsWithAnyA}`);

  function getSegmentoNormalizado(rawSeg, campana) {
    let s = (rawSeg || '').trim().toUpperCase();
    if (!s || s === 'NULL') {
      const c = (campana || '').toUpperCase();
      if (c.includes('CHILE')) return 'CLARO CHILE';
      if (c.includes('RETENCION')) return 'CLARO PERU RETENCIONES';
      if (c.includes('OUT') || c.includes('PREVENTIVA') || c.includes('PORTA OUT') || c.includes('RENO OUT') || c.includes('VENTAS OUT') || c.includes('CROSS')) return 'CLARO PERU OUT';
      if (c.includes('LIPIGAS')) return 'LIPIGAS';
      return 'CLARO PERU';
    }
    if (s.includes('CHILE')) return 'CLARO CHILE';
    if (s.includes('RETENCION')) return 'CLARO PERU RETENCIONES';
    if (s.includes('OUT')) return 'CLARO PERU OUT';
    if (s.includes('LIPIGAS')) return 'LIPIGAS';
    return 'CLARO PERU';
  }

  // Segment stats
  const segStats = {
    'CLARO PERU': { rq: 0, reclutados: 0, d1: 0, ojt: 0, iop: 0, grupos: 0 },
    'CLARO PERU RETENCIONES': { rq: 0, reclutados: 0, d1: 0, ojt: 0, iop: 0, grupos: 0 },
    'CLARO PERU OUT': { rq: 0, reclutados: 0, d1: 0, ojt: 0, iop: 0, grupos: 0 },
    'CLARO CHILE': { rq: 0, reclutados: 0, d1: 0, ojt: 0, iop: 0, grupos: 0 },
    'LIPIGAS': { rq: 0, reclutados: 0, d1: 0, ojt: 0, iop: 0, grupos: 0 }
  };

  let globalTotals = { rq: 0, reclutados: 0, d1: 0, ojt: 0, iop: 0, grupos: 0 };
  let countOjtInTransit = 0;
  let countOjtWithIop = 0;

  capacidad.forEach(g => {
    const segKey = getSegmentoNormalizado(g.segmento, g.campana);
    const targetSeg = segStats[segKey] || (segStats[segKey] = { rq: 0, reclutados: 0, d1: 0, ojt: 0, iop: 0, grupos: 0 });

    const rq = parseInt(g.rq_solicitado, 10) || 0;
    targetSeg.rq += rq;
    targetSeg.grupos += 1;
    globalTotals.rq += rq;
    globalTotals.grupos += 1;

    const camp = (g.campana || '').trim().toUpperCase();
    const gpe = (g.codigo || '').trim().toUpperCase();
    const gKey = `${camp}|${gpe}`;
    const groupNoms = nomMap.get(gKey) || [];

    groupNoms.forEach(n => {
      targetSeg.reclutados++;
      globalTotals.reclutados++;

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
        targetSeg.d1++;
        globalTotals.d1++;
      }

      // OJT
      let isOjt = false;
      const targetDateStr = parseFechaAsistencia(g.fecha_inicio_ojt);

      if (tieneIop) {
        isOjt = true;
        countOjtWithIop++;
      } else if (d1Nomina && !isBajaDia1) {
        if (targetDateStr) {
          const hasOjtAsis = records.some(r => {
            const rawDate = r.fecha_registro_asistencia || r.fecha_asistencia;
            if (!rawDate) return false;
            const recordDateStr = parseFechaAsistencia(rawDate);
            const sigla = String(r.sigla || '').toUpperCase().trim();
            const estado = String(r.estado || '').toUpperCase().trim();
            const motivo = String(r.motivo_baja || '').toUpperCase().trim();
            const isBaja = sigla === 'B' || motivo.includes('BAJA') || estado.includes('BAJA') || estado === 'CESADO' || estado === 'INACTIVO';
            return recordDateStr >= targetDateStr && !isBaja;
          });
          if (hasOjtAsis) {
            isOjt = true;
            countOjtInTransit++;
          }
        }
      }
      if (isOjt) {
        targetSeg.ojt++;
        globalTotals.ojt++;
      }

      if (tieneIop) {
        targetSeg.iop++;
        globalTotals.iop++;
      }
    });
  });

  console.log('\n=== DESGLOSE EXACTO POR SEGMENTO (CON LÓGICA UNIFICADA) ===');
  console.table(segStats);

  console.log('=== TOTAL GLOBAL DE LA SUMA DE LOS 5 SEGMENTOS ===');
  console.table([globalTotals]);

  // Verificar si cuadra exactamente
  let sumRq = 0, sumNom = 0, sumD1 = 0, sumOjt = 0, sumIop = 0;
  Object.values(segStats).forEach(s => {
    sumRq += s.rq;
    sumNom += s.reclutados;
    sumD1 += s.d1;
    sumOjt += s.ojt;
    sumIop += s.iop;
  });

  console.log(`Detalle de OJT:`);
  console.log(`- Con Pase I-OP confirmado: ${countOjtWithIop}`);
  console.log(`- En Tránsito (asistiendo en OJT sin I-OP todavía): ${countOjtInTransit}`);
  console.log(`- Total OJT: ${globalTotals.ojt}`);

  console.log(`\nVerificación de Cuadre:`);
  console.log(`- Suma RQ:          ${sumRq}  (Global: ${globalTotals.rq})  -> Cuadra: ${sumRq === globalTotals.rq ? 'SI ✅' : 'NO ❌'}`);
  console.log(`- Suma Reclutados:  ${sumNom} (Global: ${globalTotals.reclutados}) -> Cuadra: ${sumNom === globalTotals.reclutados ? 'SI ✅' : 'NO ❌'}`);
  console.log(`- Suma Día 1:       ${sumD1}  (Global: ${globalTotals.d1})  -> Cuadra: ${sumD1 === globalTotals.d1 ? 'SI ✅' : 'NO ❌'}`);
  console.log(`- Suma OJT:         ${sumOjt} (Global: ${globalTotals.ojt})  -> Cuadra: ${sumOjt === globalTotals.ojt ? 'SI ✅' : 'NO ❌'}`);
  console.log(`- Suma Pases I-OP:  ${sumIop} (Global: ${globalTotals.iop})  -> Cuadra: ${sumIop === globalTotals.iop ? 'SI ✅' : 'NO ❌'}`);
}

run().catch(console.error);
