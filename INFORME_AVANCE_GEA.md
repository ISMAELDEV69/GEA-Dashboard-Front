# GEA DataCenter — Informe de Avance Ejecutivo

**Proyecto:** Plataforma digital de reclutamiento, capacitación y nóminas  
**Organización:** GEA  
**Fecha del informe:** 19 de junio de 2026  
**Estado general:** ✅ En operación — base reestructurada, módulos funcionales, listo para roleplay y piloto operativo

---

## 1. Resumen ejecutivo

Se ha desarrollado e implementado **GEA DataCenter**, una plataforma web moderna que digitaliza el **consolidado de nóminas** que hoy se gestiona en Excel. El sistema centraliza todo el ciclo de vida del postulante:

**Reclutamiento → Capacitación → Evaluación → Operaciones → Control de costos**

La solución reemplaza hojas de cálculo dispersas por una base de datos estructurada en **Supabase (PostgreSQL)**, con interfaces diferenciadas por rol, dashboards con **data storytelling** automático y trazabilidad completa de cambios.

**Logro principal:** El Excel operativo ya no es la fuente de verdad aislada — ahora existe un modelo de datos escalable que replica cada columna del consolidado y alimenta KPIs en tiempo real para capacitadores, administradores y directivos.

---

## 2. Problema que resuelve

| Situación anterior | Solución implementada |
|---|---|
| Consolidado en Excel con +50 columnas difícil de auditar | Base de datos normalizada con vista plana equivalente al Excel |
| Sin visibilidad por rol (todos ven lo mismo o nada) | 4 perfiles con pantallas y KPIs propios |
| Pérdida de candidatos sin saber en qué etapa | Embudo visual: Reclutados → Test Psico → Cap → D0 → OJT → OP |
| Asistencias en planillas separadas | Módulo de asistencia diaria con semáforo de riesgo |
| Sin historial de quién cambió qué | Auditoría automática en tablas críticas |
| Datos duplicados e inconsistentes | Arquitectura Persona + Proceso (un DNI, múltiples ingresos) |

---

## 3. Stack tecnológico

| Capa | Tecnología | Propósito |
|---|---|---|
| Frontend | React 19 + Vite 8 | Interfaz rápida y moderna |
| Estilos | Tailwind CSS | Diseño responsive, temas claro/oscuro |
| Backend / BD | Supabase (PostgreSQL) | Base de datos, autenticación, RLS |
| Gráficos | Recharts | Dashboards y BI |
| Validación | Zod + React Hook Form | Formularios robustos |
| Importación | SheetJS (xlsx) | Carga masiva desde Excel |
| Despliegue | Build estático (`npm run build`) | Listo para hosting |

---

## 4. Arquitectura de datos (Schema v2)

Se reestructuró la base de datos desde cero siguiendo buenas prácticas de modelado:

```
┌─────────────────────────────────────────────────────────────┐
│  CAPA PRESENTACIÓN (React)                                  │
│  Nómina · Asistencias · Evaluaciones · Dashboards · BI      │
└────────────────────────────┬────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────┐
│  CAPA SERVICIO (dataService.js)                             │
│  CRUD postulantes/nóminas · asistencias · catálogos · auth    │
└────────────────────────────┬────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────┐
│  CAPA DATOS (PostgreSQL / Supabase)                         │
│                                                             │
│  CATÁLOGOS              ENTIDADES           OPERACIONAL     │
│  sedes                  postulantes         nominas         │
│  campanas               formadores          asistencias     │
│  reclutadores                               evaluaciones    │
│  grupos_capacitacion                          audit_logs    │
│  motivos_baja                                 perfiles      │
└─────────────────────────────────────────────────────────────┘
```

### Principios de diseño

1. **Separación persona / proceso** — Un postulante puede reingresar sin duplicar su identidad.
2. **Catálogos normalizados** — Sedes, campañas, reclutadores y formadores como dimensiones reutilizables.
3. **Vista consolidada** — `v_nominas_consolidado` replica el Excel operativo para la UI.
4. **Trazabilidad** — Triggers de auditoría + tabla `audit_logs`.
5. **Seguridad** — Row Level Security (RLS) por rol en Supabase.

---

## 5. Mapeo del consolidado Excel → sistema

El consolidado de nóminas compartido por operaciones fue la referencia directa para el modelado:

### Bloque 1 — Reclutamiento e identidad (columnas A–O)

