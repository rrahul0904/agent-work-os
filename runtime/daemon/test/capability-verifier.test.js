import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createCapabilitySpec } from "../../../packages/capability-fabric/src/index.js";
import { rollbackInstall } from "../../../packages/capability-fabric/src/runtime.js";
import { CapabilityVerificationError, verifyCapabilityWithAdapter } from "../src/capability-verifier.js";

class FakeAdapter {
  constructor(outputs, capability = { name: "codex", executable: "/fake/codex", version: "codex 1.0" }) {
    this.outputs = [...outputs];
    this.capabilityInfo = capability;
  }
  capability() { return this.capabilityInfo; }
  async run(request, emit) {
    emit({ kind: "status", status: "running", at: "2026-10-16T00:00:00Z" });
    const text = this.outputs.shift() ?? "";
    emit({ kind: "text", text, at: "2026-10-16T00:00:01Z" });
    emit({ kind: "status", status: "completed", at: "2026-10-16T00:00:02Z" });
    return { nativeSessionId: `fake-${request.sessionId}` };
  }
}

function makeSpec({ expected = "ready", testCases = null, threshold = 1 } = {}) {
  return createCapabilitySpec({
    kind: "skill",
    version: "1.0.0",
    metadata: { name: "Verification Skill", slug: "verification-skill", description: "Return a verification result." },
    execution: { instructions: "When asked to verify, respond with READY." },
    provenance: {
      sourceUrl: "https://github.com/example/source",
      sourceCommit: "abcdef1234567",
      sourceLicense: "MIT"
    },
    evaluation: {
      testCases: testCases ?? [{ id: "smoke", input: "Verify this capability.", expected }],
      qualityThreshold: threshold
    }
  });
}

async function tempRoot() {
  return mkdtemp(path.join(tmpdir(), "agent-work-os-capability-verify-"));
}

test("verification executes compiled artifact through adapter and emits passing receipt", async () => {
  const root = await tempRoot();
  const spec = makeSpec();
  const result = await verifyCapabilityWithAdapter({
    spec,
    harnessId: "codex",
    adapter: new FakeAdapter(["READY"]),
    cwd: root,
    targetRoot: root,
    approveWrite: true,
    now: () => "2026-10-16T00:00:03Z",
    sessionIdFactory: () => "session-one"
  });

  assert.equal(result.receipt.passed, true);
  assert.equal(result.receipt.score, 1);
  assert.equal(result.receipt.verificationMode, "artifact-context");
  assert.equal(result.receipt.harness.version, "codex 1.0");
  assert.equal(result.receipt.cases[0].expectationMatched, true);
  assert.equal(result.receipt.rollback.attempted, true);
  await assert.rejects(readFile(path.join(root, "skills", "verification-skill", "SKILL.md"), "utf8"), { code: "ENOENT" });
});

test("verification failure rolls installation back and records failed case", async () => {
  const root = await tempRoot();
  const result = await verifyCapabilityWithAdapter({
    spec: makeSpec({ expected: "approved" }),
    harnessId: "codex",
    adapter: new FakeAdapter(["not yet"]),
    cwd: root,
    targetRoot: root,
    approveWrite: true
  });

  assert.equal(result.receipt.passed, false);
  assert.equal(result.receipt.score, 0);
  assert.equal(result.receipt.cases[0].expectationMatched, false);
  assert.equal(result.receipt.rollback.ok, true);
  await assert.rejects(readFile(path.join(root, "skills", "verification-skill", "SKILL.md"), "utf8"), { code: "ENOENT" });
});

test("successful verification can retain installation only when explicitly requested", async () => {
  const root = await tempRoot();
  const result = await verifyCapabilityWithAdapter({
    spec: makeSpec(),
    harnessId: "codex",
    adapter: new FakeAdapter(["READY"]),
    cwd: root,
    targetRoot: root,
    approveWrite: true,
    retainInstallation: true
  });

  assert.equal(result.receipt.passed, true);
  assert.equal(result.receipt.rollback.attempted, false);
  assert.match(await readFile(path.join(root, "skills", "verification-skill", "SKILL.md"), "utf8"), /Verification Skill/);
  await rollbackInstall(result.installationReceiptPath);
});

test("verification refuses to run without test cases", async () => {
  const root = await tempRoot();
  await assert.rejects(
    verifyCapabilityWithAdapter({
      spec: makeSpec({ testCases: [] }),
      harnessId: "codex",
      adapter: new FakeAdapter(["READY"]),
      cwd: root,
      targetRoot: root,
      approveWrite: true
    }),
    (error) => error instanceof CapabilityVerificationError && error.code === "capability_verification_test_cases_required"
  );
});

test("verification fails closed when the requested real adapter is unavailable", async () => {
  const root = await tempRoot();
  await assert.rejects(
    verifyCapabilityWithAdapter({
      spec: makeSpec(),
      harnessId: "codex",
      adapter: new FakeAdapter([], null),
      cwd: root,
      targetRoot: root,
      approveWrite: true
    }),
    (error) => error instanceof CapabilityVerificationError && error.code === "capability_verification_adapter_unavailable"
  );
});
