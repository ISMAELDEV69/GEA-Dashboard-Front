import { useState, useEffect } from 'react'

/**
 * Mantiene el componente montado al cambiar de apartado (solo oculta con CSS).
 * Preserva estado de formularios, cargas y pasos en progreso.
 */
export default function KeepAliveView({ viewId, activeView, children, className = '' }) {
  const [everActive, setEverActive] = useState(activeView === viewId)

  useEffect(() => {
    if (activeView === viewId) setEverActive(true)
  }, [activeView, viewId])

  if (!everActive) return null

  const isActive = activeView === viewId

  return (
    <div
      className={isActive ? className : `hidden ${className}`.trim()}
      aria-hidden={!isActive}
      data-keep-alive={viewId}
    >
      {children}
    </div>
  )
}
