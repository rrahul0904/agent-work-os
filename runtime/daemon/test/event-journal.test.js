import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { DurableSessionEventJournal } from "../src/event-journal.js";

test("journal persists unacknowledged events across daemon restart", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "agent-work-os-journal-"));
  const file = path.join(dir, "events.json");
  const first = new DurableSessionEventJournal(file); await first.load();
  const one = await first.append("s1", { kind: "text", text: "one" }, { at: "2026-10-06T18:00:00.000Z" });
  const two = await first.append("s1", { kind: "status", status: "completed" }, { at: "2026-10-06T18:00:01.000Z" });
  assert.equal(one.sequence, 1); assert.equal(two.sequence, 2);

  const restarted = new DurableSessionEventJournal(file); await restarted.load();
  assert.deepEqual(restarted.listUnacked("s1").map((e) => e.sequence), [1, 2]);
  await restarted.ack("s1", 1);

  const afterAck = new DurableSessionEventJournal(file); await afterAck.load();
  assert.deepEqual(afterAck.listUnacked("s1").map((e) => e.sequence), [2]);
  assert.equal(afterAck.snapshot("s1").ackedThrough, 1);
});

test("ack cannot advance beyond durable journal", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "agent-work-os-journal-"));
  const journal = new DurableSessionEventJournal(path.join(dir, "events.json")); await journal.load();
  await journal.append("s1", { kind: "text", text: "one" });
  await assert.rejects(() => journal.ack("s1", 2), /event_journal_ack_ahead_of_log/);
});

test("replay can start from requested sequence", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "agent-work-os-journal-"));
  const journal = new DurableSessionEventJournal(path.join(dir, "events.json")); await journal.load();
  await journal.append("s1", { kind: "text", text: "one" });
  await journal.append("s1", { kind: "text", text: "two" });
  await journal.append("s1", { kind: "text", text: "three" });
  assert.deepEqual(journal.listUnacked("s1", { fromSequence: 2 }).map((e) => e.sequence), [2, 3]);
});
