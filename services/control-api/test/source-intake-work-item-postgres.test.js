import assert from 'node:assert/strict';
import test from 'node:test';
import pg from 'pg';

import { createCanonicalId, createWorkItem } from '../../../packages/domain/src/index.js';
import { createSourceIdentityResolver } from '../../../packages/evidence/src/source-resolution.js';
import {
  createSourceAccessObservation,
  createSourceAccessRequest,
} from '../../../packages/evidence/src/source-access-context.js';
import { advanceSourceIntake } from '../../../packages/evidence/src/source-intake.js';
import { IdentityRepository } from '../src/identity-store.js';
import { PostgresWorkItemRepository } from '../src/work-item-store.js';
import {
  blockWorkItemForSourceAccess,
  parseSourceIntakeWorkItemReason,
  resumePersistedWorkItemAfterSourceAccess,
} from '../src/source-intake-work-item.js';

const { Pool } = pg;
const databaseUrl = process.env.AGENT_WORK_OS_TEST_DATABASE_URL;
const shareUrl = 'https://www.reddit.com/r/BestGitHubRepos/s/EjKhT844dz';
const canonicalUrl = 'https://www.reddit.com/r/BestGitHubRepos/comments/1abc234/example_project/';

async function waitForDatabase(pool) {
  const started = Date.now();
  let lastError;
  while (Date.now() - started < 15_000) {
    try { await pool.query('SELECT 1'); return; } catch (error) { lastError = error; }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`PostgreSQL did not become ready: ${lastError?.message ?? 'timeout'}`);
}

async function buildBlockedSourceState() {
  const resolve = createSourceIdentityResolver({
    resolveHost: async () => [{ address: '151.101.73.140' }],
    fetchImpl: async () => new Response('blocked', { status: 403 }),
  });
  const resolutionReceipt = await resolve({
    sourceId: 'rea-229-postgres',
    url: shareUrl,
    resolvedAt: '2026-10-16T19:50:00.000Z',
  });
  const accessRequest = createSourceAccessRequest({
    blockedResolution: resolutionReceipt,
    requestedAt: '2026-10-16T19:50:00.000Z',
  });
  const blockedTransition = advanceSourceIntake({
    resolutionReceipt,
    accessRequest,
    transitionedAt: '2026-10-16T19:50:00.000Z',
  });
  return { accessRequest, blockedTransition };
}

