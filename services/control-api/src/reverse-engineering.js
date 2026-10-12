import crypto from "node:crypto";

export const RE_PROVIDER_VERSION = "reverse-engineering-provider/v1";
export const RE_TOOL_VERSION = "reverse-engineering-tool/v1";
export const RE_REQUEST_VERSION = "reverse-engineering-request/v1";
export const RE_POLICY_VERSION = "reverse-engineering-policy/v1";
export const RE_PLAN_VERSION = "reverse-engineering-plan/v1";
export const RE_GRANT_VERSION = "reverse-engineering-grant/v1";
export const RE_RECEIPT_VERSION = "reverse-engineering-receipt/v1";

export const RE_EFFECT_KEYS = Object.freeze([
  "mutatesTarget", "mutatesSession", "writesFilesystem", "launchesProcess",
  "accessesNetwork", "changesUiState", "mayDiscardData"
]);

const PROVIDER_STATES = new Set(["ready", "unavailable", "degraded", "unknown"]);
const OUTCOMES = new Set(["succeeded", "failed", "cancelled", "interrupted"]);
const CANCELLATION = new Set(["not_requested", "confirmed", "unconfirmed", "race"]);
const CLEANUP = new Set(["complete", "incomplete", "unknown"]);
const COVERAGE = new Set(["complete", "partial", "unknown"]);
const SECRET_KEY = /(^|_|-)(api[_-]?key|token|secret|password|credential|authorization)($|_|-)/i;

export function validateReverseEngineeringProvider(input) {
  const errors = [];
  if (!plain(input)) return fail("reverse_engineering_provider_invalid");
  unknown(input, ["version", "id", "kind", "transport", "productVersion", "revision", "locality", "host", "catalogDigest", "schemaDigest", "effectsDigest", "capabilities", "availability", "configurationRef"], "reverse_engineering_provider_unknown_field", errors);
  if (input.version !== RE_PROVIDER_VERSION) errors.push("reverse_engineering_provider_version_invalid");
  required(input.id, "reverse_engineering_provider_id_required", errors);
  required(input.kind, "reverse_engineering_provider_kind_required", errors);
  required(input.transport, "reverse_engineering_provider_transport_required", errors);
  required(input.productVersion, "reverse_engineering_provider_product_version_required", errors);
  if (input.revision !== undefined && !text(input.revision)) errors.push("reverse_engineering_provider_revision_invalid");
  if (!["local", "remote"].includes(input.locality)) errors.push("reverse_engineering_provider_locality_invalid");
  if (!plain(input.host) || !text(input.host.platform) || !text(input.host.arch)) errors.push("reverse_engineering_provider_host_invalid");
  digestField(input.catalogDigest, "reverse_engineering_provider_catalog_digest_invalid", errors);
  digestField(input.schemaDigest, "reverse_engineering_provider_schema_digest_invalid", errors);
  digestField(input.effectsDigest, "reverse_engineering_provider_effects_digest_invalid", errors);
  stringArray(input.capabilities, "reverse_engineering_provider_capabilities_invalid", errors);
  if (!plain(input.availability) || !PROVIDER_STATES.has(input.availability.state) || !timestamp(input.availability.observedAt)) errors.push("reverse_engineering_provider_availability_invalid");
  if (input.configurationRef !== undefined && !text(input.configurationRef)) errors.push("reverse_engineering_provider_configuration_ref_invalid");
  if (typeof input.configurationRef === "string" && /(?:sk-|bearer\s+|password=|token=|secret=)/i.test(input.configurationRef)) errors.push("reverse_engineering_provider_configuration_secret_forbidden");
  return verdict(errors);
}

