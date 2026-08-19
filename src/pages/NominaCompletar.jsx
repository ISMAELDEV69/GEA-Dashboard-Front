import React, { useState, useMemo, useEffect, useRef } from 'react'
import { Layers, Eye, ArrowRight, Sparkles, Loader2 } from 'lucide-react'
import NominaGridEditor from '../components/nomina/NominaGridEditor'
import NominaFullPreview from '../components/nomina/NominaFullPreview'
import { inferSegmento, SEGMENTOS_SIU } from '../lib/capacidadRysSync'
import PageLayout from '../components/ui/PageLayout'
import PageHeader from '../components/ui/PageHeader'
import { supabase } from '../lib/supabase'

// ── Doc completeness columns (full set per spec) ─────────────────
const DOC_COLS = ['doc_cv', 'doc_dni_adjunto', 'doc_certijoven', 'doc_recibo_servicios', 'doc_ficha_datos', 'doc_autorizacion', 'status_final']

function calcCompleteness(rows) {
  const total = rows.length
  if (!total) return { total: 0, complete: 0, pct: 0 }
  let complete = 0
  for (const r of rows) {
    if ((r.status_final || '').toUpperCase() === 'COMPLETO') { complete++; continue }
    const allOk =
      (r.doc_cv || '').toUpperCase() === 'OK' &&
      (r.doc_dni_adjunto || '').toUpperCase() === 'OK' &&
      (r.doc_certijoven || '').toUpperCase() === 'OK' &&
      (r.doc_recibo_servicios || '').toUpperCase() === 'OK' &&
      (r.doc_ficha_datos || '').toUpperCase() === 'OK' &&
      (r.doc_autorizacion || '').toUpperCase() === 'OK'
    if (allOk) complete++
  }
  return { total, complete, pct: Math.round((complete / total) * 100) }
}

function CompletenessBar({ pct, complete, total }) {
  const color = pct >= 80 ? '#10b981' : pct >= 50 ? '#f59e0b' : '#ef4444'
  return (
    <div className="space-y-1 mt-2">
      <div className="flex items-center justify-between text-[10px] font-bold">
        <span style={{ color }} className="tabular-nums">{complete}/{total} completos</span>
        <span className="px-1.5 py-0.5 rounded-full font-black" style={{ color, background: `${color}22`, border: `1px solid ${color}44` }}>{pct}%</span>
      </div>
      <div className="w-full h-1.5 rounded-full bg-white/5 overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${color}99, ${color})`, boxShadow: `0 0 6px ${color}66` }} />
      </div>
    </div>
  )
}

import { filterPostulantesReclutador } from '../lib/flujoOperativo'

