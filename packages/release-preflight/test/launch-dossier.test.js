import test from "node:test";
import assert from "node:assert/strict";
import { assessLaunchDossier, REQUIRED_RECEIPTS } from "../src/launch-dossier.js";

const SHA="a".repeat(40);
const time="2026-10-28T13:00:00Z";
function good(){
  const evidence={
    exactSha:true,unitTests:true,integrationTests:true,browserUat:true,securityReview:true,
    dependencyAudit:true,fullHistorySecretScan:true,gatewayDependencyAudit:true,
    mcpTenantIsolation:true,runtimeSandbox:true,humanApprovalReplay:true,incidentResponse:true,
    realModelProvider:true,globalQuota:true,tenantIsolation:true,authRbac:true,
    credentialVault:true,privacyRights:true,backupRestore:true,rollback:true,operatorUat:true,
    independentReview:true,ownerApproval:true,liveVerification:true
  };
  return {sourceSha:SHA,testedSha:SHA,deployedSha:SHA,hostingTarget:"aws",
    productionUrl:"https://agent-os.example.org/app",ownerId:"release-owner",
    independentReviewerId:"qa-person",
    evidence,receipts:REQUIRED_RECEIPTS.map((kind)=>({
      kind,status:"PASS",sourceSha:SHA,observedAt:time,
      reviewerId:"qa-person",artifactUrl:"https://github.com/example/evidence/actions/runs/10",
      artifactDigest:"sha256:"+kind
    }))};
}
const now=Date.parse("2026-10-28T15:00:00Z");
test("empty evidence is a NO-GO without printing arbitrary or private fields",()=>{
  const report=assessLaunchDossier({secret:"should-not-print"},{now});
  assert.equal(report.verdict,"NO_GO");
  assert.equal(report.releaseAuthorized,false);
  assert.ok(!JSON.stringify(report).includes("should-not-print"));
  assert.ok(report.blockers.some(x=>x.includes("secret")||x.includes("SHA")||x.includes("RECEIPT")));
});
test("even fully claimed evidence requires outside source verification and owner sign-off",()=>{
  const report=assessLaunchDossier(good(),{now});
  assert.equal(report.verdict,"NEEDS_INDEPENDENT_SOURCE_VERIFICATION");
  assert.equal(report.independentVerificationPerformed,false);
  assert.equal(report.productionDeployedByThisTool,false);
  assert.match(report.dossierDigest,/^[a-f0-9]{64}$/);
});
test("expired, same-owner, missing, duplicated or mismatched receipts fail closed",()=>{
  for(const mutate of [
    p=>p.receipts.pop(),
    p=>p.receipts[0].observedAt="2026-01-01T00:00:00Z",
    p=>p.receipts[1].sourceSha="b".repeat(40),
    p=>p.receipts[2].reviewerId="release-owner",
    p=>p.receipts.push({...p.receipts[0]}),
    p=>{p.ownerId=p.independentReviewerId;},
    p=>{p.evidence.gatewayDependencyAudit=false;},
    p=>{p.productionUrl="https://localhost/admin";},
    p=>{p.hostingTarget="vercel";},
    p=>{p.deployedSha="b".repeat(40);}
  ]){
    const p=good();mutate(p);
    assert.equal(assessLaunchDossier(p,{now}).verdict,"NO_GO");
  }
});
