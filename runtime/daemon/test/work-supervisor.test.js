import assert from "node:assert/strict";
import test from "node:test";
import { createWakeQueue, createWorkLedger } from "../src/work-supervisor.js";

function clock(...values) {
  let index = 0;
  return () => values[Math.min(index++, values.length - 1)];
}

function baseWork(overrides = {}) {
  return {
    id: "work-1",
    sessionId: "session-1",
    kind: "process",
    adapterId: "echo",
    backendId: "local:test",
    ...overrides
  };
}

test("work ledger enforces ordered append-only transitions", () => {
  const ledger = createWorkLedger({ now: clock(100, 110, 120) });
  const created = ledger.create(baseWork());
  assert.equal(created.state, "queued");
  assert.equal(created.sequence, 0);

  const started = ledger.transition("work-1", { expectedSequence: 0, to: "running", evidenceRefs: ["receipt://start"] });
  assert.equal(started.work.state, "running");
  assert.equal(started.work.sequence, 1);
  assert.equal(started.work.startedAt, 110);
  assert.match(started.receipt.digest, /^sha256:[0-9a-f]{64}$/);

  assert.throws(
    () => ledger.transition("work-1", { expectedSequence: 0, to: "complete" }),
    /work_transition_stale/
  );

  const completed = ledger.transition("work-1", { expectedSequence: 1, to: "complete", resultRef: "artifact://result" });
  assert.equal(completed.work.sequence, 2);
  assert.equal(completed.work.finishedAt, 120);
  assert.equal(completed.work.transitionReceipts.length, 2);
  assert.throws(
    () => ledger.transition("work-1", { expectedSequence: 2, to: "complete" }),
    /work_transition_noop|work_transition_invalid/
  );
});

test("hydrate marks unrecoverable running work lost without erasing its history", () => {
  const original = createWorkLedger({ now: clock(1, 2) });
  original.create(baseWork());
  const running = original.transition("work-1", { expectedSequence: 0, to: "running", reason: "started" }).work;

  const restarted = createWorkLedger({ now: clock(500) });
  const [{ work: hydrated, recovered, receipt }] = restarted.hydrate([running]);
  assert.equal(recovered, true);
  assert.equal(hydrated.state, "lost");
  assert.equal(hydrated.sequence, 2);
  assert.equal(hydrated.transitionReceipts.length, 2);
  assert.equal(hydrated.transitionReceipts[0].reason, "started");
  assert.equal(hydrated.transitionReceipts[1].reason, "runtime_restart");
  assert.equal(receipt.reason, "runtime_restart");
});

test("wake queue deduplicates delivery keys and keeps user input ahead of machine wakes", () => {
  const queue = createWakeQueue({ now: clock(10, 11, 12) });
  queue.enqueue({ id: "wake-machine", deliveryKey: "work:1:done", sessionId: "session-1", workId: "work-1", source: "work" });
  queue.enqueue({ id: "wake-user", deliveryKey: "user:msg-1", sessionId: "session-1", source: "user" });

  assert.equal(queue.next().id, "wake-user");
  const duplicate = queue.enqueue({ id: "wake-duplicate", deliveryKey: "work:1:done", sessionId: "session-1", workId: "work-1", source: "work" });
  assert.equal(duplicate.kind, "duplicate");
  assert.equal(duplicate.delivery.id, "wake-machine");
  assert.equal(queue.list().length, 2);
});

test("wake settlement keeps causal provenance and cannot be applied twice", () => {
  const queue = createWakeQueue({ now: clock(20, 30) });
  queue.enqueue({
    id: "wake-child",
    deliveryKey: "subagent:child-7",
    sessionId: "session-1",
    workId: "work-child",
    source: "subagent",
    causalDeliveryId: "wake-parent",
    selfWakeDepth: 2
  });
  const settled = queue.settle("wake-child", "delivered", { reason: "child_complete" });
  assert.equal(settled.receipt.causalDeliveryId, "wake-parent");
  assert.match(settled.receipt.digest, /^sha256:[0-9a-f]{64}$/);
  assert.throws(() => queue.settle("wake-child", "failed"), /wake_delivery_already_settled/);
});

test("wake queue restores persisted queued and settled deliveries without changing identity", () => {
  const original = createWakeQueue({ now: clock(100, 110, 120) });
  original.enqueue({ id: "wake-queued", deliveryKey: "work:queued", sessionId: "session-1", source: "work" });
  original.enqueue({ id: "wake-done", deliveryKey: "work:done", sessionId: "session-1", source: "work" });
  original.settle("wake-done", "delivered", { reason: "done" });
  const snapshot = original.list();

  const restarted = createWakeQueue({ now: clock(999) });
  restarted.hydrate(snapshot);
  assert.equal(restarted.next().id, "wake-queued");
  assert.equal(restarted.get("wake-done").settlementReceipt.digest, snapshot[1].settlementReceipt.digest);
  const fresh = restarted.enqueue({ id: "wake-fresh", deliveryKey: "user:fresh", sessionId: "session-1", source: "user" });
  assert.equal(fresh.delivery.sequence, 3);
});

test("wake queue bounds self-caused chains", () => {
  const queue = createWakeQueue({ maxSelfWakeDepth: 2 });
  assert.throws(
    () => queue.enqueue({
      id: "wake-loop",
      deliveryKey: "loop:3",
      sessionId: "session-1",
      source: "monitor",
      selfWakeDepth: 3
    }),
    /wake_chain_limit_exceeded/
  );

  const user = queue.enqueue({
    id: "wake-user-deep",
    deliveryKey: "user:deep",
    sessionId: "session-1",
    source: "user",
    selfWakeDepth: 99
  });
  assert.equal(user.kind, "queued");
});
