import test from "node:test";
import assert from "node:assert/strict";
import { isSessionOwnedBy, canReceiveClientEvent } from "../src/session-visibility.js";

const owner={kind:"user",userId:"owner",organizationIds:["org-alpha"]};
const admin={kind:"user",userId:"admin",organizationIds:["org-alpha"]};
const outsider={kind:"user",userId:"owner",organizationIds:["org-beta"]};
const session={id:"agent-1",organizationId:"org-alpha",createdBy:"owner",
  messages:[{role:"user",text:"private-source-code-should-not-leak"}]};

test("private session visibility is creator-only, never automatically organization-wide",()=>{
  assert.equal(isSessionOwnedBy(owner,session),true);
  assert.equal(isSessionOwnedBy(admin,session),false);
  assert.equal(isSessionOwnedBy(owner,{...session,createdBy:undefined}),false);
  assert.equal(isSessionOwnedBy(null,session),false);
});

test("live and replayed agent events exclude unrelated same-tenant admin or viewer",()=>{
  const event={type:"session.updated",session};
  assert.equal(canReceiveClientEvent(owner,event),true);
  assert.equal(canReceiveClientEvent(admin,event),false);
  assert.equal(canReceiveClientEvent(outsider,event),false);
  assert.equal(canReceiveClientEvent({kind:"user",userId:"viewer",organizationIds:["org-alpha"]},event),false);
  assert.equal(canReceiveClientEvent({kind:"legacy"},event),true);
  assert.equal(canReceiveClientEvent({...owner,organizationIds:[]},event),false);
});

test("other shared team metadata remains organization-scoped without leaking session contents",()=>{
  const machine={type:"machine.updated",machine:{id:"machine-1",organizationId:"org-alpha"}};
  assert.equal(canReceiveClientEvent(admin,machine),true);
  assert.equal(canReceiveClientEvent(outsider,machine),false);
  assert.equal(canReceiveClientEvent(owner,{type:"session.updated",session:{...session,createdBy:undefined}}),false);
  assert.equal(canReceiveClientEvent(owner,{type:"session.updated",session:{...session,organizationId:undefined}}),false);
  assert.equal(canReceiveClientEvent(owner,{type:"unknown"}),false);
});
