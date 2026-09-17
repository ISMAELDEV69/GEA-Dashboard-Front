/**
 * Cobertura de Dotación — motor gerencial (réplica Power BI).
 *
 * RQ: suma de rq_ftes_solicitado de grupos RECLUTAMIENTO, anclada a periodo_ingreso_op.
 * Ingresos: primer I-OP único por DNI (los I-OP siguientes no cuentan), ponderado FTE
 *           (FULL TIME = 1, PART TIME = 0.5).
 * Brecha: Ingresos − RQ (con signo). % cobertura = 0 si RQ = 0.
 */

import { normalize2026Period } from './dashboardAnalytics'
import { resolveFteWeight } from './dataService'

export const COBERTURA_COLORS = {
  rq: '#E67E22',
  ingresos: '#2E9E5B',
  line: '#1B4F72',
  header: '#163A6B',
  filterBar: '#B7B3D9',
  presencial: '#6F62B0',
  remoto: '#E2C44A',
  hibrido: '#2AA7A1',
}

export const MODALIDADES = ['PRESENCIAL', 'REMOTO', 'HIBRIDO']

function clean(val) {
  return String(val || '').trim()
}

function cleanUpper(val) {
  return clean(val).toUpperCase()
}

export function isAreaReclutamiento(area) {
  return cleanUpper(area) === 'RECLUTAMIENTO'
}

export function normalizeModalidadDotacion(raw) {
  const s = cleanUpper(raw)
  if (!s) return 'PRESENCIAL'
  if (s.includes('HIB')) return 'HIBRIDO'
  if (s.includes('REM')) return 'REMOTO'
  if (s.includes('PRES')) return 'PRESENCIAL'
  return 'PRESENCIAL'
}

export function isIopRecord(row) {
  if (!row) return false
  const sigla = cleanUpper(row.sigla || row.sigla_asistencia)
  if (sigla === 'I-OP' || sigla === 'IOP' || sigla.includes('INGRESO A OPER')) return true
  const estado = cleanUpper(row.estado)
  return estado === 'INGRESO A OPERACION' || estado === 'I-OP' || estado === 'INGRESO'
}

export function formatPeNumber(val, decimals = 2) {
  const n = Number(val)
  if (!Number.isFinite(n)) return decimals === 0 ? '0' : `0,${'0'.repeat(decimals)}`
  const sign = n < 0 ? '-' : ''
  const [intPart, fracPart] = Math.abs(n).toFixed(decimals).split('.')
  const withThousands = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  if (decimals === 0) return `${sign}${withThousands}`
  return `${sign}${withThousands},${fracPart}`
}

export function formatPePercent(val, decimals = 2) {
  return `${formatPeNumber(val, decimals)} %`
}

export function formatCorteDate(iso) {
  if (!iso) {
    const d = new Date()
    const dd = String(d.getDate()).padStart(2, '0')
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    return `${dd}/${mm}/${d.getFullYear()}`
  }
  const [y, m, d] = String(iso).slice(0, 10).split('-')
  if (!y || !m || !d) return iso
  return `${d}/${m}/${y}`
}

export function coberturaPct(ingresos, requerimiento) {
  const rq = Number(requerimiento) || 0
  const ing = Number(ingresos) || 0
  if (rq <= 0) return 0
  return (ing / rq) * 100
}

export function brechaVal(ingresos, requerimiento) {
  return Number(((Number(ingresos) || 0) - (Number(requerimiento) || 0)).toFixed(2))
}

function periodoFromGrupo(g) {
  return normalize2026Period(g?.periodo_ingreso_op) || normalize2026Period(g?.fecha_ingreso_op) || null
}

function round2(n) {
  return Number((Number(n) || 0).toFixed(2))
}

