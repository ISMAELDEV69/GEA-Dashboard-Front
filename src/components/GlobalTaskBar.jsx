import { Loader2, CheckCircle2, AlertCircle, CloudDownload, X } from 'lucide-react'
import { useBackgroundTasks } from '../context/BackgroundTasksContext'

const PHASE_LABELS = {
  download: 'Descargando',
  grupos: 'Grupos',
  nominas: 'Nóminas',
  done: 'Listo',
}

export default function GlobalTaskBar() {
  const { sheetSync, clearSheetSyncResult } = useBackgroundTasks()
  const { syncing, progress, result, error } = sheetSync

  const visible = syncing || result || error
  if (!visible) return null

  const pct = progress?.total > 0
    ? Math.round((progress.current / progress.total) * 100)
    : progress?.phase === 'done' ? 100 : syncing ? 8 : 0

  return (
    <div
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[100] w-[min(520px,calc(100vw-2rem))] rounded-2xl border shadow-2xl animate-fadeIn"
      style={{
        borderColor: 'var(--border-subtle)',
        background: 'var(--bg-elevated)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
      }}
      role="status"
      aria-live="polite"
    >
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-xl bg-indigo-500/15 text-indigo-400 shrink-0">
            {syncing ? <Loader2 size={18} className="animate-spin" /> : error ? <AlertCircle size={18} /> : <CheckCircle2 size={18} className="text-emerald-400" />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-bold flex items-center gap-1.5" style={{ color: 'var(--text-primary)' }}>
                <CloudDownload size={12} className="text-indigo-400" />
                {syncing ? 'Sincronizando Google Sheets…' : error ? 'Error en sincronización' : 'Sincronización completada'}
              </p>
              {!syncing && (result || error) && (
                <button
                  type="button"
                  onClick={clearSheetSyncResult}
                  className="p-1 rounded-lg opacity-60 hover:opacity-100"
                  aria-label="Cerrar"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {syncing && progress && (
              <>
                <p className="text-[10px] mt-1 truncate" style={{ color: 'var(--text-muted)' }}>
                  {PHASE_LABELS[progress.phase] || progress.phase}: {progress.label || progress.message}
                </p>
                <div className="mt-2 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-muted)' }}>
                  <div className="h-full rounded-full bg-indigo-500 transition-all duration-300" style={{ width: `${pct}%` }} />
                </div>
                <p className="text-[9px] mt-1" style={{ color: 'var(--text-muted)' }}>
                  Puedes cambiar de apartado — el proceso continúa en segundo plano.
                </p>
              </>
            )}

            {error && !syncing && (
              <p className="text-[11px] mt-1 text-red-400">{error}</p>
            )}

            {result && !syncing && !error && (
              <p className="text-[11px] mt-1 text-emerald-400/90">
                {result.nominas} nóminas · {result.asistencias} asistencias · {result.grupos} grupos nuevos
                {result.skipped > 0 && ` · ${result.skipped} omitidos`}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
