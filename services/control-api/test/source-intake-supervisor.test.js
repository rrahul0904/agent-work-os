import { createHash } from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CapabilityRegistry,
  createCapabilitySpec,
} from '../../../packages/capability-fabric/src/index.js';
import { createSourceIdentityResolver } from '../../../packages/evidence/src/source-resolution.js';
import {
  createSourceAccessObservation,
  createSourceAccessRequest,
} from '../../../packages/evidence/src/source-access-context.js';
import { advanceSourceIntake } from '../../../packages/evidence/src/source-intake.js';
import { transitionWorkItem } from '../../../packages/domain/src/index.js';
import { createSourceIntakeSupervisor } from '../src/source-intake-supervisor.js';

const shareUrl = 'https://www.reddit.com/r/BestGitHubRepos/s/EjKhT844dz';
const canonicalUrl = 'https://www.reddit.com/r/BestGitHubRepos/comments/1abc234/example_project/';
const now = '2026-10-16T20:00:00.000Z';
const ids = {
  organizationId: 'org_11111111-1111-4111-8111-111111111111',
  workItemId: 'work_22222222-2222-4222-8222-222222222222',
  actorId: 'agent_33333333-3333-4333-8333-333333333333',
  blockCommandId: 'command_44444444-4444-4444-8444-444444444444',
  resumeCommandId: 'command_55555555-5555-4555-8555-555555555555',
};

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortValue(value[key])]));
}
function digest(value) {
  return `sha256:${createHash('sha256').update(JSON.stringify(sortValue(value))).digest('hex')}`;
}

function workItem() {
  return {
    id: ids.workItemId,
    organizationId: ids.organizationId,
    projectId: null,
    title: 'REA #229',
    description: shareUrl,
    status: 'running',
    version: 3,
    createdBy: ids.actorId,
    createdAt: '2026-10-16T19:00:00.000Z',
    updatedAt: '2026-10-16T19:50:00.000Z',
  };
}

