import { validateImportedJob, isState } from '../core/opportunity.js';

const DATABASE = 'jobscout-local-v1';
// Database id from the previous brand is kept only as a one-time migration source.
const LEGACY_DATABASE = 'rolenexa-local-v1';
const VERSION = 2;
const STORE = 'opportunities';
const META_STORE = 'metadata';
const MIGRATION_KEY = 'legacy-database-imported';
const MAX_BATCH = 400;

let migrationPromise;
let connection;

function openNamedDatabase(name, version, upgrade) {
  return new Promise((resolve, reject) => {
    const req = version ? indexedDB.open(name, version) : indexedDB.open(name);
    req.onupgradeneeded = (event) => {
      if (upgrade) upgrade(req.result, req.transaction, event.oldVersion);
    };
    req.onsuccess = () => {
      req.result.onversionchange = () => req.result.close();
      resolve(req.result);
    };
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('No se pudo abrir la base local porque otra ventana la mantiene bloqueada.'));
  });
}

// Crea los almacenes en una base nueva y añade índices en una existente.
function upgradeDatabase(db, transaction, oldVersion) {
  if (!db.objectStoreNames.contains(STORE)) {
    const store = db.createObjectStore(STORE, { keyPath: 'id' });
    store.createIndex('sourceId', 'sourceId');
    store.createIndex('status', 'status');
  } else if (oldVersion < 2) {
    const store = transaction.objectStore(STORE);
    if (!store.indexNames.contains('sourceId')) store.createIndex('sourceId', 'sourceId');
    if (!store.indexNames.contains('status')) store.createIndex('status', 'status');
  }
  if (!db.objectStoreNames.contains(META_STORE)) {
    db.createObjectStore(META_STORE, { keyPath: 'key' });
  }
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error || new Error('Migración local cancelada.'));
  });
}

async function readLegacyOpportunities() {
  const databases = await indexedDB.databases();
  if (!databases.some((database) => database.name === LEGACY_DATABASE)) return [];
  const db = await openNamedDatabase(LEGACY_DATABASE);
  try {
    if (!db.objectStoreNames.contains(STORE)) return [];
    const transaction = db.transaction(STORE, 'readonly');
    const done = transactionDone(transaction);
    const jobs = await requestResult(transaction.objectStore(STORE).getAll());
    await done;
    return jobs;
  } finally {
    db.close();
  }
}

async function migrateLegacyDatabase() {
  const db = await openNamedDatabase(DATABASE, VERSION, upgradeDatabase);
  try {
    const check = db.transaction(META_STORE, 'readonly');
    const checkDone = transactionDone(check);
    const marker = await requestResult(check.objectStore(META_STORE).get(MIGRATION_KEY));
    await checkDone;
    if (marker) return;

    // Un registro legacy corrupto no debe abortar la migración completa.
    const raw = await readLegacyOpportunities();
    const jobs = [];
    let skipped = 0;
    for (const item of raw) {
      try { jobs.push(validateImportedJob(item)); } catch { skipped += 1; }
    }

    const transaction = db.transaction([STORE, META_STORE], 'readwrite');
    const done = transactionDone(transaction);
    const store = transaction.objectStore(STORE);
    for (const job of jobs) store.put(job);
    transaction.objectStore(META_STORE).put({
      key: MIGRATION_KEY, count: jobs.length, skipped, migratedAt: new Date().toISOString()
    });
    await done;
  } finally {
    db.close();
  }
}

function ensureMigrated() {
  if (!migrationPromise) {
    migrationPromise = migrateLegacyDatabase().catch((error) => {
      migrationPromise = undefined;
      throw error;
    });
  }
  return migrationPromise;
}

// Conexión reutilizada: una sola apertura para todas las operaciones.
async function getDatabase() {
  if (!connection) {
    connection = (async () => {
      await ensureMigrated();
      const db = await openNamedDatabase(DATABASE, VERSION, upgradeDatabase);
      db.onversionchange = () => { db.close(); connection = undefined; };
      return db;
    })().catch((error) => {
      connection = undefined;
      throw error;
    });
  }
  return connection;
}

