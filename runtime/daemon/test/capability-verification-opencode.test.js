import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createCapabilitySpec } from "../../../packages/capability-fabric/src/index.js";
import { CapabilityVerificationAdapter } from "../src/capability-verification-adapter.js";

class FakeOpenCodeAdapter {
  name = "opencode";
  capability() { return { name: this.name, executable: "/fake/opencode", version: "1.18.30" }; }
  async run(request, emit) {
    emit({ kind: "status", status: "running", at: "2026-10-16T00:00:00Z" });
    emit({ kind: "thread", nativeSessionId: "ses_opencode", at: "2026-10-16T00:00:00Z" });
    emit({ kind: "text", text: "READY", at: "2026-10-16T00:00:01Z" });
    emit({ kind: "status", status: "completed", at: "2026-10-16T00:00:02Z" });
    return { nativeSessionId: "ses_opencode" };
  }
  async interrupt() {}
}

function makeSpec() {
  return createCapabilitySpec({
    kind: "skill",
    version: "1.0.0",
    metadata: { name: "OpenCode Verify", slug: "opencode-verify", description: "Return READY." },
    execution: { instructions: "When verification is requested, respond with READY." },
    provenance: {
      sourceUrl: "https://github.com/example/source",
      sourceCommit: "abcdef1234567",
      sourceLicense: "MIT"
    },
    evaluation: {
      testCases: [{ id: "smoke", input: "Verify through OpenCode.", expected: "READY" }],
      qualityThreshold: 1
    }
  });
}

test("verification capability advertises both proven OpenCode verification modes", () => {
  const adapter = new CapabilityVerificationAdapter(null, null, new FakeOpenCodeAdapter());
  const capability = adapter.capability();
  assert.deepEqual(capability.harnesses, ["opencode"]);
  assert.deepEqual(capability.harnessModes.opencode, ["artifact-context", "native-discovery"]);
});

test("OpenCode artifact-context verification emits a passing receipt and rolls back", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "agent-work-os-opencode-verification-"));
  const adapter = new CapabilityVerificationAdapter(null, null, new FakeOpenCodeAdapter());
  const events = [];
  await adapter.run({
    sessionId: "outer-opencode",
    cwd: root,
    prompt: JSON.stringify({
      spec: makeSpec(),
      harnessId: "opencode",
      mode: "artifact-context",
      approveWrite: true,
      targetRoot: path.join(root, "stage")
    })
  }, (event) => events.push(event));

  const receipt = events.find((event) => event.name === "capability.verification.receipt")?.payload;
  assert.ok(receipt);
  assert.equal(receipt.harnessId, "opencode");
  assert.equal(receipt.verificationMode, "artifact-context");
  assert.equal(receipt.passed, true);
  assert.equal(receipt.harness.name, "opencode");
  assert.equal(receipt.rollback.attempted, true);
  await assert.rejects(readFile(path.join(root, "stage", ".opencode", "skills", "opencode-verify", "SKILL.md"), "utf8"), { code: "ENOENT" });
});
