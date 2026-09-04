/**
 * Flujo operativo GEA: Reclutamiento → Capacitación
 * - Reclutador deriva postulante a grupo/campaña/sede
 * - Formador recibe grupo, verifica datos y toma asistencia
 * - Bajas por mala selección (sin PC, docs, etc.) imputan al reclutador, no al capacitador
 */
import { nameMatches } from './dashboardAnalytics'

/** Motivos que descuentan meta al RECLUTADOR (mala preselección / info falsa) */
const RECLUTADOR_KEYWORDS = [
  'PC', 'EQUIPO', 'USB', 'DOCUMENTACION', 'DOCUMENTACIÓN', 'BLACK LIST', 'FRAUDE',
  'MANEJO DE PC', 'FACILIDADES TÉCNICAS', 'HABILIDAD', 'DICCION', 'DICCIÓN', 'ACTITUD',
  'REINGRESO NO APTO', 'USUARIO ACTIVO', 'OTRO CALL', 'FALTA DOCUMENT',
]

/** Motivos que NO penalizan al reclutador (deserción post-capacitación / ajena a selección) */
const CAPACITADOR_KEYWORDS = [
  'SALUD', 'VIAJE', 'FAMILIAR', 'ECONOM', 'DISTANCIA', 'ESTUDIOS', 'OFERTA LABORAL',
  'RETIRO APROBADO', 'JEFATURA', 'DESAPROBADO OJT', 'SOBREDOTACIÓN', 'FALTAS CONSECUTIVAS',
  'TARDANZAS', 'DESISTIMIENTO',
]

export const MOTIVOS_BAJA_OPERATIVOS = [
  { motivo: 'BAJA DIA 1', atribucion: 'RECLUTADOR' },
  { motivo: 'NO CONTACTO', atribucion: 'NEUTRO' },
  { motivo: 'FAMILIAR', atribucion: 'CAPACITADOR' },
  { motivo: 'SALUD', atribucion: 'CAPACITADOR' },
  { motivo: 'ECONÓMICO', atribucion: 'CAPACITADOR' },
  { motivo: 'DISTANCIA', atribucion: 'CAPACITADOR' },
  { motivo: 'ESTUDIOS', atribucion: 'CAPACITADOR' },
  { motivo: 'VIAJE', atribucion: 'CAPACITADOR' },
  { motivo: 'OFERTA LABORAL', atribucion: 'CAPACITADOR' },
  { motivo: 'DICCION', atribucion: 'RECLUTADOR' },
  { motivo: 'RETIRO APROBADO POR JEFATURA', atribucion: 'CAPACITADOR' },
  { motivo: 'MANEJO DE PC', atribucion: 'RECLUTADOR' },
  { motivo: 'FACILIDADES TÉCNICAS', atribucion: 'RECLUTADOR' },
  { motivo: 'FALTA DOCUMENTACION', atribucion: 'RECLUTADOR' },
  { motivo: 'BLACK LIST CLIENTE', atribucion: 'RECLUTADOR' },
  { motivo: 'BLACK LIST GEA', atribucion: 'RECLUTADOR' },
  { motivo: 'FRAUDE', atribucion: 'RECLUTADOR' },
  { motivo: 'ACTITUD', atribucion: 'RECLUTADOR' },
  { motivo: 'DESAPROBADO EN OJT', atribucion: 'CAPACITADOR' },
  { motivo: 'HABILIDAD COMERCIAL', atribucion: 'RECLUTADOR' },
  { motivo: 'HABILIDAD ATC', atribucion: 'RECLUTADOR' },
]

export function atribuirBaja(motivo) {
  const m = String(motivo || '').toUpperCase().trim()
  if (!m) return 'NEUTRO'
  const catalog = MOTIVOS_BAJA_OPERATIVOS.find(x => m.includes(x.motivo) || x.motivo.includes(m))
  if (catalog) return catalog.atribucion
  if (RECLUTADOR_KEYWORDS.some(k => m.includes(k))) return 'RECLUTADOR'
  if (CAPACITADOR_KEYWORDS.some(k => m.includes(k))) return 'CAPACITADOR'
  return 'NEUTRO'
}

export function atribucionLabel(atrib) {
  if (atrib === 'RECLUTADOR') return 'Descuenta al reclutador'
  if (atrib === 'CAPACITADOR') return 'No descuenta al reclutador'
  return 'Evaluar caso'
}

