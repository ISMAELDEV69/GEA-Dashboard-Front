/**
 * Motor del tablero KPI reclutadores.
 * Fuente: public.kpi_reclutadores_consolidado
 * Grano: periodo + semana + segmento + campaña + grupo + responsable
 * RQ grupal se cuenta una vez por llave de grupo. Ingresos se suman por reclutador.
 */

export const JUNK_RESPONSABLES = new Set([
  'ADMIN',
  'RECLUTADOR',
  'SIN NOMINA',
  'SIN NÓMINA',
  'SIN ASIGNAR',
  'PE_VALDIVIARV',
])

export function normKpi(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
}

export function isJunkResponsable(name) {
  const n = normKpi(name)
  if (!n) return true
  if (JUNK_RESPONSABLES.has(n)) return true
  if (/^[A-Z]{2}_[A-Z0-9]+$/.test(n)) return true
  return false
}

export const MIN_PERIODO_RECLUTADOR = '202608'
export const MIN_SEMANA_RECLUTADOR = 31

export function isPeriodoReclutadorActivo(periodo) {
  const p = String(periodo || '').replace(/\D/g, '').slice(0, 6)
  return Boolean(p) && p >= MIN_PERIODO_RECLUTADOR
}

export function isSinNomina(row) {
  const n = normKpi(row?.responsable)
  return n === 'SIN NOMINA' || n === 'SIN NOMINA'
}

export function periodoIngreso(row) {
  const efectivo = String(row?.periodo_efectivo || '').replace(/\D/g, '').slice(0, 6)
  if (efectivo.length === 6) return efectivo
  const fecha = String(row?.fecha_ingreso_op || '').trim()
  const iso = fecha.match(/^(\d{4})-(\d{2})/)
  if (iso) return `${iso[1]}${iso[2]}`
  const digits = fecha.replace(/\D/g, '')
  if (digits.length >= 6) return digits.slice(0, 6)
  return String(row?.periodo_reclutado || '').replace(/\D/g, '').slice(0, 6)
}

