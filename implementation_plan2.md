# Plan de Implementación: Dashboards de Acción por Rol y Corrección de Bugs

Este documento detalla el plan de implementación para corregir los bugs detectados en tiempo de ejecución, actualizar la documentación del esquema de base de datos en Supabase y rediseñar por completo la pantalla de **Dashboard (Resumen Analítico)** para contar historias orientadas a la acción según el rol del usuario conectado (`admin`, `reclutador`, `formador`, `visor`).

---

## User Review Required

> [!IMPORTANT]
> **Esquema de Dashboards Específicos por Rol:**
> Rediseñaremos `src/components/Dashboard.jsx` para que no sea un panel genérico, sino una herramienta de trabajo adaptada a las responsabilidades de cada usuario:
> 1. **Administrador/Director:** Vista macro enfocada en la eficiencia del embudo de reclutamiento, sedes con mayor deserción, efectividad de campañas y un panel ejecutivo de alertas operativas (sedes por debajo del benchmark de retención).
> 2. **Reclutador:** Vista micro enfocada en su progreso personal. Tracker semanal (meta de 15 registros), su tasa de retención, motivos de bajas en sus candidatos y una lista de llamadas de seguimiento para contactar postulantes con inasistencias.
> 3. **Formador/Trainer:** Vista enfocada en la salud de sus aulas activas. Tendencia de asistencia diaria, semáforo de riesgo crítico (alumnos con 2+ inasistencias consecutivas) y recordatorio de evaluaciones pendientes de registrar.
> 4. **Visor/Gerente:** Lectura analítica del embudo global y motivos principales de deserción.

> [!WARNING]
> **Desalineación del Archivo de Esquema (`schema.sql`):**
> La base de datos física de Supabase contiene el campo `campana_id` en la tabla `postulantes`, pero el archivo `schema.sql` local no lo documenta. Actualizaremos la documentación física del esquema en el repositorio para evitar inconsistencias futuras de desarrollo.

---

## Open Questions

Actualmente no tenemos dudas críticas que bloqueen el inicio, pero te planteamos los siguientes puntos para análisis a futuro (ver sección **Campos y Acciones Adicionales** al final):
* ¿Sería conveniente añadir el campo `grupo_codigo` directamente a la tabla `postulantes` para evitar resolverlo indirectamente mediante la tabla de asistencias diarias?
* ¿Necesitaremos registrar la fecha exacta de ingreso a operaciones (`fecha_ingreso_operacion`) para calcular el tiempo promedio de conversión de recluta a operador?

---

## Proposed Changes

### [Componente de Navegación y Control de Estados]

#### [MODIFY] [App.jsx](file:///c:/Users/BRYAN/Desktop/GEAismael/src/App.jsx)
* Modificar la invocación del componente `<Dashboard>` para pasar las propiedades del rol actual y el perfil del usuario:
  ```jsx
  <Dashboard 
    postulantes={postulantes} 
    asistencias={asistencias} 
    grupos={grupos} 
    role={currentRole} 
    userProfile={effectiveProfile}
  />
  ```

---

### [Componente de Visualización de Datos]

#### [MODIFY] [Dashboard.jsx](file:///c:/Users/BRYAN/Desktop/GEAismael/src/components/Dashboard.jsx)
* Rediseñar por completo el componente. En lugar de una sola estructura genérica de gráficos, implementar una lógica condicional que renderice submódulos específicos para cada rol con diseño visual premium:
  * **`AdminDashboard`**:
    * **KPIs:** Postulantes totales, tasa de conversión global, deserción acumulada y número de reclutadores activos.
    * **Gráfico 1 (Embudo de Conversión):** Visualización del flujo de candidatos (Registrados -> En Capacitación -> Pasaron a Operación).
    * **Gráfico 2 (Comparativa de Retención por Sede):** Gráfico de barras horizontal que resalta sedes con menor retención para auditorías de procesos.
    * **Gráfico 3 (Pareto de Deserción):** Gráfico de pastel / pie con los motivos más comunes de bajas.
    * **Panel de Alertas Operativas:** Lista de problemas urgentes (Ej: "La sede Jockey Plaza presenta una deserción del 35% esta semana. Se sugiere auditar el proceso de selección").
  * **`ReclutadorDashboard`**:
    * **KPIs:** Mis registros totales, Mi tasa de retención (candidatos activos), Bajas de mis postulantes.
    * **Indicador de Progreso Semanal:** Anillo o medidor interactivo que muestra los postulantes registrados esta semana frente a la meta (15).
    * **Mecánica de Gamificación:** Insignia visual premium basada en su rango (`🌱 Semilla`, `⭐ Calidad`, `🏆 Élite`).
    * **Panel "Candidatos en Alerta Roja"**: Lista accionable de alumnos reclutados por el usuario que han registrado inasistencias en capacitación recientemente, facilitando su contacto telefónico preventivo.
  * **`FormadorDashboard`**:
    * **KPIs:** Mis grupos a cargo, Tasa de asistencia promedio de hoy, Postulantes en riesgo crítico.
    * **Gráfico de Tendencia diaria:** Gráfico de áreas para evaluar la asistencia en los últimos 7 días.
    * **Panel "Semáforo de Riesgo de Deserción"**: Lista de postulantes con 2 o más Faltas Injustificadas (`FI`) consecutivas, permitiendo al formador contactarlos o procesar su baja rápidamente.
    * **Recordatorios de Calificación:** Alertas de grupos que están cerca de finalizar y tienen evaluaciones de capacitación pendientes.
  * **`VisorDashboard`**:
    * KPIs globales y gráficos informativos esenciales sin acciones directas asignadas.

