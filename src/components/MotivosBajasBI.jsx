import { useMemo, useState, useEffect, useCallback } from 'react'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, Cell, LabelList, ReferenceLine
} from 'recharts'
import { 
  AlertCircle, 
  AlertTriangle,
  Loader2, 
  TrendingDown, 
  Users, 
  UserX, 
  Grid, 
  RefreshCw, 
  Flame, 
  Activity,
  ArrowRight,
  ShieldAlert,
  Calendar,
  Layers,
  Award,
  CheckCircle2
} from 'lucide-react'
import { fetchMotivosBajasData, invalidateCache, parseFechaAsistencia, isBajaCapacitacion, isBajaDia1, normalizarMotivo } from '../lib/dataService'

// Meta global de deserción corporativa (≤40%)
const META_DESERCION = 40;

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

export default function MotivosBajasBI() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState({ consolidado: [], capacidades: [], nominas: [] });

  // Filtros
  const [selectedSegmento, setSelectedSegmento] = useState('TODAS');
  const [selectedCampana, setSelectedCampana] = useState('TODAS');
  const [selectedGrupo, setSelectedGrupo] = useState('TODAS');
  const [selectedPeriodo, setSelectedPeriodo] = useState('TODAS');
  const [selectedSemana, setSelectedSemana] = useState('TODAS');

  const loadData = useCallback(async (force = false) => {
    if (force) {
      invalidateCache('all_motivos_bajas');
      invalidateCache('all_consolidado');
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetchMotivosBajasData();
      setData({
        consolidado: res?.consolidado || [],
        capacidades: res?.capacidades || [],
        nominas: res?.nominas || []
      });
    } catch (err) {
      console.error('Error cargando motivos de bajas:', err);
      setError(err?.message || 'Error al cargar los datos de motivos de bajas.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Index de capacidades y nóminas
  const { capacidadByKeyMap, capacidadByCodigoMap } = useMemo(() => {
    const byKey = new Map();
    const byCode = new Map();

    (data.capacidades || []).forEach((item) => {
      const campana = normalizeCampana(item.campana);
      const gpe = normalizeGpe(item.codigo || item.grupo_codigo);
      const semanaStr = normalizeSemana(item.semana_label, item.semana_trabajo);

      const capInfo = {
        codigo: gpe,
        campana: campana,
        meta_dia_1: Number(item.meta_dia_1) || 0,
        rq_solicitado: Number(item.rq_solicitado) || 0,
        fecha_inicio_ojt: normalizeText(item.fecha_inicio_ojt),
        periodo: normalizeText(item.periodo),
        semana: semanaStr,
        segmento: normalizeSegmento(item.segmento),
        formador_documento: item.formador_documento || null
      };

      if (campana && gpe) byKey.set(`${campana}|${gpe}`, capInfo);
      if (gpe) byCode.set(gpe, capInfo);
    });

    return { capacidadByKeyMap: byKey, capacidadByCodigoMap: byCode };
  }, [data.capacidades]);

  const nominasMap = useMemo(() => {
    const map = new Map();
    (data.nominas || []).forEach(n => {
      if (n.documento) {
        map.set(normalizeText(n.documento), n);
      }
    });
    return map;
  }, [data.nominas]);

  const getCapInfo = useCallback((campana, gpe) => {
    const normCampana = normalizeCampana(campana);
    const normGpe = normalizeGpe(gpe);
    return capacidadByKeyMap.get(`${normCampana}|${normGpe}`) || capacidadByCodigoMap.get(normGpe) || null;
  }, [capacidadByKeyMap, capacidadByCodigoMap]);

  // Enriquecer registros
  const enrichedConsolidado = useMemo(() => {
    const list = data.consolidado || [];
    const result = new Array(list.length);

    for (let i = 0; i < list.length; i++) {
      const row = list[i];
      const doc = normalizeText(row.documento || row.postulante_documento);
      const campana = normalizeCampana(row.campana);
      const gpe = normalizeGpe(row.grupo || row.codigo_grupo);
      const cap = getCapInfo(campana, gpe);
      const nomina = nominasMap.get(doc);

      const rowPeriodo = cap?.periodo || normalizeText(row.periodo);
      const rowSemana = cap?.semana || normalizeSemana(row.semana_label, row.semana_trabajo || row.semana, row.archivo_origen);
      const rowSegmento = cap?.segmento || normalizeSegmento(row.segmento);
      const rowFechaInicioOjt = cap?.fecha_inicio_ojt ? parseFechaAsistencia(cap.fecha_inicio_ojt) : '';

      const sigla = normalizeText(row.sigla).toUpperCase();
      const txtMotivo = normalizeText(row.motivo_baja || row.motivo);
      const isDia1 = isBajaDia1(txtMotivo, sigla, row);
      const isBaja = !isDia1 && (sigla === 'B' || sigla === 'BAJA' || (txtMotivo !== '' && txtMotivo.toUpperCase() !== 'NULL')) && sigla !== 'ASISTIO' && sigla !== 'A';
      const motivoClean = isBaja ? normalizarMotivo(txtMotivo) : '';

      const formadorName = normalizeText(row.nombre_formador || row.formador || row.formador_nombre || cap?.formador_documento, 'SIN FORMADOR').toUpperCase();

      result[i] = {
        ...row,
        _doc: doc,
        _campana: campana,
        _gpe: gpe,
        _periodo: rowPeriodo,
        _semana: rowSemana,
        _segmento: rowSegmento,
        _formador: formadorName,
        _sigla: sigla,
        _isBaja: isBaja,
        _isDia1: isDia1,
        _motivo: motivoClean,
        _fecha: row.fecha_registro_asistencia ? parseFechaAsistencia(row.fecha_registro_asistencia) : null,
        _fecha_inicio_ojt: rowFechaInicioOjt
      };
    }
    return result;
  }, [data.consolidado, getCapInfo, nominasMap]);

  // Filtros en cascada
  const filterOptions = useMemo(() => {
    const matchSegmento = (seg) => selectedSegmento === 'TODAS' || String(seg || '').toUpperCase() === selectedSegmento;
    const matchCampana = (c) => selectedCampana === 'TODAS' || String(c || '').toUpperCase() === selectedCampana;
    const matchGrupo = (g) => selectedGrupo === 'TODAS' || String(g || '').toUpperCase() === selectedGrupo;
    const matchPeriodo = (p) => selectedPeriodo === 'TODAS' || String(p || '').toUpperCase() === selectedPeriodo;

    const segmentos = new Set();
    const campanas = new Set();
    const grupos = new Set();
    const periodos = new Set();
    const semanas = new Set();

    for (let i = 0; i < enrichedConsolidado.length; i++) {
      const r = enrichedConsolidado[i];
      if (r._segmento && r._segmento !== 'SIN SEGMENTO') segmentos.add(r._segmento);
      
      if (matchSegmento(r._segmento)) {
        if (r._campana && r._campana !== 'SIN CAMPAÑA') campanas.add(r._campana);
        
        if (matchCampana(r._campana)) {
          if (r._gpe && r._gpe !== 'SIN GPE') grupos.add(r._gpe);
          
          if (matchGrupo(r._gpe)) {
            if (r._periodo && r._periodo !== 'SIN PERIODO' && r._periodo !== '') periodos.add(r._periodo);
            
            if (matchPeriodo(r._periodo)) {
              if (r._semana && r._semana !== 'SIN SEMANA' && r._semana !== '') semanas.add(r._semana);
            }
          }
        }
      }
    }

    const sortAlpha = (set) => ['TODAS', ...Array.from(set).sort((a, b) => String(a).localeCompare(String(b), 'es'))];
    const sortedSemanas = Array.from(semanas).sort((a, b) => {
      const numA = parseInt(String(a).replace(/\D/g, '')) || 0;
      const numB = parseInt(String(b).replace(/\D/g, '')) || 0;
      return numA - numB;
    });

    return {
      segmentos: sortAlpha(segmentos),
      campanas: sortAlpha(campanas),
      grupos: sortAlpha(grupos),
      periodos: ['TODAS', ...Array.from(periodos).sort().reverse()],
      semanas: ['TODAS', ...sortedSemanas],
    };
  }, [enrichedConsolidado, selectedSegmento, selectedCampana, selectedGrupo, selectedPeriodo]);

  // Dataset filtrado
  const filteredData = useMemo(() => {
    return enrichedConsolidado.filter((row) => {
      if (selectedSegmento !== 'TODAS' && row._segmento !== selectedSegmento) return false;
      if (selectedCampana !== 'TODAS' && row._campana !== selectedCampana) return false;
      if (selectedGrupo !== 'TODAS' && row._gpe !== selectedGrupo) return false;
      if (selectedPeriodo !== 'TODAS' && row._periodo !== selectedPeriodo) return false;
      if (selectedSemana !== 'TODAS' && row._semana !== selectedSemana) return false;
      return true;
    });
  }, [enrichedConsolidado, selectedSegmento, selectedCampana, selectedGrupo, selectedPeriodo, selectedSemana]);

  // Bajas únicas deduplicadas (excluyendo Bajas Día 1)
  const { uniqueBajas, totalBajasCount, totalPostulantesCount } = useMemo(() => {
    const docBajaMap = new Map();
    const allDocs = new Set();

    filteredData.forEach((row) => {
      if (row._doc) {
        if (!row._isDia1) {
          allDocs.add(row._doc);
          if (row._isBaja) {
            if (!docBajaMap.has(row._doc)) {
              docBajaMap.set(row._doc, row);
            }
          }
        }
      }
    });

    const bajasList = Array.from(docBajaMap.values());
    return {
      uniqueBajas: bajasList,
      totalBajasCount: bajasList.length,
      totalPostulantesCount: Math.max(allDocs.size, bajasList.length)
    };
  }, [filteredData]);

  // 1. DESERCIÓN EN CAPACITACIÓN: (Total bajas capacitación / Total participantes iniciales) * 100
  // 2. DESERCIÓN EN OJT / NESTING: (Bajas durante OJT / Participantes que iniciaron Nesting) * 100
  // Recordando que BAJA DÍA 1 NO CUENTA.
  const metricasCapacitacionYOjt = useMemo(() => {
    const allCapaDocs = new Set();
    const bajasCapaMap = new Map();
    
    const ojtDocs = new Set();
    const bajasOjtMap = new Map();

    filteredData.forEach((row) => {
      const doc = row._doc;
      if (!doc || row._isDia1) return; // Bajas Día 1 excluidas

      // Participante que ingresó a la ola de capacitación
      allCapaDocs.add(doc);

      if (row._isBaja) {
        if (!bajasCapaMap.has(doc)) {
          bajasCapaMap.set(doc, row);
        }
      }

      // Verificación real de OJT / Nesting:
      // Asistencia confirmada (SIGLA = 'A' o 'ASISTIO' o 'I-OP') en fecha >= fecha_inicio_ojt
      const fRecord = row._fecha || '';
      const fOjt = row._fecha_inicio_ojt || '';
      const isOjtDate = Boolean(fRecord && fOjt && fRecord >= fOjt && (row._sigla === 'A' || row._sigla === 'ASISTIO' || row._sigla === 'I-OP'));

      if (isOjtDate) {
        ojtDocs.add(doc);
      }
    });

    // Bajas en etapa OJT: de los participantes que llegaron a OJT, bajas ocurridas durante o después de fecha_inicio_ojt
    filteredData.forEach((row) => {
      const doc = row._doc;
      if (!doc || row._isDia1 || !ojtDocs.has(doc)) return;

      if (row._isBaja) {
        const fRecord = row._fecha || '';
        const fOjt = row._fecha_inicio_ojt || '';
        const isBajaInOjt = Boolean(fRecord && fOjt && fRecord >= fOjt);
        if (isBajaInOjt && !bajasOjtMap.has(doc)) {
          bajasOjtMap.set(doc, row);
        }
      }
    });

    const totalIniciales = allCapaDocs.size || 1;
    const totalBajasCapa = bajasCapaMap.size;
    const tasaDesercionCapa = ((totalBajasCapa / totalIniciales) * 100).toFixed(1);

    const totalIniciaronOjt = ojtDocs.size;
    const totalBajasOjt = bajasOjtMap.size;
    const hasOjtData = totalIniciaronOjt > 0;
    const tasaDesercionOjt = hasOjtData ? ((totalBajasOjt / totalIniciaronOjt) * 100).toFixed(1) : null;

    return {
      totalIniciales,
      totalBajasCapa,
      tasaDesercionCapa,
      totalIniciaronOjt,
      totalBajasOjt,
      tasaDesercionOjt,
      hasOjtData
    };
  }, [filteredData]);

  // Tasa de deserción global
  const tasaDesercionGlobal = metricasCapacitacionYOjt.tasaDesercionCapa;

  // Retención cumplida (Grupos que cumplen la meta de deserción ≤ META_DESERCION %)
  const retencionMeses = useMemo(() => {
    const gMap = new Map();
    filteredData.forEach(d => {
      const g = d._gpe;
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
      if (val.total.size >= 2) {
        total++;
        const pct = (val.bajas.size / val.total.size) * 100;
        if (pct <= META_DESERCION) cumplidos++;
      }
    });

    return {
      cumplidos,
      total,
      hasData: total > 0
    };
  }, [filteredData]);

  // Deserción por Día de Capacitación (Evolutivo Diario No Acumulado, Día 1 sin bajas)
  const desercionPorDiaData = useMemo(() => {
    const parseFechaIso = (f) => {
      if (!f) return null;
      const s = String(f).trim();
      if (s.includes('/')) {
        const parts = s.split('/');
        if (parts.length === 3) {
          const d = parts[0].padStart(2, '0');
          const m = parts[1].padStart(2, '0');
          const y = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
          return `${y}-${m}-${d}`;
        }
      }
      return s.substring(0, 10);
    };

    const groupDatesMap = new Map();
    filteredData.forEach((row) => {
      const gKey = `${row._campana}|${row._gpe}`;
      const fIso = parseFechaIso(row._fecha);
      if (fIso) {
        if (!groupDatesMap.has(gKey)) groupDatesMap.set(gKey, new Set());
        groupDatesMap.get(gKey).add(fIso);
      }
    });

    const sessionNumMap = new Map();
    groupDatesMap.forEach((dateSet, gKey) => {
      const sorted = Array.from(dateSet).sort();
      sorted.forEach((dStr, idx) => {
        sessionNumMap.set(`${gKey}|${dStr}`, idx + 1);
      });
    });

    // Primer día de baja de cada persona (excluyendo bajas Día 1)
    const personFirstBajaDay = new Map();
    filteredData.forEach((row) => {
      if (row._doc && row._isBaja && !row._isDia1) {
        const fIso = parseFechaIso(row._fecha);
        const sNum = fIso ? sessionNumMap.get(`${row._campana}|${row._gpe}|${fIso}`) : null;
        if (sNum) {
          if (!personFirstBajaDay.has(row._doc) || sNum < personFirstBajaDay.get(row._doc)) {
            personFirstBajaDay.set(row._doc, sNum);
          }
        }
      }
    });

    // Conteo por día (no acumulado)
    const dailyCounts = {};
    const maxDayObserved = Math.max(12, ...Array.from(personFirstBajaDay.values()));
    const limitDays = Math.min(Math.max(maxDayObserved, 12), 20);

    for (let i = 1; i <= limitDays; i++) {
      dailyCounts[i] = 0;
    }

    personFirstBajaDay.forEach((dayNum) => {
      if (dayNum > 1 && dayNum <= limitDays) {
        dailyCounts[dayNum] = (dailyCounts[dayNum] || 0) + 1;
      }
    });

    // Día 1 no considera baja día 1 (0 bajas de capacitación)
    dailyCounts[1] = 0;

    const totalIniciales = metricasCapacitacionYOjt.totalIniciales || 1;

    return Object.keys(dailyCounts)
      .map(Number)
      .sort((a, b) => a - b)
      .map((d) => {
        const bajas = dailyCounts[d] || 0;
        const pct = parseFloat(((bajas / totalIniciales) * 100).toFixed(1));
        return {
          dia: `Día ${d}`,
          diaNum: d,
          bajas: bajas,
          pct: pct
        };
      });
  }, [filteredData, metricasCapacitacionYOjt.totalIniciales]);

  // Ranking de Motivos con Top 3 Red Flags
  const { top3Motivos, otherMotivos, allRankingMotivos } = useMemo(() => {
    const counts = {};
    uniqueBajas.forEach((b) => {
      const m = b._motivo || 'SIN ESPECIFICAR';
      counts[m] = (counts[m] || 0) + 1;
    });

    const total = uniqueBajas.length || 1;
    const sorted = Object.entries(counts)
      .map(([motivo, value]) => ({
        motivo,
        value,
        pct: parseFloat(((value / total) * 100).toFixed(1))
      }))
      .sort((a, b) => b.value - a.value);

    return {
      top3Motivos: sorted.slice(0, 3),
      otherMotivos: sorted.slice(3, 9),
      allRankingMotivos: sorted.slice(0, 9)
    };
  }, [uniqueBajas]);

  // Helper para nombre legible y único de formador
  const formatFormadorName = (fullName) => {
    if (!fullName) return 'SIN FORMADOR';
    const parts = fullName.trim().split(/\s+/);
    if (parts.length === 1) return parts[0];
    if (parts.length === 2) return `${parts[0]} ${parts[1]}`;
    if (parts.length === 3) return `${parts[0]} ${parts[1][0]}. ${parts[2]}`;
    return `${parts[0]} ${parts[1][0]}. ${parts[2]}`;
  };

  // Deserción por Formador (Liderazgo) - AUDITADO CON DATOS REALES Y SIN DÍA 1
  const formadoresLiderazgo = useMemo(() => {
    const formMap = new Map();

    filteredData.forEach((row) => {
      const fName = row._formador;
      if (!fName || fName === 'SIN FORMADOR') return;

      if (!formMap.has(fName)) {
        formMap.set(fName, { formador: fName, docs: new Set(), bajas: new Set() });
      }
      const entry = formMap.get(fName);
      if (row._doc && !row._isDia1) {
        entry.docs.add(row._doc);
        if (row._isBaja) {
          entry.bajas.add(row._doc);
        }
      }
    });

    const list = [];
    for (const [formador, entry] of formMap.entries()) {
      const totalAsignados = entry.docs.size;
      const totalBajas = entry.bajas.size;
      if (totalAsignados >= 3) {
        const pctDesercion = totalAsignados > 0 ? Math.round((totalBajas / totalAsignados) * 100) : 0;
        const isLowSample = totalAsignados < 8;
        list.push({
          formador,
          shortName: formatFormadorName(formador) + (isLowSample ? ' *' : ''),
          totalAsignados,
          totalBajas,
          pctDesercion,
          isLowSample,
          isCritical: pctDesercion > 25,
          isMedium: pctDesercion >= 18 && pctDesercion <= 25,
          isGood: pctDesercion < 18
        });
      }
    }

    // Ordenar de mayor a menor deserción, y por total de bajas como desempate
    return list.sort((a, b) => b.pctDesercion - a.pctDesercion || b.totalBajas - a.totalBajas).slice(0, 12);
  }, [filteredData]);

  // Heatmap: Campaña vs Motivo
  const heatmapCampanaData = useMemo(() => {
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

    const topMotivos = allRankingMotivos.slice(0, 5).map(m => m.motivo);
    const sorted = Object.values(rowCounts).sort((a, b) => b.total - a.total);

    const displayRows = sorted.slice(0, 6);
    const rest = sorted.slice(6);
    let othersRow = null;
    if (rest.length > 0) {
      othersRow = {
        campana: `Otros (${rest.length} campañas)`,
        total: rest.reduce((acc, r) => acc + r.total, 0),
        motivos: {},
        isOthers: true
      };
      topMotivos.forEach(m => {
        othersRow.motivos[m] = rest.reduce((acc, r) => acc + (r.motivos[m] || 0), 0);
      });
    }

    return {
      rows: othersRow ? [...displayRows, othersRow] : displayRows,
      topMotivos,
      maxVal
    };
  }, [uniqueBajas, allRankingMotivos]);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-[#060919]">
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
      <div className="h-full flex items-center justify-center p-6 bg-[#060919]">
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
    <div className="h-full flex flex-col overflow-hidden bg-[#060919] text-slate-200 p-3 gap-2 select-none font-sans">
      
      {/* ── HEADER PRINCIPAL CON FILTROS EN LÍNEA AMPLIADOS ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 shrink-0 bg-[#0a0f24]/95 border border-[#00f0ff]/25 rounded-xl px-4 py-2 backdrop-blur-md shadow-[0_4px_25px_rgba(0,0,0,0.5)]">
        <div className="flex items-center gap-2.5">
          <div className="w-3 h-3 rounded-full bg-[#00f0ff] shadow-[0_0_12px_#00f0ff] animate-pulse" />
          <h1 className="text-sm font-black tracking-wider text-[#00f0ff] drop-shadow-[0_0_12px_rgba(0,240,255,0.7)] uppercase">
            KPIs CLAVE DE DESERCIÓN
          </h1>
        </div>

        {/* Filtros Visibles y Claros Glass Neon */}
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { label: 'Segmento', val: selectedSegmento, set: (v) => { setSelectedSegmento(v); setSelectedCampana('TODAS'); setSelectedGrupo('TODAS'); }, opts: filterOptions.segmentos, reset: () => setSelectedSegmento('TODAS') },
            { label: 'Campaña', val: selectedCampana, set: (v) => { setSelectedCampana(v); setSelectedGrupo('TODAS'); }, opts: filterOptions.campanas, reset: () => setSelectedCampana('TODAS') },
            { label: 'Grupo', val: selectedGrupo, set: setSelectedGrupo, opts: filterOptions.grupos, reset: () => setSelectedGrupo('TODAS') },
            { label: 'Periodo', val: selectedPeriodo, set: (v) => { setSelectedPeriodo(v); setSelectedSemana('TODAS'); }, opts: filterOptions.periodos, reset: () => setSelectedPeriodo('TODAS') },
            { label: 'Semana', val: selectedSemana, set: setSelectedSemana, opts: filterOptions.semanas, reset: () => setSelectedSemana('TODAS') },
          ].map(({ label, val, set, opts, reset }) => {
            const isActive = val !== 'TODAS';
            return (
              <div 
                key={label} 
                className={`flex items-center gap-1 rounded-lg px-2 py-0.5 transition-all duration-200 shadow-inner ${
                  isActive 
                    ? 'bg-[#00f0ff]/15 border border-[#00f0ff] shadow-[0_0_8px_rgba(0,240,255,0.35)]' 
                    : 'bg-[#0e1635] border border-[#00f0ff]/30 hover:border-[#00f0ff]/60'
                }`}
              >
                <span className={`text-[8.5px] font-black uppercase tracking-wider ${isActive ? 'text-[#00f0ff] drop-shadow-[0_0_4px_#00f0ff]' : 'text-[#00f0ff]/80'}`}>
                  {label}:
                </span>
                <select
                  value={val}
                  onChange={(e) => set(e.target.value)}
                  className={`bg-transparent text-[11px] font-bold outline-none cursor-pointer min-w-[70px] max-w-[125px] truncate ${
                    isActive ? 'text-white font-black' : 'text-slate-200'
                  }`}
                >
                  {opts.map((opt) => (
                    <option key={opt} value={opt} className="bg-[#0a0f24] text-slate-100 font-bold">
                      {opt}
                    </option>
                  ))}
                </select>
                {isActive && (
                  <button 
                    onClick={reset}
                    className="w-3.5 h-3.5 rounded-full bg-[#ff2a6d]/20 text-[#ff2a6d] hover:bg-[#ff2a6d] hover:text-white flex items-center justify-center text-[9px] font-bold transition-all cursor-pointer"
                    title={`Restablecer ${label}`}
                  >
                    ×
                  </button>
                )}
              </div>
            );
          })}

          {(selectedSegmento !== 'TODAS' || selectedCampana !== 'TODAS' || selectedGrupo !== 'TODAS' || selectedPeriodo !== 'TODAS' || selectedSemana !== 'TODAS') && (
            <button
              onClick={() => {
                setSelectedSegmento('TODAS');
                setSelectedCampana('TODAS');
                setSelectedGrupo('TODAS');
                setSelectedPeriodo('TODAS');
                setSelectedSemana('TODAS');
              }}
              className="px-2.5 py-1 rounded-lg bg-[#ff2a6d]/20 border border-[#ff2a6d]/50 text-[#ff2a6d] hover:bg-[#ff2a6d] hover:text-white text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer shadow-[0_0_10px_rgba(255,42,109,0.3)]"
              title="Limpiar todos los filtros"
            >
              Limpiar
            </button>
          )}

          <button
            onClick={() => loadData(true)}
            className="h-7 w-7 rounded-lg bg-[#0e1635] border border-[#00f0ff]/40 hover:border-[#00f0ff] text-[#00f0ff] hover:shadow-[0_0_12px_#00f0ff] flex items-center justify-center transition-all cursor-pointer shrink-0"
            title="Refrescar datos"
          >
            <RefreshCw size={13} />
          </button>
        </div>
      </div>

      {/* ── CUADRÍCULA PRINCIPAL EN 2 COLUMNAS INDEPENDIENTES ── */}
      <div className="flex-1 min-h-0 grid grid-cols-1 xl:grid-cols-12 gap-2.5 overflow-hidden">
        
        {/* ════════════════════ COLUMNA IZQUIERDA (4 cols): KPIS + MOTIVOS CRÍTICOS ════════════════════ */}
        <div className="xl:col-span-4 flex flex-col gap-2.5 h-full overflow-hidden">
          
          {/* 1. 4 KPI CARDS (Compactas con sparklines neón) */}
          <div className="grid grid-cols-2 gap-2 shrink-0">
            
            {/* KPI 1: BAJAS EN CAPACITACIÓN */}
            <div className="bg-[#0a0f24]/95 border border-[#ff2a6d]/40 rounded-xl p-2 flex flex-col justify-between shadow-[0_0_15px_rgba(255,42,109,0.2)] hover:border-[#ff2a6d] transition-all">
              <div className="flex items-center justify-between">
                <span className="text-[8.5px] font-black tracking-wider text-[#ff2a6d] uppercase">
                  BAJAS EN CAPACITACIÓN
                </span>
                <UserX size={12} className="text-[#ff2a6d] drop-shadow-[0_0_6px_#ff2a6d]" />
              </div>

              <div className="my-0">
                <span className="font-mono text-xl sm:text-2xl font-black text-[#ff2a6d] drop-shadow-[0_0_14px_rgba(255,42,109,0.85)]">
                  {metricasCapacitacionYOjt.totalBajasCapa.toLocaleString()}
                </span>
              </div>

              {/* Glowing Area Sparkline */}
              <div className="w-full h-4 my-0">
                <svg className="w-full h-4 overflow-visible" viewBox="0 0 100 24" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="pinkGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#ff2a6d" stopOpacity="0.45" />
                      <stop offset="100%" stopColor="#ff2a6d" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path d="M0,18 Q20,16 35,12 T70,8 T95,3 L95,24 L0,24 Z" fill="url(#pinkGrad)" />
                  <path d="M0,18 Q20,16 35,12 T70,8 T95,3" fill="none" stroke="#ff2a6d" strokeWidth="2.2" strokeLinecap="round" />
                  <circle cx="95" cy="3" r="2.5" fill="#ffffff" stroke="#ff2a6d" strokeWidth="2" className="drop-shadow-[0_0_6px_#ff2a6d]" />
                </svg>
              </div>

              <div className="flex items-center justify-between text-[7px] font-bold text-slate-400">
                <span>de {metricasCapacitacionYOjt.totalIniciales} iniciales</span>
                <span className="text-[#00f0ff] font-mono font-bold">Sin Día 1</span>
              </div>
            </div>

            {/* KPI 2: DESERCIÓN EN CAPACITACIÓN % */}
            {(() => {
              const val = metricasCapacitacionYOjt.tasaDesercionCapa;
              const isCrit = val > 25;
              const isMed = val >= 18 && val <= 25;
              const kpiColor = isCrit ? '#ff2a6d' : isMed ? '#fbbf24' : '#00ff9d';
              const kpiBorder = isCrit ? 'border-[#ff2a6d]/40 hover:border-[#ff2a6d]' : isMed ? 'border-[#fbbf24]/40 hover:border-[#fbbf24]' : 'border-[#00ff9d]/40 hover:border-[#00ff9d]';
              const kpiShadow = isCrit ? 'shadow-[0_0_15px_rgba(255,42,109,0.2)]' : isMed ? 'shadow-[0_0_15px_rgba(251,191,36,0.2)]' : 'shadow-[0_0_15px_rgba(0,255,157,0.2)]';
              return (
                <div className={`bg-[#0a0f24]/95 border rounded-xl p-2 flex flex-col justify-between transition-all ${kpiBorder} ${kpiShadow}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-[8.5px] font-black tracking-wider uppercase" style={{ color: kpiColor }} title="(Total bajas en capacitación / Total participantes iniciales) * 100">
                      DESERCIÓN CAPACITACIÓN
                    </span>
                    <TrendingDown size={12} style={{ color: kpiColor }} />
                  </div>

                  <div className="my-0 flex items-center justify-between">
                    <span className="font-mono text-xl sm:text-2xl font-black" style={{ color: kpiColor, filter: `drop-shadow(0 0 10px ${kpiColor}80)` }}>
                      {val}%
                    </span>
                    {isCrit ? (
                      <AlertTriangle size={15} className="text-[#ff2a6d] animate-pulse" />
                    ) : isMed ? (
                      <AlertTriangle size={15} className="text-[#fbbf24]" />
                    ) : (
                      <CheckCircle2 size={15} className="text-[#00ff9d]" />
                    )}
                  </div>

                  <div className="flex items-center justify-between text-[7px] font-bold text-slate-400 mt-0.5">
                    <span>{isCrit ? 'Crítico (>25%)' : isMed ? 'Alerta (18-25%)' : 'Óptimo (<18%)'}</span>
                    <span className="px-1.5 py-0.2 rounded-full font-black text-[7.5px]" style={{ color: kpiColor, background: `${kpiColor}20`, border: `1px solid ${kpiColor}50` }}>
                      Meta: &le;{META_DESERCION}%
                    </span>
                  </div>
                </div>
              );
            })()}

            {/* KPI 3: DESERCIÓN EN OJT / NESTING % */}
            <div className="bg-[#0a0f24]/95 border border-[#00f0ff]/40 rounded-xl p-2 flex flex-col justify-between shadow-[0_0_15px_rgba(0,240,255,0.2)] hover:border-[#00f0ff] transition-all">
              <div className="flex items-center justify-between">
                <span className="text-[8.5px] font-black tracking-wider text-[#00f0ff] uppercase" title="(Bajas durante OJT / Participantes que iniciaron Nesting) * 100">
                  DESERCIÓN OJT / NESTING
                </span>
                <Activity size={12} className="text-[#00f0ff] drop-shadow-[0_0_6px_#00f0ff]" />
              </div>

              <div className="my-0 flex items-center justify-between">
                <span className="font-mono text-xl sm:text-2xl font-black text-[#00f0ff] drop-shadow-[0_0_14px_rgba(0,240,255,0.85)]">
                  {metricasCapacitacionYOjt.hasOjtData ? `${metricasCapacitacionYOjt.tasaDesercionOjt}%` : 'Sin datos'}
                </span>
                <span className="text-[7.5px] font-mono text-slate-300 font-black px-1 py-0.2 rounded bg-[#00f0ff]/10 border border-[#00f0ff]/30">
                  {metricasCapacitacionYOjt.hasOjtData ? `${metricasCapacitacionYOjt.totalBajasOjt}/${metricasCapacitacionYOjt.totalIniciaronOjt}` : '0/0'}
                </span>
              </div>

              {/* Glowing Area Sparkline Cyan */}
              <div className="w-full h-4 my-0">
                <svg className="w-full h-4 overflow-visible" viewBox="0 0 100 24" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="cyanGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#00f0ff" stopOpacity="0.45" />
                      <stop offset="100%" stopColor="#00f0ff" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path d="M0,16 Q25,20 45,10 T80,14 T95,4 L95,24 L0,24 Z" fill="url(#cyanGrad)" />
                  <path d="M0,16 Q25,20 45,10 T80,14 T95,4" fill="none" stroke="#00f0ff" strokeWidth="2.2" strokeLinecap="round" />
                  <circle cx="95" cy="4" r="2.5" fill="#ffffff" stroke="#00f0ff" strokeWidth="2" className="drop-shadow-[0_0_6px_#00f0ff]" />
                </svg>
              </div>

              <div className="flex items-center justify-between text-[7px] font-bold text-slate-400">
                <span>Llamadas reales</span>
                <span className="text-[#00f0ff] font-bold">Incubación</span>
              </div>
            </div>

            {/* KPI 4: OBJETIVO DE RETENCIÓN CUMPLIDO */}
            <div className="bg-[#0a0f24]/95 border border-[#00ff9d]/40 rounded-xl p-2 flex flex-col justify-between shadow-[0_0_15px_rgba(0,255,157,0.2)] hover:border-[#00ff9d] transition-all">
              <div className="flex items-center justify-between">
                <span className="text-[8.5px] font-black tracking-wider text-[#00ff9d] uppercase">
                  RETENCIÓN CUMPLIDA
                </span>
                <Award size={12} className="text-[#00ff9d] drop-shadow-[0_0_6px_#00ff9d]" />
              </div>

              <div className="my-0">
                <span className="font-mono text-lg sm:text-xl font-black text-[#00ff9d] drop-shadow-[0_0_14px_rgba(0,255,157,0.85)]">
                  {retencionMeses.hasData ? `${retencionMeses.cumplidos}/${retencionMeses.total} GRUPOS` : 'Sin datos suficientes'}
                </span>
              </div>

              {/* Glowing Zig-Zag Mountain Sparkline Green */}
              <div className="w-full h-4 my-0">
                <svg className="w-full h-4 overflow-visible" viewBox="0 0 100 24" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="greenGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#00ff9d" stopOpacity="0.45" />
                      <stop offset="100%" stopColor="#00ff9d" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path d="M0,20 L12,14 L24,18 L36,8 L48,16 L60,6 L72,14 L84,4 L95,10 L95,24 L0,24 Z" fill="url(#greenGrad)" />
                  <path d="M0,20 L12,14 L24,18 L36,8 L48,16 L60,6 L72,14 L84,4 L95,10" fill="none" stroke="#00ff9d" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  <circle cx="84" cy="4" r="2.5" fill="#ffffff" stroke="#00ff9d" strokeWidth="2" className="drop-shadow-[0_0_6px_#00ff9d]" />
                </svg>
              </div>

              <div className="flex items-center justify-between text-[7px] font-bold text-slate-400">
                <span>Meta mensual</span>
                <span className="text-[#00ff9d] font-bold">≤{META_DESERCION}% deserción</span>
              </div>
            </div>

          </div>

          {/* 2. MOTIVOS CRÍTICOS DE DESERCIÓN (flex-1: Toma todo el alto disponible sin compresión) */}
          <div className="flex-1 min-h-0 bg-[#0a0f24]/90 border border-[#00f0ff]/20 rounded-xl p-2.5 flex flex-col justify-between shadow-[0_4px_20px_rgba(0,0,0,0.35)] overflow-hidden">
            <div className="flex items-center justify-between pb-1 border-b border-[#00f0ff]/15 shrink-0">
              <span className="text-xs font-black uppercase tracking-wider text-[#ff2a6d] drop-shadow-[0_0_8px_rgba(255,42,109,0.5)]">
                MOTIVOS CRÍTICOS DE DESERCIÓN
              </span>
              <span className="text-[9.5px] font-mono text-slate-400">
                {totalBajasCount} bajas
              </span>
            </div>

            <div className="flex-1 min-h-0 pt-1.5 flex flex-col gap-1.5 overflow-y-auto custom-scrollbar">
              
              {/* TOP 3 RED FLAGS HIGHLIGHT BOX */}
              <div className="border border-[#ff2a6d]/60 bg-[#ff2a6d]/5 rounded-xl p-2 relative shadow-[0_0_15px_rgba(255,42,109,0.25)] shrink-0">
                <div className="space-y-1.5">
                  {top3Motivos.map((m, idx) => (
                    <div key={m.motivo} className="flex items-center justify-between gap-2 text-[9.5px]">
                      <div className="w-36 flex items-center gap-1.5 min-w-0">
                        <span className="text-[7.5px] font-black uppercase tracking-wider text-[#ff2a6d] bg-[#ff2a6d]/20 px-1 py-0.2 rounded border border-[#ff2a6d]/50 shrink-0">
                          #{idx + 1}
                        </span>
                        <span className="font-bold text-slate-200 truncate uppercase" title={m.motivo}>
                          {m.motivo}
                        </span>
                      </div>
                      <div className="flex-1 h-3 bg-[#121936] rounded-full overflow-hidden p-0.5 shadow-inner">
                        <div 
                          className="h-full rounded-full bg-gradient-to-r from-[#ff2a6d] to-[#ff5277] shadow-[0_0_10px_#ff2a6d]" 
                          style={{ width: `${m.pct}%` }}
                        />
                      </div>
                      <span className="w-16 text-right font-mono font-black text-[#ff2a6d]">
                        {m.pct}% ({m.value})
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* REST OF MOTIVES */}
              <div className="space-y-1 pt-0.5">
                {otherMotivos.map((m) => (
                  <div key={m.motivo} className="flex items-center justify-between gap-2 text-[8.5px]">
                    <span className="w-36 font-semibold text-slate-400 truncate uppercase" title={m.motivo}>
                      {m.motivo}
                    </span>
                    <div className="flex-1 h-2 bg-[#121936] rounded-full overflow-hidden p-0.5">
                      <div 
                        className="h-full rounded-full bg-[#475569]" 
                        style={{ width: `${m.pct}%` }}
                      />
                    </div>
                    <span className="w-16 text-right font-mono font-bold text-slate-400">
                      {m.pct}% ({m.value})
                    </span>
                  </div>
                ))}
              </div>

            </div>
          </div>

        </div>

        {/* ════════════════════ COLUMNA DERECHA (8 cols): FORMADORES (ALTO) + INFERIORES (COMPACTOS) ════════════════════ */}
        <div className="xl:col-span-8 flex flex-col gap-2.5 h-full overflow-hidden">
          
          {/* 3. DESERCIÓN POR FORMADOR (LIDERAZGO) - ALARGADO HACIA ABAJO (flex-[1.35]) */}
          <div className="flex-[1.35] min-h-0 bg-[#0a0f24]/90 border border-[#00f0ff]/20 rounded-xl p-3 flex flex-col justify-between shadow-[0_4px_20px_rgba(0,0,0,0.35)] overflow-hidden">
            <div className="flex items-center justify-between pb-1.5 border-b border-[#00f0ff]/15 shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-xs sm:text-sm font-black uppercase tracking-wider text-[#00f0ff] drop-shadow-[0_0_8px_rgba(0,240,255,0.5)]">
                  DESERCIÓN POR FORMADOR (LIDERAZGO)
                </span>
                <span className="text-[9px] font-bold text-slate-300 bg-[#121936] px-2 py-0.5 rounded border border-slate-700">
                  Meta: &lt;{META_DESERCION}%
                </span>
              </div>
              <span className="text-[10px] font-mono text-slate-400">
                {formadoresLiderazgo.length} formadores evaluados
              </span>
            </div>

            <div className="flex-1 min-h-0 w-full pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={formadoresLiderazgo} margin={{ top: 22, right: 15, left: -25, bottom: 28 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#121936" vertical={false} />
                  <XAxis 
                    dataKey="shortName" 
                    stroke="#cbd5e1" 
                    fontSize={9} 
                    fontWeight="bold"
                    tickLine={false} 
                    interval={0} 
                    angle={-18} 
                    textAnchor="end" 
                    height={32} 
                  />
                  <YAxis stroke="#64748b" fontSize={9} domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickLine={false} />
                  <RechartsTooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const f = payload[0]?.payload;
                        const statusColor = f?.isCritical ? '#ff2a6d' : f?.isMedium ? '#fbbf24' : '#00ff9d';
                        return (
                          <div className="p-2.5 rounded-xl bg-[#0e1635] border border-[#00f0ff]/40 text-xs shadow-2xl space-y-1">
                            <p className="font-black text-[#00f0ff] uppercase">{f?.formador}</p>
                            <p className="font-bold" style={{ color: statusColor }}>Deserción: {f?.pctDesercion}%</p>
                            <p className="text-slate-300 font-medium">Bajas: {f?.totalBajas} de {f?.totalAsignados} alumnos</p>
                            {f?.isLowSample && (
                              <p className="text-amber-400 font-bold text-[9.5px] bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/30">
                                ⚠️ Muestra reducida (N = {f?.totalAsignados} &lt; 8). No estadísticamente representativo.
                              </p>
                            )}
                            <p className="text-slate-400 text-[10px]">Meta corporativa: &le;{META_DESERCION}% (Escala: &lt;18% Óptimo, 18-25% Alerta, &gt;25% Crítico)</p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <ReferenceLine y={META_DESERCION} stroke="#00f0ff" strokeDasharray="3 3" strokeWidth={1.5} label={{ value: `Meta: ${META_DESERCION}%`, fill: '#00f0ff', fontSize: 9, position: 'insideTopLeft' }} />
                  <Bar dataKey="pctDesercion" radius={[4, 4, 0, 0]} maxBarSize={42}>
                    {formadoresLiderazgo.map((f, idx) => (
                      <Cell
                        key={`cell-${idx}`}
                        fill={f.isCritical ? '#ff2a6d' : f.isMedium ? '#fbbf24' : '#00ff9d'}
                      />
                    ))}
                    <LabelList
                      dataKey="pctDesercion"
                      position="top"
                      content={({ x, y, width, index }) => {
                        const f = formadoresLiderazgo[index];
                        if (!f) return null;
                        return (
                          <g>
                            <text
                              x={Number(x) + Number(width) / 2}
                              y={Number(y) - 13}
                              fill={f.isCritical ? '#ff2a6d' : f.isMedium ? '#fbbf24' : '#00ff9d'}
                              fontSize={9.5}
                              fontWeight="900"
                              textAnchor="middle"
                            >
                              {`${f.pctDesercion}%`}
                            </text>
                            <text
                              x={Number(x) + Number(width) / 2}
                              y={Number(y) - 3}
                              fill="#94a3b8"
                              fontSize={8}
                              fontWeight="bold"
                              textAnchor="middle"
                            >
                              {`(${f.totalBajas}/${f.totalAsignados})`}
                            </text>
                          </g>
                        );
                      }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 4 & 5. SUB-CUADRÍCULA INFERIOR: TASA SEMANAL + MAPA CAMPAÑAS (MÁS COMPACTOS, flex-[0.75]) */}
          <div className="flex-[0.75] min-h-[140px] grid grid-cols-1 md:grid-cols-2 gap-2.5 overflow-hidden">
            
            {/* 4. DESERCIÓN POR DÍA DE CAPACITACIÓN (EVOLUTIVO NO ACUMULADO) */}
            <div className="bg-[#0a0f24]/90 border border-[#00f0ff]/20 rounded-xl p-2 flex flex-col justify-between shadow-[0_4px_20px_rgba(0,0,0,0.35)] h-full overflow-hidden">
              <div className="flex items-center justify-between pb-1 border-b border-[#00f0ff]/15 shrink-0">
                <span className="text-[10.5px] font-black uppercase tracking-wider text-[#00f0ff]">
                  DESERCIÓN POR DÍA DE CAPACITACIÓN
                </span>
                <div className="flex items-center gap-2 text-[7.5px]">
                  <span className="text-[#00f0ff] font-bold bg-[#121936] px-1.5 py-0.5 rounded border border-[#00f0ff]/30">
                    Sin Día 1
                  </span>
                  <span className="text-[#ff2a6d] font-black flex items-center gap-1">
                    <span className="w-2 h-0.5 bg-[#ff2a6d] inline-block"></span> Bajas / Día
                  </span>
                </div>
              </div>

              <div className="flex-1 min-h-0 w-full pt-1">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={desercionPorDiaData} margin={{ top: 8, right: 10, left: -25, bottom: 2 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#121936" vertical={false} />
                    <XAxis dataKey="dia" stroke="#94a3b8" fontSize={7.5} tickLine={false} interval={0} />
                    <YAxis stroke="#64748b" fontSize={7.5} tickLine={false} allowDecimals={false} />
                    <RechartsTooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const d = payload[0]?.payload;
                          return (
                            <div className="p-2 rounded-lg bg-[#0e1635] border border-[#00f0ff]/30 text-xs shadow-xl space-y-0.5">
                              <p className="font-bold text-[#00f0ff]">{d?.dia} de Capacitación</p>
                              <p className="text-[#ff2a6d] font-black">
                                Bajas del día: {d?.bajas} {d?.bajas === 1 ? 'persona' : 'personas'}
                              </p>
                              <p className="text-slate-300 text-[10px]">
                                Impacto: {d?.pct}% del grupo inicial
                              </p>
                              {d?.diaNum === 1 && (
                                <p className="text-slate-400 text-[9px] italic">
                                  (Bajas Día 1 no consideradas)
                                </p>
                              )}
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="bajas" 
                      stroke="#ff2a6d" 
                      strokeWidth={2} 
                      dot={{ fill: '#ff2a6d', r: 2.5 }} 
                      activeDot={{ r: 4.5, stroke: '#ffffff', strokeWidth: 1.5 }} 
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* 5. MAPA DE CALOR: CAMPAÑA VS MOTIVO */}
            <div className="bg-[#0a0f24]/90 border border-[#00f0ff]/20 rounded-xl p-2 flex flex-col justify-between shadow-[0_4px_20px_rgba(0,0,0,0.35)] h-full overflow-hidden">
              <div className="flex items-center justify-between pb-1 border-b border-[#00f0ff]/15 shrink-0">
                <span className="text-[10.5px] font-black uppercase tracking-wider text-[#00f0ff]">
                  MAPA DE CALOR: CAMPAÑAS
                </span>
                <span className="text-[8.5px] font-mono text-slate-400">
                  {heatmapCampanaData.rows.length} campañas
                </span>
              </div>

              <div className="flex-1 min-h-0 w-full overflow-x-auto overflow-y-auto custom-scrollbar pt-0.5">
                <table className="w-full text-left text-[7.5px] whitespace-nowrap border-separate border-spacing-0.5">
                  <thead>
                    <tr>
                      <th className="px-1.5 py-0.5 bg-[#121936] text-[#00f0ff] font-bold rounded sticky top-0 z-10">CAMPAÑA</th>
                      {heatmapCampanaData.topMotivos.slice(0, 4).map(m => (
                        <th key={m} className="px-1 py-0.5 bg-[#121936] text-slate-400 text-center rounded truncate max-w-[40px] sticky top-0 z-10" title={m}>
                          {m.substring(0, 5)}..
                        </th>
                      ))}
                      <th className="px-1 py-0.5 bg-[#121936] text-[#ff2a6d] text-center font-bold rounded sticky top-0 z-10">TOT</th>
                    </tr>
                  </thead>
                  <tbody>
                    {heatmapCampanaData.rows.map(row => (
                      <tr key={row.campana}>
                        <td className={`px-1.5 py-0.5 rounded font-bold truncate max-w-[85px] ${row.isOthers ? 'text-[#fbbf24] bg-[#fbbf24]/10' : 'text-slate-200 bg-[#0e1635]'}`} title={row.campana}>
                          {row.campana}
                        </td>
                        {heatmapCampanaData.topMotivos.slice(0, 4).map(m => {
                          const count = row.motivos[m] || 0;
                          const pctRelativo = row.total > 0 ? (count / row.total) * 100 : 0;
                          let cellColor = 'bg-[#121936]/40 text-slate-600';
                          if (count > 0) {
                            if (pctRelativo >= 35) {
                              cellColor = 'bg-[#ff2a6d] text-white shadow-[0_0_6px_#ff2a6d]';
                            } else if (pctRelativo >= 20) {
                              cellColor = 'bg-[#ff2a6d]/60 text-white';
                            } else if (pctRelativo >= 10) {
                              cellColor = 'bg-[#fbbf24]/30 text-[#fbbf24]';
                            } else {
                              cellColor = 'bg-[#00f0ff]/15 text-[#00f0ff]';
                            }
                          }
                          return (
                            <td key={m} className="p-0 text-center">
                              <div 
                                className={`h-3 min-w-[20px] flex items-center justify-center rounded font-mono font-bold text-[7.5px] ${cellColor}`}
                                title={`${count} bajas (${pctRelativo.toFixed(1)}% de las bajas de la campaña)`}
                              >
                                {count > 0 ? count : '·'}
                              </div>
                            </td>
                          );
                        })}
                        <td className="px-1.5 py-0.5 text-center font-mono font-bold text-[#ff2a6d] bg-[#121936] rounded">
                          {row.total}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

          </div>

        </div>

      </div>

    </div>
  );
}
