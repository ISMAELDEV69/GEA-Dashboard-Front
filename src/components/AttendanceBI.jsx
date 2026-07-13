import { useState, useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, AreaChart, Area, Cell, PieChart, Pie, Legend, ScatterChart, Scatter, ZAxis
} from 'recharts'
import {
  TrendingDown, Users, Percent, ShieldAlert,
  Grid, Award, Filter, Activity, PieChart as PieChartIcon
} from 'lucide-react'
import PageLayout from './ui/PageLayout'
import PageHeader from './ui/PageHeader'
import Card, { CardHeader } from './ui/Card'

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#8b5cf6', '#06b6d4', '#14b8a6']
const SIGLA_COLORS = {
  'A':    { bg: 'bg-emerald-500/20 text-emerald-300 font-bold border-emerald-500/30', label: 'Presente' },
  'I-OP': { bg: 'bg-indigo-500/20 text-indigo-300 font-bold border-indigo-500/30', label: 'Ingreso Operativo' },
  'FI':   { bg: 'bg-rose-500/20 text-rose-300 font-bold border-rose-500/30', label: 'Falta Injustificada' },
  'FJ':   { bg: 'bg-violet-500/20 text-violet-300 font-bold border-violet-500/30', label: 'Falta Justificada' },
  'B':    { bg: 'bg-red-900/60 text-red-300 font-bold border-red-800', label: 'Baja' }
}

