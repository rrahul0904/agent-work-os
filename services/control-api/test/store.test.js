import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { JsonStore } from '../src/store.js';

test('JsonStore persists sessions and assistant events', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'agent-work-os-store-'));
  const file = path.join(dir, 'state.json');
  const store = new JsonStore(file); await store.load();
  const now = new Date().toISOString();
  await store.createSession({ id:'s1', machineId:'m1', cwd:dir, agent:'echo', status:'queued', createdAt:now, updatedAt:now, messages:[], events:[] });
  await store.addEvent('s1', { kind:'text', text:'done', at:now });
  const reloaded = new JsonStore(file); await reloaded.load();
  assert.equal(reloaded.getSession('s1').messages[0].text, 'done');
});
