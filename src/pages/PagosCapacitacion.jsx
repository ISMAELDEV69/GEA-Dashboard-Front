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
// Sub-componente: Formulario de configuración de grupo
// ────────────────────────────────────────────────────────────────────────
function ConfigGrupoForm({ gruposDisponibles, configsExistentes, onSaved, userProfile }) {
  const [form, setForm] = useState({
    grupo_codigo: '', campana: '', segmento: '', semana_trabajo: '', periodo: '',
    monto_dia_capa: '', bono_bienvenida: '', bono_permanencia_total: '',
    cuotas_permanencia: '3', bono_asistencia_perfecta: '', notas: ''
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [editingId, setEditingId] = useState(null)

  const handleGrupoChange = (e) => {
    const cod = e.target.value
    const grupoInfo = gruposDisponibles.find(g => g.grupo_codigo === cod)
    const configExist = configsExistentes.find(c => c.grupo_codigo === cod)
    if (configExist) {
      setForm({ 
        ...configExist, 
        semana_trabajo: configExist.semana_trabajo || '', 
        cuotas_permanencia: configExist.cuotas_permanencia || '3',
        segmento: configExist.segmento || grupoInfo?.segmento || ''
      })
      setEditingId(configExist.id)
    } else {
      setForm(f => ({
        ...f,
        grupo_codigo: cod,
        campana: grupoInfo?.campana || '',
        segmento: grupoInfo?.segmento || '',
        semana_trabajo: grupoInfo?.semana_trabajo || '',
        periodo: grupoInfo?.periodo_reclutado || grupoInfo?.periodo || '',
      }))
      setEditingId(null)
    }
  }

  const handleSave = async () => {
    if (!form.grupo_codigo) { setError('Selecciona un grupo'); return }
    setSaving(true); setError(null)
    try {
      await upsertConfigPagoGrupo({ ...form, created_by: userProfile?.nombre || userProfile?.email })
      setForm({ grupo_codigo: '', campana: '', segmento: '', semana_trabajo: '', periodo: '', monto_dia_capa: '', bono_bienvenida: '', bono_permanencia_total: '', cuotas_permanencia: '3', bono_asistencia_perfecta: '', notas: '' })
      setEditingId(null)
      onSaved()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const field = (label, key, type = 'text', placeholder = '') => (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-slate-400 uppercase tracking-wide">{label}</label>
      <input
        type={type}
        value={form[key]}
        onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
        placeholder={placeholder}
        className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
      />
    </div>
  )

  return (
    <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-5 shadow-sm">
      <h3 className="text-base font-semibold text-white mb-4 flex items-center gap-2">
        <Settings2 size={16} className="text-emerald-400" />
        {editingId ? 'Editar Propuesta Económica del Grupo' : 'Nueva Propuesta Económica de Grupo'}
      </h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-400 uppercase tracking-wide">Código de Grupo</label>
          <select
            value={form.grupo_codigo}
            onChange={handleGrupoChange}
            className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="">-- Seleccionar grupo --</option>
            {gruposDisponibles.map(g => (
              <option key={g.grupo_codigo} value={g.grupo_codigo}>
                {g.grupo_codigo} — {g.campana || ''}
              </option>
            ))}
          </select>
        </div>

        {field('Periodo', 'periodo', 'text', 'Ej: 202608')}
        {field('Semana', 'semana_trabajo', 'text', 'Ej: SEM 28')}
        {field('Segmento', 'segmento', 'text', 'Ej: RETENCIONES')}
        {field('Campaña', 'campana', 'text', 'Ej: CLARO PERU')}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mt-4">
        {field('Monto/Día Capa (S/.)', 'monto_dia_capa', 'number', '0.00')}
        {field('Bono Bienvenida (S/.)', 'bono_bienvenida', 'number', '0.00')}
        {field('Bono Asist. Perfecta (S/.)', 'bono_asistencia_perfecta', 'number', '0.00')}
        {field('Bono Permanencia Total (S/.)', 'bono_permanencia_total', 'number', '0.00')}
        {field('Cuotas Permanencia', 'cuotas_permanencia', 'number', '1')}
      </div>

      <div className="mt-4">
        {field('Notas u Observaciones', 'notas', 'text', 'Detalles adicionales de la propuesta...')}
      </div>

      {error && (
        <div className="mt-3 flex items-center gap-2 text-rose-400 text-sm bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">
          <AlertCircle size={14} /> {error}
        </div>
      )}

      <div className="flex gap-3 mt-4">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors shadow-sm"
        >
          {saving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
          {editingId ? 'Actualizar Propuesta' : 'Guardar Propuesta'}
        </button>
        {editingId && (
          <button
            onClick={() => { setForm({ grupo_codigo: '', campana: '', segmento: '', semana_trabajo: '', periodo: '', monto_dia_capa: '', bono_bienvenida: '', bono_permanencia_total: '', cuotas_permanencia: '3', bono_asistencia_perfecta: '', notas: '' }); setEditingId(null) }}
            className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm font-medium rounded-lg transition-colors"
          >
            <X size={14} /> Cancelar
          </button>
        )}
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────
// Sub-componente: Tabla de configuraciones guardadas
// ────────────────────────────────────────────────────────────────────────
function TablaConfigs({ configs, onDelete, onRefresh }) {
  const [deleting, setDeleting] = useState(null)

  const handleDelete = async (cod) => {
    if (!confirm(`¿Eliminar configuración de ${cod}?`)) return
    setDeleting(cod)
    try { await deleteConfigPagoGrupo(cod); onRefresh() }
    catch (e) { alert(e.message) }
    finally { setDeleting(null) }
  }

  if (!configs.length) return (
    <div className="text-center text-slate-500 py-8 text-sm">
      No hay configuraciones registradas. Las propuestas cargadas se integrarán automáticamente.
    </div>
  )

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-700">
      <table className="w-full text-sm">
        <thead className="bg-slate-800/80">
          <tr>
            {['Grupo', 'Periodo', 'Semana', 'Segmento', 'Campaña', 'S/./Día', 'Bienvenida', 'Asist. Perf.', 'Permanencia', 'Cuotas', ''].map(h => (
              <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-700/50">
          {configs.map(c => (
            <tr key={c.id || c.grupo_codigo} className="hover:bg-slate-800/50 transition-colors">
              <td className="px-3 py-2 font-mono text-emerald-400 font-bold text-xs">{c.grupo_codigo}</td>
              <td className="px-3 py-2 text-slate-400 text-xs">{c.periodo || '—'}</td>
              <td className="px-3 py-2 text-slate-400 text-xs">{c.semana_trabajo || '—'}</td>
              <td className="px-3 py-2 text-slate-300 text-xs">{c.segmento || '—'}</td>
              <td className="px-3 py-2 text-slate-300 whitespace-nowrap text-xs">{c.campana || '—'}</td>
              <td className="px-3 py-2 text-emerald-400 font-medium">{soles(c.monto_dia_capa)}</td>
              <td className="px-3 py-2 text-amber-400 font-medium">{soles(c.bono_bienvenida)}</td>
              <td className="px-3 py-2 text-rose-400 font-medium">{soles(c.bono_asistencia_perfecta)}</td>
              <td className="px-3 py-2 text-violet-400 font-medium">{soles(c.bono_permanencia_total)}</td>
              <td className="px-3 py-2 text-slate-400 text-xs">{c.cuotas_permanencia}</td>
              <td className="px-3 py-2 text-right">
                <button
                  onClick={() => handleDelete(c.grupo_codigo)}
                  disabled={deleting === c.grupo_codigo}
                  className="p-1 text-slate-500 hover:text-rose-400 transition-colors"
                  title="Eliminar"
                >
                  {deleting === c.grupo_codigo ? <RefreshCw size={14} className="animate-spin" /> : <Trash2 size={14} />}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
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
                  <td className="px-3 py-2 text-center font-bold text-blue-400">{row.dias_asistidos}</td>
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
  const [nominas, setNominas] = useState([])
  const [asistencias, setAsistencias] = useState([])

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
      const [cfgs, grps] = await Promise.all([
        fetchConfigPagosGrupo(),
        fetchGruposPagosDisponibles(),
      ])
      setConfigs(cfgs)
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
    return ['TODOS', ...Array.from(set).sort()]
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
      // 1. Recargar configs de propuestas actualizadas
      const cfgs = await fetchConfigPagosGrupo()
      setConfigs(cfgs)

      // 2. Traer nóminas con los 5 filtros aplicados
      const noms = await fetchNominasPagosCapacitacion({
        periodo: selectedPeriodo,
        semana: selectedSemana,
        segmento: selectedSegmento,
        campana: selectedCampana,
        grupo_codigo: selectedGrupo,
      })

      const docs = [...new Set(noms.map(n => n.documento).filter(Boolean))]
      const asis = await fetchAsistenciasPagos(docs)
      
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
    return calcularPagosCapacitacion(nominas, asistencias, configs)
  }, [nominas, asistencias, configs, calculoReady])

  const resumen = useMemo(() => generarResumenPagos(filasCalculadas), [filasCalculadas])

  const maxCuotas = useMemo(() =>
    filasCalculadas.reduce((m, f) => Math.max(m, f.cuotas_permanencia?.length || 0), 0)
  , [filasCalculadas])

  // Exportar CSV
  const handleExport = () => {
    if (!filasCalculadas.length) return
    const csv = exportarCSVPagos(filasCalculadas, maxCuotas)
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `Pagos_Capacitacion_${selectedPeriodo}_${selectedSemana}_${selectedCampana}_${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Cerrar lote de pagos (guardar snapshot histórico)
  const handleCerrarLote = useCallback(async () => {
    if (!filasCalculadas?.length) return
    if (!window.confirm(`¿Deseas cerrar y guardar este lote de ${filasCalculadas.length} personas como histórico?\n\nEsta acción es un snapshot inmutable del cálculo actual.`)) return
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
      const lote_id = await saveLiquidacionPagos(filasCalculadas, meta)
      setLoteMsg({ type: 'success', text: `✓ Lote guardado correctamente. ID: ${lote_id.substring(0, 8)}...` })
      setTimeout(() => setLoteMsg(null), 8000)
    } catch (e) {
      setLoteMsg({ type: 'error', text: `Error al guardar lote: ${e.message}` })
    } finally {
      setSavingLote(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filasCalculadas, selectedPeriodo, selectedSemana, selectedSegmento, selectedCampana, selectedGrupo, userProfile])

  // Ver detalle de lote histórico
  const handleVerDetalleLote = useCallback(async (lote_id) => {
    setDetalleLote({ lote_id, filas: [] })
    setLoadingDetalle(true)
    try {
      const filas = await fetchLiquidacionDetalle(lote_id)
      setDetalleLote({ lote_id, filas })
    } catch (e) {
      console.error('Error cargando detalle de lote:', e)
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
            gruposDisponibles={gruposDisponibles}
            configsExistentes={configs}
            onSaved={loadInitialData}
            userProfile={userProfile}
          />
          <div>
            <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-3 flex items-center gap-2">
              <Settings2 size={14} /> Tarifas y Bonos por Grupo (Propuestas Integradas)
              {loadingConfigs && <RefreshCw size={12} className="animate-spin text-emerald-400" />}
            </h3>
            <TablaConfigs configs={configs} onDelete={deleteConfigPagoGrupo} onRefresh={loadInitialData} />
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

                {calculoReady && filasCalculadas.length > 0 && (
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
                  {resumen.personas_calificadas} personas califican para pago
                  {resumen.personas_bajas > 0 && (
                    <span className="ml-2 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30 normal-case">
                      {resumen.personas_bajas} excluidas por baja
                    </span>
                  )}
                </h3>
              </div>
              <TablaPagos filas={filasCalculadas} maxCuotas={maxCuotas} />
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
