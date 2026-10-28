import test from "node:test";
import assert from "node:assert/strict";
import { bootstrapFirstOwner } from "../src/bootstrap-first-owner.js";

function setup(counts={organizations:0,users:0,memberships:0}){
  const events=[];
  const client={
    async query(sql){
      events.push(sql);
      return {rows:sql.includes("AS organizations")?[counts]:[]};
    },
    release(){events.push("release");}
  };
  const registrations=[];
  const identities={
    async register(params, tx){assert.equal(tx,client,"registration must share the advisory-locked transaction");registrations.push(params);return {organization:{id:"org-test"},user:{id:"user-test"},session:{token:"NEVER_PRINT"}};}
  };
  return {events,registrations,pool:{async connect(){return client;}},identities};
}
const details={email:"owner@example.test",password:"private-owner-credential",organizationName:"Initial Org",approval:"YES_CREATE_FIRST_OWNER"};
test("bootstrap is denied before DB use without explicit approval",async()=>{
  const f=setup();
  await assert.rejects(bootstrapFirstOwner({...f, ...details,approval:"not authorized"}),/EXPLICIT_APPROVAL_REQUIRED/);
  assert.equal(f.events.length,0);
});
test("empty DB bootstrap uses exclusive transaction and returns IDs, never secrets",async()=>{
  const f=setup();
  const account=await bootstrapFirstOwner({...f,...details});
  assert.deepEqual(account,{created:true,organizationId:"org-test",userId:"user-test"});
  assert.equal(f.registrations.length,1);
  assert.ok(f.events.some(e=>e.includes("pg_advisory_xact_lock")));
  assert.ok(f.events.includes("COMMIT"));
  assert.ok(f.events.includes("release"));
  assert.ok(!JSON.stringify(account).includes("credential"));
});
test("existing users or memberships permanently block another first-owner bootstrap",async()=>{
  for(const counts of [{organizations:1,users:1,memberships:1},{organizations:0,users:1,memberships:0},{organizations:0,users:0,memberships:1}]){
    const f=setup(counts);
    await assert.rejects(bootstrapFirstOwner({...f,...details}),/NOT_EMPTY/);
    assert.equal(f.registrations.length,0);
    assert.ok(f.events.includes("ROLLBACK"));
    assert.ok(f.events.includes("release"));
  }
});
test("first-owner registration uses the same SQL transaction, never its own pool connection",async()=>{
  const f=setup();
  // Set a sentinel connection for the sole top-level transaction. Any
  // second connection would violate the single-winner/rollback boundary.
  let connects=0;
  const original=f.pool.connect;
  f.pool.connect=async()=>{connects++;return original();};
  // The existing mock assertion verifies the transaction client identity.
  assert.equal((await bootstrapFirstOwner({...f,...details})).created,true);
  assert.equal(connects,1);
});
test("account creation failure rolls back and never leaves an unclosed exclusive lock",async()=>{
  const f=setup();
  f.identities.register=async()=>{throw new Error("simulated insert failure");};
  await assert.rejects(bootstrapFirstOwner({...f,...details}),/simulated insert/);
  assert.ok(f.events.includes("ROLLBACK"));
  assert.ok(f.events.includes("release"));
});
