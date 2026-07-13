import React, { useState, useMemo } from 'react'
import { Save, AlertTriangle, CheckCircle, Trash2, Plus, RefreshCw, Send } from 'lucide-react'
import { insertDescuentosBulk } from '../lib/dataService'
import PageLayout from './ui/PageLayout'
import PageHeader from './ui/PageHeader'
import Card from './ui/Card'

const EMPTY_ROW = {
  sede: '',
  segmento: '',
  campana: '',
  supervisor: '',
  grupo_cap: '',
  formador: '',
  dni_ce: '',
  postulante: '',
  fecha_baja: '',
  motivo: '',
  comentarios: ''
}

export default function DescuentosForm({ userProfile, grupos = [], opcionesHomologadas = [] }) {
  const [dataRows, setDataRows] = useState([{ ...EMPTY_ROW }])
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [errorMsg, setErrorMsg] = useState(null)
  const [validationErrors, setValidationErrors] = useState([])

  // Extraer opciones únicas globales desde homologadas
  const sedesUnicas = useMemo(() => {
    return [...new Set(opcionesHomologadas.map(o => o.sede).filter(Boolean))].sort()
  }, [opcionesHomologadas])

  // Segmentos desde homologadas para mantener consistencia
  const segmentosUnicos = useMemo(() => {
    return [...new Set(opcionesHomologadas.map(o => o.segmento).filter(Boolean))].sort()
  }, [opcionesHomologadas])
  
  const motivosUnicos = useMemo(() => {
    return [...new Set(opcionesHomologadas.map(o => o.motivo).filter(Boolean))].sort()
  }, [opcionesHomologadas])
  
  // Grupos Cap (Datalist source)
  const gruposUnicos = useMemo(() => {
    return [...new Set(grupos.map(g => g.codigo).filter(Boolean))].sort()
  }, [grupos])

  // Manejo de Filas
  const addRow = () => {
    setDataRows([...dataRows, { ...EMPTY_ROW }])
  }

  const removeRow = (idx) => {
    const newRows = [...dataRows]
    newRows.splice(idx, 1)
    if (newRows.length === 0) newRows.push({ ...EMPTY_ROW })
    setDataRows(newRows)
  }

  const updateRow = (idx, field, value) => {
    const newRows = [...dataRows]
    newRows[idx][field] = value
    
    // Filtros en cascada: Auto-limpieza si cambia padre
    if (field === 'segmento') {
      newRows[idx].campana = ''
      newRows[idx].supervisor = ''
      newRows[idx].grupo_cap = ''
    }
    if (field === 'campana') {
      newRows[idx].supervisor = ''
      newRows[idx].grupo_cap = ''
    }
    
    setDataRows(newRows)
  }

  const clearAll = () => {
    if (window.confirm('¿Seguro que deseas limpiar toda la tabla?')) {
      setDataRows([{ ...EMPTY_ROW }])
      setSuccess(false)
      setErrorMsg(null)
      setValidationErrors([])
    }
  }

  // Validación de 48h (Supervisor)
  const isSupervisorTarde = (fechaBajaStr) => {
    if (!fechaBajaStr) return false;
    const hoyDate = new Date(new Date().toISOString().split('T')[0] + 'T00:00:00Z');
    const dBaja = new Date(fechaBajaStr + 'T00:00:00Z');
    
    if (!isNaN(dBaja)) {
       let addedDays = 0;
       while (addedDays < 2) {
         dBaja.setUTCDate(dBaja.getUTCDate() + 1);
         if (dBaja.getUTCDay() !== 0) addedDays++; // Saltar domingos (0)
       }
       const limiteSupervisor = new Date(dBaja.toISOString().split('T')[0] + 'T00:00:00Z');
       return hoyDate >= limiteSupervisor;
    }
    return false;
  }

  const handleSave = async () => {
    setLoading(true)
    setErrorMsg(null)
    setSuccess(false)
    setValidationErrors([])
    
    // Filtrar filas completamente vacías
    const rowsToProcess = dataRows.filter(r => 
      r.sede || r.segmento || r.campana || r.dni_ce || r.postulante
    )
    
    if (rowsToProcess.length === 0) {
      setErrorMsg("No hay datos para guardar.")
      setLoading(false)
      return
    }

    // Validar requeridos y límite de 48h
    const requiredFields = ['sede', 'segmento', 'campana', 'supervisor', 'grupo_cap', 'formador', 'dni_ce', 'postulante', 'fecha_baja', 'motivo']
    const errors = []
    
    rowsToProcess.forEach((row, i) => {
      // 1. Validar campos obligatorios
      requiredFields.forEach(f => {
        if (!row[f] || String(row[f]).trim() === '') {
          errors.push(`Fila ${i + 1}: Falta ${f.replace('_', ' ').toUpperCase()}`)
        }
      })
      
      // 2. Bloqueo estricto por 48 horas hábiles
      if (isSupervisorTarde(row.fecha_baja)) {
        errors.push(`Fila ${i + 1}: Superó las 48h hábiles desde la fecha de baja. NO SE PUEDE MANDAR EL DESCUENTO.`)
      }
    })

    if (errors.length > 0) {
      setValidationErrors(errors)
      setErrorMsg("Corrige los campos obligatorios antes de continuar.")
      setLoading(false)
      return
    }
    
    try {
      // Preparar payload
      const payload = rowsToProcess.map(row => {
        return {
          ...row,
          dni_ce: String(row.dni_ce).trim().toUpperCase(),
          postulante: String(row.postulante).toUpperCase(),
          comentarios: String(row.comentarios).toUpperCase()
        }
      })
      
      const res = await insertDescuentosBulk(payload, userProfile?.email)
      setSuccess(`Se guardaron ${res.inserted} descuentos exitosamente.`)
      setDataRows([{ ...EMPTY_ROW }]) 
    } catch (err) {
      console.error(err)
      setErrorMsg(err.message || 'Error al guardar los descuentos.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <PageLayout className="space-y-6">
      {/* HEADER */}
      <PageHeader 
        title="Registro de Descuentos" 
        subtitle="Ingresa manualmente los descuentos. No se permitirá mandar descuentos si han pasado más de 48h hábiles desde la baja."
      >
        <div className="flex items-center gap-3">
          <button 
            onClick={clearAll}
            className="btn-secondary text-red-500 border-red-500/30 hover:bg-red-500/10 flex items-center gap-2"
          >
            <RefreshCw size={16} /> Limpiar Todo
          </button>
          
          <button 
            onClick={addRow}
            className="btn-secondary flex items-center gap-2"
          >
            <Plus size={16} /> Agregar Fila
          </button>
          
          <button 
            onClick={handleSave}
            disabled={loading}
            className="btn-primary flex items-center gap-2 min-w-[160px] justify-center"
          >
            {loading ? <span className="animate-spin">⌛</span> : <Save size={18} />}
            {loading ? 'Procesando...' : 'Procesar y Guardar'}
          </button>
        </div>
      </PageHeader>

      {/* ALERTAS */}
      {(errorMsg || success) && (
        <div className="shrink-0 animate-fadeIn">
          {errorMsg && (
            <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 rounded-xl text-sm flex flex-col gap-2">
              <div className="flex items-center gap-2 font-bold">
                <AlertTriangle size={18} />
                {errorMsg}
              </div>
              {validationErrors.length > 0 && (
                <ul className="list-disc pl-8 space-y-1 text-xs opacity-90">
                  {validationErrors.slice(0, 5).map((err, i) => <li key={i}>{err}</li>)}
                  {validationErrors.length > 5 && <li>...y {validationErrors.length - 5} errores más.</li>}
                </ul>
              )}
            </div>
          )}
          {success && (
            <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded-xl text-sm flex items-center gap-2 font-bold">
              <CheckCircle size={18} />
              {success}
            </div>
          )}
        </div>
      )}

      {/* TABLE GRID */}
      <Card noPadding className="flex-1 flex flex-col min-h-[400px]">
        <div className="overflow-x-auto overflow-y-auto flex-1 table-scroll p-1">
          <table className="w-full text-left text-xs whitespace-nowrap table-auto">
            <thead className="bg-[var(--table-head-bg)] text-[var(--text-secondary)] sticky top-0 z-10 shadow-sm">
              <tr>
                <th className="p-3 border-b border-[var(--border-subtle)] text-center font-bold uppercase">#</th>
                <th className="p-3 border-b border-[var(--border-subtle)] font-bold uppercase tracking-wider">SEDE <span className="text-red-500">*</span></th>
                <th className="p-3 border-b border-[var(--border-subtle)] font-bold uppercase tracking-wider">SEGMENTO <span className="text-red-500">*</span></th>
                <th className="p-3 border-b border-[var(--border-subtle)] font-bold uppercase tracking-wider">CAMPAÑA <span className="text-red-500">*</span></th>
                <th className="p-3 border-b border-[var(--border-subtle)] font-bold uppercase tracking-wider">SUPERVISOR <span className="text-red-500">*</span></th>
                <th className="p-3 border-b border-[var(--border-subtle)] font-bold uppercase tracking-wider">GRUPO CAP. <span className="text-red-500">*</span></th>
                <th className="p-3 border-b border-[var(--border-subtle)] font-bold uppercase tracking-wider">FORMADOR <span className="text-red-500">*</span></th>
                <th className="p-3 border-b border-[var(--border-subtle)] font-bold uppercase tracking-wider">DNI/CE <span className="text-red-500">*</span></th>
                <th className="p-3 border-b border-[var(--border-subtle)] font-bold uppercase tracking-wider">POSTULANTE <span className="text-red-500">*</span></th>
                <th className="p-3 border-b border-[var(--border-subtle)] font-bold uppercase tracking-wider">FECHA BAJA <span className="text-red-500">*</span></th>
                <th className="p-3 border-b border-[var(--border-subtle)] font-bold uppercase tracking-wider">MOTIVO <span className="text-red-500">*</span></th>
                <th className="p-3 border-b border-[var(--border-subtle)] font-bold uppercase tracking-wider">COMENTARIOS</th>
                <th className="p-3 border-b border-[var(--border-subtle)] text-center w-12 font-bold uppercase tracking-wider">⚙️</th>
              </tr>
            </thead>
            <tbody>
              {dataRows.map((row, idx) => {
                
                // Filtros en cascada desde homologadas
                // Campañas disponibles: Filtra homologadas por el segmento elegido
                const campanasDisponibles = [...new Set(
                  opcionesHomologadas
                    .filter(o => row.segmento ? o.segmento === row.segmento : true)
                    .map(o => o.campana)
                    .filter(Boolean)
                )].sort()
                
                // Supervisores disponibles: Filtra homologadas por la campaña elegida
                const supervisoresDisponibles = [...new Set(
                  opcionesHomologadas
                    .filter(o => row.campana ? o.campana === row.campana : true)
                    .map(o => o.supervisor)
                    .filter(Boolean)
                )].sort()
                
                // Grupos disponibles: Filtra grupos (Capacidad) por segmento y campaña
                const gruposDisponibles = [...new Set(
                  grupos
                    .filter(g => row.segmento ? g.segmento === row.segmento : true)
                    .filter(g => row.campana ? g.campana === row.campana : true)
                    .map(g => g.codigo)
                    .filter(Boolean)
                )].sort()
                
                const supTarde = isSupervisorTarde(row.fecha_baja)

                return (
                  <tr key={idx} className="border-b border-[var(--border-subtle)] hover:bg-[var(--bg-muted)] focus-within:bg-[var(--accent)]/5 transition-colors">
                    <td className="p-2 text-center text-[var(--text-muted)] font-medium">{idx + 1}</td>
                    
                    <td className="p-1 min-w-[120px]">
                      <select className="w-full form-input py-2 px-3 text-xs rounded-lg" value={row.sede} onChange={e => updateRow(idx, 'sede', e.target.value)}>
                        <option value="">- Seleccione -</option>
                        {sedesUnicas.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </td>
                    
                    <td className="p-1 min-w-[150px]">
                      <select className="w-full form-input py-2 px-3 text-xs rounded-lg" value={row.segmento} onChange={e => updateRow(idx, 'segmento', e.target.value)}>
                        <option value="">- Seleccione -</option>
                        {segmentosUnicos.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </td>
                    
                    <td className="p-1 min-w-[180px]">
                      <select className="w-full form-input py-2 px-3 text-xs rounded-lg" value={row.campana} onChange={e => updateRow(idx, 'campana', e.target.value)}>
                        <option value="">- Seleccione -</option>
                        {campanasDisponibles.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </td>
                    
                    <td className="p-1 min-w-[180px]">
                      <select className="w-full form-input py-2 px-3 text-xs rounded-lg" value={row.supervisor} onChange={e => updateRow(idx, 'supervisor', e.target.value)}>
                        <option value="">- Seleccione -</option>
                        {supervisoresDisponibles.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </td>
                    
                    {/* Grupo Cap es un buscador de texto autocompletado (datalist) con validación estricta */}
                    <td className="p-1 min-w-[120px]">
                      <input 
                        type="text" 
                        list={`grupos-list-${idx}`} 
                        className="w-full form-input py-2 px-3 text-xs rounded-lg uppercase" 
                        placeholder="Buscar..."
                        value={row.grupo_cap} 
                        onChange={e => updateRow(idx, 'grupo_cap', e.target.value.toUpperCase())} 
                        onBlur={e => {
                          const val = e.target.value.toUpperCase()
                          if (val && !gruposDisponibles.includes(val)) {
                            alert(`El grupo "${val}" no es válido para la campaña seleccionada o no existe.`)
                            updateRow(idx, 'grupo_cap', '')
                          }
                        }}
                      />
                      <datalist id={`grupos-list-${idx}`}>
                        {gruposDisponibles.map(g => <option key={g} value={g} />)}
                      </datalist>
                    </td>
                    
                    <td className="p-1 min-w-[150px]">
                      <input 
                        type="text" 
                        className="w-full form-input py-2 px-3 text-xs rounded-lg uppercase" 
                        placeholder="Nombre"
                        value={row.formador} 
                        onChange={e => updateRow(idx, 'formador', e.target.value)} 
                      />
                    </td>
                    
                    <td className="p-1 min-w-[110px]">
                      <input type="text" className="w-full form-input py-2 px-3 text-xs rounded-lg uppercase" value={row.dni_ce} onChange={e => updateRow(idx, 'dni_ce', e.target.value)} placeholder="DNI" maxLength={20} />
                    </td>
                    
                    <td className="p-1 min-w-[180px]">
                      <input type="text" className="w-full form-input py-2 px-3 text-xs rounded-lg uppercase" value={row.postulante} onChange={e => updateRow(idx, 'postulante', e.target.value)} placeholder="Nombres" />
                    </td>
                    
                    <td className="p-1 relative min-w-[140px]">
                      <input type="date" className={`w-full form-input py-2 px-3 pr-8 text-xs rounded-lg ${supTarde ? '!border-red-500 !bg-red-500/10 !text-red-600 dark:!text-red-400 font-semibold' : ''}`} value={row.fecha_baja} onChange={e => updateRow(idx, 'fecha_baja', e.target.value)} />
                      {supTarde && <AlertTriangle size={14} className="absolute right-3 top-3 text-red-500" title=">48h Hábiles (BLOQUEADO)" />}
                    </td>
                    
                    <td className="p-1 min-w-[180px]">
                      <select className="w-full form-input py-2 px-3 text-xs rounded-lg" value={row.motivo} onChange={e => updateRow(idx, 'motivo', e.target.value)}>
                        <option value="">- Seleccione -</option>
                        {motivosUnicos.map(m => <option key={m} value={m}>{m}</option>)}
                      </select>
                    </td>
                    
                    <td className="p-1 min-w-[200px]">
                      <input type="text" className="w-full form-input py-2 px-3 text-xs rounded-lg" value={row.comentarios} onChange={e => updateRow(idx, 'comentarios', e.target.value)} placeholder="Opcional..." />
                    </td>
                    
                    <td className="p-1 text-center">
                      <button onClick={() => removeRow(idx)} className="text-[var(--text-muted)] hover:text-red-500 p-2 transition-colors rounded-lg hover:bg-red-500/10" title="Eliminar fila">
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </PageLayout>
  )
}
