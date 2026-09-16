import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import SemicircleGauge from './dashboard/SemicircleGauge';
import { 
  calculateMetricasResumenCapacitacionFast, 
  parseFechaAsistencia, 
  invalidateCache 
} from '../lib/dataService';
import { 
  MIN_PERIODO_CORTE, 
  isCampanaProyectada, 
  isGrupoActivo, 
  isGrupoCerrado, 
  getMaxAutoPeriodo,
  getGrupoPeriodo,
  normalize2026Period
} from '../lib/dashboardAnalytics';
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
  const c = String(campana || '').toUpperCase();

  // 1. EXCEPCIÓN CLAVE: "RETENCIONES FIJA INBOUND" y "RETENCIONES FIJA" pertenecen estrictamente a "CLARO PERU"
  if (c.includes('RETENCIONES FIJA') || c.includes('RETENCION FIJA') || c.includes('FIJA INBOUND')) {
    return 'CLARO PERU';
  }

  // 2. EXCEPCIÓN CLAVE: Campañas de Claro Postpago (incluido CLARO POSTPAGO - CROSS) pertenecen a "CLARO PERU"
  if (c.includes('CLARO POSTPAGO')) {
    return 'CLARO PERU';
  }

  // 3. Campañas exclusivas de CLARO CHILE
  if (c.includes('TUVES') || c.includes('CHILE')) {
    return 'CLARO CHILE';
  }

  // 4. Campañas exclusivas de LIPIGAS
  if (c.includes('LIPIGAS') || c.includes('LIMAGAS')) {
    return 'LIPIGAS';
  }

  // 5. Si en la base de datos ya viene explícito uno de los 5 segmentos oficiales, respetarlo
  if (s === 'CLARO PERU') return 'CLARO PERU';
  if (s === 'CLARO PERU RETENCIONES') return 'CLARO PERU RETENCIONES';
  if (s === 'CLARO PERU OUT') return 'CLARO PERU OUT';
  if (s === 'CLARO CHILE' || s.includes('CHILE')) return 'CLARO CHILE';
  if (s === 'LIPIGAS' || s.includes('LIPIGAS')) return 'LIPIGAS';

  // 6. Fallbacks por palabras clave si s viene nulo, vacío o genérico:
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
    c.includes('MIGRACIONES') ||
    c.includes('UPGRADE')
  ) {
    return 'CLARO PERU OUT';
  }
  return 'CLARO PERU';
};

const SEGMENTO_COLORS = {
  'CLARO PERU': '#00E5FF',
  'CLARO PERU RETENCIONES': '#7C4DFF',
  'CLARO PERU OUT': '#FF5252',
  'CLARO CHILE': '#FFD600',
  'LIPIGAS': '#00E676'
};

// Helper robusto para cálculo consistente y verdadero de RQ Solicitado (FTEs)
// REGLA: Excluir solo áreas explícitamente no elegibles (ROTACIÓN, LÍNEA DE CARRERA, INTERNO).
// Incluir RECLUTAMIENTO (explícito) o cualquier área no clasificada que sí tenga RQ > 0.
const getGrupoRq = (g) => {
  if (!g) return 0;
  if (g.is_cancelado) return 0;
  const areaNorm = String(g.area_traslado || '').trim().toUpperCase();
  // Excluir explícitamente áreas que no corresponden a dotación de reclutamiento
  const isAreaExcl = areaNorm.includes('ROTACION') || areaNorm.includes('LINEA') ||
    areaNorm.includes('INTERNO') || areaNorm.includes('TRASLADO INTERNO');
  if (isAreaExcl) return 0;

  const rqFtes = g.rq_ftes_solicitado !== undefined && g.rq_ftes_solicitado !== null ? Number(g.rq_ftes_solicitado) : null;
  const rqSol = g.rq_solicitado !== undefined && g.rq_solicitado !== null ? Number(g.rq_solicitado) : null;
  const req = g.requerimiento !== undefined && g.requerimiento !== null ? Number(g.requerimiento) : null;

  const rawVal = rqFtes !== null && !isNaN(rqFtes) ? rqFtes
    : (rqSol !== null && !isNaN(rqSol) ? rqSol
      : (req !== null && !isNaN(req) ? req : 0));

  // Incluir si: área es RECLUTAMIENTO, área vacía con RQ>0, o cualquier área no excluida con RQ>0
  if (rawVal > 0) {
    return Math.max(0, rawVal);
  }
  return 0;
};

