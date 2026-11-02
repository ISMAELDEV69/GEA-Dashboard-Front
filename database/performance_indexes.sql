-- ==============================================================================
-- ÍNDICES COMPUESTOS DE ALTO RENDIMIENTO PARA GEA DASHBOARD (VERIFICADOS)
-- Optimiza consultas frecuentes de Asistencia, Nóminas, Capacidad, Descuentos y Maquetas
-- ==============================================================================

-- 1. CONSOLIDADO DE ASISTENCIAS (Tabla más pesada del sistema)
-- Acelera los filtros por cohorte y sigla (ej. buscar I-OP o Bajas) en un rango de fechas
CREATE INDEX IF NOT EXISTS idx_asistencias_grupo_sigla_fecha 
ON public.consolidado_asistencias (codigo_grupo, sigla, fecha_registro_asistencia);

-- Acelera búsqueda por documento y grupo para deduplicaciones y cruces con nómina
CREATE INDEX IF NOT EXISTS idx_asistencias_doc_grupo 
ON public.consolidado_asistencias (documento, codigo_grupo);

-- 2. CAPACIDAD RYS (Planificación de Grupos)
-- Acelera la búsqueda de cohortes oficiales por periodo de ingreso operativo (ej. '202610')
CREATE INDEX IF NOT EXISTS idx_capacidad_periodo_ingreso_op 
ON public.capacidad_rys (periodo_ingreso_op);

-- Acelera joins por código de cohorte
CREATE INDEX IF NOT EXISTS idx_capacidad_codigo 
ON public.capacidad_rys (codigo);

-- 3. MAQUETA RECLUTADORES BASE (Módulo Financiero y Bonos)
-- Acelera la carga de la base operativa de 16 columnas por periodo y cohorte
CREATE INDEX IF NOT EXISTS idx_maqueta_base_periodo_gpe 
ON public.maqueta_reclutadores_base (periodo_efectivo, codigo_gpe);

-- Acelera la agrupación por analista reclutador
CREATE INDEX IF NOT EXISTS idx_maqueta_base_analista 
ON public.maqueta_reclutadores_base (analista_reclutador);

-- 4. NÓMINAS DE POSTULANTES
-- Acelera el cruce de postulantes por grupo y reclutador
CREATE INDEX IF NOT EXISTS idx_nominas_grupo_reclutador 
ON public.nominas (grupo_codigo, reclutador);

-- Acelera búsquedas por DNI
CREATE INDEX IF NOT EXISTS idx_nominas_documento 
ON public.nominas (documento);

-- 5. DESCUENTOS (Exclusiones de Asistencia y Aprobaciones)
-- Acelera la validación de si un postulante tiene descuento aprobado en su grupo
CREATE INDEX IF NOT EXISTS idx_descuentos_dni_grupo 
ON public.descuentos (dni_ce, grupo_cap);

-- 6. MAQUETA LIQUIDACIONES Y CIERRES
-- Acelera la consulta y almacenamiento de los cierres mensuales por periodo
CREATE INDEX IF NOT EXISTS idx_maqueta_liq_periodo 
ON public.maqueta_reclutadores_liquidaciones (periodo);
