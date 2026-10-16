import test from 'node:test';
import assert from 'node:assert/strict';

import { handleSourceIntakeRequest } from '../src/source-intake-routes.js';

const org = 'org_11111111-1111-4111-8111-111111111111';
const user = 'user_22222222-2222-4222-8222-222222222222';
const workId = 'work_33333333-3333-4333-8333-333333333333';

function item(status = 'running', version = 4) {
  return { id: workId, organizationId: org, status, version };
}

function responseCapture() {
  return {
    status: null,
    body: null,
    json(res, status, body) { res.status = status; res.body = body; },
  };
}

function dependencies({ role = 'member', existing = item(), supervisor = {} } = {}) {
  return {
    identities: {
      async getMembership(userId, organizationId) {
        return userId === user && organizationId === org ? { role } : null;
      },
    },
    workItems: {
      async get(id, organizationId) {
        return id === workId && organizationId === org ? existing : null;
      },
    },
    sourceIntakeSupervisor: {
      async inspect(args) { return supervisor.inspect ? supervisor.inspect(args) : { state: 'blocked' }; },
      async block(args) { return supervisor.block ? supervisor.block(args) : { workItem: { ...existing, status: 'blocked', version: existing.version + 1 } }; },
      async resume(args) { return supervisor.resume ? supervisor.resume(args) : { workItem: { ...existing, status: 'ready', version: existing.version + 1 } }; },
    },
  };
}

async function invoke({ method, pathname, search = '', body = {}, deps = dependencies(), broadcasts = [] }) {
  const capture = responseCapture();
  const req = { method };
  const res = {};
  const handled = await handleSourceIntakeRequest({
    req,
    res,
    url: new URL(`http://localhost${pathname}${search}`),
    principal: { kind: 'user', userId: user },
    ...deps,
    readJson: async () => body,
    json: capture.json,
    broadcast: (event) => broadcasts.push(event),
  });
  return { handled, status: res.status, body: res.body, broadcasts };
}

test('GET source intake inspect is tenant scoped and viewer-readable', async () => {
  let seen;
  const deps = dependencies({
    role: 'viewer',
    existing: item('blocked', 5),
    supervisor: { inspect: async (args) => { seen = args; return { state: 'blocked', sourceAccessPlan: { state: 'missing' } }; } },
  });
  const result = await invoke({
    method: 'GET', pathname: `/api/work-items/${workId}/source-intake`, search: `?organizationId=${org}`, deps,
  });
  assert.equal(result.handled, true);
  assert.equal(result.status, 200);
  assert.equal(result.body.state, 'blocked');
  assert.equal(seen.organizationId, org);
  assert.equal(seen.workItem.id, workId);
});

test('POST block rejects viewer and does not call supervisor', async () => {
  let called = false;
  const deps = dependencies({ role: 'viewer', supervisor: { block: async () => { called = true; } } });
  const result = await invoke({
    method: 'POST', pathname: `/api/work-items/${workId}/source-intake/block`, deps,
    body: { organizationId: org, commandId: 'command_x', expectedVersion: 4, transition: {}, accessRequest: {} },
  });
  assert.equal(result.status, 403);
  assert.equal(result.body.error, 'organization_permission_denied');
  assert.equal(called, false);
});

test('POST block enforces expected WorkItem version before supervisor mutation', async () => {
  let called = false;
  const deps = dependencies({ supervisor: { block: async () => { called = true; } } });
  const result = await invoke({
    method: 'POST', pathname: `/api/work-items/${workId}/source-intake/block`, deps,
    body: { organizationId: org, commandId: 'command_x', expectedVersion: 3, transition: {}, accessRequest: {} },
  });
  assert.equal(result.status, 409);
  assert.deepEqual(result.body, { error: 'work_item_version_conflict', expected: 3, actual: 4 });
  assert.equal(called, false);
});

test('POST block delegates signed transition/request and broadcasts resulting WorkItem', async () => {
  const transition = { contractVersion: 'source-intake-transition/v1' };
  const accessRequest = { contractVersion: 'source-access-request/v1' };
  let seen;
  const deps = dependencies({
    supervisor: { block: async (args) => { seen = args; return { workItem: item('blocked', 5), sourceAccessPlan: { state: 'missing' } }; } },
  });
  const result = await invoke({
    method: 'POST', pathname: `/api/work-items/${workId}/source-intake/block`, deps,
    body: { organizationId: org, commandId: 'command_x', expectedVersion: 4, transition, accessRequest },
  });
  assert.equal(result.status, 200);
  assert.equal(seen.transition, transition);
  assert.equal(seen.accessRequest, accessRequest);
  assert.equal(seen.actorId, user);
  assert.equal(result.broadcasts.length, 1);
  assert.equal(result.broadcasts[0].workItem.status, 'blocked');
});

test('POST resume accepts verificationRunId, never a caller-supplied receipt', async () => {
  const accessObservation = { contractVersion: 'source-access-observation/v1' };
  let seen;
  const deps = dependencies({
    existing: item('blocked', 5),
    supervisor: { resume: async (args) => { seen = args; return { workItem: item('ready', 6), sourceIntakeTransition: { nextAction: 'REA_EVIDENCE_DISCOVERY' } }; } },
  });
  const result = await invoke({
    method: 'POST', pathname: `/api/work-items/${workId}/source-intake/resume`, deps,
    body: {
      organizationId: org,
      commandId: 'command_y',
      expectedVersion: 5,
      accessObservation,
      verificationRunId: 'verify_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      capabilityVerificationReceipt: { forged: true },
    },
  });
  assert.equal(result.status, 200);
  assert.equal(seen.verificationRunId, 'verify_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  assert.equal(seen.accessObservation, accessObservation);
  assert.equal('capabilityVerificationReceipt' in seen, false);
  assert.equal(result.body.workItem.status, 'ready');
});

test('source intake route hides cross-tenant WorkItems', async () => {
  const deps = dependencies();
  const result = await invoke({
    method: 'GET', pathname: `/api/work-items/${workId}/source-intake`, search: '?organizationId=org_99999999-9999-4999-8999-999999999999', deps,
  });
  assert.equal(result.status, 404);
  assert.equal(result.body.error, 'work_item_not_found');
});

test('non-source-intake route is ignored', async () => {
  const result = await invoke({ method: 'GET', pathname: `/api/work-items/${workId}`, deps: dependencies() });
  assert.equal(result.handled, false);
});
