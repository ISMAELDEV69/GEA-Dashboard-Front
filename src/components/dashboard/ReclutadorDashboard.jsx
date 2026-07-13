import { useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { PhoneCall, ThumbsUp, Target, Users, Percent, Award, AlertTriangle } from 'lucide-react'
import {
  buildReclutadorNarrative, buildMotiveData, getCurrentWeek, ATTENDANCE_PRESENT
} from '../../lib/dashboardAnalytics'
import {
  filterPostulantesReclutador, computeMetasReclutador, filterBajasImputablesReclutador,
} from '../../lib/flujoOperativo'
import { DashboardHeader, KpiCard, StorySection, EmptyDataHint, CHART_COLORS, chartTooltipStyle } from './StoryComponents'
import PageLayout from '../ui/PageLayout'
import PageHeader from '../ui/PageHeader'
import Card, { CardHeader } from '../ui/Card'

export default function ReclutadorDashboard({
  postulantes = [], asistencias = [], userProfile = null, campanasMetas = [], reclutadores = [],
}) {
  const myPostulantes = useMemo(() =>
    filterPostulantesReclutador(postulantes, userProfile, reclutadores),
    [postulantes, userProfile, reclutadores])

  const myDocs = useMemo(() => new Set(myPostulantes.map(p => p.documento)), [myPostulantes])
  const myAsist = useMemo(() => asistencias.filter(a => myDocs.has(a.postulante_documento)), [asistencias, myDocs])

  const metas = useMemo(() =>
    computeMetasReclutador(campanasMetas, userProfile, reclutadores, postulantes, getCurrentWeek()),
    [campanasMetas, userProfile, reclutadores, postulantes])

  const bajasImputables = useMemo(() =>
    filterBajasImputablesReclutador(asistencias, postulantes, userProfile, reclutadores),
    [asistencias, postulantes, userProfile, reclutadores])

  const stats = useMemo(() => {
    const total = myPostulantes.length
    const bajas = myAsist.filter(a => a.sigla_asistencia === 'B').length
    const bajasMiCulpa = bajasImputables.length
    const retentionRate = total > 0 ? Math.round(((total - bajasMiCulpa) / total) * 100) : 100
    const weeklyCount = metas.derivadosSemana
    const conExp = myPostulantes.filter(p => p.exp_call_center === true || String(p.exp_call_center).toUpperCase() === 'SI').length
    const enOp = myPostulantes.filter(p =>
      p.fecha_conexion_op || myAsist.some(a => a.postulante_documento === p.documento && a.sigla_asistencia === 'I-OP')
    ).length
    return { total, bajas, bajasMiCulpa, retentionRate, weeklyCount, conExp, enOp, currentWeek: getCurrentWeek() }
  }, [myPostulantes, myAsist, bajasImputables, metas])

  const stories = useMemo(() => buildReclutadorNarrative(stats, myPostulantes), [stats, myPostulantes])
  const myMotivos = useMemo(() => buildMotiveData(bajasImputables), [bajasImputables])

  const callList = useMemo(() => {
    const map = {}
    myAsist.forEach(a => {
      if (a.sigla_asistencia === 'FI') {
        if (!map[a.postulante_documento]) {
          const c = myPostulantes.find(p => p.documento === a.postulante_documento)
          map[a.postulante_documento] = { nombre: c ? `${c.apellido_paterno} ${c.nombres}` : a.postulante_documento, celular: c?.celular, count: 0 }
        }
        map[a.postulante_documento].count++
      }
    })
    return Object.values(map).filter(item =>
      !myAsist.some(a => a.postulante_documento === item.documento && a.sigla_asistencia === 'B')
    ).sort((a, b) => b.count - a.count).slice(0, 5)
  }, [myAsist, myPostulantes])

  if (stats.total === 0) {
    return (
      <PageLayout className="space-y-6">
        <PageHeader title="Mi Rendimiento — Reclutador" subtitle={`Reclutador: ${userProfile?.nombre || 'Activo'}`} badge="Reclutamiento" />
        <EmptyDataHint role="reclutador" />
      </PageLayout>
    )
  }

  const metaLabel = metas.metaSemanal ? `Meta RQ: ${metas.metaSemanal}` : 'Sin meta asignada (Metas y Equipos)'

  return (
    <PageLayout className="space-y-6">
      <PageHeader
        title="Mi Rendimiento — Reclutador"
        subtitle={`${userProfile?.nombre} · Deriva postulantes a grupo/campaña → el capacitador verifica y toma asistencia`}
        badge={stats.retentionRate >= 80 ? 'Reclutador de calidad' : 'En desarrollo'}
      />

      {stats.bajasMiCulpa > 0 && (
        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 flex items-start gap-3">
          <AlertTriangle size={18} className="text-amber-400 shrink-0 mt-0.5" />
          <div className="text-xs text-amber-200/90">
            <p className="font-bold text-amber-300">{stats.bajasMiCulpa} baja(s) imputables a tu selección</p>
            <p className="mt-1 text-amber-400/80">Motivos como sin PC, documentación o habilidades no verificadas en reclutamiento descuentan tu meta, no la del capacitador.</p>
          </div>
        </div>
      )}

      <StorySection title="Tu historia de reclutamiento" subtitle="Calidad de derivación a capacitación" stories={stories} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Mis postulantes" value={stats.total} icon={Users} />
        <KpiCard label="Retención (sin bajas tuyas)" value={`${stats.retentionRate}%`} sub="Excluye bajas imputables" icon={Percent} accent="#10b981" />
        <KpiCard label="Derivados semana" value={`${stats.weeklyCount}${metas.metaSemanal ? `/${metas.metaSemanal}` : ''}`} sub={metaLabel} icon={Target} accent="#f59e0b" />
        <KpiCard label="Conectados OP" value={stats.enOp} icon={Award} accent="#2dd4bf" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader title="Bajas imputables a mi selección" />
          <div className="h-48">
            {myMotivos.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={myMotivos}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" opacity={0.2} />
                  <XAxis dataKey="name" tick={{ fontSize: 8, fill: 'var(--text-muted)' }} />
                  <YAxis tick={{ fontSize: 9 }} />
                  <Tooltip contentStyle={chartTooltipStyle} />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {myMotivos.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex flex-col items-center justify-center h-full">
                <ThumbsUp size={24} className="text-emerald-400 mb-2" />
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Sin bajas por mala preselección</p>
              </div>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Seguimiento postulantes" actions={<PhoneCall size={16} className="text-[var(--text-muted)]" />} />
          <div className="space-y-2">
            {callList.length > 0 ? callList.map(item => (
              <div key={item.nombre} className="flex justify-between items-center p-3 rounded-xl bg-[var(--bg-elevated)]">
                <div>
                  <p className="text-xs font-bold text-[var(--text-primary)]">{item.nombre}</p>
                  <p className="text-[10px] text-[var(--text-muted)]">{item.celular || '—'}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400">{item.count} FI</span>
                  {item.celular && (
                    <a href={`tel:${item.celular}`} className="p-1.5 rounded-lg text-white" style={{ background: 'var(--accent)' }}>
                      <PhoneCall size={11} />
                    </a>
                  )}
                </div>
              </div>
            )) : (
              <p className="text-xs text-center py-8 text-[var(--text-muted)]">Sin alertas de inasistencia</p>
            )}
          </div>
        </Card>
      </div>
    </PageLayout>
  )
}
