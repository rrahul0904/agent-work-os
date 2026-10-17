import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createCapabilitySpec } from "../../../packages/capability-fabric/src/index.js";
import { createOpenCodeNativeDiscoveryBundle, verifyOpenCodeNativeDiscovery } from "../src/opencode-native-verifier.js";

class DiscoveringOpenCodeAdapter {
  name = "opencode";
  capability() { return { name: this.name, executable: "/fake/opencode", version: "1.18.30" }; }
  async run(request, emit) {
    const slug = request.prompt.match(/skill named ([a-z0-9-]+)/)?.[1];
    assert.ok(slug);
    const skill = await readFile(path.join(request.cwd, ".opencode", "skills", slug, "SKILL.md"), "utf8");
    const marker = skill.match(/AWOS_OPENCODE_DISCOVERY_[A-F0-9]+/)?.[0];
    assert.ok(marker);
    assert.equal(request.prompt.includes(marker), false);
    emit({ kind: "status", status: "running", at: "2026-10-16T00:00:00Z" });
    emit({ kind: "thread", nativeSessionId: "ses_native", at: "2026-10-16T00:00:00Z" });
    emit({ kind: "tool", name: "skill", phase: "completed", payload: { name: slug }, at: "2026-10-16T00:00:01Z" });
    emit({ kind: "text", text: `${marker}\nREADY`, at: "2026-10-16T00:00:01Z" });
    emit({ kind: "status", status: "completed", at: "2026-10-16T00:00:02Z" });
    return { nativeSessionId: "ses_native" };
  }
  async interrupt() {}
}

class GuessingOpenCodeAdapter extends DiscoveringOpenCodeAdapter {
  async run(request, emit) {
    emit({ kind: "status", status: "running", at: "2026-10-16T00:00:00Z" });
    emit({ kind: "text", text: "READY", at: "2026-10-16T00:00:01Z" });
    emit({ kind: "status", status: "completed", at: "2026-10-16T00:00:02Z" });
    return { nativeSessionId: "ses_guess" };
  }
}

function makeSpec(kind = "skill") {
  return createCapabilitySpec({
    kind,
    version: "1.0.0",
    metadata: { name: "OpenCode Native Verify", slug: "opencode-native-verify", description: "Use when native verification asks for READY." },
    execution: { instructions: "When verification is requested, respond with READY." },
    provenance: {
      sourceUrl: "https://github.com/example/source",
      sourceCommit: "abcdef1234567",
      sourceLicense: "MIT"
    },
    evaluation: {
      testCases: [{ id: "native-smoke", input: "Verify native discovery.", expected: "READY" }],
      qualityThreshold: 1
    }
  });
}

test("OpenCode native bundle uses project .opencode/skills path and hidden probe", () => {
  const bundle = createOpenCodeNativeDiscoveryBundle(makeSpec());
  assert.equal(bundle.compilation.files.length, 1);
  assert.equal(bundle.compilation.files[0].path, ".opencode/skills/opencode-native-verify/SKILL.md");
  assert.match(bundle.compilation.files[0].content, /AWOS_OPENCODE_DISCOVERY_[A-F0-9]+/);
  assert.equal(bundle.compilation.manifest.verificationMode, "native-discovery");
});

test("OpenCode native discovery requires hidden skill probe and rolls back", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "agent-work-os-opencode-native-"));
  const result = await verifyOpenCodeNativeDiscovery({
    spec: makeSpec(),
    adapter: new DiscoveringOpenCodeAdapter(),
    workspaceRoot: root,
    approveWrite: true
  });
  assert.equal(result.receipt.passed, true);
  assert.equal(result.receipt.harnessId, "opencode");
  assert.equal(result.receipt.verificationMode, "native-discovery");
  assert.equal(result.receipt.cases[0].discoveryMarkerMatched, true);
  assert.equal(result.receipt.skill.discovery, "native-skill-tool");
  assert.equal(result.receipt.rollback.ok, true);
  await assert.rejects(readFile(path.join(root, ".opencode", "skills", "opencode-native-verify", "SKILL.md"), "utf8"), { code: "ENOENT" });
});

test("OpenCode native discovery fails if model guesses expectation without loading skill", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "agent-work-os-opencode-guess-"));
  const result = await verifyOpenCodeNativeDiscovery({
    spec: makeSpec(),
    adapter: new GuessingOpenCodeAdapter(),
    workspaceRoot: root,
    approveWrite: true
  });
  assert.equal(result.receipt.passed, false);
  assert.equal(result.receipt.cases[0].expectationMatched, true);
  assert.equal(result.receipt.cases[0].discoveryMarkerMatched, false);
  assert.equal(result.receipt.rollback.ok, true);
});

test("OpenCode native discovery refuses to overwrite an existing project skill", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "agent-work-os-opencode-conflict-"));
  const target = path.join(root, ".opencode", "skills", "opencode-native-verify");
  await mkdir(target, { recursive: true });
  await writeFile(path.join(target, "SKILL.md"), "existing\n", "utf8");
  await assert.rejects(verifyOpenCodeNativeDiscovery({
    spec: makeSpec(),
    adapter: new DiscoveringOpenCodeAdapter(),
    workspaceRoot: root,
    approveWrite: true
  }), /opencode_native_discovery_workspace_conflict/);
});

test("OpenCode native discovery accepts skill capabilities only", async () => {
  assert.throws(() => createOpenCodeNativeDiscoveryBundle(makeSpec("agent")), /opencode_native_discovery_kind_unsupported/);
});
