import test from 'node:test';
import assert from 'node:assert/strict';

import { transitionWorkItem } from '../../../packages/domain/src/index.js';
import { createSourceIdentityResolver } from '../../../packages/evidence/src/source-resolution.js';
import { createSourceAccessObservation, createSourceAccessRequest } from '../../../packages/evidence/src/source-access-context.js';
import { advanceSourceIntake } from '../../../packages/evidence/src/source-intake.js';
import {
  blockWorkItemForSourceAccess,
  createSourceIntakeWorkItemReason,
  parseSourceIntakeWorkItemReason,
  resumePersistedWorkItemAfterSourceAccess,
  resumeWorkItemAfterSourceAccess,
} from '../src/source-intake-work-item.js';

const ids = {
  organizationId: 'org_11111111-1111-4111-8111-111111111111',
  workItemId: 'work_22222222-2222-4222-8222-222222222222',
  actorId: 'agent_33333333-3333-4333-8333-333333333333',
  blockCommandId: 'command_44444444-4444-4444-8444-444444444444',
  resumeCommandId: 'command_55555555-5555-4555-8555-555555555555',
};
const shareUrl = 'https://www.reddit.com/r/BestGitHubRepos/s/EjKhT844dz';
const canonicalUrl = 'https://www.reddit.com/r/BestGitHubRepos/comments/1abc234/example_project/';
const now = '2026-10-16T19:40:00.000Z';

function runningWorkItem() {
  return {
    id: ids.workItemId,
    organizationId: ids.organizationId,
    projectId: null,
    title: 'REA source intake 229',
    description: shareUrl,
    status: 'running',
    version: 3,
    createdBy: ids.actorId,
    createdAt: '2026-10-16T19:00:00.000Z',
    updatedAt: '2026-10-16T19:30:00.000Z',
  };
}

class MemoryRepository {
  constructor(item, events = []) {
    this.item = structuredClone(item);
    this.events = structuredClone(events);
  }
  async transition(id, command) {
    assert.equal(id, this.item.id);
    const before = this.item;
    this.item = transitionWorkItem(before, {
      to: command.to,
      expectedVersion: command.expectedVersion,
      at: command.at,
    });
    this.events.push({
      eventId: `event-${this.events.length + 1}`,
      workItemId: id,
      commandId: command.commandId,
      actorId: command.actorId,
      version: this.item.version,
      fromStatus: before.status,
      toStatus: this.item.status,
      reason: command.reason,
      result: structuredClone(this.item),
      occurredAt: command.at,
    });
    return { workItem: structuredClone(this.item), replayed: false };
  }
  async listEvents(id, organizationId) {
    assert.equal(id, this.item.id);
    assert.equal(organizationId, this.item.organizationId);
    return structuredClone(this.events);
  }
}

async function sourceTransitions() {
  const resolve = createSourceIdentityResolver({
    resolveHost: async () => [{ address: '151.101.73.140' }],
    fetchImpl: async () => new Response('blocked', { status: 403 }),
  });
  const resolutionReceipt = await resolve({ sourceId: 'rea-229', url: shareUrl, resolvedAt: now });
  const accessRequest = createSourceAccessRequest({ blockedResolution: resolutionReceipt, requestedAt: now });
  const blockedTransition = advanceSourceIntake({
    resolutionReceipt,
    accessRequest,
    transitionedAt: now,
  });
  const observation = createSourceAccessObservation({
    request: accessRequest,
    provider: 'browser-read',
    canonicalUrl,
    observedAt: '2026-10-16T19:41:00.000Z',
    evidenceRef: 'browser-session:rea-229:redirect',
  });
  const resolvedTransition = advanceSourceIntake({
    resolutionReceipt,
    accessRequest,
    accessObservation: observation,
    transitionedAt: '2026-10-16T19:41:00.000Z',
  });
  return { accessRequest, blockedTransition, observation, resolvedTransition };
}

test('source access blocker durably persists the full restart-resume state inside the WorkItem event', async () => {
  const repository = new MemoryRepository(runningWorkItem());
  const { accessRequest, blockedTransition } = await sourceTransitions();
  const result = await blockWorkItemForSourceAccess({
    repository,
    workItem: runningWorkItem(),
    transition: blockedTransition,
    accessRequest,
    organizationId: ids.organizationId,
    actorId: ids.actorId,
    commandId: ids.blockCommandId,
    at: now,
  });

  assert.equal(result.workItem.status, 'blocked');
  assert.equal(result.workItem.version, 4);
  const events = await repository.listEvents(ids.workItemId, ids.organizationId);
  assert.ok(events[0].reason.length < 2_000);
  const reason = parseSourceIntakeWorkItemReason(events[0].reason);
  assert.equal(reason.phase, 'blocked');
  assert.equal(reason.transition.transitionSha256, blockedTransition.transitionSha256);
  assert.equal(reason.transition.requiredCapability, 'reddit-authenticated-or-browser-read');
  assert.equal(reason.transition.nextAction, 'ACQUIRE_SOURCE_ACCESS_CONTEXT');
  assert.equal(reason.accessRequest.requestSha256, accessRequest.requestSha256);
  assert.equal(reason.accessRequest.blocker.receiptSha256, blockedTransition.resolutionReceiptSha256);
});

