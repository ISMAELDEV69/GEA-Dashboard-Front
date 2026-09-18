/**
 * Vista Proyectados — inner join cobertura_dotacion × capacidad_rys.
 * Llaves de cruce: periodo + semana + campaña + grupo.
 * Segmento sale de cobertura_dotacion; estado del grupo sale de capacidad_rys.
 */

import {
  MODALIDADES,
  coberturaPct,
  brechaVal,
  formatCorteDate,
  shortCampanaLabel,
  currentYearMonth,
  listYearMonths,
  normalizeCoberturaFact,
  buildCapacidadIndex,
  matchCapacidad,
  normalizeEstadoGrupo,
  normalizeMetricTipo,
  metricsForTipo,
  normalizeGrupoKey,
  normalizeCampanaKey,
  normalizeWeekKey,
  corteIsoForWindow,
} from './coberturaDotacionAnalytics'

export { normalizeGrupoKey, normalizeCampanaKey, normalizeWeekKey, normalizeEstadoGrupo, normalizeCoberturaFact }

function round2(n) {
  return Number((Number(n) || 0).toFixed(2))
}

function clean(val) {
  return String(val || '').trim()
}

function uniqueSorted(values, locale = false) {
  const list = [...new Set(values.filter(Boolean))]
  return locale ? list.sort((a, b) => a.localeCompare(b, 'es')) : list.sort()
}

/**
 * Inner join: solo quedan filas de cobertura que existen en capacidad
 * con las mismas llaves (periodo, semana, campaña, grupo).
 */
