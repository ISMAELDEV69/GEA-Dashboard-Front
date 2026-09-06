/**
 * performanceScorecardEngine.js
 * Motor analítico de Ficha de Desempeño 360° (GEA Dashboard)
 * Especializado para Reclutadores (RyS) y Formadores (Capacitación).
 * Calibración estricta de Nómina, Día 1 de Formación, Conversión a OP sobre Día 1 e Indicadores BPO.
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
  if (!target || target === 'ALL' || target === 'TODOS') return true
  const f = norm(fieldVal)
  const t = norm(target)
  if (!f || !t) return false
  if (f === t) return true

  // Verificación cruzada con DNI, Usuario o Alias si existe objeto de catálogo
  if (catalogObj) {
    const cDoc = norm(catalogObj.documento || catalogObj.dni || catalogObj.doc)
    const cUser = norm(catalogObj.usuario || catalogObj.alias || catalogObj.email)
    if (cDoc && (cDoc === t || t === cDoc)) return true
    if (cUser && (cUser === t || t === cUser)) return true
  }

  // Coincidencia por subcadena solo si es suficientemente larga y específica
  if ((f.length >= 8 && t.length >= 8) && (f.startsWith(t) || t.startsWith(f))) return true

  // Coincidencia por palabras: requiere que coincidan al menos 2 palabras significativas
  const fWords = f.split(/\s+/).filter(w => w.length >= 3 && !['DEL', 'LOS', 'LAS', 'SAN', 'DE', 'LA'].includes(w))
  const tWords = t.split(/\s+/).filter(w => w.length >= 3 && !['DEL', 'LOS', 'LAS', 'SAN', 'DE', 'LA'].includes(w))
  if (fWords.length >= 2 && tWords.length >= 2) {
    const common = fWords.filter(w => tWords.includes(w))
    return common.length >= 2
  }
  return false
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

export const getISOWeekFromDate = (rawDate) => {
  const dateStr = parseDateStr(rawDate)
  if (!dateStr) return null
  const d = new Date(dateStr + 'T12:00:00Z')
  if (isNaN(d.getTime())) return null
  const target = new Date(d.valueOf())
  const dayNr = (d.getUTCDay() + 6) % 7
  target.setUTCDate(target.getUTCDate() - dayNr + 3)
  const firstThursday = target.valueOf()
  target.setUTCMonth(0, 1)
  if (target.getUTCDay() !== 4) {
    target.setUTCMonth(0, 1 + ((4 - target.getUTCDay()) + 7) % 7)
  }
  const weekNum = 1 + Math.ceil((firstThursday - target) / 604800000)
  return `Sem ${weekNum}`
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

// ── Calibración Estricta de Estados Operativos ─────────────────────────────
export function isCandidateDia1Baja(p) {
  const m = norm(p.motivo_baja)
  const e = norm(p.estado)
  const t = norm(p.tipo_baja || p.tipo_reclutado)
  const stD1 = norm(p.status_dia_1)
  const d1 = norm(p.dia_1)

  if (d1 === 'NO ASISTIO' || d1 === 'NO ASISTIÓ' || d1 === 'FALTA' || d1 === 'FALTO') return true
  if (t === 'CESE' || t.includes('CESE') || stD1.includes('CESE')) return true
  if (m.includes('BAJA DIA 1') || m.includes('BAJA DÍA 1') || m.includes('BAJA D1') || m.includes('CESE DIA 1') || m.includes('CESE DÍA 1')) return true
  if (e.includes('BAJA DIA 1') || e.includes('BAJA DÍA 1') || e.includes('CESE DIA 1')) return true
  return false
}

export function isCandidateIngresoOP(p, opDocs = null) {
  const doc = norm(p.documento)
  if (doc && opDocs && opDocs.has(doc)) return true
  const e = norm(p.estado)
  return e === 'INGRESO_OP' || e === 'EN_OPERACIONES' || e === 'OPERACIONES' || e.includes('INGRESO_OP')
}

export function isCandidateDia1Asistio(p, opDocs = null, d1Docs = null) {
  if (isCandidateDia1Baja(p)) return false

  const doc = norm(p.documento)
  const isOP = isCandidateIngresoOP(p, opDocs)
  if (isOP) return true

  if (doc && d1Docs && d1Docs.has(doc)) return true

  const d1 = norm(p.dia_1)
  const stD1 = norm(p.status_dia_1)
  const e = norm(p.estado)

  if (d1 === 'ASISTIO' || d1 === 'ASISTIÓ' || d1 === 'A' || d1 === 'SI' || d1.includes('ASIST')) return true
  if (stD1 === 'RECUPERADO' || stD1 === 'AGREGADO') return true
  if (e === 'CAPACITACION' || e === 'EN_CAPACITACION' || e === 'CAPACITACIÓN' || e === 'EN_CAPACITACIÓN') return true

  return false
}

export function isCandidateBaja(p, bajasDocs = null) {
  const doc = norm(p.documento)
  if (doc && bajasDocs && bajasDocs.has(doc)) return true
  const e = norm(p.estado)
  if (e === 'BAJA' || e === 'CESADO' || e.includes('BAJA')) return true
  if (p.motivo_baja && String(p.motivo_baja).trim().length > 0 && norm(p.motivo_baja) !== 'NULL') return true
  return false
}

export function isCandidateImputable(p) {
  if (!isCandidateBaja(p)) return false
  const m = norm(p.motivo_baja)
  const t = norm(p.tipo_baja)
  return p.baja_imputable === true || 
    t === 'IMPUTABLE' || 
    m.includes('PERFIL') || 
    m.includes('SELECCION') || 
    m.includes('DOCUMENTACION') || 
    m.includes('NO CUMPLE')
}

// ── Asignación de Estrellas (1 a 5) ─────────────────────────────────────────
export function computeStars(pct) {
  if (pct >= 100) return 5
  if (pct >= 85) return 4
  if (pct >= 70) return 3
  if (pct >= 50) return 2
  return 1
}

// ── Ordenamiento Operativo por Volumen y Conversión ─────────────────────────
export function assignQuartiles(list = [], scoreKey = 'score') {
  if (!list.length) return []
  const sorted = [...list].sort((a, b) => {
    const diffVol = (b.totalPostulantes || b.totalAlumnos || 0) - (a.totalPostulantes || a.totalAlumnos || 0)
    if (diffVol !== 0) return diffVol
    const diffOP = (b.ingresantesOP || 0) - (a.ingresantesOP || 0)
    if (diffOP !== 0) return diffOP
    const diffD1 = (b.qDia1 || b.asistenciasEfectivas || 0) - (a.qDia1 || a.asistenciasEfectivas || 0)
    if (diffD1 !== 0) return diffD1
    return (a.nombre || '').localeCompare(b.nombre || '')
  })
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

// ── 3. MOTOR DE MAQUETAS (INDICADORES DE CONTACT CENTER) ────────────────────
export function getIndicadoresMaqueta(data, role = 'RECLUTADOR') {
  if (!data) return []

  if (role === 'RECLUTADOR') {
    const efectividadCitacion = data.totalPostulantes > 0 
      ? Math.round((data.qDia1 / data.totalPostulantes) * 100) 
      : 0
    // Regla de Negocio Oficial: Conversión a OP se mide estrictamente sobre los que asistieron a Día 1 de Formación
    const conversionOP = data.qDia1 > 0 
      ? Math.round((data.ingresantesOP / data.qDia1) * 100) 
      : 0
    const retencionFormacion = data.qDia1 > 0 
      ? Math.round(((data.enCapacitacion + data.ingresantesOP) / data.qDia1) * 100) 
      : 0
    const pctBajasImputables = data.totalPostulantes > 0 
      ? Math.round((data.bajasImputables / data.totalPostulantes) * 100) 
      : 0

    return [
      {
        nombre: 'Efectividad de Citación (Día 1 / Nómina)',
        descripcion: 'Asistentes efectivos a Día 1 sobre total citados',
        actual: efectividadCitacion,
        meta: 70,
        unidad: '%',
        tipo: 'mayor_es_mejor',
        cumple: efectividadCitacion >= 70,
        estado: efectividadCitacion >= 70 ? 'CUMPLE' : (efectividadCitacion >= 55 ? 'EN ALERTA' : 'DESVÍO CRÍTICO'),
        color: efectividadCitacion >= 70 ? '#10b981' : (efectividadCitacion >= 55 ? '#f59e0b' : '#f43f5e'),
        detalle: `${data.qDia1} de ${data.totalPostulantes} postulantes`
      },
      {
        nombre: 'Conversión a Operación (Ingreso a OP / Día 1)',
        descripcion: 'Pases exitosos a producción sobre asistentes Día 1',
        actual: conversionOP,
        meta: 75,
        unidad: '%',
        tipo: 'mayor_es_mejor',
        cumple: conversionOP >= 75,
        estado: conversionOP >= 75 ? 'CUMPLE' : (conversionOP >= 40 ? 'EN ALERTA' : 'DESVÍO CRÍTICO'),
        color: conversionOP >= 75 ? '#10b981' : (conversionOP >= 40 ? '#f59e0b' : '#f43f5e'),
        detalle: `${data.ingresantesOP} de ${data.qDia1} alumnos de Día 1`
      },
      {
        nombre: 'Retención de Aula (Activos + OP / Día 1)',
        descripcion: 'Alumnos que no desertaron durante el proceso lectivo',
        actual: retencionFormacion,
        meta: 80,
        unidad: '%',
        tipo: 'mayor_es_mejor',
        cumple: retencionFormacion >= 80,
        estado: retencionFormacion >= 80 ? 'CUMPLE' : (retencionFormacion >= 60 ? 'EN ALERTA' : 'DESVÍO CRÍTICO'),
        color: retencionFormacion >= 80 ? '#10b981' : (retencionFormacion >= 60 ? '#f59e0b' : '#f43f5e'),
        detalle: `${data.enCapacitacion + data.ingresantesOP} retenidos en aula`
      },
      {
        nombre: 'Calidad de Reclutamiento (Bajas Imputables)',
        descripcion: 'Deserciones tempranas por perfil no calificado o documentación',
        actual: pctBajasImputables,
        meta: 5,
        unidad: '%',
        tipo: 'menor_es_mejor',
        cumple: pctBajasImputables <= 5,
        estado: pctBajasImputables <= 5 ? 'CUMPLE' : (pctBajasImputables <= 10 ? 'EN ALERTA' : 'DESVÍO CRÍTICO'),
        color: pctBajasImputables <= 5 ? '#10b981' : (pctBajasImputables <= 10 ? '#f59e0b' : '#f43f5e'),
        detalle: `${data.bajasImputables} bajas imputables a selección`
      }
    ]
  } else {
    // Formadores
    const pctAsistencia = data.pctAsistencia || 0
    const pctRetencionOP = data.pctRetencionOP || 0
    const pctAusentismo = data.pctAusentismo || 0
    const deserionAula = data.totalAlumnos > 0 ? Math.round((data.bajas / data.totalAlumnos) * 100) : 0

    return [
      {
        nombre: 'Asistencia Efectiva en Aula',
        descripcion: 'Cumplimiento de presencia y puntualidad diaria',
        actual: pctAsistencia,
        meta: 90,
        unidad: '%',
        tipo: 'mayor_es_mejor',
        cumple: pctAsistencia >= 90,
        estado: pctAsistencia >= 90 ? 'CUMPLE' : (pctAsistencia >= 80 ? 'EN ALERTA' : 'DESVÍO CRÍTICO'),
        color: pctAsistencia >= 90 ? '#10b981' : (pctAsistencia >= 80 ? '#f59e0b' : '#f43f5e'),
        detalle: `${data.asistenciasEfectivas || 0} asistencias registradas`
      },
      {
        nombre: 'Certificados a Operación (Curve Pass-Rate)',
        descripcion: 'Alumnos graduados y certificados que pasaron a producción',
        actual: pctRetencionOP,
        meta: 75,
        unidad: '%',
        tipo: 'mayor_es_mejor',
        cumple: pctRetencionOP >= 75,
        estado: pctRetencionOP >= 75 ? 'CUMPLE' : (pctRetencionOP >= 50 ? 'EN ALERTA' : 'DESVÍO CRÍTICO'),
        color: pctRetencionOP >= 75 ? '#10b981' : (pctRetencionOP >= 50 ? '#f59e0b' : '#f43f5e'),
        detalle: `${data.ingresantesOP} certificados a operaciones`
      },
      {
        nombre: 'Tasa de Deserción en Capacitación',
        descripcion: 'Porcentaje de bajas registradas durante el período en aula',
        actual: deserionAula,
        meta: 15,
        unidad: '%',
        tipo: 'menor_es_mejor',
        cumple: deserionAula <= 15,
        estado: deserionAula <= 15 ? 'CUMPLE' : (deserionAula <= 25 ? 'EN ALERTA' : 'DESVÍO CRÍTICO'),
        color: deserionAula <= 15 ? '#10b981' : (deserionAula <= 25 ? '#f59e0b' : '#f43f5e'),
        detalle: `${data.bajas} bajas ocurridas en aula`
      },
      {
        nombre: 'Control de Ausentismo y Faltas',
        descripcion: 'Faltas activas que impactan la curva de aprendizaje',
        actual: pctAusentismo,
        meta: 10,
        unidad: '%',
        tipo: 'menor_es_mejor',
        cumple: pctAusentismo <= 10,
        estado: pctAusentismo <= 10 ? 'CUMPLE' : (pctAusentismo <= 18 ? 'EN ALERTA' : 'DESVÍO CRÍTICO'),
        color: pctAusentismo <= 10 ? '#10b981' : (pctAusentismo <= 18 ? '#f59e0b' : '#f43f5e'),
        detalle: `${data.ausentismoCount} faltas en período`
      }
    ]
  }
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
  const opDocs = new Set(attendanceIndexes?.opDocsSet || [])
  const bajasDocs = new Set(attendanceIndexes?.bajasDocsSet || [])
  const d1Docs = new Set()

  asistencias.forEach(a => {
    const doc = norm(a.postulante_documento || a.documento)
    if (!doc) return
    const sigla = norm(a.sigla_asistencia || a.sigla)
    const motivo = norm(a.motivo_baja)
    const estado = norm(a.estado)

    const isB1 = motivo.includes('BAJA DIA 1') || motivo.includes('BAJA D1') || estado.includes('BAJA DIA 1') || sigla === 'BD1'

    if (sigla === 'I-OP') {
      opDocs.add(doc)
      d1Docs.add(doc)
    } else if (sigla === 'B' || isB1 || motivo) {
      bajasDocs.add(doc)
      if (!isB1) {
        d1Docs.add(doc)
      }
    } else if (sigla === 'A' || sigla === 'FJ' || sigla === 'CAPACITACION' || sigla === 'OJT' || sigla === 'T') {
      d1Docs.add(doc)
    }
  })

  // Catálogo de formadores para exclusión de RyS
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

  // Agrupar postulantes por reclutador de forma estricta
  postulantes.forEach(p => {
    const recNameRaw = (p.reclutador || '').trim()
    if (!recNameRaw) return
    const recNameNorm = norm(recNameRaw)
    if (!recNameNorm || recNameNorm === 'SIN RECLUTADOR' || recNameNorm === 'NULL') return

    const isExplicitRec = catMap.has(recNameNorm)
    if (!isExplicitRec && (formadorNamesSet.has(recNameNorm) || (p.reclutador_dni && formadorNamesSet.has(norm(p.reclutador_dni))))) {
      return
    }

    if (!recruiterMap.has(recNameNorm)) {
      const catInfo = catMap.get(recNameNorm) || {}
      recruiterMap.set(recNameNorm, {
        nombre: recNameRaw.toUpperCase(),
        dni: catInfo.dni || p.reclutador_dni || '',
        usuario: catInfo.usuario || p.reclutador_usuario || '',
        email: catInfo.email || '',
        segmento: catInfo.segmento || p.segmento || 'GENERAL',
        postulantes: [],
        campanas: new Set(),
        grupos: new Set()
      })
    }
    const recObj = recruiterMap.get(recNameNorm)
    recObj.postulantes.push(p)
    if (p.campana) recObj.campanas.add(p.campana)
    if (p.grupo_codigo) recObj.grupos.add(p.grupo_codigo)
  })

  const recruiterScores = []

  recruiterMap.forEach((recObj) => {
    const total = recObj.postulantes.length
    if (total === 0) return

    let qDia1 = 0
    let ingresantesOP = 0
    let bajas = 0
    let bajasImputables = 0
    let enCapacitacion = 0

    recObj.postulantes.forEach(p => {
      const isOP = isCandidateIngresoOP(p, opDocs)
      const isBaja = isCandidateBaja(p, bajasDocs)
      const isImputable = isCandidateImputable(p)
      const hasD1 = isCandidateDia1Asistio(p, opDocs, d1Docs)

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
        matchPerson(rm.nombre_completo, recObj.nombre) ||
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
    // Regla de Contact Center: Conversión a OP sobre Día 1
    const pctConversionOP = qDia1 > 0 ? Math.round((ingresantesOP / qDia1) * 100) : 0
    const pctQDia1 = total > 0 ? Math.round((qDia1 / total) * 100) : 0
    const pctBajas = total > 0 ? Math.round((bajas / total) * 100) : 0
    const pctBajasImputables = total > 0 ? Math.round((bajasImputables / total) * 100) : 0

    const score = Math.max(0, Math.round(
      (pctConversionOP * 0.45) +
      (pctQDia1 * 0.35) +
      (pctCumplimientoVolumen * 0.20) -
      (pctBajasImputables * 0.15)
    ))

    recruiterScores.push({
      nombre: recObj.nombre,
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
      pctBajas,
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
  campanasMetas = [],
  attendanceIndexes = null
) {
  // Index de asistencias para coherencia
  const opDocs = new Set(attendanceIndexes?.opDocsSet || [])
  const bajasDocs = new Set(attendanceIndexes?.bajasDocsSet || [])
  const d1Docs = new Set()

  asistencias.forEach(a => {
    const doc = norm(a.postulante_documento || a.documento)
    if (!doc) return
    const sigla = norm(a.sigla_asistencia || a.sigla)
    const motivo = norm(a.motivo_baja)
    const estado = norm(a.estado)
    const isB1 = motivo.includes('BAJA DIA 1') || motivo.includes('BAJA D1') || estado.includes('BAJA DIA 1') || sigla === 'BD1'

    if (sigla === 'I-OP') {
      opDocs.add(doc)
      d1Docs.add(doc)
    } else if (sigla === 'B' || isB1 || motivo) {
      bajasDocs.add(doc)
      if (!isB1) d1Docs.add(doc)
    } else if (sigla === 'A' || sigla === 'FJ' || sigla === 'CAPACITACION' || sigla === 'OJT' || sigla === 'T') {
      d1Docs.add(doc)
    }
  })

  const isConsolidated = !targetIdentifier || targetIdentifier === 'TODOS' || targetIdentifier === 'ALL'

  let myPostulantes = []
  let baseDetails = null

  if (isConsolidated) {
    // ── VISTA CONSOLIDADA: TODOS LOS RECLUTADORES DEL FILTRO ACTIVO ─────────
    myPostulantes = postulantes || []
    const total = myPostulantes.length

    let qDia1 = 0
    let ingresantesOP = 0
    let bajas = 0
    let bajasImputables = 0
    let enCapacitacion = 0

    myPostulantes.forEach(p => {
      const isOP = isCandidateIngresoOP(p, opDocs)
      const isBaja = isCandidateBaja(p, bajasDocs)
      const isImputable = isCandidateImputable(p)
      const hasD1 = isCandidateDia1Asistio(p, opDocs, d1Docs)

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

    const pctQDia1 = total > 0 ? Math.round((qDia1 / total) * 100) : 0
    // Regla de Contact Center: Conversión a OP sobre Día 1
    const pctConversionOP = qDia1 > 0 ? Math.round((ingresantesOP / qDia1) * 100) : 0
    const pctBajas = total > 0 ? Math.round((bajas / total) * 100) : 0
    const pctBajasImputables = total > 0 ? Math.round((bajasImputables / total) * 100) : 0

    baseDetails = {
      nombre: 'TODOS LOS RECLUTADORES (CONSOLIDADO)',
      dni: '',
      usuario: 'CONSOLIDADO',
      email: '',
      segmento: 'OPERACIÓN CONSOLIDADA',
      totalPostulantes: total,
      qDia1,
      ingresantesOP,
      bajas,
      bajasImputables,
      enCapacitacion,
      gruposAsignadosCount: campanasMetas.length,
      pctQDia1,
      pctConversionOP,
      pctBajas,
      pctBajasImputables,
      score: 100,
      rank: 1,
      totalRank: 1,
      segmentRank: 1,
      totalInSegment: 1,
      isConsolidated: true
    }
  } else {
    // ── VISTA INDIVIDUAL DE UN RECLUTADOR ESPECÍFICO ────────────────────────
    const target = norm(targetIdentifier)
    let rankedItem = allRankedRecruiters.find(r => norm(r.nombre) === target)
    if (!rankedItem && target) {
      rankedItem = allRankedRecruiters.find(r => (r.dni && norm(r.dni) === target) || (r.usuario && norm(r.usuario) === target))
    }
    if (!rankedItem && target) {
      rankedItem = allRankedRecruiters.find(r => matchPerson(r.nombre, targetIdentifier))
    }
    if (!rankedItem && allRankedRecruiters.length > 0) {
      rankedItem = allRankedRecruiters[0]
    }

    if (!rankedItem) return null

    baseDetails = { ...rankedItem, isConsolidated: false }
    myPostulantes = rankedItem.postulantes || []
  }

  // ── 1. FUNNEL DE CONVERSIÓN REAL (EMBUDO OPERATIVO) ───────────────────────
  const totalPosts = baseDetails.totalPostulantes
  const qDia1 = baseDetails.qDia1
  const enCap = baseDetails.enCapacitacion
  const op = baseDetails.ingresantesOP

  const funnel = [
    {
      stage: 'Citados / Nómina',
      label: 'Postulantes',
      count: totalPosts,
      pct: 100,
      subtext: `${totalPosts} citaciones registradas`,
      color: '#6366f1' // Indigo
    },
    {
      stage: 'Asistieron Día 1 (Formación)',
      label: 'Efectividad Inicial',
      count: qDia1,
      pct: totalPosts > 0 ? Math.round((qDia1 / totalPosts) * 100) : 0,
      subtext: `${qDia1} iniciaron aula de capacitación`,
      dropCount: Math.max(0, totalPosts - qDia1),
      dropPct: totalPosts > 0 ? Math.round(((totalPosts - qDia1) / totalPosts) * 100) : 0,
      color: '#06b6d4' // Cyan
    },
    {
      stage: 'En Formación / OJT',
      label: 'Retención de Aula',
      count: enCap + op,
      pct: qDia1 > 0 ? Math.round(((enCap + op) / qDia1) * 100) : 0,
      subtext: `${enCap} en capacitación + ${op} en producción`,
      dropCount: Math.max(0, qDia1 - (enCap + op)),
      dropPct: qDia1 > 0 ? Math.round(((qDia1 - (enCap + op)) / qDia1) * 100) : 0,
      color: '#8b5cf6' // Violet
    },
    {
      stage: 'Ingresantes a OP',
      label: 'Conversión sobre Día 1',
      count: op,
      pct: qDia1 > 0 ? Math.round((op / qDia1) * 100) : 0,
      subtext: `${op} ingresaron a operaciones (${baseDetails.pctConversionOP}% de Día 1)`,
      color: '#10b981' // Emerald
    }
  ]

  // ── 2. EVOLUCIÓN POR SEMANAS OPERATIVAS (COHORTES REALES) ─────────────────
  const weekMap = new Map()

  myPostulantes.forEach(p => {
    let semLabel = formatSemanaLabel(p.semana_trabajo || p.semana || p.semana_label)
    if (semLabel === 'Semana ?') {
      const gCode = p.grupo_codigo
      if (gCode) {
        const meta = campanasMetas.find(g => norm(g.grupo_codigo || g.codigo) === norm(gCode))
        if (meta && (meta.semana || meta.semana_trabajo || meta.semana_label)) {
          semLabel = formatSemanaLabel(meta.semana || meta.semana_trabajo || meta.semana_label)
        }
      }
    }
    // Resolución inteligente de semana por fecha para evitar barra "General"
    if (!semLabel || semLabel === 'Semana ?') {
      const fromDate = getISOWeekFromDate(p.fecha_ingreso || p.fecha_registro || p.created_at)
      semLabel = fromDate || 'Sem 35'
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

    const isOP = isCandidateIngresoOP(p, opDocs)
    const isBaja = isCandidateBaja(p, bajasDocs)
    const hasD1 = isCandidateDia1Asistio(p, opDocs, d1Docs)

    if (hasD1) w.qDia1++
    if (isOP) w.ingresantesOP++
    if (isBaja) w.bajas++
  })

  const weeklyEvolution = Array.from(weekMap.values())
    .sort((a, b) => (a.semanaNum || 999) - (b.semanaNum || 999))
    .map(w => ({
      ...w,
      pctD1: w.postulantes > 0 ? Math.round((w.qDia1 / w.postulantes) * 100) : 0,
      pctOP: w.qDia1 > 0 ? Math.round((w.ingresantesOP / w.qDia1) * 100) : 0
    }))

  // ── 3. DISTRIBUCIÓN DE MOTIVOS DE BAJA REALES ────────────────────────────
  const motivosMap = new Map()
  let totalBajasContadas = 0

  myPostulantes.forEach(p => {
    if (isCandidateBaja(p, bajasDocs)) {
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

  // ── 4. TABLA DE TRAZABILIDAD NOMINAL (POSTULANTES) ────────────────────────
  const postulantesNominal = myPostulantes.map(p => {
    const isOP = isCandidateIngresoOP(p, opDocs)
    const isBaja = isCandidateBaja(p, bajasDocs)
    const hasD1 = isCandidateDia1Asistio(p, opDocs, d1Docs)

    return {
      documento: p.documento || '-',
      nombre_completo: p.nombre_completo || `${p.apellido_paterno || ''} ${p.apellido_materno || ''} ${p.nombres || ''}`.trim() || 'Sin Nombre',
      campana: p.campana || 'Sin Campaña',
      grupo_codigo: p.grupo_codigo || '-',
      reclutador: p.reclutador || 'Sin Asignar',
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

  // ── 5. INDICADORES DE CONTACT CENTER (MAQUETAS / SLAS) ────────────────────
  const indicadores = getIndicadoresMaqueta(baseDetails, 'RECLUTADOR')

  return {
    ...baseDetails,
    funnel,
    weeklyEvolution,
    motivosBajaBreakdown,
    indicadores,
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
    const doc = norm(a.postulante_documento || a.documento)
    if (doc) tObj.alumnosSet.add(doc)
    if (gCode) tObj.gruposSet.add(gCode)
    tObj.asistenciasList.push(a)

    const sigla = norm(a.sigla_asistencia || a.sigla)
    tObj.totalAsistenciasPosibles++

    if (sigla === 'I-OP') {
      if (doc) tObj.ingresantesOPSet.add(doc)
      tObj.asistenciasEfectivas++
    } else if (sigla === 'A' || sigla === 'FJ' || sigla === 'CAPACITACION' || sigla === 'OJT' || sigla === 'T') {
      tObj.asistenciasEfectivas++
    } else if (sigla === 'B') {
      if (doc) tObj.bajasSet.add(doc)
    } else if (sigla === 'F' || sigla === 'FI') {
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
        const doc = norm(p.documento)
        if (doc) tObj.alumnosSet.add(doc)
        tObj.gruposSet.add(gCode)
        if (norm(p.estado) === 'INGRESO_OP' || norm(p.estado) === 'EN_OPERACIONES') {
          if (doc) tObj.ingresantesOPSet.add(doc)
        }
        if (norm(p.estado) === 'BAJA' || p.motivo_baja) {
          if (doc) tObj.bajasSet.add(doc)
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
  const isConsolidated = !targetIdentifier || targetIdentifier === 'TODOS' || targetIdentifier === 'ALL'

  let baseDetails = null
  let myAsistencias = []
  let myAlumnosSet = new Set()

  if (isConsolidated) {
    myAsistencias = asistencias || []
    postulantes.forEach(p => {
      const d = norm(p.documento)
      if (d) myAlumnosSet.add(d)
    })
    myAsistencias.forEach(a => {
      const d = norm(a.postulante_documento || a.documento)
      if (d) myAlumnosSet.add(d)
    })

    const totalAlumnos = myAlumnosSet.size
    let totalAsistenciasPosibles = 0
    let asistenciasEfectivas = 0
    let faltasSinBaja = 0
    const opSet = new Set()
    const bajasSet = new Set()

    myAsistencias.forEach(a => {
      totalAsistenciasPosibles++
      const sigla = norm(a.sigla_asistencia || a.sigla)
      const doc = norm(a.postulante_documento || a.documento)
      if (sigla === 'I-OP') {
        if (doc) opSet.add(doc)
        asistenciasEfectivas++
      } else if (sigla === 'A' || sigla === 'FJ' || sigla === 'CAPACITACION' || sigla === 'OJT' || sigla === 'T') {
        asistenciasEfectivas++
      } else if (sigla === 'B') {
        if (doc) bajasSet.add(doc)
      } else if (sigla === 'F' || sigla === 'FI') {
        faltasSinBaja++
      }
    })

    postulantes.forEach(p => {
      const doc = norm(p.documento)
      if (norm(p.estado) === 'INGRESO_OP' || norm(p.estado) === 'EN_OPERACIONES') {
        if (doc) opSet.add(doc)
      }
      if (norm(p.estado) === 'BAJA' || p.motivo_baja) {
        if (doc) bajasSet.add(doc)
      }
    })

    const ingresantesOP = opSet.size
    const bajas = bajasSet.size
    const activosEnAula = Math.max(0, totalAlumnos - bajas - ingresantesOP)
    const pctAsistencia = totalAsistenciasPosibles > 0 ? Math.round((asistenciasEfectivas / totalAsistenciasPosibles) * 100) : 0
    const pctRetencionOP = totalAlumnos > 0 ? Math.round((ingresantesOP / totalAlumnos) * 100) : 0
    const pctAusentismo = totalAsistenciasPosibles > 0 ? Math.round((faltasSinBaja / totalAsistenciasPosibles) * 100) : 0

    baseDetails = {
      nombre: 'TODOS LOS FORMADORES (CONSOLIDADO)',
      dni: '',
      usuario: 'CONSOLIDADO',
      email: '',
      segmento: 'CAPACITACIÓN CONSOLIDADA',
      totalAlumnos,
      activosEnAula,
      ingresantesOP,
      bajas,
      ausentismoCount: faltasSinBaja,
      pctAusentismo,
      pctAsistencia,
      pctRetencionOP,
      gruposCount: grupos.length,
      asistenciasEfectivas,
      rank: 1,
      totalRank: 1,
      segmentRank: 1,
      totalInSegment: 1,
      isConsolidated: true
    }
  } else {
    const target = norm(targetIdentifier)
    let rankedItem = allRankedTrainers.find(t => norm(t.nombre) === target)
    if (!rankedItem && target) {
      rankedItem = allRankedTrainers.find(t => (t.dni && norm(t.dni) === target) || (t.usuario && norm(t.usuario) === target))
    }
    if (!rankedItem && target) {
      rankedItem = allRankedTrainers.find(t => matchPerson(t.nombre, targetIdentifier))
    }
    if (!rankedItem && allRankedTrainers.length > 0) {
      rankedItem = allRankedTrainers[0]
    }

    if (!rankedItem) return null

    baseDetails = { ...rankedItem, isConsolidated: false }
    myAsistencias = rankedItem.asistencias || []
    myAlumnosSet = rankedItem.alumnosSet || new Set()
  }

  // ── 1. FUNNEL DE RETENCIÓN DE AULA (FORMADOR) ─────────────────────────────
  const totalAlumnos = baseDetails.totalAlumnos
  const pctAsist = baseDetails.pctAsistencia
  const activos = baseDetails.activosEnAula
  const op = baseDetails.ingresantesOP

  const funnel = [
    {
      stage: 'Nómina en Aula',
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

  myAsistencias.forEach(a => {
    const gCode = norm(a.codigo_grupo || a.grupo || a.grupo_codigo)
    const gObj = grupoInfoMap.get(gCode)
    let semLabel = formatSemanaLabel(gObj?.semana || gObj?.semana_trabajo || gObj?.semana_label || a.semana)
    if (!semLabel || semLabel === 'Semana ?') {
      const fromDate = getISOWeekFromDate(a.fecha_registro_asistencia || a.fecha_asistencia || a.created_at)
      semLabel = fromDate || 'Sem 35'
    }

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
    const sigla = norm(a.sigla_asistencia || a.sigla)

    if (sigla === 'I-OP') {
      w.ingresantesOP++
      w.asistenciasEfectivas++
    } else if (sigla === 'A' || sigla === 'FJ' || sigla === 'CAPACITACION' || sigla === 'OJT' || sigla === 'T') {
      w.asistenciasEfectivas++
    } else if (sigla === 'B') {
      w.bajas++
    } else if (sigla === 'F' || sigla === 'FI') {
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

  myAsistencias.forEach(a => {
    const sigla = norm(a.sigla_asistencia || a.sigla)
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

  // ── 4. TRAZABILIDAD NOMINAL (ALUMNOS ASIGNADOS) ───────────────────────────
  const alumnosNominal = (postulantes || [])
    .filter(p => myAlumnosSet.has(norm(p.documento)))
    .map(p => {
      const isOP = norm(p.estado) === 'INGRESO_OP' || norm(p.estado) === 'EN_OPERACIONES'
      const isBaja = norm(p.estado) === 'BAJA' || Boolean(p.motivo_baja)
      const hasD1 = isCandidateDia1Asistio(p)

      return {
        documento: p.documento || '-',
        nombre_completo: p.nombre_completo || `${p.apellido_paterno || ''} ${p.apellido_materno || ''} ${p.nombres || ''}`.trim() || 'Sin Nombre',
        campana: p.campana || 'Sin Campaña',
        grupo_codigo: p.grupo_codigo || '-',
        semana: formatSemanaLabel(p.semana_trabajo || p.semana || p.semana_label),
        dia_1: hasD1 ? 'Asistió' : (p.dia_1 ? String(p.dia_1) : 'No Asistió'),
        estado: isOP ? 'GRADUADO OP' : (isBaja ? 'BAJA EN AULA' : (p.estado || 'EN CURSO')),
        motivo_baja: p.motivo_baja || '-',
        isOP,
        isBaja,
        hasD1
      }
    })

  // ── 5. INDICADORES DE CONTACT CENTER (MAQUETAS / SLAS) ────────────────────
  const indicadores = getIndicadoresMaqueta(baseDetails, 'FORMADOR')

  return {
    ...baseDetails,
    funnel,
    weeklyEvolution,
    motivosBajaBreakdown,
    indicadores,
    alumnosNominal
  }
}
