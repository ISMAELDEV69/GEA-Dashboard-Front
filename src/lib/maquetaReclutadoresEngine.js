/**
 * maquetaReclutadoresEngine.js
 * Motor de Cálculo Oficial de Maquetas de Pago e Indicadores para Reclutadores
 * Plataforma Web GEA - Workforce Management
 * 
 * Reglas de Negocio Oficiales:
 * 1. Métricas operativas desde Base (Día 1 y Dotación / RQ OP).
 * 2. Catálogo de reclutadores con cargo, bono bruto y modalidad (% Efectivo / % Sodexo).
 * 3. Matriz de pesos por cargo (Asistente 50/40/10, Analista 40/40/10/10, Coordinador 50/40/10, Supervisor 100% Día 1).
 * 4. Tramos de conversión a % de alcance por maqueta.
 * 5. Evaluación de liderazgo sobre la media general promedio del equipo.
 * 6. Calidad por defecto al 100% salvo auditorías específicas.
 */

// ── 1. MATRIZ DE CONFIGURACIÓN Y PESOS POR CARGO ─────────────────────────────
export const MATRIZ_CARGOS = {
  ASISTENTE: {
    id: 'ASISTENTE',
    label: 'Asistente de Reclutamiento y Selección',
    pesoDia1: 50,
    pesoDotacion: 40,
    pesoCalidad: 10,
    pesoProcesosAdm: 0,
    bonoDefault: 400,
    pctEfectivoDefault: 60,
    pctSodexoDefault: 40,
    esLiderazgo: false,
    descripcion: 'Ponderación: 50% Día 1 + 40% Dotación + 10% Calidad'
  },
  ANALISTA: {
    id: 'ANALISTA',
    label: 'Analista de Reclutamiento y Selección',
    pesoDia1: 40,
    pesoDotacion: 40,
    pesoCalidad: 10,
    pesoProcesosAdm: 10,
    bonoDefault: 800,
    pctEfectivoDefault: 60,
    pctSodexoDefault: 40,
    esLiderazgo: false,
    descripcion: 'Ponderación: 40% Día 1 + 40% Dotación + 10% Calidad + 10% Procesos Adm.'
  },
  ANALISTA_ADMINISTRATIVO: {
    id: 'ANALISTA_ADMINISTRATIVO',
    label: 'Analista Administrativo de Reclutamiento y Selección',
    pesoDia1: 0,
    pesoDotacion: 90,
    pesoCalidad: 10,
    pesoProcesosAdm: 0,
    bonoDefault: 400,
    pctEfectivoDefault: 60,
    pctSodexoDefault: 40,
    esLiderazgo: false,
    descripcion: 'Ponderación: 90% Dotación (RQ Cerrados / Aperturados) + 10% Calidad'
  },
  COORDINADOR: {
    id: 'COORDINADOR',
    label: 'Coordinador / Jefatura de RyS',
    pesoDia1: 50,
    pesoDotacion: 40,
    pesoCalidad: 10,
    pesoProcesosAdm: 0,
    bonoDefault: 1000,
    pctEfectivoDefault: 75,
    pctSodexoDefault: 25,
    esLiderazgo: true,
    descripcion: 'Evaluado sobre la Media General del Equipo (50% Día 1 + 40% Dotación + 10% Calidad)'
  },
  SUPERVISOR: {
    id: 'SUPERVISOR',
    label: 'Supervisor de Reclutamiento y Selección',
    pesoDia1: 100,
    pesoDotacion: 0,
    pesoCalidad: 0,
    pesoProcesosAdm: 0,
    bonoDefault: 800,
    pctEfectivoDefault: 75,
    pctSodexoDefault: 25,
    esLiderazgo: true,
    descripcion: 'Evaluado al 100% sobre Día 1 de la Media General del Equipo'
  }
}

// ── 2. ESCALAS DE TRAMOS Y CONVERSIÓN A % DE ALCANCE (MAQUETAS) ──────────────

/**
 * Escalas de Dotación según Cargo
 */
