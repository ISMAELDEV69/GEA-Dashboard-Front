-- Actualizar políticas RLS para permitir que coordinadores, supervisores, jefes y cualquier usuario autenticado 
-- gestionen las metas de grupos, reclutadores, formadores y asistencias sin errores de permisos RLS.

-- 1. grupo_reclutadores (Metas y Equipos de Campaña)
DROP POLICY IF EXISTS "Solo autorizados pueden editar metas" ON grupo_reclutadores;
DROP POLICY IF EXISTS "Permitir gestión a usuarios autenticados" ON grupo_reclutadores;
CREATE POLICY "Permitir gestión a usuarios autenticados"
  ON grupo_reclutadores FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- 2. reclutadores
DROP POLICY IF EXISTS "write_reclutadores" ON reclutadores;
DROP POLICY IF EXISTS "Permitir gestión de reclutadores a autenticados" ON reclutadores;
CREATE POLICY "Permitir gestión de reclutadores a autenticados"
  ON reclutadores FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- 3. formadores
DROP POLICY IF EXISTS "write_formadores" ON formadores;
DROP POLICY IF EXISTS "Permitir gestión de formadores a autenticados" ON formadores;
CREATE POLICY "Permitir gestión de formadores a autenticados"
  ON formadores FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- 4. asistencias_capacitacion
DROP POLICY IF EXISTS "delete_asistencias" ON asistencias_capacitacion;
DROP POLICY IF EXISTS "update_asistencias" ON asistencias_capacitacion;
DROP POLICY IF EXISTS "write_asistencias" ON asistencias_capacitacion;
DROP POLICY IF EXISTS "Permitir gestión de asistencias a autenticados" ON asistencias_capacitacion;
CREATE POLICY "Permitir gestión de asistencias a autenticados"
  ON asistencias_capacitacion FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- 5. registros_carga_asistencia
DROP POLICY IF EXISTS "rca_delete" ON registros_carga_asistencia;
DROP POLICY IF EXISTS "rca_select" ON registros_carga_asistencia;
DROP POLICY IF EXISTS "rca_update" ON registros_carga_asistencia;
DROP POLICY IF EXISTS "Permitir gestión de cargas a autenticados" ON registros_carga_asistencia;
CREATE POLICY "Permitir gestión de cargas a autenticados"
  ON registros_carga_asistencia FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);
