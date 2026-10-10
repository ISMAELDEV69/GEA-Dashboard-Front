/**
 * geoMobilityService.js
 * Motor de Inteligencia Geográfica, Distancias de Lima Metropolitana
 * y Optimización de Asignación de Sedes para GEA Perú (Workforce Management).
 */

// 🏢 Catálogo Oficial de Sedes Operativas GEA Perú en Nóminas
export const GEA_SEDES = {
  ATE: {
    id: 'ATE',
    nombre: 'Sede Ate (Av. Los Frutales)',
    alias: ['ATE', 'FRUTALES', 'LOS FRUTALES', 'SEDE ATE', 'PURUCHUCO', 'NICOLAS AYLLON', 'AV. NICOLAS AYLLON', 'SANTA CLARA', 'SEPARADORA INDUSTRIAL'],
    lat: -12.0565,
    lng: -76.9535,
    color: '#10B981', // Verde Neón (según requerimiento de usuario)
    distrito: 'ATE',
    direccion: 'Av. Los Frutales 451, Ate 15023, Lima, Perú'
  },
  JOCKEY: {
    id: 'JOCKEY',
    nombre: 'Sede Surco (Torre Omega / Manuel Olguín)',
    alias: ['JOCKEY', 'SURCO', 'SEDE JOCKEY', 'SEDE SURCO', 'MANUEL OLGUIN', 'OLGUIN', 'TORRE OMEGA', 'OMEGA', 'JAVIER PRADO', 'TREBOL', 'MONTERRICO', 'JOCKEY PLAZA'],
    lat: -12.0856,
    lng: -76.9729,
    color: '#F59E0B', // Ámbar Neón
    distrito: 'SANTIAGO DE SURCO',
    direccion: 'Av. Manuel Olguín 211, Santiago de Surco 15023, Lima, Perú'
  },
  SAN_ISIDRO: {
    id: 'SAN_ISIDRO',
    nombre: 'Sede San Isidro (República de Colombia)',
    alias: [
      'SAN ISIDRO', 'SAN_ISIDRO', 'REPUBLICA DE COLOMBIA', 'COLOMBIA', 'CANAVAL Y MOREYRA', 'CANAVAL', 'MOREYRA', 'CORPAC',
      'FINANCIERO', 'SEDE SAN ISIDRO', 'PANAMA', 'REPUBLICA DE PANAMA', 'EDIFICIO LAS NACIONES',
      'AV. REPUBLICA DE COLOMBIA', 'AV REPUBLICA DE COLOMBIA', 'S.I.', 'SI'
    ],
    lat: -12.0977,
    lng: -77.0232,
    color: '#06B6D4', // Cian Neón
    distrito: 'SAN ISIDRO',
    direccion: 'Av. República de Colombia 643, San Isidro 15046, Lima, Perú'
  },
  COMAS: {
    id: 'COMAS',
    nombre: 'Sede Comas (Mallplaza / Av. Los Ángeles)',
    alias: ['COMAS', 'ANGELES', 'LOS ANGELES', 'MALLPLAZA', 'NORTE', 'LIMA NORTE', 'SEDE COMAS', 'UNIVERSITARIA', 'TUPAC AMARU'],
    lat: -11.9365,
    lng: -77.0643,
    color: '#EC4899', // Rosa Neón
    distrito: 'COMAS',
    direccion: 'Av. Los Ángeles 602, Comas 15314, Lima, Perú'
  }
}

