import crypto from "node:crypto";

export const SHIPPING_CONTRACT_VERSION = "shipping-contract/v1";
export const SHIPPING_BLOCKERS = Object.freeze([
  "BLOCKED_CREDENTIAL",
  "BLOCKED_PERMISSION",
  "BLOCKED_EXTERNAL_SERVICE",
  "BLOCKED_PAYMENT",
  "BLOCKED_IRREVERSIBLE_ACTION",
  "BLOCKED_PRODUCT_DECISION",
  "BLOCKED_SOURCE_UNKNOWN"
]);

const BLOCKERS = new Set(SHIPPING_BLOCKERS);

export function validateShippingContract(input) {
  const errors = [];
  if (!isPlainObject(input)) return { valid: false, errors: ["shipping_contract_invalid"] };
  const allowed = new Set([
    "version", "project", "release", "worktree", "builder", "verification", "preview",
    "production", "exactSha", "goldenPath", "excludedFromRelease", "policy"
  ]);
  for (const key of Object.keys(input)) if (!allowed.has(key)) errors.push(`shipping_contract_unknown_field:${key}`);
  if (input.version !== SHIPPING_CONTRACT_VERSION) errors.push("shipping_contract_version_invalid");

  validateProject(input.project, errors);
  validateRelease(input.release, errors);
  validateWorktree(input.worktree, errors);
  validateBuilder(input.builder, errors);
  validateCommandList(input.verification, "verification", errors, true);
  validateDeployStage(input.preview, "preview", errors);
  validateDeployStage(input.production, "production", errors);
  validateExactSha(input.exactSha, errors);
  validateGoldenPath(input.goldenPath, errors);

  if (input.excludedFromRelease !== undefined && (!Array.isArray(input.excludedFromRelease) || input.excludedFromRelease.some((x) => !nonEmpty(x)))) {
    errors.push("shipping_contract_excluded_invalid");
  }
  if (input.policy !== undefined) validatePolicy(input.policy, errors);

  return { valid: errors.length === 0, errors };
}

export function assertShippingContract(input) {
  const result = validateShippingContract(input);
  if (!result.valid) throw new Error(`shipping_contract_invalid:${result.errors.join(",")}`);
  return structuredClone(input);
}

export function digestShippingContract(input) {
  const contract = assertShippingContract(input);
  return `sha256:${crypto.createHash("sha256").update(JSON.stringify(sortObject(contract))).digest("hex")}`;
}

export function assertKnownBlocker(code) {
  if (!BLOCKERS.has(code)) throw new Error(`shipping_blocker_invalid:${String(code)}`);
  return code;
}

function validateProject(value, errors) {
  if (!isPlainObject(value)) return errors.push("shipping_contract_project_invalid");
  if (!nonEmpty(value.id)) errors.push("shipping_contract_project_id_required");
  if (!nonEmpty(value.repoPath)) errors.push("shipping_contract_repo_path_required");
}
function validateRelease(value, errors) {
  if (!isPlainObject(value)) return errors.push("shipping_contract_release_invalid");
  if (!nonEmpty(value.version)) errors.push("shipping_contract_release_version_required");
}
function validateWorktree(value, errors) {
  if (!isPlainObject(value)) return errors.push("shipping_contract_worktree_invalid");
  if (!nonEmpty(value.baseRef)) errors.push("shipping_contract_worktree_base_ref_required");
  if (value.root !== undefined && !nonEmpty(value.root)) errors.push("shipping_contract_worktree_root_invalid");
  if (value.cleanupOnSuccess !== undefined && typeof value.cleanupOnSuccess !== "boolean") errors.push("shipping_contract_worktree_cleanup_invalid");
}
function validateBuilder(value, errors) {
  if (!isPlainObject(value)) return errors.push("shipping_contract_builder_invalid");
  validateCommand(value.command, "builder.command", errors);
  if (!Number.isInteger(value.maxRepairAttempts) || value.maxRepairAttempts < 0 || value.maxRepairAttempts > 10) {
    errors.push("shipping_contract_repair_attempts_invalid");
  }
  validateCommand(value.repairCommand, "builder.repairCommand", errors, value.maxRepairAttempts === 0);
}
function validateDeployStage(value, label, errors) {
  if (!isPlainObject(value)) return errors.push(`shipping_contract_${label}_invalid`);
  if (typeof value.required !== "boolean") errors.push(`shipping_contract_${label}_required_invalid`);
  if (value.required) {
    validateCommand(value.deployCommand, `${label}.deployCommand`, errors);
    validateCommandList(value.uat, `${label}.uat`, errors, true);
  }
}
function validateExactSha(value, errors) {
  if (!isPlainObject(value)) return errors.push("shipping_contract_exact_sha_invalid");
  if (typeof value.required !== "boolean") errors.push("shipping_contract_exact_sha_required_invalid");
  validateCommand(value.testedShaCommand, "exactSha.testedShaCommand", errors);
  if (value.required) validateCommand(value.deployedShaCommand, "exactSha.deployedShaCommand", errors);
}
function validateGoldenPath(value, errors) {
  if (!Array.isArray(value) || value.length === 0) return errors.push("shipping_contract_golden_path_required");
  const ids = new Set();
  for (const item of value) {
    if (!isPlainObject(item) || !nonEmpty(item.id) || !nonEmpty(item.description)) {
      errors.push("shipping_contract_golden_path_item_invalid");
      continue;
    }
    if (ids.has(item.id)) errors.push(`shipping_contract_golden_path_duplicate:${item.id}`);
    ids.add(item.id);
  }
}
function validatePolicy(value, errors) {
  if (!isPlainObject(value)) return errors.push("shipping_contract_policy_invalid");
  if (value.commandTimeoutMs !== undefined && (!Number.isInteger(value.commandTimeoutMs) || value.commandTimeoutMs < 1000 || value.commandTimeoutMs > 3_600_000)) {
    errors.push("shipping_contract_timeout_invalid");
  }
  if (value.retainFailureLogs !== undefined && typeof value.retainFailureLogs !== "boolean") errors.push("shipping_contract_retain_logs_invalid");
}
function validateCommandList(value, label, errors, required = false) {
  if (!Array.isArray(value) || (required && value.length === 0)) return errors.push(`shipping_contract_${label.replaceAll(".", "_")}_invalid`);
  value.forEach((command, index) => validateCommand(command, `${label}[${index}]`, errors));
}
function validateCommand(value, label, errors, optional = false) {
  if (optional && value === undefined) return;
  if (!isPlainObject(value) || !nonEmpty(value.command) || (value.name !== undefined && !nonEmpty(value.name))) {
    errors.push(`shipping_contract_command_invalid:${label}`);
  }
}
function nonEmpty(value) { return typeof value === "string" && value.trim().length > 0; }
function isPlainObject(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function sortObject(value) {
  if (Array.isArray(value)) return value.map(sortObject);
  if (!isPlainObject(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortObject(value[key])]));
}
