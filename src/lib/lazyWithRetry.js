import { lazy } from 'react'

/**
 * lazyWithRetry
 * Envuelve React.lazy para detectar automáticamente cuando un chunk de Vite
 * ha cambiado de hash debido a un nuevo despliegue en producción (Netlify).
 * En lugar de romper la app con "Failed to fetch dynamically imported module",
 * realiza una recarga automática limpia para obtener la versión más reciente.
 */
export function lazyWithRetry(componentImport) {
  return lazy(async () => {
    const pageHasBeenForceRefreshed = window.sessionStorage.getItem('gea-page-force-refreshed')

    try {
      const component = await componentImport()
      window.sessionStorage.removeItem('gea-page-force-refreshed')
      return component
    } catch (error) {
      console.warn('[lazyWithRetry] Error cargando chunk dinámico:', error)
      const isChunkError = 
        error?.message?.includes('Failed to fetch dynamically imported module') ||
        error?.message?.includes('Loading chunk') ||
        error?.message?.includes('Strict MIME type checking')

      if (isChunkError && !pageHasBeenForceRefreshed) {
        window.sessionStorage.setItem('gea-page-force-refreshed', 'true')
        window.location.reload()
        return { default: () => null }
      }

      throw error
    }
  })
}