export default function NominaCompletar({
  grupos = [],
  userProfile = null,
  currentRole = null,
  postulantes = [],
  reclutadores = []
}) {
  const isReclutador = currentRole === 'reclutador'

  const effectiveGrupos = useMemo(() => {
    if (!isReclutador) return grupos
    const myPostulantes = filterPostulantesReclutador(postulantes, userProfile, reclutadores)
    const myGroupCodes = new Set(myPostulantes.map(p => p.grupo_codigo ? String(p.grupo_codigo).trim() : null).filter(Boolean))
    const filtered = grupos.filter(g => myGroupCodes.has(String(g.codigo).trim()))
    return filtered.length > 0 ? filtered : grupos.slice(0, 10)
  }, [grupos, isReclutador, postulantes, userProfile, reclutadores])

  const getPeriodoVal = (g) => g?.periodo ? String(g.periodo).trim() : ''
  const getSemanaVal = (g) => g ? String(g.semana_label || g.semana_trabajo || g.semana || '').trim() : ''
  const getSegmentoVal = (g) => {
    if (!g) return ''
    const seg = g.segmento || inferSegmento(g.campana || '')
    return String(seg || '').trim().toUpperCase()
  }
  const getCampanaVal = (g) => g ? String(g.campana || g.campana_nombre || '').trim().toUpperCase() : ''

  const [bulkPeriodo, setBulkPeriodo] = useState('')
  const [bulkSemana, setBulkSemana] = useState('')
  const [bulkSegmento, setBulkSegmento] = useState('')
  const [bulkCampana, setBulkCampana] = useState('')
  const [bulkGrupo, setBulkGrupo] = useState('')
  const [showFullPreview, setShowFullPreview] = useState(false)
  // ── Completeness stats per grupo_codigo: { [code]: { total, complete, pct, loading } }
  const [statsMap, setStatsMap] = useState({})
  const fetchedCodesRef = useRef(new Set())

  const bulkPeriodos = useMemo(() => {
    return [...new Set(effectiveGrupos.map(g => getPeriodoVal(g)).filter(Boolean))].sort().reverse()
  }, [effectiveGrupos])

  const bulkSemanas = useMemo(() => {
    let filtered = effectiveGrupos
    if (bulkPeriodo) filtered = filtered.filter(g => getPeriodoVal(g) === String(bulkPeriodo).trim())
    const unique = [...new Set(filtered.map(g => getSemanaVal(g)).filter(Boolean))]
    return unique.sort((a, b) => {
      const numA = parseInt(String(a).replace(/\D/g, '')) || 0
      const numB = parseInt(String(b).replace(/\D/g, '')) || 0
      return numA - numB
    })
  }, [effectiveGrupos, bulkPeriodo])

  const bulkSegmentos = useMemo(() => {
    let filtered = effectiveGrupos
    if (bulkPeriodo) filtered = filtered.filter(g => getPeriodoVal(g) === String(bulkPeriodo).trim())
    if (bulkSemana) filtered = filtered.filter(g => getSemanaVal(g) === String(bulkSemana).trim())
    const fromGrupos = filtered.map(g => getSegmentoVal(g)).filter(Boolean)
    return [...new Set(fromGrupos)].sort()
  }, [effectiveGrupos, bulkPeriodo, bulkSemana])

  const bulkCampanas = useMemo(() => {
    let filtered = effectiveGrupos
    if (bulkPeriodo) filtered = filtered.filter(g => getPeriodoVal(g) === String(bulkPeriodo).trim())
    if (bulkSemana) filtered = filtered.filter(g => getSemanaVal(g) === String(bulkSemana).trim())
    if (bulkSegmento) filtered = filtered.filter(g => getSegmentoVal(g) === String(bulkSegmento).trim().toUpperCase())
    return [...new Set(filtered.map(g => getCampanaVal(g)).filter(Boolean))].sort()
  }, [effectiveGrupos, bulkPeriodo, bulkSemana, bulkSegmento])

  const bulkGruposList = useMemo(() => {
    let filtered = effectiveGrupos
    if (bulkPeriodo) filtered = filtered.filter(g => getPeriodoVal(g) === String(bulkPeriodo).trim())
    if (bulkSemana) filtered = filtered.filter(g => getSemanaVal(g) === String(bulkSemana).trim())
    if (bulkSegmento) filtered = filtered.filter(g => getSegmentoVal(g) === String(bulkSegmento).trim().toUpperCase())
    if (bulkCampana) filtered = filtered.filter(g => getCampanaVal(g) === String(bulkCampana).trim().toUpperCase())
    
    // Remove duplicates
    const unique = []
    const seen = new Set()
    for (const g of filtered) {
      const cod = String(g.codigo || g.grupo_codigo || '').trim()
      if (cod && !seen.has(cod)) {
        seen.add(cod)
        unique.push(g)
      }
    }
    return unique.sort((a, b) => String(a.codigo || a.grupo_codigo || '').localeCompare(String(b.codigo || b.grupo_codigo || '')))
  }, [effectiveGrupos, bulkPeriodo, bulkSemana, bulkSegmento, bulkCampana])

  // ── Batch-fetch completeness for visible group cards ──────────
  useEffect(() => {
    const visibleCodes = bulkGruposList.slice(0, 16).map(g => g.codigo)
    const newCodes = visibleCodes.filter(c => !fetchedCodesRef.current.has(c))
    if (!newCodes.length) return

    // Optimistic: mark loading
    setStatsMap(prev => {
      const upd = {}
      newCodes.forEach(c => { upd[c] = { total: 0, complete: 0, pct: 0, loading: true } })
      return { ...prev, ...upd }
    })
    newCodes.forEach(c => fetchedCodesRef.current.add(c))

    const batchFetch = async (codes) => {
      try {
        const { data, error } = await supabase
          .from('nominas')
          .select(`grupo_codigo, ${DOC_COLS.join(', ')}`)
          .in('grupo_codigo', codes)
        if (error) throw error
        const grouped = {}
        for (const row of (data || [])) {
          if (!grouped[row.grupo_codigo]) grouped[row.grupo_codigo] = []
          grouped[row.grupo_codigo].push(row)
        }
        setStatsMap(prev => {
          const upd = {}
          codes.forEach(c => { upd[c] = { ...calcCompleteness(grouped[c] || []), loading: false } })
          return { ...prev, ...upd }
        })
      } catch (err) {
        console.error('Completeness fetch error:', err)
        setStatsMap(prev => {
          const upd = {}
          codes.forEach(c => { upd[c] = { total: 0, complete: 0, pct: 0, loading: false } })
          return { ...prev, ...upd }
        })
      }
    }
    // Split into batches of 8 to avoid overly large IN clauses
    for (let i = 0; i < newCodes.length; i += 8) batchFetch(newCodes.slice(i, i + 8))
  }, [bulkGruposList])

  // Refresh a single group's stat (called after save in editor)
  const refreshGroupStat = async (codigo) => {
    if (!codigo) return
    try {
      const { data } = await supabase
        .from('nominas')
        .select(`grupo_codigo, ${DOC_COLS.join(', ')}`)
        .eq('grupo_codigo', codigo)
      setStatsMap(prev => ({ ...prev, [codigo]: { ...calcCompleteness(data || []), loading: false } }))
    } catch (_) { /* silent */ }
  }

  const handleSelectGrupoDirect = (grupo) => {
    setBulkGrupo(grupo.codigo)
    setBulkCampana(grupo.campana || '')
    setBulkSegmento(grupo.segmento ? String(grupo.segmento).trim() : inferSegmento(grupo.campana))
    if (grupo.periodo) setBulkPeriodo(grupo.periodo)
  }

  const handleResetFilters = () => {
    setBulkPeriodo('')
    setBulkSegmento('')
    setBulkCampana('')
    setBulkGrupo('')
  }

  return (
    <PageLayout className="p-4 md:p-6 space-y-6 overflow-y-auto">
      {/* ── HEADER ── */}
      <PageHeader
        title="Gestión y Completitud de Nóminas"
        subtitle="Registro documental, validaciones y calibración de postulantes por grupo"
        actions={
          <div className="flex items-center gap-3">
            {bulkGrupo && (
              <button
                onClick={handleResetFilters}
                className="text-xs font-bold px-3 py-2 rounded-xl border border-[var(--border-normal)] bg-[var(--bg-surface)] hover:bg-[var(--bg-elevated)] text-[var(--text-secondary)] transition-all"
              >
                Limpiar Selección
              </button>
            )}
            <button
              disabled={!bulkGrupo}
              onClick={() => setShowFullPreview(true)}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 font-bold rounded-xl text-xs transition-all border border-emerald-500/30 disabled:opacity-40 disabled:cursor-not-allowed shadow-[0_0_15px_rgba(16,185,129,0.15)]"
            >
              <Eye size={15} />
              NÓMINA COMPLETA (VISTA PREVIA)
            </button>
          </div>
        }
      />

      {/* ── CASCADE FILTERS BAR (Modular Glassmorphic Cards) ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {/* PERIODO */}
        <div
          className={`relative rounded-xl p-3 flex flex-col justify-between transition-all bg-[var(--bg-elevated)] border ${
            bulkPeriodo ? 'border-cyan-500 shadow-[0_0_14px_-2px_rgba(0,245,255,0.2)]' : 'border-[var(--border-subtle)]'
          }`}
        >
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-[var(--text-muted)]">PERIODO</span>
            {bulkPeriodo && (
              <span className="px-1.5 py-0.2 text-[9px] font-bold rounded bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 border border-cyan-500/30">
                Activo
              </span>
            )}
          </div>
          <select
            value={bulkPeriodo}
            onChange={e => { 
              setBulkPeriodo(e.target.value); 
              setBulkSemana('');
              setBulkSegmento(''); 
              setBulkCampana(''); 
              setBulkGrupo('') 
            }}
            className="w-full text-xs font-semibold rounded-lg bg-[var(--input-bg)] border border-[var(--input-border)] text-[var(--text-primary)] p-2 outline-none focus:border-cyan-400 transition-colors"
          >
            <option value="">Todos los Periodos</option>
            {bulkPeriodos.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>

        {/* SEMANA */}
        <div
          className={`relative rounded-xl p-3 flex flex-col justify-between transition-all bg-[var(--bg-elevated)] border ${
            bulkSemana ? 'border-blue-500 shadow-[0_0_14px_-2px_rgba(59,130,246,0.2)]' : 'border-[var(--border-subtle)]'
          }`}
        >
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-[var(--text-muted)]">SEMANA</span>
            {bulkSemana && (
              <span className="px-1.5 py-0.2 text-[9px] font-bold rounded bg-blue-500/20 text-blue-600 dark:text-blue-400 border border-blue-500/30">
                Activo
              </span>
            )}
          </div>
          <select
            value={bulkSemana}
            onChange={e => { 
              setBulkSemana(e.target.value); 
              setBulkSegmento(''); 
              setBulkCampana(''); 
              setBulkGrupo('') 
            }}
            className="w-full text-xs font-semibold rounded-lg bg-[var(--input-bg)] border border-[var(--input-border)] text-[var(--text-primary)] p-2 outline-none focus:border-blue-400 transition-colors"
          >
            <option value="">Todas las Semanas</option>
            {bulkSemanas.map(s => (
              <option key={s} value={s}>
                {s.toUpperCase().startsWith('SEM') ? s : `Semana ${s}`}
              </option>
            ))}
          </select>
        </div>

        {/* SEGMENTO */}
        <div
          className={`relative rounded-xl p-3 flex flex-col justify-between transition-all bg-[var(--bg-elevated)] border ${
            bulkSegmento ? 'border-purple-500 shadow-[0_0_14px_-2px_rgba(191,95,255,0.2)]' : 'border-[var(--border-subtle)]'
          }`}
        >
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-[var(--text-muted)]">SEGMENTO</span>
            {bulkSegmento && (
              <span className="px-1.5 py-0.2 text-[9px] font-bold rounded bg-purple-500/20 text-purple-600 dark:text-purple-400 border border-purple-500/30">
                Activo
              </span>
            )}
          </div>
          <select
            value={bulkSegmento}
            onChange={e => { 
              setBulkSegmento(e.target.value); 
              setBulkCampana(''); 
              setBulkGrupo('') 
            }}
            className="w-full text-xs font-semibold rounded-lg bg-[var(--input-bg)] border border-[var(--input-border)] text-[var(--text-primary)] p-2 outline-none focus:border-purple-400 transition-colors"
          >
            <option value="">Todos los Segmentos</option>
            {bulkSegmentos.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        {/* CAMPAÑA */}
        <div
          className={`relative rounded-xl p-3 flex flex-col justify-between transition-all bg-[var(--bg-elevated)] border ${
            bulkCampana ? 'border-orange-500 shadow-[0_0_14px_-2px_rgba(255,122,0,0.2)]' : 'border-[var(--border-subtle)]'
          }`}
        >
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-[var(--text-muted)]">CAMPAÑA</span>
            {bulkCampana && (
              <span className="px-1.5 py-0.2 text-[9px] font-bold rounded bg-orange-500/20 text-orange-600 dark:text-orange-400 border border-orange-500/30">
                Activo
              </span>
            )}
          </div>
          <select
            value={bulkCampana}
            onChange={e => {
              const c = e.target.value;
              setBulkCampana(c);
              setBulkGrupo('');
              const match = effectiveGrupos.find(g => getCampanaVal(g) === String(c || '').trim().toUpperCase());
              if (match) {
                if (!bulkSegmento) setBulkSegmento(getSegmentoVal(match));
                if (!bulkPeriodo && match.periodo) setBulkPeriodo(getPeriodoVal(match));
                if (!bulkSemana && getSemanaVal(match)) setBulkSemana(getSemanaVal(match));
              }
            }}
            className="w-full text-xs font-semibold rounded-lg bg-[var(--input-bg)] border border-[var(--input-border)] text-[var(--text-primary)] p-2 outline-none focus:border-orange-400 transition-colors"
          >
            <option value="">Todas las Campañas</option>
            {bulkCampanas.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        {/* GRUPO GPE */}
        <div
          className={`relative rounded-xl p-3 flex flex-col justify-between transition-all bg-[var(--bg-elevated)] border ${
            bulkGrupo ? 'border-emerald-500 shadow-[0_0_16px_-2px_rgba(57,255,20,0.25)]' : 'border-[var(--border-subtle)]'
          }`}
        >
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-[var(--text-muted)]">GRUPO GPE</span>
            {bulkGrupo && (
              <span className="px-1.5 py-0.2 text-[9px] font-bold rounded bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                Seleccionado
              </span>
            )}
          </div>
          <select
            value={bulkGrupo}
            onChange={e => {
              const cod = e.target.value;
              setBulkGrupo(cod);
              const match = bulkGruposList.find(g => String(g.codigo || g.grupo_codigo || '').trim().toUpperCase() === String(cod || '').trim().toUpperCase())
                || effectiveGrupos.find(g => String(g.codigo || g.grupo_codigo || '').trim().toUpperCase() === String(cod || '').trim().toUpperCase());
              if (match) {
                if (!bulkPeriodo && match.periodo) setBulkPeriodo(getPeriodoVal(match));
                if (!bulkSemana && getSemanaVal(match)) setBulkSemana(getSemanaVal(match));
                if (!bulkSegmento) setBulkSegmento(getSegmentoVal(match));
                if (!bulkCampana && match.campana) setBulkCampana(getCampanaVal(match));
              }
            }}
            className="w-full text-xs font-semibold rounded-lg bg-[var(--input-bg)] border border-[var(--input-border)] text-[var(--text-primary)] p-2 outline-none focus:border-emerald-400 transition-colors"
          >
            <option value="">Seleccione Grupo ({bulkGruposList.length} disponibles)</option>
            {bulkGruposList.map(g => (
              <option key={g.codigo || g.grupo_codigo} value={g.codigo || g.grupo_codigo}>
                {String(g.codigo || g.grupo_codigo).startsWith('PROY-') ? '—' : String(g.codigo || g.grupo_codigo).replace(/_\d+$/, '')} {g.campana ? `· ${g.campana}` : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ── GRID VIEWER OR INTERACTIVE EMPTY STATE ── */}
      {bulkGrupo ? (
        <div className="animate-fadeIn">
          <NominaGridEditor
            grupoCodigo={bulkGrupo}
            campana={bulkCampana}
            userProfile={userProfile}
            currentRole={currentRole}
            reclutadores={reclutadores}
            onSaveComplete={() => refreshGroupStat(bulkGrupo)}
          />
        </div>
      ) : (
        <div
          className="p-6 md:p-8 rounded-2xl border border-[var(--border-subtle)] space-y-6 transition-colors"
          style={{
            background: 'var(--bg-elevated)',
            boxShadow: 'var(--card-shadow, 0 4px 20px rgba(0,0,0,0.06))'
          }}
        >
          <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20">
                <Sparkles size={20} />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-[var(--text-primary)]">Grupos Recientes / Pendientes</h3>
                <p className="text-xs text-[var(--text-muted)]">
                  Haz clic en cualquiera de los siguientes grupos para abrir directamente su grilla de edición
                </p>
              </div>
            </div>
            <span className="text-xs font-bold px-3 py-1 rounded-full bg-[var(--bg-surface)] text-[var(--text-secondary)] border border-[var(--border-subtle)]">
              {bulkGruposList.length} Grupos
            </span>
          </div>

          {bulkGruposList.length === 0 ? (
            <div className="py-12 text-center text-[var(--text-muted)]">
              No hay grupos que coincidan con los filtros seleccionados. Intenta ampliar el Periodo o Segmento.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {bulkGruposList.slice(0, 16).map(g => {
                const cleanCode = String(g.codigo).startsWith('PROY-') ? '—' : String(g.codigo).replace(/_\d+$/, '')
                const stat = statsMap[g.codigo]
                const pct = stat ? stat.pct : null
                // Border color reflects completeness
                const accentColor =
                  pct === null ? 'var(--border-subtle)' :
                  pct >= 80   ? 'rgba(16,185,129,0.5)' :
                  pct >= 50   ? 'rgba(245,158,11,0.5)' :
                                'rgba(239,68,68,0.4)'
                return (
                  <div
                    key={g.codigo}
                    onClick={() => handleSelectGrupoDirect(g)}
                    className="group relative p-4 rounded-xl cursor-pointer transition-all duration-300 flex flex-col gap-2 hover:-translate-y-1 hover:shadow-lg bg-[var(--bg-surface)]"
                    style={{
                      border: `1px solid ${accentColor}`,
                    }}
                  >
                    {/* Code + period */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-mono text-sm font-black text-cyan-600 dark:text-cyan-400 group-hover:text-cyan-500">
                          {cleanCode}
                        </span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                          {g.periodo || 'Activo'}
                        </span>
                      </div>
                      <div className="text-xs font-semibold text-[var(--text-primary)] truncate mt-0.5">
                        {g.campana || 'Sin campaña'}
                      </div>
                      <div className="text-[10px] text-[var(--text-muted)] mt-0.5 truncate">
                        {g.segmento || inferSegmento(g.campana)}
                      </div>
                    </div>

                    {/* Completeness bar */}
                    {stat?.loading ? (
                      <div className="flex items-center gap-1.5 text-[10px] text-[var(--text-muted)]">
                        <Loader2 size={10} className="animate-spin" /> Calculando...
                      </div>
                    ) : stat && stat.total > 0 ? (
                      <CompletenessBar pct={stat.pct} complete={stat.complete} total={stat.total} />
                    ) : stat && stat.total === 0 ? (
                      <div className="text-[10px] text-[var(--text-muted)]">Sin postulantes</div>
                    ) : null}

                    {/* CTA footer */}
                    <div className="flex items-center justify-between pt-2 border-t border-[var(--border-subtle)] text-xs text-cyan-600 dark:text-cyan-400 font-bold group-hover:text-cyan-500">
                      <span>Abrir Nómina</span>
                      <ArrowRight size={14} className="transform group-hover:translate-x-1 transition-transform" />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── FULL PREVIEW MODAL ── */}
      {showFullPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/70 backdrop-blur-md animate-fadeIn">
          <div
            className="w-full max-w-screen-2xl h-full sm:h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-[var(--border-subtle)] animate-slideUp"
            style={{ background: 'var(--bg-surface)' }}
          >
            <div className="px-6 py-4 border-b border-[var(--border-subtle)] flex justify-between items-center bg-[var(--bg-elevated)]">
              <h2 className="text-base font-black text-[var(--text-primary)] flex items-center gap-2">
                <Layers size={18} className="text-emerald-400" /> Nómina Completa (Vista Previa)
              </h2>
              <button
                onClick={() => setShowFullPreview(false)}
                className="px-3 py-1.5 text-xs font-bold text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-colors border border-transparent hover:border-red-500/20"
              >
                Cerrar Ventana
              </button>
            </div>
            <div className="flex-1 overflow-hidden p-0">
              <NominaFullPreview grupoCodigo={bulkGrupo} campana={bulkCampana} />
            </div>
          </div>
        </div>
      )}
    </PageLayout>
  )
}
