import React, { useState, useEffect, useMemo } from 'react'
import { Search, Loader2, Users, Edit2, Check, X, Plus } from 'lucide-react'
import { getEquipoFormacion, updateEquipoFormacion, addEquipoFormacion } from '../lib/dataService'
import { supabase } from '../lib/supabase'
import PageLayout from '../components/ui/PageLayout'
import PageHeader from '../components/ui/PageHeader'
import Card from '../components/ui/Card'

export default function EquipoFormacion() {
  const [equipo, setEquipo] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  
  // Inline edit state
  const [editingRow, setEditingRow] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [saving, setSaving] = useState(false)
  const [isNewRecord, setIsNewRecord] = useState(false)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const [data, perfilesRes] = await Promise.all([
        getEquipoFormacion(),
        supabase.from('perfiles').select('id, nombre, rol')
      ])
      const profiles = perfilesRes?.data || []
      
      const normalize = (str) => {
        if (!str) return ''
        return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim()
      }

      // Attach profile name to each record
      const enrichedData = data.map(e => {
        const perfil = profiles.find(p => {
          if (!p.nombre) return false
          const pNom = normalize(p.nombre)
          const byUser = e.usuario_alix && pNom === normalize(e.usuario_alix)
          const byName = e.nombres_completos && normalize(e.nombres_completos).includes(pNom)
          return byUser || byName
        })
        return { ...e, _realUsername: perfil?.nombre || e.usuario_alix }
      })

      setEquipo(enrichedData)
      setLoading(false)
    }
    load()
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toUpperCase()
    if (!q) return equipo
    return equipo.filter(e => {
      const hay = [
        e.documento, 
        e.datos_completos, 
        e.sede, 
        e.segmento, 
        e.subcampana, 
        e.cargo_funcional, 
        e.estado, 
        e.usuario_alix
      ].join(' ').toUpperCase()
      return hay.includes(q)
    })
  }, [equipo, search])

  const kpis = useMemo(() => {
    const activos = filtered.filter(e => e.estado?.toUpperCase() === 'ACTIVO').length
    const jefes = filtered.filter(e => e.cargo_funcional?.toUpperCase().includes('JEFA')).length
    const supervisores = filtered.filter(e => e.cargo_funcional?.toUpperCase().includes('SUPERV')).length
    const formadores = filtered.filter(e => e.cargo_funcional?.toUpperCase().includes('FORMADOR')).length
    
    return { total: filtered.length, activos, jefes, supervisores, formadores }
  }, [filtered])

  const handleEdit = (row) => {
    setEditingRow(row.documento)
    setEditForm({ ...row })
    setIsNewRecord(false)
  }

  const handleAddNew = () => {
    const tempId = 'NEW_' + Date.now()
    const newRecord = {
      documento: '',
      apellido_paterno: '',
      apellido_materno: '',
      nombres_completos: '',
      datos_completos: '',
      sede: '',
      segmento: '',
      subcampana: '',
      cargo_contractual: '',
      cargo_funcional: '',
      estado: 'ACTIVO',
      fecha_inicio: '',
      fecha_cese: '',
      bono_bruto: 0,
      usuario_alix: '',
      _tempId: tempId
    }
    setEquipo(prev => [newRecord, ...prev])
    setEditingRow(tempId)
    setEditForm({ ...newRecord })
    setIsNewRecord(true)
  }

  const handleCancel = () => {
    if (isNewRecord) {
      setEquipo(prev => prev.filter(e => e._tempId !== editingRow))
    }
    setEditingRow(null)
    setEditForm({})
    setIsNewRecord(false)
  }

  const handleSave = async () => {
    if (!editingRow) return
    
    // Validación de campos requeridos
    const requiredFields = {
      documento: 'DNI',
      nombres_completos: 'Nombres',
      apellido_paterno: 'Apellido Paterno',
      apellido_materno: 'Apellido Materno',
      sede: 'Sede',
      segmento: 'Segmento',
      subcampana: 'Subcampaña',
      cargo_contractual: 'Cargo Contractual',
      cargo_funcional: 'Cargo Funcional',
      estado: 'Estado',
      fecha_inicio: 'Fecha de Inicio',
    }
    
    const missingFields = Object.keys(requiredFields).filter(key => {
      const val = editForm[key]
      return val === undefined || val === null || String(val).trim() === ''
    })

    if (missingFields.length > 0) {
      const fieldNames = missingFields.map(k => requiredFields[k]).join(', ')
      alert(`Por favor rellene todos los campos obligatorios. Faltan: ${fieldNames}`)
      return
    }

    setSaving(true)
    try {
      const payload = { ...editForm }
      delete payload._tempId
      // Auto-generar datos completos
      payload.datos_completos = `${payload.nombres_completos} ${payload.apellido_paterno} ${payload.apellido_materno}`.trim()

      // Sanitize empty strings for DB compatibility
      if (!payload.fecha_cese) payload.fecha_cese = null;
      if (!payload.fecha_inicio) payload.fecha_inicio = null;
      if (isNaN(payload.bono_bruto) || payload.bono_bruto === '') payload.bono_bruto = 0;

      let savedData = null
      
      if (isNewRecord) {
        savedData = await addEquipoFormacion(payload)
        if (savedData) {
          setEquipo(prev => prev.map(e => e._tempId === editingRow ? savedData : e))
        } else {
          setEquipo(prev => prev.map(e => e._tempId === editingRow ? payload : e))
        }
      } else {
        savedData = await updateEquipoFormacion(editingRow, payload)
        if (savedData) {
          setEquipo(prev => prev.map(e => e.documento === editingRow ? savedData : e))
        } else {
          setEquipo(prev => prev.map(e => e.documento === editingRow ? { ...e, ...payload } : e))
        }
      }
      
      setEditingRow(null)
      setEditForm({})
      setIsNewRecord(false)
    } catch (err) {
      console.error(err)
      alert("Error al guardar los cambios")
    } finally {
      setSaving(false)
    }
  }

  const handleChange = (field, value) => {
    setEditForm(prev => ({ ...prev, [field]: value }))
  }

  return (
    <PageLayout className="space-y-6">
      {/* HEADER */}
      <PageHeader
        title="EQUIPO DE FORMACIÓN"
        subtitle="Directorio y condiciones del equipo"
        icon={Users}
      />

      {/* KPIS */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <KpiCard title="TOTAL EQUIPO" value={kpis.total} color="indigo" />
        <KpiCard title="ACTIVOS" value={kpis.activos} color="emerald" />
        <KpiCard title="JEFES" value={kpis.jefes} color="indigo" />
        <KpiCard title="SUPERVISORES" value={kpis.supervisores} color="indigo" />
        <KpiCard title="FORMADORES" value={kpis.formadores} color="indigo" />
      </div>

      {/* CONTROLES */}
      <Card className="flex flex-col md:flex-row gap-4 mb-6">
        <div className="flex-1 flex items-center px-4 py-2.5 rounded-xl border transition-colors focus-within:border-[var(--accent)] focus-within:ring-2 focus-within:ring-[var(--accent)]/10" style={{ background: 'var(--input-bg)', borderColor: 'var(--input-border)' }}>
          <Search size={16} className="mr-3 text-[var(--accent)]" />
          <input
            type="text"
            placeholder="Buscar por DNI, nombre, sede, segmento..."
            className="w-full bg-transparent border-none focus:outline-none text-sm font-medium"
            style={{ color: 'var(--text-primary)' }}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <button
          onClick={handleAddNew}
          disabled={editingRow !== null}
          className="btn-primary flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold shadow-md hover:shadow-lg transition-all disabled:opacity-50"
        >
          <Plus size={16} />
          Añadir Miembro
        </button>
      </Card>

      {/* TABLA */}
      <Card noPadding className="overflow-hidden mb-6">
        <div className="table-scroll overflow-x-auto">
          <table className="w-full text-left text-xs whitespace-nowrap min-w-[2000px]">
            <thead>
              <tr className="bg-[var(--table-head-bg)] border-b border-[var(--border-subtle)]">
                <th className="px-4 py-3 font-bold text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Documento</th>
                <th className="px-4 py-3 font-bold text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Nombres</th>
                <th className="px-4 py-3 font-bold text-[10px] uppercase tracking-wider text-[var(--text-muted)]">A. Paterno</th>
                <th className="px-4 py-3 font-bold text-[10px] uppercase tracking-wider text-[var(--text-muted)]">A. Materno</th>
                <th className="px-4 py-3 font-bold text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Sede</th>
                <th className="px-4 py-3 font-bold text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Segmento</th>
                <th className="px-4 py-3 font-bold text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Subcampaña</th>
                <th className="px-4 py-3 font-bold text-[10px] uppercase tracking-wider text-[var(--text-muted)]">C. Contractual</th>
                <th className="px-4 py-3 font-bold text-[10px] uppercase tracking-wider text-[var(--text-muted)]">C. Funcional</th>
                <th className="px-4 py-3 font-bold text-[10px] uppercase tracking-wider text-center text-[var(--text-muted)]">Estado</th>
                <th className="px-4 py-3 font-bold text-[10px] uppercase tracking-wider text-[var(--text-muted)]">F. Inicio</th>
                <th className="px-4 py-3 font-bold text-[10px] uppercase tracking-wider text-[var(--text-muted)]">F. Cese</th>
                <th className="px-4 py-3 font-bold text-[10px] uppercase tracking-wider text-right text-[var(--text-muted)]">Bono Bruto</th>
                <th className="px-4 py-3 font-bold text-[10px] uppercase tracking-wider text-center text-[var(--text-muted)]">Usuario</th>
                <th className="px-4 py-3 font-bold text-[10px] uppercase tracking-wider text-center w-16 text-[var(--text-muted)]">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={15} className="px-6 py-12 text-center">
                    <Loader2 className="animate-spin mx-auto text-indigo-500 mb-2" size={24} />
                    <span style={{ color: 'var(--text-muted)' }}>Cargando equipo...</span>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={15} className="px-6 py-12 text-center" style={{ color: 'var(--text-muted)' }}>
                    No se encontraron registros.
                  </td>
                </tr>
              ) : filtered.map(e => {
                const isEditing = editingRow === (e._tempId || e.documento);
                const isCreating = isEditing && isNewRecord;

                return (
                  <tr key={e._tempId || e.documento} className="border-b transition-colors hover:bg-[var(--bg-muted)]" style={{ borderColor: 'var(--border-subtle)', background: isEditing ? 'var(--bg-elevated-hover)' : 'transparent' }}>
                    
                    {/* Documento */}
                    <td className="px-4 py-3 font-mono text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                      {isCreating ? (
                        <input
                          type="text"
                          placeholder="DNI"
                          value={editForm.documento || ''}
                          onChange={(ev) => handleChange('documento', ev.target.value)}
                          className="w-24 px-2 py-1 rounded bg-black/20 border border-slate-600 focus:border-indigo-500 focus:outline-none"
                        />
                      ) : e.documento}
                    </td>

                    {/* Nombres */}
                    <td className="px-4 py-3">
                      {isEditing ? (
                        <input
                          type="text"
                          placeholder="Nombres"
                          value={editForm.nombres_completos || ''}
                          onChange={(ev) => handleChange('nombres_completos', ev.target.value)}
                          className="w-32 px-2 py-1 rounded bg-black/20 border border-slate-600 focus:border-indigo-500 focus:outline-none text-sm font-semibold"
                        />
                      ) : (
                        <div className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>{e.nombres_completos || '—'}</div>
                      )}
                    </td>

                    {/* A. Paterno */}
                    <td className="px-4 py-3">
                      {isEditing ? (
                        <input
                          type="text"
                          placeholder="A. Paterno"
                          value={editForm.apellido_paterno || ''}
                          onChange={(ev) => handleChange('apellido_paterno', ev.target.value)}
                          className="w-24 px-2 py-1 rounded bg-black/20 border border-slate-600 focus:border-indigo-500 focus:outline-none text-xs"
                        />
                      ) : (
                        <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{e.apellido_paterno || '—'}</div>
                      )}
                    </td>

                    {/* A. Materno */}
                    <td className="px-4 py-3">
                      {isEditing ? (
                        <input
                          type="text"
                          placeholder="A. Materno"
                          value={editForm.apellido_materno || ''}
                          onChange={(ev) => handleChange('apellido_materno', ev.target.value)}
                          className="w-24 px-2 py-1 rounded bg-black/20 border border-slate-600 focus:border-indigo-500 focus:outline-none text-xs"
                        />
                      ) : (
                        <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{e.apellido_materno || '—'}</div>
                      )}
                    </td>

                    {/* Sede */}
                    <td className="px-4 py-3">
                      {isEditing ? (
                        <input
                          type="text"
                          placeholder="Sede"
                          value={editForm.sede || ''}
                          onChange={(ev) => handleChange('sede', ev.target.value)}
                          className="w-24 px-2 py-1 rounded bg-black/20 border border-slate-600 focus:border-indigo-500 focus:outline-none text-xs"
                        />
                      ) : (
                        <div className="font-bold text-[11px]" style={{ color: 'var(--text-secondary)' }}>{e.sede || '—'}</div>
                      )}
                    </td>

                    {/* Segmento */}
                    <td className="px-4 py-3">
                      {isEditing ? (
                        <input
                          type="text"
                          placeholder="Segmento"
                          value={editForm.segmento || ''}
                          onChange={(ev) => handleChange('segmento', ev.target.value)}
                          className="w-32 px-2 py-1 rounded bg-black/20 border border-slate-600 focus:border-indigo-500 focus:outline-none text-xs"
                        />
                      ) : (
                        <div className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>{e.segmento || '—'}</div>
                      )}
                    </td>

                    {/* Subcampaña */}
                    <td className="px-4 py-3">
                      {isEditing ? (
                        <input
                          type="text"
                          placeholder="Subcampaña"
                          value={editForm.subcampana || ''}
                          onChange={(ev) => handleChange('subcampana', ev.target.value)}
                          className="w-32 px-2 py-1 rounded bg-black/20 border border-slate-600 focus:border-indigo-500 focus:outline-none text-xs"
                        />
                      ) : (
                        <div className="text-[11px] text-indigo-400 font-medium">{e.subcampana || '—'}</div>
                      )}
                    </td>

                    {/* Cargo Contractual */}
                    <td className="px-4 py-3">
                      {isEditing ? (
                        <input
                          type="text"
                          value={editForm.cargo_contractual || ''}
                          onChange={(ev) => handleChange('cargo_contractual', ev.target.value)}
                          className="w-32 px-2 py-1 rounded bg-black/20 border border-slate-600 focus:border-indigo-500 focus:outline-none text-xs"
                        />
                      ) : (
                        <div className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>{e.cargo_contractual || '—'}</div>
                      )}
                    </td>

                    {/* Cargo Funcional */}
                    <td className="px-4 py-3">
                      {isEditing ? (
                        <input
                          type="text"
                          value={editForm.cargo_funcional || ''}
                          onChange={(ev) => handleChange('cargo_funcional', ev.target.value)}
                          className="w-32 px-2 py-1 rounded bg-black/20 border border-slate-600 focus:border-indigo-500 focus:outline-none text-xs"
                        />
                      ) : (
                        <div className="text-[11px] font-semibold" style={{ color: 'var(--text-secondary)' }}>{e.cargo_funcional || '—'}</div>
                      )}
                    </td>

                    {/* Estado */}
                    <td className="px-4 py-3 text-center">
                      {isEditing ? (
                        <select
                          value={editForm.estado?.toUpperCase() || ''}
                          onChange={(ev) => handleChange('estado', ev.target.value)}
                          className="w-24 px-2 py-1 rounded bg-slate-800 border border-slate-600 focus:border-indigo-500 focus:outline-none text-xs"
                        >
                          <option value="ACTIVO">ACTIVO</option>
                          <option value="CESE">CESE</option>
                        </select>
                      ) : (
                        <span className={`inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold border ${e.estado?.toUpperCase() === 'ACTIVO' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : 'bg-rose-500/10 text-rose-500 border-rose-500/20'}`}>
                          {e.estado?.toUpperCase() || '—'}
                        </span>
                      )}
                    </td>

                    {/* F. Inicio */}
                    <td className="px-4 py-3 text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                      {isEditing ? (
                        <input
                          type="date"
                          value={editForm.fecha_inicio || ''}
                          onChange={(ev) => handleChange('fecha_inicio', ev.target.value)}
                          className="w-28 px-1 py-0.5 rounded bg-black/20 border border-slate-600 focus:border-indigo-500 focus:outline-none text-[10px]"
                        />
                      ) : (
                        <div>{e.fecha_inicio || '—'}</div>
                      )}
                    </td>

                    {/* F. Cese */}
                    <td className="px-4 py-3 text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                      {isEditing ? (
                        <input
                          type="date"
                          value={editForm.fecha_cese || ''}
                          onChange={(ev) => handleChange('fecha_cese', ev.target.value)}
                          className="w-28 px-1 py-0.5 rounded bg-black/20 border border-slate-600 focus:border-indigo-500 focus:outline-none text-[10px]"
                        />
                      ) : (
                        <div>{e.fecha_cese || '—'}</div>
                      )}
                    </td>

                    {/* Bono Bruto */}
                    <td className="px-4 py-3 text-right">
                      {isEditing ? (
                        <div className="flex items-center gap-1 justify-end">
                          <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>S/</span>
                          <input
                            type="number"
                            value={editForm.bono_bruto || ''}
                            onChange={(ev) => handleChange('bono_bruto', parseFloat(ev.target.value))}
                            className="w-20 px-2 py-1 rounded bg-black/20 border border-slate-600 focus:border-indigo-500 focus:outline-none text-sm text-emerald-500 font-bold text-right"
                          />
                        </div>
                      ) : (
                        <div className="font-bold text-emerald-500 text-sm">S/ {Number(e.bono_bruto || 0).toFixed(2)}</div>
                      )}
                    </td>

                    {/* Usuario */}
                    <td className="px-4 py-3 text-center font-mono text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                      <span className="px-2 py-1 rounded-md bg-white/5 border" style={{ borderColor: 'var(--border-subtle)' }}>
                        {e.usuario_alix || '—'}
                      </span>
                    </td>

                    {/* Acciones */}
                    <td className="px-4 py-3 text-center">
                      {isEditing ? (
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={handleSave}
                            disabled={saving}
                            className="p-1.5 rounded-md bg-emerald-500/20 text-emerald-500 hover:bg-emerald-500/30 transition-colors"
                            title="Guardar"
                          >
                            {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                          </button>
                          <button
                            onClick={handleCancel}
                            disabled={saving}
                            className="p-1.5 rounded-md bg-rose-500/20 text-rose-500 hover:bg-rose-500/30 transition-colors"
                            title="Cancelar"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => handleEdit(e)}
                          className="p-1.5 rounded-md hover:bg-white/10 transition-colors"
                          style={{ color: 'var(--text-muted)' }}
                          title="Editar"
                        >
                          <Edit2 size={14} />
                        </button>
                      )}
                    </td>

                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </PageLayout>
  )
}

function KpiCard({ title, value, color = 'indigo' }) {
  const colorMap = {
    indigo: 'text-indigo-500',
    emerald: 'text-emerald-500',
  }
  return (
    <Card className="flex flex-col justify-center transition-all hover:shadow-md">
      <div className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>
        {title}
      </div>
      <div className={`text-2xl font-black ${colorMap[color] || 'text-indigo-500'}`}>
        {value}
      </div>
    </Card>
  )
}
