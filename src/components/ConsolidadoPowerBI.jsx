import { useEffect, useId, useMemo, useState, useCallback, useRef } from 'react';
import { 
  AlertCircle, 
  CalendarDays, 
  ClipboardList, 
  ClockAlert, 
  Download, 
  Loader2, 
  Monitor, 
  Search, 
  Users, 
  CalendarX, 
  RefreshCw,
  Sparkles,
  TrendingUp,
  Activity,
  Layers,
  Filter,
  CheckCircle2,
  X,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight
} from 'lucide-react';
import { fetchDashboardData, fetchConsolidadoOnDemand, isBajaCapacitacion, isBajaDia1 } from '../lib/dataService';
import { isCampanaProyectada, normalize2026Period } from '../lib/dashboardAnalytics';
import * as XLSX from 'xlsx';

const MIN_PERIODO_2026 = '202601';

export function getPeriodoFromCapacidad(item) {
  if (!item) return '';
  // 1. Sincronizar por fecha_registro (fecha de inicio en capacidad) si existe
  const rawDate = item.fecha_registro || item.fecha_inicio_capacitacion || item.fecha_inicio;
  if (rawDate) {
    const d = parseLocalDate(rawDate);
    if (d) {
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      return `${yyyy}${mm}`;
    }
  }
  // 2. Periodo explícito de la cohorte
  const p = normalize2026Period(item.periodo) || normalize2026Period(item.periodo_ingreso_op) || normalize2026Period(item.periodo_rys);
  if (p) return p;

  // 3. Fallback a fecha_inicio_ojt o fecha_ingreso_op
  const altDate = item.fecha_inicio_ojt || item.fecha_ingreso_op;
  if (altDate) {
    const d = parseLocalDate(altDate);
    if (d) {
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      return `${yyyy}${mm}`;
    }
  }
  return normalizeText(item.periodo);
}

export function getMaxPeriodoOperativo(capacidades = []) {
  const now = new Date();
  const currentYm = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  let maxP = currentYm < '202609' ? '202609' : currentYm;
  
  if (Array.isArray(capacidades) && capacidades.length > 0) {
    for (const c of capacidades) {
      const p = getPeriodoFromCapacidad(c) || String(c.periodo || '').replace(/\D/g, '').slice(0, 6);
      if (p.length === 6 && p.startsWith('202')) {
        const st = String(c.estado || '').toUpperCase();
        if (st.includes('CURSO') || st.includes('ACT') || st.includes('CERR') || p <= currentYm) {
          if (p > maxP) maxP = p;
        }
      }
    }
  }
  return maxP;
}

function isPeriodoOperativoValido(p, maxPeriodo = null) {
  if (!p) return false;
  const clean = String(p).replace(/\D/g, '').slice(0, 6);
  if (clean.length !== 6 || !clean.startsWith('202')) return false;
  const ceiling = maxPeriodo || getMaxPeriodoOperativo();
  return clean >= MIN_PERIODO_2026 && clean <= ceiling;
}

const STATUS_META = {
  A: { label: 'Asistió', bg: 'var(--status-a-bg)', text: 'var(--status-a-text)' },
  B: { label: 'Baja', bg: 'var(--status-b-bg)', text: 'var(--status-b-text)' },
  FI: { label: 'Falta Injustificada', bg: 'var(--status-fi-bg)', text: 'var(--status-fi-text)' },
  FJ: { label: 'Falta Justificada', bg: 'var(--status-fj-bg)', text: 'var(--status-fj-text)' },
  'I-OP': { label: 'Ingreso Operación', bg: 'var(--status-iop-bg)', text: 'var(--status-iop-text)' },
  S: { label: 'Suspensión', bg: 'var(--status-s-bg)', text: 'var(--status-s-text)' },
  SUS: { label: 'Suspensión', bg: 'var(--status-s-bg)', text: 'var(--status-s-text)' },
};

function normalizeText(value, fallback = '') {
  if (value === null || value === undefined) return fallback;
  return String(value).trim();
}

function normalizeGpe(value) {
  const text = normalizeText(value, 'Sin GPE');
  if (text.startsWith('PROY-')) return 'EN PROYECCIÓN';
  const m = text.match(/^(GP[A-Z0-9]+-[0-9A-Z]+(?:-[0-9A-Z]+)?)/i);
  if (m) return m[1].toUpperCase();
  return text.replace(/_\d+$/, '');
}

function cleanCodeKey(val) {
  if (!val) return '';
  return String(val)
    .trim()
    .toUpperCase()
    .replace(/^GP[E]?[-_]?/, '')
    .replace(/^20(\d{2})/, '$1')
    .replace(/[^A-Z0-9]/g, '');
}

function normalizeEstado(value) {
  const text = normalizeText(value, '').toUpperCase();
  if (text.includes('ACTIVO')) return 'ACTIVO';
  if (text.includes('BAJA DIA 1') || text.includes('BAJA DÍA 1')) return 'BAJA DIA 1';
  if (text.includes('CESADO') || text.includes('BAJA')) return 'CESADO';
  return text || 'SIN ESTADO';
}

function normalizeCampana(value) {
  return normalizeText(value, 'Sin campaña').toUpperCase();
}

function normalizeSegmento(value) {
  return normalizeText(value, 'Sin segmento').toUpperCase();
}

function normalizeSemana(label, trabajo, archivo) {
  const raw = label || trabajo || archivo;
  if (!raw) return '';
  const s = String(raw).trim().toUpperCase();
  const num = s.replace(/\D/g, '');
  return num ? `SEM ${num}` : s;
}

function normalizeSigla(value) {
  const sigla = normalizeText(value, '').toUpperCase();
  return ['A', 'B', 'FI', 'FJ', 'I-OP', 'S', 'SUS'].includes(sigla) ? sigla : '';
}

function parseLocalDate(value) {
  if (!value) return null;
  const str = String(value).trim();
  if (str.includes('/')) {
    const parts = str.split('/');
    if (parts.length === 3) {
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10);
      const year = parseInt(parts[2], 10);
      if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
        return new Date(year, month - 1, day);
      }
    }
  } else if (str.includes('-')) {
    const parts = str.substring(0, 10).split('-');
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10);
      const day = parseInt(parts[2], 10);
      if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
        return new Date(year, month - 1, day);
      }
    }
  }
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

