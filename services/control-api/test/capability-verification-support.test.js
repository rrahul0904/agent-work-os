import test from "node:test";
import assert from "node:assert/strict";
import { resolveCapabilityVerificationSupport } from "../src/capability-verification-support.js";

test("routes Claude verification only when machine advertises exact harness and mode", () => {
  const machine = {
    capabilities: [{
      name: "capability-verify",
      harnesses: ["codex", "claude-code"],
      modes: ["artifact-context", "native-discovery"],
      harnessModes: {
        codex: ["artifact-context", "native-discovery"],
        "claude-code": ["artifact-context", "native-discovery"]
      }
    }]
  };
  assert.equal(resolveCapabilityVerificationSupport(machine, "claude-code", "artifact-context").ok, true);
  assert.equal(resolveCapabilityVerificationSupport(machine, "claude-code", "native-discovery").ok, true);
});

test("rejects harness not installed on the selected machine", () => {
  const machine = { capabilities: [{ name: "capability-verify", harnesses: ["codex"], modes: ["artifact-context", "native-discovery"] }] };
  assert.deepEqual(resolveCapabilityVerificationSupport(machine, "claude-code", "artifact-context"), {
    ok: false,
    status: 400,
    error: "capability_verification_harness_not_available_on_machine"
  });
});

test("rejects verification mode not advertised for the selected harness", () => {
  const machine = {
    capabilities: [{
      name: "capability-verify",
      harnesses: ["claude-code"],
      modes: ["artifact-context", "native-discovery"],
      harnessModes: { "claude-code": ["artifact-context"] }
    }]
  };
  assert.deepEqual(resolveCapabilityVerificationSupport(machine, "claude-code", "native-discovery"), {
    ok: false,
    status: 400,
    error: "capability_verification_mode_not_available_on_machine"
  });
});

test("keeps backward compatibility with v1 Codex-only verification daemons", () => {
  const machine = { capabilities: [{ name: "capability-verify", executable: "builtin", version: "1", modes: ["artifact-context", "native-discovery"] }] };
  assert.equal(resolveCapabilityVerificationSupport(machine, "codex", "artifact-context").ok, true);
  assert.equal(resolveCapabilityVerificationSupport(machine, "codex", "native-discovery").ok, true);
  assert.equal(resolveCapabilityVerificationSupport(machine, "claude-code", "artifact-context").ok, false);
});

test("fails when capability verifier is not installed", () => {
  assert.deepEqual(resolveCapabilityVerificationSupport({ capabilities: [{ name: "codex" }] }, "codex", "artifact-context"), {
    ok: false,
    status: 400,
    error: "capability_verification_not_available"
  });
});
