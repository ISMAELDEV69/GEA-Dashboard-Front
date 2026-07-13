import { useEffect, useId, useMemo, useState } from 'react';
import { AlertCircle, CalendarDays, ClipboardList, ClockAlert, Download, Loader2, Monitor, Search, UserCheck, Users, UserX, CalendarX } from 'lucide-react';
import { fetchDashboardData } from '../lib/dataService';
import * as XLSX from 'xlsx';

const STATUS_META = {
  A: { label: 'Asistió', bg: 'rgba(16, 185, 129, 0.2)', text: '#34d399' },
  B: { label: 'Baja', bg: 'rgba(159, 18, 57, 0.3)', text: '#fb7185' },
  FI: { label: 'Falta Injustificada', bg: 'rgba(225, 29, 72, 0.2)', text: '#f43f5e' },
  FJ: { label: 'Falta Justificada', bg: 'rgba(245, 158, 11, 0.2)', text: '#fbbf24' },
  'I-OP': { label: 'Ingreso Operación', bg: 'rgba(14, 165, 233, 0.2)', text: '#38bdf8' },
  S: { label: 'Suspensión', bg: 'rgba(107, 114, 128, 0.2)', text: '#9ca3af' },
  SUS: { label: 'Suspensión', bg: 'rgba(107, 114, 128, 0.2)', text: '#9ca3af' },
};

import PageLayout from './ui/PageLayout';
import PageHeader from './ui/PageHeader';
import Card, { CardHeader } from './ui/Card';

function normalizeText(value, fallback = '') {
  if (value === null || value === undefined) return fallback;
  return String(value).trim();
}

function normalizeGpe(value) {
  const text = normalizeText(value, 'Sin GPE');
  if (text.startsWith('PROY-')) return 'EN PROYECCIÓN';
  return text.replace(/_\d+$/, '');
}

function normalizeEstado(value) {
  const text = normalizeText(value, '').toUpperCase();
  if (text.includes('ACTIVO')) return 'ACTIVO';
  if (text.includes('CESADO') || text.includes('BAJA')) return 'CESADO';
  return text || 'SIN ESTADO';
}

function normalizeSigla(value) {
  const sigla = normalizeText(value, '').toUpperCase();
  return ['A', 'B', 'FI', 'FJ', 'I-OP', 'S', 'SUS'].includes(sigla) ? sigla : '';
}

function parseLocalDate(value) {
  if (!value) return null;
  const [day, month, year] = String(value).split('/').map(Number);
  if (!day || !month || !year) return null;
  return new Date(year, month - 1, day);
}

function sortOptions(values) {
  const list = [...values].filter(Boolean).sort((a, b) => String(a).localeCompare(String(b), 'es'));
  return ['Todas', ...list];
}

