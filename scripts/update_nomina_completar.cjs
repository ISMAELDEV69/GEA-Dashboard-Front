const fs = require('fs');

let content = `import React, { useState, useMemo } from 'react'
import { Layers } from 'lucide-react'
import NominaGridEditor from '../components/nomina/NominaGridEditor'

export default function NominaCompletar({ grupos = [] }) {
  const [bulkPeriodo, setBulkPeriodo] = useState('')
  const [bulkSegmento, setBulkSegmento] = useState('')
  const [bulkCampana, setBulkCampana] = useState('')
  const [bulkGrupo, setBulkGrupo] = useState('')

  const bulkPeriodos = useMemo(() => {
    return [...new Set(grupos.map(g => g.periodo || g.periodo).filter(Boolean))].sort()
  }, [grupos])

  const bulkSegmentos = useMemo(() => {
    let filtered = grupos.filter(g => g.periodo || g.periodo)
    if (bulkPeriodo) filtered = filtered.filter(g => (g.periodo || g.periodo) === bulkPeriodo)
    return [...new Set(filtered.map(g => g.segmento).filter(Boolean))].sort()
  }, [grupos, bulkPeriodo])

  const bulkCampanas = useMemo(() => {
    let filtered = grupos.filter(g => g.periodo || g.periodo)
    if (bulkPeriodo) filtered = filtered.filter(g => (g.periodo || g.periodo) === bulkPeriodo)
    if (bulkSegmento) filtered = filtered.filter(g => g.segmento === bulkSegmento)
    return [...new Set(filtered.map(g => g.campana).filter(Boolean))].sort()
  }, [grupos, bulkPeriodo, bulkSegmento])

  const bulkGruposList = useMemo(() => {
    let filtered = grupos
    if (bulkPeriodo) filtered = filtered.filter(g => (g.periodo || g.periodo) === bulkPeriodo)
    if (bulkSegmento) filtered = filtered.filter(g => g.segmento === bulkSegmento)
    if (bulkCampana) filtered = filtered.filter(g => g.campana === bulkCampana)
    return filtered.sort((a, b) => String(a.codigo).localeCompare(String(b.codigo)))
  }, [grupos, bulkPeriodo, bulkSegmento, bulkCampana])

  return (
    <div className="w-full max-w-7xl mx-auto py-6 animate-fadeIn">
      {/* HEADER & FILTERS */}
      <div className="mb-6 bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-800">
        <div className="flex items-center space-x-3 mb-6">
          <div className="p-2.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-xl">
            <Layers size={22} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Completar Nóminas</h1>
            <p className="text-sm text-gray-500 dark:text-slate-400">
              Usa los filtros para encontrar el Grupo (GPE) que deseas completar o modificar.
            </p>
          </div>
        </div>

        {/* CASCADE FILTERS */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 p-4 bg-gray-50 dark:bg-slate-800/50 rounded-2xl border border-gray-100 dark:border-slate-800">
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1">Periodo</label>
            <select value={bulkPeriodo} onChange={e => { setBulkPeriodo(e.target.value); setBulkSegmento(''); setBulkCampana(''); setBulkGrupo('') }} className="w-full text-sm border-gray-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 font-medium focus:ring-indigo-500/20 focus:border-indigo-500">
              <option value="" disabled>Seleccione Período</option>
              {bulkPeriodos.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1">Segmento</label>
            <select value={bulkSegmento} onChange={e => { setBulkSegmento(e.target.value); setBulkCampana(''); setBulkGrupo('') }} className="w-full text-sm border-gray-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 font-medium focus:ring-indigo-500/20 focus:border-indigo-500">
              <option value="" disabled>Seleccione Segmento</option>
              {bulkSegmentos.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1">Campaña</label>
            <select value={bulkCampana} onChange={e => { setBulkCampana(e.target.value); setBulkGrupo('') }} className="w-full text-sm border-gray-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 font-medium focus:ring-indigo-500/20 focus:border-indigo-500">
              <option value="" disabled>Seleccione Campaña</option>
              {bulkCampanas.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1">Grupo (GPE)</label>
            <select value={bulkGrupo} onChange={e => setBulkGrupo(e.target.value)} className="w-full text-sm border-gray-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 font-medium focus:ring-indigo-500/20 focus:border-indigo-500">
              <option value="" disabled>Seleccione Grupo (GPE)</option>
              {bulkGruposList.map(g => (
                <option key={g.codigo} value={g.codigo}>
                  {String(g.codigo).startsWith('PROY-') ? '—' : String(g.codigo).replace(/_\\d+$/, '')}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* GRID VIEWER */}
      {bulkGrupo ? (
        <div className="bg-white dark:bg-slate-900 shadow-sm rounded-2xl border border-gray-100 dark:border-slate-800 overflow-hidden">
          <NominaGridEditor grupoCodigo={bulkGrupo} />
        </div>
      ) : (
        <div className="py-20 text-center border-2 border-dashed border-gray-200 dark:border-slate-800 rounded-2xl bg-gray-50/50 dark:bg-slate-900/50 flex flex-col items-center justify-center">
          <Layers size={48} className="text-gray-300 dark:text-slate-700 mb-4" />
          <h3 className="text-gray-900 dark:text-white font-medium text-lg mb-1">No hay grupo seleccionado</h3>
          <p className="text-gray-500 dark:text-slate-400 text-sm">
            Usa los filtros de arriba para elegir un Grupo (GPE) y empezar a completar sus datos.
          </p>
        </div>
      )}
    </div>
  )
}
`
fs.writeFileSync('src/pages/NominaCompletar.jsx', content);
console.log('NominaCompletar updated with cascade filters');
