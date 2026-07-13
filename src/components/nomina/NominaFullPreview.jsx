import React, { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { Loader2 } from 'lucide-react'

export default function NominaFullPreview({ grupoCodigo, campana }) {
  const [data, setData] = useState([])
  const [columns, setColumns] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (grupoCodigo) loadData()
  }, [grupoCodigo])

  const loadData = async () => {
    setLoading(true)
    try {
      const query = supabase
        .from('nominas')
        .select('*')
        .order('documento', { ascending: false })
        .limit(2000)

      if (grupoCodigo && grupoCodigo !== 'ALL') {
        query.eq('grupo_codigo', grupoCodigo)
      }
      if (campana) {
        query.eq('campana', campana)
      }

      const { data: rows, error: err } = await query

      if (err) throw err
      
      if (rows && rows.length > 0) {
        // Show all columns dynamically, excluding requested ones
        const excludedCols = ['created_at', 'updated_at', 'activo', 'reclutador_id', 'marca_temporal', 'nomina_id']
        let cols = Object.keys(rows[0]).filter(k => !excludedCols.includes(k))
        
        // Reorder edad to be before fecha_nacimiento
        if (cols.includes('edad') && cols.includes('fecha_nacimiento')) {
          cols = cols.filter(c => c !== 'edad')
          const fnIdx = cols.indexOf('fecha_nacimiento')
          cols.splice(fnIdx, 0, 'edad')
        }

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
                  <th key={col} className="p-3 font-semibold text-slate-600 dark:text-slate-300 border-r border-slate-200 dark:border-slate-700 uppercase">
                    {col.replace(/_/g, ' ')}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {data.map((row, idx) => (
                <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <td className="p-3 border-r border-slate-200 dark:border-slate-700 sticky left-0 bg-white dark:bg-slate-900 z-10 font-medium text-slate-400 shadow-sm">
                    {idx + 1}
                  </td>
                  {columns.map(col => (
                    <td key={col} className="p-3 border-r border-slate-100 dark:border-slate-800/50 text-slate-700 dark:text-slate-300">
                      {row[col] !== null && row[col] !== undefined ? String(row[col]) : '-'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
