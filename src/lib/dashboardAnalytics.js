/**
 * dashboardAnalytics.js
 * Métricas y narrativas derivadas del consolidado de nóminas v2
 */

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

// ── Métricas globales (consolidado nómina) ────────────────────
export function computeGlobalMetrics(postulantes = [], asistencias = [], grupos = []) {
  const total = postulantes.length
  const inCapacitacion = postulantes.filter(p =>
    p.estado === 'EN_CAPACITACION' || p.fecha_inicio_capacitacion
  ).length
  const inOps = postulantes.filter(p =>
    p.estado === 'EN_OPERACION' || p.fecha_conexion_op ||
    asistencias.some(a => a.postulante_documento === p.documento && a.sigla_asistencia === 'I-OP')
  ).length
  const enOjt = postulantes.filter(p => p.fecha_conexion_ojt && !p.fecha_conexion_op).length

  const totalAsist = asistencias.length
  const presentCount = asistencias.filter(a => ATTENDANCE_PRESENT.includes(a.sigla_asistencia)).length
  const attendanceRate = totalAsist > 0 ? Math.round((presentCount / totalAsist) * 100) : 0
  const conversionRate = total > 0 ? Math.round((inOps / total) * 100) : 0

  const testPsicoDone = postulantes.filter(p => isDone(p.test_psicologico)).length
  const evalDia0Pending = postulantes.filter(p => isPending(p.evaluacion_dia_0)).length
  const dia0Asistio = postulantes.filter(p => isDone(p.dia_0_obs) || p.dia_0).length
  const dia1Cese = postulantes.filter(p => isCese(p.status_dia_1)).length

  const totalRemuneracion = postulantes.reduce((s, p) => s + (Number(p.remuneracion) || 0), 0)
  const totalBonos = postulantes.reduce((s, p) =>
    s + (Number(p.bono_variable) || 0) + (Number(p.bono_movilidad) || 0) +
    (Number(p.bono_bienvenida) || 0) + (Number(p.bono_permanencia) || 0) +
    (Number(p.bono_asistencia_perfecta) || 0), 0)

  const pagoCapCount = postulantes.filter(p => p.pago_capacitacion).length

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
export function buildConsolidadoFunnel(postulantes = [], asistencias = []) {
  const total = postulantes.length
  const conTest = postulantes.filter(p => isDone(p.test_psicologico)).length
  const inicioCap = postulantes.filter(p => p.fecha_inicio_capacitacion).length
  const evalD0 = postulantes.filter(p => !isPending(p.evaluacion_dia_0) && p.evaluacion_dia_0).length
  const conOjt = postulantes.filter(p => p.fecha_conexion_ojt).length
  const conOp = postulantes.filter(p =>
    p.fecha_conexion_op ||
    asistencias.some(a => a.postulante_documento === p.documento && a.sigla_asistencia === 'I-OP')
  ).length

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
