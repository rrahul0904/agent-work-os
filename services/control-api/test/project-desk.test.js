import assert from "node:assert/strict";
import test from "node:test";
import { ProjectDesk, ProjectDeskError } from "../src/project-desk.js";

class MemoryStore {
  constructor() { this.workItems = {}; this.decisions = {}; this.activity = []; }
  listWorkItems(){ return Object.values(this.workItems); } getWorkItem(id){ return this.workItems[id]; }
  async upsertWorkItem(v){ this.workItems[v.id]=structuredClone(v); return v; }
  listDecisions(){ return Object.values(this.decisions); } getDecision(id){ return this.decisions[id]; }
  async upsertDecision(v){ this.decisions[v.id]=structuredClone(v); return v; }
  listActivity(){ return this.activity; } async addActivity(v){ this.activity.push(structuredClone(v)); return v; }
}

const human = { id:"rahul", kind:"human" };
const claude = { id:"claude", kind:"agent", provider:"anthropic" };
const codex = { id:"codex", kind:"agent", provider:"openai" };
function desk(){ let n=0; return new ProjectDesk(new MemoryStore(), { now:()=>`2026-09-25T18:00:0${n}Z`, id:()=>`id-${++n}` }); }
async function rejectsCode(promise, code){ await assert.rejects(promise, (e)=> e instanceof ProjectDeskError && e.code===code); }

test("prevents two agents claiming the same work item", async()=>{
  const d=desk(); const item=await d.createWorkItem({id:"w1",title:"Implement API",createdBy:human});
  await d.claimWorkItem(item.id, claude);
  await rejectsCode(d.claimWorkItem(item.id, codex), "work_item_already_owned");
});

test("agents cannot claim human-only work", async()=>{
  const d=desk(); await d.createWorkItem({id:"w1",title:"Rotate production secret",lane:"human_only",createdBy:human});
  await rejectsCode(d.claimWorkItem("w1", claude), "human_only_work");
});

test("agent completion requires evidence and human finalization", async()=>{
  const d=desk(); await d.createWorkItem({id:"w1",title:"Ship endpoint",createdBy:human}); await d.claimWorkItem("w1", claude);
  await rejectsCode(d.completeWorkItem("w1", human), "completion_report_required");
  const reported=await d.submitCompletionReport("w1",{summary:"Added endpoint",commitSha:"abc1234",ciStatus:"passed",testInstructions:"npm test",prUrl:"https://github.com/acme/repo/pull/1"},claude);
  assert.equal(reported.lane,"review");
  const done=await d.completeWorkItem("w1", human); assert.equal(done.lane,"done");
});

test("decision requests require human resolution before completion", async()=>{
  const d=desk(); await d.createWorkItem({id:"w1",title:"Merge release",createdBy:human}); await d.claimWorkItem("w1", claude);
  await d.submitCompletionReport("w1",{summary:"Prepared release",commitSha:"abc1234",ciStatus:"passed",testInstructions:"npm test"},claude);
  const decision=await d.requestDecision("w1",{question:"Approve merge?",kind:"merge"},claude);
  await rejectsCode(d.completeWorkItem("w1",human),"pending_decision");
  await rejectsCode(d.resolveDecision(decision.id,{status:"approved"},claude),"human_approval_required");
  await d.resolveDecision(decision.id,{status:"approved",comment:"Reviewed"},human);
  assert.equal((await d.completeWorkItem("w1",human)).lane,"done");
  assert.ok(d.listActivity().every((e)=>e.actor?.id));
});
