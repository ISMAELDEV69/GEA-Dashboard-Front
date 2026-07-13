import fs from 'fs'

const code = `import { useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Cell, ScatterChart, Scatter, ZAxis } from 'recharts'
import { Users, GraduationCap, Award, BellRing, Target, AlertTriangle, ShieldAlert } from 'lucide-react'
import {
  computeGlobalMetrics, buildConsolidadoFunnel, nameMatches
} from '../../lib/dashboardAnalytics'
import { DashboardHeader, KpiCard, SheetSyncPanel } from './StoryComponents'

const chartTooltipStyle = { background: '#090d16', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '12px', color: '#f1f5f9', fontSize: '11px' }

export default function AdminDashboard({ postulantes = [], asistencias = [], grupos = [], campanasMetas = [] }) {
  const metrics = useMemo(() => computeGlobalMetrics(postulantes, asistencias, grupos), [postulantes, asistencias, grupos])
  const funnel = useMemo(() => buildConsolidadoFunnel(postulantes, asistencias), [postulantes, asistencias])

  // Rendimiento por Formador
  const formadorPerformance = useMemo(() => {
    const map = new Map()
    
    // Determine formador for each group
    const grupoToFormador = {}
    grupos.forEach(g => {
      grupoToFormador[g.codigo] = g.formador || 'Sin Formador'
    })

    // Get bajas per document
    const bajasSet = new Set()
    asistencias.forEach(a => {
      if (a.sigla_asistencia === 'B') bajasSet.add(a.postulante_documento)
    })

    postulantes.forEach(p => {
      // Find formador. Handle projections or standard groups
      let formador = 'Sin Formador'
      if (p.grupo_codigo && grupoToFormador[p.grupo_codigo]) {
        formador = grupoToFormador[p.grupo_codigo]
      } else {
        // Try stripping standard suffix if needed
        const stripped = String(p.grupo_codigo || '').replace(/_\\d+$/, '')
        if (grupoToFormador[stripped]) formador = grupoToFormador[stripped]
      }

      if (!map.has(formador)) {
        map.set(formador, { name: formador, total: 0, bajas: 0, op: 0 })
      }
      const d = map.get(formador)
      d.total++
      if (bajasSet.has(p.documento)) {
        d.bajas++
      }
      if (p.fecha_conexion_op || asistencias.some(a => a.postulante_documento === p.documento && a.sigla_asistencia === 'I-OP')) {
        d.op++
      }
    })

    return Array.from(map.values())
      .filter(f => f.total > 0 && f.name !== 'Sin Formador')
      .map(f => ({
        name: f.name.split(' ').slice(0, 2).join(' '), // Short name
        Total: f.total,
        Retencion: f.total > 0 ? Math.round(((f.total - f.bajas) / f.total) * 100) : 100,
        ConversionOP: f.total > 0 ? Math.round((f.op / f.total) * 100) : 0
      }))
  }, [postulantes, asistencias, grupos])

  // Motor Inteligente de Alertas
  const alerts = useMemo(() => {
    const items = []
    
    // Alertas por Formador
    formadorPerformance.forEach(f => {
      if (f.Retencion < 70 && f.Total > 5) {
        items.push({ type: 'error', msg: \`Retención crítica en el salón de \${f.name} (\${f.Retencion}% de \${f.Total} reclutados).\` })
      }
    })

    // Alertas por Metas RQ
    campanasMetas.forEach(c => {
      if (c.meta_grupal > 0) {
        const docs = new Set(postulantes.filter(p => Number(p.campana) === Number(c.id) || nameMatches(p.campana, c.nombre)).map(p => p.documento))
        const ops = new Set(asistencias.filter(a => a.sigla_asistencia === 'I-OP' && docs.has(a.postulante_documento)).map(a => a.postulante_documento)).size
        const pct = Math.min(100, Math.round(ops / c.meta_grupal * 100))
        if (pct < 50) {
          items.push({ type: 'warning', msg: \`La campaña \${c.nombre} (\${c.segmento}) está al \${pct}% de su meta RQ (\${ops}/\${c.meta_grupal}).\` })
        }
      }
    })

    if (metrics.evalDia0Pending > 0) {
      items.push({ type: 'info', msg: \`Existen \${metrics.evalDia0Pending} candidatos con Evaluación Día 0 pendiente de calificar.\` })
    }

    if (metrics.dia1Cese > 0) {
      items.push({ type: 'error', msg: \`¡Atención! Se registraron \${metrics.dia1Cese} bajas en su primer día (Mortalidad temprana detectada).\` })
    }

    if (items.length === 0 && metrics.total > 0) {
      items.push({ type: 'success', msg: 'Operación estable. No se detectaron anomalías críticas en el embudo actual.' })
    }

    return items
  }, [formadorPerformance, campanasMetas, postulantes, asistencias, metrics])

  if (metrics.total === 0) {
    return (
      <div className="space-y-6 animate-fadeIn">
        <DashboardHeader title="Control Operativo — Admin" subtitle="Monitoreo del consolidado: reclutamiento, capacitación, alertas y metas RQ" badge="Administración" />
        <SheetSyncPanel />
        <div className="glass rounded-3xl p-12 text-center text-slate-500 border border-slate-800 border-dashed">
          No hay datos operativos disponibles en el sistema.
        </div>
      </div>
    )
  }

  const criticalAlertsCount = alerts.filter(a => a.type === 'error' || a.type === 'warning').length

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Title & Sync Panel */}
      <div>
        <DashboardHeader
          title="Control Operativo — Admin"
          subtitle="Centro de Mando: Embudo, Capacitación, Alertas y Metas RQ"
          badge="Administración"
        />
      </div>

      <SheetSyncPanel />

      {/* KPI Widgets Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Volumen Activo" value={metrics.total} icon={Users} color="text-indigo-400" />
        <KpiCard label="Grupos en Curso" value={metrics.totalGrupos} icon={GraduationCap} color="text-emerald-400" accent="#10b981" />
        <KpiCard label="Conversión OP General" value={\`\${metrics.conversionRate}%\`} icon={Award} color="text-amber-400" accent="#f59e0b" />
        <KpiCard label="Alertas Críticas" value={criticalAlertsCount} icon={BellRing} color={criticalAlertsCount > 0 ? "text-rose-400" : "text-slate-400"} accent={criticalAlertsCount > 0 ? "#ef4444" : "#64748b"} />
      </div>

      {/* Funnel & Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Funnel */}
        <div className="glass rounded-3xl p-6 border border-slate-800/80 bg-slate-900/40 shadow-xl lg:col-span-2">
          <h4 className="text-xs font-bold uppercase tracking-wider mb-6 text-slate-300">Embudo de Conversión Operativa</h4>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={funnel} margin={{ top: 20, right: 20, left: -10, bottom: 40 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.2} />
                <XAxis dataKey="etapa" tick={{ fontSize: 9, fill: '#94a3b8' }} interval={0} angle={-25} textAnchor="end" />
                <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} />
                <RechartsTooltip 
                  contentStyle={chartTooltipStyle} 
                  cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                  formatter={(value, name, props) => [\`\${value} postulantes (\${props.payload.pct}%)\`, name]}
                />
                <Bar dataKey="cantidad" radius={[6, 6, 0, 0]} barSize={40}>
                  {funnel.map((e, i) => <Cell key={i} fill={e.fill} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Alertas */}
        <div className="glass rounded-3xl p-6 border border-slate-800/80 bg-slate-900/40 shadow-xl flex flex-col">
          <h4 className="text-xs font-bold uppercase tracking-wider mb-4 flex items-center gap-2 text-slate-300">
            <AlertTriangle size={14} className="text-amber-400" /> Motor de Alertas
          </h4>
          <div className="space-y-3 flex-1 overflow-y-auto pr-2 custom-scrollbar">
            {alerts.map((a, i) => (
              <div key={i} className="text-[11px] p-4 rounded-2xl leading-relaxed flex items-start gap-3"
                style={{
                  background: a.type === 'error' ? 'rgba(239,68,68,0.1)' : a.type === 'warning' ? 'rgba(245,158,11,0.1)' : a.type === 'success' ? 'rgba(16,185,129,0.1)' : 'rgba(99,102,241,0.1)',
                  color: '#e2e8f0',
                  border: \`1px solid \${a.type === 'error' ? 'rgba(239,68,68,0.3)' : a.type === 'warning' ? 'rgba(245,158,11,0.3)' : a.type === 'success' ? 'rgba(16,185,129,0.3)' : 'rgba(99,102,241,0.3)'}\`,
                }}>
                <div className="mt-0.5 shrink-0">
                  {a.type === 'error' && <ShieldAlert size={14} className="text-rose-400" />}
                  {a.type === 'warning' && <AlertTriangle size={14} className="text-amber-400" />}
                  {a.type === 'info' && <BellRing size={14} className="text-indigo-400" />}
                </div>
                <span>{a.msg}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Metas RQ */}
        <div className="glass rounded-3xl p-6 border border-slate-800/80 bg-slate-900/40 shadow-xl">
          <h4 className="text-xs font-bold uppercase tracking-wider mb-6 flex items-center gap-2 text-slate-300">
            <Target size={14} className="text-emerald-400" /> Cumplimiento de Metas RQ
          </h4>
          <div className="space-y-4 max-h-72 overflow-y-auto pr-2 custom-scrollbar">
            {campanasMetas?.filter(c => c.meta_grupal > 0).length > 0 ? (
              campanasMetas.filter(c => c.meta_grupal > 0).map(c => {
                const docs = new Set(postulantes.filter(p => Number(p.campana) === Number(c.id) || nameMatches(p.campana, c.nombre)).map(p => p.documento))
                const ops = new Set(asistencias.filter(a => a.sigla_asistencia === 'I-OP' && docs.has(a.postulante_documento)).map(a => a.postulante_documento)).size
                const pct = c.meta_grupal > 0 ? Math.min(100, Math.round(ops / c.meta_grupal * 100)) : 0
                
                let barColor = 'var(--accent)'
                if (pct >= 100) barColor = '#10b981'
                else if (pct < 50) barColor = '#ef4444'
                else barColor = '#f59e0b'

                return (
                  <div key={c.id} className="p-4 rounded-2xl bg-slate-950/50 border border-slate-800/50">
                    <div className="flex justify-between mb-2">
                      <div>
                        <p className="text-xs font-bold text-slate-200">{c.nombre}</p>
                        <p className="text-[10px] text-slate-500 mt-0.5">{c.segmento}</p>
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-black text-slate-200">{ops} <span className="text-slate-500 font-medium">/ {c.meta_grupal}</span></span>
                        <p className="text-[9px] font-bold mt-0.5" style={{ color: barColor }}>{pct}% completado</p>
                      </div>
                    </div>
                    <div className="h-2 rounded-full overflow-hidden bg-slate-800/80 mt-3">
                      <div className="h-full rounded-full transition-all duration-1000 ease-out relative overflow-hidden" style={{ width: \`\${pct}%\`, background: barColor }}>
                        <div className="absolute inset-0 bg-white/20 w-full animate-shimmer" style={{ transform: 'translateX(-100%)' }} />
                      </div>
                    </div>
                  </div>
                )
              })
            ) : (
              <div className="text-center text-xs text-slate-500 py-10">No hay metas RQ definidas en las campañas actuales.</div>
            )}
          </div>
        </div>

        {/* Rendimiento por Formador */}
        <div className="glass rounded-3xl p-6 border border-slate-800/80 bg-slate-900/40 shadow-xl">
          <h4 className="text-xs font-bold uppercase tracking-wider mb-2 text-slate-300 flex items-center gap-2">
            <GraduationCap size={14} className="text-indigo-400" /> Rendimiento por Formador
          </h4>
          <p className="text-[10px] text-slate-500 mb-6">Volumen de Alumnos vs Tasa de Retención (%)</p>
          <div className="h-72">
            {formadorPerformance.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.2} />
                  <XAxis type="number" dataKey="Total" name="Volumen Alumnos" stroke="#64748b" fontSize={10} tickLine={false} />
                  <YAxis type="number" dataKey="Retencion" name="Retención %" unit="%" stroke="#64748b" fontSize={10} tickLine={false} domain={[0, 100]} />
                  <ZAxis type="category" dataKey="name" name="Formador" />
                  <RechartsTooltip 
                    cursor={{ strokeDasharray: '3 3' }} 
                    contentStyle={chartTooltipStyle}
                    itemStyle={{ fontSize: '12px' }}
                  />
                  <Scatter data={formadorPerformance}>
                    {formadorPerformance.map((entry, index) => (
                      <Cell key={\`cell-\${index}\`} fill={entry.Retencion > 80 ? '#10b981' : entry.Retencion < 60 ? '#ef4444' : '#8b5cf6'} />
                    ))}
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-slate-550 text-xs">
                Sin datos de formadores vinculados a los grupos.
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}
`

fs.writeFileSync('/Users/saidaquino/Library/Mobile Documents/com~apple~CloudDocs/ARCHIVOS/IMPLEMENTACION NUEVO FRONT/GEAismael - FRONT/src/components/dashboard/AdminDashboard.jsx', code)
console.log('Done')
