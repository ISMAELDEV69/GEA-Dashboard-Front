---
name: supabase-postgres-opt
description: Best practices for Supabase PostgreSQL database performance, PostgREST query projections, compound indexes, RPC functions, and efficient caching in GEA Dashboard.
---

# Supabase & PostgreSQL Optimization Skill — GEA Dashboard

Esta habilidad guía al agente en la escritura de consultas de alto rendimiento y optimización de base de datos para Supabase.

## 1. Proyección Estricta de Columnas (Prohibido `SELECT *` Masivo)
- Nunca consultar `select('*')` en vistas con miles de filas como `v_nominas_consolidado` o `consolidado_asistencias`.
- Solicitar únicamente las columnas indispensables para la vista:
  ```javascript
  const { data } = await supabase
    .from('nominas')
    .select('documento, campana, grupo_codigo, estado, dia_0, dia_1, created_at')
    .range(0, 99)
  ```

## 2. Paginación en Servidor (Server-Side Pagination)
- Para vistas con grandes volúmenes, utilizar `.range(from, to)` con pasos de 50 o 100 registros.
- Evitar `while(hasMore)` cliente que descargue toda la tabla de una sola vez si solo se mostrará una página.

## 3. Índices Compuestos en PostgreSQL
- Toda consulta que filtre por más de una columna frecuente debe contar con un índice compuesto:
  ```sql
  CREATE INDEX IF NOT EXISTS idx_nominas_campana_grupo ON nominas(campana, grupo_codigo);
  CREATE INDEX IF NOT EXISTS idx_asistencias_grupo_campana ON consolidado_asistencias(codigo_grupo, campana);
  CREATE INDEX IF NOT EXISTS idx_asistencias_documento ON consolidado_asistencias(documento);
  ```

## 4. Funciones RPC para Procesos Masivos
- No realizar bucles de inserción / actualización en JavaScript cuando se puedan encapsular en una función SQL (`LANGUAGE plpgsql`) ejecutada dentro de una sola transacción en el motor de la base de datos.
