import assert from 'node:assert/strict';
import { mkdir, mkdtemp, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  authorizeRepositoryPath,
  createRepositoryPolicy,
  readRepositoryWindow,
  searchRepository,
} from '../src/repository-intelligence.js';

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-work-os-repo-intel-'));
  await mkdir(path.join(root, 'src'));
  await mkdir(path.join(root, 'node_modules'));
  await mkdir(path.join(root, 'dist'));
  await writeFile(path.join(root, 'src', 'a.js'), 'first\nneedle alpha\nthird\nneedle beta\nfifth\n');
  await writeFile(path.join(root, 'src', 'b.js'), 'needle gamma\nplain\n');
  await writeFile(path.join(root, 'node_modules', 'ignored.js'), 'needle should not appear\n');
  await writeFile(path.join(root, 'dist', 'bundle.js'), 'needle generated\n');
  await writeFile(path.join(root, '.env'), 'SECRET=needle\n');
  await writeFile(path.join(root, 'src', 'credentials.json'), '{"token":"needle"}\n');
  return root;
}

test('windowed reads are bounded and return a source receipt', async () => {
  const root = await fixture();
  const policy = createRepositoryPolicy({ root, maxReadLines: 2 });
  const result = await readRepositoryWindow({ policy, relativePath: 'src/a.js', startLine: 2, lineCount: 5 });
  assert.equal(result.text, 'needle alpha\nthird');
  assert.equal(result.returnedLineCount, 2);
  assert.equal(result.truncatedByPolicy, true);
  assert.equal(result.hasMoreAfter, true);
  assert.equal(result.sourceAnchor, 'src/a.js:2-3');
});

test('search prunes generated directories and secret-like files', async () => {
  const root = await fixture();
  const policy = createRepositoryPolicy({ root });
  const result = await searchRepository({ policy, query: 'needle' });
  assert.deepEqual(result.matches.map((match) => match.sourceAnchor), [
    'src/a.js:2',
    'src/a.js:4',
    'src/b.js:1',
  ]);
  assert.equal(result.receipt.truncated, false);
});

test('search stops deterministically at the configured match budget', async () => {
  const root = await fixture();
  const policy = createRepositoryPolicy({ root, maxMatches: 2 });
  const result = await searchRepository({ policy, query: 'needle' });
  assert.equal(result.matches.length, 2);
  assert.equal(result.receipt.truncated, true);
  assert.equal(result.receipt.stoppedReason, 'max_matches');
});

test('path authorization rejects traversal, ignored directories and secret-like files', async () => {
  const root = await fixture();
  const policy = createRepositoryPolicy({ root });
  await assert.rejects(() => authorizeRepositoryPath(policy, '../outside.txt'), /escapes repository root/);
  await assert.rejects(() => authorizeRepositoryPath(policy, 'node_modules/ignored.js'), /ignored directory/);
  await assert.rejects(() => authorizeRepositoryPath(policy, '.env'), /secret-like/);
  await assert.rejects(() => authorizeRepositoryPath(policy, 'src/credentials.json'), /secret-like/);
});

test('symlink traversal is rejected and symlink search entries are skipped', async (t) => {
  const root = await fixture();
  const outside = await mkdtemp(path.join(os.tmpdir(), 'agent-work-os-outside-'));
  await writeFile(path.join(outside, 'outside.js'), 'needle external\n');
  try {
    await symlink(outside, path.join(root, 'src', 'linked'));
  } catch (error) {
    if (error.code === 'EPERM' || error.code === 'EACCES') {
      t.skip('symlink creation unavailable on this platform');
      return;
    }
    throw error;
  }
  const policy = createRepositoryPolicy({ root });
  await assert.rejects(() => authorizeRepositoryPath(policy, 'src/linked/outside.js'), /symlink traversal/);
  const result = await searchRepository({ policy, query: 'external' });
  assert.equal(result.matches.length, 0);
});

test('file and byte budgets fail bounded instead of scanning the whole tree', async () => {
  const root = await fixture();
  const maxFilesPolicy = createRepositoryPolicy({ root, maxFiles: 1 });
  const byFiles = await searchRepository({ policy: maxFilesPolicy, query: 'needle' });
  assert.equal(byFiles.receipt.truncated, true);
  assert.equal(byFiles.receipt.stoppedReason, 'max_files');

  const maxBytesPolicy = createRepositoryPolicy({ root, maxBytesScanned: 1 });
  const byBytes = await searchRepository({ policy: maxBytesPolicy, query: 'needle' });
  assert.equal(byBytes.receipt.truncated, true);
  assert.equal(byBytes.receipt.stoppedReason, 'max_bytes_scanned');
  assert.equal(byBytes.receipt.bytesScanned, 0);
});
