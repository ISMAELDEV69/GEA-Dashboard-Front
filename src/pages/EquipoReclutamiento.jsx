import React, { useState, useEffect, useMemo } from 'react'
import { Search, Loader2, Users, Edit2, Check, X, Plus, UserMinus, UserCheck, Calendar, Download, AlertTriangle, ShieldAlert } from 'lucide-react'
import { getEquipoReclutamiento, updateEquipoReclutamiento, addEquipoReclutamiento } from '../lib/dataService'
import { supabase } from '../lib/supabase'
import PageLayout from '../components/ui/PageLayout'
import PageHeader from '../components/ui/PageHeader'
import Card from '../components/ui/Card'

export default function EquipoReclutamiento() {
  const [equipo, setEquipo] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterEstado, setFilterEstado] = useState('TODOS') // 'TODOS' | 'ACTIVO' | 'CESE'
  const [filterCargo, setFilterCargo] = useState('TODOS')
  
  // Inline edit state
  const [editingRow, setEditingRow] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [saving, setSaving] = useState(false)
  const [isNewRecord, setIsNewRecord] = useState(false)

  // Quick Cese / Reactivación Modal
  const [quickModalUser, setQuickModalUser] = useState(null)
  const [quickCeseDate, setQuickCeseDate] = useState(() => new Date().toISOString().split('T')[0])
  const [quickSaving, setQuickSaving] = useState(false)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const [data, perfilesRes] = await Promise.all([
        getEquipoReclutamiento(),
        supabase.from('perfiles_publico').select('id, nombre, rol')
      ])
      const profiles = perfilesRes?.data || []
      
      const normalize = (str) => {
        if (!str) return ''
        return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim()
      }

      const enrichedData = data.map(e => {
        const perfil = profiles.find(p => {
          if (!p.nombre) return false
          const pNom = normalize(p.nombre)
          const byUser = e.alix && pNom === normalize(e.alix)
          const byName = e.nombres_completos && normalize(e.nombres_completos).includes(pNom)
          return byUser || byName
        })
        return { ...e, _realUsername: perfil?.nombre || e.alix }
      })

      setEquipo(enrichedData)
      setLoading(false)
    }
    load()
  }, [])

  // Estadísticas globales del equipo completo
  const stats = useMemo(() => {
    const total = equipo.length
    const activos = equipo.filter(e => (e.estado || 'ACTIVO').trim().toUpperCase() === 'ACTIVO').length
    const cesados = equipo.filter(e => (e.estado || 'ACTIVO').trim().toUpperCase() !== 'ACTIVO').length
    const jefes = equipo.filter(e => e.cargo?.toLowerCase().includes('jefe')).length
    const coordinadores = equipo.filter(e => e.cargo?.toLowerCase().includes('coordinador')).length
    const analistas = equipo.filter(e => e.cargo?.toLowerCase().includes('analista')).length
    const asistentes = equipo.filter(e => e.cargo?.toLowerCase().includes('asistente')).length
    return { total, activos, cesados, jefes, coordinadores, analistas, asistentes }
  }, [equipo])

  // Filtrado reactivo por Estado, Cargo y Búsqueda textual
  const filtered = useMemo(() => {
    return equipo.filter(e => {
      const est = (e.estado || 'ACTIVO').trim().toUpperCase()
      if (filterEstado === 'ACTIVO' && est !== 'ACTIVO') return false
      if (filterEstado === 'CESE' && est === 'ACTIVO') return false

      if (filterCargo !== 'TODOS') {
        const c = (e.cargo || '').toLowerCase()
        if (filterCargo === 'JEFE' && !c.includes('jefe')) return false
        if (filterCargo === 'COORDINADOR' && !c.includes('coordinador')) return false
        if (filterCargo === 'ANALISTA' && !c.includes('analista')) return false
        if (filterCargo === 'ASISTENTE' && !c.includes('asistente')) return false
      }

      if (search.trim()) {
        const q = search.trim().toUpperCase()
        const hay = [
          e.documento,
          e.alias,
          e.nombres_completos,
          e.apellido_paterno,
          e.apellido_materno,
          e.cargo,
          e.estado,
          e.alix
        ].join(' ').toUpperCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [equipo, filterEstado, filterCargo, search])

  // Acción rápida: Confirmar Cese o Reactivación
  const handleConfirmQuickStatus = async () => {
    if (!quickModalUser) return
    setQuickSaving(true)
    try {
      const isActivo = (quickModalUser.estado || 'ACTIVO').trim().toUpperCase() === 'ACTIVO'
      const newEstado = isActivo ? 'CESE' : 'ACTIVO'
      const newFechaCese = isActivo ? (quickCeseDate || new Date().toISOString().split('T')[0]) : null

      const payload = {
        ...quickModalUser,
        estado: newEstado,
        fecha_cese: newFechaCese
      }
      delete payload._tempId
      delete payload._realUsername

      await updateEquipoReclutamiento(quickModalUser.documento, payload)

      // Actualizar estado local
      setEquipo(prev => prev.map(e => {
        if (e.documento === quickModalUser.documento) {
          return { ...e, estado: newEstado, fecha_cese: newFechaCese }
        }
        return e
      }))

      setQuickModalUser(null)
    } catch (err) {
      console.error('Error al cambiar estado rápido:', err)
      alert(`Error al actualizar estado: ${err?.message || err?.error_description || JSON.stringify(err)}`)
    } finally {
      setQuickSaving(false)
    }
  }

  // Exportar a CSV
  const handleExportCsv = () => {
    if (!filtered.length) {
      alert('No hay registros para exportar.')
      return
    }
    const headers = ['DOCUMENTO', 'ALIAS', 'NOMBRES', 'A_PATERNO', 'A_MATERNO', 'CARGO', 'ESTADO', 'FECHA_INGRESO', 'FECHA_CESE', 'BONO', 'PCT_EFECTIVO', 'PCT_SODEXO', 'ALIX']
    const rows = filtered.map(e => [
      `"${e.documento || ''}"`,
      `"${(e.alias || '').replace(/"/g, '""')}"`,
      `"${(e.nombres_completos || '').replace(/"/g, '""')}"`,
      `"${(e.apellido_paterno || '').replace(/"/g, '""')}"`,
      `"${(e.apellido_materno || '').replace(/"/g, '""')}"`,
      `"${(e.cargo || '').replace(/"/g, '""')}"`,
      `"${e.estado || 'ACTIVO'}"`,
      `"${e.fecha_ingreso || ''}"`,
      `"${e.fecha_cese || ''}"`,
      e.bono || 0,
      e.pct_efectivo || 60,
      e.pct_sodexo || 40,
      `"${e.alix || ''}"`
    ])
    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `equipo_reclutamiento_${filterEstado.toLowerCase()}_${new Date().toISOString().split('T')[0]}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const handleEdit = (row) => {
    setEditingRow(row.documento)
    setEditForm({ ...row })
    setIsNewRecord(false)
  }

  const handleAddNew = () => {
    const tempId = 'NEW_' + Date.now()
    const newRecord = {
      documento: '',
      alias: '',
      nombres_completos: '',
      apellido_paterno: '',
      apellido_materno: '',
      cargo: 'Asistente de Reclutamiento y Selección',
      estado: 'ACTIVO',
      fecha_ingreso: new Date().toISOString().split('T')[0],
      fecha_cese: '',
      bono: 400,
      pct_efectivo: 60,
      pct_sodexo: 40,
      alix: '',
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
    
    // Solo requerir Documento y Nombre mínimo para crear la ficha
    const doc = String(editForm.documento || '').trim()
    const nom = String(editForm.nombres_completos || '').trim()

    if (!doc) {
      alert('Por favor ingrese el Documento / DNI.')
      return
    }
    if (!nom) {
      alert('Por favor ingrese los Nombres del colaborador.')
      return
    }

    setSaving(true)
    try {
      const payload = { ...editForm }
      delete payload._tempId
      delete payload._realUsername // Eliminar campo virtual
      
      // Defaults automáticos
      payload.documento = doc
      payload.nombres_completos = nom
      payload.cargo = payload.cargo || 'Asistente de Reclutamiento y Selección'
      payload.estado = (payload.estado || 'ACTIVO').toUpperCase()
      
      // Sanitizar campos vacíos que rompen la BD
      if (!payload.fecha_cese || payload.fecha_cese === '') payload.fecha_cese = null;
      if (!payload.fecha_ingreso || payload.fecha_ingreso === '') payload.fecha_ingreso = null;
      payload.bono = (payload.bono === '' || isNaN(payload.bono)) ? 0 : Number(payload.bono);
      payload.pct_efectivo = (payload.pct_efectivo === '' || isNaN(payload.pct_efectivo)) ? 0 : Number(payload.pct_efectivo);
      payload.pct_sodexo = (payload.pct_sodexo === '' || isNaN(payload.pct_sodexo)) ? 0 : Number(payload.pct_sodexo);
      if (payload.fecha_cese === '') payload.fecha_cese = null;
      if (payload.fecha_ingreso === '') payload.fecha_ingreso = null;
      if (isNaN(payload.bono) || payload.bono === '') payload.bono = 0;
      if (isNaN(payload.pct_efectivo) || payload.pct_efectivo === '') payload.pct_efectivo = 0;
      if (isNaN(payload.pct_sodexo) || payload.pct_sodexo === '') payload.pct_sodexo = 0;
      
      // Ensure we don't send fields that don't exist in the database
      delete payload.remuneracion_basica;
      delete payload.bono_movilidad;
      delete payload.porcentaje_efectivo;
      delete payload.porcentaje_sodexo;


      let savedData = null
      
      if (isNewRecord) {
        savedData = await addEquipoReclutamiento(payload)
        if (savedData) {
          setEquipo(prev => prev.map(e => e._tempId === editingRow ? savedData : e))
        } else {
          setEquipo(prev => prev.map(e => e._tempId === editingRow ? payload : e))
        }
      } else {
        savedData = await updateEquipoReclutamiento(editingRow, payload)
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
      console.error("Error al guardar equipo de reclutamiento:", err)
      alert(`Error al guardar: ${err?.message || err?.error_description || JSON.stringify(err)}`)
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
        title="EQUIPO DE RECLUTAMIENTO"
        subtitle="Directorio y condiciones del equipo"
        icon={Users}
      />

      {/* KPIS INTERACTIVOS */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3 mb-6">
        <KpiCard
          title="TOTAL EQUIPO"
          value={stats.total}
          active={filterEstado === 'TODOS' && filterCargo === 'TODOS'}
          onClick={() => { setFilterEstado('TODOS'); setFilterCargo('TODOS') }}
        />
        <KpiCard
          title="ACTIVOS"
          value={stats.activos}
          color="emerald"
          active={filterEstado === 'ACTIVO' && filterCargo === 'TODOS'}
          onClick={() => { setFilterEstado('ACTIVO'); setFilterCargo('TODOS') }}
        />
        <KpiCard
          title="CESADOS"
          value={stats.cesados}
          color="rose"
          active={filterEstado === 'CESE' && filterCargo === 'TODOS'}
          onClick={() => { setFilterEstado('CESE'); setFilterCargo('TODOS') }}
        />
        <KpiCard
          title="JEFES"
          value={stats.jefes}
          color="purple"
          active={filterCargo === 'JEFE'}
          onClick={() => setFilterCargo(filterCargo === 'JEFE' ? 'TODOS' : 'JEFE')}
        />
        <KpiCard
          title="COORDINADORES"
          value={stats.coordinadores}
          color="blue"
          active={filterCargo === 'COORDINADOR'}
          onClick={() => setFilterCargo(filterCargo === 'COORDINADOR' ? 'TODOS' : 'COORDINADOR')}
        />
        <KpiCard
          title="ANALISTAS"
          value={stats.analistas}
          color="cyan"
          active={filterCargo === 'ANALISTA'}
          onClick={() => setFilterCargo(filterCargo === 'ANALISTA' ? 'TODOS' : 'ANALISTA')}
        />
        <KpiCard
          title="ASISTENTES"
          value={stats.asistentes}
          color="indigo"
          active={filterCargo === 'ASISTENTE'}
          onClick={() => setFilterCargo(filterCargo === 'ASISTENTE' ? 'TODOS' : 'ASISTENTE')}
        />
      </div>

      {/* BARRA DE HERRAMIENTAS Y FILTROS RÁPIDOS */}
      <Card className="flex flex-col gap-4 mb-6">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* Barra de búsqueda */}
          <div className="flex-1 flex items-center px-4 py-2.5 rounded-xl border transition-colors focus-within:border-[var(--accent)] focus-within:ring-2 focus-within:ring-[var(--accent)]/10" style={{ background: 'var(--input-bg)', borderColor: 'var(--input-border)' }}>
            <Search size={16} className="mr-3 text-[var(--accent)] shrink-0" />
            <input
              type="text"
              placeholder="Buscar por DNI, nombre, alias, usuario ALIX o cargo..."
              className="w-full bg-transparent border-none focus:outline-none text-sm font-medium"
              style={{ color: 'var(--text-primary)' }}
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && (
              <button onClick={() => setSearch('')} className="text-slate-400 hover:text-white text-xs px-1">
                <X size={14} />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExportCsv}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-slate-200 transition-all shadow-sm"
              title="Descargar lista actual en Excel/CSV"
            >
              <Download size={14} />
              Exportar CSV
            </button>
            <button
              onClick={handleAddNew}
              disabled={editingRow !== null}
              className="btn-primary flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold shadow-md hover:shadow-lg transition-all disabled:opacity-50 shrink-0"
            >
              <Plus size={15} />
              Añadir Miembro
            </button>
          </div>
        </div>

        {/* Píldoras de Filtro Rápido */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[var(--border-subtle)]">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mr-1">Estado:</span>
            <button
              onClick={() => setFilterEstado('TODOS')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all border ${
                filterEstado === 'TODOS'
                  ? 'bg-blue-600 text-white border-blue-500 shadow-sm'
                  : 'bg-slate-800/60 text-slate-400 border-slate-700/80 hover:text-white'
              }`}
            >
              👥 Todos ({stats.total})
            </button>
            <button
              onClick={() => setFilterEstado('ACTIVO')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all border ${
                filterEstado === 'ACTIVO'
                  ? 'bg-emerald-600 text-white border-emerald-500 shadow-sm'
                  : 'bg-slate-800/60 text-emerald-400/90 border-slate-700/80 hover:bg-emerald-500/10'
              }`}
            >
              🟢 Solo Activos ({stats.activos})
            </button>
            <button
              onClick={() => setFilterEstado('CESE')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all border ${
                filterEstado === 'CESE'
                  ? 'bg-rose-600 text-white border-rose-500 shadow-sm'
                  : 'bg-slate-800/60 text-rose-400/90 border-slate-700/80 hover:bg-rose-500/10'
              }`}
            >
              🔴 Solo Cesados ({stats.cesados})
            </button>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Cargo:</span>
            <select
              value={filterCargo}
              onChange={e => setFilterCargo(e.target.value)}
              className="px-3 py-1 rounded-lg bg-slate-800 border border-slate-700 text-xs font-semibold text-slate-200 focus:outline-none focus:border-blue-500"
            >
              <option value="TODOS">Todos los Cargos</option>
              <option value="JEFE">Jefe</option>
              <option value="COORDINADOR">Coordinador</option>
              <option value="ANALISTA">Analista</option>
              <option value="ASISTENTE">Asistente</option>
            </select>
            <span className="text-[11px] text-slate-400 font-mono ml-2">
              Mostrando {filtered.length} de {stats.total}
            </span>
          </div>
        </div>
      </Card>

      {/* TABLA */}
      <Card noPadding className="overflow-hidden mb-6">
        <div className="table-scroll overflow-x-auto">
          <table className="w-full text-left text-xs whitespace-nowrap min-w-[980px]">
            <thead>
              <tr className="bg-[var(--table-head-bg)] border-b border-[var(--border-subtle)]">
                <th className="px-5 py-3.5 font-bold text-[10px] uppercase tracking-wider text-[var(--text-muted)] w-2/5 min-w-[300px]">Colaborador</th>
                <th className="px-4 py-3.5 font-bold text-[10px] uppercase tracking-wider text-[var(--text-muted)] w-44">Cargo</th>
                <th className="px-4 py-3.5 font-bold text-[10px] uppercase tracking-wider text-center text-[var(--text-muted)] w-32">Estado</th>
                <th className="px-4 py-3.5 font-bold text-[10px] uppercase tracking-wider text-[var(--text-muted)] w-40">Fechas</th>
                <th className="px-4 py-3.5 font-bold text-[10px] uppercase tracking-wider text-right text-[var(--text-muted)] w-48">Bono & Esquema</th>
                <th className="px-4 py-3.5 font-bold text-[10px] uppercase tracking-wider text-center w-20 text-[var(--text-muted)]">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center">
                    <Loader2 className="animate-spin mx-auto text-blue-500 mb-2" size={24} />
                    <span style={{ color: 'var(--text-muted)' }}>Cargando equipo...</span>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center" style={{ color: 'var(--text-muted)' }}>
                    No se encontraron colaboradores con los filtros actuales.
                  </td>
                </tr>
              ) : filtered.map(e => {
                const isEditing = editingRow === (e._tempId || e.documento);
                const isCreating = isEditing && isNewRecord;
                const isActivo = (e.estado || 'ACTIVO').trim().toUpperCase() === 'ACTIVO';
                const nombreCompleto = [e.nombres_completos, e.apellido_paterno, e.apellido_materno].filter(Boolean).join(' ') || e.alias || '—';
                const initials = ((e.nombres_completos || '')[0] || 'R') + ((e.apellido_paterno || e.apellido_materno || '')[0] || '').toUpperCase();

                const getCargoBadge = (cargo = '') => {
                  const c = (cargo || '').toLowerCase();
                  if (c.includes('jefe')) return { label: 'Jefe R&S', cls: 'bg-purple-500/15 text-purple-300 border-purple-500/30' };
                  if (c.includes('coordinador')) return { label: 'Coordinador R&S', cls: 'bg-blue-500/15 text-blue-300 border-blue-500/30' };
                  if (c.includes('analista')) return { label: 'Analista R&S', cls: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30' };
                  return { label: 'Asistente R&S', cls: 'bg-slate-700/50 text-slate-300 border-slate-600/40' };
                };
                const cargoBadge = getCargoBadge(e.cargo);

                return (
                  <tr
                    key={e._tempId || e.documento}
                    className="border-b transition-colors hover:bg-[var(--bg-muted)] group"
                    style={{ borderColor: 'var(--border-subtle)', background: isEditing ? 'var(--bg-elevated-hover)' : 'transparent' }}
                  >
                    {/* 1. COLABORADOR */}
                    <td className="px-5 py-3">
                      {isEditing ? (
                        <div className="space-y-2 py-1 max-w-md">
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-[9px] uppercase font-bold text-slate-400">DNI / Documento</label>
                              <input
                                type="text"
                                placeholder="DNI"
                                value={editForm.documento || ''}
                                disabled={!isCreating}
                                onChange={(ev) => handleChange('documento', ev.target.value)}
                                className="w-full px-2 py-1 rounded bg-black/30 border border-slate-600 focus:border-blue-500 focus:outline-none text-xs text-white"
                              />
                            </div>
                            <div>
                              <label className="text-[9px] uppercase font-bold text-slate-400">Alias Operativo</label>
                              <input
                                type="text"
                                placeholder="Alias"
                                value={editForm.alias || ''}
                                onChange={(ev) => handleChange('alias', ev.target.value)}
                                className="w-full px-2 py-1 rounded bg-black/30 border border-slate-600 focus:border-blue-500 focus:outline-none text-xs text-white font-bold"
                              />
                            </div>
                          </div>
                          <div>
                            <label className="text-[9px] uppercase font-bold text-slate-400">Nombres</label>
                            <input
                              type="text"
                              placeholder="Nombres completos"
                              value={editForm.nombres_completos || ''}
                              onChange={(ev) => handleChange('nombres_completos', ev.target.value)}
                              className="w-full px-2 py-1 rounded bg-black/30 border border-slate-600 focus:border-blue-500 focus:outline-none text-xs text-white font-semibold"
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-[9px] uppercase font-bold text-slate-400">A. Paterno</label>
                              <input
                                type="text"
                                placeholder="Apellido Paterno"
                                value={editForm.apellido_paterno || ''}
                                onChange={(ev) => handleChange('apellido_paterno', ev.target.value)}
                                className="w-full px-2 py-1 rounded bg-black/30 border border-slate-600 focus:border-blue-500 focus:outline-none text-xs text-white"
                              />
                            </div>
                            <div>
                              <label className="text-[9px] uppercase font-bold text-slate-400">A. Materno</label>
                              <input
                                type="text"
                                placeholder="Apellido Materno"
                                value={editForm.apellido_materno || ''}
                                onChange={(ev) => handleChange('apellido_materno', ev.target.value)}
                                className="w-full px-2 py-1 rounded bg-black/30 border border-slate-600 focus:border-blue-500 focus:outline-none text-xs text-white"
                              />
                            </div>
                          </div>
                          <div>
                            <label className="text-[9px] uppercase font-bold text-slate-400">Usuario ALIX (opcional)</label>
                            <input
                              type="text"
                              placeholder="pe_usuario"
                              value={editForm.alix || ''}
                              onChange={(ev) => handleChange('alix', ev.target.value)}
                              className="w-full px-2 py-1 rounded bg-black/30 border border-slate-600 focus:border-blue-500 focus:outline-none text-xs text-slate-300 font-mono"
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 border ${
                            isActivo
                              ? 'bg-blue-600/15 text-blue-400 border-blue-500/30'
                              : 'bg-rose-500/15 text-rose-400 border-rose-500/30'
                          }`}>
                            {initials}
                          </div>
                          <div className="min-w-0">
                            <div className="font-bold text-sm text-[var(--text-primary)] truncate max-w-[320px]" title={nombreCompleto}>
                              {nombreCompleto}
                            </div>
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-[var(--text-muted)] mt-0.5">
                              <span className="font-mono text-slate-300">DNI: {e.documento || '—'}</span>
                              <span>•</span>
                              <span>Alias: <strong className="text-slate-300 font-medium">{e.alias || '—'}</strong></span>
                              {e.alix && (
                                <>
                                  <span>•</span>
                                  <span className="font-mono text-cyan-400/90 text-[10px]">@{e.alix}</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </td>

                    {/* 2. CARGO */}
                    <td className="px-4 py-3">
                      {isEditing ? (
                        <select
                          value={editForm.cargo || ''}
                          onChange={(ev) => handleChange('cargo', ev.target.value)}
                          className="w-full px-2 py-1.5 rounded bg-slate-800 border border-slate-600 focus:border-blue-500 focus:outline-none text-xs text-white"
                        >
                          <option value="Asistente de Reclutamiento y Selección">Asistente de Reclutamiento y Selección</option>
                          <option value="Analista de Reclutamiento y Selección">Analista de Reclutamiento y Selección</option>
                          <option value="Coordinador de Reclutamiento y Selección">Coordinador de Reclutamiento y Selección</option>
                          <option value="Jefe de Reclutamiento y Selección">Jefe de Reclutamiento y Selección</option>
                        </select>
                      ) : (
                        <div>
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[10.5px] font-bold border ${cargoBadge.cls}`}>
                            {cargoBadge.label}
                          </span>
                        </div>
                      )}
                    </td>

                    {/* 3. ESTADO (Acción 1 Clic) */}
                    <td className="px-4 py-3 text-center">
                      {isEditing ? (
                        <select
                          value={editForm.estado?.toUpperCase() || ''}
                          onChange={(ev) => handleChange('estado', ev.target.value)}
                          className="w-24 px-2 py-1.5 rounded bg-slate-800 border border-slate-600 focus:border-blue-500 focus:outline-none text-xs text-white font-bold"
                        >
                          <option value="ACTIVO">ACTIVO</option>
                          <option value="CESE">CESE</option>
                        </select>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setQuickModalUser(e)
                            setQuickCeseDate(e.fecha_cese || new Date().toISOString().split('T')[0])
                          }}
                          title={isActivo ? 'Hacer clic para cesar a este colaborador' : 'Hacer clic para reactivar a este colaborador'}
                          className={`group inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold border transition-all cursor-pointer shadow-xs ${
                            isActivo
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-rose-500/20 hover:text-rose-300 hover:border-rose-500/50'
                              : 'bg-rose-500/10 text-rose-400 border-rose-500/30 hover:bg-emerald-500/20 hover:text-emerald-300 hover:border-emerald-500/50'
                          }`}
                        >
                          <span className={`w-2 h-2 rounded-full ${isActivo ? 'bg-emerald-400 group-hover:bg-rose-400' : 'bg-rose-400 group-hover:bg-emerald-400'}`} />
                          <span className="group-hover:hidden">{isActivo ? 'ACTIVO' : 'CESADO'}</span>
                          <span className="hidden group-hover:inline-flex items-center gap-1">
                            {isActivo ? (
                              <>
                                <UserMinus size={13} className="text-rose-400" />
                                <span>Cesar</span>
                              </>
                            ) : (
                              <>
                                <UserCheck size={13} className="text-emerald-400" />
                                <span>Reactivar</span>
                              </>
                            )}
                          </span>
                        </button>
                      )}
                    </td>

                    {/* 4. FECHAS */}
                    <td className="px-4 py-3 text-xs">
                      {isEditing ? (
                        <div className="space-y-1.5">
                          <div>
                            <span className="text-[9px] uppercase font-bold text-slate-400 block">Ingreso</span>
                            <input
                              type="date"
                              value={editForm.fecha_ingreso || ''}
                              onChange={(ev) => handleChange('fecha_ingreso', ev.target.value)}
                              className="w-32 px-1.5 py-1 rounded bg-black/30 border border-slate-600 focus:border-blue-500 focus:outline-none text-[10px] text-white"
                            />
                          </div>
                          <div>
                            <span className="text-[9px] uppercase font-bold text-rose-400 block">Cese</span>
                            <input
                              type="date"
                              value={editForm.fecha_cese || ''}
                              onChange={(ev) => handleChange('fecha_cese', ev.target.value)}
                              className="w-32 px-1.5 py-1 rounded bg-black/30 border border-slate-600 focus:border-rose-500 focus:outline-none text-[10px] text-white"
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-0.5">
                          <div className="text-slate-300 flex items-center gap-1.5">
                            <span className="text-[10px] text-slate-500">Ingreso:</span>
                            <span className="font-mono">{e.fecha_ingreso || '—'}</span>
                          </div>
                          {e.fecha_cese && (
                            <div className="text-rose-400 font-semibold flex items-center gap-1.5">
                              <span className="text-[10px] text-rose-500/80">Cese:</span>
                              <span className="font-mono">{e.fecha_cese}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </td>

                    {/* 5. BONO & ESQUEMA DE PAGO */}
                    <td className="px-4 py-3 text-right">
                      {isEditing ? (
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-end gap-1">
                            <span className="text-xs text-slate-400 font-bold">S/</span>
                            <input
                              type="number"
                              value={editForm.bono || ''}
                              onChange={(ev) => handleChange('bono', parseFloat(ev.target.value))}
                              className="w-24 px-2 py-1 rounded bg-black/30 border border-slate-600 focus:border-emerald-500 focus:outline-none text-xs text-emerald-400 font-black text-right"
                            />
                          </div>
                          <div className="flex items-center justify-end gap-1 text-[10px]">
                            <input
                              type="number"
                              placeholder="Efec %"
                              value={editForm.pct_efectivo || ''}
                              onChange={(ev) => handleChange('pct_efectivo', parseFloat(ev.target.value))}
                              className="w-12 px-1 py-0.5 rounded bg-black/30 border border-slate-600 text-right text-cyan-300"
                            />
                            <span>% Ef</span>
                            <input
                              type="number"
                              placeholder="Sodexo %"
                              value={editForm.pct_sodexo || ''}
                              onChange={(ev) => handleChange('pct_sodexo', parseFloat(ev.target.value))}
                              className="w-12 px-1 py-0.5 rounded bg-black/30 border border-slate-600 text-right text-amber-300"
                            />
                            <span>% Sod</span>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <div className="font-mono font-black text-emerald-400 text-sm">
                            S/ {Number(e.bono || 0).toFixed(2)}
                          </div>
                          <div className="flex items-center justify-end gap-1.5 text-[10.5px] mt-0.5 font-medium">
                            <span className="text-cyan-300">{e.pct_efectivo ?? 60}% Efec</span>
                            <span className="text-slate-600">•</span>
                            <span className="text-amber-300">{e.pct_sodexo ?? 40}% Sodexo</span>
                          </div>
                        </div>
                      )}
                    </td>

                    {/* 6. ACCIONES */}
                    <td className="px-4 py-3 text-center">
                      {isEditing ? (
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={handleSave}
                            disabled={saving}
                            className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 transition-colors"
                            title="Guardar cambios"
                          >
                            {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                          </button>
                          <button
                            onClick={handleCancel}
                            disabled={saving}
                            className="p-1.5 rounded-lg bg-rose-500/20 text-rose-400 hover:bg-rose-500/30 transition-colors"
                            title="Cancelar"
                          >
                            <X size={15} />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setQuickModalUser(e)
                              setQuickCeseDate(e.fecha_cese || new Date().toISOString().split('T')[0])
                            }}
                            className={`p-1.5 rounded-lg border transition-all ${
                              isActivo
                                ? 'border-slate-700/60 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 hover:border-rose-500/30'
                                : 'border-slate-700/60 text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10 hover:border-emerald-500/30'
                            }`}
                            title={isActivo ? 'Cesar colaborador' : 'Reactivar colaborador'}
                          >
                            {isActivo ? <UserMinus size={14} /> : <UserCheck size={14} />}
                          </button>
                          <button
                            onClick={() => handleEdit(e)}
                            className="p-1.5 rounded-lg border border-slate-700/60 hover:bg-white/10 text-slate-400 hover:text-blue-400 transition-colors"
                            title="Editar toda la fila"
                          >
                            <Edit2 size={14} />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* MODAL RÁPIDO DE CESE / REACTIVACIÓN */}
      {quickModalUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl p-6 space-y-5 animate-scaleUp">
            {(() => {
              const isActivo = (quickModalUser.estado || 'ACTIVO').trim().toUpperCase() === 'ACTIVO'
              const nombreCompleto = [
                quickModalUser.nombres_completos,
                quickModalUser.apellido_paterno,
                quickModalUser.apellido_materno
              ].filter(Boolean).join(' ') || quickModalUser.alias || 'Colaborador'

              return (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className={`p-3 rounded-xl ${isActivo ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'}`}>
                        {isActivo ? <UserMinus size={22} /> : <UserCheck size={22} />}
                      </div>
                      <div>
                        <h3 className="text-base font-bold text-white">
                          {isActivo ? 'Registrar Cese de Colaborador' : 'Reactivar Colaborador'}
                        </h3>
                        <p className="text-xs text-slate-400">
                          {isActivo ? 'Actualizar estado a inactivo y registrar fecha de salida' : 'Restablecer como personal activo en operaciones'}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => setQuickModalUser(null)}
                      disabled={quickSaving}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                    >
                      <X size={18} />
                    </button>
                  </div>

                  {/* Ficha del Colaborador */}
                  <div className="p-3.5 rounded-xl bg-slate-800/80 border border-slate-700/80 space-y-1.5">
                    <div className="text-sm font-bold text-white">{nombreCompleto}</div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
                      <span>DNI: <strong className="text-slate-200">{quickModalUser.documento || '—'}</strong></span>
                      <span>•</span>
                      <span>Cargo: <strong className="text-slate-200">{quickModalUser.cargo || 'Asistente'}</strong></span>
                      {quickModalUser.alias && (
                        <>
                          <span>•</span>
                          <span>Alias: <strong className="text-slate-200">{quickModalUser.alias}</strong></span>
                        </>
                      )}
                    </div>
                  </div>

                  {isActivo ? (
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-bold text-slate-300 mb-1 flex items-center gap-1.5">
                          <Calendar size={13} className="text-rose-400" />
                          Fecha de Cese:
                        </label>
                        <input
                          type="date"
                          value={quickCeseDate}
                          onChange={e => setQuickCeseDate(e.target.value)}
                          max={new Date().toISOString().split('T')[0]}
                          className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 focus:border-rose-500 focus:outline-none text-sm text-white font-medium"
                        />
                      </div>
                      <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300 flex items-start gap-2">
                        <AlertTriangle size={15} className="shrink-0 mt-0.5 text-rose-400" />
                        <span>Al confirmar, el colaborador pasará a estado <strong>CESE</strong>. No se le dispersarán bonos en nóminas activas pero su historial de grupos permanecerá intacto para auditoría.</span>
                      </div>
                    </div>
                  ) : (
                    <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-300 flex items-start gap-2">
                      <Check size={16} className="shrink-0 mt-0.5 text-emerald-400" />
                      <span>Al confirmar, el colaborador pasará a <strong>ACTIVO</strong>, se limpiará la fecha de cese y volverá a recibir asignaciones y bonos regulares.</span>
                    </div>
                  )}

                  {/* Botones de acción */}
                  <div className="flex items-center justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setQuickModalUser(null)}
                      disabled={quickSaving}
                      className="px-4 py-2 rounded-xl text-xs font-bold text-slate-300 hover:bg-slate-800 transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={handleConfirmQuickStatus}
                      disabled={quickSaving}
                      className={`flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-bold text-white transition-all shadow-md ${
                        isActivo
                          ? 'bg-rose-600 hover:bg-rose-500 hover:shadow-rose-600/30'
                          : 'bg-emerald-600 hover:bg-emerald-500 hover:shadow-emerald-600/30'
                      }`}
                    >
                      {quickSaving ? (
                        <>
                          <Loader2 size={14} className="animate-spin" />
                          <span>Guardando...</span>
                        </>
                      ) : (
                        <>
                          {isActivo ? <UserMinus size={14} /> : <UserCheck size={14} />}
                          <span>{isActivo ? 'Confirmar Cese' : 'Confirmar Reactivación'}</span>
                        </>
                      )}
                    </button>
                  </div>
                </>
              )
            })()}
          </div>
        </div>
      )}
    </PageLayout>
  )
}

function KpiCard({ title, value, color = 'blue', active = false, onClick }) {
  const colorMap = {
    blue: 'text-blue-500',
    emerald: 'text-emerald-500',
    rose: 'text-rose-500',
    purple: 'text-purple-400',
    cyan: 'text-cyan-400',
    indigo: 'text-indigo-400'
  }
  const borderActive = {
    blue: 'border-blue-500/80 bg-blue-500/10 shadow-blue-500/10',
    emerald: 'border-emerald-500/80 bg-emerald-500/10 shadow-emerald-500/10',
    rose: 'border-rose-500/80 bg-rose-500/10 shadow-rose-500/10',
    purple: 'border-purple-500/80 bg-purple-500/10 shadow-purple-500/10',
    cyan: 'border-cyan-500/80 bg-cyan-500/10 shadow-cyan-500/10',
    indigo: 'border-indigo-500/80 bg-indigo-500/10 shadow-indigo-500/10'
  }

  return (
    <Card
      onClick={onClick}
      className={`flex flex-col justify-center transition-all cursor-pointer border ${
        active
          ? `${borderActive[color] || 'border-blue-500 bg-blue-500/10'} shadow-md ring-1 ring-white/10`
          : 'hover:border-slate-600 hover:bg-slate-800/40'
      }`}
    >
      <div className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>
        {title}
      </div>
      <div className={`text-2xl font-black ${colorMap[color] || 'text-blue-500'}`}>
        {value}
      </div>
    </Card>
  )
}
