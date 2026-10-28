import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ShippingSupervisor } from "../src/shipping-supervisor.js";
import { ShippingStore } from "../src/shipping-store.js";
import { GitWorktreeManager, ShellRunner } from "../src/shipping-adapters.js";
import { issueProductionApproval } from "../src/production-approval.js";
import { digestShippingContract } from "../src/shipping-contract.js";

const SHA = "a".repeat(40);
const TEST_KEY = "ab".repeat(32);
const ORG = "org_00000000-0000-4000-8000-000000000001";
const MACHINE = "00000000-0000-4000-8000-000000000002";
const REQUESTER = "user_00000000-0000-4000-8000-000000000003";
const REVIEWER = "user_00000000-0000-4000-8000-000000000004";
function approvedOptions(input, runId) {
  const proof = issueProductionApproval({ runId, organizationId: ORG, machineId: MACHINE,
    requestedBy: REQUESTER, approvedBy: REVIEWER, contractDigest: digestShippingContract(input),
    sourceSha: SHA, hostingTarget: "onprem", signingKey: TEST_KEY });
  return { runId, approvalPermit: proof.permit, organizationId: ORG, machineId: MACHINE };
}
function runApproved(supervisor, input, runId) { return supervisor.run(input, approvedOptions(input, runId)); }

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
    worktree: { baseRef: SHA, cleanupOnSuccess: false },
    builder: { command: { command: "build" }, repairCommand: { command: "repair" }, maxRepairAttempts: 2 },
    verification: [{ command: "test" }],
    preview: { required: true, deployCommand: { command: "preview-deploy" }, uat: [{ command: "preview-uat" }] },
    production: { required: true, deployCommand: { command: "prod-deploy" }, uat: [{ command: "prod-uat" }] },
    exactSha: { required: true, testedShaCommand: { command: "tested-sha" }, deployedShaCommand: { command: "deployed-sha" } },
    goldenPath: [{ id: "FLOW-1", description: "user gets value" }]
  };
}

test("successful deployment attempt reaches independent certification queue, never self-SHIPPED", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ship-supervisor-"));
  const runner = new FakeRunner([
    { ok: true }, { ok: true }, { ok: true, stdout: `${SHA}\n` },
    { ok: true }, { ok: true }, { ok: true }, { ok: true }, { ok: true, stdout: `${SHA}\n` }
  ]);
  const store = new ShippingStore(path.join(root, "state"));
  const supervisor = new ShippingSupervisor({ allowProductionDeployment: true, productionHostingTarget: "onprem", approvalSigningKey: TEST_KEY, runner, worktrees: new FakeWorktrees(path.join(root, "wt")), store });
  const run = await runApproved(supervisor, contract(), "happy");
  assert.equal(run.state, "AWAITING_EXTERNAL_CERTIFICATION", JSON.stringify(run));
  assert.equal(run.testedSha, SHA);
  assert.equal(run.deployedSha, SHA);
  assert.equal(run.releaseReceipt, undefined, "successful deploy commands cannot self-certify a release");
  assert.equal(run.receiptFile, undefined);
  assert.ok(run.events.find((event) => event.type === "preview.uat"));
  assert.ok(run.events.find((event) => event.type === "production.uat"));
});

