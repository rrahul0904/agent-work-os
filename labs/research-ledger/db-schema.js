const DB_NAME = 'research-ledger';
const DB_VERSION = 3;
const REQUIRED_STORES = ['documents', 'snapshots', 'captures'];
const nativeOpen = indexedDB.open.bind(indexedDB);

function attachSchemaGuard(request, name) {
  if (name !== DB_NAME) return request;
  request.addEventListener('upgradeneeded', () => {
    const db = request.result;
    for (const store of REQUIRED_STORES) {
      if (!db.objectStoreNames.contains(store)) db.createObjectStore(store, { keyPath: 'id' });
    }
  });
  return request;
}

function openWithResearchLedgerFloor(name, version) {
  const requestedVersion = name === DB_NAME && Number.isFinite(version) && version < DB_VERSION
    ? DB_VERSION
    : version;
  const request = requestedVersion === undefined
    ? nativeOpen(name)
    : nativeOpen(name, requestedVersion);
  return attachSchemaGuard(request, name);
}

try {
  Object.defineProperty(indexedDB, 'open', {
    configurable: true,
    value: openWithResearchLedgerFloor
  });
} catch {
  indexedDB.open = openWithResearchLedgerFloor;
}
