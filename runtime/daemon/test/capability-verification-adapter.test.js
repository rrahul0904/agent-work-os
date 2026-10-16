import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createCapabilitySpec } from "../../../packages/capability-fabric/src/index.js";
import { CapabilityVerificationAdapter } from "../src/capability-verification-adapter.js";

class FakeCodexAdapter {
  constructor({ available = true } = {}) {
    this.available = available;
    this.interrupted = [];
  }
  capability() {
    return this.available ? { name: "codex", executable: "/fake/codex", version: "codex 1.0" } : null;
  }
  async run(request, emit) {
    emit({ kind: "status", status: "running", at: "2026-10-16T00:00:00Z" });
    if (request.prompt.includes("Agent Work OS capability discovery marker")) {
      const slug = request.prompt.match(/Use the \$([a-z0-9-]+) skill/)?.[1];
      assert.ok(slug);
      const skill = await readFile(path.join(request.cwd, "plugins", slug, "skills", slug, "SKILL.md"), "utf8");
      const marker = skill.match(/AWOS_DISCOVERY_[A-F0-9]+/)?.[0];
      assert.ok(marker);
      assert.equal(request.prompt.includes(marker), false);
      emit({ kind: "text", text: `${marker}\nREADY`, at: "2026-10-16T00:00:01Z" });
    } else {
      emit({ kind: "text", text: "READY", at: "2026-10-16T00:00:01Z" });
    }
    emit({ kind: "status", status: "completed", at: "2026-10-16T00:00:02Z" });
    return { nativeSessionId: `nested-${request.sessionId}` };
  }
  async interrupt(sessionId) { this.interrupted.push(sessionId); }
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

test("adapter advertises remote verification only when nested Codex is available", () => {
  const available = new CapabilityVerificationAdapter(new FakeCodexAdapter());
  assert.equal(available.capability().name, "capability-verify");
  assert.deepEqual(available.capability().modes, ["artifact-context", "native-discovery"]);

  const unavailable = new CapabilityVerificationAdapter(new FakeCodexAdapter({ available: false }));
  assert.equal(unavailable.capability(), null);
});

test("remote artifact-context verification emits durable receipt event and rolls back", async () => {
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
  assert.equal(receiptEvent.payload.verificationMode, "artifact-context");
  assert.equal(receiptEvent.payload.passed, true);
  assert.equal(receiptEvent.payload.rollback.attempted, true);
  assert.equal(events.at(-1).status, "completed");
  await assert.rejects(readFile(path.join(root, "stage", "skills", "remote-verify", "SKILL.md"), "utf8"), { code: "ENOENT" });
});

test("remote native-discovery verification proves hidden probe and rolls back", async () => {
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

test("remote verification rejects non-JSON prompts", async () => {
  const root = await tempRoot();
  const adapter = new CapabilityVerificationAdapter(new FakeCodexAdapter());
  await assert.rejects(
    adapter.run({ sessionId: "outer-session", cwd: root, prompt: "not-json" }, () => {}),
    /must be a JSON payload/
  );
});
