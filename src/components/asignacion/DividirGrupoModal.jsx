import React, { useState, useEffect, useMemo } from 'react'
import {
  X, Split, Users, UserCheck, AlertTriangle, CheckCircle2,
  Loader2, ArrowRight, Sparkles, RefreshCw, Layers
} from 'lucide-react'
import { fetchPostulantesPorGrupo, dividirGrupoBulk } from '../../lib/dataService'
import { isSubgroupCode } from '../../lib/flujoOperativo'

export default function DividirGrupoModal({
  isOpen,
  onClose,
  grupo,
  formadores = [],
  onSuccess
}) {
  const [numSubgrupos, setNumSubgrupos] = useState(2)
  const [postulantes, setPostulantes] = useState([])
  const [loadingPostulantes, setLoadingPostulantes] = useState(false)
  const [subgrupoFormadores, setSubgrupoFormadores] = useState({
    1: '',
    2: '',
    3: ''
  })
  const [assignments, setAssignments] = useState({}) // { [dni]: subgrupoIndex (1, 2, 3) }
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState(null)
  const [successMsg, setSuccessMsg] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')

  const parentCodigo = grupo?.codigo || ''
  const campana = grupo?.campana || ''

  // Cargar postulantes del grupo
  useEffect(() => {
    if (!isOpen || !parentCodigo) return

    setLoadingPostulantes(true)
    setErrorMsg(null)
    setSuccessMsg(null)
    setAssignments({})

    fetchPostulantesPorGrupo(parentCodigo, campana)
      .then(data => {
        setPostulantes(data || [])
        // Inicializar formador 1 con el formador actual del grupo si existe
        setSubgrupoFormadores({
          1: grupo?.formador_documento || '',
          2: '',
          3: ''
        })

        // Auto-repartir 50/50 por defecto
        const initial = {}
        data.forEach((p, idx) => {
          initial[p.documento] = (idx % 2) + 1
        })
        setAssignments(initial)
      })
      .catch(err => {
        console.error(err)
        setErrorMsg('Error al cargar la nómina de postulantes del grupo.')
      })
      .finally(() => {
        setLoadingPostulantes(false)
      })
  }, [isOpen, parentCodigo, campana])

  // Ajustar asignaciones si cambia numSubgrupos
  const handleNumSubgruposChange = (n) => {
    setNumSubgrupos(n)
    setAssignments(prev => {
      const next = { ...prev }
      Object.keys(next).forEach(dni => {
        if (next[dni] > n) {
          next[dni] = 1
        }
      })
      return next
    })
  }

  // Reparto equitativo automático
  const autoDistribuir = () => {
    const next = {}
    postulantes.forEach((p, idx) => {
      next[p.documento] = (idx % numSubgrupos) + 1
    })
    setAssignments(next)
  }

  // Conteo por subgrupo
  const countsBySubgrupo = useMemo(() => {
    const counts = { 1: 0, 2: 0, 3: 0, unassigned: 0 }
    postulantes.forEach(p => {
      const s = assignments[p.documento]
      if (s && s <= numSubgrupos) {
        counts[s] = (counts[s] || 0) + 1
      } else {
        counts.unassigned++
      }
    })
    return counts
  }, [postulantes, assignments, numSubgrupos])

  // Postulantes filtrados por búsqueda
  const filteredPostulantes = useMemo(() => {
    if (!searchTerm) return postulantes
    const t = searchTerm.trim().toUpperCase()
    return postulantes.filter(p =>
      String(p.documento).includes(t) ||
      String(p.nombres_completos || '').toUpperCase().includes(t) ||
      String(p.apellido_paterno || '').toUpperCase().includes(t)
    )
  }, [postulantes, searchTerm])

  // Guardar y ejecutar split transaccional
  const handleConfirmSplit = async () => {
    setErrorMsg(null)
    setSuccessMsg(null)

    if (isSubgroupCode(parentCodigo)) {
      setErrorMsg(`El código ${parentCodigo} ya es un subgrupo y no puede volverse a dividir.`)
      return
    }

    if (!campana) {
      setErrorMsg('No se especificó la campaña del grupo.')
      return
    }

    // Validar que cada subgrupo tenga al menos 1 postulante
    for (let i = 1; i <= numSubgrupos; i++) {
      if (!countsBySubgrupo[i] || countsBySubgrupo[i] === 0) {
        setErrorMsg(`El Subgrupo ${parentCodigo}-${i} debe tener al menos 1 postulante asignado.`)
        return
      }
    }

    // Construir payload
    const distribucion = []
    for (let i = 1; i <= numSubgrupos; i++) {
      const subCodigo = `${parentCodigo}-${i}`
      const docFormador = subgrupoFormadores[i] || null
      const dnis = postulantes
        .filter(p => assignments[p.documento] === i)
        .map(p => p.documento)

      distribucion.push({
        subgrupo: subCodigo,
        doc_formador: docFormador,
        dnis
      })
    }

    setSubmitting(true)
    try {
      const result = await dividirGrupoBulk({
        parentCodigo,
        campana,
        distribucion
      })

      setSuccessMsg(`¡Grupo dividido exitosamente en ${numSubgrupos} subgrupos!`)
      setTimeout(() => {
        if (onSuccess) onSuccess(result)
        onClose()
      }, 1500)
    } catch (err) {
      console.error(err)
      setErrorMsg(err.message || 'Error al ejecutar la división del grupo.')
    } finally {
      setSubmitting(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-fadeIn">
      <div className="bg-[var(--bg-surface)] border border-[var(--border-normal)] rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        
        {/* HEADER */}
        <div className="px-6 py-4 border-b border-[var(--border-subtle)] flex items-center justify-between bg-[var(--bg-elevated)] shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
              <Split size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-black text-[var(--text-primary)]">
                  DIVIDIR GRUPO EN SUBGRUPOS
                </h2>
                <span className="font-mono text-xs px-2 py-0.5 rounded-md bg-blue-500/15 text-blue-400 font-bold border border-blue-500/30">
                  {parentCodigo}
                </span>
              </div>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                Campaña: <span className="font-semibold text-[var(--text-secondary)]">{campana || '—'}</span> • 
                Total Postulantes: <span className="font-bold text-[var(--text-primary)]">{postulantes.length}</span>
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            disabled={submitting}
            className="p-2 rounded-xl text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-muted)] transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* BODY */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          
          {/* ALERTAS */}
          {errorMsg && (
            <div className="p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs font-semibold text-rose-500 flex items-center gap-2.5 animate-fadeIn">
              <AlertTriangle size={16} className="shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-xs font-semibold text-emerald-500 flex items-center gap-2.5 animate-fadeIn">
              <CheckCircle2 size={16} className="shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* CONFIGURACIÓN DE CANTIDAD DE SUBGRUPOS */}
          <div className="bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Layers size={18} className="text-[var(--accent)]" />
              <div>
                <div className="text-xs font-bold text-[var(--text-primary)]">Número de Subgrupos a Crear:</div>
                <div className="text-[11px] text-[var(--text-muted)]">Cada subgrupo tendrá su propia formadora y lista de asistencia.</div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {[2, 3].map(n => (
                <button
                  key={n}
                  onClick={() => handleNumSubgruposChange(n)}
                  disabled={submitting}
                  className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${
                    numSubgrupos === n
                      ? 'bg-[var(--accent)] text-white shadow-md'
                      : 'bg-[var(--bg-surface)] text-[var(--text-secondary)] border border-[var(--border-subtle)] hover:border-[var(--accent)]/40'
                  }`}
                >
                  {n} Subgrupos ({parentCodigo}-1 .. -{n})
                </button>
              ))}

              <button
                onClick={autoDistribuir}
                disabled={submitting || postulantes.length === 0}
                className="btn-secondary text-xs flex items-center gap-1.5 ml-2 font-bold text-teal-400 border-teal-500/30 hover:bg-teal-500/10"
                title="Distribuir equitativamente en partes iguales"
              >
                <Sparkles size={13} /> Repartir Equitativo
              </button>
            </div>
          </div>

          {/* TARJETAS DE FORMADORAS POR SUBGRUPO */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {Array.from({ length: numSubgrupos }, (_, i) => i + 1).map(idx => {
              const subCode = `${parentCodigo}-${idx}`
              const count = countsBySubgrupo[idx] || 0
              const pct = postulantes.length > 0 ? Math.round((count / postulantes.length) * 100) : 0

              return (
                <div
                  key={idx}
                  className="p-3.5 rounded-xl border border-[var(--border-normal)] bg-[var(--bg-elevated)] flex flex-col gap-2.5 shadow-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-black text-[var(--accent)]">
                      {subCode}
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-400 font-bold text-[10px] border border-blue-500/20">
                      {count} alumnos ({pct}%)
                    </span>
                  </div>

                  {/* Formador Select */}
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] block mb-1">
                      Formador Asignado:
                    </label>
                    <select
                      value={subgrupoFormadores[idx] || ''}
                      onChange={e => setSubgrupoFormadores(prev => ({ ...prev, [idx]: e.target.value }))}
                      disabled={submitting}
                      className="form-input w-full py-1.5 px-2 text-xs rounded-lg font-semibold"
                    >
                      <option value="">● [Pendiente] Asignar Formador</option>
                      {formadores.map(f => (
                        <option key={f.documento} value={f.documento}>
                          ✓ {f.nombres_completos} {f.segmento ? `(${f.segmento})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )
            })}
          </div>

          {/* TABLA DE ASIGNACIÓN DE POSTULANTES */}
          <div className="border border-[var(--border-subtle)] rounded-xl overflow-hidden bg-[var(--bg-surface)]">
            <div className="p-3 border-b border-[var(--border-subtle)] bg-[var(--bg-elevated)] flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs font-bold text-[var(--text-primary)]">
                Lista de Postulantes ({filteredPostulantes.length} de {postulantes.length})
              </span>

              <input
                type="text"
                placeholder="Buscar DNI o nombres..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="form-input py-1 px-2.5 text-xs rounded-lg max-w-[220px]"
              />
            </div>

            {loadingPostulantes ? (
              <div className="py-12 flex flex-col items-center justify-center gap-2 text-[var(--text-muted)]">
                <Loader2 size={24} className="animate-spin text-[var(--accent)]" />
                <span className="text-xs font-medium">Cargando postulantes del grupo...</span>
              </div>
            ) : postulantes.length === 0 ? (
              <div className="py-8 text-center text-xs text-[var(--text-muted)] font-medium">
                No se encontraron postulantes registrados para este grupo.
              </div>
            ) : (
              <div className="max-h-[260px] overflow-y-auto divide-y divide-[var(--border-subtle)] table-scroll">
                {filteredPostulantes.map(p => {
                  const currentSub = assignments[p.documento] || 1
                  return (
                    <div
                      key={p.documento}
                      className="px-3.5 py-2 flex items-center justify-between gap-3 hover:bg-[var(--bg-muted)] transition-colors text-xs"
                    >
                      <div className="flex items-center gap-2.5 min-w-[200px]">
                        <span className="font-mono text-[11px] font-bold text-[var(--text-primary)]">
                          {p.documento}
                        </span>
                        <span className="font-semibold text-[var(--text-secondary)] uppercase truncate max-w-[240px]">
                          {p.nombres_completos || `${p.apellido_paterno} ${p.apellido_materno}`}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        {Array.from({ length: numSubgrupos }, (_, i) => i + 1).map(sIdx => {
                          const isAssigned = currentSub === sIdx
                          return (
                            <button
                              key={sIdx}
                              onClick={() => setAssignments(prev => ({ ...prev, [p.documento]: sIdx }))}
                              disabled={submitting}
                              className={`px-2.5 py-1 rounded-md text-[10.5px] font-bold transition-all ${
                                isAssigned
                                  ? 'bg-[var(--accent)] text-white shadow-xs'
                                  : 'bg-[var(--bg-elevated)] text-[var(--text-muted)] hover:text-[var(--text-primary)] border border-[var(--border-subtle)]'
                              }`}
                            >
                              -{sIdx}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* FOOTER */}
        <div className="px-6 py-4 border-t border-[var(--border-subtle)] bg-[var(--bg-elevated)] flex items-center justify-between shrink-0">
          <button
            onClick={onClose}
            disabled={submitting}
            className="btn-secondary text-xs"
          >
            Cancelar
          </button>

          <button
            onClick={handleConfirmSplit}
            disabled={submitting || loadingPostulantes || postulantes.length === 0}
            className="btn-primary flex items-center gap-2 text-xs font-bold px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg"
          >
            {submitting ? <Loader2 size={15} className="animate-spin" /> : <Split size={15} />}
            <span>Dividir y Reasignar Grupo ({postulantes.length} alumnos)</span>
          </button>
        </div>

      </div>
    </div>
  )
}
