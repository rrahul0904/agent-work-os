import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { MultiplayerCanvasStore } from '../src/multiplayer-canvas.js';

async function fixture() {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'agent-work-os-canvas-'));
  const file = path.join(dir, 'canvas.json');
  let nowMs = Date.parse('2026-10-03T20:00:00.000Z');
  const clock = () => new Date(nowMs);
  const advance = (milliseconds) => { nowMs += milliseconds; };
  const store = new MultiplayerCanvasStore(file, { clock });
  await store.load();
  const canvas = await store.createCanvas({ roomId: 'room-1', name: 'Engineering canvas' });
  await store.upsertMember(canvas.id, { actorId: 'rahul', displayName: 'Rahul', role: 'driver' });
  await store.upsertMember(canvas.id, { actorId: 'observer', displayName: 'Observer', role: 'viewer' });
  await store.upsertMember(canvas.id, { actorId: 'reviewer', displayName: 'Reviewer', role: 'driver' });
  const agent = await store.addNode(canvas.id, {
    kind: 'agent', title: 'Implementer', roomAgentId: 'room-agent-1', sessionId: 'session-1', x: 120, y: 80
  });
  const note = await store.addNode(canvas.id, { kind: 'note', title: 'Evidence', x: 520, y: 80 });
  return { dir, file, store, canvas, agent, note, clock, advance };
}

function health(clock, sessionId = 'session-1') {
  return { healthy: true, sessionId, observedAt: clock().toISOString(), source: 'daemon_probe' };
}

test('agent cannot become running until the exact session has positive health evidence', async () => {
  const { store, canvas, agent, clock } = await fixture();
  await assert.rejects(store.transitionNode(canvas.id, agent.id, { to: 'running' }), /node_transition_invalid:idle:running/);
  await store.transitionNode(canvas.id, agent.id, { to: 'starting', reason: 'launch requested' });
  await assert.rejects(store.transitionNode(canvas.id, agent.id, { to: 'running' }), /running_requires_health_evidence/);
  await assert.rejects(
    store.transitionNode(canvas.id, agent.id, { to: 'running', healthEvidence: health(clock, 'wrong-session') }),
    /health_session_mismatch/
  );
  const running = await store.transitionNode(canvas.id, agent.id, { to: 'running', healthEvidence: health(clock) });
  assert.equal(running.node.status, 'running');
  assert.equal(running.node.healthEvidence.sessionId, 'session-1');
  assert.equal(running.node.healthEvidence.source, 'daemon_probe');
});

test('failed upstream agent never makes a context dependency ready, while verified completion does', async () => {
  const { store, canvas, agent, note, clock } = await fixture();
  const link = await store.addContextLink(canvas.id, {
    sourceNodeId: agent.id, targetNodeId: note.id, share: 'summary', requiresReview: true
  });
  assert.equal(link.execution, 'none');
  assert.equal(link.gate, 'source_completed');

  await store.transitionNode(canvas.id, agent.id, { to: 'starting' });
  await store.transitionNode(canvas.id, agent.id, { to: 'error', reason: 'client exited before first turn' });
  assert.deepEqual(store.contextLinkStatus(canvas.id, link.id), {
    linkId: link.id, ready: false, sourceStatus: 'error', execution: 'none', requiresReview: true
  });

  await store.transitionNode(canvas.id, agent.id, { to: 'starting' });
  await store.transitionNode(canvas.id, agent.id, { to: 'running', healthEvidence: health(clock) });
  await store.transitionNode(canvas.id, agent.id, { to: 'completed', reason: 'verified turn completed' });
  assert.equal(store.contextLinkStatus(canvas.id, link.id).ready, true);
});

test('driver lease is exclusive, role-gated, token-bound, and plaintext token is never persisted', async () => {
  const { store, canvas, file } = await fixture();
  await assert.rejects(store.acquireDriver(canvas.id, { actorId: 'observer' }), /driver_role_required/);
  const acquired = await store.acquireDriver(canvas.id, { actorId: 'rahul', leaseSeconds: 60 });
  assert.equal(acquired.lease.actorId, 'rahul');
  assert.equal(acquired.lease.status, 'active');
  assert.equal('tokenHash' in acquired.lease, false);
  assert.equal(store.authorizeInput(canvas.id, { actorId: 'rahul', token: acquired.token }).authorized, true);
  assert.throws(() => store.authorizeInput(canvas.id, { actorId: 'rahul', token: 'wrong' }), /driver_lease_token_invalid/);
  assert.throws(() => store.authorizeInput(canvas.id, { actorId: 'reviewer', token: acquired.token }), /driver_lease_actor_mismatch/);
  await assert.rejects(store.acquireDriver(canvas.id, { actorId: 'reviewer' }), /driver_lease_busy/);
  const raw = await readFile(file, 'utf8');
  assert.equal(raw.includes(acquired.token), false, 'plaintext driver token must not be persisted');
});