export function getAlcanceDotacion(pctCumplimiento, cargoClave = 'ASISTENTE') {
  const val = Number(pctCumplimiento) || 0
  const c = String(cargoClave).toUpperCase()

  // Analista: 60%->50%, 70%->70%, 75%->85%, 80%->100%
  if (c === 'ANALISTA') {
    if (val >= 80.00) return { alcance: 100.00, tramo: '≥ 80.00%', semaforo: 'VERDE' }
    if (val >= 75.00) return { alcance: 85.00, tramo: '75.00% a 79.99%', semaforo: 'AMBAR' }
    if (val >= 70.00) return { alcance: 70.00, tramo: '70.00% a 74.99%', semaforo: 'AMBAR' }
    if (val >= 60.00) return { alcance: 50.00, tramo: '60.00% a 69.99%', semaforo: 'AMBAR' }
    return { alcance: 0.00, tramo: '< 60.00%', semaforo: 'ROJO' }
  }

  // Analista Administrativo: 65%->50%, 70%->70%, 75%->85%, 80%->100%
  if (c === 'ANALISTA_ADMINISTRATIVO') {
    if (val >= 80.00) return { alcance: 100.00, tramo: '≥ 80.00%', semaforo: 'VERDE' }
    if (val >= 75.00) return { alcance: 85.00, tramo: '75.00% a 79.99%', semaforo: 'AMBAR' }
    if (val >= 70.00) return { alcance: 70.00, tramo: '70.00% a 74.99%', semaforo: 'AMBAR' }
    if (val >= 65.00) return { alcance: 50.00, tramo: '65.00% a 69.99%', semaforo: 'AMBAR' }
    return { alcance: 0.00, tramo: '< 65.00%', semaforo: 'ROJO' }
  }

  // Coordinador / Jefatura: 65%->70%, 75%->85%, 80%->100%
  if (c === 'COORDINADOR') {
    if (val >= 80.00) return { alcance: 100.00, tramo: '≥ 80.00%', semaforo: 'VERDE' }
    if (val >= 75.00) return { alcance: 85.00, tramo: '75.00% a 79.99%', semaforo: 'AMBAR' }
    if (val >= 65.00) return { alcance: 70.00, tramo: '65.00% a 74.99%', semaforo: 'AMBAR' }
    return { alcance: 0.00, tramo: '< 65.00%', semaforo: 'ROJO' }
  }

  // Asistente (Default): 75%->70%, 80%->85%, 90%->100% (o 65%->70%)
  if (val >= 90.00) return { alcance: 100.00, tramo: '≥ 90.00%', semaforo: 'VERDE' }
  if (val >= 80.00) return { alcance: 85.00, tramo: '80.00% a 89.99%', semaforo: 'AMBAR' }
  if (val >= 75.00) return { alcance: 70.00, tramo: '75.00% a 79.99%', semaforo: 'AMBAR' }
  if (val >= 65.00) return { alcance: 70.00, tramo: '65.00% a 74.99%', semaforo: 'AMBAR' }
  return { alcance: 0.00, tramo: '< 65.00%', semaforo: 'ROJO' }
}

/**
 * Escalas de Día 1 según Cargo
 */
export function getAlcanceDia1(pctCumplimiento, cargoClave = 'ASISTENTE') {
  const val = Number(pctCumplimiento) || 0
  const c = String(cargoClave).toUpperCase()

  // Supervisor: <85%->0, 85%->70, 95%->80, 100%->90, 110%->95, >=120%->100
  if (c === 'SUPERVISOR') {
    if (val >= 120.00) return { alcance: 100.00, tramo: '≥ 120.00%', semaforo: 'VERDE' }
    if (val >= 110.00) return { alcance: 95.00, tramo: '110.00% a 119.99%', semaforo: 'VERDE' }
    if (val >= 100.00) return { alcance: 90.00, tramo: '100.00% a 109.99%', semaforo: 'AMBAR' }
    if (val >= 95.00) return { alcance: 80.00, tramo: '95.00% a 99.99%', semaforo: 'AMBAR' }
    if (val >= 85.00) return { alcance: 70.00, tramo: '85.00% a 94.99%', semaforo: 'AMBAR' }
    return { alcance: 0.00, tramo: '< 85.00%', semaforo: 'ROJO' }
  }

  // Coordinador / Jefatura: 70%->70, 80%->80, >=100%->100
  if (c === 'COORDINADOR') {
    if (val >= 100.00) return { alcance: 100.00, tramo: '≥ 100.00%', semaforo: 'VERDE' }
    if (val >= 80.00) return { alcance: 80.00, tramo: '80.00% a 99.99%', semaforo: 'AMBAR' }
    if (val >= 70.00) return { alcance: 70.00, tramo: '70.00% a 79.99%', semaforo: 'AMBAR' }
    return { alcance: 0.00, tramo: '< 70.00%', semaforo: 'ROJO' }
  }

  // Analista: 60%->50%, 70%->70%, 85%->85%, >=100%->100%
  if (c === 'ANALISTA') {
    if (val >= 100.00) return { alcance: 100.00, tramo: '≥ 100.00%', semaforo: 'VERDE' }
    if (val >= 85.00) return { alcance: 85.00, tramo: '85.00% a 99.99%', semaforo: 'AMBAR' }
    if (val >= 70.00) return { alcance: 70.00, tramo: '70.00% a 84.99%', semaforo: 'AMBAR' }
    if (val >= 60.00) return { alcance: 50.00, tramo: '60.00% a 69.99%', semaforo: 'AMBAR' }
    return { alcance: 0.00, tramo: '< 60.00%', semaforo: 'ROJO' }
  }

  // Asistente (Default): 75%->70%, 85%->85%, >=100%->100%
  if (val >= 100.00) return { alcance: 100.00, tramo: '≥ 100.00%', semaforo: 'VERDE' }
  if (val >= 85.00) return { alcance: 85.00, tramo: '85.00% a 99.99%', semaforo: 'AMBAR' }
  if (val >= 75.00) return { alcance: 70.00, tramo: '75.00% a 84.99%', semaforo: 'AMBAR' }
  return { alcance: 0.00, tramo: '< 75.00%', semaforo: 'ROJO' }
}

