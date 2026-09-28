import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Sparkles,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  RefreshCw,
  Zap,
  CheckCircle2,
  Calendar,
  Layers,
  ChevronRight,
  ShieldAlert,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'

/**
 * 🦁 Mascota Oficial "GEITO" (El León de GEA con Headset y Laptop)
 */
function OreoMascot({ size = 46, animated = true }) {
  const handleClick = () => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('gea:open_geito_chat'))
    }
  }

  return (
    <div
      onClick={handleClick}
      title="Consultar a Geíto IA sobre la operación"
      className="relative shrink-0 flex items-center justify-center select-none cursor-pointer"
      style={{ width: size, height: size * 1.15 }}
      role="button"
      tabIndex={0}
    >
      <div className="absolute -inset-1 rounded-full bg-gradient-to-tr from-amber-500/20 via-cyan-500/15 to-amber-400/15 blur-md pointer-events-none" />
      <img
        src="/mascot/geito.png"
        alt="GEITO - Mascota Oficial GEA"
        className={`w-full h-full object-contain relative z-10 drop-shadow-[0_0_10px_rgba(6,182,212,0.4)] ${
          animated ? 'hover:scale-115 transition-transform duration-300' : ''
        }`}
        onError={(e) => {
          e.currentTarget.src = '/geito.png'
        }}
      />
    </div>
  )
}

/**
 * Tarjeta individual 3D de KPI analizado por OREO
 */
