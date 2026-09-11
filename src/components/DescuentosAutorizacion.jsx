import React, { useState, useEffect } from 'react'
import { CheckSquare, Square, CheckCircle, RefreshCw, AlertTriangle, Save, ThumbsUp, ThumbsDown, Check, Loader2, Clock } from 'lucide-react'
import { fetchDescuentosPendientes, updateDescuentosIndividuales } from '../lib/dataService'
import { getDescuentoStatus48h } from '../lib/businessHoursUtils'
import PageLayout from './ui/PageLayout'
import PageHeader from './ui/PageHeader'
import Card from './ui/Card'

export default function DescuentosAutorizacion() {
  const [pendientes, setPendientes] = useState([])
  const [selectedIds, setSelectedIds] = useState([])
  const [loading, setLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState(null)
  const [successMsg, setSuccessMsg] = useState(null)
  
  // Estado para los inputs individuales de cada fila
  const [rowEdits, setRowEdits] = useState({})

  const loadData = async () => {
    setLoading(true)
    setErrorMsg(null)
    setSuccessMsg(null)
    try {
      const data = await fetchDescuentosPendientes()
      
      const edits = {}
      data.forEach(row => {
        const isExp = getDescuentoStatus48h(row.fecha_registro || row.created_at || row.fecha_baja).expired;
        const defaultEstado = isExp && (!row.autoriza_rys || row.autoriza_rys === 'PENDIENTE') ? 'SI' : ((row.autoriza_rys === 'PENDIENTE' || !row.autoriza_rys) ? '' : row.autoriza_rys);
        const defaultComentario = isExp && !row.comentario_rys ? 'descuento aprobado por tiempo de respuesta' : (row.comentario_rys || '');

        edits[row.id] = {
          estado: defaultEstado,
          comentario: defaultComentario
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

  const toggleSelectRow = (id) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    )
  }

  const toggleSelectAll = () => {
    if (selectedIds.length === pendientes.length) {
      setSelectedIds([])
    } else {
      setSelectedIds(pendientes.map(p => p.id))
    }
  }

  const setAllStatus = (newStatus) => {
    const updatedEdits = { ...rowEdits }
    pendientes.forEach(p => {
      updatedEdits[p.id] = {
        ...updatedEdits[p.id],
        estado: newStatus
      }
    })
    setRowEdits(updatedEdits)
    setSelectedIds(pendientes.map(p => p.id))
  }

  const handleGuardarFila = async (id) => {
    const edit = rowEdits[id]
    const row = pendientes.find(p => p.id === id)
    if (!row) return

    setActionLoading(true)
    setErrorMsg(null)
    setSuccessMsg(null)
    try {
      const res = await updateDescuentosIndividuales([{
        id,
        estado: edit?.estado ?? '',
        comentario: edit?.comentario || '',
        autoriza_cap: row.autoriza_cap
      }])
      setSuccessMsg(`Se guardó el descuento de ${row.postulante} correctamente.`)
      loadData()
    } catch (err) {
      console.error(err)
      setErrorMsg(`Error al guardar: ${err.message}`)
    } finally {
      setActionLoading(false)
    }
  }

  const handleGuardarSeleccionados = async () => {
    if (selectedIds.length === 0) {
      alert("Por favor selecciona al menos un descuento o modifica un estado para guardar.")
      return
    }
    
    const updates = selectedIds.map(id => ({
      id,
      estado: rowEdits[id]?.estado ?? '',
      comentario: rowEdits[id]?.comentario || '',
      autoriza_cap: pendientes.find(p => p.id === id)?.autoriza_cap
    }))
    
    setActionLoading(true)
    setErrorMsg(null)
    setSuccessMsg(null)
    try {
      const res = await updateDescuentosIndividuales(updates)
      setSuccessMsg(`Se actualizaron ${res.updated} registros de descuento exitosamente.`)
      loadData()
    } catch (err) {
      console.error(err)
      setErrorMsg(`Error al guardar registros: ${err.message}`)
    } finally {
      setActionLoading(false)
    }
  }

  const allSelected = pendientes.length > 0 && selectedIds.length === pendientes.length

  return (
    <PageLayout className="space-y-6 pb-20">
      {/* HEADER */}
      <PageHeader 
        title="Autorizar Descuentos - Jefe RYS" 
        subtitle="Revisa y aprueba los descuentos enviados. Solo los descuentos con doble autorización procederán."
        icon={CheckSquare}
      >
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <button onClick={loadData} className="btn-secondary flex items-center gap-2" disabled={loading}>
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Actualizar
          </button>

          {pendientes.length > 0 && (
            <>
              <button 
                onClick={() => setAllStatus('SI')}
                className="btn-secondary text-emerald-600 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10 flex items-center gap-1.5 text-xs font-bold"
                title="Marcar todos como SI (Aprobado)"
              >
                <ThumbsUp size={14} /> Aprobar Todos (SI)
              </button>

              <button 
                onClick={() => setAllStatus('NO')}
                className="btn-secondary text-rose-600 dark:text-rose-400 border-rose-500/30 hover:bg-rose-500/10 flex items-center gap-1.5 text-xs font-bold"
                title="Marcar todos como NO (Rechazado)"
              >
                <ThumbsDown size={14} /> Rechazar Todos (NO)
              </button>
            </>
          )}
          
          <button 
            onClick={handleGuardarSeleccionados}
            disabled={selectedIds.length === 0 || actionLoading}
            className={`btn-primary flex items-center gap-2 font-bold shadow-md transition-all ${
              selectedIds.length > 0 ? 'bg-emerald-600 hover:bg-emerald-500 text-white animate-pulse' : 'opacity-60'
            }`}
          >
            {actionLoading ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
            <span>Guardar Cambios {selectedIds.length > 0 ? `(${selectedIds.length})` : ''}</span>
          </button>
        </div>
      </PageHeader>

      {/* ALERTAS */}
      {errorMsg && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 rounded-xl text-sm flex items-center gap-2 font-bold animate-fadeIn">
          <AlertTriangle size={18} className="flex-shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {successMsg && (
        <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded-xl text-sm flex items-center gap-2 font-bold animate-fadeIn">
          <CheckCircle size={18} className="flex-shrink-0" />
          <span>{successMsg}</span>
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
                  <th className="p-3 w-10 text-center border-r border-[var(--border-subtle)]">
                    <input 
                      type="checkbox" 
                      checked={allSelected} 
                      onChange={toggleSelectAll}
                      className="w-4 h-4 rounded cursor-pointer accent-[var(--accent)]"
                      title={allSelected ? "Deseleccionar todos" : "Seleccionar todos"}
                    />
                  </th>
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
                  <th className="p-3 border-r border-[var(--border-subtle)] font-bold uppercase tracking-wider text-center">Autoriza CAP</th>
                  <th className="p-3 border-r border-[var(--border-subtle)] font-bold uppercase tracking-wider bg-[var(--accent)]/10 text-[var(--accent)] text-center min-w-[130px]">Autoriza RYS</th>
                  <th className="p-3 border-r border-[var(--border-subtle)] font-bold uppercase tracking-wider bg-[var(--accent)]/10 text-[var(--accent)] min-w-[180px]">Comentario RYS</th>
                  <th className="p-3 border-r border-[var(--border-subtle)] font-bold uppercase tracking-wider text-center">Procede</th>
                  <th className="p-3 border-r border-[var(--border-subtle)] font-bold uppercase tracking-wider">Fecha Envío</th>
                  <th className="p-3 border-r border-[var(--border-subtle)] font-bold uppercase tracking-wider text-center">Plazo 48h</th>
                  <th className="p-3 font-bold uppercase tracking-wider text-center sticky right-0 bg-[var(--table-head-bg)] shadow-l">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
              {pendientes.map(row => {
                const isSelected = selectedIds.includes(row.id)
                const status48h = getDescuentoStatus48h(row.fecha_registro || row.created_at || row.fecha_baja);
                const isExpired48h = status48h.expired;

                const dbEstado = (row.autoriza_rys === 'PENDIENTE' || !row.autoriza_rys) ? '' : row.autoriza_rys
                const editState = rowEdits[row.id] || { 
                  estado: isExpired48h && (!dbEstado || dbEstado === 'PENDIENTE') ? 'SI' : dbEstado, 
                  comentario: row.comentario_rys || (isExpired48h ? 'descuento aprobado por tiempo de respuesta' : '') 
                }
                
                // Cálculo dinámico de PROCEDE
                const currentAutRys = isExpired48h && (!editState.estado || editState.estado === 'PENDIENTE') ? 'SI' : editState.estado
                const currentAutCap = row.autoriza_cap || 'SI'
                
                let procedeVisual = 'PENDIENTE'
                if (currentAutRys === 'SI' || (isExpired48h && currentAutRys !== 'NO')) {
                  procedeVisual = (currentAutCap === 'SI') ? 'PROCEDE' : 'PENDIENTE'
                } else if (currentAutRys === 'NO') {
                  procedeVisual = 'NO PROCEDE'
                }

                return (
                  <tr 
                    key={row.id} 
                    className={`hover:bg-[var(--bg-muted)] focus-within:bg-[var(--accent)]/5 transition-colors ${isSelected ? 'bg-[var(--accent)]/10 font-medium' : ''}`}
                  >
                    {/* CHECKBOX */}
                    <td className="p-2 text-center border-r border-[var(--border-subtle)]">
                      <input 
                        type="checkbox" 
                        checked={isSelected} 
                        onChange={() => toggleSelectRow(row.id)}
                        className="w-4 h-4 rounded cursor-pointer accent-[var(--accent)]"
                      />
                    </td>
                    <td className="p-2 text-[var(--text-secondary)] border-r border-[var(--border-subtle)]">{row.sede}</td>
                    <td className="p-2 text-[var(--text-secondary)] border-r border-[var(--border-subtle)]">{row.segmento}</td>
                    <td className="p-2 text-[var(--text-secondary)] border-r border-[var(--border-subtle)] font-mono font-bold">{row.grupo_cap}</td>
                    <td className="p-2 text-[var(--text-secondary)] border-r border-[var(--border-subtle)]">{row.campana}</td>
                    <td className="p-2 text-[var(--text-secondary)] border-r border-[var(--border-subtle)]">{row.supervisor}</td>
                    <td className="p-2 text-[var(--text-secondary)] border-r border-[var(--border-subtle)]">{row.formador}</td>
                    <td className="p-2 text-[var(--text-secondary)] border-r border-[var(--border-subtle)] font-mono font-semibold">{row.dni_ce}</td>
                    <td className="p-2 text-[var(--text-primary)] border-r border-[var(--border-subtle)] font-bold uppercase">{row.postulante}</td>
                    <td className="p-2 text-[var(--text-secondary)] border-r border-[var(--border-subtle)]">{row.fecha_baja}</td>
                    <td className="p-2 text-red-500 border-r border-[var(--border-subtle)] font-bold uppercase">{row.motivo}</td>
                    <td className="p-2 text-[var(--text-muted)] border-r border-[var(--border-subtle)] max-w-[150px] truncate" title={row.comentarios}>{row.comentarios || '-'}</td>
                    
                    {/* AUTORIZA JEFE CAP */}
                    <td className="p-2 border-r border-[var(--border-subtle)] text-center">
                       <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${currentAutCap === 'SI' ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30' : 'bg-red-500/20 text-red-600 dark:text-red-400 border border-red-500/30'}`}>
                         {currentAutCap}
                       </span>
                    </td>

                    {/* AUTORIZA JEFE RYS (Editable) */}
                    <td className="p-1.5 border-r border-[var(--border-subtle)] bg-[var(--accent)]/5 text-center">
                      <select 
                        className={`w-full form-input py-1.5 px-2 text-xs rounded-lg uppercase font-bold border transition-colors ${
                          (editState.estado === 'SI' || (!editState.estado && isExpired48h)) ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/40' :
                          editState.estado === 'NO' ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/40' :
                          'border-[var(--border-normal)] text-[var(--text-secondary)]'
                        }`}
                        value={editState.estado || (isExpired48h ? 'SI' : '')}
                        onChange={e => handleRowEdit(row.id, 'estado', e.target.value)}
                      >
                        <option value="">-- PENDIENTE --</option>
                        <option value="SI">{isExpired48h ? 'SI (AUTO-APROBADO 48H)' : 'SI (APROBADO)'}</option>
                        <option value="NO">NO (RECHAZADO)</option>
                      </select>
                    </td>

                    {/* COMENTARIO RYS */}
                    <td className="p-1.5 border-r border-[var(--border-subtle)] bg-[var(--accent)]/5">
                      <input 
                        type="text" 
                        placeholder={isExpired48h ? "descuento aprobado por tiempo de respuesta" : "Comentario RyS..."}
                        className="w-full form-input py-1.5 px-2 text-xs rounded-lg uppercase border border-[var(--border-normal)]"
                        value={editState.comentario !== undefined && editState.comentario !== '' ? editState.comentario : (isExpired48h ? 'descuento aprobado por tiempo de respuesta' : '')}
                        onChange={e => handleRowEdit(row.id, 'comentario', e.target.value)}
                      />
                    </td>

                    {/* PROCEDE */}
                    <td className="p-2 border-r border-[var(--border-subtle)] text-center">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase border ${
                        procedeVisual === 'PROCEDE' ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/40' : 
                        (procedeVisual === 'NO PROCEDE' ? 'bg-rose-500/20 text-rose-600 dark:text-rose-400 border-rose-500/40' : 
                        'bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/40')
                      }`}>
                        {procedeVisual}
                      </span>
                    </td>

                    {/* FECHA DE ENVIO */}
                    <td className="p-2 text-[var(--text-muted)] text-[11px] font-mono">{row.fecha_registro ? new Date(row.fecha_registro).toLocaleString() : '-'}</td>

                    {/* PLAZO 48H HÁBILES */}
                    <td className="p-2 text-center border-r border-[var(--border-subtle)]">
                      {(() => {
                        const status48h = getDescuentoStatus48h(row.fecha_registro || row.created_at || row.fecha_baja);
                        return (
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            status48h.expired 
                              ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30' 
                              : 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20'
                          }`}>
                            <Clock size={10} /> {status48h.label}
                          </span>
                        );
                      })()}
                    </td>

                    {/* ACCIÓN INDIVIDUAL */}
                    <td className="p-2 text-center sticky right-0 bg-[var(--bg-surface)] shadow-l">
                      <button
                        onClick={() => handleGuardarFila(row.id)}
                        disabled={actionLoading}
                        className="px-2.5 py-1 rounded-md bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-[11px] font-bold shadow-xs flex items-center gap-1 mx-auto transition-all"
                        title="Guardar este registro individualmente"
                      >
                        <Save size={12} /> Guardar
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          </div>
        )}
      </Card>

      {/* BARRA FLOTANTE / INFERIOR DE GUARDADO SI HAY SELECCIONADOS */}
      {selectedIds.length > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 bg-[var(--bg-surface)] border border-[var(--border-normal)] shadow-2xl rounded-2xl px-6 py-3.5 flex items-center gap-4 animate-slideUp">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-[var(--accent)] text-white text-xs font-black flex items-center justify-center">
              {selectedIds.length}
            </span>
            <span className="text-xs font-bold text-[var(--text-primary)]">
              {selectedIds.length === 1 ? '1 descuento listo para guardar' : `${selectedIds.length} descuentos listos para guardar`}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setSelectedIds([])}
              className="btn-secondary py-1.5 px-3 text-xs"
              disabled={actionLoading}
            >
              Cancelar
            </button>
            <button
              onClick={handleGuardarSeleccionados}
              disabled={actionLoading}
              className="btn-primary py-1.5 px-4 text-xs font-bold flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg"
            >
              {actionLoading ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Guardar Autorizaciones ({selectedIds.length})
            </button>
          </div>
        </div>
      )}
    </PageLayout>
  )
}