| Excel | Sistema |
|---|---|
| PERIODO RECLUTADO | `nominas.periodo_reclutado` |
| SEMANA DE TRABAJO | `nominas.semana_trabajo` / `grupos_capacitacion.semana_trabajo` |
| RECLUTADOR | `reclutadores` → `nominas.reclutador_id` |
| SEDE | `sedes` → `nominas.sede_id` |
| DNI, nombres, celular, correo | `postulantes` |
| GÉNERO, FECHA NAC., EDAD | `postulantes` + cálculo automático |
| ESTADO CIVIL, HIJOS | `postulantes` |

### Bloque 2 — Perfil y experiencia (columnas P–AD)

| Excel | Sistema |
|---|---|
| NIVEL ACADÉMICO, CARRERA | `postulantes.nivel_academico`, `carrera` |
| NACIONALIDAD, RESIDENCIA, DISTRITO | `postulantes` |
| EXP. CALL CENTER, TIEMPO | `nominas.exp_*` |
| FUENTE DE OFERTA | `nominas.fuente_oferta` |
| OBSERVACIÓN | `nominas.observacion_reclutamiento` |

### Bloque 3 — Capacitación y pipeline (columnas AE–AS)

| Excel | Sistema |
|---|---|
| CAMPAÑA | `campanas` → `nominas.campana_id` |
| GRUPO (GPE-2025-021) | `grupos_capacitacion` |
| MODALIDAD, CONDICIÓN, HORARIO | `nominas` |
| TEST PSICOLÓGICO, VALID. PC, EVAL D0 | `nominas` |
| INICIO/FIN CAPACITACIÓN, OJT, OP | `nominas` (fechas) |
| PAGO CAPACITACIÓN | `nominas.pago_capacitacion` |

### Bloque 4 — Contrato y día 0/1 (columnas AT–BG)

| Excel | Sistema |
|---|---|
| TIPO CONTRATACIÓN, RAZÓN SOCIAL | `nominas` |
| REMUNERACIÓN + 5 BONOS | `nominas.remuneracion`, `bono_*` |
| CARGO CONTRACTUAL | `nominas.cargo_contractual` |
| DÍA 0, DÍA 1, STATUS, OBSERVACIONES | `nominas` + `asistencias_capacitacion` |

---

## 6. Roles y permisos (RBAC)

| Rol | Nombre en sistema | Acceso |
|---|---|---|
| **Admin** | `admin` | Control total: usuarios, metas, auditoría, nómina, asistencias, BI |
| **Reclutador** | `reclutador` | Nómina (ingreso postulantes), dashboard personal |
| **Capacitador / Formador** | `formador` | Asistencias, evaluaciones, dashboard de aula, BI |
| **Directivo** | `visor` | Dashboards ejecutivos ampliados, BI, solo lectura estratégica |

Cada usuario ve únicamente los módulos de su rol en el menú lateral. La autenticación es vía **Supabase Auth** con perfil vinculado en tabla `perfiles`.

---

## 7. Módulos implementados

### 7.1 Nómina (Reclutamiento)
- Formulario completo alineado al consolidado Excel.
- Validación en tiempo real (DNI, correo, periodo AAAAMM, semana 1–53).
- **Importación masiva desde Excel** (arrastrar o seleccionar archivo).
- Creación automática de catálogos (sede, reclutador, campaña) si no existen.
- Contador de postulantes por semana vs. meta.

### 7.2 Tabla de postulantes
- Vista editable del consolidado activo.
- Scroll interno en tablas (altura moderada, encabezado fijo).
- Exportación a Excel.
- Edición inline de campos clave.

### 7.3 Asistencias (Capacitación)
- Réplica visual del panel operativo de Google Sheets.
- **Campos editables y persistentes:** Segmento (SIU), campaña, semana, grupo, formador.
- Registro diario con siglas: A, I-OP, FI, FJ, B.
- Semáforo de riesgo por faltas injustificadas (FI consecutivas).
- Motivos de baja estandarizados (11 categorías).
- Exportación Excel por grupo y fecha.
- Guardado unificado: metadata del grupo + asistencias en una sola acción.

### 7.4 Evaluaciones
- Registro de notas finales de capacitación por grupo.
- Vinculado a postulantes y grupos de inducción.

### 7.5 Metas y equipos (Admin)
- Configuración de metas grupales por campaña.
- Asignación de metas individuales por reclutador.
- Vista por segmento de negocio.

### 7.6 Gestión de usuarios (Admin)
- Creación de cuentas desde la plataforma (Edge Function Supabase).
- Asignación de roles.
- Guía de configuración de metadata en Supabase Dashboard.

### 7.7 Auditoría (Admin)
- Historial de INSERT / UPDATE / DELETE en tablas críticas.
- Tabla con scroll, filtros y trazabilidad por usuario y fecha.

