# CATÁLOGO DE REFERENCIA DE ESQUEMA DE BASE DE DATOS (SUPABASE POSTGRESQL)
**Plataforma Web GEA — Fuente de Verdad para Nombres de Columnas y Consultas**

> [!IMPORTANT]
> **REGLA OBLIGATORIA:** Antes de escribir cualquier consulta `.select(...)`, `.insert(...)`, `.update(...)` o query SQL/REST, verifica el nombre exacto de las columnas en este documento. **No escribas nombres de columnas de memoria.**

---

## 1. TABLA: `perfiles` (Autenticación y Cuentas de Acceso)
Almacena las cuentas de usuario y roles de acceso a la plataforma.

| Columna | Tipo | Descripción / Valores |
| :--- | :--- | :--- |
| `id` | `UUID` (PK) | Identificador único vinculado a `auth.users.id` |
| `nombre` | `VARCHAR(200)` | Nombre completo o alias del usuario |
| `rol` | `VARCHAR(50)` | Rol en el sistema: `'admin'`, `'reclutador'`, `'formador'`, `'visor'`, `'supervisor_capacitacion'`, `'coordinador_rys'`, `'jefe_rys'`, `'jefe_capacitacion'` |
| `segmento` | `VARCHAR(100)` | *(Columna opcional / requiere migración SQL)* Segmento asignado (ej. `'CLARO CHILE'`). |
| `created_at` | `TIMESTAMPTZ` | Fecha de creación del perfil |

> [!WARNING]
> **ANTI-PATRONES / NO EXISTE EN `perfiles`:**
> - ❌ **NO EXISTE** `cargo`: El cargo no vive en auth. El cargo vive en `formadores` (`cargo_funcional`) o `equipo_reclutamiento` (`cargo`).
> - ❌ **NO EXISTE** `telefono` ni `avatar_url`.
> - ⚠️ **Columna `segmento`:** Solo debe consultarse una vez ejecutada la migración `database/supervisor_segmento_migration.sql`. Por defecto en producción el select canónico es `.select('id, nombre, rol')`.

---

## 2. TABLA: `consolidado_asistencias` (Asistencias Diarias de Capacitación)
Histórico de marcaciones y estados diarios de los postulantes en capacitación/OJT.

| Columna | Tipo | Descripción / Valores |
| :--- | :--- | :--- |
| `id` | `UUID` (PK) | Identificador único del registro |
| `archivo_origen` | `VARCHAR` | Etiqueta del archivo cargado (ej. `'SEM33'`) |
| `documento` | `VARCHAR` | DNI / Documento de identidad del postulante |
| `apellido_paterno` | `VARCHAR` | Primer apellido |
| `apellido_materno` | `VARCHAR` | Segundo apellido |
| `nombres` | `VARCHAR` | Nombres del postulante |
| `celular` | `VARCHAR` | Número de contacto |
| `condicion_laboral` | `VARCHAR` | `'FULL TIME'`, `'PART TIME'`, etc. |
| `campana` | `VARCHAR` | Nombre de la campaña (ej. `'CLARO POSTPAGO'`) |
| `grupo` | `VARCHAR` | Nombre/etiqueta del grupo |
| `codigo_grupo` | `VARCHAR` | Código canónico del grupo (ej. `'GPE-2026063'`). Usar para joins. |
| `documento_formador` | `VARCHAR` | DNI del formador responsable |
| `nombre_formador` | `VARCHAR` | Nombre completo del formador |
| `fecha_registro_asistencia` | `VARCHAR / DATE` | Fecha de la asistencia (formato `'DD/MM/YYYY'` o ISO) |
| `tipo_reclutado` | `VARCHAR` | Estado de reclutamiento (ej. `'APTO'`) |
| `estado` | `VARCHAR` | Estado en formación: `'ACTIVO'`, `'CESADO'`, `'BAJA DIA 1'`, etc. |
| `sigla` | `VARCHAR` | Sigla de marcación diaria: `'A'`, `'B'`, `'FI'`, `'FJ'`, `'I-OP'`, `'BD1'` |
| `motivo_baja` | `VARCHAR` | Razón de baja (ej. `'NO CONTACTO'`, `'FAMILIAR'`, `'BAJA DIA 1'`) |
| `fecha_hora_registro` | `VARCHAR` | Marca de tiempo del registro |
| `created_at` | `TIMESTAMPTZ` | Timestamp de inserción |

