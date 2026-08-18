import React, { useState, useEffect, memo } from 'react'

/**
 * Mantiene el componente montado al cambiar de apartado (solo oculta con CSS).
 * Preserva estado de formularios, cargas y pasos en progreso sin re-renderizados innecesarios.
 */
function KeepAliveView({ viewId, activeView, children, className = '' }) {
  const [everActive, setEverActive] = useState(activeView === viewId)

  useEffect(() => {
    if (activeView === viewId) setEverActive(true)
  }, [activeView, viewId])

  if (!everActive) return null

  const isActive = activeView === viewId

  return (
    <div
      className={isActive ? `h-full w-full flex flex-col min-h-0 overflow-y-auto custom-scrollbar ${className}`.trim() : `hidden ${className}`.trim()}
      aria-hidden={!isActive}
      data-keep-alive={viewId}
      style={!isActive ? { contentVisibility: 'hidden' } : undefined}
    >
      {children}
    </div>
  )
}

export default memo(KeepAliveView)
