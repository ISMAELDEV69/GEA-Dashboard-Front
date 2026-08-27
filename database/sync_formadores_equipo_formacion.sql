-- ==============================================================================
-- SINCRONIZACIÓN: equipo_formacion <-> formadores
-- Asegura que todos los 75 formadores/supervisores estén en ambas tablas
-- con sus bonos, usuarios Alix, sedes y cargos.
-- ==============================================================================

-- 1. Sincronizar desde formadores hacia equipo_formacion (los que falten)
INSERT INTO public.equipo_formacion (
  documento,
  nombres_completos,
  datos_completos,
  sede,
  segmento,
  subcampana,
  cargo_contractual,
  cargo_funcional,
  estado,
  fecha_inicio,
  fecha_cese
)
SELECT 
  f.documento,
  f.nombre_completo,
  f.nombre_completo,
  f.sede,
  f.segmento,
  f.subcampana,
  f.cargo_contractual,
  f.cargo_funcional,
  f.estado,
  f.fecha_inicio,
  f.fecha_cese
FROM public.formadores f
ON CONFLICT (documento) DO UPDATE SET
  sede              = EXCLUDED.sede,
  segmento          = EXCLUDED.segmento,
  subcampana        = EXCLUDED.subcampana,
  cargo_contractual = EXCLUDED.cargo_contractual,
  cargo_funcional   = EXCLUDED.cargo_funcional,
  estado            = EXCLUDED.estado,
  fecha_inicio      = EXCLUDED.fecha_inicio;

-- 2. Habilitar RLS en equipo_formacion para acceso fluido
ALTER TABLE public.equipo_formacion ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "equipo_formacion_read" ON public.equipo_formacion;
CREATE POLICY "equipo_formacion_read" ON public.equipo_formacion FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "equipo_formacion_write" ON public.equipo_formacion;
CREATE POLICY "equipo_formacion_write" ON public.equipo_formacion FOR ALL TO authenticated USING (true) WITH CHECK (true);