### 7.8 Analítica BI
- Retención por sede, campaña y periodo.
- Visualización de asistencias y deserción.
- Acceso para admin, formador y directivo.

### 7.9 Perfil de usuario
- Cambio de foto, nombre y preferencias.
- Selector de tema (Oscuro / Cómodo / Claro).
- Tabs: Cuenta, Interfaz, Seguridad, Notificaciones.

---

## 8. Dashboards con Data Storytelling

Cada rol recibe un dashboard personalizado con **narrativa automática** que interpreta los datos y sugiere acciones:

### Capacitador / Formador
**Pregunta clave:** *¿Cómo va mi aula y quién está en riesgo?*

| KPI | Descripción |
|---|---|
| Grupos activos | Grupos GPE asignados |
| Alumnos en aula | Postulantes en capacitación |
| Asistencia promedio | Meta: ≥ 80% |
| Conversión a OP | % que llegó a operaciones |
| Tests / Eval D0 pendientes | Bloqueos del pipeline |
| Semáforo FI | Alumnos con faltas consecutivas |

**Storytelling ejemplo:** *"Tu asistencia (76%) está bajo el 80%. Activa protocolo de rescate antes del día 3."*

---

### Reclutador
**Pregunta clave:** *¿Qué tan buena es mi selección?*

| KPI | Descripción |
|---|---|
| Mis postulantes | Cartera del reclutador |
| Retención | Calidad de selección |
| Esta semana | Ingresos vs. meta (15) |
| Conectados OP | Resultado final |
| Perfil con experiencia CC | % con background call center |
| Lista de llamadas | Postulantes con FI para contactar |

---

### Administrador
**Pregunta clave:** *¿Dónde falla la operación hoy?*

| KPI | Descripción |
|---|---|
| Postulantes activos | Volumen del pipeline |
| Grupos en curso | Capacidad de formación |
| Asistencia global | Salud operativa |
| Conversión OP | Eficiencia reclutamiento → ops |
| Alertas automáticas | Sedes críticas, motivos de baja, evals pendientes |
| Embudo de conversión | Visual del pipeline completo |

---

### Directivo (vista más completa)
**Pregunta clave:** *¿Cuánto cuesta el pipeline y dónde se pierde talento?*

Incluye todo lo del admin **más**:

| KPI exclusivo | Descripción |
|---|---|
| Pipeline total / En cap / OJT / OP | Estado del embudo |
| CESE Día 1 | Deserción inmediata post-capacitación |
| Remuneración pipeline | Costo base proyectado (S/.) |
| Costo total | Base + 5 tipos de bono |
| Conversión por campaña | ROI por proyecto |
| Fuentes de oferta | Efectividad de canales (Computrabajo, etc.) |
| Tendencia por periodo | Volumen histórico |
| Retención por sede | Distribución geográfica |

**Embudo del consolidado:**
```
Reclutados → Test Psico → Inicio Cap → Eval D0 → OJT → Conexión OP
```

**Storytelling ejemplo:** *"7 personas se perdieron entre reclutamiento y OP. Revisar test psicológico y evaluación día 0."*

---

## 9. Seguridad y gobernanza de datos

| Medida | Implementación |
|---|---|
| Autenticación | Supabase Auth (email/contraseña) |
| Autorización | RBAC en frontend + RLS en PostgreSQL |
| Perfiles | Trigger automático al crear usuario |
| Políticas RLS | Lectura general autenticada; escritura por rol |
| Auditoría | Triggers en postulantes, nominas, asistencias |
| Edge Function | `create-user` para creación segura de cuentas (server-side) |

### Políticas de escritura por tabla

| Tabla | Quién puede escribir |
|---|---|
| postulantes / nominas | admin, reclutador (+ formador en update nominas) |
| asistencias_capacitacion | admin, formador |
| grupos_capacitacion | admin, formador |
| campanas / sedes / reclutadores | admin, reclutador, formador (segmento) |
| perfiles | propio usuario o admin |

---

## 10. Entregables técnicos completados

### Base de datos
- [x] `database/schema_v2.sql` — Schema completo v2
- [x] `database/reset_database.sql` — Reset operacional (conserva usuarios)
- [x] `database/grupos_meta_migration.sql` — Semana en grupos + permisos formador
- [x] `database/ARCHITECTURE.md` — Documentación técnica
- [x] `scripts/apply-schema-v2.js` — Script de aplicación automatizado
- [x] Vista `v_nominas_consolidado` — Excel operativo en SQL
- [x] RPC `registrar_nomina(JSONB)` — Inserción transaccional

