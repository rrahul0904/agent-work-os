import crypto from "node:crypto";

export const REVIEW_COUNCIL_VERSION = "review-council/v1";

const PROVIDERS = new Set(["claude", "codex", "gemini"]);
const READ_ONLY_CAPABILITIES = new Set(["transcript:read", "repository:read", "web:read"]);
const CONSULTATION_STATUSES = new Set(["queued", "running", "completed", "failed", "interrupted"]);
const VERIFICATION_STATUSES = new Set(["verified", "rejected", "unresolved"]);
const MAX_PERSONA_TEXT = 20_000;
const MAX_TRANSCRIPT_CHARS = 24_000;
const MAX_LINEAGE_NODES = 64;
const MAX_LINEAGE_DEPTH = 8;
const DEFAULT_PER_OBSERVER_TOKEN_BUDGET = 4_000;
const DEFAULT_CONSULTATION_TOKEN_BUDGET = 12_000;

export function normalizePersona(input = {}) {
  const id = cleanId(input.id || crypto.randomUUID(), "persona_id_invalid");
  const name = cleanText(input.name, 80);
  const focus = cleanText(input.focus, 240);
  const instructions = cleanText(input.instructions, MAX_PERSONA_TEXT);
  if (!name) throw new Error("persona_name_required");
  if (!focus) throw new Error("persona_focus_required");
  if (!instructions) throw new Error("persona_instructions_required");

  const capabilities = uniqueStrings(input.capabilities?.length ? input.capabilities : ["transcript:read"]);
  if (!capabilities.length) throw new Error("persona_capability_required");
  for (const capability of capabilities) {
    if (!READ_ONLY_CAPABILITIES.has(capability)) throw new Error("persona_capability_not_read_only");
  }

  return Object.freeze({
    version: REVIEW_COUNCIL_VERSION,
    id,
    name,
    focus,
    instructions,
    capabilities
  });
}

export function normalizeBinding(input = {}) {
  const id = cleanId(input.id || crypto.randomUUID(), "binding_id_invalid");
  const personaId = cleanId(input.personaId, "binding_persona_required");
  const provider = String(input.provider ?? "").trim().toLowerCase();
  const model = cleanText(input.model, 160);
  if (!PROVIDERS.has(provider)) throw new Error("binding_provider_invalid");
  if (!model) throw new Error("binding_model_required");

  return Object.freeze({
    version: REVIEW_COUNCIL_VERSION,
    id,
    personaId,
    provider,
    model
  });
}

export function normalizeCouncil(input = {}) {
  const id = cleanId(input.id || crypto.randomUUID(), "council_id_invalid");
  const name = cleanText(input.name, 120);
  if (!name) throw new Error("council_name_required");

  const mode = String(input.mode ?? "manual").trim().toLowerCase();
  if (!["manual", "auto"].includes(mode)) throw new Error("council_mode_invalid");
  const autoReviewOptIn = input.autoReviewOptIn === true;
  if (mode === "auto" && !autoReviewOptIn) throw new Error("council_auto_requires_opt_in");

  const alertThreshold = integerInRange(input.alertThreshold ?? 3, 1, 5, "council_alert_threshold_invalid");
  const perObserverTokenBudget = integerInRange(
    input.perObserverTokenBudget ?? DEFAULT_PER_OBSERVER_TOKEN_BUDGET,
    128,
    100_000,
    "council_observer_budget_invalid"
  );
  const consultationTokenBudget = integerInRange(
    input.consultationTokenBudget ?? DEFAULT_CONSULTATION_TOKEN_BUDGET,
    perObserverTokenBudget,
    500_000,
    "council_consultation_budget_invalid"
  );

  const bindingIds = uniqueStrings(input.bindingIds ?? []);
  if (!bindingIds.length) throw new Error("council_binding_required");

  return Object.freeze({
    version: REVIEW_COUNCIL_VERSION,
    id,
    name,
    mode,
    autoReviewOptIn,
    alertThreshold,
    perObserverTokenBudget,
    consultationTokenBudget,
    bindingIds
  });
}

