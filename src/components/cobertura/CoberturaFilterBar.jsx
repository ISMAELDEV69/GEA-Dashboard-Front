import React, { memo } from 'react'
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
} from 'lucide-react'
import { GeaModernDeltaEmblem } from '../GeaLogo'
import { METRIC_TIPOS, MODALIDADES } from '../../lib/coberturaDotacionAnalytics'

const MODALIDAD_LABEL = {
  PRESENCIAL: 'Presencial',
  REMOTO: 'Remoto',
}

function FilterField({ label, icon: Icon, value, onChange, options = [], allLabel, wide = false, title }) {
  const shown = value || allLabel || ''
  return (
    <label className={`flex shrink-0 flex-col gap-0.5 ${wide ? 'w-[168px] sm:w-[196px]' : 'w-[112px] sm:w-[128px]'}`}>
      <span className="flex items-center gap-1 text-[10px] font-semibold tracking-wide text-[var(--text-muted)]">
        {Icon ? <Icon size={11} strokeWidth={2.25} /> : null}
        {label}
      </span>
      <span className="relative block">
        <select
          value={value}
          title={title || shown}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 w-full appearance-none truncate rounded-lg border border-[var(--border-normal)] bg-[var(--input-bg)] py-0 pl-2 pr-6 text-[12px] font-semibold text-[var(--text-primary)] outline-none transition focus:border-cyan-400/70 focus:ring-2 focus:ring-cyan-400/20"
        >
          {allLabel != null ? <option value="">{allLabel}</option> : null}
          {options.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
        <ChevronDown
          size={12}
          className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
        />
      </span>
    </label>
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

function countDirtyFilters({ semana, segmento, campana, estado, modalidades, periodo, defaultPeriodo, condicion }) {
  let n = 0
  if (semana) n += 1
  if (segmento) n += 1
  if (campana) n += 1
  if (estado) n += 1
  if (condicion) n += 1
  if (Array.isArray(modalidades) && modalidades.length > 0 && modalidades.length < MODALIDADES.length) n += 1
  if (periodo && defaultPeriodo && periodo !== defaultPeriodo) n += 1
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
  periodo,
  defaultPeriodo,
  semana,
  segmento,
  campana,
  estado,
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
  const dirty = countDirtyFilters({
    semana,
    segmento,
    campana,
    estado,
    condicion,
    modalidades,
    periodo,
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

      <section className="flex items-end gap-2 border-t border-[var(--border-subtle)] px-2 py-2 md:px-3">
        <div className="relative min-w-0 flex-1">
          <div className="flex items-end gap-2 overflow-x-auto overscroll-x-contain pb-0.5 select-scrollbar">
            <FilterField
              label="Periodo"
              icon={CalendarDays}
              value={periodo}
              onChange={onPeriodoChange}
              options={filterOptions.periodos || []}
            />
            <FilterField
              label="Semana"
              icon={Hash}
              value={semana}
              onChange={onSemanaChange}
              options={filterOptions.semanas || []}
              allLabel="Todas"
            />
            <FilterField
              label="Segmento"
              icon={Layers}
              value={segmento}
              onChange={onSegmentoChange}
              options={filterOptions.segmentos || []}
              allLabel="Todas"
            />
            <FilterField
              label="Campaña"
              icon={Megaphone}
              value={campana}
              onChange={onCampanaChange}
              options={filterOptions.campanas || []}
              allLabel="Todas"
              wide
            />
            <FilterField
              label="Estado"
              icon={Activity}
              value={estado}
              onChange={onEstadoChange}
              options={filterOptions.estados || []}
              allLabel="Todas"
            />
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
          <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-[var(--bg-surface)] to-transparent md:hidden" />
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
