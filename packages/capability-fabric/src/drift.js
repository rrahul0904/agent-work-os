import { createHash } from "node:crypto";
import { HARNESS_PROFILES, assertCapabilitySpec, assertHarnessProfile } from "./index.js";

export class CapabilityDriftError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = "CapabilityDriftError";
    this.code = code;
  }
}

export function assessCapabilityDrift({
  previous: previousInput,
  current: currentInput,
  harnessIds = [],
  previousCompilationReceipts = [],
  currentProfiles = HARNESS_PROFILES
}) {
  const previous = assertCapabilitySpec(previousInput);
  const current = assertCapabilitySpec(currentInput);
  if (previous.metadata.slug !== current.metadata.slug) throw new CapabilityDriftError("capability_drift_slug_mismatch");
  if (!Array.isArray(harnessIds) || !Array.isArray(previousCompilationReceipts)) throw new CapabilityDriftError("capability_drift_inputs_invalid");

  const changes = [];
  recordChange(changes, "source_url", previous.provenance.sourceUrl, current.provenance.sourceUrl);
  recordChange(changes, "source_commit", previous.provenance.sourceCommit, current.provenance.sourceCommit);
  recordChange(changes, "source_license", previous.provenance.sourceLicense, current.provenance.sourceLicense);
  recordChange(changes, "source_path", previous.provenance.sourcePath, current.provenance.sourcePath);
  recordDigestChange(changes, "instructions", previous.execution.instructions, current.execution.instructions);
  recordDigestChange(changes, "references", previous.execution.references, current.execution.references);
  recordDigestChange(changes, "assets", previous.execution.assets, current.execution.assets);
  recordDigestChange(changes, "contract", previous.contract, current.contract);
  recordDigestChange(changes, "requirements", previous.requirements, current.requirements);
  recordDigestChange(changes, "triggers", previous.metadata.triggers, current.metadata.triggers);
  recordDigestChange(changes, "evaluation", previous.evaluation, current.evaluation);
  recordDigestChange(changes, "metadata", {
    name: previous.metadata.name,
    description: previous.metadata.description,
    tags: previous.metadata.tags
  }, {
    name: current.metadata.name,
    description: current.metadata.description,
    tags: current.metadata.tags
  });
  recordChange(changes, "version", previous.version, current.version);

  const requestedHarnesses = uniqueStrings([
    ...harnessIds,
    ...previousCompilationReceipts.map((receipt) => receipt?.harnessId).filter(Boolean)
  ]);
  const harnesses = requestedHarnesses.map((harnessId) => {
    const profile = currentProfiles[harnessId];
    if (!profile) throw new CapabilityDriftError("capability_drift_harness_unknown", `Unknown harness ${harnessId}`);
    assertHarnessProfile(profile);
    const currentProfileDigest = digest(profile);
    const receipts = previousCompilationReceipts.filter((receipt) => receipt?.harnessId === harnessId);
    const previousReceipt = receipts.at(-1) ?? null;
    const previousProfileDigest = previousReceipt?.harnessProfileDigest ?? null;
    return Object.freeze({
      harnessId,
      displayName: profile.displayName,
      previousProfileDigest,
      currentProfileDigest,
      profileChanged: previousProfileDigest !== null && previousProfileDigest !== currentProfileDigest,
      priorVerificationKnown: previousReceipt !== null,
      supportsNativeDiscovery: Boolean(profile.marketplace && (profile.skillsNative || profile.agentsNative || profile.commandsNative))
    });
  });

  const changedNames = new Set(changes.map((change) => change.kind));
  const sourceIdentityChanged = changedNames.has("source_url") || changedNames.has("source_license");
  const semanticChanged = ["instructions", "references", "assets", "contract", "requirements", "triggers", "evaluation"]
    .some((kind) => changedNames.has(kind));
  const harnessChanged = harnesses.some((entry) => entry.profileChanged);
  const provenanceOnlyChanged = !sourceIdentityChanged && !semanticChanged && !harnessChanged && changes.length > 0;

  let decision = "no-op";
  let risk = "none";
  if (sourceIdentityChanged) {
    decision = "blocked";
    risk = "critical";
  } else if (semanticChanged || harnessChanged) {
    decision = "reverify";
    risk = changedNames.has("requirements") || harnessChanged ? "high" : "medium";
  } else if (provenanceOnlyChanged) {
    decision = "review";
    risk = "low";
  }

  const assessment = {
    schemaVersion: "1",
    capabilityId: current.id,
    capabilitySlug: current.metadata.slug,
    fromVersion: previous.version,
    toVersion: current.version,
    previousDigest: digest(previous),
    currentDigest: digest(current),
    changed: changes.length > 0 || harnessChanged,
    decision,
    risk,
    changes,
    harnesses,
    cleanRoomReviewRequired: sourceIdentityChanged,
    safeToAutoPromote: false
  };
  assessment.assessmentDigest = digest(assessment);
  return Object.freeze(assessment);
}