export function joinCoberturaConCapacidad(tableRows = [], capacidadRows = []) {
  const index = buildCapacidadIndex(capacidadRows)
  const out = []
  for (const raw of tableRows) {
    const fact = normalizeCoberturaFact(raw)
    if (!fact.periodo || !fact.gpe || !fact.hasAmount) continue
    const cap = matchCapacidad(index, fact)
    if (!cap) continue
    out.push({
      ...fact,
      estado: normalizeEstadoGrupo(cap.estado) || 'SIN ESTADO',
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

function addInto(acc, row, tipo = 'ftes') {
  const metrics = metricsForTipo(row, tipo)
  acc.requerimiento += metrics.requerimiento
  acc.ingresos += metrics.ingresos
  acc.proyeccion += metrics.proyeccion
  acc.dia1 += Number(row.dia1) || 0
}

function matchesFilter(row, filters) {
  if (filters.semana && row.semana !== filters.semana) return false
  if (filters.segmento && row.segmento !== filters.segmento) return false
  if (filters.campana && row.campana !== filters.campana) return false
  if (filters.estado && row.estado !== filters.estado) return false
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
        ...n,
        rqQ: 0,
        rqFtes: 0,
        rqCap: 0,
        ingQ: 0,
        ingFtes: 0,
        ingCap: 0,
        proyQ: 0,
        proyFtes: 0,
        proyCap: 0,
        dia1: 0,
      }
      cells.set(key, row)
    }
    row.rqQ += Number(n.rqQ) || 0
    row.rqFtes += Number(n.rqFtes) || 0
    row.rqCap += Number(n.rqCap) || 0
    row.ingQ += Number(n.ingQ) || 0
    row.ingFtes += Number(n.ingFtes) || 0
    row.ingCap += Number(n.ingCap) || 0
    row.proyQ += Number(n.proyQ) || 0
    row.proyFtes += Number(n.proyFtes) || 0
    row.proyCap += Number(n.proyCap) || 0
    row.dia1 += Number(n.dia1) || 0
    if (n.fecha && (!row.fecha || n.fecha > row.fecha)) row.fecha = n.fecha
    if (n.fecha && n.fecha > corteIso) corteIso = n.fecha
    else if (!n.fecha && n.createdAt && n.createdAt > corteIso) corteIso = n.createdAt
  }

  const rows = Array.from(cells.values()).map((r) => ({
    ...r,
    rqQ: round2(r.rqQ),
    rqFtes: round2(r.rqFtes),
    rqCap: round2(r.rqCap),
    ingQ: round2(r.ingQ),
    ingFtes: round2(r.ingFtes),
    ingCap: round2(r.ingCap),
    proyQ: round2(r.proyQ),
    proyFtes: round2(r.proyFtes),
    proyCap: round2(r.proyCap),
    dia1: round2(r.dia1),
  })).sort((a, b) => {
    if (a.periodo !== b.periodo) return a.periodo.localeCompare(b.periodo)
    if (a.segmento !== b.segmento) return a.segmento.localeCompare(b.segmento, 'es')
    if (a.campana !== b.campana) return a.campana.localeCompare(b.campana, 'es')
    return String(a.gpe).localeCompare(String(b.gpe))
  })

  const periodos = uniqueSorted(rows.map((r) => r.periodo))
  const currentYm = currentYearMonth()
  const activity = new Map()
  for (const r of rows) {
    const slot = activity.get(r.periodo) || { active: false }
    if (r.rqQ || r.rqFtes || r.ingQ || r.ingFtes || r.proyQ || r.proyFtes) slot.active = true
    activity.set(r.periodo, slot)
  }
  const withData = periodos.filter((p) => activity.get(p)?.active && p <= currentYm)
  const defaultPeriodo = withData.length
    ? withData[withData.length - 1]
    : (periodos.filter((p) => p <= currentYm).pop() || periodos[periodos.length - 1] || '')

  return {
    rows,
    periodos,
    semanas: uniqueSorted(rows.map((r) => r.semana)),
    segmentos: uniqueSorted(rows.map((r) => r.segmento), true),
    campanas: uniqueSorted(rows.map((r) => r.campana), true),
    estados: uniqueSorted(rows.map((r) => r.estado), true),
    corteIso,
    defaultPeriodo,
    source: 'proyectados',
  }
}

function topCampanas(list, limit = 10) {
  if (list.length <= limit) {
    return list.map((s) => ({ ...s, campanaShort: s.campanaShort || shortCampanaLabel(s.campana), isOtras: false }))
  }
  const top = list.slice(0, limit)
  const rest = list.slice(limit)
  const other = rest.reduce((acc, r) => {
    acc.requerimiento += Number(r.requerimiento) || 0
    acc.ingresos += Number(r.ingresos) || 0
    acc.proyeccion += Number(r.proyeccion) || 0
    acc.dia1 += Number(r.dia1) || 0
    return acc
  }, emptyTotals())
  return [
    ...top.map((s) => ({ ...s, campanaShort: s.campanaShort || shortCampanaLabel(s.campana), isOtras: false })),
    { ...withRates(other), campana: 'OTRAS', campanaShort: 'OTRAS', isOtras: true },
  ]
}

export function aggregateRequerimientos(model, filters = {}) {
  const rows = model?.rows || []
  const tipo = normalizeMetricTipo(filters.tipo)
  const seguimientoAxis = filters.seguimientoAxis === 'semana' ? 'semana' : 'periodo'
  const dimFiltered = rows.filter((r) => matchesFilter(r, filters))
  const periodo = filters.periodo || model?.defaultPeriodo || ''
  const periodFiltered = dimFiltered.filter((r) => !periodo || r.periodo === periodo)

  const kpis = withRates(periodFiltered.reduce((acc, r) => {
    addInto(acc, r, tipo)
    return acc
  }, emptyTotals()))

  let seguimiento = []
  if (seguimientoAxis === 'semana') {
    const weekSource = rows
      .filter((r) => matchesFilter(r, { ...filters, semana: '' }))
      .filter((r) => !periodo || r.periodo === periodo)
    const bySemana = new Map()
    for (const r of weekSource) {
      let slot = bySemana.get(r.semana)
      if (!slot) {
        slot = { axisKey: r.semana, semana: r.semana, periodo: r.periodo, ...emptyTotals() }
        bySemana.set(r.semana, slot)
      }
      addInto(slot, r, tipo)
    }
    seguimiento = [...bySemana.values()]
      .sort((a, b) => a.axisKey.localeCompare(b.axisKey))
      .map((s) => ({
        ...withRates(s),
        axisKey: s.axisKey,
        semana: s.semana,
        periodo: s.periodo,
        selected: Boolean(filters.semana) && s.semana === filters.semana,
      }))
  } else {
    const axisEnd = currentYearMonth()
    const byPeriodo = new Map()
    for (const p of listYearMonths('202601', axisEnd)) {
      byPeriodo.set(p, { axisKey: p, periodo: p, ...emptyTotals() })
    }
    for (const r of dimFiltered) {
      if (!byPeriodo.has(r.periodo)) continue
      addInto(byPeriodo.get(r.periodo), r, tipo)
    }
    seguimiento = [...byPeriodo.values()].map((s) => ({
      ...withRates(s),
      axisKey: s.axisKey,
      periodo: s.periodo,
      selected: s.periodo === periodo,
    }))
  }

  const bySegmento = new Map()
  for (const r of periodFiltered) {
    let slot = bySegmento.get(r.segmento)
    if (!slot) {
      slot = { segmento: r.segmento, ...emptyTotals() }
      bySegmento.set(r.segmento, slot)
    }
    addInto(slot, r, tipo)
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
    addInto(slot, r, tipo)
  }
  const campanas = [...byCampana.values()]
    .map((s) => ({ ...withRates(s), campana: s.campana, campanaShort: shortCampanaLabel(s.campana) }))
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
    addInto(slot, r, tipo)
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
    addInto(byMod.get(mod), r, tipo)
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

  const inPeriodo = rows.filter((r) => !periodo || r.periodo === periodo)
  const afterSemana = filters.semana ? inPeriodo.filter((r) => r.semana === filters.semana) : inPeriodo
  const afterSegmento = filters.segmento ? afterSemana.filter((r) => r.segmento === filters.segmento) : afterSemana
  const afterCampana = filters.campana ? afterSegmento.filter((r) => r.campana === filters.campana) : afterSegmento

  return {
    periodo,
    tipo,
    seguimientoAxis,
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
      semanas: uniqueSorted(inPeriodo.map((r) => r.semana)),
      segmentos: uniqueSorted(afterSemana.map((r) => r.segmento), true),
      campanas: uniqueSorted(afterSegmento.map((r) => r.campana), true),
      estados: uniqueSorted(afterCampana.map((r) => r.estado), true),
    },
    corteLabel: formatCorteDate(corteIsoForWindow(rows, { periodo, semana: filters.semana }) || model?.corteIso),
  }
}