/**
 * Escalas de Calidad (General)
 */
export function getAlcanceCalidad(pctCumplimiento) {
  const val = Number(pctCumplimiento) || 0
  if (val >= 80.00) return { alcance: 100.00, tramo: '≥ 80.00%', semaforo: 'VERDE' }
  if (val >= 75.00) return { alcance: 85.00, tramo: '75.00% a 79.99%', semaforo: 'AMBAR' }
  if (val >= 70.00) return { alcance: 70.00, tramo: '70.00% a 74.99%', semaforo: 'AMBAR' }
  if (val >= 65.00) return { alcance: 50.00, tramo: '65.00% a 69.99%', semaforo: 'AMBAR' }
  return { alcance: 0.00, tramo: '< 65.00%', semaforo: 'ROJO' }
}

/**
 * Escalas de Procesos Administrativos (Para Analistas)
 */
export function getAlcanceProcesosAdm(pctCumplimiento) {
  const val = Number(pctCumplimiento) || 0
  if (val >= 80.00) return { alcance: 100.00, tramo: '≥ 80.00%', semaforo: 'VERDE' }
  if (val >= 75.00) return { alcance: 85.00, tramo: '75.00% a 79.99%', semaforo: 'AMBAR' }
  if (val >= 70.00) return { alcance: 70.00, tramo: '70.00% a 74.99%', semaforo: 'AMBAR' }
  if (val >= 65.00) return { alcance: 50.00, tramo: '65.00% a 69.99%', semaforo: 'AMBAR' }
  return { alcance: 0.00, tramo: '< 65.00%', semaforo: 'ROJO' }
}

/**
 * Normaliza y clasifica el cargo funcional a la clave de maqueta
 */
export function clasificarCargoReclutador(cargoRaw) {
  const c = String(cargoRaw || '').trim().toUpperCase()
  if (c.includes('SUPERVISOR')) return 'SUPERVISOR'
  if (c.includes('COORDINADOR') || c.includes('JEFE') || c.includes('JEFATURA') || c.includes('LIDER')) return 'COORDINADOR'
  if (c.includes('ADMINISTRATIVO')) return 'ANALISTA_ADMINISTRATIVO'
  if (c.includes('ANALISTA') || c.includes('SENIOR') || c.includes('SR')) return 'ANALISTA'
  return 'ASISTENTE'
}

/**
 * Formatea número a dos decimales con redondeo financiero
 */
export function round2(num) {
  const n = Number(num)
  if (!Number.isFinite(n)) return 0
  return Math.round((n + Number.EPSILON) * 100) / 100
}

/**
 * Formatea valor en moneda Soles (S/)
 */