export function validateReverseEngineeringTool(input) {
  const errors = [];
  if (!plain(input)) return fail("reverse_engineering_tool_invalid");
  unknown(input, ["version", "providerId", "name", "inputSchemaDigest", "outputSchemaDigest", "effects", "targetClasses", "requiredCapabilities", "evidenceContract", "resourceLimits"], "reverse_engineering_tool_unknown_field", errors);
  if (input.version !== RE_TOOL_VERSION) errors.push("reverse_engineering_tool_version_invalid");
  required(input.providerId, "reverse_engineering_tool_provider_id_required", errors);
  required(input.name, "reverse_engineering_tool_name_required", errors);
  digestField(input.inputSchemaDigest, "reverse_engineering_tool_input_schema_digest_invalid", errors);
  digestField(input.outputSchemaDigest, "reverse_engineering_tool_output_schema_digest_invalid", errors);
  if (!plain(input.effects)) errors.push("reverse_engineering_tool_effects_invalid");
  else {
    for (const key of [...RE_EFFECT_KEYS, "idempotent"]) if (typeof input.effects[key] !== "boolean") errors.push(`reverse_engineering_tool_effect_invalid:${key}`);
    for (const key of Object.keys(input.effects)) if (![...RE_EFFECT_KEYS, "idempotent"].includes(key)) errors.push(`reverse_engineering_tool_effect_unknown:${key}`);
  }
  stringArray(input.targetClasses, "reverse_engineering_tool_target_classes_invalid", errors, true);
  stringArray(input.requiredCapabilities, "reverse_engineering_tool_required_capabilities_invalid", errors);
  required(input.evidenceContract, "reverse_engineering_tool_evidence_contract_required", errors);
  if (input.resourceLimits !== undefined && (!plain(input.resourceLimits) || (input.resourceLimits.timeoutMs !== undefined && !positiveInt(input.resourceLimits.timeoutMs)) || (input.resourceLimits.maxOutputBytes !== undefined && !positiveInt(input.resourceLimits.maxOutputBytes)))) errors.push("reverse_engineering_tool_resource_limits_invalid");
  return verdict(errors);
}

export function validateReverseEngineeringRequest(input) {
  const errors = [];
  if (!plain(input)) return fail("reverse_engineering_request_invalid");
  unknown(input, ["version", "projectId", "workId", "taskId", "runId", "providerId", "toolName", "target", "args", "outputBudget", "purpose", "policyRef"], "reverse_engineering_request_unknown_field", errors);
  if (input.version !== RE_REQUEST_VERSION) errors.push("reverse_engineering_request_version_invalid");
  for (const key of ["projectId", "workId", "taskId", "runId", "providerId", "toolName", "purpose", "policyRef"]) if (!text(input[key])) errors.push(`reverse_engineering_request_${snake(key)}_required`);
  if (!plain(input.target) || !text(input.target.ref) || !text(input.target.class) || !isDigest(input.target.digest)) errors.push("reverse_engineering_request_target_invalid");
  if (!plain(input.args)) errors.push("reverse_engineering_request_args_invalid");
  else {
    if (Buffer.byteLength(JSON.stringify(input.args), "utf8") > 65_536) errors.push("reverse_engineering_request_args_too_large");
    if (containsSecret(input.args)) errors.push("reverse_engineering_request_secret_literal_forbidden");
  }
  if (!plain(input.outputBudget) || !positiveInt(input.outputBudget.maxReturnedBytes) || !positiveInt(input.outputBudget.maxRetainedBytes)) errors.push("reverse_engineering_request_output_budget_invalid");
  return verdict(errors);
}

export function validateReverseEngineeringPolicy(input) {
  const errors = [];
  if (!plain(input)) return fail("reverse_engineering_policy_invalid");
  unknown(input, ["version", "allowedEffects", "maxProviderAgeMs", "allowedTargetPrefixes"], "reverse_engineering_policy_unknown_field", errors);
  if (input.version !== RE_POLICY_VERSION) errors.push("reverse_engineering_policy_version_invalid");
  stringArray(input.allowedEffects, "reverse_engineering_policy_allowed_effects_invalid", errors);
  if (Array.isArray(input.allowedEffects) && input.allowedEffects.some((effect) => !RE_EFFECT_KEYS.includes(effect))) errors.push("reverse_engineering_policy_unknown_effect");
  if (!Number.isInteger(input.maxProviderAgeMs) || input.maxProviderAgeMs < 0 || input.maxProviderAgeMs > 86_400_000) errors.push("reverse_engineering_policy_provider_age_invalid");
  if (input.allowedTargetPrefixes !== undefined) stringArray(input.allowedTargetPrefixes, "reverse_engineering_policy_target_prefixes_invalid", errors, true);
  return verdict(errors);
}

export function digestReverseEngineeringProvider(input) { assertValid(validateReverseEngineeringProvider(input), "reverse_engineering_provider_invalid"); return canonicalDigest(input); }
export function digestReverseEngineeringTool(input) { assertValid(validateReverseEngineeringTool(input), "reverse_engineering_tool_invalid"); return canonicalDigest(input); }
export function digestReverseEngineeringRequest(input) { assertValid(validateReverseEngineeringRequest(input), "reverse_engineering_request_invalid"); return canonicalDigest(input); }

