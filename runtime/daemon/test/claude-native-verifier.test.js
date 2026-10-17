import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createCapabilitySpec } from "../../../packages/capability-fabric/src/index.js";
import { CapabilityVerificationError } from "../src/capability-verifier.js";
import { createClaudeNativeDiscoveryBundle, verifyClaudeNativeDiscovery } from "../src/claude-native-verifier.js";

class NativeDiscoveryAdapter {
  capability() { return { name: "claude-code", executable: "/fake/claude", version: "claude 2.1" }; }
  async run(request, emit) {
    const match = request.prompt.match(/^\/([a-z0-9-]+)\s/m);
    assert.ok(match, "prompt should invoke a concrete Claude project skill");
    const slug = match[1];
    const skill = await readFile(path.join(request.cwd, ".claude", "skills", slug, "SKILL.md"), "utf8");
    const marker = skill.match(/AWOS_CLAUDE_DISCOVERY_[A-F0-9]+/)?.[0];
    assert.ok(marker, "installed Claude skill should carry the hidden discovery probe");
    assert.equal(request.prompt.includes(marker), false, "probe marker must not be leaked into the prompt");
    emit({ kind: "status", status: "running", at: "2026-10-16T00:00:00Z" });
    emit({ kind: "text", text: `${marker}\nREADY`, at: "2026-10-16T00:00:01Z" });
    emit({ kind: "status", status: "completed", at: "2026-10-16T00:00:02Z" });
    return { nativeSessionId: "claude-native-test-thread" };
  }
}

class NoDiscoveryAdapter {
  capability() { return { name: "claude-code", executable: "/fake/claude", version: "claude 2.1" }; }
  async run(_request, emit) {
    emit({ kind: "status", status: "running" });
    emit({ kind: "text", text: "READY" });
    emit({ kind: "status", status: "completed" });
    return { nativeSessionId: "claude-missing-probe" };
  }
}

function makeSpec(kind = "skill") {
  return createCapabilitySpec({
    kind,
    version: "1.2.3",
    metadata: { name: "Claude Native Verification", slug: "claude-native-verification", description: "Return READY when verification succeeds." },
    execution: { instructions: "When asked to verify the capability, respond with READY." },
    provenance: {
      sourceUrl: "https://github.com/example/claude-source",
      sourceCommit: "abcdef1234567",
      sourceLicense: "MIT"
    },
    evaluation: {
      testCases: [{ id: "claude-native-smoke", input: "Verify this capability.", expected: "READY" }],
      qualityThreshold: 1
    }
  });
}

async function tempRoot() {
  return mkdtemp(path.join(tmpdir(), "agent-work-os-claude-native-"));
}

test("Claude native bundle installs the compiled skill under project .claude/skills", () => {
  const bundle = createClaudeNativeDiscoveryBundle(makeSpec());
  const paths = bundle.compilation.files.map((file) => file.path);
  assert.deepEqual(paths, [".claude/skills/claude-native-verification/SKILL.md"]);
  const skill = bundle.compilation.files[0].content;
  assert.match(skill, /AWOS_CLAUDE_DISCOVERY_[A-F0-9]+/);
  assert.equal(bundle.baseCompilation.manifest.harnessId, "claude-code");
});

test("Claude native-discovery verification requires hidden project-skill probe and rolls back", async () => {
  const root = await tempRoot();
  const result = await verifyClaudeNativeDiscovery({
    spec: makeSpec(),
    adapter: new NativeDiscoveryAdapter(),
    workspaceRoot: root,
    approveWrite: true,
    now: () => "2026-10-16T00:00:03Z",
    sessionIdFactory: () => "claude-native-session"
  });

  assert.equal(result.receipt.passed, true);
  assert.equal(result.receipt.harnessId, "claude-code");
  assert.equal(result.receipt.verificationMode, "native-discovery");
  assert.equal(result.receipt.skill.invocation, "/claude-native-verification");
  assert.equal(result.receipt.cases[0].discoveryMarkerMatched, true);
  assert.equal(result.receipt.cases[0].expectationMatched, true);
  assert.equal(result.receipt.rollback.ok, true);
  await assert.rejects(readFile(path.join(root, ".claude", "skills", "claude-native-verification", "SKILL.md"), "utf8"), { code: "ENOENT" });
});

test("Claude native-discovery verification fails when adapter never loads the skill probe", async () => {
  const root = await tempRoot();
  const result = await verifyClaudeNativeDiscovery({
    spec: makeSpec(),
    adapter: new NoDiscoveryAdapter(),
    workspaceRoot: root,
    approveWrite: true
  });
  assert.equal(result.receipt.passed, false);
  assert.equal(result.receipt.cases[0].discoveryMarkerMatched, false);
  assert.equal(result.receipt.cases[0].expectationMatched, true);
});

test("Claude native-discovery fails closed instead of overwriting an existing project skill", async () => {
  const root = await tempRoot();
  await mkdir(path.join(root, ".claude", "skills", "claude-native-verification"), { recursive: true });
  await assert.rejects(
    verifyClaudeNativeDiscovery({
      spec: makeSpec(),
      adapter: new NativeDiscoveryAdapter(),
      workspaceRoot: root,
      approveWrite: true
    }),
    (error) => error instanceof CapabilityVerificationError && error.code === "claude_native_discovery_workspace_conflict"
  );
});

test("Claude native-discovery currently accepts skills only", async () => {
  const root = await tempRoot();
  await assert.rejects(
    verifyClaudeNativeDiscovery({
      spec: makeSpec("agent"),
      adapter: new NativeDiscoveryAdapter(),
      workspaceRoot: root,
      approveWrite: true
    }),
    (error) => error instanceof CapabilityVerificationError && error.code === "claude_native_discovery_kind_unsupported"
  );
});
