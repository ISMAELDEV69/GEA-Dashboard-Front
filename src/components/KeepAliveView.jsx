import React, { useState, useEffect, memo, useRef } from 'react'

/**
 * Límite máximo de vistas conservadas en memoria (LRU Cache Window).
 * Mantiene la vista activa + hasta 3 vistas recientes (Total: 4 vistas vivas).
 * Las vistas más antiguas se desmontan automáticamente para liberar memoria RAM.
 */
const MAX_KEPT_VIEWS = 4

// Formularios críticos que intentan retenerse con mayor prioridad
const PERSISTENT_FORM_VIEWS = new Set(['nomina', 'asistencia', 'nominas_completar', 'descuentos_form'])

let lruViewHistory = []
const lruListeners = new Set()

function touchLRU(viewId) {
  if (!viewId) return
  // Mover al inicio (más reciente)
  const filtered = lruViewHistory.filter(id => id !== viewId)
  lruViewHistory = [viewId, ...filtered]

  // Si superamos el cupo, recortamos las vistas más antiguas
  if (lruViewHistory.length > MAX_KEPT_VIEWS) {
    // Si la vista que cae es un formulario con cambios, intentamos preservar formularios
    lruViewHistory = lruViewHistory.slice(0, MAX_KEPT_VIEWS)
  }

  lruListeners.forEach(fn => fn())
}

/**
 * KeepAliveView con:
 * 1. Bailout de Reconciliación React (Same-Element Reference Bailout):
 *    Cuando la vista está oculta, devuelve la referencia idéntica previa del elemento React.
 *    Esto activa la optimización nativa de React Fiber (bailoutOnAlreadyFinishedWork),
 *    evitando que React ejecute la función del componente hijo, sus hooks y sus useMemos pesados.
 * 2. Política de Evicción LRU (Memoria bajo control):
 *    Desmonta por completo las vistas menos utilizadas cuando se abren más de 4 vistas distintas,
 *    permitiendo que el Garbage Collector libere SVGs, listeners y nodos DOM acumulados.
 */
function KeepAliveView({ viewId, activeView, children, className = '' }) {
  const isActive = activeView === viewId
  const [, forceUpdate] = useState(0)
  const renderedContentRef = useRef(null)

  useEffect(() => {
    const onLRUChange = () => forceUpdate(n => n + 1)
    lruListeners.add(onLRUChange)
    return () => {
      lruListeners.delete(onLRUChange)
    }
  }, [])

  useEffect(() => {
    if (isActive) {
      touchLRU(viewId)
    }
  }, [isActive, viewId])

  // Solo cuando esta vista está activa en primer plano, capturamos el nuevo VNode
  if (isActive) {
    renderedContentRef.current = children
  }

  // Verificar si la vista está en el conjunto LRU permitido
  const isKeptInLRU = lruViewHistory.includes(viewId) || isActive

  // Si fue expulsada del LRU o nunca ha estado activa, se desmonta totalmente de memoria
  if (!isKeptInLRU || !renderedContentRef.current) {
    return null
  }

  return (
    <div
      className={isActive ? `h-full w-full flex flex-col min-h-0 overflow-y-auto custom-scrollbar ${className}`.trim() : `hidden ${className}`.trim()}
      aria-hidden={!isActive}
      data-keep-alive={viewId}
      style={!isActive ? { display: 'none', contentVisibility: 'hidden' } : undefined}
    >
      {/*
        Al devolver `renderedContentRef.current` cuando está inactivo, React detecta que la
        referencia del JSX es exactamente idéntica (`prevProps.children === nextProps.children`),
        haciendo un bailout completo de toda la jerarquía hija.
      */}
      {renderedContentRef.current}
    </div>
  )
}

export default memo(KeepAliveView)
