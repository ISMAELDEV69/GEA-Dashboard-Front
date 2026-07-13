import { useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, Cell } from 'recharts'
import { GraduationCap, Percent, AlertTriangle, ShieldAlert, ClipboardCheck, Users, Target } from 'lucide-react'
import {
  computeFormadorMetrics, buildFormadorPipeline, buildFormadorNarrative, getConsecutiveFIs
} from '../../lib/dashboardAnalytics'
import { resolveFormadorDocumento, filterGruposFormador, gruposEntrantes } from '../../lib/flujoOperativo'
import { DashboardHeader, KpiCard, StorySection, PipelineBar, EmptyDataHint, CHART_COLORS, chartTooltipStyle } from './StoryComponents'
import PageLayout from '../ui/PageLayout'
import PageHeader from '../ui/PageHeader'
import Card, { CardHeader } from '../ui/Card'

export default function FormadorDashboard({ postulantes = [], asistencias = [], grupos = [], userProfile = null, formadores = [] }) {
  const formadorDni = resolveFormadorDocumento(userProfile, formadores)

  const myGrupos = useMemo(() =>
    filterGruposFormador(grupos, userProfile, formadores),
    [grupos, userProfile, formadores])

  const entrantes = useMemo(() => gruposEntrantes(myGrupos, postulantes), [myGrupos, postulantes])

  const metrics = useMemo(() =>
    computeFormadorMetrics(
      postulantes,
      asistencias,
      myGrupos.length ? myGrupos : grupos,
      formadorDni,
      { preFiltered: myGrupos.length > 0 }
    ),
    [postulantes, asistencias, myGrupos, grupos, formadorDni])

  const pipeline = useMemo(() =>
    buildFormadorPipeline(metrics.myPostulantes),
    [metrics.myPostulantes])

  const stories = useMemo(() => buildFormadorNarrative(metrics), [metrics])

  const criticalList = useMemo(() => {
    const list = []
    const docs = new Set(metrics.myAsist.map(a => a.postulante_documento))
    docs.forEach(doc => {
      const isBaja = metrics.myAsist.some(a => a.postulante_documento === doc && a.sigla_asistencia === 'B')
      const fi = getConsecutiveFIs(doc, metrics.myAsist)
      if (!isBaja && fi >= 2) {
        const c = postulantes.find(p => p.documento === doc)
        list.push({ doc, nombre: c ? `${c.apellido_paterno} ${c.nombres}` : doc, fi, celular: c?.celular })
      }
    })
    return list.sort((a, b) => b.fi - a.fi)
  }, [metrics, postulantes])

  const trendData = useMemo(() => {
    const daily = {}
    metrics.myAsist.forEach(a => {
      const d = a.fecha_asistencia
      if (!daily[d]) daily[d] = { date: d, present: 0, total: 0 }
      daily[d].total++
      if (['A', 'I-OP', 'FJ'].includes(a.sigla_asistencia)) daily[d].present++
    })
    return Object.values(daily).sort((a, b) => new Date(a.date) - new Date(b.date))
      .map(s => ({ Fecha: s.date.split('-').slice(1).join('/'), Asistencia: s.total ? Math.round(s.present / s.total * 100) : 0 }))
  }, [metrics.myAsist])

  if (metrics.alumnosActivos === 0 && metrics.activeGroupsCount === 0) {
    return (
      <PageLayout className="space-y-6">
        <PageHeader title="Capacitación — Formador" subtitle={`Trainer: ${userProfile?.nombre || 'Sin asignar'}`} badge="Pipeline de aula" />
        <EmptyDataHint role="formador" />
      </PageLayout>
    )
  }

  return (
    <PageLayout className="space-y-6">
      <PageHeader
        title="Capacitación — Formador"
        subtitle={`Trainer: ${userProfile?.nombre || 'Activo'} · Consolidado: test psico → eval D0 → OJT → OP`}
        badge="KPIs de capacitación"
      />

      <StorySection
        title="Data Storytelling — Tu aula"
        subtitle="Postulantes derivados por reclutadores — verifica PC, estudios y registra asistencia"
        stories={stories}
      />

      {entrantes.length > 0 && (
        <Card className="border-[var(--accent)]/20">
          <CardHeader title="Grupos recibidos de reclutamiento" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {entrantes.slice(0, 6).map(g => (
              <div key={g.codigo} className="p-3 rounded-xl bg-[var(--bg-elevated)]">
                <p className="text-xs font-bold text-[var(--text-primary)]">{g.codigo}</p>
                <p className="text-[10px] text-[var(--text-muted)]">{g.campana} · {g.alumnosCount} alumnos</p>
                {g.pendientesVerificacion > 0 && (
                  <p className="text-[9px] text-amber-400 mt-1">{g.pendientesVerificacion} pendientes verificar</p>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Grupos activos" value={metrics.activeGroupsCount} icon={GraduationCap} />
        <KpiCard label="Alumnos en aula" value={metrics.alumnosActivos} icon={Users} accent="#2dd4bf" />
        <KpiCard label="Asistencia promedio" value={`${metrics.avgAttendance}%`} sub="Meta: ≥ 80%" icon={Percent} accent="#10b981" />
        <KpiCard label="Conversión a OP" value={`${metrics.tasaConversionAula}%`} sub={`${metrics.conOp} conectados`} icon={Target} accent="#f59e0b" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Test psico pendiente" value={metrics.testPending} icon={ClipboardCheck} accent={metrics.testPending > 0 ? '#f59e0b' : '#10b981'} />
        <KpiCard label="Valid. PC pendiente" value={metrics.validPcPending} icon={ClipboardCheck} accent={metrics.validPcPending > 0 ? '#f59e0b' : '#10b981'} />
        <KpiCard label="Eval. Día 0 pendiente" value={metrics.evalD0Pending} icon={AlertTriangle} accent={metrics.evalD0Pending > 0 ? '#ef4444' : '#10b981'} />
        <KpiCard label="CESE Día 1" value={metrics.dia1Cese} icon={ShieldAlert} accent={metrics.dia1Cese > 0 ? '#ef4444' : '#10b981'} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader title="Pipeline de capacitación (consolidado Excel)" />
          <PipelineBar steps={pipeline} />
          <p className="text-[10px] mt-4 text-[var(--text-muted)]">
            Flujo: ENVIO DNI → TEST PSICOLÓGICO → VALID. PC → EVAL. DÍA 0 → INICIO CAP → CONEXIÓN OP
          </p>
        </Card>

        <Card>
          <CardHeader title="Evolución de asistencia diaria" />
          <div className="h-56">
            {trendData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" opacity={0.3} />
                  <XAxis dataKey="Fecha" tick={{ fontSize: 9, fill: 'var(--text-muted)' }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: 'var(--text-muted)' }} />
                  <Tooltip contentStyle={chartTooltipStyle} />
                  <Area type="monotone" dataKey="Asistencia" stroke="var(--accent)" fill="var(--accent-soft)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-xs text-center pt-16 text-[var(--text-muted)]">Sin asistencias registradas aún</p>
            )}
          </div>
        </Card>
      </div>

      {criticalList.length > 0 && (
        <Card className="border-rose-500/20">
          <CardHeader title="Semáforo de deserción — Acción inmediata" actions={<ShieldAlert size={16} className="text-rose-400" />} />
          <div className="space-y-2">
            {criticalList.map(item => (
              <div key={item.doc} className="flex justify-between items-center p-3 rounded-xl bg-[var(--bg-elevated)]">
                <div>
                  <p className="text-xs font-bold text-[var(--text-primary)]">{item.nombre}</p>
                  <p className="text-[10px] text-[var(--text-muted)]">Cel: {item.celular || '—'}</p>
                </div>
                <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20">
                  {item.fi} FI consecutivas
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </PageLayout>
  )
}
