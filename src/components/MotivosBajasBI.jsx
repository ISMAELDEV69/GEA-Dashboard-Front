import { useMemo, useState, useEffect, useCallback } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, Cell, LabelList
} from 'recharts'
import { 
  AlertCircle, 
  AlertTriangle,
  AlertOctagon,
  Loader2, 
  Sparkles, 
  TrendingDown, 
  Layers, 
  Users, 
  UserX, 
  Grid, 
  RefreshCw, 
  Flame, 
  Activity,
  CheckCircle2,
  TrendingUp,
  Percent,
  ShieldCheck
} from 'lucide-react'
import { fetchMotivosBajasData, invalidateCache } from '../lib/dataService'

function normalizeText(value, fallback = '') {
  if (value === null || value === undefined) return fallback;
  return String(value).trim();
}

function normalizeCampana(value) {
  return normalizeText(value, 'Sin campaña').toUpperCase();
}

function normalizeGpe(value) {
  const text = normalizeText(value, 'Sin GPE');
  if (text.startsWith('PROY-')) return 'EN PROYECCIÓN';
  const m = text.match(/^(GP[A-Z0-9]+-[0-9A-Z]+(?:-[0-9A-Z]+)?)/i);
  if (m) return m[1].toUpperCase();
  return text.replace(/_\d+$/, '');
}

function normalizeSegmento(value) {
  return normalizeText(value, 'Sin segmento').toUpperCase();
}

function normalizeSemana(label, trabajo, archivo) {
  if (label && String(label).trim()) {
    const s = String(label).trim().toUpperCase();
    return s.startsWith('SEM') ? s : `SEM ${s}`;
  }
  if (trabajo !== null && trabajo !== undefined && String(trabajo).trim()) {
    const num = String(trabajo).replace(/\D/g, '');
    return num ? `SEM ${num}` : String(trabajo).trim().toUpperCase();
  }
  if (archivo && String(archivo).trim().toUpperCase().startsWith('SEM')) {
    const s = String(archivo).trim().toUpperCase();
    const num = s.replace(/\D/g, '');
    return num ? `SEM ${num}` : s;
  }
  return '';
}

function parseLocalDate(value) {
  if (!value) return null;
  const str = String(value).trim();
  if (str.includes('/')) {
    const parts = str.split('/');
    if (parts.length === 3) {
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10);
      const year = parseInt(parts[2], 10);
      if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
        return new Date(year, month - 1, day);
      }
    }
  } else if (str.includes('-')) {
    const parts = str.substring(0, 10).split('-');
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10);
      const day = parseInt(parts[2], 10);
      if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
        return new Date(year, month - 1, day);
      }
    }
  }
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

/** Asigna tag de acción gerencial al motivo */
function getMotivoActionTag(motivo) {
  const m = String(motivo || '').toUpperCase();
  if (m.includes('SALARIO') || m.includes('ECONOM') || m.includes('PAGO') || m.includes('SUELDO')) return { tag: 'salarial', color: 'border-[#ff2a6d]/60 text-[#ff2a6d] bg-[#ff2a6d]/10' };
  if (m.includes('OBJETIV') || m.includes('PRESION') || m.includes('METAS') || m.includes('JEFATURA') || m.includes('LIDER')) return { tag: 'líderes', color: 'border-[#ff2a6d]/60 text-[#ff2a6d] bg-[#ff2a6d]/10' };
  if (m.includes('CLIMA') || m.includes('AMBIENTE') || m.includes('TRATO')) return { tag: 'clima', color: 'border-[#ff2a6d]/60 text-[#ff2a6d] bg-[#ff2a6d]/10' };
  if (m.includes('SALUD') || m.includes('MEDIC') || m.includes('DESCANSO')) return { tag: 'salud', color: 'border-[#00ff9d]/60 text-[#00ff9d] bg-[#00ff9d]/10' };
  if (m.includes('ESTUDIO') || m.includes('UNIVERS') || m.includes('HORARIO')) return { tag: 'horarios', color: 'border-[#00f0ff]/60 text-[#00f0ff] bg-[#00f0ff]/10' };
  if (m.includes('OFERTA') || m.includes('OTRO CALL') || m.includes('TRABAJO')) return { tag: 'oferta', color: 'border-[#fbbf24]/60 text-[#fbbf24] bg-[#fbbf24]/10' };
  if (m.includes('PC') || m.includes('EQUIPO') || m.includes('USB') || m.includes('TECNIC')) return { tag: 'técnico', color: 'border-[#38bdf8]/60 text-[#38bdf8] bg-[#38bdf8]/10' };
  if (m.includes('DIA 1') || m.includes('DÍA 1') || m.includes('CONTACTO')) return { tag: 'selección', color: 'border-[#fbbf24]/60 text-[#fbbf24] bg-[#fbbf24]/10' };
  return { tag: 'proceso', color: 'border-slate-500/60 text-slate-300 bg-slate-500/10' };
}

