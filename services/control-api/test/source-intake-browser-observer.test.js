import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';

import { transitionWorkItem } from '../../../packages/domain/src/index.js';
import { createSourceAccessObservation, createSourceAccessRequest } from '../../../packages/evidence/src/source-access-context.js';
import { createSourceIdentityResolver } from '../../../packages/evidence/src/source-resolution.js';
import { advanceSourceIntake } from '../../../packages/evidence/src/source-intake.js';
import { createBrowserReadCapabilitySpec } from '../../../packages/capability-fabric/src/source-access-providers.js';
import { createSourceIntakeBrowserObserver, SOURCE_INTAKE_BROWSER_BINDING_VERSION } from '../src/source-intake-browser-observer.js';
import { createTenantSourceIntakeSupervisor } from '../src/tenant-source-intake-supervisor.js';

const org = 'org_11111111-1111-4111-8111-111111111111';
const actor = 'user_33333333-3333-4333-8333-333333333333';
const workId = 'work_22222222-2222-4222-8222-222222222222';
const machineId = 'machine_66666666-6666-4666-8666-666666666666';
const shareUrl = 'https://www.reddit.com/r/BestGitHubRepos/s/EjKhT844dz';
const canonicalUrl = 'https://www.reddit.com/r/BestGitHubRepos/comments/1abc234/example_project/';
const now = '2026-10-17T03:00:00.000Z';

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortValue(value[key])]));
}
function digest(value) {
  return `sha256:${createHash('sha256').update(JSON.stringify(sortValue(value))).digest('hex')}`;
}

class WorkItems {
  constructor() {
    this.item = {
      id: workId, organizationId: org, projectId: null, title: 'REA #229', description: shareUrl,
      status: 'running', version: 3, createdBy: actor, createdAt: now, updatedAt: now,
    };
    this.events = [];
  }
  async get(id, organizationId) { return id === this.item.id && organizationId === org ? structuredClone(this.item) : null; }
  async listEvents(id, organizationId) { return id === this.item.id && organizationId === org ? structuredClone(this.events) : []; }
  async transition(id, command) {
    const replay = this.events.find((event) => event.commandId === command.commandId);
    if (replay) return { workItem: structuredClone(replay.result), replayed: true };
    const before = this.item;
    this.item = transitionWorkItem(before, { to: command.to, expectedVersion: command.expectedVersion, at: command.at });
    this.events.push({
      workItemId: id, commandId: command.commandId, version: this.item.version,
      fromStatus: before.status, toStatus: this.item.status, reason: command.reason,
      result: structuredClone(this.item), occurredAt: command.at,
    });
    return { workItem: structuredClone(this.item), replayed: false };
  }
}

class Store {
  constructor() {
    this.sessions = [];
    this.commands = [];
    this.machine = {
      id: machineId, organizationId: org, status: 'online',
      capabilities: [{ name: 'browser-read', access: 'read-only', observationContracts: ['source-access-observation/v1'] }],
    };
  }
  async getMachine(id) { return id === this.machine.id ? structuredClone(this.machine) : null; }
  async createSessionWithCommand(session, command) {
    this.sessions.push(structuredClone(session));
    this.commands.push(structuredClone(command));
    return structuredClone(session);
  }
  async listSessionsByOrganization(organizationId) {
    return structuredClone(this.sessions.filter((session) => session.organizationId === organizationId));
  }
  async listSessions() { return structuredClone(this.sessions); }
  persistEvent(sessionId, event) {
    const session = this.sessions.find((candidate) => candidate.id === sessionId);
    session.events.push(structuredClone(event));
    session.status = event.kind === 'status' ? event.status : session.status;
    return structuredClone(session);
  }
}

async function sourceState() {
  const resolve = createSourceIdentityResolver({
    resolveHost: async () => [{ address: '151.101.73.140' }],
    fetchImpl: async () => new Response('blocked', { status: 403 }),
  });
  const resolutionReceipt = await resolve({ sourceId: 'rea-229', url: shareUrl, resolvedAt: now });
  const accessRequest = createSourceAccessRequest({ blockedResolution: resolutionReceipt, requestedAt: now });
  const transition = advanceSourceIntake({ resolutionReceipt, accessRequest, transitionedAt: now });
  return { resolutionReceipt, accessRequest, transition };
}

