-- ============================================================
-- CORRECCIÓN DE POLÍTICAS RLS
-- Permite lectura a todos (incluyendo anon key desde la app)
-- Ejecuta esto en el SQL Editor de Supabase
-- ============================================================

-- Catálogos: lectura libre para anon y authenticated
DROP POLICY IF EXISTS select_sedes ON sedes;
DROP POLICY IF EXISTS select_campanas ON campanas;
DROP POLICY IF EXISTS select_reclutadores ON reclutadores;
DROP POLICY IF EXISTS select_formadores ON formadores;
DROP POLICY IF EXISTS select_grupos ON grupos_capacitacion;
DROP POLICY IF EXISTS select_motivos ON motivos_baja;

CREATE POLICY select_sedes ON sedes FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY select_campanas ON campanas FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY select_reclutadores ON reclutadores FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY select_formadores ON formadores FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY select_grupos ON grupos_capacitacion FOR SELECT TO anon, authenticated USING (true);

-- Habilitar RLS en motivos_baja si no está
ALTER TABLE motivos_baja ENABLE ROW LEVEL SECURITY;
CREATE POLICY select_motivos ON motivos_baja FOR SELECT TO anon, authenticated USING (true);

-- Postulantes: lectura libre para anon (la app no requiere login)
DROP POLICY IF EXISTS select_postulantes ON postulantes;
DROP POLICY IF EXISTS insert_postulantes ON postulantes;
DROP POLICY IF EXISTS update_postulantes ON postulantes;

CREATE POLICY select_postulantes ON postulantes FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY insert_postulantes ON postulantes FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY update_postulantes ON postulantes FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

-- Asistencias
DROP POLICY IF EXISTS select_asistencias ON asistencias_capacitacion;
DROP POLICY IF EXISTS insert_asistencias ON asistencias_capacitacion;
DROP POLICY IF EXISTS update_asistencias ON asistencias_capacitacion;
DROP POLICY IF EXISTS delete_asistencias ON asistencias_capacitacion;

CREATE POLICY select_asistencias ON asistencias_capacitacion FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY insert_asistencias ON asistencias_capacitacion FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY update_asistencias ON asistencias_capacitacion FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY delete_asistencias ON asistencias_capacitacion FOR DELETE TO anon, authenticated USING (true);

-- Evaluaciones
DROP POLICY IF EXISTS select_evaluaciones ON evaluaciones_capacitacion;
DROP POLICY IF EXISTS insert_evaluaciones ON evaluaciones_capacitacion;
DROP POLICY IF EXISTS update_evaluaciones ON evaluaciones_capacitacion;

CREATE POLICY select_evaluaciones ON evaluaciones_capacitacion FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY insert_evaluaciones ON evaluaciones_capacitacion FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY update_evaluaciones ON evaluaciones_capacitacion FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

-- Audit logs: lectura libre
DROP POLICY IF EXISTS select_audit_logs ON audit_logs;
CREATE POLICY select_audit_logs ON audit_logs FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY insert_audit_logs ON audit_logs FOR INSERT TO anon, authenticated WITH CHECK (true);