export function fmtMoney(num) {
  const val = round2(num)
  return `S/ ${val.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/**
 * Formatea porcentaje con 2 decimales
 */
export function fmtPct(num) {
  const val = round2(num)
  return `${val.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`
}

// ── 3. MOTOR PRINCIPAL DE CÁLCULO DE MAQUETA Y BONOS ─────────────────────────
/**
 * @param {Array} kpiRows - Filas filtradas de kpi_reclutadores_consolidado
 * @param {Array} equipoList - Lista de equipo_reclutamiento
 * @param {Object} manualOverrides - Sobrescrituras manuales de Calidad y Procesos Adm. por reclutador { [nombre]: { calidad: 100, procesosAdm: 100 } }
 * @param {Object} options - Opciones de cálculo (useTope: boolean, etc.)
 */
export function calcularMaquetaBonosReclutadores(kpiRows = [], equipoList = [], manualOverrides = {}, options = {}) {
  const { useTope = false, modelo = 'sheets_oficial' } = options

  // Normalizador de nombres para cruces exactos
  const norm = (s) => String(s || '').trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ')

  // 1. Mapeo del catálogo maestro de reclutadores
  const equipoMap = new Map()
  for (const eq of equipoList || []) {
    const apP = eq.apellido_paterno || ''
    const apM = eq.apellido_materno || ''
    const nomb = eq.nombres_completos || ''
    const full = norm(`${apP} ${apM} ${nomb}`)
    const fullInverted = norm(`${nomb} ${apP} ${apM}`)
    const fullSinMaterno = norm(`${apP} ${nomb}`)
    const fullInvertedSinMaterno = norm(`${nomb} ${apP}`)
    const alias = norm(eq.alias)
    const alix = norm(eq.alix)
    const doc = String(eq.documento || '').trim()
    const info = {
      documento: doc,
      nombresCompletos: `${apP} ${apM} ${nomb}`.trim() || eq.alias || 'RECLUTADOR',
      alias: eq.alias || '',
      cargo: eq.cargo || 'Asistente de Reclutamiento y Selección',
      cargoClave: clasificarCargoReclutador(eq.cargo),
      estado: (eq.estado || 'ACTIVO').trim().toUpperCase(),
      bonoBruto: Number(eq.bono) > 0 ? Number(eq.bono) : (MATRIZ_CARGOS[clasificarCargoReclutador(eq.cargo)]?.bonoDefault || 400),
      pctEfectivo: Number(eq.pct_efectivo) >= 0 ? Number(eq.pct_efectivo) : 60,
      pctSodexo: Number(eq.pct_sodexo) >= 0 ? Number(eq.pct_sodexo) : 40,
      fechaIngreso: eq.fecha_ingreso || null,
      fechaCese: eq.fecha_cese || null,
    }
    if (full) equipoMap.set(full, info)
    if (fullInverted) equipoMap.set(fullInverted, info)
    if (fullSinMaterno) equipoMap.set(fullSinMaterno, info)
    if (fullInvertedSinMaterno) equipoMap.set(fullInvertedSinMaterno, info)
    if (alias) equipoMap.set(alias, info)
    if (alix) equipoMap.set(alix, info)
    if (doc) equipoMap.set(doc, info)
    if (nomb) equipoMap.set(norm(nomb), info)
  }

  // 2. Agrupación y suma de datos operativos acumulados por Reclutador (Base)
  const operacionMap = new Map()

  for (const row of kpiRows || []) {
    const rawName = String(row.responsable || '').trim()
    const n = norm(rawName)
    if (!n || n === 'ADMIN' || n === 'RECLUTADOR' || n.includes('SIN NOMINA') || n.includes('SIN ASIGNAR')) continue

    if (!operacionMap.has(n)) {
      operacionMap.set(n, {
        key: n,
        nombreOriginal: rawName,
        nombresOriginalesSet: new Set([rawName]),
        dia1: 0,
        dia1SinTope: 0,
        dia1ConTope: 0,
        dia1Meta: 0,
        dotacion: 0,
        dotacionSinTope: 0,
        dotacionConTope: 0,
        rq: 0,
        nomina: 0,
        aptos: 0,
        evaluados: 0,
        gruposCount: 0,
        campanas: new Set(),
        gruposDetalle: [],
      })
    }

    const rec = operacionMap.get(n)
    rec.nombresOriginalesSet.add(rawName)

    const d1SinTope = Number(row.dia_1 || 0)
    const d1ConTope = Number(row.dia_1_tope ?? row.dia_1 ?? 0)
    const d1 = useTope ? d1ConTope : d1SinTope

    // Meta Día 1: Se prioriza meta_dia_1_individual, luego dia_1_tope o rq_individual
    const d1Meta = Number(row.meta_dia_1_individual || row.dia_1_tope || row.rq_individual || row.meta_dia_1_campana || 0)

    const dotSinTope = Number(row.dotacion_q || 0)
    const dotConTope = Number(row.dotacion_q_tope ?? row.dotacion_q ?? 0)
    const dot = useTope ? dotConTope : dotSinTope

    const rq = Number(row.rq_individual || row.rq || 0)
    const nom = Number(row.nomina || 0)
    const apt = Number(row.aptos || row.cantidad_aptos || 0)
    const evl = Number(row.evaluados || row.cantidad_evaluados || row.postulantes_evaluados || 0)

    rec.dia1 += d1
    rec.dia1SinTope += d1SinTope
    rec.dia1ConTope += d1ConTope
    rec.dia1Meta += d1Meta
    rec.dotacion += dot
    rec.dotacionSinTope += dotSinTope
    rec.dotacionConTope += dotConTope
    rec.rq += rq
    rec.nomina += nom
    rec.aptos += apt
    rec.evaluados += evl
    rec.gruposCount += 1
    if (row.campana) rec.campanas.add(row.campana)

    rec.gruposDetalle.push({
      codigoGpe: row.codigo_gpe || row.grupo_g || 'GPE-S/C',
      campana: row.campana || '-',
      segmento: row.segmento || '-',
      modalidad: row.modalidad || 'PRESENCIAL',
      semana: row.semana || '-',
      fechaInicio: row.fecha_inicio || '-',
      fechaIngresoOp: row.fecha_ingreso_op || '-',
      responsableOriginal: rawName,
      nomina: nom,
      dia1Meta: d1Meta,
      dia1GrupalMeta: Number(row.meta_dia_1_campana || 0),
      dia1: d1,
      dia1SinTope: d1SinTope,
      dia1ConTope: d1ConTope,
      dotacion: dot,
      dotacionSinTope: dotSinTope,
      dotacionConTope: dotConTope,
      rq: rq,
      aptos: apt,
      evaluados: evl,
      origenFuente: row.origen_fuente || 'CONSOLIDADO_VIVO',
      dia1Vivo: row.dia_1_vivo !== undefined ? Number(row.dia_1_vivo) : d1SinTope,
      dotacionVivo: row.dotacion_vivo !== undefined ? Number(row.dotacion_vivo) : dotSinTope,
      tieneDesfaseVivo: Boolean(row.tiene_desfase_vivo),
    })
  }

  // 3. Cálculo de la MEDIA GENERAL PROMEDIO DEL EQUIPO OPERATIVO
  let sumaEquipoDia1 = 0
  let sumaEquipoDia1Meta = 0
  let sumaEquipoDotacion = 0
  let sumaEquipoRq = 0

  for (const op of operacionMap.values()) {
    sumaEquipoDia1 += op.dia1
    sumaEquipoDia1Meta += op.dia1Meta
    sumaEquipoDotacion += op.dotacion
    sumaEquipoRq += op.rq
  }

  const mediaEquipoPctDia1 = sumaEquipoDia1Meta > 0
    ? round2((sumaEquipoDia1 / sumaEquipoDia1Meta) * 100)
    : 0

  const mediaEquipoPctDotacion = sumaEquipoRq > 0
    ? round2((sumaEquipoDotacion / sumaEquipoRq) * 100)
    : 0

  const alcanceMediaEquipoDia1 = getAlcanceDia1(mediaEquipoPctDia1)
  const alcanceMediaEquipoDotacion = getAlcanceDotacion(mediaEquipoPctDotacion)

  // Función auxiliar para resolver un nombre operativo contra el catálogo maestro
  const resolverMaster = (key) => {
    const direct = equipoMap.get(key)
    if (direct) {
      const isAliasMatch = norm(direct.alias) === key || norm(direct.alix) === key
      return { master: direct, tipoMatch: isAliasMatch ? 'ALIAS' : 'EXACTO' }
    }
    const keyWords = key.split(' ').filter(w => w.length > 2)
    for (const [k, v] of equipoMap.entries()) {
      if (k.length > 5 && (key.includes(k) || k.includes(key))) {
        return { master: v, tipoMatch: 'DIFUSO' }
      }
      if (keyWords.length >= 2) {
        const matchCount = keyWords.filter(w => k.includes(w)).length
        if (matchCount >= Math.min(2, keyWords.length)) {
          return { master: v, tipoMatch: 'DIFUSO' }
        }
      }
    }
    return { master: null, tipoMatch: 'NO_EN_CATALOGO' }
  }

  // 4. Consolidar primero por persona (docKey) para no perder grupos si un reclutador aparece con alias y nombre completo
  const personaMap = new Map()

  for (const [key, op] of operacionMap.entries()) {
    const { master, tipoMatch } = resolverMaster(key)
    const docKey = master?.documento || master?.nombresCompletos || op.nombreOriginal

    if (!personaMap.has(docKey)) {
      personaMap.set(docKey, {
        docKey,
        master,
        tipoMatch,
        nombreOriginal: op.nombreOriginal,
        nombresOriginalesSet: new Set(op.nombresOriginalesSet),
        dia1: 0,
        dia1SinTope: 0,
        dia1ConTope: 0,
        dia1Meta: 0,
        dotacion: 0,
        dotacionSinTope: 0,
        dotacionConTope: 0,
        rq: 0,
        nomina: 0,
        aptos: 0,
        evaluados: 0,
        gruposCount: 0,
        campanas: new Set(),
        gruposDetalle: [],
      })
    }

    const p = personaMap.get(docKey)
    if (!p.master && master) p.master = master
    if (p.tipoMatch === 'NO_EN_CATALOGO' && tipoMatch !== 'NO_EN_CATALOGO') p.tipoMatch = tipoMatch
    for (const nOrig of op.nombresOriginalesSet) p.nombresOriginalesSet.add(nOrig)

    p.dia1 += op.dia1
    p.dia1SinTope += op.dia1SinTope
    p.dia1ConTope += op.dia1ConTope
    p.dia1Meta += op.dia1Meta
    p.dotacion += op.dotacion
    p.dotacionSinTope += op.dotacionSinTope
    p.dotacionConTope += op.dotacionConTope
    p.rq += op.rq
    p.nomina += op.nomina
    p.aptos += op.aptos
    p.evaluados += op.evaluados
    p.gruposCount += op.gruposCount
    for (const c of op.campanas) p.campanas.add(c)
    p.gruposDetalle.push(...op.gruposDetalle)
  }

  // Agregar reclutadores activos del catálogo que no tuvieron grupos en el corte
  for (const eq of equipoList || []) {
    const estado = (eq.estado || 'ACTIVO').trim().toUpperCase()
    if (estado !== 'ACTIVO') continue
    const apP = eq.apellido_paterno || ''
    const apM = eq.apellido_materno || ''
    const nomb = eq.nombres_completos || ''
    const full = norm(`${apP} ${apM} ${nomb}`)
    const master = equipoMap.get(full) || equipoMap.get(String(eq.documento || '').trim())
    if (!master) continue
    const docKey = master.documento || master.nombresCompletos
    if (!personaMap.has(docKey)) {
      personaMap.set(docKey, {
        docKey,
        master,
        tipoMatch: 'SIN_GRUPOS',
        nombreOriginal: master.nombresCompletos,
        nombresOriginalesSet: new Set(),
        dia1: 0,
        dia1SinTope: 0,
        dia1ConTope: 0,
        dia1Meta: 0,
        dotacion: 0,
        dotacionSinTope: 0,
        dotacionConTope: 0,
        rq: 0,
        nomina: 0,
        aptos: 0,
        evaluados: 0,
        gruposCount: 0,
        campanas: new Set(),
        gruposDetalle: [],
      })
    }
  }

  const filasCalculadas = []

  for (const op of personaMap.values()) {
    const { docKey, master, tipoMatch } = op
    const cargoClave = master?.cargoClave || clasificarCargoReclutador(master?.cargo)
    const configCargo = MATRIZ_CARGOS[cargoClave] || MATRIZ_CARGOS.ASISTENTE
    const esLider = configCargo.esLiderazgo

    const isSheetsOficial = modelo !== 'diferenciado'

    // Metas y cumplimiento operativo del reclutador
    let pctDia1Operativo = op.dia1Meta > 0 ? round2((op.dia1 / op.dia1Meta) * 100) : 0
    let pctDotacionOperativo = op.rq > 0 ? round2((op.dotacion / op.rq) * 100) : 0

    // Si es posición de liderazgo (Coordinador, Jefe, Supervisor), se evalúa sobre la media/suma consolidada del equipo
    const evaluadoSobreEquipo = esLider || (cargoClave === 'COORDINADOR' || cargoClave === 'SUPERVISOR')
    const pctDia1ParaMaqueta = evaluadoSobreEquipo ? mediaEquipoPctDia1 : pctDia1Operativo
    const pctDotacionParaMaqueta = evaluadoSobreEquipo ? mediaEquipoPctDotacion : pctDotacionOperativo

    // Pesos según modelo
    const pesoDia1 = isSheetsOficial ? 50.00 : configCargo.pesoDia1
    const pesoDotacion = isSheetsOficial ? 40.00 : configCargo.pesoDotacion
    const pesoCalidad = isSheetsOficial ? 10.00 : configCargo.pesoCalidad
    const pesoProcesosAdm = isSheetsOficial ? 0.00 : configCargo.pesoProcesosAdm

    // Búsqueda en Maqueta (% Alcance)
    const escalaCargoD1 = isSheetsOficial ? 'ASISTENTE' : cargoClave
    const escalaCargoDot = isSheetsOficial ? 'ASISTENTE' : cargoClave

    const objAlcanceD1 = getAlcanceDia1(pctDia1ParaMaqueta, escalaCargoD1)
    const objAlcanceDot = getAlcanceDotacion(pctDotacionParaMaqueta, escalaCargoDot)

    const alcanceDia1 = objAlcanceD1.alcance
    const alcanceDotacion = objAlcanceDot.alcance

    // Calidad: Fórmula oficial: Calidad (%) = (Cantidad de Aptos / Cantidad de Evaluados). Objetivo meta: 80.00%
    const overrides = manualOverrides[docKey] || manualOverrides[norm(op.nombreOriginal)] || {}
    let pctCalidadReal = 100.00
    let origenCalidad = 'DEFAULT_100'
    if (overrides.calidad !== undefined) {
      pctCalidadReal = Number(overrides.calidad)
      origenCalidad = 'AUDITORIA_MANUAL'
    } else if (op.evaluados > 0) {
      pctCalidadReal = round2((op.aptos / op.evaluados) * 100)
      origenCalidad = 'OPERATIVO_EVALUADOS'
    }

    // % Alcance de Calidad según escala (<65%->0%, 65%->50%, 70%->70%, 75%->85%, >=80%->100%)
    const objAlcanceCalidad = getAlcanceCalidad(pctCalidadReal)
    const alcanceCalidad = objAlcanceCalidad.alcance
    const alcanceProcesosAdm = Number(overrides.procesosAdm !== undefined ? overrides.procesosAdm : 100.00)
    const origenProcesosAdm = overrides.procesosAdm !== undefined ? 'AUDITORIA_MANUAL' : 'DEFAULT_100'

    // Cálculo de Puntos por Indicador: Puntos (%) = % Alcance * Peso (10.00% para Calidad)
    const puntosDia1 = round2((alcanceDia1 * pesoDia1) / 100)
    const puntosDotacion = round2((alcanceDotacion * pesoDotacion) / 100)
    const puntosCalidad = round2((alcanceCalidad * pesoCalidad) / 100)
    const puntosProcesosAdm = round2((alcanceProcesosAdm * pesoProcesosAdm) / 100)

    const totalPuntosPct = round2(puntosDia1 + puntosDotacion + puntosCalidad + puntosProcesosAdm)

    // Bono Bruto y Distribución Financiera
    const defaultBono = (['ANALISTA', 'SUPERVISOR'].includes(cargoClave)) ? 800 : (configCargo.bonoDefault || 400)
    const bonoBruto = master?.bonoBruto || defaultBono
    const pctEfectivo = master?.pctEfectivo !== undefined ? master.pctEfectivo : (isSheetsOficial ? 60 : configCargo.pctEfectivoDefault)
    const pctSodexo = master?.pctSodexo !== undefined ? master.pctSodexo : (isSheetsOficial ? 40 : configCargo.pctSodexoDefault)

    // Valla Mínima de Activación (Trigger): por defecto 45.00% para evitar pagos por inercia si no cumplieron metas operativas
    const vallaMinima = options.vallaMinima !== undefined ? Number(options.vallaMinima) : 45.00
    const pasaValla = totalPuntosPct >= vallaMinima

    const bonoNeto = pasaValla ? round2(bonoBruto * (totalPuntosPct / 100)) : 0.00
    const bonoEfectivo = pasaValla ? round2(bonoNeto * (pctEfectivo / 100)) : 0.00
    const bonoSodexo = pasaValla ? round2(bonoNeto * (pctSodexo / 100)) : 0.00

    // Semáforo global del resultado
    let semaforoGlobal = 'ROJO'
    if (totalPuntosPct >= 85.00) semaforoGlobal = 'VERDE'
    else if (totalPuntosPct >= 70.00) semaforoGlobal = 'AMBAR'

    filasCalculadas.push({
      key: docKey,
      nombre: master?.nombresCompletos || op.nombreOriginal,
      documento: master?.documento || '',
      alias: master?.alias || '',
      cargo: master?.cargo || configCargo.label,
      cargoClave,
      configCargo,
      estado: master?.estado || 'ACTIVO',
      fechaIngreso: master?.fechaIngreso || null,
      fechaCese: master?.fechaCese || null,
      enCatalogo: Boolean(master),
      tipoMatch,
      pasaValla,
      vallaMinima,
      nombresNominaCruzados: Array.from(op.nombresOriginalesSet),
      gruposDetalle: op.gruposDetalle,
      tieneDesfaseVivo: op.gruposDetalle.some(g => g.tieneDesfaseVivo),
      evaluadoSobreEquipo,
      campanas: Array.from(op.campanas).join(', '),
      gruposCount: op.gruposCount,
      
      // Métricas Operativas Individuales Directas (incluso si es líder, guardamos las propias para trazabilidad)
      dia1Propio: op.dia1,
      dia1MetaPropio: op.dia1Meta,
      dotacionPropia: op.dotacion,
      rqPropio: op.rq,

      // Métricas Operativas Aplicadas (para líderes se refleja la suma y media global del equipo)
      dia1Real: evaluadoSobreEquipo ? sumaEquipoDia1 : op.dia1,
      dia1SinTope: op.dia1SinTope,
      dia1ConTope: op.dia1ConTope,
      dia1Meta: evaluadoSobreEquipo ? sumaEquipoDia1Meta : op.dia1Meta,
      pctDia1Operativo: evaluadoSobreEquipo ? mediaEquipoPctDia1 : pctDia1Operativo,
      dotacionReal: evaluadoSobreEquipo ? sumaEquipoDotacion : op.dotacion,
      dotacionSinTope: op.dotacionSinTope,
      dotacionConTope: op.dotacionConTope,
      rqReal: evaluadoSobreEquipo ? sumaEquipoRq : op.rq,
      pctDotacionOperativo: evaluadoSobreEquipo ? mediaEquipoPctDotacion : pctDotacionOperativo,
      nominaReal: op.nomina,
      aptosReal: op.aptos,
      evaluadosReal: op.evaluados,
      pctCalidadReal,
      origenCalidad,
      origenProcesosAdm,
      auditNote: overrides.motivo || '',
      auditUpdatedAt: overrides.fecha || null,

      // Valores Aplicados a Maqueta (si es líder, media del equipo)
      pctDia1Aplicado: pctDia1ParaMaqueta,
      pctDotacionAplicado: pctDotacionParaMaqueta,

      // Pesos Aplicados
      pesoDia1,
      pesoDotacion,
      pesoCalidad,
      pesoProcesosAdm,

      // Alcances de Maqueta
      alcanceDia1,
      tramoDia1: objAlcanceD1.tramo,
      semaforoDia1: objAlcanceD1.semaforo,

      alcanceDotacion,
      tramoDotacion: objAlcanceDot.tramo,
      semaforoDotacion: objAlcanceDot.semaforo,

      alcanceCalidad,
      tramoCalidad: objAlcanceCalidad.tramo,
      semaforoCalidad: objAlcanceCalidad.semaforo,
      alcanceProcesosAdm,

      // Puntos por Indicador
      puntosDia1,
      puntosDotacion,
      puntosCalidad,
      puntosProcesosAdm,
      totalPuntosPct,

      // Liquidación Financiera
      bonoBruto,
      pctEfectivo,
      pctSodexo,
      bonoNeto,
      bonoEfectivo,
      bonoSodexo,
      semaforoGlobal
    })
  }

  // Ordenar por Bono Neto descendente, luego por total de puntos
  filasCalculadas.sort((a, b) => b.bonoNeto - a.bonoNeto || b.totalPuntosPct - a.totalPuntosPct)

  // 5. Totales y KPIs globales del corte
  const resumenGeneral = {
    totalEvaluados: filasCalculadas.length,
    totalEnMeta: filasCalculadas.filter(f => f.totalPuntosPct >= 85).length,
    totalSinCatalogo: filasCalculadas.filter(f => !f.enCatalogo).length,
    totalConDesfaseVivo: filasCalculadas.filter(f => f.tieneDesfaseVivo).length,
    totalBonoBrutoPresupuestado: round2(filasCalculadas.reduce((acc, f) => acc + f.bonoBruto, 0)),
    totalBonoNetoAPagar: round2(filasCalculadas.reduce((acc, f) => acc + f.bonoNeto, 0)),
    totalPagoEfectivo: round2(filasCalculadas.reduce((acc, f) => acc + f.bonoEfectivo, 0)),
    totalPagoSodexo: round2(filasCalculadas.reduce((acc, f) => acc + f.bonoSodexo, 0)),
    ahorroPresupuestal: round2(
      filasCalculadas.reduce((acc, f) => acc + f.bonoBruto, 0) -
      filasCalculadas.reduce((acc, f) => acc + f.bonoNeto, 0)
    ),
    promedioAlcanceGlobal: filasCalculadas.length > 0
      ? round2(filasCalculadas.reduce((acc, f) => acc + f.totalPuntosPct, 0) / filasCalculadas.length)
      : 0,
    mediaEquipo: {
      dia1Total: Math.round(sumaEquipoDia1),
      dia1MetaTotal: Math.round(sumaEquipoDia1Meta),
      pctDia1: mediaEquipoPctDia1,
      alcanceDia1: alcanceMediaEquipoDia1.alcance,
      tramoDia1: alcanceMediaEquipoDia1.tramo,
      dotacionTotal: Math.round(sumaEquipoDotacion),
      rqTotal: Math.round(sumaEquipoRq),
      pctDotacion: mediaEquipoPctDotacion,
      alcanceDotacion: alcanceMediaEquipoDotacion.alcance,
      tramoDotacion: alcanceMediaEquipoDotacion.tramo
    }
  }

  return {
    filas: filasCalculadas,
    resumen: resumenGeneral,
    mediaEquipo: resumenGeneral.mediaEquipo
  }
}
