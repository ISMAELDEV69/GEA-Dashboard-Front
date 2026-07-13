import React, { useState, useEffect, useMemo } from 'react'
import {
  fetchGruposDia1,
  fetchAsistenciasReclutador,
  getDetalleCalibracion,
  getMetricasReporteCalibracionBulk,
  DB_MODE
} from '../lib/dataService'
import { supabase } from '../lib/supabase'
import { RefreshCw, FileText } from 'lucide-react'
import PageLayout from './ui/PageLayout'
import PageHeader from './ui/PageHeader'
import Card from './ui/Card'

const ReporteDia1 = ({ grupos }) => {
  const [reportData, setReportData] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedGroupDetail, setSelectedGroupDetail] = useState(null)
  const [discrepancias, setDiscrepancias] = useState([])
  const [loadingDetails, setLoadingDetails] = useState(false)

  // Filters state
  const [filterPeriodo, setFilterPeriodo] = useState('')
  const [filterSemana, setFilterSemana] = useState('')
  const [filterSegmento, setFilterSegmento] = useState('')
  const [filterCampana, setFilterCampana] = useState('')
  const [filterGrupo, setFilterGrupo] = useState('')
  const [isInitialized, setIsInitialized] = useState(false)

  // Auto-select latest Periodo and Semana when data loads
  useEffect(() => {
    if (grupos.length > 0 && !isInitialized) {
      const uniquePeriodos = [...new Set(grupos.map(g => g.periodo ? String(g.periodo).trim() : null).filter(Boolean))].sort().reverse()
      if (uniquePeriodos.length > 0) {
        const latestPeriodo = uniquePeriodos[0]
        setFilterPeriodo(latestPeriodo)
        
        const filteredByPeriodo = grupos.filter(g => String(g.periodo).trim() === latestPeriodo)
        const uniqueSemanas = [...new Set(filteredByPeriodo.map(g => g.semana_label ? String(g.semana_label).trim() : null).filter(Boolean))].sort().reverse()
        if (uniqueSemanas.length > 0) {
          setFilterSemana(uniqueSemanas[0])
        }
      }
      setIsInitialized(true)
    }
  }, [grupos, isInitialized])

  // Cascade options
  const optPeriodo = useMemo(() => {
    return [...new Set(grupos.map(g => g.periodo ? String(g.periodo).trim() : null).filter(Boolean))].sort()
  }, [grupos])

  const optSemana = useMemo(() => {
    let filtered = grupos
    if (filterPeriodo) filtered = filtered.filter(g => String(g.periodo).trim() === filterPeriodo)
    return [...new Set(filtered.map(g => g.semana_label ? String(g.semana_label).trim() : null).filter(Boolean))].sort()
  }, [grupos, filterPeriodo])

  const optSegmento = useMemo(() => {
    let filtered = grupos
    if (filterPeriodo) filtered = filtered.filter(g => String(g.periodo).trim() === filterPeriodo)
    if (filterSemana) filtered = filtered.filter(g => String(g.semana_label).trim() === filterSemana)
    return [...new Set(filtered.map(g => g.segmento ? String(g.segmento).trim() : null).filter(Boolean))].sort()
  }, [grupos, filterPeriodo, filterSemana])

  const optCampana = useMemo(() => {
    let filtered = grupos
    if (filterPeriodo) filtered = filtered.filter(g => String(g.periodo).trim() === filterPeriodo)
    if (filterSemana) filtered = filtered.filter(g => String(g.semana_label).trim() === filterSemana)
    if (filterSegmento) filtered = filtered.filter(g => String(g.segmento).trim() === filterSegmento)
    return [...new Set(filtered.map(g => g.campana ? String(g.campana).trim() : null).filter(Boolean))].sort()
  }, [grupos, filterPeriodo, filterSemana, filterSegmento])

  const optGrupo = useMemo(() => {
    let filtered = grupos
    if (filterPeriodo) filtered = filtered.filter(g => String(g.periodo).trim() === filterPeriodo)
    if (filterSemana) filtered = filtered.filter(g => String(g.semana_label).trim() === filterSemana)
    if (filterSegmento) filtered = filtered.filter(g => String(g.segmento).trim() === filterSegmento)
    if (filterCampana) filtered = filtered.filter(g => String(g.campana).trim() === filterCampana)
    
    const unique = [];
    const seen = new Set();
    for (const g of filtered) {
      if (!seen.has(g.codigo)) {
        seen.add(g.codigo);
        unique.push(g);
      }
    }
    return unique.sort((a,b) => String(a.codigo).localeCompare(String(b.codigo)));
  }, [grupos, filterPeriodo, filterSemana, filterSegmento, filterCampana])

  useEffect(() => {
    loadReport()
  }, [grupos, filterPeriodo, filterSemana, filterSegmento, filterCampana, filterGrupo])

  const loadReport = async () => {
    if (grupos.length === 0) return
    setLoading(true)
    setSelectedGroupDetail(null)
    setDiscrepancias([])
    try {
      let finalGrupos = grupos
      if (filterPeriodo) finalGrupos = finalGrupos.filter(g => String(g.periodo).trim() === filterPeriodo)
      if (filterSemana) finalGrupos = finalGrupos.filter(g => String(g.semana_label).trim() === filterSemana)
      if (filterSegmento) finalGrupos = finalGrupos.filter(g => String(g.segmento).trim() === filterSegmento)
      if (filterCampana) finalGrupos = finalGrupos.filter(g => String(g.campana).trim() === filterCampana)
      if (filterGrupo) finalGrupos = finalGrupos.filter(g => String(g.codigo).trim() === filterGrupo)

      if (DB_MODE === 'supabase') {
        const bulkResults = await getMetricasReporteCalibracionBulk(finalGrupos);
        setReportData(bulkResults.sort((a, b) => b.fecha_inicio.localeCompare(a.fecha_inicio)));
      } else {
        setReportData([]);
      }
    } catch (err) {
      console.error("Error al cargar el reporte del Día 1:", err)
    } finally {
      setLoading(false)
    }
  }

  const handleRowClick = async (row) => {
    if (row.estado !== 'DESCALIBRADO') {
      setSelectedGroupDetail(null)
      setDiscrepancias([])
      return
    }
    
    if (selectedGroupDetail === row.grupo_codigo) {
      setSelectedGroupDetail(null)
      return
    }

    setSelectedGroupDetail(row.grupo_codigo)
    setLoadingDetails(true)
    try {
      const detalles = await getDetalleCalibracion(row.grupo_codigo, row.campana)
      setDiscrepancias(detalles)
    } catch (err) {
      console.error(err)
      alert('Error al cargar detalles')
    } finally {
      setLoadingDetails(false)
    }
  }

  const getStatusBadge = (estado) => {
    if (estado === 'CALIBRADO') return <span className="bg-green-100 text-green-800 px-3 py-1 rounded-full text-xs font-bold">🟢 CALIBRADO</span>
    if (estado === 'DESCALIBRADO') return <span className="bg-red-100 text-red-800 px-3 py-1 rounded-full text-xs font-bold shadow-sm border border-red-200">🔴 DESCALIBRADO</span>
    return <span className="bg-gray-100 text-gray-800 px-3 py-1 rounded-full text-xs font-bold">⚪ PENDIENTE</span>
  }

  return (
    <PageLayout className="space-y-6">
      <PageHeader
        title="Reporte de Calibración - Día 1"
        subtitle="Métricas de asistencia iniciales"
        icon={FileText}
        actions={
          <button 
            onClick={loadReport} 
            disabled={loading}
            className="btn-primary flex items-center gap-2 disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            {loading ? 'Actualizando...' : 'Refrescar Reporte'}
          </button>
        }
      />

      <Card className="mb-6">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div>
            <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5 ml-1">Periodo</label>
            <select value={filterPeriodo} onChange={e => { setFilterPeriodo(e.target.value); setFilterSemana(''); setFilterSegmento(''); setFilterCampana(''); setFilterGrupo('') }} className="form-input w-full p-2.5">
              <option value="">Todos</option>
              {optPeriodo.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5 ml-1">Semana</label>
            <select value={filterSemana} onChange={e => { setFilterSemana(e.target.value); setFilterSegmento(''); setFilterCampana(''); setFilterGrupo('') }} className="form-input w-full p-2.5">
              <option value="">Todas</option>
              {optSemana.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5 ml-1">Segmento</label>
            <select value={filterSegmento} onChange={e => { setFilterSegmento(e.target.value); setFilterCampana(''); setFilterGrupo('') }} className="form-input w-full p-2.5">
              <option value="">Todos</option>
              {optSegmento.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5 ml-1">Campaña</label>
            <select value={filterCampana} onChange={e => { setFilterCampana(e.target.value); setFilterGrupo('') }} className="form-input w-full p-2.5">
              <option value="">Todas</option>
              {optCampana.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5 ml-1">Grupo (GPE)</label>
            <select value={filterGrupo} onChange={e => setFilterGrupo(e.target.value)} className="form-input w-full p-2.5">
              <option value="">Todos</option>
              {optGrupo.map(g => (
                <option key={g.codigo} value={g.codigo}>
                  {String(g.codigo).startsWith('PROY-') ? '—' : String(g.codigo).replace(/_\d+$/, '')}
                </option>
              ))}
            </select>
          </div>
        </div>
      </Card>

      {loading ? (
        <div className="text-center py-10">
          <div className="animate-spin h-8 w-8 border-4 border-[var(--accent)] border-t-transparent rounded-full mx-auto mb-2"></div>
          <p className="text-[var(--text-muted)] font-bold tracking-widest">CARGANDO REPORTE...</p>
        </div>
      ) : reportData.length === 0 ? (
        <Card className="text-center py-10">
          <p className="text-[var(--text-muted)] font-bold">No hay grupos configurados con Día 1 actualmente.</p>
        </Card>
      ) : (
        <div className="space-y-6">
          <Card noPadding className="overflow-hidden">
            <div className="table-scroll overflow-x-auto max-h-[50vh]">
              <table className="w-full text-sm text-left relative">
                <thead className="bg-[var(--table-head-bg)] text-[var(--text-primary)] text-xs font-bold uppercase tracking-widest sticky top-0 z-10 border-b border-[var(--border-subtle)]">
                  <tr>
                    <th className="px-4 py-3">Grupo</th>
                    <th className="px-4 py-3">Campaña</th>
                    <th className="px-4 py-3">Fecha de Inicio</th>
                    <th className="px-4 py-3">Fecha Día 1</th>
                    <th className="px-4 py-3 text-center">Total Nómina</th>
                    <th className="px-4 py-3 text-center">Asistió Día 0</th>
                    <th className="px-4 py-3 text-center">Asistió Día 1</th>
                    <th className="px-4 py-3 text-center">Asistencias Formador</th>
                    <th className="px-4 py-3 text-center">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)]">
                  {reportData.map((row, idx) => (
                    <tr 
                      key={row.grupo_codigo} 
                      onClick={() => handleRowClick(row)}
                      className={`transition-colors ${idx % 2 === 0 ? 'bg-[var(--bg-surface)]' : 'bg-[var(--bg-base)]/20'} ${row.estado === 'DESCALIBRADO' ? 'cursor-pointer hover:bg-rose-500/10' : 'hover:bg-[var(--bg-muted)]'} ${selectedGroupDetail === row.grupo_codigo ? 'bg-rose-500/10' : ''}`}
                    >
                      <td className="px-4 py-3 font-bold text-[var(--text-primary)]">{row.grupo_codigo}</td>
                      <td className="px-4 py-3 text-[var(--text-secondary)]">{row.campana}</td>
                      <td className="px-4 py-3 text-[var(--text-secondary)] font-mono text-xs">{row.fecha_inicio}</td>
                      <td className="px-4 py-3 font-bold text-[var(--accent)] font-mono text-xs">{row.fecha_dia1}</td>
                      <td className="px-4 py-3 text-center font-bold text-[var(--text-primary)]">{row.total_nomina}</td>
                      <td className="px-4 py-3 text-center font-bold text-[var(--text-primary)]">{row.total_dia0}</td>
                      <td className="px-4 py-3 text-center font-bold text-[var(--text-primary)]">{row.total_reclutador}</td>
                      <td className="px-4 py-3 text-center font-bold text-[var(--text-primary)]">{row.total_formador}</td>
                      <td className="px-4 py-3 text-center">
                        {getStatusBadge(row.estado)}
                        {row.estado === 'DESCALIBRADO' && (
                          <div className="text-[10px] text-rose-500 font-bold mt-1 uppercase">Click para ver detalle</div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {selectedGroupDetail && (
            <Card className="bg-rose-500/5 border-rose-500/20 animate-fadeIn">
              <h3 className="text-rose-500 font-black uppercase tracking-wider mb-4 border-b border-rose-500/20 pb-2">
                Detalle de Descalibración: {selectedGroupDetail}
              </h3>
              
              {loadingDetails ? (
                <div className="text-center py-4 text-rose-500 font-bold">Cargando discrepancias...</div>
              ) : discrepancias.length === 0 ? (
                <div className="text-center py-4 text-rose-500 font-bold">No se encontraron discrepancias directas (posible diferencia de cantidad total).</div>
              ) : (
                <div className="table-scroll overflow-x-auto rounded-xl overflow-hidden border border-rose-500/20">
                  <table className="w-full text-left text-xs bg-[var(--bg-surface)]">
                    <thead className="bg-rose-500/10 text-rose-500">
                      <tr>
                        <th className="px-3 py-2 font-bold uppercase">Documento</th>
                        <th className="px-3 py-2 font-bold uppercase">Nombres</th>
                        <th className="px-3 py-2 text-center font-bold uppercase border-l border-rose-500/20">Reclutador Marcó</th>
                        <th className="px-3 py-2 text-center font-bold uppercase border-l border-rose-500/20">Formador Marcó</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border-subtle)]">
                      {discrepancias.map(d => (
                        <tr key={d.documento} className="hover:bg-[var(--bg-muted)] transition-colors">
                          <td className="px-3 py-2 font-mono text-[var(--text-secondary)]">{d.documento}</td>
                          <td className="px-3 py-2 text-[var(--text-primary)] font-medium">{d.nombre}</td>
                          <td className="px-3 py-2 text-center border-l border-rose-500/20">
                            <span className="bg-[var(--bg-elevated)] px-2 py-1 rounded font-bold text-[var(--text-primary)]">{d.sigla_reclutador}</span>
                          </td>
                          <td className="px-3 py-2 text-center border-l border-rose-500/20">
                            <span className="bg-amber-500/20 px-2 py-1 rounded font-bold text-amber-500 border border-amber-500/30">{d.sigla_formador}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          )}
        </div>
      )}
    </PageLayout>
  )
}

export default ReporteDia1
