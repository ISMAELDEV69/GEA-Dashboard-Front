import { useState, useMemo, useCallback } from 'react'
import * as XLSX from 'xlsx'
import {
  GraduationCap, Save, Search, CheckCircle2, XCircle,
  AlertTriangle, Download, ChevronDown, Users, Star,
  BookOpen, Loader2, RefreshCw
} from 'lucide-react'
import { fetchEvaluaciones, upsertEvaluaciones } from '../lib/dataService'
import PageLayout from './ui/PageLayout'
import PageHeader from './ui/PageHeader'
import Card from './ui/Card'

// ─── Helpers ────────────────────────────────────────────────────────────────
const calcPromedio = (alf, ori, hab) => {
  const vals = [alf, ori, hab].filter(v => v !== '' && v !== null && v !== undefined && !isNaN(Number(v)))
  if (vals.length === 0) return null
  return (vals.reduce((a, b) => a + Number(b), 0) / vals.length).toFixed(1)
}

const calcResultado = (promedio) => {
  if (promedio === null) return 'NO DA EVALUAR'
  return Number(promedio) >= 7 ? 'APROBADO' : 'DESAPROBADO'
}

const RESULTADO_STYLES = {
  'APROBADO': 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25',
  'DESAPROBADO': 'bg-rose-500/10 text-rose-400 border-rose-500/25',
  'NO DA EVALUAR': 'bg-slate-700/50 text-slate-400 border-slate-600/25',
}

// ─── NoteInput ──────────────────────────────────────────────────────────────
function NoteInput({ value, onChange, disabled }) {
  const num = value === '' ? null : Number(value)
  const isValid = num === null || (num >= 0 && num <= 10)
  return (
    <input
      type="number"
      min="0"
      max="10"
      step="0.5"
      disabled={disabled}
      value={value}
      onChange={e => onChange(e.target.value)}
      className={`w-20 form-input text-center font-bold px-2 py-1.5 transition-colors focus:outline-none
        ${!isValid ? 'border-rose-500/60 text-rose-500 dark:text-rose-400' : 'focus:border-[var(--accent)]'}
        ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
      `}
      placeholder="0–10"
    />
  )
}

