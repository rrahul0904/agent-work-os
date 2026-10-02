import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { AgentStudioStore, rejectSecretFields } from "../src/store.js";

async function makeStore() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "agent-studio-store-"));
  const store = new AgentStudioStore(path.join(dir, "studio.json"));
  await store.load();
  return { store, file: path.join(dir, "studio.json") };
}

function baseAgent(overrides = {}) {
  return {
    name: "Research Builder",
    slug: "research-builder",
    instructions: "Research the request, cite evidence, and keep unsupported claims explicit.",
    machineId: "machine-1",
    cwd: "/workspace/project",
    agent: "echo",
    capabilityIds: ["local-session", "structured-receipts"],
    ...overrides
  };
}

test("published versions are immutable snapshots while the draft keeps evolving", async () => {
  const { store } = await makeStore();
  const created = await store.createAgent(baseAgent());
  const first = await store.publish(created.id);
  await store.updateDraft(created.id, { instructions: "A newer draft instruction." });
  const second = await store.publish(created.id);

  assert.equal(first.number, 1);
  assert.equal(second.number, 2);
  assert.match(store.getVersion(first.id).spec.instructions, /Research the request/);
  assert.equal(store.getVersion(second.id).spec.instructions, "A newer draft instruction.");
  assert.notEqual(first.specHash, second.specHash);
});

test("unknown capabilities and plaintext secret-shaped fields are refused", async () => {
  const { store } = await makeStore();
  await assert.rejects(() => store.createAgent(baseAgent({ capabilityIds: ["local-session", "shell-anything"] })), /unknown_capability/);
  await assert.rejects(() => store.createAgent({ ...baseAgent(), apiKey: "sk-not-stored" }), /plaintext_secret_field_refused/);
  assert.throws(() => rejectSecretFields({ nested: { password: "nope" } }), /plaintext_secret_field_refused:nested.password/);
});

test("preflight checks runtime adapter availability, verified brain handoff, and unsupported MCP refs", async () => {
  const { store } = await makeStore();
  const created = await store.createAgent(baseAgent({
    brainMode: "verified-context",
    capabilityIds: ["local-session", "shared-brain", "structured-receipts"],
    mcpServerRefs: ["catalog:github"]
  }));
  const version = await store.publish(created.id);
  const runtime = { machines: [{ id: "machine-1", status: "online", capabilities: [{ name: "echo" }] }] };
  const preflight = store.preflight(created.id, { versionId: version.id }, runtime);

  assert.equal(preflight.ready, false);
  assert.ok(preflight.reasons.includes("verified_context_requires_handoff"));
  assert.ok(preflight.reasons.includes("mcp_execution_not_implemented"));
});

test("compiled prompt separates reviewed instructions, reference context, and current human request", async () => {
  const { store } = await makeStore();
  const skill = await store.createSkill({ name: "Evidence", body: "Attach source receipts to factual claims." });
  const context = await store.createContext({ name: "Project note", body: "This material is reference data only." });
  const created = await store.createAgent(baseAgent({ skillIds: [skill.id], contextIds: [context.id] }));
  const version = await store.publish(created.id);
  const prompt = store.compilePrompt(created.id, version.id, "Implement the smallest verified slice.");

  assert.match(prompt, /PUBLISHED AGENT INSTRUCTIONS/);
  assert.match(prompt, /PUBLISHED SKILLS/);
  assert.match(prompt, /REFERENCE CONTEXT/);
  assert.match(prompt, /CURRENT HUMAN REQUEST/);
  assert.match(prompt, /Implement the smallest verified slice/);
});

test("state persists without leaking a secret store", async () => {
  const { store, file } = await makeStore();
  const created = await store.createAgent(baseAgent());
  await store.publish(created.id);
  const raw = await readFile(file, "utf8");
  assert.doesNotMatch(raw, /apiKey|password|accessToken/);
  assert.match(raw, /research-builder/);
});
