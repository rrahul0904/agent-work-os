import assert from "node:assert/strict";
import test from "node:test";
import { canonicalDigest, createCanonicalId } from "../../domain/src/index.js";
import {
  CompanyValidationError,
  LAUNCH_CERTIFICATE_REQUIREMENTS,
  createCompanyActionPlan,
  createCompanySpec,
  createInitialCompanyState,
  createMetricObservation,
  evaluateLaunchReadiness,
  issueLaunchCertificate,
  reduceCompanyEvent,
  replayCompanyEvents
} from "../src/index.js";

const actorId = createCanonicalId("user", "22222222-2222-4222-8222-222222222222");
const projectId = createCanonicalId("project", "11111111-1111-4111-8111-111111111111");
const workId = createCanonicalId("work", "33333333-3333-4333-8333-333333333333");

function buildSpec(overrides = {}) {
  return createCompanySpec({
    companyId: "snowspend-lab",
    projectId,
    revision: 1,
    founderIntent: "Build a synthetic SaaS that explains Snowflake spend.",
    problemStatement: "Data teams need explainable cost-driver prioritization.",
    targetCustomer: "Mid-sized Snowflake customers.",
    valueProposition: "Evidence-backed synthetic cost analysis.",
    businessModelHypothesis: "Subscription SaaS; pricing demand unvalidated in Phase A.",
    productForm: "Web application backed only by synthetic fixtures.",
    launchConstraints: ["Synthetic data only", "No production deployment"],
    geographyAssumptions: ["US market research hypothesis only"],
    successMetricIds: ["verified_preview_ready", "deterministic_replay_pass"],
    allowedCapabilityIds: ["research.read_public_web", "workspace.write_owned_fixture", "test.run_deterministic"],
    provenance: [{ type: "source", ref: "agent-work-os#234" }],
    createdBy: actorId,
    createdAt: "2026-10-17T04:40:00Z",
    ...overrides
  });
}

function objective(spec) {
  return {
    objectiveId: "phase-a-launch-readiness",
    companyId: spec.companyId,
    companySpecDigest: spec.specDigest,
    name: "Prove synthetic preview readiness",
    metricIds: ["verified_preview_ready", "deterministic_replay_pass"],
    baselineObservationRefs: [],
    target: { verified_preview_ready: true, deterministic_replay_pass: true },
    horizon: "Phase A",
    constraints: ["No external consequential effects"],
    state: "active",
    evidenceRequirements: ["build", "tests", "preview", "browser UAT", "replay"],
    createdAt: "2026-10-17T04:41:00Z",
    updatedAt: "2026-10-17T04:41:00Z"
  };
}

function evidence(kind) {
  return {
    companyId: "snowspend-lab",
    kind,
    status: "passed",
    evidenceRef: `fixture:${kind}`,
    evidenceDigest: canonicalDigest({ kind, result: "passed" }),
    observedAt: "2026-10-17T04:50:00Z"
  };
}

test("CompanySpec is normalized and digest-stable", () => {
  const first = buildSpec();
  const second = buildSpec({ launchConstraints: ["Synthetic data only", "No production deployment"] });
  assert.match(first.specDigest, /^sha256:[0-9a-f]{64}$/);
  assert.equal(first.specDigest, second.specDigest);
  assert.equal(first.schemaVersion, "company-spec/v1");
});

test("tampered CompanySpec fails closed", () => {
  const spec = buildSpec();
  const tampered = { ...spec, valueProposition: "Pretend everything shipped" };
  assert.throws(() => createInitialCompanyState(tampered), (error) => error instanceof CompanyValidationError && error.code === "company_spec_digest_invalid");
});

