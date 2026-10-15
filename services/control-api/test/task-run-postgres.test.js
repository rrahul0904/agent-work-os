import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";
import { createCanonicalId, createWorkItem } from "../../../packages/domain/src/index.js";
import { IdentityRepository } from "../src/identity-store.js";
import { PostgresWorkItemRepository } from "../src/work-item-store.js";
import { PostgresTaskRunRepository, TaskRunConcurrencyError, TaskRunIdempotencyConflictError } from "../src/task-run-store.js";

const { Pool } = pg;
const databaseUrl = process.env.AGENT_WORK_OS_TEST_DATABASE_URL;

test("Postgres Task and Run persistence enforces parent scope, idempotency, attempts, and restart history", { skip: !databaseUrl }, async () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 3 });
  const organizationId = createCanonicalId("org");
  const foreignOrganizationId = createCanonicalId("org");
  const actorId = createCanonicalId("user");
  const workItem = createWorkItem({ id: createCanonicalId("work"), organizationId, createdBy: actorId, title: "Run foundation" });
  const taskId = createCanonicalId("task");
  const taskCommand = createCanonicalId("command");
  const taskRuns = new PostgresTaskRunRepository(pool);
  const workItems = new PostgresWorkItemRepository(pool);
  let restartedPool;
  let runId;
  try {
    await waitForDatabase(pool);
    await workItems.initialize();
    await new IdentityRepository(pool).initialize();
    await pool.query(
      "INSERT INTO agent_work_os_organizations_v1 (id, name) VALUES ($1, 'Task Run test') ON CONFLICT (id) DO NOTHING",
      [organizationId]
    );
    await pool.query(
      "INSERT INTO agent_work_os_organizations_v1 (id, name) VALUES ($1, 'Task Run foreign test') ON CONFLICT (id) DO NOTHING",
      [foreignOrganizationId]
    );
    await workItems.create(workItem, { commandId: createCanonicalId("command"), actorId });
    await taskRuns.initialize();

    const task = await taskRuns.createTask({ id: taskId, organizationId, workItemId: workItem.id, createdBy: actorId, title: "Implement a change" }, { commandId: taskCommand, actorId });
    assert.equal(task.task.status, "READY");
    assert.equal((await taskRuns.createTask({ id: taskId, organizationId, workItemId: workItem.id, createdBy: actorId, title: "Implement a change" }, { commandId: taskCommand, actorId })).replayed, true);
    await assert.rejects(
      taskRuns.createTask({ id: taskId, organizationId, workItemId: workItem.id, createdBy: actorId, title: "Different" }, { commandId: taskCommand, actorId }),
      TaskRunIdempotencyConflictError
    );
    assert.equal(await taskRuns.getTask(taskId, foreignOrganizationId), null, "Task reads are organization scoped");
    await assert.rejects(
      taskRuns.createTask({ id: createCanonicalId("task"), organizationId: foreignOrganizationId, workItemId: workItem.id, createdBy: actorId, title: "Cross tenant" }, { commandId: createCanonicalId("command"), actorId }),
      /foreign key/i
    );

    runId = createCanonicalId("run");
    const createRunInput = { organizationId, runId, commandId: createCanonicalId("command"), actorId };
    const firstRun = await taskRuns.createRun(taskId, createRunInput);
    assert.equal(firstRun.run.attempt, 1);
    assert.equal(firstRun.run.status, "QUEUED");
    assert.equal(firstRun.task.status, "READY", "a queued run is not represented as active before a worker lease");
    assert.equal((await taskRuns.createRun(taskId, createRunInput)).replayed, true);
    await assert.rejects(
      taskRuns.createRun(taskId, { ...createRunInput, runId: createCanonicalId("run"), commandId: createCanonicalId("command") }),
      TaskRunConcurrencyError
    );
    for (const [index, to] of ["LEASED", "PREPARING", "RUNNING", "VERIFYING", "FAILED"].entries()) {
      const transitioned = await taskRuns.transitionRun(runId, {
        organizationId, commandId: createCanonicalId("command"), actorId, expectedVersion: index + 1, to
      });
      assert.equal(transitioned.run.status, to);
    }
    const retry = await taskRuns.createRun(taskId, { organizationId, runId: createCanonicalId("run"), commandId: createCanonicalId("command"), actorId });
    assert.equal(retry.run.attempt, 2);
    assert.equal(retry.task.status, "READY");
    assert.equal((await taskRuns.listRunsByTask(taskId, organizationId)).length, 2);
    assert.equal((await taskRuns.listRunEvents(runId, organizationId)).length, 6);

    await pool.end();
    restartedPool = new Pool({ connectionString: databaseUrl, max: 2 });
    const restartedRepository = new PostgresTaskRunRepository(restartedPool);
    await restartedRepository.initialize();
    assert.equal((await restartedRepository.getTask(taskId, organizationId)).status, "READY");
    assert.equal((await restartedRepository.getRun(runId, organizationId)).status, "FAILED");
    assert.equal((await restartedRepository.listTaskEvents(taskId, organizationId)).length, 4);
    await restartedPool.query("DELETE FROM agent_work_os_task_run_events_v1 WHERE run_id IN (SELECT id FROM agent_work_os_task_runs_v1 WHERE task_id = $1)", [taskId]);
    await restartedPool.query("DELETE FROM agent_work_os_task_events_v1 WHERE task_id = $1", [taskId]);
    await restartedPool.query("DELETE FROM agent_work_os_task_runs_v1 WHERE task_id = $1", [taskId]);
    await restartedPool.query("DELETE FROM agent_work_os_tasks_v1 WHERE id = $1", [taskId]);
    await restartedPool.query("DELETE FROM agent_work_os_work_item_events_v1 WHERE work_item_id = $1", [workItem.id]);
    await restartedPool.query("DELETE FROM agent_work_os_work_items_v1 WHERE id = $1", [workItem.id]);
    await restartedPool.query("DELETE FROM agent_work_os_organizations_v1 WHERE id IN ($1, $2) AND created_by IS NULL", [organizationId, foreignOrganizationId]);
  } finally {
    await Promise.allSettled([pool.end(), restartedPool?.end()]);
  }
});

async function waitForDatabase(pool) {
  const started = Date.now();
  let lastError;
  while (Date.now() - started < 15_000) {
    try { await pool.query("SELECT 1"); return; } catch (error) { lastError = error; }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`PostgreSQL did not become ready: ${lastError?.message ?? "timeout"}`);
}
