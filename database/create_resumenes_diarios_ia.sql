-- ============================================================================
-- TABLA: resumenes_diarios_ia
-- Almacena los resúmenes diarios ejecutivos estructurados generados por OREO
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.resumenes_diarios_ia (
  fecha DATE PRIMARY KEY,
  json_resultado JSONB NOT NULL,
  generado_en TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Habilitar Row Level Security (RLS)
ALTER TABLE public.resumenes_diarios_ia ENABLE ROW LEVEL SECURITY;

-- Políticas de lectura
DROP POLICY IF EXISTS "Lectura pública/autenticada de resumenes diarios" ON public.resumenes_diarios_ia;
CREATE POLICY "Lectura pública/autenticada de resumenes diarios"
  ON public.resumenes_diarios_ia
  FOR SELECT
  USING (true);

-- Políticas de escritura (insert/update/delete)
DROP POLICY IF EXISTS "Escritura de resumenes diarios" ON public.resumenes_diarios_ia;
CREATE POLICY "Escritura de resumenes diarios"
  ON public.resumenes_diarios_ia
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Índice para acelerar consultas por fecha descendente
CREATE INDEX IF NOT EXISTS idx_resumenes_diarios_ia_fecha ON public.resumenes_diarios_ia (fecha DESC);
