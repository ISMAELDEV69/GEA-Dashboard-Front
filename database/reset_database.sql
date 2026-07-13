-- ============================================================
-- RESET: Vaciar datos operacionales para empezar de cero
-- NO elimina perfiles ni usuarios de auth
-- Ejecutar DESPUÉS de schema_v2.sql
-- ============================================================

-- Orden por dependencias FK
TRUNCATE TABLE audit_logs RESTART IDENTITY CASCADE;
TRUNCATE TABLE evaluaciones_capacitacion RESTART IDENTITY CASCADE;
TRUNCATE TABLE asistencias_capacitacion RESTART IDENTITY CASCADE;
TRUNCATE TABLE nominas CASCADE;
TRUNCATE TABLE postulantes CASCADE;
TRUNCATE TABLE grupos_capacitacion CASCADE;
TRUNCATE TABLE campana_reclutadores RESTART IDENTITY CASCADE;
TRUNCATE TABLE formadores CASCADE;
TRUNCATE TABLE reclutadores RESTART IDENTITY CASCADE;
TRUNCATE TABLE campanas RESTART IDENTITY CASCADE;
TRUNCATE TABLE sedes RESTART IDENTITY CASCADE;

-- Verificar vacío
SELECT 'sedes' AS tabla, COUNT(*) AS registros FROM sedes
UNION ALL SELECT 'campanas', COUNT(*) FROM campanas
UNION ALL SELECT 'reclutadores', COUNT(*) FROM reclutadores
UNION ALL SELECT 'postulantes', COUNT(*) FROM postulantes
UNION ALL SELECT 'nominas', COUNT(*) FROM nominas
UNION ALL SELECT 'asistencias', COUNT(*) FROM asistencias_capacitacion
UNION ALL SELECT 'evaluaciones', COUNT(*) FROM evaluaciones_capacitacion
UNION ALL SELECT 'audit_logs', COUNT(*) FROM audit_logs
UNION ALL SELECT 'perfiles (conservados)', COUNT(*) FROM perfiles;
