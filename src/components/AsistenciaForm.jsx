import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { 
  AlertTriangle, 
  Save, 
  Filter, 
  Calendar as CalendarIcon, 
  Download, 
  Copy, 
  CheckCheck, 
  Loader2, 
  Users, 
  UserCheck, 
  UserX, 
  ClockAlert,
  ChevronLeft,
  ChevronRight,
  CheckCircle,
  Search,
  X,
  Layers,
  Radio,
  Building2,
  CalendarRange,
  Laptop
} from 'lucide-react'
import * as XLSX from 'xlsx'
import { insertConsolidado, fetchGruposDia1, DB_MODE } from '../lib/dataService'
import { supabase } from '../lib/supabase'
import PageLayout from './ui/PageLayout'
import PageHeader from './ui/PageHeader'
import { useToast } from '../context/ToastContext'

const SIGLAS = [
  { value: 'A', label: 'A - Asistencia', bgVar: 'var(--status-a-bg)', textVar: 'var(--status-a-text)' },
  { value: 'I-OP', label: 'I-OP - Ingreso Operación', bgVar: 'var(--status-iop-bg)', textVar: 'var(--status-iop-text)' },
  { value: 'FI', label: 'FI - Falta Injustificada', bgVar: 'var(--status-fi-bg)', textVar: 'var(--status-fi-text)' },
  { value: 'FJ', label: 'FJ - Falta Justificada', bgVar: 'var(--status-fj-bg)', textVar: 'var(--status-fj-text)' },
  { value: 'B', label: 'B - Baja', bgVar: 'var(--status-b-bg)', textVar: 'var(--status-b-text)' }
]

const normalize = (s) => (s || '').toString().trim().toUpperCase()

const getSemanaLabel = (g) => {
  if (!g) return ''
  const val = g.semana_label || g.semana_trabajo || g.semana || ''
  if (!val) return ''
  const s = String(val).trim().toUpperCase()
  if (s.startsWith('SEM')) return s
  const num = parseInt(s.replace(/\D/g, ''), 10)
  return !isNaN(num) ? `SEM ${num}` : s
}

function formatSpreadsheetDate(dateStr) {
  if (!dateStr) return ''
  const [year, month, day] = dateStr.split('-')
  return `${parseInt(day)}/${parseInt(month)}/${year}`
}

// Memoized Row Component to optimize mobile & large tables rendering performance
const AttendanceRow = React.memo(function AttendanceRow({
  item,
  fecha,
  onStatusChange,
  onMotiveChange,
  motivosBaja
}) {
  const isBaja = item.sigla === 'B'
  const estadoLabel = isBaja ? 'CESADO' : 'ACTIVO'
  const siglaOpt = SIGLAS.find(s => s.value === item.sigla)

  return (
    <tr className="hover:bg-[var(--bg-elevated)] transition-colors group">
      <td className="px-3 py-2 font-mono text-[var(--text-primary)] font-bold text-xs whitespace-nowrap">{item.documento}</td>
      <td className="px-3 py-2 uppercase text-[var(--text-secondary)] font-semibold text-xs whitespace-nowrap">{item.apellido_paterno}</td>
      <td className="px-3 py-2 uppercase text-[var(--text-secondary)] font-semibold text-xs whitespace-nowrap">{item.apellido_materno}</td>
      <td className="px-3 py-2 uppercase text-[var(--text-primary)] font-bold text-xs whitespace-nowrap">{item.nombres}</td>
      <td className="px-3 py-2 text-[var(--text-secondary)] font-mono text-xs whitespace-nowrap">{item.celular}</td>
      <td className="px-3 py-2 text-center text-[var(--text-secondary)] font-mono text-xs whitespace-nowrap">{formatSpreadsheetDate(fecha)}</td>
      <td className="px-3 py-2 text-center whitespace-nowrap">
        <span className={`inline-block px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wide ${
          item.tipoReclutado === 'AGREGADO' ? 'bg-orange-500/15 text-orange-600 dark:text-orange-400 border border-orange-500/30' :
          item.tipoReclutado === 'RECUPERADO' ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30' :
          'text-[var(--text-muted)] bg-[var(--bg-elevated)] border border-[var(--border-subtle)]'
        }`}>
          {item.tipoReclutado}
        </span>
      </td>
      <td className="px-3 py-2 text-center whitespace-nowrap">
        <span className={`inline-block px-2 py-0.5 rounded-md text-[9px] font-black border uppercase tracking-wider ${
          isBaja ? 'bg-rose-500/15 border-rose-500/30 text-rose-600 dark:text-rose-400' : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
        }`}>
          {estadoLabel}
        </span>
      </td>
      <td className="px-3 py-2 text-center whitespace-nowrap">
        {item.isLateInclusion ? (
          <span className="text-[var(--text-muted)] font-bold text-xs bg-[var(--bg-elevated)] px-2 py-0.5 rounded-md border border-[var(--border-subtle)]">N/A</span>
        ) : (
          <div className="relative inline-block w-full min-w-[65px]">
            <select
              value={item.sigla}
              onChange={(e) => onStatusChange(item.documento, e.target.value)}
              disabled={item.isLockedBaja}
              className={`w-full rounded-md py-1 px-1.5 font-black text-center text-xs outline-none shadow-xs cursor-pointer transition-all border border-[var(--border-normal)] ${
                item.isLockedBaja ? 'cursor-not-allowed opacity-70' : 'hover:scale-105 active:scale-95'
              }`}
              style={{
                backgroundColor: siglaOpt?.bgVar || 'var(--bg-elevated)',
                color: siglaOpt?.textVar || 'var(--text-primary)',
              }}
            >
              {SIGLAS.map(s => (
                <option key={s.value} value={s.value} className="bg-[var(--bg-surface)] text-[var(--text-primary)]">
                  {s.value}
                </option>
              ))}
            </select>
          </div>
        )}
      </td>
      <td className="px-3 py-2 whitespace-nowrap">
        {!item.isLateInclusion && isBaja ? (
          <div className="flex items-center gap-1.5">
            <AlertTriangle size={13} className="text-rose-500 dark:text-rose-400 flex-shrink-0" />
            <select
              value={item.motivo_baja}
              onChange={e => onMotiveChange(item.documento, e.target.value)}
              disabled={item.isLockedBaja || (item.isFirstRecordGroup && item.motivo_baja === 'BAJA DIA 1')}
              className={`w-full max-w-[200px] border border-rose-500/30 rounded-md py-1 px-2 text-xs font-semibold text-rose-600 dark:text-rose-400 bg-rose-500/10 focus:border-rose-500 outline-none ${
                item.isLockedBaja || (item.isFirstRecordGroup && item.motivo_baja === 'BAJA DIA 1') ? 'opacity-70 cursor-not-allowed' : ''
              }`}
            >
              {item.isFirstRecordGroup ? (
                <option value="BAJA DIA 1">BAJA DIA 1</option>
              ) : (
                <>
                  <option value="">-- Seleccionar Motivo --</option>
                  {motivosBaja.map(m => (
                    <option key={m.id || m.motivo} value={m.motivo} className="bg-[var(--bg-surface)] text-[var(--text-primary)]">
                      {m.motivo}
                    </option>
                  ))}
                </>
              )}
            </select>
          </div>
        ) : (
          <span className="text-[var(--text-muted)] text-xs">—</span>
        )}
      </td>
    </tr>
  )
})

