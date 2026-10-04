import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { MultiplayerCanvasStore } from '../src/multiplayer-canvas.js';
import { reconcileCanvasNodeFromSession, syncCanvasSessionEvent } from '../src/canvas-session-sync.js';

async function fixture() {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'agent-work-os-canvas-sync-'));
  const canvases = new MultiplayerCanvasStore(path.join(dir, 'canvases.json'));
  await canvases.load();
  const canvas = await canvases.createCanvas({ roomId: 'room-1', name: 'Live work' });
  const node = await canvases.addNode(canvas.id, {
    kind: 'agent',
    title: 'Codex',
    roomAgentId: 'agent-1',
    sessionId: 'session-1'
  });
  const session = { id: 'session-1', agent: 'codex', events: [] };
  return { canvases, canvas, node, session };
}

test('legacy running status alone never turns a canvas node healthy', async () => {
  const { canvases, canvas, node, session } = await fixture();
  await canvases.transitionNode(canvas.id, node.id, { to: 'starting', reason: 'launch' });
  const changed = await syncCanvasSessionEvent(canvases, session, {
    kind: 'status', status: 'running', at: '2026-10-04T02:00:00.000Z'
  });
  assert.deepEqual(changed, []);
  assert.equal(canvases.publicCanvas(canvas.id).nodes[0].status, 'starting');
});

test('positive exact-session health drives starting to running and completion drives completed', async () => {
  const { canvases, canvas, node, session } = await fixture();
  await canvases.transitionNode(canvas.id, node.id, { to: 'starting' });

  const healthChanged = await syncCanvasSessionEvent(canvases, session, {
    kind: 'health', healthy: true, provider: 'codex', source: 'codex.thread.started', at: '2026-10-04T02:00:00.000Z'
  });
  assert.deepEqual(healthChanged, [canvas.id]);
  let current = canvases.publicCanvas(canvas.id).nodes[0];
  assert.equal(current.status, 'running');
  assert.equal(current.healthEvidence.sessionId, 'session-1');
  assert.equal(current.healthEvidence.source, 'codex.thread.started');

  const completedChanged = await syncCanvasSessionEvent(canvases, session, {
    kind: 'status', status: 'completed', at: '2026-10-04T02:00:01.000Z'
  });
  assert.deepEqual(completedChanged, [canvas.id]);
  current = canvases.publicCanvas(canvas.id).nodes[0];
  assert.equal(current.status, 'completed');
});

test('failure before health becomes error and can never satisfy a completed context gate', async () => {
  const { canvases, canvas, node, session } = await fixture();
  const target = await canvases.addNode(canvas.id, { kind: 'note', title: 'Downstream evidence' });
  const link = await canvases.addContextLink(canvas.id, {
    sourceNodeId: node.id,
    targetNodeId: target.id,
    share: 'summary'
  });

  const changed = await syncCanvasSessionEvent(canvases, session, {
    kind: 'status', status: 'failed', at: '2026-10-04T02:00:00.000Z'
  });
  assert.deepEqual(changed, [canvas.id]);
  assert.equal(canvases.publicCanvas(canvas.id).nodes.find((item) => item.id === node.id).status, 'error');
  assert.equal(canvases.contextLinkStatus(canvas.id, link.id).ready, false);
});

test('interrupt maps to stopped and never to completed', async () => {
  const { canvases, canvas, node, session } = await fixture();
  await canvases.transitionNode(canvas.id, node.id, { to: 'starting' });
  await syncCanvasSessionEvent(canvases, session, {
    kind: 'health', healthy: true, source: 'codex.thread.started', at: '2026-10-04T02:00:00.000Z'
  });
  await syncCanvasSessionEvent(canvases, session, {
    kind: 'status', status: 'interrupted', at: '2026-10-04T02:00:02.000Z'
  });
  assert.equal(canvases.publicCanvas(canvas.id).nodes[0].status, 'stopped');
});

test('binding an existing session replays health/status evidence without inventing success', async () => {
  const { canvases, canvas, node, session } = await fixture();
  session.events = [
    { kind: 'health', healthy: true, provider: 'codex', source: 'codex.thread.started', at: '2026-10-04T02:00:00.000Z' },
    { kind: 'status', status: 'running', at: '2026-10-04T02:00:00.000Z' },
    { kind: 'status', status: 'completed', at: '2026-10-04T02:00:03.000Z' }
  ];
  await reconcileCanvasNodeFromSession(canvases, canvas.id, node.id, session);
  assert.equal(canvases.publicCanvas(canvas.id).nodes[0].status, 'completed');

  const second = await canvases.addNode(canvas.id, {
    kind: 'agent', title: 'Failed Claude', roomAgentId: 'agent-2', sessionId: 'session-2'
  });
  await reconcileCanvasNodeFromSession(canvases, canvas.id, second.id, {
    id: 'session-2', agent: 'claude', events: [{ kind: 'status', status: 'failed', at: '2026-10-04T02:01:00.000Z' }]
  });
  assert.equal(canvases.publicCanvas(canvas.id).nodes.find((item) => item.id === second.id).status, 'error');
});