function OreoKpiCard({ card }) {
  const { nombre, tendencia, valor_actual, detalle, comparaciones = [], conclusion } = card

  const isMejora = tendencia === 'mejora'
  const isBaja = tendencia === 'baja'

  const theme = useMemo(() => {
    if (isMejora) {
      return {
        border: 'border-emerald-500/35 hover:border-emerald-400/60',
        bg: 'from-emerald-950/30 via-slate-900/90 to-slate-950/90',
        badgeBg: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
        accentText: 'text-emerald-400',
        icon: TrendingUp,
        label: '▲ Mejora',
        glow: 'rgba(16, 185, 129, 0.15)',
      }
    }
    if (isBaja) {
      return {
        border: 'border-rose-500/35 hover:border-rose-400/60',
        bg: 'from-rose-950/30 via-slate-900/90 to-slate-950/90',
        badgeBg: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
        accentText: 'text-rose-400',
        icon: TrendingDown,
        label: '▼ Baja',
        glow: 'rgba(239, 68, 68, 0.15)',
      }
    }
    return {
      border: 'border-slate-700/60 hover:border-sky-500/40',
      bg: 'from-slate-900/90 via-slate-900/80 to-slate-950/90',
      badgeBg: 'bg-slate-800/80 text-slate-300 border-slate-700/60',
      accentText: 'text-sky-300',
      icon: Minus,
      label: '▬ Estable',
      glow: 'rgba(56, 189, 248, 0.1)',
    }
  }, [isMejora, isBaja])

  const IconComp = theme.icon

  return (
    <div
      style={{
        boxShadow: `0 8px 24px ${theme.glow}`,
        transformStyle: 'preserve-3d',
      }}
      className={`relative flex flex-col justify-between p-3.5 rounded-xl border bg-gradient-to-br ${theme.bg} ${theme.border} transition-all duration-300 hover:-translate-y-1 hover:shadow-xl group`}
    >
      <div>
        {/* Cabecera de la tarjeta: Nombre + Badge de tendencia */}
        <div className="flex items-start justify-between gap-2 pb-2 border-b border-slate-800/60">
          <span className="text-[11px] font-bold text-slate-200 tracking-tight leading-tight line-clamp-1 group-hover:text-white transition-colors">
            {nombre}
          </span>
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black border tracking-wider uppercase shrink-0 ${theme.badgeBg}`}>
            <IconComp size={10} />
            {theme.label}
          </span>
        </div>

        {/* Valor actual principal */}
        <div className="mt-2.5 flex items-baseline gap-2">
          <span className={`text-2xl font-black font-mono tracking-tight tabular-nums ${theme.accentText}`}>
            {typeof valor_actual === 'number' ? valor_actual.toLocaleString('es-PE') : valor_actual}
          </span>
        </div>

        {/* Detalle breakdown */}
        {detalle && (
          <p className="text-[10px] text-slate-400 mt-1 line-clamp-2 leading-relaxed">
            {detalle}
          </p>
        )}

        {/* Comparaciones de períodos con deltas ▲▼ */}
        {comparaciones && comparaciones.length > 0 && (
          <div className="mt-2.5 space-y-1 pt-2 border-t border-slate-800/40">
            {comparaciones.map((c, i) => {
              const delta = c.delta_pct ?? 0
              const isDeltaPositive = delta > 0
              return (
                <div key={i} className="flex items-center justify-between text-[9.5px] font-mono text-slate-400">
                  <span className="font-sans text-slate-400">{c.label}:</span>
                  <div className="flex items-center gap-1.5 font-bold">
                    <span className="text-slate-300">{typeof c.valor === 'number' ? c.valor.toLocaleString('es-PE') : c.valor}</span>
                    <span
                      className={`inline-flex items-center px-1.5 py-0.2 rounded text-[8.5px] font-black ${
                        isDeltaPositive
                          ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                          : delta < 0
                            ? 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
                            : 'bg-slate-800 text-slate-400 border border-slate-700'
                      }`}
                    >
                      {isDeltaPositive ? '▲ +' : delta < 0 ? '▼ ' : '▬ '}
                      {Math.abs(delta)}%
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Conclusión al pie */}
      {conclusion && (
        <div className="mt-3 pt-2 border-t border-slate-800/60 flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: isMejora ? '#10B981' : isBaja ? '#EF4444' : '#38BDF8' }} />
          <span className="text-[9.5px] font-semibold text-slate-300 italic line-clamp-2 leading-tight">
            “{conclusion}”
          </span>
        </div>
      )}
    </div>
  )
}

/**
 * Componente Principal: OreoResumenCard
 */
export default function OreoResumenCard({
  kpis = null,
  userRole = 'admin',
  onRefresh,
  className = '',
}) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [regenerating, setRegenerating] = useState(false)
  const [error, setError] = useState(null)
  const [lastGenerated, setLastGenerated] = useState(null)

  // Roles autorizados a regenerar manualmente
  const canRegenerate = useMemo(() => {
    const r = String(userRole || '').toLowerCase()
    return ['admin', 'jefe_rys', 'jefe_capacitacion', 'coordinador_rys', 'supervisor_capacitacion'].includes(r)
  }, [userRole])

  /**
   * Carga el resumen desde Supabase o API
   */
  const loadSummary = useCallback(async (force = false) => {
    if (force) setRegenerating(true)
    else setLoading(true)
    setError(null)

    try {
      // 1. Si no es forzado, intentar leer primero de Supabase
      if (!force) {
        const { data: row, error: sbErr } = await supabase
          .from('resumenes_diarios_ia')
          .select('*')
          .order('fecha', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (!sbErr && row?.json_resultado) {
          setData(row.json_resultado)
          setLastGenerated(row.generado_en)
          setLoading(false)
          return
        }
      }

      // 2. Si no hay en Supabase o se forzó, llamar al endpoint backend /api/resumen-diario
      const resp = await fetch(`/api/resumen-diario${force ? '?force=true' : ''}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kpis, force }),
      })

      if (!resp.ok) {
        throw new Error(`Error en API: ${resp.status}`)
      }

      const resJson = await resp.json()
      if (resJson?.data) {
        setData(resJson.data)
        setLastGenerated(resJson.generado_en || new Date().toISOString())
      } else {
        throw new Error('Formato de datos no reconocido')
      }
    } catch (err) {
      console.warn('[OREO] Error cargando resumen diario:', err.message)
      setError(err.message)
    } finally {
      setLoading(false)
      setRegenerating(false)
    }
  }, [kpis])

  useEffect(() => {
    loadSummary(false)
  }, [loadSummary])

  // Estado de carga inicial (Skeleton)
  if (loading && !data) {
    return (
      <div className={`p-4 rounded-2xl bg-slate-900/80 border border-slate-800/80 backdrop-blur-md animate-pulse ${className}`}>
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-slate-800" />
            <div className="space-y-1.5">
              <div className="w-32 h-3.5 bg-slate-800 rounded" />
              <div className="w-48 h-2.5 bg-slate-850 rounded" />
            </div>
          </div>
          <div className="w-24 h-7 bg-slate-800 rounded-lg" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 mt-3.5">
          {[1, 2, 3, 4].map((n) => (
            <div key={n} className="h-36 rounded-xl bg-slate-800/60" />
          ))}
        </div>
      </div>
    )
  }

  // Estado si no hay datos disponibles y falló la carga
  if (!data) {
    return (
      <div className={`p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800/80 backdrop-blur-md flex items-center justify-between gap-3 ${className}`}>
        <div className="flex items-center gap-2.5">
          <OreoMascot size={36} animated={false} />
          <div>
            <p className="text-xs font-bold text-slate-200">Asistente Ejecutivo GEITO</p>
            <p className="text-[10px] text-slate-400">Aún no se ha generado el resumen diario para esta fecha.</p>
          </div>
        </div>
        {canRegenerate && (
          <button
            onClick={() => loadSummary(true)}
            disabled={regenerating}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-black transition-all cursor-pointer shadow-md shadow-sky-500/20 active:scale-95 disabled:opacity-50"
          >
            <RefreshCw size={13} className={regenerating ? 'animate-spin' : ''} />
            <span>{regenerating ? 'Generando…' : 'Generar Resumen'}</span>
          </button>
        )}
      </div>
    )
  }

  const { saludo, resumen_oreo, kpis_mejoran = 0, kpis_empeoran = 0, cuello_de_botella, tarjetas = [] } = data

  return (
    <div
      style={{
        boxShadow: '0 10px 30px -10px rgba(0, 0, 0, 0.5), 0 0 20px -5px rgba(56, 189, 248, 0.1)',
      }}
      className={`relative p-3.5 sm:p-4 rounded-2xl bg-gradient-to-b from-slate-900/95 via-slate-900/90 to-slate-950/95 border border-slate-800/90 backdrop-blur-md transition-all duration-300 ${className}`}
    >
      {/* ─────────────────────────────────────────────────────────────
          1. HEADER: Mascota GEITO + Saludo + Badge IA + Botón Regenerar
          ───────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
        <div className="flex items-center gap-3 min-w-0">
          {/* Mascota GEITO */}
          <OreoMascot size={42} animated />

          <div className="flex flex-col min-w-0 leading-tight">
            <div className="flex items-center gap-2">
              <span className="text-xs sm:text-sm font-black text-white tracking-tight truncate">
                {saludo || 'Resumen Diario Ejecutivo'}
              </span>
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/30 text-[9px] font-black text-amber-300 tracking-wider uppercase">
                <Sparkles size={10} className="text-amber-400" />
                GEITO IA
              </span>
            </div>
            <p className="text-[10px] text-slate-400 mt-0.5 truncate">
              Análisis ejecutivo del embudo de capacitación y operaciones
            </p>
          </div>
        </div>

        {/* Acciones y métricas de cabecera */}
        <div className="flex items-center gap-2">
          {/* Contador de KPIs que mejoran / empeoran */}
          <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-950/60 border border-slate-800 text-[10px] font-mono font-bold">
            <span className="text-emerald-400 flex items-center gap-0.5">
              <TrendingUp size={11} /> {kpis_mejoran}
            </span>
            <span className="text-slate-600">/</span>
            <span className="text-rose-400 flex items-center gap-0.5">
              <TrendingDown size={11} /> {kpis_empeoran}
            </span>
          </div>

          {/* Botón manual para regenerar resumen (Solo directivos/admin) */}
          {canRegenerate && (
            <button
              onClick={() => loadSummary(true)}
              disabled={regenerating}
              title="Regenerar análisis IA con el corte actual"
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/80 hover:border-sky-500/50 text-slate-200 hover:text-white text-[10px] font-bold transition-all cursor-pointer active:scale-95 disabled:opacity-50"
            >
              <RefreshCw size={11} className={regenerating ? 'animate-spin text-sky-400' : 'text-slate-400'} />
              <span>{regenerating ? 'Analizando…' : 'Regenerar'}</span>
            </button>
          )}
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          2. BANDA NARRATIVA DE OREO + ALERTA CUELLO DE BOTELLA
          ───────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-2.5 my-3">
        {/* Mensaje de GEITO */}
        <div className="lg:col-span-2 relative p-2.5 sm:p-3 rounded-xl bg-gradient-to-r from-amber-950/25 via-slate-900/90 to-slate-900/80 border border-amber-500/25 flex items-start gap-2.5 shadow-sm">
          <div className="p-1 rounded-lg bg-amber-500/10 text-amber-400 shrink-0 mt-0.5">
            <Zap size={14} />
          </div>
          <div className="min-w-0">
            <span className="text-[10px] font-black uppercase tracking-wider text-amber-400 block mb-0.5">
              Hallazgo del Día · GEITO
            </span>
            <p className="text-[11.5px] font-medium text-slate-200 leading-relaxed">
              {resumen_oreo}
            </p>
          </div>
        </div>

        {/* Alerta de Cuello de Botella */}
        {cuello_de_botella && (
          <div className="relative p-2.5 sm:p-3 rounded-xl bg-gradient-to-r from-amber-950/30 via-slate-900/90 to-slate-900/80 border border-amber-500/30 flex items-start gap-2.5 shadow-sm">
            <div className="p-1 rounded-lg bg-amber-500/15 text-amber-400 shrink-0 mt-0.5">
              <AlertTriangle size={14} />
            </div>
            <div className="min-w-0">
              <span className="text-[10px] font-black uppercase tracking-wider text-amber-400 block mb-0.5">
                Punto Crítico: {cuello_de_botella.etapa}
              </span>
              <p className="text-[10.5px] text-slate-300 leading-snug">
                {cuello_de_botella.descripcion}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ─────────────────────────────────────────────────────────────
          3. CARRUSEL / GRID DE TARJETAS 3D (KPI CARDS)
          ───────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
        {tarjetas.map((card) => (
          <OreoKpiCard key={card.id || card.nombre} card={card} />
        ))}
      </div>
    </div>
  )
}
