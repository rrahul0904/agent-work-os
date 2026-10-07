import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createRepositoryPolicy } from '../src/repository-intelligence.js';
import {
  applyCheckpointRestore,
  assertPlanAuthorized,
  authorizeActionPlan,
  createActionPlan,
  createCheckpoint,
  planCheckpointRestore,
} from '../src/execution-safety.js';

async function setup() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-work-os-exec-root-'));
  const checkpointRoot = await mkdtemp(path.join(os.tmpdir(), 'agent-work-os-checkpoints-'));
  await writeFile(path.join(root, 'alpha.txt'), 'alpha-v1\n');
  await writeFile(path.join(root, 'beta.txt'), 'beta-v1\n');
  await writeFile(path.join(root, '.env'), 'SECRET=value\n');
  const policy = createRepositoryPolicy({ root, maxFiles: 10, maxFileBytes: 1024 });
  return { root, checkpointRoot, policy };
}

test('action plans are deterministic and expose mutating capabilities', () => {
  const input = {
    workspaceId: 'workspace-1',
    actions: [
      { id: 'a1', capability: 'repo.read', kind: 'inspect', target: 'alpha.txt' },
      { id: 'a2', capability: 'repo.write', kind: 'edit', target: 'alpha.txt' },
    ],
  };
  const first = createActionPlan(input);
  const second = createActionPlan(input);
  assert.equal(first.planId, second.planId);
  assert.equal(first.dryRun, true);
  assert.deepEqual(first.mutatingCapabilities, ['repo.write']);
  assert.equal(first.requiresApproval, true);
});

test('authorization is exact-plan bound and fails closed on missing capabilities', () => {
  const plan = createActionPlan({
    workspaceId: 'workspace-1',
    actions: [{ id: 'a1', capability: 'repo.write', kind: 'edit', target: 'alpha.txt' }],
  });
  assert.throws(
    () => authorizeActionPlan({
      plan,
      approvedBy: 'operator-1',
      approvedCapabilities: [],
      confirmPlanId: plan.planId,
    }),
    /missing approvals/,
  );
  assert.throws(
    () => authorizeActionPlan({
      plan,
      approvedBy: 'operator-1',
      approvedCapabilities: ['repo.write'],
      confirmPlanId: 'wrong',
    }),
    /exact plan id/,
  );
  const receipt = authorizeActionPlan({
    plan,
    approvedBy: 'operator-1',
    approvedCapabilities: ['repo.write'],
    confirmPlanId: plan.planId,
  });
  assert.equal(assertPlanAuthorized(plan, receipt), true);

  const differentPlan = createActionPlan({
    workspaceId: 'workspace-1',
    actions: [{ id: 'a2', capability: 'repo.write', kind: 'edit', target: 'beta.txt' }],
  });
  assert.throws(() => assertPlanAuthorized(differentPlan, receipt), /does not match plan/);
});

test('checkpoint creation is deterministic and refuses secret-like files', async () => {
  const { checkpointRoot, policy } = await setup();
  const first = await createCheckpoint({ policy, checkpointRoot, relativePaths: ['beta.txt', 'alpha.txt'] });
  const second = await createCheckpoint({ policy, checkpointRoot, relativePaths: ['alpha.txt', 'beta.txt'] });
  assert.equal(first.checkpointId, second.checkpointId);
  assert.deepEqual(first.entries.map((entry) => entry.path), ['alpha.txt', 'beta.txt']);
  await assert.rejects(
    () => createCheckpoint({ policy, checkpointRoot, relativePaths: ['.env'] }),
    /secret-like/,
  );
});

test('restore preview is dry-run only and reports modified files', async () => {
  const { root, checkpointRoot, policy } = await setup();
  const checkpoint = await createCheckpoint({ policy, checkpointRoot, relativePaths: ['alpha.txt', 'beta.txt'] });
  await writeFile(path.join(root, 'alpha.txt'), 'alpha-v2\n');
  const preview = await planCheckpointRestore({
    policy,
    checkpointRoot,
    checkpointId: checkpoint.checkpointId,
    workspaceId: 'workspace-1',
  });
  assert.equal(preview.ready, true);
  assert.equal(preview.plan.dryRun, true);
  assert.equal(preview.plan.actions.length, 1);
  assert.equal(preview.plan.actions[0].target, 'alpha.txt');
  assert.deepEqual(preview.plan.mutatingCapabilities, ['checkpoint.restore']);
  assert.equal(await readFile(path.join(root, 'alpha.txt'), 'utf8'), 'alpha-v2\n');
});

