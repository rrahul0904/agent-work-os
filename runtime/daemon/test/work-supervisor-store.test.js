import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createPersistentWorkSupervisor } from "../src/work-supervisor-store.js";

function clock(...values) {
  let index = 0;
  return () => values[Math.min(index++, values.length - 1)];
}

test("persistent supervisor atomically restores work and marks interrupted runtime work lost", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "awos-supervisor-"));
  const filePath = path.join(root, "runtime-supervisor.json");
  try {
    const first = await createPersistentWorkSupervisor({ filePath, now: clock(10, 20, 30, 40) });
    await first.createWork({
      id: "run:command-1",
      sessionId: "session-1",
      kind: "process",
      adapterId: "echo",
      backendId: "local"
    });
    await first.transitionWork("run:command-1", { expectedSequence: 0, to: "running", reason: "session_start" });
    await first.enqueueWake({
      id: "wake-1",
      deliveryKey: "work:run:command-1:started",
      sessionId: "session-1",
      workId: "run:command-1",
      source: "work"
    });

    const restarted = await createPersistentWorkSupervisor({ filePath, now: clock(500, 510) });
    const work = restarted.getWork("run:command-1");
    assert.equal(work.state, "lost");
    assert.equal(work.sequence, 2);
    assert.equal(work.transitionReceipts.at(-1).reason, "runtime_restart");
    assert.equal(restarted.nextWake().id, "wake-1");

    const [recovered] = restarted.drainRecoveredWork();
    assert.equal(recovered.work.id, "run:command-1");
    assert.equal(recovered.receipt.reason, "runtime_restart");
    assert.deepEqual(restarted.drainRecoveredWork(), []);

    const onDisk = JSON.parse(await readFile(filePath, "utf8"));
    assert.equal(onDisk.version, 1);
    assert.equal(onDisk.workItems[0].state, "lost");
    assert.equal(onDisk.wakeDeliveries[0].deliveryKey, "work:run:command-1:started");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("persistent supervisor preserves wake idempotency across restart", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "awos-supervisor-"));
  const filePath = path.join(root, "runtime-supervisor.json");
  try {
    const first = await createPersistentWorkSupervisor({ filePath });
    await first.enqueueWake({
      id: "wake-original",
      deliveryKey: "monitor:build:42",
      sessionId: "session-1",
      source: "monitor",
      selfWakeDepth: 1
    });

    const restarted = await createPersistentWorkSupervisor({ filePath });
    const duplicate = await restarted.enqueueWake({
      id: "wake-retry",
      deliveryKey: "monitor:build:42",
      sessionId: "session-1",
      source: "monitor",
      selfWakeDepth: 1
    });
    assert.equal(duplicate.kind, "duplicate");
    assert.equal(duplicate.delivery.id, "wake-original");
    assert.equal(restarted.listWakes().length, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
