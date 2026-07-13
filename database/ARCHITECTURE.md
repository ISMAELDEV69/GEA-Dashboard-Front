# Arquitectura de Datos GEA — v2

## Principios

1. **Separación persona / proceso** — Un postulante puede tener varios procesos de nómina (reingresos).
2. **Catálogos normalizados** — Sedes, campañas, reclutadores, formadores como dimensiones.
3. **Vista consolidada** — `v_nominas_consolidado` replica el Excel operativo para la UI.
4. **Trazabilidad** — Auditoría en tablas críticas + `audit_logs`.
5. **Escalabilidad** — Índices por periodo, campaña, estado; FKs con integridad referencial.

## Capas

```
┌─────────────────────────────────────────────────────────────┐
│  CAPA PRESENTACIÓN (React)                                  │
│  NominaForm → insertNomina()  |  PostulantesTable → view    │
└────────────────────────────┬────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────┐
│  CAPA SERVICIO (dataService.js)                             │
│  fetchPostulantes() → v_nominas_consolidado                 │
│  insertPostulante() → postulantes + nominas (transacción)   │
└────────────────────────────┬────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────┐
│  CAPA DATOS (PostgreSQL / Supabase)                         │
│                                                             │
│  CATÁLOGOS          ENTIDADES           OPERACIONAL         │
│  ─────────          ─────────           ───────────         │
│  sedes              postulantes         nominas             │
│  campanas           formadores          asistencias         │
│  reclutadores                               evaluaciones    │
│  motivos_baja                               audit_logs      │
│  grupos_capacitacion                                        │
│  perfiles (auth)                                            │
└─────────────────────────────────────────────────────────────┘
```

## Modelo entidad-relación

### `postulantes` — Identidad de la persona
Datos estables: documento, nombres, contacto, demografía, domicilio, formación.

### `nominas` — Proceso de reclutamiento (1 fila = 1 fila del consolidado Excel)
Por cada ingreso del postulante: periodo, reclutador, sede, campaña, experiencia, pipeline de capacitación, contrato, hitos día 0/1.

### `asistencias_capacitacion` — Registro diario (formador)
Vinculado a `postulante_documento` + `grupo_codigo`.

### `evaluaciones_capacitacion` — Notas finales (formador)

## Mapeo consolidado Excel → tablas

| Columna Excel | Tabla | Campo |
|---------------|-------|-------|
| PERIODO RECLUTADO | nominas | periodo_reclutado |
| SEMANA DE TRABAJO | nominas | semana_trabajo |
| RECLUTADOR | nominas | reclutador_id → reclutadores |
| SEDE | nominas | sede_id → sedes |
| CAMPAÑA | nominas | campana_id → campanas |
| DNI / TIPO DOC | postulantes | documento, tipo_documento |
| APELLIDOS / NOMBRES | postulantes | apellido_paterno, apellido_materno, nombres |
| CELULAR / REF / CORREO | postulantes | celular, celular_referencia, correo |
| GÉNERO / FECHA NAC. | postulantes | genero, fecha_nacimiento |
| ESTADO CIVIL / HIJOS | postulantes | estado_civil, n_hijos |
| NIVEL ACADÉMICO / CARRERA | postulantes | nivel_academico, carrera |
| NACIONALIDAD / RESIDENCIA | postulantes | nacionalidad, lugar_residencia, distrito_residencia, direccion |
| EXP. CALL CENTER | nominas | exp_call_center, exp_tipo_campana, exp_tiempo_campana |
| OTRA EXPERIENCIA | nominas | exp_otra, exp_tiempo_otra |
| CÓMO TE ENTERASTE | nominas | fuente_oferta |
| OBSERVACION | nominas | observacion_reclutamiento |
| GRUPO / MODALIDAD / CONDICIÓN | nominas | grupo_codigo, modalidad, condicion |
| HORARIO / DESCANSO | nominas | horario_gestion, descanso |
| ENVIO DNI / TESTS / VALID. PC | nominas | envio_dni, test_psicologico, validacion_pc, evaluacion_dia_0 |
| FECHAS CAPACITACIÓN / OJT / OP | nominas | fecha_inicio_cap, fecha_fin_cap, fecha_conexion_ojt, fecha_conexion_op |
| PAGO CAPACITACIÓN | nominas | pago_capacitacion |
| CONTRATO / BONOS / REMUNERACIÓN | nominas | tipo_contratacion, razon_social, remuneracion, bono_* |
| CARGO CONTRACTUAL | nominas | cargo_contractual |
| DÍA 0 / DÍA 1 | nominas | dia_0, dia_0_obs, status_dia_1, dia_1, dia_1_obs |

## Flujo roleplay (reclutador)

1. Admin crea catálogos vacíos → agrega sedes, campañas, reclutadores manualmente.
2. Reclutador entra → Nómina → llena datos personales + asignación.
3. Sistema crea `postulantes` + `nominas` con estado `RECLUTADO`.
4. Formador registra asistencias cuando exista grupo.
5. Admin/Directivo consulta dashboard y BI.

## Scripts

| Archivo | Uso |
|---------|-----|
| `schema_v2.sql` | Crear estructura completa |
| `reset_database.sql` | Vaciar datos operacionales (mantiene perfiles/auth) |
| `../scripts/apply-schema-v2.js` | Aplicar schema + reset en Supabase |
