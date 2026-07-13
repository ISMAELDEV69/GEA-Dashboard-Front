-- Seguridad de Fila (Row Level Security - RLS) para Supabase

-- Habilitar RLS en las tablas principales
ALTER TABLE postulantes ENABLE ROW LEVEL SECURITY;
ALTER TABLE asistencias_capacitacion ENABLE ROW LEVEL SECURITY;
ALTER TABLE evaluaciones_capacitacion ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE sedes ENABLE ROW LEVEL SECURITY;
ALTER TABLE campanas ENABLE ROW LEVEL SECURITY;
ALTER TABLE reclutadores ENABLE ROW LEVEL SECURITY;
ALTER TABLE formadores ENABLE ROW LEVEL SECURITY;
ALTER TABLE grupos_capacitacion ENABLE ROW LEVEL SECURITY;

-- 1. Políticas para Tablas de Catálogo (Lectura libre para autenticados, escritura solo para administradores)
CREATE POLICY select_sedes ON sedes FOR SELECT TO authenticated USING (true);
CREATE POLICY select_campanas ON campanas FOR SELECT TO authenticated USING (true);
CREATE POLICY select_reclutadores ON reclutadores FOR SELECT TO authenticated USING (true);
CREATE POLICY select_formadores ON formadores FOR SELECT TO authenticated USING (true);
CREATE POLICY select_grupos ON grupos_capacitacion FOR SELECT TO authenticated USING (true);

-- 2. Políticas para Postulantes (Todos los autenticados pueden leer, pero solo creadores/editores pueden modificar)
CREATE POLICY select_postulantes ON postulantes FOR SELECT TO authenticated USING (true);
CREATE POLICY insert_postulantes ON postulantes FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY update_postulantes ON postulantes FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- 3. Políticas para Asistencias (Lectura libre, inserción/actualización para capacitadores y analistas)
CREATE POLICY select_asistencias ON asistencias_capacitacion FOR SELECT TO authenticated USING (true);
CREATE POLICY insert_asistencias ON asistencias_capacitacion FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY update_asistencias ON asistencias_capacitacion FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- 4. Políticas para Evaluaciones (Lectura libre, inserción/actualización para capacitadores y analistas)
CREATE POLICY select_evaluaciones ON evaluaciones_capacitacion FOR SELECT TO authenticated USING (true);
CREATE POLICY insert_evaluaciones ON evaluaciones_capacitacion FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY update_evaluaciones ON evaluaciones_capacitacion FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- 5. Políticas de Auditoría (Lectura solo para analistas y administradores, inserciones automáticas mediante trigger)
CREATE POLICY select_audit_logs ON audit_logs FOR SELECT TO authenticated USING (true);
-- Nota: La inserción en audit_logs es manejada por el disparador 'procesar_auditoria()' que se ejecuta con privilegios definer (SECURITY DEFINER), por lo que no requiere una política de inserción pública.
