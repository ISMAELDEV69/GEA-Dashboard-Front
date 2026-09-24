/**
 * Motor del tablero KPI formadores.
 * Cohorte = quienes llegaron a Día 1 de capacitación.
 * Deserción = solo bajas de capacitación (CT) y OJT.
 * Fuera: Baja Día 1 y descuentos.
 */

import { isBajaDia1, isBajaCapacitacion, resolveFteWeight, parseFechaAsistencia } from './dataService'
import { normalize2026Period } from './dashboardAnalytics'

/** Periodo de ingreso OP: campo explícito o mes de fecha_ingreso_op. No usa periodo de capa. */
function resolvePeriodoIngreso(g) {
  if (!g) return null
  const direct = normalize2026Period(g.periodo_ingreso_op || g.periodo_ingreso || g.periodo_efectivo)
  if (direct) return direct
  if (g.fecha_ingreso_op) {
    const fromFecha = normalize2026Period(g.fecha_ingreso_op)
    if (fromFecha) return fromFecha
  }
  return null
}

export const MIN_PERIODO_FORMADOR = '202608'

export function isPeriodoFormadorActivo(periodo) {
  const p = String(periodo || '').trim()
  return Boolean(p) && p >= MIN_PERIODO_FORMADOR
}

export const JUNK_FORMADORES = new Set([
  'ADMIN',
  'FORMADOR',
  'SIN ASIGNAR',
  'SIN FORMADOR',
  'POR ASIGNAR',
])

export function normKpi(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
}

