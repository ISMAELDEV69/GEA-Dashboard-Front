import { useState, useMemo } from 'react'
import * as z from 'zod'
import * as XLSX from 'xlsx'
import {
  Search, Edit3, X, ChevronLeft, ChevronRight,
  Users, MapPin, UserCheck, Calendar, Phone, Mail,
  CheckCircle2, AlertCircle, Save, Eye, SlidersHorizontal,
  Download
} from 'lucide-react'
import Card from './ui/Card'
import PageLayout from './ui/PageLayout'
import PageHeader from './ui/PageHeader'

const PAGE_SIZE = 50

const editSchema = z.object({
  apellido_paterno: z.string().min(2, { message: 'Requerido' }),
  apellido_materno: z.string().min(2, { message: 'Requerido' }),
  nombres: z.string().min(2, { message: 'Requerido' }),
  celular: z
    .string()
    .min(9, { message: 'Mínimo 9 dígitos' })
    .regex(/^\+?[0-9\s-]+$/, { message: 'Formato inválido' }),
  celular_referencia: z.string().optional(),
  correo: z.string().email({ message: 'Email inválido' }),
  genero: z.enum(['MASCULINO', 'FEMENINO']),
  fecha_nacimiento: z.string().refine((val) => {
    const birth = new Date(val)
    const today = new Date()
    let age = today.getFullYear() - birth.getFullYear()
    const monthDiff = today.getMonth() - birth.getMonth()
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--
    }
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

// ── Edit Modal ──────────────────────────────────────────────
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
          onChange={e => {
            setForm(f => ({ ...f, [key]: e.target.value }))
            setValidationErrors(prev => ({ ...prev, [key]: null }))
          }}
          className={`w-full bg-[var(--input-bg)] border ${
            validationErrors[key] ? 'border-rose-500/50 focus:border-rose-500' : 'border-[var(--input-border)] focus:border-[var(--accent)]'
          } rounded-xl px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none transition-colors`}
        >
          {opts.options.map(o => <option key={o.value ?? o} value={o.value ?? o}>{o.label ?? o}</option>)}
        </select>
      ) : (
        <input
          type={type}
          value={form[key] || ''}
          onChange={e => {
            setForm(f => ({ ...f, [key]: type === 'number' ? Number(e.target.value) : e.target.value }))
            setValidationErrors(prev => ({ ...prev, [key]: null }))
          }}
          className={`w-full bg-[var(--input-bg)] border ${
            validationErrors[key] ? 'border-rose-500/50 focus:border-rose-500' : 'border-[var(--input-border)] focus:border-[var(--accent)]'
          } rounded-xl px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none transition-colors`}
        />
      )}
    </div>
  )

  const handleSave = async () => {
    // Validate schema
    const result = editSchema.safeParse(form)
    if (!result.success) {
      const errs = {}
      result.error.errors.forEach(err => {
        errs[err.path[0]] = err.message
      })
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
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-[var(--border-subtle)]">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-[var(--accent)]/10 rounded-xl text-[var(--accent)]"><Edit3 size={18} /></div>
            <div>
              <h3 className="text-base font-bold text-[var(--text-primary)]">Editar Postulante</h3>
              <p className="text-xs text-[var(--text-secondary)]">DNI: {postulante.documento}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-muted)] transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {saved && (
            <div className="flex items-center space-x-2 p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl text-sm">
              <CheckCircle2 size={16} /><span>¡Guardado exitosamente!</span>
            </div>
          )}

          {/* Datos personales */}
          <div>
            <h4 className="text-xs font-bold text-[var(--accent)] uppercase tracking-wider mb-3">Datos Personales</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {field('apellido_paterno', 'Apellido Paterno')}
              {field('apellido_materno', 'Apellido Materno')}
              {field('nombres', 'Nombres')}
              {field('genero', 'Género', 'text', { options: ['MASCULINO', 'FEMENINO'] })}
              {field('fecha_nacimiento', 'Fecha de Nacimiento', 'date')}
              {field('estado_civil', 'Estado Civil', 'text', {
                options: ['SOLTERO', 'CASADO', 'DIVORCIADO', 'CONVIVIENTE', 'VIUDO']
              })}
              {field('n_hijos', 'N° de Hijos', 'number')}
              <div className="md:col-span-2">
                {field('nivel_academico', 'Nivel Académico')}
              </div>
            </div>
          </div>

          {/* Contacto */}
          <div>
            <h4 className="text-xs font-bold text-[var(--accent)] uppercase tracking-wider mb-3">Contacto</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {field('celular', 'Celular Principal')}
              {field('celular_referencia', 'Celular Referencia')}
              {field('correo', 'Correo Electrónico', 'email')}
            </div>
          </div>

          {/* Reclutamiento */}
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

        {/* Footer */}
        <div className="flex justify-end gap-3 p-6 border-t border-[var(--border-subtle)]">
          <button onClick={onClose} className="btn-secondary">
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving || saved}
            className="btn-primary flex items-center space-x-2"
          >
            <Save size={15} />
            <span>{saving ? 'Guardando…' : 'Guardar cambios'}</span>
          </button>
        </div>
      </Card>
    </div>
  )
}

