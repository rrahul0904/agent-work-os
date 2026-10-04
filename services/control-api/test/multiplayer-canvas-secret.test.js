import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { MultiplayerCanvasStore } from '../src/multiplayer-canvas.js';

test('driver acquisition refuses durable idempotency because the capability token is one-time plaintext', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'agent-work-os-driver-secret-'));
  const file = path.join(dir, 'canvas.json');
  const store = new MultiplayerCanvasStore(file);
  await store.load();
  const canvas = await store.createCanvas({ roomId: 'room-1', name: 'Security proof' });
  await store.upsertMember(canvas.id, { actorId: 'driver-1', displayName: 'Driver', role: 'driver' });

  await assert.rejects(
    store.acquireDriver(canvas.id, { actorId: 'driver-1', idempotencyKey: 'must-not-persist-secret' }),
    /driver_idempotency_secret_unsupported/
  );

  const raw = await readFile(file, 'utf8');
  assert.equal(raw.includes('must-not-persist-secret'), false);
  assert.equal(store.publicCanvas(canvas.id).driverLease, undefined);
});