export function groupKey(row) {
  return [
    row.periodo_reclutado || '',
    row.semana ?? '',
    normKpi(row.segmento),
    normKpi(row.campana),
    normKpi(row.grupo_g),
  ].join('|')
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

export function filterKpiRows(rows, filters = {}) {
  const {
    periodo = 'ALL',
    semana = 'ALL',
    segmento = 'ALL',
    campana = 'ALL',
    grupo = 'ALL',
    responsable = 'ALL',
    includeEmptyGroups = false,
  } = filters

  return (rows || []).filter((row) => {
    if (!isPeriodoReclutadorActivo(periodoIngreso(row))) return false
    if (!includeEmptyGroups && isSinNomina(row)) return false
    if (periodo !== 'ALL' && periodoIngreso(row) !== String(periodo)) return false
    if (semana !== 'ALL' && Number(row.semana) !== Number(semana)) return false
    if (segmento !== 'ALL' && normKpi(row.segmento) !== normKpi(segmento)) return false
    if (campana !== 'ALL' && normKpi(row.campana) !== normKpi(campana)) return false
    if (grupo !== 'ALL' && normKpi(row.grupo_g) !== normKpi(grupo)) return false
    if (responsable !== 'ALL' && !matchName(row.responsable, responsable)) return false
    return true
  })
}

export function buildFilterOptions(rows) {
  const periodos = new Set()
  const semanas = new Set()
  const segmentos = new Set()
  const campanas = new Set()
  const grupos = new Set()
  const responsables = new Set()

  ;(rows || []).forEach((row) => {
    const perIngreso = periodoIngreso(row)
    if (isPeriodoReclutadorActivo(perIngreso)) periodos.add(perIngreso)
    if (row.semana != null) semanas.add(Number(row.semana))
    if (row.segmento) segmentos.add(String(row.segmento).trim())
    if (row.campana) campanas.add(String(row.campana).trim())
    if (row.grupo_g) grupos.add(String(row.grupo_g).trim())
    if (row.responsable && !isSinNomina(row)) responsables.add(String(row.responsable).trim())
  })

  return {
    periodos: Array.from(periodos).sort((a, b) => b.localeCompare(a)),
    semanas: Array.from(semanas).sort((a, b) => a - b),
    segmentos: Array.from(segmentos).sort((a, b) => a.localeCompare(b)),
    campanas: Array.from(campanas).sort((a, b) => a.localeCompare(b)),
    grupos: Array.from(grupos).sort((a, b) => a.localeCompare(b)),
    responsables: Array.from(responsables).sort((a, b) => a.localeCompare(b)),
  }
}

function uniqueGroups(rows) {
  const map = new Map()
  rows.forEach((row) => {
    const key = groupKey(row)
    if (!map.has(key)) {
      map.set(key, {
        key,
        periodo: periodoIngreso(row),
        periodoCapa: row.periodo_reclutado,
        semana: Number(row.semana),
        segmento: row.segmento,
        campana: row.campana,
        grupo: row.grupo_g,
        modalidad: row.modalidad,
        fechaInicio: row.fecha_inicio,
        fechaIngresoOp: row.fecha_ingreso_op,
        estado: row.estado_grupo,
        rq: num(row.rq),
        rqFtes: num(row.rq_ftes),
        metaD0: num(row.meta_dia_0_individual) * Math.max(1, num(row.n_reclutadores)),
        metaD1: num(row.meta_dia_1_campana),
        nReclutadores: num(row.n_reclutadores),
        nomina: 0,
        dia0: 0,
        dia1: 0,
        iop: 0,
        iopFtes: 0,
        dia1Tope: 0,
        iopTope: 0,
        iopFtesTope: 0,
        reclutadores: [],
      })
    }
    const g = map.get(key)
    g.nomina += num(row.nomina)
    g.dia0 += num(row.dia_0)
    g.dia1 += num(row.dia_1)
    g.iop += num(row.dotacion_q)
    g.iopFtes += num(row.dotacion_ftes)
    g.dia1Tope += num(row.dia_1_tope)
    g.iopTope += num(row.dotacion_q_tope)
    g.iopFtesTope += num(row.dotacion_ftes_tope)
    if (!isSinNomina(row)) {
      g.reclutadores.push({
        nombre: row.responsable,
        rqIndividual: num(row.rq_individual),
        nomina: num(row.nomina),
        dia0: num(row.dia_0),
        dia1: num(row.dia_1),
        dia1Tope: num(row.dia_1_tope),
        iop: num(row.dotacion_q),
        iopTope: num(row.dotacion_q_tope),
        iopFtes: num(row.dotacion_ftes),
      })
    }
  })
  return Array.from(map.values())
}

export function semaforoGrupo(group, useTope = false) {
  if (!group.nReclutadores || group.reclutadores.length === 0) return 'CRITICO'
  const d1 = useTope ? group.dia1Tope : group.dia1
  const cobertura = pct(d1, group.rq)
  if (cobertura >= 80) return 'VERDE'
  if (cobertura >= 50) return 'AMBAR'
  return 'ROJO'
}

export function buildKpiModel(rows, { useTope = false, singleRecruiter = false } = {}) {
  const groups = uniqueGroups(rows)
  const recruiterMap = new Map()

  rows.forEach((row) => {
    if (isSinNomina(row) || isJunkResponsable(row.responsable)) return
    const name = String(row.responsable).trim()
    if (!recruiterMap.has(name)) {
      recruiterMap.set(name, {
        nombre: name,
        rq: 0,
        nomina: 0,
        dia0: 0,
        dia1: 0,
        dia1Tope: 0,
        iop: 0,
        iopTope: 0,
        iopFtes: 0,
        iopFtesTope: 0,
        grupos: 0,
      })
    }
    const rec = recruiterMap.get(name)
    rec.rq += num(row.rq_individual)
    rec.nomina += num(row.nomina)
    rec.dia0 += num(row.dia_0)
    rec.dia1 += num(row.dia_1)
    rec.dia1Tope += num(row.dia_1_tope)
    rec.iop += num(row.dotacion_q)
    rec.iopTope += num(row.dotacion_q_tope)
    rec.iopFtes += num(row.dotacion_ftes)
    rec.iopFtesTope += num(row.dotacion_ftes_tope)
    rec.grupos += 1
  })

  const recruiters = Array.from(recruiterMap.values()).map((rec) => {
    const d1 = useTope ? rec.dia1Tope : rec.dia1
    const iop = useTope ? rec.iopTope : rec.iop
    const desercion = Math.max(0, d1 - iop)
    return {
      ...rec,
      d1Show: d1,
      iopShow: iop,
      desercion,
      pctDesercion: pct(desercion, d1),
      pctD1Rq: pct(d1, rec.rq),
      pctNominaD1: pct(rec.dia1, rec.nomina),
      pctD1Op: pct(iop, rec.dia1),
    }
  }).sort((a, b) => b.iopShow - a.iopShow || b.d1Show - a.d1Show)

  const rq = singleRecruiter
    ? rows.reduce((acc, row) => acc + num(row.rq_individual), 0)
    : groups.reduce((acc, g) => acc + g.rq, 0)
  const rqFtes = singleRecruiter
    ? rows.reduce((acc, row) => acc + (num(row.n_reclutadores) > 0 ? num(row.rq_ftes) / num(row.n_reclutadores) : 0), 0)
    : groups.reduce((acc, g) => acc + g.rqFtes, 0)

  const totals = {
    grupos: groups.length,
    reclutadores: recruiters.length,
    rq,
    rqFtes,
    nomina: rows.reduce((acc, row) => acc + num(row.nomina), 0),
    dia0: rows.reduce((acc, row) => acc + num(row.dia_0), 0),
    dia1: rows.reduce((acc, row) => acc + num(row.dia_1), 0),
    dia1Tope: rows.reduce((acc, row) => acc + num(row.dia_1_tope), 0),
    iop: rows.reduce((acc, row) => acc + num(row.dotacion_q), 0),
    iopTope: rows.reduce((acc, row) => acc + num(row.dotacion_q_tope), 0),
    iopFtes: rows.reduce((acc, row) => acc + num(row.dotacion_ftes), 0),
    iopFtesTope: rows.reduce((acc, row) => acc + num(row.dotacion_ftes_tope), 0),
  }

  totals.d1Show = useTope ? totals.dia1Tope : totals.dia1
  totals.iopShow = useTope ? totals.iopTope : totals.iop
  totals.pctD1Rq = pct(totals.d1Show, totals.rq)
  totals.pctOpRq = pct(totals.iopShow, totals.rq)
  totals.pctNominaD1 = pct(totals.dia1, totals.nomina)
  totals.pctD0Nomina = pct(totals.dia0, totals.nomina)
  totals.pctD1D0 = pct(totals.dia1, totals.dia0)
  totals.pctOpD1 = pct(totals.iop, totals.dia1)

  const weeklyMap = new Map()
  groups.forEach((g) => {
    if (!weeklyMap.has(g.semana)) {
      weeklyMap.set(g.semana, { semana: g.semana, label: `Sem ${g.semana}`, rq: 0, nomina: 0, dia0: 0, dia1: 0, iop: 0 })
    }
    const w = weeklyMap.get(g.semana)
    w.rq += g.rq
    w.nomina += g.nomina
    w.dia0 += g.dia0
    w.dia1 += useTope ? g.dia1Tope : g.dia1
    w.iop += useTope ? g.iopTope : g.iop
  })
  const weekly = Array.from(weeklyMap.values()).sort((a, b) => a.semana - b.semana)

  const segmentMap = new Map()
  groups.forEach((g) => {
    const key = g.segmento || 'SIN SEGMENTO'
    if (!segmentMap.has(key)) {
      segmentMap.set(key, { segmento: key, rq: 0, dia1: 0, iop: 0, nomina: 0 })
    }
    const s = segmentMap.get(key)
    s.rq += g.rq
    s.dia1 += useTope ? g.dia1Tope : g.dia1
    s.iop += useTope ? g.iopTope : g.iop
    s.nomina += g.nomina
  })
  const segments = Array.from(segmentMap.values())
    .map((s) => ({ ...s, pctD1Rq: pct(s.dia1, s.rq) }))
    .sort((a, b) => b.rq - a.rq)

  const weeks = weekly.map((w) => w.semana)
  const heatmap = segments.map((s) => ({
    segmento: s.segmento,
    cells: weeks.map((semana) => {
      const slice = groups.filter((g) => g.semana === semana && (g.segmento || 'SIN SEGMENTO') === s.segmento)
      const rqWeek = slice.reduce((acc, g) => acc + g.rq, 0)
      const d1Week = slice.reduce((acc, g) => acc + (useTope ? g.dia1Tope : g.dia1), 0)
      const nominaWeek = slice.reduce((acc, g) => acc + g.nomina, 0)
      return {
        semana,
        rq: rqWeek,
        nomina: nominaWeek,
        dia1: d1Week,
        pct: rqWeek ? pct(d1Week, rqWeek) : null,
        pctNomina: nominaWeek ? pct(d1Week, nominaWeek) : null,
        empty: slice.length === 0,
      }
    }),
  }))

  const funnel = [
    { etapa: '1. Nómina', value: totals.nomina, fill: '#6366f1', pctPrev: 100, pctBase: 100 },
    { etapa: '2. Día 0', value: totals.dia0, fill: '#06b6d4', pctPrev: totals.pctD0Nomina, pctBase: totals.pctD0Nomina },
    { etapa: '3. Día 1', value: totals.dia1, fill: '#f59e0b', pctPrev: totals.pctD1D0, pctBase: totals.pctNominaD1 },
    { etapa: '4. Ingreso OP (Q)', value: totals.iop, fill: '#10b981', pctPrev: totals.pctOpD1, pctBase: pct(totals.iop, totals.nomina) },
  ]

  const lostD0 = Math.max(0, totals.nomina - totals.dia0)
  const lostD1 = Math.max(0, totals.dia0 - totals.dia1)
  const lostOp = totals.dia1 - totals.iop
  let cursor = totals.nomina
  const waterfall = [
    { name: 'Nómina', base: 0, value: totals.nomina, fill: '#6366f1', label: totals.nomina },
  ]
  waterfall.push({ name: 'No llegó D0', base: cursor - lostD0, value: lostD0, fill: '#f43f5e', label: -lostD0 })
  cursor -= lostD0
  waterfall.push({ name: 'No llegó D1', base: cursor - lostD1, value: lostD1, fill: '#f59e0b', label: -lostD1 })
  cursor -= lostD1
  if (lostOp >= 0) {
    waterfall.push({ name: 'No llegó OP', base: cursor - lostOp, value: lostOp, fill: '#fb7185', label: -lostOp })
  } else {
    waterfall.push({ name: 'OP extra vs D1', base: cursor, value: Math.abs(lostOp), fill: '#34d399', label: Math.abs(lostOp) })
  }
  waterfall.push({ name: 'Ingreso OP', base: 0, value: totals.iop, fill: '#10b981', label: totals.iop })

  const fuga = [
    { nombre: 'Partida · Nómina', d1Show: totals.nomina },
    { nombre: 'Se cayeron antes de Día 0', d1Show: lostD0 },
    { nombre: 'Se cayeron entre D0 y D1', d1Show: lostD1 },
    {
      nombre: lostOp >= 0 ? 'Se cayeron entre D1 y OP' : 'OP extra vs Día 1',
      d1Show: Math.abs(lostOp),
    },
    { nombre: 'Quedaron en operación', d1Show: totals.iop },
  ]

  const alerts = groups
    .map((g) => ({
      ...g,
      d1Show: useTope ? g.dia1Tope : g.dia1,
      iopShow: useTope ? g.iopTope : g.iop,
      pctD1Rq: pct(useTope ? g.dia1Tope : g.dia1, g.rq),
      semaforo: semaforoGrupo(g, useTope),
    }))
    .sort((a, b) => {
      const order = { CRITICO: 0, ROJO: 1, AMBAR: 2, VERDE: 3 }
      return (order[a.semaforo] - order[b.semaforo]) || (a.pctD1Rq - b.pctD1Rq)
    })

  return {
    totals,
    groups,
    recruiters,
    weekly,
    segments,
    heatmap,
    weeks,
    funnel,
    waterfall,
    fuga,
    alerts,
  }
}

function toIsoDay(raw) {
  const text = String(raw || '').trim()
  if (!text) return ''
  const iso = text.slice(0, 10)
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso
  const slash = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (slash) return `${slash[3]}-${slash[2].padStart(2, '0')}-${slash[1].padStart(2, '0')}`
  return ''
}

export function buildAuditoriaMatrix(nominas, kpiRows, { lockedName = null } = {}) {
  const allowed = new Set()
  const groupMeta = new Map()

  ;(kpiRows || []).forEach((row) => {
    if (isSinNomina(row) || isJunkResponsable(row.responsable)) return
    if (lockedName && !matchName(row.responsable, lockedName)) return
    const grupo = normKpi(row.grupo_g)
    const campana = normKpi(row.campana)
    const responsable = String(row.responsable || '').trim()
    allowed.add(`${grupo}|${campana}|${normKpi(responsable)}`)
    groupMeta.set(`${grupo}|${campana}`, {
      segmento: String(row.segmento || '').trim(),
      semana: row.semana,
    })
  })

  const rowMap = new Map()
  ;(nominas || []).forEach((row) => {
    if (row.activo === false) return
    const responsable = String(row.reclutador || '').trim()
    if (!responsable || isJunkResponsable(responsable)) return
    if (lockedName && !matchName(responsable, lockedName)) return
    const grupo = String(row.grupo_codigo || '').trim()
    const campana = String(row.campana || '').trim()
    const allowKey = `${normKpi(grupo)}|${normKpi(campana)}|${normKpi(responsable)}`
    if (allowed.size && !allowed.has(allowKey)) return
    const day = toIsoDay(row.marca_temporal || row.created_at || row.fecha_ingreso)
    const meta = groupMeta.get(`${normKpi(grupo)}|${normKpi(campana)}`) || {}
    const key = `${normKpi(responsable)}|${normKpi(row.segmento || meta.segmento)}|${normKpi(campana)}|${normKpi(grupo)}`
    if (!rowMap.has(key)) {
      rowMap.set(key, {
        key,
        reclutador: responsable,
        segmento: String(row.segmento || meta.segmento || '').trim() || 'SIN SEGMENTO',
        campana,
        grupo,
        byDate: new Map(),
        seen: new Set(),
      })
    }
    const rec = rowMap.get(key)
    const personKey = String(row.documento || '').trim() || `${responsable}|${day}|${rec.seen.size}`
    if (rec.seen.has(personKey)) return
    rec.seen.add(personKey)
    if (!day) return
    rec.byDate.set(day, (rec.byDate.get(day) || 0) + 1)
  })

  let maxSlots = 1
  const rows = Array.from(rowMap.values()).map((rec) => {
    const dates = Array.from(rec.byDate.keys()).sort()
    const days = {}
    const dayDates = {}
    dates.forEach((iso, idx) => {
      const slot = `d${idx + 1}`
      days[slot] = rec.byDate.get(iso) || 0
      dayDates[slot] = iso
    })
    maxSlots = Math.max(maxSlots, dates.length)
    return {
      key: rec.key,
      reclutador: rec.reclutador,
      segmento: rec.segmento,
      campana: rec.campana,
      grupo: rec.grupo,
      inicio: dates[0] || '',
      total: dates.reduce((acc, iso) => acc + (rec.byDate.get(iso) || 0), 0),
      days,
      dayDates,
    }
  }).sort((a, b) => a.reclutador.localeCompare(b.reclutador) || a.grupo.localeCompare(b.grupo) || b.total - a.total)

  const columns = Array.from({ length: maxSlots }, (_, i) => ({
    key: `d${i + 1}`,
    label: `D${i + 1}`,
  }))

  return { columns, rows }
}

export function resolveLockedRecruiter(rows, userProfile) {
  if (!userProfile) return null
  const candidates = [
    userProfile.nombre_completo,
    userProfile.nombre,
    userProfile.nombres_completos,
    `${userProfile.apellido_paterno || ''} ${userProfile.apellido_materno || ''} ${userProfile.nombres_completos || userProfile.nombres || ''}`.trim(),
    userProfile.alias,
    userProfile.alix,
    userProfile.usuario,
    String(userProfile.email || '').split('@')[0],
  ].filter(Boolean)
  const names = Array.from(new Set((rows || []).map((r) => String(r.responsable || '').trim()).filter(Boolean)))
  for (const candidate of candidates) {
    const hit = names.find((name) => matchName(name, candidate))
    if (hit) return hit
  }
  return candidates[0] || null
}