// 📍 Coordenadas de Centroides y Puntos Clave de Distritos de Lima Metropolitana
export const LIMA_DISTRITOS = {
  'ATE': { lat: -12.0432, lng: -76.9200, nombre: 'Ate' },
  'SAN LUIS': { lat: -12.0780, lng: -77.0010, nombre: 'San Luis' },
  'LOS OLIVOS': { lat: -11.9800, lng: -77.0680, nombre: 'Los Olivos' },
  'SAN MARTIN DE PORRES': { lat: -11.9950, lng: -77.0950, nombre: 'San Martín de Porres' },
  'SMP': { lat: -11.9950, lng: -77.0950, nombre: 'San Martín de Porres' },
  'LA MOLINA': { lat: -12.0860, lng: -76.9380, nombre: 'La Molina' },
  'RIMAC': { lat: -12.0320, lng: -77.0310, nombre: 'Rímac' },
  'SAN JUAN DE LURIGANCHO': { lat: -11.9820, lng: -76.9980, nombre: 'San Juan de Lurigancho' },
  'SJL': { lat: -11.9820, lng: -76.9980, nombre: 'San Juan de Lurigancho' },
  'COMAS': { lat: -11.9320, lng: -77.0490, nombre: 'Comas' },
  'INDEPENDENCIA': { lat: -11.9920, lng: -77.0540, nombre: 'Independencia' },
  'SANTA ANITA': { lat: -12.0480, lng: -76.9720, nombre: 'Santa Anita' },
  'EL AGUSTINO': { lat: -12.0480, lng: -77.0020, nombre: 'El Agustino' },
  'VILLA EL SALVADOR': { lat: -12.2100, lng: -76.9380, nombre: 'Villa El Salvador' },
  'VES': { lat: -12.2100, lng: -76.9380, nombre: 'Villa El Salvador' },
  'VILLA MARIA DEL TRIUNFO': { lat: -12.1620, lng: -76.9350, nombre: 'Villa María del Triunfo' },
  'VMT': { lat: -12.1620, lng: -76.9350, nombre: 'Villa María del Triunfo' },
  'SAN JUAN DE MIRAFLORES': { lat: -12.1550, lng: -76.9680, nombre: 'San Juan de Miraflores' },
  'SJM': { lat: -12.1550, lng: -76.9680, nombre: 'San Juan de Miraflores' },
  'SANTIAGO DE SURCO': { lat: -12.1400, lng: -76.9950, nombre: 'Santiago de Surco' },
  'SURCO': { lat: -12.1400, lng: -76.9950, nombre: 'Santiago de Surco' },
  'SURQUILLO': { lat: -12.1120, lng: -77.0150, nombre: 'Surquillo' },
  'CHORRILLOS': { lat: -12.1700, lng: -77.0180, nombre: 'Chorrillos' },
  'BREÑA': { lat: -12.0590, lng: -77.0520, nombre: 'Breña' },
  'LIMA': { lat: -12.0460, lng: -77.0420, nombre: 'Cercado de Lima' },
  'CERCADO DE LIMA': { lat: -12.0460, lng: -77.0420, nombre: 'Cercado de Lima' },
  'MAGDALENA DEL MAR': { lat: -12.0920, lng: -77.0700, nombre: 'Magdalena del Mar' },
  'MAGDALENA': { lat: -12.0920, lng: -77.0700, nombre: 'Magdalena del Mar' },
  'PUEBLO LIBRE': { lat: -12.0750, lng: -77.0650, nombre: 'Pueblo Libre' },
  'JESUS MARIA': { lat: -12.0720, lng: -77.0480, nombre: 'Jesús María' },
  'LINCE': { lat: -12.0840, lng: -77.0340, nombre: 'Lince' },
  'SAN ISIDRO': { lat: -12.0970, lng: -77.0280, nombre: 'San Isidro' },
  'MIRAFLORES': { lat: -12.1220, lng: -77.0290, nombre: 'Miraflores' },
  'BELLAVISTA': { lat: -12.0610, lng: -77.1260, nombre: 'Bellavista' },
  'CALLAO': { lat: -12.0560, lng: -77.1180, nombre: 'Callao' },
  'LA PERLA': { lat: -12.0680, lng: -77.1150, nombre: 'La Perla' },
  'CARABAYLLO': { lat: -11.8750, lng: -77.0320, nombre: 'Carabayllo' },
  'PUENTE PIEDRA': { lat: -11.8650, lng: -77.0750, nombre: 'Puente Piedra' },
  'VENTANILLA': { lat: -11.8780, lng: -77.1290, nombre: 'Ventanilla' },
  'SAN MIGUEL': { lat: -12.0780, lng: -77.0910, nombre: 'San Miguel' },
  'LURIN': { lat: -12.2740, lng: -76.8710, nombre: 'Lurín' },
  'PACHACAMAC': { lat: -12.1800, lng: -76.8600, nombre: 'Pachacámac' },
  'CHACLACAYO': { lat: -11.9800, lng: -76.7700, nombre: 'Chaclacayo' },
  'LURIGANCHO': { lat: -11.9400, lng: -76.7050, nombre: 'Chosica / Lurigancho' },
  'CHOSICA': { lat: -11.9400, lng: -76.7050, nombre: 'Chosica' },
  'SAN BORJA': { lat: -12.0920, lng: -77.0010, nombre: 'San Borja' },
  'BARRANCO': { lat: -12.1480, lng: -77.0210, nombre: 'Barranco' }
}

