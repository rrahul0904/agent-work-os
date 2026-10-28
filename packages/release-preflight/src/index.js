/**
 * Wave 5 deterministic release preflight.
 * A passing manifest is a candidate for independent inspection, NEVER
 * authorization to merge, spend money, publish, deploy or call a product SHIPPED.
 */
const ALLOWED_TARGETS = new Set(["aws", "oci", "onprem"]);
const CHECKS = [
  ["exactSha", "EXACT_SHA_NOT_VERIFIED"],
  ["unitTests", "UNIT_TESTS_NOT_VERIFIED"],
  ["integrationTests", "INTEGRATION_TESTS_NOT_VERIFIED"],
  ["browserUat", "BROWSER_UAT_NOT_VERIFIED"],
  ["securityReview", "SECURITY_REVIEW_NOT_VERIFIED"],
  ["dependencyAudit", "DEPENDENCY_AUDIT_NOT_CLEAN"],
  // P0 closure is cross-repository; a clean Agent Work OS test run is not
  // evidence that the Token Intelligence gateway or historical secrets passed.
  ["fullHistorySecretScan", "FULL_HISTORY_SECRET_SCAN_NOT_CLEAN"],
  ["gatewayDependencyAudit", "GATEWAY_DEPENDENCY_AUDIT_NOT_CLEAN"],
  ["mcpTenantIsolation", "MCP_TENANT_ISOLATION_NOT_VERIFIED"],
  ["runtimeSandbox", "RUNTIME_SANDBOX_NOT_VERIFIED"],
  ["humanApprovalReplay", "HUMAN_APPROVAL_REPLAY_NOT_VERIFIED"],
  ["incidentResponse", "INCIDENT_RESPONSE_NOT_VERIFIED"],
  ["realModelProvider", "REAL_PROVIDER_NOT_VERIFIED"],
  ["globalQuota", "GLOBAL_QUOTA_NOT_VERIFIED"],
  ["tenantIsolation", "TENANT_ISOLATION_NOT_VERIFIED"],
  ["authRbac", "AUTH_RBAC_NOT_VERIFIED"],
  ["credentialVault", "CREDENTIAL_VAULT_NOT_VERIFIED"],
  ["privacyRights", "PRIVACY_RIGHTS_NOT_VERIFIED"],
  ["backupRestore", "BACKUP_RESTORE_NOT_VERIFIED"],
  ["rollback", "ROLLBACK_NOT_VERIFIED"],
  ["operatorUat", "OPERATOR_UAT_NOT_VERIFIED"],
  ["independentReview", "INDEPENDENT_REVIEW_MISSING"],
  ["ownerApproval", "OWNER_APPROVAL_MISSING"],
  ["liveVerification", "LIVE_DEPLOYMENT_NOT_VERIFIED"]
];

export function evaluateUnifiedReleasePreflight(manifest) {
  const blocked = [];
  const model = manifest && typeof manifest === "object" && !Array.isArray(manifest) ? manifest : {};
  const allowed = ALLOWED_TARGETS.has(model.hostingTarget);
  if (!allowed) blocked.push("HOSTING_TARGET_NOT_APPROVED");
  // A production candidate must always have pinned full commit identity, not
  // a branch, abbreviated revision, image tag or CI run number.
  const sha = String(model.sourceSha ?? "");
  const tested = String(model.testedSha ?? "");
  const deployed = String(model.deployedSha ?? "");
  if (!/^[a-f0-9]{40}$/.test(sha) || sha !== tested || sha !== deployed) {
    blocked.push("SOURCE_TEST_DEPLOY_SHA_MISMATCH");
  }
  const receipt = model.evidence && typeof model.evidence === "object" ? model.evidence : {};
  for (const [field, code] of CHECKS) {
    if (receipt[field] !== true) blocked.push(code);
  }
  if (model.productionUrl && !String(model.productionUrl).startsWith("https://")) {
    blocked.push("PRODUCTION_TLS_REQUIRED");
  }
  if (!model.productionUrl || typeof model.productionUrl !== "string") {
    blocked.push("VERIFIED_PRODUCTION_URL_REQUIRED");
  }
  // Do not include untrusted manifest fields: credentials, tokens, or customer
  // data must never be emitted in the preflight output.
  return {
    version: "unified-release-preflight/v1",
    verdict: blocked.length === 0 ? "REQUIRES_FINAL_EXTERNAL_AUTHORIZATION" : "NO_GO",
    readyForOwnerReview: blocked.length === 0,
    deploymentPerformed: false,
    productionVerifiedByThisCheck: false,
    hostingTarget: allowed ? model.hostingTarget : "not_approved",
    sourceSha: /^[a-f0-9]{40}$/.test(sha) ? sha : null,
    blockers: blocked
  };
}