async function inStore(mode, execute) {
  const db = await getDatabase();
  return new Promise((resolve, reject) => {
    let tx;
    try {
      tx = db.transaction(STORE, mode);
    } catch (error) {
      reject(error);
      return;
    }
    let outcome;
    tx.oncomplete = () => resolve(outcome);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Operación cancelada.'));
    try {
      execute(tx.objectStore(STORE), (value) => { outcome = value; });
    } catch (error) {
      try { tx.abort(); } catch { /* la transacción ya estaba cerrada */ }
      reject(error);
    }
  });
}

// Conserva notas y estado del usuario cuando una fuente repite una vacante.
export async function upsertOpportunities(items) {
  if (!Array.isArray(items) || items.length === 0) throw new Error('No hay oportunidades que guardar.');
  if (items.length > MAX_BATCH) throw new Error('Lote de oportunidades demasiado grande.');
  if (items.some((item) => !item?.id)) throw new Error('Toda oportunidad necesita un identificador.');

  const unique = [...new Map(items.map((item) => [item.id, item])).values()];
  return inStore('readwrite', (store, setOutcome) => {
    const outcome = { requested: unique.length, added: 0 };
    for (const incoming of unique) {
      const lookup = store.get(incoming.id);
      lookup.onsuccess = () => {
        const previous = lookup.result;
        store.put({
          ...incoming,
          createdAt: previous?.createdAt || incoming.createdAt,
          status: previous?.status || incoming.status,
          notes: previous?.notes || incoming.notes,
          // No sobrescribir datos agregados por el usuario con campos vacíos.
          company: incoming.company || previous?.company || '',
          location: incoming.location || previous?.location || '',
          description: incoming.description || previous?.description || '',
          sourceId: incoming.sourceId === 'manual' && previous?.sourceId && previous.sourceId !== 'manual'
            ? previous.sourceId : incoming.sourceId,
          postedAt: incoming.postedAt || previous?.postedAt || null
        });
        if (!previous) outcome.added += 1;
      };
    }
    setOutcome(outcome);
  });
}

export async function listOpportunities() {
  return inStore('readonly', (store, setOutcome) => {
    const req = store.getAll();
    req.onsuccess = () => setOutcome(req.result);
  });
}

export async function updateOpportunity(id, patch) {
  if (!id) throw new Error('Falta el identificador.');
  return inStore('readwrite', (store, setOutcome) => {
    const req = store.get(id);
    req.onsuccess = () => {
      const job = req.result;
      if (!job) { setOutcome(false); return; }
      const next = { ...job };
      if (isState(patch?.status)) next.status = patch.status;
      if (typeof patch?.notes === 'string') next.notes = patch.notes.slice(0, 4000);
      store.put(next);
      setOutcome(true);
    };
  });
}

export async function deleteOpportunity(id) {
  if (!id) return false;
  return inStore('readwrite', (store, setOutcome) => {
    store.delete(id);
    setOutcome(true);
  });
}

// Un solo cursor en lugar de borrar una a una desde la interfaz.
export async function deleteBySource(sourceId) {
  if (!sourceId || sourceId === 'manual') return 0;
  return inStore('readwrite', (store, setOutcome) => {
    let removed = 0;
    const cursor = store.index('sourceId').openCursor(IDBKeyRange.only(sourceId));
    cursor.onsuccess = () => {
      const current = cursor.result;
      if (!current) { setOutcome(removed); return; }
      current.delete();
      removed += 1;
      current.continue();
    };
  });
}

export async function countOpportunities() {
  return inStore('readonly', (store, setOutcome) => {
    const req = store.count();
    req.onsuccess = () => setOutcome(req.result);
  });
}