// 📍 Coordenadas de Departamentos y Ciudades de Todo el Perú (Cobertura Nacional para Remotos y Provincias)
export const PERU_DEPARTAMENTOS = {
  'PIURA': { lat: -5.1945, lng: -80.6328, nombre: 'Piura' },
  'SULLANA': { lat: -4.9039, lng: -80.6853, nombre: 'Sullana (Piura)' },
  'TALARA': { lat: -4.5772, lng: -81.2719, nombre: 'Talara (Piura)' },
  'PAITA': { lat: -5.0892, lng: -81.1144, nombre: 'Paita (Piura)' },
  'LAMBAYEQUE': { lat: -6.7714, lng: -79.8409, nombre: 'Lambayeque' },
  'CHICLAYO': { lat: -6.7714, lng: -79.8409, nombre: 'Chiclayo' },
  'FERREÑAFE': { lat: -6.6417, lng: -79.7900, nombre: 'Ferreñafe' },
  'JOSE LEONARDO ORTIZ': { lat: -6.7583, lng: -79.8333, nombre: 'José Leonardo Ortiz' },
  'LA LIBERTAD': { lat: -8.1116, lng: -79.0287, nombre: 'La Libertad' },
  'TRUJILLO': { lat: -8.1116, lng: -79.0287, nombre: 'Trujillo' },
  'CHEPEN': { lat: -7.2278, lng: -79.4319, nombre: 'Chepén' },
  'PACASMAYO': { lat: -7.4006, lng: -79.5714, nombre: 'Pacasmayo' },
  'AREQUIPA': { lat: -16.4090, lng: -71.5375, nombre: 'Arequipa' },
  'CERRO COLORADO': { lat: -16.3756, lng: -71.5658, nombre: 'Cerro Colorado' },
  'PAUCARPATA': { lat: -16.4256, lng: -71.5033, nombre: 'Paucarpata' },
  'CAYMA': { lat: -16.3861, lng: -71.5433, nombre: 'Cayma' },
  'CUSCO': { lat: -13.5319, lng: -71.9675, nombre: 'Cusco' },
  'WANCHAQ': { lat: -13.5250, lng: -71.9567, nombre: 'Wanchaq' },
  'SANTIAGO': { lat: -13.5361, lng: -71.9806, nombre: 'Santiago' },
  'SAN SEBASTIAN': { lat: -13.5283, lng: -71.9286, nombre: 'San Sebastián' },
  'JUNIN': { lat: -12.0651, lng: -75.2049, nombre: 'Junín' },
  'HUANCAYO': { lat: -12.0651, lng: -75.2049, nombre: 'Huancayo' },
  'EL TAMBO': { lat: -12.0558, lng: -75.2169, nombre: 'El Tambo' },
  'CHILCA': { lat: -12.0833, lng: -75.2000, nombre: 'Chilca' },
  'ICA': { lat: -14.0678, lng: -75.7286, nombre: 'Ica' },
  'CHINCHA': { lat: -13.4167, lng: -76.1333, nombre: 'Chincha' },
  'PISCO': { lat: -13.7083, lng: -76.2000, nombre: 'Pisco' },
  'NAZCA': { lat: -14.8306, lng: -74.9389, nombre: 'Nazca' },
  'ANCASH': { lat: -9.5278, lng: -77.5278, nombre: 'Áncash' },
  'CHIMBOTE': { lat: -9.0767, lng: -78.5928, nombre: 'Chimbote' },
  'HUARAZ': { lat: -9.5278, lng: -77.5278, nombre: 'Huaraz' },
  'NUEVO CHIMBOTE': { lat: -9.1233, lng: -78.5286, nombre: 'Nuevo Chimbote' },
  'TACNA': { lat: -18.0146, lng: -70.2536, nombre: 'Tacna' },
  'LORETO': { lat: -3.7491, lng: -73.2538, nombre: 'Loreto' },
  'IQUITOS': { lat: -3.7491, lng: -73.2538, nombre: 'Iquitos' },
  'UCAYALI': { lat: -8.3791, lng: -74.5539, nombre: 'Ucayali' },
  'PUCALLPA': { lat: -8.3791, lng: -74.5539, nombre: 'Pucallpa' },
  'SAN MARTIN': { lat: -6.4867, lng: -76.3689, nombre: 'San Martín' },
  'TARAPOTO': { lat: -6.4867, lng: -76.3689, nombre: 'Tarapoto' },
  'MOYOBAMBA': { lat: -6.0333, lng: -76.9667, nombre: 'Moyobamba' },
  'CAJAMARCA': { lat: -7.1638, lng: -78.5128, nombre: 'Cajamarca' },
  'JAEN': { lat: -5.7083, lng: -78.8083, nombre: 'Jaén' },
  'PUNO': { lat: -15.8402, lng: -70.0219, nombre: 'Puno' },
  'JULIACA': { lat: -15.4989, lng: -70.1333, nombre: 'Juliaca' },
  'AYACUCHO': { lat: -13.1588, lng: -74.2239, nombre: 'Ayacucho' },
  'HUAMANGA': { lat: -13.1588, lng: -74.2239, nombre: 'Huamanga' },
  'TUMBES': { lat: -3.5669, lng: -80.4515, nombre: 'Tumbes' },
  'HUANUCO': { lat: -9.9306, lng: -76.2422, nombre: 'Huánuco' },
  'PASCO': { lat: -10.6675, lng: -76.2561, nombre: 'Cerro de Pasco' },
  'MOQUEGUA': { lat: -17.1983, lng: -70.9356, nombre: 'Moquegua' },
  'ILO': { lat: -17.6394, lng: -71.3375, nombre: 'Ilo' },
  'MADRE DE DIOS': { lat: -12.5933, lng: -69.1891, nombre: 'Madre de Dios' },
  'PUERTO MALDONADO': { lat: -12.5933, lng: -69.1891, nombre: 'Puerto Maldonado' },
  'AMAZONAS': { lat: -6.2317, lng: -77.8690, nombre: 'Amazonas' },
  'CHACHAPOYAS': { lat: -6.2317, lng: -77.8690, nombre: 'Chachapoyas' },
  'APURIMAC': { lat: -13.6339, lng: -72.8814, nombre: 'Apurímac' },
  'ABANCAY': { lat: -13.6339, lng: -72.8814, nombre: 'Abancay' },
  'HUANCAVELICA': { lat: -12.7864, lng: -74.9725, nombre: 'Huancavelica' }
}

