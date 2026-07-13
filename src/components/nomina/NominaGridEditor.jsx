import React, { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { checkCalibracionDia1 } from '../../lib/dataService'
import { Loader2, Save, AlertCircle, CheckCircle2 } from 'lucide-react'

// The editable columns for Phase B
const EDITABLE_COLUMNS = [
  { key: 'sede', label: 'SEDE', width: 150, type: 'select', options: ['ATE', 'SAN ISIDRO', 'COMAS', 'JOCKEY'] },
  { key: 'modalidad', label: 'MODALIDAD', width: 120, type: 'select', options: ['PRESENCIAL', 'HIBRIDO', 'REMOTO'] },
  { key: 'condicion', label: 'CONDICIÓN', width: 120, type: 'select', options: ['FULL TIME', 'PART TIME'] },
  { key: 'horario_gestion', label: 'HORARIO DE GESTIÓN', width: 150 },
  { key: 'descanso', label: 'DESCANSO', width: 100 },
  { key: 'envio_dni', label: 'ENVÍO DNI', width: 120, type: 'select', options: ['SI', '-', 'PENDIENTE'] },
  { key: 'test_psicologico', label: 'TEST PSICO.', width: 120, type: 'select', options: ['SI', '-', 'PENDIENTE'] },
  { key: 'validacion_pc', label: 'VALID. PC', width: 120, type: 'select', options: ['SI', '-', 'PENDIENTE'] },
  { key: 'evaluacion_dia_0', label: 'EVAL. DÍA 0', width: 120, type: 'select', options: ['SI', '-', 'PENDIENTE'] },
  { key: 'fecha_inicio_capacitacion', label: 'INICIO CAPA.', width: 120, type: 'date' },
  { key: 'fecha_fin_capacitacion', label: 'FIN CAPA.', width: 120, type: 'date' },
  { key: 'fecha_conexion_ojt', label: 'CONEXIÓN OJT', width: 120, type: 'date' },
  { key: 'fecha_conexion_op', label: 'CONEXIÓN OP', width: 120, type: 'date' },
  { key: 'pago_capacitacion', label: 'PAGO CAPA.', width: 100 },
  { key: 'tipo_contratacion', label: 'TIPO CONTRATACIÓN', width: 150 },
  { key: 'razon_social', label: 'RAZÓN SOCIAL', width: 150, type: 'select', options: ['GEA', 'SET'] },
  { key: 'remuneracion', label: 'REMUNERACIÓN', width: 120, type: 'number' },
  { key: 'bono_variable', label: 'BONO VARIABLE', width: 120, type: 'number' },
  { key: 'bono_movilidad', label: 'BONO MOVILIDAD', width: 120, type: 'number' },
  { key: 'bono_bienvenida', label: 'BONO BIENVENIDA', width: 120, type: 'number' },
  { key: 'bono_permanencia', label: 'BONO PERMANENCIA', width: 120, type: 'number' },
  { key: 'bono_asistencia_perfecta', label: 'BONO ASIST. PERF.', width: 120, type: 'number' },
  { key: 'cargo_contractual', label: 'CARGO CONTRACTUAL', width: 200, type: 'select', options: ['AGENTE TMK OUTBOUND', 'AGENTE TMK INBOUND', 'AGENTE TMK RETENCIONES'] },
  { key: 'dia_0', label: 'DÍA 0', width: 120, type: 'select', options: ['ASISTIO', 'FALTA'] },
  { key: 'dia_0_obs', label: 'OBSERVACIONES DÍA 0', width: 200 },
  { key: 'status_dia_1', label: 'STATUS DÍA 1', width: 120, type: 'select', options: ['APTO', 'RECUPERADO', 'AGREGADO', 'CESE', 'OBSERVADO'] },
  { key: 'dia_1', label: 'DÍA 1', width: 120, type: 'select', options: ['ASISTIO', 'FALTA'] },
  { key: 'dia_1_obs', label: 'OBSERVACIONES DÍA 1', width: 200 },
  { key: 'evaluar', label: 'EVALUAR', width: 150, type: 'select', options: ['APROBADO', 'DESAPROBADO', 'NO DA EVALUAR', 'NO LE LLEGA EL CORREO', 'SIN STATUS', 'DESAPRUEBA Y DA SEGUNDO EVALUAR'] },
  { key: 'obs_evaluar', label: 'OBS. EVALUAR', width: 200 },
  { key: 'doc_cv', label: 'CV', width: 80, type: 'select', options: ['OK', 'PENDIENTE'] },
  { key: 'doc_dni_adjunto', label: 'DNI (ADJUNTO)', width: 120, type: 'select', options: ['OK', 'PENDIENTE'] },
  { key: 'doc_certijoven', label: 'CERTIJOVEN', width: 120, type: 'select', options: ['OK', 'PENDIENTE'] },
  { key: 'doc_recibo_servicios', label: 'RECIBO SERV.', width: 120, type: 'select', options: ['OK', 'PENDIENTE'] },
  { key: 'doc_ficha_datos', label: 'FICHA DATOS', width: 120, type: 'select', options: ['OK', 'PENDIENTE'] },
  { key: 'doc_autorizacion', label: 'AUTORIZACIÓN', width: 120, type: 'select', options: ['OK', 'PENDIENTE'] },
  { key: 'status_final', label: 'STATUS FINAL', width: 120, type: 'select', options: ['COMPLETO', 'PENDIENTE'] },
  { key: 'observacion_final', label: 'OBS. FINAL', width: 200 }
]

export default function NominaGridEditor({ grupoCodigo, campana }) {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(false)
  const [savingRow, setSavingRow] = useState(null)
  const [error, setError] = useState(null)
  const [selectedColumn, setSelectedColumn] = useState(null)

  useEffect(() => {
    if (grupoCodigo) loadData()
  }, [grupoCodigo])

  const loadData = async () => {
    setLoading(true)
    try {
      let query = supabase
        .from('nominas')
        .select('*')
        .order('nombres')
        .limit(5000)

      if (grupoCodigo !== 'ALL') {
        query = query.eq('grupo_codigo', grupoCodigo)
      }
      if (campana) {
        query = query.eq('campana', campana)
      }

      const { data: rows, error: err } = await query

      if (err) throw err
      setData(rows || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleCellChange = async (docId, key, value) => {
    // Optimistic update locally
    setData(prev => prev.map(r => r.documento === docId ? { ...r, [key]: value } : r))
    
    // Save to DB
    setSavingRow(docId)
    try {
      const { error: err } = await supabase
        .from('nominas')
        .update({ [key]: value || null })
        .eq('documento', docId)
        
      if (err) throw err
      
      // Trigger calibration check if dia_1 was changed
      if (key === 'dia_1') {
        await checkCalibracionDia1(grupoCodigo, campana).catch(e => console.error('Calibration check error:', e))
      }
    } catch (err) {
      console.error('Save error', err)
      // We could revert here on failure
    } finally {
      setSavingRow(null)
    }
  }

  
  const copyFirstRow = async () => {
    if (data.length < 2 || !selectedColumn) return
    const firstRow = data[0]
    const updates = []
    
    // Copy only the selected column from the first row to the rest
    const updatedData = data.map((row, index) => {
      if (index === 0) return row
      const newRow = { ...row }
      newRow[selectedColumn] = firstRow[selectedColumn]
      updates.push(newRow)
      return newRow
    })
    
    setData(updatedData)
    setSavingRow('ALL')
    
    try {
      // Upsert all modified rows
      const { error: err } = await supabase.from('nominas').upsert(updates, { onConflict: 'documento' })
      if (err) throw err

      if (selectedColumn === 'dia_1') {
        await checkCalibracionDia1(grupoCodigo, campana).catch(e => console.error('Calibration check error:', e))
      }
    } catch (err) {
      console.error('Bulk save error', err)
      setError(err.message)
    } finally {
      setSavingRow(null)
    }
  }

  const missingDataCandidates = React.useMemo(() => {
    const invalidList = []
    data.forEach(p => {
      const dia0Val = (p.dia_0 || '').toString().toUpperCase().trim()
      const statusDia1Val = (p.status_dia_1 || '').toString().toUpperCase().trim()
      
      const asistioD0 = dia0Val === 'ASISTIO'
      const agregadoD1 = statusDia1Val === 'AGREGADO'
      
      if (asistioD0 || agregadoD1) {
        const missing = []
        if (!p.documento) missing.push('DNI')
        if (!p.nombres) missing.push('Nombres')
        if (!p.apellido_paterno) missing.push('Apellido Paterno')
        if (!p.apellido_materno) missing.push('Apellido Materno')
        if (!p.celular) missing.push('Celular')
        if (!p.condicion) missing.push('Condición Laboral')
        if (!p.campana) missing.push('Campaña')
        if (!p.grupo_codigo) missing.push('GPE (Campaña y Grupo)')

        if (missing.length > 0) {
          invalidList.push({
            nombre: `${p.apellido_paterno || ''} ${p.nombres || ''}`.trim() || p.documento || 'Sin nombre',
            faltantes: missing.join(', ')
          })
        }
      }
    })
    return invalidList
  }, [data])


  if (!grupoCodigo) {
    return (
      <div className="p-8 text-center text-slate-500 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
        Selecciona un grupo para empezar a editar su nómina.
      </div>
    )
  }

  return (
    <div className="flex flex-col bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm" style={{ height: '70vh' }}>
      <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50">
        <div>
          <h3 className="font-bold text-slate-800 dark:text-slate-100 text-lg">Completar Datos de Nómina</h3>
          <p className="text-xs text-slate-500">Editando grupo: <span className="font-mono bg-slate-200 dark:bg-slate-700 px-1 rounded">{grupoCodigo}</span> ({data.length} candidatos)</p>
        </div>
          <div className="mt-2">
            <button 
              onClick={copyFirstRow}
              disabled={data.length < 2 || savingRow || !selectedColumn}
              className="text-xs px-3 py-1.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 font-semibold rounded-lg hover:bg-indigo-100 transition-colors disabled:opacity-50 flex items-center gap-1"
            >
              <CheckCircle2 size={14} /> 
              {selectedColumn 
                ? `Replicar "${EDITABLE_COLUMNS.find(c => c.key === selectedColumn)?.label}" a todos` 
                : 'Selecciona el encabezado de una columna para replicar'}
            </button>
          </div>
        <div className="flex items-center gap-2 text-sm text-slate-500">
          {savingRow ? <span className="flex items-center gap-1 text-blue-500"><Loader2 size={14} className="animate-spin" /> Guardando...</span> : <span className="flex items-center gap-1 text-emerald-500"><CheckCircle2 size={14} /> Todo guardado</span>}
        </div>
      </div>

      {missingDataCandidates.length > 0 && (
        <div className="m-4 p-4 rounded-xl bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800/50 flex flex-col sm:flex-row gap-4 items-start shadow-sm">
          <div className="bg-orange-100 dark:bg-orange-900/50 p-2 rounded-lg text-orange-600 dark:text-orange-400 mt-1">
            <AlertCircle size={20} />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-bold text-orange-800 dark:text-orange-300 mb-1">
              Atención: Candidatos con datos incompletos
            </h3>
            <p className="text-sm text-orange-700 dark:text-orange-400 mb-3">
              Estos candidatos cumplen con la regla de Asistencia (Día 0 o Agregado), pero no podrán pasar a la pantalla del Formador porque les faltan datos obligatorios. Completa la información aquí mismo.
            </p>
            <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {missingDataCandidates.map((c, idx) => (
                <li key={idx} className="text-[11px] bg-orange-100/50 dark:bg-orange-900/30 p-2 rounded border border-orange-200/50 dark:border-orange-800/30 text-orange-800 dark:text-orange-300 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 bg-orange-500 rounded-full flex-shrink-0" />
                  <span><strong>{c.nombre}:</strong> {c.faltantes}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="h-full flex items-center justify-center text-slate-400">
            <Loader2 className="animate-spin mr-2" /> Cargando nómina...
          </div>
        ) : data.length === 0 ? (
          <div className="h-full flex items-center justify-center text-slate-400">
            No hay candidatos asignados a este grupo.
          </div>
        ) : (
          <table className="w-full text-left text-xs whitespace-nowrap">
            <thead className="bg-slate-100 dark:bg-slate-800 sticky top-0 z-10 shadow-sm">
              <tr>
                <th className="p-2 font-semibold text-slate-600 dark:text-slate-300 border-r border-slate-200 dark:border-slate-700 sticky left-0 bg-slate-100 dark:bg-slate-800 z-20 shadow-sm">
                  CANDIDATO (Solo Lectura)
                </th>
                {EDITABLE_COLUMNS.map(col => (
                  <th 
                    key={col.key} 
                    onClick={() => setSelectedColumn(col.key)}
                    className={`p-2 font-semibold border-r border-slate-200 dark:border-slate-700 cursor-pointer transition-colors select-none hover:bg-indigo-50 dark:hover:bg-indigo-900/30 ${selectedColumn === col.key ? 'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 shadow-inner' : 'text-slate-600 dark:text-slate-300'}`} 
                    style={{ minWidth: col.width }}
                    title="Haz clic para seleccionar y replicar esta columna"
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {data.map(row => (
                <tr key={row.documento} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <td className="p-2 border-r border-slate-200 dark:border-slate-700 sticky left-0 bg-white dark:bg-slate-900 z-10 shadow-sm flex flex-col">
                    <span className="font-semibold text-slate-700 dark:text-slate-200">{row.apellido_paterno} {row.nombres}</span>
                    <span className="text-[10px] text-slate-400">{row.documento}</span>
                  </td>
                  {EDITABLE_COLUMNS.map(col => {
                    const val = row[col.key] || '';
                    let bgColorClass = '';
                    if (val === 'OK' || val === 'COMPLETO' || val === 'APROBADO' || val === 'APTO') {
                      bgColorClass = 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-300 font-bold';
                    } else if (val === 'PENDIENTE' || val === 'FALTA' || val === 'DESAPROBADO' || val === 'CESE' || val === 'OBSERVADO') {
                      bgColorClass = 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300 font-bold';
                    } else if (!val && col.key.includes('status')) {
                      bgColorClass = 'bg-red-50/50 dark:bg-red-900/10 text-slate-800 dark:text-slate-100';
                    } else {
                      bgColorClass = 'text-slate-800 dark:text-slate-100 bg-transparent';
                    }

                    return (
                      <td key={col.key} className={`p-0 border-r border-slate-100 dark:border-slate-800/50 ${bgColorClass.includes('bg-') ? bgColorClass.split(' ').find(c => c.startsWith('bg-')) : ''} ${bgColorClass.includes('dark:bg-') ? bgColorClass.split(' ').find(c => c.startsWith('dark:bg-')) : ''}`}>
                        {col.type === 'select' ? (
                          <select
                            value={val}
                            onChange={e => setData(prev => prev.map(r => r.documento === row.documento ? { ...r, [col.key]: e.target.value } : r))}
                            onBlur={e => handleCellChange(row.documento, col.key, e.target.value)}
                            className={`w-full h-full p-2 border-none focus:ring-2 focus:ring-inset focus:ring-blue-500 outline-none transition-colors ${bgColorClass.replace(/bg-[a-z0-9/-]+/, '').replace(/dark:bg-[a-z0-9/-]+/, '')} bg-transparent`}
                          >
                            <option value=""></option>
                            {col.options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                          </select>
                        ) : (
                          <input
                            type={col.type || 'text'}
                            value={val}
                            onChange={e => setData(prev => prev.map(r => r.documento === row.documento ? { ...r, [col.key]: e.target.value } : r))}
                            onBlur={e => handleCellChange(row.documento, col.key, e.target.value)}
                            className={`w-full h-full p-2 border-none focus:ring-2 focus:ring-inset focus:ring-blue-500 outline-none transition-colors ${bgColorClass.replace(/bg-[a-z0-9/-]+/, '').replace(/dark:bg-[a-z0-9/-]+/, '')} bg-transparent`}
                            placeholder="..."
                          />
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