export default function AttendanceBI({ grupos = [], postulantes = [], asistencias = [] }) {
  const [selectedGrupoCode, setSelectedGrupoCode] = useState('TODOS')
  const [selectedSede, setSelectedSede] = useState('TODAS')
  const [selectedCampana, setSelectedCampana] = useState('TODAS')
  
  // HEATMAP Pagination
  const [heatmapPage, setHeatmapPage] = useState(0)
  const itemsPerPage = 20

  // 1. Unique filters list
  const sedesList = useMemo(() => {
    const list = new Set(postulantes.map(p => p.sede).filter(Boolean))
    return ['TODAS', ...Array.from(list)]
  }, [postulantes])

  const campanasList = useMemo(() => {
    const list = new Set(grupos.map(g => g.campana).filter(Boolean))
    return ['TODAS', ...Array.from(list)]
  }, [grupos])

  // 2. Filtered candidate list
  const filteredPostulantes = useMemo(() => {
    return postulantes.filter(p => {
      const matchSede = selectedSede === 'TODAS' || p.sede === selectedSede
      
      let matchGrupo = true
      if (selectedGrupoCode !== 'TODOS') {
        const activeGrupo = grupos.find(g => g.codigo === selectedGrupoCode)
        const mappedDocs = new Set(
        asistencias
          .filter(a => {
            const strippedGpe = String(a.grupo_codigo).startsWith('PROY-') ? 'EN PROYECCIÓN' : String(a.grupo_codigo).replace(/_\d+$/, '');
            return strippedGpe === selectedGrupoCode;
          })
          .map(a => a.postulante_documento)
        )
        const matchCampaign = activeGrupo ? (p.campana === activeGrupo.campana || p.campaign === activeGrupo.campana) : true
        matchGrupo = mappedDocs.has(p.documento) || matchCampaign
      }

      let matchCampana = true
      if (selectedCampana !== 'TODAS') {
        matchCampana = p.campana === selectedCampana || p.campaign === selectedCampana || grupos.some(g => g.codigo === p.grupo_codigo && g.campana === selectedCampana)
      }

      return matchSede && matchGrupo && matchCampana
    })
  }, [postulantes, grupos, asistencias, selectedSede, selectedGrupoCode, selectedCampana])

  const candidateDocsSet = useMemo(() => new Set(filteredPostulantes.map(p => p.documento)), [filteredPostulantes])

  // 3. Filtered Assistances
  const filteredAsistencias = useMemo(() => {
    return asistencias.filter(a => {
      const strippedGpe = String(a.grupo_codigo).startsWith('PROY-') ? 'EN PROYECCIÓN' : String(a.grupo_codigo).replace(/_\d+$/, '');
      const matchGrupo = selectedGrupoCode === 'TODOS' || strippedGpe === selectedGrupoCode
      const matchCandidate = candidateDocsSet.has(a.postulante_documento)
      return matchGrupo && matchCandidate
    })
  }, [asistencias, selectedGrupoCode, candidateDocsSet])

  // 4. BI Metrics & Desertion Processing
  const { biMetrics, motivesData, desertionTrend, recruiterData } = useMemo(() => {
    const totalCount = filteredPostulantes.length
    
    // Attendance rate
    const totalRecords = filteredAsistencias.length
    const presentCount = filteredAsistencias.filter(a => ['A', 'I-OP', 'FJ'].includes(a.sigla_asistencia)).length
    const attendanceRate = totalRecords > 0 ? Math.round((presentCount / totalRecords) * 100) : 0
    
    const bajasMap = new Map() // doc -> motivo
    let bajasDia1Count = 0

    filteredAsistencias.forEach(a => {
      if (a.sigla_asistencia === 'B') {
        const m = (a.motivo_baja || 'No especificado').toUpperCase()
        bajasMap.set(a.postulante_documento, m)
        if (m.includes('BAJA DIA 1') || m.includes('BAJA DÍA 1')) {
          bajasDia1Count++
        }
      }
    })

    // To prevent double counting bajasDia1 if they have multiple B records
    // We actually just count unique candidates that have a baja dia 1
    const bajasDia1Set = new Set(
      filteredAsistencias
        .filter(a => a.sigla_asistencia === 'B' && (a.motivo_baja || '').toUpperCase().includes('BAJA DIA 1'))
        .map(a => a.postulante_documento)
    )
    bajasDia1Count = bajasDia1Set.size

    const activeBajas = bajasMap.size
    const retentionRate = totalCount > 0 ? Math.round(((totalCount - activeBajas) / totalCount) * 100) : 100

    // Motives
    const motivesCount = {}
    bajasMap.forEach(m => {
      motivesCount[m] = (motivesCount[m] || 0) + 1
    })
    const motivesData = Object.entries(motivesCount)
      .map(([name, value]) => ({ name: name.replace('BAJA ', '').trim(), value }))
      .sort((a, b) => b.value - a.value)

    // Desertion Trend (Acumulado de Bajas por Día)
    const dailyBajas = {}
    const seenBajas = new Set()
    
    // Ordenar por fecha para atrapar la PRIMERA vez que son marcados como baja
    const sortedForBajas = [...filteredAsistencias].sort((a, b) => new Date(a.fecha_asistencia) - new Date(b.fecha_asistencia))
    
    sortedForBajas.forEach(a => {
      if (a.sigla_asistencia === 'B') {
        if (!seenBajas.has(a.postulante_documento)) {
          seenBajas.add(a.postulante_documento)
          const date = a.fecha_asistencia
          if (!dailyBajas[date]) dailyBajas[date] = 0
          dailyBajas[date]++
        }
      }
    })

    const datesSorted = Object.keys(dailyBajas).sort((a, b) => new Date(a) - new Date(b))
    let cum = 0
    const desertionTrend = datesSorted.map(d => {
      cum += dailyBajas[d]
      return { Fecha: d, BajasAcumuladas: cum, BajasDia: dailyBajas[d] }
    })

    // Recruiter Performance Matrix
    const recruiters = {}
    filteredPostulantes.forEach(p => {
      const rec = p.reclutador || 'Sin Reclutador'
      if (!recruiters[rec]) recruiters[rec] = { name: rec, total: 0, active: 0, bajas: 0 }
      recruiters[rec].total++
      if (bajasMap.has(p.documento)) {
        recruiters[rec].bajas++
      } else {
        recruiters[rec].active++
      }
    })

    const recruiterData = Object.values(recruiters)
      .map(r => ({
        name: r.name.split(' ').slice(0, 2).join(' '), // Short name (first 2 words)
        Retencion: r.total > 0 ? Math.round((r.active / r.total) * 100) : 100,
        Total: r.total,
        Bajas: r.bajas
      }))
      .filter(r => r.Total > 0)

    return {
      biMetrics: { totalCount, attendanceRate, activeBajas, retentionRate, bajasDia1: bajasDia1Count },
      motivesData,
      desertionTrend,
      recruiterData
    }
  }, [filteredPostulantes, filteredAsistencias])

  // Heatmap Grid Setup
  const heatmapData = useMemo(() => {
    const dates = Array.from(new Set(filteredAsistencias.map(a => a.fecha_asistencia)))
      .sort((a, b) => new Date(a) - new Date(b))

    const gridRows = filteredPostulantes.map(p => {
      const row = {
        documento: p.documento,
        nombre: `${p.apellido_paterno} ${p.apellido_materno?.[0] || ''}. ${p.nombres.split(' ')[0]}`,
        dates: {}
      }

      dates.forEach(d => {
        // Find latest record for that date
        const recordsForDate = filteredAsistencias.filter(
          a => a.postulante_documento === p.documento && a.fecha_asistencia === d
        )
        const record = recordsForDate[recordsForDate.length - 1]
        row.dates[d] = record ? record.sigla_asistencia : '—'
      })

      return row
    })

    return { dates, rows: gridRows }
  }, [filteredPostulantes, filteredAsistencias])

  const paginatedHeatmapRows = useMemo(() => {
    const start = heatmapPage * itemsPerPage
    return heatmapData.rows.slice(start, start + itemsPerPage)
  }, [heatmapData.rows, heatmapPage, itemsPerPage])

  const totalPages = Math.ceil(heatmapData.rows.length / itemsPerPage)

  return (
    <PageLayout className="p-4 md:p-6 space-y-6 overflow-y-auto">
      {/* Title */}
      <PageHeader
        title="Analítica BI & Retención"
        subtitle="Métricas consolidadas de deserción y rendimiento de reclutamiento."
      />

      {/* Interactive Filters */}
      <Card>
        <CardHeader title="Filtros Dinámicos de Consulta" actions={<Filter size={16} className="text-[var(--accent)]" />} />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Grupo */}
          <div>
            <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-2">Grupo de Capacitación</label>
            <select
              value={selectedGrupoCode}
              onChange={(e) => { setSelectedGrupoCode(e.target.value); setHeatmapPage(0) }}
              className="form-input w-full"
            >
              <option value="TODOS">TODOS LOS GRUPOS</option>
              {Array.from(new Set(grupos.map(g => String(g.codigo).startsWith('PROY-') ? 'EN PROYECCIÓN' : String(g.codigo).replace(/_\d+$/, '')))).map(codigo => (
                <option key={codigo} value={codigo}>{codigo}</option>
              ))}
            </select>
          </div>

          {/* Sede */}
          <div>
            <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-2">Sede</label>
            <select
              value={selectedSede}
              onChange={(e) => { setSelectedSede(e.target.value); setHeatmapPage(0) }}
              className="form-input w-full"
            >
              {sedesList.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          {/* Campaña */}
          <div>
            <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-2">Campaña</label>
            <select
              value={selectedCampana}
              onChange={(e) => { setSelectedCampana(e.target.value); setHeatmapPage(0) }}
              className="form-input w-full"
            >
              {campanasList.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>
      </Card>

      {/* KPI Widgets Grid */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { label: 'Total Reclutados', value: biMetrics.totalCount, icon: Users, color: 'text-indigo-400' },
          { label: 'Tasa Asistencia', value: `${biMetrics.attendanceRate}%`, icon: Percent, color: 'text-emerald-400' },
          { label: 'Deserción Total', value: biMetrics.activeBajas, icon: TrendingDown, color: 'text-rose-400' },
          { label: 'Bajas Día 1', value: biMetrics.bajasDia1, icon: ShieldAlert, color: 'text-red-500' },
          { label: 'Retención Real', value: `${biMetrics.retentionRate}%`, icon: Award, color: 'text-amber-400' }
        ].map((kpi, idx) => {
          const Icon = kpi.icon
          return (
            <Card key={idx} className="relative overflow-hidden group">
              <div className="flex justify-between items-start">
                <div className="space-y-1">
                  <p className="text-[10px] font-extrabold text-[var(--text-muted)] uppercase tracking-wider">{kpi.label}</p>
                  <h3 className={`text-2xl font-black ${kpi.color}`}>{kpi.value}</h3>
                </div>
                <div className={`p-2.5 bg-[var(--bg-elevated)] rounded-xl ${kpi.color} border border-[var(--border-subtle)]`}>
                  <Icon size={16} />
                </div>
              </div>
              <div className="absolute bottom-0 left-0 w-full h-[3px] bg-[var(--border-normal)] group-hover:bg-[var(--accent)] transition-colors" />
            </Card>
          )
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Motivos de Deserción */}
        <Card>
          <CardHeader title="Causas de Deserción" actions={<PieChartIcon size={16} className="text-rose-400" />} />
          <div className="h-72">
            {motivesData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={motivesData}
                    cx="50%"
                    cy="45%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {motivesData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <RechartsTooltip 
                    contentStyle={{ background: 'var(--glass-bg)', border: '1px solid var(--border-subtle)', borderRadius: '12px' }}
                    itemStyle={{ color: 'var(--text-primary)', fontSize: '12px' }}
                  />
                  <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: '10px' }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-[var(--text-muted)] text-xs text-center">
                No hay bajas registradas en este segmento.
              </div>
            )}
          </div>
        </Card>

        {/* Desertion Trend Line */}
        <Card className="lg:col-span-2">
          <CardHeader title="Curva de Deserción Acumulada" actions={<TrendingDown size={16} className="text-rose-400" />} />
          <div className="h-72">
            {desertionTrend.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={desertionTrend} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
                  <defs>
                    <linearGradient id="colorBaja" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-normal)" opacity={0.2} />
                  <XAxis dataKey="Fecha" stroke="var(--text-muted)" fontSize={10} tickLine={false} />
                  <YAxis domain={[0, 'dataMax']} stroke="var(--text-muted)" fontSize={10} tickLine={false} />
                  <RechartsTooltip
                    contentStyle={{ background: 'var(--glass-bg)', border: '1px solid var(--border-subtle)', borderRadius: '12px' }}
                    labelStyle={{ color: 'var(--text-muted)', fontWeight: 600, fontSize: '12px' }}
                    itemStyle={{ color: '#ef4444', fontWeight: 700 }}
                  />
                  <Area type="monotone" name="Bajas Acumuladas" dataKey="BajasAcumuladas" stroke="#ef4444" strokeWidth={2.5} fillOpacity={1} fill="url(#colorBaja)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-[var(--text-muted)] text-xs">
                Suficientes datos históricos no disponibles.
              </div>
            )}
          </div>
        </Card>

      </div>

      {/* Recruiter Performance Scatter */}
      <Card>
        <CardHeader title="Matriz de Rendimiento por Reclutador" subtitle="Volumen Traído vs Tasa de Retención" actions={<Award size={16} className="text-indigo-400" />} />
        <div className="h-80">
          {recruiterData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-normal)" opacity={0.2} />
                <XAxis type="number" dataKey="Total" name="Volumen" stroke="var(--text-muted)" fontSize={10} tickLine={false} label={{ value: 'Volumen Reclutado', position: 'insideBottom', offset: -10, fill: 'var(--text-muted)', fontSize: 10 }} />
                <YAxis type="number" dataKey="Retencion" name="Retención" unit="%" stroke="var(--text-muted)" fontSize={10} tickLine={false} domain={[0, 100]} label={{ value: 'Retención %', angle: -90, position: 'insideLeft', fill: 'var(--text-muted)', fontSize: 10 }} />
                <ZAxis type="category" dataKey="name" name="Reclutador" />
                <RechartsTooltip 
                  cursor={{ strokeDasharray: '3 3' }} 
                  contentStyle={{ background: 'var(--glass-bg)', border: '1px solid var(--border-subtle)', borderRadius: '12px' }}
                  itemStyle={{ fontSize: '12px' }}
                />
                <Scatter data={recruiterData} fill="#8b5cf6">
                  {recruiterData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.Retencion > 80 ? '#10b981' : entry.Retencion < 50 ? '#ef4444' : '#f59e0b'} />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-full text-[var(--text-muted)] text-xs">
              Sin datos de reclutadores.
            </div>
          )}
        </div>
      </Card>

      {/* Attendance Heatmap Matrix Grid */}
      <Card noPadding className="shadow-xl overflow-hidden">
        <div className="px-6 py-4 bg-[var(--bg-surface)] border-b border-[var(--border-subtle)] flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-[var(--accent-soft)] text-[var(--accent)] rounded-xl border border-[var(--border-subtle)]">
              <Grid size={18} />
            </div>
            <div>
              <h4 className="font-bold text-[var(--text-primary)] text-sm">Matriz de Asistencia (Heatmap)</h4>
              <p className="text-[10px] text-[var(--text-muted)] mt-0.5">Seguimiento individual de asistencia a lo largo de la capacitación.</p>
            </div>
          </div>
          
          <div className="flex items-center gap-6">
            <div className="flex gap-3 text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-emerald-500/15 border border-emerald-500/20" /> A</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-indigo-500/15 border border-indigo-500/20" /> I-OP</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-rose-500/15 border border-rose-500/20" /> FI</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-violet-500/15 border border-violet-500/20" /> FJ</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-[var(--bg-muted)] border border-[var(--border-normal)]" /> B</span>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center space-x-2 bg-[var(--bg-elevated)] px-2 py-1.5 rounded-lg border border-[var(--border-subtle)]">
                <button 
                  disabled={heatmapPage === 0} 
                  onClick={() => setHeatmapPage(p => p - 1)}
                  className="px-2 py-0.5 text-xs font-bold text-[var(--text-primary)] disabled:opacity-30 hover:bg-[var(--bg-muted)] rounded"
                >
                  &lt;
                </button>
                <span className="text-[10px] font-mono text-[var(--text-muted)]">
                  {heatmapPage + 1} / {totalPages}
                </span>
                <button 
                  disabled={heatmapPage >= totalPages - 1} 
                  onClick={() => setHeatmapPage(p => p + 1)}
                  className="px-2 py-0.5 text-xs font-bold text-[var(--text-primary)] disabled:opacity-30 hover:bg-[var(--bg-muted)] rounded"
                >
                  &gt;
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="table-scroll overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[var(--table-head-bg)] text-[var(--text-secondary)] font-bold uppercase tracking-wider border-b border-[var(--border-subtle)]">
              <tr>
                <th className="px-6 py-3.5 font-bold">Estudiante</th>
                {heatmapData.dates.length > 0 ? (
                  heatmapData.dates.map(date => (
                    <th key={date} className="px-3 py-3.5 text-center font-mono text-[10px] whitespace-nowrap">
                      {date.split('-').slice(1).join('/')}
                    </th>
                  ))
                ) : (
                  <th className="px-3 py-3.5 text-center">Sin Fechas</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {paginatedHeatmapRows.length > 0 ? (
                paginatedHeatmapRows.map(row => (
                  <tr key={row.documento} className="hover:bg-[var(--bg-muted)] transition-colors">
                    <td className="px-6 py-3.5">
                      <div className="font-semibold text-[var(--text-primary)]">{row.nombre}</div>
                      <div className="text-[9px] text-[var(--text-muted)] font-mono mt-0.5">{row.documento}</div>
                    </td>
                    {heatmapData.dates.map(date => {
                      const sigla = row.dates[date] || '—'
                      const meta = SIGLA_COLORS[sigla] || { bg: 'bg-[var(--bg-muted)] text-[var(--text-secondary)] border border-[var(--border-subtle)]', label: 'No Registrado' }
                      return (
                        <td key={date} className="px-3 py-3.5 text-center">
                          <div
                            title={`${meta.label} (${date})`}
                            className={`w-6 h-6 inline-flex items-center justify-center rounded-[6px] font-black text-[9px] border select-none transition-all duration-300 hover:scale-110 ${meta.bg}`}
                          >
                            {sigla}
                          </div>
                        </td>
                      )
                    })}
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={heatmapData.dates.length + 1} className="px-6 py-12 text-center text-[var(--text-muted)] font-semibold">
                    No hay suficientes datos de asistencia para construir la matriz calórica.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </PageLayout>
  )
}