test("Phase A action plans reject external consequential effects", () => {
  const spec = buildSpec();
  const state = createInitialCompanyState(spec);
  const common = {
    planId: "growth-draft-1",
    companyId: spec.companyId,
    companySpecDigest: spec.specDigest,
    objectiveId: "phase-a-launch-readiness",
    workstream: "growth",
    workItemId: workId,
    baseStateSnapshotDigest: state.snapshotDigest,
    intent: "Prepare a launch message.",
    expectedOutputs: ["Launch draft"],
    requestedCapabilityIds: [],
    externalDependencies: [],
    riskClass: "low",
    reversibility: "reversible",
    approvalRequirement: "none",
    postconditionChecks: ["Draft exists"],
    createdBy: actorId,
    createdAt: "2026-10-17T04:42:00Z"
  };
  const draft = createCompanyActionPlan({ ...common, expectedEffects: ["create_draft_artifact"] }, { spec, stateSnapshotDigest: state.snapshotDigest });
  assert.match(draft.planDigest, /^sha256:/);
  assert.throws(
    () => createCompanyActionPlan({ ...common, expectedEffects: ["send_email"] }, { spec, stateSnapshotDigest: state.snapshotDigest }),
    (error) => error instanceof CompanyValidationError && error.code === "phase_a_effect_forbidden"
  );
});

test("stale company spec and state digests cannot authorize a plan", () => {
  const spec = buildSpec();
  const state = createInitialCompanyState(spec);
  const input = {
    planId: "build-1",
    companyId: spec.companyId,
    companySpecDigest: canonicalDigest({ stale: true }),
    objectiveId: "phase-a-launch-readiness",
    workstream: "engineering",
    workItemId: workId,
    baseStateSnapshotDigest: state.snapshotDigest,
    intent: "Build owned fixture.",
    expectedOutputs: [],
    expectedEffects: ["write_owned_fixture"],
    requestedCapabilityIds: [],
    externalDependencies: [],
    riskClass: "low",
    reversibility: "reversible",
    approvalRequirement: "policy",
    postconditionChecks: ["Tests pass"],
    createdBy: actorId,
    createdAt: "2026-10-17T04:43:00Z"
  };
  assert.throws(() => createCompanyActionPlan(input, { spec, stateSnapshotDigest: state.snapshotDigest }), /company_spec_stale/);
  assert.throws(
    () => createCompanyActionPlan({ ...input, companySpecDigest: spec.specDigest, baseStateSnapshotDigest: canonicalDigest({ old: true }) }, { spec, stateSnapshotDigest: state.snapshotDigest }),
    /company_state_stale/
  );
});

test("business metrics require source provenance and work completion cannot fabricate KPI movement", () => {
  assert.throws(() => createMetricObservation({
    observationId: "revenue-1",
    companyId: "snowspend-lab",
    metricId: "revenue_usd",
    value: 100,
    unit: "USD",
    sourceType: "billing",
    sourceRef: "",
    observedAt: "2026-10-17T04:44:00Z",
    quality: "verified",
    provenance: [{ type: "source", ref: "billing:test" }],
    evidenceRefs: []
  }), /metric_source_required/);

  const spec = buildSpec();
  const state = createInitialCompanyState(spec);
  const afterWork = reduceCompanyEvent(state, { type: "work.completed", companyId: spec.companyId, workItemId: workId });
  assert.equal(Object.keys(afterWork.metrics).length, 0);
  assert.equal(afterWork.eventCount, 1);
});

test("cross-company events and secret-shaped persisted material fail closed", () => {
  const spec = buildSpec();
  const state = createInitialCompanyState(spec);
  assert.throws(() => reduceCompanyEvent(state, {
    type: "blocker.observed",
    companyId: "other-company",
    blocker: {}
  }), /company_event_cross_company/);

  assert.throws(() => createCompanySpec({
    ...{
      companyId: "bad-secret",
      projectId,
      founderIntent: "x",
      problemStatement: "x",
      targetCustomer: "x",
      valueProposition: "x",
      businessModelHypothesis: "x",
      productForm: "x",
      successMetricIds: ["m"],
      provenance: [{ type: "source", ref: "x" }],
      createdBy: actorId,
      createdAt: "2026-10-17T04:45:00Z"
    },
    budgetPolicyRef: "sk-123456789012345678901234"
  }), (error) => error instanceof CompanyValidationError && error.code === "secret_material_forbidden");
});

