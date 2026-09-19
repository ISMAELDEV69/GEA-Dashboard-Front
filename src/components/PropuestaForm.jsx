import { useState, useEffect, useRef } from 'react';
import { Save, CheckCircle, Download } from 'lucide-react';
import { savePropuesta, fetchCapacidadRysOperativo } from '../lib/dataService';
import * as XLSX from 'xlsx';
import PageLayout from './ui/PageLayout';
import PageHeader from './ui/PageHeader';
import Card, { CardHeader } from './ui/Card';
import { parsePropuestaToConsolidado } from '../lib/propuestaParser';

export default function PropuestaForm({ onSaved }) {
  const tableRef = useRef(null);
  
  const [gruposCapacidad, setGruposCapacidad] = useState([]);
  const [filtroPeriodo, setFiltroPeriodo] = useState('');
  const [filtroCampana, setFiltroCampana] = useState('');

  const [formData, setFormData] = useState({
    titulo: 'CONTACTADOS - COMAS',
    objetivo: '',
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
  });

  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    fetchCapacidadRysOperativo().then(data => {
      setGruposCapacidad(data || []);
    });
  }, []);

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

  const periodosUnicos = [...new Set(gruposCapacidad.map(g => g.periodo).filter(Boolean))].sort();
  const campanasFiltradas = [...new Set(gruposCapacidad.filter(g => g.periodo === filtroPeriodo).map(g => g.campana).filter(Boolean))].sort();
  const gruposFiltrados = gruposCapacidad.filter(g => g.periodo === filtroPeriodo && g.campana === filtroCampana).sort((a,b) => (a.codigo || '').localeCompare(b.codigo || ''));

  const handleSelectGrupo = (e) => {
    const code = e.target.value;
    const g = gruposCapacidad.find(x =>
      String(x.codigo || '').toUpperCase() === String(code).toUpperCase()
      && String(x.periodo || '').toUpperCase() === String(filtroPeriodo).toUpperCase()
      && String(x.campana || '').toUpperCase() === String(filtroCampana).toUpperCase()
    );
    if (!g) return;

    setFormData(prev => ({
      ...prev,
      periodoCapa: g.periodo || '',
      semana: g.semana_label || g.semana_trabajo || '',
      segmento: g.segmento || '',
      modalidad: g.modalidad || 'Remoto',
      condicionLaboral: g.condicion || 'Planilla Completa',
      cod: `${g.campana || ''} - ${g.codigo || ''}`,
      titulo: `${g.campana || ''} - ${g.codigo || ''}`,
      campana: g.campana || '',
      grupo: g.codigo || '',
      inicio: g.fecha_registro || '',
      ingresoOperacion: g.fecha_ingreso_op || '',
      ojt: g.fecha_inicio_ojt || ''
    }));
  };

  const handleChange = (e) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({ 
      ...prev, 
      [name]: type === 'number' ? (value === '' ? '' : Number(value)) : value 
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Parsear la data estructurada aquí mismo para mandar ambos a la DB
      const consolidado = parsePropuestaToConsolidado(formData);
      
      await savePropuesta(formData, consolidado);
      setSavedSuccess(true);
      if (onSaved) onSaved();
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch (err) {
      console.error(err);
      alert('Error al guardar propuesta');
    } finally {
      setSaving(false);
    }
  };

  const exportToExcel = () => {
    if (!tableRef.current) return;
    
    // Clonamos la tabla para reemplazar los inputs por texto plano para el Excel
    const tableClone = tableRef.current.cloneNode(true);
    
    // Reemplazar inputs por spans con su valor
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
          .bg-black { background-color: #000000; color: white; font-weight: bold; text-align: center; }
          .label { font-weight: bold; width: 150px; }
        </style>
      </head>
      <body>
        ${tableClone.outerHTML}
      </body>
      </html>
    `;

    const blob = new Blob([htmlTemplate], { type: 'application/vnd.ms-excel' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Propuesta_${formData.titulo.replace(/\\s+/g, '_')}.xls`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const inputClass = "w-full bg-[var(--input-bg)] border-none outline-none resize-none focus:ring-1 focus:ring-[var(--accent)] rounded px-1 py-0.5 text-[var(--text-primary)] placeholder-[var(--text-muted)]";
  const numClass = "w-16 bg-[var(--input-bg)] border border-[var(--input-border)] rounded px-1 text-xs text-center focus:outline-none focus:border-[var(--accent)] text-[var(--text-primary)]";
  const labelClass = "text-[var(--text-primary)] text-sm pr-2";
  
  return (
    <PageLayout className="p-4 md:p-6 space-y-6 overflow-y-auto">
      <PageHeader 
        title="Formato de Propuesta" 
        subtitle="Generación de propuestas para campañas y grupos"
        actions={
          <button onClick={exportToExcel} className="flex items-center gap-2 bg-[var(--accent)] hover:opacity-90 active:scale-95 text-white font-bold text-sm py-2 px-5 rounded-lg transition-all shadow-sm">
            <Download size={16} /> Exportar
          </button>
        }
      />
      
      {/* Controles Ocultos para Consolidado (Campos Técnicos) */}
      <Card className="mb-6">
        <h3 className="text-xs font-bold uppercase text-[var(--text-muted)] mb-3 tracking-widest flex items-center justify-between">
          <span>Campos Técnicos (Autocompletado desde Capacidad)</span>
        </h3>
        
        {/* Filtros de Búsqueda */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4 pb-4 border-b border-[var(--border-subtle)] border-dashed">
          <div>
            <label className="text-xs font-semibold text-[var(--text-primary)]">1. Seleccionar Periodo</label>
            <select 
              value={filtroPeriodo} 
              onChange={e => { setFiltroPeriodo(e.target.value); setFiltroCampana(''); }} 
              className="w-full border border-[var(--input-border)] rounded px-2 py-1.5 text-sm bg-[var(--input-bg)] font-medium text-[var(--text-primary)] focus:border-[var(--accent)] outline-none"
            >
              <option value="">-- Todos los Periodos --</option>
              {periodosUnicos.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-[var(--text-primary)]">2. Seleccionar Campaña</label>
            <select 
              value={filtroCampana} 
              onChange={e => setFiltroCampana(e.target.value)} 
              disabled={!filtroPeriodo}
              className="w-full border border-[var(--input-border)] rounded px-2 py-1.5 text-sm bg-[var(--input-bg)] font-medium text-[var(--text-primary)] disabled:opacity-50 focus:border-[var(--accent)] outline-none"
            >
              <option value="">-- Seleccionar Campaña --</option>
              {campanasFiltradas.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-[var(--text-primary)]">3. Cargar Datos del Grupo</label>
            <select 
              value={formData.grupo} 
              onChange={handleSelectGrupo} 
              disabled={!filtroCampana}
              className="w-full border-2 border-[var(--accent)] rounded px-2 py-1.5 text-sm bg-[var(--input-bg)] font-bold text-[var(--text-primary)] disabled:opacity-50 disabled:border-[var(--border-subtle)] focus:border-[var(--accent)] outline-none"
            >
              <option value="">-- Cargar Grupo --</option>
              {gruposFiltrados.map(g => <option key={g.codigo} value={g.codigo}>{g.codigo}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div><label className="text-xs font-semibold text-[var(--text-secondary)]">COD</label><input type="text" name="cod" value={formData.cod} onChange={handleChange} className="w-full border border-[var(--input-border)] rounded px-2 py-1 text-sm bg-[var(--input-bg)] text-[var(--text-primary)]" placeholder="Ej. 1234" /></div>
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
          <div><label className="text-xs font-semibold text-[var(--text-secondary)]">Días Feriados</label><input type="number" name="cantDiasFeriados" value={formData.cantDiasFeriados} onChange={handleChange} className="w-full border border-[var(--input-border)] rounded px-2 py-1 text-sm bg-[var(--input-bg)] text-[var(--text-primary)]" placeholder="0" /></div>
        </div>
      </Card>

      {/* Formato Visual (Excel Clone) */}
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
              <td className={`border border-[var(--border-subtle)] p-1.5 w-[25%] align-top font-bold label ${labelClass}`}>Objetivo:</td>
              <td className="border border-[var(--border-subtle)] p-1.5 w-[75%] align-top">
                <textarea rows="3" name="objetivo" value={formData.objetivo} onChange={handleChange} className={inputClass} placeholder="Contactar a clientes..." />
              </td>
            </tr>
            <tr>
              <td className={`border border-[var(--border-subtle)] p-1.5 font-bold label ${labelClass}`}>Horario:</td>
              <td className="border border-[var(--border-subtle)] p-1.5"><input type="text" name="horario" value={formData.horario} onChange={handleChange} className={inputClass} placeholder="Lunes a Domingo (descanso rotativo)" /></td>
            </tr>
            <tr>
              <td className={`border border-[var(--border-subtle)] p-1.5 font-bold label ${labelClass}`}>Full time:</td>
              <td className="border border-[var(--border-subtle)] p-1.5"><input type="text" name="fullTime" value={formData.fullTime} onChange={handleChange} className={inputClass} placeholder="RANGO HORARIO..." /></td>
            </tr>
            <tr>
              <td className={`border border-[var(--border-subtle)] p-1.5 font-bold label ${labelClass}`}>Básico:</td>
              <td className="border border-[var(--border-subtle)] p-1.5"><input type="text" name="basico" value={formData.basico} onChange={handleChange} className={inputClass} placeholder="S/1200" /></td>
            </tr>
            <tr>
              <td className={`border border-[var(--border-subtle)] p-1.5 font-bold label ${labelClass}`}>Bono de movilidad</td>
              <td className="border border-[var(--border-subtle)] p-1.5"><input type="text" name="bonoMovilidad" value={formData.bonoMovilidad} onChange={handleChange} className={inputClass} placeholder="S/100" /></td>
            </tr>
            <tr>
              <td className={`border border-[var(--border-subtle)] p-1.5 font-bold label ${labelClass}`}>Variable:</td>
              <td className="border border-[var(--border-subtle)] p-1.5"><input type="text" name="variable" value={formData.variable} onChange={handleChange} className={inputClass} placeholder="hasta S/300" /></td>
            </tr>
            
            {/* BONOS ESPECÍFICOS */}
            <tr>
              <td className={`border border-[var(--border-subtle)] p-1.5 font-bold label ${labelClass}`}>Bono de Bienvenida:</td>
              <td className="border border-[var(--border-subtle)] p-1.5">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-xs text-slate-500 font-bold whitespace-nowrap">Mes 1: S/</span><input type="number" name="bBienvenidaM1" value={formData.bBienvenidaM1} onChange={handleChange} className={numClass} />
                  <span className="text-xs text-slate-500 font-bold whitespace-nowrap">Mes 2: S/</span><input type="number" name="bBienvenidaM2" value={formData.bBienvenidaM2} onChange={handleChange} className={numClass} />
                  <span className="text-xs text-slate-500 font-bold whitespace-nowrap">Mes 3: S/</span><input type="number" name="bBienvenidaM3" value={formData.bBienvenidaM3} onChange={handleChange} className={numClass} />
                  <span className="text-xs text-slate-500 font-bold ml-2">Obs:</span><input type="text" name="bBienvenidaObs" value={formData.bBienvenidaObs} onChange={handleChange} className="flex-1 bg-transparent outline-none border-b border-dashed border-slate-300 text-xs px-1" placeholder="Ej. al mes cumplido" />
                </div>
              </td>
            </tr>
            <tr>
              <td className={`border border-[var(--border-subtle)] p-1.5 font-bold label ${labelClass}`}>Bono de Permanencia</td>
              <td className="border border-[var(--border-subtle)] p-1.5">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-xs text-slate-500 font-bold whitespace-nowrap">Mes 1: S/</span><input type="number" name="bPermM1" value={formData.bPermM1} onChange={handleChange} className={numClass} />
                  <span className="text-xs text-slate-500 font-bold whitespace-nowrap">Mes 2: S/</span><input type="number" name="bPermM2" value={formData.bPermM2} onChange={handleChange} className={numClass} />
                  <span className="text-xs text-slate-500 font-bold whitespace-nowrap">Mes 3: S/</span><input type="number" name="bPermM3" value={formData.bPermM3} onChange={handleChange} className={numClass} />
                  <span className="text-xs text-slate-500 font-bold whitespace-nowrap">Mes 4: S/</span><input type="number" name="bPermM4" value={formData.bPermM4} onChange={handleChange} className={numClass} />
                  <span className="text-xs text-slate-500 font-bold ml-2">Obs:</span><input type="text" name="bPermObs" value={formData.bPermObs} onChange={handleChange} className="flex-1 bg-transparent outline-none border-b border-dashed border-slate-300 text-xs px-1" placeholder="Ej. Sujeto a 0 faltas" />
                </div>
              </td>
            </tr>
            <tr>
              <td className={`border border-[var(--border-subtle)] p-1.5 font-bold label ${labelClass}`}>Bono de Asis. Perfecta:</td>
              <td className="border border-[var(--border-subtle)] p-1.5">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-xs text-slate-500 font-bold whitespace-nowrap">Mes 1: S/</span><input type="number" name="bAsisM1" value={formData.bAsisM1} onChange={handleChange} className={numClass} />
                  <span className="text-xs text-slate-500 font-bold whitespace-nowrap">Mes 2: S/</span><input type="number" name="bAsisM2" value={formData.bAsisM2} onChange={handleChange} className={numClass} />
                  <span className="text-xs text-slate-500 font-bold whitespace-nowrap">Mes 3: S/</span><input type="number" name="bAsisM3" value={formData.bAsisM3} onChange={handleChange} className={numClass} />
                  <span className="text-xs text-slate-500 font-bold ml-2">Obs:</span><input type="text" name="bAsisObs" value={formData.bAsisObs} onChange={handleChange} className="flex-1 bg-transparent outline-none border-b border-dashed border-slate-300 text-xs px-1" placeholder="Sujeto a 0 faltas" />
                </div>
              </td>
            </tr>
            <tr>
              <td className={`border border-[var(--border-subtle)] p-1.5 font-bold label ${labelClass}`}>Pago de Capa:</td>
              <td className="border border-[var(--border-subtle)] p-1.5">
                 <div className="flex items-center gap-4">
                  <span className="text-xs text-slate-500 font-bold">Total: S/</span><input type="number" name="pagoCapaTotal" value={formData.pagoCapaTotal} onChange={handleChange} className={numClass} />
                  <span className="text-xs text-slate-500 font-bold">Por Día: S/</span><input type="number" name="pagoCapaPorDia" value={formData.pagoCapaPorDia} onChange={handleChange} className={numClass} />
                 </div>
              </td>
            </tr>

            {/* Header Capacitación */}
            <tr>
              <th colSpan="2" className="bg-[var(--accent)] bg-blue text-white font-bold text-center py-2 border border-[var(--border-subtle)] uppercase">
                CAPACITACIÓN:
              </th>
            </tr>
            <tr>
              <td className={`border border-[var(--border-subtle)] p-1.5 font-bold label ${labelClass}`}>Capacitación:</td>
              <td className="border border-[var(--border-subtle)] p-1.5">
                <div className="flex items-center gap-4">
                  <span className="text-xs text-slate-500 font-bold">Días:</span><input type="number" name="diasCapa" value={formData.diasCapa} onChange={handleChange} className={numClass} />
                  <span className="text-xs text-slate-500 font-bold">Detalles:</span><input type="text" name="capacitacionObs" value={formData.capacitacionObs} onChange={handleChange} className="flex-1 bg-transparent outline-none border-b border-dashed border-slate-300 px-1" placeholder="Ej. Dia 0 + 12 dias teoria..." />
                </div>
              </td>
            </tr>
            <tr>
              <td className={`border border-[var(--border-subtle)] p-1.5 font-bold label ${labelClass}`}>Horario de capacitación:</td>
              <td className="border border-[var(--border-subtle)] p-1.5"><input type="text" name="horarioCapacitacion" value={formData.horarioCapacitacion} onChange={handleChange} className={inputClass} placeholder="Lunes a Sábado 9am a 5pm / google meet..." /></td>
            </tr>
            <tr className="bg-[var(--bg-elevated)] bg-yellow">
              <td className={`border border-[var(--border-subtle)] p-1.5 font-bold label ${labelClass}`}>Inicio:</td>
              <td className="border border-[var(--border-subtle)] p-1.5"><input type="text" name="inicio" value={formData.inicio} onChange={handleChange} className={`${inputClass} font-semibold`} placeholder="sábado 6/6/2026" /></td>
            </tr>
            <tr className="bg-[var(--bg-elevated)] bg-yellow">
              <td className={`border border-[var(--border-subtle)] p-1.5 font-bold label ${labelClass}`}>Fin:</td>
              <td className="border border-[var(--border-subtle)] p-1.5"><input type="text" name="fin" value={formData.fin} onChange={handleChange} className={`${inputClass} font-semibold`} placeholder="sábado 20/6/2026" /></td>
            </tr>
            <tr className="bg-[var(--bg-elevated)] bg-yellow">
              <td className={`border border-[var(--border-subtle)] p-1.5 font-bold label ${labelClass}`}>OJT</td>
              <td className="border border-[var(--border-subtle)] p-1.5"><input type="text" name="ojt" value={formData.ojt} onChange={handleChange} className={`${inputClass} font-semibold`} placeholder="lunes 22/6/2026 (5 días de ojt )" /></td>
            </tr>
            <tr className="bg-[var(--bg-elevated)] bg-yellow">
              <td className={`border border-[var(--border-subtle)] p-1.5 font-bold label ${labelClass}`}>Ingreso operación:</td>
              <td className="border border-[var(--border-subtle)] p-1.5"><input type="text" name="ingresoOperacion" value={formData.ingresoOperacion} onChange={handleChange} className={`${inputClass} font-semibold`} placeholder="sábado 27/6/2026" /></td>
            </tr>

            {/* Header Pagos */}
            <tr>
              <th colSpan="2" className="bg-[var(--accent)] bg-blue text-white font-bold text-center py-2 border border-[var(--border-subtle)] uppercase">
                PAGOS:
              </th>
            </tr>
            <tr>
              <td className={`border border-[var(--border-subtle)] p-1.5 font-bold label ${labelClass}`}>Quincena de Julio:</td>
              <td className="border border-[var(--border-subtle)] p-1.5"><input type="text" name="quincena1" value={formData.quincena1} onChange={handleChange} className={inputClass} placeholder="Adelanto 40% básico (UNICA VEZ)" /></td>
            </tr>
            <tr>
              <td className={`border border-[var(--border-subtle)] p-1.5 font-bold label ${labelClass}`}>Fin de JULIO</td>
              <td className="border border-[var(--border-subtle)] p-1.5"><input type="text" name="finMes1" value={formData.finMes1} onChange={handleChange} className={inputClass} placeholder="RESTANTE SUELDO BÁSICO + % MOVILIDAD" /></td>
            </tr>
            <tr>
              <td className={`border border-[var(--border-subtle)] p-1.5 font-bold label ${labelClass}`}>Fin de AGOSTO</td>
              <td className="border border-[var(--border-subtle)] p-1.5">
                <textarea rows="2" name="finMes2" value={formData.finMes2} onChange={handleChange} className={inputClass} placeholder="SUELDO FIJO B.BIENVENIDA s/150 + 1er B. PERMANENCIA..." />
              </td>
            </tr>

            {/* Header Obs */}
            <tr>
              <th colSpan="2" className="bg-[var(--bg-surface)] text-[var(--text-primary)] font-bold text-center py-1.5 border border-[var(--border-subtle)] uppercase">
                OBS:
              </th>
            </tr>
            <tr className="bg-[var(--bg-elevated)] bg-yellow">
              <td colSpan="2" className="border border-[var(--border-subtle)] p-1.5 text-center">
                <input type="text" name="obs1" value={formData.obs1} onChange={handleChange} className={`${inputClass} text-center font-medium`} placeholder="Gestión Presencial/ Los 3 primeros meses bajo RXH..." />
              </td>
            </tr>
            <tr>
              <td colSpan="2" className="border border-[var(--border-subtle)] p-1.5 text-center">
                <input type="text" name="obs2" value={formData.obs2} onChange={handleChange} className={`${inputClass} text-center`} placeholder="Perfil: Secundaria completa / Experiencia formal minima..." />
              </td>
            </tr>
            <tr>
              <td colSpan="2" className="border border-[var(--border-subtle)] p-1.5 text-center">
                <input type="text" name="obs3" value={formData.obs3} onChange={handleChange} className={`${inputClass} text-center`} placeholder="B. Productividad en 15na de cada mes" />
              </td>
            </tr>
          </tbody>
        </table>
      </Card>

      <div className="mt-6 flex justify-end items-center gap-4">
        {savedSuccess && (
          <span className="text-emerald-600 font-bold flex items-center gap-2">
            <CheckCircle size={18} /> ¡Propuesta y Consolidado Guardados!
          </span>
        )}
        <button
          onClick={handleSave}
          disabled={saving}
          className="btn-success flex items-center gap-2"
        >
          {saving ? <span className="animate-spin text-xl">↻</span> : <Save size={20} />}
          {saving ? 'Guardando...' : 'Guardar Ambas Tablas'}
        </button>
      </div>

    </PageLayout>
  );
}
