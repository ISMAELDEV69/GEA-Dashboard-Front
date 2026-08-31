import React, { useState, useEffect, useMemo, useCallback } from 'react';
import SemicircleGauge from './dashboard/SemicircleGauge';
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
  const [rankingTab, setRankingTab] = useState('DOTACION_SEG'); // 'DOTACION_SEG' | 'DESERCION_SEG' | 'DOTACION_FOR' | 'DESERCION_FOR'
  const [rankingFormadorFilter, setRankingFormadorFilter] = useState('Todas');
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
    
    // 1. Periodos (Periodo de Ingreso a Operación)
    const periodos = new Set(dataset.map(g => {
      const pVal = g.periodo_ingreso_op || g.periodo;
      return pVal ? String(pVal).trim() : null;
    }).filter(Boolean));
    
    // 2. Semanas (filtradas por periodo activo)
    const subSemanas = dataset.filter(g => {
      const pVal = g.periodo_ingreso_op || g.periodo;
      return filters.periodo === 'Todos' || String(pVal || '').trim() === String(filters.periodo || '').trim();
    });
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
      // Filtro Periodo (Periodo de Ingreso a Operación)
      const pVal = d.periodo_ingreso_op || d.periodo;
      if (filters.periodo !== 'Todos' && String(pVal || '').trim() !== String(filters.periodo || '').trim()) {
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
      const desertores = Math.max(0, s.d1 - (s.ojt || 0) - (s.iop || 0));
      const pctDesercion = s.d1 > 0 ? ((desertores / s.d1) * 100) : 0;
      const enTransito = Math.max(0, s.ojt - s.iop);

      return {
        ...s,
        convD1: parseFloat(convD1.toFixed(1)),
        retOjt: parseFloat(retOjt.toFixed(1)),
        convIop: parseFloat(convIop.toFixed(1)),
        cumplRq: parseFloat(cumplRq.toFixed(1)),
        pctDesercion: parseFloat(pctDesercion.toFixed(1)),
        desertores,
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

  // ── 1. KPI SUPERIOR: CANTIDAD DE GRUPOS / COHORTES ──
  const kpiGrupos = useMemo(() => {
    const total = filteredData.length;
    const gruposConOjt = filteredData.filter(d => (d.activos_ojt || 0) > (d.ingresos_iop || 0)).length;
    const formadoresUnicos = new Set(filteredData.map(d => d.formador).filter(Boolean)).size;
    const segmentosUnicos = new Set(filteredData.map(d => normalizeSegmento(d.segmento, d.campana)).filter(Boolean)).size;

    return {
      total,
      gruposConOjt,
      formadoresUnicos,
      segmentosUnicos
    };
  }, [filteredData]);

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

  // ── 5. DATOS PARA GAUGE Y RANKINGS ESTILO POWERBI ──
  const executiveGaugesData = useMemo(() => {
    const total = kpis.total_nomina || 0;
    const d1 = kpis.asistio_dia1 || 0;
    const rq = kpis.rq_solicitado || 0;
    const iop = kpis.ingresos_iop || 0;
    const ojt = kpis.activos_ojt || 0;
    const desertoresOjt = kpis.desertores_ojt || 0;
    
    // 1. Deserción Global
    const desertoresTotal = Math.max(0, d1 - (kpis.activos_actuales || 0) - iop);
    const pctDesercionGlobal = d1 > 0 ? (desertoresTotal / d1) * 100 : 0;

    // 2. Deserción CT (Aula / Capacitación Teórica)
    const desertoresCT = Math.max(0, d1 - ojt - iop - desertoresOjt);
    const pctDesercionCT = d1 > 0 ? (desertoresCT / d1) * 100 : 0;

    // 3. Dotación FTEs
    const pctDotacion = rq > 0 ? (iop / rq) * 100 : (iop > 0 ? 100 : 0);

    // 4. Deserción OJT
    const qIniciaOjt = ojt + iop + desertoresOjt;
    const pctDesercionOJT = qIniciaOjt > 0 ? (desertoresOjt / qIniciaOjt) * 100 : 0;

    const formatNum = (n) => {
      const num = Number(n) || 0;
      if (num >= 1000) return `${(num / 1000).toFixed(2).replace('.', ',')} mil`;
      return num.toLocaleString('es-PE');
    };

    return {
      desercionGlobal: {
        value: parseFloat(pctDesercionGlobal.toFixed(2)),
        target: 43.40,
        subMetrics: [
          { label: 'Q Día 1', value: d1.toLocaleString('es-PE') },
          { label: 'Desertores', value: desertoresTotal.toLocaleString('es-PE') }
        ]
      },
      desercionCT: {
        value: parseFloat(pctDesercionCT.toFixed(2)),
        target: 20.00,
        subMetrics: [
          { label: 'Q Día 1', value: d1.toLocaleString('es-PE') },
          { label: 'Desertores CT', value: desertoresCT.toLocaleString('es-PE') }
        ]
      },
      dotacion: {
        value: parseFloat(pctDotacion.toFixed(2)),
        target: 80.00,
        subMetrics: [
          { label: "RQ FTE's", value: formatNum(rq) },
          { label: "Dotación FTE's", value: formatNum(iop) }
        ]
      },
      desercionOJT: {
        value: parseFloat(pctDesercionOJT.toFixed(2)),
        target: 20.00,
        subMetrics: [
          { label: 'Q Inicia OJT', value: formatNum(qIniciaOjt) },
          { label: 'DESERTORES_OJT', value: formatNum(desertoresOjt) }
        ]
      }
    };
  }, [kpis]);

  const formadoresRankingList = useMemo(() => {
    const map = new Map();
    filteredData.forEach(g => {
      const fName = String(g.formador || 'SIN ASIGNAR').trim().toUpperCase();
      if (!map.has(fName)) {
        map.set(fName, {
          nombre: fName,
          rq: 0,
          d1: 0,
          iop: 0,
          activosOjt: 0,
          desertores: 0
        });
      }
      const item = map.get(fName);
      item.rq += Number(g.rq_solicitado || g.rq_ftes_solicitado) || 0;
      item.d1 += Number(g.asistio_dia1) || 0;
      item.iop += Number(g.ingresos_iop) || 0;
      item.activosOjt += Number(g.activos_ojt) || 0;
      
      const desert = Math.max(0, (g.asistio_dia1 || 0) - (g.activos_actuales || 0) - (g.ingresos_iop || 0));
      item.desertores += desert;
    });

    return Array.from(map.values()).map(f => {
      const pctDot = f.rq > 0 ? (f.iop / f.rq) * 100 : (f.d1 > 0 ? (f.iop / f.d1) * 100 : 0);
      const pctDes = f.d1 > 0 ? (f.desertores / f.d1) * 100 : 0;
      return {
        ...f,
        pctDotacion: parseFloat(pctDot.toFixed(2)),
        pctDesercion: parseFloat(pctDes.toFixed(2))
      };
    });
  }, [filteredData]);

  const modalidadRankingList = useMemo(() => {
    const map = {
      PRESENCIAL: { nombre: 'PRESENCIAL', rq: 0, d1: 0, iop: 0, desertores: 0 },
      REMOTO: { nombre: 'REMOTO', rq: 0, d1: 0, iop: 0, desertores: 0 }
    };

    filteredData.forEach(g => {
      const mod = String(g.modalidad || '').toUpperCase().includes('REM') ? 'REMOTO' : 'PRESENCIAL';
      const target = map[mod];
      target.rq += Number(g.rq_solicitado || g.rq_ftes_solicitado) || 0;
      target.d1 += Number(g.asistio_dia1) || 0;
      target.iop += Number(g.ingresos_iop) || 0;
      const desert = Math.max(0, (g.asistio_dia1 || 0) - (g.activos_actuales || 0) - (g.ingresos_iop || 0));
      target.desertores += desert;
    });

    return Object.values(map).map(m => {
      const pctDot = m.rq > 0 ? (m.iop / m.rq) * 100 : (m.d1 > 0 ? (m.iop / m.d1) * 100 : 0);
      const pctDes = m.d1 > 0 ? (m.desertores / m.d1) * 100 : 0;
      return {
        ...m,
        pctDotacion: parseFloat(pctDot.toFixed(2)),
        pctDesercion: parseFloat(pctDes.toFixed(2))
      };
    });
  }, [filteredData]);

  const activeRankingBars = useMemo(() => {
    let list = [];
    if (rankingTab === 'DOTACION_SEG') {
      list = segmentData.map(s => {
        const val = Number(s.cumplRq) || 0;
        return {
          label: s.segmento,
          value: val,
          displayVal: `${val.toFixed(2)} %`,
          isDesercion: false
        };
      }).sort((a, b) => b.value - a.value);
    } else if (rankingTab === 'DESERCION_SEG') {
      list = segmentData.map(s => {
        const val = Number(s.pctDesercion) || 0;
        return {
          label: s.segmento,
          value: val,
          displayVal: `${val.toFixed(2)} %`,
          isDesercion: true
        };
      }).sort((a, b) => b.value - a.value);
    } else if (rankingTab === 'DOTACION_FOR') {
      list = formadoresRankingList.map(f => {
        const val = Number(f.pctDotacion) || 0;
        return {
          label: f.nombre,
          value: val,
          displayVal: `${val.toFixed(2)} %`,
          isDesercion: false
        };
      }).sort((a, b) => b.value - a.value);
    } else {
      list = formadoresRankingList.map(f => {
        const val = Number(f.pctDesercion) || 0;
        return {
          label: f.nombre,
          value: val,
          displayVal: `${val.toFixed(2)} %`,
          isDesercion: true
        };
      }).sort((a, b) => b.value - a.value);
    }

    if (rankingFormadorFilter !== 'Todas') {
      list = list.filter(item => item.label.includes(rankingFormadorFilter));
    }
    return list;
  }, [rankingTab, segmentData, formadoresRankingList, rankingFormadorFilter]);

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
            {/* KPI 1: CANTIDAD DE GRUPOS / COHORTES */}
            <div className="relative overflow-hidden bg-gradient-to-br from-[var(--surface)] via-[var(--surface-elevated)] to-indigo-950/20 p-5 rounded-2xl border border-indigo-500/25 shadow-lg group hover:border-indigo-500/50 transition-all">
              <div className="absolute top-0 right-0 w-28 h-28 bg-indigo-500/10 rounded-full blur-2xl group-hover:bg-indigo-500/20 transition-all pointer-events-none" />
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] font-black text-indigo-400 tracking-wider uppercase px-2.5 py-0.5 bg-indigo-500/10 rounded-md border border-indigo-500/20 flex items-center gap-1.5">
                  <Layers className="w-3 h-3" />
                  1 · Cantidad de Grupos
                </span>
                <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center">
                  <Users className="w-4 h-4" />
                </div>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-black text-[var(--text-primary)] tracking-tight">
                  {kpiGrupos.total.toLocaleString()} <span className="text-lg font-bold text-indigo-400">grupos</span>
                </span>
                <span className="text-[10px] font-bold text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-full border border-indigo-500/20">
                  {kpiGrupos.gruposConOjt} en OJT
                </span>
              </div>
              <p className="text-xs font-semibold text-[var(--text-secondary)] mt-1">
                Cohortes Totales Evaluadas
              </p>
              <div className="mt-4 pt-3 border-t border-[var(--border-subtle)] flex items-center justify-between text-[11px]">
                <span className="text-[var(--text-muted)]">{kpiGrupos.formadoresUnicos} Formadores asignados</span>
                <span className="font-bold text-[var(--text-primary)] font-mono">{kpiGrupos.segmentosUnicos} Segmentos</span>
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
          {/* NIVEL 2: EMBUDO A LA IZQUIERDA (5 COLS) + MATRIZ 2X2 TACÓMETROS (7 COLS) */}
          {/* ═══════════════════════════════════════════════════════════════════ */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-stretch">
            
            {/* LADO IZQUIERDO: EMBUDO DE CONVERSIÓN LINEAL (4 ETAPAS) */}
            <div className="xl:col-span-5 bg-[var(--surface)] p-6 rounded-2xl border border-[var(--border-normal)] shadow-md flex flex-col justify-between transition-colors duration-300">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-black text-[var(--text-primary)] flex items-center gap-2">
                    <Zap className="w-4 h-4 text-cyan-400" />
                    EMBUDO DE CONVERSIÓN LINEAL
                  </h3>
                  <span className="text-xs font-bold text-cyan-400 font-mono">4 Etapas</span>
                </div>
                <p className="text-xs text-[var(--text-secondary)] mb-5">
                  Monitoreo secuencial de caída y retención neta desde Nómina hasta Pase a Operación
                </p>

                {/* Steps Visuales en Cascada Vertical apegado a la izquierda */}
                <div className="space-y-3">
                  {funnelData.map((step, idx) => (
                    <div key={step.etapa} className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1.5 truncate max-w-[200px]">
                          <span className="font-black text-[var(--text-primary)]">{step.etapa}:</span>
                          <span className="text-[var(--text-secondary)] truncate">{step.nombre}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-black text-[var(--text-primary)] text-xs font-mono">{step.valor.toLocaleString()}</span>
                          <span className="font-bold px-2 py-0.5 rounded-md text-[10.5px] font-mono" style={{ backgroundColor: `${step.fill}20`, color: step.fill }}>
                            {step.pct}
                          </span>
                        </div>
                      </div>

                      {/* Barra de Embudo */}
                      <div className="w-full h-3 bg-[var(--surface-elevated)] rounded-full overflow-hidden p-0.5 border border-[var(--border-normal)]">
                        <div
                          className="h-full rounded-full transition-all duration-700"
                          style={{
                            width: `${kpis.total_nomina > 0 ? (step.valor / kpis.total_nomina) * 100 : 0}%`,
                            backgroundColor: step.fill,
                            boxShadow: `0 0 10px ${step.fill}60`
                          }}
                        />
                      </div>

                      {idx < funnelData.length - 1 && (
                        <div className="flex items-center justify-center my-0.5">
                          <span className="inline-flex items-center gap-1 text-[10px] text-rose-400 font-bold px-2.5 py-0.5 rounded-full bg-rose-500/10 border border-rose-500/20 font-mono">
                            ↓ {funnelData[idx + 1].drop}
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-[var(--border-normal)] flex flex-wrap items-center justify-between text-xs text-[var(--text-secondary)] gap-2">
                <span>Total Evaluados: <strong className="text-[var(--text-primary)]">{kpis.total_nomina.toLocaleString()}</strong></span>
                <span>Graduación: <strong className="text-amber-400 font-mono">{kpis.ingresos_iop.toLocaleString()} I-OP</strong></span>
              </div>
            </div>

            {/* LADO DERECHO: 4 TACÓMETROS EN MATRIZ DE 2x2 */}
            <div className="xl:col-span-7 bg-[var(--surface)] p-6 rounded-2xl border border-[var(--border-normal)] shadow-md flex flex-col justify-between space-y-4 transition-colors duration-300">
              <div className="flex items-center justify-between border-b border-[var(--border-normal)] pb-3">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 shadow-[0_0_8px_#00E5FF]" />
                  <span className="text-xs font-black uppercase tracking-wider text-[var(--text-primary)]">
                    INDICADORES GLOBALES - CAPACITACIÓN
                  </span>
                </div>
                <span className="text-[11px] font-bold text-[var(--text-muted)] font-mono">
                  Semáforo Dinámico
                </span>
              </div>

              {/* Matriz 2x2 de Tacómetros */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Gauge 1: % Deserción Global */}
                <SemicircleGauge
                  title="% Deserción"
                  value={executiveGaugesData.desercionGlobal.value}
                  target={executiveGaugesData.desercionGlobal.target}
                  type="desercion"
                  subMetrics={executiveGaugesData.desercionGlobal.subMetrics}
                />

                {/* Gauge 2: % Deserción CT */}
                <SemicircleGauge
                  title="% Deserción CT"
                  value={executiveGaugesData.desercionCT.value}
                  target={executiveGaugesData.desercionCT.target}
                  type="desercion"
                  subMetrics={executiveGaugesData.desercionCT.subMetrics}
                />

                {/* Gauge 3: % Dotación */}
                <SemicircleGauge
                  title="% Dotación"
                  value={executiveGaugesData.dotacion.value}
                  target={executiveGaugesData.dotacion.target}
                  type="dotacion"
                  maxVal={100}
                  subMetrics={executiveGaugesData.dotacion.subMetrics}
                />

                {/* Gauge 4: % Deserción OJT */}
                <SemicircleGauge
                  title="% Deserción OJT"
                  value={executiveGaugesData.desercionOJT.value}
                  target={executiveGaugesData.desercionOJT.target}
                  type="desercion"
                  subMetrics={executiveGaugesData.desercionOJT.subMetrics}
                />
              </div>
            </div>

          </div>

          {/* ═══════════════════════════════════════════════════════════════════ */}
          {/* NIVEL 3: PANEL DE RANKINGS Y RENDIMIENTO OPERATIVO                   */}
          {/* ═══════════════════════════════════════════════════════════════════ */}
          <div className="w-full p-5 rounded-2xl bg-[var(--surface-elevated)] border border-[var(--border-normal)] shadow-md space-y-4 transition-colors duration-300">
            {/* Header de Pestañas Toggle */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-normal)] pb-3">
              <span className="text-xs font-black uppercase tracking-wider text-[var(--accent)] bg-[var(--surface)] border border-[var(--border-normal)] px-3 py-1 rounded-lg">
                RANKING Y DESGLOSE OPERATIVO
              </span>

              {/* Botones de Control de Pestañas */}
              <div className="flex flex-wrap items-center gap-1.5 p-1 bg-[var(--surface)] rounded-xl border border-[var(--border-normal)] text-[10.5px] font-black">
                <button
                  type="button"
                  onClick={() => setRankingTab('DOTACION_SEG')}
                  className={`py-1.5 px-3 rounded-lg transition-all text-center cursor-pointer ${
                    rankingTab === 'DOTACION_SEG'
                      ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  DOTACIÓN - SEG.
                </button>
                <button
                  type="button"
                  onClick={() => setRankingTab('DESERCION_SEG')}
                  className={`py-1.5 px-3 rounded-lg transition-all text-center cursor-pointer ${
                    rankingTab === 'DESERCION_SEG'
                      ? 'bg-rose-600 text-white shadow-md shadow-rose-600/30'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  DESERCIÓN - SEG.
                </button>
                <button
                  type="button"
                  onClick={() => setRankingTab('DOTACION_FOR')}
                  className={`py-1.5 px-3 rounded-lg transition-all text-center cursor-pointer ${
                    rankingTab === 'DOTACION_FOR'
                      ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  DOTACIÓN - FOR.
                </button>
                <button
                  type="button"
                  onClick={() => setRankingTab('DESERCION_FOR')}
                  className={`py-1.5 px-3 rounded-lg transition-all text-center cursor-pointer ${
                    rankingTab === 'DESERCION_FOR'
                      ? 'bg-rose-600 text-white shadow-md shadow-rose-600/30'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  DESERCIÓN - FOR.
                </button>
              </div>
            </div>

            {/* Grid 2 columnas: Barras de Ranking a la Izquierda + Rendimiento por Modalidad y Selector a la Derecha */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start pt-1">
              
              {/* Columna Izquierda: Barras de Ranking (7 cols) */}
              <div className="lg:col-span-7 space-y-2.5 max-h-[260px] overflow-y-auto custom-scrollbar pr-2">
                {activeRankingBars.length === 0 ? (
                  <div className="text-center py-6 text-xs text-[var(--text-muted)] font-mono">
                    No hay registros disponibles para este filtro
                  </div>
                ) : (
                  activeRankingBars.map((item, idx) => {
                    const maxVal = Math.max(...activeRankingBars.map(b => b.value), 100);
                    const widthPct = Math.min(100, (item.value / maxVal) * 100);
                    const isDesercion = item.isDesercion;
                    const barColor = isDesercion 
                      ? (item.value > 30 ? '#EF4444' : item.value > 15 ? '#F59E0B' : '#10B981')
                      : (item.value >= 100 ? '#10B981' : item.value >= 80 ? '#F59E0B' : '#EF4444');

                    return (
                      <div key={idx} className="space-y-1">
                        <div className="flex items-center justify-between text-xs font-mono">
                          <span className="font-bold text-[var(--text-primary)] truncate max-w-[240px]" title={item.label}>
                            {item.label}
                          </span>
                          <span className="font-black tabular-nums" style={{ color: barColor }}>
                            {item.displayVal}
                          </span>
                        </div>
                        <div className="w-full h-3 bg-[var(--surface)] rounded-md overflow-hidden p-0.5 border border-[var(--border-normal)]">
                          <div
                            className="h-full rounded-sm transition-all duration-500"
                            style={{
                              width: `${widthPct}%`,
                              backgroundColor: barColor,
                              boxShadow: `0 0 8px ${barColor}60`
                            }}
                          />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Columna Derecha: Rendimiento por Modalidad & Selector de Formador (5 cols) */}
              <div className="lg:col-span-5 bg-[var(--surface)] p-4 rounded-xl border border-[var(--border-normal)] space-y-4">
                {/* Barras de Modalidad (Presencial vs Remoto) */}
                <div className="space-y-2.5">
                  <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider block font-sans">
                    Rendimiento por Modalidad:
                  </span>
                  {modalidadRankingList.map((m) => {
                    const rawVal = rankingTab.includes('DESERCION') ? m.pctDesercion : m.pctDotacion;
                    const val = Number(rawVal) || 0;
                    const isDes = rankingTab.includes('DESERCION');
                    const barColor = isDes 
                      ? (val > 30 ? '#EF4444' : '#10B981')
                      : (val >= 80 ? '#10B981' : '#EF4444');

                    return (
                      <div key={m.nombre} className="space-y-1">
                        <div className="flex items-center justify-between text-[11px] font-mono">
                          <span className="font-bold text-[var(--text-secondary)]">{m.nombre}</span>
                          <span className="font-bold tabular-nums" style={{ color: barColor }}>{val.toFixed(2)} %</span>
                        </div>
                        <div className="w-full h-2.5 bg-[var(--surface-elevated)] rounded-md overflow-hidden p-0.5 border border-[var(--border-normal)]">
                          <div
                            className="h-full rounded-sm transition-all duration-500"
                            style={{
                              width: `${Math.min(100, val)}%`,
                              backgroundColor: barColor
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Selector de Formador */}
                <div className="pt-2 border-t border-[var(--border-normal)]">
                  <label className="text-[9.5px] font-bold text-[var(--text-muted)] uppercase tracking-wider block mb-1 font-sans">
                    Filtrar por Formador:
                  </label>
                  <select
                    value={rankingFormadorFilter}
                    onChange={(e) => setRankingFormadorFilter(e.target.value)}
                    className="w-full bg-[var(--surface-elevated)] border border-[var(--border-normal)] rounded-lg px-2.5 py-1.5 text-xs font-bold text-[var(--text-primary)] outline-none cursor-pointer"
                  >
                    <option value="Todas">Todos los Formadores</option>
                    {formadoresRankingList.map(f => (
                      <option key={f.nombre} value={f.nombre}>{f.nombre}</option>
                    ))}
                  </select>
                </div>
              </div>

            </div>
          </div>

          {/* ═══════════════════════════════════════════════════════════════════ */}
          {/* NIVEL 4: MATRIZ EJECUTIVA DE DOTACIÓN POR SEGMENTO (12 COLS)        */}
          {/* ═══════════════════════════════════════════════════════════════════ */}
          <div className="w-full bg-[var(--surface)] p-6 rounded-2xl border border-[var(--border-subtle)] shadow-lg flex flex-col justify-between">
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
