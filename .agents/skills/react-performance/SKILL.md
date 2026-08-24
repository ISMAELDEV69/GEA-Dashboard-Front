---
name: react-performance
description: High-performance React 19 and Vite optimization patterns for high-density dashboards, table virtualization, code splitting, memoization, and responsive UI transitions.
---

# React Performance Optimization Skill — GEA Dashboard

Esta habilidad establece las reglas de oro para mantener tiempos de respuesta inmediatos (<50ms) en la navegación y renderizado de GEA Dashboard.

## 1. Code Splitting & Lazy Loading Obligatorio
- **Todas las vistas principales deben cargarse con `React.lazy()` y `Suspense`**.
- Ninguna vista que contenga librerías pesadas (como `recharts`, `@tremor/react`, `xlsx`) debe importarse de forma síncrona en el bundle principal.
- Utilizar `ViewLoadingSkeleton` para transiciones suaves que eviten saltos de layout (*Cumulative Layout Shift*).

```javascript
import { lazy, Suspense } from 'react'

const NominaCompletar = lazy(() => import('./pages/NominaCompletar'))
const AttendanceBI = lazy(() => import('./components/AttendanceBI'))
```

## 2. Prevención de Re-renderizados en Tableros Densos
- **`React.memo` para componentes de vista y filas de tabla:** Envolver componentes grandes en `React.memo` con comparadores de props cuando reciban arreglos grandes.
- **Estabilidad de funciones y objetos:** Todos los callbacks pasados como props a hijos deben estar envueltos en `useCallback`.
- **Cálculos pesados en `useMemo`:** Transformaciones de nóminas, filtros de arrays de más de 100 elementos y métricas de embudo deben estar estrictamente memoizadas.

## 3. KeepAliveView & Gestión de Estado
- En componentes que utilizan `KeepAliveView`, evitar que los efectos de segundo plano sigan corriendo cuando `isActive === false`.
- Pausar timers, peticiones de red y eventos de scroll cuando la vista no esté en foco.

## 4. Virtualización de Listas
- Para tablas de más de 100 registros (como `NominaGridEditor` o `PostulantesTable`), renderizar únicamente las filas visibles en el viewport para evitar miles de nodos DOM innecesarios.
