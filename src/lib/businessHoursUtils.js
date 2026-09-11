/**
 * Utility functions for calculating business hours and response deadlines in Peru.
 * Excludes Sundays and official Peruvian National Holidays.
 */

// Anonymous Gregorian algorithm for Easter calculation (Semana Santa)
export function getEasterHolidays(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  const easterSunday = new Date(Date.UTC(year, month - 1, day));
  
  // Jueves Santo: -3 days from Easter Sunday
  const juevesSanto = new Date(easterSunday.getTime() - 3 * 24 * 60 * 60 * 1000);
  // Viernes Santo: -2 days from Easter Sunday
  const viernesSanto = new Date(easterSunday.getTime() - 2 * 24 * 60 * 60 * 1000);
  
  return [
    juevesSanto.toISOString().slice(0, 10),
    viernesSanto.toISOString().slice(0, 10)
  ];
}

const holidaysCache = new Map();

/**
 * Returns a Set of Peruvian holiday dates formatted as YYYY-MM-DD for a given year.
 */
export function getFeriadosPeruSet(year) {
  const y = Number(year) || new Date().getFullYear();
  if (holidaysCache.has(y)) return holidaysCache.get(y);
  
  const fixed = [
    `${y}-01-01`, // Año Nuevo
    `${y}-05-01`, // Día del Trabajo
    `${y}-06-07`, // Batalla de Arica y Día de la Bandera
    `${y}-06-29`, // San Pedro y San Pablo
    `${y}-07-23`, // Día de la FAP (José Abelardo Quiñones)
    `${y}-07-28`, // Fiestas Patrias
    `${y}-07-29`, // Fiestas Patrias
    `${y}-08-06`, // Batalla de Junín
    `${y}-08-30`, // Santa Rosa de Lima
    `${y}-10-08`, // Combate de Angamos
    `${y}-11-01`, // Día de Todos los Santos
    `${y}-12-08`, // Inmaculada Concepción
    `${y}-12-09`, // Batalla de Ayacucho
    `${y}-12-25`  // Navidad
  ];
  
  const movable = getEasterHolidays(y);
  const holidaySet = new Set([...fixed, ...movable]);
  holidaysCache.set(y, holidaySet);
  return holidaySet;
}

/**
 * Checks if a given timestamp represents a non-working period in Peru (Sunday or Holiday).
 */
export function isNonWorkingDayPeru(d) {
  if (!d) return false;
  const dateObj = d instanceof Date ? d : new Date(d);
  if (isNaN(dateObj.getTime())) return false;
  
  // Peru is UTC-5 (America/Lima)
  const peruTime = new Date(dateObj.getTime() - 5 * 3600 * 1000);
  const dayOfWeek = peruTime.getUTCDay(); // 0 = Sunday
  if (dayOfWeek === 0) return true;
  
  const y = peruTime.getUTCFullYear();
  const dateStr = peruTime.toISOString().slice(0, 10);
  return getFeriadosPeruSet(y).has(dateStr);
}

/**
 * Adds target business hours (default 48h) skipping Sundays and Peruvian holidays.
 * @param {Date|string|number} startDate 
 * @param {number} targetHours - Default 48 business hours
 * @returns {Date} Deadline date
 */
export function addBusinessHoursPeru(startDate, targetHours = 48) {
  if (!startDate) return null;
  const d = new Date(startDate);
  if (isNaN(d.getTime())) return null;
  
  let hoursRemaining = Number(targetHours) || 48;
  let safety = 0;
  
  while (hoursRemaining > 0 && safety < 2000) {
    safety++;
    d.setUTCHours(d.getUTCHours() + 1);
    if (!isNonWorkingDayPeru(d)) {
      hoursRemaining--;
    }
  }
  return d;
}

/**
 * Parses registration timestamp which might come in different formats (ISO, DD/MM/YYYY HH:MM:SS, etc.)
 */
export function parseFechaRegistro(rawDate) {
  if (!rawDate) return null;
  if (rawDate instanceof Date) return isNaN(rawDate.getTime()) ? null : rawDate;
  
  const str = String(rawDate).trim();
  if (!str) return null;
  
  // Check if standard ISO or YYYY-MM-DD
  if (str.includes('T') || /^\d{4}-\d{2}-\d{2}/.test(str)) {
    const d = new Date(str);
    if (!isNaN(d.getTime())) return d;
  }
  
  // Format: DD/MM/YYYY HH:mm:ss or DD/MM/YYYY
  const match = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
  if (match) {
    const [_, d, m, y, h, min, s] = match;
    // Interpret in Peru time (UTC-5)
    const isoString = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}T${(h || '00').padStart(2, '0')}:${(min || '00').padStart(2, '0')}:${(s || '00').padStart(2, '0')}-05:00`;
    const parsed = new Date(isoString);
    if (!isNaN(parsed.getTime())) return parsed;
  }
  
  const fallback = new Date(str);
  return isNaN(fallback.getTime()) ? null : fallback;
}

/**
 * Checks if 48 business hours have elapsed for a discount record.
 */
export function isDescuentoVencido48h(fechaRegistro, referenceDate = new Date()) {
  const parsedReg = parseFechaRegistro(fechaRegistro);
  if (!parsedReg) return false;
  
  const deadline = addBusinessHoursPeru(parsedReg, 48);
  if (!deadline) return false;
  
  const ref = referenceDate instanceof Date ? referenceDate : new Date(referenceDate);
  return ref.getTime() >= deadline.getTime();
}

/**
 * Calculates remaining business hours / status message for UI presentation.
 */
export function getDescuentoStatus48h(fechaRegistro, referenceDate = new Date()) {
  const parsedReg = parseFechaRegistro(fechaRegistro);
  if (!parsedReg) return { expired: false, deadline: null, remainingHours: null, label: 'Sin fecha' };
  
  const deadline = addBusinessHoursPeru(parsedReg, 48);
  if (!deadline) return { expired: false, deadline: null, remainingHours: null, label: 'Fecha inválida' };
  
  const ref = referenceDate instanceof Date ? referenceDate : new Date(referenceDate);
  const isExpired = ref.getTime() >= deadline.getTime();
  
  if (isExpired) {
    return {
      expired: true,
      deadline,
      remainingHours: 0,
      label: 'Plazo 48h vencido'
    };
  }
  
  const diffMs = deadline.getTime() - ref.getTime();
  const diffHours = Math.max(0, Math.ceil(diffMs / (3600 * 1000)));
  
  return {
    expired: false,
    deadline,
    remainingHours: diffHours,
    label: `${diffHours}h restantes`
  };
}