test("shipping evidence stays outside a worktree so cleanup succeeds after verification", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ship-cleanup-"));
  const repo = path.join(root, "repo");
  const stateRoot = path.join(root, "shipping-state");
  const worktreeRoot = path.join(root, "worktrees");
  await fs.mkdir(repo, { recursive: true });
  const shell = new ShellRunner({ timeoutMs: 10_000 });
  const runShell = async (command, cwd) => {
    const result = await shell.run({ command }, { cwd });
    assert.equal(result.ok, true, `${command}: ${result.stderr}`);
    return result.stdout.trim();
  };
  await runShell("git init -q && git config user.email test@example.com && git config user.name Test", repo);
  await fs.writeFile(path.join(repo, "README.md"), "clean worktree\n");
  await runShell("git add README.md && git commit -qm initial", repo);
  const input = contract(repo);
  input.worktree = { baseRef: "HEAD", root: worktreeRoot, cleanupOnSuccess: true };
  input.builder = { command: { name: "build", command: "true" }, repairCommand: { name: "repair", command: "true" }, maxRepairAttempts: 0 };
  input.verification = [{ name: "verification", command: "true" }];
  input.preview = { required: false };
  input.production = { required: false };
  input.exactSha = { required: false, testedShaCommand: { name: "tested-sha", command: "git rev-parse HEAD" } };
  const supervisor = new ShippingSupervisor({
    runner: shell,
    worktrees: new GitWorktreeManager({ runner: shell }),
    store: new ShippingStore(stateRoot)
  });

  const run = await supervisor.run(input, { runId: "cleanup-evidence" });

  assert.equal(run.state, "VERIFIED_ONLY", JSON.stringify(run));
  assert.equal(run.deployedSha, null);
  assert.equal(run.releaseReceipt, undefined);
  assert.equal(run.receiptFile, undefined);
  assert.ok(run.testedSha);
  await assert.rejects(() => fs.access(run.worktreePath));
});

test("production deploy is denied before shell or worktree without explicit operator opt-in", async () => {
  let invoked = false;
  const worktrees = { async create() { invoked = true; throw new Error("should not run"); } };
  const supervisor = new ShippingSupervisor({
    runner: new FakeRunner([]), worktrees, allowProductionDeployment: false
  });
  const run = await supervisor.run(contract(), { runId: "denied-prod" });
  assert.equal(run.state, "BLOCKED");
  assert.equal(run.blocker.code, "BLOCKED_IRREVERSIBLE_ACTION");
  assert.equal(invoked, false);
  assert.equal(run.releaseReceipt, undefined);
});

test("even an operator-enabled daemon refuses missing or tampered production permits without running tools", async () => {
  let worktrees = 0;
  const supervisor = new ShippingSupervisor({
    runner: new FakeRunner([]),
    worktrees: { async create() { worktrees++; throw new Error("unreachable"); } },
    allowProductionDeployment: true, productionHostingTarget: "onprem", approvalSigningKey: TEST_KEY
  });
  const input = contract();
  const missing = await supervisor.run(input, { runId: "permit-missing", organizationId: ORG, machineId: MACHINE });
  assert.equal(missing.state, "BLOCKED");
  assert.equal(missing.blocker.code, "BLOCKED_IRREVERSIBLE_ACTION");
  assert.equal(worktrees, 0);
  const opts = approvedOptions(input, "permit-tampered");
  opts.approvalPermit = opts.approvalPermit.slice(0,-1) +
    (opts.approvalPermit.at(-1) === "0" ? "1" : "0");
  const invalid = await supervisor.run(input, opts);
  assert.equal(invalid.state, "BLOCKED");
  assert.equal(invalid.blocker.code, "BLOCKED_IRREVERSIBLE_ACTION");
  assert.equal(worktrees, 0);
});

test("human-approved base SHA mismatch blocks before build and deploy", async () => {
  let builderCalls=0;
  const supervisor = new ShippingSupervisor({
    runner: { async run() { builderCalls++; throw new Error("should not run"); } },
    worktrees: { async create() { return {
      repoPath:"/fixture", worktreePath:"/fixture", baseSha:"f".repeat(40)
    }; } },
    allowProductionDeployment: true, productionHostingTarget:"onprem", approvalSigningKey: TEST_KEY
  });
  const input = contract();
  const result = await runApproved(supervisor, input, "wrong-source-sha");
  assert.equal(result.state,"BLOCKED");
  assert.equal(result.blocker.code,"BLOCKED_SOURCE_UNKNOWN");
  assert.equal(builderCalls,0);
});

test("changed tested SHA after approved build never reaches production deploy", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(),"ship-changing-source-"));
  const runner = new FakeRunner([
    {ok:true}, {ok:true}, {ok:true,stdout:"f".repeat(40)+String.fromCharCode(10)},
    {ok:true},{ok:true}
  ]);
  const supervisor = new ShippingSupervisor({
    runner, worktrees:new FakeWorktrees(path.join(root,"wt")),
    allowProductionDeployment:true, productionHostingTarget:"onprem", approvalSigningKey:TEST_KEY
  });
  const result = await runApproved(supervisor,contract(),"tested-changed-sha");
  assert.equal(result.state,"BLOCKED");
  assert.equal(result.blocker.code,"BLOCKED_IRREVERSIBLE_ACTION");
  assert.equal(runner.calls.some(x=>x.command==="prod-deploy"),false);
});

