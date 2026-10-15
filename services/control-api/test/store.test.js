import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { JsonStore } from '../src/store.js';

const databaseUrl = process.env.AGENT_WORK_OS_TEST_DATABASE_URL;

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

test('Postgres compatibility keeps unowned local daemon sessions on the JSON snapshot', { skip: !databaseUrl }, async () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;
  const originalPoolMax = process.env.AGENT_WORK_OS_DB_POOL_MAX;
  process.env.DATABASE_URL = databaseUrl;
  process.env.AGENT_WORK_OS_DB_POOL_MAX = '1';
  const store = new JsonStore(path.join(os.tmpdir(), 'agent-work-os-legacy-db-state.json'));
  if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = originalDatabaseUrl;
  if (originalPoolMax === undefined) delete process.env.AGENT_WORK_OS_DB_POOL_MAX;
  else process.env.AGENT_WORK_OS_DB_POOL_MAX = originalPoolMax;
  const machineId = `legacy-${crypto.randomUUID()}`;
  const sessionId = `legacy-${crypto.randomUUID()}`;
  const runId = `legacy-${crypto.randomUUID()}`;
  let reloaded;
  try {
    await store.load();
    await store.initializeMachineSessionStore();
    const now = new Date().toISOString();
    const machine = { id: machineId, name: 'Local legacy daemon', status: 'online', capabilities: [], lastSeenAt: now };
    await store.upsertMachine(machine);
    assert.equal((await store.touchMachine(machineId)).status, 'online', 'legacy heartbeats do not deadlock a one-connection pool');
    assert.equal((await store.getMachine(machineId)).id, machineId);
    assert.ok((await store.listMachines()).some((entry) => entry.id === machineId));
    await store.createSession({ id: sessionId, machineId, cwd: '/tmp', agent: 'echo', status: 'queued', createdAt: now, updatedAt: now, messages: [], events: [] });
    await store.addMessage(sessionId, { id: crypto.randomUUID(), role: 'user', text: 'legacy write', createdAt: now });
    await Promise.all(['parallel legacy A', 'parallel legacy B'].map((text) => store.addMessage(sessionId, {
      id: crypto.randomUUID(), role: 'user', text, createdAt: now
    })));
    assert.equal((await store.getSession(sessionId)).messages[0].text, 'legacy write');
    assert.equal((await store.getSession(sessionId)).messages.length, 3, 'same-session legacy messages serialize under the snapshot row lock');
    assert.ok((await store.listSessions()).some((entry) => entry.id === sessionId));
    const futureRun = { runId, state: 'COMPLETE', createdAt: now, updatedAt: '2099-01-01T00:00:00.000Z' };
    const firstRunWrite = await store.upsertShippingRun(futureRun);
    assert.ok(Date.parse(firstRunWrite.updatedAt) < Date.parse(futureRun.updatedAt),
      'client timestamps cannot move a ShippingRun into the future');
    const [concurrentFirstWrite, secondRunWrite] = await Promise.all([
      store.upsertShippingRun({ ...futureRun, state: 'COMPLETE', updatedAt: '2099-01-01T00:00:00.000Z' }),
      store.upsertShippingRun({ ...futureRun, state: 'QUEUED', updatedAt: '2000-01-01T00:00:00.000Z' })
    ]);
    assert.ok(Date.parse(concurrentFirstWrite.updatedAt) >= Date.parse(firstRunWrite.updatedAt));
    assert.ok(Date.parse(secondRunWrite.updatedAt) > Date.parse(concurrentFirstWrite.updatedAt),
      `the database assigns a strictly increasing timestamp to each serialized update (${concurrentFirstWrite.updatedAt} then ${secondRunWrite.updatedAt})`);
    process.env.DATABASE_URL = databaseUrl;
    process.env.AGENT_WORK_OS_DB_POOL_MAX = '1';
    reloaded = new JsonStore(path.join(os.tmpdir(), 'agent-work-os-legacy-db-reload.json'));
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabaseUrl;
    if (originalPoolMax === undefined) delete process.env.AGENT_WORK_OS_DB_POOL_MAX;
    else process.env.AGENT_WORK_OS_DB_POOL_MAX = originalPoolMax;
    await reloaded.load();
    assert.equal((await reloaded.getSession(sessionId)).messages.length, 3,
      'a shipping snapshot update cannot overwrite a concurrent legacy session path');
    assert.ok((await reloaded.getMachine(machineId)), 'legacy machine remains available after reload');
    assert.equal((await reloaded.listShippingRuns()).find((run) => run.runId === runId).state, 'QUEUED',
      'the latest serialized ShippingRun update wins regardless of its client timestamp');
  } finally {
    if (reloaded?.pool) await reloaded.pool.end();
    await store.pool.query(
      "UPDATE agent_work_os_state_v1 SET payload = payload #- ARRAY['machines', $1] #- ARRAY['sessions', $2] #- ARRAY['shippingRuns', $3] #- ARRAY['_shippingRunUpdatedAt', $3] WHERE state_key = 'global'",
      [machineId, sessionId, runId]
    );
    await store.pool.end();
  }
});
