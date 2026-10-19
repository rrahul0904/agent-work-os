import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createCapabilitySpec } from "../../../packages/capability-fabric/src/index.js";
import { CapabilityVerificationAdapter } from "../src/capability-verification-adapter.js";

class FakeHarnessAdapter {
  constructor(name, { available = true } = {}) {
    this.name = name;
    this.available = available;
    this.interrupted = [];
  }
  capability() {
    return this.available ? { name: this.name, executable: `/fake/${this.name}`, version: `${this.name} 1.0` } : null;
  }
  async run(request, emit) {
    emit({ kind: "status", status: "running", at: "2026-10-16T00:00:00Z" });
    if (request.prompt.includes("Agent Work OS capability discovery marker")) {
      if (this.name === "codex") {
        const slug = request.prompt.match(/Use the \$([a-z0-9-]+) skill/)?.[1];
        assert.ok(slug);
        const skill = await readFile(path.join(request.cwd, "plugins", slug, "skills", slug, "SKILL.md"), "utf8");
        const marker = skill.match(/AWOS_DISCOVERY_[A-F0-9]+/)?.[0];
        assert.ok(marker);
        assert.equal(request.prompt.includes(marker), false);
        emit({ kind: "text", text: `${marker}\nREADY`, at: "2026-10-16T00:00:01Z" });
      } else if (this.name === "claude-code") {
        const slug = request.prompt.match(/^\/([a-z0-9-]+)\s/m)?.[1];
        assert.ok(slug);
        const skill = await readFile(path.join(request.cwd, ".claude", "skills", slug, "SKILL.md"), "utf8");
        const marker = skill.match(/AWOS_CLAUDE_DISCOVERY_[A-F0-9]+/)?.[0];
        assert.ok(marker);
        assert.equal(request.prompt.includes(marker), false);
        emit({ kind: "text", text: `${marker}\nREADY`, at: "2026-10-16T00:00:01Z" });
      }
    } else {
      emit({ kind: "text", text: "READY", at: "2026-10-16T00:00:01Z" });
    }
    emit({ kind: "status", status: "completed", at: "2026-10-16T00:00:02Z" });
    return { nativeSessionId: `nested-${request.sessionId}` };
  }
  async interrupt(sessionId) { this.interrupted.push(sessionId); }
}

class FakeCodexAdapter extends FakeHarnessAdapter {
  constructor(options) { super("codex", options); }
}
class FakeClaudeAdapter extends FakeHarnessAdapter {
  constructor(options) { super("claude-code", options); }
}

function makeSpec() {
  return createCapabilitySpec({
    kind: "skill",
    version: "1.0.0",
    metadata: { name: "Remote Verify", slug: "remote-verify", description: "Return READY." },
    execution: { instructions: "When verification is requested, respond with READY." },
    provenance: {
      sourceUrl: "https://github.com/example/source",
      sourceCommit: "abcdef1234567",
      sourceLicense: "MIT"
    },
    evaluation: {
      testCases: [{ id: "remote-smoke", input: "Verify remotely.", expected: "READY" }],
      qualityThreshold: 1
    }
  });
}

async function tempRoot() {
  return mkdtemp(path.join(tmpdir(), "agent-work-os-remote-capability-"));
}

function requestPayload(spec, overrides = {}) {
  return JSON.stringify({
    spec,
    harnessId: "codex",
    mode: "artifact-context",
    approveWrite: true,
    ...overrides
  });
}

test("adapter advertises only available nested harnesses and per-harness modes", () => {
  const both = new CapabilityVerificationAdapter(new FakeCodexAdapter(), new FakeClaudeAdapter());
  assert.equal(both.capability().name, "capability-verify");
  assert.deepEqual(both.capability().harnesses, ["codex", "claude-code"]);
  assert.deepEqual(both.capability().harnessModes.codex, ["artifact-context", "native-discovery"]);
  assert.deepEqual(both.capability().harnessModes["claude-code"], ["artifact-context", "native-discovery"]);

  const claudeOnly = new CapabilityVerificationAdapter(new FakeCodexAdapter({ available: false }), new FakeClaudeAdapter());
  assert.deepEqual(claudeOnly.capability().harnesses, ["claude-code"]);
  assert.deepEqual(claudeOnly.capability().modes, ["artifact-context", "native-discovery"]);

  const unavailable = new CapabilityVerificationAdapter(new FakeCodexAdapter({ available: false }), new FakeClaudeAdapter({ available: false }));
  assert.equal(unavailable.capability(), null);
});

test("remote Codex artifact-context verification emits durable receipt event and rolls back", async () => {
  const root = await tempRoot();
  const adapter = new CapabilityVerificationAdapter(new FakeCodexAdapter());
  const events = [];
  await adapter.run({
    sessionId: "outer-session",
    cwd: root,
    prompt: requestPayload(makeSpec(), { targetRoot: path.join(root, "stage") })
  }, (event) => events.push(event));

  const receiptEvent = events.find((event) => event.kind === "tool" && event.name === "capability.verification.receipt");
  assert.ok(receiptEvent);
  assert.equal(receiptEvent.payload.harnessId, "codex");
  assert.equal(receiptEvent.payload.verificationMode, "artifact-context");
  assert.equal(receiptEvent.payload.passed, true);
  assert.equal(receiptEvent.payload.rollback.attempted, true);
  assert.equal(events.at(-1).status, "completed");
  await assert.rejects(readFile(path.join(root, "stage", "skills", "remote-verify", "SKILL.md"), "utf8"), { code: "ENOENT" });
});

