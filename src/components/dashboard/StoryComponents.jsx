import {
  BookOpen, TrendingUp, AlertTriangle, CheckCircle, Info, Zap
} from 'lucide-react'

const ICONS = {
  info: Info,
  warning: AlertTriangle,
  error: AlertTriangle,
  success: CheckCircle,
}

const STYLES = {
  info:    { bg: 'rgba(99,102,241,0.08)',  border: 'rgba(99,102,241,0.25)',  text: '#a5b4fc' },
  warning: { bg: 'rgba(245,158,11,0.08)',  border: 'rgba(245,158,11,0.25)',  text: '#fcd34d' },
  error:   { bg: 'rgba(239,68,68,0.08)',   border: 'rgba(239,68,68,0.25)',   text: '#fca5a5' },
  success: { bg: 'rgba(16,185,129,0.08)',  border: 'rgba(16,185,129,0.25)',  text: '#6ee7b7' },
}

export function StorySection({ title, subtitle, stories = [] }) {
  if (!stories.length) return null
  return (
    <div className="glass rounded-3xl p-6 border space-y-4" style={{ borderColor: 'var(--border-subtle)' }}>
      <div>
        <h4 className="text-xs font-bold uppercase tracking-wider flex items-center gap-2" style={{ color: 'var(--accent)' }}>
          <BookOpen size={14} /> {title}
        </h4>
        {subtitle && <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>{subtitle}</p>}
      </div>
      <div className="space-y-3">
        {stories.map((s, i) => {
          const Icon = ICONS[s.type] || Info
          const st = STYLES[s.type] || STYLES.info
          return (
            <div
              key={i}
              className="rounded-2xl border p-4 flex gap-3"
              style={{ background: st.bg, borderColor: st.border }}
            >
              <Icon size={16} className="flex-shrink-0 mt-0.5" style={{ color: st.text }} />
              <div>
                <p className="text-xs font-bold mb-1" style={{ color: st.text }}>{s.title}</p>
                <p className="text-[11px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{s.body}</p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function KpiCard({ label, value, sub, icon: Icon, accent = 'var(--accent)' }) {
  return (
    <div className="glass rounded-2xl p-5 relative overflow-hidden hover:scale-[1.01] transition-all">
      <div className="flex justify-between items-start">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{label}</p>
          <h3 className="text-2xl font-black mt-1.5" style={{ color: accent }}>{value}</h3>
          {sub && <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>{sub}</p>}
        </div>
        {Icon && (
          <div className="p-2.5 rounded-xl" style={{ background: 'var(--accent-soft)', color: accent }}>
            <Icon size={16} />
          </div>
        )}
      </div>
      <div className="absolute bottom-0 left-0 w-full h-[2px]" style={{ background: accent, opacity: 0.4 }} />
    </div>
  )
}

export function DashboardHeader({ title, subtitle, badge }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div>
        <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight bg-clip-text text-transparent"
          style={{ backgroundImage: 'var(--accent-gradient)', WebkitBackgroundClip: 'text' }}>
          {title}
        </h2>
        <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>{subtitle}</p>
      </div>
      {badge && (
        <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wider border"
          style={{ background: 'var(--accent-soft)', borderColor: 'var(--accent-glow)', color: 'var(--accent)' }}>
          <TrendingUp size={12} /> {badge}
        </div>
      )}
    </div>
  )
}

export function EmptyDataHint({ role }) {
  const hints = {
    formador: 'Crea un grupo de capacitación y registra asistencias para ver KPIs de aula.',
    reclutador: 'Ve a Nómina y registra tu primer postulante del consolidado.',
    admin: 'Configura catálogos (sedes, campañas, reclutadores) y registra nóminas.',
    visor: 'Los dashboards ejecutivos se activan cuando hay datos en el consolidado.',
  }
  return (
    <div className="glass rounded-2xl p-8 text-center border border-dashed" style={{ borderColor: 'var(--border-subtle)' }}>
      <Zap size={28} className="mx-auto mb-3" style={{ color: 'var(--accent)', opacity: 0.5 }} />
      <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Base vacía — lista para roleplay</p>
      <p className="text-xs mt-2 max-w-md mx-auto" style={{ color: 'var(--text-muted)' }}>{hints[role] || hints.admin}</p>
    </div>
  )
}

export function PipelineBar({ steps = [] }) {
  if (!steps.length) return null
  return (
    <div className="space-y-3">
      {steps.map((s, i) => (
        <div key={i}>
          <div className="flex justify-between text-[10px] font-bold mb-1">
            <span style={{ color: 'var(--text-secondary)' }}>{s.paso || s.etapa}</span>
            <span style={{ color: 'var(--accent)' }}>{s.ok ?? s.cantidad} / {s.total ?? '—'} ({s.pct}%)</span>
          </div>
          <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg-elevated)' }}>
            <div className="h-full rounded-full transition-all duration-700"
              style={{ width: `${s.pct}%`, background: 'var(--accent)' }} />
          </div>
        </div>
      ))}
    </div>
  )
}

export const CHART_COLORS = ['#6366f1', '#2dd4bf', '#f59e0b', '#ef4444', '#ec4899', '#818cf8', '#10b981']

export const chartTooltipStyle = {
  background: 'var(--bg-surface)',
  border: '1px solid var(--border-subtle)',
  borderRadius: '12px',
  fontSize: '11px',
}
