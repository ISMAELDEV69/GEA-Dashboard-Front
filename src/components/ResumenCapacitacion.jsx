import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { fetchCapacidadRysOperativo, getMetricasResumenCapacitacion, agruparMetricasPorModalidad, parseFechaAsistencia, invalidateCache } from '../lib/dataService';
import { 
  BarChart3, 
  Users, 
  CheckCircle2, 
  UserCheck, 
  CalendarCheck, 
  ShieldCheck, 
  Download, 
  TrendingDown, 
  RefreshCw, 
  AlertCircle,
  ChevronDown,
  Activity,
  Layers,
  ArrowRight,
  RotateCcw,
  Sparkles,
  Table as TableIcon,
  Building2,
  Laptop,
  GitCompare
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
  AreaChart, 
  Area 
} from 'recharts';

import Card, { CardHeader, CardTitle, CardDescription, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { ChartTooltipContent } from './ui/chart-tooltip';
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogClose, DialogContent } from './ui/dialog';
import { chartColors } from '../lib/chart-theme';
import ViewLoadingSkeleton from './ui/ViewLoadingSkeleton';

// In-Memory Cache for Instant 0ms Tab Switching
let memoryCacheCapacidad = null;
let memoryCacheMetricas = null;

export default function ResumenCapacitacion() {
  const [capacidadRys, setCapacidadRys] = useState(() => memoryCacheCapacidad || []);
  const [data, setData] = useState(() => memoryCacheMetricas || []);
  const [loading, setLoading] = useState(() => !memoryCacheCapacidad || !memoryCacheMetricas);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [isTableModalOpen, setIsTableModalOpen] = useState(false);

  const [filters, setFilters] = useState({
    periodo: 'Todos',
    semana: 'Todas',
    segmento: 'Todos',
    campana: 'Todas',
    grupo: 'Todos'
  });


  const loadData = useCallback(async (force = false) => {
    try {
      if (force || (!memoryCacheCapacidad && !memoryCacheMetricas)) {
        setLoading(true);
      } else {
        setIsRefreshing(true);
      }
      setError(null);
      if (force) {
        invalidateCache('resumen_cap_');
      }
      const gruposInfo = await fetchCapacidadRysOperativo();
      const metricas = await getMetricasResumenCapacitacion(gruposInfo || []);
      
      memoryCacheCapacidad = gruposInfo || [];
      memoryCacheMetricas = metricas || [];
      
      setCapacidadRys(gruposInfo || []);
      setData(metricas || []);
    } catch (err) {
      console.error('Error fetching resumen:', err);
      if (!memoryCacheMetricas) {
        setError(err.message || 'Error cargando datos de resumen');
      }
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData(false);
  }, [loadData]);

  // Verificar si hay filtros activos
  const hasActiveFilters = useMemo(() => {
    return filters.periodo !== 'Todos' ||
      filters.semana !== 'Todas' ||
      filters.segmento !== 'Todos' ||
      filters.campana !== 'Todas' ||
      filters.grupo !== 'Todos';
  }, [filters]);

  const handleResetFilters = () => {
    setFilters({
      periodo: 'Todos',
      semana: 'Todas',
      segmento: 'Todos',
      campana: 'Todas',
      grupo: 'Todos'
    });
  };

  // Opciones de filtros cruzados
  const filterOptions = useMemo(() => {
    const getSemana = g => g.semana_trabajo || g.semana_label || g.semana || '';

    const periodos = new Set(capacidadRys.map(g => g.periodo).filter(Boolean));
    const subSemanas = capacidadRys.filter(g => filters.periodo === 'Todos' || g.periodo === filters.periodo);
    const semanas = new Set(subSemanas.map(g => getSemana(g)).filter(Boolean));
    const subSegmentos = subSemanas.filter(g => filters.semana === 'Todas' || getSemana(g) === filters.semana);
    const segmentos = new Set(subSegmentos.map(g => g.segmento).filter(Boolean));
    const subCampanas = subSegmentos.filter(g => filters.segmento === 'Todos' || g.segmento === filters.segmento);
    const campanas = new Set(subCampanas.map(g => g.campana).filter(Boolean));
    const subGrupos = subCampanas.filter(g => filters.campana === 'Todas' || g.campana === filters.campana);
    const grupos = new Set(subGrupos.map(g => g.codigo || g.grupo_codigo).filter(Boolean));

    return {
      periodos: Array.from(periodos).sort().reverse(),
      semanas: Array.from(semanas).sort(),
      segmentos: Array.from(segmentos).sort(),
      campanas: Array.from(campanas).sort(),
      grupos: Array.from(grupos).sort()
    };
  }, [capacidadRys, filters]);

  // Datos filtrados
  const filteredData = useMemo(() => {
    return data.filter(d => {
      if (filters.periodo !== 'Todos' && d.periodo !== filters.periodo) return false;
      if (filters.semana !== 'Todas' && d.semana !== filters.semana) return false;
      if (filters.segmento !== 'Todos' && d.segmento !== filters.segmento) return false;
      if (filters.campana !== 'Todas' && d.campana !== filters.campana) return false;
      if (filters.grupo !== 'Todos' && d.grupo_codigo !== filters.grupo) return false;
      return true;
    });
  }, [data, filters]);

  // Totales de KPIs
  const kpis = useMemo(() => {
    return filteredData.reduce((acc, curr) => {
      acc.total_nomina += curr.total_nomina || 0;
      acc.asistio_dia0 += curr.asistio_dia0 || 0;
      acc.asistio_dia1 += curr.asistio_dia1 || 0;
      acc.activos_ojt += curr.activos_ojt || 0;
      acc.ingresos_iop += curr.ingresos_iop || 0;
      acc.activos_actuales += curr.activos_actuales || 0;
      return acc;
    }, {
      total_nomina: 0,
      asistio_dia0: 0,
      asistio_dia1: 0,
      activos_ojt: 0,
      ingresos_iop: 0,
      activos_actuales: 0
    });
  }, [filteredData]);

  // Porcentajes de conversión entre etapas
  const kpiPercentages = useMemo(() => {
    const total = kpis.total_nomina || 0;
    const d0 = kpis.asistio_dia0 || 0;
    const d1 = kpis.asistio_dia1 || 0;
    const ojt = kpis.activos_ojt || 0;
    const iop = kpis.ingresos_iop || 0;
    const act = kpis.activos_actuales || 0;

    return {
      dia0_vs_nomina: total > 0 ? Math.round((d0 / total) * 100) : 0,
      dia1_vs_dia0: d0 > 0 ? Math.round((d1 / d0) * 100) : 0,
      ojt_vs_dia1: d1 > 0 ? Math.round((ojt / d1) * 100) : 0,
      iop_vs_nomina: total > 0 ? Math.round((iop / total) * 100) : 0,
      act_vs_nomina: total > 0 ? Math.round((act / total) * 100) : 0,
    };
  }, [kpis]);

  // Datos Agrupados (Resumen por Campaña)
  const groupedData = useMemo(() => {
    const map = new Map();
    filteredData.forEach(d => {
      const key = d.campana || 'SIN CAMPAÑA';
      if (!map.has(key)) {
        map.set(key, { 
          campana: key, 
          total_nomina: 0, 
          asistio_dia0: 0, 
          asistio_dia1: 0, 
          activos_ojt: 0, 
          ingresos_iop: 0, 
          activos_actuales: 0,
          requerimiento: 0,
          grupos: [] 
        });
      }
      const g = map.get(key);
      g.total_nomina += d.total_nomina || 0;
      g.asistio_dia0 += d.asistio_dia0 || 0;
      g.asistio_dia1 += d.asistio_dia1 || 0;
      g.activos_ojt += d.activos_ojt || 0;
      g.ingresos_iop += d.ingresos_iop || 0;
      g.activos_actuales += d.activos_actuales || 0;
      g.requerimiento += d.requerimiento || d.rq_solicitado || d.total_nomina || 0;
      g.grupos.push(d);
    });
    return Array.from(map.values()).sort((a, b) => b.activos_actuales - a.activos_actuales);
  }, [filteredData]);

  // Curva de Deserción Acumulada
  const desertionTrend = useMemo(() => {
    const allAsistencias = [];
    filteredData.forEach(d => {
      if (d.asistencias_raw && Array.isArray(d.asistencias_raw)) {
        allAsistencias.push(...d.asistencias_raw);
      }
    });

    const dailyBajas = {};
    const seenBajas = new Set();

    const sortedForBajas = [...allAsistencias].sort((a, b) => {
      const dateA = parseFechaAsistencia(a.fecha_registro_asistencia || '');
      const dateB = parseFechaAsistencia(b.fecha_registro_asistencia || '');
      return new Date(dateA) - new Date(dateB);
    });

    sortedForBajas.forEach(a => {
      const sigla = String(a.sigla || '').toUpperCase().trim();
      const estado = String(a.estado || '').toUpperCase().trim();
      const motivo = String(a.motivo_baja || '').toUpperCase().trim();

      const isBaja = sigla === 'B' || motivo.includes('BAJA') || estado === 'CESADO' || estado === 'BAJA' || estado === 'INACTIVO';

      if (isBaja && a.documento) {
        if (!seenBajas.has(a.documento)) {
          seenBajas.add(a.documento);
          const date = parseFechaAsistencia(a.fecha_registro_asistencia || '');
          if (date && date.length === 10) {
            if (!dailyBajas[date]) dailyBajas[date] = 0;
            dailyBajas[date]++;
          }
        }
      }
    });

    const datesSorted = Object.keys(dailyBajas).sort((a, b) => new Date(a) - new Date(b));
    let cum = 0;
    return datesSorted.map(d => {
      cum += dailyBajas[d];
      return { Fecha: d, BajasAcumuladas: cum, BajasDia: dailyBajas[d] };
    });
  }, [filteredData]);

  // Datos Comparativa Modalidad (Presencial vs Remoto [vs Híbrido])
  const modalidadData = useMemo(() => {
    return agruparMetricasPorModalidad(filteredData);
  }, [filteredData]);

  const modalidadChartData = useMemo(() => {
    return modalidadData.map(m => ({
      name: m.label,
      modalidad: m.modalidad,
      'Retención Día 1 (%)': m.pct_retencion_dia1,
      'Conversión I-OP (%)': m.pct_conversion_iop_nomina,
      total_nomina: m.total_nomina,
      asistio_dia0: m.asistio_dia0,
      asistio_dia1: m.asistio_dia1,
      ingresos_iop: m.ingresos_iop,
      activos_actuales: m.activos_actuales,
      pct_dia0: m.pct_asistencia_dia0,
    }));
  }, [modalidadData]);

  const handleExport = () => {
    if (filteredData.length === 0) return;
    const ws = XLSX.utils.json_to_sheet(filteredData.map(d => {
      const desertores = Math.max(0, (d.asistio_dia1 || 0) - (d.activos_actuales || 0) - (d.ingresos_iop || 0));
      const pctDesercion = (d.asistio_dia1 || 0) > 0 ? `${Math.round((desertores / d.asistio_dia1) * 100)}%` : '0%';
      const pctRetencion = (d.total_nomina || 0) > 0 ? `${Math.round(((d.activos_actuales || 0) / d.total_nomina) * 100)}%` : '0%';
      const req = d.requerimiento || d.rq_solicitado || d.total_nomina || 0;
      const pctDotacion = req > 0 ? `${Math.round(((d.ingresos_iop || 0) / req) * 100)}%` : '0%';

      return {
        'Periodo': d.periodo,
        'Semana': d.semana,
        'Segmento': d.segmento,
        'Campaña': d.campana,
        'Grupo (GPE)': d.grupo_codigo,
        'Fecha Inicio OJT': d.fecha_inicio_ojt,
        'Requerimiento': req,
        'Total Nómina': d.total_nomina,
        'Asistió Día 0': d.asistio_dia0,
        'Asistió Día 1': d.asistio_dia1,
        'Activos en OJT': d.activos_ojt,
        'Ingresos I-OP (Dotación Real)': d.ingresos_iop,
        'Activos Actuales': d.activos_actuales,
        'Desertores': desertores,
        '% Deserción (Desertores / Día 1)': pctDesercion,
        '% Retención (Actuales / Nómina)': pctRetencion,
        '% Dotación (I-OP / Requerimiento)': pctDotacion
      };
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Resumen");
    XLSX.writeFile(wb, `Resumen_Capacitacion_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  if (loading && (!data || data.length === 0)) {
    return <ViewLoadingSkeleton title="Calculando métricas de capacitación..." />;
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <Card className="flex flex-col items-center gap-4 bg-rose-500/10 p-6 text-center border-rose-500/20 max-w-md">
          <div className="rounded-full bg-rose-500/20 p-2.5 text-rose-500">
            <AlertCircle className="h-6 w-6" />
          </div>
          <h3 className="text-base font-bold text-rose-500">Error al cargar datos</h3>
          <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>
          <button 
            onClick={loadData}
            className="mt-1 rounded-xl bg-rose-500/20 px-5 py-2 text-xs font-semibold text-rose-500 transition-colors hover:bg-rose-500/30 flex items-center gap-2"
          >
            <RefreshCw size={14} /> Reintentar
          </button>
        </Card>
      </div>
    );
  }

  const funnelData = [
    { name: 'Nómina', value: kpis.total_nomina, color: chartColors.funnelGradient[0], pct: '100%' },
    { name: 'Día 0', value: kpis.asistio_dia0, color: chartColors.funnelGradient[1], pct: `${kpiPercentages.dia0_vs_nomina}%` },
    { name: 'Día 1', value: kpis.asistio_dia1, color: chartColors.funnelGradient[2], pct: `${kpiPercentages.dia1_vs_dia0}%` },
    { name: 'OJT', value: kpis.activos_ojt, color: chartColors.funnelGradient[3], pct: `${kpiPercentages.ojt_vs_dia1}%` },
    { name: 'I-OP', value: kpis.ingresos_iop, color: chartColors.funnelGradient[4], pct: `${kpiPercentages.iop_vs_nomina}%` },
    { name: 'Actuales', value: kpis.activos_actuales, color: chartColors.funnelGradient[5], pct: `${kpiPercentages.act_vs_nomina}%` },
  ];

  // Helper para renderizar cada Select de filtro con estados interactivos
  const renderFilterSelect = (label, key, options, allText, maxWidth = 'max-w-[150px]') => {
    const isActive = filters[key] !== 'Todos' && filters[key] !== 'Todas';
    return (
      <div className="relative inline-flex items-center">
        <select
          value={filters[key]}
          onChange={(e) => setFilters(prev => ({
            ...prev,
            [key]: e.target.value,
            ...(key === 'periodo' ? { semana: 'Todas', segmento: 'Todos', campana: 'Todas', grupo: 'Todos' } : {}),
            ...(key === 'semana' ? { segmento: 'Todos', campana: 'Todas', grupo: 'Todos' } : {}),
            ...(key === 'segmento' ? { campana: 'Todas', grupo: 'Todos' } : {}),
            ...(key === 'campana' ? { grupo: 'Todos' } : {}),
          }))}
          className={`
            h-8.5 rounded-lg pl-3 pr-7 text-[11px] font-semibold transition-all duration-200 cursor-pointer appearance-none border focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20 ${maxWidth} truncate
            ${isActive 
              ? 'bg-[var(--accent)]/15 border-[var(--accent)] text-[var(--accent)] shadow-sm' 
              : 'bg-[var(--bg-elevated)] border-[var(--border-normal)] text-[var(--text-muted)] hover:border-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }
          `}
        >
          <option value={allText.includes('Todas') ? 'Todas' : 'Todos'} className="bg-[var(--bg-surface)] text-[var(--text-primary)]">
            {label}: {allText}
          </option>
          {options.map(opt => (
            <option key={opt} value={opt} className="bg-[var(--bg-surface)] text-[var(--text-primary)]">
              {opt}
            </option>
          ))}
        </select>
        {isActive && (
          <span className="absolute left-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-[var(--accent)] animate-pulse pointer-events-none" />
        )}
        <ChevronDown className={`pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 ${isActive ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'}`} />
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto custom-scrollbar p-3 md:p-4 gap-3 text-[var(--text-primary)]">
      
      {/* ─────────────────────────────────────────────────────────────
          FILA 1: HEADER + FILTROS SHADCN (Single-line Compact Looker Studio)
          ───────────────────────────────────────────────────────────── */}
      <Card noPadding className="p-3 shadow-xs shrink-0 border-[var(--border-subtle)]">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          
          {/* Título */}
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-[var(--accent)]/10 text-[var(--accent)] flex-shrink-0">
              <BarChart3 className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-black tracking-tight text-[var(--text-primary)] leading-tight">
                  RESUMEN CAPACITACIÓN
                </h1>
                <Badge variant="outline" className="text-[10px] py-0 px-1.5 border-[var(--accent)]/30 text-[var(--accent)]">
                  Live
                </Badge>
              </div>
              <p className="text-[10px] font-medium text-[var(--text-muted)]">
                {filteredData.length} grupos filtrados • {groupedData.length} campañas activas
              </p>
            </div>
          </div>
          
          {/* Filtros agrupados */}
          <div className="flex flex-wrap items-center gap-2">
            
            {/* Grupo Temporal */}
            <div className="flex items-center gap-1.5">
              {renderFilterSelect('Periodo', 'periodo', filterOptions.periodos, 'Todos', 'max-w-[125px]')}
              {renderFilterSelect('Semana', 'semana', filterOptions.semanas, 'Todas', 'max-w-[120px]')}
            </div>

            {/* Divisor vertical */}
            <div className="hidden lg:block h-5 w-px bg-[var(--border-normal)] mx-0.5" />

            {/* Grupo de Negocio */}
            <div className="flex items-center gap-1.5">
              {renderFilterSelect('Segmento', 'segmento', filterOptions.segmentos, 'Todos', 'max-w-[130px]')}
              {renderFilterSelect('Campaña', 'campana', filterOptions.campanas, 'Todas', 'max-w-[150px]')}
              {renderFilterSelect('Grupo', 'grupo', filterOptions.grupos, 'Todos', 'max-w-[135px]')}
            </div>

            {/* Botón Limpiar Filtros (aparece solo cuando hay activos) */}
            {hasActiveFilters && (
              <button
                onClick={handleResetFilters}
                title="Limpiar todos los filtros"
                className="inline-flex items-center gap-1 h-8.5 px-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 text-[11px] font-bold shadow-xs transition-all duration-150 active:scale-95 cursor-pointer animate-fadeIn"
              >
                <RotateCcw className="h-3 w-3" />
                <span>Limpiar</span>
              </button>
            )}

            {/* Divisor antes de acciones */}
            <div className="hidden lg:block h-5 w-px bg-[var(--border-normal)] mx-0.5" />

            {/* Botón Excel */}
            <button
              onClick={handleExport}
              className="inline-flex items-center gap-1.5 h-8.5 px-3 rounded-lg border border-[var(--border-normal)] bg-[var(--bg-surface)] hover:bg-[var(--bg-elevated)] text-[var(--text-primary)] text-[11px] font-bold shadow-xs transition-all duration-150 active:scale-95 cursor-pointer"
            >
              <Download className="h-3.5 w-3.5 text-[var(--accent)]" />
              <span>Excel</span>
            </button>
          </div>
        </div>
      </Card>

      {/* ─────────────────────────────────────────────────────────────
          FILA 2: 6 KPIs LOOKER STUDIO (Compact p-3.5, text-xl, tabular-nums)
          ───────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2.5 shrink-0">
        {[
          { 
            label: 'Total Nómina', 
            value: kpis.total_nomina, 
            icon: Users, 
            color: 'text-blue-500', 
            bg: 'bg-blue-500/10',
            delta: '100%',
            deltaType: 'default',
            sub: 'Base total'
          },
          { 
            label: 'Asistió Día 0', 
            value: kpis.asistio_dia0, 
            icon: CheckCircle2, 
            color: 'text-indigo-500', 
            bg: 'bg-indigo-500/10',
            delta: `${kpiPercentages.dia0_vs_nomina}%`,
            deltaType: kpiPercentages.dia0_vs_nomina >= 80 ? 'success' : 'warning',
            sub: 'vs Nómina'
          },
          { 
            label: 'Asistió Día 1', 
            value: kpis.asistio_dia1, 
            icon: CalendarCheck, 
            color: 'text-purple-500', 
            bg: 'bg-purple-500/10',
            delta: `${kpiPercentages.dia1_vs_dia0}%`,
            deltaType: kpiPercentages.dia1_vs_dia0 >= 80 ? 'success' : 'warning',
            sub: 'vs Día 0'
          },
          { 
            label: 'Activos en OJT', 
            value: kpis.activos_ojt, 
            icon: ShieldCheck, 
            color: 'text-emerald-500', 
            bg: 'bg-emerald-500/10',
            delta: `${kpiPercentages.ojt_vs_dia1}%`,
            deltaType: kpiPercentages.ojt_vs_dia1 >= 75 ? 'success' : 'warning',
            sub: 'vs Día 1'
          },
          { 
            label: 'Ingresos (I-OP)', 
            value: kpis.ingresos_iop, 
            icon: UserCheck, 
            color: 'text-amber-500', 
            bg: 'bg-amber-500/10',
            delta: `${kpiPercentages.iop_vs_nomina}%`,
            deltaType: kpiPercentages.iop_vs_nomina >= 50 ? 'success' : 'destructive',
            sub: 'Conversión OP'
          },
          { 
            label: 'Activos Actuales', 
            value: kpis.activos_actuales, 
            icon: Activity, 
            color: 'text-cyan-500', 
            bg: 'bg-cyan-500/10',
            delta: `${kpiPercentages.act_vs_nomina}%`,
            deltaType: 'secondary',
            sub: 'Retención neta'
          },
        ].map((kpi, idx) => (
          <Card key={idx} noPadding className="p-3 rounded-xl flex flex-col justify-between shadow-xs hover:border-[var(--border-normal)] transition-all">
            <div className="flex items-center justify-between">
              <div className={`rounded-md p-1.5 ${kpi.bg} ${kpi.color}`}>
                <kpi.icon className="h-3.5 w-3.5" />
              </div>
              <Badge variant={kpi.deltaType} className="text-[9px] font-mono px-1.5 py-0">
                {kpi.delta}
              </Badge>
            </div>
            <div className="mt-1.5">
              <p className="text-[10px] font-bold tracking-wider text-[var(--text-muted)] uppercase truncate">
                {kpi.label}
              </p>
              <div className="flex items-baseline justify-between mt-0.5">
                <span className="text-xl font-black tracking-tight text-[var(--text-primary)] tabular-nums">
                  {kpi.value.toLocaleString()}
                </span>
                <span className="text-[9px] text-[var(--text-muted)] font-medium truncate ml-1">
                  {kpi.sub}
                </span>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* ─────────────────────────────────────────────────────────────
          FILA 3: GRID 2×2 LOOKER STUDIO (Spacious Cards, No Overlap)
          ───────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5 shrink-0">
        
        {/* CUADRANTE 1 (Top-Left): Embudo de Conversión Horizontal Centrado + Actuales Aparte */}
        <Card noPadding className="flex flex-col h-[280px] overflow-hidden shadow-xs border-[var(--border-subtle)] p-3.5">
          <div className="flex items-center justify-between pb-2 mb-1 border-b border-[var(--border-subtle)] shrink-0">
            <div>
              <h2 className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                Embudo de Conversión General
              </h2>
              <p className="text-[10px] text-[var(--text-muted)]">Retención acumulada progresiva por etapa</p>
            </div>
            <Badge variant="secondary" className="text-[10px] font-mono py-0 px-2">
              {kpis.total_nomina} Evaluados
            </Badge>
          </div>

          <div className="flex-1 min-h-0 flex flex-col md:flex-row gap-3 items-center justify-between">
            {/* LADO IZQUIERDO: Embudo Horizontal Centrado (5 Etapas) */}
            <div className="flex-1 min-h-0 w-full flex flex-col justify-around py-0.5 space-y-1.5">
              {[
                { label: 'Nómina', count: kpis.total_nomina, pct: '100%', bg: 'from-blue-500 to-indigo-600', shadow: 'shadow-blue-500/20' },
                { label: 'Día 0', count: kpis.asistio_dia0, pct: `${kpiPercentages.dia0_vs_nomina}%`, bg: 'from-indigo-500 to-purple-600', shadow: 'shadow-indigo-500/20' },
                { label: 'Día 1', count: kpis.asistio_dia1, pct: `${((kpis.asistio_dia1 / (kpis.total_nomina || 1)) * 100).toFixed(1)}%`, bg: 'from-purple-500 to-violet-600', shadow: 'shadow-purple-500/20' },
                { label: 'OJT', count: kpis.activos_ojt, pct: `${((kpis.activos_ojt / (kpis.total_nomina || 1)) * 100).toFixed(1)}%`, bg: 'from-emerald-500 to-teal-600', shadow: 'shadow-emerald-500/20' },
                { label: 'I-OP', count: kpis.ingresos_iop, pct: `${kpiPercentages.iop_vs_nomina}%`, bg: 'from-amber-500 to-orange-500', shadow: 'shadow-amber-500/20' },
              ].map((stage, idx) => {
                const maxVal = Math.max(kpis.total_nomina || 1, 1);
                // Calcular ancho proporcional con mínimo visible
                const widthPct = Math.max(Math.round((stage.count / maxVal) * 100), stage.count > 0 ? 14 : 6);
                
                return (
                  <div key={idx} className="flex items-center gap-2 text-xs group">
                    {/* Etiqueta Izquierda */}
                    <span className="w-14 text-[11px] font-semibold text-[var(--text-secondary)] truncate text-left">
                      {stage.label}
                    </span>

                    {/* Contenedor del Embudo Centrado */}
                    <div className="flex-1 flex items-center justify-center relative h-5 sm:h-6">
                      <div 
                        style={{ width: `${widthPct}%` }}
                        className={`
                          h-full rounded-md sm:rounded-lg bg-gradient-to-r ${stage.bg} ${stage.shadow} shadow-sm
                          flex items-center justify-center px-2 transition-all duration-500 ease-out
                          group-hover:scale-y-110 group-hover:brightness-110 cursor-pointer
                        `}
                        title={`${stage.label}: ${stage.count} (${stage.pct})`}
                      >
                        <span className="text-[11px] font-bold text-white tracking-wide drop-shadow-xs tabular-nums">
                          {stage.count}
                        </span>
                      </div>
                    </div>

                    {/* Porcentaje Derecho */}
                    <span className="w-12 text-[10px] font-mono font-bold text-[var(--text-muted)] text-right tabular-nums group-hover:text-[var(--text-primary)] transition-colors">
                      {stage.pct}
                    </span>
                  </div>
                )
              })}
            </div>

            {/* DIVISOR VERTICAL */}
            <div className="hidden md:block w-px self-stretch bg-[var(--border-subtle)] my-1" />

            {/* LADO DERECHO: BARRA / CARD APARTE DE "ACTUALES" */}
            <div className="w-full md:w-36 shrink-0 bg-[var(--bg-elevated)]/60 rounded-xl p-2.5 border border-cyan-500/20 flex flex-col justify-between items-center text-center shadow-xs">
              <div className="w-full flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-400">Actuales</span>
                <span className="flex h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse" />
              </div>
              
              <div className="my-1.5">
                <span className="text-3xl font-black text-[var(--text-primary)] tabular-nums tracking-tight">
                  {kpis.activos_actuales}
                </span>
              </div>

              {/* Mini Barra de Retención Actual */}
              <div className="w-full space-y-1">
                <div className="flex justify-between text-[9px] font-mono text-[var(--text-muted)]">
                  <span>Retención</span>
                  <span className="font-bold text-cyan-400">{kpiPercentages.act_vs_nomina}%</span>
                </div>
                <div className="h-2 w-full bg-[var(--bg-base)] rounded-full overflow-hidden p-0.5 border border-[var(--border-subtle)]">
                  <div 
                    className="h-full bg-gradient-to-r from-cyan-500 to-emerald-400 rounded-full transition-all duration-700"
                    style={{ width: `${Math.min(parseFloat(kpiPercentages.act_vs_nomina) || 0, 100)}%` }}
                  />
                </div>
              </div>
            </div>

          </div>
        </Card>

        {/* CUADRANTE 2 (Top-Right): Activos por Campaña */}
        <Card noPadding className="flex flex-col h-[280px] overflow-hidden shadow-xs border-[var(--border-subtle)] p-3.5">
          <div className="flex items-center justify-between pb-2 mb-1 border-b border-[var(--border-subtle)] shrink-0">
            <div>
              <h2 className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                Activos Actuales por Campaña
              </h2>
              <p className="text-[10px] text-[var(--text-muted)]">Distribución horizontal por volumen</p>
            </div>
            <Badge variant="outline" className="text-[10px] font-mono py-0 px-2 text-cyan-500 border-cyan-500/30">
              {groupedData.length} Campañas
            </Badge>
          </div>
          <div className="flex-1 min-h-0 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={groupedData.slice(0, 8).map(g => ({ name: g.campana, activos: g.activos_actuales })).sort((a, b) => b.activos - a.activos)}
                layout="vertical"
                margin={{ top: 5, right: 15, left: 10, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-normal)" opacity={0.2} horizontal={false} />
                <XAxis 
                  type="number" 
                  tick={{ fontSize: 10, fill: 'var(--text-muted)' }} 
                  axisLine={false} 
                  tickLine={false} 
                />
                <YAxis 
                  dataKey="name" 
                  type="category" 
                  tick={{ fontSize: 9.5, fill: 'var(--text-muted)' }} 
                  axisLine={false} 
                  tickLine={false} 
                  width={115}
                  tickFormatter={(name) => (name.length > 16 ? `${name.substring(0, 15)}…` : name)}
                />
                <RechartsTooltip 
                  content={<ChartTooltipContent 
                    labelFormatter={(label) => `Campaña: ${label}`}
                    formatter={(val) => [`${val} activos`, 'Personas']}
                  />}
                  cursor={{ fill: 'var(--bg-elevated)', opacity: 0.4, radius: 4 }}
                />
                <Bar 
                  dataKey="activos" 
                  fill={chartColors.campaignPrimary} 
                  radius={[0, 5, 5, 0]} 
                  barSize={14} 
                  animationDuration={700}
                  className="hover:opacity-85 cursor-pointer"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* CUADRANTE 3 (Bottom-Left): Curva de Deserción Acumulada */}
        <Card noPadding className="flex flex-col h-[280px] overflow-hidden shadow-xs border-rose-500/15 p-3.5">
          <div className="flex items-center justify-between pb-2 mb-1 border-b border-[var(--border-subtle)] shrink-0">
            <div>
              <h2 className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                <TrendingDown size={14} className="text-rose-500" />
                Curva de Deserción Acumulada
              </h2>
              <p className="text-[10px] text-[var(--text-muted)]">Evolución de bajas en el período</p>
            </div>
            {desertionTrend.length > 0 && (
              <Badge variant="destructive" className="text-[10px] font-mono py-0 px-2">
                {desertionTrend[desertionTrend.length - 1]?.BajasAcumuladas || 0} Bajas
              </Badge>
            )}
          </div>
          <div className="flex-1 min-h-0 w-full">
            {desertionTrend.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={desertionTrend} margin={{ top: 10, right: 15, left: -25, bottom: 5 }}>
                  <defs>
                    <linearGradient id="colorBajaResumenCap" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ef4444" stopOpacity={0.35}/>
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0.02}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-normal)" opacity={0.2} vertical={false} />
                  <XAxis 
                    dataKey="Fecha" 
                    tick={{ fontSize: 9.5, fill: 'var(--text-muted)' }} 
                    axisLine={false} 
                    tickLine={false} 
                  />
                  <YAxis 
                    domain={[0, 'dataMax']} 
                    tick={{ fontSize: 10, fill: 'var(--text-muted)' }} 
                    axisLine={false} 
                    tickLine={false} 
                  />
                  <RechartsTooltip
                    content={<ChartTooltipContent 
                      labelFormatter={(label) => `Fecha: ${label}`}
                      formatter={(val, name, item) => [
                        `${val} acumuladas (${item.payload.BajasDia || 0} en el día)`,
                        'Bajas'
                      ]}
                    />}
                    cursor={{ stroke: '#ef4444', strokeWidth: 1, strokeDasharray: '3 3' }}
                  />
                  <Area 
                    type="monotone" 
                    name="Bajas Acumuladas" 
                    dataKey="BajasAcumuladas" 
                    stroke="#ef4444" 
                    strokeWidth={2} 
                    fillOpacity={1} 
                    fill="url(#colorBajaResumenCap)" 
                    animationDuration={800}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-[var(--text-muted)] text-xs">
                No hay datos de bajas registradas.
              </div>
            )}
          </div>
        </Card>

        {/* CUADRANTE 4 (Bottom-Right): Top Campañas + Botón "Ver tabla completa" */}
        <Card noPadding className="flex flex-col h-[280px] overflow-hidden shadow-xs border-[var(--border-subtle)] p-3.5">
          <div className="flex items-center justify-between pb-2 mb-1 border-b border-[var(--border-subtle)] shrink-0">
            <div>
              <h2 className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                <Sparkles size={14} className="text-[var(--accent)]" />
                Top Campañas en Gestión
              </h2>
              <p className="text-[10px] text-[var(--text-muted)]">
                {kpis.activos_actuales} activos en {groupedData.length} campañas
              </p>
            </div>
            <button
              onClick={() => setIsTableModalOpen(true)}
              className="inline-flex items-center gap-1 text-[11px] font-bold text-[var(--accent)] hover:underline cursor-pointer transition-all"
            >
              <span>Ver tabla completa</span>
              <ArrowRight className="h-3 w-3" />
            </button>
          </div>

          {/* Mini-lista compacta con barra de progreso */}
          <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-1 space-y-2">
            {groupedData.length === 0 ? (
              <div className="flex items-center justify-center h-full text-[var(--text-muted)] text-xs">
                No hay campañas activas con los filtros aplicados.
              </div>
            ) : (
              groupedData.slice(0, 5).map((c, i) => {
                const maxActivos = groupedData[0]?.activos_actuales || 1;
                const barPct = Math.round((c.activos_actuales / maxActivos) * 100);
                const retRate = c.total_nomina > 0 ? Math.round((c.activos_actuales / c.total_nomina) * 100) : 0;

                return (
                  <div key={c.campana} className="p-2 rounded-lg bg-[var(--bg-elevated)]/40 hover:bg-[var(--bg-elevated)] transition-colors border border-[var(--border-subtle)]">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-bold text-[var(--text-primary)] truncate max-w-[180px] text-[11px]">
                        {i + 1}. {c.campana}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono text-emerald-500 font-semibold">
                          {retRate}% ret.
                        </span>
                        <span className="text-xs font-black tabular-nums text-[var(--text-primary)]">
                          {c.activos_actuales} <span className="text-[10px] font-normal text-[var(--text-muted)]">/ {c.total_nomina}</span>
                        </span>
                      </div>
                    </div>
                    {/* Barra inline */}
                    <div className="h-1.5 w-full bg-[var(--bg-surface)] rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-[var(--accent)] to-cyan-400 rounded-full transition-all duration-500"
                        style={{ width: `${barPct}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </Card>

      </div>

      {/* ─────────────────────────────────────────────────────────────
          FILA 4: COMPARATIVA DE MODALIDAD (Presencial vs Remoto)
          ───────────────────────────────────────────────────────────── */}
      <Card noPadding className="flex flex-col shadow-xs border-[var(--border-subtle)] p-3.5 shrink-0">
        {/* Header de la tarjeta */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-2.5 mb-2.5 border-b border-[var(--border-subtle)] gap-2">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400">
              <GitCompare className="h-4 w-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xs font-bold text-[var(--text-primary)]">
                  Comparativa de Modalidad: Presencial vs. Remoto
                </h2>
                <Badge variant="outline" className="text-[10px] py-0 px-1.5 border-indigo-500/30 text-indigo-400 font-mono">
                  {modalidadData.reduce((acc, m) => acc + m.total_nomina, 0)} nóminas
                </Badge>
              </div>
              <p className="text-[10px] text-[var(--text-muted)]">
                Retención en Día 1 (sobre Día 0) y Conversión a Ingresos I-OP (sobre Nómina) por entorno de trabajo
              </p>
            </div>
          </div>

          {/* Leyenda y badges de series */}
          <div className="flex items-center gap-3 text-[11px]">
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-xs bg-[#8B5CF6]" />
              <span className="text-[10px] font-semibold text-[var(--text-muted)]">Retención Día 1 (%)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-xs bg-[#F59E0B]" />
              <span className="text-[10px] font-semibold text-[var(--text-muted)]">Conversión I-OP (%)</span>
            </div>
          </div>
        </div>

        {/* Cuerpo: Gráfico de barras agrupadas + Mini Cards de KPIs por Modalidad */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 items-center">
          
          {/* Gráfico Recharts (7 cols) */}
          <div className="lg:col-span-7 h-52 w-full">
            {modalidadChartData.length === 0 ? (
              <div className="flex items-center justify-center h-full text-[var(--text-muted)] text-xs">
                No hay datos disponibles para la comparativa con los filtros seleccionados.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={modalidadChartData}
                  margin={{ top: 15, right: 20, left: -10, bottom: 5 }}
                  barGap={8}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-normal)" opacity={0.25} vertical={false} />
                  <XAxis 
                    dataKey="name" 
                    tick={{ fontSize: 11, fill: 'var(--text-primary)', fontWeight: 600 }}
                    axisLine={false} 
                    tickLine={false} 
                  />
                  <YAxis 
                    domain={[0, 100]}
                    unit="%"
                    tick={{ fontSize: 10, fill: 'var(--text-muted)' }} 
                    axisLine={false} 
                    tickLine={false} 
                  />
                  <RechartsTooltip
                    content={<ChartTooltipContent 
                      labelFormatter={(label) => `Modalidad: ${label}`}
                      formatter={(val, name, item) => {
                        const p = item.payload;
                        return [
                          `${val}% (${name.includes('Día 1') ? `${p.asistio_dia1}/${p.asistio_dia0} asistieron` : `${p.ingresos_iop}/${p.total_nomina} ingresaron`})`,
                          name
                        ];
                      }}
                    />}
                    cursor={{ fill: 'var(--bg-elevated)', opacity: 0.35, radius: 4 }}
                  />
                  <Bar 
                    dataKey="Retención Día 1 (%)" 
                    fill="#8B5CF6" 
                    radius={[4, 4, 0, 0]} 
                    barSize={32}
                    animationDuration={800}
                  />
                  <Bar 
                    dataKey="Conversión I-OP (%)" 
                    fill="#F59E0B" 
                    radius={[4, 4, 0, 0]} 
                    barSize={32}
                    animationDuration={800}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Tarjetas comparativas detalladas (5 cols) */}
          <div className="lg:col-span-5 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {modalidadData.map(m => {
              const isRemoto = m.modalidad === 'REMOTO';
              const Icon = isRemoto ? Laptop : Building2;
              const accentColor = isRemoto ? 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20' : 'text-blue-400 bg-blue-500/10 border-blue-500/20';

              return (
                <div 
                  key={m.modalidad}
                  className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/40 hover:bg-[var(--bg-elevated)] p-3 flex flex-col justify-between transition-all duration-200"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className={`p-1.5 rounded-md border ${accentColor}`}>
                        <Icon className="h-3.5 w-3.5" />
                      </div>
                      <span className="text-xs font-bold text-[var(--text-primary)]">
                        {m.label}
                      </span>
                    </div>
                    <Badge variant="secondary" className="text-[9px] font-mono px-1.5 py-0">
                      {m.grupos_count} grupos
                    </Badge>
                  </div>

                  <div className="space-y-1.5 text-[11px]">
                    <div className="flex items-center justify-between">
                      <span className="text-[var(--text-muted)] text-[10px]">Total Nómina</span>
                      <span className="font-bold tabular-nums text-[var(--text-primary)]">{m.total_nomina}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[var(--text-muted)] text-[10px]">Asistió Día 0</span>
                      <span className="font-semibold tabular-nums text-[var(--text-secondary)]">
                        {m.asistio_dia0} <span className="text-[9px] text-[var(--text-muted)] font-mono">({m.pct_asistencia_dia0}%)</span>
                      </span>
                    </div>
                    <div className="flex items-center justify-between pt-1 border-t border-[var(--border-subtle)]">
                      <span className="text-[var(--text-muted)] text-[10px] font-semibold flex items-center gap-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-purple-400" /> Retención Día 1
                      </span>
                      <span className="font-black font-mono text-purple-400 tabular-nums text-xs">
                        {m.pct_retencion_dia1}%
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[var(--text-muted)] text-[10px] font-semibold flex items-center gap-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-400" /> Conversión I-OP
                      </span>
                      <span className="font-black font-mono text-amber-400 tabular-nums text-xs">
                        {m.pct_conversion_iop_nomina}% <span className="text-[9px] font-normal text-[var(--text-muted)]">({m.ingresos_iop})</span>
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

        </div>
      </Card>

      {/* ─────────────────────────────────────────────────────────────
          MODAL / DIALOG: TABLA RESUMEN COMPLETA (Sticky header + scroll)
          ───────────────────────────────────────────────────────────── */}
      <Dialog open={isTableModalOpen} onOpenChange={setIsTableModalOpen}>
        <DialogHeader>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-[var(--accent)]/10 text-[var(--accent)]">
              <TableIcon className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle>Matriz Detallada de Resumen Capacitación</DialogTitle>
              <DialogDescription>
                Consolidado granular por Campaña y Código GPE ({groupedData.length} campañas • {filteredData.length} grupos)
              </DialogDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleExport}
              className="inline-flex items-center gap-1.5 h-8.5 px-3 rounded-lg border border-[var(--border-normal)] bg-[var(--bg-surface)] hover:bg-[var(--bg-elevated)] text-[var(--text-primary)] text-xs font-bold shadow-xs transition-all active:scale-95 cursor-pointer"
            >
              <Download className="h-3.5 w-3.5 text-[var(--accent)]" />
              <span>Exportar Excel</span>
            </button>
            <DialogClose onClose={() => setIsTableModalOpen(false)} />
          </div>
        </DialogHeader>

        <DialogContent className="p-0 flex flex-col max-h-[75vh]">
          <div className="overflow-auto flex-1 custom-scrollbar">
            <table className="w-full text-left text-xs whitespace-nowrap">
              <thead className="sticky top-0 bg-[var(--bg-surface)] border-b border-[var(--border-normal)] text-[10px] uppercase text-[var(--text-muted)] font-bold tracking-wider z-10 shadow-xs">
                <tr>
                  <th className="px-3.5 py-3 bg-[var(--bg-surface)]">Campaña / Grupo</th>
                  <th className="px-3 py-3 text-right bg-[var(--bg-surface)]">Total Nómina</th>
                  <th className="px-3 py-3 text-right bg-[var(--bg-surface)]">Asistió Día 0</th>
                  <th className="px-3 py-3 text-right bg-[var(--bg-surface)]">Asistió Día 1</th>
                  <th className="px-3 py-3 text-right text-emerald-500 bg-[var(--bg-surface)]">Activos en OJT</th>
                  <th className="px-3 py-3 text-right text-amber-500 bg-[var(--bg-surface)]">Ingresos I-OP</th>
                  <th className="px-3 py-3 text-right text-cyan-500 bg-[var(--bg-surface)]">Activos Actuales</th>
                  <th className="px-3 py-3 text-right text-rose-500 bg-[var(--bg-surface)]">Desertores</th>
                  <th className="px-3 py-3 text-right text-rose-400 bg-[var(--bg-surface)]">% Deserción</th>
                  <th className="px-3 py-3 text-right text-cyan-400 bg-[var(--bg-surface)]">% Retención</th>
                  <th className="px-3.5 py-3 text-right text-emerald-400 bg-[var(--bg-surface)]">% Dotación</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {groupedData.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="px-4 py-12 text-center text-[var(--text-muted)] text-xs">
                      No hay datos disponibles para los filtros seleccionados
                    </td>
                  </tr>
                ) : (
                  groupedData.map((row, idx) => {
                    const desertores = Math.max(0, (row.asistio_dia1 || 0) - (row.activos_actuales || 0) - (row.ingresos_iop || 0));
                    const pctDesercion = (row.asistio_dia1 || 0) > 0 ? Math.round((desertores / row.asistio_dia1) * 100) : 0;
                    const pctRetencion = (row.total_nomina || 0) > 0 ? Math.round(((row.activos_actuales || 0) / row.total_nomina) * 100) : 0;
                    const req = row.requerimiento || row.rq_solicitado || row.total_nomina || 0;
                    const pctDotacion = req > 0 ? Math.round(((row.ingresos_iop || 0) / req) * 100) : 0;

                    return (
                      <React.Fragment key={idx}>
                        {/* Fila de Campaña Agrupada */}
                        <tr className="bg-[var(--bg-elevated)]/50 hover:bg-[var(--bg-elevated)] transition-colors font-semibold">
                          <td className="px-3.5 py-2.5 font-bold text-[var(--text-primary)]">{row.campana}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{row.total_nomina}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{row.asistio_dia0}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{row.asistio_dia1}</td>
                          <td className="px-3 py-2.5 text-right font-bold text-emerald-500 tabular-nums">{row.activos_ojt}</td>
                          <td className="px-3 py-2.5 text-right font-bold text-amber-500 tabular-nums">{row.ingresos_iop}</td>
                          <td className="px-3 py-2.5 text-right font-bold text-cyan-500 tabular-nums">{row.activos_actuales}</td>
                          <td className="px-3 py-2.5 text-right font-bold text-rose-500 tabular-nums">{desertores}</td>
                          <td className="px-3 py-2.5 text-right font-mono font-bold text-rose-400 tabular-nums">{pctDesercion}%</td>
                          <td className="px-3 py-2.5 text-right font-mono font-bold text-cyan-400 tabular-nums">{pctRetencion}%</td>
                          <td className="px-3.5 py-2.5 text-right font-mono font-bold text-emerald-400 tabular-nums">{pctDotacion}%</td>
                        </tr>
                        {/* Filas de Grupos individuales */}
                        {row.grupos.map(g => {
                          const gDesertores = Math.max(0, (g.asistio_dia1 || 0) - (g.activos_actuales || 0) - (g.ingresos_iop || 0));
                          const gPctDesercion = (g.asistio_dia1 || 0) > 0 ? Math.round((gDesertores / g.asistio_dia1) * 100) : 0;
                          const gRet = (g.total_nomina || 0) > 0 ? Math.round(((g.activos_actuales || 0) / g.total_nomina) * 100) : 0;
                          const gReq = g.requerimiento || g.rq_solicitado || g.total_nomina || 0;
                          const gPctDotacion = gReq > 0 ? Math.round(((g.ingresos_iop || 0) / gReq) * 100) : 0;

                          return (
                            <tr key={g.grupo_codigo} className="bg-[var(--bg-surface)] hover:bg-[var(--bg-elevated)]/40 transition-colors">
                              <td className="px-3.5 py-2 pl-8 text-[11px] font-medium text-[var(--text-muted)]">
                                {g.grupo_codigo} <span className="opacity-40 mx-1">•</span> <span className="text-[var(--text-primary)] opacity-80">{g.semana}</span>
                              </td>
                              <td className="px-3 py-2 text-right text-[11px] tabular-nums text-[var(--text-muted)]">{g.total_nomina}</td>
                              <td className="px-3 py-2 text-right text-[11px] tabular-nums text-[var(--text-muted)]">{g.asistio_dia0}</td>
                              <td className="px-3 py-2 text-right text-[11px] tabular-nums text-[var(--text-muted)]">{g.asistio_dia1}</td>
                              <td className="px-3 py-2 text-right text-[11px] tabular-nums font-semibold text-emerald-500/80">{g.activos_ojt}</td>
                              <td className="px-3 py-2 text-right text-[11px] tabular-nums font-semibold text-amber-500/80">{g.ingresos_iop}</td>
                              <td className="px-3 py-2 text-right text-[11px] tabular-nums font-semibold text-cyan-500/80">{g.activos_actuales}</td>
                              <td className="px-3 py-2 text-right text-[11px] tabular-nums font-semibold text-rose-500/80">{gDesertores}</td>
                              <td className="px-3 py-2 text-right text-[11px] font-mono text-rose-400/80">{gPctDesercion}%</td>
                              <td className="px-3 py-2 text-right text-[11px] font-mono text-cyan-400/80">{gRet}%</td>
                              <td className="px-3.5 py-2 text-right text-[11px] font-mono text-emerald-400/80">{gPctDotacion}%</td>
                            </tr>
                          );
                        })}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}