export function normalizeSessionLineage(input = [], { maxNodes = MAX_LINEAGE_NODES, maxDepth = MAX_LINEAGE_DEPTH } = {}) {
  if (!Array.isArray(input) || !input.length) throw new Error("lineage_required");
  if (input.length > maxNodes) throw new Error("lineage_too_large");

  const nodes = new Map();
  for (const raw of input) {
    const sessionId = cleanId(raw.sessionId, "lineage_session_id_required");
    if (nodes.has(sessionId)) throw new Error("lineage_duplicate_session");
    const parentSessionId = raw.parentSessionId == null || raw.parentSessionId === ""
      ? null
      : cleanId(raw.parentSessionId, "lineage_parent_id_invalid");
    const provider = String(raw.provider ?? "").trim().toLowerCase();
    if (!PROVIDERS.has(provider)) throw new Error("lineage_provider_invalid");
    const agent = cleanText(raw.agent, 120);
    if (!agent) throw new Error("lineage_agent_required");
    nodes.set(sessionId, { sessionId, parentSessionId, provider, agent });
  }

  for (const node of nodes.values()) {
    if (node.parentSessionId && !nodes.has(node.parentSessionId)) throw new Error("lineage_parent_missing");
  }

  const normalized = [];
  for (const node of nodes.values()) {
    const visited = new Set();
    let cursor = node;
    let depth = 0;
    while (cursor.parentSessionId) {
      if (visited.has(cursor.sessionId)) throw new Error("lineage_cycle_detected");
      visited.add(cursor.sessionId);
      cursor = nodes.get(cursor.parentSessionId);
      depth += 1;
      if (depth > maxDepth) throw new Error("lineage_depth_exceeded");
    }
    if (visited.has(cursor.sessionId)) throw new Error("lineage_cycle_detected");
    normalized.push(Object.freeze({ ...node, rootSessionId: cursor.sessionId, depth }));
  }

  return normalized.sort((a, b) => a.depth - b.depth || a.sessionId.localeCompare(b.sessionId));
}

export function buildConsultationPlan({
  council,
  bindings,
  personas,
  transcript,
  lineage,
  selectedBindingIds,
  reason = "manual_consult"
}) {
  const normalizedCouncil = normalizeCouncil(council);
  const normalizedBindings = new Map((bindings ?? []).map((binding) => {
    const item = normalizeBinding(binding);
    return [item.id, item];
  }));
  const normalizedPersonas = new Map((personas ?? []).map((persona) => {
    const item = normalizePersona(persona);
    return [item.id, item];
  }));

  const allowedIds = new Set(normalizedCouncil.bindingIds);
  const requestedIds = selectedBindingIds?.length ? uniqueStrings(selectedBindingIds) : normalizedCouncil.bindingIds;
  if (!requestedIds.length) throw new Error("consultation_binding_required");

  const transcriptText = normalizeTranscript(transcript);
  const normalizedLineage = normalizeSessionLineage(lineage);
  const transcriptTokens = estimateTokens(transcriptText);
  const lineageText = normalizedLineage
    .map((node) => `${node.sessionId}|parent=${node.parentSessionId ?? "root"}|depth=${node.depth}|${node.provider}|${node.agent}`)
    .join("\n");
  const lineageTokens = estimateTokens(lineageText);

  const observers = [];
  let estimatedTotalInputTokens = 0;
  for (const bindingId of requestedIds) {
    if (!allowedIds.has(bindingId)) throw new Error("consultation_binding_not_in_council");
    const binding = normalizedBindings.get(bindingId);
    if (!binding) throw new Error("consultation_binding_not_found");
    const persona = normalizedPersonas.get(binding.personaId);
    if (!persona) throw new Error("consultation_persona_not_found");

    const personaTokens = estimateTokens(`${persona.focus}\n${persona.instructions}`);
    const estimatedInputTokens = transcriptTokens + lineageTokens + personaTokens;
    if (estimatedInputTokens > normalizedCouncil.perObserverTokenBudget) {
      throw new Error("consultation_observer_budget_exceeded");
    }
    estimatedTotalInputTokens += estimatedInputTokens;
    observers.push({
      bindingId,
      personaId: persona.id,
      provider: binding.provider,
      model: binding.model,
      estimatedInputTokens
    });
  }

  if (estimatedTotalInputTokens > normalizedCouncil.consultationTokenBudget) {
    throw new Error("consultation_total_budget_exceeded");
  }

  const planBody = {
    version: REVIEW_COUNCIL_VERSION,
    councilId: normalizedCouncil.id,
    mode: normalizedCouncil.mode,
    reason: cleanText(reason, 160) || "manual_consult",
    transcriptDigest: hash(transcriptText),
    lineageDigest: hash(canonicalJson(normalizedLineage)),
    estimatedTotalInputTokens,
    observers
  };

  return Object.freeze({
    ...planBody,
    planDigest: hash(canonicalJson(planBody)),
    transcript: transcriptText,
    lineage: normalizedLineage
  });
}

