-- ====================================================================
-- SCRIPT DE SEGURIDAD RLS - PORTAL WFM (Supabase)
-- ====================================================================

-- 1. Función canónica segura para verificar si el usuario es Administrador
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (auth.jwt() -> 'app_metadata' ->> 'rol') = 'admin'
    OR EXISTS (
      SELECT 1 FROM public.perfiles
      WHERE id = auth.uid() AND rol = 'admin'
    ),
    false
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated;


-- ====================================================================
-- TABLA 1: public.module_permissions
-- ====================================================================
ALTER TABLE public.module_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permitir lectura de permisos a todos" ON public.module_permissions;
DROP POLICY IF EXISTS "Permitir modificacion de permisos a administradores" ON public.module_permissions;

-- Lectura: Disponible para que la interfaz sepa qué módulos renderizar
CREATE POLICY "Permitir lectura de permisos a todos"
ON public.module_permissions
FOR SELECT
TO anon, authenticated
USING (true);

-- Escritura (INSERT, UPDATE, DELETE): Exclusivo para administradores
CREATE POLICY "Permitir modificacion de permisos a administradores"
ON public.module_permissions
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());


-- ====================================================================
-- TABLA 2: public.opciones_homologadas
-- ====================================================================
ALTER TABLE public.opciones_homologadas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permitir lectura de catalogos homologados" ON public.opciones_homologadas;
DROP POLICY IF EXISTS "Permitir administracion de homologadas a admins" ON public.opciones_homologadas;

-- Lectura: Disponible para llenar listas desplegables en formularios
CREATE POLICY "Permitir lectura de catalogos homologados"
ON public.opciones_homologadas
FOR SELECT
TO anon, authenticated
USING (true);

-- Escritura: Exclusivo para administradores
CREATE POLICY "Permitir administracion de homologadas a admins"
ON public.opciones_homologadas
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());


-- ====================================================================
-- TABLA 3: public.config_roles (Corrección de vulnerabilidad crítica)
-- ====================================================================
ALTER TABLE public.config_roles ENABLE ROW LEVEL SECURITY;

-- Eliminar las políticas vulnerables que usaban user_metadata
DROP POLICY IF EXISTS "Permitir lectura a todos los usuarios autenticados" ON public.config_roles;
DROP POLICY IF EXISTS "Permitir insercion a administradores" ON public.config_roles;
DROP POLICY IF EXISTS "Permitir actualizacion a administradores" ON public.config_roles;
DROP POLICY IF EXISTS "Permitir borrado a administradores" ON public.config_roles;

-- Lectura: Todos los usuarios autenticados y anónimos
CREATE POLICY "Permitir lectura a todos los usuarios autenticados"
ON public.config_roles
FOR SELECT
TO anon, authenticated
USING (true);

-- Inserción: Solo administradores validados de forma segura
CREATE POLICY "Permitir insercion a administradores"
ON public.config_roles
FOR INSERT
TO authenticated
WITH CHECK (public.is_admin());

-- Actualización: Solo administradores validados de forma segura
CREATE POLICY "Permitir actualizacion a administradores"
ON public.config_roles
FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- Borrado: Solo administradores validados de forma segura
CREATE POLICY "Permitir borrado a administradores"
ON public.config_roles
FOR DELETE
TO authenticated
USING (public.is_admin());
