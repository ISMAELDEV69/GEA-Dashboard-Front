-- ==============================================================================
-- FIX: Infinite Recursion en RLS de 'perfiles' y optimización de políticas
-- Error resuelto: 42P17 infinite recursion detected in policy for relation "perfiles"
-- ==============================================================================

-- 1. Habilitar RLS en perfiles
ALTER TABLE public.perfiles ENABLE ROW LEVEL SECURITY;

-- 2. Eliminar todas las políticas previas que puedan causar recursión en perfiles
DROP POLICY IF EXISTS "select_perfiles" ON public.perfiles;
DROP POLICY IF EXISTS "insert_perfiles" ON public.perfiles;
DROP POLICY IF EXISTS "update_perfiles" ON public.perfiles;
DROP POLICY IF EXISTS "perfiles_select" ON public.perfiles;
DROP POLICY IF EXISTS "perfiles_read" ON public.perfiles;
DROP POLICY IF EXISTS "perfiles_read_all" ON public.perfiles;
DROP POLICY IF EXISTS "perfiles_write_admin" ON public.perfiles;
DROP POLICY IF EXISTS "perfiles_update_policy" ON public.perfiles;

-- 3. Crear políticas directas y sin auto-referencia (Cero recursión)
-- Lectura pública para cualquier usuario autenticado (necesario para resolver roles/nombres en toda la app)
CREATE POLICY "select_perfiles" ON public.perfiles 
  FOR SELECT TO authenticated 
  USING (true);

-- Inserción: El propio usuario o service_role
CREATE POLICY "insert_perfiles" ON public.perfiles 
  FOR INSERT TO authenticated 
  WITH CHECK (id = auth.uid() OR auth.jwt() ->> 'role' = 'service_role');

-- Actualización: El propio usuario puede actualizar su fila, o un admin validado por JWT
CREATE POLICY "update_perfiles" ON public.perfiles 
  FOR UPDATE TO authenticated 
  USING (
    id = auth.uid() 
    OR auth.jwt() ->> 'role' = 'service_role'
    OR (auth.jwt() -> 'user_metadata' ->> 'rol') = 'admin'
  );

-- 4. Asegurar que la tabla descuentos tenga RLS habilitado y sin errores
ALTER TABLE public.descuentos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Descuentos Select" ON public.descuentos;
CREATE POLICY "Descuentos Select" ON public.descuentos FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Descuentos Insert" ON public.descuentos;
CREATE POLICY "Descuentos Insert" ON public.descuentos FOR ALL TO authenticated USING (true) WITH CHECK (true);
