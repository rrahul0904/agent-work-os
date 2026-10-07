import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { appendEntry, createWorkMemoryPage } from "../src/work-memory.js";
import { WorkMemoryStore } from "../src/work-memory-store.js";

const agent = { type: "agent", id: "agent:codex" };

async function fixture(t) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "agent-work-os-memory-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return path.join(dir, "work-memory.json");
}

test("store persists and reloads validated Work Memory pages", async (t) => {
  const filePath = await fixture(t);
  const store = await new WorkMemoryStore(filePath).load();
  const page = createWorkMemoryPage({ workId: "work:1", title: "Persistence" });
  await store.create(page);

  const working = store.get("work:1");
  appendEntry(working, {
    id: "o1", kind: "observation", actor: agent, body: "persist me", createdAt: "2026-10-07T17:10:00Z",
  }, { expectedRevision: 0, idempotencyKey: "idem:o1" });
  await store.save(working, { expectedStoredRevision: 0 });

  const restarted = await new WorkMemoryStore(filePath).load();
  assert.equal(restarted.get("work:1").entries[0].body, "persist me");
  assert.equal(restarted.get("work:1").revision, 1);
});

test("idempotency ledger survives restart and prevents duplicate replay", async (t) => {
  const filePath = await fixture(t);
  const store = await new WorkMemoryStore(filePath).load();
  const page = createWorkMemoryPage({ workId: "work:2" });
  await store.create(page);
  const first = store.get("work:2");
  const mutation = { id: "o1", kind: "observation", actor: agent, body: "only once", createdAt: "2026-10-07T17:11:00Z" };
  appendEntry(first, mutation, { expectedRevision: 0, idempotencyKey: "replay-key" });
  await store.save(first, { expectedStoredRevision: 0 });

  const restarted = await new WorkMemoryStore(filePath).load();
  const reloaded = restarted.get("work:2");
  const replay = appendEntry(reloaded, mutation, { expectedRevision: 1, idempotencyKey: "replay-key" });
  assert.equal(replay.replayed, true);
  assert.equal(reloaded.entries.length, 1);
  assert.equal(reloaded.revision, 1);
});

test("concurrent stale save is refused", async (t) => {
  const filePath = await fixture(t);
  const store = await new WorkMemoryStore(filePath).load();
  await store.create(createWorkMemoryPage({ workId: "work:3" }));

  const a = store.get("work:3");
  const b = store.get("work:3");
  appendEntry(a, { id: "a", kind: "observation", actor: agent, body: "a", createdAt: "2026-10-07T17:12:00Z" }, { expectedRevision: 0, idempotencyKey: "a" });
  appendEntry(b, { id: "b", kind: "observation", actor: agent, body: "b", createdAt: "2026-10-07T17:12:01Z" }, { expectedRevision: 0, idempotencyKey: "b" });

  await store.save(a, { expectedStoredRevision: 0 });
  await assert.rejects(
    store.save(b, { expectedStoredRevision: 0 }),
    (error) => error.code === "stored_revision_conflict",
  );
  assert.deepEqual(store.get("work:3").entries.map((entry) => entry.id), ["a"]);
});

test("reload fails closed when persisted entry content is tampered", async (t) => {
  const filePath = await fixture(t);
  const store = await new WorkMemoryStore(filePath).load();
  await store.create(createWorkMemoryPage({ workId: "work:4" }));
  const page = store.get("work:4");
  appendEntry(page, { id: "o1", kind: "observation", actor: agent, body: "trusted digest", createdAt: "2026-10-07T17:13:00Z" }, { expectedRevision: 0, idempotencyKey: "o1" });
  await store.save(page, { expectedStoredRevision: 0 });

  const raw = JSON.parse(await readFile(filePath, "utf8"));
  raw.pages["work:4"].entries[0].body = "tampered after persistence";
  await writeFile(filePath, JSON.stringify(raw, null, 2), "utf8");

  await assert.rejects(
    new WorkMemoryStore(filePath).load(),
    (error) => error.code === "entry_digest_mismatch",
  );
});