test('restore refuses missing targets rather than recreating paths implicitly', async () => {
  const { root, checkpointRoot, policy } = await setup();
  const checkpoint = await createCheckpoint({ policy, checkpointRoot, relativePaths: ['alpha.txt'] });
  await rm(path.join(root, 'alpha.txt'));
  const preview = await planCheckpointRestore({
    policy,
    checkpointRoot,
    checkpointId: checkpoint.checkpointId,
    workspaceId: 'workspace-1',
  });
  assert.equal(preview.ready, false);
  assert.equal(preview.plan, null);
  assert.deepEqual(preview.blockers, [{ path: 'alpha.txt', reason: 'target_missing' }]);
  await assert.rejects(
    () => applyCheckpointRestore({ policy, checkpointRoot, restorePreview: preview, authorization: {} }),
    /not ready/,
  );
});

test('authorized restore reverts only exact planned existing files', async () => {
  const { root, checkpointRoot, policy } = await setup();
  const checkpoint = await createCheckpoint({ policy, checkpointRoot, relativePaths: ['alpha.txt', 'beta.txt'] });
  await writeFile(path.join(root, 'alpha.txt'), 'alpha-v2\n');
  await writeFile(path.join(root, 'beta.txt'), 'beta-v2\n');
  const preview = await planCheckpointRestore({
    policy,
    checkpointRoot,
    checkpointId: checkpoint.checkpointId,
    workspaceId: 'workspace-1',
  });
  const authorization = authorizeActionPlan({
    plan: preview.plan,
    approvedBy: 'operator-1',
    approvedCapabilities: ['checkpoint.restore'],
    confirmPlanId: preview.plan.planId,
  });
  const receipt = await applyCheckpointRestore({ policy, checkpointRoot, restorePreview: preview, authorization });
  assert.equal(receipt.changed, true);
  assert.deepEqual(receipt.restored, ['alpha.txt', 'beta.txt']);
  assert.equal(await readFile(path.join(root, 'alpha.txt'), 'utf8'), 'alpha-v1\n');
  assert.equal(await readFile(path.join(root, 'beta.txt'), 'utf8'), 'beta-v1\n');
});

test('tampered checkpoint content is detected before repository mutation', async () => {
  const { root, checkpointRoot, policy } = await setup();
  const checkpoint = await createCheckpoint({ policy, checkpointRoot, relativePaths: ['alpha.txt'] });
  await writeFile(path.join(root, 'alpha.txt'), 'alpha-v2\n');
  const preview = await planCheckpointRestore({
    policy,
    checkpointRoot,
    checkpointId: checkpoint.checkpointId,
    workspaceId: 'workspace-1',
  });
  const authorization = authorizeActionPlan({
    plan: preview.plan,
    approvedBy: 'operator-1',
    approvedCapabilities: ['checkpoint.restore'],
    confirmPlanId: preview.plan.planId,
  });
  const stored = path.join(checkpointRoot, checkpoint.checkpointId, 'files', 'alpha.txt');
  await writeFile(stored, 'tampered\n');
  await assert.rejects(
    () => applyCheckpointRestore({ policy, checkpointRoot, restorePreview: preview, authorization }),
    /hash mismatch/,
  );
  assert.equal(await readFile(path.join(root, 'alpha.txt'), 'utf8'), 'alpha-v2\n');
});

test('checkpoint storage must remain outside the repository', async () => {
  const { root, policy } = await setup();
  await assert.rejects(
    () => createCheckpoint({
      policy,
      checkpointRoot: path.join(root, '.agent-work-os-checkpoints'),
      relativePaths: ['alpha.txt'],
    }),
    /outside the repository root/,
  );
});


test('restore becomes idempotent after the exact authorized plan is applied', async () => {
  const { root, checkpointRoot, policy } = await setup();
  const checkpoint = await createCheckpoint({ policy, checkpointRoot, relativePaths: ['alpha.txt'] });
  await writeFile(path.join(root, 'alpha.txt'), 'alpha-v2\n');
  const preview = await planCheckpointRestore({
    policy,
    checkpointRoot,
    checkpointId: checkpoint.checkpointId,
    workspaceId: 'workspace-1',
  });
  const authorization = authorizeActionPlan({
    plan: preview.plan,
    approvedBy: 'operator-1',
    approvedCapabilities: ['checkpoint.restore'],
    confirmPlanId: preview.plan.planId,
  });
  await applyCheckpointRestore({ policy, checkpointRoot, restorePreview: preview, authorization });
  const secondPreview = await planCheckpointRestore({
    policy,
    checkpointRoot,
    checkpointId: checkpoint.checkpointId,
    workspaceId: 'workspace-1',
  });
  assert.equal(secondPreview.ready, true);
  assert.equal(secondPreview.plan, null);
  assert.deepEqual(secondPreview.blockers, []);
});
