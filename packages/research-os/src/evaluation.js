import {
  canonicalDigest,
  assertResearchBrief,
  assertResearchPlan,
  assertEvidenceLedger,
  ResearchValidationError
} from "./index.js";
import { assertReaObservation } from "./collection.js";
import {
  createEvalScenario,
  evaluateDeterministicScenario,
  createEvalBaseline,
  compareEvalBaseline
} from "../../evaluation-harness/src/index.js";

export function createResearchEvalScenario({ brief: briefInput, plan: planInput, id = "research-os-grounding", revision = "v1" }) {
  const brief = assertResearchBrief(briefInput);
  const plan = assertResearchPlan(planInput, brief.digest);
  return createEvalScenario({
    id,
    revision,
    target: { kind: "research-os", id: "research-os", revision: plan.digest },
    fixtureRefs: [],
    limits: { maxTurns: 1, maxToolCalls: brief.budget.maxQueries, timeoutMs: 60_000 },
    allowedEffects: [],
    forbiddenEffects: ["network-write", "filesystem-write", "provider-write", "deployment"],
    rules: [
      { id: "verification-passed", path: ["verification", "passed"], operator: "eq", expected: true },
      { id: "minimum-evidence", path: ["collection", "evidenceCount"], operator: "gte", expected: brief.successMetrics.minimumEvidenceItems },
      { id: "query-budget", path: ["collection", "queryCount"], operator: "lte", expected: brief.budget.maxQueries },
      { id: "evidence-budget", path: ["collection", "evidenceCount"], operator: "lte", expected: brief.budget.maxEvidenceItems },
      { id: "unsupported-claims", path: ["verification", "insufficientClaimCount"], operator: "eq", expected: 0 },
      { id: "missing-observations", path: ["verification", "missingObservationCount"], operator: "eq", expected: 0 },
      { id: "speculative-only-claims", path: ["verification", "speculativeOnlyCount"], operator: "eq", expected: 0 },
      { id: "missing-provider-provenance", path: ["provenance", "missingProviderCount"], operator: "eq", expected: 0 },
      { id: "missing-citation-spans", path: ["citations", "missingSpanCount"], operator: "eq", expected: 0 }
    ],
    baselinePolicy: {
      requireCompatibleScenario: true,
      requireCompatibleTarget: true,
      requireCompatibleConfig: true
    }
  });
}

export function evaluateResearchEvidenceRun({
  brief: briefInput,
  plan: planInput,
  collection,
  ledger: ledgerInput,
  observations,
  verification,
  scenario = null,
  baseline = null,
  secrets = []
}) {
  const brief = assertResearchBrief(briefInput);
  const plan = assertResearchPlan(planInput, brief.digest);
  const ledger = assertEvidenceLedger(ledgerInput);
  assertCollection(collection, plan.digest, ledger.digest);
  if (!Array.isArray(observations)) throw new ResearchValidationError("research_eval_observations_invalid");
  const checkedObservations = observations.map(assertReaObservation);
  assertVerification(verification, ledger.digest);

  const evalScenario = scenario ?? createResearchEvalScenario({ brief, plan });
  const facts = buildResearchEvalFacts({ collection, observations: checkedObservations, verification });
  const config = {
    researchBriefDigest: brief.digest,
    researchPlanDigest: plan.digest,
    collectionDigest: collection.digest,
    adapterDigest: collection.adapterDigest
  };
  const receipt = evaluateDeterministicScenario({ scenario: evalScenario, facts, config, secrets });
  const comparison = baseline ? compareEvalBaseline({ baseline, receipt }) : null;
  return Object.freeze({ scenario: evalScenario, facts, receipt, comparison });
}

export function createResearchEvalBaseline(receipt) {
  return createEvalBaseline(receipt);
}

function buildResearchEvalFacts({ collection, observations, verification }) {
  const insufficientClaimCount = verification.results.filter((result) => result.status === "insufficient_evidence").length;
  const missingObservationCount = verification.results.reduce((count, result) => count + (result.missingObservationIds?.length ?? 0), 0);
  const speculativeOnlyCount = verification.results.filter((result) => result.speculativeOnly === true).length;
  const missingProviderCount = observations.filter((item) => !item.provenance?.provider || !item.provenance?.providerRevision || !item.provenance?.providerDigest).length;
  const missingSpanCount = observations.filter((item) => !item.sourceSpan || !Number.isSafeInteger(item.sourceSpan.start) || !Number.isSafeInteger(item.sourceSpan.end) || item.sourceSpan.end <= item.sourceSpan.start).length;
  const contradictionCount = verification.results.filter((result) => result.contradicted === true).length;
  return Object.freeze({
    schema: "research-eval-facts/v1",
    verification: {
      passed: verification.passed,
      insufficientClaimCount,
      missingObservationCount,
      speculativeOnlyCount,
      contradictionCount
    },
    collection: {
      queryCount: collection.usage.queryCount,
      evidenceCount: collection.usage.evidenceCount,
      truncated: collection.usage.truncated
    },
    provenance: { missingProviderCount },
    citations: { missingSpanCount },
    digest: canonicalDigest({
      verification: {
        passed: verification.passed,
        insufficientClaimCount,
        missingObservationCount,
        speculativeOnlyCount,
        contradictionCount
      },
      collection: {
        queryCount: collection.usage.queryCount,
        evidenceCount: collection.usage.evidenceCount,
        truncated: collection.usage.truncated
      },
      provenance: { missingProviderCount },
      citations: { missingSpanCount }
    })
  });
}

function assertCollection(value, planDigest, ledgerDigest) {
  if (!value || value.schema !== "research-collection/v1" || value.planDigest !== planDigest || value.evidenceLedgerDigest !== ledgerDigest) {
    throw new ResearchValidationError("research_eval_collection_invalid");
  }
  const { digest, ...body } = value;
  if (digest !== canonicalDigest(body)) throw new ResearchValidationError("research_eval_collection_digest_invalid");
  if (!value.usage || !Number.isSafeInteger(value.usage.queryCount) || !Number.isSafeInteger(value.usage.evidenceCount)) {
    throw new ResearchValidationError("research_eval_collection_usage_invalid");
  }
  return value;
}

function assertVerification(value, ledgerDigest) {
  if (!value || value.schema !== "rea-claim-verification/v1" || value.evidenceLedgerDigest !== ledgerDigest || !Array.isArray(value.results)) {
    throw new ResearchValidationError("research_eval_verification_invalid");
  }
  const { digest, ...body } = value;
  if (digest !== canonicalDigest(body)) throw new ResearchValidationError("research_eval_verification_digest_invalid");
  return value;
}
