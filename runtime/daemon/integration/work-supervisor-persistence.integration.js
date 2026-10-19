import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createPersistentWorkSupervisor } from "../src/work-supervisor-store.js";

test("concurrent supervisor mutations persist in invocation order without regressing the snapshot", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "awos-supervisor-"));
  const filePath = path.join(root, "runtime-supervisor.json");
  try {
    const supervisor = await createPersistentWorkSupervisor({ filePath });
    await Promise.all([
      supervisor.createWork({ id: "run:a", sessionId: "session-a", kind: "process", adapterId: "echo", backendId: "local" }),
      supervisor.createWork({ id: "run:b", sessionId: "session-b", kind: "process", adapterId: "echo", backendId: "local" })
    ]);
    await Promise.all([
      supervisor.transitionWork("run:a", { expectedSequence: 0, to: "running", reason: "start" }),
      supervisor.transitionWork("run:b", { expectedSequence: 0, to: "running", reason: "start" })
    ]);
    await supervisor.flush();

    const onDisk = JSON.parse(await readFile(filePath, "utf8"));
    assert.deepEqual(onDisk.workItems.map((work) => work.id).sort(), ["run:a", "run:b"]);
    assert.ok(onDisk.workItems.every((work) => work.state === "running" && work.sequence === 1));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
