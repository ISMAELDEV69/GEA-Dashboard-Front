-- ==============================================================================
-- Tabla: public.liquidaciones_pagos_capacitacion
-- Propósito: Trazabilidad inmutable de pagos y cuotas liquidadas de capacitación
--            (Días de Capacitación y Bonos diferidos M1 a M4 por mes de afectación)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.liquidaciones_pagos_capacitacion (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lote_id VARCHAR(100) NOT NULL,
  periodo VARCHAR(10),
  mes_pago VARCHAR(10),
  semana_trabajo INT,
  segmento VARCHAR(100),
  campana VARCHAR(100),
  grupo_codigo VARCHAR(50),
  documento VARCHAR(20) NOT NULL,
  nombre_completo VARCHAR(200),
  dias_asistidos INT DEFAULT 0,
  asistencia_perfecta BOOLEAN DEFAULT false,
  monto_dias_capa NUMERIC(10, 2) DEFAULT 0,
  bono_bienvenida NUMERIC(10, 2) DEFAULT 0,
  bono_asistencia_perfecta NUMERIC(10, 2) DEFAULT 0,
  bono_permanencia_total NUMERIC(10, 2) DEFAULT 0,
  cuota_numero INT DEFAULT 1,
  monto_cuota_permanencia NUMERIC(10, 2) DEFAULT 0,
  total_general NUMERIC(10, 2) DEFAULT 0,
  cerrado_por VARCHAR(100),
  cerrado_at TIMESTAMPTZ DEFAULT NOW(),
  notas_lote TEXT
);

CREATE INDEX IF NOT EXISTS idx_liq_pagos_doc ON public.liquidaciones_pagos_capacitacion(documento);
CREATE INDEX IF NOT EXISTS idx_liq_pagos_lote ON public.liquidaciones_pagos_capacitacion(lote_id);
CREATE INDEX IF NOT EXISTS idx_liq_pagos_periodo ON public.liquidaciones_pagos_capacitacion(periodo);
CREATE INDEX IF NOT EXISTS idx_liq_pagos_mes ON public.liquidaciones_pagos_capacitacion(mes_pago);

ALTER TABLE public.liquidaciones_pagos_capacitacion ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permitir lectura de liquidaciones autenticados" ON public.liquidaciones_pagos_capacitacion;
CREATE POLICY "Permitir lectura de liquidaciones autenticados"
  ON public.liquidaciones_pagos_capacitacion FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Permitir insercion de liquidaciones autorizados" ON public.liquidaciones_pagos_capacitacion;
CREATE POLICY "Permitir insercion de liquidaciones autorizados"
  ON public.liquidaciones_pagos_capacitacion FOR INSERT TO authenticated WITH CHECK (true);
