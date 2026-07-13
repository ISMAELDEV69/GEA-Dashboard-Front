import { RefreshCw, CloudDownload, CheckCircle2, AlertCircle, ExternalLink, Loader2 } from 'lucide-react'
import { SHEET_SOURCES } from '../../lib/sheetSources'
import { useBackgroundTasks } from '../../context/BackgroundTasksContext'

const PHASE_LABELS = {
  download: 'Descargando',
  grupos: 'Grupos',
  nominas: 'Nóminas',
  done: 'Listo',
}

export default function SheetSyncPanel() {
  const { sheetSync, startSheetSync, toggleSource } = useBackgroundTasks()
  const { syncing, progress, result, error, selected } = sheetSync

  const pct = progress?.total > 0
    ? Math.round((progress.current / progress.total) * 100)
    : progress?.phase === 'done' ? 100 : progress?.phase === 'download' ? 8 : 0

  return (
    <div
      className="rounded-2xl border p-5"
      style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-elevated)' }}
    >
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-4">
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-xl bg-indigo-500/15 text-indigo-400">
            <CloudDownload size={20} />
          </div>
          <div>
            <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
              Sincronizar Google Sheets
            </h3>
            <p className="text-[11px] mt-0.5 max-w-lg" style={{ color: 'var(--text-muted)' }}>
              Descarga las hojas publicadas de nómina y asistencia, importa postulantes y registra día 0 / día 1 automáticamente.
              Puedes cambiar de apartado mientras sincroniza.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => startSheetSync(selected)}
          disabled={syncing || !selected.length}
          className="btn-primary flex items-center justify-center gap-2 text-xs py-2.5 px-5 shrink-0 disabled:opacity-50"
        >
          {syncing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          {syncing ? 'Sincronizando…' : 'Sincronizar ahora'}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-4">
        {Object.values(SHEET_SOURCES).map(src => (
          <label
            key={src.id}
            className="flex items-start gap-2 p-3 rounded-xl cursor-pointer border transition-colors"
            style={{
              borderColor: selected.includes(src.id) ? 'rgba(99,102,241,0.4)' : 'var(--border-subtle)',
              background: selected.includes(src.id) ? 'rgba(99,102,241,0.06)' : 'transparent',
            }}
          >
            <input
              type="checkbox"
              checked={selected.includes(src.id)}
              onChange={() => toggleSource(src.id)}
              disabled={syncing}
              className="mt-0.5 accent-indigo-500"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>{src.label}</span>
                <a
                  href={src.pubhtml}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-indigo-400 hover:text-indigo-300"
                  onClick={e => e.stopPropagation()}
                >
                  <ExternalLink size={12} />
                </a>
              </div>
              <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{src.description}</p>
            </div>
          </label>
        ))}
      </div>

      {syncing && progress && (
        <div className="mb-4">
          <div className="flex justify-between text-[10px] mb-1" style={{ color: 'var(--text-muted)' }}>
            <span>{PHASE_LABELS[progress.phase] || progress.phase}: {progress.label || progress.message}</span>
            <span>{pct}%</span>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-muted)' }}>
            <div
              className="h-full rounded-full bg-indigo-500 transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}

      {error && !syncing && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs mb-3">
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {result && !syncing && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs">
          <CheckCircle2 size={16} className="shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-emerald-300">Sincronización completada</p>
            <p className="mt-1 text-emerald-400/90">
              {result.nominas} nóminas · {result.asistencias} asistencias · {result.grupos} grupos nuevos
              {result.skipped > 0 && ` · ${result.skipped} duplicados omitidos`}
            </p>
            {result.errors.length > 0 && (
              <p className="mt-1 text-amber-400/90">
                {result.errors.length} advertencia(s): {result.errors.slice(0, 3).map(e => e.ref).join(', ')}
                {result.errors.length > 3 && '…'}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