test("remote Claude artifact-context verification uses the generic verifier and rolls back", async () => {
  const root = await tempRoot();
  const adapter = new CapabilityVerificationAdapter(null, new FakeClaudeAdapter());
  const events = [];
  await adapter.run({
    sessionId: "outer-claude-session",
    cwd: root,
    prompt: requestPayload(makeSpec(), { harnessId: "claude-code", targetRoot: path.join(root, "stage") })
  }, (event) => events.push(event));

  const receipt = events.find((event) => event.name === "capability.verification.receipt")?.payload;
  assert.ok(receipt);
  assert.equal(receipt.harnessId, "claude-code");
  assert.equal(receipt.verificationMode, "artifact-context");
  assert.equal(receipt.passed, true);
  assert.equal(receipt.harness.name, "claude-code");
  assert.equal(receipt.rollback.attempted, true);
  await assert.rejects(readFile(path.join(root, "stage", "skills", "remote-verify", "SKILL.md"), "utf8"), { code: "ENOENT" });
});

test("remote Codex native-discovery verification proves hidden probe and rolls back", async () => {
  const root = await tempRoot();
  const adapter = new CapabilityVerificationAdapter(new FakeCodexAdapter());
  const events = [];
  await adapter.run({
    sessionId: "outer-native-session",
    cwd: root,
    prompt: requestPayload(makeSpec(), { mode: "native-discovery" })
  }, (event) => events.push(event));

  const receipt = events.find((event) => event.name === "capability.verification.receipt")?.payload;
  assert.ok(receipt);
  assert.equal(receipt.verificationMode, "native-discovery");
  assert.equal(receipt.passed, true);
  assert.equal(receipt.cases[0].discoveryMarkerMatched, true);
  assert.equal(receipt.rollback.ok, true);
  await assert.rejects(readFile(path.join(root, "plugins", "remote-verify", "plugin.json"), "utf8"), { code: "ENOENT" });
});

test("remote Claude native-discovery verification proves project skill discovery and rolls back", async () => {
  const root = await tempRoot();
  const adapter = new CapabilityVerificationAdapter(null, new FakeClaudeAdapter());
  const events = [];
  await adapter.run({
    sessionId: "outer-claude-native",
    cwd: root,
    prompt: requestPayload(makeSpec(), { harnessId: "claude-code", mode: "native-discovery" })
  }, (event) => events.push(event));

  const receipt = events.find((event) => event.name === "capability.verification.receipt")?.payload;
  assert.ok(receipt);
  assert.equal(receipt.harnessId, "claude-code");
  assert.equal(receipt.verificationMode, "native-discovery");
  assert.equal(receipt.passed, true);
  assert.equal(receipt.cases[0].discoveryMarkerMatched, true);
  assert.equal(receipt.skill.invocation, "/remote-verify");
  assert.equal(receipt.rollback.ok, true);
  await assert.rejects(readFile(path.join(root, ".claude", "skills", "remote-verify", "SKILL.md"), "utf8"), { code: "ENOENT" });
});

test("remote verification requires explicit write approval", async () => {
  const root = await tempRoot();
  const adapter = new CapabilityVerificationAdapter(new FakeCodexAdapter());
  await assert.rejects(
    adapter.run({
      sessionId: "outer-session",
      cwd: root,
      prompt: requestPayload(makeSpec(), { approveWrite: false })
    }, () => {}),
    /approveWrite=true/
  );
});

test("remote artifact verification cannot write outside session workspace", async () => {
  const root = await tempRoot();
  const outside = await tempRoot();
  const adapter = new CapabilityVerificationAdapter(new FakeCodexAdapter());
  await assert.rejects(
    adapter.run({
      sessionId: "outer-session",
      cwd: root,
      prompt: requestPayload(makeSpec(), { targetRoot: outside })
    }, () => {}),
    /must stay inside the session cwd/
  );
});

test("remote verification rejects unavailable requested harness", async () => {
  const root = await tempRoot();
  const adapter = new CapabilityVerificationAdapter(new FakeCodexAdapter());
  await assert.rejects(
    adapter.run({ sessionId: "outer-session", cwd: root, prompt: requestPayload(makeSpec(), { harnessId: "claude-code" }) }, () => {}),
    /harness claude-code is unavailable/
  );
});

test("remote verification rejects non-JSON prompts", async () => {
  const root = await tempRoot();
  const adapter = new CapabilityVerificationAdapter(new FakeCodexAdapter());
  await assert.rejects(
    adapter.run({ sessionId: "outer-session", cwd: root, prompt: "not-json" }, () => {}),
    /must be a JSON payload/
  );
});
