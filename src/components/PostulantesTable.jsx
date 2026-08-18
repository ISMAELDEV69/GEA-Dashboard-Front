import React, { useState, useMemo, useEffect, useCallback } from 'react'
import * as z from 'zod'
import * as XLSX from 'xlsx'
import {
  FunnelChart, Funnel, LabelList, Tooltip as RechartsTooltip,
  AreaChart, Area, ResponsiveContainer
} from 'recharts'
import {
  Search, Edit3, X, ChevronLeft, ChevronRight,
  Users, MapPin, UserCheck, Calendar, Phone, Mail,
  CheckCircle2, AlertCircle, Save, Eye, SlidersHorizontal,
  Download, TrendingUp, TrendingDown, Minus, Target,
  UserX, UserPlus, ChevronUp, ChevronDown, ChevronsUpDown,
  BarChart3, Activity, RefreshCw
} from 'lucide-react'
import Card from './ui/Card'
import PageLayout from './ui/PageLayout'
import PageHeader from './ui/PageHeader'
import {
  filterPostulantesReclutador,
  filterBajasImputablesReclutador,
  computeMetasReclutador,
  atribuirBaja
} from '../lib/flujoOperativo'

const PAGE_SIZE = 50

const editSchema = z.object({
  apellido_paterno: z.string().min(2, { message: 'Requerido' }),
  apellido_materno: z.string().min(2, { message: 'Requerido' }),
  nombres: z.string().min(2, { message: 'Requerido' }),
  celular: z.string().min(9, { message: 'Mínimo 9 dígitos' }).regex(/^\+?[0-9\s-]+$/, { message: 'Formato inválido' }),
  celular_referencia: z.string().optional(),
  correo: z.string().email({ message: 'Email inválido' }),
  genero: z.enum(['MASCULINO', 'FEMENINO']),
  fecha_nacimiento: z.string().refine((val) => {
    const birth = new Date(val)
    const today = new Date()
    let age = today.getFullYear() - birth.getFullYear()
    const monthDiff = today.getMonth() - birth.getMonth()
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) age--
    return age >= 16 && age <= 70
  }, { message: 'Edad inválida (16-70)' }),
  estado_civil: z.enum(['SOLTERO', 'CASADO', 'DIVORCIADO', 'CONVIVIENTE', 'VIUDO']),
  n_hijos: z.number().min(0).default(0),
  nivel_academico: z.string().min(2, { message: 'Requerido' }),
  periodo_reclutado: z.string().regex(/^\d{6}$/, { message: 'Formato AAAAMM' }),
  semana_trabajo: z.number().min(1).max(53, { message: 'Semana inválida' }),
  reclutador: z.string().min(1, { message: 'Requerido' }),
  sede: z.string().min(1, { message: 'Requerido' }),
  campana: z.string().min(1, { message: 'Requerido' }).optional()
})

// ── Helpers ──────────────────────────────────────────────────
function getPostulanteStatus(postulante, asistencias) {
  const docAsistencias = asistencias.filter(a => a.postulante_documento === postulante.documento)
  if (docAsistencias.length === 0) return 'PENDIENTE'
  const latest = docAsistencias.sort((a, b) => new Date(b.fecha_asistencia) - new Date(a.fecha_asistencia))[0]
  if (latest.sigla_asistencia === 'B') {
    const atrib = atribuirBaja(latest.motivo_baja)
    return atrib === 'RECLUTADOR' ? 'BAJA_IMPUTABLE' : 'BAJA'
  }
  if (latest.sigla_asistencia === 'A') return 'ACTIVO'
  return 'EN_PROCESO'
}

