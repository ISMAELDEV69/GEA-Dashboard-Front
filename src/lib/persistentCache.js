/**
 * persistentCache.js
 * Capa de almacenamiento local ultra-rápida y persistente sobre IndexedDB.
 * Permite que las consultas masivas a Supabase se mantengan en el navegador
 * del usuario incluso tras recargas de página (F5) o cambio de pestañas,
 * reduciendo el consumo de Egress a casi cero en consultas recurrentes.
 */

const DB_NAME = 'gea_dashboard_cache_v4';
const DB_VERSION = 1;
const STORE_NAME = 'cache_store';

let dbPromise = null;

// Limpieza automática de versiones obsoletas v1, v2 y v3
if (typeof window !== 'undefined' && window.indexedDB) {
  try {
    window.indexedDB.deleteDatabase('gea_dashboard_cache_v1');
    window.indexedDB.deleteDatabase('gea_dashboard_cache_v2');
    window.indexedDB.deleteDatabase('gea_dashboard_cache_v3');
  } catch (e) {
    // Ignorar si no existe
  }
}

function getDb() {
  if (typeof window === 'undefined' || !window.indexedDB) {
    return Promise.resolve(null);
  }

  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      try {
        const req = window.indexedDB.open(DB_NAME, DB_VERSION);

        req.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME, { keyPath: 'key' });
          }
        };

        req.onsuccess = (e) => {
          resolve(e.target.result);
        };

        req.onerror = (err) => {
          console.warn('[persistentCache] Error opening IndexedDB:', err);
          resolve(null);
        };
      } catch (err) {
        console.warn('[persistentCache] Exception opening IndexedDB:', err);
        resolve(null);
      }
    });
  }

  return dbPromise;
}

/** Devuelve { data, timestamp } aunque el TTL ya venció. No borra el registro. */
export async function getPersistentRecord(key) {
  try {
    const db = await getDb();
    if (!db) return null;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(key);

        req.onsuccess = (e) => {
          const record = e.target.result;
          if (!record || record.data === undefined) {
            resolve(null);
            return;
          }
          resolve({ data: record.data, timestamp: record.timestamp || 0 });
        };

        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  } catch {
    return null;
  }
}

export async function getPersistentItem(key, ttlMs = 600000) {
  try {
    const record = await getPersistentRecord(key);
    if (!record) return null;

    const now = Date.now();
    if (ttlMs > 0 && now - record.timestamp > ttlMs) {
      return null;
    }
    return record.data;
  } catch {
    return null;
  }
}

export async function setPersistentItem(key, data) {
  try {
    const db = await getDb();
    if (!db) return false;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const record = {
          key,
          data,
          timestamp: Date.now(),
        };
        const req = store.put(record);

        req.onsuccess = () => resolve(true);
        req.onerror = () => resolve(false);
      } catch {
        resolve(false);
      }
    });
  } catch {
    return false;
  }
}

export async function deletePersistentItem(key) {
  try {
    const db = await getDb();
    if (!db) return false;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.delete(key);

        req.onsuccess = () => resolve(true);
        req.onerror = () => resolve(false);
      } catch {
        resolve(false);
      }
    });
  } catch {
    return false;
  }
}

export async function deletePersistentByPrefix(prefix) {
  try {
    const db = await getDb();
    if (!db) return false;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.openCursor();

        req.onsuccess = (e) => {
          const cursor = e.target.result;
          if (cursor) {
            if (!prefix || String(cursor.key).startsWith(prefix)) {
              store.delete(cursor.key);
            }
            cursor.continue();
          } else {
            resolve(true);
          }
        };

        req.onerror = () => resolve(false);
      } catch {
        resolve(false);
      }
    });
  } catch {
    return false;
  }
}

export async function clearPersistentCache() {
  try {
    const db = await getDb();
    if (!db) return false;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.clear();

        req.onsuccess = () => resolve(true);
        req.onerror = () => resolve(false);
      } catch {
        resolve(false);
      }
    });
  } catch {
    return false;
  }
}