export function resolveReclutadorId(userProfile, reclutadores = []) {
  if (!userProfile) return null
  if (userProfile.reclutador_id) return Number(userProfile.reclutador_id)

  const normalize = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
  const userAlix = normalize(userProfile.nombre || userProfile.usuario_alix || userProfile.alix || '')
  const userEmailPrefix = normalize(String(userProfile.email || '').split('@')[0])
  const userDni = String(userProfile.documento || userProfile.dni || userProfile.dni_reclutador || '').trim()
  const userEmail = String(userProfile.email || userProfile.correo || '').toLowerCase().trim()
  const nombre = userProfile.nombre_completo || userProfile.nombre || ''

  // 1. Multi-factor match by ALIX username (ej. pe_carazacc)
  if (userAlix || userEmailPrefix) {
    const matchByAlix = reclutadores.find(r => {
      const rAlix = normalize(r.alix || r.usuario_alix || '')
      return (userAlix && rAlix === userAlix) || (userEmailPrefix && rAlix === userEmailPrefix)
    })
    if (matchByAlix) return Number(matchByAlix.id || matchByAlix.documento)
  }

  // 2. Multi-factor match by DNI / Documento de Identidad
  if (userDni) {
    const matchByDni = reclutadores.find(r => 
      String(r.documento || r.dni || '').trim() === userDni
    )
    if (matchByDni) return Number(matchByDni.id || matchByDni.documento)
  }

  // 3. Multi-factor match by Email
  if (userEmail) {
    const matchByEmail = reclutadores.find(r => 
      String(r.email || r.correo || '').toLowerCase().trim() === userEmail
    )
    if (matchByEmail) return Number(matchByEmail.id || matchByEmail.documento)
  }

  // 4. Fallback match by Name
  if (nombre) {
    const match = reclutadores.find(r => nameMatches(r.nombre_completo, nombre))
    if (match) return Number(match.id || match.documento)
  }

  return null
}

export function resolveFormadorDocumento(userProfile, formadores = []) {
  if (!userProfile) return null
  if (userProfile.formador_documento) return String(userProfile.formador_documento).trim()

  const normalize = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
  const userAlix = normalize(userProfile.nombre || userProfile.usuario_alix || userProfile.alix || '')
  const userEmailPrefix = normalize(String(userProfile.email || '').split('@')[0])
  const userDni = String(userProfile.documento || userProfile.dni || '').trim()
  const userEmail = String(userProfile.email || userProfile.correo || '').toLowerCase().trim()
  const nombre = userProfile.nombre_completo || userProfile.nombre || ''

  // 1. Multi-factor match by ALIX username
  if (userAlix || userEmailPrefix) {
    const matchByAlix = formadores.find(f => {
      const fAlix = normalize(f.usuario_alix || f.alix || '')
      return (userAlix && fAlix === userAlix) || (userEmailPrefix && fAlix === userEmailPrefix)
    })
    if (matchByAlix) return String(matchByAlix.documento).trim()
  }

  // 2. Multi-factor match by DNI
  if (userDni) {
    const matchByDni = formadores.find(f => String(f.documento || f.dni || '').trim() === userDni)
    if (matchByDni) return String(matchByDni.documento).trim()
  }

  // 3. Multi-factor match by Email
  if (userEmail) {
    const matchByEmail = formadores.find(f => String(f.email || f.correo || '').toLowerCase().trim() === userEmail)
    if (matchByEmail) return String(matchByEmail.documento).trim()
  }

  // 4. Fallback by Name
  if (nombre) {
    const match = formadores.find(f => nameMatches(f.nombre_completo || f.datos_completos, nombre))
    if (match) return String(match.documento).trim()
  }

  return null
}

export function resolveFormadorSegment(userProfile, formadores = []) {
  if (!userProfile) return ''
  if (userProfile.segmento) return String(userProfile.segmento).trim().toUpperCase()

  const doc = resolveFormadorDocumento(userProfile, formadores)
  if (doc) {
    const f = formadores.find(x => String(x.documento || x.dni || '').trim() === doc)
    if (f?.segmento) return String(f.segmento).trim().toUpperCase()
  }

  const normalize = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
  const userAlix = normalize(userProfile.nombre || userProfile.usuario_alix || userProfile.alix || '')
  const nombre = userProfile.nombre_completo || userProfile.nombre || ''

  const match = formadores.find(f => {
    const fAlix = normalize(f.usuario_alix || f.alix || '')
    return (userAlix && fAlix === userAlix) || (nombre && nameMatches(f.nombre_completo || f.datos_completos, nombre))
  })

  return match?.segmento ? String(match.segmento).trim().toUpperCase() : ''
}

