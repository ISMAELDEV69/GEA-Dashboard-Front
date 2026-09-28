import React, { useState, useRef, useEffect, useMemo } from 'react'
import { ChevronDown, Search, X, Check } from 'lucide-react'

export default function KpiMultiSelect({
  label,
  placeholder = 'Todos',
  allLabel = 'Todos',
  options = [],
  values = [],
  onChange,
  wide = false,
  mono = false,
  formatOption,
  disabled = false,
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState('')
  const dropdownRef = useRef(null)

  // Normalize selected values to an array
  const selected = useMemo(() => {
    if (!values) return []
    if (Array.isArray(values)) {
      return values.filter((v) => v !== 'ALL' && v !== null && v !== undefined)
    }
    if (values === 'ALL') return []
    return [values]
  }, [values])

  const isAll = selected.length === 0

  // Click outside listener to close dropdown
  useEffect(() => {
    if (!isOpen) return
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false)
        setSearch('')
      }
    }
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setIsOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  // Ensure any already-selected value is still shown in the dropdown list
  const mergedOptions = useMemo(() => {
    const list = [...options]
    selected.forEach((sel) => {
      if (!list.some((o) => String(o) === String(sel))) {
        list.push(sel)
      }
    })
    return list
  }, [options, selected])

  // Filter options based on search query
  const filteredOptions = useMemo(() => {
    if (!search.trim()) return mergedOptions
    const q = search.trim().toLowerCase()
    return mergedOptions.filter((opt) => {
      const text = String(formatOption ? formatOption(opt) : opt).toLowerCase()
      return text.includes(q)
    })
  }, [mergedOptions, search, formatOption])

  const toggleOption = (opt) => {
    const optStr = String(opt)
    let next
    if (selected.some((v) => String(v) === optStr)) {
      next = selected.filter((v) => String(v) !== optStr)
    } else {
      next = [...selected, opt]
    }
    onChange(next)
  }

  const handleSelectAll = () => {
    onChange([])
    setSearch('')
  }

  // Display summary text on the trigger
  const summaryText = useMemo(() => {
    if (isAll) return allLabel || placeholder
    if (selected.length === 1) {
      return formatOption ? formatOption(selected[0]) : String(selected[0])
    }
    return `${selected.length} selecc.`
  }, [isAll, selected, allLabel, placeholder, formatOption])

  return (
    <div
      ref={dropdownRef}
      className={`relative inline-flex flex-col min-w-0 ${wide ? 'max-w-[190px]' : 'max-w-[145px]'}`}
    >
      {label && (
        <span className="text-[9px] font-black uppercase tracking-wider text-[var(--text-muted)] truncate mb-0.5">
          {label}
        </span>
      )}

      {/* Trigger button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          if (!disabled) setIsOpen((prev) => !prev)
        }}
        className={`h-7 px-1 flex items-center justify-between gap-1 text-[11px] outline-none cursor-pointer border-0 border-b transition-colors select-none text-left ${
          isAll
            ? 'border-[var(--border-normal)] text-[var(--text-primary)] hover:border-[var(--accent)]'
            : 'border-[var(--accent)] text-[var(--accent)] font-semibold'
        } ${mono ? 'font-mono' : ''} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        title={!isAll ? selected.map((s) => (formatOption ? formatOption(s) : s)).join(', ') : allLabel}
      >
        <span className="truncate flex-1">{summaryText}</span>
        {!isAll && (
          <span className="shrink-0 px-1 py-0.2 rounded text-[9px] font-black bg-[var(--accent-soft)] text-[var(--accent)] leading-tight">
            {selected.length}
          </span>
        )}
        <ChevronDown
          size={11}
          className={`shrink-0 text-[var(--text-muted)] transition-transform duration-150 ${
            isOpen ? 'rotate-180 text-[var(--accent)]' : ''
          }`}
        />
      </button>

      {/* Floating Dropdown */}
      {isOpen && (
        <div
          className="absolute top-full left-0 z-50 mt-1 min-w-[180px] max-w-[280px] rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-1.5 shadow-2xl backdrop-blur-xl"
          style={{ minWidth: 'max(100%, 180px)' }}
        >
          {/* Quick Header: Todos button & clear */}
          <div className="flex items-center justify-between pb-1.5 mb-1 border-b border-[var(--border-subtle)] px-1">
            <button
              type="button"
              onClick={handleSelectAll}
              className={`text-[10px] font-bold px-1.5 py-0.5 rounded cursor-pointer transition-colors ${
                isAll
                  ? 'bg-[var(--accent-soft)] text-[var(--accent)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              {allLabel}
            </button>
            {!isAll && (
              <button
                type="button"
                onClick={handleSelectAll}
                className="text-[10px] text-[var(--neon-red,#f43f5e)] hover:underline cursor-pointer"
              >
                Limpiar ({selected.length})
              </button>
            )}
          </div>

          {/* Search box if many options */}
          {options.length > 5 && (
            <div className="relative mb-1.5 px-0.5">
              <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar..."
                className="w-full h-6 pl-6 pr-5 text-[11px] rounded-lg bg-[var(--surface-elevated,rgba(255,255,255,0.06))] text-[var(--text-primary)] border border-[var(--border-subtle)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--accent)]"
                autoFocus
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                >
                  <X size={10} />
                </button>
              )}
            </div>
          )}

          {/* Options List */}
          <div className="max-h-52 overflow-y-auto custom-scrollbar flex flex-col gap-0.5 pr-0.5">
            {filteredOptions.length === 0 ? (
              <div className="p-2 text-center text-[10px] text-[var(--text-muted)]">
                Sin coincidencias
              </div>
            ) : (
              filteredOptions.map((opt) => {
                const optStr = String(opt)
                const isChecked = selected.some((v) => String(v) === optStr)
                const display = formatOption ? formatOption(opt) : optStr

                return (
                  <label
                    key={optStr}
                    onClick={(e) => e.stopPropagation()}
                    className={`flex items-center gap-2 px-2 py-1 rounded-lg text-[11px] cursor-pointer transition-colors select-none ${
                      isChecked
                        ? 'bg-[var(--accent-soft)] text-[var(--text-primary)] font-semibold'
                        : 'text-[var(--text-secondary)] hover:bg-[var(--surface-hover,rgba(255,255,255,0.04))] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleOption(opt)}
                      className="size-3.5 rounded border-[var(--border-normal)] text-[var(--accent)] focus:ring-0 cursor-pointer accent-[var(--accent)]"
                    />
                    <span className={`truncate flex-1 ${mono ? 'font-mono' : ''}`}>
                      {display}
                    </span>
                    {isChecked && <Check size={11} className="text-[var(--accent)] shrink-0" />}
                  </label>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
