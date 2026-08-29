/**
 * performanceScorecardEngine.js
 * Motor analítico de Ficha de Desempeño 360° (Estilo GEA ATC)
 * Especializado para Reclutadores y Formadores (Trainers) de GEA Perú.
 * Calibración de Datos, Búsqueda Multi-Criterio (DNI / Alias / Nombre) y Cuartiles.
 */

// ── Normalización de Cadenas Uniforme (Sin Acentos ni Espacios Extras) ──────
export const norm = (val) => String(val || '')
  .trim()
  .toUpperCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/\s+/g, ' ')

export const cleanAlphaNum = (val) => String(val || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase()

export const matchPerson = (fieldVal, target, catalogObj = null) => {
  if (!target || target === 'ALL') return true
  const f = norm(fieldVal)
  const t = norm(target)
  if (!f || !t) return false
  if (f === t) return true
  if (f.includes(t) || t.includes(f)) return true

  // Verificación cruzada con DNI, Usuario o Alias si existe objeto de catálogo
  if (catalogObj) {
    const cDoc = norm(catalogObj.documento || catalogObj.dni || catalogObj.doc)
    const cUser = norm(catalogObj.usuario || catalogObj.alias || catalogObj.email)
    if (cDoc && (cDoc === t || t.includes(cDoc))) return true
    if (cUser && (cUser === t || t.includes(cUser))) return true
  }

  const fWords = f.split(/\s+/).filter(w => w.length >= 3)
  const tWords = t.split(/\s+/).filter(w => w.length >= 3)
  return fWords.some(w => tWords.includes(w))
}

export const parseDateStr = (raw) => {
  if (!raw) return null
  if (typeof raw === 'string') {
    const clean = raw.split('T')[0].split(' ')[0]
    if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return clean
    const dmy = clean.split(/[-/]/)
    if (dmy.length === 3) {
      if (dmy[0].length === 4) return `${dmy[0]}-${dmy[1].padStart(2, '0')}-${dmy[2].padStart(2, '0')}`
      if (dmy[2].length === 4) return `${dmy[2]}-${dmy[1].padStart(2, '0')}-${dmy[0].padStart(2, '0')}`
    }
  }
  try {
    const d = new Date(raw)
    if (!isNaN(d.getTime())) return d.toISOString().split('T')[0]
  } catch (e) {
    // fallback
  }
  return null
}

// ── Asignación de Estrellas (1 a 5) ─────────────────────────────────────────
export function computeStars(pct) {
  if (pct >= 100) return 5
  if (pct >= 85) return 4
  if (pct >= 70) return 3
  if (pct >= 50) return 2
  return 1
}

// ── Cálculo de Cuartiles (Q1 a Q4) ──────────────────────────────────────────
export function assignQuartiles(list = [], scoreKey = 'score') {
  if (!list.length) return []
  const sorted = [...list].sort((a, b) => (b[scoreKey] || 0) - (a[scoreKey] || 0))
  const n = sorted.length
  return sorted.map((item, idx) => {
    const rank = idx + 1
    const percentile = ((n - rank) / Math.max(1, n - 1)) * 100
    let quartile = 'Q4'
    let quartileColor = '#f43f5e' // Neon Rose
    let quartileLabel = 'Cuartil Q4 - En Riesgo'

    if (percentile >= 75 || rank <= Math.ceil(n * 0.25)) {
      quartile = 'Q1'
      quartileColor = '#10b981' // Neon Emerald
      quartileLabel = 'Cuartil Q1 - Top Performance'
    } else if (percentile >= 50 || rank <= Math.ceil(n * 0.50)) {
      quartile = 'Q2'
      quartileColor = '#06b6d4' // Neon Cyan
      quartileLabel = 'Cuartil Q2 - Destacado'
    } else if (percentile >= 25 || rank <= Math.ceil(n * 0.75)) {
      quartile = 'Q3'
      quartileColor = '#f59e0b' // Neon Amber
      quartileLabel = 'Cuartil Q3 - Regular'
    }

    return {
      ...item,
      rank,
      totalRank: n,
      percentile: Math.round(percentile),
      quartile,
      quartileColor,
      quartileLabel
    }
  })
}

// ════════════════════════════════════════════════════════════════════════════
// 1. MOTOR ANALÍTICO PARA RECLUTADORES
// ════════════════════════════════════════════════════════════════════════════

export function computeAllRecruitersPerformance(
  postulantes = [],
  asistencias = [],
  campanasMetas = [],
  attendanceIndexes = null,
  reclutadoresCatalog = [],
  formadoresCatalog = []
) {
  const recruiterMap = new Map()
  
  // Set de postulantes con asistencia en Día 1, Ingreso OP o Bajas
  const opDocs = attendanceIndexes?.opDocsSet || new Set()
  const bajasDocs = attendanceIndexes?.bajasDocsSet || new Set()
  const d1Docs = new Set()

  asistencias.forEach(a => {
    const doc = a.postulante_documento || a.documento
    if (!doc) return
    const sigla = a.sigla_asistencia
    if (sigla === 'I-OP') {
      opDocs.add(doc)
      d1Docs.add(doc)
    } else if (sigla === 'B') {
      bajasDocs.add(doc)
    } else if (sigla === 'A' || sigla === 'FJ' || sigla === 'T') {
      d1Docs.add(doc)
    }
  })

  // Catalog de Formadores para exclusión estricta
  const formadorNamesSet = new Set()
  ;(formadoresCatalog || []).forEach(f => {
    const n = typeof f === 'string' ? f : (f?.nombre_completo || f?.nombre || '')
    if (n) formadorNamesSet.add(norm(n))
    if (f?.alix) formadorNamesSet.add(norm(f.alix))
    if (f?.documento || f?.dni) formadorNamesSet.add(norm(f.documento || f.dni))
  })

  // Catalog Map para enriquecer DNI y usuario
  const catMap = new Map()
  ;(reclutadoresCatalog || []).forEach(r => {
    const name = typeof r === 'string' ? r : (r?.nombre_completo || r?.nombre || '')
    if (name) {
      catMap.set(norm(name), {
        dni: r?.documento || r?.dni || '',
        usuario: r?.usuario || r?.alias || r?.email?.split('@')[0] || '',
        email: r?.email || r?.correo || '',
        segmento: r?.segmento || 'GENERAL'
      })
    }
  })

  // Agrupar postulantes por reclutador
  postulantes.forEach(p => {
    const recName = (p.reclutador || 'SIN RECLUTADOR').trim()
    if (!recName || norm(recName) === 'SIN RECLUTADOR') return

    // Si es un formador y no es un reclutador explícito de catálogo, no agrupar como reclutador
    const isExplicitRec = catMap.has(norm(recName))
    if (!isExplicitRec && (formadorNamesSet.has(norm(recName)) || (p.reclutador_dni && formadorNamesSet.has(norm(p.reclutador_dni))))) {
      return
    }

    if (!recruiterMap.has(recName)) {
      const catInfo = catMap.get(norm(recName)) || {}
      recruiterMap.set(recName, {
        nombre: recName,
        dni: catInfo.dni || p.reclutador_dni || '',
        usuario: catInfo.usuario || p.reclutador_usuario || '',
        email: catInfo.email || '',
        segmento: catInfo.segmento || p.segmento || 'GENERAL',
        postulantes: [],
        campanas: new Set(),
        grupos: new Set()
      })
    }
    const recObj = recruiterMap.get(recName)
    recObj.postulantes.push(p)
    if (p.campana) recObj.campanas.add(p.campana)
    if (p.grupo_codigo) recObj.grupos.add(p.grupo_codigo)
  })

  const recruiterScores = []

  recruiterMap.forEach((recObj, recName) => {
    if (recName === 'SIN RECLUTADOR' || norm(recName) === 'SIN RECLUTADOR' || !recName) return

    const total = recObj.postulantes.length
    if (total === 0) return

    let qDia1 = 0
    let ingresantesOP = 0
    let bajas = 0
    let bajasImputables = 0
    let enCapacitacion = 0

    recObj.postulantes.forEach(p => {
      const doc = p.documento
      const isOP = opDocs.has(doc) || norm(p.estado) === 'INGRESO_OP' || norm(p.estado) === 'EN_OPERACIONES'
      const isBaja = bajasDocs.has(doc) || norm(p.estado) === 'BAJA' || Boolean(p.motivo_baja)
      const isImputable = isBaja && (
        p.baja_imputable === true || 
        norm(p.tipo_baja) === 'IMPUTABLE' || 
        norm(p.motivo_baja).includes('PERFIL') || 
        norm(p.motivo_baja).includes('SELECCION')
      )
      
      // Calibración estricta de Q Día 1:
      // Debe tener marca de asistencia en D1 (A, FJ, T, I-OP), o dia_1 === 'ASISTIO', o estado CAPACITACION/INGRESO_OP
      const d1Field = norm(p.dia_1)
      const statusD1 = norm(p.status_dia_1)
      const hasD1 = d1Docs.has(doc) || 
        d1Field === 'ASISTIO' || 
        d1Field === 'A' || 
        d1Field.includes('ASIST') ||
        statusD1 === 'RECUPERADO' ||
        statusD1 === 'AGREGADO' ||
        norm(p.estado) === 'CAPACITACION' ||
        norm(p.estado) === 'EN_CAPACITACION' ||
        isOP

      if (hasD1) qDia1++

      if (isOP) {
        ingresantesOP++
      } else if (isBaja) {
        bajas++
        if (isImputable) bajasImputables++
      } else if (hasD1) {
        enCapacitacion++
      }
    })

    // ── VINCULACIÓN DIRECTA CON "METAS Y EQUIPOS" (capacidad_rys + grupo_reclutadores) ──
    let metaRqReal = 0
    let metaDia1Real = 0
    let gruposAsignadosCount = 0

    ;(campanasMetas || []).forEach(g => {
      // Buscar si el reclutador está asignado en este grupo
      const recMetaItem = (g.reclutadores_metas || []).find(rm => 
        matchPerson(rm.nombre_completo, recName) ||
        (rm.documento && (rm.documento === recObj.dni || String(recObj.dni).includes(rm.documento))) ||
        (rm.alias && (norm(rm.alias) === norm(recObj.usuario)))
      )

      if (recMetaItem) {
        gruposAsignadosCount++
        metaRqReal += (Number(recMetaItem.meta_rq_individual) || 0)
        metaDia1Real += (Number(recMetaItem.meta_dia_1_individual) || 0)
      } else if (recObj.grupos && recObj.grupos.has(g.grupo_codigo)) {
        // Si tiene postulantes en el grupo pero sin cuota individual explícita
        gruposAsignadosCount++
      }
    })

    // Meta final calibrada (Metas y Equipos o cuota base del período)
    const metaVolumen = metaRqReal > 0 ? metaRqReal : Math.max(total, 35)
    const metaQDia1 = metaDia1Real > 0 ? metaDia1Real : Math.max(1, Math.round(metaVolumen * 0.70))
    const metaIngresosOP = Math.max(1, Math.round(metaVolumen * 0.45))

    const pctCumplimientoVolumen = Math.min(200, Math.round((total / metaVolumen) * 100))
    const pctConversionOP = total > 0 ? Math.round((ingresantesOP / total) * 100) : 0
    const pctQDia1 = total > 0 ? Math.round((qDia1 / total) * 100) : 0
    const pctBajasImputables = total > 0 ? Math.round((bajasImputables / total) * 100) : 0

    // Score Ponderado: 40% Ingresantes OP + 30% Q Día 1 + 30% Volumen Meta - Penalidad Bajas Imputables
    const score = Math.max(0, Math.round(
      (pctConversionOP * 0.40) +
      (pctQDia1 * 0.30) +
      (pctCumplimientoVolumen * 0.30) -
      (pctBajasImputables * 0.15)
    ))

    recruiterScores.push({
      nombre: recName,
      dni: recObj.dni,
      usuario: recObj.usuario,
      email: recObj.email,
      segmento: recObj.segmento,
      totalPostulantes: total,
      qDia1,
      ingresantesOP,
      bajas,
      bajasImputables,
      enCapacitacion,
      metaVolumen,
      metaQDia1,
      metaIngresosOP,
      metaRqReal,
      metaDia1Real,
      gruposAsignadosCount,
      pctCumplimientoVolumen,
      pctConversionOP,
      pctQDia1,
      pctBajasImputables,
      score,
      postulantes: recObj.postulantes
    })
  })

  return assignQuartiles(recruiterScores, 'score')
}

// ── Detalle Individual y Evolución Diaria del Reclutador ────────────────────
export function getRecruiterIndividualDetails(
  targetIdentifier,
  postulantes = [],
  asistencias = [],
  allRankedRecruiters = [],
  campanasMetas = []
) {
  if (!allRankedRecruiters.length) return null

  const target = norm(targetIdentifier)
  const rankedItem = allRankedRecruiters.find(r => 
    norm(r.nombre) === target ||
    norm(r.dni) === target ||
    norm(r.usuario) === target ||
    matchPerson(r.nombre, targetIdentifier)
  ) || allRankedRecruiters[0]

  if (!rankedItem) return null

  const myPostulantes = postulantes.filter(p => matchPerson(p.reclutador, rankedItem.nombre))
  
  const today = new Date()
  const currentDay = today.getDate()
  const totalDaysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()
  const daysPassed = Math.max(1, currentDay)

  const runRateFactor = totalDaysInMonth / daysPassed
  const projectedVolumen = Math.round(rankedItem.totalPostulantes * runRateFactor)
  const projectedIngresantesOP = Math.round(rankedItem.ingresantesOP * runRateFactor)

  // Calcular ranking dinámico dentro del mismo Segmento de negocio
  const mySeg = norm(rankedItem.segmento || 'GENERAL')
  const segRecruiters = allRankedRecruiters
    .filter(r => norm(r.segmento || 'GENERAL') === mySeg)
    .sort((a, b) => (b.score || 0) - (a.score || 0))

  const segmentRank = Math.max(1, segRecruiters.findIndex(r => r.nombre === rankedItem.nombre) + 1)
  const totalInSegment = Math.max(1, segRecruiters.length)

  let runRateMsg = `Si sigues a este ritmo alcanzarás ~${projectedIngresantesOP} INGRESANTES A LA OPERACIÓN.`
  let runRateStatus = 'success'
  if (projectedIngresantesOP >= rankedItem.metaIngresosOP) {
    runRateMsg += ` ✔️ Superarías tu meta mensual (${rankedItem.metaIngresosOP}).`
  } else {
    const diff = rankedItem.metaIngresosOP - projectedIngresantesOP
    runRateMsg += ` ⚠️ Faltarían ~${diff} para alcanzar la meta (${rankedItem.metaIngresosOP}).`
    runRateStatus = 'warning'
  }

  const dailyMap = new Map()
  for (let d = 1; d <= Math.min(daysPassed, totalDaysInMonth); d++) {
    const label = `${d}`
    dailyMap.set(label, {
      dia: label,
      postulantes: 0,
      qDia1: 0,
      ingresantesOP: 0,
      bajas: 0
    })
  }

  myPostulantes.forEach(p => {
    const dateStr = parseDateStr(p.fecha_ingreso || p.fecha_registro || p.created_at)
    if (dateStr) {
      const dNum = parseInt(dateStr.split('-')[2], 10)
      const label = `${dNum}`
      if (dailyMap.has(label)) {
        const row = dailyMap.get(label)
        row.postulantes++
        const isOP = norm(p.estado) === 'INGRESO_OP' || norm(p.estado) === 'EN_OPERACIONES'
        const isBaja = norm(p.estado) === 'BAJA' || Boolean(p.motivo_baja)
        const d1Field = norm(p.dia_1)
        const statusD1 = norm(p.status_dia_1)
        const hasD1 = d1Field === 'ASISTIO' || d1Field === 'A' || d1Field.includes('ASIST') || statusD1 === 'RECUPERADO' || statusD1 === 'AGREGADO' || norm(p.estado) === 'CAPACITACION' || isOP

        if (hasD1) row.qDia1++
        if (isOP) row.ingresantesOP++
        if (isBaja) row.bajas++
      }
    }
  })

  const dailyEvolution = Array.from(dailyMap.values())

  // Desglose de rendimiento por Grupo asignado (Individual vs Equipo)
  const gruposBreakdown = []
  const groupCodesSet = new Set(myPostulantes.map(p => norm(p.grupo_codigo)).filter(Boolean))
  
  ;(campanasMetas || []).forEach(g => {
    const gCode = g.grupo_codigo || g.codigo
    const gCodeNorm = norm(gCode)
    const recMeta = (g.reclutadores_metas || []).find(rm => 
      matchPerson(rm.nombre_completo, rankedItem.nombre) ||
      (rm.documento && (rm.documento === rankedItem.dni || String(rankedItem.dni).includes(rm.documento))) ||
      (rm.alias && norm(rm.alias) === norm(rankedItem.usuario))
    )
    
    if (recMeta || groupCodesSet.has(gCodeNorm)) {
      const postsInGroup = myPostulantes.filter(p => norm(p.grupo_codigo) === gCodeNorm)
      const totalPosts = postsInGroup.length
      const qD1 = postsInGroup.filter(p => norm(p.dia_1) === 'ASISTIO' || norm(p.dia_1) === 'A' || norm(p.estado) === 'CAPACITACION' || norm(p.estado) === 'INGRESO_OP').length
      const ingresantes = postsInGroup.filter(p => norm(p.estado) === 'INGRESO_OP' || norm(p.estado) === 'EN_OPERACIONES').length
      
      const metaRqInd = Number(recMeta?.meta_rq_individual) || 0
      const metaDia1Ind = Number(recMeta?.meta_dia_1_individual) || 0
      const rqGrupal = Number(g.rq_solicitado) || 0
      const metaDia1Grupal = Number(g.meta_dia_1_grupal || g.meta_dia_1) || 0

      gruposBreakdown.push({
        codigo: gCode || 'Grupo General',
        campana: g.campana_nombre || g.campana || 'Sin Campaña',
        sede: g.sede || '-',
        modalidad: g.modalidad || '-',
        horario: g.horario || g.rango_horario || '-',
        postulantesEnviados: totalPosts,
        qDia1: qD1,
        ingresantesOP: ingresantes,
        metaRqIndividual: metaRqInd,
        metaDia1Individual: metaDia1Ind,
        rqGrupal,
        metaDia1Grupal,
        pctAvanceRqInd: metaRqInd > 0 ? Math.min(200, Math.round((totalPosts / metaRqInd) * 100)) : (totalPosts > 0 ? 100 : 0),
        pctAvanceD1Ind: metaDia1Ind > 0 ? Math.min(200, Math.round((qD1 / metaDia1Ind) * 100)) : (qD1 > 0 ? 100 : 0),
        reclutadoresEquipoCount: (g.reclutadores_metas || []).length || 1
      })
    }
  })

  // Si tiene postulantes en grupos que no están en campanasMetas
  groupCodesSet.forEach(gCodeNorm => {
    const already = gruposBreakdown.some(gb => norm(gb.codigo) === gCodeNorm)
    if (!already) {
      const postsInGroup = myPostulantes.filter(p => norm(p.grupo_codigo) === gCodeNorm)
      const totalPosts = postsInGroup.length
      const qD1 = postsInGroup.filter(p => norm(p.dia_1) === 'ASISTIO' || norm(p.dia_1) === 'A' || norm(p.estado) === 'CAPACITACION' || norm(p.estado) === 'INGRESO_OP').length
      const ingresantes = postsInGroup.filter(p => norm(p.estado) === 'INGRESO_OP' || norm(p.estado) === 'EN_OPERACIONES').length
      const sampleP = postsInGroup[0] || {}

      gruposBreakdown.push({
        codigo: sampleP.grupo_codigo || gCodeNorm,
        campana: sampleP.campana || 'Sin Campaña',
        sede: sampleP.sede || '-',
        modalidad: sampleP.modalidad || '-',
        horario: sampleP.rango_horario || '-',
        postulantesEnviados: totalPosts,
        qDia1: qD1,
        ingresantesOP: ingresantes,
        metaRqIndividual: 0,
        metaDia1Individual: 0,
        rqGrupal: 0,
        metaDia1Grupal: 0,
        pctAvanceRqInd: 100,
        pctAvanceD1Ind: 100,
        reclutadoresEquipoCount: 1
      })
    }
  })

  const objetivos = [
    {
      id: 'volumen',
      label: 'Postulantes Enviados',
      actual: rankedItem.totalPostulantes,
      meta: `${rankedItem.metaVolumen} meta`,
      pct: rankedItem.pctCumplimientoVolumen,
      stars: computeStars(rankedItem.pctCumplimientoVolumen),
      proyeccion: `Proyección al cierre: ~${projectedVolumen} postulantes`,
      color: '#818cf8'
    },
    {
      id: 'q_dia1',
      label: 'Q DÍA 1 (Asistentes en Aula)',
      actual: rankedItem.qDia1,
      meta: `${rankedItem.metaQDia1 || Math.round(rankedItem.totalPostulantes * 0.70)} obj`,
      pct: rankedItem.pctQDia1,
      stars: computeStars(rankedItem.pctQDia1),
      proyeccion: `Tasa Q Día 1: ${rankedItem.pctQDia1}% sobre citados`,
      color: '#06b6d4'
    },
    {
      id: 'ingresos_op',
      label: 'INGRESANTES A LA OPERACIÓN',
      actual: rankedItem.ingresantesOP,
      meta: `${rankedItem.metaIngresosOP} meta`,
      pct: rankedItem.pctConversionOP,
      stars: computeStars(rankedItem.pctConversionOP),
      proyeccion: runRateMsg,
      status: runRateStatus,
      color: '#10b981'
    },
    {
      id: 'bajas_imputables',
      label: 'Control de Bajas Imputables',
      actual: `${rankedItem.bajasImputables} bajas`,
      meta: '≤ 5% máx',
      pct: Math.max(0, 100 - rankedItem.pctBajasImputables * 4),
      stars: rankedItem.pctBajasImputables <= 5 ? 5 : (rankedItem.pctBajasImputables <= 10 ? 3 : 1),
      proyeccion: `Impacto en selección: ${rankedItem.pctBajasImputables}% de bajas atribuibles`,
      color: '#f43f5e'
    }
  ]

  return {
    ...rankedItem,
    segmentRank,
    totalInSegment,
    runRateMsg,
    runRateStatus,
    projectedVolumen,
    projectedIngresantesOP,
    objetivos,
    dailyEvolution,
    gruposBreakdown
  }
}

// ════════════════════════════════════════════════════════════════════════════
// 2. MOTOR ANALÍTICO PARA FORMADORES (TRAINERS)
// ════════════════════════════════════════════════════════════════════════════

export function computeAllTrainersPerformance(
  postulantes = [],
  asistencias = [],
  grupos = [],
  formadoresCatalog = []
) {
  const trainerMap = new Map()

  // Map de grupos para resolver formador por grupo_codigo
  const grupoTrainerMap = new Map()
  ;(grupos || []).forEach(g => {
    const gCode = norm(g.codigo || g.grupo_codigo)
    const tDoc = g.formador_documento || g.documento_formador || ''
    const tName = g.formador_nombre || g.formador || g.responsable || ''
    if (gCode && (tDoc || tName)) {
      grupoTrainerMap.set(gCode, { doc: tDoc, name: tName })
    }
  })

  // Catalog Map para enriquecer DNI, usuario y alix de formadores
  const catMap = new Map()
  ;(formadoresCatalog || []).forEach(f => {
    const name = typeof f === 'string' ? f : (f?.nombre_completo || f?.datos_completos || f?.nombre || '')
    const doc = f?.documento || f?.dni || ''
    const user = f?.alix || f?.usuario || f?.alias || f?.email?.split('@')[0] || ''
    const item = {
      nombre: name,
      dni: doc,
      usuario: user,
      email: f?.email || f?.correo || '',
      segmento: f?.segmento || 'CAPACITACIÓN'
    }
    if (name) catMap.set(norm(name), item)
    if (doc) catMap.set(norm(doc), item)
    if (user) catMap.set(norm(user), item)

    // Pre-cargar formador de catálogo
    const primeKey = name ? norm(name) : (doc ? norm(doc) : norm(user))
    if (primeKey && !trainerMap.has(primeKey)) {
      trainerMap.set(primeKey, {
        nombre: name || 'Trainer Activo',
        dni: doc,
        usuario: user,
        email: item.email,
        segmento: item.segmento,
        alumnosSet: new Set(),
        asistenciasList: [],
        ingresantesOPSet: new Set(),
        bajasSet: new Set(),
        faltasSinBaja: 0,
        totalAsistenciasPosibles: 0,
        asistenciasEfectivas: 0
      })
    }
  })

  // 1. Indexar asistencias por formador
  asistencias.forEach(a => {
    let trainerDoc = a.documento_formador || a.formador_documento || ''
    let trainerName = a.nombre_formador || a.formador_nombre || ''
    
    // Si no viene en la asistencia, resolver mediante grupo
    if (!trainerDoc && !trainerName) {
      const gCode = norm(a.codigo_grupo || a.grupo || a.grupo_codigo)
      const gInfo = grupoTrainerMap.get(gCode)
      if (gInfo) {
        trainerDoc = gInfo.doc
        trainerName = gInfo.name
      }
    }

    const key = trainerName ? norm(trainerName) : (trainerDoc ? norm(trainerDoc) : '')
    if (!key) return

    if (!trainerMap.has(key)) {
      const catInfo = catMap.get(key) || catMap.get(norm(trainerDoc)) || {}
      trainerMap.set(key, {
        nombre: trainerName || catInfo.nombre || 'Trainer Activo',
        dni: trainerDoc || catInfo.dni || '',
        usuario: catInfo.usuario || '',
        email: catInfo.email || '',
        segmento: catInfo.segmento || 'CAPACITACIÓN',
        alumnosSet: new Set(),
        asistenciasList: [],
        ingresantesOPSet: new Set(),
        bajasSet: new Set(),
        faltasSinBaja: 0,
        totalAsistenciasPosibles: 0,
        asistenciasEfectivas: 0
      })
    }

    const tObj = trainerMap.get(key)
    const doc = a.postulante_documento || a.documento
    if (doc) tObj.alumnosSet.add(doc)
    tObj.asistenciasList.push(a)

    const sigla = a.sigla_asistencia
    tObj.totalAsistenciasPosibles++

    if (sigla === 'I-OP') {
      if (doc) tObj.ingresantesOPSet.add(doc)
      tObj.asistenciasEfectivas++
    } else if (sigla === 'A' || sigla === 'FJ' || sigla === 'T') {
      tObj.asistenciasEfectivas++
    } else if (sigla === 'B') {
      if (doc) tObj.bajasSet.add(doc)
    } else if (sigla === 'F') {
      tObj.faltasSinBaja++
    }
  })

  // 2. Asociar postulantes de grupos asignados si no tienen asistencias aún
  postulantes.forEach(p => {
    const gCode = norm(p.grupo_codigo)
    const gInfo = grupoTrainerMap.get(gCode)
    if (gInfo) {
      const key = gInfo.name ? norm(gInfo.name) : norm(gInfo.doc)
      if (key && trainerMap.has(key)) {
        const tObj = trainerMap.get(key)
        if (p.documento) tObj.alumnosSet.add(p.documento)
        if (norm(p.estado) === 'INGRESO_OP' || norm(p.estado) === 'EN_OPERACIONES') {
          if (p.documento) tObj.ingresantesOPSet.add(p.documento)
        }
      }
    }
  })

  const trainerScores = []

  trainerMap.forEach((tObj, tKey) => {
    const totalAlumnos = tObj.alumnosSet.size
    if (totalAlumnos === 0) return // Excluir formadores sin alumnos en los filtros seleccionados

    const ingresantesOP = tObj.ingresantesOPSet.size
    const bajas = tObj.bajasSet.size
    const activosEnAula = Math.max(0, totalAlumnos - bajas - ingresantesOP)

    // Ausentismo: Mide todas las faltas de asesores que NO fueron dados de baja
    const ausentismoCount = tObj.faltasSinBaja
    const pctAusentismo = tObj.totalAsistenciasPosibles > 0 
      ? Math.round((ausentismoCount / tObj.totalAsistenciasPosibles) * 100) 
      : 0

    const pctAsistencia = tObj.totalAsistenciasPosibles > 0 
      ? Math.round((tObj.asistenciasEfectivas / tObj.totalAsistenciasPosibles) * 100) 
      : (totalAlumnos > 0 ? 100 : 0)

    const pctRetencionOP = totalAlumnos > 0 ? Math.round((ingresantesOP / totalAlumnos) * 100) : 0

    const metaRetencion = 80
    const metaIngresantes = Math.max(1, Math.round(Math.max(totalAlumnos, 20) * 0.80))

    const score = Math.max(0, Math.round(
      (pctRetencionOP * 0.45) +
      (pctAsistencia * 0.35) +
      (Math.max(0, 100 - pctAusentismo * 2) * 0.20)
    ))

    trainerScores.push({
      nombre: tObj.nombre,
      dni: tObj.dni,
      usuario: tObj.usuario,
      email: tObj.email,
      segmento: tObj.segmento,
      totalAlumnos,
      activosEnAula,
      ingresantesOP,
      bajas,
      ausentismoCount,
      pctAusentismo,
      pctAsistencia,
      pctRetencionOP,
      metaRetencion,
      metaIngresantes,
      score,
      asistencias: tObj.asistenciasList
    })
  })

  return assignQuartiles(trainerScores, 'score')
}

// ── Detalle Individual y Evolución Diaria del Formador ───────────────────────
export function getTrainerIndividualDetails(
  targetIdentifier,
  asistencias = [],
  allRankedTrainers = []
) {
  if (!allRankedTrainers.length) return null

  const target = norm(targetIdentifier)
  const rankedItem = allRankedTrainers.find(t => 
    norm(t.nombre) === target ||
    norm(t.dni) === target ||
    norm(t.usuario) === target ||
    matchPerson(t.nombre, targetIdentifier)
  ) || allRankedTrainers[0]

  if (!rankedItem) return null

  const today = new Date()
  const currentDay = today.getDate()
  const totalDaysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()
  const daysPassed = Math.max(1, currentDay)

  const runRateFactor = totalDaysInMonth / daysPassed
  const projectedIngresantes = Math.round(rankedItem.ingresantesOP * runRateFactor)

  const mySeg = norm(rankedItem.segmento || 'CAPACITACIÓN')
  const segTrainers = allRankedTrainers
    .filter(t => norm(t.segmento || 'CAPACITACIÓN') === mySeg)
    .sort((a, b) => (b.score || 0) - (a.score || 0))

  const segmentRank = Math.max(1, segTrainers.findIndex(t => t.nombre === rankedItem.nombre) + 1)
  const totalInSegment = Math.max(1, segTrainers.length)

  let runRateMsg = `Proyección estimada: ~${projectedIngresantes} INGRESANTES A LA OPERACIÓN.`
  let runRateStatus = 'success'
  if (projectedIngresantes >= rankedItem.metaIngresantes) {
    runRateMsg += ` ✔️ Cumplirías el objetivo de retención (${rankedItem.metaIngresantes}).`
  } else {
    const diff = rankedItem.metaIngresantes - projectedIngresantes
    runRateMsg += ` ⚠️ Brecha proyectada de ~${diff} alumnos respecto a la meta.`
    runRateStatus = 'warning'
  }

  const dailyMap = new Map()
  for (let d = 1; d <= Math.min(daysPassed, totalDaysInMonth); d++) {
    const label = `${d}`
    dailyMap.set(label, {
      dia: label,
      presentes: 0,
      ausentismo: 0,
      bajas: 0,
      ingresantesOP: 0,
      pctAsistenciaDia: 0
    })
  }

  (rankedItem.asistencias || []).forEach(a => {
    const dateStr = parseDateStr(a.fecha_asistencia || a.fecha_registro_asistencia)
    if (dateStr) {
      const dNum = parseInt(dateStr.split('-')[2], 10)
      const label = `${dNum}`
      if (dailyMap.has(label)) {
        const row = dailyMap.get(label)
        const sigla = a.sigla_asistencia
        if (sigla === 'I-OP') {
          row.ingresantesOP++
          row.presentes++
        } else if (sigla === 'A' || sigla === 'FJ' || sigla === 'T') {
          row.presentes++
        } else if (sigla === 'B') {
          row.bajas++
        } else if (sigla === 'F') {
          row.ausentismo++
        }
      }
    }
  })

  dailyMap.forEach(row => {
    const totalDia = row.presentes + row.ausentismo + row.bajas
    row.pctAsistenciaDia = totalDia > 0 ? Math.round((row.presentes / totalDia) * 100) : 100
  })

  const dailyEvolution = Array.from(dailyMap.values())

  const objetivos = [
    {
      id: 'ingresos_op_formacion',
      label: 'INGRESANTES A LA OPERACIÓN (Pases Aprobados)',
      actual: rankedItem.ingresantesOP,
      meta: `${rankedItem.metaIngresantes} meta`,
      pct: rankedItem.pctRetencionOP,
      stars: computeStars(rankedItem.pctRetencionOP),
      proyeccion: runRateMsg,
      status: runRateStatus,
      color: '#10b981'
    },
    {
      id: 'asistencia_aula',
      label: '% Asistencia Diaria en Aula',
      actual: `${rankedItem.pctAsistencia}%`,
      meta: '≥ 85% objetivo',
      pct: rankedItem.pctAsistencia,
      stars: computeStars(rankedItem.pctAsistencia),
      proyeccion: `Promedio de asistencia efectiva registrada`,
      color: '#06b6d4'
    },
    {
      id: 'control_ausentismo',
      label: 'Cantidad de Ausentismo (Faltas Activas)',
      actual: `${rankedItem.ausentismoCount} faltas`,
      meta: '≤ 5% esperado',
      pct: Math.max(0, 100 - rankedItem.pctAusentismo * 5),
      stars: rankedItem.pctAusentismo <= 5 ? 5 : (rankedItem.pctAusentismo <= 12 ? 3 : 1),
      proyeccion: `Mide faltas de asesores que no fueron dados de baja`,
      color: '#f59e0b'
    },
    {
      id: 'retencion_global',
      label: '% Retención de Capacitación',
      actual: `${rankedItem.pctRetencionOP}%`,
      meta: `${rankedItem.metaRetencion}% objetivo`,
      pct: rankedItem.pctRetencionOP,
      stars: computeStars(rankedItem.pctRetencionOP),
      proyeccion: `Total alumnos gestionados: ${rankedItem.totalAlumnos} (${rankedItem.activosEnAula} en aula)`,
      color: '#818cf8'
    }
  ]

  return {
    ...rankedItem,
    runRateMsg,
    runRateStatus,
    projectedIngresantes,
    objetivos,
    dailyEvolution
  }
}