const STATUS_CONFIG = {
  ACTIVO:        { label: 'Activo',         cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25' },
  EN_PROCESO:    { label: 'En proceso',     cls: 'bg-blue-500/15 text-blue-400 border-blue-500/25' },
  PENDIENTE:     { label: 'Sin asistencia', cls: 'bg-amber-500/15 text-amber-400 border-amber-500/25' },
  BAJA:          { label: 'Baja',           cls: 'bg-rose-500/15 text-rose-400 border-rose-500/25' },
  BAJA_IMPUTABLE:{ label: 'Baja (imputable)', cls: 'bg-red-600/20 text-red-400 border-red-600/30' },
}

// ── Sparkline mini ────────────────────────────────────────────
function Sparkline({ data, color = '#10b981' }) {
  return (
    <ResponsiveContainer width={72} height={28}>
      <AreaChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 2 }}>
        <defs>
          <linearGradient id={`sg-${color.replace('#','')}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.3} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area type="monotone" dataKey="v" stroke={color} strokeWidth={1.5}
          fill={`url(#sg-${color.replace('#','')})`} dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  )
}

// ── KPI Card Premium ──────────────────────────────────────────
function KpiCard({ icon: Icon, label, value, sub, delta, color, sparkData, accent = '#00f5ff' }) {
  const isPos = delta > 0
  const isNeg = delta < 0
  return (
    <div
      className="relative overflow-hidden rounded-xl border p-3.5 flex flex-col justify-between gap-2.5 transition-all duration-200 hover:border-[var(--border-normal)] group shadow-xs bg-[var(--bg-surface)] border-[var(--border-subtle)]"
    >
      <div className="flex items-start justify-between">
        <div className="p-2 rounded-lg border" style={{ background: `${accent}15`, borderColor: `${accent}30` }}>
          <Icon size={16} style={{ color: accent }} />
        </div>
        {sparkData && <Sparkline data={sparkData} color={accent} />}
      </div>
      <div>
        <p className="text-xl sm:text-2xl font-black font-mono tracking-tight" style={{ color: accent }}>
          {value}
        </p>
        <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mt-0.5">{label}</p>
      </div>
      {(sub || delta !== undefined) && (
        <div className="flex items-center gap-2 text-[10px] pt-2 border-t border-[var(--border-subtle)] font-medium">
          {delta !== undefined && (
            <span className={`flex items-center gap-0.5 font-bold ${isPos ? 'text-emerald-500' : isNeg ? 'text-rose-500' : 'text-[var(--text-muted)]'}`}>
              {isPos ? <TrendingUp size={11} /> : isNeg ? <TrendingDown size={11} /> : <Minus size={11} />}
              {isPos ? '+' : ''}{delta}%
            </span>
          )}
          {sub && <span className="text-[var(--text-muted)] truncate">{sub}</span>}
        </div>
      )}
      <div className="absolute bottom-0 left-0 w-full h-[2px] transition-opacity opacity-40 group-hover:opacity-100" style={{ background: accent }} />
    </div>
  )
}

// ── Funnel de Reclutamiento Premium (Modern Pipeline Visualizer) ──
function RecruitmentFunnel({ postulantes, asistencias }) {
  const data = useMemo(() => {
    const total = postulantes.length
    const conAsistencia = new Set(asistencias.map(a => a.postulante_documento))
    const enDia1 = postulantes.filter(p => conAsistencia.has(p.documento)).length
    const activos = asistencias.filter(a => a.sigla_asistencia === 'A' || a.sigla_asistencia === 'I-OP').length
    const docs = new Set(asistencias.filter(a => a.sigla_asistencia === 'I-OP' || a.sigla_asistencia === 'A').map(a => a.postulante_documento))
    const contratados = postulantes.filter(p => p.fecha_conexion_op || docs.has(p.documento)).length

    const pctCap = total > 0 ? Math.round((enDia1 / total) * 100) : 0
    const pctAct = enDia1 > 0 ? Math.round((activos / enDia1) * 100) : 0
    const pctCont = total > 0 ? Math.round((contratados / total) * 100) : 0

    return [
      { name: 'Registrados en Cartera', count: total, pct: 100, color: 'var(--neon-cyan, #00f5ff)' },
      { name: 'Derivados a Capacitación', count: enDia1, pct: pctCap, color: '#818cf8' },
      { name: 'Asistieron / En Formación', count: activos, pct: pctAct, color: 'var(--neon-green, #10b981)' },
      { name: 'Conectados a Operación (OP)', count: contratados, pct: pctCont, color: '#f59e0b' },
    ]
  }, [postulantes, asistencias])

  return (
    <div
      className="rounded-2xl border p-5 flex flex-col justify-between space-y-3.5 shadow-sm bg-[var(--bg-elevated)] border-[var(--border-subtle)]"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity size={15} className="text-cyan-500 dark:text-cyan-400" />
          <p className="text-[11px] font-black text-[var(--text-muted)] uppercase tracking-wider">Funnel de Conversión</p>
        </div>
        <span className="text-[10px] font-mono font-bold text-cyan-600 dark:text-cyan-400 bg-cyan-500/10 px-2.5 py-0.5 rounded-full border border-cyan-500/20">
          Cartera → Operación
        </span>
      </div>
      <div className="space-y-3">
        {data.map((step, idx) => (
          <div key={step.name} className="space-y-1">
            <div className="flex justify-between items-center text-xs">
              <span className="font-semibold text-[var(--text-primary)] flex items-center gap-1.5 text-[11px]">
                <span
                  className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-black"
                  style={{ background: `${step.color}25`, color: step.color }}
                >
                  {idx + 1}
                </span>
                {step.name}
              </span>
              <div className="flex items-center gap-2 font-mono">
                <span className="font-black text-sm" style={{ color: step.color }}>{step.count.toLocaleString()}</span>
                <span className="text-[10px] text-[var(--text-muted)] font-bold">({step.pct}%)</span>
              </div>
            </div>
            <div className="w-full h-1.5 rounded-full bg-[var(--bg-muted)] overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${Math.min(step.pct, 100)}%`,
                  background: `linear-gradient(90deg, ${step.color}88, ${step.color})`,
                  boxShadow: `0 0 8px ${step.color}66`
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Progress Ring ─────────────────────────────────────────────
function ProgressRing({ pct, size = 84, stroke = 7, color = '#00f5ff', label }) {
  const r = (size - stroke) / 2
  const circ = 2 * Math.PI * r
  const offset = circ - (Math.min(pct, 100) / 100) * circ
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--bg-muted)" strokeWidth={stroke} />
          <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
            strokeDasharray={circ} strokeDashoffset={offset}
            strokeLinecap="round" style={{ transition: 'stroke-dashoffset 0.8s ease' }} />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-base font-black text-[var(--text-primary)] font-mono">{Math.round(pct)}%</span>
        </div>
      </div>
      {label && <p className="text-[10px] font-bold text-[var(--text-muted)] text-center leading-tight">{label}</p>}
    </div>
  )
}

// ── Edit Modal ────────────────────────────────────────────────
function EditModal({ postulante, reclutadores, sedes, campanas, onSave, onClose }) {
  const [form, setForm] = useState({ ...postulante })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [validationErrors, setValidationErrors] = useState({})

  const field = (key, label, type = 'text', opts = {}) => (
    <div>
      <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5 flex justify-between items-center">
        <span>{label}</span>
        {validationErrors[key] && (
          <span className="text-[10px] text-rose-400 font-bold flex items-center">
            <AlertCircle size={10} className="mr-0.5" /> {validationErrors[key]}
          </span>
        )}
      </label>
      {opts.options ? (
        <select
          value={form[key] || ''}
          onChange={e => { setForm(f => ({ ...f, [key]: e.target.value })); setValidationErrors(prev => ({ ...prev, [key]: null })) }}
          className={`w-full bg-[var(--input-bg)] border ${validationErrors[key] ? 'border-rose-500/50' : 'border-[var(--input-border)]'} rounded-xl px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none transition-colors`}
        >
          {opts.options.map(o => <option key={o.value ?? o} value={o.value ?? o}>{o.label ?? o}</option>)}
        </select>
      ) : (
        <input
          type={type}
          value={form[key] || ''}
          onChange={e => { setForm(f => ({ ...f, [key]: type === 'number' ? Number(e.target.value) : e.target.value })); setValidationErrors(prev => ({ ...prev, [key]: null })) }}
          className={`w-full bg-[var(--input-bg)] border ${validationErrors[key] ? 'border-rose-500/50' : 'border-[var(--input-border)]'} rounded-xl px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none transition-colors`}
        />
      )}
    </div>
  )

  const handleSave = async () => {
    const result = editSchema.safeParse(form)
    if (!result.success) {
      const errs = {}
      result.error.errors.forEach(err => { errs[err.path[0]] = err.message })
      setValidationErrors(errs)
      return
    }
    setValidationErrors({})
    setSaving(true)
    try {
      await onSave(form)
      setSaved(true)
      setTimeout(onClose, 1000)
    } catch (err) {
      console.error(err)
      setValidationErrors({ general: err.message || 'Error al guardar los cambios' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
      <Card noPadding className="w-full max-w-3xl max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between p-6 border-b border-[var(--border-subtle)]">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-[var(--accent)]/10 rounded-xl text-[var(--accent)]"><Edit3 size={18} /></div>
            <div>
              <h3 className="text-base font-bold text-[var(--text-primary)]">Editar Postulante</h3>
              <p className="text-xs text-[var(--text-secondary)]">DNI: {postulante.documento}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl text-[var(--text-muted)] hover:bg-[var(--bg-muted)] transition-colors"><X size={18} /></button>
        </div>
        <div className="p-6 space-y-6">
          {saved && (
            <div className="flex items-center space-x-2 p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl text-sm">
              <CheckCircle2 size={16} /><span>¡Guardado exitosamente!</span>
            </div>
          )}
          {validationErrors.general && (
            <div className="flex items-center space-x-2 p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-xl text-sm">
              <AlertCircle size={16} /><span>{validationErrors.general}</span>
            </div>
          )}
          <div>
            <h4 className="text-xs font-bold text-[var(--accent)] uppercase tracking-wider mb-3">Datos Personales</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {field('apellido_paterno', 'Apellido Paterno')}
              {field('apellido_materno', 'Apellido Materno')}
              {field('nombres', 'Nombres')}
              {field('genero', 'Género', 'text', { options: ['MASCULINO', 'FEMENINO'] })}
              {field('fecha_nacimiento', 'Fecha de Nacimiento', 'date')}
              {field('estado_civil', 'Estado Civil', 'text', { options: ['SOLTERO', 'CASADO', 'DIVORCIADO', 'CONVIVIENTE', 'VIUDO'] })}
              {field('n_hijos', 'N° de Hijos', 'number')}
              <div className="md:col-span-2">{field('nivel_academico', 'Nivel Académico')}</div>
            </div>
          </div>
          <div>
            <h4 className="text-xs font-bold text-[var(--accent)] uppercase tracking-wider mb-3">Contacto</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {field('celular', 'Celular Principal')}
              {field('celular_referencia', 'Celular Referencia')}
              {field('correo', 'Correo Electrónico', 'email')}
            </div>
          </div>
          <div>
            <h4 className="text-xs font-bold text-[var(--accent)] uppercase tracking-wider mb-3">Reclutamiento</h4>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              {field('periodo_reclutado', 'Periodo (AAAAMM)')}
              {field('semana_trabajo', 'Semana Trabajo', 'number')}
              {field('reclutador', 'Reclutador', 'text', { options: reclutadores })}
              {field('sede', 'Sede', 'text', { options: sedes })}
              {field('campana', 'Campaña', 'text', { options: campanas })}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-3 p-6 border-t border-[var(--border-subtle)]">
          <button onClick={onClose} className="btn-secondary">Cancelar</button>
          <button onClick={handleSave} disabled={saving || saved} className="btn-primary flex items-center space-x-2">
            <Save size={15} /><span>{saving ? 'Guardando…' : 'Guardar cambios'}</span>
          </button>
        </div>
      </Card>
    </div>
  )
}

// ── Detail Panel ──────────────────────────────────────────────
function DetailPanel({ postulante, asistencias, onClose }) {
  const historial = useMemo(() =>
    asistencias
      .filter(a => a.postulante_documento === postulante.documento)
      .sort((a, b) => new Date(b.fecha_asistencia) - new Date(a.fecha_asistencia))
      .slice(0, 30)
  , [asistencias, postulante])

  const siglaColor = {
    'A':    'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    'I-OP': 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    'B':    'bg-rose-500/10 text-rose-400 border-rose-500/20',
    'FI':   'bg-amber-500/10 text-amber-400 border-amber-500/20',
    'FJ':   'bg-violet-500/10 text-violet-400 border-violet-500/20',
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end p-4 bg-black/40 backdrop-blur-sm animate-fadeIn">
      <Card noPadding className="w-full max-w-md h-full max-h-[95vh] overflow-y-auto shadow-2xl flex flex-col rounded-l-2xl rounded-r-none m-0 ml-auto right-0 absolute">
        <div className="flex items-center justify-between p-5 border-b border-[var(--border-subtle)]">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-sm font-black text-white">
              {(postulante.nombres?.[0] || '?')}
            </div>
            <div>
              <h3 className="text-sm font-bold text-[var(--text-primary)]">
                {postulante.apellido_paterno} {postulante.apellido_materno}, {postulante.nombres}
              </h3>
              <p className="text-xs text-[var(--text-secondary)]">DNI: {postulante.documento}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl text-[var(--text-muted)] hover:bg-[var(--bg-muted)] transition-colors"><X size={16} /></button>
        </div>
        <div className="p-5 space-y-4 flex-1 overflow-y-auto">
          <div className="grid grid-cols-2 gap-2">
            {[
              { icon: MapPin, label: postulante.sede || '—', color: 'text-indigo-400' },
              { icon: UserCheck, label: postulante.reclutador?.split(' ').slice(-2).join(' ') || '—', color: 'text-violet-400' },
              { icon: Phone, label: postulante.celular || '—', color: 'text-emerald-400' },
              { icon: Mail, label: postulante.correo || '—', color: 'text-amber-400' },
              { icon: Calendar, label: `Periodo: ${postulante.periodo_reclutado || '—'}`, color: 'text-blue-400' },
              { icon: Users, label: postulante.genero || '—', color: 'text-rose-400' },
            ].map(({ icon: Icon, label, color }) => (
              <div key={label} className="flex items-center space-x-2 bg-[var(--bg-muted)] rounded-xl p-2.5">
                <Icon size={12} className={color} />
                <span className="text-xs text-[var(--text-primary)] truncate">{label}</span>
              </div>
            ))}
          </div>
          <div>
            <h4 className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider mb-2">
              Historial de asistencias ({historial.length})
            </h4>
            {historial.length === 0 ? (
              <p className="text-xs text-[var(--text-muted)] text-center py-4">Sin registros de asistencia</p>
            ) : (
              <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                {historial.map(a => (
                  <div key={a.id} className="flex items-center justify-between bg-[var(--bg-muted)] rounded-xl px-3 py-2">
                    <div>
                      <p className="text-xs text-[var(--text-primary)]">{a.fecha_asistencia}</p>
                      <p className="text-[10px] text-[var(--text-secondary)]">{a.grupo_codigo}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${siglaColor[a.sigla_asistencia] || 'bg-[var(--bg-muted)] text-[var(--text-muted)] border-[var(--border-subtle)]'}`}>
                        {a.sigla_asistencia}
                      </span>
                      {a.motivo_baja && <span className="text-[9px] text-rose-400">{a.motivo_baja}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </Card>
    </div>
  )
}

// ── Sortable column header ────────────────────────────────────
function SortHeader({ label, field, sortField, sortDir, onSort }) {
  const active = sortField === field
  return (
    <th
      className="px-4 py-3 text-left text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider whitespace-nowrap cursor-pointer select-none hover:text-[var(--text-primary)] transition-colors"
      onClick={() => onSort(field)}
    >
      <span className="flex items-center gap-1">
        {label}
        {active ? (sortDir === 'asc' ? <ChevronUp size={11} /> : <ChevronDown size={11} />) : <ChevronsUpDown size={11} className="opacity-30" />}
      </span>
    </th>
  )
}

// ── Main Component ────────────────────────────────────────────
export default function PostulantesTable({
  postulantes = [],
  asistencias = [],
  reclutadores = [],
  sedes = [],
  campanasMetas = [],
  userProfile = null,
  currentRole = 'admin',
  onEdit
}) {
  const isReclutador = userProfile?.rol === 'reclutador' || currentRole === 'reclutador'

  const [search, setSearch]             = useState('')
  const [filterSede, setFilterSede]     = useState('TODAS')
  const [filterRec, setFilterRec]       = useState('TODOS')
  const [filterStatus, setFilterStatus] = useState('TODOS')
  const [page, setPage]                 = useState(1)
  const [editTarget, setEditTarget]     = useState(null)
  const [detailTarget, setDetailTarget] = useState(null)
  const [showFilters, setShowFilters]   = useState(false)
  const [showFunnel, setShowFunnel]     = useState(true)
  const [sortField, setSortField]       = useState('created_at')
  const [sortDir, setSortDir]           = useState('desc')

  const handleSort = useCallback((field) => {
    setSortField(prev => {
      if (prev === field) {
        setSortDir(d => d === 'asc' ? 'desc' : 'asc')
        return prev
      }
      setSortDir('asc')
      return field
    })
  }, [])

  const effectiveRecProfile = useMemo(() => {
    if (userProfile?.rol === 'reclutador') return userProfile
    if (filterRec && filterRec !== 'TODOS') {
      return { nombre: filterRec }
    }
    return userProfile
  }, [userProfile, filterRec])

  // Scope base postulantes: if logged in as recruiter, show own candidates; if admin, show all (or filtered)
  const basePostulantes = useMemo(() => {
    if (userProfile?.rol === 'reclutador') {
      return filterPostulantesReclutador(postulantes, userProfile, reclutadores)
    }
    if (currentRole === 'reclutador' && filterRec && filterRec !== 'TODOS') {
      return postulantes.filter(p => (p.reclutador || '').toUpperCase() === filterRec.toUpperCase())
    }
    return postulantes
  }, [postulantes, userProfile, currentRole, filterRec, reclutadores])

  // Augment postulantes with computed status
  const postulantesConStatus = useMemo(() => basePostulantes.map(p => ({
    ...p,
    _status: getPostulanteStatus(p, asistencias)
  })), [basePostulantes, asistencias])

  // Analytics for recruiter panel
  const metas = useMemo(() =>
    computeMetasReclutador(campanasMetas, effectiveRecProfile, reclutadores, basePostulantes)
  , [campanasMetas, effectiveRecProfile, reclutadores, basePostulantes])

  const bajasImputables = useMemo(() =>
    filterBajasImputablesReclutador(asistencias, basePostulantes, effectiveRecProfile, reclutadores)
  , [asistencias, basePostulantes, effectiveRecProfile, reclutadores])

  const kpiStats = useMemo(() => {
    const total = basePostulantes.length
    const activos = postulantesConStatus.filter(p => p._status === 'ACTIVO').length
    const enProceso = postulantesConStatus.filter(p => ['EN_PROCESO', 'PENDIENTE'].includes(p._status)).length
    const bajas = postulantesConStatus.filter(p => p._status === 'BAJA' || p._status === 'BAJA_IMPUTABLE').length
    const bajasImp = bajasImputables.length
    const tasaAprobacion = total > 0 ? Math.round((activos / total) * 100) : 0
    const tasaBajasImp = total > 0 ? Math.round((bajasImp / total) * 100) : 0
    const metaPct = metas.metaSemanal > 0 ? Math.round((metas.derivadosSemana / metas.metaSemanal) * 100) : 0
    return { total, activos, enProceso, bajas, bajasImp, tasaAprobacion, tasaBajasImp, metaPct }
  }, [basePostulantes, postulantesConStatus, bajasImputables, metas])

  // Generate spark data (weekly buckets from last 6 semanas)
  const sparkActivos = useMemo(() => {
    const buckets = {}
    postulantesConStatus.filter(p => p._status === 'ACTIVO').forEach(p => {
      const k = p.semana_trabajo || 0
      buckets[k] = (buckets[k] || 0) + 1
    })
    return Object.keys(buckets).sort().slice(-6).map(k => ({ v: buckets[k] }))
  }, [postulantesConStatus])

  // Filter + sort
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    return postulantesConStatus
      .filter(p => {
        const matchSearch = !q || (
          p.documento?.toLowerCase().includes(q) ||
          p.nombres?.toLowerCase().includes(q) ||
          p.apellido_paterno?.toLowerCase().includes(q) ||
          p.apellido_materno?.toLowerCase().includes(q) ||
          p.celular?.toLowerCase().includes(q) ||
          p.correo?.toLowerCase().includes(q)
        )
        const matchSede   = filterSede === 'TODAS' || p.sede === filterSede
        const matchRec    = filterRec === 'TODOS' || p.reclutador === filterRec
        const matchStatus = filterStatus === 'TODOS' || p._status === filterStatus
        return matchSearch && matchSede && matchRec && matchStatus
      })
      .sort((a, b) => {
        let va = a[sortField] ?? ''
        let vb = b[sortField] ?? ''
        if (typeof va === 'string') va = va.toLowerCase()
        if (typeof vb === 'string') vb = vb.toLowerCase()
        if (va < vb) return sortDir === 'asc' ? -1 : 1
        if (va > vb) return sortDir === 'asc' ? 1 : -1
        return 0
      })
  }, [postulantesConStatus, search, filterSede, filterRec, filterStatus, sortField, sortDir])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const resetPage  = () => setPage(1)

  const exportToExcel = () => {
    const rows = filtered.map(p => ({
      DNI: p.documento,
      'Apellido Paterno': p.apellido_paterno,
      'Apellido Materno': p.apellido_materno,
      Nombres: p.nombres,
      Celular: p.celular,
      Correo: p.correo,
      Género: p.genero,
      'Fecha Nacimiento': p.fecha_nacimiento,
      Estado: p._status,
      Sede: p.sede,
      Reclutador: p.reclutador,
      Campaña: p.campana,
      Periodo: p.periodo_reclutado,
      Semana: p.semana_trabajo,
      'Fecha Registro': p.created_at ? p.created_at.split('T')[0] : ''
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Postulantes')
    XLSX.writeFile(wb, `GEA_Postulantes_${new Date().toISOString().split('T')[0]}.xlsx`)
  }

  const campanas = useMemo(() => [...new Set(postulantes.map(p => p.campana).filter(Boolean))], [postulantes])

  return (
    <PageLayout className="space-y-5 animate-fadeIn">

      {/* ── Header ── */}
      <PageHeader
        title={isReclutador ? 'Mi Cartera de Postulantes' : 'Postulantes'}
        subtitle={`${filtered.length.toLocaleString()} registros · ${kpiStats.bajas} bajas`}
        icon={Users}
      >
        <div className="flex gap-2 items-center">
          <button
            onClick={exportToExcel}
            title={`Exportar ${filtered.length} registros a Excel`}
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-colors"
          >
            <Download size={14} />
            Excel
          </button>
        </div>
      </PageHeader>



      {/* ── Search + Filter bar ── */}
      <Card className="p-4 space-y-3">
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              type="text"
              placeholder="Buscar por DNI, nombre, celular o correo…"
              value={search}
              onChange={e => { setSearch(e.target.value); resetPage() }}
              className="form-input w-full pl-9 pr-4 py-2.5"
            />
          </div>
          {/* Status filter pills */}
          <div className="hidden md:flex gap-1">
            {['TODOS', 'ACTIVO', 'EN_PROCESO', 'BAJA', 'BAJA_IMPUTABLE'].map(s => (
              <button key={s}
                onClick={() => { setFilterStatus(s); resetPage() }}
                className={`px-3 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wide transition-colors border ${
                  filterStatus === s
                    ? 'bg-[var(--accent)]/15 text-[var(--accent)] border-[var(--accent)]/30'
                    : 'text-[var(--text-muted)] border-[var(--border-subtle)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-muted)]'
                }`}
              >
                {s === 'TODOS' ? 'Todos' : STATUS_CONFIG[s]?.label || s}
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowFilters(f => !f)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border transition-colors ${
              showFilters || filterSede !== 'TODAS' || filterRec !== 'TODOS'
                ? 'bg-[var(--accent)]/10 text-[var(--accent)] border-[var(--accent)]/30'
                : 'text-[var(--text-muted)] border-[var(--border-subtle)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-muted)]'
            }`}
          >
            <SlidersHorizontal size={15} />
            Filtros
            {(filterSede !== 'TODAS' || filterRec !== 'TODOS') && (
              <span className="w-2 h-2 rounded-full bg-[var(--accent)]" />
            )}
          </button>
        </div>

        {/* Mobile status pills */}
        <div className="flex md:hidden gap-1 flex-wrap">
          {['TODOS', 'ACTIVO', 'EN_PROCESO', 'BAJA', 'BAJA_IMPUTABLE'].map(s => (
            <button key={s}
              onClick={() => { setFilterStatus(s); resetPage() }}
              className={`px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wide transition-colors border ${
                filterStatus === s
                  ? 'bg-[var(--accent)]/15 text-[var(--accent)] border-[var(--accent)]/30'
                  : 'text-[var(--text-muted)] border-[var(--border-subtle)]'
              }`}
            >
              {s === 'TODOS' ? 'Todos' : STATUS_CONFIG[s]?.label || s}
            </button>
          ))}
        </div>

        {showFilters && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-[var(--border-subtle)]">
            <div>
              <label className="block text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-1.5">
                <MapPin size={10} className="inline mr-1" />Sede
              </label>
              <select value={filterSede} onChange={e => { setFilterSede(e.target.value); resetPage() }} className="form-input w-full px-3 py-2 text-sm">
                <option value="TODAS">TODAS</option>
                {sedes.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            {!isReclutador && (
              <div>
                <label className="block text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-1.5">
                  <UserCheck size={10} className="inline mr-1" />Reclutador
                </label>
                <select value={filterRec} onChange={e => { setFilterRec(e.target.value); resetPage() }} className="form-input w-full px-3 py-2 text-sm">
                  <option value="TODOS">TODOS</option>
                  {reclutadores.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
            )}
            {(filterSede !== 'TODAS' || filterRec !== 'TODOS') && (
              <button
                onClick={() => { setFilterSede('TODAS'); setFilterRec('TODOS'); resetPage() }}
                className="sm:col-span-2 text-xs text-[var(--text-muted)] hover:text-rose-500 transition-colors flex items-center gap-1"
              >
                <X size={11} /> Limpiar filtros
              </button>
            )}
          </div>
        )}
      </Card>

      {/* ── Table ── */}
      <Card noPadding className="overflow-hidden">
        <div className="table-scroll overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border-subtle)] bg-[var(--table-head-bg)]">
                <SortHeader label="DNI"     field="documento"       sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                <SortHeader label="Nombre"  field="apellido_paterno" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                <th className="px-4 py-3 text-left text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider whitespace-nowrap">Estado</th>
                <th className="px-4 py-3 text-left text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider whitespace-nowrap">Celular</th>
                <SortHeader label="Sede"    field="sede"            sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                {!isReclutador && <SortHeader label="Reclutador" field="reclutador" sortField={sortField} sortDir={sortDir} onSort={handleSort} />}
                <SortHeader label="Periodo" field="periodo_reclutado" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                <th className="px-4 py-3 text-left text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider whitespace-nowrap">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {paginated.length === 0 ? (
                <tr>
                  <td colSpan={isReclutador ? 7 : 8} className="text-center py-16 text-[var(--text-muted)]">
                    <Users size={32} className="mx-auto mb-3 opacity-30" />
                    <p className="text-sm">No se encontraron postulantes</p>
                    {search && <p className="text-xs mt-1">Prueba con otro término de búsqueda</p>}
                  </td>
                </tr>
              ) : paginated.map(p => {
                const sc = STATUS_CONFIG[p._status] || STATUS_CONFIG['PENDIENTE']
                return (
                  <tr key={p.documento} className="hover:bg-[var(--bg-muted)] transition-colors group">
                    <td className="px-4 py-3 font-mono text-xs text-[var(--text-secondary)] whitespace-nowrap">{p.documento}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="font-semibold text-[var(--text-primary)]">{p.apellido_paterno} {p.apellido_materno}</div>
                      <div className="text-xs text-[var(--text-secondary)]">{p.nombres}</div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${sc.cls}`}>
                        {sc.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[var(--text-secondary)] text-xs whitespace-nowrap font-mono">
                      {p.celular ? (
                        <a href={`tel:${p.celular}`} className="text-cyan-400 hover:underline flex items-center gap-1">
                          <Phone size={11} /> {p.celular}
                        </a>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="text-xs font-semibold text-[var(--accent)] bg-[var(--accent)]/10 px-2.5 py-1 rounded-lg border border-[var(--accent)]/20">{p.sede || '—'}</span>
                    </td>
                    {!isReclutador && (
                      <td className="px-4 py-3 text-[var(--text-secondary)] text-xs max-w-[160px] truncate">
                        {p.reclutador ? p.reclutador.split(' ').slice(-2).join(' ') : '—'}
                      </td>
                    )}
                    <td className="px-4 py-3 text-[var(--text-secondary)] text-xs font-mono whitespace-nowrap">{p.periodo_reclutado || '—'}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => setDetailTarget(p)} title="Ver detalle del postulante"
                          className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-cyan-400 hover:bg-cyan-500/10 border border-transparent hover:border-cyan-500/20 transition-colors">
                          <Eye size={14} />
                        </button>
                        <button onClick={() => setEditTarget(p)} title="Editar datos"
                          className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-amber-400 hover:bg-amber-500/10 border border-transparent hover:border-amber-500/20 transition-colors">
                          <Edit3 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--border-subtle)] bg-[var(--bg-surface)]">
            <p className="text-xs text-[var(--text-muted)]">
              Página {page} de {totalPages} · {filtered.length.toLocaleString()} registros
            </p>
            <div className="flex items-center gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-muted)] disabled:opacity-30 transition-colors">
                <ChevronLeft size={16} />
              </button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const start = Math.max(1, Math.min(page - 2, totalPages - 4))
                const n = start + i
                return n <= totalPages ? (
                  <button key={n} onClick={() => setPage(n)}
                    className={`w-7 h-7 text-xs rounded-lg font-semibold transition-colors ${
                      n === page ? 'bg-[var(--accent)] text-white' : 'text-[var(--text-muted)] hover:bg-[var(--bg-muted)]'
                    }`}>
                    {n}
                  </button>
                ) : null
              })}
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-muted)] disabled:opacity-30 transition-colors">
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </Card>

      {/* Modals */}
      {editTarget && (
        <EditModal
          postulante={editTarget}
          reclutadores={reclutadores}
          sedes={sedes}
          campanas={campanas}
          onSave={async (updated) => { await onEdit(updated); setEditTarget(null) }}
          onClose={() => setEditTarget(null)}
        />
      )}
      {detailTarget && (
        <DetailPanel
          postulante={detailTarget}
          asistencias={asistencias}
          onClose={() => setDetailTarget(null)}
        />
      )}
    </PageLayout>
  )
}
