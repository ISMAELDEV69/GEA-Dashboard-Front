/**
 * Vista Requerimientos — inner join cobertura_dotacion × capacidad_rys.
 * Llaves de cruce: periodo + semana + campaña + grupo.
 * Del match se trae la ficha ya filtrada de capacidad: segmento y estado del grupo.
 */

import { normalize2026Period } from './dashboardAnalytics'
import {
  MODALIDADES,
  coberturaPct,
  brechaVal,
  formatCorteDate,
  shortCampanaLabel,
  currentYearMonth,
  listYearMonths,
  normalizeModalidadDotacion,
} from './coberturaDotacionAnalytics'

function clean(val) {
  return String(val || '').trim()
}

function cleanUpper(val) {
  return clean(val).toUpperCase()
}

function round2(n) {
  return Number((Number(n) || 0).toFixed(2))
}

function pickCol(row, ...names) {
  if (!row) return ''
  for (const name of names) {
    if (Object.prototype.hasOwnProperty.call(row, name) && row[name] != null && row[name] !== '') {
      return row[name]
    }
  }
  const lower = {}
  for (const [key, value] of Object.entries(row)) {
    lower[String(key).toLowerCase()] = value
  }
  for (const name of names) {
    const value = lower[String(name).toLowerCase()]
    if (value != null && value !== '') return value
  }
  return ''
}

export function normalizeGrupoKey(val) {
  return cleanUpper(val).replace(/\s+/g, '')
}

