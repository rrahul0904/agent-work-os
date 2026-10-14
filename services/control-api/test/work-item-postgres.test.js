import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";
import { createCanonicalId, createWorkItem } from "../../../packages/domain/src/index.js";
import { IdempotencyConflictError, OptimisticConcurrencyError, PostgresWorkItemRepository } from "../src/work-item-store.js";

const { Pool } = pg;
const databaseUrl = process.env.AGENT_WORK_OS_TEST_DATABASE_URL;

test("Postgres repository is transactional, optimistic, idempotent, and restart durable", { skip: !databaseUrl }, async () => {
  const poolA = new Pool({ connectionString: databaseUrl, max: 3 });
  const poolB = new Pool({ connectionString: databaseUrl, max: 3 });
  const repositoryA = new PostgresWorkItemRepository(poolA);
  const repositoryB = new PostgresWorkItemRepository(poolB);
  const item = createWorkItem({
    id: createCanonicalId("work"),
    organizationId: createCanonicalId("org"),
    projectId: createCanonicalId("project"),
    createdBy: createCanonicalId("user"),
    title: "Postgres persistence verification"
  });
  const actorId = item.createdBy;
  const createCommand = createCanonicalId("command");

  try {
    await repositoryA.initialize();
    await repositoryA.initialize();
    const created = await repositoryA.create(item, { commandId: createCommand, actorId });
    assert.equal(created.workItem.id, item.id);
    assert.equal((await repositoryB.create(item, { commandId: createCommand, actorId })).replayed, true);
    await assert.rejects(
      repositoryB.create({ ...item, title: "A different request" }, { commandId: createCommand, actorId }),
      IdempotencyConflictError
    );

    const readyCommand = createCanonicalId("command");
    await repositoryA.transition(item.id, { organizationId: item.organizationId, commandId: readyCommand, actorId, expectedVersion: 1, to: "ready" });
    const runningCommand = createCanonicalId("command");
    const blockedCommand = createCanonicalId("command");
    const contenders = await Promise.allSettled([
      repositoryA.transition(item.id, { organizationId: item.organizationId, commandId: runningCommand, actorId, expectedVersion: 2, to: "running" }),
      repositoryB.transition(item.id, { organizationId: item.organizationId, commandId: blockedCommand, actorId, expectedVersion: 2, to: "blocked" })
    ]);
    assert.equal(contenders.filter((result) => result.status === "fulfilled").length, 1);
    assert.ok(contenders.find((result) => result.status === "rejected").reason instanceof OptimisticConcurrencyError);

    const transitionCommand = contenders.find((result) => result.status === "fulfilled").value.workItem.status === "running" ? runningCommand : blockedCommand;
    const winningTransition = await repositoryA.transition(item.id, {
      commandId: transitionCommand,
      organizationId: item.organizationId,
      actorId,
      expectedVersion: 2,
      to: (await repositoryA.listEvents(item.id, item.organizationId)).at(-1).toStatus
    });
    assert.equal(winningTransition.replayed, true);

    await poolA.end();
    const poolAfterRestart = new Pool({ connectionString: databaseUrl, max: 2 });
    const repositoryAfterRestart = new PostgresWorkItemRepository(poolAfterRestart);
    await repositoryAfterRestart.initialize();
    assert.equal((await repositoryAfterRestart.get(item.id, item.organizationId)).version, 3);
    assert.equal((await repositoryAfterRestart.get(item.id, createCanonicalId("org"))), null);
    assert.equal((await repositoryAfterRestart.listEvents(item.id, item.organizationId)).length, 3);
    assert.equal((await repositoryAfterRestart.listByOrganization(item.organizationId)).length, 1);
    await poolAfterRestart.query("DELETE FROM agent_work_os_work_item_events_v1 WHERE work_item_id = $1", [item.id]);
    await poolAfterRestart.query("DELETE FROM agent_work_os_work_items_v1 WHERE id = $1", [item.id]);
    await poolAfterRestart.end();
  } finally {
    await Promise.allSettled([poolA.end(), poolB.end()]);
  }
});
