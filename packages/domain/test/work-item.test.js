import assert from "node:assert/strict";
import test from "node:test";
import {
  DomainValidationError,
  InvalidWorkItemTransitionError,
  createCanonicalId,
  createWorkItem,
  isCanonicalId,
  transitionWorkItem
} from "../src/index.js";

test("canonical IDs are typed UUIDs and generated IDs are unique", () => {
  const first = createCanonicalId("work");
  const second = createCanonicalId("work");
  assert.match(first, /^work_[0-9a-f-]{36}$/);
  assert.notEqual(first, second);
  assert.equal(isCanonicalId("work", first), true);
  assert.equal(isCanonicalId("task", first), false);
  assert.throws(() => createCanonicalId("unknown"), DomainValidationError);
});

test("work item lifecycle validates required canonical references", () => {
  const item = createWorkItem({
    organizationId: createCanonicalId("org"),
    projectId: createCanonicalId("project"),
    createdBy: createCanonicalId("user"),
    title: "Ship the first domain slice"
  });
  assert.equal(item.status, "backlog");
  assert.equal(item.version, 1);
  assert.throws(() => createWorkItem({ organizationId: "org_1", createdBy: createCanonicalId("user"), title: "bad" }), /canonical org ID/);
});

test("state transitions are explicit, versioned, and terminal completion cannot reopen", () => {
  const item = createWorkItem({ organizationId: createCanonicalId("org"), createdBy: createCanonicalId("user"), title: "Task" });
  const ready = transitionWorkItem(item, { to: "ready", expectedVersion: 1 });
  const running = transitionWorkItem(ready, { to: "running", expectedVersion: 2 });
  const verifying = transitionWorkItem(running, { to: "verifying", expectedVersion: 3 });
  const complete = transitionWorkItem(verifying, { to: "complete", expectedVersion: 4 });
  assert.equal(complete.version, 5);
  assert.throws(() => transitionWorkItem(item, { to: "complete", expectedVersion: 1 }), InvalidWorkItemTransitionError);
  assert.throws(() => transitionWorkItem(complete, { to: "ready", expectedVersion: 5 }), InvalidWorkItemTransitionError);
  assert.throws(() => transitionWorkItem(ready, { to: "running", expectedVersion: 1 }), /version 1, found 2/);
});
