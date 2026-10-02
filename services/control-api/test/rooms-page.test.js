import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

test('shared rooms browser bundle exposes room, agent, transcript and webhook flows', async () => {
  const html = await readFile(path.join(root, 'apps/web/public/rooms.html'), 'utf8');
  const js = await readFile(path.join(root, 'apps/web/public/rooms.js'), 'utf8');
  assert.match(html, /Shared Rooms/);
  assert.match(js, /\/api\/rooms/);
  assert.match(js, /\/agents/);
  assert.match(js, /\/messages/);
  assert.match(js, /\/routines/);
  assert.match(js, /Copy this webhook secret now/);
  assert.match(js, /@researcher/);
});

test('operations atlas entry point keeps a visible route to shared rooms', async () => {
  const html = await readFile(path.join(root, 'apps/web/public/index.html'), 'utf8');
  assert.match(html, /href="\/rooms\.html"/);
  assert.match(html, /Shared Rooms/);
});