export function normalizeObservation(input = {}) {
  const consultationId = cleanId(input.consultationId, "observation_consultation_required");
  const observerId = cleanId(input.observerId, "observation_observer_required");
  const sessionId = cleanId(input.sessionId, "observation_session_required");
  const title = cleanText(input.title, 200);
  const claim = cleanText(input.claim, 4_000);
  if (!title) throw new Error("observation_title_required");
  if (!claim) throw new Error("observation_claim_required");

  const severity = integerInRange(input.severity, 1, 5, "observation_severity_invalid");
  const confidence = numberInRange(input.confidence ?? 0.5, 0, 1, "observation_confidence_invalid");
  const sourceAnchors = uniqueStrings(input.sourceAnchors ?? []).slice(0, 64);
  if (!sourceAnchors.length) throw new Error("observation_source_anchor_required");

  const normalizedClaim = normalizeClaim(claim);
  const body = {
    version: REVIEW_COUNCIL_VERSION,
    consultationId,
    observerId,
    sessionId,
    title,
    claim,
    claimKey: hash(normalizedClaim),
    severity,
    confidence,
    sourceAnchors,
    verificationStatus: "unresolved"
  };
  return Object.freeze({ ...body, observationDigest: hash(canonicalJson(body)) });
}

export function projectAlerts(observations = [], { alertThreshold = 3 } = {}) {
  const threshold = integerInRange(alertThreshold, 1, 5, "alert_threshold_invalid");
  const clusters = new Map();

  for (const raw of observations) {
    const observation = raw.observationDigest ? raw : normalizeObservation(raw);
    const existing = clusters.get(observation.claimKey) ?? {
      claimKey: observation.claimKey,
      observations: [],
      observerIds: new Set(),
      maxSeverity: 0,
      maxConfidence: 0
    };
    existing.observations.push(observation);
    existing.observerIds.add(observation.observerId);
    existing.maxSeverity = Math.max(existing.maxSeverity, observation.severity);
    existing.maxConfidence = Math.max(existing.maxConfidence, observation.confidence);
    clusters.set(observation.claimKey, existing);
  }

  return [...clusters.values()]
    .map((cluster) => Object.freeze({
      claimKey: cluster.claimKey,
      observationDigests: cluster.observations.map((item) => item.observationDigest).sort(),
      observerCount: cluster.observerIds.size,
      maxSeverity: cluster.maxSeverity,
      maxConfidence: cluster.maxConfidence,
      alert: cluster.maxSeverity >= threshold,
      requiresIndependentVerification: true,
      verified: false
    }))
    .sort((a, b) => b.maxSeverity - a.maxSeverity || b.observerCount - a.observerCount || a.claimKey.localeCompare(b.claimKey));
}