---

### [Componente de Listas y Tablas]

#### [MODIFY] [PostulantesTable.jsx](file:///c:/Users/BRYAN/Desktop/GEAismael/src/components/PostulantesTable.jsx)
* Corregir el bug crítico en tiempo de ejecución:
  * Reemplazar la referencia a `SEDES.map` por `sedes.map` en la línea 394.
  * Agregar la opción base `<option value="TODAS">TODAS</option>` dentro del selector de filtrado de sedes.
* Solucionar los avisos menores de ESLint (importaciones y variables declaradas no usadas).

---

### [Estructura de Base de Datos y Documentación]

#### [MODIFY] [schema.sql](file:///c:/Users/BRYAN/Desktop/GEAismael/schema.sql)
* Modificar la declaración de la tabla `postulantes` para incluir el campo `campana_id` que se encuentra configurado físicamente en Supabase:
  ```sql
  campana_id BIGINT REFERENCES campanas(id) ON DELETE SET NULL,
  ```

---

## Campos y Acciones Adicionales para Análisis del Usuario

Identificamos campos y tablas adicionales que optimizarían la recolección de métricas:

| Campo / Tabla Sugerido | Propósito del Campo | Acción Recomendada si falta |
| :--- | :--- | :--- |
| **`fecha_ingreso_operacion`** *(en `postulantes`)* | Permite registrar el momento exacto en el que el postulante culminó capacitación y pasó a operaciones reales. | Si se aprueba, agregaremos este campo en `schema.sql` y crearemos una columna en Supabase. |
| **`grupo_codigo`** *(en `postulantes`)* | Permite asignar directamente a un candidato a un grupo de capacitación desde el formulario de nómina, en lugar de inferirlo de las asistencias. | Agilizaría consultas y filtros. Proponemos añadir esta relación de clave foránea. |
| **`estado_postulante`** *(en `postulantes`)* | Un enum (`reclutado`, `capacitando`, `baja`, `operativo`) para no calcular la condición activa/inactiva dinámicamente en memoria todo el tiempo. | Mejora el rendimiento de la aplicación y simplifica la base de datos. |

---

## Verification Plan

### Automated Tests
* Ejecutar `npm run build` para asegurar que el ruteo del bundler no tenga dependencias circulares ni errores de importación.
* Ejecutar `npm run lint` para validar la eliminación de advertencias.

### Manual Verification
1. **Verificación de Roles (RBAC Dashboard):**
   * Iniciar sesión como reclutador (ej. `Medina Huari Aldo Manuel` o similar si configurado) y verificar que el dashboard muestre su meta semanal de 15, su medidor de gamificación y su lista de llamadas.
   * Iniciar sesión como formador y corroborar la presencia del "Semáforo de Riesgo Crítico" y su tendencia diaria de asistencia.
   * Iniciar sesión como administrador y confirmar el embudo de conversión global y las alertas operativas globales.
2. **Prueba de Filtro de Sedes:**
   * Entrar a la sección "Nómina" -> Tabla de Postulantes.
   * Abrir panel de "Filtros", verificar que cargue las sedes correctamente sin causar crasheos e interactuar con el filtro seleccionando una sede y luego regresando a "TODAS".
