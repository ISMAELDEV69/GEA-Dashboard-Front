import React, { useState, useEffect, useMemo } from 'react';
import { fetchCapacidadRysOperativo, getMetricasResumenCapacitacion } from '../lib/dataService';
import { BarChart3, Users, CheckCircle2, UserCheck, CalendarCheck, ShieldCheck, Filter, Download } from 'lucide-react';
import * as XLSX from 'xlsx';

export default function ResumenCapacitacion() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [filters, setFilters] = useState({
    periodo: 'Todos',
    semana: 'Todas',
    segmento: 'Todos',
    campana: 'Todas',
    grupo: 'Todos'
  });

  useEffect(() => {
    let active = true;

    async function loadData() {
      try {
        setLoading(true);
        // Obtener todos los grupos configurados
        const gruposInfo = await fetchCapacidadRysOperativo();
        
        // Obtener métricas
        const metricas = await getMetricasResumenCapacitacion(gruposInfo || []);
        
        if (active) {
          setData(metricas || []);
          setError(null);
        }
      } catch (err) {
        console.error('Error fetching resumen:', err);
        if (active) setError(err.message || 'Error cargando datos de resumen');
      } finally {
        if (active) setLoading(false);
      }
    }

    loadData();
    return () => { active = false; };
  }, []);

  // Opciones de filtros
  const filterOptions = useMemo(() => {
    const periodos = new Set();
    const semanas = new Set();
    const segmentos = new Set();
    const campanas = new Set();
    const grupos = new Set();

    data.forEach(d => {
      if (d.periodo) periodos.add(d.periodo);
      if (d.semana) semanas.add(d.semana);
      if (d.segmento) segmentos.add(d.segmento);
      if (d.campana) campanas.add(d.campana);
      if (d.grupo_codigo) grupos.add(d.grupo_codigo);
    });

    return {
      periodos: Array.from(periodos).sort().reverse(),
      semanas: Array.from(semanas).sort(),
      segmentos: Array.from(segmentos).sort(),
      campanas: Array.from(campanas).sort(),
      grupos: Array.from(grupos).sort()
    };
  }, [data]);

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

  // Totales
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

  // Datos Agrupados (Resumen por Campaña)
  const groupedData = useMemo(() => {
    const map = new Map();
    filteredData.forEach(d => {
      const key = d.campana || 'SIN CAMPAÑA';
      if (!map.has(key)) {
        map.set(key, { campana: key, total_nomina: 0, asistio_dia0: 0, asistio_dia1: 0, activos_ojt: 0, ingresos_iop: 0, activos_actuales: 0, grupos: [] });
      }
      const g = map.get(key);
      g.total_nomina += d.total_nomina || 0;
      g.asistio_dia0 += d.asistio_dia0 || 0;
      g.asistio_dia1 += d.asistio_dia1 || 0;
      g.activos_ojt += d.activos_ojt || 0;
      g.ingresos_iop += d.ingresos_iop || 0;
      g.activos_actuales += d.activos_actuales || 0;
      g.grupos.push(d);
    });
    return Array.from(map.values()).sort((a, b) => a.campana.localeCompare(b.campana));
  }, [filteredData]);

  const handleExport = () => {
    if (filteredData.length === 0) return;
    const ws = XLSX.utils.json_to_sheet(filteredData.map(d => ({
      'Periodo': d.periodo,
      'Semana': d.semana,
      'Segmento': d.segmento,
      'Campaña': d.campana,
      'Grupo (GPE)': d.grupo_codigo,
      'Fecha Inicio OJT': d.fecha_inicio_ojt,
      'Total Nómina': d.total_nomina,
      'Asistió Día 0': d.asistio_dia0,
      'Asistió Día 1': d.asistio_dia1,
      'Activos en OJT': d.activos_ojt,
      'Ingresos I-OP': d.ingresos_iop,
      'Activos Actuales': d.activos_actuales
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Resumen");
    XLSX.writeFile(wb, `Resumen_Capacitacion_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="flex flex-col items-center gap-4 text-slate-400">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-slate-700 border-t-cyan-500"></div>
          <p className="animate-pulse text-lg font-medium tracking-wide">Calculando métricas globales...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="flex flex-col items-center gap-4 rounded-2xl bg-red-500/10 p-8 text-center border border-red-500/20 max-w-md">
          <div className="rounded-full bg-red-500/20 p-3 text-red-400">
            <Filter className="h-8 w-8" />
          </div>
          <h3 className="text-xl font-bold text-red-400">Error al cargar datos</h3>
          <p className="text-sm text-red-400/80">{error}</p>
          <button 
            onClick={() => window.location.reload()}
            className="mt-4 rounded-xl bg-red-500/20 px-6 py-2.5 text-sm font-semibold text-red-400 transition-colors hover:bg-red-500/30"
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col space-y-6 overflow-x-hidden p-6 text-slate-200">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between rounded-2xl bg-[var(--bg-elevated)] p-6 shadow-xl border border-[var(--border-color)]">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-3">
            <BarChart3 className="h-8 w-8 text-cyan-400" />
            RESUMEN CAPACITACIÓN
          </h1>
          <p className="mt-2 text-sm font-medium text-slate-400">
            Consolidado de métricas de retención, OJT y pases a operaciones
          </p>
        </div>
        
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <select 
            value={filters.periodo}
            onChange={(e) => setFilters({...filters, periodo: e.target.value})}
            className="rounded-xl border border-slate-700 bg-slate-900/50 px-4 py-2.5 text-sm font-medium text-white shadow-inner transition-colors hover:border-slate-600 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
          >
            <option value="Todos">Periodo: Todos</option>
            {filterOptions.periodos.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          
          <select 
            value={filters.semana}
            onChange={(e) => setFilters({...filters, semana: e.target.value})}
            className="rounded-xl border border-slate-700 bg-slate-900/50 px-4 py-2.5 text-sm font-medium text-white shadow-inner transition-colors hover:border-slate-600 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
          >
            <option value="Todas">Semana: Todas</option>
            {filterOptions.semanas.map(s => <option key={s} value={s}>{s}</option>)}
          </select>

          <select 
            value={filters.segmento}
            onChange={(e) => setFilters({...filters, segmento: e.target.value})}
            className="rounded-xl border border-slate-700 bg-slate-900/50 px-4 py-2.5 text-sm font-medium text-white shadow-inner transition-colors hover:border-slate-600 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
          >
            <option value="Todos">Segmento: Todos</option>
            {filterOptions.segmentos.map(s => <option key={s} value={s}>{s}</option>)}
          </select>

          <select 
            value={filters.campana}
            onChange={(e) => setFilters({...filters, campana: e.target.value})}
            className="max-w-[200px] truncate rounded-xl border border-slate-700 bg-slate-900/50 px-4 py-2.5 text-sm font-medium text-white shadow-inner transition-colors hover:border-slate-600 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
          >
            <option value="Todas">Campaña: Todas</option>
            {filterOptions.campanas.map(c => <option key={c} value={c}>{c}</option>)}
          </select>

          <select 
            value={filters.grupo}
            onChange={(e) => setFilters({...filters, grupo: e.target.value})}
            className="max-w-[150px] truncate rounded-xl border border-slate-700 bg-slate-900/50 px-4 py-2.5 text-sm font-medium text-white shadow-inner transition-colors hover:border-slate-600 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
          >
            <option value="Todos">Grupo: Todos</option>
            {filterOptions.grupos.map(g => <option key={g} value={g}>{g}</option>)}
          </select>

          <button
            onClick={handleExport}
            className="flex items-center gap-2 rounded-xl bg-cyan-500/10 px-4 py-2.5 text-sm font-semibold text-cyan-400 border border-cyan-500/20 transition-colors hover:bg-cyan-500/20"
          >
            <Download className="h-4 w-4" />
            Excel
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        {[
          { label: 'Total Nómina', value: kpis.total_nomina, icon: Users, color: 'text-blue-400', bg: 'bg-blue-400/10' },
          { label: 'Asistió Día 0', value: kpis.asistio_dia0, icon: CheckCircle2, color: 'text-indigo-400', bg: 'bg-indigo-400/10' },
          { label: 'Asistió Día 1', value: kpis.asistio_dia1, icon: CalendarCheck, color: 'text-fuchsia-400', bg: 'bg-fuchsia-400/10' },
          { label: 'Activos en OJT', value: kpis.activos_ojt, icon: ShieldCheck, color: 'text-emerald-400', bg: 'bg-emerald-400/10' },
          { label: 'Ingresos (I-OP)', value: kpis.ingresos_iop, icon: UserCheck, color: 'text-amber-400', bg: 'bg-amber-400/10' },
          { label: 'Activos Actuales', value: kpis.activos_actuales, icon: Users, color: 'text-cyan-400', bg: 'bg-cyan-400/10' },
        ].map((kpi, idx) => (
          <div key={idx} className="flex flex-col gap-3 rounded-2xl bg-[var(--bg-elevated)] p-5 shadow-lg border border-[var(--border-color)] relative overflow-hidden group hover:border-slate-600 transition-colors">
            <div className={`absolute -right-4 -top-4 h-24 w-24 rounded-full opacity-20 blur-2xl transition-opacity group-hover:opacity-40 ${kpi.bg}`}></div>
            <div className="flex items-center gap-3">
              <div className={`rounded-lg p-2.5 ${kpi.bg}`}>
                <kpi.icon className={`h-5 w-5 ${kpi.color}`} />
              </div>
              <p className="text-xs font-semibold tracking-wider text-slate-400 uppercase">{kpi.label}</p>
            </div>
            <div className="flex items-baseline gap-2">
              <h3 className="text-3xl font-black tracking-tight text-white">{kpi.value.toLocaleString()}</h3>
            </div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="flex-1 rounded-2xl bg-[var(--bg-elevated)] p-6 shadow-xl border border-[var(--border-color)] overflow-hidden flex flex-col min-h-[400px]">
        <h2 className="text-lg font-bold text-white mb-4">Tabla Resumen</h2>
        <div className="flex-1 overflow-auto rounded-xl border border-slate-700/50">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="sticky top-0 bg-slate-800/90 text-xs uppercase text-slate-400 backdrop-blur-md shadow-sm z-10">
              <tr>
                <th className="px-4 py-3 font-semibold whitespace-nowrap">Campaña / Grupo</th>
                <th className="px-4 py-3 font-semibold text-right whitespace-nowrap">Total Nómina</th>
                <th className="px-4 py-3 font-semibold text-right whitespace-nowrap">Asistió Día 0</th>
                <th className="px-4 py-3 font-semibold text-right whitespace-nowrap">Asistió Día 1</th>
                <th className="px-4 py-3 font-semibold text-right whitespace-nowrap text-emerald-400">Activos en OJT</th>
                <th className="px-4 py-3 font-semibold text-right whitespace-nowrap text-amber-400">Ingresos I-OP</th>
                <th className="px-4 py-3 font-semibold text-right whitespace-nowrap text-cyan-400">Activos Actuales</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {groupedData.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-slate-500">
                    No hay datos para los filtros seleccionados
                  </td>
                </tr>
              ) : (
                groupedData.map((row, idx) => (
                  <React.Fragment key={idx}>
                    {/* Fila de Campaña Agrupada */}
                    <tr className="bg-slate-800/30 hover:bg-slate-800/50 transition-colors">
                      <td className="px-4 py-3 font-bold text-white whitespace-nowrap">{row.campana}</td>
                      <td className="px-4 py-3 text-right font-medium">{row.total_nomina}</td>
                      <td className="px-4 py-3 text-right font-medium">{row.asistio_dia0}</td>
                      <td className="px-4 py-3 text-right font-medium">{row.asistio_dia1}</td>
                      <td className="px-4 py-3 text-right font-bold text-emerald-400/90">{row.activos_ojt}</td>
                      <td className="px-4 py-3 text-right font-bold text-amber-400/90">{row.ingresos_iop}</td>
                      <td className="px-4 py-3 text-right font-bold text-cyan-400/90">{row.activos_actuales}</td>
                    </tr>
                    {/* Filas de Grupos individuales (solo si hay filtros o para detalle) */}
                    {row.grupos.map(g => (
                      <tr key={g.grupo_codigo} className="bg-slate-900/20 hover:bg-slate-800/40 transition-colors">
                        <td className="px-4 py-2 pl-10 text-xs font-medium text-slate-400 whitespace-nowrap">
                          {g.grupo_codigo} <span className="opacity-50 mx-1">•</span> <span className="opacity-70">{g.semana}</span>
                        </td>
                        <td className="px-4 py-2 text-right text-xs">{g.total_nomina}</td>
                        <td className="px-4 py-2 text-right text-xs">{g.asistio_dia0}</td>
                        <td className="px-4 py-2 text-right text-xs">{g.asistio_dia1}</td>
                        <td className="px-4 py-2 text-right text-xs font-medium text-emerald-500/70">{g.activos_ojt}</td>
                        <td className="px-4 py-2 text-right text-xs font-medium text-amber-500/70">{g.ingresos_iop}</td>
                        <td className="px-4 py-2 text-right text-xs font-medium text-cyan-500/70">{g.activos_actuales}</td>
                      </tr>
                    ))}
                  </React.Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
