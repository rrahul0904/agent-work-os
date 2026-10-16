export function resolveCapabilityVerificationSupport(machine, harnessId, mode) {
  const capability = machine?.capabilities?.find((entry) => entry?.name === "capability-verify") ?? null;
  if (!capability) return { ok: false, status: 400, error: "capability_verification_not_available" };

  const harnesses = Array.isArray(capability.harnesses) && capability.harnesses.length
    ? capability.harnesses
    : inferLegacyHarnesses(capability);
  if (!harnesses.includes(harnessId)) {
    return { ok: false, status: 400, error: "capability_verification_harness_not_available_on_machine" };
  }

  const harnessModes = capability.harnessModes && typeof capability.harnessModes === "object"
    ? capability.harnessModes[harnessId]
    : null;
  const modes = Array.isArray(harnessModes) && harnessModes.length
    ? harnessModes
    : Array.isArray(capability.modes) ? capability.modes : ["artifact-context"];
  if (!modes.includes(mode)) {
    return { ok: false, status: 400, error: "capability_verification_mode_not_available_on_machine" };
  }

  return { ok: true, capability, harnessId, mode, harnesses, modes };
}

function inferLegacyHarnesses(capability) {
  if (Array.isArray(capability.nestedHarnesses) && capability.nestedHarnesses.length) {
    return capability.nestedHarnesses.map((entry) => entry?.harnessId).filter(Boolean);
  }
  // v1 verification daemons were Codex-only and did not advertise a harness list.
  return ["codex"];
}
