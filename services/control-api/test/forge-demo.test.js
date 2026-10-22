import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { forgeDemoSpec, summarizeForgeDemo } from "../src/forge-demo.js";
import { validateForgePlan } from "../src/forge-plan.js";

test("echo demo describes independent workers and preserves downstream evidence gate", () => {
  const plan = validateForgePlan(forgeDemoSpec({
    mode: "echo", machineId: "mac", cwd: "/tmp/repo"
  }));
  assert.equal(plan.state, "draft");
  assert.equal(plan.maxParallel, 2);
  assert.equal(plan.tasks.length, 3);
  assert.deepEqual(plan.tasks[2].dependsOn, ["discover", "inventory"]);
  assert.ok(plan.tasks.every(t => t.agent === "echo"));
  const result = summarizeForgeDemo(plan);
  assert.equal(result.demonstrated.approvalGate, true);
  assert.equal(result.demonstrated.independentDependencyGate, true);
  assert.equal(result.demonstrated.localExecution, false);
  assert.equal(result.demonstrated.nativeSubagentEvent, false);
});
test("Codex demo prompts for real tools/subagents without write or provider authorizations", () => {
  const plan = validateForgePlan(forgeDemoSpec({
    mode: "codex", machineId: "mac", cwd: "/tmp/repo"
  }));
  assert.equal(plan.tasks.length, 1);
  assert.equal(plan.maxParallel, 1);
  assert.equal(plan.tasks[0].expectChanges, false);
  assert.match(plan.tasks[0].prompt, /do not change files/i);
  assert.match(plan.tasks[0].prompt, /subagents are available/i);
  assert.equal(plan.tasks[0].agent, "codex");
  assert.equal(summarizeForgeDemo(plan).demonstrated.codexActivity, false);
});
test("demo score counts actual persisted native events but never infers missing children", () => {
  const plan = validateForgePlan(forgeDemoSpec({ mode: "codex", machineId: "mac", cwd: "/tmp/repo" }));
  plan.state = "running";
  plan.tasks[0].sessionId = "sess-1";
  plan.tasks[0].state = "awaiting_verification";
  let scored = summarizeForgeDemo(plan, { "sess-1": {
    id: "sess-1", status: "completed", events: [
      { kind: "codex.activity", itemType: "command_execution", itemId: "item_1", phase: "completed" },
      { kind: "workspace", receipt: { sourceSha: "a".repeat(40) } },
      { kind: "workspace.diff", receipt: { trackedDiffDigest: "sha256:"+"b".repeat(64) } },
      { kind: "workspace.review", receipt: { passed: true } }
    ]
  }});
  assert.equal(scored.demonstrated.localExecution, true);
  assert.equal(scored.demonstrated.codexActivity, true);
  assert.equal(scored.demonstrated.nativeSubagentEvent, false);
  assert.equal(scored.demonstrated.independentStaticReview, true);
  scored = summarizeForgeDemo(plan, { "sess-1": {
    id: "sess-1", status: "completed", events: [
      { kind: "codex.activity", itemType: "collab_tool_call", receiverThreadIds: ["child-1"] }
    ]
  }});
  assert.equal(scored.demonstrated.nativeSubagentEvent, true);
});
test("unknown demo mode is rejected before anything can be scheduled", () => {
  assert.throws(() => forgeDemoSpec({ mode:"shell", machineId:"x", cwd:"/tmp" }),
    /forge_demo_mode_invalid/);
});