> [!WARNING]
> **ANTI-PATRONES / NO EXISTE EN `consolidado_asistencias`:**
> - ❌ **NO EXISTE** `periodo`: El periodo **NO vive aquí**. Debe obtenerse de `capacidad_rys.periodo` haciendo join por `codigo_grupo` $\leftrightarrow$ `capacidad_rys.codigo`.
> - ❌ **NO EXISTE** `semana_label` ni `semana_trabajo`: Viven en `capacidad_rys`.
> - ❌ **NO EXISTE** `tipo_baja`: El campo correcto es **`motivo_baja`**.
> - ⚠️ **Atención con el nombre del grupo:** Usa siempre **`codigo_grupo`** para filtrar/enlazar grupos.

---

## 3. TABLA: `capacidad_rys` (Maestro de Grupos y Capacidades)
Definición de grupos de formación, metas, fechas clave, periodos y formadores asignados.

| Columna | Tipo | Descripción / Valores |
| :--- | :--- | :--- |
| `codigo` | `VARCHAR` (PK) | Código único del grupo (ej. `'GPE-2026015'`) |
| `campana` | `VARCHAR` | Campaña a la que pertenece el grupo |
| `segmento` | `VARCHAR` | Segmento corporativo (ej. `'CLARO PERU OUT'`) |
| `area_traslado` | `VARCHAR` | Área solicitante / traslado |
| `semana_label` | `VARCHAR` | Etiqueta de semana (ej. `'SEM 33'`) |
| `semana_trabajo` | `INT / VARCHAR`| Número de semana (ej. `33`) |
| `periodo` | `VARCHAR` | Periodo mensual (ej. `'202608'`) |
| `modalidad` | `VARCHAR` | `'REMOTO'`, `'PRESENCIAL'`, `'HIBRIDO'` |
| `condicion` | `VARCHAR` | `'FULL TIME'`, `'PART TIME'` |
| `estado` | `VARCHAR` | `'EN CURSO'`, `'FINALIZADO'`, etc. |
| `fecha_registro` | `DATE` | Fecha de creación/registro del grupo |
| `fecha_inicio_ojt` | `DATE` | Fecha oficial en que el grupo inicia OJT / Nesting |
| `fecha_ingreso_op` | `DATE` | Fecha oficial de pase a operaciones |
| `meta_dia_0` | `INT` | Meta requerida para Día 0 |
| `meta_dia_1` | `INT` | Meta requerida para Día 1 |
| `rq_solicitado` | `INT` | Requerimiento de postulantes solicitado |
| `rq_ftes_solicitado`| `INT` | Requerimiento en FTEs |
| `formador_documento`| `VARCHAR` | DNI del formador asignado |
| `sede` | `VARCHAR` | Sede asignada |
| `created_at` | `TIMESTAMPTZ` | Timestamp de creación |

> [!WARNING]
> **ANTI-PATRONES / NO EXISTE EN `capacidad_rys`:**
> - ❌ **NO EXISTE** `grupo_codigo`: La clave primaria es **`codigo`**.

---

## 4. TABLA: `nominas` (Postulantes Reclutados y Estatus de Ingreso)
Registro maestro de postulantes reclutados por R&S para cada grupo.

| Columna | Tipo | Descripción / Valores |
| :--- | :--- | :--- |
| `id` | `BIGINT` (PK) | Identificador único numérico |
| `documento` | `VARCHAR` | DNI / CE del postulante |
| `grupo_codigo` | `VARCHAR` | Código del grupo al que fue asignado (ej. `'GPE-2026009'`) |
| `campana` | `VARCHAR` | Nombre de campaña |
| `periodo_reclutado`| `VARCHAR` | Periodo de reclutamiento (ej. `'202608'`) |
| `semana_trabajo` | `INT / VARCHAR`| Semana de reclutamiento |
| `reclutador` | `VARCHAR` | Nombre del reclutador |
| `reclutador_id` | `INT / UUID` | ID del reclutador |
| `dia_0` | `VARCHAR` | Asistencia Día 0: `'ASISTIO'`, `'FALTO'`, etc. |
| `dia_1` | `VARCHAR` | Asistencia Día 1: `'ASISTIO'`, `'FALTO'`, etc. |
| `status_dia_1` | `VARCHAR` | Estatus detallado de Día 1 |
| `status_final` | `VARCHAR` | Estatus final del proceso |
| `estado` | `VARCHAR` | `'ACTIVO'`, `'INACTIVO'`, etc. |
| `activo` | `BOOLEAN` | `true` si el postulante sigue activo en nómina |
| `fecha_inicio_capacitacion` | `DATE` | Fecha pactada de inicio de formación |
| `observacion_estado` | `TEXT` | Observaciones operativas de estado |

