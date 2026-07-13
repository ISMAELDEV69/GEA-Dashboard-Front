import { useMemo, useState, useEffect } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, Cell, LabelList
} from 'recharts'
import { Filter, Search } from 'lucide-react'
import { fetchAllDescuentosBI } from '../lib/dataService'
import PageLayout from './ui/PageLayout'
import PageHeader from './ui/PageHeader'
import Card from './ui/Card'

const COLORS = {
  bars: 'var(--accent)',
  barsLight: 'var(--accent-hover)',
  text: 'var(--text-primary)',
}

export default function DescuentosBI() {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)

  // View Mode
  const [viewMode, setViewMode] = useState('TABLA GENERAL')

  // Top Bar Filters
  const [selectedFechaEnvio, setSelectedFechaEnvio] = useState('TODAS')
  const [selectedProcede, setSelectedProcede] = useState('TODAS')

  // Sidebar Filters
  const [selectedSegmento, setSelectedSegmento] = useState('TODAS')
  const [selectedCampana, setSelectedCampana] = useState('TODAS')
  const [selectedGrupo, setSelectedGrupo] = useState('TODAS')
  const [selectedPeriodo, setSelectedPeriodo] = useState('TODAS')
  const [selectedMotivo, setSelectedMotivo] = useState('TODAS')
  const [searchDocumento, setSearchDocumento] = useState('')

  useEffect(() => {
    fetchAllDescuentosBI().then(descRes => {
      const enriched = (descRes || []).map(d => {
        let p = 'SIN PERIODO'
        if (d.fecha_baja) {
          if (d.fecha_baja.includes('/')) {
            const parts = d.fecha_baja.split('/')
            if (parts.length === 3) p = `${parts[2]}${parts[1].padStart(2, '0')}`
          } else if (d.fecha_baja.includes('-')) {
            const parts = d.fecha_baja.split('-')
            if (parts.length >= 2) p = `${parts[0]}${parts[1].padStart(2, '0')}`
          }
        }
        return {
          ...d,
          periodo: p
        }
      })
      setData(enriched)
      setLoading(false)
    }).catch(err => {
      console.error(err)
      setLoading(false)
    })
  }, [])

  // Derived Filter Lists (Hierarchical Cross-filtering)
  const segmentos = useMemo(() => ['TODAS', ...new Set(data.map(d => d.segmento).filter(Boolean))], [data])
  
  const campanas = useMemo(() => {
    const filtered = data.filter(d => selectedSegmento === 'TODAS' || d.segmento === selectedSegmento)
    return ['TODAS', ...new Set(filtered.map(d => d.campana).filter(Boolean))]
  }, [data, selectedSegmento])
  
  const grupos = useMemo(() => {
    const filtered = data.filter(d => 
      (selectedSegmento === 'TODAS' || d.segmento === selectedSegmento) && 
      (selectedCampana === 'TODAS' || d.campana === selectedCampana)
    )
    return ['TODAS', ...new Set(filtered.map(d => d.grupo_cap).filter(Boolean))]
  }, [data, selectedSegmento, selectedCampana])
  
  const periodos = useMemo(() => {
    const filtered = data.filter(d => 
      (selectedSegmento === 'TODAS' || d.segmento === selectedSegmento) && 
      (selectedCampana === 'TODAS' || d.campana === selectedCampana) &&
      (selectedGrupo === 'TODAS' || d.grupo_cap === selectedGrupo)
    )
    const ps = filtered.map(d => d.periodo).filter(Boolean)
    return ['TODAS', ...new Set(ps)].sort((a, b) => b.localeCompare(a)) // desc
  }, [data, selectedSegmento, selectedCampana, selectedGrupo])

  const motivos = useMemo(() => {
    const filtered = data.filter(d => 
      (selectedSegmento === 'TODAS' || d.segmento === selectedSegmento) && 
      (selectedCampana === 'TODAS' || d.campana === selectedCampana) &&
      (selectedGrupo === 'TODAS' || d.grupo_cap === selectedGrupo) &&
      (selectedPeriodo === 'TODAS' || d.periodo === selectedPeriodo)
    )
    return ['TODAS', ...new Set(filtered.map(d => d.motivo || 'SIN MOTIVO'))].sort()
  }, [data, selectedSegmento, selectedCampana, selectedGrupo, selectedPeriodo])

  const fechasEnvio = useMemo(() => {
    const dates = data.map(d => d.fecha_registro ? d.fecha_registro.split('T')[0] : null).filter(Boolean)
    return ['TODAS', ...new Set(dates)].sort((a, b) => b.localeCompare(a)) // desc
  }, [data])

  const procedes = ['TODAS', 'PROCEDE', 'NO PROCEDE', 'PENDIENTE']

  // Apply filters
  const filteredData = useMemo(() => {
    return data.filter(d => {
      if (selectedSegmento !== 'TODAS' && d.segmento !== selectedSegmento) return false
      if (selectedCampana !== 'TODAS' && d.campana !== selectedCampana) return false
      if (selectedGrupo !== 'TODAS' && d.grupo_cap !== selectedGrupo) return false
      
      if (selectedPeriodo !== 'TODAS' && d.periodo !== selectedPeriodo) return false
      
      const mot = d.motivo || 'SIN MOTIVO'
      if (selectedMotivo !== 'TODAS' && mot !== selectedMotivo) return false

      const pEnvio = d.fecha_registro ? d.fecha_registro.split('T')[0] : 'SIN FECHA'
      if (selectedFechaEnvio !== 'TODAS' && pEnvio !== selectedFechaEnvio) return false

      const proc = d.procede || 'PENDIENTE'
      if (selectedProcede !== 'TODAS' && proc !== selectedProcede) return false

      if (searchDocumento) {
        const doc = (d.dni_ce || d.documento || '').toLowerCase()
        if (!doc.includes(searchDocumento.toLowerCase())) return false
      }

      return true
    })
  }, [data, selectedSegmento, selectedCampana, selectedGrupo, selectedPeriodo, selectedMotivo, selectedFechaEnvio, selectedProcede, searchDocumento])

  // 1. Descuentos por periodo
  const byPeriod = useMemo(() => {
    const counts = {}
    filteredData.forEach(d => {
      const p = d.periodo || 'SIN PERIODO'
      counts[p] = (counts[p] || 0) + 1
    })
    return Object.entries(counts)
      .map(([period, value]) => ({ period, value }))
      .sort((a, b) => b.period.localeCompare(a.period)) // Descending
  }, [filteredData])

  // 2. Ranking de Motivos
  const byMotivo = useMemo(() => {
    const counts = {}
    filteredData.forEach(d => {
      const m = (d.motivo || 'SIN MOTIVO').toUpperCase()
      counts[m] = (counts[m] || 0) + 1
    })
    return Object.entries(counts)
      .map(([motivo, value]) => ({ motivo, value }))
      .sort((a, b) => b.value - a.value)
  }, [filteredData])

  // 3. Matriz Cruzada (Campaña vs Motivo) para TABLA PORCENTAJES
  const matrixData = useMemo(() => {
    const rowCounts = {}
    const colTotals = {}
    let grandTotal = 0

    filteredData.forEach(d => {
      const c = (d.campana || 'SIN CAMPAÑA').toUpperCase()
      const m = (d.motivo || 'SIN MOTIVO').toUpperCase()
      
      if (!rowCounts[c]) rowCounts[c] = { total: 0, motivos: {} }
      rowCounts[c].motivos[m] = (rowCounts[c].motivos[m] || 0) + 1
      rowCounts[c].total++
      
      colTotals[m] = (colTotals[m] || 0) + 1
      grandTotal++
    })

    const topMotivos = byMotivo.map(m => m.motivo).slice(0, 15) // Limit columns to top 15 for table
    const rows = Object.keys(rowCounts).sort().map(c => {
      const row = { campana: c, total: rowCounts[c].total }
      topMotivos.forEach(m => {
        row[m] = rowCounts[c].motivos[m] || 0
      })
      return row
    })

    return { rows, topMotivos, grandTotal, colTotals }
  }, [filteredData, byMotivo])

  if (loading) {
    return (
      <PageLayout>
        <div className="flex h-[50vh] items-center justify-center text-[var(--text-muted)] font-medium">
          <span className="animate-pulse">Cargando datos analíticos...</span>
        </div>
      </PageLayout>
    )
  }

  return (
    <PageLayout className="p-4 md:p-6 space-y-6">
      
      {/* TOP HEADER */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <PageHeader 
          title="Descuentos de Formación" 
          subtitle="Análisis de bajas, retención y descuentos generados"
        />
        
        <div className="flex flex-wrap items-center gap-4 bg-[var(--bg-surface)] p-3 rounded-2xl border border-[var(--border-subtle)] shadow-sm shrink-0">
          <div className="flex flex-col">
            <span className="text-[10px] text-[var(--text-muted)] uppercase font-bold px-1">Fecha Envío</span>
            <select
              className="bg-[var(--input-bg)] border border-[var(--input-border)] text-xs text-[var(--text-primary)] rounded-lg px-2 py-1.5 outline-none focus:border-[var(--accent)] w-32"
              value={selectedFechaEnvio} onChange={e => setSelectedFechaEnvio(e.target.value)}
            >
              {fechasEnvio.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>

          <div className="flex flex-col">
            <span className="text-[10px] text-[var(--text-muted)] uppercase font-bold px-1">Vista</span>
            <div className="flex text-[10px] font-bold uppercase rounded-lg border border-[var(--input-border)] overflow-hidden bg-[var(--input-bg)]">
              <button 
                onClick={() => setViewMode('TABLA GENERAL')}
                className={`px-3 py-1.5 transition-colors ${viewMode === 'TABLA GENERAL' ? 'bg-[var(--accent)] text-white' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-muted)]'}`}
              >
                General
              </button>
              <button 
                onClick={() => setViewMode('TABLA PORCENTAJES')}
                className={`px-3 py-1.5 transition-colors ${viewMode === 'TABLA PORCENTAJES' ? 'bg-[var(--accent)] text-white' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-muted)]'}`}
              >
                Porcentajes
              </button>
            </div>
          </div>

          <div className="flex flex-col">
            <span className="text-[10px] text-[var(--text-muted)] uppercase font-bold px-1">Procede</span>
            <select
              className="bg-[var(--input-bg)] border border-[var(--input-border)] text-xs font-bold text-emerald-500 rounded-lg px-2 py-1.5 outline-none focus:border-[var(--accent)] w-28"
              value={selectedProcede} onChange={e => setSelectedProcede(e.target.value)}
            >
              {procedes.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 items-start animate-fadeIn">
        {/* SIDEBAR FILTERS */}
        <Card className="w-full lg:w-72 shrink-0 flex flex-col space-y-6">
          <div className="font-black uppercase tracking-wider flex items-center gap-2 text-[var(--text-primary)] border-b border-[var(--border-subtle)] pb-4">
            <Filter size={18} className="text-[var(--accent)]" /> FILTROS
          </div>
          
          <div className="space-y-4">
            <div>
              <label className="text-xs font-bold text-[var(--text-secondary)] uppercase">SEGMENTO</label>
              <select
                className="w-full mt-1.5 bg-[var(--input-bg)] border border-[var(--input-border)] text-[var(--text-primary)] rounded-xl p-2.5 text-sm outline-none focus:border-[var(--accent)]"
                value={selectedSegmento} onChange={e => { setSelectedSegmento(e.target.value); setSelectedCampana('TODAS'); setSelectedGrupo('TODAS'); }}
              >
                {segmentos.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-[var(--text-secondary)] uppercase">CAMPAÑA</label>
              <select
                className="w-full mt-1.5 bg-[var(--input-bg)] border border-[var(--input-border)] text-[var(--text-primary)] rounded-xl p-2.5 text-sm outline-none focus:border-[var(--accent)]"
                value={selectedCampana} onChange={e => { setSelectedCampana(e.target.value); setSelectedGrupo('TODAS'); }}
              >
                {campanas.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-[var(--text-secondary)] uppercase">GRUPO DE CAPA</label>
              <select
                className="w-full mt-1.5 bg-[var(--input-bg)] border border-[var(--input-border)] text-[var(--text-primary)] rounded-xl p-2.5 text-sm outline-none focus:border-[var(--accent)]"
                value={selectedGrupo} onChange={e => setSelectedGrupo(e.target.value)}
              >
                {grupos.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-[var(--text-secondary)] uppercase">PERIODO BAJA</label>
              <select
                className="w-full mt-1.5 bg-[var(--input-bg)] border border-[var(--input-border)] text-[var(--text-primary)] rounded-xl p-2.5 text-sm outline-none focus:border-[var(--accent)]"
                value={selectedPeriodo} onChange={e => setSelectedPeriodo(e.target.value)}
              >
                {periodos.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-[var(--text-secondary)] uppercase">MOTIVO</label>
              <select
                className="w-full mt-1.5 bg-[var(--input-bg)] border border-[var(--input-border)] text-[var(--text-primary)] rounded-xl p-2.5 text-sm outline-none focus:border-[var(--accent)]"
                value={selectedMotivo} onChange={e => setSelectedMotivo(e.target.value)}
              >
                {motivos.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>

            <div className="pt-4 border-t border-[var(--border-subtle)]">
              <label className="text-xs font-bold text-[var(--text-secondary)] uppercase flex items-center gap-1.5 mb-2">
                <Search size={14} className="text-[var(--accent)]"/> Buscar por Doc.
              </label>
              <input 
                type="text" 
                placeholder="Ej. 12345678" 
                className="w-full bg-[var(--input-bg)] border border-[var(--input-border)] text-[var(--text-primary)] placeholder-[var(--text-muted)] rounded-xl p-2.5 text-sm outline-none focus:border-[var(--accent)]"
                value={searchDocumento}
                onChange={e => setSearchDocumento(e.target.value)}
              />
            </div>
          </div>
        </Card>

        {/* MAIN CONTENT */}
        <div className="flex-1 flex flex-col gap-6 min-w-0">
          
          {/* CHARTS ROW */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[400px]">
            {/* Chart 1: Descuentos por periodo */}
            <Card noPadding className="flex flex-col h-full">
              <div className="bg-[var(--table-head-bg)] text-[var(--text-primary)] text-center font-bold text-xs uppercase tracking-wider py-2.5 rounded-t-2xl border-b border-[var(--border-subtle)]">
                Descuentos por periodo
              </div>
              <div className="flex-1 p-4 pb-2">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={byPeriod} layout="vertical" margin={{ top: 10, right: 30, left: 40, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-normal)" horizontal={false} />
                    <XAxis type="number" hide />
                    <YAxis dataKey="period" type="category" axisLine={false} tickLine={false} tick={{fill: 'var(--text-muted)', fontSize: 11}} width={50} label={{ value: 'PERIODO', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle', fill: 'var(--text-muted)', fontSize: 10, fontWeight: 'bold' } }} />
                    <RechartsTooltip cursor={{fill: 'rgba(128,128,128,0.1)'}} contentStyle={{backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)', color: 'var(--text-primary)', borderRadius: '8px'}} />
                    <Bar dataKey="value" fill={COLORS.bars} radius={[0, 6, 6, 0]}>
                      <LabelList dataKey="value" position="right" fill="var(--text-muted)" fontSize={11} fontWeight="bold" />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            {/* Chart 2: Ranking de Motivos */}
            <Card noPadding className="lg:col-span-2 flex flex-col h-full">
              <div className="bg-[var(--table-head-bg)] text-[var(--text-primary)] text-center font-bold text-xs uppercase tracking-wider py-2.5 rounded-t-2xl border-b border-[var(--border-subtle)]">
                Ranking de Motivos
              </div>
              <div className="flex-1 p-4 pb-0">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={byMotivo.slice(0, 20)} margin={{ top: 20, right: 10, left: -10, bottom: 80 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-normal)" vertical={false} />
                    <XAxis 
                      dataKey="motivo" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{fill: 'var(--text-muted)', fontSize: 10, fontWeight: 500}} 
                      angle={-45} 
                      textAnchor="end" 
                      height={80} 
                    />
                    <YAxis axisLine={false} tickLine={false} tick={{fill: 'var(--text-muted)', fontSize: 11}} label={{ value: 'Recuento', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle', fill: 'var(--text-muted)', fontSize: 11, fontWeight: 'bold' } }} />
                    <RechartsTooltip cursor={{fill: 'rgba(128,128,128,0.1)'}} contentStyle={{backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)', color: 'var(--text-primary)', borderRadius: '8px'}} />
                    <Bar dataKey="value" fill={COLORS.bars} radius={[6, 6, 0, 0]}>
                      <LabelList dataKey="value" position="top" fill="var(--text-muted)" fontSize={11} fontWeight="bold" />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>

          {/* DYNAMIC BOTTOM VIEW */}
          <Card noPadding className="flex-1 flex flex-col min-h-[400px]">
            <div className="overflow-x-auto overflow-y-auto flex-1 table-scroll">
              
              {viewMode === 'TABLA GENERAL' ? (
                <table className="w-full text-left text-xs whitespace-nowrap">
                  <thead className="sticky top-0 z-10">
                    <tr>
                      <th className="px-3 py-3 border-r border-[var(--border-normal)] font-bold text-[var(--text-secondary)] uppercase bg-[var(--table-head-bg)]">SEDE</th>
                      <th className="px-3 py-3 border-r border-[var(--border-normal)] font-bold text-[var(--text-secondary)] uppercase bg-[var(--table-head-bg)]">SEGMENTO</th>
                      <th className="px-3 py-3 border-r border-[var(--border-normal)] font-bold text-[var(--text-secondary)] uppercase bg-[var(--table-head-bg)]">GPE</th>
                      <th className="px-3 py-3 border-r border-[var(--border-normal)] font-bold text-[var(--text-secondary)] uppercase bg-[var(--table-head-bg)]">CAMPAÑA</th>
                      <th className="px-3 py-3 border-r border-[var(--border-normal)] font-bold text-[var(--text-secondary)] uppercase bg-[var(--table-head-bg)]">SUPERVISOR</th>
                      <th className="px-3 py-3 border-r border-[var(--border-normal)] font-bold text-[var(--text-secondary)] uppercase bg-[var(--table-head-bg)]">FORMADOR</th>
                      <th className="px-3 py-3 border-r border-[var(--border-normal)] font-bold text-[var(--text-secondary)] uppercase bg-[var(--table-head-bg)]">DOCUMENTO</th>
                      <th className="px-3 py-3 border-r border-[var(--border-normal)] font-bold text-[var(--text-secondary)] uppercase bg-[var(--table-head-bg)]">POSTULANTE</th>
                      <th className="px-3 py-3 border-r border-[var(--border-normal)] font-bold text-[var(--text-secondary)] uppercase bg-[var(--table-head-bg)]">FECHA BAJA</th>
                      <th className="px-3 py-3 border-r border-[var(--border-normal)] font-bold text-[var(--text-secondary)] uppercase bg-[var(--table-head-bg)]">MOTIVO</th>
                      <th className="px-3 py-3 border-r border-[var(--border-normal)] font-bold text-[var(--text-secondary)] uppercase bg-[var(--table-head-bg)]">AUT. RYS</th>
                      <th className="px-3 py-3 border-r border-[var(--border-normal)] font-bold text-[var(--text-secondary)] uppercase bg-[var(--table-head-bg)]">AUT. CAPA</th>
                      <th className="px-3 py-3 border-r border-[var(--border-normal)] font-bold text-[var(--text-secondary)] uppercase bg-[var(--table-head-bg)]">PROCEDE</th>
                      <th className="px-3 py-3 border-r border-[var(--border-normal)] font-bold text-[var(--text-secondary)] uppercase bg-[var(--table-head-bg)]">COMENTARIO</th>
                      <th className="px-3 py-3 font-bold text-[var(--text-secondary)] uppercase bg-[var(--table-head-bg)]">ENVIO</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-subtle)]">
                    {filteredData.map((row, i) => (
                      <tr key={row.id || i} className="hover:bg-[var(--bg-muted)] transition-colors">
                        <td className="px-3 py-2 border-r border-[var(--border-subtle)] text-[var(--text-primary)]">{row.sede}</td>
                        <td className="px-3 py-2 border-r border-[var(--border-subtle)] text-[var(--text-primary)]">{row.segmento}</td>
                        <td className="px-3 py-2 border-r border-[var(--border-subtle)] text-[var(--text-primary)] font-semibold">{row.grupo_cap}</td>
                        <td className="px-3 py-2 border-r border-[var(--border-subtle)] text-[var(--text-primary)]">{row.campana}</td>
                        <td className="px-3 py-2 border-r border-[var(--border-subtle)] text-[var(--text-primary)]">{row.supervisor}</td>
                        <td className="px-3 py-2 border-r border-[var(--border-subtle)] text-[var(--text-primary)]">{row.formador}</td>
                        <td className="px-3 py-2 border-r border-[var(--border-subtle)] text-[var(--text-secondary)] font-mono">{row.dni_ce}</td>
                        <td className="px-3 py-2 border-r border-[var(--border-subtle)] text-[var(--text-primary)] font-medium">{row.postulante}</td>
                        <td className="px-3 py-2 border-r border-[var(--border-subtle)] text-[var(--text-secondary)]">{row.fecha_baja}</td>
                        <td className="px-3 py-2 border-r border-[var(--border-subtle)] text-[var(--text-primary)]">{row.motivo}</td>
                        <td className="px-3 py-2 border-r border-[var(--border-subtle)] text-center font-bold text-[var(--text-secondary)]">{(row.autoriza_rys || '')}</td>
                        <td className="px-3 py-2 border-r border-[var(--border-subtle)] text-center font-bold text-[var(--text-secondary)]">{(row.autoriza_cap || 'SI')}</td>
                        <td className="px-3 py-2 border-r border-[var(--border-subtle)] text-center">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            (row.procede || '').toUpperCase() === 'PROCEDE' ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400' :
                            (row.procede || '').toUpperCase() === 'NO PROCEDE' ? 'bg-red-500/20 text-red-600 dark:text-red-400' :
                            'bg-amber-500/20 text-amber-600 dark:text-amber-400'
                          }`}>
                            {(row.procede || 'PENDIENTE').toUpperCase()}
                          </span>
                        </td>
                        <td className="px-3 py-2 border-r border-[var(--border-subtle)] text-xs text-[var(--text-muted)] max-w-[200px] truncate" title={row.comentario_rys}>{row.comentario_rys}</td>
                        <td className="px-3 py-2 font-mono text-[var(--text-muted)] text-[11px]">{row.fecha_registro ? row.fecha_registro.replace('T', ' ').substring(0, 16) : ''}</td>
                      </tr>
                    ))}
                    {filteredData.length === 0 && (
                      <tr><td colSpan={15} className="p-8 text-center text-[var(--text-muted)] font-medium">No hay registros que coincidan con los filtros.</td></tr>
                    )}
                  </tbody>
                </table>
              ) : (
                <table className="w-full text-left text-xs whitespace-nowrap">
                  <thead className="sticky top-0 z-10">
                    <tr>
                      <th className="px-4 py-3 border-r border-[var(--border-normal)] font-bold text-[var(--text-secondary)] uppercase bg-[var(--table-head-bg)] tracking-wider">CAMPAÑA</th>
                      {matrixData.topMotivos.map(m => (
                        <th key={m} className="px-4 py-3 border-r border-[var(--border-normal)] font-bold text-[var(--text-secondary)] uppercase text-center max-w-[120px] truncate bg-[var(--table-head-bg)]" title={m}>
                          {m}
                        </th>
                      ))}
                      <th className="px-4 py-3 font-bold text-[var(--text-secondary)] uppercase text-center bg-[var(--table-head-bg)]">TOTAL</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-subtle)]">
                    {matrixData.rows.map((row, i) => (
                      <tr key={row.campana} className="hover:bg-[var(--bg-muted)] transition-colors">
                        <td className="px-4 py-2.5 border-r border-[var(--border-subtle)] font-semibold text-[var(--text-primary)] sticky left-0 bg-[var(--bg-surface)]">
                          {row.campana}
                        </td>
                        {matrixData.topMotivos.map(m => {
                          const val = row[m]
                          const pct = matrixData.grandTotal > 0 ? ((val / matrixData.grandTotal) * 100).toFixed(2) : 0
                          const hasVal = val > 0
                          return (
                            <td key={m} className="px-4 py-2.5 border-r border-[var(--border-subtle)] text-center relative overflow-hidden">
                              {hasVal && (
                                <>
                                  <div className="absolute inset-y-1.5 left-1 bg-[var(--accent)] opacity-10 rounded" style={{ width: `calc(${pct}% * 2)` }} />
                                  <span className="relative text-[var(--text-primary)] font-mono z-10 font-medium">{pct}%</span>
                                </>
                              )}
                            </td>
                          )
                        })}
                        <td className="px-4 py-2.5 text-center text-[var(--text-primary)] font-bold font-mono bg-[var(--bg-elevated)]/30">
                          {row.total}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-[var(--bg-elevated)] sticky bottom-0 border-t border-[var(--border-normal)]">
                    <tr>
                      <td className="px-4 py-3 border-r border-[var(--border-normal)] font-bold text-[var(--text-primary)]">TOTAL</td>
                      {matrixData.topMotivos.map(m => (
                        <td key={m} className="px-4 py-3 border-r border-[var(--border-normal)] text-center font-bold text-[var(--text-secondary)] font-mono">
                          {matrixData.grandTotal > 0 ? ((matrixData.colTotals[m] / matrixData.grandTotal) * 100).toFixed(2) : 0}%
                        </td>
                      ))}
                      <td className="px-4 py-3 text-center font-black text-[var(--text-primary)]">{matrixData.grandTotal}</td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>
          </Card>
        </div>
      </div>
    </PageLayout>
  )
}
