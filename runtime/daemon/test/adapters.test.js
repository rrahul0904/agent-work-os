import assert from 'node:assert/strict';
import test from 'node:test';
import { EchoAdapter } from '../src/adapters.js';

test('EchoAdapter emits health evidence before running and completes a turn', async () => {
  const adapter = new EchoAdapter(); const events = [];
  const result = await adapter.run({ sessionId:'s1', cwd:process.cwd(), prompt:'hello' }, (event)=>events.push(event));
  assert.equal(result.nativeSessionId, 'echo-s1');
  assert.ok(events.some((event)=>event.kind==='text' && event.text==='Echo: hello'));
  const healthIndex = events.findIndex((event)=>event.kind==='health' && event.healthy===true && event.sessionId==='s1');
  const runningIndex = events.findIndex((event)=>event.kind==='status' && event.status==='running');
  assert.ok(healthIndex >= 0, 'health evidence is required');
  assert.ok(runningIndex > healthIndex, 'running must follow health evidence');
  assert.equal(events.at(-1).status, 'completed');
});
