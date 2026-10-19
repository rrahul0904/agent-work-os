import {
  ResearchValidationError,
  canonicalDigest,
  createEvidenceItem,
  buildEvidenceLedger,
  verifyClaims,
  assertResearchBrief,
  assertResearchPlan
} from "./index.js";
import { isGuardedReadOnlyProvider } from "./provider-boundary.js";

export const REA_EVIDENCE_CLASSES = Object.freeze(["OBSERVED", "DERIVED", "HYPOTHESIS", "UNKNOWN"]);
export const SOURCE_QUALITY_LEVELS = Object.freeze(["primary", "high", "medium", "low", "unknown"]);

export function createReaObservation(input) {
  object(input, "rea_observation_invalid");
  const evidence = input.evidence?.schema === "evidence-item/v1" ? input.evidence : createEvidenceItem(input.evidence);
  const reaClass = enumValue(input.reaClass ?? "OBSERVED", REA_EVIDENCE_CLASSES, "rea_observation_class_invalid");
  const sourceQuality = enumValue(input.sourceQuality ?? qualityFromClassification(evidence.classification), SOURCE_QUALITY_LEVELS, "rea_source_quality_invalid");
  const sourceSpan = normalizeSourceSpan(input.sourceSpan ?? null, evidence.excerpt.length);
  const observation = {
    schema: "rea-evidence-observation/v1",
    evidenceDigest: evidence.digest,
    evidenceId: evidence.id,
    reaClass,
    sourceQuality,
    publishedAt: optionalTimestamp(input.publishedAt, "rea_published_at_invalid"),
    retrievedAt: optionalTimestamp(input.retrievedAt, "rea_retrieved_at_invalid"),
    sourceSpan,
    provenance: normalizeProvenance(input.provenance ?? {})
  };
  return Object.freeze({ ...observation, digest: canonicalDigest(observation), evidence });
}

export function createFixtureSearchAdapter(fixtures, { id = "fixture-search", revision = "v1" } = {}) {
  if (!Array.isArray(fixtures)) throw new ResearchValidationError("fixture_search_fixtures_invalid");
  const normalized = fixtures.map((fixture, index) => normalizeFixture(fixture, index));
  const descriptor = {
    schema: "research-search-adapter/v1",
    id: stringValue(id, "search_adapter_id_invalid", 200),
    revision: stringValue(revision, "search_adapter_revision_invalid", 200),
    kind: "fixture",
    networkAccess: false,
    fixtureDigest: canonicalDigest(normalized.map(({ searchText: _searchText, ...rest }) => rest))
  };
  const metadata = Object.freeze({ ...descriptor, digest: canonicalDigest(descriptor) });
  return Object.freeze({
    metadata,
    async search(query, { queryId = null, limit = 10, retrievedAt = null } = {}) {
      const q = stringValue(query, "search_query_invalid", 4000);
      const cappedLimit = integer(limit, "search_limit_invalid", 1, 100);
      const tokens = tokenize(q);
      return normalized
        .map((fixture) => ({ fixture, score: tokenScore(tokens, fixture.searchText) }))
        .filter(({ score }) => score > 0)
        .sort((a, b) => b.score - a.score || a.fixture.id.localeCompare(b.fixture.id))
        .slice(0, cappedLimit)
        .map(({ fixture }) => createReaObservation({
          ...fixture.observation,
          retrievedAt,
          provenance: {
            ...fixture.observation.provenance,
            provider: metadata.id,
            providerRevision: metadata.revision,
            providerDigest: metadata.digest
          },
          evidence: { ...fixture.observation.evidence, queryId }
        }));
    }
  });
}

