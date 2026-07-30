-- Crear función que convierte a mayúsculas
CREATE OR REPLACE FUNCTION force_names_uppercase()
RETURNS TRIGGER AS $$
BEGIN
  -- Convertir campos a mayúsculas si existen (se aplica a equipo_reclutamiento y equipo_formacion)
  IF NEW.nombres IS NOT NULL THEN
    NEW.nombres = UPPER(NEW.nombres);
  END IF;
  
  IF NEW.apellido_paterno IS NOT NULL THEN
    NEW.apellido_paterno = UPPER(NEW.apellido_paterno);
  END IF;
  
  IF NEW.apellido_materno IS NOT NULL THEN
    NEW.apellido_materno = UPPER(NEW.apellido_materno);
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para la tabla equipo_reclutamiento
DROP TRIGGER IF EXISTS trg_uppercase_reclutamiento ON public.equipo_reclutamiento;
CREATE TRIGGER trg_uppercase_reclutamiento
BEFORE INSERT OR UPDATE ON public.equipo_reclutamiento
FOR EACH ROW EXECUTE FUNCTION force_names_uppercase();

-- Trigger para la tabla equipo_formacion
DROP TRIGGER IF EXISTS trg_uppercase_formacion ON public.equipo_formacion;
CREATE TRIGGER trg_uppercase_formacion
BEFORE INSERT OR UPDATE ON public.equipo_formacion
FOR EACH ROW EXECUTE FUNCTION force_names_uppercase();

-- Opcional: Actualizar datos existentes de una vez
UPDATE public.equipo_reclutamiento 
SET nombres = UPPER(nombres), apellido_paterno = UPPER(apellido_paterno), apellido_materno = UPPER(apellido_materno);

UPDATE public.equipo_formacion 
SET nombres = UPPER(nombres), apellido_paterno = UPPER(apellido_paterno), apellido_materno = UPPER(apellido_materno);
