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
  Laptop,
  Zap
} from 'lucide-react'
import * as XLSX from 'xlsx'
import { insertConsolidado, fetchGruposDia1, getEquipoFormacion, isAsistioStr, parseFechaAsistencia, DB_MODE, fetchDescuentosAprobadosSet, isDescuentoAprobado, levantarBajaPostulante, autocompletarDiasFaltantesGrupo } from '../lib/dataService'
import {
  canAssignBajaDia1,
  sanitizeBajaDia1Motivo,
  isBajaDia1Motivo,
  countsInFormacionDesercion,
  analyzeDia1CorteRecords,
} from '../lib/bajaDia1Rules'
import { resolveFormadorSegment } from '../lib/flujoOperativo'
import { resolveGrupoPais, isFeriadoNacional } from '../lib/businessHoursUtils'
import { resolvePeriodoIngreso, normalize2026Period } from '../lib/dashboardAnalytics'
import { supabase } from '../lib/supabase'
import PageLayout from './ui/PageLayout'
import PageHeader from './ui/PageHeader'
import { useToast } from '../context/ToastContext'
import AsistenciaRegularizacionModal from './AsistenciaRegularizacionModal'
import AsistenciaGapAssistantModal from './AsistenciaGapAssistantModal'

const SIGLAS = [
  { value: 'A', label: 'A - Asistencia', bgVar: 'var(--status-a-bg)', textVar: 'var(--status-a-text)' },
  { value: 'I-OP', label: 'I-OP - Ingreso Operación', bgVar: 'var(--status-iop-bg)', textVar: 'var(--status-iop-text)' },
  { value: 'FI', label: 'FI - Falta Injustificada', bgVar: 'var(--status-fi-bg)', textVar: 'var(--status-fi-text)' },
  { value: 'FJ', label: 'FJ - Falta Justificada', bgVar: 'var(--status-fj-bg)', textVar: 'var(--status-fj-text)' },
  { value: 'B', label: 'B - Baja', bgVar: 'var(--status-b-bg)', textVar: 'var(--status-b-text)' }
]

const normalize = (s) => (s || '').toString().trim().toUpperCase()

// Normalizador oficial de segmento idéntico a ResumenCapacitacion y UbicacionView
const normalizeSegmento = (rawSeg, campana) => {
  let s = String(rawSeg || '').trim().toUpperCase()
  const c = String(campana || '').toUpperCase()

  // 1. Campañas exclusivas de CLARO CHILE
  if (c.includes('TUVES') || c.includes('CHILE') || s === 'CLARO CHILE' || s.includes('CHILE')) {
    return 'CLARO CHILE'
  }

  // 2. Campañas exclusivas de LIPIGAS
  if (c.includes('LIPIGAS') || c.includes('LIMAGAS') || s === 'LIPIGAS' || s.includes('LIPIGAS')) {
    return 'LIPIGAS'
  }

  // 3. EXCEPCIÓN CLAVE: Campañas de Claro Postpago pertenecen a "CLARO PERU"
  if (c.includes('CLARO POSTPAGO')) {
    return 'CLARO PERU'
  }

  // 4. EXCEPCIÓN CLAVE: "RETENCIONES FIJA INBOUND" y "RETENCIONES FIJA" pertenecen a "CLARO PERU"
  if (c.includes('RETENCIONES FIJA') || c.includes('RETENCION FIJA') || c.includes('FIJA INBOUND')) {
    return 'CLARO PERU'
  }

  // 5. Palabras clave y subtipos de RETENCIONES
  if (
    s === 'CLARO PERU RETENCIONES' ||
    s.includes('RETENCION') || 
    c.includes('RETENCION') || 
    c.includes('CONTACTADOS') || 
    c.includes('CONTENCI') || 
    c.includes('DESCUENTO') || 
    c.includes('BABYSTING') || 
    c.includes('CONSULTA PREVIA') || 
    c.includes('MI CLARO') || 
    c.includes('ENCUESTAS IZO') ||
    c.includes('CANAL DIGITAL') ||
    c.includes('WSP INBOUND')
  ) {
    return 'CLARO PERU RETENCIONES'
  }

  // 6. Palabras clave y subtipos de OUT
  if (
    s === 'CLARO PERU OUT' ||
    s.includes('OUT') || 
    c.includes('OUT') || 
    c.includes('PREVENTIVA') || 
    c.includes('PORTA OUT') || 
    c.includes('RENO') || 
    c.includes('VENTAS') || 
    c.includes('CROSS') || 
    c.includes('MIGRACIONES') ||
    c.includes('UPGRADE') ||
    c.includes('VENTA')
  ) {
    return 'CLARO PERU OUT'
  }

  return 'CLARO PERU'
}

// Extracción canónica del periodo de Capacidad R&S (Priorizando periodo de ingreso a OP)
const getCapacidadPeriodo = (g) => {
  if (!g) return ''
  const pIngreso = resolvePeriodoIngreso(g)
  if (pIngreso) return pIngreso
  const pDirect = normalize2026Period(g.periodo_ingreso_op || g.fecha_ingreso_op || g.periodo_ingreso || g.periodo_efectivo)
  if (pDirect) return pDirect
  const pRaw = normalize2026Period(g.periodo || g.periodo_rys)
  if (pRaw) return pRaw
  if (g.periodo) {
    const clean = String(g.periodo).replace(/\D/g, '').slice(0, 6)
    if (clean) return clean
  }
  return ''
}

const isGrupoPeriodoMatch = (g, targetPeriodo) => {
  if (!targetPeriodo) return true
  const cleanTarget = String(targetPeriodo).trim()
  const pCap = getCapacidadPeriodo(g)
  if (pCap === cleanTarget) return true
  const pRaw = normalize2026Period(g.periodo || g.periodo_rys)
  if (pRaw === cleanTarget) return true
  if (g.periodo && String(g.periodo).trim() === cleanTarget) return true
  return false
}

const isGrupoSegmentoMatch = (g, targetSegmento) => {
  if (!targetSegmento) return true
  return normalizeSegmento(g?.segmento, g?.campana) === String(targetSegmento).trim().toUpperCase()
}

const getSemanaLabel = (g) => {
  if (!g) return ''
  const val = g.semana_label || g.semana_trabajo || g.semana || ''
  if (!val) return ''
  const clean = String(val).trim().toUpperCase()
  const num = parseInt(clean.replace(/\D/g, ''), 10)
  return (!isNaN(num) && num > 0) ? `SEM ${num}` : clean
}

const matchSemana = (valA, valB) => {
  if (!valA || !valB) return false
  const strB = String(valB).trim().toUpperCase()
  if (strB === 'TODAS' || strB === 'TODOS' || !strB) return true
  const numA = parseInt(String(valA).replace(/\D/g, ''), 10)
  const numB = parseInt(String(valB).replace(/\D/g, ''), 10)
  if (!isNaN(numA) && !isNaN(numB)) return numA === numB
  return String(valA).trim().toUpperCase() === String(valB).trim().toUpperCase()
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
  onLevantarBaja,
  motivosBaja,
  isReadOnly = false,
  onOpenRegularizacion
}) {
  const isBaja = item.sigla === 'B'
  const estadoLabel = isBaja ? 'CESADO' : 'ACTIVO'
  const siglaOpt = SIGLAS.find(s => s.value === item.sigla)

  return (
    <tr className="hover:bg-[var(--bg-elevated)] transition-colors group">
      <td className="px-3 py-2 font-mono text-[var(--text-primary)] font-bold text-xs whitespace-nowrap">
        <button
          type="button"
          onClick={() => onOpenRegularizacion && onOpenRegularizacion(item)}
          className="font-mono font-bold text-cyan-600 dark:text-cyan-400 hover:underline cursor-pointer text-left"
          title="Click para ver historial de asistencia de este postulante"
        >
          {item.documento}
        </button>
      </td>
      <td className="px-3 py-2 uppercase text-[var(--text-secondary)] font-semibold text-xs whitespace-nowrap">{item.apellido_paterno}</td>
      <td className="px-3 py-2 uppercase text-[var(--text-secondary)] font-semibold text-xs whitespace-nowrap">{item.apellido_materno}</td>
      <td className="px-3 py-2 uppercase text-[var(--text-primary)] font-bold text-xs whitespace-nowrap">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => onOpenRegularizacion && onOpenRegularizacion(item)}
            className="hover:text-cyan-600 dark:hover:text-cyan-400 hover:underline cursor-pointer text-left uppercase font-bold"
            title="Click para ver historial y regularizar asistencia de este postulante"
          >
            {item.nombres}
          </button>
          <button
            type="button"
            onClick={() => onOpenRegularizacion && onOpenRegularizacion(item)}
            className="hidden group-hover:inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-normal)] bg-[var(--bg-elevated)] transition-colors cursor-pointer"
            title="Abrir historial y regularización"
          >
            Regularizar
          </button>
        </div>
      </td>
      <td className="px-3 py-2 text-[var(--text-secondary)] font-mono text-xs whitespace-nowrap">{item.celular}</td>
      <td className="px-3 py-2 text-center text-[var(--text-secondary)] font-mono text-xs whitespace-nowrap">{formatSpreadsheetDate(fecha)}</td>
      <td className="px-3 py-2 text-center whitespace-nowrap">
        <span className={`inline-block px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wide ${
          item.tipoReclutado === 'AGREGADO' || item.tipoReclutado === 'AGREGADO CAP' ? 'bg-orange-500/15 text-orange-600 dark:text-orange-400 border border-orange-500/30' :
          item.tipoReclutado === 'RECUPERADO' || item.tipoReclutado === 'RECUPERADO CAP' ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30' :
          item.tipoReclutado === 'OBSERVADO' ? 'bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/30' :
          item.tipoReclutado === 'CESE' || item.tipoReclutado === 'CESADO' ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30' :
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
          <span className="text-[10px] font-semibold text-[var(--text-muted)] bg-[var(--bg-elevated)] px-2 py-1 rounded">No aplica</span>
        ) : (
          <div className="w-16 mx-auto">
            <select
              value={item.sigla}
              onChange={(e) => onStatusChange(item.documento, e.target.value)}
              disabled={isReadOnly}
              className={`w-full rounded-md py-1 px-1.5 font-black text-center text-xs outline-none shadow-xs transition-all border border-[var(--border-normal)] ${
                isReadOnly ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:scale-105 active:scale-95'
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
              value={item.motivo_baja || ''}
              onChange={e => onMotiveChange(item.documento, e.target.value)}
              disabled={isReadOnly || item.isLockedBaja}
              className={`w-full max-w-[200px] border border-rose-500/30 rounded-md py-1 px-2 text-xs font-semibold text-rose-600 dark:text-rose-400 bg-rose-500/10 focus:border-rose-500 outline-none ${
                isReadOnly || item.isLockedBaja ? 'cursor-not-allowed opacity-75' : ''
              }`}
              title={item.isLockedBaja ? `Baja registrada en fecha anterior: ${item.motivo_baja}` : 'Motivo de baja'}
            >
              {!item.motivo_baja && <option value="">-- Seleccionar Motivo de Formación --</option>}
              {item.showBajaDia1Option && !item.isCorte3 && <option value="BAJA DIA 1">BAJA DIA 1</option>}
              {item.motivo_baja && !item.showBajaDia1Option && item.motivo_baja === 'BAJA DIA 1' && !item.isCorte3 && (
                <option value="BAJA DIA 1">BAJA DIA 1</option>
              )}
              {item.motivo_baja && item.motivo_baja !== 'BAJA DIA 1' && item.motivo_baja !== 'OBSERVADO' && item.motivo_baja !== 'SOBREDOTACIÓN' && !motivosBaja.some(m => m.motivo === item.motivo_baja) && (
                <option value={item.motivo_baja}>{item.motivo_baja}</option>
              )}

              {item.allowOtherMotivos && (
                <>
                  <option value="OBSERVADO" className="bg-[var(--bg-surface)] text-[var(--text-primary)]">OBSERVADO</option>
                  {!motivosBaja.some(m => m.motivo === 'DISTANCIA') && (
                    <option value="DISTANCIA" className="bg-[var(--bg-surface)] text-[var(--text-primary)]">DISTANCIA</option>
                  )}
                  {!motivosBaja.some(m => m.motivo === 'SOBREDOTACIÓN') && (
                    <option value="SOBREDOTACIÓN" className="bg-[var(--bg-surface)] text-[var(--text-primary)]">SOBREDOTACIÓN</option>
                  )}
                  {motivosBaja.filter(m => m.motivo !== 'BAJA DIA 1' && m.motivo !== 'OBSERVADO').map(m => (
                    <option key={m.id || m.motivo} value={m.motivo} className="bg-[var(--bg-surface)] text-[var(--text-primary)]">
                      {m.motivo}
                    </option>
                  ))}
                </>
              )}
            </select>
            {item.isLockedBaja && (
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-rose-500 font-bold" title="Baja consolidada en fecha anterior">
                  🔒
                </span>
                <button
                  type="button"
                  onClick={() => onLevantarBaja && onLevantarBaja(item)}
                  disabled={isReadOnly}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-black bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/40 hover:bg-emerald-500/30 transition-all cursor-pointer shadow-xs active:scale-95"
                  title="Levantar baja: Convierte el día de la baja previa en Falta Injustificada (FI) y registra Asistencia (A) el día de hoy"
                >
                  <span>↺ Levantar Baja</span>
                </button>
              </div>
            )}
          </div>
        ) : (
          <span className="text-[var(--text-muted)] text-xs">—</span>
        )}
      </td>
    </tr>
  )
})

