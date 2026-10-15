-- ==============================================================================
-- Script de Corrección y Blindaje: Supervisor SANDRA CAVERO
-- Propósito: Garantizar que Sandra Cavero figure ÚNICAMENTE en
--            Segmento: CLARO PERU
--            Campaña: RETENCIONES FIJA
-- ==============================================================================

-- 1. Eliminar cualquier registro en opciones_homologadas donde figure Sandra Cavero
-- en segmentos ajenos (ej. CLARO CHILE, LIPIGAS) o campañas que no sean Retenciones Fija.
DELETE FROM public.opciones_homologadas
WHERE supervisor ILIKE '%CAVERO%'
  AND (
    segmento ILIKE '%CHILE%'
    OR segmento ILIKE '%LIPIGAS%'
    OR (campana NOT ILIKE '%RETENCION%' OR campana NOT ILIKE '%FIJA%')
  );

-- 2. Limpiar espacios o variaciones de nombre de Sandra Cavero en las filas restantes
UPDATE public.opciones_homologadas
SET 
  supervisor = 'SANDRA CAVERO',
  segmento = 'CLARO PERU',
  campana = 'RETENCIONES FIJA'
WHERE supervisor ILIKE '%CAVERO%';

-- 3. Si no existe ningún registro para Sandra Cavero en CLARO PERU / RETENCIONES FIJA, insertarlo
INSERT INTO public.opciones_homologadas (sede, segmento, campana, supervisor, motivo)
SELECT 'JOCKEY', 'CLARO PERU', 'RETENCIONES FIJA', 'SANDRA CAVERO', 'OFRECIMIENTO DE CAMPAÑA'
WHERE NOT EXISTS (
  SELECT 1 FROM public.opciones_homologadas 
  WHERE supervisor = 'SANDRA CAVERO' 
    AND segmento = 'CLARO PERU' 
    AND campana = 'RETENCIONES FIJA'
);

-- 4. Actualizar el perfil del usuario Sandra Cavero (DNI 43614771 o usuario CAVEROSM)
-- para que su segmento asignado sea estrictamente 'CLARO PERU'
UPDATE public.perfiles
SET segmento = 'CLARO PERU'
WHERE documento = '43614771'
   OR UPPER(nombre) LIKE '%CAVERO%'
   OR UPPER(COALESCE(email, '')) LIKE '%CAVERO%';

-- 5. Consulta de verificación
SELECT id, sede, segmento, campana, supervisor, motivo 
FROM public.opciones_homologadas 
WHERE supervisor ILIKE '%CAVERO%';
