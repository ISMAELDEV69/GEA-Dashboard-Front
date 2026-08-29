/**
 * dashboardAnalytics.js
 * Métricas y narrativas derivadas del consolidado de nóminas v2
 */

import { isBajaDia1, isBajaCapacitacion } from './dataService.js'

export const ATTENDANCE_PRESENT = ['A', 'I-OP', 'FJ']

export function getCurrentWeek() {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7))
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7)
}

export function nameMatches(n1, n2) {
  if (!n1 || !n2) return false
  const clean = (s) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
  const s1 = clean(n1)
  const s2 = clean(n2)
  if (s1 === s2) return true
  const w1 = s1.split(/\s+/)
  const w2 = s2.split(/\s+/)
  return w1.filter(w => w2.includes(w)).length >= 2
}

function isDone(val) {
  if (!val) return false
  const v = String(val).toUpperCase()
  return ['REALIZADO', 'OK', 'APROBADO', 'ASISTIO', 'SI', 'SÍ', 'COMPLETADO'].some(x => v.includes(x))
}

function isPending(val) {
  if (!val) return true
  return String(val).toUpperCase().includes('PENDIENTE')
}

function isAbsent(val) {
  if (!val) return false
  return String(val).toUpperCase().includes('FALTA')
}

function isCese(val) {
  if (!val) return false
  return String(val).toUpperCase().includes('CESE')
}

export function getConsecutiveFIs(doc, asistencias) {
  const sorted = asistencias.filter(a => a.postulante_documento === doc)
    .sort((a, b) => new Date(b.fecha_asistencia) - new Date(a.fecha_asistencia))
  let count = 0
  for (const a of sorted) {
    if (a.sigla_asistencia === 'FI') count++
    else break
  }
  return count
}

export function parseDateIso(val) {
  if (!val) return null
  const s = String(val).trim()
  if (!s || s === '-' || s === '0' || s === 'null' || s === 'undefined') return null
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0, 10)
  if (s.includes('/')) {
    const parts = s.split('/')
    if (parts.length === 3) {
      const d = parts[0].padStart(2, '0')
      const m = parts[1].padStart(2, '0')
      let y = parts[2].split(' ')[0]
      y = y.length === 2 ? `20${y}` : y
      return `${y}-${m}-${d}`
    }
  }
  const d = new Date(val)
  if (!isNaN(d.getTime())) {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }
  return null
}

export function normalizeGroupCodeExact(val) {
  if (!val) return ''
  return String(val).trim().toUpperCase().replace(/[-\s]/g, '_')
}

export function parseSemanaNum(val) {
  if (!val) return null
  const num = parseInt(String(val).replace(/\D/g, ''), 10)
  return isNaN(num) ? null : num
}

export function normalizePeriodo(val) {
  if (!val) return ''
  return String(val).replace(/\D/g, '')
}

export function getExactGrupoMetasOps(c, exactGroupOpsMap, fallbackMap) {
  if (!c) return 0
  const rawCode = c.grupo_codigo || c.codigo || ''
  if (exactGroupOpsMap) {
    if (exactGroupOpsMap.has(rawCode)) return exactGroupOpsMap.get(rawCode)
    const norm = normalizeGroupCodeExact(rawCode)
    if (exactGroupOpsMap.has(norm)) return exactGroupOpsMap.get(norm)
    const compKey = `${rawCode}__${normalizePeriodo(c.periodo)}__${parseSemanaNum(c.semana || c.semana_label)}`
    if (exactGroupOpsMap.has(compKey)) return exactGroupOpsMap.get(compKey)
  }
  return fallbackMap?.get(rawCode) || 0
}

// ── Índice Hash O(1) Compartido para Dashboards ───────────────
export function buildAttendanceIndexes(asistencias = [], postulantes = [], campanasMetas = []) {
  const opDocsSet = new Set()
  const bajasDocsSet = new Set()
  const docAttendanceByDate = new Map() // doc -> Map<isoDate, sigla>

  for (let i = 0; i < asistencias.length; i++) {
    const a = asistencias[i]
    const doc = a.postulante_documento || a.documento
    if (!doc) continue
    const sigla = a.sigla_asistencia
    if (sigla === 'I-OP') {
      opDocsSet.add(doc)
    } else if (sigla === 'B') {
      bajasDocsSet.add(doc)
    }

    const isoDate = parseDateIso(a.fecha_asistencia || a.fecha_registro_asistencia)
    if (isoDate) {
      if (!docAttendanceByDate.has(doc)) {
        docAttendanceByDate.set(doc, new Map())
      }
      docAttendanceByDate.get(doc).set(isoDate, sigla)
    }
  }

  // Descriptores para Metas RQ (Cohortes exactas sin colapso de sufijos)
  const metaDescriptors = (campanasMetas || []).map(c => {
    const rawCode = c.grupo_codigo || c.codigo || ''
    return {
      rawCode,
      normCode: normalizeGroupCodeExact(rawCode),
      periodo: normalizePeriodo(c.periodo),
      semana: parseSemanaNum(c.semana || c.semana_label),
      campana: String(c.campana_nombre || c.campana || '').toUpperCase().trim(),
      matchedDocs: new Set()
    }
  })

  // Pre-indexar candidatos por grupo y grupo_codigo base
  const groupOpsCountMap = new Map()
  const exactGroupOpsCountMap = new Map()
  const groupDocsMap = new Map()

  for (let i = 0; i < postulantes.length; i++) {
    const p = postulantes[i]
    const doc = p.documento
    const rawGroup = p.grupo_codigo
    if (!rawGroup || !doc) continue
    const baseGroup = String(rawGroup).replace(/_\d+$/, '')

    // Indexar docs por grupo general
    if (!groupDocsMap.has(rawGroup)) groupDocsMap.set(rawGroup, new Set())
    groupDocsMap.get(rawGroup).add(doc)
    if (baseGroup !== rawGroup) {
      if (!groupDocsMap.has(baseGroup)) groupDocsMap.set(baseGroup, new Set())
      groupDocsMap.get(baseGroup).add(doc)
    }

    // Si el postulante tiene I-OP confirmado en asistencias o estado EN_OPERACION
    const isOp = Boolean(opDocsSet.has(doc) || p.estado === 'EN_OPERACION')
    if (isOp) {
      // 1. Conteo con colapso de sufijos para Formadores / General
      if (!groupOpsCountMap.has(rawGroup)) groupOpsCountMap.set(rawGroup, new Set())
      groupOpsCountMap.get(rawGroup).add(doc)

      if (baseGroup !== rawGroup) {
        if (!groupOpsCountMap.has(baseGroup)) groupOpsCountMap.set(baseGroup, new Set())
        groupOpsCountMap.get(baseGroup).add(doc)
      }

      // 2. Conteo EXACTO acotado por cohorte para Metas RQ
      const pNormCode = normalizeGroupCodeExact(rawGroup)
      const pPeriodo = normalizePeriodo(p.periodo_reclutado || p.periodo)
      const pSemana = parseSemanaNum(p.semana_trabajo || p.semana)
      const pCampana = String(p.campana || p.campaign || '').toUpperCase().trim()

      if (metaDescriptors.length > 0) {
        for (let m = 0; m < metaDescriptors.length; m++) {
          const desc = metaDescriptors[m]
          // A. Coincidencia EXACTA de código (sin colapsar sufijos _1, _2)
          if (desc.normCode !== pNormCode) continue

          // B. Filtro por Periodo (si ambos tienen periodo)
          if (desc.periodo && pPeriodo) {
            if (desc.periodo !== pPeriodo && !desc.periodo.includes(pPeriodo) && !pPeriodo.includes(desc.periodo)) {
              continue
            }
          }

          // C. Filtro por Semana (si ambos tienen semana)
          if (desc.semana !== null && pSemana !== null) {
            if (desc.semana !== pSemana) continue
          }

          // D. Filtro por Campaña (si ambos tienen campaña)
          if (desc.campana && pCampana) {
            if (!pCampana.includes(desc.campana) && !desc.campana.includes(pCampana)) {
              continue
            }
          }

          desc.matchedDocs.add(doc)
        }
      } else {
        if (!exactGroupOpsCountMap.has(rawGroup)) exactGroupOpsCountMap.set(rawGroup, new Set())
        exactGroupOpsCountMap.get(rawGroup).add(doc)
      }
    }
  }

  // Convertir sets a counts numéricos para acceso directo O(1)
  const groupOpsMap = new Map()
  groupOpsCountMap.forEach((docs, gCode) => {
    groupOpsMap.set(gCode, docs.size)
  })

  const exactGroupOpsMap = new Map()
  if (metaDescriptors.length > 0) {
    metaDescriptors.forEach(desc => {
      exactGroupOpsMap.set(desc.rawCode, desc.matchedDocs.size)
      exactGroupOpsMap.set(desc.normCode, desc.matchedDocs.size)
      exactGroupOpsMap.set(`${desc.rawCode}__${desc.periodo}__${desc.semana}`, desc.matchedDocs.size)
    })
  } else {
    exactGroupOpsCountMap.forEach((docs, gCode) => {
      exactGroupOpsMap.set(gCode, docs.size)
    })
  }

  return {
    opDocsSet,
    bajasDocsSet,
    groupOpsMap,
    exactGroupOpsMap,
    groupDocsMap,
    docAttendanceByDate,
  }
}

