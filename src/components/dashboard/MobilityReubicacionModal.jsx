import React, { useState, useMemo } from 'react'
import {
  X,
  Zap,
  MapPin,
  Clock,
  ArrowRight,
  ShieldCheck,
  AlertTriangle,
  Building2,
  CheckCircle2,
  Filter,
  Search,
  TrendingDown,
  Navigation
} from 'lucide-react'

/**
 * MobilityReubicacionModal - Panel de Gestión y Simulación de Reubicación de Sedes GEA
 * Permite reasignar postulantes/asesores a sedes más cercanas a su domicilio para evitar caídas.
 */
export default function MobilityReubicacionModal({
  isOpen,
  onClose,
  sugerencias = [],
  onApplyReubicacion
}) {
  const [searchTerm, setSearchTerm] = useState('')
  const [filterSede, setFilterSede] = useState('TODAS')
  const [filterRiesgo, setFilterRiesgo] = useState('TODOS')
  const [appliedIds, setAppliedIds] = useState(new Set())

  // Filtrado reactivo de sugerencias con seguridad contra undefined
  const filteredList = useMemo(() => {
    const sTerm = String(searchTerm || '').toLowerCase()
    return sugerencias.filter(item => {
      const nombreStr = String(item.nombre || item.candidato || '').toLowerCase()
      const distritoStr = String(item.distrito || '').toLowerCase()
      const docStr = String(item.documento || '')

      const matchSearch =
        nombreStr.includes(sTerm) ||
        distritoStr.includes(sTerm) ||
        docStr.includes(sTerm)

      const matchSede =
        filterSede === 'TODAS' ||
        item.sedeActual === filterSede ||
        item.sedeSugerida === filterSede

      const dist = Number(item.distanciaActual ?? item.distanciaActualKm ?? 0)
      const matchRiesgo =
        filterRiesgo === 'TODOS' ||
        (filterRiesgo === 'CRITICO' && dist >= 14) ||
        (filterRiesgo === 'MEDIO' && dist < 14)

      return matchSearch && matchSede && matchRiesgo
    })
  }, [sugerencias, searchTerm, filterSede, filterRiesgo])

  // Métricas agregadas protegidas
  const stats = useMemo(() => {
    const total = sugerencias.length
    const criticos = sugerencias.filter(s => Number(s.distanciaActual ?? s.distanciaActualKm ?? 0) >= 14).length
    const ahorroKmTotal = sugerencias.reduce((acc, s) => acc + (s.ahorroKm || 0), 0)
    const ahorroKmProm = total > 0 ? (ahorroKmTotal / total).toFixed(1) : 0
    const ahorroTiempoProm = total > 0 ? Math.round(sugerencias.reduce((acc, s) => acc + (s.ahorroMin || 0), 0) / total) : 0
    // Estimación económica de ingresos salvados (~S/. 850 de costo de reposición por baja evitada)
    const ingresoRetenido = (criticos * 850).toLocaleString('es-PE')

    return { total, criticos, ahorroKmProm, ahorroTiempoProm, ingresoRetenido }
  }, [sugerencias])

  const handleToggleApply = (id) => {
    setAppliedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
    if (onApplyReubicacion) {
      onApplyReubicacion(id)
    }
  }

  if (!isOpen) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-6 bg-black/70 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div className="relative w-full max-w-5xl max-h-[92vh] flex flex-col rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-2xl overflow-hidden transition-colors">
        
        {/* Glow ambiental superior */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-24 bg-gradient-to-r from-cyan-500/10 via-emerald-500/15 to-amber-500/10 blur-3xl pointer-events-none" />

        {/* ── HEADER DEL MODAL ── */}
        <div className="relative z-10 px-6 py-4 border-b border-[var(--border-subtle)] bg-[var(--bg-elevated)]/60 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-center text-emerald-600 dark:text-emerald-300 shadow-sm">
              <Zap size={22} className="animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black tracking-tight text-[var(--text-primary)]">
                  OPTIMIZADOR DE REUBICACIÓN DE SEDES
                </h2>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 dark:text-emerald-300 font-mono text-[10px] font-black uppercase">
                  RETENCIÓN MCP
                </span>
              </div>
              <p className="text-xs text-[var(--text-muted)] font-mono">
                Sugerencias basadas en geolocalización de domicilio vs. sedes GEA para reducir deserción por distancia.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl border border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-muted)] transition-all cursor-pointer"
            title="Cerrar ventana"
          >
            <X size={18} />
          </button>
        </div>

        {/* ── KPIS DE IMPACTO DE REUBICACIÓN ── */}
        <div className="relative z-10 px-6 py-3 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3 rounded-xl border border-cyan-500/30 bg-cyan-500/5 flex flex-col">
            <span className="text-[10px] font-mono font-bold text-cyan-600 dark:text-cyan-300 uppercase tracking-wider">Candidatos Reubicación</span>
            <span className="text-2xl font-black text-[var(--text-primary)] font-mono mt-0.5">{stats.total}</span>
            <span className="text-[10px] text-[var(--text-muted)] font-mono">Postulantes analizados</span>
          </div>

          <div className="p-3 rounded-xl border border-rose-500/30 bg-rose-500/5 flex flex-col">
            <span className="text-[10px] font-mono font-bold text-rose-600 dark:text-rose-400 uppercase tracking-wider">En Riesgo Crítico (&gt;14km)</span>
            <span className="text-2xl font-black text-rose-600 dark:text-rose-400 font-mono mt-0.5">{stats.criticos}</span>
            <span className="text-[10px] text-[var(--text-muted)] font-mono">Alta probabilidad de baja</span>
          </div>

          <div className="p-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 flex flex-col">
            <span className="text-[10px] font-mono font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">Ahorro Promedio de Viaje</span>
            <div className="flex items-baseline gap-1 mt-0.5">
              <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400 font-mono">-{stats.ahorroKmProm}</span>
              <span className="text-xs text-emerald-600 dark:text-emerald-300 font-mono">km</span>
              <span className="text-xs text-[var(--text-muted)] font-mono ml-1">(-{stats.ahorroTiempoProm} min)</span>
            </div>
            <span className="text-[10px] text-[var(--text-muted)] font-mono">Menos desgaste diario</span>
          </div>

          <div className="p-3 rounded-xl border border-amber-500/30 bg-amber-500/5 flex flex-col">
            <span className="text-[10px] font-mono font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider">Retención Proyectada</span>
            <span className="text-2xl font-black text-amber-600 dark:text-amber-300 font-mono mt-0.5">S/. {stats.ingresoRetenido}</span>
            <span className="text-[10px] text-[var(--text-muted)] font-mono">Ahorro en costo de reemplazo</span>
          </div>
        </div>

        {/* ── BARRA DE BÚSQUEDA Y FILTROS ── */}
        <div className="relative z-10 px-6 py-3 border-b border-[var(--border-subtle)] bg-[var(--bg-elevated)]/40 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-1 min-w-[240px]">
            <div className="relative w-full">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
              <input
                type="text"
                placeholder="Buscar por postulante, DNI o distrito..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] font-mono"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Filter size={13} className="text-[var(--text-muted)]" />
            <select
              value={filterRiesgo}
              onChange={(e) => setFilterRiesgo(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] font-mono cursor-pointer focus:outline-none focus:border-[var(--accent)]"
            >
              <option value="TODOS">Todos los niveles de riesgo</option>
              <option value="CRITICO">Solo Críticos (&gt;14 km)</option>
              <option value="MEDIO">Riesgo Moderado (10-14 km)</option>
            </select>
          </div>
        </div>

        {/* ── LISTADO / TABLA DE CANDIDATOS A REUBICACIÓN ── */}
        <div className="relative z-10 flex-1 overflow-y-auto px-6 py-3 space-y-2.5 scrollbar-thin">
          {filteredList.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center text-center text-[var(--text-muted)] font-mono text-xs">
              <ShieldCheck size={36} className="text-emerald-500 mb-2 opacity-60" />
              <p className="font-bold text-[var(--text-primary)] text-sm">No se encontraron postulantes con esos filtros</p>
              <p className="mt-1">Todos los postulantes visibles tienen sedes compatibles o ajustadas.</p>
            </div>
          ) : (
            filteredList.map((item, idx) => {
              const isApplied = appliedIds.has(item.id)
              const isCritico = item.distanciaActual >= 14

              return (
                <div
                  key={item.id || idx}
                  className={`p-3.5 rounded-xl border transition-all flex flex-col md:flex-row md:items-center justify-between gap-3 ${
                    isApplied
                      ? 'bg-emerald-500/10 border-emerald-500/50 shadow-sm'
                      : isCritico
                      ? 'bg-rose-500/5 border-rose-500/30 hover:border-rose-400'
                      : 'bg-[var(--bg-elevated)] border-[var(--border-subtle)] hover:border-[var(--border-normal)]'
                  }`}
                >
                  {/* Info Postulante */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-[var(--text-primary)] text-sm truncate">{item.nombre}</span>
                      {isCritico && (
                        <span className="px-2 py-0.5 rounded bg-rose-500/15 border border-rose-500/30 text-rose-600 dark:text-rose-300 font-mono text-[9px] font-bold">
                          RIESGO CRÍTICO
                        </span>
                      )}
                      {isApplied && (
                        <span className="px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 dark:text-emerald-300 font-mono text-[9px] font-bold flex items-center gap-1">
                          <CheckCircle2 size={10} /> REUBICACIÓN APLICADA
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-[var(--text-muted)] font-mono">
                      <span className="flex items-center gap-1 text-[var(--text-secondary)]">
                        <MapPin size={11} className="text-amber-500" />
                        <strong className="text-[var(--text-primary)]">{item.distrito}</strong>
                      </span>
                      {item.direccion && (
                        <span className="text-[var(--text-muted)] truncate max-w-[220px]">
                          {item.direccion}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Comparativa: Sede Actual vs Sede Sugerida */}
                  <div className="flex items-center gap-3 bg-[var(--bg-surface)] p-2.5 rounded-xl border border-[var(--border-subtle)] font-mono text-xs shrink-0">
                    {/* Sede Actual */}
                    <div className="text-left">
                      <div className="text-[10px] text-[var(--text-muted)] uppercase">Actual</div>
                      <div className="font-bold text-[var(--text-primary)]">{item.sedeActual}</div>
                      <div className="text-[11px] text-rose-600 dark:text-rose-400 font-bold">{item.distanciaActual} km · ~{item.tiempoActualMin}m</div>
                    </div>

                    <ArrowRight size={14} className="text-emerald-500 shrink-0" />

                    {/* Sede Sugerida */}
                    <div className="text-left">
                      <div className="text-[10px] text-emerald-600 dark:text-emerald-400 uppercase font-bold flex items-center gap-1">
                        <Zap size={10} /> Sugerida
                      </div>
                      <div className="font-bold text-emerald-600 dark:text-emerald-300">{item.sedeSugerida}</div>
                      <div className="text-[11px] text-emerald-600 dark:text-emerald-400 font-bold">{item.distanciaSugerida} km · ~{item.tiempoSugeridoMin}m</div>
                    </div>

                    {/* Badge Ahorro */}
                    <div className="pl-2 border-l border-[var(--border-subtle)] text-right">
                      <div className="text-[9px] text-[var(--text-muted)] uppercase">Ahorro</div>
                      <div className="text-sm font-black text-emerald-600 dark:text-emerald-400 font-mono">-{item.ahorroKm} km</div>
                      <div className="text-[10px] text-emerald-600 dark:text-emerald-300">-{item.ahorroMin} min</div>
                    </div>
                  </div>

                  {/* Botón de Acción */}
                  <div className="shrink-0 flex items-center justify-end">
                    <button
                      onClick={() => handleToggleApply(item.id)}
                      className={`px-3.5 py-2 rounded-xl text-xs font-black font-mono tracking-wider uppercase transition-all cursor-pointer flex items-center gap-1.5 ${
                        isApplied
                          ? 'bg-emerald-500/20 border border-emerald-500/50 text-emerald-600 dark:text-emerald-300 hover:bg-emerald-500/30'
                          : 'bg-emerald-500 hover:bg-emerald-400 text-white shadow-sm'
                      }`}
                    >
                      {isApplied ? (
                        <>
                          <CheckCircle2 size={13} />
                          <span>Deshacer</span>
                        </>
                      ) : (
                        <>
                          <Zap size={13} />
                          <span>Reasignar</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* ── FOOTER DEL MODAL ── */}
        <div className="relative z-10 px-6 py-3 border-t border-[var(--border-subtle)] bg-[var(--bg-elevated)]/60 flex items-center justify-between text-xs font-mono text-[var(--text-muted)]">
          <div className="flex items-center gap-2">
            <span>Reubicaciones simuladas:</span>
            <strong className="text-emerald-600 dark:text-emerald-400">{appliedIds.size} de {sugerencias.length}</strong>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-5 py-1.5 rounded-lg border border-[var(--border-normal)] bg-[var(--bg-surface)] text-[var(--text-primary)] hover:bg-[var(--bg-muted)] transition-all cursor-pointer font-bold shadow-xs"
            >
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
