-- ============================================================
-- Migración: Asignación de Segmento a Perfiles y RLS
-- Fecha: 2026-08-26
-- ============================================================

-- 1. Agregar columna segmento a perfiles (NULL por defecto para roles globales)
ALTER TABLE perfiles 
  ADD COLUMN IF NOT EXISTS segmento VARCHAR(100);

COMMENT ON COLUMN perfiles.segmento IS 'Segmento asignado para rol supervisor_capacitacion (ej. CLARO CHILE, CLARO PERU). NULL para roles globales.';

-- 2. Asegurar que get_my_profile() devuelva el perfil completo con segmento
CREATE OR REPLACE FUNCTION get_my_profile()
RETURNS perfiles AS $$
DECLARE 
  result perfiles; 
  v_meta JSONB; 
  v_rol TEXT;
  v_seg TEXT;
BEGIN
  SELECT * INTO result FROM perfiles WHERE id = auth.uid();
  IF FOUND THEN
    RETURN result;
  END IF;

  -- Crear perfil básico si no existe
  v_meta := auth.jwt() -> 'user_metadata';
  v_rol := COALESCE(v_meta->>'rol', auth.jwt()->'app_metadata'->>'rol', 'visor');
  v_seg := v_meta->>'segmento';

  INSERT INTO perfiles (id, nombre, rol, segmento) VALUES (
    auth.uid(),
    COALESCE(v_meta->>'nombre', v_meta->>'name', split_part(auth.jwt()->>'email', '@', 1)),
    v_rol::app_role,
    v_seg
  )
  ON CONFLICT (id) DO UPDATE SET 
    segmento = EXCLUDED.segmento
  RETURNING * INTO result;

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. RLS: Blindaje en capacidad_rys
-- Los administradores, jefes y coordinadores tienen acceso total.
-- Los supervisores de capacitación solo pueden actualizar grupos de su propio segmento.
DROP POLICY IF EXISTS "supervisor_segmento_capacidad" ON capacidad_rys;
CREATE POLICY "supervisor_segmento_capacidad" ON capacidad_rys
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM perfiles 
      WHERE id = auth.uid() 
        AND rol IN ('admin', 'jefe_capacitacion', 'jefe_rys', 'coordinador_rys', 'visor')
    )
    OR (
      (SELECT rol FROM perfiles WHERE id = auth.uid()) = 'supervisor_capacitacion'
      AND (
        (SELECT p.segmento FROM perfiles p WHERE p.id = auth.uid()) IS NULL
        OR UPPER(TRIM(COALESCE(capacidad_rys.segmento, ''))) = UPPER(TRIM((SELECT p.segmento FROM perfiles p WHERE p.id = auth.uid())))
      )
    )
    OR EXISTS (
      SELECT 1 FROM perfiles WHERE id = auth.uid() AND rol = 'formador'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM perfiles 
      WHERE id = auth.uid() 
        AND rol IN ('admin', 'jefe_capacitacion', 'jefe_rys', 'coordinador_rys')
    )
    OR (
      (SELECT rol FROM perfiles WHERE id = auth.uid()) = 'supervisor_capacitacion'
      AND (
        (SELECT p.segmento FROM perfiles p WHERE p.id = auth.uid()) IS NULL
        OR UPPER(TRIM(COALESCE(capacidad_rys.segmento, ''))) = UPPER(TRIM((SELECT p.segmento FROM perfiles p WHERE p.id = auth.uid())))
      )
    )
    OR EXISTS (
      SELECT 1 FROM perfiles WHERE id = auth.uid() AND rol = 'formador'
    )
  );