function resolveFormadorDisplayName(formadoresList = [], doc = '', fallback = '') {
  const cleanDoc = String(doc || '').trim()
  if (cleanDoc) {
    const found = formadoresList.find(f => String(f.documento || f.dni || '').trim() === cleanDoc)
    if (found) {
      return (found.nombre_completo || found.datos_completos || found.nombres_completos || fallback || 'SIN ASIGNAR').trim()
    }
  }
  if (fallback && String(fallback).trim() && String(fallback).trim().toUpperCase() !== 'SIN ASIGNAR') {
    return String(fallback).trim()
  }
  return 'SIN ASIGNAR'
}

/**
 * Detecta el corte sugerido (1, 2 o 3) según el horario del grupo (mañana, tarde o noche)
 * dividiendo la jornada en 3 momentos de corte operativo (Apertura, Seguimiento RyS, Cierre).
 */
function getSuggestedCorte(rangoHorario) {
  if (!rangoHorario) {
    const hour = new Date().getHours()
    if (hour < 11) return 1
    if (hour < 14) return 2
    return 3
  }
  const matches = String(rangoHorario).match(/(\d{1,2}):(\d{2})/g)
  if (!matches || matches.length < 2) {
    const hour = new Date().getHours()
    if (hour < 11) return 1
    if (hour < 14) return 2
    return 3
  }
  const [startH, startM] = matches[0].split(':').map(Number)
  const [endH, endM] = matches[1].split(':').map(Number)
  let startMin = startH * 60 + startM
  let endMin = endH * 60 + endM
  if (endMin <= startMin) endMin += 24 * 60

  const now = new Date()
  let currentMin = now.getHours() * 60 + now.getMinutes()
  if (currentMin < startMin && endMin > 24 * 60) currentMin += 24 * 60

  const duration = endMin - startMin
  const c1 = startMin + duration * 0.35
  const c2 = startMin + duration * 0.70

  if (currentMin <= c1) return 1
  if (currentMin <= c2) return 2
  return 3
}