// ── Heatmap de Retención Campaña × Etapa ──────────────────────
export function buildCampanaEtapaHeatmap(postulantes = [], asistencias = [], campanasMetas = [], indexes = null) {
  const attIndexes = indexes || buildAttendanceIndexes(asistencias, postulantes)
  const { opDocsSet, docAttendanceByDate } = attIndexes

  // 1. Mapeo de grupos y agregación de metas por campaña
  const groupMap = new Map()
  const campanaMetasSum = new Map()

  for (let i = 0; i < (campanasMetas || []).length; i++) {
    const g = campanasMetas[i]
    const code = g.grupo_codigo || g.codigo
    if (code) {
      groupMap.set(code, g)
      const baseCode = String(code).replace(/_\d+$/, '')
      if (!groupMap.has(baseCode)) groupMap.set(baseCode, g)
    }

    const cName = String(g.campana_nombre || g.campana || '').trim().toUpperCase()
    if (cName) {
      if (!campanaMetasSum.has(cName)) {
        campanaMetasSum.set(cName, { metaDia1: 0, metaOp: 0, metaDia0: 0, countGrupos: 0 })
      }
      const cm = campanaMetasSum.get(cName)
      cm.metaDia1 += Number(g.meta_dia_1) || 0
      cm.metaOp += Number(g.rq_solicitado) || 0
      cm.metaDia0 += Number(g.meta_dia_0) || 0
      cm.countGrupos++
    }
  }

  // 2. Acumuladores por campaña
  const campanaMap = new Map()

  for (let i = 0; i < (postulantes || []).length; i++) {
    const p = postulantes[i]
    const g = groupMap.get(p.grupo_codigo) || groupMap.get(String(p.grupo_codigo || '').replace(/_\d+$/, ''))
    const rawCampana = p.campana || g?.campana_nombre || g?.campana || 'Sin Campaña'
    const campanaKey = String(rawCampana).trim().toUpperCase()
    if (!campanaKey || campanaKey === '-' || campanaKey === 'NULL' || campanaKey === 'UNDEFINED') continue

    if (!campanaMap.has(campanaKey)) {
      campanaMap.set(campanaKey, {
        campana: rawCampana.trim(),
        totalReclutados: 0,
        dia1Count: 0,
        ojtCount: 0,
        ojtEligibleCount: 0,
        opCount: 0,
        gruposTotal: new Set(),
        gruposMissingOjt: new Set(),
      })
    }

    const row = campanaMap.get(campanaKey)
    row.totalReclutados++
    if (p.grupo_codigo) row.gruposTotal.add(p.grupo_codigo)

    const doc = p.documento
    const docDates = doc ? docAttendanceByDate.get(doc) : null

    // ── Etapa 2: Conexión Día 1 ──
    const isDia1Present =
      p.dia_1 === 'ASISTIO' ||
      p.dia_0 === 'ASISTIO' ||
      (docDates && docDates.size > 0)
    if (isDia1Present) {
      row.dia1Count++
    }

    // ── Etapa 3: Conexión OJT (corte en fecha_inicio_ojt) ──
    const rawOjtDate = g?.fecha_inicio_ojt || p.fecha_conexion_ojt
    const ojtIso = parseDateIso(rawOjtDate)
    const isOp = opDocsSet.has(doc) || p.estado === 'EN_OPERACION'

    if (!ojtIso) {
      if (p.grupo_codigo) row.gruposMissingOjt.add(p.grupo_codigo)
      // Si no hay fecha_inicio_ojt pero ya llegó a OP o tiene marca directa de OJT, se cuenta como éxito
      if (isOp || Boolean(p.fecha_conexion_ojt)) {
        row.ojtEligibleCount++
        row.ojtCount++
      }
    } else {
      row.ojtEligibleCount++
      if (isOp || Boolean(p.fecha_conexion_ojt)) {
        row.ojtCount++
      } else if (docDates) {
        let activeOnOrAfterOjt = false
        for (const [dateKey, sigla] of docDates.entries()) {
          if (dateKey >= ojtIso && sigla !== 'B') {
            activeOnOrAfterOjt = true
            break
          }
        }
        if (activeOnOrAfterOjt) {
          row.ojtCount++
        }
      }
    }

    // ── Etapa 4: Conexión OP ──
    if (isOp) {
      row.opCount++
    }
  }

  // 3. Formateo y cálculo de cumplimiento vs. Requerimiento (RQ) y Retención
  let totalMissingOjtCampanas = 0
  const rows = Array.from(campanaMap.values())
    .filter(c => c.totalReclutados > 0 && c.campana !== 'Sin Campaña')
    .map(c => {
      const campanaKey = c.campana.trim().toUpperCase()
      const metaInfo = campanaMetasSum.get(campanaKey) || { metaDia1: 0, metaOp: 0, metaDia0: 0 }

      const hasMissingOjt = c.gruposMissingOjt.size > 0 && c.ojtEligibleCount === 0
      if (hasMissingOjt) totalMissingOjtCampanas++

      // A. Requerimientos / Metas
      const rqDia1 = metaInfo.metaDia1 > 0 ? metaInfo.metaDia1 : c.totalReclutados
      const rqOp = metaInfo.metaOp > 0 ? metaInfo.metaOp : (c.dia1Count || c.totalReclutados)

      // B. Cumplimiento contra Requerimiento RQ
      const pctDia1VsRq = rqDia1 > 0 ? Math.round((c.dia1Count / rqDia1) * 100) : 0
      const pctOpVsRq = rqOp > 0 ? Math.round((c.opCount / rqOp) * 100) : 0

      // C. Retención del Embudo contra Postulantes
      const pctDia1VsRec = c.totalReclutados > 0 ? Math.round((c.dia1Count / c.totalReclutados) * 100) : 0
      const pctOpVsRec = c.totalReclutados > 0 ? Math.round((c.opCount / c.totalReclutados) * 100) : 0

      const pctOjt = c.ojtEligibleCount > 0 
        ? Math.min(100, Math.round((c.ojtCount / c.ojtEligibleCount) * 100))
        : null

      return {
        campana: c.campana,
        totalReclutados: c.totalReclutados,
        // Día 1
        dia1Count: c.dia1Count,
        rqDia1,
        pctDia1VsRq,
        pctDia1VsRec,
        // OJT
        ojtCount: c.ojtCount,
        ojtEligibleCount: c.ojtEligibleCount,
        pctOjt,
        hasMissingOjt,
        missingOjtGruposCount: c.gruposMissingOjt.size,
        // OP
        opCount: c.opCount,
        rqOp,
        pctOpVsRq,
        pctOpVsRec,
      }
    })
    .sort((a, b) => b.totalReclutados - a.totalReclutados)

  return {
    rows,
    totalMissingOjtCampanas,
  }
}

// ── Métricas globales (consolidado nómina) ────────────────────
export function computeGlobalMetrics(postulantes = [], asistencias = [], grupos = [], indexes = null) {
  const total = postulantes.length
  const opDocs = indexes?.opDocsSet || new Set(
    asistencias.filter(a => a.sigla_asistencia === 'I-OP').map(a => a.postulante_documento || a.documento)
  )

  let inCapacitacion = 0
  let inOps = 0
  let enOjt = 0
  let testPsicoDone = 0
  let evalDia0Pending = 0
  let dia0Asistio = 0
  let dia1Cese = 0
  let totalRemuneracion = 0
  let totalBonos = 0
  let pagoCapCount = 0

  for (let i = 0; i < total; i++) {
    const p = postulantes[i]
    if (p.estado === 'EN_CAPACITACION' || p.fecha_inicio_capacitacion) inCapacitacion++
    if (p.estado === 'EN_OPERACION' || opDocs.has(p.documento)) inOps++
    if (p.fecha_conexion_ojt && p.estado !== 'EN_OPERACION' && !opDocs.has(p.documento)) enOjt++
    if (isDone(p.test_psicologico)) testPsicoDone++
    if (isPending(p.evaluacion_dia_0)) evalDia0Pending++
    if (isDone(p.dia_0_obs) || p.dia_0) dia0Asistio++
    if (isCese(p.status_dia_1)) dia1Cese++
    if (p.remuneracion) totalRemuneracion += (Number(p.remuneracion) || 0)
    if (p.bono_variable || p.bono_movilidad || p.bono_bienvenida || p.bono_permanencia || p.bono_asistencia_perfecta) {
      totalBonos += (Number(p.bono_variable) || 0) + (Number(p.bono_movilidad) || 0) +
        (Number(p.bono_bienvenida) || 0) + (Number(p.bono_permanencia) || 0) +
        (Number(p.bono_asistencia_perfecta) || 0)
    }
    if (p.pago_capacitacion) pagoCapCount++
  }

  const totalAsist = asistencias.length
  let presentCount = 0
  for (let i = 0; i < totalAsist; i++) {
    if (ATTENDANCE_PRESENT.includes(asistencias[i].sigla_asistencia)) presentCount++
  }

  const attendanceRate = totalAsist > 0 ? Math.round((presentCount / totalAsist) * 100) : 0
  const conversionRate = total > 0 ? Math.round((inOps / total) * 100) : 0

  return {
    total,
    totalGrupos: grupos.length,
    inCapacitacion,
    enOjt,
    inOps,
    attendanceRate,
    conversionRate,
    testPsicoDone,
    evalDia0Pending,
    dia0Asistio,
    dia1Cese,
    totalRemuneracion,
    totalBonos,
    pagoCapCount,
  }
}

// Embudo alineado al consolidado Excel
export function buildConsolidadoFunnel(postulantes = [], asistencias = [], indexes = null) {
  const total = postulantes.length
  const opDocs = indexes?.opDocsSet || new Set(
    asistencias.filter(a => a.sigla_asistencia === 'I-OP').map(a => a.postulante_documento || a.documento)
  )

  let conTest = 0
  let inicioCap = 0
  let evalD0 = 0
  let conOjt = 0
  let conOp = 0

  for (let i = 0; i < total; i++) {
    const p = postulantes[i]
    if (isDone(p.test_psicologico)) conTest++
    const doc = p.documento
    const hasAttendance = doc && indexes?.docAttendanceByDate?.get(doc)?.size > 0
    if (p.dia_0 === 'ASISTIO' || p.dia_1 === 'ASISTIO' || hasAttendance) inicioCap++
    if (!isPending(p.evaluacion_dia_0) && p.evaluacion_dia_0) evalD0++
    if (p.fecha_conexion_ojt) conOjt++
    if (p.estado === 'EN_OPERACION' || opDocs.has(p.documento)) conOp++
  }

  return [
    { etapa: '1. Reclutados', cantidad: total, fill: '#6366f1', pct: 100 },
    { etapa: '2. Test Psicológico', cantidad: conTest, fill: '#818cf8', pct: total ? Math.round(conTest / total * 100) : 0 },
    { etapa: '3. Inicio Capacitación', cantidad: inicioCap, fill: '#2dd4bf', pct: total ? Math.round(inicioCap / total * 100) : 0 },
    { etapa: '4. Evaluación Día 0', cantidad: evalD0, fill: '#10b981', pct: total ? Math.round(evalD0 / total * 100) : 0 },
    { etapa: '5. Conexión OJT', cantidad: conOjt, fill: '#f59e0b', pct: total ? Math.round(conOjt / total * 100) : 0 },
    { etapa: '6. Conexión OP', cantidad: conOp, fill: '#f97316', pct: total ? Math.round(conOp / total * 100) : 0 },
  ]
}

export function buildFuenteOfertaData(postulantes = []) {
  const counts = {}
  postulantes.forEach(p => {
    const src = p.fuente_oferta?.trim() || 'Sin registrar'
    counts[src] = (counts[src] || 0) + 1
  })
  return Object.entries(counts)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6)
}

export function buildCampanaPerformance(postulantes = [], asistencias = []) {
  const byCamp = {}
  postulantes.forEach(p => {
    const c = p.campana || 'Sin campaña'
    if (!byCamp[c]) byCamp[c] = { total: 0, ops: 0, bajas: 0 }
    byCamp[c].total++
    if (p.fecha_conexion_op) byCamp[c].ops++
  })
  asistencias.forEach(a => {
    if (a.sigla_asistencia === 'B') {
      const p = postulantes.find(x => x.documento === a.postulante_documento)
      if (p?.campana && byCamp[p.campana]) byCamp[p.campana].bajas++
    }
  })
  return Object.entries(byCamp).map(([campana, d]) => ({
    campana,
    total: d.total,
    conversion: d.total > 0 ? Math.round((d.ops / d.total) * 100) : 0,
    retencion: d.total > 0 ? Math.round(((d.total - d.bajas) / d.total) * 100) : 100,
  })).sort((a, b) => b.total - a.total)
}