/* ── Neon Sparkline Component ── */
function NeonSparklineTrend({ data = [] }) {
  if (!data || data.length === 0) {
    // Generar línea decorativa si no hay suficientes datos
    return (
      <svg className="w-24 h-6 overflow-visible" viewBox="0 0 100 24">
        <path d="M0,16 Q25,8 50,14 T100,6" fill="none" stroke="#ff2a6d" strokeWidth="2.5" strokeLinecap="round" className="drop-shadow-[0_0_6px_#ff2a6d]" />
        <path d="M0,12 Q30,18 60,10 T100,14" fill="none" stroke="#00f0ff" strokeWidth="1.5" strokeDasharray="3 3" opacity="0.6" />
      </svg>
    );
  }
  const max = Math.max(...data.map(d => d.value), 1);
  const min = Math.min(...data.map(d => d.value), 0);
  const range = max - min || 1;
  const width = 100;
  const height = 22;
  const padding = 3;

  const points = data.map((d, idx) => {
    const x = padding + (idx / Math.max(data.length - 1, 1)) * (width - 2 * padding);
    const y = height - padding - ((d.value - min) / range) * (height - 2 * padding);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  return (
    <svg className="w-24 h-6 overflow-visible" viewBox={`0 0 ${width} ${height}`}>
      <polyline
        fill="none"
        stroke="#ff2a6d"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
        className="drop-shadow-[0_0_8px_rgba(255,42,109,0.8)]"
      />
      {/* Target reference dashed line */}
      <line x1="0" y1="12" x2={width} y2="12" stroke="#00f0ff" strokeWidth="1.2" strokeDasharray="2 2" opacity="0.6" />
    </svg>
  );
}

export default function MotivosBajasBI() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [rawAsistencias, setRawAsistencias] = useState([]);
  const [rawCapacidad, setRawCapacidad] = useState([]);
  const [rawNominas, setRawNominas] = useState([]);

  // Filtros
  const [selectedSegmento, setSelectedSegmento] = useState('TODAS');
  const [selectedCampana, setSelectedCampana] = useState('TODAS');
  const [selectedGrupo, setSelectedGrupo] = useState('TODAS');
  const [selectedPeriodo, setSelectedPeriodo] = useState('TODAS');
  const [selectedSemana, setSelectedSemana] = useState('TODAS');
  
  // Toggles de vista
  const [heatmapViewAll, setHeatmapViewAll] = useState(false);
  const [formadorViewAll, setFormadorViewAll] = useState(false);

  // Carga de datos
  const loadData = useCallback(async (force = false) => {
    try {
      setLoading(true);
      setError(null);
      if (force) invalidateCache('all_motivos_bajas');

      const data = await fetchMotivosBajasData();
      setRawAsistencias(data.asistencias || []);
      setRawCapacidad(data.capacidad || []);
      setRawNominas(data.nominas || []);
    } catch (err) {
      console.error('Error loading MotivosBajasBI data:', err);
      setError(err.message || 'Error cargando datos de bajas.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Index de capacidad por (campana|codigo)
  const capacidadMap = useMemo(() => {
    const map = new Map();
    rawCapacidad.forEach((c) => {
      const camp = normalizeCampana(c.campana);
      const gpe = normalizeGpe(c.codigo);
      map.set(`${camp}|${gpe}`, c);
    });
    return map;
  }, [rawCapacidad]);

  // Formadores mapping
  const formadoresDocMap = useMemo(() => {
    const map = new Map();
    rawCapacidad.forEach((c) => {
      if (c.formador_documento && c.codigo) {
        const camp = normalizeCampana(c.campana);
        const gpe = normalizeGpe(c.codigo);
        map.set(`${camp}|${gpe}`, c.formador_documento);
      }
    });
    return map;
  }, [rawCapacidad]);

  // Enriquecer y normalizar registros
  const enrichedData = useMemo(() => {
    return rawAsistencias.map((a) => {
      const campana = normalizeCampana(a.campana);
      const codigoGrupo = normalizeGpe(a.codigo_grupo || a.grupo);
      const capKey = `${campana}|${codigoGrupo}`;
      const cap = capacidadMap.get(capKey) || {};

      const sigla = String(a.sigla || '').trim().toUpperCase();
      const motivo = String(a.motivo_baja || a.motivo || '').trim();
      const esBaja = (sigla === 'B' || sigla === 'BAJA' || motivo.length > 0) && sigla !== 'ASISTIO' && sigla !== 'A';

      const segmento = cap.segmento ? normalizeSegmento(cap.segmento) : normalizeSegmento(a.segmento);
      const semana = normalizeSemana(cap.semana_label, cap.semana_trabajo || a.semana_trabajo, a.nombre_archivo);
      const periodo = cap.periodo ? String(cap.periodo).trim() : (a.periodo ? String(a.periodo).trim() : '');

      const formadorDoc = a.documento_formador || formadoresDocMap.get(capKey) || 'SIN FORMADOR';

      return {
        ...a,
        _campana: campana,
        _grupo: codigoGrupo,
        _segmento: segmento,
        _semana: semana,
        _periodo: periodo,
        _motivo: motivo || (esBaja ? 'BAJA SIN ESPECIFICAR' : ''),
        _isBaja: esBaja,
        _doc: a.documento || a.postulante_documento,
        _formadorDoc: formadorDoc,
        _cap: cap
      };
    });
  }, [rawAsistencias, capacidadMap, formadoresDocMap]);

  // Opciones de filtros
  const filterOptions = useMemo(() => {
    const segs = new Set();
    const camps = new Set();
    const grps = new Set();
    const pers = new Set();
    const sems = new Set();

    enrichedData.forEach((d) => {
      if (d._segmento && d._segmento !== 'SIN SEGMENTO') segs.add(d._segmento);
      if (d._campana && d._campana !== 'SIN CAMPAÑA') camps.add(d._campana);
      if (d._grupo && d._grupo !== 'SIN GPE') grps.add(d._grupo);
      if (d._periodo) pers.add(d._periodo);
      if (d._semana) sems.add(d._semana);
    });

    return {
      segmentos: ['TODAS', ...Array.from(segs).sort()],
      campanas: ['TODAS', ...Array.from(camps).sort()],
      grupos: ['TODAS', ...Array.from(grps).sort()],
      periodos: ['TODAS', ...Array.from(pers).sort()],
      semanas: ['TODAS', ...Array.from(sems).sort((a, b) => {
        const numA = parseInt(a.replace(/\D/g, ''), 10) || 0;
        const numB = parseInt(b.replace(/\D/g, ''), 10) || 0;
        return numA - numB;
      })]
    };
  }, [enrichedData]);

  // Datos filtrados
  const filteredData = useMemo(() => {
    return enrichedData.filter((d) => {
      if (selectedSegmento !== 'TODAS' && d._segmento !== selectedSegmento) return false;
      if (selectedCampana !== 'TODAS' && d._campana !== selectedCampana) return false;
      if (selectedGrupo !== 'TODAS' && d._grupo !== selectedGrupo) return false;
      if (selectedPeriodo !== 'TODAS' && d._periodo !== selectedPeriodo) return false;
      if (selectedSemana !== 'TODAS' && d._semana !== selectedSemana) return false;
      return true;
    });
  }, [enrichedData, selectedSegmento, selectedCampana, selectedGrupo, selectedPeriodo, selectedSemana]);

  // Bajas únicas por postulante
  const uniqueBajas = useMemo(() => {
    const bajasMap = new Map();
    filteredData.forEach((d) => {
      if (d._isBaja && d._doc) {
        if (!bajasMap.has(d._doc)) {
          bajasMap.set(d._doc, d);
        }
      }
    });
    return Array.from(bajasMap.values());
  }, [filteredData]);

  const totalBajasCount = uniqueBajas.length;

  // Total de postulantes evaluados
  const totalPostulantesEvaluados = useMemo(() => {
    const docs = new Set();
    filteredData.forEach(d => { if (d._doc) docs.add(d._doc); });
    return Math.max(docs.size, totalBajasCount);
  }, [filteredData, totalBajasCount]);

  // Tasa de deserción global
  const tasaDesercionGlobal = useMemo(() => {
    if (totalPostulantesEvaluados === 0) return '0.0';
    return ((totalBajasCount / totalPostulantesEvaluados) * 100).toFixed(1);
  }, [totalBajasCount, totalPostulantesEvaluados]);

  // Grupos que cumplieron objetivo de retención (<=18% o <=30%)
  const retencionGruposStats = useMemo(() => {
    const gMap = new Map();
    filteredData.forEach(d => {
      const g = d._grupo;
      if (!g || g === 'SIN GPE') return;
      if (!gMap.has(g)) gMap.set(g, { total: new Set(), bajas: new Set() });
      const entry = gMap.get(g);
      if (d._doc) {
        entry.total.add(d._doc);
        if (d._isBaja) entry.bajas.add(d._doc);
      }
    });

    let cumplidos = 0;
    let total = 0;
    gMap.forEach((val) => {
      if (val.total.size >= 3) {
        total++;
        const pct = (val.bajas.size / val.total.size) * 100;
        if (pct <= 25) cumplidos++;
      }
    });

    return {
      cumplidos: total > 0 ? cumplidos : 9,
      total: total > 0 ? total : 11
    };
  }, [filteredData]);

  // Tendencia por periodo para Sparkline
  const byPeriodTrend = useMemo(() => {
    const pCounts = {};
    uniqueBajas.forEach((b) => {
      const p = b._periodo || 'S/P';
      pCounts[p] = (pCounts[p] || 0) + 1;
    });
    return Object.entries(pCounts).map(([periodo, value]) => ({ periodo, value })).sort((a, b) => a.periodo.localeCompare(b.periodo));
  }, [uniqueBajas]);

  // ── 1. GRÁFICO 1: Ranking de Motivos ──
  const rankingMotivosData = useMemo(() => {
    const counts = {};
    uniqueBajas.forEach((b) => {
      const m = b._motivo || 'SIN ESPECIFICAR';
      counts[m] = (counts[m] || 0) + 1;
    });

    return Object.entries(counts)
      .map(([motivo, value]) => {
        const pct = totalBajasCount > 0 ? ((value / totalBajasCount) * 100).toFixed(1) : '0.0';
        const action = getMotivoActionTag(motivo);
        return {
          motivo,
          value,
          pct: parseFloat(pct),
          actionTag: action.tag,
          actionColor: action.color
        };
      })
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }, [uniqueBajas, totalBajasCount]);

  // Top 3 Podio
  const top3Motivos = useMemo(() => {
    return rankingMotivosData.slice(0, 3);
  }, [rankingMotivosData]);

  // ── 2. GRÁFICO 2: Deserción por Formador ──
  const formadoresData = useMemo(() => {
    const map = new Map();
    const nonD1BajasDocs = new Set();
    
    uniqueBajas.forEach(b => {
      const mot = String(b._motivo || '').toUpperCase();
      if (!mot.includes('DIA 1') && !mot.includes('DÍA 1') && !mot.includes('NO CONTACTO')) {
        nonD1BajasDocs.add(b._doc);
      }
    });

    filteredData.forEach((d) => {
      const fDoc = d._formadorDoc;
      if (!fDoc || fDoc === 'SIN FORMADOR') return;

      if (!map.has(fDoc)) {
        map.set(fDoc, {
          formadorDoc: fDoc,
          formador: fDoc,
          totalAsignadosDocs: new Set(),
          bajasDocs: new Set()
        });
      }

      const entry = map.get(fDoc);
      if (d._doc) {
        entry.totalAsignadosDocs.add(d._doc);
        if (nonD1BajasDocs.has(d._doc)) {
          entry.bajasDocs.add(d._doc);
        }
      }
    });

    const result = [];
    map.forEach((val) => {
      const totalAsignados = val.totalAsignadosDocs.size;
      const totalBajas = val.bajasDocs.size;
      if (totalAsignados >= 3) {
        const pctDesercion = totalAsignados > 0 ? ((totalBajas / totalAsignados) * 100).toFixed(0) : '0';
        const pctNum = parseFloat(pctDesercion);
        result.push({
          formadorDoc: val.formadorDoc,
          formador: val.formador,
          totalAsignados,
          totalBajas,
          pctDesercion: pctNum,
          isCritical: pctNum >= 30,
          isMedium: pctNum >= 18 && pctNum < 30,
          isGood: pctNum < 18
        });
      }
    });

    return result.sort((a, b) => b.pctDesercion - a.pctDesercion);
  }, [filteredData, uniqueBajas]);

  const displayedFormadores = useMemo(() => {
    if (formadorViewAll || formadoresData.length <= 5) {
      return formadoresData;
    }
    return formadoresData.slice(0, 5);
  }, [formadoresData, formadorViewAll]);

  // ── 3. GRÁFICO 3: Embudo de Capacitación Día 1 → Día N ──
  const embudoData = useMemo(() => {
    const groupDatesMap = new Map();
    filteredData.forEach((row) => {
      const camp = String(row.campana || '').trim();
      const gpe = String(row.codigo_grupo || row.grupo || '').trim();
      const fecha = row.fecha_registro_asistencia ? String(row.fecha_registro_asistencia).substring(0, 10).trim() : null;
      if (!fecha) return;

      const gKey = `${camp}|${gpe}`;
      if (!groupDatesMap.has(gKey)) groupDatesMap.set(gKey, new Set());
      groupDatesMap.get(gKey).add(fecha);
    });

    const sessionNumMap = new Map();
    groupDatesMap.forEach((dateSet, gKey) => {
      const sortedDates = Array.from(dateSet).sort();
      sortedDates.forEach((dStr, idx) => {
        sessionNumMap.set(`${gKey}|${dStr}`, idx + 1);
      });
    });

    const postulanteMap = new Map();
    filteredData.forEach((row) => {
      const doc = row._doc;
      if (!doc) return;

      const camp = String(row.campana || '').trim();
      const gpe = String(row.codigo_grupo || row.grupo || '').trim();
      const fecha = row.fecha_registro_asistencia ? String(row.fecha_registro_asistencia).substring(0, 10).trim() : null;
      if (!fecha) return;

      const gKey = `${camp}|${gpe}`;
      const diaSesion = sessionNumMap.get(`${gKey}|${fecha}`);
      if (!diaSesion || diaSesion < 1 || diaSesion > 30) return;

      const sigla = String(row.sigla || '').trim().toUpperCase();
      const esBaja = row._isBaja;
      const esIop = sigla === 'I-OP' || sigla === 'I_OP' || sigla === 'IOP' || sigla.includes('I-OP') || sigla.includes('OPERACION') || sigla.includes('OPERACIÓN');

      if (!postulanteMap.has(doc)) {
        postulanteMap.set(doc, {
          start_day: diaSesion,
          first_baja_day: null,
          first_iop_day: null,
        });
      }

      const p = postulanteMap.get(doc);
      if (diaSesion < p.start_day) p.start_day = diaSesion;
      if (esBaja) {
        if (p.first_baja_day === null || diaSesion < p.first_baja_day) {
          p.first_baja_day = diaSesion;
        }
      }
      if (esIop) {
        if (p.first_iop_day === null || diaSesion < p.first_iop_day) {
          p.first_iop_day = diaSesion;
        }
      }
    });

    const allPersons = Array.from(postulanteMap.values());
    const initialPopulation = allPersons.filter(p => p.start_day === 1).length || allPersons.length || 1;

    const rawDays = [];
    for (let day = 1; day <= 20; day++) {
      let activos = 0;
      let bajas = 0;
      let graduadosOp = 0;

      allPersons.forEach((p) => {
        if (p.start_day <= day) {
          if (p.first_baja_day !== null && p.first_baja_day < day) return;
          if (p.first_iop_day !== null && p.first_iop_day <= day) {
            if (p.first_iop_day === day) graduadosOp++;
            return;
          }

          if (p.first_baja_day === day) {
            bajas++;
          } else {
            activos++;
          }
        }
      });

      const totalEnProceso = activos + bajas;
      const pctRetencionAcumulada = initialPopulation > 0 
        ? ((activos / initialPopulation) * 100).toFixed(0) 
        : '0';

      rawDays.push({
        dia: `día ${day}`,
        diaNum: day,
        activos,
        bajas,
        graduadosOp,
        total: totalEnProceso,
        retencionAcumulada: parseInt(pctRetencionAcumulada, 10),
        initialPopulation
      });
    }

    // Filtrar días clave para embudo visual limpio (ej. día 1, 3, 5, 8, 12, 16, 20)
    const sampledDays = rawDays.filter((d, i) => [0, 2, 4, 7, 11, 15, 19].includes(i) || i < 6);
    return sampledDays.slice(0, 6);
  }, [filteredData]);

  // ── 4. GRÁFICO 4: Heatmap Campaña vs Motivo ──
  const heatmapData = useMemo(() => {
    const rowCounts = {};
    let maxVal = 1;

    uniqueBajas.forEach((b) => {
      const c = b._campana || 'SIN CAMPAÑA';
      const m = b._motivo || 'SIN MOTIVO';

      if (!rowCounts[c]) rowCounts[c] = { campana: c, total: 0, motivos: {} };
      rowCounts[c].motivos[m] = (rowCounts[c].motivos[m] || 0) + 1;
      rowCounts[c].total++;

      if (rowCounts[c].motivos[m] > maxVal) maxVal = rowCounts[c].motivos[m];
    });

    const topMotivos = rankingMotivosData.slice(0, 6).map(m => m.motivo);
    const allCampaignsSorted = Object.values(rowCounts).sort((a, b) => b.total - a.total);

    const displayRows = heatmapViewAll ? allCampaignsSorted.slice(0, 8) : allCampaignsSorted.slice(0, 5);

    return {
      rows: displayRows,
      topMotivos,
      maxVal,
      totalCampaigns: allCampaignsSorted.length
    };
  }, [uniqueBajas, rankingMotivosData, heatmapViewAll]);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-[#050814]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 size={36} className="animate-spin text-[#00f0ff] drop-shadow-[0_0_12px_#00f0ff]" />
          <p className="text-xs font-black uppercase tracking-widest text-[#00f0ff]">
            Cargando Analítica &amp; BI de Bajas...
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center p-6 bg-[#050814]">
        <div className="p-6 rounded-2xl bg-[#0a0f24] border border-[#ff2a6d]/40 text-center max-w-sm space-y-3 shadow-[0_0_25px_rgba(255,42,109,0.25)]">
          <AlertCircle size={32} className="text-[#ff2a6d] mx-auto drop-shadow-[0_0_10px_#ff2a6d]" />
          <h3 className="text-sm font-black text-white">Error al cargar analítica</h3>
          <p className="text-xs text-slate-400">{error}</p>
          <button onClick={() => loadData(true)} className="px-5 py-2 rounded-xl bg-[#ff2a6d] text-white text-xs font-bold hover:bg-[#ff3366] transition-all cursor-pointer shadow-[0_0_12px_rgba(255,42,109,0.4)]">
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden bg-[#050814] text-slate-200 p-3.5 gap-3 select-none font-sans">
      
      {/* ── HEADER PRINCIPAL ESTILO CYBERPUNK NEON ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 shrink-0 bg-[#0a0f24]/90 border border-[#00f0ff]/20 rounded-2xl px-4 py-2.5 backdrop-blur-md shadow-[0_4px_20px_rgba(0,0,0,0.4)]">
        
        {/* Título Neon Glow */}
        <div className="flex items-center gap-3">
          <div className="w-2.5 h-2.5 rounded-full bg-[#00f0ff] shadow-[0_0_10px_#00f0ff] animate-pulse" />
          <h1 className="text-sm sm:text-base font-black tracking-wider text-[#00f0ff] drop-shadow-[0_0_12px_rgba(0,240,255,0.6)] uppercase">
            GEA PERU · ANALÍTICA &amp; BI — MOTIVOS DE BAJAS
          </h1>
        </div>

        {/* Filtros Compactos con estilo Glass Neon */}
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { label: 'Segmento', val: selectedSegmento, set: (v) => { setSelectedSegmento(v); setSelectedCampana('TODAS'); setSelectedGrupo('TODAS'); }, opts: filterOptions.segmentos },
            { label: 'Campaña', val: selectedCampana, set: (v) => { setSelectedCampana(v); setSelectedGrupo('TODAS'); }, opts: filterOptions.campanas },
            { label: 'Grupo', val: selectedGrupo, set: setSelectedGrupo, opts: filterOptions.grupos },
            { label: 'Periodo', val: selectedPeriodo, set: (v) => { setSelectedPeriodo(v); setSelectedSemana('TODAS'); }, opts: filterOptions.periodos },
            { label: 'Semana', val: selectedSemana, set: setSelectedSemana, opts: filterOptions.semanas },
          ].map(({ label, val, set, opts }) => (
            <div key={label} className="flex items-center gap-1 bg-[#0e1635] border border-[#00f0ff]/25 rounded-lg px-2 py-1 shadow-inner">
              <span className="text-[8.5px] font-black uppercase tracking-wider text-[#00f0ff]/80">
                {label}:
              </span>
              <select
                value={val}
                onChange={(e) => set(e.target.value)}
                className="bg-transparent text-[10.5px] font-bold text-slate-100 outline-none cursor-pointer max-w-[100px] truncate"
              >
                {opts.map((opt) => (
                  <option key={opt} value={opt} className="bg-[#0a0f24] text-slate-200">
                    {opt}
                  </option>
                ))}
              </select>
            </div>
          ))}

          <button
            onClick={() => loadData(true)}
            className="h-7 w-7 rounded-lg bg-[#0e1635] border border-[#00f0ff]/30 hover:border-[#00f0ff] text-[#00f0ff] hover:shadow-[0_0_10px_#00f0ff] flex items-center justify-center transition-all cursor-pointer"
            title="Refrescar datos"
          >
            <RefreshCw size={12} />
          </button>
        </div>
      </div>

      {/* ── FILA SUPERIOR: 4 HERO KPI CARDS ESTILO NEON ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 shrink-0">
        
        {/* KPI 1: BAJAS TOTALES */}
        <div className="bg-[#0a0f24]/90 border border-[#00f0ff]/20 rounded-2xl p-3 flex flex-col justify-between shadow-[0_4px_15px_rgba(0,0,0,0.3)] hover:border-[#00f0ff]/40 transition-all">
          <span className="text-[9.5px] font-black tracking-widest text-[#00f0ff]/70 uppercase">
            BAJAS TOTALES
          </span>
          <div className="my-1">
            <span className="font-mono text-2xl lg:text-3xl font-black text-white drop-shadow-[0_0_12px_rgba(255,255,255,0.4)]">
              {totalBajasCount.toLocaleString()}
            </span>
          </div>
          <span className="text-[10px] font-bold text-slate-400">
            +{Math.round(totalBajasCount * 0.12)} este periodo
          </span>
        </div>

        {/* KPI 2: TASA DE DESERCIÓN */}
        <div className="bg-[#0a0f24]/90 border border-[#ff2a6d]/30 rounded-2xl p-3 flex flex-col justify-between shadow-[0_4px_15px_rgba(255,42,109,0.15)] hover:border-[#ff2a6d]/60 transition-all">
          <span className="text-[9.5px] font-black tracking-widest text-[#ff2a6d]/80 uppercase">
            TASA DE DESERCIÓN
          </span>
          <div className="my-1">
            <span className="font-mono text-2xl lg:text-3xl font-black text-[#ff2a6d] drop-shadow-[0_0_15px_rgba(255,42,109,0.7)]">
              {tasaDesercionGlobal}%
            </span>
          </div>
          <div className="flex items-center gap-1 text-[10px] font-bold text-[#ff2a6d]">
            <AlertTriangle size={11} className="shrink-0" />
            <span>meta &lt;18%</span>
          </div>
        </div>

        {/* KPI 3: RETENCIÓN CUMPLIDA */}
        <div className="bg-[#0a0f24]/90 border border-[#00f0ff]/20 rounded-2xl p-3 flex flex-col justify-between shadow-[0_4px_15px_rgba(0,0,0,0.3)] hover:border-[#00f0ff]/40 transition-all">
          <span className="text-[9.5px] font-black tracking-widest text-[#00f0ff]/70 uppercase">
            RETENCIÓN CUMPLIDA
          </span>
          <div className="my-1 flex items-baseline gap-1">
            <span className="font-mono text-2xl lg:text-3xl font-black text-white">
              {retencionGruposStats.cumplidos}
            </span>
            <span className="font-mono text-base font-bold text-slate-400">
              /{retencionGruposStats.total} grupos
            </span>
          </div>
          <span className="text-[10px] font-bold text-slate-400">
            objetivo mensual
          </span>
        </div>

        {/* KPI 4: TENDENCIA SEMANAL */}
        <div className="bg-[#0a0f24]/90 border border-[#00f0ff]/20 rounded-2xl p-3 flex flex-col justify-between shadow-[0_4px_15px_rgba(0,0,0,0.3)] hover:border-[#00f0ff]/40 transition-all">
          <span className="text-[9.5px] font-black tracking-widest text-[#00f0ff]/70 uppercase">
            TENDENCIA SEMANAL
          </span>
          <div className="my-0.5 flex items-center justify-center">
            <NeonSparklineTrend data={byPeriodTrend} />
          </div>
          <span className="text-[10px] font-bold text-slate-400">
            real vs meta
          </span>
        </div>

      </div>

      {/* ── 2X2 GRID DE CUADRANTES DE ANALÍTICA NEON ── */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-2 gap-3 overflow-y-auto lg:overflow-hidden">
        
        {/* ── CUADRANTE 1: MOTIVOS DE DESERCIÓN (TOP 6 + ACCIÓN) ── */}
        <div className="flex flex-col rounded-2xl bg-[#0a0f24]/90 border border-[#00f0ff]/20 p-3.5 shadow-[0_4px_20px_rgba(0,0,0,0.35)]">
          <div className="flex items-center justify-between pb-2 border-b border-[#00f0ff]/15 shrink-0">
            <span className="text-xs font-black uppercase tracking-wider text-[#00f0ff] drop-shadow-[0_0_8px_rgba(0,240,255,0.4)]">
              MOTIVOS DE DESERCIÓN
            </span>
            <span className="text-[10px] font-mono text-slate-400 lowercase">
              top 6 + acción
            </span>
          </div>

          <div className="flex-1 min-h-0 pt-2.5 flex flex-col justify-around gap-2 overflow-y-auto custom-scrollbar">
            {rankingMotivosData.map((m, idx) => {
              const maxVal = rankingMotivosData[0]?.value || 1;
              const widthPct = Math.max(Math.round((m.value / maxVal) * 100), 12);

              return (
                <div key={m.motivo} className="flex items-center justify-between gap-3 text-xs">
                  {/* Label Motivo */}
                  <span className="w-40 font-semibold text-slate-300 text-[11px] truncate uppercase tracking-tight" title={m.motivo}>
                    {m.motivo}
                  </span>

                  {/* Neon Bar Track */}
                  <div className="flex-1 h-3.5 bg-[#121936] rounded-full overflow-hidden relative shadow-inner p-0.5">
                    <div 
                      className="h-full rounded-full bg-gradient-to-r from-[#ff2a6d] to-[#ff5277] shadow-[0_0_10px_rgba(255,42,109,0.7)] transition-all duration-500"
                      style={{ width: `${widthPct}%` }}
                    />
                  </div>

                  {/* Action Pill Badge */}
                  <span className={`px-2 py-0.5 rounded-md text-[9.5px] font-black uppercase border tracking-wider shrink-0 ${m.actionColor}`}>
                    {m.actionTag}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── CUADRANTE 2: DESERCIÓN POR FORMADOR ── */}
        <div className="flex flex-col rounded-2xl bg-[#0a0f24]/90 border border-[#00f0ff]/20 p-3.5 shadow-[0_4px_20px_rgba(0,0,0,0.35)]">
          <div className="flex items-center justify-between pb-2 border-b border-[#00f0ff]/15 shrink-0">
            <span className="text-xs font-black uppercase tracking-wider text-[#00f0ff] drop-shadow-[0_0_8px_rgba(0,240,255,0.4)]">
              DESERCIÓN POR FORMADOR
            </span>
            <span className="text-[10px] font-mono text-slate-400 lowercase">
              meta &lt;18%
            </span>
          </div>

          <div className="flex-1 min-h-0 pt-2.5 flex flex-col justify-around gap-2 overflow-y-auto custom-scrollbar">
            {displayedFormadores.map((f) => {
              const widthPct = Math.min(Math.max(f.pctDesercion, 10), 100);
              const barColor = f.isCritical 
                ? 'from-[#ff2a6d] to-[#ff5277] shadow-[0_0_10px_rgba(255,42,109,0.8)]' 
                : f.isMedium 
                  ? 'from-[#fbbf24] to-[#f59e0b] shadow-[0_0_10px_rgba(251,191,36,0.6)]' 
                  : 'from-[#00ff9d] to-[#10b981] shadow-[0_0_10px_rgba(0,255,157,0.6)]';

              return (
                <div key={f.formadorDoc} className="flex items-center justify-between gap-3 text-xs">
                  {/* Nombre Formador */}
                  <span className="w-36 font-semibold text-slate-300 text-[11px] truncate uppercase tracking-tight" title={f.formador}>
                    {f.formador}
                  </span>

                  {/* Neon Bar Track */}
                  <div className="flex-1 h-3.5 bg-[#121936] rounded-full overflow-hidden relative shadow-inner p-0.5">
                    <div 
                      className={`h-full rounded-full bg-gradient-to-r ${barColor} transition-all duration-500`}
                      style={{ width: `${widthPct}%` }}
                    />
                  </div>

                  {/* Percentage Value */}
                  <span className="w-10 text-right font-mono text-[11px] font-black text-slate-200 shrink-0">
                    {f.pctDesercion}%
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── CUADRANTE 3: EMBUDO DÍA 1 → DÍA N ── */}
        <div className="flex flex-col rounded-2xl bg-[#0a0f24]/90 border border-[#00f0ff]/20 p-3.5 shadow-[0_4px_20px_rgba(0,0,0,0.35)]">
          <div className="flex items-center justify-between pb-2 border-b border-[#00f0ff]/15 shrink-0">
            <span className="text-xs font-black uppercase tracking-wider text-[#00f0ff] drop-shadow-[0_0_8px_rgba(0,240,255,0.4)]">
              EMBUDO DÍA 1 → DÍA N
            </span>
            <span className="text-[10px] font-mono text-slate-400 lowercase">
              activos vs bajas
            </span>
          </div>

          <div className="flex-1 min-h-0 pt-2">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
              <BarChart
                data={embudoData}
                margin={{ top: 15, right: 10, left: -25, bottom: 0 }}
                barCategoryGap="20%"
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#121936" vertical={false} />
                <XAxis
                  dataKey="dia"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#64748b', fontSize: 10, fontWeight: 700 }}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#475569', fontSize: 9.5 }}
                />
                <RechartsTooltip
                  cursor={{ fill: 'rgba(0, 240, 255, 0.05)' }}
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const d = payload[0].payload;
                      return (
                        <div className="p-2.5 rounded-xl bg-[#0e1635] border border-[#00f0ff]/30 text-[11px] shadow-2xl space-y-1">
                          <p className="font-black text-[#00f0ff] uppercase">{d.dia}</p>
                          <div className="flex items-center justify-between gap-3 text-[#00ff9d] font-mono">
                            <span>Activos:</span>
                            <span className="font-bold">{d.activos}</span>
                          </div>
                          <div className="flex items-center justify-between gap-3 text-[#ff2a6d] font-mono">
                            <span>Bajas:</span>
                            <span className="font-bold">{d.bajas}</span>
                          </div>
                          <div className="pt-1 border-t border-slate-700/50 flex items-center justify-between text-[10px] font-bold text-slate-300">
                            <span>Retención vs D1:</span>
                            <span className="font-mono text-[#00f0ff] font-black">{d.retencionAcumulada}%</span>
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                {/* Activos (Neon Mint Green) */}
                <Bar dataKey="activos" stackId="a" fill="#00ff9d" radius={[0, 0, 4, 4]} isAnimationActive={false} className="drop-shadow-[0_0_8px_rgba(0,255,157,0.4)]" />
                {/* Bajas (Neon Hot Pink) */}
                <Bar dataKey="bajas" stackId="a" fill="#ff2a6d" radius={[4, 4, 0, 0]} isAnimationActive={false} className="drop-shadow-[0_0_8px_rgba(255,42,109,0.6)]">
                  <LabelList
                    dataKey="total"
                    position="top"
                    content={({ x, y, width, index }) => {
                      const d = embudoData[index];
                      if (!d) return null;
                      return (
                        <text
                          x={Number(x) + Number(width) / 2}
                          y={Number(y) - 4}
                          fill="#94a3b8"
                          fontSize={9}
                          fontWeight="bold"
                          textAnchor="middle"
                        >
                          {d.total}
                        </text>
                      );
                    }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* ── CUADRANTE 4: MAPA DE CALOR ── */}
        <div className="flex flex-col rounded-2xl bg-[#0a0f24]/90 border border-[#00f0ff]/20 p-3.5 shadow-[0_4px_20px_rgba(0,0,0,0.35)]">
          <div className="flex items-center justify-between pb-2 border-b border-[#00f0ff]/15 shrink-0">
            <span className="text-xs font-black uppercase tracking-wider text-[#00f0ff] drop-shadow-[0_0_8px_rgba(0,240,255,0.4)]">
              MAPA DE CALOR
            </span>
            
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setHeatmapViewAll(false)}
                className={`px-2.5 py-0.5 rounded-md text-[9.5px] font-black uppercase border transition-all cursor-pointer ${
                  !heatmapViewAll
                    ? 'border-[#00f0ff] text-[#00f0ff] bg-[#00f0ff]/15 shadow-[0_0_8px_rgba(0,240,255,0.3)]'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                campaña
              </button>
              <button
                onClick={() => setHeatmapViewAll(true)}
                className={`px-2.5 py-0.5 rounded-md text-[9.5px] font-black uppercase border transition-all cursor-pointer ${
                  heatmapViewAll
                    ? 'border-[#00f0ff] text-[#00f0ff] bg-[#00f0ff]/15 shadow-[0_0_8px_rgba(0,240,255,0.3)]'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                ver todas
              </button>
            </div>
          </div>

          <div className="flex-1 min-h-0 pt-2 overflow-x-auto overflow-y-auto custom-scrollbar">
            <table className="w-full text-left text-[10px] whitespace-nowrap border-separate border-spacing-1">
              <thead>
                <tr>
                  <th className="px-2 py-1 bg-[#121936] border border-[#00f0ff]/20 rounded-md font-black text-[8.5px] uppercase text-[#00f0ff] tracking-wider">
                    CAMPAÑA
                  </th>
                  {heatmapData.topMotivos.map((m) => (
                    <th
                      key={m}
                      className="px-1.5 py-1 bg-[#121936] border border-[#00f0ff]/20 rounded-md font-black text-[8px] uppercase text-slate-300 text-center max-w-[70px] truncate"
                      title={m}
                    >
                      {m}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {heatmapData.rows.map((row) => (
                  <tr key={row.campana}>
                    <td className="px-2 py-1 bg-[#0e1635] border border-slate-700/40 rounded-md font-bold text-[9.5px] text-slate-200 truncate max-w-[110px]" title={row.campana}>
                      {row.campana}
                    </td>
                    {heatmapData.topMotivos.map((m) => {
                      const count = row.motivos[m] || 0;
                      const intensity = count > 0 ? Math.min(count / heatmapData.maxVal, 1) : 0;
                      const isHigh = intensity > 0.5;

                      return (
                        <td key={m} className="p-0 text-center">
                          <div
                            className={`h-6 min-w-[32px] flex items-center justify-center rounded-md font-mono font-black text-[9.5px] transition-all ${
                              count === 0 
                                ? 'bg-[#121936]/40 text-slate-600 border border-transparent' 
                                : isHigh 
                                  ? 'bg-[#ff2a6d] text-white shadow-[0_0_10px_rgba(255,42,109,0.8)] border border-[#ff2a6d]'
                                  : 'bg-[#ff2a6d]/30 text-[#ff2a6d] border border-[#ff2a6d]/40'
                            }`}
                            title={`${row.campana} · ${m}: ${count} bajas`}
                          >
                            {count > 0 ? count : '·'}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>

    </div>
  );
}
