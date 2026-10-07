import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ShippingSupervisor } from "../src/shipping-supervisor.js";
import { ShippingStore } from "../src/shipping-store.js";

const SHA = "a".repeat(40);

class FakeWorktrees {
  constructor(root) { this.root = root; }
  async create() { await fs.mkdir(this.root, { recursive: true }); return { repoPath: this.root, worktreePath: this.root, baseSha: SHA }; }
  async remove() { return true; }
}

class FakeRunner {
  constructor(plan) { this.plan = [...plan]; this.calls = []; }
  async run(spec, context) {
    this.calls.push({ command: spec.command, stage: context.stage });
    const next = this.plan.shift();
    if (!next) throw new Error(`unexpected_command:${spec.command}`);
    return { name: spec.name ?? context.stage, command: spec.command, ok: next.ok, code: next.ok ? 0 : 1, signal: null, timedOut: false, stdout: next.stdout ?? "", stderr: next.stderr ?? "", durationMs: 1 };
  }
}

function contract(repoPath = "/fake") {
  return {
    version: "shipping-contract/v1",
    project: { id: "demo", repoPath },
    release: { version: "0.1.0" },
    worktree: { baseRef: "HEAD", cleanupOnSuccess: false },
    builder: { command: { command: "build" }, repairCommand: { command: "repair" }, maxRepairAttempts: 2 },
    verification: [{ command: "test" }],
    preview: { required: true, deployCommand: { command: "preview-deploy" }, uat: [{ command: "preview-uat" }] },
    production: { required: true, deployCommand: { command: "prod-deploy" }, uat: [{ command: "prod-uat" }] },
    exactSha: { required: true, testedShaCommand: { command: "tested-sha" }, deployedShaCommand: { command: "deployed-sha" } },
    goldenPath: [{ id: "FLOW-1", description: "user gets value" }]
  };
}

test("happy path reaches SHIPPED only after exact SHA and UAT evidence", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ship-supervisor-"));
  const runner = new FakeRunner([
    { ok: true }, { ok: true }, { ok: true, stdout: `${SHA}\n` },
    { ok: true }, { ok: true }, { ok: true }, { ok: true }, { ok: true, stdout: `${SHA}\n` }
  ]);
  const store = new ShippingStore(path.join(root, "state"));
  const supervisor = new ShippingSupervisor({ runner, worktrees: new FakeWorktrees(path.join(root, "wt")), store });
  const run = await supervisor.run(contract(), { runId: "happy" });
  assert.equal(run.state, "SHIPPED");
  assert.equal(run.testedSha, SHA);
  assert.equal(run.deployedSha, SHA);
  assert.equal(run.releaseReceipt.goldenPath[0].status, "PASS");
  assert.ok(run.events.find((event) => event.type === "preview.uat"));
  assert.ok(run.events.find((event) => event.type === "production.uat"));
});

test("failed verification triggers repair and re-verification", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ship-repair-"));
  const runner = new FakeRunner([
    { ok: true }, { ok: false, stderr: "test failed" }, { ok: true }, { ok: true }, { ok: true, stdout: `${SHA}\n` },
    { ok: true }, { ok: true }, { ok: true }, { ok: true }, { ok: true, stdout: `${SHA}\n` }
  ]);
  const supervisor = new ShippingSupervisor({ runner, worktrees: new FakeWorktrees(path.join(root, "wt")) });
  const run = await supervisor.run(contract(), { runId: "repair" });
  assert.equal(run.state, "SHIPPED");
  assert.equal(runner.calls.filter((call) => call.command === "repair").length, 1);
  assert.equal(runner.calls.filter((call) => call.command === "test").length, 2);
});

test("repair budget exhaustion is FAILED and cannot masquerade as shipped", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ship-fail-"));
  const input = contract();
  input.builder.maxRepairAttempts = 1;
  const runner = new FakeRunner([{ ok: true }, { ok: false, stderr: "bad" }, { ok: true }, { ok: false, stderr: "still bad" }]);
  const supervisor = new ShippingSupervisor({ runner, worktrees: new FakeWorktrees(path.join(root, "wt")) });
  const run = await supervisor.run(input, { runId: "fail" });
  assert.equal(run.state, "FAILED");
  assert.equal(run.releaseReceipt, undefined);
  assert.equal(run.events.at(-1).message, "repair_budget_exhausted");
});

test("persistent deployed SHA mismatch exhausts release repair budget and refuses SHIPPED", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ship-sha-"));
  const input = contract();
  input.builder.maxRepairAttempts = 1;
  const otherSha = "b".repeat(40);
  const runner = new FakeRunner([
    { ok: true }, { ok: true }, { ok: true, stdout: `${SHA}\n` }, { ok: true }, { ok: true }, { ok: true }, { ok: true }, { ok: true, stdout: `${otherSha}\n` },
    { ok: true }, { ok: true }, { ok: true, stdout: `${SHA}\n` }, { ok: true }, { ok: true }, { ok: true }, { ok: true }, { ok: true, stdout: `${otherSha}\n` }
  ]);
  const supervisor = new ShippingSupervisor({ runner, worktrees: new FakeWorktrees(path.join(root, "wt")) });
  const run = await supervisor.run(input, { runId: "sha-mismatch" });
  assert.equal(run.state, "FAILED");
  assert.equal(runner.calls.filter((call) => call.command === "repair").length, 1);
  assert.equal(run.events.at(-1).message, "release_repair_budget_exhausted");
  assert.equal(run.releaseReceipt, undefined);
});

test("preview UAT failure repairs, re-verifies, and retries the release pipeline", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ship-preview-repair-"));
  const runner = new FakeRunner([
    { ok: true }, { ok: true }, { ok: true, stdout: `${SHA}\n` }, { ok: true }, { ok: false, stderr: "preview broken" },
    { ok: true }, { ok: true }, { ok: true, stdout: `${SHA}\n` }, { ok: true }, { ok: true }, { ok: true }, { ok: true }, { ok: true, stdout: `${SHA}\n` }
  ]);
  const supervisor = new ShippingSupervisor({ runner, worktrees: new FakeWorktrees(path.join(root, "wt")) });
  const run = await supervisor.run(contract(), { runId: "preview-repair" });
  assert.equal(run.state, "SHIPPED");
  assert.equal(runner.calls.filter((call) => call.command === "repair").length, 1);
  assert.equal(runner.calls.filter((call) => call.command === "preview-deploy").length, 2);
});

test("worktree creation failure maps to explicit source blocker", async () => {
  const worktrees = { async create() { throw new Error("missing-ref"); } };
  const supervisor = new ShippingSupervisor({ runner: new FakeRunner([]), worktrees });
  const run = await supervisor.run(contract(), { runId: "blocked" });
  assert.equal(run.state, "BLOCKED");
  assert.equal(run.blocker.code, "BLOCKED_SOURCE_UNKNOWN");
});