export function buildSedeRetention(postulantes = [], asistencias = []) {
  const sedes = {}
  postulantes.forEach(p => {
    if (!p.sede) return
    if (!sedes[p.sede]) sedes[p.sede] = { total: 0, bajas: 0 }
    sedes[p.sede].total++
  })
  asistencias.forEach(a => {
    if (a.sigla_asistencia === 'B') {
      const p = postulantes.find(x => x.documento === a.postulante_documento)
      if (p?.sede && sedes[p.sede]) sedes[p.sede].bajas++
    }
  })
  return Object.entries(sedes).map(([Sede, d]) => ({
    Sede,
    Total: d.total,
    Retencion: d.total > 0 ? Math.round(((d.total - d.bajas) / d.total) * 100) : 100,
  })).sort((a, b) => b.Retencion - a.Retencion)
}

export function buildMotiveData(asistencias = []) {
  const counts = {}
  asistencias.forEach(a => {
    if (a.sigla_asistencia === 'B' && a.motivo_baja) {
      counts[a.motivo_baja] = (counts[a.motivo_baja] || 0) + 1
    }
  })
  return Object.entries(counts)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6)
}

export function buildPeriodTrend(postulantes = []) {
  const byPeriod = {}
  postulantes.forEach(p => {
    const per = p.periodo_reclutado || 'Sin periodo'
    byPeriod[per] = (byPeriod[per] || 0) + 1
  })
  return Object.entries(byPeriod)
    .map(([periodo, cantidad]) => ({ periodo, cantidad }))
    .sort((a, b) => a.periodo.localeCompare(b.periodo))
    .slice(-6)
}

// ── Métricas formador ───────────────────────────────────────
export function computeFormadorMetrics(postulantes, asistencias, grupos, formadorDni, { preFiltered = false } = {}) {
  const myGrupos = preFiltered
    ? grupos
    : grupos.filter(g => g.formador_documento === formadorDni)
  const myCodes = new Set(myGrupos.map(g => g.codigo))
  const myAsist = asistencias.filter(a => myCodes.has(a.grupo_codigo))
  const myDocs = new Set(myAsist.map(a => a.postulante_documento))

  const myPostulantes = postulantes.filter(p =>
    myDocs.has(p.documento) || (p.grupo_codigo && myCodes.has(p.grupo_codigo))
  )

  const totalRecords = myAsist.length
  const presentCount = myAsist.filter(a => ATTENDANCE_PRESENT.includes(a.sigla_asistencia)).length
  const avgAttendance = totalRecords > 0 ? Math.round((presentCount / totalRecords) * 100) : 0

  const evalD0Pending = myPostulantes.filter(p => isPending(p.evaluacion_dia_0)).length
  const testPending = myPostulantes.filter(p => !p.test_psicologico || isPending(p.test_psicologico)).length
  const validPcPending = myPostulantes.filter(p => !p.validacion_pc || isPending(p.validacion_pc)).length

  const dia0Faltas = myPostulantes.filter(p => isAbsent(p.dia_0_obs)).length
  const dia1Cese = myPostulantes.filter(p => isCese(p.status_dia_1)).length

  const conOp = myPostulantes.filter(p =>
    p.fecha_conexion_op ||
    myAsist.some(a => a.postulante_documento === p.documento && a.sigla_asistencia === 'I-OP')
  ).length

  const tasaConversionAula = myPostulantes.length > 0
    ? Math.round((conOp / myPostulantes.length) * 100) : 0

  return {
    myGrupos,
    myAsist,
    myPostulantes,
    activeGroupsCount: myGrupos.length,
    alumnosActivos: myPostulantes.length,
    avgAttendance,
    evalD0Pending,
    testPending,
    validPcPending,
    dia0Faltas,
    dia1Cese,
    conOp,
    tasaConversionAula,
  }
}

export function buildFormadorPipeline(postulantes = []) {
  return [
    { paso: 'Test Psico', ok: postulantes.filter(p => isDone(p.test_psicologico)).length, total: postulantes.length },
    { paso: 'Valid. PC', ok: postulantes.filter(p => isDone(p.validacion_pc)).length, total: postulantes.length },
    { paso: 'Eval. Día 0', ok: postulantes.filter(p => !isPending(p.evaluacion_dia_0) && p.evaluacion_dia_0).length, total: postulantes.length },
    { paso: 'Inicio Cap.', ok: postulantes.filter(p => p.fecha_inicio_capacitacion).length, total: postulantes.length },
    { paso: 'Conexión OP', ok: postulantes.filter(p => p.fecha_conexion_op).length, total: postulantes.length },
  ].map(x => ({ ...x, pct: x.total > 0 ? Math.round(x.ok / x.total * 100) : 0 }))
}

// ── Storytelling narrativo ────────────────────────────────────
export function buildExecutiveNarrative(metrics, funnel, campanas, motivos) {
  const stories = []
  const { total, conversionRate, attendanceRate, dia1Cese, totalRemuneracion, evalD0Pending } = metrics

  if (total === 0) {
    return [{
      type: 'info',
      title: 'Sin datos operativos aún',
      body: 'La base está vacía y lista para tu roleplay. Comienza registrando postulantes en Nómina para activar los dashboards con storytelling en tiempo real.',
    }]
  }

  stories.push({
    type: 'info',
    title: 'Panorama general',
    body: `Hay ${total} postulante${total !== 1 ? 's' : ''} en el consolidado activo. De ellos, ${conversionRate}% ha llegado a conexión en operaciones (OP). La asistencia promedio en capacitación es ${attendanceRate}%.`,
  })

  if (funnel.length >= 2) {
    const reclutados = funnel[0]?.cantidad || 0
    const op = funnel[funnel.length - 1]?.cantidad || 0
    const leak = reclutados - op
    if (leak > 0) {
      stories.push({
        type: 'warning',
        title: 'Fuga en el embudo',
        body: `${leak} persona${leak !== 1 ? 's' : ''} se perdieron entre reclutamiento y operaciones. Revisa las etapas de test psicológico, evaluación día 0 y conexión OJT — ahí suele concentrarse la deserción temprana.`,
      })
    }
  }

  if (dia1Cese > 0) {
    stories.push({
      type: 'error',
      title: 'Alerta Día 1',
      body: `${dia1Cese} postulante${dia1Cese !== 1 ? 's' : ''} con status CESE en día 1. Esto indica deserción inmediata post-capacitación: coordina con reclutamiento la calidad del filtro previo.`,
    })
  }

  if (evalD0Pending > 0) {
    stories.push({
      type: 'warning',
      title: 'Evaluaciones pendientes',
      body: `${evalD0Pending} evaluación${evalD0Pending !== 1 ? 'es' : ''} de día 0 aún pendiente${evalD0Pending !== 1 ? 's' : ''}. Los formadores deben completarlas antes de avanzar al OJT.`,
    })
  }

  if (motivos.length > 0) {
    stories.push({
      type: 'info',
      title: 'Principal motivo de baja',
      body: `La causa #1 de deserción es "${motivos[0].name}" con ${motivos[0].value} caso${motivos[0].value !== 1 ? 's' : ''}. ${motivos[0].name === 'SALUD' || motivos[0].name === 'DISTANCIA' ? 'Considera ajustar horarios o modalidad remota.' : 'Revisa el speech de reclutamiento para alinear expectativas.'}`,
    })
  }

  if (campanas.length > 0) {
    const best = campanas[0]
    const worst = campanas[campanas.length - 1]
    if (best.campana !== worst.campana) {
      stories.push({
        type: 'success',
        title: 'Desempeño por campaña',
        body: `"${best.campana}" lidera con ${best.total} registros y ${best.conversion}% de conversión a OP. "${worst.campana}" requiere atención con ${worst.conversion}% de conversión.`,
      })
    }
  }

  if (totalRemuneracion > 0) {
    stories.push({
      type: 'info',
      title: 'Proyección de costo laboral',
      body: `La remuneración base proyectada del pipeline activo suma S/ ${totalRemuneracion.toLocaleString('es-PE', { minimumFractionDigits: 0 })} mensuales, sin contar bonos variables.`,
    })
  }

  return stories
}

export function buildFormadorNarrative(metrics) {
  const stories = []
  const { alumnosActivos, avgAttendance, evalD0Pending, testPending, dia1Cese, tasaConversionAula, activeGroupsCount } = metrics

  if (alumnosActivos === 0) {
    return [{
      type: 'info',
      title: 'Aula sin alumnos asignados',
      body: 'Aún no hay postulantes vinculados a tus grupos. Cuando el admin cree grupos y asigne candidatos, verás aquí el pipeline de capacitación completo.',
    }]
  }

  stories.push({
    type: 'info',
    title: 'Tu aula hoy',
    body: `Gestionas ${activeGroupsCount} grupo${activeGroupsCount !== 1 ? 's' : ''} con ${alumnosActivos} alumno${alumnosActivos !== 1 ? 's' : ''}. La asistencia promedio es ${avgAttendance}% y ${tasaConversionAula}% ya conectó a operaciones.`,
  })

  if (avgAttendance < 80) {
    stories.push({
      type: 'warning',
      title: 'Asistencia por debajo de meta',
      body: `Tu asistencia (${avgAttendance}%) está bajo el 80% esperado. Identifica alumnos con FI consecutivas y activa el protocolo de llamadas de rescate antes del día 3.`,
    })
  }

  if (testPending > 0) {
    stories.push({
      type: 'warning',
      title: 'Tests pendientes',
      body: `${testPending} alumno${testPending !== 1 ? 's' : ''} sin test psicológico completado. Completa ENVIO DNI → TEST PSICOLÓGICO → VALIDACIÓN PC antes de iniciar capacitación formal.`,
    })
  }

  if (evalD0Pending > 0) {
    stories.push({
      type: 'error',
      title: 'Evaluación Día 0',
      body: `${evalD0Pending} evaluación${evalD0Pending !== 1 ? 'es' : ''} de día 0 pendiente${evalD0Pending !== 1 ? 's' : ''}. Sin esta evaluación no se puede avanzar a OJT ni conexión OP.`,
    })
  }

  if (dia1Cese > 0) {
    stories.push({
      type: 'error',
      title: 'Deserción Día 1',
      body: `${dia1Cese} alumno${dia1Cese !== 1 ? 's' : ''} con CESE en día 1. Documenta el motivo en observaciones y notifica a reclutamiento para retroalimentar el filtro.`,
    })
  }

  if (avgAttendance >= 85 && tasaConversionAula >= 50) {
    stories.push({
      type: 'success',
      title: 'Aula saludable',
      body: 'Tu aula mantiene indicadores saludables. Continúa con el seguimiento diario de asistencias y evaluaciones para sostener la conversión.',
    })
  }

  return stories
}

