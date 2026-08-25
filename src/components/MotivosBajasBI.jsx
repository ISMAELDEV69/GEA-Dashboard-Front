import { useMemo, useState, useEffect, useCallback } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, Cell, LabelList, Legend
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
  BarChart3, 
  Grid, 
  Filter, 
  RefreshCw, 
  Flame, 
  CalendarDays,
  CheckCircle2
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

/* ── Mini Sparkline for Trend in Header ── */
function SparklineTrend({ data = [], color = '#F43F5E' }) {
  if (!data || data.length === 0) return null;
  const max = Math.max(...data.map(d => d.value), 1);
  const min = Math.min(...data.map(d => d.value), 0);
  const range = max - min || 1;
  const width = 120;
  const height = 24;
  const padding = 3;

  const points = data.map((d, i) => {
    const x = padding + (i / Math.max(data.length - 1, 1)) * (width - padding * 2);
    const y = height - padding - ((d.value - min) / range) * (height - padding * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  return (
    <div className="flex items-center gap-2 px-2 py-0.5 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
      <div className="flex flex-col">
        <span className="text-[7.5px] font-black uppercase tracking-wider text-[var(--text-muted)] leading-tight">
          Tendencia Periodos
        </span>
        <span className="text-[10px] font-mono font-bold text-rose-500 leading-tight">
          {data[data.length - 1]?.value || 0} en {data[data.length - 1]?.period || '—'}
        </span>
      </div>
      <svg width={width} height={height} className="overflow-visible">
        <polyline
          fill="none"
          stroke={color}
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={points}
        />
        {data.map((d, i) => {
          const x = padding + (i / Math.max(data.length - 1, 1)) * (width - padding * 2);
          const y = height - padding - ((d.value - min) / range) * (height - padding * 2);
          return (
            <circle
              key={d.period || i}
              cx={x}
              cy={y}
              r="2"
              fill={color}
              className="transition-transform hover:scale-150"
            />
          );
        })}
      </svg>
    </div>
  );
}

export default function MotivosBajasBI() {
  const [data, setData] = useState({ consolidado: [], capacidades: [], nominas: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Top Bar Filters
  const [selectedSegmento, setSelectedSegmento] = useState('TODAS');
  const [selectedCampana, setSelectedCampana] = useState('TODAS');
  const [selectedGrupo, setSelectedGrupo] = useState('TODAS');
  const [selectedPeriodo, setSelectedPeriodo] = useState('TODAS');
  const [selectedSemana, setSelectedSemana] = useState('TODAS');

  // Toggle View Controls for High Density Panels
  const [formadorViewAll, setFormadorViewAll] = useState(false);
  const [heatmapViewAll, setHeatmapViewAll] = useState(false);

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

  // Listener para el botón global Refrescar del Header
  useEffect(() => {
    const handleGlobalRefresh = () => {
      loadData(true);
    };
    window.addEventListener('gea-global-refresh', handleGlobalRefresh);
    return () => window.removeEventListener('gea-global-refresh', handleGlobalRefresh);
  }, [loadData]);

  // ── 1. Indexar capacidades y nóminas en O(1) ──
  const { capacidadByKeyMap, capacidadByCodigoMap, allCapacidadItems } = useMemo(() => {
    const byKey = new Map();
    const byCode = new Map();
    const allItems = [];

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
      };

      if (campana && gpe) byKey.set(`${campana}|${gpe}`, capInfo);
      if (gpe) byCode.set(gpe, capInfo);
      allItems.push(capInfo);
    });

    return { capacidadByKeyMap: byKey, capacidadByCodigoMap: byCode, allCapacidadItems: allItems };
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

  // ── 2. Enriquecer datos de asistencia en un solo pase O(N) ──
  const enrichedConsolidado = useMemo(() => {
    const list = data.consolidado || [];
    const result = new Array(list.length);

    for (let i = 0; i < list.length; i++) {
      const row = list[i];
      const doc = normalizeText(row.documento);
      const campana = normalizeCampana(row.campana);
      const gpe = normalizeGpe(row.grupo || row.codigo_grupo);
      const cap = getCapInfo(campana, gpe);
      const nomina = nominasMap.get(doc);

      const rowPeriodo = cap?.periodo || normalizeText(row.periodo);
      const rowSemana = cap?.semana || normalizeSemana(row.semana_label, row.semana_trabajo || row.semana, row.archivo_origen);
      const rowSegmento = cap?.segmento || normalizeSegmento(row.segmento);

      const sigla = normalizeText(row.sigla).toUpperCase();
      const txtMotivo = normalizeText(row.motivo_baja);
      const isBaja = sigla === 'B' || (txtMotivo !== '' && txtMotivo.toUpperCase() !== 'NULL');
      const motivoClean = isBaja ? (txtMotivo || 'BAJA SIN ESPECIFICAR').toUpperCase() : '';

      // Cálculo de día relativo para el embudo (Día 1 -> Día N)
      let diaRelativo = null;
      if (row.fecha_registro_asistencia && nomina?.fecha_inicio_capacitacion) {
        const dAsis = parseLocalDate(row.fecha_registro_asistencia);
        const dIni = parseLocalDate(nomina.fecha_inicio_capacitacion);
        if (dAsis && dIni) {
          const diffDays = Math.round((dAsis.getTime() - dIni.getTime()) / (1000 * 60 * 60 * 24));
          if (diffDays >= 0 && diffDays <= 30) {
            diaRelativo = diffDays + 1;
          }
        }
      }

      result[i] = {
        ...row,
        _doc: doc,
        _campana: campana,
        _gpe: gpe,
        _periodo: rowPeriodo,
        _semana: rowSemana,
        _segmento: rowSegmento,
        _formador: normalizeText(row.nombre_formador || row.formador, 'SIN FORMADOR').toUpperCase(),
        _sigla: sigla,
        _isBaja: isBaja,
        _motivo: motivoClean,
        _diaRelativo: diaRelativo,
      };
    }
    return result;
  }, [data.consolidado, getCapInfo, nominasMap]);

  // ── 3. Listas de Filtros en Cascada O(N) ──
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
            if (r._periodo && r._periodo !== 'SIN PERIODO') periodos.add(r._periodo);
            
            if (matchPeriodo(r._periodo)) {
              if (r._semana && r._semana !== 'SIN SEMANA') semanas.add(r._semana);
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

  // ── 4. Filtrar dataset activo en un solo pase O(N) ──
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

  // Deduplicar bajas únicas por persona para los indicadores y rankings
  const { uniqueBajas, totalBajasCount, byPeriodTrend } = useMemo(() => {
    const docBajaMap = new Map();
    const periodCounts = {};

    filteredData.forEach((row) => {
      if (row._isBaja && row._doc) {
        if (!docBajaMap.has(row._doc)) {
          docBajaMap.set(row._doc, row);
          const p = row._periodo || 'SIN PERIODO';
          periodCounts[p] = (periodCounts[p] || 0) + 1;
        }
      }
    });

    const bajasList = Array.from(docBajaMap.values());
    const trend = Object.entries(periodCounts)
      .map(([period, value]) => ({ period, value }))
      .sort((a, b) => a.period.localeCompare(b.period));

    return {
      uniqueBajas: bajasList,
      totalBajasCount: bajasList.length,
      byPeriodTrend: trend
    };
  }, [filteredData]);

  // ── 5. GRÁFICO 1: Ranking de Motivos de Deserción con Badges Top 3 ──
  const rankingMotivosData = useMemo(() => {
    const counts = {};
    uniqueBajas.forEach((b) => {
      const m = b._motivo || 'SIN MOTIVO ESPECÍFICO';
      counts[m] = (counts[m] || 0) + 1;
    });

    const total = uniqueBajas.length || 1;
    const sorted = Object.entries(counts)
      .map(([motivo, value]) => ({
        motivo,
        value,
        pct: ((value / total) * 100).toFixed(1)
      }))
      .sort((a, b) => b.value - a.value);

    return sorted.slice(0, 10);
  }, [uniqueBajas]);

  const top3Motivos = useMemo(() => {
    return rankingMotivosData.slice(0, 3);
  }, [rankingMotivosData]);

  // ── 6. GRÁFICO 2: Deserción por Formador (% y Conteo + Alerta >30%) ──
  // NOTA: 'BAJA DIA 1' se imputa a Reclutamiento (Periodo de Gracia), por lo que NO se cuenta en el indicador del Formador
  const formadoresData = useMemo(() => {
    const formMap = new Map();

    const isBajaDia1 = (motivoStr, rawRow) => {
      const m = String(motivoStr || '').toUpperCase();
      const rawM = String(rawRow?.motivo_baja || '').toUpperCase();
      const rawE = String(rawRow?.estado || '').toUpperCase();
      const rawO = String(rawRow?.observaciones || rawRow?.observacion || '').toUpperCase();
      return (
        m.includes('BAJA DIA 1') ||
        m.includes('BAJA DÍA 1') ||
        m.includes('PERIODO GRACIA') ||
        m.includes('PERÍODO GRACIA') ||
        rawM.includes('BAJA DIA 1') ||
        rawM.includes('BAJA DÍA 1') ||
        rawM.includes('PERIODO GRACIA') ||
        rawE.includes('BAJA DIA 1') ||
        rawO.includes('BAJA DIA 1')
      );
    };

    filteredData.forEach((row) => {
      const fName = row._formador;
      if (!fName || fName === 'SIN FORMADOR') return;

      if (!formMap.has(fName)) {
        formMap.set(fName, { formador: fName, docs: new Set(), bajas: new Set() });
      }
      const entry = formMap.get(fName);
      if (row._doc) {
        entry.docs.add(row._doc);
        // Solo contar bajas reales de capacitación (excluyendo BAJA DIA 1 / Periodo Gracia de Reclutamiento)
        if (row._isBaja && !isBajaDia1(row._motivo, row)) {
          entry.bajas.add(row._doc);
        }
      }
    });

    const list = [];
    for (const [formador, entry] of formMap.entries()) {
      const totalAsignados = entry.docs.size;
      const totalBajas = entry.bajas.size;

      // EXCLUSIÓN DE FORMA SEGURA:
      // 1. Excluir formadores con 0 personas asignadas (0/0)
      if (totalAsignados === 0) continue;

      // 2. Mínimo 3 postulantes asignados para relevancia estadística (evita 1/1 = 100% de ruido)
      if (totalAsignados < 3) continue;

      const pctDesercion = Math.round((totalBajas / totalAsignados) * 100);

      list.push({
        formador,
        totalAsignados,
        totalBajas,
        pctDesercion,
        isAlert: pctDesercion > 30, // Umbral crítico >30%
      });
    }

    // Ordenar de mayor a menor % de deserción, y por volumen de bajas/asignados como desempate
    list.sort((a, b) => b.pctDesercion - a.pctDesercion || b.totalBajas - a.totalBajas || b.totalAsignados - a.totalAsignados);
    return list;
  }, [filteredData]);

  const displayedFormadores = useMemo(() => {
    if (formadorViewAll) return formadoresData;
    return formadoresData.slice(0, 8);
  }, [formadoresData, formadorViewAll]);

  // ── 7. GRÁFICO 3: Embudo de Capacitación (Día 1 → Día N) en Cohorte Real Exacta a SQL ──
  const embudoData = useMemo(() => {
    // 1. Numerar las sesiones lectivas reales por grupo exacto (campana + COALESCE(codigo_grupo, grupo))
    // Idéntico a SQL: DENSE_RANK() OVER (PARTITION BY campana, COALESCE(codigo_grupo, grupo) ORDER BY fecha_registro_asistencia ASC)
    const groupDatesMap = new Map();

    filteredData.forEach((row) => {
      const camp = String(row.campana || '').trim();
      const gpe = String(row.codigo_grupo || row.grupo || '').trim();
      const fecha = row.fecha_registro_asistencia ? String(row.fecha_registro_asistencia).substring(0, 10).trim() : null;
      if (!fecha) return;

      const gKey = `${camp}|${gpe}`;
      if (!groupDatesMap.has(gKey)) {
        groupDatesMap.set(gKey, new Set());
      }
      groupDatesMap.get(gKey).add(fecha);
    });

    const sessionNumMap = new Map();
    groupDatesMap.forEach((dateSet, gKey) => {
      const sortedDates = Array.from(dateSet).sort();
      sortedDates.forEach((dStr, idx) => {
        sessionNumMap.set(`${gKey}|${dStr}`, idx + 1);
      });
    });

    // 2. Resumir por postulante: start_day, first_baja_day y first_iop_day (Ingreso a Operación)
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

    // 3. Población inicial de la cohorte (Día 1 / start_day = 1)
    const allPersons = Array.from(postulanteMap.values());
    const initialPopulation = allPersons.filter(p => p.start_day === 1).length || allPersons.length || 1;

    // 4. Precalcular los días (hasta día 30) con lógica decreciente y exclusión de I-OP
    const rawDays = [];
    for (let day = 1; day <= 30; day++) {
      let activos = 0;
      let bajas = 0;
      let graduadosOp = 0;

      allPersons.forEach((p) => {
        if (p.start_day <= day) {
          // Si desertó en un día anterior, sale del embudo
          if (p.first_baja_day !== null && p.first_baja_day < day) return;

          // Si ya ingresó a operación (I-OP) en este día o antes, ya no está en capacitación
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
        ? ((activos / initialPopulation) * 100).toFixed(1) 
        : '0.0';
      const pctSupervivenciaDiaria = totalEnProceso > 0 
        ? ((activos / totalEnProceso) * 100).toFixed(1) 
        : '100.0';

      rawDays.push({
        dia: `Día ${day}`,
        diaNum: day,
        activos,
        bajas,
        graduadosOp,
        total: totalEnProceso,
        retencionAcumulada: parseFloat(pctRetencionAcumulada),
        retencionDiaria: parseFloat(pctSupervivenciaDiaria),
        initialPopulation
      });
    }

    // 5. Límite Dinámico Inteligente:
    // Si la población cae por debajo del 3% o menos de 10 personas, cortar eje X para no mostrar barras planas residuales
    const finalDays = [];
    const umbralMinimo = Math.max(10, Math.round(initialPopulation * 0.03));

    for (let i = 0; i < rawDays.length; i++) {
      const d = rawDays[i];
      if (i < 5) {
        finalDays.push(d); // Mínimo 5 días para coherencia visual
      } else {
        if (d.total === 0) break;
        if (d.total < umbralMinimo && d.bajas === 0 && i >= 10) break;
        if (i < 20) {
          finalDays.push(d);
        } else {
          break;
        }
      }
    }

    return finalDays;
  }, [filteredData]);

  // ── 8. GRÁFICO 4: Heatmap Campaña vs Motivo ──
  const heatmapData = useMemo(() => {
    const rowCounts = {};
    const colTotals = {};
    let maxVal = 1;

    uniqueBajas.forEach((b) => {
      const c = b._campana || 'SIN CAMPAÑA';
      const m = b._motivo || 'SIN MOTIVO';

      if (!rowCounts[c]) rowCounts[c] = { campana: c, total: 0, motivos: {} };
      rowCounts[c].motivos[m] = (rowCounts[c].motivos[m] || 0) + 1;
      rowCounts[c].total++;

      if (rowCounts[c].motivos[m] > maxVal) maxVal = rowCounts[c].motivos[m];
      colTotals[m] = (colTotals[m] || 0) + 1;
    });

    const topMotivos = rankingMotivosData.slice(0, 8).map(m => m.motivo);
    const allCampaignsSorted = Object.values(rowCounts).sort((a, b) => b.total - a.total);

    let displayRows = [];
    if (heatmapViewAll || allCampaignsSorted.length <= 10) {
      displayRows = allCampaignsSorted;
    } else {
      const top10 = allCampaignsSorted.slice(0, 10);
      const rest = allCampaignsSorted.slice(10);
      
      const otherRow = {
        campana: `Otras (${rest.length} campañas)`,
        total: 0,
        motivos: {},
        isOthers: true
      };

      rest.forEach(r => {
        otherRow.total += r.total;
        topMotivos.forEach(m => {
          otherRow.motivos[m] = (otherRow.motivos[m] || 0) + (r.motivos[m] || 0);
          if (otherRow.motivos[m] > maxVal) maxVal = otherRow.motivos[m];
        });
      });

      displayRows = [...top10, otherRow];
    }

    return {
      rows: displayRows,
      topMotivos,
      maxVal,
      totalCampaigns: allCampaignsSorted.length
    };
  }, [uniqueBajas, rankingMotivosData, heatmapViewAll]);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-[var(--bg-base)]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 size={32} className="animate-spin text-rose-500" />
          <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
            Cargando Análisis de Bajas...
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center p-6 bg-[var(--bg-base)]">
        <div className="p-6 rounded-2xl bg-[var(--bg-surface)] border border-rose-500/30 text-center max-w-sm space-y-3 shadow-xl">
          <AlertCircle size={28} className="text-rose-500 mx-auto" />
          <h3 className="text-sm font-bold text-[var(--text-primary)]">Error al cargar datos</h3>
          <p className="text-xs text-[var(--text-muted)]">{error}</p>
          <button onClick={() => loadData(true)} className="px-4 py-2 rounded-xl bg-rose-500 text-white text-xs font-bold hover:bg-rose-600 transition-all cursor-pointer">
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden bg-[var(--bg-base)] p-3 gap-2 select-none">
      
      {/* ── 1. COMPACT HERO KPI HEADER (Height ~42px, Fijo) ── */}
      <div className="flex flex-wrap items-center justify-between gap-2 shrink-0 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl px-3 py-1.5 shadow-xs">
        
        {/* Title + Total Badge + Micro Sparkline */}
        <div className="flex items-center gap-2.5">
          <div className="w-2 h-2 rounded-full bg-rose-500 shadow-[0_0_8px_#F43F5E] animate-pulse" />
          <h2 className="text-xs sm:text-sm font-black tracking-tight text-[var(--text-primary)] uppercase">
            Motivos de Bajas <span className="text-[10px] text-[var(--text-muted)] font-medium lowercase">· bi deserción</span>
          </h2>
          
          <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-rose-500/10 text-rose-500 border border-rose-500/25">
            <UserX size={12} />
            <span className="text-xs font-black font-mono">
              {totalBajasCount}
            </span>
            <span className="text-[9px] font-bold uppercase tracking-wider opacity-80">
              Bajas Totales
            </span>
          </div>

          {/* Sparkline integrado de tendencia por periodo */}
          {byPeriodTrend.length > 1 && (
            <div className="hidden xl:block">
              <SparklineTrend data={byPeriodTrend} color="#F43F5E" />
            </div>
          )}
        </div>

        {/* Inline Compact Filter Badges */}
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { label: 'Segmento', val: selectedSegmento, set: (v) => { setSelectedSegmento(v); setSelectedCampana('TODAS'); setSelectedGrupo('TODAS'); }, opts: filterOptions.segmentos },
            { label: 'Campaña', val: selectedCampana, set: (v) => { setSelectedCampana(v); setSelectedGrupo('TODAS'); }, opts: filterOptions.campanas },
            { label: 'Grupo', val: selectedGrupo, set: setSelectedGrupo, opts: filterOptions.grupos },
            { label: 'Periodo', val: selectedPeriodo, set: (v) => { setSelectedPeriodo(v); setSelectedSemana('TODAS'); }, opts: filterOptions.periodos },
            { label: 'Semana', val: selectedSemana, set: setSelectedSemana, opts: filterOptions.semanas },
          ].map(({ label, val, set, opts }) => (
            <div key={label} className="flex items-center gap-1 bg-[var(--bg-elevated)] border border-[var(--border-normal)] rounded-lg px-2 py-1">
              <span className="text-[8px] font-black uppercase tracking-wider text-[var(--text-muted)]">
                {label}:
              </span>
              <select
                value={val}
                onChange={(e) => set(e.target.value)}
                className="bg-transparent text-[11px] font-bold text-[var(--text-primary)] outline-none cursor-pointer max-w-[105px] truncate"
              >
                {opts.map((opt) => (
                  <option key={opt} value={opt} className="bg-[var(--bg-surface)] text-[var(--text-primary)]">
                    {opt}
                  </option>
                ))}
              </select>
            </div>
          ))}

          <button
            onClick={() => loadData(true)}
            className="h-7 w-7 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-normal)] hover:border-rose-500/40 text-[var(--text-muted)] hover:text-rose-500 flex items-center justify-center transition-colors cursor-pointer"
            title="Refrescar datos de Supabase"
          >
            <RefreshCw size={12} />
          </button>
        </div>
      </div>

      {/* ── 2. GRID 2X2 CON ALTURA FIJA BALANCEADA (Dashboard BI sin Scroll) ── */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-2 gap-2 overflow-y-auto lg:overflow-hidden">
        
        {/* ── CUADRANTE 1: RANKING DE MOTIVOS CON PODIO TOP 3 INTEGRADO ── */}
        <div className="min-h-[250px] lg:min-h-0 flex flex-col rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-2.5 shadow-xs">
          
          {/* Card Header + Top 3 Podio Pills */}
          <div className="flex items-center justify-between pb-1.5 border-b border-[var(--border-subtle)] shrink-0 gap-2">
            <div className="flex items-center gap-1.5">
              <TrendingDown size={13} className="text-rose-500" />
              <span className="text-[11px] font-black uppercase tracking-tight text-[var(--text-primary)]">
                Ranking de Motivos de Deserción
              </span>
            </div>

            {/* Severity Alert Badges (Top 3) */}
            <div className="flex items-center gap-1">
              {top3Motivos.map((m, idx) => (
                <div 
                  key={m.motivo}
                  className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[8.5px] font-black uppercase border truncate max-w-[130px] ${
                    idx === 0 
                      ? 'bg-rose-500/15 text-rose-400 border-rose-500/30' 
                      : idx === 1 
                        ? 'bg-amber-500/15 text-amber-400 border-amber-500/30' 
                        : 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30'
                  }`}
                  title={`${idx === 0 ? '🔴 CRÍTICO' : idx === 1 ? '🟠 ALTO' : '🟡 MODERADO'} · ${m.motivo} (${m.value} bajas · ${m.pct}%)`}
                >
                  {idx === 0 && <Flame size={10} className="text-rose-400 shrink-0" />}
                  {idx === 1 && <AlertTriangle size={10} className="text-amber-400 shrink-0" />}
                  {idx === 2 && <AlertOctagon size={10} className="text-yellow-400 shrink-0" />}
                  <span className="truncate">{m.motivo}</span>
                  <span className="font-mono">({m.value})</span>
                </div>
              ))}
            </div>
          </div>

          {/* Chart Container */}
          <div className="flex-1 min-h-0 pt-1.5 relative overflow-hidden">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
              <BarChart
                data={rankingMotivosData}
                layout="vertical"
                margin={{ top: 5, right: 45, left: 10, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-normal)" horizontal={false} opacity={0.25} />
                <XAxis type="number" hide />
                <YAxis
                  dataKey="motivo"
                  type="category"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: 'var(--text-secondary)', fontSize: 9.5, fontWeight: 700 }}
                  width={140}
                />
                <RechartsTooltip
                  cursor={{ fill: 'rgba(244, 63, 94, 0.08)' }}
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const d = payload[0].payload;
                      return (
                        <div className="p-2 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-normal)] text-[11px] shadow-lg space-y-0.5">
                          <p className="font-black text-[var(--text-primary)]">{d.motivo}</p>
                          <p className="text-rose-500 font-mono font-bold">{d.value} bajas ({d.pct}% del total)</p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={13} isAnimationActive={false}>
                  {rankingMotivosData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={
                        index === 0 ? '#F43F5E' :
                        index === 1 ? '#FB7185' :
                        index === 2 ? '#FDA4AF' : '#64748B'
                      }
                    />
                  ))}
                  <LabelList
                    dataKey="value"
                    position="right"
                    content={({ x, y, width, height, value, index }) => {
                      const d = rankingMotivosData[index];
                      const pct = d?.pct ?? (totalBajasCount > 0 ? ((value / totalBajasCount) * 100).toFixed(1) : '0.0');
                      return (
                        <text
                          x={Number(x) + Number(width) + 5}
                          y={Number(y) + Number(height) / 2 + 3}
                          fill="var(--text-muted)"
                          fontSize={9}
                          fontWeight="bold"
                          textAnchor="start"
                        >
                          {`${value} (${pct}%)`}
                        </text>
                      );
                    }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* ── CUADRANTE 2: DESERCIÓN POR FORMADOR (NUEVO) ── */}
        <div className="min-h-[250px] lg:min-h-0 flex flex-col rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-2.5 shadow-xs">
          
          {/* Card Header + Threshold Info + View Toggle */}
          <div className="flex items-center justify-between pb-1.5 border-b border-[var(--border-subtle)] shrink-0 gap-2">
            <div className="flex items-center gap-1.5 flex-wrap">
              <Users size={13} className="text-cyan-400" />
              <span className="text-[11px] font-black uppercase tracking-tight text-[var(--text-primary)]">
                Deserción por Formador
              </span>
              <span className="text-[8.5px] font-bold text-[var(--text-muted)] bg-[var(--bg-elevated)] px-1.5 py-0.5 rounded border border-[var(--border-subtle)]">
                Meta: &lt;30%
              </span>
              <span className="text-[8px] font-bold text-amber-500/90 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20 hidden sm:inline" title="Las bajas de Día 1 (Periodo de Gracia) se imputan a Reclutamiento, no al Formador">
                Excluye Bajas D1 (RyS)
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-[9px] font-mono text-[var(--text-muted)]">
                {formadoresData.length} formadores
              </span>
              {formadoresData.length > 8 && (
                <button
                  onClick={() => setFormadorViewAll(!formadorViewAll)}
                  className={`text-[9px] font-bold px-2 py-0.5 rounded transition-all cursor-pointer ${
                    formadorViewAll 
                      ? 'bg-cyan-500 text-white shadow-xs' 
                      : 'bg-[var(--bg-elevated)] text-[var(--text-muted)] hover:text-[var(--text-primary)] border border-[var(--border-subtle)]'
                  }`}
                >
                  {formadorViewAll ? 'Top 8' : 'Ver Todos'}
                </button>
              )}
            </div>
          </div>

          {/* Chart Container */}
          <div className={`flex-1 min-h-0 pt-1.5 relative ${formadorViewAll ? 'overflow-y-auto custom-scrollbar pr-1' : 'overflow-hidden'}`}>
            {displayedFormadores.length === 0 ? (
              <div className="h-full flex items-center justify-center text-center text-[var(--text-muted)] text-xs">
                No hay datos de formadores para los filtros seleccionados.
              </div>
            ) : (
              <div style={{ height: formadorViewAll ? `${Math.max(displayedFormadores.length * 28, 220)}px` : '100%', width: '100%' }}>
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                  <BarChart
                    data={displayedFormadores}
                    layout="vertical"
                    margin={{ top: 5, right: 55, left: 10, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-normal)" horizontal={false} opacity={0.25} />
                    <XAxis type="number" domain={[0, 100]} hide />
                    <YAxis
                      dataKey="formador"
                      type="category"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: 'var(--text-secondary)', fontSize: 9.5, fontWeight: 700 }}
                      width={140}
                    />
                    <RechartsTooltip
                      cursor={{ fill: 'rgba(6, 182, 212, 0.08)' }}
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const d = payload[0].payload;
                          return (
                            <div className="p-2 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-normal)] text-[11px] shadow-lg space-y-1">
                              <p className="font-black text-[var(--text-primary)]">{d.formador}</p>
                              <div className="flex items-center justify-between gap-3 text-xs">
                                <span className="text-[var(--text-muted)]">% Deserción:</span>
                                <span className={`font-mono font-black ${d.isAlert ? 'text-rose-500' : 'text-emerald-400'}`}>
                                  {d.pctDesercion}%
                                </span>
                              </div>
                              <div className="flex items-center justify-between gap-3 text-[10px] text-[var(--text-muted)]">
                                <span>Bajas / Total Asignados:</span>
                                <span className="font-mono font-bold text-[var(--text-primary)]">
                                  {d.totalBajas} de {d.totalAsignados} postulantes
                                </span>
                              </div>
                              {d.isAlert && (
                                <div className="text-[9px] font-black text-rose-500 uppercase pt-0.5 border-t border-[var(--border-subtle)]">
                                  ⚠️ Supera umbral crítico (&gt;30%)
                                </div>
                              )}
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Bar dataKey="pctDesercion" radius={[0, 4, 4, 0]} barSize={13} isAnimationActive={false}>
                      {displayedFormadores.map((entry, index) => (
                        <Cell
                          key={`cell-form-${index}`}
                          fill={entry.isAlert ? '#F43F5E' : '#10B981'}
                        />
                      ))}
                      <LabelList
                        dataKey="pctDesercion"
                        position="right"
                        content={({ x, y, width, height, value, index }) => {
                          const d = displayedFormadores[index];
                          if (!d) return null;
                          return (
                            <text
                              x={Number(x) + Number(width) + 5}
                              y={Number(y) + Number(height) / 2 + 3}
                              fill="var(--text-muted)"
                              fontSize={9}
                              fontWeight="bold"
                              textAnchor="start"
                            >
                              {`${value}% (${d.totalBajas}/${d.totalAsignados})`}
                            </text>
                          );
                        }}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>

        {/* ── CUADRANTE 3: EMBUDO DE CAPACITACIÓN DÍA 1 → DÍA N (NUEVO) ── */}
        <div className="min-h-[250px] lg:min-h-0 flex flex-col rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-2.5 shadow-xs">
          
          {/* Card Header + Legend */}
          <div className="flex items-center justify-between pb-1.5 border-b border-[var(--border-subtle)] shrink-0 gap-2">
            <div className="flex items-center gap-1.5">
              <Layers size={13} className="text-purple-400" />
              <span className="text-[11px] font-black uppercase tracking-tight text-[var(--text-primary)]">
                Embudo de Capacitación (Día 1 → Día N)
              </span>
            </div>

            <div className="flex items-center gap-3 text-[9px] font-bold">
              <div className="flex items-center gap-1 text-emerald-500">
                <div className="w-2 h-2 rounded-xs bg-emerald-500" />
                <span>Activos</span>
              </div>
              <div className="flex items-center gap-1 text-rose-500">
                <div className="w-2 h-2 rounded-xs bg-rose-500" />
                <span>Bajas</span>
              </div>
            </div>
          </div>

          {/* Chart Container */}
          <div className="flex-1 min-h-0 pt-1.5 relative overflow-hidden">
            {embudoData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-center text-[var(--text-muted)] text-xs">
                No hay registros con fecha de inicio para calcular días de capacitación.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                <BarChart
                  data={embudoData}
                  margin={{ top: 10, right: 15, left: -20, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-normal)" vertical={false} opacity={0.25} />
                  <XAxis
                    dataKey="dia"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: 'var(--text-secondary)', fontSize: 9.5, fontWeight: 700 }}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: 'var(--text-muted)', fontSize: 9.5 }}
                  />
                  <RechartsTooltip
                    cursor={{ fill: 'rgba(139, 92, 246, 0.08)' }}
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const d = payload[0].payload;
                        return (
                          <div className="p-2.5 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-normal)] text-[11px] shadow-xl space-y-1.5">
                            <div className="flex items-center justify-between gap-3 border-b border-[var(--border-subtle)] pb-1">
                              <span className="font-black text-[var(--text-primary)]">{d.dia}</span>
                              <span className="text-[10px] font-mono text-[var(--text-muted)]">Total: {d.total} postulantes</span>
                            </div>
                            <div className="flex items-center justify-between gap-3 text-emerald-400 font-mono">
                              <span>Activos en sesión:</span>
                              <span className="font-bold">{d.activos}</span>
                            </div>
                            <div className="flex items-center justify-between gap-3 text-rose-400 font-mono">
                              <span>Bajas en esta sesión:</span>
                              <span className="font-bold">{d.bajas}</span>
                            </div>
                            {d.graduadosOp > 0 && (
                              <div className="flex items-center justify-between gap-3 text-cyan-400 font-mono">
                                <span>Ingreso a Operación (I-OP):</span>
                                <span className="font-bold">+{d.graduadosOp}</span>
                              </div>
                            )}
                            <div className="pt-1 border-t border-[var(--border-subtle)] space-y-0.5">
                              <div className="flex items-center justify-between text-[10px] font-bold text-[var(--text-muted)]">
                                <span>Retención Acumulada (vs Día 1):</span>
                                <span className="font-mono text-cyan-400 font-black">{d.retencionAcumulada}%</span>
                              </div>
                              <div className="flex items-center justify-between text-[9px] text-[var(--text-muted)]">
                                <span>Supervivencia Diaria:</span>
                                <span className="font-mono text-purple-400">{d.retencionDiaria}%</span>
                              </div>
                            </div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Bar dataKey="activos" stackId="a" fill="#10B981" radius={[0, 0, 0, 0]} isAnimationActive={false} />
                  <Bar dataKey="bajas" stackId="a" fill="#F43F5E" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                    <LabelList
                      dataKey="total"
                      position="top"
                      content={({ x, y, width, value, index }) => {
                        const d = embudoData[index];
                        if (!d) return null;
                        return (
                          <text
                            x={Number(x) + Number(width) / 2}
                            y={Number(y) - 5}
                            fill="var(--text-muted)"
                            fontSize={8.5}
                            fontWeight="bold"
                            textAnchor="middle"
                          >
                            {`${d.total} (${d.retencionAcumulada}%)`}
                          </text>
                        );
                      }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* ── CUADRANTE 4: HEATMAP CAMPAÑA VS MOTIVO (INTERACTIVO SIN SCROLL DE PÁGINA) ── */}
        <div className="min-h-[250px] lg:min-h-0 flex flex-col rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-2.5 shadow-xs">
          
          {/* Card Header + Toggle Top 10 vs Todas */}
          <div className="flex items-center justify-between pb-1.5 border-b border-[var(--border-subtle)] shrink-0 gap-2">
            <div className="flex items-center gap-1.5">
              <Grid size={13} className="text-amber-500" />
              <span className="text-[11px] font-black uppercase tracking-tight text-[var(--text-primary)]">
                Heatmap: Campaña vs Motivo
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-[9px] font-mono text-[var(--text-muted)]">
                {heatmapData.totalCampaigns} campañas
              </span>
              {heatmapData.totalCampaigns > 10 && (
                <button
                  onClick={() => setHeatmapViewAll(!heatmapViewAll)}
                  className={`text-[9px] font-bold px-2 py-0.5 rounded transition-all cursor-pointer ${
                    heatmapViewAll 
                      ? 'bg-amber-500 text-white shadow-xs' 
                      : 'bg-[var(--bg-elevated)] text-[var(--text-muted)] hover:text-[var(--text-primary)] border border-[var(--border-subtle)]'
                  }`}
                >
                  {heatmapViewAll ? 'Top 10' : 'Ver Todas (19)'}
                </button>
              )}
            </div>
          </div>

          {/* Matrix Heatmap Table Container with Internal Scroll */}
          <div className="flex-1 min-h-0 pt-1 relative overflow-x-auto overflow-y-auto custom-scrollbar">
            {heatmapData.rows.length === 0 ? (
              <div className="h-full flex items-center justify-center text-center text-[var(--text-muted)] text-xs">
                No hay bajas registradas para esta selección.
              </div>
            ) : (
              <table className="w-full text-left text-[10px] whitespace-nowrap border-separate border-spacing-1">
                <thead className="sticky top-0 z-20 bg-[var(--bg-surface)]">
                  <tr>
                    <th className="sticky left-0 z-30 px-2 py-1 bg-[var(--table-head-bg)] border border-[var(--border-subtle)] rounded font-black text-[8px] uppercase text-[var(--text-muted)] tracking-wider">
                      CAMPAÑA
                    </th>
                    {heatmapData.topMotivos.map((m) => (
                      <th
                        key={m}
                        className="px-1.5 py-1 bg-[var(--table-head-bg)] border border-[var(--border-subtle)] rounded font-black text-[8px] uppercase text-[var(--text-muted)] text-center max-w-[85px] truncate"
                        title={m}
                      >
                        {m}
                      </th>
                    ))}
                    <th className="px-1.5 py-1 bg-[var(--table-head-bg)] border border-[var(--border-subtle)] rounded font-black text-[8px] uppercase text-[var(--text-primary)] text-center font-mono">
                      TOTAL
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {heatmapData.rows.map((row) => (
                    <tr key={row.campana} className="group">
                      <td 
                        className={`sticky left-0 z-10 px-2 py-1 border border-[var(--border-subtle)] rounded font-bold text-[10px] truncate max-w-[130px] ${
                          row.isOthers 
                            ? 'bg-amber-500/10 text-amber-500 border-amber-500/30 font-black' 
                            : 'bg-[var(--bg-surface)] text-[var(--text-primary)] group-hover:bg-[var(--bg-elevated)]'
                        }`}
                        title={row.campana}
                      >
                        {row.campana}
                      </td>

                      {heatmapData.topMotivos.map((m) => {
                        const count = row.motivos[m] || 0;
                        const pct = row.total > 0 ? ((count / row.total) * 100).toFixed(0) : 0;
                        const intensity = count > 0 ? Math.min(count / heatmapData.maxVal, 1) : 0;

                        return (
                          <td
                            key={m}
                            className="p-0 text-center"
                            title={`${row.campana} · ${m}: ${count} bajas (${pct}% de la campaña)`}
                          >
                            <div
                              className={`h-6 min-w-[36px] flex items-center justify-center rounded font-mono font-black text-[9.5px] transition-all group-hover:scale-102 ${
                                count === 0 
                                  ? 'bg-[var(--bg-elevated)]/40 text-[var(--text-muted)]/30 border border-transparent' 
                                  : 'border border-rose-500/30'
                              }`}
                              style={{
                                backgroundColor: count > 0 ? `rgba(244, 63, 94, ${0.15 + intensity * 0.8})` : undefined,
                                color: count > 0 ? (intensity > 0.45 ? '#FFFFFF' : '#F43F5E') : undefined,
                              }}
                            >
                              {count > 0 ? count : '—'}
                            </div>
                          </td>
                        );
                      })}

                      <td className="px-2 py-1 border border-[var(--border-subtle)] rounded text-center font-mono font-black text-rose-500 text-[10.5px] bg-[var(--bg-elevated)]/60">
                        {row.total}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

      </div>

    </div>
  );
}
