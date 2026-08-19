/**
 * Sincronización CAPACIDAD_RYS ↔ Nómina ↔ Asistencia
 * Fuente de verdad: grupo planificado en capacidad_rys
 */

export function normalizeKey(val) {
  return String(val || '').trim().toUpperCase()
}

export const SEGMENTOS_SIU = ['CLARO PERU', 'CLARO PERU RETENCIONES', 'CLARO CHILE', 'CLARO PERU OUT', 'LIPIGAS']

export function inferSegmento(campana) {
  const c = (campana || '').toUpperCase()
  if (c.includes('LIPIGAS')) return 'LIPIGAS'
  if (c.includes('TUVES') || c.includes('CHILE') || c.includes('VTR')) return 'CLARO CHILE'
  if (c.includes('RETENCION')) return 'CLARO PERU RETENCIONES'
  if (c.includes('OUT') || c.includes('UPGRADE')) return 'CLARO PERU OUT'
  return 'CLARO PERU'
}

/** Busca el grupo planificado que mejor coincide */
export function findGrupoPlan(grupos = [], { codigo, campana, semana, periodo } = {}) {
  if (!grupos.length) return null

  const cod = normalizeKey(codigo)
  const camp = normalizeKey(campana)

  // 1. Si tenemos código y campaña, buscar coincidencia EXACTA en ambos (máxima prioridad)
  if (cod && camp) {
    const exactWithCamp = grupos.find(g => normalizeKey(g.codigo) === cod && normalizeKey(g.campana) === camp)
    if (exactWithCamp) return exactWithCamp
  }

  // 2. Si solo tenemos código sin campaña especificada
  if (cod && !camp) {
    const exact = grupos.find(g => normalizeKey(g.codigo) === cod)
    if (exact) return exact
  }

  const sem = Number(semana)
  const per = String(periodo || '').trim()

  const candidates = grupos.filter(g => {
    if (camp && normalizeKey(g.campana) !== camp) return false
    if (sem && Number(g.semana_trabajo) !== sem) return false
    if (per && g.periodo && g.periodo !== per) return false
    return true
  })

  if (!candidates.length) return null

  return candidates.sort((a, b) => {
    const score = (g) => {
      let s = 0
      if (cod && normalizeKey(g.codigo) === cod) s += 10
      if (camp && normalizeKey(g.campana) === camp) s += 8
      if (per && g.periodo === per) s += 4
      if (['ACTIVO', 'EN_CURSO', 'PLANIFICADO'].includes(g.estado)) s += 2
      return s
    }
    return score(b) - score(a)
  })[0]
}

/** Campos de nómina/asistencia derivados del grupo CAPACIDAD_RYS */
export function grupoToNominaDefaults(grupo) {
  if (!grupo) return {}
  const formador = grupo.formador_nombre
    ? { formador_nombre: grupo.formador_nombre, formador_documento: grupo.formador_documento || '' }
    : grupo.formador_documento
      ? { formador_documento: grupo.formador_documento }
      : {}

  return {
    grupo_codigo: grupo.codigo || '',
    campana: grupo.campana || '',
    segmento: grupo.segmento || '',
    semana_trabajo: grupo.semana_trabajo ?? undefined,
    periodo_reclutado: grupo.periodo || undefined,
    modalidad: grupo.modalidad || undefined,
    condicion: grupo.condicion || undefined,
    horario_gestion: grupo.rango_horario || undefined,
    ...formador,
  }
}

/** Aplica defaults del grupo al formulario (setValue de react-hook-form) */
export function applyGrupoToNominaForm(grupo, setValue, { onlyEmpty = false } = {}) {
  const defaults = grupoToNominaDefaults(grupo)
  for (const [key, val] of Object.entries(defaults)) {
    if (val === undefined || val === null || val === '') continue
    if (onlyEmpty) {
      // setValue se llama desde fuera con getValues si hace falta
    }
    setValue(key, val, { shouldDirty: true, shouldValidate: false })
  }
  return defaults
}

/** Enriquece grupos con conteos de postulantes activos */
export function enrichGruposWithStats(grupos = [], postulantes = []) {
  const byGrupoCampana = {}
  for (const p of postulantes) {
    const gc = normalizeKey(p.grupo_codigo)
    const camp = normalizeKey(p.campana) || 'SIN_CAMPANA'
    if (!gc) continue
    const key = `${camp}|${gc}`
    byGrupoCampana[key] = (byGrupoCampana[key] || 0) + 1
  }

  return grupos.map(g => {
    const gc = normalizeKey(g.codigo)
    const camp = normalizeKey(g.campana) || 'SIN_CAMPANA'
    const key = `${camp}|${gc}`
    
    const activos = byGrupoCampana[key] || 0
    const meta0 = Number(g.meta_dia_0) || 0
    const meta1 = Number(g.meta_dia_1) || 0
    const rqFtes = Number(g.rq_ftes_solicitado) || 0
    const pctMeta = meta0 > 0 ? Math.round((activos / meta0) * 1000) / 10 : null

    const inconsistencias = []
    
    if (meta0 > 0) {
      if (activos > 0 && activos < meta0) {
        inconsistencias.push({ type: 'falta_meta0', message: `No alcanza meta D0 (${activos}/${meta0})` })
      }
    }
    if (['ACTIVO', 'EN_CURSO'].includes(g.estado) && activos === 0) {
      inconsistencias.push({ type: 'sin_postulantes', message: 'Grupo activo sin postulantes' })
    }

    return {
      ...g,
      postulantes_activos: activos,
      pct_cumplimiento_meta: pctMeta,
      inconsistencias,
      tiene_inconsistencias: inconsistencias.length > 0,
    }
  })
}

/** Metadata CAPACIDAD para panel de asistencia */
export function grupoToAsistenciaMeta(grupo, formadores = []) {
  if (!grupo) return null
  const formador = formadores.find(f => f.documento === grupo.formador_documento)
  return {
    codigo: grupo.codigo,
    segmento: grupo.segmento || '',
    campana: grupo.campana || '',
    semana: grupo.semana_trabajo,
    periodo: grupo.periodo,
    modalidad: grupo.modalidad,
    condicion: grupo.condicion,
    rango_horario: grupo.rango_horario,
    meta_dia_0: grupo.meta_dia_0,
    meta_dia_1: grupo.meta_dia_1,
    estado: grupo.estado,
    formador_documento: grupo.formador_documento || '',
    formador_nombre: formador?.nombre_completo || '',
    postulantes_activos: grupo.postulantes_activos,
  }
}
