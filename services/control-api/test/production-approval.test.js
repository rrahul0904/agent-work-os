import test from "node:test";
import assert from "node:assert/strict";
import { issueProductionApproval, verifyProductionApproval } from "../src/production-approval.js";

const KEY="cd".repeat(32);
const claims = () => ({
  runId: "ship-abc123", organizationId: "org_00000000-0000-4000-8000-000000000001",
  machineId: "00000000-0000-4000-8000-000000000002",
  requestedBy: "user_00000000-0000-4000-8000-000000000003",
  approvedBy: "user_00000000-0000-4000-8000-000000000004",
  contractDigest: "sha256:"+"a".repeat(64), sourceSha: "b".repeat(40),
  hostingTarget: "onprem", signingKey: KEY, now: 1_790_000_000_000
});

test("signed permit requires second approver, exact claims and a short expiry", () => {
  const p=claims();
  const signed=issueProductionApproval(p);
  const verified=verifyProductionApproval(signed.permit, { ...p, now:p.now+1 });
  assert.equal(verified.runId, p.runId);
  assert.equal(verified.approvedBy, p.approvedBy);
  assert.notEqual(verified.requestedBy, verified.approvedBy);
  for(const change of [
    { runId:"ship-other" }, { organizationId:"org_foreign" },
    { machineId:"different_machine" }, { contractDigest:"sha256:"+"f".repeat(64) },
    { sourceSha:"c".repeat(40) }, { hostingTarget:"aws" },
    { signingKey:"ef".repeat(32) }
  ]) {
    assert.throws(() => verifyProductionApproval(signed.permit, {...p,...change,now:p.now+1}), /production_approval_/);
  }
  assert.throws(() => verifyProductionApproval(signed.permit, {...p,now:p.now+31*60*1000}), /expired/);
  assert.throws(() => verifyProductionApproval(signed.permit, {...p,now:p.now-70*1000}), /expired/);
});

test("reject malformed, tampered, unsigned or self-approved production permits",()=>{
  const p=claims();
  assert.throws(()=>issueProductionApproval({...p,approvedBy:p.requestedBy}),/claims_invalid/);
  assert.throws(()=>issueProductionApproval({...p,signingKey:"invalid"}),/key_required/);
  assert.throws(()=>issueProductionApproval({...p,sourceSha:"HEAD"}),/claims_invalid/);
  assert.throws(()=>issueProductionApproval({...p,hostingTarget:"vercel"}),/claims_invalid/);
  const signed=issueProductionApproval(p).permit;
  const alteredSignature=signed.slice(0,-1)+(signed.at(-1)==="0"?"1":"0");
  assert.notEqual(alteredSignature,signed);
  assert.throws(()=>verifyProductionApproval(alteredSignature,{...p,now:p.now+1}),/signature_invalid/);
  assert.throws(()=>verifyProductionApproval("",{...p,now:p.now+1}),/production_approval_invalid/);
});
