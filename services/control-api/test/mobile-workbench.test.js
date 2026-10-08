import test from "node:test";
import assert from "node:assert/strict";
import { deviceCapability, preflight, transitionRun, reconcileProcess, previewReceipt, handoffReceipt, safeReceipt } from "../src/mobile-workbench.js";
const device = { platform:"android", architecture:"arm64", memoryMb:2048, storageMb:5000, capabilities:["runtime_ready"] };
test("capability digest is deterministic", () => assert.equal(deviceCapability(device).digest, deviceCapability({...device,capabilities:["runtime_ready","runtime_ready"]}).digest));
test("unsupported devices fail closed", () => assert.equal(preflight({device:{...device,architecture:"x86"},target:{kind:"local_mobile"},budget:{memoryMb:100,storageMb:100}}).allowed,false));
test("insufficient memory and storage refuse execution", () => {
  for (const budget of [{memoryMb:3000,storageMb:1},{memoryMb:1,storageMb:6000}]) assert.equal(preflight({device,target:{kind:"local_mobile"},budget}).allowed,false);
});
test("missing runtime refuses local execution", () => assert.equal(preflight({device:{...device,capabilities:[]},target:{kind:"local_mobile"},budget:{memoryMb:1,storageMb:1}}).reason,"runtime_unavailable"));
test("remote requires known online capable machine", () => {
  const target={kind:"agent_work_os_machine",machineId:"m1"};
  assert.equal(preflight({target,knownMachines:[]}).allowed,false);
  assert.equal(preflight({target,knownMachines:[{id:"m1",online:true,capabilities:["execute"]}]}).allowed,true);
});
test("process death is interrupted, not completed", () => assert.equal(reconcileProcess({id:"r",state:"running"},false).state,"interrupted"));
test("completion requires independent verification", () => {
  assert.throws(()=>transitionRun({state:"running"},"completed"),/verification_required/);
  assert.equal(transitionRun({state:"running"},"completed",{verifier:"independent",passed:true,receiptId:"v1"}).state,"completed");
});
test("invalid transition is refused and duplicate state is idempotent", () => {
  const run={state:"completed",revision:3};
  assert.equal(transitionRun(run,"completed"),run);
  assert.throws(()=>transitionRun(run,"running"),/invalid_transition/);
});
test("preview requires matching identity and health", () => {
  const run={id:"r",workspaceId:"w",sourceDigest:"sha"};
  assert.throws(()=>previewReceipt({run,workspace:{id:"w"},sourceDigest:"sha",port:8080,healthy:false}),/preview_not_healthy/);
  assert.throws(()=>previewReceipt({run,workspace:{id:"other"},sourceDigest:"sha",port:8080,healthy:true,healthReceiptId:"h"}),/preview_identity_mismatch/);
  assert.equal(previewReceipt({run,workspace:{id:"w"},sourceDigest:"sha",port:8080,healthy:true,healthReceiptId:"h"}).ready,true);
});
test("handoff refuses mismatched source and does not claim process migration", () => {
  const workspace={id:"w"},source={workspaceId:"w",sourceDigest:"sha",machineId:"phone"};
  assert.throws(()=>handoffReceipt({workspace,source,destination:{workspaceId:"w",sourceDigest:"wrong",machineId:"mac"}}),/handoff_identity_mismatch/);
  assert.equal(handoffReceipt({workspace,source,destination:{workspaceId:"w",sourceDigest:"sha",machineId:"mac"}}).processMigrated,false);
});
test("receipt rejects secret-like keys", () => {
  assert.throws(()=>safeReceipt({metadata:{apiKey:"abc"}}),/secret_field_refused/);
  assert.deepEqual(safeReceipt({runId:"r"}),{runId:"r"});
});
