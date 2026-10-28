import crypto from "node:crypto";
import { evaluateUnifiedReleasePreflight } from "./index.js";

const REQUIRED_RECEIPTS=Object.freeze([
  "sourceRights","unitAndIntegration","tenantAndAuth","browserUat",
  "fullHistorySecrets","gatewayDependencyAudit","realModelProvider",
  "providerPrivacy","quotaReconciliation","sandboxAndPermissions",
  "backupRestore","rollbackDrill","observabilityAndIncident",
  "productionLogin","independentSecurity"
]);
const TARGETS=new Set(["aws","oci","onprem"]);
const fullSha=/^[a-f0-9]{40}$/;
const ISO=/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/;

/**
 * This is an evidence SHAPE auditor, not a trusted external assessor.
 * All supplied manifest facts are UNVERIFIED until an independent human
 * checks source CI/artifacts, deployment, live browser and rollback.
 */
export function assessLaunchDossier(input,{now=Date.now()}={}){
  const m=input&&typeof input==="object"&&!Array.isArray(input)?input:{};
  const blockers=[];
  // Retain every Wave1 security and deployment preflight requirement.
  const preflight=evaluateUnifiedReleasePreflight(m);
  if(!preflight.readyForOwnerReview)blockers.push(...preflight.blockers);
  const sha=typeof m.sourceSha==="string"?m.sourceSha:"";
  if(!fullSha.test(sha)||m.testedSha!==sha||m.deployedSha!==sha)
    blockers.push("SOURCE_TEST_DEPLOY_SHA_MISMATCH");
  if(!TARGETS.has(m.hostingTarget))blockers.push("HOSTING_TARGET_DENIED");
  if(typeof m.productionUrl!=="string"||!/^https:\/\/[^/\s?#]+\//.test(m.productionUrl) ||
     /(?:\.invalid|\.example|\.test|localhost|127\.0\.0\.1)(?:\/|$)/.test(m.productionUrl))
    blockers.push("LIVE_HTTPS_PRODUCTION_URL_UNVERIFIED");
  if(!m.ownerId||!m.independentReviewerId||m.ownerId===m.independentReviewerId)
    blockers.push("INDEPENDENT_REVIEWER_NOT_ESTABLISHED");
  const receiptRows=Array.isArray(m.receipts)?m.receipts:[];
  const found=new Map();
  for(const r of receiptRows){
    if(!r||typeof r.kind!=="string"||found.has(r.kind)){
      blockers.push("RECEIPT_DUPLICATE_OR_INVALID");continue;
    }
    found.set(r.kind,r);
  }
  for(const kind of REQUIRED_RECEIPTS){
    const r=found.get(kind);
    if(!r){blockers.push("RECEIPT_MISSING:"+kind);continue;}
    const timestamp=Date.parse(r.observedAt);
    const fresh=typeof r.observedAt==="string"&&ISO.test(r.observedAt)&&
      Number.isFinite(timestamp)&&timestamp<=now&&now-timestamp<=7*86400_000;
    if(r.status!=="PASS"||r.sourceSha!==sha||!fullSha.test(r.sourceSha||"")||
       !fresh||typeof r.artifactUrl!=="string"||
       !/^https:\/\/(github\.com|api\.github\.com|[^/\s]+)\//.test(r.artifactUrl)||
       typeof r.reviewerId!=="string"||!r.reviewerId||
       r.reviewerId===m.ownerId || r.reviewerId!==m.independentReviewerId)
      blockers.push("RECEIPT_NOT_INDEPENDENT_OR_FRESH:"+kind);
  }
  // A correctly SHAPED dossier still has not been checked against real
  // external systems; this function never authorizes deployments.
  const canonical={version:"launch-dossier/v1",sourceSha:fullSha.test(sha)?sha:null,
    hostingTarget:TARGETS.has(m.hostingTarget)?m.hostingTarget:null,
    productionUrl:typeof m.productionUrl==="string"?m.productionUrl:null,
    receiptIds:REQUIRED_RECEIPTS.map(kind=>({kind,
      digest:typeof found.get(kind)?.artifactDigest==="string"?
        found.get(kind).artifactDigest:null}))};
  const dossierDigest=crypto.createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
  return {version:"launch-assessment/v1",verdict:blockers.length?"NO_GO":"NEEDS_INDEPENDENT_SOURCE_VERIFICATION",
    blockers,sourceSha:canonical.sourceSha,dossierDigest,
    releaseAuthorized:false,productionDeployedByThisTool:false,
    evidenceOnly:true,receiptCount:receiptRows.length,
    independentVerificationPerformed:false};
}
export { REQUIRED_RECEIPTS };
