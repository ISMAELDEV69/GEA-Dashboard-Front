import { useState, useEffect } from 'react';
import { fetchPropuestasConsolidado } from '../lib/dataService';
import { Loader2, Download, Table } from 'lucide-react';
import PageLayout from './ui/PageLayout';
import PageHeader from './ui/PageHeader';
import Card from './ui/Card';

export default function PropuestasConsolidado() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await fetchPropuestasConsolidado();
      setData(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const exportToCSV = () => {
    if (!data.length) return;
    const headers = Object.keys(data[0]).filter(k => k !== 'id');
    const csvRows = [];
    csvRows.push(headers.join(','));
    
    for (const row of data) {
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
        <Loader2 className="animate-spin mr-2" size={24} /> Cargando consolidado...
      </PageLayout>
    );
  }

  return (
    <PageLayout className="space-y-6">
      <PageHeader
        title="Consolidado de Propuestas"
        subtitle="Registro de pagos de capacitación y bonos"
        icon={Table}
        actions={
          <div className="flex gap-2">
            <button onClick={loadData} className="btn-secondary">
              Actualizar
            </button>
            <button onClick={exportToCSV} className="btn-primary flex items-center gap-2">
              <Download size={14} /> Exportar CSV
            </button>
          </div>
        }
      />
      
      <Card noPadding className="overflow-hidden">
        <div className="overflow-x-auto table-scroll">
          <table className="w-full text-left text-xs whitespace-nowrap">
            <thead className="bg-[var(--table-head-bg)] text-[var(--text-primary)] border-b border-[var(--border-subtle)] sticky top-0">
              <tr>
                <th className="p-2 border-r border-[var(--border-subtle)] font-semibold">PERIODO DE CAPA</th>
                <th className="p-2 border-r border-[var(--border-subtle)] font-semibold">SEMANA</th>
                <th className="p-2 border-r border-[var(--border-subtle)] font-semibold">SEGMENTO</th>
                <th className="p-2 border-r border-[var(--border-subtle)] font-semibold">CAMPAÑA</th>
                <th className="p-2 border-r border-[var(--border-subtle)] font-semibold">GRUPO</th>
                <th className="p-2 border-r border-[var(--border-subtle)] font-semibold">MODALIDAD</th>
                <th className="p-2 border-r border-[var(--border-subtle)] font-semibold">CONDICION LABORAL</th>
                <th className="p-2 border-r border-[var(--border-subtle)] font-semibold">COD</th>
                <th className="p-2 border-r border-[var(--border-subtle)] font-semibold">FECHA INICIO DE CAPA</th>
                <th className="p-2 border-r border-[var(--border-subtle)] font-semibold">INGRESO A LA OPERACIÓN</th>
                <th className="p-2 border-r border-[var(--border-subtle)] font-semibold">MES AFECTACIÓN PAGO CAPA</th>
                <th className="p-2 border-r border-[var(--border-subtle)] font-semibold">MES AFECTACIÓN BONOS</th>
                <th className="p-2 border-r border-[var(--border-subtle)] font-semibold text-blue-500">PAGO POR DIA</th>
                <th className="p-2 border-r border-[var(--border-subtle)] font-semibold text-blue-500">DIAS DE CAPA</th>
                <th className="p-2 border-r border-[var(--border-subtle)] font-semibold text-blue-500">CANT. DIAS FERIADOS</th>
                <th className="p-2 border-r border-[var(--border-subtle)] font-semibold text-blue-400">PAGO COMPLETO</th>
                <th className="p-2 border-r border-[var(--border-subtle)] font-semibold text-indigo-500">BONO BIENVENIDA M1</th>
                <th className="p-2 border-r border-[var(--border-subtle)] font-semibold text-indigo-500">BONO BIENVENIDA M2</th>
                <th className="p-2 border-r border-[var(--border-subtle)] font-semibold text-indigo-500">BONO BIENVENIDA M3</th>
                <th className="p-2 border-r border-[var(--border-subtle)] font-semibold text-purple-500">BONO PERMANENCIA M1</th>
                <th className="p-2 border-r border-[var(--border-subtle)] font-semibold text-purple-500">BONO PERMANENCIA M2</th>
                <th className="p-2 border-r border-[var(--border-subtle)] font-semibold text-purple-500">BONO PERMANENCIA M3</th>
                <th className="p-2 border-r border-[var(--border-subtle)] font-semibold text-purple-500">BONO PERMANENCIA M4</th>
                <th className="p-2 border-r border-[var(--border-subtle)] font-semibold text-emerald-500">BONO ASIS. PERFECTA M1</th>
                <th className="p-2 border-r border-[var(--border-subtle)] font-semibold text-emerald-500">BONO ASIS. PERFECTA M2</th>
                <th className="p-2 border-r border-[var(--border-subtle)] font-semibold text-emerald-500">BONO ASIS. PERFECTA M3</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {data.length === 0 ? (
                <tr>
                  <td colSpan="26" className="p-8 text-center text-[var(--text-muted)]">
                    No hay propuestas guardadas.
                  </td>
                </tr>
              ) : (
                data.map((row, i) => (
                  <tr key={row.id || i} className={`hover:bg-[var(--bg-muted)] transition-colors ${i % 2 === 0 ? 'bg-[var(--bg-surface)]' : 'bg-[var(--bg-base)]/20'}`}>
                    <td className="p-2 border-r border-[var(--border-subtle)] text-[var(--text-secondary)]">{row.periodoCapa}</td>
                    <td className="p-2 border-r border-[var(--border-subtle)] text-[var(--text-secondary)]">{row.semana}</td>
                    <td className="p-2 border-r border-[var(--border-subtle)] text-[var(--text-secondary)]">{row.segmento}</td>
                    <td className="p-2 border-r border-[var(--border-subtle)] font-medium text-[var(--text-primary)]">{row.campana}</td>
                    <td className="p-2 border-r border-[var(--border-subtle)] text-[var(--text-secondary)]">{row.grupo}</td>
                    <td className="p-2 border-r border-[var(--border-subtle)] text-[var(--text-secondary)]">{row.modalidad}</td>
                    <td className="p-2 border-r border-[var(--border-subtle)] text-[var(--text-secondary)]">{row.condicionLaboral}</td>
                    <td className="p-2 border-r border-[var(--border-subtle)] text-[var(--text-secondary)]">{row.cod}</td>
                    <td className="p-2 border-r border-[var(--border-subtle)] text-[var(--text-secondary)] font-mono">{row.fechaInicioCapa}</td>
                    <td className="p-2 border-r border-[var(--border-subtle)] text-[var(--text-secondary)] font-mono">{row.ingresoOperacion}</td>
                    <td className="p-2 border-r border-[var(--border-subtle)] text-[var(--text-secondary)]">{row.mesAfectacionCapa}</td>
                    <td className="p-2 border-r border-[var(--border-subtle)] text-[var(--text-secondary)]">{row.mesAfectacionBonos}</td>
                    <td className="p-2 border-r border-[var(--border-subtle)] text-right font-mono text-[var(--text-primary)]">S/ {row.pagoPorDia}</td>
                    <td className="p-2 border-r border-[var(--border-subtle)] text-right font-mono text-[var(--text-primary)]">{row.diasCapa}</td>
                    <td className="p-2 border-r border-[var(--border-subtle)] text-right font-mono text-[var(--text-primary)]">{row.cantDiasFeriados}</td>
                    <td className="p-2 border-r border-[var(--border-subtle)] text-right font-mono font-bold text-[var(--accent)]">S/ {row.pagoCompleto}</td>
                    <td className="p-2 border-r border-[var(--border-subtle)] text-right font-mono text-[var(--text-primary)]">S/ {row.bonoBienvenidaM1}</td>
                    <td className="p-2 border-r border-[var(--border-subtle)] text-right font-mono text-[var(--text-primary)]">S/ {row.bonoBienvenidaM2}</td>
                    <td className="p-2 border-r border-[var(--border-subtle)] text-right font-mono text-[var(--text-primary)]">S/ {row.bonoBienvenidaM3}</td>
                    <td className="p-2 border-r border-[var(--border-subtle)] text-right font-mono text-[var(--text-primary)]">S/ {row.bonoPermanenciaM1}</td>
                    <td className="p-2 border-r border-[var(--border-subtle)] text-right font-mono text-[var(--text-primary)]">S/ {row.bonoPermanenciaM2}</td>
                    <td className="p-2 border-r border-[var(--border-subtle)] text-right font-mono text-[var(--text-primary)]">S/ {row.bonoPermanenciaM3}</td>
                    <td className="p-2 border-r border-[var(--border-subtle)] text-right font-mono text-[var(--text-primary)]">S/ {row.bonoPermanenciaM4}</td>
                    <td className="p-2 border-r border-[var(--border-subtle)] text-right font-mono text-[var(--text-primary)]">S/ {row.bonoAsistenciaM1}</td>
                    <td className="p-2 border-r border-[var(--border-subtle)] text-right font-mono text-[var(--text-primary)]">S/ {row.bonoAsistenciaM2}</td>
                    <td className="p-2 border-r border-[var(--border-subtle)] text-right font-mono text-[var(--text-primary)]">S/ {row.bonoAsistenciaM3}</td>
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