export function filterPostulantesReclutador(postulantes, userProfile, reclutadores = []) {
  if (!userProfile) return []
  const normalize = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
  const userAlix = normalize(userProfile.nombre || userProfile.usuario_alix || userProfile.alix || '')
  const userEmailPrefix = normalize(String(userProfile.email || '').split('@')[0])
  const userDni = String(userProfile.documento || userProfile.dni || userProfile.dni_reclutador || '').trim()
  const userEmail = String(userProfile.email || userProfile.correo || '').toLowerCase().trim()
  const nombre = userProfile?.nombre_completo || userProfile?.nombre || ''

  // Buscar la ficha completa del reclutador en la tabla equipo_reclutamiento
  const recObj = reclutadores.find(r => {
    const rAlix = normalize(r.alix || r.usuario_alix || '')
    const rDni = String(r.documento || r.dni || '').trim()
    const rEmail = String(r.email || r.correo || '').toLowerCase().trim()
    return (
      (userAlix && rAlix === userAlix) ||
      (userEmailPrefix && rAlix === userEmailPrefix) ||
      (userDni && rDni === userDni) ||
      (userEmail && rEmail === userEmail) ||
      (nombre && nameMatches(r.nombre_completo, nombre))
    )
  })

  const recId = recObj?.id ? Number(recObj.id) : resolveReclutadorId(userProfile, reclutadores)
  const recDni = recObj ? String(recObj.documento || recObj.dni || '').trim() : userDni
  const recNombre = recObj?.nombre_completo || ''
  const recAlias = recObj?.alias || ''
  const recAlix = recObj?.alix || ''

  return postulantes.filter(p => {
    // 1. Match by Recruiter ID
    if (recId && Number(p.reclutador_id) === recId) return true

    // 2. Match by Recruiter DNI
    if (recDni && (String(p.reclutador_dni || p.dni_reclutador || p.reclutador_documento || '').trim() === recDni)) return true
    if (userDni && (String(p.reclutador_dni || p.dni_reclutador || p.reclutador_documento || '').trim() === userDni)) return true

    // 3. Match by Recruiter Email
    if (userEmail && String(p.reclutador_email || '').toLowerCase().trim() === userEmail) return true

    // 4. Match by ALIX username
    if (recAlix && nameMatches(p.reclutador, recAlix)) return true
    if (userAlix && nameMatches(p.reclutador, userAlix)) return true

    // 5. Match by Recruiter Full Name / Alias
    if (recNombre && nameMatches(p.reclutador, recNombre)) return true
    if (recAlias && nameMatches(p.reclutador, recAlias)) return true
    if (nombre && nameMatches(p.reclutador, nombre)) return true

    return false
  })
}

export function filterGruposFormador(grupos, userProfile, formadores = []) {
  const doc = resolveFormadorDocumento(userProfile, formadores)
  const nombre = userProfile?.nombre_completo || userProfile?.nombre || ''
  if (!doc && !nombre) return grupos
  return grupos.filter(g =>
    (doc && String(g.formador_documento).trim() === doc) ||
    nameMatches(g.formador_nombre, nombre)
  )
}

export function filterBajasImputablesReclutador(asistencias, postulantes, userProfile, reclutadores = []) {
  const myDocs = new Set(filterPostulantesReclutador(postulantes, userProfile, reclutadores).map(p => p.documento))
  return asistencias.filter(a =>
    myDocs.has(a.postulante_documento) &&
    a.sigla_asistencia === 'B' &&
    (a.atribucion_baja === 'RECLUTADOR' || atribuirBaja(a.motivo_baja) === 'RECLUTADOR')
  )
}

