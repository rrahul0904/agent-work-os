import assert from 'node:assert/strict';
import test from 'node:test';
import { isEphemeralSessionEvent, sanitizeTerminalSnapshot } from '../src/session-event-policy.js';

test('terminal snapshots are classified as ephemeral rather than durable session history', () => {
  assert.equal(isEphemeralSessionEvent({ kind: 'terminal.snapshot', text: '$ secret' }), true);
  assert.equal(isEphemeralSessionEvent({ kind: 'health', healthy: true }), false);
  assert.equal(isEphemeralSessionEvent({ kind: 'status', status: 'running' }), false);
});

test('terminal snapshots are size and dimension bounded before browser broadcast', () => {
  const snapshot = sanitizeTerminalSnapshot({
    kind: 'terminal.snapshot',
    text: 'x'.repeat(140000),
    digest: 'a'.repeat(500),
    cols: 10000,
    rows: 1,
    at: '2026-10-04T03:00:00Z'
  });
  assert.equal(snapshot.text.length, 131072);
  assert.equal(snapshot.digest.length, 128);
  assert.equal(snapshot.cols, 300);
  assert.equal(snapshot.rows, 10);
  assert.equal(snapshot.at, '2026-10-04T03:00:00.000Z');
});
