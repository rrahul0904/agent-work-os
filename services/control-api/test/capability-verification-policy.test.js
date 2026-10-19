import assert from "node:assert/strict";
import test from "node:test";
import { resolveCapabilityVerificationSupport } from "../src/capability-verification-policy.js";

function machine(capability) {
  return { id: "machine-1", capabilities: capability ? [capability] : [] };
}

test("fails when capability verification is not advertised", () => {
  assert.deepEqual(resolveCapabilityVerificationSupport(machine(null), {}), {
    ok: false,
    error: "capability_verification_not_available"
  });
});

test("accepts advertised Codex and Claude harness modes", () => {
  const target = machine({
    name: "capability-verify",
    harnesses: ["codex", "claude-code"],
    modes: ["artifact-context", "native-discovery"],
    harnessModes: {
      codex: ["artifact-context", "native-discovery"],
      "claude-code": ["artifact-context", "native-discovery"]
    }
  });

  assert.equal(resolveCapabilityVerificationSupport(target, { harnessId: "codex", mode: "native-discovery" }).ok, true);
  assert.equal(resolveCapabilityVerificationSupport(target, { harnessId: "claude-code", mode: "artifact-context" }).ok, true);
});

test("rejects harness or mode combinations not advertised by the selected machine", () => {
  const target = machine({
    name: "capability-verify",
    harnesses: ["codex", "claude-code"],
    modes: ["artifact-context", "native-discovery"],
    harnessModes: {
      codex: ["artifact-context", "native-discovery"],
      "claude-code": ["artifact-context"]
    }
  });

  assert.deepEqual(
    resolveCapabilityVerificationSupport(target, { harnessId: "cursor", mode: "artifact-context" }),
    { ok: false, error: "capability_verification_harness_not_supported" }
  );
  assert.deepEqual(
    resolveCapabilityVerificationSupport(target, { harnessId: "claude-code", mode: "native-discovery" }),
    { ok: false, error: "capability_verification_mode_not_supported" }
  );
});

test("preserves legacy Codex-only verifier records without opening new harnesses", () => {
  const target = machine({ name: "capability-verify", modes: ["artifact-context"] });
  const codex = resolveCapabilityVerificationSupport(target, { harnessId: "codex", mode: "artifact-context" });
  assert.equal(codex.ok, true);
  assert.equal(codex.compatibility, "legacy-codex");
  assert.deepEqual(
    resolveCapabilityVerificationSupport(target, { harnessId: "claude-code", mode: "artifact-context" }),
    { ok: false, error: "capability_verification_harness_not_supported" }
  );
});
