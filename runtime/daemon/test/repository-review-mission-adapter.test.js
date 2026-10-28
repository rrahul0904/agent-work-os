import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { sealCodeAtlasIndex } from "../src/codeatlas-search-adapter.js";
import { RepositoryReviewMissionAdapter } from "../src/repository-review-mission-adapter.js";

function fixture(t, opts = {}) {
  const base = mkdtempSync(path.join(os.tmpdir(), "awos-mission-test-"));
  t.after(() => rmSync(base, { force: true, recursive: true }));
  execFileSync("git", ["init", "-q", base]);
  writeFileSync(path.join(base, "main.py"), "def process_orders(): pass\n");
  execFileSync("git", ["-C", base, "add", "main.py"]);
  execFileSync("git", ["-C", base, "-c", "user.name=CI", "-c", "user.email=ci@example.invalid",
    "commit", "-qm", "snapshot"]);
  mkdirSync(path.join(base, ".codeatlas"));
  writeFileSync(path.join(base, ".codeatlas", "index.sqlite3"), "fixture-index");
  sealCodeAtlasIndex(base);
  const calls = [];
  const codeAtlas = {
    root: base,
    capability: () => ({ name: "codeatlas-search", mode: "read_only" }),
    async run(req, emit) {
      calls.push("index");
      assert.equal(req.cwd, base);
      emit({ kind: "text", text: JSON.stringify({
        source: "codeatlas", mode: "read_only", revision: getRevision(base),
        indexDigest: sealInfo(base).dbSha256,
        symbols: [{ qualifiedName: "process_orders", kind: "function", file: "main.py", line: 1 }]
      }) });
    },
    async interrupt() {}
  };
  const analyst = {
    model: "local-analyst-v1", endpoint: { kind: "local_machine" }, privateRemoteApproved: false,
    capability: () => ({ name: "model-chat" }),
    async run(req, emit) {
      calls.push("analyst");
      assert.match(req.prompt, /process_orders/);
      emit({ kind: "text", text: "Possible retry issue, needs source inspection." });
      emit({ kind: "usage", usage: { inputTokens: 20, outputTokens: 9, source: "provider_reported" } });
    },
    async interrupt() {}
  };
  const reviewer = {
    model: opts.sameModel ? "local-analyst-v1" : "local-reviewer-v2",
    endpoint: { kind: "local_machine" },
    capability: () => ({ name: "token-intelligence" }),
    async run(req, emit) {
      calls.push("reviewer");
      assert.match(req.prompt, /Possible retry issue/);
      emit({ kind: "text", text: "No evidence of retries yet. Add idempotency test." });
      emit({ kind: "usage", usage: { inputTokens: 22, outputTokens: 11, source: "provider_reported" } });
    },
    async interrupt() {}
  };
  const env = {
    AGENT_WORK_OS_MISSION_REVIEW_ENABLED: "true",
    AGENT_WORK_OS_MISSION_CONTEXT_EXPORT_APPROVED: "true",
    AGENT_WORK_OS_MISSION_GATEWAY_PRIVACY_REVIEWED: "true"
  };
  const mission = new RepositoryReviewMissionAdapter({ codeAtlas, analyst, reviewer, env: opts.env ?? env });
  return { mission, base, calls, analyst, reviewer, codeAtlas, env };
}
function getRevision(dir) {
  return execFileSync("git", ["-C", dir, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
}
function sealInfo(dir) {
  return JSON.parse(execFileSync(process.execPath, ["-e", `const fs=require("fs"); console.log(fs.readFileSync(${JSON.stringify(path.join(dir, ".codeatlas/index-binding.json"))},"utf8"))`], { encoding: "utf8" }));
}
async function prepare(mission, base, id = "mission-1") {
  const events = [];
  const result = await mission.run({ sessionId: id, cwd: base,
    prompt: "investigate process_orders | Why might orders duplicate?" }, (event) => events.push(event));
  const output = events.find((e) => e.kind === "text");
  return { events, result, payload: JSON.parse(output.text) };
}

test("disabled unless both models and context export attestations are explicitly configured", (t) => {
  const f = fixture(t);
  assert.ok(f.mission.capability());
  const noExport = new RepositoryReviewMissionAdapter({ ...f, env: { ...f.env, AGENT_WORK_OS_MISSION_CONTEXT_EXPORT_APPROVED: "false" } });
  assert.equal(noExport.capability(), null);
  const same = fixture(t, { sameModel: true });
  assert.equal(same.mission.capability(), null);
  const remoteAnalyst = { ...f.analyst, endpoint: { kind: "approved_remote" } };
  const noRemoteConsent = new RepositoryReviewMissionAdapter({ ...f, analyst: remoteAnalyst });
  assert.equal(noRemoteConsent.capability(), null);
});

test("prepare emits a digest-bound approval request without invoking any providers", async (t) => {
  const f = fixture(t);
  const { events, payload, result } = await prepare(f.mission, f.base);
  assert.equal(result.nativeSessionId, "repository-review-mission-1");
  assert.equal(payload.type, "mission.approval_required");
  assert.match(payload.approvalHash, /^[a-f0-9]{64}$/);
  assert.deepEqual(f.calls, []);
  assert.deepEqual(payload.plan.actions, ["local_readonly_index_search", "first_model_analysis", "separate_model_critique"]);
  assert.equal(payload.plan.contextExport, "sanitized_symbol_metadata_only");
  assert.equal(events.at(-1).status, "completed");
});

test("approval runs real code index then two configured models and returns evidence without applying code", async (t) => {
  const f = fixture(t);
  const prepared = await prepare(f.mission, f.base);
  const out = [];
  const done = await f.mission.run({
    sessionId: "mission-1", cwd: f.base, nativeSessionId: prepared.result.nativeSessionId,
    prompt: "approve " + prepared.payload.approvalHash
  }, (event) => out.push(event));
  assert.equal(done.nativeSessionId, prepared.result.nativeSessionId);
  assert.deepEqual(f.calls, ["index", "analyst", "reviewer"]);
  assert.deepEqual(out.filter((e) => e.kind === "text").map((e) => JSON.parse(e.text).stage).slice(0, 3),
    ["codeatlas", "analysis", "independent-critique"]);
  const report = JSON.parse(out.filter((e) => e.kind === "text").at(-1).text);
  assert.equal(report.status, "human_review_required");
  assert.equal(report.codeChanged, false);
  assert.equal(report.testsExecuted, false);
  assert.equal(report.deployed, false);
  assert.match(report.digest, /^[a-f0-9]{64}$/);
  assert.equal(out.filter((e) => e.kind === "usage").length, 2);
  await assert.rejects(f.mission.run({
    sessionId: "mission-1", cwd: f.base, nativeSessionId: done.nativeSessionId, prompt: "approve " + prepared.payload.approvalHash
  }, () => {}), /MISSION_ALREADY_FINISHED/);
});

test("mismatched approval and rejection cause no model, CLI or write activity", async (t) => {
  const f = fixture(t);
  const p = await prepare(f.mission, f.base);
  await assert.rejects(f.mission.run({
    sessionId: "mission-1", cwd: f.base, nativeSessionId: p.result.nativeSessionId,
    prompt: "approve " + "f".repeat(64)
  }, () => {}), /MISSION_APPROVAL_DIGEST_MISMATCH/);
  assert.deepEqual(f.calls, []);
  const output = [];
  await f.mission.run({ sessionId: "mission-1", cwd: f.base, nativeSessionId: p.result.nativeSessionId,
    prompt: "reject " + p.payload.approvalHash }, (e) => output.push(e));
  assert.equal(JSON.parse(output.find((e) => e.kind === "text").text).type, "mission.rejected");
  assert.deepEqual(f.calls, []);
});

test("fails closed on unsealed/stale index and disallows after-interrupt approval", async (t) => {
  const f = fixture(t);
  const p = await prepare(f.mission, f.base);
  writeFileSync(path.join(f.base, ".codeatlas", "index.sqlite3"), "changed index");
  await assert.rejects(f.mission.run({
    sessionId: "mission-1", cwd: f.base, nativeSessionId: p.result.nativeSessionId,
    prompt: "approve " + p.payload.approvalHash
  }, () => {}), /MISSION_INDEX_CHANGED_REAPPROVAL_REQUIRED/);
  assert.deepEqual(f.calls, []);
  const other = fixture(t);
  const second = await prepare(other.mission, other.base);
  await other.mission.interrupt("mission-1");
  await assert.rejects(other.mission.run({
    sessionId: "mission-1", cwd: other.base, nativeSessionId: second.result.nativeSessionId,
    prompt: "approve " + second.payload.approvalHash
  }, () => {}), /MISSION_INTERRUPTED/);
});

test("never accepts arbitrary prompts, shell commands, or unapproved repository directories", async (t) => {
  const f = fixture(t);
  await assert.rejects(f.mission.run({
    sessionId: "m", cwd: f.base, prompt: "rm -rf /"
  }, () => {}), /MISSION_FORMAT_INVALID/);
  await assert.rejects(f.mission.run({
    sessionId: "m", cwd: os.tmpdir(), prompt: "investigate process_orders | inspect"
  }, () => {}), /MISSION_WORKSPACE_UNTRUSTED/);
  assert.deepEqual(f.calls, []);
});
