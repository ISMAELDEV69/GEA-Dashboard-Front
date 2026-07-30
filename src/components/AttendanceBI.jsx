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
  const [selectedPeriodo, setSelectedPeriodo] = useState('TODOS')
  const [selectedSemana, setSelectedSemana] = useState('TODAS')
  const [selectedSegmento, setSelectedSegmento] = useState('TODOS')
  const [selectedCampana, setSelectedCampana] = useState('TODAS')
  const [selectedGrupoCode, setSelectedGrupoCode] = useState('TODOS')
  
  // Component State

  // 1. Unique filters list (Cruzados Estrictos)
  const periodosList = useMemo(() => {
    const list = new Set(grupos.map(g => g.periodo).filter(Boolean))
    return ['TODOS', ...Array.from(list).sort((a, b) => b.localeCompare(a))]
  }, [grupos])

  const semanasList = useMemo(() => {
    const subset = grupos.filter(g => {
      return selectedPeriodo === 'TODOS' || g.periodo === selectedPeriodo;
    })
    const list = new Set(subset.map(g => g.semana_label).filter(Boolean))
    return ['TODAS', ...Array.from(list).sort((a, b) => b.localeCompare(a))]
  }, [grupos, selectedPeriodo])

  const segmentosList = useMemo(() => {
    const subset = grupos.filter(g => {
      const matchPeriodo = selectedPeriodo === 'TODOS' || g.periodo === selectedPeriodo;
      const matchSemana = selectedSemana === 'TODAS' || g.semana_label === selectedSemana;
      return matchPeriodo && matchSemana;
    })
    const list = new Set(subset.map(g => g.segmento).filter(Boolean))
    return ['TODOS', ...Array.from(list).sort()]
  }, [grupos, selectedPeriodo, selectedSemana])

  const campanasList = useMemo(() => {
    const subset = grupos.filter(g => {
      const matchPeriodo = selectedPeriodo === 'TODOS' || g.periodo === selectedPeriodo;
      const matchSemana = selectedSemana === 'TODAS' || g.semana_label === selectedSemana;
      const matchSegmento = selectedSegmento === 'TODOS' || g.segmento === selectedSegmento;
      return matchPeriodo && matchSemana && matchSegmento;
    })
    const list = new Set(subset.map(g => g.campana).filter(Boolean))
    return ['TODAS', ...Array.from(list).sort()]
  }, [grupos, selectedPeriodo, selectedSemana, selectedSegmento])

  const gruposList = useMemo(() => {
    const subset = grupos.filter(g => {
      const matchPeriodo = selectedPeriodo === 'TODOS' || g.periodo === selectedPeriodo;
      const matchSemana = selectedSemana === 'TODAS' || g.semana_label === selectedSemana;
      const matchSegmento = selectedSegmento === 'TODOS' || g.segmento === selectedSegmento;
      const matchCampana = selectedCampana === 'TODAS' || g.campana === selectedCampana;
      return matchPeriodo && matchSemana && matchSegmento && matchCampana;
    })
    const list = new Set(subset.map(g => String(g.codigo).startsWith('PROY-') ? 'EN PROYECCIÓN' : String(g.codigo).replace(/_\d+$/, '')).filter(Boolean))
    return ['TODOS', ...Array.from(list).sort()]
  }, [grupos, selectedPeriodo, selectedSemana, selectedSegmento, selectedCampana])

  // 2. Filtered candidate list
  const filteredPostulantes = useMemo(() => {
    return postulantes.filter(p => {
      const pCampana = (p.campana || p.campaign || '').toUpperCase().trim();
      const sCampana = selectedCampana.toUpperCase().trim();
      const matchCampana = selectedCampana === 'TODAS' || pCampana === sCampana;
      
      const pGpe = String(p.grupo_codigo).startsWith('PROY-') ? 'EN PROYECCIÓN' : String(p.grupo_codigo).replace(/_\d+$/, '');
      const matchGrupo = selectedGrupoCode === 'TODOS' || pGpe === selectedGrupoCode;

      // Find official group to inherit hierarchical filters (Periodo, Semana, Segmento)
      const matchedGrupo = grupos.find(g => {
         const gCode = String(g.codigo).startsWith('PROY-') ? 'EN PROYECCIÓN' : String(g.codigo).replace(/_\d+$/, '');
         const gCampana = (g.campana || '').toUpperCase().trim();
         return gCode === pGpe && gCampana === pCampana;
      });

      const pSegmento = p.segmento || (matchedGrupo ? matchedGrupo.segmento : null);
      const safePSegmento = (pSegmento || '').toUpperCase().trim();
      const safeSSegmento = selectedSegmento.toUpperCase().trim();
      const matchSegmento = selectedSegmento === 'TODOS' || safePSegmento === safeSSegmento;
      
      const pPeriodo = matchedGrupo ? matchedGrupo.periodo : null;
      const matchPeriodo = selectedPeriodo === 'TODOS' || pPeriodo === selectedPeriodo;
      
      const pSemana = matchedGrupo ? matchedGrupo.semana_label : null;
      const matchSemana = selectedSemana === 'TODAS' || pSemana === selectedSemana;

      return matchPeriodo && matchSemana && matchSegmento && matchCampana && matchGrupo;
    })
  }, [postulantes, grupos, selectedPeriodo, selectedSemana, selectedSegmento, selectedCampana, selectedGrupoCode])

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
  const { biMetrics, motivesData, desertionTrend, recruiterData, formadorData } = useMemo(() => {
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
    
    // Un postulante es "ACTIVO" (Retenido) solo si llegó a la asistencia del formador y no tiene Baja
    const asistentesDocs = new Set(filteredAsistencias.map(a => a.postulante_documento))
    const activeCount = filteredPostulantes.filter(p => asistentesDocs.has(p.documento) && !bajasMap.has(p.documento)).length
    
    const retentionRate = totalCount > 0 ? Math.round((activeCount / totalCount) * 100) : 100

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
      
      // Es retenido si llegó a la asistencia del formador y no es Baja
      if (asistentesDocs.has(p.documento) && !bajasMap.has(p.documento)) {
        recruiters[rec].active++
      } else {
        recruiters[rec].bajas++
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

    // Formador Performance Matrix
    const docToFormador = {}
    filteredAsistencias.forEach(a => {
      if (a.formador) {
        docToFormador[a.postulante_documento] = a.formador
      }
    })

    const formadoresMap = {}
    const opDocs = new Set(
      filteredAsistencias
        .filter(a => a.sigla_asistencia === 'I-OP')
        .map(a => a.postulante_documento)
    )

    filteredPostulantes.forEach(p => {
      if (!asistentesDocs.has(p.documento)) return // Only count those who reached the formador
      if (bajasDia1Set.has(p.documento)) return // Exclude Baja Dia 1 from Formador's metrics

      const formador = docToFormador[p.documento] || 'Sin Formador'

      if (!formadoresMap[formador]) {
         formadoresMap[formador] = { name: formador, total: 0, bajas: 0, op: 0 }
      }
      formadoresMap[formador].total++
      
      if (bajasMap.has(p.documento)) {
        formadoresMap[formador].bajas++
      }
      if (opDocs.has(p.documento)) {
        formadoresMap[formador].op++
      }
    })

    const formadorData = Object.values(formadoresMap)
      .map(f => ({
        name: f.name.split(' ').slice(0, 2).join(' '),
        Total: f.total,
        Desercion: f.total > 0 ? Math.round((f.bajas / f.total) * 100) : 0,
        Dotacion: f.total > 0 ? Math.round((f.op / f.total) * 100) : 0
      }))
      .filter(f => f.Total > 0 && f.name !== 'Sin Formador')

    return {
      biMetrics: { totalCount, attendanceRate, activeBajas, retentionRate, bajasDia1: bajasDia1Count },
      motivesData,
      desertionTrend,
      recruiterData,
      formadorData
    }
  }, [filteredPostulantes, filteredAsistencias, grupos])
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
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          {/* Periodo */}
          <div>
            <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-2">Periodo</label>
            <select
              value={selectedPeriodo}
              onChange={(e) => { setSelectedPeriodo(e.target.value); setSelectedSemana('TODAS'); setSelectedSegmento('TODOS'); setSelectedCampana('TODAS'); setSelectedGrupoCode('TODOS'); }}
              className="form-input w-full"
            >
              {periodosList.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>

          {/* Semana */}
          <div>
            <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-2">Semana</label>
            <select
              value={selectedSemana}
              onChange={(e) => { setSelectedSemana(e.target.value); setSelectedSegmento('TODOS'); setSelectedCampana('TODAS'); setSelectedGrupoCode('TODOS'); }}
              className="form-input w-full"
            >
              {semanasList.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          {/* Segmento */}
          <div>
            <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-2">Segmento</label>
            <select
              value={selectedSegmento}
              onChange={(e) => { setSelectedSegmento(e.target.value); setSelectedCampana('TODAS'); setSelectedGrupoCode('TODOS'); }}
              className="form-input w-full"
            >
              {segmentosList.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          {/* Campaña */}
          <div>
            <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-2">Campaña</label>
            <select
              value={selectedCampana}
              onChange={(e) => { setSelectedCampana(e.target.value); setSelectedGrupoCode('TODOS'); }}
              className="form-input w-full"
            >
              {campanasList.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* Grupo */}
          <div>
            <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-2">Grupo de Capacitación</label>
            <select
              value={selectedGrupoCode}
              onChange={(e) => { setSelectedGrupoCode(e.target.value); }}
              className="form-input w-full"
            >
              {gruposList.map(codigo => (
                <option key={codigo} value={codigo}>{codigo}</option>
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

      {/* Formador Performance Scatter */}
      <Card>
        <CardHeader title="Matriz de Rendimiento por Formador" subtitle="Dotación (I-OP) vs Deserción" actions={<Activity size={16} className="text-emerald-400" />} />
        <div className="h-80">
          {formadorData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-normal)" opacity={0.2} />
                <XAxis type="number" dataKey="Dotacion" name="Dotación" unit="%" stroke="var(--text-muted)" fontSize={10} tickLine={false} domain={[0, 100]} label={{ value: 'Dotación (I-OP) %', position: 'insideBottom', offset: -10, fill: 'var(--text-muted)', fontSize: 10 }} />
                <YAxis type="number" dataKey="Desercion" name="Deserción" unit="%" stroke="var(--text-muted)" fontSize={10} tickLine={false} domain={[0, 100]} label={{ value: 'Deserción %', angle: -90, position: 'insideLeft', fill: 'var(--text-muted)', fontSize: 10 }} />
                <ZAxis type="category" dataKey="name" name="Formador" />
                <RechartsTooltip 
                  cursor={{ strokeDasharray: '3 3' }} 
                  contentStyle={{ background: 'var(--glass-bg)', border: '1px solid var(--border-subtle)', borderRadius: '12px' }}
                  itemStyle={{ fontSize: '12px' }}
                />
                <Scatter data={formadorData} fill="#10b981">
                  {formadorData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.Desercion > 50 ? '#ef4444' : entry.Dotacion > 80 ? '#10b981' : '#f59e0b'} />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-full text-[var(--text-muted)] text-xs">
              Sin datos de formadores.
            </div>
          )}
        </div>
      </Card>
    </PageLayout>
  )
}
