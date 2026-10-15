import assert from "node:assert/strict";
import test from "node:test";
import { createCanonicalId, createTask, createTaskRun, transitionTaskRun } from "../src/index.js";

const organizationId = createCanonicalId("org");
const workItemId = createCanonicalId("work");
const taskId = createCanonicalId("task");
const actorId = createCanonicalId("user");

test("Task and Run require canonical tenant and parent references", () => {
  const task = createTask({ id: taskId, organizationId, workItemId, createdBy: actorId, title: "Build the feature" });
  assert.equal(task.status, "READY");
  assert.equal(task.version, 1);
  const run = createTaskRun({ id: createCanonicalId("run"), organizationId, taskId, attempt: 1, createdBy: actorId });
  assert.equal(run.status, "QUEUED");
  assert.throws(() => createTask({ organizationId, workItemId, createdBy: actorId, title: "" }), { code: "work_item_title_invalid" });
  assert.throws(() => createTaskRun({ organizationId, taskId, attempt: 0, createdBy: actorId }), { code: "run_attempt_invalid" });
});

test("Run lifecycle is explicit, versioned and terminal states cannot restart in place", () => {
  const run = createTaskRun({ organizationId, taskId, attempt: 1, createdBy: actorId });
  const leased = transitionTaskRun(run, { to: "LEASED", expectedVersion: 1 });
  const preparing = transitionTaskRun(leased, { to: "PREPARING", expectedVersion: 2 });
  const running = transitionTaskRun(preparing, { to: "RUNNING", expectedVersion: 3 });
  const verifying = transitionTaskRun(running, { to: "VERIFYING", expectedVersion: 4 });
  const complete = transitionTaskRun(verifying, { to: "SUCCEEDED", expectedVersion: 5 });
  assert.equal(complete.version, 6);
  assert.throws(() => transitionTaskRun(complete, { to: "QUEUED", expectedVersion: 6 }), { code: "run_transition_invalid" });
  assert.throws(() => transitionTaskRun(run, { to: "LEASED", expectedVersion: 2 }), { code: "run_version_conflict" });
});