function buildGrupoIndex(grupos = []) {
  const byCodeCamp = new Map()
  const byCode = new Map()
  for (const g of grupos) {
    if (!g) continue
    const code = cleanUpper(g.codigo || g.grupo_codigo || g.grupo_capacitacion)
    if (!code) continue
    const camp = cleanUpper(g.campana || g.campana_nombre)
    byCode.set(code, g)
    if (camp) byCodeCamp.set(`${code}|${camp}`, g)
  }
  return { byCodeCamp, byCode }
}

function findGrupo(index, code, camp) {
  if (!code) return null
  if (camp) {
    const hit = index.byCodeCamp.get(`${code}|${camp}`)
    if (hit) return hit
  }
  return index.byCode.get(code) || null
}

function postulanteIndex(postulantes = []) {
  const map = new Map()
  for (const p of postulantes) {
    const doc = clean(p?.documento)
    if (doc) map.set(doc, p)
  }
  return map
}

/**
 * Primer I-OP por documento (fecha más temprana; empate → código de grupo estable).
 */
export function extractFirstIops(asistencias = []) {
  const byDoc = new Map()
  for (const a of asistencias) {
    if (!isIopRecord(a)) continue
    const doc = clean(a.documento || a.postulante_documento)
    if (!doc) continue
    const fecha = clean(a.fecha_asistencia || a.fecha_registro_asistencia).slice(0, 10)
    if (!fecha || fecha.length < 8) continue
    const code = cleanUpper(a.codigo_grupo || a.grupo_codigo || a.grupo)
    const prev = byDoc.get(doc)
    if (
      !prev ||
      fecha < prev.fecha ||
      (fecha === prev.fecha && code < prev.code)
    ) {
      byDoc.set(doc, { fecha, code, record: a })
    }
  }
  return byDoc
}

function pushCell(bucket, keyParts, amount, field) {
  const key = keyParts.join('|')
  let row = bucket.get(key)
  if (!row) {
    row = {
      periodo: keyParts[0],
      segmento: keyParts[1],
      campana: keyParts[2],
      modalidad: keyParts[3],
      requerimiento: 0,
      ingresos: 0,
    }
    bucket.set(key, row)
  }
  row[field] = round2(row[field] + amount)
}