export function planReverseEngineering({ provider, tool, request, policy, asOf }) {
  assertValid(validateReverseEngineeringProvider(provider), "reverse_engineering_provider_invalid");
  assertValid(validateReverseEngineeringTool(tool), "reverse_engineering_tool_invalid");
  assertValid(validateReverseEngineeringRequest(request), "reverse_engineering_request_invalid");
  assertValid(validateReverseEngineeringPolicy(policy), "reverse_engineering_policy_invalid");
  if (!timestamp(asOf)) throw new Error("reverse_engineering_plan_as_of_invalid");

  const reasons = [];
  if (provider.availability.state !== "ready") reasons.push(`provider_not_ready:${provider.availability.state}`);
  const age = Date.parse(asOf) - Date.parse(provider.availability.observedAt);
  if (age < 0) reasons.push("provider_observation_from_future");
  if (age > policy.maxProviderAgeMs) reasons.push("provider_availability_stale");
  if (tool.providerId !== provider.id) reasons.push("tool_provider_mismatch");
  if (request.providerId !== provider.id) reasons.push("request_provider_mismatch");
  if (request.toolName !== tool.name) reasons.push("request_tool_mismatch");
  if (!tool.targetClasses.includes(request.target.class)) reasons.push("target_class_unsupported");
  for (const capability of tool.requiredCapabilities) if (!provider.capabilities.includes(capability)) reasons.push(`provider_capability_missing:${capability}`);
  if (policy.allowedTargetPrefixes && !policy.allowedTargetPrefixes.some((prefix) => request.target.ref.startsWith(prefix))) reasons.push("target_outside_allowed_scope");
  const requiredEffects = RE_EFFECT_KEYS.filter((key) => tool.effects[key]).sort();
  for (const effect of requiredEffects) if (!policy.allowedEffects.includes(effect)) reasons.push(`effect_not_allowed:${effect}`);

  const base = {
    version: RE_PLAN_VERSION,
    status: reasons.length ? "refused" : "ready",
    reasons: [...new Set(reasons)].sort(),
    asOf,
    providerId: provider.id,
    providerDigest: digestReverseEngineeringProvider(provider),
    toolName: tool.name,
    toolDigest: digestReverseEngineeringTool(tool),
    requestDigest: digestReverseEngineeringRequest(request),
    targetDigest: request.target.digest,
    policyDigest: canonicalDigest(policy),
    requiredEffects
  };
  return Object.freeze({ ...base, digest: canonicalDigest(base) });
}

export function createReverseEngineeringGrant({ plan, provider, tool, request, policy, approvedEffects, executionId, expiresAt }) {
  if (!plain(plan) || plan.version !== RE_PLAN_VERSION || plan.status !== "ready" || !isDigest(plan.digest)) throw new Error("reverse_engineering_grant_plan_not_ready");
  if (!policy || canonicalDigest(policy) !== plan.policyDigest) throw new Error("reverse_engineering_grant_policy_required");
  const current = planReverseEngineering({ provider, tool, request, policy, asOf: plan.asOf });
  if (current.digest !== plan.digest) throw new Error("reverse_engineering_grant_plan_drift");
  if (!Array.isArray(approvedEffects) || !sameSet(approvedEffects, plan.requiredEffects)) throw new Error("reverse_engineering_grant_effects_widened_or_missing");
  if (!text(executionId)) throw new Error("reverse_engineering_grant_execution_id_required");
  if (!timestamp(expiresAt) || Date.parse(expiresAt) < Date.parse(plan.asOf)) throw new Error("reverse_engineering_grant_expiry_invalid");
  const base = {
    version: RE_GRANT_VERSION,
    planDigest: plan.digest,
    providerDigest: plan.providerDigest,
    toolDigest: plan.toolDigest,
    requestDigest: plan.requestDigest,
    targetDigest: plan.targetDigest,
    approvedEffects: [...new Set(approvedEffects)].sort(),
    executionId,
    expiresAt
  };
  return Object.freeze({ ...base, digest: canonicalDigest(base) });
}

export function validateGrantBinding({ grant, provider, tool, request, asOf }) {
  const errors = [];
  if (!plain(grant) || grant.version !== RE_GRANT_VERSION || !isDigest(grant.digest)) return fail("reverse_engineering_grant_invalid");
  try {
    const { digest, ...unsigned } = grant;
    if (canonicalDigest(unsigned) !== digest) errors.push("grant_digest_invalid");
    if (digestReverseEngineeringProvider(provider) !== grant.providerDigest) errors.push("provider_drift");
    if (digestReverseEngineeringTool(tool) !== grant.toolDigest) errors.push("tool_drift");
    if (digestReverseEngineeringRequest(request) !== grant.requestDigest) errors.push("request_drift");
    if (request.target.digest !== grant.targetDigest) errors.push("target_drift");
  } catch {
    errors.push("binding_input_invalid");
  }
  if (!timestamp(asOf)) errors.push("binding_as_of_invalid");
  else if (Date.parse(asOf) > Date.parse(grant.expiresAt)) errors.push("grant_expired");
  return verdict(errors);
}

