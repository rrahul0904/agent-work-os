import test from "node:test";
import assert from "node:assert/strict";
import {
  CapabilityRegistry,
  CapabilityValidationError,
  HARNESS_PROFILES,
  compileCapability,
  createCapabilitySpec,
  createDriftRecord,
  importReaCapability
} from "../src/index.js";

const base = {
  id: "capability_123e4567-e89b-42d3-a456-426614174000",
  version: "1.0.0",
  kind: "skill",
  metadata: {
    name: "Safe API Review",
    description: "Review an API contract and report compatibility and security risks.",
    triggers: ["review api"],
    tags: ["review", "api"]
  },
  execution: { instructions: "Inspect the API contract. Return findings with evidence." },
  requirements: { tools: ["Read", "Grep"], permissions: ["read"], models: ["gpt-5.6-sol"] },
  provenance: {
    sourceUrl: "https://github.com/example/source",
    sourceCommit: "abcdef1234567",
    sourceLicense: "MIT",
    evidence: ["README.md#review"]
  },
  evaluation: { testCases: [{ input: "Review users API", expected: "findings" }], qualityThreshold: 0.9 }
};

test("creates a normalized capability spec with provenance", () => {
  const spec = createCapabilitySpec(base);
  assert.equal(spec.schemaVersion, "1");
  assert.equal(spec.metadata.slug, "safe-api-review");
  assert.equal(spec.provenance.sourceCommit, "abcdef1234567");
  assert.equal(spec.requirements.networkPolicy, "deny-by-default");
});

test("REA import requires evidence provenance and produces a capability", () => {
  const spec = importReaCapability({
    sourceUrl: "https://github.com/wshobson/agents",
    sourceCommit: "abcdef1",
    sourceLicense: "MIT",
    evidence: ["README.md"],
    capability: {
      id: "capability_123e4567-e89b-42d3-a456-426614174001",
      kind: "skill",
      metadata: { name: "Python Testing" },
      execution: { instructions: "Write tests first." }
    }
  });
  assert.equal(spec.metadata.slug, "python-testing");
  assert.equal(spec.provenance.sourceLicense, "MIT");
});

test("compiles a skill to all supported harness profiles", () => {
  const spec = createCapabilitySpec(base);
  for (const id of Object.keys(HARNESS_PROFILES)) {
    const result = compileCapability(spec, id, { allowDegraded: true });
    assert.ok(result.files.length >= 1, id);
    assert.match(result.receipt.receiptDigest, /^sha256:/);
    assert.equal(result.manifest.harnessId, id);
  }
});

test("Codex compilation splits skill bodies over the 8 KB limit", () => {
  const spec = createCapabilitySpec({
    ...base,
    id: "capability_123e4567-e89b-42d3-a456-426614174002",
    execution: { instructions: "x".repeat(9000) }
  });
  const result = compileCapability(spec, "codex");
  assert.equal(result.files.length, 2);
  assert.ok(result.manifest.warnings.includes("skill_body_split_for_harness_limit"));
  assert.ok(result.files.some((file) => file.path.endsWith("references/details.md")));
});

test("Codex compiles an agent to TOML with sandbox degradation", () => {
  const spec = createCapabilitySpec({
    ...base,
    id: "capability_123e4567-e89b-42d3-a456-426614174003",
    kind: "agent",
    metadata: { name: "Reviewer", description: "Review changes" },
    execution: { instructions: "Review the repository." },
    requirements: { tools: ["Read"], permissions: ["read"], models: ["gpt-5.6-sol"] }
  });
  const result = compileCapability(spec, "codex");
  assert.equal(result.files[0].path, "agents/reviewer.toml");
  assert.match(result.files[0].content, /sandbox_mode = "read-only"/);
});

test("unsupported capability fails closed unless degradation is explicitly allowed", () => {
  const spec = createCapabilitySpec({
    ...base,
    id: "capability_123e4567-e89b-42d3-a456-426614174004",
    kind: "mcp",
    metadata: { name: "Repo MCP" },
    execution: { instructions: "Expose repository metadata." }
  });
  assert.throws(() => compileCapability(spec, "pi"), (error) => {
    assert.ok(error instanceof CapabilityValidationError);
    return error.code === "capability_not_supported";
  });
  const degraded = compileCapability(spec, "pi", { allowDegraded: true });
  assert.deepEqual(degraded.manifest.degraded, ["mcp"]);
});

test("registry resolves latest version and filters current capabilities", () => {
  const registry = new CapabilityRegistry();
  const v1 = createCapabilitySpec(base);
  const v2 = createCapabilitySpec({ ...base, version: "1.1.0" });
  registry.add(v1);
  registry.add(v2);
  assert.equal(registry.resolve("safe-api-review").version, "1.1.0");
  assert.equal(registry.list({ tag: "api" }).length, 1);
});

test("drift records compare source, instructions, requirements and contracts", () => {
  const previous = createCapabilitySpec(base);
  const current = createCapabilitySpec({
    ...base,
    version: "1.1.0",
    provenance: { ...base.provenance, sourceCommit: "abcdef7654321" },
    execution: { instructions: "Inspect the API and verify auth boundaries." }
  });
  const drift = createDriftRecord({ previous, current, harnessId: "codex" });
  assert.equal(drift.changed, true);
  assert.deepEqual(drift.changes, ["source_commit", "instructions"]);
});