/* ── FIX 2: opacity subida a 0.30, stroke más grueso, sin opacity extra en polyline ── */
function Sparkline({ values = [], color = '#0E8F63' }) {
  const id = useId();
  const data = values.length > 1 ? values : [0, 1];
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const points = data.map((value, index) => {
    const x = (index / (data.length - 1)) * 100;
    const y = 28 - ((value - min) / range) * 22;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });
  const gradientId = `sparkline-gradient-${id}`;

  return (
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="h-6 w-full overflow-visible" style={{ color }}>
      <defs>
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0.7" />
        </linearGradient>
      </defs>
      <polyline points={points.join(' ')} fill="none" stroke={`url(#${gradientId})`} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ── FIX 3: min-h en label
    FIX 4: featured con borde + fondo + ring
    FIX 6: número featured más grande
    FIX 7: hover con translateY en vez de scale ── */
function MetricCard({ icon: Icon, label, value, color, trend = [], featured = false, subcopy = '' }) {
  const [displayValue, setDisplayValue] = useState(0);
  const accent = color === '#0E8F63' ? 'var(--accent)' : color === '#C5344B' ? '#F43F5E' : '#38BDF8';
  const iconBg = 'var(--bg-elevated)';
  const iconColor = accent;

  useEffect(() => {
    const target = Number(value) || 0;
    const duration = 1200;
    const start = performance.now();

    function animate(now) {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayValue(Math.round(target * eased));
      if (progress < 1) requestAnimationFrame(animate);
    }

    requestAnimationFrame(animate);
  }, [value]);

  return (
    <Card className={`group relative w-full flex flex-col items-start justify-between p-4 transition-all duration-300 ease-in-out hover:-translate-y-1 hover:shadow-lg cursor-pointer overflow-hidden ${featured ? 'border-[var(--accent)] ring-1 ring-[var(--accent-glow)]' : ''}`}>
      <div className="pointer-events-none absolute inset-x-4 top-2 opacity-[0.25]">
        <Sparkline values={trend} color={accent} />
      </div>
      <div className="relative flex flex-col justify-between h-full gap-1.5">
        <div className="flex items-center gap-2">
          <div className={`flex shrink-0 items-center justify-center rounded-lg ${iconBg} h-7 w-7`} style={{ color: iconColor }}>
            <Icon size={14} strokeWidth={2.2} />
          </div>
          <div className="min-w-0 flex-1">
            <div className={`font-black text-white leading-none ${featured ? 'text-2xl' : 'text-xl'}`} style={{ fontFamily: 'Space Grotesk, Inter, sans-serif' }}>
              {displayValue}
            </div>
            <div className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-bold leading-tight mt-0.5 truncate">
              {label}
            </div>
          </div>
        </div>
        {subcopy && <div className="text-[10px] text-[var(--text-muted)] mt-1 truncate">{subcopy}</div>}
      </div>
    </Card>
  );
}

function Gauge({ value = 0, label, color = '#0E8F63', semanticLabel, tooltipData = [] }) {
  const radius = 75;
  const circumference = Math.PI * radius;
  const clamped = Math.max(0, Math.min(Number(value) || 0, 100));
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setMounted(true));
  }, []);

  return (
    <Card className="group relative w-full flex flex-col items-center justify-center p-2 text-center transition-all duration-300 ease-in-out hover:-translate-y-1 hover:shadow-lg cursor-pointer">
      <svg viewBox="0 0 170 95" className="mx-auto mb-1 h-[45px] w-full max-w-[100px] overflow-visible">
        <path d="M14,84 A75,75 0 0 1 156,84" fill="none" stroke="#1F2937" strokeWidth="8" strokeLinecap="round" />
        <path
          d="M14,84 A75,75 0 0 1 156,84"
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={mounted ? circumference * (1 - clamped / 100) : circumference}
          style={{ transition: 'stroke-dashoffset 1.1s cubic-bezier(0.22,0.9,0.3,1)', filter: `drop-shadow(0 0 18px ${color})` }}
        />
      </svg>
      <div className="text-xl sm:text-2xl font-black text-white" style={{ fontFamily: 'Space Grotesk, Inter, sans-serif' }}>{clamped.toFixed(0)}%</div>
      <div className="mt-0.5 text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">{label}</div>
      {semanticLabel && (
        <div className="mt-2 flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider" style={{ backgroundColor: `var(--bg-elevated)`, color }}>
          <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
          {semanticLabel}
        </div>
      )}

      {tooltipData.length > 0 && (
        <div className="pointer-events-none absolute bottom-[90%] left-1/2 z-50 flex w-max -translate-x-1/2 flex-col gap-1.5 rounded-xl bg-[var(--bg-surface)] px-5 py-3 opacity-0 shadow-2xl backdrop-blur transition-all duration-200 group-hover:-translate-y-2 group-hover:opacity-100 border border-[var(--border-subtle)] text-left">
          <div className="absolute -bottom-1.5 left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 border-b border-r border-[var(--border-subtle)] bg-[var(--bg-surface)]"></div>
          {tooltipData.map((line, i) => (
            <div key={i} className="text-[10px] font-bold tracking-wider text-[var(--text-primary)]">{line}</div>
          ))}
        </div>
      )}
    </Card>
  );
}