/**
 * Jitter posicional determinista basado en un seed (ej: documento del postulante).
 * Reemplaza Math.random() para que useMemo() sea estable entre renders.
 */
export function stableJitter(seed, scale = 0.007) {
  const s = String(seed || 'x').split('').reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7)
  const jLat = ((s * 1664525 + 1013904223) % 65536) / 65536 - 0.5
  const jLng = ((s * 22695477 + 1) % 65536) / 65536 - 0.5
  return { jLat: jLat * scale, jLng: jLng * scale }
}

/**
 * Fórmula de Haversine para calcular distancia en kilómetros entre dos coordenadas
 */
export function calculateHaversineKm(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return 0
  const R = 6371 // Radio de la Tierra en km
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return Number((R * c).toFixed(1))
}

/**
 * Normaliza y resuelve el distrito desde lugar_residencia o direccion_domicilio
 */
export function resolveDistrictCoordinates(rawLugar, rawDireccion, seed = '') {
  const cleanStr = `${rawLugar || ''} ${rawDireccion || ''}`.toUpperCase().trim()

  for (const [key, distInfo] of Object.entries(LIMA_DISTRITOS)) {
    if (cleanStr.includes(key)) {
      // Jitter determinista: mismo postulante → mismo punto en el mapa entre renders
      const { jLat, jLng } = stableJitter(seed || cleanStr, 0.007)
      return {
        distrito: distInfo.nombre,
        distritoKey: key,
        lat: distInfo.lat + jLat,
        lng: distInfo.lng + jLng,
        resolved: true
      }
    }
  }

  // 2. Cobertura Nacional: Chequear provincias y departamentos del resto del Perú
  for (const [key, depInfo] of Object.entries(PERU_DEPARTAMENTOS)) {
    if (cleanStr.includes(key)) {
      const { jLat, jLng } = stableJitter(seed || cleanStr, 0.012)
      return {
        distrito: depInfo.nombre,
        distritoKey: key,
        lat: depInfo.lat + jLat,
        lng: depInfo.lng + jLng,
        resolved: true
      }
    }
  }

  // Fallback si no hay match directo: asigna distrito estimado de Ate o Lima Centro
  const { jLat, jLng } = stableJitter(seed || cleanStr, 0.02)
  return {
    distrito: rawLugar ? rawLugar.trim().toUpperCase() : 'LIMA METROPOLITANA',
    distritoKey: 'ATE',
    lat: LIMA_DISTRITOS['ATE'].lat + jLat,
    lng: LIMA_DISTRITOS['ATE'].lng + jLng,
    resolved: false
  }
}

