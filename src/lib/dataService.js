import * as XLSX from 'xlsx';
/**
 * dataService.js
 * Capa de abstracción de datos: usa Supabase si está configurado,
 * si no, cae al mock de localStorage automáticamente.
 */

import { supabase, isSupabaseConfigured } from './supabase'
import { enrichGruposWithStats, inferSegmento } from './capacidadRysSync'
import { SHEET_SOURCES, sheetCsvUrl } from './sheetSources.js'
import { parseCsvToMatrix, parseNominaRows, cleanDocumento } from './nominaConsolidadoSchema.js'
import { asistenciaRecordsFromNominaRow, extractGruposFromRows } from './sheetImportUtils.js'
import { atribuirBaja } from './flujoOperativo.js'
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
  for (const key of apiCache.keys()) {
    if (key.startsWith(keyPrefix)) {
      apiCache.delete(key);
    }
  }
  deletePersistentByPrefix(keyPrefix).catch(() => {});
}

export function isBajaDia1(motivo, sigla, row) {
  if (row?.isDescuento || row?.is_descuento || String(row?.estado || '').toUpperCase().trim() === 'DESCUENTO') return false;
  const m = String(motivo || '').toUpperCase().trim();
  if (m.includes('DESCUENTO')) return false;
  const s = String(sigla || '').toUpperCase().trim();
  const t = String(row?.tipo_baja || row?.tipo || row?.tipo_reclutado || '').toUpperCase().trim();
  const stD1 = String(row?.status_dia_1 || '').toUpperCase().trim();
  if (t.includes('DESCUENTO') || stD1.includes('DESCUENTO')) return false;
  
  if (t === 'CESE' || t.includes('CESE') || stD1 === 'CESE' || stD1.includes('CESE')) return true;
  if (t.includes('DIA_1') || t.includes('DIA 1') || t.includes('D1')) return true;
  if (s === 'BD1' || s === 'D1') return true;
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
    m.includes('(BAJA DÍA 1)')
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

const VALID_ROLES = ['admin', 'reclutador', 'formador', 'visor', 'supervisor_capacitacion', 'coordinador_rys', 'jefe_rys', 'jefe_capacitacion', 'calidad']

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
          .select('documento, apellido_paterno, apellido_materno, nombres_completos, alix')
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
          return profile;
        }
      }

      if (searchTerm) {
        const { data: recData } = await supabase
          .from('equipo_reclutamiento')
          .select('documento, apellido_paterno, apellido_materno, nombres_completos, alix')
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
          return profile;
        }
      }

      // 2. Check in equipo_formacion
      if (userAlix) {
        const { data: formByAlix } = await supabase
          .from('equipo_formacion')
          .select('documento, apellido_paterno, apellido_materno, nombres_completos, usuario_alix')
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
          return profile;
        }
      }

      if (searchTerm) {
        const { data: formData } = await supabase
          .from('equipo_formacion')
          .select('documento, apellido_paterno, apellido_materno, nombres_completos, usuario_alix')
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
export function fetchAppRoles() {
  return withCache('config_roles', 600000, async () => {
    if (DB_MODE !== 'supabase') return []
    const { data, error } = await supabase.from('config_roles').select('*').order('created_at', { ascending: true })
    if (error) throw error
    return data
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
        .select('id, documento, motivo_baja, fecha_registro_asistencia, campana, codigo_grupo, grupo, nombre_formador, apellido_paterno, apellido_materno, nombres, sigla, estado, condicion_laboral, tipo_reclutado, archivo_origen')
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
        .select('id, documento, motivo_baja, fecha_registro_asistencia, campana, codigo_grupo, grupo, nombre_formador, apellido_paterno, apellido_materno, nombres, sigla, estado, condicion_laboral, tipo_reclutado, archivo_origen');

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
  if (newRole === 'supervisor_capacitacion' && segmento) {
    payload.segmento = segmento
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

export const POSTULANTES_COLUMNS = 'nomina_id, documento, tipo_documento, apellido_paterno, apellido_materno, nombres, celular, celular_referencia, usuario_whatsapp, correo, genero, edad, periodo_reclutado, semana_trabajo, reclutador, sede, campana, segmento, reclutador_id, fuente_oferta, observacion_reclutamiento, grupo_codigo, modalidad, condicion, horario_gestion, fecha_inicio_capacitacion, fecha_fin_capacitacion, fecha_conexion_ojt, fecha_ingreso, dia_0, dia_0_obs, status_dia_1, dia_1, dia_1_obs, estado, activo, created_at';

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
].join(',')

/** Snapshot WFM ya calculado: public.cobertura_dotacion */
export async function fetchCoberturaDotacion() {
  if (DB_MODE !== 'supabase') return []
  return withCache('cobertura_dotacion_v4', 180000, async () => {
    const pageSize = 1000
    const all = []
    let from = 0
    let selectList = COBERTURA_DOTACION_SELECT
    while (true) {
      const { data, error } = await supabase
        .from('cobertura_dotacion')
        .select(selectList)
        .order('id', { ascending: true })
        .range(from, from + pageSize - 1)
      if (error) {
        if (selectList !== '*' && /CAMPAÑA|column/i.test(error.message || '')) {
          selectList = '*'
          continue
        }
        throw error
      }
      const batch = data || []
      all.push(...batch)
      if (batch.length < pageSize) break
      from += pageSize
      if (from > 20000) break
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

export async function fetchKpiReclutadoresConsolidado({ periodo = null } = {}) {
  if (DB_MODE !== 'supabase') return []
  const periodoKey = periodo && periodo !== 'ALL' ? String(periodo).replace(/\D/g, '').slice(0, 6) : 'min'
  return withCache(`kpi_reclutadores_consolidado_v4_${periodoKey}`, 120000, async () => {
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
      if (periodoKey !== 'min') {
        query = query.or(`periodo_efectivo.eq.${periodoKey},periodo_reclutado.eq.${periodoKey}`)
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

export async function fetchNominasAuditoria({ periodo = null } = {}) {
  if (DB_MODE !== 'supabase') return []
  const periodoKey = periodo && periodo !== 'ALL' ? String(periodo).replace(/\D/g, '').slice(0, 6) : 'min'
  return withCache(`nominas_auditoria_v2_${periodoKey}`, 180000, async () => {
    const pageSize = 1000
    const all = []
    let from = 0
    const cols = 'documento, reclutador, campana, grupo_codigo, segmento, marca_temporal, created_at, fecha_ingreso, fecha_conexion_ojt, periodo_reclutado, semana_trabajo, activo'
    while (true) {
      let query = supabase
        .from('v_nominas_consolidado')
        .select(cols)
        .eq('activo', true)
        .order('created_at', { ascending: false })
        .range(from, from + pageSize - 1)
      if (periodoKey !== 'min') {
        query = query.eq('periodo_reclutado', periodoKey)
      } else {
        query = query.gte('periodo_reclutado', '202608')
      }
      const { data, error } = await query
      if (error) throw error
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
    const { data: existing } = await supabase
      .from('capacidad_rys')
      .select('*')
      .eq('codigo', cleanCodigo)
      .maybeSingle()

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
        const { error } = await supabase
          .from('capacidad_rys')
          .update(grupoRow)
          .eq('codigo', cleanCodigo)
        if (error) throw error
      }
    } else {
      const { error } = await supabase
        .from('capacidad_rys')
        .insert(grupoRow)
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

/** Importa filas CAPACIDAD_RYS (CSV/Excel export) en lote optimizado */
export async function importCapacidadRysBulk(payloads, { onProgress } = {}) {
  const results = { ok: 0, fail: 0, deleted: 0, ignored: 0, total: payloads.length, errors: [] }
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

  // 2. Rescatar datos manuales antes de borrar
  try {
    const { data: existingData } = await supabase.from('capacidad_rys').select('codigo, campana, formador_documento')
    const existingMap = new Map()
    if (existingData) {
      for (const g of existingData) {
        existingMap.set(g.campana + '_' + g.codigo, g.formador_documento)
      }
    }

    const { error: errDel } = await supabase.from('capacidad_rys').delete().neq('codigo', 'xxxx_impossible_xxxx')
    if (errDel) throw errDel

    results.deleted = 0 // Optional: count existing before deleting si lo necesitas, pero no es crítico

    // 3. Preparar filas para inserción masiva en capacidad_rys
    const rowsToUpsert = validPayloads.map(p => {
      const campana = (p.campana_nombre || 'SIN CAMPAÑA').toUpperCase()
      const codigo = p.codigo || null
      
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
        area_traslado: p.area_traslado || null,
        segmento: p.segmento ? String(p.segmento).trim() : inferSegmento(campana),
        estado: p.estado || 'PLANIFICADO',
        formador_documento: existingMap.get(campana + '_' + codigo) || null,
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

    // Map consolidado_asistencias back to standard asistencias structure
    // We keep the latest record per document+date, but always protect I-OP records
    const map = new Map();
    data.forEach(row => {
      let isoDate = parseFechaAsistencia(row.fecha_registro_asistencia);
      const cleanDoc = String(row.documento || '').trim();
      const cleanGrupo = String(row.codigo_grupo || row.grupo || '').trim();
      const semNum = String(row.archivo_origen || '').replace(/\D/g, '');
      const semFromArchivo = semNum ? `SEM ${parseInt(semNum, 10)}` : '';
      
      if (isoDate && cleanDoc) {
        const key = `${cleanGrupo}_${cleanDoc}_${isoDate}`;
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
        });
      }
    });

    return Array.from(map.values()).sort((a, b) => b.fecha_asistencia.localeCompare(a.fecha_asistencia));
  }
  initLocalStorageDb()
  return getFromStorage('asistencias') || []
}

export async function upsertAsistencias({ grupo_codigo, grupoMeta, fecha_asistencia, records }) {
  if (DB_MODE === 'supabase') {
    grupo_codigo = grupo_codigo || grupoMeta?.codigo;
    
    // First, delete existing records for this group and date
    const { error: delErr } = await supabase
      .from('asistencias_capacitacion')
      .delete()
      .eq('grupo_codigo', grupo_codigo)
      .eq('fecha_asistencia', fecha_asistencia)

    if (delErr) console.warn('Error borrando asistencias previas:', delErr.message);

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

    // 3. Ejecutar updates de forma concurrente con Promise.all
    const updatePromises = [];

    for (const [obs, { motivo, docs }] of bajasByMotivo.entries()) {
      if (docs.length > 0) {
        updatePromises.push(
          supabase
            .from('nominas')
            .update({
              estado: 'BAJA',
              motivo_baja: motivo,
              observacion_estado: obs,
              updated_at: new Date().toISOString(),
            })
            .in('documento', docs)
            .eq('activo', true)
        );
      }
    }

    if (activeDocs.length > 0) {
      updatePromises.push(
        supabase
          .from('nominas')
          .update({
            estado: 'ACTIVO',
            observacion_estado: null,
            updated_at: new Date().toISOString(),
          })
          .in('documento', activeDocs)
          .eq('activo', true)
          .in('estado', ['BAJA', 'CESADO', 'INACTIVO', 'DESERTO'])
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

    const { data, error } = await supabase
      .from('reclutadores')
      .select('id, nombre_completo, activo')
      .eq('activo', true)
      .order('nombre_completo')
    if (error) throw error
    return data
  }
  // Local fallback
  const list = getFromStorage('reclutadores') || []
  return list.map((nombre, index) => ({
    id: index + 1,
    nombre_completo: nombre,
    activo: true
  }))
}

export function fetchGruposConMetas() {
  return withCache('grupos_con_metas', 180000, async () => {
    if (DB_MODE === 'supabase') {
      // 1. Fetch groups and recruiters in parallel (consultando solo columnas necesarias de nominas activas)
      const [gruposRes, relRes, nominasRes, equipoRes, asisRes] = await Promise.all([
        supabase
          .from('capacidad_rys')
          .select('codigo, periodo, periodo_ingreso_op, semana_label, semana_trabajo, estado, meta_dia_0, meta_dia_1, rq_solicitado, rq_ftes_solicitado, area_traslado, campana, segmento, modalidad, sede, rango_horario, fecha_registro, fecha_inicio_ojt, fecha_ingreso_op')
          .order('codigo'),
        supabase
          .from('grupo_reclutadores')
          .select('grupo_codigo, reclutador_id, meta_rq_individual, meta_dia_1_individual, reclutadores(nombre_completo)'),
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
          .limit(10000)
      ])

    if (gruposRes.error) throw gruposRes.error
    if (relRes.error) throw relRes.error
    if (nominasRes.error) throw nominasRes.error

    const equipoMap = {}
    for (const eq of (equipoRes.data || [])) {
      const full = `${eq.apellido_paterno || ''} ${eq.apellido_materno || ''} ${eq.nombres_completos || ''}`.trim().replace(/\s+/g, ' ').toUpperCase()
      equipoMap[full] = { documento: eq.documento, alias: eq.alias }
    }

    const relMap = {}
    for (const r of (relRes.data || [])) {
      if (!relMap[r.grupo_codigo]) relMap[r.grupo_codigo] = []
      const nomFull = (r.reclutadores?.nombre_completo || 'Desconocido').toUpperCase()
      const eqData = equipoMap[nomFull] || {}
      
      relMap[r.grupo_codigo].push({
        reclutador_id: r.reclutador_id,
        nombre_completo: r.reclutadores?.nombre_completo || 'Desconocido',
        documento: eqData.documento || null,
        alias: eqData.alias || null,
        meta_rq_individual: r.meta_rq_individual || 0,
        meta_dia_1_individual: r.meta_dia_1_individual || 0
      })
    }

    const nominas = nominasRes.data || []
    const asisData = asisRes.data || []
    
    // Group asistencias by group and doc
    const bajaDia1Set = new Set()
    for (const a of asisData) {
      const m = String(a.motivo_baja || '').toUpperCase()
      const e = String(a.estado || '').toUpperCase()
      if (m.includes('BAJA DIA 1') || e.includes('BAJA DIA 1')) {
        bajaDia1Set.add(`${a.codigo_grupo}|${a.campana}|${a.documento}`)
      }
    }

    return (gruposRes.data || []).map(g => {
      const gCodigo = g.codigo || ''
      const gCampana = g.campana || ''
      const reclutadoresAsignados = relMap[gCodigo] || []
      
      // Filter nominas for this specific group + campaign
      const nominasGrupo = nominas.filter(n => n.grupo_codigo === gCodigo && n.campana === gCampana)

      // Get sede from capacidad_rys or fallback to most frequent sede in nominas
      let sede = (g.sede && g.sede.trim() && g.sede.trim() !== '-') ? g.sede.trim() : '-'
      if (sede === '-' && nominasGrupo.length > 0) {
        const sedeCounts = {}
        let maxCount = 0
        nominasGrupo.forEach(n => {
          if (n.sede) {
            sedeCounts[n.sede] = (sedeCounts[n.sede] || 0) + 1
            if (sedeCounts[n.sede] > maxCount) {
              maxCount = sedeCounts[n.sede]
              sede = n.sede
            }
          }
        })
      }

      // Group totals
      const listaActual = nominasGrupo.length
      const conectadosDia0 = nominasGrupo.filter(n => n.dia_0 === 'ASISTIO').length
      const conectadosDia1 = nominasGrupo.filter(n => n.dia_1 === 'ASISTIO' && !bajaDia1Set.has(`${gCodigo}|${gCampana}|${n.documento}`)).length

      // Map over recruiters to add their individual counts
      const reclutadoresConStats = reclutadoresAsignados.map(r => {
        const nominasReclutador = nominasGrupo.filter(n => n.reclutador_id === r.reclutador_id)
        return {
          ...r,
          conteo_individual: nominasReclutador.length,
          conectados_dia_1_individual: nominasReclutador.filter(n => n.dia_1 === 'ASISTIO' && !bajaDia1Set.has(`${gCodigo}|${gCampana}|${n.documento}`)).length
        }
      })

      return {
        grupo_codigo: gCodigo,
        codigo: gCodigo,
        periodo: g.periodo || '',
        periodo_ingreso_op: g.periodo_ingreso_op || '',
        campana_nombre: gCampana || 'Sin Campaña',
        campana: gCampana || 'Sin Campaña',
        segmento: g.segmento || '',
        supervisor: '',
        estado: g.estado || '',
        area_traslado: g.area_traslado || '',
        condicion: g.condicion || '',
        semana: g.semana_label || '',
        semana_label: g.semana_label || '',
        semana_trabajo: g.semana_trabajo || null,
        modalidad: g.modalidad || '',
        horario: g.rango_horario || '',
        fecha_inicio: g.fecha_inicio || g.fecha_registro || '',
        fecha_registro: g.fecha_registro || '',
        fecha_inicio_ojt: g.fecha_inicio_ojt || '',
        fecha_ingreso_op: g.fecha_ingreso_op || '',
        meta_dia_0: g.meta_dia_0 || 0,
        meta_dia_1: g.meta_dia_1 || 0,
        meta_dia_0_grupal: g.meta_dia_0 || 0,
        meta_dia_1_grupal: g.meta_dia_1 || 0,
        rq_solicitado: (String(g.area_traslado || '').trim().toUpperCase() === 'RECLUTAMIENTO') ? (g.rq_solicitado || 0) : 0,
        rq_ftes_solicitado: (String(g.area_traslado || '').trim().toUpperCase() === 'RECLUTAMIENTO') ? (g.rq_ftes_solicitado || 0) : 0,
        reclutadores_metas: reclutadoresConStats,
        sede,
        lista_actual: listaActual,
        conectados_dia_0: conectadosDia0,
        conectados_dia_1_grupal: conectadosDia1
      }
    })
  }

  // Local fallback
  return []
  })
}

export async function saveGrupoMetas(grupoCodigo, reclutadoresMetas) {
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
        meta_rq_individual: rm.meta_rq_individual || 0,
        meta_dia_1_individual: rm.meta_dia_1_individual || 0
      }))
      const { error: insErr } = await supabase
        .from('grupo_reclutadores')
        .insert(rows)
      if (insErr) throw insErr
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
  if (DB_MODE !== 'supabase' || !payloads || payloads.length === 0) return;
  
  // Limpiar duplicados previos de esa misma fecha, grupo Y CAMPAÑA antes de insertar el estado más fresco
  const sample = payloads[0];
  const targetGroup = sample.codigo_grupo || sample.grupo;
  const targetFecha = sample.fecha_registro_asistencia;
  const targetCampana = sample.campana;
  
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

      const { error: delErr } = await delQuery;
      if (delErr) console.warn('Aviso al limpiar registros previos del día:', delErr);
    } catch (cleanErr) {
      console.warn('Aviso al limpiar registros previos del día:', cleanErr);
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
    for (const r of records) {
      const isoDate = r.fecha;
      if (!isoDate) continue;
      const [year, month, day] = isoDate.split('-');
      const spreadsheetDate = `${parseInt(day, 10)}/${parseInt(month, 10)}/${year}`;
      const isBaja = r.sigla === 'B';

      // 1. Limpiar SOLO el registro previo de ESTE postulante en esta fecha y grupo en consolidado_asistencias
      try {
        await supabase
          .from('consolidado_asistencias')
          .delete()
          .eq('codigo_grupo', targetGroup)
          .eq('documento', cleanDoc)
          .or(`fecha_registro_asistencia.eq.${spreadsheetDate},fecha_registro_asistencia.eq.${isoDate}`);
      } catch (errCleanConsolidado) {
        console.warn('Aviso limpiando consolidado para regularización:', errCleanConsolidado);
      }

      // 2. Limpiar SOLO el registro de ESTE postulante en asistencias_capacitacion
      try {
        await supabase
          .from('asistencias_capacitacion')
          .delete()
          .eq('grupo_codigo', targetGroup)
          .eq('postulante_documento', cleanDoc)
          .eq('fecha_asistencia', isoDate);
      } catch (errCleanAsis) {
        console.warn('Aviso limpiando asistencias_capacitacion para regularización:', errCleanAsis);
      }

      // 3. Insertar nuevo registro en consolidado_asistencias
      const consolidadoPayload = {
        archivo_origen: weekStr,
        documento: cleanDoc,
        apellido_materno: postulanteInfo.apellido_materno || '',
        apellido_paterno: postulanteInfo.apellido_paterno || '',
        nombres: postulanteInfo.nombres || '',
        celular: postulanteInfo.celular || '',
        condicion_laboral: postulanteInfo.condicion_laboral || '',
        campana: campana || postulanteInfo.campana || '',
        grupo: targetGroup,
        codigo_grupo: targetGroup,
        documento_formador: formadorDoc || '',
        nombre_formador: formadorNombre || '',
        fecha_registro_asistencia: spreadsheetDate,
        tipo_reclutado: postulanteInfo.tipoReclutado || postulanteInfo.tipo_reclutado || 'APTO',
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

      // 4. Insertar nuevo registro en asistencias_capacitacion
      try {
        await supabase
          .from('asistencias_capacitacion')
          .insert([{
            grupo_codigo: targetGroup,
            postulante_documento: cleanDoc,
            fecha_asistencia: isoDate,
            sigla_asistencia: r.sigla,
            motivo_baja: isBaja ? (r.motivo_baja || 'DESERCIÓN') : null,
            usuario_registro: formadorNombre || 'REGULARIZACION'
          }]);
      } catch (insAsisErr) {
        console.warn('Aviso insertando en asistencias_capacitacion:', insAsisErr);
      }
    }

    // Invalidar cachés
    invalidateCache('all_consolidado');
    invalidateCache('all_asistencias_bajas');
    invalidateCache('all_motivos_bajas');
    invalidateCache('grupos_dia1');
    invalidateCache('asistencias');

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
      celular: postulanteInfo.celular || '',
      condicion_laboral: postulanteInfo.condicion_laboral || '',
      campana: cleanCampana,
      grupo: targetGroup,
      codigo_grupo: targetGroup,
      documento_formador: postulanteInfo.documento_formador || '',
      nombre_formador: postulanteInfo.nombre_formador || '',
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

    const [consData, capRes, nominasData, postulantesData] = await Promise.all([
      fetchAllConsolidado(options),
      supabase.from('capacidad_rys').select('codigo, campana, meta_dia_1, rq_solicitado, rq_ftes_solicitado, fecha_inicio_ojt, periodo, periodo_ingreso_op, segmento, semana_label, semana_trabajo, estado, modalidad'),
      fetchAllNominasPaginado(),
      fetchAllPostulantesPaginado()
    ]);

    if (capRes.error) console.warn('Error fetching capacidad_rys in fetchMotivosBajasData:', capRes.error);

    return {
      consolidado: consData || [],
      capacidades: capRes.data || [],
      nominas: nominasData || [],
      postulantes: postulantesData || []
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

  // Actualizar estado en nóminas si hubo bajas
  if (bajas.length > 0) {
    await supabase.from('nominas')
      .update({ estado: 'CESADO', activo: false, updated_at: new Date().toISOString() })
      .in('documento', bajas)
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
    .select('documento, fecha_registro_asistencia, sigla, motivo_baja, estado')
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
      fecha_asistencia: isoDate
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

    const isCeseRec = recCandidate && String(recCandidate.status_dia_1 || recCandidate.estado || recCandidate.tipo_reclutado || recCandidate.motivo_baja || '').toUpperCase().includes('CESE');
    const isBajaDia1Rec = recCandidate && String(recCandidate.motivo_baja || '').toUpperCase().includes('BAJA DIA 1');
    const isCeseForm = (formRecord && String(formRecord.tipo_reclutado || formRecord.estado || formRecord.motivo_baja || '').toUpperCase().includes('CESE')) ||
                       studentRecords.some(r => isBajaDia1(r.motivo_baja, r.sigla_asistencia, r) || String(r.motivo_baja || '').toUpperCase().includes('BAJA DIA 1'));
    const isBajaForm = (formRecord && (formRecord.sigla_asistencia === 'B' || formRecord.estado === 'CESADO')) || isCeseRec || isCeseForm || isBajaDia1Rec;
    const isBajaDia1Direct = Boolean(isBajaForm || isCeseRec || isBajaDia1Rec);

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
    
    // Regla de Negocio Oficial: En Formación cuentan todos los postulantes activos/aptos (así tengan falta FI/FJ),
    // descontando únicamente a quienes son BAJA DÍA 1 / CESADOS.
    const isFormAsistencia = Boolean(formRecord && !isBajaForm);

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
    .select('documento, fecha_registro_asistencia, sigla, motivo_baja, estado')
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
      fecha_asistencia: isoDate
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
      // Regla de Negocio: No cuenta en la entrega de Día 1 de Reclutamiento ni genera descalibración.
      continue
    }

    const isCeseRec = recCandidate && String(recCandidate.status_dia_1 || recCandidate.estado || recCandidate.tipo_reclutado || recCandidate.motivo_baja || '').toUpperCase().includes('CESE');
    const isBajaDia1Rec = recCandidate && String(recCandidate.motivo_baja || '').toUpperCase().includes('BAJA DIA 1');
    const isCeseForm = (formRecord && String(formRecord.tipo_reclutado || formRecord.estado || formRecord.motivo_baja || '').toUpperCase().includes('CESE')) ||
                       studentRecords.some(r => isBajaDia1(r.motivo_baja, r.sigla_asistencia, r) || String(r.motivo_baja || '').toUpperCase().includes('BAJA DIA 1'));
    const isBajaForm = (formRecord && (formRecord.sigla_asistencia === 'B' || formRecord.estado === 'CESADO')) || isCeseRec || isCeseForm || isBajaDia1Rec;
    const isBajaDia1Direct = Boolean(isBajaForm || isCeseRec || isBajaDia1Rec);

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
    
    // Regla de Negocio Oficial: En Formación cuentan todos los postulantes activos/aptos (así tengan falta FI/FJ),
    // descontando únicamente a quienes son BAJA DÍA 1 / CESADOS.
    const isFormAsistencia = Boolean(formRecord && !isBajaForm);

    const isRecAsistencia = recCandidate ? isCandidateActiveRec(recCandidate) : false;
    
    if (isRecAsistencia) countRec++
    if (isFormAsistencia) countForm++
  }
  return { rec: countRec, form: countForm }
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
    .select('documento, fecha_registro_asistencia, sigla, motivo_baja, estado, tipo_reclutado, nombres, apellido_paterno, apellido_materno')
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
      fecha_asistencia: parseFechaAsistencia(row.fecha_registro_asistencia)
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

    const isCeseRec = recCandidate && String(recCandidate.status_dia_1 || recCandidate.estado || recCandidate.tipo_reclutado || recCandidate.motivo_baja || '').toUpperCase().includes('CESE');
    const isBajaDia1Rec = recCandidate && String(recCandidate.motivo_baja || '').toUpperCase().includes('BAJA DIA 1');
    const isCeseForm = (formRecord && String(formRecord.tipo_reclutado || formRecord.estado || formRecord.motivo_baja || '').toUpperCase().includes('CESE')) ||
                       studentRecords.some(r => isBajaDia1(r.motivo_baja, r.sigla_asistencia, r) || String(r.motivo_baja || '').toUpperCase().includes('BAJA DIA 1'));
    const isBajaForm = (formRecord && (formRecord.sigla_asistencia === 'B' || formRecord.estado === 'CESADO')) || isCeseRec || isCeseForm || isBajaDia1Rec;
    const isBajaDia1Direct = Boolean(isBajaForm || isCeseRec || isBajaDia1Rec);

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
    
    // Regla de Negocio Oficial: En Formación cuentan todos los postulantes activos/aptos (así tengan falta FI/FJ),
    // descontando únicamente a quienes son BAJA DÍA 1 / CESADOS.
    const isFormAsistencia = Boolean(formRecord && !isBajaForm);

    const isRecAsistencia = recCandidate ? isCandidateActiveRec(recCandidate) : false;
    
    if (isFormAsistencia !== isRecAsistencia) {
      let displayFormSigla = 'SIN REGISTRO';
      if (isBajaForm) {
        displayFormSigla = 'CESADO (BAJA DÍA 1)';
      } else if (formRecord) {
        const fs = String(formRecord.sigla_asistencia || '').toUpperCase().trim();
        if (isFormadorAsistio(fs) || isFormAsistencia) {
          displayFormSigla = 'ACTIVO';
        } else if (fs === 'FI' || fs === 'F' || fs === 'FALTA') {
          displayFormSigla = 'FALTA (FI)';
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
export async function syncApprovedDescuentosToConsolidado(dnis = []) {
  if (DB_MODE !== 'supabase' || !dnis || dnis.length === 0) return;
  try {
    const cleanDnis = [...new Set(dnis.map(d => String(d || '').trim().replace(/\D/g, '') || String(d || '').trim().toUpperCase()).filter(Boolean))];
    if (cleanDnis.length === 0) return;

    for (const dni of cleanDnis) {
      await supabase
        .from('consolidado_asistencias')
        .update({
          estado: 'DESCUENTO',
          sigla: 'DESC',
          motivo_baja: 'DESCUENTO'
        })
        .or(`documento.eq.${dni},documento.ilike.%${dni}%`);
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
    const expiredDnis = [];

    for (const row of data) {
      if (row.procede === 'NO PROCEDE' || row.autoriza_rys === 'NO') continue;
      const regTime = row.fecha_registro || row.fecha_baja;
      if (isDescuentoVencido48h(regTime, now)) {
        expiredIds.push(row.id);
        if (row.dni_ce) expiredDnis.push(row.dni_ce);
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
        if (expiredDnis.length > 0) {
          syncApprovedDescuentosToConsolidado(expiredDnis).catch(() => {});
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
      const isExpired = isDescuentoVencido48h(d.fecha_registro || d.created_at || d.fecha_baja);
      if (isExpired && d.procede !== 'NO PROCEDE' && d.autoriza_rys !== 'NO') {
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
    const isExplicitFueraDePlazo = String(p.fuera_de_plazo || '').trim().toUpperCase() === 'SI';
    
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
      autoriza_cap: 'SI',
      fuera_de_plazo: isExplicitFueraDePlazo ? 'SI' : 'NO',
      
      // Todo descuento nuevo ingresa como PENDIENTE para revisión de RyS. El reloj de 48h hábiles empieza en fecha_registro.
      autoriza_rys: isExplicitFueraDePlazo ? 'SI' : '',
      comentario_rys: isExplicitFueraDePlazo ? (p.comentario_rys || 'descuento aprobado por tiempo de respuesta') : '',
      procede: isExplicitFueraDePlazo ? 'PROCEDE' : 'PENDIENTE',
      
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
    const dnis = data.map(r => r.dni_ce).filter(Boolean);
    if (dnis.length > 0) {
      syncApprovedDescuentosToConsolidado(dnis).catch(() => {});
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
    
    // Calcular el Procede según la fórmula
    let procedeStr = 'PENDIENTE';
    const autCap = update.autoriza_cap || '';
    const autRys = update.estado || '';
    
    if (autCap === '' && autRys === 'SI') {
      procedeStr = 'PENDIENTE';
    } else if (autCap === '' || autRys === '') {
      procedeStr = '';
    } else if (autCap === 'SI' && autRys === 'SI') {
      procedeStr = 'PROCEDE';
    } else {
      procedeStr = 'NO PROCEDE';
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
        syncApprovedDescuentosToConsolidado([update.dni_ce]).catch(() => {});
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
      if (error.code === '42P01') {
        console.warn("Table propuestas_consolidado doesn't exist. Falling back to local storage.");
        // continue to local storage below
      } else {
        throw error;
      }
    } else {
      return data || [];
    }
  }
  
  initLocalStorageDb();
  return getFromStorage('propuestas_consolidado') || [];
}

export async function savePropuesta(payloadForm, payloadConsolidado) {
  if (DB_MODE === 'supabase') {
    let propId = payloadForm.id;
    let savedForm;

    try {
      // 1. Save RAW Form
      if (!propId) {
        const { data, error } = await supabase
          .from('propuestas')
          .insert([payloadForm])
          .select()
          .single();
        if (error) throw error;
        savedForm = data;
        propId = data.id;
      } else {
        const { data, error } = await supabase
          .from('propuestas')
          .update(payloadForm)
          .eq('id', propId)
          .select()
          .single();
        if (error) throw error;
        savedForm = data;
      }

      // 2. Save Consolidado
      const consPayload = { ...payloadConsolidado, propuesta_id: propId };
      // Try to check if consolidado exists
      const { data: existingCons } = await supabase
        .from('propuestas_consolidado')
        .select('id')
        .eq('propuesta_id', propId)
        .maybeSingle();

      if (existingCons) {
        await supabase
          .from('propuestas_consolidado')
          .update(consPayload)
          .eq('propuesta_id', propId);
      } else {
        await supabase
          .from('propuestas_consolidado')
          .insert([consPayload]);
      }
      
      return savedForm;
    } catch (error) {
      console.warn("Supabase Error saving propuestas (may need tables created):", error);
      // Fallback to local storage below if supabase fails
    }
  }
  
  // Local Storage Fallback
  initLocalStorageDb();
  const props = getFromStorage('propuestas') || [];
  const cons = getFromStorage('propuestas_consolidado') || [];
  
  let newProp;
  if (payloadForm.id) {
    const idx = props.findIndex(l => l.id === payloadForm.id);
    if (idx >= 0) {
      props[idx] = { ...props[idx], ...payloadForm, updated_at: new Date().toISOString() };
      newProp = props[idx];
      saveToStorage('propuestas', props);
    }
  }
  
  if (!newProp) {
    newProp = { ...payloadForm, id: 'prop-' + Date.now(), created_at: new Date().toISOString() };
    props.push(newProp);
    saveToStorage('propuestas', props);
  }

  // Handle consolidado local
  const consPayload = { ...payloadConsolidado, propuesta_id: newProp.id, created_at: newProp.created_at || new Date().toISOString() };
  const consIdx = cons.findIndex(c => c.propuesta_id === newProp.id);
  if (consIdx >= 0) {
    cons[consIdx] = { ...cons[consIdx], ...consPayload };
  } else {
    cons.push(consPayload);
  }
  saveToStorage('propuestas_consolidado', cons);
  
  return newProp;
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
      console.error(`Error actualizando ${field} del grupo:`, error);
      throw error;
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
export async function adjudicarPostulantesPoolBulk({ targetGrupo, targetCampana, postulantes }) {
  if (DB_MODE !== 'supabase') throw new Error("Requiere conexión a Supabase")
  if (!targetGrupo) throw new Error("El código del grupo destino es obligatorio")
  if (!postulantes || postulantes.length === 0) return { success: true, inserted: 0, updated: 0 }

  const cleanGrupo = String(targetGrupo).trim().toUpperCase()
  const cleanCampana = String(targetCampana || '').trim().toUpperCase()

  // 1. Intentar ejecutar mediante el RPC transaccional de PostgreSQL
  try {
    const { data, error } = await supabase.rpc('adjudicar_postulantes_pool', {
      p_target_grupo: cleanGrupo,
      p_target_campana: cleanCampana,
      p_postulantes: postulantes
    })

    if (!error && data) {
      invalidateCache('all_consolidado')
      invalidateCache('resumen_cap_')
      invalidateCache('grupos_con_metas')
      invalidateCache('all_asistencias_bajas')
      invalidateCache('all_nominas')
      invalidateCache('nominas_dataset')
      return data
    }
  } catch (rpcErr) {
    console.warn("RPC adjudicar_postulantes_pool no disponible, usando fallback cliente:", rpcErr)
  }

  // 2. Inserción directa de nuevos registros en cliente (preservando historial previo de otros grupos)
  const { data: insData, error: insErr } = await supabase
    .from('nominas')
    .insert(postulantes)

  if (insErr) throw insErr

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
          .select('documento, codigo_grupo, campana, sigla, motivo_baja, estado, tipo_reclutado, fecha_registro_asistencia, periodo')
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

        const isCeseRec = recCandidate && String(recCandidate.status_dia_1 || recCandidate.estado || recCandidate.tipo_reclutado || recCandidate.motivo_baja || '').toUpperCase().includes('CESE');
        const isBajaDia1Rec = recCandidate && String(recCandidate.motivo_baja || '').toUpperCase().includes('BAJA DIA 1');
        const isCeseForm = (formRecord && String(formRecord.tipo_reclutado || formRecord.estado || formRecord.motivo_baja || '').toUpperCase().includes('CESE')) ||
                           studentRecords.some(r => isBajaDia1(r.motivo_baja, r.sigla_asistencia, r) || String(r.motivo_baja || '').toUpperCase().includes('BAJA DIA 1'));
        const isBajaForm = (formRecord && (formRecord.sigla_asistencia === 'B' || formRecord.estado === 'CESADO')) || isCeseRec || isCeseForm || isBajaDia1Rec;
        const isBajaDia1Direct = Boolean(isBajaForm || isCeseRec || isBajaDia1Rec);

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
        
        // Regla de Negocio Oficial: En Formación cuentan todos los postulantes activos/aptos en sala
        const isFormAsistencia = Boolean(formRecord && !isBajaForm);
        
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
          } else if (formRecord) {
            const fs = String(formRecord.sigla_asistencia || '').toUpperCase().trim();
            if (isFormadorAsistio(fs) || isFormAsistencia) {
              displayFormSigla = 'ACTIVO';
            } else if (fs === 'FI' || fs === 'F' || fs === 'FALTA') {
              displayFormSigla = 'FALTA (FI)';
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

      // Activo Actual en Aula (sigue en aula de teoría, no ha pasado a OJT ni es baja, y grupo sigue abierto)
      if (!isGrupoCerrado && dia1Asistio && !isBajaGeneral && !tieneIngreso && !isOjtActive) {
        activos_actuales++;
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
  let configs = [];
  
  // 1. Leer de propuestas_consolidado en Supabase (tabla canónica de 26 columnas)
  if (DB_MODE === 'supabase') {
    try {
      const { data: propData, error: propErr } = await supabase
        .from('propuestas_consolidado')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (!propErr && propData && propData.length > 0) {
        for (const p of propData) {
          const cod = String(p.cod || '').toUpperCase().trim();
          const grp = String(p.grupo || p.grupo_codigo || '').toUpperCase().trim();
          const grupoCodigo = grp || cod;
          
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

          configs.push({
            id: p.id,
            // 26 columnas canónicas
            periodoCapa: p.periodoCapa || p.periodo_capa || p.periodo || '',
            semana: p.semana || p.semana_trabajo || '',
            segmento: p.segmento || '',
            campana: p.campana || '',
            grupo: grp,
            modalidad: p.modalidad || 'REMOTO',
            condicionLaboral: p.condicionLaboral || p.condicion_laboral || 'FULL TIME',
            cod: cod || `${p.campana || ''}${grp}`,
            fechaInicioCapa: p.fechaInicioCapa || p.fecha_inicio_capa || '',
            ingresoOperacion: p.ingresoOperacion || p.ingreso_operacion || '',
            mesAfectacionCapa: p.mesAfectacionCapa || p.mes_afectacion_capa || '',
            mesAfectacionBonos: p.mesAfectacionBonos || p.mes_afectacion_bonos || '',
            pagoPorDia: parseFloat(p.pagoPorDia || p.pago_por_dia || p.pagoCapaPorDia) || 0,
            diasCapa: parseInt(p.diasCapa || p.dias_capa) || 0,
            cantDiasFeriados: parseInt(p.cantDiasFeriados || p.cant_dias_feriados) || 0,
            pagoCompleto: parseFloat(p.pagoCompleto || p.pago_completo || p.pagoCapaTotal) || 0,
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
            
            // Compatibilidad para filtros y tablas legacy
            grupo_codigo: grupoCodigo,
            periodo: p.periodoCapa || p.periodo_capa || p.periodo || '',
            semana_trabajo: p.semana || p.semana_trabajo || '',
            monto_dia_capa: parseFloat(p.pagoPorDia || p.pago_por_dia || p.pagoCapaPorDia) || 0,
            bono_bienvenida: m1Bvda,
            bono_permanencia_total: totalPerm,
            cuotas_permanencia: cuotasPermCount,
            bono_asistencia_perfecta: m1Asis,
            notas: p.notas || 'Propuesta de Grupo Integrada'
          });
        }
      }
    } catch (e) {
      console.warn("Error leyendo propuestas_consolidado en Supabase:", e);
    }
  }

  // 2. Fallback a LocalStorage si no hay datos
  if (configs.length === 0) {
    initLocalStorageDb();
    const local = getFromStorage('propuestas_consolidado') || getFromStorage('config_pagos_grupo') || [];
    if (local.length > 0) configs = local;
  }

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
    fechaInicioCapa: String(config.fechaInicioCapa || '').trim(),
    ingresoOperacion: String(config.ingresoOperacion || '').trim(),
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

  if (DB_MODE === 'supabase') {
    try {
      if (config.id && String(config.id).length > 20) {
        // Actualizar por id existente
        const { data, error } = await supabase
          .from('propuestas_consolidado')
          .update(payloadConsolidado)
          .eq('id', config.id)
          .select()
          .single();
        if (!error && data) return data;
      } else {
        const periodo = payloadConsolidado.periodoCapa
        const semana = payloadConsolidado.semana
        const segmento = payloadConsolidado.segmento
        const { data: candidates } = await supabase
          .from('propuestas_consolidado')
          .select('id, grupo, campana, segmento, periodoCapa, semana, cod')
          .eq('grupo', grp)

        const sameSemana = (a, b) => {
          const num = (v) => String(v || '').replace(/\D/g, '')
          return num(a) && num(a) === num(b)
        }
        const existing = (candidates || []).find((row) => (
          String(row.campana || '').trim().toUpperCase() === String(camp).trim().toUpperCase()
          && String(row.segmento || '').trim().toUpperCase() === String(segmento).trim().toUpperCase()
          && String(row.periodoCapa || '').trim().toUpperCase() === String(periodo).trim().toUpperCase()
          && sameSemana(row.semana, semana)
        ))

        if (existing?.id) {
          const { data, error } = await supabase
            .from('propuestas_consolidado')
            .update(payloadConsolidado)
            .eq('id', existing.id)
            .select()
            .single();
          if (!error && data) return data;
        } else {
          const { data, error } = await supabase
            .from('propuestas_consolidado')
            .insert([payloadConsolidado])
            .select()
            .single();
          if (!error && data) return data;
        }
      }
    } catch (e) {
      console.warn("Error guardando propuesta en Supabase:", e);
    }
  }

  // Fallback a LocalStorage
  initLocalStorageDb();
  const existing = getFromStorage('propuestas_consolidado') || [];
  const sameSemana = (a, b) => {
    const num = (v) => String(v || '').replace(/\D/g, '')
    return num(a) && num(a) === num(b)
  }
  const idx = existing.findIndex(c =>
    (config.id && c.id === config.id)
    || (
      String(c.grupo || '').toUpperCase() === grp
      && String(c.campana || '').trim().toUpperCase() === String(camp).trim().toUpperCase()
      && String(c.segmento || '').trim().toUpperCase() === String(payloadConsolidado.segmento).trim().toUpperCase()
      && String(c.periodoCapa || '').trim().toUpperCase() === String(payloadConsolidado.periodoCapa).trim().toUpperCase()
      && sameSemana(c.semana, payloadConsolidado.semana)
    )
  );
  const recordWithId = { ...payloadConsolidado, id: config.id || ('local-' + Date.now()) };
  if (idx >= 0) existing[idx] = recordWithId;
  else existing.push(recordWithId);
  saveToStorage('propuestas_consolidado', existing);
  return recordWithId;
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

export async function fetchNominasPagosCapacitacion({ periodo, semana, segmento, campana, grupo_codigo } = {}) {
  // 1. Obtener grupos objetivo según filtros usando capacidad_rys como fuente oficial
  let targetGrupos = [];
  if (grupo_codigo && grupo_codigo !== 'TODOS') {
    targetGrupos = [grupo_codigo];
  } else {
    try {
      let capQ = supabase.from('capacidad_rys').select('codigo, campana, segmento, semana_label, semana_trabajo, periodo');
      if (periodo && periodo !== 'TODOS') capQ = capQ.eq('periodo', periodo);
      if (campana && campana !== 'TODAS') capQ = capQ.eq('campana', campana);
      if (segmento && segmento !== 'TODOS') capQ = capQ.eq('segmento', segmento);
      if (semana && semana !== 'TODAS') {
        const sNum = parseInt(String(semana).replace(/\D/g, '')) || null;
        capQ = capQ.or(`semana_label.eq.${semana},semana_trabajo.eq.${sNum}`);
      }
      const { data: caps } = await capQ;
      if (caps && caps.length > 0) {
        caps.forEach(c => {
          if (c.codigo) targetGrupos.push(c.codigo);
        });
      }
    } catch (e) {
      console.warn('Error al buscar grupos en capacidad_rys:', e);
    }
  }

  // 2. Consultar directamente de consolidado_asistencias (fuente real de formación)
  let qAsis = supabase
    .from('consolidado_asistencias')
    .select('documento, apellido_paterno, apellido_materno, nombres, campana, codigo_grupo, grupo, sigla, estado, created_at')
    .neq('sigla', 'DESC')
    .neq('estado', 'DESCUENTO')
    .order('created_at', { ascending: false });

  if (targetGrupos.length === 1) {
    qAsis = qAsis.or(`codigo_grupo.eq.${targetGrupos[0]},grupo.eq.${targetGrupos[0]}`);
  } else if (targetGrupos.length > 1) {
    const list = targetGrupos.slice(0, 50).map(g => `"${g}"`).join(',');
    qAsis = qAsis.or(`codigo_grupo.in.(${list}),grupo.in.(${list})`);
  }

  // Filtrar estrictamente por campaña si está seleccionada
  if (campana && campana !== 'TODAS') {
    qAsis = qAsis.eq('campana', campana);
  }

  const { data: asisRows, error: asisErr } = await qAsis.limit(5000);
  if (asisErr) console.warn('Error consultando consolidado_asistencias para pagos:', asisErr);

  // Mapa de personas únicas de formación
  const personasMap = new Map();
  (asisRows || []).forEach(r => {
    const doc = String(r.documento || '').trim();
    if (!doc) return;
    if (!personasMap.has(doc)) {
      personasMap.set(doc, {
        documento: doc,
        apellido_paterno: r.apellido_paterno || '',
        apellido_materno: r.apellido_materno || '',
        nombres: r.nombres || '',
        campana: r.campana || (campana !== 'TODAS' ? campana : ''),
        segmento: segmento !== 'TODOS' ? segmento : '',
        grupo_codigo: r.codigo_grupo || r.grupo || (grupo_codigo !== 'TODOS' ? grupo_codigo : ''),
        semana_trabajo: semana !== 'TODAS' ? semana : '',
        periodo_reclutado: periodo !== 'TODOS' ? periodo : '',
        status_final: 'ASISTENCIA REGISTRADA',
        fecha_inicio_capacitacion: null,
        fecha_fin_capacitacion: null,
        fecha_conexion_ojt: null,
        fecha_conexion_op: null,
      });
    }
  });

  // 3. Enriquecer con datos de 'nominas' (sin filtrar por status_final para no excluir a nadie)
  // IMPORTANTE: NO sobreescribir campana ni grupo_codigo con valores antiguos de nómina
  const docs = Array.from(personasMap.keys());
  if (docs.length > 0) {
    for (let i = 0; i < docs.length; i += 100) {
      const chunk = docs.slice(i, i + 100);
      const { data: nomRows } = await supabase
        .from('nominas')
        .select('documento, apellido_paterno, apellido_materno, nombres, campana, segmento, grupo_codigo, semana_trabajo, periodo_reclutado, fecha_inicio_capacitacion, fecha_fin_capacitacion, fecha_conexion_ojt, fecha_conexion_op, status_final')
        .in('documento', chunk);

      (nomRows || []).forEach(n => {
        const doc = String(n.documento || '').trim();
        if (personasMap.has(doc)) {
          const current = personasMap.get(doc);
          personasMap.set(doc, {
            ...current,
            apellido_paterno: n.apellido_paterno || current.apellido_paterno,
            apellido_materno: n.apellido_materno || current.apellido_materno,
            nombres: n.nombres || current.nombres,
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
          });
        }
      });
    }
  }

  // Si no hubieron asistencias pero existen personas en nominas para ese grupo, incluirlas como respaldo
  if (personasMap.size === 0 && grupo_codigo && grupo_codigo !== 'TODOS') {
    let fallbackQ = supabase
      .from('nominas')
      .select('documento, apellido_paterno, apellido_materno, nombres, campana, segmento, grupo_codigo, semana_trabajo, periodo_reclutado, fecha_inicio_capacitacion, fecha_fin_capacitacion, fecha_conexion_ojt, fecha_conexion_op, status_final')
      .eq('grupo_codigo', grupo_codigo);

    if (campana && campana !== 'TODAS') {
      fallbackQ = fallbackQ.eq('campana', campana);
    }

    const { data: fallbackNoms } = await fallbackQ;

    (fallbackNoms || []).forEach(n => {
      const doc = String(n.documento || '').trim();
      if (doc && !personasMap.has(doc)) {
        personasMap.set(doc, n);
      }
    });
  }

  // Filtrado final estricto de coherencia
  const personasResultado = Array.from(personasMap.values()).filter(p => {
    if (campana && campana !== 'TODAS') {
      const c = String(p.campana || '').trim().toUpperCase();
      const cTarget = String(campana).trim().toUpperCase();
      if (c && c !== cTarget) return false;
    }
    if (grupo_codigo && grupo_codigo !== 'TODOS') {
      const g = String(p.grupo_codigo || '').trim().toUpperCase();
      const gTarget = String(grupo_codigo).trim().toUpperCase();
      if (g && g !== gTarget) return false;
    }
    return true;
  });

  return personasResultado;
}

export async function fetchAsistenciasPagos(documentos = [], grupoCodigo = null) {
  if (!documentos.length) return [];
  if (DB_MODE === 'supabase') {
    let allRows = [];
    for (let i = 0; i < documentos.length; i += 100) {
      const chunk = documentos.slice(i, i + 100);
      let q = supabase
        .from('consolidado_asistencias')
        .select('documento, fecha_registro_asistencia, sigla, estado, codigo_grupo, grupo, fecha_hora_registro, created_at')
        .in('documento', chunk)
        .neq('sigla', 'DESC')
        .neq('estado', 'DESCUENTO');

      if (grupoCodigo && grupoCodigo !== 'TODOS') {
        q = q.or(`codigo_grupo.eq.${grupoCodigo},grupo.eq.${grupoCodigo}`);
      }

      const { data, error } = await q.order('created_at', { ascending: true });
      if (!error && data) {
        allRows.push(...data);
      }
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
          return {
            grupo_codigo: row.codigo,
            campana: row.campana,
            segmento: row.segmento,
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
 * Todas las filas del lote comparten el mismo lote_id (UUID).
 *
 * @param {Object[]} filas - Resultado de calcularPagosCapacitacion()
 * @param {Object} meta - { periodo, semana_trabajo, segmento, campana, grupo_codigo, cerrado_por, notas_lote }
 * @returns {string} lote_id generado
 */
export async function saveLiquidacionPagos(filas = [], meta = {}) {
  if (!filas.length) throw new Error('No hay filas para liquidar');

  // Generar UUID del lote en el cliente (el servidor también tiene DEFAULT gen_random_uuid())
  const lote_id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const rows = filas.flatMap(f => {
    // Una fila por cuota de permanencia (mínimo 1 fila)
    const cuotas = f.cuotas_permanencia?.length ? f.cuotas_permanencia : [{ numero: 1, monto: f.bono_permanencia_total || 0 }];
    return cuotas.map(cuota => ({
      lote_id,
      periodo: meta.periodo || f.periodo_reclutado || '',
      semana_trabajo: meta.semana_trabajo ? parseInt(meta.semana_trabajo) : (f.semana_trabajo ? parseInt(f.semana_trabajo) : null),
      segmento: meta.segmento || f.segmento || null,
      campana: meta.campana || f.campana || null,
      grupo_codigo: meta.grupo_codigo || f.grupo_codigo || null,
      documento: f.documento,
      nombre_completo: f.nombre_completo || null,
      dias_asistidos: f.dias_asistidos || 0,
      asistencia_perfecta: f.asistencia_perfecta || false,
      monto_dias_capa: f.monto_dias_capa || 0,
      bono_bienvenida: f.bono_bienvenida || 0,
      bono_asistencia_perfecta: f.bono_asistencia_perfecta || 0,
      bono_permanencia_total: f.bono_permanencia_total || 0,
      cuota_numero: cuota.numero,
      monto_cuota_permanencia: cuota.monto || 0,
      total_general: f.total_general || 0,
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
 * Retorna la lista de lotes históricos cerrados (agrupados por lote_id).
 * Cada entrada tiene: lote_id, periodo, semana, campana, fecha cierre, usuario, nº personas, total.
 */
export async function fetchLiquidacionesLotes() {
  if (DB_MODE === 'supabase') {
    const { data, error } = await withCache('liquidaciones_lotes', 60000, async () => {
      const { data, error } = await supabase
        .from('liquidaciones_pagos_capacitacion')
        .select('lote_id, periodo, semana_trabajo, segmento, campana, grupo_codigo, cerrado_por, cerrado_at, notas_lote, documento, total_general')
        .order('cerrado_at', { ascending: false });
      if (error) throw error;
      return data || [];
    });
    if (error) throw error;

    // Agrupar por lote_id en el cliente
    const lotesMap = new Map();
    for (const row of (data || [])) {
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