export function createReverseEngineeringReceipt({ grant, provider, tool, request, startedAt, endedAt, outcome, cancellation, cleanup, evidence, coverage, result }) {
  assertValid(validateGrantBinding({ grant, provider, tool, request, asOf: startedAt }), "reverse_engineering_receipt_grant_invalid");
  if (!timestamp(endedAt) || Date.parse(endedAt) < Date.parse(startedAt)) throw new Error("reverse_engineering_receipt_time_invalid");
  if (!OUTCOMES.has(outcome)) throw new Error("reverse_engineering_receipt_outcome_invalid");
  if (!CANCELLATION.has(cancellation)) throw new Error("reverse_engineering_receipt_cancellation_invalid");
  if (!CLEANUP.has(cleanup)) throw new Error("reverse_engineering_receipt_cleanup_invalid");
  if (cancellation === "unconfirmed" && outcome === "succeeded") throw new Error("reverse_engineering_receipt_unconfirmed_cancellation_success_forbidden");
  if (!Array.isArray(evidence) || evidence.length === 0 || evidence.some((item) => !plain(item) || !text(item.id) || !isDigest(item.digest))) throw new Error("reverse_engineering_receipt_evidence_invalid");
  if (!plain(coverage) || !COVERAGE.has(coverage.state) || !Array.isArray(coverage.limitations) || !Array.isArray(coverage.unknowns)) throw new Error("reverse_engineering_receipt_coverage_invalid");
  if (!plain(result) || !Number.isInteger(result.returnedBytes) || result.returnedBytes < 0 || !Number.isInteger(result.retainedBytes) || result.retainedBytes < 0 || typeof result.truncated !== "boolean") throw new Error("reverse_engineering_receipt_result_invalid");
  if (result.truncated && coverage.state === "complete") throw new Error("reverse_engineering_receipt_truncated_complete_forbidden");
  const base = {
    version: RE_RECEIPT_VERSION,
    grantDigest: grant.digest,
    executionId: grant.executionId,
    providerDigest: grant.providerDigest,
    toolDigest: grant.toolDigest,
    requestDigest: grant.requestDigest,
    targetDigest: grant.targetDigest,
    startedAt, endedAt, outcome, cancellation, cleanup,
    evidence: structuredClone(evidence),
    coverage: structuredClone(coverage),
    result: structuredClone(result)
  };
  return Object.freeze({ ...base, digest: canonicalDigest(base) });
}

export function canonicalDigest(value) {
  return `sha256:${crypto.createHash("sha256").update(JSON.stringify(sortObject(value))).digest("hex")}`;
}

function containsSecret(value) {
  if (Array.isArray(value)) return value.some(containsSecret);
  if (!plain(value)) return false;
  return Object.entries(value).some(([key, child]) => (SECRET_KEY.test(key) && child !== null && child !== "") || containsSecret(child));
}
function unknown(input, allowed, code, errors) { const set = new Set(allowed); for (const key of Object.keys(input)) if (!set.has(key)) errors.push(`${code}:${key}`); }
function stringArray(value, code, errors, nonempty = false) { if (!Array.isArray(value) || (nonempty && value.length === 0) || value.some((x) => !text(x)) || new Set(value).size !== value.length) errors.push(code); }
function digestField(value, code, errors) { if (!isDigest(value)) errors.push(code); }
function required(value, code, errors) { if (!text(value)) errors.push(code); }
function assertValid(result, prefix) { if (!result.valid) throw new Error(`${prefix}:${result.errors.join(",")}`); }
function verdict(errors) { return { valid: errors.length === 0, errors }; }
function fail(code) { return { valid: false, errors: [code] }; }
function sameSet(a, b) { const aa = [...new Set(a)].sort(); const bb = [...new Set(b)].sort(); return aa.length === bb.length && aa.every((x, i) => x === bb[i]); }
function isDigest(value) { return typeof value === "string" && /^sha256:[a-f0-9]{64}$/.test(value); }
function positiveInt(value) { return Number.isInteger(value) && value > 0; }
function text(value) { return typeof value === "string" && value.trim().length > 0; }
function plain(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function timestamp(value) { return typeof value === "string" && Number.isFinite(Date.parse(value)); }
function snake(value) { return value.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`); }
function sortObject(value) {
  if (Array.isArray(value)) return value.map(sortObject);
  if (!plain(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortObject(value[key])]));
}