export function num(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

export function pct(part, total, digits = 1) {
  if (!total) return 0
  const factor = 10 ** digits
  return Math.round((part / total) * 100 * factor) / factor
}

export function fmtNum(value, digits = 0) {
  const n = num(value)
  return n.toLocaleString('es-PE', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

export function isJunkFormador(name) {
  const n = normKpi(name)
  if (!n) return true
  if (JUNK_FORMADORES.has(n)) return true
  return false
}

export function matchName(candidate, target) {
  if (!target || target === 'ALL' || target === 'TODOS') return true
  const a = normKpi(candidate)
  const b = normKpi(target)
  if (!a || !b) return false
  if (a === b) return true
  if (a.length >= 8 && b.length >= 8 && (a.startsWith(b) || b.startsWith(a))) return true
  const aWords = a.split(/\s+/).filter((w) => w.length >= 3)
  const bWords = b.split(/\s+/).filter((w) => w.length >= 3)
  if (aWords.length >= 2 && bWords.length >= 2) {
    return aWords.filter((w) => bWords.includes(w)).length >= 2
  }
  return a.includes(b) || b.includes(a)
}

function cleanMod(value) {
  const n = normKpi(value)
  if (n.includes('REMOTE') || n.includes('REMOTO') || n.includes('VIRTUAL')) return 'REMOTO'
  if (n.includes('PRESENC') || n.includes('AULA') || n.includes('SALA')) return 'PRESENCIAL'
  return n || ''
}

function cleanCond(value) {
  const n = normKpi(value)
  if (n.includes('PART')) return 'PART TIME'
  if (n.includes('FULL')) return 'FULL TIME'
  return n || ''
}

const TIPO_STATUS_JUNK = new Set([
  'ASISTIO', 'ASISTIO', 'OK', 'COMPLETO', 'PENDIENTE', 'DESISTE', 'NO PROCEDE',
  'USUARIO CREADO', 'NULL', 'SI', 'A', 'B', 'I-OP', 'IOP', 'ACTIVO', 'CESADO',
])

function cleanTipo(value) {
  const raw = String(value || '').trim()
  const n = normKpi(raw)
  if (!n || n === '-' ) return ''
  if (n.includes('AGREGADO CAP') || n.includes('AGREGADO_CAP')) return 'AGREGADO CAP'
  if (n.includes('RECUPERADO CAP') || n.includes('RECUPERO CAP') || n.includes('RECUPERADO_CAP') || n.includes('RECUPERO_CAP')) return 'RECUPERADO CAP'
  if (n.includes('AGREGADO')) return 'AGREGADO'
  if (n.includes('RECUPERADO') || n.includes('RECUPERO')) return 'RECUPERADO'
  if (n.includes('OBSERVAD')) return 'OBSERVADO'
  if (n === 'APTO') return 'APTO'
  if (n === 'REGULAR') return 'REGULAR'
  if (TIPO_STATUS_JUNK.has(n) || n.includes('ASIST')) return ''
  return raw
}

function resolveTipo(postulante, records = []) {
  const sources = [
    postulante?.tipo_reclutado,
    postulante?.tipoReclutado,
    postulante?.status_dia_1,
    ...records.map((r) => r.tipo_reclutado || r.tipoReclutado),
  ]
  for (const source of sources) {
    const tipo = cleanTipo(source)
    if (tipo) return tipo
  }
  return 'Sin tipo'
}

function indexGrupos(grupos = []) {
  const byCodeCamp = new Map()
  const byCode = new Map()
  for (const g of grupos || []) {
    const code = normKpi(g.codigo || g.grupo_codigo || g.grupo_capacitacion)
    if (!code) continue
    const camp = normKpi(g.campana || g.campana_nombre)
    byCode.set(code, g)
    if (camp) byCodeCamp.set(`${code}|${camp}`, g)
  }
  return { byCodeCamp, byCode }
}

function findGrupo(index, code, camp) {
  const c = normKpi(code)
  if (!c) return null
  const campKey = normKpi(camp)
  if (campKey && index.byCodeCamp.has(`${c}|${campKey}`)) return index.byCodeCamp.get(`${c}|${campKey}`)
  return index.byCode.get(c) || null
}

function mergeGrupoSources(grupos = [], campanasMetas = []) {
  const map = new Map()
  const put = (g) => {
    if (!g) return
    const code = normKpi(g.codigo || g.grupo_codigo || g.grupo_capacitacion)
    if (!code) return
    const camp = normKpi(g.campana || g.campana_nombre)
    const key = `${code}|${camp}`
    const prev = map.get(key) || {}
    const rqQ = num(g.rq_solicitado ?? g.requerimiento)
    const rqFte = num(g.rq_ftes_solicitado ?? g.rq_ftes)
    map.set(key, {
      ...prev,
      ...g,
      codigo: g.codigo || g.grupo_codigo || prev.codigo || prev.grupo_codigo,
      grupo_codigo: g.grupo_codigo || g.codigo || prev.grupo_codigo || prev.codigo,
      campana: g.campana || g.campana_nombre || prev.campana || prev.campana_nombre,
      rq_solicitado: rqQ > 0 ? rqQ : num(prev.rq_solicitado),
      rq_ftes_solicitado: rqFte > 0 ? rqFte : num(prev.rq_ftes_solicitado),
      formador_nombre: g.formador_nombre || g.formador || prev.formador_nombre || prev.formador,
    })
  }
  ;(campanasMetas || []).forEach(put)
  ;(grupos || []).forEach(put)
  return Array.from(map.values())
}

function hasSiglaA(records = []) {
  return (records || []).some((r) => {
    const s = String(r.sigla || r.sigla_asistencia || '').toUpperCase().trim()
    return s === 'A'
  })
}

function isIngresoOp(record) {
  const s = String(record?.sigla || record?.sigla_asistencia || record?.estado || '').toUpperCase()
  return s.includes('I-OP') || s.includes('IOP') || s.includes('INGRESO A OPERACION')
}

function indexAsistencias(asistencias = []) {
  const map = new Map()
  for (const a of asistencias || []) {
    const doc = String(a.postulante_documento || a.documento || '').trim()
    if (!doc) continue
    const code = normKpi(a.codigo_grupo || a.grupo_codigo || a.grupo)
    const camp = normKpi(a.campana)
    const keys = [`${doc}|${code}|${camp}`, `${doc}|${code}`, doc]
    for (const key of keys) {
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(a)
    }
  }
  return map
}

function recordsFor(index, doc, code, camp) {
  const c = normKpi(code)
  const campKey = normKpi(camp)
  return index.get(`${doc}|${c}|${campKey}`) || index.get(`${doc}|${c}`) || index.get(doc) || []
}

function isDescuento(row) {
  if (!row) return false
  if (row.isDescuento || row.is_descuento) return true
  const blob = `${row.estado || ''} ${row.motivo_baja || ''} ${row.motivo || ''} ${row.tipo_reclutado || ''} ${row.status_dia_1 || ''}`
  return blob.toUpperCase().includes('DESCUENTO')
}

function formadorName(grupo, records) {
  const fromGrupo = grupo?.formador_nombre || grupo?.formador || grupo?.nombre_formador || grupo?.responsable
  if (fromGrupo && !isJunkFormador(fromGrupo)) return String(fromGrupo).trim()
  for (const a of records) {
    const name = a.nombre_formador || a.formador_nombre || a.formador
    if (name && !isJunkFormador(name)) return String(name).trim()
  }
  return String(fromGrupo || '').trim()
}

function buildPeople(postulantes = [], asistencias = [], grupos = []) {
  const gIndex = indexGrupos(grupos)
  const aIndex = indexAsistencias(asistencias)
  const unique = new Map()

  for (const p of postulantes || []) {
    const doc = String(p.documento || p.postulante_documento || '').trim()
    if (!doc) continue
    const code = p.grupo_codigo || p.codigo_grupo || p.grupo
    const camp = p.campana
    const grupo = findGrupo(gIndex, code, camp)
    if (!grupo) continue

    const records = recordsFor(aIndex, doc, code, camp)
    const formador = formadorName(grupo, records)
    const periodo = resolvePeriodoIngreso(grupo) || normalize2026Period(p.periodo_ingreso_op || p.periodo_reclutado) || ''
    if (!isPeriodoFormadorActivo(periodo)) continue
    const semana = Number(grupo.semana_trabajo || String(grupo.semana_label || p.semana_trabajo || '').replace(/\D/g, '') || 0) || null
    const fechaOjt = parseFechaAsistencia(grupo.fecha_inicio_ojt || p.fecha_conexion_ojt)
    const cond = cleanCond(p.condicion || p.condicion_laboral || records[0]?.condicion_laboral)
    const modalidad = cleanMod(grupo.modalidad || p.modalidad)
    const tipoReclutado = resolveTipo(p, records)

    const sorted = [...records].sort((a, b) => {
      const da = parseFechaAsistencia(a.fecha_registro_asistencia || a.fecha_asistencia || a.fecha) || ''
      const db = parseFechaAsistencia(b.fecha_registro_asistencia || b.fecha_asistencia || b.fecha) || ''
      return da.localeCompare(db)
    })
    const last = sorted[sorted.length - 1]
    const descuento = isDescuento(p) || isDescuento(last)
    const bajaD1 = !descuento && (
      isBajaDia1(p.dia_1_obs || p.motivo_baja, p.status_dia_1 || p.sigla, p) ||
      (last && isBajaDia1(last.motivo_baja, last.sigla || last.sigla_asistencia, last))
    )

    const iopRecord = sorted.find((r) => isIngresoOp(r))
    const iop = Boolean(iopRecord) && !bajaD1 && !descuento
    const iopDate = iopRecord
      ? parseFechaAsistencia(iopRecord.fecha_registro_asistencia || iopRecord.fecha_asistencia || iopRecord.fecha)
      : ''

    const dia1 = !bajaD1 && !descuento && hasSiglaA(records)

    let fechaBaja = ''
    let motivo = ''
    let bajaFormacion = false
    if (!descuento && last && isBajaCapacitacion(last)) {
      bajaFormacion = true
      fechaBaja = parseFechaAsistencia(last.fecha_registro_asistencia || last.fecha_asistencia || last.fecha)
      motivo = String(last.motivo_baja || last.motivo || 'BAJA').trim()
    } else if (!descuento && !bajaD1 && isBajaCapacitacion(p)) {
      bajaFormacion = true
      motivo = String(p.motivo_baja || p.dia_1_obs || 'BAJA').trim()
    }

    const attendedOjt = records.some((r) => {
      const sigla = String(r.sigla || r.sigla_asistencia || '').toUpperCase().trim()
      const present = sigla === 'A' || sigla === 'FJ' || sigla === 'OJT' || sigla === 'I-OP' || sigla === 'CAPACITACION'
      if (!present) return false
      const rDate = parseFechaAsistencia(r.fecha_registro_asistencia || r.fecha_asistencia || r.fecha)
      if (fechaOjt) return Boolean(rDate && rDate >= fechaOjt)
      return sigla === 'OJT' || sigla === 'I-OP'
    }) || Boolean(iop && (!fechaOjt || !iopDate || iopDate >= fechaOjt))

    const bajaOjt = Boolean(dia1 && bajaFormacion && fechaOjt && fechaBaja && fechaBaja >= fechaOjt)
    const bajaCt = Boolean(dia1 && bajaFormacion && !bajaD1 && !descuento && !bajaOjt)
    const ojt = Boolean(dia1 && (attendedOjt || iop || bajaOjt))

    const segmento = String(grupo.segmento || p.segmento || 'SIN SEGMENTO').trim()
    const campana = String(grupo.campana || grupo.campana_nombre || camp || '').trim()
    const grupoCodigo = String(grupo.codigo || grupo.grupo_codigo || code || '').trim()
    const rqQ = num(grupo.rq_solicitado ?? grupo.requerimiento)
    const rqFte = num(grupo.rq_ftes_solicitado ?? grupo.rq_ftes)

    const row = {
      documento: doc,
      formador: formador || 'Sin formador',
      periodo,
      semana,
      segmento,
      campana,
      grupo: grupoCodigo,
      aulaKey: `${periodo}|${semana || ''}|${normKpi(segmento)}|${normKpi(campana)}|${normKpi(grupoCodigo)}`,
      rqQ,
      rqFte,
      modalidad,
      condicion: cond,
      tipoReclutado,
      dia1: dia1 ? 1 : 0,
      ojt: ojt ? 1 : 0,
      iop: iop ? 1 : 0,
      iopFtes: iop ? resolveFteWeight(cond, p.condicion, p.condicion_laboral) : 0,
      bajaCt: bajaCt ? 1 : 0,
      bajaOjt: bajaOjt ? 1 : 0,
      motivo: (bajaCt || bajaOjt) ? motivo : '',
      etapaBaja: bajaOjt ? 'OJT' : (bajaCt ? 'CT' : ''),
    }

    const personKey = `${doc}|${row.aulaKey}`
    const prev = unique.get(personKey)
    if (!prev) {
      unique.set(personKey, row)
      continue
    }
    unique.set(personKey, {
      ...prev,
      dia1: Math.max(prev.dia1, row.dia1),
      ojt: Math.max(prev.ojt, row.ojt),
      iop: Math.max(prev.iop, row.iop),
      iopFtes: Math.max(prev.iopFtes, row.iopFtes),
      bajaCt: Math.max(prev.bajaCt, row.bajaCt),
      bajaOjt: Math.max(prev.bajaOjt, row.bajaOjt),
      motivo: row.motivo || prev.motivo,
      etapaBaja: row.etapaBaja || prev.etapaBaja,
    })
  }

  return Array.from(unique.values())
}

export function filterFormadorRows(rows, filters = {}) {
  const {
    periodo = 'ALL',
    semana = 'ALL',
    segmento = 'ALL',
    campana = 'ALL',
    grupo = 'ALL',
    formador = 'ALL',
    modalidad = 'ALL',
    condicion = 'ALL',
  } = filters

  return (rows || []).filter((row) => {
    if (!isPeriodoFormadorActivo(row.periodo)) return false
    if (periodo !== 'ALL' && String(row.periodo) !== String(periodo)) return false
    if (semana !== 'ALL' && Number(row.semana) !== Number(semana)) return false
    if (segmento !== 'ALL' && normKpi(row.segmento) !== normKpi(segmento)) return false
    if (campana !== 'ALL' && normKpi(row.campana) !== normKpi(campana)) return false
    if (grupo !== 'ALL' && normKpi(row.grupo) !== normKpi(grupo)) return false
    if (formador !== 'ALL' && !matchName(row.formador, formador)) return false
    if (modalidad !== 'ALL' && cleanMod(row.modalidad) !== cleanMod(modalidad)) return false
    if (condicion !== 'ALL' && cleanCond(row.condicion) !== cleanCond(condicion)) return false
    return true
  })
}

export function buildFilterOptions(rows) {
  const periodos = new Set()
  const semanas = new Set()
  const segmentos = new Set()
  const campanas = new Set()
  const grupos = new Set()
  const formadores = new Set()
  const modalidades = new Set()
  const condiciones = new Set()

  ;(rows || []).forEach((row) => {
    if (row.periodo) periodos.add(String(row.periodo))
    if (row.semana != null) semanas.add(Number(row.semana))
    if (row.segmento) segmentos.add(String(row.segmento).trim())
    if (row.campana) campanas.add(String(row.campana).trim())
    if (row.grupo) grupos.add(String(row.grupo).trim())
    if (row.formador && !isJunkFormador(row.formador)) formadores.add(String(row.formador).trim())
    if (row.modalidad) modalidades.add(cleanMod(row.modalidad))
    if (row.condicion) condiciones.add(cleanCond(row.condicion))
  })

  return {
    periodos: Array.from(periodos).sort((a, b) => b.localeCompare(a)),
    semanas: Array.from(semanas).sort((a, b) => a - b),
    segmentos: Array.from(segmentos).sort((a, b) => a.localeCompare(b)),
    campanas: Array.from(campanas).sort((a, b) => a.localeCompare(b)),
    grupos: Array.from(grupos).sort((a, b) => a.localeCompare(b)),
    formadores: Array.from(formadores).sort((a, b) => a.localeCompare(b)),
    modalidades: Array.from(modalidades).filter(Boolean).sort(),
    condiciones: Array.from(condiciones).filter(Boolean).sort(),
  }
}

export function resolveLockedFormador(rows, userProfile) {
  const candidates = [
    userProfile?.nombre_completo,
    userProfile?.nombre,
    userProfile?.alias,
  ].filter(Boolean)
  const names = Array.from(new Set((rows || []).map((r) => String(r.formador || '').trim()).filter(Boolean)))
  for (const cand of candidates) {
    const hit = names.find((n) => matchName(n, cand))
    if (hit) return hit
  }
  return null
}

export function semaforoDesercion(pctValue) {
  const value = num(pctValue)
  if (value < 38.4) return 'VERDE'
  if (value <= 40) return 'AMBAR'
  return 'ROJO'
}

export function semaforoDotacion(pctValue) {
  const value = num(pctValue)
  if (value >= 95) return 'VERDE'
  if (value >= 80) return 'AMBAR'
  return 'ROJO'
}

export function semaforoIngresoOp(pctValue) {
  const value = num(pctValue)
  if (value >= 90) return 'VERDE'
  if (value >= 80) return 'AMBAR'
  return 'ROJO'
}

function semaforoAula(aula) {
  if (!aula.formador || isJunkFormador(aula.formador) || !aula.dia1) return 'CRITICO'
  return semaforoDesercion(aula.pctDesercion)
}

function semaforoCaida(row) {
  if (!row.dia1) return 'CRITICO'
  return semaforoDesercion(row.pctDesercion)
}

export function buildFormadorPeople(postulantes, asistencias, grupos, campanasMetas) {
  return buildPeople(postulantes, asistencias, mergeGrupoSources(grupos, campanasMetas))
}

function emptyTotals() {
  return { dia1: 0, ojt: 0, iop: 0, iopFtes: 0, desercion: 0, bajaCt: 0, bajaOjt: 0, rqQ: 0, rqFte: 0 }
}

function addPersonTotals(acc, row) {
  acc.dia1 += row.dia1
  acc.ojt += row.ojt
  acc.iop += row.iop
  acc.iopFtes += row.iopFtes
  acc.bajaCt += row.bajaCt
  acc.bajaOjt += row.bajaOjt
  acc.desercion += row.bajaCt + row.bajaOjt
}

function addUniqueRq(seen, acc, row) {
  const key = row.aulaKey
  if (!key || seen.has(key)) return
  seen.add(key)
  acc.rqQ += num(row.rqQ)
  acc.rqFte += num(row.rqFte)
}

function packGauge(acc, nombre = 'Corte') {
  return {
    nombre,
    ...acc,
    pctDesercion: pct(acc.desercion, acc.dia1),
    pctIngresoPers: pct(acc.iop, acc.rqQ),
    pctIngresoFte: pct(acc.iopFtes, acc.rqFte),
    pctDotacion: pct(acc.iopFtes, acc.rqFte),
    pctOjtD1: pct(acc.ojt, acc.dia1),
    pctD1Rq: pct(acc.dia1, acc.rqQ),
  }
}

export const GAUGE_METRICS = {
  desercion: {
    id: 'desercion',
    label: 'Deserción',
    valueKey: 'pctDesercion',
    partKey: 'desercion',
    totalKey: 'dia1',
    partLabel: 'bajas CT+OJT',
    totalLabel: 'Día 1 (sigla A)',
    matrixKey: 'pctDesercion',
    invert: true,
    semaforo: 'desercion',
  },
  ingresosPers: {
    id: 'ingresosPers',
    label: 'Ingresos pers.',
    valueKey: 'pctIngresoPers',
    partKey: 'iop',
    totalKey: 'rqQ',
    partLabel: 'I-OP pers.',
    totalLabel: 'RQ Q',
    matrixKey: 'pctOp',
    invert: false,
    semaforo: 'ingresoOp',
  },
  dotacion: {
    id: 'dotacion',
    label: 'Dotación',
    valueKey: 'pctDotacion',
    partKey: 'iopFtes',
    totalKey: 'rqFte',
    partLabel: 'I-OP FTE',
    totalLabel: 'RQ FTES',
    matrixKey: 'pctDotacion',
    invert: false,
    digits: 1,
    semaforo: 'dotacion',
  },
}

function emptyCell(key) {
  return {
    key,
    empty: true,
    dia1: 0,
    desercion: 0,
    iop: 0,
    iopFtes: 0,
    rqQ: 0,
    rqFte: 0,
    aulas: 0,
    pctDesercion: 0,
    pctDotacion: 0,
    pctOp: 0,
    pctFte: 0,
  }
}

function packMatrixCell(key, raw) {
  if (!raw) return emptyCell(key)
  const iopFtes = Math.round(num(raw.iopFtes) * 10) / 10
  return {
    key,
    empty: raw.dia1 === 0 && raw.iop === 0 && raw.desercion === 0 && iopFtes === 0,
    dia1: raw.dia1,
    desercion: raw.desercion,
    iop: raw.iop,
    iopFtes,
    rqQ: raw.rqQ,
    rqFte: raw.rqFte,
    aulas: raw.aulas || 0,
    pctDesercion: pct(raw.desercion, raw.dia1),
    pctDotacion: pct(raw.iopFtes, raw.rqFte),
    pctOp: pct(raw.iop, raw.rqQ),
    pctFte: pct(raw.iopFtes, raw.rqFte),
  }
}

function buildTimeMatrix(people, axis) {
  const colMap = new Map()
  const formadorTot = new Map()
  const formadorAulas = new Map()
  const cells = new Map()
  const cellRq = new Map()
  const cellAulas = new Map()

  people.forEach((row) => {
    if (isJunkFormador(row.formador)) return
    const colKey = axis === 'semana'
      ? (row.semana == null ? '' : String(row.semana))
      : String(row.periodo || '')
    if (!colKey) return

    if (!colMap.has(colKey)) {
      colMap.set(colKey, {
        key: colKey,
        label: axis === 'semana' ? `Sem ${colKey}` : colKey,
        sort: axis === 'semana' ? Number(colKey) : colKey,
      })
    }

    if (!formadorTot.has(row.formador)) {
      formadorTot.set(row.formador, { nombre: row.formador, dia1: 0, iop: 0, iopFtes: 0 })
      formadorAulas.set(row.formador, new Set())
    }
    const tot = formadorTot.get(row.formador)
    tot.dia1 += row.dia1
    tot.iop += row.iop
    tot.iopFtes += row.iopFtes
    if (row.aulaKey) formadorAulas.get(row.formador).add(row.aulaKey)

    const cellKey = `${row.formador}|${colKey}`
    if (!cells.has(cellKey)) cells.set(cellKey, { dia1: 0, desercion: 0, iop: 0, iopFtes: 0, rqQ: 0, rqFte: 0, aulas: 0 })
    const cell = cells.get(cellKey)
    cell.dia1 += row.dia1
    cell.desercion += row.bajaCt + row.bajaOjt
    cell.iop += row.iop
    cell.iopFtes += row.iopFtes
    if (!cellRq.has(cellKey)) cellRq.set(cellKey, new Set())
    addUniqueRq(cellRq.get(cellKey), cell, row)
    if (!cellAulas.has(cellKey)) cellAulas.set(cellKey, new Set())
    if (row.aulaKey) cellAulas.get(cellKey).add(row.aulaKey)
  })

  cellAulas.forEach((set, cellKey) => {
    const cell = cells.get(cellKey)
    if (cell) cell.aulas = set.size
  })

  const columns = Array.from(colMap.values()).sort((a, b) => {
    if (typeof a.sort === 'number' && typeof b.sort === 'number') return a.sort - b.sort
    return String(a.sort).localeCompare(String(b.sort))
  })

  const rows = Array.from(formadorTot.values())
    .sort((a, b) => b.dia1 - a.dia1 || b.iop - a.iop)
    .map((f) => ({
      nombre: f.nombre,
      aulas: formadorAulas.get(f.nombre)?.size || 0,
      iopFtes: f.iopFtes,
      cells: columns.map((col) => packMatrixCell(col.key, cells.get(`${f.nombre}|${col.key}`))),
    }))

  return { columns, rows }
}

export function buildFormadorModel(rows) {
  const people = (rows || []).filter((r) => r.dia1 || r.iop)
  const corteAcc = emptyTotals()
  const corteRq = new Set()
  people.forEach((row) => {
    addPersonTotals(corteAcc, row)
    addUniqueRq(corteRq, corteAcc, row)
  })

  const totals = {
    ...corteAcc,
    pctOjtD1: pct(corteAcc.ojt, corteAcc.dia1),
    pctOpOjt: pct(corteAcc.iop, corteAcc.ojt),
    pctEfectividad: pct(corteAcc.iop, corteAcc.dia1),
    pctDesercion: pct(corteAcc.desercion, corteAcc.dia1),
    pctDesercionCt: pct(corteAcc.bajaCt, corteAcc.dia1),
    pctDesercionOjt: pct(corteAcc.bajaOjt, corteAcc.ojt),
    pctIngresoPers: pct(corteAcc.iop, corteAcc.rqQ),
    pctIngresoFte: pct(corteAcc.iopFtes, corteAcc.rqFte),
  }

  const formadorMap = new Map()
  const formadorRq = new Map()
  people.forEach((row) => {
    if (isJunkFormador(row.formador)) return
    if (!formadorMap.has(row.formador)) {
      formadorMap.set(row.formador, { nombre: row.formador, ...emptyTotals(), aulas: 0 })
      formadorRq.set(row.formador, new Set())
    }
    const f = formadorMap.get(row.formador)
    addPersonTotals(f, row)
    addUniqueRq(formadorRq.get(row.formador), f, row)
  })
  const aulasPorFormador = new Map()
  people.forEach((row) => {
    if (isJunkFormador(row.formador)) return
    const key = `${row.formador}|${row.grupo}|${row.campana}|${row.semana}`
    if (!aulasPorFormador.has(key)) {
      aulasPorFormador.set(key, row.formador)
      const f = formadorMap.get(row.formador)
      if (f) f.aulas += 1
    }
  })

  const formadores = Array.from(formadorMap.values()).map((f) => {
    const packed = {
      ...f,
      pctDesercion: pct(f.desercion, f.dia1),
      pctEfectividad: pct(f.iop, f.dia1),
      pctIngresoPers: pct(f.iop, f.rqQ),
      pctIngresoFte: pct(f.iopFtes, f.rqFte),
    }
    packed.semaforo = semaforoCaida(packed)
    return packed
  }).sort((a, b) => b.iop - a.iop || a.pctDesercion - b.pctDesercion)

  const alertasCaidas = formadores
    .filter((f) => f.desercion > 0)
    .slice()
    .sort((a, b) => {
      const order = { ROJO: 0, AMBAR: 1, VERDE: 2, CRITICO: 3 }
      return (order[a.semaforo] - order[b.semaforo]) || (b.pctDesercion - a.pctDesercion) || (b.desercion - a.desercion)
    })

  const gauges = {
    corte: packGauge(corteAcc, 'Corte'),
    formadores: Object.fromEntries(formadores.map((f) => [f.nombre, packGauge(f, f.nombre)])),
  }

  const weeklyMap = new Map()
  const periodMap = new Map()
  people.forEach((row) => {
    if (row.semana != null) {
      if (!weeklyMap.has(row.semana)) {
        weeklyMap.set(row.semana, { semana: row.semana, label: `Sem ${row.semana}`, dia1: 0, ojt: 0, iop: 0, desercion: 0 })
      }
      const w = weeklyMap.get(row.semana)
      w.dia1 += row.dia1
      w.ojt += row.ojt
      w.iop += row.iop
      w.desercion += row.bajaCt + row.bajaOjt
    }
    if (row.periodo) {
      if (!periodMap.has(row.periodo)) {
        periodMap.set(row.periodo, { periodo: row.periodo, label: row.periodo, dia1: 0, ojt: 0, iop: 0, desercion: 0 })
      }
      const p = periodMap.get(row.periodo)
      p.dia1 += row.dia1
      p.ojt += row.ojt
      p.iop += row.iop
      p.desercion += row.bajaCt + row.bajaOjt
    }
  })

  const tipoMap = new Map()
  people.forEach((row) => {
    const t = row.tipoReclutado || 'Sin tipo'
    tipoMap.set(t, (tipoMap.get(t) || 0) + 1)
  })
  const tipos = Array.from(tipoMap.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)

  const motivoMap = new Map()
  people.forEach((row) => {
    if (!row.motivo || (!row.bajaCt && !row.bajaOjt)) return
    const key = `${row.etapaBaja}|${row.motivo}`
    if (!motivoMap.has(key)) {
      motivoMap.set(key, { nombre: row.motivo, etapa: row.etapaBaja, value: 0 })
    }
    motivoMap.get(key).value += 1
  })
  const motivos = Array.from(motivoMap.values()).sort((a, b) => b.value - a.value)

  const aulaMap = new Map()
  people.forEach((row) => {
    const key = `${row.grupo}|${row.campana}|${row.semana}|${row.periodo}`
    if (!aulaMap.has(key)) {
      aulaMap.set(key, {
        key,
        grupo: row.grupo,
        campana: row.campana,
        segmento: row.segmento,
        semana: row.semana,
        periodo: row.periodo,
        formador: row.formador,
        modalidad: row.modalidad,
        dia1: 0, ojt: 0, iop: 0, bajaCt: 0, bajaOjt: 0,
      })
    }
    const a = aulaMap.get(key)
    a.dia1 += row.dia1
    a.ojt += row.ojt
    a.iop += row.iop
    a.bajaCt += row.bajaCt
    a.bajaOjt += row.bajaOjt
  })
  const aulas = Array.from(aulaMap.values()).map((a) => {
    const desercion = a.bajaCt + a.bajaOjt
    const packed = {
      ...a,
      desercion,
      pctEfectividad: pct(a.iop, a.dia1),
      pctDesercion: pct(desercion, a.dia1),
    }
    packed.semaforo = semaforoAula(packed)
    return packed
  }).sort((a, b) => {
    const order = { CRITICO: 0, ROJO: 1, AMBAR: 2, VERDE: 3 }
    return (order[a.semaforo] - order[b.semaforo]) || (b.pctDesercion - a.pctDesercion)
  })

  const matrixWeek = buildTimeMatrix(people, 'semana')
  const matrixPeriod = buildTimeMatrix(people, 'periodo')

  return {
    totals,
    gauges,
    formadores,
    alertasCaidas,
    weekly: Array.from(weeklyMap.values()).sort((a, b) => a.semana - b.semana),
    periods: Array.from(periodMap.values()).sort((a, b) => a.periodo.localeCompare(b.periodo)),
    matrixWeek,
    matrixPeriod,
    tipos,
    motivos,
    aulas,
    funnel: [
      { nombre: 'Día 1 capacitación', d1Show: totals.dia1 },
      { nombre: 'Pasaron a OJT', d1Show: totals.ojt },
      { nombre: 'Ingreso OP', d1Show: totals.iop },
    ],
    fuga: [
      { nombre: 'Partida · Día 1', d1Show: totals.dia1 },
      { nombre: 'Baja en capacitación', d1Show: totals.bajaCt },
      { nombre: 'Baja en OJT', d1Show: totals.bajaOjt },
      { nombre: 'Quedaron en operación', d1Show: totals.iop },
    ],
  }
}
