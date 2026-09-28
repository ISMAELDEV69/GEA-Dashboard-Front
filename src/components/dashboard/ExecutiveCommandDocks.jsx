import React, { useMemo } from 'react'
import {
  Trophy,
  Award,
  TrendingUp,
  TrendingDown,
  Users,
  Target,
  Zap,
  MapPin,
  Clock,
  ArrowRight,
  AlertTriangle,
  Building2,
  CheckCircle2,
  Compass
} from 'lucide-react'

/**
 * Gráfico Donut SVG Ultra-Minimalista para Deserción y Motivos
 */
function MinimalDonutChart({ data = [], centerLabel = '5.8%', centerSub = 'DESERCIÓN' }) {
  const size = 110
  const strokeWidth = 14
  const radius = (size - strokeWidth) / 2
  const center = size / 2
  const circumference = 2 * Math.PI * radius

  const colors = ['#06b6d4', '#f59e0b', '#10b981', '#f43f5e', '#8b5cf6']

  const total = useMemo(() => {
    return data.reduce((acc, d) => acc + (d.pctActual || d.pct || 0), 0) || 100
  }, [data])

  // Calcular segmentos con strokeDasharray y strokeDashoffset
  let accumulatedPercent = 0
  const segments = data.slice(0, 5).map((item, idx) => {
    const val = item.pctActual || item.pct || 0
    const pct = val / total
    const strokeDasharray = `${pct * circumference} ${circumference}`
    const strokeDashoffset = -accumulatedPercent * circumference
    accumulatedPercent += pct

    return {
      name: item.nombre,
      pct: val,
      color: colors[idx % colors.length],
      strokeDasharray,
      strokeDashoffset
    }
  })

  return (
    <div className="relative flex items-center justify-center select-none" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="rotate-[-90deg]">
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="transparent"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={strokeWidth}
        />
        {segments.map((s, i) => (
          <circle
            key={i}
            cx={center}
            cy={center}
            r={radius}
            fill="transparent"
            stroke={s.color}
            strokeWidth={strokeWidth}
            strokeDasharray={s.strokeDasharray}
            strokeDashoffset={s.strokeDashoffset}
            strokeLinecap="round"
            className="transition-all duration-700 ease-out"
          />
        ))}
      </svg>
      {/* Texto Central */}
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
        <span className="text-sm font-black font-mono text-white leading-none tracking-tight">
          {centerLabel}
        </span>
        <span className="text-[8px] font-mono font-bold text-slate-400 uppercase tracking-widest mt-0.5">
          {centerSub}
        </span>
      </div>
    </div>
  )
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * DOCK IZQUIERDO (LEFT DOCK):
 * 1. Cobertura Dotación & RQ (Barras de avance compactas)
 * 2. Deserción & Top Motivos (Donut minimalista + Leyenda)
 * 3. Ranking Formadores (Podio de efectividad)
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function LeftExecutiveDock({ cardCobertura, cardDesercion, cardFormadores }) {
  const topMotivos = cardDesercion?.topMotivos || []

  return (
    <div className="w-full flex flex-col gap-3">
      {/* TARJETA 1: COBERTURA DOTACIÓN & RQ */}
      <div className="p-3.5 rounded-xl border border-cyan-500/25 bg-[#070e1b]/85 backdrop-blur-md shadow-[0_0_20px_rgba(6,182,212,0.1)] flex flex-col justify-between">
        <div className="flex items-center justify-between pb-2 border-b border-white/10">
          <div className="flex items-center gap-1.5 font-mono text-xs font-bold text-slate-300">
            <span className="text-cyan-400">▣</span>
            <span>COBERTURA DOTACIÓN</span>
          </div>
          <span className="px-2 py-0.5 rounded-full text-[9px] font-black font-mono bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
            RQ ACTIVO
          </span>
        </div>

        <div className="mt-2.5 flex items-baseline justify-between">
          <div>
            <div className="text-2xl font-black font-mono text-white tracking-tight drop-shadow-[0_0_10px_rgba(6,182,212,0.4)]">
              {cardCobertura?.valor_actual || '87.4%'}
            </div>
            <div className="text-[10px] text-slate-400 font-mono">
              {cardCobertura?.detalle || '166 de 190 vacantes cubiertas'}
            </div>
          </div>
          <div className="text-right">
            <span className="text-xs font-black font-mono text-emerald-400">
              {cardCobertura?.variacionMes || '+2.6%'}
            </span>
            <div className="text-[9px] text-slate-500 font-mono uppercase">vs Mes Anterior</div>
          </div>
        </div>

        {/* Barra de progreso estilizada */}
        <div className="mt-3 w-full">
          <div className="w-full h-2 rounded-full bg-slate-800/80 overflow-hidden p-0.5 border border-white/10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-blue-500 via-cyan-400 to-emerald-400 shadow-[0_0_10px_rgba(6,182,212,0.6)] transition-all duration-1000"
              style={{ width: `${Math.min(100, parseFloat(cardCobertura?.valor_actual || 87.4))}%` }}
            />
          </div>
          <div className="mt-1 flex items-center justify-between text-[9px] font-mono text-slate-400">
            <span>0%</span>
            <span className="text-cyan-300 font-bold">Meta 95%</span>
            <span>100%</span>
          </div>
        </div>
      </div>

      {/* TARJETA 2: DESERCIÓN & TOP MOTIVOS (DONUT MINIMALISTA) */}
      <div className="p-3.5 rounded-xl border border-rose-500/25 bg-[#070e1b]/85 backdrop-blur-md shadow-[0_0_20px_rgba(244,63,94,0.1)] flex flex-col">
        <div className="flex items-center justify-between pb-2 border-b border-white/10">
          <div className="flex items-center gap-1.5 font-mono text-xs font-bold text-slate-300">
            <span className="text-rose-400">▼</span>
            <span>DESERCIÓN & MOTIVOS</span>
          </div>
          <span className="px-2 py-0.5 rounded-full text-[9px] font-black font-mono bg-rose-500/20 text-rose-300 border border-rose-500/40">
            ALERTAS
          </span>
        </div>

        {/* Donut Chart + Resumen */}
        <div className="mt-2.5 flex items-center justify-between gap-3">
          <MinimalDonutChart
            data={topMotivos}
            centerLabel={cardDesercion?.valor_actual || '5.8%'}
            centerSub="TASA BAJA"
          />
          <div className="flex-1 space-y-1 text-[10px] font-mono">
            {topMotivos.slice(0, 3).map((m, idx) => {
              const mStr = String(m?.nombre || '').toLowerCase()
              const isDistancia = mStr.includes('distancia') || mStr.includes('transporte')
              return (
                <div key={idx} className="flex flex-col">
                  <div className="flex items-center justify-between">
                    <span className={`truncate max-w-[110px] ${isDistancia ? 'text-amber-300 font-bold' : 'text-slate-300'}`}>
                      {isDistancia ? '📍 Distancia Sede' : (m?.nombre || 'Motivo')}
                    </span>
                    <span className="text-white font-bold">{m?.pctActual || m?.pct || 0}%</span>
                  </div>
                  <div className="w-full h-1 rounded-full bg-slate-800 overflow-hidden mt-0.5">
                    <div
                      className={`h-full rounded-full ${isDistancia ? 'bg-amber-400' : idx === 0 ? 'bg-cyan-400' : 'bg-rose-400'}`}
                      style={{ width: `${Math.min(100, (m.pctActual || m.pct || 0) * 2)}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* TARJETA 3: RANKING FORMADORES (PODIO) */}
      <div className="p-3.5 rounded-xl border border-amber-500/25 bg-[#070e1b]/85 backdrop-blur-md shadow-[0_0_20px_rgba(245,158,11,0.1)] flex flex-col">
        <div className="flex items-center justify-between pb-2 border-b border-white/10">
          <div className="flex items-center gap-1.5 font-mono text-xs font-bold text-slate-300">
            <span className="text-amber-400">🏆</span>
            <span>FORMADORES DE ÉLITE</span>
          </div>
          <span className="px-2 py-0.5 rounded-full text-[9px] font-black font-mono bg-amber-500/20 text-amber-300 border border-amber-500/40">
            TOP AULA
          </span>
        </div>

        <div className="mt-2 space-y-1.5 font-mono">
          {(cardFormadores?.ranking || []).slice(0, 3).map((f, idx) => (
            <div
              key={idx}
              className="p-1.5 rounded-lg bg-black/40 border border-white/5 flex items-center justify-between gap-2"
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-xs shrink-0">{idx === 0 ? '🥇' : idx === 1 ? '🥈' : '🥉'}</span>
                <span className="text-[11px] text-white font-bold truncate max-w-[130px]">
                  {f.nombre}
                </span>
              </div>
              <div className="text-right shrink-0">
                <span className="text-xs font-black text-amber-300">{f.efectividad}%</span>
                <span className="text-[9px] text-slate-500 block -mt-0.5">{f.alumnosCount || 0} alumnos</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * DOCK DERECHO (RIGHT DOCK):
 * 1. Ranking Reclutadores RyS (Podio de ingresos)
 * 2. Deserción por Distrito de Residencia (Top Distritos)
 * 3. Motor de Reubicación de Sede (Acceso directo a optimización de ingresos)
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function RightExecutiveDock({
  cardReclutadores,
  distritosStats = [],
  sugerenciasReubicacion = [],
  onOpenReubicacionModal
}) {
  // Distritos con mayor cantidad de asesores
  const topDistritos = useMemo(() => {
    return [...distritosStats]
      .sort((a, b) => b.total - a.total)
      .slice(0, 4)
  }, [distritosStats])

  return (
    <div className="w-full flex flex-col gap-3">
      {/* TARJETA 1: RANKING RECLUTADORES RyS */}
      <div className="p-3.5 rounded-xl border border-cyan-500/25 bg-[#070e1b]/85 backdrop-blur-md shadow-[0_0_20px_rgba(6,182,212,0.1)] flex flex-col">
        <div className="flex items-center justify-between pb-2 border-b border-white/10">
          <div className="flex items-center gap-1.5 font-mono text-xs font-bold text-slate-300">
            <span className="text-cyan-400">🎯</span>
            <span>RECLUTADORES LÍDERES</span>
          </div>
          <span className="px-2 py-0.5 rounded-full text-[9px] font-black font-mono bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
            RyS TOP
          </span>
        </div>

        <div className="mt-2 space-y-1.5 font-mono">
          {(cardReclutadores?.ranking || []).slice(0, 3).map((r, idx) => (
            <div
              key={idx}
              className="p-1.5 rounded-lg bg-black/40 border border-white/5 flex items-center justify-between gap-2"
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-xs shrink-0">{idx === 0 ? '🥇' : idx === 1 ? '🥈' : '🥉'}</span>
                <div className="min-w-0">
                  <span className="text-[11px] text-white font-bold block truncate max-w-[120px]">
                    {r.nombre}
                  </span>
                  <span className="text-[9px] text-slate-500 truncate block">
                    {r.topCampana || 'Ventas'}
                  </span>
                </div>
              </div>
              <div className="text-right shrink-0">
                <span className="text-xs font-black text-cyan-300">{r.ingresosTotales || 0}</span>
                <span className="text-[9px] text-slate-500 block -mt-0.5">ingresos</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* TARJETA 2: DISTRITOS DE RESIDENCIA VS BAJAS */}
      <div className="p-3.5 rounded-xl border border-slate-700/60 bg-[#070e1b]/85 backdrop-blur-md shadow-[0_0_20px_rgba(100,116,139,0.1)] flex flex-col">
        <div className="flex items-center justify-between pb-2 border-b border-white/10">
          <div className="flex items-center gap-1.5 font-mono text-xs font-bold text-slate-300">
            <span className="text-amber-400">📍</span>
            <span>RESIDENCIA VS BAJAS</span>
          </div>
          <span className="px-2 py-0.5 rounded-full text-[9px] font-black font-mono bg-slate-800 text-slate-300 border border-white/10">
            LIMA METRO
          </span>
        </div>

        <div className="mt-2 space-y-1 font-mono">
          {topDistritos.map((d, idx) => (
            <div key={idx} className="flex items-center justify-between text-[10px] py-1 border-b border-white/5">
              <span className="text-slate-300 font-bold truncate max-w-[110px]">
                {d.distrito}
              </span>
              <div className="flex items-center gap-2">
                <span className="text-slate-400">{d.total} asesores</span>
                <span className={`px-1.5 py-0.2 rounded font-bold ${d.bajas > 2 ? 'bg-rose-500/20 text-rose-300' : 'bg-emerald-500/20 text-emerald-300'}`}>
                  {d.tasaBaja}% baja
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* TARJETA 3: MOTOR DE REUBICACIÓN DE SEDE (OPORTUNIDAD DE INGRESOS) */}
      <div className="p-3.5 rounded-xl border border-emerald-500/40 bg-gradient-to-b from-emerald-950/30 to-[#070e1b]/95 backdrop-blur-md shadow-[0_0_25px_rgba(16,185,129,0.15)] flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between pb-2 border-b border-emerald-500/20">
            <div className="flex items-center gap-1.5 font-mono text-xs font-bold text-emerald-300">
              <Zap size={13} className="text-emerald-400 animate-pulse" />
              <span>REUBICACIÓN SEDES</span>
            </div>
            <span className="px-2 py-0.5 rounded-full text-[9px] font-black font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/50">
              MCP ACTIVO
            </span>
          </div>

          <div className="mt-2 text-[11px] text-slate-300 font-mono leading-tight">
            Hay <strong className="text-emerald-400">{sugerenciasReubicacion.length} postulantes</strong> con trayectos &gt;14km a quienes conviene asignarles otra sede GEA más cercana.
          </div>

          {/* Mini preview de candidato a reubicación */}
          {sugerenciasReubicacion.length > 0 && (
            <div className="mt-2 p-2 rounded-lg bg-black/50 border border-emerald-500/30 font-mono text-[10px]">
              <div className="flex items-center justify-between text-white font-bold">
                <span className="truncate max-w-[120px]">{sugerenciasReubicacion[0].nombre || sugerenciasReubicacion[0].candidato || 'Postulante'}</span>
                <span className="text-emerald-400">-{sugerenciasReubicacion[0].ahorroKm || 0} km</span>
              </div>
              <div className="text-slate-400 flex items-center gap-1 mt-0.5">
                <span>{sugerenciasReubicacion[0].distrito}</span>
                <ArrowRight size={10} className="text-emerald-400" />
                <span className="text-emerald-300">{sugerenciasReubicacion[0].sedeSugerida}</span>
              </div>
            </div>
          )}
        </div>

        {/* Botón CTA para abrir Modal de Reubicación */}
        <button
          onClick={onOpenReubicacionModal}
          className="mt-3 w-full py-2 px-3 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black font-mono text-xs tracking-wider uppercase transition-all shadow-[0_0_15px_rgba(16,185,129,0.5)] cursor-pointer flex items-center justify-center gap-1.5 active:scale-95"
        >
          <Zap size={13} />
          <span>Ver Sugerencias ({sugerenciasReubicacion.length})</span>
        </button>
      </div>
    </div>
  )
}
