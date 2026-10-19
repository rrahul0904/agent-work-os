// Clean-room, all-or-nothing notebook import boundary.
export const NOTEBOOK_SCHEMA = 'research-ledger/notebook.v1';
export const MAX_IMPORT_BYTES = 50 * 1024 * 1024;
const reject = (message) => { throw new Error(message); };
const isRecord = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const isId = (x) => typeof x === 'string' && x.length > 0 && x.length <= 160;

export function validateNotebook(payload) {
  if (!isRecord(payload) || payload.schema !== NOTEBOOK_SCHEMA) reject('Unsupported notebook schema');
  if (!Array.isArray(payload.documents) || payload.documents.length > 100) reject('Invalid document set');
  if (payload.captures !== undefined && (!Array.isArray(payload.captures) || payload.captures.length > 100)) reject('Invalid capture set');
  if (payload.snapshots !== undefined && (!Array.isArray(payload.snapshots) || payload.snapshots.length > 50)) reject('Invalid snapshot set');
  const captures = payload.captures ?? [];
  const snapshots = payload.snapshots ?? [];
  const ids = new Set();
  for (const [store, records] of [['documents', payload.documents], ['captures', captures], ['snapshots', snapshots]]) {
    const localIds = new Set();
    for (const item of records) {
      if (!isRecord(item) || !isId(item.id) || localIds.has(item.id)) reject('Invalid or duplicate ' + store + ' record');
      localIds.add(item.id);
      if (store === 'documents' && (typeof item.text !== 'string' || item.text.length > 25_000_000)) reject('Invalid document text');
      if (store === 'captures' && (typeof item.text !== 'string' || item.text.length > 2_000_000 || (item.url !== undefined && typeof item.url !== 'string'))) reject('Invalid captured source');
      if (store === 'snapshots' && !isRecord(item.brief)) reject('Invalid research snapshot');
    }
    ids.add(store);
  }
  if (payload.notebook !== undefined && !isRecord(payload.notebook)) reject('Invalid notebook metadata');
  if (payload.activeBrief != null && !isRecord(payload.activeBrief)) reject('Invalid active brief');
  const estimated = new TextEncoder().encode(JSON.stringify(payload)).length;
  if (estimated > MAX_IMPORT_BYTES) reject('Notebook exceeds 50 MB import limit');
  return { documents: payload.documents, captures, snapshots, notebook: payload.notebook ?? {}, activeBrief: payload.activeBrief ?? null, evidenceHash: payload.evidenceHash };
}

// Browser IndexedDB transaction: clear+write are committed atomically or all rolled back.
export function replaceNotebookStores(db, validated) {
  return new Promise((resolve, reject) => {
    let tx;
    try {
      tx = db.transaction(['documents', 'captures', 'snapshots'], 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error || new Error('Notebook import transaction aborted'));
      tx.onerror = () => {}; // transaction abort handles the rejection once
      for (const [name, records] of [['documents', validated.documents], ['captures', validated.captures], ['snapshots', validated.snapshots]]) {
        const store = tx.objectStore(name);
        store.clear();
        for (const record of records) store.put(record);
      }
    } catch (error) {
      try { tx?.abort(); } catch {}
      reject(error);
    }
  });
}