test('Postgres WorkItem source-access blocker survives repository restart and resumes from durable state', { skip: !databaseUrl }, async () => {
  const poolA = new Pool({ connectionString: databaseUrl, max: 2 });
  let poolB = null;
  const item = createWorkItem({
    id: createCanonicalId('work'),
    organizationId: createCanonicalId('org'),
    projectId: createCanonicalId('project'),
    createdBy: createCanonicalId('user'),
    title: 'REA #229 source access restart durability',
    description: shareUrl,
  });
  const actorId = item.createdBy;

  try {
    await waitForDatabase(poolA);
    const repositoryA = new PostgresWorkItemRepository(poolA);
    await repositoryA.initialize();
    await new IdentityRepository(poolA).initialize();
    await poolA.query(
      "INSERT INTO agent_work_os_organizations_v1 (id, name) VALUES ($1, 'REA source access persistence test') ON CONFLICT (id) DO NOTHING",
      [item.organizationId],
    );

    await repositoryA.create(item, {
      commandId: createCanonicalId('command'),
      actorId,
      at: '2026-10-16T19:49:00.000Z',
    });
    const ready = await repositoryA.transition(item.id, {
      organizationId: item.organizationId,
      commandId: createCanonicalId('command'),
      actorId,
      expectedVersion: 1,
      to: 'ready',
      at: '2026-10-16T19:49:10.000Z',
    });
    const running = await repositoryA.transition(item.id, {
      organizationId: item.organizationId,
      commandId: createCanonicalId('command'),
      actorId,
      expectedVersion: ready.workItem.version,
      to: 'running',
      at: '2026-10-16T19:49:20.000Z',
    });

    const { accessRequest, blockedTransition } = await buildBlockedSourceState();
    const blocked = await blockWorkItemForSourceAccess({
      repository: repositoryA,
      workItem: running.workItem,
      transition: blockedTransition,
      accessRequest,
      organizationId: item.organizationId,
      actorId,
      commandId: createCanonicalId('command'),
      at: '2026-10-16T19:50:00.000Z',
    });
    assert.equal(blocked.workItem.status, 'blocked');
    assert.equal(blocked.workItem.version, 4);

    const beforeRestartEvents = await repositoryA.listEvents(item.id, item.organizationId);
    const persistedBlocker = parseSourceIntakeWorkItemReason(beforeRestartEvents.at(-1).reason);
    assert.equal(persistedBlocker.phase, 'blocked');
    assert.equal(persistedBlocker.transition.transitionSha256, blockedTransition.transitionSha256);
    assert.equal(persistedBlocker.accessRequest.requestSha256, accessRequest.requestSha256);

    await poolA.end();

    // New pool + repository instance models a control-plane/repository restart. The
    // resume call below receives no blocked transition or access request in memory.
    poolB = new Pool({ connectionString: databaseUrl, max: 2 });
    await waitForDatabase(poolB);
    const repositoryB = new PostgresWorkItemRepository(poolB);
    await repositoryB.initialize();
    const reloaded = await repositoryB.get(item.id, item.organizationId);
    assert.equal(reloaded.status, 'blocked');
    assert.equal(reloaded.version, 4);

    const observation = createSourceAccessObservation({
      request: accessRequest,
      provider: 'browser-read',
      canonicalUrl,
      observedAt: '2026-10-16T19:51:00.000Z',
      evidenceRef: 'browser-session:rea-229-postgres:redirect',
    });
    const resumed = await resumePersistedWorkItemAfterSourceAccess({
      repository: repositoryB,
      workItem: reloaded,
      accessObservation: observation,
      organizationId: item.organizationId,
      actorId,
      commandId: createCanonicalId('command'),
      at: '2026-10-16T19:51:10.000Z',
    });

    assert.equal(resumed.workItem.status, 'ready');
    assert.equal(resumed.workItem.version, 5);
    assert.equal(resumed.sourceIntakeTransition.gate, 'TARGET_IDENTITY_RESOLVED');
    assert.equal(resumed.sourceIntakeTransition.nextAction, 'REA_EVIDENCE_DISCOVERY');
    assert.equal(resumed.sourceIntakeTransition.target.postId, '1abc234');
    assert.equal(resumed.sourceIntakeTransition.accessRequestSha256, accessRequest.requestSha256);
    assert.equal(resumed.sourceIntakeTransition.accessObservationSha256, observation.observationSha256);

    const afterRestartEvents = await repositoryB.listEvents(item.id, item.organizationId);
    assert.equal(afterRestartEvents.length, 5);
    assert.equal(parseSourceIntakeWorkItemReason(afterRestartEvents.at(-2).reason).phase, 'blocked');
    const resumedReason = parseSourceIntakeWorkItemReason(afterRestartEvents.at(-1).reason);
    assert.equal(resumedReason.phase, 'resumed');
    assert.equal(resumedReason.transition.nextAction, 'REA_EVIDENCE_DISCOVERY');

    await poolB.query('DELETE FROM agent_work_os_work_item_events_v1 WHERE work_item_id = $1', [item.id]);
    await poolB.query('DELETE FROM agent_work_os_work_items_v1 WHERE id = $1', [item.id]);
    await poolB.query('DELETE FROM agent_work_os_organizations_v1 WHERE id = $1 AND created_by IS NULL', [item.organizationId]);
  } finally {
    await Promise.allSettled([poolA.end(), poolB?.end()]);
  }
});