test("operator opt-in still denies production when preview or exact-SHA verification is absent", async () => {
  let invoked = false;
  const supervisor = new ShippingSupervisor({
    runner: new FakeRunner([]),
    worktrees: { async create() { invoked = true; throw new Error("unapproved"); } },
    allowProductionDeployment: true, productionHostingTarget: "onprem", approvalSigningKey: TEST_KEY
  });
  const unsafe = contract();
  unsafe.preview = { required: false };
  const run = await supervisor.run(unsafe, { runId: "no-preview" });
  assert.equal(run.state, "BLOCKED");
  assert.equal(run.blocker.code, "BLOCKED_PRODUCT_DECISION");
  assert.equal(invoked, false);
});

test("failed verification triggers repair and re-verification", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ship-repair-"));
  const runner = new FakeRunner([
    { ok: true }, { ok: false, stderr: "test failed" }, { ok: true }, { ok: true }, { ok: true, stdout: `${SHA}\n` },
    { ok: true }, { ok: true }, { ok: true }, { ok: true }, { ok: true, stdout: `${SHA}\n` }
  ]);
  const supervisor = new ShippingSupervisor({ allowProductionDeployment: true, productionHostingTarget: "onprem", approvalSigningKey: TEST_KEY, runner, worktrees: new FakeWorktrees(path.join(root, "wt")) });
  const run = await runApproved(supervisor, contract(), "repair");
  assert.equal(run.state, "AWAITING_EXTERNAL_CERTIFICATION");
  assert.equal(runner.calls.filter((call) => call.command === "repair").length, 1);
  assert.equal(runner.calls.filter((call) => call.command === "test").length, 2);
});

test("repair budget exhaustion is FAILED and cannot masquerade as shipped", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ship-fail-"));
  const input = contract();
  input.builder.maxRepairAttempts = 1;
  const runner = new FakeRunner([{ ok: true }, { ok: false, stderr: "bad" }, { ok: true }, { ok: false, stderr: "still bad" }]);
  const supervisor = new ShippingSupervisor({ allowProductionDeployment: true, productionHostingTarget: "onprem", approvalSigningKey: TEST_KEY, runner, worktrees: new FakeWorktrees(path.join(root, "wt")) });
  const run = await runApproved(supervisor, input, "fail");
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
  const supervisor = new ShippingSupervisor({ allowProductionDeployment: true, productionHostingTarget: "onprem", approvalSigningKey: TEST_KEY, runner, worktrees: new FakeWorktrees(path.join(root, "wt")) });
  const run = await runApproved(supervisor, input, "sha-mismatch");
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
  const supervisor = new ShippingSupervisor({ allowProductionDeployment: true, productionHostingTarget: "onprem", approvalSigningKey: TEST_KEY, runner, worktrees: new FakeWorktrees(path.join(root, "wt")) });
  const run = await runApproved(supervisor, contract(), "preview-repair");
  assert.equal(run.state, "AWAITING_EXTERNAL_CERTIFICATION");
  assert.equal(runner.calls.filter((call) => call.command === "repair").length, 1);
  assert.equal(runner.calls.filter((call) => call.command === "preview-deploy").length, 2);
});

test("worktree creation failure maps to explicit source blocker", async () => {
  const worktrees = { async create() { throw new Error("missing-ref"); } };
  const supervisor = new ShippingSupervisor({ runner: new FakeRunner([]), worktrees,
    allowProductionDeployment: true, productionHostingTarget: "onprem", approvalSigningKey: TEST_KEY });
  const run = await runApproved(supervisor, contract(), "blocked");
  assert.equal(run.state, "BLOCKED");
  assert.equal(run.blocker.code, "BLOCKED_SOURCE_UNKNOWN");
});
