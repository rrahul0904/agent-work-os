import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { DurableSubagentCoordinator } from '../src/subagent-coordination.js';

async function statePath() {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'agent-work-os-subagents-'));
  return path.join(dir, 'state.json');
}

async function seededCoordinator(options = {}) {
  const coordinator = new DurableSubagentCoordinator({
    statePath: await statePath(),
    idFactory: options.idFactory ?? (() => 'lease-1'),
    now: options.now ?? (() => 1_000),
  });
  await coordinator.load();
  await coordinator.registerWorker({ workerId: 'builder-1', role: 'builder', providerLaneId: 'lane-a' });
  await coordinator.registerWorker({ workerId: 'builder-2', role: 'builder', providerLaneId: 'lane-b' });
  await coordinator.registerWorker({ workerId: 'verifier-1', role: 'verifier', providerLaneId: 'lane-v' });
  return coordinator;
}

test('task contract requires distinct assigned builder and verifier roles', async () => {
  const coordinator = await seededCoordinator();
  await assert.rejects(
    () => coordinator.createTask({
      taskId: 't1',
      workspaceId: 'w1',
      scopePaths: ['src'],
      builderId: 'builder-1',
      verifierId: 'builder-2',
    }),
    /role verifier/,
  );
  await coordinator.createTask({
    taskId: 't1',
    workspaceId: 'w1',
    scopePaths: ['src'],
    builderId: 'builder-1',
    verifierId: 'verifier-1',
  });
  const snapshot = coordinator.snapshot();
  assert.equal(snapshot.tasks.t1.status, 'queued');
});

test('edit leases are scoped and conflicting paths cannot be concurrently owned', async () => {
  let leaseCounter = 0;
  const coordinator = await seededCoordinator({ idFactory: () => `lease-${++leaseCounter}` });
  await coordinator.createTask({
    taskId: 't1',
    workspaceId: 'w1',
    scopePaths: ['src'],
    builderId: 'builder-1',
    verifierId: 'verifier-1',
  });
  await coordinator.createTask({
    taskId: 't2',
    workspaceId: 'w1',
    scopePaths: ['src'],
    builderId: 'builder-2',
    verifierId: 'verifier-1',
  });
  await coordinator.claimTask({ taskId: 't1', workerId: 'builder-1' });
  await coordinator.claimTask({ taskId: 't2', workerId: 'builder-2' });
  await coordinator.acquireEditLease({
    taskId: 't1',
    workerId: 'builder-1',
    paths: ['src/lib'],
  });
  await assert.rejects(
    () => coordinator.acquireEditLease({
      taskId: 't2',
      workerId: 'builder-2',
      paths: ['src/lib/file.js'],
    }),
    /edit lease conflict/,
  );
  await assert.rejects(
    () => coordinator.acquireEditLease({
      taskId: 't2',
      workerId: 'builder-2',
      paths: ['docs/readme.md'],
    }),
    /outside task scope/,
  );
});

test('expired edit lease permits bounded takeover', async () => {
  let now = 1_000;
  let leaseCounter = 0;
  const coordinator = await seededCoordinator({
    now: () => now,
    idFactory: () => `lease-${++leaseCounter}`,
  });
  for (const [taskId, builderId] of [['t1', 'builder-1'], ['t2', 'builder-2']]) {
    await coordinator.createTask({
      taskId,
      workspaceId: 'w1',
      scopePaths: ['src'],
      builderId,
      verifierId: 'verifier-1',
    });
    await coordinator.claimTask({ taskId, workerId: builderId });
  }
  await coordinator.acquireEditLease({
    taskId: 't1',
    workerId: 'builder-1',
    paths: ['src/a.js'],
    ttlMs: 10,
  });
  now = 1_011;
  const lease = await coordinator.acquireEditLease({
    taskId: 't2',
    workerId: 'builder-2',
    paths: ['src/a.js'],
    ttlMs: 10,
  });
  assert.equal(lease.taskId, 't2');
});

test('builder must release edit leases before independent verification', async () => {
  let leaseCounter = 0;
  const coordinator = await seededCoordinator({ idFactory: () => `lease-${++leaseCounter}` });
  await coordinator.createTask({
    taskId: 't1',
    workspaceId: 'w1',
    scopePaths: ['src'],
    builderId: 'builder-1',
    verifierId: 'verifier-1',
  });
  await coordinator.claimTask({ taskId: 't1', workerId: 'builder-1' });
  const lease = await coordinator.acquireEditLease({
    taskId: 't1',
    workerId: 'builder-1',
    paths: ['src/a.js'],
  });
  await assert.rejects(
    () => coordinator.submitForVerification({
      taskId: 't1',
      workerId: 'builder-1',
      evidenceIds: ['tests:1'],
    }),
    /leases must be released/,
  );
  await coordinator.releaseEditLease({ leaseId: lease.leaseId, workerId: 'builder-1' });
  await coordinator.submitForVerification({
    taskId: 't1',
    workerId: 'builder-1',
    evidenceIds: ['tests:1', 'diff:abc'],
  });
  await assert.rejects(
    () => coordinator.verifyTask({
      taskId: 't1',
      verifierId: 'builder-1',
      outcome: 'accepted',
    }),
    /assigned verifier/,
  );
  const verified = await coordinator.verifyTask({
    taskId: 't1',
    verifierId: 'verifier-1',
    outcome: 'accepted',
    findings: [],
  });
  assert.equal(verified.status, 'done');
  assert.equal(verified.latestVerificationReceipt.outcome, 'accepted');
  assert.equal(verified.latestVerificationReceipt.builderId, 'builder-1');
  assert.equal(verified.latestVerificationReceipt.verifierId, 'verifier-1');
});