// ── Detail Panel ─────────────────────────────────────────────
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
          <button onClick={onClose} className="p-2 rounded-xl text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-muted)] transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-4 flex-1 overflow-y-auto">
          {/* Info pills */}
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

          {/* Historial de asistencias */}
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

// ── Main Component ────────────────────────────────────────────
export default function PostulantesTable({ postulantes = [], asistencias = [], reclutadores = [], sedes = [], onEdit }) {
  const [search, setSearch]             = useState('')
  const [filterSede, setFilterSede]     = useState('TODAS')
  const [filterRec, setFilterRec]       = useState('TODOS')
  const [page, setPage]                 = useState(1)
  const [editTarget, setEditTarget]     = useState(null)
  const [detailTarget, setDetailTarget] = useState(null)
  const [showFilters, setShowFilters]   = useState(false)

  // Filtered + searched list
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    return postulantes.filter(p => {
      const matchSearch = !q || (
        p.documento?.toLowerCase().includes(q) ||
        p.nombres?.toLowerCase().includes(q) ||
        p.apellido_paterno?.toLowerCase().includes(q) ||
        p.apellido_materno?.toLowerCase().includes(q) ||
        p.celular?.toLowerCase().includes(q) ||
        p.correo?.toLowerCase().includes(q)
      )
      const matchSede = filterSede === 'TODAS' || p.sede === filterSede
      const matchRec  = filterRec  === 'TODOS' || p.reclutador === filterRec
      return matchSearch && matchSede && matchRec
    })
  }, [postulantes, search, filterSede, filterRec])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const resetPage = () => setPage(1)

  const exportToExcel = () => {
    const rows = filtered.map(p => ({
      DNI: p.documento,
      Tipo: p.tipo_documento || 'DNI',
      'Apellido Paterno': p.apellido_paterno,
      'Apellido Materno': p.apellido_materno,
      Nombres: p.nombres,
      Celular: p.celular,
      'Celular Referencia': p.celular_referencia || '',
      Correo: p.correo,
      Género: p.genero,
      'Fecha Nacimiento': p.fecha_nacimiento,
      'Estado Civil': p.estado_civil,
      'N° Hijos': p.n_hijos ?? 0,
      'Nivel Académico': p.nivel_academico,
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
    const today = new Date().toISOString().split('T')[0]
    XLSX.writeFile(wb, `GEA_Postulantes_${today}.xlsx`)
  }

  const siglaStats = useMemo(() => {
    const s = { total: postulantes.length, bajas: 0, activos: 0 }
    asistencias.forEach(a => { if (a.sigla_asistencia === 'B') s.bajas++ })
    s.activos = s.total - s.bajas
    return s
  }, [postulantes, asistencias])

  return (
    <PageLayout className="space-y-6 animate-fadeIn">
      {/* Header */}
      <PageHeader
        title="Postulantes"
        subtitle={`${filtered.length.toLocaleString()} registros · ${siglaStats.bajas} bajas`}
        icon={Users}
      >
        <div className="flex gap-3 items-center">
          {[
            { label: 'Total', value: siglaStats.total, color: 'text-indigo-500 dark:text-indigo-400' },
            { label: 'Activos', value: siglaStats.activos, color: 'text-emerald-600 dark:text-emerald-400' },
            { label: 'Bajas', value: siglaStats.bajas, color: 'text-rose-500 dark:text-rose-400' },
          ].map(s => (
            <div key={s.label} className="bg-[var(--glass-bg)] border border-[var(--border-subtle)] rounded-xl px-4 py-2 text-center min-w-[70px]">
              <p className={`text-xl font-black ${s.color}`}>{s.value.toLocaleString()}</p>
              <p className="text-[10px] text-[var(--text-muted)] font-semibold uppercase">{s.label}</p>
            </div>
          ))}
          <button
            onClick={exportToExcel}
            title={`Exportar ${filtered.length} registros a Excel`}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 transition-colors"
          >
            <Download size={15} />
            Excel
          </button>
        </div>
      </PageHeader>

      {/* Search + Filter bar */}
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

        {showFilters && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-[var(--border-subtle)]">
            <div>
              <label className="block text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-1.5">
                <MapPin size={10} className="inline mr-1" />Sede
              </label>
              <select
                value={filterSede}
                onChange={e => { setFilterSede(e.target.value); resetPage() }}
                className="form-input w-full px-3 py-2 text-sm"
              >
                <option value="TODAS">TODAS</option>
                {sedes.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-1.5">
                <UserCheck size={10} className="inline mr-1" />Reclutador
              </label>
              <select
                value={filterRec}
                onChange={e => { setFilterRec(e.target.value); resetPage() }}
                className="form-input w-full px-3 py-2 text-sm"
              >
                <option value="TODOS">TODOS</option>
                {reclutadores.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
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

      {/* Table */}
      <Card noPadding className="overflow-hidden">
        <div className="table-scroll overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border-subtle)] bg-[var(--table-head-bg)]">
                {['DNI', 'Nombre Completo', 'Celular', 'Sede', 'Reclutador', 'Periodo', 'Acciones'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {paginated.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-16 text-[var(--text-muted)]">
                    <Users size={32} className="mx-auto mb-3 opacity-30" />
                    <p className="text-sm">No se encontraron postulantes</p>
                    {search && <p className="text-xs mt-1">Prueba con otro término de búsqueda</p>}
                  </td>
                </tr>
              ) : paginated.map(p => (
                <tr key={p.documento} className="hover:bg-[var(--bg-muted)] transition-colors group">
                  <td className="px-4 py-3 font-mono text-xs text-[var(--text-secondary)] whitespace-nowrap">{p.documento}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="font-semibold text-[var(--text-primary)]">
                      {p.apellido_paterno} {p.apellido_materno}
                    </div>
                    <div className="text-xs text-[var(--text-secondary)]">{p.nombres}</div>
                  </td>
                  <td className="px-4 py-3 text-[var(--text-secondary)] text-xs whitespace-nowrap">{p.celular || '—'}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="text-xs font-semibold text-[var(--accent)] bg-[var(--accent)]/10 px-2.5 py-1 rounded-lg">
                      {p.sede || '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[var(--text-secondary)] text-xs max-w-[160px] truncate">
                    {p.reclutador ? p.reclutador.split(' ').slice(-2).join(' ') : '—'}
                  </td>
                  <td className="px-4 py-3 text-[var(--text-secondary)] text-xs font-mono whitespace-nowrap">
                    {p.periodo_reclutado || '—'}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => setDetailTarget(p)}
                        title="Ver detalle"
                        className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--accent)] hover:bg-[var(--accent)]/10 transition-colors"
                      >
                        <Eye size={14} />
                      </button>
                      <button
                        onClick={() => setEditTarget(p)}
                        title="Editar"
                        className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-amber-500 hover:bg-amber-500/10 transition-colors"
                      >
                        <Edit3 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
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
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-muted)] disabled:opacity-30 transition-colors"
              >
                <ChevronLeft size={16} />
              </button>
              {/* Page numbers */}
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const start = Math.max(1, Math.min(page - 2, totalPages - 4))
                const n = start + i
                return n <= totalPages ? (
                  <button
                    key={n}
                    onClick={() => setPage(n)}
                    className={`w-7 h-7 text-xs rounded-lg font-semibold transition-colors ${
                      n === page
                        ? 'bg-[var(--accent)] text-white'
                        : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-muted)]'
                    }`}
                  >
                    {n}
                  </button>
                ) : null
              })}
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-muted)] disabled:opacity-30 transition-colors"
              >
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
