import React, { memo, useState, useRef, useEffect, useMemo } from 'react'
import {
  Activity,
  ArrowLeft,
  CalendarDays,
  ClipboardList,
  Eraser,
  Hash,
  Layers,
  Megaphone,
  ChevronDown,
  Search,
  Check,
  X,
} from 'lucide-react'
import { GeaModernDeltaEmblem } from '../GeaLogo'
import { METRIC_TIPOS, MODALIDADES } from '../../lib/coberturaDotacionAnalytics'

const MODALIDAD_LABEL = {
  PRESENCIAL: 'Presencial',
  REMOTO: 'Remoto',
}

export function CoberturaMultiSelect({
  label,
  icon: Icon,
  values = [],
  onChange,
  options = [],
  allLabel = 'Todas',
  wide = false,
  isDark = true,
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const containerRef = useRef(null)

  // Cerrar al hacer click fuera
  useEffect(() => {
    if (!open) return
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  // Normalizar values a array siempre
  const safeValues = Array.isArray(values) ? values : (values ? [values] : [])

  const filteredOptions = useMemo(() => {
    if (!search.trim()) return options
    const q = search.toLowerCase()
    return options.filter((opt) => String(opt).toLowerCase().includes(q))
  }, [options, search])

  const toggleOption = (opt) => {
    const isSelected = safeValues.includes(opt)
    if (isSelected) {
      onChange(safeValues.filter((v) => v !== opt))
    } else {
      onChange([...safeValues, opt])
    }
  }

  const selectAll = () => {
    onChange([])
  }

  // Etiqueta a mostrar en el trigger
  const triggerText = useMemo(() => {
    if (safeValues.length === 0) return allLabel
    if (safeValues.length === 1) return safeValues[0]
    return `${safeValues.length} seleccionados`
  }, [safeValues, allLabel])

  return (
    <div
      ref={containerRef}
      className={`relative flex shrink-0 flex-col gap-0.5 ${wide ? 'w-[168px] sm:w-[210px]' : 'w-[120px] sm:w-[140px]'}`}
    >
      <span className="flex items-center gap-1 text-[10px] font-semibold tracking-wide text-[var(--text-muted)]">
        {Icon ? <Icon size={11} strokeWidth={2.25} /> : null}
        {label}
        {safeValues.length > 0 && (
          <span
            className={`ml-auto flex h-3.5 min-w-3.5 items-center justify-center rounded-full px-1 text-[8px] font-bold ${
              isDark ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40' : 'bg-[#163A6B]/10 text-[#163A6B] border border-[#163A6B]/30'
            }`}
          >
            {safeValues.length}
          </span>
        )}
      </span>

      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={`flex h-8 w-full items-center justify-between rounded-lg border px-2 text-[12px] font-semibold outline-none transition ${
          safeValues.length > 0
            ? (isDark
              ? 'border-cyan-400/50 bg-[var(--input-bg)] text-cyan-300 ring-1 ring-cyan-400/20'
              : 'border-[#163A6B]/40 bg-[var(--input-bg)] text-[#163A6B] ring-1 ring-[#163A6B]/15')
            : 'border-[var(--border-normal)] bg-[var(--input-bg)] text-[var(--text-primary)] hover:border-slate-400/60'
        }`}
        title={safeValues.length > 0 ? safeValues.join(', ') : allLabel}
      >
        <span className="truncate pr-1 text-left">{triggerText}</span>
        <ChevronDown
          size={12}
          className={`shrink-0 text-[var(--text-muted)] transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Popover desplegable */}
      {open && (
        <div
          className={`absolute left-0 top-[calc(100%+4px)] z-50 flex flex-col rounded-xl border p-1.5 shadow-xl backdrop-blur-md transition-all ${
            wide ? 'w-[230px] sm:w-[260px]' : 'w-[180px] sm:w-[210px]'
          } ${
            isDark
              ? 'border-slate-700/80 bg-slate-900/95 text-slate-100 shadow-black/60'
              : 'border-slate-200 bg-white/95 text-slate-800 shadow-slate-300/60'
          }`}
        >
          {/* Buscador si hay más de 5 opciones */}
          {options.length > 5 && (
            <div className="relative mb-1 px-0.5">
              <Search size={11} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar..."
                className="h-7 w-full rounded-md border border-[var(--border-subtle)] bg-[var(--bg-base)] pl-6 pr-2 text-[11px] outline-none transition focus:border-cyan-400/60"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                >
                  <X size={11} />
                </button>
              )}
            </div>
          )}

          {/* Acciones de selección rápida */}
          <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-1.5 py-1 text-[10px]">
            <button
              type="button"
              onClick={selectAll}
              className={`font-semibold hover:underline ${safeValues.length === 0 ? 'text-cyan-400 font-bold' : 'text-slate-400'}`}
            >
              {allLabel} (Todos)
            </button>
            {safeValues.length > 0 && (
              <button
                type="button"
                onClick={() => onChange([])}
                className="text-red-400 hover:underline"
              >
                Limpiar
              </button>
            )}
          </div>

          {/* Lista de opciones con checkboxes */}
          <div className="max-h-52 overflow-y-auto py-1 select-scrollbar">
            {filteredOptions.length === 0 ? (
              <div className="py-2 text-center text-[10px] text-slate-400">Sin coincidencias</div>
            ) : (
              filteredOptions.map((opt) => {
                const checked = safeValues.includes(opt)
                return (
                  <label
                    key={opt}
                    onClick={() => toggleOption(opt)}
                    className={`flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-[11px] transition ${
                      checked
                        ? (isDark ? 'bg-cyan-500/15 text-cyan-200 font-medium' : 'bg-blue-50 text-[#163A6B] font-medium')
                        : (isDark ? 'hover:bg-slate-800 text-slate-300' : 'hover:bg-slate-100 text-slate-700')
                    }`}
                  >
                    <div
                      className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border transition ${
                        checked
                          ? (isDark ? 'border-cyan-400 bg-cyan-500 text-slate-950' : 'border-[#163A6B] bg-[#163A6B] text-white')
                          : 'border-slate-400/50 bg-transparent'
                      }`}
                    >
                      {checked && <Check size={10} strokeWidth={3} />}
                    </div>
                    <span className="truncate">{opt}</span>
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

function SegmentedTrack({ label, children }) {
  return (
    <div className="flex shrink-0 flex-col gap-0.5">
      <span className="text-[10px] font-semibold tracking-wide text-[var(--text-muted)]">{label}</span>
      <div className="flex h-8 items-center gap-0.5 rounded-full border border-[var(--border-normal)] bg-[var(--bg-base)] p-0.5">
        {children}
      </div>
    </div>
  )
}

function SegmentedOption({ active, isDark, onClick, children }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`h-7 whitespace-nowrap rounded-full px-2 text-[10px] font-semibold tracking-wide transition sm:px-2.5 sm:text-[11px] ${
        active
          ? (isDark ? 'bg-cyan-500 text-slate-950 shadow-sm' : 'bg-[#163A6B] text-white shadow-sm')
          : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
      }`}
    >
      {children}
    </button>
  )
}

function countDirtyFilters({ semanas, segmentos, campanas, estados, modalidades, periodos, defaultPeriodo, condicion }) {
  let n = 0
  if (Array.isArray(semanas) ? semanas.length > 0 : Boolean(semanas)) n += 1
  if (Array.isArray(segmentos) ? segmentos.length > 0 : Boolean(segmentos)) n += 1
  if (Array.isArray(campanas) ? campanas.length > 0 : Boolean(campanas)) n += 1
  if (Array.isArray(estados) ? estados.length > 0 : Boolean(estados)) n += 1
  if (condicion) n += 1
  if (Array.isArray(modalidades) && modalidades.length > 0 && modalidades.length < MODALIDADES.length) n += 1
  if (Array.isArray(periodos)) {
    if (periodos.length > 1 || (periodos.length === 1 && defaultPeriodo && periodos[0] !== defaultPeriodo)) n += 1
  } else if (periodos && defaultPeriodo && periodos !== defaultPeriodo) {
    n += 1
  }
  return n
}

function ActionButton({ onClick, isDark, variant = 'ghost', title, children }) {
  const tone = variant === 'accent'
    ? (isDark
      ? 'border-cyan-400/40 bg-transparent text-cyan-200 hover:bg-cyan-500/10'
      : 'border-[#163A6B]/30 bg-white text-[#163A6B] hover:bg-slate-50')
    : (isDark
      ? 'border-[var(--border-normal)] bg-[var(--bg-base)] text-[var(--text-primary)]'
      : 'border-slate-200 bg-white text-[#163A6B]')
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`flex h-8 shrink-0 items-center gap-1.5 rounded-lg border px-2 text-[11px] font-semibold tracking-wide sm:px-3 ${tone}`}
    >
      {children}
    </button>
  )
}

export function CoberturaReportChrome({
  corteLabel,
  isDark,
  headerBg,
  filterOptions = {},
  periodos = [],
  periodo,
  defaultPeriodo,
  semanas = [],
  semana,
  segmentos = [],
  segmento,
  campanas = [],
  campana,
  estados = [],
  estado,
  showEstado = false,
  condicion,
  modalidades,
  tipo,
  onPeriodoChange,
  onSemanaChange,
  onSegmentoChange,
  onCampanaChange,
  onEstadoChange,
  onToggleModalidad,
  onTipoChange,
  onClear,
  onProyectados,
  onBack,
}) {
  // Manejar compatibilidad si vienen valores individuales o arrays
  const activePeriodos = useMemo(() => {
    if (Array.isArray(periodos) && periodos.length) return periodos
    return periodo ? [periodo] : []
  }, [periodos, periodo])

  const activeSemanas = useMemo(() => {
    if (Array.isArray(semanas) && semanas.length) return semanas
    return semana ? [semana] : []
  }, [semanas, semana])

  const activeSegmentos = useMemo(() => {
    if (Array.isArray(segmentos) && segmentos.length) return segmentos
    return segmento ? [segmento] : []
  }, [segmentos, segmento])

  const activeCampanas = useMemo(() => {
    if (Array.isArray(campanas) && campanas.length) return campanas
    return campana ? [campana] : []
  }, [campanas, campana])

  const activeEstados = useMemo(() => {
    if (Array.isArray(estados) && estados.length) return estados
    return estado ? [estado] : []
  }, [estados, estado])

  const dirty = countDirtyFilters({
    semanas: activeSemanas,
    segmentos: activeSegmentos,
    campanas: activeCampanas,
    estados: showEstado ? activeEstados : [],
    condicion,
    modalidades,
    periodos: activePeriodos,
    defaultPeriodo,
  })

  return (
    <div className="sticky top-0 z-20 rounded-xl border border-[var(--border-normal)] bg-[var(--bg-surface)] shadow-sm">
      <header
        className="flex h-12 items-center gap-2 overflow-hidden rounded-t-xl px-3 text-white md:h-14 md:gap-3 md:px-5"
        style={{ background: headerBg }}
      >
        <h1
          title="WFM Reporte Gerencial de Cobertura de Dotación"
          className="min-w-0 flex-1 truncate text-[13px] font-black uppercase tracking-[0.04em] md:text-[16px] lg:text-[18px]"
        >
          WFM Reporte Gerencial de Cobertura de Dotación
        </h1>
        <div className="flex shrink-0 items-center gap-2 md:gap-3">
          <div className="hidden rounded-full border border-white/15 bg-white/10 px-2.5 py-0.5 text-right leading-tight sm:block md:px-3">
            <p className="text-[8px] font-semibold uppercase tracking-wide text-white/70 md:text-[9px]">Actualizado</p>
            <p className="text-[12px] font-black md:text-[13px]">{corteLabel}</p>
          </div>
          <div className="flex items-center gap-1.5 border-l border-white/20 pl-2 md:gap-2 md:pl-3">
            <GeaModernDeltaEmblem className="h-7 w-7 md:h-8 md:w-8" variant="white" animated={false} />
            <div className="hidden leading-tight sm:block">
              <p className="text-[12px] font-black tracking-wide md:text-[13px]">GEA</p>
              <p className="text-[9px] font-semibold text-white/80 md:text-[10px]">PERÚ</p>
            </div>
          </div>
        </div>
      </header>

      <section className="flex flex-wrap items-end justify-between gap-2 border-t border-[var(--border-subtle)] px-2 py-2 md:px-3">
        <div className="flex flex-wrap items-end gap-2 flex-1 min-w-0">
            <CoberturaMultiSelect
              label="Periodo"
              icon={CalendarDays}
              values={activePeriodos}
              onChange={onPeriodoChange}
              options={filterOptions.periodos || []}
              allLabel={defaultPeriodo || 'Todos'}
              isDark={isDark}
            />
            <CoberturaMultiSelect
              label="Semana"
              icon={Hash}
              values={activeSemanas}
              onChange={onSemanaChange}
              options={filterOptions.semanas || []}
              allLabel="Todas"
              isDark={isDark}
            />
            <CoberturaMultiSelect
              label="Segmento"
              icon={Layers}
              values={activeSegmentos}
              onChange={onSegmentoChange}
              options={filterOptions.segmentos || []}
              allLabel="Todas"
              isDark={isDark}
            />
            <CoberturaMultiSelect
              label="Campaña"
              icon={Megaphone}
              values={activeCampanas}
              onChange={onCampanaChange}
              options={filterOptions.campanas || []}
              allLabel="Todas"
              wide
              isDark={isDark}
            />
            {showEstado ? (
              <CoberturaMultiSelect
                label="Estado"
                icon={Activity}
                values={activeEstados}
                onChange={onEstadoChange}
                options={filterOptions.estados || []}
                allLabel="Todas"
                isDark={isDark}
              />
            ) : null}
            <SegmentedTrack label="Modalidad">
              {MODALIDADES.map((m) => (
                <SegmentedOption
                  key={m}
                  isDark={isDark}
                  active={modalidades.includes(m)}
                  onClick={() => onToggleModalidad(m)}
                >
                  {MODALIDAD_LABEL[m] || m}
                </SegmentedOption>
              ))}
            </SegmentedTrack>
            <SegmentedTrack label="Unidad">
              {METRIC_TIPOS.map((opt) => (
                <SegmentedOption
                  key={opt.id}
                  isDark={isDark}
                  active={tipo === opt.id}
                  onClick={() => onTipoChange(opt.id)}
                >
                  {opt.label}
                </SegmentedOption>
              ))}
            </SegmentedTrack>
        </div>

        <div className="flex shrink-0 items-end gap-1.5 border-l border-[var(--border-subtle)] pl-2">
          {onBack ? (
            <ActionButton isDark={isDark} onClick={onBack} title="Volver">
              <ArrowLeft size={13} />
              <span className="hidden lg:inline">Volver</span>
            </ActionButton>
          ) : null}
          {onProyectados ? (
            <ActionButton isDark={isDark} variant="accent" onClick={onProyectados} title="Proyectados">
              <ClipboardList size={13} />
              <span className="hidden md:inline">Proyectados</span>
            </ActionButton>
          ) : null}
          <button
            type="button"
            title="Limpiar filtros"
            onClick={onClear}
            className={`flex h-8 shrink-0 items-center gap-1.5 rounded-lg border px-2 text-[11px] font-semibold tracking-wide sm:px-3 ${
              dirty
                ? (isDark
                  ? 'border-[var(--border-normal)] bg-[var(--bg-base)] text-[var(--text-primary)]'
                  : 'border-slate-200 bg-white text-[#163A6B]')
                : 'border-transparent bg-transparent text-[var(--text-muted)]'
            }`}
          >
            <Eraser size={13} />
            <span className="hidden lg:inline">Limpiar</span>
            {dirty > 0 ? (
              <span className={`flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-black ${
                isDark ? 'bg-cyan-500 text-slate-950' : 'bg-[#163A6B] text-white'
              }`}
              >
                {dirty}
              </span>
            ) : null}
          </button>
        </div>
      </section>
    </div>
  )
}

export default memo(CoberturaReportChrome)
