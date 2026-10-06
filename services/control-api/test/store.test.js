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
  assert.equal(reloaded.getSession('s1').lastEventSequence, 0);
});

test('sequenced events are persisted, deduplicated and refuse gaps', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'agent-work-os-store-'));
  const file = path.join(dir, 'state.json');
  const store = new JsonStore(file); await store.load();
  const now = new Date().toISOString();
  await store.createSession({ id:'s1', machineId:'m1', cwd:dir, agent:'echo', status:'queued', createdAt:now, updatedAt:now, messages:[], events:[] });

  const accepted = await store.addSequencedEvent('s1', 1, { kind:'text', text:'one', at:now });
  assert.equal(accepted.disposition, 'accepted');
  assert.equal(accepted.ackThrough, 1);

  const gap = await store.addSequencedEvent('s1', 3, { kind:'text', text:'three', at:now });
  assert.equal(gap.disposition, 'gap');
  assert.equal(gap.expectedSequence, 2);
  assert.equal(store.getSession('s1').events.length, 1);

  const duplicate = await store.addSequencedEvent('s1', 1, { kind:'text', text:'duplicate', at:now });
  assert.equal(duplicate.disposition, 'duplicate');
  assert.equal(store.getSession('s1').events.length, 1);

  await store.addSequencedEvent('s1', 2, { kind:'status', status:'completed', at:now });
  const reloaded = new JsonStore(file); await reloaded.load();
  assert.equal(reloaded.getSession('s1').lastEventSequence, 2);
  assert.equal(reloaded.getSession('s1').status, 'completed');
  assert.equal(reloaded.getSession('s1').events.length, 2);
});
