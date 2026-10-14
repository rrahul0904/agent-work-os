import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createCanonicalId, createWorkItem } from "../../../packages/domain/src/index.js";
import { IdempotencyConflictError, OptimisticConcurrencyError, createWorkItemRepository } from "../src/work-item-store.js";
import { JsonStore } from "../src/store.js";

test("JSON compatibility repository persists work items, events, and idempotency across restart", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "agent-work-os-domain-store-"));
  const statePath = path.join(dir, "state.json");
  const store = new JsonStore(statePath);
  await store.load();
  const repository = createWorkItemRepository(store);
  const at = "2026-10-13T15:00:00.000Z";
  const item = createWorkItem({
    id: createCanonicalId("work"),
    organizationId: createCanonicalId("org"),
    projectId: createCanonicalId("project"),
    createdBy: createCanonicalId("user"),
    title: "Establish canonical work state",
    description: "A bounded first slice",
    createdAt: at
  });
  const actorId = item.createdBy;
  const createCommand = createCanonicalId("command");

  const created = await repository.create(item, { commandId: createCommand, actorId, at });
  assert.equal(created.replayed, false);
  const replayedCreate = await repository.create(item, { commandId: createCommand, actorId, at });
  assert.equal(replayedCreate.replayed, true);
  assert.deepEqual(replayedCreate.workItem, created.workItem);
  await assert.rejects(
    repository.create({ ...item, title: "Changed request" }, { commandId: createCommand, actorId, at }),
    IdempotencyConflictError
  );

  const readyCommand = createCanonicalId("command");
  const ready = await repository.transition(item.id, { organizationId: item.organizationId, commandId: readyCommand, actorId, expectedVersion: 1, to: "ready", at });
  assert.equal(ready.workItem.status, "ready");
  assert.equal(ready.workItem.version, 2);
  assert.equal((await repository.transition(item.id, { organizationId: item.organizationId, commandId: readyCommand, actorId, expectedVersion: 1, to: "ready", at })).replayed, true);

  const contenders = await Promise.allSettled([
    repository.transition(item.id, { organizationId: item.organizationId, commandId: createCanonicalId("command"), actorId, expectedVersion: 2, to: "running", at }),
    repository.transition(item.id, { organizationId: item.organizationId, commandId: createCanonicalId("command"), actorId, expectedVersion: 2, to: "blocked", at })
  ]);
  assert.equal(contenders.filter((result) => result.status === "fulfilled").length, 1);
  const conflict = contenders.find((result) => result.status === "rejected");
  assert.ok(conflict.reason instanceof OptimisticConcurrencyError);

  const reloaded = new JsonStore(statePath);
  await reloaded.load();
  const recovered = createWorkItemRepository(reloaded);
  assert.equal((await recovered.get(item.id, item.organizationId)).version, 3);
  assert.equal((await recovered.get(item.id, createCanonicalId("org"))), null);
  assert.equal((await recovered.listEvents(item.id, item.organizationId)).length, 3);
  assert.equal((await recovered.listByOrganization(item.organizationId)).length, 1);
});