class MemoryRepository {
  constructor(item = workItem()) {
    this.item = structuredClone(item);
    this.events = [];
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

function providerCapability(slug = 'browser-read') {
  return createCapabilitySpec({
    kind: 'workflow',
    version: '1.0.0',
    metadata: {
      name: slug === 'browser-read' ? 'Browser Read' : 'Reddit Authenticated Read',
      slug,
      description: 'Read-only provider for resolving governed source identity blockers.',
      tags: ['source-access', 'read-only'],
    },
    contract: {
      inputs: [{ name: 'url', description: 'Source URL' }],
      outputs: [{ name: 'canonicalUrl', description: 'Canonical observed URL' }],
    },
    execution: {
      instructions: 'Read the URL without external writes and return its canonical observed URL with provenance.',
    },
    requirements: { permissions: ['read'], networkPolicy: 'bounded' },
    provenance: {
      sourceUrl: 'https://github.com/rrahul0904/agent-work-os',
      sourceCommit: 'local:source-access/browser-read',
      sourceLicense: 'MIT',
      evidence: ['source-access-context/v1'],
    },
    evaluation: {
      testCases: [{ id: 'resolve', input: shareUrl, expected: 'canonical' }],
      qualityThreshold: 1,
    },
  }, {
    now: () => now,
    uuid: () => slug === 'browser-read' ? 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' : 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  });
}

function verificationReceipt(spec, overrides = {}) {
  const payload = {
    schemaVersion: '1',
    verificationMode: 'artifact-context',
    capabilityId: spec.id,
    capabilityVersion: spec.version,
    capabilityDigest: 'sha256:' + '1'.repeat(64),
    harnessId: 'codex',
    harness: { name: 'codex', executable: 'codex', version: 'test' },
    source: {
      url: spec.provenance.sourceUrl,
      commit: spec.provenance.sourceCommit,
      license: spec.provenance.sourceLicense,
    },
    compilationReceiptDigest: 'sha256:' + '2'.repeat(64),
    installReceiptDigest: 'sha256:' + '3'.repeat(64),
    artifacts: [],
    qualityThreshold: 1,
    score: 1,
    passed: true,
    cases: [{
      id: 'resolve', passed: true, expected: 'canonical', status: 'completed', errorCount: 0,
      expectationMatched: true, outputDigest: 'sha256:' + '4'.repeat(64), eventTraceDigest: 'sha256:' + '5'.repeat(64),
      nativeSessionId: null, startedAt: now, completedAt: now,
    }],
    rollback: { attempted: true, ok: true, result: {} },
    verifiedAt: now,
    ...overrides,
  };
  return { ...payload, receiptDigest: digest(payload) };
}

async function sourceState() {
  const resolve = createSourceIdentityResolver({
    resolveHost: async () => [{ address: '151.101.73.140' }],
    fetchImpl: async () => new Response('blocked', { status: 403 }),
  });
  const resolutionReceipt = await resolve({ sourceId: 'rea-229', url: shareUrl, resolvedAt: now });
  const accessRequest = createSourceAccessRequest({ blockedResolution: resolutionReceipt, requestedAt: now });
  const blockedTransition = advanceSourceIntake({ resolutionReceipt, accessRequest, transitionedAt: now });
  const observation = createSourceAccessObservation({
    request: accessRequest,
    provider: 'browser-read',
    canonicalUrl,
    observedAt: '2026-10-16T20:01:00.000Z',
    evidenceRef: 'browser-session:rea-229:redirect',
  });
  return { accessRequest, blockedTransition, observation };
}

async function blockWith(supervisor, state, repository) {
  return supervisor.block({
    workItem: workItem(),
    transition: state.blockedTransition,
    accessRequest: state.accessRequest,
    organizationId: ids.organizationId,
    actorId: ids.actorId,
    commandId: ids.blockCommandId,
    at: now,
  });
}

test('supervisor persists blocker even when source access provider is missing', async () => {
  const repository = new MemoryRepository();
  const registry = new CapabilityRegistry();
  const supervisor = createSourceIntakeSupervisor({ workItems: repository, capabilityRegistry: registry });
  const state = await sourceState();
  const result = await blockWith(supervisor, state, repository);
  assert.equal(result.workItem.status, 'blocked');
  assert.equal(result.sourceAccessPlan.state, 'missing');
  assert.equal(result.sourceAccessPlan.nextAction, 'INSTALL_OR_CONNECT_SOURCE_ACCESS_CAPABILITY');

  const inspection = await supervisor.inspect({ workItem: result.workItem, organizationId: ids.organizationId });
  assert.equal(inspection.state, 'blocked');
  assert.equal(inspection.sourceAccessPlan.state, 'missing');
});

test('supervisor discovers registered provider without unblocking the WorkItem', async () => {
  const repository = new MemoryRepository();
  const registry = new CapabilityRegistry();
  const supervisor = createSourceIntakeSupervisor({ workItems: repository, capabilityRegistry: registry });
  const state = await sourceState();
  const blocked = await blockWith(supervisor, state, repository);
  registry.add(providerCapability('browser-read'));

  const inspection = await supervisor.inspect({ workItem: blocked.workItem, organizationId: ids.organizationId });
  assert.equal(inspection.sourceAccessPlan.state, 'available');
  assert.equal(inspection.sourceAccessPlan.nextAction, 'VERIFY_SOURCE_ACCESS_CAPABILITY');
  assert.equal(repository.item.status, 'blocked');
});

test('supervisor refuses trusted observation when provider is not registered', async () => {
  const repository = new MemoryRepository();
  const registry = new CapabilityRegistry();
  const supervisor = createSourceIntakeSupervisor({ workItems: repository, capabilityRegistry: registry });
  const state = await sourceState();
  const blocked = await blockWith(supervisor, state, repository);

  await assert.rejects(
    () => supervisor.resume({
      workItem: blocked.workItem,
      accessObservation: state.observation,
      capabilityVerificationReceipt: {},
      organizationId: ids.organizationId,
      actorId: ids.actorId,
      commandId: ids.resumeCommandId,
      at: '2026-10-16T20:02:00.000Z',
    }),
    /no verified-capable source access provider is registered/,
  );
  assert.equal(repository.item.status, 'blocked');
});

test('supervisor refuses tampered or failing verification receipts', async () => {
  const repository = new MemoryRepository();
  const registry = new CapabilityRegistry();
  const provider = registry.add(providerCapability('browser-read'));
  const supervisor = createSourceIntakeSupervisor({ workItems: repository, capabilityRegistry: registry });
  const state = await sourceState();
  const blocked = await blockWith(supervisor, state, repository);

  const tampered = verificationReceipt(provider);
  tampered.score = 0;
  await assert.rejects(
    () => supervisor.resume({
      workItem: blocked.workItem,
      accessObservation: state.observation,
      capabilityVerificationReceipt: tampered,
      organizationId: ids.organizationId,
      actorId: ids.actorId,
      commandId: ids.resumeCommandId,
      at: '2026-10-16T20:02:00.000Z',
    }),
    /invalid or has been tampered with/,
  );

  const failed = verificationReceipt(provider, { score: 0, passed: false });
  await assert.rejects(
    () => supervisor.resume({
      workItem: blocked.workItem,
      accessObservation: state.observation,
      capabilityVerificationReceipt: failed,
      organizationId: ids.organizationId,
      actorId: ids.actorId,
      commandId: ids.resumeCommandId,
      at: '2026-10-16T20:02:00.000Z',
    }),
    /did not pass/,
  );
  assert.equal(repository.item.status, 'blocked');
});

test('supervisor refuses verification receipt from another provider capability', async () => {
  const repository = new MemoryRepository();
  const registry = new CapabilityRegistry();
  registry.add(providerCapability('browser-read'));
  const other = registry.add(providerCapability('reddit-authenticated-read'));
  const supervisor = createSourceIntakeSupervisor({ workItems: repository, capabilityRegistry: registry });
  const state = await sourceState();
  const blocked = await blockWith(supervisor, state, repository);

  await assert.rejects(
    () => supervisor.resume({
      workItem: blocked.workItem,
      accessObservation: state.observation,
      capabilityVerificationReceipt: verificationReceipt(other),
      organizationId: ids.organizationId,
      actorId: ids.actorId,
      commandId: ids.resumeCommandId,
      at: '2026-10-16T20:02:00.000Z',
    }),
    /does not match capabilityId/,
  );
  assert.equal(repository.item.status, 'blocked');
});

test('supervisor resumes only after exact registered provider has a passing intact verification receipt', async () => {
  const repository = new MemoryRepository();
  const registry = new CapabilityRegistry();
  const provider = registry.add(providerCapability('browser-read'));
  const supervisor = createSourceIntakeSupervisor({ workItems: repository, capabilityRegistry: registry });
  const state = await sourceState();
  const blocked = await blockWith(supervisor, state, repository);

  const resumed = await supervisor.resume({
    workItem: blocked.workItem,
    accessObservation: state.observation,
    capabilityVerificationReceipt: verificationReceipt(provider),
    organizationId: ids.organizationId,
    actorId: ids.actorId,
    commandId: ids.resumeCommandId,
    at: '2026-10-16T20:02:00.000Z',
  });

  assert.equal(resumed.workItem.status, 'ready');
  assert.equal(resumed.sourceIntakeTransition.nextAction, 'REA_EVIDENCE_DISCOVERY');
  assert.equal(resumed.capabilityBinding.capabilitySlug, 'browser-read');
  assert.equal(resumed.capabilityBinding.capabilityId, provider.id);
  assert.equal(resumed.verificationReceiptDigest, verificationReceipt(provider).receiptDigest);
});
