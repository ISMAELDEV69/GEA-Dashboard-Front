-- ==============================================================================
-- SYNC: Sincronización Robusta de Analítica de Movilidad Geográfica
-- Resuelve: Falsos positivos por nombres de calles (Av. Arequipa, Jr. Cajamarca, etc.)
--           Jerarquía de campos (Lugar > Distrito > Dirección)
--           Mapeo correcto de provincias (evita 'LIMA METROPOLITANA' para departamentos)
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.sync_analitica_movilidad_geografica(p_periodo text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_inserted INT := 0;
BEGIN
  WITH base_asesores AS (
    SELECT DISTINCT ON (
      n.periodo_reclutado, 
      COALESCE(n.grupo_codigo, 'SIN GRUPO'), 
      n.documento
    )
      n.periodo_reclutado AS periodo,
      n.semana_trabajo AS semana,
      COALESCE(n.campana, 'SIN CAMPAÑA') AS campana,
      COALESCE(n.grupo_codigo, 'SIN GRUPO') AS grupo_codigo,
      n.reclutador,
      n.documento,
      TRIM(CONCAT(n.nombres, ' ', n.apellido_paterno, ' ', COALESCE(n.apellido_materno, ''))) AS nombre_completo,
      n.celular,
      UPPER(COALESCE(n.modalidad, 'PRESENCIAL')) AS modalidad,
      n.direccion_domicilio,
      UPPER(TRIM(COALESCE(n.lugar_residencia, ''))) AS raw_lugar,
      UPPER(TRIM(COALESCE(n.distrito_residencia, ''))) AS raw_distrito,
      UPPER(TRIM(COALESCE(n.direccion_domicilio, ''))) AS raw_dir,

      -- Texto exclusivo de jurisdicción sin tildes para matching 100% robusto
      TRANSLATE(UPPER(CONCAT(
        COALESCE(n.lugar_residencia, ''), ' ', 
        COALESCE(n.distrito_residencia, '')
      )), 'ÁÉÍÓÚ', 'AEIOU') AS texto_jurisdiccion,

      -- Texto completo de búsqueda sin tildes
      TRANSLATE(UPPER(CONCAT(
        COALESCE(n.lugar_residencia, ''), ' ', 
        COALESCE(n.distrito_residencia, ''), ' ', 
        COALESCE(n.direccion_domicilio, '')
      )), 'ÁÉÍÓÚ', 'AEIOU') AS texto_geo,

      -- Sede asignada y coordenadas
      CASE
        WHEN UPPER(COALESCE(n.sede, '')) LIKE '%ISIDRO%' THEN 'SAN_ISIDRO'
        WHEN UPPER(COALESCE(n.sede, '')) LIKE '%SURCO%' OR UPPER(COALESCE(n.sede, '')) LIKE '%JOCKEY%' THEN 'JOCKEY'
        WHEN UPPER(COALESCE(n.sede, '')) LIKE '%COMAS%' THEN 'COMAS'
        ELSE 'ATE'
      END AS sede_normalizada,
      
      CASE
        WHEN UPPER(COALESCE(n.sede, '')) LIKE '%ISIDRO%' THEN -12.0977
        WHEN UPPER(COALESCE(n.sede, '')) LIKE '%SURCO%' OR UPPER(COALESCE(n.sede, '')) LIKE '%JOCKEY%' THEN -12.0856
        WHEN UPPER(COALESCE(n.sede, '')) LIKE '%COMAS%' THEN -11.9365
        ELSE -12.0565
      END AS sede_lat,
      
      CASE
        WHEN UPPER(COALESCE(n.sede, '')) LIKE '%ISIDRO%' THEN -77.0232
        WHEN UPPER(COALESCE(n.sede, '')) LIKE '%SURCO%' OR UPPER(COALESCE(n.sede, '')) LIKE '%JOCKEY%' THEN -76.9729
        WHEN UPPER(COALESCE(n.sede, '')) LIKE '%COMAS%' THEN -77.0643
        ELSE -76.9535
      END AS sede_lng,

      -- Embudo Operativo Real
      (n.dia_0 = 'A' OR n.dia_0 = 'ASISTIO') AS asistio_dia_0,
      (n.dia_1 = 'A' OR n.status_dia_1 = 'ASISTIO') AS asistio_dia_1,
      
      CASE
        WHEN EXISTS (
          SELECT 1 FROM consolidado_asistencias a 
          WHERE a.documento = n.documento 
            AND (a.codigo_grupo = n.grupo_codigo OR a.campana = n.campana)
            AND (a.sigla = 'I-OP' OR a.estado ILIKE '%INGRESO%')
        ) THEN 'I-OP'
        WHEN n.estado = 'BAJA' OR n.status_dia_1 = 'CESE' OR n.status_dia_1 = 'BAJA' THEN 'BAJA'
        ELSE 'ACTIVO_AULA'
      END AS estado_operativo,
      
      n.fecha_conexion_op
    FROM nominas n
    WHERE (p_periodo IS NULL OR n.periodo_reclutado = p_periodo)
      AND n.periodo_reclutado IS NOT NULL
      AND n.documento IS NOT NULL
    ORDER BY 
      n.periodo_reclutado, 
      COALESCE(n.grupo_codigo, 'SIN GRUPO'), 
      n.documento, 
      n.updated_at DESC NULLS LAST
  ),
  dep_determinado AS (
    SELECT
      *,
      CASE
        -- A. Callao
        WHEN texto_jurisdiccion LIKE '%CALLAO%' OR texto_jurisdiccion LIKE '%VENTANILLA%' OR texto_jurisdiccion LIKE '%BELLAVISTA%' OR texto_jurisdiccion LIKE '%LA PERLA%' THEN 'CALLAO'

        -- B. Provincias / Departamentos en campo de lugar y distrito
        WHEN texto_jurisdiccion LIKE '%CAJAMARCA%' OR texto_jurisdiccion LIKE '%JAEN%' OR texto_jurisdiccion LIKE '%BANOS DEL INCA%' THEN 'CAJAMARCA'
        WHEN texto_jurisdiccion LIKE '%AREQUIPA%' OR texto_jurisdiccion LIKE '%PAUCARPATA%' OR texto_jurisdiccion LIKE '%CAYMA%' OR texto_jurisdiccion LIKE '%CERRO COLORADO%' THEN 'AREQUIPA'
        WHEN texto_jurisdiccion LIKE '%CHICLAYO%' OR texto_jurisdiccion LIKE '%LAMBAYEQUE%' OR texto_jurisdiccion LIKE '%LEONARDO ORTIZ%' OR texto_jurisdiccion LIKE '%FERRENAFE%' THEN 'LAMBAYEQUE'
        WHEN texto_jurisdiccion LIKE '%PIURA%' OR texto_jurisdiccion LIKE '%SULLANA%' OR texto_jurisdiccion LIKE '%TALARA%' OR texto_jurisdiccion LIKE '%PAITA%' THEN 'PIURA'
        WHEN texto_jurisdiccion LIKE '%TRUJILLO%' OR texto_jurisdiccion LIKE '%LA LIBERTAD%' OR texto_jurisdiccion LIKE '%LIBERTAD%' OR texto_jurisdiccion LIKE '%VICTOR LARCO%' OR texto_jurisdiccion LIKE '%CHEPEN%' THEN 'LA LIBERTAD'
        WHEN texto_jurisdiccion LIKE '%CUSCO%' OR texto_jurisdiccion LIKE '%CUZCO%' OR texto_jurisdiccion LIKE '%WANCHAQ%' THEN 'CUSCO'
        WHEN texto_jurisdiccion LIKE '%HUANCAYO%' OR texto_jurisdiccion LIKE '%JUNIN%' OR texto_jurisdiccion LIKE '%EL TAMBO%' THEN 'JUNIN'
        WHEN texto_jurisdiccion LIKE '%CHINCHA%' OR texto_jurisdiccion LIKE '%PISCO%' OR texto_jurisdiccion LIKE '%NAZCA%' OR (texto_jurisdiccion LIKE '%ICA%' AND texto_jurisdiccion NOT LIKE '%MICAELA%') THEN 'ICA'
        WHEN texto_jurisdiccion LIKE '%CHIMBOTE%' OR texto_jurisdiccion LIKE '%HUARAZ%' OR texto_jurisdiccion LIKE '%ANCASH%' THEN 'ANCASH'
        WHEN texto_jurisdiccion LIKE '%TARAPOTO%' OR (texto_jurisdiccion LIKE '%SAN MARTIN%' AND texto_jurisdiccion NOT LIKE '%SAN MARTIN DE PORRES%' AND texto_jurisdiccion NOT LIKE '%SMP%') OR texto_jurisdiccion LIKE '%MOYOBAMBA%' THEN 'SAN MARTIN'
        WHEN texto_jurisdiccion LIKE '%IQUITOS%' OR texto_jurisdiccion LIKE '%LORETO%' THEN 'LORETO'
        WHEN texto_jurisdiccion LIKE '%TACNA%' THEN 'TACNA'
        WHEN texto_jurisdiccion LIKE '%PUCALLPA%' OR texto_jurisdiccion LIKE '%UCAYALI%' THEN 'UCAYALI'
        WHEN texto_jurisdiccion LIKE '%AYACUCHO%' OR texto_jurisdiccion LIKE '%HUAMANGA%' THEN 'AYACUCHO'
        WHEN texto_jurisdiccion LIKE '%PUNO%' OR texto_jurisdiccion LIKE '%JULIACA%' THEN 'PUNO'
        WHEN texto_jurisdiccion LIKE '%HUANUCO%' THEN 'HUANUCO'
        WHEN texto_jurisdiccion LIKE '%TUMBES%' THEN 'TUMBES'
        WHEN texto_jurisdiccion LIKE '%PASCO%' OR texto_jurisdiccion LIKE '%OXAPAMPA%' THEN 'PASCO'
        WHEN texto_jurisdiccion LIKE '%MOQUEGUA%' OR texto_jurisdiccion LIKE '%ILO%' THEN 'MOQUEGUA'
        WHEN texto_jurisdiccion LIKE '%MADRE DE DIOS%' OR texto_jurisdiccion LIKE '%PUERTO MALDONADO%' THEN 'MADRE DE DIOS'
        WHEN texto_jurisdiccion LIKE '%AMAZONAS%' OR texto_jurisdiccion LIKE '%CHACHAPOYAS%' THEN 'AMAZONAS'
        WHEN texto_jurisdiccion LIKE '%APURIMAC%' OR texto_jurisdiccion LIKE '%ABANCAY%' THEN 'APURIMAC'
        WHEN texto_jurisdiccion LIKE '%HUANCAVELICA%' THEN 'HUANCAVELICA'

        -- C. Lima Metropolitana
        WHEN texto_jurisdiccion LIKE '%LIMA%' OR texto_jurisdiccion LIKE '%COMAS%' OR texto_jurisdiccion LIKE '%ATE%' OR texto_jurisdiccion LIKE '%LURIGANCHO%' OR texto_jurisdiccion LIKE '%SJL%' OR texto_jurisdiccion LIKE '%SURCO%' OR texto_jurisdiccion LIKE '%VILLA EL SALVADOR%' OR texto_jurisdiccion LIKE '%VES%' OR texto_jurisdiccion LIKE '%VILLA MARIA%' OR texto_jurisdiccion LIKE '%VMT%' OR texto_jurisdiccion LIKE '%SAN JUAN DE MIRAFLORES%' OR texto_jurisdiccion LIKE '%SJM%' OR texto_jurisdiccion LIKE '%LOS OLIVOS%' OR texto_jurisdiccion LIKE '%SAN MARTIN DE PORRES%' OR texto_jurisdiccion LIKE '%SMP%' OR texto_jurisdiccion LIKE '%PUENTE PIEDRA%' OR texto_jurisdiccion LIKE '%CARABAYLLO%' OR texto_jurisdiccion LIKE '%SANTA ANITA%' OR texto_jurisdiccion LIKE '%EL AGUSTINO%' OR texto_jurisdiccion LIKE '%MIRAFLORES%' OR texto_jurisdiccion LIKE '%SAN ISIDRO%' OR texto_jurisdiccion LIKE '%LA MOLINA%' OR texto_jurisdiccion LIKE '%SAN BORJA%' OR texto_jurisdiccion LIKE '%BRENA%' OR texto_jurisdiccion LIKE '%PUEBLO LIBRE%' OR texto_jurisdiccion LIKE '%JESUS MARIA%' OR texto_jurisdiccion LIKE '%LINCE%' OR texto_jurisdiccion LIKE '%MAGDALENA%' OR texto_jurisdiccion LIKE '%SURQUILLO%' OR texto_jurisdiccion LIKE '%CHORRILLOS%' OR texto_jurisdiccion LIKE '%LURIN%' OR texto_jurisdiccion LIKE '%PACHACAMAC%' OR texto_jurisdiccion LIKE '%CHACLACAYO%' OR texto_jurisdiccion LIKE '%CHOSICA%' OR texto_jurisdiccion LIKE '%BARRANCO%' OR texto_jurisdiccion LIKE '%INDEPENDENCIA%' OR texto_jurisdiccion LIKE '%RIMAC%' OR texto_jurisdiccion LIKE '%SAN LUIS%' THEN 'LIMA'

        -- D. Fallback solo si lugar o distrito está vacío o dice PROVINCIA sin especificar
        WHEN raw_lugar LIKE '%PROVINCIA%' AND (texto_geo LIKE '%CAJAMARCA%' OR texto_geo LIKE '%JAEN%') THEN 'CAJAMARCA'
        WHEN raw_lugar LIKE '%PROVINCIA%' AND (texto_geo LIKE '%AREQUIPA%' OR texto_geo LIKE '%PAUCARPATA%') THEN 'AREQUIPA'
        WHEN raw_lugar LIKE '%PROVINCIA%' AND (texto_geo LIKE '%CHICLAYO%' OR texto_geo LIKE '%LAMBAYEQUE%') THEN 'LAMBAYEQUE'
        WHEN raw_lugar LIKE '%PROVINCIA%' AND (texto_geo LIKE '%PIURA%' OR texto_geo LIKE '%SULLANA%') THEN 'PIURA'
        WHEN raw_lugar LIKE '%PROVINCIA%' AND (texto_geo LIKE '%TRUJILLO%' OR texto_geo LIKE '%LIBERTAD%') THEN 'LA LIBERTAD'
        WHEN raw_lugar LIKE '%PROVINCIA%' AND (texto_geo LIKE '%CUSCO%' OR texto_geo LIKE '%CUZCO%') THEN 'CUSCO'
        WHEN raw_lugar LIKE '%PROVINCIA%' AND (texto_geo LIKE '%HUANCAYO%' OR texto_geo LIKE '%JUNIN%') THEN 'JUNIN'
        WHEN raw_lugar LIKE '%PROVINCIA%' AND (texto_geo LIKE '%CHINCHA%' OR texto_geo LIKE '%PISCO%') THEN 'ICA'
        WHEN raw_lugar LIKE '%PROVINCIA%' AND (texto_geo LIKE '%CHIMBOTE%' OR texto_geo LIKE '%ANCASH%') THEN 'ANCASH'
        WHEN raw_lugar LIKE '%PROVINCIA%' AND (texto_geo LIKE '%TARAPOTO%' OR texto_geo LIKE '%MOYOBAMBA%') THEN 'SAN MARTIN'
        WHEN raw_lugar LIKE '%PROVINCIA%' AND (texto_geo LIKE '%IQUITOS%' OR texto_geo LIKE '%LORETO%') THEN 'LORETO'
        WHEN raw_lugar LIKE '%PROVINCIA%' AND texto_geo LIKE '%TACNA%' THEN 'TACNA'
        WHEN raw_lugar LIKE '%PROVINCIA%' AND (texto_geo LIKE '%PUCALLPA%' OR texto_geo LIKE '%UCAYALI%') THEN 'UCAYALI'
        WHEN raw_lugar LIKE '%PROVINCIA%' AND (texto_geo LIKE '%AYACUCHO%' OR texto_geo LIKE '%HUAMANGA%') THEN 'AYACUCHO'
        WHEN raw_lugar LIKE '%PROVINCIA%' AND (texto_geo LIKE '%PUNO%' OR texto_geo LIKE '%JULIACA%') THEN 'PUNO'
        WHEN raw_lugar LIKE '%PROVINCIA%' AND texto_geo LIKE '%HUANUCO%' THEN 'HUANUCO'
        WHEN raw_lugar LIKE '%PROVINCIA%' AND texto_geo LIKE '%TUMBES%' THEN 'TUMBES'
        WHEN raw_lugar LIKE '%PROVINCIA%' AND (texto_geo LIKE '%PASCO%' OR texto_geo LIKE '%OXAPAMPA%') THEN 'PASCO'
        WHEN texto_geo LIKE '%VENTANILLA%' OR texto_geo LIKE '%CALLAO%' OR texto_geo LIKE '%BELLAVISTA%' THEN 'CALLAO'
        ELSE 'LIMA'
      END AS departamento_calc
    FROM base_asesores
  ),
  geocodificado AS (
    SELECT
      *,
      -- 2. DETERMINACIÓN DE CIUDAD / DISTRITO RESIDENCIA
      CASE
        -- Si es provincia: resolver ciudad de provincia o respetar su distrito_residencia
        WHEN departamento_calc = 'CAJAMARCA' THEN
          CASE WHEN texto_jurisdiccion LIKE '%JAEN%' THEN 'JAEN' WHEN texto_jurisdiccion LIKE '%BANOS DEL INCA%' THEN 'BAÑOS DEL INCA' ELSE 'CAJAMARCA' END
        WHEN departamento_calc = 'AREQUIPA' THEN
          CASE WHEN texto_jurisdiccion LIKE '%PAUCARPATA%' THEN 'PAUCARPATA' WHEN texto_jurisdiccion LIKE '%CAYMA%' THEN 'CAYMA' WHEN texto_jurisdiccion LIKE '%CERRO COLORADO%' THEN 'CERRO COLORADO' ELSE 'AREQUIPA' END
        WHEN departamento_calc = 'LAMBAYEQUE' THEN
          CASE WHEN texto_jurisdiccion LIKE '%LEONARDO ORTIZ%' THEN 'JOSE LEONARDO ORTIZ' WHEN texto_jurisdiccion LIKE '%FERRENAFE%' THEN 'FERREÑAFE' ELSE 'CHICLAYO' END
        WHEN departamento_calc = 'PIURA' THEN
          CASE WHEN texto_jurisdiccion LIKE '%SULLANA%' THEN 'SULLANA' WHEN texto_jurisdiccion LIKE '%TALARA%' THEN 'TALARA' WHEN texto_jurisdiccion LIKE '%PAITA%' THEN 'PAITA' ELSE 'PIURA' END
        WHEN departamento_calc = 'LA LIBERTAD' THEN
          CASE WHEN texto_jurisdiccion LIKE '%VICTOR LARCO%' THEN 'VICTOR LARCO HERRERA' WHEN texto_jurisdiccion LIKE '%CHEPEN%' THEN 'CHEPEN' ELSE 'TRUJILLO' END
        WHEN departamento_calc = 'CUSCO' THEN 'CUSCO'
        WHEN departamento_calc = 'JUNIN' THEN 'HUANCAYO'
        WHEN departamento_calc = 'ICA' THEN
          CASE WHEN texto_jurisdiccion LIKE '%CHINCHA%' THEN 'CHINCHA' WHEN texto_jurisdiccion LIKE '%PISCO%' THEN 'PISCO' ELSE 'ICA' END
        WHEN departamento_calc = 'ANCASH' THEN
          CASE WHEN texto_jurisdiccion LIKE '%HUARAZ%' THEN 'HUARAZ' ELSE 'CHIMBOTE' END
        WHEN departamento_calc = 'SAN MARTIN' THEN
          CASE WHEN texto_jurisdiccion LIKE '%MOYOBAMBA%' THEN 'MOYOBAMBA' ELSE 'TARAPOTO' END
        WHEN departamento_calc = 'LORETO' THEN 'IQUITOS'
        WHEN departamento_calc = 'TACNA' THEN 'TACNA'
        WHEN departamento_calc = 'UCAYALI' THEN 'PUCALLPA'
        WHEN departamento_calc = 'AYACUCHO' THEN 'AYACUCHO'
        WHEN departamento_calc = 'PUNO' THEN
          CASE WHEN texto_jurisdiccion LIKE '%JULIACA%' THEN 'JULIACA' ELSE 'PUNO' END
        WHEN departamento_calc = 'HUANUCO' THEN 'HUANUCO'
        WHEN departamento_calc = 'TUMBES' THEN 'TUMBES'
        WHEN departamento_calc = 'PASCO' THEN
          CASE WHEN texto_jurisdiccion LIKE '%OXAPAMPA%' THEN 'OXAPAMPA' ELSE 'CERRO DE PASCO' END
        WHEN departamento_calc = 'AMAZONAS' THEN
          CASE WHEN texto_jurisdiccion LIKE '%CHACHAPOYAS%' THEN 'CHACHAPOYAS' ELSE 'AMAZONAS' END
        WHEN departamento_calc = 'MOQUEGUA' THEN
          CASE WHEN texto_jurisdiccion LIKE '%ILO%' THEN 'ILO' ELSE 'MOQUEGUA' END
        WHEN departamento_calc = 'MADRE DE DIOS' THEN 'PUERTO MALDONADO'
        WHEN departamento_calc = 'APURIMAC' THEN 'ABANCAY'
        WHEN departamento_calc = 'HUANCAVELICA' THEN 'HUANCAVELICA'

        -- Callao
        WHEN departamento_calc = 'CALLAO' THEN
          CASE
            WHEN texto_geo LIKE '%VENTANILLA%' THEN 'VENTANILLA'
            WHEN texto_geo LIKE '%BELLAVISTA%' THEN 'BELLAVISTA'
            WHEN texto_geo LIKE '%LA PERLA%' THEN 'LA PERLA'
            ELSE 'CALLAO'
          END

        -- Lima Metropolitana
        WHEN texto_geo LIKE '%LURIGANCHO%' OR texto_geo LIKE '%SJL%' THEN 'SAN JUAN DE LURIGANCHO'
        WHEN texto_geo LIKE '%COMAS%' THEN 'COMAS'
        WHEN texto_geo LIKE '%VILLA EL SALVADOR%' OR texto_geo LIKE '%VES%' THEN 'VILLA EL SALVADOR'
        WHEN texto_geo LIKE '%VILLA MARIA%' OR texto_geo LIKE '%VMT%' THEN 'VILLA MARIA DEL TRIUNFO'
        WHEN texto_geo LIKE '%SAN JUAN DE MIRAFLORES%' OR texto_geo LIKE '%SJM%' THEN 'SAN JUAN DE MIRAFLORES'
        WHEN texto_geo LIKE '%SAN MARTIN DE PORRES%' OR texto_geo LIKE '%SMP%' THEN 'SAN MARTIN DE PORRES'
        WHEN texto_geo LIKE '%LOS OLIVOS%' OR texto_geo LIKE '%OLIVOS%' THEN 'LOS OLIVOS'
        WHEN texto_geo LIKE '%PUENTE PIEDRA%' THEN 'PUENTE PIEDRA'
        WHEN texto_geo LIKE '%CARABAYLLO%' THEN 'CARABAYLLO'
        WHEN texto_geo LIKE '%SANTA ANITA%' THEN 'SANTA ANITA'
        WHEN texto_geo LIKE '%EL AGUSTINO%' THEN 'EL AGUSTINO'
        WHEN texto_geo LIKE '%SURCO%' THEN 'SANTIAGO DE SURCO'
        WHEN texto_geo LIKE '%MIRAFLORES%' THEN 'MIRAFLORES'
        WHEN texto_geo LIKE '%SAN ISIDRO%' THEN 'SAN ISIDRO'
        WHEN texto_geo LIKE '%LA MOLINA%' THEN 'LA MOLINA'
        WHEN texto_geo LIKE '%SAN BORJA%' THEN 'SAN BORJA'
        WHEN texto_geo LIKE '%BRENA%' OR texto_geo LIKE '%BREÑA%' THEN 'BREÑA'
        WHEN texto_geo LIKE '%PUEBLO LIBRE%' THEN 'PUEBLO LIBRE'
        WHEN texto_geo LIKE '%JESUS MARIA%' THEN 'JESUS MARIA'
        WHEN texto_geo LIKE '%LINCE%' THEN 'LINCE'
        WHEN texto_geo LIKE '%MAGDALENA%' THEN 'MAGDALENA DEL MAR'
        WHEN texto_geo LIKE '%SURQUILLO%' THEN 'SURQUILLO'
        WHEN texto_geo LIKE '%CHORRILLOS%' THEN 'CHORRILLOS'
        WHEN texto_geo LIKE '%INDEPENDENCIA%' THEN 'INDEPENDENCIA'
        WHEN texto_geo LIKE '%RIMAC%' THEN 'RIMAC'
        WHEN texto_geo LIKE '%SAN LUIS%' THEN 'SAN LUIS'
        WHEN texto_geo LIKE '%CHACLACAYO%' THEN 'CHACLACAYO'
        WHEN texto_geo LIKE '%CHOSICA%' THEN 'CHOSICA'
        WHEN texto_geo LIKE '%LURIN%' THEN 'LURIN'
        WHEN texto_geo LIKE '%PACHACAMAC%' THEN 'PACHACAMAC'
        WHEN texto_geo LIKE '%BARRANCO%' THEN 'BARRANCO'
        WHEN texto_geo LIKE '%CERCADO%' OR texto_geo LIKE '%CENTRO DE LIMA%' THEN 'CERCADO DE LIMA'
        WHEN texto_geo LIKE '%ATE%' THEN 'ATE'
        ELSE
          CASE 
            WHEN departamento_calc NOT IN ('LIMA', 'CALLAO') THEN departamento_calc 
            ELSE 'LIMA METROPOLITANA' 
          END
      END AS ciudad_calc
    FROM dep_determinado
  ),
  con_coordenadas AS (
    SELECT
      *,
      -- 3. COORDENADAS PRECISAS
      CASE
        WHEN departamento_calc = 'CAJAMARCA' OR ciudad_calc = 'CAJAMARCA' THEN -7.1638
        WHEN ciudad_calc = 'JAEN' THEN -5.7083
        WHEN departamento_calc = 'AREQUIPA' OR ciudad_calc = 'AREQUIPA' OR ciudad_calc = 'PAUCARPATA' THEN -16.4090
        WHEN departamento_calc = 'LAMBAYEQUE' OR ciudad_calc = 'CHICLAYO' OR ciudad_calc = 'JOSE LEONARDO ORTIZ' THEN -6.7714
        WHEN departamento_calc = 'PIURA' OR ciudad_calc = 'PIURA' OR ciudad_calc = 'SULLANA' THEN -5.1945
        WHEN departamento_calc = 'LA LIBERTAD' OR ciudad_calc = 'TRUJILLO' OR ciudad_calc = 'VICTOR LARCO HERRERA' THEN -8.1116
        WHEN departamento_calc = 'CUSCO' OR ciudad_calc = 'CUSCO' THEN -13.5319
        WHEN departamento_calc = 'JUNIN' OR ciudad_calc = 'HUANCAYO' THEN -12.0651
        WHEN departamento_calc = 'ICA' OR ciudad_calc = 'ICA' OR ciudad_calc = 'CHINCHA' OR ciudad_calc = 'PISCO' THEN -14.0678
        WHEN departamento_calc = 'ANCASH' OR ciudad_calc = 'CHIMBOTE' OR ciudad_calc = 'HUARAZ' THEN -9.0744
        WHEN departamento_calc = 'SAN MARTIN' OR ciudad_calc = 'TARAPOTO' OR ciudad_calc = 'MOYOBAMBA' THEN -6.4867
        WHEN departamento_calc = 'LORETO' OR ciudad_calc = 'IQUITOS' THEN -3.7491
        WHEN departamento_calc = 'TACNA' OR ciudad_calc = 'TACNA' THEN -18.0146
        WHEN departamento_calc = 'UCAYALI' OR ciudad_calc = 'PUCALLPA' THEN -8.3791
        WHEN departamento_calc = 'AYACUCHO' OR ciudad_calc = 'AYACUCHO' THEN -13.1588
        WHEN departamento_calc = 'PUNO' OR ciudad_calc = 'PUNO' OR ciudad_calc = 'JULIACA' THEN -15.8402
        WHEN departamento_calc = 'HUANUCO' OR ciudad_calc = 'HUANUCO' THEN -9.9306
        WHEN departamento_calc = 'TUMBES' OR ciudad_calc = 'TUMBES' THEN -3.5669
        WHEN departamento_calc = 'PASCO' OR ciudad_calc = 'CERRO DE PASCO' OR ciudad_calc = 'OXAPAMPA' THEN -10.6675
        WHEN departamento_calc = 'AMAZONAS' OR ciudad_calc = 'CHACHAPOYAS' OR ciudad_calc = 'AMAZONAS' THEN -6.2317
        WHEN departamento_calc = 'MOQUEGUA' OR ciudad_calc = 'MOQUEGUA' OR ciudad_calc = 'ILO' THEN -17.1983
        WHEN departamento_calc = 'MADRE DE DIOS' OR ciudad_calc = 'PUERTO MALDONADO' THEN -12.5933
        WHEN departamento_calc = 'APURIMAC' OR ciudad_calc = 'ABANCAY' THEN -13.6339
        WHEN departamento_calc = 'HUANCAVELICA' THEN -12.7864
        
        -- Distritos de Lima y Callao
        WHEN ciudad_calc = 'SAN JUAN DE LURIGANCHO' THEN -11.9820
        WHEN ciudad_calc = 'COMAS' THEN -11.9320
        WHEN ciudad_calc = 'VILLA EL SALVADOR' THEN -12.2100
        WHEN ciudad_calc = 'VILLA MARIA DEL TRIUNFO' THEN -12.1620
        WHEN ciudad_calc = 'SAN JUAN DE MIRAFLORES' THEN -12.1550
        WHEN ciudad_calc = 'SAN MARTIN DE PORRES' THEN -11.9950
        WHEN ciudad_calc = 'LOS OLIVOS' THEN -11.9800
        WHEN ciudad_calc = 'PUENTE PIEDRA' THEN -11.8650
        WHEN ciudad_calc = 'CARABAYLLO' THEN -11.8750
        WHEN ciudad_calc = 'SANTA ANITA' THEN -12.0480
        WHEN ciudad_calc = 'EL AGUSTINO' THEN -12.0480
        WHEN ciudad_calc = 'SANTIAGO DE SURCO' THEN -12.1400
        WHEN ciudad_calc = 'MIRAFLORES' THEN -12.1220
        WHEN ciudad_calc = 'SAN ISIDRO' THEN -12.0970
        WHEN ciudad_calc = 'LA MOLINA' THEN -12.0860
        WHEN ciudad_calc = 'SAN BORJA' THEN -12.0920
        WHEN ciudad_calc = 'BREÑA' THEN -12.0590
        WHEN ciudad_calc = 'PUEBLO LIBRE' THEN -12.0750
        WHEN ciudad_calc = 'JESUS MARIA' THEN -12.0720
        WHEN ciudad_calc = 'LINCE' THEN -12.0840
        WHEN ciudad_calc = 'MAGDALENA DEL MAR' THEN -12.0920
        WHEN ciudad_calc = 'SURQUILLO' THEN -12.1120
        WHEN ciudad_calc = 'CHORRILLOS' THEN -12.1700
        WHEN ciudad_calc = 'INDEPENDENCIA' THEN -11.9920
        WHEN ciudad_calc = 'RIMAC' THEN -12.0320
        WHEN ciudad_calc = 'SAN LUIS' THEN -12.0780
        WHEN ciudad_calc = 'CHACLACAYO' THEN -11.9800
        WHEN ciudad_calc = 'CHOSICA' THEN -11.9400
        WHEN ciudad_calc = 'LURIN' THEN -12.2740
        WHEN ciudad_calc = 'PACHACAMAC' THEN -12.1800
        WHEN ciudad_calc = 'BARRANCO' THEN -12.1480
        WHEN ciudad_calc = 'CALLAO' THEN -12.0560
        WHEN ciudad_calc = 'VENTANILLA' THEN -11.8780
        WHEN ciudad_calc = 'BELLAVISTA' THEN -12.0610
        WHEN ciudad_calc = 'LA PERLA' THEN -12.0680
        WHEN ciudad_calc = 'ATE' THEN -12.0432
        ELSE -12.0460
      END AS lat_origen_calc,

      CASE
        WHEN departamento_calc = 'CAJAMARCA' OR ciudad_calc = 'CAJAMARCA' THEN -78.5128
        WHEN ciudad_calc = 'JAEN' THEN -78.8083
        WHEN departamento_calc = 'AREQUIPA' OR ciudad_calc = 'AREQUIPA' OR ciudad_calc = 'PAUCARPATA' THEN -71.5375
        WHEN departamento_calc = 'LAMBAYEQUE' OR ciudad_calc = 'CHICLAYO' OR ciudad_calc = 'JOSE LEONARDO ORTIZ' THEN -79.8409
        WHEN departamento_calc = 'PIURA' OR ciudad_calc = 'PIURA' OR ciudad_calc = 'SULLANA' THEN -80.6328
        WHEN departamento_calc = 'LA LIBERTAD' OR ciudad_calc = 'TRUJILLO' OR ciudad_calc = 'VICTOR LARCO HERRERA' THEN -79.0287
        WHEN departamento_calc = 'CUSCO' OR ciudad_calc = 'CUSCO' THEN -71.9675
        WHEN departamento_calc = 'JUNIN' OR ciudad_calc = 'HUANCAYO' THEN -75.2049
        WHEN departamento_calc = 'ICA' OR ciudad_calc = 'ICA' OR ciudad_calc = 'CHINCHA' OR ciudad_calc = 'PISCO' THEN -75.7286
        WHEN departamento_calc = 'ANCASH' OR ciudad_calc = 'CHIMBOTE' OR ciudad_calc = 'HUARAZ' THEN -78.5936
        WHEN departamento_calc = 'SAN MARTIN' OR ciudad_calc = 'TARAPOTO' OR ciudad_calc = 'MOYOBAMBA' THEN -76.3689
        WHEN departamento_calc = 'LORETO' OR ciudad_calc = 'IQUITOS' THEN -73.2538
        WHEN departamento_calc = 'TACNA' OR ciudad_calc = 'TACNA' THEN -70.2536
        WHEN departamento_calc = 'UCAYALI' OR ciudad_calc = 'PUCALLPA' THEN -74.5539
        WHEN departamento_calc = 'AYACUCHO' OR ciudad_calc = 'AYACUCHO' THEN -74.2239
        WHEN departamento_calc = 'PUNO' OR ciudad_calc = 'PUNO' OR ciudad_calc = 'JULIACA' THEN -70.0219
        WHEN departamento_calc = 'HUANUCO' OR ciudad_calc = 'HUANUCO' THEN -76.2422
        WHEN departamento_calc = 'TUMBES' OR ciudad_calc = 'TUMBES' THEN -80.4515
        WHEN departamento_calc = 'PASCO' OR ciudad_calc = 'CERRO DE PASCO' OR ciudad_calc = 'OXAPAMPA' THEN -76.2561
        WHEN departamento_calc = 'AMAZONAS' OR ciudad_calc = 'CHACHAPOYAS' OR ciudad_calc = 'AMAZONAS' THEN -77.8690
        WHEN departamento_calc = 'MOQUEGUA' OR ciudad_calc = 'MOQUEGUA' OR ciudad_calc = 'ILO' THEN -70.9356
        WHEN departamento_calc = 'MADRE DE DIOS' OR ciudad_calc = 'PUERTO MALDONADO' THEN -69.1891
        WHEN departamento_calc = 'APURIMAC' OR ciudad_calc = 'ABANCAY' THEN -72.8814
        WHEN departamento_calc = 'HUANCAVELICA' THEN -74.9725

        -- Distritos de Lima y Callao
        WHEN ciudad_calc = 'SAN JUAN DE LURIGANCHO' THEN -76.9980
        WHEN ciudad_calc = 'COMAS' THEN -77.0490
        WHEN ciudad_calc = 'VILLA EL SALVADOR' THEN -76.9380
        WHEN ciudad_calc = 'VILLA MARIA DEL TRIUNFO' THEN -76.9350
        WHEN ciudad_calc = 'SAN JUAN DE MIRAFLORES' THEN -76.9680
        WHEN ciudad_calc = 'SAN MARTIN DE PORRES' THEN -77.0950
        WHEN ciudad_calc = 'LOS OLIVOS' THEN -77.0680
        WHEN ciudad_calc = 'PUENTE PIEDRA' THEN -77.0750
        WHEN ciudad_calc = 'CARABAYLLO' THEN -77.0320
        WHEN ciudad_calc = 'SANTA ANITA' THEN -76.9720
        WHEN ciudad_calc = 'EL AGUSTINO' THEN -77.0020
        WHEN ciudad_calc = 'SANTIAGO DE SURCO' THEN -76.9950
        WHEN ciudad_calc = 'MIRAFLORES' THEN -77.0290
        WHEN ciudad_calc = 'SAN ISIDRO' THEN -77.0280
        WHEN ciudad_calc = 'LA MOLINA' THEN -76.9380
        WHEN ciudad_calc = 'SAN BORJA' THEN -77.0010
        WHEN ciudad_calc = 'BREÑA' THEN -77.0520
        WHEN ciudad_calc = 'PUEBLO LIBRE' THEN -77.0650
        WHEN ciudad_calc = 'JESUS MARIA' THEN -77.0480
        WHEN ciudad_calc = 'LINCE' THEN -77.0340
        WHEN ciudad_calc = 'MAGDALENA DEL MAR' THEN -77.0700
        WHEN ciudad_calc = 'SURQUILLO' THEN -77.0150
        WHEN ciudad_calc = 'CHORRILLOS' THEN -77.0180
        WHEN ciudad_calc = 'INDEPENDENCIA' THEN -77.0540
        WHEN ciudad_calc = 'RIMAC' THEN -77.0310
        WHEN ciudad_calc = 'SAN LUIS' THEN -77.0010
        WHEN ciudad_calc = 'CHACLACAYO' THEN -76.7700
        WHEN ciudad_calc = 'CHOSICA' THEN -76.7050
        WHEN ciudad_calc = 'LURIN' THEN -76.8710
        WHEN ciudad_calc = 'PACHACAMAC' THEN -76.8600
        WHEN ciudad_calc = 'BARRANCO' THEN -77.0210
        WHEN ciudad_calc = 'CALLAO' THEN -77.1180
        WHEN ciudad_calc = 'VENTANILLA' THEN -77.1290
        WHEN ciudad_calc = 'BELLAVISTA' THEN -77.1260
        WHEN ciudad_calc = 'LA PERLA' THEN -77.1150
        WHEN ciudad_calc = 'ATE' THEN -76.9200
        ELSE -77.0420
      END AS lng_origen_calc
    FROM geocodificado
  ),
  con_distancias AS (
    SELECT
      *,
      ROUND((6371 * 2 * ASIN(SQRT(
        POWER(SIN(RADIANS(sede_lat - lat_origen_calc) / 2), 2) + 
        COS(RADIANS(lat_origen_calc)) * COS(RADIANS(sede_lat)) * 
        POWER(SIN(RADIANS(sede_lng - lng_origen_calc) / 2), 2)
      )))::numeric, 2) AS dist_calc
    FROM con_coordenadas
  )
  INSERT INTO public.analitica_movilidad_geografica (
    periodo, semana, campana, grupo_codigo, reclutador,
    documento, nombre_completo, celular, modalidad,
    distrito_residencia, direccion_domicilio,
    departamento, ciudad,
    lat_origen, lng_origen,
    sede_asignada, sede_lat, sede_lng,
    distancia_km, rango_distancia, es_zona_critica,
    asistio_dia_0, asistio_dia_1, estado_operativo, fecha_conexion_op, updated_at
  )
  SELECT
    periodo, semana, campana, grupo_codigo, reclutador,
    documento, nombre_completo, celular, modalidad,
    ciudad_calc, direccion_domicilio,
    departamento_calc, ciudad_calc,
    lat_origen_calc, lng_origen_calc,
    sede_normalizada, sede_lat, sede_lng,
    CASE WHEN modalidad = 'REMOTO' THEN 0 ELSE dist_calc END,
    CASE
      WHEN modalidad = 'REMOTO' THEN 'REMOTO NACIONAL'
      WHEN dist_calc < 5 THEN '<5km'
      WHEN dist_calc < 10 THEN '5-10km'
      WHEN dist_calc <= 14 THEN '10-15km'
      ELSE '>14km'
    END,
    (modalidad = 'PRESENCIAL' AND dist_calc > 14),
    asistio_dia_0, asistio_dia_1, estado_operativo, fecha_conexion_op, NOW()
  FROM con_distancias
  ON CONFLICT (periodo, grupo_codigo, documento) 
  DO UPDATE SET
    modalidad = EXCLUDED.modalidad,
    distrito_residencia = EXCLUDED.distrito_residencia,
    direccion_domicilio = EXCLUDED.direccion_domicilio,
    departamento = EXCLUDED.departamento,
    ciudad = EXCLUDED.ciudad,
    lat_origen = EXCLUDED.lat_origen,
    lng_origen = EXCLUDED.lng_origen,
    sede_asignada = EXCLUDED.sede_asignada,
    sede_lat = EXCLUDED.sede_lat,
    sede_lng = EXCLUDED.sede_lng,
    distancia_km = EXCLUDED.distancia_km,
    rango_distancia = EXCLUDED.rango_distancia,
    es_zona_critica = EXCLUDED.es_zona_critica,
    asistio_dia_0 = EXCLUDED.asistio_dia_0,
    asistio_dia_1 = EXCLUDED.asistio_dia_1,
    estado_operativo = EXCLUDED.estado_operativo,
    fecha_conexion_op = EXCLUDED.fecha_conexion_op,
    updated_at = NOW();

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN jsonb_build_object('success', true, 'registros_procesados', v_inserted);
END;
$function$;
