import { createHash } from "node:crypto";

export const EVAL_TERMINAL_STATES = Object.freeze(["PASSED", "FAILED", "UNSURE", "ERROR", "INTERRUPTED", "BLOCKED"]);
export const EVAL_RULE_OPERATORS = Object.freeze(["eq", "neq", "gte", "lte", "contains", "not_contains"]);

export class EvalValidationError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = "EvalValidationError";
    this.code = code;
  }
}

export function canonicalDigest(value) {
  return `sha256:${createHash("sha256").update(JSON.stringify(sortValue(value))).digest("hex")}`;
}

export function createEvalScenario(input) {
  object(input, "eval_scenario_invalid");
  const scenario = {
    schema: "agent-eval-scenario/v1",
    id: text(input.id, "eval_scenario_id_invalid", 200),
    revision: text(input.revision ?? "v1", "eval_scenario_revision_invalid", 200),
    target: normalizeTarget(input.target),
    fixtureRefs: stringArray(input.fixtureRefs ?? [], "eval_fixture_refs_invalid", 100, 500),
    limits: normalizeLimits(input.limits ?? {}),
    allowedEffects: stringArray(input.allowedEffects ?? [], "eval_allowed_effects_invalid", 100, 200),
    forbiddenEffects: stringArray(input.forbiddenEffects ?? [], "eval_forbidden_effects_invalid", 100, 200),
    rules: normalizeRules(input.rules ?? []),
    baselinePolicy: normalizeBaselinePolicy(input.baselinePolicy ?? {})
  };
  return Object.freeze({ ...scenario, digest: canonicalDigest(scenario) });
}

export function evaluateDeterministicScenario({ scenario: scenarioInput, facts, config = {}, secrets = [] }) {
  const scenario = assertEvalScenario(scenarioInput);
  object(facts, "eval_facts_invalid");
  object(config, "eval_config_invalid");
  if (!Array.isArray(secrets) || secrets.some((value) => typeof value !== "string" || value.length === 0)) {
    throw new EvalValidationError("eval_secrets_invalid");
  }

  const redactedFacts = redactValue(facts, secrets);
  const outcomes = scenario.rules.map((rule) => evaluateRule(rule, redactedFacts));
  const passed = outcomes.every((outcome) => outcome.passed);
  const configDigest = canonicalDigest(config);
  const factsDigest = canonicalDigest(redactedFacts);
  const receipt = {
    schema: "agent-eval-receipt/v1",
    scenarioDigest: scenario.digest,
    target: scenario.target,
    configDigest,
    factsDigest,
    deterministicOutcomes: outcomes,
    probabilisticOutcomes: [],
    redaction: {
      secretCount: secrets.length,
      replacement: "[REDACTED]"
    },
    status: passed ? "PASSED" : "FAILED"
  };
  return Object.freeze({ ...receipt, digest: canonicalDigest(receipt) });
}

export function createEvalBaseline(receiptInput) {
  const receipt = assertEvalReceipt(receiptInput);
  const baseline = {
    schema: "agent-eval-baseline/v1",
    scenarioDigest: receipt.scenarioDigest,
    target: receipt.target,
    configDigest: receipt.configDigest,
    receiptDigest: receipt.digest,
    status: receipt.status
  };
  return Object.freeze({ ...baseline, digest: canonicalDigest(baseline) });
}

export function compareEvalBaseline({ baseline: baselineInput, receipt: receiptInput }) {
  const baseline = assertEvalBaseline(baselineInput);
  const receipt = assertEvalReceipt(receiptInput);
  const compatible = baseline.scenarioDigest === receipt.scenarioDigest
    && baseline.target.kind === receipt.target.kind
    && baseline.target.id === receipt.target.id
    && baseline.target.revision === receipt.target.revision
    && baseline.configDigest === receipt.configDigest;
  if (!compatible) {
    return Object.freeze({
      schema: "agent-eval-baseline-comparison/v1",
      compatible: false,
      status: "INCOMPATIBLE",
      baselineDigest: baseline.digest,
      receiptDigest: receipt.digest,
      digest: canonicalDigest({
        schema: "agent-eval-baseline-comparison/v1",
        compatible: false,
        status: "INCOMPATIBLE",
        baselineDigest: baseline.digest,
        receiptDigest: receipt.digest
      })
    });
  }
  const status = baseline.status === receipt.status ? "UNCHANGED" : (receipt.status === "PASSED" ? "IMPROVED" : "REGRESSED");
  const comparison = {
    schema: "agent-eval-baseline-comparison/v1",
    compatible: true,
    status,
    baselineDigest: baseline.digest,
    receiptDigest: receipt.digest
  };
  return Object.freeze({ ...comparison, digest: canonicalDigest(comparison) });
}

export function assertEvalScenario(value) {
  if (!value || value.schema !== "agent-eval-scenario/v1") throw new EvalValidationError("eval_scenario_invalid");
  const { digest, ...body } = value;
  if (digest !== canonicalDigest(body)) throw new EvalValidationError("eval_scenario_digest_invalid");
  return value;
}

