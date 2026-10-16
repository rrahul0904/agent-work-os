import assert from 'node:assert/strict';
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

console.log('research-ledger browser storage schema contract passed');