### Frontend (17 componentes)
- [x] Login con temas
- [x] Dashboard por rol (4 variantes + storytelling)
- [x] NominaForm con import Excel
- [x] AsistenciaForm editable (SIU, campaña, semana, grupo)
- [x] EvaluacionesForm
- [x] PostulantesTable
- [x] MetasManagement
- [x] UserManagement
- [x] AuditLogs
- [x] AttendanceBI
- [x] PerfilConfig

### Backend / servicios
- [x] `dataService.js` — Capa unificada Supabase + fallback local
- [x] `dashboardAnalytics.js` — Motor de KPIs y narrativas
- [x] `fix_perfiles_trigger.sql` — Fix roles y políticas perfiles
- [x] Edge Function `create-user`

### Calidad
- [x] Build de producción exitoso (`npm run build`)
- [x] Migración aplicada en Supabase
- [x] Base vacía lista para roleplay manual

---

## 11. Estado actual del proyecto

| Aspecto | Estado |
|---|---|
| Arquitectura de datos | ✅ Completada (v2) |
| Módulos operativos | ✅ Funcionales |
| Dashboards por rol | ✅ Implementados |
| Asistencia editable | ✅ Implementada |
| Importación Excel | ✅ Funcional |
| Autenticación y roles | ✅ Operativa |
| Datos de producción | ⏳ Vacíos — listos para carga manual / piloto |
| Edge Function deploy | ⏳ Pendiente: `npx supabase functions deploy create-user` |
| Hosting producción | ⏳ Pendiente despliegue final |

**Cuenta administrador configurada:** `clydelean@gmail.com` (rol admin)

---

## 12. Flujo operativo propuesto (piloto)

```
1. Admin configura catálogos
   └── Sedes, campañas, reclutadores, formadores

2. Reclutador registra postulantes
   └── Nómina (individual o import Excel)
   └── Sistema crea postulante + proceso de nómina

3. Formador crea/selecciona grupo
   └── Edita SIU, campaña, semana en panel de asistencia
   └── Registra asistencia diaria con siglas

4. Formador evalúa al cierre
   └── Módulo de evaluaciones

5. Admin y Directivo monitorean
   └── Dashboards con storytelling automático
   └── BI de retención y embudo
```

---

## 13. Beneficios para la organización

1. **Visibilidad en tiempo real** — Dejar de esperar consolidados semanales en Excel.
2. **Decisiones basadas en datos** — KPIs automáticos por rol con narrativa accionable.
3. **Reducción de deserción** — Alertas tempranas (FI, CESE Día 1, evaluaciones pendientes).
4. **Control de costos** — Proyección de remuneración + bonos del pipeline activo.
5. **Trazabilidad** — Saber quién registró o modificó cada dato.
6. **Escalabilidad** — Modelo preparado para múltiples campañas, sedes y reingresos.
7. **Estandarización** — Un solo formato de datos alineado al consolidado actual.

---

## 14. Próximos pasos recomendados

| Prioridad | Acción | Impacto |
|---|---|---|
| Alta | Desplegar Edge Function `create-user` | Creación de usuarios 100% desde la app |
| Alta | Cargar datos piloto (1 campaña, 1 grupo) | Validar flujo end-to-end con operaciones |
| Media | Completar campos pipeline en UI de nómina | Test psico, OJT, OP, contrato desde pantalla |
| Media | Desplegar en hosting (Vercel/Netlify) | Acceso URL para todo el equipo |
| Media | Capacitación por rol (2 hrs) | Adopción rápida del equipo |
| Baja | Reportes PDF automáticos | Entregables semanales a dirección |

---

## 15. Comandos útiles para el equipo técnico

```bash
npm run dev              # Servidor de desarrollo local
npm run build            # Compilar para producción
npm run db:reset         # Aplicar schema v2 + vaciar datos operacionales
npm run db:promote-admin   # Promover usuario a administrador
npx supabase functions deploy create-user   # Desplegar creación de usuarios
```

---

## 16. Conclusión

GEA DataCenter evoluciona de un consolidado Excel manual hacia una **plataforma integrada de gestión de talento** para call center. La arquitectura v2 está implementada, los módulos core operan correctamente, y los dashboards entregan inteligencia de negocio diferenciada por rol — especialmente para directivos, con la vista ejecutiva más completa.

El sistema está **listo para iniciar un piloto controlado** con datos reales de una campaña, validar el flujo con reclutadores y formadores, y escalar gradualmente al resto de operaciones.

---

*Documento generado para presentación interna — GEA DataCenter v0.1*  
*Contacto técnico: equipo de desarrollo · Repositorio: GEAismael*
