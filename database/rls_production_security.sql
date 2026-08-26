-- ==============================================================================
-- 1. FUNCIONES AUXILIARES DE ROL (SECURITY DEFINER)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT rol::TEXT FROM public.perfiles WHERE id = auth.uid() LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_role() TO authenticated;

-- ==============================================================================
-- 2. OPCIONES_HOMOLOGADAS (Catálogo)
-- ==============================================================================
ALTER TABLE public.opciones_homologadas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Lectura opciones_homologadas" ON public.opciones_homologadas;
CREATE POLICY "Lectura opciones_homologadas" 
ON public.opciones_homologadas FOR SELECT 
TO authenticated 
USING (true);

DROP POLICY IF EXISTS "Admin gestiona opciones_homologadas" ON public.opciones_homologadas;
CREATE POLICY "Admin gestiona opciones_homologadas" 
ON public.opciones_homologadas FOR ALL 
TO authenticated 
USING (public.is_admin()) 
WITH CHECK (public.is_admin());

-- ==============================================================================
-- 3. CAPACIDAD_RYS (Planificación y Metas)
-- ==============================================================================
ALTER TABLE public.capacidad_rys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Lectura capacidad_rys" ON public.capacidad_rys;
CREATE POLICY "Lectura capacidad_rys" 
ON public.capacidad_rys FOR SELECT 
TO authenticated 
USING (true);

DROP POLICY IF EXISTS "Escritura capacidad_rys" ON public.capacidad_rys;
CREATE POLICY "Escritura capacidad_rys" 
ON public.capacidad_rys FOR ALL 
TO authenticated 
USING (
  public.is_admin() OR 
  public.get_user_role() IN ('jefe_rys', 'coordinador_rys', 'jefe_capacitacion')
) 
WITH CHECK (
  public.is_admin() OR 
  public.get_user_role() IN ('jefe_rys', 'coordinador_rys', 'jefe_capacitacion')
);

-- ==============================================================================
-- 4. NOMINAS (Lista Explícita de Roles)
-- ==============================================================================
ALTER TABLE public.nominas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Lectura nominas por roles autorizados" ON public.nominas;
CREATE POLICY "Lectura nominas por roles autorizados" 
ON public.nominas FOR SELECT 
TO authenticated 
USING (
  public.is_admin() OR 
  public.get_user_role() IN (
    'jefe_rys', 
    'coordinador_rys', 
    'supervisor_capacitacion', 
    'jefe_capacitacion', 
    'formador', 
    'reclutador', 
    'visor'
  )
);

DROP POLICY IF EXISTS "Escritura nominas por roles de gestion" ON public.nominas;
CREATE POLICY "Escritura nominas por roles de gestion" 
ON public.nominas FOR ALL 
TO authenticated 
USING (
  public.is_admin() OR 
  public.get_user_role() IN (
    'jefe_rys', 
    'coordinador_rys', 
    'reclutador', 
    'supervisor_capacitacion', 
    'jefe_capacitacion'
  )
) 
WITH CHECK (
  public.is_admin() OR 
  public.get_user_role() IN (
    'jefe_rys', 
    'coordinador_rys', 
    'reclutador', 
    'supervisor_capacitacion', 
    'jefe_capacitacion'
  )
);
