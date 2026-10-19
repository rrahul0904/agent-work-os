import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { JsonStore } from "../src/store.js";
import { CapabilityVerificationRepository } from "../src/capability-verification-store.js";

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "agent-work-os-capability-run-"));
  const statePath = path.join(root, "state.json");
  const store = new JsonStore(statePath);
  await store.load();
  const repository = new CapabilityVerificationRepository(store);
  await repository.initialize();
  return { root, statePath, store, repository };
}

function records() {
  const now = "2026-10-16T12:00:00.000Z";
  const session = {
    id: "session-1",
    organizationId: "org_00000000-0000-4000-8000-000000000001",
    createdBy: "user_00000000-0000-4000-8000-000000000002",
    machineId: "machine_00000000-0000-4000-8000-000000000003",
    cwd: "/tmp/workspace",
    agent: "capability-verify",
    status: "queued",
    createdAt: now,
    updatedAt: now,
    messages: [],
    events: []
  };
  const run = {
    id: "run_00000000-0000-4000-8000-000000000004",
    organizationId: session.organizationId,
    machineId: session.machineId,
    sessionId: session.id,
    createdBy: session.createdBy,
    capabilityId: "capability_00000000-0000-4000-8000-000000000005",
    capabilityVersion: "1.0.0",
    capabilitySlug: "remote-verify",
    harnessId: "codex",
    mode: "artifact-context",
    cwd: session.cwd,
    status: "queued",
    receipt: null,
    createdAt: now,
    updatedAt: now
  };
  const command = {
    type: "server.command",
    commandId: "command-1",
    sessionId: session.id,
    action: "session.start",
    payload: { agent: "capability-verify" }
  };
  return { run, session, command };
}

test("local verification runs persist independently and survive repository restart", async () => {
  const { statePath, repository } = await fixture();
  const { run, session, command } = records();
  await repository.createWithSession(run, session, command);
  assert.deepEqual(await repository.get(run.id, run.organizationId), run);
  assert.equal((await repository.listByOrganization(run.organizationId)).length, 1);

  const restartedStore = new JsonStore(statePath);
  await restartedStore.load();
  const restarted = new CapabilityVerificationRepository(restartedStore);
  await restarted.initialize();
  const recovered = await restarted.get(run.id, run.organizationId);
  assert.equal(recovered.id, run.id);
  assert.equal(recovered.sessionId, session.id);
});

test("session events drive normalized verification run lifecycle and receipt", async () => {
  const { repository } = await fixture();
  const { run, session, command } = records();
  await repository.createWithSession(run, session, command);

  const running = await repository.updateFromSessionEvent(session.id, {
    kind: "status", status: "running", at: "2026-10-16T12:01:00.000Z"
  });
  assert.equal(running.status, "running");
  assert.equal(running.startedAt, "2026-10-16T12:01:00.000Z");

  const receipt = { verificationMode: "artifact-context", passed: true, score: 1, receiptDigest: "sha256:abc" };
  const complete = await repository.updateFromSessionEvent(session.id, {
    kind: "tool", name: "capability.verification.receipt", phase: "completed", payload: receipt,
    at: "2026-10-16T12:02:00.000Z"
  });
  assert.equal(complete.status, "complete");
  assert.deepEqual(complete.receipt, receipt);
  assert.equal(complete.completedAt, "2026-10-16T12:02:00.000Z");
});

test("session event consumers receive non-verification session events without fabricating a verification run", async () => {
  const { repository } = await fixture();
  const seen = [];
  const unregister = repository.registerSessionEventConsumer(async (entry) => seen.push(entry));
  const event = { kind: "tool", name: "source-access-observation", phase: "completed", payload: { ok: true } };
  const result = await repository.updateFromSessionEvent("browser-session-1", event);
  assert.equal(result, null);
  assert.deepEqual(seen, [{ sessionId: "browser-session-1", event }]);
  unregister();
  await repository.updateFromSessionEvent("browser-session-2", event);
  assert.equal(seen.length, 1);
});

test("completed status without receipt remains verifying until receipt arrives", async () => {
  const { repository } = await fixture();
  const { run, session, command } = records();
  await repository.createWithSession(run, session, command);
  const verifying = await repository.updateFromSessionEvent(session.id, {
    kind: "status", status: "completed", at: "2026-10-16T12:01:00.000Z"
  });
  assert.equal(verifying.status, "verifying");
});

test("error event fails a verification run", async () => {
  const { repository } = await fixture();
  const { run, session, command } = records();
  await repository.createWithSession(run, session, command);
  const failed = await repository.updateFromSessionEvent(session.id, {
    kind: "error", message: "codex unavailable", at: "2026-10-16T12:01:00.000Z"
  });
  assert.equal(failed.status, "failed");
  assert.equal(failed.error, "codex unavailable");
});

test("create rejects session/run ownership mismatch", async () => {
  const { repository } = await fixture();
  const { run, session, command } = records();
  session.organizationId = "org_00000000-0000-4000-8000-000000000099";
  await assert.rejects(repository.createWithSession(run, session, command), { code: "capability_verification_session_scope_invalid" });
});
