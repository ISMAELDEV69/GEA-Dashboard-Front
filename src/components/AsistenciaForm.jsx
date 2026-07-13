import { useState, useEffect, useRef, useMemo } from 'react'
import { AlertTriangle, Save, CheckCircle, Filter, Undo2, Calendar as CalendarIcon, Clock, Download, EyeOff, LayoutPanelLeft } from 'lucide-react'
import * as XLSX from 'xlsx'
import { insertConsolidado, fetchGruposDia1 } from '../lib/dataService'
import PageLayout from './ui/PageLayout'
import PageHeader from './ui/PageHeader'
import Card, { CardHeader } from './ui/Card'
const SIGLAS = [
  { value: 'A', label: 'A - Asistencia', bgColor: '#dcfce7', color: '#166534' },
  { value: 'I-OP', label: 'I-OP - Ingreso Operación', bgColor: '#059669', color: '#ffffff' },
  { value: 'FI', label: 'FI - Falta Injustificada', bgColor: '#dc2626', color: '#ffffff' },
  { value: 'FJ', label: 'FJ - Falta Justificada', bgColor: '#d97706', color: '#ffffff' },
  { value: 'B', label: 'B - Baja', bgColor: '#451a03', color: '#ffffff' }
]

const selectCls = 'bg-white border border-gray-300 focus:border-indigo-500 rounded p-1 text-xs text-gray-900 outline-none w-full'
const labelCls = 'text-[10px] text-gray-500 font-bold uppercase block mb-0.5'

