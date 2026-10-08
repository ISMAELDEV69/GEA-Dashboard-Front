import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Save, CheckCircle, Download, AlertCircle, AlertTriangle, X, RotateCcw, Pencil } from 'lucide-react';
import { savePropuesta, fetchCapacidadRysOperativo, fetchPropuestaByGrupo, fetchPropuestasConsolidado } from '../lib/dataService';
import PageLayout from './ui/PageLayout';
import PageHeader from './ui/PageHeader';
import Card from './ui/Card';
import { parsePropuestaToConsolidado, formatFechaDDMMYYYY } from '../lib/propuestaParser';

export default function PropuestaForm({ onSaved, editingPropuesta, onCancelEdit }) {
  const tableRef = useRef(null);
  
  const [gruposCapacidad, setGruposCapacidad] = useState([]);
  const [propuestasConsolidadas, setPropuestasConsolidadas] = useState([]);
  const [filtroPeriodo, setFiltroPeriodo] = useState('');
  const [filtroSegmento, setFiltroSegmento] = useState('');
  const [filtroCampana, setFiltroCampana] = useState('');
  const [duplicateWarning, setDuplicateWarning] = useState(null);
  const [manualInput, setManualInput] = useState(false);
  const [noticeMsg, setNoticeMsg] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);

  const initialFormState = {
    id: null,
    titulo: 'CONTACTADOS - COMAS',
    horario: '',
    fullTime: '',
    basico: '',
    bonoMovilidad: '',
    variable: '',
    
    // Bonos y Pagos específicos
    bBienvenidaM1: 0, bBienvenidaM2: 0, bBienvenidaM3: 0, bBienvenidaObs: '',
    bPermM1: 0, bPermM2: 0, bPermM3: 0, bPermM4: 0, bPermObs: '',
    bAsisM1: 0, bAsisM2: 0, bAsisM3: 0, bAsisObs: '',
    
    pagoCapaTotal: 0,
    pagoCapaPorDia: 0,
    
    // Capacitación
    capacitacionObs: '',
    diasCapa: 0,
    horarioCapacitacion: '',
    inicio: '',
    fin: '',
    ojt: '',
    ingresoOperacion: '',
    
    // Pagos
    quincena1: '',
    finMes1: '',
    finMes2: '',
    
    // Obs
    obs1: '',
    obs2: '',
    obs3: '',
    
    // Hidden technical fields for consolidation
    periodoCapa: '',
    semana: '',
    segmento: '',
    cod: '',
    cantDiasFeriados: 0,
    mesAfectacionCapa: '',
    mesAfectacionBonos: '',
    modalidad: 'Remoto',
    condicionLaboral: 'Planilla Completa',
    campana: '',
    grupo: ''
  };

  const [formData, setFormData] = useState(initialFormState);
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    Promise.all([
      fetchCapacidadRysOperativo(),
      fetchPropuestasConsolidado()
    ]).then(([caps, props]) => {
      setGruposCapacidad(caps || []);
      setPropuestasConsolidadas(props || []);
    });
  }, []);

  // Cargar si viene propuesta a editar desde la vista consolidada
  useEffect(() => {
    if (editingPropuesta) {
      const p = editingPropuesta;
      setFormData(prev => ({
        ...prev,
        ...p,
        id: p.propuesta_id || p.id || null,
        titulo: p.titulo || (p.campana && p.grupo ? `${p.campana} - ${p.grupo}` : prev.titulo),
        periodoCapa: p.periodoCapa || p.periodo || '',
        semana: p.semana || p.semana_trabajo || '',
        segmento: p.segmento || '',
        campana: p.campana || '',
        grupo: p.grupo || p.grupo_codigo || '',
        cod: p.cod || (p.campana && p.grupo ? `${p.campana} - ${p.grupo}` : ''),
        modalidad: p.modalidad || 'Remoto',
        condicionLaboral: p.condicionLaboral || 'Planilla Completa',
        inicio: formatFechaDDMMYYYY(p.fechaInicioCapa || p.inicio || ''),
        ingresoOperacion: formatFechaDDMMYYYY(p.ingresoOperacion || ''),
        fin: formatFechaDDMMYYYY(p.fin || ''),
        ojt: formatFechaDDMMYYYY(p.ojt || ''),
        pagoCapaPorDia: p.pagoPorDia ?? p.pagoCapaPorDia ?? 0,
        pagoCapaTotal: p.pagoCompleto ?? p.pagoCapaTotal ?? 0,
        diasCapa: p.diasCapa ?? 0,
        cantDiasFeriados: p.cantDiasFeriados ?? 0,
        bBienvenidaM1: p.bonoBienvenidaM1 ?? p.bBienvenidaM1 ?? 0,
        bBienvenidaM2: p.bonoBienvenidaM2 ?? p.bBienvenidaM2 ?? 0,
        bBienvenidaM3: p.bonoBienvenidaM3 ?? p.bBienvenidaM3 ?? 0,
        bPermM1: p.bonoPermanenciaM1 ?? p.bPermM1 ?? 0,
        bPermM2: p.bonoPermanenciaM2 ?? p.bPermM2 ?? 0,
        bPermM3: p.bonoPermanenciaM3 ?? p.bPermM3 ?? 0,
        bPermM4: p.bonoPermanenciaM4 ?? p.bPermM4 ?? 0,
        bAsisM1: p.bonoAsistenciaM1 ?? p.bAsisM1 ?? 0,
        bAsisM2: p.bonoAsistenciaM2 ?? p.bAsisM2 ?? 0,
        bAsisM3: p.bonoAsistenciaM3 ?? p.bAsisM3 ?? 0,
      }));
      if (p.periodoCapa) setFiltroPeriodo(p.periodoCapa);
      if (p.segmento) setFiltroSegmento(p.segmento);
      if (p.campana) setFiltroCampana(p.campana);
      setNoticeMsg(`Modo edición activado para propuesta: ${p.campana || ''} - ${p.grupo || ''}`);
    }
  }, [editingPropuesta]);

  const generateMonthOptions = () => {
    const options = [];
    const now = new Date();
    for (let i = -3; i <= 3; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      options.push(`${year}${month}`);
    }
    return options;
  };
  const monthOptions = generateMonthOptions();

  // ── FILTROS EN CASCADA ───────────────────────────────────────────
  // 1. Periodo
  const periodosUnicos = useMemo(() => {
    return [...new Set(gruposCapacidad.map(g => g.periodo).filter(Boolean))].sort();
  }, [gruposCapacidad]);

  // 2. Segmento (filtrado por Periodo)
  const segmentosFiltrados = useMemo(() => {
    let list = gruposCapacidad;
    if (filtroPeriodo) list = list.filter(g => g.periodo === filtroPeriodo);
    return [...new Set(list.map(g => g.segmento).filter(Boolean))].sort();
  }, [gruposCapacidad, filtroPeriodo]);

  // 3. Campaña (filtrada por Periodo + Segmento)
  const campanasFiltradas = useMemo(() => {
    let list = gruposCapacidad;
    if (filtroPeriodo) list = list.filter(g => g.periodo === filtroPeriodo);
    if (filtroSegmento) list = list.filter(g => g.segmento === filtroSegmento);
    return [...new Set(list.map(g => g.campana).filter(Boolean))].sort();
  }, [gruposCapacidad, filtroPeriodo, filtroSegmento]);

  // 4. Grupos (filtrados por Periodo + Segmento + Campaña)
  const gruposFiltrados = useMemo(() => {
    let list = gruposCapacidad;
    if (filtroPeriodo) list = list.filter(g => g.periodo === filtroPeriodo);
    if (filtroSegmento) list = list.filter(g => g.segmento === filtroSegmento);
    if (filtroCampana) list = list.filter(g => g.campana === filtroCampana);
    return list.sort((a,b) => (a.codigo || '').localeCompare(b.codigo || ''));
  }, [gruposCapacidad, filtroPeriodo, filtroSegmento, filtroCampana]);

  // Detector de propuesta existente
  const isGrupoRegistrado = useCallback((codigo, campana, periodo, segmento) => {
    const cNorm = String(campana || filtroCampana || '').trim().toUpperCase();
    const gNorm = String(codigo || '').trim().toUpperCase();
    const pNorm = String(periodo || filtroPeriodo || '').trim().toUpperCase();
    const sNorm = String(segmento || filtroSegmento || '').trim().toUpperCase();

    return propuestasConsolidadas.find(p => {
      const matchG = String(p.grupo || p.grupo_codigo || '').trim().toUpperCase() === gNorm;
      const matchC = !cNorm || String(p.campana || '').trim().toUpperCase() === cNorm;
      const matchP = !pNorm || String(p.periodoCapa || p.periodo || '').trim().toUpperCase() === pNorm;
      const matchS = !sNorm || !p.segmento || String(p.segmento || '').trim().toUpperCase() === sNorm;
      return matchG && matchC && matchP && matchS;
    });
  }, [propuestasConsolidadas, filtroCampana, filtroPeriodo, filtroSegmento]);

  const grupoEnCapacidad = useMemo(() => {
    if (!formData.grupo) return null;
    const gNorm = String(formData.grupo).trim().toUpperCase();
    return gruposCapacidad.find(x => String(x.codigo || '').trim().toUpperCase() === gNorm);
  }, [formData.grupo, gruposCapacidad]);

  const handleGrupoInput = async (inputCode) => {
    const code = String(inputCode || '').toUpperCase().trim();
    
    // Actualizar siempre el valor en formData
    setFormData(prev => ({
      ...prev,
      grupo: code,
      cod: prev.campana ? `${prev.campana} - ${code}` : code,
      titulo: prev.titulo && !prev.titulo.includes('-') ? `${prev.campana || ''} - ${code}` : (prev.titulo || `${prev.campana || ''} - ${code}`)
    }));

    if (!code) {
      setDuplicateWarning(null);
      return;
    }

    // Buscar si el código coincide con algún grupo en Capacidad RyS
    let match = gruposCapacidad.find(x => 
      String(x.codigo || '').toUpperCase().trim() === code &&
      (!filtroCampana || String(x.campana || '').toUpperCase().trim() === String(filtroCampana).toUpperCase().trim()) &&
      (!filtroPeriodo || String(x.periodo || '').toUpperCase().trim() === String(filtroPeriodo).toUpperCase().trim())
    );

    if (!match) {
      match = gruposCapacidad.find(x => String(x.codigo || '').toUpperCase().trim() === code);
    }

    if (match) {
      // Sincronizar filtros automáticamente con los datos de Capacidad
      if (match.periodo) setFiltroPeriodo(match.periodo);
      if (match.segmento) setFiltroSegmento(match.segmento);
      if (match.campana) setFiltroCampana(match.campana);

      // Verificar si ya existe una propuesta guardada en Supabase para este grupo
      const existing = await fetchPropuestaByGrupo(match.codigo, match.campana, match.periodo, match.segmento);

      if (existing) {
        setDuplicateWarning({
          existing,
          periodo: match.periodo || existing.periodoCapa,
          segmento: match.segmento || existing.segmento,
          campana: match.campana || existing.campana,
          grupo: match.codigo || existing.grupo,
        });

        setFormData(prev => ({
          ...prev,
          ...existing,
          id: existing.id || existing.propuesta_id || null,
          periodoCapa: match.periodo || existing.periodoCapa || '',
          semana: match.semana_label || match.semana_trabajo || existing.semana || '',
          segmento: match.segmento || existing.segmento || '',
          modalidad: match.modalidad || existing.modalidad || 'Remoto',
          condicionLaboral: match.condicion || existing.condicionLaboral || 'Planilla Completa',
          cod: `${match.campana || ''} - ${match.codigo || ''}`,
          titulo: existing.titulo || `${match.campana || ''} - ${match.codigo || ''}`,
          campana: match.campana || existing.campana || '',
          grupo: match.codigo || existing.grupo || '',
          inicio: formatFechaDDMMYYYY(existing.inicio || match.fecha_registro || ''),
          ingresoOperacion: formatFechaDDMMYYYY(existing.ingresoOperacion || match.fecha_ingreso_op || ''),
          fin: formatFechaDDMMYYYY(existing.fin || ''),
          ojt: formatFechaDDMMYYYY(existing.ojt || match.fecha_inicio_ojt || ''),
          pagoCapaPorDia: existing.pagoCapaPorDia ?? existing.pagoPorDia ?? prev.pagoCapaPorDia,
          pagoCapaTotal: existing.pagoCapaTotal ?? existing.pagoCompleto ?? prev.pagoCapaTotal,
          diasCapa: existing.diasCapa ?? prev.diasCapa,
        }));
        setNoticeMsg(`ℹ Propuesta existente cargada para ${match.campana} - ${match.codigo}.`);
      } else {
        setDuplicateWarning(null);
        setFormData(prev => ({
          ...prev,
          id: null,
          periodoCapa: match.periodo || '',
          semana: match.semana_label || match.semana_trabajo || '',
          segmento: match.segmento || '',
          modalidad: match.modalidad || 'Remoto',
          condicionLaboral: match.condicion || 'Planilla Completa',
          cod: `${match.campana || ''} - ${match.codigo || ''}`,
          titulo: `${match.campana || ''} - ${match.codigo || ''}`,
          campana: match.campana || '',
          grupo: match.codigo || '',
          inicio: formatFechaDDMMYYYY(match.fecha_registro || ''),
          ingresoOperacion: formatFechaDDMMYYYY(match.fecha_ingreso_op || ''),
          fin: '',
          ojt: formatFechaDDMMYYYY(match.fecha_inicio_ojt || '')
        }));
        setNoticeMsg(`✓ Grupo ${match.codigo} sincronizado con Capacidad RyS: ${match.campana}`);
      }
    } else {
      // Grupo escrito manualmente que aún no está en Capacidad RyS
      setDuplicateWarning(null);
      if (formData.campana) {
        handleManualCheck(code, formData.campana, formData.periodoCapa, formData.segmento);
      }
    }
  };

  const handleManualCheck = async (grupoVal, campanaVal, periodoVal, segmentoVal) => {
    const grp = grupoVal || formData.grupo;
    const cmp = campanaVal || formData.campana;
    const per = periodoVal || formData.periodoCapa;
    const seg = segmentoVal || formData.segmento;
    if (grp && cmp) {
      const existing = await fetchPropuestaByGrupo(grp, cmp, per, seg);
      if (existing && (!formData.id || existing.id !== formData.id)) {
        setDuplicateWarning({
          existing,
          periodo: per || existing.periodoCapa,
          segmento: seg || existing.segmento,
          campana: cmp || existing.campana,
          grupo: grp || existing.grupo,
        });
      } else if (!existing) {
        setDuplicateWarning(null);
      }
    }
  };

  const handleChange = (e) => {
    const { name, value, type } = e.target;
    setFormData(prev => {
      const val = type === 'number' ? (value === '' ? '' : Number(value)) : value;
      const updated = { ...prev, [name]: val };
      
      // Auto-calcular pagoCapaTotal si cambia diasCapa o pagoCapaPorDia
      if (name === 'pagoCapaPorDia' || name === 'diasCapa') {
        const pd = name === 'pagoCapaPorDia' ? Number(val) || 0 : Number(prev.pagoCapaPorDia) || 0;
        const dc = name === 'diasCapa' ? Number(val) || 0 : Number(prev.diasCapa) || 0;
        if (pd && dc) {
          updated.pagoCapaTotal = pd * dc;
        }
      }
      return updated;
    });
  };

  // Normaliza fechas a DD/MM/YYYY al salir del campo
  const handleDateBlur = (e) => {
    const { name, value } = e.target;
    if (value) {
      const formatted = formatFechaDDMMYYYY(value);
      if (formatted !== value) {
        setFormData(prev => ({ ...prev, [name]: formatted }));
      }
    }
  };

  const handleSave = async () => {
    if (!formData.campana && !formData.titulo) {
      alert('Por favor especifica al menos la campaña o título de la propuesta.');
      return;
    }
    if (!formData.grupo) {
      alert('Por favor especifica el código del grupo.');
      return;
    }

    // Comprobación de seguridad contra duplicados en Supabase
    if (!formData.id) {
      const existing = await fetchPropuestaByGrupo(formData.grupo, formData.campana, formData.periodoCapa, formData.segmento);
      if (existing) {
        const confirmar = window.confirm(
          `⚠️ ALERTA DE DUPLICADO:\n\nYa existe una propuesta registrada en la base de datos para:\n• Periodo: ${formData.periodoCapa || 'N/A'}\n• Segmento: ${formData.segmento || 'N/A'}\n• Campaña: ${formData.campana}\n• Grupo: ${formData.grupo}\n\nPara no generar registros duplicados, ¿deseas ACTUALIZAR la propuesta existente con esta información?`
        );
        if (!confirmar) {
          setDuplicateWarning({
            existing,
            periodo: formData.periodoCapa,
            segmento: formData.segmento,
            campana: formData.campana,
            grupo: formData.grupo,
          });
          return;
        }
        formData.id = existing.id || existing.propuesta_id;
      }
    }

    setSaving(true);
    setErrorMsg(null);
    try {
      const normalizedForm = {
        ...formData,
        inicio: formatFechaDDMMYYYY(formData.inicio),
        fin: formatFechaDDMMYYYY(formData.fin),
        ojt: formatFechaDDMMYYYY(formData.ojt),
        ingresoOperacion: formatFechaDDMMYYYY(formData.ingresoOperacion),
      };
      const consolidado = parsePropuestaToConsolidado(normalizedForm);
      await savePropuesta(normalizedForm, consolidado);
      setSavedSuccess(true);
      setDuplicateWarning(null);

      // Refrescar lista de consolidados en segundo plano
      fetchPropuestasConsolidado().then(p => setPropuestasConsolidadas(p || []));

      setNoticeMsg(`✓ Propuesta para ${formData.campana || ''} - ${formData.grupo || ''} consolidada exitosamente en Supabase (sin duplicados).`);
      if (onSaved) onSaved();
      setTimeout(() => setSavedSuccess(false), 4000);
    } catch (err) {
      console.error("Error guardando propuesta:", err);
      setErrorMsg(err.message || 'Error al guardar propuesta en base de datos.');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setFormData(initialFormState);
    setFiltroPeriodo('');
    setFiltroSegmento('');
    setFiltroCampana('');
    setDuplicateWarning(null);
    setNoticeMsg(null);
    setErrorMsg(null);
    if (onCancelEdit) onCancelEdit();
  };

  const exportToExcel = () => {
    if (!tableRef.current) return;
    const tableClone = tableRef.current.cloneNode(true);
    const inputs = tableClone.querySelectorAll('input, textarea, select');
    inputs.forEach(input => {
      const span = document.createElement('span');
      span.innerText = input.value || input.placeholder || '';
      if (input.type === 'number' && input.value) {
        span.innerText = `S/ ${input.value}`;
      }
      span.style.fontWeight = window.getComputedStyle(input).fontWeight;
      span.style.textAlign = window.getComputedStyle(input).textAlign;
      input.parentNode.replaceChild(span, input);
    });

    const htmlTemplate = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
      <head>
        <meta charset="utf-8">
        <style>
          table { border-collapse: collapse; font-family: Arial, sans-serif; font-size: 12px; }
          td, th { border: 1px solid black; padding: 4px; }
          .bg-blue { background-color: #0070C0; color: white; font-weight: bold; text-align: center; }
          .bg-yellow { background-color: #FFFF00; }
          .label { font-weight: bold; width: 150px; }
        </style>
      </head>
      <body>${tableClone.outerHTML}</body>
      </html>
    `;

    const blob = new Blob([htmlTemplate], { type: 'application/vnd.ms-excel' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Propuesta_${(formData.campana || 'CAMPAÑA')}_${(formData.grupo || 'GRUPO')}.xls`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const inputClass = "w-full bg-[var(--input-bg)] border-none outline-none resize-none focus:ring-1 focus:ring-[var(--accent)] rounded px-1 py-0.5 text-[var(--text-primary)] placeholder-[var(--text-muted)]";
  const numClass = "w-16 bg-[var(--input-bg)] border border-[var(--input-border)] rounded px-1 text-xs text-center focus:outline-none focus:border-[var(--accent)] text-[var(--text-primary)]";
  const labelClass = "text-[var(--text-primary)] text-sm pr-2";
  
  return (
    <PageLayout className="p-4 md:p-6 space-y-6 overflow-y-auto">
      <PageHeader 
        title={formData.id ? `Editando Propuesta: ${formData.campana || ''} - ${formData.grupo || ''}` : "Formato de Propuesta Económica"} 
        subtitle="Generación y consolidación de acuerdos y tarifas de grupo para Reclutamiento"
        icon={Pencil}
        actions={
          <div className="flex items-center gap-2">
            {formData.id && (
              <button onClick={handleReset} className="btn-secondary flex items-center gap-1.5 text-xs">
                <RotateCcw size={14} /> Nueva Propuesta
              </button>
            )}
            <button onClick={exportToExcel} className="flex items-center gap-2 bg-[var(--accent)] hover:opacity-90 active:scale-95 text-white font-bold text-sm py-2 px-4 rounded-lg transition-all shadow-sm">
              <Download size={16} /> Exportar Excel
            </button>
          </div>
        }
      />

      {/* Avisos contextuales */}
      {noticeMsg && (
        <div className="flex items-center justify-between p-3 rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-300 text-sm">
          <div className="flex items-center gap-2">
            <CheckCircle size={16} className="text-blue-400 shrink-0" />
            <span>{noticeMsg}</span>
          </div>
          <button onClick={() => setNoticeMsg(null)} className="text-blue-400 hover:text-blue-200">
            <X size={14} />
          </button>
        </div>
      )}

      {errorMsg && (
        <div className="flex items-center justify-between p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-sm">
          <div className="flex items-center gap-2">
            <AlertCircle size={16} className="text-red-400 shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button onClick={() => setErrorMsg(null)} className="text-red-400 hover:text-red-200">
            <X size={14} />
          </button>
        </div>
      )}
      
      {/* Alerta de Propuesta Existente / Prevención de Duplicados */}
      {duplicateWarning && (
        <div className="p-4 rounded-xl bg-amber-500/10 border-2 border-amber-500/40 text-amber-200 shadow-lg flex flex-col md:flex-row items-start md:items-center justify-between gap-4 animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="flex items-start gap-3">
            <AlertTriangle className="text-amber-400 shrink-0 mt-0.5" size={24} />
            <div>
              <div className="font-bold text-amber-300 text-sm flex items-center gap-2">
                <span>¡ATENCIÓN: PROPUESTA YA REGISTRADA!</span>
                <span className="text-[10px] bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full border border-amber-500/40 font-mono">
                  Duplicado Evitado
                </span>
              </div>
              <p className="text-xs text-amber-200/90 mt-1">
                Ya existe una propuesta consolidada en Supabase para el grupo <strong className="text-white font-mono">{duplicateWarning.grupo}</strong> en la campaña <strong className="text-white">{duplicateWarning.campana}</strong> (Periodo: <strong className="font-mono">{duplicateWarning.periodo || 'N/A'}</strong>, Segmento: <strong>{duplicateWarning.segmento || 'N/A'}</strong>).
              </p>
              <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs text-amber-300/80">
                <span>Tarifa Día: <strong className="text-emerald-400 font-mono">S/ {Number(duplicateWarning.existing.pagoCapaPorDia || duplicateWarning.existing.pagoPorDia || 0).toFixed(2)}</strong></span>
                <span>•</span>
                <span>Días: <strong className="text-white font-mono">{duplicateWarning.existing.diasCapa || 0}</strong></span>
                <span>•</span>
                <span>Total Capa: <strong className="text-emerald-400 font-mono">S/ {Number(duplicateWarning.existing.pagoCapaTotal || duplicateWarning.existing.pagoCompleto || 0).toFixed(2)}</strong></span>
                <span>•</span>
                <span>Inicio: <strong className="text-cyan-300 font-mono">{formatFechaDDMMYYYY(duplicateWarning.existing.inicio || duplicateWarning.existing.fechaInicioCapa) || '—'}</strong></span>
                <span>•</span>
                <span>Ingreso Op: <strong className="text-cyan-300 font-mono">{formatFechaDDMMYYYY(duplicateWarning.existing.ingresoOperacion) || '—'}</strong></span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 self-end md:self-center shrink-0">
            {formData.id !== duplicateWarning.existing.id ? (
              <button
                type="button"
                onClick={() => {
                  setFormData(prev => ({
                    ...prev,
                    ...duplicateWarning.existing,
                    id: duplicateWarning.existing.id || duplicateWarning.existing.propuesta_id,
                    inicio: formatFechaDDMMYYYY(duplicateWarning.existing.inicio || duplicateWarning.existing.fechaInicioCapa || ''),
                    ingresoOperacion: formatFechaDDMMYYYY(duplicateWarning.existing.ingresoOperacion || ''),
                    fin: formatFechaDDMMYYYY(duplicateWarning.existing.fin || ''),
                    ojt: formatFechaDDMMYYYY(duplicateWarning.existing.ojt || ''),
                  }));
                  setNoticeMsg(`Modo edición activado: actualizando propuesta existente de ${duplicateWarning.campana} - ${duplicateWarning.grupo}`);
                }}
                className="text-xs font-bold py-2 px-3.5 bg-amber-500 hover:bg-amber-600 active:scale-95 text-slate-950 rounded-lg shadow transition-all flex items-center gap-1.5"
              >
                <Pencil size={14} /> Cargar para Editar
              </button>
            ) : (
              <span className="text-xs font-bold text-emerald-400 bg-emerald-500/10 px-3 py-1.5 rounded-lg border border-emerald-500/30 flex items-center gap-1.5">
                <CheckCircle size={15} /> Editando Registro Existente
              </span>
            )}
          </div>
        </div>
      )}

      {/* Controles de Carga y Datos Técnicos */}
      <Card className="mb-6">
        <div className="flex items-center justify-between mb-3 border-b border-[var(--border-subtle)] pb-2">
          <h3 className="text-xs font-bold uppercase text-[var(--text-muted)] tracking-widest flex items-center gap-2">
            <span>Grupo y Parámetros de Consolidación</span>
          </h3>
          <button
            type="button"
            onClick={() => setManualInput(!manualInput)}
            className="text-xs text-[var(--accent)] hover:underline flex items-center gap-1 font-semibold"
          >
            {manualInput ? '← Seleccionar desde Capacidad RyS' : '✎ Ingresar Grupo Manualmente'}
          </button>
        </div>
        
        {!manualInput ? (
          /* Filtros en Cascada desde Capacidad (Periodo -> Segmento -> Campaña -> Grupo Escribible) */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4 pb-4 border-b border-[var(--border-subtle)] border-dashed">
            <div>
              <label className="text-xs font-semibold text-[var(--text-primary)] flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)]"></span> 1. Periodo Capa
              </label>
              <select 
                value={filtroPeriodo || formData.periodoCapa || ''} 
                onChange={e => {
                  const val = e.target.value;
                  setFiltroPeriodo(val);
                  setFormData(prev => ({ ...prev, periodoCapa: val }));
                  setDuplicateWarning(null);
                }} 
                className="w-full border border-[var(--input-border)] rounded-lg px-2.5 py-1.5 text-xs bg-[var(--input-bg)] font-medium text-[var(--text-primary)] focus:border-[var(--accent)] outline-none"
              >
                <option value="">-- Todos los Periodos --</option>
                {periodosUnicos.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--text-primary)] flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)]"></span> 2. Segmento
              </label>
              <select 
                value={filtroSegmento || formData.segmento || ''} 
                onChange={e => {
                  const val = e.target.value;
                  setFiltroSegmento(val);
                  setFormData(prev => ({ ...prev, segmento: val }));
                  setDuplicateWarning(null);
                }} 
                className="w-full border border-[var(--input-border)] rounded-lg px-2.5 py-1.5 text-xs bg-[var(--input-bg)] font-medium text-[var(--text-primary)] focus:border-[var(--accent)] outline-none"
              >
                <option value="">-- Todos los Segmentos --</option>
                {segmentosFiltrados.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--text-primary)] flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)]"></span> 3. Campaña
              </label>
              <select 
                value={filtroCampana || formData.campana || ''} 
                onChange={e => {
                  const val = e.target.value;
                  setFiltroCampana(val);
                  setFormData(prev => ({
                    ...prev,
                    campana: val,
                    cod: val && prev.grupo ? `${val} - ${prev.grupo}` : (val || prev.cod),
                    titulo: val && prev.grupo ? `${val} - ${prev.grupo}` : (val || prev.titulo)
                  }));
                  setDuplicateWarning(null);
                }} 
                className="w-full border border-[var(--input-border)] rounded-lg px-2.5 py-1.5 text-xs bg-[var(--input-bg)] font-medium text-[var(--text-primary)] focus:border-[var(--accent)] outline-none"
              >
                <option value="">-- Seleccionar Campaña --</option>
                {campanasFiltradas.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-[var(--text-primary)] flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)]"></span> 4. Código de Grupo
                </label>
                {grupoEnCapacidad ? (
                  <span className="text-[10px] text-emerald-400 font-bold bg-emerald-500/15 px-1.5 py-0.5 rounded border border-emerald-500/30">
                    ✨ En Capacidad
                  </span>
                ) : formData.grupo ? (
                  <span className="text-[10px] text-amber-300 font-bold bg-amber-500/15 px-1.5 py-0.5 rounded border border-amber-500/30">
                    ✏️ Manual / Nuevo
                  </span>
                ) : null}
              </div>

              <div className="relative flex items-center mt-1">
                <input
                  type="text"
                  list="lista-grupos-capacidad"
                  value={formData.grupo || ''}
                  onChange={e => handleGrupoInput(e.target.value)}
                  placeholder="Escribe el código o selecciona..."
                  className="w-full border-2 border-[var(--accent)] rounded-lg pl-2.5 pr-24 py-1.5 text-xs bg-[var(--input-bg)] font-bold text-[var(--text-primary)] uppercase focus:ring-1 focus:ring-[var(--accent)] outline-none"
                />

                {gruposFiltrados.length > 0 && (
                  <select
                    onChange={e => {
                      if (e.target.value) handleGrupoInput(e.target.value);
                    }}
                    value=""
                    title="Seleccionar de la lista de Capacidad RyS"
                    className="absolute right-1 top-1/2 -translate-y-1/2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded px-1.5 py-1 text-[10px] font-bold cursor-pointer outline-none"
                  >
                    <option value="">▼ Opciones ({gruposFiltrados.length})</option>
                    {gruposFiltrados.map(g => {
                      const yaReg = isGrupoRegistrado(g.codigo, g.campana, g.periodo, g.segmento);
                      return (
                        <option key={`${g.periodo}-${g.campana}-${g.codigo}`} value={g.codigo}>
                          {g.codigo} {yaReg ? '⚠️' : '✨'}
                        </option>
                      );
                    })}
                  </select>
                )}
              </div>

              <datalist id="lista-grupos-capacidad">
                {gruposFiltrados.map(g => (
                  <option key={`${g.periodo}-${g.campana}-${g.codigo}`} value={g.codigo}>
                    {g.campana} ({g.periodo || 'S/P'})
                  </option>
                ))}
              </datalist>
            </div>
          </div>
        ) : (
          /* Ingreso Manual de Grupo */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4 pb-4 border-b border-[var(--border-subtle)] border-dashed bg-slate-800/40 p-3 rounded-lg">
            <div>
              <label className="text-xs font-semibold text-[var(--text-secondary)]">Periodo Capa</label>
              <input 
                type="text" 
                name="periodoCapa" 
                value={formData.periodoCapa} 
                onChange={handleChange} 
                onBlur={e => handleManualCheck(formData.grupo, formData.campana, e.target.value, formData.segmento)}
                className="w-full border border-[var(--input-border)] rounded px-2 py-1 text-xs bg-[var(--input-bg)] text-[var(--text-primary)]" 
                placeholder="Ej. 202610" 
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--text-secondary)]">Segmento</label>
              <input 
                type="text" 
                name="segmento" 
                value={formData.segmento} 
                onChange={handleChange} 
                onBlur={e => handleManualCheck(formData.grupo, formData.campana, formData.periodoCapa, e.target.value)}
                className="w-full border border-[var(--input-border)] rounded px-2 py-1 text-xs bg-[var(--input-bg)] text-[var(--text-primary)]" 
                placeholder="Ej. CONTACTADOS / VENTAS" 
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--text-secondary)]">Campaña</label>
              <input 
                type="text" 
                name="campana" 
                value={formData.campana} 
                onChange={handleChange} 
                onBlur={e => handleManualCheck(formData.grupo, e.target.value, formData.periodoCapa, formData.segmento)}
                className="w-full border border-[var(--input-border)] rounded px-2 py-1 text-xs bg-[var(--input-bg)] text-[var(--text-primary)]" 
                placeholder="Ej. CLARO PERU" 
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--text-secondary)]">Código Grupo</label>
              <input 
                type="text" 
                name="grupo" 
                value={formData.grupo} 
                onChange={handleChange} 
                onBlur={e => handleManualCheck(e.target.value, formData.campana, formData.periodoCapa, formData.segmento)}
                className="w-full border border-[var(--input-border)] rounded px-2 py-1 text-xs bg-[var(--input-bg)] text-[var(--text-primary)] font-bold" 
                placeholder="Ej. GPE-01" 
              />
            </div>
          </div>
        )}

        {/* Campos de Mes de Afectación y Configuración Contable */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div>
            <label className="text-xs font-semibold text-[var(--text-secondary)]">COD / ID Resumen</label>
            <input type="text" name="cod" value={formData.cod} onChange={handleChange} className="w-full border border-[var(--input-border)] rounded px-2 py-1 text-sm bg-[var(--input-bg)] text-[var(--text-primary)]" placeholder="Ej. 1234" />
          </div>
          <div>
            <label className="text-xs font-semibold text-[var(--text-secondary)]">Modalidad</label>
            <select name="modalidad" value={formData.modalidad} onChange={handleChange} className="w-full border border-[var(--input-border)] rounded px-2 py-1 text-sm bg-[var(--input-bg)] text-[var(--text-primary)]">
              <option value="Remoto">Remoto</option>
              <option value="Presencial">Presencial</option>
              <option value="Híbrido">Híbrido</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-[var(--text-secondary)]">Mes Afect. Capa</label>
            <select name="mesAfectacionCapa" value={formData.mesAfectacionCapa} onChange={handleChange} className="w-full border border-[var(--input-border)] rounded px-2 py-1 text-sm bg-[var(--input-bg)] text-[var(--text-primary)]">
              <option value="">-- Seleccionar --</option>
              {monthOptions.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-[var(--text-secondary)]">Mes Afect. Bonos</label>
            <select name="mesAfectacionBonos" value={formData.mesAfectacionBonos} onChange={handleChange} className="w-full border border-[var(--input-border)] rounded px-2 py-1 text-sm bg-[var(--input-bg)] text-[var(--text-primary)]">
              <option value="">-- Seleccionar --</option>
              {monthOptions.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-[var(--text-secondary)]">Días Feriados</label>
            <input type="number" name="cantDiasFeriados" value={formData.cantDiasFeriados} onChange={handleChange} className="w-full border border-[var(--input-border)] rounded px-2 py-1 text-sm bg-[var(--input-bg)] text-[var(--text-primary)]" placeholder="0" />
          </div>
        </div>
      </Card>

      {/* Formato Visual (Ficha Comercial y Operativa) */}
      <Card noPadding className="overflow-x-auto border border-[var(--border-subtle)] shadow-sm">
        <table ref={tableRef} className="w-full border-collapse text-sm min-w-[800px]">
          <tbody>
            {/* Header Principal */}
            <tr>
              <th colSpan="2" className="bg-[var(--accent)] bg-blue text-white font-bold text-center py-2 border border-[var(--border-subtle)] uppercase text-base">
                <input type="text" name="titulo" value={formData.titulo} onChange={handleChange} className="w-full bg-transparent text-center text-white placeholder-white/60 outline-none font-bold" placeholder="TÍTULO DE LA CAMPAÑA/GRUPO" />
              </th>
            </tr>
            
            <tr>
              <td className={`border border-[var(--border-subtle)] p-1.5 font-bold label ${labelClass}`}>Horario Gestión:</td>
              <td className="border border-[var(--border-subtle)] p-1.5"><input type="text" name="horario" value={formData.horario} onChange={handleChange} className={inputClass} placeholder="Lunes a Domingo (descanso rotativo)" /></td>
            </tr>
            <tr>
              <td className={`border border-[var(--border-subtle)] p-1.5 font-bold label ${labelClass}`}>Full time / Jornada:</td>
              <td className="border border-[var(--border-subtle)] p-1.5"><input type="text" name="fullTime" value={formData.fullTime} onChange={handleChange} className={inputClass} placeholder="RANGO HORARIO..." /></td>
            </tr>
            <tr>
              <td className={`border border-[var(--border-subtle)] p-1.5 font-bold label ${labelClass}`}>Básico:</td>
              <td className="border border-[var(--border-subtle)] p-1.5"><input type="text" name="basico" value={formData.basico} onChange={handleChange} className={inputClass} placeholder="S/ 1025.00" /></td>
            </tr>
            <tr>
              <td className={`border border-[var(--border-subtle)] p-1.5 font-bold label ${labelClass}`}>Bono de Movilidad:</td>
              <td className="border border-[var(--border-subtle)] p-1.5"><input type="text" name="bonoMovilidad" value={formData.bonoMovilidad} onChange={handleChange} className={inputClass} placeholder="S/ 100.00" /></td>
            </tr>
            <tr>
              <td className={`border border-[var(--border-subtle)] p-1.5 font-bold label ${labelClass}`}>Variable:</td>
              <td className="border border-[var(--border-subtle)] p-1.5"><input type="text" name="variable" value={formData.variable} onChange={handleChange} className={inputClass} placeholder="hasta S/ 300.00" /></td>
            </tr>
            
            {/* BONOS ESPECÍFICOS */}
            <tr>
              <td className={`border border-[var(--border-subtle)] p-1.5 font-bold label ${labelClass}`}>Bono de Bienvenida:</td>
              <td className="border border-[var(--border-subtle)] p-1.5">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-xs text-slate-400 font-bold whitespace-nowrap">Mes 1: S/</span><input type="number" name="bBienvenidaM1" value={formData.bBienvenidaM1} onChange={handleChange} className={numClass} />
                  <span className="text-xs text-slate-400 font-bold whitespace-nowrap">Mes 2: S/</span><input type="number" name="bBienvenidaM2" value={formData.bBienvenidaM2} onChange={handleChange} className={numClass} />
                  <span className="text-xs text-slate-400 font-bold whitespace-nowrap">Mes 3: S/</span><input type="number" name="bBienvenidaM3" value={formData.bBienvenidaM3} onChange={handleChange} className={numClass} />
                  <span className="text-xs text-slate-400 font-bold ml-2">Obs:</span><input type="text" name="bBienvenidaObs" value={formData.bBienvenidaObs} onChange={handleChange} className="flex-1 bg-transparent outline-none border-b border-dashed border-slate-600 text-xs px-1 text-[var(--text-primary)]" placeholder="Ej. al mes cumplido" />
                </div>
              </td>
            </tr>
            <tr>
              <td className={`border border-[var(--border-subtle)] p-1.5 font-bold label ${labelClass}`}>Bono de Permanencia:</td>
              <td className="border border-[var(--border-subtle)] p-1.5">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-xs text-slate-400 font-bold whitespace-nowrap">Mes 1: S/</span><input type="number" name="bPermM1" value={formData.bPermM1} onChange={handleChange} className={numClass} />
                  <span className="text-xs text-slate-400 font-bold whitespace-nowrap">Mes 2: S/</span><input type="number" name="bPermM2" value={formData.bPermM2} onChange={handleChange} className={numClass} />
                  <span className="text-xs text-slate-400 font-bold whitespace-nowrap">Mes 3: S/</span><input type="number" name="bPermM3" value={formData.bPermM3} onChange={handleChange} className={numClass} />
                  <span className="text-xs text-slate-400 font-bold whitespace-nowrap">Mes 4: S/</span><input type="number" name="bPermM4" value={formData.bPermM4} onChange={handleChange} className={numClass} />
                  <span className="text-xs text-slate-400 font-bold ml-2">Obs:</span><input type="text" name="bPermObs" value={formData.bPermObs} onChange={handleChange} className="flex-1 bg-transparent outline-none border-b border-dashed border-slate-600 text-xs px-1 text-[var(--text-primary)]" placeholder="Ej. Sujeto a 0 faltas" />
                </div>
              </td>
            </tr>
            <tr>
              <td className={`border border-[var(--border-subtle)] p-1.5 font-bold label ${labelClass}`}>Bono Asis. Perfecta:</td>
              <td className="border border-[var(--border-subtle)] p-1.5">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-xs text-slate-400 font-bold whitespace-nowrap">Mes 1: S/</span><input type="number" name="bAsisM1" value={formData.bAsisM1} onChange={handleChange} className={numClass} />
                  <span className="text-xs text-slate-400 font-bold whitespace-nowrap">Mes 2: S/</span><input type="number" name="bAsisM2" value={formData.bAsisM2} onChange={handleChange} className={numClass} />
                  <span className="text-xs text-slate-400 font-bold whitespace-nowrap">Mes 3: S/</span><input type="number" name="bAsisM3" value={formData.bAsisM3} onChange={handleChange} className={numClass} />
                  <span className="text-xs text-slate-400 font-bold ml-2">Obs:</span><input type="text" name="bAsisObs" value={formData.bAsisObs} onChange={handleChange} className="flex-1 bg-transparent outline-none border-b border-dashed border-slate-600 text-xs px-1 text-[var(--text-primary)]" placeholder="Sujeto a 0 faltas" />
                </div>
              </td>
            </tr>
            <tr>
              <td className={`border border-[var(--border-subtle)] p-1.5 font-bold label ${labelClass}`}>Pago de Capacitación:</td>
              <td className="border border-[var(--border-subtle)] p-1.5">
                 <div className="flex items-center gap-4 flex-wrap">
                  <span className="text-xs text-slate-400 font-bold">Por Día: S/</span><input type="number" name="pagoCapaPorDia" value={formData.pagoCapaPorDia} onChange={handleChange} className={numClass} />
                  <span className="text-xs text-slate-400 font-bold">Días:</span><input type="number" name="diasCapa" value={formData.diasCapa} onChange={handleChange} className={numClass} />
                  <span className="text-xs text-emerald-400 font-bold">Total Capa: S/</span><input type="number" name="pagoCapaTotal" value={formData.pagoCapaTotal} onChange={handleChange} className={`${numClass} font-bold text-emerald-400`} />
                 </div>
              </td>
            </tr>

            {/* Header Capacitación */}
            <tr>
              <th colSpan="2" className="bg-[var(--accent)] bg-blue text-white font-bold text-center py-2 border border-[var(--border-subtle)] uppercase">
                CRONOGRAMA DE CAPACITACIÓN:
              </th>
            </tr>
            <tr>
              <td className={`border border-[var(--border-subtle)] p-1.5 font-bold label ${labelClass}`}>Detalle de Formación:</td>
              <td className="border border-[var(--border-subtle)] p-1.5">
                <input type="text" name="capacitacionObs" value={formData.capacitacionObs} onChange={handleChange} className={inputClass} placeholder="Ej. Dia 0 + 12 dias teoria..." />
              </td>
            </tr>
            <tr>
              <td className={`border border-[var(--border-subtle)] p-1.5 font-bold label ${labelClass}`}>Horario de Capacitación:</td>
              <td className="border border-[var(--border-subtle)] p-1.5"><input type="text" name="horarioCapacitacion" value={formData.horarioCapacitacion} onChange={handleChange} className={inputClass} placeholder="Lunes a Sábado 9am a 5pm / Remoto..." /></td>
            </tr>
            <tr className="bg-[var(--bg-elevated)]">
              <td className={`border border-[var(--border-subtle)] p-1.5 font-bold label ${labelClass}`}>Inicio Capa:</td>
              <td className="border border-[var(--border-subtle)] p-1.5">
                <input
                  type="text"
                  name="inicio"
                  value={formData.inicio}
                  onChange={handleChange}
                  onBlur={handleDateBlur}
                  className={`${inputClass} font-semibold`}
                  placeholder="DD/MM/YYYY"
                />
              </td>
            </tr>
            <tr className="bg-[var(--bg-elevated)]">
              <td className={`border border-[var(--border-subtle)] p-1.5 font-bold label ${labelClass}`}>Fin Capa:</td>
              <td className="border border-[var(--border-subtle)] p-1.5">
                <input
                  type="text"
                  name="fin"
                  value={formData.fin}
                  onChange={handleChange}
                  onBlur={handleDateBlur}
                  className={`${inputClass} font-semibold`}
                  placeholder="DD/MM/YYYY"
                />
              </td>
            </tr>
            <tr className="bg-[var(--bg-elevated)]">
              <td className={`border border-[var(--border-subtle)] p-1.5 font-bold label ${labelClass}`}>OJT:</td>
              <td className="border border-[var(--border-subtle)] p-1.5">
                <input
                  type="text"
                  name="ojt"
                  value={formData.ojt}
                  onChange={handleChange}
                  onBlur={handleDateBlur}
                  className={`${inputClass} font-semibold`}
                  placeholder="DD/MM/YYYY o días de OJT"
                />
              </td>
            </tr>
            <tr className="bg-[var(--bg-elevated)]">
              <td className={`border border-[var(--border-subtle)] p-1.5 font-bold label ${labelClass}`}>Ingreso Operación:</td>
              <td className="border border-[var(--border-subtle)] p-1.5">
                <input
                  type="text"
                  name="ingresoOperacion"
                  value={formData.ingresoOperacion}
                  onChange={handleChange}
                  onBlur={handleDateBlur}
                  className={`${inputClass} font-semibold`}
                  placeholder="DD/MM/YYYY"
                />
              </td>
            </tr>

            {/* Header Pagos */}
            <tr>
              <th colSpan="2" className="bg-[var(--accent)] bg-blue text-white font-bold text-center py-2 border border-[var(--border-subtle)] uppercase">
                CALENDARIO DE PAGOS ESTIMADOS:
              </th>
            </tr>
            <tr>
              <td className={`border border-[var(--border-subtle)] p-1.5 font-bold label ${labelClass}`}>Quincena Mes 1:</td>
              <td className="border border-[var(--border-subtle)] p-1.5"><input type="text" name="quincena1" value={formData.quincena1} onChange={handleChange} className={inputClass} placeholder="Adelanto / Fecha de corte..." /></td>
            </tr>
            <tr>
              <td className={`border border-[var(--border-subtle)] p-1.5 font-bold label ${labelClass}`}>Fin de Mes 1:</td>
              <td className="border border-[var(--border-subtle)] p-1.5"><input type="text" name="finMes1" value={formData.finMes1} onChange={handleChange} className={inputClass} placeholder="Restante Sueldo Básico + Movilidad..." /></td>
            </tr>
            <tr>
              <td className={`border border-[var(--border-subtle)] p-1.5 font-bold label ${labelClass}`}>Fin de Mes 2:</td>
              <td className="border border-[var(--border-subtle)] p-1.5"><input type="text" name="finMes2" value={formData.finMes2} onChange={handleChange} className={inputClass} placeholder="Sueldo Fijo + Bonos Permanencia..." /></td>
            </tr>

            {/* Header Obs */}
            <tr>
              <th colSpan="2" className="bg-[var(--bg-surface)] text-[var(--text-primary)] font-bold text-center py-1.5 border border-[var(--border-subtle)] uppercase">
                OBSERVACIONES ADICIONALES:
              </th>
            </tr>
            <tr>
              <td colSpan="2" className="border border-[var(--border-subtle)] p-1.5 text-center">
                <input type="text" name="obs1" value={formData.obs1} onChange={handleChange} className={`${inputClass} text-center font-medium`} placeholder="Condición de contratación (RxH, Planilla, etc.)..." />
              </td>
            </tr>
            <tr>
              <td colSpan="2" className="border border-[var(--border-subtle)] p-1.5 text-center">
                <input type="text" name="obs2" value={formData.obs2} onChange={handleChange} className={`${inputClass} text-center`} placeholder="Perfil requerido / Requisitos de postulación..." />
              </td>
            </tr>
            <tr>
              <td colSpan="2" className="border border-[var(--border-subtle)] p-1.5 text-center">
                <input type="text" name="obs3" value={formData.obs3} onChange={handleChange} className={`${inputClass} text-center`} placeholder="Bono de productividad / otras notas..." />
              </td>
            </tr>
          </tbody>
        </table>
      </Card>

      <div className="mt-6 flex justify-between items-center gap-4">
        <div>
          {formData.id && (
            <button
              onClick={handleReset}
              className="btn-secondary flex items-center gap-1.5 text-xs text-slate-300"
            >
              <RotateCcw size={14} /> Cancelar Edición
            </button>
          )}
        </div>
        <div className="flex items-center gap-3">
          {savedSuccess && (
            <span className="text-emerald-400 font-bold flex items-center gap-2 text-sm">
              <CheckCircle size={18} /> ¡Guardado y consolidado en Supabase!
            </span>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn-success flex items-center gap-2 py-2 px-5 text-sm font-bold shadow-md hover:scale-[1.02] active:scale-95 transition-all"
          >
            {saving ? <span className="animate-spin text-lg">↻</span> : <Save size={18} />}
            {saving ? 'Guardando en Supabase...' : (formData.id ? 'Actualizar Propuesta' : 'Guardar y Consolidar')}
          </button>
        </div>
      </div>

    </PageLayout>
  );
}