// ─── Main Component ──────────────────────────────────────────────────────────
export default function EvaluacionesForm({ grupos = [], postulantes = [], asistencias = [] }) {
  const [selectedGrupo, setSelectedGrupo]   = useState('')
  const [rows, setRows]                     = useState([]) // editable UI rows
  const [loading, setLoading]               = useState(false)
  const [saving, setSaving]                 = useState(false)
  const [savedOk, setSavedOk]               = useState(false)
  const [error, setError]                   = useState(null)
  const [search, setSearch]                 = useState('')

  // KPIs
  const kpis = useMemo(() => {
    const total = rows.length
    const aprobados = rows.filter(r => r.resultado === 'APROBADO').length
    const desaprobados = rows.filter(r => r.resultado === 'DESAPROBADO').length
    const sinEval = rows.filter(r => r.resultado === 'NO DA EVALUAR').length
    const tasa = total > 0 ? Math.round((aprobados / total) * 100) : 0
    return { total, aprobados, desaprobados, sinEval, tasa }
  }, [rows])

  const loadGrupo = useCallback(async (codigo) => {
    setSelectedGrupo(codigo)
    setError(null)
    setSavedOk(false)
    if (!codigo) { setRows([]); return }

    setLoading(true)
    try {
      const dbEvals = await fetchEvaluaciones(codigo)

      // Build a merged editable rows list
      const candidatos = postulantes.filter(p => {
        const docs = new Set(
          asistencias
            .filter(a => a.grupo_codigo === codigo && a.sigla_asistencia !== 'B')
            .map(a => a.postulante_documento)
        )
        return docs.has(p.documento)
      })

      const evalMap = {}
      for (const e of dbEvals) evalMap[e.postulante_documento] = e

      setRows(candidatos.map(p => {
        const existing = evalMap[p.documento]
        return {
          documento: p.documento,
          nombre: `${p.apellido_paterno} ${p.apellido_materno}, ${p.nombres}`,
          alfabetidad: existing?.alfabetidad ?? '',
          orientacion_cliente: existing?.orientacion_cliente ?? '',
          habilidades_contacto: existing?.habilidades_contacto ?? '',
          observaciones: existing?.observaciones ?? '',
          noEvaluar: existing?.resultado === 'NO DA EVALUAR' && !existing?.alfabetidad,
          // computed
          get promedio() {
            return calcPromedio(this.alfabetidad, this.orientacion_cliente, this.habilidades_contacto)
          },
          get resultado() {
            if (this.noEvaluar) return 'NO DA EVALUAR'
            return calcResultado(this.promedio)
          }
        }
      }))
    } catch (err) {
      setError(err.message || 'Error al cargar evaluaciones')
    } finally {
      setLoading(false)
    }
  }, [postulantes, asistencias])

  const updateRow = (documento, field, value) => {
    setRows(prev => prev.map(r => {
      if (r.documento !== documento) return r
      const updated = { ...r, [field]: value }
      // Recompute promedio / resultado reactively
      return {
        ...updated,
        get promedio() {
          return calcPromedio(this.alfabetidad, this.orientacion_cliente, this.habilidades_contacto)
        },
        get resultado() {
          if (this.noEvaluar) return 'NO DA EVALUAR'
          return calcResultado(this.promedio)
        }
      }
    }))
    setSavedOk(false)
  }

  const handleSave = async () => {
    if (!selectedGrupo) return
    setSaving(true)
    setError(null)
    try {
      const payload = rows.map(r => ({
        postulante_documento: r.documento,
        grupo_codigo: selectedGrupo,
        alfabetidad: r.noEvaluar ? null : (r.alfabetidad !== '' ? Number(r.alfabetidad) : null),
        orientacion_cliente: r.noEvaluar ? null : (r.orientacion_cliente !== '' ? Number(r.orientacion_cliente) : null),
        habilidades_contacto: r.noEvaluar ? null : (r.habilidades_contacto !== '' ? Number(r.habilidades_contacto) : null),
        resultado: r.resultado,
        observaciones: r.observaciones || null
      }))
      await upsertEvaluaciones(payload)
      setSavedOk(true)
      setTimeout(() => setSavedOk(false), 4000)
    } catch (err) {
      setError(err.message || 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  const exportToExcel = () => {
    const exportRows = rows.map(r => ({
      DNI: r.documento,
      Nombre: r.nombre,
      Alfabetidad: r.alfabetidad,
      'Orientación al Cliente': r.orientacion_cliente,
      'Habilidades de Contacto': r.habilidades_contacto,
      Promedio: r.promedio ?? '',
      Resultado: r.resultado,
      Observaciones: r.observaciones
    }))
    const ws = XLSX.utils.json_to_sheet(exportRows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Evaluaciones')
    const today = new Date().toISOString().split('T')[0]
    XLSX.writeFile(wb, `GEA_Evaluaciones_${selectedGrupo}_${today}.xlsx`)
  }

  const filteredRows = useMemo(() => {
    if (!search.trim()) return rows
    const q = search.toLowerCase()
    return rows.filter(r =>
      r.nombre.toLowerCase().includes(q) || r.documento.includes(q)
    )
  }, [rows, search])

  return (
    <PageLayout className="space-y-8 animate-fadeIn">
      {/* Header */}
      <PageHeader
        title="Evaluaciones de Capacitación"
        subtitle="Registra las notas de los postulantes por grupo. El sistema calcula el promedio y resultado automáticamente."
        icon={GraduationCap}
      />

      {/* Group Selector */}
      <Card className="p-6 space-y-4">
        <div className="flex items-start sm:items-center flex-col sm:flex-row gap-4">
          <div className="flex-1 w-full">
            <label className="block text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <GraduationCap size={12} className="text-[var(--accent)]" /> Seleccionar Grupo de Capacitación
            </label>
            <div className="relative">
              <select
                value={selectedGrupo}
                onChange={e => loadGrupo(e.target.value)}
                className="form-input w-full pl-4 pr-10 py-3 text-sm appearance-none"
              >
                <option value="">— Selecciona un grupo —</option>
                {grupos.map(g => (
                  <option key={g.codigo} value={g.codigo}>
                    {g.codigo} · {g.campana || ''} · {g.fecha_registro || g.fecha || ''}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none" />
            </div>
          </div>

          {selectedGrupo && rows.length > 0 && (
            <div className="flex gap-2 self-end sm:self-auto">
              <button
                onClick={() => loadGrupo(selectedGrupo)}
                title="Recargar"
                className="btn-secondary p-3 rounded-xl"
              >
                <RefreshCw size={14} />
              </button>
              <button
                onClick={exportToExcel}
                className="btn-secondary flex items-center gap-2 border-emerald-500/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10"
              >
                <Download size={14} /> Excel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="btn-primary flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold disabled:opacity-60"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                {saving ? 'Guardando…' : 'Guardar Notas'}
              </button>
            </div>
          )}
        </div>

        {/* Success / Error alerts */}
        {savedOk && (
          <div className="flex items-center gap-3 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-600 dark:text-emerald-400 text-sm animate-fadeIn">
            <CheckCircle2 size={16} className="flex-shrink-0" />
            <span className="font-semibold">Notas guardadas correctamente en la base de datos.</span>
          </div>
        )}
        {error && (
          <div className="flex items-center gap-3 p-3 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-500 dark:text-rose-400 text-sm">
            <AlertTriangle size={16} className="flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </Card>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center h-48">
          <Loader2 size={36} className="text-[var(--accent)] animate-spin" />
        </div>
      )}

      {/* KPIs */}
      {!loading && selectedGrupo && rows.length > 0 && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: 'Total en Grupo', value: kpis.total, color: 'text-[var(--accent)]', bar: 'bg-[var(--accent)]/30' },
              { label: 'Aprobados', value: kpis.aprobados, color: 'text-emerald-600 dark:text-emerald-400', bar: 'bg-emerald-500/30' },
              { label: 'Desaprobados', value: kpis.desaprobados, color: 'text-rose-500 dark:text-rose-400', bar: 'bg-rose-500/30' },
              { label: 'Tasa Aprobación', value: `${kpis.tasa}%`, color: 'text-amber-500 dark:text-amber-400', bar: 'bg-amber-500/30' },
            ].map((k, i) => (
              <Card key={i} className="p-5 relative overflow-hidden bg-[var(--bg-surface)]">
                <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">{k.label}</p>
                <h3 className={`text-3xl font-black mt-2 ${k.color}`}>{k.value}</h3>
                <div className={`absolute bottom-0 left-0 w-full h-[3px] ${k.bar}`} />
              </Card>
            ))}
          </div>

          {/* Search */}
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              type="text"
              placeholder="Buscar por nombre o DNI…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="form-input w-full pl-9 pr-4 py-2.5 text-sm"
            />
          </div>

          {/* Notes Table */}
          <Card noPadding className="overflow-hidden">
            {/* Legend */}
            <div className="px-6 py-3 border-b border-[var(--border-subtle)] flex items-center gap-6 flex-wrap bg-[var(--bg-muted)]">
              <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider flex items-center gap-1.5">
                <BookOpen size={10} className="text-[var(--accent)]" /> Notas de 0 a 10 · Aprobado ≥ 7.0
              </span>
              <div className="flex gap-4 ml-auto text-[10px] font-bold text-[var(--text-muted)]">
                <span className="flex items-center gap-1.5"><Star size={10} className="text-amber-500 dark:text-amber-400" /> Alf. = Alfabetidad Digital</span>
                <span>OC = Orientación al Cliente</span>
                <span>HC = Habilidades de Contacto</span>
              </div>
            </div>

            <div className="table-scroll overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border-subtle)] bg-[var(--table-head-bg)] text-[var(--text-muted)]">
                    {['#', 'Postulante', 'DNI', 'Alf.', 'OC', 'HC', 'Promedio', 'Resultado', 'Observaciones', 'No Evaluar'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)]">
                  {filteredRows.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="text-center py-12 text-[var(--text-muted)]">
                        <Users size={28} className="mx-auto mb-2 opacity-30" />
                        <p className="text-sm">No se encontraron candidatos para este grupo</p>
                      </td>
                    </tr>
                  ) : filteredRows.map((r, idx) => {
                    const prom = r.promedio
                    const res = r.resultado
                    return (
                      <tr key={r.documento} className="hover:bg-[var(--bg-muted)] transition-colors">
                        <td className="px-4 py-3 text-[var(--text-muted)] text-xs font-mono">{idx + 1}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <p className="text-[var(--text-primary)] font-semibold text-xs">{r.nombre}</p>
                        </td>
                        <td className="px-4 py-3 text-[var(--text-secondary)] font-mono text-xs">{r.documento}</td>
                        <td className="px-4 py-3">
                          <NoteInput
                            value={r.alfabetidad}
                            onChange={v => updateRow(r.documento, 'alfabetidad', v)}
                            disabled={r.noEvaluar}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <NoteInput
                            value={r.orientacion_cliente}
                            onChange={v => updateRow(r.documento, 'orientacion_cliente', v)}
                            disabled={r.noEvaluar}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <NoteInput
                            value={r.habilidades_contacto}
                            onChange={v => updateRow(r.documento, 'habilidades_contacto', v)}
                            disabled={r.noEvaluar}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-lg font-black ${
                            prom !== null
                              ? Number(prom) >= 7 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'
                              : 'text-[var(--text-muted)]'
                          }`}>
                            {r.noEvaluar ? '—' : (prom ?? '—')}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 text-[10px] font-extrabold px-2.5 py-1 rounded-full border uppercase tracking-wider ${RESULTADO_STYLES[res]}`}>
                            {res === 'APROBADO' && <CheckCircle2 size={10} />}
                            {res === 'DESAPROBADO' && <XCircle size={10} />}
                            {res}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="text"
                            value={r.observaciones}
                            onChange={e => updateRow(r.documento, 'observaciones', e.target.value)}
                            placeholder="Opcional…"
                            className="w-32 form-input px-2 py-1.5 text-xs"
                          />
                        </td>
                        <td className="px-4 py-3 text-center">
                          <input
                            type="checkbox"
                            checked={r.noEvaluar}
                            onChange={e => updateRow(r.documento, 'noEvaluar', e.target.checked)}
                            className="w-4 h-4 rounded accent-amber-500 cursor-pointer"
                            title="Marcar como 'No da evaluar'"
                          />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Save bar */}
            {rows.length > 0 && (
              <div className="px-6 py-4 border-t border-[var(--border-subtle)] bg-[var(--bg-surface)] flex items-center justify-between">
                <p className="text-xs text-[var(--text-muted)]">
                  {kpis.aprobados} aprobados · {kpis.desaprobados} desaprobados · {kpis.sinEval} sin evaluar
                </p>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="btn-primary flex items-center gap-2"
                >
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  {saving ? 'Guardando…' : 'Guardar todas las notas'}
                </button>
              </div>
            )}
          </Card>
        </>
      )}

      {/* Empty state */}
      {!loading && !selectedGrupo && (
        <Card className="p-16 text-center border-dashed">
          <GraduationCap size={48} className="mx-auto mb-4 text-[var(--text-muted)]" />
          <p className="text-[var(--text-primary)] font-semibold">Selecciona un grupo para ver y registrar evaluaciones</p>
          <p className="text-[var(--text-secondary)] text-sm mt-1">Los grupos provienen de los registros de asistencia creados por los formadores.</p>
        </Card>
      )}

      {!loading && selectedGrupo && rows.length === 0 && !error && (
        <Card className="p-12 text-center">
          <Users size={36} className="mx-auto mb-3 text-[var(--text-muted)]" />
          <p className="text-[var(--text-primary)]">No hay candidatos activos en este grupo.</p>
          <p className="text-[var(--text-secondary)] text-xs mt-1">Los candidatos deben tener al menos un registro de asistencia (sin Baja).</p>
        </Card>
      )}
    </PageLayout>
  )
}