function verificationRun(spec, overrides = {}) {
  const body = {
    schemaVersion: '1', verificationMode: 'artifact-context', capabilityId: spec.id, capabilityVersion: spec.version,
    capabilityDigest: 'sha256:' + '1'.repeat(64), harnessId: 'codex', harness: { name: 'codex', executable: 'codex', version: 'test' },
    source: { url: spec.provenance.sourceUrl, commit: spec.provenance.sourceCommit, license: spec.provenance.sourceLicense },
    compilationReceiptDigest: 'sha256:' + '2'.repeat(64), installReceiptDigest: 'sha256:' + '3'.repeat(64), artifacts: [],
    qualityThreshold: 1, score: 1, passed: true, cases: [{ id: 'contract-probe', passed: true }],
    rollback: { attempted: true, ok: true, result: {} }, verifiedAt: now,
  };
  return {
    id: 'verify_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', organizationId: org, machineId,
    capabilityId: spec.id, capabilityVersion: spec.version, capabilitySlug: spec.metadata.slug,
    status: 'complete', receipt: { ...body, receiptDigest: digest(body) }, ...overrides,
  };
}

async function fixture() {
  const workItems = new WorkItems();
  const store = new Store();
  const spec = createBrowserReadCapabilitySpec({ sourceCommit: 'abcdef1234567', createdAt: now });
  const run = verificationRun(spec);
  const capabilityRegistryRepository = {
    async listByOrganization(organizationId) {
      assert.equal(organizationId, org);
      return [{ organizationId, spec, capabilityId: spec.id, version: spec.version, slug: spec.metadata.slug,
        sourceCommit: spec.provenance.sourceCommit, sourceLicense: spec.provenance.sourceLicense }];
    },
    async resolve(organizationId, slug, version) {
      if (organizationId !== org || slug !== 'browser-read' || version !== spec.version) return null;
      return { organizationId, spec, capabilityId: spec.id, version: spec.version, slug,
        sourceCommit: spec.provenance.sourceCommit, sourceLicense: spec.provenance.sourceLicense };
    },
  };
  const capabilityVerificationRepository = {
    store,
    async get(id, organizationId) { return id === run.id && organizationId === org ? structuredClone(run) : null; },
  };
  const tenantSourceIntakeSupervisor = createTenantSourceIntakeSupervisor({
    workItems, capabilityRegistryRepository, capabilityVerificationRepository,
  });
  const state = await sourceState();
  const blocked = await tenantSourceIntakeSupervisor.block({
    workItem: workItems.item, transition: state.transition, accessRequest: state.accessRequest,
    organizationId: org, actorId: actor,
    commandId: 'command_44444444-4444-4444-8444-444444444444', at: now,
  });
  assert.equal(blocked.workItem.status, 'blocked');

  const ids = [
    'command_77777777-7777-4777-8777-777777777777',
    'command_88888888-8888-4888-8888-888888888888',
  ];
  let commandIndex = 0;
  const realtimeByKey = new Map();
  const realtimeAttempts = [];
  const publishRealtimeEvent = async ({ eventKey, event }) => {
    realtimeAttempts.push({ eventKey, event: structuredClone(event) });
    const existing = realtimeByKey.get(eventKey);
    if (existing) return { eventId: existing.eventId, eventKey, inserted: false };
    const receipt = { eventId: realtimeByKey.size + 1, eventKey, inserted: true };
    realtimeByKey.set(eventKey, { ...receipt, event: structuredClone(event) });
    return receipt;
  };
  const observer = createSourceIntakeBrowserObserver({
    store, workItems, capabilityRegistryRepository, capabilityVerificationRepository, tenantSourceIntakeSupervisor,
    publishRealtimeEvent,
    now: () => now,
    sessionId: () => 'browser-session-1',
    messageId: () => 'browser-message-1',
    commandId: () => ids[commandIndex++],
  });
  return {
    observer, workItems, store, spec, run, state, blocked,
    capabilityRegistryRepository, capabilityVerificationRepository, tenantSourceIntakeSupervisor,
    publishRealtimeEvent, realtimeByKey, realtimeAttempts,
  };
}

