import { useMemo, useState, useEffect } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, Cell, LabelList
} from 'recharts'
import { Filter } from 'lucide-react'
import { fetchGrupos, fetchAllAsistenciasBajas, fetchPostulantes } from '../lib/dataService'
import PageLayout from './ui/PageLayout'
import PageHeader from './ui/PageHeader'
import Card from './ui/Card'

const COLORS = {
  bars: 'var(--accent)',
  barsLight: 'var(--accent-hover)',
  text: 'var(--text-primary)',
  bg: 'var(--bg-elevated)'
}

export default function MotivosBajasBI() {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)

  // Sidebar Filters
  const [selectedSegmento, setSelectedSegmento] = useState('TODAS')
  const [selectedCampana, setSelectedCampana] = useState('TODAS')
  const [selectedGrupo, setSelectedGrupo] = useState('TODAS')
  const [selectedPeriodo, setSelectedPeriodo] = useState('TODAS')
  const [selectedSemana, setSelectedSemana] = useState('TODAS')

  useEffect(() => {
    Promise.all([fetchGrupos(), fetchAllAsistenciasBajas(), fetchPostulantes()]).then(([grupos, asistenciasBajas, postulantes]) => {
      // Create a map for fast lookup of group info (periodo)
      const groupMap = new Map()
      grupos.forEach(g => {
        groupMap.set(`${g.codigo}-${g.campana}`, g)
      })

      const postulantesMap = new Map()
      postulantes.forEach(p => {
        postulantesMap.set(p.documento, p)
      })

      // Deduplicate by person (documento) so we don't count the same person multiple times
      const uniqueBajasMap = new Map()
      asistenciasBajas.forEach(a => {
        const p = postulantesMap.get(a.documento)
        // Considerar si la persona existe en nómina y no es "BAJA DIA 1"
        if (a.motivo_baja !== 'BAJA DIA 1' && p) {
          uniqueBajasMap.set(a.documento, a)
        }
      })

      // Map over unique asistencias to build the final bajas array
      const bajas = Array.from(uniqueBajasMap.values()).map(a => {
        const groupInfo = groupMap.get(`${a.codigo_grupo}-${a.campana}`)
        
        return {
          documento: a.documento,
          motivo_baja: a.motivo_baja || 'SIN MOTIVO',
          fecha_baja: a.fecha_registro_asistencia,
          campana: a.campana || 'SIN CAMPAÑA',
          periodo_ingreso: groupInfo?.periodo || 'SIN PERIODO',
          semana: groupInfo?.semana_label || (groupInfo?.semana_trabajo ? `SEM ${groupInfo.semana_trabajo}` : 'SIN SEMANA'),
          grupo_cap: a.grupo || a.codigo_grupo || 'SIN GRUPO',
          segmento: groupInfo?.segmento || 'SIN SEGMENTO'
        }
      })

      setData(bajas)
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
    return ['TODAS', ...new Set(filtered.map(d => d.campana || d.campaign).filter(Boolean))]
  }, [data, selectedSegmento])
  
  const grupos = useMemo(() => {
    const filtered = data.filter(d => 
      (selectedSegmento === 'TODAS' || d.segmento === selectedSegmento) && 
      (selectedCampana === 'TODAS' || (d.campana || d.campaign) === selectedCampana)
    )
    return ['TODAS', ...new Set(filtered.map(d => d.grupo_cap).filter(Boolean))]
  }, [data, selectedSegmento, selectedCampana])
  
  const periodos = useMemo(() => {
    const filtered = data.filter(d => 
      (selectedSegmento === 'TODAS' || d.segmento === selectedSegmento) && 
      (selectedCampana === 'TODAS' || (d.campana || d.campaign) === selectedCampana) &&
      (selectedGrupo === 'TODAS' || d.grupo_cap === selectedGrupo)
    )
    const ps = filtered.map(d => d.periodo_ingreso).filter(Boolean)
    return ['TODAS', ...new Set(ps)].sort((a, b) => b.localeCompare(a)) // desc
  }, [data, selectedSegmento, selectedCampana, selectedGrupo])

  const semanas = useMemo(() => {
    const filtered = data.filter(d => 
      (selectedSegmento === 'TODAS' || d.segmento === selectedSegmento) && 
      (selectedCampana === 'TODAS' || (d.campana || d.campaign) === selectedCampana) &&
      (selectedGrupo === 'TODAS' || d.grupo_cap === selectedGrupo) &&
      (selectedPeriodo === 'TODAS' || d.periodo_ingreso === selectedPeriodo)
    )
    const sems = filtered.map(d => d.semana).filter(Boolean)
    return ['TODAS', ...new Set(sems)].sort()
  }, [data, selectedSegmento, selectedCampana, selectedGrupo, selectedPeriodo])

  const motivos = useMemo(() => {
    const filtered = data.filter(d => 
      (selectedSegmento === 'TODAS' || d.segmento === selectedSegmento) && 
      (selectedCampana === 'TODAS' || (d.campana || d.campaign) === selectedCampana) &&
      (selectedGrupo === 'TODAS' || d.grupo_cap === selectedGrupo) &&
      (selectedPeriodo === 'TODAS' || d.periodo_ingreso === selectedPeriodo) &&
      (selectedSemana === 'TODAS' || d.semana === selectedSemana)
    )
    return ['TODAS', ...new Set(filtered.map(d => d.motivo_baja || 'SIN MOTIVO'))].sort()
  }, [data, selectedSegmento, selectedCampana, selectedGrupo, selectedPeriodo, selectedSemana])

  // Apply filters
  const filteredData = useMemo(() => {
    return data.filter(d => {
      if (selectedSegmento !== 'TODAS' && d.segmento !== selectedSegmento) return false
      if (selectedCampana !== 'TODAS' && (d.campana || d.campaign) !== selectedCampana) return false
      if (selectedGrupo !== 'TODAS' && d.grupo_cap !== selectedGrupo) return false
      if (selectedPeriodo !== 'TODAS' && d.periodo_ingreso !== selectedPeriodo) return false
      if (selectedSemana !== 'TODAS' && d.semana !== selectedSemana) return false
      return true
    })
  }, [data, selectedSegmento, selectedCampana, selectedGrupo, selectedPeriodo, selectedSemana])

  // 1. Bajas por periodo
  const byPeriod = useMemo(() => {
    const counts = {}
    filteredData.forEach(d => {
      const period = d.periodo_ingreso || 'SIN PERIODO'
      counts[period] = (counts[period] || 0) + 1
    })
    return Object.entries(counts)
      .map(([period, value]) => ({ period, value }))
      .sort((a, b) => b.period.localeCompare(a.period)) // Descending
  }, [filteredData])

  // 2. Ranking de Motivos
  const byMotivo = useMemo(() => {
    const counts = {}
    filteredData.forEach(d => {
      const m = (d.motivo_baja || 'SIN MOTIVO').toUpperCase()
      counts[m] = (counts[m] || 0) + 1
    })
    return Object.entries(counts)
      .map(([motivo, value]) => ({ motivo, value }))
      .sort((a, b) => b.value - a.value)
  }, [filteredData])

  // 3. Matriz Cruzada (Campaña vs Motivo)
  const matrixData = useMemo(() => {
    const rowCounts = {}
    const colTotals = {}
    let grandTotal = 0

    filteredData.forEach(d => {
      const c = ((d.campana || d.campaign) || 'SIN CAMPAÑA').toUpperCase()
      const m = (d.motivo_baja || 'SIN MOTIVO').toUpperCase()
      
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
          <span className="animate-pulse">Cargando datos de bajas...</span>
        </div>
      </PageLayout>
    )
  }

  return (
    <PageLayout className="p-4 md:p-6 space-y-6">
      <PageHeader 
        title="Análisis de Bajas" 
        subtitle="Reporte de motivos y deserción por periodo y campaña"
      />
      
      <div className="flex flex-col lg:flex-row gap-6 items-start animate-fadeIn">
        {/* SIDEBAR FILTERS */}
        <Card className="w-full lg:w-72 shrink-0 flex flex-col space-y-6">
          <div className="font-black uppercase tracking-wider flex items-center gap-2 text-[var(--text-primary)] border-b border-[var(--border-subtle)] pb-4">
            <Filter size={18} className="text-[var(--accent)]" /> FILTROS
          </div>
        
        <div className="space-y-4">
          <div>
            <label className="text-xs font-bold text-[var(--text-secondary)] uppercase">Segmento</label>
            <select
              className="w-full mt-1.5 bg-[var(--input-bg)] border border-[var(--input-border)] rounded-xl p-2.5 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)] transition-colors"
              value={selectedSegmento} onChange={e => { setSelectedSegmento(e.target.value); setSelectedCampana('TODAS'); setSelectedGrupo('TODAS'); }}
            >
              {segmentos.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-[var(--text-secondary)] uppercase">Campaña</label>
            <select
              className="w-full mt-1.5 bg-[var(--input-bg)] border border-[var(--input-border)] rounded-xl p-2.5 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)] transition-colors"
              value={selectedCampana} onChange={e => { setSelectedCampana(e.target.value); setSelectedGrupo('TODAS'); }}
            >
              {campanas.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-[var(--text-secondary)] uppercase">Código de Grupo</label>
            <select
              className="w-full mt-1.5 bg-[var(--input-bg)] border border-[var(--input-border)] rounded-xl p-2.5 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)] transition-colors"
              value={selectedGrupo} onChange={e => setSelectedGrupo(e.target.value)}
            >
              {grupos.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-[var(--text-secondary)] uppercase">PERIODO</label>
            <select
              className="w-full mt-1.5 bg-[var(--input-bg)] border border-[var(--input-border)] rounded-xl p-2.5 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)] transition-colors"
              value={selectedPeriodo} onChange={e => { setSelectedPeriodo(e.target.value); setSelectedSemana('TODAS'); }}
            >
              {periodos.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-[var(--text-secondary)] uppercase">SEMANA</label>
            <select
              className="w-full mt-1.5 bg-[var(--input-bg)] border border-[var(--input-border)] rounded-xl p-2.5 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)] transition-colors"
              value={selectedSemana} onChange={e => setSelectedSemana(e.target.value)}
            >
              {semanas.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>

        <div className="pt-4 border-t border-[var(--border-subtle)]">
          <h3 className="text-xs font-bold text-[var(--text-secondary)] uppercase mb-3">Top 5 Motivos</h3>
          <div className="space-y-3">
            {byMotivo.slice(0, 5).map(m => (
              <div key={m.motivo}>
                <div className="text-[10px] text-[var(--text-muted)] font-semibold truncate uppercase tracking-wider" title={m.motivo}>{m.motivo}</div>
                <div className="text-lg font-black text-[var(--text-primary)]">{m.value}</div>
              </div>
            ))}
          </div>
        </div>
        </Card>

      {/* MAIN CONTENT */}
      <div className="flex-1 flex flex-col gap-6 min-w-0">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-[var(--text-primary)] uppercase tracking-wider flex items-center gap-2">
            Desglose Analítico
          </h1>
          <div className="badge badge-indigo text-sm">
            Total Bajas: <span className="ml-1.5 font-bold">{filteredData.length}</span>
          </div>
        </div>

        {/* CHARTS ROW */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[400px]">
          
          {/* Chart 1: Bajas por periodo */}
          <Card noPadding className="flex flex-col h-full">
            <div className="bg-[var(--table-head-bg)] text-[var(--text-primary)] text-center font-bold text-xs uppercase tracking-wider py-2.5 rounded-t-2xl border-b border-[var(--border-subtle)]">
              Bajas por periodo
            </div>
            <div className="flex-1 p-4 pb-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byPeriod} layout="vertical" margin={{ top: 10, right: 30, left: 50, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-normal)" horizontal={false} />
                  <XAxis type="number" hide />
                  <YAxis dataKey="period" type="category" axisLine={false} tickLine={false} tick={{fill: 'var(--text-muted)', fontSize: 11}} width={60} />
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
                <BarChart data={byMotivo.slice(0, 20)} margin={{ top: 20, right: 10, left: -20, bottom: 80 }}>
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
                  <YAxis axisLine={false} tickLine={false} tick={{fill: 'var(--text-muted)', fontSize: 11}} />
                  <RechartsTooltip cursor={{fill: 'rgba(128,128,128,0.1)'}} contentStyle={{backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)', color: 'var(--text-primary)', borderRadius: '8px'}} />
                  <Bar dataKey="value" fill={COLORS.bars} radius={[6, 6, 0, 0]}>
                    <LabelList dataKey="value" position="top" fill="var(--text-muted)" fontSize={11} fontWeight="bold" />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>

        {/* MATRIX TABLE */}
        <Card noPadding className="flex-1 flex flex-col min-h-[350px]">
          <div className="overflow-x-auto overflow-y-auto flex-1 table-scroll">
            <table className="w-full text-left text-xs whitespace-nowrap">
              <thead className="sticky top-0 z-10">
                <tr>
                  <th className="px-4 py-3 border-r border-[var(--border-normal)] font-bold text-[var(--text-secondary)] uppercase tracking-wider">CAMPAÑA</th>
                  {matrixData.topMotivos.map(m => (
                    <th key={m} className="px-4 py-3 border-r border-[var(--border-normal)] font-bold text-[var(--text-secondary)] uppercase text-center max-w-[120px] truncate" title={m}>
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
                        <td key={m} className="px-4 py-2.5 border-r border-[var(--border-subtle)] text-center relative">
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
          </div>
        </Card>

      </div>
      </div>
    </PageLayout>
  )
}