export async function collectResearchEvidence({ brief: briefInput, plan: planInput, searchAdapter, now = () => new Date().toISOString() }) {
  const brief = assertResearchBrief(briefInput);
  const plan = assertResearchPlan(planInput, brief.digest);
  const adapter = assertSearchAdapter(searchAdapter);
  if (adapter.metadata.networkAccess !== false && !isGuardedReadOnlyProvider(adapter)) {
    throw new ResearchValidationError("search_adapter_network_forbidden_phase_a");
  }

  const observations = [];
  let queryCount = 0;
  let truncated = false;
  for (const plannedQuery of plan.queries) {
    if (queryCount >= brief.budget.maxQueries || observations.length >= brief.budget.maxEvidenceItems) {
      truncated = true;
      break;
    }
    const remaining = brief.budget.maxEvidenceItems - observations.length;
    const results = await adapter.search(plannedQuery.query, {
      queryId: plannedQuery.id,
      limit: Math.max(1, remaining),
      retrievedAt: now()
    });
    if (!Array.isArray(results)) throw new ResearchValidationError("search_adapter_result_invalid");
    queryCount += 1;
    for (const result of results) {
      if (observations.length >= brief.budget.maxEvidenceItems) {
        truncated = true;
        break;
      }
      const observation = assertReaObservation(result);
      if (observation.evidence.queryId !== plannedQuery.id) throw new ResearchValidationError("search_adapter_query_binding_invalid");
      observations.push(observation);
    }
  }

  const deduped = dedupeObservations(observations).slice(0, brief.budget.maxEvidenceItems);
  if (deduped.length < observations.length) truncated = true;
  const ledger = buildEvidenceLedger(deduped.map((item) => stripDigest(item.evidence)));
  const collection = {
    schema: "research-collection/v1",
    planDigest: plan.digest,
    adapterDigest: adapter.metadata.digest,
    observationDigests: deduped.map((item) => item.digest),
    evidenceLedgerDigest: ledger.digest,
    usage: {
      queryCount,
      evidenceCount: ledger.items.length,
      maxQueries: brief.budget.maxQueries,
      maxEvidenceItems: brief.budget.maxEvidenceItems,
      truncated
    }
  };
  return Object.freeze({ observations: deduped, ledger, collection: Object.freeze({ ...collection, digest: canonicalDigest(collection) }) });
}

export function verifyObservationClaims({ claims, ledger, observations, requireIndependent = true }) {
  if (!Array.isArray(observations)) throw new ResearchValidationError("rea_observations_invalid");
  const byEvidenceId = new Map(observations.map((observation) => {
    const checked = assertReaObservation(observation);
    return [checked.evidenceId, checked];
  }));
  const base = verifyClaims({ claims, ledger, requireIndependent });
  const results = base.results.map((result) => {
    const linked = result.evidenceIds.map((id) => byEvidenceId.get(id)).filter(Boolean);
    const missingObservationIds = result.evidenceIds.filter((id) => !byEvidenceId.has(id));
    const speculativeOnly = linked.length > 0 && linked.every((item) => ["HYPOTHESIS", "UNKNOWN"].includes(item.reaClass));
    const baseSupported = result.status === "supported" || result.status === "supported_with_contradiction";
    const pass = baseSupported && !speculativeOnly && missingObservationIds.length === 0;
    return {
      ...result,
      missingObservationIds,
      speculativeOnly,
      citationSpans: linked.map((item) => ({ evidenceId: item.evidenceId, sourceSpan: item.sourceSpan, observationDigest: item.digest })),
      status: pass ? result.status : "insufficient_evidence"
    };
  });
  const verification = {
    schema: "rea-claim-verification/v1",
    baseVerificationDigest: base.digest,
    evidenceLedgerDigest: ledger.digest,
    observationDigests: observations.map((item) => item.digest).sort(),
    results,
    passed: results.every((result) => result.status === "supported" || result.status === "supported_with_contradiction")
  };
  return Object.freeze({ ...verification, digest: canonicalDigest(verification) });
}

export function assertReaObservation(value) {
  if (!value || value.schema !== "rea-evidence-observation/v1" || !value.evidence || value.evidence.id !== value.evidenceId || value.evidence.digest !== value.evidenceDigest) {
    throw new ResearchValidationError("rea_observation_invalid");
  }
  const { digest, evidence, ...body } = value;
  if (digest !== canonicalDigest(body)) throw new ResearchValidationError("rea_observation_digest_invalid");
  return value;
}