export default function AsistenciaForm({
  grupos = [],
  postulantes = [],
  asistencias: initialAsistencias = [],
  formadores = [],
  motivosBaja = [],
  userProfile = null,
  userRole = 'admin',
  onSave,
  onRefresh,
}) {
  const toast = useToast()
  const [asistencias, setAsistencias] = useState(initialAsistencias)
  useEffect(() => {
    setAsistencias(initialAsistencias)
  }, [initialAsistencias])
  const [selectedPeriodo, setSelectedPeriodo] = useState(() => localStorage.getItem('wfm_asis_periodo') || '')
  const [selectedSemana, setSelectedSemana] = useState(() => localStorage.getItem('wfm_asis_semana') || '')
  const [selectedSegmento, setSelectedSegmento] = useState(() => localStorage.getItem('wfm_asis_segmento') || '')
  const [selectedCampana, setSelectedCampana] = useState(() => localStorage.getItem('wfm_asis_campana') || '')
  const [selectedModalidad, setSelectedModalidad] = useState(() => localStorage.getItem('wfm_asis_modalidad') || '')
  const [selectedGrupo, setSelectedGrupo] = useState(() => localStorage.getItem('wfm_asis_grupo') || '')
  const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0])
  const [selectedCorte, setSelectedCorte] = useState(1)
  const [searchTerm, setSearchTerm] = useState('')
  
  const [attendanceList, setAttendanceList] = useState([])
  const [missingDataCandidates, setMissingDataCandidates] = useState([])
  const [filterActivos, setFilterActivos] = useState(false)
  const [saving, setSaving] = useState(false)
  const [copyFeedback, setCopyFeedback] = useState(false)
  const [showCalendarModal, setShowCalendarModal] = useState(false)
  const [calendarMonthIndex, setCalendarMonthIndex] = useState(-1)
  const [regularizandoPostulante, setRegularizandoPostulante] = useState(null)
  
  // Asistente rápido de días faltantes
  const [showGapModal, setShowGapModal] = useState(false)
  const [isProcessingGap, setIsProcessingGap] = useState(false)
  const [hasPromptedGapForDate, setHasPromptedGapForDate] = useState(null)

  const [dia1Calibrado, setDia1Calibrado] = useState(false)
  const [equipoFormacionData, setEquipoFormacionData] = useState([])
  const [liveGrupoMeta, setLiveGrupoMeta] = useState(null)
  const [descuentosAprobadosSet, setDescuentosAprobadosSet] = useState(new Set())
  const [capacidadGrupos, setCapacidadGrupos] = useState(grupos)

  useEffect(() => {
    if (Array.isArray(grupos) && grupos.length > 0) {
      setCapacidadGrupos(grupos)
    }
  }, [grupos])

  // Carga directa de la tabla maestra capacidad_rys para alimentar filtros en tiempo real
  useEffect(() => {
    let isMounted = true
    async function loadCapacidadDirect() {
      try {
        if (DB_MODE === 'supabase') {
          const { data, error } = await supabase
            .from('capacidad_rys')
            .select('*')
            .order('periodo_ingreso_op', { ascending: false })
          if (!error && Array.isArray(data) && data.length > 0 && isMounted) {
            setCapacidadGrupos(data)
          }
        }
      } catch (e) {
        console.warn('Error loading capacidad_rys direct in AsistenciaForm:', e)
      }
    }
    loadCapacidadDirect()
    return () => { isMounted = false }
  }, [])

  useEffect(() => {
    getEquipoFormacion().then(data => {
      setEquipoFormacionData(data || [])
    }).catch(() => {})
  }, [])

  const allFormadores = useMemo(() => {
    const map = new Map()
    ;(equipoFormacionData || []).forEach(f => {
      const doc = String(f.documento || '').trim()
      if (doc) {
        map.set(doc, {
          documento: doc,
          nombre_completo: f.datos_completos || f.nombres_completos || f.nombre_completo || '',
          datos_completos: f.datos_completos || f.nombres_completos || f.nombre_completo || '',
          nombres_completos: f.datos_completos || f.nombres_completos || f.nombre_completo || '',
          segmento: f.segmento || '',
          subcampana: f.subcampana || ''
        })
      }
    })
    ;(formadores || []).forEach(f => {
      const doc = String(f.documento || f.dni || '').trim()
      if (doc) {
        const existing = map.get(doc) || {}
        map.set(doc, {
          documento: doc,
          nombre_completo: f.nombre_completo || f.datos_completos || f.nombres_completos || existing.nombre_completo || '',
          datos_completos: f.nombre_completo || f.datos_completos || f.nombres_completos || existing.datos_completos || '',
          nombres_completos: f.nombre_completo || f.datos_completos || f.nombres_completos || existing.nombres_completos || '',
          segmento: f.segmento || existing.segmento || '',
          subcampana: f.subcampana || existing.subcampana || ''
        })
      }
    })
    return Array.from(map.values())
  }, [formadores, equipoFormacionData])

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

  // ── 1. Cascading filter collections alimentados de Capacidad R&S ──
  const allGrupos = useMemo(() => {
    return (Array.isArray(capacidadGrupos) && capacidadGrupos.length > 0) ? capacidadGrupos : (Array.isArray(grupos) ? grupos : [])
  }, [capacidadGrupos, grupos])

  const periodos = useMemo(() => {
    const set = new Set()
    allGrupos.forEach(g => {
      const p = getCapacidadPeriodo(g)
      if (p) set.add(p)
      const pRaw = normalize2026Period(g.periodo || g.periodo_rys)
      if (pRaw) set.add(pRaw)
    })
    return [...set].filter(p => /^\d{6}$/.test(p) || p.length > 0).sort((a, b) => b.localeCompare(a))
  }, [allGrupos])

  const semanas = useMemo(() => {
    let filtered = allGrupos
    if (selectedPeriodo) filtered = filtered.filter(g => isGrupoPeriodoMatch(g, selectedPeriodo))
    const list = filtered.map(g => getSemanaLabel(g)).filter(Boolean)
    return [...new Set(list)].sort((a, b) => {
      const numA = parseInt(a.replace(/\D/g, ''), 10) || 0
      const numB = parseInt(b.replace(/\D/g, ''), 10) || 0
      return numB - numA
    })
  }, [allGrupos, selectedPeriodo])

  const segmentos = useMemo(() => {
    let filtered = allGrupos
    if (selectedPeriodo) filtered = filtered.filter(g => isGrupoPeriodoMatch(g, selectedPeriodo))
    if (selectedSemana) filtered = filtered.filter(g => matchSemana(getSemanaLabel(g), selectedSemana))
    return [...new Set(filtered.map(g => normalizeSegmento(g.segmento, g.campana)).filter(Boolean))].sort()
  }, [allGrupos, selectedPeriodo, selectedSemana])

  const campanas = useMemo(() => {
    let filtered = allGrupos
    if (selectedPeriodo) filtered = filtered.filter(g => isGrupoPeriodoMatch(g, selectedPeriodo))
    if (selectedSemana) filtered = filtered.filter(g => matchSemana(getSemanaLabel(g), selectedSemana))
    if (selectedSegmento) filtered = filtered.filter(g => isGrupoSegmentoMatch(g, selectedSegmento))
    return [...new Set(filtered.map(g => g.campana ? String(g.campana).trim() : null).filter(Boolean))].sort()
  }, [allGrupos, selectedPeriodo, selectedSemana, selectedSegmento])

  const modalidades = useMemo(() => {
    let filtered = allGrupos
    if (selectedPeriodo) filtered = filtered.filter(g => isGrupoPeriodoMatch(g, selectedPeriodo))
    if (selectedSemana) filtered = filtered.filter(g => matchSemana(getSemanaLabel(g), selectedSemana))
    if (selectedSegmento) filtered = filtered.filter(g => isGrupoSegmentoMatch(g, selectedSegmento))
    if (selectedCampana) filtered = filtered.filter(g => String(g.campana).trim() === String(selectedCampana).trim())
    return [...new Set(filtered.map(g => g.modalidad ? String(g.modalidad).trim().toUpperCase() : null).filter(Boolean))].sort()
  }, [allGrupos, selectedPeriodo, selectedSemana, selectedSegmento, selectedCampana])

  const gruposFiltrados = useMemo(() => {
    let filtered = allGrupos
    if (selectedPeriodo) filtered = filtered.filter(g => isGrupoPeriodoMatch(g, selectedPeriodo))
    if (selectedSemana) filtered = filtered.filter(g => matchSemana(getSemanaLabel(g), selectedSemana))
    if (selectedSegmento) filtered = filtered.filter(g => isGrupoSegmentoMatch(g, selectedSegmento))
    if (selectedCampana) filtered = filtered.filter(g => String(g.campana).trim() === String(selectedCampana).trim())
    if (selectedModalidad) filtered = filtered.filter(g => String(g.modalidad || '').trim().toUpperCase() === String(selectedModalidad).trim().toUpperCase())
    
    const unique = [];
    const seen = new Set();
    for (const g of filtered) {
      if (!g.codigo) continue;
      const cleanCod = String(g.codigo).trim().toUpperCase();
      const uniqueKey = `${cleanCod}_${g.campana || ''}_${getCapacidadPeriodo(g)}_${getSemanaLabel(g)}`;
      if (!seen.has(uniqueKey)) {
        seen.add(uniqueKey);
        unique.push(g);
      }
    }
    return unique.sort((a,b) => String(a.codigo).localeCompare(String(b.codigo)));
  }, [allGrupos, selectedPeriodo, selectedSemana, selectedSegmento, selectedCampana, selectedModalidad])

  const activeGrupoObj = useMemo(() => {
    if (!selectedGrupo) return null;
    const cleanSel = String(selectedGrupo).trim().toUpperCase();
    const match = gruposFiltrados.find(g => 
      String(g.id || '').toUpperCase() === cleanSel || 
      String(g.codigo || '').toUpperCase() === cleanSel
    );
    if (match) return match;
    return allGrupos.find(g => 
      (String(g.id || '').toUpperCase() === cleanSel || String(g.codigo || '').toUpperCase() === cleanSel) && 
      (!selectedCampana || String(g.campana).trim() === String(selectedCampana).trim()) &&
      (!selectedPeriodo || isGrupoPeriodoMatch(g, selectedPeriodo)) &&
      (!selectedSemana || matchSemana(getSemanaLabel(g), selectedSemana))
    );
  }, [allGrupos, gruposFiltrados, selectedGrupo, selectedCampana, selectedPeriodo, selectedSemana])

  const effectiveGrupoObj = useMemo(() => {
    if (!activeGrupoObj && !liveGrupoMeta) return null;
    return {
      ...(activeGrupoObj || {}),
      ...(liveGrupoMeta || {}),
      formador_documento: liveGrupoMeta?.formador_documento || activeGrupoObj?.formador_documento || '',
      formador_nombre: liveGrupoMeta?.formador_nombre || activeGrupoObj?.formador_nombre || activeGrupoObj?.formador || ''
    };
  }, [activeGrupoObj, liveGrupoMeta]);

  // ── Control de Permisos y Llave por Segmento ────────────────────
  const currentEffectiveRole = String(userRole || userProfile?.rol || 'admin').toLowerCase().trim()
  const isSuperAdmin = ['admin', 'supervisor_capacitacion', 'coordinador_capacitacion', 'jefe_capacitacion', 'coordinador_rys', 'jefe_rys', 'calidad'].includes(currentEffectiveRole)
  const isReclutador = currentEffectiveRole === 'reclutador'
  const isFormador = currentEffectiveRole === 'formador'

  const userSegmento = useMemo(() => {
    return resolveFormadorSegment(userProfile, allFormadores)
  }, [userProfile, allFormadores])

  const grupoSegmento = useMemo(() => {
    const rawSeg = effectiveGrupoObj?.segmento || selectedSegmento || ''
    const rawCamp = effectiveGrupoObj?.campana || selectedCampana || ''
    return normalizeSegmento(rawSeg, rawCamp)
  }, [effectiveGrupoObj, selectedSegmento, selectedCampana])

  const { isReadOnly, readOnlyReason } = useMemo(() => {
    if (isSuperAdmin || isFormador) {
      return { isReadOnly: false, readOnlyReason: null }
    }
    if (isReclutador) {
      return {
        isReadOnly: true,
        readOnlyReason: 'VISTA_INFORMATIVA_RECLUTAMIENTO'
      }
    }
    return { isReadOnly: false, readOnlyReason: null }
  }, [isSuperAdmin, isReclutador, isFormador])

  // Explicit user-driven cascading filter handlers (avoid wiping localStorage restored values on mount)
  const handlePeriodoChange = (val) => {
    setSelectedPeriodo(val)
    setSelectedSemana('')
    setSelectedSegmento('')
    setSelectedCampana('')
    setSelectedModalidad('')
    setSelectedGrupo('')
  }
  const handleSemanaChange = (val) => {
    setSelectedSemana(val)
    setSelectedSegmento('')
    setSelectedCampana('')
    setSelectedModalidad('')
    setSelectedGrupo('')
  }
  const handleSegmentoChange = (val) => {
    setSelectedSegmento(val)
    setSelectedCampana('')
    setSelectedModalidad('')
    setSelectedGrupo('')
  }
  const handleCampanaChange = (val) => {
    setSelectedCampana(val)
    setSelectedModalidad('')
    setSelectedGrupo('')
  }
  const handleModalidadChange = (val) => {
    setSelectedModalidad(val)
    setSelectedGrupo('')
  }
  const handleGrupoChange = (val) => {
    if (val && val.includes(':::')) {
      const [code, camp] = val.split(':::')
      setSelectedGrupo(code)
      if (camp) setSelectedCampana(camp)
    } else {
      setSelectedGrupo(val)
      const match = gruposFiltrados.find(g => normalize(g.codigo) === normalize(val) || normalize(g.id) === normalize(val))
      if (match?.campana && (!selectedCampana || selectedCampana === 'Todas')) {
        setSelectedCampana(match.campana)
      }
    }
  }

  useEffect(() => {
    if (gruposFiltrados.length === 1 && !selectedGrupo) setSelectedGrupo(gruposFiltrados[0].id || gruposFiltrados[0].codigo)
  }, [gruposFiltrados, selectedGrupo])

  // Auto-sugerir corte según el horario del grupo activo
  useEffect(() => {
    if (!activeGrupoObj) return
    const rangoHorario = activeGrupoObj.rango_horario || activeGrupoObj.horario || activeGrupoObj.turno || ''
    const suggested = getSuggestedCorte(rangoHorario)
    setSelectedCorte(suggested)
  }, [activeGrupoObj])

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

  // Auto-set Date: default to today, avoid jumping automatically to past historical dates
  useEffect(() => {
    if (!activeGrupoObj) return;

    const groupKey = `${activeGrupoObj.codigo}_${activeGrupoObj.periodo || ''}_${getSemanaLabel(activeGrupoObj)}`;
    if (lastSetGrupo.current === groupKey) return;
    lastSetGrupo.current = groupKey;

    if (!fecha) {
      setFecha(new Date().toISOString().split('T')[0]);
    }
  }, [activeGrupoObj, fecha]);

  const [groupPostulantesDirect, setGroupPostulantesDirect] = useState([]);

  useEffect(() => {
    if (!selectedGrupo) {
      setGroupPostulantesDirect([]);
      return;
    }
    const targetGrupoCodigo = String(activeGrupoObj?.codigo || selectedGrupo).trim();
    const targetCampana = String(activeGrupoObj?.campana || selectedCampana || '').trim();
    const targetPeriodo = String(getCapacidadPeriodo(activeGrupoObj) || activeGrupoObj?.periodo || selectedPeriodo || '').replace(/\D/g, '').trim();
    const targetSemanaRaw = activeGrupoObj?.semana_trabajo || activeGrupoObj?.semana_label || selectedSemana || '';
    const targetSemanaNum = parseInt(String(targetSemanaRaw).replace(/\D/g, ''), 10);

    if (DB_MODE === 'supabase') {
      let isMounted = true;
      (async () => {
        try {
          // Búsqueda delimitada por Grupo + Semana + Periodo alimentado desde Capacidad R&S
          let q1 = supabase
            .from('v_nominas_consolidado')
            .select('*')
            .eq('grupo_codigo', targetGrupoCodigo)
          if (targetPeriodo) {
            q1 = q1.eq('periodo_reclutado', targetPeriodo)
          }
          if (!isNaN(targetSemanaNum) && targetSemanaNum > 0) {
            q1 = q1.eq('semana_trabajo', targetSemanaNum)
          }
          if (targetCampana && targetCampana !== 'Sin Campaña' && targetCampana !== 'Todas') {
            q1 = q1.eq('campana', targetCampana)
          }

          let qNom = supabase
            .from('nominas')
            .select('*')
            .eq('grupo_codigo', targetGrupoCodigo)
          if (targetPeriodo) {
            qNom = qNom.eq('periodo_reclutado', targetPeriodo)
          }
          if (!isNaN(targetSemanaNum) && targetSemanaNum > 0) {
            qNom = qNom.eq('semana_trabajo', targetSemanaNum)
          }
          if (targetCampana && targetCampana !== 'Sin Campaña' && targetCampana !== 'Todas') {
            qNom = qNom.eq('campana', targetCampana)
          }

          let qCap = supabase
            .from('capacidad_rys')
            .select('*')
            .eq('codigo', targetGrupoCodigo);
          if (targetCampana && targetCampana !== 'Sin Campaña' && targetCampana !== 'Todas') {
            qCap = qCap.eq('campana', targetCampana);
          }

          const [res1, resNom, resCap, descSet] = await Promise.all([
            q1,
            qNom,
            qCap,
            fetchDescuentosAprobadosSet(targetGrupoCodigo, targetCampana)
          ]).catch(err => {
            console.error('Error al cargar postulantes del grupo:', err);
            return [{ data: [] }, { data: [] }, { data: [] }, new Set()];
          });

          let dataQ1 = res1?.data || [];
          let dataNom = resNom?.data || [];
          let dataCap = resCap?.data || [];
          const approvedDescuentos = descSet instanceof Set ? descSet : new Set();

          if (!isMounted) return;

          setDescuentosAprobadosSet(approvedDescuentos);

          if (dataCap && dataCap.length > 0) {
            setLiveGrupoMeta(dataCap[0]);
          } else {
            setLiveGrupoMeta(null);
          }

          const isRowMatchWeekAndPeriod = (row) => {
            if (targetCampana && targetCampana !== 'Sin Campaña' && targetCampana !== 'Todas') {
              if (row.campana && normalize(row.campana) !== normalize(targetCampana)) return false
            }
            if (!isNaN(targetSemanaNum) && targetSemanaNum > 0) {
              const rSem = parseInt(String(row.semana_trabajo || row.semana || '').replace(/\D/g, ''), 10)
              if (!isNaN(rSem) && rSem !== targetSemanaNum) return false
            }
            if (targetPeriodo) {
              const rPerRec = String(row.periodo_reclutado || '').replace(/\D/g, '')
              const rPerIng = String(row.periodo_ingreso_op || row.grupo_periodo || '').replace(/\D/g, '')
              const matchRec = rPerRec && (rPerRec.includes(targetPeriodo) || targetPeriodo.includes(rPerRec))
              const matchIng = rPerIng && (rPerIng.includes(targetPeriodo) || targetPeriodo.includes(rPerIng))
              if (!matchRec && !matchIng) return false
            }
            return true
          }

          const docMap = new Map();
          const filteredQ1 = dataQ1.filter(isRowMatchWeekAndPeriod);
          const filteredNom = dataNom.filter(isRowMatchWeekAndPeriod);

          // 1. Postulantes de v_nominas_consolidado (excluyendo descuentos aprobados o registrados)
          filteredQ1.forEach(row => {
            const doc = String(row.documento || '').trim();
            if (doc) {
              const isDesc = approvedDescuentos.has(doc) || 
                             approvedDescuentos.has(`DNI:${doc}`) ||
                             isDescuentoAprobado(row) || 
                             String(row.estado || '').toUpperCase() === 'DESCUENTO' ||
                             String(row.motivo_baja || '').toUpperCase().includes('DESCUENTO');
              if (isDesc) return;

              docMap.set(row.documento, {
                ...row,
                motivo_baja: row.motivo_baja || '',
                campaign: row.campana,
                observacion: row.observacion_reclutamiento
              });
            }
          });

          // 2. Postulantes directos de tabla nominas (fuente de verdad oficial, excluyendo descuentos aprobados o registrados)
          filteredNom.forEach(row => {
            const doc = String(row.documento || '').trim();
            if (doc) {
              const isDesc = approvedDescuentos.has(doc) || 
                             approvedDescuentos.has(`DNI:${doc}`) ||
                             isDescuentoAprobado(row) || 
                             String(row.estado || '').toUpperCase() === 'DESCUENTO' ||
                             String(row.motivo_baja || '').toUpperCase().includes('DESCUENTO');
              if (isDesc) return;

              docMap.set(row.documento, {
                ...row,
                motivo_baja: row.motivo_baja || '',
                campaign: row.campana,
                observacion: row.observacion_reclutamiento
              });
            }
          });

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
    let list = groupPostulantesDirect.length > 0 ? groupPostulantesDirect : postulantes;
    // Si caemos en el fallback global de postulantes, filtrar estrictamente por grupo y campaña
    if (groupPostulantesDirect.length === 0 && selectedGrupo) {
      const targetGrupoCodigo = String(activeGrupoObj?.codigo || selectedGrupo).trim();
      const targetCampana = String(activeGrupoObj?.campana || selectedCampana || '').trim();
      list = list.filter(p => {
        const matchGrupo = normalize(p.grupo_codigo) === normalize(targetGrupoCodigo) || 
                           normalize(p.grupo) === normalize(targetGrupoCodigo);
        if (!matchGrupo) return false;
        if (targetCampana && targetCampana !== 'Sin Campaña' && targetCampana !== 'Todas') {
          if (p.campana && normalize(p.campana) !== normalize(targetCampana)) return false;
        }
        return true;
      });
    }
    if (!descuentosAprobadosSet || descuentosAprobadosSet.size === 0) return list;
    return list.filter(p => {
      const doc = String(p.documento || '').trim();
      return !descuentosAprobadosSet.has(doc) && 
             !descuentosAprobadosSet.has(`DNI:${doc}`) &&
             String(p.estado || '').toUpperCase() !== 'DESCUENTO' &&
             !String(p.motivo_baja || '').toUpperCase().includes('DESCUENTO');
    });
  }, [postulantes, groupPostulantesDirect, descuentosAprobadosSet, selectedGrupo, activeGrupoObj, selectedCampana]);

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
    /** Misma fecha: varios cortes (C1/C2/C3) por documento */
    const sameDayRecordsByDoc = new Map()
    const previousRecordsByDoc = new Map()

    for (let i = 0; i < asistencias.length; i++) {
      const a = asistencias[i]
      const doc = String(a.postulante_documento || '').trim()
      const isDesc = descuentosAprobadosSet.has(doc) || 
                     descuentosAprobadosSet.has(`DNI:${doc}`) ||
                     isDescuentoAprobado(a) || 
                     String(a.estado || '').toUpperCase() === 'DESCUENTO' ||
                     String(a.motivo_baja || '').toUpperCase().includes('DESCUENTO')
      if (isDesc) continue

      const matchGrupo = normalize(a.grupo_codigo) === normalize(targetGroup) || normalize(a.grupo_codigo) === normalize(targetGrupoCodigo)
      if (!matchGrupo) continue
      if (targetCampana && a.campana && normalize(a.campana) !== normalize(targetCampana)) continue
      if (!isNaN(targetSemanaNum) && targetSemanaNum > 0 && a.archivo_origen) {
        const aSem = parseInt(String(a.archivo_origen).replace(/\D/g, ''), 10)
        if (!isNaN(aSem) && aSem !== targetSemanaNum) continue
      }
      if (targetPeriodo && (a.periodo || a.periodo_reclutado)) {
        const aPer = String(a.periodo || a.periodo_reclutado || '').replace(/\D/g, '').trim()
        if (aPer && aPer !== targetPeriodo && !aPer.includes(targetPeriodo) && !targetPeriodo.includes(aPer)) continue
      }

      const recFecha = parseFechaAsistencia(a.fecha_asistencia || a.fecha_registro_asistencia || a.fecha) || a.fecha_asistencia
      if (!recFecha) continue

      groupRecordsAll.push(a)
      mappedDocs.add(a.postulante_documento)

      if (recFecha === fecha) {
        let dayArr = sameDayRecordsByDoc.get(a.postulante_documento)
        if (!dayArr) {
          dayArr = []
          sameDayRecordsByDoc.set(a.postulante_documento, dayArr)
        }
        dayArr.push(a)
      } else if (recFecha < fecha) {
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
        arr.sort((a, b) => {
          const fa = parseFechaAsistencia(a.fecha_asistencia || a.fecha_registro_asistencia || a.fecha) || a.fecha_asistencia || ''
          const fb = parseFechaAsistencia(b.fecha_asistencia || b.fecha_registro_asistencia || b.fecha) || b.fecha_asistencia || ''
          return fb.localeCompare(fa)
        })
      }
    }

    // 1. Fechas históricas y determinación de la fecha oficial de Día 1
    const groupDates = Array.from(new Set(groupRecordsAll.map(a => parseFechaAsistencia(a.fecha_asistencia || a.fecha_registro_asistencia || a.fecha) || a.fecha_asistencia).filter(Boolean))).sort()
    const rawGroupStart = activeGrupoObj?.fecha_registro || activeGrupoObj?.fecha_inicio_capacitacion || ''
    const groupStartDate = parseFechaAsistencia(rawGroupStart) || rawGroupStart || ''
    let firstDateOfGroup = groupDates.length > 0 ? groupDates[0] : groupStartDate
    if (groupStartDate && (!firstDateOfGroup || groupStartDate < firstDateOfGroup)) {
      firstDateOfGroup = groupStartDate
    }
    const isDay2OrLater = Boolean(firstDateOfGroup && fecha > firstDateOfGroup)

    // Ensure all historical attendees from asistencias are present in candidate pool
    const candidateDocs = new Set();
    const mergedCandidates = [];

    // Identificar postulantes con asistencia confirmada (A o I-OP) en este grupo
    const activeAttendeeDocs = new Set();
    for (const a of groupRecordsAll) {
      const s = String(a.sigla_asistencia || a.sigla || '').trim().toUpperCase();
      if (s === 'A' || s === 'I-OP') {
        activeAttendeeDocs.add(String(a.postulante_documento || '').trim());
      }
    }

    // Identificar postulantes que fueron BAJA DIA 1 en Día 1 sin asistencia confirmada en formación
    const bajaDia1CandidateDocs = new Set();
    for (const a of groupRecordsAll) {
      const doc = String(a.postulante_documento || a.documento || '').trim();
      const s = String(a.sigla_asistencia || a.sigla || '').trim().toUpperCase();
      const m = String(a.motivo_baja || '').trim();
      if (s === 'B' && isBajaDia1Motivo(m) && !activeAttendeeDocs.has(doc)) {
        bajaDia1CandidateDocs.add(doc);
      }
    }
    for (const p of effectivePostulantes) {
      const doc = String(p.documento || '').trim();
      const dia1Val = String(p.dia_1 || '').toUpperCase().trim();
      const stVal = String(p.status_dia_1 || '').toUpperCase().trim();
      if (!activeAttendeeDocs.has(doc) && (dia1Val === 'FALTA' || dia1Val === 'NO ASISTIO') && (stVal.includes('CESE') || isBajaDia1Motivo(p.motivo_baja))) {
        bajaDia1CandidateDocs.add(doc);
      }
    }

    for (const p of effectivePostulantes) {
      const doc = String(p.documento || '').trim();
      if (targetCampana && targetCampana !== 'Sin Campaña' && targetCampana !== 'Todas') {
        if (p.campana && normalize(p.campana) !== normalize(targetCampana)) continue;
      }
      // Regla de Negocio: A partir de Día 2, las Bajas Día 1 no existen en Formación
      if (isDay2OrLater && bajaDia1CandidateDocs.has(doc) && !activeAttendeeDocs.has(doc)) {
        continue;
      }
      const hasActiveInGroup = activeAttendeeDocs.has(doc);
      const isDesc = !hasActiveInGroup && (
                     descuentosAprobadosSet.has(doc) || 
                     descuentosAprobadosSet.has(`DNI:${doc}`) ||
                     isDescuentoAprobado(p) || 
                     String(p.estado || '').toUpperCase() === 'DESCUENTO' ||
                     String(p.motivo_baja || '').toUpperCase().includes('DESCUENTO'));
      if (!isDesc) {
        candidateDocs.add(p.documento);
        mergedCandidates.push(p);
      }
    }

    for (const a of groupRecordsAll) {
      const doc = String(a.postulante_documento || '').trim();
      if (targetCampana && targetCampana !== 'Sin Campaña' && targetCampana !== 'Todas') {
        if (a.campana && normalize(a.campana) !== normalize(targetCampana)) continue;
      }
      // Regla de Negocio: A partir de Día 2, las Bajas Día 1 no existen en Formación
      if (isDay2OrLater && bajaDia1CandidateDocs.has(doc) && !activeAttendeeDocs.has(doc)) {
        continue;
      }
      const hasActiveInGroup = activeAttendeeDocs.has(doc);
      const isDesc = !hasActiveInGroup && (
                     descuentosAprobadosSet.has(doc) || 
                     descuentosAprobadosSet.has(`DNI:${doc}`) ||
                     isDescuentoAprobado(a) || 
                     String(a.estado || '').toUpperCase() === 'DESCUENTO' ||
                     String(a.motivo_baja || '').toUpperCase().includes('DESCUENTO'));
      if (isDesc) continue;

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
          estado: a.estado || 'ACTIVO',
          activo: true
        });
      }
    }

    const invalidList = []
    const filteredPostulantes = mergedCandidates.filter(p => {
      if (!p.documento) return false
      const doc = String(p.documento || '').trim();
      // En Día 2+, excluir bajas de Día 1 de RyS
      if (isDay2OrLater && bajaDia1CandidateDocs.has(doc) && !activeAttendeeDocs.has(doc)) {
        return false;
      }
      const hasHistoryInGroup = mappedDocs.has(p.documento);
      const hasActiveInGroup = activeAttendeeDocs.has(doc);

      // Si se definió campaña objetivo para el grupo, filtrar estrictamente para evitar mezclar postulantes de grupos homónimos
      if (targetCampana && targetCampana !== 'Sin Campaña' && targetCampana !== 'Todas') {
        if (p.campana && normalize(p.campana) !== normalize(targetCampana)) {
          return false;
        }
      }

      // Si ya tiene registros de asistencia en el grupo, siempre debe aparecer en el grupo
      if (hasHistoryInGroup || hasActiveInGroup) {
        return true;
      }

      const isDesc = descuentosAprobadosSet.has(doc) || 
                     descuentosAprobadosSet.has(`DNI:${doc}`) ||
                     isDescuentoAprobado(p) || 
                     String(p.estado || '').toUpperCase() === 'DESCUENTO' ||
                     String(p.motivo_baja || '').toUpperCase().includes('DESCUENTO');
      if (isDesc) return false;

      if (String(p.estado || '').toUpperCase() === 'DESASIGNADO') return false

      const isGrupoMatch = 
        normalize(p.grupo_codigo) === normalize(targetGroup) || 
        normalize(p.grupo_codigo) === normalize(targetGrupoCodigo) ||
        normalize(p.grupo) === normalize(targetGroup) ||
        normalize(p.grupo) === normalize(targetGrupoCodigo) ||
        (p.grupo && normalize(p.grupo).startsWith(normalize(targetGrupoCodigo)))

      if (!isGrupoMatch && !hasHistoryInGroup) {
        return false
      }

      // Validar coincidencia estricta de semana para nuevos postulantes sin historial previo
      if (!isNaN(targetSemanaNum) && targetSemanaNum > 0 && p.semana_trabajo) {
        const rowSemanaNum = parseInt(String(p.semana_trabajo).replace(/\D/g, ''), 10)
        if (!isNaN(rowSemanaNum) && rowSemanaNum !== targetSemanaNum) {
          return false
        }
      }

      // Regla de Negocio Oficial:
      // 1. Regular: Si el reclutador marcó ASISTIO en Día 0 -> Viaja a la marcación (incluye RECUPERO CAP)
      // 2. Extemporáneo / Reenganche: Si tuvo FALTA en Día 0 pero tiene AGREGADO / RECUPERADO / OBSERVADO o ASISTIO en Día 1 -> Viaja a la marcación
      const dia0Val = String(p.dia_0 || '').toUpperCase().trim()
      const dia1Val = String(p.dia_1 || '').toUpperCase().trim()
      const statusDia1Val = String(p.status_dia_1 || '').toUpperCase().trim()
      const tipoReclutadoVal = String(p.tipo_reclutado || '').toUpperCase().trim()

      const asistioD0 = isAsistioStr(dia0Val)
      const asistioD1 = isAsistioStr(dia1Val)
      const isAgregadoORecuperado = statusDia1Val.includes('AGREGADO') || statusDia1Val.includes('RECUPERADO') || statusDia1Val.includes('OBSERVAD') || tipoReclutadoVal.includes('AGREGADO') || tipoReclutadoVal.includes('RECUPERADO') || tipoReclutadoVal.includes('OBSERVAD')
      const isRecuperoCap = tipoReclutadoVal.includes('RECUPERO') || statusDia1Val.includes('RECUPERO')
      const isCese = statusDia1Val.includes('CESE') || tipoReclutadoVal.includes('CESE') || String(p.estado || '').toUpperCase().includes('CESE') || String(p.estado || '').toUpperCase().includes('DESER')

      if (isCese && !asistioD1) {
        return false
      }

      if (asistioD0 || isRecuperoCap) {
        return true
      }

      if (asistioD1 && !isCese) {
        return true
      }

      if (isAgregadoORecuperado && asistioD1) {
        return true
      }

      return false
    })
    
    setMissingDataCandidates([])

    const isFirstRecordGroup = groupRecordsAll.length === 0 || (firstDateOfGroup && fecha <= firstDateOfGroup)

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
    const formadoresMap = new Map(formadores.map(f => [
      String(f.documento || f.dni || '').trim(),
      (f.nombre_completo || f.datos_completos || f.nombres_completos || '').trim()
    ]))

    const allDates = Array.from(new Set([...groupDates, fecha])).sort()
    const trainingDayIndex = allDates.indexOf(fecha) + 1

    // Corte legacy (null/0/vacío) = Corte 1 del Día 1 (datos guardados antes del multi-corte)
    const normCorteVal = (raw) => {
      const n = Number(raw)
      if (!Number.isFinite(n) || n <= 0) return 1
      return n
    }

    const list = uniquePostulantes.map(p => {
      const isLateInclusion = false
      const dayRecs = sameDayRecordsByDoc.get(p.documento) || []
      const currentCorte = Number(selectedCorte) || 1

      // Registro del corte activo
      const existing = dayRecs.find(r => normCorteVal(r.corte) === currentCorte) || null

      // Último registro de un corte ANTERIOR del mismo día (C1 → C2/C3)
      const earlierSameDay = [...dayRecs]
        .filter(r => normCorteVal(r.corte) < currentCorte)
        .sort((a, b) => normCorteVal(b.corte) - normCorteVal(a.corte))

      const sameDayEarlierBaja = earlierSameDay.find(r => {
        const s = String(r.sigla_asistencia || r.sigla || '').toUpperCase().trim()
        return s === 'B'
      }) || null
      const latestEarlierSameDay = earlierSameDay[0] || null

      const corteFlagsToday = analyzeDia1CorteRecords(dayRecs, existing || latestEarlierSameDay)
      const hadAttendanceInEarlierCuts = Boolean(corteFlagsToday.hadAttendanceInEarlierCuts)
      
      let rawTipo = (existing?.tipo_reclutado || p.tipo_reclutado || p.status_dia_1 || p.tipo || '').toString().toUpperCase().trim() || 'APTO'
      const dia0Val = (p.dia_0 || '').toString().toUpperCase().trim()
      const dia1Val = (p.dia_1 || '').toString().toUpperCase().trim()
      if ((dia0Val === 'FALTA' || dia0Val === 'NO ASISTIO' || dia0Val === 'DESERTO' || !dia0Val) && dia1Val === 'ASISTIO' && rawTipo === 'APTO') {
        rawTipo = 'AGREGADO'
      }
      if (String(p.estado || '').toUpperCase().includes('OBSERVAD') || String(p.condicion || '').toUpperCase().includes('OBSERVAD') || String(p.status_dia_1 || '').toUpperCase().includes('OBSERVAD')) {
        if (rawTipo === 'APTO') rawTipo = 'OBSERVADO'
      }

      const prevList = previousRecordsByDoc.get(p.documento) || []
      const pastBajaRecord = sameDayEarlierBaja || prevList.find(r => (r.sigla_asistencia || r.sigla) === 'B')
      const pastIopRecord = prevList.find(r => (r.sigla_asistencia || r.sigla) === 'I-OP')
      const pastMotiveFromRecords = pastBajaRecord?.motivo_baja
        || prevList.find(r => r.motivo_baja && String(r.motivo_baja).trim() !== '' && String(r.motivo_baja).trim() !== 'null')?.motivo_baja
        || ''

      // Verificar si tuvo asistencia activa efectiva en el Día 1 (días previos o cortes C1/C2 de hoy)
      const hadDia1Attendance = hadAttendanceInEarlierCuts || prevList.some(r => {
        const s = (r.sigla_asistencia || r.sigla || '').toUpperCase().trim()
        return s === 'A' || s === 'I-OP'
      })

      if ((existing && (existing.sigla_asistencia === 'B' || existing.sigla === 'B')) || pastBajaRecord || p.estado === 'CESADO' || p.estado === 'BAJA') {
        if (rawTipo === 'APTO' || !rawTipo || rawTipo === 'CESADO') {
          rawTipo = 'CESE'
        }
      }
      const tipoReclutado = rawTipo

      const isIngresoEspecial = tipoReclutado === 'AGREGADO' || tipoReclutado === 'RECUPERADO' || tipoReclutado === 'OBSERVADO' || String(p.estado || '').toUpperCase().includes('OBSERVAD')

      const profileRow = {
        tipo_reclutado: tipoReclutado,
        tipoReclutado,
        status_dia_1: p.status_dia_1,
        estado: p.estado,
        condicion: p.condicion,
        hadDia1Attendance,
        hadAttendanceInEarlierCuts,
      }
      // Se permite BAJA DIA 1 en Día 1 (Cortes 1-2), o en Día 2 para perfiles distintos a APTO sin asistencia en Día 1 (periodo de gracia)
      // En Corte 3: el formador debe registrar la baja con motivo propio de formación — NO se clasifica como BAJA DIA 1
      const isCorte3 = selectedCorte === 3
      const isEligibleBajaD1 = canAssignBajaDia1({
        trainingDayIndex,
        row: profileRow,
        hadDia1Attendance,
        hadAttendanceInEarlierCuts,
        existingMotivo: '',
        corte: selectedCorte,
      })
      const showBajaDia1Option = isEligibleBajaD1 && !isCorte3
      const allowOtherMotivos = true

      const docFormador = String(p.formador_documento || effectiveGrupoObj?.formador_documento || '').trim()
      const nombreFormador = resolveFormadorDisplayName(allFormadores, docFormador, effectiveGrupoObj?.formador_nombre || effectiveGrupoObj?.formador || '')

      let inheritedSigla = 'A'
      let inheritedMotivo = ''

      if (existing && (existing.sigla_asistencia === 'B' || existing.sigla === 'B')) {
        // 1. Registro explícito de baja del corte actual
        inheritedSigla = 'B'
        inheritedMotivo = existing.motivo_baja || pastMotiveFromRecords || ''
      } else if (pastBajaRecord) {
        // 2. Baja en corte anterior del mismo día (C1→C2/C3) o en fecha previa del grupo
        inheritedSigla = 'B'
        inheritedMotivo = pastBajaRecord.motivo_baja || pastMotiveFromRecords || ''
      } else if (existing) {
        // 3. Registro explícito del corte actual (A / FI / FJ / I-OP)
        inheritedSigla = existing.sigla_asistencia || existing.sigla || 'A'
        inheritedMotivo = existing.motivo_baja || ''
      } else if (latestEarlierSameDay) {
        // 4. Sin guardado en este corte: heredar estado del corte previo del mismo día (no resetear a A)
        const earlierSigla = String(latestEarlierSameDay.sigla_asistencia || latestEarlierSameDay.sigla || 'A').toUpperCase().trim()
        inheritedSigla = earlierSigla || 'A'
        inheritedMotivo = earlierSigla === 'B' ? (latestEarlierSameDay.motivo_baja || '') : ''
      } else if (pastIopRecord) {
        inheritedSigla = 'I-OP'
        inheritedMotivo = ''
      } else if (prevList && prevList.length > 0) {
        const lastPrev = prevList[0]
        const lastSigla = lastPrev.sigla_asistencia || lastPrev.sigla || 'A'
        if (lastSigla === 'B') {
          inheritedSigla = 'B'
          inheritedMotivo = lastPrev.motivo_baja || pastMotiveFromRecords || ''
        } else if (lastSigla === 'I-OP') {
          inheritedSigla = 'I-OP'
          inheritedMotivo = ''
        } else if (lastSigla === 'FI' || lastSigla === 'FJ') {
          inheritedSigla = lastSigla
          inheritedMotivo = ''
        } else {
          inheritedSigla = 'A'
          inheritedMotivo = ''
        }
      } else if (isIngresoEspecial && isFirstRecordGroup && !isAsistioStr(dia1Val) && !isAsistioStr(dia0Val)) {
        inheritedSigla = 'FI'
        inheritedMotivo = ''
      } else {
        // Pizarra limpia solo si no hay historial del día ni de días previos
        inheritedSigla = 'A'
        inheritedMotivo = ''
      }

      if (inheritedSigla === 'B' && !inheritedMotivo && pastMotiveFromRecords) {
        inheritedMotivo = pastMotiveFromRecords
      }

      // Baja heredada de C1/C2 conserva su motivo (incl. BAJA DIA 1).
      // Solo al MARCAR baja nueva en C3 se exige motivo de formación (sanitize en handleMotiveChange/save).
      const isLockedFromEarlierCorte = Boolean(sameDayEarlierBaja)
      if (inheritedSigla === 'B' && inheritedMotivo && !isLockedFromEarlierCorte && !pastBajaRecord) {
        inheritedMotivo = sanitizeBajaDia1Motivo({
          trainingDayIndex,
          row: profileRow,
          motivo: inheritedMotivo,
          hadDia1Attendance,
          hadAttendanceInEarlierCuts,
          corte: selectedCorte,
        })
      }
      
      let sigla = inheritedSigla
      let motivo_baja = inheritedMotivo

      // Bloquear baja: corte anterior del mismo día O fecha previa del grupo
      const isLockedBaja = Boolean(sameDayEarlierBaja || (pastBajaRecord && pastBajaRecord !== existing))
      const pastMotive = (sameDayEarlierBaja || pastBajaRecord)?.motivo_baja || pastMotiveFromRecords || ''
      const pastBajaDate = (sameDayEarlierBaja || pastBajaRecord)
        ? ((sameDayEarlierBaja || pastBajaRecord).fecha_asistencia
          || (sameDayEarlierBaja || pastBajaRecord).fecha_registro_asistencia
          || (sameDayEarlierBaja || pastBajaRecord).fecha)
        : ''

      // Edits locales solo aplican al corte activo; no sangrar C1→C2
      const editKey = `${p.documento}|${currentCorte}`
      if (userEditsRef.current.has(editKey) && !isLockedBaja) {
        const localEdit = userEditsRef.current.get(editKey)
        sigla = localEdit.sigla
        motivo_baja = localEdit.motivo_baja
      } else if (isLockedBaja) {
        sigla = 'B'
        // Conservar motivo histórico de la baja (BAJA DIA 1 de C1 debe verse en C2/C3 bloqueada)
        motivo_baja = pastMotive || inheritedMotivo || ''
      }

      const isHistoricalBaja = (existing && (existing.sigla_asistencia === 'B' || existing.sigla === 'B')) || (!existing && inheritedSigla === 'B')

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
        status_dia_1: p.status_dia_1 || '',
        trainingDayIndex,
        hadDia1Attendance,
        isEligibleBajaD1,
        showBajaDia1Option,
        allowOtherMotivos,
        hadAttendanceInEarlierCuts,
        sigla,
        motivo_baja,
        isLateInclusion,
        isLockedBaja,
        pastMotive,
        pastBajaDate,
        isFirstRecordGroup,
        isHistoricalBaja,
        isCorte3,
        corte: selectedCorte,
      }
    })

    setAttendanceList(list)
  }, [selectedGrupo, fecha, asistencias, effectivePostulantes, activeGrupoObj, formadores, dia1Calibrado, descuentosAprobadosSet, selectedCorte])

  // Casuística: Levantar baja de un postulante que asistió en un día posterior (ej. asistió Día 2)
  const handleLevantarBaja = useCallback(async (item) => {
    if (isReadOnly) return
    const doc = String(item.documento || '').trim()
    const pastDateRaw = item.pastBajaDate
    const pastDateFormatted = formatSpreadsheetDate(pastDateRaw) || pastDateRaw

    const confirmed = window.confirm(
      `¿Deseas levantar la baja de ${item.nombres}?\n\n` +
      `• Fecha anterior (${pastDateFormatted}): Se convertirá de BAJA a Falta Injustificada (FI).\n` +
      `• Fecha de hoy (${formatSpreadsheetDate(fecha)}): Se registrará Asistencia (A).\n` +
      `• Estado en Nómina: Volverá a estar ACTIVO.`
    )
    if (!confirmed) return

    try {
      setSaving(true)
      await levantarBajaPostulante({
        documento: doc,
        grupo_codigo: activeGrupoObj?.codigo || selectedGrupo,
        campana: activeGrupoObj?.campana || selectedCampana,
        fechaBaja: pastDateRaw,
        formadorNombre: effectiveGrupoObj?.formador_nombre || effectiveGrupoObj?.formador || '',
        formadorDoc: effectiveGrupoObj?.formador_documento || '',
        fechaHoy: fecha,
        postulanteInfo: item
      })

      // 1. Actualizar asistencias en memoria para que la fecha previa quede en FI
      const targetPastIso = parseFechaAsistencia(pastDateRaw) || pastDateRaw
      setAsistencias(prev => prev.map(a => {
        const aDoc = String(a.postulante_documento || a.documento || '').trim()
        const aFecha = parseFechaAsistencia(a.fecha_asistencia || a.fecha_registro_asistencia || a.fecha) || a.fecha_asistencia
        if (aDoc === doc && aFecha === targetPastIso) {
          return {
            ...a,
            sigla: 'FI',
            sigla_asistencia: 'FI',
            estado: 'ACTIVO',
            tipo_reclutado: 'APTO',
            motivo_baja: ''
          }
        }
        return a
      }))

      // 2. Actualizar lista de asistencia para que hoy quede A y desbloqueado
      setAttendanceList(prev => prev.map(it => {
        if (it.documento !== doc) return it
        return {
          ...it,
          sigla: 'A',
          motivo_baja: '',
          isLockedBaja: false,
          tipoReclutado: 'APTO'
        }
      }))

      userEditsRef.current.set(`${doc}|${selectedCorte}`, { sigla: 'A', motivo_baja: '' })

      toast.success('¡Baja levantada con éxito!', `${item.nombres} ahora tiene Falta Injustificada (FI) en el día previo y Asistencia (A) el día de hoy.`)
    } catch (err) {
      console.error('Error al levantar baja:', err)
      toast.error('Error al levantar baja', err.message || 'No se pudo actualizar el registro.')
    } finally {
      setSaving(false)
    }
  }, [isReadOnly, activeGrupoObj, selectedGrupo, selectedCampana, effectiveGrupoObj, fecha, toast, selectedCorte])

  const handleStatusChange = useCallback((doc, newSigla) => {
    if (isReadOnly) return
    const targetItem = attendanceList.find(i => i.documento === doc)
    if (targetItem?.isLockedBaja) {
      if (newSigla === 'A' || newSigla === 'I-OP') {
        handleLevantarBaja(targetItem)
      }
      return
    }
    const editKey = `${doc}|${selectedCorte}`
    setAttendanceList(prev => prev.map(item => {
      if (item.documento !== doc) return item
      // Al marcar B: motivo vacío → el formador elige de la lista predeterminada
      userEditsRef.current.set(editKey, { sigla: newSigla, motivo_baja: '' })
      return { ...item, sigla: newSigla, motivo_baja: '' }
    }))
  }, [isReadOnly, attendanceList, handleLevantarBaja, selectedCorte])

  const handleMotiveChange = useCallback((doc, newMotivo) => {
    if (isReadOnly) return
    setAttendanceList(prev => prev.map(item => {
      if (item.documento !== doc) return item
      if (item.isLockedBaja) return item
      const nextMotivo = sanitizeBajaDia1Motivo({
        trainingDayIndex: item.trainingDayIndex,
        row: item,
        hadDia1Attendance: item.hadDia1Attendance,
        hadAttendanceInEarlierCuts: item.hadAttendanceInEarlierCuts,
        motivo: newMotivo,
        corte: item.corte ?? selectedCorte,
      })
      if (isBajaDia1Motivo(newMotivo) && !nextMotivo) {
        toast.info(
          'Elige motivo de Formación',
          'En Corte 3 (o con A en C1/C2) no aplica BAJA DIA 1. Selecciona un motivo de la lista.'
        )
      }
      const editKey = `${doc}|${selectedCorte}`
      userEditsRef.current.set(editKey, { sigla: item.sigla, motivo_baja: nextMotivo })
      return { ...item, motivo_baja: nextMotivo }
    }))
  }, [isReadOnly, selectedCorte, toast])

  // Fast 1-click bulk mark as attended
  const handleMarkAllAttended = () => {
    if (isReadOnly) return
    setAttendanceList(prev => prev.map(item => {
      if (item.isLateInclusion || item.isLockedBaja || item.sigla === 'B' || item.sigla === 'I-OP') return item;
      userEditsRef.current.set(`${item.documento}|${selectedCorte}`, { sigla: 'A', motivo_baja: '' })
      return { ...item, sigla: 'A', motivo_baja: '' }
    }))
  }

  // ── Historial de fechas del grupo para regularización ──
  const groupDatesList = useMemo(() => {
    const targetGroup = activeGrupoObj?.codigo || selectedGrupo
    const targetCampana = activeGrupoObj?.campana || selectedCampana
    if (!targetGroup) return []
    const dates = asistencias
      .filter(a => {
        const matchG = normalize(a.grupo_codigo) === normalize(targetGroup) || normalize(a.codigo_grupo) === normalize(targetGroup)
        if (!matchG) return false
        if (targetCampana && a.campana && normalize(a.campana) !== normalize(targetCampana)) return false
        return true
      })
      .map(a => parseFechaAsistencia(a.fecha_asistencia || a.fecha_registro_asistencia || a.fecha) || a.fecha_asistencia)
      .filter(Boolean)
    if (fecha && !dates.includes(fecha)) dates.push(fecha)
    return Array.from(new Set(dates)).sort()
  }, [asistencias, activeGrupoObj, selectedGrupo, selectedCampana, fecha])

  // ── Detección de días laborales faltantes antes de la fecha activa (Gap Detection) ──
  const missingWorkingDays = useMemo(() => {
    const targetGroup = activeGrupoObj?.codigo || selectedGrupo
    const targetCampana = activeGrupoObj?.campana || selectedCampana
    if (!targetGroup || !fecha) return []

    // Identificar país del servicio (PERÚ o CHILE)
    const targetPais = resolveGrupoPais(activeGrupoObj, targetCampana)

    const recordedDatesSet = new Set(
      asistencias
        .filter(a => {
          const matchG = normalize(a.grupo_codigo) === normalize(targetGroup) || normalize(a.codigo_grupo) === normalize(targetGroup)
          if (!matchG) return false
          if (targetCampana && a.campana && normalize(a.campana) !== normalize(targetCampana)) return false
          return true
        })
        .map(a => parseFechaAsistencia(a.fecha_asistencia || a.fecha_registro_asistencia || a.fecha))
        .filter(Boolean)
    )

    let startDateIso = null
    const sortedRecorded = Array.from(recordedDatesSet).sort()
    if (sortedRecorded.length > 0) {
      startDateIso = sortedRecorded[0]
    }
    if (activeGrupoObj?.fecha_dia_1 && (!startDateIso || activeGrupoObj.fecha_dia_1 < startDateIso)) {
      startDateIso = activeGrupoObj.fecha_dia_1
    } else if (activeGrupoObj?.fecha_registro && (!startDateIso || activeGrupoObj.fecha_registro < startDateIso)) {
      startDateIso = activeGrupoObj.fecha_registro
    }

    if (!startDateIso || startDateIso >= fecha) return []

    const missing = []
    const [y, m, d] = startDateIso.split('-').map(Number)
    const cur = new Date(Date.UTC(y, m - 1, d))
    const [fy, fm, fd] = fecha.split('-').map(Number)
    const targetDate = new Date(Date.UTC(fy, fm - 1, fd))

    let safety = 0
    while (cur < targetDate && safety < 45) {
      const curIso = cur.toISOString().split('T')[0]
      const dayOfWeek = cur.getUTCDay()
      const isHoliday = isFeriadoNacional(curIso, targetPais)

      // Excluir domingos (0)
      // Si es feriado oficial del país del grupo (ej. 8/10 en Perú o 18/9 en Chile) y no hubo marcación, NO se considera día omitido
      if (dayOfWeek !== 0 && !recordedDatesSet.has(curIso) && !isHoliday && curIso < fecha) {
        missing.push(curIso)
      }
      cur.setUTCDate(cur.getUTCDate() + 1)
      safety++
    }

    return missing.sort()
  }, [asistencias, activeGrupoObj, selectedGrupo, selectedCampana, fecha])

  const handleOpenRegularizacion = useCallback((item) => {
    setRegularizandoPostulante(item)
  }, [])

  const handleRegularizacionSaved = useCallback(({ documento, updatedRecords }) => {
    const cleanDoc = String(documento || '').trim()
    const newDates = new Set((updatedRecords || []).map(r => r.fecha))
    const isBajaFinal = updatedRecords && updatedRecords.length > 0 && updatedRecords[updatedRecords.length - 1].sigla === 'B'

    // 1. Inmediatamente actualizar asistencias en memoria (evita que al reabrir el modal o recalcular se vuelva al estado anterior)
    setAsistencias(prev => {
      const filtered = prev.filter(a => {
        const aDoc = String(a.postulante_documento || a.documento || '').trim()
        const aFecha = parseFechaAsistencia(a.fecha_asistencia || a.fecha_registro_asistencia || a.fecha)
        return !(aDoc === cleanDoc && newDates.has(aFecha))
      })
      const mappedNew = (updatedRecords || []).map(r => ({
        documento: cleanDoc,
        postulante_documento: cleanDoc,
        codigo_grupo: activeGrupoObj?.codigo || selectedGrupo,
        grupo_codigo: activeGrupoObj?.codigo || selectedGrupo,
        campana: activeGrupoObj?.campana || selectedCampana,
        fecha_asistencia: r.fecha,
        fecha_registro_asistencia: r.fecha,
        sigla: r.sigla,
        sigla_asistencia: r.sigla,
        motivo_baja: r.motivo_baja || '',
        estado: r.sigla === 'B' ? 'CESADO' : 'ACTIVO',
        tipo_reclutado: r.sigla === 'B' ? 'CESE' : 'APTO'
      }))
      return [...mappedNew, ...filtered]
    })

    // 2. Si entre los registros actualizados está la fecha actualmente activa en pantalla, sincronizar attendanceList
    const currentRec = (updatedRecords || []).find(r => r.fecha === fecha)
    setAttendanceList(prev => prev.map(item => {
      if (item.documento !== cleanDoc) return item
      return {
        ...item,
        sigla: currentRec ? currentRec.sigla : item.sigla,
        motivo_baja: currentRec ? currentRec.motivo_baja : item.motivo_baja,
        tipoReclutado: isBajaFinal ? 'CESE' : item.tipoReclutado,
        isHistoricalBaja: isBajaFinal
      }
    }))

    // 3. Notificar recarga en segundo plano a nivel global si está disponible
    if (onRefresh) {
      onRefresh({ silent: true })
    }
  }, [fecha, activeGrupoObj, selectedGrupo, selectedCampana, onRefresh])

  const executeActualSave = async () => {
    let clearedBajaDia1Count = 0
    // Sanitizar solo BAJA DIA 1 inválida; nunca rellenar motivo automático
    const sanitizedList = attendanceList.map(item => {
      let motivo_baja = item.motivo_baja
      const corte = item.corte ?? selectedCorte
      if (item.isLockedBaja && item.pastMotive) {
        motivo_baja = item.pastMotive
      } else if (item.sigla === 'B' && !item.isLateInclusion && motivo_baja) {
        const before = motivo_baja
        motivo_baja = sanitizeBajaDia1Motivo({
          trainingDayIndex: item.trainingDayIndex,
          row: item,
          motivo: motivo_baja,
          hadDia1Attendance: item.hadDia1Attendance,
          hadAttendanceInEarlierCuts: item.hadAttendanceInEarlierCuts,
          corte,
        })
        if (isBajaDia1Motivo(before) && !motivo_baja) {
          clearedBajaDia1Count++
        }
      }
      return { ...item, motivo_baja, corte }
    })

    const invalidItems = sanitizedList.filter(item => item.sigla === 'B' && !item.motivo_baja && !item.isLateInclusion)
    if (invalidItems.length > 0) {
      const names = invalidItems.map(i => `${i.nombres || i.documento}`).join(', ')
      return alert(`Selecciona un motivo de baja de la lista para:\n\n${names}`)
    }

    const recordsToSave = sanitizedList.filter(item => !item.isLateInclusion).map(item => ({
      documento: item.documento,
      sigla: item.sigla,
      motivo_baja: item.motivo_baja
    }))
    setSaving(true)
    try {
      const targetGroup = activeGrupoObj?.codigo || selectedGrupo;
      const weekNum = String(activeGrupoObj?.semana_trabajo || '');
      const nowStr = new Date().toLocaleString('es-PE');

      const drivePayload = [];
      
      recordsToSave.forEach(r => {
        const itemInfo = sanitizedList.find(i => i.documento === r.documento);
        
        drivePayload.push({
          archivo_origen: weekNum ? `SEM${weekNum}` : '',
          documento: r.documento,
          apellido_materno: itemInfo?.apellido_materno || '',
          apellido_paterno: itemInfo?.apellido_paterno || '',
          nombres: itemInfo?.nombres || '',
          celular: itemInfo?.celular || '',
          condicion_laboral: itemInfo?.condicion_laboral || '',
          campana: activeGrupoObj?.campana || selectedCampana || itemInfo?.campana || '',
          grupo: targetGroup,
          documento_formador: itemInfo?.docFormador || '',
          nombre_formador: itemInfo?.nombreFormador || '',
          fecha_registro_asistencia: formatSpreadsheetDate(fecha),
          tipo_reclutado: itemInfo?.tipoReclutado || '',
          estado: r.sigla === 'B' ? 'CESADO' : 'ACTIVO',
          sigla: r.sigla,
          motivo_baja: r.motivo_baja || '',
          corte: itemInfo?.corte ?? selectedCorte,
          fecha_hora_registro: nowStr,
          codigo_grupo: targetGroup
        });
      });
      
      try {
        await insertConsolidado(drivePayload);
      } catch (dbErr) {
        console.error('Consolidado Supabase error:', dbErr);
        throw dbErr
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
      setAttendanceList(sanitizedList)

      if (clearedBajaDia1Count > 0) {
        toast.info(
          'Motivo de Formación requerido',
          `${clearedBajaDia1Count} fila(s) tenían BAJA DIA 1 no aplicable (C3 o con A en C1/C2). Elige un motivo de la lista.`
        )
      }
      toast.success('¡Asistencia guardada!', `Corte ${selectedCorte} sincronizado. Los cortes previos del día se conservan.`)
    } catch (err) {
      toast.error('Error al guardar', err.message || 'No se pudo guardar la asistencia.')
    } finally {
      setSaving(false)
    }
  }

  const handleSave = async (e, options = {}) => {
    if (e && e.preventDefault) e.preventDefault();
    if (isReadOnly) {
      if (readOnlyReason === 'SEGMENTO_BLOQUEADO') {
        toast.error(`Modo solo lectura: Este grupo es de ${grupoSegmento} y tu segmento es ${userSegmento}.`);
      } else if (readOnlyReason === 'VISTA_INFORMATIVA_RECLUTAMIENTO') {
        toast.info('Vista informativa: Reclutamiento gestiona la asistencia y nómina en el módulo Nóminas.');
      } else {
        toast.error('No tienes permisos para modificar la asistencia de este grupo.');
      }
      return;
    }
    if (!selectedGrupo) return alert('Selecciona un grupo.')
    
    const currentDoc = String(effectiveGrupoObj?.formador_documento || '').trim();
    const currentNombre = resolveFormadorDisplayName(allFormadores, currentDoc, effectiveGrupoObj?.formador_nombre || effectiveGrupoObj?.formador);
    if (!currentDoc && (!currentNombre || currentNombre === 'SIN ASIGNAR')) {
      return alert('Este grupo no tiene un formador asignado o no se ha encontrado en la lista. Por favor, asigne un formador en la vista de Asignación antes de registrar la asistencia.');
    }

    // Si hay días pendientes y no se ha mostrado la advertencia para esta combinación grupo/fecha:
    // [PAUSADO TEMPORALMENTE A PEDIDO]: No mostrar alerta/modal a los formadores al marcar asistencia
    /*
    if (!options.bypassGapModal && missingWorkingDays.length > 0 && hasPromptedGapForDate !== `${selectedGrupo}_${fecha}`) {
      setShowGapModal(true)
      return
    }
    */

    await executeActualSave()
  }

  const handleAutocompletarGap = async (datesToFill) => {
    setIsProcessingGap(true)
    try {
      const targetGroup = activeGrupoObj?.codigo || selectedGrupo
      const res = await autocompletarDiasFaltantesGrupo({
        grupo_codigo: targetGroup,
        campana: activeGrupoObj?.campana || selectedCampana,
        semana: activeGrupoObj?.semana_trabajo || '',
        formadorDoc: effectiveGrupoObj?.formador_documento || '',
        formadorNombre: effectiveGrupoObj?.formador_nombre || effectiveGrupoObj?.formador || '',
        missingDates: datesToFill,
        baseAttendanceList: attendanceList,
        allAsistencias: asistencias
      })

      if (res?.success) {
        toast.success(
          'Días faltantes regularizados',
          `Se completó la asistencia de ${datesToFill.length} día(s) omitido(s). Sincronizando la fecha de hoy...`
        )
      }

      setShowGapModal(false)
      setHasPromptedGapForDate(`${selectedGrupo}_${fecha}`)

      // Guardar también la fecha actual
      await executeActualSave()
    } catch (err) {
      console.error('Error autocompletando días faltantes:', err)
      toast.error('Error al autocompletar', err.message || 'No se pudieron regularizar los días faltantes.')
    } finally {
      setIsProcessingGap(false)
    }
  }

  const handleProceedCurrentOnly = async () => {
    setShowGapModal(false)
    setHasPromptedGapForDate(`${selectedGrupo}_${fecha}`)
    await executeActualSave()
  }

  const handleSelectDateToEdit = (dateIso) => {
    setShowGapModal(false)
    setFecha(dateIso)
    toast.info('Fecha seleccionada', `Cambiando a la fecha ${formatSpreadsheetDate(dateIso)} para editar su asistencia.`)
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
    
    const campana = effectiveGrupoObj?.campana || selectedCampana || 'SIN CAMPAÑA'
    const docFormador = effectiveGrupoObj?.formador_documento || ''
    const formador = resolveFormadorDisplayName(allFormadores, docFormador, effectiveGrupoObj?.formador_nombre || effectiveGrupoObj?.formador)
    const grupo = effectiveGrupoObj?.codigo || selectedGrupo || 'SIN GRUPO'
    
    const targetGroup = activeGrupoObj?.codigo || selectedGrupo;
    const groupDates = [...new Set(asistencias
      .filter(a => (normalize(a.grupo_codigo) === normalize(targetGroup) || (activeGrupoObj && normalize(a.grupo_codigo) === normalize(activeGrupoObj.codigo))) && (!activeGrupoObj?.campana || normalize(a.campana) === normalize(activeGrupoObj.campana)))
      .map(a => a.fecha_asistencia))]
      .sort();
      
    const allDatesUntilNow = new Set([...groupDates, fecha].filter(d => d <= fecha));
    const diaCapacitacion = allDatesUntilNow.size;
    
    const total = attendanceList.length;
    const isB1 = (r) => isBajaDia1Motivo(r.motivo_baja)
    const isBajaC3 = (r) => Number(r.corte ?? selectedCorte) === 3 && r.sigla === 'B' && !isB1(r)
    const desertores = attendanceList.filter(r => r.sigla === 'B' && countsInFormacionDesercion(r, r.motivo_baja)).length
    const bajasDia1 = attendanceList.filter(r => r.sigla === 'B' && isB1(r)).length
    const bajasC3Formacion = attendanceList.filter(r => isBajaC3(r) || (r.sigla === 'B' && r.hadAttendanceInEarlierCuts && !isB1(r))).length
    const qDia1 = Math.max(0, total - bajasDia1);
    const activos = Math.max(0, qDia1 - desertores);
    const enSala = attendanceList.filter(r => {
      const s = String(r.sigla || '').toUpperCase().trim();
      return s === 'A' || s === 'I-OP' || s === 'OJT' || s === 'CAPACITACION';
    }).length;
    const listaFaltas = attendanceList.filter(r => {
      const s = String(r.sigla || '').toUpperCase().trim();
      return s === 'FI' || s === 'FJ';
    });
    const faltas = listaFaltas.length;
    const diaCapLabel = String(diaCapacitacion).padStart(2, '0');

    let text = `Buenas tardes con todos, se comparte estatus de la capacitación. ACTUALIZACIÓN\n\n📊 Campaña: ${campana}\n👤 Formadora: ${formador}\n💡 Grupo: ${grupo}\n📚 Día de Capacitación: ${diaCapLabel}\n⏱️ Corte actual: ${selectedCorte} (C1–C2 RyS · C3 Formación)\n📄 Q Día 1 (entrega): ${qDia1}\n👥 Q Activos al corte: ${activos}\n🟢 Q en sala: ${enSala}\n❌ Q Desertores Formación: ${desertores}${bajasDia1 > 0 ? `\n⚠️ Q Bajas Día 1 (Reclutamiento / C1–C2): ${bajasDia1}` : ''}${bajasC3Formacion > 0 ? `\n🔻 Q Bajas post-corte RyS (C3 Formación; no descalibran entrega): ${bajasC3Formacion}` : ''}\n⚠️ Q Faltas: ${faltas}\n📢 Observaciones: `;

    if (listaFaltas.length > 0) {
      text += `\n\n⚠️ LISTA DE FALTAS (SEGUIMIENTO):\n`;
      text += listaFaltas.map((r, i) => {
        const tipo = String(r.sigla || '').toUpperCase() === 'FJ' ? 'FJ' : 'FI';
        const nombre = `${r.apellido_paterno || ''} ${r.apellido_materno || ''} ${r.nombres || ''}`.replace(/\s+/g, ' ').trim();
        const celular = r.celular ? ` | ${r.celular}` : '';
        return `${i + 1}. ${r.documento} - ${nombre} (${tipo})${celular}`;
      }).join('\n');
    } else {
      text += `\n\n✅ Sin faltas para seguimiento.`;
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
    const faltas = displayedList.filter(item => item.sigla === 'FI' || item.sigla === 'FJ').length
    
    // Bajas de Formación (Excluye 'BAJA DIA 1' / 'Periodo Gracia' imputadas a Reclutamiento)
    const isBajaDia1Item = (item) => isBajaDia1Motivo(item.motivo_baja)

    const bajas = displayedList.filter(item => item.sigla === 'B' && countsInFormacionDesercion(item, item.motivo_baja)).length
    const bajasDia1 = displayedList.filter(item => item.sigla === 'B' && isBajaDia1Item(item)).length
    const bajasC3 = displayedList.filter(item =>
      item.sigla === 'B' && !isBajaDia1Item(item) && (Number(item.corte) === 3 || item.hadAttendanceInEarlierCuts)
    ).length
    // Denominador oficial de asistencia: nunca se divide entre las bajas de Día 1 de Reclutamiento
    const baseTotal = Math.max(0, total - bajasDia1)
    const pctAsistencia = baseTotal > 0 ? ((asistieron / baseTotal) * 100).toFixed(1) : (total > 0 ? ((asistieron / total) * 100).toFixed(1) : '0.0')

    return {
      total,
      asistieron,
      bajas,
      bajasDia1,
      bajasC3,
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
    
    const targetPais = resolveGrupoPais(effectiveGrupoObj || activeGrupoObj, effectiveGrupoObj?.campana || activeGrupoObj?.campana || selectedCampana);
    
    for (let i = 0; i < 42; i++) {
      const dStr = curr.toISOString().split('T')[0];
      const isCurrentMonth = curr.getUTCMonth() === currentMonth;
      const isSunday = curr.getUTCDay() === 0;
      const isHoliday = isFeriadoNacional(dStr, targetPais);
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
      } else if (isSunday || isBeforeStart || isFuture || (!isRegistered && isHoliday)) {
        badgeStyle = { background: 'var(--bg-elevated)', color: 'var(--text-muted)', border: '1px solid var(--border-subtle)' };
      } else {
        badgeStyle = { background: 'var(--status-fi-bg)', color: 'var(--status-fi-text)', border: '1px solid rgba(239,68,68,0.4)' };
      }
      
      days.push(
        <div 
          key={dStr} 
          className="h-10 flex flex-col items-center justify-center font-bold text-xs rounded-md m-0.5" 
          style={badgeStyle}
          title={isHoliday ? `Feriado oficial (${targetPais})` : undefined}
        >
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
            disabled={saving || !selectedGrupo || isReadOnly}
            className="flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-slate-950 font-black text-xs h-7 px-3.5 rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-[0_0_12px_rgba(16,185,129,0.3)] cursor-pointer"
            title={isReadOnly ? 'Edición deshabilitada (modo solo lectura)' : 'Guardar Cambios'}
          >
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
            <span>{saving ? 'Guardando...' : (isReadOnly ? 'Solo Lectura' : 'Guardar Cambios')}</span>
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

      {/* ── ALERTA INFORMATIVA DE PERMISOS / LLAVE DE SEGMENTO ── */}
      {isReadOnly && (
        <div className={`px-3.5 py-2 rounded-xl flex items-center justify-between gap-3 shrink-0 shadow-xs border ${
          readOnlyReason === 'SEGMENTO_BLOQUEADO'
            ? 'bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-300'
            : readOnlyReason === 'VISTA_INFORMATIVA_RECLUTAMIENTO'
            ? 'bg-sky-500/10 border-sky-500/30 text-sky-700 dark:text-sky-300'
            : 'bg-slate-500/10 border-slate-500/30 text-slate-700 dark:text-slate-300'
        }`}>
          <div className="flex items-center gap-2.5 min-w-0">
            <AlertTriangle size={15} className="shrink-0" />
            <span className="text-xs font-semibold leading-relaxed">
              {readOnlyReason === 'SEGMENTO_BLOQUEADO' ? (
                <>
                  <strong className="font-bold">Modo Solo Lectura (Llave de Segmento):</strong> Este grupo pertenece al segmento <span className="px-1.5 py-0.2 rounded font-black uppercase bg-amber-500/20 text-amber-800 dark:text-amber-200">{grupoSegmento}</span> y tu segmento asignado es <span className="px-1.5 py-0.2 rounded font-black uppercase bg-amber-500/20 text-amber-800 dark:text-amber-200">{userSegmento || 'OTRO'}</span>. Los formadores solo pueden editar grupos de su mismo segmento para evitar cruces accidentales.
                </>
              ) : readOnlyReason === 'VISTA_INFORMATIVA_RECLUTAMIENTO' ? (
                <>
                  <strong className="font-bold">Vista Informativa (Reclutamiento):</strong> Estás consultando el avance de capacitación. La gestión de asistencias de reclutamiento (Día 0, Día 1 y documentos) se realiza en el módulo de <strong className="underline">Nóminas</strong>.
                </>
              ) : (
                <>
                  <strong className="font-bold">Modo Solo Lectura:</strong> Vista protegida de solo consulta.
                </>
              )}
            </span>
          </div>
          <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-black/10 dark:bg-white/10 shrink-0">
            Solo Lectura
          </span>
        </div>
      )}

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
              onChange={e => handlePeriodoChange(e.target.value)}
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
              onChange={e => handleSemanaChange(e.target.value)}
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
              onChange={e => handleSegmentoChange(e.target.value)}
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
              onChange={e => handleCampanaChange(e.target.value)}
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
              onChange={e => handleModalidadChange(e.target.value)}
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
              value={(() => {
                if (!selectedGrupo) return ''
                const homonyms = gruposFiltrados.filter(x => normalize(x.codigo) === normalize(selectedGrupo))
                if (homonyms.length > 1 && selectedCampana && selectedCampana !== 'Todas') {
                  return `${selectedGrupo}:::${selectedCampana}`
                }
                return selectedGrupo
              })()}
              onChange={e => handleGrupoChange(e.target.value)}
              className="w-full h-7 text-xs font-bold rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-normal)] text-[var(--text-primary)] px-2 outline-none focus:border-cyan-500 transition-all cursor-pointer truncate"
            >
              <option value="">Seleccionar</option>
              {gruposFiltrados.map((g, idx) => {
                const countSameCode = gruposFiltrados.filter(x => normalize(x.codigo) === normalize(g.codigo)).length
                const baseLabel = String(g.codigo).startsWith('PROY-') ? '—' : (String(g.codigo).replace(/_\d+$/, '') || 'SIN CÓDIGO')
                const displayLabel = countSameCode > 1 && g.campana ? `${baseLabel} · ${g.campana}` : baseLabel
                const optVal = countSameCode > 1 && g.campana ? `${g.codigo}:::${g.campana}` : g.codigo
                return (
                  <option key={`${g.id || g.codigo}_${idx}`} value={optVal}>
                    {displayLabel}
                  </option>
                )
              })}
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
              value={effectiveGrupoObj ? resolveFormadorDisplayName(allFormadores, effectiveGrupoObj.formador_documento, effectiveGrupoObj.formador_nombre || effectiveGrupoObj.formador) : ''}
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

          {/* CORTE (solo visible en Día 1): C1–C2 ventana RyS · C3 cierre Formación */}
          {(attendanceList[0]?.trainingDayIndex ?? 0) === 1 && (
            <div className="flex flex-col gap-0.5 min-w-0" title="Cortes 1–2: seguimiento RyS · Corte 3: cierre Formación (baja no es BAJA DIA 1)">
              <span className="text-[8px] font-black uppercase text-[var(--text-muted)] tracking-wider flex items-center gap-1 truncate">
                <Radio size={10} className="text-violet-500 shrink-0" /> CORTE
              </span>
              <div className="flex gap-1 h-7 items-center">
                {[1, 2, 3].map(c => {
                  const isActive = selectedCorte === c
                  const colors = c === 1
                    ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-500 hover:bg-emerald-500/25'
                    : c === 2
                      ? 'bg-amber-500/15 border-amber-500/40 text-amber-500 hover:bg-amber-500/25'
                      : 'bg-rose-500/15 border-rose-500/40 text-rose-500 hover:bg-rose-500/25'
                  const activeColors = c === 1
                    ? 'bg-emerald-500 border-emerald-500 text-white shadow-[0_0_8px_rgba(16,185,129,0.5)]'
                    : c === 2
                      ? 'bg-amber-500 border-amber-500 text-white shadow-[0_0_8px_rgba(245,158,11,0.5)]'
                      : 'bg-rose-500 border-rose-500 text-white shadow-[0_0_8px_rgba(239,68,68,0.5)]'
                  const tip = c === 1
                    ? 'Corte 1 — Ventana RyS (inicio de jornada). Baja sin A previa = BAJA DIA 1.'
                    : c === 2
                      ? 'Corte 2 — Cierre seguimiento RyS. Si ya hubo A en C1, la baja es de Formación.'
                      : 'Corte 3 — Cierre Formación. No aplica BAJA DIA 1; no descalibra entrega RyS si hubo A en C1/C2.'
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setSelectedCorte(c)}
                      title={tip}
                      className={`flex-1 h-7 text-[10px] font-black rounded-lg border transition-all cursor-pointer select-none ${isActive ? activeColors : colors}`}
                    >
                      C{c}
                    </button>
                  )
                })}
              </div>
              {selectedCorte <= 2 ? (
                <span className="text-[8px] text-amber-500 font-bold mt-0.5 leading-tight">
                  C{selectedCorte}: seguimiento RyS
                </span>
              ) : (
                <span className="text-[8px] text-rose-500 font-bold mt-0.5 leading-tight">
                  C3: baja = Formación (no BAJA DIA 1)
                </span>
              )}
            </div>
          )}

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
              <div className="text-[9px] font-black uppercase tracking-wider text-rose-600 dark:text-rose-400 truncate">
                Bajas Formación [B]
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-base sm:text-lg font-black text-rose-600 dark:text-rose-400 leading-tight font-mono tabular-nums">
                  {kpis.bajas}
                </span>
                <span 
                  className="text-[9px] text-rose-600/80 dark:text-rose-400/80 font-semibold truncate"
                  title={[
                    kpis.bajasDia1 > 0 ? `${kpis.bajasDia1} Baja Día 1 (RyS C1–C2)` : null,
                    kpis.bajasC3 > 0 ? `${kpis.bajasC3} baja C3 Formación (no descalibra entrega)` : null,
                    'Deserciones de formación',
                  ].filter(Boolean).join(' · ')}
                >
                  {kpis.bajasDia1 > 0 || kpis.bajasC3 > 0
                    ? [
                        kpis.bajasDia1 > 0 ? `+${kpis.bajasDia1} D1 RyS` : null,
                        kpis.bajasC3 > 0 ? `${kpis.bajasC3} C3` : null,
                      ].filter(Boolean).join(' · ')
                    : 'deserciones'}
                </span>
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

      {/* ── ALERTA DE DÍAS DE ASISTENCIA PENDIENTES DE REGISTRAR (GAP BANNER) - PAUSADO TEMPORALMENTE A PEDIDO ── */}
      {/*
      {selectedGrupo && missingWorkingDays.length > 0 && (
        <div className="px-4 py-2.5 rounded-2xl bg-gradient-to-r from-amber-500/15 via-orange-500/10 to-transparent border border-amber-500/40 flex flex-wrap items-center justify-between gap-3 shadow-sm shrink-0 animate-fadeIn">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-500 flex items-center justify-center shrink-0 shadow-xs">
              <AlertTriangle size={17} className="animate-pulse" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                  {missingWorkingDays.length} día(s) sin registrar
                </span>
                <span className="text-xs font-bold text-[var(--text-primary)]">
                  Este grupo tiene fechas laborales anteriores pendientes de asistencia:
                </span>
              </div>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                {missingWorkingDays.map(d => (
                  <span key={d} className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-lg bg-[var(--bg-surface)] border border-amber-500/30 text-amber-600 dark:text-amber-400">
                    {formatSpreadsheetDate(d)}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowGapModal(true)}
            className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-black font-black text-xs shadow-md shadow-amber-500/20 flex items-center gap-1.5 transition-all hover:scale-105 shrink-0 cursor-pointer"
          >
            <Zap size={14} /> Asistente Rápido
          </button>
        </div>
      )}
      */}

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
            {displayedList.length > 0 && !isReadOnly && (
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
                    onLevantarBaja={handleLevantarBaja}
                    motivosBaja={motivosBaja}
                    isReadOnly={isReadOnly}
                    onOpenRegularizacion={handleOpenRegularizacion}
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

      {/* ── MODAL DE REGULARIZACIÓN INDIVIDUAL DE ASISTENCIA ── */}
      <AsistenciaRegularizacionModal
        isOpen={Boolean(regularizandoPostulante)}
        onClose={() => setRegularizandoPostulante(null)}
        postulante={regularizandoPostulante}
        grupoCodigo={activeGrupoObj?.codigo || selectedGrupo}
        campana={activeGrupoObj?.campana || selectedCampana}
        semana={activeGrupoObj?.semana_trabajo || activeGrupoObj?.semana_label || selectedSemana}
        formadorDoc={regularizandoPostulante?.docFormador || effectiveGrupoObj?.formador_documento}
        formadorNombre={regularizandoPostulante?.nombreFormador || effectiveGrupoObj?.formador_nombre}
        asistencias={asistencias}
        groupDates={groupDatesList}
        grupoObj={effectiveGrupoObj || activeGrupoObj}
        currentFormFecha={fecha}
        motivosBaja={motivosBaja}
        isReadOnly={isReadOnly}
        onRegularizacionSaved={handleRegularizacionSaved}
      />

      {/* ── MODAL ASISTENTE RÁPIDO DE DÍAS FALTANTES ── */}
      <AsistenciaGapAssistantModal
        isOpen={showGapModal}
        onClose={() => setShowGapModal(false)}
        missingDates={missingWorkingDays}
        currentDate={fecha}
        grupoCodigo={activeGrupoObj?.codigo || selectedGrupo}
        campana={activeGrupoObj?.campana || selectedCampana}
        onAutocompletar={handleAutocompletarGap}
        onSelectDateToEdit={handleSelectDateToEdit}
        onProceedCurrentOnly={handleProceedCurrentOnly}
        isProcessing={isProcessingGap}
      />
    </div>
  )
}
