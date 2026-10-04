import assert from 'node:assert/strict';
import test from 'node:test';
import { createTurnHealthGate, hasPositiveProviderEvidence, isPositiveProviderAction } from '../src/turn-health.js';

test('health gate emits exact-session evidence before running exactly once', () => {
  const events = [];
  const gate = createTurnHealthGate({
    sessionId: 'session-42',
    provider: 'codex',
    emit: (event) => events.push(event),
    now: () => '2026-10-04T02:00:00.000Z'
  });

  assert.equal(gate.healthy, false);
  assert.equal(gate.confirm('codex.thread.started'), true);
  assert.equal(gate.healthy, true);
  assert.deepEqual(events.map((event) => event.kind), ['health', 'status']);
  assert.equal(events[0].sessionId, 'session-42');
  assert.equal(events[0].healthy, true);
  assert.equal(events[0].source, 'codex.thread.started');
  assert.equal(events[1].status, 'running');
  assert.equal(gate.confirm('codex.item.started'), false);
  assert.equal(events.length, 2);
});

test('provider action classifier never treats errors or failed status as health proof', () => {
  assert.equal(isPositiveProviderAction({ kind: 'error', message: 'boom' }), false);
  assert.equal(isPositiveProviderAction({ kind: 'status', status: 'failed' }), false);
  assert.equal(isPositiveProviderAction({ kind: 'log', text: 'unstructured output' }), false);
  assert.equal(isPositiveProviderAction({ kind: 'thread', nativeSessionId: 'abc' }), true);
  assert.equal(isPositiveProviderAction({ kind: 'text', text: 'hello' }), true);
  assert.equal(isPositiveProviderAction({ kind: 'tool', phase: 'started' }), true);
  assert.equal(isPositiveProviderAction({ kind: 'status', status: 'completed' }), true);
});

test('a structured provider event containing failure never becomes health evidence even if it also reports usage', () => {
  assert.equal(hasPositiveProviderEvidence([
    { kind: 'usage', usage: { inputTokens: 10 } },
    { kind: 'error', message: 'provider rejected request' },
    { kind: 'status', status: 'failed' }
  ]), false);

  assert.equal(hasPositiveProviderEvidence([
    { kind: 'usage', usage: { inputTokens: 10 } },
    { kind: 'status', status: 'completed' }
  ]), true);
});
