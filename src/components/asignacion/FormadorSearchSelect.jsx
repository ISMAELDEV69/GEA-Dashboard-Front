import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Search, X, Check, ChevronDown, UserX, Sparkles } from 'lucide-react'

function normalizeSearchStr(str) {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function HighlightMatch({ text, query }) {
  if (!query || !text) return <>{text}</>
  const cleanQuery = normalizeSearchStr(query)
  const tokens = cleanQuery.split(/\s+/).filter(Boolean)
  if (!tokens.length) return <>{text}</>

  const firstToken = tokens[0]
  const normText = normalizeSearchStr(text)
  const idx = normText.indexOf(firstToken)
  if (idx === -1) return <>{text}</>

  const before = text.slice(0, idx)
  const match = text.slice(idx, idx + firstToken.length)
  const after = text.slice(idx + firstToken.length)

  return (
    <>
      {before}
      <span className="bg-blue-500/30 text-blue-200 rounded-xs px-0.5 underline decoration-blue-400/60">
        {match}
      </span>
      {after}
    </>
  )
}

export default function FormadorSearchSelect({
  value = '',
  onChange,
  formadoresActivos = [],
  targetSegmento = '',
  disabled = false,
  isSuccess = false,
  placeholder = '● [PENDIENTE] Sin Formador Asignado',
  compact = false,
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const [dropdownStyle, setDropdownStyle] = useState({})

  const triggerRef = useRef(null)
  const dropdownRef = useRef(null)
  const inputRef = useRef(null)
  const listRef = useRef(null)

  const currentDoc = String(value || '').trim()
  const normTargetSeg = String(targetSegmento || '').trim().toUpperCase()

  const selectedFormador = useMemo(() => {
    if (!currentDoc) return null
    return formadoresActivos.find(f => String(f.documento).trim() === currentDoc) || {
      documento: currentDoc,
      nombres_completos: `Formador (${currentDoc})`,
      segmento: 'Inactivo / No listado',
      _unlisted: true,
    }
  }, [currentDoc, formadoresActivos])

  // Clasificar y filtrar formadores en tiempo real mientras escribe
  const { segmentList, otherList, flatOptions } = useMemo(() => {
    const tokens = normalizeSearchStr(query).split(/\s+/).filter(Boolean)

    const matchesQuery = (f) => {
      if (tokens.length === 0) return true
      const haystack = normalizeSearchStr(
        `${f.nombres_completos || ''} ${f.documento || ''} ${f.subcampana || ''} ${f.segmento || ''}`
      )
      return tokens.every(t => haystack.includes(t))
    }

    const filtered = formadoresActivos.filter(matchesQuery)

    const seg = []
    const oth = []

    for (const f of filtered) {
      const fSeg = String(f.segmento || '').trim().toUpperCase()
      const isSameSeg =
        !normTargetSeg ||
        !fSeg ||
        fSeg === normTargetSeg ||
        fSeg.includes(normTargetSeg) ||
        normTargetSeg.includes(fSeg)

      if (isSameSeg) {
        seg.push(f)
      } else {
        oth.push(f)
      }
    }

    const flat = [...seg, ...oth]
    return { segmentList: seg, otherList: oth, flatOptions: flat }
  }, [formadoresActivos, query, normTargetSeg])

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    const spaceBelow = window.innerHeight - rect.bottom
    const spaceAbove = rect.top
    const desiredHeight = 340
    const openUpward = spaceBelow < desiredHeight && spaceAbove > spaceBelow

    const width = Math.min(Math.max(rect.width, 350), window.innerWidth - 24)
    const left = Math.min(rect.left, window.innerWidth - width - 12)

    if (openUpward) {
      setDropdownStyle({
        position: 'fixed',
        left: `${Math.max(12, left)}px`,
        bottom: `${window.innerHeight - rect.top + 4}px`,
        width: `${width}px`,
        maxHeight: `${Math.min(desiredHeight, spaceAbove - 12)}px`,
        zIndex: 9999,
      })
    } else {
      setDropdownStyle({
        position: 'fixed',
        left: `${Math.max(12, left)}px`,
        top: `${rect.bottom + 4}px`,
        width: `${width}px`,
        maxHeight: `${Math.min(desiredHeight, spaceBelow - 12)}px`,
        zIndex: 9999,
      })
    }
  }, [])

  const openDropdown = () => {
    if (disabled) return
    setQuery('')
    setActiveIndex(0)
    updatePosition()
    setIsOpen(true)
  }

  const closeDropdown = useCallback(() => {
    setIsOpen(false)
    setQuery('')
  }, [])

  const handleSelect = (docValue) => {
    if (String(docValue || '') !== currentDoc) {
      onChange?.(docValue)
    }
    closeDropdown()
  }

  useEffect(() => {
    if (!isOpen) return
    const t = setTimeout(() => {
      inputRef.current?.focus()
    }, 10)

    const handleOutsideClick = (e) => {
      if (
        triggerRef.current?.contains(e.target) ||
        dropdownRef.current?.contains(e.target)
      ) {
        return
      }
      closeDropdown()
    }

    const handleScrollOrResize = (e) => {
      if (dropdownRef.current && dropdownRef.current.contains(e.target)) {
        return
      }
      updatePosition()
    }

    window.addEventListener('mousedown', handleOutsideClick)
    window.addEventListener('scroll', handleScrollOrResize, true)
    window.addEventListener('resize', handleScrollOrResize)

    return () => {
      clearTimeout(t)
      window.removeEventListener('mousedown', handleOutsideClick)
      window.removeEventListener('scroll', handleScrollOrResize, true)
      window.removeEventListener('resize', handleScrollOrResize)
    }
  }, [isOpen, closeDropdown, updatePosition])

  useEffect(() => {
    setActiveIndex(0)
  }, [query])

  // Auto-scroll al elemento activo con teclado
  useEffect(() => {
    if (!isOpen || !listRef.current) return
    const activeEl = listRef.current.querySelector(`[data-option-idx="${activeIndex}"]`)
    if (activeEl) {
      activeEl.scrollIntoView({ block: 'nearest' })
    }
  }, [activeIndex, isOpen])

  const handleKeyDown = (e) => {
    if (!isOpen) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault()
        openDropdown()
      }
      return
    }

    if (e.key === 'Escape') {
      e.preventDefault()
      closeDropdown()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex(prev => (flatOptions.length > 0 ? (prev + 1) % flatOptions.length : 0))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex(prev => (flatOptions.length > 0 ? (prev - 1 + flatOptions.length) % flatOptions.length : 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const chosen = flatOptions[activeIndex]
      if (chosen) {
        handleSelect(chosen.documento)
      }
    }
  }

  const hasFormador = Boolean(currentDoc)

  return (
    <div className="relative w-full">
      {/* Botón Disparador */}
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => (isOpen ? closeDropdown() : openDropdown())}
        onKeyDown={handleKeyDown}
        className={`w-full ${compact ? 'px-2 py-1.5' : 'px-2.5 py-1.5'} rounded-lg border text-xs font-semibold transition-all flex items-center justify-between gap-2 text-left cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500/40 ${
          hasFormador
            ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30 hover:border-emerald-500/50 shadow-xs'
            : 'bg-rose-500/10 text-rose-300 border-rose-500/40 hover:border-rose-500/60 shadow-xs'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${
          isSuccess ? 'border-emerald-400 bg-emerald-500/20' : ''
        } ${isOpen ? 'ring-2 ring-blue-500/50 border-blue-500' : ''}`}
      >
        <div className="min-w-0 flex-1 truncate flex items-center gap-1.5">
          {hasFormador && selectedFormador ? (
            <>
              <span className="text-emerald-400 font-black shrink-0">✓</span>
              <span className="truncate font-bold text-[var(--text-primary)]">
                {selectedFormador.nombres_completos}
              </span>
              {(selectedFormador.subcampana || selectedFormador.segmento) && (
                <span className="text-[10px] font-medium text-emerald-300/80 truncate hidden sm:inline">
                  • {selectedFormador.subcampana || selectedFormador.segmento}
                </span>
              )}
            </>
          ) : (
            <span className="truncate font-bold text-rose-300">{placeholder}</span>
          )}
        </div>
        <ChevronDown
          size={13}
          className={`shrink-0 transition-transform duration-200 ${
            isOpen ? 'rotate-180 text-blue-400' : 'opacity-70'
          }`}
        />
      </button>

      {/* Menú Flotante con Buscador en Tiempo Real */}
      {isOpen &&
        createPortal(
          <div
            ref={dropdownRef}
            style={dropdownStyle}
            className="rounded-xl bg-[var(--bg-surface)] border border-[var(--border-normal)] shadow-2xl flex flex-col overflow-hidden animate-fadeIn"
          >
            {/* Barra de Búsqueda Superior */}
            <div className="p-2 border-b border-[var(--border-subtle)] bg-[var(--bg-elevated)] shrink-0">
              <div className="relative flex items-center">
                <Search size={13} className="absolute left-2.5 text-blue-400 pointer-events-none" />
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Escribe nombre, apellido, DNI o campaña..."
                  className="w-full pl-8 pr-16 py-1.5 rounded-lg bg-[var(--bg-base)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-blue-500 font-medium"
                />
                <div className="absolute right-2 flex items-center gap-1">
                  {query && (
                    <button
                      type="button"
                      onClick={() => {
                        setQuery('')
                        inputRef.current?.focus()
                      }}
                      className="p-0.5 rounded hover:bg-[var(--bg-surface)] text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                      title="Limpiar búsqueda"
                    >
                      <X size={12} />
                    </button>
                  )}
                  <span className="text-[9.5px] font-mono font-bold px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                    {flatOptions.length}
                  </span>
                </div>
              </div>
            </div>

            {/* Lista de Resultados */}
            <div ref={listRef} className="flex-1 overflow-y-auto custom-scrollbar divide-y divide-[var(--border-subtle)]/40">
              {/* Opción para dejar Sin Formador (Pendiente) */}
              {hasFormador && !query && (
                <button
                  type="button"
                  onClick={() => handleSelect('')}
                  className="w-full px-3 py-2 text-left text-xs font-bold text-rose-400 hover:bg-rose-500/10 flex items-center justify-between gap-2 transition-colors cursor-pointer"
                >
                  <span className="flex items-center gap-1.5">
                    <UserX size={13} />
                    Quitar formador asignado (Dejar pendiente)
                  </span>
                </button>
              )}

              {flatOptions.length === 0 ? (
                <div className="px-4 py-8 text-center">
                  <p className="text-xs font-bold text-[var(--text-primary)]">
                    No se encontraron formadores para "{query}"
                  </p>
                  <p className="text-[10.5px] text-[var(--text-muted)] mt-1">
                    Intenta buscando por otro nombre, apellido, DNI o campaña.
                  </p>
                </div>
              ) : (
                <>
                  {/* Grupo 1: Formadores del mismo segmento */}
                  {segmentList.length > 0 && (
                    <div>
                      <div className="sticky top-0 z-10 px-3 py-1 bg-[var(--bg-elevated)]/95 backdrop-blur-xs border-y border-[var(--border-subtle)] flex items-center justify-between">
                        <span className="text-[9.5px] font-black uppercase tracking-wider text-teal-400 flex items-center gap-1">
                          <Sparkles size={10} />
                          Formadores de {normTargetSeg || 'este segmento'}
                        </span>
                        <span className="text-[9.5px] font-mono font-bold text-teal-400">
                          {segmentList.length}
                        </span>
                      </div>
                      {segmentList.map((f, idx) => {
                        const globalIdx = idx
                        const isSelected = String(f.documento).trim() === currentDoc
                        const isHighlighted = activeIndex === globalIdx
                        return (
                          <button
                            key={f.documento}
                            type="button"
                            data-option-idx={globalIdx}
                            onMouseEnter={() => setActiveIndex(globalIdx)}
                            onClick={() => handleSelect(f.documento)}
                            className={`w-full px-3 py-2 text-left transition-colors flex items-center justify-between gap-2 cursor-pointer ${
                              isHighlighted
                                ? 'bg-blue-500/15 text-[var(--text-primary)]'
                                : isSelected
                                ? 'bg-emerald-500/10 text-emerald-300'
                                : 'hover:bg-[var(--bg-muted)] text-[var(--text-primary)]'
                            }`}
                          >
                            <div className="min-w-0 flex-1">
                              <div className="text-xs font-bold truncate flex items-center gap-1.5">
                                <HighlightMatch text={f.nombres_completos} query={query} />
                              </div>
                              <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                                <span className="text-[9.5px] font-mono text-[var(--text-muted)]">
                                  DNI: <HighlightMatch text={f.documento} query={query} />
                                </span>
                                {f.subcampana && (
                                  <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-teal-500/10 text-teal-300 border border-teal-500/25 truncate max-w-[200px]">
                                    <HighlightMatch text={f.subcampana} query={query} />
                                  </span>
                                )}
                                {f.segmento && (
                                  <span className="text-[9px] font-semibold text-[var(--text-secondary)]">
                                    • {f.segmento}
                                  </span>
                                )}
                              </div>
                            </div>
                            {isSelected && (
                              <span className="shrink-0 p-1 rounded-full bg-emerald-500/20 text-emerald-400">
                                <Check size={12} />
                              </span>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  )}

                  {/* Grupo 2: Otros Formadores Activos */}
                  {otherList.length > 0 && (
                    <div>
                      <div className="sticky top-0 z-10 px-3 py-1 bg-[var(--bg-elevated)]/95 backdrop-blur-xs border-y border-[var(--border-subtle)] flex items-center justify-between">
                        <span className="text-[9.5px] font-black uppercase tracking-wider text-blue-400">
                          Otros Formadores Activos
                        </span>
                        <span className="text-[9.5px] font-mono font-bold text-blue-400">
                          {otherList.length}
                        </span>
                      </div>
                      {otherList.map((f, idx) => {
                        const globalIdx = segmentList.length + idx
                        const isSelected = String(f.documento).trim() === currentDoc
                        const isHighlighted = activeIndex === globalIdx
                        return (
                          <button
                            key={f.documento}
                            type="button"
                            data-option-idx={globalIdx}
                            onMouseEnter={() => setActiveIndex(globalIdx)}
                            onClick={() => handleSelect(f.documento)}
                            className={`w-full px-3 py-2 text-left transition-colors flex items-center justify-between gap-2 cursor-pointer ${
                              isHighlighted
                                ? 'bg-blue-500/15 text-[var(--text-primary)]'
                                : isSelected
                                ? 'bg-emerald-500/10 text-emerald-300'
                                : 'hover:bg-[var(--bg-muted)] text-[var(--text-primary)]'
                            }`}
                          >
                            <div className="min-w-0 flex-1">
                              <div className="text-xs font-bold truncate flex items-center gap-1.5">
                                <HighlightMatch text={f.nombres_completos} query={query} />
                              </div>
                              <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                                <span className="text-[9.5px] font-mono text-[var(--text-muted)]">
                                  DNI: <HighlightMatch text={f.documento} query={query} />
                                </span>
                                {f.subcampana && (
                                  <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-blue-500/10 text-blue-300 border border-blue-500/25 truncate max-w-[200px]">
                                    <HighlightMatch text={f.subcampana} query={query} />
                                  </span>
                                )}
                                {f.segmento && (
                                  <span className="text-[9px] font-semibold text-[var(--text-secondary)]">
                                    • {f.segmento}
                                  </span>
                                )}
                              </div>
                            </div>
                            {isSelected && (
                              <span className="shrink-0 p-1 rounded-full bg-emerald-500/20 text-emerald-400">
                                <Check size={12} />
                              </span>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Footer de ayuda rápida */}
            <div className="px-3 py-1.5 bg-[var(--bg-elevated)] border-t border-[var(--border-subtle)] flex items-center justify-between text-[9.5px] text-[var(--text-muted)] shrink-0">
              <span>↑↓ Navegar • Enter Seleccionar</span>
              <span>Esc Cerrar</span>
            </div>
          </div>,
          document.body
        )}
    </div>
  )
}

