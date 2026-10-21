import React, { useState, useEffect, useMemo, useCallback, useRef, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import {
  BanknoteIcon, Settings2, Calculator, Download, RefreshCw,
  CheckCircle2, AlertCircle, ChevronDown, ChevronUp, Star,
  TrendingUp, Users, DollarSign, Plus, Pencil, Trash2, Save, X,
  Filter, Search, RotateCcw, Lock, History, Eye, Loader2,
  FileSpreadsheet, Layers, Clock, ShieldCheck
} from 'lucide-react'
import ConciliacionVariablesOperacion from '../components/dashboard/ConciliacionVariablesOperacion'
import {
  fetchConfigPagosGrupo,
  upsertConfigPagoGrupo,
  deleteConfigPagoGrupo,
  fetchNominasPagosCapacitacion,
  fetchAsistenciasPagos,
  fetchGruposPagosDisponibles,
  fetchCapacidadRysOperativo,
  saveLiquidacionPagos,
  fetchLiquidacionesLotes,
  fetchLiquidacionDetalle,
  fetchLiquidacionesHistoricas,
} from '../lib/dataService'
import {
  calcularPagosCapacitacion,
  generarResumenPagos,
  exportarCSVPagos,
  normalizarSemanaPago,
  claveGrupoPago,
  claveDesdeCapacidad,
  claveDesdeConfig,
  generarMatrizCronogramaPagos,
  generarResumenMatrizPagos,
  exportarCSVMatrizPagos,
  sumarMesesPeriodo,
} from '../lib/pagosCapacitacionEngine'

const normMesPagoKey = (raw) => {
  const digits = String(raw || '').replace(/\D/g, '')
  return digits.length >= 6 ? digits.slice(0, 6) : ''
}

/** Meses de cronograma cubiertos por una propuesta (capa + bonos M1–M4) */
function mesesCronogramaDeConfig(c) {
  const set = new Set()
  const add = (raw) => {
    const m = normMesPagoKey(raw)
    if (m) set.add(m)
  }
  add(c?.mesAfectacionCapa)
  const baseBonos = normMesPagoKey(c?.mesAfectacionBonos || c?.mesAfectacionCapa)
  if (baseBonos) {
    for (let i = 0; i < 4; i++) add(sumarMesesPeriodo(baseBonos, i))
  }
  return set
}
import { formatFechaDDMMYYYY } from '../lib/propuestaParser'

// ────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────
const soles = v => `S/. ${Number(v || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const SELECT_GEA =
  'w-full bg-[var(--bg-base)] border border-[var(--border-normal)] rounded-lg px-3 py-2 text-xs text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)] font-medium'
const LABEL_GEA = 'text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider'

/** Nunca mostrar dumps JSON/arrays en el banner de error del analista */
function formatPagosUiError(err, fallback = 'Ocurrió un error. Intenta de nuevo.') {
  if (err == null) return fallback
  if (Array.isArray(err) || (typeof err === 'object' && !err.message && !err.error && !err.details)) {
    return fallback
  }
  const raw = typeof err === 'string'
    ? err
    : (err.message || err.error_description || err.details || err.hint || err.error || '')
  const text = String(raw || '').trim()
  if (!text) return fallback
  // Evitar pegar respuestas/tablas enteras en pantalla
  if (text.startsWith('[') || text.startsWith('{') || text.length > 400) {
    const short = text.length > 180 ? `${text.slice(0, 180)}…` : text
    if (short.startsWith('[') || short.startsWith('{')) return fallback
    return short
  }
  return text
}

/** Multiselect compacto (vacío = todos). Menú en portal para no quedar cortado por overflow. */
function FilterMultiSelect({
  options = [],
  values = [],
  onChange,
  disabled = false,
  loading = false,
  allLabel = 'TODOS',
  pluralLabel = 'seleccionados',
  emptyHint = 'Sin opciones',
  mono = false,
}) {
  const btnRef = useRef(null)
  const menuRef = useRef(null)
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0, width: 200 })
  const selected = Array.isArray(values) ? values : []
  const all = selected.length === 0

  const updatePos = useCallback(() => {
    const r = btnRef.current?.getBoundingClientRect()
    if (!r) return
    const width = Math.max(r.width, 180)
    let left = r.left
    if (left + width > window.innerWidth - 8) left = Math.max(8, window.innerWidth - width - 8)
    const spaceBelow = window.innerHeight - r.bottom
    const menuH = Math.min(224, 40 + options.length * 28)
    const top = spaceBelow < menuH && r.top > menuH ? r.top - menuH - 4 : r.bottom + 4
    setPos({ top, left, width })
  }, [options.length])

  useLayoutEffect(() => {
    if (!open) return
    updatePos()
  }, [open, updatePos])

  useEffect(() => {
    if (!open) return
    const onDoc = (e) => {
      if (btnRef.current?.contains(e.target) || menuRef.current?.contains(e.target)) return
      setOpen(false)
    }
    const onScroll = () => updatePos()
    document.addEventListener('mousedown', onDoc)
    window.addEventListener('resize', onScroll)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      window.removeEventListener('resize', onScroll)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [open, updatePos])

  const toggle = (opt) => {
    if (selected.includes(opt)) onChange(selected.filter((v) => v !== opt))
    else onChange([...selected, opt])
  }

  const summary = loading
    ? 'Cargando…'
    : all
      ? allLabel
      : selected.length === 1
        ? selected[0]
        : `${selected.length} ${pluralLabel}`

  const menu = open && typeof document !== 'undefined'
    ? createPortal(
      <div
        ref={menuRef}
        style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width, zIndex: 9999 }}
        className="max-h-56 overflow-auto rounded-lg border border-[var(--border-normal)] bg-[var(--bg-surface)] shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={() => { onChange([]); setOpen(false) }}
          className={`w-full text-left px-3 py-2 text-[11px] font-bold border-b border-[var(--border-subtle)] cursor-pointer ${
            all ? 'text-[var(--accent)]' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
          }`}
        >
          {allLabel}
        </button>
        {options.map((opt) => (
          <label
            key={opt}
            className={`flex items-center gap-2 px-3 py-1.5 text-xs text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] cursor-pointer ${mono ? 'font-mono' : ''}`}
          >
            <input
              type="checkbox"
              checked={selected.includes(opt)}
              onChange={() => toggle(opt)}
              className="accent-[var(--accent)]"
            />
            <span>{opt}</span>
          </label>
        ))}
        {!loading && options.length === 0 && (
          <p className="px-3 py-2 text-[11px] text-[var(--text-muted)]">{emptyHint}</p>
        )}
        {loading && (
          <p className="px-3 py-2 text-[11px] text-[var(--text-muted)] flex items-center gap-1">
            <Loader2 size={12} className="animate-spin" /> Cargando opciones…
          </p>
        )}
      </div>,
      document.body,
    )
    : null

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        disabled={disabled || loading}
        onClick={() => setOpen((v) => !v)}
        className={`w-full ${SELECT_GEA} text-left flex items-center gap-1.5 ${
          mono ? 'font-mono' : ''
        } ${disabled || loading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'} ${all ? '' : 'border-[var(--accent)]/50'}`}
      >
        <span className="truncate flex-1">{summary}</span>
        {!all && !loading && (
          <span className="shrink-0 text-[9px] font-black px-1.5 py-0.5 rounded-md bg-[var(--accent)]/15 text-[var(--accent)]">
            {selected.length}
          </span>
        )}
        <ChevronDown size={14} className={`shrink-0 text-[var(--text-muted)] transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {menu}
    </div>
  )
}

/** Segmento exacto de capacidad_rys (sin inferir). */
function segmentoDeCapacidad(row = {}) {
  return String(row?.segmento || '').trim().toUpperCase()
}

function mapCapacidadToGrupoFiltro(row) {
  const campana = row?.campana ? String(row.campana).trim().toUpperCase() : ''
  const codigo = row?.grupo_codigo || row?.codigo || row?.grupo_capacitacion || ''
  const segmento = segmentoDeCapacidad(row)
  const semNum = row?.semana_trabajo ?? (parseInt(String(row?.semana_label || '').replace(/\D/g, ''), 10) || null)
  return {
    grupo_codigo: codigo ? String(codigo).trim().toUpperCase() : '',
    campana,
    segmento,
    semana_label: row?.semana_label,
    semana_trabajo: semNum,
    periodo_reclutado: row?.periodo_reclutado || row?.periodo || '',
    periodo: row?.periodo || row?.periodo_reclutado || '',
  }
}

function semanaDeCapacidad(g) {
  return normalizarSemanaPago(g?.semana_label || (g?.semana_trabajo != null && g?.semana_trabajo !== '' ? `SEM ${g.semana_trabajo}` : '') || g?.semana)
}

// ────────────────────────────────────────────────────────────────────────
// Sub-componente: Tarjeta de resumen KPI
// ────────────────────────────────────────────────────────────────────────
function KpiCard({ icon: Icon, label, value, sub, color = 'blue', highlight = false }) {
  const colors = {
    blue: 'border-blue-500/30 text-blue-400 bg-blue-500/10',
    green: 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10',
    emerald: 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10',
    cyan: 'border-cyan-500/30 text-cyan-400 bg-cyan-500/10',
    amber: 'border-amber-500/30 text-amber-400 bg-amber-500/10',
    violet: 'border-violet-500/30 text-violet-400 bg-violet-500/10',
    rose: 'border-rose-500/30 text-rose-400 bg-rose-500/10',
  }
  const cls = colors[color] || colors.blue
  return (
    <div className={`rounded-xl border ${cls} p-4 flex flex-col gap-1 ${highlight ? 'ring-1 ring-[var(--accent)]/40' : ''}`}>
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide opacity-80">
        <Icon size={14} />
        {label}
      </div>
      <div className="text-2xl font-bold text-[var(--text-primary)] mt-1">{value}</div>
      {sub && <div className="text-xs text-[var(--text-muted)]">{sub}</div>}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────
// Sub-componente: Formulario de configuración de grupo (26 Campos Completos)
// ────────────────────────────────────────────────────────────────────────
function ConfigGrupoForm({ gruposCapacidad = [], configsExistentes = [], onSaved, userProfile, editingPropuesta, onCancelEdit }) {
  const defaultForm = {
    id: null,
    periodoCapa: '',
    semana: '',
    segmento: '',
    campana: '',
    grupo: '',
    modalidad: 'REMOTO',
    condicionLaboral: 'FULL TIME',
    cod: '',
    fechaInicioCapa: '',
    ingresoOperacion: '',
    mesAfectacionCapa: '',
    mesAfectacionBonos: '',
    pagoPorDia: 30,
    diasCapa: 9,
    cantDiasFeriados: 0,
    pagoCompleto: 270,
    bonoBienvenidaM1: 100,
    bonoBienvenidaM2: 0,
    bonoBienvenidaM3: 0,
    bonoPermanenciaM1: 100,
    bonoPermanenciaM2: 100,
    bonoPermanenciaM3: 0,
    bonoPermanenciaM4: 0,
    bonoAsistenciaM1: 0,
    bonoAsistenciaM2: 0,
    bonoAsistenciaM3: 0,
    notas: ''
  }

  const [form, setForm] = useState(defaultForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [successMsg, setSuccessMsg] = useState(null)
  const [manualInput, setManualInput] = useState(false)

  // Cargar si viene propuesta a editar desde la tabla
  useEffect(() => {
    if (editingPropuesta) {
      setForm({
        ...defaultForm,
        ...editingPropuesta,
        grupo: editingPropuesta.grupo || editingPropuesta.grupo_codigo || '',
        periodoCapa: editingPropuesta.periodoCapa || editingPropuesta.periodo || '',
        semana: editingPropuesta.semana || editingPropuesta.semana_trabajo || '',
        pagoPorDia: editingPropuesta.pagoPorDia ?? editingPropuesta.monto_dia_capa ?? 0,
        pagoCompleto: editingPropuesta.pagoCompleto ?? 0,
        bonoBienvenidaM1: editingPropuesta.bonoBienvenidaM1 ?? editingPropuesta.bono_bienvenida ?? 0,
        bonoPermanenciaM1: editingPropuesta.bonoPermanenciaM1 ?? editingPropuesta.bono_permanencia_total ?? 0,
        bonoAsistenciaM1: editingPropuesta.bonoAsistenciaM1 ?? editingPropuesta.bono_asistencia_perfecta ?? 0,
      })
    }
  }, [editingPropuesta])

  // 1. Periodos únicos desde capacidad_rys (orden descendente)
  const periodosCapaDisponibles = useMemo(() => {
    const set = new Set()
    gruposCapacidad.forEach(g => {
      const p = g.periodo
      if (p) set.add(String(p).trim().toUpperCase())
    })
    if (form.periodoCapa) set.add(String(form.periodoCapa).trim().toUpperCase())
    return Array.from(set).sort((a, b) => b.localeCompare(a))
  }, [gruposCapacidad, form.periodoCapa])

  // 2. Semanas filtradas por el Periodo seleccionado
  const semanasCapaDisponibles = useMemo(() => {
    if (!form.periodoCapa) return []
    const pSel = String(form.periodoCapa).trim().toUpperCase()
    const set = new Set()
    gruposCapacidad.forEach(g => {
      if (String(g.periodo || '').trim().toUpperCase() !== pSel) return
      const s = semanaDeCapacidad(g)
      if (s) set.add(s)
    })
    if (form.semana) set.add(normalizarSemanaPago(form.semana))
    return Array.from(set).sort((a, b) => {
      const na = parseInt(a.replace(/\D/g, '')) || 0
      const nb = parseInt(b.replace(/\D/g, '')) || 0
      return na - nb
    })
  }, [gruposCapacidad, form.periodoCapa, form.semana])

  // 3. Segmentos filtrados por Periodo + Semana (exacto de capacidad_rys)
  const segmentosCapaDisponibles = useMemo(() => {
    if (!form.periodoCapa || !form.semana) return []
    const pSel = String(form.periodoCapa).trim().toUpperCase()
    const sSel = normalizarSemanaPago(form.semana)
    const set = new Set()
    gruposCapacidad.forEach(g => {
      if (String(g.periodo || '').trim().toUpperCase() !== pSel) return
      if (semanaDeCapacidad(g) !== sSel) return
      const seg = segmentoDeCapacidad(g)
      if (seg) set.add(seg)
    })
    if (form.segmento) set.add(String(form.segmento).trim().toUpperCase())
    return Array.from(set).sort()
  }, [gruposCapacidad, form.periodoCapa, form.semana, form.segmento])

  // 4. Campañas filtradas por Periodo + Semana + Segmento
  const campanasCapaDisponibles = useMemo(() => {
    if (!form.periodoCapa || !form.semana || !form.segmento) return []
    const pSel = String(form.periodoCapa).trim().toUpperCase()
    const sSel = normalizarSemanaPago(form.semana)
    const segSel = String(form.segmento).trim().toUpperCase()
    const set = new Set()
    gruposCapacidad.forEach(g => {
      if (String(g.periodo || '').trim().toUpperCase() !== pSel) return
      if (semanaDeCapacidad(g) !== sSel) return
      if (segmentoDeCapacidad(g) !== segSel) return
      if (g.campana) set.add(String(g.campana).trim().toUpperCase())
    })
    if (form.campana) set.add(String(form.campana).trim().toUpperCase())
    return Array.from(set).sort()
  }, [gruposCapacidad, form.periodoCapa, form.semana, form.segmento, form.campana])

  // 5. Grupos filtrados por Periodo + Semana + Segmento + Campaña
  const gruposCapaDisponibles = useMemo(() => {
    if (!form.periodoCapa || !form.semana || !form.segmento || !form.campana) return []
    const pSel = String(form.periodoCapa).trim().toUpperCase()
    const sSel = normalizarSemanaPago(form.semana)
    const segSel = String(form.segmento).trim().toUpperCase()
    const cSel = String(form.campana).trim().toUpperCase()
    const set = new Set()
    gruposCapacidad.forEach(g => {
      if (String(g.periodo || '').trim().toUpperCase() !== pSel) return
      if (semanaDeCapacidad(g) !== sSel) return
      if (segmentoDeCapacidad(g) !== segSel) return
      if (String(g.campana || '').trim().toUpperCase() !== cSel) return
      if (g.codigo) set.add(String(g.codigo).trim().toUpperCase())
    })
    if (form.grupo) set.add(String(form.grupo).trim().toUpperCase())
    return Array.from(set).sort()
  }, [gruposCapacidad, form.periodoCapa, form.semana, form.segmento, form.campana, form.grupo])

  // Handlers de selección jerárquica
  const handlePeriodoSelect = (e) => {
    const val = e.target.value
    setForm(prev => ({
      ...prev,
      periodoCapa: val,
      semana: '',
      segmento: '',
      campana: '',
      grupo: '',
      cod: '',
      mesAfectacionCapa: val || prev.mesAfectacionCapa,
    }))
  }

  const handleSemanaSelect = (e) => {
    const val = e.target.value
    setForm(prev => ({
      ...prev,
      semana: val,
      segmento: '',
      campana: '',
      grupo: '',
      cod: '',
    }))
  }

  const handleSegmentoSelect = (e) => {
    const val = e.target.value
    setForm(prev => ({
      ...prev,
      segmento: val,
      campana: '',
      grupo: '',
      cod: '',
    }))
  }

  const handleCampanaSelect = (e) => {
    const val = e.target.value
    setForm(prev => ({
      ...prev,
      campana: val,
      grupo: '',
      cod: '',
    }))
  }

  const handleGrupoSelect = (e) => {
    const grpCode = e.target.value
    if (!grpCode) {
      setForm(prev => ({ ...prev, grupo: '', cod: '' }))
      return
    }

    const claveSel = claveGrupoPago({
      periodo: form.periodoCapa,
      semana: form.semana,
      segmento: form.segmento,
      campana: form.campana,
      codigo: grpCode,
    })

    const configExist = configsExistentes.find(c => claveDesdeConfig(c) === claveSel)

    if (configExist) {
      setForm({
        ...defaultForm,
        ...configExist,
        grupo: configExist.grupo || configExist.grupo_codigo || grpCode,
        periodoCapa: configExist.periodoCapa || configExist.periodo || form.periodoCapa,
        semana: normalizarSemanaPago(configExist.semana || configExist.semana_trabajo || form.semana),
        segmento: configExist.segmento || form.segmento,
        campana: configExist.campana || form.campana,
      })
      setSuccessMsg(`ℹ Propuesta existente cargada para ${grpCode}.`)
      setTimeout(() => setSuccessMsg(null), 3500)
      return
    }

    const capInfo = gruposCapacidad.find(g => claveDesdeCapacidad(g) === claveSel)
    const camp = capInfo?.campana || form.campana || ''
    const codSugerido = `${camp}${grpCode}`.replace(/\s+/g, '')

    setForm(prev => ({
      ...prev,
      id: null,
      grupo: grpCode,
      campana: camp,
      segmento: capInfo?.segmento || prev.segmento || '',
      modalidad: (capInfo?.modalidad || 'REMOTO').toUpperCase(),
      condicionLaboral: (capInfo?.condicion || 'FULL TIME').toUpperCase(),
      cod: codSugerido,
      fechaInicioCapa: formatFechaDDMMYYYY(capInfo?.fecha_registro || capInfo?.fecha_dia_1 || prev.fechaInicioCapa || ''),
      ingresoOperacion: formatFechaDDMMYYYY(capInfo?.fecha_ingreso_op || prev.ingresoOperacion || ''),
      mesAfectacionCapa: prev.periodoCapa || capInfo?.periodo || '',
      mesAfectacionBonos: capInfo?.periodo_ingreso_op || prev.periodoCapa || '',
    }))
  }

  const handleFieldChange = (key, val) => {
    setForm(prev => {
      const next = { ...prev, [key]: val }
      if (key === 'pagoPorDia' || key === 'diasCapa') {
        const p = parseFloat(key === 'pagoPorDia' ? val : next.pagoPorDia) || 0
        const d = parseInt(key === 'diasCapa' ? val : next.diasCapa) || 0
        next.pagoCompleto = +(p * d).toFixed(2)
      }
      if (key === 'campana' || key === 'grupo') {
        const c = key === 'campana' ? val : next.campana
        const g = key === 'grupo' ? val : next.grupo
        if (!prev.id) {
          next.cod = `${c || ''}${g || ''}`.replace(/\s+/g, '')
        }
      }
      return next
    })
  }

  // Totales de matriz calculados en tiempo real
  const totalBienvenida = (Number(form.bonoBienvenidaM1) || 0) + (Number(form.bonoBienvenidaM2) || 0) + (Number(form.bonoBienvenidaM3) || 0)
  const totalPermanencia = (Number(form.bonoPermanenciaM1) || 0) + (Number(form.bonoPermanenciaM2) || 0) + (Number(form.bonoPermanenciaM3) || 0) + (Number(form.bonoPermanenciaM4) || 0)
  const totalAsistencia = (Number(form.bonoAsistenciaM1) || 0) + (Number(form.bonoAsistenciaM2) || 0) + (Number(form.bonoAsistenciaM3) || 0)
  const granTotalPropuesta = (Number(form.pagoCompleto) || 0) + totalBienvenida + totalPermanencia + totalAsistencia

  const handleSave = async () => {
    if (!form.grupo) { setError('El Código de Grupo es obligatorio.'); return }
    if (!form.campana) { setError('La Campaña es obligatoria.'); return }
    if (!form.periodoCapa) { setError('El Periodo es obligatorio.'); return }
    if (!form.semana) { setError('La Semana es obligatoria.'); return }
    if (!form.segmento) { setError('El Segmento es obligatorio.'); return }
    setSaving(true); setError(null); setSuccessMsg(null)
    try {
      await upsertConfigPagoGrupo({
        ...form,
        created_by: userProfile?.nombre || userProfile?.email || 'Usuario'
      })
      setSuccessMsg(`✓ Propuesta para ${form.grupo} guardada exitosamente.`)
      setTimeout(() => setSuccessMsg(null), 4000)
      if (onCancelEdit) onCancelEdit()
      setForm(defaultForm)
      onSaved()
    } catch (err) {
      setError(err.message || 'Error al guardar la propuesta.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-slate-900/90 border border-slate-700/90 rounded-2xl p-6 shadow-xl space-y-6">
      {/* Cabecera del formulario */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-800 pb-4">
        <div>
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Settings2 size={18} className="text-emerald-400" />
            {form.id ? `Editando Propuesta Económica: ${form.grupo}` : 'Nueva Propuesta Económica de Grupo'}
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Registro manual completo de las 26 variables económicas y meses de afectación para el cálculo automático.
          </p>
        </div>

        {form.id && (
          <span className="px-3 py-1 bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-bold rounded-full">
            Modo Edición
          </span>
        )}
      </div>

      {/* ── BLOQUE 1: IDENTIFICACIÓN Y CONDICIÓN (ORDEN EN CASCADA DESDE CAPACIDAD) ── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            1. Selección Jerárquica de Grupo (Fuente: Capacidad RYS)
          </div>
          <button
            type="button"
            onClick={() => setManualInput(!manualInput)}
            className="text-[11px] text-slate-400 hover:text-emerald-400 underline transition-colors"
          >
            {manualInput ? '← Usar selector desde Capacidad' : '+ Ingresar código manual no listado'}
          </button>
        </div>

        {/* Fila 1: Filtros en cascada Periodo -> Semana -> Campaña -> Grupo */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3 bg-slate-950/60 p-3.5 rounded-xl border border-slate-800/80">
          {/* 1. Periodo Capa */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-emerald-400 uppercase flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> 1. Periodo Capa
            </label>
            <select
              value={form.periodoCapa}
              onChange={handlePeriodoSelect}
              className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-white font-medium focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value="">-- Seleccionar Periodo --</option>
              {periodosCapaDisponibles.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>

          {/* 2. Semana */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-slate-300 uppercase flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span> 2. Semana
            </label>
            <select
              value={form.semana}
              onChange={handleSemanaSelect}
              disabled={!form.periodoCapa}
              className="bg-slate-800 border border-slate-700 disabled:opacity-40 rounded-lg px-2.5 py-2 text-xs text-white font-medium focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value="">-- Seleccionar Semana --</option>
              {semanasCapaDisponibles.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          {/* 3. Segmento */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-slate-300 uppercase flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-violet-400"></span> 3. Segmento
            </label>
            <select
              value={form.segmento}
              onChange={handleSegmentoSelect}
              disabled={!form.semana}
              className="bg-slate-800 border border-slate-700 disabled:opacity-40 rounded-lg px-2.5 py-2 text-xs text-white font-medium focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value="">-- Seleccionar Segmento --</option>
              {segmentosCapaDisponibles.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          {/* 4. Campaña */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-slate-300 uppercase flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400"></span> 4. Campaña
            </label>
            <select
              value={form.campana}
              onChange={handleCampanaSelect}
              disabled={!form.segmento}
              className="bg-slate-800 border border-slate-700 disabled:opacity-40 rounded-lg px-2.5 py-2 text-xs text-white font-medium focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value="">-- Seleccionar Campaña --</option>
              {campanasCapaDisponibles.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* 5. Grupo */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-amber-400 uppercase flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span> 5. Código de Grupo
            </label>
            {manualInput ? (
              <input
                type="text"
                value={form.grupo}
                onChange={e => handleFieldChange('grupo', e.target.value.toUpperCase())}
                placeholder="Ej: GPE-2026012"
                className="bg-slate-800 border border-amber-500/50 rounded-lg px-2.5 py-2 text-xs text-amber-300 font-mono font-bold focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
            ) : (
              <select
                value={form.grupo}
                onChange={handleGrupoSelect}
                disabled={!form.campana}
                className="bg-slate-800 border border-slate-700 disabled:opacity-40 rounded-lg px-2.5 py-2 text-xs text-amber-300 font-mono font-bold focus:outline-none focus:ring-1 focus:ring-emerald-500"
              >
                <option value="">-- Seleccionar Grupo --</option>
                {gruposCapaDisponibles.map(g => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* Fila 2: Atributos complementarios auto-completados */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {/* Modalidad */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-slate-400 uppercase">Modalidad</label>
            <select
              value={form.modalidad}
              onChange={e => handleFieldChange('modalidad', e.target.value)}
              className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value="REMOTO">REMOTO</option>
              <option value="PRESENCIAL">PRESENCIAL</option>
              <option value="HIBRIDO">HÍBRIDO</option>
            </select>
          </div>

          {/* Condición Laboral */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-slate-400 uppercase">Condición Laboral</label>
            <select
              value={form.condicionLaboral}
              onChange={e => handleFieldChange('condicionLaboral', e.target.value)}
              className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value="FULL TIME">FULL TIME</option>
              <option value="PART TIME">PART TIME</option>
            </select>
          </div>

          {/* COD */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-slate-400 uppercase">Código Concatenado (COD)</label>
            <input
              type="text"
              value={form.cod}
              onChange={e => handleFieldChange('cod', e.target.value)}
              placeholder="CONTACTADOSGPE-2025-029"
              className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-300 font-mono focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
        </div>
      </div>

      {/* ── BLOQUE 2: CRONOGRAMA Y AFECTACIÓN (4 CAMPOS) ── */}
      <div className="space-y-3 pt-3 border-t border-slate-800">
        <div className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
          2. Cronograma y Meses de Afectación Contable
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-slate-400 uppercase">Fecha Inicio Capa</label>
            <input
              type="text"
              value={form.fechaInicioCapa}
              onChange={e => handleFieldChange('fechaInicioCapa', e.target.value)}
              onBlur={e => handleFieldChange('fechaInicioCapa', formatFechaDDMMYYYY(e.target.value))}
              placeholder="DD/MM/YYYY"
              className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-cyan-500 font-mono"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-slate-400 uppercase">Ingreso a la Operación</label>
            <input
              type="text"
              value={form.ingresoOperacion}
              onChange={e => handleFieldChange('ingresoOperacion', e.target.value)}
              onBlur={e => handleFieldChange('ingresoOperacion', formatFechaDDMMYYYY(e.target.value))}
              placeholder="DD/MM/YYYY"
              className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-cyan-500 font-mono"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-slate-400 uppercase">Mes Afectación - Pago Capa</label>
            <input
              type="text"
              value={form.mesAfectacionCapa}
              onChange={e => handleFieldChange('mesAfectacionCapa', e.target.value)}
              placeholder="Ej: 202508"
              className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-emerald-400 font-bold focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-slate-400 uppercase">Mes Afectación - Bonos</label>
            <input
              type="text"
              value={form.mesAfectacionBonos}
              onChange={e => handleFieldChange('mesAfectacionBonos', e.target.value)}
              placeholder="Ej: 202508 ó 202509"
              className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-amber-400 font-bold focus:outline-none focus:ring-1 focus:ring-amber-500 font-mono"
            />
          </div>
        </div>
      </div>

      {/* ── BLOQUE 3: PAGO DE CAPACITACIÓN (4 CAMPOS) ── */}
      <div className="space-y-3 pt-3 border-t border-slate-800">
        <div className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
            3. Tarifa y Días de Capacitación
          </div>
          <span className="text-[11px] text-slate-500 font-normal">
            * Pago Completo se calcula multiplicando Pago/Día × Días Capa
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-slate-400 uppercase">Pago Por Día (S/.)</label>
            <input
              type="number"
              step="0.5"
              value={form.pagoPorDia}
              onChange={e => handleFieldChange('pagoPorDia', e.target.value)}
              className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-emerald-400 font-bold focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-slate-400 uppercase">Días de Capa</label>
            <input
              type="number"
              value={form.diasCapa}
              onChange={e => handleFieldChange('diasCapa', e.target.value)}
              className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-slate-400 uppercase">Cant. Días Feriados</label>
            <input
              type="number"
              value={form.cantDiasFeriados}
              onChange={e => handleFieldChange('cantDiasFeriados', e.target.value)}
              className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-slate-400 uppercase">Pago Completo (S/.)</label>
            <input
              type="number"
              step="0.5"
              value={form.pagoCompleto}
              onChange={e => handleFieldChange('pagoCompleto', e.target.value)}
              className="bg-slate-950 border border-emerald-500/40 rounded-lg px-2.5 py-1.5 text-xs text-emerald-300 font-bold focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
        </div>
      </div>

      {/* ── BLOQUE 4: MATRIZ MENSUAL DE BONOS (MES 1 A MES 4) ── */}
      <div className="space-y-3 pt-3 border-t border-slate-800">
        <div className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-violet-400"></span>
            4. Matriz Mensual de Bonos (Mes 1 a Mes 4)
          </div>
          <span className="text-[11px] text-slate-500 font-normal">
            Asigna el importe según el mes de afectación que corresponda
          </span>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/40">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="bg-slate-800/80 border-b border-slate-700/80 text-slate-300">
                <th className="px-3 py-2 font-bold uppercase">Concepto de Bono</th>
                <th className="px-3 py-2 text-center font-bold uppercase text-amber-400">Mes 1 (S/.)</th>
                <th className="px-3 py-2 text-center font-bold uppercase text-amber-400">Mes 2 (S/.)</th>
                <th className="px-3 py-2 text-center font-bold uppercase text-amber-400">Mes 3 (S/.)</th>
                <th className="px-3 py-2 text-center font-bold uppercase text-violet-400">Mes 4 (S/.)</th>
                <th className="px-3 py-2 text-right font-bold uppercase text-emerald-400">Total Bono</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {/* Fila Bienvenida */}
              <tr className="hover:bg-slate-800/30">
                <td className="px-3 py-2 font-semibold text-amber-300">Bono de Bienvenida</td>
                <td className="px-2 py-1.5 text-center">
                  <input
                    type="number"
                    value={form.bonoBienvenidaM1}
                    onChange={e => handleFieldChange('bonoBienvenidaM1', e.target.value)}
                    className="w-24 text-center bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-white focus:ring-1 focus:ring-amber-500"
                  />
                </td>
                <td className="px-2 py-1.5 text-center">
                  <input
                    type="number"
                    value={form.bonoBienvenidaM2}
                    onChange={e => handleFieldChange('bonoBienvenidaM2', e.target.value)}
                    className="w-24 text-center bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-white focus:ring-1 focus:ring-amber-500"
                  />
                </td>
                <td className="px-2 py-1.5 text-center">
                  <input
                    type="number"
                    value={form.bonoBienvenidaM3}
                    onChange={e => handleFieldChange('bonoBienvenidaM3', e.target.value)}
                    className="w-24 text-center bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-white focus:ring-1 focus:ring-amber-500"
                  />
                </td>
                <td className="px-2 py-1.5 text-center text-slate-600 font-mono">—</td>
                <td className="px-3 py-2 text-right font-bold text-amber-400">{soles(totalBienvenida)}</td>
              </tr>

              {/* Fila Permanencia */}
              <tr className="hover:bg-slate-800/30">
                <td className="px-3 py-2 font-semibold text-violet-300">Bono de Permanencia</td>
                <td className="px-2 py-1.5 text-center">
                  <input
                    type="number"
                    value={form.bonoPermanenciaM1}
                    onChange={e => handleFieldChange('bonoPermanenciaM1', e.target.value)}
                    className="w-24 text-center bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-white focus:ring-1 focus:ring-violet-500"
                  />
                </td>
                <td className="px-2 py-1.5 text-center">
                  <input
                    type="number"
                    value={form.bonoPermanenciaM2}
                    onChange={e => handleFieldChange('bonoPermanenciaM2', e.target.value)}
                    className="w-24 text-center bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-white focus:ring-1 focus:ring-violet-500"
                  />
                </td>
                <td className="px-2 py-1.5 text-center">
                  <input
                    type="number"
                    value={form.bonoPermanenciaM3}
                    onChange={e => handleFieldChange('bonoPermanenciaM3', e.target.value)}
                    className="w-24 text-center bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-white focus:ring-1 focus:ring-violet-500"
                  />
                </td>
                <td className="px-2 py-1.5 text-center">
                  <input
                    type="number"
                    value={form.bonoPermanenciaM4}
                    onChange={e => handleFieldChange('bonoPermanenciaM4', e.target.value)}
                    className="w-24 text-center bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-white focus:ring-1 focus:ring-violet-500"
                  />
                </td>
                <td className="px-3 py-2 text-right font-bold text-violet-400">{soles(totalPermanencia)}</td>
              </tr>

              {/* Fila Asistencia Perfecta */}
              <tr className="hover:bg-slate-800/30">
                <td className="px-3 py-2 font-semibold text-rose-300">Bono Asistencia Perfecta</td>
                <td className="px-2 py-1.5 text-center">
                  <input
                    type="number"
                    value={form.bonoAsistenciaM1}
                    onChange={e => handleFieldChange('bonoAsistenciaM1', e.target.value)}
                    className="w-24 text-center bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-white focus:ring-1 focus:ring-rose-500"
                  />
                </td>
                <td className="px-2 py-1.5 text-center">
                  <input
                    type="number"
                    value={form.bonoAsistenciaM2}
                    onChange={e => handleFieldChange('bonoAsistenciaM2', e.target.value)}
                    className="w-24 text-center bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-white focus:ring-1 focus:ring-rose-500"
                  />
                </td>
                <td className="px-2 py-1.5 text-center">
                  <input
                    type="number"
                    value={form.bonoAsistenciaM3}
                    onChange={e => handleFieldChange('bonoAsistenciaM3', e.target.value)}
                    className="w-24 text-center bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-white focus:ring-1 focus:ring-rose-500"
                  />
                </td>
                <td className="px-2 py-1.5 text-center text-slate-600 font-mono">—</td>
                <td className="px-3 py-2 text-right font-bold text-rose-400">{soles(totalAsistencia)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Resumen Global de la Propuesta */}
      <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap gap-4 text-xs">
          <div><span className="text-slate-500">Pago Capa:</span> <strong className="text-emerald-400">{soles(form.pagoCompleto)}</strong></div>
          <div><span className="text-slate-500">Bienvenida:</span> <strong className="text-amber-400">{soles(totalBienvenida)}</strong></div>
          <div><span className="text-slate-500">Permanencia:</span> <strong className="text-violet-400">{soles(totalPermanencia)}</strong></div>
          <div><span className="text-slate-500">Asist. Perf.:</span> <strong className="text-rose-400">{soles(totalAsistencia)}</strong></div>
        </div>
        <div className="text-sm">
          <span className="text-slate-400 font-medium mr-2">VALOR PROMEDIO TOTAL / PERSONA:</span>
          <strong className="text-emerald-300 font-extrabold text-base bg-emerald-950/60 px-3 py-1 rounded-lg border border-emerald-500/30">
            {soles(granTotalPropuesta)}
          </strong>
        </div>
      </div>

      {/* Alertas */}
      {error && (
        <div className="flex items-center gap-2 text-rose-400 text-xs bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">
          <AlertCircle size={14} /> {error}
        </div>
      )}
      {successMsg && (
        <div className="flex items-center gap-2 text-emerald-400 text-xs bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">
          <CheckCircle2 size={14} /> {successMsg}
        </div>
      )}

      {/* Botones de acción */}
      <div className="flex items-center justify-between gap-3 pt-2">
        <button
          type="button"
          onClick={() => { setForm(defaultForm); if (onCancelEdit) onCancelEdit() }}
          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white text-xs font-semibold rounded-lg transition-colors"
        >
          Limpiar Campos
        </button>

        <div className="flex gap-2">
          {form.id && (
            <button
              type="button"
              onClick={() => { setForm(defaultForm); if (onCancelEdit) onCancelEdit() }}
              className="flex items-center gap-1.5 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs font-semibold rounded-lg transition-colors"
            >
              <X size={14} /> Cancelar Edición
            </button>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold rounded-lg transition-all shadow-md shadow-emerald-950/50"
          >
            {saving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
            {form.id ? 'Actualizar Propuesta' : 'Guardar Propuesta'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────
// Sub-componente: Tabla Consolidada de Propuestas con 26 Columnas y Sticky
// ────────────────────────────────────────────────────────────────────────
function TablaConfigs({ configs, onDelete, onEdit, onRefresh }) {
  const [searchTerm, setSearchTerm] = useState('')
  const [deleting, setDeleting] = useState(null)

  const handleDelete = async (item) => {
    const cod = item.grupo || item.grupo_codigo || item.id
    if (!confirm(`¿Estás seguro de eliminar la propuesta del grupo ${cod}?`)) return
    setDeleting(cod)
    try { 
      await onDelete(item)
      onRefresh() 
    } catch (e) { 
      alert(e.message || 'Error al eliminar') 
    } finally { 
      setDeleting(null) 
    }
  }

  const configsFiltradas = useMemo(() => {
    if (!searchTerm.trim()) return configs
    const q = searchTerm.toLowerCase().trim()
    return configs.filter(c => 
      (c.grupo || c.grupo_codigo || '').toLowerCase().includes(q) ||
      (c.campana || '').toLowerCase().includes(q) ||
      (c.segmento || '').toLowerCase().includes(q) ||
      (c.periodoCapa || c.periodo || '').toLowerCase().includes(q) ||
      (c.cod || '').toLowerCase().includes(q)
    )
  }, [configs, searchTerm])

  const renderVal = (v, colorClass = 'text-slate-300') => {
    const num = Number(v) || 0
    if (num <= 0) return <span className="text-slate-600 font-mono">—</span>
    return <span className={`font-mono font-medium ${colorClass}`}>{num.toFixed(0)}</span>
  }

  return (
    <div className="space-y-3">
      {/* Barra superior de búsqueda y conteo */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-slate-900/70 p-3 rounded-xl border border-slate-800">
        <div className="relative flex-1 max-w-sm w-full">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Buscar por grupo, campaña, periodo o COD..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>
        <div className="text-xs text-slate-400 font-medium">
          Mostrando <strong className="text-emerald-400">{configsFiltradas.length}</strong> propuestas registradas
        </div>
      </div>

      {/* Tabla con scroll horizontal y sticky columns */}
      <div className="overflow-x-auto rounded-xl border border-slate-700/80 shadow-lg bg-slate-900/60 max-h-[650px] relative">
        <table className="w-full text-xs text-left whitespace-nowrap border-collapse">
          {/* Fila 1: Grupos temáticos */}
          <thead className="bg-slate-800/95 sticky top-0 z-20">
            <tr className="border-b border-slate-700 text-slate-400 text-[10px] uppercase font-bold tracking-wider">
              <th colSpan={8} className="px-3 py-1.5 bg-slate-800 border-r border-slate-700 text-blue-300 text-center">
                1. Datos de Identificación del Grupo
              </th>
              <th colSpan={4} className="px-3 py-1.5 bg-cyan-950/30 border-r border-slate-700 text-cyan-300 text-center">
                2. Cronograma & Afectación
              </th>
              <th colSpan={4} className="px-3 py-1.5 bg-emerald-950/30 border-r border-slate-700 text-emerald-300 text-center">
                3. Liquidación Capa
              </th>
              <th colSpan={3} className="px-3 py-1.5 bg-amber-950/30 border-r border-slate-700 text-amber-300 text-center">
                4. Bono Bienvenida
              </th>
              <th colSpan={4} className="px-3 py-1.5 bg-violet-950/30 border-r border-slate-700 text-violet-300 text-center">
                5. Bono Permanencia
              </th>
              <th colSpan={3} className="px-3 py-1.5 bg-rose-950/30 border-r border-slate-700 text-rose-300 text-center">
                6. Asistencia Perfecta
              </th>
              <th className="px-3 py-1.5 bg-slate-800 text-slate-400 text-center sticky right-0 z-30 shadow-[-4px_0_6px_rgba(0,0,0,0.3)]">
                Acciones
              </th>
            </tr>

            {/* Fila 2: Cabeceras específicas */}
            <tr className="border-b border-slate-700 text-slate-300 text-[11px] font-semibold bg-slate-900/90">
              <th className="px-3 py-2 border-r border-slate-800">Periodo</th>
              <th className="px-2 py-2 border-r border-slate-800 text-center">Semana</th>
              <th className="px-3 py-2 border-r border-slate-800">Segmento</th>
              <th className="px-3 py-2 border-r border-slate-800">Campaña</th>
              <th className="px-3 py-2 border-r border-slate-800 font-mono font-bold text-emerald-400 sticky left-0 z-10 bg-slate-900 shadow-[4px_0_6px_rgba(0,0,0,0.4)]">
                Grupo
              </th>
              <th className="px-2 py-2 border-r border-slate-800 text-center">Modalidad</th>
              <th className="px-2 py-2 border-r border-slate-800 text-center">Condición</th>
              <th className="px-3 py-2 border-r border-slate-700 font-mono text-[10px] text-slate-400">COD</th>

              {/* Cronograma & Afectación */}
              <th className="px-2.5 py-2 border-r border-slate-800 font-mono text-center">Inicio Capa</th>
              <th className="px-2.5 py-2 border-r border-slate-800 font-mono text-center">Ingreso Op.</th>
              <th className="px-2.5 py-2 border-r border-slate-800 font-mono text-center text-cyan-300">Af. Capa</th>
              <th className="px-2.5 py-2 border-r border-slate-700 font-mono text-center text-amber-300">Af. Bonos</th>

              {/* Pago Capa */}
              <th className="px-2.5 py-2 border-r border-slate-800 text-right text-emerald-400">S/./Día</th>
              <th className="px-2 py-2 border-r border-slate-800 text-center">Días</th>
              <th className="px-2 py-2 border-r border-slate-800 text-center text-slate-400">Fer.</th>
              <th className="px-3 py-2 border-r border-slate-700 text-right font-bold text-emerald-300 bg-emerald-950/20">Pago Total</th>

              {/* Bono Bienvenida */}
              <th className="px-2.5 py-2 border-r border-slate-800 text-right text-amber-400">M1</th>
              <th className="px-2.5 py-2 border-r border-slate-800 text-right text-amber-400">M2</th>
              <th className="px-2.5 py-2 border-r border-slate-700 text-right text-amber-400">M3</th>

              {/* Bono Permanencia */}
              <th className="px-2.5 py-2 border-r border-slate-800 text-right text-violet-400">M1</th>
              <th className="px-2.5 py-2 border-r border-slate-800 text-right text-violet-400">M2</th>
              <th className="px-2.5 py-2 border-r border-slate-800 text-right text-violet-400">M3</th>
              <th className="px-2.5 py-2 border-r border-slate-700 text-right text-violet-400">M4</th>

              {/* Asistencia Perfecta */}
              <th className="px-2.5 py-2 border-r border-slate-800 text-right text-rose-400">M1</th>
              <th className="px-2.5 py-2 border-r border-slate-800 text-right text-rose-400">M2</th>
              <th className="px-2.5 py-2 border-r border-slate-700 text-right text-rose-400">M3</th>

              {/* Acciones */}
              <th className="px-3 py-2 text-center sticky right-0 z-10 bg-slate-900 shadow-[-4px_0_6px_rgba(0,0,0,0.4)]">
                Acciones
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-800/60">
            {configsFiltradas.length === 0 ? (
              <tr>
                <td colSpan={27} className="px-4 py-12 text-center text-slate-500">
                  No hay propuestas que coincidan con la búsqueda.
                </td>
              </tr>
            ) : (
              configsFiltradas.map(c => {
                const grpCode = c.grupo || c.grupo_codigo || ''
                return (
                  <tr key={c.id || claveDesdeConfig(c)} className="hover:bg-slate-800/40 transition-colors">
                    <td className="px-3 py-2 text-slate-300 font-mono text-[11px] border-r border-slate-800/60">{c.periodoCapa || c.periodo || '—'}</td>
                    <td className="px-2 py-2 text-center text-slate-400 text-[11px] border-r border-slate-800/60">{c.semana || c.semana_trabajo || '—'}</td>
                    <td className="px-3 py-2 text-slate-300 text-[11px] border-r border-slate-800/60">{c.segmento || '—'}</td>
                    <td className="px-3 py-2 text-slate-200 font-medium text-[11px] border-r border-slate-800/60">{c.campana || '—'}</td>
                    <td className="px-3 py-2 font-mono font-bold text-emerald-400 border-r border-slate-800/60 sticky left-0 z-10 bg-slate-900 shadow-[4px_0_6px_rgba(0,0,0,0.4)]">
                      {grpCode}
                    </td>
                    <td className="px-2 py-2 text-center text-slate-400 text-[10px] border-r border-slate-800/60">{c.modalidad || 'REMOTO'}</td>
                    <td className="px-2 py-2 text-center text-slate-400 text-[10px] border-r border-slate-800/60">{c.condicionLaboral || 'FULL TIME'}</td>
                    <td className="px-3 py-2 text-slate-400 font-mono text-[10px] border-r border-slate-700/60">{c.cod || '—'}</td>

                    {/* Fechas & Afectación */}
                    <td className="px-2.5 py-2 font-mono text-center text-slate-300 text-[11px] border-r border-slate-800/60">{formatFechaDDMMYYYY(c.fechaInicioCapa) || '—'}</td>
                    <td className="px-2.5 py-2 font-mono text-center text-slate-300 text-[11px] border-r border-slate-800/60">{formatFechaDDMMYYYY(c.ingresoOperacion) || '—'}</td>
                    <td className="px-2.5 py-2 font-mono text-center font-bold text-cyan-400 border-r border-slate-800/60">{c.mesAfectacionCapa || '—'}</td>
                    <td className="px-2.5 py-2 font-mono text-center font-bold text-amber-400 border-r border-slate-700/60">{c.mesAfectacionBonos || '—'}</td>

                    {/* Pago Capa */}
                    <td className="px-2.5 py-2 text-right border-r border-slate-800/60">{renderVal(c.pagoPorDia || c.monto_dia_capa, 'text-emerald-400')}</td>
                    <td className="px-2 py-2 text-center text-slate-300 border-r border-slate-800/60">{c.diasCapa || 0}</td>
                    <td className="px-2 py-2 text-center text-slate-500 border-r border-slate-800/60">{c.cantDiasFeriados || 0}</td>
                    <td className="px-3 py-2 text-right font-bold text-emerald-300 bg-emerald-950/20 border-r border-slate-700/60">
                      {soles(c.pagoCompleto || ((c.pagoPorDia || c.monto_dia_capa || 0) * (c.diasCapa || 0)))}
                    </td>

                    {/* Bono Bienvenida */}
                    <td className="px-2.5 py-2 text-right border-r border-slate-800/60">{renderVal(c.bonoBienvenidaM1 || c.bono_bienvenida, 'text-amber-400')}</td>
                    <td className="px-2.5 py-2 text-right border-r border-slate-800/60">{renderVal(c.bonoBienvenidaM2, 'text-amber-400')}</td>
                    <td className="px-2.5 py-2 text-right border-r border-slate-700/60">{renderVal(c.bonoBienvenidaM3, 'text-amber-400')}</td>

                    {/* Bono Permanencia */}
                    <td className="px-2.5 py-2 text-right border-r border-slate-800/60">{renderVal(c.bonoPermanenciaM1 || c.bono_permanencia_total, 'text-violet-400')}</td>
                    <td className="px-2.5 py-2 text-right border-r border-slate-800/60">{renderVal(c.bonoPermanenciaM2, 'text-violet-400')}</td>
                    <td className="px-2.5 py-2 text-right border-r border-slate-800/60">{renderVal(c.bonoPermanenciaM3, 'text-violet-400')}</td>
                    <td className="px-2.5 py-2 text-right border-r border-slate-700/60">{renderVal(c.bonoPermanenciaM4, 'text-violet-400')}</td>

                    {/* Asistencia Perfecta */}
                    <td className="px-2.5 py-2 text-right border-r border-slate-800/60">{renderVal(c.bonoAsistenciaM1 || c.bono_asistencia_perfecta, 'text-rose-400')}</td>
                    <td className="px-2.5 py-2 text-right border-r border-slate-800/60">{renderVal(c.bonoAsistenciaM2, 'text-rose-400')}</td>
                    <td className="px-2.5 py-2 text-right border-r border-slate-700/60">{renderVal(c.bonoAsistenciaM3, 'text-rose-400')}</td>

                    {/* Acciones */}
                    <td className="px-3 py-2 text-center sticky right-0 z-10 bg-slate-900 shadow-[-4px_0_6px_rgba(0,0,0,0.4)]">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => {
                            if (onEdit) onEdit(c)
                            window.scrollTo({ top: 0, behavior: 'smooth' })
                          }}
                          className="p-1.5 text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10 rounded-md transition-colors"
                          title="Editar propuesta"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          onClick={() => handleDelete(c)}
                          disabled={deleting === grpCode}
                          className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-md transition-colors"
                          title="Eliminar propuesta"
                        >
                          {deleting === grpCode ? <RefreshCw size={13} className="animate-spin text-rose-400" /> : <Trash2 size={13} />}
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────
// Sub-componente: TABLA MATRIZ DE CRONOGRAMA DE PAGOS (Exacta a la Maqueta Excel)
// Columnas: DOCUMENTO | NOMBRE COMPLETO | CAMPAÑA | GPE | MES DE PAGO | IMPORTE DE CAPA | BIENVENIDA | PERMANENCIA | ASISTENCIA PERFECTA | TOTAL MES | ESTADO DE PAGO
// ────────────────────────────────────────────────────────────────────────
function TablaMatrizPagos({ filas = [] }) {
  const [searchTerm, setSearchTerm] = useState('')
  const [sortKey, setSortKey] = useState('nombre_completo')
  const [sortDir, setSortDir] = useState(1)

  const handleSort = (key) => {
    if (sortKey === key) setSortDir(d => -d)
    else { setSortKey(key); setSortDir(1) }
  }

  const filasFiltradas = useMemo(() => {
    let list = [...filas]
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase().trim()
      list = list.filter(f => 
        (f.documento || '').toLowerCase().includes(q) ||
        (f.nombre_completo || '').toLowerCase().includes(q) ||
        (f.campana || '').toLowerCase().includes(q) ||
        (f.grupo_codigo || '').toLowerCase().includes(q) ||
        (f.reclutador || '').toLowerCase().includes(q) ||
        (f.status_final || '').toLowerCase().includes(q) ||
        (f.mes_pago || '').toLowerCase().includes(q) ||
        (f.estado_pago || '').toLowerCase().includes(q) ||
        (f.es_agregado ? 'agregado' : 'apto').includes(q)
      )
    }

    return list.sort((a, b) => {
      let va = a[sortKey] ?? ''
      let vb = b[sortKey] ?? ''
      if (sortKey === 'nombre_completo' || sortKey === 'documento') {
        const comp = String(va).localeCompare(String(vb)) * sortDir
        if (comp !== 0) return comp
        return String(a.mes_pago || '').localeCompare(String(b.mes_pago || ''))
      }
      if (typeof va === 'number' && typeof vb === 'number') {
        return (va - vb) * sortDir
      }
      return String(va).localeCompare(String(vb)) * sortDir
    })
  }, [filas, searchTerm, sortKey, sortDir])

  const renderMonto = (v, color = 'text-slate-300') => {
    const num = Number(v) || 0
    if (num <= 0) return <span className="text-slate-600 font-mono text-[11px]">—</span>
    return <span className={`font-mono font-medium ${color}`}>{soles(num)}</span>
  }

  return (
    <div className="space-y-3">
      {/* Buscador y Conteo */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-slate-900/60 p-3 rounded-xl border border-slate-800">
        <div className="relative flex-1 max-w-sm w-full">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Buscar por DNI, postulante, campaña, grupo o mes de pago..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>
        <div className="text-xs text-slate-400 font-medium">
          Mostrando <strong className="text-emerald-400">{filasFiltradas.length}</strong> cuotas mensuales en cronograma
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-700/80 shadow-lg bg-slate-900/60 max-h-[650px] relative">
        <table className="w-full text-xs whitespace-nowrap border-collapse">
          <thead className="bg-slate-800/95 sticky top-0 z-20 text-slate-300 border-b border-slate-700">
            <tr className="uppercase text-[11px] font-bold tracking-wider">
              <th onClick={() => handleSort('documento')} className="px-3 py-2.5 text-left cursor-pointer hover:text-white">
                DOCUMENTO
              </th>
              <th onClick={() => handleSort('nombre_completo')} className="px-3 py-2.5 text-left cursor-pointer hover:text-white">
                NOMBRE COMPLETO
              </th>
              <th onClick={() => handleSort('reclutador')} className="px-3 py-2.5 text-left cursor-pointer hover:text-white text-emerald-400">
                RECLUTADOR
              </th>
              <th onClick={() => handleSort('campana')} className="px-3 py-2.5 text-left cursor-pointer hover:text-white">
                CAMPAÑA
              </th>
              <th onClick={() => handleSort('grupo_codigo')} className="px-3 py-2.5 text-left cursor-pointer hover:text-white font-mono text-emerald-400">
                GPE
              </th>
              <th onClick={() => handleSort('status_final')} className="px-3 py-2.5 text-center cursor-pointer hover:text-white" title="Ingreso a Operación confirmado en asistencia">
                ESTADO / I-OP
              </th>
              <th onClick={() => handleSort('dia_0_status')} className="px-3 py-2.5 text-center cursor-pointer hover:text-white text-cyan-300" title="Día 0 de Inducción (Aptos lo cobran si asistieron; Agregados no lo cobran)">
                DÍA 0 (INDUCCIÓN)
              </th>
              <th onClick={() => handleSort('dias_asistidos')} className="px-3 py-2.5 text-center cursor-pointer hover:text-white">
                DÍAS ASIST.
              </th>
              <th onClick={() => handleSort('asistencia_perfecta')} className="px-3 py-2.5 text-center cursor-pointer hover:text-white text-rose-300" title="0 faltas durante la capacitación">
                ASIST. PERF.
              </th>
              <th onClick={() => handleSort('mes_pago')} className="px-3 py-2.5 text-center cursor-pointer hover:text-white bg-slate-800 border-x border-slate-700 text-amber-300">
                MES DE PAGO
              </th>
              <th onClick={() => handleSort('importe_capa')} className="px-3 py-2.5 text-right cursor-pointer hover:text-white text-emerald-400">
                IMPORTE DE CAPA
              </th>
              <th onClick={() => handleSort('bono_bienvenida')} className="px-3 py-2.5 text-right cursor-pointer hover:text-white text-amber-400">
                BIENVENIDA
              </th>
              <th onClick={() => handleSort('bono_permanencia')} className="px-3 py-2.5 text-right cursor-pointer hover:text-white text-violet-400">
                PERMANENCIA
              </th>
              <th onClick={() => handleSort('bono_asistencia_perfecta')} className="px-3 py-2.5 text-right cursor-pointer hover:text-white text-rose-400">
                ASISTENCIA PERFECTA
              </th>
              <th onClick={() => handleSort('total_mes')} className="px-3 py-2.5 text-right font-bold text-emerald-300 bg-emerald-950/20 cursor-pointer hover:text-white">
                TOTAL MES
              </th>
              <th onClick={() => handleSort('estado_pago')} className="px-3 py-2.5 text-center cursor-pointer hover:text-white">
                ESTADO DE PAGO
              </th>
              <th className="px-3 py-2.5 text-center text-slate-400">
                TRAZABILIDAD
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800 bg-slate-900/40">
            {filasFiltradas.length === 0 ? (
              <tr>
                <td colSpan={17} className="text-center py-10 text-slate-500">
                  No se encontraron registros de cuotas de pago para los filtros seleccionados.
                </td>
              </tr>
            ) : (
              filasFiltradas.map((r, i) => (
                <tr
                  key={`${r.documento}-${r.mes_pago}-${i}`}
                  className={`hover:bg-slate-800/40 transition-colors ${
                    r.es_baja ? 'bg-rose-950/20 opacity-70' : ''
                  }`}
                >
                  {/* 1. Documento */}
                  <td className="px-3 py-2 font-mono font-bold text-slate-300">{r.documento}</td>

                  {/* 2. Nombre Completo + Condición Apto / Agregado */}
                  <td className="px-3 py-2 text-white font-medium uppercase">
                    {r.nombre_completo}
                    {r.es_agregado ? (
                      <span className="ml-2 px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30" title="Agregado/Recuperado: No cobra Día 0 de inducción">
                        AGREGADO
                      </span>
                    ) : (
                      <span className="ml-2 px-1.5 py-0.5 rounded text-[9px] font-medium bg-slate-800 text-slate-400 border border-slate-700">
                        APTO
                      </span>
                    )}
                  </td>

                  {/* 3. Reclutador */}
                  <td className="px-3 py-2 text-slate-300 font-medium text-[11px] truncate max-w-[130px]" title={r.reclutador || '—'}>
                    {r.reclutador || <span className="text-slate-600">—</span>}
                  </td>

                  {/* 4. Campaña */}
                  <td className="px-3 py-2 text-slate-300">{r.campana}</td>

                  {/* 5. GPE */}
                  <td className="px-3 py-2 font-mono font-bold text-emerald-400">{r.grupo_codigo}</td>

                  {/* 6. Estado / I-OP */}
                  <td className="px-3 py-2 text-center">
                    {r.es_baja ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30">
                        BAJA
                      </span>
                    ) : r.tiene_iop ? (
                      <span
                        className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 inline-flex items-center gap-1"
                        title={r.total_iop > 1 ? `${r.total_iop} registros I-OP registrados en asistencia` : `Ingreso a Operación: ${r.fecha_primer_iop || 'OK'}`}
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                        I-OP {r.fecha_primer_iop ? `(${r.fecha_primer_iop.slice(5)})` : ''}
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/20 text-blue-400 border border-blue-500/30">
                        {r.status_final || 'CALIFICA'}
                      </span>
                    )}
                  </td>

                  {/* 7. Día 0 (Inducción) */}
                  <td className="px-3 py-2 text-center">
                    {r.asistio_dia_0 ? (
                      <span
                        className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 inline-flex items-center gap-1"
                        title="Asistió al Día 0 de inducción: Se computa y se paga (+1 día)"
                      >
                        <span>✓</span> Asistió
                      </span>
                    ) : r.es_agregado ? (
                      <span
                        className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-300/80 border border-amber-500/20"
                        title="Agregado/Recuperado: No cobra Día 0"
                      >
                        N/A
                      </span>
                    ) : (
                      <span
                        className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/10 text-rose-400/80 border border-rose-500/20"
                        title="Apto faltó al Día 0"
                      >
                        Falta
                      </span>
                    )}
                  </td>

                  {/* 8. Días Asistidos */}
                  <td className="px-3 py-2 text-center font-bold text-blue-400">
                    <span className="text-sm font-black">{r.dias_asistidos}</span>
                    {r.asistio_dia_0 && (
                      <span className="block text-[9px] text-cyan-300 font-normal">
                        (c/ Día 0)
                      </span>
                    )}
                  </td>

                  {/* 9. Asistencia Perfecta */}
                  <td className="px-3 py-2 text-center">
                    {r.asistencia_perfecta ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" title="0 faltas registradas en capacitación">
                        ✓ Perfecta
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/10 text-rose-400/80 border border-rose-500/20" title="Tuvo faltas o inasistencias en capacitación">
                        Con Falta
                      </span>
                    )}
                  </td>

                  {/* 10. Mes de Pago */}
                  <td className="px-3 py-2 text-center font-mono font-bold border-x border-slate-800/80 bg-slate-950/40 text-amber-300">
                    {r.mes_pago}
                  </td>

                  {/* 11. Importe de Capa */}
                  <td className="px-3 py-2 text-right">{renderMonto(r.importe_capa, 'text-emerald-400')}</td>

                  {/* 12. Bienvenida */}
                  <td className="px-3 py-2 text-right">{renderMonto(r.bono_bienvenida, 'text-amber-400')}</td>

                  {/* 13. Permanencia */}
                  <td className="px-3 py-2 text-right">{renderMonto(r.bono_permanencia, 'text-violet-400')}</td>

                  {/* 14. Asistencia Perfecta (Monto) */}
                  <td className="px-3 py-2 text-right">
                    {r.bono_asistencia_perfecta > 0 ? (
                      renderMonto(r.bono_asistencia_perfecta, 'text-rose-400')
                    ) : (
                      <span className="text-slate-600 font-mono text-[11px]">—</span>
                    )}
                  </td>

                  {/* 15. Total Mes */}
                  <td className="px-3 py-2 text-right font-black bg-emerald-950/20 text-emerald-300">
                    {soles(r.total_mes)}
                  </td>

                  {/* 16. Estado de Pago */}
                  <td className="px-3 py-2 text-center">
                    {r.estado_pago === 'PAGADO' ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                        <CheckCircle2 size={11} /> PAGADO
                      </span>
                    ) : r.estado_pago === 'NO APLICA' ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30">
                        NO APLICA
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
                        ⏳ PENDIENTE
                      </span>
                    )}
                  </td>

                  {/* 17. Trazabilidad / Lote */}
                  <td className="px-3 py-2 text-center text-[10px] text-slate-400">
                    {r.lote_id ? (
                      <span className="font-mono text-violet-300 font-medium" title={`Cerrado el: ${r.cerrado_at ? new Date(r.cerrado_at).toLocaleString() : ''} por ${r.cerrado_por || 'admin'}`}>
                        Lote: {String(r.lote_id).substring(0, 8)}...
                      </span>
                    ) : (
                      <span className="text-slate-600">—</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────
// Sub-componente: TABLA RESUMEN POR POSTULANTE (Mapeo de Meses Pagados vs Pendientes)
// ────────────────────────────────────────────────────────────────────────
function TablaResumenPostulantes({ personas = [] }) {
  const [searchTerm, setSearchTerm] = useState('')
  const [expandedDoc, setExpandedDoc] = useState(null)

  const filtrados = useMemo(() => {
    if (!searchTerm.trim()) return personas
    const q = searchTerm.toLowerCase().trim()
    return personas.filter(p =>
      (p.documento || '').toLowerCase().includes(q) ||
      (p.nombre_completo || '').toLowerCase().includes(q) ||
      (p.campana || '').toLowerCase().includes(q) ||
      (p.grupo_codigo || '').toLowerCase().includes(q)
    )
  }, [personas, searchTerm])

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-slate-900/60 p-3 rounded-xl border border-slate-800">
        <div className="relative flex-1 max-w-sm w-full">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Buscar por DNI, postulante, campaña o grupo..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>
        <div className="text-xs text-slate-400 font-medium">
          Mostrando <strong className="text-emerald-400">{filtrados.length}</strong> postulantes con cronograma
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-700/80 shadow-lg bg-slate-900/60">
        <table className="w-full text-xs whitespace-nowrap border-collapse">
          <thead className="bg-slate-800/90 text-slate-300 border-b border-slate-700">
            <tr className="uppercase text-[11px] font-bold">
              <th className="px-3 py-2.5 text-left">DNI/CE</th>
              <th className="px-3 py-2.5 text-left">Postulante</th>
              <th className="px-3 py-2.5 text-left">Campaña</th>
              <th className="px-3 py-2.5 text-left font-mono">GPE</th>
              <th className="px-3 py-2.5 text-right text-cyan-300">Total Programado</th>
              <th className="px-3 py-2.5 text-right text-emerald-400">Total Pagado</th>
              <th className="px-3 py-2.5 text-right text-amber-400">Saldo Pendiente</th>
              <th className="px-3 py-2.5 text-left">Meses Pagados</th>
              <th className="px-3 py-2.5 text-left">Meses que Falta Pagar</th>
              <th className="px-3 py-2.5 text-center">Acción</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800 bg-slate-900/40">
            {filtrados.map(p => {
              const isExpanded = expandedDoc === p.documento
              return (
                <React.Fragment key={p.documento}>
                  <tr className="hover:bg-slate-800/40 transition-colors">
                    <td className="px-3 py-2 font-mono font-bold text-slate-300">{p.documento}</td>
                    <td className="px-3 py-2 text-white font-medium uppercase">
                      {p.nombre_completo}
                      {p.es_agregado ? (
                        <span className="ml-2 px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30" title="Agregado/Recuperado">
                          AGREGADO
                        </span>
                      ) : (
                        <span className="ml-2 px-1.5 py-0.5 rounded text-[9px] font-medium bg-slate-800 text-slate-400 border border-slate-700">
                          APTO
                        </span>
                      )}
                      {p.tiene_iop && (
                        <span className="ml-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" title="Ingresó a Operación">
                          I-OP
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-slate-300">{p.campana}</td>
                    <td className="px-3 py-2 font-mono text-emerald-400 font-bold">{p.grupo_codigo}</td>
                    <td className="px-3 py-2 text-right font-bold text-cyan-300">{soles(p.total_programado)}</td>
                    <td className="px-3 py-2 text-right font-bold text-emerald-400">{soles(p.total_pagado)}</td>
                    <td className="px-3 py-2 text-right font-bold text-amber-400">{soles(p.total_pendiente)}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        {p.meses_pagados.length > 0 ? (
                          p.meses_pagados.map(m => (
                            <span key={m} className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                              ✓ {m}
                            </span>
                          ))
                        ) : (
                          <span className="text-slate-600 text-[11px]">—</span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        {p.meses_pendientes.length > 0 ? (
                          p.meses_pendientes.map(m => (
                            <span key={m} className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
                              ⏳ {m}
                            </span>
                          ))
                        ) : (
                          <span className="text-emerald-400 text-[10px] font-bold">TODO PAGADO</span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <button
                        onClick={() => setExpandedDoc(isExpanded ? null : p.documento)}
                        className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-medium flex items-center gap-1 mx-auto"
                      >
                        {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                        {isExpanded ? 'Ocultar' : 'Ver Cuotas'}
                      </button>
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr className="bg-slate-950/60">
                      <td colSpan={10} className="px-6 py-3">
                        <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
                          <h4 className="text-xs font-bold text-slate-300 uppercase mb-2">
                            Cronograma Mensual de {p.nombre_completo} ({p.documento})
                          </h4>
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-slate-400 border-b border-slate-800 text-[10px] uppercase">
                                <th className="text-left py-1">Mes de Pago</th>
                                <th className="text-right py-1">Importe Capa</th>
                                <th className="text-right py-1">Bienvenida</th>
                                <th className="text-right py-1">Permanencia</th>
                                <th className="text-right py-1">Asist. Perfecta</th>
                                <th className="text-right py-1 text-emerald-400">Total Mes</th>
                                <th className="text-center py-1">Estado</th>
                                <th className="text-left py-1">Lote / Fecha</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/40">
                              {p.cuotas_detalle.map((c, idx) => (
                                <tr key={idx} className="py-1 text-slate-300">
                                  <td className="py-1.5 font-mono font-bold text-amber-300">{c.mes_pago}</td>
                                  <td className="py-1.5 text-right">{c.importe_capa > 0 ? soles(c.importe_capa) : '—'}</td>
                                  <td className="py-1.5 text-right">{c.bono_bienvenida > 0 ? soles(c.bono_bienvenida) : '—'}</td>
                                  <td className="py-1.5 text-right">{c.bono_permanencia > 0 ? soles(c.bono_permanencia) : '—'}</td>
                                  <td className="py-1.5 text-right">{c.bono_asistencia_perfecta > 0 ? soles(c.bono_asistencia_perfecta) : '—'}</td>
                                  <td className="py-1.5 text-right font-bold text-emerald-400">{soles(c.total_mes)}</td>
                                  <td className="py-1.5 text-center">
                                    {c.estado_pago === 'PAGADO' ? (
                                      <span className="text-emerald-400 text-[10px] font-bold">✓ PAGADO</span>
                                    ) : (
                                      <span className="text-amber-400 text-[10px] font-bold">⏳ PENDIENTE</span>
                                    )}
                                  </td>
                                  <td className="py-1.5 text-slate-400 text-[10px]">
                                    {c.lote_id ? `Lote: ${c.lote_id.substring(0, 8)}... (${c.cerrado_at ? new Date(c.cerrado_at).toLocaleDateString() : ''})` : '—'}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────
// Sub-componente: Tabla de pagos calculados (Vista Clásica / Auditoría)
// ────────────────────────────────────────────────────────────────────────
function TablaPagos({ filas, maxCuotas }) {
  const [searchTerm, setSearchTerm] = useState('')
  const [sortKey, setSortKey] = useState('nombre_completo')
  const [sortDir, setSortDir] = useState(1)

  const handleSort = (key) => {
    if (sortKey === key) setSortDir(d => -d)
    else { setSortKey(key); setSortDir(1) }
  }

  const filasFiltradas = useMemo(() => {
    let list = [...filas]
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase().trim()
      list = list.filter(f => 
        (f.documento || '').toLowerCase().includes(q) ||
        (f.nombre_completo || '').toLowerCase().includes(q) ||
        (f.reclutador || '').toLowerCase().includes(q) ||
        (f.grupo_codigo || '').toLowerCase().includes(q) ||
        (f.campana || '').toLowerCase().includes(q) ||
        (f.status_dia_1 || '').toLowerCase().includes(q) ||
        (f.es_agregado ? 'agregado' : '').includes(q)
      )
    }

    return list.sort((a, b) => {
      let va = a[sortKey] ?? ''
      let vb = b[sortKey] ?? ''
      if (typeof va === 'number' && typeof vb === 'number') {
        return (va - vb) * sortDir
      }
      return String(va).localeCompare(String(vb)) * sortDir
    })
  }, [filas, searchTerm, sortKey, sortDir])

  return (
    <div className="space-y-3">
      {/* Buscador de tabla */}
      <div className="flex justify-between items-center gap-4 bg-slate-900/60 p-3 rounded-xl border border-slate-800">
        <div className="relative flex-1 max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Buscar por DNI, postulante, reclutador, grupo o campaña..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>
        <div className="text-xs text-slate-400 font-medium">
          Mostrando <strong className="text-emerald-400">{filasFiltradas.length}</strong> de {filas.length} postulantes
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-700/80 shadow-md">
        <table className="w-full text-xs whitespace-nowrap">
          <thead className="bg-slate-800/90 text-slate-300 border-b border-slate-700">
            <tr>
              <th onClick={() => handleSort('documento')} className="px-3 py-2.5 text-left font-semibold cursor-pointer hover:text-white">
                DNI/CE
              </th>
              <th onClick={() => handleSort('nombre_completo')} className="px-3 py-2.5 text-left font-semibold cursor-pointer hover:text-white">
                Apellidos y Nombres
              </th>
              <th onClick={() => handleSort('reclutador')} className="px-3 py-2.5 text-left font-semibold cursor-pointer hover:text-white text-emerald-400">
                Reclutador
              </th>
              <th onClick={() => handleSort('grupo_codigo')} className="px-3 py-2.5 text-left font-semibold cursor-pointer hover:text-white">
                Grupo
              </th>
              <th onClick={() => handleSort('campana')} className="px-3 py-2.5 text-left font-semibold cursor-pointer hover:text-white">
                Campaña
              </th>
              <th onClick={() => handleSort('status_final')} className="px-3 py-2.5 text-center font-semibold cursor-pointer hover:text-white">
                Estado / I-OP
              </th>
              <th onClick={() => handleSort('dia_0_status')} className="px-3 py-2.5 text-center font-semibold cursor-pointer hover:text-white text-cyan-300" title="Día 0 de Inducción (se computa y se paga si asistió)">
                Día 0 (Inducción)
              </th>
              <th onClick={() => handleSort('dias_asistidos')} className="px-3 py-2.5 text-center font-semibold cursor-pointer hover:text-white">
                Días Asist.
              </th>
              <th className="px-3 py-2.5 text-center font-semibold text-rose-300">
                Asist. Perf.
              </th>
              <th onClick={() => handleSort('monto_dias_capa')} className="px-3 py-2.5 text-right font-semibold text-emerald-400 cursor-pointer hover:text-white">
                Pago Días
              </th>
              <th onClick={() => handleSort('bono_bienvenida')} className="px-3 py-2.5 text-right font-semibold text-amber-400 cursor-pointer hover:text-white">
                Bono Bienvenida
              </th>
              <th onClick={() => handleSort('bono_asistencia_perfecta')} className="px-3 py-2.5 text-right font-semibold text-rose-400 cursor-pointer hover:text-white">
                Bono Asist. Perf.
              </th>
              <th onClick={() => handleSort('bono_permanencia_total')} className="px-3 py-2.5 text-right font-semibold text-violet-400 cursor-pointer hover:text-white">
                Bono Permanencia
              </th>
              <th onClick={() => handleSort('total_general')} className="px-3 py-2.5 text-right font-bold text-emerald-300 bg-emerald-950/20 cursor-pointer hover:text-white">
                TOTAL A PAGAR
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800 bg-slate-900/40">
            {filasFiltradas.length === 0 ? (
              <tr>
                <td colSpan={14} className="text-center py-8 text-slate-500">
                  No se encontraron registros de pago con los filtros seleccionados.
                </td>
              </tr>
            ) : (
              filasFiltradas.map((row, idx) => (
                <tr
                  key={row.documento || idx}
                  className={`hover:bg-slate-800/40 transition-colors ${
                    row.es_baja ? 'bg-rose-950/20 opacity-70' : ''
                  }`}
                >
                  <td className="px-3 py-2 font-mono font-bold text-slate-300">{row.documento}</td>
                  <td className="px-3 py-2 text-white font-medium uppercase">
                    {row.nombre_completo}
                    {row.es_agregado && (
                      <span className="ml-2 px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                        AGREGADO
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-slate-300 font-medium text-[11px] truncate max-w-[140px]" title={row.reclutador || '—'}>
                    {row.reclutador || <span className="text-slate-600">—</span>}
                  </td>
                  <td className="px-3 py-2 font-mono text-emerald-400 font-bold">{row.grupo_codigo}</td>
                  <td className="px-3 py-2 text-slate-300">{row.campana}</td>
                  <td className="px-3 py-2 text-center">
                    {row.es_baja ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30">
                        BAJA
                      </span>
                    ) : row.sin_propuesta ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
                        SIN PROP.
                      </span>
                    ) : row.tiene_iop ? (
                      <span
                        className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 inline-flex items-center gap-1"
                        title={row.total_iop > 1 ? `${row.total_iop} registros I-OP registrados en asistencia` : 'Ingreso a Operación confirmado en asistencia'}
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                        I-OP {row.total_iop > 1 ? `(${row.total_iop})` : ''}
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/20 text-blue-400 border border-blue-500/30">
                        {row.status_final || 'CALIFICA'}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {row.asistio_dia_0 ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 inline-flex items-center gap-1">
                        <span>✓</span> Asistió
                      </span>
                    ) : row.es_agregado ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/10 text-rose-400/80 border border-rose-500/20">
                        {row.dia_0_status === 'FALTA' ? 'Falta' : 'N/A'}
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/10 text-rose-400/80 border border-rose-500/20">
                        Falta
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center font-bold text-blue-400">
                    <span className="text-sm font-black">{row.dias_asistidos}</span>
                    {row.asistio_dia_0 && (
                      <span className="block text-[9px] text-cyan-300 font-normal">
                        (incluye Día 0)
                      </span>
                    )}
                    {(row.fecha_primer_iop || row.fecha_ingreso_ojt) && (
                      <span className="block text-[9px] text-indigo-300 font-normal font-mono">
                        {row.tiene_iop ? `I-OP: ${row.fecha_primer_iop}` : `OJT: ${row.fecha_ingreso_ojt}`}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {row.asistencia_perfecta ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                        SÍ (100%)
                      </span>
                    ) : (
                      <span className="text-slate-600 font-mono">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right text-emerald-400 font-semibold">{soles(row.monto_dias_capa)}</td>
                  <td className="px-3 py-2 text-right text-amber-400 font-semibold">{soles(row.bono_bienvenida)}</td>
                  <td className="px-3 py-2 text-right text-rose-400 font-semibold">{soles(row.bono_asistencia_perfecta)}</td>
                  <td className="px-3 py-2 text-right text-violet-400 font-semibold">{soles(row.bono_permanencia_total)}</td>
                  <td className="px-3 py-2 text-right font-black bg-emerald-950/20 text-sm">
                    {row.es_baja && row.total_general <= 0 ? (
                      <span className="text-rose-500 text-[10px] font-bold">EXCLUIDA - BAJA</span>
                    ) : (
                      <span className="text-emerald-300">{soles(row.total_general)}</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────
// Componente principal
// ────────────────────────────────────────────────────────────────────────
export default function PagosCapacitacion({ userProfile }) {
  const [activeTab, setActiveTab] = useState('calcular')

  // Data
  const [configs, setConfigs] = useState([])
  const [gruposDisponibles, setGruposDisponibles] = useState([])
  const [gruposCapacidad, setGruposCapacidad] = useState([])
  const [nominas, setNominas] = useState([])
  const [asistencias, setAsistencias] = useState([])
  const [editingPropuesta, setEditingPropuesta] = useState(null)

  // ── FILTROS DE PAGO (multi; [] = todos) ─────────────────────────────────
  // Mes de Pago (a quién liquidar) + Segmento → Campaña → Código de Grupo
  const [selectedSegmentos, setSelectedSegmentos] = useState([])
  const [selectedCampanas, setSelectedCampanas] = useState([])
  const [selectedGrupos, setSelectedGrupos] = useState([])
  const [selectedMesesPago, setSelectedMesesPago] = useState([])

  // ── MODO DE VISTA ───────────────────────────────────────────────────────
  const [vistaModo, setVistaModo] = useState('matriz') // 'matriz' | 'resumen_postulantes' | 'clasica'

  // Estado
  const [loadingConfigs, setLoadingConfigs] = useState(false)
  const [loadingCalculo, setLoadingCalculo] = useState(false)
  const [errMsg, setErrMsg] = useState(null)
  const [calculoReady, setCalculoReady] = useState(false)
  const [mostrarBajas, setMostrarBajas] = useState(false)

  // ── TRAZABILIDAD / LIQUIDACIONES ──────────────────────────────────────
  const [liquidacionesHistoricas, setLiquidacionesHistoricas] = useState([])
  const [savingLote, setSavingLote] = useState(false)
  const [loteMsg, setLoteMsg] = useState(null)
  const [lotes, setLotes] = useState([])
  const [loadingLotes, setLoadingLotes] = useState(false)
  const [detalleLote, setDetalleLote] = useState(null) // { lote_id, filas }
  const [loadingDetalle, setLoadingDetalle] = useState(false)

  const loadLotes = useCallback(async () => {
    setLoadingLotes(true)
    try {
      const data = await fetchLiquidacionesLotes()
      setLotes(data)
    } catch (e) {
      console.warn('Error cargando lotes:', e)
    } finally {
      setLoadingLotes(false)
    }
  }, [])


  // Cargar grupos, configuraciones iniciales y liquidaciones históricas
  const loadInitialData = useCallback(async () => {
    setLoadingConfigs(true)
    setErrMsg(null)
    try {
      const [cfgs, grps, caps, liqs] = await Promise.all([
        fetchConfigPagosGrupo().catch((e) => { console.warn(e); return [] }),
        fetchGruposPagosDisponibles().catch((e) => { console.warn(e); return [] }),
        fetchCapacidadRysOperativo().catch((e) => { console.warn(e); return [] }),
        fetchLiquidacionesHistoricas().catch(() => []),
      ])
      setConfigs(cfgs || [])
      setGruposCapacidad(caps || [])
      setLiquidacionesHistoricas(liqs || [])

      // Catálogo de filtros: capacidad operativa + grupos pagos (con segmento inferido si falta)
      const merged = [
        ...(Array.isArray(grps) ? grps : []),
        ...(Array.isArray(caps) ? caps : []),
      ].map(mapCapacidadToGrupoFiltro).filter(g => g.grupo_codigo || g.campana || g.segmento)

      const seen = new Set()
      const grpsUnicos = merged.filter(g => {
        const key = `${g.grupo_codigo}|${g.campana}|${g.segmento}|${g.semana_trabajo}|${g.periodo_reclutado}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      setGruposDisponibles(grpsUnicos)
      if (!grpsUnicos.length) {
        console.warn('PagosCapacitacion: catálogo de filtros vacío (capacidad_rys sin filas o sin acceso).')
      }
    } catch (e) {
      console.warn("Error cargando configs iniciales:", e)
      setErrMsg(formatPagosUiError(e, 'No se pudo cargar el catálogo de filtros.'))
    } finally {
      setLoadingConfigs(false)
    }
  }, [])

  useEffect(() => {
    loadInitialData()
  }, [loadInitialData])

  // 1. Segmentos (efectivos)
  const segmentosDisponibles = useMemo(() => {
    const set = new Set()
    gruposDisponibles.forEach((g) => {
      const seg = segmentoDeCapacidad(g)
      if (seg) set.add(seg)
    })
    return Array.from(set).sort()
  }, [gruposDisponibles])

  // 2. Campañas SOLO del/los segmento(s) seleccionado(s)
  const campanasDisponibles = useMemo(() => {
    const set = new Set()
    const segSet = selectedSegmentos.length
      ? new Set(selectedSegmentos.map((s) => String(s).trim().toUpperCase()))
      : null
    gruposDisponibles.forEach((g) => {
      const camp = String(g.campana || '').trim().toUpperCase()
      if (!camp) return
      const seg = segmentoDeCapacidad(g)
      if (segSet && !segSet.has(seg)) return
      set.add(camp)
    })
    return Array.from(set).sort()
  }, [gruposDisponibles, selectedSegmentos])

  // 3. Códigos de Grupo (por segmentos + campañas)
  const codigosGruposDisponibles = useMemo(() => {
    const set = new Set()
    const segSet = selectedSegmentos.length
      ? new Set(selectedSegmentos.map((s) => String(s).trim().toUpperCase()))
      : null
    const campSet = selectedCampanas.length
      ? new Set(selectedCampanas.map((c) => String(c).trim().toUpperCase()))
      : null
    gruposDisponibles.forEach((g) => {
      const seg = segmentoDeCapacidad(g)
      if (segSet && !segSet.has(seg)) return
      const c = String(g.campana || '').trim().toUpperCase()
      if (campSet && !campSet.has(c)) return
      if (g.grupo_codigo) set.add(String(g.grupo_codigo).trim().toUpperCase())
    })
    return Array.from(set).sort()
  }, [gruposDisponibles, selectedSegmentos, selectedCampanas])

  // Seguridad: si cambian opciones, podar selecciones huérfanas
  useEffect(() => {
    if (!selectedCampanas.length) return
    const allowed = new Set(campanasDisponibles)
    const next = selectedCampanas.filter((c) => allowed.has(c))
    if (next.length !== selectedCampanas.length) setSelectedCampanas(next)
  }, [campanasDisponibles, selectedCampanas])

  useEffect(() => {
    if (!selectedGrupos.length) return
    const allowed = new Set(codigosGruposDisponibles)
    const next = selectedGrupos.filter((g) => allowed.has(g))
    if (next.length !== selectedGrupos.length) setSelectedGrupos(next)
  }, [codigosGruposDisponibles, selectedGrupos])

  const handleSegmentosChange = (vals) => {
    const nextSegs = (vals || []).map((s) => String(s).trim().toUpperCase()).filter(Boolean)
    setSelectedSegmentos(nextSegs)
    const segSet = nextSegs.length ? new Set(nextSegs) : null
    const nextCampSet = new Set()
    gruposDisponibles.forEach((g) => {
      const seg = segmentoDeCapacidad(g)
      if (segSet && !segSet.has(seg)) return
      const camp = String(g.campana || '').trim().toUpperCase()
      if (camp) nextCampSet.add(camp)
    })
    // Cascada: dejar solo campañas del segmento; limpiar grupos
    setSelectedCampanas((prev) => prev.filter((c) => nextCampSet.has(c)))
    setSelectedGrupos([])
    setCalculoReady(false)
  }

  const handleCampanasChange = (vals) => {
    const nextCamps = (vals || []).map((c) => String(c).trim().toUpperCase()).filter(Boolean)
    setSelectedCampanas(nextCamps)
    const segSet = selectedSegmentos.length
      ? new Set(selectedSegmentos.map((s) => String(s).trim().toUpperCase()))
      : null
    const campSet = nextCamps.length ? new Set(nextCamps) : null
    const nextGrupoSet = new Set()
    gruposDisponibles.forEach((g) => {
      const seg = segmentoDeCapacidad(g)
      if (segSet && !segSet.has(seg)) return
      const c = String(g.campana || '').trim().toUpperCase()
      if (campSet && !campSet.has(c)) return
      if (g.grupo_codigo) nextGrupoSet.add(String(g.grupo_codigo).trim().toUpperCase())
    })
    setSelectedGrupos((prev) => prev.filter((g) => nextGrupoSet.has(g)))
    setCalculoReady(false)
  }

  const handleGruposChange = (vals) => {
    setSelectedGrupos(vals)
    setCalculoReady(false)
  }

  const handleResetFilters = () => {
    setSelectedSegmentos([])
    setSelectedCampanas([])
    setSelectedGrupos([])
    setSelectedMesesPago([])
    setCalculoReady(false)
  }

  // Ejecutar cálculo: exige alcance (mes/segmento/campaña/grupo) para no saturar Supabase
  const handleCalcular = useCallback(async () => {
    const tieneAlcance = selectedMesesPago.length > 0
      || selectedSegmentos.length > 0
      || selectedCampanas.length > 0
      || selectedGrupos.length > 0

    if (!tieneAlcance) {
      setErrMsg('Elige al menos un Mes a pagar, Segmento, Campaña o Código de Grupo antes de calcular. Así evitamos sobrecargar el sistema.')
      return
    }

    setLoadingCalculo(true)
    setErrMsg(null)
    setLoteMsg(null)
    try {
      // No re-fetch capacidad completa (select *) en cada cálculo: satura Postgres
      const needCaps = !gruposCapacidad.length
      const [cfgs, caps, liqs] = await Promise.all([
        fetchConfigPagosGrupo().catch((e) => { console.warn('configs pagos:', e); return [] }),
        needCaps
          ? fetchCapacidadRysOperativo().catch((e) => { console.warn('capacidad pagos:', e); return [] })
          : Promise.resolve(gruposCapacidad),
        fetchLiquidacionesHistoricas().catch(() => []),
      ])
      const configsSafe = Array.isArray(cfgs) ? cfgs : []
      const capsSafe = Array.isArray(caps) ? caps : []
      setConfigs(configsSafe)
      if (capsSafe.length) setGruposCapacidad(capsSafe)
      setLiquidacionesHistoricas(Array.isArray(liqs) ? liqs : [])

      // Mes a pagar → periodos de propuestas que cubren esos meses (alcance de cohorte sin UI de Periodo)
      let periodosDesdeMes = []
      if (selectedMesesPago.length && configsSafe.length) {
        const want = new Set(selectedMesesPago.map(normMesPagoKey).filter(Boolean))
        const perSet = new Set()
        configsSafe.forEach((c) => {
          const covered = mesesCronogramaDeConfig(c)
          if (![...want].some((m) => covered.has(m))) return
          const p = normMesPagoKey(c.periodoCapa || c.periodo)
          if (p) perSet.add(p)
        })
        periodosDesdeMes = Array.from(perSet)
      }

      // Si solo hay mes y no se resolvieron periodos, exigir otro filtro (evita full-scan)
      if (selectedMesesPago.length && !periodosDesdeMes.length
        && !selectedSegmentos.length && !selectedCampanas.length && !selectedGrupos.length) {
        setErrMsg(`No hay propuestas con cuotas en ${selectedMesesPago.join(', ')}. Elige también Segmento/Campaña o revisa Mes de Afectación en Propuestas.`)
        setCalculoReady(false)
        return
      }

      const noms = await fetchNominasPagosCapacitacion({
        periodo: periodosDesdeMes.length ? periodosDesdeMes : 'TODOS',
        semana: 'TODAS',
        segmento: selectedSegmentos,
        campana: selectedCampanas,
        grupo_codigo: selectedGrupos,
      })
      const nomsSafe = Array.isArray(noms) ? noms : []

      const docs = [...new Set(nomsSafe.map(n => n.documento).filter(Boolean))]
      const asis = await fetchAsistenciasPagos(docs, selectedGrupos).catch((e) => {
        console.warn('asistencias pagos:', e)
        return []
      })
      
      setNominas(nomsSafe)
      setAsistencias(Array.isArray(asis) ? asis : [])
      setCalculoReady(true)

      if (!nomsSafe.length) {
        setErrMsg(selectedMesesPago.length
          ? `No hay personas a pagar en el mes ${selectedMesesPago.join(', ')} con los filtros actuales. Prueba otro mes o amplía Segmento/Campaña.`
          : 'No se encontraron personas con los filtros seleccionados.')
      }
    } catch (e) {
      console.error(e)
      setErrMsg(formatPagosUiError(e, 'Error al calcular pagos de capacitación. Si persiste, el servidor puede estar saturado; espera un minuto e intenta con más filtros.'))
    } finally {
      setLoadingCalculo(false)
    }
  }, [selectedMesesPago, selectedSegmentos, selectedCampanas, selectedGrupos, gruposCapacidad])

  // Motor: sin filtro de cohorte en UI → periodoConsulta TODOS (el mes filtra la matriz)
  const todasFilasCalculadas = useMemo(() => {
    if (!calculoReady) return []
    return calcularPagosCapacitacion(nominas, asistencias, configs, 'TODOS', gruposCapacidad)
  }, [nominas, asistencias, configs, gruposCapacidad, calculoReady])

  const filasCalculadas = todasFilasCalculadas

  // SOLO las personas que califican para pago (excluyendo bajas, registros sin propuesta y sin días de asistencia)
  const filasQueCalifican = useMemo(() => {
    return filasCalculadas.filter(f => !f.es_baja && f.dias_asistidos > 0 && !f.sin_propuesta)
  }, [filasCalculadas])

  // Filas a mostrar en la tabla clásica (solo califican por defecto, o todas si se activa auditar bajas)
  const filasParaTabla = useMemo(() => {
    if (mostrarBajas) return filasCalculadas
    return filasQueCalifican
  }, [filasCalculadas, filasQueCalifican, mostrarBajas])

  const resumen = useMemo(() => generarResumenPagos(filasCalculadas), [filasCalculadas])

  const maxCuotas = useMemo(() =>
    filasQueCalifican.reduce((m, f) => Math.max(m, f.cuotas_permanencia?.length || 0), 0)
  , [filasQueCalifican])

  // ── MATRIZ MULTI-MES DE CRONOGRAMA DE PAGOS (Exacta a Excel con Trazabilidad) ──
  const { matrizFilas: todasMatrizFilas, resumenPorPersona } = useMemo(() => {
    const fuente = mostrarBajas ? filasCalculadas : filasQueCalifican
    if (!fuente.length) return { matrizFilas: [], resumenPorPersona: [] }
    return generarMatrizCronogramaPagos(fuente, liquidacionesHistoricas)
  }, [mostrarBajas, filasCalculadas, filasQueCalifican, liquidacionesHistoricas])

  // Meses a pagar: tras calcular, solo meses con cuotas; antes, desde propuestas/liquidaciones
  const mesesDePagoDisponibles = useMemo(() => {
    const set = new Set()
    const addMes = (raw) => {
      const m = normMesPagoKey(raw)
      if (m) set.add(m)
    }

    if (calculoReady && todasMatrizFilas.length) {
      todasMatrizFilas.forEach((f) => addMes(f.mes_pago))
      return Array.from(set).sort().reverse()
    }

    ;(configs || []).forEach((c) => {
      mesesCronogramaDeConfig(c).forEach((m) => set.add(m))
    })
    ;(liquidacionesHistoricas || []).forEach((l) => addMes(l.mes_pago))
    if (!set.size) {
      const now = new Date()
      for (let i = -2; i <= 4; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
        set.add(`${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`)
      }
    }
    return Array.from(set).sort().reverse()
  }, [calculoReady, configs, liquidacionesHistoricas, todasMatrizFilas])

  // Campañas exactas del segmento en capacidad_rys (para no cruzar segmentos en la matriz)
  const campanasDelSegmentoSel = useMemo(() => {
    if (!selectedSegmentos.length) return null
    const segSet = new Set(selectedSegmentos.map((s) => String(s).trim().toUpperCase()))
    const set = new Set()
    ;(gruposCapacidad || []).forEach((g) => {
      const seg = String(g.segmento || '').trim().toUpperCase()
      if (!segSet.has(seg)) return
      const camp = String(g.campana || '').trim().toUpperCase()
      if (camp) set.add(camp)
    })
    return set
  }, [selectedSegmentos, gruposCapacidad])

  // Matriz = mes + segmento/campaña exactos de capacidad (sin cruce entre segmentos)
  const matrizFilasFiltradas = useMemo(() => {
    let rows = todasMatrizFilas
    if (selectedMesesPago.length) {
      const set = new Set(selectedMesesPago.map(normMesPagoKey).filter(Boolean))
      rows = rows.filter((f) => set.has(normMesPagoKey(f.mes_pago)))
    }
    if (campanasDelSegmentoSel) {
      rows = rows.filter((f) => campanasDelSegmentoSel.has(String(f.campana || '').trim().toUpperCase()))
    }
    if (selectedCampanas.length) {
      const set = new Set(selectedCampanas.map((c) => String(c).trim().toUpperCase()))
      rows = rows.filter((f) => set.has(String(f.campana || '').trim().toUpperCase()))
    }
    if (selectedGrupos.length) {
      const set = new Set(selectedGrupos.map((g) => String(g).trim().toUpperCase()))
      rows = rows.filter((f) => set.has(String(f.grupo_codigo || '').trim().toUpperCase()))
    }
    return rows
  }, [todasMatrizFilas, selectedMesesPago, campanasDelSegmentoSel, selectedCampanas, selectedGrupos])

  const mesFiltroSinMatch = Boolean(
    calculoReady && selectedMesesPago.length && todasMatrizFilas.length && !matrizFilasFiltradas.length,
  )

  useEffect(() => {
    if (!mesFiltroSinMatch) return
    const available = Array.from(
      new Set(todasMatrizFilas.map((f) => normMesPagoKey(f.mes_pago)).filter(Boolean)),
    ).sort().reverse()
    setLoteMsg({
      type: 'error',
      text: `No hay cuotas a pagar en ${selectedMesesPago.join(', ')}. Meses con pago en este cálculo: ${available.slice(0, 8).join(', ')}. Cambia el Mes de Pago o vuelve a Calcular.`,
    })
    const t = setTimeout(() => setLoteMsg(null), 9000)
    return () => clearTimeout(t)
  }, [mesFiltroSinMatch, todasMatrizFilas, selectedMesesPago])

  // Métricas de la matriz filtrada
  const resumenMatriz = useMemo(() => {
    return generarResumenMatrizPagos(matrizFilasFiltradas)
  }, [matrizFilasFiltradas])

  const labelMesesExport = selectedMesesPago.length
    ? selectedMesesPago.join('-')
    : 'Todos'

  // Exportar CSV
  const handleExport = () => {
    if (vistaModo === 'matriz') {
      if (!matrizFilasFiltradas.length) return
      const csv = exportarCSVMatrizPagos(matrizFilasFiltradas)
      const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `Matriz_Pagos_Mes${labelMesesExport}_${new Date().toISOString().split('T')[0]}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } else {
      if (!filasQueCalifican.length) return
      const csv = exportarCSVPagos(filasQueCalifican, maxCuotas)
      const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `Pagos_Capacitacion_${selectedCampanas.length ? selectedCampanas.join('-') : 'Todas'}_${new Date().toISOString().split('T')[0]}.csv`
      a.click()
      URL.revokeObjectURL(url)
    }
  }

  // Cerrar lote de pagos (liquida quirúrgicamente las cuotas PENDIENTES filtradas)
  const handleCerrarLote = useCallback(async () => {
    const cuotasALiquidar = (vistaModo === 'matriz' ? matrizFilasFiltradas : todasMatrizFilas).filter(f => f.estado_pago === 'PENDIENTE')

    if (!cuotasALiquidar.length) {
      alert('No hay cuotas pendientes para liquidar en la selección actual.')
      return
    }

    const descripMes = selectedMesesPago.length
      ? `del mes de pago ${selectedMesesPago.join(', ')}`
      : 'de las cuotas pendientes mostradas'
    const totalSoles = cuotasALiquidar.reduce((s, c) => s + (c.total_mes || c.total_general || 0), 0)

    if (!window.confirm(`¿Deseas cerrar y guardar como PAGADO el lote ${descripMes} para ${cuotasALiquidar.length} cuotas por un total de ${soles(totalSoles)}?\n\nEsta acción registrará las cuotas como liquidadas de forma inmutable.`)) return

    setSavingLote(true)
    setLoteMsg(null)
    try {
      const meta = {
        periodo: '',
        mes_pago: selectedMesesPago.length === 1 ? selectedMesesPago[0] : null,
        semana_trabajo: null,
        segmento: selectedSegmentos.length === 1 ? selectedSegmentos[0] : (selectedSegmentos.length ? selectedSegmentos.join(', ') : null),
        campana: selectedCampanas.length === 1 ? selectedCampanas[0] : (selectedCampanas.length ? selectedCampanas.join(', ') : null),
        grupo_codigo: selectedGrupos.length === 1 ? selectedGrupos[0] : (selectedGrupos.length ? selectedGrupos.join(', ') : null),
        cerrado_por: userProfile?.username || userProfile?.email || null,
        notas_lote: selectedMesesPago.length
          ? `Liquidación Mes ${selectedMesesPago.join(', ')}`
          : null,
      }
      const lote_id = await saveLiquidacionPagos(cuotasALiquidar, meta)
      setLoteMsg({ type: 'success', text: `✓ Lote cerrado correctamente (${cuotasALiquidar.length} cuotas liquidadas). ID: ${lote_id.substring(0, 8)}...` })

      // Recargar histórico para que la matriz se actualice inmediatamente a PAGADO
      const updatedLiqs = await fetchLiquidacionesHistoricas().catch(() => [])
      setLiquidacionesHistoricas(updatedLiqs)
      loadLotes()

      setTimeout(() => setLoteMsg(null), 8000)
    } catch (e) {
      setLoteMsg({ type: 'error', text: `Error al guardar lote: ${e.message}` })
    } finally {
      setSavingLote(false)
    }
  }, [vistaModo, matrizFilasFiltradas, todasMatrizFilas, selectedMesesPago, selectedSegmentos, selectedCampanas, selectedGrupos, userProfile, loadLotes])

  // Ver detalle de lote histórico
  const handleVerDetalleLote = useCallback(async (lote_id) => {
    setDetalleLote({ lote_id, filas: [] })
    setLoadingDetalle(true)
    try {
      const filas = await fetchLiquidacionDetalle(lote_id)
      setDetalleLote({ lote_id, filas })
    } catch (e) {
      console.error('Error cargando detalle de lote:', e)
      setLoteMsg({ type: 'error', text: 'Error al cargar detalle del lote' })
    } finally {
      setLoadingDetalle(false)
    }
  }, [])

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)] flex items-center gap-2">
            <BanknoteIcon className="text-[var(--accent)]" />
            Pagos de Capacitación
          </h1>
          <p className="text-[var(--text-muted)] text-sm mt-1">
            Cruce de asistencias efectivas, pago por día y bonos (Bienvenida, Asistencia Perfecta y Permanencia).
          </p>
        </div>

        {/* Tabs */}
        <div className="flex bg-[var(--bg-surface)] p-1 rounded-lg border border-[var(--border-normal)] flex-wrap gap-1">
          {[
            { id: 'calcular', label: 'Calcular Pagos', icon: Calculator },
            { id: 'configurar', label: 'Propuestas de Grupos', icon: Settings2 },
            { id: 'historico', label: 'Histórico de Lotes', icon: History },
            { id: 'conciliacion', label: 'Validación Operaciones (VS)', icon: ShieldCheck },
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => {
                setActiveTab(id)
                if (id === 'historico') loadLotes()
              }}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer ${
                activeTab === id
                  ? 'bg-[var(--accent)] text-white shadow-sm font-bold'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]'
              }`}
            >
              <Icon size={15} /> {label}
            </button>
          ))}
        </div>
      </div>

      {errMsg && (
        <div className="flex items-start gap-2 text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3 text-sm max-h-28 overflow-auto">
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          <span className="break-words min-w-0">{typeof errMsg === 'string' ? errMsg : formatPagosUiError(errMsg)}</span>
          <button
            type="button"
            onClick={() => setErrMsg(null)}
            className="shrink-0 ml-auto text-rose-400/70 hover:text-rose-300 cursor-pointer"
            aria-label="Cerrar error"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {loteMsg && activeTab === 'calcular' && (
        <div className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm border ${
          loteMsg.type === 'success'
            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
            : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
        }`}>
          <CheckCircle2 size={16} /> {loteMsg.text}
        </div>
      )}

      {/* ── TAB: CONFIGURAR PROPUESTAS ─────────────────────────────────── */}
      {activeTab === 'configurar' && (
        <div className="space-y-5">
          <ConfigGrupoForm
            gruposCapacidad={gruposCapacidad}
            configsExistentes={configs}
            onSaved={() => {
              setEditingPropuesta(null)
              loadInitialData()
            }}
            userProfile={userProfile}
            editingPropuesta={editingPropuesta}
            onCancelEdit={() => setEditingPropuesta(null)}
          />
          <div>
            <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-3 flex items-center gap-2">
              <Settings2 size={14} className="text-emerald-400" /> Tarifas y Bonos por Grupo (Propuestas Integradas en Base de Datos)
              {loadingConfigs && <RefreshCw size={12} className="animate-spin text-emerald-400" />}
            </h3>
            <TablaConfigs 
              configs={configs} 
              onDelete={deleteConfigPagoGrupo} 
              onEdit={(prop) => setEditingPropuesta(prop)}
              onRefresh={loadInitialData} 
            />
          </div>
        </div>
      )}

      {/* ── TAB: CALCULAR PAGOS ────────────────────────────────────────── */}
      {activeTab === 'calcular' && (
        <div className="space-y-5">
          <div data-filter-bar className="bg-[var(--bg-surface)] border border-[var(--border-normal)] rounded-xl p-4 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider">
                <Filter size={14} className="text-[var(--accent)]" />
                Filtros de Consulta
              </div>
              {(selectedSegmentos.length > 0 || selectedCampanas.length > 0 || selectedGrupos.length > 0 || selectedMesesPago.length > 0) && (
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="flex items-center gap-1 text-xs text-[var(--text-muted)] hover:text-rose-400 transition-colors cursor-pointer"
                >
                  <RotateCcw size={12} /> Limpiar filtros
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {/* Mes de Pago — filtro principal del analista */}
              <div className="flex flex-col gap-1">
                <label className={`${LABEL_GEA} flex items-center gap-1`}>
                  <Clock size={12} className="text-amber-400" /> Mes a pagar
                </label>
                <FilterMultiSelect
                  options={mesesDePagoDisponibles}
                  values={selectedMesesPago}
                  onChange={(vals) => { setSelectedMesesPago(vals); setCalculoReady(false) }}
                  loading={loadingConfigs}
                  allLabel="TODOS LOS MESES"
                  pluralLabel="meses"
                  emptyHint="Sin meses de pago"
                  mono
                />
              </div>

              {/* Segmento */}
              <div className="flex flex-col gap-1">
                <label className={LABEL_GEA}>Segmento</label>
                <FilterMultiSelect
                  options={segmentosDisponibles}
                  values={selectedSegmentos}
                  onChange={handleSegmentosChange}
                  loading={loadingConfigs}
                  allLabel="TODOS"
                  pluralLabel="segmentos"
                  emptyHint="Sin segmentos"
                />
              </div>

              {/* Campaña (depende del segmento) */}
              <div className="flex flex-col gap-1">
                <label className={LABEL_GEA}>
                  Campaña
                  {selectedSegmentos.length > 0 && (
                    <span className="ml-1 font-medium normal-case tracking-normal text-[var(--text-muted)]">
                      ({campanasDisponibles.length})
                    </span>
                  )}
                </label>
                <FilterMultiSelect
                  key={`campanas-${selectedSegmentos.join('|') || 'all'}`}
                  options={campanasDisponibles}
                  values={selectedCampanas}
                  onChange={handleCampanasChange}
                  loading={loadingConfigs}
                  disabled={loadingConfigs}
                  allLabel={selectedSegmentos.length ? 'TODAS DEL SEGMENTO' : 'TODAS'}
                  pluralLabel="campañas"
                  emptyHint={selectedSegmentos.length ? 'Sin campañas en ese segmento' : 'Sin campañas'}
                />
              </div>

              {/* Código de Grupo */}
              <div className="flex flex-col gap-1">
                <label className={LABEL_GEA}>Código de Grupo</label>
                <FilterMultiSelect
                  key={`grupos-${selectedSegmentos.join('|')}-${selectedCampanas.join('|')}`}
                  options={codigosGruposDisponibles}
                  values={selectedGrupos}
                  onChange={handleGruposChange}
                  loading={loadingConfigs}
                  allLabel="TODOS"
                  pluralLabel="grupos"
                  emptyHint="Sin grupos"
                  mono
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[var(--border-subtle)]">
              <div className="text-xs text-[var(--text-muted)]">
                Elige <strong className="text-amber-400">Mes a pagar</strong> y/o Segmento/Campaña/Grupo, luego <strong className="text-[var(--accent)]">Calcular Pagos</strong>. Sin filtros el sistema no calcula (protege el servidor).
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCalcular}
                  disabled={loadingCalculo}
                  className="flex items-center gap-2 px-5 py-2 bg-[var(--accent)] hover:opacity-90 disabled:opacity-50 text-white text-xs font-bold rounded-lg transition-all cursor-pointer"
                >
                  {loadingCalculo ? <RefreshCw size={14} className="animate-spin" /> : <Calculator size={14} />}
                  Calcular Pagos
                </button>

                {calculoReady && filasQueCalifican.length > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={handleExport}
                      className="flex items-center gap-2 px-4 py-2 bg-[var(--bg-elevated)] hover:opacity-90 border border-[var(--border-normal)] text-[var(--text-primary)] text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                    >
                      <Download size={14} /> Exportar CSV
                    </button>
                    <button
                      type="button"
                      onClick={handleCerrarLote}
                      disabled={savingLote}
                      className="flex items-center gap-2 px-4 py-2 bg-violet-700 hover:bg-violet-600 disabled:opacity-50 text-white text-xs font-bold rounded-lg transition-all cursor-pointer"
                    >
                      {savingLote ? <Loader2 size={14} className="animate-spin" /> : <Lock size={14} />}
                      Cerrar Lote de Pagos
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Selector de modo de vista (matriz intacta) */}
          {calculoReady && filasQueCalifican.length > 0 && (
            <div className="bg-[var(--bg-base)] border border-[var(--border-normal)] rounded-xl p-3 flex flex-wrap items-center justify-between gap-4">
              <div className="flex bg-[var(--bg-surface)] p-1 rounded-lg border border-[var(--border-normal)] gap-1 flex-wrap">
                <button
                  type="button"
                  onClick={() => setVistaModo('matriz')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer ${
                    vistaModo === 'matriz'
                      ? 'bg-[var(--accent)] text-white shadow-sm'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]'
                  }`}
                >
                  <FileSpreadsheet size={13} /> Matriz de Pagos (Mes a Mes)
                </button>
                <button
                  type="button"
                  onClick={() => setVistaModo('resumen_postulantes')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer ${
                    vistaModo === 'resumen_postulantes'
                      ? 'bg-cyan-600 text-white shadow-sm'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]'
                  }`}
                >
                  <Users size={13} /> Trazabilidad por Postulante
                </button>
                <button
                  type="button"
                  onClick={() => setVistaModo('clasica')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer ${
                    vistaModo === 'clasica'
                      ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] shadow-sm border border-[var(--border-normal)]'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]'
                  }`}
                >
                  <Layers size={13} /> Vista Consolidada
                </button>
              </div>
            </div>
          )}

          {/* KPIs de resumen dinámicos según el modo */}
          {calculoReady && (
            vistaModo === 'matriz' ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                <KpiCard icon={Users} label="Cuotas en Vista" value={resumenMatriz.total_cuotas} sub={`${resumenPorPersona.length} personas`} color="blue" />
                <KpiCard icon={DollarSign} label="Total Programado" value={soles(resumenMatriz.total_programado)} color="cyan" />
                <KpiCard icon={CheckCircle2} label="Total Pagado" value={soles(resumenMatriz.total_pagado)} sub={`${resumenMatriz.cuotas_pagadas} cuotas liquidadas`} color="green" />
                <KpiCard icon={Clock} label="Saldo Pendiente" value={soles(resumenMatriz.total_pendiente)} sub={`${resumenMatriz.cuotas_pendientes} cuotas por pagar`} color="amber" highlight />
                <KpiCard icon={BanknoteIcon} label="Importe Capa" value={soles(resumenMatriz.total_capa)} color="emerald" />
                <KpiCard icon={TrendingUp} label="Total Bonos" value={soles(resumenMatriz.total_bienvenida + resumenMatriz.total_permanencia + resumenMatriz.total_asistencia_perfecta)} color="violet" />
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                <KpiCard icon={Users} label="Califican" value={resumen.personas_calificadas} sub={resumen.personas_bajas > 0 ? `${resumen.personas_bajas} bajas excluidas` : undefined} color="blue" />
                <KpiCard icon={DollarSign} label="Total Días Capa" value={soles(resumen.total_monto_dias)} color="green" />
                <KpiCard icon={TrendingUp} label="Bono Bienvenida" value={soles(resumen.total_bono_bienvenida)} color="amber" />
                <KpiCard icon={Star} label="Asist. Perfecta" value={soles(resumen.total_bono_asistencia_perfecta)} sub={`${resumen.personas_asistencia_perfecta} personas`} color="rose" />
                <KpiCard icon={BanknoteIcon} label="Permanencia" value={soles(resumen.total_bono_permanencia)} color="violet" />
                <KpiCard icon={BanknoteIcon} label="TOTAL GENERAL" value={soles(resumen.total_general)} color="green" highlight />
              </div>
            )
          )}

          {/* Tablas según modo seleccionado */}
          {calculoReady && (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wide flex items-center gap-2">
                  <CheckCircle2 size={14} className="text-emerald-400" />
                  {vistaModo === 'matriz' ? (
                    <span>Matriz Oficial de Cronograma de Pagos por Mes ({matrizFilasFiltradas.length} cuotas)</span>
                  ) : vistaModo === 'resumen_postulantes' ? (
                    <span>Resumen y Trazabilidad por Postulante ({resumenPorPersona.length} personas)</span>
                  ) : (
                    <span>{filasQueCalifican.length} personas califican para pago</span>
                  )}
                  {resumen.personas_bajas > 0 && (
                    <button
                      type="button"
                      onClick={() => setMostrarBajas(prev => !prev)}
                      className={`ml-2 px-2.5 py-0.5 rounded-full text-[10px] font-bold transition-all cursor-pointer border ${
                        mostrarBajas
                          ? 'bg-rose-500 text-white border-rose-400 shadow-sm'
                          : 'bg-rose-500/20 text-rose-400 border-rose-500/30 hover:bg-rose-500/30'
                      }`}
                      title="Haz clic para ver u ocultar las personas excluidas por baja"
                    >
                      {resumen.personas_bajas} excluidas por baja {mostrarBajas ? '(Mostrando todas)' : '(Clic para auditar)'}
                    </button>
                  )}
                </h3>
              </div>

              {vistaModo === 'matriz' ? (
                <TablaMatrizPagos filas={matrizFilasFiltradas} />
              ) : vistaModo === 'resumen_postulantes' ? (
                <TablaResumenPostulantes personas={resumenPorPersona} />
              ) : (
                <TablaPagos filas={filasParaTabla} maxCuotas={maxCuotas} />
              )}
            </div>
          )}

          {!calculoReady && (
            <div className="text-center py-20 text-[var(--text-muted)] bg-[var(--bg-surface)]/50 rounded-2xl border border-[var(--border-normal)] border-dashed">
              <BanknoteIcon size={48} className="mx-auto mb-4 opacity-30 text-[var(--accent)]" />
              <p className="font-semibold text-[var(--text-primary)]">Selecciona los filtros y presiona Calcular Pagos</p>
              <p className="text-xs mt-2 max-w-md mx-auto text-[var(--text-muted)]">
                El sistema cruzará las marcaciones efectivas de asistencia con la tarifa y los bonos de cada propuesta por grupo. La matriz oficial conservará todas sus columnas.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── TAB: HISTÓRICO DE LOTES ─────────────────────────────────────── */}
      {activeTab === 'historico' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
              <History size={16} className="text-violet-400" />
              Lotes de Pago Cerrados
            </h3>
            <button
              onClick={loadLotes}
              disabled={loadingLotes}
              className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-xs rounded-lg transition-colors"
            >
              {loadingLotes ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
              Recargar
            </button>
          </div>

          {loteMsg && (
            <div className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm border ${
              loteMsg.type === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
            }`}>
              <CheckCircle2 size={16} /> {loteMsg.text}
            </div>
          )}

          {loadingLotes ? (
            <div className="flex items-center justify-center py-16 text-slate-500">
              <Loader2 size={32} className="animate-spin mr-3" /> Cargando lotes históricos...
            </div>
          ) : lotes.length === 0 ? (
            <div className="text-center py-20 text-slate-500 bg-slate-900/30 rounded-2xl border border-slate-800/80">
              <History size={48} className="mx-auto mb-4 opacity-20 text-violet-400" />
              <p className="font-semibold text-slate-300">Aún no hay lotes cerrados</p>
              <p className="text-xs mt-2">Calcula los pagos y usa el botón <strong className="text-violet-400">Cerrar Lote de Pagos</strong> para guardar un snapshot histórico.</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-700/60 bg-slate-900/50">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="border-b border-slate-700/60 bg-slate-800/60">
                    {['Fecha Cierre', 'Periodo', 'Sem.', 'Segmento', 'Campaña', 'Grupo', 'Cerrado por', 'Personas', 'Total S/.', 'Notas', 'Acciones'].map(h => (
                      <th key={h} className="px-3 py-2.5 font-bold text-slate-400 uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lotes.map((l, i) => (
                    <tr key={l.lote_id} className={`border-b border-slate-800/60 hover:bg-slate-800/40 transition-colors ${i % 2 === 0 ? '' : 'bg-slate-900/30'}`}>
                      <td className="px-3 py-2.5 whitespace-nowrap text-slate-300">
                        {l.cerrado_at ? new Date(l.cerrado_at).toLocaleString('es-PE', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '-'}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-slate-300">{l.periodo || '-'}</td>
                      <td className="px-3 py-2.5 text-center">{l.semana_trabajo ?? '-'}</td>
                      <td className="px-3 py-2.5">{l.segmento || 'TODOS'}</td>
                      <td className="px-3 py-2.5">{l.campana || 'TODAS'}</td>
                      <td className="px-3 py-2.5 font-mono">{l.grupo_codigo || 'TODOS'}</td>
                      <td className="px-3 py-2.5 text-violet-300">{l.cerrado_por || '-'}</td>
                      <td className="px-3 py-2.5 text-center font-bold text-blue-300">{l.total_personas}</td>
                      <td className="px-3 py-2.5 text-right font-bold text-emerald-400">{soles(l.total_general)}</td>
                      <td className="px-3 py-2.5 text-slate-400 max-w-[200px] truncate">{l.notas_lote || '-'}</td>
                      <td className="px-3 py-2.5">
                        <button
                          onClick={() => handleVerDetalleLote(l.lote_id)}
                          className="flex items-center gap-1 px-2.5 py-1 bg-slate-700 hover:bg-violet-700 text-slate-300 hover:text-white rounded-lg text-xs transition-colors"
                        >
                          <Eye size={12} /> Ver detalle
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Modal de detalle de lote */}
          {detalleLote && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
              <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-5xl max-h-[85vh] flex flex-col">
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700/60">
                  <div>
                    <h3 className="font-bold text-white flex items-center gap-2">
                      <Lock size={16} className="text-violet-400" />
                      Detalle del Lote
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5 font-mono">{detalleLote.lote_id}</p>
                  </div>
                  <button onClick={() => setDetalleLote(null)} className="text-slate-400 hover:text-white transition-colors">
                    <X size={20} />
                  </button>
                </div>
                <div className="overflow-auto flex-1 p-4">
                  {loadingDetalle ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 size={28} className="animate-spin text-violet-400" />
                    </div>
                  ) : (
                    <table className="w-full text-xs text-left">
                      <thead>
                        <tr className="border-b border-slate-700/60 bg-slate-800/60">
                          {['DNI', 'Nombre', 'Grupo', 'Campaña', 'Días', 'A.P.', 'Días Capa', 'Bono Bvda', 'Bono A.P.', 'Perm. Total', 'Cuota Nº', 'Cuota S/.', 'TOTAL'].map(h => (
                            <th key={h} className="px-2 py-2 font-bold text-slate-400 uppercase tracking-wide whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {detalleLote.filas.map((f, i) => (
                          <tr key={i} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                            <td className="px-2 py-1.5 font-mono text-slate-300">{f.documento}</td>
                            <td className="px-2 py-1.5 text-slate-200">{f.nombre_completo}</td>
                            <td className="px-2 py-1.5 font-mono text-xs">{f.grupo_codigo}</td>
                            <td className="px-2 py-1.5">{f.campana}</td>
                            <td className="px-2 py-1.5 text-center">{f.dias_asistidos}</td>
                            <td className="px-2 py-1.5 text-center">{f.asistencia_perfecta ? '✓' : ''}</td>
                            <td className="px-2 py-1.5 text-right text-green-400">{soles(f.monto_dias_capa)}</td>
                            <td className="px-2 py-1.5 text-right text-amber-400">{soles(f.bono_bienvenida)}</td>
                            <td className="px-2 py-1.5 text-right text-rose-400">{soles(f.bono_asistencia_perfecta)}</td>
                            <td className="px-2 py-1.5 text-right text-violet-400">{soles(f.bono_permanencia_total)}</td>
                            <td className="px-2 py-1.5 text-center">{f.cuota_numero}</td>
                            <td className="px-2 py-1.5 text-right">{soles(f.monto_cuota_permanencia)}</td>
                            <td className="px-2 py-1.5 text-right font-bold text-emerald-400">{soles(f.total_general)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── TAB: CONCILIACIÓN Y VALIDACIÓN CON OPERACIONES (VS) ──────── */}
      {activeTab === 'conciliacion' && (
        <ConciliacionVariablesOperacion userProfile={userProfile} />
      )}
    </div>
  )
}
