import { useState, useEffect, useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, AreaChart, Area
} from 'recharts'
import { Users, GraduationCap, Award, DollarSign, TrendingUp, Target, MapPin, Megaphone } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import {
  computeGlobalMetrics, buildConsolidadoFunnel, buildExecutiveNarrative,
  buildCampanaPerformance, buildSedeRetention, buildMotiveData, buildFuenteOfertaData,
  buildPeriodTrend, nameMatches
} from '../../lib/dashboardAnalytics'
import { DashboardHeader, KpiCard, StorySection, EmptyDataHint, CHART_COLORS, chartTooltipStyle } from './StoryComponents'
import PageLayout from '../ui/PageLayout'
import PageHeader from '../ui/PageHeader'
import Card, { CardHeader } from '../ui/Card'

export default function VisorDashboard({ postulantes = [], asistencias = [], grupos = [], campanasMetas = [] }) {
  const [financialKpis, setFinancialKpis] = useState(null)

  useEffect(() => {
    let isMounted = true
    async function fetchKpis() {
      try {
        const { data, error } = await supabase.rpc('get_visor_kpis_financieros')
        if (error) throw error
        if (isMounted && data) {
          setFinancialKpis(data)
        }
      } catch (err) {
        console.error('Error cargando KPIs financieros de visor:', err)
      }
    }
    fetchKpis()
    return () => { isMounted = false }
  }, [])

  const metrics = useMemo(() => computeGlobalMetrics(postulantes, asistencias, grupos), [postulantes, asistencias, grupos])

  const funnel = useMemo(() => {
    const baseFunnel = buildConsolidadoFunnel(postulantes, asistencias)
    if (!financialKpis) return baseFunnel
    const total = postulantes.length || 1
    return baseFunnel.map(stage => {
      if (stage.etapa.includes('Test')) {
        const c = financialKpis.con_test_psico ?? 0
        return { ...stage, cantidad: c, pct: Math.round((c / total) * 100) }
      }
      if (stage.etapa.includes('Día 0') || stage.etapa.includes('Dia 0') || stage.etapa.includes('Evaluación')) {
        const c = financialKpis.eval_d0_done ?? 0
        return { ...stage, cantidad: c, pct: Math.round((c / total) * 100) }
      }
      return stage
    })
  }, [postulantes, asistencias, financialKpis])

  const campanas = useMemo(() => buildCampanaPerformance(postulantes, asistencias), [postulantes, asistencias])
  const sedes = useMemo(() => buildSedeRetention(postulantes, asistencias), [postulantes, asistencias])
  const motivos = useMemo(() => buildMotiveData(asistencias), [asistencias])
  const fuentes = useMemo(() => buildFuenteOfertaData(postulantes), [postulantes])
  const periodos = useMemo(() => buildPeriodTrend(postulantes), [postulantes])
  const stories = useMemo(() => buildExecutiveNarrative(metrics, funnel, campanas, motivos), [metrics, funnel, campanas, motivos])

  const finalRemuneracion = Number(financialKpis?.total_remuneracion ?? metrics.totalRemuneracion) || 0
  const finalBonos = Number(financialKpis?.total_bonos ?? metrics.totalBonos) || 0
  const costoTotal = finalRemuneracion + finalBonos
  const finalEvalD0Pending = financialKpis?.eval_d0_pending ?? metrics.evalD0Pending

  if (metrics.total === 0) {
    return (
      <PageLayout className="space-y-6">
        <PageHeader title="Panel Directivo — Vista Ejecutiva" subtitle="Storytelling estratégico del consolidado de nóminas" badge="Acceso ejecutivo" />
        <EmptyDataHint role="visor" />
      </PageLayout>
    )
  }

  return (
    <PageLayout className="space-y-6">
      <PageHeader
        title="Panel Directivo — Vista Ejecutiva"
        subtitle="Análisis estratégico del consolidado: reclutamiento → capacitación → operaciones → costo laboral"
        badge="Storytelling ejecutivo"
      />

      <StorySection
        title="Narrativa ejecutiva"
        subtitle="Interpretación de datos del consolidado con recomendaciones accionables para la dirección"
        stories={stories}
      />

      {/* KPIs estratégicos — más amplios que admin */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <KpiCard label="Pipeline total" value={metrics.total} icon={Users} />
        <KpiCard label="En capacitación" value={metrics.inCapacitacion} icon={GraduationCap} accent="#2dd4bf" />
        <KpiCard label="En OJT" value={metrics.enOjt} icon={Target} accent="#818cf8" />
        <KpiCard label="Conexión OP" value={metrics.inOps} icon={Award} accent="#f59e0b" />
        <KpiCard label="Conversión OP" value={`${metrics.conversionRate}%`} sub="Meta: 40%+" icon={TrendingUp} accent="#10b981" />
        <KpiCard label="Asistencia global" value={`${metrics.attendanceRate}%`} icon={GraduationCap} accent="#6366f1" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="CESE Día 1" value={metrics.dia1Cese} sub="Deserción temprana" accent={metrics.dia1Cese > 0 ? '#ef4444' : '#10b981'} />
        <KpiCard label="Eval. D0 pendiente" value={finalEvalD0Pending} accent={finalEvalD0Pending > 0 ? '#f59e0b' : '#10b981'} />
        <KpiCard label="Remuneración pipeline" value={`S/ ${finalRemuneracion.toLocaleString('es-PE')}`} icon={DollarSign} accent="#2dd4bf" />
        <KpiCard label="Costo total proyectado" value={`S/ ${costoTotal.toLocaleString('es-PE')}`} sub="Base + bonos" icon={DollarSign} accent="#f59e0b" />
      </div>

      {/* Embudo consolidado Excel */}
      <Card>
        <CardHeader title="Embudo del consolidado de nóminas" subtitle="Reclutados → Test Psico → Inicio Cap → Eval D0 → OJT → Conexión OP" />
        <div className="h-64 mt-4">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={funnel} margin={{ left: -10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" opacity={0.3} />
              <XAxis dataKey="etapa" tick={{ fontSize: 8, fill: 'var(--text-muted)' }} interval={0} angle={-15} textAnchor="end" height={60} />
              <YAxis tick={{ fontSize: 9, fill: 'var(--text-muted)' }} />
              <Tooltip contentStyle={chartTooltipStyle} formatter={(v, n, p) => [`${v} (${p.payload.pct}%)`, 'Cantidad']} />
              <Bar dataKey="cantidad" radius={[6, 6, 0, 0]}>
                {funnel.map((e, i) => <Cell key={i} fill={e.fill} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Campaña performance */}
        <Card>
          <CardHeader title="Conversión por campaña" actions={<Target size={16} className="text-[var(--text-muted)]" />} />
          <div className="h-56">
            {campanas.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={campanas} layout="vertical" margin={{ left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" opacity={0.2} />
                  <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 9 }} />
                  <YAxis type="category" dataKey="campana" tick={{ fontSize: 8, fill: 'var(--text-muted)' }} width={90} />
                  <Tooltip contentStyle={chartTooltipStyle} />
                  <Bar dataKey="conversion" fill="var(--accent)" radius={[0, 4, 4, 0]} name="Conversión OP %" />
                </BarChart>
              </ResponsiveContainer>
            ) : <p className="text-xs text-center pt-16 text-[var(--text-muted)]">Sin campañas</p>}
          </div>
        </Card>

        {/* Fuente de reclutamiento */}
        <Card>
          <CardHeader title="¿Cómo se enteraron? (Canal)" actions={<Megaphone size={16} className="text-[var(--text-muted)]" />} />
          <div className="h-56">
            {fuentes.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={fuentes} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={40} outerRadius={70} paddingAngle={3}>
                    {fuentes.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={chartTooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
            ) : <p className="text-xs text-center pt-16 text-[var(--text-muted)]">Sin fuentes registradas</p>}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Tendencia por periodo */}
        <Card className="lg:col-span-1">
          <CardHeader title="Ingresos por periodo" />
          <div className="h-48">
            {periodos.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={periodos}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" opacity={0.2} />
                  <XAxis dataKey="periodo" tick={{ fontSize: 8, fill: 'var(--text-muted)' }} />
                  <YAxis tick={{ fontSize: 9, fill: 'var(--text-muted)' }} />
                  <Tooltip contentStyle={chartTooltipStyle} />
                  <Area type="monotone" dataKey="cantidad" stroke="var(--accent)" fill="var(--accent-soft)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : <p className="text-xs text-center pt-12 text-[var(--text-muted)]">Sin periodos</p>}
          </div>
        </Card>

        {/* Retención por sede */}
        <Card className="lg:col-span-1">
          <CardHeader title="Retención por sede" actions={<MapPin size={16} className="text-[var(--text-muted)]" />} />
          <div className="h-48">
            {sedes.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={sedes}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" opacity={0.2} />
                  <XAxis dataKey="Sede" tick={{ fontSize: 8, fill: 'var(--text-muted)' }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 9 }} />
                  <Tooltip contentStyle={chartTooltipStyle} />
                  <Bar dataKey="Retencion" radius={[4, 4, 0, 0]}>
                    {sedes.map((s, i) => <Cell key={i} fill={s.Retencion >= 80 ? '#10b981' : '#f59e0b'} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : <p className="text-xs text-center pt-12 text-[var(--text-muted)]">Sin sedes</p>}
          </div>
        </Card>

        {/* Motivos de baja */}
        <Card className="lg:col-span-1">
          <CardHeader title="Motivos de deserción" />
          <div className="h-48">
            {motivos.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={motivos} dataKey="value" cx="50%" cy="50%" outerRadius={65} paddingAngle={2}>
                    {motivos.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={chartTooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
            ) : <p className="text-xs text-center pt-12 text-[var(--text-muted)]">Sin bajas registradas</p>}
          </div>
        </Card>
      </div>

      {/* Metas RQ resumidas */}
      {campanasMetas?.filter(c => c.meta_grupal > 0).length > 0 && (
        <Card>
          <CardHeader title="Avance de metas RQ por campaña" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {campanasMetas.filter(c => c.meta_grupal > 0).map(c => {
              const docs = new Set(postulantes.filter(p =>
                Number(p.campana) === Number(c.id) || nameMatches(p.campana, c.nombre)
              ).map(p => p.documento))
              const hires = new Set(asistencias.filter(a => a.sigla_asistencia === 'I-OP' && docs.has(a.postulante_documento)).map(a => a.postulante_documento)).size
              const pct = c.meta_grupal > 0 ? Math.min(100, Math.round(hires / c.meta_grupal * 100)) : 0
              return (
                <div key={c.id} className="p-4 rounded-xl bg-[var(--bg-elevated)]">
                  <div className="flex justify-between mb-2">
                    <span className="text-xs font-bold text-[var(--text-primary)]">{c.nombre}</span>
                    <span className="text-xs font-black text-[var(--accent)]">{hires}/{c.meta_grupal} ({pct}%)</span>
                  </div>
                  <div className="h-2 rounded-full overflow-hidden bg-[var(--bg-muted)]">
                    <div className="h-full rounded-full transition-all bg-[var(--accent)]" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      )}
    </PageLayout>
  )
}
