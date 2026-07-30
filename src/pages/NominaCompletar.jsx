import React, { useState, useMemo } from 'react'
import { Layers } from 'lucide-react'
import NominaGridEditor from '../components/nomina/NominaGridEditor'
import NominaFullPreview from '../components/nomina/NominaFullPreview'
import { inferSegmento, SEGMENTOS_SIU } from '../lib/capacidadRysSync'

export default function NominaCompletar({ grupos = [] }) {
  const [bulkPeriodo, setBulkPeriodo] = useState('')
  const [bulkSegmento, setBulkSegmento] = useState('')
  const [bulkCampana, setBulkCampana] = useState('')
  const [bulkGrupo, setBulkGrupo] = useState('')
  const [showFullPreview, setShowFullPreview] = useState(false)

  const bulkPeriodos = useMemo(() => {
    return [...new Set(grupos.map(g => g.periodo ? String(g.periodo).trim() : null).filter(Boolean))].sort()
  }, [grupos])

  const bulkSegmentos = useMemo(() => {
    return SEGMENTOS_SIU
  }, [])

  const bulkCampanas = useMemo(() => {
    let filtered = grupos.filter(g => g.periodo)
    if (bulkPeriodo) filtered = filtered.filter(g => String(g.periodo) === String(bulkPeriodo))
    if (bulkSegmento) filtered = filtered.filter(g => {
      const seg = g.segmento || inferSegmento(g.campana)
      return String(seg).trim() === String(bulkSegmento).trim()
    })
    return [...new Set(filtered.map(g => g.campana ? String(g.campana).trim() : null).filter(Boolean))].sort()
  }, [grupos, bulkPeriodo, bulkSegmento])

  const bulkGruposList = useMemo(() => {
    let filtered = grupos.filter(g => g.periodo);
    if (bulkPeriodo) filtered = filtered.filter(g => String(g.periodo).trim() === String(bulkPeriodo).trim());
    if (bulkSegmento) filtered = filtered.filter(g => {
      const seg = g.segmento || inferSegmento(g.campana)
      return String(seg).trim() === String(bulkSegmento).trim()
    });
    if (bulkCampana) filtered = filtered.filter(g => String(g.campana).trim() === String(bulkCampana).trim());
    
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
  }, [grupos, bulkPeriodo, bulkSegmento, bulkCampana])

  return (
    <div className="w-full max-w-7xl mx-auto py-6 animate-fadeIn">
      {/* HEADER & FILTERS */}
      <div className="mb-6 bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-800">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6">
          <div className="flex items-center space-x-3 mb-4 sm:mb-0">
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
          <button
            disabled={!bulkGrupo}
            onClick={() => setShowFullPreview(true)}
            className="px-4 py-2 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 font-semibold rounded-xl text-sm transition-colors border border-emerald-200 dark:border-emerald-800 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            NÓMINA COMPLETA (VISTA PREVIA)
          </button>
        </div>

        {/* CASCADE FILTERS */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-slate-300 mb-1.5 ml-1">Periodo</label>
            <select value={bulkPeriodo} onChange={e => { setBulkPeriodo(e.target.value); setBulkSegmento(''); setBulkCampana(''); setBulkGrupo('') }} className="w-full text-sm border-gray-200 dark:border-slate-700 rounded-xl bg-gray-50 dark:bg-slate-800/50 text-slate-800 dark:text-slate-200 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors p-2.5">
              <option value="" disabled>Seleccione Período</option>
              {bulkPeriodos.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-slate-300 mb-1.5 ml-1">Segmento</label>
            <select value={bulkSegmento} onChange={e => { setBulkSegmento(e.target.value); setBulkCampana(''); setBulkGrupo('') }} className="w-full text-sm border-gray-200 dark:border-slate-700 rounded-xl bg-gray-50 dark:bg-slate-800/50 text-slate-800 dark:text-slate-200 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors p-2.5">
              <option value="" disabled>Seleccione Segmento</option>
              {bulkSegmentos.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-slate-300 mb-1.5 ml-1">Campaña</label>
            <select 
              value={bulkCampana} 
              onChange={e => { 
                const c = e.target.value;
                setBulkCampana(c); 
                setBulkGrupo('');
                const match = grupos.find(g => g.campana === c);
                if (match) setBulkSegmento(match.segmento ? String(match.segmento).trim() : inferSegmento(c));
              }} 
              className="w-full text-sm border-gray-200 dark:border-slate-700 rounded-xl bg-gray-50 dark:bg-slate-800/50 text-slate-800 dark:text-slate-200 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors p-2.5"
            >
              <option value="" disabled>Seleccione Campaña</option>
              {bulkCampanas.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-slate-300 mb-1.5 ml-1">Grupo (GPE)</label>
            <select 
              value={bulkGrupo} 
              onChange={e => {
                const cod = e.target.value;
                setBulkGrupo(cod);
                // Buscar primero en la lista filtrada actual para respetar la campaña seleccionada
                const match = bulkGruposList.find(g => g.codigo === cod) || grupos.find(g => g.codigo === cod);
                if (match) {
                  setBulkCampana(match.campana);
                  setBulkSegmento(match.segmento ? String(match.segmento).trim() : inferSegmento(match.campana));
                  setBulkPeriodo(match.periodo);
                }
              }} 
              className="w-full text-sm border-gray-200 dark:border-slate-700 rounded-xl bg-gray-50 dark:bg-slate-800/50 text-slate-800 dark:text-slate-200 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors p-2.5"
            >
              <option value="" disabled>Seleccione Grupo (GPE)</option>
              {bulkGruposList.map(g => (
                <option key={g.codigo} value={g.codigo}>
                  {String(g.codigo).startsWith('PROY-') ? '—' : String(g.codigo).replace(/_\d+$/, '')}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* GRID VIEWER */}
      {bulkGrupo ? (
        <div className="bg-white dark:bg-slate-900 shadow-sm rounded-2xl border border-gray-100 dark:border-slate-800 overflow-hidden">
          <NominaGridEditor grupoCodigo={bulkGrupo} campana={bulkCampana} />
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

      {/* FULL PREVIEW MODAL */}
      {showFullPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 w-full max-w-screen-2xl h-full sm:h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-slate-200 dark:border-slate-800 animate-slideUp">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50">
              <h2 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
                <Layers size={20} className="text-emerald-500" /> Nómina Completa (Vista Previa)
              </h2>
              <button 
                onClick={() => setShowFullPreview(false)}
                className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-xl transition-colors"
              >
                Cerrar Ventana
              </button>
            </div>
            <div className="flex-1 overflow-hidden p-0">
              <NominaFullPreview grupoCodigo={bulkGrupo} campana={bulkCampana} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
