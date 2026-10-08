import crypto from "node:crypto";

const ENTRY_KINDS = new Set([
  "observation",
  "decision",
  "attempt",
  "question",
  "approval",
  "verification",
  "handoff",
]);

const PRIVILEGED_POLICY_ACTORS = new Set(["human", "system"]);
const EVIDENCE_STATES = new Set(["verified", "stale", "invalid", "unknown"]);

export class WorkMemoryError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "WorkMemoryError";
    this.code = code;
    this.details = details;
  }
}

export function stableDigest(value) {
  return crypto.createHash("sha256").update(stableStringify(value)).digest("hex");
}

export function createWorkMemoryPage({ workId, title = "", policy = {}, policyVersion = 1 } = {}) {
  assertString(workId, "workId");
  assertPositiveInteger(policyVersion, "policyVersion");
  const normalizedPolicy = normalizePolicy(policy);
  return {
    schema: "work-memory-page/v1",
    workId,
    title,
    revision: 0,
    policyVersion,
    policy: normalizedPolicy,
    policyDigest: stableDigest(normalizedPolicy),
    entries: [],
    idempotency: {},
  };
}

export function updatePolicy(page, { actor, policy, expectedRevision, expectedPolicyVersion } = {}) {
  validatePage(page);
  assertExpectedRevision(page, expectedRevision);
  if (!actor || !PRIVILEGED_POLICY_ACTORS.has(actor.type)) {
    throw new WorkMemoryError("policy_authority_required", "Only human or system actors may update policy");
  }
  if (expectedPolicyVersion !== page.policyVersion) {
    throw new WorkMemoryError("policy_version_conflict", "Policy version is stale", {
      expected: expectedPolicyVersion,
      actual: page.policyVersion,
    });
  }

  const normalizedPolicy = normalizePolicy(policy);
  page.policy = normalizedPolicy;
  page.policyVersion += 1;
  page.policyDigest = stableDigest(normalizedPolicy);
  page.revision += 1;
  return page;
}

export function appendEntry(page, input, { expectedRevision, idempotencyKey } = {}) {
  validatePage(page);
  assertExpectedRevision(page, expectedRevision);
  assertString(idempotencyKey, "idempotencyKey");
  if (!input || typeof input !== "object") throw new WorkMemoryError("invalid_entry", "Entry input is required");

  const requestDigest = stableDigest(canonicalEntryRequest(page.workId, input));
  const replay = page.idempotency[idempotencyKey];
  if (replay) {
    if (replay.requestDigest !== requestDigest) {
      throw new WorkMemoryError("idempotency_conflict", "Idempotency key was already used for a different mutation");
    }
    return { entry: page.entries.find((entry) => entry.id === replay.entryId), replayed: true };
  }

  validateEntryInput(page, input);
  const entry = buildEntry(page.workId, input);
  page.entries.push(entry);
  page.revision += 1;
  page.idempotency[idempotencyKey] = { entryId: entry.id, requestDigest };
  return { entry, replayed: false };
}

export function currentDecisions(page) {
  validatePage(page);
  const decisions = page.entries.filter((entry) => entry.kind === "decision");
  const superseded = new Set(decisions.flatMap((entry) => entry.supersedes ?? []));
  return decisions.filter((entry) => !superseded.has(entry.id));
}

