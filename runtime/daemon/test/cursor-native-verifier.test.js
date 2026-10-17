import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createCapabilitySpec } from "../../../packages/capability-fabric/src/index.js";
import { CapabilityVerificationAdapter } from "../src/capability-verification-adapter.js";
import { createCursorNativeDiscoveryBundle, verifyCursorNativeDiscovery } from "../src/cursor-native-verifier.js";

class DiscoveringCursorAdapter {
  name = "cursor";
  capability() { return { name: this.name, executable: "/fake/agent", version: "2026.10" }; }
  async run(request, emit) {
    const slug = request.prompt.match(/Skill \/([a-z0-9-]+)/)?.[1];
    assert.ok(slug);
    const skill = await readFile(path.join(request.cwd, ".cursor", "skills", slug, "SKILL.md"), "utf8");
    const marker = skill.match(/AWOS_CURSOR_DISCOVERY_[A-F0-9]+/)?.[0];
    assert.ok(marker);
    assert.equal(request.prompt.includes(marker), false);
    emit({ kind: "status", status: "running", at: "2026-10-16T00:00:00Z" });
    emit({ kind: "thread", nativeSessionId: "cursor-native", at: "2026-10-16T00:00:00Z" });
    emit({ kind: "text", text: `${marker}\nREADY`, at: "2026-10-16T00:00:01Z" });
    emit({ kind: "status", status: "completed", at: "2026-10-16T00:00:02Z" });
    return { nativeSessionId: "cursor-native" };
  }
  async interrupt() {}
}

class GuessingCursorAdapter extends DiscoveringCursorAdapter {
  async run(request, emit) {
    emit({ kind: "status", status: "running", at: "2026-10-16T00:00:00Z" });
    emit({ kind: "text", text: "READY", at: "2026-10-16T00:00:01Z" });
    emit({ kind: "status", status: "completed", at: "2026-10-16T00:00:02Z" });
    return { nativeSessionId: "cursor-guess" };
  }
}

function makeSpec(kind = "skill") {
  return createCapabilitySpec({
    kind,
    version: "1.0.0",
    metadata: { name: "Cursor Native Verify", slug: "cursor-native-verify", description: "Use when verification requests READY." },
    execution: { instructions: "When verification is requested, respond with READY." },
    provenance: { sourceUrl: "https://github.com/example/source", sourceCommit: "abcdef1234567", sourceLicense: "MIT" },
    evaluation: { testCases: [{ id: "native-smoke", input: "Verify Cursor native discovery.", expected: "READY" }], qualityThreshold: 1 }
  });
}

test("Cursor native bundle uses .cursor/skills and hidden probe", () => {
  const bundle = createCursorNativeDiscoveryBundle(makeSpec());
  assert.equal(bundle.compilation.files[0].path, ".cursor/skills/cursor-native-verify/SKILL.md");
  assert.match(bundle.compilation.files[0].content, /AWOS_CURSOR_DISCOVERY_[A-F0-9]+/);
});

test("Cursor native discovery requires hidden marker and rolls back", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "agent-work-os-cursor-native-"));
  const result = await verifyCursorNativeDiscovery({ spec: makeSpec(), adapter: new DiscoveringCursorAdapter(), workspaceRoot: root, approveWrite: true });
  assert.equal(result.receipt.passed, true);
  assert.equal(result.receipt.harnessId, "cursor");
  assert.equal(result.receipt.cases[0].discoveryMarkerMatched, true);
  assert.equal(result.receipt.rollback.ok, true);
  await assert.rejects(readFile(path.join(root, ".cursor", "skills", "cursor-native-verify", "SKILL.md"), "utf8"), { code: "ENOENT" });
});

test("Cursor expected-answer guessing does not prove discovery", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "agent-work-os-cursor-guess-"));
  const result = await verifyCursorNativeDiscovery({ spec: makeSpec(), adapter: new GuessingCursorAdapter(), workspaceRoot: root, approveWrite: true });
  assert.equal(result.receipt.passed, false);
  assert.equal(result.receipt.cases[0].expectationMatched, true);
  assert.equal(result.receipt.cases[0].discoveryMarkerMatched, false);
});

test("Cursor native verification refuses existing skill path", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "agent-work-os-cursor-conflict-"));
  const target = path.join(root, ".cursor", "skills", "cursor-native-verify");
  await mkdir(target, { recursive: true });
  await writeFile(path.join(target, "SKILL.md"), "existing\n", "utf8");
  await assert.rejects(verifyCursorNativeDiscovery({ spec: makeSpec(), adapter: new DiscoveringCursorAdapter(), workspaceRoot: root, approveWrite: true }), { code: "cursor_native_discovery_workspace_conflict" });
});

test("remote verifier advertises Cursor in both proven modes", () => {
  const adapter = new CapabilityVerificationAdapter(null, null, null, new DiscoveringCursorAdapter());
  assert.deepEqual(adapter.capability().harnesses, ["cursor"]);
  assert.deepEqual(adapter.capability().harnessModes.cursor, ["artifact-context", "native-discovery"]);
});
