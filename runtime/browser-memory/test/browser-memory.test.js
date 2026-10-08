import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { BrowserLearningMemory } from '../src/index.js';

async function makeStore(options = {}) {
  const root = await mkdtemp(join(tmpdir(), 'browser-memory-'));
  let tick = 0;
  const store = new BrowserLearningMemory({
    root,
    verificationThreshold: 2,
    failureThreshold: 2,
    clock: () => `2026-10-07T20:00:0${tick++}Z`,
    ...options,
  });
  return { root, store };
}

const scope = { workspaceId: 'self-working-agent', profileId: 'work' };
const url = 'https://Example.com/account/projects?tab=active';
const goal = 'collect active project names';
const steps = [
  { type: 'navigate', path: '/account/projects' },
  { type: 'click', selector: '[data-tab="active"]' },
  { type: 'extract', selector: '[data-project-name]' },
];

async function verified(store, overrides = {}) {
  return store.learn({
    url,
    goal,
    steps,
    ...scope,
    sessionId: 'session-a',
    outcome: 'success',
    verification: { verified: true, kind: 'assertion' },
    evidenceDigest: 'sha256:evidence',
    ...overrides,
  });
}

test('promotes a route only after repeated verified success', async () => {
  const { store } = await makeStore();
  await verified(store);
  let suggestion = await store.suggest({ url, goal, ...scope });
  assert.equal(suggestion.memoryHit, true);
  assert.equal(suggestion.trusted, false);
  assert.equal(suggestion.mustRevalidate, true);

  await verified(store, { sessionId: 'session-b' });
  suggestion = await store.suggest({ url, goal, ...scope });
  assert.equal(suggestion.trusted, true);
  assert.equal(suggestion.route.status, 'trusted');
  assert.equal(suggestion.route.verifiedSuccesses, 2);
});

test('session identity does not fragment profile-scoped memory', async () => {
  const { store } = await makeStore({ verificationThreshold: 1 });
  await verified(store, { sessionId: 'session-a' });
  const suggestion = await store.suggest({ url, goal, ...scope });
  assert.equal(suggestion.trusted, true);
  assert.equal(suggestion.route.evidence.at(-1).sessionId, 'session-a');
});

test('profile scopes cannot read each other memory', async () => {
  const { store } = await makeStore({ verificationThreshold: 1 });
  await verified(store);
  const other = await store.suggest({ url, goal, workspaceId: scope.workspaceId, profileId: 'personal' });
  assert.equal(other.memoryHit, false);
  assert.equal(other.reason, 'MEMORY_MISS');
});

test('stales a trusted route after bounded consecutive failures', async () => {
  const { store } = await makeStore({ verificationThreshold: 1, failureThreshold: 2 });
  await verified(store);
  for (const sessionId of ['failure-a', 'failure-b']) {
    await store.learn({
      url,
      goal,
      steps,
      ...scope,
      sessionId,
      outcome: 'failure',
      verification: { verified: false, kind: 'browser-error' },
      evidenceDigest: `sha256:${sessionId}`,
    });
  }
  const suggestion = await store.suggest({ url, goal, ...scope });
  assert.equal(suggestion.trusted, false);
  assert.equal(suggestion.route.status, 'stale');
  assert.equal(suggestion.fallbackRequired, true);
});

test('repair creates a new revision instead of rewriting stale history', async () => {
  const { store } = await makeStore({ verificationThreshold: 1, failureThreshold: 1 });
  const first = await verified(store);
  await store.learn({
    url, goal, steps, ...scope,
    sessionId: 'drift', outcome: 'failure', drift: true,
    verification: { verified: false, kind: 'selector-miss' },
    evidenceDigest: 'sha256:drift',
  });
  const repairedSteps = [
    { type: 'navigate', path: '/account/projects' },
    { type: 'click', selector: '[role="tab"][name="Active"]' },
    { type: 'extract', selector: '[data-project-name]' },
  ];
  const repaired = await verified(store, { steps: repairedSteps, sessionId: 'repair' });
  assert.equal(first.route.revision, 1);
  assert.equal(repaired.route.revision, 2);
  assert.notEqual(first.route.routeId, repaired.route.routeId);
  const loaded = await store.load({ url, ...scope });
  const goalRecord = loaded.memory.goals[Object.keys(loaded.memory.goals)[0]];
  assert.equal(goalRecord.revisions.length, 2);
  assert.equal(goalRecord.revisions[0].status, 'superseded');
});

test('corrupt memory produces a safe live-browser fallback', async () => {
  const { store } = await makeStore();
  const path = await store.memoryPath({ url, ...scope });
  await writeFile(path, '{bad json', 'utf8');
  const suggestion = await store.suggest({ url, goal, ...scope });
  assert.equal(suggestion.memoryHit, false);
  assert.equal(suggestion.reason, 'MEMORY_CORRUPT');
  assert.equal(suggestion.fallbackRequired, true);
});

test('rejects secret-shaped fields before persistence', async () => {
  const { store } = await makeStore();
  await assert.rejects(() => store.learn({
    url, goal, ...scope,
    steps: [{ type: 'request', authorization: 'Bearer abc.def.ghi' }],
    sessionId: 'secret', outcome: 'success',
    verification: { verified: true },
  }), /SECRET_FIELD_REJECTED/);
});

test('rejects a symlink-backed memory root', async () => {
  const target = await mkdtemp(join(tmpdir(), 'browser-memory-target-'));
  const base = await mkdtemp(join(tmpdir(), 'browser-memory-link-'));
  const link = join(base, 'memory');
  await symlink(target, link, 'dir');
  const store = new BrowserLearningMemory({ root: link });
  const suggestion = await store.suggest({ url, goal, ...scope });
  assert.equal(suggestion.memoryHit, false);
  assert.equal(suggestion.reason, 'MEMORY_UNAVAILABLE');
  assert.match(suggestion.error, /SYMLINK_REJECTED/);
});

test('emits deterministic evidence receipt fields and a digest', async () => {
  const { store } = await makeStore({ verificationThreshold: 1 });
  const result = await verified(store);
  assert.equal(result.receipt.memoryVersion, 1);
  assert.equal(result.receipt.status, 'trusted');
  assert.match(result.receipt.receiptDigest, /^sha256:[a-f0-9]{64}$/);
  const path = await store.memoryPath({ url, ...scope });
  const persisted = JSON.parse(await readFile(path, 'utf8'));
  assert.equal(persisted.lastReceipt.receiptDigest, result.receipt.receiptDigest);
});
