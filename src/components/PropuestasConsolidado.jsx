import { useState, useEffect, useMemo } from 'react';
import { fetchPropuestasConsolidado, deletePropuesta } from '../lib/dataService';
import { formatFechaDDMMYYYY } from '../lib/propuestaParser';
import { Loader2, Download, Table, Pencil, Trash2, Search, Filter, RefreshCw, FileSpreadsheet } from 'lucide-react';
import PageLayout from './ui/PageLayout';
import PageHeader from './ui/PageHeader';
import Card from './ui/Card';

export default function PropuestasConsolidado({ onEdit }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filtroPeriodo, setFiltroPeriodo] = useState('TODOS');
  const [filtroCampana, setFiltroCampana] = useState('TODAS');
  const [deletingId, setDeletingId] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const rows = await fetchPropuestasConsolidado();
      setData(rows || []);
    } catch (err) {
      console.error("Error al cargar consolidado:", err);
    } finally {
      setLoading(false);
    }
  };

  const periodosUnicos = useMemo(() => {
    const set = new Set();
    data.forEach(d => {
      if (d.periodoCapa) set.add(d.periodoCapa);
    });
    return Array.from(set).sort((a,b) => b.localeCompare(a));
  }, [data]);

  const campanasUnicas = useMemo(() => {
    const set = new Set();
    data.forEach(d => {
      if (d.campana) set.add(d.campana);
    });
    return Array.from(set).sort();
  }, [data]);

  const filteredData = useMemo(() => {
    return data.filter(row => {
      if (filtroPeriodo !== 'TODOS' && row.periodoCapa !== filtroPeriodo) return false;
      if (filtroCampana !== 'TODAS' && row.campana !== filtroCampana) return false;
      if (search) {
        const q = search.toLowerCase();
        const match = 
          String(row.grupo || '').toLowerCase().includes(q) ||
          String(row.campana || '').toLowerCase().includes(q) ||
          String(row.cod || '').toLowerCase().includes(q) ||
          String(row.segmento || '').toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [data, filtroPeriodo, filtroCampana, search]);

  const handleDelete = async (row) => {
    const desc = `${row.campana || ''} - ${row.grupo || ''}`;
    if (!window.confirm(`¿Estás seguro de eliminar la propuesta consolidada de ${desc}? Esta acción también eliminará sus acuerdos asociados.`)) {
      return;
    }
    setDeletingId(row.id);
    try {
      await deletePropuesta(row.id, row.propuesta_id);
      setData(prev => prev.filter(r => r.id !== row.id));
    } catch (err) {
      alert("Error al eliminar propuesta: " + (err.message || 'Error desconocido'));
    } finally {
      setDeletingId(null);
    }
  };

  const exportToCSV = () => {
    if (!filteredData.length) return;
    const headers = Object.keys(filteredData[0]).filter(k => k !== 'id' && k !== 'propuesta_id');
    const csvRows = [];
    csvRows.push(headers.join(','));
    
    for (const row of filteredData) {
      const values = headers.map(header => {
        const val = row[header] === null || row[header] === undefined ? '' : String(row[header]);
        return `"${val.replace(/"/g, '""')}"`;
      });
      csvRows.push(values.join(','));
    }
    
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Consolidado_Propuestas_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  if (loading) {
    return (
      <PageLayout className="flex justify-center items-center h-64 text-[var(--text-muted)]">
        <Loader2 className="animate-spin mr-2" size={24} /> Cargando consolidado desde Supabase...
      </PageLayout>
    );
  }

  return (
    <PageLayout className="space-y-5">
      <PageHeader
        title="Consolidado de Propuestas (Base de Datos)"
        subtitle="Matriz de 26 columnas con acuerdos económicos, tarifas y bonos integrados"
        icon={Table}
        actions={
          <div className="flex gap-2">
            <button onClick={loadData} className="btn-secondary flex items-center gap-1.5 text-xs">
              <RefreshCw size={14} /> Actualizar
            </button>
            <button onClick={exportToCSV} className="btn-primary flex items-center gap-2 text-xs">
              <Download size={14} /> Exportar CSV
            </button>
          </div>
        }
      />

      {/* Barra de Filtros */}
      <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-4 shadow-sm flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-2 w-full md:w-auto">
          <Filter size={16} className="text-emerald-400 shrink-0" />
          <span className="text-xs font-bold text-slate-300 uppercase tracking-wide">Filtros:</span>
          
          <select
            value={filtroPeriodo}
            onChange={e => setFiltroPeriodo(e.target.value)}
            className="border border-slate-700 bg-slate-900 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none focus:border-emerald-500"
          >
            <option value="TODOS">Periodo: Todos</option>
            {periodosUnicos.map(p => <option key={p} value={p}>{p}</option>)}
          </select>

          <select
            value={filtroCampana}
            onChange={e => setFiltroCampana(e.target.value)}
            className="border border-slate-700 bg-slate-900 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none focus:border-emerald-500"
          >
            <option value="TODAS">Campaña: Todas</option>
            {campanasUnicas.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <div className="relative w-full md:w-72">
          <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por grupo, código..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 outline-none focus:border-emerald-500"
          />
        </div>
      </div>
      
      <Card noPadding className="overflow-hidden border border-slate-700/80 shadow-md">
        <div className="overflow-x-auto table-scroll">
          <table className="w-full text-left text-xs whitespace-nowrap">
            <thead className="bg-slate-900/90 text-slate-200 border-b border-slate-700 sticky top-0 uppercase tracking-wider">
              <tr>
                <th className="p-2 border-r border-slate-700 text-center font-bold">ACCIONES</th>
                <th className="p-2 border-r border-slate-700 font-semibold">PERIODO</th>
                <th className="p-2 border-r border-slate-700 font-semibold">SEMANA</th>
                <th className="p-2 border-r border-slate-700 font-semibold">SEGMENTO</th>
                <th className="p-2 border-r border-slate-700 font-semibold text-emerald-400">CAMPAÑA</th>
                <th className="p-2 border-r border-slate-700 font-semibold text-white">GRUPO</th>
                <th className="p-2 border-r border-slate-700 font-semibold">MODALIDAD</th>
                <th className="p-2 border-r border-slate-700 font-semibold">CONDICIÓN</th>
                <th className="p-2 border-r border-slate-700 font-semibold">COD</th>
                <th className="p-2 border-r border-slate-700 font-semibold">FECHA INICIO</th>
                <th className="p-2 border-r border-slate-700 font-semibold">INGRESO OP</th>
                <th className="p-2 border-r border-slate-700 font-semibold">MES CAPA</th>
                <th className="p-2 border-r border-slate-700 font-semibold">MES BONOS</th>
                <th className="p-2 border-r border-slate-700 font-semibold text-blue-400 text-right">PAGO X DÍA</th>
                <th className="p-2 border-r border-slate-700 font-semibold text-blue-400 text-right">DÍAS CAPA</th>
                <th className="p-2 border-r border-slate-700 font-semibold text-blue-400 text-right">FERIADOS</th>
                <th className="p-2 border-r border-slate-700 font-bold text-emerald-400 text-right">PAGO COMPLETO</th>
                <th className="p-2 border-r border-slate-700 font-semibold text-indigo-400 text-right">B. BIENV. M1</th>
                <th className="p-2 border-r border-slate-700 font-semibold text-indigo-400 text-right">B. BIENV. M2</th>
                <th className="p-2 border-r border-slate-700 font-semibold text-indigo-400 text-right">B. BIENV. M3</th>
                <th className="p-2 border-r border-slate-700 font-semibold text-purple-400 text-right">B. PERM. M1</th>
                <th className="p-2 border-r border-slate-700 font-semibold text-purple-400 text-right">B. PERM. M2</th>
                <th className="p-2 border-r border-slate-700 font-semibold text-purple-400 text-right">B. PERM. M3</th>
                <th className="p-2 border-r border-slate-700 font-semibold text-purple-400 text-right">B. PERM. M4</th>
                <th className="p-2 border-r border-slate-700 font-semibold text-emerald-300 text-right">ASIS. PERF. M1</th>
                <th className="p-2 border-r border-slate-700 font-semibold text-emerald-300 text-right">ASIS. PERF. M2</th>
                <th className="p-2 border-r border-slate-700 font-semibold text-emerald-300 text-right">ASIS. PERF. M3</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {filteredData.length === 0 ? (
                <tr>
                  <td colSpan="27" className="p-10 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <FileSpreadsheet size={32} className="text-slate-600" />
                      <span>No hay propuestas registradas en la base de datos de Supabase.</span>
                      <span className="text-xs text-slate-600">Crea una nueva propuesta desde la pestaña "Crear Propuesta".</span>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredData.map((row, i) => (
                  <tr key={row.id || i} className={`hover:bg-slate-800/60 transition-colors ${i % 2 === 0 ? 'bg-slate-900/30' : 'bg-transparent'}`}>
                    <td className="p-2 border-r border-slate-800 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        {onEdit && (
                          <button
                            onClick={() => onEdit(row)}
                            title="Editar Propuesta"
                            className="p-1 rounded hover:bg-blue-600/30 text-blue-400 hover:text-blue-200 transition-colors"
                          >
                            <Pencil size={13} />
                          </button>
                        )}
                        <button
                          onClick={() => handleDelete(row)}
                          disabled={deletingId === row.id}
                          title="Eliminar Propuesta"
                          className="p-1 rounded hover:bg-rose-600/30 text-rose-400 hover:text-rose-200 transition-colors"
                        >
                          {deletingId === row.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                        </button>
                      </div>
                    </td>
                    <td className="p-2 border-r border-slate-800 text-slate-300">{row.periodoCapa}</td>
                    <td className="p-2 border-r border-slate-800 text-slate-300">{row.semana}</td>
                    <td className="p-2 border-r border-slate-800 text-slate-400">{row.segmento}</td>
                    <td className="p-2 border-r border-slate-800 font-semibold text-white">{row.campana}</td>
                    <td className="p-2 border-r border-slate-800 font-mono font-bold text-emerald-400">{row.grupo}</td>
                    <td className="p-2 border-r border-slate-800 text-slate-400">{row.modalidad}</td>
                    <td className="p-2 border-r border-slate-800 text-slate-400">{row.condicionLaboral}</td>
                    <td className="p-2 border-r border-slate-800 text-slate-400">{row.cod}</td>
                    <td className="p-2 border-r border-slate-800 text-slate-300 font-mono">{formatFechaDDMMYYYY(row.fechaInicioCapa) || '—'}</td>
                    <td className="p-2 border-r border-slate-800 text-slate-300 font-mono">{formatFechaDDMMYYYY(row.ingresoOperacion) || '—'}</td>
                    <td className="p-2 border-r border-slate-800 text-slate-400">{row.mesAfectacionCapa}</td>
                    <td className="p-2 border-r border-slate-800 text-slate-400">{row.mesAfectacionBonos}</td>
                    <td className="p-2 border-r border-slate-800 text-right font-mono text-slate-200">S/ {Number(row.pagoPorDia || 0).toFixed(2)}</td>
                    <td className="p-2 border-r border-slate-800 text-right font-mono text-slate-300">{row.diasCapa}</td>
                    <td className="p-2 border-r border-slate-800 text-right font-mono text-slate-400">{row.cantDiasFeriados || 0}</td>
                    <td className="p-2 border-r border-slate-800 text-right font-mono font-bold text-emerald-400">S/ {Number(row.pagoCompleto || 0).toFixed(2)}</td>
                    <td className="p-2 border-r border-slate-800 text-right font-mono text-slate-300">S/ {Number(row.bonoBienvenidaM1 || 0).toFixed(2)}</td>
                    <td className="p-2 border-r border-slate-800 text-right font-mono text-slate-400">S/ {Number(row.bonoBienvenidaM2 || 0).toFixed(2)}</td>
                    <td className="p-2 border-r border-slate-800 text-right font-mono text-slate-400">S/ {Number(row.bonoBienvenidaM3 || 0).toFixed(2)}</td>
                    <td className="p-2 border-r border-slate-800 text-right font-mono text-slate-300">S/ {Number(row.bonoPermanenciaM1 || 0).toFixed(2)}</td>
                    <td className="p-2 border-r border-slate-800 text-right font-mono text-slate-400">S/ {Number(row.bonoPermanenciaM2 || 0).toFixed(2)}</td>
                    <td className="p-2 border-r border-slate-800 text-right font-mono text-slate-400">S/ {Number(row.bonoPermanenciaM3 || 0).toFixed(2)}</td>
                    <td className="p-2 border-r border-slate-800 text-right font-mono text-slate-400">S/ {Number(row.bonoPermanenciaM4 || 0).toFixed(2)}</td>
                    <td className="p-2 border-r border-slate-800 text-right font-mono text-slate-300">S/ {Number(row.bonoAsistenciaM1 || 0).toFixed(2)}</td>
                    <td className="p-2 border-r border-slate-800 text-right font-mono text-slate-400">S/ {Number(row.bonoAsistenciaM2 || 0).toFixed(2)}</td>
                    <td className="p-2 border-r border-slate-800 text-right font-mono text-slate-400">S/ {Number(row.bonoAsistenciaM3 || 0).toFixed(2)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </PageLayout>
  );
}
