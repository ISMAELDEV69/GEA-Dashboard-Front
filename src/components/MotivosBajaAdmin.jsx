import { useState, useEffect } from 'react'
import { Plus, Edit2, Trash2, Save, X, AlertTriangle, Link as LinkIcon, Settings } from 'lucide-react'
import { insertMotivoBaja, updateMotivoBaja, deleteMotivoBaja } from '../lib/dataService'
import PageLayout from './ui/PageLayout'
import PageHeader from './ui/PageHeader'
import Card from './ui/Card'

export default function MotivosBajaAdmin({ motivosBaja = [], onRefresh }) {
  const [editingId, setEditingId] = useState(null)
  const [formData, setFormData] = useState({ motivo: '', siglas: '', descripcion: '' })
  const [isAdding, setIsAdding] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)


  const handleEdit = (item) => {
    setEditingId(item.motivo)
    setFormData({ motivo: item.motivo, siglas: item.siglas || '', descripcion: item.descripcion || '' })
    setIsAdding(false)
    setError(null)
  }

  const handleAdd = () => {
    setIsAdding(true)
    setEditingId(null)
    setFormData({ motivo: '', siglas: '', descripcion: '' })
    setError(null)
  }

  const handleCancel = () => {
    setIsAdding(false)
    setEditingId(null)
    setFormData({ motivo: '', siglas: '', descripcion: '' })
    setError(null)
  }

  const handleSave = async () => {
    try {
      if (!formData.motivo.trim()) throw new Error("El motivo es obligatorio.")
      setLoading(true)
      
      const payload = {
        motivo: formData.motivo.trim().toUpperCase(),
        siglas: formData.siglas.trim().toUpperCase() || null,
        descripcion: formData.descripcion.trim() || null
      }

      if (isAdding) {
        if (motivosBaja.some(m => m.motivo === payload.motivo)) {
          throw new Error("El motivo ya existe.")
        }
        await insertMotivoBaja(payload)
      } else {
        await updateMotivoBaja(editingId, payload)
      }
      
      await onRefresh()
      handleCancel()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (motivoId) => {
    if (!window.confirm(`¿Seguro que deseas eliminar el motivo "${motivoId}"?`)) return
    try {
      setLoading(true)
      await deleteMotivoBaja(motivoId)
      await onRefresh()
    } catch (err) {
      alert(err.message || 'Error al eliminar')
    } finally {
      setLoading(false)
    }
  }

  return (
    <PageLayout className="space-y-6 max-w-4xl mx-auto">
      <PageHeader
        title="Configuración: Motivos de Baja"
        subtitle="Administra los motivos de cese disponibles en la tabla de asistencias."
        icon={Settings}
        actions={
          <button
            onClick={handleAdd}
            disabled={isAdding || editingId}
            className="btn-primary flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold shadow-lg disabled:opacity-50"
          >
            <Plus size={16} />
            Nuevo Motivo
          </button>
        }
      />

      {error && (
        <div className="p-4 rounded-xl border flex items-start gap-3 bg-rose-500/10 border-rose-500/20 text-rose-500">
          <AlertTriangle size={18} className="mt-0.5" />
          <div className="text-sm">{error}</div>
        </div>
      )}

      <Card noPadding className="overflow-hidden">
        <div className="overflow-x-auto table-scroll">
          <table className="w-full text-left text-sm">
            <thead className="bg-[var(--table-head-bg)] text-[var(--text-secondary)] border-b border-[var(--border-subtle)]">
            <tr>
              <th className="px-4 py-3 font-semibold w-1/3">Motivo</th>
              <th className="px-4 py-3 font-semibold w-1/6">Sigla</th>
              <th className="px-4 py-3 font-semibold">Descripción</th>
              <th className="px-4 py-3 font-semibold w-24 text-center">Acciones</th>
            </tr>
          </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
            {isAdding && (
              <tr className="bg-[var(--accent-soft)] transition-colors">
                <td className="px-4 py-3">
                  <input
                    type="text"
                    value={formData.motivo}
                    onChange={e => setFormData({ ...formData, motivo: e.target.value })}
                    placeholder="Ej. NO CONTACTO"
                    className="form-input w-full uppercase"
                  />
                </td>
                <td className="px-4 py-3">
                  <input
                    type="text"
                    value={formData.siglas}
                    onChange={e => setFormData({ ...formData, siglas: e.target.value })}
                    placeholder="Ej. NC"
                    className="form-input w-full uppercase"
                  />
                </td>
                <td className="px-4 py-3">
                  <input
                    type="text"
                    value={formData.descripcion}
                    onChange={e => setFormData({ ...formData, descripcion: e.target.value })}
                    placeholder="Descripción detallada"
                    className="form-input w-full"
                  />
                </td>
                <td className="px-4 py-2 flex items-center justify-center gap-2">
                  <button onClick={handleSave} disabled={loading} className="p-1.5 rounded-lg text-emerald-400 hover:bg-emerald-400/10 transition-colors">
                    <Save size={16} />
                  </button>
                  <button onClick={handleCancel} disabled={loading} className="p-1.5 rounded-lg text-rose-400 hover:bg-rose-400/10 transition-colors">
                    <X size={16} />
                  </button>
                </td>
              </tr>
            )}

            {motivosBaja.length === 0 && !isAdding ? (
              <tr>
                <td colSpan="4" className="px-4 py-8 text-center text-xs text-[var(--text-muted)]">
                  No hay motivos de baja configurados.
                </td>
              </tr>
            ) : (
              motivosBaja.map((m, idx) => {
                const isEditing = editingId === m.motivo
                return (
                  <tr key={m.motivo} className={`transition-colors ${isEditing ? 'bg-[var(--accent-soft)]' : (idx % 2 === 0 ? 'bg-[var(--bg-surface)]' : 'bg-[var(--bg-base)]/20')} hover:bg-[var(--bg-muted)]`}>
                    <td className="px-4 py-3 font-semibold text-[var(--text-primary)]">
                      {isEditing ? (
                        <span className="text-xs">{m.motivo} (No editable)</span>
                      ) : m.motivo}
                    </td>
                    <td className="px-4 py-3">
                      {isEditing ? (
                        <input
                          type="text"
                          value={formData.siglas}
                          onChange={e => setFormData({ ...formData, siglas: e.target.value })}
                          className="form-input w-full uppercase"
                        />
                      ) : <span className="text-xs px-2 py-1 rounded border border-[var(--border-subtle)] font-mono text-[var(--text-muted)] bg-[var(--bg-elevated)]">{m.siglas || '-'}</span>}
                    </td>
                    <td className="px-4 py-3 text-[var(--text-secondary)]">
                      {isEditing ? (
                        <input
                          type="text"
                          value={formData.descripcion}
                          onChange={e => setFormData({ ...formData, descripcion: e.target.value })}
                          className="form-input w-full"
                        />
                      ) : <span className="text-xs">{m.descripcion || '-'}</span>}
                    </td>
                    <td className="px-4 py-3">
                      {isEditing ? (
                        <div className="flex justify-center gap-2">
                          <button onClick={handleSave} disabled={loading} className="p-1.5 rounded-lg text-emerald-400 hover:bg-emerald-400/10 transition-colors">
                            <Save size={16} />
                          </button>
                          <button onClick={handleCancel} disabled={loading} className="p-1.5 rounded-lg text-rose-400 hover:bg-rose-400/10 transition-colors">
                            <X size={16} />
                          </button>
                        </div>
                      ) : (
                        <div className="flex justify-center gap-2">
                          <button
                            onClick={() => handleEdit(m)}
                            disabled={isAdding || editingId}
                            className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--accent)] hover:bg-[var(--accent-soft)] transition-colors disabled:opacity-50"
                          >
                            <Edit2 size={16} />
                          </button>
                          <button
                            onClick={() => handleDelete(m.motivo)}
                            disabled={isAdding || editingId || loading}
                            className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-rose-500 hover:bg-rose-500/10 transition-colors disabled:opacity-50"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
        </div>
      </Card>
    </PageLayout>
  )
}