test('verification rejection creates bounded rework then blocks at the configured round limit', async () => {
  const coordinator = await seededCoordinator();
  await coordinator.createTask({
    taskId: 't1',
    workspaceId: 'w1',
    scopePaths: ['src'],
    builderId: 'builder-1',
    verifierId: 'verifier-1',
    maxVerificationRounds: 2,
  });

  for (let round = 1; round <= 2; round += 1) {
    await coordinator.claimTask({ taskId: 't1', workerId: 'builder-1' });
    await coordinator.submitForVerification({
      taskId: 't1',
      workerId: 'builder-1',
      evidenceIds: [`tests:${round}`],
    });
    const result = await coordinator.verifyTask({
      taskId: 't1',
      verifierId: 'verifier-1',
      outcome: 'rejected',
      findings: [`round-${round}-finding`],
    });
    assert.equal(result.status, round === 1 ? 'rework' : 'blocked');
  }
  assert.equal(coordinator.snapshot().tasks.t1.verificationRounds, 2);
});

test('restart reconciliation never assumes in-flight success and clears stale edit leases', async () => {
  const file = await statePath();
  let leaseCounter = 0;
  const first = new DurableSubagentCoordinator({
    statePath: file,
    idFactory: () => `lease-${++leaseCounter}`,
    now: () => 1_000,
  });
  await first.load();
  await first.registerWorker({ workerId: 'builder-1', role: 'builder' });
  await first.registerWorker({ workerId: 'verifier-1', role: 'verifier' });
  await first.createTask({
    taskId: 't1',
    workspaceId: 'w1',
    scopePaths: ['src'],
    builderId: 'builder-1',
    verifierId: 'verifier-1',
  });
  await first.claimTask({ taskId: 't1', workerId: 'builder-1' });
  await first.acquireEditLease({
    taskId: 't1',
    workerId: 'builder-1',
    paths: ['src/a.js'],
    ttlMs: 100_000,
  });

  const restarted = new DurableSubagentCoordinator({
    statePath: file,
    idFactory: () => 'lease-after-restart',
    now: () => 1_001,
  });
  await restarted.load({ reconcileRestart: true });
  const snapshot = restarted.snapshot();
  assert.equal(snapshot.tasks.t1.status, 'interrupted');
  assert.equal(snapshot.tasks.t1.interruptedFrom, 'building');
  assert.equal(Object.keys(snapshot.leases).length, 0);
  assert.notEqual(snapshot.tasks.t1.status, 'done');

  const resumed = await restarted.claimTask({ taskId: 't1', workerId: 'builder-1' });
  assert.equal(resumed.status, 'building');
  assert.equal(resumed.buildAttempts, 2);
});

test('durable state is readable without reconciliation for inspection', async () => {
  const file = await statePath();
  const first = new DurableSubagentCoordinator({ statePath: file });
  await first.load();
  await first.registerWorker({ workerId: 'builder-1', role: 'builder' });
  await first.registerWorker({ workerId: 'verifier-1', role: 'verifier' });
  await first.createTask({
    taskId: 't1',
    workspaceId: 'w1',
    scopePaths: ['src'],
    builderId: 'builder-1',
    verifierId: 'verifier-1',
  });

  const second = new DurableSubagentCoordinator({ statePath: file });
  await second.load({ reconcileRestart: false });
  const snapshot = second.snapshot();
  assert.equal(snapshot.workers['builder-1'].role, 'builder');
  assert.equal(snapshot.tasks.t1.status, 'queued');
});


test('edit lease renewal is owner-bound and extends the lease while building', async () => {
  let now = 1_000;
  let leaseCounter = 0;
  const coordinator = await seededCoordinator({
    now: () => now,
    idFactory: () => `lease-${++leaseCounter}`,
  });
  await coordinator.createTask({
    taskId: 't1',
    workspaceId: 'w1',
    scopePaths: ['src'],
    builderId: 'builder-1',
    verifierId: 'verifier-1',
  });
  await coordinator.claimTask({ taskId: 't1', workerId: 'builder-1' });
  const lease = await coordinator.acquireEditLease({
    taskId: 't1',
    workerId: 'builder-1',
    paths: ['src/a.js'],
    ttlMs: 10,
  });
  await assert.rejects(
    () => coordinator.renewEditLease({ leaseId: lease.leaseId, workerId: 'builder-2', ttlMs: 20 }),
    /lease owner/,
  );
  now = 1_005;
  const renewed = await coordinator.renewEditLease({
    leaseId: lease.leaseId,
    workerId: 'builder-1',
    ttlMs: 20,
  });
  assert.equal(renewed.expiresAtMs, 1_025);
});
