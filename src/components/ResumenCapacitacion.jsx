import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  calculateMetricasResumenCapacitacionFast, 
  parseFechaAsistencia, 
  invalidateCache 
} from '../lib/dataService';
import { 
  BarChart3, 
  Users, 
  CheckCircle2, 
  UserCheck, 
  CalendarCheck, 
  ShieldCheck, 
  Download, 
  TrendingUp,
  TrendingDown, 
  RefreshCw, 
  AlertCircle,
  Activity,
  Layers,
  ArrowRight,
  RotateCcw,
  Sparkles,
  Award,
  Search,
  X,
  Table as TableIcon,
  PieChart as PieIcon,
  Compass,
  Zap,
  Target,
  Clock,
  AlertTriangle,
  Flame,
  Hourglass,
  ShieldAlert,
  Calendar
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip as RechartsTooltip, 
  ResponsiveContainer, 
  Cell, 
  LabelList,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  RadialBarChart,
  RadialBar,
  Legend
} from 'recharts';
import ViewLoadingSkeleton from './ui/ViewLoadingSkeleton';

// Normalizador seguro de segmentos
const normalizeSegmento = (rawSeg, campana) => {
  let s = String(rawSeg || '').trim().toUpperCase();
  if (!s || s === 'NULL' || s === 'SIN SEGMENTO') {
    const c = String(campana || '').toUpperCase();
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
};

const SEGMENTO_COLORS = {
  'CLARO PERU': '#00E5FF',
  'CLARO PERU RETENCIONES': '#7C4DFF',
  'CLARO PERU OUT': '#FF5252',
  'CLARO CHILE': '#FFD600',
  'LIPIGAS': '#00E676'
};

export default function ResumenCapacitacion({ grupos = [], postulantes = [], asistencias = [] }) {
  const [capacidadRys, setCapacidadRys] = useState(grupos);
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [activeTab, setActiveTab] = useState('DASHBOARD'); // 'DASHBOARD' | 'MATRIZ_TABLA'
  const [searchQuery, setSearchQuery] = useState('');

  const [filters, setFilters] = useState({
    periodo: 'Todos',
    semana: 'Todas',
    segmento: 'Todos',
    campana: 'Todas',
    grupo: 'Todos'
  });

  // Helpers de normalización robusta
  const norm = (val) => String(val || '').trim().toUpperCase();
  const getSemanaRaw = (g) => g?.semana_label || g?.semana_trabajo || g?.semana || '';
  
  const formatSemana = (val) => {
    if (!val) return '';
    const s = String(val).trim().toUpperCase();
    if (s.startsWith('SEM')) return s;
    const num = parseInt(s.replace(/\D/g, ''), 10);
    return !isNaN(num) ? `SEM ${num}` : s;
  };

  const matchSemana = (valA, valB) => {
    if (!valA || !valB) return false;
    const strB = String(valB).trim().toUpperCase();
    if (strB === 'TODAS' || strB === 'TODOS') return true;
    
    const numA = parseInt(String(valA).replace(/\D/g, ''), 10);
    const numB = parseInt(String(valB).replace(/\D/g, ''), 10);
    if (!isNaN(numA) && !isNaN(numB)) return numA === numB;
    return norm(valA) === norm(valB);
  };

  // Carga y cálculo de métricas
  const loadData = useCallback(async (force = false) => {
    if (grupos.length === 0) return;
    try {
      if (force || data.length === 0) {
        setLoading(true);
      } else {
        setIsRefreshing(true);
      }
      setError(null);

      const metricas = await calculateMetricasResumenCapacitacionFast(grupos, postulantes, asistencias);
      setCapacidadRys(grupos);
      setData(metricas || []);
    } catch (err) {
      console.error('Error calculating resumen metrics:', err);
      setError(err?.message || 'Error cargando datos de resumen');
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [grupos, postulantes, asistencias, data.length]);

  useEffect(() => {
    if (grupos.length > 0) {
      loadData(false);
    }
  }, [grupos.length, postulantes.length, asistencias.length]);

  // Filtros activos
  const hasActiveFilters = useMemo(() => {
    return filters.periodo !== 'Todos' ||
      filters.semana !== 'Todas' ||
      filters.segmento !== 'Todos' ||
      filters.campana !== 'Todas' ||
      filters.grupo !== 'Todos' ||
      Boolean(searchQuery);
  }, [filters, searchQuery]);

  const handleResetFilters = () => {
    setFilters({
      periodo: 'Todos',
      semana: 'Todas',
      segmento: 'Todos',
      campana: 'Todas',
      grupo: 'Todos'
    });
    setSearchQuery('');
  };

  // Opciones de filtros cruzados reactivos sobre el conjunto de datos calculado
  const filterOptions = useMemo(() => {
    const dataset = data.length > 0 ? data : capacidadRys;
    
    // 1. Periodos
    const periodos = new Set(dataset.map(g => g.periodo ? String(g.periodo).trim() : null).filter(Boolean));
    
    // 2. Semanas (filtradas por periodo activo)
    const subSemanas = dataset.filter(g => filters.periodo === 'Todos' || String(g.periodo || '').trim() === String(filters.periodo || '').trim());
    const semanas = new Set(subSemanas.map(g => formatSemana(getSemanaRaw(g))).filter(Boolean));
    
    // 3. Segmentos Oficiales (filtrados por periodo y semana activos)
    const subSegmentos = subSemanas.filter(g => filters.semana === 'Todas' || matchSemana(getSemanaRaw(g), filters.semana));
    const segmentos = new Set(subSegmentos.map(g => normalizeSegmento(g.segmento, g.campana)).filter(Boolean));
    
    // 4. Campañas (filtradas por periodo, semana y segmento activos)
    const subCampanas = subSegmentos.filter(g => filters.segmento === 'Todos' || normalizeSegmento(g.segmento, g.campana) === filters.segmento);
    const campanas = new Set(subCampanas.map(g => g.campana ? String(g.campana).trim() : null).filter(Boolean));
    
    // 5. Grupos (filtrados por campaña activa)
    const subGrupos = subCampanas.filter(g => filters.campana === 'Todas' || norm(g.campana) === norm(filters.campana));
    const gruposSet = new Set(subGrupos.map(g => g.codigo || g.grupo_codigo ? String(g.codigo || g.grupo_codigo).trim() : null).filter(Boolean));

    const sortedSemanas = Array.from(semanas).sort((a, b) => {
      const numA = parseInt(a.replace(/\D/g, ''), 10) || 0;
      const numB = parseInt(b.replace(/\D/g, ''), 10) || 0;
      return numB - numA;
    });

    return {
      periodos: Array.from(periodos).sort().reverse(),
      semanas: sortedSemanas,
      segmentos: Array.from(segmentos).sort(),
      campanas: Array.from(campanas).sort(),
      grupos: Array.from(gruposSet).sort()
    };
  }, [data, capacidadRys, filters]);

  // Datos filtrados en caliente con normalización exacta
  const filteredData = useMemo(() => {
    return data.filter(d => {
      // Filtro Periodo
      if (filters.periodo !== 'Todos' && String(d.periodo || '').trim() !== String(filters.periodo || '').trim()) {
        return false;
      }
      // Filtro Semana
      if (filters.semana !== 'Todas' && !matchSemana(d.semana, filters.semana)) {
        return false;
      }
      // Filtro Segmento (Normalizado robusto)
      const segNorm = normalizeSegmento(d.segmento, d.campana);
      if (filters.segmento !== 'Todos' && norm(segNorm) !== norm(filters.segmento)) {
        return false;
      }
      // Filtro Campaña
      if (filters.campana !== 'Todas' && norm(d.campana) !== norm(filters.campana)) {
        return false;
      }
      // Filtro Grupo / GPE
      if (filters.grupo !== 'Todos' && norm(d.grupo_codigo) !== norm(filters.grupo)) {
        return false;
      }
      // Búsqueda en texto libre
      if (searchQuery) {
        const q = searchQuery.trim().toLowerCase();
        const matchDoc = String(d.grupo_codigo || '').toLowerCase().includes(q) ||
          String(d.campana || '').toLowerCase().includes(q) ||
          String(d.formador || '').toLowerCase().includes(q) ||
          String(segNorm).toLowerCase().includes(q);
        if (!matchDoc) return false;
      }
      return true;
    });
  }, [data, filters, searchQuery]);

  // Totales Scorecard
  const kpis = useMemo(() => {
    return filteredData.reduce((acc, curr) => {
      acc.rq_solicitado += (curr.requerimiento || curr.rq_solicitado || 0);
      acc.total_nomina += (curr.total_nomina || 0);
      acc.asistio_dia1 += (curr.asistio_dia1 || 0);
      acc.activos_ojt += (curr.activos_ojt || 0);
      acc.ingresos_iop += (curr.ingresos_iop || 0);
      acc.activos_actuales += (curr.activos_actuales || 0);
      return acc;
    }, {
      rq_solicitado: 0,
      total_nomina: 0,
      asistio_dia1: 0,
      activos_ojt: 0,
      ingresos_iop: 0,
      activos_actuales: 0
    });
  }, [filteredData]);

  // Desglose por Segmento (Tabla y Gráficos)
  const segmentData = useMemo(() => {
    const segMap = {
      'CLARO PERU': { segmento: 'CLARO PERU', rq: 0, reclutados: 0, d1: 0, ojt: 0, iop: 0, grupos: 0 },
      'CLARO PERU RETENCIONES': { segmento: 'CLARO PERU RETENCIONES', rq: 0, reclutados: 0, d1: 0, ojt: 0, iop: 0, grupos: 0 },
      'CLARO PERU OUT': { segmento: 'CLARO PERU OUT', rq: 0, reclutados: 0, d1: 0, ojt: 0, iop: 0, grupos: 0 },
      'CLARO CHILE': { segmento: 'CLARO CHILE', rq: 0, reclutados: 0, d1: 0, ojt: 0, iop: 0, grupos: 0 },
      'LIPIGAS': { segmento: 'LIPIGAS', rq: 0, reclutados: 0, d1: 0, ojt: 0, iop: 0, grupos: 0 }
    };

    filteredData.forEach(d => {
      const segKey = normalizeSegmento(d.segmento, d.campana);
      const target = segMap[segKey] || (segMap[segKey] = { segmento: segKey, rq: 0, reclutados: 0, d1: 0, ojt: 0, iop: 0, grupos: 0 });

      target.rq += (d.requerimiento || d.rq_solicitado || 0);
      target.reclutados += (d.total_nomina || 0);
      target.d1 += (d.asistio_dia1 || 0);
      target.ojt += (d.activos_ojt || 0);
      target.iop += (d.ingresos_iop || 0);
      target.grupos += 1;
    });

    return Object.values(segMap).map(s => {
      const convD1 = s.reclutados > 0 ? ((s.d1 / s.reclutados) * 100) : 0;
      const retOjt = s.d1 > 0 ? ((s.ojt / s.d1) * 100) : 0;
      const convIop = s.d1 > 0 ? ((s.iop / s.d1) * 100) : 0;
      const cumplRq = s.rq > 0 ? ((s.iop / s.rq) * 100) : 0;
      const enTransito = Math.max(0, s.ojt - s.iop);

      return {
        ...s,
        convD1: parseFloat(convD1.toFixed(1)),
        retOjt: parseFloat(retOjt.toFixed(1)),
        convIop: parseFloat(convIop.toFixed(1)),
        cumplRq: parseFloat(cumplRq.toFixed(1)),
        enTransito,
        fill: SEGMENTO_COLORS[s.segmento] || '#00E5FF'
      };
    });
  }, [filteredData]);

  // Porcentajes de conversión entre etapas
  const kpiPercentages = useMemo(() => {
    const total = kpis.total_nomina || 0;
    const d1 = kpis.asistio_dia1 || 0;
    const ojt = kpis.activos_ojt || 0;
    const iop = kpis.ingresos_iop || 0;
    const rq = kpis.rq_solicitado || 0;
    const ojt_transito = segmentData.reduce((acc, s) => acc + s.enTransito, 0);

    return {
      d1_vs_nomina: total > 0 ? ((d1 / total) * 100).toFixed(1) : '0.0',
      ojt_vs_d1: d1 > 0 ? ((ojt / d1) * 100).toFixed(1) : '0.0',
      iop_vs_nomina: total > 0 ? ((iop / total) * 100).toFixed(1) : '0.0',
      iop_vs_ojt: ojt > 0 ? ((iop / ojt) * 100).toFixed(1) : '0.0',
      cumplimiento_rq: rq > 0 ? ((iop / rq) * 100).toFixed(1) : '0.0',
      ojt_transito
    };
  }, [kpis, segmentData]);

  // ── 1. KPI SUPERIOR: TENDENCIA VS PERIODO / SEMANA ANTERIOR ──
  const kpiTendencia = useMemo(() => {
    if (!data || data.length === 0) {
      return { diffPp: '+0.0', diffVal: 0, isPositive: true, prevLabel: 'vs Periodo Previo', currentPct: '0.0', prevPct: '0.0' };
    }

    const currentReq = kpis.rq_solicitado || 0;
    const currentIop = kpis.ingresos_iop || 0;
    const currentPct = currentReq > 0 ? (currentIop / currentReq) * 100 : (kpis.asistio_dia1 > 0 ? (currentIop / kpis.asistio_dia1) * 100 : 0);

    let prevData = [];
    let prevLabel = '';

    if (filters.periodo !== 'Todos') {
      const allPeriodos = Array.from(new Set(data.map(d => d.periodo).filter(Boolean))).sort().reverse();
      const currIdx = allPeriodos.indexOf(filters.periodo);
      if (currIdx >= 0 && currIdx + 1 < allPeriodos.length) {
        const prevPeriodo = allPeriodos[currIdx + 1];
        prevData = data.filter(d => d.periodo === prevPeriodo);
        prevLabel = `vs Periodo ${prevPeriodo}`;
      } else {
        prevLabel = `vs Periodo Base`;
      }
    } else if (filters.semana !== 'Todas') {
      const allSemanas = filterOptions.semanas;
      const currIdx = allSemanas.indexOf(filters.semana);
      if (currIdx >= 0 && currIdx + 1 < allSemanas.length) {
        const prevSem = allSemanas[currIdx + 1];
        prevData = data.filter(d => matchSemana(d.semana, prevSem));
        prevLabel = `vs ${prevSem}`;
      } else {
        prevLabel = `vs Semana Previa`;
      }
    } else {
      const allPeriodos = Array.from(new Set(data.map(d => d.periodo).filter(Boolean))).sort().reverse();
      if (allPeriodos.length >= 2) {
        const prevP = allPeriodos[1];
        prevData = data.filter(d => d.periodo === prevP);
        prevLabel = `vs Periodo ${prevP}`;
      } else {
        prevLabel = `vs Periodo Previo`;
      }
    }

    const prevReq = prevData.reduce((acc, d) => acc + (d.requerimiento || d.rq_solicitado || 0), 0);
    const prevIop = prevData.reduce((acc, d) => acc + (d.ingresos_iop || 0), 0);
    const prevPct = prevReq > 0 ? (prevIop / prevReq) * 100 : 0;

    const diff = currentPct - prevPct;
    const isPositive = diff >= 0;

    return {
      diffPp: (isPositive ? `+${diff.toFixed(1)}` : diff.toFixed(1)),
      diffVal: diff,
      isPositive,
      prevLabel: prevLabel || 'vs Periodo Previo',
      currentPct: currentPct.toFixed(1),
      prevPct: prevPct.toFixed(1)
    };
  }, [data, kpis, filters.periodo, filters.semana, filterOptions.semanas]);

  // ── 2. KPI SUPERIOR: AGING / ANTIGÜEDAD EN TRÁNSITO ──
  const kpiAging = useMemo(() => {
    const today = new Date();
    let sumDays = 0;
    let countTotal = 0;
    let countEstancados = 0; // > 15 días en OJT sin graduar

    filteredData.forEach(d => {
      const transitoEnGrupo = Math.max(0, (d.activos_ojt || 0) - (d.ingresos_iop || 0));
      if (transitoEnGrupo > 0) {
        let diffDays = 7; // tiempo medio estándar por defecto
        if (d.fecha_inicio_ojt && d.fecha_inicio_ojt !== 'No definida') {
          const f = new Date(d.fecha_inicio_ojt);
          if (!isNaN(f.getTime())) {
            diffDays = Math.max(0, Math.floor((today.getTime() - f.getTime()) / (1000 * 60 * 60 * 24)));
          }
        }
        
        // Truncar si es periodo histórico cerrado (>60 días)
        if (diffDays > 60) diffDays = 12;

        sumDays += diffDays * transitoEnGrupo;
        countTotal += transitoEnGrupo;
        if (diffDays > 15) {
          countEstancados += transitoEnGrupo;
        }
      }
    });

    const avgDays = countTotal > 0 ? (sumDays / countTotal).toFixed(1) : '0.0';
    const totalTransito = segmentData.reduce((acc, s) => acc + s.enTransito, 0);

    return {
      avgDays,
      totalTransito,
      countEstancados,
      hasAlert: countEstancados > 0
    };
  }, [filteredData, segmentData]);

  // ── 3. KPI SUPERIOR: ALERTAS ACTIVAS (SEGMENTOS + FORMADORES) ──
  const kpiAlertas = useMemo(() => {
    // Segmentos bajo meta (< 50% de cumplimiento RQ)
    const segBajoMeta = segmentData.filter(s => s.rq > 0 && s.cumplRq < 50);
    const countSegBajoMeta = segBajoMeta.length;

    // Formadores en zona crítica (> 25% deserción y >= 3 postulantes evaluados)
    const formMap = new Map();
    filteredData.forEach(g => {
      const records = g.asistencias_raw || [];
      const formador = g.formador || 'SIN FORMADOR';
      if (!formMap.has(formador)) {
        formMap.set(formador, { docs: new Set(), bajas: new Set() });
      }
      const entry = formMap.get(formador);
      records.forEach(r => {
        const doc = r.documento || r.postulante_documento;
        if (!doc) return;
        const sigla = String(r.sigla || r.sigla_asistencia || '').trim().toUpperCase();
        const motivo = String(r.motivo_baja || '').trim().toUpperCase();
        const estado = String(r.estado || '').trim().toUpperCase();
        const isBajaDia1 = motivo.includes('BAJA DIA 1') || estado.includes('BAJA DIA 1');
        const isBaja = sigla === 'B' || motivo.includes('BAJA') || estado.includes('BAJA') || estado === 'CESADO' || estado === 'INACTIVO';

        if (!isBajaDia1) {
          entry.docs.add(doc);
          if (isBaja) entry.bajas.add(doc);
        }
      });
    });

    let countFormadoresCriticos = 0;
    formMap.forEach((entry, fName) => {
      if (fName !== 'SIN FORMADOR' && entry.docs.size >= 3) {
        const pct = (entry.bajas.size / entry.docs.size) * 100;
        if (pct > 25) {
          countFormadoresCriticos++;
        }
      }
    });

    const totalAlertas = countSegBajoMeta + countFormadoresCriticos;

    return {
      totalAlertas,
      countSegBajoMeta,
      countFormadoresCriticos,
      hasCritical: totalAlertas > 0
    };
  }, [segmentData, filteredData]);

  // ── 4. KPI SUPERIOR: PROYECCIÓN DE CIERRE DE MES (RUN-RATE) ──
  const kpiProyeccion = useMemo(() => {
    const today = new Date();
    const currentDay = today.getDate(); // 1 a 31
    const currentMonth = today.getMonth(); // 0 a 11
    const currentYear = today.getFullYear();
    const totalDaysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

    const diasTranscurridos = Math.max(1, Math.min(totalDaysInMonth, currentDay));
    const iopActual = kpis.ingresos_iop || 0;
    const rqTotal = kpis.rq_solicitado || 0;

    const isPeriodoPasado = filters.periodo !== 'Todos' && !filters.periodo.startsWith(String(currentYear));
    
    let iopProyectado = 0;
    if (isPeriodoPasado || diasTranscurridos >= totalDaysInMonth) {
      iopProyectado = iopActual;
    } else {
      const ritmoDiario = iopActual / diasTranscurridos;
      iopProyectado = Math.round(ritmoDiario * totalDaysInMonth);
    }

    const pctProyeccion = rqTotal > 0 ? ((iopProyectado / rqTotal) * 100).toFixed(1) : (iopActual > 0 ? '100.0' : '0.0');
    const brecha = Math.max(0, rqTotal - iopProyectado);

    return {
      iopProyectado,
      pctProyeccion,
      diasTranscurridos,
      totalDaysInMonth,
      brecha,
      isCloseToTarget: parseFloat(pctProyeccion) >= 80
    };
  }, [kpis, filters.periodo]);

  // Datos para Embudo Lineal
  const funnelData = useMemo(() => {
    return [
      {
        etapa: '1. Reclutados',
        nombre: 'Nómina Reclutada',
        valor: kpis.total_nomina,
        pct: '100%',
        drop: '-',
        fill: '#38BDF8'
      },
      {
        etapa: '2. Inicio D1',
        nombre: 'Inicio Formación',
        valor: kpis.asistio_dia1,
        pct: `${kpiPercentages.d1_vs_nomina}%`,
        drop: `${(100 - parseFloat(kpiPercentages.d1_vs_nomina)).toFixed(1)}% caída`,
        fill: '#818CF8'
      },
      {
        etapa: '3. Activos OJT',
        nombre: 'Pase a OJT / Nesting',
        valor: kpis.activos_ojt,
        pct: `${kpiPercentages.ojt_vs_d1}% vs D1`,
        drop: `${(100 - parseFloat(kpiPercentages.ojt_vs_d1)).toFixed(1)}% caída`,
        fill: '#2DD4BF'
      },
      {
        etapa: '4. Pases I-OP',
        nombre: 'Pase a Operación',
        valor: kpis.ingresos_iop,
        pct: `${kpiPercentages.iop_vs_ojt}% vs OJT`,
        drop: `${(100 - parseFloat(kpiPercentages.iop_vs_ojt)).toFixed(1)}% caída`,
        fill: '#FBBF24'
      }
    ];
  }, [kpis, kpiPercentages]);

  // Datos para Radar de Calidad Gerencial (5 Pilares vs Meta 80%)
  const radarData = useMemo(() => {
    const total = kpis.total_nomina || 0;
    const d1 = kpis.asistio_dia1 || 0;
    const ojt = kpis.activos_ojt || 0;
    const iop = kpis.ingresos_iop || 0;
    const rq = kpis.rq_solicitado || 0;

    const pilar1 = total > 0 ? (d1 / total) * 100 : 0;
    const pilar2 = d1 > 0 ? (ojt / d1) * 100 : 0;
    const pilar3 = ojt > 0 ? (iop / ojt) * 100 : 0;
    const pilar4 = rq > 0 ? Math.min(100, (iop / rq) * 100) : (iop > 0 ? 100 : 0);

    const desertores = Math.max(0, d1 - (kpis.activos_actuales || 0) - iop);
    const pctDesercion = d1 > 0 ? (desertores / d1) * 100 : 0;
    const pilar5 = Math.max(0, Math.min(100, 100 - pctDesercion));

    return [
      {
        pilar: '1. Convocatoria',
        pilarFull: 'Convocatoria RyS (D1 / Nómina)',
        'Desempeño Real': parseFloat(pilar1.toFixed(1)),
        'Meta Base (80%)': 80,
        detalle: `${d1.toLocaleString()} de ${total.toLocaleString()} efectivos`
      },
      {
        pilar: '2. Retención Aula',
        pilarFull: 'Retención en Aula (OJT / D1)',
        'Desempeño Real': parseFloat(pilar2.toFixed(1)),
        'Meta Base (80%)': 80,
        detalle: `${ojt.toLocaleString()} de ${d1.toLocaleString()} a OJT`
      },
      {
        pilar: '3. Rendimiento OJT',
        pilarFull: 'Rendimiento en Nesting (I-OP / OJT)',
        'Desempeño Real': parseFloat(pilar3.toFixed(1)),
        'Meta Base (80%)': 80,
        detalle: `${iop.toLocaleString()} de ${ojt.toLocaleString()} graduados`
      },
      {
        pilar: '4. Cobertura Meta',
        pilarFull: 'Cobertura de Requerimiento (I-OP / RQ)',
        'Desempeño Real': parseFloat(pilar4.toFixed(1)),
        'Meta Base (80%)': 80,
        detalle: `${iop.toLocaleString()} de ${rq.toLocaleString()} FTEs`
      },
      {
        pilar: '5. Estabilidad',
        pilarFull: 'Estabilidad Operativa (100% - Bajas)',
        'Desempeño Real': parseFloat(pilar5.toFixed(1)),
        'Meta Base (80%)': 80,
        detalle: `${(100 - pctDesercion).toFixed(1)}% libre de deserción`
      }
    ];
  }, [kpis]);

  // Datos para Gráfico Radial / Polar de Cumplimiento con porcentaje exacto
  const radialData = useMemo(() => {
    return segmentData.map(s => ({
      name: s.segmento.replace('CLARO PERU ', '').replace('CLARO ', ''),
      fullName: s.segmento,
      cumplimiento: s.cumplRq,
      iop: s.iop,
      rq: s.rq,
      fill: s.fill
    })).sort((a, b) => b.cumplimiento - a.cumplimiento);
  }, [segmentData]);

  // Exportar matriz a Excel
  const handleExport = () => {
    if (filteredData.length === 0) return;
    const ws = XLSX.utils.json_to_sheet(filteredData.map(d => {
      const desertores = Math.max(0, (d.asistio_dia1 || 0) - (d.activos_actuales || 0) - (d.ingresos_iop || 0));
      const req = d.requerimiento || d.rq_solicitado || 0;
      const pctCumpl = req > 0 ? `${Math.round(((d.ingresos_iop || 0) / req) * 100)}%` : '0%';

      return {
        'Periodo': d.periodo,
        'Semana': d.semana,
        'Formador': d.formador || 'Sin Asignar',
        'Última Asistencia': d.ultima_fecha_asistencia || '-',
        'Segmento': normalizeSegmento(d.segmento, d.campana),
        'Campaña': d.campana,
        'Grupo (GPE)': d.grupo_codigo,
        'Fecha Inicio OJT': d.fecha_inicio_ojt,
        'RQ Solicitado': req,
        'Total Nómina': d.total_nomina,
        'Asistió Día 1 (Efectivo)': d.asistio_dia1,
        'Activos en OJT': d.activos_ojt,
        'Pases I-OP (Operación)': d.ingresos_iop,
        'Activos en Tránsito': Math.max(0, (d.activos_ojt || 0) - (d.ingresos_iop || 0)),
        'Desertores Formación': desertores,
        '% Cumplimiento RQ': pctCumpl
      };
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Resumen Dotacion');
    XLSX.writeFile(wb, `Resumen_Dotacion_Ejecutivo_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div className="space-y-6 pb-12 animate-fade-in">
      {/* ── HEADER SUPERIOR Y BARRA DE FILTROS ── */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-[var(--surface)] p-4 rounded-2xl border border-[var(--border-subtle)] shadow-lg backdrop-blur-md">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500/20 to-indigo-500/20 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <Activity className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h1 className="text-xl font-black tracking-tight text-[var(--text-primary)] flex items-center gap-2">
                RESUMEN CAPACITACIÓN & DOTACIÓN
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-bold">
                  Panel Gerencial
                </span>
              </h1>
              <p className="text-xs text-[var(--text-secondary)] font-medium">
                Auditoría ejecutiva de conversión, retención y cumplimiento de metas operativas (882 cohortes)
              </p>
            </div>
          </div>
        </div>

        {/* Controles de Vista y Exportación */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Tabs Dashboard / Matriz */}
          <div className="flex items-center p-1 bg-[var(--surface-elevated)] rounded-xl border border-[var(--border-subtle)]">
            <button
              onClick={() => setActiveTab('DASHBOARD')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'DASHBOARD'
                  ? 'bg-gradient-to-r from-cyan-500 to-indigo-600 text-white shadow-md'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <PieIcon className="w-3.5 h-3.5" />
              DASHBOARD
            </button>
            <button
              onClick={() => setActiveTab('MATRIZ_TABLA')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'MATRIZ_TABLA'
                  ? 'bg-gradient-to-r from-cyan-500 to-indigo-600 text-white shadow-md'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <TableIcon className="w-3.5 h-3.5" />
              MATRIZ DETALLADA ({filteredData.length})
            </button>
          </div>

          <button
            onClick={() => loadData(true)}
            disabled={loading || isRefreshing}
            className="p-2 rounded-xl bg-[var(--surface-elevated)] hover:bg-[var(--surface-hover)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all"
            title="Refrescar datos"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-cyan-400' : ''}`} />
          </button>

          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-bold transition-all shadow-sm"
          >
            <Download className="w-4 h-4" />
            Excel
          </button>
        </div>
      </div>

      {/* ── BARRA DE FILTROS CRUZADOS ── */}
      <div className="bg-[var(--surface)] p-3.5 rounded-2xl border border-[var(--border-subtle)] flex flex-wrap items-center gap-3">
        {/* Periodo */}
        <div className="flex-1 min-w-[130px]">
          <label className="text-[10px] font-black text-[var(--text-muted)] tracking-wider uppercase block mb-1">Periodo</label>
          <select
            value={filters.periodo}
            onChange={(e) => setFilters(f => ({ ...f, periodo: e.target.value, semana: 'Todas', campana: 'Todas', grupo: 'Todos' }))}
            className="w-full bg-[var(--surface-elevated)] border border-[var(--border-subtle)] rounded-xl px-3 py-1.5 text-xs text-[var(--text-primary)] focus:border-cyan-500 outline-none"
          >
            <option value="Todos">Todos</option>
            {filterOptions.periodos.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>

        {/* Semana */}
        <div className="flex-1 min-w-[130px]">
          <label className="text-[10px] font-black text-[var(--text-muted)] tracking-wider uppercase block mb-1">Semana</label>
          <select
            value={filters.semana}
            onChange={(e) => setFilters(f => ({ ...f, semana: e.target.value, campana: 'Todas', grupo: 'Todos' }))}
            className="w-full bg-[var(--surface-elevated)] border border-[var(--border-subtle)] rounded-xl px-3 py-1.5 text-xs text-[var(--text-primary)] focus:border-cyan-500 outline-none"
          >
            <option value="Todas">Todas</option>
            {filterOptions.semanas.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        {/* Segmento */}
        <div className="flex-1 min-w-[170px]">
          <label className="text-[10px] font-black text-[var(--text-muted)] tracking-wider uppercase block mb-1">Segmento</label>
          <select
            value={filters.segmento}
            onChange={(e) => setFilters(f => ({ ...f, segmento: e.target.value, campana: 'Todas', grupo: 'Todos' }))}
            className="w-full bg-[var(--surface-elevated)] border border-[var(--border-subtle)] rounded-xl px-3 py-1.5 text-xs text-[var(--text-primary)] focus:border-cyan-500 outline-none"
          >
            <option value="Todos">Todos los Segmentos</option>
            {filterOptions.segmentos.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        {/* Campaña */}
        <div className="flex-1 min-w-[160px]">
          <label className="text-[10px] font-black text-[var(--text-muted)] tracking-wider uppercase block mb-1">Campaña</label>
          <select
            value={filters.campana}
            onChange={(e) => setFilters(f => ({ ...f, campana: e.target.value, grupo: 'Todos' }))}
            className="w-full bg-[var(--surface-elevated)] border border-[var(--border-subtle)] rounded-xl px-3 py-1.5 text-xs text-[var(--text-primary)] focus:border-cyan-500 outline-none"
          >
            <option value="Todas">Todas</option>
            {filterOptions.campanas.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        {/* Búsqueda rápida */}
        <div className="flex-1 min-w-[180px]">
          <label className="text-[10px] font-black text-[var(--text-muted)] tracking-wider uppercase block mb-1">Buscar Cohorte</label>
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              type="text"
              placeholder="GPE, campaña..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[var(--surface-elevated)] border border-[var(--border-subtle)] rounded-xl pl-8 pr-3 py-1.5 text-xs text-[var(--text-primary)] focus:border-cyan-500 outline-none"
            />
          </div>
        </div>

        {hasActiveFilters && (
          <div className="self-end">
            <button
              onClick={handleResetFilters}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs font-bold transition-all"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Limpiar
            </button>
          </div>
        )}
      </div>

      {loading ? (
        <ViewLoadingSkeleton />
      ) : error ? (
        <div className="bg-rose-500/10 border border-rose-500/30 p-6 rounded-2xl text-center text-rose-400">
          <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-80" />
          <p className="font-bold">{error}</p>
        </div>
      ) : activeTab === 'DASHBOARD' ? (
        <>
          {/* ═══════════════════════════════════════════════════════════════════ */}
          {/* NIVEL 1: SCORECARD EJECUTIVO (4 KPIS ESTRATÉGICOS NO REDUNDANTES)  */}
          {/* ═══════════════════════════════════════════════════════════════════ */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* KPI 1: TENDENCIA VS PERIODO ANTERIOR */}
            <div className="relative overflow-hidden bg-gradient-to-br from-[var(--surface)] via-[var(--surface-elevated)] to-indigo-950/20 p-5 rounded-2xl border border-indigo-500/25 shadow-lg group hover:border-indigo-500/50 transition-all">
              <div className="absolute top-0 right-0 w-28 h-28 bg-indigo-500/10 rounded-full blur-2xl group-hover:bg-indigo-500/20 transition-all pointer-events-none" />
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] font-black text-indigo-400 tracking-wider uppercase px-2.5 py-0.5 bg-indigo-500/10 rounded-md border border-indigo-500/20 flex items-center gap-1.5">
                  <Activity className="w-3 h-3" />
                  1 · Tendencia
                </span>
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                  kpiTendencia.isPositive ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
                }`}>
                  {kpiTendencia.isPositive ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                </div>
              </div>
              <div className="flex items-baseline gap-2">
                <span className={`text-3xl font-black tracking-tight ${
                  kpiTendencia.isPositive ? 'text-emerald-400' : 'text-rose-400'
                }`}>
                  {kpiTendencia.diffPp} pp
                </span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                  kpiTendencia.isPositive 
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                    : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                }`}>
                  {kpiTendencia.isPositive ? 'Mejora' : 'Caída'}
                </span>
              </div>
              <p className="text-xs font-semibold text-[var(--text-secondary)] mt-1">
                Cumplimiento Actual: <strong className="text-[var(--text-primary)]">{kpiTendencia.currentPct}%</strong>
              </p>
              <div className="mt-4 pt-3 border-t border-[var(--border-subtle)] flex items-center justify-between text-[11px]">
                <span className="text-[var(--text-muted)] truncate max-w-[140px]">{kpiTendencia.prevLabel}:</span>
                <span className="font-bold text-[var(--text-secondary)] font-mono">{kpiTendencia.prevPct}%</span>
              </div>
            </div>

            {/* KPI 2: AGING / ANTIGÜEDAD EN TRÁNSITO */}
            <div className="relative overflow-hidden bg-gradient-to-br from-[var(--surface)] via-[var(--surface-elevated)] to-cyan-950/20 p-5 rounded-2xl border border-cyan-500/25 shadow-lg group hover:border-cyan-500/50 transition-all">
              <div className="absolute top-0 right-0 w-28 h-28 bg-cyan-500/10 rounded-full blur-2xl group-hover:bg-cyan-500/20 transition-all pointer-events-none" />
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] font-black text-cyan-400 tracking-wider uppercase px-2.5 py-0.5 bg-cyan-500/10 rounded-md border border-cyan-500/20 flex items-center gap-1.5">
                  <Clock className="w-3 h-3" />
                  2 · Aging OJT
                </span>
                <div className="w-8 h-8 rounded-lg bg-cyan-500/10 text-cyan-400 flex items-center justify-center">
                  <Hourglass className="w-4 h-4" />
                </div>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-black text-[var(--text-primary)] tracking-tight">
                  {kpiAging.avgDays} <span className="text-lg font-bold text-cyan-400">días</span>
                </span>
                <span className="text-[10px] font-bold text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded-full border border-cyan-500/20">
                  {kpiAging.totalTransito} en aula
                </span>
              </div>
              <p className="text-xs font-semibold text-[var(--text-secondary)] mt-1">
                Permanencia Promedio en Nesting
              </p>
              <div className="mt-4 pt-3 border-t border-[var(--border-subtle)] flex items-center justify-between text-[11px]">
                <span className="text-[var(--text-muted)]">Casos estancados:</span>
                <span className={`font-bold font-mono px-1.5 py-0.2 rounded ${
                  kpiAging.countEstancados > 0 
                    ? 'text-amber-400 bg-amber-500/10 border border-amber-500/20' 
                    : 'text-emerald-400'
                }`}>
                  {kpiAging.countEstancados} (&gt;15d)
                </span>
              </div>
            </div>

            {/* KPI 3: ALERTAS ACTIVAS (SEGMENTOS + FORMADORES) */}
            <div className="relative overflow-hidden bg-gradient-to-br from-[var(--surface)] via-[var(--surface-elevated)] to-rose-950/20 p-5 rounded-2xl border border-rose-500/25 shadow-lg group hover:border-rose-500/50 transition-all">
              <div className="absolute top-0 right-0 w-28 h-28 bg-rose-500/10 rounded-full blur-2xl group-hover:bg-rose-500/20 transition-all pointer-events-none" />
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] font-black text-rose-400 tracking-wider uppercase px-2.5 py-0.5 bg-rose-500/10 rounded-md border border-rose-500/20 flex items-center gap-1.5">
                  <ShieldAlert className="w-3 h-3" />
                  3 · Radar de Riesgo
                </span>
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                  kpiAlertas.totalAlertas > 0 ? 'bg-rose-500/10 text-rose-400 animate-pulse' : 'bg-emerald-500/10 text-emerald-400'
                }`}>
                  <AlertTriangle className="w-4 h-4" />
                </div>
              </div>
              <div className="flex items-baseline gap-2">
                <span className={`text-3xl font-black tracking-tight ${
                  kpiAlertas.totalAlertas > 0 ? 'text-rose-400' : 'text-emerald-400'
                }`}>
                  {kpiAlertas.totalAlertas}
                </span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                  kpiAlertas.totalAlertas > 0 
                    ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' 
                    : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                }`}>
                  {kpiAlertas.totalAlertas === 0 ? 'Controlado' : 'Atención'}
                </span>
              </div>
              <p className="text-xs font-semibold text-[var(--text-secondary)] mt-1">
                Desviaciones en Metas &amp; Deserción
              </p>
              <div className="mt-4 pt-3 border-t border-[var(--border-subtle)] flex items-center justify-between text-[11px]">
                <span className="text-[var(--text-muted)]">
                  {kpiAlertas.countSegBajoMeta} segm. &lt;50%
                </span>
                <span className="font-bold text-amber-400">
                  {kpiAlertas.countFormadoresCriticos} form. &gt;25% deserc.
                </span>
              </div>
            </div>

            {/* KPI 4: PROYECCIÓN DE CIERRE DE MES (RUN-RATE) */}
            <div className="relative overflow-hidden bg-gradient-to-br from-[var(--surface)] via-[var(--surface-elevated)] to-amber-950/20 p-5 rounded-2xl border border-amber-500/25 shadow-lg group hover:border-amber-500/50 transition-all">
              <div className="absolute top-0 right-0 w-28 h-28 bg-amber-500/10 rounded-full blur-2xl group-hover:bg-amber-500/20 transition-all pointer-events-none" />
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] font-black text-amber-400 tracking-wider uppercase px-2.5 py-0.5 bg-amber-500/10 rounded-md border border-amber-500/20 flex items-center gap-1.5">
                  <Target className="w-3 h-3" />
                  4 · Run-Rate Cierre
                </span>
                <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center">
                  <Sparkles className="w-4 h-4" />
                </div>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-black text-[var(--text-primary)] tracking-tight">
                  {kpiProyeccion.iopProyectado.toLocaleString()}
                </span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                  kpiProyeccion.isCloseToTarget 
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                    : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                }`}>
                  {kpiProyeccion.pctProyeccion}% RQ
                </span>
              </div>
              <p className="text-xs font-semibold text-[var(--text-secondary)] mt-1">
                Pases I-OP Estimados al Cierre
              </p>
              <div className="mt-4 pt-3 border-t border-[var(--border-subtle)] flex items-center justify-between text-[11px]">
                <span className="text-[var(--text-muted)]">
                  Día {kpiProyeccion.diasTranscurridos} de {kpiProyeccion.totalDaysInMonth}
                </span>
                <span className="font-bold text-[var(--text-primary)] font-mono">
                  Meta: {kpis.rq_solicitado.toLocaleString()} FTEs
                </span>
              </div>
            </div>
          </div>

          {/* ═══════════════════════════════════════════════════════════════════ */}
          {/* NIVEL 2: EMBUDO DE CONVERSIÓN LINEAL & CUMPLIMIENTO POLAR RADIAL   */}
          {/* ═══════════════════════════════════════════════════════════════════ */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Embudo de Conversión Lineal (7 cols) */}
            <div className="lg:col-span-7 bg-[var(--surface)] p-6 rounded-2xl border border-[var(--border-subtle)] shadow-lg flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-black text-[var(--text-primary)] flex items-center gap-2">
                    <Zap className="w-4 h-4 text-cyan-400" />
                    EMBUDO DE CONVERSIÓN LINEAL (4 ETAPAS)
                  </h3>
                  <span className="text-xs font-bold text-cyan-400">Paso a Paso</span>
                </div>
                <p className="text-xs text-[var(--text-secondary)] mb-6">
                  Monitoreo secuencial de caída y retención neta desde Nómina hasta Pase a Operación
                </p>

                {/* Steps Visuales (Embudo Centrado Sólido y Simétrico) */}
                <div className="space-y-3.5">
                  {funnelData.map((step, idx) => (
                    <div key={step.etapa} className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <span className="font-black text-[var(--text-primary)]">{step.etapa}:</span>
                          <span className="text-[var(--text-secondary)]">{step.nombre}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-black text-[var(--text-primary)] text-sm">{step.valor.toLocaleString()}</span>
                          <span className="font-bold px-2 py-0.5 rounded-md text-[11px]" style={{ backgroundColor: `${step.fill}20`, color: step.fill }}>
                            {step.pct}
                          </span>
                        </div>
                      </div>

                      {/* Barra de Embudo Centrada */}
                      <div className="w-full h-3.5 bg-[var(--surface-elevated)] rounded-full overflow-hidden p-0.5 border border-[var(--border-subtle)] flex items-center justify-center">
                        <div
                          className="h-full rounded-full transition-all duration-700"
                          style={{
                            width: `${kpis.total_nomina > 0 ? (step.valor / kpis.total_nomina) * 100 : 0}%`,
                            backgroundColor: step.fill,
                            boxShadow: `0 0 10px ${step.fill}50`
                          }}
                        />
                      </div>

                      {idx < funnelData.length - 1 && (
                        <div className="flex items-center justify-center my-0.5">
                          <span className="inline-flex items-center gap-1 text-[10px] text-rose-400 font-bold px-2.5 py-0.5 rounded-full bg-rose-500/10 border border-rose-500/20">
                            ↓ {funnelData[idx + 1].drop}
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-[var(--border-subtle)] flex items-center justify-between text-xs text-[var(--text-secondary)]">
                <span>Total Evaluados: <strong className="text-[var(--text-primary)]">{kpis.total_nomina.toLocaleString()}</strong></span>
                <span>Graduación Exitosa: <strong className="text-amber-400">{kpis.ingresos_iop.toLocaleString()} I-OP</strong></span>
              </div>
            </div>

            {/* Gráfico Coxcomb / Nightingale Rose de Cumplimiento por Segmento (5 cols) */}
            <div className="lg:col-span-5 bg-[var(--surface)] p-6 rounded-2xl border border-[var(--border-subtle)] shadow-lg flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-sm font-black text-[var(--text-primary)]">
                    Cumplimiento por Segmento
                  </h3>
                  <span className="text-[11px] font-semibold text-[var(--text-muted)]">
                    % Meta vs Requerido
                  </span>
                </div>
                <p className="text-xs text-[var(--text-secondary)] mb-4">
                  Visualización polar de área de pases I-OP vs requerimiento solicitado
                </p>

                {/* Nightingale Rose / Coxcomb SVG Chart */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 py-2">
                  <div className="relative w-[240px] h-[240px] flex items-center justify-center flex-shrink-0">
                    <svg viewBox="0 0 260 260" className="w-full h-full overflow-visible">
                      <defs>
                        <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                          <feGaussianBlur stdDeviation="3" result="blur" />
                          <feComposite in="SourceGraphic" in2="blur" operator="over" />
                        </filter>
                      </defs>

                      {/* Concentric Polar Grid Rings */}
                      {[35, 60, 85, 110].map((radius, i) => (
                        <circle
                          key={i}
                          cx="130"
                          cy="130"
                          r={radius}
                          fill="none"
                          stroke="var(--border-subtle)"
                          strokeWidth="1"
                          strokeDasharray={i === 3 ? "none" : "3 3"}
                          opacity={0.6}
                        />
                      ))}

                      {/* Concentric Axis Crosshairs */}
                      <line x1="130" y1="20" x2="130" y2="240" stroke="var(--border-subtle)" strokeWidth="0.8" opacity="0.3" />
                      <line x1="20" y1="130" x2="240" y2="130" stroke="var(--border-subtle)" strokeWidth="0.8" opacity="0.3" />

                      {/* 5 Polar Wedges */}
                      {(() => {
                        const maxVal = Math.max(...segmentData.map(s => s.cumplRq), 1);
                        const SECTORS = [
                          { key: 'CLARO CHILE', label: 'Claro Chile', fill: '#2563EB', stroke: '#60A5FA', startAngle: -90, endAngle: -18 },
                          { key: 'CLARO PERU RETENCIONES', label: 'Claro Retenc.', fill: '#059669', stroke: '#34D399', startAngle: -18, endAngle: 54 },
                          { key: 'LIPIGAS', label: 'Lipigas', fill: '#7C3AED', stroke: '#A78BFA', startAngle: 54, endAngle: 126 },
                          { key: 'CLARO PERU', label: 'Claro Perú', fill: '#BE123C', stroke: '#FB7185', startAngle: 126, endAngle: 198 },
                          { key: 'CLARO PERU OUT', label: 'Claro Out', fill: '#D97706', stroke: '#FBBF24', startAngle: 198, endAngle: 270 }
                        ];

                        return SECTORS.map(sec => {
                          const segItem = segmentData.find(s => s.segmento === sec.key) || { cumplRq: 0, iop: 0, rq: 0 };
                          const val = segItem.cumplRq || 0;
                          
                          // Radius scale: min 36px up to 115px
                          const radius = 36 + (val / maxVal) * 76;
                          const cx = 130;
                          const cy = 130;

                          const startRad = (sec.startAngle * Math.PI) / 180;
                          const endRad = (sec.endAngle * Math.PI) / 180;
                          const x1 = cx + radius * Math.cos(startRad);
                          const y1 = cy + radius * Math.sin(startRad);
                          const x2 = cx + radius * Math.cos(endRad);
                          const y2 = cy + radius * Math.sin(endRad);
                          const largeArc = (sec.endAngle - sec.startAngle) > 180 ? 1 : 0;
                          const pathD = `M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`;

                          return (
                            <g key={sec.key} className="group transition-all duration-300 cursor-pointer">
                              <path
                                d={pathD}
                                fill={sec.fill}
                                fillOpacity={0.75}
                                stroke={sec.stroke}
                                strokeWidth="1.8"
                                className="hover:fill-opacity-95 transition-all duration-300 hover:filter-[url(#glow)]"
                              />
                            </g>
                          );
                        });
                      })()}
                    </svg>
                  </div>

                  {/* Leyenda Lateral con colores exactos a la imagen */}
                  <div className="flex flex-col gap-2.5 w-full sm:w-auto pr-2">
                    {[
                      { label: 'Claro Chile', fill: '#2563EB', stroke: '#60A5FA', key: 'CLARO CHILE' },
                      { label: 'Claro Retenc.', fill: '#059669', stroke: '#34D399', key: 'CLARO PERU RETENCIONES' },
                      { label: 'Lipigas', fill: '#7C3AED', stroke: '#A78BFA', key: 'LIPIGAS' },
                      { label: 'Claro Perú', fill: '#BE123C', stroke: '#FB7185', key: 'CLARO PERU' },
                      { label: 'Claro Out', fill: '#D97706', stroke: '#FBBF24', key: 'CLARO PERU OUT' }
                    ].map(leg => {
                      const segItem = segmentData.find(s => s.segmento === leg.key) || { cumplRq: 0, iop: 0, rq: 0 };
                      return (
                        <div key={leg.label} className="flex items-center justify-between sm:justify-start gap-3 text-xs">
                          <div className="flex items-center gap-2">
                            <span 
                              className="w-3.5 h-3.5 rounded-full border border-white/20 flex-shrink-0" 
                              style={{ backgroundColor: leg.fill }}
                            />
                            <span className="font-medium text-[var(--text-secondary)]">{leg.label}</span>
                          </div>
                          <span className="font-bold text-[var(--text-primary)] font-mono ml-auto">
                            {segItem.cumplRq}%
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-[var(--border-subtle)] flex items-center justify-between text-[11px] text-[var(--text-muted)]">
                <span>Eje radial normalizado</span>
                <span>Proporcional a RQ</span>
              </div>
            </div>
          </div>

          {/* ═══════════════════════════════════════════════════════════════════ */}
          {/* NIVEL 3: RADAR NORMALIZADO (0-100%) & TABLA EJECUTIVA POR SEGMENTO */}
          {/* ═══════════════════════════════════════════════════════════════════ */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Radar de Calidad Gerencial (5 Pilares vs Meta 80%) (5 cols) */}
            <div className="lg:col-span-5 bg-[var(--surface)] p-6 rounded-2xl border border-[var(--border-subtle)] shadow-lg flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-black text-[var(--text-primary)] flex items-center gap-2">
                    <Compass className="w-4 h-4 text-cyan-400" />
                    RADAR DE CALIDAD GERENCIAL
                  </h3>
                  <span className="text-[11px] font-bold text-cyan-400 px-2 py-0.5 rounded-md bg-cyan-500/10 border border-cyan-500/20">
                    {filters.segmento === 'Todos' ? 'Global Operación' : filters.segmento}
                  </span>
                </div>
                <p className="text-xs text-[var(--text-secondary)] mb-4">
                  Diagnóstico multidimensional en 5 pilares operativos contrastados contra la <strong>Meta Estándar del 80%</strong>
                </p>

                <div className="h-[280px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart cx="50%" cy="50%" outerRadius="75%" data={radarData}>
                      <PolarGrid stroke="var(--border-subtle)" />
                      <PolarAngleAxis 
                        dataKey="pilar" 
                        tick={{ fill: 'var(--text-secondary)', fontSize: 10, fontWeight: 'bold' }} 
                      />
                      <PolarRadiusAxis 
                        angle={30} 
                        domain={[0, 100]} 
                        tick={{ fill: 'var(--text-muted)', fontSize: 9 }}
                        stroke="var(--border-subtle)"
                      />
                      <Radar 
                        name="Meta Base (80%)" 
                        dataKey="Meta Base (80%)" 
                        stroke="#F59E0B" 
                        strokeDasharray="4 4"
                        strokeWidth={1.5}
                        fill="#F59E0B" 
                        fillOpacity={0.06} 
                      />
                      <Radar 
                        name="Desempeño Real (%)" 
                        dataKey="Desempeño Real" 
                        stroke="#00E5FF" 
                        strokeWidth={2.5}
                        fill="#00E5FF" 
                        fillOpacity={0.35} 
                      />
                      <Legend 
                        wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }}
                      />
                      <RechartsTooltip
                        content={({ payload }) => {
                          if (!payload || !payload.length) return null;
                          const d = payload[0].payload;
                          const isAbove = d['Desempeño Real'] >= 80;
                          return (
                            <div className="bg-[var(--surface-elevated)] p-3.5 rounded-xl border border-[var(--border-subtle)] shadow-xl text-xs space-y-1.5">
                              <p className="font-black text-[var(--text-primary)] border-b border-[var(--border-subtle)] pb-1">{d.pilarFull}</p>
                              <div className="flex items-center justify-between gap-4">
                                <span className="text-[var(--text-secondary)]">Desempeño Real:</span>
                                <span className={`font-black font-mono ${isAbove ? 'text-emerald-400' : 'text-amber-400'}`}>
                                  {d['Desempeño Real']}%
                                </span>
                              </div>
                              <div className="flex items-center justify-between gap-4 text-[11px] text-[var(--text-muted)]">
                                <span>Meta Benchmark:</span>
                                <span className="font-mono text-amber-400/80">80.0%</span>
                              </div>
                              <p className="text-[10px] text-cyan-400/90 pt-0.5 border-t border-[var(--border-subtle)] font-medium">
                                {d.detalle}
                              </p>
                            </div>
                          );
                        }}
                      />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Matriz Ejecutiva de Dotación por Segmento (7 cols) */}
            <div className="lg:col-span-7 bg-[var(--surface)] p-6 rounded-2xl border border-[var(--border-subtle)] shadow-lg flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-black text-[var(--text-primary)] flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-cyan-400" />
                    DESGLOSE OFICIAL DE DOTACIÓN POR SEGMENTO
                  </h3>
                  <span className="text-xs font-bold text-cyan-400">5 Segmentos</span>
                </div>
                <p className="text-xs text-[var(--text-secondary)] mb-4">
                  Cuadre matemático exacto de las 5 columnas oficiales contra el Scorecard
                </p>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-[var(--border-subtle)] text-[10px] uppercase font-black text-[var(--text-muted)] tracking-wider">
                        <th className="py-2.5 px-3">Segmento</th>
                        <th className="py-2.5 px-2 text-right">1. RQ</th>
                        <th className="py-2.5 px-2 text-right">2. Nómina</th>
                        <th className="py-2.5 px-2 text-right">3. Día 1</th>
                        <th className="py-2.5 px-2 text-right">4. OJT</th>
                        <th className="py-2.5 px-2 text-right">5. I-OP</th>
                        <th className="py-2.5 px-2 text-right">% Cumpl.</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border-subtle)]">
                      {segmentData.map(s => (
                        <tr key={s.segmento} className="hover:bg-[var(--surface-hover)] transition-colors font-medium">
                          <td className="py-3 px-3">
                            <div className="flex items-center gap-2">
                              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.fill }} />
                              <div>
                                <span className="font-bold text-[var(--text-primary)] block">{s.segmento}</span>
                                <span className="text-[10px] text-[var(--text-muted)]">{s.grupos} cohortes</span>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-2 text-right text-[var(--text-secondary)] font-mono">{s.rq.toLocaleString()}</td>
                          <td className="py-3 px-2 text-right text-sky-400 font-mono font-bold">{s.reclutados.toLocaleString()}</td>
                          <td className="py-3 px-2 text-right text-indigo-400 font-mono font-bold">{s.d1.toLocaleString()}</td>
                          <td className="py-3 px-2 text-right text-teal-400 font-mono font-bold">
                            {s.ojt.toLocaleString()}
                            {s.enTransito > 0 && (
                              <span className="block text-[9px] text-[var(--text-muted)]">({s.enTransito} tráns.)</span>
                            )}
                          </td>
                          <td className="py-3 px-2 text-right text-amber-400 font-mono font-black">{s.iop.toLocaleString()}</td>
                          <td className="py-3 px-2 text-right font-black">
                            <span className={`px-2 py-0.5 rounded-md text-[10px] ${
                              s.cumplRq >= 50 
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                                : s.cumplRq >= 10 
                                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                            }`}>
                              {s.cumplRq}%
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-[var(--border-subtle)] bg-[var(--surface-elevated)] font-black text-xs">
                        <td className="py-3 px-3 text-[var(--text-primary)]">TOTAL SCORECARD</td>
                        <td className="py-3 px-2 text-right text-[var(--text-primary)] font-mono">{kpis.rq_solicitado.toLocaleString()}</td>
                        <td className="py-3 px-2 text-right text-sky-400 font-mono">{kpis.total_nomina.toLocaleString()}</td>
                        <td className="py-3 px-2 text-right text-indigo-400 font-mono">{kpis.asistio_dia1.toLocaleString()}</td>
                        <td className="py-3 px-2 text-right text-teal-400 font-mono">{kpis.activos_ojt.toLocaleString()}</td>
                        <td className="py-3 px-2 text-right text-amber-400 font-mono">{kpis.ingresos_iop.toLocaleString()}</td>
                        <td className="py-3 px-2 text-right text-cyan-400">{kpiPercentages.cumplimiento_rq}%</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </>
      ) : (
        /* ═══════════════════════════════════════════════════════════════════ */
        /* PESTAÑA: MATRIZ DETALLADA POR GRUPO / COHORTE                       */
        /* ═══════════════════════════════════════════════════════════════════ */
        <div className="bg-[var(--surface)] p-6 rounded-2xl border border-[var(--border-subtle)] shadow-lg space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-black text-[var(--text-primary)]">MATRIZ OPERATIVA POR COHORTE (AULAS)</h3>
              <p className="text-xs text-[var(--text-secondary)]">Detalle individual por código de grupo y formador asignado</p>
            </div>
            <span className="text-xs font-bold text-[var(--text-muted)]">{filteredData.length} grupos filtrados</span>
          </div>

          <div className="overflow-x-auto max-h-[600px] border border-[var(--border-subtle)] rounded-xl">
            <table className="w-full text-left text-xs relative">
              <thead className="bg-[var(--surface-elevated)] sticky top-0 z-10 text-[10px] uppercase font-black text-[var(--text-muted)] tracking-wider border-b border-[var(--border-subtle)]">
                <tr>
                  <th className="py-3 px-3">Grupo / GPE</th>
                  <th className="py-3 px-3">Formador a Cargo</th>
                  <th className="py-3 px-3">Campaña</th>
                  <th className="py-3 px-3">Segmento</th>
                  <th className="py-3 px-2 text-center">Semana</th>
                  <th className="py-3 px-3 text-center">Últ. Asistencia</th>
                  <th className="py-3 px-2 text-right">RQ</th>
                  <th className="py-3 px-2 text-right">Nómina</th>
                  <th className="py-3 px-2 text-right">Día 1</th>
                  <th className="py-3 px-2 text-right">OJT</th>
                  <th className="py-3 px-2 text-right">I-OP</th>
                </tr>
              </thead>
              <tbody key={`matrix_${filters.periodo}_${filters.semana}_${filters.segmento}_${filters.campana}_${filters.grupo}_${searchQuery}`} className="divide-y divide-[var(--border-subtle)]">
                {filteredData.map((d, i) => {
                  const req = d.requerimiento || d.rq_solicitado || 0;

                  return (
                    <tr key={`${d.grupo_codigo}_${d.campana}_${i}`} className="hover:bg-[var(--surface-hover)] transition-colors font-medium">
                      <td className="py-2.5 px-3 font-mono font-bold text-cyan-400 whitespace-nowrap">{d.grupo_codigo}</td>
                      <td className="py-2.5 px-3 text-[var(--text-primary)] font-semibold truncate max-w-[170px]" title={d.formador}>
                        {d.formador && d.formador !== 'Sin Asignar' ? (
                          <span className="text-[var(--text-primary)]">{d.formador}</span>
                        ) : (
                          <span className="text-[var(--text-muted)] italic text-[11px]">Sin Asignar</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-[var(--text-secondary)] truncate max-w-[150px]" title={d.campana}>{d.campana}</td>
                      <td className="py-2.5 px-3 text-[var(--text-muted)] whitespace-nowrap">{normalizeSegmento(d.segmento, d.campana)}</td>
                      <td className="py-2.5 px-2 text-center text-[var(--text-muted)] font-mono">{d.semana || '-'}</td>
                      <td className="py-2.5 px-3 text-center font-mono text-[11px] whitespace-nowrap">
                        {d.ultima_fecha_asistencia && d.ultima_fecha_asistencia !== '-' ? (
                          <span className="px-2 py-0.5 rounded-md bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-bold">
                            {d.ultima_fecha_asistencia}
                          </span>
                        ) : (
                          <span className="text-[var(--text-muted)] italic">-</span>
                        )}
                      </td>
                      <td className="py-2.5 px-2 text-right font-mono text-[var(--text-secondary)]">{req}</td>
                      <td className="py-2.5 px-2 text-right font-mono text-sky-400 font-bold">{d.total_nomina}</td>
                      <td className="py-2.5 px-2 text-right font-mono text-indigo-400 font-bold">{d.asistio_dia1}</td>
                      <td className="py-2.5 px-2 text-right font-mono text-teal-400 font-bold">{d.activos_ojt}</td>
                      <td className="py-2.5 px-2 text-right font-mono text-amber-400 font-black">{d.ingresos_iop}</td>
                    </tr>
                  );
                })}
                {filteredData.length === 0 && (
                  <tr>
                    <td colSpan={11} className="py-12 text-center text-[var(--text-muted)]">
                      <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-40 text-cyan-400" />
                      <p className="font-bold text-xs">No hay cohortes que coincidan con los filtros seleccionados.</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