export function createReverificationPlan(assessment) {
  if (!assessment || assessment.schemaVersion !== "1" || typeof assessment.decision !== "string") {
    throw new CapabilityDriftError("capability_drift_assessment_invalid");
  }

  const steps = [];
  if (assessment.changes.some((change) => ["source_url", "source_commit", "source_license", "source_path"].includes(change.kind))) {
    steps.push(step("refresh-evidence", "REA", "Refresh public evidence and pin the exact upstream revision before any compiler or runtime mutation."));
  }
  if (assessment.cleanRoomReviewRequired) {
    steps.push(step("review-provenance-license", "approval", "Re-establish source identity, license compatibility, and clean-room boundaries. Promotion is blocked until approved."));
  }

  if (["reverify", "blocked"].includes(assessment.decision)) {
    for (const harness of assessment.harnesses) {
      steps.push(step(`compile:${harness.harnessId}`, "compiler", `Compile the candidate capability against the current ${harness.displayName} profile and emit a deterministic compilation receipt.`));
      steps.push(step(`verify-artifact:${harness.harnessId}`, "runtime", `Run artifact-context verification on ${harness.displayName} and require the declared quality threshold.`));
      if (harness.supportsNativeDiscovery) {
        steps.push(step(`verify-native:${harness.harnessId}`, "runtime", `Run native-discovery verification on ${harness.displayName} when an owned adapter supports that gate.`));
      }
    }
  }

  if (assessment.decision === "review") {
    steps.push(step("review-nonsemantic-drift", "approval", "Review provenance/metadata-only drift and confirm that no semantic re-verification is required."));
  }
  if (assessment.decision !== "no-op") {
    steps.push(step("promote", "approval", "Promote the new immutable capability version only after required reviews and verification receipts pass."));
  }

  const plan = {
    schemaVersion: "1",
    capabilityId: assessment.capabilityId,
    capabilitySlug: assessment.capabilitySlug,
    assessmentDigest: assessment.assessmentDigest,
    decision: assessment.decision,
    blocked: assessment.decision === "blocked",
    automaticMutationAllowed: false,
    automaticPromotionAllowed: false,
    steps
  };
  plan.planDigest = digest(plan);
  return Object.freeze(plan);
}

function step(id, gate, instruction) {
  return Object.freeze({ id, gate, instruction });
}

function recordChange(changes, kind, before, after) {
  if (before === after) return;
  changes.push(Object.freeze({ kind, beforeDigest: digest(before ?? null), afterDigest: digest(after ?? null) }));
}

function recordDigestChange(changes, kind, before, after) {
  const beforeDigest = digest(before);
  const afterDigest = digest(after);
  if (beforeDigest === afterDigest) return;
  changes.push(Object.freeze({ kind, beforeDigest, afterDigest }));
}

function uniqueStrings(values) {
  return [...new Set(values.map((value) => String(value).trim()).filter(Boolean))];
}

function digest(value) {
  const content = typeof value === "string" ? value : JSON.stringify(sortValue(value));
  return `sha256:${createHash("sha256").update(content).digest("hex")}`;
}

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortValue(value[key])]));
}