function formatCanonicalDate(value) {
  if (!value) return '';
  const d = parseLocalDate(value);
  if (!d) return String(value).trim();
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

function sortOptions(values) {
  const list = [...values].filter(Boolean).sort((a, b) => String(a).localeCompare(String(b), 'es'));
  return ['Todas', ...list];
}

/* ── Creative Minimalist SVG Artwork for Indicators & Volumes ── */
const KpiArt = {
  // 1. Cumplimiento: Radar/Target de precisión táctica
  Target: ({ color = '#06B6D4', className = 'w-12 h-12' }) => (
    <svg viewBox="0 0 48 48" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
      <circle cx="24" cy="24" r="20" stroke={color} strokeWidth="1.5" strokeDasharray="3 3" opacity="0.25" />
      <circle cx="24" cy="24" r="14" stroke={color} strokeWidth="1.5" opacity="0.4" />
      <circle cx="24" cy="24" r="7" stroke={color} strokeWidth="2" opacity="0.8" />
      <circle cx="24" cy="24" r="2.5" fill={color} />
      <line x1="24" y1="4" x2="24" y2="10" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <line x1="24" y1="38" x2="24" y2="44" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <line x1="4" y1="24" x2="10" y2="24" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <line x1="38" y1="24" x2="44" y2="24" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <path d="M28 20L36 12M36 12H30M36 12V18" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),

  // 2. Deserción: Trayectoria de fuga / bifurcación minimalista
  Attrition: ({ color = '#F43F5E', className = 'w-12 h-12' }) => (
    <svg viewBox="0 0 48 48" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
      <path d="M8 38C16 38 18 24 28 24C36 24 38 12 42 12" stroke={color} strokeWidth="2" strokeLinecap="round" opacity="0.85" />
      <path d="M28 24C32 24 36 34 42 36" stroke={color} strokeWidth="1.5" strokeDasharray="2 2" strokeLinecap="round" opacity="0.4" />
      <circle cx="8" cy="38" r="3" fill={color} opacity="0.6" />
      <circle cx="28" cy="24" r="3" fill={color} />
      <circle cx="42" cy="12" r="3.5" fill={color} />
      <path d="M38 8L44 12L40 16" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="12" y1="44" x2="36" y2="44" stroke={color} strokeWidth="1" strokeDasharray="2 2" opacity="0.2" />
    </svg>
  ),

  // 3. Dotación: Matriz de cobertura / escuadrón completo
  Capacity: ({ color = '#10B981', className = 'w-12 h-12' }) => (
    <svg viewBox="0 0 48 48" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
      <rect x="8" y="10" width="32" height="28" rx="8" stroke={color} strokeWidth="1.5" opacity="0.3" />
      <circle cx="18" cy="20" r="4" stroke={color} strokeWidth="1.8" />
      <path d="M11 32C11 28.5 14 26 18 26C22 26 25 28.5 25 32" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="30" cy="20" r="4" stroke={color} strokeWidth="1.8" opacity="0.75" />
      <path d="M25 32C25.5 29 27.5 26 30 26C34 26 37 28.5 37 32" stroke={color} strokeWidth="1.8" strokeLinecap="round" opacity="0.75" />
      <circle cx="38" cy="12" r="2" fill={color} />
    </svg>
  ),

  // 4. Absentismo: Pulso de tiempo interrumpido / pausa
  Absence: ({ color = '#F59E0B', className = 'w-12 h-12' }) => (
    <svg viewBox="0 0 48 48" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
      <circle cx="24" cy="24" r="18" stroke={color} strokeWidth="1.5" opacity="0.3" />
      <path d="M24 12V24L32 28" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 36L36 12" stroke={color} strokeWidth="1.5" strokeDasharray="3 3" opacity="0.4" />
      <circle cx="24" cy="24" r="2.5" fill={color} />
      <circle cx="36" cy="12" r="3" fill={color} opacity="0.8" />
    </svg>
  ),

  // ── Volumen / Conteos Minimalistas ──
  ActiveUsers: ({ color = '#06B6D4' }) => (
    <svg viewBox="0 0 28 28" fill="none" className="w-5 h-5" xmlns="http://www.w3.org/2000/svg">
      <circle cx="14" cy="9" r="4.5" stroke={color} strokeWidth="2" />
      <path d="M6 23C6 18.5 9.5 15.5 14 15.5C18.5 15.5 22 18.5 22 23" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <circle cx="21" cy="7" r="1.5" fill={color} />
    </svg>
  ),

  DayOne: ({ color = '#10B981' }) => (
    <svg viewBox="0 0 28 28" fill="none" className="w-5 h-5" xmlns="http://www.w3.org/2000/svg">
      <rect x="5" y="5" width="18" height="18" rx="5" stroke={color} strokeWidth="1.8" opacity="0.4" />
      <path d="M11 14L13.5 16.5L17.5 11" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="14" cy="5" r="1.5" fill={color} />
    </svg>
  ),

  Dropouts: ({ color = '#F43F5E' }) => (
    <svg viewBox="0 0 28 28" fill="none" className="w-5 h-5" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="10" r="4" stroke={color} strokeWidth="1.8" />
      <path d="M5 23C5 19 8 16.5 12 16.5" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
      <path d="M17 17L23 23M23 17L17 23" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),

  Faults: ({ color = '#F59E0B' }) => (
    <svg viewBox="0 0 28 28" fill="none" className="w-5 h-5" xmlns="http://www.w3.org/2000/svg">
      <circle cx="14" cy="14" r="9" stroke={color} strokeWidth="1.8" opacity="0.5" />
      <line x1="14" y1="8" x2="14" y2="15" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <circle cx="14" cy="19" r="1.2" fill={color} />
    </svg>
  ),

  Scheduled: ({ color = '#8B5CF6' }) => (
    <svg viewBox="0 0 28 28" fill="none" className="w-5 h-5" xmlns="http://www.w3.org/2000/svg">
      <rect x="6" y="5" width="16" height="19" rx="3.5" stroke={color} strokeWidth="1.8" />
      <line x1="10" y1="10" x2="18" y2="10" stroke={color} strokeWidth="1.6" strokeLinecap="round" opacity="0.6" />
      <line x1="10" y1="14" x2="18" y2="14" stroke={color} strokeWidth="1.6" strokeLinecap="round" opacity="0.6" />
      <line x1="10" y1="18" x2="14" y2="18" stroke={color} strokeWidth="1.6" strokeLinecap="round" opacity="0.6" />
    </svg>
  ),
};

/* ── Micro Sparkline for compact KPI card ── */
function Sparkline({ values = [], color = '#06B6D4' }) {
  const id = useId();
  const raw = values.length >= 4 ? values : [12, 18, 14, 22, 19, 28, 24, 30];
  const min = Math.min(...raw);
  const max = Math.max(...raw);
  const range = max - min || 1;

  const points = raw.map((value, index) => {
    const x = (index / (raw.length - 1)) * 100;
    const y = 20 - ((value - min) / range) * 14;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const polylineStr = points.join(' ');
  const areaStr = `0,24 ${polylineStr} 100,24`;

  return (
    <svg viewBox="0 0 100 24" preserveAspectRatio="none" className="h-full w-full overflow-visible">
      <defs>
        <linearGradient id={`grad-${id}`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0.0" />
        </linearGradient>
      </defs>
      <polygon points={areaStr} fill={`url(#grad-${id})`} />
      <polyline
        points={polylineStr}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* ── Animated Number Counter Hook ── */
function useAnimatedCounter(targetValue, duration = 900) {
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    const target = Number(targetValue) || 0;
    if (target === 0) {
      setCurrent(0);
      return;
    }
    const start = performance.now();
    let frameId;

    function animate(now) {
      const progress = Math.min((now - start) / duration, 1);
      const easeOutCubic = 1 - Math.pow(1 - progress, 3);
      setCurrent(Math.round(target * easeOutCubic));
      if (progress < 1) {
        frameId = requestAnimationFrame(animate);
      }
    }

    frameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameId);
  }, [targetValue, duration]);

  return current;
}

/* ── HERO STRATEGIC INDICATOR CARD (Larger, Prominent, Majestic with Creative Minimalist Art) ── */
function HeroIndicatorCard({
  label,
  value = 0,
  color = '#06B6D4',
  statusText = '',
  detail = '',
  sublabel = '',
  art: ArtComponent,
}) {
  const realVal = Math.max(0, Math.round(Number(value) || 0));
  const animatedVal = useAnimatedCounter(realVal, 1100);
  const gaugePercent = Math.min(realVal, 100);
  const radius = 24;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (gaugePercent / 100) * circumference;

  return (
    <div className="group relative overflow-hidden rounded-2xl bg-gradient-to-b from-[var(--bg-surface)] to-[var(--bg-elevated)] border border-[var(--border-subtle)] hover:border-[var(--border-normal)] transition-all duration-300 p-3 shadow-xs hover:shadow-lg hover:-translate-y-0.5 flex flex-col justify-between min-w-0">
      
      {/* Background Subtle Ambient Glow & Geometric Watermark Art */}
      <div 
        className="absolute -right-2 -bottom-2 opacity-15 group-hover:opacity-30 transition-opacity duration-500 pointer-events-none transform group-hover:scale-110"
      >
        {ArtComponent && <ArtComponent color={color} className="w-20 h-20" />}
      </div>

      {/* Top Row: Category Tag & Status Pill */}
      <div className="flex items-center justify-between gap-2 relative z-10">
        <div className="flex items-center gap-1.5 min-w-0">
          <span 
            className="w-2 h-2 rounded-full shrink-0" 
            style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}` }}
          />
          <span className="text-[10px] font-black uppercase tracking-[0.12em] text-[var(--text-secondary)] truncate">
            {label}
          </span>
        </div>

        {statusText && (
          <span 
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider shrink-0"
            style={{ 
              backgroundColor: `${color}18`, 
              color: color, 
              border: `1px solid ${color}40`,
              backdropFilter: 'blur(8px)'
            }}
          >
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: color, boxShadow: `0 0 6px ${color}` }} />
            {statusText}
          </span>
        )}
      </div>

      {/* Main Content: Radial Gauge + Hero Percentage + Context */}
      <div className="flex items-center gap-3 my-1.5 relative z-10">
        {/* Animated Circular Gauge */}
        <div className="relative w-13 h-13 shrink-0 flex items-center justify-center">
          <svg className="w-13 h-13 -rotate-90 transform" viewBox="0 0 60 60">
            <circle
              cx="30"
              cy="30"
              r={radius}
              stroke="var(--border-normal)"
              strokeWidth="4"
              fill="transparent"
              opacity="0.25"
            />
            <circle
              cx="30"
              cy="30"
              r={radius}
              stroke={color}
              strokeWidth="4"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              fill="transparent"
              style={{
                filter: `drop-shadow(0 0 4px ${color}60)`,
                transition: 'stroke-dashoffset 1.2s cubic-bezier(0.22, 1, 0.36, 1)'
              }}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            {ArtComponent ? (
              <ArtComponent color={color} className="w-5 h-5 opacity-90 group-hover:scale-110 transition-transform" />
            ) : (
              <span className="text-[10px] font-black" style={{ color }}>%</span>
            )}
          </div>
        </div>

        {/* Big Impact Value & Context Breakdown */}
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-1">
            <span 
              className="text-2xl sm:text-3xl font-black tracking-tight leading-none tabular-nums"
              style={{ color, fontFamily: 'Space Grotesk, Plus Jakarta Sans, sans-serif' }}
            >
              {animatedVal}%
            </span>
          </div>
          {sublabel && (
            <p className="text-[9px] font-bold text-[var(--text-muted)] truncate mt-0.5">
              {sublabel}
            </p>
          )}
        </div>
      </div>

      {/* Bottom Row: Micro Progress or Comparison Detail */}
      {detail && (
        <div className="pt-1.5 border-t border-[var(--border-subtle)] flex items-center justify-between text-[9px] font-bold text-[var(--text-muted)] relative z-10">
          <span className="truncate">{detail}</span>
          <span className="text-[8px] uppercase tracking-widest font-mono text-[var(--text-secondary)]">Ratio</span>
        </div>
      )}
    </div>
  );
}

/* ── REFINED VOLUME QUANTITY CARD (Compact, Balanced, Elegant with Contextual Minimalist Drawing) ── */
function CompactVolumeCard({
  art: ArtComponent,
  label,
  value = 0,
  color = '#06B6D4',
  trend = [],
  subcopy = '',
}) {
  const animatedVal = useAnimatedCounter(value);

  return (
    <div 
      className="group relative flex items-center justify-between px-3 py-2 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] hover:border-[var(--border-normal)] transition-all duration-300 shadow-xs hover:shadow-md hover:-translate-y-0.5 min-w-0"
      style={{ borderLeft: `3px solid ${color}` }}
    >
      <div className="flex items-center gap-2.5 min-w-0 flex-1">
        {/* Contextual Minimalist Icon */}
        <div 
          className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-transform group-hover:scale-110"
          style={{ background: `${color}15`, color, border: `1px solid ${color}30` }}
        >
          {ArtComponent && <ArtComponent color={color} />}
        </div>

        {/* Labels & Number (Measured size, not oversized) */}
        <div className="min-w-0 truncate">
          <p className="text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)] truncate">
            {label}
          </p>
          <div className="flex items-baseline gap-1.5">
            <p 
              className="text-base sm:text-lg font-black leading-tight tabular-nums"
              style={{ color, fontFamily: 'Space Grotesk, Plus Jakarta Sans, sans-serif' }}
            >
              {animatedVal.toLocaleString('es-PE')}
            </p>
            {subcopy && (
              <span className="text-[9px] font-semibold text-[var(--text-muted)] truncate">
                {subcopy}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Micro-Sparkline */}
      <div className="w-14 h-5 opacity-60 group-hover:opacity-100 transition-opacity shrink-0 ml-1.5">
        <Sparkline values={trend} color={color} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTE PRINCIPAL: CONSOLIDADO POWER BI
// ─────────────────────────────────────────────────────────────────────────────
export default function ConsolidadoPowerBI() {
  const [data, setData] = useState([]);
  const [capacidades, setCapacidades] = useState([]);
  const [descuentos, setDescuentos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingHistorical, setLoadingHistorical] = useState(false);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [filters, setFilters] = useState({ 
    periodo: 'Todas', 
    semana: 'Todas',
    segmento: 'Todas', 
    campana: 'Todas', 
    gpe: 'Todas', 
    estado: 'Todas' 
  });
  const fetchedFiltersRef = useRef(new Set());

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetchDashboardData();
      setData(Array.isArray(res.consolidado) ? res.consolidado : []);
      setCapacidades(res.capacidades || []);
      setDescuentos(res.descuentos || []);
    } catch (err) {
      console.error('Error cargando datos:', err);
      setError(err?.message || 'Error al cargar los datos del consolidado.');
      setData([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Listener para el botón global Refrescar del Header
  useEffect(() => {
    const handleGlobalRefresh = () => {
      loadData();
    };
    window.addEventListener('gea-global-refresh', handleGlobalRefresh);
    return () => window.removeEventListener('gea-global-refresh', handleGlobalRefresh);
  }, [loadData]);

  // ── 0. Periodo operativo máximo dinámico según fecha actual y capacidades ──
  const maxPeriodoOperativo = useMemo(() => {
    return getMaxPeriodoOperativo(capacidades);
  }, [capacidades]);

  // ── 1. Indexar capacidades por clave compuesta y por código directo para búsqueda ultra-rápida O(1) ──
  const { capacidadByKeyMap, capacidadByCodigoMap, allCapacidadItems } = useMemo(() => {
    const byKey = new Map();
    const byCode = new Map();
    const allItems = [];

    for (let i = 0; i < capacidades.length; i++) {
      const item = capacidades[i];
      const rawPeriodo = getPeriodoFromCapacidad(item);

      // Si es una campaña proyectada de un periodo posterior al periodo operativo, omitir
      if (isCampanaProyectada(item) && rawPeriodo > maxPeriodoOperativo) continue;

      const campana = normalizeCampana(item.campana);
      const gpe = normalizeGpe(item.codigo || item.grupo_codigo);
      const semanaStr = normalizeSemana(item.semana_label, item.semana_trabajo);

      if (rawPeriodo && !isPeriodoOperativoValido(rawPeriodo, maxPeriodoOperativo)) continue;

      const isAreaReclutamiento = String(item.area_traslado || '').trim().toUpperCase() === 'RECLUTAMIENTO';
      const capInfo = {
        codigo: gpe,
        rawCodigo: item.codigo || item.grupo_codigo,
        campana: campana,
        meta_dia_1: Number(item.meta_dia_1) || 0,
        rq_solicitado: isAreaReclutamiento ? (Number(item.rq_ftes_solicitado ?? item.rq_solicitado) || 0) : 0,
        rq_ftes_solicitado: isAreaReclutamiento ? (Number(item.rq_ftes_solicitado) || 0) : 0,
        fecha_registro: normalizeText(item.fecha_registro),
        fecha_inicio_ojt: normalizeText(item.fecha_inicio_ojt),
        fecha_ingreso_op: normalizeText(item.fecha_ingreso_op),
        periodo: rawPeriodo,
        semana: semanaStr,
        segmento: normalizeSegmento(item.segmento),
        estado: normalizeText(item.estado),
      };

      const cKey = cleanCodeKey(gpe);
      if (campana && gpe) byKey.set(`${campana}|${gpe}`, capInfo);
      if (campana && cKey) byKey.set(`${campana}|${cKey}`, capInfo);
      if (gpe && !byCode.has(gpe)) byCode.set(gpe, capInfo);
      if (cKey && !byCode.has(cKey)) byCode.set(cKey, capInfo);
      allItems.push(capInfo);
    }

    return { capacidadByKeyMap: byKey, capacidadByCodigoMap: byCode, allCapacidadItems: allItems };
  }, [capacidades, maxPeriodoOperativo]);

  // Helper robusto para obtener capacidad (estricto por campaña + grupo para evitar cruces indebidos)
  const getCapInfo = useCallback((campana, gpe) => {
    const normCampana = normalizeCampana(campana);
    const normGpe = normalizeGpe(gpe);
    const cKey = cleanCodeKey(normGpe);
    if (normCampana && normCampana !== 'SIN CAMPAÑA') {
      if (normGpe && capacidadByKeyMap.has(`${normCampana}|${normGpe}`)) {
        return capacidadByKeyMap.get(`${normCampana}|${normGpe}`);
      }
      if (cKey && capacidadByKeyMap.has(`${normCampana}|${cKey}`)) {
        return capacidadByKeyMap.get(`${normCampana}|${cKey}`);
      }
    }
    // Solo permitir fallback por código de grupo si el registro original no tiene campaña asignada o no hubo match con campaña
    if (normGpe && capacidadByCodigoMap.has(normGpe)) {
      return capacidadByCodigoMap.get(normGpe);
    }
    if (cKey && capacidadByCodigoMap.has(cKey)) {
      return capacidadByCodigoMap.get(cKey);
    }
    return null;
  }, [capacidadByKeyMap, capacidadByCodigoMap]);

  // Pre-computar campos normalizados en validData una sola vez (evita cientos de miles de llamadas redundantes)
  const validData = useMemo(() => {
    const result = [];
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const campana = normalizeCampana(row.campana);
      const gpe = normalizeGpe(row.grupo || row.codigo_grupo);
      const cap = getCapInfo(campana, gpe);

      // 1. Priorizar la semana real de Capacidad (Periodo de Inicio) o archivo de origen
      const originSemana = normalizeSemana(row.archivo_origen, row.semana_label, row.semana_trabajo || row.semana);
      const rowSemana = cap?.semana || originSemana || '';

      // 2. Respetar la campaña real de asistencia
      const rowCampana = (campana && campana !== 'SIN CAMPAÑA') ? campana : (cap?.campana || campana);

      // 3. Determinar periodo sincronizado según las fechas y periodo de Capacidad RYS
      let rowPeriodo = '';
      if (cap?.periodo) {
        rowPeriodo = cap.periodo;
      } else if (cap?.fecha_registro) {
        const d = parseLocalDate(cap.fecha_registro);
        if (d) {
          const yyyy = d.getFullYear();
          const mm = String(d.getMonth() + 1).padStart(2, '0');
          rowPeriodo = `${yyyy}${mm}`;
        }
      } else if (row.periodo) {
        rowPeriodo = normalize2026Period(row.periodo) || normalizeText(row.periodo);
      } else if (row.archivo_origen && normalize2026Period(row.archivo_origen)) {
        rowPeriodo = normalize2026Period(row.archivo_origen);
      } else if (row.fecha_registro_asistencia) {
        const d = parseLocalDate(row.fecha_registro_asistencia);
        if (d) {
          const yyyy = d.getFullYear();
          const mm = String(d.getMonth() + 1).padStart(2, '0');
          rowPeriodo = `${yyyy}${mm}`;
        }
      }

      // Descartar registros con periodos fuera del rango histórico 2026 operativo
      if (rowPeriodo && !isPeriodoOperativoValido(rowPeriodo, maxPeriodoOperativo)) continue;

      const rowSegmento = cap?.segmento || normalizeSegmento(row.segmento);

      const txtEstado = String(row.estado || '').toUpperCase();
      const txtMotivo = String(row.motivo_baja || '').toUpperCase();
      const txtObs = String(row.observacion_estado || '').toUpperCase();
      
      const isBajaDia1Val = isBajaDia1(txtMotivo, row.sigla, row) || txtEstado.includes('BAJA DIA 1') || txtObs.includes('BAJA DIA 1');
      
      result.push({
        ...row,
        _campana: rowCampana,
        _rawCampana: campana,
        _gpe: gpe,
        _periodo: rowPeriodo,
        _semana: rowSemana,
        _segmento: rowSegmento,
        isBajaDia1: isBajaDia1Val,
        isDescuento: Boolean(row.isDescuento)
      });
    }
    return result;
  }, [data, getCapInfo, maxPeriodoOperativo]);

  // ── Jerarquía en Cascada Estricta (Periodo -> Semana -> Segmento -> Campaña -> GPE) ──
  const filterOptions = useMemo(() => {
    const matchPeriodo = (p) => filters.periodo === 'Todas' || String(p || '').trim() === String(filters.periodo).trim();
    const matchSemana = (s) => filters.semana === 'Todas' || String(s || '').trim().toUpperCase() === String(filters.semana).trim().toUpperCase();
    const matchSegmento = (seg) => filters.segmento === 'Todas' || String(seg || '').trim().toUpperCase() === String(filters.segmento).trim().toUpperCase();
    const matchCampana = (c) => filters.campana === 'Todas' || String(c || '').trim().toUpperCase() === String(filters.campana).trim().toUpperCase();

    const periodos = new Set();
    const semanas = new Set();
    const segmentos = new Set();
    const campanas = new Set();
    const gpes = new Set();

    // 1. Maestro de Periodos y Semanas por Periodo de Inicio (Capacidad RYS)
    for (let i = 0; i < allCapacidadItems.length; i++) {
      const c = allCapacidadItems[i];
      if (isPeriodoOperativoValido(c.periodo, maxPeriodoOperativo)) periodos.add(c.periodo);
      if (matchPeriodo(c.periodo)) {
        if (c.semana) semanas.add(c.semana);
        if (matchSemana(c.semana)) {
          if (c.segmento) segmentos.add(c.segmento);
          if (matchSegmento(c.segmento)) {
            if (c.campana) campanas.add(c.campana);
            if (matchCampana(c.campana) && c.codigo) gpes.add(c.codigo);
          }
        }
      }
    }

    // 2. Asistencias válidas asociadas a este Periodo de Inicio
    for (let i = 0; i < validData.length; i++) {
      const r = validData[i];
      if (isPeriodoOperativoValido(r._periodo, maxPeriodoOperativo)) periodos.add(r._periodo);
      if (matchPeriodo(r._periodo)) {
        if (filters.periodo === 'Todas' && r._semana) {
          semanas.add(r._semana);
        }
        if (matchSemana(r._semana)) {
          if (r._segmento && r._segmento !== 'SIN SEGMENTO') segmentos.add(r._segmento);
          if (matchSegmento(r._segmento)) {
            if (r._campana && r._campana !== 'SIN CAMPAÑA') campanas.add(r._campana);
            if (matchCampana(r._campana) && r._gpe && r._gpe !== 'SIN GPE') gpes.add(r._gpe);
          }
        }
      }
    }

    const estados = new Set(['ACTIVO', 'CESADO', 'BAJA DIA 1']);

    const sortedSemanas = Array.from(semanas).sort((a, b) => {
      const numA = parseInt(String(a).replace(/\D/g, '')) || 0;
      const numB = parseInt(String(b).replace(/\D/g, '')) || 0;
      return numA - numB;
    });

    return {
      periodo: ['Todas', ...Array.from(periodos).filter(p => isPeriodoOperativoValido(p, maxPeriodoOperativo)).sort().reverse()],
      semana: ['Todas', ...sortedSemanas],
      segmento: sortOptions(segmentos),
      campana: sortOptions(campanas),
      gpe: sortOptions(gpes),
      estado: ['Todas', ...Array.from(estados)],
    };
  }, [validData, allCapacidadItems, filters.periodo, filters.semana, filters.segmento, filters.campana, maxPeriodoOperativo]);

  const handleFilterChange = (key, value) => {
    setPage(1);
    setFilters((prev) => {
      const next = { ...prev, [key]: value };
      if (key === 'periodo') {
        next.semana = 'Todas';
        next.segmento = 'Todas';
        next.campana = 'Todas';
        next.gpe = 'Todas';
      } else if (key === 'semana') {
        next.segmento = 'Todas';
        next.campana = 'Todas';
        next.gpe = 'Todas';
      } else if (key === 'segmento') {
        next.campana = 'Todas';
        next.gpe = 'Todas';
      } else if (key === 'campana') {
        next.gpe = 'Todas';
      } else if (key === 'gpe' && value !== 'Todas') {
        const cap = getCapInfo(next.campana, value);
        if (cap) {
          if (next.periodo === 'Todas' && cap.periodo) next.periodo = cap.periodo;
          if (next.semana === 'Todas' && cap.semana) next.semana = cap.semana;
          if (next.segmento === 'Todas' && cap.segmento) next.segmento = cap.segmento;
          if (next.campana === 'Todas' && cap.campana) next.campana = cap.campana;
        }
      }
      return next;
    });
  };

  // ── Carga Quirúrgica Bajo Demanda (On-Demand Fetch) para optimizar Egress ──
  useEffect(() => {
    if (loading) return;

    const targetSemana = filters.semana !== 'Todas' ? filters.semana : null;
    const targetGpe = filters.gpe !== 'Todas' ? filters.gpe : null;
    const targetCampana = filters.campana !== 'Todas' && filters.campana !== 'Sin campaña' ? filters.campana : null;
    const targetPeriodo = filters.periodo !== 'Todas' ? filters.periodo : null;

    if (!targetSemana && !targetGpe && !targetPeriodo) return;

    const requestKey = `${targetGpe || 'all'}_${targetSemana || 'all'}_${targetPeriodo || 'all'}_${targetCampana || 'all'}`;
    if (fetchedFiltersRef.current.has(requestKey)) return;

    // 1. Caso Semana / GPE específico
    if (targetGpe || targetSemana) {
      const hasData = validData.some((row) => {
        if (targetGpe && row._gpe === targetGpe) {
          if (!targetCampana || row._campana === targetCampana) return true;
        }
        if (!targetGpe && targetSemana && row._semana === targetSemana) {
          if (!targetCampana || row._campana === targetCampana) return true;
        }
        return false;
      });

      if (!hasData) {
        let isMounted = true;
        setLoadingHistorical(true);
        fetchedFiltersRef.current.add(requestKey);

        fetchConsolidadoOnDemand({
          semana: targetSemana,
          gpe: targetGpe,
          campana: targetCampana
        }).then((newRows) => {
          if (!isMounted) return;
          if (newRows && newRows.length > 0) {
            setData((prev) => {
              const existingIds = new Set(prev.map((r) => r.id));
              const fresh = newRows.filter((r) => !existingIds.has(r.id));
              return fresh.length > 0 ? [...prev, ...fresh] : prev;
            });
          }
        }).catch((err) => {
          console.error('Error al descargar registros históricos:', err);
        }).finally(() => {
          if (isMounted) setLoadingHistorical(false);
        });

        return () => {
          isMounted = false;
        };
      }
    } else if (targetPeriodo && !targetSemana && !targetGpe) {
      // 2. Caso Período seleccionado pero sin semana específica
      const hasPeriodData = validData.some((row) => row._periodo === targetPeriodo);
      if (!hasPeriodData) {
        const periodSemanas = Array.from(new Set(
          allCapacidadItems.filter((c) => c.periodo === targetPeriodo).map((c) => c.semana).filter(Boolean)
        ));

        if (periodSemanas.length > 0) {
          let isMounted = true;
          setLoadingHistorical(true);
          fetchedFiltersRef.current.add(requestKey);

          Promise.all(
            periodSemanas.map((sem) => fetchConsolidadoOnDemand({ semana: sem, campana: targetCampana }))
          ).then((results) => {
            if (!isMounted) return;
            const flat = results.flat();
            if (flat.length > 0) {
              setData((prev) => {
                const existingIds = new Set(prev.map((r) => r.id));
                const fresh = flat.filter((r) => !existingIds.has(r.id));
                return fresh.length > 0 ? [...prev, ...fresh] : prev;
              });
            }
          }).catch((err) => {
            console.error('Error al descargar período histórico:', err);
          }).finally(() => {
            if (isMounted) setLoadingHistorical(false);
          });

          return () => {
            isMounted = false;
          };
        }
      }
    }
  }, [filters.semana, filters.gpe, filters.campana, filters.periodo, loading, validData, allCapacidadItems]);

  // ── Datos filtrados para Indicadores / KPIs ──
  const kpiFilteredData = useMemo(() => {
    return validData.filter((row) => {
      if (filters.periodo !== 'Todas' && row._periodo !== filters.periodo) return false;
      if (filters.semana !== 'Todas' && row._semana !== filters.semana) return false;
      if (filters.segmento !== 'Todas' && row._segmento !== filters.segmento) return false;
      if (filters.campana !== 'Todas' && row._campana !== filters.campana) return false;
      if (filters.gpe !== 'Todas' && row._gpe !== filters.gpe) return false;
      return true;
    });
  }, [validData, filters.periodo, filters.semana, filters.segmento, filters.campana, filters.gpe]);

  // ── Mapa de último estado y Set de Descuentos autorizados por documento ──
  const { lastStateMap, descuentosDocSet } = useMemo(() => {
    const latestDocMap = new Map();
    const descSet = new Set();

    for (let i = 0; i < kpiFilteredData.length; i++) {
      const row = kpiFilteredData[i];
      const doc = normalizeText(row.documento);
      if (!doc) continue;
      
      if (row.isDescuento) {
        descSet.add(doc);
      }

      const d = parseLocalDate(row.fecha_registro_asistencia);
      const time = d ? d.getTime() : 0;
      
      const prev = latestDocMap.get(doc);
      if (!prev || time >= prev.time) {
        latestDocMap.set(doc, { time, row });
      }
    }

    const stateMap = new Map();
    for (const [doc, { row }] of latestDocMap.entries()) {
      const motivo = row?.motivo_baja || row?.motivo;
      const sigla = normalizeSigla(row?.sigla);
      if (isBajaDia1(motivo, sigla, row)) {
        stateMap.set(doc, 'BAJA DIA 1');
      } else if (isBajaCapacitacion(row) || sigla === 'B') {
        stateMap.set(doc, 'CESADO');
      } else {
        stateMap.set(doc, 'ACTIVO');
      }
    }

    return { lastStateMap: stateMap, descuentosDocSet: descSet };
  }, [kpiFilteredData]);

  // ── Datos filtrados para la Tabla ──
  const filteredData = useMemo(() => {
    if (filters.estado === 'Todas') return kpiFilteredData;

    return kpiFilteredData.filter((row) => {
      const doc = normalizeText(row.documento);
      const lastState = lastStateMap.get(doc) || (normalizeSigla(row.sigla) === 'B' ? 'CESADO' : normalizeEstado(row.estado));
      return lastState === filters.estado;
    });
  }, [kpiFilteredData, filters.estado, lastStateMap]);

  const uniqueDates = useMemo(() => {
    const datesMap = new Map();
    for (let i = 0; i < filteredData.length; i++) {
      const rawDate = filteredData[i].fecha_registro_asistencia;
      if (rawDate) {
        const canonical = formatCanonicalDate(rawDate);
        const parsed = parseLocalDate(rawDate);
        if (canonical && parsed) {
          datesMap.set(canonical, parsed.getTime());
        }
      }
    }
    return Array.from(datesMap.entries())
      .sort((a, b) => a[1] - b[1])
      .map(([canonical]) => canonical);
  }, [filteredData]);

  const pivotRows = useMemo(() => {
    const map = new Map();
    
    for (let i = 0; i < filteredData.length; i++) {
      const row = filteredData[i];
      const doc = normalizeText(row.documento);
      if (!doc) continue;
      
      const d = parseLocalDate(row.fecha_registro_asistencia);
      const time = d ? d.getTime() : 0;
      
      let entry = map.get(doc);
      if (!entry) {
        entry = {
          documento: doc,
          latestTime: time,
          lastRow: row,
          fechas: {},
        };
        map.set(doc, entry);
      } else if (time >= entry.latestTime) {
        entry.latestTime = time;
        entry.lastRow = row;
      }
      
      if (row.fecha_registro_asistencia) {
        const canonical = formatCanonicalDate(row.fecha_registro_asistencia);
        if (canonical) {
          entry.fechas[canonical] = normalizeSigla(row.sigla);
        }
      }
    }

    let result = [];
    for (const [doc, entry] of map.entries()) {
      const lastRow = entry.lastRow;
      const campana = lastRow._campana;
      const gpe = lastRow._gpe;
      const cap = getCapInfo(campana, gpe);
      const docState = lastStateMap.get(doc) || (normalizeSigla(lastRow.sigla) === 'B' ? 'CESADO' : normalizeEstado(lastRow.estado));
      const hasDescuento = descuentosDocSet.has(doc) || Boolean(lastRow.isDescuento);

      result.push({
        documento: doc,
        nombre_completo: `${normalizeText(lastRow.apellido_paterno)} ${normalizeText(lastRow.apellido_materno)} ${normalizeText(lastRow.nombres)}`.trim(),
        ult_estado: docState,
        isDescuento: hasDescuento,
        fecha_inicio_ojt: cap?.fecha_inicio_ojt || '—',
        gpe: gpe || '—',
        condicion_laboral: normalizeText(lastRow.condicion_laboral, '—'),
        tipo_reclutado: normalizeText(lastRow.tipo_reclutado, '—'),
        fechas: entry.fechas,
      });
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (r) => r.documento.toLowerCase().includes(q) || r.nombre_completo.toLowerCase().includes(q)
      );
    }
    return result;
  }, [filteredData, getCapInfo, lastStateMap, descuentosDocSet, search]);

  const totalPages = pageSize === 'Todas' ? 1 : Math.max(1, Math.ceil(pivotRows.length / Number(pageSize)));
  const currentPage = Math.min(page, totalPages);
  
  const paginatedRows = useMemo(() => {
    if (pageSize === 'Todas') return pivotRows;
    const size = Number(pageSize) || 50;
    const start = (currentPage - 1) * size;
    return pivotRows.slice(start, start + size);
  }, [pivotRows, currentPage, pageSize]);

  const kpis = useMemo(() => {
    const docMap = new Map();
    let cantAusencia = 0;
    let cantAsistencia = 0;

    kpiFilteredData.forEach((row) => {
      const doc = normalizeText(row.documento);
      if (!doc) return;

      if (!docMap.has(doc)) {
        docMap.set(doc, []);
      }
      docMap.get(doc).push(row);

      const sigla = normalizeSigla(row.sigla);
      if (sigla === 'A' || sigla === 'I-OP') {
        cantAsistencia += 1;
      }
      if (sigla === 'FI' || sigla === 'FJ') {
        cantAusencia += 1;
      }
    });

    let activos = 0;
    let desertoresFormacion = 0;
    let bajasDia1 = 0;
    let descuentosAprobados = 0;
    let qDia1 = 0;

    docMap.forEach((rows, doc) => {
      const docState = lastStateMap.get(doc) || 'SIN ESTADO';
      const hasDescuento = descuentosDocSet.has(doc);
      if (hasDescuento) descuentosAprobados += 1;

      const isActivo = docState === 'ACTIVO';
      const isB1 = docState === 'BAJA DIA 1';
      const isCesado = docState === 'CESADO';

      const attendedAny = rows.some((r) => {
        const s = normalizeSigla(r.sigla);
        return s === 'A' || s === 'I-OP';
      });

      if (isActivo) activos += 1;
      if (isB1) bajasDia1 += 1;
      if (isCesado) {
        // Regla: Los descuentos autorizados y bajas día 1 NO suman a la deserción de Formación
        if (!hasDescuento) {
          desertoresFormacion += 1;
        }
      }

      // Q Día 1: Asistentes efectivos a Día 1 (excluye quien tuvo Baja Día 1)
      if ((attendedAny || isActivo) && !isB1) qDia1 += 1;
    });

    let sumMetaDia1 = 0;
    let sumRqSolicitado = 0;
    const computedGroups = new Set();

    // 1. Sumar capacidades de los grupos en las filas activas
    kpiFilteredData.forEach((row) => {
      const gpe = normalizeGpe(row.codigo_grupo || row.grupo);
      const campana = normalizeCampana(row.campana);
      const key = `${campana}|${gpe}`;
      if (!computedGroups.has(key)) {
        computedGroups.add(key);
        const cap = getCapInfo(campana, gpe);
        if (cap) {
          sumMetaDia1 += cap.meta_dia_1;
          sumRqSolicitado += cap.rq_solicitado;
        }
      }
    });

    // 2. Si no hubo filas de asistencia pero hay capacidades coincidentes con los filtros seleccionados
    if (sumRqSolicitado === 0 && (filters.periodo !== 'Todas' || filters.semana !== 'Todas' || filters.segmento !== 'Todas' || filters.campana !== 'Todas' || filters.gpe !== 'Todas')) {
      allCapacidadItems.forEach((cap) => {
        if (filters.periodo !== 'Todas' && cap.periodo !== filters.periodo) return;
        if (filters.semana !== 'Todas' && cap.semana !== filters.semana) return;
        if (filters.segmento !== 'Todas' && cap.segmento !== filters.segmento) return;
        if (filters.campana !== 'Todas' && cap.campana !== filters.campana) return;
        if (filters.gpe !== 'Todas' && cap.codigo !== filters.gpe) return;

        const key = `${cap.campana}|${cap.codigo}`;
        if (!computedGroups.has(key)) {
          computedGroups.add(key);
          sumMetaDia1 += Number(cap.meta_dia_1) || 0;
          sumRqSolicitado += Number(cap.rq_solicitado) || 0;
        }
      });
    }

    const baseFormacion = qDia1 > 0 ? qDia1 : Math.max(0, docMap.size - bajasDia1);

    return {
      activos,
      qDia1,
      desertoresFormacion,
      bajasDia1,
      descuentosAprobados,
      baseFormacion,
      cantAusencia,
      cantAsistencia,
      cantProg: docMap.size,
      sumMetaDia1,
      sumRqSolicitado,
    };
  }, [kpiFilteredData, getCapInfo, lastStateMap, descuentosDocSet, allCapacidadItems, filters]);

  const percentages = useMemo(() => {
    // 1. Cumplimiento Día 1: Métrica de Selección / RyS
    const cumpDia1 = kpis.sumMetaDia1 > 0 
      ? Math.round((kpis.qDia1 / kpis.sumMetaDia1) * 100) 
      : (kpis.cantProg > 0 ? Math.round((kpis.qDia1 / kpis.cantProg) * 100) : 100);

    // 2. Deserción Formación: Métrica de Capacitación (Bajas en aula sin descuento sobre base de inicio en aula)
    const desercion = kpis.baseFormacion > 0 
      ? Math.round((kpis.desertoresFormacion / kpis.baseFormacion) * 100) 
      : 0;

    // 3. Dotación: Activos actuales sobre RQ solicitado
    const dotacion = kpis.sumRqSolicitado > 0 
      ? Math.round((kpis.activos / kpis.sumRqSolicitado) * 100) 
      : (kpis.cantProg > 0 ? Math.round((kpis.activos / kpis.cantProg) * 100) : 100);

    // 4. Absentismo
    const totalAsisFalt = kpis.cantAsistencia + kpis.cantAusencia;
    const absentismo = totalAsisFalt > 0 
      ? Math.round((kpis.cantAusencia / totalAsisFalt) * 100) 
      : 0;

    return {
      cumpDia1,
      desercion: Math.min(desercion, 100),
      dotacion,
      absentismo: Math.min(absentismo, 100),
    };
  }, [kpis]);

  const handleExport = () => {
    if (!pivotRows.length) return;
    const rowsToExport = pivotRows.map((r) => {
      const base = {
        DOCUMENTO: r.documento,
        'NOMBRE COMPLETO': r.nombre_completo,
        'ULT. ESTADO': r.ult_estado,
        'FECHA INICIO OJT': r.fecha_inicio_ojt,
        GPE: r.gpe,
        'CONDICIÓN LABORAL': r.condicion_laboral,
        'TIPO RECLUTADO': r.tipo_reclutado,
      };
      uniqueDates.forEach((date) => {
        base[date] = r.fechas[date] || '';
      });
      return base;
    });

    const ws = XLSX.utils.json_to_sheet(rowsToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Consolidado_Asistencias');
    const timestamp = new Date().toISOString().substring(0, 10);
    XLSX.writeFile(wb, `Control_Asistencia_${timestamp}.xlsx`);
  };

  const getSiglaColor = (sigla) => {
    const s = String(sigla || '').toUpperCase();
    if (s === 'A') return 'bg-emerald-500/15 text-emerald-400 font-black border border-emerald-500/30';
    if (s === 'B') return 'bg-rose-500/20 text-rose-400 font-black border border-rose-500/40 animate-pulse';
    if (s === 'FI') return 'bg-amber-500/15 text-amber-400 font-bold border border-amber-500/30';
    if (s === 'FJ') return 'bg-sky-500/15 text-sky-400 font-bold border border-sky-500/30';
    if (s === 'I-OP') return 'bg-purple-500/20 text-purple-300 font-black border border-purple-500/40';
    if (s === 'S' || s === 'SUS') return 'bg-zinc-500/15 text-zinc-400 font-medium';
    return 'text-slate-600 dark:text-slate-500';
  };

  const FIXED_COLS = [
    { id: 'documento', label: 'DOCUMENTO', width: 95, left: 0 },
    { id: 'nombre', label: 'NOMBRE COMPLETO', width: 220, left: 95 },
    { id: 'estado', label: 'ULT. ESTADO', width: 85, left: 315 },
    { id: 'fecha', label: 'FECHA OJT', width: 95, left: 400 },
    { id: 'gpe', label: 'GPE', width: 110, left: 495 },
    { id: 'condicion', label: 'CONDICIÓN', width: 95, left: 605 },
    { id: 'tipo', label: 'TIPO REC.', width: 90, left: 700 },
  ];

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-[var(--bg-base)]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 size={32} className="animate-spin text-cyan-400" />
          <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
            Cargando Consolidado PowerBI...
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center p-6 bg-[var(--bg-base)]">
        <div className="p-6 rounded-2xl bg-[var(--bg-surface)] border border-rose-500/30 text-center max-w-sm space-y-3 shadow-xl">
          <AlertCircle size={28} className="text-rose-500 mx-auto" />
          <h3 className="text-sm font-bold text-[var(--text-primary)]">Error al cargar datos</h3>
          <p className="text-xs text-[var(--text-muted)]">{error}</p>
          <button onClick={loadData} className="px-4 py-2 rounded-xl bg-cyan-500 text-white text-xs font-bold hover:bg-cyan-600 transition-all cursor-pointer">
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden bg-[var(--bg-base)] p-3 gap-2 select-none">
      
      {/* ── 1. COMPACT HERO HEADER + FILTERS IN 1 ROW (Height ~38px) ── */}
      <div className="flex flex-wrap items-center justify-between gap-2 shrink-0 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl px-3 py-1.5 shadow-xs">
        
        {/* Title */}
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_8px_#06B6D4] animate-pulse" />
          <h2 className="text-xs sm:text-sm font-black tracking-tight text-[var(--text-primary)] uppercase">
            Control de Asistencia <span className="text-[10px] text-[var(--text-muted)] font-medium lowercase">· consolidado bi</span>
          </h2>
          {loadingHistorical && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-cyan-500/15 border border-cyan-500/30 text-[9px] font-bold text-cyan-400 animate-pulse">
              <Loader2 className="w-3 h-3 animate-spin text-cyan-400" />
              <span>Cargando histórico...</span>
            </span>
          )}
        </div>

        {/* Inline Compact Filter Badges (Jerarquía: Periodo -> Semana -> Segmento -> Campaña -> GPE -> Estado) */}
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { key: 'periodo', label: 'Período', options: filterOptions.periodo },
            { key: 'semana', label: 'Semana', options: filterOptions.semana },
            { key: 'segmento', label: 'Segmento', options: filterOptions.segmento },
            { key: 'campana', label: 'Campaña', options: filterOptions.campana },
            { key: 'gpe', label: 'GPE', options: filterOptions.gpe },
            { key: 'estado', label: 'Estado', options: filterOptions.estado },
          ].map(({ key, label, options }) => (
            <div key={key} className="flex items-center gap-1 bg-[var(--bg-elevated)] border border-[var(--border-normal)] rounded-lg px-2 py-1">
              <span className="text-[8px] font-black uppercase tracking-wider text-[var(--text-muted)]">
                {label}:
              </span>
              <select
                value={filters[key]}
                onChange={(e) => handleFilterChange(key, e.target.value)}
                className="bg-transparent text-[11px] font-bold text-[var(--text-primary)] outline-none cursor-pointer max-w-[110px] truncate"
              >
                {options.map((opt) => (
                  <option key={opt} value={opt} className="bg-[var(--bg-surface)] text-[var(--text-primary)]">
                    {opt}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </div>

      {/* ── 2. KPI STRIP: STRATEGIC INDICATORS (TOP, PROMINENT) + OPERATIONAL COUNTS (BOTTOM, COMPACT) ── */}
      <div className="flex flex-col gap-2 shrink-0">
        
        {/* ROW 1: STRATEGIC INDICATORS (Larger, High-Impact Gauges with Minimalist Vectors) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          <HeroIndicatorCard 
            art={KpiArt.Target}
            label="% Cumplimiento Día 1" 
            value={percentages.cumpDia1} 
            color={percentages.cumpDia1 >= 95 ? '#10B981' : percentages.cumpDia1 >= 80 ? '#F59E0B' : '#F43F5E'} 
            statusText={percentages.cumpDia1 >= 95 ? 'Excelente' : percentages.cumpDia1 >= 80 ? 'Atención' : 'Bajo'} 
            sublabel={`Meta D1: ${kpis.sumMetaDia1} · Real: ${kpis.qDia1}`}
            detail={`${kpis.qDia1} asistentes de ${kpis.sumMetaDia1 || kpis.cantProg} meta`}
          />
          <HeroIndicatorCard 
            art={KpiArt.Attrition}
            label="% Deserción Formación" 
            value={percentages.desercion} 
            color={percentages.desercion >= 40 ? '#F43F5E' : percentages.desercion >= 35 ? '#F59E0B' : '#10B981'} 
            statusText={percentages.desercion >= 40 ? 'Crítico' : percentages.desercion >= 35 ? 'Atención' : 'Óptimo'} 
            sublabel={`Bajas Formación: ${kpis.desertoresFormacion} postulantes`}
            detail={`${kpis.desertoresFormacion} bajas en aula sobre ${kpis.baseFormacion} que iniciaron (Excluye ${kpis.bajasDia1} D1)`}
          />
          <HeroIndicatorCard 
            art={KpiArt.Capacity}
            label="% Dotación" 
            value={percentages.dotacion} 
            color={percentages.dotacion >= 95 ? '#10B981' : percentages.dotacion >= 80 ? '#06B6D4' : '#F43F5E'} 
            statusText={percentages.dotacion >= 95 ? 'Dentro de Meta' : percentages.dotacion >= 80 ? 'Aceptable' : 'Déficit'} 
            sublabel={`RQ: ${kpis.sumRqSolicitado} · Activos: ${kpis.activos}`}
            detail={`${kpis.activos} activos de ${kpis.sumRqSolicitado || kpis.cantProg} requeridos`}
          />
          <HeroIndicatorCard 
            art={KpiArt.Absence}
            label="% Absentismo" 
            value={percentages.absentismo} 
            color={percentages.absentismo <= 5 ? '#10B981' : percentages.absentismo <= 12 ? '#F59E0B' : '#F43F5E'} 
            statusText={percentages.absentismo <= 5 ? 'Bajo' : percentages.absentismo <= 12 ? 'Moderado' : 'Crítico'} 
            sublabel={`Faltas: ${kpis.cantAusencia} jornadas`}
            detail={`${kpis.cantAusencia} inasistencias registradas`}
          />
        </div>

        {/* ROW 2: OPERATIONAL VOLUMES (Smaller, Refined, Balanced with Contextual Minimalist Drawing) */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          <CompactVolumeCard 
            art={KpiArt.ActiveUsers}
            label="Cantidad de Activos" 
            value={kpis.activos} 
            color="#06B6D4" 
            trend={[10, 15, 12, 19, 24, kpis.activos]} 
            subcopy={`de ${kpis.cantProg} prog.`} 
          />
          <CompactVolumeCard 
            art={KpiArt.DayOne}
            label="Q Día 1" 
            value={kpis.qDia1} 
            color="#10B981" 
            trend={[5, 12, 18, 22, kpis.qDia1]} 
            subcopy="asistieron" 
          />
          <CompactVolumeCard 
            art={KpiArt.Dropouts}
            label="Bajas Formación" 
            value={kpis.desertoresFormacion} 
            color="#F43F5E" 
            trend={[2, 4, 8, 14, kpis.desertoresFormacion]} 
            subcopy="en aula (sin D1)" 
          />
          <CompactVolumeCard 
            art={KpiArt.Attrition}
            label="Bajas Día 1" 
            value={kpis.bajasDia1} 
            color="#F59E0B" 
            trend={[1, 2, 3, 2, kpis.bajasDia1]} 
            subcopy="RyS / No Show" 
          />
          <CompactVolumeCard 
            art={KpiArt.Faults}
            label="Cant. Ausencia" 
            value={kpis.cantAusencia} 
            color="#EAB308" 
            trend={[4, 8, 6, 12, kpis.cantAusencia]} 
            subcopy="FI + FJ" 
          />
          <CompactVolumeCard 
            art={KpiArt.Scheduled}
            label="Programados" 
            value={kpis.cantProg} 
            color="#8B5CF6" 
            trend={[10, 20, 30, 40, kpis.cantProg]} 
            subcopy={kpis.descuentosAprobados > 0 ? `${kpis.descuentosAprobados} desc. autoriz.` : "nómina total"} 
          />
        </div>

      </div>

      {/* ── 3. FULL-HEIGHT TABLE WITH INTERNAL SCROLL ── */}
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-xl">
        
        {/* Table Toolbar (Height ~36px) */}
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--border-subtle)] bg-[var(--bg-elevated)]/40 gap-3 shrink-0">
          <div className="relative flex-1 max-w-xs">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Buscar por documento o nombre..."
              className="w-full h-7 pl-7 pr-6 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-normal)] text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] outline-none focus:border-cyan-500 transition-colors font-medium"
            />
            {search && (
              <button onClick={() => { setSearch(''); setPage(1); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                <X size={11} />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] text-[var(--text-muted)] font-mono font-bold">
              {pivotRows.length} postulantes
            </span>
            <button
              onClick={handleExport}
              disabled={!pivotRows.length}
              className="flex items-center gap-1.5 h-7 px-3 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 text-xs font-bold transition-all active:scale-95 disabled:opacity-30 cursor-pointer"
            >
              <Download size={12} /> Excel
            </button>
          </div>
        </div>

        {/* Scrollable Matrix Table */}
        <div className="flex-1 min-h-0 overflow-x-auto overflow-y-auto custom-scrollbar relative bg-[var(--bg-surface)]">
          <table className="w-full min-w-[1200px] border-separate border-spacing-0 text-left text-xs">
            <thead className="sticky top-0 z-30 shadow-xs">
              <tr>
                {FIXED_COLS.map((col) => (
                  <th
                    key={col.id}
                    className="sticky top-0 z-30 bg-[var(--table-head-bg)] border-b border-[var(--border-subtle)] px-2.5 py-2 text-left text-[9px] font-black uppercase tracking-[0.14em] text-[var(--text-muted)]"
                    style={{ left: col.left, minWidth: col.width, maxWidth: col.width }}
                  >
                    {col.label}
                  </th>
                ))}
                {uniqueDates.map((date) => (
                  <th
                    key={date}
                    className="sticky top-0 z-10 bg-[var(--table-head-bg)] border-b border-[var(--border-subtle)] px-2 py-2 text-center text-[9px] font-black uppercase tracking-[0.14em] text-[var(--accent)]"
                  >
                    {date}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paginatedRows.map((row) => (
                <tr key={row.documento} className="group transition-colors bg-[var(--bg-surface)] hover:bg-[var(--bg-elevated)]">
                  <td className="sticky z-20 bg-[var(--bg-surface)] group-hover:bg-[var(--bg-elevated)] px-2.5 py-1.5 font-bold font-mono text-[var(--text-primary)] whitespace-nowrap truncate border-b border-[var(--border-subtle)] text-[11px]" style={{ left: FIXED_COLS[0].left, minWidth: FIXED_COLS[0].width, maxWidth: FIXED_COLS[0].width }}>
                    {row.documento}
                  </td>
                  <td className="sticky z-20 bg-[var(--bg-surface)] group-hover:bg-[var(--bg-elevated)] px-2.5 py-1.5 text-[var(--text-primary)] font-semibold whitespace-nowrap truncate border-b border-[var(--border-subtle)] text-[11px]" style={{ left: FIXED_COLS[1].left, minWidth: FIXED_COLS[1].width, maxWidth: FIXED_COLS[1].width }}>
                    {row.nombre_completo}
                  </td>
                  <td className="sticky z-20 bg-[var(--bg-surface)] group-hover:bg-[var(--bg-elevated)] px-2.5 py-1.5 border-b border-[var(--border-subtle)]" style={{ left: FIXED_COLS[2].left, minWidth: FIXED_COLS[2].width, maxWidth: FIXED_COLS[2].width }}>
                    <div className="flex items-center gap-1">
                      <span className={`inline-flex rounded-md px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider ${row.ult_estado === 'ACTIVO' ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30' : row.ult_estado === 'BAJA DIA 1' ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30' : 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30'}`}>
                        {row.ult_estado}
                      </span>
                      {row.isDescuento && (
                        <span className="inline-flex rounded px-1 py-0.5 text-[8px] font-black uppercase tracking-tight bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 border border-cyan-500/30" title="Descuento autorizado por RyS/Capacitación (No penaliza)">
                          DESC
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="sticky z-20 bg-[var(--bg-surface)] group-hover:bg-[var(--bg-elevated)] px-2.5 py-1.5 text-[var(--text-secondary)] whitespace-nowrap truncate border-b border-[var(--border-subtle)] font-mono text-[10px]" style={{ left: FIXED_COLS[3].left, minWidth: FIXED_COLS[3].width, maxWidth: FIXED_COLS[3].width }}>
                    {row.fecha_inicio_ojt}
                  </td>
                  <td className="sticky z-20 bg-[var(--bg-surface)] group-hover:bg-[var(--bg-elevated)] px-2.5 py-1.5 text-[var(--text-primary)] font-bold whitespace-nowrap truncate border-b border-[var(--border-subtle)] font-mono text-[10px]" style={{ left: FIXED_COLS[4].left, minWidth: FIXED_COLS[4].width, maxWidth: FIXED_COLS[4].width }}>
                    {row.gpe}
                  </td>
                  <td className="sticky z-20 bg-[var(--bg-surface)] group-hover:bg-[var(--bg-elevated)] px-2.5 py-1.5 text-[var(--text-muted)] whitespace-nowrap truncate border-b border-[var(--border-subtle)] text-[10px]" style={{ left: FIXED_COLS[5].left, minWidth: FIXED_COLS[5].width, maxWidth: FIXED_COLS[5].width }}>
                    {row.condicion_laboral}
                  </td>
                  <td className="sticky z-20 bg-[var(--bg-surface)] group-hover:bg-[var(--bg-elevated)] px-2.5 py-1.5 text-[var(--text-muted)] whitespace-nowrap truncate border-r border-b border-[var(--border-subtle)] text-[10px]" style={{ left: FIXED_COLS[6].left, minWidth: FIXED_COLS[6].width, maxWidth: FIXED_COLS[6].width }}>
                    {row.tipo_reclutado}
                  </td>
                  {uniqueDates.map((date) => {
                    const sigla = row.fechas[date] || '';
                    const meta = STATUS_META[sigla];
                    return (
                      <td key={date} className="px-1 py-1 text-center border-b border-[var(--border-subtle)]">
                        <div
                          className="heat-cell mx-auto flex h-6 min-w-[30px] items-center justify-center rounded-md text-[9px] font-black uppercase tracking-wider transition-transform group-hover:scale-105"
                          style={{
                            backgroundColor: meta ? meta.bg : 'var(--status-empty-bg)',
                            color: meta ? meta.text : 'var(--text-muted)',
                          }}
                        >
                          {sigla || '—'}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}

              {pivotRows.length === 0 && (
                <tr>
                  <td colSpan={7 + uniqueDates.length} className="px-4 py-16 text-center text-[var(--text-muted)]">
                    {loadingHistorical ? (
                      <div className="flex flex-col items-center justify-center">
                        <Loader2 size={32} className="mx-auto mb-2 text-cyan-500 animate-spin" />
                        <p className="font-bold text-xs text-cyan-400">Descargando registros históricos bajo demanda...</p>
                        <p className="text-[10px] text-[var(--text-muted)] mt-1">Conectando con Supabase de forma quirúrgica para optimizar el consumo de red.</p>
                      </div>
                    ) : (
                      <>
                        <AlertCircle size={32} className="mx-auto mb-2 text-[var(--text-faint)]" />
                        <p className="font-bold text-xs">No hay registros de asistencia que coincidan con los filtros.</p>
                      </>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Toolbar */}
        <div className="flex flex-wrap items-center justify-between px-3 py-1.5 border-t border-[var(--border-subtle)] bg-[var(--bg-elevated)]/40 gap-2 shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-[var(--text-muted)] font-medium">Filas por página:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(e.target.value === 'Todas' ? 'Todas' : Number(e.target.value));
                setPage(1);
              }}
              className="bg-[var(--bg-surface)] border border-[var(--border-normal)] rounded px-1.5 py-0.5 text-[10px] font-bold text-[var(--text-primary)] outline-none cursor-pointer"
            >
              {[25, 50, 100, 250, 'Todas'].map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
            <span className="text-[10px] text-[var(--text-muted)] font-mono font-bold ml-1">
              {pivotRows.length > 0
                ? `${pageSize === 'Todas' ? 1 : (currentPage - 1) * Number(pageSize) + 1}–${pageSize === 'Todas' ? pivotRows.length : Math.min(currentPage * Number(pageSize), pivotRows.length)} de ${pivotRows.length}`
                : '0 de 0'}
            </span>
          </div>

          {pageSize !== 'Todas' && totalPages > 1 && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(1)}
                disabled={currentPage <= 1}
                className="h-6 w-6 rounded flex items-center justify-center bg-[var(--bg-surface)] border border-[var(--border-normal)] hover:bg-[var(--bg-elevated)] disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer text-[var(--text-primary)]"
                title="Primera página"
              >
                <ChevronsLeft size={12} />
              </button>
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
                className="h-6 w-6 rounded flex items-center justify-center bg-[var(--bg-surface)] border border-[var(--border-normal)] hover:bg-[var(--bg-elevated)] disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer text-[var(--text-primary)]"
                title="Página anterior"
              >
                <ChevronLeft size={12} />
              </button>
              
              <span className="text-[10px] font-mono font-bold text-[var(--text-primary)] px-2">
                Pág. {currentPage} / {totalPages}
              </span>

              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                className="h-6 w-6 rounded flex items-center justify-center bg-[var(--bg-surface)] border border-[var(--border-normal)] hover:bg-[var(--bg-elevated)] disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer text-[var(--text-primary)]"
                title="Página siguiente"
              >
                <ChevronRight size={12} />
              </button>
              <button
                onClick={() => setPage(totalPages)}
                disabled={currentPage >= totalPages}
                className="h-6 w-6 rounded flex items-center justify-center bg-[var(--bg-surface)] border border-[var(--border-normal)] hover:bg-[var(--bg-elevated)] disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer text-[var(--text-primary)]"
                title="Última página"
              >
                <ChevronsRight size={12} />
              </button>
            </div>
          )}
        </div>

      </div>

    </div>
  );
}