test("event replay rebuilds the exact deterministic company snapshot", () => {
  const spec = buildSpec();
  let state = createInitialCompanyState(spec);
  const events = [];
  const objectiveEvent = { type: "objective.upsert", companyId: spec.companyId, objective: objective(spec) };
  events.push(objectiveEvent);
  state = reduceCompanyEvent(state, objectiveEvent);
  const blockerEvent = {
    type: "blocker.observed",
    companyId: spec.companyId,
    blocker: {
      blockerId: "provider-approval-1",
      companyId: spec.companyId,
      category: "provider_approval_pending",
      status: "open",
      reason: "Synthetic provider approval fixture.",
      evidenceRefs: [],
      requiresHuman: false,
      firstObservedAt: "2026-10-17T04:46:00Z"
    }
  };
  events.push(blockerEvent);
  state = reduceCompanyEvent(state, blockerEvent);
  const resolveEvent = { type: "blocker.resolved", companyId: spec.companyId, blockerId: "provider-approval-1", resolvedAt: "2026-10-17T04:47:00Z" };
  events.push(resolveEvent);
  state = reduceCompanyEvent(state, resolveEvent);
  const replayed = replayCompanyEvents(spec, events);
  assert.equal(replayed.snapshotDigest, state.snapshotDigest);
  assert.deepEqual(replayed, state);
});

test("launch certificate requires every proof class and zero open blockers", () => {
  const spec = buildSpec();
  let state = createInitialCompanyState(spec);
  const first = evaluateLaunchReadiness(state);
  assert.equal(first.ready, false);
  assert.deepEqual(first.missingEvidence, LAUNCH_CERTIFICATE_REQUIREMENTS);
  assert.throws(() => issueLaunchCertificate(state, { certificateId: "phase-a-cert-1", issuedAt: "2026-10-17T05:00:00Z", issuedBy: actorId }), /company_launch_not_ready/);

  for (const kind of LAUNCH_CERTIFICATE_REQUIREMENTS) {
    state = reduceCompanyEvent(state, { type: "evidence.recorded", companyId: spec.companyId, evidence: evidence(kind) });
  }
  assert.equal(evaluateLaunchReadiness(state).ready, true);
  const certificate = issueLaunchCertificate(state, { certificateId: "phase-a-cert-1", issuedAt: "2026-10-17T05:00:00Z", issuedBy: actorId });
  assert.equal(certificate.declaration, "verified_phase_a_preview_ready_not_business_success");
  assert.equal(certificate.stateSnapshotDigest, state.snapshotDigest);
  assert.match(certificate.certificateDigest, /^sha256:/);
});

test("open blockers prevent certification even when evidence exists", () => {
  const spec = buildSpec();
  let state = createInitialCompanyState(spec);
  for (const kind of LAUNCH_CERTIFICATE_REQUIREMENTS) {
    state = reduceCompanyEvent(state, { type: "evidence.recorded", companyId: spec.companyId, evidence: evidence(kind) });
  }
  state = reduceCompanyEvent(state, {
    type: "blocker.observed",
    companyId: spec.companyId,
    blocker: {
      blockerId: "verification-1",
      companyId: spec.companyId,
      category: "verification_failed",
      status: "open",
      reason: "Browser acceptance failed.",
      evidenceRefs: ["fixture_browser_uat"],
      requiresHuman: false,
      firstObservedAt: "2026-10-17T04:55:00Z"
    }
  });
  const readiness = evaluateLaunchReadiness(state);
  assert.equal(readiness.ready, false);
  assert.deepEqual(readiness.openBlockerIds, ["verification-1"]);
});