test('launch creates a durable server-owned browser observation session bound to the exact blocker', async () => {
  const { observer, store, run, state, blocked } = await fixture();
  const launched = await observer.launch({
    organizationId: org, workItemId: workId, expectedVersion: blocked.workItem.version,
    verificationRunId: run.id, machineId, actorId: actor, cwd: '/tmp/rea-229',
  });
  assert.equal(launched.replayed, false);
  assert.equal(launched.session.agent, 'browser-read');
  assert.equal(launched.session.machineId, run.machineId);
  assert.equal(launched.session.sourceIntakeBinding.contractVersion, SOURCE_INTAKE_BROWSER_BINDING_VERSION);
  assert.equal(launched.session.sourceIntakeBinding.workItemId, workId);
  assert.equal(launched.session.sourceIntakeBinding.blockedVersion, blocked.workItem.version);
  assert.equal(launched.session.sourceIntakeBinding.accessRequestSha256, state.accessRequest.requestSha256);
  assert.equal(launched.session.sourceIntakeBinding.transitionSha256, state.transition.transitionSha256);
  assert.equal(launched.session.sourceIntakeBinding.verificationRunId, run.id);
  assert.match(launched.session.sourceIntakeBinding.resumeCommandId, /^command_/);

  const prompt = JSON.parse(launched.session.messages[0].text);
  assert.deepEqual(prompt, { sourceAccessRequest: state.accessRequest });
  assert.equal(Object.hasOwn(prompt, 'verificationRunId'), false);
  assert.equal(Object.hasOwn(prompt, 'resumeCommandId'), false);
  assert.equal(store.commands[0].action, 'session.start');
  assert.equal(store.commands[0].payload.agent, 'browser-read');
});

test('valid persisted browser observation auto-resumes and publishes one stable realtime WorkItem identity', async () => {
  const { observer, workItems, store, run, state, blocked, realtimeByKey, realtimeAttempts } = await fixture();
  const launched = await observer.launch({
    organizationId: org, workItemId: workId, expectedVersion: blocked.workItem.version,
    verificationRunId: run.id, machineId, actorId: actor,
  });
  const observation = createSourceAccessObservation({
    request: state.accessRequest, provider: 'browser-read', canonicalUrl,
    observedAt: now, evidenceRef: 'browser-session:rea-229',
  });
  const event = { kind: 'tool', name: 'source-access-observation', phase: 'completed', payload: observation, at: now };
  const persistedSession = store.persistEvent(launched.session.id, event);
  const resumed = await observer.handleSessionEvent({ session: persistedSession, event });
  assert.equal(resumed.workItem.status, 'ready');
  assert.equal(resumed.sourceIntakeTransition.nextAction, 'REA_EVIDENCE_DISCOVERY');
  assert.equal(resumed.realtime.inserted, true);
  assert.equal(workItems.item.status, 'ready');
  assert.equal(workItems.events.at(-1).commandId, launched.session.sourceIntakeBinding.resumeCommandId);
  assert.equal(realtimeByKey.size, 1);
  const [eventKey, publication] = [...realtimeByKey.entries()][0];
  assert.equal(eventKey, `source-intake:${launched.session.sourceIntakeBinding.resumeCommandId}:work-item-v${resumed.workItem.version}`);
  assert.equal(publication.event.type, 'work.item.updated');
  assert.equal(publication.event.workItem.status, 'ready');

  const duplicate = await observer.handleSessionEvent({ session: persistedSession, event });
  assert.equal(duplicate.replayed, true);
  assert.equal(duplicate.realtime.inserted, false);
  assert.equal(workItems.events.filter((candidate) => candidate.toStatus === 'ready').length, 1);
  assert.equal(realtimeByKey.size, 1);
  assert.equal(realtimeAttempts.length, 2);
  assert.equal(realtimeAttempts[0].eventKey, realtimeAttempts[1].eventKey, 'fresh resume and replay use the same deterministic realtime event key');
});

