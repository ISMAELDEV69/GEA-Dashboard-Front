import React, { useState, useEffect, useMemo } from 'react'
import { fetchGoogleFormsPool } from '../../lib/dataService'
import { supabase } from '../../lib/supabase'
import { Loader2, Search, CheckSquare, Square, DownloadCloud, AlertTriangle } from 'lucide-react'

const GOOGLE_FORM_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQNqbcgwWaeZiPwDaetDMft_rwv6BWFM-wNdA10VIKVWLo5uvnPFcbHgHvrDIiUyyWa08pDWN_VNX0e/pub?output=csv'

const getExistingKey = (doc, marca) => `${String(doc || '').trim()}|${marca ? new Date(marca).getTime() : 0}`

export default function NominaFormPool({
  bulkPeriodo, bulkSegmento, bulkCampana, bulkGrupo, reclutador, grupos = []
}) {
  const [loading, setLoading] = useState(false)
  const [poolData, setPoolData] = useState([])
  const [existingDocs, setExistingDocs] = useState(new Map())
  const [selectedDocs, setSelectedDocs] = useState(new Set())
  const [search, setSearch] = useState('')
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)

  useEffect(() => {
    loadPool()
  }, [])

  const loadPool = async () => {
    try {
      setLoading(true)
      setError(null)
      // 1. Load Pool from Google Forms
      const data = await fetchGoogleFormsPool(GOOGLE_FORM_URL)
      
      // 2. Load existing DNIs from Supabase (Optimized)
      const uniqueDnis = [...new Set(data.map(d => String(d.documento || '').trim()).filter(Boolean))]
      
      let docMap = new Map()
      if (uniqueDnis.length > 0) {
        // We split the query into chunks if there are too many, but up to 800 is fine for 'in'
        const { data: existing } = await supabase.from('nominas').select('documento, marca_temporal').in('documento', uniqueDnis)
        docMap = new Map((existing || []).map(r => [getExistingKey(r.documento, r.marca_temporal), true]))
      }
      
      setPoolData(data)
      setExistingDocs(docMap)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const availableData = useMemo(() => {
    let list = poolData.filter(d => d.documento)
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(d => 
        (d.documento || '').includes(q) || 
        (d.nombres || '').toLowerCase().includes(q) ||
        (d.apellido_paterno || '').toLowerCase().includes(q)
      )
    }
    return list
  }, [poolData, existingDocs, search])

  const toggleSelect = (doc, marca) => {
    if (existingDocs.has(getExistingKey(doc, marca))) return
    const key = `${doc}|${marca}`
    const next = new Set(selectedDocs)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    setSelectedDocs(next)
  }

  const toggleAll = () => {
    const selectable = availableData.filter(d => !existingDocs.has(getExistingKey(d.documento, d.marca_temporal)))
    if (selectedDocs.size === selectable.length && selectable.length > 0) {
      setSelectedDocs(new Set())
    } else {
      setSelectedDocs(new Set(selectable.map(d => `${d.documento}|${d.marca_temporal}`)))
    }
  }

  const handleSave = async () => {
    if (!bulkPeriodo || !bulkSegmento || !bulkCampana || !bulkGrupo) {
      setError('Debes seleccionar Periodo, Segmento, Campaña, Grupo y Sede en los filtros de arriba.')
      return
    }
    
    if (selectedDocs.size === 0) return

    try {
      setLoading(true)
      setError(null)
      
      const toInsert = poolData
        .filter(d => selectedDocs.has(`${d.documento}|${d.marca_temporal}`))
        .map(d => ({
          ...d,
          periodo_reclutado: (grupos.find(g => g.grupo_codigo === bulkGrupo)?.periodo) || bulkPeriodo,
          semana_trabajo: parseInt((grupos.find(g => g.grupo_codigo === bulkGrupo)?.semana_label || '').replace(/\D/g, '')) || null, // Best effort
          reclutador: reclutador || 'SISTEMA',
          campana: bulkCampana,
          grupo_codigo: bulkGrupo,
          status_final: 'RECLUTADO'
        }))

      // Insert directly since we now allow multiple applications per DNI (id is the new PK)
      const { error: dbErr } = await supabase.from('nominas').insert(toInsert)
      if (dbErr) throw dbErr

      setSuccess(`Se adjudicaron ${toInsert.length} postulantes correctamente.`)
      
      // Remove from available view using the composite key
      const nextExisting = new Map(existingDocs)
      toInsert.forEach(d => nextExisting.set(getExistingKey(d.documento, d.marca_temporal), true))
      setExistingDocs(nextExisting)
      setSelectedDocs(new Set())

    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden flex flex-col" style={{ minHeight: '600px' }}>
      {/* Header */}
      <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <DownloadCloud className="text-blue-500" /> Bolsa de Postulantes
          </h3>
          <p className="text-xs text-slate-500 mt-1">Candidatos disponibles desde Google Forms.</p>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input 
              type="text" 
              placeholder="Buscar por DNI o nombre..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border-none rounded-xl focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button onClick={() => { if (!existingDocs.has(d.documento)) toggleSelect(d.documento) }} className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-sm font-semibold transition-colors">
            Refrescar
          </button>
        </div>
      </div>

      {/* Warnings */}
      {error && (
        <div className="mx-4 mt-4 p-3 bg-red-50 text-red-600 rounded-xl flex items-center gap-2 text-sm">
          <AlertTriangle size={16} /> {error}
        </div>
      )}
      {success && (
        <div className="mx-4 mt-4 p-3 bg-emerald-50 text-emerald-600 rounded-xl flex items-center gap-2 text-sm">
          <CheckSquare size={16} /> {success}
        </div>
      )}

      {/* Table */}
      <div className="flex-1 overflow-auto max-h-[500px] p-4">
        {loading ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-400">
            <Loader2 className="animate-spin mb-2" /> Cargando postulantes...
          </div>
        ) : availableData.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-400">
            No hay candidatos nuevos disponibles en la bolsa.
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800 sticky top-0 z-10">
              <tr>
                <th className="p-3 w-10">
                  <button onClick={toggleAll} className="text-slate-400 hover:text-blue-500">
                    {selectedDocs.size === availableData.length ? <CheckSquare size={18} /> : <Square size={18} />}
                  </button>
                </th>
                <th className="p-3 font-semibold text-slate-600 dark:text-slate-300">DNI</th>
                <th className="p-3 font-semibold text-slate-600 dark:text-slate-300">Fecha Registro</th>
                <th className="p-3 font-semibold text-slate-600 dark:text-slate-300">Apellidos y Nombres</th>
                <th className="p-3 font-semibold text-slate-600 dark:text-slate-300">Celular</th>
                <th className="p-3 font-semibold text-slate-600 dark:text-slate-300">Exp. Call Center</th>
                <th className="p-3 font-semibold text-slate-600 dark:text-slate-300">Fuente</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
              {availableData.map((d, idx) => {
                const key = `${d.documento}|${d.marca_temporal}`
                const isExisting = existingDocs.has(getExistingKey(d.documento, d.marca_temporal))
                return (
                <tr 
                  key={`${d.documento}-${idx}`} 
                  className={`hover:bg-slate-50 dark:hover:bg-slate-800/50 ${isExisting ? 'opacity-50 cursor-not-allowed bg-slate-50 dark:bg-slate-800/80' : 'cursor-pointer'} ${selectedDocs.has(key) ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}
                  onClick={() => toggleSelect(d.documento, d.marca_temporal)}
                >
                  <td className="p-3 text-blue-500">
                    {selectedDocs.has(key) ? <CheckSquare size={18} /> : <Square className="text-slate-300" size={18} />}
                  </td>
                  <td className="p-3 text-slate-700 dark:text-slate-300 font-medium">
                    {d.documento}
                    {existingDocs.has(d.documento) && (
                      <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">Asignado: {existingDocs.get(d.documento)}</span>
                    )}
                  </td>
                  <td className="p-3 text-slate-600 dark:text-slate-400 text-xs">
                    {d.marca_temporal || 'Sin Fecha'}
                  </td>
                  <td className="p-3 text-slate-600 dark:text-slate-400">{d.apellido_paterno} {d.apellido_materno}, {d.nombres}</td>
                  <td className="p-3 text-slate-600 dark:text-slate-400">{d.celular}</td>
                  <td className="p-3 text-slate-600 dark:text-slate-400">{d.exp_call_center}</td>
                  <td className="p-3 text-slate-600 dark:text-slate-400 truncate max-w-[200px]" title={d.fuente_oferta}>{d.fuente_oferta}</td>
                </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer Action */}
      <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/50">
        <span className="text-sm text-slate-500 font-medium">
          {selectedDocs.size} candidatos seleccionados
        </span>
        <button 
          onClick={handleSave}
          disabled={selectedDocs.size === 0 || loading}
          className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-bold transition-all shadow-sm flex items-center gap-2"
        >
          {loading ? <Loader2 size={18} className="animate-spin" /> : <DownloadCloud size={18} />}
          Adjudicar a mi Grupo
        </button>
      </div>
    </div>
  )
}
