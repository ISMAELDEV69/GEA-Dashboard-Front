import { useState, useMemo } from 'react'
import { History, Search, ArrowRight, Eye, ShieldCheck } from 'lucide-react'
import Card from './ui/Card'

export default function AuditLogs({ logs = [] }) {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedTable, setSelectedTable] = useState('ALL')
  const [selectedLogId, setSelectedLogId] = useState(null)

  // Filter logs based on search and table filter
  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      const matchesSearch =
        log.id_registro.includes(searchQuery) ||
        (log.usuario_email && log.usuario_email.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (log.tabla_afectada && log.tabla_afectada.toLowerCase().includes(searchQuery.toLowerCase()))
      
      const matchesTable = selectedTable === 'ALL' || log.tabla_afectada === selectedTable
      return matchesSearch && matchesTable
    })
  }, [logs, searchQuery, selectedTable])

  const selectedLog = logs.find(l => l.id === selectedLogId)

  // Render pretty JSON values
  const renderJsonValue = (obj) => {
    if (!obj) return <span className="text-slate-500 italic">null</span>
    return (
      <pre className="text-xs bg-slate-950 dark:bg-slate-950 p-4 rounded-xl text-indigo-300 overflow-x-auto border border-slate-800 font-mono leading-relaxed">
        {JSON.stringify(obj, null, 2)}
      </pre>
    )
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-fadeIn">
      {/* Table log list */}
      <Card className="lg:col-span-2 space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex items-center space-x-2 text-[var(--accent)]">
            <History size={20} />
            <h3 className="font-bold text-[var(--text-primary)]">Bitácora de Auditoría</h3>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
            <div className="relative flex-grow sm:w-64">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" size={16} />
              <input
                type="text"
                placeholder="Buscar por DNI, correo..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="form-input w-full pl-10 pr-4 py-2 text-xs"
              />
            </div>
            <select
              value={selectedTable}
              onChange={(e) => setSelectedTable(e.target.value)}
              className="form-input px-3 py-2 text-xs"
            >
              <option value="ALL">Todas las Tablas</option>
              <option value="postulantes">postulantes</option>
              <option value="asistencias_capacitacion">asistencias</option>
              <option value="evaluaciones_capacitacion">evaluaciones</option>
            </select>
          </div>
        </div>

        {/* Logs Table */}
        <div className="table-scroll overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-[var(--table-head-bg)] text-[var(--text-muted)] text-xs uppercase tracking-wider border-b border-[var(--border-subtle)]">
              <tr>
                <th className="px-4 py-3 font-bold">Fecha</th>
                <th className="px-4 py-3 font-bold">Usuario</th>
                <th className="px-4 py-3 font-bold">Tabla</th>
                <th className="px-4 py-3 font-bold">Operación</th>
                <th className="px-4 py-3 font-bold text-right">Detalle</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)] text-xs">
              {filteredLogs.length > 0 ? (
                filteredLogs.map((log) => (
                  <tr
                    key={log.id}
                    onClick={() => setSelectedLogId(log.id)}
                    className={`cursor-pointer hover:bg-[var(--bg-muted)] transition-colors ${
                      selectedLogId === log.id ? 'bg-[var(--accent)]/5' : ''
                    }`}
                  >
                    <td className="px-4 py-3.5 text-[var(--text-muted)]">
                      {new Date(log.fecha).toLocaleString()}
                    </td>
                    <td className="px-4 py-3.5 font-medium text-[var(--text-primary)]">{log.usuario_email || 'sistema'}</td>
                    <td className="px-4 py-3.5">
                      <span className="font-mono bg-[var(--bg-muted)] text-[var(--text-secondary)] px-2 py-0.5 rounded-md border border-[var(--border-subtle)]">
                        {log.tabla_afectada}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <span
                        className={`font-semibold px-2 py-0.5 rounded-md ${
                          log.operacion === 'INSERT'
                            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                            : log.operacion === 'UPDATE'
                            ? 'bg-amber-500/10 text-amber-500 dark:text-amber-400'
                            : 'bg-rose-500/10 text-rose-500 dark:text-rose-400'
                        }`}
                      >
                        {log.operacion}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-right text-[var(--accent)] group-hover:translate-x-1 transition-transform">
                      <div className="flex items-center justify-end space-x-1">
                        <Eye size={12} />
                        <span>Ver</span>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="5" className="px-4 py-12 text-center text-[var(--text-muted)]">
                    No se encontraron registros de auditoría que coincidan con la búsqueda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Inspect card panel */}
      <Card className="space-y-6">
        <h4 className="text-lg font-bold text-[var(--text-primary)] flex items-center">
          <ShieldCheck size={18} className="mr-2 text-[var(--accent)]" /> Inspeccionar Cambio
        </h4>

        {selectedLog ? (
          <div className="space-y-6 animate-fadeIn text-sm">
            <div className="bg-[var(--bg-muted)] p-4 rounded-xl border border-[var(--border-subtle)] space-y-2">
              <p className="text-xs text-[var(--text-muted)]">
                Operación:{' '}
                <span className="font-bold text-[var(--text-primary)]">{selectedLog.operacion}</span>
              </p>
              <p className="text-xs text-[var(--text-muted)]">
                Tabla Afectada:{' '}
                <span className="font-mono text-[var(--text-primary)]">{selectedLog.tabla_afectada}</span>
              </p>
              <p className="text-xs text-[var(--text-muted)]">
                ID Registro:{' '}
                <span className="font-mono font-semibold text-[var(--text-primary)]">{selectedLog.id_registro}</span>
              </p>
              <p className="text-xs text-[var(--text-muted)]">
                Realizado por:{' '}
                <span className="font-semibold text-[var(--text-primary)]">{selectedLog.usuario_email}</span>
              </p>
              <p className="text-xs text-[var(--text-muted)]">
                Fecha:{' '}
                <span className="text-[var(--text-primary)]">{new Date(selectedLog.fecha).toLocaleString()}</span>
              </p>
            </div>

            {selectedLog.operacion === 'INSERT' ? (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">Valores Insertados:</p>
                {renderJsonValue(selectedLog.valores_nuevos)}
              </div>
            ) : selectedLog.operacion === 'DELETE' ? (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-rose-500 dark:text-rose-400">Valores Eliminados:</p>
                {renderJsonValue(selectedLog.valores_anteriores)}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-[var(--text-muted)]">Estado Anterior:</p>
                  {renderJsonValue(selectedLog.valores_anteriores)}
                </div>
                <div className="flex justify-center text-[var(--text-muted)]">
                  <ArrowRight size={16} />
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-[var(--accent)]">Estado Nuevo:</p>
                  {renderJsonValue(selectedLog.valores_nuevos)}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-64 text-center text-[var(--text-muted)]">
            <History size={40} className="stroke-1 mb-2 text-[var(--text-muted)] opacity-50" />
            <p className="text-sm">Selecciona una fila del historial para auditar los detalles antes/después del cambio.</p>
          </div>
        )}
      </Card>
    </div>
  )
}
