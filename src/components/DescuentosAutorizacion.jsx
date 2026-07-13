import React, { useState, useEffect } from 'react'
import { CheckSquare, Square, CheckCircle, RefreshCw, AlertTriangle, Save, Filter } from 'lucide-react'
import { fetchDescuentosPendientes, updateDescuentosIndividuales } from '../lib/dataService'
import PageLayout from './ui/PageLayout'
import PageHeader from './ui/PageHeader'
import Card from './ui/Card'

export default function DescuentosAutorizacion() {
  const [pendientes, setPendientes] = useState([])
  const [selectedIds, setSelectedIds] = useState([])
  const [loading, setLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState(null)
  
  // Estado para los inputs individuales de cada fila
  const [rowEdits, setRowEdits] = useState({})

  const loadData = async () => {
    setLoading(true)
    setErrorMsg(null)
    try {
      const data = await fetchDescuentosPendientes()
      
      const edits = {}
      data.forEach(row => {
        edits[row.id] = {
          estado: '-- Pendiente --',
          comentario: ''
        }
      })
      setRowEdits(edits)
      setPendientes(data)
      setSelectedIds([])
    } catch (err) {
      console.error(err)
      setErrorMsg("Error al cargar los descuentos pendientes.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const handleRowEdit = (id, field, value) => {
    setRowEdits(prev => ({
      ...prev,
      [id]: {
        ...prev[id],
        [field]: value
      }
    }))
    
    // Si editan algo, autoseleccionamos la fila para conveniencia
    if (!selectedIds.includes(id)) {
      setSelectedIds(prev => [...prev, id])
    }
  }

  const handleGuardarSeleccionados = async () => {
    if (selectedIds.length === 0) return
    
    const updates = selectedIds.map(id => ({
      id,
      estado: rowEdits[id]?.estado ?? '',
      comentario: rowEdits[id]?.comentario || '',
      autoriza_cap: pendientes.find(p => p.id === id)?.autoriza_cap
    }))
    
    setActionLoading(true)
    setErrorMsg(null)
    try {
      const res = await updateDescuentosIndividuales(updates)
      alert(`Se actualizaron ${res.updated} registros seleccionados.`)
      loadData()
    } catch (err) {
      console.error(err)
      setErrorMsg(`Error al guardar registros: ${err.message}`)
    } finally {
      setActionLoading(false)
    }
  }

  return (
    <PageLayout className="space-y-6">
      {/* HEADER */}
      <PageHeader 
        title="Autorizar Descuentos - Jefe RYS" 
        subtitle="Revisa y aprueba los descuentos enviados. Solo los descuentos con doble autorización procederán."
        icon={CheckSquare}
      >
        <div className="flex items-center gap-3">
          <button onClick={loadData} className="btn-secondary flex items-center gap-2">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Actualizar
          </button>
          
          <button 
            onClick={handleGuardarSeleccionados}
            disabled={selectedIds.length === 0 || actionLoading}
            className="btn-primary flex items-center gap-2"
          >
            <Save size={18} /> Guardar Cambios ({selectedIds.length})
          </button>
        </div>
      </PageHeader>

      {/* ALERTAS */}
      {errorMsg && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 rounded-xl text-sm flex items-center gap-2 font-bold animate-fadeIn">
          <AlertTriangle size={18} />
          {errorMsg}
        </div>
      )}

      {/* TABLA COMPLETA */}
      <Card noPadding className="flex-1 flex flex-col min-h-[400px]">
        {loading && pendientes.length === 0 ? (
          <div className="flex flex-col justify-center items-center h-64 text-[var(--text-muted)]">
            <RefreshCw size={32} className="animate-spin mb-4 text-[var(--accent)]" />
            <p className="font-medium">Cargando pendientes...</p>
          </div>
        ) : pendientes.length === 0 ? (
          <div className="flex flex-col justify-center items-center h-64 text-[var(--text-muted)]">
            <CheckCircle size={48} className="mb-4 opacity-50 text-emerald-500" />
            <p className="text-lg font-bold text-[var(--text-secondary)]">¡Todo al día!</p>
            <p>No hay descuentos pendientes de autorización.</p>
          </div>
        ) : (
          <div className="overflow-x-auto overflow-y-auto flex-1 table-scroll">
            <table className="w-full text-left text-xs whitespace-nowrap table-auto">
              <thead className="bg-[var(--table-head-bg)] text-[var(--text-secondary)] sticky top-0 shadow-sm z-10 border-b border-[var(--border-subtle)]">
                <tr>
                  <th className="p-3 border-r border-[var(--border-subtle)] font-bold uppercase tracking-wider">Sede</th>
                  <th className="p-3 border-r border-[var(--border-subtle)] font-bold uppercase tracking-wider">Segmento</th>
                  <th className="p-3 border-r border-[var(--border-subtle)] font-bold uppercase tracking-wider">Grupo Cap.</th>
                  <th className="p-3 border-r border-[var(--border-subtle)] font-bold uppercase tracking-wider">Campaña</th>
                  <th className="p-3 border-r border-[var(--border-subtle)] font-bold uppercase tracking-wider">Supervisor</th>
                  <th className="p-3 border-r border-[var(--border-subtle)] font-bold uppercase tracking-wider">Formador</th>
                  <th className="p-3 border-r border-[var(--border-subtle)] font-bold uppercase tracking-wider">DNI/CE</th>
                  <th className="p-3 border-r border-[var(--border-subtle)] font-bold uppercase tracking-wider">Postulante</th>
                  <th className="p-3 border-r border-[var(--border-subtle)] font-bold uppercase tracking-wider">Fecha Baja</th>
                  <th className="p-3 border-r border-[var(--border-subtle)] font-bold uppercase tracking-wider">Motivo</th>
                  <th className="p-3 border-r border-[var(--border-subtle)] font-bold uppercase tracking-wider">Comentarios</th>
                  <th className="p-3 border-r border-[var(--border-subtle)] font-bold uppercase tracking-wider">Autoriza CAP</th>
                  <th className="p-3 border-r border-[var(--border-subtle)] font-bold uppercase tracking-wider bg-[var(--accent)]/10 text-[var(--accent)]">Autoriza RYS</th>
                  <th className="p-3 border-r border-[var(--border-subtle)] font-bold uppercase tracking-wider bg-[var(--accent)]/10 text-[var(--accent)]">Comentario RYS</th>
                  <th className="p-3 border-r border-[var(--border-subtle)] font-bold uppercase tracking-wider">Procede</th>
                  <th className="p-3 font-bold uppercase tracking-wider">Fecha Envío</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
              {pendientes.map(row => {
                const isSelected = selectedIds.includes(row.id)
                // Usar el valor actual o vacío si es nulo/'PENDIENTE'
                const dbEstado = (row.autoriza_rys === 'PENDIENTE' || !row.autoriza_rys) ? '' : row.autoriza_rys
                const editState = rowEdits[row.id] || { estado: dbEstado, comentario: row.comentario_rys || '' }
                
                // Cálculo dinámico de PROCEDE
                const currentAutRys = editState.estado
                const currentAutCap = row.autoriza_cap || 'SI'
                
                let procedeVisual = 'PENDIENTE'
                if (currentAutRys === 'SI') {
                  procedeVisual = (currentAutCap === 'SI') ? 'PROCEDE' : 'PENDIENTE'
                } else if (currentAutRys === 'NO') {
                  procedeVisual = 'NO PROCEDE'
                }

                return (
                  <tr 
                    key={row.id} 
                    className={`hover:bg-[var(--bg-muted)] focus-within:bg-[var(--accent)]/5 transition-colors ${isSelected ? 'bg-[var(--accent)]/5' : ''}`}
                  >
                    <td className="p-2 text-[var(--text-secondary)] border-r border-[var(--border-subtle)]">{row.sede}</td>
                    <td className="p-2 text-[var(--text-secondary)] border-r border-[var(--border-subtle)]">{row.segmento}</td>
                    <td className="p-2 text-[var(--text-secondary)] border-r border-[var(--border-subtle)] font-mono">{row.grupo_cap}</td>
                    <td className="p-2 text-[var(--text-secondary)] border-r border-[var(--border-subtle)]">{row.campana}</td>
                    <td className="p-2 text-[var(--text-secondary)] border-r border-[var(--border-subtle)]">{row.supervisor}</td>
                    <td className="p-2 text-[var(--text-secondary)] border-r border-[var(--border-subtle)]">{row.formador}</td>
                    <td className="p-2 text-[var(--text-secondary)] border-r border-[var(--border-subtle)] font-mono">{row.dni_ce}</td>
                    <td className="p-2 text-[var(--text-primary)] border-r border-[var(--border-subtle)] font-semibold uppercase">{row.postulante}</td>
                    <td className="p-2 text-[var(--text-secondary)] border-r border-[var(--border-subtle)]">{row.fecha_baja}</td>
                    <td className="p-2 text-red-500 border-r border-[var(--border-subtle)] font-bold uppercase">{row.motivo}</td>
                    <td className="p-2 text-[var(--text-muted)] border-r border-[var(--border-subtle)] max-w-[150px] truncate" title={row.comentarios}>{row.comentarios}</td>
                    
                    {/* AUTORIZA JEFE CAP */}
                    <td className="p-2 border-r border-[var(--border-subtle)] text-center">
                       <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${currentAutCap === 'SI' ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400' : 'bg-red-500/20 text-red-600 dark:text-red-400'}`}>
                         {currentAutCap}
                       </span>
                    </td>

                    {/* AUTORIZA JEFE RYS (Editable) */}
                    <td className="p-1 border-r border-[var(--border-subtle)] bg-[var(--accent)]/5">
                      <select 
                        className="w-full form-input py-1.5 px-2 text-xs rounded-lg uppercase"
                        value={editState.estado}
                        onChange={e => handleRowEdit(row.id, 'estado', e.target.value)}
                      >
                        <option value="">-- PENDIENTE --</option>
                        <option value="SI">SI</option>
                        <option value="NO">NO</option>
                      </select>
                    </td>

                    {/* COMENTARIO RYS */}
                    <td className="p-1 border-r border-[var(--border-subtle)] bg-[var(--accent)]/5">
                      <input 
                        type="text" 
                        placeholder="OPCIONAL..."
                        className="w-full form-input py-1.5 px-2 text-xs rounded-lg uppercase"
                        value={editState.comentario}
                        onChange={e => handleRowEdit(row.id, 'comentario', e.target.value)}
                      />
                    </td>

                    {/* PROCEDE */}
                    <td className="p-2 border-r border-[var(--border-subtle)] text-center">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${procedeVisual === 'PROCEDE' ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400' : (procedeVisual === 'NO PROCEDE' ? 'bg-red-500/20 text-red-600 dark:text-red-400' : 'bg-stone-500/20 text-stone-600 dark:text-stone-400')}`}>
                        {procedeVisual}
                      </span>
                    </td>

                    {/* FECHA DE ENVIO */}
                    <td className="p-2 text-[var(--text-muted)] text-[11px] font-mono">{row.fecha_registro ? new Date(row.fecha_registro).toLocaleString() : '-'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          </div>
        )}
      </Card>
    </PageLayout>
  )
}