export function buildCoberturaDotacionModel(grupos = [], asistencias = [], postulantes = []) {
  const index = buildGrupoIndex(grupos)
  const people = postulanteIndex(postulantes)
  const firstIops = extractFirstIops(asistencias)
  const cells = new Map()
  const seenRq = new Set()
  let corteIso = ''

  for (const g of grupos) {
    if (!isAreaReclutamiento(g?.area_traslado)) continue
    const periodo = periodoFromGrupo(g)
    if (!periodo) continue
    const code = cleanUpper(g.codigo || g.grupo_codigo || g.grupo_capacitacion)
    const campana = clean(g.campana || g.campana_nombre) || 'Sin Campaña'
    const dedup = `${code}|${cleanUpper(campana)}|${periodo}`
    if (seenRq.has(dedup)) continue
    seenRq.add(dedup)

    const rqRaw = g.rq_ftes_solicitado ?? g.rq_solicitado ?? g.requerimiento
    const rq = Number(rqRaw)
    const rqVal = Number.isFinite(rq) && rq > 0 ? rq : 0
    if (rqVal <= 0) continue

    pushCell(
      cells,
      [
        periodo,
        clean(g.segmento) || 'SIN SEGMENTO',
        campana,
        normalizeModalidadDotacion(g.modalidad),
      ],
      rqVal,
      'requerimiento'
    )
  }

  firstIops.forEach((entry, doc) => {
    const a = entry.record
    const code = cleanUpper(a.codigo_grupo || a.grupo_codigo || a.grupo || entry.code)
    const campAsis = cleanUpper(a.campana)
    const g = findGrupo(index, code, campAsis)
    const p = people.get(doc)

    const periodo =
      periodoFromGrupo(g) ||
      normalize2026Period(entry.fecha) ||
      null
    if (!periodo) return

    const segmento = clean(g?.segmento || p?.segmento) || 'SIN SEGMENTO'
    const campana = clean(g?.campana || g?.campana_nombre || a.campana || p?.campana) || 'Sin Campaña'
    const modalidad = normalizeModalidadDotacion(g?.modalidad || p?.modalidad || a.modalidad)
    const fte = resolveFteWeight(
      a.condicion_laboral,
      a.condicion,
      p?.condicion,
      p?.condicion_laboral,
      g?.condicion,
      g?.condicion_laboral
    )

    pushCell(cells, [periodo, segmento, campana, modalidad], fte, 'ingresos')

    if (entry.fecha && entry.fecha > corteIso) corteIso = entry.fecha
  })

  const rows = Array.from(cells.values()).sort((a, b) => {
    if (a.periodo !== b.periodo) return a.periodo.localeCompare(b.periodo)
    if (a.segmento !== b.segmento) return a.segmento.localeCompare(b.segmento)
    return a.campana.localeCompare(b.campana)
  })

  const periodos = [...new Set(rows.map(r => r.periodo))].sort()
  const segmentos = [...new Set(rows.map(r => r.segmento))].sort((a, b) => a.localeCompare(b, 'es'))
  const campanas = [...new Set(rows.map(r => r.campana))].sort((a, b) => a.localeCompare(b, 'es'))

  const now = new Date()
  const currentYm = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`
  const activity = new Map()
  for (const r of rows) {
    const slot = activity.get(r.periodo) || { rq: 0, ing: 0 }
    slot.rq += Number(r.requerimiento) || 0
    slot.ing += Number(r.ingresos) || 0
    activity.set(r.periodo, slot)
  }
  const withData = periodos.filter((p) => {
    const s = activity.get(p)
    return s && p <= currentYm && (s.rq > 0 || s.ing > 0)
  })
  const defaultPeriodo = withData.length
    ? withData[withData.length - 1]
    : (periodos.filter((p) => p <= currentYm).pop() || periodos[periodos.length - 1] || '')

  return {
    rows,
    periodos,
    segmentos,
    campanas,
    corteIso,
    defaultPeriodo,
    totalFirstIops: firstIops.size,
  }
}

function matchesFilter(row, filters) {
  if (filters.segmento && row.segmento !== filters.segmento) return false
  if (filters.campana && row.campana !== filters.campana) return false
  const mods = filters.modalidades
  if (Array.isArray(mods) && mods.length > 0 && mods.length < MODALIDADES.length) {
    if (!mods.includes(row.modalidad)) return false
  }
  return true
}

function emptyTotals() {
  return { requerimiento: 0, ingresos: 0, coberturaPct: 0, brecha: 0 }
}

function withRates(tot) {
  const requerimiento = round2(tot.requerimiento)
  const ingresos = round2(tot.ingresos)
  return {
    requerimiento,
    ingresos,
    coberturaPct: round2(coberturaPct(ingresos, requerimiento)),
    brecha: brechaVal(ingresos, requerimiento),
  }
}

function addInto(acc, row) {
  acc.requerimiento += Number(row.requerimiento) || 0
  acc.ingresos += Number(row.ingresos) || 0
}

export function currentYearMonth() {
  const now = new Date()
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`
}

export function listYearMonths(from, to) {
  if (!from || !to) return []
  const out = []
  let y = parseInt(from.slice(0, 4), 10)
  let m = parseInt(from.slice(4, 6), 10)
  const y2 = parseInt(to.slice(0, 4), 10)
  const m2 = parseInt(to.slice(4, 6), 10)
  if (!y || !m || !y2 || !m2) return []
  while (y < y2 || (y === y2 && m <= m2)) {
    out.push(`${y}${String(m).padStart(2, '0')}`)
    m += 1
    if (m > 12) {
      m = 1
      y += 1
    }
  }
  return out
}