export default function AsistenciaForm({
  grupos = [],
  postulantes = [],
  asistencias = [],
  formadores = [],
  motivosBaja = [],
  userProfile = null,
  userRole = 'admin',
  onSave,
}) {
  const toast = useToast()
  const [selectedPeriodo, setSelectedPeriodo] = useState(() => localStorage.getItem('wfm_asis_periodo') || '')
  const [selectedSemana, setSelectedSemana] = useState(() => localStorage.getItem('wfm_asis_semana') || '')
  const [selectedSegmento, setSelectedSegmento] = useState(() => localStorage.getItem('wfm_asis_segmento') || '')
  const [selectedCampana, setSelectedCampana] = useState(() => localStorage.getItem('wfm_asis_campana') || '')
  const [selectedModalidad, setSelectedModalidad] = useState(() => localStorage.getItem('wfm_asis_modalidad') || '')
  const [selectedGrupo, setSelectedGrupo] = useState(() => localStorage.getItem('wfm_asis_grupo') || '')
  const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0])
  const [searchTerm, setSearchTerm] = useState('')
  
  const [attendanceList, setAttendanceList] = useState([])
  const [missingDataCandidates, setMissingDataCandidates] = useState([])
  const [filterActivos, setFilterActivos] = useState(false)
  const [saving, setSaving] = useState(false)
  const [copyFeedback, setCopyFeedback] = useState(false)
  const [showCalendarModal, setShowCalendarModal] = useState(false)
  const [calendarMonthIndex, setCalendarMonthIndex] = useState(-1)
  
  const [dia1Calibrado, setDia1Calibrado] = useState(false)

  // Persist filter selections
  useEffect(() => {
    if (selectedPeriodo) localStorage.setItem('wfm_asis_periodo', selectedPeriodo)
    if (selectedSemana) localStorage.setItem('wfm_asis_semana', selectedSemana)
    if (selectedSegmento) localStorage.setItem('wfm_asis_segmento', selectedSegmento)
    if (selectedCampana) localStorage.setItem('wfm_asis_campana', selectedCampana)
    if (selectedModalidad) localStorage.setItem('wfm_asis_modalidad', selectedModalidad)
    if (selectedGrupo) localStorage.setItem('wfm_asis_grupo', selectedGrupo)
  }, [selectedPeriodo, selectedSemana, selectedSegmento, selectedCampana, selectedModalidad, selectedGrupo])

  const datePickerRef = useRef(null)
  const userEditsRef = useRef(new Map())
  const [showDatePickerPopup, setShowDatePickerPopup] = useState(false)
  const [pickerMonth, setPickerMonth] = useState(new Date().getMonth())
  const [pickerYear, setPickerYear] = useState(new Date().getFullYear())

  // Limpiar ediciones pendientes al cambiar de grupo o fecha
  useEffect(() => {
    userEditsRef.current.clear()
  }, [selectedGrupo, fecha])

  useEffect(() => {
    if (fecha) {
      const parts = fecha.split('-');
      if (parts.length === 3) {
        setPickerYear(parseInt(parts[0], 10));
        setPickerMonth(parseInt(parts[1], 10) - 1);
      }
    }
  }, [fecha]);

  useEffect(() => {
    function handleClickOutside(event) {
      if (datePickerRef.current && !datePickerRef.current.contains(event.target)) {
        setShowDatePickerPopup(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const getDaysInMonth = (year, month) => {
    const start = new Date(Date.UTC(year, month, 1));
    const startDay = start.getUTCDay();
    const totalDays = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const prevTotalDays = new Date(Date.UTC(year, month, 0)).getUTCDate();
    
    const days = [];
    for (let i = startDay - 1; i >= 0; i--) {
      const day = prevTotalDays - i;
      const prevMonth = month === 0 ? 11 : month - 1;
      const prevYear = month === 0 ? year - 1 : year;
      days.push({
        day,
        month: prevMonth,
        year: prevYear,
        isCurrentMonth: false,
        dateStr: `${prevYear}-${String(prevMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      });
    }
    
    for (let day = 1; day <= totalDays; day++) {
      days.push({
        day,
        month,
        year,
        isCurrentMonth: true,
        dateStr: `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      });
    }
    
    const remaining = 42 - days.length;
    for (let day = 1; day <= remaining; day++) {
      const nextMonth = month === 11 ? 0 : month + 1;
      const nextYear = month === 11 ? year + 1 : year;
      days.push({
        day,
        month: nextMonth,
        year: nextYear,
        isCurrentMonth: false,
        dateStr: `${nextYear}-${String(nextMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      });
    }
    return days;
  };

  const formatDisplayDate = (dateStr) => {
    if (!dateStr) return 'Seleccionar';
    const [year, month, day] = dateStr.split('-');
    const monthNames = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    const monthIndex = parseInt(month, 10) - 1;
    return `${day} ${monthNames[monthIndex] || ''} ${year}`;
  };

  // ── 1. Cascading filter collections ─────────────────────────────
  const periodos = useMemo(() => {
    return [...new Set(grupos.map(g => g.periodo ? String(g.periodo).trim() : null).filter(Boolean))].sort()
  }, [grupos])

  const semanas = useMemo(() => {
    let filtered = grupos.filter(g => g.periodo)
    if (selectedPeriodo) filtered = filtered.filter(g => String(g.periodo).trim() === String(selectedPeriodo).trim())
    const list = filtered.map(g => getSemanaLabel(g)).filter(Boolean)
    return [...new Set(list)].sort((a, b) => {
      const numA = parseInt(a.replace(/\D/g, ''), 10) || 0
      const numB = parseInt(b.replace(/\D/g, ''), 10) || 0
      return numB - numA
    })
  }, [grupos, selectedPeriodo])

  const segmentos = useMemo(() => {
    let filtered = grupos.filter(g => g.periodo)
    if (selectedPeriodo) filtered = filtered.filter(g => String(g.periodo).trim() === String(selectedPeriodo).trim())
    if (selectedSemana) filtered = filtered.filter(g => getSemanaLabel(g) === selectedSemana)
    return [...new Set(filtered.map(g => g.segmento ? String(g.segmento).trim() : null).filter(Boolean))].sort()
  }, [grupos, selectedPeriodo, selectedSemana])

  const campanas = useMemo(() => {
    let filtered = grupos.filter(g => g.periodo)
    if (selectedPeriodo) filtered = filtered.filter(g => String(g.periodo).trim() === String(selectedPeriodo).trim())
    if (selectedSemana) filtered = filtered.filter(g => getSemanaLabel(g) === selectedSemana)
    if (selectedSegmento) filtered = filtered.filter(g => String(g.segmento).trim() === String(selectedSegmento).trim())
    return [...new Set(filtered.map(g => g.campana ? String(g.campana).trim() : null).filter(Boolean))].sort()
  }, [grupos, selectedPeriodo, selectedSemana, selectedSegmento])

  const modalidades = useMemo(() => {
    let filtered = grupos.filter(g => g.periodo)
    if (selectedPeriodo) filtered = filtered.filter(g => String(g.periodo).trim() === String(selectedPeriodo).trim())
    if (selectedSemana) filtered = filtered.filter(g => getSemanaLabel(g) === selectedSemana)
    if (selectedSegmento) filtered = filtered.filter(g => String(g.segmento).trim() === String(selectedSegmento).trim())
    if (selectedCampana) filtered = filtered.filter(g => String(g.campana).trim() === String(selectedCampana).trim())
    return [...new Set(filtered.map(g => g.modalidad ? String(g.modalidad).trim().toUpperCase() : null).filter(Boolean))].sort()
  }, [grupos, selectedPeriodo, selectedSemana, selectedSegmento, selectedCampana])

  const gruposFiltrados = useMemo(() => {
    let filtered = grupos.filter(g => g.periodo)
    if (selectedPeriodo) filtered = filtered.filter(g => String(g.periodo).trim() === String(selectedPeriodo).trim())
    if (selectedSemana) filtered = filtered.filter(g => getSemanaLabel(g) === selectedSemana)
    if (selectedSegmento) filtered = filtered.filter(g => String(g.segmento).trim() === String(selectedSegmento).trim())
    if (selectedCampana) filtered = filtered.filter(g => String(g.campana).trim() === String(selectedCampana).trim())
    if (selectedModalidad) filtered = filtered.filter(g => String(g.modalidad || '').trim().toUpperCase() === String(selectedModalidad).trim().toUpperCase())
    
    const unique = [];
    const seen = new Set();
    for (const g of filtered) {
      const uniqueKey = `${g.codigo}_${g.id || ''}_${g.periodo || ''}_${getSemanaLabel(g)}`;
      if (!seen.has(uniqueKey)) {
        seen.add(uniqueKey);
        unique.push(g);
      }
    }
    return unique.sort((a,b) => String(a.codigo).localeCompare(String(b.codigo)));
  }, [grupos, selectedPeriodo, selectedSemana, selectedSegmento, selectedCampana, selectedModalidad])

  const activeGrupoObj = useMemo(() => {
    if (!selectedGrupo) return null;
    const match = gruposFiltrados.find(g => g.id === selectedGrupo || g.codigo === selectedGrupo);
    if (match) return match;
    return grupos.find(g => 
      (g.id === selectedGrupo || g.codigo === selectedGrupo) && 
      (!selectedCampana || String(g.campana).trim() === String(selectedCampana).trim()) &&
      (!selectedPeriodo || String(g.periodo).trim() === String(selectedPeriodo).trim()) &&
      (!selectedSemana || getSemanaLabel(g) === selectedSemana)
    );
  }, [grupos, gruposFiltrados, selectedGrupo, selectedCampana, selectedPeriodo, selectedSemana])

  // Clear dependent filters on parent filter change
  useEffect(() => { setSelectedSemana(''); setSelectedSegmento(''); setSelectedCampana(''); setSelectedModalidad(''); setSelectedGrupo('') }, [selectedPeriodo])
  useEffect(() => { setSelectedSegmento(''); setSelectedCampana(''); setSelectedModalidad(''); setSelectedGrupo('') }, [selectedSemana])
  useEffect(() => { setSelectedCampana(''); setSelectedModalidad(''); setSelectedGrupo('') }, [selectedSegmento])
  useEffect(() => { setSelectedModalidad(''); setSelectedGrupo('') }, [selectedCampana])
  useEffect(() => { setSelectedGrupo('') }, [selectedModalidad])

  useEffect(() => {
    if (gruposFiltrados.length === 1 && !selectedGrupo) setSelectedGrupo(gruposFiltrados[0].id || gruposFiltrados[0].codigo)
  }, [gruposFiltrados, selectedGrupo])

  useEffect(() => {
    if (!selectedGrupo) {
      setDia1Calibrado(false)
      return
    }
    fetchGruposDia1().then(configs => {
      const targetGrupo = activeGrupoObj?.codigo || selectedGrupo
      const g = configs.find(c => normalize(c.grupo_codigo) === normalize(targetGrupo))
      setDia1Calibrado(g?.estado_calibracion === 'CALIBRADO')
    }).catch(err => {
      console.error('Error fetching dia1 calibracion:', err)
      setDia1Calibrado(false)
    })
  }, [selectedGrupo, activeGrupoObj])

  const lastSetGrupo = useRef(null);

  // Auto-set Date based on Group
  useEffect(() => {
    if (!activeGrupoObj) return;

    const groupKey = `${activeGrupoObj.codigo}_${activeGrupoObj.periodo || ''}_${getSemanaLabel(activeGrupoObj)}`;
    if (lastSetGrupo.current === groupKey) return;

    const targetGrupoCodigo = activeGrupoObj.codigo;
    const targetCampana = activeGrupoObj.campana;
    const targetSemanaNum = parseInt(String(activeGrupoObj.semana_trabajo || activeGrupoObj.semana_label || '').replace(/\D/g, ''), 10);

    const groupDates = asistencias
      .filter(a => {
        const matchG = normalize(a.grupo_codigo) === normalize(targetGrupoCodigo) || normalize(a.grupo_codigo) === normalize(selectedGrupo);
        if (!matchG) return false;
        if (targetCampana && a.campana && normalize(a.campana) !== normalize(targetCampana)) return false;
        if (!isNaN(targetSemanaNum) && targetSemanaNum > 0 && a.archivo_origen) {
          const aSem = parseInt(String(a.archivo_origen).replace(/\D/g, ''), 10);
          if (!isNaN(aSem) && aSem !== targetSemanaNum) return false;
        }
        return true;
      })
      .map(a => a.fecha_asistencia)
      .sort();

    if (groupDates.length > 0) {
      setFecha(groupDates[groupDates.length - 1]);
      lastSetGrupo.current = groupKey;
    } else if (activeGrupoObj.fecha_inicio || activeGrupoObj.fecha_registro) {
      const fechaInicio = activeGrupoObj.fecha_inicio || activeGrupoObj.fecha_registro;
      setFecha(fechaInicio.split('T')[0]);
      lastSetGrupo.current = groupKey;
    } else {
      setFecha(new Date().toISOString().split('T')[0]);
      lastSetGrupo.current = groupKey;
    }
  }, [activeGrupoObj, asistencias, selectedGrupo]);

  const [groupPostulantesDirect, setGroupPostulantesDirect] = useState([]);

  useEffect(() => {
    if (!selectedGrupo) {
      setGroupPostulantesDirect([]);
      return;
    }
    const targetGrupoCodigo = String(activeGrupoObj?.codigo || selectedGrupo).trim();
    const targetCampana = String(activeGrupoObj?.campana || selectedCampana || '').trim();
    const targetPeriodo = String(activeGrupoObj?.periodo || selectedPeriodo || '').replace(/\D/g, '').trim();
    const targetSemanaRaw = activeGrupoObj?.semana_trabajo || activeGrupoObj?.semana_label || selectedSemana || '';
    const targetSemanaNum = parseInt(String(targetSemanaRaw).replace(/\D/g, ''), 10);

    if (DB_MODE === 'supabase') {
      let isMounted = true;
      (async () => {
        try {
          // Búsqueda delimitada por Grupo + Semana + Periodo para evitar cruces entre semanas
          let q1 = supabase
            .from('v_nominas_consolidado')
            .select('*')
            .or(`grupo_codigo.eq.${targetGrupoCodigo},grupo_codigo.ilike.%${targetGrupoCodigo}%`)
          if (targetPeriodo) {
            q1 = q1.or(`periodo_reclutado.eq.${targetPeriodo},periodo_reclutado.ilike.%${targetPeriodo}%`)
          }
          if (!isNaN(targetSemanaNum) && targetSemanaNum > 0) {
            q1 = q1.eq('semana_trabajo', targetSemanaNum)
          }
          if (targetCampana) {
            q1 = q1.ilike('campana', `%${targetCampana}%`)
          }

          let qNom = supabase
            .from('nominas')
            .select('*')
            .or(`grupo_codigo.eq.${targetGrupoCodigo},grupo_codigo.ilike.%${targetGrupoCodigo}%`)
          if (targetPeriodo) {
            qNom = qNom.or(`periodo_reclutado.eq.${targetPeriodo},periodo_reclutado.ilike.%${targetPeriodo}%`)
          }
          if (!isNaN(targetSemanaNum) && targetSemanaNum > 0) {
            qNom = qNom.eq('semana_trabajo', targetSemanaNum)
          }
          if (targetCampana) {
            qNom = qNom.ilike('campana', `%${targetCampana}%`)
          }

          let q2 = supabase
            .from('consolidado_asistencias')
            .select('documento, nombres, apellido_paterno, apellido_materno, celular, condicion_laboral, campana, codigo_grupo, grupo, nombre_formador, documento_formador, tipo_reclutado, estado, sigla, motivo_baja, archivo_origen')
            .or(`codigo_grupo.eq.${targetGrupoCodigo},grupo.eq.${targetGrupoCodigo},codigo_grupo.ilike.%${targetGrupoCodigo}%`)
          if (!isNaN(targetSemanaNum) && targetSemanaNum > 0) {
            q2 = q2.or(`archivo_origen.ilike.%SEM${targetSemanaNum}%,archivo_origen.ilike.%SEM ${targetSemanaNum}%,archivo_origen.is.null`)
          }
          if (targetCampana) {
            q2 = q2.ilike('campana', `%${targetCampana}%`)
          }

          const [res1, resNom, res2] = await Promise.all([
            q1,
            qNom,
            q2
          ]).catch(err => {
            console.error('Error al cargar postulantes del grupo:', err);
            return [{ data: [] }, { data: [] }, { data: [] }];
          });

          let dataQ1 = res1?.data || [];
          let dataNom = resNom?.data || [];
          let dataQ2 = res2?.data || [];

          if (!isMounted) return;

          const isRowMatchWeekAndPeriod = (row) => {
            if (!isNaN(targetSemanaNum) && targetSemanaNum > 0 && row.semana_trabajo) {
              const rSem = parseInt(String(row.semana_trabajo).replace(/\D/g, ''), 10)
              if (!isNaN(rSem) && rSem !== targetSemanaNum) return false
            }
            if (targetPeriodo && row.periodo_reclutado) {
              const rPer = String(row.periodo_reclutado).replace(/\D/g, '')
              if (rPer && !rPer.includes(targetPeriodo) && !targetPeriodo.includes(rPer)) return false
            }
            return true
          }

          const docMap = new Map();
          const filteredQ1 = dataQ1.filter(isRowMatchWeekAndPeriod);
          const filteredNom = dataNom.filter(isRowMatchWeekAndPeriod);
          const hasNominaData = (filteredNom && filteredNom.length > 0) || (filteredQ1 && filteredQ1.length > 0);

          // 1. Postulantes de v_nominas_consolidado
          filteredQ1.forEach(row => {
            if (row.documento) {
              docMap.set(row.documento, {
                ...row,
                campaign: row.campana,
                observacion: row.observacion_reclutamiento
              });
            }
          });

          // 2. Postulantes directos de tabla nominas (fuente de verdad oficial)
          filteredNom.forEach(row => {
            if (row.documento) {
              docMap.set(row.documento, {
                ...row,
                campaign: row.campana,
                observacion: row.observacion_reclutamiento
              });
            }
          });

          // 3. Postulantes de consolidado_asistencias (SOLO como fallback para grupos legacy sin nómina digital)
          if (!hasNominaData) {
            dataQ2.forEach(row => {
              if (row.documento && !docMap.has(row.documento)) {
                docMap.set(row.documento, {
                  documento: row.documento,
                  nombres: row.nombres || '',
                  apellido_paterno: row.apellido_paterno || '',
                  apellido_materno: row.apellido_materno || '',
                  celular: row.celular || '—',
                  telefono: row.celular || '—',
                  condicion: row.condicion_laboral || activeGrupoObj?.condicion || 'FULL TIME',
                  campana: row.campana || targetCampana || '',
                  grupo_codigo: row.codigo_grupo || row.grupo || targetGrupoCodigo,
                  semana_trabajo: targetSemanaNum || null,
                  periodo_reclutado: targetPeriodo || null,
                  dia_0: 'ASISTIO',
                  dia_1: 'ASISTIO',
                  status_dia_1: row.tipo_reclutado || 'APTO',
                  estado: row.estado || 'ACTIVO',
                  formador_documento: row.documento_formador || '',
                  formador_nombre: row.nombre_formador || ''
                });
              }
            });
          }

          setGroupPostulantesDirect(Array.from(docMap.values()));
        } catch (e) {
          console.error('Error procesando postulantes directos:', e);
        }
      })();

      return () => {
        isMounted = false;
      };
    }
  }, [selectedGrupo, selectedCampana, selectedPeriodo, selectedSemana, activeGrupoObj]);

  const effectivePostulantes = useMemo(() => {
    if (groupPostulantesDirect.length > 0) {
      const map = new Map();
      postulantes.forEach(p => map.set(p.documento, p));
      groupPostulantesDirect.forEach(p => map.set(p.documento, p));
      return Array.from(map.values());
    }
    return postulantes;
  }, [postulantes, groupPostulantesDirect]);

  useEffect(() => {
    if (!selectedGrupo) {
      setAttendanceList([])
      return
    }

    // 1. Pre-filter group asistencias in O(M) once
    const targetGroup = selectedGrupo
    const targetGrupoCodigo = activeGrupoObj?.codigo || selectedGrupo
    const targetCampana = activeGrupoObj?.campana
    const targetSemanaRaw = activeGrupoObj?.semana_trabajo || activeGrupoObj?.semana_label || selectedSemana || ''
    const targetSemanaNum = parseInt(String(targetSemanaRaw).replace(/\D/g, ''), 10)
    const targetPeriodo = String(activeGrupoObj?.periodo || selectedPeriodo || '').replace(/\D/g, '').trim()

    const groupRecordsAll = []
    const mappedDocs = new Set()
    const recordsByDocOnDate = new Map()
    const previousRecordsByDoc = new Map()

    for (let i = 0; i < asistencias.length; i++) {
      const a = asistencias[i]
      const matchGrupo = normalize(a.grupo_codigo) === normalize(targetGroup) || normalize(a.grupo_codigo) === normalize(targetGrupoCodigo)
      if (!matchGrupo) continue
      if (targetCampana && a.campana && normalize(a.campana) !== normalize(targetCampana)) continue
      if (!isNaN(targetSemanaNum) && targetSemanaNum > 0 && a.archivo_origen) {
        const aSem = parseInt(String(a.archivo_origen).replace(/\D/g, ''), 10)
        if (!isNaN(aSem) && aSem !== targetSemanaNum) continue
      }

      groupRecordsAll.push(a)
      mappedDocs.add(a.postulante_documento)

      if (a.fecha_asistencia === fecha) {
        recordsByDocOnDate.set(a.postulante_documento, a)
      } else if (a.fecha_asistencia < fecha) {
        let arr = previousRecordsByDoc.get(a.postulante_documento)
        if (!arr) {
          arr = []
          previousRecordsByDoc.set(a.postulante_documento, arr)
        }
        arr.push(a)
      }
    }

    // Sort previous records for each doc by date descending
    for (const [doc, arr] of previousRecordsByDoc.entries()) {
      if (arr.length > 1) {
        arr.sort((a, b) => (b.fecha_asistencia > a.fecha_asistencia ? 1 : -1))
      }
    }

    // Ensure all historical attendees from asistencias are present in candidate pool ONLY for legacy groups without nomina
    const hasGroupNomina = groupPostulantesDirect.length > 0;
    const candidateDocs = new Set(effectivePostulantes.map(p => p.documento));
    const mergedCandidates = [...effectivePostulantes];

    if (!hasGroupNomina) {
      for (const a of groupRecordsAll) {
        if (!candidateDocs.has(a.postulante_documento)) {
          candidateDocs.add(a.postulante_documento);
          mergedCandidates.push({
            documento: a.postulante_documento,
            nombres: a.nombres || '',
            apellido_paterno: a.apellido_paterno || '',
            apellido_materno: a.apellido_materno || '',
            celular: a.celular || '',
            telefono: a.celular || '',
            condicion: a.condicion_laboral || activeGrupoObj?.condicion || 'FULL TIME',
            campana: a.campana || targetCampana || '',
            grupo_codigo: a.grupo_codigo || targetGrupoCodigo,
            semana_trabajo: targetSemanaNum || null,
            periodo_reclutado: targetPeriodo || null,
            dia_0: 'ASISTIO',
            dia_1: 'ASISTIO',
            status_dia_1: 'APTO',
            estado: 'ACTIVO'
          });
        }
      }
    }

    const invalidList = []
    const filteredPostulantes = mergedCandidates.filter(p => {
      if (!p.documento) return false

      const isGrupoMatch = normalize(p.grupo_codigo) === normalize(targetGroup) || normalize(p.grupo_codigo) === normalize(targetGrupoCodigo)
      if (!isGrupoMatch && !hasGroupNomina && mappedDocs.has(p.documento)) {
        // Permitir histórico solo para grupos legacy sin nómina digital
      } else if (!isGrupoMatch) {
        return false
      }

      // Validar coincidencia estricta de semana
      if (!isNaN(targetSemanaNum) && targetSemanaNum > 0 && p.semana_trabajo) {
        const rowSemanaNum = parseInt(String(p.semana_trabajo).replace(/\D/g, ''), 10)
        if (!isNaN(rowSemanaNum) && rowSemanaNum !== targetSemanaNum) {
          return false
        }
      }
      
      // Validar regla de asistencia de Reclutamiento para pasar al Formador:
      // Para grupos con nómina, solo deben llegar los que Reclutamiento marcó como ASISTIO en Día 1
      // o con status_dia_1 AGREGADO / RECUPERADO
      if (hasGroupNomina) {
        const dia1Val = (p.dia_1 || '').toString().toUpperCase().trim()
        const statusDia1Val = (p.status_dia_1 || '').toString().toUpperCase().trim()
        
        const asistioD1 = dia1Val === 'ASISTIO'
        const agregadoD1 = statusDia1Val === 'AGREGADO' || statusDia1Val === 'RECUPERADO'
        
        if (!asistioD1 && !agregadoD1) {
          return false
        }
      } else {
        // Para grupos legacy sin nómina digital
        const dia0Val = (p.dia_0 || '').toString().toUpperCase().trim()
        const dia1Val = (p.dia_1 || '').toString().toUpperCase().trim()
        const statusDia1Val = (p.status_dia_1 || '').toString().toUpperCase().trim()
        
        const agregadoD1 = statusDia1Val === 'AGREGADO' || statusDia1Val === 'RECUPERADO'
        const asistioD1 = dia1Val === 'ASISTIO'
        
        const rechazadoD1 = (dia1Val === 'FALTA' || dia1Val === 'NO ASISTIO' || dia1Val === 'DESERTO' || dia1Val === 'NO') && !agregadoD1
        const rechazadoD0 = (dia0Val === 'FALTA' || dia0Val === 'NO ASISTIO' || dia0Val === 'DESERTO' || dia0Val === 'NO') && !agregadoD1 && !asistioD1
        
        if (rechazadoD1 || rechazadoD0) {
          return false
        }
      }

      return true
    })
    
    setMissingDataCandidates([])

    let firstDateOfGroup = null
    if (groupRecordsAll.length > 0) {
      firstDateOfGroup = groupRecordsAll[0].fecha_asistencia
      for (let i = 1; i < groupRecordsAll.length; i++) {
        if (groupRecordsAll[i].fecha_asistencia < firstDateOfGroup) {
          firstDateOfGroup = groupRecordsAll[i].fecha_asistencia
        }
      }
    }
    const isFirstRecordGroup = groupRecordsAll.length === 0 || fecha <= firstDateOfGroup

    const uniquePostulantes = []
    const seenDocs = new Set()
    const sortedPostulantes = [...filteredPostulantes].sort((a, b) => {
       const aMatch = (normalize(a.grupo_codigo) === normalize(targetGrupoCodigo) || normalize(a.grupo_codigo) === normalize(targetGroup)) ? 1 : 0
       const bMatch = (normalize(b.grupo_codigo) === normalize(targetGrupoCodigo) || normalize(b.grupo_codigo) === normalize(targetGroup)) ? 1 : 0
       return bMatch - aMatch
    })
    for (let i = 0; i < sortedPostulantes.length; i++) {
       const p = sortedPostulantes[i]
       if (!seenDocs.has(p.documento)) {
           seenDocs.add(p.documento)
           uniquePostulantes.push(p)
       }
    }

    // Formadores lookup map for O(1) name resolution
    const formadoresMap = new Map(formadores.map(f => [f.documento, f.nombre_completo]))

    const list = uniquePostulantes.map(p => {
      const isLateInclusion = false
      const existing = recordsByDocOnDate.get(p.documento)
      const tipoReclutado = (p.status_dia_1 || '').toString().toUpperCase().trim() || 'APTO'

      const docFormador = p.formador_documento || activeGrupoObj?.formador_documento || ''
      const nombreFormador = formadoresMap.get(docFormador) || activeGrupoObj?.formador_nombre || ''

      let inheritedSigla = 'A'
      let inheritedMotivo = ''

      if (existing) {
        inheritedSigla = existing.sigla_asistencia
        inheritedMotivo = existing.motivo_baja || ''
      } else {
        const prevList = previousRecordsByDoc.get(p.documento)
        if (prevList && prevList.length > 0) {
          inheritedSigla = prevList[0].sigla_asistencia
          inheritedMotivo = prevList[0].motivo_baja || ''
        } else if (p.estado === 'CESADO') {
          inheritedSigla = 'B'
          inheritedMotivo = 'BAJA DIA 1'
        } else if (tipoReclutado === 'AGREGADO' && isFirstRecordGroup) {
          inheritedSigla = 'FI'
        }
      }
      
      let sigla = inheritedSigla
      let motivo_baja = inheritedMotivo

      // Priorizar ediciones manuales pendientes del usuario antes de que se guarden
      if (userEditsRef.current.has(p.documento)) {
        const localEdit = userEditsRef.current.get(p.documento)
        sigla = localEdit.sigla
        motivo_baja = localEdit.motivo_baja
      } else if (isFirstRecordGroup && sigla === 'B' && !motivo_baja) {
        motivo_baja = 'BAJA DIA 1'
      }

      const isHistoricalBaja = (existing && existing.sigla_asistencia === 'B') || (!existing && inheritedSigla === 'B')
      const isLockedBaja = false

      return {
        documento: p.documento,
        apellido_paterno: p.apellido_paterno || '',
        apellido_materno: p.apellido_materno || '',
        nombres: p.nombres || '',
        celular: p.celular || '',
        condicion_laboral: p.condicion || activeGrupoObj?.condicion || '',
        campana: p.campana || activeGrupoObj?.campana || '',
        grupo: targetGrupoCodigo,
        docFormador,
        nombreFormador,
        tipoReclutado,
        sigla,
        motivo_baja,
        isLateInclusion,
        isLockedBaja,
        isFirstRecordGroup,
        isHistoricalBaja
      }
    })

    setAttendanceList(list)
  }, [selectedGrupo, fecha, asistencias, effectivePostulantes, activeGrupoObj, formadores, dia1Calibrado])

  const handleStatusChange = useCallback((doc, newSigla) => {
    setAttendanceList(prev => prev.map(item => {
      if (item.documento !== doc) return item
      let newMotivo = item.motivo_baja
      if (newSigla !== 'B') {
        newMotivo = ''
      } else if (!newMotivo && item.isFirstRecordGroup) {
        newMotivo = 'BAJA DIA 1'
      }
      userEditsRef.current.set(doc, { sigla: newSigla, motivo_baja: newMotivo })
      return { ...item, sigla: newSigla, motivo_baja: newMotivo }
    }))
  }, [])

  const handleMotiveChange = useCallback((doc, newMotivo) => {
    setAttendanceList(prev => prev.map(item => {
      if (item.documento !== doc) return item
      userEditsRef.current.set(doc, { sigla: item.sigla, motivo_baja: newMotivo })
      return { ...item, motivo_baja: newMotivo }
    }))
  }, [])

  // Fast 1-click bulk mark as attended
  const handleMarkAllAttended = () => {
    setAttendanceList(prev => prev.map(item => {
      if (item.isLateInclusion || item.isLockedBaja) return item;
      userEditsRef.current.set(item.documento, { sigla: 'A', motivo_baja: '' })
      return { ...item, sigla: 'A', motivo_baja: '' }
    }))
  }

  const handleSave = async (e) => {
    if (e) e.preventDefault();
    if (!selectedGrupo) return alert('Selecciona un grupo.')
    
    const currentDoc = activeGrupoObj?.formador_documento;
    const currentNombre = formadores.find(f => f.documento === currentDoc)?.nombre_completo;
    if (!currentDoc || !currentNombre) {
      return alert('Este grupo no tiene un formador asignado o no se ha encontrado en la lista. Por favor, asigne un formador en la vista de Asignación antes de registrar la asistencia.');
    }
    
    const invalidItems = attendanceList.filter(item => item.sigla === 'B' && !item.motivo_baja && !item.isLateInclusion)
    if (invalidItems.length > 0) {
      const names = invalidItems.map(i => i.nombres).join(', ')
      return alert(`Por favor, seleccione un motivo de baja para los siguientes candidatos:\n\n${names}`)
    }

    const recordsToSave = attendanceList.filter(item => !item.isLateInclusion).map(item => ({
      documento: item.documento,
      sigla: item.sigla,
      motivo_baja: item.motivo_baja
    }))
    setSaving(true)
    try {
      const targetGroup = activeGrupoObj?.codigo || selectedGrupo;
      const weekNum = String(activeGrupoObj?.semana_trabajo || '');
      const nowStr = new Date().toLocaleString('es-PE');
      
      const groupDates = [...new Set(asistencias
        .filter(a => (normalize(a.grupo_codigo) === normalize(targetGroup) || (activeGrupoObj && normalize(a.grupo_codigo) === normalize(activeGrupoObj.codigo))) && (!activeGrupoObj?.campana || normalize(a.campana) === normalize(activeGrupoObj.campana)))
        .map(a => a.fecha_asistencia))]
        .sort();
      const pastDates = groupDates.filter(d => d < fecha);

      const drivePayload = [];
      
      recordsToSave.forEach(r => {
        const itemInfo = attendanceList.find(i => i.documento === r.documento);
        
        drivePayload.push({
          archivo_origen: weekNum ? `SEM${weekNum}` : '',
          documento: r.documento,
          apellido_materno: itemInfo?.apellido_materno || '',
          apellido_paterno: itemInfo?.apellido_paterno || '',
          nombres: itemInfo?.nombres || '',
          celular: itemInfo?.celular || '',
          condicion_laboral: itemInfo?.condicion_laboral || '',
          campana: itemInfo?.campana || '',
          grupo: targetGroup,
          documento_formador: itemInfo?.docFormador || '',
          nombre_formador: itemInfo?.nombreFormador || '',
          fecha_registro_asistencia: formatSpreadsheetDate(fecha),
          tipo_reclutado: itemInfo?.tipoReclutado || '',
          estado: r.sigla === 'B' ? 'CESADO' : 'ACTIVO',
          sigla: r.sigla,
          motivo_baja: r.motivo_baja || '',
          fecha_hora_registro: nowStr,
          codigo_grupo: targetGroup
        });

        pastDates.forEach(pastDate => {
          const pastRecord = asistencias.find(a => a.postulante_documento === r.documento && (normalize(a.grupo_codigo) === normalize(targetGroup) || (activeGrupoObj && normalize(a.grupo_codigo) === normalize(activeGrupoObj.codigo))) && (!activeGrupoObj?.campana || normalize(a.campana) === normalize(activeGrupoObj.campana)) && a.fecha_asistencia === pastDate);
          
          let shouldBackfillFI = false;
          
          if (!pastRecord) {
             shouldBackfillFI = true;
          } else if (r.sigla !== 'B' && pastRecord.sigla_asistencia === 'B') {
             shouldBackfillFI = true;
          }

          if (shouldBackfillFI) {
            drivePayload.push({
              archivo_origen: weekNum ? `SEM${weekNum}` : '',
              documento: r.documento,
              apellido_materno: itemInfo?.apellido_materno || '',
              apellido_paterno: itemInfo?.apellido_paterno || '',
              nombres: itemInfo?.nombres || '',
              celular: itemInfo?.celular || '',
              condicion_laboral: itemInfo?.condicion_laboral || '',
              campana: itemInfo?.campana || '',
              grupo: targetGroup,
              documento_formador: itemInfo?.docFormador || '',
              nombre_formador: itemInfo?.nombreFormador || '',
              fecha_registro_asistencia: formatSpreadsheetDate(pastDate),
              tipo_reclutado: itemInfo?.tipoReclutado || '',
              estado: 'ACTIVO',
              sigla: 'FI',
              motivo_baja: '',
              fecha_hora_registro: nowStr,
              codigo_grupo: targetGroup
            });
          }
        });
      });
      
      try {
        await insertConsolidado(drivePayload);
      } catch (dbErr) {
        console.error('Consolidado Supabase error:', dbErr);
      }

      await onSave({
        grupoMeta: {
          codigo: activeGrupoObj?.codigo || selectedGrupo,
          campana_nombre: activeGrupoObj?.campana || '',
          segmento: activeGrupoObj?.segmento || null,
          fecha_registro: activeGrupoObj?.fecha_registro || fecha,
        },
        grupo_codigo: activeGrupoObj?.codigo || selectedGrupo,
        fecha_asistencia: fecha,
        records: recordsToSave,
      })

      userEditsRef.current.clear()

      toast.success('¡Asistencia guardada!', 'Los registros se sincronizaron con el consolidado en tiempo real.')
    } catch (err) {
      toast.error('Error al guardar', err.message || 'No se pudo guardar la asistencia.')
    } finally {
      setSaving(false)
    }
  }

  const exportToExcel = () => {
    if (attendanceList.length === 0) return
    const exportRows = attendanceList.map(item => ({
      DOCUMENTO: item.documento,
      'APELLIDO PATERNO': item.apellido_paterno,
      'APELLIDO MATERNO': item.apellido_materno,
      NOMBRES: item.nombres,
      CELULAR: item.celular,
      'CONDICION LABORAL': item.condicion_laboral,
      'CAMPAÑA': item.campana,
      'GRUPO(GPE-000)': item.grupo,
      'DOCUMENTO FORMADOR': item.docFormador,
      'NOMBRE FORMADOR': item.nombreFormador,
      'FECHA REGISTRO DE ASISTENCIA': formatSpreadsheetDate(fecha),
      'TIPO RECLUTADO': item.tipoReclutado,
      ESTADO: item.sigla === 'B' ? 'CESADO' : 'ACTIVO',
      SIGLA: item.sigla,
      'MOTIVO DE BAJA': item.motivo_baja || ''
    }))
    const ws = XLSX.utils.json_to_sheet(exportRows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Asistencia')
    XLSX.writeFile(wb, `Asistencia_${activeGrupoObj?.codigo || selectedGrupo}_${fecha}.xlsx`)
    toast.success('Excel exportado', `Se descargó la asistencia del grupo ${activeGrupoObj?.codigo || selectedGrupo}.`)
  }

  const handleCopySummary = async () => {
    if (displayedList.length === 0) return toast.warning('Sin datos', 'No hay postulantes cargados para copiar.')
    
    const campana = activeGrupoObj?.campana || selectedCampana || 'SIN CAMPAÑA'
    const docFormador = activeGrupoObj?.formador_documento || ''
    const formador = formadores.find(f => f.documento === docFormador)?.nombre_completo || activeGrupoObj?.formador_nombre || 'SIN ASIGNAR'
    const grupo = activeGrupoObj?.codigo || selectedGrupo || 'SIN GRUPO'
    
    const targetGroup = activeGrupoObj?.codigo || selectedGrupo;
    const groupDates = [...new Set(asistencias
      .filter(a => (normalize(a.grupo_codigo) === normalize(targetGroup) || (activeGrupoObj && normalize(a.grupo_codigo) === normalize(activeGrupoObj.codigo))) && (!activeGrupoObj?.campana || normalize(a.campana) === normalize(activeGrupoObj.campana)))
      .map(a => a.fecha_asistencia))]
      .sort();
      
    const allDatesUntilNow = new Set([...groupDates, fecha].filter(d => d <= fecha));
    const diaCapacitacion = allDatesUntilNow.size;
    
    const total = attendanceList.length;
    const bajas = attendanceList.filter(r => r.sigla === 'B').length;
    const activos = total - bajas;
    const faltas = attendanceList.filter(r => r.sigla === 'FI' || r.sigla === 'FJ').length;
    
    let text = `Buenas tardes con todos, se comparte estatus de la capacitación. ACTUALIZACIÓN\n\n📊 Campaña: ${campana}\n👤 Formadora: ${formador}\n💡 Grupo: ${grupo}\n📚 Día de Capacitación: ${diaCapacitacion}\n📄 Q Día 0: ${total}\n👥 Q Día 1 (Activos al corte): ${activos}\n❌ Q Desertores (DIA 0): ${bajas}\n⚠️ Q Faltas: ${faltas}\n📢 Observaciones: `;

    const asistentes = attendanceList.filter(r => r.sigla !== 'B');
    if (asistentes.length > 0) {
      text += `\n\n📋 LISTA DE ASISTENCIA (ACTIVOS):\n`;
      text += asistentes.map((r, i) => `${i + 1}. ${r.documento} - ${r.apellido_paterno} ${r.apellido_materno} ${r.nombres}`).join('\n');
    }

    try {
      await navigator.clipboard.writeText(text);
      setCopyFeedback(true)
      toast.success('¡Copiado para WhatsApp!', 'El resumen del grupo se copió al portapapeles con formato listo para enviar.')
      setTimeout(() => setCopyFeedback(false), 2500)
    } catch (err) {
      toast.error('Error al copiar', 'No se pudo acceder al portapapeles.')
    }
  }

  // Micro-KPIs calculations in real time with quick search support
  const displayedList = useMemo(() => {
    let list = filterActivos ? attendanceList.filter(item => !item.isHistoricalBaja) : attendanceList
    if (searchTerm.trim()) {
      const q = searchTerm.trim().toLowerCase()
      list = list.filter(item => 
        String(item.documento || '').toLowerCase().includes(q) ||
        String(item.nombres || '').toLowerCase().includes(q) ||
        String(item.apellido_paterno || '').toLowerCase().includes(q) ||
        String(item.apellido_materno || '').toLowerCase().includes(q) ||
        String(item.celular || '').toLowerCase().includes(q)
      )
    }
    return list
  }, [filterActivos, attendanceList, searchTerm])

  const kpis = useMemo(() => {
    const total = displayedList.length
    const asistieron = displayedList.filter(item => item.sigla === 'A' || item.sigla === 'I-OP').length
    const bajas = displayedList.filter(item => item.sigla === 'B').length
    const faltas = displayedList.filter(item => item.sigla === 'FI' || item.sigla === 'FJ').length
    const pctAsistencia = total > 0 ? ((asistieron / total) * 100).toFixed(1) : '0.0'

    return {
      total,
      asistieron,
      bajas,
      faltas,
      pctAsistencia
    }
  }, [displayedList])

  // Calendar Modal View
  const renderCalendar = () => {
    if (!activeGrupoObj) return null;
    const rawStartStr = activeGrupoObj.fecha_registro;
    if (!rawStartStr) return null;
    
    const start = new Date(rawStartStr + 'T12:00:00Z');
    if (String(selectedGrupo).startsWith('GPE')) {
      start.setUTCDate(start.getUTCDate() + 1);
    }
    const effectiveStartStr = start.toISOString().split('T')[0];
    
    const registeredDates = new Set(
      asistencias.filter(a => (normalize(a.grupo_codigo) === normalize(selectedGrupo) || (activeGrupoObj && normalize(a.grupo_codigo) === normalize(activeGrupoObj.codigo))) && (!activeGrupoObj?.campana || normalize(a.campana) === normalize(activeGrupoObj.campana))).map(a => a.fecha_asistencia)
    );

    const todayStr = new Date().toISOString().split('T')[0];
    let baseLimitStr = todayStr;
    if (activeGrupoObj?.fecha_inicio_ojt && activeGrupoObj.fecha_inicio_ojt < todayStr) {
      baseLimitStr = activeGrupoObj.fecha_inicio_ojt;
    }

    let maxLimitStr = baseLimitStr;
    registeredDates.forEach(d => { if (d > maxLimitStr) maxLimitStr = d; });
    
    let minStr = effectiveStartStr;
    registeredDates.forEach(d => { if (d < minStr) minStr = d; });
    
    let maxStr = maxLimitStr;
    if (maxStr < effectiveStartStr) maxStr = effectiveStartStr;
    
    const startRender = new Date(minStr + 'T12:00:00Z');
    const endRender = new Date(maxStr + 'T12:00:00Z');
    
    const monthsToRender = [];
    let iter = new Date(startRender.getUTCFullYear(), startRender.getUTCMonth(), 1, 12, 0, 0);
    const endLimit = new Date(endRender.getUTCFullYear(), endRender.getUTCMonth(), 1, 12, 0, 0);
    
    let safety = 0;
    while (iter <= endLimit && safety < 24) {
      monthsToRender.push(new Date(iter));
      iter.setUTCMonth(iter.getUTCMonth() + 1);
      safety++;
    }
    
    const maxIndex = monthsToRender.length - 1;
    let currentIndex = calendarMonthIndex === -1 ? maxIndex : calendarMonthIndex;
    if (currentIndex < 0) currentIndex = 0;
    if (currentIndex > maxIndex) currentIndex = maxIndex;
    
    const monthStart = monthsToRender[currentIndex] || new Date();
    const monthNames = ["ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"];

    const days = [];
    const currentMonth = monthStart.getUTCMonth();
    const currentYear = monthStart.getUTCFullYear();
    
    let curr = new Date(monthStart);
    while (curr.getUTCDay() !== 0) {
      curr.setUTCDate(curr.getUTCDate() - 1);
    }
    
    for (let i = 0; i < 42; i++) {
      const dStr = curr.toISOString().split('T')[0];
      const isCurrentMonth = curr.getUTCMonth() === currentMonth;
      const isSunday = curr.getUTCDay() === 0;
      const isRegistered = registeredDates.has(dStr);
      const isFuture = dStr > maxLimitStr;
      const isBeforeStart = dStr < minStr;
      
      let badgeStyle = {
        background: 'var(--bg-elevated)',
        color: 'var(--text-muted)',
        border: '1px solid var(--border-subtle)'
      };
      
      if (!isCurrentMonth) {
        badgeStyle = { background: 'transparent', color: 'var(--text-muted)', opacity: 0.3 };
      } else if (isRegistered) {
        badgeStyle = { background: 'var(--status-a-bg)', color: 'var(--status-a-text)', border: '1px solid rgba(16,185,129,0.4)' };
      } else if (isSunday || isBeforeStart || isFuture) {
        badgeStyle = { background: 'var(--bg-elevated)', color: 'var(--text-muted)', border: '1px solid var(--border-subtle)' };
      } else {
        badgeStyle = { background: 'var(--status-fi-bg)', color: 'var(--status-fi-text)', border: '1px solid rgba(239,68,68,0.4)' };
      }
      
      days.push(
        <div key={dStr} className="h-10 flex flex-col items-center justify-center font-bold text-xs rounded-md m-0.5" style={badgeStyle}>
          {curr.getUTCDate()}
        </div>
      );
      curr.setUTCDate(curr.getUTCDate() + 1);
      
      if (!isCurrentMonth && i >= 28 && curr.getUTCDay() === 0) {
        break;
      }
    }
    
    return (
      <div className="mt-4 pt-4 border-t border-[var(--border-subtle)] text-left relative">
        <p className="text-xs font-bold text-[var(--text-muted)] mb-3 text-center uppercase tracking-widest">Calendario de Avance</p>
        
        <div className="mb-4">
          <div className="bg-[var(--bg-elevated)] text-[var(--text-primary)] text-xs font-bold flex items-center justify-between px-4 py-2 rounded-t-xl tracking-widest border border-[var(--border-subtle)]">
            <button 
              type="button"
              onClick={() => setCalendarMonthIndex(currentIndex - 1)}
              disabled={currentIndex === 0}
              className="text-[var(--text-primary)] hover:text-cyan-400 disabled:opacity-30 px-2 text-lg leading-none transition-colors"
            >
              &#9664;
            </button>
            <span className="font-black text-sm">{monthNames[currentMonth]} {currentYear}</span>
            <button 
              type="button"
              onClick={() => setCalendarMonthIndex(currentIndex + 1)}
              disabled={currentIndex === maxIndex}
              className="text-[var(--text-primary)] hover:text-cyan-400 disabled:opacity-30 px-2 text-lg leading-none transition-colors"
            >
              &#9654;
            </button>
          </div>
          
          <div className="grid grid-cols-7 gap-1 p-2 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-b-xl shadow-lg">
            {['DO','LU','MA','MI','JU','VI','SA'].map(d => (
              <div key={d} className="text-[10px] font-black text-[var(--text-muted)] text-center py-1.5">{d}</div>
            ))}
            {days}
          </div>
        </div>

        <div className="mt-3 p-3 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[11px] text-center">
          <span className="text-[var(--text-muted)] font-bold block mb-2 uppercase tracking-wider">📌 Leyenda</span>
          <div className="flex flex-wrap justify-center gap-2">
            <span className="px-2.5 py-1 rounded-md font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">✔ Registrado</span>
            <span className="px-2.5 py-1 rounded-md font-bold bg-red-500/15 text-red-400 border border-red-500/30">✖ No registrado</span>
            <span className="px-2.5 py-1 rounded-md font-bold bg-[var(--bg-surface)] text-[var(--text-muted)] border border-[var(--border-subtle)]">Domingo / Feriado / No prog.</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden bg-[var(--bg-base)] p-3 gap-2 select-none">
      
      {/* ── 1. COMPACT HEADER & ACTIONS TOOLBAR (Height ~38px) ── */}
      <div className="flex flex-wrap items-center justify-between gap-2 shrink-0 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl px-3 py-1.5 shadow-xs">
        
        {/* Title */}
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_8px_#06B6D4] animate-pulse" />
          <h2 className="text-xs sm:text-sm font-black tracking-tight text-[var(--text-primary)] uppercase">
            Control y Marcación de Asistencia <span className="text-[10px] text-[var(--text-muted)] font-medium lowercase hidden sm:inline">· registro operativo por grupo</span>
          </h2>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1.5">
          {/* Guardar Cambios */}
          <button
            onClick={handleSave}
            disabled={saving || !selectedGrupo}
            className="flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-slate-950 font-black text-xs h-7 px-3.5 rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-[0_0_12px_rgba(16,185,129,0.3)] cursor-pointer"
          >
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
            <span>{saving ? 'Guardando...' : 'Guardar Cambios'}</span>
          </button>

          {/* Calendario */}
          <button
            onClick={() => { setCalendarMonthIndex(-1); setShowCalendarModal(true); }}
            className="flex items-center gap-1.5 bg-[var(--bg-elevated)] hover:bg-[var(--bg-muted)] border border-[var(--border-normal)] text-[var(--text-primary)] font-bold text-xs h-7 px-2.5 rounded-lg transition-all active:scale-95 cursor-pointer"
            title="Ver calendario de avance"
          >
            <CalendarIcon size={13} className="text-cyan-500 dark:text-cyan-400" />
            <span className="hidden sm:inline">Calendario</span>
          </button>

          {/* Filtrar activos */}
          <button
            onClick={() => setFilterActivos(!filterActivos)}
            className={`flex items-center gap-1.5 font-bold text-xs h-7 px-2.5 rounded-lg border transition-all active:scale-95 cursor-pointer ${
              filterActivos 
                ? 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-300 border-cyan-500/40 shadow-[0_0_10px_rgba(6,182,212,0.2)]' 
                : 'bg-[var(--bg-elevated)] hover:bg-[var(--bg-muted)] border-[var(--border-normal)] text-[var(--text-secondary)]'
            }`}
          >
            <Filter size={12} />
            <span>{filterActivos ? 'Solo Activos' : 'Todos'}</span>
          </button>

          {/* Leyenda dropdown */}
          <div className="relative group">
            <button className="flex items-center gap-1 bg-[var(--bg-elevated)] hover:bg-[var(--bg-muted)] border border-[var(--border-normal)] text-[var(--text-secondary)] font-bold text-xs h-7 px-2 rounded-lg transition-all cursor-pointer">
              <span>Leyenda</span>
              <span className="opacity-50 text-[9px]">▾</span>
            </button>
            <div className="hidden group-hover:block absolute top-full right-0 mt-1.5 z-50 bg-[var(--bg-surface)] backdrop-blur-xl border border-[var(--border-subtle)] rounded-xl shadow-2xl overflow-hidden w-64 select-none animate-fadeIn text-[var(--text-primary)]">
              <div className="text-[9px] font-black text-[var(--text-muted)] tracking-widest px-3 py-2 uppercase border-b border-[var(--border-subtle)]">
                ESTADOS DE ASISTENCIA
              </div>
              <div className="p-1 space-y-1">
                {SIGLAS.map(s => (
                  <div key={s.value} className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-[var(--bg-elevated)] transition-colors">
                    <span
                      className="font-black text-[9px] w-11 text-center rounded py-0.5 border"
                      style={{ backgroundColor: s.bgVar, color: s.textVar, borderColor: `${s.textVar}40` }}
                    >
                      {s.value}
                    </span>
                    <span className="text-xs text-[var(--text-secondary)] font-semibold">{s.label.split(' - ')[1] || s.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── 2. HIGH-DENSITY CASCADE FILTERS RIBBON (Height ~50px) ── */}
      <div className="p-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-xs shrink-0">
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 items-center">
          
          {/* PERIODO */}
          <div className="flex flex-col gap-0.5 min-w-0">
            <span className="text-[8px] font-black uppercase text-[var(--text-muted)] tracking-wider flex items-center gap-1 truncate">
              <CalendarIcon size={10} className="text-cyan-500 shrink-0" /> PERÍODO
            </span>
            <select
              value={selectedPeriodo}
              onChange={e => setSelectedPeriodo(e.target.value)}
              className="w-full h-7 text-xs font-bold rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-normal)] text-[var(--text-primary)] px-2 outline-none focus:border-cyan-500 transition-all cursor-pointer truncate"
            >
              <option value="">Todos</option>
              {periodos.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>

          {/* SEMANA */}
          <div className="flex flex-col gap-0.5 min-w-0">
            <span className="text-[8px] font-black uppercase text-[var(--text-muted)] tracking-wider flex items-center gap-1 truncate">
              <CalendarRange size={10} className="text-emerald-500 shrink-0" /> SEMANA
            </span>
            <select
              value={selectedSemana}
              onChange={e => setSelectedSemana(e.target.value)}
              className="w-full h-7 text-xs font-bold rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-normal)] text-[var(--text-primary)] px-2 outline-none focus:border-cyan-500 transition-all cursor-pointer truncate"
            >
              <option value="">Todas</option>
              {semanas.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          {/* SEGMENTO */}
          <div className="flex flex-col gap-0.5 min-w-0">
            <span className="text-[8px] font-black uppercase text-[var(--text-muted)] tracking-wider flex items-center gap-1 truncate">
              <Layers size={10} className="text-indigo-500 shrink-0" /> SEGMENTO
            </span>
            <select
              value={selectedSegmento}
              onChange={e => setSelectedSegmento(e.target.value)}
              className="w-full h-7 text-xs font-bold rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-normal)] text-[var(--text-primary)] px-2 outline-none focus:border-cyan-500 transition-all cursor-pointer truncate"
            >
              <option value="">Todos</option>
              {segmentos.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          {/* CAMPAÑA */}
          <div className="flex flex-col gap-0.5 min-w-0">
            <span className="text-[8px] font-black uppercase text-[var(--text-muted)] tracking-wider flex items-center gap-1 truncate">
              <Radio size={10} className="text-purple-500 shrink-0" /> CAMPAÑA
            </span>
            <select
              value={selectedCampana}
              onChange={e => setSelectedCampana(e.target.value)}
              className="w-full h-7 text-xs font-bold rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-normal)] text-[var(--text-primary)] px-2 outline-none focus:border-cyan-500 transition-all cursor-pointer truncate"
            >
              <option value="">Todas</option>
              {campanas.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {/* MODALIDAD */}
          <div className="flex flex-col gap-0.5 min-w-0">
            <span className="text-[8px] font-black uppercase text-[var(--text-muted)] tracking-wider flex items-center gap-1 truncate">
              <Laptop size={10} className="text-pink-500 shrink-0" /> MODALIDAD
            </span>
            <select
              value={selectedModalidad}
              onChange={e => setSelectedModalidad(e.target.value)}
              className="w-full h-7 text-xs font-bold rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-normal)] text-[var(--text-primary)] px-2 outline-none focus:border-cyan-500 transition-all cursor-pointer truncate"
            >
              <option value="">Todas</option>
              {modalidades.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>

          {/* GRUPO */}
          <div className="flex flex-col gap-0.5 min-w-0">
            <span className="text-[8px] font-black uppercase text-[var(--text-muted)] tracking-wider flex items-center gap-1 truncate">
              <Building2 size={10} className="text-blue-500 shrink-0" /> GRUPO
            </span>
            <select
              value={selectedGrupo}
              onChange={e => setSelectedGrupo(e.target.value)}
              className="w-full h-7 text-xs font-bold rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-normal)] text-[var(--text-primary)] px-2 outline-none focus:border-cyan-500 transition-all cursor-pointer truncate"
            >
              <option value="">Seleccionar</option>
              {gruposFiltrados.map((g, idx) => (
                <option key={`${g.id || g.codigo}_${idx}`} value={g.codigo}>
                  {String(g.codigo).startsWith('PROY-') ? '—' : (String(g.codigo).replace(/_\d+$/, '') || 'SIN CÓDIGO')}
                </option>
              ))}
            </select>
          </div>

          {/* FORMADOR */}
          <div className="flex flex-col gap-0.5 min-w-0">
            <span className="text-[8px] font-black uppercase text-[var(--text-muted)] tracking-wider flex items-center gap-1 truncate">
              <Users size={10} className="text-emerald-500 shrink-0" /> FORMADOR
            </span>
            <input
              type="text"
              readOnly
              value={activeGrupoObj ? (formadores.find(f => f.documento === activeGrupoObj.formador_documento)?.nombre_completo || 'SIN ASIGNAR') : ''}
              placeholder="Formador"
              className="w-full h-7 text-xs font-bold rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-normal)] text-[var(--text-secondary)] px-2 outline-none cursor-not-allowed uppercase truncate"
            />
          </div>

          {/* FECHA ASISTENCIA */}
          <div className="flex flex-col gap-0.5 min-w-0">
            <span className="text-[8px] font-black uppercase text-[var(--text-muted)] tracking-wider flex items-center gap-1 truncate">
              <ClockAlert size={10} className="text-amber-500 shrink-0" /> FECHA
            </span>
            <div className="relative w-full" ref={datePickerRef}>
              <div 
                onClick={() => setShowDatePickerPopup(!showDatePickerPopup)} 
                className="w-full h-7 text-xs font-bold rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-normal)] text-[var(--text-primary)] px-2 flex items-center justify-between cursor-pointer select-none hover:border-cyan-500 transition-colors shadow-xs"
              >
                <span className="truncate">{formatDisplayDate(fecha)}</span>
                <CalendarIcon size={12} className="text-cyan-500 dark:text-cyan-400 shrink-0 ml-1" />
              </div>
              
              {showDatePickerPopup && (
                <div 
                  className="absolute top-full right-0 mt-1.5 z-50 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl shadow-2xl p-3 w-60 select-none animate-fadeIn text-[var(--text-primary)] backdrop-blur-xl"
                  onClick={e => e.stopPropagation()}
                >
                  <div className="flex items-center justify-between mb-2">
                    <button 
                      type="button" 
                      onClick={(e) => {
                        e.stopPropagation();
                        if (pickerMonth === 0) {
                          setPickerMonth(11);
                          setPickerYear(prev => prev - 1);
                        } else {
                          setPickerMonth(prev => prev - 1);
                        }
                      }}
                      className="text-[var(--text-muted)] hover:text-[var(--text-primary)] p-1 font-bold text-sm cursor-pointer"
                    >
                      <ChevronLeft size={15} />
                    </button>
                    <span className="font-extrabold text-xs uppercase tracking-wide">
                      {["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"][pickerMonth]} {pickerYear}
                    </span>
                    <button 
                      type="button" 
                      onClick={(e) => {
                        e.stopPropagation();
                        if (pickerMonth === 11) {
                          setPickerMonth(0);
                          setPickerYear(prev => prev + 1);
                        } else {
                          setPickerMonth(prev => prev + 1);
                        }
                      }}
                      className="text-[var(--text-muted)] hover:text-[var(--text-primary)] p-1 font-bold text-sm cursor-pointer"
                    >
                      <ChevronRight size={15} />
                    </button>
                  </div>
                  
                  <div className="grid grid-cols-7 gap-1 text-center mb-1">
                    {['D', 'L', 'M', 'M', 'J', 'V', 'S'].map((w, idx) => (
                      <span key={idx} className="text-[8px] font-black text-[var(--text-muted)] uppercase">{w}</span>
                    ))}
                  </div>
                  
                  <div className="grid grid-cols-7 gap-1">
                    {getDaysInMonth(pickerYear, pickerMonth).map((d) => {
                      const isSelected = d.dateStr === fecha;
                      return (
                        <button
                          key={d.dateStr}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setFecha(d.dateStr);
                            setShowDatePickerPopup(false);
                          }}
                          className={`h-6 w-6 text-[11px] font-semibold rounded-md flex items-center justify-center transition-all cursor-pointer ${
                            isSelected 
                              ? 'bg-cyan-500 text-slate-950 font-black shadow-[0_0_8px_rgba(6,182,212,0.4)]' 
                              : d.isCurrentMonth 
                                ? 'text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]' 
                                : 'text-[var(--text-muted)] opacity-30'
                          }`}
                        >
                          {d.day}
                        </button>
                      );
                    })}
                  </div>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      const todayStr = new Date().toISOString().split('T')[0];
                      setFecha(todayStr);
                      setShowDatePickerPopup(false);
                    }}
                    className="mt-2 w-full bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 font-bold py-1 rounded-lg text-xs transition-colors border border-cyan-500/30 cursor-pointer"
                  >
                    Hoy
                  </button>
                </div>
              )}
            </div>
          </div>

        </div>
      </div>

      {/* ── 3. COMPACT MICRO-KPIS STRIP (Height ~54px) ── */}
      {selectedGrupo && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 shrink-0 animate-fadeIn">
          
          {/* Total Postulantes */}
          <div className="p-2 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-xs flex items-center justify-between min-w-0" style={{ borderLeft: '3px solid #06B6D4' }}>
            <div className="min-w-0 truncate">
              <div className="text-[9px] font-black uppercase tracking-wider text-[var(--text-muted)] truncate">Postulantes</div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-base sm:text-lg font-black text-cyan-600 dark:text-cyan-400 leading-tight font-mono tabular-nums">
                  {kpis.total}
                </span>
                <span className="text-[9px] text-[var(--text-muted)] font-semibold truncate">convocados</span>
              </div>
            </div>
            <div className="h-7 w-7 rounded-lg bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 flex items-center justify-center border border-cyan-500/20 shrink-0 ml-1">
              <Users size={14} />
            </div>
          </div>

          {/* Asistieron [A] */}
          <div className="p-2 rounded-xl bg-[var(--bg-surface)] border border-emerald-500/25 shadow-xs flex items-center justify-between min-w-0" style={{ borderLeft: '3px solid #10B981' }}>
            <div className="min-w-0 truncate">
              <div className="text-[9px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400 truncate">Asistieron [A]</div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-base sm:text-lg font-black text-emerald-600 dark:text-emerald-400 leading-tight font-mono tabular-nums">
                  {kpis.asistieron}
                </span>
                <span className="text-[9px] text-emerald-600/80 dark:text-emerald-400/80 font-semibold truncate">en sala / activos</span>
              </div>
            </div>
            <div className="h-7 w-7 rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center border border-emerald-500/30 shrink-0 ml-1">
              <UserCheck size={14} />
            </div>
          </div>

          {/* Bajas [B] */}
          <div className="p-2 rounded-xl bg-[var(--bg-surface)] border border-rose-500/25 shadow-xs flex items-center justify-between min-w-0" style={{ borderLeft: '3px solid #F43F5E' }}>
            <div className="min-w-0 truncate">
              <div className="text-[9px] font-black uppercase tracking-wider text-rose-600 dark:text-rose-400 truncate">Bajas [B]</div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-base sm:text-lg font-black text-rose-600 dark:text-rose-400 leading-tight font-mono tabular-nums">
                  {kpis.bajas}
                </span>
                <span className="text-[9px] text-rose-600/80 dark:text-rose-400/80 font-semibold truncate">deserciones</span>
              </div>
            </div>
            <div className="h-7 w-7 rounded-lg bg-rose-500/15 text-rose-600 dark:text-rose-400 flex items-center justify-center border border-rose-500/30 shrink-0 ml-1">
              <UserX size={14} />
            </div>
          </div>

          {/* Faltas [FI / FJ] */}
          <div className="p-2 rounded-xl bg-[var(--bg-surface)] border border-amber-500/25 shadow-xs flex items-center justify-between min-w-0" style={{ borderLeft: '3px solid #F59E0B' }}>
            <div className="min-w-0 truncate">
              <div className="text-[9px] font-black uppercase tracking-wider text-amber-600 dark:text-amber-400 truncate">Faltas [FI/FJ]</div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-base sm:text-lg font-black text-amber-600 dark:text-amber-400 leading-tight font-mono tabular-nums">
                  {kpis.faltas}
                </span>
                <span className="text-[9px] text-amber-600/80 dark:text-amber-400/80 font-semibold truncate">inasistencias</span>
              </div>
            </div>
            <div className="h-7 w-7 rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center border border-amber-500/30 shrink-0 ml-1">
              <ClockAlert size={14} />
            </div>
          </div>

          {/* % Asistencia Diaria */}
          <div className="col-span-2 sm:col-span-1 p-2 rounded-xl bg-[var(--bg-surface)] border border-purple-500/25 shadow-xs flex items-center justify-between min-w-0" style={{ borderLeft: '3px solid #8B5CF6' }}>
            <div className="min-w-0 truncate">
              <div className="text-[9px] font-black uppercase tracking-wider text-purple-600 dark:text-purple-400 truncate">% Asistencia</div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-base sm:text-lg font-black text-purple-600 dark:text-purple-400 leading-tight font-mono tabular-nums">
                  {kpis.pctAsistencia}%
                </span>
                <span className="text-[9px] text-purple-600/80 dark:text-purple-400/80 font-semibold truncate">efectividad</span>
              </div>
            </div>
            <div className="h-7 w-7 rounded-lg bg-purple-500/15 text-purple-600 dark:text-purple-400 flex items-center justify-center border border-purple-500/30 font-black text-xs shrink-0 ml-1">
              %
            </div>
          </div>

        </div>
      )}

      {/* Missing Candidates Alert */}
      {missingDataCandidates.length > 0 && (
        <div className="px-3 py-2 rounded-xl bg-orange-500/10 border border-orange-500/30 flex items-center gap-3 shadow-xs shrink-0">
          <AlertTriangle size={16} className="text-orange-500 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-bold text-orange-700 dark:text-orange-300 truncate">
              {missingDataCandidates.length} candidatos tienen datos obligatorios incompletos y no aparecen en la tabla.
            </p>
          </div>
        </div>
      )}

      {/* ── 4. MAX-HEIGHT POSTULANTES TABLE CONTAINER (Fills Remaining Space) ── */}
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-xl">
        
        {/* Table Toolbar (Height ~38px) */}
        <div className="flex flex-wrap justify-between items-center px-3 py-1.5 border-b border-[var(--border-subtle)] gap-2 bg-[var(--bg-elevated)]/40 shrink-0">
          <div className="flex items-center gap-2.5">
            <h3 className="text-xs font-black text-[var(--text-primary)] uppercase tracking-wide">
              Postulantes del Grupo
            </h3>
            <span className="text-[10px] bg-[var(--bg-elevated)] border border-[var(--border-normal)] text-[var(--text-muted)] font-mono font-bold px-2 py-0.5 rounded-md">
              {displayedList.length} cargados
            </span>
            {displayedList.length > 0 && (
              <button
                onClick={handleMarkAllAttended}
                className="flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 transition-all active:scale-95 shadow-xs cursor-pointer"
                title="Marcar a todos como Asistió [A]"
              >
                <CheckCheck size={13} /> Marcar Todos como Asistió (A)
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Quick Candidate Search */}
            <div className="relative w-48 sm:w-60">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Filtrar por DNI o nombre..."
                className="w-full h-7 pl-7 pr-6 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-normal)] text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-cyan-500 transition-colors font-medium"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                >
                  <X size={11} />
                </button>
              )}
            </div>

            <button 
              onClick={handleCopySummary} 
              disabled={displayedList.length === 0} 
              className="flex items-center gap-1 h-7 px-2.5 rounded-lg bg-[#25D366]/10 hover:bg-[#25D366]/20 text-[#25D366] border border-[#25D366]/30 text-xs font-bold transition-all active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer shadow-xs"
              title="Copiar Resumen para WhatsApp"
            >
              <Copy size={12} />
              <span className="hidden sm:inline">{copyFeedback ? '¡Copiado!' : 'WhatsApp Copy'}</span>
            </button>
            
            <button 
              onClick={exportToExcel} 
              disabled={displayedList.length === 0} 
              className="flex items-center gap-1 h-7 px-2.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 text-xs font-bold transition-all active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer shadow-xs"
              title="Exportar a Excel"
            >
              <Download size={12} /> Excel
            </button>
          </div>
        </div>

        {/* Scrollable Table Area */}
        <div className="flex-1 min-h-0 overflow-x-auto overflow-y-auto custom-scrollbar relative bg-[var(--bg-surface)]">
          {displayedList.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-[var(--text-muted)] p-6 space-y-2">
              <Users size={32} className="opacity-30 mb-1" />
              <p className="text-xs font-bold text-[var(--text-primary)]">No hay postulantes para mostrar</p>
              <p className="text-[11px] max-w-xs text-center text-[var(--text-muted)]">
                Selecciona un Período, Campaña y Grupo arriba para cargar la nómina.
              </p>
            </div>
          ) : (
            <table className="w-full min-w-[1050px] border-separate border-spacing-0 text-left text-xs">
              <thead className="sticky top-0 z-20 shadow-xs">
                <tr>
                  <th className="sticky top-0 z-20 bg-[var(--table-head-bg)] border-b border-[var(--border-subtle)] px-3 py-2 font-black uppercase tracking-[0.14em] text-[var(--text-muted)] text-[9px] whitespace-nowrap">DOCUMENTO</th>
                  <th className="sticky top-0 z-20 bg-[var(--table-head-bg)] border-b border-[var(--border-subtle)] px-3 py-2 font-black uppercase tracking-[0.14em] text-[var(--text-muted)] text-[9px] whitespace-nowrap">APELLIDO PATERNO</th>
                  <th className="sticky top-0 z-20 bg-[var(--table-head-bg)] border-b border-[var(--border-subtle)] px-3 py-2 font-black uppercase tracking-[0.14em] text-[var(--text-muted)] text-[9px] whitespace-nowrap">APELLIDO MATERNO</th>
                  <th className="sticky top-0 z-20 bg-[var(--table-head-bg)] border-b border-[var(--border-subtle)] px-3 py-2 font-black uppercase tracking-[0.14em] text-[var(--text-muted)] text-[9px] whitespace-nowrap">NOMBRES</th>
                  <th className="sticky top-0 z-20 bg-[var(--table-head-bg)] border-b border-[var(--border-subtle)] px-3 py-2 font-black uppercase tracking-[0.14em] text-[var(--text-muted)] text-[9px] whitespace-nowrap">CELULAR</th>
                  <th className="sticky top-0 z-20 bg-[var(--table-head-bg)] border-b border-[var(--border-subtle)] px-3 py-2 font-black uppercase tracking-[0.14em] text-center text-[var(--text-muted)] text-[9px] whitespace-nowrap">FECHA ASISTENCIA</th>
                  <th className="sticky top-0 z-20 bg-[var(--table-head-bg)] border-b border-[var(--border-subtle)] px-3 py-2 font-black uppercase tracking-[0.14em] text-center text-[var(--text-muted)] text-[9px] whitespace-nowrap">TIPO RECLUTADO</th>
                  <th className="sticky top-0 z-20 bg-[var(--table-head-bg)] border-b border-[var(--border-subtle)] px-3 py-2 font-black uppercase tracking-[0.14em] text-center text-[var(--text-muted)] text-[9px] whitespace-nowrap">ESTADO</th>
                  <th className="sticky top-0 z-20 bg-[var(--table-head-bg)] border-b border-[var(--border-subtle)] px-3 py-2 font-black uppercase tracking-[0.14em] text-center text-[var(--text-muted)] text-[9px] whitespace-nowrap">SIGLA</th>
                  <th className="sticky top-0 z-20 bg-[var(--table-head-bg)] border-b border-[var(--border-subtle)] px-3 py-2 font-black uppercase tracking-[0.14em] text-[var(--text-muted)] text-[9px] whitespace-nowrap">MOTIVO DE BAJA</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)] bg-[var(--bg-surface)]">
                {displayedList.map(item => (
                  <AttendanceRow
                    key={item.documento}
                    item={item}
                    fecha={fecha}
                    onStatusChange={handleStatusChange}
                    onMotiveChange={handleMotiveChange}
                    motivosBaja={motivosBaja}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ── CALENDAR MODAL ── */}
      {showCalendarModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/70 backdrop-blur-md animate-fadeIn">
          <div className="w-full max-w-xl rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-[var(--border-subtle)] bg-[var(--bg-surface)] animate-slideUp">
            <div className="px-5 py-3.5 border-b border-[var(--border-subtle)] flex justify-between items-center bg-[var(--bg-elevated)]">
              <h2 className="text-sm font-black text-[var(--text-primary)] flex items-center gap-2">
                <CalendarIcon size={16} className="text-cyan-400" /> Calendario de Avance de Asistencia
              </h2>
              <button
                onClick={() => setShowCalendarModal(false)}
                className="px-2.5 py-1 text-xs font-bold text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors cursor-pointer"
              >
                Cerrar
              </button>
            </div>
            <div className="p-5 max-h-[80vh] overflow-y-auto">
              {renderCalendar()}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
