import React, { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { Loader2, DownloadCloud } from 'lucide-react'
import * as XLSX from 'xlsx'
import ColumnFilter from '../ui/ColumnFilter'

function getHeaderColor(key) {
  const group2 = ['doc_cv', 'doc_dni_adjunto', 'doc_certijoven', 'doc_recibo_servicios', 'doc_ficha_datos', 'doc_autorizacion', 'status_final', 'observacion_final'];
  const group3 = ['validacion_reingreso', 'fecha_validacion', 'observacion_reingreso'];
  
  if (group2.includes(key)) {
    return 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300';
  }
  
  if (group3.includes(key)) {
    return 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300';
  }
  
  return 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300';
}

export default function NominaFullPreview({ grupoCodigo, campana }) {
  const [data, setData] = useState([])
  const [columns, setColumns] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [filters, setFilters] = useState({})

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }))
  }

  const handleDownload = () => {
    if (filteredData.length === 0) return

    const exportData = filteredData.map(row => {
      const newRow = {}
      // Mantener el orden original de las columnas seleccionadas
      columns.forEach(col => {
        let val = row[col] !== null && row[col] !== undefined ? row[col] : ''
        
        // Aplicar formatos solicitados
        if (col === 'apellido_paterno' || col === 'apellido_materno' || col === 'nombres') {
          val = String(val).toUpperCase()
        } else if (col === 'correo') {
          val = String(val).toLowerCase()
        }
        
        newRow[col.replace(/_/g, ' ').toUpperCase()] = val
      })
      return newRow
    })

    const worksheet = XLSX.utils.json_to_sheet(exportData)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Nomina')
    XLSX.writeFile(workbook, `Nomina_${grupoCodigo || 'Export'}_${new Date().toISOString().split('T')[0]}.xlsx`)
  }

  const filteredData = React.useMemo(() => {
    return data.filter(row => {
      for (const key in filters) {
        const selections = filters[key];
        if (!selections || selections.length === 0) continue;
        const val = String(row[key] || '').trim();
        if (!selections.includes(val)) {
          return false;
        }
      }
      return true
    })
  }, [data, filters])

  useEffect(() => {
    if (grupoCodigo) loadData()
  }, [grupoCodigo, campana])

  const loadData = async () => {
    setLoading(true)
    setError(null)
    try {
      let query = supabase
        .from('nominas')
        .select('*')
        .order('apellido_paterno', { ascending: true })
        .limit(5000)

      if (grupoCodigo && grupoCodigo !== 'ALL') {
        query = query.eq('grupo_codigo', grupoCodigo.trim())
      } else if (campana) {
        query = query.ilike('campana', `%${campana.trim()}%`)
      }

      const { data: rows, error: err } = await query

      if (err) throw err
      
      if (rows && rows.length > 0) {
        // Show all columns dynamically, excluding requested ones
        const excludedCols = ['id', 'created_at', 'updated_at', 'activo', 'reclutador_id', 'marca_temporal', 'nomina_id']
        let cols = Object.keys(rows[0]).filter(k => !excludedCols.includes(k))
        
        // Reorder edad to be before fecha_nacimiento
        if (cols.includes('edad') && cols.includes('fecha_nacimiento')) {
          cols = cols.filter(c => c !== 'edad')
          const fnIdx = cols.indexOf('fecha_nacimiento')
          cols.splice(fnIdx, 0, 'edad')
        }

        // Reorder to ensure evaluar and obs_evaluar are before doc_cv
        const highlightCols = ['doc_cv', 'doc_dni_adjunto', 'doc_certijoven', 'doc_recibo_servicios', 'doc_ficha_datos', 'doc_autorizacion', 'status_final', 'observacion_final']
        const newCols = ['evaluar', 'obs_evaluar', ...highlightCols, 'validacion_reingreso', 'fecha_validacion', 'observacion_reingreso']
        
        const toMove = newCols.filter(c => cols.includes(c))
        cols = cols.filter(c => !toMove.includes(c))
        cols.push(...toMove)

        setColumns(cols)
        setData(rows)
      } else {
        setData([])
        setColumns([])
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (error) {
    return (
      <div className="p-8 text-center text-red-500 bg-red-50 dark:bg-red-900/10 rounded-xl">
        Error al cargar: {error}
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-900 overflow-hidden">
      <div className="p-3 border-b border-slate-200 dark:border-slate-800 flex justify-end bg-slate-50 dark:bg-slate-800/50">
        <button
          onClick={handleDownload}
          disabled={loading || filteredData.length === 0}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 text-sm font-semibold rounded-lg hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors disabled:opacity-50"
        >
          <DownloadCloud size={16} /> Descargar Excel
        </button>
      </div>
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="h-full flex items-center justify-center text-slate-400">
            <Loader2 className="animate-spin mr-2" /> Cargando nómina completa...
          </div>
        ) : data.length === 0 ? (
          <div className="h-full flex items-center justify-center text-slate-400">
            No hay registros en la nómina.
          </div>
        ) : (
          <table className="w-full text-left text-xs whitespace-nowrap">
            <thead className="bg-slate-100 dark:bg-slate-800 sticky top-0 z-10 shadow-sm">
              <tr>
                <th className="p-3 font-semibold text-slate-600 dark:text-slate-300 border-r border-slate-200 dark:border-slate-700 sticky left-0 bg-slate-100 dark:bg-slate-800 z-20 shadow-sm">
                  #
                </th>
                {columns.map(col => (
                  <th key={col} className={`p-3 font-semibold border-r border-slate-200 dark:border-slate-700 uppercase align-middle ${getHeaderColor(col)}`}>
                    <div className="flex items-center justify-between gap-1">
                      <span className="flex-1">{col.replace(/_/g, ' ')}</span>
                      <ColumnFilter 
                        columnKey={col}
                        label={col.replace(/_/g, ' ')}
                        data={data}
                        currentSelection={filters[col]}
                        onApply={(selections) => handleFilterChange(col, selections)}
                      />
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredData.map((row, idx) => (
                <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <td className="p-3 border-r border-slate-200 dark:border-slate-700 sticky left-0 bg-white dark:bg-slate-900 z-10 font-medium text-slate-400 shadow-sm">
                    {idx + 1}
                  </td>
                  {columns.map(col => {
                    const isHighlighted = ['doc_cv', 'doc_dni_adjunto', 'doc_certijoven', 'doc_recibo_servicios', 'doc_ficha_datos', 'doc_autorizacion', 'status_final', 'observacion_final'].includes(col);
                    return (
                      <td key={col} className={`p-3 border-r border-slate-100 dark:border-slate-800/50 text-slate-700 dark:text-slate-300 ${isHighlighted ? 'bg-indigo-50/50 dark:bg-indigo-900/10' : ''}`}>
                        {row[col] !== null && row[col] !== undefined ? String(row[col]) : '-'}
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
