import React, { useState, useEffect, useMemo, useCallback } from 'react'
import {
  BanknoteIcon, Settings2, Calculator, Download, RefreshCw,
  CheckCircle2, AlertCircle, ChevronDown, ChevronUp, Star,
  TrendingUp, Users, DollarSign, Plus, Pencil, Trash2, Save, X,
  Filter, Search, RotateCcw, Lock, History, Eye, Loader2
} from 'lucide-react'
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
} from '../lib/dataService'
import {
  calcularPagosCapacitacion,
  generarResumenPagos,
  exportarCSVPagos,
} from '../lib/pagosCapacitacionEngine'

// ────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────
const soles = v => `S/. ${Number(v || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

// ────────────────────────────────────────────────────────────────────────
// Sub-componente: Tarjeta de resumen KPI
// ────────────────────────────────────────────────────────────────────────
function KpiCard({ icon: Icon, label, value, sub, color = 'blue', highlight = false }) {
  const colors = {
    blue: 'from-blue-500/20 to-blue-600/10 border-blue-500/30 text-blue-400',
    green: 'from-emerald-500/20 to-emerald-600/10 border-emerald-500/30 text-emerald-400',
    amber: 'from-amber-500/20 to-amber-600/10 border-amber-500/30 text-amber-400',
    violet: 'from-violet-500/20 to-violet-600/10 border-violet-500/30 text-violet-400',
    rose: 'from-rose-500/20 to-rose-600/10 border-rose-500/30 text-rose-400',
  }
  const cls = colors[color] || colors.blue
  return (
    <div className={`rounded-xl border bg-gradient-to-br ${cls} p-4 flex flex-col gap-1 ${highlight ? 'ring-2 ring-offset-1 ring-offset-slate-900 ring-current shadow-lg shadow-emerald-950/40' : ''}`}>
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide opacity-80">
        <Icon size={14} />
        {label}
      </div>
      <div className="text-2xl font-bold text-white mt-1">{value}</div>
      {sub && <div className="text-xs opacity-60">{sub}</div>}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────
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

  // Helper para normalizar semana
  const normalizarSemana = (val) => {
    if (!val) return ''
    const str = String(val).trim().toUpperCase()
    const num = str.replace(/\D/g, '')
    return num ? `SEM ${num}` : str
  }

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
      const p = String(g.periodo || '').trim().toUpperCase()
      if (p === pSel) {
        const s = normalizarSemana(g.semana_label || (g.semana_trabajo ? `SEM ${g.semana_trabajo}` : '') || g.semana)
        if (s) set.add(s)
      }
    })
    if (form.semana) set.add(normalizarSemana(form.semana))
    return Array.from(set).sort((a, b) => {
      const na = parseInt(a.replace(/\D/g, '')) || 0
      const nb = parseInt(b.replace(/\D/g, '')) || 0
      return na - nb
    })
  }, [gruposCapacidad, form.periodoCapa, form.semana])

  // 3. Campañas filtradas por Periodo + Semana
  const campanasCapaDisponibles = useMemo(() => {
    if (!form.periodoCapa || !form.semana) return []
    const pSel = String(form.periodoCapa).trim().toUpperCase()
    const sSel = normalizarSemana(form.semana)
    const set = new Set()
    gruposCapacidad.forEach(g => {
      const p = String(g.periodo || '').trim().toUpperCase()
      const s = normalizarSemana(g.semana_label || (g.semana_trabajo ? `SEM ${g.semana_trabajo}` : '') || g.semana)
      if (p === pSel && s === sSel && g.campana) {
        set.add(String(g.campana).trim().toUpperCase())
      }
    })
    if (form.campana) set.add(String(form.campana).trim().toUpperCase())
    return Array.from(set).sort()
  }, [gruposCapacidad, form.periodoCapa, form.semana, form.campana])

  // 4. Grupos de Capacidad filtrados por Periodo + Semana + Campaña
  const gruposCapaDisponibles = useMemo(() => {
    if (!form.periodoCapa || !form.semana || !form.campana) return []
    const pSel = String(form.periodoCapa).trim().toUpperCase()
    const sSel = normalizarSemana(form.semana)
    const cSel = String(form.campana).trim().toUpperCase()
    const set = new Set()
    gruposCapacidad.forEach(g => {
      const p = String(g.periodo || '').trim().toUpperCase()
      const s = normalizarSemana(g.semana_label || (g.semana_trabajo ? `SEM ${g.semana_trabajo}` : '') || g.semana)
      const c = String(g.campana || '').trim().toUpperCase()
      if (p === pSel && s === sSel && c === cSel && g.codigo) {
        set.add(String(g.codigo).trim().toUpperCase())
      }
    })
    if (form.grupo) set.add(String(form.grupo).trim().toUpperCase())
    return Array.from(set).sort()
  }, [gruposCapacidad, form.periodoCapa, form.semana, form.campana, form.grupo])

  // Handlers de selección jerárquica
  const handlePeriodoSelect = (e) => {
    const val = e.target.value
    setForm(prev => ({
      ...prev,
      periodoCapa: val,
      semana: '',
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

    // 1. Si ya existe una propuesta guardada en configsExistentes, cargarla directamente
    const configExist = configsExistentes.find(c => 
      (c.grupo && c.grupo.toUpperCase() === grpCode.toUpperCase()) || 
      (c.grupo_codigo && c.grupo_codigo.toUpperCase() === grpCode.toUpperCase())
    )

    if (configExist) {
      setForm({
        ...defaultForm,
        ...configExist,
        grupo: configExist.grupo || configExist.grupo_codigo || grpCode,
        periodoCapa: configExist.periodoCapa || configExist.periodo || form.periodoCapa,
        semana: configExist.semana || configExist.semana_trabajo || form.semana,
        campana: configExist.campana || form.campana,
      })
      setSuccessMsg(`ℹ Propuesta existente cargada para ${grpCode}.`)
      setTimeout(() => setSuccessMsg(null), 3500)
      return
    }

    // 2. Si es una propuesta nueva, autocompletar con los datos oficiales de capacidad_rys
    const capInfo = gruposCapacidad.find(g => 
      String(g.codigo || '').toUpperCase() === grpCode.toUpperCase()
    )

    const camp = capInfo?.campana || form.campana || ''
    const codSugerido = `${camp}${grpCode}`.replace(/\s+/g, '')

    setForm(prev => ({
      ...prev,
      id: null,
      grupo: grpCode,
      segmento: capInfo?.segmento || prev.segmento || '',
      modalidad: (capInfo?.modalidad || 'REMOTO').toUpperCase(),
      condicionLaboral: (capInfo?.condicion || 'FULL TIME').toUpperCase(),
      cod: codSugerido,
      fechaInicioCapa: capInfo?.fecha_registro || capInfo?.fecha_dia_1 || prev.fechaInicioCapa || '',
      ingresoOperacion: capInfo?.fecha_ingreso_op || prev.ingresoOperacion || '',
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 bg-slate-950/60 p-3.5 rounded-xl border border-slate-800/80">
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

          {/* 3. Campaña */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-slate-300 uppercase flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400"></span> 3. Campaña
            </label>
            <select
              value={form.campana}
              onChange={handleCampanaSelect}
              disabled={!form.semana}
              className="bg-slate-800 border border-slate-700 disabled:opacity-40 rounded-lg px-2.5 py-2 text-xs text-white font-medium focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value="">-- Seleccionar Campaña --</option>
              {campanasCapaDisponibles.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* 4. Grupo */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-amber-400 uppercase flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span> 4. Grupo de Capacitación
            </label>
            {manualInput ? (
              <input
                type="text"
                value={form.grupo}
                onChange={e => handleFieldChange('grupo', e.target.value.toUpperCase())}
                placeholder="Ej: GPE-2025-029"
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Segmento */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-slate-400 uppercase">Segmento</label>
            <input
              type="text"
              value={form.segmento}
              onChange={e => handleFieldChange('segmento', e.target.value)}
              placeholder="Ej: CLARO PERU RETENCIONES"
              className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>

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
              placeholder="Ej: 4/7/25 ó 2025-07-04"
              className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-cyan-500 font-mono"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-slate-400 uppercase">Ingreso a la Operación</label>
            <input
              type="text"
              value={form.ingresoOperacion}
              onChange={e => handleFieldChange('ingresoOperacion', e.target.value)}
              placeholder="Ej: 19/07/2025 ó 2025-07-19"
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
                  <tr key={c.id || grpCode} className="hover:bg-slate-800/40 transition-colors">
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
                    <td className="px-2.5 py-2 font-mono text-center text-slate-300 text-[11px] border-r border-slate-800/60">{c.fechaInicioCapa || '—'}</td>
                    <td className="px-2.5 py-2 font-mono text-center text-slate-300 text-[11px] border-r border-slate-800/60">{c.ingresoOperacion || '—'}</td>
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
// Sub-componente: Tabla de pagos calculados
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
        (f.grupo_codigo || '').toLowerCase().includes(q) ||
        (f.campana || '').toLowerCase().includes(q)
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
            placeholder="Buscar por DNI, postulante, grupo o campaña..."
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
              <th onClick={() => handleSort('grupo_codigo')} className="px-3 py-2.5 text-left font-semibold cursor-pointer hover:text-white">
                Grupo
              </th>
              <th onClick={() => handleSort('campana')} className="px-3 py-2.5 text-left font-semibold cursor-pointer hover:text-white">
                Campaña
              </th>
              <th className="px-3 py-2.5 text-center font-semibold">
                Estado
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
                <td colSpan={11} className="text-center py-8 text-slate-500">
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
                  <td className="px-3 py-2 text-white font-medium uppercase">{row.nombre_completo}</td>
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
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                        CALIFICA
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center font-bold text-blue-400">
                    {row.dias_asistidos}
                    {row.fecha_ingreso_ojt && (
                      <span className="block text-[9px] text-indigo-300 font-normal font-mono">
                        OJT: {row.fecha_ingreso_ojt}
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
                    {row.es_baja ? (
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

  // ── 5 FILTROS EN CASCADA ──────────────────────────────────────────────
  // 1. Periodo -> 2. Semana -> 3. Segmento -> 4. Campaña -> 5. Código de Grupo
  const [selectedPeriodo, setSelectedPeriodo] = useState('TODOS')
  const [selectedSemana, setSelectedSemana] = useState('TODAS')
  const [selectedSegmento, setSelectedSegmento] = useState('TODOS')
  const [selectedCampana, setSelectedCampana] = useState('TODAS')
  const [selectedGrupo, setSelectedGrupo] = useState('TODOS')

  // Estado
  const [loadingConfigs, setLoadingConfigs] = useState(false)
  const [loadingCalculo, setLoadingCalculo] = useState(false)
  const [errMsg, setErrMsg] = useState(null)
  const [calculoReady, setCalculoReady] = useState(false)

  // ── TRAZABILIDAD / LIQUIDACIONES ──────────────────────────────────────
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


  // Cargar grupos y configuraciones iniciales
  const loadInitialData = useCallback(async () => {
    setLoadingConfigs(true)
    setErrMsg(null)
    try {
      const [cfgs, grps, caps] = await Promise.all([
        fetchConfigPagosGrupo(),
        fetchGruposPagosDisponibles(),
        fetchCapacidadRysOperativo(),
      ])
      setConfigs(cfgs)
      setGruposCapacidad(caps || [])
      // Deduplicar por grupo_codigo+campana+segmento+semana para evitar filas repetidas
      const seen = new Set()
      const grpsUnicos = grps.filter(g => {
        const key = `${g.grupo_codigo}|${g.campana}|${g.segmento}|${g.semana_trabajo}|${g.periodo_reclutado}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      setGruposDisponibles(grpsUnicos)
    } catch (e) {
      console.warn("Error cargando configs iniciales:", e)
    } finally {
      setLoadingConfigs(false)
    }
  }, [])

  useEffect(() => {
    loadInitialData()
  }, [loadInitialData])

  // Helper para normalizar semana
  const formatSem = (val) => {
    if (!val) return ''
    const str = String(val).trim().toUpperCase()
    const num = str.replace(/\D/g, '')
    return num ? `SEM ${num}` : str
  }

  // 1. Periodos
  const periodosDisponibles = useMemo(() => {
    const set = new Set()
    gruposDisponibles.forEach(g => {
      const p = g.periodo_reclutado || g.periodo
      if (p) set.add(String(p).trim().toUpperCase())
    })
    return ['TODOS', ...Array.from(set).sort().reverse()]
  }, [gruposDisponibles])

  // 2. Semanas (filtradas por Periodo)
  const semanasDisponibles = useMemo(() => {
    const set = new Set()
    gruposDisponibles.forEach(g => {
      const p = (g.periodo_reclutado || g.periodo || '').toUpperCase().trim()
      if (selectedPeriodo !== 'TODOS' && p !== selectedPeriodo) return

      const s = formatSem(g.semana_trabajo || g.semana_label || g.semana)
      if (s) set.add(s)
    })
    return ['TODAS', ...Array.from(set).sort((a, b) => {
      const na = parseInt(a.replace(/\D/g, '')) || 0
      const nb = parseInt(b.replace(/\D/g, '')) || 0
      return na - nb
    })]
  }, [gruposDisponibles, selectedPeriodo])

  // 3. Segmentos (filtrados por Periodo + Semana)
  const segmentosDisponibles = useMemo(() => {
    const set = new Set()
    gruposDisponibles.forEach(g => {
      const p = (g.periodo_reclutado || g.periodo || '').toUpperCase().trim()
      if (selectedPeriodo !== 'TODOS' && p !== selectedPeriodo) return

      const s = formatSem(g.semana_trabajo || g.semana_label || g.semana)
      if (selectedSemana !== 'TODAS' && s !== selectedSemana) return

      if (g.segmento) set.add(String(g.segmento).trim().toUpperCase())
    })
    return ['TODOS', ...Array.from(set).sort()]
  }, [gruposDisponibles, selectedPeriodo, selectedSemana])

  // 4. Campañas (filtradas por Periodo + Semana + Segmento)
  const campanasDisponibles = useMemo(() => {
    const set = new Set()
    gruposDisponibles.forEach(g => {
      const p = (g.periodo_reclutado || g.periodo || '').toUpperCase().trim()
      if (selectedPeriodo !== 'TODOS' && p !== selectedPeriodo) return

      const s = formatSem(g.semana_trabajo || g.semana_label || g.semana)
      if (selectedSemana !== 'TODAS' && s !== selectedSemana) return

      const seg = (g.segmento || '').toUpperCase().trim()
      if (selectedSegmento !== 'TODOS' && seg !== selectedSegmento) return

      if (g.campana) set.add(String(g.campana).trim().toUpperCase())
    })
    return ['TODAS', ...Array.from(set).sort()]
  }, [gruposDisponibles, selectedPeriodo, selectedSemana, selectedSegmento])

  // 5. Códigos de Grupo (filtrados por Periodo + Semana + Segmento + Campaña)
  const codigosGruposDisponibles = useMemo(() => {
    const set = new Set()
    gruposDisponibles.forEach(g => {
      const p = (g.periodo_reclutado || g.periodo || '').toUpperCase().trim()
      if (selectedPeriodo !== 'TODOS' && p !== selectedPeriodo) return

      const s = formatSem(g.semana_trabajo || g.semana_label || g.semana)
      if (selectedSemana !== 'TODAS' && s !== selectedSemana) return

      const seg = (g.segmento || '').toUpperCase().trim()
      if (selectedSegmento !== 'TODOS' && seg !== selectedSegmento) return

      const c = (g.campana || '').toUpperCase().trim()
      if (selectedCampana !== 'TODAS' && c !== selectedCampana) return

      if (g.grupo_codigo) set.add(String(g.grupo_codigo).trim().toUpperCase())
    })
    return ['TODOS', ...Array.from(set).sort()]
  }, [gruposDisponibles, selectedPeriodo, selectedSemana, selectedSegmento, selectedCampana])

  // Handlers de cambio con auto-reseteo en cascada
  const handlePeriodoChange = (val) => {
    setSelectedPeriodo(val)
    setSelectedSemana('TODAS')
    setSelectedSegmento('TODOS')
    setSelectedCampana('TODAS')
    setSelectedGrupo('TODOS')
    setCalculoReady(false)
  }

  const handleSemanaChange = (val) => {
    setSelectedSemana(val)
    setSelectedSegmento('TODOS')
    setSelectedCampana('TODAS')
    setSelectedGrupo('TODOS')
    setCalculoReady(false)
  }

  const handleSegmentoChange = (val) => {
    setSelectedSegmento(val)
    setSelectedCampana('TODAS')
    setSelectedGrupo('TODOS')
    setCalculoReady(false)
  }

  const handleCampanaChange = (val) => {
    setSelectedCampana(val)
    setSelectedGrupo('TODOS')
    setCalculoReady(false)
  }

  const handleGrupoChange = (val) => {
    setSelectedGrupo(val)
    setCalculoReady(false)
  }

  const handleResetFilters = () => {
    setSelectedPeriodo('TODOS')
    setSelectedSemana('TODAS')
    setSelectedSegmento('TODOS')
    setSelectedCampana('TODAS')
    setSelectedGrupo('TODOS')
    setCalculoReady(false)
  }

  // Ejecutar el cálculo de pagos
  const handleCalcular = useCallback(async () => {
    setLoadingCalculo(true)
    setErrMsg(null)
    try {
      // 1. Recargar configs de propuestas actualizadas y capacidad
      const [cfgs, caps] = await Promise.all([
        fetchConfigPagosGrupo(),
        fetchCapacidadRysOperativo(),
      ])
      setConfigs(cfgs)
      if (caps && caps.length) setGruposCapacidad(caps)

      // 2. Traer nóminas con los 5 filtros aplicados
      const noms = await fetchNominasPagosCapacitacion({
        periodo: selectedPeriodo,
        semana: selectedSemana,
        segmento: selectedSegmento,
        campana: selectedCampana,
        grupo_codigo: selectedGrupo,
      })

      const docs = [...new Set(noms.map(n => n.documento).filter(Boolean))]
      const asis = await fetchAsistenciasPagos(docs, selectedGrupo)
      
      setNominas(noms)
      setAsistencias(asis)
      setCalculoReady(true)
    } catch (e) {
      console.error(e)
      setErrMsg(e.message || 'Error al calcular pagos de capacitación.')
    } finally {
      setLoadingCalculo(false)
    }
  }, [selectedPeriodo, selectedSemana, selectedSegmento, selectedCampana, selectedGrupo])

  // Motor de cálculo puro
  const filasCalculadas = useMemo(() => {
    if (!calculoReady) return []
    return calcularPagosCapacitacion(nominas, asistencias, configs, selectedPeriodo, gruposCapacidad)
  }, [nominas, asistencias, configs, selectedPeriodo, gruposCapacidad, calculoReady])

  // SOLO las personas que califican para pago (excluyendo bajas, registros sin propuesta y sin días de asistencia)
  const filasQueCalifican = useMemo(() => {
    return filasCalculadas.filter(f => !f.es_baja && f.dias_asistidos > 0 && !f.sin_propuesta)
  }, [filasCalculadas])

  const resumen = useMemo(() => generarResumenPagos(filasCalculadas), [filasCalculadas])

  const maxCuotas = useMemo(() =>
    filasQueCalifican.reduce((m, f) => Math.max(m, f.cuotas_permanencia?.length || 0), 0)
  , [filasQueCalifican])

  // Exportar CSV solo de calificados
  const handleExport = () => {
    if (!filasQueCalifican.length) return
    const csv = exportarCSVPagos(filasQueCalifican, maxCuotas)
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `Pagos_Capacitacion_${selectedPeriodo}_${selectedSemana}_${selectedCampana}_${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Cerrar lote de pagos (guardar snapshot histórico solo de calificados)
  const handleCerrarLote = useCallback(async () => {
    if (!filasQueCalifican?.length) return
    if (!window.confirm(`¿Deseas cerrar y guardar este lote de ${filasQueCalifican.length} personas que califican como histórico?\n\nEsta acción es un snapshot inmutable del cálculo actual.`)) return
    setSavingLote(true)
    setLoteMsg(null)
    try {
      const meta = {
        periodo: selectedPeriodo !== 'TODOS' ? selectedPeriodo : '',
        semana_trabajo: selectedSemana !== 'TODAS' ? parseInt(String(selectedSemana).replace(/\D/g, '')) || null : null,
        segmento: selectedSegmento !== 'TODOS' ? selectedSegmento : null,
        campana: selectedCampana !== 'TODAS' ? selectedCampana : null,
        grupo_codigo: selectedGrupo !== 'TODOS' ? selectedGrupo : null,
        cerrado_por: userProfile?.username || userProfile?.email || null,
        notas_lote: null,
      }
      const lote_id = await saveLiquidacionPagos(filasQueCalifican, meta)
      setLoteMsg({ type: 'success', text: `✓ Lote guardado correctamente. ID: ${lote_id.substring(0, 8)}...` })
      setTimeout(() => setLoteMsg(null), 8000)
    } catch (e) {
      setLoteMsg({ type: 'error', text: `Error al guardar lote: ${e.message}` })
    } finally {
      setSavingLote(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filasQueCalifican, selectedPeriodo, selectedSemana, selectedSegmento, selectedCampana, selectedGrupo, userProfile])

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
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <BanknoteIcon className="text-emerald-400" />
            Pagos de Capacitación
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Cruce de asistencias efectivas, pago por día y bonos (Bienvenida, Asistencia Perfecta y Permanencia).
          </p>
        </div>

        {/* Tabs */}
        <div className="flex bg-slate-800 p-1 rounded-lg border border-slate-700 flex-wrap gap-1">
          {[
            { id: 'calcular', label: 'Calcular Pagos', icon: Calculator },
            { id: 'configurar', label: 'Propuestas de Grupos', icon: Settings2 },
            { id: 'historico', label: 'Histórico de Lotes', icon: History },
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => {
                setActiveTab(id)
                if (id === 'historico') loadLotes()
              }}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                activeTab === id
                  ? 'bg-emerald-600 text-white shadow-sm font-bold'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
              }`}
            >
              <Icon size={15} /> {label}
            </button>
          ))}
        </div>
      </div>

      {errMsg && (
        <div className="flex items-center gap-2 text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3 text-sm">
          <AlertCircle size={16} /> {errMsg}
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

      {/* ── TAB: CALCULAR PAGOS (5 FILTROS EN CASCADA) ────────────────── */}
      {activeTab === 'calcular' && (
        <div className="space-y-5">
          {/* Barra de 5 Filtros Jerárquicos */}
          <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-4 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-300 uppercase tracking-wider">
                <Filter size={14} className="text-emerald-400" />
                Filtros Jerárquicos de Consulta
              </div>
              {(selectedPeriodo !== 'TODOS' || selectedSemana !== 'TODAS' || selectedSegmento !== 'TODOS' || selectedCampana !== 'TODAS' || selectedGrupo !== 'TODOS') && (
                <button
                  onClick={handleResetFilters}
                  className="flex items-center gap-1 text-xs text-slate-400 hover:text-rose-400 transition-colors"
                >
                  <RotateCcw size={12} /> Limpiar filtros
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              {/* 1. PERIODO */}
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-bold text-slate-400 uppercase">1. Periodo</label>
                <select
                  value={selectedPeriodo}
                  onChange={e => handlePeriodoChange(e.target.value)}
                  className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500 font-medium"
                >
                  {periodosDisponibles.map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>

              {/* 2. SEMANA */}
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-bold text-slate-400 uppercase">2. Semana</label>
                <select
                  value={selectedSemana}
                  onChange={e => handleSemanaChange(e.target.value)}
                  className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500 font-medium"
                >
                  {semanasDisponibles.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              {/* 3. SEGMENTO */}
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-bold text-slate-400 uppercase">3. Segmento</label>
                <select
                  value={selectedSegmento}
                  onChange={e => handleSegmentoChange(e.target.value)}
                  className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500 font-medium"
                >
                  {segmentosDisponibles.map(seg => (
                    <option key={seg} value={seg}>{seg}</option>
                  ))}
                </select>
              </div>

              {/* 4. CAMPAÑA */}
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-bold text-slate-400 uppercase">4. Campaña</label>
                <select
                  value={selectedCampana}
                  onChange={e => handleCampanaChange(e.target.value)}
                  className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500 font-medium"
                >
                  {campanasDisponibles.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              {/* 5. CÓDIGO DE GRUPO */}
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-bold text-slate-400 uppercase">5. Código de Grupo</label>
                <select
                  value={selectedGrupo}
                  onChange={e => handleGrupoChange(e.target.value)}
                  className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono font-bold"
                >
                  {codigosGruposDisponibles.map(g => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-700/60">
              <div className="text-xs text-slate-400">
                Selecciona los filtros y haz clic en <strong className="text-emerald-400">Calcular Pagos</strong> para cruzar con las asistencias.
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleCalcular}
                  disabled={loadingCalculo}
                  className="flex items-center gap-2 px-5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold rounded-lg transition-all shadow-md shadow-emerald-950/40"
                >
                  {loadingCalculo ? <RefreshCw size={14} className="animate-spin" /> : <Calculator size={14} />}
                  Calcular Pagos
                </button>

                {calculoReady && filasQueCalifican.length > 0 && (
                  <>
                    <button
                      onClick={handleExport}
                      className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-semibold rounded-lg transition-colors"
                    >
                      <Download size={14} /> Exportar CSV
                    </button>
                    <button
                      onClick={handleCerrarLote}
                      disabled={savingLote}
                      className="flex items-center gap-2 px-4 py-2 bg-violet-700 hover:bg-violet-600 disabled:opacity-50 text-white text-xs font-bold rounded-lg transition-all shadow-md shadow-violet-950/40"
                    >
                      {savingLote ? <Loader2 size={14} className="animate-spin" /> : <Lock size={14} />}
                      Cerrar Lote de Pagos
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* KPIs de resumen */}
          {calculoReady && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <KpiCard icon={Users} label="Califican" value={resumen.personas_calificadas} sub={resumen.personas_bajas > 0 ? `${resumen.personas_bajas} bajas excluidas` : undefined} color="blue" />
              <KpiCard icon={DollarSign} label="Total Días Capa" value={soles(resumen.total_monto_dias)} color="green" />
              <KpiCard icon={TrendingUp} label="Bono Bienvenida" value={soles(resumen.total_bono_bienvenida)} color="amber" />
              <KpiCard icon={Star} label="Asist. Perfecta" value={soles(resumen.total_bono_asistencia_perfecta)} sub={`${resumen.personas_asistencia_perfecta} personas`} color="rose" />
              <KpiCard icon={BanknoteIcon} label="Permanencia" value={soles(resumen.total_bono_permanencia)} color="violet" />
              <KpiCard icon={BanknoteIcon} label="TOTAL GENERAL" value={soles(resumen.total_general)} color="green" highlight />
            </div>
          )}

          {/* Tabla de pagos */}
          {calculoReady && (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wide flex items-center gap-2">
                  <CheckCircle2 size={14} className="text-emerald-400" />
                  {filasQueCalifican.length} personas califican para pago
                  {resumen.personas_bajas > 0 && (
                    <span className="ml-2 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30 normal-case">
                      {resumen.personas_bajas} excluidas por baja
                    </span>
                  )}
                </h3>
              </div>
              <TablaPagos filas={filasQueCalifican} maxCuotas={maxCuotas} />
            </div>
          )}

          {!calculoReady && (
            <div className="text-center py-20 text-slate-500 bg-slate-900/30 rounded-2xl border border-slate-800/80">
              <BanknoteIcon size={48} className="mx-auto mb-4 opacity-20 text-emerald-400" />
              <p className="font-semibold text-slate-300">Selecciona los filtros y presiona Calcular Pagos</p>
              <p className="text-xs mt-2 text-slate-500">
                El sistema cruzará automáticamente las marcaciones efectivas de asistencia ('A') con la tarifa y los 3 bonos de cada propuesta por grupo.
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
    </div>
  )
}
