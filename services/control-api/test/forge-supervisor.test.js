import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, symlink } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { JsonStore } from "../src/store.js";
import { approveForgePlan, claimNextForgeTask, reconcileForgeTask, retryForgeTask, validateForgePlan, verifyForgeTask } from "../src/forge-plan.js";
import { createForgeSupervisor, validateForgeWorkspace } from "../src/forge-supervisor.js";
import { buildForgeGraph } from "../../../apps/web/public/forge-graph.js";

const uuid = () => "550e8400-e29b-41d4-a716-446655440000";
function spec(root, machineId = "mac-1") {
  return {
    title: "Research and build", cwd: root, machineId, maxParallel: 2,
    sourceUrl: "https://example.org/reference",
    tasks: [
      { id: "research", title: "Research", agent: "echo", prompt: "Read source", dependsOn: [] },
      { id: "inventory", title: "Inventory", agent: "echo", prompt: "Inspect the worktree", dependsOn: [] },
      { id: "build", title: "Build", agent: "echo", prompt: "Build after evidence", dependsOn: ["research","inventory"] },
      { id: "review", title: "Review", agent: "echo", prompt: "Independent verification", dependsOn: ["build"] }
    ]
  };
}
test("Forge plans are bounded DAGs with valid skills and no circular dependency", () => {
  const original = spec("/tmp/worktree");
  const p = validateForgePlan(original, { newId: uuid });
  assert.equal(p.state, "draft");
  assert.equal(p.tasks[0].state, "pending");
  assert.equal(p.schema, "rea-forge-plan/v1");
  const missing = structuredClone(original); missing.tasks[2].dependsOn = ["ghost"];
  assert.throws(() => validateForgePlan(missing), /forge_invalid_dependency/);
  const cycle = structuredClone(original); cycle.tasks[0].dependsOn = ["review"];
  assert.throws(() => validateForgePlan(cycle), /forge_dependency_cycle/);
  const exploit = structuredClone(original); exploit.tasks[0].agent = "shell";
  assert.throws(() => validateForgePlan(exploit), /forge_agent_invalid/);
  const oversized = structuredClone(original); oversized.maxParallel = 42;
  assert.throws(() => validateForgePlan(oversized), /forge_parallel_limit_invalid/);
  const duplicate = structuredClone(original); duplicate.tasks[2].id = "research";
  assert.throws(() => validateForgePlan(duplicate), /forge_duplicate_task/);
});

test("parallel tasks wait for explicit reviewer evidence; executor success alone cannot unlock dependencies", () => {
  let p = approveForgePlan(validateForgePlan(spec("/tmp/worktree")));
  const a = claimNextForgeTask(p, { sessionId: "s1", commandId: "c1" }); p = a.plan;
  assert.equal(a.task.id, "research");
  const b = claimNextForgeTask(p, { sessionId: "s2", commandId: "c2" }); p = b.plan;
  assert.equal(b.task.id, "inventory");
  assert.equal(claimNextForgeTask(p).task, null, "bounded parallelism");
  p = reconcileForgeTask(p, "research", { id: "s1", status: "completed" });
  assert.equal(p.tasks[0].state, "awaiting_verification");
  assert.equal(claimNextForgeTask(p).task, null, "completion cannot unlock DAG dependent");
  const digest = "sha256:" + "a".repeat(64);
  assert.throws(() => verifyForgeTask(p, "research", { approved: false, reviewer: "QA", digest }), /forge_approval_required/);
  p = verifyForgeTask(p, "research", { approved: true, reviewer: "Independent QA", digest });
  assert.equal(claimNextForgeTask(p).task, null, "inventory is still unverified");
  p = reconcileForgeTask(p, "inventory", { id: "s2", status: "completed" });
  p = verifyForgeTask(p, "inventory", { approved: true, reviewer: "Independent QA", digest });
  const third = claimNextForgeTask(p); assert.equal(third.task.id, "build");
  const g = buildForgeGraph({ forgePlans: [third.plan] });
  assert.equal(g.taskDependencyGraphAvailable, true);
  assert.ok(g.edges.some(e => e.kind === "versioned-task-dependency" && e.from.endsWith(":inventory") && e.to.endsWith(":build")));
  assert.ok(g.edges.some(e => e.kind === "canonical-plan-task"));
});