test('restart reconciliation consumes a previously persisted observation, republishes idempotently, and launches no new browser session', async () => {
  const f = await fixture();
  const launched = await f.observer.launch({
    organizationId: org, workItemId: workId, expectedVersion: f.blocked.workItem.version,
    verificationRunId: f.run.id, machineId, actorId: actor,
  });
  const observation = createSourceAccessObservation({
    request: f.state.accessRequest, provider: 'browser-read', canonicalUrl,
    observedAt: now, evidenceRef: 'browser-session:restart-recovery',
  });
  const event = {
    kind: 'tool', name: 'source-access-observation', phase: 'completed', payload: observation, at: now,
  };
  const persisted = f.store.persistEvent(launched.session.id, event);
  await f.observer.handleSessionEvent({ session: persisted, event });
  assert.equal(f.workItems.item.status, 'ready');
  assert.equal(f.realtimeByKey.size, 1);

  const restarted = createSourceIntakeBrowserObserver({
    store: f.store, workItems: f.workItems,
    capabilityRegistryRepository: f.capabilityRegistryRepository,
    capabilityVerificationRepository: f.capabilityVerificationRepository,
    tenantSourceIntakeSupervisor: f.tenantSourceIntakeSupervisor,
    publishRealtimeEvent: f.publishRealtimeEvent,
  });
  const results = await restarted.reconcileAll();
  assert.equal(results.length, 1);
  assert.equal(results[0].ok, true);
  assert.equal(results[0].result.replayed, true);
  assert.equal(results[0].result.realtime.inserted, false);
  assert.equal(f.workItems.item.status, 'ready');
  assert.equal(f.store.sessions.length, 1);
  assert.equal(f.realtimeByKey.size, 1);
});

test('launch is idempotent for the same current blocker and verification run', async () => {
  const { observer, store, run, blocked } = await fixture();
  const first = await observer.launch({
    organizationId: org, workItemId: workId, expectedVersion: blocked.workItem.version,
    verificationRunId: run.id, machineId, actorId: actor,
  });
  const second = await observer.launch({
    organizationId: org, workItemId: workId, expectedVersion: blocked.workItem.version,
    verificationRunId: run.id, machineId, actorId: actor,
  });
  assert.equal(first.replayed, false);
  assert.equal(second.replayed, true);
  assert.equal(second.session.id, first.session.id);
  assert.equal(store.sessions.length, 1);
  assert.equal(store.commands.length, 1);
});

test('launch refuses a different machine or stale WorkItem version', async () => {
  const { observer, run, blocked } = await fixture();
  await assert.rejects(() => observer.launch({
    organizationId: org, workItemId: workId, expectedVersion: blocked.workItem.version - 1,
    verificationRunId: run.id, machineId, actorId: actor,
  }), /version changed/);
  await assert.rejects(() => observer.launch({
    organizationId: org, workItemId: workId, expectedVersion: blocked.workItem.version,
    verificationRunId: run.id, machineId: 'machine_99999999-9999-4999-8999-999999999999', actorId: actor,
  }), /must match verification run machine/);
});

test('unrelated events are ignored and cross-request observations fail closed', async () => {
  const { observer, workItems, run, state, blocked } = await fixture();
  const launched = await observer.launch({
    organizationId: org, workItemId: workId, expectedVersion: blocked.workItem.version,
    verificationRunId: run.id, machineId, actorId: actor,
  });
  assert.equal(await observer.handleSessionEvent({
    session: launched.session, event: { kind: 'text', text: 'not an observation', at: now },
  }), null);

  const otherState = await sourceState();
  const otherRequest = { ...otherState.accessRequest, requestId: 'source-access-request-other' };
  const badObservation = { ...createSourceAccessObservation({
    request: state.accessRequest, provider: 'browser-read', canonicalUrl,
    observedAt: now, evidenceRef: 'browser-session:wrong-request',
  }), requestSha256: 'sha256:' + '9'.repeat(64) };
  await assert.rejects(() => observer.handleSessionEvent({
    session: launched.session,
    event: { kind: 'tool', name: 'source-access-observation', phase: 'completed', payload: badObservation, at: now },
  }), /not bound to persisted source access request/);
  assert.equal(workItems.item.status, 'blocked');
  void otherRequest;
});
