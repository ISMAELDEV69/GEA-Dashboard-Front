import * as XLSX from 'xlsx';
/**
 * dataService.js
 * Capa de abstracción de datos: usa Supabase si está configurado,
 * si no, cae al mock de localStorage automáticamente.
 */

import { supabase, isSupabaseConfigured } from './supabase'
import { enrichGruposWithStats, inferSegmento } from './capacidadRysSync'
import { SHEET_SOURCES, sheetCsvUrl } from './sheetSources.js'
import {
  parseCsvToMatrix,
  parseNominaRows,
  cleanDocumento,
  calcEdadFromFechaISO,
  normalizePhoneValue,
  parseFechaNacimiento,
  parseEdadValue,
  normalizeTiempoExperiencia,
  extractPhonesFromText
} from './nominaConsolidadoSchema.js'
import { asistenciaRecordsFromNominaRow, extractGruposFromRows } from './sheetImportUtils.js'
import { atribuirBaja } from './flujoOperativo.js'
import { analyzeDia1CorteRecords, isBajaDia1Motivo } from './bajaDia1Rules.js'
import { parseCapacidadRysCsv } from './capacidadRysSchema.js'
import {
  getFromStorage,
  saveToStorage,
  addAuditLog as mockAuditLog,
  initLocalStorageDb
} from './mockData'
import {
  getPersistentRecord,
  setPersistentItem,
  deletePersistentItem,
  deletePersistentByPrefix,
  clearPersistentCache
} from './persistentCache.js'
import { isDescuentoVencido48h, parseFechaRegistro } from './businessHoursUtils.js'
import { formatFechaDDMMYYYY } from './propuestaParser.js'

export const DB_MODE = isSupabaseConfigured() ? 'supabase' : 'local'

// ─────────────────────────────────────────────
// CACHE LAYER (RAM + IndexedDB Persistente)
// ─────────────────────────────────────────────
const apiCache = new Map();
const inflightRefresh = new Map();
const STALE_MAX_MS = 24 * 60 * 60 * 1000;
const CACHE_MAX_KEYS = 40;

function rememberCache(key, data, timestamp = Date.now(), persist = true) {
  if (data === null || data === undefined) return;
  if (apiCache.size >= CACHE_MAX_KEYS && !apiCache.has(key)) {
    const oldestKey = apiCache.keys().next().value;
    apiCache.delete(oldestKey);
  }
  apiCache.set(key, { data, timestamp });
  if (persist) setPersistentItem(key, data).catch(() => {});
}

function notifyCacheRefreshed(key) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('gea-cache-refreshed', { detail: { key } }));
}

function refreshInBackground(key, fetcher) {
  if (inflightRefresh.has(key)) return;
  const job = (async () => {
    try {
      const data = await fetcher();
      if (data !== null && data !== undefined) {
        rememberCache(key, data);
        notifyCacheRefreshed(key);
      }
    } catch (err) {
      console.warn('[withCache] refresh en segundo plano falló:', key, err);
    } finally {
      inflightRefresh.delete(key);
    }
  })();
  inflightRefresh.set(key, job);
}

async function withCache(key, ttlMs = 300000, fetcher) {
  if (DB_MODE !== 'supabase') return fetcher();

  const now = Date.now();
  const cached = apiCache.get(key);
  if (cached && (now - cached.timestamp < ttlMs)) {
    return cached.data;
  }
  if (cached && (now - cached.timestamp < STALE_MAX_MS)) {
    refreshInBackground(key, fetcher);
    return cached.data;
  }

  try {
    const record = await getPersistentRecord(key);
    if (record && record.data !== null && record.data !== undefined) {
      rememberCache(key, record.data, record.timestamp, false);
      if (now - record.timestamp < ttlMs) {
        return record.data;
      }
      if (now - record.timestamp < STALE_MAX_MS) {
        refreshInBackground(key, fetcher);
        return record.data;
      }
    }
  } catch (err) {
    console.warn('[withCache] Error reading IndexedDB cache:', err);
  }

  const data = await fetcher();
  rememberCache(key, data);
  return data;
}

export function invalidateCache(keyPrefix) {
  if (!keyPrefix) {
    apiCache.clear();
    clearPersistentCache().catch(() => {});
    return;
  }
  const prefixStr = String(keyPrefix).toLowerCase();
  const prefixes = (prefixStr.includes('consolidado') || prefixStr.includes('asistencia'))
    ? ['all_consolidado', 'consolidado', 'consolidado_', 'consolidado_asistencias', 'asistencias', 'all_asistencias_bajas', 'all_motivos_bajas']
    : (prefixStr.includes('postulante') || prefixStr.includes('nomina'))
    ? ['postulantes', 'postulantes_', 'nominas', 'nominas_']
    : [keyPrefix];

  for (const p of prefixes) {
    for (const key of apiCache.keys()) {
      if (key.startsWith(p)) {
        apiCache.delete(key);
      }
    }
    deletePersistentByPrefix(p).catch(() => {});
  }
}

export function isBajaDia1(motivo, sigla, row) {
  if (!motivo && !sigla && !row) return false;
  if (row?.isDescuento || row?.is_descuento || String(row?.estado || '').toUpperCase().trim() === 'DESCUENTO') return false;

  const m = String(motivo || row?.motivo_baja || row?.motivo || '').toUpperCase().trim();
  if (m.includes('DESCUENTO')) return false;

  const s = String(sigla || row?.sigla || row?.sigla_asistencia || '').toUpperCase().trim();
  const t = String(row?.tipo_baja || row?.tipo || row?.tipo_reclutado || '').toUpperCase().trim();
  const stD1 = String(row?.status_dia_1 || '').toUpperCase().trim();
  const dia1 = String(row?.dia_1 || '').toUpperCase().trim();

  if (t.includes('DESCUENTO') || stD1.includes('DESCUENTO')) return false;

  // Regla de Calibración Día 1 con 3 Cortes:
  // Reclutamiento hace seguimiento hasta el Corte 2.
  // Si es Corte 3 o si el alumno ya tuvo asistencia en un corte anterior del Día 1, NUNCA es Baja Día 1
  const corte = Number(row?.corte ?? row?.corteIndex ?? 0);
  const isCorte3 = corte === 3 || String(row?.fecha_hora_registro || '').toUpperCase().includes('CORTE 3');
  if (isCorte3 || row?.hadAttendanceInEarlierCuts === true) {
    return false;
  }

  // Si la persona ya asistió (ej. dia_1 === 'ASISTIO' o tiene registro confirmado de asistencia), NUNCA es Baja Día 1
  if (dia1 === 'ASISTIO' || dia1 === 'A' || row?.hasAttendance === true || row?.hasPriorAttendance === true || row?.hadDia1Attendance === true) {
    if (!m.includes('BAJA DIA 1') && !m.includes('BAJA D1')) {
      return false;
    }
  }

  // Si tiene un motivo concreto de deserción en formación (ej. ESTUDIOS, SALUD, DISTANCIA, etc.)
  // y NO menciona expresamente Día 1, es BAJA EN FORMACIÓN, NUNCA Baja Día 1
  if (
    m &&
    !m.includes('DIA 1') &&
    !m.includes('DÍA 1') &&
    !m.includes('D1') &&
    !m.includes('NO SHOW') &&
    !m.includes('PERIODO GRACIA') &&
    !m.includes('PERIODO DE GRACIA')
  ) {
    if (
      m === 'ESTUDIOS' || m.includes('ESTUDIO') ||
      m === 'SALUD' || m.includes('SALUD') ||
      m === 'DISTANCIA' || m.includes('DISTANCIA') ||
      m.includes('OFERTA') || m.includes('FAMILIAR') ||
      m.includes('TRABAJO') || m.includes('DISPONIBILIDAD') ||
      m.includes('HORARIO') || m.includes('INCOMPATIBILIDAD') ||
      m.includes('DESISTIMIENTO') || m.includes('FALTA DOCUMENTACION') ||
      m.includes('FALTA DOCUMENTACIÓN') || m.includes('DOCUMENTO') ||
      m.includes('NO CONTACTO') || m.includes('DESERCION') ||
      m.includes('DESERCIÓN') || m.includes('ACTITUD') ||
      m.includes('DESAPROBADO') || m.includes('FALTAS')
    ) {
      return false;
    }
  }

  // Detección positiva de Baja Día 1 (marcas explícitas de No Show o Deserción en Día 1)
  if (t.includes('DIA_1') || t.includes('DIA 1') || t.includes('D1') || t.includes('NO SHOW')) return true;
  if (stD1.includes('DIA_1') || stD1.includes('DIA 1') || stD1.includes('D1') || stD1.includes('NO SHOW') || stD1 === 'NO_SHOW') return true;
  if (s === 'BD1' || s === 'D1' || s === 'NS') return true;
  if (
    m === 'BAJA DIA 1' || 
    m === 'BAJA DÍA 1' || 
    m === 'BAJA D1' || 
    m === 'DÍA 1' || 
    m === 'DIA 1' || 
    m.includes('BAJA DIA 1') || 
    m.includes('BAJA DÍA 1') || 
    m.includes('BAJA D1') ||
    m.includes('(BAJA DIA 1)') ||
    m.includes('(BAJA DÍA 1)') ||
    m.includes('PERIODO GRACIA') ||
    m.includes('PERIODO DE GRACIA') ||
    m.includes('NO SHOW')
  ) return true;

  return false;
}

export function isBajaCapacitacion(row) {
  if (!row) return false;
  if (row.isDescuento || row.is_descuento || String(row.estado || '').toUpperCase().trim() === 'DESCUENTO') return false;
  const motivo = row.motivo_baja || row.motivo || '';
  const m = String(motivo || '').toUpperCase().trim();
  if (m.includes('DESCUENTO')) return false;
  const sigla = row.sigla || row.sigla_asistencia || '';
  if (isBajaDia1(motivo, sigla, row)) return false;

  const s = String(sigla || '').toUpperCase().trim();
  const e = String(row.estado || '').toUpperCase().trim();

  return (
    s === 'B' || 
    s === 'BAJA' || 
    e === 'CESADO' || 
    (e.includes('BAJA') && !e.includes('BAJA DIA 1') && !e.includes('BAJA DÍA 1')) ||
    (m !== '' && m !== 'NULL' && m !== 'ASISTIO' && m !== 'ACTIVO')
  ) && s !== 'ASISTIO' && s !== 'A' && s !== 'I-OP';
}

/**
 * Determina si un registro de descuento está aprobado o si ya venció el plazo legal
 * de 48 horas hábiles en Perú (excluyendo domingos y feriados nacionales).
 */
export function isDescuentoAprobado(row) {
  if (!row) return false;
  if (row.isDescuento === false) return false;

  const estado = String(row.estado || '').toUpperCase().trim();
  const procede = String(row.procede || '').toUpperCase().trim();
  const autRys = String(row.autoriza_rys || '').toUpperCase().trim();

  // Validar que realmente sea un registro o solicitud de descuento antes de evaluar vencimiento de 48h
  const esRegistroDescuento = Boolean(row.procede || row.motivo || row.grupo_cap || estado.includes('DESCUENTO'));
  if (!esRegistroDescuento) return false;

  if (procede === 'NO PROCEDE' || autRys === 'NO') return false;
  if (procede === 'PROCEDE' || autRys === 'SI') return true;
  if (estado === 'DESCUENTO APROBADO' || estado === 'DESCUENTO') return true;

  // Si aún no está resuelto, verificar si ya vencieron las 48h hábiles en Perú
  const regTime = row.fecha_registro || row.created_at || row.fecha_baja;
  if (regTime && isDescuentoVencido48h(regTime)) {
    return true;
  }
  return false;
}

export function normalizarMotivo(motivoCrudo) {
  if (!motivoCrudo) return 'SIN ESPECIFICAR';
  const m = String(motivoCrudo).trim().toUpperCase();
  if (!m || m === 'NULL' || m === 'UNDEFINED' || m === 'BAJA' || m === 'CESADO' || m === 'INACTIVO' || m === 'SIN ESPECIFICAR' || m === 'BAJA SIN ESPECIFICAR') {
    return 'SIN ESPECIFICAR';
  }

  // Normalizaciones ortográficas y limpieza de typos preservando cada motivo específico
  if (m === 'NO CONTACTO' || m.includes('NO CONTACTO')) return 'NO CONTACTO';
  if (m.includes('FALTA DOUMENTACION') || m.includes('FALTA DOCUMENTACION') || m.includes('FALTA DOCUMENTACIÓN')) return 'FALTA DOCUMENTACIÓN';
  if (m === 'FAMILIAR' || m.includes('FAMILIAR')) return 'FAMILIAR';
  if (m === 'SALUD' || m.includes('SALUD')) return 'SALUD';
  if (m === 'MEJOR OFERTA LABORAL') return 'MEJOR OFERTA LABORAL';
  if (m === 'OFERTA NO FAVORABLE') return 'OFERTA NO FAVORABLE';
  if (m.includes('OFERTA LABORAL')) return 'OFERTA LABORAL';
  if (m === 'ESTUDIA DERECHO') return 'ESTUDIA DERECHO';
  if (m.includes('ESTUDIO') || m.includes('ESTUDIOS')) return 'ESTUDIOS';
  if (m.includes('VIAJE')) return 'VIAJE';
  if (m.includes('FACILIDADES TECNICA') || m.includes('FACILIDADES TÉCNICA')) return 'FACILIDADES TÉCNICAS';
  if (m.includes('FALTAS CONSECUTIVA') || m.includes('FALTAS CONSTANTE') || m.includes('FALTAS REITERADA')) return 'FALTAS CONSECUTIVAS';
  if (m.includes('TARDANZAS CONSECUTIVA')) return 'TARDANZAS CONSECUTIVAS';
  if (m.includes('BLACK LIST CLIENTE')) return 'BLACK LIST CLIENTE';
  if (m.includes('BLACK LIST GEA') || m.includes('BLACKLIST')) return 'BLACK LIST GEA';
  if (m.includes('HABILIDAD COMERCIAL')) return 'HABILIDAD COMERCIAL';
  if (m.includes('HABILIDAD ATC')) return 'HABILIDAD ATC';
  if (m.includes('DICCION') || m.includes('DICCIÓN')) return 'DICCIÓN';
  if (m.includes('DESAPROBADO EN OJT')) return 'DESAPROBADO EN OJT';
  if (m === 'DESAPROBADO') return 'DESAPROBADO';
  if (m.includes('ECONOMICO') || m.includes('ECONÓMICO')) return 'ECONÓMICO';
  if (m.includes('REINGRESO NO APTO')) return 'REINGRESO NO APTO';
  if (m.includes('DESISTIMIENTO POR CONTRATO') || m.includes('DESISTIMIENTO')) return 'DESISTIMIENTO POR CONTRATO';
  if (m.includes('DISTANCIA')) return 'DISTANCIA';
  if (m.includes('ACTITUD')) return 'ACTITUD';
  if (m.includes('MANEJO DE PC')) return 'MANEJO DE PC';
  if (m.includes('EMBARAZO')) return 'EMBARAZO';
  if (m.includes('USUARIO ACTIVO EN OTRO CALL')) return 'USUARIO ACTIVO EN OTRO CALL';
  if (m.includes('USUARIOS SIN ACCESOS')) return 'USUARIOS SIN ACCESOS COMPLETOS';
  if (m.includes('SOBREDOTACION') || m.includes('SOBREDOTACIÓN')) return 'SOBREDOTACIÓN';
  if (m.includes('PERFIL DEL POSTULANTE')) return 'PERFIL DEL POSTULANTE';
  if (m.includes('RETIRO APROBADO POR JEFATURA')) return 'RETIRO APROBADO POR JEFATURA';

  return m;
}

const VALID_ROLES = ['admin', 'reclutador', 'formador', 'visor', 'supervisor_capacitacion', 'coordinador_capacitacion', 'coordinador_rys', 'jefe_rys', 'jefe_capacitacion', 'calidad', 'gestor_experiencia']

function profileFromSession(sessionUser) {
  const meta = sessionUser?.user_metadata || {}
  const rol = VALID_ROLES.includes(meta.rol) ? meta.rol : 'visor'
  return {
    id: sessionUser.id,
    nombre: meta.nombre || sessionUser.email?.split('@')[0] || 'Usuario',
    rol,
    cargo: meta.cargo || null,
    telefono: meta.telefono || null,
    avatar_url: meta.avatar_url || null,
  }
}

export async function fetchUserProfile(userId, sessionUser = null) {
  if (DB_MODE !== 'supabase') {
    try {
      const stored = JSON.parse(localStorage.getItem('gea-perfil') || '{}')
      return { id: 'demo', nombre: 'Usuario Demo', rol: 'admin', ...stored }
    } catch {
      return { id: 'demo', nombre: 'Usuario Demo', rol: 'admin' }
    }
  }

  const attachNombreCompleto = async (profile, sessionUser = null) => {
    if (!profile) return profile;
    try {
      const email = String(sessionUser?.email || '').toLowerCase().trim();
      const userAlix = email.includes('@') ? email.split('@')[0] : '';
      const searchTerm = String(profile.nombre || '').trim();

      // 1. Check in equipo_reclutamiento
      if (userAlix) {
        const { data: recByAlix } = await supabase
          .from('equipo_reclutamiento')
          .select('documento, apellido_paterno, apellido_materno, nombres_completos, alix, cargo')
          .eq('alix', userAlix)
          .maybeSingle();

        if (recByAlix) {
          const full = `${recByAlix.apellido_paterno || ''} ${recByAlix.apellido_materno || ''} ${recByAlix.nombres_completos || ''}`.trim().replace(/\s+/g, ' ');
          profile.nombre_completo = full;
          profile.nombre = full;
          profile.documento = recByAlix.documento;
          profile.dni = recByAlix.documento;
          profile.nombres = recByAlix.nombres_completos;
          profile.nombres_completos = recByAlix.nombres_completos;
          profile.apellido_paterno = recByAlix.apellido_paterno;
          profile.apellido_materno = recByAlix.apellido_materno;
          profile.primer_nombre = String(recByAlix.nombres_completos || '').trim().split(' ')[0] || '';
          profile.cargo = recByAlix.cargo;
          profile.es_reclutador = true;
          if (profile.rol === 'visor' || !profile.rol) {
            profile.rol = 'reclutador';
          }
          return profile;
        }
      }

      if (searchTerm) {
        const { data: recData } = await supabase
          .from('equipo_reclutamiento')
          .select('documento, apellido_paterno, apellido_materno, nombres_completos, alix, cargo')
          .or(`alix.eq.${searchTerm},nombres_completos.eq.${searchTerm}`)
          .maybeSingle();

        if (recData) {
          const full = `${recData.apellido_paterno || ''} ${recData.apellido_materno || ''} ${recData.nombres_completos || ''}`.trim().replace(/\s+/g, ' ');
          profile.nombre_completo = full;
          profile.nombre = full;
          profile.documento = recData.documento;
          profile.dni = recData.documento;
          profile.nombres = recData.nombres_completos;
          profile.nombres_completos = recData.nombres_completos;
          profile.apellido_paterno = recData.apellido_paterno;
          profile.apellido_materno = recData.apellido_materno;
          profile.primer_nombre = String(recData.nombres_completos || '').trim().split(' ')[0] || '';
          profile.cargo = recData.cargo;
          profile.es_reclutador = true;
          if (profile.rol === 'visor' || !profile.rol) {
            profile.rol = 'reclutador';
          }
          return profile;
        }
      }

      // 2. Check in equipo_formacion
      if (userAlix) {
        const { data: formByAlix } = await supabase
          .from('equipo_formacion')
          .select('documento, apellido_paterno, apellido_materno, nombres_completos, usuario_alix, cargo_funcional')
          .eq('usuario_alix', userAlix)
          .maybeSingle();

        if (formByAlix) {
          const full = `${formByAlix.apellido_paterno || ''} ${formByAlix.apellido_materno || ''} ${formByAlix.nombres_completos || ''}`.trim().replace(/\s+/g, ' ');
          profile.nombre_completo = full;
          profile.nombre = full;
          profile.documento = formByAlix.documento;
          profile.formador_documento = formByAlix.documento;
          profile.nombres = formByAlix.nombres_completos;
          profile.nombres_completos = formByAlix.nombres_completos;
          profile.apellido_paterno = formByAlix.apellido_paterno;
          profile.apellido_materno = formByAlix.apellido_materno;
          profile.primer_nombre = String(formByAlix.nombres_completos || '').trim().split(' ')[0] || '';
          profile.cargo = formByAlix.cargo_funcional;
          profile.es_formador = true;
          if (profile.rol === 'visor' || !profile.rol) {
            profile.rol = 'formador';
          }
          return profile;
        }
      }

      if (searchTerm) {
        const { data: formData } = await supabase
          .from('equipo_formacion')
          .select('documento, apellido_paterno, apellido_materno, nombres_completos, usuario_alix, cargo_funcional')
          .or(`usuario_alix.eq.${searchTerm},nombres_completos.eq.${searchTerm}`)
          .maybeSingle();

        if (formData) {
          const full = `${formData.apellido_paterno || ''} ${formData.apellido_materno || ''} ${formData.nombres_completos || ''}`.trim().replace(/\s+/g, ' ');
          profile.nombre_completo = full;
          profile.nombre = full;
          profile.documento = formData.documento;
          profile.formador_documento = formData.documento;
          profile.nombres = formData.nombres_completos;
          profile.nombres_completos = formData.nombres_completos;
          profile.apellido_paterno = formData.apellido_paterno;
          profile.apellido_materno = formData.apellido_materno;
          profile.primer_nombre = String(formData.nombres_completos || '').trim().split(' ')[0] || '';
          profile.cargo = formData.cargo_funcional;
          profile.es_formador = true;
          if (profile.rol === 'visor' || !profile.rol) {
            profile.rol = 'formador';
          }
          return profile;
        }
      }
    } catch(e) {
      console.warn("attachNombreCompleto error:", e);
    }
    
    profile.nombre_completo = profile.nombre;
    return profile;
  };

  // 1. Intentar RPC get_my_profile
  const { data: rpcData, error: rpcErr } = await supabase.rpc('get_my_profile')
  if (!rpcErr && rpcData) return await attachNombreCompleto(rpcData, sessionUser)

  // 2. Consulta canónica a perfiles incluyendo segmento si existe
  let { data, error } = await supabase
    .from('perfiles')
    .select('id, nombre, rol, segmento')
    .eq('id', userId)
    .maybeSingle()

  if (error && (error.code === 'PGRST204' || error.message?.includes('segmento') || error.code === '42703')) {
    const fallbackRes = await supabase
      .from('perfiles')
      .select('id, nombre, rol')
      .eq('id', userId)
      .maybeSingle()
    data = fallbackRes.data
    error = fallbackRes.error
  }

  if (error) throw error
  if (data) return await attachNombreCompleto(data, sessionUser)

  // Perfil ausente: intentar crear desde metadata de la sesión
  if (sessionUser) {
    const bootstrap = profileFromSession(sessionUser)
    const { data: inserted, error: insErr } = await supabase
      .from('perfiles')
      .upsert(bootstrap)
      .select('id, nombre, rol')
      .single()
    if (!insErr && inserted) return await attachNombreCompleto(inserted)
    return await attachNombreCompleto(bootstrap)
  }

  return null
}

// ─────────────────────────────────────────────
// ROLES DINÁMICOS
// ─────────────────────────────────────────────
export const DEFAULT_CONFIG_ROLES = [
  { id: 'admin', label: 'Admin', short_label: 'A', description: 'Acceso total a todos los módulos y configuraciones.', color: 'bg-rose-500/10 text-rose-500 border-rose-500/20', dot_color: 'bg-rose-500', icon: 'Crown' },
  { id: 'reclutador', label: 'Reclutador', short_label: 'R', description: 'Gestión de nóminas, ingresos y KPIs de reclutamiento.', color: 'bg-blue-500/10 text-blue-500 border-blue-500/20', dot_color: 'bg-blue-500', icon: 'Briefcase' },
  { id: 'formador', label: 'Formador', short_label: 'F', description: 'Gestión de aulas, asistencias y reportes de deserción.', color: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20', dot_color: 'bg-emerald-500', icon: 'BookOpen' },
  { id: 'visor', label: 'Directivo', short_label: 'V', description: 'Acceso exclusivo a dashboards y reportes gerenciales.', color: 'bg-purple-500/10 text-purple-500 border-purple-500/20', dot_color: 'bg-purple-500', icon: 'TrendingUp' },
  { id: 'supervisor_capacitacion', label: 'Supervisor Cap.', short_label: 'SC', description: 'Gestión y supervisión de equipos de formación.', color: 'bg-orange-500/10 text-orange-500 border-orange-500/20', dot_color: 'bg-orange-500', icon: 'Users' },
  { id: 'coordinador_capacitacion', label: 'Coordinador Cap.', short_label: 'CC', description: 'Coordinación operativa y seguimiento de capacitación / formación.', color: 'bg-amber-600/10 text-amber-500 border-amber-600/20', dot_color: 'bg-amber-600', icon: 'GraduationCap' },
  { id: 'coordinador_rys', label: 'Coordinador RYS', short_label: 'CR', description: 'Coordinación operativa de reclutamiento y selección.', color: 'bg-cyan-500/10 text-cyan-500 border-cyan-500/20', dot_color: 'bg-cyan-500', icon: 'UserPlus' },
  { id: 'jefe_rys', label: 'Jefe RYS', short_label: 'JR', description: 'Jefatura general de reclutamiento y selección.', color: 'bg-sky-500/10 text-sky-500 border-sky-500/20', dot_color: 'bg-sky-500', icon: 'Shield' },
  { id: 'jefe_capacitacion', label: 'Jefe Cap.', short_label: 'JC', description: 'Jefatura general de formación y capacitación.', color: 'bg-amber-500/10 text-amber-500 border-amber-500/20', dot_color: 'bg-amber-500', icon: 'BookOpen' },
  { id: 'calidad', label: 'Calidad', short_label: 'Q', description: 'Monitoreo, control de calidad y auditoría de procesos en modo visor.', color: 'bg-teal-500/10 text-teal-500 border-teal-500/20', dot_color: 'bg-teal-500', icon: 'CheckSquare' },
  { id: 'gestor_experiencia', label: 'Gestor de Experiencia', short_label: 'GE', description: 'Gestión y recuperación de personas desertadas. Acceso a mapa, motivos de baja, nóminas y dispersión.', color: 'bg-violet-500/10 text-violet-400 border-violet-500/20', dot_color: 'bg-violet-400', icon: 'HeartHandshake' }
];

export function fetchAppRoles() {
  return withCache('config_roles', 600000, async () => {
    if (DB_MODE !== 'supabase') return DEFAULT_CONFIG_ROLES
    const { data, error } = await supabase.from('config_roles').select('*').order('created_at', { ascending: true })
    if (error) {
      console.warn('Error fetching config_roles, using defaults:', error.message)
      return DEFAULT_CONFIG_ROLES
    }
    if (!data || data.length === 0) return DEFAULT_CONFIG_ROLES

    // Merge default roles if any (e.g. coordinador_capacitacion) is not yet in the DB
    const existingIds = new Set(data.map(r => r.id))
    const missing = DEFAULT_CONFIG_ROLES.filter(r => !existingIds.has(r.id))
    return [...data, ...missing]
  });
}

export async function createAppRole(roleData) {
  if (DB_MODE !== 'supabase') return null
  const { data, error } = await supabase.from('config_roles').insert([roleData]).select().single()
  if (error) throw error
  invalidateCache('config_roles')
  return data
}

const normalizeGPE = (val) => String(val || '').replace(/^GPE-?/i, '').trim();
const normalizeCampana = (c) => String(c || '').toUpperCase().replace(/\s+/g, '');
const normalizeDNI = (d) => String(d || '').trim(); // Don't padStart yet in case CE is alphanumeric

export const cleanGroupCode = (val) => {
  if (!val) return '';
  return String(val)
    .trim()
    .toUpperCase()
    .replace(/\s*\(SEM\s*\d+.*?\)/i, '')
    .replace(/\s*-\s*SEM\s*\d+.*$/i, '')
    .replace(/_\d+$/, '')
    .trim();
};

const makeDescuentoKey = (doc, camp, grupo) => {
  return `${normalizeDNI(doc)}|${normalizeCampana(camp)}|${normalizeGPE(grupo)}`;
}

export function getDescuentosSetGlobal() {
  // QW-3: Cachear el cálculo del Set de descuentos autorizados (TTL: 5 min)
  return withCache('descuentos_set_global', 300000, async () => {
    if (DB_MODE !== 'supabase') return new Set();
    
    let allData = [];
    let from = 0;
    const step = 1000;
    let hasMore = true;
    
    while(hasMore) {
      const { data } = await supabase.from('descuentos')
        .select('dni_ce, campana, grupo_cap, procede, autoriza_rys, autoriza_cap, fecha_registro, fecha_baja')
        .range(from, from + step - 1);
        
      if (data && data.length > 0) {
        allData = allData.concat(data);
        if (data.length < step) hasMore = false;
        else from += step;
      } else {
        hasMore = false;
      }
    }
    
    const procedeData = allData.filter(row => {
      const procedeStr = String(row.procede || '').trim().toUpperCase();
      const rysStr = String(row.autoriza_rys || '').trim().toUpperCase();

      // Si fue explícitamente rechazado por RyS o marcado NO PROCEDE, JAMÁS debe considerarse procede
      if (procedeStr === 'NO PROCEDE' || procedeStr === 'NO' || rysStr === 'NO') return false;

      // Si la BD tiene explícitamente "PROCEDE" o "APROBADO"
      if (procedeStr === 'PROCEDE' || procedeStr === 'APROBADO') return true;
      
      // Regla de negocio explícita (autoriza_rys = SI y autoriza_cap = SI/Vacio)
      const rys = rysStr === 'SI';
      const cap = (String(row.autoriza_cap || '').trim().toUpperCase() === 'SI' || !row.autoriza_cap);
      if (rys && cap) return true;

      // Regla 48h hábiles (sin contar domingos ni feriados de Perú)
      const regTime = row.fecha_registro || row.created_at || row.fecha_baja;
      if (isDescuentoVencido48h(regTime)) return true;

      return false;
    });
    
    const set = new Set();
    procedeData.forEach(d => {
      const dni = normalizeDNI(d.dni_ce);
      const camp = normalizeCampana(d.campana);
      const grupo = normalizeGPE(d.grupo_cap);
      const rawGrupo = String(d.grupo_cap || '').trim().toUpperCase();
      const cleanCode = cleanGroupCode(d.grupo_cap);

      if (dni) {
        // Llaves compuestas estrictas: DNI + Campaña + Grupo
        if (camp && grupo) set.add(`${dni}|${camp}|${grupo}`);
        if (camp && rawGrupo) set.add(`${dni}|${camp}|${rawGrupo}`);
        if (camp && cleanCode) set.add(`${dni}|${camp}|${cleanCode}`);
        set.add(makeDescuentoKey(dni, d.campana, d.grupo_cap));
        // Llaves compuestas por DNI + Grupo (aislado por cohorte/grupo de capacitación)
        if (grupo) set.add(`${dni}|${grupo}`);
        if (cleanCode) set.add(`${dni}|${cleanCode}`);
        if (rawGrupo) set.add(`${dni}|${rawGrupo}`);
      }
    });
    return set;
  });
}

export async function fetchAllConsolidado({ periodo = null, all = false, since = null } = {}) {
  let cacheKey = 'all_consolidado_recent';
  if (all) {
    cacheKey = 'all_consolidado_full';
  } else if (periodo) {
    cacheKey = `consolidado_periodo_${periodo}`;
  } else if (since) {
    cacheKey = `consolidado_since_${since}`;
  }

  return withCache(cacheKey, 180000, async () => {
    let countQuery = supabase
      .from('consolidado_asistencias')
      .select('*', { count: 'exact', head: true });

    let cutoffIso = null;
    if (!all && !periodo) {
      // Corte operativo: desde julio 2026 (margen sobre 202608) salvo que pidan histórico completo
      const d = since ? new Date(since) : new Date(Date.UTC(2026, 6, 1));
      d.setHours(0, 0, 0, 0);
      cutoffIso = d.toISOString();
      countQuery = countQuery.or(`created_at.gte.${cutoffIso},created_at.is.null`);
    } else if (periodo) {
      const pClean = String(periodo).trim();
      const yyyy = pClean.slice(0, 4);
      const mm = pClean.slice(4, 6);
      countQuery = countQuery.or(`archivo_origen.ilike.%${pClean}%,fecha_registro_asistencia.ilike.%/${mm}/${yyyy}%,fecha_registro_asistencia.ilike.%${yyyy}-${mm}%`);
    }

    const { count, error: countErr } = await countQuery;
    if (countErr) throw countErr;

    const totalCount = count || 0;
    if (totalCount === 0) return [];

    const step = 5000;
    const chunkPromises = [];
    for (let from = 0; from < totalCount; from += step) {
      let dataQuery = supabase
        .from('consolidado_asistencias')
        .select('id, documento, motivo_baja, fecha_registro_asistencia, campana, codigo_grupo, grupo, nombre_formador, apellido_paterno, apellido_materno, nombres, sigla, estado, condicion_laboral, tipo_reclutado, archivo_origen, corte, fecha_hora_registro')
        .order('id', { ascending: true })
        .range(from, from + step - 1);

      if (!all && !periodo && cutoffIso) {
        dataQuery = dataQuery.or(`created_at.gte.${cutoffIso},created_at.is.null`);
      } else if (periodo) {
        const pClean = String(periodo).trim();
        const yyyy = pClean.slice(0, 4);
        const mm = pClean.slice(4, 6);
        dataQuery = dataQuery.or(`archivo_origen.ilike.%${pClean}%,fecha_registro_asistencia.ilike.%/${mm}/${yyyy}%,fecha_registro_asistencia.ilike.%${yyyy}-${mm}%`);
      }

      chunkPromises.push(dataQuery);
    }

    const [descSet, ...results] = await Promise.all([
      getDescuentosSetGlobal(),
      ...chunkPromises
    ]);

    let allData = [];
    for (const res of results) {
      if (res.error) throw res.error;
      if (res.data && res.data.length > 0) {
        allData = allData.concat(res.data);
      }
    }

    // Marcar si el registro cuenta con descuento aprobado sin removerlo del historial de asistencias
    if (descSet && descSet.size > 0) {
      for (let i = 0; i < allData.length; i++) {
        const row = allData[i];
        const doc = normalizeDNI(row.documento);
        const grp = row.codigo_grupo || row.grupo;
        row.isDescuento = descSet.has(makeDescuentoKey(row.documento, row.campana, row.codigo_grupo)) ||
                          descSet.has(makeDescuentoKey(row.documento, row.campana, row.grupo)) ||
                          descSet.has(`${doc}|${cleanGroupCode(grp)}`) ||
                          descSet.has(`${doc}|${normalizeGPE(grp)}`);
      }
    }

    return allData;
  });
}

export async function fetchConsolidadoOnDemand({ semana = null, gpe = null, campana = null } = {}) {
  if (DB_MODE !== 'supabase') return [];

  const cleanSem = semana && semana !== 'Todas' ? String(semana).trim().toUpperCase() : null;
  const cleanGpe = gpe && gpe !== 'Todas' ? String(gpe).trim().toUpperCase() : null;
  const cleanCamp = campana && campana !== 'Todas' && campana !== 'Sin campaña' ? String(campana).trim().toUpperCase() : null;

  if (!cleanSem && !cleanGpe) return [];

  const semNum = cleanSem ? cleanSem.replace(/\D/g, '') : '';
  const semTag = semNum ? `SEM${semNum}` : cleanSem;

  const cacheKey = `ondemand_${cleanGpe || 'all'}_${semTag || 'all'}_${cleanCamp || 'all'}`;

  return withCache(cacheKey, 300000, async () => {
    const buildBaseQuery = () => {
      let q = supabase
        .from('consolidado_asistencias')
        .select('id, documento, motivo_baja, fecha_registro_asistencia, campana, codigo_grupo, grupo, nombre_formador, apellido_paterno, apellido_materno, nombres, sigla, estado, condicion_laboral, tipo_reclutado, archivo_origen, corte, fecha_hora_registro');

      if (cleanGpe) {
        q = q.or(`codigo_grupo.ilike.%${cleanGpe}%,grupo.ilike.%${cleanGpe}%`);
      } else if (semTag) {
        q = q.ilike('archivo_origen', `%${semTag}%`);
      }

      if (cleanCamp) {
        q = q.ilike('campana', `%${cleanCamp}%`);
      }
      return q.order('created_at', { ascending: true });
    };

    let allData = [];
    let from = 0;
    const step = 2500;
    let hasMore = true;

    while (hasMore) {
      const q = buildBaseQuery().range(from, from + step - 1);
      const { data, error } = await q;
      if (error) {
        console.error('Error fetching on demand:', error);
        throw error;
      }
      if (data && data.length > 0) {
        allData = allData.concat(data);
        if (data.length < step || allData.length >= 10000) {
          hasMore = false;
        } else {
          from += step;
        }
      } else {
        hasMore = false;
      }
    }

    const descSet = await getDescuentosSetGlobal();
    if (descSet && descSet.size > 0) {
      for (let i = 0; i < allData.length; i++) {
        const row = allData[i];
        row.isDescuento = descSet.has(makeDescuentoKey(row.documento, row.campana, row.codigo_grupo));
      }
    }

    return allData;
  });
}

export async function getFirstDateFormador(grupo_codigo, campana) {
  if (DB_MODE !== 'supabase') return null;

  // 1. Prioridad: Fecha oficial de inicio según capacidad_rys
  let fechaInicioRef = null;
  try {
    let qCap = supabase.from('capacidad_rys').select('fecha_registro, fecha_dia_1').eq('codigo', grupo_codigo);
    if (campana && campana !== 'Sin Campaña' && campana !== 'Todas') {
      qCap = qCap.ilike('campana', `%${campana}%`);
    }
    const { data: capData } = await qCap.limit(1).maybeSingle();
    if (capData) {
      if (capData.fecha_dia_1) {
        return capData.fecha_dia_1;
      }
      if (capData.fecha_registro) {
        const start = new Date(capData.fecha_registro + 'T12:00:00Z');
        if (String(grupo_codigo).startsWith('GPE')) {
          start.setUTCDate(start.getUTCDate() + 1);
          if (start.getUTCDay() === 0) start.setUTCDate(start.getUTCDate() + 1);
        }
        fechaInicioRef = start.toISOString().split('T')[0];
      }
    }
  } catch (err) {
    console.error('Error obteniendo fecha de capacidad_rys:', err);
  }

  // 2. Buscar asistencias del formador en consolidado_asistencias
  let qAsis = supabase.from('consolidado_asistencias')
    .select('fecha_registro_asistencia')
    .eq('codigo_grupo', grupo_codigo);
  if (campana && campana !== 'Sin Campaña' && campana !== 'Todas') {
    qAsis = qAsis.eq('campana', campana);
  }
  const { data } = await qAsis;
    
  if (!data || data.length === 0) return fechaInicioRef;
  
  let earliestIso = null;
  for (const row of data) {
    if (row.fecha_registro_asistencia) {
      const iso = parseFechaAsistencia(row.fecha_registro_asistencia);
      // Si tenemos fechaInicioRef, solo considerar fechas a partir de la fecha de inicio del grupo
      if (iso && (!fechaInicioRef || iso >= fechaInicioRef) && (!earliestIso || iso < earliestIso)) {
        earliestIso = iso;
      }
    }
  }
  return earliestIso || fechaInicioRef;
}

export async function getMetricasReporteCalibracion(grupo_codigo, campana) {
  if (DB_MODE !== 'supabase') return null;

  const { data: nominas } = await supabase.from('nominas').select('documento, dia_0, dia_1, activo').eq('grupo_codigo', grupo_codigo).eq('campana', campana);
  
  let totalNomina = 0;
  let totalDia0 = 0;
  let countRec = 0;
  
  const descSet = await getDescuentosSetGlobal();
  const validNominas = nominas && descSet.size > 0 
    ? nominas.filter(n => !descSet.has(makeDescuentoKey(n.documento, campana, grupo_codigo)))
    : (nominas || []);
    
  totalNomina = validNominas.length;
  totalDia0 = validNominas.filter(n => String(n.dia_0).toUpperCase().trim() === 'ASISTIO').length;
  
  const { data: rawFormAsis } = await supabase.from('consolidado_asistencias')
    .select('documento, motivo_baja, estado')
    .eq('codigo_grupo', grupo_codigo)
    .eq('campana', campana);

  const groupFormAsisRaw = rawFormAsis || [];

  for (const n of validNominas) {
    if (String(n.dia_1).toUpperCase().trim() === 'ASISTIO') {
      const records = groupFormAsisRaw.filter(r => r.documento === n.documento);
      const isBajaDia1 = records.some(r => {
        const m = String(r.motivo_baja || '').toUpperCase();
        const e = String(r.estado || '').toUpperCase();
        return m.includes('BAJA DIA 1') || e.includes('BAJA DIA 1');
      });
      if (!isBajaDia1) {
        countRec++;
      }
    }
  }
  
  const { data: config } = await supabase.from('grupos_dia1').select('estado_calibracion, fecha_dia1').eq('grupo_codigo', grupo_codigo).eq('campana', campana).limit(1).maybeSingle();
  let fecha_dia1_ref = config?.fecha_dia1 || null;

  if (!fecha_dia1_ref) {
    fecha_dia1_ref = await getFirstDateFormador(grupo_codigo, campana);
  }
  const counts = await getCalibracionCounts(grupo_codigo, campana);
  const countForm = counts.form;

  let estado_calibracion = 'PENDIENTE';
  if (!fecha_dia1_ref || (countRec === 0 && countForm === 0)) {
    estado_calibracion = 'PENDIENTE';
  } else if (countRec !== countForm) {
    estado_calibracion = 'DESCALIBRADO';
  } else if (countRec > 0 && countForm > 0 && countRec === countForm) {
    estado_calibracion = 'CALIBRADO';
  } else {
    estado_calibracion = 'PENDIENTE';
  }

  return {
    totalNomina,
    totalDia0,
    totalDia1: countRec,
    totalFormador: countForm,
    estado_calibracion,
    fecha_dia1: fecha_dia1_ref
  }
}

export async function adminResetUserPassword(userId, newPassword) {
  if (DB_MODE !== 'supabase') throw new Error('Solo disponible en Supabase.')
  
  // Método principal: RPC en PostgreSQL (rápido, directo, sin errores de Edge Function ni CORS)
  const { data: rpcData, error: rpcError } = await supabase.rpc('admin_reset_user_password', {
    p_user_id: userId,
    p_password: newPassword
  })
  
  if (!rpcError && rpcData) {
    return rpcData
  }

  // Si falló el RPC por alguna razón, intentamos como respaldo con Edge Function
  const { data, error } = await supabase.functions.invoke('reset-user-password', {
    body: { userId, password: newPassword }
  })
  
  if (error) {
    throw new Error(rpcError?.message || error.message || 'No se pudo actualizar la contraseña.')
  }
  return data
}

export async function createUserAccount({ email, password, nombre, rol }) {
  if (DB_MODE !== 'supabase') {
    throw new Error('Creación de usuarios disponible solo con Supabase activo.')
  }

  const cleanEmail = email.trim().toLowerCase()
  const safeRol = VALID_ROLES.includes(rol) ? rol : 'visor'
  const displayName = nombre.trim() || cleanEmail.split('@')[0]

  // Método principal: RPC en PostgreSQL (no requiere Edge Function)
  const { data: rpcData, error: rpcError } = await supabase.rpc('admin_create_user', {
    p_email: cleanEmail,
    p_password: password,
    p_nombre: displayName,
    p_rol: safeRol,
  })

  if (!rpcError && rpcData) {
    return {
      id: rpcData.id,
      email: rpcData.email || cleanEmail,
      nombre: rpcData.nombre || displayName,
      rol: rpcData.rol || safeRol,
    }
  }

  const rpcMsg = rpcError?.message || ''
  const rpcMissing = rpcMsg.includes('admin_create_user') && (
    rpcMsg.includes('does not exist') || rpcMsg.includes('Could not find')
  )

  if (!rpcMissing) {
    if (rpcMsg.includes('Ya existe') || rpcMsg.includes('already')) {
      const { data: existingProfile } = await supabase
        .from('perfiles')
        .select('id, nombre, rol')
        .or(`nombre.ilike.%${displayName}%,nombre.ilike.%${cleanEmail.split('@')[0]}%`)
        .limit(1)
        .maybeSingle()

      if (existingProfile?.id) {
        await adminResetUserPassword(existingProfile.id, password)
        await updateUserRole(existingProfile.id, safeRol)
        return {
          id: existingProfile.id,
          email: cleanEmail,
          nombre: displayName,
          rol: safeRol
        }
      }
    }
    throw new Error(rpcMsg || 'No se pudo crear el usuario')
  }

  // Respaldo: Edge Function (si está desplegada)
  const { data, error } = await supabase.functions.invoke('create-user', {
    body: {
      email: cleanEmail,
      password,
      nombre: displayName,
      rol: safeRol,
    },
  })

  if (error) {
    throw new Error(
      'No se pudo crear el usuario. Ejecuta: npm run db:create-user-rpc'
    )
  }

  if (data?.error) throw new Error(data.error)
  return data?.user
}

export async function updateUserRole(userId, newRole, segmento = null) {
  if (!VALID_ROLES.includes(newRole)) throw new Error('Rol inválido')
  
  const payload = { rol: newRole }
  if ((newRole === 'supervisor_capacitacion' || newRole === 'coordinador_capacitacion') && segmento !== undefined) {
    payload.segmento = segmento || null
  }

  const { error } = await supabase
    .from('perfiles')
    .update(payload)
    .eq('id', userId)

  if (error) {
    // Si la columna segmento aún no fue agregada a la tabla perfiles vía SQL, guardar rol canónico
    if (error.message?.includes('segmento') || error.code === 'PGRST204' || error.code === '42703') {
      const { error: fallbackErr } = await supabase
        .from('perfiles')
        .update({ rol: newRole })
        .eq('id', userId)
      if (fallbackErr) throw fallbackErr
      return
    }
    throw error
  }
}

export async function signOut() {
  if (DB_MODE !== 'supabase') return
  await supabase.auth.signOut()
}

// ─────────────────────────────────────────────
// POSTULANTES / NÓMINAS (schema v2)
// ─────────────────────────────────────────────

async function resolveOrCreateCatalog(table, nameCol, name) {
  if (!name?.trim()) return null
  const clean = name.trim().toUpperCase()
  const { data: existing } = await supabase.from(table).select('codigo').ilike(nameCol, clean).maybeSingle()
  if (existing) return existing.id
  const { data: created, error } = await supabase.from(table).insert({ [nameCol]: clean }).select('codigo').single()
  if (error) throw error
  return created.id
}

/** Crea o resuelve entrada en catálogo — usable desde formularios antes de guardar nómina */
export async function ensureReclutador(nombre) {
  if (!nombre?.trim()) throw new Error('Ingresa el nombre del reclutador.')
  const clean = nombre.trim().toUpperCase()
  if (DB_MODE === 'supabase') {
    return resolveOrCreateCatalog('reclutadores', 'nombre_completo', clean)
  }
  const list = getFromStorage('reclutadores') || []
  if (!list.some(r => String(r).toUpperCase() === clean)) {
    saveToStorage('reclutadores', [...list, clean])
  }
  return clean
}

export async function ensureSede(nombre) {
  const clean = nombre?.trim().toUpperCase()
  if (!clean) throw new Error('Ingresa la sede.')
  if (DB_MODE === 'supabase') {
    // No-op since sede is a string column
    return clean
  }
  const list = getFromStorage('sedes') || []
  if (!list.includes(clean)) {
    saveToStorage('sedes', [...list, clean])
  }
  return clean
}

export async function ensureCampana(nombre, segmento) {
  const clean = nombre?.trim().toUpperCase()
  if (!clean) throw new Error('Ingresa la campaña.')
  if (DB_MODE === 'supabase') {
    return { nombre: clean, segmento: segmento?.trim().toUpperCase() || '' }
  }
  const list = getFromStorage('campanas') || []
  let found = list.find(c => (c.nombre || c).toUpperCase() === clean)
  if (!found) {
    found = { id: Date.now(), nombre: clean, segmento: segmento || '' }
    saveToStorage('campanas', [...list, found])
  }
  return found
}

export async function ensureFormador(nombre, documento) {
  const nombreClean = nombre?.trim().toUpperCase()
  if (!nombreClean) throw new Error('Ingresa el nombre del capacitador.')
  const docClean = documento?.trim() || `F-${nombreClean.replace(/\s+/g, '').slice(0, 15)}`

  if (DB_MODE === 'supabase') {
    const { data: byDoc } = await supabase
      .from('formadores')
      .select('documento, nombre_completo')
      .eq('documento', docClean)
      .maybeSingle()
    if (byDoc) {
      if (byDoc.nombre_completo?.toUpperCase() !== nombreClean) {
        const { error } = await supabase
          .from('formadores')
          .update({ nombre_completo: nombreClean, estado: 'Activo' })
          .eq('documento', docClean)
        if (error) throw error
      }
      return docClean
    }
    const { data: byName } = await supabase
      .from('formadores')
      .select('documento')
      .ilike('nombre_completo', nombreClean)
      .maybeSingle()
    if (byName) return byName.documento

    const { error } = await supabase.from('formadores').insert({
      documento: docClean,
      nombre_completo: nombreClean,
      estado: 'Activo',
    })
    if (error) throw error
    return docClean
  }

  const list = getFromStorage('formadores') || []
  const idx = list.findIndex(f => f.documento === docClean || f.nombre_completo?.toUpperCase() === nombreClean)
  if (idx >= 0) return list[idx].documento
  list.push({ documento: docClean, nombre_completo: nombreClean, estado: 'Activo' })
  saveToStorage('formadores', list)
  return docClean
}

function buildNominaPayload(payload, ids) {
  return {
    documento: cleanDocumento(payload.documento),
    tipo_documento: payload.tipo_documento || 'DNI',
    apellido_paterno: payload.apellido_paterno,
    apellido_materno: payload.apellido_materno,
    nombres: payload.nombres,
    celular: payload.celular,
    celular_referencia: payload.celular_referencia || null,
    usuario_whatsapp: payload.usuario_whatsapp || null,
    celular_emergencia: payload.celular_emergencia || null,
    contacto_emergencia: payload.contacto_emergencia || null,
    parentesco: payload.parentesco || null,
    correo: payload.correo,
    genero: payload.genero,
    fecha_nacimiento: payload.fecha_nacimiento,
    edad: payload.edad || calcEdadFromFechaISO(payload.fecha_nacimiento) || null,
    estado_civil: payload.estado_civil,
    n_hijos: payload.n_hijos ?? 0,
    nivel_academico: payload.nivel_academico,
    carrera: payload.carrera || null,
    entidad: payload.entidad || null,
    nacionalidad: payload.nacionalidad || 'PERUANA',
    lugar_nacimiento: payload.lugar_nacimiento || null,
    lugar_residencia: payload.lugar_residencia || null,
    distrito_residencia: payload.distrito_residencia || null,
    direccion_domicilio: payload.direccion_domicilio || null,
    periodo_reclutado: payload.periodo_reclutado,
    semana_trabajo: payload.semana_trabajo,
    reclutador_id: ids.reclutador_id,
    sede: payload.sede,
    campana: payload.campana,
    segmento: payload.segmento,
    fuente_oferta: payload.fuente_oferta || null,
    observacion_reclutamiento: payload.observacion || payload.observacion_reclutamiento || null,
    exp_call_center: payload.exp_call_center ?? null,
    exp_tipo_campana: payload.exp_tipo_campana || null,
    exp_tiempo_campana: payload.exp_tiempo_campana || null,
    exp_otra: payload.exp_otra || null,
    exp_tiempo_otra: payload.exp_tiempo_otra || null,
    grupo_codigo: payload.grupo_codigo || null,
    formador_documento: payload.formador_documento || null,
    modalidad: payload.modalidad || null,
    condicion: payload.condicion || null,
    horario_gestion: payload.horario_gestion || payload.rango_horario || null,
    descanso: payload.descanso || null,
    envio_dni: payload.envio_dni || null,
    test_psicologico: payload.test_psicologico || null,
    validacion_pc: payload.validacion_pc || null,
    evaluacion_dia_0: payload.evaluacion_dia_0 || null,
    fecha_inicio_capacitacion: payload.fecha_inicio_capacitacion || null,
    fecha_fin_capacitacion: payload.fecha_fin_capacitacion || null,
    fecha_conexion_ojt: payload.fecha_conexion_ojt || null,
    fecha_conexion_op: payload.fecha_conexion_op || null,
    pago_capacitacion: payload.pago_capacitacion ?? null,
    fecha_inscripcion_curso: payload.fecha_inscripcion_curso || null,
    fecha_ingreso: payload.fecha_ingreso || null,
    tipo_trabajo: payload.tipo_trabajo || null,
    tipo_contratacion: payload.tipo_contratacion || null,
    razon_social: payload.razon_social || null,
    rango_salarial: payload.rango_salarial || null,
    remuneracion: payload.remuneracion ?? null,
    bono_variable: payload.bono_variable ?? null,
    bono_movilidad: payload.bono_movilidad ?? null,
    bono_bienvenida: payload.bono_bienvenida ?? null,
    bono_permanencia: payload.bono_permanencia ?? null,
    bono_asistencia_perfecta: payload.bono_asistencia_perfecta ?? null,
    bono_nocturno: payload.bono_nocturno ?? null,
    cargo_contractual: payload.cargo_contractual || null,
    dia_0: payload.dia_0 || null,
    dia_0_obs: payload.dia_0_obs || null,
    status_dia_1: payload.status_dia_1 || null,
    dia_1: payload.dia_1 || null,
    dia_1_obs: payload.dia_1_obs || null,
    doc_cv: payload.doc_cv || null,
    doc_dni_adjunto: payload.doc_dni_adjunto || null,
    doc_certijoven: payload.doc_certijoven || null,
    doc_recibo_servicios: payload.doc_recibo_servicios || null,
    doc_ficha_datos: payload.doc_ficha_datos || null,
    doc_autorizacion: payload.doc_autorizacion || null,
    revision_estado: payload.revision_estado || null,
    observacion_estado: payload.observacion_estado || null,
    estado: payload.estado || 'EN_CAPACITACION',
  }
}

export const POSTULANTES_COLUMNS = 'nomina_id, documento, tipo_documento, apellido_paterno, apellido_materno, nombres, celular, celular_referencia, usuario_whatsapp, correo, genero, edad, lugar_residencia, distrito_residencia, direccion_domicilio, periodo_reclutado, semana_trabajo, reclutador, sede, campana, segmento, reclutador_id, fuente_oferta, observacion_reclutamiento, grupo_codigo, modalidad, condicion, horario_gestion, fecha_inicio_capacitacion, fecha_fin_capacitacion, fecha_conexion_ojt, fecha_conexion_op, fecha_ingreso, dia_0, dia_0_obs, status_dia_1, dia_1, dia_1_obs, estado, activo, created_at';

/**
 * QW-2: Limita la descarga inicial de postulantes a 5000 registros para evitar transferencias
 * masivas y saturación en inicios de turno simultáneos.
 * Para obtener todo el histórico completo (ej. exportes Excel), pasar { all: true } o usar fetchAllPostulantes().
 */
export async function fetchPostulantes({ limit = 5000, all = false, periodoMin = null } = {}) {
  if (DB_MODE === 'supabase') {
    const cacheKey = all
      ? 'postulantes_all'
      : periodoMin
        ? `postulantes_desde_${periodoMin}`
        : `postulantes_${limit}`;
    return withCache(cacheKey, 180000, async () => {
      const mapRows = (rows) => (rows || []).map(row => ({
        ...row,
        campaign: row.campana,
        observacion: row.observacion_reclutamiento,
      }))

      const applyWindow = (query) => {
        if (all) return query
        if (periodoMin) {
          return query.or(`periodo_reclutado.gte.${periodoMin},created_at.gte.2026-07-01T00:00:00.000Z`)
        }
        if (limit) return query.limit(limit)
        return query
      }

      if (all || !periodoMin) {
        let query = applyWindow(
          supabase
            .from('v_nominas_consolidado')
            .select(POSTULANTES_COLUMNS)
            .order('created_at', { ascending: false })
        )
        const { data, error } = await query
        if (error) throw error
        return mapRows(data)
      }

      const pageSize = 1000
      const allRows = []
      let from = 0
      while (true) {
        const { data, error } = await applyWindow(
          supabase
            .from('v_nominas_consolidado')
            .select(POSTULANTES_COLUMNS)
            .order('created_at', { ascending: false })
            .range(from, from + pageSize - 1)
        )
        if (error) throw error
        const batch = data || []
        allRows.push(...batch)
        if (batch.length < pageSize) break
        from += pageSize
        if (from > 40000) break
      }
      return mapRows(allRows)
    });
  }
  initLocalStorageDb()
  const list = getFromStorage('postulantes') || []
  return all ? list : list.slice(0, limit)
}

/**
 * Consulta el histórico completo de postulantes/nóminas bajo demanda (para exportes o reportes).
 */
export async function fetchAllPostulantes() {
  return fetchPostulantes({ all: true })
}

/**
 * Consulta todos los postulantes de un reclutador específico, sin límite de filas.
 * Filtra por reclutador_id directamente en Supabase (server-side) para evitar el
 * límite de QW-2 y garantizar que el reclutador vea el 100% de su cartera.
 *
 * @param {number|null} reclutadorId - ID del reclutador de la tabla `reclutadores`
 * @param {string|null} reclutadorNombre - Nombre completo como fallback si no hay ID
 */
export async function fetchPostulantesReclutador(reclutadorId, reclutadorNombre = null) {
  if (DB_MODE === 'supabase') {
    let query = supabase
      .from('v_nominas_consolidado')
      .select(POSTULANTES_COLUMNS)
      .order('created_at', { ascending: false })

    if (reclutadorId) {
      query = query.eq('reclutador_id', reclutadorId)
    } else if (reclutadorNombre) {
      // Fallback: filtro por nombre si no hay reclutador_id mapeado
      query = query.ilike('reclutador', `%${reclutadorNombre}%`)
    } else {
      // Sin ID ni nombre: retornar vacío para no exponer datos de otros
      return []
    }

    const { data, error } = await query
    if (error) throw error
    return (data || []).map(row => ({
      ...row,
      campaign: row.campana,
      observacion: row.observacion_reclutamiento,
    }))
  }
  // Demo/localStorage: filtrar localmente por nombre como fallback
  const list = getFromStorage('postulantes') || []
  if (!reclutadorNombre) return list
  return list.filter(p =>
    p.reclutador?.toLowerCase().includes(reclutadorNombre.toLowerCase())
  )
}

export async function insertPostulante(payload) {
  if (DB_MODE === 'supabase') {
    const reclutador_id = await resolveOrCreateCatalog('reclutadores', 'nombre_completo', payload.reclutador)
    await ensureCampana(payload.campana, payload.segmento)

    let formador_documento = payload.formador_documento || null
    if (payload.formador_nombre?.trim()) {
      formador_documento = await ensureFormador(payload.formador_nombre, payload.formador_documento)
    }

    const nominaData = buildNominaPayload(payload, { reclutador_id })
    nominaData.formador_documento = formador_documento

    const { data: nominaId, error: rpcErr } = await supabase.rpc('registrar_nomina', { p_data: nominaData })
    if (rpcErr) throw rpcErr

    const { data, error } = await supabase
      .from('v_nominas_consolidado')
      .select('*')
      .eq('nomina_id', nominaId)
      .single()
    if (error) throw error
    
    invalidateCache('postulantes_');
    invalidateCache('all_consolidado');
    invalidateCache('resumen_cap_');
    return { ...data, campaign: data.campana, observacion: data.observacion_reclutamiento }
  }
  const list = getFromStorage('postulantes') || []
  const item = { ...payload, id: Date.now() }
  saveToStorage('postulantes', [...list, item])
  mockAuditLog('postulantes', 'INSERT', payload.documento, null, payload)
  return item
}

export async function insertPostulantesBulk(payloads) {
  const cleanPayloads = (payloads || []).filter(p => p && p.documento && String(p.documento).trim());
  if (cleanPayloads.length === 0) return { inserted: [], skipped: [], failed: [], results: [] };

  const targetGrupo = cleanPayloads[0].grupo_codigo;
  const existingDocs = new Set();
  const uniquePayloads = [];
  const skipped = [];

  for (const p of cleanPayloads) {
    const doc = String(p.documento).trim();
    if (existingDocs.has(doc)) {
      skipped.push(doc);
    } else {
      existingDocs.add(doc);
      uniquePayloads.push(p);
    }
  }

  if (DB_MODE === 'supabase') {
    const { data: rpcRes, error: rpcErr } = await supabase.rpc('registrar_nominas_bulk', { p_data: uniquePayloads });
    if (rpcErr) {
      console.error('Error en registrar_nominas_bulk:', rpcErr);
      throw rpcErr;
    }

    const insertedRows = (rpcRes?.inserted || []).map(row => ({
      ...row,
      campaign: row.campana,
      observacion: row.observacion_reclutamiento
    }));

    const failed = (rpcRes?.results || [])
      .filter(r => !r.success)
      .map(r => ({ documento: r.documento, reason: r.error }));

    // Generar asistencias asociadas únicamente para los postulantes insertados con éxito
    const insertedDocSet = new Set(insertedRows.map(r => r.documento));
    const allAsistenciaRecords = [];

    for (const p of uniquePayloads) {
      if (insertedDocSet.has(p.documento)) {
        const aRecords = asistenciaRecordsFromNominaRow(p);
        allAsistenciaRecords.push(...aRecords);
      }
    }

    if (allAsistenciaRecords.length > 0) {
      const groupsMap = new Map();
      allAsistenciaRecords.forEach(r => {
        const key = `${r.grupo_codigo}|${r.fecha_asistencia}`;
        if (!groupsMap.has(key)) groupsMap.set(key, { grupo_codigo: r.grupo_codigo, fecha_asistencia: r.fecha_asistencia, registros: [] });
        groupsMap.get(key).registros.push(r);
      });
      
      const asisPromises = [];
      for (const group of groupsMap.values()) {
        asisPromises.push(
          upsertAsistencias({
            grupo_codigo: group.grupo_codigo,
            fecha_asistencia: group.fecha_asistencia,
            records: group.registros
          }).catch(e => console.error("Error upserting asistencias for group:", group.grupo_codigo, e))
        );
      }
      if (asisPromises.length > 0) {
        await Promise.all(asisPromises);
      }
    }

    if (targetGrupo) {
      try {
        await checkCalibracionDia1(targetGrupo);
      } catch(e) {
        console.error("Error checkCalibracionDia1 from insertPostulantesBulk:", e);
      }
    }

    // Invalidar cachés operacionales para reflejar los nuevos registros de inmediato
    invalidateCache('all_consolidado');
    invalidateCache('resumen_cap_');

    return {
      inserted: insertedRows,
      skipped,
      failed,
      results: rpcRes?.results || []
    };
  }

  // Local/Demo Mode fallback
  const list = getFromStorage('postulantes') || [];
  const inserted = [];
  for (const payload of uniquePayloads) {
    const item = { ...payload, id: Date.now() + Math.random() };
    list.push(item);
    inserted.push(item);
  }
  saveToStorage('postulantes', list);
  return { inserted, skipped, failed: [], results: [] };
}


export async function updatePostulante(documento, payload) {
  if (DB_MODE === 'supabase') {
    const reclutador_id = payload.reclutador
      ? await resolveOrCreateCatalog('reclutadores', 'nombre_completo', payload.reclutador)
      : undefined
    

    const personFields = {
      tipo_documento: payload.tipo_documento,
      apellido_paterno: payload.apellido_paterno,
      apellido_materno: payload.apellido_materno,
      nombres: payload.nombres,
      celular: payload.celular,
      celular_referencia: payload.celular_referencia,
      correo: payload.correo,
      genero: payload.genero,
      fecha_nacimiento: payload.fecha_nacimiento,
      edad: payload.edad || calcEdadFromFechaISO(payload.fecha_nacimiento) || undefined,
      estado_civil: payload.estado_civil,
      n_hijos: payload.n_hijos,
      nivel_academico: payload.nivel_academico,
      carrera: payload.carrera,
      nacionalidad: payload.nacionalidad,
      lugar_residencia: payload.lugar_residencia,
      distrito_residencia: payload.distrito_residencia,
      direccion_domicilio: payload.direccion_domicilio,
      periodo_reclutado: payload.periodo_reclutado,
      semana_trabajo: payload.semana_trabajo,
      fuente_oferta: payload.fuente_oferta,
      observacion_reclutamiento: payload.observacion || payload.observacion_reclutamiento,
      updated_at: new Date().toISOString(),
    }
    
    // Asignar los IDs de llaves foráneas a personFields (nominas)
    if (reclutador_id !== undefined) personFields.reclutador_id = reclutador_id
    if (payload.sede !== undefined) personFields.sede = payload.sede
    if (payload.campana !== undefined) personFields.campana = payload.campana;
    if (payload.segmento !== undefined) personFields.segmento = payload.segmento;
    
    Object.keys(personFields).forEach(k => personFields[k] === undefined && delete personFields[k])

    const { error: nErr } = await supabase
      .from('nominas')
      .update(personFields)
      .eq('documento', documento)
      .eq('activo', true)
    if (nErr) throw nErr

    invalidateCache('postulantes_');
    invalidateCache('all_consolidado');
    invalidateCache('grupos_con_metas');
    invalidateCache('resumen_cap_');

    const { data, error } = await supabase
      .from('v_nominas_consolidado')
      .select('*')
      .eq('documento', documento)
      .maybeSingle()
    if (error) throw error
    if (data) return { ...data, campaign: data.campana }
    return fetchPostulantes().then(list => list.find(p => p.documento === documento))
  }

  // LocalStorage fallback
  const list = getFromStorage('postulantes') || []
  const idx = list.findIndex(p => p.documento === documento)
  if (idx !== -1) {
    const oldVal = list[idx]
    const newVal = { ...oldVal, ...payload, updated_at: new Date().toISOString() }
    list[idx] = newVal
    saveToStorage('postulantes', list)
    mockAuditLog('postulantes', 'UPDATE', documento, oldVal, newVal)
    return newVal
  }
  throw new Error('Postulante no encontrado en modo local.')
}

// ─────────────────────────────────────────────
// GRUPOS
// ─────────────────────────────────────────────
export async function fetchGrupos(postulantesForStats = null) {
  if (DB_MODE === 'supabase') {
    const data = await withCache('grupos_capacidad', 180000, async () => {
      const { data: raw, error } = await supabase
        .from('capacidad_rys')
        .select('*')
        .order('fecha_registro', { ascending: false })
      if (error) throw error
      return raw || [];
    });

    return enrichGruposWithStats(
      data.map(g => ({
        ...g,
        fecha: g.fecha_registro
      })),
      postulantesForStats || []
    )
  }
  initLocalStorageDb()
  return enrichGruposWithStats(getFromStorage('grupos') || [], postulantesForStats || [])
}

/** Vista CAPACIDAD_RYS con conteos (Supabase) */
export async function fetchCapacidadRysOperativo() {
  if (DB_MODE === 'supabase') {
    const { data, error } = await supabase
      .from('capacidad_rys')
      .select('*')
      .order('periodo', { ascending: false })
    if (error) throw error
    
    return (data || []).map(row => ({
      ...row,
      grupo_capacitacion: row.codigo,
      inconsistencias: [],
      tiene_inconsistencias: false,
    }))
  }
  return fetchGrupos()
}

const COBERTURA_DOTACION_SELECT = [
  'id',
  'created_at',
  'PERIODO',
  'SEMANA',
  'SEGMENTO',
  'CAMPAÑA',
  'GPE',
  'MODALIDAD_TRABAJO',
  'CONDICION_LABORAL',
  'FECHA_INGRESO_OP',
  'RQ_Q',
  'RQ_FTES',
  'RQ_CAPACIDAD',
  'Q_DIA_1',
  'ACTUALES',
  'INGRESOS_Q',
  'INGRESOS_FTES',
  'INGRESOS_CAPACIDAD',
  'PROY_INGRESOS_Q',
  'PROY_INGRESOS_FTES',
  'PROY_INGRESOS_CAPACIDAD',
  'estado',
].join(',')

/** Snapshot WFM ya calculado: public.cobertura_dotacion */
export async function fetchCoberturaDotacion() {
  if (DB_MODE !== 'supabase') return []
  return withCache('cobertura_dotacion_v7', 30000, async () => {
    const pageSize = 1000
    const all = []
    let from = 0
    while (true) {
      const { data, error } = await supabase
        .from('cobertura_dotacion')
        .select('*')
        .order('id', { ascending: true })
        .range(from, from + pageSize - 1)
      if (error) throw error
      const batch = data || []
      all.push(...batch)
      if (batch.length < pageSize) break
      from += pageSize
      if (from > 25000) break
    }
    return all
  })
}

const KPI_RECLUTADORES_SELECT = [
  'id',
  'anio',
  'periodo_reclutado',
  'periodo_efectivo',
  'semana',
  'grupo_g',
  'segmento',
  'campana',
  'modalidad',
  'fecha_inicio',
  'fecha_ingreso_op',
  'rq',
  'rq_individual',
  'formato',
  'responsable',
  'estado_grupo',
  'nomina',
  'meta_dia_1_individual',
  'dia_0',
  'dia_1',
  'meta_dia_1_campana',
  'dotacion_ftes',
  'dotacion_q',
  'rq_asignado',
  'dia_1_tope',
  'dotacion_q_tope',
  'dotacion_ftes_tope',
  'rq_ftes',
  'meta_dia_0_individual',
  'n_reclutadores',
  'updated_at',
].join(',')

export async function fetchKpiReclutadoresConsolidado({ periodo = null, periodoReclutado = null } = {}) {
  if (DB_MODE !== 'supabase') return []
  const toKeys = (v) => (!v || v === 'ALL' ? [] : (Array.isArray(v) ? v : [v]).map(x => String(x).replace(/\D/g, '').slice(0, 6)).filter(Boolean))
  const ingresoKeys = toKeys(periodo)
  const reclutaKeys = toKeys(periodoReclutado)
  const periodKeys = [...new Set([...ingresoKeys, ...reclutaKeys])]
  const cacheKey = `kpi_reclutadores_consolidado_v6_${periodKeys.sort().join('_') || 'min'}`
  return withCache(cacheKey, 120000, async () => {
    const pageSize = 1000
    const all = []
    let from = 0
    while (true) {
      let query = supabase
        .from('kpi_reclutadores_consolidado')
        .select(KPI_RECLUTADORES_SELECT)
        .gte('semana', 31)
        .order('id', { ascending: true })
        .range(from, from + pageSize - 1)
      if (periodKeys.length) {
        const ors = periodKeys.flatMap((k) => [`periodo_efectivo.eq.${k}`, `periodo_reclutado.eq.${k}`])
        query = query.or(ors.join(','))
      } else {
        query = query.or('periodo_efectivo.gte.202608,periodo_reclutado.gte.202608')
      }
      const { data, error } = await query
      if (error) throw error
      const batch = data || []
      all.push(...batch)
      if (batch.length < pageSize) break
      from += pageSize
      if (from > 20000) break
    }
    return all
  })
}

export async function fetchNominasAuditoria({ periodo = null, periodoReclutado = null } = {}) {
  if (DB_MODE !== 'supabase') return []
  return withCache('nominas_auditoria_v8_all', 180000, async () => {
    const pageSize = 1000
    const all = []
    let from = 0
    const primaryCols = 'documento, reclutador, campana, grupo_codigo, segmento, marca_temporal, created_at, fecha_ingreso, fecha_inicio_capacitacion, fecha_conexion_ojt, periodo_reclutado, semana_trabajo, activo'
    const fallbackCols = 'documento, reclutador, campana, grupo_codigo, segmento, created_at, fecha_ingreso, fecha_inicio_capacitacion, fecha_conexion_ojt, periodo_reclutado, semana_trabajo, activo'

    let useCols = primaryCols
    while (true) {
      let query = supabase
        .from('v_nominas_consolidado')
        .select(useCols)
        .eq('activo', true)
        .order('created_at', { ascending: false })
        .range(from, from + pageSize - 1)

      let { data, error } = await query
      if (error && useCols === primaryCols) {
        // Fallback without marca_temporal in case the view does not expose it
        useCols = fallbackCols
        const retry = await supabase
          .from('v_nominas_consolidado')
          .select(useCols)
          .eq('activo', true)
          .order('created_at', { ascending: false })
          .range(from, from + pageSize - 1)
        if (retry.error) {
          console.error('[fetchNominasAuditoria] Error on fallback query:', retry.error)
          throw retry.error
        }
        data = retry.data
      } else if (error) {
        console.error('[fetchNominasAuditoria] Error querying v_nominas_consolidado:', error)
        throw error
      }

      const batch = data || []
      all.push(...batch)
      if (batch.length < pageSize) break
      from += pageSize
      if (from > 40000) break
    }
    return all
  })
}

export async function refreshKpiReclutadores(semanaMin = 31) {
  if (DB_MODE !== 'supabase') return 0
  const { data, error } = await supabase.rpc('refresh_kpi_reclutadores', {
    p_semana_min: semanaMin,
  })
  if (error) throw error
  invalidateCache('kpi_reclutadores')
  invalidateCache('nominas_auditoria')
  return data
}

const CAPACIDAD_RYS_LOOKUP_SELECT = [
  'codigo',
  'periodo',
  'periodo_ingreso_op',
  'semana_label',
  'semana_trabajo',
  'estado',
  'campana',
  'segmento',
].join(',')

/** Dimensión de grupos para cruzar cobertura_dotacion (inner join). */
export async function fetchCapacidadRysLookup() {
  if (DB_MODE !== 'supabase') return []
  return withCache('capacidad_rys_lookup', 180000, async () => {
    const pageSize = 1000
    const all = []
    let from = 0
    while (true) {
      const { data, error } = await supabase
        .from('capacidad_rys')
        .select(CAPACIDAD_RYS_LOOKUP_SELECT)
        .order('codigo', { ascending: true })
        .range(from, from + pageSize - 1)
      if (error) throw error
      const batch = data || []
      all.push(...batch)
      if (batch.length < pageSize) break
      from += pageSize
      if (from > 20000) break
    }
    return all
  })
}

/** 
 * Suscripción realtime a cambios de grupos y nóminas con invalidación de caché.
 * 
 * NOTA DE ARQUITECTURA / PROTECCIÓN DE CARGA (2026-08-23):
 * Se DESACTIVA el auto-reload masivo automático ante eventos postgres_changes de otros clientes.
 * MOTIVO: Con ~100 usuarios concurrentes, un solo insert disparaba loadAllData() completo
 * (17 requests HTTP simultáneas) en cada cliente al mismo milisegundo (Thundering Herd de 1,700 req/s),
 * saturando el connection pooler y el API gateway de Supabase.
 * 
 * ESTRATEGIA APLICADA:
 * 1. La invalidación de caché local se mantiene intacta para que la próxima lectura traiga datos frescos.
 * 2. Las acciones de guardado propio del usuario (asistencias, nóminas, grupos) siguen actualizando su propia vista de inmediato.
 * 3. Los cambios de terceros se sincronizan mediante polling suave (cada 5 min con jitter) y botón manual "Refrescar".
 */
export function subscribeOperationalData(onChange) {
  if (DB_MODE !== 'supabase') return () => {}

  const handleChange = async () => {
    // Invalida caché local para asegurar datos frescos en la siguiente consulta del usuario
    await invalidateCache('all_consolidado');
    await invalidateCache('all_asistencias_bajas');
    await invalidateCache('all_motivos_bajas');
    await invalidateCache('grupos_con_metas');
    await invalidateCache('resumen_cap_');
    await invalidateCache('postulantes_');
    await invalidateCache('campanas_list');
    await invalidateCache('sedes_list');
    await invalidateCache('kpi_reclutadores');
    
    // Auto-reload masivo desactivado para mitigar picos de carga concurrentes (>100 usuarios)
    // Si se requiere callback específico manual forzado, se puede invocar condicionalmente:
    if (typeof onChange === 'function' && onChange.__allowDirectRealtimeReload) {
      onChange();
    }
  };

  const channel = supabase
    .channel('gea-operational-sync')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'capacidad_rys' }, handleChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'nominas' }, handleChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'asistencias_capacitacion' }, handleChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'consolidado_asistencias' }, handleChange)
    .subscribe()
  return () => { supabase.removeChannel(channel) }
}



/** Guarda metadata del grupo (CAPACIDAD_RYS + asistencia) y sincroniza nóminas vinculadas */
export async function saveGrupoCapacitacion({
  codigo,
  campana_nombre,
  segmento,
  semana_trabajo,
  semana_label,
  formador_documento,
  fecha_registro,
  modalidad = 'PRESENCIAL',
  area_traslado,
  condicion,
  estado,
  periodo,
  rango_horario,
  extension_teoria,
  fecha_inicio_ojt,
  extension_ojt,
  fecha_ingreso_op,
  rq_solicitado,
  rq_ftes_solicitado,
  meta_dia_0,
  meta_dia_1,
  periodo_ingreso_op,
  periodo_rys,
}) {
  const cleanCodigo = codigo?.trim().toUpperCase()
  if (!cleanCodigo) throw new Error('El código de grupo es obligatorio.')

  const campanaClean = campana_nombre?.trim().toUpperCase()
  const semana = semana_trabajo ? Number(semana_trabajo) : null

  const grupoRow = {
    codigo: cleanCodigo,
    campana: campanaClean || null,
    segmento: segmento?.trim().toUpperCase() || null,
    formador_documento: formador_documento || null,
    fecha_registro: fecha_registro || new Date().toISOString().split('T')[0],
    semana_trabajo: semana,
    semana_label: semana_label || (semana ? `SEM ${semana}` : null),
    modalidad,
    area_traslado: area_traslado || null,
    condicion: condicion || null,
    estado: estado || 'PLANIFICADO',
    periodo: periodo || null,
    rango_horario: rango_horario || null,
    extension_teoria: extension_teoria || null,
    fecha_inicio_ojt: fecha_inicio_ojt || null,
    extension_ojt: extension_ojt || null,
    fecha_ingreso_op: fecha_ingreso_op || null,
    rq_solicitado: rq_solicitado ?? null,
    rq_ftes_solicitado: rq_ftes_solicitado ?? null,
    meta_dia_0: meta_dia_0 ?? null,
    meta_dia_1: meta_dia_1 ?? null,
    periodo_ingreso_op: periodo_ingreso_op || null,
    periodo_rys: periodo_rys || null,
  }

  if (DB_MODE === 'supabase') {
    let existingQuery = supabase
      .from('capacidad_rys')
      .select('*')
      .eq('codigo', cleanCodigo)
    if (campanaClean) existingQuery = existingQuery.eq('campana', campanaClean)
    const { data: existing } = await existingQuery.maybeSingle()

    let hasChanges = false

    if (existing) {
      for (const key of Object.keys(grupoRow)) {
        if (grupoRow[key] === undefined) continue
        const valNew = grupoRow[key] === '' ? null : grupoRow[key]
        const valOld = existing[key] === '' ? null : existing[key]
        if (valNew !== valOld) {
          hasChanges = true
          break
        }
      }

      if (hasChanges) {
        let upd = supabase.from('capacidad_rys').update(grupoRow).eq('codigo', cleanCodigo)
        if (campanaClean) upd = upd.eq('campana', campanaClean)
        const { error } = await upd
        if (error) throw error
      }
    } else {
      const { error } = await supabase
        .from('capacidad_rys')
        .upsert(grupoRow, { onConflict: 'campana,codigo' })
      if (error) throw error
      hasChanges = true
    }

    if (hasChanges) {
      await invalidateCache('grupos_capacidad');
      // Sync nominas if needed
      if (!existing || existing.campana !== grupoRow.campana || existing.semana_trabajo !== grupoRow.semana_trabajo) {
        const { error: syncErr } = await supabase
          .from('nominas')
          .update({
            campana: grupoRow.campana,
            segmento: grupoRow.segmento,
            ...(semana ? { semana_trabajo: semana } : {}),
          })
          .eq('grupo_codigo', cleanCodigo)
        if (syncErr) console.warn('Sync nominas grupo:', syncErr.message)
      }
      mockAuditLog('capacidad_rys', existing ? 'UPDATE' : 'INSERT', cleanCodigo, null, grupoRow)
    }

    return {
      ...grupoRow,
      fecha: grupoRow.fecha_registro,
    }
  }

  // Local storage fallback omitted for brevity in this replace snippet
  return grupoRow
}

export const AREAS_BOLSA_CAPA = ['CAPACITACION', 'RECUPERADO', 'CAPACITACION TRASLADO', 'TRASLADO OP']
export const TIPOS_RECLUTADOR_CAPA = ['CAPACITACION', 'RECUPERADO', 'TRASLADO']

export function isAreaBolsaCapa(area) {
  return AREAS_BOLSA_CAPA.includes(String(area || '').trim().toUpperCase())
}

export function tipoReclutadoFromAreaCapa(area) {
  const a = String(area || '').trim().toUpperCase()
  if (a === 'CAPACITACION') return 'CAPACITACION'
  if (a === 'RECUPERADO') return 'RECUPERADO'
  if (a === 'CAPACITACION TRASLADO') return 'TRASLADO'
  if (a === 'TRASLADO OP') return 'TRASLADO OP'
  return a || 'CAPACITACION'
}

export function tipoReclutadorFromAreaCapa(area) {
  const tipo = tipoReclutadoFromAreaCapa(area)
  if (tipo === 'RECUPERADO') return 'RECUPERADO'
  if (tipo === 'TRASLADO' || tipo === 'TRASLADO OP') return 'TRASLADO'
  return 'CAPACITACION'
}

/** Nómina activa de un GPE en el consolidado (v_nominas_consolidado). */
export async function fetchNominasGrupoCapa({ codigo, campana } = {}) {
  const cleanCodigo = String(codigo || '').trim().toUpperCase()
  const cleanCampana = String(campana || '').trim().toUpperCase()
  if (!cleanCodigo || DB_MODE !== 'supabase') return []

  let query = supabase
    .from('v_nominas_consolidado')
    .select('documento, nombres, apellido_paterno, apellido_materno, celular, reclutador, status_dia_1, fuente_oferta, grupo_codigo, campana, periodo_reclutado, created_at')
    .eq('grupo_codigo', cleanCodigo)
    .eq('activo', true)
    .order('created_at', { ascending: false })
  if (cleanCampana) query = query.eq('campana', cleanCampana)

  const { data, error } = await query
  if (error) throw error
  return data || []
}

/** Busca grupo en capacidad_rys por código (y campaña si viene) para evitar duplicados. */
export async function findGrupoCapacidad({ codigo, campana } = {}) {
  const cleanCodigo = String(codigo || '').trim().toUpperCase()
  if (!cleanCodigo) return { exact: null, byCodigo: [] }
  if (DB_MODE !== 'supabase') return { exact: null, byCodigo: [] }

  const { data, error } = await supabase
    .from('capacidad_rys')
    .select('codigo, campana, segmento, area_traslado, semana_label, semana_trabajo, periodo, periodo_ingreso_op, modalidad, estado, fecha_registro, fecha_inicio_ojt, fecha_ingreso_op')
    .eq('codigo', cleanCodigo)
  if (error) throw error
  const rows = data || []
  const camp = String(campana || '').trim().toUpperCase()
  const exact = camp
    ? (rows.find((r) => String(r.campana || '').trim().toUpperCase() === camp) || null)
    : (rows[0] || null)
  return { exact, byCodigo: rows }
}

/** Importa filas CAPACIDAD_RYS (CSV/Excel export) en lote optimizado */
export async function importCapacidadRysBulk(payloads, { onProgress } = {}) {
  const results = { ok: 0, fail: 0, deleted: 0, ignored: 0, total: payloads.length, errors: [], warnings: [] }
  if (!payloads.length) return results
  
  // Filtrar solo los que tienen código y que no sean generados automáticamente por el frontend (S/C-FILA)
  const validPayloads = payloads.filter(p => p.codigo && p.codigo.trim() !== '' && !p.codigo.startsWith('S/C-FILA'))
  results.ignored = payloads.length - validPayloads.length
  
  if (validPayloads.length === 0) return results

  // 1. Omitimos la limpieza inicial aquí, la haremos después de cargar las campañas y obtener los IDs existentes.

  // Si estamos en modo local, usamos el flujo antiguo simplificado
  if (DB_MODE !== 'supabase') {
    for (let i = 0; i < validPayloads.length; i++) {
      try {
        await saveGrupoCapacitacion(validPayloads[i])
        results.ok++
      } catch (err) {
        results.fail++
        results.errors.push({ codigo: validPayloads[i]?.codigo, message: err.message })
      }
      if (i % 50 === 0) onProgress?.(i + 1, validPayloads.length)
    }
    return results
  }

  // Upsert por campana+codigo. No se borra la tabla: los grupos creados en Bolsa de Capa
  // se conservan si aún no están en el sheet.
  try {
    const { data: existingData } = await supabase
      .from('capacidad_rys')
      .select('codigo, campana, formador_documento, area_traslado')
    const existingMap = new Map()
    if (existingData) {
      for (const g of existingData) {
        existingMap.set(`${String(g.campana || '').trim().toUpperCase()}_${String(g.codigo || '').trim().toUpperCase()}`, g)
      }
    }

    results.deleted = 0

    const rowsToUpsert = validPayloads.map(p => {
      const campana = String(p.campana_nombre || 'SIN CAMPAÑA').trim().toUpperCase()
      const codigo = String(p.codigo || '').trim().toUpperCase() || null
      const prev = existingMap.get(`${campana}_${codigo}`)
      const incomingArea = p.area_traslado ? String(p.area_traslado).trim().toUpperCase() : ''

      return {
        codigo,
        campana,
        semana_trabajo: p.semana_trabajo === '' ? null : (p.semana_trabajo || null),
        semana_label: p.semana_label || null,
        modalidad: p.modalidad || 'PRESENCIAL',
        condicion: p.condicion || null,
        rango_horario: p.rango_horario || null,
        fecha_registro: p.fecha_registro || new Date().toISOString().split('T')[0],
        periodo: p.periodo || null,
        fecha_inicio_ojt: p.fecha_inicio_ojt || null,
        fecha_ingreso_op: p.fecha_ingreso_op || null,
        extension_teoria: p.extension_teoria === '' ? null : (p.extension_teoria || null),
        extension_ojt: p.extension_ojt === '' ? null : (p.extension_ojt || null),
        rq_solicitado: p.rq_solicitado === '' ? null : p.rq_solicitado,
        rq_ftes_solicitado: p.rq_ftes_solicitado === '' ? null : p.rq_ftes_solicitado,
        meta_dia_0: p.meta_dia_0 === '' ? null : p.meta_dia_0,
        meta_dia_1: p.meta_dia_1 === '' ? null : p.meta_dia_1,
        periodo_ingreso_op: p.periodo_ingreso_op || null,
        periodo_rys: p.periodo_rys || null,
        area_traslado: incomingArea || prev?.area_traslado || null,
        segmento: p.segmento ? String(p.segmento).trim() : inferSegmento(campana),
        estado: p.estado || 'PLANIFICADO',
        formador_documento: prev?.formador_documento || null,
      }
    })

    
    // 3.5 Deduplicar filas por código antes de enviar a Supabase
    // (Si en el Excel hay dos filas con el mismo GPE-123, nos quedamos con la última para evitar error de Supabase "cannot affect row a second time")
    const uniqueRowsMap = new Map()
    for (const r of rowsToUpsert) {
      if (r.codigo) {
        uniqueRowsMap.set(r.campana + '_' + r.codigo, r)
      }
    }
    const finalRowsToUpsert = Array.from(uniqueRowsMap.values())

    const existingByCodigo = new Map()
    if (existingData) {
      for (const g of existingData) {
        const code = String(g.codigo || '').trim().toUpperCase()
        if (!code) continue
        const camp = String(g.campana || '').trim().toUpperCase()
        if (!existingByCodigo.has(code)) existingByCodigo.set(code, [])
        existingByCodigo.get(code).push(camp)
      }
    }
    for (const r of finalRowsToUpsert) {
      const others = (existingByCodigo.get(r.codigo) || []).filter((c) => c && c !== r.campana)
      if (others.length) {
        results.warnings.push(`Este código ya existe en otra campaña (${others.join(', ')}): ${r.codigo}`)
      }
    }

    // 4. Inserción masiva
    const BATCH_SIZE = 500
    for (let i = 0; i < finalRowsToUpsert.length; i += BATCH_SIZE) {
      const batch = finalRowsToUpsert.slice(i, i + BATCH_SIZE)

      const { error } = await supabase.from('capacidad_rys').upsert(batch, { onConflict: 'campana,codigo' })
      
      if (error) {
        results.fail += batch.length
        results.errors.push({ message: error.message })
      } else {
        results.ok += batch.length
      }
      onProgress?.(Math.min(i + BATCH_SIZE, finalRowsToUpsert.length), finalRowsToUpsert.length)
    }
    await invalidateCache('grupos_capacidad');
    await invalidateCache('grupos_con_metas');
  } catch (err) {
    console.error('Bulk upload error:', err)
    results.fail = validPayloads.length
    results.errors.push({ message: err.message })
  }

  return results
}

/**
 * Sincroniza la hoja CAPACIDAD_RYS desde Google Drive.
 * Descarga el sheet como CSV y lo importa en lote.
 */
const CAPACIDAD_RYS_SHEET_ID = '2PACX-1vR5cIgvA11b8Xczt-fwGREZ9XPWMXxPq5OTpNMXgaiU3jEMWD4FwVjAdFpDX5V3fI5lXEQST8S_vI70'
const CAPACIDAD_RYS_GID = '249081259'

export async function syncCapacidadRysFromDrive({ onProgress } = {}) {
  onProgress?.({ phase: 'download', message: 'Descargando hoja de Google Drive…' })

  // Use the published Google Sheets CSV URL pointing directly to CAPA_RYS tab
  const csvUrl = `https://docs.google.com/spreadsheets/d/e/${CAPACIDAD_RYS_SHEET_ID}/pub?gid=${CAPACIDAD_RYS_GID}&single=true&output=csv`

  let csvText
  try {
    const res = await fetch(csvUrl)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    csvText = await res.text()
  } catch (err) {
    throw new Error(`No se pudo descargar la hoja de Drive. Asegúrate de que esté compartida como "Cualquier persona con el enlace".`)
  }

  onProgress?.({ phase: 'parse', message: 'Procesando filas…' })
  const payloads = parseCapacidadRysCsv(csvText)
  if (!payloads.length) throw new Error('No se encontraron filas válidas en la hoja de Google Drive.')

  onProgress?.({ phase: 'import', message: `Importando ${payloads.length} grupos…`, total: payloads.length, current: 0 })

  const results = await importCapacidadRysBulk(payloads, {
    onProgress: (cur, tot) => onProgress?.({ phase: 'import', message: `Importando grupo ${cur}/${tot}…`, total: tot, current: cur }),
  })

  onProgress?.({ phase: 'done', message: 'Sincronización completada' })
  return results
}

/**
 * Sincroniza nómina y asistencia desde Google Sheets publicados (desde el navegador).
 * @param {{ sourceIds?: string[], onProgress?: (ev: object) => void }} opts
 */
export async function syncGoogleSheets({ sourceIds = null, onProgress } = {}) {
  const sources = sourceIds?.length
    ? sourceIds.map(id => SHEET_SOURCES[id]).filter(Boolean)
    : Object.values(SHEET_SOURCES)

  if (!sources.length) throw new Error('No hay fuentes de hojas configuradas.')

  const result = { nominas: 0, asistencias: 0, grupos: 0, skipped: 0, errors: [] }

  for (const source of sources) {
    onProgress?.({ phase: 'download', sourceId: source.id, label: source.label, message: 'Descargando CSV…' })

    const res = await fetch(sheetCsvUrl(source))
    if (!res.ok) throw new Error(`No se pudo descargar "${source.label}" (${res.status})`)

    const matrix = parseCsvToMatrix(await res.text())
    const rows = parseNominaRows(matrix, source.defaults)
    if (!rows.length) continue

    onProgress?.({ phase: 'grupos', sourceId: source.id, label: source.label, total: rows.length, current: 0, message: 'Preparando grupos…' })

    const grupos = extractGruposFromRows(rows)
    const existingGrupos = new Set()
    if (DB_MODE === 'supabase' && grupos.length) {
      const codes = grupos.map(g => g.codigo)
      const { data } = await supabase.from('capacidad_rys').select('codigo').in('codigo', codes)
      data?.forEach(g => existingGrupos.add(g.codigo))
    }

    for (const g of grupos) {
      if (existingGrupos.has(g.codigo)) continue
      try {
        await saveGrupoCapacitacion({
          codigo: g.codigo,
          campana_nombre: g.campana_nombre,
          segmento: g.segmento,
          semana_trabajo: g.semana_trabajo,
          semana_label: g.semana_label,
          modalidad: g.modalidad,
          condicion: g.condicion,
          rango_horario: g.rango_horario,
          fecha_registro: g.fecha_registro,
          periodo: g.periodo,
          fecha_inicio_ojt: g.fecha_inicio_ojt,
          fecha_ingreso_op: g.fecha_ingreso_op,
          estado: 'ACTIVO',
        })
        result.grupos++
      } catch (err) {
        result.errors.push({ ref: g.codigo, message: err.message })
      }
    }

    const uniqueSheetRows = []
    const seenSheetDocs = new Set()
    for (const row of rows) {
      if (row.documento && !seenSheetDocs.has(row.documento)) {
        seenSheetDocs.add(row.documento)
        uniqueSheetRows.push(row)
      } else {
        result.skipped++
      }
    }

    if (uniqueSheetRows.length > 0) {
      onProgress?.({
        phase: 'nominas',
        sourceId: source.id,
        label: source.label,
        total: uniqueSheetRows.length,
        current: 0,
        message: `Importando lote de ${uniqueSheetRows.length} nóminas…`,
      })

      try {
        const bulkRes = await insertPostulantesBulk(uniqueSheetRows)
        result.nominas += (bulkRes.inserted?.length || 0)
        result.skipped += (bulkRes.skipped?.length || 0)
        if (bulkRes.failed?.length > 0) {
          bulkRes.failed.forEach(f => {
            result.errors.push({ ref: f.documento, message: f.reason })
          })
        }
      } catch (err) {
        result.errors.push({ ref: source.label, message: err.message })
      }
    }
  }

  onProgress?.({ phase: 'done', message: 'Sincronización completada' })
  return result
}

/**
 * Aísla updates de nómina a la cohorte correcta (documento + grupo + campaña).
 * Evita cruzar el mismo DNI en otra campaña/grupo homónimo.
 */
function scopeNominasCohorte(query, { grupo_codigo, campana } = {}) {
  let q = query;
  const cleanGrupo = String(grupo_codigo || '').trim();
  const cleanCampana = String(campana || '').trim();
  if (cleanGrupo) q = q.eq('grupo_codigo', cleanGrupo);
  if (cleanCampana) q = q.eq('campana', cleanCampana);
  return q;
}

export async function saveAsistenciaSession({ grupoMeta, grupo_codigo, fecha_asistencia, records }) {
  const codigoFinal = grupoMeta?.codigo?.trim().toUpperCase() || grupo_codigo
  const campanaFinal = grupoMeta?.campana_nombre || grupoMeta?.campana || ''
  if (!codigoFinal || !fecha_asistencia) return false
  
  await upsertAsistencias({ grupo_codigo: codigoFinal, grupoMeta, fecha_asistencia, records })
  
  try {
     await checkCalibracionDia1(codigoFinal, campanaFinal)
  } catch(e) {
     console.error("Error checkCalibracionDia1 from saveAsistenciaSession:", e)
  }
  
  return true
}

// ─────────────────────────────────────────────
// ASISTENCIAS
// ─────────────────────────────────────────────
export async function fetchAsistencias() {
  if (DB_MODE === 'supabase') {
    const data = await fetchAllConsolidado({ since: '2026-07-01' });

    // Map consolidado_asistencias → estructura estándar.
    // Clave con campaña para no pisar cohortes homónimas (mismo código de grupo).
    // Se conserva el último registro por clave, protegiendo siempre I-OP.
    const map = new Map();
    data.forEach(row => {
      let isoDate = parseFechaAsistencia(row.fecha_registro_asistencia);
      const cleanDoc = String(row.documento || '').trim();
      const cleanGrupo = String(row.codigo_grupo || row.grupo || '').trim();
      const cleanCampana = String(row.campana || '').trim().toUpperCase();
      const corteKey = row.corte != null && row.corte !== '' ? String(Number(row.corte)) : '0';
      const semNum = String(row.archivo_origen || '').replace(/\D/g, '');
      const semFromArchivo = semNum ? `SEM ${parseInt(semNum, 10)}` : '';
      
      if (isoDate && cleanDoc) {
        // Incluir corte en la clave: C1 A y C3 B del mismo día deben coexistir
        const key = `${cleanGrupo}|${cleanCampana}|${cleanDoc}|${isoDate}|${corteKey}`;
        const existing = map.get(key);
        const isCurrentIop = String(row.sigla || '').trim().toUpperCase() === 'I-OP';
        if (existing && !isCurrentIop && String(existing.sigla || '').trim().toUpperCase() === 'I-OP') {
          return;
        }
        map.set(key, {
          documento: cleanDoc,
          postulante_documento: cleanDoc,
          nombres: row.nombres,
          apellido_paterno: row.apellido_paterno,
          apellido_materno: row.apellido_materno,
          celular: row.celular,
          condicion_laboral: row.condicion_laboral,
          codigo_grupo: cleanGrupo,
          grupo_codigo: cleanGrupo,
          campana: row.campana,
          fecha_registro_asistencia: isoDate,
          fecha_asistencia: isoDate,
          sigla: row.sigla,
          sigla_asistencia: row.sigla,
          motivo_baja: row.motivo_baja,
          estado: row.estado || 'ACTIVO',
          tipo_reclutado: row.tipo_reclutado || '',
          formador: row.nombre_formador,
          archivo_origen: row.archivo_origen || '',
          semana: semFromArchivo,
          semana_trabajo: semFromArchivo,
          semana_label: semFromArchivo,
          corte: row.corte != null && row.corte !== '' ? Number(row.corte) : null,
          fecha_hora_registro: row.fecha_hora_registro || null,
        });
      }
    });

    return Array.from(map.values()).sort((a, b) => b.fecha_asistencia.localeCompare(a.fecha_asistencia));
  }
  initLocalStorageDb()
  return getFromStorage('asistencias') || []
}

/**
 * Side-effects post-guardado de asistencia.
 * SoT de marcación = consolidado_asistencias (ya escrito por insertConsolidado).
 * Aquí solo sincronizamos estado de nómina aislado por cohorte; no tocamos asistencias_capacitacion.
 */
export async function upsertAsistencias({ grupo_codigo, grupoMeta, fecha_asistencia, records }) {
  if (DB_MODE === 'supabase') {
    grupo_codigo = grupo_codigo || grupoMeta?.codigo;
    const campana = String(grupoMeta?.campana_nombre || grupoMeta?.campana || '').trim();

    // 1. Agrupar bajas por motivo de baja para actualizar en lote por grupo de motivo
    const bajasByMotivo = new Map();
    for (const r of (records || []).filter(x => x.sigla === 'B' && x.documento)) {
      const motivo = r.motivo_baja || 'BAJA';
      const atrib = atribuirBaja(motivo);
      const obs = `${motivo} [${atrib}]`;
      if (!bajasByMotivo.has(obs)) {
        bajasByMotivo.set(obs, { motivo, docs: [] });
      }
      bajasByMotivo.get(obs).docs.push(r.documento);
    }

    // 2. Documentos a restaurar a ACTIVO (cualquiera que asista con sigla distinta de B)
    const activeDocs = (records || [])
      .filter(x => x.sigla !== 'B' && x.documento)
      .map(x => x.documento);

    // 3. Ejecutar updates de forma concurrente con Promise.all (scoped a cohorte)
    const updatePromises = [];
    const cohortScope = { grupo_codigo, campana };

    for (const [obs, { motivo, docs }] of bajasByMotivo.entries()) {
      if (docs.length > 0) {
        updatePromises.push(
          scopeNominasCohorte(
            supabase
              .from('nominas')
              .update({
                estado: 'BAJA',
                motivo_baja: motivo,
                observacion_estado: obs,
                updated_at: new Date().toISOString(),
              })
              .in('documento', docs)
              .eq('activo', true),
            cohortScope
          )
        );
      }
    }

    if (activeDocs.length > 0) {
      updatePromises.push(
        scopeNominasCohorte(
          supabase
            .from('nominas')
            .update({
              estado: 'ACTIVO',
              observacion_estado: null,
              updated_at: new Date().toISOString(),
            })
            .in('documento', activeDocs)
            .eq('activo', true)
            .in('estado', ['BAJA', 'CESADO', 'INACTIVO', 'DESERTO']),
          cohortScope
        )
      );
    }

    if (updatePromises.length > 0) {
      await Promise.all(updatePromises);
    }

    // Invalidar caché para que la próxima lectura traiga datos frescos de Supabase
    await invalidateCache('all_consolidado');
    await invalidateCache('all_asistencias_bajas');
    await invalidateCache('resumen_cap_');
    return true
  }

  // LocalStorage fallback
  const existing = getFromStorage('asistencias') || []
    const newRecords = records.map(r => ({
      nomina_id: r.nomina_id,
      postulante_documento: r.documento,
      grupo_codigo,
      fecha_asistencia,
      estado_asistencia: r.estado_asistencia || 'PRESENTE',
      motivo_baja: r.motivo_baja || null
    }))
  const filtered = existing.filter(
    a => !(a.grupo_codigo === grupo_codigo && a.fecha_asistencia === fecha_asistencia)
  )
  const updated = [...filtered, ...newRecords]
  saveToStorage('asistencias', updated)
  mockAuditLog('asistencias_capacitacion', 'INSERT', grupo_codigo, null, { records: newRecords.length })
  return newRecords
}

// ─────────────────────────────────────────────
// RECLUTADORES / SEDES / CAMPANAS
// ─────────────────────────────────────────────
export async function fetchReclutadores() {
  if (DB_MODE === 'supabase') {
    return withCache('reclutadores_list', 600000, async () => {
      const { data: recRes, error: recErr } = await supabase
        .from('equipo_reclutamiento')
        .select('apellido_paterno, apellido_materno, nombres_completos')
        .eq('estado', 'ACTIVO')
        
      if (recErr) throw recErr

      const names = new Set()
      for (const r of recRes || []) {
        const full = `${r.apellido_paterno || ''} ${r.apellido_materno || ''} ${r.nombres_completos || ''}`.trim().replace(/\s+/g, ' ')
        if (full) names.add(full.toUpperCase())
      }
      return [...names].sort()
    })
  }
  return getFromStorage('reclutadores') || []
}

export async function fetchSedes() {
  if (DB_MODE === 'supabase') {
    return withCache('sedes_list', 300000, async () => {
      const { data } = await supabase.from('nominas').select('sede').not('sede', 'is', null)
      const unique = [...new Set((data || []).map(d => d.sede))]
      return unique.sort()
    });
  }
  return getFromStorage('sedes') || []
}

export async function fetchCampanas() {
  if (DB_MODE === 'supabase') {
    return withCache('campanas_list', 300000, async () => {
      const { data } = await supabase.from('capacidad_rys').select('campana, segmento').not('campana', 'is', null)
      
      // De-duplicate
      const map = new Map()
      for (const d of (data || [])) {
        if (!map.has(d.campana)) {
          map.set(d.campana, d)
        }
      }
      const unique = Array.from(map.values())
      return unique.sort((a,b) => a.campana.localeCompare(b.campana)).map(c => ({ nombre: c.campana, segmento: c.segmento }))
    });
  }
  return getFromStorage('campanas') || []
}


export async function fetchReclutadoresFull() {
  if (DB_MODE === 'supabase') {
    // Sync table with real recruiters
    const validNames = await fetchReclutadores()
    
    const { data: currentRecs } = await supabase.from('reclutadores').select('*')
    if (currentRecs) {
      const existingNames = new Set(currentRecs.map(r => (r.nombre_completo || '').trim().toUpperCase()))
      const missing = validNames.filter(n => !existingNames.has(n.toUpperCase()))
      
      if (missing.length > 0) {
        await supabase.from('reclutadores').insert(missing.map(n => ({ nombre_completo: n, activo: true })))
      }
      
      const garbageIds = currentRecs
        .filter(r => r.activo && !validNames.includes((r.nombre_completo || '').trim().toUpperCase()))
        .map(r => r.id)
        
      if (garbageIds.length > 0) {
        await supabase.from('reclutadores').update({ activo: false }).in('id', garbageIds)
      }
    }

    const [recRes, eqRes] = await Promise.all([
      supabase.from('reclutadores').select('id, nombre_completo, activo').eq('activo', true).order('nombre_completo'),
      supabase.from('equipo_reclutamiento').select('documento, alias, apellido_paterno, apellido_materno, nombres_completos').eq('estado', 'ACTIVO')
    ])
    if (recRes.error) throw recRes.error

    const eqMap = new Map()
    for (const eq of (eqRes.data || [])) {
      const full = `${eq.apellido_paterno || ''} ${eq.apellido_materno || ''} ${eq.nombres_completos || ''}`.trim().replace(/\s+/g, ' ').toUpperCase()
      eqMap.set(full, { documento: eq.documento, alias: eq.alias })
    }

    return (recRes.data || []).map(r => {
      const norm = (r.nombre_completo || '').trim().replace(/\s+/g, ' ').toUpperCase()
      const eq = eqMap.get(norm) || {}
      return {
        ...r,
        documento: eq.documento || null,
        alias: eq.alias || null
      }
    })
  }
  // Local fallback
  const list = getFromStorage('reclutadores') || []
  return list.map((nombre, index) => ({
    id: index + 1,
    nombre_completo: nombre,
    activo: true,
    documento: null,
    alias: null
  }))
}

export function fetchGruposConMetas(bypassCache = false) {
  if (bypassCache) {
    invalidateCache('grupos_con_metas')
  }
  return withCache('grupos_con_metas', 60000, async () => {
    if (DB_MODE === 'supabase') {
      // 1. Fetch groups, recruiters and dedicated metas_equipos in parallel
      const [gruposRes, relRes, nominasRes, equipoRes, asisRes, metasEquiposRes] = await Promise.all([
        supabase
          .from('capacidad_rys')
          .select('codigo, periodo, periodo_ingreso_op, semana_label, semana_trabajo, estado, meta_dia_0, meta_dia_1, rq_solicitado, rq_ftes_solicitado, area_traslado, campana, segmento, modalidad, sede, rango_horario, fecha_registro, fecha_inicio_ojt, fecha_ingreso_op')
          .order('codigo'),
        supabase
          .from('grupo_reclutadores')
          .select('grupo_codigo, reclutador_id, meta_rq_individual, meta_dia_1_individual, documento, reclutador_nombre, reclutadores(nombre_completo)'),
        supabase
          .from('nominas')
          .select('documento, grupo_codigo, campana, reclutador_id, dia_0, dia_1, sede')
          .eq('activo', true),
        supabase
          .from('equipo_reclutamiento')
          .select('documento, alias, apellido_paterno, apellido_materno, nombres_completos')
          .eq('estado', 'ACTIVO'),
        supabase
          .from('consolidado_asistencias')
          .select('documento, motivo_baja, estado, codigo_grupo, campana')
          .limit(10000),
        supabase
          .from('metas_equipos')
          .select('*')
          .order('id')
      ])

    if (gruposRes.error) console.warn('capacidad_rys error:', gruposRes.error)
    if (metasEquiposRes.error) console.warn('metas_equipos error:', metasEquiposRes.error)

    const equipoMap = {}
    for (const eq of (equipoRes.data || [])) {
      const full = `${eq.apellido_paterno || ''} ${eq.apellido_materno || ''} ${eq.nombres_completos || ''}`.trim().replace(/\s+/g, ' ').toUpperCase()
      equipoMap[full] = { documento: eq.documento, alias: eq.alias }
      if (eq.documento) {
        equipoMap[eq.documento] = { documento: eq.documento, alias: eq.alias, full }
      }
    }

    // ── Mapeo primario: Capacidad R&S es la fuente oficial del catálogo ──
    const metasEquiposRows = metasEquiposRes.data || []
    const normK = (v) => String(v || '').trim().toUpperCase()
    const normSemNum = (v) => String(v || '').replace(/\D/g, '')

    // Indexar metas_equipos por clave compuesta exacta (código, periodo, semana)
    const meExactMap = new Map()
    const meCodeSemMap = new Map()
    const meCodePerMap = new Map()

    for (const me of metasEquiposRows) {
      const cod = normK(me.grupo)
      if (!cod) continue
      const per = normK(me.periodo)
      const sem = normSemNum(me.semana)

      const exactKey = `${cod}|${per}|${sem}`
      if (!meExactMap.has(exactKey)) meExactMap.set(exactKey, [])
      meExactMap.get(exactKey).push(me)

      if (sem) {
        const csKey = `${cod}|${sem}`
        if (!meCodeSemMap.has(csKey)) meCodeSemMap.set(csKey, [])
        meCodeSemMap.get(csKey).push(me)
      }

      if (per) {
        const cpKey = `${cod}|${per}`
        if (!meCodePerMap.has(cpKey)) meCodePerMap.set(cpKey, [])
        meCodePerMap.get(cpKey).push(me)
      }
    }

    const relMap = {}
    for (const r of (relRes.data || [])) {
      if (!relMap[r.grupo_codigo]) relMap[r.grupo_codigo] = []
      const nomFull = (r.reclutador_nombre || r.reclutadores?.nombre_completo || 'Desconocido').toUpperCase()
      const eqData = equipoMap[nomFull] || {}
      
      relMap[r.grupo_codigo].push({
        reclutador_id: r.reclutador_id,
        nombre_completo: r.reclutador_nombre || r.reclutadores?.nombre_completo || 'Desconocido',
        documento: r.documento || eqData.documento || null,
        alias: eqData.alias || null,
        meta_rq_individual: r.meta_rq_individual || 0,
        meta_dia_1_individual: r.meta_dia_1_individual || 0
      })
    }

    const nominas = nominasRes.data || []
    const asisData = asisRes.data || []
    
    const bajaDia1Set = new Set()
    for (const a of asisData) {
      const m = String(a.motivo_baja || '').toUpperCase()
      const e = String(a.estado || '').toUpperCase()
      if (m.includes('BAJA DIA 1') || e.includes('BAJA DIA 1')) {
        bajaDia1Set.add(`${a.codigo_grupo}|${a.campana}|${a.documento}`)
      }
    }

    const resultList = []
    const processedMeExactKeys = new Set()

    // 1. Recorrer capacidad_rys (catálogo maestro de planificación)
    for (const g of (gruposRes.data || [])) {
      const gCodigo = (g.codigo || '').trim()
      if (!gCodigo) continue
      const cod = normK(gCodigo)
      const per = normK(g.periodo)
      const sem = normSemNum(g.semana_label || g.semana_trabajo)

      const exactKey = `${cod}|${per}|${sem}`
      const csKey = `${cod}|${sem}`
      const cpKey = `${cod}|${per}`

      let matchingMeRows = null
      let matchedExactKey = null
      if (meExactMap.has(exactKey)) {
        matchingMeRows = meExactMap.get(exactKey)
        matchedExactKey = exactKey
        processedMeExactKeys.add(exactKey)
      } else if (sem && meCodeSemMap.has(csKey)) {
        matchingMeRows = meCodeSemMap.get(csKey)
        const firstMe = matchingMeRows[0]
        matchedExactKey = `${normK(firstMe.grupo)}|${normK(firstMe.periodo)}|${normSemNum(firstMe.semana)}`
        processedMeExactKeys.add(matchedExactKey)
      } else if (per && meCodePerMap.has(cpKey)) {
        matchingMeRows = meCodePerMap.get(cpKey)
        const firstMe = matchingMeRows[0]
        matchedExactKey = `${normK(firstMe.grupo)}|${normK(firstMe.periodo)}|${normSemNum(firstMe.semana)}`
        processedMeExactKeys.add(matchedExactKey)
      }

      let reclutadoresConStats = []
      let metaDia0 = g.meta_dia_0 || 0
      let metaDia1 = g.meta_dia_1 || 0
      let rqSolicitado = (String(g.area_traslado || '').trim().toUpperCase() === 'RECLUTAMIENTO') ? (g.rq_solicitado || 0) : 0
      let rqFtes = (String(g.area_traslado || '').trim().toUpperCase() === 'RECLUTAMIENTO') ? (g.rq_ftes_solicitado || 0) : 0
      let listaActual = 0
      let conectadosDia0 = 0
      let conectadosDia1 = 0
      let fromMetasEquipos = false

      if (matchingMeRows && matchingMeRows.length > 0) {
        fromMetasEquipos = true
        const firstMe = matchingMeRows[0]
        metaDia0 = Number(firstMe.meta_dia_0 || g.meta_dia_0 || 0)
        metaDia1 = Number(firstMe.meta_dia_1_grupal || g.meta_dia_1 || 0)
        rqSolicitado = Number(firstMe.rq || rqSolicitado || 0)
        listaActual = Number(firstMe.lista_actual || 0)
        conectadosDia0 = Number(firstMe.conectados_dia_0 || 0)
        conectadosDia1 = Number(firstMe.total_dia_1 || 0)

        reclutadoresConStats = matchingMeRows.map(r => {
          const nomUpper = (r.responsable || '').trim().toUpperCase()
          const eqData = equipoMap[nomUpper] || (r.documento_responsable ? equipoMap[r.documento_responsable] : null) || {}
          return {
            reclutador_id: r.documento_responsable || r.responsable,
            nombre_completo: r.responsable || 'Sin Asignar',
            documento: r.documento_responsable || eqData.documento || null,
            alias: eqData.alias || r.responsable?.split(' ')[0] || null,
            meta_rq_individual: Number(r.rq_individual || 0),
            conteo_individual: Number(r.conteo_individual || 0),
            meta_dia_1_individual: Number(r.meta_dia_1_individual || 0),
            conectados_dia_1_individual: Number(r.conectados_dia_1 || 0)
          }
        })
      } else {
        const reclutadoresAsignados = relMap[gCodigo] || []
        const nominasGrupo = nominas.filter(n => n.grupo_codigo === gCodigo && (!g.campana || n.campana === g.campana))
        listaActual = nominasGrupo.length
        conectadosDia0 = nominasGrupo.filter(n => n.dia_0 === 'ASISTIO').length
        conectadosDia1 = nominasGrupo.filter(n => n.dia_1 === 'ASISTIO' && !bajaDia1Set.has(`${gCodigo}|${g.campana}|${n.documento}`)).length

        reclutadoresConStats = reclutadoresAsignados.map(r => {
          const nominasReclutador = nominasGrupo.filter(n => n.reclutador_id === r.reclutador_id)
          return {
            ...r,
            conteo_individual: nominasReclutador.length,
            conectados_dia_1_individual: nominasReclutador.filter(n => n.dia_1 === 'ASISTIO' && !bajaDia1Set.has(`${gCodigo}|${g.campana}|${n.documento}`)).length
          }
        })
      }

      let sede = (g.sede && g.sede.trim() && g.sede.trim() !== '-') ? g.sede.trim() : '-'
      if (sede === '-' && matchingMeRows?.[0]?.sede) {
        sede = matchingMeRows[0].sede
      }

      // Segmento y campaña oficiales vienen de capacidad_rys
      const officialCampana = g.campana || matchingMeRows?.[0]?.campana || 'Sin Campaña'
      const officialSegmento = g.segmento || inferSegmento(officialCampana)

      resultList.push({
        grupo_codigo: gCodigo,
        codigo: gCodigo,
        periodo: g.periodo || '', // Periodo de inicio oficial de capacidad_rys
        periodo_ingreso_op: g.periodo_ingreso_op || '',
        campana_nombre: officialCampana,
        campana: officialCampana,
        segmento: officialSegmento,
        supervisor: '',
        estado: g.estado || 'ACTIVO',
        area_traslado: g.area_traslado || 'RECLUTAMIENTO',
        condicion: g.condicion || '',
        semana: g.semana_label || (g.semana_trabajo ? `SEM ${g.semana_trabajo}` : ''),
        semana_label: g.semana_label || (g.semana_trabajo ? `SEM ${g.semana_trabajo}` : ''),
        semana_trabajo: g.semana_trabajo || null,
        modalidad: g.modalidad || matchingMeRows?.[0]?.modalidad || '',
        horario: g.rango_horario || matchingMeRows?.[0]?.horario || '',
        fecha_inicio: g.fecha_inicio || g.fecha_registro || matchingMeRows?.[0]?.fecha || '',
        fecha_registro: g.fecha_registro || '',
        fecha_inicio_ojt: g.fecha_inicio_ojt || '',
        fecha_ingreso_op: g.fecha_ingreso_op || matchingMeRows?.[0]?.fecha_ingreso_op || '',
        meta_dia_0: metaDia0,
        meta_dia_1: metaDia1,
        meta_dia_0_grupal: metaDia0,
        meta_dia_1_grupal: metaDia1,
        rq_solicitado: rqSolicitado,
        rq_ftes_solicitado: rqFtes || rqSolicitado,
        reclutadores_metas: reclutadoresConStats,
        sede,
        lista_actual: listaActual,
        conectados_dia_0: conectadosDia0,
        conectados_dia_1_grupal: conectadosDia1,
        from_metas_equipos: fromMetasEquipos
      })
    }

    // 2. Para registros adicionales en metas_equipos que no estuvieran en capacidad_rys
    for (const [exactKey, rows] of meExactMap.entries()) {
      if (processedMeExactKeys.has(exactKey)) continue
      if (!rows || rows.length === 0) continue
      const first = rows[0]
      const gCodigo = (first.grupo || '').trim()
      if (!gCodigo) continue

      const reclutadoresConStats = rows.map(r => {
        const nomUpper = (r.responsable || '').trim().toUpperCase()
        const eqData = equipoMap[nomUpper] || (r.documento_responsable ? equipoMap[r.documento_responsable] : null) || {}
        return {
          reclutador_id: r.documento_responsable || r.responsable,
          nombre_completo: r.responsable || 'Sin Asignar',
          documento: r.documento_responsable || eqData.documento || null,
          alias: eqData.alias || r.responsable?.split(' ')[0] || null,
          meta_rq_individual: Number(r.rq_individual || 0),
          conteo_individual: Number(r.conteo_individual || 0),
          meta_dia_1_individual: Number(r.meta_dia_1_individual || 0),
          conectados_dia_1_individual: Number(r.conectados_dia_1 || 0)
        }
      })

      const seg = first.segmento || inferSegmento(first.campana)

      resultList.push({
        grupo_codigo: gCodigo,
        codigo: gCodigo,
        periodo: first.periodo || '',
        periodo_ingreso_op: '',
        campana_nombre: first.campana || 'Sin Campaña',
        campana: first.campana || 'Sin Campaña',
        segmento: seg,
        supervisor: '',
        estado: 'ACTIVO',
        area_traslado: 'RECLUTAMIENTO',
        condicion: '',
        semana: first.semana || '',
        semana_label: first.semana || '',
        semana_trabajo: first.semana ? Number(String(first.semana).replace(/\D/g, '')) || null : null,
        modalidad: first.modalidad || '',
        horario: first.horario || '',
        fecha_inicio: first.fecha || '',
        fecha_registro: first.fecha || '',
        fecha_inicio_ojt: '',
        fecha_ingreso_op: first.fecha_ingreso_op || '',
        meta_dia_0: Number(first.meta_dia_0 || 0),
        meta_dia_1: Number(first.meta_dia_1_grupal || 0),
        meta_dia_0_grupal: Number(first.meta_dia_0 || 0),
        meta_dia_1_grupal: Number(first.meta_dia_1_grupal || 0),
        rq_solicitado: Number(first.rq || 0),
        rq_ftes_solicitado: Number(first.rq || 0),
        reclutadores_metas: reclutadoresConStats,
        sede: first.sede || '-',
        lista_actual: Number(first.lista_actual || 0),
        conectados_dia_0: Number(first.conectados_dia_0 || 0),
        conectados_dia_1_grupal: Number(first.total_dia_1 || 0),
        from_metas_equipos: true
      })
    }

    return resultList
  }

  return []
  })
}

export async function saveGrupoMetas(grupoCodigo, reclutadoresMetas, grupoContext = {}) {
  if (DB_MODE === 'supabase') {
    if (!grupoCodigo) return false
    const grupo_codigo = grupoCodigo
    
    // 1. Delete existing assignments
    const { error: delErr } = await supabase
      .from('grupo_reclutadores')
      .delete()
      .eq('grupo_codigo', grupo_codigo)
    if (delErr) throw delErr

    // 2. Insert new assignments if any
    if (reclutadoresMetas && reclutadoresMetas.length > 0) {
      const rows = reclutadoresMetas.map(rm => ({
        grupo_codigo: grupo_codigo,
        reclutador_id: rm.reclutador_id,
        documento: rm.documento || null,
        reclutador_nombre: rm.nombre_completo || null,
        periodo: grupoContext.periodo || null,
        semana: grupoContext.semana || null,
        segmento: grupoContext.segmento || null,
        campana: grupoContext.campana || null,
        meta_rq_individual: rm.meta_rq_individual || 0,
        meta_dia_1_individual: rm.meta_dia_1_individual || 0,
        updated_at: new Date().toISOString()
      }))
      const { error: insErr } = await supabase
        .from('grupo_reclutadores')
        .insert(rows)
      if (insErr) throw insErr

      // 3. Sync to new dedicated metas_equipos table
      try {
        await supabase.from('metas_equipos').delete().eq('grupo', grupo_codigo)
        const metasEquiposRows = reclutadoresMetas.map(rm => ({
          semana: grupoContext.semana || null,
          periodo: grupoContext.periodo || null,
          grupo: grupo_codigo,
          campana: grupoContext.campana || null,
          sede: grupoContext.sede || null,
          modalidad: grupoContext.modalidad || null,
          horario: grupoContext.horario || null,
          fecha: grupoContext.fecha || null,
          fecha_ingreso_op: grupoContext.fecha_ingreso_op || null,
          rq: grupoContext.rq || 0,
          responsable: rm.nombre_completo || null,
          documento_responsable: rm.documento || null,
          rq_individual: rm.meta_rq_individual || 0,
          conteo_individual: rm.conteo_individual || 0,
          lista_actual: grupoContext.lista_actual || 0,
          meta_dia_0: grupoContext.meta_dia_0 || 0,
          conectados_dia_0: grupoContext.conectados_dia_0 || 0,
          meta_dia_1_individual: rm.meta_dia_1_individual || 0,
          conectados_dia_1: rm.conectados_dia_1_individual || 0,
          meta_dia_1_grupal: grupoContext.meta_dia_1 || 0,
          total_dia_1: grupoContext.conectados_dia_1_grupal || 0,
          updated_at: new Date().toISOString()
        }))
        await supabase.from('metas_equipos').insert(metasEquiposRows)
      } catch (syncErr) {
        console.warn('Sync to metas_equipos table warning:', syncErr)
      }
    } else {
      // Si se removieron todos los reclutadores del grupo
      try {
        await supabase.from('metas_equipos').delete().eq('grupo', grupo_codigo)
      } catch (syncErr) {
        console.warn('Sync delete metas_equipos warning:', syncErr)
      }
    }
    await invalidateCache('grupos_con_metas')
    return true
  }
  return true
}

export async function fetchFormadores() {
  if (DB_MODE === 'supabase') {
    return withCache('formadores_list', 120000, async () => {
      const map = new Map()
      // 1. Fetch de tabla formadores
      try {
        const { data: formData } = await supabase
          .from('formadores')
          .select('documento, nombre_completo, sede, segmento, subcampana, cargo_contractual, cargo_funcional, estado')
          .order('nombre_completo')
        
        if (formData) {
          formData.forEach(f => {
            const doc = String(f.documento || '').trim()
            if (doc) {
              const nombre = (f.nombre_completo || '').trim().toUpperCase()
              map.set(doc, {
                documento: doc,
                nombre_completo: nombre,
                nombres_completos: nombre,
                datos_completos: nombre,
                sede: f.sede || '',
                segmento: f.segmento || '',
                subcampana: f.subcampana || '',
                cargo_contractual: f.cargo_contractual || 'FORMADOR',
                cargo_funcional: (f.cargo_funcional || 'FORMADOR').trim().toUpperCase(),
                estado: (f.estado || 'Activo').trim()
              })
            }
          })
        }
      } catch (e) {
        console.warn('fetchFormadores: error reading formadores:', e)
      }

      // 2. Fetch de tabla equipo_formacion (merge y enriquecimiento)
      try {
        const { data: eqData, error } = await supabase
          .from('equipo_formacion')
          .select('documento, apellido_paterno, apellido_materno, nombres_completos, datos_completos, sede, segmento, subcampana, cargo_contractual, cargo_funcional, estado, fecha_inicio, fecha_cese, bono_bruto, usuario_alix')
          .order('nombres_completos')

        if (!error && eqData) {
          eqData.forEach(f => {
            const doc = String(f.documento || '').trim()
            if (doc) {
              const existing = map.get(doc) || {}
              const nombre = (f.datos_completos || f.nombres_completos || existing.nombre_completo || '').trim().toUpperCase()
              map.set(doc, {
                ...f,
                documento: doc,
                nombre_completo: nombre,
                nombres_completos: nombre,
                datos_completos: nombre,
                sede: f.sede || existing.sede || '',
                segmento: f.segmento || existing.segmento || '',
                subcampana: f.subcampana || existing.subcampana || '',
                cargo_contractual: f.cargo_contractual || existing.cargo_contractual || 'FORMADOR',
                cargo_funcional: (f.cargo_funcional || existing.cargo_funcional || 'FORMADOR').trim().toUpperCase(),
                estado: (f.estado || existing.estado || 'ACTIVO').trim().toUpperCase()
              })
            }
          })
        }
      } catch (e) {
        console.warn('fetchFormadores: error reading equipo_formacion:', e)
      }

      if (map.size > 0) {
        return Array.from(map.values()).sort((a, b) => (a.nombre_completo || '').localeCompare(b.nombre_completo || ''))
      }
      return []
    })
  }
  // Local fallback
  const list = getFromStorage('formadores') || []
  return list.map(f => ({
    documento: f.documento,
    nombre_completo: f.nombre_completo || f.nombre,
    nombres_completos: f.nombre_completo || f.nombre,
    datos_completos: f.nombre_completo || f.nombre,
    sede: f.sede || '',
    segmento: f.segmento || '',
    subcampana: f.subcampana || '',
    cargo_funcional: f.cargo_funcional || 'FORMADOR',
    estado: f.estado || 'Activo'
  }))
}

// ─────────────────────────────────────────────
// AUDIT LOGS
// ─────────────────────────────────────────────
export async function fetchAuditLogs() {
  if (DB_MODE === 'supabase') {
    const { data, error } = await supabase
      .from('audit_logs')
      .select('*')
      .order('fecha', { ascending: false })
      .limit(200)
    if (error) throw error
    return data
  }
  return getFromStorage('audit_logs') || []
}

// ─────────────────────────────────────────────
// EVALUACIONES
// ─────────────────────────────────────────────
export async function fetchEvaluaciones(grupoCodigo) {
  if (DB_MODE === 'supabase') {
    const { data, error } = await supabase
      .from('evaluaciones_capacitacion')
      .select('*')
      .eq('grupo_codigo', grupoCodigo)
    if (error) throw error
    return data
  }
  initLocalStorageDb()
  const list = getFromStorage('evaluaciones') || []
  return list.filter(e => e.grupo_codigo === grupoCodigo)
}

export async function upsertEvaluaciones(records) {
  if (DB_MODE === 'supabase') {
    const { data, error } = await supabase
      .from('evaluaciones_capacitacion')
      .upsert(records, { onConflict: 'postulante_documento' })
      .select()
    if (error) throw error
    return data
  }
  initLocalStorageDb()
  const list = getFromStorage('evaluaciones') || []
  const updatedList = [...list]
  
  for (const r of records) {
    const idx = updatedList.findIndex(e => e.postulante_documento === r.postulante_documento)
    const item = { ...r, updated_at: new Date().toISOString() }
    if (idx !== -1) {
      updatedList[idx] = { ...updatedList[idx], ...item }
    } else {
      updatedList.push({ ...item, id: Date.now() + Math.random(), created_at: new Date().toISOString() })
    }
    mockAuditLog('evaluaciones_capacitacion', 'UPSERT', r.postulante_documento, null, r)
  }
  
  saveToStorage('evaluaciones', updatedList)
  return records
}

// ─────────────────────────────────────────────
// MOTIVOS DE BAJA
// ─────────────────────────────────────────────
export function fetchMotivosBaja() {
  return withCache('motivos_baja', 600000, async () => {
    if (DB_MODE === 'supabase') {
      const { data, error } = await supabase.from('motivos_baja').select('motivo')
      if (error) throw error
      const list = data || []
      if (!list.some(m => String(m.motivo || '').toUpperCase() === 'SOBREDOTACIÓN')) {
        list.push({ motivo: 'SOBREDOTACIÓN' })
      }
      return list
    }
    initLocalStorageDb()
    return getFromStorage('motivos_baja') || []
  });
}

export async function insertMotivoBaja(payload) {
  if (DB_MODE === 'supabase') {
    const { data, error } = await supabase.from('motivos_baja').insert([payload]).select().single()
    if (error) throw error
    invalidateCache('motivos_baja')
    return data
  }
  const list = getFromStorage('motivos_baja') || []
  const item = { ...payload }
  saveToStorage('motivos_baja', [...list, item])
  return item
}

export async function updateMotivoBaja(motivoId, payload) {
  if (DB_MODE === 'supabase') {
    const { data, error } = await supabase.from('motivos_baja').update(payload).eq('motivo', motivoId).select().single()
    if (error) throw error
    invalidateCache('motivos_baja')
    return data
  }
  const list = getFromStorage('motivos_baja') || []
  const idx = list.findIndex(m => m.motivo === motivoId)
  if (idx !== -1) {
    list[idx] = { ...list[idx], ...payload }
    saveToStorage('motivos_baja', list)
    return list[idx]
  }
  throw new Error('Motivo de baja no encontrado')
}

export async function deleteMotivoBaja(motivoId) {
  if (DB_MODE === 'supabase') {
    const { error } = await supabase.from('motivos_baja').delete().eq('motivo', motivoId)
    if (error) throw error
    invalidateCache('motivos_baja')
    return true
  }
  const list = getFromStorage('motivos_baja') || []
  saveToStorage('motivos_baja', list.filter(m => m.motivo !== motivoId))
  return true
}

export async function insertConsolidado(payloads) {
  // Proteger datos vitales: Si algún registro viene con nombres o celular vacíos, rescatar de nóminas o consolidado
  const incompleteDocs = payloads
    .filter(p => !p.nombres || !p.celular || !p.apellido_paterno)
    .map(p => String(p.documento || '').trim())
    .filter(Boolean);

  if (incompleteDocs.length > 0) {
    try {
      const sampleGrupo = String(payloads[0]?.codigo_grupo || payloads[0]?.grupo || '').trim();
      const sampleCampana = String(payloads[0]?.campana || '').trim();
      let nomBackupQuery = supabase
        .from('nominas')
        .select('documento, nombres, apellido_paterno, apellido_materno, celular, celular_referencia, condicion, campana, grupo_codigo')
        .in('documento', incompleteDocs);
      if (sampleGrupo) nomBackupQuery = nomBackupQuery.eq('grupo_codigo', sampleGrupo);
      if (sampleCampana) nomBackupQuery = nomBackupQuery.eq('campana', sampleCampana);

      const { data: nomBackup } = await nomBackupQuery;

      if (nomBackup && nomBackup.length > 0) {
        const nomMap = new Map(nomBackup.map(n => [String(n.documento).trim(), n]));
        payloads.forEach(p => {
          const docKey = String(p.documento || '').trim();
          const bk = nomMap.get(docKey);
          if (bk) {
            if (!p.nombres && bk.nombres) p.nombres = bk.nombres;
            if (!p.apellido_paterno && bk.apellido_paterno) p.apellido_paterno = bk.apellido_paterno;
            if (!p.apellido_materno && bk.apellido_materno) p.apellido_materno = bk.apellido_materno;
            if (!p.celular && (bk.celular || bk.celular_referencia)) p.celular = String(bk.celular || bk.celular_referencia).trim();
            if (!p.condicion_laboral && bk.condicion) p.condicion_laboral = bk.condicion;
            if (!p.campana && bk.campana) p.campana = bk.campana;
          }
        });
      }
    } catch (bkErr) {
      console.warn('Aviso enriqueciendo datos incompletos en insertConsolidado:', bkErr);
    }
  }

  // Limpiar solo el CORTE actual (grupo + fecha + campaña + corte).
  // Así un guardado de Corte 3 no borra la evidencia de A/I-OP de Cortes 1–2 del mismo día.
  const sample = payloads[0];
  const targetGroup = sample.codigo_grupo || sample.grupo;
  const targetFecha = sample.fecha_registro_asistencia;
  const targetCampana = sample.campana;
  const targetCorte = sample.corte !== undefined && sample.corte !== null && sample.corte !== ''
    ? Number(sample.corte)
    : null;
  
  if (targetGroup && targetFecha) {
    try {
      let delQuery = supabase
        .from('consolidado_asistencias')
        .delete()
        .eq('codigo_grupo', targetGroup)
        .eq('fecha_registro_asistencia', targetFecha)
        .neq('estado', 'DESCUENTO');

      if (targetCampana) {
        delQuery = delQuery.eq('campana', targetCampana);
      }
      if (Number.isFinite(targetCorte) && targetCorte > 0) {
        delQuery = delQuery.eq('corte', targetCorte);
      }

      const { error: delErr } = await delQuery;
      if (delErr) console.warn('Aviso al limpiar registros previos del corte:', delErr);
    } catch (cleanErr) {
      console.warn('Aviso al limpiar registros previos del corte:', cleanErr);
    }
  }

  const { error } = await supabase
    .from('consolidado_asistencias')
    .insert(payloads);
  if (error) {
    console.error('Error insertando en consolidado_asistencias:', error);
    // QW-5: Lanzar error para que el llamador lo maneje sin bloquear el hilo con alert()
    throw new Error('Error guardando en base de datos: ' + error.message);
  }
  // Invalidar caché para que la próxima lectura traiga datos frescos de Supabase
  invalidateCache('all_consolidado');
  invalidateCache('all_asistencias_bajas');
  invalidateCache('all_motivos_bajas');
  invalidateCache('grupos_dia1');
  invalidateCache('asistencias');
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('gea-data-mutation', { detail: { grupo_codigo: targetGroup } }));
    window.dispatchEvent(new CustomEvent('gea-global-refresh'));
  }
}

export async function regularizarAsistenciaPostulante({
  documento,
  grupo_codigo,
  campana = '',
  semana = '',
  formadorDoc = '',
  formadorNombre = '',
  postulanteInfo = {},
  records = []
}) {
  const cleanDoc = String(documento || '').trim();
  const targetGroup = String(grupo_codigo || '').trim();
  if (!cleanDoc || !targetGroup || !records || records.length === 0) {
    return { success: false, message: 'Datos incompletos para regularización.' };
  }

  const weekStr = semana ? `SEM${String(semana).replace(/\D/g, '')}` : '';
  const nowStr = new Date().toLocaleString('es-PE');

  if (DB_MODE === 'supabase') {
    let finalNombres = String(postulanteInfo.nombres || '').trim();
    let finalPaterno = String(postulanteInfo.apellido_paterno || '').trim();
    let finalMaterno = String(postulanteInfo.apellido_materno || '').trim();
    let finalCelular = String(postulanteInfo.celular || postulanteInfo.telefono || '').trim();
    let finalCondicion = String(postulanteInfo.condicion_laboral || postulanteInfo.condicion || '').trim();
    let finalCampana = String(campana || postulanteInfo.campana || '').trim();
    let finalDocFormador = String(formadorDoc || postulanteInfo.documento_formador || postulanteInfo.formador_documento || '').trim();
    let finalNomFormador = String(formadorNombre || postulanteInfo.nombre_formador || postulanteInfo.formador || '').trim();

    // Rescatar campos personales de consolidado_asistencias previo si falta alguno para NUNCA perder datos
    if (!finalNombres || !finalPaterno || !finalCelular || !finalCondicion || !finalCampana) {
      try {
        const { data: existingData } = await supabase
          .from('consolidado_asistencias')
          .select('nombres, apellido_paterno, apellido_materno, celular, condicion_laboral, campana, archivo_origen, documento_formador, nombre_formador')
          .eq('documento', cleanDoc)
          .order('created_at', { ascending: false })
          .limit(1);
        if (existingData && existingData[0]) {
          const ex = existingData[0];
          if (!finalNombres && ex.nombres) finalNombres = ex.nombres;
          if (!finalPaterno && ex.apellido_paterno) finalPaterno = ex.apellido_paterno;
          if (!finalMaterno && ex.apellido_materno) finalMaterno = ex.apellido_materno;
          if (!finalCelular && ex.celular) finalCelular = ex.celular;
          if (!finalCondicion && ex.condicion_laboral) finalCondicion = ex.condicion_laboral;
          if (!finalCampana && ex.campana) finalCampana = ex.campana;
          if (!finalDocFormador && ex.documento_formador) finalDocFormador = ex.documento_formador;
          if (!finalNomFormador && ex.nombre_formador) finalNomFormador = ex.nombre_formador;
        }
      } catch (errPrev) {
        console.warn('Aviso rescatando datos previos de consolidado:', errPrev);
      }
    }

    // Si aún falta celular o nombres, consultar en nóminas
    if (!finalCelular || !finalNombres) {
      try {
        const { data: nomData } = await supabase
          .from('nominas')
          .select('nombres, apellido_paterno, apellido_materno, celular, celular_referencia')
          .eq('documento', cleanDoc)
          .limit(1);
        if (nomData && nomData[0]) {
          const nd = nomData[0];
          if (!finalCelular) finalCelular = String(nd.celular || nd.celular_referencia || '').trim();
          if (!finalNombres && nd.nombres) finalNombres = nd.nombres;
          if (!finalPaterno && nd.apellido_paterno) finalPaterno = nd.apellido_paterno;
          if (!finalMaterno && nd.apellido_materno) finalMaterno = nd.apellido_materno;
        }
      } catch (errNom) {
        console.warn('Aviso buscando datos en nominas:', errNom);
      }
    }

    if (!finalDocFormador || !finalNomFormador) {
      try {
        const { data: formRows } = await supabase
          .from('consolidado_asistencias')
          .select('documento_formador, nombre_formador')
          .or(`codigo_grupo.eq.${targetGroup},grupo.eq.${targetGroup}`)
          .not('documento_formador', 'is', null)
          .neq('documento_formador', '')
          .limit(1);
        if (formRows && formRows[0]) {
          if (!finalDocFormador && formRows[0].documento_formador) finalDocFormador = String(formRows[0].documento_formador).trim();
          if (!finalNomFormador && formRows[0].nombre_formador) finalNomFormador = String(formRows[0].nombre_formador).trim();
        }
      } catch (errF) {
        console.warn('Aviso buscando formador:', errF);
      }
    }

    for (const r of records) {
      const isoDate = r.fecha;
      if (!isoDate) continue;
      const [year, month, day] = isoDate.split('-');
      const spreadsheetDate1 = `${parseInt(day, 10)}/${parseInt(month, 10)}/${year}`;
      const spreadsheetDate2 = `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
      const isBaja = r.sigla === 'B';

      // 1. Verificar si ya existe registro en consolidado_asistencias para esta fecha, grupo y campaña
      let existingId = null;
      try {
        let exQuery = supabase
          .from('consolidado_asistencias')
          .select('id')
          .eq('documento', cleanDoc)
          .in('fecha_registro_asistencia', [spreadsheetDate1, spreadsheetDate2, isoDate])
          .or(`codigo_grupo.eq.${targetGroup},grupo.eq.${targetGroup}`)
          .limit(1);
        if (finalCampana) exQuery = exQuery.eq('campana', finalCampana);
        const { data: exRows } = await exQuery;
        if (exRows && exRows.length > 0) {
          existingId = exRows[0].id;
        }
      } catch (errFind) {
        console.warn('Aviso verificando registro previo en consolidado:', errFind);
      }

      if (existingId) {
        // ACTUALIZAR solo estado, sigla, motivo_baja y tipo_reclutado, preservando 100% de nombres, celular y datos
        try {
          await supabase
            .from('consolidado_asistencias')
            .update({
              sigla: r.sigla,
              estado: isBaja ? 'CESADO' : 'ACTIVO',
              tipo_reclutado: isBaja ? 'CESE' : (postulanteInfo.tipoReclutado || postulanteInfo.tipo_reclutado || 'APTO'),
              motivo_baja: isBaja ? (r.motivo_baja || 'DESERCIÓN') : '',
              fecha_hora_registro: nowStr
            })
            .eq('id', existingId);
        } catch (errUpd) {
          console.error('Error actualizando consolidado en regularización:', errUpd);
        }
      } else {
        // INSERTAR nuevo registro con todos los datos enriquecidos para que ningún campo quede vacío
        const consolidadoPayload = {
          archivo_origen: weekStr,
          documento: cleanDoc,
          apellido_materno: finalMaterno,
          apellido_paterno: finalPaterno,
          nombres: finalNombres,
          celular: finalCelular,
          condicion_laboral: finalCondicion,
          campana: finalCampana,
          grupo: targetGroup,
          codigo_grupo: targetGroup,
          documento_formador: finalDocFormador,
          nombre_formador: finalNomFormador,
          fecha_registro_asistencia: spreadsheetDate1,
          tipo_reclutado: isBaja ? 'CESE' : (postulanteInfo.tipoReclutado || postulanteInfo.tipo_reclutado || 'APTO'),
          estado: isBaja ? 'CESADO' : 'ACTIVO',
          sigla: r.sigla,
          motivo_baja: isBaja ? (r.motivo_baja || 'DESERCIÓN') : '',
          fecha_hora_registro: nowStr
        };

        const { error: insConsolidadoErr } = await supabase
          .from('consolidado_asistencias')
          .insert([consolidadoPayload]);

        if (insConsolidadoErr) {
          console.error('Error insertando regularización en consolidado:', insConsolidadoErr);
        }
      }

      // SoT = consolidado_asistencias. No se escribe asistencias_capacitacion (legacy).
    }

    // 2. Sincronizar estado en nóminas si fue reactivado o quedó como baja (scoped a cohorte)
    const hasActiveAttendance = records.some(r => r.sigla === 'A' || r.sigla === 'I-OP');
    const lastRecord = records.length > 0 ? records[records.length - 1] : null;
    const isLatestBaja = Boolean(lastRecord && lastRecord.sigla === 'B');
    const latestMotive = isLatestBaja ? (lastRecord.motivo_baja || 'DESERCIÓN') : null;

    try {
      const cohortScope = { grupo_codigo: targetGroup, campana: finalCampana };
      if (hasActiveAttendance && !isLatestBaja) {
        await scopeNominasCohorte(
          supabase
            .from('nominas')
            .update({ estado: 'ACTIVO', activo: true, tipo_reclutado: 'APTO', motivo_baja: null, updated_at: new Date().toISOString() })
            .eq('documento', cleanDoc),
          cohortScope
        );
      } else if (isLatestBaja) {
        await scopeNominasCohorte(
          supabase
            .from('nominas')
            .update({ estado: 'CESADO', activo: false, tipo_reclutado: 'CESE', motivo_baja: latestMotive, updated_at: new Date().toISOString() })
            .eq('documento', cleanDoc),
          cohortScope
        );
      }
    } catch (errNomSync) {
      console.warn('Aviso sincronizando estado en nómina:', errNomSync);
    }

    // Invalidar cachés
    invalidateCache('consolidado');
    invalidateCache('asistencias');
    invalidateCache('postulantes');
    invalidateCache('nominas');
    invalidateCache('grupos_dia1');

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('gea-data-mutation', { detail: { grupo_codigo: targetGroup, documento: cleanDoc } }));
      window.dispatchEvent(new CustomEvent('gea-global-refresh'));
    }

    return { success: true };
  } else {
    initLocalStorageDb();
    return { success: true };
  }
}

/**
 * Levanta la baja de un postulante que faltó en un día previo (ej. Día 1)
 * pero se presenta en un día posterior (ej. Día 2).
 * Convierte el día de la baja previa a 'FI' (Falta Injustificada) y reactiva al postulante en nóminas.
 */
export async function levantarBajaPostulante({
  documento,
  grupo_codigo,
  campana = '',
  fechaBaja,
  formadorNombre = '',
  formadorDoc = '',
  fechaHoy = null,
  postulanteInfo = null
}) {
  const cleanDoc = String(documento || '').trim();
  const targetGroup = String(grupo_codigo || '').trim();
  if (!cleanDoc || !targetGroup || !fechaBaja) {
    return { success: false, message: 'Datos incompletos para levantar la baja.' };
  }

  const isoBaja = parseFechaAsistencia(fechaBaja) || fechaBaja;
  const [year, month, day] = isoBaja.includes('-') ? isoBaja.split('-') : ['', '', ''];
  const spreadsheetDate1 = year ? `${parseInt(day, 10)}/${parseInt(month, 10)}/${year}` : fechaBaja;
  const spreadsheetDate2 = year ? `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}` : fechaBaja;

  if (DB_MODE === 'supabase') {
    const cleanCampana = String(campana || '').trim();

    // 1. Modificar el registro en consolidado_asistencias (SoT) para la fecha de baja:
    // Pasa de Baja ('B') a Falta Injustificada ('FI'), motivo vacío y estado ACTIVO.
    try {
      let consQuery = supabase
        .from('consolidado_asistencias')
        .update({
          sigla: 'FI',
          estado: 'ACTIVO',
          tipo_reclutado: 'APTO',
          motivo_baja: ''
        })
        .eq('documento', cleanDoc)
        .in('fecha_registro_asistencia', [spreadsheetDate1, spreadsheetDate2, isoBaja, fechaBaja])
        .or(`codigo_grupo.eq.${targetGroup},grupo.eq.${targetGroup}`);
      if (cleanCampana) consQuery = consQuery.eq('campana', cleanCampana);
      await consQuery;
    } catch (errConsolidado) {
      console.warn('Error actualizando consolidado en levantarBajaPostulante:', errConsolidado);
    }

    // 2. Reactivar en nominas aislado por cohorte (documento + grupo + campaña)
    try {
      await scopeNominasCohorte(
        supabase
          .from('nominas')
          .update({
            estado: 'ACTIVO',
            activo: true,
            tipo_reclutado: 'APTO',
            motivo_baja: null,
            updated_at: new Date().toISOString()
          })
          .eq('documento', cleanDoc),
        { grupo_codigo: targetGroup, campana: cleanCampana }
      );
    } catch (errNom) {
      console.warn('Error reactivando postulante en nominas:', errNom);
    }

    // 3. Si se especificó fechaHoy (el día en que se presenta, ej. Día 2), registrar Asistencia ('A') en consolidado (SoT)
    if (fechaHoy && parseFechaAsistencia(fechaHoy) !== isoBaja) {
      const isoHoy = parseFechaAsistencia(fechaHoy) || fechaHoy;
      const [hY, hM, hD] = isoHoy.includes('-') ? isoHoy.split('-') : ['', '', ''];
      const sheetHoy = hY ? `${parseInt(hD, 10)}/${parseInt(hM, 10)}/${hY}` : fechaHoy;

      try {
        let existingHoyQuery = supabase
          .from('consolidado_asistencias')
          .select('id, nombres, apellido_paterno, apellido_materno, celular, condicion_laboral, campana, archivo_origen')
          .eq('documento', cleanDoc)
          .in('fecha_registro_asistencia', [sheetHoy, isoHoy, fechaHoy])
          .or(`codigo_grupo.eq.${targetGroup},grupo.eq.${targetGroup}`)
          .limit(1);
        if (cleanCampana) existingHoyQuery = existingHoyQuery.eq('campana', cleanCampana);

        const { data: existingHoy } = await existingHoyQuery;

        if (existingHoy && existingHoy.length > 0) {
          await supabase
            .from('consolidado_asistencias')
            .update({
              sigla: 'A',
              estado: 'ACTIVO',
              tipo_reclutado: 'APTO',
              motivo_baja: '',
              fecha_hora_registro: new Date().toLocaleString('es-PE')
            })
            .eq('id', existingHoy[0].id);
        } else {
          const info = postulanteInfo || {};
          await supabase.from('consolidado_asistencias').insert([{
            documento: cleanDoc,
            apellido_materno: info.apellido_materno || '',
            apellido_paterno: info.apellido_paterno || '',
            nombres: info.nombres || '',
            celular: info.celular || '',
            condicion_laboral: info.condicion_laboral || '',
            campana: cleanCampana || info.campana || '',
            grupo: targetGroup,
            codigo_grupo: targetGroup,
            documento_formador: formadorDoc || '',
            nombre_formador: formadorNombre || '',
            fecha_registro_asistencia: sheetHoy,
            tipo_reclutado: 'APTO',
            estado: 'ACTIVO',
            sigla: 'A',
            motivo_baja: '',
            fecha_hora_registro: new Date().toLocaleString('es-PE'),
          }]);
        }
      } catch (errHoy) {
        console.warn('Aviso sincronizando fecha de asistencia actual en levantarBajaPostulante:', errHoy);
      }
    }

    // Invalidar cachés para reflejar el estado desbloqueado y con datos frescos
    invalidateCache('all_consolidado');
    invalidateCache('consolidado');
    invalidateCache('asistencias');
    invalidateCache('all_asistencias_bajas');
    invalidateCache('all_motivos_bajas');
    invalidateCache('postulantes');
    invalidateCache('nominas');
    invalidateCache('grupos_dia1');

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('gea-data-mutation', { detail: { grupo_codigo: targetGroup, documento: cleanDoc } }));
      window.dispatchEvent(new CustomEvent('gea-global-refresh'));
    }

    return { success: true };
  } else {
    return { success: true };
  }
}

/**
 * Autocompleta en lote los días de asistencia que quedaron omitidos / sin registrar en un grupo.
 * Clona el estado del día previo (activos continúan como 'A', bajas consolidadas continúan como 'B' con su motivo original).
 */
export async function autocompletarDiasFaltantesGrupo({
  grupo_codigo,
  campana = '',
  semana = '',
  formadorDoc = '',
  formadorNombre = '',
  missingDates = [],
  baseAttendanceList = [],
  allAsistencias = []
}) {
  const targetGroup = String(grupo_codigo || '').trim();
  if (!targetGroup || !missingDates.length || !baseAttendanceList.length) {
    return { success: false, message: 'Datos insuficientes para autocompletar días faltantes.' };
  }

  const weekStr = semana ? `SEM${String(semana).replace(/\D/g, '')}` : '';
  const nowStr = new Date().toLocaleString('es-PE');
  const sortedDates = [...missingDates].sort();

  for (const dateIso of sortedDates) {
    const [year, month, day] = dateIso.split('-');
    const spreadsheetDate = `${parseInt(day, 10)}/${parseInt(month, 10)}/${year}`;

    // Construir el payload respetando el estado de cada postulante
    const payloads = baseAttendanceList.map(item => {
      // Buscar si este postulante ya tenía una baja previa registrada ANTES de esta fecha
      const doc = String(item.documento || '').trim();
      const pastBaja = allAsistencias.find(a => {
        const aDoc = String(a.postulante_documento || a.documento || '').trim();
        const aGroup = String(a.grupo_codigo || a.codigo_grupo || a.grupo || '').trim();
        if (aDoc !== doc) return false;
        if (aGroup && aGroup !== targetGroup) return false;
        const aFecha = parseFechaAsistencia(a.fecha_asistencia || a.fecha_registro_asistencia || a.fecha);
        return aFecha && aFecha < dateIso && (a.sigla_asistencia === 'B' || a.sigla === 'B');
      });

      const isBaja = Boolean(pastBaja) || (item.isLockedBaja && item.pastMotive);
      const motivoBaja = isBaja ? (pastBaja?.motivo_baja || item.pastMotive || item.motivo_baja || 'DESERCIÓN') : '';
      const sigla = isBaja ? 'B' : (item.sigla === 'I-OP' ? 'I-OP' : 'A');
      const estado = isBaja ? 'CESADO' : 'ACTIVO';
      const tipoReclutado = isBaja ? 'CESE' : (item.tipoReclutado || 'APTO');

      return {
        archivo_origen: weekStr,
        documento: doc,
        apellido_materno: item.apellido_materno || '',
        apellido_paterno: item.apellido_paterno || '',
        nombres: item.nombres || '',
        celular: item.celular || '',
        condicion_laboral: item.condicion_laboral || item.condicion || '',
        campana: campana || item.campana || '',
        grupo: targetGroup,
        codigo_grupo: targetGroup,
        documento_formador: formadorDoc || item.docFormador || '',
        nombre_formador: formadorNombre || item.nombreFormador || '',
        fecha_registro_asistencia: spreadsheetDate,
        tipo_reclutado: tipoReclutado,
        estado: estado,
        sigla: sigla,
        motivo_baja: motivoBaja,
        fecha_hora_registro: nowStr
      };
    });

    try {
      await insertConsolidado(payloads);

      // Sincronizar también asistencias_capacitacion
      if (DB_MODE === 'supabase') {
        const capPayloads = payloads.map(p => ({
          grupo_codigo: targetGroup,
          postulante_documento: p.documento,
          fecha_asistencia: dateIso,
          sigla_asistencia: p.sigla,
          motivo_baja: p.sigla === 'B' ? (p.motivo_baja || 'DESERCIÓN') : null,
          usuario_registro: formadorNombre || 'AUTOCOMPLETAR_GAP'
        }));
        await supabase
          .from('asistencias_capacitacion')
          .upsert(capPayloads, { onConflict: 'grupo_codigo,postulante_documento,fecha_asistencia' });
      }
    } catch (errDate) {
      console.error(`Error autocompletando fecha ${dateIso}:`, errDate);
    }
  }

  // Invalidar cachés y emitir refresco
  invalidateCache('all_consolidado');
  invalidateCache('consolidado');
  invalidateCache('asistencias');
  invalidateCache('all_asistencias_bajas');
  invalidateCache('all_motivos_bajas');
  invalidateCache('grupos_dia1');

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('gea-data-mutation', { detail: { grupo_codigo: targetGroup } }));
    window.dispatchEvent(new CustomEvent('gea-global-refresh'));
  }

  return { success: true, count: sortedDates.length };
}

/**
 * Elimina asistencias en bloque de forma estrictamente acotada a este usuario,
 * este grupo, esta campaña y estas fechas específicas.
 * Deja las celdas vacías (—).
 */
export async function eliminarAsistenciaLoteFechas({
  documento,
  grupo_codigo,
  campana = '',
  semana = '',
  periodo = '',
  segmento = '',
  fechas = []
}) {
  const cleanDoc = String(documento || '').trim();
  const targetGroup = String(grupo_codigo || '').trim();
  const cleanCampana = String(campana || '').trim();
  if (!cleanDoc || !targetGroup || !fechas.length) {
    return { success: false, message: 'Faltan datos obligatorios para la eliminación.' };
  }

  const matchDates = [];
  const isoDates = [];

  for (const f of fechas) {
    if (!f) continue;
    let iso = '';
    let spreadsheet = '';
    let padded = '';

    if (f.includes('-')) {
      const parts = f.split('T')[0].split('-');
      if (parts.length === 3) {
        iso = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
        spreadsheet = `${parseInt(parts[2], 10)}/${parseInt(parts[1], 10)}/${parts[0]}`;
        padded = `${String(parts[2]).padStart(2, '0')}/${String(parts[1]).padStart(2, '0')}/${parts[0]}`;
      }
    } else if (f.includes('/')) {
      const parts = f.split('/');
      if (parts.length === 3) {
        iso = `${parts[2]}-${String(parts[1]).padStart(2, '0')}-${String(parts[0]).padStart(2, '0')}`;
        spreadsheet = `${parseInt(parts[0], 10)}/${parseInt(parts[1], 10)}/${parts[2]}`;
        padded = `${String(parts[0]).padStart(2, '0')}/${String(parts[1]).padStart(2, '0')}/${parts[2]}`;
      }
    }

    if (iso) isoDates.push(iso);
    if (spreadsheet) matchDates.push(spreadsheet);
    if (padded && padded !== spreadsheet) matchDates.push(padded);
    if (iso && !matchDates.includes(iso)) matchDates.push(iso);
  }

  if (DB_MODE === 'supabase') {
    // 1. Eliminar estrictamente de consolidado_asistencias (solo este usuario, este grupo, esta campaña y estas fechas)
    try {
      let q = supabase
        .from('consolidado_asistencias')
        .delete()
        .eq('documento', cleanDoc);

      if (targetGroup) {
        q = q.or(`codigo_grupo.eq.${targetGroup},grupo.eq.${targetGroup}`);
      }

      if (cleanCampana && cleanCampana !== 'Todas' && cleanCampana !== 'TODAS') {
        q = q.eq('campana', cleanCampana);
      }

      if (matchDates.length > 0) {
        q = q.in('fecha_registro_asistencia', matchDates);
      }

      const { error: delConsErr } = await q;
      if (delConsErr) console.warn('Aviso eliminando de consolidado_asistencias:', delConsErr);
    } catch (e) {
      console.warn('Error en delete de consolidado_asistencias:', e);
    }

    // 2. Eliminar estrictamente de asistencias_capacitacion (solo este postulante, este grupo y estas fechas)
    try {
      let qAsis = supabase
        .from('asistencias_capacitacion')
        .delete()
        .eq('postulante_documento', cleanDoc);

      if (targetGroup) {
        qAsis = qAsis.eq('grupo_codigo', targetGroup);
      }

      if (isoDates.length > 0) {
        qAsis = qAsis.in('fecha_asistencia', isoDates);
      }

      const { error: delAsisErr } = await qAsis;
      if (delAsisErr) console.warn('Aviso eliminando de asistencias_capacitacion:', delAsisErr);
    } catch (e) {
      console.warn('Error en delete de asistencias_capacitacion:', e);
    }

    // Invalidar cachés sin disparar recarga de pantalla completa
    invalidateCache('all_consolidado');
    invalidateCache('all_asistencias_bajas');
    invalidateCache('all_motivos_bajas');
    invalidateCache('asistencias');

    return { success: true };
  }

  return { success: true };
}

/**
 * Guarda o actualiza un lote de fechas de forma estrictamente acotada a este usuario,
 * este grupo y esta campaña.
 */
export async function guardarAsistenciaLoteFechas({
  documento,
  grupo_codigo,
  campana = '',
  semana = '',
  periodo = '',
  segmento = '',
  fechas = [],
  sigla = 'A',
  motivo_baja = '',
  postulanteInfo = {},
  usuarioRegistro = 'ADMIN'
}) {
  const cleanDoc = String(documento || '').trim();
  const targetGroup = String(grupo_codigo || '').trim();
  const cleanCampana = String(campana || postulanteInfo.campana || '').trim();
  if (!cleanDoc || !targetGroup || !fechas.length) {
    return { success: false, message: 'Faltan datos obligatorios para registrar la asistencia en lote.' };
  }

  // 1. Limpieza estricta previa para este usuario, grupo, campaña, semana y fechas
  await eliminarAsistenciaLoteFechas({
    documento: cleanDoc,
    grupo_codigo: targetGroup,
    campana: cleanCampana,
    semana: semana,
    periodo: periodo,
    segmento: segmento,
    fechas: fechas
  });

  const isBaja = sigla === 'B';
  const weekStr = semana ? `SEM${String(semana).replace(/\D/g, '')}` : (postulanteInfo.semana ? `SEM${String(postulanteInfo.semana).replace(/\D/g, '')}` : '');
  const nowStr = new Date().toLocaleString('es-PE');

  // ── Resolución inteligente de celular y formador si faltan en postulanteInfo ──
  let finalCelular = String(postulanteInfo.celular || '').trim();
  let finalDocFormador = String(postulanteInfo.documento_formador || postulanteInfo.formador_documento || '').trim();
  let finalNomFormador = String(postulanteInfo.nombre_formador || postulanteInfo.formador || '').trim();

  if (DB_MODE === 'supabase') {
    // 1. Resolver celular desde nominas o consolidado
    if (!finalCelular) {
      try {
        const { data: nomData } = await supabase
          .from('nominas')
          .select('celular, celular_referencia')
          .eq('documento', cleanDoc)
          .limit(1);
        if (nomData && nomData[0]) {
          finalCelular = String(nomData[0].celular || nomData[0].celular_referencia || '').trim();
        }
      } catch (errNom) {
        console.warn('Aviso buscando celular en nominas:', errNom);
      }
    }
    if (!finalCelular) {
      try {
        const { data: celData } = await supabase
          .from('consolidado_asistencias')
          .select('celular')
          .eq('documento', cleanDoc)
          .not('celular', 'is', null)
          .neq('celular', '')
          .limit(1);
        if (celData && celData[0]?.celular) {
          finalCelular = String(celData[0].celular).trim();
        }
      } catch (errCel) {
        console.warn('Aviso buscando celular en consolidado:', errCel);
      }
    }

    // 2. Resolver formador (documento y nombre)
    if (!finalDocFormador || !finalNomFormador) {
      try {
        // A) Buscar en consolidado_asistencias para este grupo
        const { data: formRows } = await supabase
          .from('consolidado_asistencias')
          .select('documento_formador, nombre_formador')
          .or(`codigo_grupo.eq.${targetGroup},grupo.eq.${targetGroup}`)
          .not('documento_formador', 'is', null)
          .neq('documento_formador', '')
          .limit(1);
        if (formRows && formRows[0]) {
          if (!finalDocFormador && formRows[0].documento_formador) {
            finalDocFormador = String(formRows[0].documento_formador).trim();
          }
          if (!finalNomFormador && formRows[0].nombre_formador) {
            finalNomFormador = String(formRows[0].nombre_formador).trim();
          }
        }
      } catch (errForm) {
        console.warn('Aviso buscando formador en consolidado:', errForm);
      }
    }

    if (!finalDocFormador && finalNomFormador) {
      try {
        // B) Si tenemos el nombre del formador, buscar su documento en equipo_formacion
        const firstName = finalNomFormador.split(' ')[0] || '';
        const { data: eqRows } = await supabase
          .from('equipo_formacion')
          .select('documento, datos_completos, nombres_completos, apellido_paterno')
          .ilike('datos_completos', `%${firstName}%`)
          .limit(10);
        if (eqRows && eqRows.length > 0) {
          const normTarget = finalNomFormador.toUpperCase();
          const match = eqRows.find(r => {
            const full = String(r.datos_completos || `${r.nombres_completos} ${r.apellido_paterno}`).toUpperCase();
            return full.includes(normTarget) || normTarget.includes(full);
          });
          if (match?.documento) {
            finalDocFormador = String(match.documento).trim();
          } else if (eqRows[0]?.documento) {
            finalDocFormador = String(eqRows[0].documento).trim();
          }
        }
      } catch (errEq) {
        console.warn('Aviso buscando documento en equipo_formacion:', errEq);
      }
    }

    if (!finalDocFormador || !finalNomFormador) {
      try {
        // C) Buscar en capacidad_rys por código de grupo
        const { data: capRows } = await supabase
          .from('capacidad_rys')
          .select('codigo, formador_documento')
          .eq('codigo', targetGroup)
          .limit(1);
        if (capRows && capRows[0]?.formador_documento && !finalDocFormador) {
          finalDocFormador = String(capRows[0].formador_documento).trim();
        }
      } catch (errCap) {
        console.warn('Aviso buscando en capacidad_rys:', errCap);
      }
    }
  }

  const consolidadoRows = [];
  const asistenciasRows = [];

  for (const f of fechas) {
    let iso = '';
    let spreadsheet = '';

    if (f.includes('-')) {
      const parts = f.split('T')[0].split('-');
      if (parts.length === 3) {
        iso = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
        spreadsheet = `${parseInt(parts[2], 10)}/${parseInt(parts[1], 10)}/${parts[0]}`;
      }
    } else if (f.includes('/')) {
      const parts = f.split('/');
      if (parts.length === 3) {
        iso = `${parts[2]}-${String(parts[1]).padStart(2, '0')}-${String(parts[0]).padStart(2, '0')}`;
        spreadsheet = `${parseInt(parts[0], 10)}/${parseInt(parts[1], 10)}/${parts[2]}`;
      }
    }

    if (!iso || !spreadsheet) continue;

    consolidadoRows.push({
      archivo_origen: weekStr,
      documento: cleanDoc,
      apellido_materno: postulanteInfo.apellido_materno || '',
      apellido_paterno: postulanteInfo.apellido_paterno || '',
      nombres: postulanteInfo.nombres || '',
      celular: finalCelular,
      condicion_laboral: postulanteInfo.condicion_laboral || '',
      campana: cleanCampana,
      grupo: targetGroup,
      codigo_grupo: targetGroup,
      documento_formador: finalDocFormador,
      nombre_formador: finalNomFormador,
      fecha_registro_asistencia: spreadsheet,
      tipo_reclutado: postulanteInfo.tipoReclutado || postulanteInfo.tipo_reclutado || 'APTO',
      estado: isBaja ? 'CESADO' : 'ACTIVO',
      sigla: sigla,
      motivo_baja: isBaja ? (motivo_baja || 'DESERCIÓN') : '',
      fecha_hora_registro: nowStr
    });

    asistenciasRows.push({
      grupo_codigo: targetGroup,
      postulante_documento: cleanDoc,
      fecha_asistencia: iso,
      sigla_asistencia: sigla,
      motivo_baja: isBaja ? (motivo_baja || 'DESERCIÓN') : null,
      usuario_registro: usuarioRegistro || 'ADMIN'
    });
  }

  if (DB_MODE === 'supabase') {
    if (consolidadoRows.length > 0) {
      const { error: insConsErr } = await supabase
        .from('consolidado_asistencias')
        .insert(consolidadoRows);
      if (insConsErr) {
        console.error('Error insertando lote en consolidado_asistencias:', insConsErr);
        return { success: false, message: insConsErr.message };
      }
    }

    if (asistenciasRows.length > 0) {
      try {
        await supabase
          .from('asistencias_capacitacion')
          .insert(asistenciasRows);
      } catch (insAsisErr) {
        console.warn('Aviso insertando lote en asistencias_capacitacion:', insAsisErr);
      }
    }

    invalidateCache('all_consolidado');
    invalidateCache('all_asistencias_bajas');
    invalidateCache('all_motivos_bajas');
    invalidateCache('asistencias');

    return { success: true, rows: consolidadoRows };
  }

  return { success: true };
}

/**
 * Guarda o actualiza una celda individual de asistencia.
 */
export async function guardarAsistenciaCeldaIndividual(params) {
  return guardarAsistenciaLoteFechas({
    ...params,
    fechas: [params.fecha]
  });
}

/**
 * Elimina una asistencia de una celda individual.
 */
export async function eliminarAsistenciaCeldaIndividual(params) {
  return eliminarAsistenciaLoteFechas({
    ...params,
    fechas: [params.fecha]
  });
}

export async function fetchConsolidado() {
  if (DB_MODE === 'supabase') {
    const data = await fetchAllConsolidado();
    return data || []
  }
  return []
}

export async function fetchDashboardData() {
  if (DB_MODE === 'supabase') {
    const [consData, capRes, descRes] = await Promise.all([
      fetchAllConsolidado(),
      supabase.from('capacidad_rys').select('codigo, campana, meta_dia_1, rq_solicitado, rq_ftes_solicitado, fecha_registro, fecha_inicio_ojt, fecha_ingreso_op, periodo, periodo_ingreso_op, periodo_rys, segmento, semana_label, semana_trabajo, estado, area_traslado, formador_documento, formador_nombre'),
      supabase.from('descuentos').select('dni_ce, campana, grupo_cap, procede, autoriza_rys, autoriza_cap, fecha_registro, fecha_baja')
    ])
    if (capRes.error) {
      const msg = String(capRes.error.message || '')
      if (msg.includes('formador_nombre') || msg.includes('formador_documento')) {
        const retry = await supabase.from('capacidad_rys').select('codigo, campana, meta_dia_1, rq_solicitado, rq_ftes_solicitado, fecha_registro, fecha_inicio_ojt, fecha_ingreso_op, periodo, periodo_ingreso_op, periodo_rys, segmento, semana_label, semana_trabajo, estado, area_traslado')
        if (retry.error) throw retry.error
        capRes.data = retry.data
      } else {
        throw capRes.error
      }
    }
    if (descRes.error) throw descRes.error
    
    return {
      consolidado: consData || [],
      capacidades: capRes.data || [],
      descuentos: descRes.data || []
    }
  }
  return { consolidado: [], capacidades: [], descuentos: [] }
}

export async function fetchMotivosBajasData(options = {}) {
  if (DB_MODE !== 'supabase') return { consolidado: [], capacidades: [], nominas: [], postulantes: [] };

  return withCache('all_motivos_bajas_v2', 180000, async () => {
    // 1. Helper para traer nóminas completas con paginación
    const fetchAllNominasPaginado = async () => {
      let all = [];
      let from = 0;
      const step = 2000;
      let hasMore = true;
      while (hasMore) {
        let { data, error } = await supabase
          .from('nominas')
          .select('documento, campana, grupo_codigo, fecha_inicio_capacitacion, estado, activo, celular, celular_referencia, nombres, apellido_paterno, apellido_materno, modalidad')
          .range(from, from + step - 1);

        if (error) {
          console.warn('Error fetching nominas con campos completos en fetchMotivosBajasData, intentando select base:', error);
          const fallback = await supabase
            .from('nominas')
            .select('documento, campana, grupo_codigo, fecha_inicio_capacitacion, estado, activo')
            .range(from, from + step - 1);
          if (fallback.data) all = all.concat(fallback.data);
          break;
        }

        if (data && data.length > 0) {
          all = all.concat(data);
          if (data.length < step) hasMore = false;
          else from += step;
        } else {
          hasMore = false;
        }
      }
      return all;
    };

    // 2. Helper para traer postulantes (directorio maestro de contactos y teléfonos)
    const fetchAllPostulantesPaginado = async () => {
      let all = [];
      try {
        let from = 0;
        const step = 2000;
        let hasMore = true;
        while (hasMore) {
          const { data, error } = await supabase
            .from('postulantes')
            .select('documento, celular, celular_referencia, nombres, apellido_paterno, apellido_materno')
            .range(from, from + step - 1);

          if (error) {
            console.warn('Error fetching postulantes en fetchMotivosBajasData:', error);
            break;
          }

          if (data && data.length > 0) {
            all = all.concat(data);
            if (data.length < step) hasMore = false;
            else from += step;
          } else {
            hasMore = false;
          }
        }
      } catch (err) {
        console.warn('Error en fetchAllPostulantesPaginado:', err);
      }
      return all;
    };

    const [consData, capRes, nominasData, postulantesData, descData] = await Promise.all([
      fetchAllConsolidado(options),
      supabase.from('capacidad_rys').select('codigo, campana, meta_dia_1, rq_solicitado, rq_ftes_solicitado, fecha_inicio_ojt, periodo, periodo_ingreso_op, segmento, semana_label, semana_trabajo, estado, modalidad'),
      fetchAllNominasPaginado(),
      fetchAllPostulantesPaginado(),
      fetchAllDescuentosBI()
    ]);

    if (capRes.error) console.warn('Error fetching capacidad_rys in fetchMotivosBajasData:', capRes.error);

    return {
      consolidado: consData || [],
      capacidades: capRes.data || [],
      nominas: nominasData || [],
      postulantes: postulantesData || [],
      descuentos: descData || []
    };
  });
}

export async function fetchAsistenciaPorRango(startDate, endDate) {
  if (DB_MODE !== 'supabase') return []
  const { data, error } = await supabase
    .from('asistencias')
    .select('*')
    .gte('fecha_asistencia', startDate)
    .lte('fecha_asistencia', endDate)
  if (error) throw error
  return data || []
}

export function fetchAllAsistenciasBajas() {
  return withCache('all_asistencias_bajas', 180000, async () => {
    if (DB_MODE !== 'supabase') return []
    
    let allData = [];
    let from = 0;
    const step = 2000;
    let hasMore = true;
    
    while(hasMore) {
      const { data, error } = await supabase
        .from('consolidado_asistencias')
        .select('documento, motivo_baja, fecha_registro_asistencia, campana, codigo_grupo, grupo, nombre_formador, apellido_paterno, apellido_materno, nombres')
        .eq('sigla', 'B')
        .range(from, from + step - 1);
        
      if (error) throw error;
      
      if (data && data.length > 0) {
        allData = allData.concat(data);
        if (data.length < step) hasMore = false;
        else from += step;
      } else {
        hasMore = false;
      }
    }
    
    return allData;
  });
}

// ─────────────────────────────────────────────
// REGISTRO Y CALIBRACIÓN DÍA 1
// ─────────────────────────────────────────────

export async function fetchGruposDia1() {
  if (DB_MODE !== 'supabase') return []
  // We need the codigo, so we join with grupos_capacitacion
  const { data, error } = await supabase
    .from('grupos_dia1')
    .select(`
      fecha_dia1,
      estado_calibracion,
      created_at,
      updated_at,
      grupo_codigo,
      capacidad_rys (
        codigo
      )
    `)
  if (error) throw error
  
  return data.map(row => ({
    ...row,
    grupo_codigo: row.capacidad_rys?.codigo
  })) || []
}

export async function upsertGrupoDia1(grupo_codigo, campana, fecha_dia1) {
  if (DB_MODE !== 'supabase') return
  
  const isoFecha = parseFechaAsistencia(fecha_dia1) || fecha_dia1;
  
  const { data: existing } = await supabase.from('grupos_dia1').select('grupo_codigo').eq('grupo_codigo', grupo_codigo).eq('campana', campana).limit(1).maybeSingle()
  
  if (existing) {
    const { error } = await supabase.from('grupos_dia1').update({
      fecha_dia1: isoFecha,
      estado_calibracion: 'PENDIENTE',
      updated_at: new Date().toISOString()
    }).eq('grupo_codigo', grupo_codigo).eq('campana', campana)
    if (error) throw error
  } else {
    const { error } = await supabase.from('grupos_dia1').insert({
      grupo_codigo,
      campana,
      fecha_dia1: isoFecha,
      estado_calibracion: 'PENDIENTE',
      updated_at: new Date().toISOString()
    })
    if (error) throw error
  }
}

export async function fetchAsistenciasReclutador(grupo_codigo, campana) {
  if (DB_MODE !== 'supabase') return []
  
  const { data, error } = await supabase
    .from('asistencias_dia1_reclutador')
    .select('*')
    .eq('grupo_codigo', grupo_codigo)
    .eq('campana', campana)
  if (error) throw error
  
  // El usuario solicitó explícitamente que "EN LA NÓMINA DE RECLUTAMIENTO SÍ DEBE MOSTRAR TODO TAL CUAL"
  // Por lo tanto, no filtramos los descuentos aquí.
  return data || []
}

export async function saveAsistenciasReclutador(grupo_codigo, campana, registros) {
  if (DB_MODE !== 'supabase') return
  
  // upsert registros
  const bajas = []
  const payload = registros.map(r => {
    const isBaja = r.sigla_inicial === 'F' || r.sigla_final === 'F'
    if (isBaja) bajas.push(r.documento)
    return {
      postulante_documento: r.documento,
      grupo_codigo,
      campana,
      sigla_inicial: r.sigla_inicial,
      sigla_final: r.sigla_final,
      motivo_baja: isBaja ? 'BAJA DIA 1' : null
    }
  })
  
  const { error: delErr } = await supabase.from('asistencias_dia1_reclutador').delete().eq('grupo_codigo', grupo_codigo).eq('campana', campana)
  if (delErr) throw delErr

  const { error } = await supabase.from('asistencias_dia1_reclutador').insert(payload)
  if (error) throw error

  // Actualizar estado en nóminas si hubo bajas (aislado por cohorte)
  if (bajas.length > 0) {
    await scopeNominasCohorte(
      supabase.from('nominas')
        .update({ estado: 'CESADO', activo: false, updated_at: new Date().toISOString() })
        .in('documento', bajas),
      { grupo_codigo, campana }
    )
  }
  
  // Llamar a check calibracion
  try {
    return await checkCalibracionDia1(grupo_codigo, campana)
  } catch(e) {
    console.error('Error al calibrar:', e)
  }
}

export function isAsistioStr(val) {
  if (!val) return false;
  const s = String(val).toUpperCase().trim();
  return s === 'ASISTIO' || s === 'ASISTIÓ' || s === 'A' || s === 'SI' || s === 'PRESENTE' || s === 'AGREGADO' || s === 'RECUPERADO';
}

/** FULL TIME = 1.0 FTE, PART TIME = 0.5 FTE. Toma la primera condición informada. */
export function resolveFteWeight(...sources) {
  for (const raw of sources) {
    const s = String(raw || '').toUpperCase().trim();
    if (!s) continue;
    if (s.includes('PART')) return 0.5;
    return 1.0;
  }
  return 1.0;
}

export function isRecuperoCapCandidate(n) {
  if (!n) return false;
  const tipo = String(n.tipo_reclutado || n.tipo || '').toUpperCase().trim();
  const stD1 = String(n.status_dia_1 || '').toUpperCase().trim();
  const obs = String(n.observacion_estado || n.observacion_dia_1 || n.observacion || '').toUpperCase().trim();
  const estado = String(n.estado || '').toUpperCase().trim();

  // Solo se excluyen alumnos ingresados DIRECTAMENTE por Capacitacion/Formacion en sala
  return tipo.includes('AGREGADO CAP') || 
         tipo.includes('AGREGADO_CAP') || 
         tipo.includes('RECUPERO CAP') || 
         tipo.includes('RECUPERO_CAP') || 
         stD1.includes('AGREGADO CAP') || 
         stD1.includes('AGREGADO_CAP') || 
         stD1.includes('RECUPERO CAP') || 
         stD1.includes('RECUPERO_CAP') || 
         obs.includes('AGREGADO CAP') || 
         obs.includes('RECUPERO CAP') || 
         estado.includes('AGREGADO CAP') ||
         estado.includes('RECUPERO CAP');
}

export function isEspecialExtemporaneo(recCandidate, formRecords = [], formRecord = null) {
  return false;
}

export function isCandidateActiveRec(n) {
  if (!n) return false;
  if (isRecuperoCapCandidate(n)) return false; // RECUPERO CAP no se contabiliza para la cuota de Día 1

  const d1Raw = String(n.dia_1 || '').toUpperCase().trim();
  const d0Raw = String(n.dia_0 || '').toUpperCase().trim();
  const stD1 = String(n.status_dia_1 || '').toUpperCase().trim();
  const tipo = String(n.tipo_reclutado || n.estado || '').toUpperCase().trim();

  // Si está explícitamente marcado como CESE, NO PROCEDE o DESERTOR en Reclutamiento
  if (stD1.includes('CESE') || tipo.includes('CESE') || stD1.includes('NO PROCEDE') || stD1.includes('NO_PROCEDE') || stD1.includes('DESERTO') || stD1.includes('DESERTOR')) {
    return false;
  }

  const asistioD1 = isAsistioStr(d1Raw);
  const faltaD1 = d1Raw === 'FALTA' || d1Raw === 'F' || d1Raw === 'NO';
  const asistioD0 = isAsistioStr(d0Raw);
  const faltaD0 = d0Raw === 'FALTA' || d0Raw === 'F' || d0Raw === 'NO';

  // 1. Si Reclutamiento marcó explícitamente ASISTIO en Día 1 -> Cuenta como activo entregado
  if (asistioD1) return true;

  // 2. Si Reclutamiento marcó explícitamente FALTA en Día 1 -> NO cuenta (aunque haya ido a Día 0)
  if (faltaD1) return false;

  // 3. Si Reclutamiento no ha marcado Día 1 aún (vacío / pendiente / apto), pero asistió a Día 0 -> Cuenta
  if (asistioD0) return true;

  // 4. Si faltó a Día 0 y no tiene asistencia en Día 1 -> NO cuenta
  if (faltaD0) return false;

  return false;
}

export function isFormadorAsistio(sigla) {
  const s = String(sigla || '').toUpperCase().trim();
  return s === 'A' || s === 'I-OP' || s === 'ASISTIO' || s === 'PRESENTE';
}

export async function checkCalibracionDia1(grupo_codigo, campana) {
  if (DB_MODE !== 'supabase') return

  const [fecha_dia1_ref, descSet] = await Promise.all([
    getFirstDateFormador(grupo_codigo, campana),
    fetchDescuentosAprobadosSet(grupo_codigo, campana)
  ]);
  
  let { data: rawRecAsis } = await supabase.from('nominas').select('documento, dia_0, dia_1, estado, status_dia_1, activo').eq('grupo_codigo', grupo_codigo).eq('campana', campana)
  if (!rawRecAsis || rawRecAsis.length === 0) {
    const { data: fb } = await supabase.from('nominas').select('documento, dia_0, dia_1, estado, status_dia_1, activo').eq('grupo_codigo', grupo_codigo)
    if (fb && fb.length > 0) rawRecAsis = fb
  }
  const recAsis = rawRecAsis || []

  let formQuery = supabase.from('consolidado_asistencias')
    .select('documento, fecha_registro_asistencia, sigla, motivo_baja, estado, corte, fecha_hora_registro')
    .eq('codigo_grupo', grupo_codigo)
    .order('created_at', { ascending: true })

  if (campana) {
    formQuery = formQuery.eq('campana', campana)
  }
  let { data: rawFormAsis } = await formQuery

  const normDoc = (val) => String(val || '').trim().replace(/\D/g, '') || String(val || '').trim().toUpperCase();

  const formAsis = (rawFormAsis || []).map(row => {
    let isoDate = parseFechaAsistencia(row.fecha_registro_asistencia);
    return {
      postulante_documento: normDoc(row.documento),
      sigla_asistencia: row.sigla,
      motivo_baja: row.motivo_baja,
      estado: row.estado,
      fecha_asistencia: isoDate,
      corte: row.corte,
      fecha_hora_registro: row.fecha_hora_registro
    }
  }).filter(f => f.fecha_asistencia)

  const formRecordsByDoc = new Map()
  for (const f of formAsis) {
    const doc = normDoc(f.postulante_documento)
    if (!doc) continue;
    if (!formRecordsByDoc.has(doc)) formRecordsByDoc.set(doc, [])
    formRecordsByDoc.get(doc).push(f)
  }

  const mapRec = new Map(recAsis.map(r => [normDoc(r.documento), r]))
  const allDocs = new Set([...formRecordsByDoc.keys(), ...mapRec.keys()])
  allDocs.delete('')

  let isCalibrated = true
  let countRec = 0
  let countForm = 0
  let countBajasC3 = 0
  let countBajasDia1Rys = 0
  for (const doc of allDocs) {
    const studentRecords = formRecordsByDoc.get(doc) || []
    const recCandidate = mapRec.get(doc)
    const d1Records = studentRecords.filter(r => r.fecha_asistencia === fecha_dia1_ref)
    const exactD1Record = d1Records.length > 0 ? d1Records[d1Records.length - 1] : null
    const latestRecord = studentRecords.length > 0 ? studentRecords[studentRecords.length - 1] : null
    const formRecord = exactD1Record || latestRecord

    if (isRecuperoCapCandidate(recCandidate) || isRecuperoCapCandidate(formRecord)) {
      continue
    }

    if (!recCandidate) {
      // Alumno agregado directamente por Capacitación / Formación (no provino de la nómina de Reclutamiento).
      // Regla de Negocio Oficial: No cuenta en la entrega de Día 1 de Reclutamiento ni genera descalibración.
      continue
    }

    // Regla oficial 3 cortes: RyS hasta C2; C3 = formación (no descalibra si hubo A en C1/C2)
    const corteFlags = analyzeDia1CorteRecords(d1Records, exactD1Record)
    const {
      hadAttendanceInEarlierCuts,
      isCorte3Drop,
      isBajaDia1Rys,
      receivedByFormacion,
    } = corteFlags

    if (isCorte3Drop) countBajasC3++
    if (isBajaDia1Rys) countBajasDia1Rys++

    const isCeseRec = recCandidate && String(recCandidate.status_dia_1 || recCandidate.estado || recCandidate.tipo_reclutado || recCandidate.motivo_baja || '').toUpperCase().includes('CESE');
    const isBajaDia1Rec = recCandidate && isBajaDia1Motivo(recCandidate.motivo_baja);
    // Solo no-show RyS (C1/C2 sin A previo) resta de la entrega Formación — NUNCA una baja C3 con A previa
    const isBajaForm = Boolean(
      (isBajaDia1Rys || isBajaDia1Rec || isCeseRec) && !hadAttendanceInEarlierCuts && !isCorte3Drop
    );
    const isBajaDia1Direct = Boolean(isBajaForm || isBajaDia1Rec);

    // Regla Oficial: En Día 1 NO hay Descuentos para la cohorte que inicia (son Bajas Día 1).
    // Y los descuentos NUNCA se heredan de capacitaciones pasadas.
    const isDescuentoDoc = !isBajaDia1Direct && (
      (descSet && (
        descSet.has(doc) ||
        descSet.has(makeDescuentoKey(doc, campana, grupo_codigo)) ||
        descSet.has(`${doc}|${cleanGroupCode(grupo_codigo)}`) ||
        descSet.has(`${doc}|${normalizeGPE(grupo_codigo)}`)
      )) || 
      (String(recCandidate?.estado || '').toUpperCase() === 'DESCUENTO' && !isBajaDia1Direct) ||
      (String(recCandidate?.motivo_baja || '').toUpperCase().includes('DESCUENTO') && !isBajaDia1Direct) ||
      (String(formRecord?.estado || '').toUpperCase() === 'DESCUENTO' && !isBajaDia1Direct) ||
      (String(formRecord?.motivo_baja || '').toUpperCase().includes('DESCUENTO') && !isBajaDia1Direct)
    );

    if (isDescuentoDoc) {
      countRec++;
      countForm++;
      continue;
    }
    
    // Entrega Formación: presencia C1/C2 o registro no-B; baja C3 con A previa SÍ cuenta
    const isFormAsistencia = Boolean(receivedByFormacion || (formRecord && !isBajaForm && !isCorte3Drop));

    const isRecAsistencia = recCandidate ? isCandidateActiveRec(recCandidate) : false;
    
    if (isRecAsistencia) countRec++
    if (isFormAsistencia) countForm++

    if (isFormAsistencia !== isRecAsistencia) {
      isCalibrated = false
    }
  }
  
  let newState = 'PENDIENTE'
  if (!fecha_dia1_ref || (countRec === 0 && countForm === 0)) {
    newState = 'PENDIENTE'
  } else if (countRec > 0 && countForm === 0) {
    // Reclutamiento ya registró nómina pero Formación aún no pasa lista de Día 1
    newState = 'PENDIENTE'
  } else if (countRec > 0 && countForm > 0 && isCalibrated && countRec === countForm) {
    newState = 'CALIBRADO'
  } else if (countRec > 0 && countForm > 0 && (countRec !== countForm || !isCalibrated)) {
    newState = 'DESCALIBRADO'
  } else {
    newState = 'PENDIENTE'
  }

  await supabase.from('grupos_dia1').upsert({
    grupo_codigo,
    campana,
    fecha_dia1: fecha_dia1_ref || new Date().toISOString().split('T')[0],
    estado_calibracion: newState,
    updated_at: new Date().toISOString()
  }, { onConflict: 'campana,grupo_codigo' })
  return newState
}

export async function getCalibracionCounts(grupo_codigo, campana) {
  if (DB_MODE !== 'supabase') return { rec: 0, form: 0 }
  return await getCalibracionCountFast(grupo_codigo, campana)
}

export async function getCalibracionCountFast(grupo_codigo, campana) {
  if (DB_MODE !== 'supabase') return { rec: 0, form: 0 }

  const [fecha_dia1_ref, descSet] = await Promise.all([
    getFirstDateFormador(grupo_codigo, campana),
    fetchDescuentosAprobadosSet(grupo_codigo, campana)
  ]);
  
  let { data: rawRecAsis } = await supabase.from('nominas').select('documento, dia_0, dia_1, estado, status_dia_1, activo').eq('grupo_codigo', grupo_codigo).eq('campana', campana)
  if (!rawRecAsis || rawRecAsis.length === 0) {
    const { data: fb } = await supabase.from('nominas').select('documento, dia_0, dia_1, estado, status_dia_1, activo').eq('grupo_codigo', grupo_codigo)
    if (fb && fb.length > 0) rawRecAsis = fb
  }
  const recAsis = rawRecAsis || []

  let formQuery = supabase.from('consolidado_asistencias')
    .select('documento, fecha_registro_asistencia, sigla, motivo_baja, estado, corte, fecha_hora_registro')
    .eq('codigo_grupo', grupo_codigo)
    .order('created_at', { ascending: true })

  if (campana) {
    formQuery = formQuery.eq('campana', campana)
  }
  let { data: rawFormAsis } = await formQuery

  const normDoc = (val) => String(val || '').trim().replace(/\D/g, '') || String(val || '').trim().toUpperCase();

  const formAsis = (rawFormAsis || []).map(row => {
    let isoDate = parseFechaAsistencia(row.fecha_registro_asistencia);
    return {
      postulante_documento: normDoc(row.documento),
      sigla_asistencia: row.sigla,
      motivo_baja: row.motivo_baja,
      estado: row.estado,
      fecha_asistencia: isoDate,
      corte: row.corte,
      fecha_hora_registro: row.fecha_hora_registro
    }
  }).filter(f => f.fecha_asistencia)

  const formRecordsByDoc = new Map()
  for (const f of formAsis) {
    const doc = normDoc(f.postulante_documento)
    if (!doc) continue;
    if (!formRecordsByDoc.has(doc)) formRecordsByDoc.set(doc, [])
    formRecordsByDoc.get(doc).push(f)
  }

  const mapRec = new Map(recAsis.map(r => [normDoc(r.documento), r]))
  const allDocs = new Set([...formRecordsByDoc.keys(), ...mapRec.keys()])
  allDocs.delete('')

  let countRec = 0
  let countForm = 0
  let bajas_c3 = 0
  let bajas_dia1_rys = 0
  for (const doc of allDocs) {
    const studentRecords = formRecordsByDoc.get(doc) || []
    const recCandidate = mapRec.get(doc)
    const d1Records = studentRecords.filter(r => r.fecha_asistencia === fecha_dia1_ref)
    const exactD1Record = d1Records.length > 0 ? d1Records[d1Records.length - 1] : null
    const latestRecord = studentRecords.length > 0 ? studentRecords[studentRecords.length - 1] : null
    const formRecord = exactD1Record || latestRecord
    
    if (isRecuperoCapCandidate(recCandidate) || isRecuperoCapCandidate(formRecord)) {
      continue
    }

    if (!recCandidate) {
      continue
    }

    const corteFlags = analyzeDia1CorteRecords(d1Records, exactD1Record)
    const { hadAttendanceInEarlierCuts, isCorte3Drop, isBajaDia1Rys, receivedByFormacion } = corteFlags
    if (isCorte3Drop) bajas_c3++
    if (isBajaDia1Rys) bajas_dia1_rys++

    const isCeseRec = recCandidate && String(recCandidate.status_dia_1 || recCandidate.estado || recCandidate.tipo_reclutado || recCandidate.motivo_baja || '').toUpperCase().includes('CESE');
    const isBajaDia1Rec = recCandidate && isBajaDia1Motivo(recCandidate.motivo_baja);
    const isBajaForm = Boolean(
      (isBajaDia1Rys || isBajaDia1Rec || isCeseRec) && !hadAttendanceInEarlierCuts && !isCorte3Drop
    );
    const isBajaDia1Direct = Boolean(isBajaForm || isBajaDia1Rec);

    const isDescuentoDoc = !isBajaDia1Direct && (
      (descSet && (
        descSet.has(doc) ||
        descSet.has(makeDescuentoKey(doc, campana, grupo_codigo)) ||
        descSet.has(`${doc}|${cleanGroupCode(grupo_codigo)}`) ||
        descSet.has(`${doc}|${normalizeGPE(grupo_codigo)}`)
      )) || 
      (String(recCandidate?.estado || '').toUpperCase() === 'DESCUENTO' && !isBajaDia1Direct) ||
      (String(recCandidate?.motivo_baja || '').toUpperCase().includes('DESCUENTO') && !isBajaDia1Direct) ||
      (String(formRecord?.estado || '').toUpperCase() === 'DESCUENTO' && !isBajaDia1Direct) ||
      (String(formRecord?.motivo_baja || '').toUpperCase().includes('DESCUENTO') && !isBajaDia1Direct)
    );

    if (isDescuentoDoc) {
      countRec++;
      countForm++;
      continue;
    }
    
    const isFormAsistencia = Boolean(receivedByFormacion || (formRecord && !isBajaForm && !isCorte3Drop));
    const isRecAsistencia = recCandidate ? isCandidateActiveRec(recCandidate) : false;
    
    if (isRecAsistencia) countRec++
    if (isFormAsistencia) countForm++
  }
  return { rec: countRec, form: countForm, bajas_c3, bajas_dia1_rys }
}

export async function getDetalleCalibracion(grupo_codigo, campana, periodo = null, semana_label = null) {
  if (DB_MODE !== 'supabase') return []

  const [fecha_dia1_ref, descSet] = await Promise.all([
    getFirstDateFormador(grupo_codigo, campana),
    fetchDescuentosAprobadosSet(grupo_codigo, campana)
  ]);

  let recQuery = supabase.from('nominas').select('documento, dia_0, dia_1, estado, status_dia_1, activo, apellido_paterno, apellido_materno, nombres, periodo_reclutado, semana_trabajo, fecha_registro, created_at').eq('grupo_codigo', grupo_codigo).eq('campana', campana)
  if (periodo) {
    recQuery = recQuery.eq('periodo_reclutado', periodo)
  }
  let { data: rawRecAsis } = await recQuery
  if (!rawRecAsis || rawRecAsis.length === 0) {
    let fbQuery = supabase.from('nominas').select('documento, dia_0, dia_1, estado, status_dia_1, activo, apellido_paterno, apellido_materno, nombres, periodo_reclutado, semana_trabajo, fecha_registro, created_at').eq('grupo_codigo', grupo_codigo)
    if (periodo) fbQuery = fbQuery.eq('periodo_reclutado', periodo)
    const { data: fb } = await fbQuery
    if (fb && fb.length > 0) rawRecAsis = fb
  }
  const recAsis = rawRecAsis || [];
  
  let formQuery = supabase.from('consolidado_asistencias')
    .select('documento, fecha_registro_asistencia, sigla, motivo_baja, estado, tipo_reclutado, nombres, apellido_paterno, apellido_materno, corte, fecha_hora_registro')
    .eq('codigo_grupo', grupo_codigo)
    .order('created_at', { ascending: true })

  if (campana) {
    formQuery = formQuery.eq('campana', campana)
  }
  const { data: rawFormAsis } = await formQuery
    
  const normDoc = (val) => String(val || '').trim().replace(/\D/g, '') || String(val || '').trim().toUpperCase();

  const formAsis = (rawFormAsis || []).filter(row => row.fecha_registro_asistencia).map(row => {
    return {
      postulante_documento: normDoc(row.documento),
      sigla_asistencia: row.sigla,
      motivo_baja: row.motivo_baja,
      estado: row.estado,
      nombres: row.nombres,
      apellido_paterno: row.apellido_paterno,
      apellido_materno: row.apellido_materno,
      tipo_reclutado: row.tipo_reclutado,
      fecha_asistencia: parseFechaAsistencia(row.fecha_registro_asistencia),
      corte: row.corte,
      fecha_hora_registro: row.fecha_hora_registro
    }
  })

  if (!recAsis) return []

  const formRecordsByDoc = new Map()
  for (const f of formAsis) {
    const doc = normDoc(f.postulante_documento)
    if (!doc) continue;
    if (!formRecordsByDoc.has(doc)) formRecordsByDoc.set(doc, [])
    formRecordsByDoc.get(doc).push(f)
  }

  const mapRec = new Map()
  recAsis.forEach(r => {
    const doc = normDoc(r.documento)
    if (doc) mapRec.set(doc, r)
  })
  
  const mapNombres = new Map(recAsis.map(p => [normDoc(p.documento), `${p.apellido_paterno || ''} ${p.apellido_materno || ''}, ${p.nombres || ''}`.trim()]))
  
  // Poblar nombres de formador como fallback para alumnos agregados en sala
  for (const f of formAsis) {
    const doc = normDoc(f.postulante_documento)
    if (doc && (!mapNombres.has(doc) || !mapNombres.get(doc))) {
      const nom = `${f.apellido_paterno || ''} ${f.apellido_materno || ''}, ${f.nombres || ''}`.trim()
      if (nom && nom !== ',') {
        mapNombres.set(doc, nom)
      }
    }
  }

  const allDocs = new Set([...formRecordsByDoc.keys(), ...mapRec.keys()])
  allDocs.delete('')
  const discrepancias = []
  
  for (const doc of allDocs) {
    const studentRecords = formRecordsByDoc.get(doc) || []
    const recCandidate = mapRec.get(doc)
    const d1Records = studentRecords.filter(r => r.fecha_asistencia === fecha_dia1_ref)
    const exactD1Record = d1Records.length > 0 ? d1Records[d1Records.length - 1] : null
    const latestRecord = studentRecords.length > 0 ? studentRecords[studentRecords.length - 1] : null
    const formRecord = exactD1Record || latestRecord
    
    if (isRecuperoCapCandidate(recCandidate) || isRecuperoCapCandidate(formRecord)) {
      continue // RECUPERO / AGREGADO CAP no genera discrepancia
    }

    if (!recCandidate) {
      // Alumno agregado directamente por Capacitación / Formación (no provino de la nómina de Reclutamiento).
      // Regla de Negocio: No cuenta en la entrega de Día 1 de Reclutamiento ni genera discrepancia.
      continue
    }

    const corteFlags = analyzeDia1CorteRecords(d1Records, exactD1Record)
    const { hadAttendanceInEarlierCuts, isCorte3Drop, isBajaDia1Rys, receivedByFormacion, d1Sigla } = corteFlags

    const hasLaterAttendance = studentRecords.some(r => {
      if (!fecha_dia1_ref || r.fecha_asistencia <= fecha_dia1_ref) return false;
      const s = String(r.sigla_asistencia || r.sigla || '').toUpperCase().trim();
      return s === 'A' || s === 'I-OP';
    });

    const isBajaDia1Rec = recCandidate && isBajaDia1Motivo(recCandidate.motivo_baja);

    let isBajaForm = false;
    let isFormAsistencia = false;

    if (exactD1Record) {
      if (isBajaDia1Rys && !hasLaterAttendance) {
        // No-show RyS (C1/C2 sin A): no cuenta en entrega Formación
        isFormAsistencia = false;
        isBajaForm = true;
      } else if (isCorte3Drop && !hadAttendanceInEarlierCuts && !hasLaterAttendance) {
        // Solo aparece como B en C3 sin evidencia C1/C2: no entrega (motivo formación, no RyS)
        isFormAsistencia = false;
        isBajaForm = true;
      } else {
        // A/FI/FJ/I-OP, o baja C3 con A previa en C1/C2 → cuenta entrega Formación
        isFormAsistencia = Boolean(receivedByFormacion || hadAttendanceInEarlierCuts || (d1Sigla && d1Sigla !== 'B'));
        isBajaForm = false;
      }
    } else {
      const isCeseRec = recCandidate && String(recCandidate.status_dia_1 || recCandidate.tipo_reclutado || '').toUpperCase().includes('CESE');
      const isBajaRecord = formRecord && (formRecord.sigla_asistencia === 'B' || formRecord.sigla === 'B') && !isCorte3Drop && !hadAttendanceInEarlierCuts;
      isBajaForm = Boolean((isBajaRecord || isBajaDia1Rec || isCeseRec) && !hasLaterAttendance);
      isFormAsistencia = Boolean(formRecord && !isBajaForm);
    }

    const isBajaDia1Direct = Boolean(isBajaForm || isBajaDia1Rec);

    // Regla Oficial: En Día 1 NO hay Descuentos para la cohorte que inicia (son Bajas Día 1).
    // Y los descuentos NUNCA se heredan de capacitaciones pasadas.
    const isDescuentoDoc = !isBajaDia1Direct && (
      (descSet && (
        descSet.has(doc) ||
        descSet.has(makeDescuentoKey(doc, campana, grupo_codigo)) ||
        descSet.has(`${doc}|${cleanGroupCode(grupo_codigo)}`) ||
        descSet.has(`${doc}|${normalizeGPE(grupo_codigo)}`)
      )) || 
      (String(recCandidate?.estado || '').toUpperCase() === 'DESCUENTO' && !isBajaDia1Direct) ||
      (String(recCandidate?.motivo_baja || '').toUpperCase().includes('DESCUENTO') && !isBajaDia1Direct) ||
      (String(formRecord?.estado || '').toUpperCase() === 'DESCUENTO' && !isBajaDia1Direct) ||
      (String(formRecord?.motivo_baja || '').toUpperCase().includes('DESCUENTO') && !isBajaDia1Direct)
    );

    if (isDescuentoDoc) {
      // Descuento acordado y autorizado: no genera discrepancia entre áreas
      continue;
    }

    const isRecAsistencia = recCandidate ? isCandidateActiveRec(recCandidate) : false;
    
    if (isFormAsistencia !== isRecAsistencia) {
      let displayFormSigla = 'SIN REGISTRO';
      if (isBajaForm) {
        displayFormSigla = 'CESADO (BAJA DÍA 1)';
      } else if (exactD1Record || formRecord) {
        const targetRec = exactD1Record || formRecord;
        const fs = String(targetRec.sigla_asistencia || targetRec.sigla || '').toUpperCase().trim();
        if (isFormadorAsistio(fs) || isFormAsistencia) {
          displayFormSigla = 'ACTIVO';
        } else if (fs === 'FI' || fs === 'F' || fs === 'FALTA') {
          displayFormSigla = 'FALTA (FI)';
        } else if (fs === 'FJ') {
          displayFormSigla = 'FALTA (FJ)';
        } else {
          displayFormSigla = fs || 'FALTA';
        }
      }

      let displayRecSigla = 'SIN REGISTRO'
      if (isRecAsistencia) {
        displayRecSigla = 'ASISTIÓ'
      } else if (recCandidate) {
        const d1 = String(recCandidate.dia_1 || '').toUpperCase().trim()
        const d0 = String(recCandidate.dia_0 || '').toUpperCase().trim()
        const stD1 = String(recCandidate.status_dia_1 || '').toUpperCase().trim()
        if (stD1.includes('NO PROCEDE') || stD1.includes('DESERTOR')) {
          displayRecSigla = 'NO PROCEDE'
        } else if (d1 === 'FALTA' || d0 === 'FALTA' || d1 === 'F' || d0 === 'F') {
          displayRecSigla = 'FALTA'
        } else {
          displayRecSigla = recCandidate.estado === 'BAJA' ? 'CESADO' : (recCandidate.dia_1 || recCandidate.estado || 'FALTA')
        }
      }

      discrepancias.push({
        documento: doc,
        nombre: mapNombres.get(doc) || 'Postulante',
        sigla_formador: displayFormSigla,
        sigla_reclutador: displayRecSigla
      })
    }
  }
  
  return discrepancias
}




function parseCSV(text) {
  const result = [];
  let row = [];
  let currentVal = '';
  let inQuotes = false;
  
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];
    
    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        currentVal += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        currentVal += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        row.push(currentVal);
        currentVal = '';
      } else if (char === '\n' || char === '\r') {
        row.push(currentVal);
        if (row.some(v => v !== '')) {
          result.push(row);
        }
        row = [];
        currentVal = '';
        if (char === '\r' && nextChar === '\n') {
          i++;
        }
      } else {
        currentVal += char;
      }
    }
  }
  
  if (currentVal || row.length > 0) {
    row.push(currentVal);
    result.push(row);
  }
  return result;
}

/**
 * Convierte cualquier enlace de Google Sheets (normal del navegador o publicado)
 * en la URL exacta de exportación CSV para la pestaña activa (gid).
 */
export function normalizeGoogleSheetCsvUrl(rawUrl) {
  if (!rawUrl) return ''
  const url = String(rawUrl).trim()

  // 1. Si ya es una URL CSV directa
  if (url.includes('output=csv') || url.includes('format=csv')) return url

  // 2. Si es una URL publicada en la web (.../pubhtml...)
  if (url.includes('/pubhtml')) {
    return url.replace('/pubhtml', '/pub') + (url.includes('?') ? '&output=csv' : '?output=csv')
  }

  // 3. Si es una URL estándar de Google Sheets (/spreadsheets/d/DOC_ID/edit...)
  const docMatch = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9\-_]+)/)
  if (docMatch) {
    const docId = docMatch[1]
    const gidMatch = url.match(/gid=([0-9]+)/)
    const gid = gidMatch ? gidMatch[1] : '0'
    return `https://docs.google.com/spreadsheets/d/${docId}/export?format=csv&gid=${gid}`
  }

  return url
}

/**
 * Lee un libro completo de Google Spreadsheet (todas sus hojas/pestañas) vía XLSX o CSV.
 * Devuelve la lista de nombres de pestañas y el workbook para poder cambiar de hoja al instante.
 */
function decodeGoogleSheetName(str) {
  if (!str) return ''
  try {
    return str
      .replace(/\\x([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
      .replace(/\\u([0-9A-Fa-f]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
      .replace(/\\'/g, "'")
      .replace(/\\"/g, '"')
      .replace(/\\n/g, ' ')
      .replace(/\\t/g, ' ')
      .replace(/\\\\/g, '\\')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&#39;/g, "'")
      .replace(/&quot;/g, '"')
      .trim()
  } catch {
    return str.replace(/\\x20/g, ' ').replace(/\\'/g, "'").trim()
  }
}

export async function fetchGoogleSpreadsheetWorkbookData(rawUrl) {
  const url = String(rawUrl || '').trim()
  console.info('[POOL-PIPELINE] [ETAPA 1: FETCH] URL recibida:', url)
  if (!url) throw new Error('Ingresa un enlace de Google Sheets válido.')

  // ── PRIORIDAD 0: Google Apps Script Web App API (JSON Instantáneo en Vivo) ──
  if (url.includes('script.google.com/macros/s/')) {
    try {
      let finalUrl = url.trim()
      if (!finalUrl.includes('token=')) {
        finalUrl += (finalUrl.includes('?') ? '&' : '?') + 'token=GEA_SECURE_TOKEN_2026_x89aF29mKpL0v'
      }
      console.info('[POOL-PIPELINE] [ETAPA 1: FETCH] Consultando Web App API en vivo:', finalUrl)
      const resp = await fetch(finalUrl, { redirect: 'follow' })
      if (resp.ok) {
        const json = await resp.json()
        if (json.error) throw new Error(json.error)
        if (Array.isArray(json) && json.length > 0) {
          const headers = Object.keys(json[0])
          const matrix = [headers]
          json.forEach(item => {
            matrix.push(headers.map(h => (item[h] !== undefined && item[h] !== null ? item[h] : '')))
          })
          return {
            type: 'webapp_api',
            matrix,
            sheetNames: ['API en Vivo (Formulario)'],
            currentSheet: 'API en Vivo (Formulario)'
          }
        } else if (Array.isArray(json) && json.length === 0) {
          return {
            type: 'webapp_api',
            matrix: [],
            sheetNames: ['API en Vivo (Formulario)'],
            currentSheet: 'API en Vivo (Formulario)'
          }
        }
      }
    } catch (e) {
      console.warn('Error consumiendo Google Apps Script Web App API:', e)
      throw e
    }
  }

  const docMatch = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9\-_]+)/)
  const docId = docMatch ? docMatch[1] : null
  const gidMatch = url.match(/gid=([0-9]+)/)
  const requestedGid = gidMatch ? gidMatch[1] : '0'

  const isPublished = url.includes('/d/e/2PACX-') || url.includes('/pubhtml') || url.includes('/pub')
  console.info('[POOL-PIPELINE] [ETAPA 1: FETCH] docId:', docId, 'requestedGid:', requestedGid, 'isPublished:', isPublished)

  // ── PRIORIDAD 1: Descargar libro completo en formato XLSX (Multi-Hoja Instantáneo) ──
  if (docId && docId !== 'e' && !isPublished) {
    const xlsxUrl = `https://docs.google.com/spreadsheets/d/${docId}/export?format=xlsx`
    try {
      console.info('[POOL-PIPELINE] [ETAPA 1: FETCH] Intentando descargar libro completo XLSX:', xlsxUrl)
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 8000)
      const resp = await fetch(xlsxUrl, { signal: controller.signal })
      clearTimeout(timeoutId)

      if (resp.ok) {
        const buffer = await resp.arrayBuffer()
        console.info('[POOL-PIPELINE] [ETAPA 1: FETCH] XLSX descargado con éxito:', buffer.byteLength, 'bytes')
        const workbook = XLSX.read(buffer, { type: 'array', cellText: true, cellDates: true })
        const sheetNames = workbook.SheetNames || []
        if (sheetNames.length > 0) {
          console.info('[POOL-PIPELINE] [ETAPA 2: PARSEO PESTAÑAS] Pestañas en libro XLSX:', sheetNames)
          return {
            type: 'workbook',
            workbook,
            sheetNames,
            docId
          }
        }
      }
    } catch (e) {
      console.warn('[POOL-PIPELINE] XLSX export fallback (probando pubhtml):', e)
    }
  }

  // ── PRIORIDAD 2: Scraping de pestañas desde /pubhtml o /htmlview ──────────
  const pubUrlsToTry = []
  if (isPublished) {
    pubUrlsToTry.push(url.includes('/pubhtml') ? url : url.replace(/\/pub.*/, '/pubhtml'))
  } else if (docId) {
    pubUrlsToTry.push(`https://docs.google.com/spreadsheets/d/${docId}/pubhtml`)
    pubUrlsToTry.push(`https://docs.google.com/spreadsheets/d/${docId}/htmlview`)
  }

  for (const pubHtmlUrl of pubUrlsToTry) {
    try {
      console.info('[POOL-PIPELINE] [ETAPA 1: FETCH] Intentando descargar pubhtml:', pubHtmlUrl)
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 6000)
      const resp = await fetch(pubHtmlUrl, { signal: controller.signal })
      clearTimeout(timeoutId)

      console.info('[POOL-PIPELINE] [ETAPA 1: FETCH] Status HTTP:', resp.status, resp.statusText)
      if (resp.ok) {
        const html = await resp.text()
        console.info('[POOL-PIPELINE] [ETAPA 1: FETCH] HTML descargado (longitud):', html.length, 'bytes')
        const sheetMap = {}
        const sheetNames = []

        // Intento 2.1: Regex de items.push con nombre completo decodificado
        const regexPush = /items\.push\(\{\s*name:\s*"([^"]+)",[\s\S]*?gid:\s*"([^"]+)"/g
        let match
        while ((match = regexPush.exec(html)) !== null) {
          const rawName = match[1]
          const name = decodeGoogleSheetName(rawName)
          const gid = match[2]
          if (name && gid && !sheetMap[name]) {
            sheetMap[name] = gid
            sheetNames.push(name)
          }
        }

        // Intento 2.2: Regex de botones de hojas <li id="sheet-button-...">
        if (sheetNames.length === 0) {
          const regexButtons = /<li[^>]*id="sheet-button-([^"]+)"[^>]*>[\s\S]*?<a[^>]*>([^<]+)<\/a>/g
          while ((match = regexButtons.exec(html)) !== null) {
            const gid = match[1]
            const name = decodeGoogleSheetName(match[2])
            if (name && gid && !sheetMap[name]) {
              sheetMap[name] = gid
              sheetNames.push(name)
            }
          }
        }

        console.info('[POOL-PIPELINE] [ETAPA 2: PARSEO PESTAÑAS] Pestañas encontradas en pubhtml:', sheetNames, sheetMap)

        if (sheetNames.length > 0) {
          const targetName = (requestedGid && Object.keys(sheetMap).find(k => sheetMap[k] === requestedGid)) || sheetNames[0]
          const targetGid = sheetMap[targetName] || requestedGid || '0'
          console.info('[POOL-PIPELINE] [ETAPA 2: PARSEO PESTAÑAS] Pestaña objetivo inicial:', targetName, 'GID:', targetGid)

          let matrix = []
          try {
            const baseUrl = docId 
              ? `https://docs.google.com/spreadsheets/d/${docId}` 
              : url.replace(/(\/pubhtml|\/pub).*/, '')
            
            // Probar CSV por gviz y luego por pub
            const gvizUrl = docId ? `https://docs.google.com/spreadsheets/d/${docId}/gviz/tq?tqx=out:csv&gid=${targetGid}` : null
            if (gvizUrl) {
              const gvizResp = await fetch(gvizUrl)
              if (gvizResp.ok) {
                const gvizText = await gvizResp.text()
                if (gvizText && !gvizText.includes('<!DOCTYPE html>')) {
                  matrix = parseCSV(gvizText)
                }
              }
            }
            if (matrix.length === 0) {
              const csvUrl = `${baseUrl}/pub?gid=${targetGid}&single=true&output=csv`
              const csvResp = await fetch(csvUrl)
              if (csvResp.ok) {
                const csvText = await csvResp.text()
                matrix = parseCSV(csvText)
              }
            }
          } catch (_) { /* fallback silencioso */ }

          return {
            type: 'published_sheets',
            baseUrl: docId ? `https://docs.google.com/spreadsheets/d/${docId}` : url.replace(/(\/pubhtml|\/pub).*/, ''),
            sheetMap,
            sheetNames,
            matrix,
            currentSheet: targetName,
            docId: docId || 'published_form'
          }
        }
      }
    } catch (e) {
      console.warn('Scraping pubhtml/htmlview fallback:', e)
    }
  }

  // ── PRIORIDAD 3: Google Visualization API CSV ────────────────────────────
  if (docId && docId !== 'e') {
    try {
      const gvizUrl = `https://docs.google.com/spreadsheets/d/${docId}/gviz/tq?tqx=out:csv&gid=${requestedGid}`
      const gvizResp = await fetch(gvizUrl)
      if (gvizResp.ok) {
        const text = await gvizResp.text()
        if (text && text.trim().length > 0 && !text.includes('<!DOCTYPE html>')) {
          const matrix = parseCSV(text)
          return {
            type: 'csv',
            matrix,
            sheetNames: ['Hoja Seleccionada']
          }
        }
      }
    } catch (e) {
      console.warn('GVIZ export fallback:', e)
    }
  }

  // Estrategia 4: Exportación directa CSV
  const csvUrl = normalizeGoogleSheetCsvUrl(url)
  try {
    const response = await fetch(csvUrl)
    if (response.ok) {
      const text = await response.text()
      if (text && !text.includes('<!DOCTYPE html>')) {
        const matrix = parseCSV(text)
        return {
          type: 'csv',
          matrix,
          sheetNames: ['Hoja Principal']
        }
      }
    }
  } catch (e) {
    console.warn('Direct CSV export fallback:', e)
  }

  throw new Error('No se pudo conectar con el documento de Google Sheets. Verifica que el documento tenga permisos de "Cualquier persona con el enlace puede ser lector" en Google Drive o esté publicado en la web (Archivo > Compartir > Publicar en la web).')
}

/**
 * Parsea una matriz de filas (de cualquier hoja de Google Spreadsheet o Excel)
 * mapeando las 68 columnas estándar de GEA y Google Forms.
 */
export async function parseSheetMatrixCandidates(matrix, options = {}) {
  console.info('[POOL-PIPELINE] [ETAPA 3/4: MATRIZ CRUDA] Filas totales en matriz:', matrix?.length || 0)
  if (!matrix || matrix.length < 2) return []

  const { mapGoogleFormHeaders, parseGoogleFormRow } = await import('./nominaConsolidadoSchema.js')

  for (let i = 0; i < Math.min(matrix.length, 15); i++) {
    const headerRow = matrix[i] || []
    if (headerRow.some(c => {
      const str = String(c || '').toUpperCase().trim()
      return str.includes('DNI') || str.includes('DOCUMENTO') || str.includes('NOMBRES') || str.includes('APELLIDO')
    })) {
      const colIdx = mapGoogleFormHeaders(headerRow)
      console.info('[POOL-PIPELINE] [ETAPA 4: MAPEO COLUMNAS] Fila encabezado detectada en índice:', i, 'Columnas mapeadas:', Object.keys(colIdx))
      const rows = []

      for (let j = i + 1; j < matrix.length; j++) {
        const row = matrix[j]
        if (!row || !row.some(c => String(c || '').trim() !== '')) continue

        // 1. Detección precisa de corte por encabezado de tabla secundaria (ej. "HORARIO ESPECIAL")
        const rowCells = row.map(c => String(c || '').toUpperCase().trim()).filter(Boolean)
        const isSecondaryHeader = rowCells.some(cell => 
          cell === 'HORARIO ESPECIAL' || 
          cell.startsWith('HORARIO ESPECIAL') || 
          cell === 'HORARIOS ESPECIALES' ||
          cell === 'SOLICITUDES DE HORARIO'
        )
        // Si es título de tabla secundaria y no tiene datos de postulante, cortar
        const hasDocInRow = rowCells.some(cell => {
          const c = cell.replace(/^['"`’‘“”\s]+|['"`’‘“”\s]+$/g, '')
          return /^\d{6,15}$/.test(c)
        })
        if (isSecondaryHeader && !hasDocInRow) {
          console.info('[POOL-PIPELINE] [ETAPA 4: SALTO] Saltando fila de tabla secundaria en índice:', j)
          continue
        }

        const parsed = parseGoogleFormRow(row, colIdx)
        if (parsed && parsed.documento) {
          // Filtrado y optimización: solo traer registros desde el 01/07/2026 en adelante
          if (options.limitLast2Months !== false) {
            // Fecha de corte solicitada: 01 de Julio de 2026 (mes 6 en JS 0-indexado)
            const cutoffTime = options.startDateCutoff 
              ? new Date(options.startDateCutoff).getTime() 
              : new Date(2026, 6, 1, 0, 0, 0).getTime()

            let isRecent = false
            if (parsed.marca_temporal) {
              const dt = new Date(parsed.marca_temporal)
              if (!isNaN(dt.getTime())) {
                if (dt.getTime() >= cutoffTime) {
                  isRecent = true
                }
              }
            } else if (parsed.periodo_reclutado) {
              const pStr = String(parsed.periodo_reclutado).replace(/\D/g, '')
              if (pStr.length >= 6) {
                const pNum = parseInt(pStr.substring(0, 6), 10)
                // 202607 = Julio 2026
                if (!isNaN(pNum) && pNum >= 202607) {
                  isRecent = true
                }
              }
            } else {
              // Si no tiene fecha explícita, se mantiene
              isRecent = true
            }

            if (!isRecent) {
              continue
            }
          }

          rows.push(parsed)
        }
      }

      // Ordenar los postulantes de los más recientes a los más antiguos
      rows.sort((a, b) => {
        const dateA = a.marca_temporal ? new Date(a.marca_temporal).getTime() : 0
        const dateB = b.marca_temporal ? new Date(b.marca_temporal).getTime() : 0
        return dateB - dateA
      })

      console.info('[POOL-PIPELINE] [ETAPA 5: RESULTADO PARSEO] Total postulantes válidos extraídos de la hoja:', rows.length)
      return rows
    }
  }
  console.warn('[POOL-PIPELINE] [ETAPA 4: MAPEO COLUMNAS] No se encontró ninguna fila de encabezado reconocible en las primeras 15 filas.')
  return []
}

export async function fetchGoogleFormsPool(url, sheetName = null) {
  try {
    const wbData = await fetchGoogleSpreadsheetWorkbookData(url)
    if (wbData.type === 'workbook') {
      const targetSheet = sheetName && wbData.sheetNames.includes(sheetName)
        ? sheetName 
        : wbData.sheetNames[0]
      const worksheet = wbData.workbook.Sheets[targetSheet]
      const matrix = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false, defval: '' })
      return await parseSheetMatrixCandidates(matrix)
    }
    return await parseSheetMatrixCandidates(wbData.matrix)
  } catch (err) {
    console.error('fetchGoogleFormsPool error:', err)
    throw err
  }
}

// ── DESCUENTOS API ──────────────────────────────────────────────────────────

/**
 * Sincroniza en consolidado_asistencias que el estado, sigla y motivo_baja sean 'DESCUENTO'
 * para que en la base de datos oficial y en el Control de Asistencia figure con estado DESCUENTO
 * (y nunca como 'CESADO').
 */
export async function syncApprovedDescuentosToConsolidado(items = []) {
  if (DB_MODE !== 'supabase' || !items || items.length === 0) return;
  try {
    for (const item of items) {
      const dni = typeof item === 'object' ? String(item.dni_ce || item.dni || '').trim() : String(item || '').trim();
      const grupo = typeof item === 'object' ? String(item.grupo_cap || item.grupo || '').trim() : null;
      if (!dni) continue;

      let query = supabase
        .from('consolidado_asistencias')
        .update({
          estado: 'DESCUENTO',
          sigla: 'DESC',
          motivo_baja: 'DESCUENTO'
        })
        .eq('documento', dni)
        .or('estado.eq.CESADO,sigla.eq.B,motivo_baja.ilike.%BAJA%');

      // REGLA ESTRICTA: El descuento SOLO impacta en el grupo específico donde fue solicitado
      if (grupo) {
        query = query.eq('codigo_grupo', grupo);
      }

      await query;
    }

    invalidateCache('all_consolidado');
    invalidateCache('all_consolidado_recent');
    invalidateCache('all_consolidado_full');
    invalidateCache('all_asistencias_bajas');
    invalidateCache('all_motivos_bajas');
  } catch (err) {
    console.warn('Aviso sincronizando estado DESCUENTO en consolidado_asistencias:', err);
  }
}

/**
 * Revisa descuentos pendientes y aprueba automáticamente aquellos que excedan
 * las 48 horas hábiles (excluyendo domingos y feriados nacionales de Perú).
 */
export async function autoApproveExpiredDescuentos() {
  if (DB_MODE !== 'supabase') return { approved: 0 };
  try {
    const { data, error } = await supabase
      .from('descuentos')
      .select('id, dni_ce, fecha_registro, fecha_baja, procede, autoriza_rys')
      .or('procede.eq.PENDIENTE,procede.is.null,autoriza_rys.eq.PENDIENTE,autoriza_rys.is.null');

    if (error || !data || data.length === 0) return { approved: 0 };

    const now = new Date();
    const expiredIds = [];
    const expiredItems = [];

    for (const row of data) {
      if (row.procede === 'NO PROCEDE' || row.autoriza_rys === 'NO') continue;
      // El plazo de 48h hábiles de respuesta corre desde fecha_registro (momento en que Capas envió)
      const regTime = row.fecha_registro || row.created_at;
      if (isDescuentoVencido48h(regTime, now)) {
        expiredIds.push(row.id);
        if (row.dni_ce) expiredItems.push({ dni_ce: row.dni_ce, grupo_cap: row.grupo_cap });
      }
    }

    if (expiredIds.length > 0) {
      const { error: updErr } = await supabase
        .from('descuentos')
        .update({
          autoriza_rys: 'SI',
          autoriza_cap: 'SI',
          comentario_rys: 'descuento aprobado por tiempo de respuesta',
          procede: 'PROCEDE',
          fuera_de_plazo: 'SI'
        })
        .in('id', expiredIds);

      if (updErr) {
        console.warn('Error al auto-aprobar descuentos por 48h hábiles:', updErr);
      } else {
        if (expiredItems.length > 0) {
          syncApprovedDescuentosToConsolidado(expiredItems).catch(() => {});
        }
        invalidateCache('descuentos_set_global');
        invalidateCache('all_descuentos_bi');
        invalidateCache('mis_descuentos_user');
      }
      return { approved: expiredIds.length, expiredIds };
    }
  } catch (err) {
    console.error('Error en autoApproveExpiredDescuentos:', err);
  }
  return { approved: 0 };
}

/**
 * Obtiene un Set con los documentos (DNI) de postulantes con descuentos aprobados
 * (o vencidos > 48h hábiles en Perú) para un grupo o de forma global.
 * Estos postulantes NO deben aparecer en la asistencia del formador.
 */
export async function fetchDescuentosAprobadosSet(grupoCodigo = null, campana = null) {
  if (DB_MODE !== 'supabase') return new Set();

  // 1. Ejecutar auto-aprobación en segundo plano por si hay pendientes vencidos
  try {
    await autoApproveExpiredDescuentos();
  } catch (e) {
    // Non-blocking
  }

  try {
    let query = supabase
      .from('descuentos')
      .select('dni_ce, campana, grupo_cap, procede, autoriza_rys, fecha_registro, fecha_baja');

    const cleanGrupo = grupoCodigo ? String(grupoCodigo).trim().toUpperCase() : null;
    if (cleanGrupo) {
      query = query.ilike('grupo_cap', `%${cleanGrupo}%`);
    }

    const { data, error } = await query;
    if (error) {
      console.warn('Error en fetchDescuentosAprobadosSet:', error);
      return new Set();
    }

    const normCamp = campana ? normalizeCampana(campana) : null;
    const cleanGpe = cleanGrupo ? normalizeGPE(cleanGrupo) : null;

    const setAprobados = new Set();
    (data || []).forEach(d => {
      if (cleanGrupo) {
        const rowGrupo = String(d.grupo_cap || '').trim().toUpperCase();
        const rowGpe = normalizeGPE(d.grupo_cap);
        const matchGrupo = (rowGrupo && (rowGrupo === cleanGrupo || rowGrupo.includes(cleanGrupo) || cleanGrupo.includes(rowGrupo))) ||
                           (cleanGpe && rowGpe && (rowGpe === cleanGpe || rowGpe.includes(cleanGpe) || cleanGpe.includes(rowGpe)));
        if (!matchGrupo) {
          return;
        }
      }

      if (normCamp) {
        const rowCamp = normalizeCampana(d.campana);
        if (rowCamp && normCamp !== rowCamp && !rowCamp.includes(normCamp) && !normCamp.includes(rowCamp)) {
          return;
        }
      }

      const procedeStr = String(d.procede || '').trim().toUpperCase();
      const rysStr = String(d.autoriza_rys || '').trim().toUpperCase();
      
      // REGLA OFICIAL: Debe seguir apareciendo en asistencia hasta que el Jefe de RyS lo apruebe
      const isAprobadoRyS = rysStr === 'SI' || procedeStr === 'PROCEDE' || procedeStr === 'APROBADO';
      const regTime = d.fecha_registro || d.created_at || d.fecha_baja;
      const isVencido = regTime && isDescuentoVencido48h(regTime) && procedeStr !== 'NO' && procedeStr !== 'NO PROCEDE' && rysStr !== 'NO';

      // Si está PENDIENTE y dentro de plazo, o si fue rechazado por RyS, DEBE SEGUIR APARECIENDO en asistencia
      if (!isAprobadoRyS && !isVencido) {
        return;
      }

      const dni = String(d.dni_ce || '').trim();
      if (dni) {
        setAprobados.add(dni);
        setAprobados.add(dni.toLowerCase());
        setAprobados.add(dni.toUpperCase());
        setAprobados.add(`DNI:${dni}`);
        if (d.grupo_cap) {
          setAprobados.add(`${dni}|${normalizeGPE(d.grupo_cap)}`);
          setAprobados.add(`${dni}|${cleanGroupCode(d.grupo_cap)}`);
        }
        if (d.campana && d.grupo_cap) {
          setAprobados.add(makeDescuentoKey(dni, d.campana, d.grupo_cap));
        }
      }
    });

    return setAprobados;
  } catch (err) {
    console.error('Error al obtener descuentos aprobados:', err);
    return new Set();
  }
}

export async function fetchDescuentosPendientes() {
  if (DB_MODE !== 'supabase') return [];
  
  // Ejecutar auto-aprobación de registros fuera del plazo de 48h hábiles
  try {
    await autoApproveExpiredDescuentos();
  } catch (e) {
    console.warn('Error en auto-aprobación previa:', e);
  }

  const { data, error } = await supabase
    .from('descuentos')
    .select('*')
    .eq('procede', 'PENDIENTE')
    .order('fecha_registro', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function fetchHomologadas() {
  if (DB_MODE !== 'supabase') return [];
  return withCache('homologadas_list', 600000, async () => {
    const { data, error } = await supabase
      .from('opciones_homologadas')
      .select('*');
    if (error) {
      console.error("Error fetching homologadas:", error);
      return [];
    }
    return data || [];
  });
}

export async function fetchDescuentosHistorial() {
  if (DB_MODE !== 'supabase') return [];
  const { data, error } = await supabase
    .from('descuentos')
    .select('*')
    .neq('procede', 'PENDIENTE')
    .order('fecha_registro', { ascending: false })
    .limit(1000);
  if (error) throw error;
  return data || [];
}

export function fetchAllDescuentosBI() {
  return withCache('all_descuentos_bi', 180000, async () => {
    if (DB_MODE !== 'supabase') return [];
    
    // Auto-aprobar vencidos antes de cargar métricas
    try {
      await autoApproveExpiredDescuentos();
    } catch (e) {
      // Non-blocking
    }
    
    let allData = [];
    let from = 0;
    const step = 2000;
    let page = 0;
    const MAX_PAGES = 50;
    
    while (page++ < MAX_PAGES) {
      const { data, error } = await supabase
        .from('descuentos')
        .select('*')
        .order('fecha_registro', { ascending: false })
        .range(from, from + step - 1);
        
      if (error) throw error;
      if (!data || data.length === 0) break;
      
      allData = allData.concat(data);
      if (data.length < step) break;
      
      from += step;
    }
    
    return allData.map(d => {
      // El reloj de auto-aprobación por tiempo de respuesta de Tania corre sobre fecha_registro
      const regTime = d.fecha_registro || d.created_at;
      const isExpired = isDescuentoVencido48h(regTime);
      if (isExpired && d.procede === 'PENDIENTE' && d.autoriza_rys !== 'NO') {
        return {
          ...d,
          procede: 'PROCEDE',
          autoriza_rys: 'SI',
          fuera_de_plazo: 'SI',
          comentario_rys: d.comentario_rys || 'descuento aprobado por tiempo de respuesta'
        };
      }
      return d;
    });
  });
}

export async function insertDescuentosBulk(payloads, userEmail) {
  if (DB_MODE !== 'supabase') throw new Error("Requires Supabase");
  if (!payloads || payloads.length === 0) return { inserted: 0 };

  const batch = payloads.map(p => {
    const fb = p.fecha_baja;
    const isBajaExcedida48h = isDescuentoVencido48h(fb);
    
    // REGLA OFICIAL DE NEGOCIO (Capacitación vs Tania):
    // 1. Si Capacitación/Supervisor se excede de las 48h hábiles desde la fecha de baja -> NO PROCEDE
    // 2. Si está dentro del plazo -> Ingresa como PENDIENTE para revisión de RyS (Tania tiene 48h hábiles para responder).
    const procedeVal = isBajaExcedida48h ? 'NO PROCEDE' : 'PENDIENTE';
    const autorizaCapVal = isBajaExcedida48h ? 'NO' : 'SI';
    const autorizaRysVal = isBajaExcedida48h ? 'NO' : '';
    const fueraDePlazoVal = isBajaExcedida48h ? 'SI' : 'NO';
    const comentarioRysVal = isBajaExcedida48h 
      ? 'NO PROCEDE: Solicitud extemporánea (Capacitación excedió el plazo de 48h hábiles desde la baja)' 
      : (p.comentario_rys || '');

    return {
      sede: p.sede || '',
      segmento: p.segmento || '',
      grupo_cap: p.grupo_cap || '',
      campana: p.campana || '',
      supervisor: p.supervisor || '',
      formador: p.formador || '',
      dni_ce: p.dni_ce || '',
      postulante: p.postulante || '',
      fecha_baja: p.fecha_baja || null,
      motivo: p.motivo || '',
      comentarios: p.comentarios || '',
      bono: 'NO',
      autoriza_cap: autorizaCapVal,
      fuera_de_plazo: fueraDePlazoVal,
      autoriza_rys: autorizaRysVal,
      comentario_rys: comentarioRysVal,
      procede: procedeVal,
      usuario_registro: userEmail || 'admin',
      fecha_registro: p.fecha_registro || new Date().toISOString()
    };
  });

  const { data, error } = await supabase.from('descuentos').insert(batch);
  if (error) throw error;
  
  batch.forEach(row => {
    mockAuditLog('descuentos', 'INSERT_BULK', row.dni_ce, null, row);
  });
  
  invalidateCache('descuentos_set_global');
  invalidateCache('mis_descuentos_user');
  return { inserted: batch.length, batch };
}

export async function fetchMisDescuentos(userEmail = null, isAdmin = false) {
  if (DB_MODE !== 'supabase') return [];
  
  try {
    let query = supabase
      .from('descuentos')
      .select('*')
      .order('fecha_registro', { ascending: false })
      .limit(500);

    if (!isAdmin && userEmail) {
      query = query.eq('usuario_registro', userEmail);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.warn("Error en fetchMisDescuentos, intentando fallback:", err);
    // Fallback: ordenar por ID descendente
    try {
      const { data: fbData, error: fbErr } = await supabase
        .from('descuentos')
        .select('*')
        .order('id', { ascending: false })
        .limit(500);
      if (fbErr) throw fbErr;
      if (!isAdmin && userEmail) {
        return (fbData || []).filter(d => String(d.usuario_registro || '').toLowerCase() === String(userEmail).toLowerCase());
      }
      return fbData || [];
    } catch (e) {
      console.error("Error definitivo en fetchMisDescuentos:", e);
      return [];
    }
  }
}

export async function updateDescuentosAutorizacionBulk(ids, estado, comentario) {
  if (DB_MODE !== 'supabase') throw new Error("Requires Supabase");
  if (!ids || ids.length === 0) return { updated: 0 };
  
  const { data, error } = await supabase
    .from('descuentos')
    .update({ 
      autoriza_cap: estado, 
      autoriza_rys: estado, 
      comentario_rys: comentario || '',
      procede: estado === 'SI' ? 'PROCEDE' : 'NO PROCEDE',
      usuario_autoriza: (await supabase.auth.getSession()).data?.session?.user?.email || 'admin',
      fecha_autorizacion: new Date().toISOString()
    })
    .in('id', ids)
    .select();
    
  if (error) throw error;
  
  if (estado === 'SI' && data && data.length > 0) {
    const items = data.map(r => ({ dni_ce: r.dni_ce, grupo_cap: r.grupo_cap })).filter(r => r.dni_ce);
    if (items.length > 0) {
      syncApprovedDescuentosToConsolidado(items).catch(() => {});
    }
  }

  (data || []).forEach(row => {
    mockAuditLog('descuentos', 'AUTORIZAR_RYS', row.id, null, { estado, comentario });
  });

  invalidateCache('descuentos_set_global');
  invalidateCache('all_descuentos_bi');
  invalidateCache('mis_descuentos_user');
  return { updated: (data || []).length };
}

export async function updateDescuentosIndividuales(updatesArray) {
  if (DB_MODE !== 'supabase') throw new Error("Requires Supabase");
  if (!updatesArray || updatesArray.length === 0) return { updated: 0 };
  
  // Supabase no soporta un UPDATE masivo con diferentes valores por fila en una sola query REST.
  // Debemos ejecutar una query de update para cada fila, o usar un RPC.
  // Dado que normalmente son pocos registros a la vez, lo haremos de forma iterativa.
  
  let successCount = 0;
  for (const update of updatesArray) {
    if (update.estado === undefined) continue; // Skip if no estado provided
    
    // Calcular el Procede según la resolución de Tania
    let procedeStr = 'PENDIENTE';
    const autRys = update.estado || '';
    
    if (autRys === 'SI') {
      procedeStr = 'PROCEDE';
    } else if (autRys === 'NO') {
      procedeStr = 'NO PROCEDE';
    } else {
      procedeStr = 'PENDIENTE';
    }
    
    const { error: updErr } = await supabase
      .from('descuentos')
      .update({ 
        autoriza_rys: update.estado, 
        comentario_rys: update.comentario || '',
        procede: procedeStr,
        usuario_autoriza: (await supabase.auth.getSession()).data?.session?.user?.email || 'admin',
        fecha_autorizacion: new Date().toISOString()
      })
      .eq('id', update.id);
      
    if (!updErr) {
      successCount++;
      if (procedeStr === 'PROCEDE' && update.dni_ce) {
        syncApprovedDescuentosToConsolidado([{ dni_ce: update.dni_ce, grupo_cap: update.grupo_cap }]).catch(() => {});
      }
      mockAuditLog('descuentos', 'AUTORIZAR_RYS_INDIVIDUAL', update.id, null, { estado: update.estado, comentario: update.comentario, procede: procedeStr });
    }
  }

  invalidateCache('descuentos_set_global');
  invalidateCache('all_descuentos_bi');
  invalidateCache('mis_descuentos_user');
  return { updated: successCount };
}

// ───────────────────────────────────────────────────────────────────────
// GESTIÓN DINÁMICA DE DASHBOARDS LINKS
// ───────────────────────────────────────────────────────────────────────

export async function fetchDashboardsLinks() {
  if (DB_MODE === 'supabase') {
    const { data, error } = await supabase
      .from('dashboards_links')
      .select('*')
      .order('created_at', { ascending: true });
    
    if (error) {
      if (error.code === '42P01') {
        // Table doesn't exist yet, return empty
        return [];
      }
      throw error;
    }
    return data || [];
  }
  
  // Local storage fallback
  initLocalStorageDb();
  return getFromStorage('dashboards_links') || [];
}

export async function saveDashboardLink(payload) {
  if (DB_MODE === 'supabase') {
    const isNew = !payload.id;
    
    // Convert roles array to jsonb format for Supabase if needed, though supabase-js handles arrays automatically for jsonb columns
    const dataToSave = {
      nombre: payload.nombre,
      url: payload.url,
      roles: payload.roles || []
    };
    
    if (isNew) {
      const { data, error } = await supabase
        .from('dashboards_links')
        .insert([dataToSave])
        .select()
        .single();
      if (error) throw error;
      return data;
    } else {
      const { data, error } = await supabase
        .from('dashboards_links')
        .update(dataToSave)
        .eq('id', payload.id)
        .select()
        .single();
      if (error) throw error;
      return data;
    }
  }
  
  // Local storage fallback
  initLocalStorageDb();
  const links = getFromStorage('dashboards_links') || [];
  
  if (payload.id) {
    const idx = links.findIndex(l => l.id === payload.id);
    if (idx >= 0) {
      links[idx] = { ...links[idx], ...payload };
      saveToStorage('dashboards_links', links);
      return links[idx];
    }
  } else {
    const newLink = { ...payload, id: 'dl-' + Date.now(), created_at: new Date().toISOString() };
    links.push(newLink);
    saveToStorage('dashboards_links', links);
    return newLink;
  }
}

// ───────────────────────────────────────────────────────────────────────
// PROPUESTAS Y CONSOLIDADO DE PAGOS
// ───────────────────────────────────────────────────────────────────────

export async function fetchPropuestasConsolidado() {
  if (DB_MODE === 'supabase') {
    const { data, error } = await supabase
      .from('propuestas_consolidado')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error("Error al obtener propuestas_consolidado de Supabase:", error);
      throw error;
    }
    return (data || []).map(row => ({
      ...row,
      fechaInicioCapa: formatFechaDDMMYYYY(row.fechaInicioCapa || ''),
      ingresoOperacion: formatFechaDDMMYYYY(row.ingresoOperacion || ''),
    }));
  }
  
  initLocalStorageDb();
  const local = getFromStorage('propuestas_consolidado') || [];
  return local.map(row => ({
    ...row,
    fechaInicioCapa: formatFechaDDMMYYYY(row.fechaInicioCapa || ''),
    ingresoOperacion: formatFechaDDMMYYYY(row.ingresoOperacion || ''),
  }));
}

export async function fetchPropuestaById(propuestaId) {
  if (!propuestaId) return null;
  if (DB_MODE === 'supabase') {
    const { data, error } = await supabase
      .from('propuestas')
      .select('*')
      .eq('id', propuestaId)
      .maybeSingle();
    if (error) {
      console.warn("Error buscando propuesta por id:", error);
      return null;
    }
    if (!data) return null;
    return {
      ...data,
      inicio: formatFechaDDMMYYYY(data.inicio || ''),
      fin: formatFechaDDMMYYYY(data.fin || ''),
      ojt: formatFechaDDMMYYYY(data.ojt || ''),
      ingresoOperacion: formatFechaDDMMYYYY(data.ingresoOperacion || ''),
    };
  }
  initLocalStorageDb();
  const props = getFromStorage('propuestas') || [];
  const found = props.find(p => p.id === propuestaId);
  if (!found) return null;
  return {
    ...found,
    inicio: formatFechaDDMMYYYY(found.inicio || ''),
    fin: formatFechaDDMMYYYY(found.fin || ''),
    ojt: formatFechaDDMMYYYY(found.ojt || ''),
    ingresoOperacion: formatFechaDDMMYYYY(found.ingresoOperacion || ''),
  };
}

export async function fetchPropuestaByGrupo(grupoCodigo, campana, periodo, segmento) {
  if (!grupoCodigo) return null;
  const grp = String(grupoCodigo).trim().toUpperCase();
  const cmp = String(campana || '').trim().toUpperCase();
  const per = String(periodo || '').trim().toUpperCase();
  const seg = String(segmento || '').trim().toUpperCase();

  if (DB_MODE === 'supabase') {
    try {
      // 1. Intentar buscar en propuestas
      let query = supabase.from('propuestas').select('*').ilike('grupo', grp);
      if (cmp) query = query.ilike('campana', cmp);
      if (per) query = query.ilike('periodoCapa', per);
      if (seg) query = query.ilike('segmento', seg);
      const { data: propRows } = await query.order('created_at', { ascending: false }).limit(1);
      if (propRows && propRows.length > 0) {
        const row = propRows[0];
        return {
          ...row,
          inicio: formatFechaDDMMYYYY(row.inicio || ''),
          fin: formatFechaDDMMYYYY(row.fin || ''),
          ojt: formatFechaDDMMYYYY(row.ojt || ''),
          ingresoOperacion: formatFechaDDMMYYYY(row.ingresoOperacion || ''),
        };
      }

      // 2. Si no está en propuestas completas, buscar si existe consolidado
      let qCons = supabase.from('propuestas_consolidado').select('*').ilike('grupo', grp);
      if (cmp) qCons = qCons.ilike('campana', cmp);
      if (per) qCons = qCons.ilike('periodoCapa', per);
      if (seg) qCons = qCons.ilike('segmento', seg);
      const { data: consRows } = await qCons.order('created_at', { ascending: false }).limit(1);
      if (consRows && consRows.length > 0) {
        const c = consRows[0];
        if (c.propuesta_id) {
          const full = await fetchPropuestaById(c.propuesta_id);
          if (full) return full;
        }
        return {
          ...c,
          inicio: formatFechaDDMMYYYY(c.fechaInicioCapa || c.inicio || ''),
          fin: formatFechaDDMMYYYY(c.fin || ''),
          ojt: formatFechaDDMMYYYY(c.ojt || ''),
          ingresoOperacion: formatFechaDDMMYYYY(c.ingresoOperacion || ''),
        };
      }
    } catch (err) {
      console.warn("Error buscando propuesta por grupo en Supabase:", err);
    }
  }

  initLocalStorageDb();
  const props = getFromStorage('propuestas') || [];
  const found = props.find(p => 
    String(p.grupo || '').toUpperCase() === grp &&
    (!cmp || String(p.campana || '').toUpperCase() === cmp) &&
    (!per || String(p.periodoCapa || '').toUpperCase() === per) &&
    (!seg || String(p.segmento || '').toUpperCase() === seg)
  );
  if (!found) return null;
  return {
    ...found,
    inicio: formatFechaDDMMYYYY(found.inicio || ''),
    fin: formatFechaDDMMYYYY(found.fin || ''),
    ojt: formatFechaDDMMYYYY(found.ojt || ''),
    ingresoOperacion: formatFechaDDMMYYYY(found.ingresoOperacion || ''),
  };
}

export async function savePropuesta(payloadForm, payloadConsolidado) {
  // 1. Sanitizar payloadForm para evitar errores 22P02 de Postgres en columnas numéricas
  const sanitizedForm = {
    titulo: String(payloadForm.titulo || '').trim(),
    horario: String(payloadForm.horario || '').trim(),
    fullTime: String(payloadForm.fullTime || '').trim(),
    basico: String(payloadForm.basico || '').trim(),
    bonoMovilidad: String(payloadForm.bonoMovilidad || '').trim(),
    variable: String(payloadForm.variable || '').trim(),

    bBienvenidaM1: Number(payloadForm.bBienvenidaM1) || 0,
    bBienvenidaM2: Number(payloadForm.bBienvenidaM2) || 0,
    bBienvenidaM3: Number(payloadForm.bBienvenidaM3) || 0,
    bBienvenidaObs: String(payloadForm.bBienvenidaObs || '').trim(),

    bPermM1: Number(payloadForm.bPermM1) || 0,
    bPermM2: Number(payloadForm.bPermM2) || 0,
    bPermM3: Number(payloadForm.bPermM3) || 0,
    bPermM4: Number(payloadForm.bPermM4) || 0,
    bPermObs: String(payloadForm.bPermObs || '').trim(),

    bAsisM1: Number(payloadForm.bAsisM1) || 0,
    bAsisM2: Number(payloadForm.bAsisM2) || 0,
    bAsisM3: Number(payloadForm.bAsisM3) || 0,
    bAsisObs: String(payloadForm.bAsisObs || '').trim(),

    pagoCapaTotal: Number(payloadForm.pagoCapaTotal) || 0,
    pagoCapaPorDia: Number(payloadForm.pagoCapaPorDia) || 0,
    diasCapa: Number(payloadForm.diasCapa) || 0,
    capacitacionObs: String(payloadForm.capacitacionObs || '').trim(),
    horarioCapacitacion: String(payloadForm.horarioCapacitacion || '').trim(),
    inicio: formatFechaDDMMYYYY(payloadForm.inicio || ''),
    fin: formatFechaDDMMYYYY(payloadForm.fin || ''),
    ojt: formatFechaDDMMYYYY(payloadForm.ojt || ''),
    ingresoOperacion: formatFechaDDMMYYYY(payloadForm.ingresoOperacion || ''),

    quincena1: String(payloadForm.quincena1 || '').trim(),
    finMes1: String(payloadForm.finMes1 || '').trim(),
    finMes2: String(payloadForm.finMes2 || '').trim(),

    obs1: String(payloadForm.obs1 || '').trim(),
    obs2: String(payloadForm.obs2 || '').trim(),
    obs3: String(payloadForm.obs3 || '').trim(),

    periodoCapa: String(payloadForm.periodoCapa || '').trim().toUpperCase(),
    semana: String(payloadForm.semana || '').trim().toUpperCase(),
    segmento: String(payloadForm.segmento || '').trim().toUpperCase(),
    cod: String(payloadForm.cod || '').trim().toUpperCase(),
    cantDiasFeriados: Number(payloadForm.cantDiasFeriados) || 0,
    mesAfectacionCapa: String(payloadForm.mesAfectacionCapa || '').trim(),
    mesAfectacionBonos: String(payloadForm.mesAfectacionBonos || '').trim(),
    modalidad: String(payloadForm.modalidad || 'Remoto').trim(),
    condicionLaboral: String(payloadForm.condicionLaboral || 'Planilla Completa').trim(),
    campana: String(payloadForm.campana || '').trim().toUpperCase(),
    grupo: String(payloadForm.grupo || '').trim().toUpperCase(),
  };

  if (payloadForm.id && String(payloadForm.id).length > 20) {
    sanitizedForm.id = payloadForm.id;
  }

  // Auto-calcular pagoCapaTotal si no se especificó
  if (!sanitizedForm.pagoCapaTotal && sanitizedForm.pagoCapaPorDia && sanitizedForm.diasCapa) {
    sanitizedForm.pagoCapaTotal = sanitizedForm.pagoCapaPorDia * sanitizedForm.diasCapa;
  }

  if (DB_MODE === 'supabase') {
    let propId = sanitizedForm.id;
    let savedForm;

    // 1. Guardar en 'propuestas'
    if (!propId) {
      // Buscar si ya existe una propuesta para este grupo + campaña + periodo
      let qExist = supabase
        .from('propuestas')
        .select('id')
        .eq('grupo', sanitizedForm.grupo)
        .eq('campana', sanitizedForm.campana);
      if (sanitizedForm.periodoCapa) {
        qExist = qExist.eq('periodoCapa', sanitizedForm.periodoCapa);
      }
      if (sanitizedForm.segmento) {
        qExist = qExist.eq('segmento', sanitizedForm.segmento);
      }
      const { data: existingProp } = await qExist.maybeSingle();

      if (existingProp?.id) {
        propId = existingProp.id;
        sanitizedForm.id = existingProp.id;
        sanitizedForm.updated_at = new Date().toISOString();
        const { data, error } = await supabase
          .from('propuestas')
          .update(sanitizedForm)
          .eq('id', propId)
          .select()
          .single();
        if (error) {
          console.error("Error actualizando propuesta existente en Supabase:", error);
          throw new Error(error.message || 'Error al actualizar propuesta en Supabase');
        }
        savedForm = data;
      } else {
        delete sanitizedForm.id; // Permitir que Postgres genere gen_random_uuid()
        const { data, error } = await supabase
          .from('propuestas')
          .insert([sanitizedForm])
          .select()
          .single();
        if (error) {
          console.error("Error insertando propuesta en Supabase:", error);
          throw new Error(error.message || 'Error al insertar propuesta en Supabase');
        }
        savedForm = data;
        propId = data.id;
      }
    } else {
      sanitizedForm.updated_at = new Date().toISOString();
      const { data, error } = await supabase
        .from('propuestas')
        .update(sanitizedForm)
        .eq('id', propId)
        .select()
        .single();
      if (error) {
        console.error("Error actualizando propuesta en Supabase:", error);
        throw new Error(error.message || 'Error al actualizar propuesta en Supabase');
      }
      savedForm = data;
    }

    // 2. Sanitizar y consolidar en 'propuestas_consolidado'
    const consPayload = {
      propuesta_id: propId,
      periodoCapa: sanitizedForm.periodoCapa,
      semana: sanitizedForm.semana,
      segmento: sanitizedForm.segmento,
      campana: sanitizedForm.campana,
      grupo: sanitizedForm.grupo,
      modalidad: sanitizedForm.modalidad,
      condicionLaboral: sanitizedForm.condicionLaboral,
      cod: sanitizedForm.cod || (sanitizedForm.campana && sanitizedForm.grupo ? `${sanitizedForm.campana} - ${sanitizedForm.grupo}` : sanitizedForm.titulo),
      fechaInicioCapa: sanitizedForm.inicio,
      ingresoOperacion: sanitizedForm.ingresoOperacion,
      mesAfectacionCapa: sanitizedForm.mesAfectacionCapa,
      mesAfectacionBonos: sanitizedForm.mesAfectacionBonos,

      pagoPorDia: Number(sanitizedForm.pagoCapaPorDia) || 0,
      pagoCompleto: Number(sanitizedForm.pagoCapaTotal) || (Number(sanitizedForm.pagoCapaPorDia) * Number(sanitizedForm.diasCapa)) || 0,
      diasCapa: Number(sanitizedForm.diasCapa) || 0,
      cantDiasFeriados: Number(sanitizedForm.cantDiasFeriados) || 0,

      bonoBienvenidaM1: Number(sanitizedForm.bBienvenidaM1) || 0,
      bonoBienvenidaM2: Number(sanitizedForm.bBienvenidaM2) || 0,
      bonoBienvenidaM3: Number(sanitizedForm.bBienvenidaM3) || 0,

      bonoPermanenciaM1: Number(sanitizedForm.bPermM1) || 0,
      bonoPermanenciaM2: Number(sanitizedForm.bPermM2) || 0,
      bonoPermanenciaM3: Number(sanitizedForm.bPermM3) || 0,
      bonoPermanenciaM4: Number(sanitizedForm.bPermM4) || 0,

      bonoAsistenciaM1: Number(sanitizedForm.bAsisM1) || 0,
      bonoAsistenciaM2: Number(sanitizedForm.bAsisM2) || 0,
      bonoAsistenciaM3: Number(sanitizedForm.bAsisM3) || 0,
    };

    // Verificar si ya existe consolidado vinculado o por llave de grupo
    let existingConsId = null;
    const { data: byPropId } = await supabase
      .from('propuestas_consolidado')
      .select('id')
      .eq('propuesta_id', propId)
      .maybeSingle();

    if (byPropId?.id) {
      existingConsId = byPropId.id;
    } else if (consPayload.grupo) {
      let q = supabase
        .from('propuestas_consolidado')
        .select('id, semana')
        .eq('grupo', consPayload.grupo);
      if (consPayload.campana) q = q.eq('campana', consPayload.campana);
      if (consPayload.periodoCapa) q = q.eq('periodoCapa', consPayload.periodoCapa);
      if (consPayload.segmento) q = q.eq('segmento', consPayload.segmento);
      
      const { data: candidates } = await q;
      if (candidates && candidates.length > 0) {
        const sameSemana = candidates.find(c => {
          const numA = String(c.semana || '').replace(/\D/g, '');
          const numB = String(consPayload.semana || '').replace(/\D/g, '');
          return numA && numA === numB;
        });
        existingConsId = sameSemana?.id || candidates[0].id;
      }
    }

    if (existingConsId) {
      const { error: updErr } = await supabase
        .from('propuestas_consolidado')
        .update(consPayload)
        .eq('id', existingConsId);
      if (updErr) {
        console.error("Error actualizando propuestas_consolidado en Supabase:", updErr);
        throw new Error(updErr.message || 'Error al actualizar consolidado en Supabase');
      }
    } else {
      delete consPayload.id; // Evitar pasar id nulo
      const { error: insErr } = await supabase
        .from('propuestas_consolidado')
        .insert([consPayload]);
      if (insErr) {
        console.error("Error insertando propuestas_consolidado en Supabase:", insErr);
        throw new Error(insErr.message || 'Error al insertar consolidado en Supabase');
      }
    }

    // Invalidar cachés locales para refresco instantáneo
    invalidateCache();
    window.dispatchEvent(new CustomEvent('gea-global-refresh'));
    return savedForm;
  }

  // Local Storage Fallback
  initLocalStorageDb();
  const props = getFromStorage('propuestas') || [];
  const cons = getFromStorage('propuestas_consolidado') || [];

  let newProp;
  if (sanitizedForm.id) {
    const idx = props.findIndex(l => l.id === sanitizedForm.id);
    if (idx >= 0) {
      props[idx] = { ...props[idx], ...sanitizedForm, updated_at: new Date().toISOString() };
      newProp = props[idx];
      saveToStorage('propuestas', props);
    }
  }

  if (!newProp) {
    newProp = { ...sanitizedForm, id: 'prop-' + Date.now(), created_at: new Date().toISOString() };
    props.push(newProp);
    saveToStorage('propuestas', props);
  }

  const consPayload = {
    ...payloadConsolidado,
    propuesta_id: newProp.id,
    created_at: newProp.created_at || new Date().toISOString()
  };
  const consIdx = cons.findIndex(c => c.propuesta_id === newProp.id || (c.grupo === newProp.grupo && c.campana === newProp.campana));
  if (consIdx >= 0) {
    cons[consIdx] = { ...cons[consIdx], ...consPayload };
  } else {
    cons.push(consPayload);
  }
  saveToStorage('propuestas_consolidado', cons);

  return newProp;
}

export async function deletePropuesta(consolidadoId, propuestaId) {
  if (DB_MODE === 'supabase') {
    try {
      if (propuestaId) {
        // Al borrar de propuestas, el foreign key borra en cascada de propuestas_consolidado
        const { error } = await supabase.from('propuestas').delete().eq('id', propuestaId);
        if (error) throw error;
      }
      if (consolidadoId) {
        const { error } = await supabase.from('propuestas_consolidado').delete().eq('id', consolidadoId);
        if (error && !propuestaId) throw error;
      }
      invalidateCache();
      window.dispatchEvent(new CustomEvent('gea-global-refresh'));
      return true;
    } catch (e) {
      console.error("Error eliminando propuesta en Supabase:", e);
      throw e;
    }
  }

  initLocalStorageDb();
  let props = getFromStorage('propuestas') || [];
  let cons = getFromStorage('propuestas_consolidado') || [];
  if (propuestaId) {
    props = props.filter(p => p.id !== propuestaId);
    cons = cons.filter(c => c.propuesta_id !== propuestaId);
  }
  if (consolidadoId) {
    cons = cons.filter(c => c.id !== consolidadoId);
  }
  saveToStorage('propuestas', props);
  saveToStorage('propuestas_consolidado', cons);
  return true;
}

export async function deleteDashboardLink(id) {
  if (DB_MODE === 'supabase') {
    const { error } = await supabase
      .from('dashboards_links')
      .delete()
      .eq('id', id);
    if (error) throw error;
    return true;
  }
  
  // Local storage fallback
  initLocalStorageDb();
  const links = getFromStorage('dashboards_links') || [];
  const filtered = links.filter(l => l.id !== id);
  saveToStorage('dashboards_links', filtered);
  return true;
}

// ==========================================
// EQUIPO DE RECLUTAMIENTO
// ==========================================

export function getEquipoReclutamiento() {
  return withCache('equipo_reclutamiento', 300000, async () => {
    if (DB_MODE === 'supabase') {
      const { data, error } = await supabase
        .from('equipo_reclutamiento')
        .select('*')
        .order('nombres_completos');
        
      if (error) {
        console.error("Error fetching equipo_reclutamiento:", error);
        return [];
      }
      return data || [];
    }
    
    return [];
  });
}

function cleanReclutamientoPayload(payload) {
  const allowed = ['documento', 'alias', 'apellido_paterno', 'apellido_materno', 'nombres_completos', 'cargo', 'estado', 'fecha_ingreso', 'fecha_cese', 'bono', 'pct_efectivo', 'pct_sodexo', 'alix'];
  const res = {};
  allowed.forEach(k => {
    if (payload[k] !== undefined) {
      if ((k === 'fecha_ingreso' || k === 'fecha_cese') && payload[k] === '') {
        res[k] = null;
      } else if (k === 'documento' || k === 'alias' || k === 'apellido_paterno' || k === 'apellido_materno' || k === 'nombres_completos' || k === 'cargo' || k === 'alix') {
        res[k] = payload[k] ? String(payload[k]).trim() : null;
      } else {
        res[k] = payload[k];
      }
    }
  });
  return res;
}

export async function updateEquipoReclutamiento(documento, payload) {
  if (DB_MODE === 'supabase') {
    const cleaned = cleanReclutamientoPayload(payload);
    const { data, error } = await supabase
      .from('equipo_reclutamiento')
      .update({ ...cleaned, updated_at: new Date().toISOString() })
      .eq('documento', documento)
      .select()
      .single();
    if (error) {
      console.error("Error updating equipo_reclutamiento:", error);
      throw error;
    }
    invalidateCache('equipo_reclutamiento');
    invalidateCache('reclutadores');
    return data;
  }
  return null;
}

export async function addEquipoReclutamiento(payload) {
  if (DB_MODE === 'supabase') {
    const cleaned = cleanReclutamientoPayload(payload);
    const { data, error } = await supabase
      .from('equipo_reclutamiento')
      .upsert([{ ...cleaned, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }], { onConflict: 'documento' })
      .select()
      .single();
    if (error) {
      console.error("Error adding equipo_reclutamiento:", error);
      throw error;
    }
    invalidateCache('equipo_reclutamiento');
    invalidateCache('reclutadores');
    return data;
  }
  return null;
}


// ==========================================
// EQUIPO DE FORMACION
// ==========================================

export function getEquipoFormacion() {
  return withCache('equipo_formacion', 120000, async () => {
    if (DB_MODE === 'supabase') {
      const map = new Map();

      // 1. Fetch formadores
      try {
        const { data: formData } = await supabase
          .from('formadores')
          .select('documento, nombre_completo, sede, segmento, subcampana, cargo_contractual, cargo_funcional, estado, fecha_inicio, fecha_cese')
          .order('nombre_completo');

        if (formData) {
          formData.forEach(f => {
            const doc = String(f.documento || '').trim();
            if (doc) {
              map.set(doc, {
                documento: doc,
                nombres_completos: (f.nombre_completo || '').trim().toUpperCase(),
                datos_completos: (f.nombre_completo || '').trim().toUpperCase(),
                sede: f.sede || '',
                segmento: f.segmento || '',
                subcampana: f.subcampana || '',
                cargo_contractual: f.cargo_contractual || 'FORMADOR',
                cargo_funcional: (f.cargo_funcional || 'FORMADOR').trim().toUpperCase(),
                estado: (f.estado || 'ACTIVO').trim().toUpperCase(),
                fecha_inicio: f.fecha_inicio || null,
                fecha_cese: f.fecha_cese || null
              });
            }
          });
        }
      } catch (e) {
        console.warn('getEquipoFormacion: error reading formadores:', e);
      }

      // 2. Fetch equipo_formacion (merge/overwrite)
      try {
        const { data, error } = await supabase
          .from('equipo_formacion')
          .select('documento, apellido_paterno, apellido_materno, nombres_completos, datos_completos, sede, segmento, subcampana, cargo_contractual, cargo_funcional, estado, fecha_inicio, fecha_cese, bono_bruto, usuario_alix')
          .order('nombres_completos');
          
        if (!error && data) {
          data.forEach(f => {
            const doc = String(f.documento || '').trim();
            if (doc) {
              const existing = map.get(doc) || {};
              map.set(doc, {
                ...f,
                documento: doc,
                nombres_completos: (f.datos_completos || f.nombres_completos || existing.nombres_completos || '').trim().toUpperCase(),
                datos_completos: (f.datos_completos || f.nombres_completos || existing.datos_completos || '').trim().toUpperCase(),
                sede: f.sede || existing.sede || '',
                segmento: f.segmento || existing.segmento || '',
                subcampana: f.subcampana || existing.subcampana || '',
                cargo_contractual: f.cargo_contractual || existing.cargo_contractual || 'FORMADOR',
                cargo_funcional: (f.cargo_funcional || existing.cargo_funcional || 'FORMADOR').trim().toUpperCase(),
                estado: (f.estado || existing.estado || 'ACTIVO').trim().toUpperCase()
              });
            }
          });
        }
      } catch (e) {
        console.warn('getEquipoFormacion: error reading equipo_formacion:', e);
      }

      if (map.size > 0) {
        return Array.from(map.values()).sort((a, b) => (a.nombres_completos || '').localeCompare(b.nombres_completos || ''));
      }
    }
    
    return [];
  });
}

export async function updateEquipoFormacion(documento, payload) {
  if (DB_MODE === 'supabase') {
    const cleanPayload = { ...payload }
    if (typeof cleanPayload.nombres_completos === 'string') cleanPayload.nombres_completos = cleanPayload.nombres_completos.trim().toUpperCase()
    if (typeof cleanPayload.cargo_funcional === 'string') cleanPayload.cargo_funcional = cleanPayload.cargo_funcional.trim().toUpperCase()
    if (typeof cleanPayload.estado === 'string') cleanPayload.estado = cleanPayload.estado.trim().toUpperCase()

    const { data, error } = await supabase
      .from('equipo_formacion')
      .update({ ...cleanPayload, updated_at: new Date().toISOString() })
      .eq('documento', documento)
      .select()
      .single();
    if (error) {
      console.error("Error updating equipo_formacion:", error);
      throw error;
    }
    invalidateCache('equipo_formacion');
    invalidateCache('formadores_list');
    return data;
  }
  return null;
}

export async function addEquipoFormacion(payload) {
  if (DB_MODE === 'supabase') {
    const cleanPayload = { ...payload }
    if (typeof cleanPayload.nombres_completos === 'string') cleanPayload.nombres_completos = cleanPayload.nombres_completos.trim().toUpperCase()
    if (typeof cleanPayload.cargo_funcional === 'string') cleanPayload.cargo_funcional = cleanPayload.cargo_funcional.trim().toUpperCase()
    if (typeof cleanPayload.estado === 'string') cleanPayload.estado = cleanPayload.estado.trim().toUpperCase()

    const { data, error } = await supabase
      .from('equipo_formacion')
      .upsert([{ ...cleanPayload, updated_at: new Date().toISOString() }], { onConflict: 'documento' })
      .select()
      .single();
    if (error) {
      console.error("Error adding equipo_formacion:", error);
      throw error;
    }
    invalidateCache('equipo_formacion');
    invalidateCache('formadores_list');
    return data;
  }
  return null;
}

// ==========================================
// ASIGNACION FORMADORES
// ==========================================

export async function updateGrupoFormador(grupo_codigo, campana, formador_documento, formador_nombre) {
  if (DB_MODE === 'supabase') {
    const payload = {
      formador_documento: formador_documento ? String(formador_documento).trim() : null
    };
    if (formador_nombre !== undefined) {
      payload.formador_nombre = formador_nombre ? String(formador_nombre).trim() : null;
    }

    let query = supabase
      .from('capacidad_rys')
      .update(payload)
      .eq('codigo', grupo_codigo);

    if (campana && campana !== 'Sin Campaña' && campana !== 'Todas') {
      query = query.eq('campana', campana);
    }
      
    const { error } = await query;
      
    if (error) {
      // Fallback si la columna formador_nombre no existe físicamente en capacidad_rys
      if (payload.formador_nombre !== undefined) {
        delete payload.formador_nombre;
        let fbQuery = supabase
          .from('capacidad_rys')
          .update(payload)
          .eq('codigo', grupo_codigo);
        if (campana && campana !== 'Sin Campaña' && campana !== 'Todas') {
          fbQuery = fbQuery.eq('campana', campana);
        }
        const { error: fbError } = await fbQuery;
        if (fbError) {
          console.error('Error actualizando formador del grupo (fallback):', fbError);
          throw fbError;
        }
      } else {
        console.error('Error actualizando formador del grupo:', error);
        throw error;
      }
    }
    
    // Invalidar cachés operativas
    invalidateCache('grupos_capacidad');
    invalidateCache('grupos_con_metas');
    invalidateCache('grupos_dia1');
    invalidateCache('formadores_list');
    invalidateCache('equipo_formacion');

    // Auditar
    mockAuditLog('capacidad_rys', 'UPDATE', grupo_codigo, null, { formador_documento, formador_nombre });
    
    return true;
  }
  return false;
}

export async function updateGrupoCapacidadField(grupo_codigo, campana, field, value) {
  if (DB_MODE === 'supabase') {
    let query = supabase.from('capacidad_rys').update({ [field]: value || null }).eq('codigo', grupo_codigo);
    if (campana && campana !== 'Sin Campaña') query.eq('campana', campana);
    const { error } = await query;
      
    if (error) {
      console.warn(`Aviso actualizando ${field} en capacidad_rys:`, error);
    }

    // Also update metas_equipos
    try {
      const meField = field === 'rango_horario' ? 'horario' : field;
      await supabase.from('metas_equipos').update({ [meField]: value || null }).eq('grupo', grupo_codigo);
    } catch (meErr) {
      console.warn('Sync field update to metas_equipos warning:', meErr);
    }
    
    invalidateCache('grupos_capacidad');
    invalidateCache('grupos_con_metas');
    invalidateCache('grupos_dia1');
    mockAuditLog('capacidad_rys', 'UPDATE', grupo_codigo, null, { [field]: value });
    return true;
  }
  return false;
}

export async function fetchPostulantesPorGrupo(grupo_codigo, campana) {
  if (DB_MODE === 'supabase') {
    try {
      let query = supabase
        .from('nominas')
        .select('documento, apellido_paterno, apellido_materno, nombres, celular, condicion, campana, grupo_codigo, estado')
        .eq('grupo_codigo', grupo_codigo)

      if (campana && campana !== 'Sin Campaña' && campana !== 'Todas') {
        query = query.eq('campana', campana)
      }

      const { data, error } = await query
      if (error) {
        console.error('Error fetching postulantes por grupo:', error)
        throw error
      }
      return (data || []).map(p => ({
        ...p,
        nombres_completos: `${p.nombres || ''} ${p.apellido_paterno || ''} ${p.apellido_materno || ''}`.trim()
      })).sort((a, b) => (a.nombres_completos || '').localeCompare(b.nombres_completos || ''))
    } catch (err) {
      console.error('fetchPostulantesPorGrupo error:', err)
      throw err
    }
  }
  return []
}

export async function dividirGrupoBulk({ parentCodigo, campana, distribucion }) {
  if (DB_MODE !== 'supabase') throw new Error("Requiere conexión a Supabase")

  // 1. Intentar ejecutar mediante el RPC transaccional optimizado de Postgres
  const { data, error } = await supabase.rpc('dividir_grupo_transaccional', {
    p_parent_codigo: parentCodigo,
    p_campana: campana,
    p_distribucion: distribucion
  })

  if (!error) {
    invalidateCache('grupos_capacidad')
    invalidateCache('grupos_con_metas')
    invalidateCache('equipo_formacion')
    invalidateCache('consolidado_asistencias')
    invalidateCache('all_nominas')
    invalidateCache('nominas_dataset')
    mockAuditLog('nominas', 'SPLIT_GRUPO_RPC', parentCodigo, null, { campana, distribucion, resultado: data })
    return data
  }

  // 2. Fallback resiliente en cliente si el RPC aún no fue creado en Supabase
  console.warn("RPC dividir_grupo_transaccional no encontrado en base de datos, ejecutando división directa por cliente...", error)

  // Obtener metadata del grupo padre de capacidad_rys
  let parentCap = null
  try {
    const { data: capData } = await supabase
      .from('capacidad_rys')
      .select('*')
      .eq('codigo', parentCodigo)
      .eq('campana', campana)
      .maybeSingle()
    parentCap = capData
  } catch (cErr) {
    console.warn("No se pudo obtener metadata de capacidad_rys para el padre:", cErr)
  }

  let totalNominasUpdated = 0

  for (const item of distribucion) {
    const { subgrupo, doc_formador, dnis } = item
    if (!dnis || dnis.length === 0) continue

    // A. Actualizar nóminas (solo grupo_codigo)
    try {
      const { error: nomErr } = await supabase
        .from('nominas')
        .update({ grupo_codigo: subgrupo, parent_grupo_codigo: parentCodigo })
        .in('documento', dnis)
        .eq('campana', campana)

      if (nomErr) {
        // Si parent_grupo_codigo no existe como columna, actualizar solo grupo_codigo
        await supabase
          .from('nominas')
          .update({ grupo_codigo: subgrupo })
          .in('documento', dnis)
          .eq('campana', campana)
      }
    } catch (nErr) {
      await supabase
        .from('nominas')
        .update({ grupo_codigo: subgrupo })
        .in('documento', dnis)
        .eq('campana', campana)
    }

    // B. Actualizar histórico en consolidado_asistencias
    try {
      const asisPayload = {
        codigo_grupo: subgrupo,
        parent_grupo_codigo: parentCodigo
      }
      if (doc_formador) asisPayload.documento_formador = doc_formador

      const { error: asisErr } = await supabase
        .from('consolidado_asistencias')
        .update(asisPayload)
        .in('documento', dnis)
        .eq('campana', campana)

      if (asisErr) {
        delete asisPayload.parent_grupo_codigo
        await supabase
          .from('consolidado_asistencias')
          .update(asisPayload)
          .in('documento', dnis)
          .eq('campana', campana)
      }
    } catch (aErr) {
      console.warn("Aviso actualizando consolidado_asistencias:", aErr)
    }

    // C. Crear / Actualizar subgrupo en capacidad_rys con su respectiva formadora
    try {
      const subgrupoCapRow = {
        codigo: subgrupo,
        campana: campana,
        periodo: parentCap?.periodo || null,
        segmento: parentCap?.segmento || null,
        modalidad: parentCap?.modalidad || 'PRESENCIAL',
        semana_label: parentCap?.semana_label || null,
        semana_trabajo: parentCap?.semana_trabajo || null,
        fecha_inicio_ojt: parentCap?.fecha_inicio_ojt || null,
        fecha_ingreso_op: parentCap?.fecha_ingreso_op || null,
        formador_documento: doc_formador || parentCap?.formador_documento || null,
        estado: parentCap?.estado || 'ACTIVO',
        observacion: `Subgrupo derivado de ${parentCodigo}`
      }
      await supabase.from('capacidad_rys').upsert(subgrupoCapRow, { onConflict: 'campana,codigo' })
    } catch (capUpsertErr) {
      console.warn("Aviso creando subgrupo en capacidad_rys:", capUpsertErr)
    }

    totalNominasUpdated += dnis.length
  }

  // Invalidar cachés operativas
  invalidateCache('grupos_capacidad')
  invalidateCache('grupos_con_metas')
  invalidateCache('equipo_formacion')
  invalidateCache('consolidado_asistencias')
  invalidateCache('all_nominas')
  invalidateCache('nominas_dataset')

  mockAuditLog('nominas', 'SPLIT_GRUPO_CLIENT', parentCodigo, null, { campana, distribucion })

  return {
    success: true,
    parent_codigo: parentCodigo,
    campana,
    total_postulantes_distribuidos: totalNominasUpdated
  }
}

/**
 * Adjudica postulantes desde el Pool/Bolsa al grupo destino de forma atómica y segura.
 * Desactiva procesos previos en otros grupos (sin DELETE para preservar métricas históricas)
 * e inserta el nuevo registro activo en nóminas.
 */
/** Asegura campos numéricos/alias que el form parsea pero el RPC/BD espera con otro nombre. */
/** Asegura campos numéricos/alias que el form parsea pero el RPC/BD espera con otro nombre. */
function normalizePostulanteForAdjudicar(p = {}) {
  const phonesCel = extractPhonesFromText(p.celular)
  const phonesRef = extractPhonesFromText(p.celular_referencia)
  const phonesWsp = extractPhonesFromText(p.usuario_whatsapp)

  const celular = phonesCel.primary || phonesWsp.primary || phonesRef.primary || normalizePhoneValue(p.celular)
  const celularRef = phonesRef.primary || phonesCel.secondary || phonesRef.secondary || (phonesWsp.primary && phonesWsp.primary !== celular ? phonesWsp.primary : null) || normalizePhoneValue(p.celular_referencia)

  const fechaNac = parseFechaNacimiento(p.fecha_nacimiento) || null
  const edad = parseEdadValue(p.edad, fechaNac)

  let nHijos = p.n_hijos
  if (nHijos === '' || nHijos === undefined || nHijos === null) nHijos = 0
  else nHijos = parseInt(nHijos, 10)
  if (!Number.isFinite(nHijos) || nHijos < 0) nHijos = 0

  const rawExp = p.exp_tiempo_campana || p.exp_tiempo_call || null
  const expTiempo = normalizeTiempoExperiencia(rawExp) || rawExp

  return {
    ...p,
    celular: celular || null,
    celular_referencia: celularRef || null,
    fecha_nacimiento: fechaNac,
    edad: edad ?? null,
    n_hijos: nHijos,
    exp_tiempo_call: expTiempo,
    exp_tiempo_campana: expTiempo,
  }
}

/** Parche post-RPC: el SQL antiguo no persistía edad / alias exp_tiempo_call. */
async function backfillDemograficosTrasAdjudicar(cleanGrupo, rows = []) {
  for (const row of rows) {
    const doc = String(row.documento || '').trim()
    if (!doc) continue
    const patch = { updated_at: new Date().toISOString() }
    if (row.celular) patch.celular = String(row.celular)
    if (row.celular_referencia) patch.celular_referencia = String(row.celular_referencia)
    if (row.fecha_nacimiento) patch.fecha_nacimiento = row.fecha_nacimiento
    if (row.edad != null && row.edad !== '') patch.edad = Number(row.edad)
    if (row.n_hijos != null && row.n_hijos !== '') patch.n_hijos = Number(row.n_hijos)
    if (row.exp_tipo_campana) patch.exp_tipo_campana = row.exp_tipo_campana
    const expT = row.exp_tiempo_campana || row.exp_tiempo_call
    if (expT) {
      patch.exp_tiempo_campana = expT
      // Algunas BDs tienen ambas columnas; si falla el update, reintentamos sin exp_tiempo_call
      patch.exp_tiempo_call = expT
    }
    if (row.observacion_reclutamiento) patch.observacion_reclutamiento = row.observacion_reclutamiento
    if (Object.keys(patch).length <= 1) continue
    let { error } = await supabase
      .from('nominas')
      .update(patch)
      .eq('documento', doc)
      .eq('grupo_codigo', cleanGrupo)
    // Si la columna exp_tiempo_call no existe en BD, reintentar solo con alias oficial
    if (error && /exp_tiempo_call/i.test(error.message || '')) {
      delete patch.exp_tiempo_call
      ;({ error } = await supabase
        .from('nominas')
        .update(patch)
        .eq('documento', doc)
        .eq('grupo_codigo', cleanGrupo))
    }
    if (error) console.warn('[adjudicar] backfill demográficos', doc, error.message)
  }
}

export async function adjudicarPostulantesPoolBulk({ targetGrupo, targetCampana, postulantes }) {
  if (DB_MODE !== 'supabase') throw new Error("Requiere conexión a Supabase")
  if (!targetGrupo) throw new Error("El código del grupo destino es obligatorio")
  if (!postulantes || postulantes.length === 0) return { success: true, inserted: 0, updated: 0 }

  const cleanGrupo = String(targetGrupo).trim().toUpperCase()
  const cleanCampana = String(targetCampana || '').trim().toUpperCase()
  const normalized = (postulantes || []).map(normalizePostulanteForAdjudicar)

  // 1. Intentar ejecutar mediante el RPC transaccional de PostgreSQL
  try {
    const { data, error } = await supabase.rpc('adjudicar_postulantes_pool', {
      p_target_grupo: cleanGrupo,
      p_target_campana: cleanCampana,
      p_postulantes: normalized
    })

    if (!error && data) {
      // Asegurar celular / fecha / edad / hijos / experiencia aunque el RPC en BD esté desactualizado
      await backfillDemograficosTrasAdjudicar(cleanGrupo, normalized)
      invalidateCache('all_consolidado')
      invalidateCache('resumen_cap_')
      invalidateCache('grupos_con_metas')
      invalidateCache('all_asistencias_bajas')
      invalidateCache('all_nominas')
      invalidateCache('nominas_dataset')
      return data
    }
    if (error) {
      console.warn("RPC adjudicar_postulantes_pool arrojó error, probando fallback:", error)
      if (error.message?.includes('kpi_reclutadores_llave') || error.details?.includes('kpi_reclutadores_llave')) {
        await new Promise(r => setTimeout(r, 600))
      }
    }
  } catch (rpcErr) {
    console.warn("RPC adjudicar_postulantes_pool no disponible, usando fallback cliente:", rpcErr)
  }

  // 2. Inserción directa de nuevos registros en cliente (preservando historial previo de otros grupos)
  let { data: insData, error: insErr } = await supabase
    .from('nominas')
    .insert(normalized)

  if (insErr && (insErr.message?.includes('kpi_reclutadores_llave') || insErr.details?.includes('kpi_reclutadores_llave'))) {
    // Reintento tras pausa breve si hubo colisión concurrente con el trigger de KPI
    await new Promise(r => setTimeout(r, 800))
    const retry = await supabase.from('nominas').insert(normalized)
    insErr = retry.error
  }

  if (insErr) {
    if (insErr.message?.includes('kpi_reclutadores_llave') || insErr.details?.includes('kpi_reclutadores_llave')) {
      throw new Error("Conflicto de clave en consolidado KPI de reclutadores. Por favor ejecuta el script de actualización en el Editor SQL de Supabase para activar 'ON CONFLICT DO UPDATE'.")
    }
    throw insErr
  }

  invalidateCache('all_consolidado')
  invalidateCache('resumen_cap_')
  invalidateCache('grupos_con_metas')
  invalidateCache('all_asistencias_bajas')
  invalidateCache('all_nominas')
  invalidateCache('nominas_dataset')

  return {
    success: true,
    inserted: postulantes.length,
    updated: 0,
    grupo: cleanGrupo,
    campana: cleanCampana
  }
}

/**
 * Migra una lista de postulantes (DNI) de un grupo/subgrupo a otro nuevo dentro de la misma campaña.
 * Actualiza nóminas, asistencias e invalida cachés operativas.
 */
export async function migrarPostulantesEntreGrupos({ origenGrupoCodigo, destinoGrupoCodigo, campana, dnis, destinoFormadorDoc }) {
  if (DB_MODE !== 'supabase') throw new Error("Requiere conexión a Supabase")
  if (!destinoGrupoCodigo) throw new Error("El código del grupo destino es obligatorio")
  if (!dnis || dnis.length === 0) throw new Error("Debes proporcionar al menos un DNI para migrar")

  const cleanOrigen = origenGrupoCodigo ? String(origenGrupoCodigo).trim().toUpperCase() : null
  const cleanDestino = String(destinoGrupoCodigo).trim().toUpperCase()
  const cleanCampana = campana ? String(campana).trim().toUpperCase() : null

  // 1. Actualizar tabla nominas
  let nomQuery = supabase
    .from('nominas')
    .update({ 
      grupo_codigo: cleanDestino,
      updated_at: new Date().toISOString()
    })
    .in('documento', dnis)

  if (cleanCampana) nomQuery = nomQuery.ilike('campana', `%${cleanCampana}%`)
  if (cleanOrigen) nomQuery = nomQuery.eq('grupo_codigo', cleanOrigen)

  const { error: nomErr, count: nomCount } = await nomQuery
  if (nomErr) throw nomErr

  // 2. Actualizar consolidado_asistencias
  const asisPayload = {
    codigo_grupo: cleanDestino
  }
  if (destinoFormadorDoc) asisPayload.documento_formador = destinoFormadorDoc

  let asisQuery = supabase
    .from('consolidado_asistencias')
    .update(asisPayload)
    .in('documento', dnis)

  if (cleanCampana) asisQuery = asisQuery.ilike('campana', `%${cleanCampana}%`)
  try {
    await asisQuery
  } catch (e) {
    console.warn('Aviso al actualizar consolidado_asistencias en migración:', e)
  }

  // 3. Crear / asegurar registro del subgrupo destino en capacidad_rys si aún no existe
  try {
    const { data: existingCap } = await supabase
      .from('capacidad_rys')
      .select('*')
      .eq('codigo', cleanDestino)
      .maybeSingle()

    if (!existingCap && cleanOrigen) {
      const { data: parentCap } = await supabase
        .from('capacidad_rys')
        .select('*')
        .or(`codigo.eq.${cleanOrigen},codigo.eq.${cleanOrigen.split('-')[0]}`)
        .maybeSingle()

      if (parentCap) {
        await supabase.from('capacidad_rys').upsert({
          codigo: cleanDestino,
          campana: parentCap.campana || cleanCampana,
          periodo: parentCap.periodo || null,
          segmento: parentCap.segmento || null,
          modalidad: parentCap.modalidad || 'PRESENCIAL',
          semana_label: parentCap.semana_label || null,
          semana_trabajo: parentCap.semana_trabajo || null,
          fecha_inicio_ojt: parentCap.fecha_inicio_ojt || null,
          fecha_ingreso_op: parentCap.fecha_ingreso_op || null,
          formador_documento: destinoFormadorDoc || parentCap.formador_documento || null,
          estado: 'ACTIVO',
          observacion: `Derivado de migración desde ${cleanOrigen}`
        }, { onConflict: 'campana,codigo' })
      }
    }
  } catch (capErr) {
    console.warn("Aviso asegurando subgrupo en capacidad_rys:", capErr)
  }

  // 4. Invalidar todas las cachés
  invalidateCache('all_consolidado')
  invalidateCache('all_asistencias_bajas')
  invalidateCache('all_motivos_bajas')
  invalidateCache('grupos_capacidad')
  invalidateCache('grupos_con_metas')
  invalidateCache('resumen_cap_')
  invalidateCache('all_nominas')
  invalidateCache('nominas_dataset')

  mockAuditLog('nominas', 'MIGRATE_POSTULANTES_GRUPO', cleanDestino, null, {
    origen: cleanOrigen,
    destino: cleanDestino,
    campana: cleanCampana,
    total_dnis: dnis.length,
    dnis
  })

  return {
    success: true,
    origen: cleanOrigen,
    destino: cleanDestino,
    total_migrados: dnis.length
  }
}


function cleanGroupCodeKey(val) {
  if (!val) return '';
  return String(val)
    .trim()
    .toUpperCase()
    .replace(/\s*\(SEM\s*\d+.*?\)/i, '')
    .replace(/\s*-\s*SEM\s*\d+.*$/i, '')
    .replace(/_\d+$/, '')
    .trim();
}

function buildGrupoCohortLookup(gruposInfo = []) {
  const map = new Map();
  for (const g of gruposInfo) {
    const codigo = g.codigo || g.grupo_codigo || '';
    const camp = String(g.campana || '').trim().toUpperCase();
    const code = String(codigo || '').trim().toUpperCase();
    const clean = cleanGroupCodeKey(codigo);
    const semanaFromNum = g.semana_trabajo != null && g.semana_trabajo !== ''
      ? `SEM ${String(g.semana_trabajo).replace(/\D/g, '')}`
      : '';
    const payload = {
      periodo: g.periodo || g.periodo_rys || '',
      semana: g.semana_label || semanaFromNum || g.semana || '',
      segmento: g.segmento || '',
      campana: g.campana || '',
      codigo
    };
    if (camp && code) map.set(`${camp}|${code}`, payload);
    if (camp && clean) map.set(`${camp}|${clean}`, payload);
    if (code && !map.has(code)) map.set(code, payload);
    if (clean && !map.has(clean)) map.set(clean, payload);
  }
  return map;
}

function resolveCohortKeysFromGrupo(row, lookup) {
  const rawCode = row.grupo_codigo || row.codigo_grupo || row.codigo || '';
  const camp = String(row.campana || '').trim().toUpperCase();
  const code = String(rawCode || '').trim().toUpperCase();
  const clean = cleanGroupCodeKey(rawCode);
  const maestro = (camp && code && lookup.get(`${camp}|${code}`))
    || (camp && clean && lookup.get(`${camp}|${clean}`))
    || lookup.get(code)
    || lookup.get(clean)
    || null;
  return {
    periodo: row.periodo_reclutado || row.periodo_ingreso_op || row.periodo || maestro?.periodo || '',
    semana: row.semana_trabajo || row.semana_label || row.semana || maestro?.semana || '',
    segmento: String(row.segmento || '').trim() || maestro?.segmento || '',
    campana: row.campana || maestro?.campana || '',
    codigo: rawCode || maestro?.codigo || ''
  };
}

function enrichRowWithCohortKeys(row, lookup) {
  const resolved = resolveCohortKeysFromGrupo(row, lookup);
  if (!resolved.periodo && !resolved.semana && !resolved.segmento) return row;
  return {
    ...row,
    periodo: row.periodo || resolved.periodo,
    periodo_reclutado: row.periodo_reclutado || resolved.periodo,
    semana: row.semana || resolved.semana,
    semana_trabajo: row.semana_trabajo || resolved.semana,
    semana_label: row.semana_label || resolved.semana,
    segmento: String(row.segmento || '').trim() || resolved.segmento
  };
}

/**
 * Cálculo Ultrarrápido de Métricas de Calibración Día 1 en Memoria (O(1) Map indexing).
 * Reutiliza postulantes y asistencias ya cargados en RAM sin repaginar Supabase.
 */
export async function calculateMetricasReporteCalibracionFast(gruposInfo, postulantes = [], asistencias = []) {
  if (!gruposInfo || gruposInfo.length === 0) return []

  const norm = (val) => String(val || '').trim().toUpperCase();
  const normDoc = (val) => String(val || '').trim().replace(/\D/g, '') || String(val || '').trim().toUpperCase();
  
  // Limpieza segura de sufijos de presentación sin recortar el identificador del grupo (ej: GPE-2026013 se mantiene intacto)
  const cleanGroupCode = (val) => {
    if (!val) return '';
    return String(val)
      .trim()
      .toUpperCase()
      .replace(/\s*\(SEM\s*\d+.*?\)/i, '')
      .replace(/\s*-\s*SEM\s*\d+.*$/i, '')
      .replace(/_\d+$/, '')
      .trim();
  };

  const allCodes = [];
  gruposInfo.forEach(g => {
    const c = g.codigo || g.grupo_codigo;
    if (c) {
      allCodes.push(c);
      const clean = cleanGroupCode(c);
      if (clean) allCodes.push(clean);
    }
  });
  const codigos = [...new Set(allCodes.filter(Boolean))];

  // 1. Consultas de configuración y asistencias_dia1_reclutador
  let configAll = [];
  let recAsisDia1All = [];
  let activePostulantes = postulantes || [];
  let activeAsistencias = asistencias || [];

  if (DB_MODE === 'supabase' && codigos.length > 0) {
    const promises = [
      supabase.from('grupos_dia1')
        .select('estado_calibracion, fecha_dia1, grupo_codigo, campana')
        .in('grupo_codigo', codigos),
      supabase.from('asistencias_dia1_reclutador')
        .select('postulante_documento, grupo_codigo, campana, sigla_inicial, sigla_final, motivo_baja')
        .in('grupo_codigo', codigos),
      supabase.from('nominas')
        .select('documento, grupo_codigo, campana, segmento, dia_0, dia_1, status_dia_1, estado, tipo_reclutado, activo, periodo_reclutado, semana_trabajo, fecha_registro, created_at')
        .in('grupo_codigo', codigos)
    ];

    // Fallback directo si no hay asistencias cargadas en memoria
    if (activeAsistencias.length === 0) {
      promises.push(
        supabase.from('consolidado_asistencias')
          .select('documento, codigo_grupo, campana, sigla, motivo_baja, estado, tipo_reclutado, fecha_registro_asistencia, periodo, corte, fecha_hora_registro')
          .in('codigo_grupo', codigos)
      );
    } else {
      promises.push(Promise.resolve({ data: null }));
    }

    const [cfgRes, recAsisRes, nomRes, asisFallbackRes] = await Promise.all(promises);
    
    configAll = cfgRes.data || [];
    recAsisDia1All = recAsisRes.data || [];
    if (nomRes?.data && nomRes.data.length > 0) {
      activePostulantes = nomRes.data;
    }
    if (asisFallbackRes?.data && activeAsistencias.length === 0) {
      activeAsistencias = asisFallbackRes.data;
    }
  }

  const descSet = await getDescuentosSetGlobal();

  const configMap = new Map();
  if (configAll) {
    configAll.forEach(c => {
      const code = norm(c.grupo_codigo);
      const cleanCode = cleanGroupCode(c.grupo_codigo);
      const camp = norm(c.campana);
      if (camp && code) configMap.set(`${camp}|${code}`, c);
      if (camp && cleanCode) configMap.set(`${camp}|${cleanCode}`, c);
      if (code && !configMap.has(code)) configMap.set(code, c);
    });
  }

  // Indexar asistencias_dia1_reclutador
  const recAsisMap = new Map();
  if (recAsisDia1All) {
    recAsisDia1All.forEach(r => {
      const code = norm(r.grupo_codigo);
      const cleanCode = cleanGroupCode(r.grupo_codigo);
      const camp = norm(r.campana);
      const doc = norm(r.postulante_documento);
      if (doc) {
        if (camp && code) recAsisMap.set(`${camp}|${code}|${doc}`, r);
        if (camp && cleanCode) recAsisMap.set(`${camp}|${cleanCode}|${doc}`, r);
        if (code && !recAsisMap.has(`${code}|${doc}`)) recAsisMap.set(`${code}|${doc}`, r);
      }
    });
  }

  // Helper normalizadores para las 5 Llaves Compuestas Universales
  const normSem = (val) => {
    if (!val) return '';
    const s = String(val).trim().toUpperCase();
    if (['ALL', 'TODAS', 'TODOS', '-', 'NULL', 'UNDEFINED'].includes(s)) return '';
    const num = s.replace(/\D/g, '');
    return num ? `SEM ${parseInt(num, 10)}` : s;
  };

  const normPer = (val) => {
    if (!val) return '';
    const num = String(val).replace(/\D/g, '');
    return num.length >= 6 ? num.slice(0, 6) : num;
  };

  const normSeg = (rawSeg, campana) => {
    let s = String(rawSeg || '').trim().toUpperCase();
    const c = String(campana || '').toUpperCase();
    if (c.includes('RETENCIONES FIJA') || c.includes('RETENCION FIJA') || c.includes('FIJA INBOUND')) return 'CLARO PERU';
    if (c.includes('CLARO POSTPAGO')) return 'CLARO PERU';
    if (c.includes('TUVES') || c.includes('CHILE')) return 'CLARO CHILE';
    if (c.includes('LIPIGAS') || c.includes('LIMAGAS')) return 'LIPIGAS';
    if (s === 'CLARO PERU' || s === 'CLARO PERU RETENCIONES' || s === 'CLARO PERU OUT' || s === 'CLARO CHILE' || s === 'LIPIGAS') return s;
    if (s.includes('RETENCION') || c.includes('RETENCION') || c.includes('CONTACTADOS') || c.includes('CONTENCI')) return 'CLARO PERU RETENCIONES';
    if (s.includes('OUT') || c.includes('OUT') || c.includes('PREVENTIVA') || c.includes('PORTA') || c.includes('RENO') || c.includes('VENTAS') || c.includes('CROSS') || c.includes('MIGRA')) return 'CLARO PERU OUT';
    return 'CLARO PERU';
  };

  const build5K = (periodo, semana, segmento, campana, grupo) => {
    const p = normPer(periodo);
    const s = normSem(semana);
    const seg = normSeg(segmento, campana);
    const c = norm(campana);
    const g = norm(grupo);
    return `${p}|${s}|${seg}|${c}|${g}`;
  };

  const isCampCompatible = (campA, campB) => {
    if (!campA || !campB) return true;
    const a = norm(campA);
    const b = norm(campB);
    if (a === b) return true;
    const clean = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z0-9]/g, '').trim().toUpperCase();
    const ca = clean(campA);
    const cb = clean(campB);
    if (ca === cb) return true;
    if (ca.length >= 6 && cb.length >= 6 && (ca.includes(cb) || cb.includes(ca))) return true;
    return false;
  };

  const grupoKeysLookup = buildGrupoCohortLookup(gruposInfo);
  activePostulantes = (activePostulantes || []).map(n => enrichRowWithCohortKeys(n, grupoKeysLookup));
  activeAsistencias = (activeAsistencias || []).map(f => enrichRowWithCohortKeys(f, grupoKeysLookup));

  // 2. Indexación estricta por 5 Llaves Compuestas + fallback controlado por Código
  const nominas5K = new Map();
  const nominasCode = new Map();
  activePostulantes.forEach(n => {
    const code = norm(n.grupo_codigo);
    const cleanCode = cleanGroupCode(n.grupo_codigo);
    const camp = norm(n.campana);
    const per = normPer(n.periodo_reclutado || n.periodo);
    const sem = normSem(n.semana_trabajo || n.semana);
    const seg = normSeg(n.segmento, n.campana);

    if (code) {
      if (!nominasCode.has(code)) nominasCode.set(code, []);
      nominasCode.get(code).push(n);
      if (cleanCode && cleanCode !== code) {
        if (!nominasCode.has(cleanCode)) nominasCode.set(cleanCode, []);
        nominasCode.get(cleanCode).push(n);
      }
    }

    if (per && sem && camp && code) {
      const k5 = build5K(per, sem, seg, camp, code);
      if (!nominas5K.has(k5)) nominas5K.set(k5, []);
      nominas5K.get(k5).push(n);

      if (cleanCode && cleanCode !== code) {
        const k5Clean = build5K(per, sem, seg, camp, cleanCode);
        if (!nominas5K.has(k5Clean)) nominas5K.set(k5Clean, []);
        nominas5K.get(k5Clean).push(n);
      }
    }
  });

  // 3. Indexación de Asistencias por 5 Llaves Compuestas + fallback por Código
  const formAsis5K = new Map();
  const formAsisCode = new Map();
  activeAsistencias.forEach(f => {
    const rawCode = f.grupo_codigo || f.codigo_grupo;
    const code = norm(rawCode);
    const cleanCode = cleanGroupCode(rawCode);
    const camp = norm(f.campana);
    const per = normPer(f.periodo_ingreso_op || f.periodo);
    const sem = normSem(f.semana_trabajo || f.semana_label || f.semana);
    const seg = normSeg(f.segmento, f.campana);

    if (code) {
      if (!formAsisCode.has(code)) formAsisCode.set(code, []);
      formAsisCode.get(code).push(f);
      if (cleanCode && cleanCode !== code) {
        if (!formAsisCode.has(cleanCode)) formAsisCode.set(cleanCode, []);
        formAsisCode.get(cleanCode).push(f);
      }
    }

    if (per && sem && camp && code) {
      const k5 = build5K(per, sem, seg, camp, code);
      if (!formAsis5K.has(k5)) formAsis5K.set(k5, []);
      formAsis5K.get(k5).push(f);

      if (cleanCode && cleanCode !== code) {
        const k5Clean = build5K(per, sem, seg, camp, cleanCode);
        if (!formAsis5K.has(k5Clean)) formAsis5K.set(k5Clean, []);
        formAsis5K.get(k5Clean).push(f);
      }
    }
  });

  const results = [];
  for (const grupoInfo of gruposInfo) {
    const { codigo: grupo_codigo, campana } = grupoInfo;
    const exactCode = norm(grupo_codigo);
    const cleanCode = cleanGroupCode(grupo_codigo);
    const normCamp = norm(campana);
    const groupKey = `${normCamp}|${exactCode}`;
    const cleanGroupKey = `${normCamp}|${cleanCode}`;
    
    let totalNomina = 0;
    let totalDia0 = 0;

    const rawFechaInicio = grupoInfo.fecha_inicio_capacitacion || grupoInfo.fecha_capacitacion || grupoInfo.fecha_registro || grupoInfo.fecha_inicio || grupoInfo.fecha;
    const fechaInicioIso = parseFechaAsistencia(rawFechaInicio);

    // Extracción normalizada de las 5 Llaves de este Grupo
    const targetPeriodo = normPer(grupoInfo.periodo || grupoInfo.periodo_rys);
    const targetSemana = normSem(grupoInfo.semana_label || grupoInfo.semana_trabajo || grupoInfo.semana);
    const targetSegmento = normSeg(grupoInfo.segmento, campana);

    const k5 = build5K(targetPeriodo, targetSemana, targetSegmento, normCamp, exactCode);
    const k5Clean = cleanCode && cleanCode !== exactCode ? build5K(targetPeriodo, targetSemana, targetSegmento, normCamp, cleanCode) : null;
    
    // Prioridad 1: Coincidencia EXACTA por las 5 Llaves Compuestas
    let validNominas = (targetPeriodo && targetSemana && normCamp && (nominas5K.get(k5) || (k5Clean && nominas5K.get(k5Clean)))) || null;

    // Prioridad 2: Si no hubo match 5K exacto (ej. formato de segmento), filtrar candidatos de este código validando estrictamente las 5 Llaves
    if (!validNominas && exactCode && nominasCode.has(exactCode)) {
      const candidates = nominasCode.get(exactCode) || [];
      validNominas = candidates.filter(n => {
        // 1. Periodo: DEBE coincidir
        const nPer = normPer(n.periodo_reclutado || n.periodo);
        if (targetPeriodo && nPer && nPer !== targetPeriodo) return false;

        // 2. Semana: DEBE coincidir
        const nSem = normSem(n.semana_trabajo || n.semana);
        if (targetSemana && nSem && nSem !== targetSemana) return false;

        // 3. Segmento: DEBE coincidir si viene informado
        const nSeg = normSeg(n.segmento, n.campana);
        if (targetSegmento && nSeg && nSeg !== targetSegmento) return false;

        // 4. Campaña: DEBE ser compatible
        if (normCamp && !isCampCompatible(n.campana, campana)) return false;

        return true;
      });
    }
    validNominas = validNominas || [];
      
    // Prioridad 1: Coincidencia EXACTA de Asistencias por las 5 Llaves Compuestas
    let groupFormAsisRaw = (targetPeriodo && targetSemana && normCamp && (formAsis5K.get(k5) || (k5Clean && formAsis5K.get(k5Clean)))) || null;

    // Prioridad 2: Filtrar asistencias por código aplicando estrictamente las 5 llaves y fecha de inicio
    if (!groupFormAsisRaw && exactCode && formAsisCode.has(exactCode)) {
      const candidates = formAsisCode.get(exactCode) || [];
      groupFormAsisRaw = candidates.filter(f => {
        const fPer = normPer(f.periodo_ingreso_op || f.periodo);
        if (targetPeriodo && fPer && fPer !== targetPeriodo) return false;

        const fSem = normSem(f.semana_trabajo || f.semana_label || f.semana);
        if (targetSemana && fSem && fSem !== targetSemana) return false;

        const fSeg = normSeg(f.segmento, f.campana);
        if (targetSegmento && fSeg && fSeg !== targetSegmento) return false;

        if (normCamp && !isCampCompatible(f.campana, campana)) return false;

        // Aislamiento temporal estricto: Las asistencias NUNCA pueden ocurrir antes del inicio de la cohorte
        if (fechaInicioIso) {
          const d = parseFechaAsistencia(f.fecha_registro_asistencia || f.fecha_asistencia);
          if (d && d < fechaInicioIso) return false;
        }

        return true;
      });
    }
    groupFormAsisRaw = groupFormAsisRaw || [];

    // Aislamiento temporal estricto de seguridad: descartar asistencias previas a fecha de inicio
    if (fechaInicioIso && groupFormAsisRaw.length > 0) {
      groupFormAsisRaw = groupFormAsisRaw.filter(f => {
        const d = parseFechaAsistencia(f.fecha_registro_asistencia || f.fecha_asistencia);
        if (d && d < fechaInicioIso) return false;
        return true;
      });
    }

    const effectiveCandidates = validNominas;
    totalNomina = effectiveCandidates.length;
    totalDia0 = effectiveCandidates.filter(n => isAsistioStr(n.dia_0)).length;

    const config = configMap.get(groupKey) || configMap.get(cleanGroupKey) || configMap.get(exactCode) || configMap.get(cleanCode);
    let estado_calibracion = config?.estado_calibracion || 'PENDIENTE';

    // 1. Prioridad: Fecha REAL de la primera asistencia registrada en sala (dato de verdad)
    let fecha_dia1_ref = null;
    if (groupFormAsisRaw.length > 0) {
      let earliestIso = null;
      for (const row of groupFormAsisRaw) {
        const dateVal = row.fecha_registro_asistencia || row.fecha_asistencia;
        if (dateVal) {
          const iso = parseFechaAsistencia(dateVal);
          // Si el grupo tuvo Día 0 en sábado (fechaInicioIso sábado), el Día 1 de formación es la fecha hábil siguiente (lunes)
          const isSabadoInduccion = fechaInicioIso && new Date(fechaInicioIso + 'T12:00:00Z').getUTCDay() === 6 && totalDia0 > 0;
          const minAllowedIso = isSabadoInduccion ? new Date(new Date(fechaInicioIso + 'T12:00:00Z').getTime() + 2 * 86400000).toISOString().substring(0, 10) : fechaInicioIso;
          
          if (iso && (!minAllowedIso || iso >= minAllowedIso) && (!earliestIso || iso < earliestIso)) {
            earliestIso = iso;
          }
        }
      }
      fecha_dia1_ref = earliestIso;
    }

    // 2. Fallback: Configuración o fecha proyectada según capacidad_rys
    if (!fecha_dia1_ref) {
      const cfgDia1 = config?.fecha_dia1;
      // Descartar fechas configuradas en grupos_dia1 que sean anteriores a la apertura de esta cohorte (obsoletas)
      if (cfgDia1 && (!fechaInicioIso || cfgDia1 >= fechaInicioIso)) {
        fecha_dia1_ref = cfgDia1;
      } else if (grupoInfo.fecha_dia_1 && (!fechaInicioIso || grupoInfo.fecha_dia_1 >= fechaInicioIso)) {
        fecha_dia1_ref = grupoInfo.fecha_dia_1;
      }
      
      if (!fecha_dia1_ref && fechaInicioIso) {
        const start = new Date(fechaInicioIso + 'T12:00:00Z');
        if (String(grupo_codigo).startsWith('GPE')) {
          start.setUTCDate(start.getUTCDate() + 1);
          if (start.getUTCDay() === 0) start.setUTCDate(start.getUTCDate() + 1);
        }
        fecha_dia1_ref = start.toISOString().split('T')[0];
      }
    }

    let asist_sala_rec = 0;
    let asist_sala_form = 0;
    let countDescuentos = 0;
    const descuentosGroupList = [];
    const discrepanciasList = [];
    const asistentesSalaList = [];

    if (groupFormAsisRaw.length > 0) {
      const formAsis = groupFormAsisRaw
        .filter(f => (f.fecha_registro_asistencia || f.fecha_asistencia))
        .map(row => {
          return {
            postulante_documento: row.documento || row.postulante_documento,
            sigla_asistencia: row.sigla || row.sigla_asistencia,
            motivo_baja: row.motivo_baja,
            estado: row.estado,
            tipo_reclutado: row.tipo_reclutado,
            fecha_asistencia: parseFechaAsistencia(row.fecha_registro_asistencia || row.fecha_asistencia)
          }
        });

      // Agrupar asistencias del formador por documento limpio (filtrando registros vacíos)
      const formRecordsByDoc = new Map();
      for (const f of formAsis) {
        const d = normDoc(f.postulante_documento);
        if (!d) continue;
        if (!formRecordsByDoc.has(d)) formRecordsByDoc.set(d, []);
        formRecordsByDoc.get(d).push(f);
      }

      const mapRec = new Map();
      effectiveCandidates.forEach(r => {
        const d = normDoc(r.documento);
        if (d) mapRec.set(d, r);
      });

      const allDocs = new Set([...formRecordsByDoc.keys(), ...mapRec.keys()]);
      allDocs.delete('');
      for (const doc of allDocs) {
        const studentRecords = formRecordsByDoc.get(doc) || [];
        const recCandidate = mapRec.get(doc);
        const recAsisItem = recAsisMap.get(`${normCamp}|${exactCode}|${doc}`) || 
                            recAsisMap.get(`${normCamp}|${cleanCode}|${doc}`) || 
                            recAsisMap.get(`${exactCode}|${doc}`);
        
        const d1Records = fecha_dia1_ref ? studentRecords.filter(r => r.fecha_asistencia === fecha_dia1_ref) : [];
        const exactD1Record = d1Records.length > 0 ? d1Records[d1Records.length - 1] : null;
        const latestRecord = studentRecords.length > 0 ? studentRecords[studentRecords.length - 1] : null;
        const formRecord = exactD1Record || latestRecord;

        if (isRecuperoCapCandidate(recCandidate) || isRecuperoCapCandidate(formRecord)) {
          continue; // RECUPERO / AGREGADO CAP no cuenta en Día 1 ni genera discrepancia
        }

        if (!recCandidate) {
          // Alumno agregado directamente por Capacitación / Formación (no provino de la nómina de Reclutamiento).
          continue;
        }

        const d1Sigla = exactD1Record ? String(exactD1Record.sigla_asistencia || exactD1Record.sigla || '').toUpperCase().trim() : '';
        const d1Motivo = exactD1Record ? String(exactD1Record.motivo_baja || '').toUpperCase().trim() : '';

        // Regla Oficial de Calibración Día 1 con 3 Cortes:
        // Reclutamiento hace seguimiento hasta el Corte 2.
        // Si el alumno tuvo asistencia (A / I-OP) en Corte 1 o Corte 2,
        // o si la baja de formación se mandó en el Corte 3 (o con motivo específico de formación: Deserción, Documentos Incompletos, etc.),
        // se considera que Formación SÍ recibió al alumno en Día 1 (isFormAsistencia = true, isBajaForm = false).
        const hadAttendanceInEarlierCuts = d1Records.some(r => {
          const s = String(r.sigla_asistencia || r.sigla || '').toUpperCase().trim();
          const c = Number(r.corte ?? r.corteIndex ?? 0);
          return (s === 'A' || s === 'I-OP') && (c === 1 || c === 2 || !c);
        });

        const isCorte3Drop = exactD1Record && (
          Number(exactD1Record.corte) === 3 || 
          String(exactD1Record.fecha_hora_registro || '').toUpperCase().includes('CORTE 3')
        ) && d1Sigla === 'B';

        const isExplicitTrainingDrop = d1Sigla === 'B' && !isBajaDia1(d1Motivo, d1Sigla, exactD1Record);
        const recValidatedD1 = recCandidate && (String(recCandidate.dia_1 || '').toUpperCase().trim() === 'ASISTIO');

        const droppedD1InSala = exactD1Record && (d1Sigla === 'B' || d1Motivo.includes('BAJA DIA 1')) &&
          !hadAttendanceInEarlierCuts && !isCorte3Drop && !(isExplicitTrainingDrop && recValidatedD1);

        const hasLaterAttendance = studentRecords.some(r => {
          if (!fecha_dia1_ref || r.fecha_asistencia <= fecha_dia1_ref) return false;
          const s = String(r.sigla_asistencia || r.sigla || '').toUpperCase().trim();
          return s === 'A' || s === 'I-OP';
        });

        const isBajaDia1Rec = recCandidate && String(recCandidate.motivo_baja || '').toUpperCase().includes('BAJA DIA 1');

        let isBajaForm = false;
        let isFormAsistencia = false;

        if (exactD1Record) {
          if (droppedD1InSala && !hasLaterAttendance) {
            isFormAsistencia = false;
            isBajaForm = true;
          } else {
            // Regla Oficial: En Día 1 tanto la asistencia (A, I-OP) como las faltas (FI, FJ)
            // de alumnos matriculados cuentan en sala/cohorte de Formación para conciliar con Reclutamiento.
            isFormAsistencia = true;
            isBajaForm = false;
          }
        } else {
          const isCeseRec = recCandidate && String(recCandidate.status_dia_1 || recCandidate.tipo_reclutado || '').toUpperCase().includes('CESE');
          const isBajaRecord = formRecord && (formRecord.sigla_asistencia === 'B' || formRecord.sigla === 'B') && !isCorte3Drop && !hadAttendanceInEarlierCuts;
          isBajaForm = Boolean((isBajaRecord || isBajaDia1Rec || isCeseRec) && !hasLaterAttendance);
          isFormAsistencia = Boolean(formRecord && !isBajaForm);
        }

        const isBajaDia1Direct = Boolean(isBajaForm || isBajaDia1Rec);

        // Regla Oficial: En Día 1 NO hay Descuentos para la cohorte que inicia (son Bajas Día 1).
        // Y los descuentos NUNCA se heredan de capacitaciones pasadas.
        const isDescuentoDoc = !isBajaDia1Direct && (
          (descSet && (
            descSet.has(makeDescuentoKey(doc, normCamp, exactCode)) ||
            descSet.has(makeDescuentoKey(doc, normCamp, cleanCode)) ||
            descSet.has(`${doc}|${normCamp}|${exactCode}`) ||
            descSet.has(`${doc}|${normCamp}|${cleanCode}`) ||
            descSet.has(`${doc}|${exactCode}`) ||
            descSet.has(`${doc}|${cleanCode}`)
          )) ||
          (String(recCandidate?.estado || '').toUpperCase() === 'DESCUENTO' && !isBajaDia1Direct) ||
          (String(recCandidate?.motivo_baja || '').toUpperCase().includes('DESCUENTO') && !isBajaDia1Direct) ||
          (String(formRecord?.estado || '').toUpperCase() === 'DESCUENTO' && !isBajaDia1Direct) ||
          (String(formRecord?.motivo_baja || '').toUpperCase().includes('DESCUENTO') && !isBajaDia1Direct)
        );

        if (isDescuentoDoc) {
          // Regla de Negocio Oficial: El postulante fue justificado/aprobado por Descuento RyS.
          // NO se cuenta a Formación como asistente en sala (no estuvo físicamente),
          // pero SÍ se reconoce a favor de la entrega de Reclutamiento.
          countDescuentos++;
          descuentosGroupList.push({
            documento: doc,
            nombre: `${recCandidate?.apellido_paterno || ''} ${recCandidate?.apellido_materno || ''}, ${recCandidate?.nombres || ''}`.trim() || 'Postulante',
            motivo: recCandidate?.motivo_baja || formRecord?.motivo_baja || 'DESCUENTO APROBADO RYS'
          });
          continue;
        }

        const effectiveAuxSigla = recAsisItem ? (recAsisItem.sigla_final || recAsisItem.sigla_inicial) : null;
        const isAuxAsistencia = effectiveAuxSigla === 'A' || effectiveAuxSigla === 'I-OP';
        const isRecAsistencia = (recCandidate ? isCandidateActiveRec(recCandidate) : false) || isAuxAsistencia;
        
        if (isRecAsistencia) asist_sala_rec++;
        if (isFormAsistencia) asist_sala_form++;

        if (isRecAsistencia && isFormAsistencia) {
          asistentesSalaList.push({
            documento: doc,
            nombre: `${recCandidate?.apellido_paterno || ''} ${recCandidate?.apellido_materno || ''}, ${recCandidate?.nombres || ''}`.trim() || 'Postulante',
            sigla_formador: formRecord?.sigla_asistencia || 'A'
          });
        }

        if (isFormAsistencia !== isRecAsistencia) {
          let displayFormSigla = 'SIN REGISTRO';
          if (isBajaForm) {
            displayFormSigla = 'CESADO (BAJA DÍA 1)';
          } else if (exactD1Record || formRecord) {
            const targetRec = exactD1Record || formRecord;
            const fs = String(targetRec.sigla_asistencia || targetRec.sigla || '').toUpperCase().trim();
            if (isFormadorAsistio(fs) || isFormAsistencia) {
              displayFormSigla = 'ACTIVO';
            } else if (fs === 'FI' || fs === 'F' || fs === 'FALTA') {
              displayFormSigla = 'FALTA (FI)';
            } else if (fs === 'FJ') {
              displayFormSigla = 'FALTA (FJ)';
            } else {
              displayFormSigla = fs || 'FALTA';
            }
          }

          let displayRecSigla = 'SIN REGISTRO';
          if (isRecAsistencia) {
            const stD1 = String(recCandidate?.status_dia_1 || '').toUpperCase().trim();
            if (stD1 === 'AGREGADO') {
              displayRecSigla = 'ASISTIÓ (AGREGADO)';
            } else if (stD1 === 'RECUPERADO') {
              displayRecSigla = 'ASISTIÓ (RECUPERADO)';
            } else {
              displayRecSigla = 'ASISTIÓ';
            }
          } else if (recCandidate) {
            const d1 = String(recCandidate.dia_1 || '').toUpperCase().trim();
            const d0 = String(recCandidate.dia_0 || '').toUpperCase().trim();
            const stD1 = String(recCandidate.status_dia_1 || '').toUpperCase().trim();
            if (stD1.includes('NO PROCEDE') || stD1.includes('DESERTOR')) {
              displayRecSigla = 'NO PROCEDE';
            } else if (d1 === 'FALTA' || d0 === 'FALTA' || d1 === 'F' || d0 === 'F') {
              displayRecSigla = 'FALTA';
            } else {
              displayRecSigla = recCandidate.estado === 'BAJA' ? 'CESADO' : (recCandidate.dia_1 || recCandidate.estado || 'FALTA');
            }
          }

          discrepanciasList.push({
            documento: doc,
            nombre: `${recCandidate?.apellido_paterno || ''} ${recCandidate?.apellido_materno || ''}, ${recCandidate?.nombres || ''}`.trim() || 'Postulante',
            sigla_reclutador: displayRecSigla,
            sigla_formador: displayFormSigla
          });
        }
      }

      // Conciliación Día 1: Compara la coincidencia de asistentes en sala
      const coincideSala = asist_sala_rec === asist_sala_form;
      if (!fecha_dia1_ref || (asist_sala_rec === 0 && asist_sala_form === 0)) {
        estado_calibracion = 'PENDIENTE';
      } else if (coincideSala && (asist_sala_rec > 0 || countDescuentos > 0)) {
        estado_calibracion = 'CALIBRADO';
      } else {
        estado_calibracion = 'DESCALIBRADO';
      }
    } else {
      // El formador aún no ha registrado asistencias en sala para este grupo
      for (const recCandidate of effectiveCandidates) {
        const doc = normDoc(recCandidate.documento);
        const isBajaD1 = recCandidate && (
          String(recCandidate.motivo_baja || '').toUpperCase().includes('BAJA DIA 1') ||
          String(recCandidate.status_dia_1 || '').toUpperCase().includes('CESE') ||
          String(recCandidate.tipo_reclutado || '').toUpperCase().includes('CESE')
        );
        const isDesc = !isBajaD1 && descSet && (
          descSet.has(makeDescuentoKey(doc, normCamp, exactCode)) ||
          descSet.has(makeDescuentoKey(doc, normCamp, cleanCode)) ||
          descSet.has(`${doc}|${normCamp}|${exactCode}`) ||
          descSet.has(`${doc}|${normCamp}|${cleanCode}`) ||
          descSet.has(`${doc}|${exactCode}`) ||
          descSet.has(`${doc}|${cleanCode}`)
        );
        if (isDesc) {
          countDescuentos++;
          continue;
        }
        const recAsisItem = recAsisMap.get(`${normCamp}|${exactCode}|${doc}`) || 
                            recAsisMap.get(`${normCamp}|${cleanCode}|${doc}`) || 
                            recAsisMap.get(`${exactCode}|${doc}`);
        const effectiveAuxSigla = recAsisItem ? (recAsisItem.sigla_final || recAsisItem.sigla_inicial) : null;
        const isAuxAsistencia = effectiveAuxSigla === 'A' || effectiveAuxSigla === 'I-OP';
        const isRecAsistencia = isCandidateActiveRec(recCandidate) || isAuxAsistencia;
        if (isRecAsistencia) asist_sala_rec++;
      }
      estado_calibracion = 'PENDIENTE';
    }

    const totalReclutadorAuditado = asist_sala_rec + countDescuentos;
    const totalFormadorAuditado = asist_sala_form;

    results.push({
      grupo_codigo: grupo_codigo,
      campana: campana || '',
      segmento: grupoInfo.segmento || '',
      periodo: grupoInfo.periodo ? String(grupoInfo.periodo).trim() : '',
      semana_label: grupoInfo.semana_label ? String(grupoInfo.semana_label).trim() : '',
      fecha_inicio: grupoInfo.fecha_registro || grupoInfo.fecha_inicio || grupoInfo.fecha || '',
      fecha_dia1: fecha_dia1_ref || 'No definida',
      estado: estado_calibracion,
      total_nomina: totalNomina,
      total_dia0: totalDia0,
      asist_sala_rec: asist_sala_rec,
      asist_sala_form: asist_sala_form,
      descuentos_count: countDescuentos,
      descuentos_list: descuentosGroupList,
      asistentes_sala_list: asistentesSalaList,
      total_reclutador: totalReclutadorAuditado,
      total_formador: totalFormadorAuditado,
      discrepancias: discrepanciasList,
      discrepancias_count: discrepanciasList.length,
      discrepancia_nominal: false
    });
  }

  return results;
}

/**
 * Cálculo Ultrarrápido de Métricas de Resumen Capacitación en Memoria (O(1) Map indexing).
 * Reutiliza postulantes y asistencias ya cargados en RAM sin consultas redundantes a Supabase.
 */
export async function calculateMetricasResumenCapacitacionFast(gruposInfo, postulantes = [], asistencias = []) {
  if (!gruposInfo || gruposInfo.length === 0) return [];

  // Fallback de seguridad: Si postulantes o asistencias no vienen cargados en memoria, consultar directamente a Supabase
  let effPostulantes = postulantes;
  let effAsistencias = asistencias;

  if (DB_MODE === 'supabase') {
    if (!effPostulantes || effPostulantes.length === 0) {
      try {
        effPostulantes = await fetchPostulantes({ all: true });
      } catch (e) {
        console.warn('Error fetching postulantes fallback:', e);
      }
    }
    if (!effAsistencias || effAsistencias.length === 0) {
      try {
        effAsistencias = await fetchAsistencias();
      } catch (e) {
        console.warn('Error fetching asistencias fallback:', e);
      }
    }
  }

  const norm = (val) => String(val || '').trim().toUpperCase();
  const descSet = await getDescuentosSetGlobal();

  // Helper normalizadores para las 5 Llaves Compuestas
  const normSem = (val) => {
    if (!val) return '';
    const s = String(val).trim().toUpperCase();
    if (['ALL', 'TODAS', 'TODOS', '-', 'NULL', 'UNDEFINED'].includes(s)) return '';
    const num = s.replace(/\D/g, '');
    return num ? `SEM ${parseInt(num, 10)}` : s;
  };

  const normPer = (val) => {
    if (!val) return '';
    const num = String(val).replace(/\D/g, '');
    return num.length >= 6 ? num.slice(0, 6) : num;
  };

  const normSeg = (rawSeg, campana) => {
    let s = String(rawSeg || '').trim().toUpperCase();
    const c = String(campana || '').toUpperCase();

    // 1. EXCEPCIÓN CLAVE: "RETENCIONES FIJA INBOUND" y "RETENCIONES FIJA" pertenecen estrictamente a "CLARO PERU"
    if (c.includes('RETENCIONES FIJA') || c.includes('RETENCION FIJA') || c.includes('FIJA INBOUND')) {
      return 'CLARO PERU';
    }

    // 2. EXCEPCIÓN CLAVE: Campañas de Claro Postpago (incluido CLARO POSTPAGO - CROSS) pertenecen a "CLARO PERU"
    if (c.includes('CLARO POSTPAGO')) {
      return 'CLARO PERU';
    }

    // 3. Campañas exclusivas de CLARO CHILE
    if (c.includes('TUVES') || c.includes('CHILE')) {
      return 'CLARO CHILE';
    }

    // 4. Campañas exclusivas de LIPIGAS
    if (c.includes('LIPIGAS') || c.includes('LIMAGAS')) {
      return 'LIPIGAS';
    }

    // 5. Si ya viene explícito uno de los 5 segmentos oficiales, respetarlo
    if (s === 'CLARO PERU') return 'CLARO PERU';
    if (s === 'CLARO PERU RETENCIONES') return 'CLARO PERU RETENCIONES';
    if (s === 'CLARO PERU OUT') return 'CLARO PERU OUT';
    if (s === 'CLARO CHILE' || s.includes('CHILE')) return 'CLARO CHILE';
    if (s === 'LIPIGAS' || s.includes('LIPIGAS')) return 'LIPIGAS';

    // 6. Fallbacks por palabras clave
    if (
      s.includes('RETENCION') || 
      c.includes('RETENCION') || 
      c.includes('CONTACTADOS') || 
      c.includes('CONTENCI') || 
      c.includes('DESCUENTO') || 
      c.includes('BABYSTING') || 
      c.includes('CONSULTA PREVIA') || 
      c.includes('MI CLARO') || 
      c.includes('ENCUESTAS IZO') ||
      c.includes('CANAL DIGITAL') ||
      c.includes('WSP INBOUND')
    ) {
      return 'CLARO PERU RETENCIONES';
    }
    if (
      s.includes('OUT') || 
      c.includes('OUT') || 
      c.includes('PREVENTIVA') || 
      c.includes('PORTA OUT') || 
      c.includes('RENO OUT') || 
      c.includes('VENTAS OUT') || 
      c.includes('CROSS') ||
      c.includes('MIGRACIONES') ||
      c.includes('UPGRADE') ||
      c.includes('PORTABILIDAD')
    ) {
      return 'CLARO PERU OUT';
    }
    return 'CLARO PERU';
  };

  const isCompatibleCampaign = (campA, campB) => {
    if (!campA || !campB) return false;
    const a = norm(campA);
    const b = norm(campB);
    if (a === b) return true;
    const ca = normCleanCamp(campA);
    const cb = normCleanCamp(campB);
    if (ca === cb) return true;
    if (ca.length >= 6 && cb.length >= 6) {
      if (ca.includes(cb) || cb.includes(ca)) return true;
    }
    return false;
  };

  const build5K = (periodo, semana, segmento, campana, grupo) => {
    const p = normPer(periodo);
    const s = normSem(semana);
    const seg = normSeg(segmento, campana);
    const c = norm(campana);
    const g = norm(grupo);
    return `${p}|${s}|${seg}|${c}|${g}`;
  };

  const normCleanCamp = (val) => String(val || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();

  const grupoKeysLookup = buildGrupoCohortLookup(gruposInfo);
  effPostulantes = (effPostulantes || []).map(n => enrichRowWithCohortKeys(n, grupoKeysLookup));
  effAsistencias = (effAsistencias || []).map(f => enrichRowWithCohortKeys(f, grupoKeysLookup));

  // Indexación Multi-Nivel (5-Llaves Exactas como Nivel 1)
  const nominas5K = new Map();
  const nominasCampCode = new Map();
  const nominasCode = new Map();

  (effPostulantes || []).forEach(n => {
    const code = norm(n.grupo_codigo);
    const camp = norm(n.campana);
    const cleanCamp = normCleanCamp(n.campana);
    const per = normPer(n.periodo_reclutado || n.periodo);
    const sem = normSem(n.semana_trabajo || n.semana);
    const seg = normSeg(n.segmento, n.campana);

    if (code) {
      if (!nominasCode.has(code)) nominasCode.set(code, []);
      nominasCode.get(code).push(n);

      if (camp) {
        const campKey = `${camp}|${code}`;
        if (!nominasCampCode.has(campKey)) nominasCampCode.set(campKey, []);
        nominasCampCode.get(campKey).push(n);
      }
      if (cleanCamp && cleanCamp !== camp) {
        const cleanKey = `${cleanCamp}|${code}`;
        if (!nominasCampCode.has(cleanKey)) nominasCampCode.set(cleanKey, []);
        nominasCampCode.get(cleanKey).push(n);
      }

      if (per && sem && camp) {
        const k5 = build5K(per, sem, seg, camp, code);
        if (!nominas5K.has(k5)) nominas5K.set(k5, []);
        nominas5K.get(k5).push(n);

        if (cleanCamp && cleanCamp !== camp) {
          const k5Clean = build5K(per, sem, seg, cleanCamp, code);
          if (!nominas5K.has(k5Clean)) nominas5K.set(k5Clean, []);
          nominas5K.get(k5Clean).push(n);
        }
      }
    }
  });

  const formAsis5K = new Map();
  const formAsisCampCode = new Map();
  const formAsisCode = new Map();

  (effAsistencias || []).forEach(f => {
    const code = norm(f.grupo_codigo || f.codigo_grupo);
    const camp = norm(f.campana);
    const cleanCamp = normCleanCamp(f.campana);
    const per = normPer(f.periodo_ingreso_op || f.periodo);
    const sem = normSem(f.semana_trabajo || f.semana_label || f.semana);
    const seg = normSeg(f.segmento, f.campana);

    if (code) {
      if (!formAsisCode.has(code)) formAsisCode.set(code, []);
      formAsisCode.get(code).push(f);

      if (camp) {
        const campKey = `${camp}|${code}`;
        if (!formAsisCampCode.has(campKey)) formAsisCampCode.set(campKey, []);
        formAsisCampCode.get(campKey).push(f);
      }
      if (cleanCamp && cleanCamp !== camp) {
        const cleanKey = `${cleanCamp}|${code}`;
        if (!formAsisCampCode.has(cleanKey)) formAsisCampCode.set(cleanKey, []);
        formAsisCampCode.get(cleanKey).push(f);
      }

      if (per && sem && camp) {
        const k5 = build5K(per, sem, seg, camp, code);
        if (!formAsis5K.has(k5)) formAsis5K.set(k5, []);
        formAsis5K.get(k5).push(f);
      }
    }
  });

  const results = [];
  const processedGroups = new Set();
  for (const grupoInfo of gruposInfo) {
    const { codigo: grupo_codigo, campana, fecha_inicio_ojt, area_traslado } = grupoInfo;
    const cleanCode = norm(grupo_codigo);
    const normCamp = norm(campana);
    const cleanCamp = normCleanCamp(campana);
    const perVal = normPer(grupoInfo.periodo_ingreso_op || grupoInfo.periodo);
    const rysPer = normPer(grupoInfo.periodo || grupoInfo.periodo_rys);
    const semVal = normSem(grupoInfo.semana_trabajo || grupoInfo.semana_label || grupoInfo.semana);
    const segVal = normSeg(grupoInfo.segmento, campana);

    // Llave única de deduplicación basada estrictamente en las 5 Llaves
    const groupDedupKey = `${cleanCode}|${normCamp}|${segVal}|${perVal}|${semVal}`;
    if (processedGroups.has(groupDedupKey)) continue;
    processedGroups.add(groupDedupKey);

    const k5 = build5K(perVal, semVal, segVal, normCamp, cleanCode);
    const k5Clean = cleanCamp ? build5K(perVal, semVal, segVal, cleanCamp, cleanCode) : null;
    const k5Rys = rysPer ? build5K(rysPer, semVal, segVal, normCamp, cleanCode) : null;
    const k5RysClean = cleanCamp && rysPer ? build5K(rysPer, semVal, segVal, cleanCamp, cleanCode) : null;
    const campKey = `${normCamp}|${cleanCode}`;
    const cleanCampKey = `${cleanCamp}|${cleanCode}`;
    
    // Obtener nóminas: Prioridad Llaves Compuestas (5K periodo OP o RYS) -> Filtro por Código con 5 Llaves
    let rawNominas = (perVal && semVal && normCamp && (nominas5K.get(k5) || (k5Clean && nominas5K.get(k5Clean))))
      || (rysPer && semVal && normCamp && (nominas5K.get(k5Rys) || (k5RysClean && nominas5K.get(k5RysClean))))
      || null;

    // Si no hubo coincidencia 5K exacta, buscar por código pero validando estrictamente las 5 llaves
    if (!rawNominas && cleanCode && nominasCode.has(cleanCode)) {
      const candidatesByCode = nominasCode.get(cleanCode) || [];
      const matched = candidatesByCode.filter(n => {
        // 1. Campaña: DEBE coincidir o ser compatible (nunca cruzar postulantes de otra campaña)
        if (normCamp && !isCompatibleCampaign(n.campana, campana)) return false;
        // 2. Segmento: DEBE coincidir si viene informado
        const nSeg = normSeg(n.segmento, n.campana);
        if (segVal && nSeg && nSeg !== segVal) return false;
        // 3. Periodo: DEBE pertenecer al periodo de OP o RYS
        const nPer = normPer(n.periodo_reclutado || n.periodo);
        if (perVal && rysPer && nPer && nPer !== perVal && nPer !== rysPer) return false;
        // 4. Semana: DEBE coincidir con la semana si viene informada
        const nSem = normSem(n.semana_trabajo || n.semana);
        if (semVal && nSem && nSem !== semVal) return false;
        return true;
      });
      if (matched.length > 0) rawNominas = matched;
    }
    rawNominas = rawNominas || [];

    const validNominas = descSet.size > 0 
      ? rawNominas.filter(n => !descSet.has(makeDescuentoKey(n.documento, campana, grupo_codigo)))
      : rawNominas;

    const cohortDocSet = new Set(validNominas.map(n => norm(n.documento)).filter(Boolean));
      
    // Obtener asistencias: Prioridad Campaña+Código sin cruzar con campañas distintas
    let groupFormAsisRaw = [];
    if (normCamp && (formAsisCampCode.has(campKey) || formAsisCampCode.has(cleanCampKey))) {
      groupFormAsisRaw = formAsisCampCode.get(campKey) || formAsisCampCode.get(cleanCampKey) || [];
    } else if (cleanCode && formAsisCode.has(cleanCode)) {
      // Si se busca por código, NUNCA cruzar asistencias de otras campañas
      const allForCode = formAsisCode.get(cleanCode) || [];
      groupFormAsisRaw = allForCode.filter(f => {
        const doc = norm(f.documento || f.postulante_documento);
        // Si el postulante ya está registrado en la nómina de esta cohorte
        if (doc && cohortDocSet.has(doc)) return true;
        // O si la campaña es estrictamente compatible
        return isCompatibleCampaign(f.campana, campana);
      });
    }

    // Aislamiento por cohorte: asociar asistencias de los postulantes de esta cohorte,
    // o con pase formal a operación (I-OP) para este grupo y campaña, o cuyas fechas correspondan al periodo
    if (groupFormAsisRaw.length > 0) {
      groupFormAsisRaw = groupFormAsisRaw.filter(f => {
        const doc = norm(f.documento || f.postulante_documento);
        if (cohortDocSet.has(doc)) return true;

        // Si no está en nómina previa, la campaña DEBE ser compatible (prohibido cruzar datos de otra campaña)
        if (!isCompatibleCampaign(f.campana, campana)) return false;
        
        // Si tiene pase formal a operación (I-OP) para este grupo y campaña
        const siglaNorm = String(f.sigla || f.sigla_asistencia || '').trim().toUpperCase();
        if (siglaNorm === 'I-OP') return true;

        // Validar por fecha de asistencia dentro del periodo de OP o de capacitación
        const d = parseFechaAsistencia(f.fecha_registro_asistencia || f.fecha_asistencia);
        if (d && (perVal || rysPer)) {
          const dPer = normPer(d.replace(/\D/g, '').slice(0, 6));
          if (dPer === perVal || dPer === rysPer) return true;
        }
        return false;
      });
    }

    // Aislamiento temporal inteligente para grupos reutilizando códigos:
    // Descartar asistencias que ocurrieron más de 7 días antes de la fecha de apertura/inicio del grupo
    const rawFechaInicio = grupoInfo.fecha_inicio_capacitacion || grupoInfo.fecha_capacitacion || grupoInfo.fecha_registro;
    const fechaInicioIso = parseFechaAsistencia(rawFechaInicio);
    if (fechaInicioIso && groupFormAsisRaw.length > 0) {
      groupFormAsisRaw = groupFormAsisRaw.filter(f => {
        const d = parseFechaAsistencia(f.fecha_registro_asistencia || f.fecha_asistencia);
        if (d && d < fechaInicioIso) {
          const diffDays = (new Date(fechaInicioIso) - new Date(d)) / (1000 * 60 * 60 * 24);
          if (diffDays > 7) return false;
        }
        return true;
      });
    }

    // Si el grupo tiene fecha de ingreso a operación futura respecto a hoy,
    // no puede tener I-OP previos generados antes de su fecha de inicio
    if (fechaInicioIso && groupFormAsisRaw.length > 0) {
      const fechaIngresoOp = parseFechaAsistencia(grupoInfo.fecha_ingreso_op);
      const hoyIso = new Date().toISOString().slice(0, 10);
      if (fechaIngresoOp && fechaIngresoOp > hoyIso) {
        groupFormAsisRaw = groupFormAsisRaw.filter(f => {
          const sigla = String(f.sigla || '').trim().toUpperCase();
          const d = parseFechaAsistencia(f.fecha_registro_asistencia || f.fecha_asistencia);
          if (sigla === 'I-OP' && d && d < fechaInicioIso) return false;
          return true;
        });
      }
    }

    const asisByDoc = new Map();
    for (const r of groupFormAsisRaw) {
      const doc = r.documento || r.postulante_documento;
      if (doc) {
        if (!asisByDoc.has(doc)) asisByDoc.set(doc, []);
        asisByDoc.get(doc).push(r);
      }
    }

    // Unificación y deduplicación estricta por documento (DNI) para postulantes de nómina:
    const candidateMap = new Map();
    for (const n of validNominas) {
      const doc = norm(n.documento);
      if (doc && !candidateMap.has(doc)) {
        candidateMap.set(doc, n);
      }
    }

    // Incorporar cualquier participante que registró asistencia o pase I-OP legítimo en esta cohorte
    // garantizando que coincida la campaña y evaluando su asistencia real (sin forzar día 1 si no asistió)
    if (groupFormAsisRaw.length > 0) {
      groupFormAsisRaw.forEach(r => {
        const doc = norm(r.documento || r.postulante_documento);
        if (doc && !candidateMap.has(doc)) {
          if (descSet.has(makeDescuentoKey(doc, campana, grupo_codigo))) return;
          if (!isCompatibleCampaign(r.campana, campana)) return;

          const sig = String(r.sigla || r.sigla_asistencia || '').trim().toUpperCase();
          const hasAttended = sig === 'A' || sig === 'FJ' || sig === 'I-OP' || sig === 'CAPACITACION' || sig === 'OJT';
          candidateMap.set(doc, {
            documento: doc,
            nombres: r.nombres || '',
            apellido_paterno: r.apellido_paterno || '',
            apellido_materno: r.apellido_materno || '',
            condicion: r.condicion_laboral || r.condicion || grupoInfo.condicion || 'FULL TIME',
            dia_0: hasAttended ? 'ASISTIO' : (sig === 'F' ? 'FALTA' : (sig === 'B' ? 'BAJA' : null)),
            dia_1: hasAttended ? 'ASISTIO' : (sig === 'F' ? 'FALTA' : (sig === 'B' ? 'BAJA' : null)),
            fromAsistencia: true
          });
        }
      });
    }

    const effectiveCandidates = Array.from(candidateMap.values());
    const rawNominaCount = rawNominas.length > 0
      ? (new Set(rawNominas.map(n => norm(n.documento)).filter(Boolean)).size || rawNominas.length)
      : 0;
    const total_nomina = rawNominaCount > 0 ? rawNominaCount : (validNominas.length > 0 ? validNominas.length : effectiveCandidates.length);

    let asistio_dia0 = 0;
    let asistio_dia1 = 0;
    let activos_actuales = 0;
    let activos_ojt = 0;
    let desertores_ct = 0;
    let desertores_ojt = 0;
    let ingresos_iop = 0;
    let ingresos_iop_ftes = 0;
    const docs_iop_detalle = [];
    const asesores_ojt_detalle = [];
    const asesores_activos_detalle = [];

    const estadoGrupo = String(grupoInfo.estado || '').toUpperCase().trim();
    const periodoRys = String(grupoInfo.periodo_rys || '').toUpperCase().trim();
    const isGrupoCancelado = estadoGrupo === 'CANCELADO' || estadoGrupo === 'INACTIVO' || periodoRys === 'CANCELADO' || estadoGrupo.includes('CANCEL') || estadoGrupo.includes('ANULAD');
    const isGrupoCerrado = !isGrupoCancelado && (estadoGrupo === 'CERRADO' || estadoGrupo === 'FINALIZADO' || estadoGrupo === 'CULMINADO');
    const fechaOjtTarget = fecha_inicio_ojt && fecha_inicio_ojt !== 'No definida' ? parseFechaAsistencia(fecha_inicio_ojt) : null;

    for (const n of effectiveCandidates) {
      const doc = norm(n.documento);
      const isDescuentoDoc = descSet.has(makeDescuentoKey(doc, campana, grupo_codigo));
      const records = asisByDoc.get(doc) || [];

      // Tiene I-OP o pase formal a operación con fecha del registro
      const iopRecord = records.find(r => {
        const s = String(r.sigla || r.sigla_asistencia || '').toUpperCase().trim();
        return s === 'I-OP';
      }) || records.find(r => {
        const st = String(r.estado || '').toUpperCase().trim();
        return st === 'INGRESO A OPERACION' || st === 'I-OP' || st === 'INGRESO';
      });

      // FTE real: condición del registro I-OP, luego nómina, luego grupo. FULL TIME = 1, PART TIME = 0.5
      const fteWeight = resolveFteWeight(
        iopRecord?.condicion_laboral,
        iopRecord?.condicion,
        n.condicion,
        n.condicion_laboral,
        grupoInfo.condicion
      );
      const isPartTime = fteWeight === 0.5;

      const tieneIngreso = Boolean(iopRecord);

      if (tieneIngreso) {
        ingresos_iop++;
        ingresos_iop_ftes += fteWeight;

        // Extraer fecha exacta del registro de asistencia con sigla I-OP
        let fechaIop = null;
        const rawDate = iopRecord.fecha_registro_asistencia || iopRecord.fecha_asistencia || iopRecord.fecha;
        if (rawDate) {
          const str = String(rawDate).trim();
          if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
            fechaIop = str.slice(0, 10);
          } else {
            const parts = str.split(/[\/\-]/);
            if (parts.length === 3 && parts[2].length === 4) {
              fechaIop = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
            } else {
              const dt = new Date(str);
              if (!isNaN(dt.getTime())) fechaIop = dt.toISOString().slice(0, 10);
            }
          }
        }

        // Fallback a fecha_ingreso_op del grupo si el registro individual no tuviera fecha
        if (!fechaIop && grupoInfo.fecha_ingreso_op) {
          const str = String(grupoInfo.fecha_ingreso_op).trim();
          if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
            fechaIop = str.slice(0, 10);
          } else {
            const parts = str.split(/[\/\-]/);
            if (parts.length === 3 && parts[2].length === 4) {
              fechaIop = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
            }
          }
        }

        docs_iop_detalle.push({
          documento: doc,
          fte: fteWeight,
          condicion: isPartTime ? 'PART TIME' : 'FULL TIME',
          fecha_iop: fechaIop,
          grupo_codigo,
          campana,
          periodo: grupoInfo.periodo_ingreso_op || grupoInfo.periodo || ''
        });
      }

      // Día 0
      const d0 = String(n.dia_0 || '').toUpperCase().trim();
      const hasD0Attendance = records.some(r => {
        const s = String(r.sigla || r.sigla_asistencia || '').toUpperCase().trim();
        return s === 'A' || s === 'F' || s === 'B' || s === 'I-OP' || s === 'CAPACITACION' || s === 'OJT';
      });
      if (d0 === 'ASISTIO' || d0.includes('FALTA') || d0.includes('BAJA') || hasD0Attendance || tieneIngreso) {
        asistio_dia0++;
      }
      
      // Identificar si tiene baja Día 1 o baja general en registros de Formación
      let isBajaDia1 = false;
      let isBajaGeneral = false;
      let fechaUltimaBaja = null;
      
      if (records.length > 0) {
        const sortedRecords = [...records].sort((a, b) => new Date(a.fecha_registro_asistencia || a.fecha_asistencia || 0) - new Date(b.fecha_registro_asistencia || b.fecha_asistencia || 0));
        const lastRecord = sortedRecords[sortedRecords.length - 1];
        
        const txtEstado = String(lastRecord.estado || '').toUpperCase();
        const txtMotivo = String(lastRecord.motivo_baja || '').toUpperCase();
        const txtSigla = String(lastRecord.sigla || lastRecord.sigla_asistencia || '').toUpperCase().trim();
        const txtObs = String(lastRecord.observacion_estado || '').toUpperCase();
        
        isBajaDia1 = txtMotivo.includes('BAJA DIA 1') || txtEstado.includes('BAJA DIA 1') || txtObs.includes('BAJA DIA 1');
        isBajaGeneral = !isDescuentoDoc && (txtSigla === 'B' || txtMotivo.includes('BAJA') || txtEstado.includes('BAJA') || txtEstado === 'CESADO' || txtEstado === 'INACTIVO');
        if (isBajaGeneral) {
          fechaUltimaBaja = parseFechaAsistencia(lastRecord.fecha_registro_asistencia || lastRecord.fecha_asistencia);
        }
      }

      // Día 1 oficial: Evalúa asistencia real de los alumnos en aula
      let dia1Asistio = false;
      if (groupFormAsisRaw.length > 0 && records.length > 0) {
        const hasAttendanceInClass = records.some(r => {
          const s = String(r.sigla || r.sigla_asistencia || '').toUpperCase().trim();
          return s === 'A' || s === 'FJ' || s === 'I-OP' || s === 'CAPACITACION' || s === 'OJT' || (s === 'B' && !isBajaDia1);
        });
        dia1Asistio = (hasAttendanceInClass || tieneIngreso) && !isBajaDia1;
      } else if (n.dia_1 === 'ASISTIO' || n.dia_1 === 'SI' || n.dia_1 === 'OK' || tieneIngreso) {
        dia1Asistio = !isBajaDia1;
      }

      if (dia1Asistio) {
        asistio_dia1++;
      }

      // Activo en OJT, Desertor en OJT o Desertor en Teoría (CT)?
      // Corte oficial: fecha_inicio_ojt de capacidad_rys. Las bajas de OJT solo cuentan
      // si la fecha de baja es >= esa fecha. I-OP no es "activo en OJT" (ya graduó).
      let isOjtActive = false;
      let isOjtDesertor = false;
      let isCtDesertor = false;
      let attendedInOjt = false;

      const iopDate = iopRecord
        ? parseFechaAsistencia(iopRecord.fecha_registro_asistencia || iopRecord.fecha_asistencia || iopRecord.fecha)
        : '';
      const iopEnVentanaOjt = Boolean(
        tieneIngreso && (!fechaOjtTarget || !iopDate || iopDate >= fechaOjtTarget)
      );
      const bajaEnOjt = Boolean(
        isBajaGeneral && (
          !fechaOjtTarget
            ? false
            : (!fechaUltimaBaja || fechaUltimaBaja >= fechaOjtTarget)
        )
      );

      if (dia1Asistio || tieneIngreso) {
        attendedInOjt = records.some(r => {
          const sigla = String(r.sigla || r.sigla_asistencia || '').toUpperCase().trim();
          const isPresence = sigla === 'A' || sigla === 'FJ' || sigla === 'OJT' || sigla === 'I-OP' || sigla === 'CAPACITACION' || sigla === 'ASISTIO';
          if (!isPresence) return false;
          const rDate = parseFechaAsistencia(r.fecha_registro_asistencia || r.fecha_asistencia || r.fecha);
          if (fechaOjtTarget) {
            return Boolean(rDate && rDate >= fechaOjtTarget);
          }
          return sigla === 'OJT' || sigla === 'I-OP';
        }) || iopEnVentanaOjt;

        if (attendedInOjt) {
          if (iopEnVentanaOjt) {
            // Graduado I-OP: no inflar activos_ojt ni deserción OJT
          } else if (bajaEnOjt) {
            isOjtDesertor = true;
          } else if (!isBajaGeneral) {
            isOjtActive = true;
          } else if (!isBajaDia1) {
            // Baja formal anterior a OJT (aunque luego haya marcas de OJT residuales)
            isCtDesertor = true;
          }
        } else {
          // Flujo aula/WhatsApp: desertor CT = sigla B de formación ANTES de OJT.
          // No contar faltas (FI/FJ) ni "grupo cerrado sin I-OP" como deserción.
          if (isBajaGeneral && !isBajaDia1) {
            isCtDesertor = true;
          }
        }
      }

      if (isOjtActive) {
        activos_ojt++;
      }
      if (isOjtDesertor) {
        desertores_ojt++;
      }
      if (isCtDesertor) {
        desertores_ct++;
      }

      // Activo Actual al Último Corte (sigue activo en teoría o en OJT, no es baja y aún no tiene I-OP)
      const isActivoAlCorte = (dia1Asistio || attendedInOjt) && !isBajaGeneral && !isBajaDia1 && !isDescuentoDoc && !tieneIngreso;
      if (isActivoAlCorte) {
        activos_actuales++;
        const sortedRecords = records && records.length > 0
          ? [...records].sort((a, b) => {
              const da = parseFechaAsistencia(a.fecha_registro_asistencia || a.fecha_asistencia || a.fecha) || '';
              const db = parseFechaAsistencia(b.fecha_registro_asistencia || b.fecha_asistencia || b.fecha) || '';
              return da.localeCompare(db);
            })
          : [];
        const lastRec = sortedRecords.length > 0 ? sortedRecords[sortedRecords.length - 1] : null;
        const ultimaFecha = lastRec ? (lastRec.fecha_registro_asistencia || lastRec.fecha_asistencia || lastRec.fecha || '') : '';
        const grupoYaEnOjt = Boolean(fechaOjtTarget && sortedRecords.some(r => {
          const rDate = parseFechaAsistencia(r.fecha_registro_asistencia || r.fecha_asistencia || r.fecha);
          return rDate && rDate >= fechaOjtTarget;
        }));
        const etapaCalculada = (isOjtActive || attendedInOjt || grupoYaEnOjt) ? 'OJT' : 'AULA / TEORÍA';
        asesores_activos_detalle.push({
          documento: doc,
          nombres: `${n.nombres || ''} ${n.apellido_paterno || ''} ${n.apellido_materno || ''}`.trim() || n.nombre_completo || doc,
          celular: n.celular || n.telefono || '',
          etapa: etapaCalculada,
          is_ojt: isOjtActive || grupoYaEnOjt,
          ultima_asistencia: ultimaFecha
        });
      }

      // Registro de métrica individual por asesor en OJT / Tránsito
      if (attendedInOjt) {
        const attendedDates = records
          .map(r => parseFechaAsistencia(r.fecha_registro_asistencia || r.fecha_asistencia || r.fecha))
          .filter(f => /^\d{4}-\d{2}-\d{2}$/.test(f))
          .sort();

        const ojtDates = records
          .filter(r => {
            const sig = String(r.sigla || r.sigla_asistencia || '').toUpperCase().trim();
            const f = parseFechaAsistencia(r.fecha_registro_asistencia || r.fecha_asistencia || r.fecha);
            const isDateInOjt = Boolean(fechaOjtTarget && f && f >= fechaOjtTarget);
            return sig === 'OJT' || sig === 'I-OP' || isDateInOjt;
          })
          .map(r => parseFechaAsistencia(r.fecha_registro_asistencia || r.fecha_asistencia || r.fecha))
          .filter(f => /^\d{4}-\d{2}-\d{2}$/.test(f))
          .sort();

        const fechaInicioAsesorOjt = ojtDates[0] || (fechaOjtTarget ? parseFechaAsistencia(fecha_inicio_ojt) : null) || attendedDates[0] || '';
        let fechaFinAsesorOjt = '';

        if (tieneIngreso) {
          fechaFinAsesorOjt = (docs_iop_detalle[docs_iop_detalle.length - 1]?.fecha_iop) || ojtDates[ojtDates.length - 1] || attendedDates[attendedDates.length - 1] || '';
        } else if (isBajaGeneral) {
          fechaFinAsesorOjt = fechaUltimaBaja || ojtDates[ojtDates.length - 1] || attendedDates[attendedDates.length - 1] || '';
        } else if (isGrupoCerrado) {
          fechaFinAsesorOjt = ojtDates[ojtDates.length - 1] || attendedDates[attendedDates.length - 1] || parseFechaAsistencia(grupoInfo.fecha_ingreso_op) || parseFechaAsistencia(grupoInfo.fecha_fin) || '';
        } else {
          // Asesor actualmente activo en OJT
          fechaFinAsesorOjt = new Date().toISOString().slice(0, 10);
        }

        let dias_ojt = null;
        if (fechaInicioAsesorOjt && fechaFinAsesorOjt) {
          const tStart = new Date(fechaInicioAsesorOjt).getTime();
          const tEnd = new Date(fechaFinAsesorOjt).getTime();
          if (!isNaN(tStart) && !isNaN(tEnd) && tEnd >= tStart) {
            dias_ojt = Math.max(1, Math.round((tEnd - tStart) / (1000 * 60 * 60 * 24)));
          }
        }

        if (!dias_ojt || dias_ojt <= 0) {
          const uniqueDays = new Set(ojtDates.length > 0 ? ojtDates : attendedDates).size;
          dias_ojt = Math.max(1, uniqueDays);
        }

        asesores_ojt_detalle.push({
          documento: doc,
          nombres: `${n.nombres || ''} ${n.apellido_paterno || ''}`.trim(),
          grupo_codigo,
          campana,
          estado_proceso: tieneIngreso ? 'I-OP' : isOjtActive ? 'EN_OJT' : isOjtDesertor ? 'DESERTOR_OJT' : 'EN_AULA',
          fecha_inicio_ojt: fechaInicioAsesorOjt,
          fecha_fin_ojt: fechaFinAsesorOjt,
          dias_ojt,
          tiene_iop: tieneIngreso,
          is_activo_ojt: isOjtActive && !tieneIngreso
        });
      }
    }

    // Formador a cargo de la cohorte
    let formador = String(grupoInfo.formador || grupoInfo.nombre_formador || grupoInfo.usuario_formador || '').trim();
    if (!formador && groupFormAsisRaw.length > 0) {
      const rec = groupFormAsisRaw.find(r => r.nombre_formador || r.formador || r.usuario_formador);
      if (rec) {
        formador = String(rec.nombre_formador || rec.formador || rec.usuario_formador || '').trim();
      }
    }

    // Fecha más reciente en que se guardó asistencia o registro
    let ultima_fecha_asistencia = '';
    if (groupFormAsisRaw.length > 0) {
      const validDates = groupFormAsisRaw
        .map(r => r.fecha_registro_asistencia || r.fecha_asistencia || r.fecha || '')
        .filter(f => Boolean(f) && String(f).trim() !== '')
        .map(f => {
          const str = String(f).trim();
          if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 10);
          const parts = str.split(/[\/\-]/);
          if (parts.length === 3 && parts[2].length === 4) {
            return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
          }
          const dt = new Date(str);
          return isNaN(dt.getTime()) ? str : dt.toISOString().slice(0, 10);
        })
        .filter(Boolean)
        .sort();
      if (validDates.length > 0) {
        ultima_fecha_asistencia = validDates[validDates.length - 1];
      }
    }

    // Fallback 1: Si no hay firmas de asistencia diaria, obtener la fecha más reciente de los postulantes registrados en nómina
    if (!ultima_fecha_asistencia && validNominas.length > 0) {
      const nominaDates = validNominas
        .map(n => n.fecha_ingreso || n.fecha_registro || n.created_at || n.marca_temporal || '')
        .filter(f => Boolean(f) && String(f).trim() !== '')
        .map(f => {
          const str = String(f).trim();
          if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 10);
          const parts = str.split(/[\/\-]/);
          if (parts.length === 3 && parts[2].length === 4) {
            return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
          }
          const dt = new Date(str);
          return isNaN(dt.getTime()) ? str : dt.toISOString().slice(0, 10);
        })
        .filter(Boolean)
        .sort();
      if (nominaDates.length > 0) {
        ultima_fecha_asistencia = nominaDates[nominaDates.length - 1];
      }
    }

    // Fallback 2: Fecha de inicio / registro de la cohorte en capacidad_rys
    if (!ultima_fecha_asistencia) {
      const capDate = grupoInfo.fecha_registro || grupoInfo.fecha_inicio || grupoInfo.fecha || grupoInfo.fecha_inicio_ojt || '';
      if (capDate) {
        const str = String(capDate).trim();
        if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
          ultima_fecha_asistencia = str.slice(0, 10);
        } else {
          const parts = str.split(/[\/\-]/);
          if (parts.length === 3 && parts[2].length === 4) {
            ultima_fecha_asistencia = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
          } else {
            const dt = new Date(str);
            if (!isNaN(dt.getTime())) ultima_fecha_asistencia = dt.toISOString().slice(0, 10);
          }
        }
      }
    }

    // Sede / Local de la cohorte
    let sede = (grupoInfo.sede && String(grupoInfo.sede).trim() !== '-' && String(grupoInfo.sede).trim() !== '')
      ? String(grupoInfo.sede).trim()
      : '';
    if (!sede && validNominas.length > 0) {
      const sDoc = validNominas.find(n => n.sede && String(n.sede).trim() !== '' && String(n.sede).trim() !== '-');
      if (sDoc) sede = String(sDoc.sede).trim();
    }

    const periodoIngresoOp = (() => {
      const direct = String(grupoInfo.periodo_ingreso_op || '').trim()
      if (direct) return direct
      const fecha = String(grupoInfo.fecha_ingreso_op || '').trim()
      const iso = fecha.match(/^(\d{4})-(\d{2})/)
      if (iso) return `${iso[1]}${iso[2]}`
      return ''
    })()

    results.push({
      grupo_codigo,
      campana: campana || '',
      formador: formador || 'Sin Asignar',
      periodo: periodoIngresoOp || (grupoInfo.periodo ? String(grupoInfo.periodo).trim() : ''),
      periodo_ingreso_op: periodoIngresoOp,
      area_traslado: (area_traslado && String(area_traslado).trim() !== '') ? String(area_traslado).trim().toUpperCase() : (grupoInfo.area_traslado ? String(grupoInfo.area_traslado).trim().toUpperCase() : ''),
      semana: grupoInfo.semana_trabajo || grupoInfo.semana_label || grupoInfo.semana || '',
      segmento: grupoInfo.segmento || '',
      sede: sede || 'LIMA',
      ultima_fecha_asistencia: ultima_fecha_asistencia || '-',
      estado: estadoGrupo || 'EN CURSO',
      is_cerrado: isGrupoCerrado,
      is_cancelado: isGrupoCancelado,
      modalidad: (grupoInfo.modalidad || 'PRESENCIAL').toUpperCase().trim(),
      requerimiento: (() => {
        const rawArea = String(area_traslado || grupoInfo.area_traslado || '').trim().toUpperCase();
        if (isGrupoCancelado || rawArea !== 'RECLUTAMIENTO') return 0;
        const rawRq = (grupoInfo.rq_ftes_solicitado !== undefined && grupoInfo.rq_ftes_solicitado !== null && grupoInfo.rq_ftes_solicitado !== '')
          ? Number(grupoInfo.rq_ftes_solicitado)
          : (grupoInfo.rq_solicitado !== undefined && grupoInfo.rq_solicitado !== null && grupoInfo.rq_solicitado !== '' ? Number(grupoInfo.rq_solicitado) : 0);
        return rawRq > 0 ? rawRq : 0;
      })(),
      rq_solicitado: (() => {
        const rawArea = String(area_traslado || grupoInfo.area_traslado || '').trim().toUpperCase();
        if (isGrupoCancelado || rawArea !== 'RECLUTAMIENTO') return 0;
        const rawRq = (grupoInfo.rq_ftes_solicitado !== undefined && grupoInfo.rq_ftes_solicitado !== null && grupoInfo.rq_ftes_solicitado !== '')
          ? Number(grupoInfo.rq_ftes_solicitado)
          : (grupoInfo.rq_solicitado !== undefined && grupoInfo.rq_solicitado !== null && grupoInfo.rq_solicitado !== '' ? Number(grupoInfo.rq_solicitado) : 0);
        return rawRq > 0 ? rawRq : 0;
      })(),
      rq_ftes_solicitado: (() => {
        const rawArea = String(area_traslado || grupoInfo.area_traslado || '').trim().toUpperCase();
        if (isGrupoCancelado || rawArea !== 'RECLUTAMIENTO') return 0;
        const rawRq = (grupoInfo.rq_ftes_solicitado !== undefined && grupoInfo.rq_ftes_solicitado !== null && grupoInfo.rq_ftes_solicitado !== '')
          ? Number(grupoInfo.rq_ftes_solicitado)
          : Number(grupoInfo.rq_solicitado || 0);
        return rawRq > 0 ? rawRq : 0;
      })(),
      total_nomina,
      asistio_dia0,
      asistio_dia1,
      activos_actuales,
      asesores_activos_detalle,
      activos_ojt,
      desertores_ct,
      desertores_ojt,
      ingresos_iop,
      ingresos_iop_ftes,
      docs_iop_detalle,
      asesores_ojt_detalle,
      fecha_inicio_ojt: grupoInfo.fecha_inicio_ojt || '',
      fecha_ingreso_op: grupoInfo.fecha_ingreso_op || '',
      asistencias_raw: groupFormAsisRaw || []
    });
  }

  return results;
}

export async function getMetricasReporteCalibracionBulk(gruposInfo) {
  if (DB_MODE !== 'supabase' || !gruposInfo || gruposInfo.length === 0) return []
  
  const codigos = [...new Set(gruposInfo.map(g => g.codigo))];
  const campanas = [...new Set(gruposInfo.map(g => g.campana))];

  // Fetch nominas with pagination
  let nominasAll = [];
  let nFrom = 0;
  const nStep = 1000;
  let nHasMore = true;
  while(nHasMore) {
    const { data } = await supabase.from('nominas')
      .select('documento, dia_0, dia_1, activo, grupo_codigo, campana')
      .in('grupo_codigo', codigos)
      .in('campana', campanas)
      .range(nFrom, nFrom + nStep - 1);
    if(data && data.length > 0) {
      nominasAll = nominasAll.concat(data);
      if(data.length < nStep) nHasMore = false;
      else nFrom += nStep;
    } else nHasMore = false;
  }

  // Fetch configs
  const { data: configAll } = await supabase.from('grupos_dia1')
    .select('estado_calibracion, fecha_dia1, grupo_codigo, campana')
    .in('grupo_codigo', codigos)
    .in('campana', campanas);

  // Fetch consolidado with pagination
  let formAsisAll = [];
  let fFrom = 0;
  const fStep = 1000;
  let fHasMore = true;
  while(fHasMore) {
    const { data } = await supabase.from('consolidado_asistencias')
      .select('documento, fecha_registro_asistencia, sigla, motivo_baja, estado, codigo_grupo, campana')
      .in('codigo_grupo', codigos)
      .in('campana', campanas)
      .range(fFrom, fFrom + fStep - 1);
    if(data && data.length > 0) {
      formAsisAll = formAsisAll.concat(data);
      if(data.length < fStep) fHasMore = false;
      else fFrom += fStep;
    } else fHasMore = false;
  }

  const descSet = await getDescuentosSetGlobal();

  const configMap = new Map();
  if (configAll) {
    configAll.forEach(c => {
      configMap.set(`${c.campana}|${c.grupo_codigo}`, c);
    });
  }

  const nominasGrouped = new Map();
  if (nominasAll) {
    nominasAll.forEach(n => {
      const key = `${n.campana}|${n.grupo_codigo}`;
      if (!nominasGrouped.has(key)) nominasGrouped.set(key, []);
      nominasGrouped.get(key).push(n);
    });
  }

  const formAsisGrouped = new Map();
  if (formAsisAll) {
    formAsisAll.forEach(f => {
      const key = `${f.campana}|${f.codigo_grupo}`;
      if (!formAsisGrouped.has(key)) formAsisGrouped.set(key, []);
      formAsisGrouped.get(key).push(f);
    });
  }

  const results = [];
  for (const grupoInfo of gruposInfo) {
    const { codigo: grupo_codigo, campana } = grupoInfo;
    const groupKey = `${campana}|${grupo_codigo}`;
    
    let totalNomina = 0;
    let totalDia0 = 0;
    let countRec = 0;
    
    const nominas = nominasGrouped.get(groupKey) || [];
    const validNominas = nominas;
      
    totalNomina = validNominas.length;
    totalDia0 = validNominas.filter(n => String(n.dia_0).toUpperCase().trim() === 'ASISTIO').length;
    const groupFormAsisRaw = formAsisGrouped.get(groupKey) || [];

    const bajasDia1Set = new Set();
    for (const r of groupFormAsisRaw) {
      const doc = r.documento || r.postulante_documento;
      const m = String(r.motivo_baja || '').toUpperCase();
      const e = String(r.estado || '').toUpperCase();
      const s = String(r.sigla || r.sigla_asistencia || '').toUpperCase();
      if (m.includes('BAJA DIA 1') || e.includes('BAJA DIA 1') || (s === 'B' && m.includes('BAJA'))) {
        if (doc) bajasDia1Set.add(doc);
      }
    }

    for (const n of validNominas) {
      if (isCandidateActiveRec(n)) {
        const isBajaDia1 = bajasDia1Set.has(n.documento);
        const isDesc = (descSet && (
                         descSet.has(n.documento) || 
                         descSet.has(`DNI:${n.documento}`) ||
                         descSet.has(makeDescuentoKey(n.documento, campana, grupo_codigo))
                       )) ||
                       String(n.estado || '').toUpperCase() === 'DESCUENTO' ||
                       String(n.motivo_baja || '').toUpperCase().includes('DESCUENTO');
        if (!isBajaDia1 || isDesc) {
          countRec++;
        }
      }
    }

    const config = configMap.get(groupKey);
    let estado_calibracion = config?.estado_calibracion || 'PENDIENTE';
    let fecha_dia1_ref = config?.fecha_dia1 || null;

    if (!fecha_dia1_ref && groupFormAsisRaw.length > 0) {
       let earliestIso = null;
       
       for (const row of groupFormAsisRaw) {
         if (row.fecha_registro_asistencia) {
            const iso = parseFechaAsistencia(row.fecha_registro_asistencia);
            if (iso && (!earliestIso || iso < earliestIso)) {
              earliestIso = iso;
            }
         }
       }
       fecha_dia1_ref = earliestIso;
    }

    let countForm = 0;
    if (fecha_dia1_ref) {
      const formAsis = groupFormAsisRaw.filter(f => f.fecha_registro_asistencia).map(row => {
        return {
          postulante_documento: row.documento,
          sigla_asistencia: row.sigla,
          motivo_baja: row.motivo_baja,
          estado: row.estado,
          fecha_asistencia: parseFechaAsistencia(row.fecha_registro_asistencia)
        }
      });

      const mapFormFull = new Map();
      for (const f of formAsis) {
        const doc = f.postulante_documento;
        if (fecha_dia1_ref) {
          if (f.fecha_asistencia === fecha_dia1_ref) {
            mapFormFull.set(doc, f);
          }
        } else {
          if (!mapFormFull.has(doc)) {
            mapFormFull.set(doc, f);
          }
        }
      }

      const mapRec = new Map(validNominas.map(r => [r.documento, r]))
      const allDocs = new Set([...mapFormFull.keys(), ...mapRec.keys()])
      allDocs.delete('')
      let isCalibrated = true
      for (const doc of allDocs) {
        const formRecord = mapFormFull.get(doc)
        const recCandidate = mapRec.get(doc) 

        if (isRecuperoCapCandidate(recCandidate) || isRecuperoCapCandidate(formRecord)) {
          continue; // RECUPERO / AGREGADO CAP no se contabiliza en Día 1
        }

        if (!recCandidate) {
          // Alumno agregado directamente por Capacitación / Formación (no provino de la nómina de Reclutamiento).
          continue;
        }

        const isBajaDia1 = bajasDia1Set.has(doc) ||
          (recCandidate && (
            String(recCandidate.motivo_baja || '').toUpperCase().includes('BAJA DIA 1') ||
            String(recCandidate.status_dia_1 || '').toUpperCase().includes('CESE') ||
            String(recCandidate.tipo_reclutado || '').toUpperCase().includes('CESE')
          )) ||
          (formRecord && (
            String(formRecord.motivo_baja || '').toUpperCase().includes('BAJA DIA 1') ||
            String(formRecord.tipo_reclutado || '').toUpperCase().includes('CESE')
          ));

        // Regla Oficial: En Día 1 NO hay Descuentos para la cohorte que inicia (son Bajas Día 1).
        // Y los descuentos NUNCA se heredan de capacitaciones pasadas.
        const isDescuentoDoc = !isBajaDia1 && (
          (descSet && (
            descSet.has(makeDescuentoKey(doc, campana, grupo_codigo)) ||
            descSet.has(`${doc}|${cleanGroupCode(grupo_codigo)}`) ||
            descSet.has(`${doc}|${normalizeGPE(grupo_codigo)}`)
          )) ||
          (String(recCandidate?.estado || '').toUpperCase() === 'DESCUENTO' && !isBajaDia1) ||
          (String(recCandidate?.motivo_baja || '').toUpperCase().includes('DESCUENTO') && !isBajaDia1) ||
          (String(formRecord?.estado || '').toUpperCase() === 'DESCUENTO' && !isBajaDia1) ||
          (String(formRecord?.motivo_baja || '').toUpperCase().includes('DESCUENTO') && !isBajaDia1)
        );

        if (isDescuentoDoc) {
          countForm++;
          continue;
        }
        
        const formSigla = formRecord ? formRecord.sigla_asistencia : 'Sin registro'
        
        // Formador: Cuenta a todos los aptos/activos recibidos (incluso con falta), salvo los que fueron Baja Día 1
        const isFormAsistencia = Boolean(formRecord && !isBajaDia1);

        const isRecAsistencia = recCandidate ? isCandidateActiveRec(recCandidate) : false;
        
        if (isFormAsistencia) countForm++;

        if (isFormAsistencia !== isRecAsistencia) {
          isCalibrated = false
        }
      }

      if (!fecha_dia1_ref || (countRec === 0 && countForm === 0)) {
        estado_calibracion = 'PENDIENTE';
      } else if (countRec !== countForm || !isCalibrated) {
        estado_calibracion = 'DESCALIBRADO';
      } else if (countRec > 0 && countForm > 0 && isCalibrated && countRec === countForm) {
        estado_calibracion = 'CALIBRADO';
      } else {
        estado_calibracion = 'PENDIENTE';
      }
    } else {
      estado_calibracion = countRec > 0 ? 'DESCALIBRADO' : 'PENDIENTE';
    }

    results.push({
      grupo_codigo: grupo_codigo,
      campana: campana || '',
      segmento: grupoInfo.segmento || '',
      periodo: grupoInfo.periodo ? String(grupoInfo.periodo).trim() : '',
      semana_label: grupoInfo.semana_label ? String(grupoInfo.semana_label).trim() : '',
      fecha_inicio: grupoInfo.fecha_inicio || '',
      fecha_dia1: fecha_dia1_ref || 'No definida',
      estado: estado_calibracion,
      total_nomina: totalNomina,
      total_dia0: totalDia0,
      total_reclutador: countRec,
      total_formador: countForm
    });
  }

  return results;
}

export async function getMetricasResumenCapacitacion(gruposInfo) {
  if (DB_MODE !== 'supabase' || !gruposInfo || gruposInfo.length === 0) return [];
  
  // QW-4: Cache dinámico por conjunto de grupos consultados (TTL: 3 min)
  const cacheKey = 'resumen_cap_' + [...new Set(gruposInfo.map(g => `${g.campana || ''}_${g.codigo || ''}`))].sort().join(',');

  return withCache(cacheKey, 180000, async () => {
    const codigos = [...new Set(gruposInfo.map(g => g.codigo))];
    const campanas = [...new Set(gruposInfo.map(g => g.campana))];

    // Set de pares (campana|codigo) válidos para filtrar combinaciones cartesianas
    const validPairs = new Set(gruposInfo.map(g => `${g.campana || ''}|${g.codigo || ''}`));

    // Parallel fetch for ultra-fast response (<500ms instead of 5-6s)
    const [nominasAll, formAsisAll, descSet] = await Promise.all([
      (async () => {
        let all = [];
        let from = 0;
        const step = 5000;
        let hasMore = true;
        while (hasMore) {
          const { data } = await supabase.from('nominas')
            .select('documento, dia_0, dia_1, activo, grupo_codigo, campana')
            .in('grupo_codigo', codigos)
            .in('campana', campanas)
            .range(from, from + step - 1);
          if (data && data.length > 0) {
            const filtered = data.filter(n => validPairs.has(`${n.campana || ''}|${n.grupo_codigo || ''}`));
            all = all.concat(filtered);
            if (data.length < step) hasMore = false;
            else from += step;
          } else hasMore = false;
        }
        return all;
      })(),
      (async () => {
        let all = [];
        let from = 0;
        const step = 5000;
        let hasMore = true;
        while (hasMore) {
          const { data } = await supabase.from('consolidado_asistencias')
            .select('documento, fecha_registro_asistencia, sigla, motivo_baja, codigo_grupo, campana, estado')
            .in('codigo_grupo', codigos)
            .in('campana', campanas)
            .range(from, from + step - 1);
          if (data && data.length > 0) {
            const filtered = data.filter(f => validPairs.has(`${f.campana || ''}|${f.codigo_grupo || ''}`));
            all = all.concat(filtered);
            if (data.length < step) hasMore = false;
            else from += step;
          } else hasMore = false;
        }
        return all;
      })(),
      getDescuentosSetGlobal()
    ]);

  const nominasGrouped = new Map();
  if (nominasAll) {
    nominasAll.forEach(n => {
      const key = `${n.campana}|${n.grupo_codigo}`;
      if (!nominasGrouped.has(key)) nominasGrouped.set(key, []);
      nominasGrouped.get(key).push(n);
    });
  }

  const formAsisGrouped = new Map();
  if (formAsisAll) {
    formAsisAll.forEach(f => {
      const key = `${f.campana}|${f.codigo_grupo}`;
      if (!formAsisGrouped.has(key)) formAsisGrouped.set(key, []);
      formAsisGrouped.get(key).push(f);
    });
  }

  const results = [];
  for (const grupoInfo of gruposInfo) {
    const { codigo: grupo_codigo, campana, fecha_inicio_ojt } = grupoInfo;
    const groupKey = `${campana}|${grupo_codigo}`;
    
    const nominas = nominasGrouped.get(groupKey) || [];
    const validNominas = descSet.size > 0 
      ? nominas.filter(n => !descSet.has(makeDescuentoKey(n.documento, campana, grupo_codigo)))
      : nominas;
      
    const total_nomina = validNominas.length;
    const groupFormAsisRaw = formAsisGrouped.get(groupKey) || [];

    let asistio_dia0 = 0;
    let asistio_dia1 = 0;

    for (const n of validNominas) {
      const doc = n.documento;
      const records = groupFormAsisRaw.filter(r => (r.documento || r.postulante_documento) === doc);
      const tieneIngreso = records.some(r => String(r.sigla || r.sigla_asistencia).toUpperCase().trim() === 'I-OP');

      const d0 = String(n.dia_0 || '').toUpperCase().trim();
      if (d0 === 'ASISTIO' || d0.includes('FALTA') || d0.includes('BAJA') || tieneIngreso) {
        asistio_dia0++;
      }

      const d1 = String(n.dia_1 || '').toUpperCase().trim();
      const hasD1Nomina = Boolean(d1) && d1 !== 'NO' && d1 !== 'CANCELADO' && d1 !== 'DESCARTADO';
      const hasD1Attendance = records.some(r => {
        const s = String(r.sigla || r.sigla_asistencia || '').toUpperCase().trim();
        return s === 'A' || s === 'F' || s === 'B' || s === 'I-OP' || s === 'CAPACITACION';
      });

      if (d1 === 'ASISTIO' || d1.includes('FALTA') || d1.includes('BAJA') || hasD1Nomina || hasD1Attendance || tieneIngreso) {
        asistio_dia1++;
      }
    }

    const estadoGrupo = String(grupoInfo.estado || '').toUpperCase().trim();
    const periodoRys = String(grupoInfo.periodo_rys || '').toUpperCase().trim();
    const isGrupoCerrado = estadoGrupo === 'CERRADO' || estadoGrupo === 'CANCELADO' || estadoGrupo === 'FINALIZADO' || estadoGrupo === 'CULMINADO' || periodoRys === 'CANCELADO';

    let activos_actuales = 0;
    
    // Activos en OJT y Cantidad de Ingresos (I-OP)
    let activos_ojt = 0;
    let ingresos_iop = 0;

    const docs = [...new Set(validNominas.map(n => n.documento))];
    const targetOjtDate = fecha_inicio_ojt ? new Date(fecha_inicio_ojt).getTime() : null;

    for (const doc of docs) {
      const records = groupFormAsisRaw.filter(r => r.documento === doc);
      
      let currentState = '';
      let isBajaDia1 = false;
      if (records.length > 0) {
        const sortedRecords = [...records].sort((a, b) => new Date(a.fecha_registro_asistencia || 0) - new Date(b.fecha_registro_asistencia || 0));
        const lastRecord = sortedRecords[sortedRecords.length - 1];
        currentState = String(lastRecord.estado || '').toUpperCase();
        
        const txtEstado = String(lastRecord.estado || '').toUpperCase();
        const txtMotivo = String(lastRecord.motivo_baja || '').toUpperCase();
        const txtObs = String(lastRecord.observacion_estado || '').toUpperCase();
        
        isBajaDia1 = txtMotivo.includes('BAJA DIA 1') || txtEstado.includes('BAJA DIA 1') || txtObs.includes('BAJA DIA 1');
      }

      // Tiene I-OP?
      const tieneIngreso = records.some(r => String(r.sigla).toUpperCase().trim() === 'I-OP');
      if (tieneIngreso) {
        ingresos_iop++;
      }

      // Activo Actual? (Solo para grupos en curso/abiertos)
      if (!isGrupoCerrado) {
        if (records.length > 0 && currentState === 'ACTIVO' && !isBajaDia1 && !tieneIngreso) {
          activos_actuales++;
        }
      }

      // Activo en OJT?
      if (fecha_inicio_ojt) {
        const targetDateStr = parseFechaAsistencia(fecha_inicio_ojt);

        // Debe tener asistencia como ACTIVO únicamente en esa fecha específica de inicio OJT
        const wasActiveOnOjtDate = records.some(r => {
          if (!r.fecha_registro_asistencia) return false;
          const recordDateStr = parseFechaAsistencia(r.fecha_registro_asistencia);
          
          if (recordDateStr !== targetDateStr) return false;

          const sigla = String(r.sigla || '').toUpperCase().trim();
          const estado = String(r.estado || '').toUpperCase().trim();
          const motivo = String(r.motivo_baja || '').toUpperCase().trim();
          
          const isBaja = sigla === 'B' || motivo.includes('BAJA') || estado.includes('BAJA') || estado === 'CESADO' || estado === 'INACTIVO';
          return estado === 'ACTIVO' && !isBaja;
        });

        // Solo evaluamos su estado en esa fecha OJT y que no sea BAJA DIA 1
        if (wasActiveOnOjtDate && !isBajaDia1) {
          activos_ojt++;
        }
      } else {
        activos_ojt = 0; 
      }
    }

    results.push({
      grupo_codigo,
      campana: campana || '',
      periodo: grupoInfo.periodo || '',
      semana: grupoInfo.semana_trabajo || grupoInfo.semana_label || '',
      segmento: grupoInfo.segmento || '',
      estado: estadoGrupo || 'EN CURSO',
      is_cerrado: isGrupoCerrado,
      modalidad: (grupoInfo.modalidad || 'PRESENCIAL').toUpperCase().trim(),
      fecha_inicio_ojt: fecha_inicio_ojt || 'No definida',
      requerimiento: parseInt(grupoInfo.rq_ftes_solicitado || grupoInfo.rq_solicitado || grupoInfo.meta || grupoInfo.requerimiento || 0) || total_nomina || 0,
      rq_solicitado: parseInt(grupoInfo.rq_ftes_solicitado || grupoInfo.rq_solicitado || grupoInfo.meta || 0) || 0,
      rq_ftes_solicitado: parseInt(grupoInfo.rq_ftes_solicitado || grupoInfo.rq_solicitado || 0) || 0,
      total_nomina,
      asistio_dia0,
      asistio_dia1,
      activos_actuales,
      activos_ojt,
      ingresos_iop,
      asistencias_raw: groupFormAsisRaw || []
    });
  }

    return results;
  });
}

/**
 * Agrupa las métricas calculadas de grupos por modalidad (PRESENCIAL, REMOTO, HIBRIDO).
 * Reutiliza la misma lógica calibrada de getMetricasResumenCapacitacion.
 */
export function agruparMetricasPorModalidad(metricasGrupos) {
  const map = new Map();

  (metricasGrupos || []).forEach(g => {
    const mod = (g.modalidad || 'PRESENCIAL').toUpperCase().trim();
    if (!map.has(mod)) {
      map.set(mod, {
        modalidad: mod,
        label: mod === 'REMOTO' ? 'Remoto' : mod === 'PRESENCIAL' ? 'Presencial' : mod,
        total_nomina: 0,
        asistio_dia0: 0,
        asistio_dia1: 0,
        activos_ojt: 0,
        ingresos_iop: 0,
        activos_actuales: 0,
        grupos_count: 0
      });
    }
    const acc = map.get(mod);
    acc.total_nomina += g.total_nomina || 0;
    acc.asistio_dia0 += g.asistio_dia0 || 0;
    acc.asistio_dia1 += g.asistio_dia1 || 0;
    acc.activos_ojt += g.activos_ojt || 0;
    acc.ingresos_iop += g.ingresos_iop || 0;
    acc.activos_actuales += g.activos_actuales || 0;
    acc.grupos_count += 1;
  });

  return Array.from(map.values()).map(m => {
    const retencionDia1 = m.asistio_dia0 > 0 ? Math.round((m.asistio_dia1 / m.asistio_dia0) * 1000) / 10 : 0;
    const conversionIopVsNomina = m.total_nomina > 0 ? Math.round((m.ingresos_iop / m.total_nomina) * 1000) / 10 : 0;
    const conversionIopVsDia1 = m.asistio_dia1 > 0 ? Math.round((m.ingresos_iop / m.asistio_dia1) * 1000) / 10 : 0;
    const asistenciaDia0 = m.total_nomina > 0 ? Math.round((m.asistio_dia0 / m.total_nomina) * 1000) / 10 : 0;
    const retencionActualVsNomina = m.total_nomina > 0 ? Math.round((m.activos_actuales / m.total_nomina) * 1000) / 10 : 0;

    return {
      ...m,
      pct_asistencia_dia0: asistenciaDia0,
      pct_retencion_dia1: retencionDia1,
      pct_conversion_iop_nomina: conversionIopVsNomina,
      pct_conversion_iop_dia1: conversionIopVsDia1,
      pct_retencion_actual: retencionActualVsNomina
    };
  });
}

/**
 * Retorna las métricas agrupadas por modalidad con caché (TTL: 3 min)
 */
export async function getMetricasPorModalidad(gruposInfo) {
  if (DB_MODE !== 'supabase' || !gruposInfo || gruposInfo.length === 0) return [];
  
  const cacheKey = 'metricas_modalidad_' + [...new Set(gruposInfo.map(g => `${g.campana || ''}_${g.codigo || ''}`))].sort().join(',');

  return withCache(cacheKey, 180000, async () => {
    const metricas = await getMetricasResumenCapacitacion(gruposInfo);
    return agruparMetricasPorModalidad(metricas);
  });
}

export async function fetchModulePermissions() {
  return withCache('module_permissions', 600000, async () => {
    const { data, error } = await supabase.from('module_permissions').select('*')
    if (error) {
      console.error('Error fetching module_permissions:', error)
      return []
    }
    return data || []
  })
}

export async function updateModulePermissions(moduleId, roles) {
  const { error } = await supabase
    .from('module_permissions')
    .upsert({ module_id: moduleId, roles })
  
  if (error) throw error
  invalidateCache('module_permissions')
  return true
}
export function parseFechaAsistencia(raw) {
  if (!raw) return '';
  raw = String(raw).trim();
  if (raw.includes('/')) {
    const parts = raw.split('/');
    if (parts.length === 3) {
      if (parts[2].length === 4) {
        return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
      }
      if (parts[0].length === 4) {
        return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
      }
    }
  } else if (raw.includes('-')) {
    const parts = raw.split('-');
    if (parts.length === 3) {
      if (parts[0].length === 4) {
        return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].substring(0, 2).padStart(2, '0')}`;
      }
      if (parts[2].length >= 4) {
        return `${parts[2].substring(0, 4)}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
      }
    }
    return raw.substring(0, 10);
  }
  return raw;
}


// ───────────────────────────────────────────────────────────────────────
// PAGOS DE CAPACITACIÓN
// ───────────────────────────────────────────────────────────────────────

export async function fetchConfigPagosGrupo() {
  const configsMap = new Map();
  
  if (DB_MODE === 'supabase') {
    // 1. Leer de 'propuestas' (tabla maestra oficial de Reclutamiento)
    try {
      const { data: propMaster, error: masterErr } = await supabase
        .from('propuestas')
        .select('*')
        .order('created_at', { ascending: false });

      if (!masterErr && propMaster && propMaster.length > 0) {
        for (const p of propMaster) {
          const grp = String(p.grupo || p.grupo_codigo || '').toUpperCase().trim();
          const camp = String(p.campana || '').toUpperCase().trim();
          const per = String(p.periodoCapa || p.periodo || '').toUpperCase().trim();
          const sem = String(p.semana || p.semana_trabajo || '').toUpperCase().trim();
          const seg = String(p.segmento || '').toUpperCase().trim();
          const cod = String(p.cod || `${camp} - ${grp}`).toUpperCase().trim();
          const grupoCodigo = grp || cod;

          const pDia = parseFloat(p.pagoCapaPorDia ?? p.pagoPorDia ?? p.monto_dia_capa) || 0;
          const dCapa = parseInt(p.diasCapa ?? p.dias_capa) || 0;
          const pComp = parseFloat(p.pagoCapaTotal ?? p.pagoCompleto) || (pDia * dCapa);

          const m1Bvda = parseFloat(p.bBienvenidaM1 ?? p.bonoBienvenidaM1 ?? p.bono_bienvenida) || 0;
          const m2Bvda = parseFloat(p.bBienvenidaM2 ?? p.bonoBienvenidaM2) || 0;
          const m3Bvda = parseFloat(p.bBienvenidaM3 ?? p.bonoBienvenidaM3) || 0;

          const m1Perm = parseFloat(p.bPermM1 ?? p.bonoPermanenciaM1 ?? p.bono_permanencia_total) || 0;
          const m2Perm = parseFloat(p.bPermM2 ?? p.bonoPermanenciaM2) || 0;
          const m3Perm = parseFloat(p.bPermM3 ?? p.bonoPermanenciaM3) || 0;
          const m4Perm = parseFloat(p.bPermM4 ?? p.bonoPermanenciaM4) || 0;

          const m1Asis = parseFloat(p.bAsisM1 ?? p.bonoAsistenciaM1 ?? p.bono_asistencia_perfecta) || 0;
          const m2Asis = parseFloat(p.bAsisM2 ?? p.bonoAsistenciaM2) || 0;
          const m3Asis = parseFloat(p.bAsisM3 ?? p.bonoAsistenciaM3) || 0;

          const cuotasPermCount = [m1Perm, m2Perm, m3Perm, m4Perm].filter(v => v > 0).length || 1;
          const totalPerm = m1Perm + m2Perm + m3Perm + m4Perm;

          const key = `${per}|${sem}|${seg}|${camp}|${grp}`;
          configsMap.set(key, {
            id: p.id,
            propuesta_id: p.id,
            periodoCapa: per,
            semana: sem,
            segmento: seg,
            campana: camp,
            grupo: grp,
            modalidad: p.modalidad || 'REMOTO',
            condicionLaboral: p.condicionLaboral || p.condicion_laboral || 'FULL TIME',
            cod: cod,
            fechaInicioCapa: formatFechaDDMMYYYY(p.inicio || p.fechaInicioCapa || ''),
            ingresoOperacion: formatFechaDDMMYYYY(p.ingresoOperacion || ''),
            mesAfectacionCapa: p.mesAfectacionCapa || '',
            mesAfectacionBonos: p.mesAfectacionBonos || '',
            pagoPorDia: pDia,
            diasCapa: dCapa,
            cantDiasFeriados: parseInt(p.cantDiasFeriados) || 0,
            pagoCompleto: pComp,
            bonoBienvenidaM1: m1Bvda,
            bonoBienvenidaM2: m2Bvda,
            bonoBienvenidaM3: m3Bvda,
            bonoPermanenciaM1: m1Perm,
            bonoPermanenciaM2: m2Perm,
            bonoPermanenciaM3: m3Perm,
            bonoPermanenciaM4: m4Perm,
            bonoAsistenciaM1: m1Asis,
            bonoAsistenciaM2: m2Asis,
            bonoAsistenciaM3: m3Asis,

            // Legacy & compatibilidad
            grupo_codigo: grupoCodigo,
            periodo: per,
            semana_trabajo: sem,
            monto_dia_capa: pDia,
            bono_bienvenida: m1Bvda,
            bono_permanencia_total: totalPerm,
            cuotas_permanencia: cuotasPermCount,
            bono_asistencia_perfecta: m1Asis,
            origen_tabla: 'propuestas',
            notas: p.capacitacionObs || p.notas || 'Propuesta Oficial Reclutamiento'
          });
        }
      }
    } catch (e) {
      console.warn("Error leyendo tabla propuestas en Supabase:", e);
    }

    // 2. Leer de 'propuestas_consolidado' (enriquecer o agregar propuestas rápidas de pagos)
    try {
      const { data: propCons, error: consErr } = await supabase
        .from('propuestas_consolidado')
        .select('*')
        .order('created_at', { ascending: false });

      if (!consErr && propCons && propCons.length > 0) {
        for (const p of propCons) {
          const grp = String(p.grupo || p.grupo_codigo || '').toUpperCase().trim();
          const camp = String(p.campana || '').toUpperCase().trim();
          const per = String(p.periodoCapa || p.periodo || '').toUpperCase().trim();
          const sem = String(p.semana || p.semana_trabajo || '').toUpperCase().trim();
          const seg = String(p.segmento || '').toUpperCase().trim();
          const cod = String(p.cod || `${camp}${grp}`).toUpperCase().trim();
          const grupoCodigo = grp || cod;

          const key = `${per}|${sem}|${seg}|${camp}|${grp}`;

          const m1Bvda = parseFloat(p.bonoBienvenidaM1 || p.bono_bienvenida_m1 || p.bono_bienvenida) || 0;
          const m2Bvda = parseFloat(p.bonoBienvenidaM2 || p.bono_bienvenida_m2) || 0;
          const m3Bvda = parseFloat(p.bonoBienvenidaM3 || p.bono_bienvenida_m3) || 0;

          const m1Perm = parseFloat(p.bonoPermanenciaM1 || p.bono_permanencia_m1 || p.bono_permanencia) || 0;
          const m2Perm = parseFloat(p.bonoPermanenciaM2 || p.bono_permanencia_m2) || 0;
          const m3Perm = parseFloat(p.bonoPermanenciaM3 || p.bono_permanencia_m3) || 0;
          const m4Perm = parseFloat(p.bonoPermanenciaM4 || p.bono_permanencia_m4) || 0;

          const m1Asis = parseFloat(p.bonoAsistenciaM1 || p.bono_asistencia_m1 || p.bono_asistencia_perfecta) || 0;
          const m2Asis = parseFloat(p.bonoAsistenciaM2 || p.bono_asistencia_m2) || 0;
          const m3Asis = parseFloat(p.bonoAsistenciaM3 || p.bono_asistencia_m3) || 0;

          const cuotasPermCount = [m1Perm, m2Perm, m3Perm, m4Perm].filter(v => v > 0).length || 1;
          const totalPerm = m1Perm + m2Perm + m3Perm + m4Perm;

          const pDia = parseFloat(p.pagoPorDia || p.pago_por_dia || p.pagoCapaPorDia) || 0;
          const dCapa = parseInt(p.diasCapa || p.dias_capa) || 0;
          const pComp = parseFloat(p.pagoCompleto || p.pago_completo || p.pagoCapaTotal) || (pDia * dCapa);

          if (configsMap.has(key)) {
            const current = configsMap.get(key);
            configsMap.set(key, {
              ...current,
              consolidado_id: p.id,
              pagoPorDia: pDia || current.pagoPorDia,
              pagoCompleto: pComp || current.pagoCompleto,
              diasCapa: dCapa || current.diasCapa,
              fechaInicioCapa: p.fechaInicioCapa ? formatFechaDDMMYYYY(p.fechaInicioCapa) : current.fechaInicioCapa,
              ingresoOperacion: p.ingresoOperacion ? formatFechaDDMMYYYY(p.ingresoOperacion) : current.ingresoOperacion,
              mesAfectacionCapa: p.mesAfectacionCapa || current.mesAfectacionCapa,
              mesAfectacionBonos: p.mesAfectacionBonos || current.mesAfectacionBonos,
              bonoBienvenidaM1: m1Bvda || current.bonoBienvenidaM1,
              bonoBienvenidaM2: m2Bvda || current.bonoBienvenidaM2,
              bonoBienvenidaM3: m3Bvda || current.bonoBienvenidaM3,
              bonoPermanenciaM1: m1Perm || current.bonoPermanenciaM1,
              bonoPermanenciaM2: m2Perm || current.bonoPermanenciaM2,
              bonoPermanenciaM3: m3Perm || current.bonoPermanenciaM3,
              bonoPermanenciaM4: m4Perm || current.bonoPermanenciaM4,
              bonoAsistenciaM1: m1Asis || current.bonoAsistenciaM1,
              bonoAsistenciaM2: m2Asis || current.bonoAsistenciaM2,
              bonoAsistenciaM3: m3Asis || current.bonoAsistenciaM3,
            });
          } else {
            configsMap.set(key, {
              id: p.id,
              consolidado_id: p.id,
              propuesta_id: p.propuesta_id || null,
              periodoCapa: per,
              semana: sem,
              segmento: seg,
              campana: camp,
              grupo: grp,
              modalidad: p.modalidad || 'REMOTO',
              condicionLaboral: p.condicionLaboral || p.condicion_laboral || 'FULL TIME',
              cod: cod,
              fechaInicioCapa: formatFechaDDMMYYYY(p.fechaInicioCapa || p.fecha_inicio_capa || ''),
              ingresoOperacion: formatFechaDDMMYYYY(p.ingresoOperacion || p.ingreso_operacion || ''),
              mesAfectacionCapa: p.mesAfectacionCapa || p.mes_afectacion_capa || '',
              mesAfectacionBonos: p.mesAfectacionBonos || p.mes_afectacion_bonos || '',
              pagoPorDia: pDia,
              diasCapa: dCapa,
              cantDiasFeriados: parseInt(p.cantDiasFeriados || p.cant_dias_feriados) || 0,
              pagoCompleto: pComp,
              bonoBienvenidaM1: m1Bvda,
              bonoBienvenidaM2: m2Bvda,
              bonoBienvenidaM3: m3Bvda,
              bonoPermanenciaM1: m1Perm,
              bonoPermanenciaM2: m2Perm,
              bonoPermanenciaM3: m3Perm,
              bonoPermanenciaM4: m4Perm,
              bonoAsistenciaM1: m1Asis,
              bonoAsistenciaM2: m2Asis,
              bonoAsistenciaM3: m3Asis,

              grupo_codigo: grupoCodigo,
              periodo: per,
              semana_trabajo: sem,
              monto_dia_capa: pDia,
              bono_bienvenida: m1Bvda,
              bono_permanencia_total: totalPerm,
              cuotas_permanencia: cuotasPermCount,
              bono_asistencia_perfecta: m1Asis,
              origen_tabla: 'propuestas_consolidado',
              notas: p.notas || 'Propuesta de Grupo Integrada'
            });
          }
        }
      }
    } catch (e) {
      console.warn("Error leyendo propuestas_consolidado en Supabase:", e);
    }
  }

  // 3. Fallback a LocalStorage si no hay datos
  if (configsMap.size === 0) {
    initLocalStorageDb();
    const local = getFromStorage('propuestas_consolidado') || getFromStorage('propuestas') || getFromStorage('config_pagos_grupo') || [];
    local.forEach(l => {
      const k = `${l.periodoCapa || l.periodo}|${l.semana || l.semana_trabajo}|${l.segmento}|${l.campana}|${l.grupo || l.grupo_codigo}`;
      configsMap.set(k, l);
    });
  }

  const configs = Array.from(configsMap.values());
  return configs.sort((a, b) => (a.grupo || a.grupo_codigo || '').localeCompare(b.grupo || b.grupo_codigo || ''));
}

export async function upsertConfigPagoGrupo(config) {
  const grp = String(config.grupo || config.grupo_codigo || '').toUpperCase().trim();
  const camp = String(config.campana || '').trim();
  const codUnico = String(config.cod || `${camp}${grp}`.replace(/\s+/g, '')).toUpperCase().trim();

  const pPorDia = parseFloat(config.pagoPorDia ?? config.monto_dia_capa) || 0;
  const dCapa = parseInt(config.diasCapa) || 0;
  const pComp = parseFloat(config.pagoCompleto) || (pPorDia * dCapa);

  const payloadConsolidado = {
    periodoCapa: String(config.periodoCapa || config.periodo || '').trim(),
    semana: String(config.semana || config.semana_trabajo || '').trim(),
    segmento: String(config.segmento || '').trim(),
    campana: camp,
    grupo: grp,
    modalidad: String(config.modalidad || 'REMOTO').toUpperCase().trim(),
    condicionLaboral: String(config.condicionLaboral || 'FULL TIME').toUpperCase().trim(),
    cod: codUnico,
    fechaInicioCapa: formatFechaDDMMYYYY(config.fechaInicioCapa || ''),
    ingresoOperacion: formatFechaDDMMYYYY(config.ingresoOperacion || ''),
    mesAfectacionCapa: String(config.mesAfectacionCapa || '').trim(),
    mesAfectacionBonos: String(config.mesAfectacionBonos || '').trim(),
    pagoPorDia: pPorDia,
    diasCapa: dCapa,
    cantDiasFeriados: parseInt(config.cantDiasFeriados) || 0,
    pagoCompleto: pComp,
    bonoBienvenidaM1: parseFloat(config.bonoBienvenidaM1 ?? config.bono_bienvenida) || 0,
    bonoBienvenidaM2: parseFloat(config.bonoBienvenidaM2) || 0,
    bonoBienvenidaM3: parseFloat(config.bonoBienvenidaM3) || 0,
    bonoPermanenciaM1: parseFloat(config.bonoPermanenciaM1 ?? config.bono_permanencia_total) || 0,
    bonoPermanenciaM2: parseFloat(config.bonoPermanenciaM2) || 0,
    bonoPermanenciaM3: parseFloat(config.bonoPermanenciaM3) || 0,
    bonoPermanenciaM4: parseFloat(config.bonoPermanenciaM4) || 0,
    bonoAsistenciaM1: parseFloat(config.bonoAsistenciaM1 ?? config.bono_asistencia_perfecta) || 0,
    bonoAsistenciaM2: parseFloat(config.bonoAsistenciaM2) || 0,
    bonoAsistenciaM3: parseFloat(config.bonoAsistenciaM3) || 0
  };

  const payloadPropuestas = {
    titulo: config.titulo || `${camp} - ${grp}`,
    periodoCapa: payloadConsolidado.periodoCapa,
    semana: payloadConsolidado.semana,
    segmento: payloadConsolidado.segmento,
    campana: camp,
    grupo: grp,
    modalidad: payloadConsolidado.modalidad,
    condicionLaboral: payloadConsolidado.condicionLaboral,
    cod: codUnico,
    inicio: payloadConsolidado.fechaInicioCapa,
    ingresoOperacion: payloadConsolidado.ingresoOperacion,
    mesAfectacionCapa: payloadConsolidado.mesAfectacionCapa,
    mesAfectacionBonos: payloadConsolidado.mesAfectacionBonos,
    pagoCapaPorDia: pPorDia,
    diasCapa: dCapa,
    cantDiasFeriados: payloadConsolidado.cantDiasFeriados,
    pagoCapaTotal: pComp,
    bBienvenidaM1: payloadConsolidado.bonoBienvenidaM1,
    bBienvenidaM2: payloadConsolidado.bonoBienvenidaM2,
    bBienvenidaM3: payloadConsolidado.bonoBienvenidaM3,
    bPermM1: payloadConsolidado.bonoPermanenciaM1,
    bPermM2: payloadConsolidado.bonoPermanenciaM2,
    bPermM3: payloadConsolidado.bonoPermanenciaM3,
    bPermM4: payloadConsolidado.bonoPermanenciaM4,
    bAsisM1: payloadConsolidado.bonoAsistenciaM1,
    bAsisM2: payloadConsolidado.bonoAsistenciaM2,
    bAsisM3: payloadConsolidado.bonoAsistenciaM3,
  };

  if (DB_MODE === 'supabase') {
    try {
      let consolidadoResult = null;
      if (config.id && String(config.id).length > 20) {
        // Actualizar por id existente en propuestas_consolidado
        const { data, error } = await supabase
          .from('propuestas_consolidado')
          .update(payloadConsolidado)
          .eq('id', config.id)
          .select()
          .single();
        if (!error && data) consolidadoResult = data;
      } else {
        const periodo = payloadConsolidado.periodoCapa;
        const semana = payloadConsolidado.semana;
        const segmento = payloadConsolidado.segmento;
        const { data: candidates } = await supabase
          .from('propuestas_consolidado')
          .select('id, grupo, campana, segmento, periodoCapa, semana, cod')
          .eq('grupo', grp);

        const sameSemana = (a, b) => {
          const num = (v) => String(v || '').replace(/\D/g, '');
          return num(a) && num(a) === num(b);
        };
        const existing = (candidates || []).find((row) => (
          String(row.campana || '').trim().toUpperCase() === String(camp).trim().toUpperCase()
          && String(row.segmento || '').trim().toUpperCase() === String(segmento).trim().toUpperCase()
          && String(row.periodoCapa || '').trim().toUpperCase() === String(periodo).trim().toUpperCase()
          && sameSemana(row.semana, semana)
        ));

        if (existing?.id) {
          const { data, error } = await supabase
            .from('propuestas_consolidado')
            .update(payloadConsolidado)
            .eq('id', existing.id)
            .select()
            .single();
          if (!error && data) consolidadoResult = data;
        } else {
          const { data, error } = await supabase
            .from('propuestas_consolidado')
            .insert([payloadConsolidado])
            .select()
            .single();
          if (!error && data) consolidadoResult = data;
        }
      }

      // Sincronizar en la tabla 'propuestas' para que ambos módulos estén alineados
      try {
        let qProp = supabase
          .from('propuestas')
          .select('id')
          .eq('grupo', grp)
          .eq('campana', camp);
        if (payloadPropuestas.periodoCapa) qProp = qProp.eq('periodoCapa', payloadPropuestas.periodoCapa);
        if (payloadPropuestas.segmento) qProp = qProp.eq('segmento', payloadPropuestas.segmento);

        const { data: existingProp } = await qProp.maybeSingle();

        if (existingProp?.id) {
          payloadPropuestas.updated_at = new Date().toISOString();
          await supabase.from('propuestas').update(payloadPropuestas).eq('id', existingProp.id);
        } else {
          await supabase.from('propuestas').insert([payloadPropuestas]);
        }
      } catch (propSyncErr) {
        console.warn("Aviso: No se pudo sincronizar automáticamente en tabla propuestas:", propSyncErr);
      }

      invalidateCache();
      window.dispatchEvent(new CustomEvent('gea-global-refresh'));
      if (consolidadoResult) return consolidadoResult;
    } catch (e) {
      console.warn("Error guardando propuesta en Supabase:", e);
    }
  }

  // Fallback a LocalStorage
  initLocalStorageDb();
  const existing = getFromStorage('propuestas_consolidado') || [];
  const sameSemana = (a, b) => {
    const num = (v) => String(v || '').replace(/\D/g, '');
    return num(a) && num(a) === num(b);
  };
  const idx = existing.findIndex(row => (
    String(row.grupo || '').trim().toUpperCase() === grp
    && String(row.campana || '').trim().toUpperCase() === String(camp).trim().toUpperCase()
    && sameSemana(row.semana, payloadConsolidado.semana)
  ));
  if (idx >= 0) {
    existing[idx] = { ...existing[idx], ...payloadConsolidado, id: existing[idx].id || `${Date.now()}` };
  } else {
    existing.push({ ...payloadConsolidado, id: `${Date.now()}` });
  }
  saveToStorage('propuestas_consolidado', existing);

  // Guardar también en localStorage 'propuestas'
  const localProps = getFromStorage('propuestas') || [];
  const pIdx = localProps.findIndex(p => String(p.grupo || '').toUpperCase() === grp && String(p.campana || '').toUpperCase() === camp.toUpperCase());
  if (pIdx >= 0) {
    localProps[pIdx] = { ...localProps[pIdx], ...payloadPropuestas };
  } else {
    localProps.push({ ...payloadPropuestas, id: `${Date.now()}` });
  }
  saveToStorage('propuestas', localProps);

  return payloadConsolidado;
}

export async function deleteConfigPagoGrupo(target) {
  if (DB_MODE === 'supabase') {
    try {
      if (target?.id) {
        await supabase.from('propuestas_consolidado').delete().eq('id', target.id);
      } else if (typeof target === 'string') {
        await supabase.from('propuestas_consolidado').delete().or(`id.eq.${target},grupo.eq.${target},cod.eq.${target}`);
      }
    } catch (e) {
      console.warn("Error eliminando propuesta en Supabase:", e);
    }
  }
  initLocalStorageDb();
  const existing = getFromStorage('propuestas_consolidado') || [];
  const filtered = existing.filter(c => {
    if (target?.id && c.id === target.id) return false;
    if (typeof target === 'string' && (c.id === target || c.grupo === target || c.cod === target || c.grupo_codigo === target)) return false;
    return true;
  });
  saveToStorage('propuestas_consolidado', filtered);
}

/** Normaliza filtro multi/single: [] = todos. Acepta string o array. */
function normalizePagosFilterList(val, allTokens = ['TODOS', 'TODAS']) {
  const tokens = new Set(allTokens.map((t) => String(t).toUpperCase()));
  const arr = Array.isArray(val) ? val : (val != null && val !== '' ? [val] : []);
  return arr
    .map((v) => String(v || '').trim())
    .filter((v) => v && !tokens.has(v.toUpperCase()));
}

function normalizePeriodoPagos(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  return digits.length >= 6 ? digits.slice(0, 6) : String(raw || '').trim();
}

export async function fetchNominasPagosCapacitacion({ periodo, semana, segmento, campana, grupo_codigo } = {}) {
  const periodos = normalizePagosFilterList(periodo).map(normalizePeriodoPagos).filter(Boolean);
  const segmentos = normalizePagosFilterList(segmento).map((s) => s.toUpperCase());
  const campanas = normalizePagosFilterList(campana, ['TODOS', 'TODAS']).map((c) => c.toUpperCase());
  const gruposFiltro = normalizePagosFilterList(grupo_codigo).map((g) => g.toUpperCase());
  const hasPeriodoFilter = periodos.length > 0;
  const hasHierarchyFilter = hasPeriodoFilter || segmentos.length > 0 || campanas.length > 0 || gruposFiltro.length > 0;

  // 1. Resolver alcance en capacidad_rys (segmento/campaña/grupo EXACTOS).
  // Importante: no filtrar solo por código de grupo — el mismo código se reutiliza en otras campañas/segmentos.
  let targetGrupos = [];
  /** @type {Set<string>} pares "CODIGO|CAMPANA" válidos según capacidad */
  const targetPairs = new Set();
  /** Campañas permitidas (selección usuario ∩ capacidad del segmento) */
  let campanasEfectivas = [...campanas];

  if (hasHierarchyFilter || (semana && semana !== 'TODAS')) {
    try {
      let capQ = supabase.from('capacidad_rys').select('codigo, campana, segmento, semana_label, semana_trabajo, periodo');
      if (semana && semana !== 'TODAS') {
        const sNum = parseInt(String(semana).replace(/\D/g, '')) || null;
        capQ = capQ.or(`semana_label.eq.${semana},semana_trabajo.eq.${sNum}`);
      }
      const { data: caps } = await capQ;
      const perSet = hasPeriodoFilter ? new Set(periodos) : null;
      const segSet = segmentos.length ? new Set(segmentos) : null;
      const campSet = campanas.length ? new Set(campanas) : null;
      const grpSet = gruposFiltro.length ? new Set(gruposFiltro) : null;
      const campsFromCap = [];

      ;(caps || []).forEach((c) => {
        const camp = String(c.campana || '').trim().toUpperCase();
        const seg = String(c.segmento || '').trim().toUpperCase();
        const per = normalizePeriodoPagos(c.periodo);
        const codigo = String(c.codigo || '').trim().toUpperCase();
        if (perSet && !perSet.has(per)) return;
        if (segSet && !segSet.has(seg)) return;
        if (campSet && camp && !campSet.has(camp)) return;
        if (grpSet && codigo && !grpSet.has(codigo)) return;
        if (codigo) {
          targetGrupos.push(codigo);
          const altG = codigo.startsWith('GPR-') ? codigo.replace('GPR-', 'GPE-') : (codigo.startsWith('GPE-') ? codigo.replace('GPE-', 'GPR-') : null);
          if (altG) targetGrupos.push(altG);
        }
        if (camp) campsFromCap.push(camp);
        if (codigo && camp) {
          targetPairs.add(`${codigo}|${camp}`);
          const altG = codigo.startsWith('GPR-') ? codigo.replace('GPR-', 'GPE-') : (codigo.startsWith('GPE-') ? codigo.replace('GPE-', 'GPR-') : null);
          if (altG) targetPairs.add(`${altG}|${camp}`);
        }
      });

      targetGrupos = [...new Set(targetGrupos)];
      // Si hay segmento (u otros filtros de capacidad), las campañas válidas son las de capacidad
      if (segmentos.length || campanas.length || hasPeriodoFilter || gruposFiltro.length) {
        const fromCap = [...new Set(campsFromCap)];
        campanasEfectivas = campanas.length
          ? fromCap.filter((c) => campanas.includes(c))
          : fromCap;
      }
    } catch (e) {
      console.warn('Error al buscar grupos en capacidad_rys:', e);
    }
  }

  // Grupos elegidos a mano sin filas en capacidad: usarlos igual, pero sin pares → no cruzar campañas
  if (!targetGrupos.length && gruposFiltro.length) {
    targetGrupos = [...gruposFiltro];
  }

  // Segmento/periodo/campaña sin match en capacidad → vacío (no abrir query global)
  if ((segmentos.length || campanas.length) && !targetPairs.size && !targetGrupos.length) {
    return [];
  }

  const pairOk = (codigo, campanaVal) => {
    if (!targetPairs.size) return true;
    const g = String(codigo || '').trim().toUpperCase();
    const c = String(campanaVal || '').trim().toUpperCase();
    if (!g || !c) return false;
    if (targetPairs.has(`${g}|${c}`)) return true;
    const altG = g.startsWith('GPR-') ? g.replace('GPR-', 'GPE-') : (g.startsWith('GPE-') ? g.replace('GPE-', 'GPR-') : null);
    if (altG && targetPairs.has(`${altG}|${c}`)) return true;
    return false;
  };

  const campanaOk = (campanaVal) => {
    if (!campanasEfectivas.length) return true;
    const c = String(campanaVal || '').trim().toUpperCase();
    if (!c) return false;
    return campanasEfectivas.includes(c);
  };

  // 2. Consultar consolidado_asistencias SOLO con alcance (evitar full-scan → timeouts 57014)
  // Sin filtros de cohorte/grupo: NO consultar consolidado a ciegas (tumba el proyecto).
  const asisSelect = 'documento, apellido_paterno, apellido_materno, nombres, campana, codigo_grupo, grupo, sigla, estado, created_at';
  const asisRows = [];
  const pushAsis = (rows) => {
    ;(rows || []).forEach((r) => asisRows.push(r));
  };

  const ASIS_PAGE = 3000;
  const CHUNK_SIZE = 15;

  const runAsisQuery = async (grupoChunk) => {
    if (!grupoChunk?.length) return [];
    let qAsis = supabase
      .from('consolidado_asistencias')
      .select(asisSelect)
      .neq('sigla', 'DESC')
      .neq('estado', 'DESCUENTO');

    if (grupoChunk.length === 1) {
      qAsis = qAsis.or(`codigo_grupo.eq.${grupoChunk[0]},grupo.eq.${grupoChunk[0]}`);
    } else {
      const list = grupoChunk.map((g) => `"${g}"`).join(',');
      qAsis = qAsis.or(`codigo_grupo.in.(${list}),grupo.in.(${list})`);
    }

    if (campanasEfectivas.length === 1) qAsis = qAsis.eq('campana', campanasEfectivas[0]);
    else if (campanasEfectivas.length > 1 && campanasEfectivas.length <= 80) {
      qAsis = qAsis.in('campana', campanasEfectivas);
    }

    const { data, error } = await qAsis.limit(ASIS_PAGE);
    if (error) {
      console.warn('Error consultando consolidado_asistencias para pagos:', error);
      return [];
    }
    return data || [];
  };

  if (targetGrupos.length === 0) {
    // Sin grupos resueltos: no hacer SELECT masivo a consolidado (causa statement timeout).
    // Se complementará vía nóminas más abajo si hay periodo/campaña.
    console.warn('Pagos: sin grupos objetivo; se omite scan de consolidado_asistencias.');
  } else {
    for (let i = 0; i < targetGrupos.length; i += CHUNK_SIZE) {
      const chunk = targetGrupos.slice(i, i + CHUNK_SIZE);
      const rows = await runAsisQuery(chunk);
      pushAsis(rows);
    }
  }

  // Cliente: campaña del segmento + par código|campaña (evita cruce entre segmentos)
  const asisRowsFiltradas = asisRows.filter((r) => {
    const camp = String(r.campana || '').trim().toUpperCase();
    const g = String(r.codigo_grupo || r.grupo || '').trim().toUpperCase();
    if (!campanaOk(camp)) return false;
    if (!pairOk(g, camp)) return false;
    return true;
  });

  // Mapa de personas únicas de formación
  const personasMap = new Map();
  asisRowsFiltradas.forEach(r => {
    const doc = String(r.documento || '').trim();
    if (!doc) return;
    if (!personasMap.has(doc)) {
      personasMap.set(doc, {
        documento: doc,
        apellido_paterno: r.apellido_paterno || '',
        apellido_materno: r.apellido_materno || '',
        nombres: r.nombres || '',
        campana: r.campana || (campanasEfectivas.length === 1 ? campanasEfectivas[0] : ''),
        segmento: segmentos.length === 1 ? segmentos[0] : '',
        grupo_codigo: r.codigo_grupo || r.grupo || (gruposFiltro.length === 1 ? gruposFiltro[0] : ''),
        semana_trabajo: semana !== 'TODAS' ? semana : '',
        periodo_reclutado: periodos.length === 1 ? periodos[0] : '',
        status_final: 'ASISTENCIA REGISTRADA',
        reclutador: '',
        fecha_inicio_capacitacion: null,
        fecha_fin_capacitacion: null,
        fecha_conexion_ojt: null,
        fecha_conexion_op: null,
      });
    }
  });

  // 3. Enriquecer y unificar con datos de 'nominas' (sin filtrar por status_final para no excluir a nadie)
  // Permite mapear Día 0 (inducción), Día 1 y condición de Agregados
  const docs = Array.from(personasMap.keys());
  if (docs.length > 0) {
    for (let i = 0; i < docs.length; i += 100) {
      const chunk = docs.slice(i, i + 100);
      const { data: nomRows, error: errNomRows } = await supabase
        .from('nominas')
        .select('documento, apellido_paterno, apellido_materno, nombres, campana, segmento, grupo_codigo, semana_trabajo, periodo_reclutado, fecha_inicio_capacitacion, fecha_fin_capacitacion, fecha_conexion_ojt, fecha_conexion_op, status_final, reclutador, dia_0, dia_0_obs, evaluacion_dia_0, dia_1, dia_1_obs, status_dia_1, condicion')
        .in('documento', chunk);

      if (errNomRows) {
        console.warn('Error enriqueciendo con nominas:', errNomRows);
      }

      (nomRows || []).forEach(n => {
        const doc = String(n.documento || '').trim();
        if (personasMap.has(doc)) {
          const current = personasMap.get(doc);
          personasMap.set(doc, {
            ...current,
            apellido_paterno: n.apellido_paterno || current.apellido_paterno,
            apellido_materno: n.apellido_materno || current.apellido_materno,
            nombres: n.nombres || current.nombres,
            reclutador: n.reclutador || current.reclutador || '',
            // Mantener la campaña y grupo que vinieron de la asistencia de este filtro
            campana: current.campana || n.campana,
            segmento: current.segmento || n.segmento,
            grupo_codigo: current.grupo_codigo || n.grupo_codigo,
            semana_trabajo: current.semana_trabajo || n.semana_trabajo,
            periodo_reclutado: current.periodo_reclutado || n.periodo_reclutado,
            fecha_inicio_capacitacion: n.fecha_inicio_capacitacion || current.fecha_inicio_capacitacion,
            fecha_fin_capacitacion: n.fecha_fin_capacitacion || current.fecha_fin_capacitacion,
            fecha_conexion_ojt: n.fecha_conexion_ojt || current.fecha_conexion_ojt,
            fecha_conexion_op: n.fecha_conexion_op || current.fecha_conexion_op,
            status_final: n.status_final || current.status_final,
            dia_0: n.dia_0 || '',
            dia_0_obs: n.dia_0_obs || '',
            evaluacion_dia_0: n.evaluacion_dia_0 || '',
            dia_1: n.dia_1 || '',
            dia_1_obs: n.dia_1_obs || '',
            status_dia_1: n.status_dia_1 || '',
            condicion: n.condicion || '',
            tipo_reclutado: n.condicion || '',
          });
        }
      });
    }
  }

  // 4. Si hay asesores en nóminas para los grupos objetivo que no estaban en asistencia
  // (por ejemplo: asistieron solo a Día 0 / inducción o son agregados recientes), sumarlos también
  try {
    const ingestExtraNoms = (extraNoms) => {
      (extraNoms || []).forEach(n => {
        const doc = String(n.documento || '').trim();
        if (!doc || personasMap.has(doc)) return;
        const camp = String(n.campana || '').trim().toUpperCase();
        const g = String(n.grupo_codigo || '').trim().toUpperCase();
        if (!campanaOk(camp)) return;
        if (!pairOk(g, camp)) return;
        const perNom = normalizePeriodoPagos(n.periodo_reclutado || n.periodo);
        if (hasPeriodoFilter && perNom && !periodos.includes(perNom)) return;
        personasMap.set(doc, {
          documento: doc,
          apellido_paterno: n.apellido_paterno || '',
          apellido_materno: n.apellido_materno || '',
          nombres: n.nombres || '',
          campana: n.campana || (campanasEfectivas.length === 1 ? campanasEfectivas[0] : ''),
          segmento: segmentos.length === 1 ? segmentos[0] : (n.segmento || ''),
          grupo_codigo: n.grupo_codigo || (gruposFiltro.length === 1 ? gruposFiltro[0] : ''),
          semana_trabajo: n.semana_trabajo || (semana !== 'TODAS' ? semana : ''),
          periodo_reclutado: n.periodo_reclutado || (periodos.length === 1 ? periodos[0] : ''),
          status_final: n.status_final || 'NOMINA REGISTRADA',
          reclutador: n.reclutador || '',
          fecha_inicio_capacitacion: n.fecha_inicio_capacitacion || null,
          fecha_fin_capacitacion: n.fecha_fin_capacitacion || null,
          fecha_conexion_ojt: n.fecha_conexion_ojt || null,
          fecha_conexion_op: n.fecha_conexion_op || null,
          dia_0: n.dia_0 || '',
          dia_0_obs: n.dia_0_obs || '',
          evaluacion_dia_0: n.evaluacion_dia_0 || '',
          dia_1: n.dia_1 || '',
          dia_1_obs: n.dia_1_obs || '',
          status_dia_1: n.status_dia_1 || '',
          condicion: n.condicion || '',
          tipo_reclutado: n.condicion || '',
        });
      });
    };

    const nomSelect = 'documento, apellido_paterno, apellido_materno, nombres, campana, segmento, grupo_codigo, semana_trabajo, periodo_reclutado, fecha_inicio_capacitacion, fecha_fin_capacitacion, fecha_conexion_ojt, fecha_conexion_op, status_final, reclutador, dia_0, dia_0_obs, evaluacion_dia_0, dia_1, dia_1_obs, status_dia_1, condicion';

    const applyPeriodoToNomQ = (q) => {
      if (periodos.length === 1) return q.eq('periodo_reclutado', periodos[0]);
      if (periodos.length > 1) return q.in('periodo_reclutado', periodos);
      return q;
    };

    const applyCampanaToNomQ = (q) => {
      if (campanasEfectivas.length === 1) return q.eq('campana', campanasEfectivas[0]);
      if (campanasEfectivas.length > 1 && campanasEfectivas.length <= 80) {
        return q.in('campana', campanasEfectivas);
      }
      return q;
    };

    if (targetGrupos.length === 0 && gruposFiltro.length > 0) {
      // Grupos explícitos sin match: no ampliar
    } else if (targetGrupos.length === 0 && segmentos.length && !hasPeriodoFilter && !campanas.length) {
      // Segmento solo sin grupos resueltos: no ampliar nómina global
    } else if (targetGrupos.length === 0) {
      let nomTargetQ = applyCampanaToNomQ(applyPeriodoToNomQ(supabase.from('nominas').select(nomSelect)));
      const { data: extraNoms } = await nomTargetQ.limit(3000);
      ingestExtraNoms(extraNoms);
    } else {
      for (let i = 0; i < targetGrupos.length; i += 30) {
        const chunk = targetGrupos.slice(i, i + 30);
        let nomTargetQ = supabase.from('nominas').select(nomSelect);
        if (chunk.length === 1) nomTargetQ = nomTargetQ.eq('grupo_codigo', chunk[0]);
        else nomTargetQ = nomTargetQ.in('grupo_codigo', chunk);
        nomTargetQ = applyCampanaToNomQ(applyPeriodoToNomQ(nomTargetQ));
        const { data: extraNoms } = await nomTargetQ.limit(4000);
        ingestExtraNoms(extraNoms);
      }
    }
  } catch (errNomTarget) {
    console.warn("Aviso al consultar nóminas complementarias:", errNomTarget);
  }

  // Filtrado final estricto: campaña del segmento + par código|campaña de capacidad
  const personasResultado = Array.from(personasMap.values()).filter(p => {
    const c = String(p.campana || '').trim().toUpperCase();
    const g = String(p.grupo_codigo || '').trim().toUpperCase();
    if (!campanaOk(c)) return false;
    if (!pairOk(g, c)) return false;
    if (gruposFiltro.length) {
      if (g && !gruposFiltro.includes(g)) return false;
    }
    if (hasPeriodoFilter) {
      const per = normalizePeriodoPagos(p.periodo_reclutado || p.periodo);
      if (per && !periodos.includes(per)) return false;
    }
    return true;
  });

  return personasResultado;
}

export async function fetchAsistenciasPagos(documentos = [], grupoCodigo = null) {
  if (!documentos.length) return [];
  const gruposFiltro = normalizePagosFilterList(grupoCodigo);
  if (DB_MODE === 'supabase') {
    let allRows = [];
    const chunks = [];
    for (let i = 0; i < documentos.length; i += 120) {
      chunks.push(documentos.slice(i, i + 120));
    }
    for (let i = 0; i < chunks.length; i += 4) {
      const batch = chunks.slice(i, i + 4);
      const results = await Promise.all(
        batch.map(async (chunk) => {
          let q = supabase
            .from('consolidado_asistencias')
            .select('documento, fecha_registro_asistencia, sigla, estado, codigo_grupo, grupo, fecha_hora_registro, created_at')
            .in('documento', chunk)
            .neq('sigla', 'DESC')
            .neq('estado', 'DESCUENTO');

          if (gruposFiltro.length === 1) {
            q = q.or(`codigo_grupo.eq.${gruposFiltro[0]},grupo.eq.${gruposFiltro[0]}`);
          } else if (gruposFiltro.length > 1) {
            const list = gruposFiltro.slice(0, 50).map(g => `"${g}"`).join(',');
            q = q.or(`codigo_grupo.in.(${list}),grupo.in.(${list})`);
          }

          const { data, error } = await q.order('created_at', { ascending: true });
          return (!error && data) ? data : [];
        })
      );
      results.forEach(rows => allRows.push(...rows));
    }

    return allRows.map(r => ({
      postulante_documento: r.documento,
      fecha_asistencia: parseFechaAsistencia(r.fecha_registro_asistencia),
      fecha_original: r.fecha_registro_asistencia,
      sigla_asistencia: (r.sigla || (r.estado === 'ACTIVO' ? 'A' : (r.estado === 'CESADO' ? 'B' : 'FI'))).toUpperCase().trim(),
      grupo_codigo: r.codigo_grupo || r.grupo,
      estado: r.estado,
      fecha_hora_registro: r.fecha_hora_registro,
      created_at: r.created_at,
    }));
  }
  return [];
}

export async function fetchGruposPagosDisponibles() {
  if (DB_MODE === 'supabase') {
    try {
      const { data, error } = await supabase
        .from('capacidad_rys')
        .select('codigo, campana, segmento, semana_label, semana_trabajo, periodo')
        .order('periodo', { ascending: false });
      if (error) throw error;
      if (data && data.length) {
        return data.map(row => {
          const semNum = row.semana_trabajo || (parseInt(String(row.semana_label || '').replace(/\D/g, '')) || null);
          const campana = String(row.campana || '').trim().toUpperCase();
          // Segmento exacto de capacidad_rys
          const segmento = String(row.segmento || '').trim().toUpperCase();
          return {
            grupo_codigo: row.codigo,
            campana,
            segmento,
            semana_label: row.semana_label,
            semana_trabajo: semNum,
            periodo_reclutado: row.periodo,
            periodo: row.periodo,
          };
        });
      }
    } catch (e) {
      console.warn('Error fetching grupos from capacidad_rys:', e);
    }
  }
  return [];
}

// ─────────────────────────────────────────────────────────────────────────────
// TRAZABILIDAD DE PAGOS – Liquidaciones históricas
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Guarda un lote de pagos cerrado en la tabla de trazabilidad.
 * Soporta tanto filas de la Matriz de Pagos (desglosadas por mes_pago)
 * como filas consolidadas con cuotas_permanencia.
 *
 * @param {Object[]} filas - Filas a liquidar (de matriz de pagos o calificados)
 * @param {Object} meta - { periodo, mes_pago, semana_trabajo, segmento, campana, grupo_codigo, cerrado_por, notas_lote }
 * @returns {string} lote_id generado
 */
export async function saveLiquidacionPagos(filas = [], meta = {}) {
  if (!filas.length) throw new Error('No hay filas para liquidar');

  // Generar UUID del lote en el cliente
  const lote_id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const rows = filas.flatMap(f => {
    // Si la fila ya viene desglosada por mes_pago de la Matriz de Pagos:
    if (f.mes_pago != null && f.mes_pago !== '') {
      return [{
        lote_id,
        periodo: meta.periodo || f.periodo_reclutado || f.periodo || '',
        mes_pago: String(f.mes_pago).trim(),
        semana_trabajo: meta.semana_trabajo ? parseInt(meta.semana_trabajo) : (f.semana_trabajo ? parseInt(f.semana_trabajo) : null),
        segmento: meta.segmento || f.segmento || null,
        campana: meta.campana || f.campana || null,
        grupo_codigo: meta.grupo_codigo || f.grupo_codigo || null,
        documento: String(f.documento).trim(),
        nombre_completo: f.nombre_completo || null,
        dias_asistidos: f.dias_asistidos || 0,
        asistencia_perfecta: Boolean(f.asistencia_perfecta),
        monto_dias_capa: Number(f.importe_capa ?? f.monto_dias_capa ?? 0),
        bono_bienvenida: Number(f.bono_bienvenida ?? 0),
        bono_asistencia_perfecta: Number(f.bono_asistencia_perfecta ?? 0),
        bono_permanencia_total: Number(f.bono_permanencia ?? f.bono_permanencia_total ?? 0),
        cuota_numero: f.cuota_numero || f.mes_numero || 1,
        monto_cuota_permanencia: Number(f.bono_permanencia ?? f.monto_cuota_permanencia ?? 0),
        total_general: Number(f.total_mes ?? f.total_general ?? 0),
        cerrado_por: meta.cerrado_por || null,
        notas_lote: meta.notas_lote || null,
      }];
    }

    // Si es una fila consolidada con cuotas_permanencia (fallback clásico):
    const cuotas = f.cuotas_permanencia?.length ? f.cuotas_permanencia : [{ numero: 1, monto: f.bono_permanencia_total || 0 }];
    return cuotas.map(cuota => ({
      lote_id,
      periodo: meta.periodo || f.periodo_reclutado || '',
      mes_pago: String(meta.mes_pago || meta.periodo || f.periodo_reclutado || '').trim(),
      semana_trabajo: meta.semana_trabajo ? parseInt(meta.semana_trabajo) : (f.semana_trabajo ? parseInt(f.semana_trabajo) : null),
      segmento: meta.segmento || f.segmento || null,
      campana: meta.campana || f.campana || null,
      grupo_codigo: meta.grupo_codigo || f.grupo_codigo || null,
      documento: String(f.documento).trim(),
      nombre_completo: f.nombre_completo || null,
      dias_asistidos: f.dias_asistidos || 0,
      asistencia_perfecta: Boolean(f.asistencia_perfecta),
      monto_dias_capa: Number(f.monto_dias_capa || 0),
      bono_bienvenida: Number(f.bono_bienvenida || 0),
      bono_asistencia_perfecta: Number(f.bono_asistencia_perfecta || 0),
      bono_permanencia_total: Number(f.bono_permanencia_total || 0),
      cuota_numero: cuota.numero,
      monto_cuota_permanencia: Number(cuota.monto || 0),
      total_general: Number(f.total_general || 0),
      cerrado_por: meta.cerrado_por || null,
      notas_lote: meta.notas_lote || null,
    }));
  });

  if (DB_MODE === 'supabase') {
    const { error } = await supabase
      .from('liquidaciones_pagos_capacitacion')
      .insert(rows);
    if (error) throw error;
    invalidateCache('liquidaciones_');
  } else {
    // Fallback localStorage
    initLocalStorageDb();
    const existing = getFromStorage('liquidaciones_pagos_capacitacion') || [];
    saveToStorage('liquidaciones_pagos_capacitacion', [...existing, ...rows]);
  }

  return lote_id;
}

/**
 * Retorna todos los registros históricos de liquidaciones para trazabilidad
 * y mapeo de estado PAGADO vs PENDIENTE.
 */
export async function fetchLiquidacionesHistoricas() {
  if (DB_MODE === 'supabase') {
    // withCache ya devuelve el payload (array), no { data, error }
    const rows = await withCache('liquidaciones_historicas_all', 30000, async () => {
      const { data, error } = await supabase
        .from('liquidaciones_pagos_capacitacion')
        .select('*')
        .order('cerrado_at', { ascending: false });
      if (error) {
        console.warn('Error fetching liquidaciones_pagos_capacitacion:', error);
        return [];
      }
      return data || [];
    });
    return Array.isArray(rows) ? rows : [];
  } else {
    initLocalStorageDb();
    return getFromStorage('liquidaciones_pagos_capacitacion') || [];
  }
}

/**
 * Retorna la lista de lotes históricos cerrados (agrupados por lote_id).
 * Cada entrada tiene: lote_id, periodo, semana, campana, fecha cierre, usuario, nº personas, total.
 */
export async function fetchLiquidacionesLotes() {
  if (DB_MODE === 'supabase') {
    // withCache ya devuelve el array de filas
    const data = await withCache('liquidaciones_lotes', 60000, async () => {
      const { data, error } = await supabase
        .from('liquidaciones_pagos_capacitacion')
        .select('lote_id, periodo, mes_pago, semana_trabajo, segmento, campana, grupo_codigo, cerrado_por, cerrado_at, notas_lote, documento, total_general')
        .order('cerrado_at', { ascending: false });
      if (error) throw error;
      return data || [];
    });
    const rows = Array.isArray(data) ? data : [];

    // Agrupar por lote_id en el cliente
    const lotesMap = new Map();
    for (const row of rows) {
      if (!lotesMap.has(row.lote_id)) {
        lotesMap.set(row.lote_id, {
          lote_id: row.lote_id,
          periodo: row.periodo,
          semana_trabajo: row.semana_trabajo,
          segmento: row.segmento,
          campana: row.campana,
          grupo_codigo: row.grupo_codigo,
          cerrado_por: row.cerrado_por,
          cerrado_at: row.cerrado_at,
          notas_lote: row.notas_lote,
          total_personas: 0,
          total_general: 0,
          documentos: new Set(),
        });
      }
      const lote = lotesMap.get(row.lote_id);
      lote.documentos.add(row.documento);
      lote.total_general += parseFloat(row.total_general || 0);
    }

    return Array.from(lotesMap.values()).map(l => ({
      ...l,
      total_personas: l.documentos.size,
      total_general: +l.total_general.toFixed(2),
      documentos: undefined,
    }));
  } else {
    // Fallback localStorage
    initLocalStorageDb();
    const rows = getFromStorage('liquidaciones_pagos_capacitacion') || [];
    const lotesMap = new Map();
    for (const row of rows) {
      if (!lotesMap.has(row.lote_id)) {
        lotesMap.set(row.lote_id, {
          lote_id: row.lote_id, periodo: row.periodo, semana_trabajo: row.semana_trabajo,
          segmento: row.segmento, campana: row.campana, grupo_codigo: row.grupo_codigo,
          cerrado_por: row.cerrado_por, cerrado_at: row.cerrado_at, notas_lote: row.notas_lote,
          total_personas: 0, total_general: 0, documentos: new Set(),
        });
      }
      const l = lotesMap.get(row.lote_id);
      l.documentos.add(row.documento);
      l.total_general += parseFloat(row.total_general || 0);
    }
    return Array.from(lotesMap.values()).map(l => ({
      ...l, total_personas: l.documentos.size, total_general: +l.total_general.toFixed(2), documentos: undefined,
    }));
  }
}

/**
 * Retorna las filas de detalle de un lote específico por lote_id.
 */
export async function fetchLiquidacionDetalle(lote_id) {
  if (!lote_id) return [];
  if (DB_MODE === 'supabase') {
    const { data, error } = await supabase
      .from('liquidaciones_pagos_capacitacion')
      .select('*')
      .eq('lote_id', lote_id)
      .order('campana')
      .order('documento');
    if (error) throw error;
    return data || [];
  } else {
    initLocalStorageDb();
    const rows = getFromStorage('liquidaciones_pagos_capacitacion') || [];
    return rows.filter(r => r.lote_id === lote_id);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SERVICIO DE ALERTAS Y NOTIFICACIONES AUTOMÁTICAS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Crea una notificación / alerta para administradores u otros roles.
 */
export async function crearNotificacion({ tipo = 'info', titulo, mensaje, datos = {}, rol_destinatario = 'admin' }) {
  const row = {
    tipo,
    titulo,
    mensaje,
    datos,
    rol_destinatario,
    leido: false,
    created_at: new Date().toISOString(),
  }

  if (DB_MODE === 'supabase') {
    try {
      const { data, error } = await supabase.from('notificaciones').insert([row]).select().maybeSingle()
      if (error) {
        console.warn('Error insertando notificacion en Supabase:', error)
      }
      window.dispatchEvent(new CustomEvent('gea-notificacion-creada', { detail: data || row }))
      return data || row
    } catch (e) {
      console.warn('Excepción al crear notificación:', e)
    }
  }

  // Fallback local
  initLocalStorageDb();
  const notifs = getFromStorage('notificaciones') || []
  const newRow = { id: crypto.randomUUID(), ...row }
  notifs.unshift(newRow)
  saveToStorage('notificaciones', notifs.slice(0, 100))
  window.dispatchEvent(new CustomEvent('gea-notificacion-creada', { detail: newRow }))
  return newRow
}

/**
 * Obtiene las notificaciones activas para el rol (o todos).
 */
export async function fetchNotificaciones({ rol = 'admin', limit = 40 } = {}) {
  if (DB_MODE === 'supabase') {
    try {
      let q = supabase
        .from('notificaciones')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit)

      if (rol && rol !== 'todos') {
        q = q.or(`rol_destinatario.eq.${rol},rol_destinatario.eq.todos,rol_destinatario.is.null`)
      }

      const { data, error } = await q
      if (!error && data) return data
    } catch (e) {
      console.warn('Error fetching notificaciones:', e)
    }
  }

  initLocalStorageDb();
  const notifs = getFromStorage('notificaciones') || []
  return notifs.slice(0, limit)
}

/**
 * Marca una notificación como leída.
 */
export async function marcarNotificacionLeida(id) {
  if (!id) return
  if (DB_MODE === 'supabase') {
    try {
      await supabase.from('notificaciones').update({ leido: true }).eq('id', id)
    } catch (e) {
      console.warn('Error marcando notificación leída:', e)
    }
  }
  const notifs = getFromStorage('notificaciones') || []
  const updated = notifs.map(n => n.id === id ? { ...n, leido: true } : n)
  saveToStorage('notificaciones', updated)
  window.dispatchEvent(new CustomEvent('gea-notificaciones-actualizadas'))
}

/**
 * Marca todas las notificaciones de un rol como leídas.
 */
export async function marcarTodasNotificacionesLeidas(rol = 'admin') {
  if (DB_MODE === 'supabase') {
    try {
      let q = supabase.from('notificaciones').update({ leido: true }).eq('leido', false)
      if (rol && rol !== 'todos') {
        q = q.or(`rol_destinatario.eq.${rol},rol_destinatario.eq.todos,rol_destinatario.is.null`)
      }
      await q
    } catch (e) {
      console.warn('Error marcando todas como leídas:', e)
    }
  }
  const notifs = getFromStorage('notificaciones') || []
  const updated = notifs.map(n => ({ ...n, leido: true }))
  saveToStorage('notificaciones', updated)
  window.dispatchEvent(new CustomEvent('gea-notificaciones-actualizadas'))
}

/**
 * Consulta la tabla analítica dedicada de movilidad y ubicación geográfica.
 */
export async function fetchAnaliticaMovilidad({ periodo = null, modalidad = null } = {}) {
  if (DB_MODE === 'supabase') {
    try {
      let allRows = []
      let from = 0
      const pageSize = 1000
      let hasMore = true

      while (hasMore) {
        let q = supabase
          .from('analitica_movilidad_geografica')
          .select('*')
          .range(from, from + pageSize - 1)
          .order('periodo', { ascending: false })
        
        if (periodo && periodo !== 'TODOS') {
          const cleanP = String(periodo).trim()
          q = q.or(`periodo.eq.${cleanP},periodo.ilike.%${cleanP}%`)
        }
        if (modalidad && modalidad !== 'TODAS') {
          q = q.eq('modalidad', String(modalidad).trim())
        }
        
        const { data, error } = await q
        if (error) {
          console.warn('Error consultando analitica_movilidad_geografica:', error)
          // Fallback sin order si hubiera discrepancia de índice
          const fallbackRes = await supabase
            .from('analitica_movilidad_geografica')
            .select('*')
            .range(from, from + pageSize - 1)
          if (fallbackRes.data && fallbackRes.data.length > 0) {
            allRows = allRows.concat(fallbackRes.data)
            if (fallbackRes.data.length < pageSize || allRows.length >= 10000) {
              hasMore = false
            } else {
              from += pageSize
            }
            continue
          }
          break
        }
        if (data && data.length > 0) {
          allRows = allRows.concat(data)
          if (data.length < pageSize || allRows.length >= 10000) {
            hasMore = false
          } else {
            from += pageSize
          }
        } else {
          hasMore = false
        }
      }
      return allRows
    } catch (err) {
      console.warn('Excepción en fetchAnaliticaMovilidad:', err)
      return []
    }
  }
  return []
}

// ─────────────────────────────────────────────────────────────────────────────
// MAQUETA Y LIQUIDACIÓN DE BONOS (RYS) - PERSISTENCIA Y AUDITORÍA
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Consulta la configuración de escalas y tramos activos de maqueta
 */
export async function fetchMaquetaEscalasConfig() {
  if (DB_MODE === 'supabase' && isSupabaseConfigured()) {
    try {
      const { data, error } = await supabase
        .from('maqueta_escalas_config')
        .select('*')
        .eq('is_active', true)
        .order('orden', { ascending: true })

      if (error) throw error
      return data || []
    } catch (err) {
      console.warn('[Maqueta] Error al consultar maqueta_escalas_config:', err)
      return []
    }
  }
  return []
}

/**
 * Guarda o actualiza (Upsert) la liquidación consolidada de un periodo
 */
export async function guardarLiquidacionPeriodo(periodo, filas = [], userProfile = null) {
  if (!periodo || !filas.length) return { success: false, count: 0 }

  const liquidadoPor = userProfile?.nombre_completo || userProfile?.nombre || userProfile?.email || 'Admin'

  const records = filas.map((f) => ({
    periodo: String(periodo).trim(),
    colaborador_id: f.documento || f.key,
    personal_rys: f.nombre,
    cargo: f.cargo,
    estado: f.estado || 'ACTIVO',
    campanas: f.campanas || '',

    // Paso 1: Cumplimiento Real
    meta_dia_1: f.dia1Meta || 0,
    real_dia_1: f.dia1Real || 0,
    cump_dia1_pct: f.pctDia1Operativo || 0,
    rq_dotacion: f.rqReal || 0,
    real_dotacion: f.dotacionReal || 0,
    cump_dotacion_pct: f.pctDotacionOperativo || 0,
    cantidad_aptos: f.aptosReal || 0,
    cantidad_evaluados: f.evaluadosReal || 0,
    cump_calidad_pct: f.pctCalidadReal !== undefined ? f.pctCalidadReal : 100,

    // Paso 2: % Alcance
    alcance_dia1_pct: f.alcanceDia1 || 0,
    alcance_dotacion_pct: f.alcanceDotacion || 0,
    alcance_calidad_pct: f.alcanceCalidad || 100,

    // Paso 3: Pesos y Puntos
    peso_dia1_pct: f.pesoDia1 || 50,
    peso_dotacion_pct: f.pesoDotacion || 40,
    peso_calidad_pct: f.pesoCalidad || 10,

    puntos_dia1_pct: f.puntosDia1 || 0,
    puntos_dotacion_pct: f.puntosDotacion || 0,
    puntos_calidad_pct: f.puntosCalidad || 0,
    total_puntos_pct: f.totalPuntosPct || 0,

    // Paso 4: Resultados Financieros y Subdivisión
    bono_bruto: f.bonoBruto || 400,
    bono_neto: f.bonoNeto || 0,
    bono_neto_efectivo: f.bonoEfectivo || 0,
    bono_neto_sodexo: f.bonoSodexo || 0,

    // Auditoría
    estado_pago: 'PENDIENTE',
    liquidado_por: liquidadoPor,
    fecha_cierre: new Date().toISOString(),
  }))

  if (DB_MODE === 'supabase' && isSupabaseConfigured()) {
    try {
      const { data, error } = await supabase
        .from('maqueta_reclutadores_liquidaciones')
        .upsert(records, { onConflict: 'periodo,personal_rys' })

      if (error) throw error
      return { success: true, count: records.length, data }
    } catch (err) {
      console.error('[Maqueta] Error al guardar liquidación en Supabase:', err)
      throw err
    }
  } else {
    // Modo Local
    try {
      const storageKey = `gea_maqueta_liq_${periodo}`
      localStorage.setItem(storageKey, JSON.stringify(records))
      return { success: true, count: records.length, local: true }
    } catch (err) {
      console.warn('[Maqueta] Error al guardar en localStorage:', err)
      return { success: false, count: 0 }
    }
  }
}

/**
 * Consulta la Base Operativa Oficial de 16 Columnas desde maqueta_reclutadores_base
 */
export async function fetchMaquetaBaseOperativa(periodo = '') {
  if (DB_MODE !== 'supabase' || !isSupabaseConfigured()) {
    return []
  }
  try {
    let query = supabase.from('maqueta_reclutadores_base').select('*')
    if (periodo && periodo !== 'TODOS') {
      const pNorm = String(periodo).replace(/\D/g, '').slice(0, 6)
      const validPeriodos = Array.from(new Set([String(periodo).trim(), pNorm].filter(Boolean)))
      if (validPeriodos.length === 1) {
        query = query.eq('periodo_efectivo', validPeriodos[0])
      } else if (validPeriodos.length > 1) {
        query = query.in('periodo_efectivo', validPeriodos)
      }
    }
    const { data, error } = await query.order('codigo_gpe', { ascending: true })
    if (error) throw error
    return data || []
  } catch (err) {
    console.error('[MaquetaBase] Error al consultar maqueta_reclutadores_base:', err)
    return []
  }
}

/**
 * Guarda o sincroniza registros en maqueta_reclutadores_base
 */
export async function guardarMaquetaBaseOperativa(records = []) {
  if (!records.length) return { success: false, count: 0 }
  if (DB_MODE === 'supabase' && isSupabaseConfigured()) {
    try {
      const { data, error } = await supabase
        .from('maqueta_reclutadores_base')
        .upsert(records, { onConflict: 'periodo_efectivo,codigo_gpe,campana,semana,analista_reclutador' })
      if (error) throw error
      return { success: true, count: records.length, data }
    } catch (err) {
      console.error('[MaquetaBase] Error al guardar en maqueta_reclutadores_base:', err)
      throw err
    }
  }
  return { success: false, count: 0 }
}

/**
 * Sincroniza automáticamente la base operativa de 16 columnas desde metas_equipos, capacidad_rys y nominas
 */
export async function sincronizarMaquetaBaseDesdeConsolidado(periodo = '') {
  const pStr = String(periodo || '').trim()
  const pNorm = pStr.replace(/\D/g, '').slice(0, 6)
  
  if (DB_MODE === 'supabase' && isSupabaseConfigured()) {
    try {
      const { data, error } = await supabase.rpc('sincronizar_maqueta_base', {
        p_periodo: pNorm || (pStr !== 'TODOS' ? pStr : null)
      })
      if (!error && typeof data === 'number') {
        return { success: true, count: data }
      }
      if (error) {
        console.warn('[MaquetaBase] RPC sincronizar_maqueta_base fallback error:', error)
      }
    } catch (err) {
      console.warn('[MaquetaBase] Error calling RPC sincronizar_maqueta_base:', err)
    }
  }

  // Fallback si RPC no estuviese disponible
  const kpiRows = await fetchKpiReclutadoresConsolidado({ periodo: pStr || pNorm })
  if (!kpiRows || !kpiRows.length) return { success: false, count: 0, message: 'No hay filas consolidadas en este periodo' }

  const mapped = kpiRows.map((r) => ({
    periodo_efectivo: pStr || r.periodo_efectivo || pNorm,
    codigo_gpe: r.grupo_g || r.codigo_gpe || 'GPE-S/C',
    semana: r.semana ? `SEM ${r.semana}` : null,
    fecha_inicio_capa: r.fecha_inicio || null,
    fecha_fin_capa: r.fecha_ingreso_op || null,
    segmento: r.segmento || '',
    campana: r.campana || '',
    modalidad: r.modalidad || 'PRESENCIAL',
    tipo_reclutador: r.tipo_reclutador || 'Interno',
    analista_reclutador: String(r.responsable || '').trim(),
    meta_dia_1_grupal: Number(r.meta_dia_1_campana || r.rq || 0),
    nomina: Number(r.nomina || 0),
    meta_dia_1_individual: Number(r.meta_dia_1_individual || r.dia_1_tope || 0),
    meta_dia_1_nuevo_criterio: Number(r.meta_dia_1_nuevo_criterio || 0),
    asistencia_dia_1: Number(r.dia_1 || 0),
    dotacion: Number(r.dotacion_q || 0),
    rq_op: Number(r.rq_individual || r.rq || 0),
  })).filter(r => r.analista_reclutador && !r.analista_reclutador.toUpperCase().includes('SIN NOMINA'))

  return await guardarMaquetaBaseOperativa(mapped)
}

/**
 * Consulta la liquidación guardada o congelada de un periodo
 */
export async function fetchLiquidacionesPeriodo(periodo) {
  if (!periodo) return []

  if (DB_MODE === 'supabase' && isSupabaseConfigured()) {
    try {
      const { data, error } = await supabase
        .from('maqueta_reclutadores_liquidaciones')
        .select('*')
        .eq('periodo', String(periodo).trim())
        .order('nombre', { ascending: true })

      if (error) throw error
      return data || []
    } catch (err) {
      console.warn('[Maqueta] Error al consultar liquidaciones:', err)
      return []
    }
  } else {
    const storageKey = `gea_maqueta_liq_${periodo}`
    const raw = localStorage.getItem(storageKey)
    return raw ? JSON.parse(raw) : []
  }
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * SERVICIOS DE CONCILIACIÓN Y VALIDACIÓN DE VARIABLES CON OPERACIÓN / RRHH
 * Tabla: public.variables_validacion_operacion
 * ─────────────────────────────────────────────────────────────────────────────
 */

export async function fetchVariablesValidacion(periodo = '202610') {
  if (DB_MODE === 'supabase' && isSupabaseConfigured()) {
    try {
      let query = supabase
        .from('variables_validacion_operacion')
        .select('*')
        .range(0, 9999)

      if (periodo && periodo !== 'ALL') {
        query = query.eq('periodo', String(periodo).trim())
      }

      query = query.order('tipo_bono', { ascending: true }).order('item_num', { ascending: true })

      const { data, error } = await query
      if (error) throw error
      return data || []
    } catch (err) {
      console.error('[fetchVariablesValidacion] Error:', err)
      throw err
    }
  } else {
    const raw = localStorage.getItem(`gea_vars_val_${periodo}`)
    return raw ? JSON.parse(raw) : []
  }
}

export async function fetchPeriodosVariablesValidacion() {
  if (DB_MODE === 'supabase' && isSupabaseConfigured()) {
    try {
      const { data, error } = await supabase
        .from('variables_validacion_operacion')
        .select('periodo')
        .order('periodo', { ascending: false })

      if (error) throw error
      const unique = Array.from(new Set((data || []).map(r => r.periodo).filter(Boolean)))
      return unique.length ? unique : ['202610']
    } catch (err) {
      console.warn('[fetchPeriodosVariablesValidacion] Fallback:', err)
      return ['202610']
    }
  }
  return ['202610']
}

export async function updateVariableValidacionRow(id, updates) {
  if (!id) throw new Error('ID requerido para actualización')

  const payload = {
    ...updates,
    fecha_validacion: updates.fecha_validacion || new Date().toISOString()
  }

  if (DB_MODE === 'supabase' && isSupabaseConfigured()) {
    const { data, error } = await supabase
      .from('variables_validacion_operacion')
      .update(payload)
      .eq('id', id)
      .select()

    if (error) throw error
    return data?.[0]
  } else {
    return payload
  }
}

export async function procesarCesesBulkVariables(periodo, dnisList = [], meta = {}) {
  if (!dnisList.length) return { count: 0 }

  const cleanDnis = dnisList.map(d => String(d).trim().replace(/\D/g, '')).filter(Boolean)
  if (!cleanDnis.length) return { count: 0 }

  const payload = {
    estado_validacion: 'CESADO',
    monto_aprobado: 0,
    motivo_ajuste: meta.motivo || 'CESE DE OPERACIÓN (BAJA)',
    observacion_operacion: meta.observacion || 'Confirmado por Operaciones / RRHH',
    fecha_cese: meta.fecha_cese || null,
    validado_por: meta.validado_por || 'WFM_OPERACIONES',
    fecha_validacion: new Date().toISOString()
  }

  if (DB_MODE === 'supabase' && isSupabaseConfigured()) {
    let query = supabase
      .from('variables_validacion_operacion')
      .update(payload)
      .in('documento', cleanDnis)

    if (periodo && periodo !== 'ALL') {
      query = query.eq('periodo', String(periodo).trim())
    }

    const { data, error } = await query.select('id, documento')
    if (error) throw error
    return { count: data?.length || 0, data }
  } else {
    return { count: cleanDnis.length }
  }
}

export async function aprobarTodosPendientesVariables(periodo, validado_por = 'WFM_SISTEMA') {
  if (DB_MODE === 'supabase' && isSupabaseConfigured()) {
    let query = supabase
      .from('variables_validacion_operacion')
      .select('id, monto_enviado, monto_aprobado, estado_validacion')
      .eq('estado_validacion', 'PENDIENTE')

    if (periodo && periodo !== 'ALL') {
      query = query.eq('periodo', String(periodo).trim())
    }

    const { data, error } = await query
    if (error) throw error

    if (!data || !data.length) return { count: 0 }

    const now = new Date().toISOString()
    const { error: updateErr } = await supabase
      .from('variables_validacion_operacion')
      .update({
        estado_validacion: 'APROBADO',
        validado_por,
        fecha_validacion: now
      })
      .eq('estado_validacion', 'PENDIENTE')
      .eq('periodo', String(periodo).trim())

    if (updateErr) throw updateErr
    return { count: data.length }
  }
  return { count: 0 }
}

export async function guardarNuevasVariablesBulk(periodo, rows = []) {
  if (!rows || !rows.length) return { count: 0 }

  const formattedRows = rows.map((r, i) => ({
    periodo: String(periodo || r.periodo || '202610').trim(),
    tipo_bono: String(r.tipo_bono || 'BIENVENIDA').toUpperCase().trim(),
    item_num: Number(r.item_num || r.item || i + 1),
    documento: String(r.documento || r.dni || '').trim().replace(/\D/g, ''),
    apellidos_nombres: String(r.apellidos_nombres || r.colaborador || r.nombre || '').trim().toUpperCase(),
    cargo: String(r.cargo || '').trim().toUpperCase(),
    campana: String(r.campana || '').trim().toUpperCase(),
    fecha_ingreso: r.fecha_ingreso ? String(r.fecha_ingreso).trim() : null,
    monto_enviado: Number(r.monto_enviado || r.monto || 0),
    monto_aprobado: Number(r.monto_aprobado ?? (r.monto_enviado || r.monto || 0)),
    monto_pagado: 0,
    estado_validacion: r.estado_validacion || 'PENDIENTE',
    fecha_cese: r.fecha_cese || null,
    motivo_ajuste: r.motivo_ajuste || null,
    observacion_operacion: r.observacion_operacion || null,
    validado_por: r.validado_por || null,
    fecha_validacion: r.fecha_validacion || null
  })).filter(r => r.documento && r.documento.length >= 7)

  if (!formattedRows.length) return { count: 0 }

  if (DB_MODE === 'supabase' && isSupabaseConfigured()) {
    const CHUNK_SIZE = 200
    let totalInserted = 0

    for (let i = 0; i < formattedRows.length; i += CHUNK_SIZE) {
      const chunk = formattedRows.slice(i, i + CHUNK_SIZE)
      const { data, error } = await supabase
        .from('variables_validacion_operacion')
        .upsert(chunk, {
          onConflict: 'periodo,tipo_bono,documento'
        })
        .select('id')

      if (error) throw error
      totalInserted += (data?.length || chunk.length)
    }

    return { count: totalInserted }
  } else {
    return { count: formattedRows.length }
  }
}

export async function aplicarValidacionExcelBulk(periodo, registrosValidacion = [], validado_por = 'WFM_OPERACIONES') {
  if (!registrosValidacion.length) return { cesados: 0, aprobados: 0, observados: 0 }

  if (DB_MODE === 'supabase' && isSupabaseConfigured()) {
    let cesadosCount = 0
    let aprobadosCount = 0
    let observadosCount = 0
    const now = new Date().toISOString()

    const cesadosDnis = []
    const aprobadosDnis = []
    const individuales = []

    for (const item of registrosValidacion) {
      const doc = String(item.documento || item.dni || '').trim().replace(/\D/g, '')
      if (!doc) continue

      const estado = String(item.estado_validacion || item.estado || 'PENDIENTE').toUpperCase().trim()

      if (estado === 'CESADO' || estado === 'BAJA') {
        cesadosDnis.push({
          doc,
          fecha_cese: item.fecha_cese || null,
          motivo: item.motivo_ajuste || 'CESE DE OPERACIÓN (BAJA)'
        })
      } else if (estado === 'APROBADO' || estado === 'ACTIVO') {
        aprobadosDnis.push(doc)
      } else {
        individuales.push({ ...item, doc, estado })
      }
    }

    if (cesadosDnis.length) {
      const dnis = cesadosDnis.map(c => c.doc)
      let q = supabase
        .from('variables_validacion_operacion')
        .update({
          estado_validacion: 'CESADO',
          monto_aprobado: 0,
          motivo_ajuste: 'CESE CONFIRMADO POR OPERACIONES',
          validado_por,
          fecha_validacion: now
        })
        .in('documento', dnis)

      if (periodo && periodo !== 'ALL') {
        q = q.eq('periodo', String(periodo).trim())
      }

      const { data, error } = await q.select('id')
      if (error) console.warn('[aplicarValidacionExcelBulk] Error cesados:', error)
      cesadosCount = data?.length || dnis.length
    }

    if (aprobadosDnis.length) {
      let q = supabase
        .from('variables_validacion_operacion')
        .update({
          estado_validacion: 'APROBADO',
          validado_por,
          fecha_validacion: now
        })
        .in('documento', aprobadosDnis)

      if (periodo && periodo !== 'ALL') {
        q = q.eq('periodo', String(periodo).trim())
      }

      const { data, error } = await q.select('id')
      if (error) console.warn('[aplicarValidacionExcelBulk] Error aprobados:', error)
      aprobadosCount = data?.length || aprobadosDnis.length
    }

    for (const ind of individuales) {
      let q = supabase
        .from('variables_validacion_operacion')
        .update({
          estado_validacion: ind.estado,
          monto_aprobado: ind.monto_aprobado !== undefined ? Number(ind.monto_aprobado) : undefined,
          observacion_operacion: ind.observacion || ind.motivo || null,
          validado_por,
          fecha_validacion: now
        })
        .eq('documento', ind.doc)

      if (periodo && periodo !== 'ALL') {
        q = q.eq('periodo', String(periodo).trim())
      }

      await q
      observadosCount++
    }

    return { cesados: cesadosCount, aprobados: aprobadosCount, observados: observadosCount }
  }

  return { cesados: 0, aprobados: 0, observados: 0 }
}