export function aggregateCoberturaDotacion(model, filters = {}) {
  const rows = model?.rows || []
  const dimFiltered = rows.filter(r => matchesFilter(r, filters))
  const periodo = filters.periodo || model?.defaultPeriodo || ''
  const periodFiltered = dimFiltered.filter(r => !periodo || r.periodo === periodo)

  const kpis = withRates(periodFiltered.reduce((acc, r) => {
    addInto(acc, r)
    return acc
  }, emptyTotals()))

  const axisEnd = currentYearMonth()
  const axisStart = '202601'
  const byPeriodo = new Map()
  for (const p of listYearMonths(axisStart, axisEnd)) {
    byPeriodo.set(p, { periodo: p, requerimiento: 0, ingresos: 0 })
  }
  for (const r of dimFiltered) {
    if (!byPeriodo.has(r.periodo)) continue
    addInto(byPeriodo.get(r.periodo), r)
  }
  const seguimiento = [...byPeriodo.values()].map(s => ({
    ...withRates(s),
    periodo: s.periodo,
    selected: s.periodo === periodo,
  }))

  const bySegmento = new Map()
  for (const r of periodFiltered) {
    let slot = bySegmento.get(r.segmento)
    if (!slot) {
      slot = { segmento: r.segmento, requerimiento: 0, ingresos: 0 }
      bySegmento.set(r.segmento, slot)
    }
    addInto(slot, r)
  }
  const segmentos = [...bySegmento.values()]
    .map(s => ({ ...withRates(s), segmento: s.segmento }))
    .sort((a, b) => b.coberturaPct - a.coberturaPct)

  const byCampana = new Map()
  for (const r of periodFiltered) {
    let slot = byCampana.get(r.campana)
    if (!slot) {
      slot = { campana: r.campana, requerimiento: 0, ingresos: 0 }
      byCampana.set(r.campana, slot)
    }
    addInto(slot, r)
  }
  const campanas = [...byCampana.values()]
    .map(s => ({ ...withRates(s), campana: s.campana }))
    .sort((a, b) => b.requerimiento - a.requerimiento || b.ingresos - a.ingresos)

  const byPair = new Map()
  for (const r of periodFiltered) {
    const key = `${r.segmento}|${r.campana}`
    let slot = byPair.get(key)
    if (!slot) {
      slot = { segmento: r.segmento, campana: r.campana, requerimiento: 0, ingresos: 0 }
      byPair.set(key, slot)
    }
    addInto(slot, r)
  }
  const tabla = [...byPair.values()]
    .map(s => ({ ...withRates(s), segmento: s.segmento, campana: s.campana }))
    .sort((a, b) => a.segmento.localeCompare(b.segmento, 'es') || a.campana.localeCompare(b.campana, 'es'))

  const byMod = new Map(MODALIDADES.map(m => [m, { modalidad: m, requerimiento: 0, ingresos: 0 }]))
  for (const r of periodFiltered) {
    let slot = byMod.get(r.modalidad)
    if (!slot) {
      slot = { modalidad: r.modalidad, requerimiento: 0, ingresos: 0 }
      byMod.set(r.modalidad, slot)
    }
    addInto(slot, r)
  }
  const ingresosModTotal = [...byMod.values()].reduce((s, m) => s + (m.ingresos || 0), 0)
  const modalidad = [...byMod.values()].map(s => {
    const rates = withRates(s)
    return {
      ...rates,
      modalidad: s.modalidad,
      participacion: ingresosModTotal > 0 ? round2((rates.ingresos / ingresosModTotal) * 100) : 0,
    }
  })

  const campanasForSegmento = filters.segmento
    ? [...new Set(rows.filter(r => r.segmento === filters.segmento).map(r => r.campana))].sort((a, b) => a.localeCompare(b, 'es'))
    : (model?.campanas || [])

  return {
    periodo,
    kpis,
    seguimiento,
    segmentos,
    campanas,
    tabla,
    modalidad,
    ingresosModTotal: round2(ingresosModTotal),
    filterOptions: {
      periodos: model?.periodos || [],
      segmentos: model?.segmentos || [],
      campanas: campanasForSegmento,
    },
  }
}