export default function ConsolidadoPowerBI() {
  const [data, setData] = useState([]);
  const [capacidades, setCapacidades] = useState([]);
  const [descuentos, setDescuentos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({ periodo: 'Todas', segmento: 'Todas', campana: 'Todas', gpe: 'Todas', condicion: 'Todas', tipo: 'Todas', estado: 'Todas' });

  useEffect(() => {
    let active = true;

    async function loadData() {
      try {
        setLoading(true);
        const res = await fetchDashboardData();
        if (active) {
          setData(Array.isArray(res.consolidado) ? res.consolidado : []);
          setCapacidades(res.capacidades || []);
          setDescuentos(res.descuentos || []);
        }
      } catch (error) {
        console.error('Error cargando datos:', error);
        if (active) setData([]);
      } finally {
        if (active) setLoading(false);
      }
    }

    loadData();
    return () => {
      active = false;
    };
  }, []);

  const validData = useMemo(() => {
    return data.map(row => {
      const txtEstado = String(row.estado || '').toUpperCase();
      const txtMotivo = String(row.motivo_baja || '').toUpperCase();
      const txtObs = String(row.observacion_estado || '').toUpperCase();
      
      const isBajaDia1 = txtMotivo.includes('BAJA DIA 1') || txtEstado.includes('BAJA DIA 1') || txtObs.includes('BAJA DIA 1');
      
      return {
        ...row,
        isBajaDia1,
        isDescuento: false
      };
    });
  }, [data]);

  const aggregatedPeople = useMemo(() => {
    const map = new Map();
    validData.forEach((row) => {
      const documento = normalizeText(row.documento);
      if (!documento) return;

      const nombre = [row.apellido_paterno, row.apellido_materno, row.nombres]
        .map((segment) => normalizeText(segment))
        .filter(Boolean)
        .join(' ');
      const gpe = normalizeGpe(row.codigo_grupo);
      const rawGpe = row.codigo_grupo;
      const condicion = normalizeText(row.condicion_laboral, 'Sin condición');
      const tipo = normalizeText(row.tipo_reclutado, 'Sin tipo');
      const estado = normalizeEstado(row.estado);
      const fecha = normalizeText(row.fecha_registro_asistencia);
      const sigla = normalizeSigla(row.sigla);

      if (!map.has(documento)) {
        map.set(documento, {
          documento,
          nombre_completo: nombre || 'Sin nombre',
          ult_estado: estado,
          campana: row.campana,
          gpe,
          raw_gpe: rawGpe,
          condicion_laboral: condicion,
          tipo_reclutado: tipo,
          fechas: {},
          estados_por_fecha: {},
          isBajaDia1: false,
          isDescuento: false
        });
      }

      const obj = map.get(documento);
      obj.ult_estado = estado; 
      obj.condicion_laboral = condicion;
      obj.tipo_reclutado = tipo;
      obj.campana = row.campana;
      obj.gpe = gpe;
      obj.raw_gpe = rawGpe;
      if (row.isBajaDia1) obj.isBajaDia1 = true;
      if (row.isDescuento) obj.isDescuento = true;

      if (fecha && sigla) {
        obj.fechas[fecha] = sigla;
        obj.estados_por_fecha[fecha] = estado;
      }
    });

    return [...map.values()].map(person => {
      const cap = capacidades.find(c => c.codigo === person.raw_gpe && c.campana === person.campana);
      let f_ojt = cap?.fecha_inicio_ojt || '---';
      if (f_ojt !== '---' && f_ojt.includes('-')) {
         const [y, m, d] = f_ojt.split('T')[0].split('-');
         if (y && m && d) f_ojt = `${d}/${m}/${y}`;
      }
      return {
        ...person,
        fecha_inicio_ojt: f_ojt,
        periodo: normalizeText(cap?.periodo || ''),
        segmento: normalizeText(cap?.segmento || '')
      };
    });
  }, [validData, capacidades]);

  const filterOptions = useMemo(() => {
    const periodoSet = new Set();
    const segmentoSet = new Set();
    const campanaSet = new Set();
    const gpeSet = new Set();
    const condicionSet = new Set();
    const tipoSet = new Set();

    aggregatedPeople.forEach((person) => {
      if (person.isBajaDia1 || person.isDescuento) return;

      const rowPeriodo = person.periodo;
      const rowSegmento = person.segmento;
      const rowCampana = normalizeText(person.campana);
      const rowGpe = person.gpe;
      const rowCondicion = person.condicion_laboral;
      const rowTipo = person.tipo_reclutado;
      const rowEstado = person.ult_estado;

      const matchPeriodo = filters.periodo === 'Todas' || rowPeriodo === filters.periodo;
      const matchSegmento = filters.segmento === 'Todas' || rowSegmento === filters.segmento;
      const matchCampana = filters.campana === 'Todas' || rowCampana === filters.campana;
      const matchGpe = filters.gpe === 'Todas' || rowGpe === filters.gpe;
      const matchCondicion = filters.condicion === 'Todas' || rowCondicion === filters.condicion;
      const matchTipo = filters.tipo === 'Todas' || rowTipo === filters.tipo;
      const matchEstado = filters.estado === 'Todas' || rowEstado === filters.estado;

      if (matchSegmento && matchCampana && matchGpe && matchCondicion && matchTipo && matchEstado) {
        if (rowPeriodo) periodoSet.add(rowPeriodo);
      }
      if (matchPeriodo && matchCampana && matchGpe && matchCondicion && matchTipo && matchEstado) {
        if (rowSegmento) segmentoSet.add(rowSegmento);
      }
      if (matchPeriodo && matchSegmento && matchGpe && matchCondicion && matchTipo && matchEstado) {
        if (rowCampana) campanaSet.add(rowCampana);
      }
      if (matchPeriodo && matchSegmento && matchCampana && matchCondicion && matchTipo && matchEstado) {
        if (rowGpe) gpeSet.add(rowGpe);
      }
      if (matchPeriodo && matchSegmento && matchCampana && matchGpe && matchTipo && matchEstado) {
        if (rowCondicion) condicionSet.add(rowCondicion);
      }
      if (matchPeriodo && matchSegmento && matchCampana && matchGpe && matchCondicion && matchEstado) {
        if (rowTipo) tipoSet.add(rowTipo);
      }
    });

    return {
      periodo: sortOptions(periodoSet),
      segmento: sortOptions(segmentoSet),
      campana: sortOptions(campanaSet),
      gpe: sortOptions(gpeSet),
      condicion: sortOptions(condicionSet),
      tipo: sortOptions(tipoSet),
      estado: ['Todas', 'ACTIVO', 'CESADO'],
    };
  }, [aggregatedPeople, filters]);

  const { pivotRows, uniqueDates, updatedDate, kpis } = useMemo(() => {
    const query = search.trim().toLowerCase();

    const filteredRows = aggregatedPeople.filter(person => {
      if (person.isDescuento) return false;

      if (query && !person.documento.toLowerCase().includes(query) && !person.nombre_completo.toLowerCase().includes(query)) return false;

      if (filters.periodo !== 'Todas' && person.periodo !== filters.periodo) return false;
      if (filters.segmento !== 'Todas' && person.segmento !== filters.segmento) return false;
      if (filters.campana !== 'Todas' && normalizeText(person.campana) !== filters.campana) return false;
      if (filters.gpe !== 'Todas' && person.gpe !== filters.gpe) return false;
      if (filters.condicion !== 'Todas' && person.condicion_laboral !== filters.condicion) return false;
      if (filters.tipo !== 'Todas' && person.tipo_reclutado !== filters.tipo) return false;
      if (filters.estado !== 'Todas' && person.ult_estado !== filters.estado) return false;

      return true;
    });

    const dates = [...new Set(filteredRows.filter(p => !p.isBajaDia1).flatMap((item) => Object.keys(item.fechas)))]
      .sort((a, b) => {
        const da = parseLocalDate(a);
        const db = parseLocalDate(b);
        if (da && db) return da - db;
        return String(a).localeCompare(String(b), 'es');
      });

    let sumDesertores = 0;
    let sumCantAusencia = 0;
    let sumMetaDia1 = 0;
    let sumRqSolicitado = 0;
    let sumCantAsistencias = 0;

    const uniqueGroups = new Set();
    filteredRows.forEach(row => {
      if (row.raw_gpe) uniqueGroups.add(`${row.raw_gpe}|${row.campana}`);
    });

    uniqueGroups.forEach(key => {
      const [gCode, cName] = key.split('|');
      const cap = capacidades.find(c => c.codigo === gCode && c.campana === cName);
      if (cap) {
        sumMetaDia1 += Number(cap.meta_dia_1) || 0;
        sumRqSolicitado += Number(cap.rq_solicitado) || 0;
      }
    });

    filteredRows.forEach(row => {
      if (row.isBajaDia1) return;

      if (row.ult_estado === 'CESADO') {
        sumDesertores++;
      }

      let hasAusencia = false;
      Object.values(row.fechas).forEach(sigla => {
        if (['FI', 'FJ', 'S', 'SUS'].includes(sigla)) {
          hasAusencia = true;
        }
        if (['A', 'I-OP'].includes(sigla)) {
          sumCantAsistencias++;
        }
      });
      if (hasAusencia) sumCantAusencia++;
    });

    return {
      pivotRows: filteredRows.filter(p => !p.isBajaDia1),
      uniqueDates: dates,
      updatedDate: dates.length ? dates[dates.length - 1] : new Date().toLocaleDateString('es-PE'),
      kpis: { 
        activos: filteredRows.filter(p => p.ult_estado === 'ACTIVO' && !p.isBajaDia1).length, 
        qDia1: filteredRows.filter(p => !p.isBajaDia1).length, 
        desertores: sumDesertores, 
        cantAusencia: sumCantAusencia, 
        cantProg: filteredRows.length,
        cantAsistencia: sumCantAsistencias,
        sumMetaDia1,
        sumRqSolicitado
      }
    };
  }, [aggregatedPeople, filters, search, capacidades]);

  const percentages = useMemo(() => {
    const denomCumplimiento = Math.max(kpis.sumMetaDia1, 1);
    const denomDotacion = Math.max(kpis.sumRqSolicitado, 1);
    const denomDesercion = Math.max(kpis.qDia1, 1);
    const denomAbsentismo = Math.max(kpis.cantAusencia + kpis.cantAsistencia, 1);

    return {
      cumpDia1: (kpis.qDia1 / denomCumplimiento) * 100,
      desercion: (kpis.desertores / denomDesercion) * 100,
      dotacion: (kpis.activos / denomDotacion) * 100,
      absentismo: (kpis.cantAusencia / denomAbsentismo) * 100,
    };
  }, [kpis]);

  const trends = useMemo(
    () => ({
      activos: [Math.max(kpis.activos - 3, 0), Math.max(kpis.activos - 1, 0), kpis.activos],
      qDia1: [Math.max(kpis.qDia1 - 2, 0), Math.max(kpis.qDia1 - 1, 0), kpis.qDia1],
      desertores: [Math.max(kpis.desertores - 2, 0), Math.max(kpis.desertores - 1, 0), kpis.desertores],
      ausencia: [Math.max(kpis.cantAusencia - 2, 0), Math.max(kpis.cantAusencia - 1, 0), kpis.cantAusencia],
      prog: [Math.max(kpis.cantProg - 5, 0), Math.max(kpis.cantProg - 2, 0), kpis.cantProg],
    }),
    [kpis],
  );

  const handleFilterChange = (key, value) => {
    setFilters((current) => ({ ...current, [key]: value }));
  };

  const handleExport = () => {
    if (!pivotRows.length) return;

    const payload = pivotRows.map((row) => {
      const item = {
        DOCUMENTO: row.documento,
        'NOMBRE COMPLETO': row.nombre_completo,
        'ULT. ESTADO': row.ult_estado,
        GPE: row.gpe,
        'CONDICIÓN LABORAL': row.condicion_laboral,
        'TIPO RECLUTADO': row.tipo_reclutado,
      };
      uniqueDates.forEach((date) => {
        item[date] = row.fechas[date] || '';
      });
      return item;
    });

    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.json_to_sheet(payload);
    XLSX.utils.book_append_sheet(workbook, sheet, 'Control de Asistencia');
    XLSX.writeFile(workbook, `Control_Asistencia_${Date.now()}.xlsx`);
  };

  if (loading) {
    return (
      <PageLayout className="items-center justify-center p-6">
        <Card className="flex flex-col items-center justify-center gap-4 px-10 py-12">
          <Loader2 size={40} className="animate-spin text-[var(--accent)]" />
          <p className="text-sm font-medium text-[var(--text-muted)] animate-pulse">Analizando consolidado de BI...</p>
        </Card>
      </PageLayout>
    );
  }

  const FIXED_COLS = [
    { id: 'documento', label: 'DOCUMENTO', width: 85, left: 0 },
    { id: 'nombre', label: 'NOMBRE COMPLETO', width: 260, left: 85 },
    { id: 'estado', label: 'ULT. ESTADO', width: 90, left: 345 },
    { id: 'fecha', label: 'FECHA INICIO OJT', width: 115, left: 435 },
    { id: 'gpe', label: 'GPE', width: 120, left: 550 },
    { id: 'condicion', label: 'CONDICIÓN LABORAL', width: 130, left: 670 },
    { id: 'tipo', label: 'TIPO RECLUTADO', width: 120, left: 800 },
  ];

  return (
    <PageLayout className="p-4 md:p-6 space-y-6 overflow-y-auto">
      <PageHeader 
        title="Control de Asistencia" 
        subtitle="GEA Perú · RR.HH."
        actions={
          <div className="flex flex-wrap w-full xl:w-auto gap-2">
            {[
                { key: 'periodo', label: 'Período', options: filterOptions.periodo },
                { key: 'segmento', label: 'Segmento', options: filterOptions.segmento },
                { key: 'campana', label: 'Campaña', options: filterOptions.campana },
                { key: 'gpe', label: 'GPE', options: filterOptions.gpe },
                { key: 'estado', label: 'Estado', options: filterOptions.estado },
              ].map(({ key, label, options }) => (
                <div key={key} className="min-w-0">
                  <label className="block text-[9px] uppercase tracking-[0.1em] text-[var(--text-muted)] font-semibold mb-1 truncate">{label}</label>
                  <select
                    value={filters[key]}
                    onChange={(event) => handleFilterChange(key, event.target.value)}
                    className="w-full appearance-none rounded-lg border border-[var(--input-border)] bg-[var(--input-bg)] px-2 py-1.5 pr-6 text-xs font-medium text-[var(--text-primary)] outline-none transition focus:border-[var(--accent)] truncate"
                  >
                    {options.map((option) => (
                      <option key={option} value={option} className="bg-[var(--bg-surface)] text-[var(--text-primary)]">
                        {option}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
          </div>
        }
      />

      <Card noPadding className="relative overflow-hidden shadow-sm flex flex-col gap-2">
        <div className="relative z-10 flex items-center justify-between gap-3 border-b border-[var(--border-subtle)] pb-1.5 px-4 pt-4 shrink-0">
          <span className="text-[10px] uppercase tracking-[0.1em] text-[var(--text-muted)] font-bold">Panorama General</span>
          <span className="flex items-center gap-1.5 text-[9px] uppercase tracking-[0.05em] text-[var(--text-muted)] font-semibold">
            <span className="h-2 w-2 rounded-full bg-[var(--accent)] animate-pulse" />
            Al <strong className="text-[var(--text-primary)]">{updatedDate}</strong>
          </span>
        </div>

        <div className="relative z-10 grid grid-cols-5 gap-2 px-4">
            <MetricCard featured icon={Users} label="Cantidad de Activos" value={kpis.activos} color="#0E8F63" trend={trends.activos} subcopy={`de ${kpis.cantProg} programados`} />
            <MetricCard icon={Monitor} label="Q Día 1" value={kpis.qDia1} color="#0E8F63" trend={trends.qDia1} />
            <MetricCard icon={CalendarX} label="Desertores" value={kpis.desertores} color="#C5344B" trend={trends.desertores} />
            <MetricCard icon={ClockAlert} label="Cant. Ausencia" value={kpis.cantAusencia} color="#C5344B" trend={trends.ausencia} />
            <MetricCard icon={ClipboardList} label="Cant. Prog." value={kpis.cantProg} color="#38BDF8" trend={trends.prog} />
        </div>

        <div className="relative z-10 grid grid-cols-4 gap-2 px-4 pb-4">
          <Gauge value={percentages.cumpDia1} label="% Cump. Día 1" color="#F59E0B" semanticLabel="Atención" tooltipData={[`META DÍA 1 = ${kpis.sumMetaDia1}`, `Q DÍA 1 = ${kpis.qDia1}`, `% CUMPLIMIENTO = ${percentages.cumpDia1.toFixed(0)}%`]} />
          <Gauge value={percentages.desercion} label="% Deserción" color="#EF4444" semanticLabel="Crítico" tooltipData={[`Q DÍA 1 = ${kpis.qDia1}`, `DESERTORES = ${kpis.desertores}`, `% DESERCIÓN = ${percentages.desercion.toFixed(0)}%`]} />
          <Gauge value={percentages.dotacion} label="% Dotación" color="#10B981" semanticLabel="Dentro de meta" tooltipData={[`RQ SOLICITADO = ${kpis.sumRqSolicitado}`, `ACTIVOS = ${kpis.activos}`, `% DOTACIÓN = ${percentages.dotacion.toFixed(0)}%`]} />
          <Gauge value={percentages.absentismo} label="% Absentismo" color="#EF4444" semanticLabel="Crítico" tooltipData={[`TOTAL ASISTENCIAS = ${kpis.cantAsistencia}`, `TOTAL FALTAS = ${kpis.cantAusencia}`, `% ABSENTISMO = ${percentages.absentismo.toFixed(0)}%`]} />
        </div>
      </Card>

      <Card noPadding className="flex-1 min-h-[400px] flex flex-col shadow-sm">
        <div className="shrink-0 flex items-center justify-between gap-4 px-4 py-3 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] rounded-t-xl">
            <div className="flex-1 max-w-[400px]">
              <label className="relative block w-full">
                <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Buscar por documento o nombre..."
                  className="w-full rounded-lg border border-[var(--input-border)] bg-[var(--input-bg)] py-2 pl-9 pr-3 text-xs outline-none transition focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent-glow)] text-[var(--text-primary)]"
                />
              </label>
            </div>

            <button
              type="button"
              onClick={handleExport}
              disabled={!pivotRows.length}
              className="btn-primary inline-flex items-center justify-center gap-1.5 text-xs py-2"
            >
              <Download size={14} />
              Excel
            </button>
        </div>

        <div className="flex-1 overflow-x-auto overflow-y-auto custom-scrollbar relative">
          <table className="w-full min-w-[1300px] border-separate border-spacing-0 text-left text-[11px]">
            <thead>
              <tr>
                {FIXED_COLS.map((col) => (
                  <th 
                    key={col.id} 
                    className="sticky top-0 z-30 bg-[var(--table-head-bg)] border-b border-[var(--border-subtle)] px-3 py-2.5 text-left text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--text-muted)]"
                    style={{ left: col.left, minWidth: col.width, maxWidth: col.width }}
                  >
                    {col.label}
                  </th>
                ))}
                {uniqueDates.map((date) => (
                  <th key={date} className="sticky top-0 z-10 bg-[var(--table-head-bg)] border-b border-[var(--border-subtle)] px-3 py-2.5 text-center text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--accent)]">
                    {date}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pivotRows.map((row) => (
                <tr key={row.documento} className="group transition-colors bg-[var(--bg-surface)] hover:bg-[var(--bg-elevated)] table-row">
                  <td className="sticky z-20 bg-inherit px-3 py-1.5 font-semibold text-[var(--text-primary)] whitespace-nowrap truncate border-b border-[var(--border-subtle)]" style={{ left: FIXED_COLS[0].left, minWidth: FIXED_COLS[0].width, maxWidth: FIXED_COLS[0].width }}>
                    {row.documento}
                  </td>
                  <td className="sticky z-20 bg-inherit px-3 py-1.5 text-[var(--text-primary)] whitespace-nowrap truncate border-b border-[var(--border-subtle)]" style={{ left: FIXED_COLS[1].left, minWidth: FIXED_COLS[1].width, maxWidth: FIXED_COLS[1].width }}>
                    {row.nombre_completo}
                  </td>
                  <td className="sticky z-20 bg-inherit px-3 py-1.5 border-b border-[var(--border-subtle)]" style={{ left: FIXED_COLS[2].left, minWidth: FIXED_COLS[2].width, maxWidth: FIXED_COLS[2].width }}>
                    <span className="inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] truncate max-w-full" style={{ backgroundColor: 'var(--bg-elevated)', color: row.ult_estado === 'ACTIVO' ? 'var(--accent)' : '#F43F5E' }}>
                      {row.ult_estado}
                    </span>
                  </td>
                  <td className="sticky z-20 bg-inherit px-3 py-1.5 font-medium text-[var(--text-secondary)] whitespace-nowrap truncate border-b border-[var(--border-subtle)]" style={{ left: FIXED_COLS[3].left, minWidth: FIXED_COLS[3].width, maxWidth: FIXED_COLS[3].width }}>
                    {row.fecha_inicio_ojt}
                  </td>
                  <td className="sticky z-20 bg-inherit px-3 py-1.5 text-[var(--text-primary)] whitespace-nowrap truncate border-b border-[var(--border-subtle)]" style={{ left: FIXED_COLS[4].left, minWidth: FIXED_COLS[4].width, maxWidth: FIXED_COLS[4].width }}>
                    {row.gpe}
                  </td>
                  <td className="sticky z-20 bg-inherit px-3 py-1.5 text-[var(--text-primary)] whitespace-nowrap truncate border-b border-[var(--border-subtle)]" style={{ left: FIXED_COLS[5].left, minWidth: FIXED_COLS[5].width, maxWidth: FIXED_COLS[5].width }}>
                    {row.condicion_laboral}
                  </td>
                  <td className="sticky z-20 bg-inherit px-3 py-1.5 text-[var(--text-primary)] whitespace-nowrap truncate border-r border-b border-[var(--border-subtle)]" style={{ left: FIXED_COLS[6].left, minWidth: FIXED_COLS[6].width, maxWidth: FIXED_COLS[6].width }}>
                    {row.tipo_reclutado}
                  </td>
                  {uniqueDates.map((date) => {
                    const sigla = row.fechas[date] || '';
                    const meta = STATUS_META[sigla];
                    return (
                      <td key={date} className="px-1.5 py-1.5 text-center border-b border-[var(--border-subtle)]">
                        <div
                          className="heat-cell mx-auto flex h-7 min-w-[36px] items-center justify-center rounded-[6px] px-1.5 text-[10px] font-bold uppercase tracking-[0.12em]"
                          style={{
                            backgroundColor: meta ? meta.bg : 'rgba(255,255,255,0.06)',
                            color: meta ? meta.text : '#9AA3AF',
                          }}
                        >
                          {sigla || ''}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}

              {pivotRows.length === 0 && (
                <tr>
                  <td colSpan={7 + uniqueDates.length} className="px-4 py-16 text-center text-[var(--text-muted)]">
                    <AlertCircle size={36} className="mx-auto mb-4 text-[var(--text-faint)]" />
                    <p className="font-medium text-sm">No hay registros de asistencia que coincidan con los filtros aplicados.</p>
                    <p className="mt-1 text-xs opacity-75">Intente limpiar los filtros o seleccionar otra campaña.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </PageLayout>
  );
}
