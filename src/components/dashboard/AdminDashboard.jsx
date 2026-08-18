import { useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Cell, ScatterChart, Scatter, ZAxis } from 'recharts'
import { Users, GraduationCap, Award, BellRing, Target, AlertTriangle, ShieldAlert } from 'lucide-react'
import {
  computeGlobalMetrics, buildConsolidadoFunnel, nameMatches
} from '../../lib/dashboardAnalytics'
import { DashboardHeader, KpiCard } from './StoryComponents'
import SheetSyncPanel from './SheetSyncPanel'
import PageLayout from '../ui/PageLayout'
import PageHeader from '../ui/PageHeader'
import Card, {
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent
} from '../ui/Card'
import { ChartTooltipContent } from '../ui/chart-tooltip'
import { Badge } from '../ui/badge'

const chartTooltipStyle = { background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: '12px', color: 'var(--text-primary)', fontSize: '11px' }

export default function AdminDashboard({
  postulantes = [],
  asistencias = [],
  grupos = [],
  campanasMetas = [],
  userProfile = null,
  reclutadores = []
}) {
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
      let formador = 'Sin Formador'
      if (p.grupo_codigo && grupoToFormador[p.grupo_codigo]) {
        formador = grupoToFormador[p.grupo_codigo]
      } else {
        const stripped = String(p.grupo_codigo || '').replace(/_\d+$/, '')
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
        name: f.name.split(' ').slice(0, 2).join(' '),
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
        items.push({ type: 'error', msg: `Retención crítica en el salón de ${f.name} (${f.Retencion}% de ${f.Total} reclutados).` })
      }
    })

    // Alertas por Metas RQ
    campanasMetas.forEach(c => {
      if (c.meta_grupal > 0) {
        const docs = new Set(postulantes.filter(p => Number(p.campana) === Number(c.id) || nameMatches(p.campana, c.nombre)).map(p => p.documento))
        const ops = new Set(asistencias.filter(a => a.sigla_asistencia === 'I-OP' && docs.has(a.postulante_documento)).map(a => a.postulante_documento)).size
        const pct = Math.min(100, Math.round(ops / c.meta_grupal * 100))
        if (pct < 50) {
          items.push({ type: 'warning', msg: `La campaña ${c.nombre} (${c.segmento}) está al ${pct}% de su meta RQ (${ops}/${c.meta_grupal}).` })
        }
      }
    })

    if (metrics.evalDia0Pending > 0) {
      items.push({ type: 'info', msg: `Existen ${metrics.evalDia0Pending} candidatos con Evaluación Día 0 pendiente de calificar.` })
    }

    return items
  }, [formadorPerformance, campanasMetas, postulantes, asistencias, metrics])

  const criticalAlertsCount = alerts.filter(a => a.type === 'error' || a.type === 'warning').length

  return (
    <PageLayout className="p-4 md:p-6 space-y-6 overflow-y-auto">
      {/* Title & Sync Panel */}
      <PageHeader
        title="Control Operativo"
        subtitle="Centro de Mando: Embudo, Capacitación, Alertas y Metas RQ"
        actions={<div className="bg-[var(--accent-soft)] text-[var(--accent)] text-xs font-bold px-3 py-1.5 rounded-full uppercase">Administración</div>}
      />

      <SheetSyncPanel />

      {/* KPI Widgets Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Volumen Activo" value={metrics.total} icon={Users} color="text-indigo-400" />
        <KpiCard label="Grupos en Curso" value={metrics.totalGrupos} icon={GraduationCap} color="text-emerald-400" accent="#10b981" />
        <KpiCard label="Conversión OP General" value={`${metrics.conversionRate}%`} icon={Award} color="text-amber-400" accent="#f59e0b" />
        <KpiCard label="Alertas Críticas" value={criticalAlertsCount} icon={BellRing} color={criticalAlertsCount > 0 ? "text-rose-400" : "text-slate-400"} accent={criticalAlertsCount > 0 ? "#ef4444" : "#64748b"} />
      </div>

      {/* Funnel & Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Funnel - Modernizado con shadcn Card + KPI Header + Glassmorphism Tooltip */}
        <Card className="lg:col-span-2 shadow-sm hover:shadow-md transition-all duration-300">
          <CardHeader className="flex flex-row items-start justify-between pb-2">
            <div>
              <CardTitle className="text-base font-bold flex items-center gap-2">
                Embudo de Conversión Operativa
                <Badge variant="secondary" className="text-[10px] font-mono">
                  {metrics.total} Total
                </Badge>
              </CardTitle>
              <CardDescription className="text-xs text-[var(--text-muted)] mt-1">
                Evolución de retención desde Día 0 hasta Incorporación a Operación (I-OP)
              </CardDescription>
            </div>
            <div className="flex flex-col items-end">
              <div className="flex items-center gap-1.5">
                <span className="text-xl font-extrabold text-[var(--text-primary)] tracking-tight">
                  {metrics.conversionRate}%
                </span>
                <Badge 
                  variant={metrics.conversionRate >= 70 ? "success" : metrics.conversionRate >= 45 ? "warning" : "destructive"}
                  className="text-[10px] px-2 py-0.5"
                >
                  {metrics.conversionRate >= 70 ? "✓ Óptimo" : metrics.conversionRate >= 45 ? "⚡ Regular" : "⚠ Crítico"}
                </Badge>
              </div>
              <span className="text-[10px] text-[var(--text-muted)] font-medium">Conversión Global</span>
            </div>
          </CardHeader>

          <CardContent className="pt-2">
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={funnel} margin={{ top: 15, right: 15, left: -15, bottom: 35 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-normal)" opacity={0.3} vertical={false} />
                  <XAxis 
                    dataKey="etapa" 
                    tick={{ fontSize: 10, fill: 'var(--text-muted)' }} 
                    interval={0} 
                    angle={-20} 
                    textAnchor="end" 
                    axisLine={{ stroke: 'var(--border-normal)' }}
                    tickLine={false}
                  />
                  <YAxis 
                    tick={{ fontSize: 10, fill: 'var(--text-muted)' }} 
                    axisLine={false}
                    tickLine={false}
                  />
                  <RechartsTooltip 
                    content={<ChartTooltipContent 
                      labelFormatter={(label) => `Etapa: ${label}`}
                      formatter={(val, name, item) => [`${val} postulantes (${item.payload.pct}%)`, 'Cantidad']}
                    />} 
                    cursor={{ fill: 'var(--bg-elevated)', opacity: 0.5, radius: 6 }}
                  />
                  <Bar dataKey="cantidad" radius={[8, 8, 0, 0]} barSize={36} animationDuration={800}>
                    {funnel.map((e, i) => (
                      <Cell 
                        key={i} 
                        fill={e.fill} 
                        className="transition-all duration-200 hover:opacity-85 cursor-pointer"
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Alertas */}
        <Card className="flex flex-col">
          <CardHeader title="Motor de Alertas" actions={<AlertTriangle size={16} className="text-amber-400" />} />
          <div className="space-y-3 flex-1 overflow-y-auto pr-2 custom-scrollbar">
            {alerts.map((a, i) => (
              <div key={i} className="text-[11px] p-4 rounded-2xl leading-relaxed flex items-start gap-3"
                style={{
                  background: a.type === 'error' ? 'rgba(239,68,68,0.1)' : a.type === 'warning' ? 'rgba(245,158,11,0.1)' : a.type === 'success' ? 'rgba(16,185,129,0.1)' : 'rgba(99,102,241,0.1)',
                  color: '#e2e8f0',
                  border: `1px solid ${a.type === 'error' ? 'rgba(239,68,68,0.3)' : a.type === 'warning' ? 'rgba(245,158,11,0.3)' : a.type === 'success' ? 'rgba(16,185,129,0.3)' : 'rgba(99,102,241,0.3)'}`,
                }}>
                <div className="mt-0.5 shrink-0">
                  {a.type === 'error' && <ShieldAlert size={14} className="text-rose-400" />}
                  {a.type === 'warning' && <AlertTriangle size={14} className="text-amber-400" />}
                  {a.type === 'info' && <BellRing size={14} className="text-indigo-400" />}
                </div>
                <span className="text-[var(--text-primary)]">{a.msg}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Metas RQ */}
        <Card>
          <CardHeader title="Cumplimiento de Metas RQ" actions={<Target size={16} className="text-emerald-400" />} />
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
                  <div key={c.id} className="p-4 rounded-2xl bg-[var(--bg-muted)] border border-[var(--border-subtle)]">
                    <div className="flex justify-between mb-2">
                      <div>
                        <p className="text-xs font-bold text-[var(--text-primary)]">{c.nombre}</p>
                        <p className="text-[10px] text-[var(--text-muted)] mt-0.5">{c.segmento}</p>
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-black text-[var(--text-primary)]">{ops} <span className="text-[var(--text-muted)] font-medium">/ {c.meta_grupal}</span></span>
                        <p className="text-[9px] font-bold mt-0.5" style={{ color: barColor }}>{pct}% completado</p>
                      </div>
                    </div>
                    <div className="h-2 rounded-full overflow-hidden bg-[var(--bg-elevated)] mt-3">
                      <div className="h-full rounded-full transition-all duration-1000 ease-out relative overflow-hidden" style={{ width: `${pct}%`, background: barColor }}>
                        <div className="absolute inset-0 bg-white/20 w-full animate-shimmer" style={{ transform: 'translateX(-100%)' }} />
                      </div>
                    </div>
                  </div>
                )
              })
            ) : (
              <div className="text-center text-xs text-[var(--text-muted)] py-10">No hay metas RQ definidas en las campañas actuales.</div>
            )}
          </div>
        </Card>

        {/* Rendimiento por Formador */}
        <Card>
          <CardHeader title="Rendimiento por Formador" actions={<GraduationCap size={16} className="text-indigo-400" />} subtitle="Volumen de Alumnos vs Tasa de Retención (%)" />
          <div className="h-72">
            {formadorPerformance.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-normal)" opacity={0.2} />
                  <XAxis type="number" dataKey="Total" name="Volumen Alumnos" stroke="var(--text-muted)" fontSize={10} tickLine={false} />
                  <YAxis type="number" dataKey="Retencion" name="Retención %" unit="%" stroke="var(--text-muted)" fontSize={10} tickLine={false} domain={[0, 100]} />
                  <ZAxis type="category" dataKey="name" name="Formador" />
                  <RechartsTooltip 
                    cursor={{ strokeDasharray: '3 3' }} 
                    contentStyle={chartTooltipStyle}
                    itemStyle={{ fontSize: '12px' }}
                  />
                  <Scatter data={formadorPerformance}>
                    {formadorPerformance.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.Retencion > 80 ? '#10b981' : entry.Retencion < 60 ? '#ef4444' : '#8b5cf6'} />
                    ))}
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-[var(--text-muted)] text-xs">
                Sin datos de formadores vinculados a los grupos.
              </div>
            )}
          </div>
        </Card>
      </div>
    </PageLayout>
  )
}