export function normalizeCampanaKey(val) {
  return cleanUpper(val)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

export function normalizeWeekKey(val) {
  const s = cleanUpper(val)
  if (!s) return ''
  if (/^20\d{4}$/.test(s)) return String(parseInt(s.slice(4, 6), 10))
  const match = s.match(/(\d{1,2})/)
  return match ? String(parseInt(match[1], 10)) : ''
}

export function normalizeEstadoGrupo(raw) {
  const s = cleanUpper(raw)
  if (!s) return 'SIN ESTADO'
  if (s.includes('CERR')) return 'CERRADO'
  if (s.includes('CURSO') || s === 'ACTIVO') return 'EN CURSO'
  if (s.includes('PLAN')) return 'PLANIFICADO'
  return s
}

function numCol(row, ...names) {
  const n = Number(pickCol(row, ...names))
  return Number.isFinite(n) ? n : 0
}

function buildCapacidadIndex(capacidadRows = []) {
  const exact = new Map()
  const noWeek = new Map()

  const push = (map, key, row) => {
    if (!key || key.includes('||')) return
    if (!map.has(key)) map.set(key, row)
  }

  for (const g of capacidadRows) {
    if (!g) continue
    const grupo = normalizeGrupoKey(g.codigo || g.grupo_codigo || g.grupo_capacitacion)
    const campana = normalizeCampanaKey(g.campana || g.campana_nombre)
    const week = normalizeWeekKey(g.semana_label || g.semana_trabajo || g.semana)
    const periodoOp = normalize2026Period(g.periodo_ingreso_op) || ''
    const periodo = normalize2026Period(g.periodo) || ''
    if (!grupo || !campana) continue

    if (periodoOp && week) push(exact, `${periodoOp}|${week}|${campana}|${grupo}`, g)
    if (periodo && week) push(exact, `${periodo}|${week}|${campana}|${grupo}`, g)
    if (periodoOp) push(noWeek, `${periodoOp}|${campana}|${grupo}`, g)
    if (periodo) push(noWeek, `${periodo}|${campana}|${grupo}`, g)
  }

  return { exact, noWeek }
}

function matchCapacidad(index, row) {
  const grupo = normalizeGrupoKey(row.gpe)
  const campana = normalizeCampanaKey(row.campana)
  const week = normalizeWeekKey(row.semana)
  const periodo = row.periodo
  if (!grupo || !campana || !periodo) return null
  if (week) {
    const exact = index.exact.get(`${periodo}|${week}|${campana}|${grupo}`)
    if (exact) return exact
  }
  return index.noWeek.get(`${periodo}|${campana}|${grupo}`) || null
}

export function normalizeCoberturaFact(raw) {
  const periodo = normalize2026Period(pickCol(raw, 'PERIODO', 'periodo')) || clean(pickCol(raw, 'PERIODO', 'periodo'))
  return {
    periodo,
    semana: clean(pickCol(raw, 'SEMANA', 'semana')) || 'SIN SEMANA',
    campana: clean(pickCol(raw, 'CAMPAÑA', 'CAMPANA', 'campaña', 'campana')) || 'Sin Campaña',
    gpe: clean(pickCol(raw, 'GPE', 'gpe')),
    modalidad: normalizeModalidadDotacion(pickCol(raw, 'MODALIDAD_TRABAJO', 'modalidad_trabajo', 'modalidad')),
    requerimiento: round2(numCol(raw, 'RQ_FTES', 'rq_ftes')),
    ingresos: round2(numCol(raw, 'INGRESOS_FTES', 'ingresos_ftes')),
    proyeccion: round2(numCol(raw, 'PROY_INGRESOS_FTES', 'proy_ingresos_ftes')),
    dia1: round2(numCol(raw, 'Q_DIA_1', 'q_dia_1')),
    createdAt: clean(pickCol(raw, 'created_at')).slice(0, 10),
  }
}

/**
 * Inner join: solo quedan filas de cobertura que existen en capacidad
 * con las mismas llaves (periodo, semana, campaña, grupo).
 * Segmento y estado salen de esa ficha de capacidad, no de cobertura.
 */
export function joinCoberturaConCapacidad(tableRows = [], capacidadRows = []) {
  const index = buildCapacidadIndex(capacidadRows)
  const out = []
  for (const raw of tableRows) {
    const fact = normalizeCoberturaFact(raw)
    if (!fact.periodo || !fact.gpe) continue
    if (!fact.requerimiento && !fact.ingresos && !fact.proyeccion) continue
    const cap = matchCapacidad(index, fact)
    if (!cap) continue
    out.push({
      ...fact,
      segmento: clean(cap.segmento) || 'SIN SEGMENTO',
      estado: normalizeEstadoGrupo(cap.estado),
      gpe: fact.gpe || clean(cap.codigo),
    })
  }
  return out
}

function withRates(tot) {
  const requerimiento = round2(tot.requerimiento)
  const ingresos = round2(tot.ingresos)
  const proyeccion = round2(tot.proyeccion || 0)
  const dia1 = round2(tot.dia1 || 0)
  return {
    requerimiento,
    ingresos,
    proyeccion,
    dia1,
    coberturaPct: round2(coberturaPct(ingresos, requerimiento)),
    brecha: brechaVal(ingresos, requerimiento),
    brechaCapacitacion: round2(ingresos - proyeccion),
    brechaReclutamiento: round2(proyeccion - requerimiento),
  }
}

function emptyTotals() {
  return { requerimiento: 0, ingresos: 0, proyeccion: 0, dia1: 0 }
}

function addInto(acc, row) {
  acc.requerimiento += Number(row.requerimiento) || 0
  acc.ingresos += Number(row.ingresos) || 0
  acc.proyeccion += Number(row.proyeccion) || 0
  acc.dia1 += Number(row.dia1) || 0
}

function matchesFilter(row, filters) {
  if (filters.segmento && row.segmento !== filters.segmento) return false
  if (filters.campana && row.campana !== filters.campana) return false
  if (filters.estado && row.estado !== filters.estado) return false
  if (filters.semana && row.semana !== filters.semana) return false
  const mods = filters.modalidades
  if (Array.isArray(mods) && mods.length > 0 && mods.length < MODALIDADES.length) {
    if (!mods.includes(row.modalidad)) return false
  }
  return true
}

export function buildRequerimientosModel(joinedRows = []) {
  const cells = new Map()
  let corteIso = ''

  for (const n of joinedRows) {
    const key = [n.periodo, n.semana, n.segmento, n.campana, n.gpe, n.estado, n.modalidad].join('|')
    let row = cells.get(key)
    if (!row) {
      row = {
        periodo: n.periodo,
        semana: n.semana,
        segmento: n.segmento,
        campana: n.campana,
        gpe: n.gpe || 'SIN GRUPO',
        estado: n.estado,
        modalidad: n.modalidad,
        requerimiento: 0,
        ingresos: 0,
        proyeccion: 0,
        dia1: 0,
      }
      cells.set(key, row)
    }
    addInto(row, n)
    if (n.createdAt && n.createdAt > corteIso) corteIso = n.createdAt
  }

  const rows = Array.from(cells.values()).map((r) => ({
    ...r,
    requerimiento: round2(r.requerimiento),
    ingresos: round2(r.ingresos),
    proyeccion: round2(r.proyeccion),
    dia1: round2(r.dia1),
  })).sort((a, b) => {
    if (a.periodo !== b.periodo) return a.periodo.localeCompare(b.periodo)
    if (a.segmento !== b.segmento) return a.segmento.localeCompare(b.segmento, 'es')
    if (a.campana !== b.campana) return a.campana.localeCompare(b.campana, 'es')
    return String(a.gpe).localeCompare(String(b.gpe))
  })

  const periodos = [...new Set(rows.map((r) => r.periodo))].sort()
  const segmentos = [...new Set(rows.map((r) => r.segmento))].sort((a, b) => a.localeCompare(b, 'es'))
  const campanas = [...new Set(rows.map((r) => r.campana))].sort((a, b) => a.localeCompare(b, 'es'))
  const estados = [...new Set(rows.map((r) => r.estado))].sort((a, b) => a.localeCompare(b, 'es'))

  const currentYm = currentYearMonth()
  const activity = new Map()
  for (const r of rows) {
    const slot = activity.get(r.periodo) || { rq: 0, ing: 0, proy: 0 }
    slot.rq += r.requerimiento
    slot.ing += r.ingresos
    slot.proy += r.proyeccion
    activity.set(r.periodo, slot)
  }
  const withData = periodos.filter((p) => {
    const s = activity.get(p)
    return s && p <= currentYm && (s.rq > 0 || s.ing > 0 || s.proy > 0)
  })
  const defaultPeriodo = withData.length
    ? withData[withData.length - 1]
    : (periodos.filter((p) => p <= currentYm).pop() || periodos[periodos.length - 1] || '')

  return {
    rows,
    periodos,
    segmentos,
    campanas,
    estados,
    corteIso,
    defaultPeriodo,
    source: 'requerimientos',
  }
}

function topCampanas(list, limit = 10) {
  if (list.length <= limit) {
    return list.map((s) => ({ ...s, campanaShort: shortCampanaLabel(s.campana), isOtras: false }))
  }
  const top = list.slice(0, limit)
  const rest = list.slice(limit)
  const other = rest.reduce((acc, r) => {
    addInto(acc, r)
    return acc
  }, emptyTotals())
  return [
    ...top.map((s) => ({ ...s, campanaShort: shortCampanaLabel(s.campana), isOtras: false })),
    { ...withRates(other), campana: 'OTRAS', campanaShort: 'OTRAS', isOtras: true },
  ]
}

export function aggregateRequerimientos(model, filters = {}) {
  const rows = model?.rows || []
  const dimFiltered = rows.filter((r) => matchesFilter(r, filters))
  const periodo = filters.periodo || model?.defaultPeriodo || ''
  const periodFiltered = dimFiltered.filter((r) => !periodo || r.periodo === periodo)

  const kpis = withRates(periodFiltered.reduce((acc, r) => {
    addInto(acc, r)
    return acc
  }, emptyTotals()))

  const axisEnd = currentYearMonth()
  const byPeriodo = new Map()
  for (const p of listYearMonths('202601', axisEnd)) {
    byPeriodo.set(p, { periodo: p, ...emptyTotals() })
  }
  for (const r of dimFiltered) {
    if (!byPeriodo.has(r.periodo)) continue
    addInto(byPeriodo.get(r.periodo), r)
  }
  const seguimiento = [...byPeriodo.values()].map((s) => ({
    ...withRates(s),
    periodo: s.periodo,
    selected: s.periodo === periodo,
  }))

  const bySegmento = new Map()
  for (const r of periodFiltered) {
    let slot = bySegmento.get(r.segmento)
    if (!slot) {
      slot = { segmento: r.segmento, ...emptyTotals() }
      bySegmento.set(r.segmento, slot)
    }
    addInto(slot, r)
  }
  const segmentos = [...bySegmento.values()]
    .map((s) => ({ ...withRates(s), segmento: s.segmento }))
    .sort((a, b) => b.coberturaPct - a.coberturaPct)

  const byCampana = new Map()
  for (const r of periodFiltered) {
    let slot = byCampana.get(r.campana)
    if (!slot) {
      slot = { campana: r.campana, ...emptyTotals() }
      byCampana.set(r.campana, slot)
    }
    addInto(slot, r)
  }
  const campanas = [...byCampana.values()]
    .map((s) => ({ ...withRates(s), campana: s.campana }))
    .sort((a, b) => b.requerimiento - a.requerimiento || b.ingresos - a.ingresos)
  const campanasChart = topCampanas(campanas)

  const byEscuela = new Map()
  for (const r of periodFiltered) {
    const key = `${r.segmento}|${r.campana}|${r.gpe}|${r.estado}`
    let slot = byEscuela.get(key)
    if (!slot) {
      slot = {
        segmento: r.segmento,
        campana: r.campana,
        gpe: r.gpe,
        estado: r.estado,
        ...emptyTotals(),
      }
      byEscuela.set(key, slot)
    }
    addInto(slot, r)
  }
  const tabla = [...byEscuela.values()]
    .map((r) => ({ ...withRates(r), ...r }))
    .sort((a, b) =>
      a.segmento.localeCompare(b.segmento, 'es')
      || a.campana.localeCompare(b.campana, 'es')
      || String(a.gpe).localeCompare(String(b.gpe))
    )

  const byMod = new Map(MODALIDADES.map((m) => [m, { modalidad: m, ...emptyTotals() }]))
  for (const r of periodFiltered) {
    const mod = MODALIDADES.includes(r.modalidad) ? r.modalidad : 'PRESENCIAL'
    addInto(byMod.get(mod), r)
  }
  const ingresosModTotal = [...byMod.values()].reduce((s, m) => s + (m.ingresos || 0), 0)
  const modalidad = [...byMod.values()].map((s) => {
    const rates = withRates(s)
    return {
      ...rates,
      modalidad: s.modalidad,
      participacion: ingresosModTotal > 0 ? round2((rates.ingresos / ingresosModTotal) * 100) : 0,
    }
  })

  const campanasForSegmento = filters.segmento
    ? [...new Set(rows.filter((r) => r.segmento === filters.segmento).map((r) => r.campana))].sort((a, b) => a.localeCompare(b, 'es'))
    : (model?.campanas || [])

  return {
    periodo,
    kpis,
    seguimiento,
    segmentos,
    campanas,
    campanasChart,
    tabla,
    modalidad,
    ingresosModTotal: round2(ingresosModTotal),
    filterOptions: {
      periodos: model?.periodos || [],
      segmentos: model?.segmentos || [],
      campanas: campanasForSegmento,
      estados: model?.estados || [],
    },
    corteLabel: formatCorteDate(model?.corteIso),
  }
}