export function buildHandoff(page, {
  destination,
  agentId,
  sessionId,
  maxChars = 6000,
  evidenceState = {},
  generatedAt,
} = {}) {
  validatePage(page);
  assertString(destination, "destination");
  assertString(agentId, "agentId");
  assertString(sessionId, "sessionId");
  assertString(generatedAt, "generatedAt");
  assertPositiveInteger(maxChars, "maxChars");

  const decisions = currentDecisions(page).map((entry) => {
    const states = (entry.evidenceRefs ?? []).map((ref) => evidenceState[ref] ?? "unknown");
    const needsReview = states.some((state) => state !== "verified");
    return {
      id: entry.id,
      statement: entry.statement,
      rationale: entry.rationale,
      evidenceRefs: entry.evidenceRefs ?? [],
      evidenceStates: states,
      needsReview,
      digest: entry.digest,
    };
  });

  for (const state of Object.values(evidenceState)) {
    if (!EVIDENCE_STATES.has(state)) {
      throw new WorkMemoryError("invalid_evidence_state", `Unsupported evidence state: ${state}`);
    }
  }

  const mandatory = decisions.map((decision) => ({ type: "decision", id: decision.id, value: decision }));
  const optional = [
    ...page.entries
      .filter((entry) => entry.kind === "question")
      .map((entry) => ({ type: "question", id: entry.id, value: { id: entry.id, body: entry.body, digest: entry.digest } })),
    ...page.entries
      .filter((entry) => ["verification", "approval", "attempt", "observation"].includes(entry.kind))
      .slice()
      .reverse()
      .map((entry) => ({
        type: entry.kind,
        id: entry.id,
        value: {
          id: entry.id,
          body: entry.body ?? entry.statement ?? "",
          evidenceRefs: entry.evidenceRefs ?? [],
          digest: entry.digest,
        },
      })),
  ];

  const selected = [...mandatory];
  const mandatoryPayload = handoffPayload(page, destination, selected);
  const mandatoryChars = stableStringify(mandatoryPayload).length;
  if (mandatoryChars > maxChars) {
    throw new WorkMemoryError("context_budget_too_small", "Context budget cannot fit current decisions and mandatory handoff metadata", {
      maxChars,
      requiredChars: mandatoryChars,
    });
  }

  for (const candidate of optional) {
    const tentative = selected.concat(candidate);
    const projected = handoffPayload(page, destination, tentative);
    if (stableStringify(projected).length <= maxChars) selected.push(candidate);
  }

  const payload = handoffPayload(page, destination, selected);
  const serialized = stableStringify(payload);
  if (serialized.length > maxChars) {
    throw new WorkMemoryError("context_budget_too_small", "Context budget cannot fit mandatory handoff metadata", {
      maxChars,
      requiredChars: serialized.length,
    });
  }

  const selectedEntryIds = selected.map((item) => item.id);
  const bundleDigest = stableDigest(payload);
  const receipt = {
    schema: "context-receipt/v1",
    workId: page.workId,
    destination,
    agentId,
    sessionId,
    selectedEntryIds,
    sourceDigests: selected.map((item) => page.entries.find((entry) => entry.id === item.id)?.digest).filter(Boolean),
    policyVersion: page.policyVersion,
    policyDigest: page.policyDigest,
    bundleDigest,
    charCount: serialized.length,
    tokenEstimate: Math.ceil(serialized.length / 4),
    generatedAt,
  };
  receipt.digest = stableDigest(receipt);

  return {
    schema: "handoff-bundle/v1",
    payload,
    selectedEntryIds,
    serialized: `<UNTRUSTED_WORK_MEMORY>\n${serialized}\n</UNTRUSTED_WORK_MEMORY>`,
    digest: bundleDigest,
    receipt,
  };
}

export function assertCompletionVerification({ claimantActorId, verifierActorId, evidenceRefs } = {}) {
  assertString(claimantActorId, "claimantActorId");
  assertString(verifierActorId, "verifierActorId");
  if (claimantActorId === verifierActorId) {
    throw new WorkMemoryError("independent_verifier_required", "Completion verification must come from a different actor");
  }
  if (!Array.isArray(evidenceRefs) || evidenceRefs.length === 0) {
    throw new WorkMemoryError("verification_evidence_required", "Completion verification requires evidence references");
  }
  return true;
}

export function validatePage(page) {
  if (!page || page.schema !== "work-memory-page/v1") {
    throw new WorkMemoryError("invalid_page", "Unsupported work memory page schema");
  }
  assertString(page.workId, "workId");
  assertNonNegativeInteger(page.revision, "revision");
  assertPositiveInteger(page.policyVersion, "policyVersion");
  if (page.policyDigest !== stableDigest(normalizePolicy(page.policy))) {
    throw new WorkMemoryError("policy_digest_mismatch", "Policy digest validation failed");
  }
  if (!Array.isArray(page.entries)) throw new WorkMemoryError("invalid_entries", "entries must be an array");

  const ids = new Set();
  for (const entry of page.entries) {
    if (ids.has(entry.id)) throw new WorkMemoryError("duplicate_entry_id", `Duplicate entry id: ${entry.id}`);
    ids.add(entry.id);
    if (entry.workId !== page.workId) throw new WorkMemoryError("cross_work_entry", "Entry workId does not match page workId");
    const { digest, ...unsigned } = entry;
    if (digest !== stableDigest(unsigned)) {
      throw new WorkMemoryError("entry_digest_mismatch", `Entry digest validation failed: ${entry.id}`);
    }
  }

  for (const entry of page.entries.filter((item) => item.kind === "decision")) {
    for (const supersededId of entry.supersedes ?? []) {
      const target = page.entries.find((candidate) => candidate.id === supersededId);
      if (!target || target.kind !== "decision") {
        throw new WorkMemoryError("invalid_supersedes", `Decision ${entry.id} supersedes unknown decision ${supersededId}`);
      }
    }
  }

  for (const [key, record] of Object.entries(page.idempotency ?? {})) {
    assertString(key, "idempotency key");
    if (!page.entries.some((entry) => entry.id === record.entryId)) {
      throw new WorkMemoryError("invalid_idempotency_record", `Idempotency record points to missing entry: ${record.entryId}`);
    }
    assertString(record.requestDigest, "requestDigest");
  }
  return true;
}

