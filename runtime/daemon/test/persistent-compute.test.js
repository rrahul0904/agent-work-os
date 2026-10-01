import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { authorizeActionPlan } from '../src/execution-safety.js';
import {
  createPythonCellPlan,
  findPythonExecutable,
  PersistentPythonWorker,
} from '../src/persistent-compute.js';

async function workspace() {
  return await mkdtemp(path.join(os.tmpdir(), 'agent-work-os-python-'));
}

function approvedCell(workspaceId, code, approvedBy = 'operator-1') {
  const plan = createPythonCellPlan({ workspaceId, code });
  const authorization = authorizeActionPlan({
    plan,
    approvedBy,
    approvedCapabilities: ['python'],
    confirmPlanId: plan.planId,
  });
  return { plan, authorization };
}

test('weak host-process Python requires explicit opt-in', async () => {
  const root = await workspace();
  assert.throws(
    () => new PersistentPythonWorker({ workspaceRoot: root, pythonExecutable: 'python3' }),
    /explicit allowWeakHostProcess=true/,
  );
});

test('weak backend refuses to claim unavailable network isolation', async () => {
  const root = await workspace();
  assert.throws(
    () => new PersistentPythonWorker({
      workspaceRoot: root,
      pythonExecutable: 'python3',
      allowWeakHostProcess: true,
      networkPolicy: 'deny',
    }),
    /network isolation is unavailable/,
  );
});

test('Python execution plan is bound to the exact code hash', async (t) => {
  const pythonExecutable = findPythonExecutable();
  if (!pythonExecutable) return t.skip('Python executable unavailable');
  const root = await workspace();
  const worker = new PersistentPythonWorker({
    workspaceRoot: root,
    pythonExecutable,
    allowWeakHostProcess: true,
  });
  const { plan, authorization } = approvedCell('workspace-1', 'print(1)');
  await assert.rejects(
    () => worker.runCell({ code: 'print(2)', plan, authorization }),
    /does not authorize this exact Python cell/,
  );
  const receipt = await worker.runCell({ code: 'print(1)', plan, authorization });
  assert.equal(receipt.status, 'completed');
  assert.equal(receipt.stdout, '1\n');
  await worker.close();
});

test('persistent worker preserves Python state across approved cells', async (t) => {
  const pythonExecutable = findPythonExecutable();
  if (!pythonExecutable) return t.skip('Python executable unavailable');
  const root = await workspace();
  const worker = new PersistentPythonWorker({
    workspaceRoot: root,
    pythonExecutable,
    allowWeakHostProcess: true,
  });

  const first = approvedCell('workspace-1', 'x = 41');
  const firstReceipt = await worker.runCell({ code: 'x = 41', ...first });
  assert.equal(firstReceipt.status, 'completed');

  const second = approvedCell('workspace-1', 'print(x + 1)');
  const secondReceipt = await worker.runCell({ code: 'print(x + 1)', ...second });
  assert.equal(secondReceipt.status, 'completed');
  assert.equal(secondReceipt.stdout, '42\n');
  assert.equal(secondReceipt.isolation.classification, 'weak-host-process');
  assert.equal(secondReceipt.isolation.filesystemIsolation, 'not-enforced');
  assert.equal(secondReceipt.isolation.networkIsolation, 'not-enforced');
  await worker.close();
});

test('worker output is truncated to the configured byte budget', async (t) => {
  const pythonExecutable = findPythonExecutable();
  if (!pythonExecutable) return t.skip('Python executable unavailable');
  const root = await workspace();
  const worker = new PersistentPythonWorker({
    workspaceRoot: root,
    pythonExecutable,
    allowWeakHostProcess: true,
    maxOutputBytes: 16,
  });
  const code = 'print("x" * 100)';
  const approved = approvedCell('workspace-1', code);
  const receipt = await worker.runCell({ code, ...approved });
  assert.equal(receipt.status, 'completed');
  assert.equal(receipt.truncated, true);
  assert.ok(Buffer.byteLength(receipt.stdout) <= 16);
  await worker.close();
});

test('timeout kills the worker and the next cell starts with fresh state', async (t) => {
  const pythonExecutable = findPythonExecutable();
  if (!pythonExecutable) return t.skip('Python executable unavailable');
  const root = await workspace();
  const worker = new PersistentPythonWorker({
    workspaceRoot: root,
    pythonExecutable,
    allowWeakHostProcess: true,
    perCellTimeoutMs: 150,
  });

  const seed = approvedCell('workspace-1', 'x = 123');
  assert.equal((await worker.runCell({ code: 'x = 123', ...seed })).status, 'completed');

  const loopingCode = 'while True:\n    pass';
  const looping = approvedCell('workspace-1', loopingCode);
  const timedOut = await worker.runCell({ code: loopingCode, ...looping });
  assert.equal(timedOut.status, 'timeout');
  assert.equal(timedOut.workerRestarted, true);

  const probeCode = 'print("x" in globals())';
  const probe = approvedCell('workspace-1', probeCode);
  const afterRestart = await worker.runCell({ code: probeCode, ...probe });
  assert.equal(afterRestart.status, 'completed');
  assert.equal(afterRestart.stdout, 'False\n');
  await worker.close();
});

test('authorization receipts are single-use for Python execution', async (t) => {
  const pythonExecutable = findPythonExecutable();
  if (!pythonExecutable) return t.skip('Python executable unavailable');
  const root = await workspace();
  const worker = new PersistentPythonWorker({
    workspaceRoot: root,
    pythonExecutable,
    allowWeakHostProcess: true,
  });
  const code = 'print("once")';
  const approved = approvedCell('workspace-1', code);
  assert.equal((await worker.runCell({ code, ...approved })).status, 'completed');
  await assert.rejects(
    () => worker.runCell({ code, ...approved }),
    /already been consumed/,
  );
  await worker.close();
});

test('Python child receives only the minimal environment allowlist', async (t) => {
  const pythonExecutable = findPythonExecutable();
  if (!pythonExecutable) return t.skip('Python executable unavailable');
  const root = await workspace();
  const worker = new PersistentPythonWorker({
    workspaceRoot: root,
    pythonExecutable,
    allowWeakHostProcess: true,
  });
  const code = 'import os; print(sorted(k for k in os.environ if "KEY" in k or "TOKEN" in k or "SECRET" in k))';
  const approved = approvedCell('workspace-1', code);
  const receipt = await worker.runCell({ code, ...approved });
  assert.equal(receipt.status, 'completed');
  assert.equal(receipt.stdout, '[]\n');
  await worker.close();
});


test('Python source is rejected before execution when it exceeds the code budget', async (t) => {
  const pythonExecutable = findPythonExecutable();
  if (!pythonExecutable) return t.skip('Python executable unavailable');
  const root = await workspace();
  const worker = new PersistentPythonWorker({
    workspaceRoot: root,
    pythonExecutable,
    allowWeakHostProcess: true,
    maxCodeBytes: 8,
  });
  const code = 'print("too long")';
  const approved = approvedCell('workspace-1', code);
  await assert.rejects(
    () => worker.runCell({ code, ...approved }),
    /maxCodeBytes/,
  );
  await worker.close();
});