export function buildReclutadorNarrative(stats, postulantes) {
  const stories = []
  const { total, retentionRate, weeklyCount } = stats

  if (total === 0) {
    return [{
      type: 'info',
      title: 'Comienza tu roleplay',
      body: 'Registra tu primer postulante en Nómina. Cada fila del consolidado alimentará tus KPIs de calidad de selección y retención.',
    }]
  }

  stories.push({
    type: 'info',
    title: 'Tu cartera de reclutamiento',
    body: `Has registrado ${total} postulante${total !== 1 ? 's' : ''} con ${retentionRate}% de retención en capacitación. Esta semana llevas ${weeklyCount} ingreso${weeklyCount !== 1 ? 's' : ''}.`,
  })

  const conExp = postulantes.filter(p => p.exp_call_center === true || String(p.exp_call_center).toUpperCase() === 'SI').length
  if (total > 0) {
    stories.push({
      type: 'info',
      title: 'Perfil de experiencia',
      body: `${Math.round(conExp / total * 100)}% de tus postulantes tiene experiencia en call center. Los perfiles con experiencia suelen retener mejor en OJT.`,
    })
  }

  if (retentionRate < 70) {
    stories.push({
      type: 'warning',
      title: 'Calidad de selección',
      body: `Tu retención (${retentionRate}%) está bajo el umbral del 70%. Revisa filtros de edad, disponibilidad horaria y expectativa salarial en la entrevista inicial.`,
    })
  }

  if (weeklyCount >= 15) {
    stories.push({
      type: 'success',
      title: 'Meta semanal cumplida',
      body: '¡Felicidades! Superaste la meta de 15 registros semanales. Mantén la calidad para no sacrificar retención.',
    })
  }

  return stories
}

export function buildAdminNarrative(metrics, alerts) {
  return [
    {
      type: 'info',
      title: 'Control operativo',
      body: `Administras ${metrics.total} registros activos en ${metrics.totalGrupos} grupos. Conversión global a OP: ${metrics.conversionRate}%.`,
    },
    ...alerts.slice(0, 3).map(a => ({
      type: a.type,
      title: 'Alerta operativa',
      body: a.msg,
    })),
  ]
}

/**
 * Extrae y normaliza un periodo estrictamente al año 2026 (formato YYYYMM, ej. 202607).
 * Rechaza meses inválidos como 00 o >12.
 */
export function normalize2026Period(val) {
  if (!val) return null
  const s = String(val).trim()
  if (!s || s === '-' || s === 'NULL' || s === 'undefined') return null

  let res = null
  // 1. Coincidencia directa con 2026 seguido de 1 o 2 dígitos de mes (ej. 202607, 2026-07, 2026/7, 2026_08)
  const m = s.match(/2026[-_/]?(\d{1,2})/)
  if (m) {
    const month = m[1].padStart(2, '0')
    res = `2026${month}`
  } else {
    // 2. Si contiene 2026 con más dígitos (ej. 2026005, 2026012)
    const mSeq = s.match(/2026(\d{2,4})/)
    if (mSeq) {
      const digits = mSeq[1]
      const subMonth = digits.substring(0, 2)
      res = `2026${subMonth}`
    } else {
      const digitsOnly = s.replace(/\D/g, '')
      if (digitsOnly.startsWith('2026')) {
        if (digitsOnly.length >= 6) res = digitsOnly.substring(0, 6)
      } else if (s.includes('2026') || s.includes('/26')) {
        if (s.includes('-')) {
          const parts = s.split('-')
          if (parts[0] === '2026' && parts[1]) {
            res = `2026${parts[1].padStart(2, '0')}`
          }
        } else if (s.includes('/')) {
          const parts = s.split('/')
          if (parts.length === 3 && (parts[2].includes('2026') || parts[2].trim() === '26')) {
            res = `2026${parts[1].padStart(2, '0')}`
          }
        }
      }
    }
  }

  if (res && res.startsWith('2026')) {
    const mNum = parseInt(res.substring(4, 6), 10)
    if (mNum >= 1 && mNum <= 12) {
      return res
    }
  }
  return null
}

/**
 * Genera la matriz "Resumen mensual de capacitación en relación a grupo"
 * Limitado estrictamente al año 2026 y deduplicado por DNI/Documento único.
 */
export function buildResumenMensualCapacitacion(
  postulantes = [],
  asistencias = [],
  campanasMetas = [],
  indexes = null
) {
  // Indexación estricta de I-OP por grupo y por documento
  const groupDocOpSet = new Set()
  const docOpSet = new Set()

  for (let i = 0; i < asistencias.length; i++) {
    const a = asistencias[i]
    const doc = a.postulante_documento || a.documento
    if (!doc) continue
    const cleanDoc = String(doc).trim().toUpperCase()
    const sigla = String(a.sigla_asistencia || a.sigla || '').trim().toUpperCase()

    if (sigla === 'I-OP') {
      docOpSet.add(cleanDoc)
      if (a.grupo_codigo || a.grupo) {
        const gCode = normalizeGroupCodeExact(a.grupo_codigo || a.grupo)
        groupDocOpSet.add(`${gCode}__${cleanDoc}`)
        const base = gCode.replace(/_\d+$/, '')
        groupDocOpSet.add(`${base}__${cleanDoc}`)
      }
    }
  }

  const docAttendanceByDate = indexes?.docAttendanceByDate || new Map()

  // 1. Mapeo de grupos a periodos 2026
  const groupPeriodMap = new Map()
  for (const g of campanasMetas) {
    const code = g.grupo_codigo || g.codigo
    const per = normalize2026Period(g.periodo || g.codigo || g.grupo_codigo)
    if (code && per) {
      groupPeriodMap.set(code, per)
      groupPeriodMap.set(normalizeGroupCodeExact(code), per)
      const base = String(code).replace(/_\d+$/, '')
      if (!groupPeriodMap.has(base)) groupPeriodMap.set(base, per)
    }
  }

  // 2. Acumuladores por Periodo con Sets de Documentos Únicos
  const periodMap = new Map()
  const totalNominaDocs = new Set()
  const totalDia0Docs = new Set()
  const totalDia1Docs = new Set()
  const totalIngresosDocs = new Set()

  const getOrCreatePeriod = (per) => {
    if (!periodMap.has(per)) {
      periodMap.set(per, {
        periodo: per,
        nominaDocs: new Set(),
        dia0Docs: new Set(),
        dia1Docs: new Set(),
        ingresosDocs: new Set(),
        metaRqDia1: 0,
        metaRqOp: 0,
      })
    }
    return periodMap.get(per)
  }

  // A. Sumar Metas RQ desde campanasMetas (solo 2026)
  for (const g of campanasMetas) {
    const rawPer = normalize2026Period(g.periodo || g.codigo || g.grupo_codigo)
    if (!rawPer || !rawPer.startsWith('2026')) continue
    const row = getOrCreatePeriod(rawPer)
    const rq = Number(g.rq_solicitado) || 0
    const cupos = Number(g.cupos || g.meta_apertura) || rq
    row.metaRqOp += rq
    row.metaRqDia1 += (cupos > 0 ? cupos : rq)
  }

  // B. Procesar Postulantes deduplicando estrictamente por documento único en periodo 2026
  for (let i = 0; i < postulantes.length; i++) {
    const p = postulantes[i]
    const rawDoc = p.documento || p.numero_documento || p.postulante_documento || p.id
    if (!rawDoc) continue
    const doc = String(rawDoc).trim().toUpperCase()

    let rawPer = normalize2026Period(p.periodo_reclutado || p.periodo)
    if (!rawPer && p.grupo_codigo) {
      rawPer = groupPeriodMap.get(p.grupo_codigo) || groupPeriodMap.get(normalizeGroupCodeExact(p.grupo_codigo)) || normalize2026Period(p.grupo_codigo)
    }
    if (!rawPer) {
      const dRaw = p.fecha_registro || p.marca_temporal || p.created_at
      if (dRaw) rawPer = normalize2026Period(dRaw)
    }

    // Filtrar estrictamente solo año 2026
    if (!rawPer || !rawPer.startsWith('2026')) continue

    const row = getOrCreatePeriod(rawPer)
    
    // 1. Nómina Única
    row.nominaDocs.add(doc)
    totalNominaDocs.add(doc)

    const docDates = docAttendanceByDate.get(doc)

    // 2. Día 0 Único (asistencia o evaluación aprobada)
    const isDia0 = 
      p.dia_0 === 'ASISTIO' || 
      p.dia_0 === 'SI' || 
      p.dia_0 === 'OK' || 
      p.evaluacion_dia_0 === 'APROBADO' || 
      isDone(p.dia_0_obs) ||
      (p.dia_0 && !String(p.dia_0).toUpperCase().includes('FALTA') && !String(p.dia_0).toUpperCase().includes('NO'))

    if (isDia0) {
      row.dia0Docs.add(doc)
      totalDia0Docs.add(doc)
    }

    // 3. Día 1 Único (asistencia a día 1 de capacitación formal)
    const isDia1 = 
      p.dia_1 === 'ASISTIO' || 
      p.dia_1 === 'SI' || 
      p.dia_1 === 'OK' || 
      (docDates && docDates.size > 0) ||
      (p.dia_1 && !String(p.dia_1).toUpperCase().includes('FALTA') && !String(p.dia_1).toUpperCase().includes('NO'))

    if (isDia1) {
      row.dia1Docs.add(doc)
      totalDia1Docs.add(doc)
    }

    // 4. Ingresos Únicos (Pase a Operación Canónico)
    // Requiere haber iniciado Día 1, no ser baja D1, y tener I-OP confirmado en asistencias del grupo
    const gCode = normalizeGroupCodeExact(p.grupo_codigo)
    const baseG = gCode.replace(/_\d+$/, '')
    const hasGroupIop = groupDocOpSet.has(`${gCode}__${doc}`) || (baseG && groupDocOpSet.has(`${baseG}__${doc}`))
    const hasDirectIop = String(p.sigla || p.sigla_asistencia || '').trim().toUpperCase() === 'I-OP'
    const isBajaD1 = isBajaDia1(p.dia_1_obs || p.motivo_baja, p.sigla || p.status_dia_1, p)
    const isBajaCap = isBajaCapacitacion(p)

    const isOp = isDia1 && !isBajaD1 && (hasGroupIop || hasDirectIop || (docOpSet.has(doc) && !isBajaCap))

    if (isOp) {
      row.ingresosDocs.add(doc)
      totalIngresosDocs.add(doc)
    }
  }

  // 3. Formatear y calcular indicadores para cada periodo con conteos únicos (solo periodos 2026 con actividad real)
  const periodEntries = Array.from(periodMap.values())
    .map(p => ({
      periodo: p.periodo,
      nomina: p.nominaDocs.size,
      dia0: p.dia0Docs.size,
      dia1: p.dia1Docs.size,
      ingresos: p.ingresosDocs.size,
      metaRqDia1: p.metaRqDia1,
      metaRqOp: p.metaRqOp,
    }))
    .filter(p => p.periodo.startsWith('2026') && (p.nomina > 0 || p.dia1 > 0 || p.ingresos > 0))
    .sort((a, b) => a.periodo.localeCompare(b.periodo))

  const calculateIndicators = (data) => {
    const { nomina, dia0, dia1, ingresos, metaRqDia1, metaRqOp } = data
    
    // Indicador 1: % Deserción Nómina = (Nomina - Dia0) / Nomina
    const pctDesercionNomina = nomina > 0 
      ? Math.max(0, Math.min(100, Math.round(((nomina - dia0) / nomina) * 10000) / 100))
      : 0

    // Indicador 2: % Deserción Día 0 = (Dia0 - Dia1) / Dia0
    const pctDesercionDia0 = dia0 > 0 
      ? Math.max(0, Math.min(100, Math.round(((dia0 - dia1) / dia0) * 10000) / 100))
      : 0

    // Indicador 3: % Deserción Global (Ingresos vs Nomina) = (Nomina - Ingresos) / Nomina
    const pctDesercionGlobal = nomina > 0 
      ? Math.max(0, Math.min(100, Math.round(((nomina - ingresos) / nomina) * 10000) / 100))
      : 0

    // Indicador 4: % Deserción (D1 vs Ingresos) = (Dia1 - Ingresos) / Dia1
    const pctDesercionD1VsIngresos = dia1 > 0 
      ? Math.max(0, Math.min(100, Math.round(((dia1 - ingresos) / dia1) * 10000) / 100))
      : 0

    // Indicador 5: % Cumplimiento Día 1 = Dia1 / Meta RQ Dia1
    const targetRqDia1 = metaRqDia1 > 0 ? metaRqDia1 : nomina
    const pctCumplimientoDia1 = targetRqDia1 > 0 
      ? Math.round((dia1 / targetRqDia1) * 10000) / 100
      : 0

    // Indicador 6: % Dotación = Ingresos / Meta RQ Op
    const targetRqOp = metaRqOp > 0 ? metaRqOp : (dia1 > 0 ? dia1 : nomina)
    const pctDotacion = targetRqOp > 0 
      ? Math.round((ingresos / targetRqOp) * 10000) / 100
      : 0

    return {
      pctDesercionNomina,
      pctDesercionDia0,
      pctDesercionGlobal,
      pctDesercionD1VsIngresos,
      pctCumplimientoDia1,
      pctDotacion,
    }
  }

  const columns = periodEntries.map(p => ({
    ...p,
    indicators: calculateIndicators(p)
  }))

  // 4. Columna de Total Consolidado Único
  const totalSummary = {
    periodo: 'Total',
    nomina: totalNominaDocs.size,
    dia0: totalDia0Docs.size,
    dia1: totalDia1Docs.size,
    ingresos: totalIngresosDocs.size,
    metaRqDia1: periodEntries.reduce((acc, p) => acc + p.metaRqDia1, 0),
    metaRqOp: periodEntries.reduce((acc, p) => acc + p.metaRqOp, 0),
  }
  totalSummary.indicators = calculateIndicators(totalSummary)

  return {
    columns,
    totalSummary
  }
}