function normalizeFixture(value, index) {
  object(value, "fixture_search_fixture_invalid");
  const evidence = createEvidenceItem({
    id: value.id ?? `fixture-${index + 1}`,
    queryId: null,
    sourceUrl: value.sourceUrl,
    sourceTitle: value.sourceTitle,
    excerpt: value.excerpt,
    classification: value.classification ?? "independent",
    support: value.support ?? "supports",
    observedAt: value.observedAt ?? null
  });
  const observation = {
    evidence: stripDigest(evidence),
    reaClass: value.reaClass ?? "OBSERVED",
    sourceQuality: value.sourceQuality ?? qualityFromClassification(evidence.classification),
    publishedAt: value.publishedAt ?? null,
    sourceSpan: value.sourceSpan ?? null,
    provenance: value.provenance ?? {}
  };
  return {
    id: evidence.id,
    searchText: `${evidence.sourceTitle} ${evidence.excerpt} ${value.keywords ?? ""}`.toLowerCase(),
    observation
  };
}

function assertSearchAdapter(adapter) {
  if (!adapter || typeof adapter.search !== "function" || !adapter.metadata) throw new ResearchValidationError("search_adapter_invalid");
  const { digest, ...body } = adapter.metadata;
  if (body.schema !== "research-search-adapter/v1" || digest !== canonicalDigest(body)) throw new ResearchValidationError("search_adapter_metadata_invalid");
  return adapter;
}

function dedupeObservations(items) {
  const byContent = new Map();
  for (const item of items) {
    const key = item.evidence.contentDigest;
    if (!byContent.has(key)) byContent.set(key, item);
  }
  return [...byContent.values()];
}

function normalizeSourceSpan(value, excerptLength) {
  if (value === null) return { start: 0, end: excerptLength };
  object(value, "rea_source_span_invalid");
  const start = integer(value.start, "rea_source_span_invalid", 0, excerptLength);
  const end = integer(value.end, "rea_source_span_invalid", start, excerptLength);
  if (end <= start) throw new ResearchValidationError("rea_source_span_invalid");
  return { start, end };
}

function normalizeProvenance(value) {
  object(value, "rea_provenance_invalid");
  return {
    provider: value.provider == null ? null : stringValue(value.provider, "rea_provider_invalid", 200),
    providerRevision: value.providerRevision == null ? null : stringValue(value.providerRevision, "rea_provider_revision_invalid", 200),
    providerDigest: value.providerDigest == null ? null : stringValue(value.providerDigest, "rea_provider_digest_invalid", 200),
    authorizationDigest: value.authorizationDigest == null ? null : stringValue(value.authorizationDigest, "rea_authorization_digest_invalid", 200),
    sourceRevision: value.sourceRevision == null ? null : stringValue(value.sourceRevision, "rea_source_revision_invalid", 500)
  };
}

function qualityFromClassification(classification) {
  if (classification === "primary") return "primary";
  if (classification === "independent") return "high";
  if (classification === "community") return "medium";
  return "unknown";
}

function optionalTimestamp(value, code) {
  if (value === undefined || value === null) return null;
  if (!Number.isFinite(Date.parse(value))) throw new ResearchValidationError(code);
  return value;
}

function tokenize(value) {
  return [...new Set(value.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length >= 2))];
}

function tokenScore(tokens, haystack) {
  if (tokens.length === 0) return 0;
  return tokens.reduce((score, token) => score + (haystack.includes(token) ? 1 : 0), 0);
}

function stripDigest(value) {
  const { digest: _digest, ...rest } = value;
  return rest;
}

function stringValue(value, code, maxLength) {
  if (typeof value !== "string" || !value.trim() || value.length > maxLength) throw new ResearchValidationError(code);
  return value.trim();
}

function integer(value, code, min, max) {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new ResearchValidationError(code);
  return value;
}

function enumValue(value, allowed, code) {
  if (!allowed.includes(value)) throw new ResearchValidationError(code);
  return value;
}

function object(value, code) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ResearchValidationError(code);
}
