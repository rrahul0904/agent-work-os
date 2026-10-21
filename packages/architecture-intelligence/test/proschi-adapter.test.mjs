import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runProschiPreflight } from '../src/proschi-adapter.mjs';

async function sandbox(code='console.log(JSON.stringify({ok:true}))') {
  const workspaceRoot = await mkdtemp(path.join(tmpdir(), 'proschi-adapter-test-'));
  await writeFile(path.join(workspaceRoot, 'sample.proschi'), 'user "User" [Actor]\n');
  await writeFile(path.join(workspaceRoot, 'fake-cli.cjs'), code);
  return { workspaceRoot, diagramPath: 'sample.proschi',
    cliEntrypoint: path.join(workspaceRoot, 'fake-cli.cjs') };
}
async function fixture(fn, code) {
  const p = await sandbox(code);
  try { return await fn(p); } finally { await rm(p.workspaceRoot, {recursive:true, force:true}); }
}

test('returns typed model-estimate receipt from pinned local CLI', async () => {
  await fixture(async p => {
    const r = await runProschiPreflight(p);
    assert.equal(r.schema, 'architecture-preflight/v1');
    assert.equal(r.status, 'completed');
    assert.equal(r.simulationKind, 'model_estimate_not_measurement');
    assert.equal(r.action, 'test');
    assert.equal(r.result.ok, true);
    assert.match(r.sourceSha256, /^[a-f0-9]{64}$/);
    assert.match(r.cliSha256, /^[a-f0-9]{64}$/);
  });
});

test('rejects path escape, arbitrary actions and non .proschi source', async () => {
  await fixture(async p => {
    await assert.rejects(runProschiPreflight({...p,diagramPath:'../escape.proschi'}), /contained/);
    await assert.rejects(runProschiPreflight({...p,action:'render'}), /Unsupported/);
    await assert.rejects(runProschiPreflight({...p,diagramPath:'fake-cli.cjs'}), /Expected .proschi/);
  });
});

test('rejects imports before invoking CLI', async () => {
  await fixture(async p => {
    await writeFile(path.join(p.workspaceRoot,'sample.proschi'), 'import "../../secret.proschi"\n');
    await assert.rejects(runProschiPreflight(p), /Imports unsupported/);
  });
});

test('rejects symlinks inside workspace', async () => {
  await fixture(async p => {
    await mkdir(path.join(p.workspaceRoot,'dir'));
    await symlink(path.join(p.workspaceRoot,'sample.proschi'), path.join(p.workspaceRoot,'dir','linked.proschi'));
    await assert.rejects(runProschiPreflight({...p,diagramPath:'dir/linked.proschi'}), /Symbolic/);
  });
});

test('nonzero exit is a failed receipt, not passing evidence', async () => {
  await fixture(async p => {
    const r = await runProschiPreflight(p);
    assert.equal(r.status, 'failed');
    assert.equal(r.failureReason, 'cli_nonzero_exit');
    assert.equal(r.exitCode, 2);
  }, 'console.log(JSON.stringify({ok:false})); process.exit(2)');
});

test('invalid JSON is a failed receipt', async () => {
  await fixture(async p => {
    const r = await runProschiPreflight(p);
    assert.equal(r.failureReason, 'invalid_json');
  }, 'console.log("not-json")');
});

test('timeout kills child and records failure', async () => {
  await fixture(async p => {
    const r = await runProschiPreflight({...p,timeoutMs:150});
    assert.equal(r.status, 'failed');
    assert.equal(r.failureReason, 'timeout');
  }, 'setInterval(() => {}, 1000)');
});

test('output flood kills child and records failure', async () => {
  await fixture(async p => {
    const r = await runProschiPreflight({...p,maxOutputBytes:128});
    assert.equal(r.status, 'failed');
    assert.equal(r.failureReason, 'output_limit');
  }, 'console.log("z".repeat(5000))');
});
