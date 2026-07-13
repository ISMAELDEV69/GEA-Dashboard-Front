import React, { useState, useMemo, useEffect } from 'react'
import { Search, Users, Loader2, Check } from 'lucide-react'
import { updateGrupoFormador, getEquipoFormacion } from '../lib/dataService'
import PageLayout from '../components/ui/PageLayout'
import PageHeader from '../components/ui/PageHeader'
import Card from '../components/ui/Card'

export default function AsignacionFormador({ grupos = [], formadores = [], onRefresh }) {
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedPeriodo, setSelectedPeriodo] = useState('')
  const [selectedSegmento, setSelectedSegmento] = useState('')
  const [selectedCampana, setSelectedCampana] = useState('')
  const [selectedSemana, setSelectedSemana] = useState('')
  
  const [savingRow, setSavingRow] = useState(null)
  const [successRow, setSuccessRow] = useState(null)
  const [equipoFormacionData, setEquipoFormacionData] = useState([])

  useEffect(() => {
    getEquipoFormacion().then(data => {
      setEquipoFormacionData(data || [])
    })
  }, [])

  // Opciones de filtro
  const periodos = useMemo(() => {
    return [...new Set(grupos.map(g => g.periodo ? String(g.periodo).trim() : null).filter(Boolean))].sort()
  }, [grupos])

  const segmentos = useMemo(() => {
    let filtered = grupos.filter(g => g.periodo)
    if (selectedPeriodo) filtered = filtered.filter(g => String(g.periodo).trim() === String(selectedPeriodo).trim())
    return [...new Set(filtered.map(g => g.segmento ? String(g.segmento).trim() : null).filter(Boolean))].sort()
  }, [grupos, selectedPeriodo])

  const campanas = useMemo(() => {
    let filtered = grupos.filter(g => g.periodo)
    if (selectedPeriodo) filtered = filtered.filter(g => String(g.periodo).trim() === String(selectedPeriodo).trim())
    if (selectedSegmento) filtered = filtered.filter(g => String(g.segmento).trim() === String(selectedSegmento).trim())
    return [...new Set(filtered.map(g => g.campana ? String(g.campana).trim() : null).filter(Boolean))].sort()
  }, [grupos, selectedPeriodo, selectedSegmento])

  const semanas = useMemo(() => {
    let filtered = grupos.filter(g => g.periodo)
    if (selectedPeriodo) filtered = filtered.filter(g => String(g.periodo).trim() === String(selectedPeriodo).trim())
    if (selectedSegmento) filtered = filtered.filter(g => String(g.segmento).trim() === String(selectedSegmento).trim())
    if (selectedCampana) filtered = filtered.filter(g => String(g.campana).trim() === String(selectedCampana).trim())
    return [...new Set(filtered.map(g => g.semana_label ? String(g.semana_label).trim() : null).filter(Boolean))].sort()
  }, [grupos, selectedPeriodo, selectedSegmento, selectedCampana])

  // Filtrar grupos para la tabla
  const filteredGrupos = useMemo(() => {
    let res = [...grupos]
    
    if (selectedPeriodo) res = res.filter(g => String(g.periodo).trim() === String(selectedPeriodo).trim())
    if (selectedSegmento) res = res.filter(g => String(g.segmento).trim() === String(selectedSegmento).trim())
    if (selectedCampana) res = res.filter(g => String(g.campana).trim() === String(selectedCampana).trim())
    if (selectedSemana) res = res.filter(g => String(g.semana_label).trim() === String(selectedSemana).trim())
    
    if (searchTerm) {
      const q = searchTerm.toLowerCase()
      res = res.filter(g => 
        (g.codigo && g.codigo.toLowerCase().includes(q)) ||
        (g.campana && g.campana.toLowerCase().includes(q)) ||
        (g.formador_nombre && g.formador_nombre.toLowerCase().includes(q))
      )
    }

    // Ordenar por periodo desc, luego codigo
    res.sort((a, b) => {
      const pA = a.periodo || ''
      const pB = b.periodo || ''
      if (pA !== pB) return pB.localeCompare(pA)
      return (a.codigo || '').localeCompare(b.codigo || '')
    })

    // Eliminar duplicados de código
    const unique = []
    const seen = new Set()
    for (const g of res) {
      if (!seen.has(g.codigo)) {
        seen.add(g.codigo)
        unique.push(g)
      }
    }
    
    return unique
  }, [grupos, selectedPeriodo, selectedSegmento, selectedCampana, selectedSemana, searchTerm])

  const formadoresActivos = useMemo(() => {
    return equipoFormacionData
      .filter(f => f.estado?.toUpperCase() === 'ACTIVO' && f.cargo_funcional?.toUpperCase() === 'FORMADOR')
      .sort((a, b) => (a.datos_completos || a.nombres_completos || '').localeCompare(b.datos_completos || b.nombres_completos || ''))
  }, [equipoFormacionData])

  const handleAssign = async (grupo_codigo, formador_documento) => {
    try {
      setSavingRow(grupo_codigo)
      await updateGrupoFormador(grupo_codigo, formador_documento || null)
      
      setSuccessRow(grupo_codigo)
      setTimeout(() => setSuccessRow(null), 2000)
      
      // Actualizar los datos globales (que refrescarán la vista)
      if (onRefresh) {
        onRefresh()
      }
    } catch (err) {
      alert("Error al asignar el formador")
    } finally {
      setSavingRow(null)
    }
  }

  const KpiCard = ({ title, value, color }) => (
    <Card className="flex flex-col justify-center">
      <div className="text-[10px] font-bold uppercase tracking-wider mb-1 text-[var(--text-muted)]">
        {title}
      </div>
      <div className={`text-2xl font-black text-${color}-500`}>
        {value}
      </div>
    </Card>
  )

  const gruposConFormador = filteredGrupos.filter(g => g.formador_documento).length

  return (
    <PageLayout className="space-y-6">
      
      {/* Header */}
      <PageHeader
        title="Asignación de Formadores"
        subtitle="Gestiona qué formador impartirá la capacitación a cada grupo planificado."
        icon={Users}
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard title="Grupos Mostrados" value={filteredGrupos.length} color="indigo" />
        <KpiCard title="Grupos con Formador" value={gruposConFormador} color="emerald" />
        <KpiCard title="Grupos sin Formador" value={filteredGrupos.length - gruposConFormador} color="rose" />
        <KpiCard title="Formadores Activos" value={formadoresActivos.length} color="blue" />
      </div>

      {/* Controles */}
      <Card className="flex flex-col md:flex-row gap-4 items-end">
        
        {/* Search */}
        <div className="w-full md:w-64">
          <label className="text-[10px] font-bold uppercase tracking-wider mb-1.5 block" style={{ color: 'var(--text-muted)' }}>Buscar Grupo</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2" size={16} style={{ color: 'var(--text-muted)' }} />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Código, Campaña..."
              className="w-full pl-9 pr-3 py-2 rounded-lg border text-sm transition-colors focus:outline-none"
              style={{
                background: 'var(--bg-panel)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-primary)'
              }}
            />
          </div>
        </div>

        {/* Filters */}
        <div className="flex-1 grid grid-cols-2 lg:grid-cols-4 gap-3 w-full">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider mb-1.5 block" style={{ color: 'var(--text-muted)' }}>Periodo</label>
            <select
              value={selectedPeriodo}
              onChange={e => setSelectedPeriodo(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border text-sm transition-colors focus:outline-none appearance-none"
              style={{ background: 'var(--bg-panel)', borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
            >
              <option value="">Todos los periodos</option>
              {periodos.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider mb-1.5 block" style={{ color: 'var(--text-muted)' }}>Semana</label>
            <select
              value={selectedSemana}
              onChange={e => setSelectedSemana(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border text-sm transition-colors focus:outline-none appearance-none"
              style={{ background: 'var(--bg-panel)', borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
            >
              <option value="">Todas las semanas</option>
              {semanas.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider mb-1.5 block" style={{ color: 'var(--text-muted)' }}>Segmento</label>
            <select
              value={selectedSegmento}
              onChange={e => setSelectedSegmento(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border text-sm transition-colors focus:outline-none appearance-none"
              style={{ background: 'var(--bg-panel)', borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
            >
              <option value="">Todos los segmentos</option>
              {segmentos.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider mb-1.5 block" style={{ color: 'var(--text-muted)' }}>Campaña</label>
            <select
              value={selectedCampana}
              onChange={e => setSelectedCampana(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border text-sm transition-colors focus:outline-none appearance-none"
              style={{ background: 'var(--bg-panel)', borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
            >
              <option value="">Todas las campañas</option>
              {campanas.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
      </Card>

      {/* Tabla */}
      <Card noPadding className="overflow-hidden">
        <div className="table-scroll overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead>
              <tr className="bg-[var(--table-head-bg)] border-b border-[var(--border-subtle)]">
                <th className="px-4 py-3 font-bold text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Periodo</th>
                <th className="px-4 py-3 font-bold text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Grupo</th>
                <th className="px-4 py-3 font-bold text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Campaña</th>
                <th className="px-4 py-3 font-bold text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Fechas (OJT / OP)</th>
                <th className="px-4 py-3 font-bold text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Formador Asignado</th>
                <th className="px-4 py-3 font-bold text-[10px] uppercase tracking-wider text-[var(--text-muted)] w-20 text-center">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {filteredGrupos.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center" style={{ color: 'var(--text-muted)' }}>
                    No se encontraron grupos con los filtros actuales.
                  </td>
                </tr>
              ) : filteredGrupos.map(g => {
                const isSaving = savingRow === g.codigo;
                const isSuccess = successRow === g.codigo;
                
                return (
                  <tr key={g.codigo} className="transition-colors hover:bg-[var(--bg-muted)] group">
                    {/* Periodo */}
                    <td className="px-4 py-3 text-xs font-semibold text-[var(--text-secondary)]">
                      {g.periodo || '—'}
                    </td>
                    
                    {/* Grupo */}
                    <td className="px-4 py-3">
                      <div className="font-mono font-bold text-xs" style={{ color: 'var(--text-primary)' }}>{g.codigo}</div>
                      <div className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{g.modalidad} - {g.semana_label}</div>
                    </td>

                    {/* Campaña */}
                    <td className="px-4 py-3">
                      <div className="font-semibold text-xs text-indigo-400">{g.campana || '—'}</div>
                      <div className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{g.segmento || '—'}</div>
                    </td>

                    {/* Fechas */}
                    <td className="px-4 py-3 text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                      <div><span className="font-bold" style={{ color: 'var(--text-muted)' }}>OJT:</span> {g.fecha_inicio_ojt || '—'}</div>
                      <div><span className="font-bold" style={{ color: 'var(--text-muted)' }}>OP:</span> {g.fecha_ingreso_op || '—'}</div>
                    </td>

                    {/* Formador */}
                    <td className="px-4 py-3">
                      <div className="relative w-full max-w-sm flex items-center gap-2">
                        <select
                          value={g.formador_documento || ''}
                          onChange={(e) => handleAssign(g.codigo, e.target.value)}
                          disabled={isSaving}
                          className={`w-full px-3 py-2 rounded-lg border text-sm transition-all focus:outline-none appearance-none ${isSaving ? 'opacity-50 cursor-not-allowed' : ''} ${isSuccess ? 'border-emerald-500/50 bg-emerald-500/5' : ''}`}
                          style={{ 
                            background: isSuccess ? 'var(--bg-elevated)' : 'var(--bg-panel)', 
                            borderColor: isSuccess ? 'rgb(16 185 129 / 0.5)' : 'var(--border-subtle)', 
                            color: 'var(--text-primary)' 
                          }}
                        >
                          <option value="">-- Sin Formador --</option>
                          {formadoresActivos
                            .filter(f => !g.segmento || (f.segmento || '').trim().toUpperCase() === (g.segmento || '').trim().toUpperCase())
                            .map(f => (
                              <option key={f.documento} value={f.documento}>
                                {f.datos_completos || f.nombres_completos}
                              </option>
                          ))}
                        </select>
                        
                        {/* Status Icon */}
                        <div className="w-6 flex-shrink-0 flex items-center justify-center">
                          {isSaving && <Loader2 className="animate-spin text-indigo-500" size={16} />}
                          {isSuccess && <Check className="text-emerald-500 animate-in zoom-in duration-300" size={18} />}
                        </div>
                      </div>
                    </td>

                    {/* Estado Grupo */}
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold border ${g.estado === 'ACTIVO' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : 'bg-slate-500/10 text-slate-400 border-slate-500/20'}`}>
                        {g.estado || '—'}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </PageLayout>
  )
}
