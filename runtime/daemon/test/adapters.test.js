import assert from 'node:assert/strict';
import test from 'node:test';
import { EchoAdapter } from '../src/adapters.js';

test('EchoAdapter completes a turn', async () => {
  const adapter = new EchoAdapter(); const events = [];
  const result = await adapter.run({ sessionId:'s1', cwd:process.cwd(), prompt:'hello' }, (event)=>events.push(event));
  assert.equal(result.nativeSessionId, 'echo-s1');
  assert.ok(events.some((event)=>event.kind==='text' && event.text==='Echo: hello'));
  assert.equal(events.at(-1).status, 'completed');
});
