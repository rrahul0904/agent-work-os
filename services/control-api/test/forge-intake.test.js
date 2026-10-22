import test from "node:test";
import assert from "node:assert/strict";
import { buildForgeIntakeSpec } from "../src/forge-intake.js";
import { validateForgePlan } from "../src/forge-plan.js";

test("REA Forge URL intake builds a bounded versioned DAG with genuine evidence gates", () => {
  const input = buildForgeIntakeSpec({
    sourceUrl: "https://example.org/app", cwd: "/tmp/project", machineId: "test-machine",
    title: "Example investigation", goal: "Clean-room reproduction"
  });
  assert.equal(input.maxParallel, 1);
  assert.equal(input.tasks.length, 6);
  assert.equal(input.tasks[0].id, "owner-inventory");
  assert.equal(input.tasks[1].id, "source-research");
  assert.deepEqual(input.tasks[2].dependsOn, ["owner-inventory", "source-research"]);
  assert.deepEqual(input.tasks[3].dependsOn, ["architecture"]);
  assert.deepEqual(input.tasks[5].dependsOn, ["independent-review"]);
  assert.ok(input.tasks.every(t => t.agent === "codex" && t.prompt.includes("Do not push")));
  const plan = validateForgePlan(input);
  assert.equal(plan.state, "draft");
  assert.ok(plan.tasks.every(t => t.state === "pending"));
});

test("multiple Codex writers in one worktree cannot run concurrently", () => {
  const input = buildForgeIntakeSpec({
    sourceUrl: "https://example.org/app", cwd: "/tmp/project", machineId: "mac-1"
  });
  input.maxParallel = 2;
  assert.throws(() => validateForgePlan(input), /forge_codex_requires_isolated_worktrees/);
  const echo = buildForgeIntakeSpec({
    sourceUrl: "https://example.org/app", cwd: "/tmp/project", machineId: "mac-1", agent: "echo"
  });
  assert.equal(echo.maxParallel, 2);
  assert.equal(validateForgePlan(echo).tasks.length, 6);
});

test("intake refuses unsupported agent and invalid target", () => {
  assert.throws(() => buildForgeIntakeSpec({
    sourceUrl: "file:///etc/passwd", cwd: "/tmp", machineId: "x"
  }), /forge_intake_source_required/);
  assert.throws(() => buildForgeIntakeSpec({
    sourceUrl: "https://example.org/app", cwd: "/tmp", machineId: "x", agent: "shell"
  }), /forge_intake_agent_invalid/);
});
