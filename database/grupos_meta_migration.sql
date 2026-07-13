-- Migración: metadata editable en panel de asistencia (semana + permisos)
ALTER TABLE grupos_capacitacion
  ADD COLUMN IF NOT EXISTS semana_trabajo INTEGER CHECK (semana_trabajo BETWEEN 1 AND 53);

-- Formadores y admins pueden gestionar grupos de capacitación
DROP POLICY IF EXISTS write_grupos ON grupos_capacitacion;
CREATE POLICY write_grupos ON grupos_capacitacion FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM perfiles WHERE id = auth.uid() AND rol IN ('admin','formador')))
  WITH CHECK (EXISTS (SELECT 1 FROM perfiles WHERE id = auth.uid() AND rol IN ('admin','formador')));

-- Formadores pueden actualizar segmento de campaña desde asistencia
DROP POLICY IF EXISTS write_campanas ON campanas;
CREATE POLICY write_campanas ON campanas FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM perfiles WHERE id = auth.uid() AND rol IN ('admin','reclutador','formador')))
  WITH CHECK (EXISTS (SELECT 1 FROM perfiles WHERE id = auth.uid() AND rol IN ('admin','reclutador','formador')));

-- Formadores y admins pueden gestionar catálogo de capacitadores
DROP POLICY IF EXISTS write_formadores ON formadores;
CREATE POLICY write_formadores ON formadores FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM perfiles WHERE id = auth.uid() AND rol IN ('admin','formador')))
  WITH CHECK (EXISTS (SELECT 1 FROM perfiles WHERE id = auth.uid() AND rol IN ('admin','formador')));

-- Formadores pueden sincronizar semana/grupo en nóminas activas
DROP POLICY IF EXISTS update_nominas ON nominas;
CREATE POLICY update_nominas ON nominas FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM perfiles WHERE id = auth.uid() AND rol IN ('admin','reclutador','formador')));
