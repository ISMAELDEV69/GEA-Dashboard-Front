-- ==============================================================================
-- SCRIPT: Retroalimentación y Reparación de Datos en Nóminas de Bolsa de Capa
-- Propósito: Rellenar automáticamente los campos biográficos/demográficos
-- (correo, fecha_nacimiento, genero, estado_civil, n_hijos, nivel_academico,
-- carrera, lugar_residencia, distrito_residencia, direccion_domicilio, exp_call_center, etc.)
-- en aquellos registros de Bolsa de Capa (TRASLADOS / RECUPERADOS) que quedaron en null,
-- tomando la información histórica más reciente del mismo postulante (por DNI).
-- ==============================================================================

UPDATE public.nominas n
SET
  tipo_documento      = COALESCE(NULLIF(TRIM(n.tipo_documento), ''), prev.tipo_documento, 'DNI ( DOCUMENTO NACIONAL DE IDENTIDAD)'),
  correo              = COALESCE(NULLIF(TRIM(n.correo), ''), prev.correo),
  celular_referencia  = COALESCE(NULLIF(TRIM(n.celular_referencia), ''), prev.celular_referencia),
  genero              = COALESCE(NULLIF(TRIM(n.genero), ''), prev.genero),
  fecha_nacimiento    = COALESCE(n.fecha_nacimiento, prev.fecha_nacimiento),
  edad                = COALESCE(n.edad, prev.edad),
  estado_civil        = COALESCE(NULLIF(TRIM(n.estado_civil), ''), prev.estado_civil),
  n_hijos             = COALESCE(n.n_hijos, prev.n_hijos, 0),
  nivel_academico     = COALESCE(NULLIF(TRIM(n.nivel_academico), ''), prev.nivel_academico),
  carrera             = COALESCE(NULLIF(TRIM(n.carrera), ''), prev.carrera),
  nacionalidad        = COALESCE(NULLIF(TRIM(n.nacionalidad), ''), prev.nacionalidad, 'PERUANA'),
  lugar_residencia    = COALESCE(NULLIF(TRIM(n.lugar_residencia), ''), prev.lugar_residencia),
  distrito_residencia = COALESCE(NULLIF(TRIM(n.distrito_residencia), ''), prev.distrito_residencia),
  direccion_domicilio = COALESCE(NULLIF(TRIM(n.direccion_domicilio), ''), prev.direccion_domicilio),
  exp_call_center     = COALESCE(NULLIF(TRIM(n.exp_call_center), ''), prev.exp_call_center),
  exp_tipo_campana    = COALESCE(NULLIF(TRIM(n.exp_tipo_campana), ''), prev.exp_tipo_campana),
  exp_tiempo_call     = COALESCE(NULLIF(TRIM(n.exp_tiempo_call), ''), prev.exp_tiempo_call),
  exp_otra            = COALESCE(NULLIF(TRIM(n.exp_otra), ''), prev.exp_otra),
  exp_tiempo_otra     = COALESCE(NULLIF(TRIM(n.exp_tiempo_otra), ''), prev.exp_tiempo_otra),
  exp_tiempo_campana  = COALESCE(NULLIF(TRIM(n.exp_tiempo_campana), ''), prev.exp_tiempo_campana),
  lugar_nacimiento    = COALESCE(NULLIF(TRIM(n.lugar_nacimiento), ''), prev.lugar_nacimiento),
  celular_emergencia  = COALESCE(NULLIF(TRIM(n.celular_emergencia), ''), prev.celular_emergencia),
  contacto_emergencia = COALESCE(NULLIF(TRIM(n.contacto_emergencia), ''), prev.contacto_emergencia),
  parentesco          = COALESCE(NULLIF(TRIM(n.parentesco), ''), prev.parentesco),
  entidad             = COALESCE(NULLIF(TRIM(n.entidad), ''), prev.entidad),
  doc_cv              = COALESCE(NULLIF(TRIM(n.doc_cv), ''), prev.doc_cv),
  doc_dni_adjunto     = COALESCE(NULLIF(TRIM(n.doc_dni_adjunto), ''), prev.doc_dni_adjunto),
  doc_certijoven      = COALESCE(NULLIF(TRIM(n.doc_certijoven), ''), prev.doc_certijoven),
  doc_recibo_servicios = COALESCE(NULLIF(TRIM(n.doc_recibo_servicios), ''), prev.doc_recibo_servicios),
  doc_ficha_datos     = COALESCE(NULLIF(TRIM(n.doc_ficha_datos), ''), prev.doc_ficha_datos),
  doc_autorizacion    = COALESCE(NULLIF(TRIM(n.doc_autorizacion), ''), prev.doc_autorizacion)
FROM (
  SELECT DISTINCT ON (documento)
    documento,
    tipo_documento,
    correo,
    celular_referencia,
    genero,
    fecha_nacimiento,
    edad,
    estado_civil,
    n_hijos,
    nivel_academico,
    carrera,
    nacionalidad,
    lugar_residencia,
    distrito_residencia,
    direccion_domicilio,
    exp_call_center,
    exp_tipo_campana,
    exp_tiempo_call,
    exp_otra,
    exp_tiempo_otra,
    exp_tiempo_campana,
    lugar_nacimiento,
    celular_emergencia,
    contacto_emergencia,
    parentesco,
    entidad,
    doc_cv,
    doc_dni_adjunto,
    doc_certijoven,
    doc_recibo_servicios,
    doc_ficha_datos,
    doc_autorizacion
  FROM public.nominas
  WHERE (correo IS NOT NULL AND correo <> '')
     OR (fecha_nacimiento IS NOT NULL)
     OR (direccion_domicilio IS NOT NULL AND direccion_domicilio <> '')
  ORDER BY documento, created_at DESC
) prev
WHERE n.documento = prev.documento
  AND (
    n.correo IS NULL 
    OR n.fecha_nacimiento IS NULL 
    OR n.direccion_domicilio IS NULL 
    OR n.nivel_academico IS NULL 
    OR n.genero IS NULL
  );