test('expired or revoked driver authority fails closed and role downgrade revokes the active lease', async () => {
  const { store, canvas, advance } = await fixture();
  const first = await store.acquireDriver(canvas.id, { actorId: 'rahul', leaseSeconds: 15 });
  advance(16_000);
  assert.throws(() => store.authorizeInput(canvas.id, { actorId: 'rahul', token: first.token }), /driver_lease_inactive/);
  assert.equal(store.publicCanvas(canvas.id).driverLease.status, 'expired');

  const second = await store.acquireDriver(canvas.id, { actorId: 'rahul', leaseSeconds: 60 });
  await store.upsertMember(canvas.id, { actorId: 'rahul', displayName: 'Rahul', role: 'viewer' });
  assert.equal(store.publicCanvas(canvas.id).driverLease.status, 'revoked');
  assert.throws(() => store.authorizeInput(canvas.id, { actorId: 'rahul', token: second.token }), /driver_lease_inactive/);
});

test('hibernation preserves layout and session provenance while dropping live lifecycle authority', async () => {
  const { store, canvas, agent, clock } = await fixture();
  await store.updateLayout(canvas.id, agent.id, { x: 333, y: 222, width: 640, height: 420 });
  await store.transitionNode(canvas.id, agent.id, { to: 'starting' });
  await store.transitionNode(canvas.id, agent.id, { to: 'running', healthEvidence: health(clock) });
  const hibernated = await store.transitionNode(canvas.id, agent.id, { to: 'hibernated', reason: 'release process capacity' });
  assert.equal(hibernated.node.status, 'hibernated');
  assert.equal(hibernated.node.sessionId, 'session-1');
  assert.equal(hibernated.node.roomAgentId, 'room-agent-1');
  assert.equal(hibernated.node.x, 333);
  assert.equal(hibernated.node.y, 222);
  assert.equal(hibernated.node.width, 640);
  assert.equal(hibernated.node.height, 420);
});

test('restart never assumes in-flight success and always revokes driver authority', async () => {
  const { store, canvas, agent, file, clock } = await fixture();
  const lease = await store.acquireDriver(canvas.id, { actorId: 'rahul', leaseSeconds: 300 });
  await store.transitionNode(canvas.id, agent.id, { to: 'starting' });
  await store.transitionNode(canvas.id, agent.id, { to: 'running', healthEvidence: health(clock) });

  const reloaded = new MultiplayerCanvasStore(file, { clock });
  await reloaded.load();
  const recovered = reloaded.publicCanvas(canvas.id);
  assert.equal(recovered.nodes.find((node) => node.id === agent.id).status, 'interrupted');
  assert.equal(recovered.driverLease.status, 'revoked');
  assert.equal(recovered.driverLease.revokeReason, 'control_plane_restart');
  assert.throws(() => reloaded.authorizeInput(canvas.id, { actorId: 'rahul', token: lease.token }), /driver_lease_inactive/);
});

test('replayed lifecycle mutation is rejected deterministically instead of being applied twice', async () => {
  const { store, canvas, agent } = await fixture();
  const first = await store.transitionNode(canvas.id, agent.id, { to: 'starting', reason: 'launch', idempotencyKey: 'launch-1' });
  assert.equal(first.duplicate, false);
  await assert.rejects(
    store.transitionNode(canvas.id, agent.id, { to: 'starting', reason: 'launch', idempotencyKey: 'launch-1' }),
    /idempotency_conflict/
  );
  assert.equal(store.publicCanvas(canvas.id).nodes.find((node) => node.id === agent.id).status, 'starting');
});

test('context links are reference-only records and never imply downstream execution', async () => {
  const { store, canvas, agent, note } = await fixture();
  const link = await store.addContextLink(canvas.id, {
    sourceNodeId: agent.id,
    targetNodeId: note.id,
    share: 'artifacts',
    maxChars: 100000,
    requiresReview: true
  });
  assert.equal(link.execution, 'none');
  assert.equal(link.requiresReview, true);
  assert.equal(link.maxChars, 12000);
  assert.equal(store.publicCanvas(canvas.id).nodes.find((node) => node.id === note.id).status, 'idle');
});
