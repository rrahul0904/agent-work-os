import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, readdir, symlink, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSafeOutput } from './safe-output.mjs';
const fixture = async fn => {
  const dir = await mkdtemp(join(tmpdir(), 'rea-orbitdrop-'));
  const source = join(dir, 'photo.png');
  await writeFile(source, 'original-content');
  try { await fn({ dir, source }); } finally { await rm(dir, { recursive: true, force: true }); }
};
const textConvert = text => async ({ output }) => writeFile(output, text);
test('creates a second file and preserves the input bytes', () => fixture(async ({ source }) => {
  const r = await createSafeOutput({ source, extension: 'jpg', convert: textConvert('output') });
  assert.ok(r.output.endsWith('photo.jpg'));
  assert.equal(await readFile(source, 'utf8'), 'original-content');
  assert.equal(await readFile(r.output, 'utf8'), 'output');
  assert.match(r.sourceSha256, /^[0-9a-f]{64}$/);
}));
test('collision never overwrites a pre-existing target', () => fixture(async ({ dir, source }) => {
  await writeFile(join(dir, 'photo.jpg'), 'keep-me');
  const r = await createSafeOutput({ source, extension: 'jpg', convert: textConvert('new') });
  assert.ok(r.output.endsWith('photo (2).jpg'));
  assert.equal(await readFile(join(dir, 'photo.jpg'), 'utf8'), 'keep-me');
}));
test('concurrent outputs receive distinct filenames without clobbering', () => fixture(async ({ source }) => {
  const runs = await Promise.all(Array.from({ length: 12 }, (_, i) => createSafeOutput({ source, extension: 'jpg', convert: textConvert(`result-${i}`) })));
  assert.equal(new Set(runs.map(r => r.output)).size, 12);
}));
test('failed conversion removes scratch file and does not publish', () => fixture(async ({ dir, source }) => {
  await assert.rejects(createSafeOutput({ source, extension: 'jpg', convert: async ({ output }) => { await writeFile(output, 'partial'); throw Error('failed'); } }), /failed/);
  assert.deepEqual((await readdir(dir)).sort(), ['photo.png']);
}));
test('empty output is rejected', () => fixture(async ({ dir, source }) => {
  await assert.rejects(createSafeOutput({ source, extension: 'jpg', convert: async () => {} }), /empty/);
  assert.deepEqual(await readdir(dir), ['photo.png']);
}));
test('pre-cancelled work is not published', () => fixture(async ({ dir, source }) => {
  const ctrl = new AbortController(); ctrl.abort();
  await assert.rejects(createSafeOutput({ source, extension: 'jpg', signal: ctrl.signal, convert: textConvert('never') }));
  assert.deepEqual(await readdir(dir), ['photo.png']);
}));
test('invalid extension/path traversal is rejected', () => fixture(async ({ source }) => {
  await assert.rejects(createSafeOutput({ source, extension: '../txt', convert: textConvert('bad') }), /Unsafe extension/);
}));
test('symlinks are rejected as inputs', () => fixture(async ({ dir, source }) => {
  const alias = join(dir, 'alias.png'); await symlink(source, alias);
  await assert.rejects(createSafeOutput({ source: alias, extension: 'jpg', convert: textConvert('bad') }), /non-symlink/);
}));
test('published output uses restrictive scratch permissions', () => fixture(async ({ source }) => {
  const r = await createSafeOutput({ source, extension: 'jpg', convert: textConvert('ok') });
  assert.equal((await readFile(r.output, 'utf8')), 'ok');
  if (process.platform !== 'win32') assert.equal((await stat(r.output)).mode & 0o777, 0o600);
}));