/**
 * Motor analítico de series temporales multi-indicador para el Evolutivo de Dashboard.
 * Genera 3 modos de análisis:
 *  1. Flujo Diario (Reclutados, Asistencia D1, Pases OP)
 *  2. Metas RQ por Cohorte/Semana 2026 (Meta RQ OP, Meta Apertura D1, Ingresos Reales OP, Brecha)
 *  3. Tasas y Deserción por Cohorte/Semana 2026 (% Conversión OP, % Deserción Temprana, % Cumplimiento D1, % Dotación)
 */
export function buildMultiEvolutivoData(
  postulantes = [],
  asistencias = [],
  campanasMetas = [],
  indexes = null,
  options = { daysRange: 30, weeksRange: 'ALL' }
) {
  const opDocs = indexes?.opDocsSet || new Set(
    asistencias.filter(a => a.sigla_asistencia === 'I-OP').map(a => a.postulante_documento || a.documento)
  )
  const docAttendanceByDate = indexes?.docAttendanceByDate || new Map()

  // ─────────────────────────────────────────────
  // MODO 1: Flujo Diario (Últimos X Días)
  // ─────────────────────────────────────────────
  const days = Number(options?.daysRange) || 30
  const dateMap = new Map()
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(today.getDate() - i)
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    const isoDate = `${yyyy}-${mm}-${dd}`
    const label = `${dd}/${mm}`

    dateMap.set(isoDate, {
      fecha: isoDate,
      label,
      reclutados: 0,
      asistenciaD1: 0,
      conversionesOP: 0,
      _recDocs: new Set(),
      _d1Docs: new Set(),
      _opDocs: new Set(),
    })
  }

  // 1.1 Contar Reclutados por día (único por DNI)
  for (let i = 0; i < postulantes.length; i++) {
    const p = postulantes[i]
    const doc = p.documento ? String(p.documento).trim().toUpperCase() : null
    const dateRaw = p.fecha_registro || p.marca_temporal || p.created_at
    const dateKey = parseDateIso(dateRaw)
    if (dateKey && dateMap.has(dateKey)) {
      const entry = dateMap.get(dateKey)
      if (!doc || !entry._recDocs.has(doc)) {
        if (doc) entry._recDocs.add(doc)
        entry.reclutados++
      }
    }
  }

  // 1.2 Contar Asistencias Día 1 e Ingresos OP por fecha de evento
  for (let i = 0; i < asistencias.length; i++) {
    const a = asistencias[i]
    const doc = a.postulante_documento || a.documento
    if (!doc) continue
    const cleanDoc = String(doc).trim().toUpperCase()
    const dateKey = parseDateIso(a.fecha_asistencia || a.fecha_registro_asistencia)
    if (!dateKey || !dateMap.has(dateKey)) continue
    const entry = dateMap.get(dateKey)

    if (a.sigla_asistencia === 'I-OP') {
      if (!entry._opDocs.has(cleanDoc)) {
        entry._opDocs.add(cleanDoc)
        entry.conversionesOP++
      }
    } else if (ATTENDANCE_PRESENT.includes(a.sigla_asistencia) || a.sigla_asistencia === 'A') {
      if (!entry._d1Docs.has(cleanDoc)) {
        entry._d1Docs.add(cleanDoc)
        entry.asistenciaD1++
      }
    }
  }

  const flujoDiarioData = Array.from(dateMap.values()).map(d => ({
    fecha: d.fecha,
    label: d.label,
    reclutados: d.reclutados,
    asistenciaD1: d.asistenciaD1,
    conversionesOP: d.conversionesOP,
  }))

  const flujoTotals = {
    reclutados: flujoDiarioData.reduce((acc, d) => acc + d.reclutados, 0),
    asistenciaD1: flujoDiarioData.reduce((acc, d) => acc + d.asistenciaD1, 0),
    conversionesOP: flujoDiarioData.reduce((acc, d) => acc + d.conversionesOP, 0),
  }

  // ─────────────────────────────────────────────
  // MODO 2 & 3: Análisis por Cohorte / Semana 2026
  // ─────────────────────────────────────────────
  const weekMap = new Map()

  const getWeekKey = (semVal, perVal, gCode) => {
    let sNum = parseSemanaNum(semVal)
    if (sNum === null && gCode) {
      const m = String(gCode).match(/S(\d{1,2})/i) || String(gCode).match(/_(\d{1,2})$/)
      if (m) sNum = parseInt(m[1], 10)
    }
    if (sNum !== null && sNum >= 1 && sNum <= 53) {
      return { key: `S${String(sNum).padStart(2, '0')}`, num: sNum }
    }
    const perNorm = normalize2026Period(perVal || gCode)
    if (perNorm) {
      return { key: perNorm, num: parseInt(perNorm, 10) }
    }
    return null
  }

  const getOrCreateWeek = (wObj) => {
    if (!weekMap.has(wObj.key)) {
      weekMap.set(wObj.key, {
        key: wObj.key,
        label: wObj.key.startsWith('S') ? `Semana ${parseInt(wObj.key.substring(1), 10)}` : `Cohorte ${wObj.key}`,
        num: wObj.num,
        metaRqOp: 0,
        metaAperturaD1: 0,
        nominaDocs: new Set(),
        dia0Docs: new Set(),
        dia1Docs: new Set(),
        ingresosDocs: new Set(),
        bajasDia0Docs: new Set(),
        bajasCapacitacionDocs: new Set(),
      })
    }
    return weekMap.get(wObj.key)
  }

  // A. Metas RQ y Meta Apertura D1 de capacidad_rys
  for (let i = 0; i < campanasMetas.length; i++) {
    const g = campanasMetas[i]
    const wObj = getWeekKey(g.semana_trabajo || g.semana_label || g.semana, g.periodo, g.grupo_codigo || g.codigo)
    if (!wObj) continue
    const row = getOrCreateWeek(wObj)
    const rq = Number(g.rq_solicitado) || 0
    const cupos = Number(g.cupos || g.meta_apertura) || rq
    row.metaRqOp += rq
    row.metaAperturaD1 += (cupos > 0 ? cupos : rq)
  }

  // B. Postulantes evaluados fila por fila a nivel individual dentro de su cohorte
  for (let i = 0; i < postulantes.length; i++) {
    const p = postulantes[i]
    const rawDoc = p.documento || p.numero_documento || p.postulante_documento || p.id
    if (!rawDoc) continue
    const doc = String(rawDoc).trim().toUpperCase()

    const wObj = getWeekKey(p.semana_trabajo || p.semana, p.periodo_reclutado || p.periodo, p.grupo_codigo)
    if (!wObj) continue
    const row = getOrCreateWeek(wObj)

    row.nominaDocs.add(doc)

    const isDia0 = 
      p.dia_0 === 'ASISTIO' || 
      p.dia_0 === 'SI' || 
      p.dia_0 === 'OK' || 
      p.evaluacion_dia_0 === 'APROBADO' || 
      isDone(p.dia_0_obs) ||
      (p.dia_0 && !String(p.dia_0).toUpperCase().includes('FALTA') && !String(p.dia_0).toUpperCase().includes('NO'))

    if (isDia0) {
      row.dia0Docs.add(doc)
    }

    const docDates = docAttendanceByDate.get(doc)
    const isDia1 = 
      p.dia_1 === 'ASISTIO' || 
      p.dia_1 === 'SI' || 
      p.dia_1 === 'OK' || 
      (docDates && docDates.size > 0) ||
      (p.dia_1 && !String(p.dia_1).toUpperCase().includes('FALTA') && !String(p.dia_1).toUpperCase().includes('NO'))

    if (isDia1) {
      row.dia1Docs.add(doc)
    }

    // Auditoría individual de bajas usando funciones centralizadas
    if (isBajaDia1(p.dia_1_obs || p.motivo_baja, p.sigla || p.status_dia_1, p)) {
      row.bajasDia0Docs.add(doc)
    } else if (isBajaCapacitacion(p)) {
      row.bajasCapacitacionDocs.add(doc)
    }

    const isOp = Boolean(
      opDocs.has(doc) || 
      p.estado === 'EN_OPERACION' || 
      p.fecha_conexion_op ||
      p.estado_final === 'EN_OPERACION'
    )

    if (isOp) {
      row.ingresosDocs.add(doc)
    }
  }

  // C. Filtrar y ordenar cohortes (solo semanas con postulantes o pases reales)
  let cohortEntries = Array.from(weekMap.values())
    .filter(w => w.nominaDocs.size > 0 || w.dia1Docs.size > 0 || w.ingresosDocs.size > 0)
    .sort((a, b) => a.num - b.num)

  if (options?.weeksRange && options.weeksRange !== 'ALL') {
    const limit = parseInt(options.weeksRange, 10)
    if (!isNaN(limit) && limit > 0) {
      cohortEntries = cohortEntries.slice(-limit)
    }
  }

  // Serie Modo 2: RQ vs Real
  const metasRqData = cohortEntries.map(w => {
    const nomina = w.nominaDocs.size
    const dia1 = w.dia1Docs.size
    const ingresos = w.ingresosDocs.size
    const metaRq = w.metaRqOp
    const metaD1 = w.metaAperturaD1

    return {
      key: w.key,
      label: w.label,
      metaRqOp: metaRq,
      metaAperturaD1: metaD1,
      dia1Real: dia1,
      ingresosReal: ingresos,
      brechaOP: ingresos - metaRq,
      pctCumplimientoRq: metaRq > 0 ? Math.min(100, Math.round((ingresos / metaRq) * 100)) : 0,
      pctCumplimientoD1: metaD1 > 0 ? Math.min(100, Math.round((dia1 / metaD1) * 100)) : 0,
    }
  })

  const metasTotals = {
    totalMetaRqOp: metasRqData.reduce((acc, d) => acc + d.metaRqOp, 0),
    totalMetaAperturaD1: metasRqData.reduce((acc, d) => acc + d.metaAperturaD1, 0),
    totalIngresosReal: metasRqData.reduce((acc, d) => acc + d.ingresosReal, 0),
    totalDia1Real: metasRqData.reduce((acc, d) => acc + d.dia1Real, 0),
    brechaGlobalOP: metasRqData.reduce((acc, d) => acc + d.ingresosReal, 0) - metasRqData.reduce((acc, d) => acc + d.metaRqOp, 0),
  }

  // Serie Modo 3: % Tasas y Deserción
  const tasasData = cohortEntries.map(w => {
    const nomina = w.nominaDocs.size
    const dia1 = w.dia1Docs.size
    const ingresos = w.ingresosDocs.size
    const metaRq = w.metaRqOp
    const metaD1 = w.metaAperturaD1

    const pctConversionOP = nomina > 0 ? Math.min(100, Math.round((ingresos / nomina) * 1000) / 10) : 0
    const pctDesercionTemprana = nomina > 0 ? Math.min(100, Math.max(0, Math.round(((nomina - dia1) / nomina) * 1000) / 10)) : 0
    const pctCumplimientoD1 = metaD1 > 0 ? Math.min(100, Math.round((dia1 / metaD1) * 1000) / 10) : (nomina > 0 ? Math.min(100, Math.round((dia1 / nomina) * 1000) / 10) : 0)
    const pctDotacion = metaRq > 0 ? Math.min(100, Math.round((ingresos / metaRq) * 1000) / 10) : 0

    return {
      key: w.key,
      label: w.label,
      pctConversionOP,
      pctDesercionTemprana,
      pctCumplimientoD1,
      pctDotacion,
      nomina,
      dia1,
      ingresos,
      metaRq,
      metaD1,
    }
  })

  const tasasTotals = {
    avgConversionOP: tasasData.length > 0 
      ? Math.round((tasasData.reduce((acc, d) => acc + d.pctConversionOP, 0) / tasasData.length) * 10) / 10 
      : 0,
    avgDesercionTemprana: tasasData.length > 0 
      ? Math.round((tasasData.reduce((acc, d) => acc + d.pctDesercionTemprana, 0) / tasasData.length) * 10) / 10 
      : 0,
    avgCumplimientoD1: tasasData.length > 0 
      ? Math.round((tasasData.reduce((acc, d) => acc + d.pctCumplimientoD1, 0) / tasasData.length) * 10) / 10 
      : 0,
    avgDotacion: tasasData.length > 0 
      ? Math.round((tasasData.reduce((acc, d) => acc + d.pctDotacion, 0) / tasasData.length) * 10) / 10 
      : 0,
  }

  return {
    flujoDiarioData,
    flujoTotals,
    metasRqData,
    metasTotals,
    tasasData,
    tasasTotals,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. MOTOR DE DATOS: GRÁFICO PERSONALIZADO MULTI-INDICADOR (ENTERPRISE BI)
// ─────────────────────────────────────────────────────────────────────────────

export const KPI_CATALOG = {
  // --- VOLÚMENES Y DOTACIÓN (CONTEOS) ---
  NOMINA: {
    id: 'NOMINA',
    label: 'Postulantes Nómina',
    category: 'VOLUMEN',
    type: 'count',
    hasMeta: false,
    allowedGranularities: ['PERIODO', 'SEMANA', 'DIARIO'],
    color: '#8b5cf6',
  },
  DIA_0: {
    id: 'DIA_0',
    label: 'Asistencia Día 0',
    category: 'VOLUMEN',
    type: 'count',
    hasMeta: true,
    metaKey: 'metaDia0',
    metaLabel: 'Meta Día 0',
    allowedGranularities: ['PERIODO', 'SEMANA', 'DIARIO'],
    color: '#3b82f6',
  },
  DIA_1: {
    id: 'DIA_1',
    label: 'Asistencia Día 1 (Aula)',
    category: 'VOLUMEN',
    type: 'count',
    hasMeta: true,
    metaKey: 'metaAperturaD1',
    metaLabel: 'Meta Apertura D1',
    allowedGranularities: ['PERIODO', 'SEMANA', 'DIARIO'],
    color: '#06b6d4',
  },
  INGRESOS_OP: {
    id: 'INGRESOS_OP',
    label: 'Ingresos Reales OP (I-OP)',
    category: 'VOLUMEN',
    type: 'count',
    hasMeta: true,
    metaKey: 'metaRqOp',
    metaLabel: 'Meta RQ OP',
    allowedGranularities: ['PERIODO', 'SEMANA', 'DIARIO'],
    color: '#10b981',
  },
  META_RQ_OP: {
    id: 'META_RQ_OP',
    label: 'Meta Requerida OP (RQ)',
    category: 'VOLUMEN',
    type: 'count',
    hasMeta: false,
    allowedGranularities: ['PERIODO', 'SEMANA'],
    color: '#f59e0b',
  },
  META_APERTURA_D1: {
    id: 'META_APERTURA_D1',
    label: 'Meta Apertura Día 1',
    category: 'VOLUMEN',
    type: 'count',
    hasMeta: false,
    allowedGranularities: ['PERIODO', 'SEMANA'],
    color: '#6366f1',
  },
  COMPARATIVO_OP: {
    id: 'COMPARATIVO_OP',
    label: 'Ingresos OP vs. Meta RQ',
    category: 'VOLUMEN',
    type: 'composed',
    hasMeta: true,
    metaKey: 'metaRqOp',
    metaLabel: 'Meta RQ OP',
    allowedGranularities: ['PERIODO', 'SEMANA'],
    color: '#10b981',
    metaColor: '#f59e0b',
  },

  // --- TASAS Y DESERCIÓN (%) ---
  PCT_DESERCION_NOMINA: {
    id: 'PCT_DESERCION_NOMINA',
    label: '% Deserción Nómina (D0 vs Nómina)',
    category: 'TASAS',
    type: 'percent',
    hasMeta: false,
    allowedGranularities: ['PERIODO', 'SEMANA'],
    color: '#ec4899',
  },
  PCT_DESERCION_DIA_0: {
    id: 'PCT_DESERCION_DIA_0',
    label: '% Deserción Día 0 (D1 vs D0)',
    category: 'TASAS',
    type: 'percent',
    hasMeta: false,
    allowedGranularities: ['PERIODO', 'SEMANA'],
    color: '#f43f5e',
  },
  PCT_DESERCION_GLOBAL: {
    id: 'PCT_DESERCION_GLOBAL',
    label: '% Deserción Global (Nómina a OP)',
    category: 'TASAS',
    type: 'percent',
    hasMeta: false,
    allowedGranularities: ['PERIODO', 'SEMANA'],
    color: '#ef4444',
  },
  PCT_DESERCION_CAP: {
    id: 'PCT_DESERCION_CAP',
    label: '% Deserción Capacitación (D1 a OP)',
    category: 'TASAS',
    type: 'percent',
    hasMeta: false,
    allowedGranularities: ['PERIODO', 'SEMANA'],
    color: '#e11d48',
  },
  PCT_CUMPLIMIENTO_D1: {
    id: 'PCT_CUMPLIMIENTO_D1',
    label: '% Cumplimiento Día 1 (Real vs Meta D1)',
    category: 'TASAS',
    type: 'percent',
    hasMeta: false,
    allowedGranularities: ['PERIODO', 'SEMANA'],
    color: '#818cf8',
  },
  PCT_DOTACION_OP: {
    id: 'PCT_DOTACION_OP',
    label: '% Dotación Operativa (Real vs RQ OP)',
    category: 'TASAS',
    type: 'percent',
    hasMeta: false,
    allowedGranularities: ['PERIODO', 'SEMANA'],
    color: '#10b981',
  },
}

/**
 * Motor centralizado para Gráfico Personalizado BI
 * Opera 100% en memoria con deduplicación por DNI y orden cronológico natural.
 */
export function buildGraficoPersonalizadoData(
  postulantes = [],
  asistencias = [],
  campanasMetas = [],
  indexes = null,
  options = {}
) {
  const {
    kpiId = 'INGRESOS_OP',
    granularity = 'PERIODO', // 'PERIODO' | 'SEMANA' | 'DIARIO'
    days = 30,
  } = options

  const kpiConfig = KPI_CATALOG[kpiId] || KPI_CATALOG.INGRESOS_OP
  const effectiveGranularity = kpiConfig.allowedGranularities.includes(granularity)
    ? granularity
    : kpiConfig.allowedGranularities[0]

  // Indexación estricta de I-OP por grupo y por documento
  const groupDocOpSet = new Set()
  const docOpSet = new Set()

  for (let i = 0; i < asistencias.length; i++) {
    const a = asistencias[i]
    const doc = a.postulante_documento || a.documento
    if (!doc) continue
    const cleanDoc = String(doc).trim().toUpperCase()
    const sigla = String(a.sigla_asistencia || a.sigla || '').trim().toUpperCase()

    if (sigla === 'I-OP') {
      docOpSet.add(cleanDoc)
      if (a.grupo_codigo || a.grupo) {
        const gCode = normalizeGroupCodeExact(a.grupo_codigo || a.grupo)
        groupDocOpSet.add(`${gCode}__${cleanDoc}`)
        const base = gCode.replace(/_\d+$/, '')
        groupDocOpSet.add(`${base}__${cleanDoc}`)
      }
    }
  }

  const docAttendanceByDate = indexes?.docAttendanceByDate || new Map()

  // ─────────────────────────────────────────────────────────────
  // A. MODO: PERIODO (Cohortes 2026)
  // ─────────────────────────────────────────────────────────────
  if (effectiveGranularity === 'PERIODO') {
    const groupPeriodMap = new Map()
    for (const g of campanasMetas) {
      const code = g.grupo_codigo || g.codigo
      const per = normalize2026Period(g.periodo || g.codigo || g.grupo_codigo)
      if (code && per) {
        groupPeriodMap.set(code, per)
        groupPeriodMap.set(normalizeGroupCodeExact(code), per)
        const base = String(code).replace(/_\d+$/, '')
        if (!groupPeriodMap.has(base)) groupPeriodMap.set(base, per)
      }
    }

    const periodMap = new Map()
    const getOrCreatePeriod = (per) => {
      if (!periodMap.has(per)) {
        periodMap.set(per, {
          key: per,
          label: per,
          periodo: per,
          nominaDocs: new Set(),
          dia0Docs: new Set(),
          dia1Docs: new Set(),
          ingresosDocs: new Set(),
          bajasDia1Docs: new Set(),
          bajasCapacitacionDocs: new Set(),
          metaRqOp: 0,
          metaAperturaD1: 0,
          metaDia0: 0,
        })
      }
      return periodMap.get(per)
    }

    // Metas
    for (const g of campanasMetas) {
      const rawPer = normalize2026Period(g.periodo || g.codigo || g.grupo_codigo)
      if (!rawPer || !rawPer.startsWith('2026')) continue
      const row = getOrCreatePeriod(rawPer)
      const rq = Number(g.rq_solicitado) || 0
      const cupos = Number(g.cupos || g.meta_apertura || g.meta_dia_1) || rq
      const d0 = Number(g.meta_dia_0) || cupos
      row.metaRqOp += rq
      row.metaAperturaD1 += (cupos > 0 ? cupos : rq)
      row.metaDia0 += d0
    }

    // Postulantes evaluados fila por fila con reglas canónicas
    for (let i = 0; i < postulantes.length; i++) {
      const p = postulantes[i]
      const rawDoc = p.documento || p.numero_documento || p.postulante_documento || p.id
      if (!rawDoc) continue
      const doc = String(rawDoc).trim().toUpperCase()

      let rawPer = normalize2026Period(p.periodo_reclutado || p.periodo)
      if (!rawPer && p.grupo_codigo) {
        rawPer = groupPeriodMap.get(p.grupo_codigo) || groupPeriodMap.get(normalizeGroupCodeExact(p.grupo_codigo)) || normalize2026Period(p.grupo_codigo)
      }
      if (!rawPer || !rawPer.startsWith('2026')) continue

      const row = getOrCreatePeriod(rawPer)
      row.nominaDocs.add(doc)

      const isDia0 = 
        p.dia_0 === 'ASISTIO' || p.dia_0 === 'SI' || p.dia_0 === 'OK' || 
        p.evaluacion_dia_0 === 'APROBADO' || isDone(p.dia_0_obs) ||
        (p.dia_0 && !String(p.dia_0).toUpperCase().includes('FALTA') && !String(p.dia_0).toUpperCase().includes('NO'))

      if (isDia0) row.dia0Docs.add(doc)

      const docDates = docAttendanceByDate.get(doc)
      const isDia1 = 
        p.dia_1 === 'ASISTIO' || p.dia_1 === 'SI' || p.dia_1 === 'OK' || 
        (docDates && docDates.size > 0) ||
        (p.dia_1 && !String(p.dia_1).toUpperCase().includes('FALTA') && !String(p.dia_1).toUpperCase().includes('NO'))

      if (isDia1) row.dia1Docs.add(doc)

      // Deserción fila por fila
      const isBajaD1 = isBajaDia1(p.dia_1_obs || p.motivo_baja, p.sigla || p.status_dia_1, p)
      const isBajaCap = isBajaCapacitacion(p)
      if (isBajaD1) {
        row.bajasDia1Docs.add(doc)
      } else if (isBajaCap) {
        row.bajasCapacitacionDocs.add(doc)
      }

      // Ingreso a Operación Canónico
      const gCode = normalizeGroupCodeExact(p.grupo_codigo)
      const baseG = gCode.replace(/_\d+$/, '')
      const hasGroupIop = groupDocOpSet.has(`${gCode}__${doc}`) || (baseG && groupDocOpSet.has(`${baseG}__${doc}`))
      const hasDirectIop = String(p.sigla || p.sigla_asistencia || '').trim().toUpperCase() === 'I-OP'

      const isOp = isDia1 && !isBajaD1 && (hasGroupIop || hasDirectIop || (docOpSet.has(doc) && !isBajaCap))

      if (isOp) {
        row.ingresosDocs.add(doc)
      }
    }

    const periodsSorted = Array.from(periodMap.values())
      .filter(p => p.nominaDocs.size > 0 || p.metaRqOp > 0)
      .sort((a, b) => a.periodo.localeCompare(b.periodo))

    const lastPeriodKey = periodsSorted.length > 0 ? periodsSorted[periodsSorted.length - 1].key : null

    const data = periodsSorted.map((p) => {
      const isProjection = p.key === lastPeriodKey
      const nomina = p.nominaDocs.size
      const dia0 = p.dia0Docs.size
      const dia1 = p.dia1Docs.size
      const ingresos = p.ingresosDocs.size
      const metaRq = p.metaRqOp
      const metaD1 = p.metaAperturaD1
      const metaDia0 = p.metaDia0

      let valor = 0
      let meta = null

      switch (kpiId) {
        case 'NOMINA':
          valor = nomina
          break
        case 'DIA_0':
          valor = dia0
          meta = metaDia0
          break
        case 'DIA_1':
          valor = dia1
          meta = metaD1
          break
        case 'INGRESOS_OP':
        case 'COMPARATIVO_OP':
          valor = ingresos
          meta = metaRq
          break
        case 'META_RQ_OP':
          valor = metaRq
          break
        case 'META_APERTURA_D1':
          valor = metaD1
          break
        case 'PCT_DESERCION_NOMINA':
          valor = nomina > 0 ? Math.round(((nomina - dia0) / nomina) * 1000) / 10 : 0
          break
        case 'PCT_DESERCION_DIA_0':
          valor = dia0 > 0 ? Math.round(((p.bajasDia1Docs.size) / dia0) * 1000) / 10 : (dia0 > 0 && dia1 <= dia0 ? Math.round(((dia0 - dia1) / dia0) * 1000) / 10 : 0)
          break
        case 'PCT_DESERCION_GLOBAL':
          valor = nomina > 0 ? Math.round(((nomina - ingresos) / nomina) * 1000) / 10 : 0
          break
        case 'PCT_DESERCION_CAP':
          valor = dia1 > 0 ? Math.round(((p.bajasCapacitacionDocs.size) / dia1) * 1000) / 10 : (dia1 > 0 && ingresos <= dia1 ? Math.round(((dia1 - ingresos) / dia1) * 1000) / 10 : 0)
          break
        case 'PCT_CUMPLIMIENTO_D1':
          valor = metaD1 > 0 ? Math.round((dia1 / metaD1) * 1000) / 10 : (nomina > 0 ? Math.round((dia1 / nomina) * 1000) / 10 : 0)
          break
        case 'PCT_DOTACION_OP':
          valor = metaRq > 0 ? Math.round((ingresos / metaRq) * 1000) / 10 : 0
          break
        default:
          valor = ingresos
      }

      return {
        key: p.key,
        label: p.label,
        valor,
        valorReal: isProjection ? null : valor,
        proyeccion: isProjection ? valor : null,
        meta,
        isProjection,
        nomina,
        dia0,
        dia1,
        ingresos,
        metaRq,
        metaD1,
      }
    })

    return {
      kpiConfig,
      granularity: effectiveGranularity,
      data,
      totalCount: data.reduce((acc, d) => acc + (d.valor || 0), 0),
      avgPercent: data.length > 0 ? Math.round((data.reduce((acc, d) => acc + (d.valor || 0), 0) / data.length) * 10) / 10 : 0,
    }
  }

  // ─────────────────────────────────────────────────────────────
  // B. MODO: SEMANA (Cohortes semanales ordenadas numéricamente)
  // ─────────────────────────────────────────────────────────────
  if (effectiveGranularity === 'SEMANA') {
    const weekMap = new Map()
    const getOrCreateWeek = (wObj) => {
      if (!weekMap.has(wObj.key)) {
        weekMap.set(wObj.key, {
          key: wObj.key,
          label: wObj.label,
          semanaNum: wObj.semanaNum,
          periodo: wObj.periodo,
          nominaDocs: new Set(),
          dia0Docs: new Set(),
          dia1Docs: new Set(),
          ingresosDocs: new Set(),
          bajasDia1Docs: new Set(),
          bajasCapacitacionDocs: new Set(),
          metaRqOp: 0,
          metaAperturaD1: 0,
          metaDia0: 0,
        })
      }
      return weekMap.get(wObj.key)
    }

    const getWeekKey = (semVal, perVal, grpVal) => {
      let sNum = parseSemanaNum(semVal)
      let per = normalize2026Period(perVal || grpVal)
      if (sNum == null && grpVal) {
        sNum = parseSemanaNum(grpVal)
      }
      if (sNum == null && per) {
        return { key: per, label: `Cohorte ${per}`, semanaNum: 999, periodo: per }
      }
      if (sNum == null) return null
      return { key: `SEM_${sNum}`, label: `Semana ${sNum}`, semanaNum: sNum, periodo: per || '2026' }
    }

    for (let i = 0; i < campanasMetas.length; i++) {
      const g = campanasMetas[i]
      const wObj = getWeekKey(g.semana_trabajo || g.semana_label || g.semana, g.periodo, g.grupo_codigo || g.codigo)
      if (!wObj) continue
      const row = getOrCreateWeek(wObj)
      const rq = Number(g.rq_solicitado) || 0
      const cupos = Number(g.cupos || g.meta_apertura || g.meta_dia_1) || rq
      const d0 = Number(g.meta_dia_0) || cupos
      row.metaRqOp += rq
      row.metaAperturaD1 += (cupos > 0 ? cupos : rq)
      row.metaDia0 += d0
    }

    for (let i = 0; i < postulantes.length; i++) {
      const p = postulantes[i]
      const rawDoc = p.documento || p.numero_documento || p.postulante_documento || p.id
      if (!rawDoc) continue
      const doc = String(rawDoc).trim().toUpperCase()

      const wObj = getWeekKey(p.semana_trabajo || p.semana, p.periodo_reclutado || p.periodo, p.grupo_codigo)
      if (!wObj) continue
      const row = getOrCreateWeek(wObj)

      row.nominaDocs.add(doc)

      const isDia0 = 
        p.dia_0 === 'ASISTIO' || p.dia_0 === 'SI' || p.dia_0 === 'OK' || 
        p.evaluacion_dia_0 === 'APROBADO' || isDone(p.dia_0_obs) ||
        (p.dia_0 && !String(p.dia_0).toUpperCase().includes('FALTA') && !String(p.dia_0).toUpperCase().includes('NO'))

      if (isDia0) row.dia0Docs.add(doc)

      const docDates = docAttendanceByDate.get(doc)
      const isDia1 = 
        p.dia_1 === 'ASISTIO' || p.dia_1 === 'SI' || p.dia_1 === 'OK' || 
        (docDates && docDates.size > 0) ||
        (p.dia_1 && !String(p.dia_1).toUpperCase().includes('FALTA') && !String(p.dia_1).toUpperCase().includes('NO'))

      if (isDia1) row.dia1Docs.add(doc)

      // Deserción fila por fila
      const isBajaD1 = isBajaDia1(p.dia_1_obs || p.motivo_baja, p.sigla || p.status_dia_1, p)
      const isBajaCap = isBajaCapacitacion(p)
      if (isBajaD1) {
        row.bajasDia1Docs.add(doc)
      } else if (isBajaCap) {
        row.bajasCapacitacionDocs.add(doc)
      }

      // Ingreso a Operación Canónico
      const gCode = normalizeGroupCodeExact(p.grupo_codigo)
      const baseG = gCode.replace(/_\d+$/, '')
      const hasGroupIop = groupDocOpSet.has(`${gCode}__${doc}`) || (baseG && groupDocOpSet.has(`${baseG}__${doc}`))
      const hasDirectIop = String(p.sigla || p.sigla_asistencia || '').trim().toUpperCase() === 'I-OP'

      const isOp = isDia1 && !isBajaD1 && (hasGroupIop || hasDirectIop || (docOpSet.has(doc) && !isBajaCap))

      if (isOp) {
        row.ingresosDocs.add(doc)
      }
    }

    // Orden cronológico natural usando parseSemanaNum
    const weeksSorted = Array.from(weekMap.values())
      .filter(w => w.nominaDocs.size > 0 || w.metaRqOp > 0)
      .sort((a, b) => a.semanaNum - b.semanaNum)

    const lastWeekKey = weeksSorted.length > 0 ? weeksSorted[weeksSorted.length - 1].key : null

    const data = weeksSorted.map((w) => {
      const isProjection = w.key === lastWeekKey
      const nomina = w.nominaDocs.size
      const dia0 = w.dia0Docs.size
      const dia1 = w.dia1Docs.size
      const ingresos = w.ingresosDocs.size
      const metaRq = w.metaRqOp
      const metaD1 = w.metaAperturaD1
      const metaDia0 = w.metaDia0

      let valor = 0
      let meta = null

      switch (kpiId) {
        case 'NOMINA':
          valor = nomina
          break
        case 'DIA_0':
          valor = dia0
          meta = metaDia0
          break
        case 'DIA_1':
          valor = dia1
          meta = metaD1
          break
        case 'INGRESOS_OP':
        case 'COMPARATIVO_OP':
          valor = ingresos
          meta = metaRq
          break
        case 'META_RQ_OP':
          valor = metaRq
          break
        case 'META_APERTURA_D1':
          valor = metaD1
          break
        case 'PCT_DESERCION_NOMINA':
          valor = nomina > 0 ? Math.round(((nomina - dia0) / nomina) * 1000) / 10 : 0
          break
        case 'PCT_DESERCION_DIA_0':
          valor = dia0 > 0 ? Math.round(((w.bajasDia1Docs.size) / dia0) * 1000) / 10 : (dia0 > 0 && dia1 <= dia0 ? Math.round(((dia0 - dia1) / dia0) * 1000) / 10 : 0)
          break
        case 'PCT_DESERCION_GLOBAL':
          valor = nomina > 0 ? Math.round(((nomina - ingresos) / nomina) * 1000) / 10 : 0
          break
        case 'PCT_DESERCION_CAP':
          valor = dia1 > 0 ? Math.round(((w.bajasCapacitacionDocs.size) / dia1) * 1000) / 10 : (dia1 > 0 && ingresos <= dia1 ? Math.round(((dia1 - ingresos) / dia1) * 1000) / 10 : 0)
          break
        case 'PCT_CUMPLIMIENTO_D1':
          valor = metaD1 > 0 ? Math.round((dia1 / metaD1) * 1000) / 10 : (nomina > 0 ? Math.round((dia1 / nomina) * 1000) / 10 : 0)
          break
        case 'PCT_DOTACION_OP':
          valor = metaRq > 0 ? Math.round((ingresos / metaRq) * 1000) / 10 : 0
          break
        default:
          valor = ingresos
      }

      return {
        key: w.key,
        label: w.label,
        valor,
        valorReal: isProjection ? null : valor,
        proyeccion: isProjection ? valor : null,
        meta,
        isProjection,
        nomina,
        dia0,
        dia1,
        ingresos,
        metaRq,
        metaD1,
      }
    })

    return {
      kpiConfig,
      granularity: effectiveGranularity,
      data,
      totalCount: data.reduce((acc, d) => acc + (d.valor || 0), 0),
      avgPercent: data.length > 0 ? Math.round((data.reduce((acc, d) => acc + (d.valor || 0), 0) / data.length) * 10) / 10 : 0,
    }
  }

  // ─────────────────────────────────────────────────────────────
  // C. MODO: DIARIO (Eventos calendario agrupados por fecha exacta)
  // ─────────────────────────────────────────────────────────────
  const dateMap = new Map()
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayIso = today.toISOString().split('T')[0]

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(today.getDate() - i)
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    const isoDate = `${yyyy}-${mm}-${dd}`
    const label = `${dd}/${mm}`

    dateMap.set(isoDate, {
      key: isoDate,
      fecha: isoDate,
      label,
      nominaDocs: new Set(),
      dia0Docs: new Set(),
      dia1Docs: new Set(),
      ingresosDocs: new Set(),
    })
  }

  // 1. Postulantes citados / inscritos por fecha
  for (let i = 0; i < postulantes.length; i++) {
    const p = postulantes[i]
    const doc = p.documento ? String(p.documento).trim().toUpperCase() : null
    if (!doc) continue

    const dateKey = parseDateIso(p.fecha_citacion || p.fecha_registro || p.marca_temporal || p.created_at)
    if (dateKey && dateMap.has(dateKey)) {
      const entry = dateMap.get(dateKey)
      entry.nominaDocs.add(doc)

      const isDia0 = 
        p.dia_0 === 'ASISTIO' || p.dia_0 === 'SI' || p.dia_0 === 'OK' || 
        p.evaluacion_dia_0 === 'APROBADO' || isDone(p.dia_0_obs)
      if (isDia0) entry.dia0Docs.add(doc)
    }
  }

  // 2. Asistencias D1 e Ingresos OP por fecha de evento
  for (let i = 0; i < asistencias.length; i++) {
    const a = asistencias[i]
    const doc = a.postulante_documento || a.documento
    if (!doc) continue
    const cleanDoc = String(doc).trim().toUpperCase()
    const dateKey = parseDateIso(a.fecha_asistencia || a.fecha_registro_asistencia)
    if (!dateKey || !dateMap.has(dateKey)) continue
    const entry = dateMap.get(dateKey)

    if (a.sigla_asistencia === 'I-OP') {
      entry.ingresosDocs.add(cleanDoc)
    } else if (ATTENDANCE_PRESENT.includes(a.sigla_asistencia) || a.sigla_asistencia === 'A') {
      entry.dia1Docs.add(cleanDoc)
    }
  }

  const data = Array.from(dateMap.values()).map(d => {
    const isProjection = d.fecha === todayIso
    let valor = 0

    switch (kpiId) {
      case 'NOMINA':
        valor = d.nominaDocs.size
        break
      case 'DIA_0':
        valor = d.dia0Docs.size
        break
      case 'DIA_1':
        valor = d.dia1Docs.size
        break
      case 'INGRESOS_OP':
      case 'COMPARATIVO_OP':
        valor = d.ingresosDocs.size
        break
      default:
        valor = d.nominaDocs.size
    }

    return {
      key: d.key,
      label: d.label,
      valor,
      valorReal: isProjection ? null : valor,
      proyeccion: isProjection ? valor : null,
      meta: null,
      isProjection,
      nomina: d.nominaDocs.size,
      dia0: d.dia0Docs.size,
      dia1: d.dia1Docs.size,
      ingresos: d.ingresosDocs.size,
    }
  })

  return {
    kpiConfig,
    granularity: 'DIARIO',
    data,
    totalCount: data.reduce((acc, d) => acc + (d.valor || 0), 0),
    avgPercent: 0,
  }
}

/**
 * Calcula la varianza entre el período actual y el anterior con polaridad inteligente
 */
export function computePeriodVariance(current, prev, isInversePolarity = false) {
  if (current == null || prev == null || isNaN(current) || isNaN(prev)) {
    return null
  }
  const currNum = Number(current)
  const prevNum = Number(prev)
  if (prevNum === 0 && currNum === 0) return null

  const delta = currNum - prevNum
  const deltaPct = prevNum !== 0 ? (delta / Math.abs(prevNum)) * 100 : (currNum > 0 ? 100 : -100)

  // En polaridad inversa (ej. deserción), una reducción de deserción (delta < 0) es POSITIVA para el negocio
  const isPositive = isInversePolarity ? delta < 0 : delta > 0
  const isNeutral = delta === 0

  return {
    delta: Number(delta.toFixed(2)),
    deltaPct: Number(deltaPct.toFixed(1)),
    isPositive,
    isNeutral,
    isImprovement: isPositive,
    formattedDelta: delta > 0 ? `+${delta.toFixed(1)}` : delta.toFixed(1),
    formattedDeltaPct: deltaPct > 0 ? `+${deltaPct.toFixed(1)}%` : `${deltaPct.toFixed(1)}%`
  }
}