test('matching trusted source observation resumes the exact blocked WorkItem to ready for REA discovery', async () => {
  const repository = new MemoryRepository(runningWorkItem());
  const { accessRequest, blockedTransition, resolvedTransition } = await sourceTransitions();
  const blocked = await blockWorkItemForSourceAccess({
    repository,
    workItem: runningWorkItem(),
    transition: blockedTransition,
    accessRequest,
    organizationId: ids.organizationId,
    actorId: ids.actorId,
    commandId: ids.blockCommandId,
    at: now,
  });

  const resumed = await resumeWorkItemAfterSourceAccess({
    repository,
    workItem: blocked.workItem,
    blockedTransition,
    resolvedTransition,
    organizationId: ids.organizationId,
    actorId: ids.actorId,
    commandId: ids.resumeCommandId,
    at: '2026-10-16T19:42:00.000Z',
  });

  assert.equal(resumed.workItem.status, 'ready');
  assert.equal(resumed.workItem.version, 5);
  const events = await repository.listEvents(ids.workItemId, ids.organizationId);
  assert.equal(events.length, 2);
  const reason = parseSourceIntakeWorkItemReason(events[1].reason);
  assert.equal(reason.phase, 'resumed');
  assert.equal(reason.transition.transitionSha256, resolvedTransition.transitionSha256);
  assert.equal(reason.transition.accessObservationSha256, resolvedTransition.accessObservationSha256);
  assert.equal(reason.transition.nextAction, 'REA_EVIDENCE_DISCOVERY');
});

test('persisted blocker can resume after repository restart without the in-memory blocked transition', async () => {
  const initialRepository = new MemoryRepository(runningWorkItem());
  const { accessRequest, blockedTransition, observation } = await sourceTransitions();
  const blocked = await blockWorkItemForSourceAccess({
    repository: initialRepository,
    workItem: runningWorkItem(),
    transition: blockedTransition,
    accessRequest,
    organizationId: ids.organizationId,
    actorId: ids.actorId,
    commandId: ids.blockCommandId,
    at: now,
  });
  const persistedEvents = await initialRepository.listEvents(ids.workItemId, ids.organizationId);

  // Simulate a control-plane restart: only durable WorkItem state + event history survive.
  const restartedRepository = new MemoryRepository(blocked.workItem, persistedEvents);
  const resumed = await resumePersistedWorkItemAfterSourceAccess({
    repository: restartedRepository,
    workItem: blocked.workItem,
    accessObservation: observation,
    organizationId: ids.organizationId,
    actorId: ids.actorId,
    commandId: ids.resumeCommandId,
    at: '2026-10-16T19:42:00.000Z',
  });

  assert.equal(resumed.workItem.status, 'ready');
  assert.equal(resumed.sourceIntakeTransition.gate, 'TARGET_IDENTITY_RESOLVED');
  assert.equal(resumed.sourceIntakeTransition.nextAction, 'REA_EVIDENCE_DISCOVERY');
  assert.equal(resumed.sourceIntakeTransition.target.postId, '1abc234');
  assert.equal(resumed.sourceIntakeTransition.accessRequestSha256, accessRequest.requestSha256);
  assert.equal(resumed.sourceIntakeTransition.accessObservationSha256, observation.observationSha256);
});

test('restart resume rejects an observation from another access request and leaves the WorkItem blocked', async () => {
  const repository = new MemoryRepository(runningWorkItem());
  const first = await sourceTransitions();
  const blocked = await blockWorkItemForSourceAccess({
    repository,
    workItem: runningWorkItem(),
    transition: first.blockedTransition,
    accessRequest: first.accessRequest,
    organizationId: ids.organizationId,
    actorId: ids.actorId,
    commandId: ids.blockCommandId,
    at: now,
  });

  const resolveOther = createSourceIdentityResolver({
    resolveHost: async () => [{ address: '151.101.73.140' }],
    fetchImpl: async () => new Response('blocked', { status: 403 }),
  });
  const otherReceipt = await resolveOther({
    sourceId: 'rea-other',
    url: shareUrl,
    resolvedAt: '2026-10-16T19:43:00.000Z',
  });
  const otherRequest = createSourceAccessRequest({ blockedResolution: otherReceipt, requestedAt: '2026-10-16T19:43:00.000Z' });
  const otherObservation = createSourceAccessObservation({
    request: otherRequest,
    provider: 'browser-read',
    canonicalUrl,
    observedAt: '2026-10-16T19:43:00.000Z',
    evidenceRef: 'browser-session:other',
  });

  await assert.rejects(
    () => resumePersistedWorkItemAfterSourceAccess({
      repository,
      workItem: blocked.workItem,
      accessObservation: otherObservation,
      organizationId: ids.organizationId,
      actorId: ids.actorId,
      commandId: ids.resumeCommandId,
      at: '2026-10-16T19:44:00.000Z',
    }),
    /not bound to the persisted source access request/,
  );
  assert.equal(repository.item.status, 'blocked');
});

