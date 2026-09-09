import React, { useState, useEffect, useMemo } from 'react'
import {
  fetchGruposDia1,
  upsertGrupoDia1,
  fetchAsistenciasReclutador,
  saveAsistenciasReclutador
} from '../lib/dataService'
import PageLayout from './ui/PageLayout'
import PageHeader from './ui/PageHeader'
import Card from './ui/Card'
import { Save, Download, Users, CheckCircle, ClipboardCheck, Info } from 'lucide-react'

const AsistenciaReclutadorDia1 = ({ grupos, postulantes, isReadOnly }) => {
  const [selectedSegmento, setSelectedSegmento] = useState('')
  const [selectedCampana, setSelectedCampana] = useState('')
  const [selectedGrupo, setSelectedGrupo] = useState('')
  const [fechaDia1, setFechaDia1] = useState('')
  const [asistencias, setAsistencias] = useState([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [calibrationStatus, setCalibrationStatus] = useState('PENDIENTE')

  // Obtener info del servidor cuando cambia el grupo
  useEffect(() => {
    if (!selectedGrupo) {
      setFechaDia1('')
      setAsistencias([])
      setCalibrationStatus('PENDIENTE')
      return
    }

    const loadData = async () => {
      setLoading(true)
      try {
        const configs = await fetchGruposDia1()
        const myConfig = configs.find(c => c.grupo_codigo === selectedGrupo)
        if (myConfig && myConfig.fecha_dia1) {
          setFechaDia1(myConfig.fecha_dia1)
          setCalibrationStatus(myConfig.estado_calibracion || 'PENDIENTE')
        } else {
          setFechaDia1('')
          setCalibrationStatus('PENDIENTE')
        }

        const misAsistencias = await fetchAsistenciasReclutador(selectedGrupo)
        setAsistencias(misAsistencias)
      } catch (err) {
        console.error("Error al cargar configuración del Día 1:", err)
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [selectedGrupo])

  // Filtrar postulantes activos del grupo, aplicando lógica de Día 0
  const grupoPostulantes = useMemo(() => {
    if (!selectedGrupo) return []
    return postulantes.filter(p => {
      if (p.grupo_codigo !== selectedGrupo) return false;
      
      const dia0Val = (p.dia_0 || '').toString().toUpperCase().trim()
      const statusDia1Val = (p.status_dia_1 || '').toString().toUpperCase().trim()
      const asistioD0 = dia0Val === 'ASISTIO'
      const agregadoD1 = statusDia1Val.includes('AGREGADO') || statusDia1Val.includes('RECUPERADO') || statusDia1Val.includes('OBSERVAD')
      const dia1Val = (p.dia_1 || '').toString().toUpperCase().trim()
      const asistioD1 = dia1Val === 'ASISTIO' || dia1Val === 'A' || dia1Val === 'SI'
      
      if (!dia0Val && !statusDia1Val) return true
      if (asistioD0 || agregadoD1 || asistioD1) return true
      
      return false
    })
  }, [postulantes, selectedGrupo])

  // Lógica de Filtros en Cascada
  const segmentosUnicos = useMemo(() => {
    return [...new Set(grupos.map(g => g.segmento).filter(Boolean))].sort()
  }, [grupos])

  const campanasFiltradas = useMemo(() => {
    let filtered = grupos
    if (selectedSegmento) {
      filtered = filtered.filter(g => g.segmento === selectedSegmento)
    }
    return [...new Set(filtered.map(g => g.campana).filter(Boolean))].sort()
  }, [grupos, selectedSegmento])

  const gruposFiltrados = useMemo(() => {
    let filtered = grupos
    if (selectedSegmento) {
      filtered = filtered.filter(g => g.segmento === selectedSegmento)
    }
    if (selectedCampana) {
      filtered = filtered.filter(g => g.campana === selectedCampana)
    }
    return [...new Set(filtered.map(g => g.codigo).filter(Boolean))].sort()
  }, [grupos, selectedSegmento, selectedCampana])

  // Reset cascade
  useEffect(() => {
    setSelectedCampana('')
    setSelectedGrupo('')
  }, [selectedSegmento])

  useEffect(() => {
    setSelectedGrupo('')
  }, [selectedCampana])

  // Obtener Periodo (ej. 202606) basado en la fecha seleccionada o la actual
  const currentPeriodo = useMemo(() => {
    const d = fechaDia1 ? new Date(fechaDia1) : new Date()
    const yy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    return `${yy}${mm}`
  }, [fechaDia1])

  // Preparar lista combinada
  const list = useMemo(() => {
    return grupoPostulantes.map(p => {
      const exist = asistencias.find(a => a.postulante_documento === p.documento)
      return {
        ...p,
        sigla_inicial: exist?.sigla_inicial || 'A',
        sigla_final: exist?.sigla_final || 'A',
        motivo_baja: exist?.motivo_baja || ''
      }
    }).sort((a, b) => a.apellido_paterno.localeCompare(b.apellido_paterno))
  }, [grupoPostulantes, asistencias])

  const [localList, setLocalList] = useState([])

  useEffect(() => {
    setLocalList(list)
  }, [list])

  // Totales para tarjetas
  const totalNomina = grupoPostulantes.length
  const totalAsistenciaInicial = localList.filter(l => l.sigla_inicial === 'A').length
  const totalAsistenciaFinal = localList.filter(l => l.sigla_final === 'A').length

  const handleChangeSigla = (doc, type, value) => {
    if (isReadOnly) return
    setLocalList(prev => prev.map(item => {
      if (item.documento !== doc) return item
      const updates = { [type]: value }
      if (type === 'sigla_final' && value !== 'B' && item.sigla_inicial !== 'B') {
        updates.motivo_baja = ''
      }
      return { ...item, ...updates }
    }))
  }

  const handleSave = async () => {
    if (!selectedGrupo) return alert('Selecciona un grupo.')
    if (!fechaDia1) return alert('Debes definir la Fecha del Día 1.')
    
    setSaving(true)
    try {
      await upsertGrupoDia1(selectedGrupo, selectedCampana, fechaDia1)
      const nuevoEstado = await saveAsistenciasReclutador(selectedGrupo, selectedCampana, localList)
      setCalibrationStatus(nuevoEstado || 'PENDIENTE')
      
      // Recargar asistencias para desbloquear Sigla Final si es el primer guardado
      const misAsistencias = await fetchAsistenciasReclutador(selectedGrupo, selectedCampana)
      setAsistencias(misAsistencias)
      
      alert('¡Asistencia guardada con éxito!')
    } catch (err) {
      alert("Error al guardar: " + err.message)
    } finally {
      setSaving(false)
    }
  }

  const hasSavedInicial = asistencias.length > 0;

  const handleDownloadExcel = () => {
    alert("Función de descarga en desarrollo.");
  }

  return (
    <PageLayout className="space-y-6">
      {/* BLOQUE 1 - HEADER */}
      <PageHeader 
        title="Lista de Asistentes Día 1" 
        subtitle="Registro de asistencia inicial y final de los grupos asignados"
      >
        <div className="flex flex-wrap items-center gap-4">
          <button 
            onClick={handleSave}
            disabled={saving || isReadOnly}
            className="flex items-center gap-2 bg-[var(--accent)] text-white px-5 py-2.5 rounded-full font-bold hover:bg-[var(--accent-hover)] transition-all disabled:opacity-50 shadow-md active:scale-95"
          >
            <Save size={18} />
            {saving ? 'GUARDANDO...' : 'GUARDAR'}
          </button>
          
          <div className="border border-[var(--border-subtle)] p-2.5 rounded-xl bg-[var(--bg-surface)] shadow-sm">
            <div className="text-[var(--text-muted)] uppercase text-[10px] font-bold mb-1.5 flex items-center gap-1">
              <Info size={12}/> Leyenda de Siglas
            </div>
            <div className="flex gap-2">
              <span className="bg-emerald-500 text-white min-w-[28px] h-[22px] rounded-md text-[11px] font-bold flex items-center justify-center">A</span>
              <span className="bg-teal-500 text-white min-w-[28px] h-[22px] rounded-md text-[11px] font-bold flex items-center justify-center">I-OP</span>
              <span className="bg-red-500 text-white min-w-[28px] h-[22px] rounded-md text-[11px] font-bold flex items-center justify-center">FI</span>
              <span className="bg-amber-500 text-white min-w-[28px] h-[22px] rounded-md text-[11px] font-bold flex items-center justify-center">FJ</span>
              <span className="bg-stone-500 text-white min-w-[28px] h-[22px] rounded-md text-[11px] font-bold flex items-center justify-center">B</span>
            </div>
          </div>
        </div>
      </PageHeader>

      {/* BLOQUE 2 - TARJETAS DE RESUMEN */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Tarjeta 1 */}
        <Card className="flex items-center gap-4 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-[var(--accent)] opacity-5 rounded-bl-full transform group-hover:scale-110 transition-transform duration-500"></div>
          <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 text-indigo-600 flex items-center justify-center">
            <Users size={24} />
          </div>
          <div className="flex flex-col z-10">
            <span className="text-[var(--text-muted)] text-[10px] font-bold uppercase tracking-wider">EN NÓMINA</span>
            <span className="text-[var(--text-primary)] text-2xl font-black">{totalNomina}</span>
          </div>
        </Card>
        {/* Tarjeta 2 */}
        <Card className="flex items-center gap-4 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500 opacity-5 rounded-bl-full transform group-hover:scale-110 transition-transform duration-500"></div>
          <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-600 flex items-center justify-center">
            <ClipboardCheck size={24} />
          </div>
          <div className="flex flex-col z-10">
            <span className="text-[var(--text-muted)] text-[10px] font-bold uppercase tracking-wider">ASISTENCIA INICIAL</span>
            <span className="text-[var(--text-primary)] text-2xl font-black">{totalAsistenciaInicial}</span>
          </div>
        </Card>
        {/* Tarjeta 3 */}
        <Card className="flex items-center gap-4 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500 opacity-5 rounded-bl-full transform group-hover:scale-110 transition-transform duration-500"></div>
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
            <CheckCircle size={24} />
          </div>
          <div className="flex flex-col z-10">
            <span className="text-[var(--text-muted)] text-[10px] font-bold uppercase tracking-wider">ASISTENCIA FINAL</span>
            <span className="text-[var(--text-primary)] text-2xl font-black">{totalAsistenciaFinal}</span>
          </div>
        </Card>
      </div>

      {/* BLOQUE 3 - SECCIÓN DE FILTROS */}
      <Card>
        <div className="flex flex-wrap items-center gap-3 mb-6 pb-4 border-b border-[var(--border-subtle)]">
          <span className="bg-[var(--accent)] text-white px-3 py-1 rounded-full font-bold text-[10px] uppercase tracking-wider">PERIODO</span>
          <div className="text-[var(--accent)] border-2 border-[var(--accent)] rounded-lg px-3 py-1 font-bold text-xs bg-[var(--bg-surface)]">
            {currentPeriodo}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* SEGMENTO */}
          <div className="flex flex-col">
            <label className="text-[10px] font-bold text-[var(--text-secondary)] uppercase mb-1.5 ml-1">Segmento</label>
            <select 
              className="form-input bg-[var(--input-bg)] border-[var(--input-border)] text-[var(--text-primary)] rounded-xl px-3 py-2.5 text-sm"
              value={selectedSegmento}
              onChange={(e) => setSelectedSegmento(e.target.value)}
            >
              <option value="">-- Todos --</option>
              {segmentosUnicos.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          {/* CAMPAÑA */}
          <div className="flex flex-col">
            <label className="text-[10px] font-bold text-[var(--text-secondary)] uppercase mb-1.5 ml-1">Campaña</label>
            <select 
              className="form-input bg-[var(--input-bg)] border-[var(--input-border)] text-[var(--text-primary)] rounded-xl px-3 py-2.5 text-sm"
              value={selectedCampana}
              onChange={(e) => setSelectedCampana(e.target.value)}
            >
              <option value="">-- Todas --</option>
              {campanasFiltradas.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          {/* GRUPO */}
          <div className="flex flex-col">
            <label className="text-[10px] font-bold text-[var(--text-secondary)] uppercase mb-1.5 ml-1">Grupo</label>
            <select 
              className="form-input bg-[var(--input-bg)] border-[var(--input-border)] text-[var(--text-primary)] rounded-xl px-3 py-2.5 text-sm"
              value={selectedGrupo}
              onChange={(e) => setSelectedGrupo(e.target.value)}
            >
              <option value="">-- Selecciona --</option>
              {gruposFiltrados.map(g => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </div>
          {/* FECHA DIA 1 */}
          <div className="flex flex-col">
            <label className="text-[10px] font-bold text-[var(--text-secondary)] uppercase mb-1.5 ml-1 flex items-center gap-1">Fecha Dia 1 <span className="text-[8px] text-[var(--text-muted)] normal-case italic">*Click para editar</span></label>
            <input 
              type="text"
              onFocus={(e) => (e.target.type = "date")}
              onBlur={(e) => {
                if (!e.target.value) e.target.type = "text";
              }}
              placeholder="dd/mm/aaaa"
              className="form-input bg-[var(--input-bg)] border-[var(--input-border)] text-[var(--text-primary)] rounded-xl px-3 py-2.5 text-sm disabled:opacity-50"
              value={fechaDia1}
              onChange={(e) => setFechaDia1(e.target.value)}
              disabled={!selectedGrupo || isReadOnly}
            />
          </div>
        </div>
      </Card>

      {/* BLOQUE 4 - TABLA DE REGISTROS */}
      {/* BLOQUE 4 - TABLA DE REGISTROS */}
      {selectedGrupo && (
        <Card noPadding className="flex flex-col">
          <div className="flex justify-between items-center p-4 border-b border-[var(--border-subtle)] bg-[var(--bg-muted)]">
            <h3 className="text-[var(--text-primary)] text-sm font-bold uppercase tracking-wider flex items-center gap-2">
              <ClipboardCheck size={18} className="text-[var(--accent)]" /> Registro de Asistencia
            </h3>
            <div className="flex items-center gap-4">
              <div className="text-xs font-bold text-[var(--text-secondary)] hidden md:flex items-center gap-2">
                Calibración: 
                <span className={`px-2 py-0.5 rounded-full text-[10px] ${calibrationStatus === 'CALIBRADO' ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400' : 'bg-amber-500/20 text-amber-600 dark:text-amber-400'}`}>
                  {calibrationStatus}
                </span>
              </div>
              <button 
                onClick={handleDownloadExcel}
                className="flex items-center gap-2 bg-emerald-600 text-white px-3 py-1.5 rounded-lg font-bold text-xs hover:bg-emerald-700 transition-colors"
              >
                <Download size={14} />
                EXCEL
              </button>
            </div>
          </div>

          <div className="w-full overflow-x-auto table-scroll">
            <table className="w-full border-collapse text-xs">
              <thead className="bg-[var(--table-head-bg)] text-[var(--text-secondary)] font-bold uppercase tracking-wider text-left border-b border-[var(--border-subtle)]">
                <tr>
                  <th className="p-3 border-r border-[var(--border-subtle)] whitespace-nowrap">DOCUMENTO</th>
                  <th className="p-3 border-r border-[var(--border-subtle)]">APELLIDO PATERNO</th>
                  <th className="p-3 border-r border-[var(--border-subtle)]">APELLIDO MATERNO</th>
                  <th className="p-3 border-r border-[var(--border-subtle)]">NOMBRES</th>
                  <th className="p-3 border-r border-[var(--border-subtle)]">CELULAR</th>
                  <th className="p-3 border-r border-[var(--border-subtle)]">FECHA DÍA 1</th>
                  <th className="p-3 border-r border-[var(--border-subtle)]">TIPO RECLUTADO</th>
                  <th className="p-3 border-r border-[var(--border-subtle)] text-center">ESTADO</th>
                  <th className="p-3 border-r border-[var(--border-subtle)] text-center">SIGLA INIC.</th>
                  <th className="p-3 text-center">SIGLA FIN.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {localList.length === 0 ? (
                  <tr>
                    <td colSpan="10" className="p-8 text-center text-[var(--text-muted)] font-medium">
                      No se encontraron personas registradas en esta nómina.
                    </td>
                  </tr>
                ) : (
                  localList.map((item, idx) => (
                    <tr key={item.documento} className="hover:bg-[var(--bg-muted)] transition-colors">
                      <td className="p-2 border-r border-[var(--border-subtle)] font-mono text-[var(--text-secondary)]">{item.documento}</td>
                      <td className="p-2 border-r border-[var(--border-subtle)] text-[var(--text-primary)]">{item.apellido_paterno}</td>
                      <td className="p-2 border-r border-[var(--border-subtle)] text-[var(--text-primary)]">{item.apellido_materno}</td>
                      <td className="p-2 border-r border-[var(--border-subtle)] text-[var(--text-primary)] font-semibold">{item.nombres}</td>
                      <td className="p-2 border-r border-[var(--border-subtle)] text-[var(--text-secondary)] font-mono">{item.celular}</td>
                      <td className="p-2 border-r border-[var(--border-subtle)] text-[var(--text-secondary)]">{fechaDia1 ? new Date(fechaDia1).toLocaleDateString('es-PE') : ''}</td>
                      <td className="p-2 border-r border-[var(--border-subtle)] text-[var(--text-primary)] font-medium">{(item.status_dia_1 || '').toString().toUpperCase().trim() || 'APTO'}</td>
                      <td className="p-2 border-r border-[var(--border-subtle)] text-center">
                        {item.sigla_final === 'B' || item.sigla_inicial === 'B' ? (
                          <span className="bg-red-500/20 text-red-600 dark:text-red-400 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase">BAJA</span>
                        ) : (
                          <span className="bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase">ACTIVO</span>
                        )}
                      </td>
                      
                      {/* SIGLA INICIAL */}
                      <td className="p-2 border-r border-[var(--border-subtle)] text-center">
                        <select
                          value={item.sigla_inicial}
                          onChange={(e) => handleChangeSigla(item.documento, 'sigla_inicial', e.target.value)}
                          disabled={isReadOnly}
                          className={`min-w-[60px] h-7 outline-none border-none rounded-md text-[11px] font-bold text-white shadow-sm mx-auto text-center cursor-pointer appearance-none px-2
                            ${item.sigla_inicial === 'A' ? 'bg-emerald-500' :
                              item.sigla_inicial === 'F' ? 'bg-red-500' :
                              'bg-stone-500'}`}
                        >
                          <option value="A" className="text-black bg-white">A</option>
                          <option value="F" className="text-black bg-white">F</option>
                        </select>
                      </td>

                      {/* SIGLA FINAL */}
                      <td className="p-2 text-center">
                        <select
                          value={item.sigla_final}
                          onChange={(e) => handleChangeSigla(item.documento, 'sigla_final', e.target.value)}
                          disabled={isReadOnly || !hasSavedInicial}
                          className={`min-w-[60px] h-7 outline-none border-none rounded-md text-[11px] font-bold text-white shadow-sm mx-auto text-center cursor-pointer appearance-none px-2
                            ${(isReadOnly || !hasSavedInicial) ? 'opacity-50 cursor-not-allowed' : ''}
                            ${item.sigla_final === 'A' ? 'bg-emerald-500' :
                              item.sigla_final === 'F' ? 'bg-red-500' :
                              'bg-stone-500'}`}
                        >
                          <option value="A" className="text-black bg-white">A</option>
                          <option value="F" className="text-black bg-white">F</option>
                        </select>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="flex justify-between items-center p-3 text-[11px] text-[var(--text-muted)] border-t border-[var(--border-subtle)] bg-[var(--bg-surface)] rounded-b-xl">
            <div>Mostrando {localList.length} registros</div>
            <div>GEA PERÚ © 2026 · Sistema de Capacitación</div>
          </div>
        </Card>
      )}
    </PageLayout>
  )
}

export default AsistenciaReclutadorDia1