/**
 * Resuelve la sede física de GEA asignada al postulante o grupo
 */
/**
 * Resuelve la sede física de GEA asignada al postulante o grupo
 * Sedes oficiales: Ate, Jockey, San Isidro (Canaval y Moreyra) y Comas.
 */
export function resolveSedeGea(rawSede, p = {}) {
  const fields = [
    rawSede,
    p.sede,
    p.sede_capacitacion,
    p.sede_trabajo,
    p.lugar_capacitacion,
    p.direccion_capacitacion,
    p.grupo_codigo,
    p.campana,
    p.campaign,
    p.observacion
  ].map(v => String(v || '').toUpperCase().trim()).filter(Boolean)

  const combined = fields.join(' ')

  // 1. Buscar primero coincidencia con las 4 sedes operativas oficiales (Ate, Jockey, San Isidro, Comas)
  // De esta manera, si un asesor remoto pertenece operativamente a Sede San Isidro o Jockey, se respeta su sede.
  for (const [key, sede] of Object.entries(GEA_SEDES)) {
    if (sede.alias.some(a => combined.includes(a)) || key === combined || sede.id === combined) {
      return sede
    }
  }

  // 2. Si no tiene sede física y la modalidad indica explícitamente REMOTO o HOME OFFICE
  const mod = String(p.modalidad || '').toUpperCase()
  if (mod.includes('REMOT') || combined.includes('REMOT') || combined.includes('HOME OFFICE') || combined.includes('TELETRABAJO')) {
    return {
      id: 'REMOTO',
      nombre: 'Modalidad Remota (Teletrabajo)',
      alias: ['REMOTO', 'HOME OFFICE', 'TELETRABAJO'],
      lat: null,
      lng: null,
      color: '#6366F1',
      distrito: 'REMOTO',
      direccion: 'Teletrabajo / Home Office (Sin traslado físico diario)'
    }
  }

  // 3. Por defecto, sede principal histórica de GEA (Ate - Puruchuco)
  return GEA_SEDES.ATE
}

/**
 * Procesa la nómina de postulantes y genera los enlaces de movilidad y trayectorias
 * EXCLUSIVAMENTE CON DATOS REALES DE OPERACIÓN (sin invención ni datos mock)
 */