test('resume rejects a resolved transition from another blocker before changing WorkItem state', async () => {
  const repository = new MemoryRepository(runningWorkItem());
  const first = await sourceTransitions();
  const blocked = await blockWorkItemForSourceAccess({
    repository,
    workItem: runningWorkItem(),
    transition: first.blockedTransition,
    accessRequest: first.accessRequest,
    organizationId: ids.organizationId,
    actorId: ids.actorId,
    commandId: ids.blockCommandId,
    at: now,
  });

  const resolveOther = createSourceIdentityResolver({
    resolveHost: async () => [{ address: '151.101.73.140' }],
    fetchImpl: async () => new Response('blocked', { status: 403 }),
  });
  const otherReceipt = await resolveOther({
    sourceId: 'rea-other',
    url: shareUrl,
    resolvedAt: '2026-10-16T19:43:00.000Z',
  });
  const otherRequest = createSourceAccessRequest({ blockedResolution: otherReceipt, requestedAt: '2026-10-16T19:43:00.000Z' });
  const otherObservation = createSourceAccessObservation({
    request: otherRequest,
    provider: 'browser-read',
    canonicalUrl,
    observedAt: '2026-10-16T19:43:00.000Z',
    evidenceRef: 'browser-session:other',
  });
  const otherResolved = advanceSourceIntake({
    resolutionReceipt: otherReceipt,
    accessRequest: otherRequest,
    accessObservation: otherObservation,
    transitionedAt: '2026-10-16T19:43:00.000Z',
  });

  await assert.rejects(
    () => resumeWorkItemAfterSourceAccess({
      repository,
      workItem: blocked.workItem,
      blockedTransition: first.blockedTransition,
      resolvedTransition: otherResolved,
      organizationId: ids.organizationId,
      actorId: ids.actorId,
      commandId: ids.resumeCommandId,
      at: '2026-10-16T19:44:00.000Z',
    }),
    /does not match blocker field sourceId/,
  );
  assert.equal(repository.item.status, 'blocked');
});

test('resume refuses a blocked WorkItem whose latest durable event is not the matching source blocker', async () => {
  const repository = new MemoryRepository(runningWorkItem());
  const { accessRequest, blockedTransition, resolvedTransition } = await sourceTransitions();
  const blocked = await blockWorkItemForSourceAccess({
    repository,
    workItem: runningWorkItem(),
    transition: blockedTransition,
    accessRequest,
    organizationId: ids.organizationId,
    actorId: ids.actorId,
    commandId: ids.blockCommandId,
    at: now,
  });
  repository.events[0].reason = createSourceIntakeWorkItemReason({
    phase: 'resumed',
    transition: resolvedTransition,
  });

  await assert.rejects(
    () => resumeWorkItemAfterSourceAccess({
      repository,
      workItem: blocked.workItem,
      blockedTransition,
      resolvedTransition,
      organizationId: ids.organizationId,
      actorId: ids.actorId,
      commandId: ids.resumeCommandId,
      at: '2026-10-16T19:45:00.000Z',
    }),
    /not a persisted source-access blocker/,
  );
  assert.equal(repository.item.status, 'blocked');
});

test('tampered persisted access request is rejected during parsing and cannot resume', async () => {
  const repository = new MemoryRepository(runningWorkItem());
  const { accessRequest, blockedTransition, observation } = await sourceTransitions();
  const blocked = await blockWorkItemForSourceAccess({
    repository,
    workItem: runningWorkItem(),
    transition: blockedTransition,
    accessRequest,
    organizationId: ids.organizationId,
    actorId: ids.actorId,
    commandId: ids.blockCommandId,
    at: now,
  });

  const envelope = JSON.parse(repository.events[0].reason);
  envelope.accessRequest.requiredCapability = 'browser-read';
  repository.events[0].reason = JSON.stringify(envelope);
  assert.equal(parseSourceIntakeWorkItemReason(repository.events[0].reason), null);

  await assert.rejects(
    () => resumePersistedWorkItemAfterSourceAccess({
      repository,
      workItem: blocked.workItem,
      accessObservation: observation,
      organizationId: ids.organizationId,
      actorId: ids.actorId,
      commandId: ids.resumeCommandId,
      at: '2026-10-16T19:46:00.000Z',
    }),
    /not a persisted source-access blocker/,
  );
  assert.equal(repository.item.status, 'blocked');
});
