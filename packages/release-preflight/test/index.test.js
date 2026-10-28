import test from "node:test";
import assert from "node:assert/strict";
import { evaluateUnifiedReleasePreflight } from "../src/index.js";

const exact = "f".repeat(40);
const good = () => ({
  hostingTarget: "onprem", productionUrl: "https://private.example.invalid",
  sourceSha: exact, testedSha: exact, deployedSha: exact,
  evidence: {
    exactSha: true, unitTests: true, integrationTests: true, browserUat: true,
    securityReview: true, dependencyAudit: true, fullHistorySecretScan: true,
    gatewayDependencyAudit: true, mcpTenantIsolation: true, runtimeSandbox: true,
    humanApprovalReplay: true, incidentResponse: true, realModelProvider: true,
    globalQuota: true, tenantIsolation: true, authRbac: true,
    credentialVault: true, privacyRights: true, backupRestore: true, rollback: true,
    operatorUat: true, independentReview: true, ownerApproval: true, liveVerification: true
  }
});

test("all missing evidence is NO_GO and never initiates deployment", () => {
  const report = evaluateUnifiedReleasePreflight({});
  assert.equal(report.verdict, "NO_GO");
  assert.equal(report.deploymentPerformed, false);
  assert.equal(report.productionVerifiedByThisCheck, false);
  assert.ok(report.blockers.includes("HOSTING_TARGET_NOT_APPROVED"));
  assert.ok(report.blockers.includes("INDEPENDENT_REVIEW_MISSING"));
});

test("forbids Vercel, Railway and Render even when claimed evidence is complete", () => {
  for (const hostingTarget of ["vercel", "railway", "render", "other"]) {
    const report = evaluateUnifiedReleasePreflight({ ...good(), hostingTarget });
    assert.equal(report.verdict, "NO_GO");
    assert.ok(report.blockers.includes("HOSTING_TARGET_NOT_APPROVED"));
  }
});

test("rejects untested, abbreviated, or wrong production revision", () => {
  for (const variant of [
    { testedSha: "e".repeat(40) }, { sourceSha: "abcdef0" }, { deployedSha: "e".repeat(40) }
  ]) {
    const result = evaluateUnifiedReleasePreflight({ ...good(), ...variant });
    assert.equal(result.verdict, "NO_GO");
    assert.ok(result.blockers.includes("SOURCE_TEST_DEPLOY_SHA_MISMATCH"));
  }
});

test("a green unit suite alone is not a production release", () => {
  const payload = good();
  payload.evidence.realModelProvider = false;
  payload.evidence.globalQuota = false;
  payload.evidence.ownerApproval = false;
  const report = evaluateUnifiedReleasePreflight(payload);
  assert.equal(report.verdict, "NO_GO");
  assert.ok(report.blockers.includes("REAL_PROVIDER_NOT_VERIFIED"));
  assert.ok(report.blockers.includes("GLOBAL_QUOTA_NOT_VERIFIED"));
  assert.ok(report.blockers.includes("OWNER_APPROVAL_MISSING"));
});

test("only eligible candidate requires final external authorization, never claims SHIPPED", () => {
  const payload = good();
  payload.secretApiKey = "sk-should-not-leak";
  payload.evidence.privateConversation = "don't leak";
  const result = evaluateUnifiedReleasePreflight(payload);
  assert.equal(result.verdict, "REQUIRES_FINAL_EXTERNAL_AUTHORIZATION");
  assert.equal(result.readyForOwnerReview, true);
  assert.equal(result.deploymentPerformed, false);
  assert.ok(!JSON.stringify(result).includes("sk-should-not-leak"));
  assert.ok(!JSON.stringify(result).includes("privateConversation"));
});

test("rejects missing HTTPS live URL regardless of purported QA receipts", () => {
  const report = evaluateUnifiedReleasePreflight({ ...good(), productionUrl: "http://example.com" });
  assert.equal(report.verdict, "NO_GO");
  assert.ok(report.blockers.includes("PRODUCTION_TLS_REQUIRED"));
});

test("Agent OS cannot self-certify a gateway with unresolved historical secrets or MCP isolation", () => {
  const manifest = good();
  for(const check of ["fullHistorySecretScan","gatewayDependencyAudit","mcpTenantIsolation","humanApprovalReplay"]){
    const payload = structuredClone(manifest);
    payload.evidence[check]=false;
    const report=evaluateUnifiedReleasePreflight(payload);
    assert.equal(report.verdict,"NO_GO");
    assert.ok(report.blockers.length>0);
  }
});
