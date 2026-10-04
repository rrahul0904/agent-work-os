import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

test('multiplayer canvas browser bundle exposes spatial, accessible and governed collaboration flows', async () => {
  const html = await readFile(path.join(root, 'apps/web/public/canvas.html'), 'utf8');
  const js = await readFile(path.join(root, 'apps/web/public/canvas.js'), 'utf8');
  const css = await readFile(path.join(root, 'apps/web/public/canvas.css'), 'utf8');

  assert.match(html, /Multiplayer Canvas/);
  assert.match(html, /Canvas/);
  assert.match(html, /List/);
  assert.match(js, /\/api\/canvases/);
  assert.match(js, /driver\/acquire/);
  assert.match(js, /driver\/revoke/);
  assert.match(js, /Reference-only context link added/);
  assert.match(js, /Real PTY keystroke forwarding is intentionally not enabled yet/);
  assert.match(js, /session\.updated/);
  assert.match(js, /canvas\.updated/);
  assert.match(css, /prefers-reduced-motion/);
});

test('operations atlas and shared rooms both expose a route to multiplayer canvas', async () => {
  const index = await readFile(path.join(root, 'apps/web/public/index.html'), 'utf8');
  const rooms = await readFile(path.join(root, 'apps/web/public/rooms.html'), 'utf8');
  assert.match(index, /href="\/canvas\.html"/);
  assert.match(rooms, /href="\/canvas\.html"/);
});