function formatSpreadsheetDate(dateStr) {
  if (!dateStr) return ''
  const [year, month, day] = dateStr.split('-')
  return `${parseInt(day)}/${parseInt(month)}/${year}`
}

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
  const [selectedPeriodo, setSelectedPeriodo] = useState('')
  const [selectedSegmento, setSelectedSegmento] = useState('')
  const [selectedCampana, setSelectedCampana] = useState('')
  const [selectedGrupo, setSelectedGrupo] = useState('')
  const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0])
  
  const [attendanceList, setAttendanceList] = useState([])
  const [missingDataCandidates, setMissingDataCandidates] = useState([])
  const [filterActivos, setFilterActivos] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedSuccess, setSavedSuccess] = useState(false)
  const [showCalendarModal, setShowCalendarModal] = useState(false)
  const [calendarMonthIndex, setCalendarMonthIndex] = useState(-1)
  
  const [dia1Calibrado, setDia1Calibrado] = useState(false)

  const [successInfo, setSuccessInfo] = useState(null)
  
  // Agrupación de columnas estilo Google Sheets
  const [hiddenGroupInfo, setHiddenGroupInfo] = useState(false)

  const dateInputRef = useRef(null)
  const datePickerRef = useRef(null)

  const [showDatePickerPopup, setShowDatePickerPopup] = useState(false)
  const [pickerMonth, setPickerMonth] = useState(new Date().getMonth())
  const [pickerYear, setPickerYear] = useState(new Date().getFullYear())

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

  const periodos = useMemo(() => {
    return [...new Set(grupos.map(g => g.periodo ? String(g.periodo).trim() : null).filter(Boolean))].sort()
  }, [grupos])

  const segmentos = useMemo(() => {
    let filtered = grupos.filter(g => g.periodo)
    if (selectedPeriodo) filtered = filtered.filter(g => String(g.periodo).trim() === String(selectedPeriodo).trim())
    return [...new Set(filtered.map(g => g.segmento ? String(g.segmento).trim() : null).filter(Boolean))].sort()
  }, [grupos, selectedPeriodo])

  const campanas = useMemo(() => {
    let filtered = grupos.filter(g => g.periodo)
    if (selectedPeriodo) filtered = filtered.filter(g => String(g.periodo).trim() === String(selectedPeriodo).trim())
    if (selectedSegmento) filtered = filtered.filter(g => String(g.segmento).trim() === String(selectedSegmento).trim())
    return [...new Set(filtered.map(g => g.campana ? String(g.campana).trim() : null).filter(Boolean))].sort()
  }, [grupos, selectedPeriodo, selectedSegmento])

  const gruposFiltrados = useMemo(() => {
    let filtered = grupos.filter(g => g.periodo)
    if (selectedPeriodo) filtered = filtered.filter(g => String(g.periodo).trim() === String(selectedPeriodo).trim())
    if (selectedSegmento) filtered = filtered.filter(g => String(g.segmento).trim() === String(selectedSegmento).trim())
    if (selectedCampana) filtered = filtered.filter(g => String(g.campana).trim() === String(selectedCampana).trim())
    
    // Remove duplicates
    const unique = [];
    const seen = new Set();
    for (const g of filtered) {
      if (!seen.has(g.codigo)) {
        seen.add(g.codigo);
        unique.push(g);
      }
    }
    return unique.sort((a,b) => String(a.codigo).localeCompare(String(b.codigo)));
  }, [grupos, selectedPeriodo, selectedSegmento, selectedCampana])

  const activeGrupoObj = useMemo(() => {
    if (!selectedGrupo) return null;
    const match = gruposFiltrados.find(g => g.id === selectedGrupo || g.codigo === selectedGrupo);
    if (match) return match;
    return grupos.find(g => (g.id === selectedGrupo || g.codigo === selectedGrupo) && (!selectedCampana || String(g.campana).trim() === String(selectedCampana).trim()));
  }, [grupos, gruposFiltrados, selectedGrupo, selectedCampana])

  useEffect(() => { setSelectedSegmento(''); setSelectedCampana(''); setSelectedGrupo('') }, [selectedPeriodo])
  useEffect(() => { setSelectedCampana(''); setSelectedGrupo('') }, [selectedSegmento])
  useEffect(() => { setSelectedGrupo('') }, [selectedCampana])
  useEffect(() => {
    if (!selectedGrupo || !selectedCampana) lastSetGrupo.current = null;
  }, [selectedGrupo, selectedCampana])
  useEffect(() => {
    if (gruposFiltrados.length === 1 && !selectedGrupo) setSelectedGrupo(gruposFiltrados[0].id || gruposFiltrados[0].codigo)
  }, [gruposFiltrados, selectedGrupo])

  useEffect(() => {
    if (!selectedGrupo) {
      setDia1Calibrado(false)
      return
    }
    fetchGruposDia1().then(configs => {
      const g = configs.find(c => c.grupo_codigo === (activeGrupoObj?.codigo || selectedGrupo))
      setDia1Calibrado(g?.estado_calibracion === 'CALIBRADO')
    }).catch(err => {
      console.error('Error fetching dia1 calibracion:', err)
      setDia1Calibrado(false)
    })
  }, [selectedGrupo, activeGrupoObj])

  const lastSetGrupo = useRef(null);
  const lastRenderedFecha = useRef(null);

  // Auto-set Date based on Group
  useEffect(() => {
    // Si no hay grupo activo, no hacer nada
    if (!activeGrupoObj) return;

    // Solo actualizar si cambiamos de grupo real
    const groupKey = activeGrupoObj.codigo;
    if (lastSetGrupo.current === groupKey) return;

    // Buscar las fechas donde este grupo ya tiene asistencia, 
    // recordando que un grupo se compone de CAMPAÑA y GRUPO
    const groupDates = asistencias
      .filter(a => a.grupo_codigo === activeGrupoObj.codigo || a.grupo_codigo === selectedGrupo)
      .map(a => a.fecha_asistencia)
      .sort();

    if (groupDates.length > 0) {
      // Tiene registros -> preseleccionar la ULTIMA fecha de registro
      setFecha(groupDates[groupDates.length - 1]);
      lastSetGrupo.current = groupKey;
    } else if (activeGrupoObj.fecha_inicio || activeGrupoObj.fecha_registro) {
      // No tiene registros -> tomar fecha de inicio del grupo
      const fechaInicio = activeGrupoObj.fecha_inicio || activeGrupoObj.fecha_registro;
      setFecha(fechaInicio.split('T')[0]);
      lastSetGrupo.current = groupKey;
    } else {
      setFecha(new Date().toISOString().split('T')[0]);
      lastSetGrupo.current = groupKey;
    }
  }, [activeGrupoObj, asistencias, selectedGrupo]);

  useEffect(() => {
    if (!selectedGrupo) {
      setAttendanceList([])
      return
    }
    const mappedDocs = new Set(asistencias.filter(a => 
        a.grupo_codigo === selectedGrupo || (activeGrupoObj && a.grupo_codigo === activeGrupoObj.codigo)
    ).map(a => a.postulante_documento))
    // Lógica DÍA 0: Solo incluir a quienes asistieron al día 0 (dia_0 = 'ASISTIO')
    // o fueron agregados directamente al día 1 (status_dia_1 = 'AGREGADO')
    // Si dia_0 es null (datos sin valor), incluir todos para no perder registros
    const invalidList = []
    const filteredPostulantes = postulantes.filter(p => {
      const inGroup = mappedDocs.has(p.documento) || p.grupo_codigo === selectedGrupo || p.grupo_codigo === selectedGrupo || (activeGrupoObj && p.grupo_codigo === activeGrupoObj.codigo)
      if (!inGroup) return false
      
      const dia0Val = (p.dia_0 || '').toString().toUpperCase().trim()
      const statusDia1Val = (p.status_dia_1 || '').toString().toUpperCase().trim()
      
      const asistioD0 = dia0Val === 'ASISTIO'
      const agregadoD1 = statusDia1Val === 'AGREGADO'
      
      if (!(asistioD0 || agregadoD1)) return false

      // Validar datos requeridos para consolidado
      const missing = []
      if (!p.documento) missing.push('DNI')
      if (!p.nombres) missing.push('Nombres')
      if (!p.apellido_paterno) missing.push('Apellido Paterno')
      if (!p.apellido_materno) missing.push('Apellido Materno')
      if (!p.celular) missing.push('Celular')
      const cond = p.condicion || activeGrupoObj?.condicion || ''
      if (!cond) missing.push('Condición Laboral')
      const camp = p.campana || activeGrupoObj?.campana || ''
      if (!camp) missing.push('Campaña')

      if (missing.length > 0) {
        invalidList.push({
          nombre: `${p.apellido_paterno || ''} ${p.nombres || ''}`.trim() || p.documento || 'Sin nombre',
          faltantes: missing.join(', ')
        })
        return false // Rechazado de la tabla
      }
      
      return true
    })
    
    setMissingDataCandidates(invalidList)

    const groupRecordsAll = asistencias.filter(a => a.grupo_codigo === selectedGrupo || (activeGrupoObj && a.grupo_codigo === activeGrupoObj.codigo));
    const firstDateOfGroup = groupRecordsAll.length > 0 ? groupRecordsAll.map(a => a.fecha_asistencia).sort()[0] : null;
    const isFirstRecordGroup = groupRecordsAll.length === 0 || fecha <= firstDateOfGroup;

    const list = filteredPostulantes.map(p => {
      // Eliminar el bloqueo "N/A" por created_at para permitir a los formadores hacer backfills de asistencias antiguas
      const isLateInclusion = false;
      const existing = asistencias.find(a => a.postulante_documento === p.documento && (a.grupo_codigo === selectedGrupo || a.grupo_codigo === selectedGrupo || (activeGrupoObj && a.grupo_codigo === activeGrupoObj.codigo)) && a.fecha_asistencia === fecha)
      const tipoReclutado = (p.status_dia_1 || '').toString().toUpperCase().trim() || 'APTO'

      let docFormador = p.formador_documento || activeGrupoObj?.formador_documento || ''
      let nombreFormador = formadores.find(f => f.documento === docFormador)?.nombre_completo || activeGrupoObj?.formador_nombre || ''

      let inheritedSigla = 'A';
      let inheritedMotivo = '';

      if (existing) {
        inheritedSigla = existing.sigla_asistencia;
        inheritedMotivo = existing.motivo_baja || '';
      } else if (!isLateInclusion) {
        // Buscar el último registro anterior
        const previousRecords = asistencias
          .filter(a => a.postulante_documento === p.documento && (a.grupo_codigo === selectedGrupo || a.grupo_codigo === selectedGrupo || (activeGrupoObj && a.grupo_codigo === activeGrupoObj.codigo)) && a.fecha_asistencia < fecha)
          .sort((a, b) => (b.fecha_asistencia > a.fecha_asistencia ? 1 : -1));
        
        if (previousRecords.length > 0) {
          inheritedSigla = previousRecords[0].sigla_asistencia;
          inheritedMotivo = previousRecords[0].motivo_baja || '';
        } else if (p.estado === 'CESADO') {
          // Si no hay registros previos pero el estado ya es CESADO (por ej. Reclutador Día 1 lo marcó con F)
          inheritedSigla = 'B';
          inheritedMotivo = 'BAJA DIA 1';
        }
      }
      
      const sigla = isLateInclusion ? 'N/A' : inheritedSigla;
      let motivo_baja = isLateInclusion ? '' : inheritedMotivo;
      
      if (isFirstRecordGroup && sigla === 'B') {
        motivo_baja = 'BAJA DIA 1';
      }

      const isHistoricalBaja = (existing && existing.sigla_asistencia === 'B') || (!existing && inheritedSigla === 'B');
      const isLockedBaja = false;

      return {
        documento: p.documento,
        apellido_paterno: p.apellido_paterno || '',
        apellido_materno: p.apellido_materno || '',
        nombres: p.nombres || '',
        celular: p.celular || '',
        condicion_laboral: p.condicion || activeGrupoObj?.condicion || '',
        campana: p.campana || activeGrupoObj?.campana || '',
        grupo: activeGrupoObj?.codigo || selectedGrupo,
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

    const isNewContext = lastSetGrupo.current !== selectedGrupo || lastRenderedFecha.current !== fecha;
    lastSetGrupo.current = selectedGrupo;
    lastRenderedFecha.current = fecha;

    if (isNewContext) {
      setAttendanceList(list)
    } else {
      setAttendanceList(prev => {
        if (prev.length === 0) return list;
        return list.map(newItem => {
          const old = prev.find(p => p.documento === newItem.documento);
          if (old) {
            return { ...newItem, sigla: old.sigla, motivo_baja: old.motivo_baja };
          }
          return newItem;
        });
      });
    }
  }, [selectedGrupo, fecha, asistencias, postulantes, activeGrupoObj, formadores, dia1Calibrado])

  const handleStatusChange = (doc, newSigla) => {
    setAttendanceList(prev => prev.map(item => {
      if (item.documento !== doc) return item
      
      let newMotivo = item.motivo_baja
      if (newSigla !== 'B') {
        newMotivo = ''
      } else if (!newMotivo && item.isFirstRecordGroup) {
        newMotivo = 'BAJA DIA 1'
      }
      return { ...item, sigla: newSigla, motivo_baja: newMotivo }
    }))
  }

  const handleMotiveChange = (doc, newMotivo) => {
    setAttendanceList(prev => prev.map(item => 
      item.documento === doc ? { ...item, motivo_baja: newMotivo } : item
    ))
  }

  const handleSave = async (e) => {
    if (e) e.preventDefault();
    if (!selectedGrupo) return alert('Selecciona un grupo.')
    
    // Add validation for formador
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
      // 1. Guardar primero en Consolidado Supabase (la nueva tabla maestra)
      const targetGroup = activeGrupoObj?.codigo || selectedGrupo;
      const weekNum = String(activeGrupoObj?.semana_trabajo || '');
      const nowStr = new Date().toLocaleString('es-PE');
      
      const groupDates = [...new Set(asistencias
        .filter(a => a.grupo_codigo === targetGroup)
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

        // Auto-backfill (FI) para fechas anteriores si fue agregado tardíamente
        // Y Restauración de Bajas: Si hoy asiste (!== 'B'), cambiar Bajas pasadas a FI (INCLUSO BAJA DIA 1)
        pastDates.forEach(pastDate => {
          const pastRecord = asistencias.find(a => a.postulante_documento === r.documento && (a.grupo_codigo === targetGroup || (activeGrupoObj && a.grupo_codigo === activeGrupoObj.codigo)) && a.fecha_asistencia === pastDate);
          
          let shouldBackfillFI = false;
          
          if (!pastRecord) {
             shouldBackfillFI = true; // Late inclusion missing
          } else if (r.sigla !== 'B' && pastRecord.sigla_asistencia === 'B') {
             shouldBackfillFI = true; // Auto-restore ANY Baja to FI (incluyendo BAJA DIA 1)
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

      // 2. Ejecutar onSave que ahora solo actualizará las bajas en 'nominas' y refrescará el UI
      await onSave({
        grupoMeta: {
          codigo: activeGrupoObj?.codigo || selectedGrupo,
          campana_nombre: activeGrupoObj?.campana || '',
          segmento: activeGrupoObj?.segmento || null,
          fecha_registro: activeGrupoObj?.fecha_registro || fecha,
        },
        grupo_codigo: activeGrupoObj?.codigo || selectedGrupo,
        grupoMeta: activeGrupoObj,
        fecha_asistencia: fecha,
        records: recordsToSave,
      })

      alert('¡Asistencia guardada correctamente en el consolidado!')
      const now = new Date()

      setSuccessInfo({
        timestamp: `${now.toLocaleDateString('es-PE')} ${now.toLocaleTimeString('es-PE')}`,
        presentes: recordsToSave.filter(r => r.sigla === 'A' || r.sigla === 'I-OP').length,
        ausentes: recordsToSave.filter(r => r.sigla === 'FI' || r.sigla === 'FJ').length,
        bajas: recordsToSave.filter(r => r.sigla === 'B').length,
        grupo: activeGrupoObj?.codigo || selectedGrupo,
      })
      setSavedSuccess(true)
    } catch (err) {
      alert(err.message || 'Error al guardar.')
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
      CAMPAÑA: item.campana,
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
  }

  
  // Helper for Calendar
  const renderCalendar = () => {
     if (!activeGrupoObj) return null;
     const rawStartStr = activeGrupoObj.fecha_registro;
     if (!rawStartStr) return null;
     
     const start = new Date(rawStartStr + 'T12:00:00Z');
     if (String(selectedGrupo).startsWith('GPE')) {
       start.setUTCDate(start.getUTCDate() + 1);
     }
     const effectiveStartStr = start.toISOString().split('T')[0];
     
     // Force start of month of the effective start date
     const calendarStart = new Date(start.getUTCFullYear(), start.getUTCMonth(), 1, 12, 0, 0);
     // Set of registered dates
     const registeredDates = new Set(
       asistencias.filter(a => a.grupo_codigo === selectedGrupo || a.grupo_codigo === selectedGrupo || (activeGrupoObj && a.grupo_codigo === activeGrupoObj.codigo)).map(a => a.fecha_asistencia)
     );

     const todayStr = new Date().toISOString().split('T')[0];
     
     // El límite base para pintar de rojo los días faltantes es HOY, 
     // pero si el grupo ya tiene fecha de ingreso a OJT (operación) y es menor a hoy, se usa esa fecha.
     let baseLimitStr = todayStr;
     if (activeGrupoObj?.fecha_inicio_ojt && activeGrupoObj.fecha_inicio_ojt < todayStr) {
       baseLimitStr = activeGrupoObj.fecha_inicio_ojt;
     }

     let maxLimitStr = baseLimitStr;
     // Si hay registros de asistencia en fechas posteriores, el límite se extiende hasta el último registro (para pintar de rojo los huecos intermedios)
     registeredDates.forEach(d => { if (d > maxLimitStr) maxLimitStr = d; });
     
     // Determinar el rango de meses a renderizar
     let minStr = effectiveStartStr;
     registeredDates.forEach(d => { if (d < minStr) minStr = d; });
     
     let maxStr = maxLimitStr;
     
     if (maxStr < effectiveStartStr) {
       maxStr = effectiveStartStr;
     }
     
     const startRender = new Date(minStr + 'T12:00:00Z');
     const endRender = new Date(maxStr + 'T12:00:00Z');
     
     const monthsToRender = [];
     let iter = new Date(startRender.getUTCFullYear(), startRender.getUTCMonth(), 1, 12, 0, 0);
     const endLimit = new Date(endRender.getUTCFullYear(), endRender.getUTCMonth(), 1, 12, 0, 0);
     
     // Prevent infinite loops if dates are bad
     let safety = 0;
     while (iter <= endLimit && safety < 24) {
       monthsToRender.push(new Date(iter));
       iter.setUTCMonth(iter.getUTCMonth() + 1);
       safety++;
     }
     
     // Chronological order
     const maxIndex = monthsToRender.length - 1;
     let currentIndex = calendarMonthIndex === -1 ? maxIndex : calendarMonthIndex;
     // Safety clamp
     if (currentIndex < 0) currentIndex = 0;
     if (currentIndex > maxIndex) currentIndex = maxIndex;
     
     const monthStart = monthsToRender[currentIndex];
     
     const monthNames = ["ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"];

     const days = [];
     const currentMonth = monthStart.getUTCMonth();
     const currentYear = monthStart.getUTCFullYear();
     
     let curr = new Date(monthStart);
     while (curr.getUTCDay() !== 0) {
       curr.setUTCDate(curr.getUTCDate() - 1);
     }
     
     // Stop generating rows if we've filled the month
     for (let i = 0; i < 42; i++) {
        const dStr = curr.toISOString().split('T')[0];
        const isCurrentMonth = curr.getUTCMonth() === currentMonth;
        const isSunday = curr.getUTCDay() === 0;
        const isRegistered = registeredDates.has(dStr);
        const isFuture = dStr > maxLimitStr;
        const isBeforeStart = dStr < minStr;
        
        let bgColor = "#ffffff";
        let textCol = "#333333";
        let borderCol = "#e0e0e0";
        
        if (!isCurrentMonth) {
           bgColor = "#fafafa"; textCol = "#cccccc";
        } else if (isRegistered) {
           bgColor = "#c8e6c9"; textCol = "#1b5e20"; // Registrado
        } else if (isSunday || isBeforeStart || isFuture) {
           bgColor = "#eeeeee"; textCol = "#888888"; // Domingo / No prog
        } else {
           bgColor = "#ffcdd2"; textCol = "#b71c1c"; // No registrado
        }
        
        days.push(
          <div key={dStr} className="h-10 flex flex-col items-center justify-center border font-bold text-sm" style={{ backgroundColor: bgColor, color: textCol, borderColor: borderCol }}>
            {curr.getUTCDate()}
          </div>
        );
        curr.setUTCDate(curr.getUTCDate() + 1);
        
        if (!isCurrentMonth && i >= 28 && curr.getUTCDay() === 0) {
          break;
        }
     }
     
     return (
       <div className="mt-4 pt-4 border-t border-gray-200 text-left relative">
         <p className="text-sm font-bold text-gray-500 mb-2 text-center uppercase tracking-widest">Calendario de Avance</p>
         
         <div className="mb-4">
           {/* HEADER WITH ARROWS */}
           <div className="bg-blue-900 text-white text-xs font-bold flex items-center justify-between px-4 py-1.5 rounded-t tracking-widest border border-blue-900">
             <button 
                type="button"
                onClick={() => setCalendarMonthIndex(currentIndex - 1)}
                disabled={currentIndex === 0}
                className="text-white hover:text-amber-400 disabled:opacity-30 disabled:hover:text-white px-2 text-lg leading-none"
             >
               &#9664;
             </button>
             <span>{monthNames[currentMonth]} {currentYear}</span>
             <button 
                type="button"
                onClick={() => setCalendarMonthIndex(currentIndex + 1)}
                disabled={currentIndex === maxIndex}
                className="text-white hover:text-amber-400 disabled:opacity-30 disabled:hover:text-white px-2 text-lg leading-none"
             >
               &#9654;
             </button>
           </div>
           
           <div className="grid grid-cols-7 gap-0 border border-gray-300 rounded-b overflow-hidden shadow-sm">
             {['DO','LU','MA','MI','JU','VI','SA'].map(d => <div key={d} className="bg-white border-b border-gray-200 text-[11px] font-black text-gray-500 text-center py-2">{d}</div>)}
             {days}
           </div>
         </div>

         {/* LEYENDA (matching the user's HTML) */}
         <div className="mt-4 p-3 rounded-lg bg-white border border-gray-200 shadow-sm text-[11px] text-center">
           <b className="text-gray-700 block mb-2">📌 Leyenda:</b>
           <div className="flex flex-wrap justify-center gap-3">
             <span className="px-3 py-1.5 rounded-md font-medium text-green-900" style={{backgroundColor: '#c8e6c9'}}>✔ Registrado</span>
             <span className="px-3 py-1.5 rounded-md font-medium text-red-900" style={{backgroundColor: '#ffcdd2'}}>✖ No registrado</span>
             <span className="px-3 py-1.5 rounded-md font-medium text-gray-700" style={{backgroundColor: '#eeeeee'}}>Domingo / Feriado / No prog.</span>
           </div>
         </div>
       </div>
     );
  }

  const displayedList = filterActivos ? attendanceList.filter(item => !item.isHistoricalBaja) : attendanceList

  return (
    <PageLayout className="p-4 md:p-6 space-y-6 overflow-y-auto">
      <PageHeader
        title="Asistencia de Capacitación"
        subtitle="Registro y monitoreo de asistencia diaria por grupo"
        actions={
          <>
            {/* Guardar */}
            <button
              onClick={handleSave}
              disabled={saving || !selectedGrupo}
              className="flex items-center gap-2 bg-[var(--accent)] hover:opacity-90 active:scale-95 text-white font-bold text-sm py-2 px-5 rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
            >
              <Save size={15} /> {saving ? 'Guardando...' : 'Guardar'}
            </button>

            {/* Calendario */}
            <button
              onClick={() => { setCalendarMonthIndex(-1); setShowCalendarModal(true); }}
              className="flex items-center gap-2 bg-[var(--bg-surface)] hover:bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-primary)] font-semibold text-sm py-2 px-4 rounded-lg transition-all active:scale-95"
            >
              <CalendarIcon size={15} /> Calendario
            </button>

            {/* Filtrar activos */}
            <button
              onClick={() => setFilterActivos(true)}
              className={`flex items-center gap-2 font-semibold text-sm py-2 px-4 rounded-lg border transition-all active:scale-95 ${filterActivos ? 'bg-[var(--accent)] text-white border-[var(--accent)]' : 'bg-[var(--bg-surface)] hover:bg-[var(--bg-elevated)] border-[var(--border-subtle)] text-[var(--text-primary)]'}`}
            >
              <Filter size={15} /> Activos
            </button>

            {/* Desfiltrar */}
            <button
              onClick={() => setFilterActivos(false)}
              className="flex items-center gap-2 bg-[var(--bg-surface)] hover:bg-rose-500/10 border border-[var(--border-subtle)] hover:border-rose-500/30 text-rose-500 font-semibold text-sm py-2 px-4 rounded-lg transition-all active:scale-95"
            >
              <Undo2 size={15} /> Todo
            </button>

            {/* Leyenda */}
            <div className="relative group">
              <button className="flex items-center gap-2 bg-[var(--bg-surface)] hover:bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-primary)] font-semibold text-sm py-2 px-4 rounded-lg transition-all">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"/></svg>
                Leyenda <span className="opacity-50 text-xs">▾</span>
              </button>
              {/* Dropdown leyenda custom dark style */}
              <div className="hidden group-hover:block absolute top-full right-0 mt-1.5 z-40 bg-[var(--bg-elevated)] backdrop-blur-md border border-[var(--border-subtle)] rounded-xl shadow-2xl overflow-hidden w-60 select-none animate-fadeIn text-[var(--text-primary)]">
                <div className="text-[10px] font-bold text-[var(--text-muted)] tracking-wider px-4 py-2.5 uppercase border-b border-[var(--border-subtle)]">
                  ESTADOS DE ASISTENCIA
                </div>
                <div className="py-1">
                  {SIGLAS.map(s => (
                    <div key={s.value} className="flex items-center gap-3 px-4 py-2 hover:bg-[var(--bg-base)] transition-colors">
                      <span className="font-bold text-[9px] w-10 text-center rounded py-0.5" style={{ backgroundColor: `${s.color}25`, color: s.color, border: `1px solid ${s.color}40` }}>
                        {s.value}
                      </span>
                      <span className="text-xs text-[var(--text-secondary)] font-medium">{s.label.split(' - ')[1] || s.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        }
      />

      {/* ── FILTERS — single row, flat ── */}
      <Card className="mb-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-6 gap-4 items-end">
          {/* PERIODO */}
          <div className="flex flex-col gap-1.5 w-full">
            <span className="text-[10px] font-bold uppercase text-[var(--text-muted)] tracking-wider">PERIODO</span>
            <div className="relative w-full">
              <select
                value={selectedPeriodo}
                onChange={e => setSelectedPeriodo(e.target.value)}
                className="form-input w-full appearance-none pr-8"
              >
                <option value="">Todos</option>
                {periodos.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <svg className="absolute right-3 top-1/2 -translate-y-1/2 w-3 h-3 text-[var(--text-muted)] pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7"/></svg>
            </div>
          </div>

          {/* SEGMENTO */}
          <div className="flex flex-col gap-1.5 w-full">
            <span className="text-[10px] font-bold uppercase text-[var(--text-muted)] tracking-wider">SEGMENTO</span>
            <div className="relative w-full">
              <select
                value={selectedSegmento}
                onChange={e => setSelectedSegmento(e.target.value)}
                disabled={!selectedPeriodo && periodos.length > 0}
                className="form-input w-full appearance-none pr-8 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <option value="">Todos</option>
                {segmentos.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <svg className="absolute right-3 top-1/2 -translate-y-1/2 w-3 h-3 text-[var(--text-muted)] pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7"/></svg>
            </div>
          </div>

          {/* CAMPAÑA */}
          <div className="flex flex-col gap-1.5 w-full">
            <span className="text-[10px] font-bold uppercase text-[var(--text-muted)] tracking-wider">CAMPAÑA</span>
            <div className="relative w-full">
              <select
                value={selectedCampana}
                onChange={e => setSelectedCampana(e.target.value)}
                disabled={!selectedSegmento && segmentos.length > 0}
                className="form-input w-full appearance-none pr-8 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <option value="">Todas</option>
                {campanas.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <svg className="absolute right-3 top-1/2 -translate-y-1/2 w-3 h-3 text-[var(--text-muted)] pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7"/></svg>
            </div>
          </div>

          {/* GRUPO */}
          <div className="flex flex-col gap-1.5 w-full">
            <span className="text-[10px] font-bold uppercase text-[var(--text-muted)] tracking-wider">GRUPO</span>
            <div className="relative w-full">
              <select
                value={selectedGrupo}
                onChange={e => setSelectedGrupo(e.target.value)}
                disabled={!selectedCampana && campanas.length > 0}
                className="form-input w-full appearance-none pr-8 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <option value="">Seleccionar</option>
                {gruposFiltrados.map(g => (
                  <option key={g.id || g.codigo} value={g.codigo}>
                    {String(g.codigo).startsWith('PROY-') ? '—' : (String(g.codigo).replace(/_\d+$/, '') || 'SIN CÓDIGO')}
                  </option>
                ))}
              </select>
              <svg className="absolute right-3 top-1/2 -translate-y-1/2 w-3 h-3 text-[var(--text-muted)] pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7"/></svg>
            </div>
          </div>

          {/* FORMADOR */}
          <div className="flex flex-col gap-1.5 w-full">
            <span className="text-[10px] font-bold uppercase text-[var(--text-muted)] tracking-wider">FORMADOR</span>
            <input
              type="text"
              readOnly
              value={activeGrupoObj ? (formadores.find(f => f.documento === activeGrupoObj.formador_documento)?.nombre_completo || 'SIN ASIGNAR') : ''}
              placeholder="Buscar formador"
              className="form-input w-full cursor-not-allowed uppercase"
            />
          </div>

          {/* FECHA REGISTRO */}
          <div className="flex flex-col gap-1.5 w-full">
            <span className="text-[10px] font-bold uppercase text-[var(--text-muted)] tracking-wider">FECHA ASISTENCIA</span>
            <div className="relative w-full" ref={datePickerRef}>
              <div 
                onClick={() => setShowDatePickerPopup(!showDatePickerPopup)} 
                className="form-input w-full flex items-center justify-between cursor-pointer select-none py-[9px]"
              >
                <span className="truncate">{formatDisplayDate(fecha)}</span>
                <CalendarIcon size={14} className="text-[var(--accent)] shrink-0" />
              </div>
              
              {showDatePickerPopup && (
                <div 
                  className="absolute top-full right-0 mt-2.5 z-50 bg-[#111827] border border-slate-800 rounded-xl shadow-2xl p-4 w-64 select-none animate-fadeIn text-slate-200"
                  onClick={e => e.stopPropagation()}
                >
                  {/* Header month & arrows */}
                  <div className="flex items-center justify-between mb-3.5">
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
                      className="text-slate-400 hover:text-white p-1 font-bold text-sm"
                    >
                      &lt;
                    </button>
                    <span className="font-bold text-sm text-slate-100 uppercase tracking-wide">
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
                      className="text-slate-400 hover:text-white p-1 font-bold text-sm"
                    >
                      &gt;
                    </button>
                  </div>
                  
                  {/* Weekdays */}
                  <div className="grid grid-cols-7 gap-1 text-center mb-2">
                    {['D', 'L', 'M', 'M', 'J', 'V', 'S'].map((w, idx) => (
                      <span key={idx} className="text-[10px] font-black text-slate-500 uppercase">
                        {w}
                      </span>
                    ))}
                  </div>
                  
                  {/* Days grid */}
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
                          className={`h-8 w-8 text-xs font-semibold rounded-full flex items-center justify-center transition-all ${
                            isSelected 
                              ? 'bg-blue-600 text-white font-bold' 
                              : d.isCurrentMonth 
                                ? 'text-slate-200 hover:bg-slate-800' 
                                : 'text-slate-600 hover:bg-slate-850'
                          }`}
                        >
                          {d.day}
                        </button>
                      );
                    })}
                  </div>

                  {/* Hoy Button */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      const todayStr = new Date().toISOString().split('T')[0];
                      setFecha(todayStr);
                      setShowDatePickerPopup(false);
                    }}
                    className="mt-3.5 w-full bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold py-2 rounded-lg text-xs transition-colors"
                  >
                    Hoy
                  </button>
                </div>
              )}
            </div>
          </div>

        </div>
        <p className="text-[10px] text-[var(--text-muted)] italic mt-4">*Nota: en Fecha Registro, da clic para colocar la fecha.</p>
      </Card>


      <Card noPadding className="mt-2">
        
        <div className="flex justify-between items-center p-4 border-b border-[var(--border-subtle)]">
          <div className="flex flex-col space-y-1">
            <h2 className="text-lg font-black text-[var(--text-primary)]">Resultados</h2>
            <p className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-wider">
              {displayedList.length} postulantes encontrados
            </p>
          </div>
          <button 
            onClick={exportToExcel} 
            disabled={displayedList.length === 0} 
            className="flex flex-col items-center gap-1 hover:scale-105 active:scale-95 transition-all cursor-pointer disabled:opacity-30"
            title="Exportar a Excel"
          >
            <svg viewBox="0 0 56 56" xmlns="http://www.w3.org/2000/svg" className="block h-8 w-8 overflow-visible">
              <path fill="#1F7A3F" d="M33 7h14c1.3 0 2.4 1.1 2.4 2.4v37.2c0 1.3-1.1 2.4-2.4 2.4H33z"/>
              <path fill="#2E9D55" d="M33 12h12v6H33zm0 8h12v6H33zm0 8h12v6H33zm0 8h12v6H33z"/>
              <path fill="#185C37" d="M8.4 13.4 33 8.6v38.8L8.4 42.6c-.7-.1-1.2-.7-1.2-1.4V14.8c0-.7.5-1.3 1.2-1.4z"/>
              <path fill="#FFFFFF" d="m16 20.3 3.8 6.3 4-6.3h4.6l-6.2 8.9 6.4 8.9h-4.8l-4.2-6.6-4.2 6.6h-4.5l6.4-8.9-6-8.9z"/>
            </svg>
            <span className="text-[10px] font-semibold text-[var(--text-secondary)]">
              Excel
            </span>
          </button>
        </div>

        <div className="overflow-x-auto table-scroll">
          <table className="w-full text-left border-collapse text-[11px]">
            <thead className="bg-[var(--table-head-bg)] text-[var(--text-primary)] border-b border-[var(--border-subtle)]">
              <tr>
                <th className="px-4 py-3 font-bold uppercase tracking-wide text-[var(--text-secondary)] whitespace-nowrap">DOCUMENTO</th>
                <th className="px-4 py-3 font-bold uppercase tracking-wide text-[var(--text-secondary)] whitespace-nowrap">APELLIDO PATERNO</th>
                <th className="px-4 py-3 font-bold uppercase tracking-wide text-[var(--text-secondary)] whitespace-nowrap">APELLIDO MATERNO</th>
                <th className="px-4 py-3 font-bold uppercase tracking-wide text-[var(--text-secondary)] whitespace-nowrap">NOMBRES</th>
                <th className="px-4 py-3 font-bold uppercase tracking-wide text-[var(--text-secondary)] whitespace-nowrap">CELULAR</th>
                <th className="px-4 py-3 font-bold uppercase tracking-wide text-center text-[var(--text-secondary)] whitespace-nowrap">FECHA ASISTENCIA</th>
                <th className="px-4 py-3 font-bold uppercase tracking-wide text-center text-[var(--text-secondary)] whitespace-nowrap">TIPO RECLUTADO</th>
                <th className="px-4 py-3 font-bold uppercase tracking-wide text-center text-[var(--text-secondary)] whitespace-nowrap">ESTADO</th>
                <th className="px-4 py-3 font-bold uppercase tracking-wide text-center text-[var(--text-secondary)] whitespace-nowrap">SIGLA</th>
                <th className="px-4 py-3 font-bold uppercase tracking-wide text-[var(--text-secondary)] whitespace-nowrap">MOTIVO DE BAJA</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {displayedList.length > 0 ? displayedList.map((item, index) => {
                const isBaja = item.sigla === 'B'
                const estadoLabel = isBaja ? 'CESADO' : 'ACTIVO'
                
                let siglaOpt = SIGLAS.find(s => s.value === item.sigla)
                let siglaStyle = siglaOpt ? { backgroundColor: siglaOpt.bgColor, color: siglaOpt.color, border: `2px solid ${siglaOpt.color}` } : {}

                return (
                  <tr key={item.documento} className="hover:bg-[var(--bg-muted)] transition-colors group">
                    <td className="px-4 py-3 font-mono text-[var(--text-primary)] whitespace-nowrap">{item.documento}</td>
                    <td className="px-4 py-3 uppercase text-[var(--text-secondary)] whitespace-nowrap">{item.apellido_paterno}</td>
                    <td className="px-4 py-3 uppercase text-[var(--text-secondary)] whitespace-nowrap">{item.apellido_materno}</td>
                    <td className="px-4 py-3 uppercase text-[var(--text-primary)] font-semibold whitespace-nowrap">{item.nombres}</td>
                    <td className="px-4 py-3 text-[var(--text-secondary)] font-mono whitespace-nowrap">{item.celular}</td>
                    <td className="px-4 py-3 text-center text-[var(--text-secondary)] font-mono whitespace-nowrap">{formatSpreadsheetDate(fecha)}</td>
                    <td className="px-4 py-3 text-center whitespace-nowrap">
                      <span className={`inline-block px-2 py-1 rounded-md text-[9px] font-black uppercase tracking-wide ${item.tipoReclutado === 'AGREGADO' ? 'bg-orange-500/10 text-orange-400 border border-orange-500/20' : 'text-[var(--text-muted)] bg-[var(--bg-elevated)] border border-[var(--border-subtle)]'}`}>
                         {item.tipoReclutado}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center whitespace-nowrap">
                      <span className={`inline-block px-2 py-1 rounded-md text-[9px] font-black border uppercase tracking-wide shadow-sm ${isBaja ? 'bg-red-500/10 border-red-500/30 text-red-400' : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500'}`}>
                        {estadoLabel}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center whitespace-nowrap">
                      {item.isLateInclusion ? (
                         <span className="text-[var(--text-muted)] font-bold bg-[var(--bg-elevated)] px-2 py-1 rounded-md border border-[var(--border-subtle)]">N/A</span>
                      ) : (
                         <div className="relative inline-block w-full">
                           <select value={item.sigla} onChange={(e) => handleStatusChange(item.documento, e.target.value)}
                             disabled={item.isLockedBaja}
                             className={`w-full rounded-md py-1 px-1 font-black text-center outline-none shadow-sm appearance-none ${item.isLockedBaja ? 'cursor-not-allowed opacity-70' : 'cursor-pointer hover:opacity-90 transition-opacity'}`}
                             style={siglaStyle}>
                             {SIGLAS.map(s => <option key={s.value} value={s.value} style={{backgroundColor: '#fff', color: '#000'}}>{s.value}</option>)}
                           </select>
                         </div>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {!item.isLateInclusion && isBaja ? (
                        <div className="flex items-center gap-2">
                          <AlertTriangle size={14} className="text-red-500 flex-shrink-0" />
                          <select value={item.motivo_baja} onChange={e => handleMotiveChange(item.documento, e.target.value)}
                            disabled={item.isLockedBaja || (item.isFirstRecordGroup && item.motivo_baja === 'BAJA DIA 1')}
                            className={`w-full max-w-[200px] border border-red-500/30 rounded p-1.5 text-[10px] font-semibold text-red-400 bg-red-500/10 focus:border-red-500 outline-none ${item.isLockedBaja || (item.isFirstRecordGroup && item.motivo_baja === 'BAJA DIA 1') ? 'opacity-70 cursor-not-allowed' : ''}`}>
                            {item.isFirstRecordGroup ? (
                              <option value="BAJA DIA 1">BAJA DIA 1</option>
                            ) : (
                              <>
                                <option value="" disabled>Seleccione motivo</option>
                                {item.motivo_baja === 'BAJA DIA 1' && <option value="BAJA DIA 1">BAJA DIA 1</option>}
                                {motivosBaja.filter(m => m.motivo !== 'BAJA DIA 1').map(m => <option key={m.motivo} value={m.motivo}>{m.motivo}</option>)}
                              </>
                            )}
                          </select>
                        </div>
                      ) : (
                         <span className="text-[var(--text-muted)]">—</span>
                      )}
                    </td>
                  </tr>
                )
              }) : (
                <tr>
                  <td colSpan="10" className="p-16 text-center text-[var(--text-muted)]">
                    <div className="flex flex-col items-center justify-center space-y-4">
                      <div className="relative w-16 h-16 rounded-full border-4 border-dashed border-[var(--border-normal)] animate-spin flex items-center justify-center" style={{ animationDuration: '8s' }}>
                        <div className="w-8 h-8 rounded-full bg-[var(--bg-elevated)] flex items-center justify-center animate-none">
                          <span className="text-xs">🔍</span>
                        </div>
                      </div>
                      <div>
                        <p className="text-base font-bold text-[var(--text-primary)]">No hay postulantes para mostrar</p>
                        <p className="text-xs text-[var(--text-muted)] mt-1">Ajusta los filtros o el rango de fechas para ver resultados.</p>
                      </div>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {savedSuccess && successInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-primary)] rounded-2xl shadow-2xl p-6 max-w-sm w-full text-center space-y-4">
             <div className="w-16 h-16 bg-emerald-500/10 text-emerald-500 rounded-full flex items-center justify-center mx-auto border border-emerald-500/20">
                <CheckCircle size={36} />
             </div>
             <h3 className="text-xl font-bold text-[var(--text-primary)]">¡Asistencia Guardada!</h3>
             <div className="bg-[var(--bg-elevated)] border border-[var(--border-subtle)] p-4 rounded-xl text-left space-y-2 text-sm text-[var(--text-secondary)]">
                <p><strong>Grupo:</strong> {successInfo.grupo}</p>
                <p><strong>Presentes:</strong> {successInfo.presentes}</p>
                <p><strong>Bajas:</strong> {successInfo.bajas}</p>
                <p><strong>Ausentes:</strong> {successInfo.ausentes}</p>
             </div>
             {renderCalendar()}
             <button onClick={() => setSavedSuccess(false)} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 rounded-xl transition-all">Cerrar</button>
          </div>
        </div>
      )}

      {showCalendarModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-primary)] rounded-2xl shadow-2xl p-6 max-w-md w-full text-center space-y-4">
             <div className="flex items-center justify-center gap-2 text-amber-500 mb-2">
                <CalendarIcon size={28} />
                <h3 className="text-xl font-black uppercase tracking-wide">Avance de Asistencia</h3>
             </div>
             {renderCalendar()}
             <button onClick={() => setShowCalendarModal(false)} className="w-full bg-amber-500 hover:bg-amber-600 text-white font-bold py-2.5 rounded-xl uppercase tracking-wider mt-4 transition-all">
               Cerrar Calendario
             </button>
          </div>
        </div>
      )}

      {successInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-8 rounded-2xl shadow-2xl max-w-sm w-full text-center relative overflow-hidden">
            <div className="w-16 h-16 mx-auto mb-4 bg-emerald-500/10 text-emerald-500 rounded-full flex items-center justify-center">
              <CheckCircle size={32} />
            </div>
            <h3 className="text-xl font-bold mb-2 text-[var(--text-primary)]">¡Guardado Exitoso!</h3>
            <p className="text-[var(--text-secondary)] mb-6 text-sm">{successInfo.count} registros de asistencia almacenados correctamente.</p>
            <button
              onClick={() => setSuccessInfo(null)}
              className="w-full bg-[var(--accent)] hover:bg-[var(--accent-glow)] text-white font-bold py-3 px-4 rounded-xl transition-all shadow-lg active:scale-95"
            >
              Aceptar
            </button>
          </div>
        </div>
      )}

    </PageLayout>
  )
}
