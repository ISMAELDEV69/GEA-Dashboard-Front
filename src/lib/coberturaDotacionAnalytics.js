/**
 * Cobertura de Dotación — motor gerencial (réplica Power BI).
 *
 * Fuente canónica: tabla public.cobertura_dotacion
 * Unidades: Personas (RQ_Q), FT (RQ_FTES), Capacidad (RQ_CAPACIDAD).
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

export const MODALIDADES = ['PRESENCIAL', 'REMOTO']
export const CONDICIONES = ['FULL TIME', 'PART TIME']

export function normalizeCondicionLaboral(raw) {
  const s = cleanUpper(raw)
  if (s.includes('PART')) return 'PART TIME'
  if (s.includes('FULL')) return 'FULL TIME'
  return 'FULL TIME'
}

export function condicionLabel(condicion) {
  if (condicion === 'PART TIME') return 'Part time'
  return 'Full time'
}

export const METRIC_TIPOS = [
  { id: 'ftes', label: 'FT' },
  { id: 'personas', label: 'Personas' },
  { id: 'capacidad', label: 'Capacidad' },
]

export function metricDecimals(tipo) {
  return tipo === 'personas' ? 0 : 2
}

export function metricUnitLabel(tipo) {
  if (tipo === 'personas') return 'Personas'
  if (tipo === 'capacidad') return 'Capacidad'
  return 'FT'
}

export function normalizeMetricTipo(tipo) {
  if (tipo === 'personas' || tipo === 'capacidad') return tipo
  return 'ftes'
}

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
  if (s.includes('REM')) return 'REMOTO'
  if (s.includes('PRES') || s.includes('HIB')) return 'PRESENCIAL'
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

/** Última FECHA_INGRESO_OP (fallback created_at) en la ventana periodo/semana. */
export function corteIsoForWindow(rows = [], { periodo = '', semana = '' } = {}) {
  let max = ''
  for (const r of rows) {
    if (periodo && r.periodo !== periodo) continue
    if (semana && r.semana !== semana) continue
    const iso = String(r.fecha || '').slice(0, 10)
    if (iso && iso > max) max = iso
  }
  return max
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

export function coberturaStatus(pct) {
  const n = Number(pct) || 0
  if (n >= 100) return 'CUBIERTO'
  if (n >= 80) return 'OBSERVADO'
  return 'BRECHA'
}

export function coberturaTone(pct) {
  const n = Number(pct) || 0
  if (n >= 100) return 'ok'
  if (n >= 80) return 'warn'
  return 'bad'
}

export function shortCampanaLabel(name, max = 22) {
  const s = String(name || '').trim()
  if (s.length <= max) return s
  return `${s.slice(0, max - 1)}…`
}

export function topCampanasForChart(campanas = [], limit = 10) {
  const list = Array.isArray(campanas) ? campanas : []
  if (list.length <= limit) {
    return list.map((s) => ({ ...s, campanaShort: s.campanaShort || shortCampanaLabel(s.campana), isOtras: false }))
  }
  const top = list.slice(0, limit)
  const rest = list.slice(limit)
  const other = rest.reduce((acc, r) => {
    acc.requerimiento += Number(r.requerimiento) || 0
    acc.ingresos += Number(r.ingresos) || 0
    return acc
  }, { campana: 'OTRAS', requerimiento: 0, ingresos: 0 })
  const otherRates = {
    campana: 'OTRAS',
    campanaShort: 'OTRAS',
    isOtras: true,
    requerimiento: round2(other.requerimiento),
    ingresos: round2(other.ingresos),
    coberturaPct: round2(coberturaPct(other.ingresos, other.requerimiento)),
    brecha: brechaVal(other.ingresos, other.requerimiento),
  }
  return [
    ...top.map((s) => ({ ...s, campanaShort: s.campanaShort || shortCampanaLabel(s.campana), isOtras: false })),
    otherRates,
  ]
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

function numCol(row, ...names) {
  const n = Number(pickCol(row, ...names))
  return Number.isFinite(n) ? n : 0
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
  if (!s) return ''
  if (s.includes('CERR')) return 'CERRADO'
  if (s.includes('CURSO') || s === 'ACTIVO') return 'EN CURSO'
  if (s.includes('PLAN')) return 'PLANIFICADO'
  return s
}

export function buildCapacidadIndex(capacidadRows = []) {
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
    const segmento = normalizeCampanaKey(g.segmento)
    const week = normalizeWeekKey(g.semana_label || g.semana_trabajo || g.semana)
    const periodoOp = normalize2026Period(g.periodo_ingreso_op) || ''
    const periodo = normalize2026Period(g.periodo) || ''
    if (!grupo || !campana) continue

    const bind = (periodoKey) => {
      if (!periodoKey) return
      if (week && segmento) push(exact, `${periodoKey}|${week}|${campana}|${segmento}|${grupo}`, g)
      if (week) push(exact, `${periodoKey}|${week}|${campana}|${grupo}`, g)
      if (segmento) push(noWeek, `${periodoKey}|${campana}|${segmento}|${grupo}`, g)
      push(noWeek, `${periodoKey}|${campana}|${grupo}`, g)
    }
    bind(periodoOp)
    bind(periodo)
  }

  return { exact, noWeek }
}

export function matchCapacidad(index, row) {
  const grupo = normalizeGrupoKey(row.gpe)
  const campana = normalizeCampanaKey(row.campana)
  const segmento = normalizeCampanaKey(row.segmento)
  const week = normalizeWeekKey(row.semana)
  const periodo = row.periodo
  if (!grupo || !campana || !periodo) return null
  const tries = []
  if (week && segmento) tries.push(index.exact.get(`${periodo}|${week}|${campana}|${segmento}|${grupo}`))
  if (week) tries.push(index.exact.get(`${periodo}|${week}|${campana}|${grupo}`))
  if (segmento) tries.push(index.noWeek.get(`${periodo}|${campana}|${segmento}|${grupo}`))
  tries.push(index.noWeek.get(`${periodo}|${campana}|${grupo}`))
  return tries.find(Boolean) || null
}

function pushCell(bucket, keyParts, amount, field) {
  const key = keyParts.join('|')
  let row = bucket.get(key)
  if (!row) {
    row = {
      periodo: keyParts[0],
      semana: keyParts[1],
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

export function metricsForTipo(row, tipo = 'ftes') {
  const unit = normalizeMetricTipo(tipo)
  if (unit === 'personas') {
    return {
      requerimiento: Number(row.rqQ) || 0,
      ingresos: Number(row.ingQ) || 0,
      proyeccion: Number(row.proyQ) || 0,
    }
  }
  if (unit === 'capacidad') {
    return {
      requerimiento: Number(row.rqCap) || 0,
      ingresos: Number(row.ingCap) || 0,
      proyeccion: Number(row.proyCap) || 0,
    }
  }
  return {
    requerimiento: Number(row.rqFtes) || 0,
    ingresos: Number(row.ingFtes) || 0,
    proyeccion: Number(row.proyFtes) || 0,
  }
}

export function normalizeCoberturaFact(raw) {
  const periodo = normalize2026Period(pickCol(raw, 'PERIODO', 'periodo')) || clean(pickCol(raw, 'PERIODO', 'periodo'))
  const rqQ = round2(numCol(raw, 'RQ_Q', 'rq_q'))
  const rqFtes = round2(numCol(raw, 'RQ_FTES', 'rq_ftes'))
  const rqCap = round2(numCol(raw, 'RQ_CAPACIDAD', 'rq_capacidad'))
  const ingQ = round2(numCol(raw, 'INGRESOS_Q', 'ingresos_q'))
  const ingFtes = round2(numCol(raw, 'INGRESOS_FTES', 'ingresos_ftes'))
  const ingCap = round2(numCol(raw, 'INGRESOS_CAPACIDAD', 'ingresos_capacidad'))
  const proyQ = round2(numCol(raw, 'PROY_INGRESOS_Q', 'proy_ingresos_q'))
  const proyFtes = round2(numCol(raw, 'PROY_INGRESOS_FTES', 'proy_ingresos_ftes'))
  const proyCap = round2(numCol(raw, 'PROY_INGRESOS_CAPACIDAD', 'proy_ingresos_capacidad'))
  const hasAmount = Boolean(rqQ || rqFtes || rqCap || ingQ || ingFtes || ingCap || proyQ || proyFtes || proyCap)
  return {
    periodo,
    semana: clean(pickCol(raw, 'SEMANA', 'semana')) || 'SIN SEMANA',
    segmento: clean(pickCol(raw, 'SEGMENTO', 'segmento')) || 'SIN SEGMENTO',
    campana: clean(pickCol(raw, 'CAMPAÑA', 'CAMPANA', 'campaña', 'campana')) || 'Sin Campaña',
    modalidad: normalizeModalidadDotacion(pickCol(raw, 'MODALIDAD_TRABAJO', 'modalidad_trabajo', 'modalidad')),
    gpe: cleanUpper(pickCol(raw, 'GPE', 'gpe')),
    condicion: normalizeCondicionLaboral(pickCol(raw, 'CONDICION_LABORAL', 'condicion_laboral', 'condicion')),
    rqQ,
    rqFtes,
    rqCap,
    ingQ,
    ingFtes,
    ingCap,
    proyQ,
    proyFtes,
    proyCap,
    dia1: round2(numCol(raw, 'Q_DIA_1', 'q_dia_1')),
    actuales: round2(numCol(raw, 'ACTUALES', 'actuales')),
    fecha: clean(pickCol(raw, 'FECHA_INGRESO_OP', 'fecha_ingreso_op')).slice(0, 10),
    createdAt: clean(pickCol(raw, 'created_at')).slice(0, 10),
    hasAmount,
  }
}

export function normalizeCoberturaDotacionRow(raw) {
  const n = normalizeCoberturaFact(raw)
  const metrics = metricsForTipo(n, 'ftes')
  return {
    periodo: n.periodo,
    semana: n.semana,
    segmento: n.segmento,
    campana: n.campana,
    modalidad: n.modalidad,
    gpe: n.gpe,
    fecha: n.fecha,
    ...n,
    requerimiento: metrics.requerimiento,
    ingresos: metrics.ingresos,
  }
}

function uniqueSorted(values, locale = false) {
  const list = [...new Set(values.filter(Boolean))]
  return locale ? list.sort((a, b) => a.localeCompare(b, 'es')) : list.sort()
}

function defaultPeriodoFromRows(rows, getActivity) {
  const periodos = uniqueSorted(rows.map((r) => r.periodo))
  const currentYm = currentYearMonth()
  const activity = new Map()
  for (const r of rows) {
    const slot = activity.get(r.periodo) || { active: false }
    if (getActivity(r)) slot.active = true
    activity.set(r.periodo, slot)
  }
  const withData = periodos.filter((p) => activity.get(p)?.active && p <= currentYm)
  return withData.length
    ? withData[withData.length - 1]
    : (periodos.filter((p) => p <= currentYm).pop() || periodos[periodos.length - 1] || '')
}

export function buildCoberturaDotacionModelFromTable(tableRows = [], capacidadRows = []) {
  const index = buildCapacidadIndex(capacidadRows)
  const rows = []
  let corteIso = ''

  for (const raw of tableRows) {
    const n = normalizeCoberturaFact(raw)
    if (!n.periodo || !n.hasAmount) continue
    const cap = matchCapacidad(index, n)
    rows.push({
      ...n,
      estado: cap ? normalizeEstadoGrupo(cap.estado) : '',
    })
    if (n.fecha && n.fecha > corteIso) corteIso = n.fecha
  }

  rows.sort((a, b) => {
    if (a.periodo !== b.periodo) return a.periodo.localeCompare(b.periodo)
    if (a.segmento !== b.segmento) return a.segmento.localeCompare(b.segmento, 'es')
    if (a.semana !== b.semana) return a.semana.localeCompare(b.semana)
    return a.campana.localeCompare(b.campana, 'es')
  })

  return {
    rows,
    periodos: uniqueSorted(rows.map((r) => r.periodo)),
    semanas: uniqueSorted(rows.map((r) => r.semana)),
    segmentos: uniqueSorted(rows.map((r) => r.segmento), true),
    campanas: uniqueSorted(rows.map((r) => r.campana), true),
    estados: uniqueSorted(rows.map((r) => r.estado), true),
    corteIso,
    defaultPeriodo: defaultPeriodoFromRows(rows, (r) => r.hasAmount),
    totalFirstIops: 0,
    source: 'table',
  }
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
  if (filters.semana && row.semana !== filters.semana) return false
  if (filters.segmento && row.segmento !== filters.segmento) return false
  if (filters.campana && row.campana !== filters.campana) return false
  if (filters.estado && row.estado !== filters.estado) return false
  if (filters.condicion && row.condicion !== filters.condicion) return false
  const mods = filters.modalidades
  if (Array.isArray(mods) && mods.length > 0 && mods.length < MODALIDADES.length) {
    if (!mods.includes(row.modalidad)) return false
  }
  return true
}

function emptyTotals() {
  return { requerimiento: 0, ingresos: 0, proyeccion: 0, dia1: 0, coberturaPct: 0, brecha: 0 }
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
  }
}

function addInto(acc, row, tipo = 'ftes') {
  const metrics = metricsForTipo(row, tipo)
  acc.requerimiento += metrics.requerimiento
  acc.ingresos += metrics.ingresos
  acc.proyeccion += metrics.proyeccion
  acc.dia1 += Number(row.dia1) || 0
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
  const campanasChart = topCampanasForChart(campanas)

  const byPeriodoSemanaCampana = new Map()
  for (const r of periodFiltered) {
    const key = `${r.periodo}|${r.semana}|${r.campana}`
    let slot = byPeriodoSemanaCampana.get(key)
    if (!slot) {
      slot = { periodo: r.periodo, semana: r.semana, campana: r.campana, ...emptyTotals() }
      byPeriodoSemanaCampana.set(key, slot)
    }
    addInto(slot, r, tipo)
  }
  const tabla = [...byPeriodoSemanaCampana.values()]
    .map((s) => ({ ...withRates(s), periodo: s.periodo, semana: s.semana, campana: s.campana }))
    .sort((a, b) =>
      a.periodo.localeCompare(b.periodo)
      || a.semana.localeCompare(b.semana)
      || a.campana.localeCompare(b.campana, 'es')
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

  const jornadaSource = rows
    .filter((r) => matchesFilter(r, { ...filters, condicion: '' }))
    .filter((r) => !periodo || r.periodo === periodo)
  const byJornada = new Map(CONDICIONES.map((c) => [c, { condicion: c, ...emptyTotals() }]))
  for (const r of jornadaSource) {
    const cond = CONDICIONES.includes(r.condicion) ? r.condicion : 'FULL TIME'
    addInto(byJornada.get(cond), r, tipo)
  }
  const jornada = CONDICIONES.map((c) => {
    const rates = withRates(byJornada.get(c))
    return {
      ...rates,
      condicion: c,
      condicionLabel: condicionLabel(c),
      selected: Boolean(filters.condicion) && filters.condicion === c,
    }
  })

  const inPeriodo = rows.filter((r) => !periodo || r.periodo === periodo)
  const afterSemana = filters.semana ? inPeriodo.filter((r) => r.semana === filters.semana) : inPeriodo
  const afterSegmento = filters.segmento ? afterSemana.filter((r) => r.segmento === filters.segmento) : afterSemana
  const afterCampana = filters.campana ? afterSegmento.filter((r) => r.campana === filters.campana) : afterSegmento
  const corteIso = corteIsoForWindow(rows, { periodo, semana: filters.semana }) || model?.corteIso || ''

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
    jornada,
    ingresosModTotal: round2(ingresosModTotal),
    filterOptions: {
      periodos: model?.periodos || [],
      semanas: uniqueSorted(inPeriodo.map((r) => r.semana)),
      segmentos: uniqueSorted(afterSemana.map((r) => r.segmento), true),
      campanas: uniqueSorted(afterSegmento.map((r) => r.campana), true),
      estados: uniqueSorted(afterCampana.map((r) => r.estado), true),
    },
    corteIso,
    corteLabel: formatCorteDate(corteIso),
  }
}
