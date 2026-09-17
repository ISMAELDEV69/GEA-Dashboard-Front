-- Lectura autenticada de cobertura_dotacion (snapshot WFM).
-- Sin escritura: la tabla se carga fuera de la app.

ALTER TABLE public.cobertura_dotacion ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.cobertura_dotacion FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.cobertura_dotacion FROM authenticated;
GRANT SELECT ON TABLE public.cobertura_dotacion TO authenticated;

DROP POLICY IF EXISTS "Lectura cobertura_dotacion" ON public.cobertura_dotacion;
CREATE POLICY "Lectura cobertura_dotacion"
ON public.cobertura_dotacion
FOR SELECT
TO authenticated
USING (true);

CREATE INDEX IF NOT EXISTS idx_cobertura_dotacion_periodo_campana
  ON public.cobertura_dotacion ("PERIODO", "CAMPAÑA");
CREATE INDEX IF NOT EXISTS idx_cobertura_dotacion_periodo_semana
  ON public.cobertura_dotacion ("PERIODO", "SEMANA");
