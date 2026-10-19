import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const [html, schema, app, completion] = await Promise.all([
  readFile(resolve(root, 'index.html'), 'utf8'),
  readFile(resolve(root, 'db-schema.js'), 'utf8'),
  readFile(resolve(root, 'app.js'), 'utf8'),
  readFile(resolve(root, 'completion.js'), 'utf8')
]);

const schemaIndex = html.indexOf('src="/db-schema.js"');
const appIndex = html.indexOf('src="/app.js"');
const completionIndex = html.indexOf('src="/completion.js"');
assert.ok(schemaIndex >= 0, 'db-schema.js must be loaded by index.html');
assert.ok(schemaIndex < appIndex, 'db-schema.js must load before app.js');
assert.ok(appIndex < completionIndex, 'app.js must load before completion.js');

assert.match(schema, /const DB_NAME = 'research-ledger'/);
assert.match(schema, /const DB_VERSION = 3/);
for (const store of ['documents', 'snapshots', 'captures']) {
  assert.match(schema, new RegExp(`['\"]${store}['\"]`), `schema guard must provision ${store}`);
}
assert.match(completion, /const DB_VERSION=3/);

const explicitVersions = [
  ...app.matchAll(/indexedDB\.open\(['\"]research-ledger['\"],\s*(\d+)\)/g),
  ...completion.matchAll(/indexedDB\.open\(DB_NAME,DB_VERSION\)/g)
];
assert.ok(explicitVersions.length >= 2, 'expected both main and completion storage paths to be covered');
assert.match(schema, /version < DB_VERSION/);

function makeFakeRequest() {
  const stores = new Set();
  const listeners = new Map();
  return {
    result: {
      objectStoreNames: { contains: name => stores.has(name) },
      createObjectStore(name) { stores.add(name); return {}; }
    },
    addEventListener(type, listener) { listeners.set(type, listener); },
    trigger(type) { listeners.get(type)?.(); },
    stores
  };
}

const calls = [];
const fakeIndexedDB = {
  open(name, version) {
    const request = makeFakeRequest();
    calls.push({ name, version, request });
    return request;
  }
};

vm.runInNewContext(schema, { indexedDB: fakeIndexedDB, Number, Object });

const legacyRequest = fakeIndexedDB.open('research-ledger', 2);
const legacyCall = calls.at(-1);
assert.equal(legacyCall.name, 'research-ledger');
assert.equal(legacyCall.version, 3, 'legacy v2 calls must be promoted to v3');
legacyRequest.trigger('upgradeneeded');
assert.deepEqual([...legacyRequest.stores].sort(), ['captures', 'documents', 'snapshots']);

fakeIndexedDB.open('research-ledger', 4);
assert.equal(calls.at(-1).version, 4, 'newer Research Ledger schemas must never be downgraded');

fakeIndexedDB.open('other-product', 2);
assert.equal(calls.at(-1).version, 2, 'unrelated IndexedDB databases must remain untouched');

fakeIndexedDB.open('research-ledger');
assert.equal(calls.at(-1).version, undefined, 'versionless opens must preserve native IndexedDB behavior');

console.log('research-ledger browser storage schema contract passed');