function buildEntry(workId, input) {
  const entry = {
    schema: input.kind === "decision" ? "decision-record/v1" : input.kind === "handoff" ? "agent-note/v1" : "work-memory-entry/v1",
    id: input.id,
    workId,
    kind: input.kind,
    actor: structuredClone(input.actor),
    createdAt: input.createdAt,
  };

  for (const field of [
    "body",
    "statement",
    "rationale",
    "alternatives",
    "evidenceRefs",
    "supersedes",
    "sessionId",
    "worktreeId",
    "attemptId",
    "noteKind",
    "nextAction",
  ]) {
    if (input[field] !== undefined) entry[field] = structuredClone(input[field]);
  }
  entry.digest = stableDigest(entry);
  return entry;
}

function validateEntryInput(page, input) {
  if (!input || typeof input !== "object") throw new WorkMemoryError("invalid_entry", "Entry input is required");
  assertString(input.id, "entry.id");
  if (page.entries.some((entry) => entry.id === input.id)) throw new WorkMemoryError("duplicate_entry_id", `Duplicate entry id: ${input.id}`);
  if (!ENTRY_KINDS.has(input.kind)) throw new WorkMemoryError("invalid_entry_kind", `Unsupported entry kind: ${input.kind}`);
  if (!input.actor || !["human", "agent", "system", "verifier"].includes(input.actor.type)) {
    throw new WorkMemoryError("invalid_actor", "Actor type must be human, agent, system, or verifier");
  }
  assertString(input.actor.id, "actor.id");
  assertString(input.createdAt, "createdAt");
  if (input.kind === "decision") {
    assertString(input.statement, "decision.statement");
    assertString(input.rationale, "decision.rationale");
    if (input.supersedes && !Array.isArray(input.supersedes)) throw new WorkMemoryError("invalid_supersedes", "supersedes must be an array");
    for (const supersededId of input.supersedes ?? []) {
      const target = page.entries.find((entry) => entry.id === supersededId);
      if (!target || target.kind !== "decision") {
        throw new WorkMemoryError("invalid_supersedes", `Cannot supersede unknown decision: ${supersededId}`);
      }
    }
  } else if (!input.body && !input.statement) {
    throw new WorkMemoryError("entry_body_required", "Non-decision entries require body or statement text");
  }
  if (input.actor.type === "agent" && input.kind === "approval") {
    throw new WorkMemoryError("agent_authority_violation", "Agent-authored content cannot create authoritative approvals");
  }
  if (input.evidenceRefs && !Array.isArray(input.evidenceRefs)) {
    throw new WorkMemoryError("invalid_evidence_refs", "evidenceRefs must be an array");
  }
}

function canonicalEntryRequest(workId, input) {
  return { workId, ...input };
}

function handoffPayload(page, destination, selected) {
  const latestNextAction = page.entries.slice().reverse().find((entry) => entry.nextAction)?.nextAction ?? null;
  return {
    schema: "handoff-bundle/v1",
    workId: page.workId,
    destination,
    title: page.title,
    nextAction: latestNextAction,
    policy: {
      version: page.policyVersion,
      digest: page.policyDigest,
      constraints: page.policy.constraints ?? [],
    },
    items: selected,
  };
}

function normalizePolicy(policy) {
  if (!policy || typeof policy !== "object" || Array.isArray(policy)) {
    throw new WorkMemoryError("invalid_policy", "policy must be an object");
  }
  return structuredClone(policy);
}

function assertExpectedRevision(page, expectedRevision) {
  if (expectedRevision !== page.revision) {
    throw new WorkMemoryError("revision_conflict", "Work memory revision is stale", {
      expected: expectedRevision,
      actual: page.revision,
    });
  }
}

function assertString(value, name) {
  if (typeof value !== "string" || !value.trim()) {
    throw new WorkMemoryError("invalid_field", `${name} must be a non-empty string`);
  }
}

function assertPositiveInteger(value, name) {
  if (!Number.isInteger(value) || value <= 0) throw new WorkMemoryError("invalid_field", `${name} must be a positive integer`);
}

function assertNonNegativeInteger(value, name) {
  if (!Number.isInteger(value) || value < 0) throw new WorkMemoryError("invalid_field", `${name} must be a non-negative integer`);
}

function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
}
