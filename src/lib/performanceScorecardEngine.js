/**
 * performanceScorecardEngine.js
 * Motor analítico de Ficha de Desempeño 360° (GEA Dashboard)
 * Especializado para Reclutadores (RyS) y Formadores (Capacitación).
 * Calibración de Datos Reales, Funnel Operativo, Evolución Semanal y Trazabilidad Nominal.
 */

// ── Normalización de Cadenas Uniforme ───────────────────────────────────────
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

export const formatSemanaLabel = (raw) => {
  if (!raw) return 'Semana ?'
  const str = String(raw).trim().toUpperCase()
  const m = str.match(/(\d+)/)
  if (m) return `Sem ${m[1]}`
  return str
}

export const extractSemanaNum = (raw) => {
  if (!raw) return 0
  const m = String(raw).match(/(\d+)/)
  return m ? parseInt(m[1], 10) : 0
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
    let quartileColor = '#f43f5e'
    let quartileLabel = 'Cuartil Q4 - En Riesgo'

    if (percentile >= 75 || rank <= Math.ceil(n * 0.25)) {
      quartile = 'Q1'
      quartileColor = '#10b981'
      quartileLabel = 'Cuartil Q1 - Top Performance'
    } else if (percentile >= 50 || rank <= Math.ceil(n * 0.50)) {
      quartile = 'Q2'
      quartileColor = '#06b6d4'
      quartileLabel = 'Cuartil Q2 - Destacado'
    } else if (percentile >= 25 || rank <= Math.ceil(n * 0.75)) {
      quartile = 'Q3'
      quartileColor = '#f59e0b'
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

  // Sets de postulantes con asistencia
  const opDocs = attendanceIndexes?.opDocsSet || new Set()
  const bajasDocs = attendanceIndexes?.bajasDocsSet || new Set()
  const d1Docs = new Set()

  asistencias.forEach(a => {
    const doc = a.postulante_documento || a.documento
    if (!doc) return
    const sigla = a.sigla_asistencia || a.sigla
    if (sigla === 'I-OP') {
      opDocs.add(doc)
      d1Docs.add(doc)
    } else if (sigla === 'B') {
      bajasDocs.add(doc)
    } else if (sigla === 'A' || sigla === 'FJ' || sigla === 'T') {
      d1Docs.add(doc)
    }
  })

  // Catálogo de formadores para exclusión
  const formadorNamesSet = new Set()
  ;(formadoresCatalog || []).forEach(f => {
    const n = typeof f === 'string' ? f : (f?.nombre_completo || f?.nombre || '')
    if (n) formadorNamesSet.add(norm(n))
    if (f?.alix) formadorNamesSet.add(norm(f.alix))
    if (f?.documento || f?.dni) formadorNamesSet.add(norm(f.documento || f.dni))
  })

  // Enriquecer catálogo de reclutadores
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

    // Vinculación con metas reales de capacidad_rys
    let metaRqReal = 0
    let metaDia1Real = 0
    let gruposAsignadosCount = 0

    ;(campanasMetas || []).forEach(g => {
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
        gruposAsignadosCount++
      }
    })

    const hasExplicitMeta = metaRqReal > 0
    const metaVolumen = hasExplicitMeta ? metaRqReal : total
    const metaQDia1 = metaDia1Real > 0 ? metaDia1Real : Math.round(metaVolumen * 0.70)
    const metaIngresosOP = Math.round(metaVolumen * 0.45)

    const pctCumplimientoVolumen = hasExplicitMeta ? Math.min(200, Math.round((total / metaVolumen) * 100)) : 100
    const pctConversionOP = total > 0 ? Math.round((ingresantesOP / total) * 100) : 0
    const pctQDia1 = total > 0 ? Math.round((qDia1 / total) * 100) : 0
    const pctBajasImputables = total > 0 ? Math.round((bajasImputables / total) * 100) : 0

    // Score Ponderado: 45% Pases a OP + 35% Día 1 + 20% Volumen
    const score = Math.max(0, Math.round(
      (pctConversionOP * 0.45) +
      (pctQDia1 * 0.35) +
      (pctCumplimientoVolumen * 0.20) -
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
      hasExplicitMeta,
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

// ── Detalle Individual, Funnel y Semanas del Reclutador ────────────────────
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

  // Posición en segmento
  const mySeg = norm(rankedItem.segmento || 'GENERAL')
  const segRecruiters = allRankedRecruiters
    .filter(r => norm(r.segmento || 'GENERAL') === mySeg)
    .sort((a, b) => (b.score || 0) - (a.score || 0))

  const segmentRank = Math.max(1, segRecruiters.findIndex(r => r.nombre === rankedItem.nombre) + 1)
  const totalInSegment = Math.max(1, segRecruiters.length)

  // ── 1. FUNNEL DE CONVERSIÓN REAL (EMBUDO OPERATIVO) ───────────────────────
  const totalPosts = rankedItem.totalPostulantes
  const qDia1 = rankedItem.qDia1
  const enCap = rankedItem.enCapacitacion
  const op = rankedItem.ingresantesOP
  const bajas = rankedItem.bajas

  const funnel = [
    {
      stage: 'Citados / Enviados',
      label: 'Postulantes',
      count: totalPosts,
      pct: 100,
      subtext: `${totalPosts} citaciones confirmadas`,
      color: '#6366f1' // Indigo
    },
    {
      stage: 'Asistieron Día 1',
      label: 'Efectividad Inicial',
      count: qDia1,
      pct: totalPosts > 0 ? Math.round((qDia1 / totalPosts) * 100) : 0,
      subtext: `${qDia1} asistieron al primer día`,
      dropCount: totalPosts - qDia1,
      dropPct: totalPosts > 0 ? Math.round(((totalPosts - qDia1) / totalPosts) * 100) : 0,
      color: '#06b6d4' // Cyan
    },
    {
      stage: 'En Formación / OJT',
      label: 'Retención de Aula',
      count: enCap + op,
      pct: totalPosts > 0 ? Math.round(((enCap + op) / totalPosts) * 100) : 0,
      subtext: `${enCap} activos en capacitación`,
      dropCount: qDia1 - (enCap + op),
      dropPct: qDia1 > 0 ? Math.round(((qDia1 - (enCap + op)) / qDia1) * 100) : 0,
      color: '#8b5cf6' // Violet
    },
    {
      stage: 'Ingresantes a OP',
      label: 'Conversión Final',
      count: op,
      pct: totalPosts > 0 ? Math.round((op / totalPosts) * 100) : 0,
      subtext: `${op} pasaron a operaciones`,
      color: '#10b981' // Emerald
    }
  ]

  // ── 2. EVOLUCIÓN POR SEMANAS OPERATIVAS REALES ────────────────────────────
  const weekMap = new Map()

  myPostulantes.forEach(p => {
    let semLabel = formatSemanaLabel(p.semana_trabajo || p.semana || p.semana_label)
    if (semLabel === 'Semana ?') {
      const gCode = p.grupo_codigo
      if (gCode) {
        const meta = campanasMetas.find(g => (g.grupo_codigo || g.codigo) === gCode)
        if (meta && (meta.semana || meta.semana_trabajo || meta.semana_label)) {
          semLabel = formatSemanaLabel(meta.semana || meta.semana_trabajo || meta.semana_label)
        }
      }
    }

    if (!weekMap.has(semLabel)) {
      weekMap.set(semLabel, {
        semana: semLabel,
        semanaNum: extractSemanaNum(semLabel),
        postulantes: 0,
        qDia1: 0,
        ingresantesOP: 0,
        bajas: 0
      })
    }

    const w = weekMap.get(semLabel)
    w.postulantes++

    const isOP = norm(p.estado) === 'INGRESO_OP' || norm(p.estado) === 'EN_OPERACIONES'
    const isBaja = norm(p.estado) === 'BAJA' || Boolean(p.motivo_baja)
    const d1Field = norm(p.dia_1)
    const statusD1 = norm(p.status_dia_1)
    const hasD1 = d1Field === 'ASISTIO' || d1Field === 'A' || d1Field.includes('ASIST') || statusD1 === 'RECUPERADO' || statusD1 === 'AGREGADO' || norm(p.estado) === 'CAPACITACION' || isOP

    if (hasD1) w.qDia1++
    if (isOP) w.ingresantesOP++
    if (isBaja) w.bajas++
  })

  const weeklyEvolution = Array.from(weekMap.values())
    .sort((a, b) => (a.semanaNum || 999) - (b.semanaNum || 999))
    .map(w => ({
      ...w,
      pctD1: w.postulantes > 0 ? Math.round((w.qDia1 / w.postulantes) * 100) : 0,
      pctOP: w.postulantes > 0 ? Math.round((w.ingresantesOP / w.postulantes) * 100) : 0
    }))

  // ── 3. DISTRIBUCIÓN DE MOTIVOS DE BAJA REALES ────────────────────────────
  const motivosMap = new Map()
  let totalBajasContadas = 0

  myPostulantes.forEach(p => {
    const isBaja = norm(p.estado) === 'BAJA' || Boolean(p.motivo_baja)
    if (isBaja) {
      totalBajasContadas++
      const mRaw = norm(p.motivo_baja || 'DESCONOCIDO / SIN MOTIVO')
      motivosMap.set(mRaw, (motivosMap.get(mRaw) || 0) + 1)
    }
  })

  const motivosBajaBreakdown = Array.from(motivosMap.entries())
    .map(([motivo, count]) => ({
      motivo,
      count,
      pct: totalBajasContadas > 0 ? Math.round((count / totalBajasContadas) * 100) : 0
    }))
    .sort((a, b) => b.count - a.count)

  // ── 4. DESGLOSE DE GRUPOS ASIGNADOS ──────────────────────────────────────
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
      const tPosts = postsInGroup.length
      const qD1 = postsInGroup.filter(p => norm(p.dia_1) === 'ASISTIO' || norm(p.dia_1) === 'A' || norm(p.estado) === 'CAPACITACION' || norm(p.estado) === 'INGRESO_OP').length
      const ingresantes = postsInGroup.filter(p => norm(p.estado) === 'INGRESO_OP' || norm(p.estado) === 'EN_OPERACIONES').length
      const bajasG = postsInGroup.filter(p => norm(p.estado) === 'BAJA' || Boolean(p.motivo_baja)).length

      const metaRqInd = Number(recMeta?.meta_rq_individual) || 0
      const metaDia1Ind = Number(recMeta?.meta_dia_1_individual) || 0
      const rqGrupal = Number(g.rq_ftes_solicitado ?? g.rq_solicitado) || 0

      gruposBreakdown.push({
        codigo: gCode || 'Grupo General',
        campana: g.campana_nombre || g.campana || 'Sin Campaña',
        sede: g.sede || 'LIMA',
        modalidad: g.modalidad || '-',
        semana: formatSemanaLabel(g.semana || g.semana_trabajo || g.semana_label),
        postulantesEnviados: tPosts,
        qDia1: qD1,
        ingresantesOP: ingresantes,
        bajas: bajasG,
        metaRqIndividual: metaRqInd,
        metaDia1Individual: metaDia1Ind,
        rqGrupal,
        pctAvanceRq: metaRqInd > 0 ? Math.round((tPosts / metaRqInd) * 100) : (tPosts > 0 ? 100 : 0)
      })
    }
  })

  // ── 5. TABLA DE TRAZABILIDAD NOMINAL (POSTULANTES) ────────────────────────
  const postulantesNominal = myPostulantes.map(p => {
    const isOP = norm(p.estado) === 'INGRESO_OP' || norm(p.estado) === 'EN_OPERACIONES'
    const isBaja = norm(p.estado) === 'BAJA' || Boolean(p.motivo_baja)
    const d1Field = norm(p.dia_1)
    const hasD1 = d1Field === 'ASISTIO' || d1Field === 'A' || d1Field.includes('ASIST') || norm(p.estado) === 'CAPACITACION' || isOP

    return {
      documento: p.documento || '-',
      nombre_completo: p.nombre_completo || `${p.apellido_paterno || ''} ${p.apellido_materno || ''} ${p.nombres || ''}`.trim() || 'Sin Nombre',
      campana: p.campana || 'Sin Campaña',
      grupo_codigo: p.grupo_codigo || '-',
      semana: formatSemanaLabel(p.semana_trabajo || p.semana || p.semana_label),
      fecha_registro: parseDateStr(p.fecha_ingreso || p.fecha_registro || p.created_at) || '-',
      dia_1: hasD1 ? 'Asistió' : (p.dia_1 ? String(p.dia_1) : 'No Asistió'),
      estado: isOP ? 'INGRESO OP' : (isBaja ? 'BAJA' : (hasD1 ? 'CAPACITACIÓN' : (p.estado || 'REGISTRADO'))),
      motivo_baja: p.motivo_baja || '-',
      isOP,
      isBaja,
      hasD1
    }
  })

  return {
    ...rankedItem,
    segmentRank,
    totalInSegment,
    funnel,
    weeklyEvolution,
    motivosBajaBreakdown,
    gruposBreakdown,
    postulantesNominal
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

  const grupoTrainerMap = new Map()
  ;(grupos || []).forEach(g => {
    const gCode = norm(g.codigo || g.grupo_codigo)
    const tDoc = g.formador_documento || g.documento_formador || ''
    const tName = g.formador_nombre || g.formador || g.responsable || ''
    if (gCode && (tDoc || tName)) {
      grupoTrainerMap.set(gCode, { doc: tDoc, name: tName, grupo: g })
    }
  })

  // Catalog Map
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
        asistenciasEfectivas: 0,
        gruposSet: new Set()
      })
    }
  })

  // Indexar asistencias
  asistencias.forEach(a => {
    let trainerDoc = a.documento_formador || a.formador_documento || ''
    let trainerName = a.nombre_formador || a.formador_nombre || ''
    const gCode = norm(a.codigo_grupo || a.grupo || a.grupo_codigo)
    
    if (!trainerDoc && !trainerName && gCode) {
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
        asistenciasEfectivas: 0,
        gruposSet: new Set()
      })
    }

    const tObj = trainerMap.get(key)
    const doc = a.postulante_documento || a.documento
    if (doc) tObj.alumnosSet.add(doc)
    if (gCode) tObj.gruposSet.add(gCode)
    tObj.asistenciasList.push(a)

    const sigla = a.sigla_asistencia || a.sigla
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

  // Asociar postulantes si existen en los grupos asignados
  postulantes.forEach(p => {
    const gCode = norm(p.grupo_codigo)
    const gInfo = grupoTrainerMap.get(gCode)
    if (gInfo) {
      const key = gInfo.name ? norm(gInfo.name) : norm(gInfo.doc)
      if (key && trainerMap.has(key)) {
        const tObj = trainerMap.get(key)
        if (p.documento) tObj.alumnosSet.add(p.documento)
        tObj.gruposSet.add(gCode)
        if (norm(p.estado) === 'INGRESO_OP' || norm(p.estado) === 'EN_OPERACIONES') {
          if (p.documento) tObj.ingresantesOPSet.add(p.documento)
        }
        if (norm(p.estado) === 'BAJA' || p.motivo_baja) {
          if (p.documento) tObj.bajasSet.add(p.documento)
        }
      }
    }
  })

  const trainerScores = []

  trainerMap.forEach((tObj) => {
    const totalAlumnos = tObj.alumnosSet.size
    if (totalAlumnos === 0) return

    const ingresantesOP = tObj.ingresantesOPSet.size
    const bajas = tObj.bajasSet.size
    const activosEnAula = Math.max(0, totalAlumnos - bajas - ingresantesOP)

    const ausentismoCount = tObj.faltasSinBaja
    const pctAusentismo = tObj.totalAsistenciasPosibles > 0 
      ? Math.round((ausentismoCount / tObj.totalAsistenciasPosibles) * 100) 
      : 0

    const pctAsistencia = tObj.totalAsistenciasPosibles > 0 
      ? Math.round((tObj.asistenciasEfectivas / tObj.totalAsistenciasPosibles) * 100) 
      : (totalAlumnos > 0 ? 100 : 0)

    const pctRetencionOP = totalAlumnos > 0 ? Math.round((ingresantesOP / totalAlumnos) * 100) : 0

    // Score Ponderado del Formador: 50% Retención OP + 35% Asistencia - 15% Ausentismo
    const score = Math.max(0, Math.round(
      (pctRetencionOP * 0.50) +
      (pctAsistencia * 0.35) +
      (Math.max(0, 100 - pctAusentismo * 2) * 0.15)
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
      gruposCount: tObj.gruposSet.size,
      score,
      asistencias: tObj.asistenciasList,
      alumnosSet: tObj.alumnosSet,
      gruposSet: tObj.gruposSet
    })
  })

  return assignQuartiles(trainerScores, 'score')
}

