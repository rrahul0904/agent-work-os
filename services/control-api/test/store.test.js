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


test('JsonStore persists project desk work, decisions and activity', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'agent-work-os-desk-store-'));
  const file = path.join(dir, 'state.json');
  const store = new JsonStore(file); await store.load();
  await store.upsertWorkItem({ id:'w1', title:'Task', updatedAt:'2026-09-25T18:00:00Z' });
  await store.upsertDecision({ id:'d1', workItemId:'w1', status:'pending', requestedAt:'2026-09-25T18:01:00Z' });
  await store.addActivity({ id:'a1', workItemId:'w1', type:'work_item.created', at:'2026-09-25T18:00:00Z' });
  const reloaded = new JsonStore(file); await reloaded.load();
  assert.equal(reloaded.getWorkItem('w1').title, 'Task');
  assert.equal(reloaded.getDecision('d1').status, 'pending');
  assert.equal(reloaded.listActivity()[0].id, 'a1');
});