test("running tasks survive persisted restart and unknown session fails closed for explicit retry", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "forge-durable-"));
  const pathToStore = path.join(root, "store.json");
  const store = new JsonStore(pathToStore); await store.load();
  let p = approveForgePlan(validateForgePlan(spec(root)));
  p = claimNextForgeTask(p, { sessionId: "s1", commandId: "c1" }).plan;
  await store.createForgePlan(p);
  const restarted = new JsonStore(pathToStore); await restarted.load();
  assert.equal(restarted.listForgePlans().length, 1);
  let restored = restarted.getForgePlan(p.id);
  assert.equal(restored.tasks[0].state, "dispatching");
  restored = reconcileForgeTask(restored, "research", null);
  assert.equal(restored.tasks[0].state, "blocked");
  assert.equal(claimNextForgeTask(restored).task.id, "inventory", "independent branch may continue");
  restored = retryForgeTask(restored, "research");
  assert.equal(restored.tasks[0].state, "pending");
  assert.equal(restored.tasks[0].sessionId, null);
});

test("workspace gates reject symlinks and outside directories", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "forge-workspace-"));
  const safe = path.join(root, "work"); await mkdir(safe);
  assert.equal(await validateForgeWorkspace(safe, root), safe);
  const outside = await mkdtemp(path.join(os.tmpdir(), "forge-outside-"));
  await assert.rejects(validateForgeWorkspace(outside, root), /forge_workspace_outside_approved_root/);
  const linked = path.join(root, "linked"); await symlink(safe, linked);
  await assert.rejects(validateForgeWorkspace(linked, root), /forge_workspace_symlink_refused/);
});

test("durable supervisor dispatches only explicitly approved tasks through existing sessions and never auto-attests", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "forge-supervisor-"));
  const store = new JsonStore(path.join(root, "store.json")); await store.load();
  await store.upsertMachine({
    id: "mac-1", name: "Test machine", status: "online",
    capabilities: [{ name: "echo" }]
  });
  const dispatched = [], broadcasted = [];
  const service = createForgeSupervisor({
    store, allowedRoot: root, broadcast: value => broadcasted.push(value),
    dispatch: async (plan, task) => {
      dispatched.push(task.id);
      await store.createSession({
        id: task.sessionId, machineId: plan.machineId,
        status: "queued", cwd: root, agent: task.agent,
        messages: [], events: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
      });
    }
  });
  const created = await service.create(spec(root));
  assert.equal(created.state, "draft");
  await service.tick();
  assert.deepEqual(dispatched, [], "approval required for any provider execution");
  await service.approve(created.id);
  await service.tick();
  assert.deepEqual(dispatched, ["research", "inventory"]);
  await store.setSessionStatus(store.getForgePlan(created.id).tasks[0].sessionId, "completed");
  await service.tick();
  const refreshed = service.get(created.id);
  assert.equal(refreshed.tasks[0].state, "awaiting_verification");
  assert.equal(refreshed.tasks[2].state, "pending");
  assert.equal(refreshed.tasks[0].prompt, undefined, "API projections omit worker prompts");
  assert.equal(dispatched.length, 2);
  assert.ok(broadcasted.some(e => e.type === "forge.plan.updated"));
});

test("dispatch failure enters blocker instead of secretly retrying commands", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "forge-dispatch-fail-"));
  const store = new JsonStore(path.join(root, "state.json")); await store.load();
  await store.upsertMachine({ id: "mac-1", name: "test", status: "online", capabilities: [{ name: "echo" }] });
  let calls = 0;
  const service = createForgeSupervisor({
    store, allowedRoot: root, broadcast: () => {},
    dispatch: async () => { calls++; throw new Error("ambiguous transport"); }
  });
  const plan = await service.create({
    title: "Failure test", cwd: root, machineId: "mac-1",
    tasks: [{ id: "one", title: "One", agent: "echo", prompt: "P", dependsOn: [] }]
  });
  await service.approve(plan.id);
  await service.tick();
  assert.equal(calls, 1);
  assert.equal(service.get(plan.id).tasks[0].state, "blocked");
  await service.tick();
  assert.equal(calls, 1, "no automatic retries after uncertain dispatch");
});