export function assertEvalReceipt(value) {
  if (!value || value.schema !== "agent-eval-receipt/v1" || !EVAL_TERMINAL_STATES.includes(value.status)) {
    throw new EvalValidationError("eval_receipt_invalid");
  }
  const { digest, ...body } = value;
  if (digest !== canonicalDigest(body)) throw new EvalValidationError("eval_receipt_digest_invalid");
  return value;
}

export function assertEvalBaseline(value) {
  if (!value || value.schema !== "agent-eval-baseline/v1") throw new EvalValidationError("eval_baseline_invalid");
  const { digest, ...body } = value;
  if (digest !== canonicalDigest(body)) throw new EvalValidationError("eval_baseline_digest_invalid");
  return value;
}

function evaluateRule(rule, facts) {
  const actual = getPath(facts, rule.path);
  let passed = false;
  switch (rule.operator) {
    case "eq": passed = deepEqual(actual, rule.expected); break;
    case "neq": passed = !deepEqual(actual, rule.expected); break;
    case "gte": passed = typeof actual === "number" && typeof rule.expected === "number" && actual >= rule.expected; break;
    case "lte": passed = typeof actual === "number" && typeof rule.expected === "number" && actual <= rule.expected; break;
    case "contains": passed = contains(actual, rule.expected); break;
    case "not_contains": passed = !contains(actual, rule.expected); break;
    default: throw new EvalValidationError("eval_rule_operator_unknown");
  }
  return {
    id: rule.id,
    path: rule.path,
    operator: rule.operator,
    expected: rule.expected,
    actual,
    passed
  };
}

function normalizeTarget(value) {
  object(value, "eval_target_invalid");
  return {
    kind: text(value.kind, "eval_target_kind_invalid", 100),
    id: text(value.id, "eval_target_id_invalid", 200),
    revision: text(value.revision ?? "v1", "eval_target_revision_invalid", 200)
  };
}

function normalizeLimits(value) {
  object(value, "eval_limits_invalid");
  return {
    maxTurns: integer(value.maxTurns ?? 20, "eval_limit_turns_invalid", 1, 1000),
    maxToolCalls: integer(value.maxToolCalls ?? 100, "eval_limit_tool_calls_invalid", 0, 10000),
    timeoutMs: integer(value.timeoutMs ?? 60_000, "eval_limit_timeout_invalid", 1, 86_400_000)
  };
}

function normalizeRules(value) {
  if (!Array.isArray(value) || value.length > 500) throw new EvalValidationError("eval_rules_invalid");
  const ids = new Set();
  return value.map((rule, index) => {
    object(rule, "eval_rule_invalid");
    const id = text(rule.id ?? `rule-${index + 1}`, "eval_rule_id_invalid", 200);
    if (ids.has(id)) throw new EvalValidationError("eval_rule_id_duplicate");
    ids.add(id);
    const path = stringArray(rule.path, "eval_rule_path_invalid", 20, 200);
    if (path.length === 0) throw new EvalValidationError("eval_rule_path_invalid");
    const operator = enumValue(rule.operator, EVAL_RULE_OPERATORS, "eval_rule_operator_invalid");
    if (!("expected" in rule)) throw new EvalValidationError("eval_rule_expected_missing");
    return { id, path, operator, expected: rule.expected };
  });
}

function normalizeBaselinePolicy(value) {
  object(value, "eval_baseline_policy_invalid");
  return {
    requireCompatibleScenario: value.requireCompatibleScenario !== false,
    requireCompatibleTarget: value.requireCompatibleTarget !== false,
    requireCompatibleConfig: value.requireCompatibleConfig !== false
  };
}

function getPath(value, path) {
  let current = value;
  for (const key of path) {
    if (current == null || typeof current !== "object" || !(key in current)) return undefined;
    current = current[key];
  }
  return current;
}

function contains(actual, expected) {
  if (typeof actual === "string") return actual.includes(String(expected));
  if (Array.isArray(actual)) return actual.some((item) => deepEqual(item, expected));
  return false;
}

function deepEqual(a, b) {
  return JSON.stringify(sortValue(a)) === JSON.stringify(sortValue(b));
}

function redactValue(value, secrets) {
  if (typeof value === "string") {
    return secrets.reduce((textValue, secret) => textValue.split(secret).join("[REDACTED]"), value);
  }
  if (Array.isArray(value)) return value.map((item) => redactValue(item, secrets));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redactValue(item, secrets)]));
}

function text(value, code, maxLength) {
  if (typeof value !== "string" || !value.trim() || value.length > maxLength) throw new EvalValidationError(code);
  return value.trim();
}

function stringArray(value, code, maxItems, maxLength) {
  if (!Array.isArray(value) || value.length > maxItems) throw new EvalValidationError(code);
  return value.map((item) => text(item, code, maxLength));
}

function integer(value, code, min, max) {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new EvalValidationError(code);
  return value;
}

function enumValue(value, allowed, code) {
  if (!allowed.includes(value)) throw new EvalValidationError(code);
  return value;
}

function object(value, code) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new EvalValidationError(code);
}

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortValue(value[key])]));
}