export function computeMetasReclutador(campanasMetas = [], userProfile, reclutadores = [], postulantes = [], semana = null) {
  const recId = resolveReclutadorId(userProfile, reclutadores)
  const nombre = userProfile?.nombre_completo || userProfile?.nombre || ''
  const recObj = recId ? reclutadores.find(r => Number(r.id) === recId) : null
  const recNombre = recObj?.nombre_completo || ''

  let metaSemanal = 0
  const campanasAsignadas = []

  for (const c of campanasMetas) {
    const rm = (c.reclutadores_metas || []).find(r =>
      (recId && Number(r.reclutador_id) === recId) ||
      nameMatches(r.nombre_completo, nombre) ||
      (recNombre && nameMatches(r.nombre_completo, recNombre))
    )
    if (rm) {
      metaSemanal += Number(rm.meta_individual) || 0
      campanasAsignadas.push({ campana: c.nombre, meta: rm.meta_individual })
    }
  }

  const misPostulantes = filterPostulantesReclutador(postulantes, userProfile, reclutadores)
  const enSemana = semana != null
    ? misPostulantes.filter(p => Number(p.semana_trabajo) === semana).length
    : misPostulantes.length

  return {
    metaSemanal: metaSemanal || null,
    campanasAsignadas,
    derivadosSemana: enSemana,
    totalCartera: misPostulantes.length,
  }
}

const DONE_WORDS = ['SI', 'SÍ', 'REALIZADO', 'APTO', 'ASISTIO', 'OK', 'COMPLETO']
const PENDING_WORDS = ['PENDIENTE', 'NO', '-', '']

function isDone(val) {
  const s = String(val ?? '').toUpperCase().trim()
  if (!s || PENDING_WORDS.includes(s)) return false
  return DONE_WORDS.some(w => s.includes(w)) || s.length > 2
}

function nivelOk(nivel) {
  const n = String(nivel || '').toUpperCase()
  return n.includes('COMPLETO') || n.includes('CONCLUIDO') || n.includes('CULMINADO') || n.includes('TITULADO')
}

/** Checklist que el formador valida contra lo declarado por el reclutador */
export function buildVerificacionPostulante(p = {}) {
  const pcOk = isDone(p.validacion_pc)
  const testOk = isDone(p.test_psicologico)
  const estudiosOk = nivelOk(p.nivel_academico)
  const expDeclarada = p.exp_call_center === true || String(p.exp_call_center).toUpperCase().startsWith('S')
  const alerts = []

  if (!pcOk) alerts.push({ key: 'pc', label: 'Sin PC / validación pendiente', severity: 'high', atribucion: 'RECLUTADOR' })
  if (!estudiosOk && p.nivel_academico) alerts.push({ key: 'estudios', label: 'Estudios incompletos vs requisito', severity: 'medium', atribucion: 'RECLUTADOR' })
  if (!testOk) alerts.push({ key: 'test', label: 'Test psicológico pendiente', severity: 'low', atribucion: 'NEUTRO' })
  if (p.observacion_reclutamiento || p.observacion) {
    const obs = String(p.observacion_reclutamiento || p.observacion).toUpperCase()
    if (obs.includes('USB') || obs.includes('AUDIFONO') || obs.includes('EQUIPO')) {
      if (!pcOk) alerts.push({ key: 'equipo_obs', label: 'Reclutador indicó equipo — verificar', severity: 'high', atribucion: 'RECLUTADOR' })
    }
  }

  return { pcOk, testOk, estudiosOk, expDeclarada, alerts, hasRisk: alerts.some(a => a.severity === 'high') }
}

export function gruposEntrantes(grupos, postulantes) {
  return grupos.map(g => {
    const alumnos = postulantes.filter(p => p.grupo_codigo === g.codigo)
    const reclutadores = [...new Set(alumnos.map(p => p.reclutador).filter(Boolean))]
    return {
      ...g,
      alumnosCount: alumnos.length,
      reclutadores,
      pendientesVerificacion: alumnos.filter(p => buildVerificacionPostulante(p).hasRisk).length,
    }
  }).filter(g => g.alumnosCount > 0)
    .sort((a, b) => (b.alumnosCount || 0) - (a.alumnosCount || 0))
}

/**
 * Extrae el código padre de un grupo si es un subgrupo derivado (ej. GPE-2026012-1 -> GPE-2026012).
 * Si el grupo no es un subgrupo (ej. GPE-2026012), retorna el código intacto.
 */
export function getParentGroupCode(code) {
  if (!code) return '';
  const str = String(code).trim().toUpperCase();
  const match = str.match(/^([A-Z0-9]+-\d+)[-_](\d{1,2})$/);
  return match ? match[1] : str;
}

/**
 * Valida si un código corresponde a un subgrupo derivado para bloquear doble split
 */
export function isSubgroupCode(code) {
  if (!code) return false;
  return /^([A-Z0-9]+-\d+)[-_](\d{1,2})$/.test(String(code).trim().toUpperCase());
}