export default function ResumenCapacitacion({
  grupos = [],
  campanasMetas = [],
  postulantes = [],
  asistencias = []
}) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [capacidadRys, setCapacidadRys] = useState([]);

  // Estado para modal de asesor
  const [selectedAsesor, setSelectedAsesor] = useState(null);

  // Estados visuales de interfaz
  const [activeTab, setActiveTab] = useState('DASHBOARD'); // 'DASHBOARD' | 'MATRIZ_TABLA'
  const [rankingTab, setRankingTab] = useState('DOTACION_SEG'); // 'DOTACION_SEG' | 'DESERCION_SEG' | 'DOTACION_FOR' | 'DESERCION_FOR'
  const [rankingFormadorFilter, setRankingFormadorFilter] = useState('Todas');
  const [searchQuery, setSearchQuery] = useState('');
  const [showRiskModal, setShowRiskModal] = useState(false);
  const [showAllPeriodos, setShowAllPeriodos] = useState(false);

  const maxAutoPeriodo = useMemo(() => getMaxAutoPeriodo(), []);

  const [filters, setFilters] = useState({
    periodo: '202608',
    semana: 'Todas',
    segmento: 'Todos',
    campana: 'Todas',
    grupo: 'Todos',
    estado: 'Todos'
  });

  // Helpers de normalización robusta
  const norm = (val) => String(val || '').trim().toUpperCase();

  const isCalculatingRef = useRef(false);
  const lastParamsRef = useRef('');

  // Carga y cálculo de métricas ultrarrápido
  const loadData = useCallback(async (force = false) => {
    const effectiveGrupos = (campanasMetas && campanasMetas.length > 0) ? campanasMetas : grupos;
    if (!effectiveGrupos || effectiveGrupos.length === 0) return;
    
    const paramsKey = `${effectiveGrupos.length}_${postulantes.length}_${asistencias.length}`;
    if (!force && lastParamsRef.current === paramsKey && data.length > 0) return;
    if (isCalculatingRef.current) return;

    isCalculatingRef.current = true;
    try {
      if (force || data.length === 0) {
        setLoading(true);
      } else {
        setIsRefreshing(true);
      }
      setError(null);

      const metricas = await calculateMetricasResumenCapacitacionFast(effectiveGrupos, postulantes, asistencias);
      setCapacidadRys(effectiveGrupos);
      setData(metricas || []);
      lastParamsRef.current = paramsKey;
    } catch (err) {
      console.error('Error calculating resumen metrics:', err);
      setError(err?.message || 'Error cargando datos de resumen');
    } finally {
      isCalculatingRef.current = false;
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [grupos, campanasMetas, postulantes, asistencias, data.length]);

  useEffect(() => {
    const effectiveGrupos = (campanasMetas && campanasMetas.length > 0) ? campanasMetas : grupos;
    if (effectiveGrupos.length > 0) {
      loadData(false);
    }
  }, [grupos.length, campanasMetas.length, postulantes.length, asistencias.length]);

  // Escuchar refresco global
  useEffect(() => {
    const handleRefresh = () => loadData(true);
    window.addEventListener('gea-global-refresh', handleRefresh);
    return () => window.removeEventListener('gea-global-refresh', handleRefresh);
  }, [loadData]);

  const normSem = (val) => {
    if (!val) return '';
    const s = String(val).trim().toUpperCase();
    if (['ALL', 'TODAS', 'TODOS', '-', 'NULL', 'UNDEFINED'].includes(s)) return '';
    const num = s.replace(/\D/g, '');
    return num ? `SEM ${parseInt(num, 10)}` : s;
  };

  // Filtros activos
  const hasActiveFilters = useMemo(() => {
    return filters.periodo !== 'Todos' ||
      filters.semana !== 'Todas' ||
      filters.segmento !== 'Todos' ||
      (filters.campana !== 'Todas' && filters.campana !== 'Todos') ||
      filters.grupo !== 'Todos' ||
      filters.estado !== 'Todos' ||
      Boolean(searchQuery);
  }, [filters, searchQuery]);

  const handleResetFilters = () => {
    setFilters({
      periodo: '202608',
      semana: 'Todas',
      segmento: 'Todos',
      campana: 'Todas',
      grupo: 'Todos',
      estado: 'Todos'
    });
    setSearchQuery('');
    setShowAllPeriodos(false);
  };

  // Opciones de filtros cruzados reactivos sobre el conjunto de datos calculado
  const filterOptions = useMemo(() => {
    const rawDataset = data.length > 0 ? data : (campanasMetas.length > 0 ? campanasMetas : (capacidadRys.length > 0 ? capacidadRys : grupos));
    const dataset = (rawDataset || []).filter(g => {
      if (isCampanaProyectada(g) || g.is_cancelado) return false;
      const st = norm(g.estado);
      if (st.includes('CANCEL') || st.includes('ANULAD') || st.includes('INACT')) return false;
      return true;
    });
    
    // 1. Periodos (Periodo de Ingreso a Operación >= MIN_PERIODO_CORTE)
    const periodos = new Set();
    dataset.forEach(g => {
      const cleanP = getGrupoPeriodo(g) || normalize2026Period(g.periodo_ingreso_op || g.periodo || g.periodo_rys);
      if (!cleanP || cleanP < MIN_PERIODO_CORTE) return;

      if (showAllPeriodos || cleanP <= maxAutoPeriodo) {
        periodos.add(cleanP);
      }
    });
    
    // Subfiltro por periodo activo
    const subPeriodo = dataset.filter(g => {
      const cleanP = getGrupoPeriodo(g) || normalize2026Period(g.periodo_ingreso_op || g.periodo || g.periodo_rys);
      if (cleanP && cleanP < MIN_PERIODO_CORTE) return false;
      if (!showAllPeriodos && cleanP && cleanP > maxAutoPeriodo) return false;
      return filters.periodo === 'Todos' || cleanP === String(filters.periodo || '').trim();
    });

    // 2. Semanas (filtradas por periodo activo)
    const semanasSet = new Set();
    subPeriodo.forEach(g => {
      const sem = normSem(g.semana || g.semana_label || g.semana_trabajo);
      if (sem) semanasSet.add(sem);
    });
    const semanas = Array.from(semanasSet).sort((a, b) => {
      const numA = parseInt(String(a).replace(/\D/g, ''), 10) || 0;
      const numB = parseInt(String(b).replace(/\D/g, ''), 10) || 0;
      return numA - numB;
    });

    // Subfiltro por semana activa
    const subSemana = subPeriodo.filter(g => {
      if (filters.semana === 'Todas') return true;
      return normSem(g.semana || g.semana_label || g.semana_trabajo) === normSem(filters.semana);
    });

    // 3. Segmentos Oficiales (filtrados por periodo y semana activos)
    const segmentos = new Set(subSemana.map(g => normalizeSegmento(g.segmento, g.campana)).filter(Boolean));
    
    // 4. Campañas (filtradas por periodo, semana, segmento y reactivas al filtro de estado)
    const subCampanas = subSemana.filter(g => {
      if (filters.segmento !== 'Todos' && normalizeSegmento(g.segmento, g.campana) !== filters.segmento) return false;

      if (filters.estado !== 'Todos') {
        const filEstadoNorm = norm(filters.estado);
        if (filEstadoNorm === 'EN CURSO' || filEstadoNorm === 'ACTIVO') {
          return isGrupoActivo(g);
        } else if (filEstadoNorm === 'CERRADO') {
          return isGrupoCerrado(g);
        } else {
          return norm(g.estado) === filEstadoNorm;
        }
      }
      return true;
    });

    const campanas = new Set();
    subCampanas.forEach(g => {
      const c = g.campana ? String(g.campana).trim() : null;
      if (c && c !== '-' && c !== 'NULL') campanas.add(c);
    });
    
    // 5. Estados del Grupo: opciones principales requeridas
    const estados = ['EN CURSO', 'CERRADO'];

    // 6. Grupos (filtrados por campaña activa y estado)
    const isCampanaFiltered = filters.campana !== 'Todas' && filters.campana !== 'Todos' && Boolean(filters.campana);
    const subGrupos = subCampanas.filter(g => {
      if (isCampanaFiltered && norm(g.campana) !== norm(filters.campana)) return false;
      return true;
    });
    const gruposSet = new Set(subGrupos.map(g => g.codigo || g.grupo_codigo ? String(g.codigo || g.grupo_codigo).trim() : null).filter(Boolean));

    return {
      periodos: Array.from(periodos).sort().reverse(),
      semanas,
      segmentos: Array.from(segmentos).sort(),
      campanas: Array.from(campanas).sort((a, b) => a.localeCompare(b)),
      estados,
      grupos: Array.from(gruposSet).sort()
    };
  }, [data, capacidadRys, campanasMetas, grupos, filters, showAllPeriodos, maxAutoPeriodo]);

  // Sincronización reactiva de filtros en cascada completa
  useEffect(() => {
    if (filters.semana !== 'Todas') {
      if (filterOptions.semanas && !filterOptions.semanas.includes(filters.semana)) {
        setFilters(f => ({ ...f, semana: 'Todas', campana: 'Todas', grupo: 'Todos' }));
      }
    }
  }, [filterOptions.semanas, filters.semana]);

  useEffect(() => {
    if (filters.segmento !== 'Todos') {
      if (filterOptions.segmentos && !filterOptions.segmentos.includes(filters.segmento)) {
        setFilters(f => ({ ...f, segmento: 'Todos', campana: 'Todas', grupo: 'Todos' }));
      }
    }
  }, [filterOptions.segmentos, filters.segmento]);

  useEffect(() => {
    if (filters.campana !== 'Todas' && filters.campana !== 'Todos') {
      if (filterOptions.campanas && !filterOptions.campanas.includes(filters.campana)) {
        setFilters(f => ({ ...f, campana: 'Todas', grupo: 'Todos' }));
      }
    }
  }, [filterOptions.campanas, filters.campana]);

  useEffect(() => {
    if (filters.grupo !== 'Todos') {
      if (filterOptions.grupos && !filterOptions.grupos.includes(filters.grupo)) {
        setFilters(f => ({ ...f, grupo: 'Todos' }));
      }
    }
  }, [filterOptions.grupos, filters.grupo]);

  // Datos filtrados en caliente con normalización exacta
  const filteredData = useMemo(() => {
    const isCampanaFiltered = filters.campana !== 'Todas' && filters.campana !== 'Todos' && Boolean(filters.campana);

    return data.filter(d => {
      // Excluir grupos proyectados fuera de operación
      if (isCampanaProyectada(d)) return false;

      // Excluir grupos cancelados o inactivos
      if (d.is_cancelado) return false;
      const stNorm = norm(d.estado);
      if (stNorm.includes('CANCEL') || stNorm.includes('ANULAD') || stNorm.includes('INACT')) return false;

      // Filtro Periodo (Periodo de Ingreso a Operación)
      const cleanP = getGrupoPeriodo(d) || normalize2026Period(d.periodo_ingreso_op || d.periodo);
      if (cleanP && cleanP < MIN_PERIODO_CORTE) return false;

      // Desbloqueo dinámico: solo hasta maxAutoPeriodo cuando showAllPeriodos es false
      if (!showAllPeriodos && cleanP && cleanP > maxAutoPeriodo) {
        return false;
      }

      if (filters.periodo !== 'Todos' && cleanP !== String(filters.periodo || '').trim()) {
        return false;
      }
      // Filtro Semana (Normalización estricta numérica / SEM XX)
      if (filters.semana !== 'Todas') {
        const semNorm = normSem(d.semana);
        if (semNorm !== normSem(filters.semana)) {
          return false;
        }
      }
      // Filtro Segmento (Normalizado robusto)
      const segNorm = normalizeSegmento(d.segmento, d.campana);
      if (filters.segmento !== 'Todos' && norm(segNorm) !== norm(filters.segmento)) {
        return false;
      }
      // Filtro Estado del Grupo (EN CURSO vs CERRADO reactivo)
      if (filters.estado !== 'Todos') {
        const filNorm = norm(filters.estado);
        if (filNorm === 'CERRADO') {
          if (!isGrupoCerrado(d)) return false;
        } else if (filNorm === 'EN CURSO' || filNorm === 'ACTIVO') {
          if (!isGrupoActivo(d)) return false;
        } else {
          if (norm(d.estado) !== filNorm) return false;
        }
      } else {
        // En 'Todos', asegurar que no se incluyan grupos cancelados o inactivos fantasma
        if (!isGrupoActivo(d) && !isGrupoCerrado(d)) return false;
      }
      // Filtro Campaña
      if (isCampanaFiltered && norm(d.campana) !== norm(filters.campana)) {
        return false;
      }
      // Filtro Grupo / GPE — verifica contra ambas claves posibles
      if (filters.grupo !== 'Todos') {
        const grupoNorm = norm(d.grupo_codigo || d.codigo);
        if (grupoNorm !== norm(filters.grupo)) {
          return false;
        }
      }
      // Búsqueda en texto libre
      if (searchQuery) {
        const q = searchQuery.trim().toLowerCase();
        const matchDoc = String(d.grupo_codigo || '').toLowerCase().includes(q) ||
          String(d.campana || '').toLowerCase().includes(q) ||
          String(d.formador || '').toLowerCase().includes(q) ||
          String(d.estado || '').toLowerCase().includes(q) ||
          String(segNorm).toLowerCase().includes(q);
        if (!matchDoc) return false;
      }
      return true;
    });
  }, [data, filters, searchQuery, showAllPeriodos, maxAutoPeriodo]);

  // Totales Scorecard
  // Totales Scorecard
  const kpis = useMemo(() => {
    // Consolidar documentos únicos con I-OP a través de todos los grupos filtrados
    const uniqueIopMap = new Map();
    filteredData.forEach(curr => {
      (curr.docs_iop_detalle || []).forEach(item => {
        const doc = String(item.documento || '').trim().toUpperCase();
        if (!doc) return;
        if (!uniqueIopMap.has(doc)) {
          uniqueIopMap.set(doc, item);
        } else {
          const prev = uniqueIopMap.get(doc);
          if (item.fecha_iop && (!prev.fecha_iop || item.fecha_iop > prev.fecha_iop)) {
            uniqueIopMap.set(doc, item);
          }
        }
      });
    });

    const hasDetailedIop = uniqueIopMap.size > 0;
    const uniqueIopCount = uniqueIopMap.size;
    const uniqueIopFtes = Array.from(uniqueIopMap.values()).reduce((sum, item) => sum + (Number(item.fte) || 1.0), 0);

    const totals = filteredData.reduce((acc, curr) => {
      // Requerimiento solicitado ponderado consistente
      acc.rq_solicitado += getGrupoRq(curr);
      acc.total_nomina += (curr.total_nomina || 0);
      acc.asistio_dia1 += (curr.asistio_dia1 || 0);
      acc.activos_ojt += (curr.activos_ojt || 0);
      acc.desertores_ct += (curr.desertores_ct || 0);
      acc.desertores_ojt += (curr.desertores_ojt || 0);
      acc.raw_ingresos_iop += (curr.ingresos_iop || 0);
      acc.raw_ingresos_iop_ftes += (curr.ingresos_iop_ftes !== undefined ? Number(curr.ingresos_iop_ftes) : Number(curr.ingresos_iop || 0));
      acc.activos_actuales += (curr.activos_actuales || 0);
      return acc;
    }, {
      rq_solicitado: 0,
      total_nomina: 0,
      asistio_dia1: 0,
      activos_ojt: 0,
      desertores_ct: 0,
      desertores_ojt: 0,
      raw_ingresos_iop: 0,
      raw_ingresos_iop_ftes: 0,
      activos_actuales: 0
    });

    return {
      ...totals,
      ingresos_iop: hasDetailedIop ? uniqueIopCount : totals.raw_ingresos_iop,
      ingresos_iop_ftes: hasDetailedIop ? uniqueIopFtes : totals.raw_ingresos_iop_ftes,
      uniqueIopMap
    };
  }, [filteredData]);

  // Desglose por Segmento (Tabla y Gráficos)
  const segmentData = useMemo(() => {
    const segMap = {
      'CLARO PERU': { segmento: 'CLARO PERU', rq: 0, reclutados: 0, d1: 0, ojt: 0, iop: 0, iopFtes: 0, grupos: 0, desertores_ct: 0, desertores_ojt: 0, activos_actuales: 0, iopDocs: new Map() },
      'CLARO PERU RETENCIONES': { segmento: 'CLARO PERU RETENCIONES', rq: 0, reclutados: 0, d1: 0, ojt: 0, iop: 0, iopFtes: 0, grupos: 0, desertores_ct: 0, desertores_ojt: 0, activos_actuales: 0, iopDocs: new Map() },
      'CLARO PERU OUT': { segmento: 'CLARO PERU OUT', rq: 0, reclutados: 0, d1: 0, ojt: 0, iop: 0, iopFtes: 0, grupos: 0, desertores_ct: 0, desertores_ojt: 0, activos_actuales: 0, iopDocs: new Map() },
      'CLARO CHILE': { segmento: 'CLARO CHILE', rq: 0, reclutados: 0, d1: 0, ojt: 0, iop: 0, iopFtes: 0, grupos: 0, desertores_ct: 0, desertores_ojt: 0, activos_actuales: 0, iopDocs: new Map() },
      'LIPIGAS': { segmento: 'LIPIGAS', rq: 0, reclutados: 0, d1: 0, ojt: 0, iop: 0, iopFtes: 0, grupos: 0, desertores_ct: 0, desertores_ojt: 0, activos_actuales: 0, iopDocs: new Map() }
    };

    filteredData.forEach(d => {
      const segKey = normalizeSegmento(d.segmento, d.campana);
      const target = segMap[segKey] || (segMap[segKey] = { segmento: segKey, rq: 0, reclutados: 0, d1: 0, ojt: 0, iop: 0, iopFtes: 0, grupos: 0, desertores_ct: 0, desertores_ojt: 0, activos_actuales: 0, iopDocs: new Map() });

      target.rq += getGrupoRq(d);
      target.reclutados += (d.total_nomina || 0);
      target.d1 += (d.asistio_dia1 || 0);
      target.ojt += (d.activos_ojt || 0);
      target.desertores_ct += (d.desertores_ct || 0);
      target.desertores_ojt += (d.desertores_ojt || 0);
      target.activos_actuales += (d.activos_actuales || 0);
      target.grupos += 1;

      // Registrar docs únicos por segmento
      if (d.docs_iop_detalle && d.docs_iop_detalle.length > 0) {
        d.docs_iop_detalle.forEach(item => {
          const doc = String(item.documento || '').trim().toUpperCase();
          if (doc && !target.iopDocs.has(doc)) {
            target.iopDocs.set(doc, item);
          }
        });
      } else {
        target.iop += (d.ingresos_iop || 0);
        target.iopFtes += (d.ingresos_iop_ftes !== undefined ? Number(d.ingresos_iop_ftes) : Number(d.ingresos_iop || 0));
      }
    });

    return Object.values(segMap).map(s => {
      if (s.iopDocs.size > 0) {
        s.iop = s.iopDocs.size;
        s.iopFtes = Array.from(s.iopDocs.values()).reduce((sum, it) => sum + (Number(it.fte) || 1.0), 0);
      }
      const convD1 = s.reclutados > 0 ? ((s.d1 / s.reclutados) * 100) : 0;
      const retOjt = s.d1 > 0 ? ((s.ojt / s.d1) * 100) : 0;
      const convIop = s.d1 > 0 ? ((s.iop / s.d1) * 100) : 0;
      const cumplRq = s.rq > 0 ? ((s.iopFtes / s.rq) * 100) : 0;
      
      const totalActivos = (s.activos_actuales || 0) + (s.ojt || 0);
      const desertoresRegistrados = (s.desertores_ct || 0) + (s.desertores_ojt || 0);
      const desertores = Math.max(desertoresRegistrados, Math.max(0, s.d1 - totalActivos - (s.iop || 0)));
      const pctDesercion = s.d1 > 0 ? ((desertores / s.d1) * 100) : 0;
      const enTransito = Math.max(0, s.ojt - s.iop);

      return {
        ...s,
        convD1: parseFloat(convD1.toFixed(1)),
        retOjt: parseFloat(retOjt.toFixed(1)),
        convIop: parseFloat(convIop.toFixed(1)),
        cumplRq: parseFloat(cumplRq.toFixed(1)),
        pctDesercion: parseFloat(pctDesercion.toFixed(2)),
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
    const desertoresOjt = kpis.desertores_ojt || 0;
    const iop = kpis.ingresos_iop || 0;
    const iopFtes = kpis.ingresos_iop_ftes || 0;
    const rq = kpis.rq_solicitado || 0;
    const qIniciaOjt = ojt + iop + desertoresOjt;
    const ojt_transito = segmentData.reduce((acc, s) => acc + s.enTransito, 0);

    return {
      d1_vs_nomina: total > 0 ? ((d1 / total) * 100).toFixed(1) : '0.0',
      ojt_vs_d1: d1 > 0 ? ((qIniciaOjt / d1) * 100).toFixed(1) : '0.0',
      iop_vs_nomina: total > 0 ? ((iop / total) * 100).toFixed(1) : '0.0',
      iop_vs_ojt: qIniciaOjt > 0 ? ((iop / qIniciaOjt) * 100).toFixed(1) : '0.0',
      cumplimiento_rq: rq > 0 ? ((iopFtes / rq) * 100).toFixed(1) : '0.0',
      ojt_transito,
      qIniciaOjt
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
    let sumDays = 0;
    let countAsesores = 0;
    let countEstancados = 0; // > 15 días en OJT sin graduar

    filteredData.forEach(d => {
      // 1. Cálculo a nivel individual de cada asesor en OJT / Tránsito
      if (d.asesores_ojt_detalle && d.asesores_ojt_detalle.length > 0) {
        d.asesores_ojt_detalle.forEach(asesor => {
          const days = Number(asesor.dias_ojt);
          if (!isNaN(days) && days > 0) {
            sumDays += days;
            countAsesores++;
            // Caso estancado: más de 15 días en OJT sin graduar a I-OP
            if (days > 15 && asesor.is_activo_ojt) {
              countEstancados++;
            }
          }
        });
      } else {
        // Fallback en caso no haya detalle individual en memoria para este grupo
        const transitoEnGrupo = Math.max(0, (d.activos_ojt || 0) - (d.ingresos_iop || 0));
        if (transitoEnGrupo > 0) {
          let diffDays = 0;
          if (d.fecha_inicio_ojt && d.fecha_inicio_ojt !== 'No definida') {
            const f = new Date(d.fecha_inicio_ojt);
            if (!isNaN(f.getTime())) {
              diffDays = Math.max(1, Math.floor((Date.now() - f.getTime()) / (1000 * 60 * 60 * 24)));
            }
          } else if (d.ultima_fecha_asistencia && d.ultima_fecha_asistencia !== '-') {
            diffDays = 5;
          }
          if (diffDays > 0) {
            sumDays += diffDays * transitoEnGrupo;
            countAsesores += transitoEnGrupo;
            if (diffDays > 15 && !d.is_cerrado) {
              countEstancados += transitoEnGrupo;
            }
          }
        }
      }
    });

    const avgDays = countAsesores > 0 ? (sumDays / countAsesores).toFixed(1) : '0.0';
    const totalTransito = segmentData.reduce((acc, s) => acc + s.enTransito, 0);

    return {
      avgDays,
      totalTransito: countAsesores > 0 ? countAsesores : totalTransito,
      countEstancados,
      hasAlert: countEstancados > 0
    };
  }, [filteredData, segmentData]);

  // ── 4. KPI SUPERIOR: PROYECCIÓN DE CIERRE DE MES (RUN-RATE CALIBRADO POR DOCS ÚNICOS) ──
  const kpiProyeccion = useMemo(() => {
    const today = new Date();
    const currentDay = today.getDate(); // 1 a 31
    const currentMonth = today.getMonth(); // 0 a 11
    const currentYear = today.getFullYear();

    const rqTotal = kpis.rq_solicitado || 0;

    // Detectar si el filtro es granular (Semana puntual, Campaña puntual, Grupo puntual o Estado Cerrado)
    const isGranularFilter = filters.semana !== 'Todas' || filters.grupo !== 'Todos' || (filters.campana !== 'Todas' && filters.campana !== 'Todos') || filters.estado === 'CERRADO';
    const allClosed = filteredData.length > 0 && filteredData.every(d => d.is_cerrado);

    // Detectar si el periodo seleccionado es un mes pasado/cerrado
    const pStr = String(filters.periodo || '').trim();
    const pMatch = pStr.match(/(\d{4})[-_/\s]?(\d{2})/);
    const filterYear = pMatch ? parseInt(pMatch[1], 10) : null;
    const filterMonth = pMatch ? parseInt(pMatch[2], 10) - 1 : null; // 0-indexed

    let totalDaysInMonth = 30;
    let diasTranscurridos = 30;
    let isPeriodoCerrado = false;

    if (filterYear !== null && filterMonth !== null) {
      totalDaysInMonth = new Date(filterYear, filterMonth + 1, 0).getDate();
      if (filterYear < currentYear || (filterYear === currentYear && filterMonth < currentMonth)) {
        isPeriodoCerrado = true;
        diasTranscurridos = totalDaysInMonth;
      } else if (filterYear === currentYear && filterMonth === currentMonth) {
        diasTranscurridos = Math.max(1, Math.min(totalDaysInMonth, currentDay));
      } else {
        diasTranscurridos = 1;
      }
    } else {
      totalDaysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
      diasTranscurridos = Math.max(1, Math.min(totalDaysInMonth, currentDay));
    }

    // Extraer documentos únicos de I-OP
    const uniqueDocsList = kpis.uniqueIopMap ? Array.from(kpis.uniqueIopMap.values()) : [];
    
    // Mes actual en formato YYYY-MM y YYYYMM
    const currentYearMonthPrefix = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`;
    const currentPeriodoDigits = `${currentYear}${String(currentMonth + 1).padStart(2, '0')}`;

    let docsMesActual = [];
    if (filters.periodo === 'Todos') {
      docsMesActual = uniqueDocsList.filter(item => {
        if (item.fecha_iop) {
          return item.fecha_iop.startsWith(currentYearMonthPrefix);
        }
        const pDigits = String(item.periodo || '').replace(/\D/g, '');
        return pDigits === currentPeriodoDigits;
      });
      if (docsMesActual.length === 0) {
        docsMesActual = uniqueDocsList;
      }
    } else {
      docsMesActual = uniqueDocsList;
    }

    // Cantidad real de documentos únicos ingresados a operación en el periodo
    const iopActual = docsMesActual.length > 0 ? docsMesActual.length : (kpis.ingresos_iop || 0);
    const iopActualFtes = docsMesActual.length > 0 
      ? docsMesActual.reduce((sum, it) => sum + (Number(it.fte) || 1.0), 0)
      : (kpis.ingresos_iop_ftes || iopActual);

    // Proyección en FTEs (Full Time Equivalent):
    // REGLA CLAVE: En filtros granulares (Semana, Grupo, Campaña puntual o Cerrados), NO se extrapola a 30 días.
    let iopProyectadoFtes = 0;
    let iopProyectado = 0;
    if (isGranularFilter || allClosed || isPeriodoCerrado || diasTranscurridos >= totalDaysInMonth) {
      iopProyectadoFtes = iopActualFtes;
      iopProyectado = iopActual;
    } else {
      const ritmoDiarioFtes = iopActualFtes / diasTranscurridos;
      iopProyectadoFtes = Number((ritmoDiarioFtes * totalDaysInMonth).toFixed(1));
      
      const ritmoDiario = iopActual / diasTranscurridos;
      iopProyectado = Math.round(ritmoDiario * totalDaysInMonth);
    }

    // Porcentaje de cobertura frente al RQ solicitado (FTEs vs FTEs)
    const pctProyeccion = rqTotal > 0 ? ((iopProyectadoFtes / rqTotal) * 100).toFixed(1) : (iopActualFtes > 0 ? '100.0' : '0.0');
    const brechaFtes = Math.max(0, Number((rqTotal - iopProyectadoFtes).toFixed(1)));

    return {
      iopActual,
      iopActualFtes,
      iopProyectado,
      iopProyectadoFtes,
      pctProyeccion,
      diasTranscurridos,
      totalDaysInMonth,
      brechaFtes,
      isGranularFilter: isGranularFilter || allClosed,
      isCloseToTarget: parseFloat(pctProyeccion) >= 80
    };
  }, [kpis, filters.periodo, filters.semana, filters.grupo, filters.campana, filters.estado, filteredData]);

  // ── 3. KPI SUPERIOR: RIESGO DE COBERTURA (BRECHA FTE & FUGA FORMATIVA) ──
  const kpiAlertas = useMemo(() => {
    const metaRq = kpis.rq_solicitado || 0;
    const isGranular = kpiProyeccion?.isGranularFilter;
    
    // Si es filtro granular o cohorte cerrada, la dotación evaluada es DIRECTAMENTE los FTEs reales graduados
    const iopFtesEvaluado = isGranular 
      ? (kpis.ingresos_iop_ftes || 0) 
      : (kpiProyeccion?.iopProyectadoFtes ?? (kpis.ingresos_iop_ftes || 0));
    
    // Brecha de FTEs en Riesgo frente a la Meta solicitada (FTEs vs FTEs)
    const brechaFtes = Math.max(0, Number((metaRq - iopFtesEvaluado).toFixed(1)));
    const superavitFtes = Math.max(0, Number((iopFtesEvaluado - metaRq).toFixed(1)));
    const pctCumplimiento = metaRq > 0 ? (iopFtesEvaluado / metaRq) * 100 : (iopFtesEvaluado > 0 ? 100 : 100);
    const hasBrecha = brechaFtes > 0.05;

    // Segmentos bajo meta (< 70% de cumplimiento RQ)
    const segBajoMeta = segmentData.filter(s => s.rq > 0 && s.cumplRq < 70);
    const countSegBajoMeta = segBajoMeta.length;

    // Formadores en fuga crítica (> 35% deserción real sobre alumnos que iniciaron D1 con muestra representativa >= 6)
    // Se calcula usando las métricas reales y validadas por cohorte protegiendo a quienes graduaron a I-OP o siguen activos
    const formMap = new Map();
    filteredData.forEach(g => {
      const formador = String(g.formador || 'SIN FORMADOR').trim().toUpperCase();
      if (!formador || formador === 'SIN FORMADOR' || formador === 'SIN ASIGNAR') return;
      if (!formMap.has(formador)) {
        formMap.set(formador, { formador, campana: g.campana, d1: 0, desertores: 0 });
      }
      const entry = formMap.get(formador);
      const d1 = Number(g.asistio_dia1) || 0;
      const iop = Number(g.ingresos_iop) || 0;
      const totalActivos = (Number(g.activos_actuales) || 0) + (Number(g.activos_ojt) || 0);
      const desertoresReg = (Number(g.desertores_ct) || 0) + (Number(g.desertores_ojt) || 0);
      const desertores = Math.max(desertoresReg, Math.max(0, d1 - totalActivos - iop));

      entry.d1 += d1;
      entry.desertores += desertores;
      if (!entry.campana && g.campana) entry.campana = g.campana;
    });

    const formadoresCriticosList = [];
    formMap.forEach((entry, fName) => {
      if (entry.d1 >= 6) {
        const pct = (entry.desertores / entry.d1) * 100;
        if (pct > 35) {
          formadoresCriticosList.push({
            formador: fName,
            campana: entry.campana || 'Sin Campaña',
            totalAlumnos: entry.d1,
            bajas: entry.desertores,
            pctDesercion: parseFloat(pct.toFixed(1))
          });
        }
      }
    });

    formadoresCriticosList.sort((a, b) => b.pctDesercion - a.pctDesercion);
    const countFormadoresCriticos = formadoresCriticosList.length;

    // Clasificación ejecutiva calibrada:
    // CUBIERTO si no hay requerimiento o cobertura >= 95% o brecha mínima
    const isCritico = metaRq > 0 && (pctCumplimiento < 80 || (brechaFtes > 25 && pctCumplimiento < 90) || countSegBajoMeta >= 2);
    const isObservado = !isCritico && metaRq > 0 && ((pctCumplimiento < 95 && brechaFtes > 5) || countSegBajoMeta > 0);

    return {
      brechaFtes,
      superavitFtes,
      hasBrecha,
      pctCumplimiento: parseFloat(pctCumplimiento.toFixed(1)),
      countSegBajoMeta,
      countFormadoresCriticos,
      formadoresCriticosList,
      estadoSemaforo: metaRq === 0 ? 'CUBIERTO' : (isCritico ? 'CRÍTICO' : (isObservado ? 'PRECAUCIÓN' : 'CUBIERTO')),
      isHealthy: metaRq === 0 || (!isCritico && !isObservado)
    };
  }, [segmentData, filteredData, kpis, kpiProyeccion]);

  // Datos para Embudo Lineal Calibrado
  const funnelData = useMemo(() => {
    const qIniciaOjt = kpiPercentages.qIniciaOjt || ((kpis.activos_ojt || 0) + (kpis.ingresos_iop || 0) + (kpis.desertores_ojt || 0));
    const dropD1 = (100 - parseFloat(kpiPercentages.d1_vs_nomina)).toFixed(1);
    const dropOjt = (100 - parseFloat(kpiPercentages.ojt_vs_d1)).toFixed(1);
    const dropIop = (100 - parseFloat(kpiPercentages.iop_vs_ojt)).toFixed(1);

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
        drop: `${dropD1}% caída`,
        fill: '#818CF8'
      },
      {
        etapa: '3. Pase a OJT',
        nombre: 'Pase a OJT / Nesting',
        valor: qIniciaOjt,
        pct: `${kpiPercentages.ojt_vs_d1}% vs D1`,
        drop: `${dropOjt}% caída`,
        fill: '#2DD4BF'
      },
      {
        etapa: '4. Pases I-OP',
        nombre: 'Pase a Operación',
        valor: kpis.ingresos_iop,
        pct: `${kpiPercentages.iop_vs_ojt}% vs OJT`,
        drop: `${dropIop}% caída`,
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
    const iopFtes = kpis.ingresos_iop_ftes || 0;
    const ojt = kpis.activos_ojt || 0;
    const desertoresCt = kpis.desertores_ct || 0;
    const desertoresOjt = kpis.desertores_ojt || 0;
    const activosActuales = kpis.activos_actuales || 0;
    
    // 1. Deserción Global de Capacitación
    // En cohortes finalizadas: (d1 - iop) / d1. En cohortes activas: protege a quienes siguen en aula u OJT.
    const totalActivos = activosActuales + ojt;
    const desertoresRegistrados = desertoresCt + desertoresOjt;
    const desertoresTotal = Math.max(desertoresRegistrados, Math.max(0, d1 - totalActivos - iop));
    const pctDesercionGlobal = d1 > 0 ? (desertoresTotal / d1) * 100 : 0;

    // 2. Deserción CT (Aula / Capacitación Teórica)
    // Mide a los alumnos que cayeron en la etapa teórica antes de entrar a OJT
    const pctDesercionCT = d1 > 0 ? (desertoresCt / d1) * 100 : 0;

    // 3. Dotación FTEs — ALINEADO con kpiAlertas para consistencia con el KPI 3 Riesgo de Cobertura.
    // Se usa el mismo valor FTEs evaluado: en filtros granulares/cerrados = FTEs reales;
    // en filtros mensuales generales = FTEs proyectados al cierre.
    // Esto elimina la discrepancia entre el Gauge y el semáforo del KPI 3.
    const iopFtesAlineado = kpiAlertas ? kpiAlertas.pctCumplimiento !== undefined
      ? (rq > 0 ? (kpiAlertas.pctCumplimiento / 100) * rq : iopFtes)
      : iopFtes
      : iopFtes;
    const pctDotacion = rq > 0 ? (iopFtesAlineado / rq) * 100 : (iopFtesAlineado > 0 ? 100 : 0);

    // 4. Deserción OJT
    const qIniciaOjt = ojt + iop + desertoresOjt;
    const pctDesercionOJT = qIniciaOjt > 0 ? (desertoresOjt / qIniciaOjt) * 100 : 0;

    const formatNum = (n) => {
      const num = Number(n) || 0;
      if (num >= 1000) return `${(num / 1000).toFixed(2).replace('.', ',')} mil`;
      return num.toLocaleString('es-PE');
    };

    const formatFte = (n) => {
      const num = Number(n) || 0;
      return num % 1 === 0 ? num.toLocaleString('es-PE') : num.toFixed(1).replace('.', ',');
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
          { label: 'Desertores CT', value: desertoresCt.toLocaleString('es-PE') }
        ]
      },
      dotacion: {
        value: parseFloat(pctDotacion.toFixed(2)),
        target: 80.00,
        subMetrics: [
          { label: "RQ FTE's", value: formatFte(rq) },
          { label: "Dotación FTE's", value: formatFte(iopFtesAlineado) }
        ]
      },
      desercionOJT: {
        value: parseFloat(pctDesercionOJT.toFixed(2)),
        target: 20.00,
        subMetrics: [
          { label: 'Q Inicia OJT', value: Number(qIniciaOjt || 0).toLocaleString('es-PE') },
          { label: 'Desertores OJT', value: Number(desertoresOjt || 0).toLocaleString('es-PE') }
        ]
      }
    };
  }, [kpis, kpiAlertas]);

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
          iopFtes: 0,
          activosOjt: 0,
          desertores: 0
        });
      }
      const item = map.get(fName);
      item.rq += getGrupoRq(g);
      item.d1 += Number(g.asistio_dia1) || 0;
      item.iop += Number(g.ingresos_iop) || 0;
      item.iopFtes += Number(g.ingresos_iop_ftes !== undefined ? g.ingresos_iop_ftes : g.ingresos_iop) || 0;
      item.activosOjt += Number(g.activos_ojt) || 0;
      
      const desertoresReg = (g.desertores_ct || 0) + (g.desertores_ojt || 0);
      const totalActivos = (g.activos_actuales || 0) + (g.activos_ojt || 0);
      const desert = Math.max(desertoresReg, Math.max(0, (g.asistio_dia1 || 0) - totalActivos - (g.ingresos_iop || 0)));
      item.desertores += desert;
    });

    return Array.from(map.values()).map(f => {
      const pctDot = f.rq > 0 ? (f.iopFtes / f.rq) * 100 : (f.iopFtes > 0 ? 100 : 0);
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
      PRESENCIAL: { nombre: 'PRESENCIAL', rq: 0, d1: 0, iop: 0, iopFtes: 0, desertores: 0 },
      REMOTO: { nombre: 'REMOTO', rq: 0, d1: 0, iop: 0, iopFtes: 0, desertores: 0 }
    };

    filteredData.forEach(g => {
      const mod = String(g.modalidad || '').toUpperCase().includes('REM') ? 'REMOTO' : 'PRESENCIAL';
      const target = map[mod];
      target.rq += getGrupoRq(g);
      target.d1 += Number(g.asistio_dia1) || 0;
      target.iop += Number(g.ingresos_iop) || 0;
      target.iopFtes += Number(g.ingresos_iop_ftes !== undefined ? g.ingresos_iop_ftes : g.ingresos_iop) || 0;
      const desertoresReg = (g.desertores_ct || 0) + (g.desertores_ojt || 0);
      const totalActivos = (g.activos_actuales || 0) + (g.activos_ojt || 0);
      const desert = Math.max(desertoresReg, Math.max(0, (g.asistio_dia1 || 0) - totalActivos - (g.ingresos_iop || 0)));
      target.desertores += desert;
    });

    return Object.values(map).map(m => {
      const pctDot = m.rq > 0 ? (m.iopFtes / m.rq) * 100 : (m.iopFtes > 0 ? 100 : 0);
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
      const req = getGrupoRq(d);
      const desertores = Math.max(0, (d.asistio_dia1 || 0) - (d.activos_actuales || 0) - (d.ingresos_iop || 0));
      const iopFtes = d.ingresos_iop_ftes !== undefined ? Number(d.ingresos_iop_ftes) : Number(d.ingresos_iop || 0);
      const pctCumpl = req > 0 ? `${Math.round((iopFtes / req) * 100)}%` : (iopFtes > 0 ? '100%' : '0%');

      return {
        'Periodo': d.periodo,
        'Semana': d.semana,
        'Estado': d.estado || (d.is_cerrado ? 'CERRADO' : 'EN CURSO'),
        'Formador': d.formador || 'Sin Asignar',
        'Último Registro': d.ultima_fecha_asistencia || '-',
        'Segmento': normalizeSegmento(d.segmento, d.campana),
        'Local / Sede': d.sede || 'LIMA',
        'Campaña': d.campana,
        'Grupo (GPE)': d.grupo_codigo,
        'Fecha Inicio OJT': d.fecha_inicio_ojt,
        'RQ Solicitado': req,
        'Total Nómina': d.total_nomina,
        'Asistió Día 1 (Efectivo)': d.asistio_dia1,
        'Activos en OJT': d.activos_ojt,
        'Pases I-OP (Personas)': d.ingresos_iop,
        'Pases I-OP (FTEs)': d.ingresos_iop_ftes !== undefined ? d.ingresos_iop_ftes : d.ingresos_iop,
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
                Auditoría ejecutiva de conversión, retención y cumplimiento de metas operativas ({filteredData.length} {filteredData.length === 1 ? 'cohorte' : 'cohortes'})
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

      {/* ── BARRA DE FILTROS CRUZADOS: PERIODO → SEMANA → SEGMENTO → CAMPAÑA → GRUPO ── */}
      <div className="bg-[var(--surface)] p-3.5 rounded-2xl border border-[var(--border-subtle)] flex flex-wrap items-center gap-3">

        {/* 1. PERIODO */}
        <div className="flex-1 min-w-[140px]">
          <div className="flex items-center justify-between mb-1">
            <label className="text-[10px] font-black text-[var(--text-muted)] tracking-wider uppercase">Periodo</label>
            <button
              type="button"
              onClick={() => setShowAllPeriodos(v => !v)}
              className={`text-[9px] font-bold px-1.5 py-0.5 rounded transition-all ${
                showAllPeriodos 
                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40' 
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-elevated)]'
              }`}
              title={showAllPeriodos ? 'Ocultar periodos proyectados lejanos' : 'Desbloquear periodos proyectados lejanos'}
            >
              {showAllPeriodos ? '★ Todos' : '+ Proyectados'}
            </button>
          </div>
          <select
            value={filters.periodo}
            onChange={(e) => setFilters(f => ({ ...f, periodo: e.target.value, semana: 'Todas', segmento: 'Todos', campana: 'Todas', grupo: 'Todos' }))}
            className="w-full bg-[var(--surface-elevated)] border border-[var(--border-subtle)] rounded-xl px-3 py-1.5 text-xs text-[var(--text-primary)] focus:border-cyan-500 outline-none"
          >
            <option value="Todos">Todos los Periodos</option>
            {filterOptions.periodos.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>

        {/* 2. SEMANA */}
        <div className="flex-1 min-w-[120px]">
          <label className="text-[10px] font-black text-[var(--text-muted)] tracking-wider uppercase block mb-1">Semana</label>
          <select
            value={filters.semana}
            onChange={(e) => setFilters(f => ({ ...f, semana: e.target.value, segmento: 'Todos', campana: 'Todas', grupo: 'Todos' }))}
            className="w-full bg-[var(--surface-elevated)] border border-[var(--border-subtle)] rounded-xl px-3 py-1.5 text-xs text-[var(--text-primary)] focus:border-cyan-500 outline-none"
          >
            <option value="Todas">Todas las Semanas</option>
            {filterOptions.semanas.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        {/* 3. SEGMENTO */}
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

        {/* 4. CAMPAÑA */}
        <div className="flex-1 min-w-[160px]">
          <label className="text-[10px] font-black text-[var(--text-muted)] tracking-wider uppercase block mb-1">
            Campaña
          </label>
          <select
            value={filters.campana}
            onChange={(e) => setFilters(f => ({ ...f, campana: e.target.value, grupo: 'Todos' }))}
            className="w-full bg-[var(--surface-elevated)] border border-[var(--border-subtle)] rounded-xl px-3 py-1.5 text-xs text-[var(--text-primary)] focus:border-cyan-500 outline-none"
          >
            <option value="Todas">Todas las Campañas</option>
            {filterOptions.campanas.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        {/* 5. GRUPO (GPE) */}
        <div className="flex-1 min-w-[150px]">
          <label className="text-[10px] font-black text-[var(--text-muted)] tracking-wider uppercase block mb-1">Grupo</label>
          <select
            value={filters.grupo}
            onChange={(e) => setFilters(f => ({ ...f, grupo: e.target.value }))}
            className="w-full bg-[var(--surface-elevated)] border border-[var(--border-subtle)] rounded-xl px-3 py-1.5 text-xs text-[var(--text-primary)] focus:border-cyan-500 outline-none"
          >
            <option value="Todos">Todos los Grupos</option>
            {filterOptions.grupos.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>

        {/* 6. ESTADO */}
        <div className="flex-1 min-w-[140px]">
          <label className="text-[10px] font-black text-[var(--text-muted)] tracking-wider uppercase block mb-1">Estado</label>
          <select
            value={filters.estado}
            onChange={(e) => setFilters(f => ({ ...f, estado: e.target.value, campana: 'Todas', grupo: 'Todos' }))}
            className="w-full bg-[var(--surface-elevated)] border border-[var(--border-subtle)] rounded-xl px-3 py-1.5 text-xs text-[var(--text-primary)] focus:border-cyan-500 outline-none"
          >
            <option value="Todos">Todos (Activos y Cerrados)</option>
            {filterOptions.estados.map(e => (
              <option key={e} value={e}>
                {e === 'EN CURSO' ? '🟢 EN CURSO (Activos)' : e === 'CERRADO' ? '⚪ CERRADO' : e}
              </option>
            ))}
          </select>
        </div>

        {/* 7. BÚSQUEDA RÁPIDA */}
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
                  {kpiAging.totalTransito} en OJT
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

            {/* KPI 3: RIESGO DE COBERTURA & BRECHA OPERATIVA */}
            <div className={`relative overflow-hidden bg-gradient-to-br from-[var(--surface)] via-[var(--surface-elevated)] ${
              kpiAlertas.estadoSemaforo === 'CRÍTICO' 
                ? 'to-rose-950/20 border-rose-500/25 hover:border-rose-500/50' 
                : kpiAlertas.estadoSemaforo === 'PRECAUCIÓN'
                ? 'to-amber-950/20 border-amber-500/25 hover:border-amber-500/50'
                : 'to-emerald-950/20 border-emerald-500/25 hover:border-emerald-500/50'
            } p-5 rounded-2xl border shadow-lg group transition-all`}>
              <div className={`absolute top-0 right-0 w-28 h-28 ${
                kpiAlertas.estadoSemaforo === 'CRÍTICO' 
                  ? 'bg-rose-500/10 group-hover:bg-rose-500/20' 
                  : kpiAlertas.estadoSemaforo === 'PRECAUCIÓN'
                  ? 'bg-amber-500/10 group-hover:bg-amber-500/20'
                  : 'bg-emerald-500/10 group-hover:bg-emerald-500/20'
              } rounded-full blur-2xl transition-all pointer-events-none`} />
              <div className="flex items-center justify-between mb-3">
                <span className={`text-[10px] font-black ${
                  kpiAlertas.estadoSemaforo === 'CRÍTICO' 
                    ? 'text-rose-400 bg-rose-500/10 border-rose-500/20' 
                    : kpiAlertas.estadoSemaforo === 'PRECAUCIÓN'
                    ? 'text-amber-400 bg-amber-500/10 border-amber-500/20'
                    : 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                } tracking-wider uppercase px-2.5 py-0.5 rounded-md border flex items-center gap-1.5`}>
                  <ShieldAlert className="w-3 h-3" />
                  3 · Riesgo de Cobertura
                </span>
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                  kpiAlertas.estadoSemaforo === 'CRÍTICO' 
                    ? 'bg-rose-500/10 text-rose-400 animate-pulse' 
                    : kpiAlertas.estadoSemaforo === 'PRECAUCIÓN'
                    ? 'bg-amber-500/10 text-amber-400'
                    : 'bg-emerald-500/10 text-emerald-400'
                }`}>
                  <AlertTriangle className="w-4 h-4" />
                </div>
              </div>
              <div className="flex items-baseline gap-2">
                <span className={`text-3xl font-black tracking-tight ${
                  kpiAlertas.estadoSemaforo === 'CRÍTICO' 
                    ? 'text-rose-400' 
                    : kpiAlertas.estadoSemaforo === 'PRECAUCIÓN'
                    ? 'text-amber-400'
                    : 'text-emerald-400'
                }`}>
                  {kpiAlertas.hasBrecha 
                    ? `-${kpiAlertas.brechaFtes % 1 === 0 ? kpiAlertas.brechaFtes : kpiAlertas.brechaFtes.toFixed(1).replace('.', ',')} FTEs` 
                    : (kpiAlertas.superavitFtes > 0 ? `+${kpiAlertas.superavitFtes % 1 === 0 ? kpiAlertas.superavitFtes : kpiAlertas.superavitFtes.toFixed(1).replace('.', ',')} FTEs` : '0 FTEs')}
                </span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                  kpiAlertas.estadoSemaforo === 'CRÍTICO' 
                    ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' 
                    : kpiAlertas.estadoSemaforo === 'PRECAUCIÓN'
                    ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                    : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                }`}>
                  {kpiAlertas.estadoSemaforo}
                </span>
              </div>
              <p className="text-xs font-semibold text-[var(--text-secondary)] mt-1">
                {kpiAlertas.hasBrecha ? 'Brecha Proyectada frente a Meta' : 'Meta Cubierta (Sin Brecha)'}
              </p>
              <div className="mt-4 pt-3 border-t border-[var(--border-subtle)] flex items-center justify-between text-[11px]">
                <span className="text-[var(--text-muted)]">
                  {kpiAlertas.countSegBajoMeta} segm. &lt;70%
                </span>
                <button 
                  type="button"
                  onClick={() => setShowRiskModal(true)}
                  className="font-bold text-amber-400 hover:text-amber-300 transition-colors underline underline-offset-2 cursor-pointer flex items-center gap-1"
                  title="Clic para ver detalle de formadores en fuga crítica"
                >
                  {kpiAlertas.countFormadoresCriticos} form. &gt;35% fuga
                </button>
              </div>
            </div>

            {/* KPI 4: PROYECCIÓN DE CIERRE DE MES (RUN-RATE EN FTES) */}
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
                  {kpiProyeccion.iopProyectadoFtes % 1 === 0 
                    ? kpiProyeccion.iopProyectadoFtes.toLocaleString('es-PE') 
                    : kpiProyeccion.iopProyectadoFtes.toFixed(1).replace('.', ',')}
                  <span className="text-lg font-bold text-amber-400 ml-1.5">FTEs</span>
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
                Pases I-OP Estimados al Cierre (FTEs)
              </p>
              <div className="mt-4 pt-3 border-t border-[var(--border-subtle)] flex items-center justify-between text-[11px]">
                <span className="text-[var(--text-muted)]" title={`${kpiProyeccion.iopActual} documentos únicos registrados (${kpiProyeccion.iopActualFtes} FTEs)`}>
                  Día {kpiProyeccion.diasTranscurridos} de {kpiProyeccion.totalDaysInMonth} · <strong className="text-amber-400 font-mono">{kpiProyeccion.iopActual} personas</strong>
                </span>
                <span className="font-bold text-[var(--text-primary)] font-mono">
                  Meta: {kpis.rq_solicitado.toLocaleString('es-PE')} FTEs
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
                <div className="flex items-center gap-3">
                  <span className="text-[11px] text-[var(--text-muted)] font-mono">
                    En OJT: <strong className="text-teal-400">{kpis.activos_ojt.toLocaleString()}</strong>
                  </span>
                  <span>Graduación: <strong className="text-amber-400 font-mono">{kpis.ingresos_iop.toLocaleString()} I-OP</strong></span>
                </div>
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
                  <th className="py-3 px-3">Área / Origen</th>
                  <th className="py-3 px-3 text-center">Estado</th>
                  <th className="py-3 px-3">Segmento</th>
                  <th className="py-3 px-3">Local / Sede</th>
                  <th className="py-3 px-2 text-center">Semana</th>
                  <th className="py-3 px-3 text-center">Últ. Registro</th>
                  <th className="py-3 px-2 text-right">RQ</th>
                  <th className="py-3 px-2 text-right">Nómina</th>
                  <th className="py-3 px-2 text-right">Día 1</th>
                  <th className="py-3 px-2 text-right">OJT</th>
                  <th className="py-3 px-2 text-right">I-OP</th>
                  <th className="py-3 px-2 text-right text-emerald-400">I-OP (FTE)</th>
                </tr>
              </thead>
              <tbody key={`matrix_${filters.periodo}_${filters.semana}_${filters.segmento}_${filters.campana}_${filters.grupo}_${filters.estado}_${searchQuery}`} className="divide-y divide-[var(--border-subtle)]">
                {filteredData.map((d, i) => {
                  const areaNorm = String(d.area_traslado || '').trim().toUpperCase();
                  const req = getGrupoRq(d);
                  const estadoStr = String(d.estado || 'CERRADO').toUpperCase().trim();

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
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                          areaNorm === 'RECLUTAMIENTO'
                            ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                            : areaNorm === 'RECUPERADO'
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                        }`}>
                          {d.area_traslado || 'S/A'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-center whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                          isGrupoActivo(d)
                            ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                            : estadoStr.includes('PROYEC')
                            ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30'
                            : 'bg-slate-500/15 text-slate-300 border border-slate-500/30'
                        }`}>
                          {isGrupoActivo(d) ? '🟢 EN CURSO' : isGrupoCerrado(d) ? '⚪ CERRADO' : estadoStr}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-[var(--text-muted)] whitespace-nowrap">{normalizeSegmento(d.segmento, d.campana)}</td>
                      <td className="py-2.5 px-3 text-[var(--text-secondary)] whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded-md bg-slate-500/10 text-slate-300 border border-slate-500/20 text-[11px] font-semibold">
                          {d.sede || 'LIMA'}
                        </span>
                      </td>
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
                      <td className="py-2.5 px-2 text-right font-mono text-emerald-400 font-black">
                        {d.ingresos_iop_ftes !== undefined && d.ingresos_iop_ftes !== null
                          ? (Number.isInteger(d.ingresos_iop_ftes) ? `${d.ingresos_iop_ftes}.0` : d.ingresos_iop_ftes.toFixed(1))
                          : (d.ingresos_iop ? `${d.ingresos_iop}.0` : '0.0')}
                      </td>
                    </tr>
                  );
                })}
                {filteredData.length === 0 && (
                  <tr>
                    <td colSpan={15} className="py-12 text-center text-[var(--text-muted)]">
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

      {/* MODAL: DIAGNÓSTICO DE FORMADORES EN FUGA CRÍTICA (>35%) */}
      {showRiskModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-2xl bg-[var(--surface-elevated)] border border-[var(--border-strong)] rounded-2xl shadow-2xl p-6 overflow-hidden">
            <div className="flex items-center justify-between pb-4 border-b border-[var(--border-subtle)]">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400">
                  <ShieldAlert className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-[var(--text-primary)]">
                    Diagnóstico de Formadores con Fuga Crítica
                  </h3>
                  <p className="text-xs text-[var(--text-secondary)]">
                    Formadores con tasa de deserción &gt; 35% y muestra representativa (≥ 6 alumnos evaluados).
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowRiskModal(false)}
                className="w-8 h-8 rounded-lg bg-[var(--surface)] hover:bg-[var(--surface-hover)] border border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-primary)] flex items-center justify-center transition-all cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="mt-4 max-h-[60vh] overflow-y-auto pr-1">
              {kpiAlertas.formadoresCriticosList.length === 0 ? (
                <div className="py-12 text-center text-[var(--text-muted)]">
                  <CheckCircle2 className="w-10 h-10 mx-auto mb-2 text-emerald-400 opacity-60" />
                  <p className="font-bold text-sm text-[var(--text-primary)]">Sin formadores en fuga crítica</p>
                  <p className="text-xs text-[var(--text-secondary)] mt-1">
                    Ningún formador supera el 35% de deserción con el volumen mínimo evaluado.
                  </p>
                </div>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-[var(--border-subtle)] text-[var(--text-muted)] font-black uppercase text-[10px] tracking-wider">
                      <th className="pb-2.5">Formador</th>
                      <th className="pb-2.5">Campaña Principal</th>
                      <th className="pb-2.5 text-center">Evaluados</th>
                      <th className="pb-2.5 text-center">Bajas</th>
                      <th className="pb-2.5 text-right">% Fuga</th>
                      <th className="pb-2.5 text-center">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-subtle)]">
                    {kpiAlertas.formadoresCriticosList.map((f, idx) => (
                      <tr key={idx} className="hover:bg-[var(--surface-hover)] transition-colors">
                        <td className="py-2.5 font-bold text-[var(--text-primary)]">
                          {f.formador}
                        </td>
                        <td className="py-2.5 text-[var(--text-secondary)]">
                          {f.campana}
                        </td>
                        <td className="py-2.5 text-center font-mono text-[var(--text-primary)]">
                          {f.totalAlumnos}
                        </td>
                        <td className="py-2.5 text-center font-mono text-rose-400 font-bold">
                          {f.bajas}
                        </td>
                        <td className="py-2.5 text-right font-mono font-black text-rose-400">
                          {f.pctDesercion}%
                        </td>
                        <td className="py-2.5 text-center">
                          <button
                            type="button"
                            onClick={() => {
                              setSearchQuery(f.formador);
                              setShowRiskModal(false);
                            }}
                            className="px-2 py-0.5 rounded bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 text-[10px] font-bold transition-colors cursor-pointer"
                            title="Filtrar grupos de este formador en la vista"
                          >
                            Filtrar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="mt-4 pt-3 border-t border-[var(--border-subtle)] flex items-center justify-between text-xs text-[var(--text-muted)]">
              <span>Total identificados: <strong className="text-[var(--text-primary)]">{kpiAlertas.formadoresCriticosList.length}</strong></span>
              <button
                type="button"
                onClick={() => setShowRiskModal(false)}
                className="px-4 py-1.5 rounded-lg bg-[var(--surface)] hover:bg-[var(--surface-hover)] border border-[var(--border-subtle)] text-[var(--text-primary)] font-bold transition-all cursor-pointer text-xs"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