export function analyzeMobilityAndDistances(postulantes = [], { periodo = 'TODOS', asistencias = [] } = {}) {
  const allPostulantes = Array.isArray(postulantes) ? postulantes : []

  // Extraer catálogo de períodos reales de reclutamiento (ej. 202609, 202608)
  const periodosSet = new Set()
  allPostulantes.forEach(p => {
    const per = String(p.periodo_reclutado || '').trim()
    if (per && /^\d{6}$/.test(per)) periodosSet.add(per)
  })
  if (periodosSet.size === 0) {
    periodosSet.add('202609')
    periodosSet.add('202608')
  }
  const periodosDisponibles = Array.from(periodosSet).sort().reverse()

  // 1. Filtrar postulantes según el período solicitado
  let basePostulantes = allPostulantes
  if (periodo && periodo !== 'TODOS') {
    basePostulantes = allPostulantes.filter(p => {
      const per = String(p.periodo_reclutado || '').trim()
      return per === periodo
    })
  }

  // Si no hay datos reales en la base de datos o nómina cargada, retornar estructura vacía
  if (basePostulantes.length === 0) {
    return {
      postulantesMapped: [],
      distritosStats: [],
      sedeStats: [],
      metricasGlobales: {
        totalMapeados: 0,
        presencialesCount: 0,
        remotosCount: 0,
        iopCount: 0,
        activosCount: 0,
        bajasCount: 0,
        distanciaPromedioKm: 0,
        optimosCount: 0,
        mediosCount: 0,
        criticosCount: 0,
        pctCriticos: 0,
        bajasPorDistancia: 0,
        reubicacionesSugeridas: 0
      },
      sugerenciasReubicacion: [],
      periodosDisponibles
    }
  }

  // Pre-indexar asistencias con sigla I-OP, Bajas, Día 0 y Día 1 para cruce rápido O(1)
  const iopDocsSet = new Set()
  const bajaDocsMap = new Map()
  const dia0DocsSet = new Set()
  const dia1DocsSet = new Set()
  if (Array.isArray(asistencias)) {
    asistencias.forEach(a => {
      const doc = String(a.postulante_documento || a.documento || '').trim()
      const s = String(a.sigla || a.sigla_asistencia || a.estado || '').trim().toUpperCase()
      const diaNum = Number(a.dia)
      if (doc && (s === 'I-OP' || s === 'IOP' || s.includes('INGRESO'))) {
        iopDocsSet.add(doc)
      } else if (doc && (s === 'B' || s.includes('BAJA') || s === 'CESE' || a.motivo_baja)) {
        bajaDocsMap.set(doc, a.motivo_baja || 'BAJA EN ASISTENCIA')
      }
      if (doc && diaNum === 0 && (s === 'A' || s === 'FJ' || s === 'I-OP' || s === 'ASISTIO')) {
        dia0DocsSet.add(doc)
      }
      if (doc && (diaNum === 1 || diaNum >= 1) && (s === 'A' || s === 'FI' || s === 'FJ' || s === 'I-OP' || s === 'ASISTIO') && s !== 'B' && s !== 'NSP') {
        dia1DocsSet.add(doc)
      }
    })
  }

  let sumDistanciaPresencial = 0
  let countPresencialDistancia = 0
  let presencialesCount = 0
  let remotosCount = 0
  let iopCount = 0
  let activosCount = 0
  let bajasCount = 0
  let optimosCount = 0
  let mediosCount = 0
  let criticosCount = 0
  let bajasPorDistancia = 0

  const distritosCounter = new Map()
  const sedeCounter = new Map()
  const sugerenciasReubicacion = []

  const postulantesMapped = basePostulantes.map((p, idx) => {
    const rawLugar = p.lugar_residencia || p.distrito_residencia || ''
    const rawDir = p.direccion_domicilio || ''
    const rawSede = p.sede || ''
    const doc = String(p.documento || p.postulante_documento || '').trim()

    // ── A. MODALIDAD: PRESENCIAL vs REMOTO ──
    const rawMod = String(p.modalidad || p.tipo_trabajo || p.condicion || '').toUpperCase().trim()
    const rawCamp = String(p.campana || p.campaign || '').toUpperCase()
    const rawSedeStr = String(rawSede).toUpperCase()
    const rawObs = String(p.observacion_reclutamiento || p.observacion || '').toUpperCase()

    const isRemoto =
      rawMod.includes('REMOT') || rawMod.includes('HOME') || rawMod.includes('TELETRABAJO') || rawMod.includes('VIRTUAL') ||
      rawCamp.includes('REMOT') || rawCamp.includes('HOME') ||
      rawSedeStr.includes('REMOT') || rawSedeStr.includes('HOME') ||
      rawObs.includes('REMOT') || rawObs.includes('HOME')

    const modalidad = isRemoto ? 'REMOTO' : 'PRESENCIAL'
    if (modalidad === 'REMOTO') remotosCount++
    else presencialesCount++

    // ── B. ESTADO OPERATIVO: I-OP (Ingresó a Operación) vs ACTIVO vs BAJA ──
    // IMPORTANTE: Un ingreso a operación I-OP REAL requiere registro formal de asistencia I-OP
    // o estado I-OP. NUNCA debe marcarse solo por tener una fecha estimada futura en fecha_conexion_op.
    const estadoRaw = String(p.estado || p.estado_capacitacion || p.sigla || '').toUpperCase().trim()
    const rawStatusD1 = String(p.status_dia_1 || '').toUpperCase().trim()
    const rawD1 = String(p.dia_1 || '').toUpperCase().trim()
    const hasAsistenciaBaja = bajaDocsMap.has(doc)

    const isIOP =
      iopDocsSet.has(doc) ||
      estadoRaw === 'I-OP' || estadoRaw === 'IOP' || estadoRaw === 'INGRESO A OPERACION' || estadoRaw === 'INGRESO' ||
      rawStatusD1 === 'I-OP' || rawStatusD1 === 'IOP' ||
      rawD1 === 'I-OP' || rawD1 === 'IOP'

    const isBaja =
      !isIOP && (
        hasAsistenciaBaja ||
        estadoRaw === 'BAJA' || estadoRaw === 'CESADO' || estadoRaw === 'DESERTO' ||
        rawStatusD1 === 'CESE' || rawStatusD1 === 'DESISTE' || rawStatusD1 === 'NO PROCEDE' || rawStatusD1 === 'BAJA' ||
        rawD1 === 'FALTA' || rawD1 === 'B' || rawD1.includes('BAJA') ||
        Boolean(p.motivo_baja) ||
        p.activo === false
      )

    const isActivo = !isIOP && !isBaja

    if (isIOP) iopCount++
    else if (isBaja) bajasCount++
    else activosCount++

    const estadoOperativo = isIOP ? 'I-OP' : isBaja ? 'BAJA' : 'ACTIVO'
    const motivoBaja = p.motivo_baja || bajaDocsMap.get(doc) || (isBaja ? (rawStatusD1 || rawD1 || 'DESERCIÓN / CESE') : '')

    // ── C. GEOLOCALIZACIÓN Y SEDE ──
    const geoSeed = doc || p.id || String(idx)
    const geoDomicilio = resolveDistrictCoordinates(rawLugar, rawDir, geoSeed)
    const sedeAsignada = resolveSedeGea(rawSede, p)

    let distanciaKm = 0
    let tiempoEstimadoMin = 0
    let riesgoDistancia = 'OPTIMA'

    if (modalidad === 'PRESENCIAL' && sedeAsignada.lat && sedeAsignada.lng) {
      distanciaKm = calculateHaversineKm(
        geoDomicilio.lat,
        geoDomicilio.lng,
        sedeAsignada.lat,
        sedeAsignada.lng
      )
      tiempoEstimadoMin = Math.round(distanciaKm * 2.8)
      sumDistanciaPresencial += distanciaKm
      countPresencialDistancia++

      if (distanciaKm > 14) {
        riesgoDistancia = 'CRITICA'
        criticosCount++
        if (isBaja) bajasPorDistancia++
      } else if (distanciaKm > 7) {
        riesgoDistancia = 'MEDIA'
        mediosCount++
      } else {
        optimosCount++
      }
    } else {
      // Para asesores remotos no hay trayecto físico
      distanciaKm = 0
      tiempoEstimadoMin = 0
      riesgoDistancia = 'OPTIMA'
      optimosCount++
    }

    // ── D. MOTOR DE REUBICACIÓN DE SEDES (Solo Presenciales con trayecto > 11 km) ──
    let sedeOptima = null
    let ahorroKm = 0
    if (modalidad === 'PRESENCIAL' && distanciaKm > 11) {
      for (const [key, otraSede] of Object.entries(GEA_SEDES)) {
        if (otraSede.id !== sedeAsignada.id && otraSede.lat && otraSede.lng) {
          const dOtra = calculateHaversineKm(
            geoDomicilio.lat,
            geoDomicilio.lng,
            otraSede.lat,
            otraSede.lng
          )
          if (dOtra < distanciaKm - 5.5) {
            if (!sedeOptima || dOtra < calculateHaversineKm(geoDomicilio.lat, geoDomicilio.lng, sedeOptima.lat, sedeOptima.lng)) {
              sedeOptima = otraSede
              ahorroKm = Number((distanciaKm - dOtra).toFixed(1))
            }
          }
        }
      }
    }

    if (sedeOptima) {
      const dOptima = calculateHaversineKm(geoDomicilio.lat, geoDomicilio.lng, sedeOptima.lat, sedeOptima.lng)
      const candNombre = p.candidato || `${p.nombres || ''} ${p.apellido_paterno || ''}`.trim() || 'Postulante GEA'
      sugerenciasReubicacion.push({
        id: p.id || doc || idx,
        nombre: candNombre,
        candidato: candNombre,
        documento: doc || '—',
        distrito: geoDomicilio.distrito || 'LIMA',
        direccion: rawDir || 'Domicilio Registrado',
        sedeActual: sedeAsignada.nombre,
        distanciaActual: distanciaKm,
        distanciaActualKm: distanciaKm,
        tiempoActualMin: tiempoEstimadoMin,
        sedeSugerida: sedeOptima.nombre,
        distanciaSugerida: dOptima,
        distanciaOptimaKm: dOptima,
        tiempoSugeridoMin: Math.round(dOptima * 2.8),
        ahorroKm,
        ahorroMin: Math.round(ahorroKm * 2.8),
        modalidad,
        estadoOperativo,
        esBaja: isBaja,
        esIOP: isIOP
      })
    }

    // Acumular conteos por distrito
    const distKey = geoDomicilio.distrito
    if (!distritosCounter.has(distKey)) {
      distritosCounter.set(distKey, {
        distrito: distKey,
        total: 0,
        activos: 0,
        iop: 0,
        bajas: 0,
        lat: geoDomicilio.lat,
        lng: geoDomicilio.lng
      })
    }
    const dEntry = distritosCounter.get(distKey)
    dEntry.total++
    if (isIOP) dEntry.iop++
    else if (isBaja) dEntry.bajas++
    else dEntry.activos++

    // Acumular conteos por sede
    const sedeKey = sedeAsignada.id
    if (!sedeCounter.has(sedeKey)) {
      sedeCounter.set(sedeKey, {
        sede: sedeAsignada,
        totalPostulantes: 0,
        distanciaTotal: 0
      })
    }
    const sEntry = sedeCounter.get(sedeKey)
    sEntry.totalPostulantes++
    sEntry.distanciaTotal += distanciaKm

    const asesorNombre = p.candidato || `${p.nombres || ''} ${p.apellido_paterno || ''}`.trim() || 'Asesor GEA'
    return {
      id: p.id || doc || idx,
      nombre: asesorNombre,
      candidato: asesorNombre,
      documento: doc,
      distrito: geoDomicilio.distrito || 'LIMA',
      direccion: rawDir,
      origenLat: geoDomicilio.lat,
      origenLng: geoDomicilio.lng,
      sede: sedeAsignada,
      destinoLat: sedeAsignada.lat,
      destinoLng: sedeAsignada.lng,
      modalidad, // 'PRESENCIAL' | 'REMOTO'
      estadoOperativo, // 'I-OP' | 'ACTIVO' | 'BAJA'
      esIOP: isIOP,
      esActivo: isActivo,
      // ── ETAPAS DEL EMBUDO OPERATIVO REAL (Nómina -> Día 0 -> Día 1) ──
      asistioDia0: Boolean(
        dia0DocsSet.has(doc) ||
        String(p.dia_0 || p.asistencia_dia_0 || '').toUpperCase().includes('ASIST') ||
        String(p.dia_0 || p.asistencia_dia_0 || '').toUpperCase() === 'SI' ||
        String(p.dia_0 || p.asistencia_dia_0 || '').toUpperCase() === 'SÍ' ||
        String(p.dia_0 || p.asistencia_dia_0 || '').toUpperCase() === 'OK' ||
        String(p.dia_0 || p.asistencia_dia_0 || '').toUpperCase() === 'A' ||
        Boolean(p.evaluacion_dia_0 || p.nota_dia_0)
      ),
      asistioDia1: Boolean(
        isIOP ||
        dia1DocsSet.has(doc) ||
        rawD1 === 'ASISTIO' || rawD1 === 'A' || rawD1.includes('ASIST') ||
        rawStatusD1 === 'APTO' || rawStatusD1 === 'COMPLETO' || rawStatusD1 === 'USUARIO CREADO' ||
        rawStatusD1 === 'ASISTIO' ||
        Boolean(p.evaluacion_dia_1 || p.nota_dia_1)
      ),
      ingresoOJT: Boolean(
        isIOP ||
        (
          (rawD1 === 'ASISTIO' || rawD1 === 'A' || rawStatusD1 === 'APTO' || rawStatusD1 === 'COMPLETO') &&
          !isBaja &&
          (
            String(p.estado || p.estado_capacitacion || '').toUpperCase().includes('OJT') ||
            (p.fecha_conexion_ojt && new Date(p.fecha_conexion_ojt + 'T00:00:00') <= new Date())
          )
        )
      ),
      motivoBaja,
      distanciaKm,
      tiempoEstimadoMin,
      riesgoDistancia,
      sedeSugerida: sedeOptima ? sedeOptima.nombre : null,
      ahorroKm,
      periodo: String(p.periodo_reclutado || p.semana_trabajo || '').trim(),
      campana: String(p.campana || p.campaign || '').trim()
    }
  })

  const total = postulantesMapped.length
  const distanciaPromedioKm = countPresencialDistancia > 0
    ? Number((sumDistanciaPresencial / countPresencialDistancia).toFixed(1))
    : 0

  const distritosStats = Array.from(distritosCounter.values()).sort((a, b) => b.total - a.total)
  const sedeStats = Array.from(sedeCounter.values())

  return {
    postulantesMapped,
    distritosStats,
    sedeStats,
    metricasGlobales: {
      totalMapeados: total,
      presencialesCount,
      remotosCount,
      iopCount,
      activosCount,
      bajasCount,
      distanciaPromedioKm,
      optimosCount,
      mediosCount,
      criticosCount,
      pctCriticos: countPresencialDistancia > 0 ? Math.round((criticosCount / countPresencialDistancia) * 100) : 0,
      bajasPorDistancia,
      reubicacionesSugeridas: sugerenciasReubicacion.length
    },
    sugerenciasReubicacion,
    periodosDisponibles
  }
}