// ── Detalle Individual, Funnel y Semanas del Formador ───────────────────────
export function getTrainerIndividualDetails(
  targetIdentifier,
  asistencias = [],
  allRankedTrainers = [],
  grupos = [],
  postulantes = []
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

  // Posición en segmento
  const mySeg = norm(rankedItem.segmento || 'CAPACITACIÓN')
  const segTrainers = allRankedTrainers
    .filter(t => norm(t.segmento || 'CAPACITACIÓN') === mySeg)
    .sort((a, b) => (b.score || 0) - (a.score || 0))

  const segmentRank = Math.max(1, segTrainers.findIndex(t => t.nombre === rankedItem.nombre) + 1)
  const totalInSegment = Math.max(1, segTrainers.length)

  // ── 1. FUNNEL DE RETENCIÓN DE AULA (FORMADOR) ─────────────────────────────
  const totalAlumnos = rankedItem.totalAlumnos
  const pctAsist = rankedItem.pctAsistencia
  const activos = rankedItem.activosEnAula
  const op = rankedItem.ingresantesOP
  const bajas = rankedItem.bajas

  const funnel = [
    {
      stage: 'Nómina Inicial en Aula',
      label: 'Alumnos Recibidos',
      count: totalAlumnos,
      pct: 100,
      subtext: `${totalAlumnos} alumnos asignados en cohortes`,
      color: '#8b5cf6'
    },
    {
      stage: 'Asistencia Efectiva',
      label: 'Cumplimiento Asistencia',
      count: Math.round(totalAlumnos * (pctAsist / 100)),
      pct: pctAsist,
      subtext: `${pctAsist}% asistencia promedio en aula`,
      color: '#06b6d4'
    },
    {
      stage: 'Activos Cursando / OJT',
      label: 'En Proceso',
      count: activos,
      pct: totalAlumnos > 0 ? Math.round((activos / totalAlumnos) * 100) : 0,
      subtext: `${activos} alumnos en formación activa`,
      color: '#3b82f6'
    },
    {
      stage: 'Graduados a Operación (OP)',
      label: 'Pases Exitosos',
      count: op,
      pct: totalAlumnos > 0 ? Math.round((op / totalAlumnos) * 100) : 0,
      subtext: `${op} alumnos certificados a producción`,
      color: '#10b981'
    }
  ]

  // ── 2. EVOLUCIÓN POR SEMANAS DE ASISTENCIA ────────────────────────────────
  const weekMap = new Map()
  const grupoInfoMap = new Map()
  ;(grupos || []).forEach(g => {
    const c = norm(g.codigo || g.grupo_codigo)
    if (c) grupoInfoMap.set(c, g)
  })

  ;(rankedItem.asistencias || []).forEach(a => {
    const gCode = norm(a.codigo_grupo || a.grupo || a.grupo_codigo)
    const gObj = grupoInfoMap.get(gCode)
    const semLabel = formatSemanaLabel(gObj?.semana || gObj?.semana_trabajo || gObj?.semana_label || a.semana)

    if (!weekMap.has(semLabel)) {
      weekMap.set(semLabel, {
        semana: semLabel,
        semanaNum: extractSemanaNum(semLabel),
        asistenciasEfectivas: 0,
        faltas: 0,
        bajas: 0,
        ingresantesOP: 0,
        totalMarcaciones: 0
      })
    }

    const w = weekMap.get(semLabel)
    w.totalMarcaciones++
    const sigla = a.sigla_asistencia || a.sigla

    if (sigla === 'I-OP') {
      w.ingresantesOP++
      w.asistenciasEfectivas++
    } else if (sigla === 'A' || sigla === 'FJ' || sigla === 'T') {
      w.asistenciasEfectivas++
    } else if (sigla === 'B') {
      w.bajas++
    } else if (sigla === 'F') {
      w.faltas++
    }
  })

  const weeklyEvolution = Array.from(weekMap.values())
    .sort((a, b) => (a.semanaNum || 999) - (b.semanaNum || 999))
    .map(w => ({
      ...w,
      pctAsistencia: w.totalMarcaciones > 0 ? Math.round((w.asistenciasEfectivas / w.totalMarcaciones) * 100) : 0
    }))

  // ── 3. MOTIVOS DE DESERCIÓN / BAJA EN CAPACITACIÓN ────────────────────────
  const motivosMap = new Map()
  let totalBajasContadas = 0

  ;(rankedItem.asistencias || []).forEach(a => {
    const sigla = a.sigla_asistencia || a.sigla
    if (sigla === 'B' || a.motivo_baja) {
      totalBajasContadas++
      const mRaw = norm(a.motivo_baja || 'DESERCIÓN EN AULA')
      motivosMap.set(mRaw, (motivosMap.get(mRaw) || 0) + 1)
    }
  })

  const motivosBajaBreakdown = Array.from(motivosMap.entries())
    .map(([motivo, count]) => ({
      motivo,
      count,
      pct: totalBajasContadas > 0 ? Math.round((count / totalBajasContadas) * 100) : 0
    }))
    .sort((a, b) => b.count - a.count)

  // ── 4. DESGLOSE DE GRUPOS / AULAS GESTIONADAS ─────────────────────────────
  const myGrupos = (grupos || []).filter(g => {
    const gCode = norm(g.codigo || g.grupo_codigo)
    const tDoc = g.formador_documento || g.documento_formador
    const tName = g.formador_nombre || g.formador || g.responsable
    return matchPerson(tName, rankedItem.nombre) || (tDoc && tDoc === rankedItem.dni) || (rankedItem.gruposSet && rankedItem.gruposSet.has(gCode))
  })

  const gruposBreakdown = myGrupos.map(g => {
    const gCode = g.codigo || g.grupo_codigo
    const gPosts = (postulantes || []).filter(p => norm(p.grupo_codigo) === norm(gCode))
    const totalG = gPosts.length
    const opG = gPosts.filter(p => norm(p.estado) === 'INGRESO_OP' || norm(p.estado) === 'EN_OPERACIONES').length
    const bajasG = gPosts.filter(p => norm(p.estado) === 'BAJA' || Boolean(p.motivo_baja)).length

    return {
      codigo: gCode,
      campana: g.campana || 'Sin Campaña',
      sede: g.sede || 'LIMA',
      semana: formatSemanaLabel(g.semana || g.semana_trabajo || g.semana_label),
      alumnos: totalG,
      ingresantesOP: opG,
      bajas: bajasG,
      pctRetencion: totalG > 0 ? Math.round((opG / totalG) * 100) : 0
    }
  })

  // ── 5. TRAZABILIDAD NOMINAL (ALUMNOS ASIGNADOS) ───────────────────────────
  const alumnosDocsSet = rankedItem.alumnosSet || new Set()
  const alumnosNominal = (postulantes || [])
    .filter(p => alumnosDocsSet.has(p.documento))
    .map(p => {
      const isOP = norm(p.estado) === 'INGRESO_OP' || norm(p.estado) === 'EN_OPERACIONES'
      const isBaja = norm(p.estado) === 'BAJA' || Boolean(p.motivo_baja)

      return {
        documento: p.documento || '-',
        nombre_completo: p.nombre_completo || `${p.apellido_paterno || ''} ${p.apellido_materno || ''} ${p.nombres || ''}`.trim() || 'Sin Nombre',
        campana: p.campana || 'Sin Campaña',
        grupo_codigo: p.grupo_codigo || '-',
        semana: formatSemanaLabel(p.semana_trabajo || p.semana || p.semana_label),
        estado: isOP ? 'GRADUADO OP' : (isBaja ? 'BAJA EN AULA' : (p.estado || 'EN CURSO')),
        motivo_baja: p.motivo_baja || '-',
        isOP,
        isBaja
      }
    })

  return {
    ...rankedItem,
    segmentRank,
    totalInSegment,
    funnel,
    weeklyEvolution,
    motivosBajaBreakdown,
    gruposBreakdown,
    alumnosNominal
  }
}