export function createVerificationReceipt(observation, input = {}) {
  const normalized = observation.observationDigest ? observation : normalizeObservation(observation);
  const verifierId = cleanId(input.verifierId, "verification_verifier_required");
  if (verifierId === normalized.observerId) throw new Error("verification_self_certification_forbidden");
  const status = String(input.status ?? "").trim().toLowerCase();
  if (!VERIFICATION_STATUSES.has(status)) throw new Error("verification_status_invalid");
  const evidenceRefs = uniqueStrings(input.evidenceRefs ?? []).slice(0, 64);
  if (["verified", "rejected"].includes(status) && !evidenceRefs.length) {
    throw new Error("verification_evidence_required");
  }
  const verifiedAt = input.verifiedAt ? new Date(input.verifiedAt).toISOString() : new Date().toISOString();
  const body = {
    version: REVIEW_COUNCIL_VERSION,
    observationDigest: normalized.observationDigest,
    verifierId,
    status,
    evidenceRefs,
    verifiedAt
  };
  return Object.freeze({ ...body, verificationReceiptDigest: hash(canonicalJson(body)) });
}

export function createConsultationReceipt(input = {}) {
  const id = cleanId(input.id || crypto.randomUUID(), "consultation_id_invalid");
  const planDigest = cleanHexDigest(input.planDigest, "consultation_plan_digest_invalid");
  const status = String(input.status ?? "queued").trim().toLowerCase();
  if (!CONSULTATION_STATUSES.has(status)) throw new Error("consultation_status_invalid");
  const createdAt = input.createdAt ? new Date(input.createdAt).toISOString() : new Date().toISOString();
  const updatedAt = input.updatedAt ? new Date(input.updatedAt).toISOString() : createdAt;
  const body = { version: REVIEW_COUNCIL_VERSION, id, planDigest, status, createdAt, updatedAt };
  return Object.freeze({ ...body, receiptDigest: hash(canonicalJson(body)) });
}

export function reconcileConsultationsAfterRestart(receipts = [], now = new Date().toISOString()) {
  const updatedAt = new Date(now).toISOString();
  return receipts.map((receipt) => {
    const normalized = createConsultationReceipt(receipt);
    if (!["queued", "running"].includes(normalized.status)) return normalized;
    return createConsultationReceipt({
      ...normalized,
      status: "interrupted",
      updatedAt
    });
  });
}

export function estimateTokens(text) {
  return Math.max(1, Math.ceil(String(text ?? "").length / 4));
}

function normalizeTranscript(transcript) {
  if (!Array.isArray(transcript) || !transcript.length) throw new Error("consultation_transcript_required");
  const lines = [];
  for (const item of transcript) {
    const id = cleanId(item.id, "transcript_message_id_required");
    const role = cleanText(item.role, 40);
    const text = cleanText(item.text, 8_000);
    if (!role || !text) throw new Error("transcript_message_invalid");
    lines.push(`[${id}] ${role}: ${text}`);
  }
  const joined = lines.join("\n");
  if (joined.length > MAX_TRANSCRIPT_CHARS) throw new Error("consultation_transcript_too_large");
  return joined;
}

function normalizeClaim(value) {
  return cleanText(value, 4_000)
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .trim();
}

function uniqueStrings(values) {
  return [...new Set((values ?? []).map((value) => String(value).trim()).filter(Boolean))];
}

function cleanText(value, max) {
  return String(value ?? "").trim().slice(0, max);
}

function cleanId(value, errorCode) {
  const id = String(value ?? "").trim();
  if (!id || id.length > 200 || /\s/.test(id)) throw new Error(errorCode);
  return id;
}

function cleanHexDigest(value, errorCode) {
  const digest = String(value ?? "").trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(digest)) throw new Error(errorCode);
  return digest;
}

function integerInRange(value, min, max, errorCode) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) throw new Error(errorCode);
  return number;
}

function numberInRange(value, min, max, errorCode) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) throw new Error(errorCode);
  return number;
}

function hash(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