> [!WARNING]
> **ANTI-PATRONES / NO EXISTE EN `nominas`:**
> - ❌ **NO EXISTE** `codigo_grupo`: En `nominas` se llama **`grupo_codigo`**.
> - ❌ **NO EXISTE** `periodo`: En `nominas` se llama **`periodo_reclutado`**.
> - ❌ **NO EXISTE** `motivo_baja`: Las bajas de formación viven en `consolidado_asistencias`.

---

## 5. TABLA: `formadores` (Equipo de Capacitación)
Maestro del equipo de formadores y supervisores de capacitación.

| Columna | Tipo | Descripción / Valores |
| :--- | :--- | :--- |
| `id` | `UUID / BIGINT` (PK) | Identificador único |
| `documento` | `VARCHAR` | DNI del formador |
| `nombre_completo` | `VARCHAR` | Nombres y apellidos completos |
| `segmento` | `VARCHAR` | Segmento al que pertenece (ej. `'CLARO CHILE'`, `'CLARO PERU'`) |
| `subcampana` | `VARCHAR` | Subcampaña asignada |
| `cargo_contractual` | `VARCHAR` | Cargo según contrato |
| `cargo_funcional` | `VARCHAR` | `'FORMADOR'`, `'SUPERVISOR'`, `'JEFE'` |
| `estado` | `VARCHAR` | `'ACTIVO'`, `'INACTIVO'` |
| `sede` | `VARCHAR` | Sede de trabajo |

---

## 6. TABLA: `equipo_reclutamiento` (Equipo de R&S)
Maestro del equipo de reclutamiento y selección.

| Columna | Tipo | Descripción / Valores |
| :--- | :--- | :--- |
| `documento` | `VARCHAR` (PK) | DNI del reclutador |
| `alias` | `VARCHAR` | Alias / Nombre corto |
| `nombres_completos` | `VARCHAR` | Nombres completos |
| `apellido_paterno` | `VARCHAR` | Primer apellido |
| `apellido_materno` | `VARCHAR` | Segundo apellido |
| `cargo` | `VARCHAR` | Cargo (ej. `'Asistente de R&S'`, `'Analista'`, `'Coordinador'`) |
| `estado` | `VARCHAR` | `'ACTIVO'`, `'INACTIVO'` |
| `alix` | `VARCHAR` | Usuario del sistema Alix |

---

## 7. TABLA: `grupos_dia1` (Configuración y Calibración Día 1)

| Columna | Tipo | Descripción / Valores |
| :--- | :--- | :--- |
| `grupo_codigo` | `VARCHAR` | Código del grupo |
| `campana` | `VARCHAR` | Campaña |
| `fecha_dia1` | `VARCHAR / DATE` | Fecha de referencia de Día 1 para el grupo |
| `estado_calibracion` | `VARCHAR` | `'CALIBRADO'`, `'DESCALIBRADO'`, `'PENDIENTE'` |
| `updated_at` | `TIMESTAMPTZ` | Última actualización |

---

## 8. TABLA: `descuentos` (Retenciones y Descuentos Autorizados)

| Columna | Tipo | Descripción / Valores |
| :--- | :--- | :--- |
| `dni_ce` | `VARCHAR` | Documento del postulante/colaborador |
| `campana` | `VARCHAR` | Campaña |
| `grupo_cap` | `VARCHAR` | Código del grupo de capacitación |
| `procede` | `VARCHAR` | `'SI'`, `'NO'` |
| `motivo` | `VARCHAR` | Motivo del descuento |
| `autoriza_rys` | `VARCHAR` | Aprobación R&S |
| `autoriza_cap` | `VARCHAR` | Aprobación Capacitación |

---

## RESUMEN DE EQUIVALENCIAS Y CONFUSIONES HISTÓRICAS

| Concepto | `consolidado_asistencias` | `capacidad_rys` | `nominas` |
| :--- | :--- | :--- | :--- |
| **Código de Grupo** | `codigo_grupo` | `codigo` | `grupo_codigo` |
| **Periodo** | *(No existe, cruzar)* | `periodo` | `periodo_reclutado` |
| **Motivo de Baja** | `motivo_baja` | *(No aplica)* | `observacion_estado` |
| **Tipo de Baja** | ❌ *(No existe)* | *(No aplica)* | ❌ *(No existe)* |
| **Semana** | *(No existe, cruzar)* | `semana_label`, `semana_trabajo` | `semana_trabajo` |
