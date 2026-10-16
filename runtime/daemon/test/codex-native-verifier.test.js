import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createCapabilitySpec } from "../../../packages/capability-fabric/src/index.js";
import { CapabilityVerificationError } from "../src/capability-verifier.js";
import { createCodexNativeDiscoveryBundle, verifyCodexNativeDiscovery } from "../src/codex-native-verifier.js";

class NativeDiscoveryAdapter {
  capability() { return { name: "codex", executable: "/fake/codex", version: "codex 1.0" }; }
  async run(request, emit) {
    const match = request.prompt.match(/Use the \$([a-z0-9-]+) skill/);
    assert.ok(match, "prompt should request a concrete native skill");
    const slug = match[1];
    const skill = await readFile(path.join(request.cwd, "plugins", slug, "skills", slug, "SKILL.md"), "utf8");
    const marker = skill.match(/AWOS_DISCOVERY_[A-F0-9]+/)?.[0];
    assert.ok(marker, "installed native skill should carry the discovery probe");
    assert.equal(request.prompt.includes(marker), false, "probe marker must not be leaked into the user prompt");
    emit({ kind: "status", status: "running", at: "2026-10-16T00:00:00Z" });
    emit({ kind: "text", text: `${marker}\nREADY`, at: "2026-10-16T00:00:01Z" });
    emit({ kind: "status", status: "completed", at: "2026-10-16T00:00:02Z" });
    return { nativeSessionId: "native-test-thread" };
  }
}

class NoDiscoveryAdapter {
  capability() { return { name: "codex", executable: "/fake/codex", version: "codex 1.0" }; }
  async run(_request, emit) {
    emit({ kind: "status", status: "running" });
    emit({ kind: "text", text: "READY" });
    emit({ kind: "status", status: "completed" });
    return { nativeSessionId: "missing-probe" };
  }
}

function makeSpec(kind = "skill") {
  return createCapabilitySpec({
    kind,
    version: "1.2.3",
    metadata: { name: "Native Verification Skill", slug: "native-verification-skill", description: "Return READY when verification succeeds." },
    execution: { instructions: "When asked to verify the capability, respond with READY." },
    provenance: {
      sourceUrl: "https://github.com/example/source",
      sourceCommit: "abcdef1234567",
      sourceLicense: "MIT"
    },
    evaluation: {
      testCases: [{ id: "native-smoke", input: "Verify this capability.", expected: "READY" }],
      qualityThreshold: 1
    }
  });
}

async function tempRoot() {
  return mkdtemp(path.join(tmpdir(), "agent-work-os-native-verify-"));
}

test("native bundle uses portable Codex plugin and repo marketplace layout", () => {
  const bundle = createCodexNativeDiscoveryBundle(makeSpec());
  const paths = bundle.compilation.files.map((file) => file.path);
  assert.ok(paths.includes("plugins/native-verification-skill/plugin.json"));
  assert.ok(paths.includes("plugins/native-verification-skill/skills/native-verification-skill/SKILL.md"));
  assert.ok(paths.includes(".agents/plugins/marketplace.json"));
  assert.ok(paths.includes(".codex/config.toml"));
  const manifest = JSON.parse(bundle.compilation.files.find((file) => file.path.endsWith("/plugin.json")).content);
  assert.equal(manifest.name, "native-verification-skill");
  assert.equal(manifest.version, "1.2.3");
});

test("native-discovery verification requires the hidden installed-skill probe", async () => {
  const root = await tempRoot();
  const result = await verifyCodexNativeDiscovery({
    spec: makeSpec(),
    adapter: new NativeDiscoveryAdapter(),
    workspaceRoot: root,
    approveWrite: true,
    now: () => "2026-10-16T00:00:03Z",
    sessionIdFactory: () => "native-session"
  });

  assert.equal(result.receipt.passed, true);
  assert.equal(result.receipt.verificationMode, "native-discovery");
  assert.equal(result.receipt.cases[0].discoveryMarkerMatched, true);
  assert.equal(result.receipt.cases[0].expectationMatched, true);
  assert.equal(result.receipt.rollback.ok, true);
  await assert.rejects(readFile(path.join(root, "plugins", "native-verification-skill", "plugin.json"), "utf8"), { code: "ENOENT" });
  await assert.rejects(readFile(path.join(root, ".agents", "plugins", "marketplace.json"), "utf8"), { code: "ENOENT" });
  await assert.rejects(readFile(path.join(root, ".codex", "config.toml"), "utf8"), { code: "ENOENT" });
});

test("native-discovery verification fails when adapter never discovers probe", async () => {
  const root = await tempRoot();
  const result = await verifyCodexNativeDiscovery({
    spec: makeSpec(),
    adapter: new NoDiscoveryAdapter(),
    workspaceRoot: root,
    approveWrite: true
  });
  assert.equal(result.receipt.passed, false);
  assert.equal(result.receipt.cases[0].discoveryMarkerMatched, false);
  assert.equal(result.receipt.cases[0].expectationMatched, true);
});

test("native-discovery fails closed instead of overwriting existing Codex project configuration", async () => {
  const root = await tempRoot();
  await mkdir(path.join(root, ".codex"), { recursive: true });
  await writeFile(path.join(root, ".codex", "config.toml"), "model = \"existing\"\n", "utf8");
  await assert.rejects(
    verifyCodexNativeDiscovery({
      spec: makeSpec(),
      adapter: new NativeDiscoveryAdapter(),
      workspaceRoot: root,
      approveWrite: true
    }),
    (error) => error instanceof CapabilityVerificationError && error.code === "codex_native_discovery_workspace_conflict"
  );
});

test("native-discovery currently rejects capability kinds not packaged as Codex skills", async () => {
  const root = await tempRoot();
  await assert.rejects(
    verifyCodexNativeDiscovery({
      spec: makeSpec("agent"),
      adapter: new NativeDiscoveryAdapter(),
      workspaceRoot: root,
      approveWrite: true
    }),
    (error) => error instanceof CapabilityVerificationError && error.code === "codex_native_discovery_kind_unsupported"
  );
});
