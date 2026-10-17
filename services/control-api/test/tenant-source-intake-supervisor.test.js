import { createHash } from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';

import { createCapabilitySpec } from '../../../packages/capability-fabric/src/index.js';
import { transitionWorkItem } from '../../../packages/domain/src/index.js';
import { createSourceIdentityResolver } from '../../../packages/evidence/src/source-resolution.js';
import { createSourceAccessObservation, createSourceAccessRequest } from '../../../packages/evidence/src/source-access-context.js';
import { advanceSourceIntake } from '../../../packages/evidence/src/source-intake.js';
import { createTenantSourceIntakeSupervisor } from '../src/tenant-source-intake-supervisor.js';

const shareUrl = 'https://www.reddit.com/r/BestGitHubRepos/s/EjKhT844dz';
const canonicalUrl = 'https://www.reddit.com/r/BestGitHubRepos/comments/1abc234/example_project/';
const now = '2026-10-16T20:10:00.000Z';
const org = 'org_11111111-1111-4111-8111-111111111111';
const actor = 'agent_33333333-3333-4333-8333-333333333333';
const workId = 'work_22222222-2222-4222-8222-222222222222';
const machineId = 'machine_66666666-6666-4666-8666-666666666666';

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortValue(value[key])]));
}
function receiptDigest(value) {
  return `sha256:${createHash('sha256').update(JSON.stringify(sortValue(value))).digest('hex')}`;
}

function workItem() {
  return {
    id: workId,
    organizationId: org,
    projectId: null,
    title: 'REA #229',
    description: shareUrl,
    status: 'running',
    version: 3,
    createdBy: actor,
    createdAt: now,
    updatedAt: now,
  };
}

class WorkItems {
  constructor() { this.item = workItem(); this.events = []; }
  async transition(id, command) {
    const before = this.item;
    this.item = transitionWorkItem(before, { to: command.to, expectedVersion: command.expectedVersion, at: command.at });
    this.events.push({ workItemId: id, version: this.item.version, toStatus: this.item.status, reason: command.reason });
    return { workItem: structuredClone(this.item), replayed: false };
  }
  async listEvents() { return structuredClone(this.events); }
}

function provider() {
  return createCapabilitySpec({
    kind: 'workflow',
    version: '1.0.0',
    metadata: { name: 'Browser Read', slug: 'browser-read', tags: ['source-access'] },
    contract: { inputs: [], outputs: [] },
    execution: { instructions: 'Read only.' },
    requirements: { permissions: ['read'], networkPolicy: 'bounded' },
    provenance: {
      sourceUrl: 'https://github.com/rrahul0904/agent-work-os',
      sourceCommit: 'local:source-access/browser-read',
      sourceLicense: 'MIT',
      evidence: ['source-access-context/v1'],
    },
    evaluation: { testCases: [{ id: 'resolve', input: shareUrl, expected: 'canonical' }], qualityThreshold: 1 },
  }, { now: () => now, uuid: () => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' });
}

function verificationRun(spec, overrides = {}) {
  const payload = {
    schemaVersion: '1', verificationMode: 'artifact-context', capabilityId: spec.id, capabilityVersion: spec.version,
    capabilityDigest: 'sha256:' + '1'.repeat(64), harnessId: 'codex', harness: { name: 'codex', executable: 'codex', version: 'test' },
    source: { url: spec.provenance.sourceUrl, commit: spec.provenance.sourceCommit, license: spec.provenance.sourceLicense },
    compilationReceiptDigest: 'sha256:' + '2'.repeat(64), installReceiptDigest: 'sha256:' + '3'.repeat(64), artifacts: [],
    qualityThreshold: 1, score: 1, passed: true,
    cases: [{ id: 'resolve', passed: true }], rollback: { attempted: true, ok: true, result: {} }, verifiedAt: now,
  };
  const receipt = { ...payload, receiptDigest: receiptDigest(payload) };
  return {
    id: 'verify_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', organizationId: org, machineId, capabilityId: spec.id,
    capabilityVersion: spec.version, capabilitySlug: spec.metadata.slug, status: 'complete', receipt, ...overrides,
  };
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
    request: accessRequest, provider: 'browser-read', canonicalUrl,
    observedAt: '2026-10-16T20:11:00.000Z', evidenceRef: 'browser-session:rea-229',
  });
  return { accessRequest, blockedTransition, observation };
}

function repositories(spec, run, machineCapability = {
  name: 'browser-read', access: 'read-only', observationContracts: ['source-access-observation/v1'],
}) {
  return {
    capabilityRegistryRepository: {
      async listByOrganization(organizationId) {
        assert.equal(organizationId, org);
        return [{ organizationId, spec, capabilityId: spec.id, version: spec.version, slug: spec.metadata.slug }];
      },
    },
    capabilityVerificationRepository: {
      store: {
        async getMachine(id) {
          assert.equal(id, machineId);
          return { id, organizationId: org, capabilities: machineCapability ? [machineCapability] : [] };
        },
      },
      async get(id, organizationId) {
        assert.equal(organizationId, org);
        return id === run?.id ? structuredClone(run) : null;
      },
    },
  };
}