test("Codex verification refuses arbitrary hashes, forged source receipts and untracked output", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "forge-diff-attestation-"));
  const store = new JsonStore(path.join(root, "state.json")); await store.load();
  const input = {
    title: "Coding task", cwd: root, machineId: "mac-1", maxParallel: 1,
    tasks: [{
      id: "implement", title: "Implement", agent: "codex", prompt: "Make change",
      dependsOn: [], expectChanges: true
    }]
  };
  let plan = approveForgePlan(validateForgePlan(input));
  plan = claimNextForgeTask(plan, { sessionId: "session-1", commandId: "cmd-1" }).plan;
  plan = reconcileForgeTask(plan, "implement", { id: "session-1", status: "completed" });
  await store.createForgePlan(plan);
  const now = new Date().toISOString();
  const digest = "sha256:" + "c".repeat(64);
  const stage = {
    schema: "rea-forge-worktree/v1", sessionId: "session-1",
    planId: plan.id, taskId: "implement", sourceSha: "a".repeat(40)
  };
  const diff = {
    schema: "rea-forge-diff/v1", sessionId: "session-1",
    baseSha: stage.sourceSha, headSha: stage.sourceSha,
    trackedDiffDigest: digest, changed: true, completeSnapshot: true,
    untrackedPresent: false
  };
  await store.createSession({
    id: "session-1", machineId: "mac-1", agent: "codex",
    forgePlanId: plan.id, forgeTaskId: "implement", cwd: root,
    status: "completed", createdAt: now, updatedAt: now,
    events: [{ kind: "workspace", receipt: stage }, { kind: "workspace.diff", receipt: diff }],
    messages: []
  });
  const service = createForgeSupervisor({
    store, dispatch: async () => {}, broadcast: () => {}, allowedRoot: root
  });
  const evidence = { approved: true, reviewer: "Independent QA", digest };
  await assert.rejects(service.verify(plan.id, "implement", {
    ...evidence, digest: "sha256:" + "d".repeat(64)
  }), /forge_diff_digest_mismatch/);
  await store.addEvent("session-1", {
    kind: "workspace.diff", receipt: { ...diff, untrackedPresent: true, completeSnapshot: false }
  });
  await assert.rejects(service.verify(plan.id, "implement", evidence), /forge_untracked_content_requires_review/);
  await store.addEvent("session-1", { kind: "workspace.diff", receipt: diff });
  const verified = await service.verify(plan.id, "implement", evidence);
  assert.equal(verified.tasks[0].state, "verified");
  assert.equal(verified.state, "awaiting_release");
  assert.equal(verified.tasks[0].verification.method, "human-attestation");
});

test("Code implementation cannot be attested if no actual change was observed", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "forge-no-change-"));
  const store = new JsonStore(path.join(root, "state.json")); await store.load();
  let plan = approveForgePlan(validateForgePlan({
    title: "No-op code", cwd: root, machineId: "mac", maxParallel: 1,
    tasks: [{ id: "code", title: "Code", agent: "codex", prompt: "Change code",
      dependsOn: [], expectChanges: true }]
  }));
  plan = claimNextForgeTask(plan, { sessionId: "sess", commandId: "cmd" }).plan;
  plan = reconcileForgeTask(plan, "code", { id: "sess", status: "completed" });
  await store.createForgePlan(plan);
  await store.createSession({ id: "sess", machineId: "mac", agent: "codex",
    status: "completed", messages: [], forgePlanId: plan.id, forgeTaskId: "code",
    events: [{
      kind: "workspace", receipt: { schema: "rea-forge-worktree/v1",
        sessionId: "sess", sourceSha: "a".repeat(40) }
    }, {
      kind: "workspace.diff", receipt: { schema: "rea-forge-diff/v1",
        sessionId: "sess", baseSha: "a".repeat(40),
        trackedDiffDigest: "sha256:" + "b".repeat(64),
        completeSnapshot: true, untrackedPresent: false, changed: false }
    }] });
  const svc = createForgeSupervisor({ store, dispatch: async () => {},
    broadcast: () => {}, allowedRoot: root });
  await assert.rejects(svc.verify(plan.id, "code", {
    approved: true, reviewer: "Reviewer", digest: "sha256:" + "b".repeat(64)
  }), /forge_expected_change_not_observed/);
});
