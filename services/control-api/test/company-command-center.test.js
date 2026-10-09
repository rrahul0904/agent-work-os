import assert from "node:assert/strict";
import test from "node:test";
import { CompanyCommandCenter, CompanyCommandCenterError } from "../src/company-command-center.js";
import { ProjectDesk, ProjectDeskError } from "../src/project-desk.js";

class MemoryStore {
  constructor() {
    this.workItems = {};
    this.decisions = {};
    this.activity = [];
    this.organization = null;
    this.sessions = [];
    this.machines = [];
  }
  listWorkItems(){ return Object.values(this.workItems); }
  getWorkItem(id){ return this.workItems[id]; }
  async upsertWorkItem(v){ this.workItems[v.id]=structuredClone(v); return v; }
  listDecisions(){ return Object.values(this.decisions); }
  getDecision(id){ return this.decisions[id]; }
  async upsertDecision(v){ this.decisions[v.id]=structuredClone(v); return v; }
  listActivity(){ return [...this.activity]; }
  async addActivity(v){ this.activity.push(structuredClone(v)); return v; }
  getOrganization(){ return this.organization ? structuredClone(this.organization) : null; }
  async upsertOrganization(v){ this.organization=structuredClone(v); return v; }
  listSessions(){ return this.sessions; }
  listMachines(){ return this.machines; }
}

const human = { id: "president", kind: "human" };
const claude = { id: "engineer", kind: "agent", provider: "anthropic" };
function harness() {
  let n = 0;
  const store = new MemoryStore();
  const now = () => `2026-10-08T20:00:${String(n++).padStart(2, "0")}Z`;
  const desk = new ProjectDesk(store, { now, id: () => `id-${n++}` });
  const company = new CompanyCommandCenter(store, desk, { now });
  return { store, desk, company };
}
async function rejectsCode(promise, code, ErrorClass) {
  await assert.rejects(promise, (error) => error instanceof ErrorClass && error.code === code);
}

test("company structure is human-owned and rejects management cycles", async () => {
  const { company } = harness();
  await rejectsCode(company.configureStructure({ name: "Acme", president: { id: "p", name: "P" } }, claude), "human_authority_required", CompanyCommandCenterError);
  await rejectsCode(company.configureStructure({
    name: "Acme", president: { id: "p", name: "P" }, members: [
      { id: "a", role: "Engineer", managerId: "b" },
      { id: "b", role: "Reviewer", managerId: "a" },
    ]
  }, human), "management_cycle", CompanyCommandCenterError);
});

test("golden path preserves ownership, governed decision evidence, one-shot approval, and audit receipt", async () => {
  const { store, desk, company } = harness();
  await company.configureStructure({
    id: "forge", name: "Forge Company", president: { id: "president", name: "Rahul" },
    members: [
      { id: "engineer", name: "Product Engineer", role: "Product Engineer", department: "Engineering", provider: "anthropic", runtimeAgent: "claude" },
      { id: "reviewer", name: "Code Reviewer", role: "Code Reviewer", department: "Engineering", provider: "openai", runtimeAgent: "codex", managerId: "engineer" },
    ],
    securityFloors: ["human_approval_for_high_impact_actions"]
  }, human);
  store.sessions.push({ id:"s1", machineId:"m1", agent:"claude", status:"running", createdAt:"2026-10-08T20:00:00Z", updatedAt:"2026-10-08T20:00:01Z" });
  store.machines.push({ id:"m1", name:"local", status:"online" });

  await desk.createWorkItem({ id:"w1", title:"Release command center", createdBy:human });
  await desk.claimWorkItem("w1", claude);
  await desk.submitCompletionReport("w1", { summary:"Implemented slice", commitSha:"abc123", ciStatus:"passed", testInstructions:"npm test" }, claude);
  const decision = await desk.requestDecision("w1", {
    question:"Approve production release?", kind:"release", reason:"All deterministic gates are green",
    options:[{id:"approve",label:"Release"},{id:"hold",label:"Hold"}], recommendedOptionId:"approve",
    riskLevel:"high", policyRef:"release/v1", budgetImpact:"none", timeImpact:"immediate",
    evidenceRefs:["sha:abc123","ci:passed"]
  }, claude);

  const before = company.getOverview();
  assert.equal(before.metrics.pendingDecisions, 1);
  assert.equal(before.metrics.reviewQueue, 1);
  assert.equal(before.metrics.activeRuns, 1);
  assert.equal(before.members.find((m)=>m.id==="engineer").runState, "running");
  assert.match(decision.proposalDigest, /^[a-f0-9]{64}$/);

  const resolved = await desk.resolveDecision(decision.id, { status:"approved", selectedOptionId:"approve", rationale:"Evidence verified" }, human);
  assert.match(resolved.resolutionDigest, /^[a-f0-9]{64}$/);
  await rejectsCode(desk.resolveDecision(decision.id, { status:"approved", selectedOptionId:"approve" }, human), "decision_already_resolved", ProjectDeskError);
  assert.equal((await desk.completeWorkItem("w1", human)).lane, "done");

  const audit = company.exportAudit();
  assert.equal(audit.schema, "company-audit-export/v1");
  assert.match(audit.digest, /^[a-f0-9]{64}$/);
  assert.equal(audit.decisions[0].policyRef, "release/v1");
  assert.equal(audit.decisions[0].selectedOptionId, "approve");
  assert.ok(audit.activity.some((event) => event.type === "decision.resolved" && event.details.resolutionDigest));
});
