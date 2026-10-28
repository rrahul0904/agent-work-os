import test from "node:test";
import assert from "node:assert/strict";
import { isModelUseApproved } from "../src/tenant-model-policy.js";
const local={agent:"model-chat",model:"qwen-local",destination:"local_machine",
  region:"local",retention:"zero",allowPrivate:true,status:"approved"};
const cap={name:"model-chat",model:"qwen-local",lane:"local_machine",
  upstreamRegion:"local",upstreamRetention:"zero"};
test("tenant model grants fail closed on missing/revoked/changed model, region and retention",()=>{
  assert.equal(isModelUseApproved(local,cap),true);
  for(const change of [{status:"revoked"},{allowPrivate:false},{model:"unapproved"},{retention:"bounded"},
    {destination:"approved_remote"},{region:"other"}]){
    assert.equal(isModelUseApproved({...local,...change},cap),false);
  }
  assert.equal(isModelUseApproved(null,cap),false);
});
test("a local gateway cannot be confused with its remote model destination",()=>{
  const gateway={name:"token-intelligence",model:"approved-model",lane:"local_machine",
    upstreamDestination:"approved_remote",upstreamRegion:"us-west-2",upstreamRetention:"bounded"};
  const grant={agent:"token-intelligence",model:"approved-model",destination:"approved_remote",
    region:"us-west-2",retention:"bounded",allowPrivate:true,status:"approved"};
  assert.equal(isModelUseApproved(grant,gateway),true);
  assert.equal(isModelUseApproved({...grant,destination:"local_machine"},gateway),false);
  assert.equal(isModelUseApproved(grant,{...gateway,upstreamDestination:"local_machine"}),false);
  assert.equal(isModelUseApproved(grant,{...gateway,upstreamRegion:"unknown"}),false);
});
