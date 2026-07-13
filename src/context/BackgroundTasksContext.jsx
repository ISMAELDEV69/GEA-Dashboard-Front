import { createContext, useContext, useState, useCallback } from 'react'
import { syncGoogleSheets } from '../lib/dataService'
import { PRIMARY_SHEET_ID } from '../lib/sheetSources'

const BackgroundTasksContext = createContext(null)

export function BackgroundTasksProvider({ children, onSyncComplete }) {
  const [sheetSync, setSheetSync] = useState({
    syncing: false,
    progress: null,
    result: null,
    error: null,
    selected: [PRIMARY_SHEET_ID],
  })

  const setSelectedSources = useCallback((selected) => {
    setSheetSync(s => ({ ...s, selected }))
  }, [])

  const toggleSource = useCallback((id) => {
    setSheetSync(s => ({
      ...s,
      selected: s.selected.includes(id)
        ? s.selected.filter(x => x !== id)
        : [...s.selected, id],
    }))
  }, [])

  const clearSheetSyncResult = useCallback(() => {
    setSheetSync(s => ({ ...s, result: null, error: null }))
  }, [])

  const startSheetSync = useCallback(async (sourceIds) => {
    const ids = sourceIds ?? sheetSync.selected
    if (!ids.length) {
      setSheetSync(s => ({ ...s, error: 'Selecciona al menos una hoja.' }))
      return
    }

    setSheetSync(s => ({
      ...s,
      syncing: true,
      error: null,
      result: null,
      progress: { phase: 'download', message: 'Iniciando…', current: 0, total: 0 },
    }))

    try {
      const res = await syncGoogleSheets({
        sourceIds: ids,
        onProgress: (p) => setSheetSync(s => ({ ...s, progress: p })),
      })
      setSheetSync(s => ({
        ...s,
        syncing: false,
        result: res,
        progress: { phase: 'done', message: 'Sincronización completada' },
      }))
      await onSyncComplete?.()
    } catch (err) {
      setSheetSync(s => ({
        ...s,
        syncing: false,
        error: err.message || 'Error al sincronizar',
      }))
    }
  }, [sheetSync.selected, onSyncComplete])

  return (
    <BackgroundTasksContext.Provider value={{
      sheetSync,
      startSheetSync,
      setSelectedSources,
      toggleSource,
      clearSheetSyncResult,
    }}>
      {children}
    </BackgroundTasksContext.Provider>
  )
}

export function useBackgroundTasks() {
  const ctx = useContext(BackgroundTasksContext)
  if (!ctx) throw new Error('useBackgroundTasks debe usarse dentro de BackgroundTasksProvider')
  return ctx
}
