import { createHash } from "node:crypto";

export class ProjectRecipeValidationError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = "ProjectRecipeValidationError";
    this.code = code;
  }
}

export const PROJECT_RECIPE_KINDS = Object.freeze([
  "research-os",
  "knowledge-rag",
  "support-operations",
  "document-intelligence",
  "llm-benchmarking",
  "ai-evaluation",
  "multi-agent-research"
]);

export function createProjectRecipe(input) {
  object(input, "project_recipe_invalid");
  const kind = enumValue(input.kind, PROJECT_RECIPE_KINDS, "project_recipe_kind_invalid");
  const recipe = {
    schema: "ai-project-recipe/v1",
    id: stringValue(input.id ?? kind, "project_recipe_id_invalid", 120),
    kind,
    name: stringValue(input.name, "project_recipe_name_invalid", 200),
    description: stringValue(input.description, "project_recipe_description_invalid", 4000),
    requiredCapabilities: stringArray(input.requiredCapabilities ?? [], "project_recipe_capabilities_invalid", 50),
    defaultSuccessMetrics: normalizeSuccessMetrics(input.defaultSuccessMetrics ?? {}),
    authority: normalizeAuthority(input.authority ?? {}),
    provenance: normalizeProvenance(input.provenance ?? {})
  };
  return freezeWithDigest(recipe);
}

export function createProjectSpec(recipeInput, overrides = {}) {
  const recipe = assertProjectRecipe(recipeInput);
  object(overrides, "project_spec_overrides_invalid");
  const spec = {
    schema: "ai-project-spec/v1",
    recipeDigest: recipe.digest,
    name: stringValue(overrides.name ?? recipe.name, "project_spec_name_invalid", 200),
    providers: stringArray(overrides.providers ?? [], "project_spec_providers_invalid", 50),
    capabilities: stringArray(overrides.capabilities ?? recipe.requiredCapabilities, "project_spec_capabilities_invalid", 100),
    successMetrics: normalizeSuccessMetrics({ ...recipe.defaultSuccessMetrics, ...(overrides.successMetrics ?? {}) }),
    authority: normalizeAuthority({ ...recipe.authority, ...(overrides.authority ?? {}) })
  };
  return freezeWithDigest(spec);
}

export function assertProjectRecipe(value) {
  if (!value || value.schema !== "ai-project-recipe/v1" || value.digest !== digest(stripDigest(value))) {
    throw new ProjectRecipeValidationError("project_recipe_digest_invalid");
  }
  return value;
}

export function defaultResearchOsRecipe() {
  return createProjectRecipe({
    kind: "research-os",
    name: "Research OS",
    description: "Evidence-first deep research with bounded collection, citation verification, contradiction preservation, replay, and proof-bearing receipts.",
    requiredCapabilities: ["research-planning", "search-adapter", "evidence-ledger", "claim-verification", "agent-evaluation"],
    defaultSuccessMetrics: {
      minimumEvidenceItems: 2,
      maximumUnsupportedClaims: 0,
      requireCitationVerification: true,
      requireReplayableReceipt: true
    },
    authority: {
      network: "explicit-adapter-only",
      externalWrites: "forbidden-by-default",
      deployment: "shipping-os-only"
    },
    provenance: {
      sourceIssue: "agent-work-os#211",
      reaRole: "evidence-provider-only"
    }
  });
}

function normalizeSuccessMetrics(value) {
  object(value, "project_success_metrics_invalid");
  return {
    minimumEvidenceItems: integer(value.minimumEvidenceItems ?? 1, "project_metric_evidence_invalid", 0, 100000),
    maximumUnsupportedClaims: integer(value.maximumUnsupportedClaims ?? 0, "project_metric_unsupported_invalid", 0, 100000),
    requireCitationVerification: value.requireCitationVerification !== false,
    requireReplayableReceipt: value.requireReplayableReceipt !== false
  };
}

function normalizeAuthority(value) {
  object(value, "project_authority_invalid");
  return {
    network: enumValue(value.network ?? "explicit-adapter-only", ["forbidden", "explicit-adapter-only"], "project_authority_network_invalid"),
    externalWrites: enumValue(value.externalWrites ?? "forbidden-by-default", ["forbidden", "forbidden-by-default", "approval-gated"], "project_authority_writes_invalid"),
    deployment: enumValue(value.deployment ?? "shipping-os-only", ["forbidden", "shipping-os-only"], "project_authority_deployment_invalid")
  };
}

function normalizeProvenance(value) {
  object(value, "project_provenance_invalid");
  return {
    sourceIssue: value.sourceIssue == null ? null : stringValue(value.sourceIssue, "project_source_issue_invalid", 300),
    reaRole: enumValue(value.reaRole ?? "evidence-provider-only", ["evidence-provider-only"], "project_rea_role_invalid")
  };
}

function digest(value) {
  return `sha256:${createHash("sha256").update(JSON.stringify(sort(value))).digest("hex")}`;
}

function freezeWithDigest(value) {
  return Object.freeze({ ...value, digest: digest(value) });
}

function stripDigest(value) {
  const { digest: _digest, ...rest } = value;
  return rest;
}

function sort(value) {
  if (Array.isArray(value)) return value.map(sort);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sort(value[key])]));
}

function stringArray(value, code, maxItems) {
  if (!Array.isArray(value) || value.length > maxItems) throw new ProjectRecipeValidationError(code);
  return [...new Set(value.map((item) => stringValue(item, code, 300)))];
}

function stringValue(value, code, maxLength) {
  if (typeof value !== "string" || !value.trim() || value.length > maxLength) throw new ProjectRecipeValidationError(code);
  return value.trim();
}

function integer(value, code, min, max) {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new ProjectRecipeValidationError(code);
  return value;
}

function enumValue(value, allowed, code) {
  if (!allowed.includes(value)) throw new ProjectRecipeValidationError(code);
  return value;
}

function object(value, code) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ProjectRecipeValidationError(code);
}
