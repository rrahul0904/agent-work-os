export function resolveCapabilityVerificationSupport(machine, { harnessId = "codex", mode = "artifact-context" } = {}) {
  const verifier = machine?.capabilities?.find((capability) => capability?.name === "capability-verify");
  if (!verifier) return { ok: false, error: "capability_verification_not_available" };

  const harnesses = Array.isArray(verifier.harnesses) ? verifier.harnesses : [];
  const harnessModes = verifier.harnessModes && typeof verifier.harnessModes === "object" ? verifier.harnessModes : {};
  const legacyModes = Array.isArray(verifier.modes) ? verifier.modes : [];

  // Older daemons advertised capability-verify before per-harness metadata existed.
  // Preserve Codex compatibility only for those old records; new harnesses must be explicit.
  if (!harnesses.length && harnessId === "codex") {
    if (legacyModes.length && !legacyModes.includes(mode)) {
      return { ok: false, error: "capability_verification_mode_not_supported" };
    }
    return { ok: true, verifier, harnessId, mode, compatibility: "legacy-codex" };
  }

  if (!harnesses.includes(harnessId)) {
    return { ok: false, error: "capability_verification_harness_not_supported" };
  }

  const modes = Array.isArray(harnessModes[harnessId]) ? harnessModes[harnessId] : legacyModes;
  if (!modes.includes(mode)) {
    return { ok: false, error: "capability_verification_mode_not_supported" };
  }

  return { ok: true, verifier, harnessId, mode, compatibility: "advertised" };
}