test('tenant supervisor resumes using server-loaded verification run, not caller receipt', async () => {
  const spec = provider();
  const run = verificationRun(spec);
  const workItems = new WorkItems();
  const repos = repositories(spec, run);
  const supervisor = createTenantSourceIntakeSupervisor({ workItems, ...repos });
  const state = await sourceState();
  const blocked = await supervisor.block({
    workItem: workItems.item, transition: state.blockedTransition, accessRequest: state.accessRequest,
    organizationId: org, actorId: actor, commandId: 'command_44444444-4444-4444-8444-444444444444', at: now,
  });
  const resumed = await supervisor.resume({
    workItem: blocked.workItem, accessObservation: state.observation, verificationRunId: run.id,
    organizationId: org, actorId: actor, commandId: 'command_55555555-5555-4555-8555-555555555555', at: '2026-10-16T20:12:00.000Z',
  });
  assert.equal(resumed.workItem.status, 'ready');
  assert.equal(resumed.sourceIntakeTransition.nextAction, 'REA_EVIDENCE_DISCOVERY');
  assert.equal(resumed.verificationReceiptDigest, run.receipt.receiptDigest);
});

test('tenant supervisor rejects cross-tenant or incomplete verification runs', async () => {
  const spec = provider();
  const good = verificationRun(spec);
  const workItems = new WorkItems();
  const state = await sourceState();
  const blockRepos = repositories(spec, good);
  const blocker = createTenantSourceIntakeSupervisor({ workItems, ...blockRepos });
  const blocked = await blocker.block({
    workItem: workItems.item, transition: state.blockedTransition, accessRequest: state.accessRequest,
    organizationId: org, actorId: actor, commandId: 'command_44444444-4444-4444-8444-444444444444', at: now,
  });

  for (const run of [
    verificationRun(spec, { organizationId: 'org_99999999-9999-4999-8999-999999999999' }),
    verificationRun(spec, { status: 'verifying', receipt: null }),
  ]) {
    const repos = repositories(spec, run);
    const supervisor = createTenantSourceIntakeSupervisor({ workItems, ...repos });
    await assert.rejects(
      () => supervisor.resume({
        workItem: blocked.workItem, accessObservation: state.observation, verificationRunId: run.id,
        organizationId: org, actorId: actor, commandId: 'command_55555555-5555-4555-8555-555555555555', at: '2026-10-16T20:12:00.000Z',
      }),
      /not found in organization|not complete/,
    );
    assert.equal(workItems.item.status, 'blocked');
  }
});

test('tenant supervisor rejects run whose provider slug does not match observation', async () => {
  const spec = provider();
  const run = verificationRun(spec, { capabilitySlug: 'reddit-authenticated-read' });
  const workItems = new WorkItems();
  const state = await sourceState();
  const goodRepos = repositories(spec, verificationRun(spec));
  const blocker = createTenantSourceIntakeSupervisor({ workItems, ...goodRepos });
  const blocked = await blocker.block({
    workItem: workItems.item, transition: state.blockedTransition, accessRequest: state.accessRequest,
    organizationId: org, actorId: actor, commandId: 'command_44444444-4444-4444-8444-444444444444', at: now,
  });
  const supervisor = createTenantSourceIntakeSupervisor({ workItems, ...repositories(spec, run) });
  await assert.rejects(
    () => supervisor.resume({
      workItem: blocked.workItem, accessObservation: state.observation, verificationRunId: run.id,
      organizationId: org, actorId: actor, commandId: 'command_55555555-5555-4555-8555-555555555555', at: '2026-10-16T20:12:00.000Z',
    }),
    /provider does not match source observation/,
  );
  assert.equal(workItems.item.status, 'blocked');
});

test('tenant supervisor rejects a verification machine that does not advertise the source provider', async () => {
  const spec = provider();
  const run = verificationRun(spec);
  const workItems = new WorkItems();
  const state = await sourceState();
  const blocker = createTenantSourceIntakeSupervisor({ workItems, ...repositories(spec, run) });
  const blocked = await blocker.block({
    workItem: workItems.item, transition: state.blockedTransition, accessRequest: state.accessRequest,
    organizationId: org, actorId: actor, commandId: 'command_44444444-4444-4444-8444-444444444444', at: now,
  });
  const supervisor = createTenantSourceIntakeSupervisor({ workItems, ...repositories(spec, run, null) });
  await assert.rejects(() => supervisor.resume({
    workItem: blocked.workItem, accessObservation: state.observation, verificationRunId: run.id,
    organizationId: org, actorId: actor, commandId: 'command_55555555-5555-4555-8555-555555555555', at: '2026-10-16T20:12:00.000Z',
  }), /not advertised by verification machine/);
  assert.equal(workItems.item.status, 'blocked');
});

test('tenant supervisor rejects writable or contract-incompatible source provider advertisements', async () => {
  const spec = provider();
  const run = verificationRun(spec);
  const state = await sourceState();
  for (const machineCapability of [
    { name: 'browser-read', access: 'read-write', observationContracts: ['source-access-observation/v1'] },
    { name: 'browser-read', access: 'read-only', observationContracts: ['some-other-contract/v1'] },
  ]) {
    const workItems = new WorkItems();
    const blocker = createTenantSourceIntakeSupervisor({ workItems, ...repositories(spec, run) });
    const blocked = await blocker.block({
      workItem: workItems.item, transition: state.blockedTransition, accessRequest: state.accessRequest,
      organizationId: org, actorId: actor, commandId: 'command_44444444-4444-4444-8444-444444444444', at: now,
    });
    const supervisor = createTenantSourceIntakeSupervisor({ workItems, ...repositories(spec, run, machineCapability) });
    await assert.rejects(() => supervisor.resume({
      workItem: blocked.workItem, accessObservation: state.observation, verificationRunId: run.id,
      organizationId: org, actorId: actor, commandId: 'command_55555555-5555-4555-8555-555555555555', at: '2026-10-16T20:12:00.000Z',
    }), /read-only access|required observation contract/);
    assert.equal(workItems.item.status, 'blocked');
  }
});
